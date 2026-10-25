export type PrintFormat = 'flyer' | 'sticker' | 'sheet';
type Copy = {
  headline: string;
  stickerHeadline: string;
  intro: string;
  cta: string;
  benefit: string;
  footer: string;
  print: string;
  hint: string;
};
export type PrintKit = {
  format: PrintFormat;
  merchantName: string;
  url: string;
  qrDataUrl: string;
  copy: Copy;
};

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

/** Document autonome : aucun outil de suivi, aucune ressource externe, QR vectoriel. */
export function buildPrintDocument({ format, merchantName, url, qrDataUrl, copy }: PrintKit) {
  if (!qrDataUrl.startsWith('data:image/svg+xml;charset=utf-8,'))
    throw new Error('invalid_qr_image');
  const e = escapeHtml;
  const sticker = format === 'sticker';
  const card = `<article class="card ${sticker ? 'sticker' : 'flyer'}">
    <header><span class="brand">ZeeRoo<span class="dot">.</span></span><span class="tag" style="font-size:${merchantName.length > 45 ? 7 : sticker ? 9 : 10}pt">${e(merchantName)}</span></header>
    <main><h1>${e(sticker ? copy.stickerHeadline : copy.headline)}</h1>
    ${sticker ? '' : `<p class="intro">${e(copy.intro)}</p>`}
    <div class="qr"><img src="${e(qrDataUrl)}" alt="QR code" /></div>
    <p class="cta">${e(copy.cta)}</p><p class="url">${e(url)}</p>
    ${sticker ? '' : `<p class="benefit">${e(copy.benefit)}</p>`}</main>
    ${sticker ? '' : `<footer>${e(copy.footer)}</footer>`}
  </article>`;
  const pageSize = format === 'sheet' ? 'A4' : sticker ? '100mm 100mm' : '105mm 148mm';
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ZeeRoo - ${e(merchantName)}</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#e9ece5;color:#14230b;font-family:Arial,Helvetica,sans-serif}
.toolbar{max-width:740px;margin:20px auto;padding:18px;background:white;border-radius:16px;font-size:14px;line-height:1.5}.toolbar button{border:0;border-radius:10px;padding:14px 20px;background:#267c08;color:white;font-size:16px;font-weight:700;cursor:pointer}.toolbar p{margin:12px 0 0}
.sheet{display:grid;grid-template-columns:105mm;width:105mm;margin:20px auto;gap:0}
.sheet.four{width:210mm;grid-template-columns:repeat(2,105mm)}.sheet.single-sticker{width:100mm;grid-template-columns:100mm}
.card{position:relative;overflow:hidden;background:#fff;break-inside:avoid;print-color-adjust:exact;-webkit-print-color-adjust:exact}
.flyer{width:105mm;height:148mm;padding:7mm}.sticker{width:100mm;height:100mm;padding:6mm;text-align:center}
header{display:flex;flex-direction:column;gap:2mm;border-bottom:0.5mm solid #287d08;padding-bottom:3mm}
.brand{font-size:22pt;font-weight:900;letter-spacing:-1.3pt}.dot{color:#3b9409}.tag{font-size:10pt;font-weight:700;overflow-wrap:anywhere;line-height:1.15}
h1{font-size:23pt;line-height:1.03;letter-spacing:-0.7pt;margin:4mm 0 2mm;max-width:90mm}
.intro{font-size:9pt;line-height:1.3;margin:0 0 2mm}.qr{display:flex;justify-content:center;align-items:center;background:white;margin:0 auto;width:43mm;height:43mm}.qr img{width:100%;height:100%;display:block}
.cta{font-size:10pt;font-weight:800;text-align:center;margin:1mm 0}.url{font-size:7pt;line-height:1.2;text-align:center;overflow-wrap:anywhere;margin:1mm 0 3mm}
.benefit{border-radius:2mm;background:#eff7e9;padding:2.5mm;font-size:9pt;line-height:1.2;font-weight:700;margin:0}
footer{position:absolute;bottom:5mm;left:7mm;right:7mm;font-size:6.3pt;line-height:1.3;color:#4d5947}
.sticker header{padding-bottom:2mm;gap:1mm}.sticker .brand{font-size:18pt}.sticker .tag{font-size:9pt}.sticker h1{font-size:18pt;margin:3mm 0 1mm}.sticker .qr{width:37mm;height:37mm}.sticker .cta{font-size:9pt}.sticker .url{font-size:6.5pt;margin-bottom:0}
.four .card{outline:0.2mm dashed #bbb;outline-offset:-0.3mm}
@page{size:${pageSize};margin:0}
@media print{body{background:white}.toolbar{display:none}.sheet,.sheet.four,.sheet.single-sticker{margin:0}.card{box-shadow:none}}
@media screen and (max-width:800px){.toolbar{margin:12px}.sheet{transform-origin:top left}.sheet.four{zoom:0.46}}
</style></head><body><section class="toolbar"><button id="print" type="button">${e(copy.print)}</button><p>${e(copy.hint)}</p></section><section class="sheet ${format === 'sheet' ? 'four' : sticker ? 'single-sticker' : ''}">${card.repeat(format === 'sheet' ? 4 : 1)}</section></body></html>`;
}
