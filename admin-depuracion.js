/* =============================================================================
   DEPURACIÓN DE PRODUCTOS  —  Brotes Dietética
   =============================================================================
   Productos que ya no se mueven se DEPURAN: desaparecen de las listas y de la
   tienda, pero no se borran. Restaurar es volver un campo atrás.

   ES CANDIDATO si cumple al menos 2 de estos 3, mirando los últimos X días:
     - sinVentas:     no aparece en ninguna venta ni venta mayorista
     - sinStock:      stock en 0 o negativo
     - sinReposicion: el stock no subió. Sale de `stockSubioEn`, que escribe una
                      función de Firebase. Mientras ese registro no cubra los X
                      días, el criterio dice "sin datos" y NO cuenta.
   Y además no tiene que ser nuevo (creadoEn dentro de los X días), ni tener un
   pedido abierto, ni tener presentaciones o envasados propios que se sigan
   vendiendo, ni estar sacado de la lista a mano (excluidoDepuracion).

   "SIN VENTAS" DICE QUE SÍ, "SIN MOVIMIENTOS" NO EXISTE, A PROPÓSITO

   Se había pensado un criterio "sin movimientos". Vender es un movimiento, así
   que ese criterio incluía a "sin ventas": cuando se cumplía uno, el otro venía
   de regalo, y el "2 de 3" quedaba cumplido con un solo dato. Los tres de arriba
   no se pisan.

   EL DEPURADO SIGUE ADENTRO DE allProducts

   Se saca solamente de las pantallas donde se ELIGE un producto: tablas,
   buscadores, exportaciones, alertas y la tienda. Hay 22 funciones que usan esa
   lista para otra cosa, y si el depurado faltara:
     - Importar Nuevos lo daría por inexistente: lo crearía de nuevo y podría
       repetirle el código;
     - el lector del mostrador no lo encontraría con el producto en la mano;
     - borrarImagenesQueSobran vería sus fotos sin dueño y las BORRARÍA.
   Si se escapa un filtro, el depurado aparece en una lista y alguien lo nota.
   Al revés, el daño no se ve.

   SI NO SE PUDIERON LEER LAS VENTAS, NO HAY CANDIDATOS

   Una lectura fallida no es "nadie compró nada": con cero ventas, el catálogo
   entero sale como candidato. Por eso acá la carga no tiene catch que devuelva
   una lista vacía, a diferencia del ranking de Proveedores, donde eso solo deja
   un gráfico vacío.
   ============================================================================= */

const DEP_DIAS = [30, 60, 90];
const DEP_DIA_MS = 86400000;
const DEP_NOMBRES = { sinVentas: 'Sin ventas', sinStock: 'Sin stock', sinReposicion: 'Sin reposición' };

/* Un pedido está abierto mientras no se entregó ni se canceló. Se define por lo
   que NO es: la tienda y el panel usan estados distintos -pendiente, confirmado,
   y en el sandbox nuevo, preparando, listo- y uno que se agregue mañana también
   tiene que frenar la depuración. */
const DEP_PEDIDO_CERRADO = ['entregado', 'cancelado'];

/* Timestamp de Firestore, Date, o lo que venga: una fecha, o null. */
function depFecha(v) {
  if (!v) return null;
  if (typeof v.toDate === 'function') { const t = v.toDate(); return isNaN(t) ? null : t; }
  if (v instanceof Date) return isNaN(v) ? null : v;
  if (typeof v.seconds === 'number') return new Date(v.seconds * 1000);
  const d = new Date(v);
  return isNaN(d) ? null : d;
}

/* La última venta de cada producto, entre las ventas que se leyeron. */
function depUltimasVentas(ventas) {
  const out = new Map();
  (ventas || []).forEach(v => {
    const f = depFecha(v && v.fecha);
    if (!f) return;
    ((v && v.items) || []).forEach(i => {
      if (!i || !i.id) return;
      const antes = out.get(i.id);
      if (!antes || f > antes) out.set(i.id, f);
    });
  });
  return out;
}

function depPedidosAbiertos(pedidos) {
  const ids = new Set();
  (pedidos || []).forEach(p => {
    if (!p || DEP_PEDIDO_CERRADO.indexOf(p.estado) >= 0) return;
    (p.items || []).forEach(i => { if (i && i.id) ids.add(i.id); });
  });
  return ids;
}

/* 'si' | 'no' | 'sinDatos'. Que el stock subió dentro del período se sabe con
   un solo registro; que NO subió, solo si el registro ya existía al empezar el
   período. Si no, no se sabe, y se dice. */
