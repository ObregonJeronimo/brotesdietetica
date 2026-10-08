/**
 * STOCK: UN PRODUCTO CON BOLSAS O PRESENTACIONES ES UN BLOQUE.
 *
 * Pedido del dueño (28/09/2026): en Productos, un producto con varias bolsas es una fila;
 * en Stock, buscando "Mani", salían separadas la de 1 kg y la de 3 kg, como si fueran dos
 * productos, y la de 1 kg (la principal) sin el tamaño en el nombre. Ahora es un bloque:
 * arriba el producto, y abajo cada tamaño a la vista, con su stock, su "Agregar stock" y su
 * lápiz. La ventana de "Agregar stock" y la carga en tanda dicen "Mani prueba x 1 kg".
 *
 * Corre de verdad admin-variantes.js, admin-stock.js, y renderStockList y
 * agregarStockMasivo de admin.html, con un document de mentira.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const RAIZ = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const VAR = leer('admin-variantes.js');
const STK = leer('admin-stock.js');
const html = leer('admin.html');

let ok = 0, fail = 0;
const t = (d, c, extra) => {
  if (c) { ok++; console.log('  OK   ' + d); }
  else { fail++; console.log('  FALLA ' + d + (extra !== undefined ? '   [' + extra + ']' : '')); }
};

/* Una función de admin.html, entera, con su async si lo tiene. */
function extraer(n) {
  const i = html.indexOf('function ' + n + '(');
  if (i < 0) throw new Error('falta ' + n);
  let prof = 0, k;
  for (k = html.indexOf('{', i); k < html.length; k++) {
    if (html[k] === '{') prof++;
    else if (html[k] === '}') { prof--; if (!prof) break; }
  }
  return (html.slice(i - 6, i) === 'async ' ? 'async ' : '') + html.slice(i, k + 1);
}

const P = (id, extra) => Object.assign({ id, nombre: id, categoria: 'Frutos secos', stock: 5, tipoVenta: 'unidad' }, extra || {});
function catalogo() {
  return [
    P('alm', { nombre: 'Almendra', tipoVenta: 'peso', stock: 2953 }),
    P('m1', { nombre: 'Mani prueba', gramaje: '1 kg', tipoVenta: 'peso', stock: 122, categoria: 'Aceites' }),
    P('m3', { nombre: 'Mani prueba x 3 kg', gramaje: '3 kg', tipoVenta: 'peso', stock: 111, categoria: 'Aceites', gramajePadreId: 'm1' }),
    P('alf1', { nombre: 'Alfajor', gramaje: 'x1', stock: 30, categoria: 'Golosinas' }),
    P('alf12', { nombre: 'Alfajor x12', gramaje: 'x12', stock: 0, categoria: 'Golosinas', cajaCerrada: true, gramajePadreId: 'alf1' }),
    P('alf6', { nombre: 'Alfajor x6', gramaje: 'x6', stock: 4, categoria: 'Golosinas', oculto: true, gramajePadreId: 'alf1' }),
    P('alf24', { nombre: 'Alfajor x24', gramaje: 'x24', depurado: true, gramajePadreId: 'alf1' }),
    P('chia', { nombre: 'Chia', gramaje: '500 g', tipoVenta: 'peso', depurado: true }),
    P('chia1', { nombre: 'Chia x 1 kg', gramaje: '1 kg', tipoVenta: 'peso', stock: 50, gramajePadreId: 'chia' }),
    P('nuez', { nombre: 'Nuez', stock: 13 }),
  ];
}

/* Un panel de mentira: la lista de Stock, su buscador y su filtro, la paginación y una base
   que suma lo que se agrega. sinVariantes: como si admin-variantes.js no hubiera cargado. */
