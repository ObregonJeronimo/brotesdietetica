/* =============================================================================
   ALERTAS  —  Brotes Dietética
   =============================================================================
   La campana de la barra superior. Junta en un solo lugar las cosas que hay que
   ir a resolver y que, hasta ahora, solo se veían entrando a la sección donde
   estaban: el stock en cero no avisaba en ninguna parte, y el aviso de insumos
   bajos aparecía como un cartel flotante solo al abrir Insumos.

   DOS DECISIONES:

   1) Se calcula al abrir, no en un intervalo. El panel ya tiene los productos
      cargados en memoria (allProducts), así que lo único que cuesta una lectura
      son los insumos, y se piden una sola vez por sesión salvo que se refresque
      a mano. Un polling cada X minutos sobre una cuenta de Firebase que se paga
      por lectura no se justifica para algo que el usuario mira cuando quiere.

   2) El umbral de "stock bajo" de productos es GLOBAL y vive acá. Los insumos
      tienen su propio stockMinimo por ítem, pero los productos no tienen ese
      campo: son cientos y nadie va a cargarle un mínimo a cada uno. Cuando haga
      falta afinarlo por producto, el lugar es el catálogo, no este archivo.
   ============================================================================= */

const ALERTAS_STOCK_BAJO = 5;      /* productos con 1..5 unidades */
const ALERTAS_MAX_ITEMS = 8;       /* cuántos nombres se listan por alerta */

let _alertas = [];
let _alertasPanel = null;
let _insumosAlertaCache = null;    /* se pide una vez por sesión */

/* ============================ CÁLCULO ============================ */

async function _insumosParaAlertas(forzar) {
  /* Acá antes se reusaba insumosData cuando tenía elementos, tomando `.length`
     como señal de "ya está cargada". Estaba mal: al borrar el ÚLTIMO insumo esa
     lista queda vacía, la condición da falso, se caía al cache propio —que
     todavía tenía el insumo borrado— y la alerta seguía mostrándolo.
     Ahora hay un solo camino y un solo cache, que se invalida a mano cuando algo
     cambia. Insumos es una colección chica; la lectura de más no se nota. */
  if (!forzar && _insumosAlertaCache) return _insumosAlertaCache;
  try {
    const snap = await db.collection('insumos').get();
    _insumosAlertaCache = snap.docs.map(d => Object.assign({ id: d.id }, d.data()));
  } catch (e) {
    console.warn('alertas/insumos:', e);
    _insumosAlertaCache = [];
  }
  return _insumosAlertaCache;
}

