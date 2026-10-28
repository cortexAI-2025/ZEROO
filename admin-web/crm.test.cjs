const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');
function setup(actionData = {}, errorAction = null) {
  const dom = new JSDOM('<main id="root"></main>', {
    url: 'https://admin.example.test',
    runScripts: 'outside-only',
  });
  const w = dom.window;
  w.crypto.randomUUID = require('node:crypto').randomUUID;
  w.eval(fs.readFileSync(`${__dirname}/crm.js`, 'utf8'));
  const calls = [];
  const client = {
    rpc: async (name, args) => {
      if (name === 'admin_profile_identity') return { data: actionData.profile_identity || {} };
      assert.equal(name, 'admin_console');
      calls.push(args);
      return args.p_action === errorAction
        ? { error: { message: 'Refus serveur' } }
        : { data: actionData[args.p_action] || { ok: true, id: 'record' } };
    },
  };
  return {
    w,
    client,
    calls,
    root: w.document.getElementById('root'),
    crm: w.ZEEROO_CRM,
    close: () => w.close(),
  };
}
async function submit(s, values) {
  const f = s.root.querySelector('form');
  for (const [k, v] of Object.entries(values)) f.elements.namedItem(k).value = v;
  f.dispatchEvent(new s.w.Event('submit', { bubbles: true, cancelable: true }));
  await new Promise((r) => setImmediate(r));
  return f;
}
test('contact preparation records a draft and provides a mailto link without sending', async () => {
  const s = setup();
  try {
    s.crm.contactForm(s.root, s.client, 'contact@example.test');
    await submit(s, {
      subject: 'Test & suivi',
      body: '<script>texte</script>',
      reason: 'Demande support',
    });
    assert.equal(s.calls[0].p_action, 'contact_create');
    assert.ok(s.calls[0].p_request);
    const link = s.root.querySelector('a');
    assert.ok(link.href.startsWith('mailto:'));
    assert.match(link.href, /%3Cscript%3E/);
    assert.match(s.root.textContent, /Aucun e-mail envoyé automatiquement/);
    assert.equal(s.root.querySelector('script'), null);
  } finally {
    s.close();
  }
});
test('failed mutation keeps an explicit error instead of a success claim', async () => {
  const s = setup({}, 'contact_create');
  try {
    s.crm.contactForm(s.root, s.client);
    await submit(s, {
      email: 'client@example.test',
      subject: 'Objet',
      body: 'Message',
      reason: 'Support',
    });
    assert.match(s.root.textContent, /Action impossible : Refus serveur/);
    assert.equal(s.root.querySelector('a'), null);
    assert.equal(s.root.querySelector('button[type="submit"]').disabled, false);
  } finally {
    s.close();
  }
});
test('customer dossier lists real records and opens customer data on demand', async () => {
  const s = setup({
    clients: {
      total: 1,
      rows: [
        {
          id: 'client1',
          display_name: 'Client test',
          email: 'client@example.test',
          phone: '0600000000',
          admin_status: 'active',
          orders_count: 2,
          last_city: 'Trappes',
        },
      ],
    },
    client_detail: {
      id: 'client1',
      display_name: 'Client test',
      email: 'client@example.test',
      phone: '0600000000',
      admin_status: 'active',
      orders: [],
      loyalty: [],
    },
  });
  try {
    await s.crm.render({ content: s.root, tab: 'clients', client: s.client, fresh: () => true });
    [...s.root.querySelectorAll('button')].find((b) => b.textContent === 'Dossier client').click();
    await new Promise((r) => setImmediate(r));
    assert.equal(s.calls.at(-1).p_id, 'client1');
    assert.match(s.root.textContent, /Historique des commandes/);
    assert.match(s.root.textContent, /Suspendre les nouvelles commandes/);
  } finally {
    s.close();
  }
});
test('review moderation requires a reason and sends hidden state', async () => {
  const s = setup({
    reviews: {
      total: 1,
      rows: [
        { order_id: 'order1', merchant: 'Resto', comment: 'Avis à examiner', is_hidden: false },
      ],
    },
  });
  try {
    await s.crm.render({ content: s.root, tab: 'reviews', client: s.client, fresh: () => true });
    [...s.root.querySelectorAll('button')].find((b) => b.textContent === 'Masquer').click();
    const f = s.root.querySelector('form');
    assert.equal(f.elements.reason.required, true);
    await submit(s, { reason: 'Données personnelles dans cet avis' });
    const call = s.calls.find((c) => c.p_action === 'review_visibility');
    assert.equal(call.p_id, 'order1');
    assert.equal(call.p_data.hidden, true);
  } finally {
    s.close();
  }
});
test('archiving keeps explicit reversible wording and server-side action', async () => {
  const s = setup({ entity_state: { admin_status: 'active' } });
  try {
    await s.crm.actions(
      s.root,
      'merchant',
      'merchant1',
      { entity: { name: 'Resto' }, account: { email: 'owner@example.test' } },
      s.client,
      () => true,
    );
    const f = [...s.root.querySelectorAll('form')].find((f) => f.elements.status);
    f.elements.status.value = 'archived';
    f.elements.reason.value = 'Fermeture du commerce';
    f.dispatchEvent(new s.w.Event('submit', { cancelable: true }));
    await new Promise((r) => setImmediate(r));
    const call = s.calls.find((c) => c.p_action === 'set_status');
    assert.equal(call.p_data.status, 'archived');
    assert.match(s.root.textContent, /historique est conservé/);
  } finally {
    s.close();
  }
});
test('geo offers expose merchant map coordinates and city filter', async () => {
  const s = setup({
    offers: {
      total: 1,
      rows: [
        {
          id: 'o1',
          name: 'Déjeuner',
          merchant: 'Resto',
          city: 'Trappes',
          latitude: 48.77,
          longitude: 2,
          percent_off: 10,
          is_active: false,
        },
      ],
    },
  });
  try {
    await s.crm.render({ content: s.root, tab: 'offers', client: s.client, fresh: () => true });
    assert.match(s.root.querySelector('a').href, /openstreetmap.org/);
    assert.match(s.root.textContent, /10 %/);
    assert.ok(s.root.querySelector('input[placeholder="Ville du commerce"]'));
  } finally {
    s.close();
  }
});

