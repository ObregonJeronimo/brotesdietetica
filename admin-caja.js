/* =============================================================================
   CAJA / ARQUEO DE CAJA  —  Brotes Dietética
   =============================================================================
   Ciclo diario del local: se abre la caja con un fondo inicial, durante el día
   entran ventas y movimientos que no son ventas (ingresos y egresos), y al
   final se cuenta la plata y se cierra.

   DOS DECISIONES QUE EXPLICAN TODO EL ARCHIVO:

   1) Al esperado en efectivo SOLO suman las ventas cobradas en EFECTIVO.
      Tarjeta y transferencia no pasan por el cajón, y la cuenta corriente
      (fiado) todavía no se cobró. Si el esperado sumara todo, el arqueo daría
      faltante todos los días por el monto de lo no-efectivo.

   2) El arqueo usa el total BRUTO de la venta (con envío incluido), porque el
      flete que cobró el negocio sí entró al cajón. Las estadísticas de venta
      usan el neto, porque el flete no es mercadería vendida. Se guardan los
      dos: ventasBruto y ventasEnvio. Confundirlos hace que la caja dé faltante
      por el monto exacto del flete y nadie entienda por qué.

   Los totales del cierre quedan CONGELADOS en el documento. No se recalculan al
   leer: si mañana alguien edita una venta vieja, el arqueo de aquel día tiene
   que seguir diciendo lo que se contó aquel día.
   ============================================================================= */

const CAJA_CONCEPTOS = {
  ingreso: {
    aporte_cambio:          'Aporte de cambio',
    cobro_cuenta_corriente: 'Cobro de fiado',
    aporte_duenio:          'Aporte del dueño',
    otro_ingreso:           'Otro ingreso'
  },
  egreso: {
    retiro_banco:       'Retiro para el banco',
    pago_proveedor:     'Pago a proveedor',
    gasto:              'Gasto chico',
    retiro_duenio:      'Retiro del dueño',
    devolucion_cliente: 'Devolución a cliente',
    otro_egreso:        'Otro egreso'
  }
};

const CAJA_CFG_DEFAULTS = {
  fondoFijoSugerido: 20000,
  toleranciaDiferencia: 500,
  exigirMotivoSiDifiere: true,
  arqueoCiego: false   /* ocultar el esperado al contar. Es un control patrón-contra-empleado;
                          acá el que cuenta es el dueño contra sí mismo, así que va apagado. */
};

/* Arranca con los defaults y no en null: si la lectura de config/cajaConfig falla,
   `cajaCfg && cajaCfg.exigirMotivoSiDifiere` daria false y el cierre dejaria pasar
   una diferencia sin explicacion, que es justo lo que no queremos. */
let cajaCfg = Object.assign({}, CAJA_CFG_DEFAULTS);
let cajaActual = null;      /* la caja abierta, o null */
let cajaMovs = [];
let cajaVentas = [];
let cajaVentasSueltas = [];
let _movTipo = 'ingreso';

const _pesos = n => '$' + Number(n || 0).toLocaleString('es-AR');

/* ============================ CARGA ============================ */

async function loadCaja() {
  await loadCajaConfig();
  cajaActual = await getCajaAbierta();
  if (cajaActual) {
    await cargarDatosCaja(cajaActual.docId);
    await cargarVentasSueltas(cajaActual.fecha);
  } else {
    cajaMovs = []; cajaVentas = []; cajaVentasSueltas = [];
  }
  renderCaja();
  renderHistorialCajas();
}

async function loadCajaConfig() {
  cajaCfg = Object.assign({}, CAJA_CFG_DEFAULTS);
  try {
    const s = await db.collection('config').doc('cajaConfig').get();
    if (s.exists) Object.assign(cajaCfg, s.data());
  } catch (e) { console.warn('cajaConfig:', e); }
}

async function getCajaAbierta() {
  /* El puntero vive en su propio documento a propósito: si viviera dentro del
     doc de configuración, cualquier guardado con .set() sin merge lo pisaría y
     las ventas dejarían de estamparse con cajaId sin que nadie se entere. */
  try {
    const p = await db.collection('config').doc('cajaEstado').get();
    const id = p.exists ? p.data().cajaAbiertaId : null;
    if (id) {
      const c = await db.collection('cajas').doc(id).get();
      if (c.exists && c.data().estado === 'abierta') return Object.assign({ docId: c.id }, c.data());
    }
  } catch (e) { console.warn('cajaEstado:', e); }
  /* Respaldo: si el puntero quedó desincronizado, buscamos la abierta igual */
  try {
    const q = await db.collection('cajas').where('estado', '==', 'abierta').limit(1).get();
    if (!q.empty) { const d = q.docs[0]; return Object.assign({ docId: d.id }, d.data()); }
  } catch (e) { console.warn('buscar caja abierta:', e); }
  return null;
}

