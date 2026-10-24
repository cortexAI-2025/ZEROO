#!/usr/bin/env node
/**
 * ZEEROO hosted staging smoke tests.
 * No Docker, Mailpit, direct SQL or Stripe Connect required.
 * Run: E2E_SUPABASE_URL=... E2E_SUPABASE_ANON_KEY=... node e2e/hosted-recette.mjs
 * Optional authenticated checks: E2E_CLIENT_EMAIL / E2E_CLIENT_PASSWORD,
 * E2E_MERCHANT_EMAIL / E2E_MERCHANT_PASSWORD,
 * E2E_COURIER_EMAIL / E2E_COURIER_PASSWORD.
 * Never point these tests at the production project.
 */
import assert from 'node:assert/strict';
const url = process.env.E2E_SUPABASE_URL;
const key = process.env.E2E_SUPABASE_ANON_KEY;
const expectedRef = process.env.E2E_EXPECTED_PROJECT_REF ?? 'drebeoivuytxbvmppprz';
assert.ok(url && key, 'E2E_SUPABASE_URL and E2E_SUPABASE_ANON_KEY are required');
const origin = new URL(url).origin;
assert.equal(new URL(origin).hostname, expectedRef + '.supabase.co', 'Refusing non-staging Supabase project');
async function request(path, opts={}) {
  const response = await fetch(origin + path, {
    ...opts,
    headers: { apikey:key, Authorization:'Bearer '+(opts.token??key),
      ...(opts.body ? {'Content-Type':'application/json'} : {}), ...opts.headers },
    body:opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const raw = await response.text();
  let body; try {body=JSON.parse(raw)} catch {body=raw}
  return {status:response.status, body};
}
const health = await request('/auth/v1/health');
assert.equal(health.status,200,'Supabase Auth health');
console.log('PASS Supabase Auth health');
const merchants = await request('/rest/v1/merchants?select=id,slug,name&limit=10');
assert.equal(merchants.status,200,'Public merchant catalog: '+JSON.stringify(merchants.body));
console.log('PASS public merchants catalog ('+merchants.body.length+')');
const protectedOrders = await request('/rest/v1/orders?select=id&limit=1');
assert.ok([401,403].includes(protectedOrders.status),'Anonymous orders should be denied: '+protectedOrders.status);
console.log('PASS anonymous orders denied');
const roles = ['CLIENT','MERCHANT','COURIER'];
for (const role of roles) {
  const email = process.env['E2E_'+role+'_EMAIL'];
  const password = process.env['E2E_'+role+'_PASSWORD'];
  if (!email || !password) {console.log('SKIP '+role+' authentication (credentials absent)');continue}
  const login = await request('/auth/v1/token?grant_type=password',{method:'POST',body:{email,password}});
  assert.equal(login.status,200,role+' login failed: '+JSON.stringify(login.body));
  assert.ok(login.body.access_token,role+' access token');
  const user = await request('/auth/v1/user',{token:login.body.access_token});
  assert.equal(user.status,200,role+' session validation');
  assert.equal(user.body.email,email);
  console.log('PASS '+role+' login and session');
}
console.log('Hosted smoke checks completed. Order/delivery/Stripe flows are NOT covered by this smoke test.');
