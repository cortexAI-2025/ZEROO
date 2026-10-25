#!/usr/bin/env python3
"""Assemble la démo cliquable ZeeRoo en un seul fichier HTML autonome (logos intégrés).

Usage : python3 docs/maquette/build.py   (Python 3, sans dépendance)
"""
import base64
from pathlib import Path

HERE = Path(__file__).resolve().parent
SRC = HERE / 'src'


def data_uri(name: str) -> str:
    mime = 'image/svg+xml' if name.endswith('.svg') else 'image/png'
    return f'data:{mime};base64,' + base64.b64encode((SRC / name).read_bytes()).decode()


page = (SRC / 'head.html').read_text() + '<script>\n'
page += ''.join((SRC / f).read_text() for f in ['app1.js', 'app2.js', 'appc.js', 'app3.js'])
page += '</script>\n'
page = (page.replace('__LOGO__', data_uri('logo.png')).replace('__Z__', data_uri('z.png'))
        .replace('__QR__', data_uri('qr.svg')))
(HERE / 'zeeroo-demo.html').write_text(page)
print('docs/maquette/zeeroo-demo.html')