function depReposicion(p, limite, registroDesde) {
  const subio = depFecha(p && p.stockSubioEn);
  if (subio && subio >= limite) return 'no';
  if (registroDesde && registroDesde <= limite) return 'si';
  return 'sinDatos';
}

function depEvaluar(productos, datos, opciones) {
  const o = opciones || {};
  const dias = DEP_DIAS.indexOf(o.dias) >= 0 ? o.dias : 90;
  const ahora = o.ahora || new Date();
  const limite = new Date(ahora.getTime() - dias * DEP_DIA_MS);
  const d = datos || {};
  const ultimas = d.ultimasVentas || new Map();
  const abiertos = d.pedidosAbiertos || new Set();
  const registroDesde = depFecha(d.registroStockDesde);
  const lista = productos || [];

  /* Las presentaciones de cada producto: en la tienda solo se ven como botones
     adentro del producto principal, así que depurarlo las esconde con él. */
  const hijosDe = {};
  lista.forEach(p => {
    if (p && p.gramajePadreId && p.depurado !== true) {
      (hijosDe[p.gramajePadreId] = hijosDe[p.gramajePadreId] || []).push(p);
    }
  });

  /* La última venta de sus presentaciones (gramajePadreId) y de sus envasados propios
     (padreId). Un granel casi no se vende directo: se vende fraccionado, en los
     envasados que salen de él. Mirando solo sus propias ventas figuraba "sin ventas",
     y se ofrecía depurar justo el producto que alimenta a los que más salen. */
  const ventaFamilia = {};
  lista.forEach(p => {
    const padre = p && (p.gramajePadreId || p.padreId);
    const f = padre && ultimas.get(p.id);
    if (f && (!ventaFamilia[padre] || f > ventaFamilia[padre])) ventaFamilia[padre] = f;
  });

  const r = {
    dias: dias, limite: limite, candidatos: [], depurados: [], excluidos: [], nuevos: [], conPedido: [], familiaActiva: [],
    reposicionConDatos: !!(registroDesde && registroDesde <= limite),
  };
  lista.forEach(p => {
    if (!p || !p.id) return;
    if (p.depurado === true) { r.depurados.push(p); return; }
    if (p.excluidoDepuracion === true) { r.excluidos.push(p); return; }
    const ultimaVenta = ultimas.get(p.id) || null;
    const criterios = {
      sinVentas: !ultimaVenta || ultimaVenta < limite,
      sinStock: Number(p.stock || 0) <= 0,
      sinReposicion: depReposicion(p, limite, registroDesde),
    };
    const cumple = (criterios.sinVentas ? 1 : 0) + (criterios.sinStock ? 1 : 0) +
                   (criterios.sinReposicion === 'si' ? 1 : 0);
    if (cumple < 2) return;
    const fila = { producto: p, criterios: criterios, cumple: cumple, ultimaVenta: ultimaVenta, hijos: hijosDe[p.id] || [] };
    /* Estos cumplirían, pero no se ofrecen. Se cuentan igual, para poder decir
       en pantalla por qué no están. */
    const alta = depFecha(p.creadoEn);
    if (alta && alta > limite) { r.nuevos.push(fila); return; }
    if (abiertos.has(p.id)) { r.conPedido.push(fila); return; }
    if (ventaFamilia[p.id] && ventaFamilia[p.id] >= limite) { r.familiaActiva.push(fila); return; }
    r.candidatos.push(fila);
  });
  /* Primero los que cumplen más; entre iguales, el que hace más que no se vende. */
  r.candidatos.sort((a, b) => (b.cumple - a.cumple) ||
    ((a.ultimaVenta ? a.ultimaVenta.getTime() : 0) - (b.ultimaVenta ? b.ultimaVenta.getTime() : 0)) ||
    String(a.producto.nombre || '').localeCompare(String(b.producto.nombre || '')));
  return r;
}

/* Lo que queda escrito en el producto al depurarlo, para saber después por qué. */
function depMotivo(fila, dias) {
  return {
    dias: dias,
    criterios: Object.keys(fila.criterios).filter(k => fila.criterios[k] === true || fila.criterios[k] === 'si'),
    stock: Number(fila.producto.stock || 0),
    ultimaVenta: fila.ultimaVenta || null,
  };
}

/* ======================== LA CARGA Y LA PANTALLA ======================== */
let _depDias = 90;
try {
  const g = Number(localStorage.getItem('brotes_dep_dias'));
  if (DEP_DIAS.indexOf(g) >= 0) _depDias = g;
} catch (e) { /* sin almacenamiento: queda en 90 */ }
let _depDatos = null;
let _depError = '';
let _depCargando = false;
let _depEval = null;
const _depSelCand = new Set();
const _depSelDep = new Set();
let _depPagCand = 1, _depPagDep = 1;

