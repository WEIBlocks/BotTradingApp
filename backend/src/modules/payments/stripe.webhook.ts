import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq } from 'drizzle-orm';
import Stripe from 'stripe';
import { stripe } from '../../config/stripe.js';
import { env } from '../../config/env.js';
import { db } from '../../config/database.js';
import { payments } from '../../db/schema/payments.js';
import { userSubscriptions } from '../../db/schema/subscriptions.js';
import { sendNotification } from '../../lib/notify.js';

export async function stripeWebhookRoute(app: FastifyInstance) {
  app.post(
    '/webhooks/stripe',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const sig = request.headers['stripe-signature'] as string;
      if (!sig) {
        return reply.status(400).send({ error: 'Missing stripe-signature header' });
      }

      let event: Stripe.Event;
      try {
        // Use rawBody for signature verification
        const rawBody = (request as any).rawBody ?? request.body;
        event = stripe.webhooks.constructEvent(
          rawBody as string | Buffer,
          sig,
          env.STRIPE_WEBHOOK_SECRET,
        );
      } catch (err) {
        console.error('Stripe webhook signature verification failed:', (err as Error).message);
        return reply.status(400).send({ error: 'Invalid signature' });
      }

      try {
        switch (event.type) {
          case 'invoice.paid':
            await handleInvoicePaid(event.data.object as Stripe.Invoice);
            break;

          case 'invoice.payment_failed':
            await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
            break;

          case 'customer.subscription.deleted':
            await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
            break;

          case 'payment_intent.succeeded':
            await handlePaymentIntentSucceeded(event.data.object as Stripe.PaymentIntent);
            break;

          default:
            console.log(`Unhandled Stripe event type: ${event.type}`);
        }
      } catch (err) {
        console.error(`Error handling Stripe event ${event.type}:`, (err as Error).message);
        // Still return 200 to Stripe to prevent retries for handler errors
      }

      return reply.status(200).send({ received: true });
    },
  );
}

async function handleInvoicePaid(invoice: Stripe.Invoice) {
  const stripeSubId = typeof invoice.subscription === 'string'
    ? invoice.subscription
    : invoice.subscription?.id;

  if (!stripeSubId) return;

  const [sub] = await db
    .update(userSubscriptions)
    .set({
      status: 'active',
      updatedAt: new Date(),
    })
    .where(eq(userSubscriptions.stripeSubId, stripeSubId))
    .returning();

  if (sub) {
    await sendNotification(sub.userId, {
      type: 'system',
      title: 'Subscription Renewed',
      body: 'Your subscription has been successfully renewed.',
    }).catch(() => {});
  }
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  const stripeSubId = typeof invoice.subscription === 'string'
    ? invoice.subscription
    : invoice.subscription?.id;

  if (!stripeSubId) return;

  const [sub] = await db
    .update(userSubscriptions)
    .set({
      status: 'past_due',
      updatedAt: new Date(),
    })
    .where(eq(userSubscriptions.stripeSubId, stripeSubId))
    .returning();

  if (sub) {
    await sendNotification(sub.userId, {
      type: 'alert',
      title: 'Payment Failed',
      body: 'Your subscription payment failed. Please update your payment method.',
      priority: 'high',
    }).catch(() => {});
  }
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const [sub] = await db
    .update(userSubscriptions)
    .set({
      status: 'cancelled',
      updatedAt: new Date(),
    })
    .where(eq(userSubscriptions.stripeSubId, subscription.id))
    .returning();

  if (sub) {
    await sendNotification(sub.userId, {
      type: 'system',
      title: 'Subscription Cancelled',
      body: 'Your subscription has been cancelled.',
    }).catch(() => {});
  }
}

async function handlePaymentIntentSucceeded(paymentIntent: Stripe.PaymentIntent) {
  const [payment] = await db
    .update(payments)
    .set({ status: 'succeeded' })
    .where(eq(payments.stripePaymentId, paymentIntent.id))
    .returning();

  if (payment) {
    await sendNotification(payment.userId, {
      type: 'system',
      title: 'Payment Successful',
      body: `Your payment of $${(paymentIntent.amount / 100).toFixed(2)} was processed successfully.`,
    }).catch(() => {});
  }
}