async function calcularAlertas(forzar) {
  const out = [];

  /* --- La caja quedó abierta de un día anterior -------------------------
     Va primero y como crítica porque es la que se agrava sola: mientras siga
     así, todo lo que se venda hoy entra al arqueo de ayer. */
  try {
    if (typeof cajaActual !== 'undefined' && cajaActual && cajaActual.estado === 'abierta' &&
        typeof hoyAR === 'function' && cajaActual.fecha && cajaActual.fecha !== hoyAR()) {
      out.push({
        id: 'caja-vieja', nivel: 'critico', icono: 'bi-cash-stack',
        titulo: 'La caja quedó abierta del ' + cajaActual.fecha,
        detalle: 'Todo lo que se venda hoy entra al arqueo de ese día. Conviene cerrarla.',
        items: [], seccion: 'caja'
      });
    }
  } catch (e) { console.warn('alertas/caja:', e); }

  /* --- Productos ---------------------------------------------------------
     Los ocultos no entran: no están a la venta, así que su stock no es un
     problema que haya que resolver hoy. */
  try {
    const prods = (typeof allProducts !== 'undefined' && allProducts) ? allProducts : [];
    const aLaVenta = prods.filter(p => p && p.oculto !== true);

    const sinStock = aLaVenta.filter(p => Number(p.stock || 0) <= 0);
    if (sinStock.length) {
      out.push({
        id: 'sin-stock', nivel: 'critico', icono: 'bi-x-octagon',
        titulo: sinStock.length + (sinStock.length === 1 ? ' producto sin stock' : ' productos sin stock'),
        detalle: 'Están publicados en la tienda y no se pueden vender.',
        items: sinStock.map(p => p.nombre || '(sin nombre)'), seccion: 'stock'
      });
    }

    const bajos = aLaVenta.filter(p => {
      const s = Number(p.stock || 0);
      return s > 0 && s <= ALERTAS_STOCK_BAJO;
    });
    if (bajos.length) {
      out.push({
        id: 'stock-bajo', nivel: 'aviso', icono: 'bi-exclamation-triangle',
        titulo: bajos.length + (bajos.length === 1 ? ' producto con poco stock' : ' productos con poco stock'),
        detalle: 'Queda' + (bajos.length === 1 ? '' : 'n') + ' ' + ALERTAS_STOCK_BAJO + ' unidades o menos.',
        items: bajos
          .sort((a, b) => Number(a.stock || 0) - Number(b.stock || 0))
          .map(p => (p.nombre || '(sin nombre)') + ' · ' + Number(p.stock || 0)),
        seccion: 'stock'
      });
    }
  } catch (e) { console.warn('alertas/productos:', e); }

  /* --- Insumos: acá sí hay un mínimo por ítem, cargado a mano ----------- */
  try {
    const insumos = await _insumosParaAlertas(forzar);
    const bajos = insumos.filter(i => Number(i.stockActual || 0) <= Number(i.stockMinimo || 0));
    if (bajos.length) {
      out.push({
        id: 'insumos-bajos', nivel: 'aviso', icono: 'bi-tools',
        titulo: bajos.length + (bajos.length === 1 ? ' insumo bajo el mínimo' : ' insumos bajo el mínimo'),
        detalle: 'Bolsas, etiquetas y todo lo que no se vende pero hace falta para vender.',
        items: bajos.map(i => (i.nombre || '(sin nombre)') +
          ' · ' + Number(i.stockActual || 0) + ' de ' + Number(i.stockMinimo || 0)),
        seccion: 'insumos'
      });
    }
  } catch (e) { console.warn('alertas/insumos:', e); }

  _alertas = out;
  return out;
}

/* ============================ BADGE ============================ */

function _pintarBadge() {
  const b = document.getElementById('alertasBadge');
  const btn = document.getElementById('alertasBtn');
  if (!b || !btn) return;
  const criticas = _alertas.filter(a => a.nivel === 'critico').length;
  const total = _alertas.length;
  if (!total) {
    b.style.display = 'none';
    btn.setAttribute('aria-label', 'Alertas: no hay nada pendiente');
    btn.classList.remove('tiene-criticas');
    return;
  }
  b.style.display = '';
  b.textContent = total > 9 ? '9+' : String(total);
  btn.classList.toggle('tiene-criticas', criticas > 0);
  btn.setAttribute('aria-label', 'Alertas: ' + total + ' pendiente' + (total !== 1 ? 's' : ''));
}

/* La llaman loadProducts() y loadCaja() al terminar, y con forzar=true todo lo
   que crea, edita o borra un producto o un insumo. Sin ese forzar, una alerta
   sigue mostrando lo que ya se resolvió hasta que se recargue la página. */
async function actualizarBadgeAlertas(forzar) {
  try { await calcularAlertas(forzar); _pintarBadge(); }
  catch (e) { console.warn('alertas:', e); }
}

/* ============================ PANEL ============================ */

function cerrarAlertas() {
  if (_alertasPanel) { _alertasPanel.remove(); _alertasPanel = null; }
  const btn = document.getElementById('alertasBtn');
  if (btn) btn.setAttribute('aria-expanded', 'false');
  document.removeEventListener('mousedown', _alertasFuera, true);
  document.removeEventListener('keydown', _alertasEsc, true);
  window.removeEventListener('resize', cerrarAlertas);
  window.removeEventListener('scroll', cerrarAlertas, true);
}
function _alertasFuera(e) {
  const btn = document.getElementById('alertasBtn');
  if (_alertasPanel && !_alertasPanel.contains(e.target) && !(btn && btn.contains(e.target))) cerrarAlertas();
}
function _alertasEsc(e) { if (e.key === 'Escape') cerrarAlertas(); }

