import { eq, and } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { paymentMethods, payments } from '../../db/schema/payments.js';
import { NotFoundError } from '../../lib/errors.js';
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
  // All payments now go through Google Play IAP on the mobile side.
  // This endpoint records the payment in the database.
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
        source: 'direct',
      },
    })
    .returning();

  await sendNotification(userId, {
    type: 'system',
    title: 'Payment Successful',
    body: `Your payment of $${data.amount} was processed successfully.`,
  }).catch(() => {});

  return payment;
}
