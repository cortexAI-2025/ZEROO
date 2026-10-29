const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');

const source = readFileSync(`${__dirname}/app.js`, 'utf8').replace(/^import .*;\n/, '');
async function openAdmin({ user = null, member = false, membershipError = null } = {}) {
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, {
      hidden: true, dataset: {}, textContent: '',
      replaceChildren() {}, append() {}, setAttribute() {},
    });
    return elements.get(id);
  };
  let membershipChecks = 0;
  const client = {
    auth: {
      getUser: async () => ({ data: { user } }),
      onAuthStateChange() {},
      // A password-only admin session must never enroll or challenge MFA.
      mfa: new Proxy({}, { get() { throw new Error('Unexpected MFA call'); } }),
    },
    from(table) {
      assert.equal(table, 'platform_admins');
      membershipChecks++;
      return { select() { return this; }, eq(column, value) {
        assert.equal(column, 'user_id'); assert.equal(value, user.id); return this;
      }, async maybeSingle() { return { data: member ? { user_id: user.id } : null, error: membershipError }; } };
    },
  };
  const context = vm.createContext({
    ZEEROO_ADMIN_CONFIG: { supabasePublishableKey: 'test-public-key' },
    createClient: () => client,
    document: { getElementById: element, querySelectorAll: () => [],
      documentElement: { dataset: {} }, createElement: () => element(Symbol()) },
    localStorage: { getItem: () => null },
    matchMedia: () => ({ matches: false, addEventListener() {} }), queueMicrotask,
  });
  vm.runInContext(source, context);
  await new Promise(resolve => setImmediate(resolve));
  return { elements, membershipChecks };
}

test('anonymous visitor must log in', async () => {
  const { elements, membershipChecks } = await openAdmin();
  assert.equal(elements.get('login').hidden, false);
  assert.equal(elements.get('dashboard').hidden, true);
  assert.equal(membershipChecks, 0);
});
test('password-authenticated administrator opens dashboard without MFA', async () => {
  const { elements } = await openAdmin({ user: { id: 'admin', email: 'admin@example.test' }, member: true });
  assert.equal(elements.get('dashboard').hidden, false);
  assert.equal(elements.get('identity').textContent, 'admin@example.test');
  assert.equal(elements.get('denied').hidden, true);
});
test('authenticated non-administrator is denied', async () => {
  const { elements } = await openAdmin({ user: { id: 'non-admin' } });
  assert.equal(elements.get('denied').hidden, false);
  assert.equal(elements.get('dashboard').hidden, true);
});
test('membership lookup failure denies access', async () => {
  const { elements } = await openAdmin({ user: { id: 'admin' }, member: true, membershipError: { message: 'Unavailable' } });
  assert.equal(elements.get('denied').hidden, false);
  assert.equal(elements.get('dashboard').hidden, true);
});
