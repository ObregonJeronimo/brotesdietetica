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
  const inputs = [];
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
          querySelectorAll: sel => (sel === '.costos-input' ? inputs : []),
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
  vm.runInContext(SRC + '\n;this.__api = { fechaDeCosto, costosViejos, preciosDesdeCosto, avisoCostosViejos, ' +
    'abrirEditorCostos, guardarEditorCostos, cerrarEditorCostos };', ctx);
  /* Las filas del editor: un input por producto, con el valor que se escribe en la prueba. */
  const conInputs = valores => {
    inputs.length = 0;
    valores.forEach((v, i) => inputs.push({ value: String(v), getAttribute: () => String(i),
      addEventListener: () => {}, focus: () => {}, select: () => {} }));
  };
  return { ctx, api: ctx.__api, escrituras, avisos, historial, repintados, elementos, conInputs };
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
  const P = [{ id: 'c', nombre: 'Chia', costo: 800, tipoVenta: 'peso', costoActualizadoEn: hace(40) }];
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
