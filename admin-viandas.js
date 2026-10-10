/* =============================================================================
   VIANDAS  —  Brotes Dietética
   =============================================================================
   Pedido de la clienta (10/10/2026): las viandas (los platos de la cocina) se
   cobran por una CAJA APARTE, con su propia plata, que nunca se junta con la del
   local. Esto es lo de las ventas; la caja en sí está en admin-caja.js (CAJAS).

   QUÉ ES UNA VIANDA: un producto cuyo proveedor está marcado como "la cocina"
   (`listas/{id}.cocina === true`, se tilda en la ficha del proveedor). Por
   proveedor y no por categoría: en "Viandas y comidas listas" también hay
   productos de marcas que se compran hechos (Sojitas, Manjar...), y un plato de
   la cocina sin categoría igual tiene su proveedor.

   CÓMO SE SEPARAN: las ventas de viandas se guardan en `ventas`, como las
   minoristas, con `cajaTipo: 'viandas'` y el id de la caja de viandas. Así el
   ticket, la factura, editar, borrar, el stock y el fiado del cliente siguen
   andando igual; lo que cambia es a qué caja va la plata y en qué lista se ven
   (Ventas → Viandas). Las ventas viejas no tienen `cajaTipo`: son del local.

   QUE NO SE MEZCLEN: en la venta de viandas solo entran viandas, y en la
   minorista y la mayorista ninguna vianda. Tres frenos: el buscador muestra solo
   lo que corresponde (_filtroVentaCtx), agregar frena (ventaTipoPermite, en
   _agregarItemVenta) y guardar controla todo de nuevo (viandasControlVenta), porque
   hay caminos que cargan productos sin pasar por _agregarItemVenta (otra
   presentación sugerida, las bolsas de granel, editar, los pedidos web).
   ============================================================================= */

/* Los proveedores marcados como la cocina. Se arma en cada consulta: son unos pocos
   proveedores, y así una marca recién cambiada vale al instante. */
function _cocinasIds() {
  const ls = (typeof listasData !== 'undefined' && Array.isArray(listasData)) ? listasData : [];
  return new Set(ls.filter(l => l && l.cocina === true).map(l => l.id));
}
function hayCocina() { return _cocinasIds().size > 0; }

function esVianda(p, cocinas) {
  if (!p || !p.lista) return false;
  return (cocinas || _cocinasIds()).has(p.lista);
}
/* Por id (los renglones de una venta o de un pedido guardan el id del producto). Un
   producto que ya no está en el catálogo no es vianda: va a la caja del local, como
   todo lo que había antes de que existiera la de viandas. */
function esViandaId(id, cocinas) {
  const p = (typeof allProducts !== 'undefined' && Array.isArray(allProducts)) ? allProducts.find(x => x && x.id === id) : null;
  return esVianda(p, cocinas);
}

/* La venta abierta en el modal minorista, ¿es de viandas? La bandera se pone en el
   que abre (abrirVentaViandas, editar una venta de viandas, un pedido de viandas) y se
   borra en openVentaModal y closeVentaModal: Escape cierra el modal sin pasar por
   closeVentaModal, así que la que manda es la de openVentaModal. */
const enVentaViandas = () => window._ventaViandas === true;

/* Lo que el buscador de la venta deja ver: en la de viandas, solo viandas; en la
   minorista y la mayorista, todo menos las viandas. null = sin filtro (ningún proveedor
   marcado como cocina: no hay viandas). */
function _filtroVentaCtx(ctx) {
  const cocinas = _cocinasIds();
  const vds = ctx !== 'may' && enVentaViandas();
  if (!cocinas.size && !vds) return null;
  return p => (vds ? esVianda(p, cocinas) : !esVianda(p, cocinas));
}

/* Por qué no se puede agregar este producto a esta venta, o '' si se puede. */
function ventaTipoPermite(p, ctx) {
  if (!p) return '';
  const vianda = esVianda(p);
  if (ctx === 'may') return vianda ? 'Las viandas no se venden por mayor: se cobran en Ventas → Viandas.' : '';
  if (enVentaViandas()) return vianda ? '' : 'En la venta de viandas solo van viandas. "' + (p.nombreMostrado || p.nombre || 'Este producto') + '" va en una venta minorista.';
  return vianda ? '"' + (p.nombreMostrado || p.nombre || 'Este producto') + '" es una vianda: se cobra en Ventas → Viandas, con la caja de viandas.' : '';
}

