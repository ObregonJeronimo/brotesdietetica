/* =============================================================================
   CUPONES IMPRESOS EN EL TICKET  —  Brotes Dietética
   =============================================================================
   LA PROMO NO ES EL CÓDIGO

   Una PROMO es lo que se configura en el panel: cuánto descuenta, desde qué
   compra, hasta cuándo vale, cuántas se pueden entregar. Son cinco o seis y las
   maneja el negocio.

   Un CÓDIGO es UNA entrega de esa promo: se genera en el momento, sale impreso
   en ese ticket y vale UNA sola vez.

   Por qué no se imprime directamente el código de la promo, que sería más
   simple: porque en el mostrador no se sabe quién es el cliente. Online el "una
   vez por persona" se resuelve con la cuenta, pero acá enfrente hay alguien sin
   identificar. Si todos los tickets salen con el mismo código, el que se lo
   guarda lo usa todas las veces que quiera hasta agotar el límite, y alcanza con
   que uno le saque una foto. Con un código por ticket el control sale solo.

   EL CÓDIGO LO VA A TIPEAR UNA PERSONA APURADA

   Por eso el alfabeto no tiene O ni 0, ni I ni 1 ni L: son los que se confunden
   al leer un ticket térmico, que además imprime chico y se borronea. Y lleva un
   carácter de control: si se equivoca en una letra, el sistema dice "ese código
   no existe" en vez de aceptar por casualidad el cupón de otro cliente.
   ============================================================================= */

/* Sin 0/O, ni 1/I/L: son los que se leen mal en un ticket térmico. Quedan 31
   caracteres, y 31 sirve igual para la cuenta del control -no hace falta que sea
   una potencia de dos-, así que no se agrega ningún símbolo raro con tal de
   redondear el número. */
const CTK_ALFABETO = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const CTK_LARGO = 6;          /* sin contar el carácter de control */

/* El carácter de control: suma con peso por posición. Detecta cualquier letra
   cambiada y casi todas las transposiciones, que son los dos errores que comete
   quien copia a mano. */
function _ctkControl(cuerpo) {
  const s = String(cuerpo || '');
  let suma = 0;
  for (let i = 0; i < s.length; i++) {
    const v = CTK_ALFABETO.indexOf(s[i]);
    if (v < 0) return null;
    suma += v * (i + 2);
  }
  return CTK_ALFABETO[suma % CTK_ALFABETO.length];
}

/* `azar` se pasa por afuera para poder probar esto: con Math.random adentro no
   habría forma de verificar que dos llamadas den códigos distintos ni de repetir
   un caso que falló. */
function cuponTicketNuevoCodigo(azar) {
  const r = typeof azar === 'function' ? azar : Math.random;
  let cuerpo = '';
  for (let i = 0; i < CTK_LARGO; i++) {
    const n = Math.floor(r() * CTK_ALFABETO.length) % CTK_ALFABETO.length;
    cuerpo += CTK_ALFABETO[n];
  }
  return cuerpo + _ctkControl(cuerpo);
}

/* Se acepta en minúscula y con espacios o guiones en el medio: nadie tipea un
   código como lo imprimió la impresora. */
function cuponTicketNormalizar(txt) {
  return String(txt == null ? '' : txt).toUpperCase().replace(/[^0-9A-Z]/g, '');
}

/* Que el código esté bien FORMADO no dice que exista ni que sirva: dice que no
   está mal tipeado. Es lo que se mira antes de ir a buscarlo a la base, para no
   consultar por cada tecla. */
function cuponTicketFormatoOk(codigo) {
  const c = cuponTicketNormalizar(codigo);
  if (c.length !== CTK_LARGO + 1) return false;
  return _ctkControl(c.slice(0, CTK_LARGO)) === c[CTK_LARGO];
}

/* ------------------------------------------------------------- LA VALIDACIÓN
   Devuelve por qué NO se puede, no solo que no se puede: quien está en la caja
   con el cliente enfrente necesita poder decirle qué pasó. */
