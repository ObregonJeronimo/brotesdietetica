/* =============================================================================
   DEUDAS CON PROVEEDORES  —  Brotes Dietética
   =============================================================================
   UNA DEUDA ES UNA COMPRA SIN SALDAR. No hay colección aparte.

   Todo lo que hay que mostrar de una deuda -el monto, los productos, las
   cantidades- ya está adentro de la compra. Copiarlo a otro lado sería tener dos
   versiones del mismo dato esperando a desincronizarse, que es exactamente el
   problema que más veces hubo que arreglar en este panel. Además `compras` ya
   tiene su regla en Firestore, así que no hace falta tocar permisos.

   NO ES UN SÍ/NO, ES UN MONTO

   A un proveedor se le paga en partes todo el tiempo: se deben $200.000, se le
   dan $80.000 ahora y el resto a fin de mes. Un booleano no puede decir eso. Por
   eso la compra guarda `pagado` -cuánto se lleva pagado- y `pagos` -cada pago con
   su fecha, su monto y su medio-. El estado sale de la resta, no se guarda.

   POR QUÉ EXISTE `saldada` SI EL ESTADO SE CALCULA

   Firestore no sabe comparar dos campos del mismo documento, así que no se puede
   pedir "las compras donde pagado < total". Y hace falta pedirlo: las deudas NO
   se pueden sacar de _comprasCache, que solo trae los últimos 30/90/180 días,
   porque una compra impaga de hace ocho meses sigue siendo deuda.

   Entonces `saldada` es un booleano que existe solo para poder filtrar. Se
   escribe siempre junto con `pagado`, en la misma transacción. Lo que se MUESTRA
   sale siempre de la resta, nunca de este campo: si algún día no coincidieran, en
   pantalla se ve la verdad y el filtro a lo sumo trae un documento de más.

   LAS COMPRAS VIEJAS NO SON DEUDA

   Las que ya estaban cargadas no tienen ninguno de estos campos. Si "sin campo"
   contara como impaga, la clienta abriría el panel y vería una deuda que no
   existe. Como la consulta pide `saldada == false`, esas no aparecen: el default
   correcto sale solo de la consulta. En la ficha figuran como "sin registro".
   ============================================================================= */

/* Los pesos se comparan redondeados al centavo: sumar y restar en punto flotante
   deja restos de 0,0000001 que harían que una compra pagada entera no se dé nunca
   por saldada. */
function _deuRedondear(n) {
  const v = Number(n);
  return isFinite(v) ? Math.round(v * 100) / 100 : 0;
}

/* El estado de una compra. `sin-registro` es distinto de `pagada`: una es una
   compra vieja de la que no sabemos nada, la otra es plata que se pagó. */
function deudaEstado(compra) {
  const total = _deuRedondear(compra && compra.total);
  const hayDato = !!compra && compra.pagado !== undefined && compra.pagado !== null;
  if (!hayDato) {
    return { total: total, pagado: 0, saldo: 0, estado: 'sin-registro',
             etiqueta: 'Sin registro de pago', pagos: [] };
  }
  const pagado = Math.max(0, _deuRedondear(compra.pagado));
  const saldo = _deuRedondear(Math.max(0, total - pagado));
  const pagos = Array.isArray(compra.pagos) ? compra.pagos : [];
  if (saldo <= 0) return { total, pagado, saldo: 0, estado: 'pagada', etiqueta: 'Pagada', pagos };
  if (pagado > 0) return { total, pagado, saldo, estado: 'parcial', etiqueta: 'Pagada en parte', pagos };
  return { total, pagado: 0, saldo, estado: 'impaga', etiqueta: 'Sin pagar', pagos };
}

/* Una compra cuenta como deuda solo si tiene registro Y le falta plata. */
function deudaEsDeuda(compra) {
  const e = deudaEstado(compra);
  return e.estado === 'impaga' || e.estado === 'parcial';
}

/* Agrupa por proveedor. Recibe la lista completa de compras sin saldar, no el
   cache del período. */
function deudasPorProveedor(compras) {
  const out = {};
  (compras || []).forEach(c => {
    if (!deudaEsDeuda(c)) return;
    const k = c.proveedorId || '__sin__';
    const g = (out[k] = out[k] || { saldo: 0, total: 0, cuantas: 0, compras: [] });
    const e = deudaEstado(c);
    g.saldo = _deuRedondear(g.saldo + e.saldo);
    g.total = _deuRedondear(g.total + e.total);
    g.cuantas++;
    g.compras.push(c);
  });
  Object.keys(out).forEach(k => {
    out[k].compras.sort((a, b) => _deuMs(a.fecha) - _deuMs(b.fecha));   /* la más vieja primero */
  });
  return out;
}

