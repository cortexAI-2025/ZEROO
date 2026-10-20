#!/usr/bin/env python3
"""
Génère les fichiers de marque Zeeroo dans assets/images/ : logo (clair et sombre), symbole
« oo », icônes iOS et Android, écran de lancement et favicon.

Usage : python3 scripts/brand-assets.py   (nécessite Pillow et NumPy)

Le logo est redessiné à partir de l'affiche de référence (assets/brand/affiche-zeroo.jpg) :
traits de vitesse, « ZÉR » puis « OO » en vert, deux accents au-dessus du dernier O.
Police : Inter Display Black Italic (licence OFL). Autre police : variable ZEROO_FONT.
Quand le graphiste livrera le logo en SVG, remplacer `wordmark()` et `mark()` par ses fichiers.
"""
import os
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'assets/images'
FONT = os.environ.get('ZEROO_FONT', '/usr/share/fonts/opentype/inter/InterDisplay-BlackItalic.otf')

LIME = (93, 190, 58)  # #5DBE3A
FOREST = (13, 59, 42)  # #0D3B2A
INK = (13, 31, 24)  # texte du logo sur fond clair
WHITE = (255, 255, 255)

SIZE = 400  # corps de la police pour le dessin, réduit ensuite


def trim(img: Image.Image) -> Image.Image:
    return img.crop(img.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox())


def accents(draw: ImageDraw.ImageDraw, x: float, top: float, w: float) -> None:
    """Deux petits traits obliques au-dessus d'un O (les « gouttes » du logo)."""
    t = w * 0.11
    for dx, length in ((0.42, 0.20), (0.66, 0.30)):
        x0, y0 = x + w * dx, top - w * 0.06
        draw.line((x0, y0, x0 + length * w * 0.45, y0 - length * w), fill=LIME, width=round(t))


def wordmark(ink) -> Image.Image:
    font = ImageFont.truetype(FONT, SIZE)
    img = Image.new('RGBA', (SIZE * 5, SIZE * 2), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    x, y = SIZE * 0.55, SIZE * 0.5
    # Traits de vitesse, inclinés comme l'italique.
    for i, (length, dy) in enumerate(((0.38, 0.52), (0.26, 0.72))):
        x1 = x - SIZE * 0.06 - i * SIZE * 0.05
        y0, h = y + SIZE * dy, SIZE * 0.1
        k = h * 0.25
        d.polygon(
            [(x1 - SIZE * length + k, y0), (x1 + k, y0), (x1, y0 + h), (x1 - SIZE * length, y0 + h)],
            fill=LIME,
        )
    d.text((x, y), 'ZÉR', font=font, fill=ink)
    x += d.textlength('ZÉR', font=font) - SIZE * 0.02
    d.text((x, y), 'OO', font=font, fill=LIME)
    o_w = d.textlength('O', font=font)
    cap_top = y + font.getbbox('O')[1]
    accents(d, x + o_w * 0.95, cap_top, o_w)
    return trim(img)


def mark() -> Image.Image:
    """Symbole « oo » avec ses accents, pour les icônes et le favicon."""
    font = ImageFont.truetype(FONT, SIZE)
    img = Image.new('RGBA', (SIZE * 3, SIZE * 2), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    x, y = SIZE * 0.3, SIZE * 0.5
    d.text((x, y), 'OO', font=font, fill=LIME)
    o_w = d.textlength('O', font=font)
    accents(d, x + o_w * 0.95, y + font.getbbox('O')[1], o_w)
    return trim(img)


def square(img: Image.Image, size: int, scale: float, background=None) -> Image.Image:
    """Image centrée dans un carré, occupant `scale` du côté."""
    ratio = min(size * scale / img.width, size * scale / img.height)
    resized = img.resize((round(img.width * ratio), round(img.height * ratio)), Image.LANCZOS)
    canvas = Image.new('RGBA', (size, size), (*background, 255) if background else (0, 0, 0, 0))
    canvas.alpha_composite(resized, ((size - resized.width) // 2, (size - resized.height) // 2))
    return canvas


def main():
    logo = wordmark(INK)
    logo_dark = wordmark(WHITE)
    symbol = mark()

    logo.save(OUT / 'logo.png', optimize=True)
    logo_dark.save(OUT / 'logo-dark.png', optimize=True)
    symbol.save(OUT / 'logo-mark.png', optimize=True)
    # iOS : pas de transparence autorisée. Fond vert forêt, comme le sac de livraison.
    square(symbol, 1024, 0.62, FOREST).convert('RGB').save(OUT / 'icon.png', optimize=True)
    # Android adaptatif : premier plan dans la zone sûre (~66 %), fond vert forêt, monochrome.
    foreground = square(symbol, 1024, 0.50)
    foreground.save(OUT / 'android-icon-foreground.png', optimize=True)
    Image.new('RGB', (1024, 1024), FOREST).save(OUT / 'android-icon-background.png')
    mono = np.asarray(foreground).copy()
    mono[..., :3] = 0
    Image.fromarray(mono, 'RGBA').save(OUT / 'android-icon-monochrome.png', optimize=True)
    square(logo, 1024, 0.96).save(OUT / 'splash-icon.png', optimize=True)
    square(logo_dark, 1024, 0.96).save(OUT / 'splash-icon-dark.png', optimize=True)
    square(symbol, 48, 0.96, FOREST).save(OUT / 'favicon.png', optimize=True)
    print('Fichiers de marque générés dans', OUT)


if __name__ == '__main__':
    main()