/* El control final al guardar. `items` son los renglones; `originales` (al editar) los
   que ya tenía la venta: esos no se controlan, porque las ventas de antes tienen platos
   de la cocina vendidos como minoristas y tienen que poder editarse. Devuelve el
   mensaje para el cartel, o '' si está bien. */
function viandasControlVenta(items, ctx, originales) {
  const cocinas = _cocinasIds();
  const vds = ctx !== 'may' && enVentaViandas();
  if (!cocinas.size && !vds) return '';
  const viejos = new Set((originales || []).map(i => i && i.id));
  const malos = (items || []).filter(i => i && !viejos.has(i.id)).filter(i => (vds ? !esViandaId(i.id, cocinas) : esViandaId(i.id, cocinas)));
  if (!malos.length) return '';
  const nombres = malos.map(i => i.nombre || i.id).slice(0, 4).join(', ') + (malos.length > 4 ? ' y ' + (malos.length - 4) + ' más' : '');
  if (ctx === 'may') return 'Las viandas no se venden por mayor: sacá ' + nombres + ' y cobralas en Ventas → Viandas.';
  if (vds) return 'En la venta de viandas solo van viandas: sacá ' + nombres + ' y cobralo en una venta minorista.';
  return nombres + (malos.length === 1 ? ' es una vianda' : ' son viandas') + ': se cobran en Ventas → Viandas, con la caja de viandas. Sacalas de esta venta.';
}

/* El aviso de abajo del buscador cuando lo que se busca está del otro lado. */
function viandasPieBusqueda(ctx, q) {
  const t = String(q || '').toLowerCase().trim();
  const cocinas = _cocinasIds();
  const vds = ctx !== 'may' && enVentaViandas();
  if (!t || (!cocinas.size && !vds)) return '';
  if (vds && !cocinas.size) {
    return '<div class="vprod-ocultos"><span><i class="bi bi-egg-fried"></i> Todavía no hay viandas: marcá el proveedor de la cocina en Proveedores.</span></div>';
  }
  const coincide = (typeof _coincideVenta === 'function') ? _coincideVenta : (() => false);
  const prods = (typeof allProducts !== 'undefined' && Array.isArray(allProducts)) ? allProducts : [];
  const n = prods.filter(p => p && p.depurado !== true && p.oculto !== true && coincide(p, t) && (vds ? !esVianda(p, cocinas) : esVianda(p, cocinas))).length;
  if (!n) return '';
  const txt = vds
    ? n + (n === 1 ? ' producto que no es vianda coincide: va en una venta minorista.' : ' productos que no son viandas coinciden: van en una venta minorista.')
    : n + (n === 1 ? ' vianda coincide: se cobra en Ventas → Viandas.' : ' viandas coinciden: se cobran en Ventas → Viandas.');
  return '<div class="vprod-ocultos"><span><i class="bi bi-egg-fried"></i> ' + txt + '</span></div>';
}

/* ======================= LA MARCA EN EL PROVEEDOR =======================

   La casilla "Es la cocina" de la ficha del proveedor (admin-proveedores.js). Se guarda
   en el documento del proveedor (`listas` es solo para admins): no hace falta ninguna
   regla nueva y no queda a la vista de la tienda. Pregunta antes, porque cambia por
   dónde se venden todos sus productos. */
async function provMarcarCocina(id, el) {
  const ls = (typeof listasData !== 'undefined' && Array.isArray(listasData)) ? listasData : [];
  const l = ls.find(x => x && x.id === id);
  if (!l) return;
  const marcar = !!(el && el.checked);
  const prods = ((typeof allProducts !== 'undefined' && allProducts) || []).filter(p => p && p.lista === id && p.depurado !== true);
  const n = prods.length + (prods.length === 1 ? ' producto' : ' productos');
  const ok = await pedirConfirmacion(marcar
    ? '¿' + l.nombre + ' es la cocina?\n\nSus ' + n + ' pasan a ser viandas: se venden solo en Ventas → Viandas y su plata va a la caja de viandas. En las ventas minoristas y mayoristas ya no se van a poder cargar.\n\nLas ventas que ya se hicieron no cambian.'
    : '¿' + l.nombre + ' deja de ser la cocina?\n\nSus ' + n + ' vuelven a venderse como productos comunes, en las ventas minoristas, con la caja del local.\n\nLas ventas de viandas que ya se hicieron no cambian.',
    { titulo: marcar ? 'Marcar como la cocina' : 'Ya no es la cocina', aceptar: marcar ? 'Sí, es la cocina' : 'Sí, ya no es', cancelar: 'No', cuidado: true, icono: 'bi-egg-fried' });
  if (!ok) { if (el) el.checked = !marcar; return; }
  try {
    await db.collection('listas').doc(id).update({ cocina: marcar });
    l.cocina = marcar;
    if (typeof logAction === 'function')
      logAction('editar', 'Proveedor ' + l.nombre + (marcar ? ': es la cocina (sus productos son viandas)' : ': ya no es la cocina'), n);
    showAdminToast(marcar ? l.nombre + ' quedó como la cocina: sus productos son viandas' : l.nombre + ' ya no es la cocina', 'success');
  } catch (e) {
    if (el) el.checked = !marcar;
    showAdminToast('No se pudo guardar: ' + e.message, 'error');
  }
}

