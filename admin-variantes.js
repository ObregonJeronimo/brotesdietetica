/* =============================================================================
   VARIANTES  —  Brotes Dietética
   =============================================================================
   Un producto que viene en presentaciones (maní x 80 g, x 160 g; alfajor x1, x12)
   o en escalas de granel (yerba 1 kg, 3 kg, 5 kg) se muestra como UNO SOLO: una
   línea al vender, una tarjeta en la tienda. Pedido del comercio (24/09/2026).

   ESTA ES LA ETAPA 1 DE 4:
     1. agrupar, elegir la variante a mano, sugerir otra presentación si falta stock
     2. escalas de granel: el precio según la cantidad y el aviso de mezcla de stock
     3. cajas cerradas a precio mayorista
     4. migrar lo que ya existe -al final, con datos de la clienta-
   Los productos que ya existen NO se agrupan solos: eso es la etapa 4.

   CADA VARIANTE ES UN PRODUCTO POR DENTRO, con su código, su etiqueta, su stock, su
   costo y su proveedor. Por eso la venta, las compras, el lector, las etiquetas, el
   aviso de costos viejos, depuración y proveedores siguen andando sin tocarlos. Lo
   nuevo es solamente el agrupamiento.

   EL ENLACE ES EL DE LOS "GRAMAJES" QUE YA EXISTÍA: la variante tiene gramajePadreId
   apuntando al producto principal, y en gramaje su etiqueta ("160 g", "3 kg"). La
   tienda ya juntaba eso en una sola tarjeta. El principal también es una variante:
   la primera, con su propia etiqueta.
   ============================================================================= */

