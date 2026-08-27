/**
 * Carga functions/index.js DE VERDAD, con firebase-admin y firebase-functions
 * mockeados, y dispara descontarStockPedido. Prueba el codigo que se desplego.
 */
const path = require('path');
const Module = require('module');
const RAIZ = 'C:/Users/Usuario/Documents/brotesdietetica/functions';

let PRODUCTOS = {};      /* la coleccion productos */
let PATCH = null;        /* lo que la funcion escribio en el pedido */
let INCREMENTOS = [];    /* los increment() de stock */

const FieldValue = { increment: (n) => ({ __inc: n }) };

function crearDb() {
  return {
    collection: (col) => ({
      doc: (id) => ({
        __col: col, __id: id,
        get: async () => {
          if (col === 'config') return { exists: false, data: () => ({}) };
          const d = PRODUCTOS[id];
          return { exists: !!d, id: id, data: () => d, ref: { __col: col, __id: id } };
        }
      })
    }),
    runTransaction: async (fn) => fn({
      getAll: async (...refs) => refs.map(r => {
        const d = PRODUCTOS[r.__id];
        return { exists: !!d, id: r.__id, data: () => d, ref: r };
      }),
      update: (ref, patch) => {
        if (ref && ref.__col === 'productos') INCREMENTOS.push({ id: ref.__id, patch: patch });
        else PATCH = patch;
      }
    })
  };
}

const originalLoad = Module._load;
Module._load = function (req) {
  if (req === 'firebase-admin') {
    return { initializeApp: () => {}, firestore: Object.assign(() => crearDb(), { FieldValue: FieldValue }), storage: () => ({ bucket: () => ({ getFiles: async () => [[], null] }) }) };
  }
  if (req === 'firebase-functions') return { logger: { info(){}, warn(){}, error(){} } };
  if (req === 'firebase-functions/v1') {
    /* .auth es una PROPIEDAD, no un metodo: functionsV1.region(x).auth.user().onCreate(f) */
    const v1 = { auth: { user: () => ({ onCreate: (f) => f }) } };
    v1.region = () => v1;
    v1.runWith = () => v1;
    return v1;
  }
  if (req === 'firebase-functions/v2/storage') {
    return { onObjectFinalized: (o, f) => f, onObjectDeleted: (o, f) => f };
  }
  if (req === 'firebase-functions/v2/firestore') {
    return { onDocumentCreated: (opts, fn) => fn, onDocumentWritten: (opts, fn) => fn };
  }
  return originalLoad.apply(this, arguments);
};

const mod = require(path.join(RAIZ, 'index.js'));
Module._load = originalLoad;
const fn = mod.descontarStockPedido;

let ok = 0, fail = 0;
function t(n, c) { if (c) { ok++; console.log('  OK   ' + n); } else { fail++; console.log('  FALLA ' + n); } }
function grupo(n) { console.log('\n' + n); }

async function correr(pedido) {
  PATCH = null; INCREMENTOS = [];
  await fn({ data: { data: () => pedido, ref: { __col: 'pedidos', __id: 'ped1' } }, params: { pedidoId: 'ped1' } });
  return PATCH;
}