/* Antes de escribir plata en la base hay que decir que no. Un pago de más deja el
   saldo en negativo y el número deja de significar nada. */
function deudaValidarPago(compra, monto) {
  const e = deudaEstado(compra);
  if (e.estado === 'sin-registro') {
    return { ok: false, motivo: 'Esta compra es anterior al registro de pagos.' };
  }
  if (e.saldo <= 0) return { ok: false, motivo: 'Esta compra ya está pagada.' };
  const m = _deuRedondear(monto);
  if (!isFinite(m) || m <= 0) return { ok: false, motivo: 'El monto tiene que ser mayor a cero.' };
  if (m > e.saldo) {
    return { ok: false, motivo: 'No se puede pagar más de lo que se debe: el saldo es ' +
             _deuPesos(e.saldo) + '.' };
  }
  const pagado = _deuRedondear(e.pagado + m);
  return { ok: true, monto: m, pagado: pagado, saldo: _deuRedondear(e.total - pagado),
           saldada: _deuRedondear(e.total - pagado) <= 0 };
}

/* Una fecha de Firestore o una de las que quedaron guardadas como texto. */
function _deuMs(f) {
  if (!f) return 0;
  if (f.seconds) return f.seconds * 1000;
  const d = new Date(f);
  return isNaN(d) ? 0 : d.getTime();
}

function _deuPesos(n) {
  return '$' + Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 2 });
}

/* Los medios de pago que se usan de verdad acá. */
const DEU_MEDIOS = ['Efectivo', 'Transferencia', 'Cheque', 'Otro'];

/* ======================== LA CARGA ========================
   Consulta propia, NO el cache de compras: ese trae solo el período elegido y una
   deuda no vence con el período. Se pide `saldada == false`, que es un campo
   suelto y no necesita índice compuesto; agrupar por proveedor se hace acá. */
let _deudasCache = null;      /* { lista, porProveedor } */

async function cargarDeudas(forzar) {
  if (_deudasCache && !forzar) return _deudasCache;
  try {
    const q = await db.collection('compras').where('saldada', '==', false).get();
    const lista = [];
    q.forEach(d => lista.push(Object.assign({ docId: d.id }, d.data())));
    _deudasCache = { lista: lista, porProveedor: deudasPorProveedor(lista) };
  } catch (e) {
    console.warn('deudas:', e);
    _deudasCache = { lista: [], porProveedor: {} };
  }
  return _deudasCache;
}

function deudaDe(listaId) {
  return (_deudasCache && _deudasCache.porProveedor[listaId]) || { saldo: 0, cuantas: 0, compras: [] };
}

/* ======================== LA PANTALLA ======================== */
let _deuProveedor = null;
let _deuAbierta = null;       /* docId de la compra desplegada */

async function openDeudasModal(listaId) {
  _deuProveedor = listaId;
  _deuAbierta = null;
  const m = document.getElementById('deudasModal');
  if (!m) return;
  const cont = document.getElementById('deudasCuerpo');
  if (cont) cont.innerHTML = '<div style="padding:1.5rem;text-align:center;color:var(--text-dim)">' +
    '<i class="bi bi-arrow-repeat spin"></i> Buscando...</div>';
  m.classList.add('show');
  await cargarDeudas(true);
  renderDeudas();
}

function closeDeudasModal() {
  const m = document.getElementById('deudasModal');
  if (m) m.classList.remove('show');
  _deuProveedor = null;
  _deuAbierta = null;
}

function renderDeudas() {
  const cont = document.getElementById('deudasCuerpo');
  const tit = document.getElementById('deudasTitulo');
  if (!cont) return;
  const nombre = ((listasData || []).find(l => l.id === _deuProveedor) || {}).nombre || 'proveedor';
  const d = deudaDe(_deuProveedor);
  if (tit) tit.textContent = 'Deudas con ' + nombre;

  if (!d.compras.length) {
    cont.innerHTML = '<div class="deu-vacio"><i class="bi bi-check2-circle"></i>' +
      '<p>No le deb&eacute;s nada a ' + esc(nombre) + '.</p>' +
      '<p class="deu-chico">Solo aparecen las compras que se cargaron marcadas como impagas. ' +
      'Las anteriores al registro de pagos no cuentan.</p></div>';
    return;
  }

  cont.innerHTML =
    '<div class="deu-total"><span>Le deb&eacute;s</span><b>' + _deuPesos(d.saldo) + '</b>' +
      '<span class="deu-chico">en ' + d.cuantas + ' compra' + (d.cuantas === 1 ? '' : 's') + '</span></div>' +
    d.compras.map(c => _deuFicha(c)).join('');
}