function cuponTicketValidar(cupon, subtotal, ahoraMs) {
  if (!cupon) return { ok: false, motivo: 'Ese código no existe.' };
  if (cupon.activo === false) return { ok: false, motivo: 'Ese cupón ya no está activo.' };

  const usos = Number(cupon.usos || 0);
  const max = Number(cupon.maxUsos || 0);
  if (max > 0 && usos >= max) {
    return { ok: false, motivo: max === 1 ? 'Ese cupón ya se usó.' : 'Ese cupón llegó a su límite de usos.' };
  }

  const vence = _ctkMs(cupon.vence);
  const ahora = ahoraMs == null ? Date.now() : ahoraMs;
  if (vence && vence < ahora) {
    return { ok: false, motivo: 'Ese cupón venció el ' + _ctkFecha(cupon.vence) + '.' };
  }

  const minimo = Number(cupon.limite || 0);
  const sub = Number(subtotal || 0);
  if (minimo > 0 && sub < minimo) {
    return { ok: false, motivo: 'Vale a partir de ' + _ctkPesos(minimo) +
             ' y esta venta va ' + _ctkPesos(sub) + '.' };
  }

  /* Nunca puede descontar más que la venta: un total en negativo no significa
     nada y la caja no cierra. */
  const monto = Math.min(Number(cupon.monto || 0), sub);
  if (monto <= 0) return { ok: false, motivo: 'Ese cupón no tiene monto.' };

  return { ok: true, monto: monto, codigo: cupon.codigo || cupon.id };
}

/* Los datos del código nuevo que se genera a partir de una promo. La promo queda
   apuntada para poder saber después cuál funcionó. */
function cuponTicketDesdePromo(promo, codigo, ventaId, diasVigencia, ahoraMs) {
  if (!promo) return null;
  const ahora = ahoraMs == null ? Date.now() : ahoraMs;
  const dias = Number(diasVigencia) > 0 ? Number(diasVigencia) : 30;
  return {
    codigo: codigo,
    monto: Number(promo.monto || 0),
    limite: Number(promo.limite || 0),
    maxUsos: 1,                       /* una entrega, un uso */
    usos: 0,
    activo: true,
    vence: new Date(ahora + dias * 86400000),
    /* De dónde salió. `origen` es además lo que permite que la lista de cupones
       del panel no se llene con cientos de códigos de ticket. */
    origen: 'ticket',
    /* La lista de cupones del panel consulta con orderBy('creadoEn'), y Firestore
       deja AFUERA en silencio a los documentos que no tienen ese campo. Un cupon
       sin fecha seria invisible ahi. Aparte sirve para saber cuando se entrego. */
    creadoEn: new Date(ahora),
    promoId: promo.id || promo.codigo || null,
    promoNombre: promo.nombre || promo.codigo || '',
    ventaId: ventaId || null,
  };
}

/* Una promo sirve para entregar si está activa y todavía no se entregó todo lo
   que se dijo que se iba a entregar. */
function cuponTicketPromosDisponibles(cupones) {
  return (cupones || []).filter(c => {
    if (!c || c.origen === 'ticket') return false;   /* los códigos ya entregados no son promos */
    if (c.activo === false) return false;
    const max = Number(c.maxUsos || 0);
    if (max > 0 && Number(c.entregados || 0) >= max) return false;
    return Number(c.monto || 0) > 0;
  });
}

function _ctkMs(f) {
  if (!f) return 0;
  if (f.seconds) return f.seconds * 1000;
  if (f instanceof Date) return f.getTime();
  const d = new Date(f);
  return isNaN(d) ? 0 : d.getTime();
}

function _ctkFecha(f) {
  const ms = _ctkMs(f);
  return ms ? new Date(ms).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '-';
}

function _ctkPesos(n) {
  return '$' + Number(n || 0).toLocaleString('es-AR');
}

/* ======================= CANJEAR EN LA CAJA =======================
   El calculo de totales YA sabia de cupones -se hizo para los pedidos web que
   se pasan a venta- y guarda el tope contra lo que queda despues del descuento
   general. Aca solo se le pone un cupon adelante; la cuenta no se toca. */