async function cargarDatosCaja(cajaId) {
  cajaVentas = []; cajaMovs = [];
  try {
    const [vs, vm, mv] = await Promise.all([
      db.collection('ventas').where('cajaId', '==', cajaId).get(),
      db.collection('ventasMayoristas').where('cajaId', '==', cajaId).get(),
      db.collection('cajas').doc(cajaId).collection('movimientos').get()
    ]);
    vs.forEach(d => cajaVentas.push(Object.assign({ docId: d.id, _tipo: 'minorista' }, d.data())));
    vm.forEach(d => cajaVentas.push(Object.assign({ docId: d.id, _tipo: 'mayorista' }, d.data())));
    mv.forEach(d => cajaMovs.push(Object.assign({ docId: d.id }, d.data())));
    cajaMovs.sort((a, b) => (b.fecha && b.fecha.seconds || 0) - (a.fecha && a.fecha.seconds || 0));
  } catch (e) { console.warn('cargarDatosCaja:', e); }
}

/* Ventas del día que quedaron sin cajaId: se registraron con la caja cerrada.
   Se muestran aparte para poder adjuntarlas, en vez de que desaparezcan. */
async function cargarVentasSueltas(fecha) {
  cajaVentasSueltas = [];
  if (!fecha) return;
  /* `ventas.fecha` es un Timestamp, no el string 'AAAA-MM-DD': hay que pedir el
     rango del día. Con `== fecha` la consulta no devolvía nunca nada y el aviso
     de ventas fuera de caja no aparecía jamás.
     Sin sufijo Z, `new Date('...T00:00:00')` se interpreta en hora local, que es
     justo como se arma la fecha al registrar la venta. */
  const desde = new Date(fecha + 'T00:00:00');
  const hasta = new Date(fecha + 'T23:59:59.999');
  if (isNaN(desde)) return;
  const buscar = async (col, tipo) => {
    try {
      const q = await db.collection(col).where('fecha', '>=', desde).where('fecha', '<=', hasta).get();
      q.forEach(d => {
        const v = d.data();
        if (!v.cajaId) cajaVentasSueltas.push(Object.assign({ docId: d.id, _col: col, _tipo: tipo }, v));
      });
    } catch (e) { console.warn('ventas sueltas (' + col + '):', e); }
  };
  await Promise.all([buscar('ventas', 'minorista'), buscar('ventasMayoristas', 'mayorista')]);
}

/* ============================ CÁLCULO ============================ */

function calcularTotalesCaja() {
  const porMedio = { efectivo: 0, tarjeta: 0, transferencia: 0, cuenta_corriente: 0, otro: 0 };
  let bruto = 0, envio = 0;
  cajaVentas.forEach(v => {
    const k = (typeof medioKeyDeVenta === 'function') ? medioKeyDeVenta(v) : 'otro';
    const t = Number(v.total || 0);
    porMedio[k] = (porMedio[k] || 0) + t;
    bruto += t;
    envio += Number(v.envio || 0);
  });
  const ingresos = cajaMovs.filter(m => m.tipo === 'ingreso').reduce((s, m) => s + Number(m.monto || 0), 0);
  const egresos  = cajaMovs.filter(m => m.tipo === 'egreso').reduce((s, m) => s + Number(m.monto || 0), 0);
  /* SOLO efectivo: lo demás no pasó por el cajón */
  const esperado = Number((cajaActual && cajaActual.montoInicial) || 0) + porMedio.efectivo + ingresos - egresos;
  return { porMedio, bruto, envio, ingresos, egresos, esperado, count: cajaVentas.length };
}

/* ============================ RENDER ============================ */

