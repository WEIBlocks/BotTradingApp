import { eq, and } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { paymentMethods, payments } from '../../db/schema/payments.js';
import { NotFoundError, AppError } from '../../lib/errors.js';
import { stripe } from '../../config/stripe.js';
import { isStripeConfigured } from '../../lib/stripe-helpers.js';
import { sendNotification } from '../../lib/notify.js';

export async function getUserPaymentMethods(userId: string) {
  const methods = await db
    .select()
    .from(paymentMethods)
    .where(eq(paymentMethods.userId, userId));

  return methods;
}

export async function addPaymentMethod(
  userId: string,
  data: {
    type: 'card' | 'crypto';
    label?: string;
    last4?: string;
    network?: string;
    cryptoAddress?: string;
  },
) {
  if (isStripeConfigured() && data.type === 'card') {
    // Create a Stripe SetupIntent so the client can collect card details
    const setupIntent = await stripe.setupIntents.create({
      metadata: { userId },
    });

    // Store a placeholder record; the client will confirm and we update via webhook
    const [method] = await db
      .insert(paymentMethods)
      .values({
        userId,
        type: data.type,
        label: data.label ?? null,
        last4: data.last4 ?? null,
        network: data.network ?? null,
        cryptoAddress: data.cryptoAddress ?? null,
      })
      .returning();

    return { ...method, clientSecret: setupIntent.client_secret };
  }

  // Dev mode: store method directly without Stripe
  const [method] = await db
    .insert(paymentMethods)
    .values({
      userId,
      type: data.type,
      label: data.label ?? null,
      last4: data.last4 ?? null,
      network: data.network ?? null,
      cryptoAddress: data.cryptoAddress ?? null,
    })
    .returning();

  return method;
}

export async function deletePaymentMethod(userId: string, methodId: string) {
  const [method] = await db
    .select()
    .from(paymentMethods)
    .where(
      and(
        eq(paymentMethods.id, methodId),
        eq(paymentMethods.userId, userId),
      ),
    )
    .limit(1);

  if (!method) {
    throw new NotFoundError('Payment method');
  }

  // If Stripe is configured and the method has a Stripe PM ID, detach it
  if (isStripeConfigured() && method.stripePmId) {
    try {
      await stripe.paymentMethods.detach(method.stripePmId);
    } catch (err) {
      console.warn('Failed to detach Stripe payment method:', (err as Error).message);
    }
  }

  const [deleted] = await db
    .delete(paymentMethods)
    .where(
      and(
        eq(paymentMethods.id, methodId),
        eq(paymentMethods.userId, userId),
      ),
    )
    .returning();

  return deleted;
}

export async function confirmCheckout(
  userId: string,
  data: {
    type: 'bot_purchase' | 'subscription' | 'deposit' | 'withdrawal';
    itemId?: string;
    amount: string;
    paymentMethodId?: string;
  },
) {
  if (isStripeConfigured() && data.paymentMethodId) {
    // Look up the payment method to get the Stripe PM ID
    const [method] = await db
      .select()
      .from(paymentMethods)
      .where(
        and(
          eq(paymentMethods.id, data.paymentMethodId),
          eq(paymentMethods.userId, userId),
        ),
      )
      .limit(1);

    // Create a PaymentIntent with Stripe
    const amountCents = Math.round(parseFloat(data.amount) * 100);
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: 'usd',
      payment_method: method?.stripePmId ?? undefined,
      confirm: !!method?.stripePmId,
      metadata: {
        userId,
        type: data.type,
        itemId: data.itemId ?? '',
      },
    });

    // Create payment record in pending state (webhook will update to succeeded)
    const [payment] = await db
      .insert(payments)
      .values({
        userId,
        type: data.type,
        amount: data.amount,
        status: paymentIntent.status === 'succeeded' ? 'succeeded' : 'pending',
        stripePaymentId: paymentIntent.id,
        metadata: {
          itemId: data.itemId,
          paymentMethodId: data.paymentMethodId,
        },
      })
      .returning();

    if (paymentIntent.status === 'succeeded') {
      await sendNotification(userId, {
        type: 'system',
        title: 'Payment Successful',
        body: `Your payment of $${data.amount} was processed successfully.`,
      }).catch(() => {});
    }

    return {
      ...payment,
      clientSecret: paymentIntent.client_secret,
      stripeStatus: paymentIntent.status,
    };
  }

  // Dev mode: simulate success immediately
  const [payment] = await db
    .insert(payments)
    .values({
      userId,
      type: data.type,
      amount: data.amount,
      status: 'succeeded',
      metadata: {
        itemId: data.itemId,
        paymentMethodId: data.paymentMethodId,
      },
    })
    .returning();

  await sendNotification(userId, {
    type: 'system',
    title: 'Payment Successful',
    body: `Your payment of $${data.amount} was processed successfully (dev mode).`,
  }).catch(() => {});

  return payment;
}