function armar(opts) {
  const o = opts || {};
  const campos = {
    stockList: { innerHTML: '' },
    stockSearch: { value: o.q || '' },
    stockFilterCat: { value: o.cat || '' },
    stockMasivoCant: { value: '' }, stockMasivoCantPeso: { value: '' }, stockMasivoBtn: { disabled: false, innerHTML: '' },
  };
  const productos = o.productos || catalogo();
  const base = {};
  productos.forEach(p => { base[p.id] = p.stock; });
  const paginas = [], avisos = [], historial = [], preguntas = [];
  const ctx = {
    console, Math, Number, String, Object, Array, Set, Map, Promise, Infinity, parseInt, isFinite,
    setTimeout: () => 0,
    document: { getElementById: id => campos[id] || null, querySelector: () => null, querySelectorAll: () => [] },
    allProducts: productos,
    esc: s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
    _attrHtml: s => String(s).replace(/"/g, '&quot;'),
    esPorPeso: p => !!(p && p.tipoVenta === 'peso'),
    fmtPeso: g => (Math.abs(g) < 1000 ? g + ' g' : (g / 1000).toLocaleString('es-AR', { maximumFractionDigits: 3 }) + ' kg'),
    ADMIN_PER_PAGE: o.porPag || 20,
    adminStockPage: o.pagina || 1,
    _stockDirty: new Map(), _stockSel: new Set(), _stockVisibles: [],
    removePagination: () => paginas.push('ninguna'),
    renderAdminPagination: (sec, pag, tot, n) => paginas.push(pag + ' de ' + tot + ', ' + n + ' productos'),
    pintarSeleccionStock: () => {}, pintarStockSinGuardar: () => {},
    firebase: { firestore: { FieldValue: { increment: n => ({ __inc: n }) } } },
    db: { collection: () => ({ doc: id => ({
      update: async d => { if (d.stock && d.stock.__inc !== undefined) base[id] += d.stock.__inc; else base[id] = d.stock; },
      get: async () => ({ exists: true, data: () => ({ stock: base[id] }) }),
    }) }) },
    logAction: (a, b) => historial.push(b),
    showAdminToast: m => avisos.push(m),
    pedirConfirmacion: async m => { preguntas.push(m); return false; },
    _reRenderProductos: () => {}, updateStats: () => {}, _refrescarAlertas: () => {},
  };
  ctx.window = ctx;
  if (o.orden) ctx._stockSortDir = o.orden;
  vm.createContext(ctx);
  if (o.sinVariantes !== true) vm.runInContext(VAR, ctx);
  vm.runInContext(STK, ctx);
  vm.runInContext(extraer('claveProducto'), ctx);
  vm.runInContext(extraer('renderStockList'), ctx);
  vm.runInContext(extraer('agregarStockMasivo'), ctx);
  return { ctx, campos, paginas, avisos, historial, preguntas };
}
const b = (w, id) => w.ctx.allProducts.find(p => p.id === id);
const desc = l => l.map(it => it.__stockGrupo
  ? it.__stockGrupo.principal.id + '[' + it.__stockGrupo.miembros.map(m => m.producto.id).join('+') + ']' : it.id).join(' ');
const bloques = h => (h.match(/<div class="stock-grupo" /g) || []).length;
/* Las filas dibujadas, en orden: "m1(tam)" si es un tamaño dentro de su bloque, y
   "(marcada)" si coincide con la búsqueda cuando no coinciden todas. */
const filas = h => [...h.matchAll(/<div class="(stock-row[^"]*)" data-id="([^"]+)">/g)]
  .map(m => m[2] + (m[1].indexOf('stock-row-tam') > 0 ? '(tam)' : '') + (m[1].indexOf('coincide') > 0 ? '(marcada)' : '')).join();

(async () => {
  console.log('\n-- agruparParaStock --');
  {
    const w = armar();
    const l = w.ctx.agruparParaStock(w.ctx.allProducts.filter(p => p.depurado !== true));
    t('los de un mismo producto van juntos, de menor a mayor; los sueltos, como siempre',
      desc(l) === 'alm m1[m1+m3] alf1[alf1+alf6+alf12] chia1 nuez', desc(l));
    const m = l[1].__stockGrupo, a = l[2].__stockGrupo;
    t('  el nombre, y si son bolsas o presentaciones', m.nombre === 'Mani prueba' && m.que === 'bolsas' && a.que === 'presentaciones');
    t('  cada tamaño con su etiqueta: "1 kg", "3 kg"; "x1", "x6", "x12"',
      m.miembros.map(x => x.tam).join() === '1 kg,3 kg' && a.miembros.map(x => x.tam).join() === 'x1,x6,x12');
    t('  el oculto va (tiene su stock), el depurado no', a.miembros.some(x => x.producto.id === 'alf6') && !a.miembros.some(x => x.producto.id === 'alf24'));
    t('  si el principal está depurado, el otro va suelto', l.indexOf(b(w, 'chia1')) === 3);
    t('  sin buscar, coinciden todos', [m, a].every(g => g.miembros.every(x => x.coincide === true)));
  }
  {
    const w = armar();
    const l = w.ctx.agruparParaStock(w.ctx.allProducts.filter(p => p.depurado !== true).sort((x, y) => x.stock - y.stock));
    t('ordenando por menor stock, el bloque va a la altura de su tamaño con menos: el de los alfajores (x12 en 0) primero, y el del maní a la altura de la de 3 kg (111 g)',
      desc(l) === 'alf1[alf1+alf6+alf12] nuez chia1 m1[m1+m3] alm', desc(l));
  }
  {
    const w = armar();
    const l = w.ctx.agruparParaStock(w.ctx.allProducts.filter(p => p.depurado !== true && p.nombre.toLowerCase().includes('3 kg')));
    t('buscando "3 kg": el bloque entero, y "coincide" solo en la de 3 kg',
      l.length === 1 && l[0].__stockGrupo.miembros.map(x => x.producto.id + ':' + x.coincide).join() === 'm1:false,m3:true');
  }
  {
    const w = armar({ productos: [
      P('av5', { nombre: 'AVENA INSTANTANEA X 5 KG', gramaje: '5 kg', tipoVenta: 'peso' }),
      P('av1', { nombre: 'AVENA INSTANTANEA X 1 KG', gramaje: '1 kg', tipoVenta: 'peso', gramajePadreId: 'av5' }),
    ] });
    const g = w.ctx.agruparParaStock(w.ctx.allProducts.slice())[0].__stockGrupo;
    t('si el principal dice su tamaño en el nombre, el bloque va sin él: "AVENA INSTANTANEA"', g.nombre === 'AVENA INSTANTANEA', g.nombre);
    t('  y abajo, de menor a mayor: 1 kg, 5 kg', g.miembros.map(x => x.tam).join() === '1 kg,5 kg');
  }
  {
    const w = armar({ productos: [
      P('y5', { nombre: 'Yerba Mate (500 Gr)', gramaje: '500 g', tipoVenta: 'peso' }),
      P('y1', { nombre: 'Yerba Mate (1 Kg)', gramaje: '1 kg', tipoVenta: 'peso', gramajePadreId: 'y5' }),
    ] });
    const g = w.ctx.agruparParaStock(w.ctx.allProducts.slice())[0].__stockGrupo;
    t('con el tamaño entre paréntesis, sin los paréntesis vacíos: "Yerba Mate", no "Yerba Mate ( )"', g.nombre === 'Yerba Mate', g.nombre);
  }
  /* Un tamaño que es OTRO producto (enganchado con "Asociar uno existente"): la fila no
     puede decir solo "1 Kg" (revisión del 28/09, el grupo del sandbox). */
  const asociados = () => [
    P('ym', { nombre: 'Yerba Mate Tostado', gramaje: '500 Gr', stock: 0 }),
    P('tv', { nombre: 'Te Verde Tostado', gramaje: '1 Kg', stock: 3, gramajePadreId: 'ym' }),
    P('mp', { nombre: 'Maní prueba', gramaje: '1 kg', tipoVenta: 'peso' }),
    P('mp3', { nombre: 'MANI PRUEBA x 3 kg', gramaje: '3 kg', tipoVenta: 'peso', gramajePadreId: 'mp' }),
  ];
  {
    const w = armar({ productos: asociados() });
    const l = w.ctx.agruparParaStock(w.ctx.allProducts.slice());
    const otros = g => g.__stockGrupo.miembros.map(x => x.producto.id + ':' + x.otroNombre).join();
    t('un tamaño que es otro producto trae su nombre: "Te Verde Tostado"', otros(l[0]) === 'ym:,tv:Te Verde Tostado', otros(l[0]));
    t('  el mismo nombre con otras tildes o mayúsculas no cuenta como otro ("Maní prueba" y "MANI PRUEBA x 3 kg")', otros(l[1]) === 'mp:,mp3:', otros(l[1]));
  }

  console.log('\n-- la lista de Stock --');
  {
    const w = armar({ q: 'mani' });
    w.ctx.renderStockList();
    const h = w.campos.stockList.innerHTML;
    t('buscando "mani": UN bloque, no dos filas sueltas', bloques(h) === 1 && filas(h) === 'm1(tam),m3(tam)', filas(h));
    t('  arriba: "Mani prueba", "2 bolsas", POR PESO una sola vez, la categoría y una sola foto',
      h.indexOf('<strong>Mani prueba<span class="var-chip fijo"><i class="bi bi-stack"></i> 2 bolsas</span>' +
        '<span class="vprod-chip neutro" style="margin-left:6px">POR PESO</span></strong><small>Aceites</small>') > 0 &&
      (h.match(/POR PESO/g) || []).length === 1 && (h.match(/<small>Aceites<\/small>/g) || []).length === 1 && (h.match(/<img /g) || []).length === 1);
    t('  abajo, cada bolsa con su tamaño: la de 1 kg dice "1 kg"', /data-id="m1">.*?<strong>1 kg<\/strong>/.test(h) && /data-id="m3">.*?<strong>3 kg<\/strong>/.test(h));
    t('  cada una con su casilla, su stock, su "Agregar stock" y su lápiz',
      ['m1', 'm3'].every(id => h.indexOf("stockAlternar('" + id + "',this.checked)") > 0 && h.indexOf("agregarStockProducto('" + id + "')") > 0 &&
        h.indexOf("corregirStockProducto('" + id + "')") > 0) && h.indexOf('<b>122 g</b>') > 0 && h.indexOf('<b>111 g</b>') > 0);
    t('"Seleccionar los visibles" alcanza a las dos bolsas', w.ctx._stockVisibles.join() === 'm1,m3', w.ctx._stockVisibles.join());
  }
  {
    const w = armar();
    w.ctx.renderStockList();
    const h = w.campos.stockList.innerHTML;
    t('sin buscar: los sueltos como siempre, con su foto, su nombre y su categoría',
      h.indexOf('<strong>Almendra<span class="vprod-chip neutro" style="margin-left:6px">POR PESO</span></strong><small>Frutos secos</small>') > 0 &&
      h.indexOf('<strong>Nuez</strong><small>Frutos secos</small>') > 0);
    t('  las presentaciones también van juntas, con la oculta y sin la depurada',
      bloques(h) === 2 && filas(h) === 'alm,m1(tam),m3(tam),alf1(tam),alf6(tam),alf12(tam),chia1,nuez', filas(h));
    t('  "3 presentaciones", y sin POR PESO', h.indexOf('<strong>Alfajor<span class="var-chip fijo"><i class="bi bi-stack"></i> 3 presentaciones</span></strong><small>Golosinas</small>') > 0);
    t('  sin buscar no se marca ninguna', h.indexOf('coincide') < 0);
    t('  la página cuenta cada bloque como UN producto: 5, no 8', w.paginas.join() === '1 de 1, 5 productos', w.paginas.join());
    t('  visibles: los 8 que pasan el filtro', w.ctx._stockVisibles.length === 8);
  }
  {
    const w = armar({ q: '3 kg' });
    w.ctx.renderStockList();
    const h = w.campos.stockList.innerHTML;
    t('buscando "3 kg": el bloque con las dos bolsas, y la de 3 kg marcada', bloques(h) === 1 && filas(h) === 'm1(tam),m3(tam)(marcada)', filas(h));
    t('  "Seleccionar los visibles" alcanza solo a la de 3 kg (la de 1 kg se ve, pero no se buscó)', w.ctx._stockVisibles.join() === 'm3', w.ctx._stockVisibles.join());
    vm.runInContext(extraer('stockSeleccionarTodos'), w.ctx);
    const casillas = [...h.matchAll(/data-id="([^"]+)"><input type="checkbox" class="stock-chk"/g)]
      .map(m => ({ id: m[1], checked: false, closest: () => ({ getAttribute: k => (k === 'data-id' ? m[1] : null) }) }));
    w.ctx.document.querySelectorAll = sel => (sel === '#stockList .stock-chk' ? casillas : []);
    w.ctx.stockSeleccionarTodos(true);
    const vistas = casillas.map(c => c.id + ':' + c.checked).join();
    t('  y en pantalla se tilda solo esa, no la de 1 kg', [...w.ctx._stockSel].join() === 'm3' && vistas === 'm1:false,m3:true', vistas);
    w.ctx.stockSeleccionarTodos(false);
    t('  y destildar "todos" la saca', w.ctx._stockSel.size === 0 && casillas.every(c => c.checked === false));
  }
  {
    const w = armar({ porPag: 2, pagina: 2 });
    w.ctx.renderStockList();
    const h = w.campos.stockList.innerHTML;
    t('de a 2 por página: la 2 trae el bloque entero de los alfajores y la chía',
      filas(h) === 'alf1(tam),alf6(tam),alf12(tam),chia1' && w.paginas.join() === '2 de 3, 5 productos', filas(h) + ' / ' + w.paginas.join());
  }
  {
    const w = armar({ q: 'mani' });
    w.ctx._stockSel.add('m3');
    w.ctx._stockDirty.set('m1', 500);
    w.ctx.renderStockList();
    const h = w.campos.stockList.innerHTML;
    t('una bolsa tildada sigue tildada', /data-id="m3"><input type="checkbox" class="stock-chk" checked/.test(h) &&
      !/data-id="m1"><input type="checkbox" class="stock-chk" checked/.test(h));
    t('una bolsa con un cambio sin guardar se marca en su fila',
      h.indexOf('<div class="stock-row stock-row-tam sin-guardar" data-id="m1">') >= 0 && h.indexOf('<strong>1 kg<span class="stock-chip-sg">SIN GUARDAR</span></strong>') > 0);
  }
  {
    const w = armar({ q: 'mani', sinVariantes: true });
    w.ctx.renderStockList();
    const h = w.campos.stockList.innerHTML;
    t('sin admin-variantes.js, una fila por producto, como antes', bloques(h) === 0 && filas(h) === 'm1,m3' &&
      h.indexOf('<strong>Mani prueba<span') > 0 && h.indexOf('<strong>Mani prueba x 3 kg<span') > 0, filas(h));
  }
  {
    const w = armar({ productos: asociados(), q: 'tostado' });
    w.ctx.renderStockList();
    const h = w.campos.stockList.innerHTML;
    t('en la lista, la fila de "1 Kg" dice abajo "Te Verde Tostado", y la de 500 Gr nada más que el tamaño',
      /data-id="tv">.*?<strong>1 Kg<\/strong><small>Te Verde Tostado<\/small><\/div>/.test(h) && /data-id="ym">.*?<strong>500 Gr<\/strong><\/div>/.test(h));
  }
  {
    const w = armar({ q: 'mani' });
    w.ctx.renderStockList();
    /* Lo de abajo del nombre va pegado al </strong>; el <small> del stock es otro. */
    t('con el mismo nombre, las bolsas no repiten el nombre abajo (solo la categoría del bloque)',
      (w.campos.stockList.innerHTML.match(/<\/strong><small>/g) || []).length === 1);
  }
  {
    const w = armar({ q: 'zzz' });
    w.ctx.renderStockList();
    t('sin resultados, el aviso de siempre', w.campos.stockList.innerHTML.indexOf('No hay productos') > 0 && w.ctx._stockVisibles.length === 0);
  }

  console.log('\n-- el nombre, con su tamaño --');
  {
    const w = armar();
    /* Es un const de arriba de todo: en vm no queda como propiedad del contexto. */
    const nombre = id => vm.runInContext('_stkNombre', w.ctx)(b(w, id));
    t('la principal dice su tamaño: "Mani prueba x 1 kg"', nombre('m1') === 'Mani prueba x 1 kg', nombre('m1'));
    t('  la otra ya lo decía, y no se repite: "Mani prueba x 3 kg"', nombre('m3') === 'Mani prueba x 3 kg');
    t('  una presentación: "Alfajor x1"', nombre('alf1') === 'Alfajor x1', nombre('alf1'));
    t('  uno sin tamaños, como siempre: "Almendra"', nombre('alm') === 'Almendra');
  }
  {
    const w = armar();
    let ov = null;
    const pieza = () => ({ value: '', innerHTML: '', disabled: false, style: {}, addEventListener() {}, focus() {}, select() {} });
    Object.assign(w.ctx.document, {
      createElement: () => (ov = Object.assign(pieza(), { className: '', remove() {}, querySelector: () => pieza(), querySelectorAll: () => [] })),
      body: { appendChild() {} }, addEventListener() {}, removeEventListener() {},
    });
    w.ctx.pedirCantidadStock(b(w, 'm1'), 'agregar');
    t('la ventana de "Agregar stock" dice a cuál: "Mani prueba x 1 kg"', !!ov && ov.innerHTML.indexOf('<p class="dlg-linea"><b>Mani prueba x 1 kg</b></p>') > 0);
  }
  {
    const w = armar();
    w.ctx.pedirCantidadStock = async () => 500;
    await w.ctx.agregarStockProducto('m1');
    t('agregando a la de 1 kg, el aviso dice cuál', w.avisos[0] === 'Se agregaron 500 g a Mani prueba x 1 kg. Ahora hay 622 g.', w.avisos[0]);
    t('  y el historial también', w.historial[0] === 'Stock agregado: Mani prueba x 1 kg', w.historial[0]);
  }
  {
    const w = armar();
    w.campos.stockMasivoCantPeso.value = '500';
    ['m1', 'm3', 'alm'].forEach(id => w.ctx._stockSel.add(id));
    await w.ctx.agregarStockMasivo();
    t('la carga en tanda nombra cada bolsa con su tamaño', (w.preguntas[0] || '').indexOf('Mani prueba x 1 kg, Mani prueba x 3 kg, Almendra') > 0, w.preguntas[0]);
  }

  console.log('\n-- stock con otra cara (07/10): el resumen y los datos de cada fila --');
  {
    const prods = [
      P('a', { nombre: 'Uno', stock: 3, costo: 100, codigo: 'C1', precio: 180 }),
      P('b', { nombre: 'Granel', tipoVenta: 'peso', stock: 1500, costo: 2000, precio: 3200 }),
      P('c', { nombre: 'Negativo', stock: -2, costo: 50 }),
      P('d', { nombre: 'Sin costo', stock: 5 }),
      P('e', { nombre: 'Vacio', stock: 0, costo: 10, oculto: true }),
      P('f', { nombre: 'Depurado', stock: 9, costo: 1000, depurado: true }),
      P('g', { nombre: 'Lleno', stock: 40, costo: 10 }),
    ];
    const w = armar({ productos: prods });
    w.ctx.esStockBajo = p => { const s = Number(p.stock || 0); return s > 0 && s < (p.tipoVenta === 'peso' ? 500 : 10); };
    const r = w.ctx.resumenStockHtml(prods);
    const val = etq => (r.match(new RegExp('<span class="vt-kpi-etq">' + etq + '</span><strong class="vt-kpi-val">([^<]*)</strong>')) || [])[1];
    t('arriba, los productos en uso (sin los depurados): 6, con cuántos por unidad y por peso', val('Productos') === '6' && r.indexOf('5 por unidad · 1 por peso') > 0, val('Productos'));
    t('  stock bajo: los de menos de 10 unidades o 500 g, sin contar los vacíos (Uno y Sin costo)', val('Stock bajo') === '2', val('Stock bajo'));
    t('  sin stock cuenta los que están en 0 y en negativo (2), y dice cuántos en negativo', val('Sin stock') === '2' && r.indexOf('1 en negativo') > 0, val('Sin stock'));
    t('  el valor del stock a costo: 3 × $100 + 1,5 kg × $2.000 + 40 × $10 = $3.700 (el negativo y el depurado no suman)', val('Valor del stock') === '$3.700', val('Valor del stock'));
    t('  y avisa cuántos con stock no tienen costo cargado', r.indexOf('1 sin costo cargado') > 0);
    const d = id => w.ctx.detalleStockHtml(prods.find(p => p.id === id));
    t('cada fila: el estado si hay que mirarlo, el código y el precio', d('c').indexOf('En negativo') > 0 && d('e').indexOf('Sin stock') > 0 &&
      d('a').indexOf('Stock bajo') > 0 && d('e').indexOf('Oculto en la tienda') > 0 && d('a').indexOf('C1') > 0 && d('a').indexOf('$180') > 0 &&
      d('b').indexOf('$3.200 el kilo') > 0 && d('g').indexOf('Stock bajo') < 0 && d('g').indexOf('Sin stock') < 0, d('a'));
    const est = i => (w.ctx.accionesStockHtml(prods[i]).match(/^<div class="stock-actual est-(\w+)">/) || [])[1];
    t('  el stock en color: verde si está bien, ámbar si queda poco, rojo si no hay o está en negativo',
      est(6) === 'ok' && est(0) === 'bajo' && est(4) === 'sin' && est(2) === 'neg', [est(6), est(0), est(4), est(2)].join(' '));
  }
  {
    const w = armar();
    const g = w.ctx.agruparParaStock(w.ctx.allProducts.filter(p => p.depurado !== true)).filter(x => x.__stockGrupo).map(x => x.__stockGrupo);
    const tot = id => w.ctx.totalGrupoStockHtml(g.find(x => x.principal.id === id).miembros);
    t('arriba de un grupo, cuánto hay entre todas: 122 g + 111 g = 233 g; 30 + 0 + 4 = 34 unidades (el depurado no)',
      tot('m1').indexOf('Entre todas: 233 g') > 0 && tot('alf1').indexOf('Entre todas: 34 unidades') > 0, tot('m1') + ' | ' + tot('alf1'));
    t('la lista pinta el resumen y los datos de cada fila', html.indexOf("if(typeof pintarResumenStock==='function')pintarResumenStock();") > 0 &&
      html.indexOf("(typeof detalleStockHtml==='function'?detalleStockHtml(p):'')") > 0 &&
      html.indexOf("(typeof totalGrupoStockHtml==='function'?totalGrupoStockHtml(g.miembros):'')") > 0 && html.indexOf('id="stkKpis"') > 0);
  }

  console.log('\n-- el filtro por cómo está el stock (07/10) --');
  {
    const prods = [
      P('ok', { stock: 40 }), P('bajo', { stock: 3 }), P('cero', { stock: 0 }), P('neg', { stock: -2 }),
      P('gbajo', { tipoVenta: 'peso', stock: 200 }), P('gok', { tipoVenta: 'peso', stock: 900 }), P('gneg', { tipoVenta: 'peso', stock: -500 }),
      P('dep', { stock: 0, depurado: true }),
    ];
    const w = armar({ productos: prods });
    w.ctx.esStockBajo = p => { const s = Number(p.stock || 0); return s > 0 && s < (p.tipoVenta === 'peso' ? 500 : 10); };
    const vis = est => { w.campos.stockFilterEstado = { value: est }; w.ctx.renderStockList(); return w.ctx._stockVisibles.join(' '); };
    t('todo el stock: todos los que están en uso (el depurado no)', vis('') === 'ok bajo cero neg gbajo gok gneg', vis(''));
    t('  stock bajo: los de menos de 10 unidades o 500 g (los vacíos no)', vis('bajo') === 'bajo gbajo', vis('bajo'));
    t('  sin stock: los que están en 0 y los que están en negativo, por unidad y por peso', vis('sin') === 'cero neg gneg', vis('sin'));
    t('  en negativo: solo esos', vis('neg') === 'neg gneg', vis('neg'));
    const r = w.ctx.resumenStockHtml(prods);
    const val = etq => (r.match(new RegExp('<span class="vt-kpi-etq">' + etq + '</span><strong class="vt-kpi-val">([^<]*)</strong>')) || [])[1];
    t('  cuentan lo mismo que los recuadros de arriba (2 bajos, 3 sin stock, 2 en negativo)',
      val('Stock bajo') === String(vis('bajo').split(' ').length) && val('Sin stock') === String(vis('sin').split(' ').length) &&
      r.indexOf(vis('neg').split(' ').length + ' en negativo') > 0, val('Stock bajo') + ' / ' + val('Sin stock'));
    w.campos.stockFilterEstado = { value: 'neg' }; w.campos.stockSearch.value = 'gn';
    w.ctx.renderStockList();
    t('  se suma a la búsqueda: "gn" en negativo', w.ctx._stockVisibles.join() === 'gneg', w.ctx._stockVisibles.join());
    w.campos.stockSearch.value = 'zzz';
    w.ctx.renderStockList();
    t('  y si no queda ninguno, dice cuál filtro: "No hay productos en negativo"', w.campos.stockList.innerHTML.indexOf('<p>No hay productos en negativo</p>') > 0 && w.ctx._stockVisibles.length === 0);
    w.campos.stockFilterEstado = { value: '' };
    w.ctx.renderStockList();
    t('  sin el filtro por estado, "No hay productos" como antes', w.campos.stockList.innerHTML.indexOf('<p>No hay productos</p>') > 0);
  }
  {
    const w = armar();
    w.campos.stockFilterEstado = { value: 'sin' };
    w.ctx.renderStockList();
    const h = w.campos.stockList.innerHTML;
    t('con un bloque: sale el bloque entero, y marcado el tamaño sin stock (x12 en 0)', bloques(h) === 1 && filas(h) === 'alf1(tam),alf6(tam),alf12(tam)(marcada)', filas(h));
    t('  y "Seleccionar los visibles" alcanza solo a ese', w.ctx._stockVisibles.join() === 'alf12', w.ctx._stockVisibles.join());
  }

  console.log('\n-- seleccionar TODOS pregunta antes, y queda el aviso (07/10) --');
  {
    const w = armar();
    Object.assign(w.campos, {
      stockSelTodos: { checked: false, indeterminate: false }, stockSelTodosTxt: { textContent: '' },
      stockSelCuenta: { textContent: '' }, stockMasivoLimpiar: { hidden: true }, stockTodosAviso: { hidden: true },
    });
    vm.runInContext(['pintarSeleccionStock', 'stockAlternar', 'stockSeleccionarTodos', 'stockLimpiarSeleccion'].map(extraer).join(';'), w.ctx);
    let respuesta = false; const pedidos = [];
    w.ctx.pedirConfirmacion = async (m, o) => { pedidos.push({ m, o }); return respuesta; };
    w.ctx.renderStockList();
    const chk = w.campos.stockSelTodos, aviso = w.campos.stockTodosAviso;
    const tildar = async v => { chk.checked = v; await w.ctx.stockCasillaTodos(chk); };
    t('sin filtro, los visibles son todos los productos en uso (8)', w.ctx._stockVisibles.length === 8 && aviso.hidden === true);

    await tildar(true);
    const p0 = pedidos[0] || { m: '', o: {} };
    t('tildar la casilla pregunta antes de elegir', pedidos.length === 1);
    t('  dice que son TODOS y cuántos', p0.m.indexOf('Vas a seleccionar TODOS los productos (8)') === 0, p0.m.split('\n')[0]);
    t('  y que entran las bolsas y presentaciones: 5, de 2 productos (Maní 2 y Alfajor 3; el depurado no)',
      p0.m.indexOf('[!] Incluye las 5 bolsas y presentaciones de 2 productos: lo que cargues se suma o se resta en cada una por separado.') > 0, p0.m);
    t('  con cuidado, y el foco en "Cancelar" (un Enter de más no acepta)', p0.m.indexOf('Hacelo con cuidado') > 0 &&
      p0.o.titulo === 'Seleccionar todos los productos' && p0.o.aceptar === 'Sí, seleccionar todos' && p0.o.focoEnNo === true && p0.o.cuidado === true);
    t('  si dicen que no: no se elige nada, la casilla sin tildar y sin aviso', w.ctx._stockSel.size === 0 && chk.checked === false && aviso.hidden === true);

    respuesta = true;
    await tildar(true);
    t('si dicen que sí: quedan los 8, la casilla tildada y el aviso al lado', w.ctx._stockSel.size === 8 && chk.checked === true && aviso.hidden === false &&
      w.campos.stockSelCuenta.textContent === '8 seleccionados');

    w.ctx.stockAlternar('nuez', false);
    t('al sacar uno, el aviso se va y la casilla queda a medias', aviso.hidden === true && chk.checked === false && chk.indeterminate === true);
    await tildar(true);
    t('  volver a tildarla pregunta otra vez (vuelven a ser todos)', pedidos.length === 3 && w.ctx._stockSel.size === 8 && aviso.hidden === false);

    w.campos.stockSearch.value = 'mani';
    w.ctx.renderStockList();
    t('con todos elegidos y una búsqueda puesta, el aviso sigue: la tanda iría a los 8, no a los 2 que se ven',
      aviso.hidden === false && w.ctx._stockVisibles.length === 2 && w.campos.stockSelCuenta.textContent === '8 seleccionados');
    await tildar(false);
    t('  destildar la casilla saca los que se ven, sin preguntar, y el aviso se va', pedidos.length === 3 && w.ctx._stockSel.size === 6 && aviso.hidden === true);
    w.ctx.stockLimpiarSeleccion();
    t('  "Limpiar" deja todo vacío', w.ctx._stockSel.size === 0 && aviso.hidden === true);

    await tildar(true);
    t('con una búsqueda puesta, tildar elige solo los que se ven, sin preguntar (no son todos)',
      pedidos.length === 3 && [...w.ctx._stockSel].sort().join() === 'm1,m3' && aviso.hidden === true);
    await tildar(false);
    ['alm', 'alf1', 'alf12', 'alf6', 'chia1', 'nuez'].forEach(id => w.ctx.stockAlternar(id, true));
    respuesta = false;
    await tildar(true);
    t('  pero si los demás ya estaban elegidos y los que se ven los completan, son todos: pregunta', pedidos.length === 4 && w.ctx._stockSel.size === 6 && aviso.hidden === true && chk.checked === false);
    respuesta = true;
    await tildar(true);
    t('    y con "sí" quedan los 8 y el aviso', pedidos.length === 5 && w.ctx._stockSel.size === 8 && aviso.hidden === false);
    w.ctx.stockLimpiarSeleccion();
    w.campos.stockSearch.value = '';
    w.campos.stockFilterEstado = { value: 'sin' };
    w.ctx.renderStockList();
    await tildar(true);
    t('  lo mismo con el filtro por estado', pedidos.length === 5 && [...w.ctx._stockSel].join() === 'alf12' && aviso.hidden === true);
    await tildar(false);

    /* La tanda con todos elegidos: cada tamaño recibe lo suyo y el aviso se va. */
    w.campos.stockFilterEstado = { value: '' };
    w.ctx.renderStockList();
    await tildar(true);
    const antes = new Map(w.ctx.allProducts.map(p => [p.id, Number(p.stock || 0)]));
    const ops = [];
    w.ctx.db = { collection: () => ({ doc: id => ({ id }) }), batch: () => ({ update: (ref, d) => ops.push([ref.id, d.stock.__inc]), commit: async () => {} }) };
    w.campos.stockMasivoCant.value = '5';
    await w.ctx.agregarStockMasivo();
    const cambio = w.ctx.allProducts.filter(p => p.depurado !== true).map(p => p.id + (Number(p.stock || 0) - antes.get(p.id) ? '+' + (Number(p.stock || 0) - antes.get(p.id)) : '')).join(' ');
    t('cargar 5 unidades con todos elegidos: +5 a cada producto por unidad, también a cada presentación; los de peso no se tocan',
      cambio === 'alm m1 m3 alf1+5 alf12+5 alf6+5 chia1 nuez+5' && ops.map(o => o.join('+')).join() === 'alf1+5,alf12+5,alf6+5,nuez+5', cambio);
    t('  y después de cargar se vacía la selección y el aviso se va', w.ctx._stockSel.size === 0 && aviso.hidden === true && chk.checked === false);
  }
  t('la casilla llama a stockCasillaTodos, y el aviso y el filtro están en la pantalla',
    html.indexOf("onchange=\"if(typeof stockCasillaTodos==='function')stockCasillaTodos(this);else stockSeleccionarTodos(this.checked)\"") > 0 &&
    html.indexOf('id="stockTodosAviso" role="status" hidden') > 0 &&
    html.indexOf('<option value="">Todo el stock</option><option value="bajo">Stock bajo</option><option value="sin">Sin stock</option><option value="neg">En negativo</option>') > 0 &&
    html.indexOf("if(typeof pintarAvisoTodosStock==='function')pintarAvisoTodosStock();") > 0 &&
    html.indexOf("if(est&&typeof coincideEstadoStock==='function')f=f.filter(p=>coincideEstadoStock(p,est));") > 0);

  console.log('\n-- los estilos --');
  {
    const css = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n');
    ['.stock-grupo{', '.stock-grupo-cab{', '.stock-grupo-cab img{', '.stock-chk-hueco{', '.stock-tam-hueco{',
      '.stock-row.stock-row-tam{', '.stock-row.stock-row-tam.coincide{', '.var-chip.fijo{', '.var-chip.fijo:hover{']
      .forEach(s => t('existe ' + s.slice(0, -1), css.indexOf(s) >= 0));
    /* Revisión del 08/10: la tarjeta nueva de Stock (07/10) tapaba el verde del tamaño que coincide. */
    const reglaVerde = '#sec-stock .stock-grupo .stock-row.stock-row-tam.coincide{background:rgba(95,168,122,0.14)}';
    t('en Stock, el tamaño que coincide sigue marcado en verde (la regla le gana a la de la tarjeta y va después de la del mouse)',
      css.indexOf('#sec-stock .stock-grupo .stock-row.stock-row-tam:hover{') > 0 &&
      css.indexOf(reglaVerde) > css.indexOf('#sec-stock .stock-grupo .stock-row.stock-row-tam:hover{'));
    t('el hueco de la foto mide lo mismo que la foto de una fila suelta (40px)',
      /\.stock-tam-hueco\{width:40px;flex:0 0 40px/.test(css) && /\.stock-row img\{width:40px;height:40px/.test(css));
    t('el hueco de la casilla, lo mismo que la casilla (16px y 2px de margen)',
      /\.stock-chk-hueco\{width:16px;flex:0 0 16px;margin-right:2px\}/.test(css) && /\.stock-chk\{width:16px;height:16px;[^}]*margin-right:2px\}/.test(css));
  }

  console.log('\n' + ok + ' pasaron, ' + fail + ' fallaron');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERROR: ' + (e && e.stack || e)); process.exit(1); });