function renderCaja() {
  const cont = document.getElementById('cajaTop');
  if (!cont) return;
  if (!cajaActual) {
    cont.innerHTML =
      '<div class="card" style="padding:2rem;text-align:center;max-width:560px">' +
        '<i class="bi bi-lock" style="font-size:2rem;line-height:1;display:block;margin-bottom:0.6rem;color:var(--text-dim)"></i>' +
        '<h3 style="font-size:1.1rem;font-weight:700;margin-bottom:0.35rem">No hay caja abierta</h3>' +
        '<p style="font-size:0.88rem;color:var(--text-dim);margin-bottom:1.1rem;line-height:1.55">' +
          'Abrí la caja al empezar el día. Las ventas del local que registres con la caja cerrada ' +
          'quedan fuera del arqueo, pero después las podés adjuntar.</p>' +
        '<button class="btn btn-primary" style="width:auto" onclick="openAbrirCajaModal()">' +
          '<i class="bi bi-unlock"></i> Abrir caja</button>' +
      '</div>';
    return;
  }
  const t = calcularTotalesCaja();
  const fila = (etq, val, extra) =>
    '<div style="display:flex;justify-content:space-between;padding:0.42rem 0;font-size:0.9rem;' + (extra || '') + '">' +
      '<span style="color:var(--text-dim)">' + etq + '</span><span style="font-weight:600">' + val + '</span></div>';

  cont.innerHTML =
    '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(290px,1fr));gap:1rem;margin-bottom:1rem">' +
      '<div class="card" style="padding:1.25rem">' +
        '<div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.85rem">' +
          '<span style="width:9px;height:9px;border-radius:50%;background:#5FA87A;flex:0 0 auto"></span>' +
          '<h3 style="font-size:1rem;font-weight:700;flex:1">Caja #' + String(cajaActual.numero || 0).padStart(4, '0') + ' abierta</h3>' +
        '</div>' +
        '<p style="font-size:0.78rem;color:var(--text-dim);margin-bottom:0.6rem">' +
          'Abierta por ' + esc(cajaActual.abiertoPor || '-') + '</p>' +
        fila('Fondo inicial', _pesos(cajaActual.montoInicial)) +
        fila('Ventas (' + t.count + ')', _pesos(t.bruto)) +
        fila('&nbsp;&nbsp;· en efectivo', _pesos(t.porMedio.efectivo)) +
        fila('&nbsp;&nbsp;· tarjeta / transferencia', _pesos(t.porMedio.tarjeta + t.porMedio.transferencia)) +
        (t.porMedio.cuenta_corriente ? fila('&nbsp;&nbsp;· fiado (no entra al cajón)', _pesos(t.porMedio.cuenta_corriente)) : '') +
        fila('Ingresos', '+ ' + _pesos(t.ingresos)) +
        fila('Egresos', '− ' + _pesos(t.egresos)) +
        '<div style="border-top:1px solid var(--border);margin-top:0.6rem;padding-top:0.6rem">' +
          fila('<b>Debería haber en efectivo</b>', '<b style="color:var(--accent)">' + _pesos(t.esperado) + '</b>') +
        '</div>' +
      '</div>' +
      '<div class="card" style="padding:1.25rem;display:flex;flex-direction:column;gap:0.6rem">' +
        '<h3 style="font-size:1rem;font-weight:700;margin-bottom:0.2rem">Movimientos</h3>' +
        '<p style="font-size:0.8rem;color:var(--text-dim);line-height:1.5;margin-bottom:0.4rem">' +
          'Todo lo que entra o sale del cajón y no es una venta. Siempre con un detalle, ' +
          'para que la caja cierre y se entienda por qué.</p>' +
        '<button class="btn btn-secondary" onclick="openMovModal(\'ingreso\')"><i class="bi bi-arrow-down-circle"></i> Registrar ingreso</button>' +
        '<button class="btn btn-secondary" onclick="openMovModal(\'egreso\')"><i class="bi bi-arrow-up-circle"></i> Registrar egreso</button>' +
        '<div style="flex:1"></div>' +
        '<button class="btn btn-primary" onclick="openCierreModal()"><i class="bi bi-lock"></i> Cerrar caja y arquear</button>' +
      '</div>' +
    '</div>' +
    renderVentasSueltas() +
    renderMovimientos();
}