/* Las ventas de 90 días -el período más largo- se leen una sola vez: cambiar
   entre 30, 60 y 90 recalcula en memoria, sin volver a leer. */
async function _depLeer(forzar) {
  if (_depDatos && !forzar) return _depDatos;
  const hasta = new Date();
  const desde = new Date(hasta.getTime() - 90 * DEP_DIA_MS);
  const ventasDe = async col => {
    const q = await db.collection(col).where('fecha', '>=', desde).where('fecha', '<=', hasta).get();
    const out = [];
    q.forEach(d => out.push(d.data()));
    return out;
  };
  /* Sin catch acá adentro: ver "SI NO SE PUDIERON LEER LAS VENTAS" arriba. */
  const res = await Promise.all([
    ventasDe('ventas'), ventasDe('ventasMayoristas'),
    db.collection('pedidos').where('estado', 'not-in', DEP_PEDIDO_CERRADO).get(),
    db.collection('config').doc('depuracion').get(),
  ]);
  const pedidos = [];
  res[2].forEach(d => pedidos.push(d.data()));
  const cfg = res[3].exists ? (res[3].data() || {}) : {};
  _depDatos = {
    ultimasVentas: depUltimasVentas(res[0].concat(res[1])),
    pedidosAbiertos: depPedidosAbiertos(pedidos),
    registroStockDesde: cfg.registroStockDesde || null,
    ventasLeidas: res[0].length + res[1].length,
    leidoEn: new Date(),
  };
  return _depDatos;
}

async function loadDepuracion(forzar) {
  _depCargando = true;
  _depError = '';
  depuracionRender();
  try {
    if (typeof allProducts === 'undefined' || !allProducts.length) await loadProducts();
    /* Con el panel abierto desde temprano, las ventas en memoria son las de la mañana:
       pasados 10 minutos se vuelven a leer al entrar a la sección. */
    const viejo = !!(_depDatos && Date.now() - _depDatos.leidoEn.getTime() > 10 * 60000);
    await _depLeer(!!forzar || viejo);
  } catch (e) {
    console.error('depuracion:', e);
    _depError = (e && e.message) || String(e);
    _depDatos = null;
  }
  _depCargando = false;
  depuracionRender();
}

/* La llama loadProducts al terminar. Solo redibuja si la sección está a la vista. */
function depuracionRefrescar() {
  const sec = document.getElementById('sec-depuracion');
  if (sec && sec.classList.contains('active')) depuracionRender();
}

const _depEsc = s => (typeof esc === 'function' ? esc(String(s == null ? '' : s)) : String(s == null ? '' : s));
function _depFmt(f) { return f ? f.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : ''; }
function _depStock(p) {
  const n = Number(p.stock || 0);
  /* En los de peso el stock son GRAMOS. */
  return p.tipoVenta === 'peso'
    ? (n / 1000).toLocaleString('es-AR', { maximumFractionDigits: 3 }) + ' kg'
    : n.toLocaleString('es-AR') + ' u';
}
function _depProveedor(p) {
  const l = (typeof listasData !== 'undefined' && Array.isArray(listasData)) ? listasData.find(x => x.id === p.lista) : null;
  return (l && l.nombre) || '';
}
function _depProd(id) {
  return (typeof allProducts !== 'undefined' && Array.isArray(allProducts)) ? allProducts.find(p => p.id === id) : null;
}
function _depNombre(id) { const p = _depProd(id); return p ? (p.nombreMostrado || p.nombre || id) : id; }
function _depCelda(v) {
  if (v === true || v === 'si') return '<td class="dep-c"><i class="bi bi-check-lg dep-si"></i></td>';
  if (v === 'sinDatos') return '<td class="dep-c"><span class="dep-sd">sin datos</span></td>';
  return '<td class="dep-c"><span class="dep-no">&mdash;</span></td>';
}
function _depPagina(lista, pag) {
  const por = (typeof ADMIN_PER_PAGE !== 'undefined') ? ADMIN_PER_PAGE : 20;
  const total = Math.max(1, Math.ceil(lista.length / por));
  const p = Math.min(Math.max(1, pag), total);
  return { items: lista.slice((p - 1) * por, p * por), pagina: p, total: total };
}
function _depLinea(p, extra) {
  const prov = _depProveedor(p);
  return '<b>' + _depEsc(p.nombreMostrado || p.nombre) + '</b><div class="dep-sub">' + _depEsc(p.codigo || '') +
    (prov ? ' &middot; ' + _depEsc(prov) : '') + (extra || '') + '</div>';
}
/* La barra de arriba de cada tabla: la misma que usa Stock para elegir varios. Así
   el botón queda al lado de lo que se eligió, y no suelto al final de la página. */
