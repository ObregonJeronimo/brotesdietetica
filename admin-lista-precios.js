/* ==========================================================================
   LA LISTA DE PRECIOS EN PDF, CON FILTROS  —  Brotes Dietética
   ==========================================================================
   Pedido de la clienta (18/11/2026, por audio): "quiero exportar una lista de los
   productos que vendemos, en este caso las tartas", y aunque elegía la categoría
   en Productos le salía la lista completa. Era así: "Exportar PDF" (precios al
   público) y "Exportar PDF M" (mayorista) armaban el PDF con TODO lo visible,
   sin mirar ningún filtro (los de la tabla de Productos solo cambian lo que se
   ve en pantalla). En el Historial: "Exportacion PDF catalogo: 697 productos".

   Ahora los dos botones abren primero esta ventana: categoría, subcategoría,
   proveedor y nombre (el mismo filtro que el reporte de costos,
   reporteCostosFiltrar: el nombre sin tildes ni mayúsculas, palabra por palabra),
   arrancando con los filtros que tiene puesta la tabla de Productos. Dice cuántos
   van a salir y muestra los primeros, con el precio que va a llevar el PDF. Con
   todo en "Todas" sale la lista de siempre.

   El PDF lo sigue armando exportCatalogoPDF (admin.html), igual que antes: solo
   recibe qué productos van y un título con el filtro ("Viandas y comidas listas ·
   tarta"). Van solo los visibles con precio, como siempre; en la mayorista, los
   que dejan ganancia (exportMayoristaPDF avisa cuáles quedan afuera).
   ========================================================================== */

const _lp = { may: false, f: { cat: '', sub: '', lista: '', q: '' } };
const _LP_VISTA_MAX = 100;

/* El precio que lleva el PDF, con la MISMA cuenta que exportCatalogoPDF y exportMayoristaPDF:
   al público, el de mostrador (una caja cerrada al mayorista) con su oferta; en la mayorista,
   el mayorista, y 0 si no deja ganancia (no va en la lista). */
function listaPreciosPrecio(p, may) {
  if (!p) return 0;
  if (may) {
    const pm = Number(p.precioMayorista || 0);
    if (!(pm > 0)) return 0;
    if (typeof _mayoristaSinGanancia === 'function' && _mayoristaSinGanancia(pm, p.costo)) return 0;
    return pm;
  }
  const base = typeof precioMostradorDe === 'function' ? precioMostradorDe(p) : Number(p.precio || 0);
  const d = Number(p.descuento || 0);
  return d > 0 && d < 100 ? Math.round(base * (1 - d / 100)) : base;
}

/* Los que van en el PDF: visibles, con nombre y precio, y con los filtros. */
function listaPreciosProductos(prods, f, may) {
  return reporteCostosFiltrar(prods, Object.assign({}, f || {}, { vis: 'visibles' }))
    .filter(p => p.nombre && listaPreciosPrecio(p, may) > 0);
}

/* El filtro en palabras, para el título del PDF, el aviso y el Historial. Vacío si no hay
   ninguno (la lista de siempre). */
function listaPreciosTitulo(f, listas) {
  const o = f || {};
  const partes = [];
  if (o.cat) partes.push(o.cat + (o.sub ? ' > ' + o.sub : ''));
  if (o.lista) {
    const l = (listas || []).find(x => x.id === o.lista);
    partes.push(l ? (l.nombre || '') : '');
  }
  if (String(o.q || '').trim()) partes.push('"' + String(o.q).trim() + '"');
  const t = partes.filter(Boolean).join(' · ');
  return t.length > 60 ? t.slice(0, 59) + '…' : t;
}

function _lpPesos(n) { return '$' + Math.round(Number(n) || 0).toLocaleString('es-AR'); }

/* ============================ PANTALLA ============================ */

/* Los botones "Exportar PDF" (may = false) y "Exportar PDF M" (may = true). */
function abrirListaPrecios(may) {
  _lp.may = !!may;
  /* Arranca con los filtros que tiene puestos la tabla de Productos: lo que se ve. */
  _lp.f = { cat: _rcVal('filterCat'), sub: '', lista: _rcVal('filterLista'), q: _rcVal('searchInput') };
  const m = document.getElementById('listaPreciosModal');
  if (!m) return;
  const f = _lp.f;
  const cats = _rcCategorias();
  if (f.cat && cats.indexOf(f.cat) < 0) f.cat = '';
  const listas = _rcListas().slice().sort((a, b) => _rcCmp(a.nombre, b.nombre));
  if (f.lista && !listas.some(l => l.id === f.lista)) f.lista = '';
  m.innerHTML = '<div class="modal-box rc-box"><div class="modal-header rc-cab">' +
    '<h3><span class="rc-cab-ico"><i class="bi bi-' + (_lp.may ? 'shop' : 'people') + '"></i></span> ' +
      (_lp.may ? 'Lista de precios mayorista' : 'Lista de precios para clientes') + '</h3>' +
    '<button class="modal-close" onclick="cerrarListaPrecios()"><i class="bi bi-x-lg"></i></button></div>' +
    '<div class="rc-cuerpo">' +
    '<p class="rc-ayuda">Elegí qué productos van en el PDF. Por ejemplo, para mandar solo las tartas: la categoría y "tarta" en el nombre. ' +
      'Con todo en "Todas" sale la lista completa. Van los productos visibles que tienen precio' + (_lp.may ? ' mayorista' : '') + '.</p>' +
    '<div class="rc-filtros">' +
    _rcCampo('lpCat', 'bi-tags', 'Categoría', '<select id="lpCat" class="form-input" onchange="lpCambioCat()">' +
      _rcOpciones([['', 'Todas']].concat(cats.map(c => [c, c])), f.cat) + '</select>') +
    _rcCampo('lpSub', 'bi-diagram-3', 'Subcategoría', '<select id="lpSub" class="form-input" onchange="lpContar()"' + (f.cat ? '' : ' disabled') + '>' +
      _rcSubsHtml(f.cat, f.sub) + '</select>') +
    _rcCampo('lpLista', 'bi-truck', 'Proveedor', '<select id="lpLista" class="form-input" onchange="lpContar()">' +
      _rcOpciones([['', 'Todos']].concat(listas.map(l => [l.id, l.nombre || ''])), f.lista) + '</select>') +
    _rcCampo('lpQ', 'bi-search', 'Nombre', '<input id="lpQ" class="form-input" type="text" placeholder="Ej: tarta" value="' +
      _rcEsc(f.q) + '" oninput="lpContar()" autocomplete="off">') +
    '</div>' +
    '<div class="rc-vista" id="lpVista"></div>' +
    '<div class="rc-pie"><button class="btn btn-secondary" onclick="cerrarListaPrecios()">Cancelar</button>' +
    '<span class="rc-pie-der"><button class="btn btn-primary" id="lpPdf" onclick="listaPreciosBajar()"><i class="bi bi-file-earmark-pdf"></i> Bajar en PDF</button></span></div>' +
    '</div></div>';
  m.classList.add('show');
  lpContar();
}
function cerrarListaPrecios() {
  const m = document.getElementById('listaPreciosModal');
  if (m) m.classList.remove('show');
}

