#!/usr/bin/env python3
"""
Assemble la maquette cliquable Zeeroo (src/*.dc.html : client, restaurant, livreur) en un
seul fichier HTML autonome, logos intégrés.

Usage : python3 docs/maquette/build.py   → docs/maquette/zeroo-maquette.html
"""
import base64
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
PROJECT = HERE / 'src'
ROOT = HERE.parent.parent
LOGO = ROOT / 'assets/images/logo.png'
LOGO_DARK = ROOT / 'assets/images/logo-dark.png'
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else HERE / 'zeroo-maquette.html'

BOARDS = [
    ('Main.dc.html', 'main', 'Application client', 'MainComponent'),
    ('Pro.dc.html', 'pro', 'Espace restaurant', 'ProComponent'),
    ('Livreur.dc.html', 'livreur', 'Espace livreur', 'LivreurComponent'),
]


def data_uri(p: Path) -> str:
    return 'data:image/png;base64,' + base64.b64encode(p.read_bytes()).decode()


logo, logo_dark = data_uri(LOGO), data_uri(LOGO_DARK)
templates, scripts, phones = [], [], []
for fname, key, title, cls in BOARDS:
    src = (PROJECT / fname).read_text(encoding='utf-8')
    body = src[src.index('<x-dc>') + 6 : src.index('</x-dc>')]
    body = re.sub(r'<helmet>.*?</helmet>', '', body, flags=re.S)
    body = body.replace('/_blob/1be05210a14ea5a8793dfd4668645adc', logo)
    body = body.replace('/_blob/46c9615f9bd2fbe998767b807701b941', logo_dark)
    m = re.search(r'<script type="text/x-dc"[^>]*>(.*?)</script>', src, flags=re.S)
    code = m.group(1)
    templates.append(f'<template id="tpl-{key}">{body.strip()}</template>')
    scripts.append(f'var {cls} = (function () {{\n{code}\nreturn Component;\n}})();')
    phones.append(
        f'<section class="col" id="phone-{key}" aria-label="{title}">'
        f'<h2 class="col-title">{title}</h2>'
        f'<div class="wrap"><div class="phone"><div class="screen" data-mount="{key}"></div></div></div>'
        f'</section>'
    )

PRE = r"""
function DCLogic(props) { this.props = props || {}; this.state = {}; }
DCLogic.prototype.setState = function (patch) {
  var p = typeof patch === 'function' ? patch(this.state, this.props) : patch;
  this.state = Object.assign({}, this.state, p);
  if (this.__rerender) this.__rerender();
};
DCLogic.prototype.forceUpdate = function () { if (this.__rerender) this.__rerender(); };
"""