function _depBarra(tipo, total, elegidos, boton) {
  return '<div class="stock-masivo"><label class="stock-masivo-lbl"><input type="checkbox" ' +
    (total && elegidos === total ? 'checked ' : '') + 'onchange="depuracionMarcarTodos(\'' + tipo + '\',this.checked)">' +
    '<span>Elegir todos (' + total + ')</span></label>' +
    '<span class="stock-masivo-cuenta">' + (elegidos ? elegidos + ' elegido' + (elegidos === 1 ? '' : 's') : '') + '</span>' +
    '<div class="stock-masivo-acc">' + boton + '</div></div>';
}
function _depCheck(tipo, id, marcado) {
  return '<td class="dep-c"><input type="checkbox" ' + (marcado ? 'checked ' : '') +
    'onchange="depuracionMarcar(\'' + tipo + '\',\'' + _depEsc(id) + '\',this.checked)"></td>';
}
function _depAviso(html) {
  return '<div class="cp-aviso" style="display:flex"><i class="bi bi-exclamation-triangle dep-alerta"></i><div>' + html + '</div></div>';
}

function depuracionRender() {
  const per = document.getElementById('depPeriodo');
  if (per) {
    per.innerHTML = DEP_DIAS.map(d => '<button class="btn btn-sm ' + (d === _depDias ? 'btn-primary' : 'btn-secondary') +
      '" onclick="depuracionPeriodo(' + d + ')">' + d + ' d&iacute;as</button>').join('');
  }
  const cont = document.getElementById('depContenido');
  if (!cont) return;
  if (_depCargando) {
    cont.innerHTML = '<div class="empty-state"><i class="bi bi-arrow-repeat spin"></i><p>Leyendo ventas y pedidos...</p></div>';
    return;
  }
  if (_depError || !_depDatos) {
    cont.innerHTML = _depAviso((_depError ? '<b>No se pudieron leer las ventas</b> (' + _depEsc(_depError) + ').<br>' : '') +
      'Sin las ventas no se puede saber qu&eacute; se vendi&oacute;, as&iacute; que no se muestra ning&uacute;n candidato. ' +
      '<button class="btn btn-sm btn-secondary" onclick="loadDepuracion(true)">Reintentar</button>');
    return;
  }
  const prods = (typeof allProducts !== 'undefined' && Array.isArray(allProducts)) ? allProducts : [];
  const ev = _depEval = depEvaluar(prods, _depDatos, { dias: _depDias });
  /* La selección no puede quedar apuntando a algo que ya no está en su tabla. */
  const idsCand = new Set(ev.candidatos.map(f => f.producto.id));
  [..._depSelCand].forEach(id => { if (!idsCand.has(id)) _depSelCand.delete(id); });
  const idsDep = new Set(ev.depurados.map(p => p.id));
  [..._depSelDep].forEach(id => { if (!idsDep.has(id)) _depSelDep.delete(id); });
  const nEx = document.getElementById('depExcluidosN');
  if (nEx) nEx.textContent = ev.excluidos.length ? '(' + ev.excluidos.length + ')' : '';

  const tarjeta = (t, n) => '<div class="stat-card"><div class="stat-label">' + t + '</div><div class="stat-value">' + n + '</div></div>';
  let h = '<div class="stats-row">' + tarjeta('Candidatos', ev.candidatos.length) + tarjeta('Depurados', ev.depurados.length) +
    tarjeta('Excluidos', ev.excluidos.length) + '</div>';
  h += '<p class="dep-sub">Ventas y ventas mayoristas de los &uacute;ltimos 90 d&iacute;as: ' + _depDatos.ventasLeidas +
    ', le&iacute;das a las ' + _depDatos.leidoEn.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) + '.</p>';
  if (!_depDatos.ventasLeidas) {
    h += _depAviso('<b>No se encontr&oacute; ninguna venta en 90 d&iacute;as.</b> Si el comercio est&aacute; vendiendo, ' +
      'algo no se ley&oacute; bien: revis&aacute; antes de depurar.');
  }
  if (!ev.reposicionConDatos) {
    h += '<p class="dep-sub"><b>Sin reposici&oacute;n</b> todav&iacute;a no tiene un registro de stock que cubra ' + ev.dias +
      ' d&iacute;as, as&iacute; que no cuenta: por ahora es candidato lo que no se vendi&oacute; y no tiene stock.</p>';
  }

  h += '<h3 class="dep-titulo">Candidatos a depurar</h3>';
  const pc = _depPagina(ev.candidatos, _depPagCand);
  _depPagCand = pc.pagina;
  if (!ev.candidatos.length) {
    h += '<div class="empty-state"><i class="bi bi-check2-circle"></i><p>No hay productos para depurar con ' + ev.dias + ' d&iacute;as.</p></div>';
  } else {
    h += _depBarra('cand', ev.candidatos.length, _depSelCand.size,
        '<button class="btn btn-primary dep-ancho" onclick="depurarSeleccionados()"' + (_depSelCand.size ? '' : ' disabled') +
        '><i class="bi bi-archive"></i> Depurar' + (_depSelCand.size ? ' (' + _depSelCand.size + ')' : '') + '</button>') +
      '<div class="table-wrap"><div class="table-scroll"><table><thead><tr><th class="dep-c"></th>' +
      '<th>Producto</th><th>Stock</th><th>&Uacute;ltima venta</th><th class="dep-c">Sin ventas</th>' +
      '<th class="dep-c">Sin stock</th><th class="dep-c">Sin reposici&oacute;n</th><th></th></tr></thead><tbody>' +
      pc.items.map(f => {
        const p = f.producto;
        const pres = f.hijos.length
          ? ' &middot; <span class="dep-chip">' + f.hijos.length + ' presentaci' + (f.hijos.length === 1 ? '&oacute;n' : 'ones') + '</span>' : '';
        return '<tr>' + _depCheck('cand', p.id, _depSelCand.has(p.id)) +
          '<td>' + _depLinea(p, pres) + '</td><td>' + _depStock(p) + '</td>' +
          '<td>' + (f.ultimaVenta ? _depFmt(f.ultimaVenta) : '<span class="dep-no">hace m&aacute;s de 90 d&iacute;as</span>') + '</td>' +
          _depCelda(f.criterios.sinVentas) + _depCelda(f.criterios.sinStock) + _depCelda(f.criterios.sinReposicion) +
          '<td><button class="btn btn-sm btn-secondary" title="No volver a sugerirlo" onclick="depuracionExcluir(\'' +
          _depEsc(p.id) + '\')">Sacar de la lista</button></td></tr>';
      }).join('') + '</tbody></table></div></div><div id="depCandPag"></div>';
  }
  const apartados = [];
  if (ev.nuevos.length) apartados.push(ev.nuevos.length + ' por ser nuevos (dados de alta hace menos de ' + ev.dias + ' d&iacute;as)');
  if (ev.conPedido.length) apartados.push(ev.conPedido.length + ' por tener un pedido abierto');
  if (ev.familiaActiva.length) apartados.push(ev.familiaActiva.length + ' porque sus presentaciones o envasados se siguen vendiendo');
  if (apartados.length) h += '<p class="dep-sub">No se ofrecen, aunque cumplen: ' + apartados.join('; ') + '.</p>';

  h += '<h3 class="dep-titulo">Productos depurados</h3>';
  const pd = _depPagina(ev.depurados, _depPagDep);
  _depPagDep = pd.pagina;
  if (!ev.depurados.length) {
    h += '<p class="dep-sub">Todav&iacute;a no hay productos depurados.</p>';
  } else {
    h += _depBarra('dep', ev.depurados.length, _depSelDep.size,
        '<button class="btn btn-secondary dep-ancho" onclick="depuracionRestaurarSeleccionados()"' + (_depSelDep.size ? '' : ' disabled') +
        '><i class="bi bi-arrow-counterclockwise"></i> Restaurar' + (_depSelDep.size ? ' (' + _depSelDep.size + ')' : '') + '</button>') +
      '<div class="table-wrap"><div class="table-scroll"><table><thead><tr><th class="dep-c"></th>' +
      '<th>Producto</th><th>Stock</th><th>Depurado</th><th>Por qu&eacute;</th><th></th></tr></thead><tbody>' +
      pd.items.map(p => {
        const m = p.depuradoMotivo || {};
        return '<tr>' + _depCheck('dep', p.id, _depSelDep.has(p.id)) +
          '<td>' + _depLinea(p) + '</td><td>' + _depStock(p) + '</td>' +
          '<td>' + _depFmt(depFecha(p.depuradoEn)) + '<div class="dep-sub">' + _depEsc(p.depuradoPor || '') + '</div></td>' +
          '<td>' + (m.criterios || []).map(c => '<span class="dep-chip">' + _depEsc(DEP_NOMBRES[c] || c) + '</span>').join(' ') +
          (m.dias ? '<div class="dep-sub">mirando ' + m.dias + ' d&iacute;as</div>' : '') + '</td>' +
          '<td><button class="btn btn-sm btn-secondary" onclick="depuracionRestaurarUno(\'' + _depEsc(p.id) + '\')">Restaurar</button></td></tr>';
      }).join('') + '</tbody></table></div></div><div id="depDepPag"></div>';
  }
  cont.innerHTML = h;
  if (typeof renderAdminPagination === 'function') {
    if (ev.candidatos.length) renderAdminPagination('depCandPag', pc.pagina, pc.total, ev.candidatos.length, 'depCand');
    if (ev.depurados.length) renderAdminPagination('depDepPag', pd.pagina, pd.total, ev.depurados.length, 'depDep');
  }
}

