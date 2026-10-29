/**
 * EN EL SANDBOX, LA RAÍZ LLEVA AL PANEL DEL SANDBOX (29/10/2026).
 *
 * La vista previa abre la raíz del puerto al levantar el sandbox, y la raíz era la tienda, que
 * se conecta a la base REAL: cada arranque leía el catálogo entero de producción (~1.650
 * lecturas; visto en las métricas minuto a minuto). Ahora, con el sandbox andando, "/" y
 * "/index.html" redirigen a /sandbox. Sin el sandbox (npm run dev) la raíz sigue siendo la tienda.
 *
 * Levanta dev-server.js de verdad, en un puerto libre, y lo apaga al terminar.
 */
const path = require('path');
const http = require('http');
const net = require('net');
const { spawn } = require('child_process');
const RAIZ = path.join(__dirname, '..');

let ok = 0, fail = 0;
const t = (d, c, extra) => {
  if (c) { ok++; console.log('  OK   ' + d); }
  else { fail++; console.log('  FALLA ' + d + (extra !== undefined ? '   [' + JSON.stringify(extra).slice(0, 300) + ']' : '')); }
};

const puertoLibre = () => new Promise((ok2, mal) => {
  const s = net.createServer();
  s.once('error', mal);
  s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok2(p)); });
});
const pedir = (puerto, ruta) => new Promise((ok2, mal) => {
  http.get({ host: '127.0.0.1', port: puerto, path: ruta }, r => {
    let d = ''; r.on('data', x => { d += x; }); r.on('end', () => ok2({ st: r.statusCode, loc: r.headers.location || '', body: d }));
  }).on('error', mal);
});
const espera = ms => new Promise(r => setTimeout(r, ms));
const procesos = [];
async function levantar(sandbox) {
  const puerto = await puertoLibre();
  const env = Object.assign({}, process.env);
  delete env.MODO_SANDBOX; delete env.ABRIR_EN_LA_RED;
  if (sandbox) env.MODO_SANDBOX = '1';
  const p = spawn(process.execPath, [path.join(RAIZ, 'dev-server.js'), String(puerto)], { cwd: RAIZ, env, stdio: 'ignore' });
  procesos.push(p);
  for (let i = 0; i < 50; i++) {
    try { await pedir(puerto, '/sandbox'); return puerto; } catch (e) { await espera(100); }
  }
  throw new Error('el servidor no arranco');
}
const apagar = () => procesos.forEach(p => { try { p.kill(); } catch (e) { /* ya estaba apagado */ } });
process.on('exit', apagar);

(async () => {
  console.log('\n-- con el sandbox andando --');
  const ps = await levantar(true);
  const raiz = await pedir(ps, '/');
  t('la raíz redirige a /sandbox (no abre la tienda contra la base real)', raiz.st === 302 && raiz.loc === '/sandbox', raiz);
  const conQuery = await pedir(ps, '/?x=1');
  t('  también con algo después del "?"', conQuery.st === 302 && conQuery.loc === '/sandbox', conQuery);
  const idx = await pedir(ps, '/index.html');
  t('  y pidiendo /index.html', idx.st === 302 && idx.loc === '/sandbox', idx);
  const panel = await pedir(ps, '/sandbox');
  t('/sandbox sigue siendo el panel contra el emulador', panel.st === 200 && panel.body.indexOf('firebase-config.sandbox.js') >= 0 &&
    panel.body.indexOf('src="firebase-config.js"') < 0);
  const tienda = await pedir(ps, '/sandbox/index');
  t('la tienda contra el emulador sigue en /sandbox/index', tienda.st === 200 && tienda.body.indexOf('firebase-config.sandbox.js') >= 0);
  const admin = await pedir(ps, '/admin');
  t('/admin sigue preguntando antes de entrar al panel real', admin.st === 200 && admin.body.indexOf('es el panel real') >= 0);

  console.log('\n-- sin el sandbox (npm run dev) --');
  const pd = await levantar(false);
  const raizDev = await pedir(pd, '/');
  t('la raíz sigue siendo la tienda, como siempre', raizDev.st === 200 && raizDev.body.indexOf('firebase-config.js') >= 0);

  apagar();
  console.log('\n' + ok + ' pasaron, ' + fail + ' fallaron');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); apagar(); process.exit(1); });
