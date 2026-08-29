/* =============================================================================
   ESTADÍSTICAS  —  Brotes Dietética
   =============================================================================
   Un mes por vez, con calendario, y separando siempre LOCAL de ONLINE: son dos
   negocios distintos y promediarlos no dice nada útil.

   TRES REGLAS QUE VALE LA PENA TENER PRESENTES:

   1) La facturación se mide en NETO (sin el envío). El flete no es mercadería
      vendida: si entra al total, los meses con muchos envíos parecen mejores de
      lo que fueron. El arqueo de caja hace lo contrario a propósito — ahí el
      flete SÍ cuenta, porque esa plata entró al cajón.

   2) Qué es "online" no se deduce del campo `origen`: las ventas anteriores a
      que ese campo existiera no lo tienen. Se cruza con los pedidos del mes por
      su `ventaId`, así las viejas también quedan bien clasificadas.

   3) El color de cada día del calendario dice CÓMO CERRÓ LA CAJA, no cuánto se
      vendió. El monto va en la barrita de abajo. Mezclar las dos cosas en el
      mismo color hacía que un día flojo y uno con faltante se vieran igual.
   ============================================================================= */

const STATS_ESTADOS = {
  sin_actividad: { color:'#2d333b', etq:'Sin actividad',        desc:'No hubo ventas ni se abrió la caja.' },
  sin_caja:      { color:'#6e7681', etq:'Ventas sin caja',      desc:'Se vendió, pero ese día no se abrió la caja: si la que quedó abierta es la del día anterior, estas ventas entraron a SU arqueo.' },
  /* La leyenda afirmaba que estas ventas "quedaron fuera del arqueo" y muchas veces es
     MENTIRA: cuando se olvidan de cerrar la caja, getCajaAbiertaIdLive le pone a las ventas
     de hoy el cajaId de la caja de ayer y entran al arqueo de ayer. El calendario igual las
     pinta como "sin caja" porque la caja se agrupa por c.fecha (dia de apertura) y las
     ventas por su propia fecha. Arreglar la agrupacion es un cambio grande; mientras tanto
     que el texto no afirme algo falso, que es lo que hace dudar del arqueo del dia anterior. */
  abierta:       { color:'#3b82f6', etq:'Caja abierta',         desc:'La caja se abrió y todavía no se cerró.' },
  exacta:        { color:'#5FA87A', etq:'Cerró exacta',         desc:'Lo contado coincidió con lo esperado.' },
  diferencia_ok: { color:'#EDB833', etq:'Diferencia chica',     desc:'Cerró con una diferencia dentro de la tolerancia configurada.' },
  diferencia:    { color:'#e54545', etq:'Diferencia importante',desc:'Cerró con una diferencia mayor a la tolerancia. Debería tener un motivo cargado.' }
};

let _statsMes = null;          /* 'AAAA-MM' */
let _statsDatos = null;        /* { cajas, ventas, pedidos, porDia } */
let _statsDiaAbierto = null;
let _statsTolerancia = 500;

const _sp = n => '$' + Math.round(Number(n || 0)).toLocaleString('es-AR');

/* ============================ FECHAS ============================ */

function _mesActual() {
  const h = new Date();
  return h.getFullYear() + '-' + String(h.getMonth() + 1).padStart(2, '0');
}
function _mesBounds(mes) {
  const p = mes.split('-');
  const y = Number(p[0]), m = Number(p[1]);
  return { desde: new Date(y, m - 1, 1, 0, 0, 0, 0), hasta: new Date(y, m, 0, 23, 59, 59, 999) };
}
function _mesSumar(mes, n) {
  const p = mes.split('-');
  const d = new Date(Number(p[0]), Number(p[1]) - 1 + n, 1);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}
function _mesLabel(mes) {
  const b = _mesBounds(mes).desde;
  const s = b.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}
/* Firestore devuelve Timestamp, pero un doc recién escrito en la misma sesión
   puede traer todavía un Date. Se contemplan los dos y el {seconds} crudo. */
function _aFecha(f) {
  if (!f) return null;
  if (typeof f.toDate === 'function') return f.toDate();
  if (f instanceof Date) return f;
  if (typeof f.seconds === 'number') return new Date(f.seconds * 1000);
  if (typeof f === 'string') { const d = new Date(f); return isNaN(d) ? null : d; }
  return null;
}
function _diaDe(f) {
  const d = _aFecha(f);
  return d ? ((typeof hoyAR === 'function') ? hoyAR(d) : d.toISOString().slice(0, 10)) : null;
}

