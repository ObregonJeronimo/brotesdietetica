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
    'abrirEditorCostos, guardarEditorCostos, cerrarEditorCostos };', ctx);
  /* Las filas del editor: un input por producto, con el valor que se escribe en la prueba. */
  const conInputs = valores => {
    inputs.length = 0;
    valores.forEach((v, i) => inputs.push({ value: String(v), getAttribute: () => String(i),
      addEventListener: () => {}, focus: () => {}, select: () => {} }));
  };
  /* Las casillas "Sigue igual" del editor abierto desde Inicio del día. */
  const conCasillas = tildadas => {
    casillas.length = 0;
    tildadas.forEach((v, i) => casillas.push({ checked: !!v, getAttribute: () => String(i) }));
  };
  return { ctx, api: ctx.__api, escrituras, avisos, historial, repintados, elementos, conInputs, conCasillas };
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
  t('  queda en el historial de dónde vino', m.historial[0].indexOf('Costos revisados desde Inicio del día: 1 cambiado, 0 confirmados') === 0);
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
  m.conInputs(['6500', '5500', '4800']);
  await (m.api.guardarEditorCostos());
  t('la caja cerrada toma el precio MAYORISTA nuevo, no el de lista', caja.precio === 10400 && venta[0].precio === caja.precioMayorista && venta[0].costo === 6500);
  t('los renglones del granel quedan todos al precio nuevo de la escala de 3 kg (no la bolsa de 1 kg al suyo)',
    y3.precio === 7680 && venta[1].precio === 7680 && venta[2].precio === 7680 && y1.precio === 8800);
  t('  cada uno con el costo nuevo de su bolsa', venta[1].costo === 4800 && venta[2].costo === 5500);
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
  t('  y el mayorista con _redondearMayorista', save.indexOf('const precioMayCalc=_redondearMayorista(Math.round(costo*(1+pctMay/100)));') > 0);
  const { api, ctx } = armar();
  ctx._redondearMayorista = n => (n ? Math.ceil(n / 50) * 50 : 0);
  const r = api.preciosDesdeCosto({ porcentaje: 35, porcentajeMayorista: 10 }, 1234);
  t('el editor da lo mismo: 1234 con 35% y 10% -> 1666 y 1400', r.precio === 1666 && r.precioMayorista === 1400, JSON.stringify(r));
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
}
t('el formulario muestra la fecha del último cambio de costo', html.indexOf('<small id="pCostoFecha" class="costo-fecha"></small>') > 0);
t('  al abrir un producto y al crear uno nuevo', /value=p\.costo\|\|0;if\(typeof pintarFechaCosto==='function'\)pintarFechaCosto\(p\);/.test(html) &&
  /value='0';if\(typeof pintarFechaCosto==='function'\)pintarFechaCosto\(null\);/.test(html));
t('la fecha la anota una Cloud Function que escucha la base', /exports\.registrarCambioDeCosto = onDocumentWritten\(/.test(leer('functions/index.js')));
t('el diálogo de varias opciones devuelve null al cerrarlo con Escape', /function pedirOpcion\(/.test(leer('admin-dialogo.js')) &&
  /if \(e\.key === 'Escape'\) \{ e\.preventDefault\(\); e\.stopPropagation\(\); cerrar\(null\); \}/.test(leer('admin-dialogo.js')));

  console.log('\n' + ok + ' pasaron, ' + fail + ' fallaron');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