function renderMovimientos() {
  if (!cajaMovs.length) {
    return '<div class="card" style="padding:1.1rem"><p style="font-size:0.85rem;color:var(--text-dim)">' +
           'Todavía no hay movimientos en esta caja.</p></div>';
  }
  const filas = cajaMovs.map(m => {
    const esIng = m.tipo === 'ingreso';
    const etq = (CAJA_CONCEPTOS[m.tipo] && CAJA_CONCEPTOS[m.tipo][m.concepto]) || m.concepto || '-';
    const hora = m.fecha && m.fecha.seconds
      ? new Date(m.fecha.seconds * 1000).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : '';
    return '<tr>' +
      '<td style="white-space:nowrap;color:var(--text-dim);font-size:0.8rem">' + hora + '</td>' +
      '<td><span style="font-weight:600">' + esc(etq) + '</span></td>' +
      '<td style="color:var(--text-dim);font-size:0.85rem">' + esc(m.detalle || '') + '</td>' +
      '<td style="text-align:right;white-space:nowrap;font-weight:700;color:' + (esIng ? '#5FA87A' : '#e54545') + '">' +
        (esIng ? '+ ' : '− ') + _pesos(m.monto) + '</td>' +
    '</tr>';
  }).join('');
  return '<div class="card" style="padding:0;overflow:hidden">' +
    '<div style="padding:1rem 1.25rem;border-bottom:1px solid var(--border)"><h3 style="font-size:0.95rem;font-weight:700">Movimientos de esta caja</h3></div>' +
    '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse">' +
    '<tbody>' + filas + '</tbody></table></div></div>';
}

function renderVentasSueltas() {
  if (!cajaVentasSueltas.length) return '';
  return '<div class="card" style="padding:1.1rem 1.25rem;margin-bottom:1rem;border-left:3px solid #EDB833">' +
    '<h3 style="font-size:0.95rem;font-weight:700;margin-bottom:0.3rem">' +
      'Ventas fuera de caja (' + cajaVentasSueltas.length + ')</h3>' +
    '<p style="font-size:0.83rem;color:var(--text-dim);line-height:1.5;margin-bottom:0.8rem">' +
      'Se registraron hoy con la caja cerrada, así que no entran al arqueo. ' +
      'Si corresponden a esta caja, adjuntalas.</p>' +
    '<button class="btn btn-secondary" style="width:auto" onclick="adjuntarVentasSueltas()">' +
      '<i class="bi bi-paperclip"></i> Adjuntar a esta caja</button></div>';
}

async function renderHistorialCajas() {
  const cont = document.getElementById('cajaHistorial');
  if (!cont) return;
  let docs = [];
  try {
    const q = await db.collection('cajas').orderBy('abiertoEn', 'desc').limit(30).get();
    q.forEach(d => docs.push(Object.assign({ docId: d.id }, d.data())));
  } catch (e) { console.warn('historial cajas:', e); }
  const cerradas = docs.filter(c => c.estado === 'cerrada');
  if (!cerradas.length) {
    cont.innerHTML = '<p style="font-size:0.85rem;color:var(--text-dim)">Todavía no hay cajas cerradas.</p>';
    return;
  }
  const filas = cerradas.map(c => {
    const dif = Number(c.diferencia || 0);
    const color = dif === 0 ? '#5FA87A' : (dif > 0 ? '#EDB833' : '#e54545');
    const etq = dif === 0 ? 'exacta' : (dif > 0 ? 'sobrante' : 'faltante');
    return '<tr>' +
      '<td style="white-space:nowrap">#' + String(c.numero || 0).padStart(4, '0') + '</td>' +
      '<td style="white-space:nowrap">' + esc(c.fecha || '') + '</td>' +
      '<td style="text-align:right;white-space:nowrap">' + _pesos(c.ventasBruto) + '</td>' +
      '<td style="text-align:right;white-space:nowrap">' + _pesos(c.esperadoEfectivo) + '</td>' +
      '<td style="text-align:right;white-space:nowrap">' + _pesos(c.contadoEfectivo) + '</td>' +
      '<td style="text-align:right;white-space:nowrap;color:' + color + ';font-weight:700">' +
        (dif > 0 ? '+' : '') + _pesos(dif) + ' <span style="font-size:0.72rem;font-weight:500">' + etq + '</span></td>' +
      '<td style="font-size:0.8rem;color:var(--text-dim)">' + esc(c.motivoDiferencia || '') +
        (c.editadaPostCierre ? ' <span title="Se editó una venta de esta caja después de cerrarla" style="background:rgba(237,184,51,0.18);color:#EDB833;padding:1px 6px;border-radius:4px;font-size:0.68rem;font-weight:700">EDITADA</span>' : '') +
      '</td>' +
    '</tr>';
  }).join('');
  cont.innerHTML = '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:0.88rem">' +
    '<thead><tr style="text-align:left;color:var(--text-dim);font-size:0.72rem;text-transform:uppercase;letter-spacing:0.5px">' +
      '<th style="padding:0.5rem 0.6rem">Caja</th><th>Fecha</th><th style="text-align:right">Ventas</th>' +
      '<th style="text-align:right">Esperado</th><th style="text-align:right">Contado</th>' +
      '<th style="text-align:right">Diferencia</th><th>Motivo</th></tr></thead>' +
    '<tbody>' + filas + '</tbody></table></div>';
}