/* ============================== LAS ACCIONES ============================== */

function depuracionPeriodo(d) {
  if (DEP_DIAS.indexOf(d) < 0) return;
  _depDias = d;
  try { localStorage.setItem('brotes_dep_dias', String(d)); } catch (e) { /* no se recuerda, no pasa nada */ }
  _depPagCand = 1;
  _depSelCand.clear();
  depuracionRender();
}
function depuracionIrPagina(tipo, page) {
  if (tipo === 'depCand') _depPagCand = page; else _depPagDep = page;
  depuracionRender();
}
function depuracionMarcar(tipo, id, marcado) {
  const s = tipo === 'dep' ? _depSelDep : _depSelCand;
  if (marcado) s.add(id); else s.delete(id);
  depuracionRender();
}
function depuracionMarcarTodos(tipo, marcado) {
  if (!_depEval) return;
  const s = tipo === 'dep' ? _depSelDep : _depSelCand;
  s.clear();
  if (marcado) {
    (tipo === 'dep' ? _depEval.depurados.map(p => p.id) : _depEval.candidatos.map(f => f.producto.id)).forEach(id => s.add(id));
  }
  depuracionRender();
}

function _depUsuario() {
  return (typeof auth !== 'undefined' && auth && auth.currentUser && auth.currentUser.email) || '';
}