/* ============================ CARGA ============================ */

async function loadStats() {
  if (!_statsMes) _statsMes = _mesActual();
  const cont = document.getElementById('statsBody');
  if (cont) cont.innerHTML = '<p style="color:var(--text-dim);font-size:0.88rem;padding:1rem 0">Cargando...</p>';
  try {
    const s = await db.collection('config').doc('cajaConfig').get();
    if (s.exists && s.data().toleranciaDiferencia != null) _statsTolerancia = Number(s.data().toleranciaDiferencia);
  } catch (e) { /* queda el valor por defecto */ }
  /* Token de peticion. statsMesNav escribe _statsMes y dispara loadStats() sin
     esperar, asi que dos clicks rapidos en la flecha de mes dejaban dos cargas en
     vuelo y pintaba la que terminaba ultima, que no es necesariamente la ultima
     que se pidio (el mes que sale del cache local vuelve antes que el que va al
     servidor). Quedaba el titulo de un mes con el calendario y los numeros de
     otro. La respuesta que llega tarde ahora se descarta. */
  const _req = (window._statsReq = (window._statsReq || 0) + 1);
  const _mesPedido = _statsMes;
  const _datos = await cargarDatosMes(_mesPedido);
  if (_req !== window._statsReq || _statsMes !== _mesPedido) return;
  _statsDatos = _datos;
  renderStats();
}

async function cargarDatosMes(mes) {
  const b = _mesBounds(mes);
  const vac = { cajas: [], ventas: [], pedidos: [] };
  const pedir = async (col, campo, desde, hasta, tipo) => {
    try {
      const q = await db.collection(col).where(campo, '>=', desde).where(campo, '<=', hasta).get();
      const out = [];
      q.forEach(d => out.push(Object.assign({ docId: d.id, _tipo: tipo }, d.data())));
      return out;
    } catch (e) { console.warn('stats ' + col + ':', e); return []; }
  };
  const [cajas, vMin, vMay, pedidos] = await Promise.all([
    /* cajas.fecha es el string 'AAAA-MM-DD': el rango se compara alfabéticamente */
    pedir('cajas', 'fecha', mes + '-01', mes + '-31', 'caja'),
    pedir('ventas', 'fecha', b.desde, b.hasta, 'minorista'),
    pedir('ventasMayoristas', 'fecha', b.desde, b.hasta, 'mayorista'),
    pedir('pedidos', 'creadoEn', b.desde, b.hasta, 'pedido')
  ]);
  const d = Object.assign({}, vac, { cajas: cajas, ventas: vMin.concat(vMay), pedidos: pedidos });

  /* Qué venta nació de un pedido web. No alcanza con mirar `origen`: las ventas
     anteriores a ese campo no lo tienen, y quedarían contadas como mostrador. */
  const idsWeb = new Set();
  d.pedidos.forEach(p => { if (p.ventaId) idsWeb.add(p.ventaId); });
  d.ventas.forEach(v => {
    v._online = (v.origen === 'web') || idsWeb.has(v.docId) || !!v.pedidoId;
    v._dia = _diaDe(v.fecha);
    v._neto = (typeof netoVenta === 'function') ? netoVenta(v) : (Number(v.total || 0) - Number(v.envio || 0));
  });
  d.porDia = agruparPorDia(d);
  return d;
}

