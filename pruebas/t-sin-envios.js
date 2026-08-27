/**
 * BROTES NO HACE ENVIOS — PERO LA CAPACIDAD TIENE QUE SEGUIR VIVA.
 *
 * Decision del comercio (27/08/2026): `config/pedidos.haceEnvios` queda en **false**.
 * No se saca el codigo de envios: se apaga por configuracion, para poder prenderlo mas
 * adelante desde Editor Web -> Pedidos y envio sin tocar una linea.
 *
 * Eso convierte dos cosas en contrato, y hasta ahora ninguna tenia prueba del lado de la
 * TIENDA (las cuatro suites que nombraban haceEnvios son todas del panel):
 *
 *   1. Con haceEnvios:false, en toda la tienda **solo existe el retiro**. Si esto se
 *      rompe, el cliente elige "envio a domicilio", paga flete, deja una direccion, y el
 *      comercio recibe un pedido que no puede cumplir. El campo `tipoEntrega` del pedido
 *      es lo que despues lee el panel, el ticket y la factura.
 *   2. Con haceEnvios:true **todo tiene que volver a funcionar**, que es justamente para
 *      lo que se deja el codigo puesto.
 *
 * Se ejecutan las funciones REALES de app.js, incluida loadPedidosConfig leyendo la
 * config de una base de mentira: asi se prueba tambien que el valor de Firestore mande
 * sobre el default del archivo (que es `true`).
 */
const fs = require('fs');
const src = fs.readFileSync('app.js', 'utf8');

function cuerpo(nombre) {
  let i = src.indexOf('function ' + nombre + '(');
  if (i < 0) throw new Error('no encontre ' + nombre);
  if (src.slice(Math.max(0, i - 6), i) === 'async ') i -= 6;
  let prof = 0, k;
  for (k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') prof++;
    else if (src[k] === '}') { prof--; if (!prof) break; }
  }
  return src.slice(i, k + 1);
}

/* PEDIDOS no es una funcion: es el objeto de defaults del archivo. Se lleva el REAL
   para que la prueba use los mismos valores de fabrica que la tienda. */
function objeto(nombre) {
  const i = src.indexOf('const ' + nombre + ' = {');
  if (i < 0) throw new Error('no encontre el objeto ' + nombre);
  let prof = 0, k;
  for (k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') prof++;
    else if (src[k] === '}') { prof--; if (!prof) break; }
  }
  return src.slice(i, k + 1) + ';';
}

let ok = 0, fail = 0;
const t = (d, c, extra) => {
  if (c) { ok++; console.log('  OK   ' + d); }
  else { fail++; console.log('  FALLA ' + d + (extra !== undefined ? '   [' + extra + ']' : '')); }
};

const FUNCIONES = ['_num', 'costoEnvio', 'loadPedidosConfig', 'aplicarModoEntrega',
  'setCheckoutEntrega', 'updateCheckoutResumen', 'esPesoProd', 'subtotalCarrito',
  'esc', 'fmtGramos', 'formatPrice'].map(cuerpo).join('\n');

/* Un carrito con un granel y un producto por unidad. */
const CARRITO = [
  { id: 'nuez', nombre: 'Nueces mariposa', precio: 18000, cantidad: 300, tipoVenta: 'peso' },
  { id: 'chia', nombre: 'Semillas Chía', precio: 2300, cantidad: 2, tipoVenta: 'unidad' },
];