RUNTIME = r"""
var DC_MOUNTS = { main: MainComponent, pro: ProComponent, livreur: LivreurComponent };
var LINKS = { 'Main.dc.html': 'main', 'Pro.dc.html': 'pro', 'Livreur.dc.html': 'livreur' };
var HOLE = /\{\{\s*([^}]+?)\s*\}\}/g;
var WHOLE = /^\s*\{\{\s*([^}]+?)\s*\}\}\s*$/;

function lookup(path, scope) {
  if (path === 'true') return true;
  if (path === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(path)) return Number(path);
  var parts = path.split('.');
  var v = scope;
  for (var i = 0; i < parts.length; i++) {
    if (v == null) return undefined;
    v = v[parts[i]];
  }
  return v;
}
function interp(str, scope) {
  return str.replace(HOLE, function (_, p) { var v = lookup(p, scope); return v == null ? '' : String(v); });
}

var EVENTS = { onclick: 'click', onchange: 'input', oninput: 'input', onsubmit: 'submit', onkeydown: 'keydown' };

function renderInto(parent, node, scope) {
  if (node.nodeType === 3) { parent.appendChild(document.createTextNode(interp(node.nodeValue, scope))); return; }
  if (node.nodeType !== 1) return;
  var tag = node.localName;
  if (tag === 'sc-if') {
    var cond = lookup((node.getAttribute('value') || '').replace(WHOLE, '$1'), scope);
    if (cond) node.childNodes.forEach(function (c) { renderInto(parent, c, scope); });
    return;
  }
  if (tag === 'sc-for') {
    var list = lookup((node.getAttribute('list') || '').replace(WHOLE, '$1'), scope) || [];
    var as = node.getAttribute('as') || 'item';
    list.forEach(function (item, i) {
      var inner = Object.create(scope);
      inner[as] = item;
      inner.$index = i;
      node.childNodes.forEach(function (c) { renderInto(parent, c, inner); });
    });
    return;
  }
  var el = node.namespaceURI && node.namespaceURI !== 'http://www.w3.org/1999/xhtml'
    ? document.createElementNS(node.namespaceURI, node.nodeName)
    : document.createElement(tag);
  Array.prototype.forEach.call(node.attributes, function (a) {
    var name = a.name, val = a.value;
    var whole = val.match(WHOLE);
    if (EVENTS[name]) {
      var fn = whole ? lookup(whole[1], scope) : null;
      if (typeof fn === 'function') el.addEventListener(EVENTS[name], function (e) { fn(e); });
      return;
    }
    if (name === 'value' && (tag === 'input' || tag === 'textarea')) {
      el.value = whole ? (lookup(whole[1], scope) == null ? '' : lookup(whole[1], scope)) : interp(val, scope);
      return;
    }
    el.setAttribute(name, whole ? String(lookup(whole[1], scope) == null ? '' : lookup(whole[1], scope)) : interp(val, scope));
  });
  if (tag === 'a') {
    var href = el.getAttribute('href') || '';
    if (LINKS[href]) {
      el.addEventListener('click', function (e) { e.preventDefault(); showPhone(LINKS[href]); });
    }
  }
  node.childNodes.forEach(function (c) { renderInto(el, c, scope); });
  parent.appendChild(el);
}

function mount(key) {
  var host = document.querySelector('[data-mount="' + key + '"]');
  var tpl = document.getElementById('tpl-' + key).content;
  var comp = new DC_MOUNTS[key]({});
  var lastView = null;
  comp.__rerender = function () {
    var view = [comp.state.screen, comp.state.tab, comp.state.restoId].join('|');
    var scrollers = Array.prototype.map.call(host.querySelectorAll('*'), function (n) { return n.scrollTop; });
    var active = document.activeElement;
    var inputs = Array.prototype.slice.call(host.querySelectorAll('input'));
    var focusIdx = host.contains(active) ? inputs.indexOf(active) : -1;
    var vals = comp.renderVals();
    var frag = document.createDocumentFragment();
    tpl.childNodes.forEach(function (c) { renderInto(frag, c, vals); });
    host.replaceChildren(frag);
    if (view === lastView) {
      Array.prototype.forEach.call(host.querySelectorAll('*'), function (n, i) { if (scrollers[i]) n.scrollTop = scrollers[i]; });
    }
    lastView = view;
    if (focusIdx >= 0) {
      var next = host.querySelectorAll('input')[focusIdx];
      if (next) { next.focus(); var l = next.value.length; try { next.setSelectionRange(l, l); } catch (e) {} }
    }
  };
  comp.__rerender();
}

function showPhone(key) {
  var col = document.getElementById('phone-' + key);
  document.querySelectorAll('.switch button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.key === key)); });
  document.body.dataset.current = key;
  col.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'center' });
  col.classList.remove('flash'); void col.offsetWidth; col.classList.add('flash');
}

function fit() {
  var w = window.innerWidth;
  var s = w < 440 ? Math.max(0.6, (w - 36) / 410) : 1;
  document.documentElement.style.setProperty('--s', String(s));
}

window.addEventListener('resize', fit);
fit();
Object.keys(DC_MOUNTS).forEach(mount);
document.querySelectorAll('.switch button').forEach(function (b) {
  b.addEventListener('click', function () { showPhone(b.dataset.key); });
});
document.body.dataset.current = 'main';
"""

