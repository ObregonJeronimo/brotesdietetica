/**
 * LA LISTA DE PRECIOS EN PDF, CON FILTROS (18/11/2026).
 *
 * Pedido de la clienta: exportar solo las tartas, y le salía la lista entera ("Exportacion PDF
 * catalogo: 697 productos"): los botones de la lista de precios (al público y mayorista) no tenían
 * filtros. Ahora abren una ventana con categoría, subcategoría, proveedor y nombre, y el PDF lleva
 * solo esos productos, con el filtro escrito debajo de la barra.
 *
 * Corre admin-reporte-costos.js y admin-lista-precios.js de verdad, y exportCatalogoPDF y
 * exportMayoristaPDF de admin.html con un PDF de mentira.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const RAIZ = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const HTML = leer('admin.html');
const VAR = leer('admin-variantes.js');
const COSTOS = leer('admin-costos.js');
const RC = leer('admin-reporte-costos.js');
const LP = leer('admin-lista-precios.js');

let ok = 0, fail = 0;
const t = (d, c, det) => {
  if (c) { ok++; console.log('  OK   ' + d); } else { fail++; console.log('  FALLA ' + d + (det !== undefined ? '   [' + JSON.stringify(det).slice(0, 300) + ']' : '')); }
};
function cuerpo(src, n) {
  const i = src.indexOf('function ' + n + '(');
  if (i < 0) throw new Error('no encontre ' + n);
  let p = 0, k;
  for (k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') p++;
    else if (src[k] === '}') { p--; if (!p) break; }
  }
  return src.slice(i, k + 1) + '\n';
}
function constante(src, n) {
  const i = src.indexOf('const ' + n + '=[');
  let p = 0, k;
  for (k = src.indexOf('[', i); k < src.length; k++) {
    if (src[k] === '[') p++;
    else if (src[k] === ']') { p--; if (!p) break; }
  }
  return src.slice(i, k + 1) + ';\n';
}

/* Como está en producción (18/11): las tartas en "Viandas y comidas listas", sin subcategoría;
   una "Tapa De Tarta" en otra categoría y masas para tarta ocultas. */
const V = 'Viandas y comidas listas';
const PRODS = [
  { id: 't1', nombre: 'Tarta capresse', categoria: V, precio: 22000, tipoVenta: 'unidad', lista: 'coc' },
  { id: 't2', nombre: 'MiniTarta - Humita', categoria: V, precio: 22000, tipoVenta: 'unidad', lista: 'coc' },
  { id: 't3', nombre: 'Tarta G. - Brócoli', categoria: V, precio: 22000, tipoVenta: 'unidad', lista: 'coc' },
  { id: 't4', nombre: 'Tartas de pollo o espinaca (integral o manteca)', categoria: V, precio: 6000, tipoVenta: 'unidad', lista: 'coc', descuento: 10 },
  { id: 'emp', nombre: 'Empanadas Saladas', categoria: V, precio: 15000, tipoVenta: 'unidad', lista: 'coc' },
  { id: 'vie', nombre: 'Tarta vieja', categoria: V, precio: 18000, tipoVenta: 'unidad', lista: 'coc', oculto: true },
  { id: 'gra', nombre: 'Tarta gratis', categoria: V, precio: 0, tipoVenta: 'unidad', lista: 'coc' },
  { id: 'tap', nombre: 'Tapa De Tarta Dimax X2 Sin Tacc', categoria: 'Panificados sin TACC', precio: 3887, tipoVenta: 'unidad', lista: 'dim' },
  { id: 'mas', nombre: 'Masa Para Tarta', categoria: 'Panificados', precio: 2782, tipoVenta: 'unidad', lista: 'dim', oculto: true },
  { id: 'alm', nombre: 'Almendras', categoria: 'Frutos secos', subcategoria: 'Almendras', precio: 35475, precioMayorista: 28000, costo: 21500, tipoVenta: 'peso', lista: 'gr' },
  { id: 'nue', nombre: 'Nueces', categoria: 'Frutos secos', subcategoria: 'Nueces', precio: 30000, precioMayorista: 21600, costo: 21500, tipoVenta: 'peso', lista: 'gr' },
  { id: 'caj', nombre: 'Alfajor caja x12', categoria: 'Golosinas', precio: 1500, precioMayorista: 15000, costo: 9000, cajaCerrada: true, tipoVenta: 'unidad', lista: 'dim' },
  { id: 'dep', nombre: 'Tarta depurada', categoria: V, precio: 9000, tipoVenta: 'unidad', depurado: true },
];
const LISTAS = [{ id: 'coc', nombre: 'LA COCINA' }, { id: 'dim', nombre: 'DIMAX' }, { id: 'gr', nombre: 'GR - DISTRIBUIDORA' }];