function _deuFicha(c) {
  const e = deudaEstado(c);
  const abierta = _deuAbierta === c.docId;
  const nro = '#' + String(c.numero || 0).padStart(4, '0');
  const items = (c.items || []);

  let h = '<div class="deu-card' + (e.estado === 'parcial' ? ' parcial' : '') + '">' +
    '<div class="deu-cab" onclick="deudaDesplegar(\'' + c.docId + '\')">' +
      '<span class="deu-nro">' + nro + '</span>' +
      /* admin-compras.js se carga antes que este archivo, pero si fallara, una
         fecha no puede tirar abajo todo el listado de deudas. */
      '<span class="deu-fec">' +
        (typeof _cpFechaTxt === 'function' ? _cpFechaTxt(c.fecha) : '') + '</span>' +
      '<span class="deu-est ' + e.estado + '">' + e.etiqueta + '</span>' +
      '<span class="deu-saldo">' + _deuPesos(e.saldo) + '</span>' +
      '<i class="bi bi-chevron-' + (abierta ? 'up' : 'down') + '"></i>' +
    '</div>';

  if (e.pagado > 0) {
    h += '<div class="deu-barra"><span style="width:' +
      Math.min(100, Math.round(e.pagado / (e.total || 1) * 100)) + '%"></span></div>' +
      '<div class="deu-chico" style="padding:0 0.8rem 0.4rem">De ' + _deuPesos(e.total) +
      ' lleva pagado ' + _deuPesos(e.pagado) + '</div>';
  }

  if (abierta) {
    /* Los productos: es lo que permite reconocer la compra sin abrir la factura. */
    h += '<div class="deu-detalle">' +
      (c.comprobante ? '<div class="deu-chico">Comprobante: ' + esc(c.comprobante) + '</div>' : '') +
      (c.notas ? '<div class="deu-chico">' + esc(c.notas) + '</div>' : '') +
      '<table class="deu-tabla"><tbody>' +
      items.map(i => '<tr><td>' + esc(i.nombre) + '</td>' +
        '<td class="num">' + (typeof _cpCant === 'function' ? _cpCant(i) : i.cantidad) + '</td>' +
        '<td class="num">' + _deuPesos(i.subtotal) + '</td></tr>').join('') +
      '</tbody></table>';

    if (e.pagos.length) {
      h += '<div class="deu-sub">Pagos hechos</div>' +
        e.pagos.map(p => '<div class="deu-pago"><span>' + esc(p.fecha || '') + '</span>' +
          '<span>' + esc(p.medio || '') + '</span>' +
          (p.nota ? '<span class="deu-chico">' + esc(p.nota) + '</span>' : '<span></span>') +
          '<b>' + _deuPesos(p.monto) + '</b></div>').join('');
    }

    h += '<div class="deu-form">' +
      '<div class="deu-form-r">' +
        '<label>Monto<input type="number" id="deuMonto" min="0" step="0.01" value="' + e.saldo + '"></label>' +
        '<label>Medio<select id="deuMedio">' +
          DEU_MEDIOS.map(x => '<option>' + x + '</option>').join('') + '</select></label>' +
        '<label>Nota<input type="text" id="deuNota" placeholder="Opcional"></label>' +
      '</div>' +
      '<div class="deu-form-b">' +
        '<button class="btn btn-secondary btn-sm" onclick="deudaMontoTotal(' + e.saldo + ')">Pagar todo</button>' +
        '<button class="btn btn-primary btn-sm" id="deuPagarBtn" onclick="deudaPagar(\'' + c.docId + '\')">' +
          '<i class="bi bi-cash-coin"></i> Registrar pago</button>' +
      '</div></div>';
  }
  return h + '</div>';
}

function deudaDesplegar(docId) {
  _deuAbierta = (_deuAbierta === docId) ? null : docId;
  renderDeudas();
}

function deudaMontoTotal(saldo) {
  const i = document.getElementById('deuMonto');
  if (i) { i.value = saldo; i.focus(); }
}

