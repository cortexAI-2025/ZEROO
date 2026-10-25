import { buildPrintDocument, type PrintKit } from '../printKit';
const input: PrintKit = {
  format: 'flyer',
  merchantName: 'Chez Samir',
  url: 'https://zeeroo.fr/m/chez-samir',
  qrDataUrl:
    'data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%2F%3E',
  copy: {
    headline: 'Commande directe',
    stickerHeadline: 'Scannez ici',
    intro: 'Votre restaurant',
    cta: 'Notre menu',
    benefit: 'Prix de la carte',
    footer: 'Selon disponibilité',
    print: 'Imprimer',
    hint: 'Taille réelle',
  },
};

test('le flyer A6 conserve le restaurant, le lien et un QR autonome', () => {
  const html = buildPrintDocument(input);
  expect(html).toContain('size:105mm 148mm');
  expect(html).toContain('Chez Samir');
  expect(html).toContain(input.url);
  expect(html.match(/<article/g)).toHaveLength(1);
  expect(html).toContain('data:image/svg+xml');
  expect(html).not.toContain('<script');
});
test('la planche A4 contient exactement quatre flyers', () => {
  const html = buildPrintDocument({ ...input, format: 'sheet' });
  expect(html).toContain('size:A4');
  expect(html.match(/<article/g)).toHaveLength(4);
});
test('l’autocollant a un format carré de 10 cm', () => {
  const html = buildPrintDocument({ ...input, format: 'sticker' });
  expect(html).toContain('size:100mm 100mm');
  expect(html).toContain('Scannez ici');
  expect(html).not.toContain('<footer>');
});
test('les noms et URL ne peuvent pas injecter du HTML dans la page d’impression', () => {
  const html = buildPrintDocument({
    ...input,
    merchantName: '<script>alert(1)</script>',
    url: 'https://zeeroo.fr/m/a"><img onerror=alert(1)>',
  });
  expect(html).not.toContain('<script>');
  expect(html).not.toContain('<img onerror');
  expect(html).toContain('&lt;script&gt;');
});
test('les images QR distantes ou exécutables sont refusées', () => {
  expect(() => buildPrintDocument({ ...input, qrDataUrl: 'https://tracker.test/pixel' })).toThrow(
    'invalid_qr_image',
  );
  expect(() => buildPrintDocument({ ...input, qrDataUrl: 'javascript:alert(1)' })).toThrow(
    'invalid_qr_image',
  );
});