test('client order history can page beyond the latest 25 orders', async () => {
  const s = setup({
    clients: {
      total: 1,
      rows: [{ id: 'c1', email: 'client@example.test', admin_status: 'active' }],
    },
    client_detail: { id: 'c1', orders_total: 26, orders: [], loyalty: [] },
    client_orders: {
      total: 26,
      rows: [
        {
          id: 'order26',
          merchant: 'Resto',
          status: 'collected',
          total_cents: 1000,
          currency: 'EUR',
        },
      ],
    },
  });
  try {
    await s.crm.render({ content: s.root, tab: 'clients', client: s.client, fresh: () => true });
    [...s.root.querySelectorAll('button')].find((b) => b.textContent === 'Dossier client').click();
    await new Promise((r) => setImmediate(r));
    [...s.root.querySelectorAll('button')]
      .find((b) => b.textContent === 'Commandes suivantes')
      .click();
    await new Promise((r) => setImmediate(r));
    assert.equal(s.calls.at(-1).p_action, 'client_orders');
    assert.equal(s.calls.at(-1).p_offset, 25);
    assert.match(s.root.textContent, /order26/);
  } finally {
    s.close();
  }
});

test('client identity reflects current registration fields and escapes HTML', async () => {
  const s = setup({
    profile_identity: {
      first_name: 'Léa',
      last_name: '<img src=x>',
      address_line: '8 avenue de la Gare',
      postal_code: '78190',
      city: 'Trappes',
      email: 'new@example.test',
    },
  });
  try {
    await s.crm.profileIdentity(s.root, 'client1', s.client, () => true);
    assert.match(s.root.textContent, /8 avenue de la Gare/);
    assert.match(s.root.textContent, /new@example.test/);
    assert.equal(s.root.querySelector('img'), null);
  } finally {
    s.close();
  }
});
test('claims review cannot offer acceptance without a matching registered restaurant', async () => {
  const s = setup();
  const calls = [];
  s.client.rpc = async (name, args) => {
    calls.push({ name, args });
    if (name === 'admin_directory_claims')
      return {
        data: {
          total: 1,
          rows: [
            {
              id: 'claim1',
              siret: '12345678901234',
              display_name: 'Resto test',
              capacity: 'Gérant',
              evidence_note: 'Justification du demandeur',
              status: 'pending',
            },
          ],
        },
      };
    if (name === 'review_directory_claim') return { data: null };
    throw Error(name);
  };
  try {
    await s.crm.render({ content: s.root, tab: 'claims', client: s.client, fresh: () => true });
    [...s.root.querySelectorAll('button')].find((b) => b.textContent === 'Examiner').click();
    const select = s.root.querySelector('form select');
    assert.deepEqual(
      [...select.options].map((o) => o.value),
      ['rejected'],
    );
    await submit(s, { decision: 'rejected', note: 'Justificatif incomplet, refus motivé' });
    const review = calls.find((c) => c.name === 'review_directory_claim');
    assert.equal(review.args.p_claim_id, 'claim1');
    assert.equal(review.args.p_merchant_id, null);
    assert.match(s.root.textContent, /Décision enregistrée/);
  } finally {
    s.close();
  }
});
