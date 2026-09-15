/**
 * REGISTRAR REPOSICION: stockSubioEn CUANDO EL STOCK SUBE.
 *
 * La seccion Depuracion necesita saber cuando se repuso cada producto para el
 * criterio "Sin reposicion". Lo anota la Cloud Function registrarReposicion, que
 * escucha toda escritura en productos/{id}: compra, Stock, edicion, Importar Nuevos,
 * la devolucion de un pedido o de una venta borrada, todo termina en una escritura
 * del producto, asi que ningun camino se puede olvidar de anotarlo.
 *
 * LO QUE ESTA PRUEBA CUIDA
 * 1. Que anote cuando el stock sube, tambien en un alta con stock, y aunque siga en 0
 *    o negativo. Hay productos con stock negativo: una compra de -3 a -1 es mercaderia
 *    que entro, y pidiendo que quedara positivo salia candidato a depurar recien comprado.
 * 2. Que no anote cuando baja, queda igual, un alta viene sin stock o se borra el producto.
 * 3. Que su propia escritura no la vuelva a disparar: solo cambia stockSubioEn y el
 *    stock queda igual. (En el emulador, con la funcion de verdad:
 *    npm run test:reposicion.)
 * 4. Que un producto borrado en el medio no sea un error, y que cualquier otro error se
 *    relance: queda como ejecucion fallida en los logs, en vez de tragarse.
 *
 * Carga functions/index.js de verdad, con firebase-admin y firebase-functions
 * simulados, igual que test-funcion-precios.js.
 */
const path = require('path');
const Module = require('module');
const RAIZ = path.join(__dirname, '..', 'functions');

const OPCIONES = {};
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
    const registrar = (o, f) => { if (o && o.document) OPCIONES[o.document] = o; return f; };
    return { onDocumentCreated: registrar, onDocumentWritten: registrar };
  }
  return originalLoad.apply(this, arguments);
};
const mod = require(path.join(RAIZ, 'index.js'));
Module._load = originalLoad;
const fn = mod.registrarReposicion;

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
/* Una escritura del producto: como estaba antes (null = no existia) y como quedo (null = se borro). */
async function escribir(antes, despues) {
  ESCRITURAS = [];
  let error = null;
  try { await fn({ data: { before: doc(antes), after: doc(despues) }, params: { productoId: 'p1' } }); }
  catch (e) { error = e; }
  return { escrituras: ESCRITURAS, error };
}
const anoto = r => r.escrituras.length === 1 && Object.keys(r.escrituras[0]).join() === 'stockSubioEn' &&
  r.escrituras[0].stockSubioEn.__serverTimestamp === true;

(async () => {
  console.log('\n-- donde escucha --');
  t('la funcion existe', typeof fn === 'function');
  const op = OPCIONES['productos/{productoId}'];
  t('escucha productos/{productoId}', !!op);
  t('en southamerica-east1, la region de Firestore', !!op && op.region === 'southamerica-east1', op && op.region);
  /* Reintentar se cobra y exige --force al desplegar: queda para que lo decida el comercio. */
  t('sin reintento automatico, hasta que se decida', !!op && op.retry !== true, op && op.retry);

  console.log('\n-- anota --');
  t('cuando el stock sube (una compra)', anoto(await escribir({ nombre: 'Mani', stock: 5 }, { nombre: 'Mani', stock: 12 })));
  t('  solo stockSubioEn, con la hora del servidor', anoto(await escribir({ stock: 1 }, { stock: 2 })));
  t('en un alta que ya trae stock', anoto(await escribir(null, { nombre: 'Chia', stock: 10 })));
  t('con el stock guardado como texto', anoto(await escribir({ stock: '3' }, { stock: '7' })));
  t('saliendo de un stock negativo a uno positivo', anoto(await escribir({ stock: -2 }, { stock: 3 })));
  t('de -3 a -1: entro mercaderia aunque siga en negativo', anoto(await escribir({ stock: -3 }, { stock: -1 })));
  t('  y de -2 a 0', anoto(await escribir({ stock: -2 }, { stock: 0 })));
  t('en los de peso, que guardan gramos', anoto(await escribir({ tipoVenta: 'peso', stock: 500 }, { tipoVenta: 'peso', stock: 5500 })));

  console.log('\n-- no anota --');
  t('cuando el stock baja (una venta)', (await escribir({ stock: 12 }, { stock: 5 })).escrituras.length === 0);
  t('cuando cambia otra cosa', (await escribir({ stock: 5, precio: 100 }, { stock: 5, precio: 120 })).escrituras.length === 0);
  t('en un alta sin stock', (await escribir(null, { nombre: 'Nuevo', stock: 0 })).escrituras.length === 0);
  t('en un alta con stock negativo', (await escribir(null, { nombre: 'Nuevo', stock: -4 })).escrituras.length === 0);
  t('cuando se borra el producto', (await escribir({ stock: 5 }, null)).escrituras.length === 0);
  t('con su propia escritura: no se dispara en bucle',
    (await escribir({ stock: 12 }, { stock: 12, stockSubioEn: { seconds: 1 } })).escrituras.length === 0);

  console.log('\n-- errores --');
  FALLAR = Object.assign(new Error('5 NOT_FOUND: no entity to update'), { code: 5 });
  t('un producto borrado en el medio no es un error', (await escribir({ stock: 1 }, { stock: 2 })).error === null);
  const caido = Object.assign(new Error('14 UNAVAILABLE'), { code: 14 });
  FALLAR = caido;
  t('otro error se relanza: queda como ejecucion fallida en los logs', (await escribir({ stock: 1 }, { stock: 2 })).error === caido);
  FALLAR = null;

  console.log('\n' + ok + ' pasaron, ' + fail + ' fallaron');
  process.exit(fail ? 1 : 0);
})();