function agruparPorDia(d) {
  const dias = {};
  const tocar = f => (dias[f] = dias[f] || { fecha:f, ventas:0, count:0, local:0, online:0,
    caja:null, cajas:[], movs:0,
    /* Con que medio se cobro y de que tipo fue cada venta. El panel del dia decia
       "Ventas: 1" y ahi terminaba: para saber QUE se habia vendido y como se
       habia cobrado habia que irse a la seccion de ventas y buscarlo a mano. */
    porMedio:{}, porTipo:{ minorista:{ count:0, total:0 }, mayorista:{ count:0, total:0 } } });
  d.ventas.forEach(v => {
    if (!v._dia) return;
    const x = tocar(v._dia);
    x.ventas += v._neto; x.count++;
    if (v._online) x.online += v._neto; else x.local += v._neto;
    const k = (typeof medioKeyDeVenta === 'function') ? medioKeyDeVenta(v) : 'otro';
    x.porMedio[k] = (x.porMedio[k] || 0) + v._neto;
    const t = (v._tipo === 'mayorista') ? 'mayorista' : 'minorista';
    x.porTipo[t].count++; x.porTipo[t].total += v._neto;
  });
  /* Un mismo dia puede tener DOS cajas: corte de turno, o una que se cerro por error y se
     abrio otra a la tarde. Esto asignaba de a una, asi que la ultima que salia de la
     consulta tapaba a la anterior, y entre dos documentos con la misma fecha el orden lo
     decide el id: al azar. El dia podia quedar pintado de verde "cerro exacta" mientras el
     faltante de $3.000 de la otra caja no aparecia en ninguna parte. Ahora se guardan todas
     y en x.caja queda la PEOR, para que el color del dia y el detalle nunca escondan el
     problema: una caja abierta gana (es lo que hay que ir a resolver) y, si las dos
     cerraron, la de mayor diferencia. */
  d.cajas.forEach(c => {
    if (!c.fecha) return;
    const x = tocar(c.fecha);
    x.cajas.push(c);
    const cAbierta = c.estado === 'abierta', yaAbierta = !!x.caja && x.caja.estado === 'abierta';
    const peor = !x.caja
      || (cAbierta && !yaAbierta)
      || (cAbierta === yaAbierta
          && Math.abs(Number(c.diferencia || 0)) > Math.abs(Number(x.caja.diferencia || 0)));
    if (peor) x.caja = c;
  });
  Object.values(dias).forEach(x => { x.estado = estadoDelDia(x); });
  return dias;
}

/* El color del día. Se separa "cerró exacta" de "cerró con diferencia chica"
   porque son dos mensajes distintos: uno es que está todo bien y el otro que hay
   algo suelto, aunque sea poco. */
function estadoDelDia(x) {
  const c = x.caja;
  if (!c) return x.count ? 'sin_caja' : 'sin_actividad';
  if (c.estado === 'abierta') return 'abierta';
  const dif = Math.abs(Number(c.diferencia || 0));
  if (dif === 0) return 'exacta';
  return dif <= _statsTolerancia ? 'diferencia_ok' : 'diferencia';
}

/* ============================ TOTALES ============================ */

function totalesMes(d) {
  const t = {
    facturado:0, count:0, local:0, localCount:0, online:0, onlineCount:0,
    envios:0, descuentos:0, porMedio:{}, productos:{},
    pedidosRecibidos:d.pedidos.length, pedidosConfirmados:0, pedidosCancelados:0,
    diasConVenta:0, diasCajaCerrada:0, diferenciaAcumulada:0, diasConDiferencia:0
  };
  d.ventas.forEach(v => {
    t.facturado += v._neto; t.count++;
    if (v._online) { t.online += v._neto; t.onlineCount++; } else { t.local += v._neto; t.localCount++; }
    t.envios += Number(v.envio || 0);
    t.descuentos += Number(v.descuentoMonto || 0);
    const k = (typeof medioKeyDeVenta === 'function') ? medioKeyDeVenta(v) : 'otro';
    t.porMedio[k] = (t.porMedio[k] || 0) + v._neto;
    (v.items || []).forEach(i => {
      if (!i || !i.nombre) return;
      const p = (t.productos[i.nombre] = t.productos[i.nombre] || { unidades:0, gramos:0, monto:0 });
      /* Un producto a granel vende GRAMOS y uno normal UNIDADES. Sumarlos en el mismo
         contador ponia a cualquier granel arriba de todo con numeros de cuatro cifras:
         300 g de nueces figuraban como "300u", encima de un producto que se vendio de a 2.
         El ORDEN del ranking siempre fue por monto y estaba bien; lo unico mal era como se
         decia la cantidad. */
      if (i.tipoVenta === 'peso') p.gramos += Number(i.cantidad || 0);
      else p.unidades += Number(i.cantidad || 0);
      p.monto += Number(i.subtotal || 0);
    });
  });
  d.pedidos.forEach(p => {
    /* 'entregado' es el estado FINAL normal de un pedido que se cumplio, y estaba
       afuera de la cuenta: cada pedido entregado se caia del contador de confirmados y
       aparecia como "Sin resolver" en amarillo, hundiendo la conversion justo cuando el
       negocio funciona bien. ('cancelado' no lo escribe ningun flujo hoy -es rama
       muerta, inofensiva- y se deja por si alguna vez se agrega cancelar.) */
    if (p.estado === 'confirmado' || p.estado === 'entregado') t.pedidosConfirmados++;
    else if (p.estado === 'cancelado') t.pedidosCancelados++;
  });
  Object.values(d.porDia).forEach(x => {
    if (x.count) t.diasConVenta++;
    if (x.caja && x.caja.estado === 'cerrada') {
      t.diasCajaCerrada++;
      const dif = Number(x.caja.diferencia || 0);
      t.diferenciaAcumulada += dif;
      if (dif !== 0) t.diasConDiferencia++;
    }
  });
  t.ticket = t.count ? t.facturado / t.count : 0;
  t.ticketLocal = t.localCount ? t.local / t.localCount : 0;
  t.ticketOnline = t.onlineCount ? t.online / t.onlineCount : 0;
  t.conversion = t.pedidosRecibidos ? (t.pedidosConfirmados / t.pedidosRecibidos) * 100 : 0;
  return t;
}