/* ======================== REGISTRAR EL PAGO ========================
   En transacción: se lee el documento en el momento y se valida contra lo que
   dice la base, no contra lo que tenía la pantalla. Si alguien registró un pago
   desde otra sesión mientras este modal estaba abierto, el segundo pago se frena
   en vez de dejar el saldo en negativo. */
async function deudaPagar(docId) {
  const c = ((_deudasCache && _deudasCache.lista) || []).find(x => x.docId === docId);
  if (!c) return;
  const monto = Number((document.getElementById('deuMonto') || {}).value);
  const medio = (document.getElementById('deuMedio') || {}).value || 'Efectivo';
  const nota = ((document.getElementById('deuNota') || {}).value || '').trim();

  const v = deudaValidarPago(c, monto);
  if (!v.ok) return showAdminToast(v.motivo, 'error');

  const btn = document.getElementById('deuPagarBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="bi bi-arrow-repeat spin"></i> Guardando...'; }
  try {
    const hoy = new Date();
    const fecha = hoy.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' });
    const pago = { fecha: fecha, monto: v.monto, medio: medio, nota: nota,
                   usuario: (auth && auth.currentUser && auth.currentUser.email) || '' };

    const nuevo = await db.runTransaction(async tx => {
      const ref = db.collection('compras').doc(docId);
      const sn = await tx.get(ref);
      if (!sn.exists) throw new Error('La compra ya no existe.');
      const actual = sn.data();
      const vv = deudaValidarPago(actual, v.monto);
      if (!vv.ok) throw new Error(vv.motivo);
      const pagos = (Array.isArray(actual.pagos) ? actual.pagos : []).concat([pago]);
      tx.update(ref, { pagado: vv.pagado, saldada: vv.saldada, pagos: pagos });
      return { pagado: vv.pagado, saldada: vv.saldada, pagos: pagos };
    });

    /* Espejo en memoria, para no releer todo. */
    c.pagado = nuevo.pagado; c.saldada = nuevo.saldada; c.pagos = nuevo.pagos;
    if (nuevo.saldada) {
      _deudasCache.lista = _deudasCache.lista.filter(x => x.docId !== docId);
      _deuAbierta = null;
    }
    _deudasCache.porProveedor = deudasPorProveedor(_deudasCache.lista);
    /* Y en el cache de compras, si esa compra cae dentro del período mostrado. */
    if (typeof _comprasCache !== 'undefined' && _comprasCache) {
      const enCache = (_comprasCache.lista || []).find(x => x.docId === docId);
      if (enCache) { enCache.pagado = nuevo.pagado; enCache.saldada = nuevo.saldada; enCache.pagos = nuevo.pagos; }
    }

    if (typeof logAction === 'function') {
      logAction('editar', 'Pago a proveedor: ' + _deuPesos(v.monto) +
        ' (compra #' + String(c.numero || 0).padStart(4, '0') + ')',
        medio + (nota ? ' | ' + nota : '') + ' | queda debiendo ' + _deuPesos(vv2Saldo(nuevo, c)));
    }
    showAdminToast(nuevo.saldada ? 'Compra saldada' : 'Pago registrado', 'success');
    renderDeudas();
    if (typeof loadProveedores === 'function') loadProveedores();
  } catch (e) {
    showAdminToast('No se pudo registrar el pago: ' + e.message, 'error');
  } finally {
    const b = document.getElementById('deuPagarBtn');
    if (b) { b.disabled = false; b.innerHTML = '<i class="bi bi-cash-coin"></i> Registrar pago'; }
  }
}

function vv2Saldo(nuevo, c) {
  return Math.max(0, _deuRedondear(Number(c.total || 0) - Number(nuevo.pagado || 0)));
}

if (typeof window !== 'undefined') {
  window.deudaEstado = deudaEstado;
  window.deudaEsDeuda = deudaEsDeuda;
  window.deudasPorProveedor = deudasPorProveedor;
  window.deudaValidarPago = deudaValidarPago;
  window.DEU_MEDIOS = DEU_MEDIOS;
  window.cargarDeudas = cargarDeudas;
  window.deudaDe = deudaDe;
  window.openDeudasModal = openDeudasModal;
  window.closeDeudasModal = closeDeudasModal;
  window.renderDeudas = renderDeudas;
  window.deudaDesplegar = deudaDesplegar;
  window.deudaMontoTotal = deudaMontoTotal;
  window.deudaPagar = deudaPagar;
  window._deuPesos = _deuPesos;
}