/* ============================ ABRIR ============================ */

async function openAbrirCajaModal() {
  let sugerido = cajaCfg.fondoFijoSugerido;
  /* Lo que quedó en el cajón al cerrar ayer es el fondo natural de hoy */
  try {
    const q = await db.collection('cajas').where('estado', '==', 'cerrada').orderBy('abiertoEn', 'desc').limit(1).get();
    if (!q.empty) { const u = q.docs[0].data(); if (u.dejaEnCaja != null) sugerido = u.dejaEnCaja; }
  } catch (e) { /* si falla, queda el sugerido de config */ }
  document.getElementById('cajaMontoInicial').value = sugerido;
  document.getElementById('cajaNotaApertura').value = '';
  document.getElementById('abrirCajaModal').classList.add('show');
}
function closeAbrirCajaModal() { document.getElementById('abrirCajaModal').classList.remove('show'); }

async function abrirCaja() {
  const btn = document.getElementById('cajaAbrirBtn');
  const monto = parseInt(document.getElementById('cajaMontoInicial').value, 10);
  if (!Number.isFinite(monto) || monto < 0) { showAdminToast('Poné un fondo inicial válido', 'error'); return; }
  btn.disabled = true;
  try {
    /* Con dos admins, dos pestañas pueden abrir a la vez. Firestore no tiene
       restricción de unicidad, así que re-consultamos justo antes de crear. */
    const ya = await db.collection('cajas').where('estado', '==', 'abierta').limit(1).get();
    if (!ya.empty) {
      showAdminToast('Ya hay una caja abierta. Actualizá la pantalla.', 'error');
      btn.disabled = false; await loadCaja(); closeAbrirCajaModal(); return;
    }
    let numero = 1;
    const cnt = db.collection('config').doc('cajasCount');
    numero = await db.runTransaction(async t => {
      const s = await t.get(cnt);
      const n = (s.exists ? (parseInt(s.data().count) || 0) : 0) + 1;
      t.set(cnt, { count: n });
      return n;
    });
    const doc = {
      numero: numero, estado: 'abierta',
      fecha: (typeof hoyAR === 'function') ? hoyAR() : new Date().toISOString().slice(0, 10),
      montoInicial: monto,
      abiertoPor: (auth.currentUser && auth.currentUser.email) || '-',
      abiertoEn: firebase.firestore.FieldValue.serverTimestamp(),
      notaApertura: document.getElementById('cajaNotaApertura').value.trim() || null,
      editadaPostCierre: false
    };
    const ref = await db.collection('cajas').add(doc);
    await db.collection('config').doc('cajaEstado').set({
      cajaAbiertaId: ref.id, numero: numero, fecha: doc.fecha, abiertoPor: doc.abiertoPor
    });
    window._cajaEstadoCache = { cajaAbiertaId: ref.id };
    if (typeof logAction === 'function') logAction('abrir', 'Caja #' + numero + ' abierta', 'Fondo inicial ' + _pesos(monto));
    showAdminToast('Caja #' + numero + ' abierta', 'success');
    closeAbrirCajaModal();
    await loadCaja();
  } catch (e) {
    showAdminToast('Error al abrir: ' + e.message, 'error');
  } finally { btn.disabled = false; }
}

/* ============================ MOVIMIENTOS ============================ */

function openMovModal(tipo) {
  _movTipo = (tipo === 'egreso') ? 'egreso' : 'ingreso';
  const sel = document.getElementById('movConcepto');
  const conceptos = CAJA_CONCEPTOS[_movTipo];
  sel.innerHTML = Object.keys(conceptos).map(k => '<option value="' + k + '">' + conceptos[k] + '</option>').join('');
  document.getElementById('movTitulo').textContent = _movTipo === 'ingreso' ? 'Registrar ingreso' : 'Registrar egreso';
  document.getElementById('movMonto').value = '';
  document.getElementById('movDetalle').value = '';
  document.getElementById('movModal').classList.add('show');
  setTimeout(() => document.getElementById('movMonto').focus(), 60);
}
function closeMovModal() { document.getElementById('movModal').classList.remove('show'); }