/* ============================ RENDER ============================ */

async function renderStats() {
  const cont = document.getElementById('statsBody');
  if (!cont || !_statsDatos) return;
  const t = totalesMes(_statsDatos);
  const lbl = document.getElementById('statsMesLabel');
  if (lbl) lbl.textContent = _mesLabel(_statsMes);
  const btnSig = document.getElementById('statsMesSig');
  if (btnSig) btnSig.disabled = _statsMes >= _mesActual();

  cont.innerHTML =
    renderKpis(t) +
    '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(330px,1fr));gap:1rem;margin-top:1rem">' +
      renderCalendario(t) + renderDetalleDia() +
    '</div>' +
    '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(330px,1fr));gap:1rem;margin-top:1rem">' +
      renderMedios(t) + renderOnline(t) + renderTopProductos(t) +
    '</div>';

  renderComparativa(t);
}

function _card(titulo, cuerpo, extra) {
  return '<div class="card" style="padding:1.15rem 1.25rem;' + (extra || '') + '">' +
    '<h3 style="font-size:0.92rem;font-weight:700;margin-bottom:0.85rem">' + titulo + '</h3>' + cuerpo + '</div>';
}
function _fila(etq, val, color) {
  return '<div style="display:flex;justify-content:space-between;gap:1rem;padding:0.4rem 0;font-size:0.88rem;border-bottom:1px solid rgba(255,255,255,0.04)">' +
    '<span style="color:var(--text-dim)">' + etq + '</span>' +
    '<span style="font-weight:600;white-space:nowrap' + (color ? ';color:' + color : '') + '">' + val + '</span></div>';
}

function renderKpis(t) {
  const kpi = (etq, val, sub, color) =>
    '<div class="card" style="padding:1.1rem 1.2rem">' +
      '<div style="font-size:0.74rem;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.6px;font-weight:600;margin-bottom:0.35rem">' + etq + '</div>' +
      '<div style="font-size:1.5rem;font-weight:800;line-height:1.1' + (color ? ';color:' + color : '') + '">' + val + '</div>' +
      (sub ? '<div style="font-size:0.78rem;color:var(--text-dim);margin-top:0.25rem">' + sub + '</div>' : '') +
    '</div>';
  return '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:1rem">' +
    kpi('Facturado en el mes', _sp(t.facturado), t.count + ' venta' + (t.count === 1 ? '' : 's') + ' · sin contar envíos') +
    kpi('Local (mostrador)', _sp(t.local), t.localCount + ' venta' + (t.localCount === 1 ? '' : 's') + ' · ticket ' + _sp(t.ticketLocal)) +
    kpi('Online (web)', _sp(t.online), t.onlineCount + ' venta' + (t.onlineCount === 1 ? '' : 's') + ' · ticket ' + _sp(t.ticketOnline)) +
    kpi('Ticket promedio', _sp(t.ticket), t.diasConVenta + ' día' + (t.diasConVenta === 1 ? '' : 's') + ' con ventas') +
  '</div>';
}

