#!/usr/bin/env bash
# Installe le backend ZeeRoo sur le projet Supabase hébergé, avec le CLI officiel.
# Prérequis (une fois, dans VOTRE terminal) : `npx supabase login` (connexion interactive dans le navigateur).
# Ce script ne lit, n'affiche ni ne stocke aucun secret. Il ne fait AUCUN reset et AUCUNE suppression.
#   scripts/deploy-production.sh            # migrations + fonctions
#   scripts/deploy-production.sh --dry-run  # montre ce qui serait appliqué, sans rien changer
set -euo pipefail
cd "$(dirname "$0")/.."
REF="rgxesocsvhgsqoehxhgt"
DRY="${1:-}"

echo "1/4 Lien avec le projet $REF"
npx supabase link --project-ref "$REF"

echo "2/4 Migrations (seules les migrations absentes de l'historique distant sont appliquées)"
if [ "$DRY" = "--dry-run" ]; then npx supabase db push --dry-run; else npx supabase db push; fi

echo "3/4 Secrets des fonctions : noms déjà définis (valeurs jamais affichées)"
npx supabase secrets list --project-ref "$REF" | awk 'NR>2 {print $1}' | sort > /tmp/secrets-present.txt || true
for name in APP_WEB_URL CRON_SECRET STRIPE_SECRET_KEY STRIPE_WEBHOOK_SECRET STRIPE_PRICE_START_MONTH \
  STRIPE_PRICE_START_YEAR STRIPE_PRICE_PRO_MONTH STRIPE_PRICE_PRO_YEAR STRIPE_PRICE_COURIER_START_MONTH \
  STRIPE_PRICE_COURIER_START_YEAR STRIPE_PRICE_COURIER_PRO_MONTH STRIPE_PRICE_COURIER_PRO_YEAR STRIPE_TAX_RATE_ID; do
  grep -qx "$name" /tmp/secrets-present.txt && echo "  présent  $name" || echo "  MANQUANT $name"
done
echo "  (définir un secret manquant : npx supabase secrets set NOM=valeur --project-ref $REF)"

echo "4/4 Fonctions (toutes, depuis la même version ; verify_jwt suit supabase/config.toml)"
if [ "$DRY" = "--dry-run" ]; then echo "  dry-run : non déployées"; else
  npx supabase functions deploy --project-ref "$REF" --use-api
fi
echo "Terminé. Vérifiez ensuite avec scripts/verify-production.sql (SQL Editor, lecture seule)."