async function guardarMovimiento() {
  if (!cajaActual) { showAdminToast('No hay caja abierta', 'error'); return; }
  const monto = parseInt(document.getElementById('movMonto').value, 10);
  const detalle = document.getElementById('movDetalle').value.trim();
  if (!Number.isFinite(monto) || monto <= 0) { showAdminToast('Poné un monto mayor a cero', 'error'); return; }
  /* El detalle es obligatorio a propósito: un movimiento sin explicación es
     exactamente lo que después nadie puede justificar en el arqueo. */
  if (detalle.length < 3) { showAdminToast('Escribí un detalle (mínimo 3 letras)', 'error'); return; }
  const btn = document.getElementById('movGuardarBtn');
  btn.disabled = true;
  try {
    /* Se revisa que la caja siga abierta antes de escribir. Si el otro admin la cerró
       mientras este movimiento se estaba cargando, el arqueo ya quedó congelado: el
       movimiento se guardaba igual, avisaba "registrado", y esa plata no aparecía en
       ningún cierre. Desaparecía sin dejar rastro salvo en la subcolección. */
    const _snapCaja = await db.collection('cajas').doc(cajaActual.docId).get();
    if (!_snapCaja.exists || _snapCaja.data().estado !== 'abierta') {
      showAdminToast('Esta caja ya la cerró alguien más. El movimiento no se guardó.', 'error');
      closeMovModal();
      await loadCaja();
      return;
    }
    await db.collection('cajas').doc(cajaActual.docId).collection('movimientos').add({
      tipo: _movTipo,
      concepto: document.getElementById('movConcepto').value,
      monto: monto,
      detalle: detalle,
      usuario: (auth.currentUser && auth.currentUser.email) || '-',
      fecha: firebase.firestore.FieldValue.serverTimestamp()
    });
    if (typeof logAction === 'function')
      logAction(_movTipo, 'Caja #' + cajaActual.numero + ': ' + _movTipo + ' ' + _pesos(monto), detalle);
    showAdminToast('Movimiento registrado', 'success');
    closeMovModal();
    await cargarDatosCaja(cajaActual.docId);
    renderCaja();
  } catch (e) {
    showAdminToast('Error: ' + e.message, 'error');
  } finally { btn.disabled = false; }
}

/* ============================ CIERRE ============================ */

async function openCierreModal() {
  if (!cajaActual) return;
  /* Se recargan las ventas ANTES de arquear. `cajaVentas` es lo que quedó cargado
     la última vez que se abrió la sección: si el mostrador vendió desde otra
     pantalla, o el otro admin cargó algo, o simplemente pasaron horas, el arqueo
     salía contra una foto vieja. Con el atajo de teclado era peor todavía, porque
     se puede llegar acá sin volver a pasar por la pantalla de Caja. */
  const btn = document.getElementById('cajaCerrarBtn');
  if (btn) { btn.disabled = true; }
  await cargarDatosCaja(cajaActual.docId);
  const t = calcularTotalesCaja();
  window._cajaTotalesCierre = t;
  const ciego = !!cajaCfg.arqueoCiego;
  document.getElementById('cierreResumen').innerHTML =
    '<div style="display:grid;gap:0.3rem;font-size:0.9rem">' +
      '<div style="display:flex;justify-content:space-between"><span style="color:var(--text-dim)">Fondo inicial</span><span>' + _pesos(cajaActual.montoInicial) + '</span></div>' +
      '<div style="display:flex;justify-content:space-between"><span style="color:var(--text-dim)">Ventas en efectivo</span><span>' + _pesos(t.porMedio.efectivo) + '</span></div>' +
      '<div style="display:flex;justify-content:space-between"><span style="color:var(--text-dim)">Ingresos</span><span>+ ' + _pesos(t.ingresos) + '</span></div>' +
      '<div style="display:flex;justify-content:space-between"><span style="color:var(--text-dim)">Egresos</span><span>− ' + _pesos(t.egresos) + '</span></div>' +
      (ciego ? '' :
      '<div style="display:flex;justify-content:space-between;border-top:1px solid var(--border);margin-top:0.4rem;padding-top:0.4rem">' +
        '<b>Debería haber</b><b style="color:var(--accent)">' + _pesos(t.esperado) + '</b></div>') +
      '<div style="margin-top:0.5rem;font-size:0.78rem;color:var(--text-dim);line-height:1.5">' +
        'Tarjeta y transferencia (' + _pesos(t.porMedio.tarjeta + t.porMedio.transferencia) + ') no entran: no pasan por el cajón.' +
        (t.porMedio.cuenta_corriente ? ' El fiado (' + _pesos(t.porMedio.cuenta_corriente) + ') tampoco, todavía no se cobró.' : '') +
      '</div>' +
    '</div>';
  document.getElementById('cajaContado').value = '';
  document.getElementById('cajaMotivo').value = '';
  document.getElementById('cajaObs').value = '';
  document.getElementById('cajaRetiro').value = '';
  document.getElementById('cierreDiferencia').innerHTML = '';
  document.getElementById('cajaMotivoWrap').style.display = 'none';
  document.getElementById('cajaCerrarBtn').disabled = true;
  document.getElementById('cierreModal').classList.add('show');
  setTimeout(() => document.getElementById('cajaContado').focus(), 60);
}
function closeCierreModal() { document.getElementById('cierreModal').classList.remove('show'); }

