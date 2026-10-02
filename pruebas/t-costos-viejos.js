/**
 * EL AVISO DE COSTOS DESACTUALIZADOS AL VENDER.
 *
 * Pedido del comercio (24/09/2026): si el costo de un producto no se tocó hace un mes
 * o más, al registrar una venta aparece un aviso con esos productos y la fecha de su
 * último cambio, y dos botones: "Modificar costos" e "Ignorar advertencia y vender de
 * todas formas".
 *
 * LO QUE ESTA PRUEBA CUIDA
 * 1. Qué cuenta como viejo: 30 días o más, y un producto sin fecha NO avisa.
 * 2. Que el aviso no pueda frenar una venta por un error suyo, y que cerrarlo sin
 *    elegir vuelva a la venta en vez de venderla.
 * 3. Que el editor recalcule el precio con la MISMA cuenta que el formulario, que
 *    confirme con la fecha de hoy los costos que siguen igual, y que la venta abierta
 *    tome el precio nuevo, salvo la que viene de un pedido web.
 * 4. Que esté enchufado: en la venta minorista y en la mayorista, solo al crear.
 *
 * Se corre admin-costos.js de verdad, con un DOM y una base de mentira.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const RAIZ = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const SRC = leer('admin-costos.js');
const html = leer('admin.html');

let ok = 0, fail = 0;
const t = (d, c, extra) => {
  if (c) { ok++; console.log('  OK   ' + d); }
  else { fail++; console.log('  FALLA ' + d + (extra !== undefined ? '   [' + extra + ']' : '')); }
};
function cuerpo(texto, n) {
  const i = texto.indexOf('function ' + n + '(');
  if (i < 0) return '';
  let p = 0, k;
  for (k = texto.indexOf('{', i); k < texto.length; k++) {
    if (texto[k] === '{') p++;
    else if (texto[k] === '}') { p--; if (!p) break; }
  }
  return texto.slice(i, k + 1);
}

const DIA = 86400000;
const AHORA = new Date('2026-09-24T12:00:00');
const hace = d => new Date(AHORA.getTime() - d * DIA);

/* ---------------------------------------------- un mundo de mentira, por prueba */
function armar(opts) {
  const o = opts || {};
  const escrituras = [];
  const avisos = [];
  const historial = [];
  const repintados = [];
  const elementos = {};
  const inputs = [], casillas = [];
  const ctx = {
    console, Date, Math, Number, String, Object, Array, Set, isNaN, Promise,
    Event: function (tp) { this.type = tp; },
    setTimeout: () => 0,
    window: { _pedidoOrigenVentaId: o.desdePedido ? 'pedido-1' : null },
    allProducts: o.productos || [],
    ventaItems: o.ventaItems || [],
    ventaMayItems: o.ventaMayItems || [],
    _dlgAbiertos: 0,
    montoAR: v => Number(String(v == null ? '' : v).replace(/\./g, '').replace(/[^0-9]/g, '')) || 0,
    limpiarMonto: () => {},
    esc: s => String(s),
    showAdminToast: (m, tipo) => avisos.push((tipo || 'info') + ': ' + m),
    logAction: (a, b, c) => historial.push(b + ' | ' + c),
    filterTable: () => {},
    renderVentaItems: () => repintados.push('min'),
    renderVentaMayItems: () => repintados.push('may'),
    pedirOpcion: o.pedirOpcion,
    pedirConfirmacion: o.pedirConfirmacion,
    firebase: { firestore: { FieldValue: { serverTimestamp: () => ({ __serverTimestamp: true }) } } },
    db: {
      collection: () => ({ doc: id => ({ id }) }),
      batch: () => {
        const ops = [];
        return {
          update: (ref, campos) => ops.push({ id: ref.id, campos }),
          commit: async () => { if (o.falla) throw new Error('sin conexion'); ops.forEach(x => escrituras.push(x)); },
        };
      },
    },
    document: {
      createElement: () => {
        const el = {
          id: '', className: '', style: {}, innerHTML: '',
          addEventListener: () => {},
          querySelector: sel => (sel === '.costos-input' ? inputs[0] || null
            : /^\.costos-input\[data-i="\d+"\]$/.test(sel) ? inputs[Number(sel.replace(/\D/g, ''))] || null
            : { addEventListener: () => {}, focus: () => {}, select: () => {}, disabled: false, innerHTML: '' }),
          querySelectorAll: sel => (sel === '.costos-input' ? inputs : sel === '.costos-sigue' ? casillas : []),
          remove: () => { delete elementos[el.id]; },
        };
        return el;
      },
      body: { appendChild: el => { elementos[el.id] = el; } },
      getElementById: id => elementos[id] || null,
      addEventListener: () => {},
      removeEventListener: () => {},
    },
  };
  vm.createContext(ctx);
  /* Las cajas cerradas y las escalas viven en admin-variantes.js y admin-escalas.js. */
  if (o.conVariantes) { vm.runInContext(leer('admin-variantes.js'), ctx); vm.runInContext(leer('admin-escalas.js'), ctx); }
  vm.runInContext(SRC + '\n;this.__api = { fechaDeCosto, costosViejos, preciosDesdeCosto, avisoCostosViejos, ' +
    'abrirEditorCostos, guardarEditorCostos, cerrarEditorCostos, costoBolsaEnEditor };', ctx);
  /* Las filas del editor: un input por producto, con el valor que se escribe en la prueba. */
  const conInputs = valores => {
    inputs.length = 0;
    valores.forEach((v, i) => inputs.push({ value: String(v), getAttribute: () => String(i), eventos: [],
      addEventListener: () => {}, focus: () => {}, select: () => {}, dispatchEvent(ev) { this.eventos.push(ev.type); } }));
  };
  /* Las casillas "Sigue igual" del editor abierto desde Inicio del día. */
  const conCasillas = tildadas => {
    casillas.length = 0;
    tildadas.forEach((v, i) => casillas.push({ checked: !!v, getAttribute: () => String(i) }));
  };
  return { ctx, api: ctx.__api, escrituras, avisos, historial, repintados, elementos, conInputs, conCasillas, inputs };
}

