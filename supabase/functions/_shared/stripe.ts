import Stripe from 'npm:stripe@19.1.0';

import { requireEnv } from './http.ts';

export { Stripe };

/**
 * Client Stripe. STRIPE_API_BASE (facultatif) redirige vers stripe-mock pour les
 * tests locaux, ex. http://localhost:12111.
 */
export function stripeClient(): Stripe {
  const base = Deno.env.get('STRIPE_API_BASE');
  const url = base ? new URL(base) : null;
  return new Stripe(requireEnv('STRIPE_SECRET_KEY'), {
    httpClient: Stripe.createFetchHttpClient(),
    ...(url
      ? {
          host: url.hostname,
          port: Number(url.port),
          protocol: url.protocol.replace(':', '') as 'http' | 'https',
        }
      : {}),
  });
}

/** Montant minimum accepté par Stripe pour un paiement en euros. */
export const MIN_CHARGE_CENTS = 50;

/** URL publique de l'app web (retours de Stripe Checkout et de l'inscription Connect). */
export const appWebUrl = () =>
  (Deno.env.get('APP_WEB_URL') ?? 'https://zeeroo.fr').replace(/\/$/, '');
