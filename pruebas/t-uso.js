/* Carga functions/index.js DE VERDAD y dispara las tres funciones del contador,
   con firebase-admin mockeado. Prueba el codigo que se desplego. */
const path = require('path');
const Module = require('module');
const RAIZ = 'C:/Users/Usuario/Documents/brotesdietetica/functions';

let ESCRITO = null;
let ARCHIVOS = [];
let PAGINAS_PEDIDAS = 0;

const FieldValue = {
  increment: (n) => ({ __inc: n }),
  serverTimestamp: () => ({ __ts: true })
};

function crearDb() {
  return {
    collection: () => ({
      doc: () => ({
        set: async (data) => { ESCRITO = data; },
        get: async () => ({ exists: false, data: () => ({}) })
      })
    }),
    runTransaction: async (fn) => fn({ getAll: async () => [], update: () => {} })
  };
}
function crearStorage() {
  return {
    bucket: () => ({
      /* Imita la paginacion real: 1000 por pagina y un token para seguir. */
      getFiles: async (opts) => {
        PAGINAS_PEDIDAS++;
        const desde = opts.pageToken ? Number(opts.pageToken) : 0;
        const trozo = ARCHIVOS.slice(desde, desde + 1000);
        const sig = desde + 1000 < ARCHIVOS.length ? { pageToken: String(desde + 1000) } : null;
        return [trozo, sig];
      }
    })
  };
}

const originalLoad = Module._load;
Module._load = function (req) {
  if (req === 'firebase-admin') {
    return {
      initializeApp: () => {},
      firestore: Object.assign(() => crearDb(), { FieldValue }),
      storage: () => crearStorage()
    };
  }
  if (req === 'firebase-functions') return { logger: { info(){}, warn(){}, error(){} } };
  if (req === 'firebase-functions/v1') {
    const v1 = { auth: { user: () => ({ onCreate: (f) => f }) } };
    v1.region = () => v1; v1.runWith = () => v1;
    return v1;
  }
  if (req === 'firebase-functions/v2/firestore') {
    return { onDocumentCreated: (o, f) => f, onDocumentWritten: (o, f) => f };
  }
  if (req === 'firebase-functions/v2/storage') {
    return { onObjectFinalized: (o, f) => f, onObjectDeleted: (o, f) => f };
  }
  return originalLoad.apply(this, arguments);
};
const mod = require(path.join(RAIZ, 'index.js'));
Module._load = originalLoad;

let ok = 0, fail = 0;
const t = (d, c) => { if (c) { ok++; console.log('  OK   ' + d); } else { fail++; console.log('  FALLA ' + d); } };
const grupo = (n) => console.log('\n' + n);

(async () => {
  grupo('Al subir un archivo');
  ESCRITO = null;
  await mod.sumarUsoStorage({ data: { size: 250000 } });
  t('suma los bytes', ESCRITO && ESCRITO.bytes.__inc === 250000);
  t('y cuenta un archivo mas', ESCRITO.archivos.__inc === 1);
  t('se marca como no exacto', ESCRITO.exacto === false);
  ESCRITO = null;
  await mod.sumarUsoStorage({ data: { size: 0 } });
  t('un archivo de 0 bytes no escribe nada', ESCRITO === null);
  ESCRITO = null;
  await mod.sumarUsoStorage({ data: null });
  t('un evento sin datos no rompe', ESCRITO === null);

  grupo('Al borrar un archivo');
  ESCRITO = null;
  await mod.restarUsoStorage({ data: { size: 250000 } });
  t('resta los bytes', ESCRITO && ESCRITO.bytes.__inc === -250000);
  t('y descuenta el archivo', ESCRITO.archivos.__inc === -1);

  grupo('El recalculo exacto');
  ESCRITO = null;
  await mod.recalcularUsoStorage({ data: { after: { data: () => ({ recalcular: false }) } } });
  t('sin pedirlo, no hace nada', ESCRITO === null);
  ESCRITO = null;
  await mod.recalcularUsoStorage({ data: { after: { data: () => ({ bytes: 5, exacto: true }) } } });
  t('tras escribir su propio resultado tampoco (no hay bucle)', ESCRITO === null);
  ESCRITO = null;
  await mod.recalcularUsoStorage({ data: { after: null } });
  t('un documento borrado no rompe', ESCRITO === null);

  grupo('Contando el bucket');
  ARCHIVOS = [{ metadata: { size: '1000' } }, { metadata: { size: '2500' } }, { metadata: { size: 500 } }];
  PAGINAS_PEDIDAS = 0; ESCRITO = null;
  await mod.recalcularUsoStorage({ data: { after: { data: () => ({ recalcular: true }) } } });
  t('suma los tres: 4000 bytes', ESCRITO && ESCRITO.bytes === 4000);
  t('cuenta 3 archivos', ESCRITO.archivos === 3);
  t('el tamaño como texto tambien suma', ESCRITO.bytes === 4000);
  t('queda marcado como exacto', ESCRITO.exacto === true);
  t('y apaga el pedido', ESCRITO.recalcular === false);
  t('una sola pagina', PAGINAS_PEDIDAS === 1);

  grupo('Con muchos archivos (paginacion)');
  ARCHIVOS = Array.from({ length: 2500 }, () => ({ metadata: { size: 1000 } }));
  PAGINAS_PEDIDAS = 0; ESCRITO = null;
  await mod.recalcularUsoStorage({ data: { after: { data: () => ({ recalcular: true }) } } });
  t('2.500 archivos = 2.500.000 bytes', ESCRITO.bytes === 2500000);
  t('los cuenta a todos', ESCRITO.archivos === 2500);
  t('en 3 paginas, no 2.500 peticiones', PAGINAS_PEDIDAS === 3);

  grupo('Bordes');
  ARCHIVOS = [];
  ESCRITO = null;
  await mod.recalcularUsoStorage({ data: { after: { data: () => ({ recalcular: true }) } } });
  t('bucket vacio da 0 y no rompe', ESCRITO.bytes === 0 && ESCRITO.archivos === 0);
  ARCHIVOS = [{ metadata: { size: 100 } }, { metadata: {} }, { metadata: { size: 'x' } }, {}];
  ESCRITO = null;
  await mod.recalcularUsoStorage({ data: { after: { data: () => ({ recalcular: true }) } } });
  t('los que no informan tamaño se ignoran', ESCRITO.bytes === 100 && ESCRITO.archivos === 1);

  console.log('\n' + ok + ' pasaron, ' + fail + ' fallaron');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('EXPLOTO:', e); process.exit(1); });