CSS = """
:root{--bg:#EEF2EC;--ink:#0D3B2A;--muted:#4B5B52;--brand:#1F7A35;--s:1}
*{box-sizing:border-box}
html,body{margin:0;background:var(--bg);color:var(--ink);font-family:'Plus Jakarta Sans',system-ui,-apple-system,'Segoe UI',sans-serif}
button{font:inherit;color:inherit}
header.top{max-width:1420px;margin:0 auto;padding:32px 16px 8px;display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:16px}
header.top img{height:40px;width:auto;display:block}
header.top h1{margin:12px 0 4px;font-size:28px;font-weight:800}
header.top p{margin:0;color:var(--muted);font-size:15px;line-height:1.5;max-width:640px}
.switch{display:flex;gap:6px;background:#DDE5DA;border-radius:14px;padding:4px;flex-wrap:wrap}
.switch button{border:none;background:transparent;border-radius:10px;min-height:44px;padding:0 14px;font-size:14px;font-weight:700;color:var(--muted);cursor:pointer}
.switch button[aria-pressed="true"]{background:#fff;color:var(--brand);box-shadow:0 1px 4px rgba(0,0,0,.12)}
main.phones{max-width:1420px;margin:0 auto;padding:16px 16px 48px;display:flex;flex-wrap:wrap;justify-content:center;gap:40px}
.col{display:flex;flex-direction:column;align-items:center;gap:12px;scroll-margin-top:12px;border-radius:56px}
.col-title{margin:0;font-size:16px;font-weight:800;color:var(--ink)}
.wrap{width:calc(410px * var(--s));height:calc(864px * var(--s))}
.phone{width:410px;height:864px;padding:10px;border-radius:54px;background:#0B0B0C;box-shadow:0 24px 60px rgba(13,59,42,.25);transform:scale(var(--s));transform-origin:top left}
.screen{width:390px;height:844px;border-radius:44px;overflow:hidden;background:#fff}
.col.flash .phone{animation:flash .9s ease}
@keyframes flash{0%{box-shadow:0 0 0 0 rgba(93,190,58,.9)}100%{box-shadow:0 0 0 22px rgba(93,190,58,0)}}
footer{text-align:center;color:var(--muted);font-size:13px;padding:0 16px 32px}
@media (max-width: 900px){
  main.phones{gap:28px}
  body[data-current] .col{display:none}
  body[data-current="main"] #phone-main,body[data-current="pro"] #phone-pro,body[data-current="livreur"] #phone-livreur{display:flex}
}
"""

html = f"""<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Zeeroo — maquette cliquable</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&amp;display=swap">
<style>{CSS}</style>
</head>
<body>
<header class="top">
  <div>
    <img src="{logo}" alt="Zeeroo">
    <h1>Maquette cliquable</h1>
    <p>Le bon goût. Sans commission. Cliquez dans les écrans pour naviguer : commande côté client, gestion des commandes côté restaurant, courses côté livreur. Données fictives de démonstration.</p>
  </div>
  <nav class="switch" aria-label="Choisir un espace">
    <button type="button" data-key="main" aria-pressed="true">Client</button>
    <button type="button" data-key="pro" aria-pressed="false">Restaurant</button>
    <button type="button" data-key="livreur" aria-pressed="false">Livreur</button>
  </nav>
</header>
<main class="phones">
{''.join(phones)}
</main>
<footer>Zeeroo · maquette de démonstration, non contractuelle.</footer>
{''.join(templates)}
<script>
{PRE}
{chr(10).join(scripts)}
{RUNTIME}
</script>
</body>
</html>
"""
OUT.write_text(html, encoding='utf-8')
print(OUT, round(len(html) / 1024), 'Ko')