function renderCalendario(t) {
  const b = _mesBounds(_statsMes);
  const primerDia = (b.desde.getDay() + 6) % 7;   /* lunes = 0 */
  const ultimo = b.hasta.getDate();
  const maxVenta = Math.max(1, ...Object.values(_statsDatos.porDia).map(x => x.ventas));
  const hoy = (typeof hoyAR === 'function') ? hoyAR() : '';

  let celdas = '';
  for (let i = 0; i < primerDia; i++) celdas += '<div></div>';
  for (let n = 1; n <= ultimo; n++) {
    const f = _statsMes + '-' + String(n).padStart(2, '0');
    const x = _statsDatos.porDia[f] || { fecha:f, ventas:0, count:0, estado:'sin_actividad' };
    const est = STATS_ESTADOS[x.estado];
    const pct = x.ventas > 0 ? Math.max(8, Math.round((x.ventas / maxVenta) * 100)) : 0;
    const esHoy = f === hoy;
    const sel = _statsDiaAbierto === f;
    celdas +=
      '<button type="button" onclick="statsVerDia(\'' + f + '\')" ' +
        'title="' + n + ' · ' + est.etq + (x.count ? ' · ' + _sp(x.ventas) + ' en ' + x.count + ' venta' + (x.count === 1 ? '' : 's') : '') + '" ' +
        /* aspect-ratio sin tope hacia celdas de 120px en pantalla ancha: un calendario
       gigante y casi vacio. Con max-height la celda deja de crecer y queda
       apaisada, que es como se ve un mes en cualquier calendario. */
      'style="position:relative;aspect-ratio:1;max-height:58px;min-height:38px;border-radius:7px;cursor:pointer;padding:0;overflow:hidden;' +
        'background:' + est.color + ';border:' + (sel ? '2px solid #fff' : esHoy ? '2px solid var(--accent-light)' : '1px solid rgba(255,255,255,0.07)') + ';' +
        'color:' + (x.estado === 'sin_actividad' ? 'var(--text-dim)' : '#0b1210') + ';font-weight:700;font-size:0.76rem">' +
        '<span style="position:absolute;top:3px;left:5px">' + n + '</span>' +
        (pct ? '<span style="position:absolute;left:0;bottom:0;height:4px;width:' + pct + '%;background:rgba(0,0,0,0.42)"></span>' : '') +
      '</button>';
  }

  const leyenda = Object.keys(STATS_ESTADOS).map(k => {
    const e = STATS_ESTADOS[k];
    return '<div style="display:flex;align-items:flex-start;gap:0.5rem;font-size:0.76rem;line-height:1.45">' +
      '<span style="width:11px;height:11px;border-radius:3px;background:' + e.color + ';flex:0 0 auto;margin-top:3px;border:1px solid rgba(255,255,255,0.1)"></span>' +
      '<span><b style="color:var(--text-main)">' + e.etq + '</b> <span style="color:var(--text-dim)">— ' + e.desc + '</span></span></div>';
  }).join('');

  return _card('Calendario del mes',
    '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:5px;margin-bottom:0.5rem">' +
      ['L','M','M','J','V','S','D'].map(d => '<div style="text-align:center;font-size:0.68rem;color:var(--text-dim);font-weight:700">' + d + '</div>').join('') +
    '</div>' +
    '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:5px">' + celdas + '</div>' +
    '<p style="font-size:0.74rem;color:var(--text-dim);margin:0.9rem 0 0.6rem;line-height:1.5">' +
      'El <b>color</b> dice cómo cerró la caja ese día. La <b>barrita de abajo</b> es cuánto se vendió, ' +
      'comparado con el mejor día del mes. Haga clic en un día para ver el detalle.</p>' +
    '<div style="display:grid;gap:0.4rem;border-top:1px solid var(--border);padding-top:0.75rem">' + leyenda + '</div>');
}

