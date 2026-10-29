/* ==========================================================================
   REPORTE DE COSTOS (pedido de la clienta, 28/10/2026)

   "Necesitaría filtrar y exportar reporte de costos por productos y familias
   de productos para cotejar precios antes de realizar los pedidos a
   proveedores y comparar sus costos."

   Va en el mismo botón "Exportar Costos" de Productos (Thiago: mejor que un
   botón nuevo), que ahora pregunta qué se quiere bajar:

     - el REPORTE para comparar: se eligen los productos por categoría,
       subcategoría, proveedor, nombre y si van los ocultos (arranca con los
       filtros que estén puestos en Productos), y sale en PDF o en Excel, con
       el costo por kilo o por unidad, el de la bolsa, la fecha del último
       cambio de costo y el precio. El PDF va agrupado por familia (categoría
       y subcategoría); el Excel es una sola tabla con esas dos columnas, para
       filtrar y ordenar ahí, y los montos van como números.
     - la PLANILLA de siempre (exportCostosWithFormat, admin.html), que NO se
       tocó: es la que vuelve a entrar por "Importar Costos", y processExcel
       decide que un archivo es "de costos" porque no tiene STOCK ni CATEGORIA.
       Agregándole la categoría, reimportarla se tomaba como un alta masiva y
       duplicaba el catálogo. Por eso el reporte es otro archivo.

   El buscador por nombre no distingue tildes ni mayúsculas y pide cada palabra
   por separado, en cualquier orden: "castana caju" encuentra "Castaña Cajú W4"
   y "Castanas De Caju", que es justo comparar el mismo producto de dos
   proveedores que lo escriben distinto.

   El documento lo arma reporteCostosDoc, sin DOM ni Firestore (se prueba en
   pruebas/t-reporte-costos.js), y lo dibuja exportarDoc (admin-exportar.js).
   ========================================================================== */

const _RC_VIS = { '': 'Visibles y ocultos', visibles: 'Solo visibles', ocultos: 'Solo ocultos' };

/* Sin tildes ni mayúsculas, como el buscador de los desplegables (selbNormalizar). */
function _rcNorm(s) {
  return String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}
