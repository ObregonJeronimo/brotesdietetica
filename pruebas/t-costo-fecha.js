/**
 * REGISTRAR CAMBIO DE COSTO: costoActualizadoEn CUANDO CAMBIA EL COSTO.
 *
 * El aviso de "costo desactualizado" que sale al vender (admin-costos.js) necesita
 * saber cuándo se tocó por última vez el costo de cada producto. Lo anota la Cloud
 * Function registrarCambioDeCosto, que escucha toda escritura en productos/{id}: el
 * costo cambia desde el formulario, Importar Costos, Importar Nuevos, una compra o el
 * PDF semanal, y ninguno de esos caminos se puede olvidar de anotarlo.
 *
 * LO QUE ESTA PRUEBA CUIDA
 * 1. Que anote cuando el costo cambia, y en un alta que ya trae costo.
 * 2. Que no anote cuando cambia otra cosa, ni cuando el costo es el mismo escrito
 *    distinto ("100" y 100).
 * 3. Que NO pise una fecha que la misma escritura ya trae: el panel la pone al
 *    confirmar un costo que sigue igual, y la siembra del sandbox con fechas viejas.
 * 4. Que su propia escritura no la vuelva a disparar.
 * 5. Que un producto borrado en el medio no sea un error, y otro error se relance.
 *
 * Carga functions/index.js de verdad, con firebase-admin y firebase-functions
 * simulados, igual que t-reposicion.js. (Con la funcion de verdad en el emulador:
 * npm run test:costo.)
 */
const path = require('path');
const Module = require('module');
const RAIZ = path.join(__dirname, '..', 'functions');

/* Las opciones por FUNCION: registrarReposicion y esta escuchan el mismo documento,
   asi que indexarlas por documento haria que una pise a la otra. */
const OPCIONES = new Map();
const FieldValue = { serverTimestamp: () => ({ __serverTimestamp: true }), increment: n => ({ __inc: n }) };
const originalLoad = Module._load;
Module._load = function (req) {
  if (req === 'firebase-admin') {
    return { initializeApp: () => {}, firestore: Object.assign(() => ({}), { FieldValue }), storage: () => ({}) };
  }
  if (req === 'firebase-admin/firestore') return { FieldValue };
  if (req === 'firebase-functions') return { logger: { info() {}, warn() {}, error() {} } };
  if (req === 'firebase-functions/v1') {
    const v1 = { auth: { user: () => ({ onCreate: f => f }) } };
    v1.region = () => v1;
    v1.runWith = () => v1;
    return v1;
  }
  if (req === 'firebase-functions/v2/storage') return { onObjectFinalized: (o, f) => f, onObjectDeleted: (o, f) => f };
  if (req === 'firebase-functions/v2/firestore') {
    const registrar = (o, f) => { OPCIONES.set(f, o); return f; };
    return { onDocumentCreated: registrar, onDocumentWritten: registrar };
  }
  return originalLoad.apply(this, arguments);
};
const mod = require(path.join(RAIZ, 'index.js'));
Module._load = originalLoad;
const fn = mod.registrarCambioDeCosto;

let ok = 0, fail = 0;
const t = (d, c, extra) => {
  if (c) { ok++; console.log('  OK   ' + d); }
  else { fail++; console.log('  FALLA ' + d + (extra !== undefined ? '   [' + extra + ']' : '')); }
};

let ESCRITURAS = [], FALLAR = null;
const doc = datos => ({
  exists: datos != null,
  data: () => datos,
  ref: { update: async patch => { if (FALLAR) throw FALLAR; ESCRITURAS.push(patch); } },
});
async function escribir(antes, despues) {
  ESCRITURAS = [];
  let error = null;
  try { await fn({ data: { before: doc(antes), after: doc(despues) }, params: { productoId: 'p1' } }); }
  catch (e) { error = e; }
  return { escrituras: ESCRITURAS, error };
}
/* Un Timestamp de Firestore de mentira. */
const ts = ms => ({ toMillis: () => ms, seconds: Math.floor(ms / 1000), nanoseconds: 0 });
const anoto = r => r.escrituras.length === 1 && Object.keys(r.escrituras[0]).join() === 'costoActualizadoEn' &&
  r.escrituras[0].costoActualizadoEn.__serverTimestamp === true;
