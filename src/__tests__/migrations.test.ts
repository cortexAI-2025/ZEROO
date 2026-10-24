/// <reference types="node" />
import { readdirSync } from 'fs';
import { join } from 'path';

const dir = join(__dirname, '..', '..', 'supabase', 'migrations');
const files = readdirSync(dir)
  .filter((f) => f.endsWith('.sql'))
  .sort();

/**
 * Le projet hébergé enregistre la version de chaque migration appliquée : un fichier renommé ou
 * dupliqué ferait échouer (ou rejouer) `supabase db push`. Versions uniques, à 14 chiffres, nom explicite.
 */
describe('migrations Supabase', () => {
  it('chaque fichier est nommé AAAAMMJJHHMMSS_nom.sql', () => {
    for (const f of files) expect(f).toMatch(/^\d{14}_[a-z0-9_]+\.sql$/);
  });

  it('les versions sont uniques', () => {
    const versions = files.map((f) => f.slice(0, 14));
    expect(new Set(versions).size).toBe(versions.length);
  });

  it('les noms sont uniques (un nom = une migration)', () => {
    const names = files.map((f) => f.slice(15));
    expect(new Set(names).size).toBe(names.length);
  });
});