function renderDetalleDia() {
  if (!_statsDiaAbierto) {
    return _card('Detalle del día',
      '<p style="font-size:0.85rem;color:var(--text-dim);line-height:1.55">Tocá un día del calendario para ver ' +
      'qué se vendió, cómo se cobró y cómo cerró la caja.</p>');
  }
  const f = _statsDiaAbierto;
  const x = _statsDatos.porDia[f];
  const est = STATS_ESTADOS[(x && x.estado) || 'sin_actividad'];
  const dd = new Date(f + 'T12:00:00');
  const titulo = dd.toLocaleDateString('es-AR', { weekday:'long', day:'numeric', month:'long' });

  if (!x || (!x.count && !x.caja)) {
    return _card(titulo.charAt(0).toUpperCase() + titulo.slice(1),
      '<p style="font-size:0.85rem;color:var(--text-dim)">Sin ventas ni caja ese día.</p>');
  }
  const c = x.caja;
  let cuerpo =
    '<div style="display:inline-flex;align-items:center;gap:0.45rem;background:rgba(255,255,255,0.05);border-radius:20px;padding:0.25rem 0.7rem;margin-bottom:0.85rem;font-size:0.78rem;font-weight:600">' +
      '<span style="width:9px;height:9px;border-radius:50%;background:' + est.color + '"></span>' + est.etq + '</div>' +
    _fila('Facturado (sin envíos)', _sp(x.ventas)) +
    _fila('Ventas', String(x.count)) +
    _detalleVentasDelDia(f, x);
  if (c) {
    cuerpo += '<div style="margin-top:0.9rem;padding-top:0.7rem;border-top:1px solid var(--border)">' +
      '<div style="font-size:0.78rem;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.5px;font-weight:700;margin-bottom:0.4rem">Caja #' + String(c.numero || 0).padStart(4, '0') + '</div>' +
      _fila('Fondo inicial', _sp(c.montoInicial));
    if (c.estado === 'cerrada') {
      const dif = Number(c.diferencia || 0);
      cuerpo +=
        _fila('Esperado en efectivo', _sp(c.esperadoEfectivo)) +
        _fila('Contado', _sp(c.contadoEfectivo)) +
        _fila('Diferencia', (dif > 0 ? '+' : '') + _sp(dif), dif === 0 ? '#5FA87A' : (Math.abs(dif) <= _statsTolerancia ? '#EDB833' : '#e54545')) +
        (c.totalIngresos ? _fila('Ingresos', '+ ' + _sp(c.totalIngresos)) : '') +
        (c.totalEgresos ? _fila('Egresos', '− ' + _sp(c.totalEgresos)) : '') +
        (c.motivoDiferencia ? '<p style="font-size:0.8rem;color:var(--text-dim);margin-top:0.6rem;line-height:1.5"><b>Motivo:</b> ' + esc(c.motivoDiferencia) + '</p>' : '') +
        (c.observaciones ? '<p style="font-size:0.8rem;color:var(--text-dim);margin-top:0.3rem;line-height:1.5"><b>Obs:</b> ' + esc(c.observaciones) + '</p>' : '');
    } else {
      cuerpo += '<p style="font-size:0.82rem;color:var(--text-dim);margin-top:0.5rem">Todavía sin cerrar.</p>';
    }
    cuerpo += '</div>';
  } else if (x.count) {
    cuerpo += '<p style="font-size:0.82rem;color:#EDB833;margin-top:0.85rem;line-height:1.5">' +
      'Hubo ventas pero no se abrió la caja, así que ese día no tiene arqueo.</p>';
  }
  return _card(titulo.charAt(0).toUpperCase() + titulo.slice(1), cuerpo);
}

/* Todo lo que se sabe de las ventas de ese dia: cuantas de cada tipo, con que
   medio se cobraron, y el boton para verlas una por una. Antes el panel mostraba
   el total y la cantidad, y nada mas. */
const _STATS_MEDIOS = { efectivo:'Efectivo', tarjeta:'Tarjeta', transferencia:'Transferencia',
                        cuenta_corriente:'Cuenta corriente', otro:'Otro' };

function _detalleVentasDelDia(f, x) {
  if (!x.count) {
    return _fila('Mostrador', _sp(x.local)) + _fila('Web', _sp(x.online));
  }
  const pt = x.porTipo || { minorista:{count:0,total:0}, mayorista:{count:0,total:0} };
  const nV = n => n + (n === 1 ? ' venta' : ' ventas');
  const sub = (etq, val) =>
    '<div style="display:flex;justify-content:space-between;gap:1rem;padding:0.28rem 0;font-size:0.82rem">' +
      '<span style="color:var(--text-dim);padding-left:0.9rem">· ' + etq + '</span>' +
      '<span style="font-weight:600;white-space:nowrap">' + val + '</span></div>';

  let t = '';
  if (pt.minorista.count) t += sub('Minorista - ' + nV(pt.minorista.count), _sp(pt.minorista.total));
  if (pt.mayorista.count) t += sub('Mayorista - ' + nV(pt.mayorista.count), _sp(pt.mayorista.total));
  t += _fila('Mostrador', _sp(x.local)) + _fila('Web', _sp(x.online));

  const medios = Object.keys(x.porMedio || {}).filter(k => x.porMedio[k] > 0)
    .sort((a, b) => x.porMedio[b] - x.porMedio[a]);
  if (medios.length) {
    t += '<div style="margin-top:0.7rem;padding-top:0.55rem;border-top:1px solid var(--border)">' +
      '<div style="font-size:0.72rem;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.5px;font-weight:700;margin-bottom:0.25rem">Cómo se cobró</div>' +
      medios.map(k => sub(_STATS_MEDIOS[k] || k, _sp(x.porMedio[k]))).join('') +
      '</div>';
  }
  t += '<div style="display:flex;justify-content:flex-end;margin-top:0.7rem">' +
    '<button class="btn btn-secondary" style="width:auto;flex:0 0 auto;padding:0.32rem 0.8rem;font-size:0.79rem" ' +
    'onclick="statsVerVentasDelDia(\'' + f + '\')">' +
    '<i class="bi bi-list-ul"></i> Ver ' + (x.count === 1 ? 'la venta' : 'las ' + x.count + ' ventas') + '</button></div>';
  return t;
}

