#!/usr/bin/env bash
# Installe les outils du test Stripe réel (mode test) dans le Codespace : client PostgreSQL, Stripe CLI, Deno, dépendances npm.
set -euo pipefail
sudo apt-get update -qq && sudo apt-get install -y -qq postgresql-client curl gnupg
curl -fsSL https://packages.stripe.dev/api/security/keypair/stripe-cli-gpg/public | gpg --dearmor | sudo tee /usr/share/keyrings/stripe.gpg >/dev/null
echo "deb [signed-by=/usr/share/keyrings/stripe.gpg] https://packages.stripe.dev/stripe-cli-debian-local stable main" | sudo tee /etc/apt/sources.list.d/stripe.list >/dev/null
sudo apt-get update -qq && sudo apt-get install -y -qq stripe
sudo npm install -g deno >/dev/null
npm ci --ignore-scripts --no-audit --no-fund
echo "Prêt. Voir docs/recette/STRIPE-TEST-DEPUIS-ANDROID.md"
