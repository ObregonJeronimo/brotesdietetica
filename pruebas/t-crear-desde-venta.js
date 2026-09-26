/* CREAR UN PRODUCTO EN EL MEDIO DE UNA VENTA
   =============================================================================
   Lo que probó el dueño el 21/09, escaneando de verdad: con una venta abierta,
   escanear un código de barras desconocido muestra el modal "a qué producto
   corresponde" encima de la venta -eso andaba-, pero al elegir **crearlo** la
   ficha del producto nuevo se abría DETRÁS de la venta. Parecía que el botón no
   hacía nada.

   EL MOTIVO: todos los `.modal-overlay` comparten `z-index: 200`, así que
   desempata el orden del HTML, y ahí `productModal` está ANTES que `ventaModal`.
   La venta pinta encima. No se arregla moviendo HTML -romper ese orden toca
   todo- sino levantando la ficha cuando se abre sobre algo.

   Y de paso: con una venta abierta no se cambia de sección -al cerrar la ficha
   hay que volver a la venta, no quedar parado en Productos- y el producto recién
   creado entra solo a la venta, que era el paso de más (guardar, cerrar, volver
   a escanear) justo con la pistola en la mano.
   ============================================================================= */
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const RAIZ = path.join(__dirname, '..');
const LECTOR = fs.readFileSync(path.join(RAIZ, 'admin-lector.js'), 'utf8');
const HTML = fs.readFileSync(path.join(RAIZ, 'admin.html'), 'utf8');

let ok = 0, mal = 0;
const t = (d, c, extra) => {
  if (c) { ok++; console.log('  OK   ' + d + (extra ? '   (' + extra + ')' : '')); }
  else { mal++; console.log('  FALLA ' + d + (extra ? '   (' + extra + ')' : '')); }
};
const grupo = n => console.log('\n' + n);
const fnDe = (nombre, sb) => {
  try { const f = vm.runInContext(nombre, sb); return typeof f === 'function' ? f : () => undefined; }
  catch (e) { return () => undefined; }
};

const NUEVO = { id: 'nuevo1', nombre: 'Galletitas nuevas', codigoBarras: '7790001234567', tipoVenta: 'unidad' };

/* El panel de mentira: los modales que estan abiertos, la ficha con su estilo, y
   espias en lo que el lector puede llamar. */
function panel(abiertos) {
  const abre = new Set(abiertos || []);
  const est = { llamadas: [], avisos: [], items: [] };
  const els = {};
  const el = (id) => {
    if (!els[id]) els[id] = { id, value: '', textContent: '', style: {}, dataset: {},
      classList: { add: () => abre.add(id), remove: () => abre.delete(id), contains: () => abre.has(id) },
      focus() {} };
    return els[id];
  };
  ['productModal', 'ventaModal', 'ventaMayModal', 'compraModal', 'asignarCodigoModal',
   'pCodigo', 'pCodigoBarras', 'pNombre', 'asignarCodigoTexto', 'asignarCodigoBuscar',
   'asignarCodigoLista'].forEach(el);

  const doc = {
    addEventListener() {},
    getElementById: (id) => el(id),
    querySelector: () => null,
    querySelectorAll: (sel) => (sel === '.modal-overlay.show' ? [...abre].map(id => ({ id })) : [])
  };
  const sb = {
    console, document: doc, setTimeout, clearTimeout, Date, Object, Array, String, Number,
    allProducts: [NUEVO],
    showAdminToast: (m) => est.avisos.push(m),
    switchSection: (s) => est.llamadas.push('switchSection:' + s),
    openModal: (id) => { est.llamadas.push('openModal:' + (id || '')); abre.add('productModal'); },
    addVentaItem: (id) => { est.llamadas.push('addVentaItem:' + id); est.items.push(id); },
    addVentaMayItem: (id) => { est.llamadas.push('addVentaMayItem:' + id); est.items.push(id); },
    compraEscanear: (p) => est.llamadas.push('compraEscanear:' + p.id),
    sugerirCodigoProducto: () => 'P-0001',
    _pintarEstadoCodigo: () => {},
    refrescarBarrasProducto: () => est.llamadas.push('refrescarBarras'),
    ventaItems: [], ventaMayItems: [],
    esc: s => String(s == null ? '' : s)
  };
  sb.window = sb; sb.globalThis = sb;
  vm.createContext(sb);
  vm.runInContext(LECTOR, sb, { filename: 'admin-lector.js' });
  return { sb, est, els, abre };
}

/* Deja el lector con un codigo pendiente, como si se acabara de escanear. */
function conPendiente(P, cod, destino) {
  vm.runInContext('_lecCodigoPendiente = ' + JSON.stringify({ cod, destino }) + ';', P.sb);
}

grupo('Con una venta abierta, la ficha se abre ENCIMA');
let P = panel(['ventaModal']);
conPendiente(P, '7790001234567', 'venta');
fnDe('crearProductoConCodigo', P.sb)();
t('la ficha se abre', P.est.llamadas.includes('openModal:'), P.est.llamadas.join(' + '));
t('y queda por encima de la venta', Number(P.els.productModal.style.zIndex) > 200,
  'z-index: ' + P.els.productModal.style.zIndex);
