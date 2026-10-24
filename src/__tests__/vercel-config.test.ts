import config from '../../vercel.json';

type Redirect = {
  source: string;
  has?: { type: string; value: string }[];
  destination: string;
  permanent: boolean;
};

const redirects = config.redirects as Redirect[];
const forHost = (host: string) =>
  redirects.filter((r) => r.has?.some((h) => h.type === 'host' && h.value === host));

describe('vercel.json : anciens liens zeroo.online', () => {
  for (const host of ['zeroo.online', 'www.zeroo.online']) {
    describe(host, () => {
      it('renvoie un ancien QR /m/<slug> vers l’application, même établissement', () => {
        const rule = forHost(host).find((r) => r.source === '/m/:slug*');
        expect(rule?.destination).toBe('https://app.zeeroo.fr/m/:slug*');
        expect(rule?.permanent).toBe(true);
      });

      it('renvoie les pages de l’application (pro, livreur, commande) vers l’application', () => {
        const rule = forHost(host).find((r) => r.source.includes('pro|livreur|order'));
        expect(rule?.destination).toBe('https://app.zeeroo.fr/:page/:rest*');
      });

      it('renvoie le reste vers le site vitrine zeeroo.fr, en dernier', () => {
        const rules = forHost(host);
        expect(rules[rules.length - 1].destination).toBe('https://zeeroo.fr/:path*');
      });
    });
  }

  it('ne redirige jamais les hôtes de l’application ou du site (aucune règle sans condition d’hôte)', () => {
    expect(redirects.every((r) => (r.has ?? []).some((h) => h.type === 'host'))).toBe(true);
  });

  it('ne touche jamais zeeroo.online (démonstrations commerciales) : seul l’ancien zeroo.online est redirigé', () => {
    const hosts = redirects.flatMap((r) => (r.has ?? []).map((h) => h.value));
    expect(hosts).not.toContain('zeeroo.online');
    expect(hosts).not.toContain('www.zeeroo.online');
    expect(new Set(hosts)).toEqual(new Set(['zeroo.online', 'www.zeroo.online']));
  });

  it('conserve la réécriture de l’application monopage', () => {
    expect(config.rewrites).toEqual([{ source: '/(.*)', destination: '/index.html' }]);
  });
});
