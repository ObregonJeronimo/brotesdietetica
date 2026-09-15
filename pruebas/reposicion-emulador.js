/**
 * registrarReposicion EN EL EMULADOR: la funcion de verdad, disparada por escrituras
 * de verdad. Se corre con:
 *
 *   npm run test:reposicion
 *
 * (levanta Firestore y Functions del emulador, corre esto, y los apaga al terminar)
 *
 * Lo que t-reposicion.js no puede ver con simulaciones: que el disparador llegue, que
 * stockSubioEn quede con la hora del servidor y, sobre todo, que esa escritura NO la
 * vuelva a disparar en bucle. Si hubiera bucle, el documento se seguiria escribiendo
 * solo: se mira que su updateTime quede quieto.
 */
const HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(HOST)) {
  console.error('Esta prueba corre solo contra el emulador. FIRESTORE_EMULATOR_HOST=' + HOST);
  process.exit(1);
}
const BASE = 'http://' + HOST + '/v1/projects/demo-brotes/databases/(default)/documents';
const H = { 'Content-Type': 'application/json', Authorization: 'Bearer owner' };
const esperar = ms => new Promise(r => setTimeout(r, ms));

let ok = 0, fail = 0;
const t = (d, c, extra) => {
  if (c) { ok++; console.log('  OK   ' + d); }
  else { fail++; console.log('  FALLA ' + d + (extra !== undefined ? '   [' + extra + ']' : '')); }
};

async function escribir(id, campos) {
  const fields = {};
  Object.keys(campos).forEach(k => {
    fields[k] = typeof campos[k] === 'number' ? { integerValue: String(campos[k]) } : { stringValue: String(campos[k]) };
  });
  const mascara = Object.keys(campos).map(k => 'updateMask.fieldPaths=' + encodeURIComponent(k)).join('&');
  const r = await fetch(BASE + '/productos/' + id + '?' + mascara, { method: 'PATCH', headers: H, body: JSON.stringify({ fields }) });
  if (!r.ok) throw new Error('No se pudo escribir ' + id + ': ' + r.status + ' ' + (await r.text()).slice(0, 200));
}
async function leer(id) {
  const r = await fetch(BASE + '/productos/' + id, { headers: H });
  return r.ok ? r.json() : null;
}
const subioEn = d => (d && d.fields && d.fields.stockSubioEn && d.fields.stockSubioEn.timestampValue) || null;
async function hastaQue(cond, ms) {
  const fin = Date.now() + ms;
  while (Date.now() < fin) {
    const v = await cond();
    if (v) return v;
    await esperar(400);
  }
  return null;
}
/* Si hubiera bucle, el documento se volveria a escribir solo en estos segundos. */
async function quieto(id, ms) {
  const a = await leer(id);
  await esperar(ms);
  const b = await leer(id);
  return !!a && !!b && a.updateTime === b.updateTime;
}

(async () => {
  console.log('\n-- con la funcion de verdad --');
  /* La primera invocacion arranca el emulador de funciones en frio: se le da tiempo. */
  await escribir('repo1', { nombre: 'Mani', stock: 5 });
  const primera = await hastaQue(async () => subioEn(await leer('repo1')), 60000);
  t('un alta con stock queda con stockSubioEn', !!primera, primera);
  t('  y no se dispara en bucle', await quieto('repo1', 6000));

  await escribir('repo1', { stock: 3 });
  await esperar(6000);
  t('una venta (el stock baja) no la cambia', subioEn(await leer('repo1')) === primera);

  await escribir('repo1', { precio: 1200 });
  await esperar(6000);
  t('cambiar otro campo tampoco', subioEn(await leer('repo1')) === primera);

  await escribir('repo1', { stock: 10 });
  const segunda = await hastaQue(async () => { const v = subioEn(await leer('repo1')); return v && v !== primera ? v : null; }, 30000);
  t('reponer (el stock sube) la vuelve a anotar, con una fecha posterior', !!segunda && segunda > primera, segunda);
  t('  y otra vez sin bucle', await quieto('repo1', 6000));

  await escribir('repo2', { nombre: 'Chia', stock: 0 });
  await esperar(6000);
  t('un alta sin stock no la anota', subioEn(await leer('repo2')) === null);

  /* Hay productos con stock negativo: una compra que no llega a 0 igual es mercaderia que entro. */
  await escribir('repo3', { nombre: 'Lino', stock: -3 });
  await esperar(6000);
  t('un alta con stock negativo no la anota', subioEn(await leer('repo3')) === null);
  await escribir('repo3', { stock: -1 });
  const negativo = await hastaQue(async () => subioEn(await leer('repo3')), 30000);
  t('de -3 a -1 la anota, aunque siga en negativo', !!negativo, negativo);

  console.log('\n' + ok + ' pasaron, ' + fail + ' fallaron');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERROR: ' + e.message); process.exit(1); });