t('NO se cambia de seccion: al cerrar hay que volver a la venta',
  !P.est.llamadas.some(x => x.indexOf('switchSection') === 0));
t('el codigo de barras queda cargado', P.els.pCodigoBarras.value === '7790001234567');
t('y el preview se redibuja con el', P.est.llamadas.includes('refrescarBarras'));
t('se sugiere un codigo interno libre', P.els.pCodigo.value === 'P-0001');
t('y se avisa que entra solo a la venta',
  P.est.avisos.some(m => /entra solo a la venta/.test(m)), P.est.avisos.join(' | '));

grupo('Sin nada abierto sigue como antes: va a Productos');
P = panel([]);
conPendiente(P, '7790001234567', 'ficha');
fnDe('crearProductoConCodigo', P.sb)();
t('cambia a Productos', P.est.llamadas.includes('switchSection:products'), P.est.llamadas.join(' + '));
t('y la ficha queda en su nivel de siempre', !P.els.productModal.style.zIndex);
t('no promete que entre a ninguna venta',
  !P.est.avisos.some(m => /entra solo/.test(m)), P.est.avisos.join(' | '));

grupo('Al guardarlo, el producto entra solo a la venta');
P = panel(['ventaModal']);
conPendiente(P, '7790001234567', 'venta');
fnDe('crearProductoConCodigo', P.sb)();
t('el destino queda anotado', fnDe('lectorDestinoNuevo', P.sb)() === 'venta');
fnDe('lectorAgregarProductoNuevo', P.sb)('nuevo1', 'venta');
t('se agrega a la venta', P.est.items.includes('nuevo1'), P.est.llamadas.join(' + '));
t('y el destino se consume: no entra dos veces', fnDe('lectorDestinoNuevo', P.sb)() === null);
P.est.items.length = 0;
fnDe('lectorAgregarProductoNuevo', P.sb)('nuevo1', null);
t('sin destino no agrega nada', !P.est.items.length);

grupo('Mayorista y compras, lo mismo');
P = panel(['ventaMayModal']);
conPendiente(P, '7790001234567', 'ventaMay');
fnDe('crearProductoConCodigo', P.sb)();
t('la ficha se levanta sobre la venta mayorista', Number(P.els.productModal.style.zIndex) > 200);
fnDe('lectorAgregarProductoNuevo', P.sb)('nuevo1', 'ventaMay');
t('y entra a la venta mayorista', P.est.llamadas.includes('addVentaMayItem:nuevo1'));

P = panel(['compraModal']);
conPendiente(P, '7790001234567', 'compra');
fnDe('crearProductoConCodigo', P.sb)();
t('la ficha se levanta sobre la compra', Number(P.els.productModal.style.zIndex) > 200);
t('y se avisa que entra a la compra', P.est.avisos.some(m => /entra solo a la compra/.test(m)));
fnDe('lectorAgregarProductoNuevo', P.sb)('nuevo1', 'compra');
t('entra a la compra', P.est.llamadas.includes('compraEscanear:nuevo1'));

grupo('Si la venta se cerro en el medio, no se agrega a la nada');
P = panel(['ventaModal']);
conPendiente(P, '7790001234567', 'venta');
fnDe('crearProductoConCodigo', P.sb)();
P.abre.delete('ventaModal');
fnDe('lectorAgregarProductoNuevo', P.sb)('nuevo1', 'venta');
t('no intenta agregarlo', !P.est.items.length, P.est.llamadas.join(' + '));

grupo('Un producto que no quedo en la lista no rompe nada');
P = panel(['ventaModal']);
fnDe('lectorAgregarProductoNuevo', P.sb)('no-existe', 'venta');
t('no agrega nada y no explota', !P.est.items.length);

grupo('El panel devuelve la ficha a su nivel y olvida el destino');
const cm = HTML.slice(HTML.indexOf('function closeModal()'), HTML.indexOf('function closeModal()') + 700);
t('closeModal baja el z-index', /style\.zIndex\s*=\s*''/.test(cm), );
t('y limpia el destino, por si se canceló', /lectorLimpiarDestinoNuevo\(\)/.test(cm));

grupo('saveProduct lee el destino ANTES de cerrar la ficha');
const sp = HTML.slice(HTML.indexOf('async function saveProduct(e)'));
const iLee = sp.indexOf('lectorDestinoNuevo()');
const iCierra = sp.indexOf('closeModal();');
const iUsa = sp.indexOf('lectorAgregarProductoNuevo(');
t('lo lee', iLee > 0);
t('antes de cerrar (cerrar lo limpia)', iLee > 0 && iCierra > 0 && iLee < iCierra);
t('y lo usa despues de releer el producto', iUsa > iCierra);
t('el producto se agrega recien despues de refrescarProductoLocal',
  iUsa > sp.indexOf('refrescarProductoLocal(_refId)'));

console.log('\n' + ok + ' pasaron, ' + mal + ' fallaron');
process.exit(mal ? 1 : 0);
