import { siteStyle } from '../minisite';

const fields = {
  logo_url: 'https://exemple.test/logo.png',
  tagline: ' Tacos maison ',
  about: 'Depuis 2014.',
  accent_color: 'orange',
};

describe('siteStyle', () => {
  it('montre la personnalisation en formule Pro', () => {
    expect(siteStyle({ ...fields, has_minisite: true })).toEqual({
      personalized: true,
      logoUrl: 'https://exemple.test/logo.png',
      tagline: 'Tacos maison',
      about: 'Depuis 2014.',
      accent: '#E65100',
    });
  });

  it('en formule Start, ou après expiration de Pro, ne montre rien : la fiche de commande reste', () => {
    for (const has_minisite of [false, null]) {
      expect(siteStyle({ ...fields, has_minisite })).toEqual({
        personalized: false,
        logoUrl: null,
        tagline: null,
        about: null,
        accent: null,
      });
    }
  });

  it('ignore une couleur inconnue et les textes vides', () => {
    expect(
      siteStyle({
        logo_url: null,
        tagline: '  ',
        about: null,
        accent_color: 'fuchsia',
        has_minisite: true,
      }),
    ).toEqual({ personalized: true, logoUrl: null, tagline: null, about: null, accent: null });
  });
});
