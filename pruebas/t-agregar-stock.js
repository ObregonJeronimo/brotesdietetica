/**
 * AGREGAR STOCK: SE ESCRIBE LO QUE LLEGÓ Y SE SUMA SOLO.
 *
 * Pedido del comercio (25/09/2026): en la sección Stock había que escribir el total. Con
 * 2.953 g en stock y 843 g que llegaban, la cuenta la hacía la persona. Ahora cada fila
 * tiene "Agregar stock" (se suma en la base, con increment: si otro vendió en el medio no
 * se pisa nada) y un lápiz para corregir el total después de contar.
 *
 * Corre admin-stock.js de verdad, con una base y un diálogo de mentira.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const RAIZ = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const SRC = leer('admin-stock.js');
const html = leer('admin.html');

let ok = 0, fail = 0;
const t = (d, c, extra) => {
  if (c) { ok++; console.log('  OK   ' + d); }
  else { fail++; console.log('  FALLA ' + d + (extra !== undefined ? '   [' + extra + ']' : '')); }
};

const catalogo = () => [
  { id: 'alm', nombre: 'Almendra', tipoVenta: 'peso', stock: 2953 },
  { id: 'alf', nombre: 'Alfajor', tipoVenta: 'unidad', stock: 12 },
];

/* Un panel de mentira. `base` es el stock que tiene la base de verdad (puede ser otro que
   el de la pantalla: alguien vendió mientras tanto). El diálogo se reemplaza por uno que
   contesta `respuesta`. */
function armar(opts) {
  const o = opts || {};
  const escrituras = [], historial = [], avisos = [], preguntas = [], repintados = [];
  const productos = o.productos || catalogo();
  const base = Object.assign({}, o.base || {});
  productos.forEach(p => { if (base[p.id] === undefined) base[p.id] = p.stock; });
  const ctx = {
    console, Math, Number, String, Object, Array, Promise, parseInt, isFinite, setTimeout: () => 0,
    allProducts: productos,
    esPorPeso: p => !!(p && p.tipoVenta === 'peso'),
    fmtPeso: g => (Math.abs(g) < 1000 ? g + ' g' : (g / 1000).toLocaleString('es-AR', { maximumFractionDigits: 3 }) + ' kg'),
    esc: s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    _attrHtml: s => String(s).replace(/"/g, '&quot;'),
    firebase: { firestore: { FieldValue: { increment: n => ({ __inc: n }) } } },
    db: { collection: () => ({ doc: id => ({
      update: async d => {
        if (o.falla) throw new Error('sin conexión');
        escrituras.push([id, d]);
        if (d.stock && d.stock.__inc !== undefined) base[id] += d.stock.__inc + (o.ventaEnElMedio || 0);
        else base[id] = d.stock;
      },
      get: async () => ({ exists: true, data: () => ({ stock: base[id] }) }),
    }) }) },
    logAction: (a, b, c) => historial.push(a + ' | ' + b + ' | ' + c),
    showAdminToast: (m, tp) => avisos.push((tp || 'info') + ': ' + m),
    pedirConfirmacion: async (m, op) => { preguntas.push({ m, op }); return o.confirma !== false; },
    _reRenderProductos: () => repintados.push('lista'),
    updateStats: () => repintados.push('stats'),
    _refrescarAlertas: () => repintados.push('campana'),
  };
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);
  if (o.respuesta !== undefined) ctx.pedirCantidadStock = async () => o.respuesta;
  return { ctx, escrituras, historial, avisos, preguntas, repintados, base };
}
const b = (w, id) => w.ctx.allProducts.find(p => p.id === id);

/* Un DOM de mentira para el diálogo de verdad: el overlay devuelve sus piezas por clase. */
function domDialogo(ctx) {
  const escuchas = {};
  const pieza = extra => Object.assign({ value: '', innerHTML: '', disabled: false, handlers: {},
    addEventListener(tp, fn) { this.handlers[tp] = fn; }, getAttribute(k) { return this['attr_' + k]; }, focus() {}, select() {} }, extra || {});
  const d = { overlay: null, inp: pieza(), si: pieza(), no: pieza(), total: pieza(), rapidos: [] };
  ctx.document = {
    createElement: () => {
      const ov = pieza({ style: {}, className: '' });
      ov.remove = () => { d.cerrado = true; };
      ov.querySelector = sel => ({ '.pz-input': d.inp, '.dlg-si': d.si, '.dlg-no': d.no, '.pz-total': d.total })[sel] || null;
      ov.querySelectorAll = sel => {
        if (sel !== '.pz-rap') return [];
        d.rapidos = [...ov.innerHTML.matchAll(/data-g="(\d+)"/g)].map(m => pieza({ attr_: null, 'attr_data-g': m[1] }));
        return d.rapidos;
      };
      d.overlay = ov;
      return ov;
    },
    body: { appendChild: () => {} },
    addEventListener: (tp, fn) => { escuchas[tp] = fn; },
    removeEventListener: tp => { delete escuchas[tp]; },
  };
  d.tecla = key => escuchas.keydown && escuchas.keydown({ key, preventDefault() {}, stopPropagation() {} });
  return d;
}

