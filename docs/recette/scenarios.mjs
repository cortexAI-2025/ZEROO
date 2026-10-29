#!/usr/bin/env node
// Matrice de scénarios HTTP réels par persona (PR #60), contre le projet Supabase de RECETTE.
//   SUPABASE_URL=https://<ref>.supabase.co ANON_KEY=<clé publishable> node docs/recette/scenarios.mjs [--write] [fichier-de-preuve]
// Prérequis : supabase/seed.sql + docs/recette/merchants_recette_extra.sql + migrations appliquées.
// Sans --write : lecture seule. Avec --write : bascule l'autorisation du numéro public de « Chez Samir »
// (données fictives de recette) pour prouver l'apparition et la disparition, puis la remet à « non autorisé ».
// Les mots de passe et jetons ne sont jamais affichés ni écrits (masquage systématique).
// Sortie : 0 conforme · 1 échec de sécurité/fonctionnel · 2 erreur technique.
import { writeFileSync, appendFileSync } from 'node:fs';

const URL_ = process.env.SUPABASE_URL, ANON = process.env.ANON_KEY;
if (!URL_ || !ANON) { console.error('SUPABASE_URL et ANON_KEY requis'); process.exit(64); }
const args = process.argv.slice(2);
const WRITE = args.includes('--write');
const proof = args.find((a) => !a.startsWith('--'));
const PASSWORD = process.env.RECETTE_PASSWORD; // mot de passe des comptes fictifs du seed (supabase/seed.sql)
if (!PASSWORD) { console.error('RECETTE_PASSWORD requis'); process.exit(64); }
const mask = (s) => String(s).replace(/eyJ[A-Za-z0-9_-]{8,}(\.[A-Za-z0-9_-]+){0,2}/g, '[JETON-MASQUÉ]').replaceAll(ANON, '[CLÉ-MASQUÉE]').replaceAll(PASSWORD, '[MDP-MASQUÉ]');
if (proof) writeFileSync(proof, '', { mode: 0o600 });
const out = (line) => { const l = mask(line); console.log(l); if (proof) appendFileSync(proof, l + '\n'); };

let ok = 0, fail = 0, tech = 0;
const verdict = (kind, name, detail = '') => {
  if (kind === 'ok') ok++; else if (kind === 'echec') fail++; else tech++;
  out(`${{ ok: 'OK              ', echec: 'ÉCHEC           ', tech: 'ERREUR-TECHNIQUE' }[kind]} ${name}${detail ? ' — ' + detail : ''}`);
};

async function http(method, path, token, body, extra = {}) {
  try {
    const r = await fetch(URL_ + path, { method, headers: { apikey: ANON, Authorization: `Bearer ${token ?? ANON}`, 'Content-Type': 'application/json', ...extra }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20000) });
    const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* corps non JSON */ }
    return { status: r.status, json };
  } catch (e) { return { status: 0, json: null, error: String(e.message ?? e) }; }
}
const technical = (r) => r.status === 0 || r.status >= 500 || r.status === 429;

