import { env } from '../config/env.js';

/**
 * Returns true if Stripe keys are real (not placeholder).
 * When false, services should simulate success (dev mode).
 */
export function isStripeConfigured(): boolean {
  return (
    env.STRIPE_SECRET_KEY !== 'sk_test_placeholder' &&
    env.STRIPE_SECRET_KEY.startsWith('sk_')
  );
}