function onContadoInput() {
  const t = window._cajaTotalesCierre;
  if (!t) return;
  const val = document.getElementById('cajaContado').value;
  const box = document.getElementById('cierreDiferencia');
  const wrap = document.getElementById('cajaMotivoWrap');
  if (val === '') { box.innerHTML = ''; wrap.style.display = 'none'; document.getElementById('cajaCerrarBtn').disabled = true; return; }
  const contado = parseInt(val, 10) || 0;
  const dif = contado - t.esperado;
  const tol = Number(cajaCfg.toleranciaDiferencia) || 0;
  const color = dif === 0 ? '#5FA87A' : (Math.abs(dif) <= tol ? '#EDB833' : '#e54545');
  const etq = dif === 0 ? 'La caja cierra exacta' : (dif > 0 ? 'Sobra ' + _pesos(dif) : 'Falta ' + _pesos(Math.abs(dif)));
  box.innerHTML = '<div style="background:rgba(255,255,255,0.04);border-left:3px solid ' + color +
    ';border-radius:0 8px 8px 0;padding:0.7rem 0.9rem;margin-top:0.75rem">' +
    '<div style="font-weight:700;color:' + color + '">' + etq + '</div>' +
    (dif !== 0 ? '<div style="font-size:0.78rem;color:var(--text-dim);margin-top:0.2rem">Esperado ' + _pesos(t.esperado) + ' · contado ' + _pesos(contado) + '</div>' : '') +
    '</div>';
  wrap.style.display = dif !== 0 ? '' : 'none';
  validarCierre();
}

function validarCierre() {
  const t = window._cajaTotalesCierre;
  const val = document.getElementById('cajaContado').value;
  if (!t || val === '') { document.getElementById('cajaCerrarBtn').disabled = true; return; }
  const dif = (parseInt(val, 10) || 0) - t.esperado;
  const exige = !!cajaCfg.exigirMotivoSiDifiere;
  const motivo = document.getElementById('cajaMotivo').value.trim();
  document.getElementById('cajaCerrarBtn').disabled = (dif !== 0 && exige && motivo.length < 3);
}