async function cuponCajaAplicar() {
  const inp = document.getElementById('ventaCuponCodigo');
  if (!inp) return;
  const crudo = inp.value;
  const codigo = cuponTicketNormalizar(crudo);
  if (!codigo) return;

  /* El formato se mira ANTES de consultar: si esta mal tipeado no hay por que
     ir a la base, y el aviso sale al instante. */
  if (!cuponTicketFormatoOk(codigo)) {
    _ctkAviso('Ese código está mal escrito. Fijate que no falte ni sobre ninguna letra.', false);
    return;
  }

  _ctkAviso('Buscando...', null);
  try {
    const snap = await db.collection('cupones').doc(codigo).get();
    const cupon = snap.exists ? Object.assign({ id: snap.id, codigo: snap.id }, snap.data()) : null;
    const sub = (typeof calcularTotalesVenta === 'function')
      ? calcularTotalesVenta().subtotal : 0;
    const v = cuponTicketValidar(cupon, sub, Date.now());
    if (!v.ok) { _ctkAviso(v.motivo, false); return; }

    window._pedidoCuponVenta = { codigo: codigo, monto: v.monto, id: codigo };
    inp.value = '';
    _ctkPintarAplicado();
    if (typeof renderVentaItems === 'function') renderVentaItems();
    else if (typeof onChangeDescuento === 'function') onChangeDescuento();
  } catch (e) {
    _ctkAviso('No se pudo consultar el cupón: ' + e.message, false);
  }
}

function cuponCajaQuitar() {
  window._pedidoCuponVenta = null;
  _ctkPintarAplicado();
  if (typeof renderVentaItems === 'function') renderVentaItems();
  else if (typeof onChangeDescuento === 'function') onChangeDescuento();
}

function _ctkAviso(txt, ok) {
  const d = document.getElementById('ventaCuponAviso');
  if (!d) return;
  d.textContent = txt || '';
  d.style.color = ok === false ? 'var(--danger)' : (ok === true ? 'var(--accent-light)' : 'var(--text-dim)');
}

function _ctkPintarAplicado() {
  const d = document.getElementById('ventaCuponAplicado');
  const c = window._pedidoCuponVenta;
  if (!d) return;
  if (!c) { d.innerHTML = ''; _ctkAviso(''); return; }
  d.innerHTML = '<span class="ctk-chip"><i class="bi bi-ticket-perforated"></i> ' +
    esc(c.codigo) + ' &middot; -' + _ctkPesos(c.monto) +
    '<button type="button" onclick="cuponCajaQuitar()" title="Quitar">&times;</button></span>';
  _ctkAviso('');
}

/* Se llama al abrir el modal de venta, para que un cupon de la venta anterior no
   quede colgado en pantalla. */
function cuponCajaReset() {
  const inp = document.getElementById('ventaCuponCodigo');
  if (inp) inp.value = '';
  const chk = document.getElementById('ventaEmitirCupon');
  if (chk) chk.checked = false;
  _ctkPintarAplicado();
  cuponTicketPromosPintar();
  cuponEmitirCambio();
}

/* El uso se registra DESPUES de que la venta existe, y con el numero de venta
   adentro: si algo se reclama, hay que poder ir de un cupon a su venta.
   La Cloud Function procesarUsoCupon es la que incrementa `usos` y desactiva el
   cupon al llegar al maximo, asi que aca no se toca el contador: hacerlo
   tambien lo contaria dos veces. */
async function cuponCajaRegistrarUso(ventaId, numero) {
  const c = window._pedidoCuponVenta;
  if (!c || !c.codigo) return;
  try {
    await db.collection('cuponesUsos').doc().set({
      cuponId: c.codigo,
      codigo: c.codigo,
      monto: Number(c.monto || 0),
      fecha: firebase.firestore.FieldValue.serverTimestamp(),
      ventaId: ventaId || null,
      ventaNum: numero || null,
      canal: 'mostrador',
      usuario: (auth && auth.currentUser && auth.currentUser.email) || '',
    });
  } catch (e) {
    /* La venta ya se guardo: no se puede tirar abajo por esto. Se avisa, que es
       lo unico honesto, porque el cupon queda sin marcar como usado. */
    console.warn('cuponesUsos:', e);
    showAdminToast('La venta se guardó, pero no se pudo marcar el cupón como usado: ' +
      e.message, 'error');
  }
}

/* ======================= ENTREGAR UN CUPON =======================
   La cajera tilda, elige la promo, y al guardar sale impreso un codigo propio de
   ese ticket. */