async function toggleAlertas(ev) {
  if (ev) ev.stopPropagation();
  if (_alertasPanel) { cerrarAlertas(); return; }

  const btn = document.getElementById('alertasBtn');
  const panel = document.createElement('div');
  panel.className = 'alertas-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Alertas');
  panel.innerHTML = '<div class="alertas-head"><span>Alertas</span>' +
    '<button type="button" class="alertas-refresh" title="Volver a revisar" aria-label="Volver a revisar">' +
    '<i class="bi bi-arrow-clockwise"></i></button></div>' +
    '<div class="alertas-body"><p class="alertas-vacio">Revisando...</p></div>';
  document.body.appendChild(panel);
  _alertasPanel = panel;
  if (btn) btn.setAttribute('aria-expanded', 'true');
  _ubicarPanelAlertas();

  document.addEventListener('mousedown', _alertasFuera, true);
  document.addEventListener('keydown', _alertasEsc, true);
  window.addEventListener('resize', cerrarAlertas);
  window.addEventListener('scroll', cerrarAlertas, true);

  panel.querySelector('.alertas-refresh').addEventListener('click', async () => {
    panel.querySelector('.alertas-body').innerHTML = '<p class="alertas-vacio">Revisando...</p>';
    await calcularAlertas(true);   /* refresco a mano: se vuelve a pedir todo */
    _pintarBadge();
    _pintarPanel();
  });

  await calcularAlertas();
  _pintarBadge();
  _pintarPanel();
}

/* Igual que el menú del historial de cajas: position:fixed y montado en <body>.
   La barra superior es sticky y tiene su propio contexto de apilado, así que un
   panel absolute adentro queda por debajo del contenido al hacer scroll. */
function _ubicarPanelAlertas() {
  const btn = document.getElementById('alertasBtn');
  if (!btn || !_alertasPanel) return;
  const r = btn.getBoundingClientRect();
  const ancho = _alertasPanel.offsetWidth;
  _alertasPanel.style.top = (r.bottom + 8) + 'px';
  _alertasPanel.style.left = Math.max(8, Math.min(r.right - ancho, window.innerWidth - ancho - 8)) + 'px';
}

function _pintarPanel() {
  if (!_alertasPanel) return;
  const body = _alertasPanel.querySelector('.alertas-body');
  if (!_alertas.length) {
    body.innerHTML = '<p class="alertas-vacio"><i class="bi bi-check2-circle"></i>No hay nada pendiente.</p>';
    _ubicarPanelAlertas();
    return;
  }
  body.innerHTML = _alertas.map(a => {
    const extra = a.items.length > ALERTAS_MAX_ITEMS
      ? '<li class="alertas-mas">y ' + (a.items.length - ALERTAS_MAX_ITEMS) + ' más</li>' : '';
    const lista = a.items.length
      ? '<ul class="alertas-items">' +
        a.items.slice(0, ALERTAS_MAX_ITEMS).map(t => '<li>' + esc(t) + '</li>').join('') +
        extra + '</ul>'
      : '';
    return '<div class="alertas-item ' + a.nivel + '" data-sec="' + _attrA(a.seccion) + '" role="button" tabindex="0">' +
      '<i class="bi ' + a.icono + ' alertas-ico"></i>' +
      '<div class="alertas-txt">' +
        '<div class="alertas-titulo">' + esc(a.titulo) + '</div>' +
        '<div class="alertas-detalle">' + esc(a.detalle) + '</div>' +
        lista +
      '</div>' +
      '<i class="bi bi-chevron-right alertas-chev"></i>' +
    '</div>';
  }).join('');

  body.querySelectorAll('.alertas-item').forEach(el => {
    const ir = () => {
      const sec = el.getAttribute('data-sec');
      cerrarAlertas();
      if (sec && typeof switchSection === 'function') switchSection(sec);
    };
    el.addEventListener('click', ir);
    el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ir(); } });
  });
  _ubicarPanelAlertas();
}

/* esc() no escapa comillas y acá el valor va dentro de un atributo. */
function _attrA(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
