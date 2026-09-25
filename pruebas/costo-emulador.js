/**
 * registrarCambioDeCosto EN EL EMULADOR: la funcion de verdad, disparada por escrituras
 * de verdad. Se corre con:
 *
 *   npm run test:costo
 *
 * (levanta Firestore y Functions del emulador, corre esto, y los apaga al terminar.
 *  Con el sandbox prendido tambien anda: usa su emulador y borra lo que crea.)
 *
 * Lo que t-costo-fecha.js no puede ver con simulaciones: que el disparador llegue, que
 * la fecha quede con la hora del servidor, que su escritura no la vuelva a disparar en
 * bucle, y que una fecha puesta a proposito en la misma escritura sobreviva.
 */
const HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(HOST)) {
  console.error('Esta prueba corre solo contra el emulador. FIRESTORE_EMULATOR_HOST=' + HOST);
  process.exit(1);
}
const BASE = 'http://' + HOST + '/v1/projects/demo-brotes/databases/(default)/documents';
const H = { 'Content-Type': 'application/json', Authorization: 'Bearer owner' };
const esperar = ms => new Promise(r => setTimeout(r, ms));
const IDS = ['zz-costo-1', 'zz-costo-2', 'zz-costo-3'];

let ok = 0, fail = 0;
const t = (d, c, extra) => {
  if (c) { ok++; console.log('  OK   ' + d); }
  else { fail++; console.log('  FALLA ' + d + (extra !== undefined ? '   [' + extra + ']' : '')); }
};

async function escribir(id, campos) {
  const fields = {};
  Object.keys(campos).forEach(k => {
    const v = campos[k];
    fields[k] = v instanceof Date ? { timestampValue: v.toISOString() }
      : typeof v === 'number' ? { integerValue: String(v) } : { stringValue: String(v) };
  });
  const mascara = Object.keys(campos).map(k => 'updateMask.fieldPaths=' + encodeURIComponent(k)).join('&');
  const r = await fetch(BASE + '/productos/' + id + '?' + mascara, { method: 'PATCH', headers: H, body: JSON.stringify({ fields }) });
  if (!r.ok) throw new Error('No se pudo escribir ' + id + ': ' + r.status + ' ' + (await r.text()).slice(0, 200));
}
async function leer(id) {
  const r = await fetch(BASE + '/productos/' + id, { headers: H });
  return r.ok ? r.json() : null;
}
const fechaDe = d => (d && d.fields && d.fields.costoActualizadoEn && d.fields.costoActualizadoEn.timestampValue) || null;
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
  try {
    console.log('\n-- con la funcion de verdad --');
    /* La primera invocacion arranca el emulador de funciones en frio: se le da tiempo. */
    await escribir(IDS[0], { nombre: 'Prueba costo', costo: 1000, stock: 5 });
    const primera = await hastaQue(async () => fechaDe(await leer(IDS[0])), 60000);
    t('un alta con costo queda con costoActualizadoEn', !!primera, primera);
    t('  y no se dispara en bucle', await quieto(IDS[0], 6000));

    await escribir(IDS[0], { stock: 3 });
    await esperar(6000);
    t('una venta (cambia el stock) no la toca', fechaDe(await leer(IDS[0])) === primera);

    await escribir(IDS[0], { costo: 1300 });
    const segunda = await hastaQue(async () => { const v = fechaDe(await leer(IDS[0])); return v && v !== primera ? v : null; }, 30000);
    t('cambiar el costo la vuelve a anotar, con una fecha posterior', !!segunda && segunda > primera, segunda);
    t('  y otra vez sin bucle', await quieto(IDS[0], 6000));

    /* El editor del panel: cambia el costo y pone la fecha en la misma escritura. */
    const aProposito = new Date('2026-01-15T10:00:00Z');
    await escribir(IDS[0], { costo: 1400, costoActualizadoEn: aProposito });
    await esperar(6000);
    /* Se comparan como fechas: el emulador devuelve '...10:00:00Z' y toISOString agrega '.000Z'. */
    const mismoInstante = (texto, d) => !!texto && new Date(texto).getTime() === d.getTime();
    t('si la misma escritura trae la fecha, la funcion no la pisa',
      mismoInstante(fechaDe(await leer(IDS[0])), aProposito), fechaDe(await leer(IDS[0])));

    /* La siembra del sandbox: un alta con una fecha vieja a proposito. */
    const vieja = new Date('2026-07-01T12:00:00Z');
    await escribir(IDS[1], { nombre: 'Prueba vieja', costo: 500, costoActualizadoEn: vieja });
    await esperar(6000);
    t('un alta que ya trae una fecha vieja la conserva: asi el sandbox muestra el aviso',
      mismoInstante(fechaDe(await leer(IDS[1])), vieja), fechaDe(await leer(IDS[1])));

    await escribir(IDS[2], { nombre: 'Prueba sin costo', stock: 1 });
    await esperar(6000);
    t('un alta sin costo no la anota', fechaDe(await leer(IDS[2])) === null);
  } finally {
    /* Lo que se creo para la prueba no queda en el emulador. */
    for (const id of IDS) await fetch(BASE + '/productos/' + id, { method: 'DELETE', headers: H }).catch(() => {});
  }
  console.log('\n' + ok + ' pasaron, ' + fail + ' fallaron');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERROR: ' + e.message); process.exit(1); });