/* Abre el mismo dialogo que usa la caja, con las ventas de ESTE dia. */
function statsVerVentasDelDia(f) {
  if (!_statsDatos || typeof abrirVentasDetalle !== 'function') return;
  const dd = new Date(f + 'T12:00:00');
  const titulo = 'Ventas del ' + dd.toLocaleDateString('es-AR', { day:'numeric', month:'long' });
  abrirVentasDetalle(titulo, _statsDatos.ventas.filter(v => v._dia === f));
}

function statsVerDia(f) {
  _statsDiaAbierto = (_statsDiaAbierto === f) ? null : f;
  renderStats();
}

function renderMedios(t) {
  const nombres = { efectivo:'Efectivo', tarjeta:'Tarjeta', transferencia:'Transferencia', cuenta_corriente:'Cuenta corriente', otro:'Otro' };
  const keys = Object.keys(t.porMedio).filter(k => t.porMedio[k] > 0).sort((a, b) => t.porMedio[b] - t.porMedio[a]);
  if (!keys.length) return _card('Cómo cobraron', '<p style="font-size:0.85rem;color:var(--text-dim)">Sin ventas este mes.</p>');
  const total = keys.reduce((s, k) => s + t.porMedio[k], 0) || 1;
  const filas = keys.map(k => {
    const pct = Math.round((t.porMedio[k] / total) * 100);
    return '<div style="margin-bottom:0.6rem">' +
      '<div style="display:flex;justify-content:space-between;font-size:0.85rem;margin-bottom:0.2rem">' +
        '<span>' + (nombres[k] || k) + '</span>' +
        '<span style="font-weight:600">' + _sp(t.porMedio[k]) + ' <span style="color:var(--text-dim);font-weight:400">' + pct + '%</span></span></div>' +
      '<div style="height:6px;background:rgba(255,255,255,0.07);border-radius:3px;overflow:hidden">' +
        '<div style="height:100%;width:' + pct + '%;background:var(--accent)"></div></div></div>';
  }).join('');
  return _card('Cómo cobraron', filas +
    (t.porMedio.cuenta_corriente ? '<p style="font-size:0.76rem;color:var(--text-dim);margin-top:0.5rem;line-height:1.45">' +
      'La cuenta corriente está facturada pero todavía no cobrada.</p>' : ''));
}

function renderOnline(t) {
  const pendientes = t.pedidosRecibidos - t.pedidosConfirmados - t.pedidosCancelados;
  return _card('Tienda online',
    _fila('Pedidos recibidos', String(t.pedidosRecibidos)) +
    _fila('Confirmados', String(t.pedidosConfirmados), '#5FA87A') +
    _fila('Sin resolver', String(pendientes > 0 ? pendientes : 0), pendientes > 0 ? '#EDB833' : null) +
    _fila('Cancelados', String(t.pedidosCancelados), t.pedidosCancelados ? '#e54545' : null) +
    _fila('Se convirtieron en venta', t.conversion.toFixed(0) + '%') +
    _fila('Cobrado por envíos', _sp(t.envios)) +
    _fila('Descuentos otorgados', _sp(t.descuentos)) +
    '<p style="font-size:0.76rem;color:var(--text-dim);margin-top:0.6rem;line-height:1.45">' +
      'Los envíos se muestran aparte: no son mercadería vendida, por eso no entran al facturado.</p>');
}

/* "300 g" / "1,5 kg" / "2u", y los dos juntos si el mismo nombre se vendio de las dos
   formas (pasa si al producto le cambiaron la forma de venta a mitad de mes). */
function _cantTop(p) {
  const partes = [];
  const g = Number(p.gramos || 0);
  if (g) partes.push(g < 1000
    ? g.toLocaleString('es-AR') + ' g'
    : (g / 1000).toLocaleString('es-AR', { maximumFractionDigits: 3 }) + ' kg');
  if (p.unidades) partes.push(p.unidades + 'u');
  return partes.join(' + ') || '—';
}

