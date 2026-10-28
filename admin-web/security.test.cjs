const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, readdirSync } = require('node:fs');
const { createHash } = require('node:crypto');

const read = file => readFileSync(`${__dirname}/${file}`, 'utf8');
const sources = readdirSync(__dirname).filter(f => /\.(js|html)$/.test(f) && f !== 'config.js');
const csp = () => {
  const header = JSON.parse(read('vercel.json')).headers[0].headers.find(h => h.key === 'Content-Security-Policy');
  assert.ok(header, 'Content-Security-Policy header is configured');
  return Object.fromEntries(header.value.split(';').map(d => d.trim().split(/\s+/)).map(([name, ...values]) => [name, values]));
};

test('no third-party script is loaded by the administration console', () => {
  for (const file of sources) {
    const text = read(file);
    assert.doesNotMatch(text, /^\s*import[^\n]*from\s+['"]https?:/m, `${file} must not import a remote module`);
    assert.doesNotMatch(text, /import\(\s*['"]https?:/, `${file} must not import() a remote module`);
    assert.doesNotMatch(text, /<script[^>]+src=["']https?:/i, `${file} must not load a remote <script>`);
  }
});

test('the Supabase client is the pinned local bundle', () => {
  assert.match(read('app.js'), /^import \{ createClient \} from '\.\/vendor\/supabase\.js';/);
  const digest = createHash('sha256').update(readFileSync(`${__dirname}/vendor/supabase.js`)).digest('hex');
  const documented = read('vendor/README.md').match(/SHA-256 : `([0-9a-f]{64})`/);
  assert.ok(documented, 'vendor/README.md documents the SHA-256');
  assert.equal(digest, documented[1], 'vendor/supabase.js matches the documented checksum');
  assert.match(read('vendor/README.md'), /2\.117\.3/);
});

test('the vendored client is part of the deployed build', () => {
  assert.match(JSON.parse(read('vercel.json')).buildCommand, /\bvendor\b/);
});

test('the content security policy only allows own scripts and the Supabase project', () => {
  const policy = csp();
  assert.deepEqual(policy['script-src'], ["'self'"]);
  assert.deepEqual(policy['default-src'], ["'none'"]);
  assert.deepEqual(policy['connect-src'], ["'self'", 'https://rgxesocsvhgsqoehxhgt.supabase.co']);
  assert.deepEqual(policy['frame-ancestors'], ["'none'"]);
  assert.deepEqual(policy['object-src'], ["'none'"]);
  for (const [directive, values] of Object.entries(policy)) {
    for (const value of values) {
      assert.doesNotMatch(value, /unsafe-inline|unsafe-eval|^\*$|^https?:$/, `${directive} must not allow ${value}`);
    }
  }
});
