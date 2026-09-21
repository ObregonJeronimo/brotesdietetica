/* ESCANEAR HACE LO QUE CORRESPONDE A DONDE ESTA PARADO EL CAJERO
   =============================================================================
   Pedido del duenio (21/09). Sin ningun modal abierto:
     en Ventas    -> abre una venta nueva con el producto ya cargado
     en Productos -> abre su ficha
     en otra seccion -> pregunta, porque adivinar ahi es meter al cajero en una
                        venta que no queria, o sacarlo de lo que estaba haciendo.
   Se corre admin-lector.js DE VERDAD en un vm, con el panel de mentira, y se
   mira a quien termina llamando. */
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'admin-lector.js'), 'utf8');

let ok = 0, mal = 0;
const t = (d, c, extra) => {
  if (c) { ok++; console.log('  OK   ' + d + (extra ? '   (' + extra + ')' : '')); }
  else { mal++; console.log('  FALLA ' + d + (extra ? '   (' + extra + ')' : '')); }
};

const PROD = { id: 'p1', nombre: 'Yerba', codigo: '000123', codigoBarras: '7790001234567', tipoVenta: 'unidad' };

let seccion = '';            /* que seccion esta activa */
let modalAbierto = null;     /* que modal esta abierto, si hay alguno */
let LLAMADAS = [];
let RESPUESTA = true;        /* lo que contesta el cajero en la pregunta */

function nuevoContexto() {
  LLAMADAS = [];
  const doc = {
    addEventListener() {},
    getElementById: (id) => (modalAbierto === id ? { classList: { contains: () => true } } : null),
    querySelector: (sel) => {
      if (sel === '.section-content.active') return seccion ? { id: seccion } : null;
      if (sel === '.modal-overlay.show') return modalAbierto ? {} : null;
      return null;
    },
    querySelectorAll: () => []
  };
  const sb = {
    console, document: doc, window: {}, setTimeout, clearTimeout, Date,
    allProducts: [PROD],
    db: { collection: () => ({ where: () => ({ limit: () => ({ get: async () => ({ docs: [] }) }) }) }) },
    auth: { currentUser: { email: 'p@local' } },
    showAdminToast: (m) => LLAMADAS.push('toast'),
    switchSection: (s) => LLAMADAS.push('switchSection:' + s),
    openModal: (id) => LLAMADAS.push('openModal:' + id),
    openVentaModal: () => { LLAMADAS.push('openVentaModal'); modalAbierto = 'ventaModal'; },
    addVentaItem: (id) => { LLAMADAS.push('addVentaItem:' + id); },
    addVentaMayItem: () => {},
    esc: s => String(s == null ? '' : s),
    pedirConfirmacion: (msg, opts) => {
      LLAMADAS.push('pregunta:' + (opts && opts.aceptar) + '|' + (opts && opts.cancelar));
      return Promise.resolve(RESPUESTA);
    }
  };
  sb.globalThis = sb;
  vm.createContext(sb);
  vm.runInContext(SRC, sb, { filename: 'admin-lector.js' });
  return sb;
}

async function escanear(sec, modal) {
  seccion = sec; modalAbierto = modal || null;
  const sb = nuevoContexto();
  await vm.runInContext("procesarCodigoLeido('7790001234567')", sb);
  await new Promise(r => setTimeout(r, 10));   /* la pregunta resuelve en una promesa */
  return LLAMADAS.slice();
}

(async () => {
  console.log('\nParado en VENTAS: se abre la venta con el producto adentro');
  let c = await escanear('sec-ventas');
  t('abre el modal de venta', c.includes('openVentaModal'), c.join(' + '));
  t('y le carga el producto', c.includes('addVentaItem:p1'));
  t('no se va a Productos', !c.some(x => x.indexOf('switchSection') === 0));

  console.log('\nParado en PRODUCTOS: se abre la ficha');
  c = await escanear('sec-products');
  t('va a Productos', c.includes('switchSection:products'), c.join(' + '));
  t('y abre la ficha', c.includes('openModal:p1'));
  t('no abre ninguna venta', !c.includes('openVentaModal'));

  console.log('\nEn otra seccion: se pregunta, no se adivina');
  RESPUESTA = true;
  c = await escanear('sec-caja');
  t('pregunta antes de hacer nada', c.some(x => x.indexOf('pregunta:') === 0), c.join(' + '));
  t('y ofrece las dos salidas', c.some(x => x.indexOf('pregunta:Cargarlo en una venta|Ver su ficha') === 0));
  t('si dice que si, vende', c.includes('openVentaModal') && c.includes('addVentaItem:p1'));
  RESPUESTA = false;
  c = await escanear('sec-stats');
  t('si dice que no, abre la ficha', c.includes('openModal:p1') && !c.includes('openVentaModal'), c.join(' + '));

  console.log('\nLo de antes sigue igual');
  c = await escanear('sec-ventas', 'ventaModal');
  t('con la venta YA abierta no la vuelve a abrir', !c.includes('openVentaModal') && c.includes('addVentaItem:p1'), c.join(' + '));
  c = await escanear('sec-config', 'cupModal');
  t('con otro modal abierto no toca nada, solo avisa',
    c.length === 1 && c[0] === 'toast', c.join(' + '));

  console.log('\n' + ok + ' pasaron, ' + mal + ' fallaron');
  process.exit(mal ? 1 : 0);
})().catch(e => { console.error('  EXPLOTO: ' + e.message); console.log('\n' + ok + ' pasaron, ' + (mal + 1) + ' fallaron'); process.exit(1); });