function _lpLeer() {
  if (!document.getElementById('lpCat')) return;
  _lp.f = { cat: _rcVal('lpCat'), sub: _rcVal('lpSub'), lista: _rcVal('lpLista'), q: _rcVal('lpQ') };
  if (!_lp.f.cat) _lp.f.sub = '';
}

function lpCambioCat() {
  const cat = _rcVal('lpCat');
  const s = document.getElementById('lpSub');
  if (s) { s.innerHTML = _rcSubsHtml(cat, ''); s.value = ''; s.disabled = !cat; }
  lpContar();
}

/* Lo que va a salir: los primeros 100 por nombre, con el precio del PDF, y el total. */
function lpContar() {
  _lpLeer();
  const van = listaPreciosProductos(_rcProds(), _lp.f, _lp.may).slice().sort((a, b) => _rcCmp(a.nombre, b.nombre));
  const c = document.getElementById('lpVista');
  const b = document.getElementById('lpPdf');
  if (b) b.disabled = !van.length;
  if (!c) return;
  if (!van.length) { c.innerHTML = '<div class="rc-vacio"><i class="bi bi-inbox"></i> No hay productos visibles con precio con estos filtros.</div>'; return; }
  const filas = van.slice(0, _LP_VISTA_MAX);
  const resto = van.length - filas.length;
  const prods = n => n + (n === 1 ? ' producto' : ' productos');
  const titulo = listaPreciosTitulo(_lp.f, _rcListas());
  c.innerHTML = '<div class="rc-vista-cab"><span class="rc-vista-tit"><i class="bi bi-list-ul"></i> Lo que va a salir</span>' +
    '<span class="rc-vista-nota">' + (titulo ? 'Lista filtrada: ' + _rcEsc(titulo) : 'Lista completa') + '</span></div>' +
    '<div class="rc-tabla-caja"><table class="rc-tabla"><colgroup><col class="lp-c-prod"><col class="lp-c-precio"></colgroup>' +
    '<thead><tr><th>Producto</th><th class="rc-der">Precio' + (_lp.may ? ' mayorista' : '') + '</th></tr></thead><tbody>' +
    filas.map(p => '<tr><td title="' + _rcEsc(p.nombre) + '">' + _rcEsc(p.nombre) + '</td><td class="rc-der">' +
      _lpPesos(listaPreciosPrecio(p, _lp.may)) + (p.tipoVenta === 'peso' ? ' el kilo' : '') + '</td></tr>').join('') +
    (resto ? '<tr class="rc-fila-mas"><td colspan="2"><i class="bi bi-plus-circle"></i> Y ' + prods(resto) +
      ' más, que no se ' + (resto === 1 ? 'muestra' : 'muestran') + ' acá pero ' + (resto === 1 ? 'sale' : 'salen') + ' en el PDF</td></tr>' : '') +
    '</tbody></table></div>' +
    '<div class="rc-total"><span class="rc-total-txt">' + (resto ? '' : 'Se ven todos en la lista') + '</span>' +
    '<span class="rc-pill rc-pill-total">TOTAL: ' + prods(van.length) + '</span></div>';
}

function listaPreciosBajar() {
  _lpLeer();
  const van = listaPreciosProductos(_rcProds(), _lp.f, _lp.may);
  if (!van.length) return;
  /* Sin ningún filtro, la lista de siempre: sin ids, como antes. */
  const hay = !!(_lp.f.cat || _lp.f.lista || String(_lp.f.q || '').trim());
  const filtro = hay ? { ids: new Set(van.map(p => p.id)), titulo: listaPreciosTitulo(_lp.f, _rcListas()) } : null;
  cerrarListaPrecios();
  if (_lp.may) exportMayoristaPDF(filtro);
  else exportCatalogoPDF(null, false, filtro);
}

if (typeof window !== 'undefined') {
  window.abrirListaPrecios = abrirListaPrecios;
  window.cerrarListaPrecios = cerrarListaPrecios;
  window.lpCambioCat = lpCambioCat;
  window.lpContar = lpContar;
  window.listaPreciosBajar = listaPreciosBajar;
  window.listaPreciosProductos = listaPreciosProductos;
  window.listaPreciosPrecio = listaPreciosPrecio;
  window.listaPreciosTitulo = listaPreciosTitulo;
}