function renderTopProductos(t) {
  const arr = Object.keys(t.productos).map(n => Object.assign({ nombre:n }, t.productos[n]))
    .sort((a, b) => b.monto - a.monto).slice(0, 8);
  if (!arr.length) return _card('Lo que más se vendió', '<p style="font-size:0.85rem;color:var(--text-dim)">Sin ventas este mes.</p>');
  return _card('Lo que más se vendió',
    arr.map((p, i) =>
      '<div style="display:flex;gap:0.6rem;align-items:baseline;padding:0.35rem 0;font-size:0.85rem;border-bottom:1px solid rgba(255,255,255,0.04)">' +
        '<span style="color:var(--text-dim);font-size:0.75rem;width:1.1rem;flex:0 0 auto">' + (i + 1) + '</span>' +
        '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(p.nombre) + '</span>' +
        '<span style="color:var(--text-dim);font-size:0.76rem;white-space:nowrap">' + _cantTop(p) + '</span>' +
        '<span style="font-weight:600;white-space:nowrap">' + _sp(p.monto) + '</span></div>').join(''));
}

/* La comparación con el mes anterior se carga aparte para no demorar la pantalla:
   es un dato de contexto, no el contenido principal. */
async function renderComparativa(t) {
  const cont = document.getElementById('statsComparativa');
  if (!cont) return;
  const mesPrev = _mesSumar(_statsMes, -1);
  /* renderStats() termina siempre aca, y statsVerDia() llama a renderStats(): tocar un
     dia del calendario volvia a bajar el mes anterior COMPLETO del servidor (cuatro
     consultas), asi que revisar los 30 dias del mes costaba 30 recargas y la tarjeta
     parpadeaba en "Comparando..." para terminar mostrando el mismo numero. El mes previo
     solo puede cambiar cuando se recarga el mes actual (loadStats reemplaza _statsDatos
     por un objeto nuevo) o cuando se navega de mes, y las dos cosas se detectan con la
     clave de abajo. */
  let prev = (window._statsPrevCache
    && window._statsPrevCache.mes === mesPrev
    && window._statsPrevCache.base === _statsDatos) ? window._statsPrevCache.datos : null;
  if (!prev) {
    cont.innerHTML = '<span style="font-size:0.8rem;color:var(--text-dim)">Comparando con el mes anterior...</span>';
    prev = await cargarDatosMes(mesPrev);
    window._statsPrevCache = { mes: mesPrev, base: _statsDatos, datos: prev };
  }
  const p = totalesMes(prev);
  const delta = (hoy, antes, etq, fmt) => {
    if (!antes && !hoy) return '';
    const dif = antes ? ((hoy - antes) / antes) * 100 : 100;
    const sube = hoy >= antes;
    const col = sube ? '#5FA87A' : '#e54545';
    const f = fmt || _sp;
    return '<div style="display:flex;align-items:baseline;gap:0.5rem;font-size:0.85rem;padding:0.3rem 0">' +
      '<span style="color:var(--text-dim);flex:1">' + etq + '</span>' +
      '<span style="color:var(--text-dim);font-size:0.78rem">' + f(antes) + ' →</span>' +
      '<span style="font-weight:700">' + f(hoy) + '</span>' +
      '<span style="color:' + col + ';font-weight:700;font-size:0.78rem;white-space:nowrap">' +
        '<i class="bi bi-arrow-' + (sube ? 'up' : 'down') + '-short"></i>' +
        Math.abs(dif).toFixed(0) + '%</span></div>';
  };
  const nDias = Object.values(prev.porDia).filter(x => x.count).length;
  cont.innerHTML = _card('Contra ' + _mesLabel(_mesSumar(_statsMes, -1)),
    delta(t.facturado, p.facturado, 'Facturado') +
    delta(t.local, p.local, 'Local') +
    delta(t.online, p.online, 'Online') +
    delta(t.count, p.count, 'Cantidad de ventas', n => String(n)) +
    delta(t.ticket, p.ticket, 'Ticket promedio') +
    (nDias ? '' : '<p style="font-size:0.78rem;color:var(--text-dim);margin-top:0.5rem">El mes anterior no tiene ventas cargadas, así que la comparación no dice mucho.</p>'));
}

/* ============================ NAVEGACIÓN ============================ */

function statsMesNav(n) {
  const destino = _mesSumar(_statsMes, n);
  if (destino > _mesActual()) return;      /* el futuro no tiene datos */
  _statsMes = destino;
  _statsDiaAbierto = null;
  loadStats();
}
function statsIrHoy() {
  _statsMes = _mesActual();
  _statsDiaAbierto = (typeof hoyAR === 'function') ? hoyAR() : null;
  loadStats();
}
