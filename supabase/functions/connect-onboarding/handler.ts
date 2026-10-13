import { handle, json, readJson } from '../_shared/http.ts';
import { appWebUrl, stripeClient } from '../_shared/stripe.ts';
import { adminClient, requireProfessional, requireUser, unwrap } from '../_shared/supabase.ts';

/**
 * Inscription d'un restaurant ou d'un livreur (role « courier ») à Stripe Connect.
 *   action « link »    : crée son compte Stripe si besoin et renvoie le lien d'inscription ;
 *   action « refresh » : relit l'état du compte (utile au retour de l'inscription).
 *
 * Compte dont Stripe gère la tarification : le restaurant ou le livreur paie les frais
 * Stripe de ses ventes, dispose de son propre tableau de bord, et la plateforme ne paie
 * aucun frais Connect. Stripe vérifie l'identité et l'immatriculation (SIRET).
 */
export const handler = handle(async (req) => {
  const user = await requireUser(req);
  const { action, role } = await readJson<{
    action: 'link' | 'refresh';
    role?: 'merchant' | 'courier';
  }>(req);
  const db = adminClient();
  const pro = await requireProfessional(db, user.id, role);
  const stripe = stripeClient();

  let account = unwrap(
    await db.from(pro.accountTable).select('*').eq(pro.key, pro.id).maybeSingle(),
  ) as { stripe_account_id: string } | null;

  if (action === 'refresh') {
    if (!account) return json({ connected: false });
    const remote = await stripe.accounts.retrieve(account.stripe_account_id);
    const status = {
      charges_enabled: remote.charges_enabled,
      payouts_enabled: remote.payouts_enabled,
      details_submitted: remote.details_submitted,
    };
    unwrap(await db.from(pro.accountTable).update(status).eq(pro.key, pro.id));
    return json({ connected: true, ...status });
  }

  if (!account) {
    const created = await stripe.accounts.create(
      {
        country: 'FR',
        email: user.email,
        business_profile:
          pro.role === 'merchant'
            ? {
                name: pro.name,
                mcc: '5814', // restauration rapide
                url: `${appWebUrl()}/m/${pro.slug}`,
              }
            : {
                name: pro.name,
                mcc: '4215', // services de coursier
                product_description: 'Livraison de repas à domicile, en indépendant.',
              },
        controller: {
          fees: { payer: 'account' },
          losses: { payments: 'stripe' },
          stripe_dashboard: { type: 'full' },
        },
        metadata: { [pro.key]: pro.id },
      },
      { idempotencyKey: `account-${pro.id}` },
    );
    unwrap(
      await db.from(pro.accountTable).insert({ [pro.key]: pro.id, stripe_account_id: created.id }),
    );
    account = { stripe_account_id: created.id };
  }

  const link = await stripe.accountLinks.create({
    account: account.stripe_account_id,
    type: 'account_onboarding',
    refresh_url: `${appWebUrl()}${pro.appPath}?refresh=1`,
    return_url: `${appWebUrl()}${pro.appPath}?done=1`,
  });
  return json({ url: link.url });
});