const _VAR_NL = String.fromCharCode(10);
const _varProds = () => (typeof allProducts !== 'undefined' && Array.isArray(allProducts) ? allProducts : []);
const _varEsc = s => (typeof esc === 'function' ? esc(String(s == null ? '' : s)) : String(s == null ? '' : s));
const _varAttr = s => (typeof _attrHtml === 'function' ? _attrHtml(s) : String(s == null ? '' : s).replace(/"/g, '&quot;'));

/* Cuánto trae una variante, leído de su etiqueta y si no de su nombre: { valor, unidad }
   con unidad 'g' (los kg se pasan a gramos), 'ml' (los litros y cc a ml) o 'u'. */
function contenidoDeVariante(p) {
  const textos = [p && p.gramaje, p && p.nombre];
  for (const t of textos) {
    const s = String(t || '').toLowerCase().replace(/(\d),(\d)/g, '$1.$2');
    let m;
    if ((m = s.match(/(\d+(?:\.\d+)?)\s*(kg|kgs|kilo|kilos)\b/))) return { valor: Math.round(parseFloat(m[1]) * 1000), unidad: 'g' };
    if ((m = s.match(/(\d+(?:\.\d+)?)\s*(g|gr|grs|gramos?)\b/))) return { valor: Math.round(parseFloat(m[1])), unidad: 'g' };
    if ((m = s.match(/(\d+(?:\.\d+)?)\s*(l|lt|lts|litros?)\b/))) return { valor: Math.round(parseFloat(m[1]) * 1000), unidad: 'ml' };
    if ((m = s.match(/(\d+(?:\.\d+)?)\s*(ml|cc)\b/))) return { valor: Math.round(parseFloat(m[1])), unidad: 'ml' };
    if ((m = s.match(/(\d+)\s*(u|un|unid|unidades)\b/))) return { valor: parseInt(m[1], 10), unidad: 'u' };
    /* "x12", "x 6": un pack. Va último: "x 80 g" ya salió como gramos. */
    if ((m = s.match(/(?:^|\s)x\s*(\d+)\b/))) return { valor: parseInt(m[1], 10), unidad: 'u' };
  }
  return null;
}

/* El nombre sin el tamaño: "Maní x 80 g" -> "Maní", "Alfajor x12" -> "Alfajor". */
function baseDeNombre(nombre) {
  return String(nombre || '')
    .replace(/\s*[-·]?\s*\bx?\s*\d+(?:[.,]\d+)?\s*(kg|kgs|kilos?|g|gr|grs|gramos?|l|lt|lts|litros?|ml|cc|u|un|unid|unidades)\b\.?/gi, ' ')
    .replace(/(^|\s)x\s*\d+\b/gi, ' ')
    .replace(/\s+/g, ' ').trim();
}

function principalDeVariante(p, productos) {
  if (!p) return null;
  if (!p.gramajePadreId) return p;
  return (productos || []).find(x => x && x.id === p.gramajePadreId) || p;
}

/* Primero las que se venden por unidad, después las de granel; cada grupo de menor a
   mayor, y las que no dicen cuánto traen al final. */
function _ordenVariantes(a, b) {
  const tam = v => { const c = contenidoDeVariante(v); return c ? c.valor : Infinity; };
  const ta = tam(a), tb = tam(b);
  return ((a.tipoVenta === 'peso') - (b.tipoVenta === 'peso')) || (ta === tb ? 0 : (ta < tb ? -1 : 1)) ||
    String(a.nombre || '').localeCompare(String(b.nombre || ''));
}

/* El principal y sus variantes, sin depurados; sin ocultos salvo que se pidan. */
function variantesDeGrupo(principal, productos, opts) {
  if (!principal) return [];
  const o = opts || {};
  const todos = [principal].concat((productos || []).filter(x => x && x.gramajePadreId === principal.id && x.id !== principal.id));
  return todos
    .filter(v => v && v.depurado !== true && (o.conOcultos || v.oculto !== true))
    .sort(_ordenVariantes);
}

function tieneVariantes(p, productos) {
  return !!(p && (p.gramajePadreId || (productos || []).some(x => x && x.gramajePadreId === p.id)));
}

function nombreDeGrupo(principal) {
  if (!principal) return '';
  return principal.nombreMostrado || baseDeNombre(principal.nombre) || principal.nombre || '';
}

function etiquetaVariante(v) {
  if (!v) return '';
  if (v.gramaje) return v.gramaje;
  const c = contenidoDeVariante(v);
  if (!c) return v.nombreMostrado || v.nombre || '';
  if (c.unidad === 'g') return c.valor >= 1000 ? (c.valor / 1000).toLocaleString('es-AR') + ' kg' : c.valor + ' g';
  if (c.unidad === 'ml') return c.valor >= 1000 ? (c.valor / 1000).toLocaleString('es-AR') + ' l' : c.valor + ' ml';
  return 'x' + c.valor;
}

function precioDeVentaVariante(v, ctx) {
  if (!v) return 0;
  return Number(ctx === 'may' ? (v.precioMayorista || v.precio || 0) : (v.precio || 0));
}

function _varStockTxt(v) {
  const n = Number(v.stock || 0);
  if (n <= 0) return 'SIN STOCK';
  if (v.tipoVenta === 'peso') return (typeof fmtPeso === 'function') ? fmtPeso(n) : (n / 1000).toLocaleString('es-AR') + ' kg';
  return 'Stock ' + n.toLocaleString('es-AR');
}

/* ------------------------------------------------------------- AL VENDER
   Los resultados del buscador de la venta: dos o más variantes del mismo producto se
   juntan en UNA fila. Una sola que coincida -buscando "160"- se muestra como siempre. */
function agruparVariantesVenta(lista, productos) {
  if (!Array.isArray(lista) || lista.length < 2) return lista;
  const prods = productos || _varProds();
  const cuantas = new Map();
  lista.forEach(p => {
    if (!p || p.__grupo) return;
    const pr = principalDeVariante(p, prods);
    if (pr && tieneVariantes(pr, prods)) cuantas.set(pr.id, (cuantas.get(pr.id) || 0) + 1);
  });
  const vistos = new Set();
  const out = [];
  lista.forEach(p => {
    if (!p) return;
    const pr = principalDeVariante(p, prods);
    if (!pr || !(cuantas.get(pr.id) >= 2)) { out.push(p); return; }
    if (vistos.has(pr.id)) return;
    vistos.add(pr.id);
    out.push({ __grupo: pr, variantes: variantesDeGrupo(pr, prods) });
  });
  return out;
}

function _filaGrupoVenta(g, ctx) {
  const pr = g.__grupo;
  const vs = g.variantes || [];
  const img = '<div class="vprod-img-ph"><i class="bi bi-box"></i>' +
    (pr.imagen ? '<img class="vprod-img" src="' + _varAttr(pr.imagen) + '" alt="" loading="lazy" onerror="this.remove()">' : '') + '</div>';
  const chips = vs.slice(0, 5).map(v => '<span class="vprod-chip neutro">' + _varEsc(etiquetaVariante(v)) + '</span>').join('') +
    (vs.length > 5 ? '<span class="vprod-chip neutro">+' + (vs.length - 5) + '</span>' : '');
  /* "Desde" solo si todas se cobran igual: mezclar precios por kilo con precios por
     unidad daría un "desde" que no significa nada. */
  const pesos = vs.filter(v => v.tipoVenta === 'peso'), unis = vs.filter(v => v.tipoVenta !== 'peso');
  const base = (pesos.length && !unis.length) ? pesos : (unis.length && !pesos.length) ? unis : [];
  const precios = base.map(v => precioDeVentaVariante(v, ctx)).filter(n => n > 0);
  const desde = precios.length
    ? '<div class="vprod-precio-alt">desde</div><div class="vprod-precio">$' + Math.min.apply(null, precios).toLocaleString('es-AR') +
      (pesos.length ? '<span style="font-size:0.68rem;color:var(--text-dim)">/kg</span>' : '') + '</div>'
    : '<div class="vprod-precio-alt">elegí</div>';
  return '<div class="vprod-row vprod-grupo" onclick="abrirVariantesVenta(\'' + _varAttr(pr.id) + '\',\'' + (ctx === 'may' ? 'may' : 'min') + '\')" title="Elegir la presentación">' +
    img +
    '<div style="min-width:0"><div class="vprod-nom">' + _varEsc(nombreDeGrupo(pr)) + '</div>' +
      '<div class="vprod-sub"><span class="vprod-chip ok">' + vs.length + ' variantes</span>' + chips + '</div></div>' +
    '<div class="vprod-precios">' + desde + '</div>' +
  '</div>';
}

/* El selector: una opción por variante, con su precio y su stock. */
function abrirVariantesVenta(principalId, ctx) {
  cerrarVariantesVenta();
  const prods = _varProds();
  const pr = prods.find(x => x && x.id === principalId);
  if (!pr) return;
  const vs = variantesDeGrupo(pr, prods);
  const may = ctx === 'may';
  const ov = document.createElement('div');
  /* dlg-overlay: así el Escape de admin-atajos.js no cierra la venta de atrás. */
  ov.className = 'dlg-overlay';
  ov.id = 'variantesVenta';
  ov.style.zIndex = String(400 + (typeof _dlgAbiertos === 'number' ? _dlgAbiertos : 0));
  ov.innerHTML =
    '<div class="dlg-box var-box" role="dialog" aria-modal="true" aria-labelledby="varTit">' +
      '<div class="dlg-cab"><span class="dlg-ico"><i class="bi bi-stack"></i></span>' +
        '<h3 id="varTit">' + _varEsc(nombreDeGrupo(pr)) + '</h3></div>' +
      '<div class="dlg-msg"><p class="dlg-linea">Elegí la presentación:</p>' +
        vs.map(v => {
          const sin = Number(v.stock || 0) <= 0;
          return '<button type="button" class="var-op' + (sin ? ' sin-stock' : '') + '" data-id="' + _varAttr(v.id) + '">' +
            '<span class="var-etq">' + _varEsc(etiquetaVariante(v)) + '</span>' +
            '<span class="var-precio">$' + precioDeVentaVariante(v, ctx).toLocaleString('es-AR') + (v.tipoVenta === 'peso' ? ' el kilo' : '') + '</span>' +
            '<span class="var-stock">' + _varStockTxt(v) + '</span></button>';
        }).join('') +
      '</div>' +
      '<div class="dlg-pie"><button type="button" class="btn btn-secondary" id="varVolver">Volver</button></div>' +
    '</div>';
  document.body.appendChild(ov);
  if (typeof _dlgAbiertos === 'number') _dlgAbiertos++;
  ov.querySelectorAll('.var-op').forEach(b => b.addEventListener('click', () => {
    const id = b.getAttribute('data-id');
    cerrarVariantesVenta();
    if (typeof _agregarItemVenta === 'function') _agregarItemVenta(id, may ? 'may' : 'min');
  }));
  ov.querySelector('#varVolver').addEventListener('click', cerrarVariantesVenta);
  ov.addEventListener('mousedown', e => { if (e.target === ov) cerrarVariantesVenta(); });
  document.addEventListener('keydown', _varTecla, true);
  setTimeout(() => { const b = ov.querySelector('.var-op:not(.sin-stock)') || ov.querySelector('.var-op'); if (b) b.focus(); }, 30);
}

function _varTecla(e) {
  if (e.key === 'Escape' && document.getElementById('variantesVenta')) {
    e.preventDefault(); e.stopPropagation(); cerrarVariantesVenta();
  }
}

function cerrarVariantesVenta() {
  const ov = document.getElementById('variantesVenta');
  if (ov) {
    ov.remove();
    if (typeof _dlgAbiertos === 'number') _dlgAbiertos = Math.max(0, _dlgAbiertos - 1);
  }
  document.removeEventListener('keydown', _varTecla, true);
}

/* Si a una presentación le falta stock, la del mismo producto que la cubre: la más
   grande que entre justa. 160 g sin stock y 80 g con 2 o más -> 2 de 80 g. Cuenta lo
   que ya está en la venta. Solo entre las que se venden por unidad y en la misma
   medida (gramos con gramos, unidades con unidades). */
function sugerenciaPresentacion(p, enVenta, productos) {
  const prods = productos || _varProds();
  if (!p || p.tipoVenta === 'peso' || !tieneVariantes(p, prods)) return null;
  const c = contenidoDeVariante(p);
  if (!c) return null;
  const ya = enVenta || {};
  if (Number(p.stock || 0) >= (ya[p.id] || 0) + 1) return null;
  const pr = principalDeVariante(p, prods);
  const opciones = variantesDeGrupo(pr, prods)
    .filter(v => v.id !== p.id && v.tipoVenta !== 'peso')
    .map(v => ({ v: v, c: contenidoDeVariante(v) }))
    .filter(x => x.c && x.c.unidad === c.unidad && x.c.valor < c.valor && c.valor % x.c.valor === 0)
    .map(x => ({ variante: x.v, cantidad: c.valor / x.c.valor }))
    .filter(x => Number(x.variante.stock || 0) - (ya[x.variante.id] || 0) >= x.cantidad)
    .sort((a, b) => a.cantidad - b.cantidad);
  return opciones[0] || null;
}

/* Lo que ve el que cobra. Devuelve 'seguir' (agregar la pedida como siempre), 'hecho'
   (se agregó la otra) o 'cancelar' (cerró el aviso sin elegir: no se agrega nada). */
async function sugerirPresentacion(p, lista, ctx) {
  const enVenta = {};
  (lista || []).forEach(it => { if (it && it.id) enVenta[it.id] = (enVenta[it.id] || 0) + Number(it.cantidad || 0); });
  const s = sugerenciaPresentacion(p, enVenta, _varProds());
  if (!s || typeof pedirOpcion !== 'function') return 'seguir';
  const may = ctx === 'may';
  const orig = may ? (typeof _origAddVentaMayItem === 'function' ? _origAddVentaMayItem : null)
                   : (typeof _origAddVentaItem === 'function' ? _origAddVentaItem : null);
  if (!orig) return 'seguir';
  const quedan = Math.max(0, Number(p.stock || 0) - (enVenta[p.id] || 0));
  const pu = precioDeVentaVariante(s.variante, ctx);
  const msg = 'No hay stock de ' + (p.nombreMostrado || p.nombre) + (quedan ? ' (quedan ' + quedan + ').' : '.') + _VAR_NL + _VAR_NL +
    '¿Agregar ' + s.cantidad + ' de ' + etiquetaVariante(s.variante) + ' en su lugar? Cada una a su precio: $' +
    pu.toLocaleString('es-AR') + ', en total $' + (pu * s.cantidad).toLocaleString('es-AR') + '.';
  const r = await pedirOpcion(msg, {
    titulo: 'Otra presentación',
    icono: 'bi-stack',
    opciones: [
      { valor: 'otra', texto: 'Agregar ' + s.cantidad + ' de ' + etiquetaVariante(s.variante), principal: true },
      { valor: 'igual', texto: 'Agregar la de ' + etiquetaVariante(p) + ' igual' },
    ],
  });
  if (r === 'igual') return 'seguir';
  if (r !== 'otra') return 'cancelar';
  for (let i = 0; i < s.cantidad; i++) orig(s.variante.id);
  return 'hecho';
}

/* ------------------------------------------------------ EN EL FORMULARIO */
function pintarVariantesForm(p) {
  const el = document.getElementById('pVariantes');
  if (!el) return;
  const prods = _varProds();
  const titulo = '<div class="var-titulo"><i class="bi bi-stack"></i> Variantes</div>';
  if (window._varianteDeNueva) {
    const pr = prods.find(x => x && x.id === window._varianteDeNueva);
    el.innerHTML = titulo + '<p class="var-ayuda">Nueva variante de <b>' + _varEsc(nombreDeGrupo(pr)) + '</b>. ' +
      'Poné arriba, en <b>Gramaje / Presentación</b>, lo que la distingue: 160 g, 3 kg, x12.</p>';
    return;
  }
  if (!p) {
    el.innerHTML = titulo + '<p class="var-ayuda">¿Viene en otras presentaciones (80 g, 160 g) o en otros bultos (1 kg, 3 kg)? ' +
      'Guardalo, y después le agregás las variantes desde acá.</p>';
    return;
  }
  const pr = principalDeVariante(p, prods);
  const vs = variantesDeGrupo(pr, prods, { conOcultos: true });
  const esHijo = !!p.gramajePadreId;
  let h = titulo;
  if (esHijo) {
    h += '<p class="var-ayuda">Es una variante de <b>' + _varEsc(nombreDeGrupo(pr)) + '</b>. ' +
      '<button type="button" class="btn btn-secondary btn-sm" onclick="closeModal();openModal(\'' + _varAttr(pr.id) + '\')">Ir al producto principal</button></p>';
  }
  /* El principal también es una opción, y su etiqueta es la de su botón en la tienda.
     Sin gramaje y sin tamaño en el nombre, no habría cómo distinguirlo de las otras. */
  if (vs.length > 1 && !pr.gramaje && !contenidoDeVariante(pr)) {
    h += '<p class="var-ayuda var-falta"><i class="bi bi-exclamation-triangle"></i> ' +
      (esHijo ? 'Al principal le falta' : 'A este le falta') + ' su presentación: ponela en <b>Gramaje / Presentación</b> (80 g, 1 kg, x6).</p>';
  }
  if (vs.length > 1) {
    h += '<div class="var-lista">' + vs.map(v =>
      '<div class="var-fila' + (v.id === p.id ? ' actual' : '') + '">' +
        '<span class="var-etq">' + _varEsc(etiquetaVariante(v)) + '</span>' +
        '<span class="var-nom">' + _varEsc(v.nombre) + (v.oculto === true ? ' · oculto' : '') + '</span>' +
        '<span class="var-precio">$' + Number(v.precio || 0).toLocaleString('es-AR') + (v.tipoVenta === 'peso' ? '/kg' : '') + '</span>' +
        '<span class="var-stock">' + _varStockTxt(v) + '</span>' +
        (v.id === p.id ? '<span class="var-este">este</span>'
          : '<button type="button" class="btn btn-secondary btn-sm" onclick="closeModal();openModal(\'' + _varAttr(v.id) + '\')">Abrir</button>') +
      '</div>').join('') + '</div>';
  } else {
    h += '<p class="var-ayuda">Todavía no tiene variantes.</p>';
  }
  /* También desde una variante: la nueva queda colgada del mismo principal. */
  h += '<button type="button" class="btn btn-secondary btn-sm var-nueva" onclick="nuevaVariante(\'' + _varAttr(pr.id) + '\')">' +
    '<i class="bi bi-plus-lg"></i> Nueva variante</button>';
  el.innerHTML = h;
}

/* Abre el formulario para crear una variante: un producto nuevo, enganchado al
   principal, con lo que comparten ya cargado. Costo, stock y código son suyos. */
function nuevaVariante(principalId) {
  const prods = _varProds();
  const pr = prods.find(x => x && x.id === principalId);
  if (!pr) return;
  if (typeof closeModal === 'function') closeModal();
  openModal();
  window._varianteDeNueva = pr.id;
  window._varianteNombreBase = baseDeNombre(pr.nombre) || pr.nombre || '';
  const set = (id, v) => { const e = document.getElementById(id); if (e && v != null) e.value = v; };
  set('pNombre', window._varianteNombreBase);
  set('pDescripcion', pr.descripcion || '');
  set('pPorcentaje', pr.porcentaje || 0);
  set('pPorcentajeMay', pr.porcentajeMayorista || 0);
  if (typeof updateCatSelects === 'function') updateCatSelects();
  set('pCategoria', pr.categoria || '');
  if (typeof updateSubcatSelect === 'function') updateSubcatSelect();
  set('pSubcategoria', pr.subcategoria || '');
  if (typeof updateListaSelect === 'function') updateListaSelect(pr.lista || ''); else set('pLista', pr.lista || '');
  if (typeof setTipoVenta === 'function') setTipoVenta(pr.tipoVenta === 'peso' ? 'peso' : 'unidad');
  if (typeof calcPrecioModal === 'function') calcPrecioModal();
  const t = document.getElementById('modalTitle');
  if (t) t.textContent = 'Nueva variante';
  pintarVariantesForm(null);
  setTimeout(() => { const g = document.getElementById('pGramaje'); if (g) g.focus(); }, 60);
}

/* Se envuelve openModal en vez de tocarlo por dentro: es una sola línea de casi 2000
   caracteres (ver _origOpenModal en admin.html). Al abrir el formulario se olvida la
   variante que se estaba por crear -nuevaVariante la marca DESPUÉS de abrirlo- y se
   pinta la sección con las del producto. */
if (typeof openModal === 'function') {
  const _varOpenModal = openModal;
  openModal = function (id) {
    window._varianteDeNueva = null;
    window._varianteNombreBase = null;
    const r = _varOpenModal.apply(this, arguments);
    pintarVariantesForm(id ? (_varProds().find(x => x && x.id === id) || null) : null);
    return r;
  };
}

/* ---------------------------------------------------------- AL GUARDAR
   saveProduct llama a las dos: la primera antes de guardar nada, la segunda al armar
   los datos de un producto NUEVO. */

/* Una variante sin su presentación no se distinguiría de las otras en la venta ni en
   la tienda. */
function faltaPresentacionDeVariante() {
  if (!window._varianteDeNueva) return false;
  const g = document.getElementById('pGramaje');
  if (g && g.value.trim()) return false;
  if (typeof showAdminToast === 'function') showAdminToast('Poné la presentación de la variante: 160 g, 3 kg, x12...', 'error');
  if (g) g.focus();
  return true;
}

/* El enlace con el principal. Si se dejó el nombre que se precargó, se le suma la
   presentación: dos productos con el mismo nombre se confunden en todos lados. */
function datosDeVarianteNueva(data) {
  const padre = window._varianteDeNueva;
  if (!padre || !data) return data;
  data.gramajePadreId = padre;
  const base = window._varianteNombreBase;
  if (base && data.nombre === base && data.gramaje) data.nombre = base + ' x ' + data.gramaje;
  return data;
}

/* ----------------------------------------------------------- AL BORRAR
   Si se borra un producto que tiene variantes, las que quedan siguen juntas: la
   primera pasa a ser la principal. Si queda una sola, queda como producto suelto.
   Antes quedaban enganchadas a un producto que ya no existe: la tienda las escondía
   -a las variantes se las esconde porque salen como botones del principal- y en el
   panel no había forma de verlo. */
function avisoVariantesAlBorrar(id) {
  const hijas = _varProds().filter(x => x && x.gramajePadreId === id);
  if (!hijas.length) return '';
  return _VAR_NL + _VAR_NL + (hijas.length === 1
    ? 'Tiene 1 variante: queda como producto suelto.'
    : 'Tiene ' + hijas.length + ' variantes: siguen juntas, y la primera pasa a ser la principal.');
}

async function reengancharVariantesAlBorrar(id) {
  const hijas = _varProds().filter(x => x && x.gramajePadreId === id);
  if (!hijas.length) return null;
  const orden = hijas.slice().sort(_ordenVariantes);
  /* La nueva principal: la primera que se vende de verdad, si hay alguna. */
  const nueva = orden.find(v => v.depurado !== true && v.oculto !== true) ||
    orden.find(v => v.depurado !== true) || orden[0];
  const FV = firebase.firestore.FieldValue;
  const batch = db.batch();
  hijas.forEach(v => batch.update(db.collection('productos').doc(v.id),
    v.id === nueva.id ? { gramajePadreId: FV.delete() } : { gramajePadreId: nueva.id }));
  await batch.commit();
  hijas.forEach(v => { if (v.id === nueva.id) delete v.gramajePadreId; else v.gramajePadreId = nueva.id; });
  if (typeof showAdminToast === 'function') {
    showAdminToast(hijas.length === 1
      ? '"' + nueva.nombre + '" quedó como producto suelto'
      : 'Las variantes siguen juntas: ahora la principal es "' + nueva.nombre + '"', 'info');
  }
  return { principal: nueva, cuantas: hijas.length };
}
