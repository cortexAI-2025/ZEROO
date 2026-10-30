// Passerelle locale minimale (remplace Kong de `supabase start`) : /rest/v1 -> PostgREST, /auth/v1 -> GoTrue,
// /functions/v1/<nom> -> Edge Function servie par Deno (ports ci-dessous, voir functions_serve.sh).
// Écoute sur 127.0.0.1:54321. Aucun accès réseau extérieur.
import http from 'node:http';
const FUNCTIONS = { 'create-order': 8101, billing: 8102, 'stripe-webhook': 8103, 'order-decision': 8104, 'notify-order-update': 8105, 'customer-cancel-order': 8106, 'courier-decline': 8107, 'customer-departure': 8108 };
const routes = [['/rest/v1', 3000], ['/auth/v1', 9999], ...Object.entries(FUNCTIONS).map(([n, p]) => [`/functions/v1/${n}`, p])];
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS', 'access-control-expose-headers': '*' };
http.createServer((req, res) => {
  // CORS : géré ici (Kong s'en charge avec `supabase start`) ; usage strictement local.
  if (req.method === 'OPTIONS') { res.writeHead(204, { ...CORS, 'access-control-max-age': '600' }); res.end(); return; }
  const r = routes.find(([p]) => req.url.startsWith(p));
  if (!r) { res.writeHead(404, { 'content-type': 'application/json' }); res.end('{"message":"route inconnue"}'); return; }
  const [prefix, port] = r;
  const up = http.request({ host: '127.0.0.1', port, path: req.url.slice(prefix.length) || '/', method: req.method, headers: { ...req.headers, host: `127.0.0.1:${port}` } }, (u) => { res.writeHead(u.statusCode, { ...u.headers, ...CORS }); u.pipe(res); });
  up.on('error', (e) => { res.writeHead(502, { 'content-type': 'application/json' }); res.end(JSON.stringify({ message: 'amont indisponible', detail: e.code })); });
  req.pipe(up);
}).listen(54321, '127.0.0.1', () => console.log('passerelle sur 54321'));