/* Se modifica el MISMO objeto de allProducts, no se reemplaza: el lector y la
   venta pueden tener esa referencia en la mano, y así ven el cambio. */
function _depAplicarLocal(ids, campos) {
  ids.forEach(id => { const p = _depProd(id); if (p) Object.assign(p, campos); });
}
function _depRefrescarPantallas() {
  if (typeof _reRenderProductos === 'function') _reRenderProductos();
  if (typeof renderListasPanel === 'function') renderListasPanel();
  if (typeof _refrescarAlertas === 'function') _refrescarAlertas(true);
}

async function depurarSeleccionados() {
  if (!_depEval) return;
  const elegidos = _depEval.candidatos.filter(f => _depSelCand.has(f.producto.id));
  if (!elegidos.length) return showAdminToast('Elegí al menos un producto', 'error');
  const dias = _depDias;

  /* Se verifica contra la base y no contra la pantalla: entre que se cargó la
     lista y este clic, desde otra PC pudieron venderlo, reponerlo o depurarlo. Se
     releen los productos elegidos Y las ventas: releer solo el stock dejaba pasar
     una venta de algo que todavía tenía stock. */
  let vigentes;
  try {
    const snaps = await Promise.all(elegidos.map(f => db.collection('productos').doc(f.producto.id).get()));
    await _depLeer(true);
    const vivos = {};
    snaps.forEach(sn => { if (sn.exists) vivos[sn.id] = Object.assign({ id: sn.id }, sn.data()); });
    /* Se evalúa con el catálogo ENTERO, con los elegidos actualizados: evaluando solo
       a los elegidos no están sus presentaciones ni sus envasados. */
    const todos = (typeof allProducts !== 'undefined' && Array.isArray(allProducts) ? allProducts : []).map(p => vivos[p.id] || p);
    vigentes = depEvaluar(todos, _depDatos, { dias: dias }).candidatos.filter(f => vivos[f.producto.id]);
    /* Lo recién leído pisa lo de memoria: si otra PC cambió el stock, las pantallas
       tienen que mostrar el de ahora. */
    Object.keys(vivos).forEach(id => { const p = _depProd(id); if (p) Object.assign(p, vivos[id]); });
  } catch (e) {
    return showAdminToast('No se pudo verificar antes de depurar: ' + e.message, 'error');
  }
  const siguen = new Set(vigentes.map(f => f.producto.id));
  const cayeron = elegidos.filter(f => !siguen.has(f.producto.id));
  if (!vigentes.length) {
    showAdminToast('Ninguno de los elegidos sigue cumpliendo: cambiaron desde que se cargó la lista.', 'error');
    return loadDepuracion(true);
  }

  const nombre = f => f.producto.nombreMostrado || f.producto.nombre;
  const unos = arr => arr.slice(0, 5).map(nombre).join(', ') + (arr.length > 5 ? ' y ' + (arr.length - 5) + ' más' : '');
  const conStock = vigentes.filter(f => Number(f.producto.stock || 0) > 0);
  const conHijos = vigentes.filter(f => f.hijos.length);
  const n = vigentes.length;
  let msg = 'Vas a depurar ' + n + ' producto' + (n === 1 ? '' : 's') + '. No se borran: dejan de aparecer en Productos, ' +
    'Stock, los buscadores y la tienda, y se pueden restaurar desde esta sección.';
  if (cayeron.length) {
    msg += '\n\n' + cayeron.length + ' de los elegidos ya no cumplen (cambiaron desde que se cargó la lista) y quedan afuera: ' + unos(cayeron) + '.';
  }
  if (conStock.length) {
    msg += '\n\nOJO: ' + conStock.length + (conStock.length === 1 ? ' todavía tiene' : ' todavía tienen') + ' stock (' + unos(conStock) + '). ' +
      'Esa mercadería no se puede vender hasta restaurarlos. Si alguien los escanea en el mostrador, el sistema ofrece restaurarlos.';
  }
  if (conHijos.length) {
    msg += '\n\nOJO: ' + conHijos.length + (conHijos.length === 1 ? ' tiene' : ' tienen') + ' presentaciones (' + unos(conHijos) + '). ' +
      'En la tienda las presentaciones se muestran adentro del producto principal, así que dejan de verse con él.';
  }
  if (!await pedirConfirmacion(msg, { titulo: 'Depurar productos', aceptar: 'Depurar', icono: 'bi-archive' })) return;

  const usuario = _depUsuario();
  const ahora = new Date();
  const hechos = [];
  try {
    for (let i = 0; i < vigentes.length; i += 450) {
      const tanda = vigentes.slice(i, i + 450);
      const lote = db.batch();
      tanda.forEach(f => lote.update(db.collection('productos').doc(f.producto.id), {
        depurado: true, depuradoEn: ahora, depuradoPor: usuario, depuradoMotivo: depMotivo(f, dias),
      }));
      await lote.commit();
      tanda.forEach(f => hechos.push(f));
    }
  } catch (e) {
    showAdminToast('No se pudo depurar' + (hechos.length ? ' todo (quedaron ' + hechos.length + ')' : '') + ': ' + e.message, 'error');
  }
  if (!hechos.length) return;
  hechos.forEach(f => {
    _depAplicarLocal([f.producto.id], { depurado: true, depuradoEn: ahora, depuradoPor: usuario, depuradoMotivo: depMotivo(f, dias) });
    _depSelCand.delete(f.producto.id);
  });
  if (typeof logAction === 'function') {
    logAction('editar', 'Depuración: ' + hechos.length + ' producto' + (hechos.length === 1 ? '' : 's') + ' depurado' + (hechos.length === 1 ? '' : 's'),
      hechos.map(nombre).join(' | ').slice(0, 900));
  }
  if (hechos.length === n) showAdminToast(n + ' depurado' + (n === 1 ? '' : 's'), 'success');
  _depRefrescarPantallas();
  depuracionRender();
}