/* ======================= LA VENTA DE VIANDAS ======================= */

/* "Nueva venta de viandas": el mismo modal de la minorista, en modo viandas. */
async function abrirVentaViandas() {
  if (typeof listasData !== 'undefined' && !(listasData || []).length && typeof loadListas === 'function') {
    try { await loadListas(); } catch (e) { /* sin proveedores: el buscador lo avisa */ }
  }
  openVentaModal();
  window._ventaViandas = true;
  pintarModoVentaViandas(false);
  if (typeof filterVentaProducts === 'function') filterVentaProducts();
}

/* El título y el botón del modal en modo viandas. */
function pintarModoVentaViandas(editando, numero) {
  const tit = document.querySelector('#ventaModal .modal-header h3');
  if (tit) tit.innerHTML = '<i class="bi bi-egg-fried"></i> ' + (editando ? 'Editar venta de viandas #' + numero : 'Nueva venta de viandas');
  const btn = document.getElementById('saveVentaBtn');
  if (btn) btn.innerHTML = '<i class="bi bi-check-lg"></i> ' + (editando ? 'Guardar cambios' : 'Registrar venta de viandas');
}

/* ======================= PEDIDOS DE LA TIENDA CON VIANDAS =======================

   Thiago (10/10/2026): un pedido que trae viandas y otras cosas se pasa a DOS ventas
   solas: primero la del local (con el envío y el cupón) y, apenas se guarda, se abre la
   de las viandas con los mismos datos del cliente. Uno con solo viandas es una venta de
   viandas, y listo.

   El pedido guarda las dos: `ventaId` (la primera, como siempre) y `ventaViandasId`.
   Mientras falte la de viandas (se cerró sin guardar, o se borró) queda
   `viandasPendientes: true` y la ficha del pedido ofrece "Pasar las viandas a venta".

   EL STOCK: la tienda descontó el pedido entero. La primera venta se queda con lo suyo y
   le saca al pedido la marca `stockDescontado` (como siempre); lo de las viandas queda
   anotado en `viandasStockDescontado`, para que su venta no lo vuelva a descontar. */
function viandasDelPedido(p) {
  const cocinas = _cocinasIds();
  const items = (p && Array.isArray(p.items)) ? p.items : [];
  return {
    vds: items.filter(i => i && esViandaId(i.id, cocinas)),
    nor: items.filter(i => !(i && esViandaId(i.id, cocinas)))
  };
}
/* Ya tiene la venta del local pero le falta la de sus viandas. */
function viandasPendientesDelPedido(p) {
  return !!(p && p.ventaId && p.viandasPendientes === true && !p.ventaViandasId);
}
/* La segunda venta, apenas se guarda la primera (saveVenta). `medio`: el que se eligió en
   la primera, que puede no ser el del pedido. */
function viandasSegundaParte(pedidoId, medio) {
  if (typeof convertirPedidoEnVentaDesdeModal !== 'function') return;
  editingPedidoId = pedidoId;
  window._viandasMedioElegido = medio || null;
  convertirPedidoEnVentaDesdeModal();
}

/* ======================= VENTAS → VIANDAS (la lista) =======================

   Las mismas piezas que la de minoristas (vtListaHtml, vtFilaHtml, renderResumenVentas),
   sobre las ventas de `ventas` que tienen cajaTipo 'viandas'. Se lee el mes por rango de
   fecha y se filtra acá: pedir por cajaTipo y fecha juntos necesitaría un índice
   compuesto nuevo. `ventasData` queda con las ventas del mes (de las dos), así editar,
   la factura, el ticket y borrar las encuentran como a cualquier venta. */
let ventasVdsFiltradas = [], ventasVdsPagina = 0, _ventasVdsTope = false;