function modulo() {
  const ctx = { console, Math, Number, String, Object, Array, Set, Map, Date, JSON, Intl, allProducts: PRODS, listasData: LISTAS,
    document: { getElementById: () => null }, esc: s => String(s) };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(cuerpo(VAR, 'esCajaCerrada') + cuerpo(VAR, 'precioMostradorDe') + cuerpo(COSTOS, '_mayoristaSinGanancia'), ctx);
  vm.runInContext(RC, ctx);
  vm.runInContext(LP, ctx);
  return ctx;
}

function pdfDeMentira(anotados) {
  return function () {
    const d = {
      paginas: 1,
      internal: { pageSize: { getWidth: () => 210, getHeight: () => 297 }, getNumberOfPages: () => d.paginas },
      setFillColor() {}, rect() {}, setTextColor() {}, setFontSize() {}, setPage() {}, setFont() {},
      getTextWidth(s) { return String(s).length * 1.8; },
      text(s, x, y) { anotados.push({ s: String(s), x, y }); },
      addPage() { d.paginas++; },
      save(n) { anotados.guardado = n; },
    };
    return d;
  };
}
function pdf(filtro, may) {
  const anotados = [], avisos = [], log = [];
  const ctx = { console, Math, Number, String, Object, Array, Set, Map, Date, JSON, allProducts: PRODS,
    showAdminToast: (m, tp) => avisos.push((tp || '') + ': ' + m), logAction: (a, b) => log.push(b),
    pedirConfirmacion: async () => true };
  ctx.window = ctx;
  ctx.jspdf = { jsPDF: pdfDeMentira(anotados) };
  vm.createContext(ctx);
  vm.runInContext(cuerpo(VAR, 'contenidoDeVariante') + cuerpo(VAR, 'esCajaCerrada') + cuerpo(VAR, 'precioMostradorDe') + cuerpo(COSTOS, '_mayoristaSinGanancia') +
    constante(HTML, '_catalogoOrden') + cuerpo(HTML, '_catalogoMatchIdx') + cuerpo(HTML, 'esPorPeso') + cuerpo(HTML, 'exportCatalogoPDF') +
    'async ' + cuerpo(HTML, 'exportMayoristaPDF'), ctx);
  return (may ? ctx.exportMayoristaPDF(filtro) : Promise.resolve(ctx.exportCatalogoPDF(null, false, filtro))).then(() => ({ anotados, avisos, log }));
}
const nombresDe = a => PRODS.filter(p => a.some(x => x.s.indexOf(p.nombre.slice(0, 12)) === 0)).map(p => p.id).sort().join(',');

