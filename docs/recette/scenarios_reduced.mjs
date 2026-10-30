#!/usr/bin/env node
// Matrice des 7 profils en MODE RETOUR ARRIÈRE RÉDUIT (pile locale) : colonnes BRUTES de merchants lues par l'API.
//   RECETTE_PASSWORD=… node docs/recette/scenarios_reduced.mjs --published|--unpublished
// Attendu : jamais de champ administratif dans merchants ; téléphone et lien de paiement lisibles seulement des profils légitimes
// (et du public SI le commerce a été republié, ancien modèle) ; merchant_private fermée pour tous.
import { readFileSync } from 'node:fs';
const W = process.env.HTTP_STACK_DIR ?? '/tmp/zeeroo-http';
const keys = JSON.parse(readFileSync(`${W}/keys.json`, 'utf8'));
const API = 'http://127.0.0.1:54321', PASSWORD = process.env.RECETTE_PASSWORD;
if (!PASSWORD) { console.error('RECETTE_PASSWORD requis'); process.exit(64); }
const published = process.argv.includes('--published');
let ok = 0, fail = 0;
const v = (c, n, d = '') => { c ? ok++ : fail++; console.log(`${c ? 'OK    ' : 'ÉCHEC '} ${n}${d ? ' — ' + d : ''}`); };
const get = async (path, token) => { const r = await fetch(API + path, { headers: { apikey: keys.anon, Authorization: `Bearer ${token ?? keys.anon}` } }); let j = null; try { j = await r.json(); } catch { /* */ } return { status: r.status, json: j }; };
const login = async (email) => (await (await fetch(`${API}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: keys.anon, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: PASSWORD }) })).json()).access_token;
const P = { anon: null, client2: 'client2@zeroo.test', commercant2: 'commercant2@zeroo.test', client: 'client@zeroo.test', livreur: 'livreur@zeroo.test', commercant: 'commercant@zeroo.test', admin: 'admin@zeroo.test' };
const T = {}; for (const [k, e] of Object.entries(P)) T[k] = e ? await login(e) : null;
const ADMIN_COLS = ['legal_name', 'siret', 'vat_number', 'contact_email'];
// Qui voit la fiche « Chez Samir » ? (profils légitimes toujours ; le public seulement si republié)
const SEES_SAMIR = { anon: published, client2: published, commercant2: published, client: true, livreur: true, commercant: true, admin: true };
for (const p of Object.keys(P)) {
  const r = await get('/rest/v1/merchants?select=*&slug=eq.chez-samir', T[p]);
  const rows = Array.isArray(r.json) ? r.json : [];
  v(rows.length === (SEES_SAMIR[p] ? 1 : 0), `${p} : fiche « Chez Samir » ${SEES_SAMIR[p] ? 'visible' : 'invisible'}`, `${rows.length} ligne(s)`);
  if (rows[0]) {
    v(ADMIN_COLS.every((c) => rows[0][c] == null), `${p} : AUCUN champ administratif lisible (raison sociale, SIRET, TVA, e-mail)`);
    const legit = p !== 'anon' && p !== 'client2' && p !== 'commercant2';
    const hasOps = rows[0].phone != null && rows[0].payment_link != null;
    v(legit || published ? hasOps : !hasOps, `${p} : téléphone et lien de paiement ${legit || published ? 'lisibles (nécessaires à l\'ancienne application)' : 'masqués'}`);
  }
  const all = await get('/rest/v1/merchants?select=legal_name,siret,vat_number,contact_email&limit=500', T[p]);
  v(Array.isArray(all.json) && all.json.every((m) => ADMIN_COLS.every((c) => m[c] == null)), `${p} : colonnes administratives brutes vides sur toutes les lignes visibles`);
  for (const t of ['merchant_private']) { const x = await get(`/rest/v1/${t}?select=*&limit=1`, T[p]); v([401, 403, 404].includes(x.status), `${p} : ${t} fermée`, `HTTP ${x.status}`); }
  const comp = await get('/rest/v1/merchants?select=siret:merchant_siret,vat:merchant_vat_number,mail:merchant_contact_email,name:merchant_legal_name&slug=eq.chez-samir', T[p]);
  const c0 = Array.isArray(comp.json) ? comp.json[0] : null;
  const privileged = p === 'commercant' || p === 'admin';
  if (c0) v(privileged ? c0.siret != null : Object.values(c0).every((x) => x == null), `${p} : colonnes calculées administratives ${privileged ? 'lisibles (propriétaire / administrateur)' : 'masquées'}`);
}
console.log(`# Bilan matrice réduite (${published ? 'republié' : 'dépublié'}) : ${ok} OK, ${fail} échec(s)`);
process.exit(fail ? 1 : 0);