const _rcEsc = s => (typeof esc === 'function' ? esc(String(s == null ? '' : s))
  : String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'));
const _rcPesos = n => '$' + Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 2 });
const _rcTam = g => (g >= 1000 ? (g / 1000).toLocaleString('es-AR', { maximumFractionDigits: 3 }) + ' kg' : g + ' g');
const _rcCmp = (a, b) => String(a || '').localeCompare(String(b || ''), 'es', { sensitivity: 'base', numeric: true });
function _rcHoy() {
  return new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function _rcFecha(p) {
  const f = typeof fechaDeCosto === 'function' ? fechaDeCosto(p) : null;
  return f ? f.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
}
/* La bolsa del producto, la misma que usa Cargar compra (_cpGramosBolsa): la suya si es una
   bolsa de un producto con varias, o la que se le compra al proveedor en un granel suelto
   (anotada aparte o la del nombre). Sin bolsa conocida, null: va solo el costo por kilo. */
function _rcGramos(p) {
  if (!p || p.tipoVenta !== 'peso') return null;
  return typeof _cpGramosBolsa === 'function' ? (_cpGramosBolsa(p) || null) : null;
}

/* Los productos que van, con los mismos criterios que la tabla de Productos (filterTable):
   sin los depurados, la categoría y el proveedor de cada ficha, y lo visible. La
   subcategoría solo cuenta con una categoría elegida. */
function reporteCostosFiltrar(prods, f) {
  const o = f || {};
  const palabras = _rcNorm(o.q).split(/\s+/).filter(Boolean);
  return (prods || []).filter(p => p && p.depurado !== true &&
    (!o.cat || p.categoria === o.cat) &&
    (!o.cat || !o.sub || (p.subcategoria || '') === o.sub) &&
    (!o.lista || p.lista === o.lista) &&
    (o.vis !== 'visibles' || p.oculto !== true) &&
    (o.vis !== 'ocultos' || p.oculto === true) &&
    (!palabras.length || palabras.every(w => (_rcNorm(p.nombre) + ' ' + _rcNorm(p.codigo)).includes(w))));
}

function _rcFila(p, nomLista) {
  const peso = p.tipoVenta === 'peso';
  const costo = Number(p.costo || 0);
  const g = _rcGramos(p);
  return {
    p, peso, costo, gramos: g,
    costoBolsa: g && typeof costoDeBolsa === 'function' ? costoDeBolsa(costo, g) : null,
    proveedor: nomLista(p.lista), fecha: _rcFecha(p),
    pct: Number(p.porcentaje || 0), precio: Number(p.precio || 0),
    cat: p.categoria || '', sub: p.subcategoria || '',
  };
}

/* Por nombre: cada producto con sus bolsas juntas, de la más chica a la más grande (como en
   Productos y en la lista de precios). Por costo: del más barato al más caro, primero los que
   van por kilo y después los que van por unidad (un costo por kilo y uno por unidad no se
   comparan). */
function _rcOrdenar(filas, orden, prods) {
  if (orden === 'costo') {
    return filas.sort((a, b) => (a.peso === b.peso ? 0 : (a.peso ? -1 : 1)) || (a.costo - b.costo) || _rcCmp(a.p.nombre, b.p.nombre));
  }
  /* El principal de cada fila, una sola vez (principalDeVariante recorre el catálogo en cada llamada). */
  const porId = new Map((prods || []).filter(Boolean).map(x => [x.id, x]));
  filas.forEach(r => { r.ppal = (r.p.gramajePadreId && porId.get(r.p.gramajePadreId)) || r.p; });
  return filas.sort((a, b) => {
    const pa = a.ppal, pb = b.ppal;
    if (pa.id !== pb.id) return _rcCmp(pa.nombre, pb.nombre) || (pa.id < pb.id ? -1 : 1);
    return typeof _ordenVariantes === 'function' ? _ordenVariantes(a.p, b.p) : _rcCmp(a.p.nombre, b.p.nombre);
  });
}

/* El documento para exportarDoc. `formato` 'excel' o 'pdf'. */
function reporteCostosDoc(prods, listas, f, formato) {
  const o = f || {};
  const nombres = new Map((listas || []).map(l => [l.id, l.nombre || '']));
  const nomLista = id => nombres.get(id) || '';
  const filas = _rcOrdenar(reporteCostosFiltrar(prods, o).map(p => _rcFila(p, nomLista)), o.orden, prods);

  const partes = ['Al ' + _rcHoy(),
    o.cat ? 'Categoría: ' + o.cat + (o.sub ? ' · Subcategoría: ' + o.sub : '') : 'Todas las categorías',
    o.lista ? 'Proveedor: ' + (nomLista(o.lista) || 'el elegido') : 'Todos los proveedores'];
  if (_rcNorm(o.q)) partes.push('Nombre: "' + String(o.q).trim() + '"');
  partes.push(_RC_VIS[o.vis || ''] || _RC_VIS['']);
  partes.push(o.orden === 'costo' ? 'Por costo, de menor a mayor' : 'Por nombre');
  partes.push(filas.length + (filas.length === 1 ? ' producto' : ' productos'));
  const doc = {
    titulo: 'Reporte de costos',
    subtitulo: partes.join(' · '),
    archivo: 'reporte_costos' + (o.cat ? '_' + o.cat : '') + (o.lista ? '_' + nomLista(o.lista) : ''),
    horizontal: true,
    bloques: [],
  };
  if (!filas.length) return doc;

  if (formato === 'excel') {
    doc.bloques.push({
      tipo: 'tabla',
      titulo: 'Productos (' + filas.length + ')',
      columnas: ['Categoría', 'Subcategoría', 'Producto', 'Proveedor', 'Se vende', 'Costo', 'Bolsa', 'Costo de la bolsa',
        'Último cambio de costo', '% de ganancia', 'Precio'],
      filas: filas.map(r => [r.cat || 'Sin categoría', r.sub, r.p.nombre || '', r.proveedor, r.peso ? 'Por kilo' : 'Por unidad',
        r.costo, r.gramos ? _rcTam(r.gramos) : '', r.costoBolsa == null ? '' : r.costoBolsa, r.fecha, r.pct, r.precio]),
    });
    return doc;
  }

  /* PDF: una tabla por familia, en el orden elegido adentro. Sin categoría, al final; en cada
     categoría, primero los que no tienen subcategoría. */
  const familias = new Map();
  filas.forEach(r => {
    const k = r.cat + '\u0001' + r.sub;
    if (!familias.has(k)) familias.set(k, { cat: r.cat, sub: r.sub, filas: [] });
    familias.get(k).filas.push(r);
  });
  [...familias.values()]
    .sort((a, b) => (!a.cat - !b.cat) || _rcCmp(a.cat, b.cat) || (!!a.sub - !!b.sub) || _rcCmp(a.sub, b.sub))
    .forEach(g => doc.bloques.push({
      tipo: 'tabla',
      titulo: (g.cat || 'Sin categoría') + (g.sub ? ' · ' + g.sub : '') + ' (' + g.filas.length + ')',
      columnas: ['Producto', 'Proveedor', 'Costo', 'Costo de la bolsa', 'Último cambio', 'Precio'],
      anchos: [100, 55, 30, 36, 22, 26],
      derecha: [2, 3, 4, 5],
      filas: g.filas.map(r => [r.p.nombre || '', r.proveedor || '—', _rcPesos(r.costo) + (r.peso ? ' /kg' : ' c/u'),
        r.costoBolsa == null ? '' : _rcPesos(r.costoBolsa) + ' (' + _rcTam(r.gramos) + ')', r.fecha || '—',
        _rcPesos(r.precio) + (r.peso ? ' /kg' : '')]),
    }));
  return doc;
}

/* ============================ PANTALLA ============================ */

const _rc = { paso: 'elegir', f: { cat: '', sub: '', lista: '', q: '', vis: 'visibles', orden: 'nombre' } };
const _rcProds = () => (typeof allProducts !== 'undefined' && Array.isArray(allProducts) ? allProducts : []);
const _rcListas = () => (typeof listasData !== 'undefined' && Array.isArray(listasData) ? listasData : []);
const _rcVal = id => { const e = document.getElementById(id); return e && e.value != null ? String(e.value) : ''; };

/* El botón "Exportar Costos" (exportCostosExcel, admin.html). */
function abrirExportarCostos() {
  /* Arranca con los filtros que tiene puestos la tabla de Productos: lo que se ve. */
  _rc.f = { cat: _rcVal('filterCat'), sub: '', lista: _rcVal('filterLista'), q: _rcVal('searchInput'),
    vis: _rcVal('filterVisibilidad'), orden: _rc.f.orden || 'nombre' };
  const m = document.getElementById('exportFormatModal');
  if (!m) return;
  m.innerHTML = '<div class="modal-box rc-box"><div class="modal-header"><h3><i class="bi bi-download"></i> Exportar costos</h3>' +
    '<button class="modal-close" onclick="cerrarExportarCostos()"><i class="bi bi-x-lg"></i></button></div>' +
    '<div class="rc-cuerpo" id="rcCuerpo"></div></div>';
  _rc.paso = 'elegir';
  rcPaso('elegir');
  m.classList.add('show');
}
function cerrarExportarCostos() {
  const m = document.getElementById('exportFormatModal');
  if (m) m.classList.remove('show');
}

function rcPaso(paso) {
  if (_rc.paso === 'reporte') _rcLeer();
  _rc.paso = paso;
  const c = document.getElementById('rcCuerpo');
  if (!c) return;
  if (paso === 'planilla') { c.innerHTML = _rcPlanillaHtml(); return; }
  if (paso === 'reporte') { c.innerHTML = _rcReporteHtml(); rcContar(); return; }
  c.innerHTML = '<p class="rc-ayuda">¿Qué querés bajar?</p><div class="rc-opciones">' +
    '<button class="estado-opt" onclick="rcPaso(\'reporte\')"><span class="estado-opt-icon rc-ico-rep"><i class="bi bi-funnel"></i></span>' +
    '<div class="estado-opt-info"><div class="estado-opt-label">Reporte para comparar costos</div>' +
    '<div class="estado-opt-desc">Elegís qué productos (por categoría, subcategoría, proveedor o nombre) y sale en PDF o en Excel, ' +
    'ordenado por familia, con el costo por kilo y el de la bolsa.</div></div></button>' +
    '<button class="estado-opt" onclick="rcPaso(\'planilla\')"><span class="estado-opt-icon rc-ico-pla"><i class="bi bi-file-earmark-spreadsheet"></i></span>' +
    '<div class="estado-opt-info"><div class="estado-opt-label">Planilla para actualizar costos</div>' +
    '<div class="estado-opt-desc">La de siempre: todo el catálogo en Excel o CSV, para cambiar los costos y volver a subirla con "Importar Costos".</div></div></button>' +
    '</div>';
}

function _rcPlanillaHtml() {
  return '<p class="rc-ayuda">Todo el catálogo, con nombre, costo, porcentaje y precio. Se cambian los costos en el Excel y se vuelve a subir con "Importar Costos".</p>' +
    '<div class="rc-formatos">' +
    '<button class="btn btn-primary rc-formato" onclick="exportCostosWithFormat(\'xlsx\')"><i class="bi bi-file-earmark-excel"></i><span>Excel</span><small>.xlsx</small></button>' +
    '<button class="btn btn-secondary rc-formato" onclick="exportCostosWithFormat(\'csv\')"><i class="bi bi-file-earmark-text"></i><span>CSV</span><small>.csv</small></button>' +
    '</div><div class="rc-pie"><button class="btn btn-secondary" onclick="rcPaso(\'elegir\')"><i class="bi bi-arrow-left"></i> Volver</button></div>';
}

function _rcOpciones(pares, actual) {
  return pares.map(([v, t]) => '<option value="' + _rcEsc(v) + '"' + (v === actual ? ' selected' : '') + '>' + _rcEsc(t) + '</option>').join('');
}
function _rcCategorias() {
  if (typeof _todasLasCategorias === 'function') return _todasLasCategorias();
  return [...new Set(_rcProds().map(p => p.categoria).filter(Boolean))].sort();
}
function _rcSubsHtml(cat, actual) {
  if (!cat) return '<option value="">Elegí una categoría</option>';
  const subs = typeof _subcategoriasDe === 'function' ? _subcategoriasDe(cat)
    : [...new Set(_rcProds().filter(p => p.categoria === cat && p.subcategoria).map(p => p.subcategoria))].sort();
  return _rcOpciones([['', 'Todas']].concat(subs.map(s => [s, s])), actual);
}

function _rcReporteHtml() {
  const f = _rc.f;
  const cats = _rcCategorias();
  if (f.cat && cats.indexOf(f.cat) < 0) f.cat = '';
  const listas = _rcListas().slice().sort((a, b) => _rcCmp(a.nombre, b.nombre));
  if (f.lista && !listas.some(l => l.id === f.lista)) f.lista = '';
  return '<p class="rc-ayuda">Elegí qué productos van. Arranca con los filtros que tenés puestos en Productos.</p>' +
    '<div class="form-row">' +
    '<div class="form-group"><label for="rcCat">Categoría</label><select id="rcCat" class="form-input" onchange="rcCambioCat()">' +
    _rcOpciones([['', 'Todas']].concat(cats.map(c => [c, c])), f.cat) + '</select></div>' +
    '<div class="form-group"><label for="rcSub">Subcategoría</label><select id="rcSub" class="form-input" onchange="rcContar()"' + (f.cat ? '' : ' disabled') + '>' +
    _rcSubsHtml(f.cat, f.sub) + '</select></div></div>' +
    '<div class="form-row">' +
    '<div class="form-group"><label for="rcLista">Proveedor</label><select id="rcLista" class="form-input" onchange="rcContar()">' +
    _rcOpciones([['', 'Todos']].concat(listas.map(l => [l.id, l.nombre || ''])), f.lista) + '</select></div>' +
    '<div class="form-group"><label for="rcQ">Nombre</label><input id="rcQ" class="form-input" type="text" placeholder="Ej: almendra" value="' +
    _rcEsc(f.q) + '" oninput="rcContar()"></div></div>' +
    '<div class="form-row">' +
    '<div class="form-group"><label for="rcVis">Productos</label><select id="rcVis" class="form-input" onchange="rcContar()">' +
    _rcOpciones([['visibles', _RC_VIS.visibles], ['', _RC_VIS['']], ['ocultos', _RC_VIS.ocultos]], f.vis) + '</select></div>' +
    '<div class="form-group"><label for="rcOrden">Ordenar por</label><select id="rcOrden" class="form-input" onchange="rcContar()">' +
    _rcOpciones([['nombre', 'Nombre'], ['costo', 'Costo, de menor a mayor']], f.orden) + '</select></div></div>' +
    '<p class="rc-cuenta" id="rcCuenta"></p>' +
    '<div class="rc-pie"><button class="btn btn-secondary" onclick="rcPaso(\'elegir\')"><i class="bi bi-arrow-left"></i> Volver</button>' +
    '<span class="rc-pie-der">' +
    '<button class="btn btn-secondary" id="rcExcel" onclick="rcExportar(\'excel\')"><i class="bi bi-file-earmark-excel"></i> Bajar en Excel</button>' +
    '<button class="btn btn-primary" id="rcPdf" onclick="rcExportar(\'pdf\')"><i class="bi bi-file-earmark-pdf"></i> Bajar en PDF</button>' +
    '</span></div>';
}

function _rcLeer() {
  if (!document.getElementById('rcCat')) return;
  _rc.f = { cat: _rcVal('rcCat'), sub: _rcVal('rcSub'), lista: _rcVal('rcLista'), q: _rcVal('rcQ'),
    vis: _rcVal('rcVis'), orden: _rcVal('rcOrden') || 'nombre' };
  if (!_rc.f.cat) _rc.f.sub = '';
}

function rcCambioCat() {
  const cat = _rcVal('rcCat');
  const s = document.getElementById('rcSub');
  if (s) { s.innerHTML = _rcSubsHtml(cat, ''); s.value = ''; s.disabled = !cat; }
  rcContar();
}

/* Cuántos van a salir, mientras se eligen los filtros. Con cero no se puede bajar. */
function rcContar() {
  _rcLeer();
  const van = reporteCostosFiltrar(_rcProds(), _rc.f);
  const n = van.length;
  const c = document.getElementById('rcCuenta');
  if (c) {
    c.textContent = n ? 'Van a salir ' + n + (n === 1 ? ' producto' : ' productos') +
      (van.some(p => p.gramajePadreId) ? ' (cada bolsa cuenta como uno).' : '.') : 'No hay productos con estos filtros.';
  }
  ['rcExcel', 'rcPdf'].forEach(id => { const b = document.getElementById(id); if (b) b.disabled = !n; });
}

function rcExportar(formato) {
  _rcLeer();
  const doc = reporteCostosDoc(_rcProds(), _rcListas(), _rc.f, formato);
  if (typeof exportarDoc === 'function' && exportarDoc(doc, formato)) cerrarExportarCostos();
}