/* Devuelve true solo si se restauraron todos. */
async function depuracionRestaurar(ids, contexto) {
  const lista = (ids || []).filter(Boolean);
  if (!lista.length) return false;
  const campos = { depurado: false, restauradoEn: new Date(), restauradoPor: _depUsuario() };
  const hechos = [];
  try {
    for (let i = 0; i < lista.length; i += 450) {
      const tanda = lista.slice(i, i + 450);
      const lote = db.batch();
      tanda.forEach(id => lote.update(db.collection('productos').doc(id), campos));
      await lote.commit();
      tanda.forEach(id => hechos.push(id));
    }
  } catch (e) {
    showAdminToast('No se pudo restaurar' + (hechos.length ? ' todo (quedaron ' + hechos.length + ')' : '') + ': ' + e.message, 'error');
  }
  if (!hechos.length) return false;
  _depAplicarLocal(hechos, campos);
  hechos.forEach(id => _depSelDep.delete(id));
  if (typeof logAction === 'function') {
    logAction('editar', 'Depuración: ' + hechos.length + ' restaurado' + (hechos.length === 1 ? '' : 's') + (contexto ? ' (' + contexto + ')' : ''),
      hechos.map(_depNombre).join(' | ').slice(0, 900));
  }
  _depRefrescarPantallas();
  depuracionRefrescar();
  return hechos.length === lista.length;
}
async function depuracionRestaurarUno(id) {
  if (await depuracionRestaurar([id])) showAdminToast('Restaurado: ' + _depNombre(id), 'success');
}
async function depuracionRestaurarSeleccionados() {
  const ids = [..._depSelDep];
  if (!ids.length) return showAdminToast('Elegí al menos un producto', 'error');
  if (!await pedirConfirmacion('Restaurar ' + ids.length + ' producto' + (ids.length === 1 ? '' : 's') +
      ': vuelven a aparecer en Productos, Stock, los buscadores y la tienda.', { titulo: 'Restaurar productos', aceptar: 'Restaurar' })) return;
  if (await depuracionRestaurar(ids)) showAdminToast(ids.length + ' restaurado' + (ids.length === 1 ? '' : 's'), 'success');
}