async function loadVentasViandas() {
  const sel = document.getElementById('ventaVdsMesFiltro');
  if (sel && sel.options.length <= 1 && typeof _buildMesOptions === 'function') _buildMesOptions('ventaVdsMesFiltro');
  const c = document.getElementById('ventasVdsList');
  if (!c) return;
  c.innerHTML = '<div class="empty-state" style="padding:2rem"><p>Cargando...</p></div>';
  try {
    const mes = (sel && sel.value) || '';
    let q = db.collection('ventas');
    _ventasVdsTope = false;
    if (mes) {
      const p = mes.split('-'), y = Number(p[0]), m = Number(p[1]);
      q = q.where('fecha', '>=', new Date(y, m - 1, 1, 0, 0, 0, 0)).where('fecha', '<=', new Date(y, m, 0, 23, 59, 59, 999)).orderBy('fecha', 'desc');
    } else {
      q = q.orderBy('fecha', 'desc').limit(500);
      _ventasVdsTope = true;
    }
    const snap = await q.get();
    ventasData = snap.docs.map(d => {
      const r = d.data();
      return Object.assign({ docId: d.id }, r, { fecha: r.fecha ? (r.fecha.toDate ? r.fecha.toDate() : new Date(r.fecha)) : new Date() });
    });
    if (_ventasVdsTope && ventasData.length < 500) _ventasVdsTope = false;
    ventasVdsPagina = 0;
    filterVentasViandas();
  } catch (e) {
    c.innerHTML = '<div class="empty-state" style="padding:2rem"><p>Error: ' + esc(e.message) + '</p></div>';
  }
}

function filterVentasViandas() {
  ventasVdsPagina = 0;
  const q = ((document.getElementById('ventaVdsSearch') || {}).value || '').toLowerCase();
  const mes = (document.getElementById('ventaVdsMesFiltro') || {}).value || '';
  let arr = (ventasData || []).filter(v => v.cajaTipo === 'viandas');
  if (mes) {
    const [my, mm] = mes.split('-').map(Number);
    arr = arr.filter(v => v.fecha instanceof Date && v.fecha.getFullYear() === my && (v.fecha.getMonth() + 1) === mm);
  }
  if (q) arr = arr.filter(v => (v.cliente || '').toLowerCase().includes(q) || String(v.numero).includes(q) || (v.medioPago || '').toLowerCase().includes(q));
  ventasVdsFiltradas = arr;
  renderVentasViandas();
}

function renderVentasViandas() {
  const c = document.getElementById('ventasVdsList');
  if (!c) return;
  if (typeof renderResumenVentas === 'function') renderResumenVentas('vtVdsStat', ventasVdsFiltradas, 'ventaVdsMesFiltro');
  const aviso = _ventasVdsTope
    ? '<div class="vt-aviso"><i class="bi bi-info-circle"></i> Con <b>Todos los meses</b> se miran las <b>500 ventas más recientes</b> (del local y de viandas). Elegí un mes para ver ese mes completo.</div>'
    : (hayCocina() ? '' : '<div class="vt-aviso"><i class="bi bi-info-circle"></i> Todavía no hay viandas: en <b>Proveedores</b>, entrá al proveedor de la cocina y tildá <b>Es la cocina</b>.</div>');
  const porPag = 12, total = ventasVdsFiltradas.length, pags = Math.ceil(total / porPag) || 1;
  if (ventasVdsPagina >= pags) ventasVdsPagina = pags - 1;
  const shown = ventasVdsFiltradas.slice(ventasVdsPagina * porPag, (ventasVdsPagina + 1) * porPag);
  const pg = document.getElementById('ventasVdsPager');
  if (!shown.length) {
    c.innerHTML = aviso + '<div class="empty-state vt-vacio"><i class="bi bi-egg-fried"></i><p>Sin ventas de viandas</p></div>';
    if (pg) pg.innerHTML = '';
    return;
  }
  c.innerHTML = aviso + vtListaHtml(shown, ventasVdsFiltradas, v => vtFilaHtml(v, 'min'));
  if (pg) {
    pg.innerHTML = pags > 1
      ? '<button onclick="ventasVdsPagina=Math.max(0,ventasVdsPagina-1);renderVentasViandas()"' + (ventasVdsPagina === 0 ? ' disabled' : '') + '>Ant</button>' +
        '<span>' + (ventasVdsPagina + 1) + '/' + pags + '</span>' +
        '<button onclick="ventasVdsPagina=Math.min(' + (pags - 1) + ',ventasVdsPagina+1);renderVentasViandas()"' + (ventasVdsPagina >= pags - 1 ? ' disabled' : '') + '>Sig</button>'
      : '';
  }
}