(async () => {
  console.log('\n-- el precio que lleva la lista --');
  {
    const c = modulo();
    const P = id => PRODS.find(p => p.id === id);
    t('al público, el de mostrador', c.listaPreciosPrecio(P('t1'), false) === 22000);
    t('  con su oferta (10%: $6.000 → $5.400)', c.listaPreciosPrecio(P('t4'), false) === 5400);
    t('  una caja cerrada, al mayorista', c.listaPreciosPrecio(P('caj'), false) === 15000);
    t('mayorista: el mayorista', c.listaPreciosPrecio(P('alm'), true) === 28000);
    t('  sin mayorista o sin ganancia (Nueces: $21.600 con costo $21.500), 0: no va', c.listaPreciosPrecio(P('t1'), true) === 0 && c.listaPreciosPrecio(P('nue'), true) === 0);
  }

  console.log('\n-- los filtros --');
  {
    const c = modulo();
    const ids = (f, may) => c.listaPreciosProductos(PRODS, f, may).map(p => p.id).sort().join(',');
    t('sin filtros: todos los visibles con precio (sin ocultos, depurados ni en $0)', ids({}) === 'alm,caj,emp,nue,t1,t2,t3,t4,tap', ids({}));
    t('solo las tartas: la categoría y "tarta" (también "MiniTarta" y "Tartas")', ids({ cat: V, q: 'tarta' }) === 't1,t2,t3,t4', ids({ cat: V, q: 'tarta' }));
    t('  sin la categoría entra la tapa de tarta de otra categoría', ids({ q: 'tarta' }) === 't1,t2,t3,t4,tap');
    t('  "brocoli" sin tilde encuentra "Brócoli"', ids({ q: 'brocoli' }) === 't3');
    t('  palabra por palabra, en cualquier orden', ids({ q: 'pollo tartas' }) === 't4');
    t('toda la categoría', ids({ cat: V }) === 'emp,t1,t2,t3,t4');
    t('una subcategoría', ids({ cat: 'Frutos secos', sub: 'Almendras' }) === 'alm');
    t('  sin categoría, la subcategoría no cuenta (como en el reporte de costos)', ids({ sub: 'Almendras' }) === ids({}));
    t('un proveedor', ids({ lista: 'dim' }) === 'caj,tap');
    t('mayorista: solo los que tienen mayorista con ganancia', ids({}, true) === 'alm,caj', ids({}, true));
    t('el filtro en palabras', c.listaPreciosTitulo({ cat: V, q: 'tarta' }, LISTAS) === V + ' · "tarta"' &&
      c.listaPreciosTitulo({ cat: 'Frutos secos', sub: 'Almendras', lista: 'gr' }, LISTAS) === 'Frutos secos > Almendras · GR - DISTRIBUIDORA' &&
      c.listaPreciosTitulo({}, LISTAS) === '', c.listaPreciosTitulo({ cat: V, q: 'tarta' }, LISTAS));
  }

  console.log('\n-- el PDF --');
  {
    const c = modulo();
    const van = c.listaPreciosProductos(PRODS, { cat: V, q: 'tarta' }, false);
    const r = await pdf({ ids: new Set(van.map(p => p.id)), titulo: c.listaPreciosTitulo({ cat: V, q: 'tarta' }, LISTAS) });
    t('con el filtro de las tartas, salen solo las 4 tartas', nombresDe(r.anotados) === 't1,t2,t3,t4', nombresDe(r.anotados));
    t('  con sus precios ($5.400 la de la oferta)', r.anotados.some(x => x.s === '$22.000') && r.anotados.some(x => x.s === '$5.400'));
    t('  y debajo de la barra dice de qué es la lista', r.anotados.some(x => x.s === 'Productos: ' + V + ' · "tarta"' && x.y === 14));
    t('  el aviso y el Historial dicen cuántos y el filtro', r.avisos[0] === 'success: PDF exportado: 4 productos (' + V + ' · "tarta")' &&
      r.log[0] === 'Exportacion PDF catalogo: 4 productos (' + V + ' · "tarta")', [r.avisos[0], r.log[0]]);
    const todo = await pdf(null);
    t('sin filtro: la lista de siempre, sin el renglón "Productos:"', nombresDe(todo.anotados) === 'alm,caj,emp,nue,t1,t2,t3,t4,tap' &&
      !todo.anotados.some(x => /^Productos:/.test(x.s)) && todo.log[0] === 'Exportacion PDF catalogo: 9 productos');
    const vm2 = await pdf({ ids: new Set(['alm', 'nue']), titulo: 'Frutos secos' }, true);
    t('mayorista con filtro: solo esos, sin los que no dejan ganancia', nombresDe(vm2.anotados) === 'alm' && vm2.log[0] === 'Exportacion PDF MAYORISTA: 1 productos (Frutos secos)', [nombresDe(vm2.anotados), vm2.log[0]]);
    const vm3 = await pdf(null, true);
    t('mayorista sin filtro, como siempre', nombresDe(vm3.anotados) === 'alm,caj');
  }

  console.log('\n-- los botones --');
  {
    t('"Exportar PDF" abre la ventana de los filtros', /onclick="abrirListaPrecios\(false\)"/.test(HTML) && !/onclick="exportCatalogoPDF\(\)"/.test(HTML));
    t('"Exportar PDF M" también (desde openMayoristaPdfModal)', /if\(typeof abrirListaPrecios==='function'\)abrirListaPrecios\(true\);else exportMayoristaPDF\(\);/.test(cuerpo(HTML, 'openMayoristaPdfModal')));
    t('admin-lista-precios.js se carga después del reporte de costos (usa sus filtros)',
      HTML.indexOf('<script src="admin-lista-precios.js"></script>') > HTML.indexOf('<script src="admin-reporte-costos.js"></script>'));
    t('el lugar de la ventana', /<div class="modal-overlay" id="listaPreciosModal"><\/div>/.test(HTML));
    t('la ventana arranca con los filtros de la tabla de Productos', /_lp\.f = \{ cat: _rcVal\('filterCat'\), sub: '', lista: _rcVal\('filterLista'\), q: _rcVal\('searchInput'\) \};/.test(LP));
    t('el título de la barra vuelve a la letra de los renglones', /doc\.text\('Productos: '\+_tit,marginX,14\);doc\.setFont\('helvetica','normal'\);doc\.setFontSize\(8\);\}/.test(HTML));
  }

  console.log('\n' + ok + ' pasaron, ' + fail + ' fallaron');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERROR', e && e.stack || e); process.exit(1); });