/* Para el mostrador y las compras: alguien tiene el producto en la mano. */
async function depuracionOfrecerRestaurar(prod, para) {
  if (!prod || prod.depurado !== true) return true;
  const nombre = prod.nombreMostrado || prod.nombre || 'El producto';
  if (!await pedirConfirmacion('"' + nombre + '" está depurado: no aparece en las listas ni en la tienda.\n\n¿Restaurarlo' +
      (para ? ' para ' + para : '') + '?', { titulo: 'Producto depurado', aceptar: 'Restaurar', icono: 'bi-archive' })) return false;
  const ok = await depuracionRestaurar([prod.id], para ? 'para ' + para : '');
  if (ok) showAdminToast('Restaurado: ' + nombre, 'success');
  return ok;
}

/* ---------------------------------------------------- sacar de la lista */
async function _depExclusion(id, excluir) {
  const campos = excluir
    ? { excluidoDepuracion: true, excluidoDepuracionEn: new Date(), excluidoDepuracionPor: _depUsuario() }
    : { excluidoDepuracion: false, incluidoDepuracionEn: new Date(), incluidoDepuracionPor: _depUsuario() };
  try {
    await db.collection('productos').doc(id).update(campos);
  } catch (e) {
    showAdminToast('No se pudo guardar: ' + e.message, 'error');
    return false;
  }
  _depAplicarLocal([id], campos);
  _depSelCand.delete(id);
  if (typeof logAction === 'function') {
    logAction('editar', excluir ? 'Depuración: sacado de la lista' : 'Depuración: vuelto a la lista', _depNombre(id));
  }
  return true;
}
async function depuracionExcluir(id) {
  const nombre = _depNombre(id);
  if (!await pedirConfirmacion('"' + nombre + '" deja de aparecer como candidato y no se vuelve a sugerir solo. ' +
      'Queda en "Productos excluidos", desde donde lo podés volver a la lista.', { titulo: 'Sacar de la lista', aceptar: 'Sacar' })) return;
  if (await _depExclusion(id, true)) {
    showAdminToast('Sacado de la lista: ' + nombre, 'success');
    depuracionRender();
  }
}
async function depuracionIncluir(id) {
  if (await _depExclusion(id, false)) {
    showAdminToast('Vuelve a la lista: ' + _depNombre(id), 'success');
    _depRenderExcluidos();
    depuracionRender();
  }
}
function _depRenderExcluidos() {
  const b = document.getElementById('depExcluidosBody');
  if (!b) return;
  const prods = (typeof allProducts !== 'undefined' && Array.isArray(allProducts)) ? allProducts : [];
  const ex = prods.filter(p => p && p.excluidoDepuracion === true && p.depurado !== true)
    .sort((a, c) => String(a.nombre || '').localeCompare(String(c.nombre || '')));
  if (!ex.length) {
    b.innerHTML = '<p class="dep-sub">No hay productos excluidos. Se agregan con "Sacar de la lista", en los candidatos.</p>';
    return;
  }
  b.innerHTML = '<p class="dep-sub">No se sugieren para depurar, cumplan lo que cumplan.</p>' +
    '<div class="table-wrap"><div class="table-scroll"><table><thead><tr><th>Producto</th><th>Stock</th><th>Excluido</th><th></th></tr></thead><tbody>' +
    ex.map(p => '<tr><td>' + _depLinea(p) + '</td><td>' + _depStock(p) + '</td>' +
      '<td>' + _depFmt(depFecha(p.excluidoDepuracionEn)) + '<div class="dep-sub">' + _depEsc(p.excluidoDepuracionPor || '') + '</div></td>' +
      '<td><button class="btn btn-sm btn-secondary" onclick="depuracionIncluir(\'' + _depEsc(p.id) + '\')">Volver a la lista</button></td></tr>').join('') +
    '</tbody></table></div></div>';
}
function abrirDepExcluidos() {
  _depRenderExcluidos();
  const m = document.getElementById('depExcluidosModal');
  if (m) m.classList.add('show');
}
function cerrarDepExcluidos() {
  const m = document.getElementById('depExcluidosModal');
  if (m) m.classList.remove('show');
}