function armar(configEnLaBase) {
  const DOM = {};
  const ventana = {};
  const elem = id => (DOM[id] = DOM[id] || {
    _id: id, value: '', innerHTML: '', textContent: '',
    style: { display: '' },
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    /* setCheckoutEntrega le pone y le saca `required` al campo de direccion segun el
       tipo de entrega: sin envios ese campo no puede quedar obligatorio. */
    _attrs: {},
    getAttribute(a) { return this._attrs[a] === undefined ? null : this._attrs[a]; },
    setAttribute(a, v) { this._attrs[a] = String(v); },
    removeAttribute(a) { delete this._attrs[a]; },
  });
  const ent = {
    window: ventana,
    document: {
      getElementById: elem,
      querySelector: sel => elem('sel:' + sel),
      querySelectorAll: () => [],
      createElement: () => {
        const o = { _t: '' };
        Object.defineProperty(o, 'textContent', { get: () => o._t, set: v => { o._t = v; } });
        Object.defineProperty(o, 'innerHTML', {
          get: () => String(o._t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
          set: v => { o._t = v; } });
        return o;
      },
    },
    updateCartUI: () => {},
    console: { log() {}, warn() {} },
    db: { collection: () => ({ doc: () => ({
      get: async () => ({ exists: configEnLaBase !== null, data: () => configEnLaBase }) }) }) },
  };
  const nombres = Object.keys(ent);
  const api = new Function(...nombres,
    'let carrito=' + JSON.stringify(CARRITO) + ',_cuponAplicado=null;\n' +
    objeto('PEDIDOS') + '\n' + FUNCIONES +
    '\nreturn {cargarConfig:loadPedidosConfig,PEDIDOS:PEDIDOS,costoEnvio:costoEnvio,' +
    'aplicarModoEntrega:aplicarModoEntrega,setEntrega:setCheckoutEntrega,' +
    'resumen:updateCheckoutResumen,' +
    /* La MISMA expresion con la que confirmCheckout arma el campo tipoEntrega del pedido. */
    'tipoEntregaDelPedido:function(){return PEDIDOS.haceEnvios?(window._chkTipoEntrega||"envio"):"retiro";}};'
  )(...nombres.map(n => ent[n]));
  return { api, DOM, ventana };
}

(async () => {
  console.log('\nEL DEFAULT DEL ARCHIVO ES true — manda la base, no el archivo');
  let a = armar(null);
  t('sin documento en config, queda el default del archivo', a.api.PEDIDOS.haceEnvios === true);

  console.log('\nCONFIG DE PRODUCCION: haceEnvios false');
  /* Copia exacta de config/pedidos de produccion hoy. */
  const PROD = { haceEnvios: false, descontarStock: true, minimoPedido: 30000,
                 envioPrecio: 2000, envioGratisActivo: false, envioGratisDesde: 100000 };
  a = armar(PROD);
  await a.api.cargarConfig();
  t('el valor de Firestore pisa el default del archivo', a.api.PEDIDOS.haceEnvios === false);

  t('no se cobra flete ni con un carrito enorme', a.api.costoEnvio(999999, 'envio') === 0,
    '$' + a.api.costoEnvio(999999, 'envio'));
  t('   ni pidiendo envio a mano', a.api.costoEnvio(1000, 'envio') === 0);

  t('el selector de entrega queda escondido',
    a.DOM['sel:.chk-entrega-toggle'].style.display === 'none',
    a.DOM['sel:.chk-entrega-toggle'].style.display);
  t('y la entrega queda forzada en retiro', a.ventana._chkTipoEntrega === 'retiro',
    a.ventana._chkTipoEntrega);

  a.api.setEntrega('envio');
  t('llamar a setCheckoutEntrega("envio") a mano NO alcanza',
    a.ventana._chkTipoEntrega === 'retiro', a.ventana._chkTipoEntrega);
  t('   y el pedido igual saldria como retiro',
    a.api.tipoEntregaDelPedido() === 'retiro', a.api.tipoEntregaDelPedido());

  a.api.resumen();
  let r = a.DOM.chkResumen.innerHTML;
  t('el resumen del checkout dice "Retiro en local"', /Retiro en local/.test(r));
  t('   y NO ofrece envio', !/Env[ií]o/.test(r), r.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').slice(0, 160));
  t('el total es solo la mercaderia: $10.000 ($5.400 del granel + $4.600)', /TOTAL[\s\S]*?10\.000/.test(r),
    r.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').slice(-90));
  t('el granel sigue diciendo 300 g y $5.400, no millones',
    /300 g/.test(r) && /5\.400/.test(r) && !/5\.400\.000/.test(r));

  console.log('\nY SI MAÑANA SE PRENDE, TIENE QUE VOLVER A ANDAR');
  a = armar({ haceEnvios: true, envioPrecio: 2000, envioGratisActivo: true,
              envioGratisDesde: 100000, minimoPedido: 30000, descontarStock: true });
  await a.api.cargarConfig();
  t('la config lo prende', a.api.PEDIDOS.haceEnvios === true);
  t('el selector se muestra de nuevo',
    a.DOM['sel:.chk-entrega-toggle'].style.display === '', a.DOM['sel:.chk-entrega-toggle'].style.display);
  t('y arranca en envio, no en retiro', a.ventana._chkTipoEntrega !== 'retiro' ||
    a.api.tipoEntregaDelPedido() === 'envio', a.ventana._chkTipoEntrega);

  a.api.setEntrega('envio');
  t('elegir envio ahora SI se respeta', a.ventana._chkTipoEntrega === 'envio', a.ventana._chkTipoEntrega);
  t('se cobra el flete', a.api.costoEnvio(10000, 'envio') === 2000, '$' + a.api.costoEnvio(10000, 'envio'));
  t('y arriba del minimo es gratis', a.api.costoEnvio(150000, 'envio') === 0,
    '$' + a.api.costoEnvio(150000, 'envio'));
  t('retiro sigue sin cargo', a.api.costoEnvio(10000, 'retiro') === 0);

  a.api.resumen();
  r = a.DOM.chkResumen.innerHTML;
  t('el resumen vuelve a mostrar el envio', /Env[ií]o/.test(r));
  t('y el total lo suma: $12.000', /TOTAL[\s\S]*?12\.000/.test(r),
    r.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').slice(-90));

  a.api.setEntrega('retiro');
  a.api.resumen();
  r = a.DOM.chkResumen.innerHTML;
  t('y elegir retiro con envios prendidos tambien anda',
    /Retiro en local/.test(r) && /10\.000/.test(r) && !/Env[ií]o/.test(r));

  console.log('\n' + ok + ' pasaron, ' + fail + ' fallaron');
  process.exit(fail ? 1 : 0);
})();
