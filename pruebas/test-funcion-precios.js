/**
 * Carga functions/index.js DE VERDAD, con firebase-admin y firebase-functions
 * mockeados, y dispara descontarStockPedido. Prueba el codigo que se desplego.
 */
const path = require('path');
const Module = require('module');
const RAIZ = path.join(__dirname, '..', 'functions');

let PRODUCTOS = {};      /* la coleccion productos */
let PATCH = null;        /* lo que la funcion escribio en el pedido */
let INCREMENTOS = [];    /* los increment() de stock */
/* El documento del pedido tal como esta VIVO en la base cuando corre la transaccion.
   Puede ser distinto de la carga del evento: rateLimitPedidos lo marca con un update
   posterior. Justamente por eso la funcion ya no decide con la carga del evento. */
let PEDIDO_VIVO = null;

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
      /* La funcion lee el pedido VIVO adentro de la transaccion antes que nada. */
      get: async (ref) => {
        if (ref && ref.__col === 'pedidos') return { exists: PEDIDO_VIVO !== null, id: ref.__id, data: () => PEDIDO_VIVO, ref: ref };
        const d = PRODUCTOS[ref.__id];
        return { exists: !!d, id: ref.__id, data: () => d, ref: ref };
      },
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

/* `pedido` es la carga del EVENTO de creacion (congelada). `vivo`, si se pasa, es
   como quedo el documento en la base para cuando corre la transaccion. Son distintos
   cada vez que otra funcion lo actualiza en el medio, que es exactamente el caso que
   rompia las guardas. */