const nada = r => r.escrituras.length === 0 && r.error === null;

(async () => {
  console.log('\n-- donde escucha --');
  t('la funcion existe', typeof fn === 'function');
  const op = OPCIONES.get(fn);
  t('escucha productos/{productoId}', !!op && op.document === 'productos/{productoId}', op && op.document);
  t('en southamerica-east1, la region de Firestore', !!op && op.region === 'southamerica-east1', op && op.region);
  t('sin reintento automatico, igual que registrarReposicion', !!op && op.retry !== true);
  t('no le cambia las opciones a registrarReposicion', OPCIONES.get(mod.registrarReposicion) &&
    OPCIONES.get(mod.registrarReposicion) !== op);

  console.log('\n-- anota --');
  t('cuando cambia el costo', anoto(await escribir({ nombre: 'Mani', costo: 1000 }, { nombre: 'Mani', costo: 1200 })));
  t('  solo costoActualizadoEn, con la hora del servidor', anoto(await escribir({ costo: 1 }, { costo: 2 })));
  t('cuando baja, tambien: es un cambio', anoto(await escribir({ costo: 1500 }, { costo: 1400 })));
  t('en un alta que ya trae costo', anoto(await escribir(null, { nombre: 'Chia', costo: 800 })));
  t('en un alta con costo 0: es el costo que se cargo', anoto(await escribir(null, { nombre: 'Nuevo', costo: 0 })));
  t('con el costo guardado como texto', anoto(await escribir({ costo: '100' }, { costo: '120' })));

  console.log('\n-- no anota --');
  t('cuando cambia otra cosa (una venta baja el stock)', nada(await escribir({ costo: 900, stock: 10 }, { costo: 900, stock: 8 })));
  t('cuando el costo es el mismo escrito distinto', nada(await escribir({ costo: '100' }, { costo: 100 })));
  t('en un alta sin costo', nada(await escribir(null, { nombre: 'Sin costo' })));
  t('cuando se borra el producto', nada(await escribir({ costo: 5 }, null)));
  t('con su propia escritura: no se dispara en bucle',
    nada(await escribir({ costo: 900 }, { costo: 900, costoActualizadoEn: ts(1000) })));

  console.log('\n-- una fecha puesta a proposito no se pisa --');
  t('si la escritura cambia el costo Y ya trae la fecha (el editor del panel)',
    nada(await escribir({ costo: 900, costoActualizadoEn: ts(1000) }, { costo: 950, costoActualizadoEn: ts(5000) })));
  t('si un alta ya trae la fecha (la siembra del sandbox, con fechas viejas)',
    nada(await escribir(null, { costo: 700, costoActualizadoEn: ts(123) })));
  t('pero si cambia el costo y la fecha es la de antes, se anota',
    anoto(await escribir({ costo: 900, costoActualizadoEn: ts(1000) }, { costo: 950, costoActualizadoEn: ts(1000) })));

  console.log('\n-- errores --');
  FALLAR = Object.assign(new Error('5 NOT_FOUND: no entity to update'), { code: 5 });
  t('un producto borrado en el medio no es un error', (await escribir({ costo: 1 }, { costo: 2 })).error === null);
  const caido = Object.assign(new Error('14 UNAVAILABLE'), { code: 14 });
  FALLAR = caido;
  t('otro error se relanza: queda como ejecucion fallida en los logs', (await escribir({ costo: 1 }, { costo: 2 })).error === caido);
  FALLAR = null;

  console.log('\n' + ok + ' pasaron, ' + fail + ' fallaron');
  process.exit(fail ? 1 : 0);
})();
