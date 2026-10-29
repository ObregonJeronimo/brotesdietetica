/**
 * REPORTE DE COSTOS (pedido de la clienta, 28/10/2026).
 *
 * "Exportar Costos" en Productos pregunta qué se quiere bajar: el reporte para comparar
 * costos (filtros por categoría, subcategoría, proveedor, nombre y visibles; PDF agrupado por
 * familia o Excel en una sola tabla) o la planilla de siempre, que vuelve a entrar por
 * "Importar Costos" y no se tocó.
 *
 * Corre de verdad admin-variantes.js, admin-compras.js, admin-costos.js y
 * admin-reporte-costos.js con un catálogo y un document de mentira.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const RAIZ = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const VAR = leer('admin-variantes.js');
const COMP = leer('admin-compras.js');
const COST = leer('admin-costos.js');
const RC = leer('admin-reporte-costos.js');
const EXP = leer('admin-exportar.js');
const html = leer('admin.html');

let ok = 0, fail = 0;
const t = (d, c, extra) => {
  if (c) { ok++; console.log('  OK   ' + d); }
  else { fail++; console.log('  FALLA ' + d + (extra !== undefined ? '   [' + JSON.stringify(extra).slice(0, 500) + ']' : '')); }
};

const FECHA = new Date('2026-10-22T20:00:00Z');
const P = (id, extra) => Object.assign({ id, nombre: id, lista: 'GR', stock: 0, tipoVenta: 'peso', porcentaje: 65 }, extra || {});
function catalogo() {
  return [
    P('alm1', { nombre: 'Almendra Carmel', gramaje: '1 kg', costo: 26790, precio: 44204, categoria: 'Frutos secos', subcategoria: 'Almendras', costoActualizadoEn: FECHA, codigo: '202041' }),
    P('alm10', { nombre: 'Almendra Carmel x 10 kg', gramaje: '10 kg', gramajePadreId: 'alm1', costo: 26000, precio: 42900, categoria: 'Frutos secos', subcategoria: 'Almendras', costoActualizadoEn: FECHA }),
    P('alm2', { nombre: 'Almendra Carmel x 2 kg', gramaje: '2 kg', gramajePadreId: 'alm1', costo: 26530, precio: 43775, categoria: 'Frutos secos', subcategoria: 'Almendras', costoActualizadoEn: FECHA }),
    P('mar', { nombre: 'Almendras Partidas', costo: 15909, precio: 26250, categoria: 'Frutos secos', lista: 'MAR' }),
    P('caju', { nombre: 'Castanas De Caju', costo: 16545, precio: 27300, categoria: 'Frutos secos', lista: 'MAR', oculto: true }),
    P('cajuGR', { nombre: 'Castaña Cajú W4 Vietnam', costo: 14890, precio: 24569, categoria: 'Frutos secos', subcategoria: 'Castañas' }),
    P('len', { nombre: 'Lenteja x 5 kg', costo: 2000, precio: 3300, categoria: 'Legumbres y cereales', lista: 'MAR' }),
    P('chia', { nombre: 'Chia', costo: 4000, precio: 6600, categoria: 'Semillas', bolsaGramos: 25000 }),
    P('gal', { nombre: 'Galletas De Arroz', tipoVenta: 'unidad', costo: 1200, precio: 1980, categoria: 'Galletas y snacks', lista: 'MAR' }),
    P('vieja', { nombre: 'Almendra Vieja', costo: 100, precio: 165, categoria: 'Frutos secos', depurado: true }),
    P('suelto', { nombre: 'Producto Suelto', tipoVenta: 'unidad', costo: 500, precio: 800, categoria: '', lista: 'X' }),
  ];
}
const LISTAS = [{ id: 'GR', nombre: 'GR - DISTRIBUIDORA (FR. SC)' }, { id: 'MAR', nombre: 'MARTIN F.S' }];

function elemento(id) {
  const clases = new Set();
  return {
    id, value: '', innerHTML: '', textContent: '', disabled: false, style: {},
    classList: { add: c => clases.add(c), remove: c => clases.delete(c), contains: c => clases.has(c) },
    addEventListener() {}, setAttribute() {}, focus() {}, querySelector: () => null, querySelectorAll: () => [],
  };
}

function armar(opts) {
  const o = opts || {};
  const els = {};
  const el = id => els[id] || (els[id] = elemento(id));
  const reg = { exportados: [], avisos: [] };
  const ctx = {
    console, Math, Number, String, Object, Array, Set, Map, Promise, JSON, Date, parseInt, isFinite,
    setTimeout: () => 0,
    allProducts: o.productos || catalogo(),
    listasData: LISTAS,
    savedCats: {},
    document: {
      getElementById: id => el(id),
      querySelector: () => null, querySelectorAll: () => [],
      createElement: () => elemento(''), addEventListener() {},
    },
    window: {},
    showAdminToast: (m, tp) => reg.avisos.push((tp || '') + ':' + m),
    exportarDoc: (doc, fmt) => { reg.exportados.push({ doc, fmt }); return o.exportaBien !== false; },
  };
  vm.createContext(ctx);
  vm.runInContext(VAR, ctx);
  vm.runInContext(COMP, ctx);
  vm.runInContext(COST, ctx);
  vm.runInContext(RC, ctx);
  return { ctx, els, el, reg, ver: expr => vm.runInContext(expr, ctx) };
}

const ids = lista => lista.map(p => p.id).sort().join(',');

console.log('\n-- qué productos van (los filtros) --');
{
  const { ctx } = armar();
  const F = f => ctx.reporteCostosFiltrar(ctx.allProducts, f);
  t('sin filtros y solo visibles: todo menos el depurado y el oculto',
    ids(F({ vis: 'visibles' })) === 'alm1,alm10,alm2,cajuGR,chia,gal,len,mar,suelto', ids(F({ vis: 'visibles' })));
  t('  "Visibles y ocultos" suma el oculto (el depurado nunca)', ids(F({ vis: '' })) === 'alm1,alm10,alm2,caju,cajuGR,chia,gal,len,mar,suelto');
  t('  "Solo ocultos" deja solo el oculto', ids(F({ vis: 'ocultos' })) === 'caju');
  t('por categoría: solo los de Frutos secos, con sus bolsas', ids(F({ cat: 'Frutos secos', vis: 'visibles' })) === 'alm1,alm10,alm2,cajuGR,mar');
  t('  y la subcategoría Almendras: el producto con sus dos bolsas',
    ids(F({ cat: 'Frutos secos', sub: 'Almendras', vis: 'visibles' })) === 'alm1,alm10,alm2');
  t('  una subcategoría sin categoría no filtra (el desplegable la pide primero)',
    ids(F({ sub: 'Almendras', vis: 'visibles' })) === ids(F({ vis: 'visibles' })));
  t('por proveedor: solo los de MARTIN F.S (visibles)', ids(F({ lista: 'MAR', vis: 'visibles' })) === 'gal,len,mar');
  t('por nombre, sin tildes y palabra por palabra: "castana caju" trae los dos proveedores',
    ids(F({ q: 'castana caju', vis: '' })) === 'caju,cajuGR', ids(F({ q: 'castana caju', vis: '' })));
  t('  en cualquier orden y con mayúsculas: "CAJU castaña"', ids(F({ q: 'CAJU castaña', vis: '' })) === 'caju,cajuGR');
  t('  "almendra" trae todas las almendras (no la depurada)', ids(F({ q: 'almendra', vis: 'visibles' })) === 'alm1,alm10,alm2,mar');
  t('  también por código', ids(F({ q: '202041', vis: '' })) === 'alm1');
  t('  una palabra que no está en ninguno: nada', F({ q: 'almendra pistacho', vis: '' }).length === 0);
}

console.log('\n-- el PDF: una tabla por familia --');
{
  const { ctx } = armar();
  const doc = ctx.reporteCostosDoc(ctx.allProducts, LISTAS, { vis: 'visibles', orden: 'nombre' }, 'pdf');
  const titulos = doc.bloques.map(b => b.titulo);
  t('las familias en orden: cada categoría con los sin subcategoría primero, y "Sin categoría" al final',
    JSON.stringify(titulos) === JSON.stringify(['Frutos secos (1)', 'Frutos secos · Almendras (3)', 'Frutos secos · Castañas (1)',
      'Galletas y snacks (1)', 'Legumbres y cereales (1)', 'Semillas (1)', 'Sin categoría (1)']), titulos);
  t('hoja apaisada, con título y archivo', doc.horizontal === true && doc.titulo === 'Reporte de costos' && /^reporte_costos/.test(doc.archivo));
  const alm = doc.bloques[1];
  t('las columnas', JSON.stringify(alm.columnas) === JSON.stringify(['Producto', 'Proveedor', 'Costo', 'Costo de la bolsa', 'Último cambio', 'Precio']));
  t('por nombre, el producto con sus bolsas de la más chica a la más grande',
    alm.filas.map(f => f[0]).join('|') === 'Almendra Carmel|Almendra Carmel x 2 kg|Almendra Carmel x 10 kg', alm.filas.map(f => f[0]));
  t('la bolsa de 2 kg: costo por kilo, costo de la bolsa, fecha y precio por kilo',
    JSON.stringify(alm.filas[1]) === JSON.stringify(['Almendra Carmel x 2 kg', 'GR - DISTRIBUIDORA (FR. SC)', '$26.530 /kg', '$53.060 (2 kg)', '22/10/2026', '$43.775 /kg']),
    alm.filas[1]);
  t('  el principal de 1 kg también dice su bolsa', alm.filas[0][3] === '$26.790 (1 kg)', alm.filas[0]);
  t('  la de 10 kg: $260.000 la bolsa', alm.filas[2][3] === '$260.000 (10 kg)', alm.filas[2]);
  const fila = n => doc.bloques.flatMap(b => b.filas).find(f => f[0] === n);
  t('un granel suelto con la bolsa en el nombre: la bolsa de 5 kg', fila('Lenteja x 5 kg')[3] === '$10.000 (5 kg)', fila('Lenteja x 5 kg'));
  t('  con la bolsa anotada aparte (bolsaGramos): la de 25 kg', fila('Chia')[3] === '$100.000 (25 kg)', fila('Chia'));
  t('  sin bolsa conocida: solo el costo por kilo', fila('Almendras Partidas')[3] === '' && fila('Almendras Partidas')[2] === '$15.909 /kg');
  t('por unidad: "c/u" y sin bolsa', JSON.stringify(fila('Galletas De Arroz').slice(2)) === JSON.stringify(['$1.200 c/u', '', '—', '$1.980']), fila('Galletas De Arroz'));
  t('sin fecha de costo y sin proveedor conocido: una raya', fila('Producto Suelto')[1] === '—' && fila('Producto Suelto')[4] === '—');
  t('el subtítulo dice qué se eligió y cuántos salen',
    /^Al \d\d\/\d\d\/\d{4} · Todas las categorías · Todos los proveedores · Solo visibles · Por nombre · 9 productos$/.test(doc.subtitulo), doc.subtitulo);
}

console.log('\n-- ordenado por costo --');
{
  const { ctx } = armar();
  const doc = ctx.reporteCostosDoc(ctx.allProducts, LISTAS, { cat: 'Frutos secos', vis: '', orden: 'costo' }, 'pdf');
  const todas = doc.bloques.flatMap(b => b.filas.map(f => f[0]));
  const alm = doc.bloques.find(b => /Almendras/.test(b.titulo));
  t('adentro de cada familia, del más barato al más caro (por kilo)',
    alm.filas.map(f => f[0]).join('|') === 'Almendra Carmel x 10 kg|Almendra Carmel x 2 kg|Almendra Carmel', alm.filas.map(f => f[0]));
  t('  los sin subcategoría: Almendras Partidas ($15.909) antes que Castanas De Caju ($16.545)',
    doc.bloques[0].filas.map(f => f[0]).join('|') === 'Almendras Partidas|Castanas De Caju', doc.bloques[0].filas.map(f => f[0]));
  t('el subtítulo dice la categoría, que van los ocultos y el orden',
    / · Categoría: Frutos secos · Todos los proveedores · Visibles y ocultos · Por costo, de menor a mayor · 6 productos$/.test(doc.subtitulo), doc.subtitulo);
  t('  y el archivo lleva la categoría', doc.archivo === 'reporte_costos_Frutos secos', doc.archivo);
  const mixto = ctx.reporteCostosDoc(ctx.allProducts, LISTAS, { vis: 'visibles', orden: 'costo', q: 'a' }, 'excel').bloques[0].filas;
  const tipos = mixto.map(f => f[4]);
  t('por costo, primero los que van por kilo y después los de por unidad (no se comparan)',
    tipos.indexOf('Por unidad') > tipos.lastIndexOf('Por kilo'), tipos);
  t('  y adentro de los por kilo, de menor a mayor',
    mixto.filter(f => f[4] === 'Por kilo').every((f, i, a) => !i || a[i - 1][5] <= f[5]), mixto.map(f => f[5]));
}

console.log('\n-- el Excel: una sola tabla, con los montos como números --');
{
  const { ctx } = armar();
  const doc = ctx.reporteCostosDoc(ctx.allProducts, LISTAS, { cat: 'Frutos secos', sub: 'Almendras', vis: 'visibles' }, 'excel');
  const b = doc.bloques[0];
  t('un solo bloque con la categoría y la subcategoría como columnas', doc.bloques.length === 1 &&
    JSON.stringify(b.columnas) === JSON.stringify(['Categoría', 'Subcategoría', 'Producto', 'Proveedor', 'Se vende', 'Costo', 'Bolsa',
      'Costo de la bolsa', 'Último cambio de costo', '% de ganancia', 'Precio']), b.columnas);
  t('la bolsa de 2 kg, con números para poder ordenar y sumar en Excel',
    JSON.stringify(b.filas[1]) === JSON.stringify(['Frutos secos', 'Almendras', 'Almendra Carmel x 2 kg', 'GR - DISTRIBUIDORA (FR. SC)', 'Por kilo',
      26530, '2 kg', 53060, '22/10/2026', 65, 43775]), b.filas[1]);
  t('el subtítulo dice la subcategoría', / · Categoría: Frutos secos · Subcategoría: Almendras · /.test(doc.subtitulo), doc.subtitulo);
  const vacio = ctx.reporteCostosDoc(ctx.allProducts, LISTAS, { q: 'nada de nada' }, 'excel');
  t('sin productos, sin bloques (exportarDoc avisa "No hay nada para exportar")', vacio.bloques.length === 0);
}

console.log('\n-- la ventana --');
{
  const { ctx, els, reg, ver } = armar();
  els.filterCat = Object.assign(elemento('filterCat'), { value: 'Frutos secos' });
  els.filterLista = Object.assign(elemento('filterLista'), { value: 'GR' });
  els.searchInput = Object.assign(elemento('searchInput'), { value: 'carmel' });
  els.filterVisibilidad = Object.assign(elemento('filterVisibilidad'), { value: 'visibles' });
  ctx.abrirExportarCostos();
  t('se abre preguntando qué bajar: el reporte o la planilla', els.exportFormatModal.classList.contains('show') &&
    /Reporte para comparar costos/.test(els.rcCuerpo.innerHTML) && /Planilla para actualizar costos/.test(els.rcCuerpo.innerHTML));
  ctx.rcPaso('planilla');
  t('la planilla: los botones de siempre (exportCostosWithFormat xlsx y csv) y Volver',
    /exportCostosWithFormat\('xlsx'\)/.test(els.rcCuerpo.innerHTML) && /exportCostosWithFormat\('csv'\)/.test(els.rcCuerpo.innerHTML) &&
    /rcPaso\('elegir'\)/.test(els.rcCuerpo.innerHTML));
  ctx.rcPaso('reporte');
  const h = els.rcCuerpo.innerHTML;
  t('el reporte arranca con los filtros de la tabla de Productos', /<option value="Frutos secos" selected>/.test(h) &&
    /<option value="GR" selected>/.test(h) && /value="carmel"/.test(h) && /<option value="visibles" selected>/.test(h), h.slice(0, 300));
  t('  con la categoría elegida, el desplegable de subcategorías habilitado', !/id="rcSub" class="form-input" onchange="rcContar\(\)" disabled/.test(h));
  els.rcCat.value = 'Frutos secos'; els.rcSub.value = ''; els.rcLista.value = 'GR'; els.rcQ.value = 'carmel'; els.rcVis.value = 'visibles'; els.rcOrden.value = 'nombre';
  ctx.rcContar();
  t('cuántos van a salir, avisando que cada bolsa cuenta', els.rcCuenta.textContent === 'Van a salir 3 productos (cada bolsa cuenta como uno).', els.rcCuenta.textContent);
  t('  y se puede bajar', els.rcPdf.disabled === false && els.rcExcel.disabled === false);
  els.rcQ.value = 'nada de nada';
  ctx.rcContar();
  t('sin productos: lo dice y no deja bajar', els.rcCuenta.textContent === 'No hay productos con estos filtros.' && els.rcPdf.disabled && els.rcExcel.disabled);
  els.rcQ.value = 'carmel';
  ctx.rcCambioCat();
  els.rcCat.value = '';
  ctx.rcCambioCat();
  t('sin categoría, el de subcategorías se apaga y pide una', els.rcSub.disabled === true && /Elegí una categoría/.test(els.rcSub.innerHTML));
  els.rcCat.value = 'Frutos secos'; els.rcSub.value = 'Almendras'; els.rcOrden.value = 'costo';
  ctx.rcExportar('pdf');
  const ex = reg.exportados[0];
  t('bajar en PDF: exportarDoc con el reporte de lo elegido, y se cierra la ventana',
    ex && ex.fmt === 'pdf' && ex.doc.bloques.length === 1 && ex.doc.bloques[0].titulo === 'Frutos secos · Almendras (3)' &&
    !els.exportFormatModal.classList.contains('show'), ex && ex.doc.bloques.map(b => b.titulo));
  ctx.abrirExportarCostos();
  t('al volver a abrir, se acuerda del orden elegido y vuelve a los filtros de la tabla', ver('_rc.f.orden') === 'costo' && ver('_rc.f.cat') === 'Frutos secos' && ver('_rc.f.sub') === '');
}
{
  const { ctx, els, reg } = armar({ exportaBien: false });
  ctx.abrirExportarCostos();
  ctx.rcPaso('reporte');
  els.rcVis.value = 'visibles'; els.rcOrden.value = 'costo';
  ctx.rcExportar('excel');
  t('si no se pudo exportar, la ventana queda abierta', reg.exportados.length === 1 && reg.exportados[0].fmt === 'excel' &&
    els.exportFormatModal.classList.contains('show'));
}

console.log('\n-- el botón, la planilla de siempre y el PDF apaisado --');
{
  const m = html.match(/function exportCostosExcel\(\)\{[^\n]*\}/);
  t('"Exportar Costos" abre la ventana nueva (y sin el módulo, baja la planilla como antes)',
    m && /abrirExportarCostos\(\);return;/.test(m[0]) && /exportCostosWithFormat\('xlsx'\);\}$/.test(m[0]), m && m[0]);
  const i = html.indexOf('function exportCostosWithFormat(formato){');
  const cuerpoPlanilla = html.slice(i, html.indexOf('XLSX.writeFile(wb,', i));
  t('la planilla para actualizar costos sigue con sus columnas de siempre',
    cuerpoPlanilla.indexOf("[['NOMBRE','COSTO','PORCENTAJE','PRECIO','GRAMAJE','CODIGO','LISTA','NOMBRE PUBLICO']]") >= 0);
  t('  sin CATEGORIA ni STOCK (si no, reimportarla duplica el catálogo)', !/'CATEGORIA'|'STOCK'/.test(cuerpoPlanilla));
  t('la ventana vieja quedó vacía: la arma el módulo', /<div class="modal-overlay" id="exportFormatModal"><\/div>/.test(html));
  t('el módulo se carga después del motor de exportación', html.indexOf('<script src="admin-exportar.js"></script>') < html.indexOf('<script src="admin-reporte-costos.js"></script>') &&
    html.indexOf('<script src="admin-reporte-costos.js"></script>') > 0);

  /* El PDF de verdad (_expPDF) con un jsPDF de mentira: apaisado solo si el documento lo pide. */
  const hojas = [];
  const ctx = {
    console, Math, Number, String, Object, Array, Date,
    showAdminToast() {},
    window: { jspdf: { jsPDF: function (o) {
      hojas.push(o);
      const ancho = o.orientation === 'landscape' ? 297 : 210;
      return { internal: { pageSize: { getWidth: () => ancho, getHeight: () => 507 - ancho }, getNumberOfPages: () => 1 },
        setFont() {}, setFontSize() {}, setTextColor() {}, setDrawColor() {}, text() {}, line() {}, addPage() {}, setPage() {}, save() {},
        splitTextToSize: s => [s] };
    } } },
  };
  vm.createContext(ctx);
  vm.runInContext(EXP, ctx);
  ctx.exportarDoc({ titulo: 'A', bloques: [{ tipo: 'tabla', titulo: 'B', columnas: ['x'], filas: [['1']] }], horizontal: true }, 'pdf');
  ctx.exportarDoc({ titulo: 'A', bloques: [{ tipo: 'tabla', titulo: 'B', columnas: ['x'], filas: [['1']] }] }, 'pdf');
  t('el PDF sale apaisado con horizontal, y vertical como siempre sin eso',
    hojas.length === 2 && hojas[0].orientation === 'landscape' && hojas[1].orientation === 'portrait', hojas);
}

console.log('\n' + ok + ' pasaron, ' + fail + ' fallaron');
process.exit(fail ? 1 : 0);