(async () => {
  grupo('Caso 1 - pedido web normal, precio de catalogo');
  PRODUCTOS = { y: { nombre: 'Yerba 1kg', precio: 10000, costo: 6000, descuento: 0, stock: 20 } };
  let p = await correr({ origen: 'web', subtotalProductos: 10000, total: 10000,
    items: [{ id: 'y', nombre: 'Yerba 1kg', precio: 10000, cantidad: 1 }] });
  t('descuenta el stock', INCREMENTOS.length === 1 && INCREMENTOS[0].patch.stock.__inc === -1);
  t('marca stockDescontado', p.stockDescontado === true);
  t('guarda el total de catalogo', p.subtotalCatalogo === 10000);
  t('SIN aviso de precio', !p.revisarPrecio);
  t('diferencia 0', p.diferenciaCatalogo === 0);

  grupo('Caso 2 - pagina abierta desde antes de un aumento (legitimo)');
  PRODUCTOS = { y: { nombre: 'Yerba 1kg', precio: 10000, costo: 6000, descuento: 0, stock: 20 } };
  p = await correr({ origen: 'web', subtotalProductos: 8000, total: 8000,
    items: [{ id: 'y', nombre: 'Yerba 1kg', precio: 8000, cantidad: 1 }] });
  t('NO molesta al comercio', !p.revisarPrecio);
  t('pero deja la diferencia anotada', p.diferenciaCatalogo === 2000);
  t('sin itemsBajoCosto', !p.itemsBajoCosto);

  grupo('Caso 3 - carrito tocado desde la consola');
  PRODUCTOS = { y: { nombre: 'Yerba 1kg', precio: 10000, costo: 6000, descuento: 0, stock: 20 } };
  p = await correr({ origen: 'web', subtotalProductos: 1, total: 1,
    items: [{ id: 'y', nombre: 'Yerba 1kg', precio: 1, cantidad: 1 }] });
  t('lo marca', p.revisarPrecio === true);
  t('y dice cual', p.itemsBajoCosto && p.itemsBajoCosto.length === 1);
  t('con el nombre', p.itemsBajoCosto[0].nombre === 'Yerba 1kg');
  t('lo cobrado', p.itemsBajoCosto[0].cobrado === 1);
  t('y el costo real', p.itemsBajoCosto[0].costo === 6000);
  t('igual descuenta el stock', INCREMENTOS.length === 1);

  grupo('Caso 4 - baja muy fuerte pero por encima del costo');
  PRODUCTOS = { y: { nombre: 'Yerba 1kg', precio: 20000, costo: 6000, descuento: 0, stock: 20 } };
  p = await correr({ origen: 'web', subtotalProductos: 6500, total: 6500,
    items: [{ id: 'y', nombre: 'Yerba 1kg', precio: 6500, cantidad: 1 }] });
  t('no hay items bajo costo', !p.itemsBajoCosto);
  t('pero el total quedo bajo la mitad: aviso flojo', p.revisarPrecio === true);

  grupo('Caso 5 - producto sin costo cargado (no se puede comparar)');
  PRODUCTOS = { y: { nombre: 'Sin costo', precio: 10000, costo: 0, descuento: 0, stock: 20 } };
  p = await correr({ origen: 'web', subtotalProductos: 1, total: 1,
    items: [{ id: 'y', nombre: 'Sin costo', precio: 1, cantidad: 1 }] });
  t('no inventa un itemBajoCosto', !p.itemsBajoCosto);
  t('cae al aviso por total', p.revisarPrecio === true);

  grupo('Caso 6 - dos items, uno solo manipulado');
  PRODUCTOS = { a: { nombre: 'Yerba', precio: 10000, costo: 6000, descuento: 0, stock: 20 },
                b: { nombre: 'Miel', precio: 5000, costo: 3000, descuento: 0, stock: 20 } };
  p = await correr({ origen: 'web', subtotalProductos: 10002, total: 10002,
    items: [{ id: 'a', nombre: 'Yerba', precio: 10000, cantidad: 1 },
            { id: 'b', nombre: 'Miel', precio: 2, cantidad: 1 }] });
  t('senala solo el manipulado', p.itemsBajoCosto.length === 1);
  t('y es la Miel', p.itemsBajoCosto[0].nombre === 'Miel');
  t('descuenta los dos', INCREMENTOS.length === 2);

  grupo('Caso 7 - el descuento del catalogo cuenta como precio valido');
  PRODUCTOS = { y: { nombre: 'Yerba', precio: 10000, costo: 6000, descuento: 30, stock: 20 } };
  p = await correr({ origen: 'web', subtotalProductos: 7000, total: 7000,
    items: [{ id: 'y', nombre: 'Yerba', precio: 7000, cantidad: 1 }] });
  t('catalogo con 30% off = 7000', p.subtotalCatalogo === 7000);
  t('sin aviso', !p.revisarPrecio);

  grupo('Caso 8 - lo que no es web no se toca');
  PRODUCTOS = { y: { nombre: 'Yerba', precio: 10000, costo: 6000, stock: 20 } };
  p = await correr({ origen: 'mostrador', subtotalProductos: 1, total: 1,
    items: [{ id: 'y', precio: 1, cantidad: 1 }] });
  t('ni descuenta ni marca', p === null && INCREMENTOS.length === 0);

  grupo('Caso 9 - idempotencia');
  p = await correr({ origen: 'web', stockDescontado: true, subtotalProductos: 1, total: 1,
    items: [{ id: 'y', precio: 1, cantidad: 1 }] });
  t('si ya se desconto, no lo vuelve a hacer', p === null && INCREMENTOS.length === 0);

  grupo('Caso 10 - cantidades: el costo se compara por UNIDAD');
  PRODUCTOS = { y: { nombre: 'Yerba', precio: 10000, costo: 6000, descuento: 0, stock: 20 } };
  p = await correr({ origen: 'web', subtotalProductos: 70000, total: 70000,
    items: [{ id: 'y', nombre: 'Yerba', precio: 7000, cantidad: 10 }] });
  t('10 unidades a 7000 (sobre costo) no molesta', !p.revisarPrecio);
  t('catalogo x10 = 100000', p.subtotalCatalogo === 100000);
  t('descuenta las 10', INCREMENTOS[0].patch.stock.__inc === -10);

  console.log('\n' + ok + ' pasaron, ' + fail + ' fallaron');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('EXPLOTO:', e); process.exit(1); });