async function correr(pedido, vivo) {
  PATCH = null; INCREMENTOS = [];
  PEDIDO_VIVO = vivo === undefined ? pedido : vivo;
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

  /* Los tres casos que siguen son la razon del arreglo. La funcion decidia con
     `event.data.data()`, que es la carga del evento de CREACION y esta congelada: el
     pedido nace SIEMPRE con stockDescontado:false y sin bloqueadoPorLimite, asi que
     las dos guardas eran inalcanzables. La carga del evento y el documento vivo se
     pasan por separado justamente para poder probar la diferencia. */
  grupo('Caso 9b - la reentrega del mismo evento no descuenta dos veces');
  PRODUCTOS = { y: { nombre: 'Yerba', precio: 10000, costo: 6000, descuento: 0, stock: 20 } };
  const cargaCreacion = { origen: 'web', stockDescontado: false, subtotalProductos: 10000, total: 10000,
    items: [{ id: 'y', nombre: 'Yerba', precio: 10000, cantidad: 1 }] };
  p = await correr(cargaCreacion, Object.assign({}, cargaCreacion, { stockDescontado: true }));
  t('la carga dice false, el documento vivo dice true: no descuenta', p === null && INCREMENTOS.length === 0);

  grupo('Caso 9c - al pedido frenado por rate limit no se le descuenta stock');
  PRODUCTOS = { y: { nombre: 'Yerba', precio: 10000, costo: 6000, descuento: 0, stock: 20 } };
  /* rateLimitPedidos marca el documento con un update POSTERIOR a la creacion, asi
     que el campo no puede estar en la carga del evento. */
  p = await correr(cargaCreacion, Object.assign({}, cargaCreacion, { bloqueadoPorLimite: true }));
  t('no descuenta', p === null && INCREMENTOS.length === 0);

  grupo('Caso 9d - un item cuyo producto ya no existe deja rastro');
  PRODUCTOS = { y: { nombre: 'Yerba', precio: 10000, costo: 6000, descuento: 0, stock: 20 } };
  p = await correr({ origen: 'web', subtotalProductos: 10000, total: 10000,
    items: [{ id: 'y', nombre: 'Yerba', precio: 10000, cantidad: 1 },
            { id: 'borrado', nombre: 'Producto viejo', precio: 5000, cantidad: 2 }] });
  t('anota el id que no existe', !!p.itemsDesconocidos && p.itemsDesconocidos.indexOf('borrado') !== -1);
  t('pide revisar el pedido a mano', p.revisarPrecio === true);
  t('descuenta igual lo que si existe', INCREMENTOS.length === 1 && INCREMENTOS[0].id === 'y');
  t('y no inventa un faltante de stock', !p.stockFaltante);

  grupo('Caso 9e - el pedido borrado mientras tanto no se toca');
  PRODUCTOS = { y: { nombre: 'Yerba', precio: 10000, costo: 6000, descuento: 0, stock: 20 } };
  p = await correr(cargaCreacion, null);
  t('no descuenta ni escribe nada', p === null && INCREMENTOS.length === 0);

  /* La venta por peso y esta funcion se escribieron por separado y nadie las cruzo.
     En un producto a granel el precio es POR KILO y la cantidad va en GRAMOS
     (subtotalCarrito divide por 1000), asi que multiplicar derecho daba el total del
     catalogo x1000 y, como revisarPrecio se marca cuando lo cobrado es menos de la
     mitad del catalogo, TODO pedido con un producto por peso salia marcado como
     sospechoso. Con 0 pedidos en la base no lo habria visto nadie hasta vender. */
  grupo('Caso 9f - producto a granel: precio por kilo, cantidad en gramos');
  PRODUCTOS = { n: { nombre: 'Nueces', tipoVenta: 'peso', precio: 18000, costo: 12000, descuento: 0, stock: 5000 } };
  p = await correr({ origen: 'web', subtotalProductos: 4500, total: 4500,
    items: [{ id: 'n', nombre: 'Nueces', tipoVenta: 'peso', precio: 18000, cantidad: 250 }] });
  t('250 g a $18.000 el kilo son $4.500 de catalogo', p.subtotalCatalogo === 4500, p.subtotalCatalogo);
  t('NO lo marca como sospechoso', !p.revisarPrecio);
  t('la diferencia con lo cobrado es 0', p.diferenciaCatalogo === 0, p.diferenciaCatalogo);
  t('descuenta los gramos del stock', INCREMENTOS.length === 1 && INCREMENTOS[0].patch.stock.__inc === -250);

  grupo('Caso 9g - a granel cobrado por debajo del costo sigue avisando');
  PRODUCTOS = { n: { nombre: 'Nueces', tipoVenta: 'peso', precio: 18000, costo: 12000, descuento: 0, stock: 5000 } };
  p = await correr({ origen: 'web', subtotalProductos: 250, total: 250,
    items: [{ id: 'n', nombre: 'Nueces', tipoVenta: 'peso', precio: 1000, cantidad: 250 }] });
  t('el costo se compara por kilo contra el precio por kilo', p.revisarPrecio === true);
  t('y dice cual fue', !!p.itemsBajoCosto && p.itemsBajoCosto[0].nombre === 'Nueces');

  /* stockFaltante no guardaba tipoVenta, asi que el aviso "Falto stock" del panel decia
     "Nueces (pidio 250, habia 100)" para un producto a granel: los numeros estaban bien,
     la unidad no se decia, y 250 gramos se leen como 250 paquetes. */
  grupo('Caso 9h - el faltante de un granel dice que se vende por peso');
  PRODUCTOS = { n: { nombre: 'Nueces', tipoVenta: 'peso', precio: 18000, costo: 12000, descuento: 0, stock: 100 } };
  p = await correr({ origen: 'web', subtotalProductos: 4500, total: 4500,
    items: [{ id: 'n', nombre: 'Nueces', tipoVenta: 'peso', precio: 18000, cantidad: 250 }] });
  t('anota el faltante', !!p.stockFaltante && p.stockFaltante.length === 1, JSON.stringify(p.stockFaltante));
  t('con los gramos pedidos y los que habia',
    p.stockFaltante[0].pedido === 250 && p.stockFaltante[0].disponible === 100);
  t('y DICE que se vende por peso, para que el panel escriba "250 g"',
    p.stockFaltante[0].tipoVenta === 'peso', p.stockFaltante[0].tipoVenta);

  grupo('Caso 9i - y el de un producto por unidad lo dice tambien');
  PRODUCTOS = { y: { nombre: 'Yerba', precio: 10000, costo: 6000, descuento: 0, stock: 1 } };
  p = await correr({ origen: 'web', subtotalProductos: 40000, total: 40000,
    items: [{ id: 'y', nombre: 'Yerba', precio: 10000, cantidad: 4 }] });
  t('tipoVenta viene como "unidad", no ausente',
    p.stockFaltante[0].tipoVenta === 'unidad', p.stockFaltante[0].tipoVenta);

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