(async () => {
/* ========================================================= QUE ES "VIEJO" */
console.log('\n-- que cuenta como costo viejo --');
{
  const { api } = armar();
  t('lee un Timestamp de Firestore', api.fechaDeCosto({ costoActualizadoEn: { toDate: () => hace(3) } }).getTime() === hace(3).getTime());
  t('  un Date, segundos sueltos y texto', !!api.fechaDeCosto({ costoActualizadoEn: hace(1) }) &&
    !!api.fechaDeCosto({ costoActualizadoEn: { seconds: 1700000000 } }) && !!api.fechaDeCosto({ costoActualizadoEn: '2026-08-01' }));
  t('  y sin fecha devuelve null', api.fechaDeCosto({}) === null && api.fechaDeCosto(null) === null &&
    api.fechaDeCosto({ costoActualizadoEn: 'nada' }) === null);

  const P = [
    { id: 'a', nombre: 'Almendra', costo: 1000, costoActualizadoEn: hace(29) },
    { id: 'b', nombre: 'Banana', costo: 900, costoActualizadoEn: hace(30) },
    { id: 'c', nombre: 'Chia', costo: 800, costoActualizadoEn: hace(75) },
    { id: 'd', nombre: 'Datil', costo: 700 },
  ];
  const r = api.costosViejos([{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'c' }, { id: 'd' }, { id: 'x' }], P, AHORA);
  t('29 días todavía no avisa', !r.some(v => v.producto.id === 'a'));
  t('30 días sí', r.some(v => v.producto.id === 'b'));
  t('un producto sin fecha NO avisa: no se puede decir que su costo sea viejo', !r.some(v => v.producto.id === 'd'));
  t('dos renglones del mismo producto avisan una sola vez', r.filter(v => v.producto.id === 'c').length === 1);
  t('un id que no está en el catálogo no rompe', r.length === 2);
  t('los más viejos primero, con los días contados', r[0].producto.id === 'c' && r[0].dias === 75 && r[1].dias === 30);
}

/* ============================================================ EL AVISO */
console.log('\n-- el aviso --');
{
  /* El aviso cuenta los días desde HOY (el reloj de verdad), no desde AHORA: con hace(40)
     la prueba pasaba solo el 24/09 y al otro día decía "hace 41 días". */
  const P = [{ id: 'c', nombre: 'Chia', costo: 800, tipoVenta: 'peso', costoActualizadoEn: new Date(Date.now() - 40 * DIA) }];
  let pedido = null;
  const m = armar({ productos: P, pedirOpcion: async (msg, op) => { pedido = { msg, op }; return 'ignorar'; } });
  const r = await (m.api.avisoCostosViejos([{ id: 'c' }], 'min'));
  t('"Ignorar advertencia y vender de todas formas" deja seguir la venta', r === true);
  t('  el mensaje es el que se pidió', pedido && pedido.msg.indexOf('desactualizado hace 1 mes o más') > 0);
  t('  y lista el producto, su costo por kilo y la fecha', pedido && pedido.msg.indexOf('Chia: $800 el kilo, cambiado el') > 0 &&
    pedido.msg.indexOf('hace 40 días') > 0);
  t('  con los dos botones, con esas palabras', pedido && pedido.op.opciones.map(x => x.texto).join(' | ') ===
    'Modificar costos | Ignorar advertencia y vender de todas formas');
  t('  y "Modificar costos" es el principal: Enter no vende sin querer', pedido && pedido.op.opciones[0].principal === true);

  let abierto = null;
  const m2 = armar({ productos: P, pedirOpcion: async () => 'modificar' });
  m2.ctx.abrirEditorCostos = (viejos, ctx) => { abierto = { viejos, ctx }; };
  t('"Modificar costos" NO vende y abre el editor', await (m2.api.avisoCostosViejos([{ id: 'c' }], 'may')) === false &&
    abierto && abierto.ctx === 'may' && abierto.viejos.length === 1);

  let abierto3 = false;
  const m3 = armar({ productos: P, pedirOpcion: async () => null });
  m3.ctx.abrirEditorCostos = () => { abierto3 = true; };
  t('cerrarlo sin elegir (Escape) vuelve a la venta: ni vende ni abre el editor',
    await (m3.api.avisoCostosViejos([{ id: 'c' }], 'min')) === false && !abierto3);

  let preguntado = false;
  const m4 = armar({ productos: [{ id: 'n', costo: 5, costoActualizadoEn: hace(2) }], pedirOpcion: async () => { preguntado = true; return null; } });
  t('sin costos viejos no pregunta nada', await (m4.api.avisoCostosViejos([{ id: 'n' }], 'min')) === true && !preguntado);

  const m5 = armar({ productos: P, pedirOpcion: undefined });
  t('si el diálogo no cargó, la venta NO se frena', await (m5.api.avisoCostosViejos([{ id: 'c' }], 'min')) === true);
}

/* =========================================================== EL EDITOR */
console.log('\n-- el editor de costos --');
{
  const pA = { id: 'a', nombre: 'Almendra', costo: 1000, porcentaje: 50, porcentajeMayorista: 20, precio: 1500, precioMayorista: 1200, costoActualizadoEn: hace(40) };
  const pB = { id: 'b', nombre: 'Banana', costo: 900, porcentaje: 40, porcentajeMayorista: 0, precio: 1260, precioMayorista: 900, costoActualizadoEn: hace(35) };
  const venta = [{ id: 'a', precio: 1500, costo: 1000, cantidad: 2 }, { id: 'b', precio: 1260, costo: 900, cantidad: 1 }];
  const m = armar({ productos: [pA, pB], ventaItems: venta });
  m.api.abrirEditorCostos([{ producto: pA, fecha: hace(40), dias: 40 }, { producto: pB, fecha: hace(35), dias: 35 }], 'min');
  t('se abre como .dlg-overlay, encima de la venta', m.elementos.costosEditor && m.elementos.costosEditor.className === 'dlg-overlay');
  m.conInputs(['1.234', '900']);
  await (m.api.guardarEditorCostos());
  const wa = m.escrituras.find(x => x.id === 'a'), wb = m.escrituras.find(x => x.id === 'b');
  t('el costo cambiado se guarda', wa && wa.campos.costo === 1234);
  t('  con el precio recalculado como el formulario: 1234 × 1,50 = 1851', wa && wa.campos.precio === Math.round(1234 * 1.5));
  t('  y el mayorista con su % y redondeado a $50: 1234 × 1,20 = 1481 -> 1500', wa && wa.campos.precioMayorista === 1500);
  t('  y la fecha de hoy en la MISMA escritura', wa && wa.campos.costoActualizadoEn && wa.campos.costoActualizadoEn.__serverTimestamp === true);
  t('el que sigue igual solo se confirma: únicamente la fecha', wb && Object.keys(wb.campos).join() === 'costoActualizadoEn');
  t('el producto en memoria queda al día', pA.costo === 1234 && pA.precio === 1851 && pA.costoActualizadoEn instanceof Date &&
    pB.costo === 900 && pB.costoActualizadoEn instanceof Date);
  t('la venta abierta toma el precio y el costo nuevos', venta[0].precio === 1851 && venta[0].costo === 1234);
  t('  sin tocar al que no cambió', venta[1].precio === 1260);
  t('  y se repinta', m.repintados.join() === 'min');
  t('se cierra el editor y se avisa que revise el total', !m.elementos.costosEditor &&
    m.avisos.some(a => a.indexOf('success: Costos guardados') === 0));
  t('queda en el historial qué se cambió y qué se confirmó', m.historial.length === 1 &&
    m.historial[0].indexOf('1 cambiado, 1 confirmado') > 0 && m.historial[0].indexOf('Banana (sigue igual)') > 0);
}
{
  /* Venta armada desde un pedido web: el cliente ya aceptó ese precio. */
  const p = { id: 'a', nombre: 'Almendra', costo: 1000, porcentaje: 50, precio: 1500, costoActualizadoEn: hace(40) };
  const venta = [{ id: 'a', precio: 1500, costo: 1000, cantidad: 1 }];
  const m = armar({ productos: [p], ventaItems: venta, desdePedido: true });
  m.api.abrirEditorCostos([{ producto: p, fecha: hace(40), dias: 40 }], 'min');
  m.conInputs(['2000']);
  await (m.api.guardarEditorCostos());
  t('desde un pedido web la venta mantiene el precio que aceptó el cliente', venta[0].precio === 1500);
  t('  pero toma el costo nuevo, para que la ganancia sea la real', venta[0].costo === 2000);
}
{
  const p = { id: 'a', nombre: 'Almendra', costo: 1000, porcentaje: 50, porcentajeMayorista: 20, precio: 1500, precioMayorista: 1200, costoActualizadoEn: hace(40) };
  const venta = [{ id: 'a', precio: 1200, costo: 1000, cantidad: 1 }];
  const m = armar({ productos: [p], ventaMayItems: venta });
  m.api.abrirEditorCostos([{ producto: p, fecha: hace(40), dias: 40 }], 'may');
  m.conInputs(['2000']);
  await (m.api.guardarEditorCostos());
  t('en la venta mayorista el renglón toma el precio MAYORISTA nuevo', venta[0].precio === 2400 && m.repintados.join() === 'may');
}
{
  /* Desde Inicio del día (admin-inicio.js, 26/09): no hay una venta atrás. */
  const p = { id: 'a', nombre: 'Almendra', costo: 1000, porcentaje: 50, porcentajeMayorista: 20, precio: 1500, precioMayorista: 1200, costoActualizadoEn: hace(40) };
  const q = { id: 'b', nombre: 'Banana', costo: 900, porcentaje: 40, precio: 1260, costoActualizadoEn: hace(35) };
  const venta = [{ id: 'a', precio: 1500, costo: 1000, cantidad: 1 }];
  const m = armar({ productos: [p, q], ventaItems: venta });
  let campana = 0;
  m.ctx._refrescarAlertas = () => { campana++; };
  m.api.abrirEditorCostos([{ producto: p, fecha: hace(40), dias: 40 }, { producto: q, fecha: hace(35), dias: 35 }], 'inicio');
  const ed = m.elementos.costosEditor;
  t('desde Inicio del día el editor dice "Revisar costos" y "Ahora no", no "Volver a la venta"', ed && ed.innerHTML.indexOf('Revisar costos') > 0 &&
    ed.innerHTML.indexOf('Ahora no') > 0 && ed.innerHTML.indexOf('Volver a la venta') < 0);
  t('  con la casilla "Sigue igual" en cada fila, sin tildar', ed.innerHTML.split('class="costos-sigue"').length === 3 &&
    ed.innerHTML.indexOf('checked') < 0);
  m.conInputs(['1.100', '900']);
  m.conCasillas([false, false]);
  await (m.api.guardarEditorCostos());
  t('  guarda SOLO el costo que cambió, con su precio (pedido del dueño, 26/09)', p.costo === 1100 && p.precio === 1650 &&
    m.escrituras.length === 1 && m.escrituras[0].id === 'a');
  t('  el que no cambió NO se toca: sigue viejo, y sigue en la lista', !m.escrituras.find(x => x.id === 'b') &&
    q.costoActualizadoEn.getTime() === hace(35).getTime());
  t('  no toca una venta abierta: no es de ahí', venta[0].precio === 1500 && venta[0].costo === 1000 && m.repintados.length === 0);
  t('  y lo dice claro: cuántos cambiaron y que el resto sigue en la lista',
    m.avisos.indexOf('success: Listo: 1 costo cambiado, con su precio nuevo. El que no cambiaste sigue en la lista.') >= 0, m.avisos);
  t('  queda en el historial de dónde vino', m.historial[0].indexOf('Costos revisados desde el Centro de avisos: 1 cambiado, 0 confirmados') === 0);
  t('  y avisa a la campana (y con ella al Inicio): lo cambiado deja de avisar', campana === 1);
}
{
  /* "Sigue igual" tildado: se confirma sin cambiar el costo, y deja de avisar un mes. */
  const p = { id: 'a', nombre: 'Almendra', costo: 1000, porcentaje: 50, precio: 1500, costoActualizadoEn: hace(40) };
  const q = { id: 'b', nombre: 'Banana', costo: 900, porcentaje: 40, precio: 1260, costoActualizadoEn: hace(35) };
  const r = { id: 'c', nombre: 'Coco', costo: 700, porcentaje: 40, precio: 980, costoActualizadoEn: hace(33) };
  const m = armar({ productos: [p, q, r] });
  m.api.abrirEditorCostos([p, q, r].map(x => ({ producto: x, fecha: x.costoActualizadoEn, dias: 40 })), 'inicio');
  m.conInputs(['1000', '900', '700']);
  m.conCasillas([false, true, false]);
  await (m.api.guardarEditorCostos());
  const wb = m.escrituras.find(x => x.id === 'b');
  t('"Sigue igual" tildado: se confirma solo la fecha, sin tocar el costo', m.escrituras.length === 1 && wb &&
    Object.keys(wb.campos).join() === 'costoActualizadoEn' && q.costo === 900);
  t('  los otros dos, sin tocar', p.costoActualizadoEn.getTime() === hace(40).getTime() && r.costoActualizadoEn.getTime() === hace(33).getTime());
  t('  y el aviso lo dice', m.avisos.indexOf('success: Listo: 1 marcado como "sigue igual". Los 2 que no cambiaste siguen en la lista.') >= 0, m.avisos);
  const m2 = armar({ productos: [Object.assign({}, p)] });
  m2.api.abrirEditorCostos([{ producto: m2.ctx.allProducts[0], fecha: hace(40), dias: 40 }], 'inicio');
  m2.conInputs(['1000']);
  m2.conCasillas([false]);
  await (m2.api.guardarEditorCostos());
  t('sin cambiar nada no se escribe nada, y se dice', m2.escrituras.length === 0 && !m2.elementos.costosEditor &&
    m2.avisos.indexOf('info: No cambiaste ningún costo: siguen todos en la lista.') >= 0, m2.avisos);
  const m3 = armar({ productos: [Object.assign({}, p), Object.assign({}, q)] });
  m3.api.abrirEditorCostos(m3.ctx.allProducts.map(x => ({ producto: x, fecha: hace(40), dias: 40 })), 'min');
  m3.conInputs(['1000', '900']);
  m3.conCasillas([false, false]);
  await (m3.api.guardarEditorCostos());
  /* Revisión del 26/09: un producto con costo 0 que no se toca no frena a los demás. */
  const cero = { id: 'z', nombre: 'Muestra', costo: 0, porcentaje: 50, precio: 0, costoActualizadoEn: hace(40) };
  const otro = { id: 'o', nombre: 'Otro', costo: 1000, porcentaje: 50, precio: 1500, costoActualizadoEn: hace(40) };
  const m4 = armar({ productos: [cero, otro] });
  m4.api.abrirEditorCostos([cero, otro].map(x => ({ producto: x, fecha: hace(40), dias: 40 })), 'inicio');
  m4.conInputs(['0', '1200']);
  m4.conCasillas([false, false]);
  await (m4.api.guardarEditorCostos());
  t('desde Inicio, un costo 0 que no se tocó no frena al resto: se guarda el que cambió', m4.escrituras.length === 1 &&
    m4.escrituras[0].id === 'o' && otro.costo === 1200 && !m4.avisos.some(a => a.indexOf('error:') === 0), m4.avisos);
  t('al VENDER sigue como antes: lo que no cambió se confirma (si no, el aviso volvería en la próxima venta)',
    m3.escrituras.length === 2 && m3.escrituras.every(x => Object.keys(x.campos).join() === 'costoActualizadoEn'));
}
{
  const p = { id: 'a', nombre: 'Almendra', costo: 1000, porcentaje: 50, precio: 1500, costoActualizadoEn: hace(40) };
  const m = armar({ productos: [p] });
  m.api.abrirEditorCostos([{ producto: p, fecha: hace(40), dias: 40 }], 'min');
  m.conInputs(['']);
  await (m.api.guardarEditorCostos());
  t('un costo vacío no se guarda: avisa y no escribe nada', m.escrituras.length === 0 &&
    m.avisos.some(a => a.indexOf('error: Poné un costo válido') === 0) && !!m.elementos.costosEditor);
  const m2 = armar({ productos: [Object.assign({}, p)], falla: true });
  m2.api.abrirEditorCostos([{ producto: m2.ctx.allProducts[0], fecha: hace(40), dias: 40 }], 'min');
  m2.conInputs(['1100']);
  await (m2.api.guardarEditorCostos());
  t('si la base falla, no se toca nada en memoria y el editor sigue abierto', m2.ctx.allProducts[0].costo === 1000 &&
    !!m2.elementos.costosEditor && m2.avisos.some(a => a.indexOf('error: No se pudieron guardar') === 0));
}

{
  /* Revisión del 25/09: "Modificar costos" pasaba todo al precio de lista de su propio
     producto. Una caja cerrada va al mayorista y un granel con escalas, al precio de la
     escala que se cobró: todos sus renglones al mismo, cada uno con el costo de su bolsa. */
  const caja = { id: 'cx', nombre: 'Alfajor x12', gramaje: 'x12', tipoVenta: 'unidad', cajaCerrada: true, costo: 6000, porcentaje: 60, porcentajeMayorista: 30,
    precio: 9600, precioMayorista: 7800, costoActualizadoEn: hace(40) };
  const y1 = { id: 'y1', nombre: 'Yerba x 1 kg', gramaje: '1 kg', tipoVenta: 'peso', costo: 5000, porcentaje: 60, porcentajeMayorista: 30,
    precio: 8000, precioMayorista: 6500, stock: 0, costoActualizadoEn: hace(40) };
  const y3 = { id: 'y3', nombre: 'Yerba x 3 kg', gramaje: '3 kg', tipoVenta: 'peso', costo: 4500, porcentaje: 60, porcentajeMayorista: 30,
    precio: 7200, precioMayorista: 5850, stock: 2300, gramajePadreId: 'y1', costoActualizadoEn: hace(40) };
  const venta = [
    { id: 'cx', precio: 7800, costo: 6000, cantidad: 1 },
    { id: 'y3', precio: 7200, costo: 4500, cantidad: 2300, tipoVenta: 'peso', escala: '3 kg', escalaId: 'y3' },
    { id: 'y1', precio: 7200, costo: 5000, cantidad: 700, tipoVenta: 'peso', escala: '3 kg', escalaId: 'y3' },
  ];
  const m = armar({ productos: [caja, y1, y3], ventaItems: venta, conVariantes: true });
  m.api.abrirEditorCostos([caja, y1, y3].map(p => ({ producto: p, fecha: hace(40), dias: 40 })), 'min');
  /* Las bolsas se escriben por bolsa (27/09): $14.400 la de 3 kg son $4.800 el kilo. */
  m.conInputs(['6500', '5500', '14400']);
  await (m.api.guardarEditorCostos());
  t('la caja cerrada toma el precio MAYORISTA nuevo, no el de lista', caja.precio === 10400 && venta[0].precio === caja.precioMayorista && venta[0].costo === 6500);
  t('los renglones del granel quedan todos al precio nuevo de la escala de 3 kg (no la bolsa de 1 kg al suyo)',
    y3.precio === 7680 && venta[1].precio === 7680 && venta[2].precio === 7680 && y1.precio === 8800);
  t('  cada uno con el costo nuevo de su bolsa', venta[1].costo === 4800 && venta[2].costo === 5500);
}

{
  /* Las bolsas, por bolsa (pedido del dueño, 27/09): en el formulario se carga lo que costó
     la bolsa entera; en la ventana de costos, también. Y al lado, cómo queda el precio. */
  const b1 = { id: 'b1', nombre: 'Prueba1', gramaje: '1 kg', tipoVenta: 'peso', costo: 2000, porcentaje: 45, porcentajeMayorista: 43,
    precio: 2900, precioMayorista: 2900, costoActualizadoEn: hace(92) };
  const b3 = { id: 'b3', nombre: 'Prueba1 x 3 kg', gramaje: '3 kg', tipoVenta: 'peso', gramajePadreId: 'b1', costo: 667, porcentaje: 45,
    porcentajeMayorista: 45, precio: 967, precioMayorista: 1000, costoActualizadoEn: hace(92) };
  const suelto = { id: 'al', nombre: 'Almendra', tipoVenta: 'peso', costo: 9000, porcentaje: 50, porcentajeMayorista: 20,
    precio: 13500, precioMayorista: 10800, costoActualizadoEn: hace(40) };
  const m = armar({ productos: [b1, b3, suelto], conVariantes: true });
  m.api.abrirEditorCostos([b1, b3, suelto].map(p => ({ producto: p, fecha: hace(92), dias: 92 })), 'min');
  const h = m.elementos.costosEditor.innerHTML;
  t('la bolsa de 3 kg pide lo que costó la bolsa: $2.001 ($667 el kilo, con el kilo en pesos enteros)',
    h.indexOf('value="2001" aria-label="Nuevo costo de la bolsa de Prueba1 x 3 kg"') > 0 && h.indexOf('Costo actual $2.001 la bolsa ($667 el kilo) ·') > 0, h);
  t('  la de 1 kg, lo mismo que el kilo, sin repetirlo', h.indexOf('value="2000" aria-label="Nuevo costo de la bolsa de Prueba1 x 1 kg"') > 0 &&
    h.indexOf('Costo actual $2.000 la bolsa ·') > 0);
  t('  un granel sin bolsas sigue por kilo', h.indexOf('value="9000" aria-label="Nuevo costo de Almendra"') > 0 && h.indexOf('Costo actual $9.000 el kilo') > 0);
  t('arriba del campo de cada bolsa dice "Costo por bolsa:" (01/10)', h.indexOf('<label class="costos-campo"><span class="costos-campo-tit">Costo por bolsa:</span>' +
    '<input type="text" inputmode="numeric" class="form-input costos-input" data-i="1" value="2001" aria-label="Nuevo costo de la bolsa de Prueba1 x 3 kg"></label>') > 0 &&
    h.indexOf('<span class="costos-campo-tit">Costo por bolsa:</span><input type="text" inputmode="numeric" class="form-input costos-input" data-i="0" value="2000"') > 0, h);
  t('  el granel sin bolsas dice "Costo por kilo:" (01/10)', (h.match(/Costo por bolsa:/g) || []).length === 2 &&
    h.indexOf('<label class="costos-campo"><span class="costos-campo-tit">Costo por kilo:</span><input type="text" inputmode="numeric" ' +
      'class="form-input costos-input" data-i="2" value="9000" aria-label="Nuevo costo de Almendra"></label>') > 0, h);
  t('  y lo dice arriba', h.indexOf('En las bolsas va lo que costó la bolsa entera, como al cargar el producto.') > 0);
  t('  con el "?" del redondeo abajo, afuera de la lista (adentro se cortaba), abriéndose hacia arriba: NO SE PIERDE DINERO',
    h.indexOf('</div></div><p class="ayuda-linea"><span class="ayuda-tip der ancho" tabindex="0"') > 0 &&
    h.indexOf('data-tip="NO SE PIERDE DINERO.') > 0 && h.indexOf('¿Por qué a veces la bolsa muestra unos pesos de más o de menos?</p><div class="dlg-pie">') > 0, h);
  t('al lado de cada una, cómo queda: el kilo, el precio y el mayorista, como en la tabla de bolsas', h.indexOf('<div class="costos-vista" data-i="1" aria-live="polite">' +
    '<span>Costo $667 el kilo</span><span>Precio <b>$967</b> el kilo</span><span class="vfe-may">Mayorista $1.000 el kilo</span></div>') > 0, h);
  t('  un granel sin bolsas, igual que en el formulario', h.indexOf('<div class="costos-vista" data-i="2" aria-live="polite"><span>Costo $9.000 el kilo</span><span>Precio <b>$13.500</b> el kilo</span>') > 0);
  m.conInputs(['2000', '2.100', '9000']);
  await (m.api.guardarEditorCostos());
  const w3 = m.escrituras.find(x => x.id === 'b3'), w1 = m.escrituras.find(x => x.id === 'b1');
  t('$2.100 la bolsa de 3 kg se guarda por kilo: $700, con su precio y su mayorista', w3 && w3.campos.costo === 700 &&
    w3.campos.precio === 1015 && w3.campos.precioMayorista === 1050, w3 && JSON.stringify(w3.campos));
  t('  la de 1 kg, sin cambiar, solo se confirma', w1 && Object.keys(w1.campos).join() === 'costoActualizadoEn');
  t('  y el historial dice que es el kilo', m.historial[0].indexOf('Prueba1 x 3 kg -> $700 el kilo') > 0, m.historial);
  const m2 = armar({ productos: [Object.assign({}, b3, { costo: 667 })], conVariantes: true });
  m2.ctx.allProducts.push(Object.assign({}, b1));
  m2.api.abrirEditorCostos([{ producto: m2.ctx.allProducts[0], fecha: hace(92), dias: 92 }], 'min');
  m2.conInputs(['2000']);
  await (m2.api.guardarEditorCostos());
  t('volver a escribir $2.000 (lo que se cargó) no cambia nada: da el mismo kilo', m2.escrituras.length === 1 &&
    Object.keys(m2.escrituras[0].campos).join() === 'costoActualizadoEn');
}
{
  /* Pedido del dueño (01/10): en un granel sin otras bolsas que sabe de cuánto es su bolsa (anotada
     aparte, bolsaGramos, o en el nombre), al lado del costo por kilo va "o la bolsa de 5 kg",
     opcional: lo que dice la factura, y el costo por kilo sale solo. Se guarda el kilo. */
  const al = { id: 'al', nombre: 'Almendra', tipoVenta: 'peso', bolsaGramos: 5000, costo: 9000, porcentaje: 50, porcentajeMayorista: 20,
    precio: 13500, precioMayorista: 10800, costoActualizadoEn: hace(40) };
  const len = { id: 'len', nombre: 'Lenteja x 25 kg', tipoVenta: 'peso', costo: 1800, porcentaje: 50, porcentajeMayorista: 20,
    precio: 2700, precioMayorista: 2160, costoActualizadoEn: hace(40) };
  const ave = { id: 'ave', nombre: 'Avena', tipoVenta: 'peso', costo: 2000, porcentaje: 50, porcentajeMayorista: 20,
    precio: 3000, precioMayorista: 2400, costoActualizadoEn: hace(40) };
  const arr = { id: 'arr', nombre: 'Arroz', tipoVenta: 'peso', bolsaGramos: 1000, costo: 1500, porcentaje: 50, porcentajeMayorista: 20,
    precio: 2250, precioMayorista: 1800, costoActualizadoEn: hace(40) };
  const gal = { id: 'gal', nombre: 'Galletitas', tipoVenta: 'unidad', bolsaGramos: 5000, costo: 900, porcentaje: 50, porcentajeMayorista: 20,
    precio: 1350, precioMayorista: 1080, costoActualizadoEn: hace(40) };
  const b1 = { id: 'b1', nombre: 'Prueba1', gramaje: '1 kg', tipoVenta: 'peso', costo: 2000, porcentaje: 45, porcentajeMayorista: 43,
    precio: 2900, precioMayorista: 2900, costoActualizadoEn: hace(92) };
  const b3 = { id: 'b3', nombre: 'Prueba1 x 3 kg', gramaje: '3 kg', tipoVenta: 'peso', gramajePadreId: 'b1', costo: 667, porcentaje: 45,
    porcentajeMayorista: 45, precio: 967, precioMayorista: 1000, costoActualizadoEn: hace(92) };
  const m = armar({ productos: [al, len, ave, arr, gal, b1, b3], conVariantes: true });
  m.api.abrirEditorCostos([al, len, ave, arr, gal, b3].map(p => ({ producto: p, fecha: hace(40), dias: 40 })), 'inicio');
  const h = m.elementos.costosEditor.innerHTML;
  t('un granel con su bolsa anotada (5 kg) suma "O el costo de la bolsa de 5 kg", opcional; el costo por kilo sigue igual (01/10)',
    h.indexOf('value="9000" aria-label="Nuevo costo de Almendra"') > 0 &&
    h.indexOf('<div class="costos-bolsa"><span class="costos-bolsa-lbl"><i class="bi bi-arrow-return-right"></i>O el costo de la bolsa de 5 kg:</span>' +
      '<input type="text" inputmode="numeric" class="form-input costos-bolsa-input" data-i="0" placeholder="de la factura" ' +
      'aria-label="Costo de la bolsa de 5 kg de Almendra"></div>') > 0, h);
  t('  esa fila va en dos renglones (con-bolsa); las demás, como siempre', (h.match(/<div class="costos-fila con-bolsa">/g) || []).length === 2 &&
    (h.match(/<div class="costos-fila">/g) || []).length === 4);
  t('  también si la bolsa la dice el nombre ("x 25 kg")', h.indexOf('O el costo de la bolsa de 25 kg:') > 0 && /costos-bolsa-input" data-i="1"/.test(h));
  t('  sin tamaño, de 1 kg (es lo mismo que el kilo), por unidad o en una bolsa de un grupo (ya va por bolsa), no',
    !/costos-bolsa-input" data-i="[2-5]"/.test(h));
  t('  arriba de cada campo, qué costo va: por bolsa en la del grupo, por kilo en los granel, por unidad en el resto (01/10)',
    (h.match(/Costo por bolsa:/g) || []).length === 1 && (h.match(/Costo por kilo:/g) || []).length === 4 &&
    (h.match(/Costo por unidad:/g) || []).length === 1 &&
    h.indexOf('<span class="costos-campo-tit">Costo por bolsa:</span><input type="text" inputmode="numeric" class="form-input costos-input" data-i="5"') > 0 &&
    h.indexOf('<span class="costos-campo-tit">Costo por kilo:</span><input type="text" inputmode="numeric" class="form-input costos-input" data-i="0"') > 0 &&
    h.indexOf('<span class="costos-campo-tit">Costo por unidad:</span><input type="text" inputmode="numeric" class="form-input costos-input" data-i="4"') > 0, h);
  m.conInputs(['9000', '1800', '2000', '1500', '900', '2001']);
  m.api.costoBolsaEnEditor({ value: '32.500', getAttribute: () => '0' });
  t('  escribir lo que costó la bolsa pone el costo por kilo: $32.500 la de 5 kg son $6.500, y avisa que cambió',
    m.inputs[0].value === '6500' && m.inputs[0].eventos.join() === 'input', m.inputs[0].value);
  m.api.costoBolsaEnEditor({ value: '', getAttribute: () => '1' });
  t('  vacío no toca nada', m.inputs[1].value === '1800' && !m.inputs[1].eventos.length);
  /* Revisión del 01/10: borrando de a un número, el kilo quedaba con la cuenta del último. */
  m.api.costoBolsaEnEditor({ value: '20000', getAttribute: () => '1' });
  m.api.costoBolsaEnEditor({ value: '2000', getAttribute: () => '1' });
  const aMedias = m.inputs[1].value;
  m.api.costoBolsaEnEditor({ value: '', getAttribute: () => '1' });
  t('  borrar lo de la bolsa vuelve el kilo a como estaba ($1.800), no a la cuenta del último número', aMedias === '80' &&
    m.inputs[1].value === '1800' && m.inputs[1].eventos.join() === 'input,input,input', m.inputs[1].value);
  await (m.api.guardarEditorCostos());
  const wa = m.escrituras.find(x => x.id === 'al');
  t('  y se guarda el kilo, como siempre: $6.500, con su precio', !!wa && wa.campos.costo === 6500 && wa.campos.precio === 9750 &&
    m.escrituras.length === 1, JSON.stringify(m.escrituras));
}
{
  /* Revisión del 01/10: "1/2 kg" o "x 1.000 grs" en el nombre se leían como 2 kg y 1 g: no se toman. */
  const yer = { id: 'yer', nombre: 'Yerba 1/2 kg', tipoVenta: 'peso', costo: 8000, porcentaje: 50, porcentajeMayorista: 20,
    precio: 12000, precioMayorista: 9600, costoActualizadoEn: hace(40) };
  const coc = { id: 'coc', nombre: 'Coco Rallado x 1.000 grs', tipoVenta: 'peso', costo: 6000, porcentaje: 50, porcentajeMayorista: 20,
    precio: 9000, precioMayorista: 7200, costoActualizadoEn: hace(40) };
  const m = armar({ productos: [yer, coc], conVariantes: true });
  m.api.abrirEditorCostos([yer, coc].map(p => ({ producto: p, fecha: hace(40), dias: 40 })), 'inicio');
  const h = m.elementos.costosEditor.innerHTML;
  t('"Yerba 1/2 kg" o "x 1.000 grs" no suman "O el costo de la bolsa": se leían como 2 kg y 1 g (revisión del 01/10)',
    h.indexOf('costos-bolsa-input') < 0 && (h.match(/Costo por kilo:/g) || []).length === 2, h);
}
{
  /* Desde el panel de bolsas de Productos (admin-variantes.js, 27/09): "Cambiar costos". */
  const b1 = { id: 'b1', nombre: 'Prueba1', gramaje: '1 kg', tipoVenta: 'peso', costo: 2000, porcentaje: 45, porcentajeMayorista: 43,
    precio: 2900, precioMayorista: 2900, costoActualizadoEn: hace(92) };
  const b3 = { id: 'b3', nombre: 'Prueba1 x 3 kg', gramaje: '3 kg', tipoVenta: 'peso', gramajePadreId: 'b1', costo: 667, porcentaje: 45,
    porcentajeMayorista: 45, precio: 967, precioMayorista: 1000, costoActualizadoEn: hace(92) };
  const venta = [{ id: 'b3', precio: 967, costo: 667, cantidad: 500, tipoVenta: 'peso' }];
  const m = armar({ productos: [b1, b3], ventaItems: venta, conVariantes: true });
  let campana = 0;
  m.ctx._refrescarAlertas = () => { campana++; };
  m.api.abrirEditorCostos([b1, b3].map(p => ({ producto: p, fecha: hace(92), dias: 92 })), 'prod', 'b3');
  const h = m.elementos.costosEditor.innerHTML;
  t('desde Productos: "Cambiar costos", con "Cancelar" y "Sigue igual"', h.indexOf('>Cambiar costos<') > 0 && h.indexOf('>Cancelar<') > 0 &&
    h.indexOf('Volver a la venta') < 0 && h.split('class="costos-sigue"').length === 3);
  m.conInputs(['2000', '2.100']);
  m.conCasillas([false, false]);
  await (m.api.guardarEditorCostos());
  t('  guarda solo la que cambió', m.escrituras.length === 1 && m.escrituras[0].id === 'b3' && b3.costo === 700 && b1.costoActualizadoEn.getTime() === hace(92).getTime());
  t('  no toca una venta abierta', venta[0].precio === 967 && venta[0].costo === 667 && m.repintados.length === 0);
  t('  el historial dice de dónde vino', m.historial[0].indexOf('Costos cambiados desde Productos: 1 cambiado, 0 confirmados') === 0, m.historial);
  t('  el aviso no habla de ninguna lista', m.avisos.indexOf('success: Listo: 1 costo cambiado, con su precio nuevo.') >= 0, m.avisos);
  t('  y avisa a la campana', campana === 1);
  /* Copias con el costo de antes: el guardado de arriba dejó la de 3 kg en $700. */
  const m2 = armar({ productos: [Object.assign({}, b1, { costo: 2000 }), Object.assign({}, b3, { costo: 667 })], conVariantes: true });
  m2.api.abrirEditorCostos(m2.ctx.allProducts.map(p => ({ producto: p, fecha: null, dias: null })), 'prod');
  const h2 = m2.elementos.costosEditor.innerHTML;
  t('sin fecha dice "sin fecha de cambio" (no "hace undefined días")', h2.indexOf('sin fecha de cambio') > 0 && h2.indexOf('undefined') < 0);
  const m3 = armar({ productos: [{ id: 'z', nombre: 'Almendra', tipoVenta: 'peso', costo: 9000, porcentaje: 50, costoActualizadoEn: hace(40) }], conVariantes: true });
  m3.api.abrirEditorCostos([{ producto: m3.ctx.allProducts[0], fecha: hace(40), dias: 40 }], 'min');
  t('sin bolsas no aparece el "?" del redondeo', m3.elementos.costosEditor.innerHTML.indexOf('ayuda-linea') < 0);
  m3.api.cerrarEditorCostos();
  m2.conInputs(['2000', '2001']);
  m2.conCasillas([false, false]);
  await (m2.api.guardarEditorCostos());
  t('  sin tocar nada no se escribe nada, y se dice sin hablar de una lista', m2.escrituras.length === 0 &&
    m2.avisos.indexOf('info: No cambiaste ningún costo.') >= 0, m2.avisos);
}
{
  /* Revisión del 27/09, #1: en una bolsa de menos de 1 kg la cuenta de la bolsa al kilo y de
     vuelta no es exacta, y una fila sin tocar se guardaba como cambio, con precio nuevo. */
  const mk = () => [
    { id: 'm1', nombre: 'Maní', gramaje: '1 kg', tipoVenta: 'peso', costo: 3000, porcentaje: 50, porcentajeMayorista: 30, precio: 4500, precioMayorista: 3900, costoActualizadoEn: hace(40) },
    { id: 'm5', nombre: 'Maní x 500 g', gramaje: '500 g', tipoVenta: 'peso', gramajePadreId: 'm1', costo: 3001, porcentaje: 50, porcentajeMayorista: 30,
      precio: 4600, precioMayorista: 4000, costoActualizadoEn: hace(40) },
  ];
  const m = armar({ productos: mk(), conVariantes: true });
  m.api.abrirEditorCostos(m.ctx.allProducts.map(p => ({ producto: p, fecha: hace(40), dias: 40 })), 'prod');
  t('la bolsa de 500 g a $3.001 el kilo se muestra como $1.501', m.elementos.costosEditor.innerHTML.indexOf('value="1501"') > 0);
  m.conInputs(['3000', '1501']);
  m.conCasillas([false, false]);
  await (m.api.guardarEditorCostos());
  t('  sin tocarla no se escribe nada (antes guardaba $3.002 el kilo y recalculaba el precio)', m.escrituras.length === 0 &&
    m.ctx.allProducts[1].costo === 3001 && m.ctx.allProducts[1].precio === 4600, JSON.stringify(m.escrituras));
  const m2 = armar({ productos: mk(), conVariantes: true });
  m2.api.abrirEditorCostos(m2.ctx.allProducts.map(p => ({ producto: p, fecha: hace(40), dias: 40 })), 'inicio');
  m2.conInputs(['3000', '1501']);
  m2.conCasillas([false, true]);
  await (m2.api.guardarEditorCostos());
  t('  con "Sigue igual" solo se confirma la fecha: el costo y el precio redondeado quedan', m2.escrituras.length === 1 &&
    Object.keys(m2.escrituras[0].campos).join() === 'costoActualizadoEn' && m2.ctx.allProducts[1].precio === 4600 && m2.ctx.allProducts[1].costo === 3001);
  const venta = [{ id: 'm5', precio: 4600, costo: 3001, cantidad: 500, tipoVenta: 'peso' }];
  const m3 = armar({ productos: mk(), conVariantes: true, ventaItems: venta });
  m3.api.abrirEditorCostos(m3.ctx.allProducts.map(p => ({ producto: p, fecha: hace(40), dias: 40 })), 'min');
  m3.conInputs(['3000', '1501']);
  await (m3.api.guardarEditorCostos());
  t('  y al vender, confirmar sin tocar no cambia el precio de la venta', m3.escrituras.length === 2 &&
    m3.escrituras.every(x => Object.keys(x.campos).join() === 'costoActualizadoEn') && venta[0].precio === 4600 && venta[0].costo === 3001);
}
{
  /* #11: en una bolsa grande, lo escrito que da el mismo kilo se confirma, y se dice. */
  const mk = () => [
    { id: 'y1', nombre: 'Yerba', gramaje: '1 kg', tipoVenta: 'peso', costo: 2100, porcentaje: 50, precio: 3150, costoActualizadoEn: hace(40) },
    { id: 'y5', nombre: 'Yerba x 5 kg', gramaje: '5 kg', tipoVenta: 'peso', gramajePadreId: 'y1', costo: 2000, porcentaje: 50, precio: 3000, costoActualizadoEn: hace(40) },
  ];
  const m = armar({ productos: mk(), conVariantes: true });
  m.api.abrirEditorCostos(m.ctx.allProducts.map(p => ({ producto: p, fecha: hace(40), dias: 40 })), 'prod');
  m.conInputs(['2100', '10.002']);
  m.conCasillas([false, false]);
  await (m.api.guardarEditorCostos());
  t('bolsa de 5 kg: $10.002 da el mismo kilo que $10.000; se confirma con la fecha (antes: "No cambiaste ningún costo")',
    m.escrituras.length === 1 && m.escrituras[0].id === 'y5' && Object.keys(m.escrituras[0].campos).join() === 'costoActualizadoEn', JSON.stringify(m.escrituras));
  t('  y lo dice', m.avisos.indexOf('success: Listo: 1 quedó igual por el redondeo del kilo.') >= 0, m.avisos);
}
{
  /* #6: se guarda una sola vez, y no se cierra otra ventana abierta mientras tanto. */
  const mk = () => [{ id: 'a', nombre: 'Almendra', costo: 1000, porcentaje: 50, precio: 1500, costoActualizadoEn: hace(40) },
    { id: 'b', nombre: 'Banana', costo: 900, porcentaje: 40, precio: 1260, costoActualizadoEn: hace(40) }];
  const m = armar({ productos: mk() });
  m.api.abrirEditorCostos([{ producto: m.ctx.allProducts[0], fecha: hace(40), dias: 40 }], 'prod');
  m.conInputs(['1100']);
  m.conCasillas([false]);
  await Promise.all([m.api.guardarEditorCostos(), m.api.guardarEditorCostos()]);
  t('dos Enter seguidos guardan una sola vez', m.escrituras.length === 1 && m.historial.length === 1 &&
    m.avisos.filter(a => a.indexOf('success:') === 0).length === 1, JSON.stringify([m.escrituras.length, m.historial.length]));
  const n = armar({ productos: mk() });
  n.api.abrirEditorCostos([{ producto: n.ctx.allProducts[0], fecha: hace(40), dias: 40 }], 'prod');
  n.conInputs(['1100']);
  n.conCasillas([false]);
  const guardando = n.api.guardarEditorCostos();
  n.api.cerrarEditorCostos();
  n.api.abrirEditorCostos([{ producto: n.ctx.allProducts[1], fecha: hace(40), dias: 40 }], 'prod');
  await guardando;
  t('  si mientras guardaba se abrió otra ventana, esa queda abierta', !!n.elementos.costosEditor &&
    n.elementos.costosEditor.innerHTML.indexOf('Banana') > 0 && n.ctx.allProducts[0].costo === 1100);
}
{
  /* #9 y #10: la vista previa es la de la tabla de bolsas (caja cerrada, oferta) y con el
     costo de siempre muestra los precios que tiene, no la cuenta. */
  const caja = { id: 'cx', nombre: 'Alfajor x12', gramaje: 'x12', tipoVenta: 'unidad', cajaCerrada: true, costo: 6000, porcentaje: 60, porcentajeMayorista: 30,
    precio: 9600, precioMayorista: 7800, descuento: 10, costoActualizadoEn: hace(40) };
  const alm = { id: 'al', nombre: 'Almendra', tipoVenta: 'unidad', costo: 1234, porcentaje: 50, porcentajeMayorista: 20,
    precio: 1900, precioMayorista: 1500, costoActualizadoEn: hace(40) };
  const m = armar({ productos: [caja, alm], conVariantes: true });
  m.api.abrirEditorCostos([caja, alm].map(p => ({ producto: p, fecha: hace(40), dias: 40 })), 'min');
  const h = m.elementos.costosEditor.innerHTML;
  t('caja cerrada: primero lo que se cobra (el mayorista), y con la oferta', h.indexOf('<span>Se cobra <b>$7.800</b> (caja cerrada, precio mayorista)</span>') > 0 &&
    h.indexOf('Con el 10% de descuento: $7.020') > 0, h);
  t('con el costo de siempre, el precio que tiene (redondeado a $1.900), no la cuenta ($1.851)', h.indexOf('Precio <b>$1.900</b>') > 0 &&
    h.indexOf('$1.851') < 0);
}
{
  /* #2: el aviso al vender dice el costo como se carga: en una bolsa, lo de la bolsa. */
  const b1 = { id: 'b1', nombre: 'Prueba1', gramaje: '1 kg', tipoVenta: 'peso', costo: 2000, porcentaje: 45, costoActualizadoEn: hace(92) };
  const b3 = { id: 'b3', nombre: 'Prueba1 x 3 kg', gramaje: '3 kg', tipoVenta: 'peso', gramajePadreId: 'b1', costo: 667, porcentaje: 45, costoActualizadoEn: hace(92) };
  let msg = '';
  const m = armar({ productos: [b1, b3], conVariantes: true, pedirOpcion: async texto => { msg = texto; return 'ignorar'; } });
  await m.api.avisoCostosViejos([{ id: 'b3' }], 'min');
  t('el aviso dice "$2.001 la bolsa ($667 el kilo)", como la ventana que abre', msg.indexOf('Prueba1 x 3 kg: $2.001 la bolsa ($667 el kilo), cambiado el') > 0, msg);
}
{
  /* El nombre en el aviso de error va escapado: showAdminToast usa innerHTML. */
  const p = { id: 'z', nombre: 'Aceite <sin TACC>', costo: 1000, porcentaje: 50, precio: 1500, costoActualizadoEn: hace(40) };
  const m = armar({ productos: [p] });
  m.ctx.esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  m.api.abrirEditorCostos([{ producto: p, fecha: hace(40), dias: 40 }], 'min');
  m.conInputs(['']);
  await (m.api.guardarEditorCostos());
  t('un nombre con "<" va escapado en el aviso de error', m.avisos.some(a => a.indexOf('Aceite &lt;sin TACC&gt;') > 0), m.avisos);
}
{
  /* Con varios tamaños, "Costo y precio" (con la fecha de arriba) queda escondido: la
     fecha va debajo de cada fila de la tabla (admin-variantes.js). */
  /* La fila cuenta desde hoy (Date.now), no desde AHORA: fechas relativas a hoy. */
  const haceHoy = d => new Date(Date.now() - d * DIA - 3600000);
  const viejo = { id: 'v', nombre: 'Yerba x 3 kg', costo: 4500, costoActualizadoEn: haceHoy(62) };
  const nuevo = { id: 'n', nombre: 'Yerba x 1 kg', costo: 5000, costoActualizadoEn: haceHoy(5) };
  const m = armar({ productos: [viejo, nuevo], conVariantes: true });
  const hv = m.ctx._fechaCostoHtml(viejo), hn = m.ctx._fechaCostoHtml(nuevo);
  t('la fila de un costo de hace 62 días lo dice en amarillo, con el mismo aviso que al vender', hv.indexOf('vfe-vieja') > 0 &&
    hv.indexOf('(hace 62 días). Desactualizado: al venderlo se va a avisar.') > 0, hv);
  t('  la de uno de hace 5 días, solo la fecha', hn.indexOf('vfe-vieja') < 0 && hn.indexOf('(hace 5 días).') > 0 && hn.indexOf('Desactualizado') < 0);
  t('  y sin fecha registrada, nada (como arriba: no se puede saber)', m.ctx._fechaCostoHtml({ id: 'x', costo: 1 }) === '');
  const src = leer('admin-variantes.js');
  t('  va en las filas de las otras y en la de este producto', src.indexOf("(f.id ? _fechaCostoHtml(_varProds().find(x => x && x.id === f.id)) : '')") > 0 &&
    src.indexOf('_fechaCostoHtml(_varProds().find(x => x && x.id === _varPrincipalActual()))') > 0);
}

/* ================================== LA MISMA CUENTA QUE EL FORMULARIO */
console.log('\n-- la cuenta del precio es la del formulario --');
{
  const save = cuerpo(html, 'saveProduct');
  t('saveProduct sigue calculando precio = costo × (1 + %)', save.indexOf('const precioCalc=Math.round(costo*(1+porcentaje/100));') > 0);
  t('  y el mayorista con _redondearMayorista; con el % en 0, sin mayorista (01/10)',
    save.indexOf('const precioMayCalc=pctMay>0?_redondearMayorista(Math.round(costo*(1+pctMay/100))):0;') > 0);
  t('  el formulario muestra lo mismo mientras se escribe',
    cuerpo(html, 'calcPrecioModal').indexOf('elMay.value=pctMay>0?_redondearMayorista(Math.round(costo*(1+pctMay/100))):0;') > 0);
  t('  y la carga masiva de % mayorista, igual',
    cuerpo(html, 'aplicarMayoristaPct').indexOf('const precioMay=pctMay>0?_redondearMayorista(Math.round((p.costo||0)*(1+pctMay/100))):0;') > 0);
  const { api, ctx } = armar();
  ctx._redondearMayorista = n => (n ? Math.ceil(n / 50) * 50 : 0);
  const r = api.preciosDesdeCosto({ porcentaje: 35, porcentajeMayorista: 10 }, 1234);
  t('el editor da lo mismo: 1234 con 35% y 10% -> 1666 y 1400', r.precio === 1666 && r.precioMayorista === 1400, JSON.stringify(r));
}

{
  /* Pedido del dueño (01/10): si al guardar una bolsa queda más cara por kilo que una más chica del
     mismo producto, se avisa y se pregunta; "Volver" deja la ventana abierta. */
  const grupo = () => [
    { id: 'g1', nombre: 'Yerba', gramaje: '1 kg', tipoVenta: 'peso', costo: 4000, porcentaje: 50, precio: 6000, porcentajeMayorista: 20,
      precioMayorista: 4800, costoActualizadoEn: hace(40) },
    { id: 'g3', nombre: 'Yerba x 3 kg', gramaje: '3 kg', tipoVenta: 'peso', gramajePadreId: 'g1', costo: 3500, porcentaje: 50, precio: 5250,
      porcentajeMayorista: 20, precioMayorista: 4200, costoActualizadoEn: hace(40) },
  ];
  const abrir = resp => {
    const preguntas = [];
    const m = armar({ productos: grupo(), conVariantes: true, pedirConfirmacion: async (txt, op) => { preguntas.push({ txt, op }); return resp(); } });
    /* Los tamaños como en el panel ("1 kg", no "1000 g"): fmtPeso de verdad, de admin.html. */
    vm.runInContext(cuerpo(html, 'fmtPeso'), m.ctx);
    m.api.abrirEditorCostos(m.ctx.allProducts.map(p => ({ producto: p, fecha: hace(40), dias: 40 })), 'inicio');
    return { m, preguntas };
  };
  const a = abrir(() => false);
  a.m.conInputs(['4000', '13500']);
  await a.m.api.guardarEditorCostos();
  const p0 = a.preguntas[0];
  t('si la bolsa de 3 kg queda más cara por kilo que la de 1 kg ($6.750 contra $6.000), pregunta antes de guardar (01/10)',
    a.preguntas.length === 1 && p0.op.titulo === 'Ojo: la bolsa más grande quedaría más cara' && p0.op.aceptar === 'Guardar igual' &&
    p0.op.cancelar === 'Volver' && p0.txt.indexOf('Yerba:\n- Bolsa de 1 kg: $6.000 el kilo\n- Bolsa de 3 kg: $6.750 el kilo, más cara') > 0 &&
    /Si tocás "Volver", no se guarda nada y podés corregirlo\. ¿Querés guardar igual\?$/.test(p0.txt), JSON.stringify(a.preguntas));
  const g3a = a.m.ctx.allProducts.find(x => x.id === 'g3');
  t('  "Volver" no guarda nada y deja la ventana abierta', a.m.escrituras.length === 0 && !!a.m.elementos.costosEditor &&
    g3a.costo === 3500 && g3a.precio === 5250 && g3a.precioMayorista === 4200);
  const b = abrir(() => true);
  b.m.conInputs(['4000', '13500']);
  await b.m.api.guardarEditorCostos();
  const w3 = b.m.escrituras.find(x => x.id === 'g3');
  t('  "Guardar igual" guarda: $4.500 el kilo, precio $6.750 y mayorista $5.400, y la de 1 kg no se toca',
    !!w3 && w3.campos.costo === 4500 && w3.campos.precio === 6750 && w3.campos.precioMayorista === 5400 &&
    !b.m.escrituras.some(x => x.id === 'g1') && !b.m.elementos.costosEditor, JSON.stringify(b.m.escrituras));
  const c = abrir(() => { throw new Error('no tenía que preguntar'); });
  c.m.conInputs(['4000', '11400']);
  await c.m.api.guardarEditorCostos();
  const w3c = c.m.escrituras.find(x => x.id === 'g3');
  t('  si no queda más cara ($11.400 la bolsa = $3.800 el kilo, $5.700 y $4.600), no pregunta y guarda',
    c.preguntas.length === 0 && !!w3c && w3c.campos.costo === 3800 && w3c.campos.precio === 5700 && w3c.campos.precioMayorista === 4600);
  t('el Escape de la ventana de costos no la cierra si hay otro diálogo encima (el aviso)',
    /function _costosTecla\(e\) \{[\s\S]{0,300}document\.querySelector\('\.dlg-overlay:not\(#costosEditor\)'\)/.test(SRC));
}

console.log('\n-- el % mayorista en 0 y vender al mayorista sin ganancia (01/10) --');
{
  /* Pedido del dueño (01/10): con el % mayorista en 0, sin precio mayorista. Antes, el costo
     redondeado: al mayorista se vendía sin ganar nada. */
  const { api, ctx } = armar();
  ctx._redondearMayorista = n => (n ? Math.ceil(n / 50) * 50 : 0);
  const r0 = api.preciosDesdeCosto({ porcentaje: 65, porcentajeMayorista: 0 }, 21500);
  t('con el % mayorista en 0, el mayorista queda en 0 (antes $21.500, el costo) y el precio como siempre',
    r0.precioMayorista === 0 && r0.precio === 35475, JSON.stringify(r0));
  t('  con %, como siempre: 21.500 con 10% -> 23.650', api.preciosDesdeCosto({ porcentaje: 65, porcentajeMayorista: 10 }, 21500).precioMayorista === 23650);
  t('  sin el campo, igual que en 0', api.preciosDesdeCosto({ porcentaje: 65 }, 21500).precioMayorista === 0);
}
{
  const m = armar({ conVariantes: true });
  const p = { id: 'alm', nombre: 'Almendras', tipoVenta: 'peso', costo: 21500, porcentaje: 65, porcentajeMayorista: 0, precio: 35475, precioMayorista: 21500 };
  const h = m.ctx._costoVistaHtml(p, 23000, null);
  t('al lado del costo, sin % mayorista lo dice (antes salía el de mostrador como si fuera el mayorista)',
    h === '<span>Costo $23.000 el kilo</span><span>Precio <b>$37.950</b> el kilo</span><span class="vfe-may">Sin mayorista: se cobra el de mostrador</span>', h);
  t('  con el costo de siempre, el mayorista que tiene guardado', m.ctx._costoVistaHtml(p, 21500, null).indexOf('<span class="vfe-may">Mayorista $21.500 el kilo</span>') > 0);
  const s = armar();
  const hs = s.ctx._costoVistaHtml({ id: 'u', nombre: 'Aceite', costo: 100, porcentaje: 50, porcentajeMayorista: 0, precio: 150, precioMayorista: 0 }, 200, null);
  t('  sin la tabla de bolsas, lo mismo', hs === '<span>Precio <b>$300</b></span><span class="costos-may">Sin mayorista: se cobra el de mostrador</span>', hs);
}
{
  /* Al registrar una venta mayorista, lo que se cobra lo mismo que costó (o casi) se avisa. */
  const prods = [
    { id: 'alm', nombre: 'Almendras', tipoVenta: 'peso', costo: 21500, porcentajeMayorista: 0, precio: 35475, precioMayorista: 21500 },
    { id: 'caf', nombre: 'Mula Cafe', costo: 10110, porcentajeMayorista: 0, precio: 16682, precioMayorista: 10150 },
    { id: 'ace', nombre: 'Aceite', costo: 16400, porcentajeMayorista: 30, precio: 31160, precioMayorista: 21350 },
  ];
  const items = () => [
    { id: 'alm', nombre: 'Almendras', precio: 21500, costo: 21500, cantidad: 2000, descuento: 0, tipoVenta: 'peso' },
    { id: 'caf', nombre: 'Mula Cafe', precio: 10150, costo: 10110, cantidad: 3, descuento: 0, tipoVenta: 'unidad' },
    { id: 'ace', nombre: 'Aceite', precio: 21350, costo: 16400, cantidad: 1, descuento: 0, tipoVenta: 'unidad' },
  ];
  const preguntas = [];
  const m = armar({ productos: prods, pedirConfirmacion: async (txt, op) => { preguntas.push({ txt, op }); return false; } });
  const sigue = await m.ctx.avisoMayoristaSinGanancia(items());
  const q = preguntas[0];
  t('venta mayorista: lo que se cobra lo mismo que costó (o casi) se avisa con el precio y el costo, y pregunta',
    sigue === false && preguntas.length === 1 && q.op.titulo === 'Se vende sin ganancia' && q.op.aceptar === 'Registrar igual' && q.op.cancelar === 'Volver' &&
    q.txt === 'Estos productos se cobran lo mismo que costaron (o casi): no ganás nada con ellos.\n\n' +
      '- Almendras: se cobra $21.500 el kilo y costó $21.500 el kilo\n- Mula Cafe: se cobra $10.150 y costó $10.110\n\n' +
      'Revisales el % de ganancia mayorista en Productos. ¿Registrar la venta igual?', JSON.stringify(preguntas));
  t('  el que deja ganancia (Aceite: $21.350 contra $16.400) no aparece', q.txt.indexOf('Aceite') < 0);
  const m2 = armar({ productos: prods, pedirConfirmacion: async () => { throw new Error('no tenía que preguntar'); } });
  t('  sin ninguno así, no pregunta y la venta sigue', (await m2.ctx.avisoMayoristaSinGanancia([items()[2]])) === true);
  t('  sin costo cargado no se sabe: no avisa', (await m2.ctx.avisoMayoristaSinGanancia([{ id: 'x', nombre: 'X', precio: 500, costo: 0, cantidad: 1 }])) === true);
  const m3 = armar({ productos: prods, pedirConfirmacion: async txt => { preguntas.push({ txt }); return true; } });
  const conDsc = [{ id: 'ace', nombre: 'Aceite', precio: 21350, costo: 16400, cantidad: 1, descuento: 25, tipoVenta: 'unidad' }];
  const ult = () => preguntas[preguntas.length - 1].txt;
  t('  "Registrar igual" deja seguir; y un descuento que lo deja en el costo o menos también se avisa ($16.013 contra $16.400)',
    (await m3.ctx.avisoMayoristaSinGanancia(conDsc)) === true &&
    ult() === 'Este producto se cobra lo mismo que costó (o casi): no ganás nada con él.\n\n- Aceite: se cobra $16.013 y costó $16.400\n\n' +
      'Revisá su % de ganancia mayorista en Productos. ¿Registrar la venta igual?', ult());
  const s = armar({ productos: prods });
  t('  si el diálogo no cargó, la venta no se frena', (await s.ctx.avisoMayoristaSinGanancia(items())) === true);
  t('sin ganancia es el costo redondeado a $50 o menos: 10.150 con costo 10.110 sí, 10.200 no', s.ctx._mayoristaSinGanancia(10150, 10110) === true &&
    s.ctx._mayoristaSinGanancia(10200, 10110) === false && s.ctx._mayoristaSinGanancia(21500, 21500) === true && s.ctx._mayoristaSinGanancia(500, 0) === false);
}

/* ======================================================== ENCHUFADO */
console.log('\n-- enchufado --');
t('admin.html carga el módulo', html.indexOf('<script src="admin-costos.js"></script>') > 0);
{
  const sv = cuerpo(html, 'saveVenta');
  const iAviso = sv.indexOf("avisoCostosViejos(ventaItems,'min')");
  t('la venta minorista avisa antes de escribir nada', iAviso > 0 && iAviso < sv.indexOf("btn.disabled=true"));
  t('  solo al crear, no al editar una venta vieja', /if\(!isEdit&&typeof avisoCostosViejos==='function'&&!\(await avisoCostosViejos\(ventaItems,'min'\)\)\)return;/.test(sv));
  const sm = cuerpo(html, 'saveVentaMay');
  const iAvisoM = sm.indexOf("avisoCostosViejos(ventaMayItems,'may')");
  t('la mayorista también, antes de escribir', iAvisoM > 0 && iAvisoM < sm.indexOf('btn.disabled=true'));
  t('  y también solo al crear', /if\(!editingVentaMayId&&typeof avisoCostosViejos==='function'&&!\(await avisoCostosViejos\(ventaMayItems,'may'\)\)\)return;/.test(sm));
  const iSin = sm.indexOf('avisoMayoristaSinGanancia(ventaMayItems)');
  t('la venta mayorista avisa lo que se cobra sin ganancia antes de escribir (01/10)', iSin > 0 && iSin < sm.indexOf('btn.disabled=true'));
  t('  al crear y al editar, como el de "Falta el precio mayorista"',
    /if\(typeof avisoMayoristaSinGanancia==='function'&&!\(await avisoMayoristaSinGanancia\(ventaMayItems\)\)\)return;/.test(sm));
}
t('el formulario muestra la fecha del último cambio de costo', html.indexOf('<small id="pCostoFecha" class="costo-fecha"></small>') > 0);
t('  al abrir un producto y al crear uno nuevo', /value=p\.costo\|\|0;if\(typeof pintarFechaCosto==='function'\)pintarFechaCosto\(p\);/.test(html) &&
  /value='0';if\(typeof pintarFechaCosto==='function'\)pintarFechaCosto\(null\);/.test(html));
t('la fecha la anota una Cloud Function que escucha la base', /exports\.registrarCambioDeCosto = onDocumentWritten\(/.test(leer('functions/index.js')));
{
  /* Revisión del 01/10: la ficha relee el producto apenas guarda (refrescarProductoLocal), antes de que
     la función anote la fecha, y el panel la seguía viendo vieja hasta F5. Ahora va en la misma escritura. */
  const i = html.indexOf("if((old.costo||0)!==data.costo){cambios.push('costo: $'+(old.costo||0)+' -> $'+data.costo);");
  const j = html.indexOf('data.costoActualizadoEn=firebase.firestore.FieldValue.serverTimestamp();}', i);
  t('  al guardar la ficha con otro costo, su fecha va en la misma escritura: la relectura ya la trae (revisión del 01/10)',
    i > 0 && j > i && j - i < 400);
}
t('el diálogo de varias opciones devuelve null al cerrarlo con Escape', /function pedirOpcion\(/.test(leer('admin-dialogo.js')) &&
  /if \(e\.key === 'Escape'\) \{ e\.preventDefault\(\); e\.stopPropagation\(\); cerrar\(null\); \}/.test(leer('admin-dialogo.js')));

  console.log('\n' + ok + ' pasaron, ' + fail + ' fallaron');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