async function confirmarCierre() {
  if (!cajaActual) return;
  const t = window._cajaTotalesCierre || calcularTotalesCaja();
  const contado = parseInt(document.getElementById('cajaContado').value, 10) || 0;
  const dif = contado - t.esperado;
  const retiro = parseInt(document.getElementById('cajaRetiro').value, 10) || 0;
  if (retiro > contado) { showAdminToast('No podés retirar más de lo que contaste', 'error'); return; }
  const btn = document.getElementById('cajaCerrarBtn');
  btn.disabled = true;
  try {
    /* Todo CONGELADO: si mañana editan una venta de hoy, este arqueo tiene que
       seguir diciendo lo que se contó hoy. Por eso no se recalcula al leer.

       Va en transacción y revisando `estado` primero porque con dos admins el
       cierre se puede correr dos veces: el segundo pisaba el arqueo del primero
       con su propio conteo, y el primero se enteraba de que su cierre ya no
       existía recién al mirar el historial. */
    await db.runTransaction(async tx => {
      const ref = db.collection('cajas').doc(cajaActual.docId);
      const sn = await tx.get(ref);
      if (!sn.exists) throw new Error('La caja ya no existe');
      if (sn.data().estado !== 'abierta') throw new Error('cerrada-por-otro');
      tx.update(ref, {
      estado: 'cerrada',
      cerradoPor: (auth.currentUser && auth.currentUser.email) || '-',
      cerradoEn: firebase.firestore.FieldValue.serverTimestamp(),
      ventasCount: t.count, ventasBruto: t.bruto, ventasEnvio: t.envio, ventasPorMedio: t.porMedio,
      totalIngresos: t.ingresos, totalEgresos: t.egresos,
      esperadoEfectivo: t.esperado, contadoEfectivo: contado, diferencia: dif,
      motivoDiferencia: dif !== 0 ? (document.getElementById('cajaMotivo').value.trim() || null) : null,
      retiroFinal: retiro, dejaEnCaja: contado - retiro,
      observaciones: document.getElementById('cajaObs').value.trim() || null
      });
    });
    await db.collection('config').doc('cajaEstado').set({ cajaAbiertaId: null });
    window._cajaEstadoCache = { cajaAbiertaId: null };
    if (typeof logAction === 'function')
      logAction('cerrar', 'Caja #' + cajaActual.numero + ' cerrada',
        'Esperado ' + _pesos(t.esperado) + ' | Contado ' + _pesos(contado) + ' | Diferencia ' + _pesos(dif));
    showAdminToast('Caja #' + cajaActual.numero + ' cerrada', 'success');
    closeCierreModal();
    await loadCaja();
  } catch (e) {
    if (e && e.message === 'cerrada-por-otro') {
      showAdminToast('Esta caja ya la cerró alguien más. Actualizamos la pantalla.', 'error');
      closeCierreModal();
      await loadCaja();
      return;
    }
    showAdminToast('Error al cerrar: ' + e.message, 'error');
    btn.disabled = false;
  }
}

/* ============================ ADJUNTAR ============================ */

async function adjuntarVentasSueltas() {
  if (!cajaActual || !cajaVentasSueltas.length) return;
  if (!confirm('Adjuntar ' + cajaVentasSueltas.length + ' venta(s) a la caja #' + cajaActual.numero + '?')) return;
  try {
    const batch = db.batch();
    /* Se usa v._col: una mayorista suelta vive en otra coleccion y actualizarla
       contra 'ventas' escribiria un documento que no existe. */
    cajaVentasSueltas.forEach(v => batch.update(db.collection(v._col || 'ventas').doc(v.docId), { cajaId: cajaActual.docId }));
    await batch.commit();
    showAdminToast('Ventas adjuntadas', 'success');
    await cargarDatosCaja(cajaActual.docId);
    await cargarVentasSueltas(cajaActual.fecha);
    renderCaja();
  } catch (e) { showAdminToast('Error: ' + e.message, 'error'); }
}

/* ============ API para el resto del panel ============ */

window.getCajaAbiertaId = function () {
  return (cajaActual && cajaActual.estado === 'abierta') ? cajaActual.docId : null;
};

/* La usa saveVenta para estampar la venta con la caja del día.

   Se consulta EN VIVO y no desde una variable, por dos motivos. Uno: si el
   cajero nunca entró a la sección Caja, `cajaActual` es null y las ventas
   saldrían sin cajaId aunque la caja esté abierta. Dos: si el cache quedara
   viejo (la otra pestaña cerró la caja), la venta se estamparía contra una caja
   ya cerrada — y como el cierre congela sus totales, esa venta no aparecería
   nunca en ningún arqueo. Con null al menos figura como "venta fuera de caja" y
   se puede adjuntar. Son dos lecturas por venta; a este volumen no se nota. */
window.getCajaAbiertaIdLive = async function () {
  try {
    const p = await db.collection('config').doc('cajaEstado').get();
    const id = p.exists ? (p.data().cajaAbiertaId || null) : null;
    if (!id) return null;
    const c = await db.collection('cajas').doc(id).get();
    return (c.exists && c.data().estado === 'abierta') ? id : null;
  } catch (e) {
    console.warn('getCajaAbiertaIdLive:', e);
    return (cajaActual && cajaActual.estado === 'abierta') ? cajaActual.docId : null;
  }
};