async function login(email) {
  const r = await fetch(`${URL_}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: PASSWORD }) }).catch(() => null);
  const j = r ? await r.json().catch(() => ({})) : {};
  return j.access_token ?? null;
}

const FIELDS = 'legal_name:merchant_legal_name,siret:merchant_siret,vat_number:merchant_vat_number,contact_email:merchant_contact_email,phone:merchant_phone,payment_link:merchant_payment_link,public_phone:merchant_public_phone';
const TRUTH = { legal_name: 'Samir Food Recette SAS', siret: '73282932000074', vat_number: 'FR32732829320', contact_email: 'contact-recette@example.test', phone: '0102030405', payment_link: 'https://pay.example.test/recette-samir', public_phone: '0144556677' };
const ALL = Object.keys(TRUTH);
// Champs que chaque persona doit lire pour « Chez Samir » (numéro public non autorisé au départ).
const VISIBLE = {
  anon: [], client2: [], commercant2: [],
  client: ['phone', 'payment_link'], livreur: ['phone', 'payment_link'],
  commercant: ALL, admin: ALL,
};
const PERSONAS = { anon: null, client2: 'client2@zeroo.test', commercant2: 'commercant2@zeroo.test', client: 'client@zeroo.test', livreur: 'livreur@zeroo.test', commercant: 'commercant@zeroo.test', admin: 'admin@zeroo.test' };

const tokens = {};
for (const [p, email] of Object.entries(PERSONAS)) {
  if (!email) { tokens[p] = ANON; continue; }
  tokens[p] = await login(email);
  if (!tokens[p]) verdict('tech', `connexion ${p}`, 'échec de connexion (compte absent ? seed non chargé ?)');
}
if (tech) { out(`# Bilan : ${ok} OK, ${fail} échec(s), ${tech} erreur(s) technique(s)`); process.exit(2); }

out(`# Scénarios PR #60 — ${new Date().toISOString()} — ${URL_}${WRITE ? ' — avec écritures de recette' : ''}`);

async function readSamir(p) {
  const r = await http('GET', `/rest/v1/merchants?select=id,slug,${FIELDS}&slug=eq.chez-samir`, tokens[p]);
  return r;
}
function checkFields(p, row, expectedVisible, label) {
  for (const f of ALL) {
    const want = expectedVisible.includes(f) ? TRUTH[f] : null;
    const got = row?.[f] ?? null;
    if (got === want) verdict('ok', `${label} ${p} : ${f}`, want ? 'visible' : 'null');
    else verdict('echec', `${label} ${p} : ${f}`, `attendu ${want ? 'valeur' : 'null'}, obtenu ${got ? 'valeur' : 'null'}`);
  }
}

// 1. Matrice « Chez Samir » (publié) : lecture autorisée ET lectures interdites.
for (const p of Object.keys(PERSONAS)) {
  const r = await readSamir(p);
  if (technical(r) || r.status !== 200 || !Array.isArray(r.json)) { verdict('tech', `lecture Chez Samir (${p})`, `HTTP ${r.status}`); continue; }
  if (r.json.length !== 1) { verdict('echec', `lecture Chez Samir (${p})`, `${r.json.length} ligne(s), 1 attendue (la fiche publiée doit rester lisible)`); continue; }
  checkFields(p, r.json[0], VISIBLE[p], 'matrice');
}

// 2. Colonnes brutes : toujours null pour tout le monde (aucune donnée dans merchants).
for (const p of Object.keys(PERSONAS)) {
  const r = await http('GET', '/rest/v1/merchants?select=id,legal_name,siret,vat_number,contact_email,phone,payment_link,public_phone&limit=200', tokens[p]);
  if (technical(r) || r.status !== 200) { verdict('tech', `colonnes brutes (${p})`, `HTTP ${r.status}`); continue; }
  const leaked = r.json.filter((m) => ['legal_name', 'siret', 'vat_number', 'contact_email', 'phone', 'payment_link', 'public_phone'].some((c) => m[c] != null));
  leaked.length === 0 ? verdict('ok', `colonnes brutes ${p}`, `${r.json.length} ligne(s), aucune valeur`) : verdict('echec', `colonnes brutes ${p}`, `${leaked.length} ligne(s) avec valeur sensible`);
}

// 3. Commerce NON publié : invisible de tous sauf son propriétaire (merchants) et de tous dans public_merchants.
for (const p of Object.keys(PERSONAS)) {
  const r = await http('GET', '/rest/v1/merchants?select=id,slug&slug=eq.recette-non-publie', tokens[p]);
  const v = await http('GET', '/rest/v1/public_merchants?select=id,slug&slug=eq.recette-non-publie', tokens[p]);
  if (technical(r) || technical(v)) { verdict('tech', `commerce non publié (${p})`, `HTTP ${r.status}/${v.status}`); continue; }
  const sees = (r.json?.length ?? 0) > 0, wantSees = p === 'commercant2' || p === 'admin';
  sees === wantSees ? verdict('ok', `non publié / merchants ${p}`, sees ? 'visible (propriétaire/admin)' : 'invisible') : verdict('echec', `non publié / merchants ${p}`, sees ? 'visible à tort' : 'invisible à tort');
  (v.json?.length ?? 0) === 0 ? verdict('ok', `non publié / public_merchants ${p}`, 'absent') : verdict('echec', `non publié / public_merchants ${p}`, 'présent à tort');
}

// 4. Projection publique : lecture autorisée qui FONCTIONNE (security_invoker) + champs exacts.
const PUBLIC_KEYS = 'about,accent_color,address_line,category,city,delivery_enabled,description,has_minisite,id,logo_url,name,offers_pickup,photo_url,postal_code,public_phone,slug,tagline';
for (const p of ['anon', 'client2', 'client', 'commercant', 'admin']) {
  const r = await http('GET', '/rest/v1/public_merchants?select=*&slug=eq.chez-samir', tokens[p]);
  if (technical(r) || r.status !== 200) { verdict('tech', `public_merchants (${p})`, `HTTP ${r.status}${r.json?.message ? ' ' + r.json.message : ''}`); continue; }
  if (r.json.length !== 1) { verdict('echec', `public_merchants lisible (${p})`, `${r.json.length} ligne(s), 1 attendue : la lecture autorisée ne fonctionne pas`); continue; }
  const keys = Object.keys(r.json[0]).sort().join(',');
  keys === PUBLIC_KEYS ? verdict('ok', `public_merchants ${p}`, 'ligne lisible, colonnes exactes') : verdict('echec', `public_merchants ${p}`, `colonnes inattendues : ${keys}`);
  if (!r.json[0].name || !r.json[0].city) verdict('echec', `public_merchants ${p} : contenu`, 'nom ou ville vide');
}

// 5. Tables fermées.
for (const p of Object.keys(PERSONAS)) {
  for (const t of ['merchant_private', 'directory_businesses', 'directory_claims']) {
    const r = await http('GET', `/rest/v1/${t}?select=*&limit=1`, tokens[p]);
    if (technical(r)) { verdict('tech', `${t} (${p})`, `HTTP ${r.status}`); continue; }
    [401, 403, 404].includes(r.status) ? verdict('ok', `${t} fermée pour ${p}`, `HTTP ${r.status}`) : verdict('echec', `${t} pour ${p}`, `HTTP ${r.status} (accès refusé attendu)`);
  }
}
{ const r = await http('GET', '/rest/v1/rpc/admin_directory_claims', tokens.admin); // fonction admin : doit fonctionner pour l'admin
  const r2 = await http('POST', '/rest/v1/rpc/admin_directory_claims', tokens.admin, {});
  const bad = await http('POST', '/rest/v1/rpc/admin_directory_claims', tokens.client, {});
  void r;
  technical(r2) || technical(bad) ? verdict('tech', 'admin_directory_claims', `HTTP ${r2.status}/${bad.status}`) : r2.status === 200 && bad.status !== 200 ? verdict('ok', 'admin_directory_claims', 'admin OK, client refusé') : verdict('echec', 'admin_directory_claims', `admin HTTP ${r2.status}, client HTTP ${bad.status}`); }

// 6. (--write) autorisation du numéro public : apparition puis disparition.
if (WRITE) {
  const id = (await readSamir('commercant')).json?.[0]?.id;
  const set = (v) => http('PATCH', `/rest/v1/merchants?id=eq.${id}`, tokens.commercant, { public_phone_authorized: v }, { Prefer: 'return=minimal' });
  const anonPhone = async () => (await http('GET', '/rest/v1/public_merchants?select=public_phone&slug=eq.chez-samir', tokens.anon)).json?.[0]?.public_phone ?? null;
  const w1 = await set(true);
  if (![200, 204].includes(w1.status)) verdict('tech', 'autorisation du numéro public', `PATCH HTTP ${w1.status}`);
  else {
    (await anonPhone()) === TRUTH.public_phone ? verdict('ok', 'numéro public autorisé : visible de l\'anonyme') : verdict('echec', 'numéro public autorisé : invisible pour l\'anonyme');
    const priv = (await readSamir('anon')).json?.[0]?.phone ?? null;
    priv === null ? verdict('ok', 'numéro public autorisé : téléphone privé toujours masqué') : verdict('echec', 'téléphone privé exposé après autorisation');
    await set(false);
    (await anonPhone()) === null ? verdict('ok', 'autorisation retirée : numéro disparu pour l\'anonyme') : verdict('echec', 'autorisation retirée : numéro encore visible');
  }
  // Écriture croisée : un autre restaurateur ne modifie pas Chez Samir.
  const x = await http('PATCH', `/rest/v1/merchants?id=eq.${id}`, tokens.commercant2, { siret: '12345678200010' }, { Prefer: 'return=representation' });
  (x.status === 200 && Array.isArray(x.json) && x.json.length === 0) || [401, 403].includes(x.status) ? verdict('ok', 'écriture croisée refusée (0 ligne)') : verdict('echec', 'écriture croisée', `HTTP ${x.status}, ${JSON.stringify(x.json)?.length ?? 0} octets`);
  const still = (await readSamir('commercant')).json?.[0]?.siret;
  still === TRUTH.siret ? verdict('ok', 'SIRET de Chez Samir inchangé') : verdict('echec', 'SIRET de Chez Samir modifié');
} else out('(lecture seule : relancer avec --write pour prouver apparition/disparition du numéro public)');

out(`# Bilan : ${ok} OK, ${fail} échec(s), ${tech} erreur(s) technique(s)`);
process.exit(tech ? 2 : fail ? 1 : 0);