(async () => {
  console.log('\n-- la cuenta --');
  {
    const w = armar();
    t('en los de peso, en gramos (como se piensa lo que llega): "2.953 g"', w.ctx._stkCant(b(w, 'alm'), 2953) === '2.953 g');
    t('  en los de unidad: "1 unidad", "12 unidades"', w.ctx._stkCant(b(w, 'alf'), 1) === '1 unidad' && w.ctx._stkCant(b(w, 'alf'), 12) === '12 unidades');
    const c = w.ctx._stkCuenta(b(w, 'alm'), 'agregar', 843);
    t('agregar 843 g a 2.953 g: "2.953 g + 843 g = 3.796 g"', c.izq === '2.953 g + 843 g' && c.der === '= 3.796 g', JSON.stringify(c));
    const k = w.ctx._stkCuenta(b(w, 'alm'), 'corregir', 3500);
    t('corregir: "Ahora 2.953 g", "queda en 3.500 g"', k.izq === 'Ahora 2.953 g' && k.der === 'queda en 3.500 g');
  }

  console.log('\n-- agregar stock --');
  {
    const w = armar({ respuesta: 843 });
    await w.ctx.agregarStockProducto('alm');
    t('suma en la base, con increment (no escribe un total)', w.escrituras.length === 1 && w.escrituras[0][0] === 'alm' &&
      JSON.stringify(w.escrituras[0][1]) === '{"stock":{"__inc":843}}');
    t('  la pantalla queda con lo que hay: 3.796 g', b(w, 'alm').stock === 3796);
    t('  queda en el historial', w.historial[0] === 'stock | Stock agregado: Almendra | +843 g (2953 -> 3796)', w.historial[0]);
    t('  y lo dice', w.avisos[0] === 'success: Se agregaron 843 g a Almendra. Ahora hay 3.796 g.', w.avisos[0]);
    t('  se repinta la lista, los números y la campana (el stock bajo pudo resolverse)', w.repintados.join() === 'lista,stats,campana');
  }
  {
    const w = armar({ respuesta: 843, ventaEnElMedio: -96 });
    await w.ctx.agregarStockProducto('alm');
    t('si en el medio se vendieron 96 g, no se pisan: queda lo que dice la base (3.700 g)', b(w, 'alm').stock === 3700 &&
      /Ahora hay 3\.700 g\./.test(w.avisos[0]));
  }
  {
    const w = armar({ respuesta: 24 });
    await w.ctx.agregarStockProducto('alf');
    t('por unidad: 12 + 24 = 36 unidades', b(w, 'alf').stock === 36 && w.avisos[0] === 'success: Se agregaron 24 unidades a Alfajor. Ahora hay 36 unidades.');
  }
  {
    const w = armar({ respuesta: null });
    await w.ctx.agregarStockProducto('alm');
    t('cancelar no escribe nada', w.escrituras.length === 0 && b(w, 'alm').stock === 2953 && w.avisos.length === 0);
  }
  {
    const w = armar({ respuesta: 843, falla: true });
    await w.ctx.agregarStockProducto('alm');
    t('sin conexión avisa y no cambia la pantalla', b(w, 'alm').stock === 2953 && /^error: No se pudo agregar el stock: sin conexión/.test(w.avisos[0]));
  }

  console.log('\n-- corregir (el lápiz) --');
  {
    const w = armar({ respuesta: 3500 });
    await w.ctx.corregirStockProducto('alm');
    t('pone el total, como se escribía antes', JSON.stringify(w.escrituras[0]) === '["alm",{"stock":3500}]' && b(w, 'alm').stock === 3500);
    t('  sin preguntar si nadie lo cambió', w.preguntas.length === 0 && w.historial[0] === 'stock | Stock: Almendra | stock: 2953 -> 3500');
  }
  {
    const w = armar({ respuesta: 3500, base: { alm: 2900 }, confirma: false });
    await w.ctx.corregirStockProducto('alm');
    t('si el stock cambió mientras la pantalla estaba abierta, pregunta', w.preguntas.length === 1 &&
      w.preguntas[0].m.indexOf('pasó a 2.900 g mientras tenías esta pantalla abierta (acá figuraba 2.953 g)') > 0);
    t('  y si no se confirma, no guarda y muestra el de verdad', w.escrituras.length === 0 && b(w, 'alm').stock === 2900 &&
      /No se guardó/.test(w.avisos[0]));
  }
  {
    const w = armar({ respuesta: 3500, base: { alm: 2900 } });
    await w.ctx.corregirStockProducto('alm');
    t('  confirmando, guarda el total', JSON.stringify(w.escrituras[0]) === '["alm",{"stock":3500}]' && w.historial[0] === 'stock | Stock: Almendra | stock: 2900 -> 3500');
  }

  console.log('\n-- el diálogo --');
  {
    const w = armar();
    const d = domDialogo(w.ctx);
    const r = w.ctx.pedirCantidadStock(b(w, 'alm'), 'agregar');
    const h = d.overlay.innerHTML;
    t('pregunta cuánto llegó, con lo que hay ahora', h.indexOf('<h3>Agregar stock</h3>') > 0 && h.indexOf('¿Cuánto llegó? Se suma a lo que hay: ahora 2.953 g.') > 0);
    t('  en un producto por peso: los tamaños de bolsa a un toque, en gramos', d.rapidos.map(x => x['attr_data-g']).join() === '500,1000,5000,10000,25000' &&
      h.indexOf('placeholder="gramos"') > 0);
    t('  sin número no deja agregar', d.si.disabled === true && d.total.innerHTML === '');
    d.inp.value = '843'; d.inp.handlers.input();
    t('  escribiendo, la cuenta en vivo: 2.953 g + 843 g = 3.796 g', d.si.disabled === false &&
      d.total.innerHTML === '<span>2.953 g + 843 g</span><b>= 3.796 g</b>', d.total.innerHTML);
    d.inp.value = '0'; d.inp.handlers.input();
    t('  0 no es agregar', d.si.disabled === true);
    d.rapidos[1].handlers.click();
    t('  el botón de 1 kg lo escribe', d.inp.value === '1000' && d.total.innerHTML.indexOf('= 3.953 g') > 0);
    d.si.handlers.click();
    t('  "Agregar" devuelve lo escrito', (await r) === 1000 && d.cerrado === true);
  }
  {
    const w = armar();
    const d = domDialogo(w.ctx);
    const r = w.ctx.pedirCantidadStock(b(w, 'alf'), 'corregir');
    const h = d.overlay.innerHTML;
    t('corregir: pide el total, arranca con el que hay, y sin botones rápidos', h.indexOf('<h3>Corregir el stock</h3>') > 0 &&
      h.indexOf('value="12"') > 0 && d.rapidos.length === 0 && h.indexOf('placeholder="unidades"') > 0);
    d.inp.value = '0'; d.inp.handlers.input();
    t('  0 sí se puede (se contó y no hay)', d.si.disabled === false && d.total.innerHTML === '<span>Ahora 12 unidades</span><b>queda en 0 unidades</b>');
    d.tecla('Escape');
    t('  Escape cancela', (await r) === null);
  }

  console.log('\n-- la fila de Stock --');
  {
    const w = armar();
    const hp = w.ctx.accionesStockHtml(b(w, 'alm'));
    t('muestra el stock (en gramos, y en kilos abajo) y los dos botones', hp.indexOf('<b>2.953 g</b><small>2,953 kg</small>') > 0 &&
      hp.indexOf("agregarStockProducto('alm')") > 0 && hp.indexOf('Agregar stock</button>') > 0 && hp.indexOf("corregirStockProducto('alm')") > 0, hp);
    t('  por unidad dice "unidades"', w.ctx.accionesStockHtml(b(w, 'alf')).indexOf('<b>12</b><small>unidades</small>') > 0);
    t('renderStockList la usa (y sin el archivo, el campo de siempre)', html.indexOf("(typeof accionesStockHtml==='function'?accionesStockHtml(p):") > 0);
    t('el panel carga admin-stock.js y check-admin lo revisa', html.indexOf('<script src="admin-stock.js"></script>') > 0 &&
      leer('check-admin.js').indexOf("'admin-stock.js'") > 0);
  }

  console.log('\n' + ok + ' pasaron, ' + fail + ' fallaron');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERROR: ' + (e && e.stack || e)); process.exit(1); });
