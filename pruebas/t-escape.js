/**
 * ESCAPE CIERRA LO DE MÁS ARRIBA, NO LO DE ATRÁS.
 *
 * Encontrado en el chequeo del 14/09: con la venta abierta, escanear un producto
 * oculto pregunta "¿Vender igual?". Cancelar con Escape cerraba el diálogo Y la
 * venta, y al volver a abrirla el carrito arrancaba vacío. Lo mismo con el pedido
 * de gramos de los productos por peso, y con el buscador de los desplegables del
 * formulario de producto, que se llevaba puesto todo lo cargado.
 *
 * La causa: el Escape de admin-atajos.js escucha en captura sobre document y se
 * registra antes que los demás, así que se entera primero y cierra el modal. El
 * stopPropagation de los otros no lo frena. Ahora se fija si hay un diálogo o un
 * panel abierto, y en ese caso los deja cerrarse solos.
 *
 * Se corre admin-atajos.js de verdad, con un document de mentira.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const RAIZ = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const atajos = leer('admin-atajos.js');

let ok = 0, fail = 0;
const t = (d, c) => { if (c) { ok++; console.log('  OK   ' + d); } else { fail++; console.log('  FALLA ' + d); } };

/* Carga admin-atajos.js y devuelve el handler de teclado que registra. `estado` dice
   qué hay abierto en la pantalla de mentira. */
function handlerCon(estado) {
  let escucha = null;
  const hay = s => (s === '.dlg-overlay' && !!estado.dialogo) ||
                   (s === '.selb-panel:not([hidden])' && !!estado.panel) ||
                   (s === '.modal-overlay.show' && estado.modales.some(m => m.show));
  const document = {
    addEventListener: (tipo, fn, captura) => { if (tipo === 'keydown') { escucha = fn; estado.captura = captura; } },
    getElementById: () => null,
    querySelector: sel => (sel.split(',').map(s => s.trim()).some(hay) ? {} : null),
    querySelectorAll: sel => (sel === '.modal-overlay.show'
      ? estado.modales.filter(m => m.show).map(m => ({ classList: { remove: c => { if (c === 'show') m.show = false; } } }))
      : []),
  };
  vm.runInNewContext(atajos, { document, window: {}, setTimeout, clearTimeout, console });
  return escucha;
}
const escape = () => ({ key: 'Escape', target: { tagName: 'INPUT' }, ctrlKey: false, altKey: false, metaKey: false, preventDefault() {} });
const abiertos = estado => estado.modales.filter(m => m.show).map(m => m.id).join(',');

console.log('\n-- lo de siempre --');
let e = { modales: [{ id: 'venta', show: true }] };
handlerCon(e)(escape());
t('con un modal abierto y nada encima, Escape lo cierra', abiertos(e) === '');
e = { modales: [{ id: 'venta', show: true }, { id: 'cliente', show: true }] };
handlerCon(e)(escape());
t('con dos, cierra solo el de más arriba', abiertos(e) === 'venta');
t('escucha en captura sobre document: por eso se entera antes que los demás', e.captura === true);

console.log('\n-- con algo encima del modal --');
e = { modales: [{ id: 'venta', show: true }], dialogo: true };
handlerCon(e)(escape());
t('con un diálogo abierto -"¿Vender igual?", los gramos- la venta de atrás queda', abiertos(e) === 'venta');
e = { modales: [{ id: 'producto', show: true }], panel: true };
handlerCon(e)(escape());
t('con el panel de un desplegable abierto, el formulario de producto queda', abiertos(e) === 'producto');

console.log('\n-- las clases que mira son las de verdad --');
const dialogo = leer('admin-dialogo.js');
t('los dos diálogos, confirmar y gramos, usan .dlg-overlay', (dialogo.match(/ov\.className = 'dlg-overlay'/g) || []).length === 2);
t('  y cada uno cierra con su propio Escape', (dialogo.match(/if \(e\.key === 'Escape'\) \{ e\.preventDefault\(\); e\.stopPropagation\(\); cerrar\(/g) || []).length === 2);
const selector = leer('admin-selector.js');
t('el panel del desplegable es .selb-panel y se esconde con hidden',
  /panel\.className = 'selb-panel'/.test(selector) && /panel\.hidden = true/.test(selector));

console.log('\n' + ok + ' pasaron, ' + fail + ' fallaron');
process.exit(fail ? 1 : 0);