function cuponTicketPromosPintar() {
  const sel = document.getElementById('ventaCuponPromo');
  if (!sel) return;
  const promos = cuponTicketPromosDisponibles(
    typeof cuponesData !== 'undefined' ? cuponesData : []);
  if (!promos.length) {
    sel.innerHTML = '<option value="">No hay promos activas</option>';
    return;
  }
  sel.innerHTML = promos.map(p =>
    '<option value="' + esc(p.id || p.codigo) + '">' +
    esc(p.nombre || p.id || p.codigo) + ' &middot; ' + _ctkPesos(p.monto) +
    (p.limite ? ' desde ' + _ctkPesos(p.limite) : '') + '</option>').join('');
}

function cuponEmitirCambio() {
  const chk = document.getElementById('ventaEmitirCupon');
  const caja = document.getElementById('ventaCuponPromoWrap');
  if (caja) caja.style.display = (chk && chk.checked) ? 'flex' : 'none';
}

/* Genera el codigo y lo guarda. Devuelve lo que hay que imprimir, o null.

   El codigo se sortea y se comprueba que no exista: con 31^6 combinaciones
   chocar es rarisimo, pero "rarisimo" sobre miles de tickets pasa, y si pasara
   se estaria pisando el cupon de otro cliente. */
async function cuponTicketEmitir(ventaId) {
  const chk = document.getElementById('ventaEmitirCupon');
  if (!chk || !chk.checked) return null;
  const sel = document.getElementById('ventaCuponPromo');
  const promoId = sel && sel.value;
  if (!promoId) return null;
  const promo = (typeof cuponesData !== 'undefined' ? cuponesData : [])
    .find(c => (c.id || c.codigo) === promoId);
  if (!promo) return null;

  try {
    let codigo = null;
    for (let intento = 0; intento < 6 && !codigo; intento++) {
      const c = cuponTicketNuevoCodigo();
      const sn = await db.collection('cupones').doc(c).get();
      if (!sn.exists) codigo = c;
    }
    if (!codigo) throw new Error('no pude generar un código libre');

    const dias = Number(promo.diasVigencia) > 0 ? Number(promo.diasVigencia) : 30;
    const datos = cuponTicketDesdePromo(promo, codigo, ventaId, dias, Date.now());
    await db.collection('cupones').doc(codigo).set(datos);
    /* Cuantas se entregaron de esta promo, para poder cortarla al llegar al tope.
       Es distinto de `usos`, que cuenta las canjeadas. */
    await db.collection('cupones').doc(promoId).update({
      entregados: firebase.firestore.FieldValue.increment(1),
    }).catch(() => {});
    if (typeof logAction === 'function') {
      logAction('crear', 'Cupón entregado: ' + codigo + ' (' + _ctkPesos(datos.monto) + ')',
        (promo.nombre || promoId) + ' | venta ' + (ventaId || ''));
    }
    return { codigo: codigo, monto: datos.monto, limite: datos.limite, vence: datos.vence };
  } catch (e) {
    /* La venta ya se guardo. Se avisa y el ticket sale sin cupon, que es mejor
       que imprimir un codigo que no existe en la base. */
    console.warn('cuponTicketEmitir:', e);
    showAdminToast('La venta se guardó, pero no se pudo generar el cupón: ' + e.message, 'error');
    return null;
  }
}


if (typeof window !== 'undefined') {
  window.cuponTicketNuevoCodigo = cuponTicketNuevoCodigo;
  window.cuponTicketNormalizar = cuponTicketNormalizar;
  window.cuponTicketFormatoOk = cuponTicketFormatoOk;
  window.cuponTicketValidar = cuponTicketValidar;
  window.cuponTicketDesdePromo = cuponTicketDesdePromo;
  window.cuponTicketPromosDisponibles = cuponTicketPromosDisponibles;
  window.cuponCajaAplicar = cuponCajaAplicar;
  window.cuponCajaQuitar = cuponCajaQuitar;
  window.cuponCajaReset = cuponCajaReset;
  window.cuponCajaRegistrarUso = cuponCajaRegistrarUso;
  window.cuponTicketPromosPintar = cuponTicketPromosPintar;
  window.cuponEmitirCambio = cuponEmitirCambio;
  window.cuponTicketEmitir = cuponTicketEmitir;
}
