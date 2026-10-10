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

   DOS CAJAS (pedido de la clienta, 10/10/2026): la del local y la de VIANDAS
   (los platos de la cocina). Es la misma caja dos veces, cada una con su plata,
   sus movimientos, su arqueo y su historial, y nunca se juntan. Ver CAJAS más
   abajo: un solo código para las dos.
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
/* La caja que ACABAMOS de cerrar en esta pantalla. Ver confirmarCierre(). */
let _cajaRecienCerrada = null;
let cajaMovs = [];
let cajaVentas = [];
let cajaVentasSueltas = [];
let _movTipo = 'ingreso';
let _movEditandoId = null;   /* null = alta; con id = se esta editando ese movimiento */

/* ============ LAS DOS CAJAS: LA DEL LOCAL Y LA DE VIANDAS ============

   Pedido de la clienta (10/10/2026): una caja APARTE para las viandas, "una copia
   exacta de la caja actual" con su propia plata, que nunca se junta con la del
   local, y que tambien se arquea.

   Cada una vive en su PROPIA coleccion, con su propio puntero de "caja abierta" y su
   propio numero. Si compartieran `cajas`, las consultas de siempre que buscan "la caja
   abierta" sin decir cual (el respaldo de getCajaAbierta, el freno de abrirCaja, el
   fondo sugerido, el historial) agarrarian la otra: la pantalla de la caja del local
   mostraria la de viandas y sus ingresos irian a parar ahi.

   El codigo es UNO SOLO para las dos: cada funcion recibe `k` ('viandas', o nada para
   la del local) y trabaja sobre CAJAS[k]. Copiar el modulo se descarto: un nombre sin
   cambiar pisaba la caja del local, y los arreglos de plata de una no llegaban a la
   otra. La del local sigue guardando su estado en las variables de siempre
   (cajaActual, cajaVentas...), que leen la campanita, el Centro de avisos, los atajos y
   las pruebas; la de viandas, en su objeto. Los ids de la pantalla de viandas son los
   mismos con una "v" adelante: cajaTop -> vCajaTop, cierreModal -> vCierreModal. */
const CAJAS = {
  principal: {
    k: 'principal', col: 'cajas', estadoDoc: 'cajaEstado', countDoc: 'cajasCount',
    seccion: 'caja', nombre: 'Caja', archivo: 'caja', titulo: 'Arqueo de caja',
    get actual() { return cajaActual; }, set actual(v) { cajaActual = v; },
    get movs() { return cajaMovs; }, set movs(v) { cajaMovs = v; },
    get ventas() { return cajaVentas; }, set ventas(v) { cajaVentas = v; },
    get sueltas() { return cajaVentasSueltas; }, set sueltas(v) { cajaVentasSueltas = v; },
    get recienCerrada() { return _cajaRecienCerrada; }, set recienCerrada(v) { _cajaRecienCerrada = v; },
    get cargadaEn() { return _cajaCargadaEn; }, set cargadaEn(v) { _cajaCargadaEn = v; },
    get relectura() { return _cajaRelectura; }, set relectura(v) { _cajaRelectura = v; },
    get historial() { return _cajasHistorial; }, set historial(v) { _cajasHistorial = v; },
    get histPage() { return _cajaHistPage; }, set histPage(v) { _cajaHistPage = v; },
    get movTipo() { return _movTipo; }, set movTipo(v) { _movTipo = v; },
    get movEditandoId() { return _movEditandoId; }, set movEditandoId(v) { _movEditandoId = v; },
    get totalesCierre() { return window._cajaTotalesCierre; }, set totalesCierre(v) { window._cajaTotalesCierre = v; },
    corte: null
  },
  viandas: {
    k: 'viandas', col: 'cajasViandas', estadoDoc: 'cajaViandasEstado', countDoc: 'cajasViandasCount',
    seccion: 'cajaViandas', nombre: 'Caja viandas', archivo: 'cajaviandas', titulo: 'Arqueo de caja de viandas',
    actual: null, movs: [], ventas: [], sueltas: [], recienCerrada: null, cargadaEn: 0, relectura: null,
    historial: [], histPage: 1, movTipo: 'ingreso', movEditandoId: null, totalesCierre: null,
    corte: null
  }
};
/* Cualquier cosa que no sea 'viandas' es la del local: asi las llamadas de siempre,
   sin argumento, siguen yendo a donde iban. */
const _caja = k => (k === 'viandas' ? CAJAS.viandas : CAJAS.principal);
const _cid = (C, id) => (C.k === 'viandas' ? 'v' + id.charAt(0).toUpperCase() + id.slice(1) : id);
const _cel = (C, id) => document.getElementById(_cid(C, id));
/* Lo que va adentro de un onclick para que llame a la misma caja: nada en la del local
   (queda igual que siempre) y 'viandas' en la otra. _ck va solo; C.k en _ckm, despues
   de otro argumento. */
const _ck = C => (C.k === 'viandas' ? "'viandas'" : '');
const _ckm = C => (C.k === 'viandas' ? ",'viandas'" : '');

const _pesos = n => '$' + Number(n || 0).toLocaleString('es-AR');

/* esc() escapa <, > y &, pero NO las comillas, asi que no sirve para meter texto
   del usuario dentro de un atributo: un detalle con comillas rompe el HTML. */
const _attr = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const _fechaHora = ts => (ts && ts.seconds)
  ? new Date(ts.seconds * 1000).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  : '';
/* Un solo formato de numero de venta en todo el sistema: si esto se escribe a
   mano, el detalle de caja y el ticket del cliente muestran numeros distintos
   para la misma venta. */
const _nroVenta = v => (typeof NEGOCIO !== 'undefined' && NEGOCIO.nroVenta && (v.numero || v.nro))
  ? NEGOCIO.nroVenta(v.numero || v.nro)
  : '#' + String(v.numero || v.nro || '-');

const _hora = ts => (ts && ts.seconds)
  ? new Date(ts.seconds * 1000).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
  : '';

/* La fecha de una caja se GUARDA como 'AAAA-MM-DD' (hoyAR): es la fecha argentina del
   dia en que se abrio, y se sigue guardando igual. Esto es solo para mostrarla dada
   vuelta. Se da vuelta a mano y NO con new Date('2026-09-19'): eso la lee como UTC y
   en Argentina la muestra un dia antes. */
function _cajaFecha(f) {
  if (!f) return '';
  if (typeof f === 'string') {
    const m = f.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? m[3] + '/' + m[2] + '/' + m[1] : f;
  }
  const d = (typeof f.toDate === 'function') ? f.toDate() : (f instanceof Date ? f : null);
  if (!d || isNaN(d)) return '';
  const dos = n => String(n).padStart(2, '0');
  return dos(d.getDate()) + '/' + dos(d.getMonth() + 1) + '/' + d.getFullYear();
}

/* ============================ CARGA ============================

   ENTRAR A LA CAJA TARDABA MEDIO SEGUNDO Y ERA CULPA DEL ORDEN.

   Medido el 18/09/2026 contra la base real: las consultas de esta seccion
   tardan entre 65 y 117 ms cada una -son nueve, y traen 22 ventas y 3
   movimientos: nada, el tamanio no es el problema-. Pero se pedian una atras de
   otra, en SEIS tandas encadenadas, y eso daba 520 ms de espera en la base por
   cada visita a la seccion, con el dibujado tardando 2 ms.

   De las seis, solo tres dependen de la anterior:

     tanda 1   cajaConfig  +  cajaEstado  +  historial      (no se necesitan entre si)
     tanda 2   cajas/<id>                                    (necesita el id de la tanda 1)
     tanda 3   ventas+mayoristas+movimientos  +  sueltas     (necesitan la caja)

   Asi quedo: tres idas y vueltas en vez de seis. Las de cada tanda salen juntas.

   Lo que NO cambia: loadCaja() sigue siendo la recarga completa, y sigue
   dejando la pantalla dibujada con lo que hay en la base. La usan abrir caja,
   cerrar caja, los movimientos y el boton Actualizar, y todas esperan eso. */

async function loadCaja(k) {
  const C = _caja(k);
  /* El historial no depende de la caja abierta: sale en la primera tanda y se
     dibuja cuando llega. Se guarda la promesa para no terminar antes que el. */
  const historial = loadHistorialCajas(k);
  const [, caja] = await Promise.all([loadCajaConfig(), getCajaAbierta(k)]);
  C.actual = caja;
  if (C.actual) {
    /* Estas dos tampoco se necesitan entre si: una trae lo de ESTA caja y la
       otra las ventas del dia que quedaron sin caja. */
    await Promise.all([
      cargarDatosCaja(C.actual.docId, k),
      cargarVentasSueltas(C.actual.fecha, k)
    ]);
  } else {
    C.movs = []; C.ventas = []; C.sueltas = [];
  }
  renderCaja(k);
  C.cargadaEn = Date.now();
  await historial;
  /* La campana avisa si la caja quedo abierta de un dia anterior, y eso recien
     se sabe cuando termina de cargarse. */
  if (typeof actualizarBadgeAlertas === 'function') actualizarBadgeAlertas();
}

/* ====================== ENTRAR A LA SECCION ======================

   Lo que se reporto del mostrador: venden tocando V parados en Productos y
   despues entrar a Caja "tarda". Tarda porque switchSection('caja') rehacia
   loadCaja() ENTERO cada vez, aunque se hubiera entrado hace diez segundos.

   Ahora, si ya hay datos cargados y son de hace menos de CAJA_FRESCA_MS, la
   pantalla se dibuja YA con lo que hay en memoria -sin una sola consulta- y la
   relectura sale por detras: cuando llega, se vuelve a dibujar. La espera
   pasa de medio segundo a los 2 ms que tarda el dibujado.

   Por que se puede: la venta recien hecha ya esta en memoria -saveVenta llama a
   cajaRegistrarVenta()-, y los movimientos solo se cargan desde esta misma
   seccion, que recarga al guardarlos. Lo que puede faltar es lo que hizo OTRO
   admin en otra pestania, y EDITAR O BORRAR una venta desde la seccion Ventas:
   en esos casos el primer dibujado muestra el numero viejo y la relectura lo
   corrige medio segundo despues. Se corrige solo; si alguna vez molesta, el
   arreglo es poner _cajaCargadaEn = 0 en esos dos caminos.

   Por que hay un limite de tiempo igual: si el panel quedo abierto toda la
   maniana, dibujar numeros de plata de hace cuatro horas -aunque se corrijan
   medio segundo despues- es mentirle a alguien que esta contando. Pasado ese
   rato se espera la lectura, como antes. */

const CAJA_FRESCA_MS = 5 * 60 * 1000;
let _cajaCargadaEn = 0;      /* cuando termino la ultima carga completa */
let _cajaRelectura = null;   /* la relectura de atras, si hay una en vuelo */

function entrarACaja(k) {
  const C = _caja(k);
  const fresca = C.cargadaEn && (Date.now() - C.cargadaEn) < CAJA_FRESCA_MS;
  if (!fresca) return loadCaja(k);
  renderCaja(k);
  renderHistorialCajas(k);
  /* Una sola relectura a la vez: entrar y salir de la seccion tres veces
     seguidas no puede disparar tres cargas en paralelo. */
  if (!C.relectura) {
    C.relectura = loadCaja(k)
      .catch(e => console.warn('relectura de caja:', e))
      .then(() => { C.relectura = null; });
  }
  return Promise.resolve();
}

/* La llama saveVenta (y saveVentaMay) apenas la venta queda escrita. Sin esto,
   la Caja solo se enteraba de la venta volviendo a consultar la base entera.

   Se agrega a mano en vez de releer porque es EXACTAMENTE lo que se acaba de
   escribir: el documento ya esta en la mano. Y se chequea el docId para que una
   relectura posterior no la deje contada dos veces. */
function cajaRegistrarVenta(venta, tipo) {
  if (!venta || !venta.cajaId) return false;
  /* Va a la caja cuyo id tiene la venta: la del local o la de viandas. El tipo
     (minorista o mayorista) es solo para el desglose de la pantalla. */
  const C = [CAJAS.principal, CAJAS.viandas].find(c => c.actual && c.actual.estado === 'abierta' && c.actual.docId === venta.cajaId);
  if (!C) return false;
  if (venta.docId && C.ventas.some(v => v.docId === venta.docId)) return false;
  C.ventas.push(Object.assign({ _tipo: tipo === 'mayorista' ? 'mayorista' : 'minorista' }, venta));
  renderCaja(C.k);
  return true;
}

async function loadCajaConfig() {
  cajaCfg = Object.assign({}, CAJA_CFG_DEFAULTS);
  try {
    const s = await db.collection('config').doc('cajaConfig').get();
    if (s.exists) Object.assign(cajaCfg, s.data());
  } catch (e) { console.warn('cajaConfig:', e); }
}

async function getCajaAbierta(k) {
  const C = _caja(k);
  /* El puntero vive en su propio documento a propósito: si viviera dentro del
     doc de configuración, cualquier guardado con .set() sin merge lo pisaría y
     las ventas dejarían de estamparse con cajaId sin que nadie se entere. */
  try {
    const p = await db.collection('config').doc(C.estadoDoc).get();
    const id = p.exists ? p.data().cajaAbiertaId : null;
    if (id && id !== C.recienCerrada) {
      const c = await db.collection(C.col).doc(id).get();
      if (c.exists && c.data().estado === 'abierta') return Object.assign({ docId: c.id }, c.data());
    }
  } catch (e) { console.warn('cajaEstado:', e); }
  /* Respaldo: si el puntero quedó desincronizado, buscamos la abierta igual
     (en la colección de ESTA caja: la otra caja nunca aparece acá). */
  try {
    const q = await db.collection(C.col).where('estado', '==', 'abierta').limit(1).get();
    /* Sin descartar la que acabamos de cerrar, este respaldo la resucitaba: la
       relectura puede volver con el estado anterior y la pantalla mostraba la
       caja abierta de nuevo. */
    const d = q.empty ? null : q.docs[0];
    if (d && d.id !== C.recienCerrada) return Object.assign({ docId: d.id }, d.data());
  } catch (e) { console.warn('buscar caja abierta:', e); }
  return null;
}

async function cargarDatosCaja(cajaId, k) {
  const C = _caja(k);
  const ventas = [], movs = [];
  C.ventas = ventas; C.movs = movs;
  try {
    /* La de viandas no mira las mayoristas: las viandas no se venden por mayor. */
    const [vs, vm, mv] = await Promise.all([
      db.collection('ventas').where('cajaId', '==', cajaId).get(),
      C.k === 'viandas' ? null : db.collection('ventasMayoristas').where('cajaId', '==', cajaId).get(),
      db.collection(C.col).doc(cajaId).collection('movimientos').get()
    ]);
    vs.forEach(d => ventas.push(Object.assign({ docId: d.id, _tipo: 'minorista' }, d.data())));
    if (vm) vm.forEach(d => ventas.push(Object.assign({ docId: d.id, _tipo: 'mayorista' }, d.data())));
    mv.forEach(d => movs.push(Object.assign({ docId: d.id }, d.data())));
    movs.sort((a, b) => (b.fecha && b.fecha.seconds || 0) - (a.fecha && a.fecha.seconds || 0));
  } catch (e) { console.warn('cargarDatosCaja:', e); }
}

/* Ventas del día que quedaron sin cajaId: se registraron con la caja cerrada.
   Se muestran aparte para poder adjuntarlas, en vez de que desaparezcan.
   Cada caja ve SOLO las suyas (por `cajaTipo`): una venta de viandas hecha con la
   caja de viandas cerrada no puede terminar adjuntada -con su plata- a la del local,
   ni al revés. Las ventas viejas no tienen `cajaTipo`: son del local. */
async function cargarVentasSueltas(fecha, k) {
  const C = _caja(k);
  const sueltas = [];
  C.sueltas = sueltas;
  if (!fecha) return;
  /* `ventas.fecha` es un Timestamp, no el string 'AAAA-MM-DD': hay que pedir el
     rango del día. Con `== fecha` la consulta no devolvía nunca nada y el aviso
     de ventas fuera de caja no aparecía jamás.
     Sin sufijo Z, `new Date('...T00:00:00')` se interpreta en hora local, que es
     justo como se arma la fecha al registrar la venta. */
  const desde = new Date(fecha + 'T00:00:00');
  const hasta = new Date(fecha + 'T23:59:59.999');
  if (isNaN(desde)) return;
  const esViandas = C.k === 'viandas';
  const buscar = async (col, tipo) => {
    try {
      const q = await db.collection(col).where('fecha', '>=', desde).where('fecha', '<=', hasta).get();
      q.forEach(d => {
        const v = d.data();
        if (!v.cajaId && (v.cajaTipo === 'viandas') === esViandas) sueltas.push(Object.assign({ docId: d.id, _col: col, _tipo: tipo }, v));
      });
    } catch (e) { console.warn('ventas sueltas (' + col + '):', e); }
  };
  await Promise.all(esViandas ? [buscar('ventas', 'minorista')]
    : [buscar('ventas', 'minorista'), buscar('ventasMayoristas', 'mayorista')]);
}

/* ============================ CÁLCULO ============================ */

/* Si un movimiento entra al cajón. Los de siempre no dicen el medio: son efectivo.
   El cobro de un fiado pagado por transferencia o con tarjeta lo dice (pedido de
   Thiago, 10/10/2026): queda anotado en la caja, pero no suma al efectivo esperado.
   Antes sumaba siempre, y el arqueo daba faltante por el monto de la transferencia. */
const _movEnEfectivo = m => !m.medio || m.medio === 'efectivo';

function calcularTotalesCaja(k) {
  const C = _caja(k);
  const porMedio = { efectivo: 0, tarjeta: 0, transferencia: 0, cuenta_corriente: 0, otro: 0 };
  /* Minorista y mayorista por separado. La caja decia "Ventas (3)" y para saber
     QUE se vendio habia que irse a la seccion de ventas y fijarse una por una.
     El dato ya estaba: cargarVentasDeCaja() etiqueta cada una con _tipo al
     traerlas de sus dos colecciones. */
  const porTipo = { minorista: { count: 0, total: 0 }, mayorista: { count: 0, total: 0 } };
  let bruto = 0, envio = 0;
  C.ventas.forEach(v => {
    const mk = (typeof medioKeyDeVenta === 'function') ? medioKeyDeVenta(v) : 'otro';
    const t = Number(v.total || 0);
    porMedio[mk] = (porMedio[mk] || 0) + t;
    const tipo = (v._tipo === 'mayorista') ? 'mayorista' : 'minorista';
    porTipo[tipo].count++;
    porTipo[tipo].total += t;
    bruto += t;
    envio += Number(v.envio || 0);
  });
  /* Lo deshecho no cuenta (ver deshacerMovimiento). */
  const vivos = C.movs.filter(m => m.anulado !== true);
  const ingresos = vivos.filter(m => m.tipo === 'ingreso' && _movEnEfectivo(m)).reduce((s, m) => s + Number(m.monto || 0), 0);
  const ingresosOtros = vivos.filter(m => m.tipo === 'ingreso' && !_movEnEfectivo(m)).reduce((s, m) => s + Number(m.monto || 0), 0);
  const egresos  = vivos.filter(m => m.tipo === 'egreso').reduce((s, m) => s + Number(m.monto || 0), 0);
  /* SOLO efectivo: lo demás no pasó por el cajón */
  const esperado = Number((C.actual && C.actual.montoInicial) || 0) + porMedio.efectivo + ingresos - egresos;
  return { porMedio, porTipo, bruto, envio, ingresos, ingresosOtros, egresos, esperado, count: C.ventas.length };
}

/* ============================ RENDER ============================ */

function renderCaja(k) {
  const C = _caja(k);
  const viandas = C.k === 'viandas';
  const cont = _cel(C, 'cajaTop');
  if (!cont) return;
  const cajaActual = C.actual;   /* la de ESTA pantalla (tapa la global a proposito) */
  if (!cajaActual) {
    cont.innerHTML =
      '<div class="card" style="padding:2rem;text-align:center;max-width:560px;margin:0 auto">' +
        '<i class="bi bi-lock" style="font-size:2rem;line-height:1;display:block;margin-bottom:0.6rem;color:var(--text-dim)"></i>' +
        '<h3 style="font-size:1.1rem;font-weight:700;margin-bottom:0.35rem">' + (viandas ? 'No hay caja de viandas abierta' : 'No hay caja abierta') + '</h3>' +
        '<p style="font-size:0.88rem;color:var(--text-dim);margin-bottom:1.1rem;line-height:1.55">' +
          (viandas
            ? 'Abrí la caja de viandas al empezar el día, con su propio fondo: su plata va aparte de la del local. ' +
              'Las ventas de viandas registradas con esta caja cerrada quedan fuera del arqueo, pero pueden adjuntarse después.'
            : 'Abra la caja al empezar el día. Las ventas del local registradas con la caja cerrada ' +
              'quedan fuera del arqueo, pero pueden adjuntarse después.') + '</p>' +
        '<button class="btn btn-primary" style="width:auto" onclick="openAbrirCajaModal(' + _ck(C) + ')">' +
          '<i class="bi bi-unlock"></i> ' + (viandas ? 'Abrir caja de viandas' : 'Abrir caja') + '</button>' +
      '</div>';
    return;
  }
  const t = calcularTotalesCaja(k);
  const fila = (etq, val, extra) =>
    '<div style="display:flex;justify-content:space-between;padding:0.42rem 0;font-size:0.9rem;' + (extra || '') + '">' +
      '<span style="color:var(--text-dim)">' + etq + '</span><span style="font-weight:600">' + val + '</span></div>';

  cont.innerHTML =
    '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(290px,1fr));gap:1rem;margin-bottom:1rem">' +
      '<div class="card" style="padding:1.25rem">' +
        '<div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.85rem">' +
          '<span style="width:9px;height:9px;border-radius:50%;background:#5FA87A;flex:0 0 auto"></span>' +
          '<h3 style="font-size:1rem;font-weight:700;flex:1">' + C.nombre + ' #' + String(cajaActual.numero || 0).padStart(4, '0') + ' abierta</h3>' +
        '</div>' +
        '<p style="font-size:0.78rem;color:var(--text-dim);margin-bottom:0.6rem">' +
          'Abierta por ' + esc(cajaActual.abiertoPor || '-') +
          (cajaActual.fecha ? ' - abierta el ' + esc(_cajaFecha(cajaActual.fecha)) : '') + '</p>' +
        /* Aviso de caja vieja. Cuando se olvidan de cerrarla, getCajaAbiertaIdLive solo mira
           estado==='abierta' y le estampa a las ventas de HOY el cajaId de la caja de AYER:
           entran a su arqueo (por eso el efectivo cierra) pero el dia de hoy aparece en
           Estadisticas como "ventas sin caja", y el arqueo de ayer termina mezclando dos dias.
           La pantalla no mostraba de que dia era la caja, asi que el olvido no se notaba
           hasta el cierre, con el desastre ya hecho. */
        ((typeof hoyAR === 'function' && cajaActual.fecha && cajaActual.fecha !== hoyAR())
          ? '<p style="font-size:0.78rem;color:#EDB833;font-weight:600;margin-bottom:0.6rem">' +
              '<i class="bi bi-exclamation-triangle"></i> Esta caja quedó abierta del ' +
              esc(_cajaFecha(cajaActual.fecha)) + ': todo lo que se venda hoy entra a SU arqueo.</p>'
          : '') +
        fila('Fondo inicial', _pesos(cajaActual.montoInicial)) +
        fila('Ventas (' + t.count + ')', _pesos(t.bruto)) +
        /* La de viandas no tiene desglose: todas son ventas de viandas. */
        (viandas ? '' :
          fila('&nbsp;&nbsp;· Minorista - ' + _nVentas(t.porTipo.minorista.count), _pesos(t.porTipo.minorista.total)) +
          fila('&nbsp;&nbsp;· Mayorista - ' + _nVentas(t.porTipo.mayorista.count), _pesos(t.porTipo.mayorista.total))) +
        (t.count
          ? '<div style="display:flex;justify-content:flex-end;padding:0.1rem 0 0.35rem">' +
              '<button class="btn btn-secondary" style="width:auto;flex:0 0 auto;padding:0.3rem 0.75rem;font-size:0.78rem" ' +
              'onclick="openCajaVentasModal(' + _ck(C) + ')"><i class="bi bi-list-ul"></i> Ver ventas</button></div>'
          : '') +
        fila('&nbsp;&nbsp;· en efectivo', _pesos(t.porMedio.efectivo)) +
        fila('&nbsp;&nbsp;· tarjeta / transferencia', _pesos(t.porMedio.tarjeta + t.porMedio.transferencia)) +
        (t.porMedio.cuenta_corriente ? fila('&nbsp;&nbsp;· fiado (no entra al cajón)', _pesos(t.porMedio.cuenta_corriente)) : '') +
        fila('Ingresos', '+ ' + _pesos(t.ingresos)) +
        (t.ingresosOtros ? fila('&nbsp;&nbsp;· cobros por transferencia o tarjeta (no entran al cajón)', _pesos(t.ingresosOtros)) : '') +
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
        '<button class="btn btn-secondary" onclick="openMovModal(\'ingreso\'' + _ckm(C) + ')"><i class="bi bi-arrow-down-circle"></i> Registrar ingreso</button>' +
        '<button class="btn btn-secondary" onclick="openMovModal(\'egreso\'' + _ckm(C) + ')"><i class="bi bi-arrow-up-circle"></i> Registrar egreso</button>' +
        '<button class="btn btn-secondary" onclick="openCorteParcial(' + _ck(C) + ')"><i class="bi bi-eyeglasses"></i> Corte parcial</button>' +
        '<div style="flex:1"></div>' +
        '<button class="btn btn-primary" onclick="openCierreModal(' + _ck(C) + ')"><i class="bi bi-lock"></i> ' +
          (viandas ? 'Cerrar caja de viandas y arquear' : 'Cerrar caja y arquear') + '</button>' +
      '</div>' +
    '</div>' +
    renderVentasSueltas(k) +
    renderMovimientos(k);
}

/* El badge de editado. Muestra quien, cuando y el motivo si lo pusieron; el
   motivo es opcional a proposito, pero el rastro de que se toco no lo es. */
function _badgeEditado(m) {
  if (!m.editado) return '';
  const partes = [];
  if (m.editadoPor) partes.push('por ' + m.editadoPor);
  if (m.editadoEn && m.editadoEn.seconds) partes.push('el ' + _fechaHora(m.editadoEn));
  const n = (m.ediciones && m.ediciones.length) || 1;
  if (n > 1) partes.push('(' + n + ' ediciones)');
  const motivo = m.motivoEdicion ? '\nMotivo: ' + m.motivoEdicion : '\nSin motivo indicado';
  return ' <span class="badge-editado" title="' + _attr('Editado ' + partes.join(' ') + motivo) + '">EDITADO</span>';
}

/* Una fila de movimiento. `editable` agrega el boton de lapiz. En el detalle de
   una caja CERRADA va en false: los totales de esa caja ya quedaron congelados,
   y cambiarle el monto a un movimiento los dejaria mintiendo. */
function _filaMovimiento(m, editable, k) {
  const C = _caja(k);
  const esIng = m.tipo === 'ingreso';
  const etq = (CAJA_CONCEPTOS[m.tipo] && CAJA_CONCEPTOS[m.tipo][m.concepto]) || m.concepto || '-';
  /* Deshecho: se ve tachado y sin botones; ya no cuenta en la caja. */
  const deshecho = m.anulado === true;
  const monto = (esIng ? '+ ' : '− ') + _pesos(m.monto);
  return '<tr' + (deshecho ? ' class="mov-deshecho"' : '') + '>' +
    '<td style="white-space:nowrap;color:var(--text-dim);font-size:0.8rem;padding:0.5rem 0.6rem">' + _hora(m.fecha) + '</td>' +
    '<td style="padding:0.5rem 0.6rem"><span style="font-weight:600">' + esc(etq) + '</span>' + _badgeMedio(m) + _badgeEditado(m) + _badgeDeshecho(m) + '</td>' +
    '<td style="color:var(--text-dim);font-size:0.85rem;padding:0.5rem 0.6rem">' + esc(m.detalle || '') + '</td>' +
    '<td style="text-align:right;white-space:nowrap;font-weight:700;padding:0.5rem 0.6rem;color:' + (deshecho ? 'var(--text-dim)' : (esIng ? '#5FA87A' : '#e54545')) + '">' +
      (deshecho ? '<s>' + monto + '</s>' : monto) + '</td>' +
    (editable
      ? '<td style="text-align:right;white-space:nowrap;padding:0.5rem 0.6rem">' + (deshecho ? '' :
          /* Uno al lado del otro: .btn-icon es flex y solos se apilaban. */
          '<span style="display:inline-flex;gap:4px">' +
          '<button class="btn-icon" title="Editar este movimiento" onclick="openMovModalEdit(\'' + _attr(m.docId) + '\'' + _ckm(C) + ')">' +
          '<i class="bi bi-pencil"></i></button>' +
          '<button class="btn-icon" title="Deshacer este movimiento" onclick="deshacerMovimiento(\'' + _attr(m.docId) + '\'' + _ckm(C) + ')">' +
          '<i class="bi bi-arrow-counterclockwise"></i></button></span>') + '</td>'
      : '') +
  '</tr>';
}

/* El medio de un cobro que no fue en efectivo: se ve al lado del concepto, porque
   esa plata no está en el cajón (ver _movEnEfectivo). */
const _MOV_MEDIO_NOMBRE = { transferencia: 'Transferencia', tarjeta: 'Tarjeta' };
function _badgeMedio(m) {
  if (_movEnEfectivo(m)) return '';
  return ' <span class="badge-medio" title="No entra al cajón: no suma al efectivo esperado">' +
    esc((_MOV_MEDIO_NOMBRE[m.medio] || m.medio).toUpperCase()) + '</span>';
}

/* El cartel de deshecho: quien y cuando, como el de editado. */
function _badgeDeshecho(m) {
  if (m.anulado !== true) return '';
  const partes = [];
  if (m.anuladoPor) partes.push('por ' + m.anuladoPor);
  if (m.anuladoEn && m.anuladoEn.seconds) partes.push('el ' + _fechaHora(m.anuladoEn));
  return ' <span class="badge-deshecho" title="' + _attr('Deshecho ' + partes.join(' ') + '. Ya no cuenta en la caja.') + '">DESHECHO</span>';
}

function renderMovimientos(k) {
  const C = _caja(k);
  if (!C.movs.length) {
    return '<div class="card" style="padding:1.1rem"><p style="font-size:0.85rem;color:var(--text-dim)">' +
           'Todavía no hay movimientos en esta caja.</p></div>';
  }
  const filas = C.movs.map(m => _filaMovimiento(m, true, k)).join('');
  return '<div class="card" style="padding:0;overflow:hidden">' +
    '<div style="padding:1rem 1.25rem;border-bottom:1px solid var(--border)"><h3 style="font-size:0.95rem;font-weight:700">Movimientos de esta caja</h3></div>' +
    '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse">' +
    '<tbody>' + filas + '</tbody></table></div></div>';
}

function renderVentasSueltas(k) {
  const C = _caja(k);
  if (!C.sueltas.length) return '';
  return '<div class="card" style="padding:1.1rem 1.25rem;margin-bottom:1rem;border-left:3px solid #EDB833">' +
    '<h3 style="font-size:0.95rem;font-weight:700;margin-bottom:0.3rem">' +
      (C.k === 'viandas' ? 'Ventas de viandas fuera de caja (' : 'Ventas fuera de caja (') + C.sueltas.length + ')</h3>' +
    '<p style="font-size:0.83rem;color:var(--text-dim);line-height:1.5;margin-bottom:0.8rem">' +
      'Se registraron hoy con la caja cerrada, así que no entran al arqueo. ' +
      'Si corresponden a esta caja, adjuntalas.</p>' +
    '<button class="btn btn-secondary" style="width:auto" onclick="adjuntarVentasSueltas(' + _ck(C) + ')">' +
      '<i class="bi bi-paperclip"></i> Adjuntar a esta caja</button></div>';
}

/* ============ HISTORIAL: CARGA, FILTRO Y PAGINADO ============

   La carga y el dibujado estan separados a proposito: cambiar el mes vuelve a
   consultar Firestore (loadHistorialCajas), pero cambiar el filtro de diferencia
   o pasar de pagina trabaja sobre lo que ya esta en memoria (renderHistorialCajas)
   y no cuesta ni una lectura.

   El filtro por mes usa el rango sobre `fecha`, que es el string 'AAAA-MM-DD':
   se compara alfabeticamente y no necesita indice compuesto. Es el mismo patron
   que ya usa admin-stats.js para traer las cajas del mes. */

const CAJAS_HIST_LIMITE = 120;   /* techo cuando no hay mes elegido */
let _cajaHistPage = 1;

async function loadHistorialCajas(k) {
  const C = _caja(k);
  const cont = _cel(C, 'cajaHistorial');
  if (!cont) return;
  const sel = _cel(C, 'cajaHistMes');
  /* Las opciones se arman una sola vez. noDefault=true para que arranque en
     "Todos los meses" y la pantalla no esconda las cajas apenas se abre. */
  if (sel && !sel.options.length && typeof _buildMesOptions === 'function') _buildMesOptions(_cid(C, 'cajaHistMes'), true);
  const mes = sel ? sel.value : '';
  /* Solo si no hay nada dibujado. Cuando la relectura corre por detras -entrar a
     la seccion con datos frescos-, pisar la tabla con "Cargando..." hacia
     parpadear el historial que ya se estaba viendo. */
  if (!C.historial.length) cont.innerHTML = '<p style="font-size:0.85rem;color:var(--text-dim)">Cargando...</p>';
  let docs = [];
  try {
    let q = db.collection(C.col);
    q = mes
      ? q.where('fecha', '>=', mes + '-01').where('fecha', '<=', mes + '-31').orderBy('fecha', 'desc')
      : q.orderBy('abiertoEn', 'desc').limit(CAJAS_HIST_LIMITE);
    const snap = await q.get();
    snap.forEach(d => docs.push(Object.assign({ docId: d.id }, d.data())));
  } catch (e) {
    console.warn('historial cajas:', e);
    cont.innerHTML = '<p style="font-size:0.85rem;color:var(--danger)">No se pudo cargar el historial: ' + esc(e.message) + '</p>';
    return;
  }
  /* Se cachean para que el detalle y la impresion no vuelvan a consultar la caja:
     ya la tenemos entera acá, y son los totales congelados, no cambian. */
  C.historial = docs.filter(c => c.estado === 'cerrada');
  C.histPage = 1;
  renderHistorialCajas(k);
}

function _cajasFiltradas(k) {
  const C = _caja(k);
  const f = (_cel(C, 'cajaHistDif') || {}).value || '';
  return C.historial.filter(c => {
    const d = Number(c.diferencia || 0);
    if (f === 'con') return d !== 0;
    if (f === 'exactas') return d === 0;
    if (f === 'faltante') return d < 0;
    if (f === 'sobrante') return d > 0;
    return true;
  });
}

function renderHistorialCajas(k) {
  const C = _caja(k);
  const cont = _cel(C, 'cajaHistorial');
  if (!cont) return;
  const resumen = _cel(C, 'cajaHistResumen');
  const cerradas = _cajasFiltradas(k);

  if (resumen) {
    const mes = (_cel(C, 'cajaHistMes') || {}).value || '';
    const suma = cerradas.reduce((s, c) => s + Number(c.diferencia || 0), 0);
    const conDif = cerradas.filter(c => Number(c.diferencia || 0) !== 0).length;
    /* Si hay tope, se dice: un "0 cajas" por recorte silencioso se lee como
       "no hubo movimiento", que es una conclusion muy distinta. */
    const tope = (!mes && C.historial.length >= CAJAS_HIST_LIMITE)
      ? ' · se muestran las últimas ' + CAJAS_HIST_LIMITE + ', elegí un mes para ver más atrás' : '';
    resumen.innerHTML = cerradas.length
      ? cerradas.length + ' caja' + (cerradas.length !== 1 ? 's' : '') + ' · ' + conDif + ' con diferencia · ' +
        'saldo acumulado ' + (suma > 0 ? '+' : '') + _pesos(suma) + tope
      : '';
  }

  if (!cerradas.length) {
    cont.innerHTML = '<p style="font-size:0.85rem;color:var(--text-dim)">No hay cajas cerradas que coincidan con el filtro.</p>';
    if (typeof removePagination === 'function') removePagination(_cid(C, 'cajaHistPager'));
    return;
  }

  const porPagina = (typeof ADMIN_PER_PAGE !== 'undefined') ? ADMIN_PER_PAGE : 20;
  const totalPaginas = Math.ceil(cerradas.length / porPagina);
  if (C.histPage > totalPaginas) C.histPage = totalPaginas || 1;
  const pagina = cerradas.slice((C.histPage - 1) * porPagina, C.histPage * porPagina);

  const filas = pagina.map(c => {
    const dif = Number(c.diferencia || 0);
    const color = dif === 0 ? '#5FA87A' : (dif > 0 ? '#EDB833' : '#e54545');
    const etq = dif === 0 ? 'exacta' : (dif > 0 ? 'sobrante' : 'faltante');
    return '<tr>' +
      '<td style="white-space:nowrap">#' + String(c.numero || 0).padStart(4, '0') + '</td>' +
      '<td style="white-space:nowrap">' + esc(_cajaFecha(c.fecha)) + '</td>' +
      '<td style="text-align:right;white-space:nowrap">' + _pesos(c.ventasBruto) + '</td>' +
      '<td style="text-align:right;white-space:nowrap">' + _pesos(c.esperadoEfectivo) + '</td>' +
      '<td style="text-align:right;white-space:nowrap">' + _pesos(c.contadoEfectivo) + '</td>' +
      '<td style="text-align:right;white-space:nowrap;color:' + color + ';font-weight:700">' +
        (dif > 0 ? '+' : '') + _pesos(dif) + ' <span style="font-size:0.72rem;font-weight:500">' + etq + '</span></td>' +
      '<td style="font-size:0.8rem;color:var(--text-dim)">' + esc(c.motivoDiferencia || '') +
        (c.editadaPostCierre ? ' <span title="Se editó una venta de esta caja después de cerrarla" style="background:rgba(237,184,51,0.18);color:#EDB833;padding:1px 6px;border-radius:4px;font-size:0.68rem;font-weight:700">EDITADA</span>' : '') +
      '</td>' +
      '<td style="text-align:right;white-space:nowrap;padding:0.4rem 0.6rem">' +
        '<button class="btn btn-sm btn-secondary" style="width:auto" onclick="abrirMenuCaja(event,\'' + _attr(c.docId) + '\'' + _ckm(C) + ')">' +
        'Acciones <i class="bi bi-chevron-down" style="font-size:0.7rem"></i></button></td>' +
    '</tr>';
  }).join('');
  cont.innerHTML = '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:0.88rem">' +
    '<thead><tr style="text-align:left;color:var(--text-dim);font-size:0.72rem;text-transform:uppercase;letter-spacing:0.5px">' +
      '<th style="padding:0.5rem 0.6rem">Caja</th><th>Fecha</th><th style="text-align:right">Ventas</th>' +
      '<th style="text-align:right">Esperado</th><th style="text-align:right">Contado</th>' +
      '<th style="text-align:right">Diferencia</th><th>Motivo</th><th></th></tr></thead>' +
    '<tbody>' + filas + '</tbody></table></div>';

  if (typeof renderAdminPagination === 'function')
    renderAdminPagination(_cid(C, 'cajaHistPager'), C.histPage, totalPaginas, cerradas.length, C.k === 'viandas' ? 'cajasViandas' : 'cajas');
}

/* Cambiar el filtro TIENE que volver a la pagina 1. Sin esto, si estabas en la
   pagina 2 y filtras "con faltante", el paginador clampea y te deja en la ultima
   pagina del resultado nuevo: filtras 24 cajas y ves 4. La conclusion natural es
   "casi no hubo faltantes", que es exactamente lo contrario de lo que pasa.
   Es el mismo problema que admin-pagination.js ya resuelve para el catalogo. */
function cajaHistFiltrar(k) {
  _caja(k).histPage = 1;
  renderHistorialCajas(k);
}

/* Lo llama adminGoPage('cajas', n) -o 'cajasViandas'- desde los botones del paginador. */
function cajaHistGoPage(n, k) {
  const C = _caja(k);
  C.histPage = n;
  renderHistorialCajas(k);
  const cont = _cel(C, 'cajaHistorial');
  if (cont) cont.scrollIntoView({ block: 'nearest' });
}

/* ============================ MENU "ACCIONES" ============================

   Se monta en <body> con position:fixed en vez de dentro de la celda. La tabla
   del historial vive en un contenedor con overflow-x:auto, y ahi adentro un menu
   absolute queda recortado por el scroll horizontal: en pantallas angostas el
   menu aparecia cortado o directamente invisible. */
let _cajasHistorial = [];
let _menuCajaAbierto = null;

function cerrarMenuCaja() {
  if (_menuCajaAbierto) { _menuCajaAbierto.remove(); _menuCajaAbierto = null; }
  document.removeEventListener('mousedown', _menuCajaFuera, true);
  document.removeEventListener('keydown', _menuCajaEsc, true);
  window.removeEventListener('resize', cerrarMenuCaja);
  /* true: los scroll de los contenedores internos no burbujean, hay que
     escucharlos en fase de captura o el menu queda flotando lejos del boton. */
  window.removeEventListener('scroll', cerrarMenuCaja, true);
}
function _menuCajaFuera(e) { if (_menuCajaAbierto && !_menuCajaAbierto.contains(e.target)) cerrarMenuCaja(); }
function _menuCajaEsc(e) { if (e.key === 'Escape') cerrarMenuCaja(); }

function abrirMenuCaja(ev, cajaId, k) {
  ev.stopPropagation();
  const yaEra = _menuCajaAbierto && _menuCajaAbierto.dataset.caja === cajaId;
  cerrarMenuCaja();
  if (yaEra) return;   /* segundo click en el mismo boton: cierra */

  const menu = document.createElement('div');
  menu.className = 'menu-acciones';
  menu.dataset.caja = cajaId;
  menu.innerHTML =
    '<button type="button" data-act="detalle"><i class="bi bi-eye"></i> Ver detalles</button>' +
    '<button type="button" data-act="export"><i class="bi bi-printer"></i> Imprimir y exportar</button>';
  document.body.appendChild(menu);

  const r = ev.currentTarget.getBoundingClientRect();
  /* Se mide DESPUES de insertarlo: antes el alto es 0 y el menu se salia por abajo. */
  const alto = menu.offsetHeight, ancho = menu.offsetWidth;
  let top = r.bottom + 4;
  if (top + alto > window.innerHeight - 8) top = Math.max(8, r.top - alto - 4);
  menu.style.top = top + 'px';
  menu.style.left = Math.max(8, Math.min(r.right - ancho, window.innerWidth - ancho - 8)) + 'px';

  menu.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    const act = b.dataset.act;
    cerrarMenuCaja();
    if (act === 'detalle') openCajaDetalle(cajaId, k);
    else if (act === 'export') openCajaExportModal(cajaId, k);
  });

  _menuCajaAbierto = menu;
  document.addEventListener('mousedown', _menuCajaFuera, true);
  document.addEventListener('keydown', _menuCajaEsc, true);
  window.addEventListener('resize', cerrarMenuCaja);
  window.addEventListener('scroll', cerrarMenuCaja, true);
}

/* ============================ DETALLE DE UNA CAJA ============================

   Todo lo que se muestra de una caja cerrada sale de los campos CONGELADOS del
   documento (esperadoEfectivo, contadoEfectivo, ventasPorMedio...). No se
   recalcula nada: si mañana editan una venta de aquel dia, este detalle tiene
   que seguir diciendo lo que se conto aquel dia. Lo unico que se va a buscar
   son los movimientos y las ventas, que son el respaldo de esos numeros. */

let _cajaDetalle = null;        /* { caja, movs, ventas, k } de la ultima caja abierta (el corte
                                   parcial de cada caja queda en CAJAS[k].corte) */

/* El detalle y la impresion se comparten entre las dos cajas: `k` dice de cual es, y
   viaja en el resultado para que el titulo y el nombre del archivo digan "viandas". */
async function cargarDetalleCaja(cajaId, k) {
  const C = _caja(k);
  let caja = C.historial.find(c => c.docId === cajaId) || null;
  if (!caja) {
    const s = await db.collection(C.col).doc(cajaId).get();
    if (!s.exists) throw new Error('La caja ya no existe');
    caja = Object.assign({ docId: s.id }, s.data());
  }
  const [mv, vs, vm] = await Promise.all([
    db.collection(C.col).doc(cajaId).collection('movimientos').get(),
    db.collection('ventas').where('cajaId', '==', cajaId).get(),
    C.k === 'viandas' ? null : db.collection('ventasMayoristas').where('cajaId', '==', cajaId).get()
  ]);
  const movs = [];
  mv.forEach(d => movs.push(Object.assign({ docId: d.id }, d.data())));
  movs.sort((a, b) => (a.fecha && a.fecha.seconds || 0) - (b.fecha && b.fecha.seconds || 0));
  const ventas = [];
  vs.forEach(d => ventas.push(Object.assign({ docId: d.id, _tipo: 'minorista' }, d.data())));
  if (vm) vm.forEach(d => ventas.push(Object.assign({ docId: d.id, _tipo: 'mayorista' }, d.data())));
  ventas.sort((a, b) => (a.fecha && a.fecha.seconds || 0) - (b.fecha && b.fecha.seconds || 0));
  return { caja, movs, ventas, k: C.k };
}

async function openCajaDetalle(cajaId, k) {
  const body = document.getElementById('cajaDetalleBody');
  if (!body) return;
  body.innerHTML = '<p style="font-size:0.88rem;color:var(--text-dim)">Cargando...</p>';
  document.getElementById('cajaDetalleModal').classList.add('show');
  try {
    _cajaDetalle = await cargarDetalleCaja(cajaId, k);
    document.getElementById('cajaDetalleTitulo').innerHTML =
      '<i class="bi bi-receipt-cutoff"></i> ' + _caja(k).nombre + ' #' + String(_cajaDetalle.caja.numero || 0).padStart(4, '0') +
      ' <span style="font-weight:400;color:var(--text-dim);font-size:0.9rem">· ' + esc(_cajaFecha(_cajaDetalle.caja.fecha)) + '</span>';
    body.innerHTML = renderCajaDetalle(_cajaDetalle);
  } catch (e) {
    body.innerHTML = '<p style="font-size:0.88rem;color:var(--danger)">No se pudo cargar: ' + esc(e.message) + '</p>';
  }
}
function closeCajaDetalleModal() { document.getElementById('cajaDetalleModal').classList.remove('show'); }

/* ============================ VENTAS DE LA CAJA ============================
   Las ventas de la caja abierta, minoristas de un lado y mayoristas del otro.
   Antes la caja solo decia cuantas eran en total: para saber que se habia
   vendido habia que salir a la seccion de ventas y revisar una por una.

   Se arma con lo que ya esta en memoria (cajaVentas), asi que no cuesta ninguna
   lectura de Firebase. */

function _nVentas(n) {
  n = Number(n || 0);
  return n + (n === 1 ? ' venta' : ' ventas');
}

const _MEDIO_NOMBRE = {
  efectivo: 'Efectivo', tarjeta: 'Tarjeta', transferencia: 'Transferencia',
  cuenta_corriente: 'Fiado', otro: 'Otro',
};

function _columnaVentas(titulo, icono, lista) {
  const total = lista.reduce((s, v) => s + Number(v.total || 0), 0);
  const filas = lista.length
    ? lista.map(v => {
        const medio = (typeof medioKeyDeVenta === 'function') ? medioKeyDeVenta(v) : 'otro';
        const items = Array.isArray(v.items) ? v.items : [];
        const detalle = items.map(i => {
          const cant = (typeof fmtCantidad === 'function') ? fmtCantidad(i) : String(i.cantidad || 0);
          return '<div style="display:flex;justify-content:space-between;gap:0.6rem;font-size:0.76rem;color:var(--text-dim);padding:0.08rem 0">' +
            '<span>' + esc(i.nombre || '(sin nombre)') + ' <span style="opacity:0.75">x' + esc(cant) + '</span></span>' +
            '<span style="white-space:nowrap">' + _pesos((typeof subtotalItem === 'function') ? subtotalItem(i) : 0) + '</span></div>';
        }).join('');
        return '<div style="border:1px solid var(--border);border-radius:8px;padding:0.6rem 0.7rem;margin-bottom:0.5rem">' +
          '<div style="display:flex;justify-content:space-between;gap:0.6rem;align-items:baseline;margin-bottom:0.25rem">' +
            '<span style="font-weight:700;font-size:0.86rem">' + esc(_nroVenta(v)) + '</span>' +
            '<span style="font-weight:700;font-size:0.9rem;white-space:nowrap">' + _pesos(v.total) + '</span>' +
          '</div>' +
          '<div style="display:flex;justify-content:space-between;gap:0.6rem;font-size:0.78rem;color:var(--text-dim);margin-bottom:' +
            (detalle ? '0.4rem' : '0') + '">' +
            '<span>' + esc(v.cliente || 'Consumidor final') + '</span>' +
            '<span style="white-space:nowrap">' + _hora(v.fecha) + ' &middot; ' + esc(_MEDIO_NOMBRE[medio] || medio) + '</span>' +
          '</div>' + detalle +
        '</div>';
      }).join('')
    : '<p style="font-size:0.83rem;color:var(--text-dim);padding:0.5rem 0">No hubo ventas de este tipo en la caja.</p>';

  return '<div>' +
    '<div style="display:flex;justify-content:space-between;align-items:baseline;gap:0.6rem;' +
      'border-bottom:1px solid var(--border);padding-bottom:0.45rem;margin-bottom:0.6rem">' +
      '<h4 style="font-size:0.92rem;font-weight:700"><i class="bi ' + icono + '"></i> ' + titulo + '</h4>' +
      '<span style="font-size:0.78rem;color:var(--text-dim);white-space:nowrap">' +
        _nVentas(lista.length) + ' &middot; ' + _pesos(total) + '</span>' +
    '</div>' + filas + '</div>';
}

/* El dialogo de ventas a detalle, en dos columnas. Lo usan la caja y el
   calendario de Estadisticas: es el mismo dialogo con otra lista, asi que hay uno
   solo. Duplicarlo era la forma segura de que dentro de tres meses uno tuviera un
   arreglo que el otro no. */
/* Las de viandas van en su propia columna (`cajaTipo`). La caja de viandas solo
   tiene esas (soloViandas); el calendario de Estadisticas puede tener de las tres. */
function abrirVentasDetalle(titulo, lista, soloViandas) {
  const body = document.getElementById('ventasDetalleBody');
  const modal = document.getElementById('ventasDetalleModal');
  const tit = document.getElementById('ventasDetalleTitulo');
  if (!body || !modal) return;
  if (tit) tit.innerHTML = '<i class="bi bi-list-ul"></i> ' + esc(titulo);
  const vds = (lista || []).filter(v => v.cajaTipo === 'viandas');
  const men = (lista || []).filter(v => v._tipo !== 'mayorista' && v.cajaTipo !== 'viandas');
  const may = (lista || []).filter(v => v._tipo === 'mayorista' && v.cajaTipo !== 'viandas');
  body.innerHTML =
    '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(290px,1fr));gap:1.25rem">' +
      (soloViandas ? _columnaVentas('Ventas de viandas', 'bi-egg-fried', vds) :
        _columnaVentas('Ventas minoristas', 'bi-bag', men) +
        _columnaVentas('Ventas mayoristas', 'bi-box-seam', may) +
        (vds.length ? _columnaVentas('Ventas de viandas', 'bi-egg-fried', vds) : '')) +
    '</div>';
  modal.classList.add('show');
}

function openCajaVentasModal(k) {
  const C = _caja(k);
  abrirVentasDetalle(C.k === 'viandas' ? 'Ventas de esta caja de viandas' : 'Ventas de esta caja', C.ventas, C.k === 'viandas');
}

function cerrarVentasDetalle() { document.getElementById('ventasDetalleModal').classList.remove('show'); }

function irASeccionVentas(cual) {
  /* Decia closeCajaVentasModal(), que dejo de existir cuando el dialogo se hizo
     generico y paso a llamarse cerrarVentasDetalle(). Como la llamada estaba
     adentro de una funcion y no en un onclick, no reventaba al cargar la pagina:
     reventaba recien al apretar el boton, y como es la PRIMERA linea, la funcion
     moria ahi y no cambiaba de seccion. Desde afuera se veia como un boton que
     "no hace nada". */
  cerrarVentasDetalle();
  if (typeof switchSection === 'function') switchSection(cual === 'mayorista' ? 'ventasMay' : (cual === 'viandas' ? 'ventasViandas' : 'ventas'));
}

function abrirExportDesdeDetalle() {
  if (!_cajaDetalle) return;
  closeCajaDetalleModal();
  openCajaExportModal(_cajaDetalle.caja.docId, _cajaDetalle.k);
}

function renderCajaDetalle(d) {
  const c = d.caja;
  const dif = Number(c.diferencia || 0);
  const colorDif = dif === 0 ? '#5FA87A' : (dif > 0 ? '#EDB833' : '#e54545');
  const etqDif = dif === 0 ? 'La caja cerró exacta' : (dif > 0 ? 'Sobró ' + _pesos(dif) : 'Faltó ' + _pesos(Math.abs(dif)));

  const fila = (etq, val, fuerte) =>
    '<div style="display:flex;justify-content:space-between;gap:1rem;padding:0.33rem 0;font-size:0.87rem">' +
      '<span style="color:var(--text-dim)">' + etq + '</span>' +
      '<span style="font-weight:' + (fuerte ? '700' : '600') + ';white-space:nowrap">' + val + '</span></div>';

  const medios = c.ventasPorMedio || {};
  const nombresMedio = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', transferencia: 'Transferencia', cuenta_corriente: 'Fiado', otro: 'Otro' };
  const filasMedio = Object.keys(nombresMedio)
    .filter(k => Number(medios[k] || 0) !== 0)
    .map(k => fila(nombresMedio[k], _pesos(medios[k]))).join('') ||
    '<p style="font-size:0.83rem;color:var(--text-dim)">No hubo ventas en esta caja.</p>';

  const movs = d.movs.length
    ? '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse">' +
      '<tbody>' + d.movs.map(m => _filaMovimiento(m, false)).join('') + '</tbody></table></div>'
    : '<p style="font-size:0.83rem;color:var(--text-dim)">Sin movimientos.</p>';

  const ventas = d.ventas.length
    ? '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:0.85rem">' +
      '<tbody>' + d.ventas.map(v => {
        const medio = (typeof medioKeyDeVenta === 'function') ? medioKeyDeVenta(v) : 'otro';
        return '<tr>' +
          '<td style="padding:0.42rem 0.6rem;color:var(--text-dim);white-space:nowrap;font-size:0.8rem">' + _hora(v.fecha) + '</td>' +
          '<td style="padding:0.42rem 0.6rem;white-space:nowrap">' + esc(_nroVenta(v)) + '</td>' +
          '<td style="padding:0.42rem 0.6rem">' + esc(v.cliente || 'Consumidor final') +
            (v._tipo === 'mayorista' ? ' <span style="font-size:0.68rem;color:var(--text-dim)">MAY</span>' : '') + '</td>' +
          '<td style="padding:0.42rem 0.6rem;color:var(--text-dim);white-space:nowrap">' + esc(nombresMedio[medio] || medio) + '</td>' +
          '<td style="padding:0.42rem 0.6rem;text-align:right;font-weight:600;white-space:nowrap">' + _pesos(v.total) + '</td>' +
        '</tr>';
      }).join('') + '</tbody></table></div>'
    : '<p style="font-size:0.83rem;color:var(--text-dim)">No hay ventas asociadas a esta caja.</p>';

  const bloque = (titulo, contenido) =>
    '<div style="margin-top:1.1rem">' +
      '<h4 style="font-size:0.82rem;text-transform:uppercase;letter-spacing:0.6px;color:var(--text-dim);margin-bottom:0.5rem">' + titulo + '</h4>' +
      contenido + '</div>';

  return (
    '<div style="background:rgba(255,255,255,0.04);border-left:3px solid ' + colorDif + ';border-radius:0 8px 8px 0;padding:0.75rem 0.95rem;margin-bottom:0.4rem">' +
      '<div style="font-weight:700;color:' + colorDif + '">' + etqDif + '</div>' +
      '<div style="font-size:0.78rem;color:var(--text-dim);margin-top:0.15rem">' +
        'Esperado ' + _pesos(c.esperadoEfectivo) + ' · contado ' + _pesos(c.contadoEfectivo) + '</div>' +
      (c.motivoDiferencia ? '<div style="font-size:0.82rem;margin-top:0.35rem">Motivo: ' + esc(c.motivoDiferencia) + '</div>' : '') +
    '</div>' +

    '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:1rem;margin-top:1rem">' +
      '<div class="card" style="padding:1rem">' +
        '<h4 style="font-size:0.9rem;font-weight:700;margin-bottom:0.5rem">Apertura</h4>' +
        fila('Fondo inicial', _pesos(c.montoInicial)) +
        fila('Abrió', esc(c.abiertoPor || '-')) +
        fila('Hora', _fechaHora(c.abiertoEn) || '-') +
        (c.notaApertura ? '<div style="font-size:0.8rem;color:var(--text-dim);margin-top:0.4rem">' + esc(c.notaApertura) + '</div>' : '') +
      '</div>' +
      '<div class="card" style="padding:1rem">' +
        '<h4 style="font-size:0.9rem;font-weight:700;margin-bottom:0.5rem">Cierre</h4>' +
        fila('Cerró', esc(c.cerradoPor || '-')) +
        fila('Hora', _fechaHora(c.cerradoEn) || '-') +
        fila('Retiro final', _pesos(c.retiroFinal)) +
        fila('Quedó en caja', _pesos(c.dejaEnCaja), true) +
        (c.observaciones ? '<div style="font-size:0.8rem;color:var(--text-dim);margin-top:0.4rem">' + esc(c.observaciones) + '</div>' : '') +
      '</div>' +
    '</div>' +

    bloque('Cómo se llegó al esperado en efectivo',
      '<div class="card" style="padding:1rem">' +
        fila('Fondo inicial', _pesos(c.montoInicial)) +
        fila('+ Ventas en efectivo', _pesos(medios.efectivo)) +
        fila('+ Ingresos', _pesos(c.totalIngresos)) +
        fila('− Egresos', _pesos(c.totalEgresos)) +
        '<div style="border-top:1px solid var(--border);margin-top:0.45rem;padding-top:0.45rem">' +
          fila('<b>Debería haber</b>', '<b style="color:var(--accent)">' + _pesos(c.esperadoEfectivo) + '</b>', true) +
          fila('<b>Se contó</b>', '<b>' + _pesos(c.contadoEfectivo) + '</b>', true) +
        '</div>' +
        '<p style="font-size:0.76rem;color:var(--text-dim);margin-top:0.5rem;line-height:1.5">' +
          'Tarjeta, transferencia y fiado no entran acá: no pasaron por el cajón.' +
          (Number(c.ingresosNoEfectivo || 0) ? ' Tampoco ' + _pesos(c.ingresosNoEfectivo) + ' de cobros por transferencia o tarjeta.' : '') + '</p>' +
      '</div>') +

    bloque('Ventas por medio de pago (' + (c.ventasCount || 0) + ' ventas · ' + _pesos(c.ventasBruto) + ')',
      '<div class="card" style="padding:1rem">' + filasMedio +
      (Number(c.ventasEnvio || 0) ? '<p style="font-size:0.76rem;color:var(--text-dim);margin-top:0.5rem">Incluye ' + _pesos(c.ventasEnvio) + ' de envíos cobrados.</p>' : '') +
      '</div>') +

    bloque('Movimientos (' + d.movs.length + ')', '<div class="card" style="padding:0.4rem">' + movs + '</div>') +
    bloque('Ventas de esta caja (' + d.ventas.length + ')', '<div class="card" style="padding:0.4rem">' + ventas + '</div>')
  );
}

/* ============================ ABRIR ============================ */

async function openAbrirCajaModal(k) {
  const C = _caja(k);
  /* La primera de viandas arranca en 0: el fondo sugerido de la configuración es el del
     cajón del local. */
  let sugerido = C.k === 'viandas' ? 0 : cajaCfg.fondoFijoSugerido;
  /* Lo que quedó en el cajón al cerrar ayer es el fondo natural de hoy (de ESTA caja).
     La de viandas lo busca sin `where`: con el filtro haría falta un índice compuesto
     nuevo en su colección, y son unas pocas cajas por mes. */
  try {
    if (C.k === 'viandas') {
      const q = await db.collection(C.col).orderBy('abiertoEn', 'desc').limit(5).get();
      const u = q.docs.map(d => d.data()).find(c => c.estado === 'cerrada');
      if (u && u.dejaEnCaja != null) sugerido = u.dejaEnCaja;
    } else {
      const q = await db.collection('cajas').where('estado', '==', 'cerrada').orderBy('abiertoEn', 'desc').limit(1).get();
      if (!q.empty) { const u = q.docs[0].data(); if (u.dejaEnCaja != null) sugerido = u.dejaEnCaja; }
    }
  } catch (e) { /* si falla, queda el sugerido de config */ }
  _cel(C, 'cajaMontoInicial').value = sugerido;
  _cel(C, 'cajaNotaApertura').value = '';
  _cel(C, 'abrirCajaModal').classList.add('show');
}
function closeAbrirCajaModal(k) { _cel(_caja(k), 'abrirCajaModal').classList.remove('show'); }

async function abrirCaja(k) {
  const C = _caja(k);
  const btn = _cel(C, 'cajaAbrirBtn');
  const monto = montoAR(_cel(C, 'cajaMontoInicial').value);
  if (monto < 0) { showAdminToast('Ingrese un fondo inicial válido', 'error'); return; }
  btn.disabled = true;
  try {
    /* Con dos admins, dos pestañas pueden abrir a la vez. Firestore no tiene
       restricción de unicidad, así que re-consultamos justo antes de crear.
       En la colección de ESTA caja: la otra puede estar abierta, son independientes. */
    const ya = await db.collection(C.col).where('estado', '==', 'abierta').limit(1).get();
    if (!ya.empty) {
      showAdminToast(C.k === 'viandas' ? 'Ya hay una caja de viandas abierta. Actualizá la pantalla.' : 'Ya hay una caja abierta. Actualizá la pantalla.', 'error');
      btn.disabled = false; await loadCaja(k); closeAbrirCajaModal(k); return;
    }
    let numero = 1;
    const cnt = db.collection('config').doc(C.countDoc);
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
      notaApertura: _cel(C, 'cajaNotaApertura').value.trim() || null,
      editadaPostCierre: false
    };
    const ref = await db.collection(C.col).add(doc);
    await db.collection('config').doc(C.estadoDoc).set({
      cajaAbiertaId: ref.id, numero: numero, fecha: doc.fecha, abiertoPor: doc.abiertoPor
    });
    C.recienCerrada = null;
    if (typeof logAction === 'function') logAction('abrir', C.nombre + ' #' + numero + ' abierta', 'Fondo inicial ' + _pesos(monto));
    showAdminToast(C.nombre + ' #' + numero + ' abierta', 'success');
    closeAbrirCajaModal(k);
    /* Igual que al cerrar: la caja ya quedo abierta en la base. Si el refresco de
       pantalla falla, no se puede avisar "Error al abrir", porque no es cierto. */
    try {
      await loadCaja(k);
    } catch (err) {
      console.warn('La caja abrio pero no se pudo refrescar:', err);
      showAdminToast('La caja se abrió. No se pudo actualizar la pantalla: recargue para verla.', 'info');
    }
  } catch (e) {
    showAdminToast('Error al abrir: ' + e.message, 'error');
  } finally { btn.disabled = false; }
}

/* ============================ MOVIMIENTOS ============================ */

function openMovModal(tipo, k) {
  const C = _caja(k);
  C.movEditandoId = null;
  C.movTipo = (tipo === 'egreso') ? 'egreso' : 'ingreso';
  _llenarConceptos(C.movTipo, k);
  _cel(C, 'movTitulo').textContent = C.movTipo === 'ingreso' ? 'Registrar ingreso' : 'Registrar egreso';
  _cel(C, 'movMonto').value = '';
  _cel(C, 'movDetalle').value = '';
  _cel(C, 'movMotivo').value = '';
  _cel(C, 'movMotivoWrap').style.display = 'none';
  _cel(C, 'movModal').classList.add('show');
  setTimeout(() => _cel(C, 'movMonto').focus(), 60);
}

function _llenarConceptos(tipo, k) {
  const sel = _cel(_caja(k), 'movConcepto');
  const conceptos = CAJA_CONCEPTOS[tipo];
  sel.innerHTML = Object.keys(conceptos).map(c => '<option value="' + c + '">' + conceptos[c] + '</option>').join('');
}

/* Editar un movimiento ya cargado. Solo se puede mientras la caja sigue ABIERTA:
   al cerrar, los totales quedan congelados en el documento, y cambiarle el monto
   a un movimiento de una caja cerrada dejaria el arqueo diciendo un numero que ya
   no se corresponde con su propio respaldo. Por eso en el detalle de una caja
   cerrada los movimientos se ven pero no se editan.

   No hay borrar a proposito: un movimiento que desaparece es plata que no se
   puede rastrear. Se corrige y queda el rastro de que se corrigio. */
function openMovModalEdit(movId, k) {
  const C = _caja(k);
  const m = C.movs.find(x => x.docId === movId);
  if (!m) { showAdminToast('No se encontró ese movimiento', 'error'); return; }
  if (!C.actual || C.actual.estado !== 'abierta') {
    showAdminToast('Solo se pueden editar los movimientos de la caja abierta', 'error');
    return;
  }
  C.movEditandoId = movId;
  C.movTipo = m.tipo === 'egreso' ? 'egreso' : 'ingreso';
  _llenarConceptos(C.movTipo, k);
  _cel(C, 'movTitulo').textContent =
    C.movTipo === 'ingreso' ? 'Editar ingreso' : 'Editar egreso';
  _cel(C, 'movConcepto').value = m.concepto || '';
  _cel(C, 'movMonto').value = Number(m.monto || 0);
  _cel(C, 'movDetalle').value = m.detalle || '';
  _cel(C, 'movMotivo').value = '';
  _cel(C, 'movMotivoWrap').style.display = '';
  _cel(C, 'movModal').classList.add('show');
  setTimeout(() => _cel(C, 'movMonto').focus(), 60);
}

function closeMovModal(k) { _cel(_caja(k), 'movModal').classList.remove('show'); }

/* DESHACER UN INGRESO O EGRESO. Pedido del comercio (26/09/2026): un movimiento cargado
   por error no se podia sacar. Sigue sin borrarse -un movimiento que desaparece es plata
   que no se puede rastrear-: queda en la lista tachado, con "DESHECHO", quien y cuando,
   y deja de contar en la caja. Solo con la caja abierta, igual que editar: cerrada, sus
   totales ya quedaron congelados. */
async function deshacerMovimiento(movId, k) {
  const C = _caja(k);
  const cajaActual = C.actual;   /* la de ESTA caja (tapa la global a proposito) */
  const m = C.movs.find(x => x.docId === movId);
  if (!m) { showAdminToast('No se encontró ese movimiento', 'error'); return; }
  if (m.anulado === true) { showAdminToast('Ese movimiento ya estaba deshecho', 'info'); return; }
  if (!cajaActual || cajaActual.estado !== 'abierta') {
    showAdminToast('Solo se pueden deshacer los movimientos de la caja abierta', 'error');
    return;
  }
  const esIng = m.tipo === 'ingreso';
  const etq = (CAJA_CONCEPTOS[m.tipo] && CAJA_CONCEPTOS[m.tipo][m.concepto]) || m.concepto || '-';
  const ok = await pedirConfirmacion(
    '¿Deshacer este ' + (esIng ? 'ingreso' : 'egreso') + '?\n\n' +
    (esIng ? '+ ' : '− ') + _pesos(m.monto) + ' · ' + etq + (m.detalle ? ': ' + m.detalle : '') + '\n\n' +
    'Deja de contar en la caja. Queda en la lista, tachado, con quién lo deshizo y cuándo.',
    { titulo: 'Deshacer ' + (esIng ? 'ingreso' : 'egreso'), aceptar: 'Sí, deshacer', cancelar: 'No', icono: 'bi-arrow-counterclockwise' });
  if (!ok) return;
  try {
    /* Como al cargar uno: si otro la cerró en el medio, no se toca. */
    const _snapCaja = await db.collection(C.col).doc(cajaActual.docId).get();
    if (!_snapCaja.exists || _snapCaja.data().estado !== 'abierta') {
      showAdminToast('Esta caja ya la cerró alguien más. No se deshizo nada.', 'error');
      await loadCaja(k);
      return;
    }
    const quien = (auth.currentUser && auth.currentUser.email) || '-';
    await db.collection(C.col).doc(cajaActual.docId).collection('movimientos').doc(movId).update({
      anulado: true,
      anuladoPor: quien,
      anuladoEn: firebase.firestore.FieldValue.serverTimestamp()
    });
    if (typeof logAction === 'function')
      logAction('anular', C.nombre + ' #' + cajaActual.numero + ': ' + (esIng ? 'ingreso' : 'egreso') + ' deshecho',
        _pesos(m.monto) + ' | ' + etq + ' | ' + (m.detalle || ''));
    showAdminToast((esIng ? 'Ingreso' : 'Egreso') + ' deshecho: ya no cuenta en la caja', 'success');
    await cargarDatosCaja(cajaActual.docId, k);
    renderCaja(k);
  } catch (e) {
    showAdminToast('No se pudo deshacer: ' + e.message, 'error');
  }
}

async function guardarMovimiento(k) {
  const C = _caja(k);
  const cajaActual = C.actual;   /* la de ESTA caja (tapa la global a proposito) */
  if (!cajaActual) { showAdminToast('No hay caja abierta', 'error'); return; }
  const monto = montoAR(_cel(C, 'movMonto').value);
  const detalle = _cel(C, 'movDetalle').value.trim();
  if (monto <= 0) { showAdminToast('Ingrese un monto mayor a cero', 'error'); return; }
  /* El detalle es obligatorio a propósito: un movimiento sin explicación es
     exactamente lo que después nadie puede justificar en el arqueo. */
  if (detalle.length < 3) { showAdminToast('Ingrese un detalle (mínimo 3 letras)', 'error'); return; }
  const btn = _cel(C, 'movGuardarBtn');
  btn.disabled = true;
  try {
    /* Se revisa que la caja siga abierta antes de escribir. Si el otro admin la cerró
       mientras este movimiento se estaba cargando, el arqueo ya quedó congelado: el
       movimiento se guardaba igual, avisaba "registrado", y esa plata no aparecía en
       ningún cierre. Desaparecía sin dejar rastro salvo en la subcolección. */
    const _snapCaja = await db.collection(C.col).doc(cajaActual.docId).get();
    if (!_snapCaja.exists || _snapCaja.data().estado !== 'abierta') {
      showAdminToast('Esta caja ya la cerró alguien más. El movimiento no se guardó.', 'error');
      closeMovModal(k);
      await loadCaja(k);
      return;
    }
    const concepto = _cel(C, 'movConcepto').value;
    const quien = (auth.currentUser && auth.currentUser.email) || '-';
    const movsCol = db.collection(C.col).doc(cajaActual.docId).collection('movimientos');

    if (C.movEditandoId) {
      const antes = C.movs.find(x => x.docId === C.movEditandoId);
      if (!antes) { showAdminToast('Ese movimiento ya no existe', 'error'); closeMovModal(k); await loadCaja(k); return; }
      const motivo = _cel(C, 'movMotivo').value.trim();
      const sinCambios = Number(antes.monto || 0) === monto &&
                         (antes.detalle || '') === detalle &&
                         (antes.concepto || '') === concepto;
      if (sinCambios) { showAdminToast('No se modificó ningún dato', 'info'); closeMovModal(k); return; }
      /* Se guardan los valores anteriores en un array. serverTimestamp() no se
         puede meter adentro de un array en Firestore, asi que la fecha de cada
         edicion va con la del cliente; la de arriba (editadoEn) si es del server. */
      await movsCol.doc(C.movEditandoId).update({
        concepto: concepto,
        monto: monto,
        detalle: detalle,
        editado: true,
        editadoPor: quien,
        editadoEn: firebase.firestore.FieldValue.serverTimestamp(),
        motivoEdicion: motivo || null,
        ediciones: firebase.firestore.FieldValue.arrayUnion({
          en: new Date(),
          por: quien,
          motivo: motivo || null,
          conceptoAntes: antes.concepto || null,
          montoAntes: Number(antes.monto || 0),
          detalleAntes: antes.detalle || null
        })
      });
      if (typeof logAction === 'function')
        logAction('editar', C.nombre + ' #' + cajaActual.numero + ': movimiento editado',
          _pesos(antes.monto) + ' -> ' + _pesos(monto) + ' | ' + (antes.detalle || '') + ' -> ' + detalle +
          (motivo ? ' | Motivo: ' + motivo : ' | Sin motivo'));
      showAdminToast('Movimiento actualizado', 'success');
      closeMovModal(k);
      await cargarDatosCaja(cajaActual.docId, k);
      renderCaja(k);
      return;
    }

    await movsCol.add({
      tipo: C.movTipo,
      concepto: concepto,
      monto: monto,
      detalle: detalle,
      usuario: quien,
      fecha: firebase.firestore.FieldValue.serverTimestamp()
    });
    if (typeof logAction === 'function')
      logAction(C.movTipo, C.nombre + ' #' + cajaActual.numero + ': ' + C.movTipo + ' ' + _pesos(monto), detalle);
    showAdminToast('Movimiento registrado', 'success');
    closeMovModal(k);
    await cargarDatosCaja(cajaActual.docId, k);
    renderCaja(k);
  } catch (e) {
    showAdminToast('Error: ' + e.message, 'error');
  } finally { btn.disabled = false; }
}

/* ============================ CORTE PARCIAL ============================

   El "vistazo" a mitad del dia. Muestra exactamente lo mismo que el cierre pero
   NO cierra nada: no congela totales, no toca el estado de la caja y no escribe
   un arqueo. Sirve para el cambio de turno y para cuando el dueño pasa por el
   local y quiere saber como viene.

   Antes de esto, la unica forma de ver cuanto deberia haber en el cajon era
   abrir el modal de cierre, mirar el numero y cancelar; un Enter de mas y la
   caja quedaba cerrada a media tarde, con las ventas del resto del dia cayendo
   fuera de todo arqueo.

   Se recargan los datos antes de calcular, igual que el cierre: `cajaVentas` es
   lo que quedo cargado la ultima vez que se abrio la seccion, y un corte contra
   una foto vieja no sirve para nada. */

async function openCorteParcial(k) {
  const C = _caja(k);
  const cajaActual = C.actual;   /* la de ESTA caja (tapa la global a proposito) */
  if (!cajaActual) { showAdminToast('No hay ninguna caja abierta', 'error'); return; }
  const cont = _cel(C, 'corteParcialBody');
  if (!cont) return;
  cont.innerHTML = '<p style="font-size:0.88rem;color:var(--text-dim)">Calculando...</p>';
  _cel(C, 'corteParcialModal').classList.add('show');
  try {
    await cargarDatosCaja(cajaActual.docId, k);
    const t = calcularTotalesCaja(k);
    C.corte = { caja: _cajaSinteticaParcial(t, k), movs: C.movs.slice(), ventas: C.ventas.slice(), parcial: true, k: C.k };
    _cel(C, 'corteParcialTitulo').innerHTML =
      '<i class="bi bi-eyeglasses"></i> Corte parcial · ' + C.nombre + ' #' + String(cajaActual.numero || 0).padStart(4, '0');
    cont.innerHTML = renderCorteParcial(t, k);
    /* Queda registrado quien miro y cuando: en un corte de turno, saber que a las
       17:05 habia $X y quien lo consulto es la mitad del control. */
    if (typeof logAction === 'function')
      logAction('consultar', C.nombre + ' #' + cajaActual.numero + ': corte parcial',
        'Debería haber ' + _pesos(t.esperado) + ' en efectivo · ' + t.count + ' ventas');
  } catch (e) {
    cont.innerHTML = '<p style="font-size:0.88rem;color:var(--danger)">No se pudo calcular: ' + esc(e.message) + '</p>';
  }
}
function closeCorteParcialModal(k) { _cel(_caja(k), 'corteParcialModal').classList.remove('show'); }

/* Un documento con la MISMA forma que una caja cerrada, armado con los totales
   en vivo. Asi el comprobante del corte parcial se imprime con la misma funcion
   que el del cierre y no hay dos maquetas que mantener. */
function _cajaSinteticaParcial(t, k) {
  const cajaActual = _caja(k).actual;
  return {
    docId: cajaActual.docId, numero: cajaActual.numero, fecha: cajaActual.fecha,
    estado: 'abierta', montoInicial: cajaActual.montoInicial,
    abiertoPor: cajaActual.abiertoPor, abiertoEn: cajaActual.abiertoEn,
    ventasCount: t.count, ventasBruto: t.bruto, ventasEnvio: t.envio, ventasPorMedio: t.porMedio,
    totalIngresos: t.ingresos, ingresosNoEfectivo: t.ingresosOtros || 0, totalEgresos: t.egresos,
    esperadoEfectivo: t.esperado,
    /* Sin contar: el corte parcial no pide contar la plata. Si se deja en 0, el
       comprobante diria "faltante" por el total del dia. */
    contadoEfectivo: null, diferencia: null
  };
}

function renderCorteParcial(t, k) {
  const cajaActual = _caja(k).actual;
  const fila = (etq, val, fuerte) =>
    '<div style="display:flex;justify-content:space-between;gap:1rem;padding:0.36rem 0;font-size:0.9rem">' +
      '<span style="color:var(--text-dim)">' + etq + '</span>' +
      '<span style="font-weight:' + (fuerte ? '700' : '600') + ';white-space:nowrap">' + val + '</span></div>';
  const ahora = new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  return '' +
    '<div style="background:rgba(255,255,255,0.04);border-left:3px solid var(--accent);border-radius:0 8px 8px 0;padding:0.8rem 0.95rem;margin-bottom:1rem">' +
      '<div style="font-size:0.78rem;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:0.15rem">Debería haber ahora en efectivo</div>' +
      '<div style="font-size:1.45rem;font-weight:700;color:var(--accent)">' + _pesos(t.esperado) + '</div>' +
      '<div style="font-size:0.78rem;color:var(--text-dim);margin-top:0.2rem">Calculado a las ' + ahora + ' · la caja sigue abierta</div>' +
    '</div>' +
    '<div class="card" style="padding:1rem">' +
      fila('Fondo inicial', _pesos(cajaActual.montoInicial)) +
      fila('+ Ventas en efectivo (' + t.count + ' ventas en total)', _pesos(t.porMedio.efectivo)) +
      fila('+ Ingresos', _pesos(t.ingresos)) +
      fila('− Egresos', _pesos(t.egresos)) +
      '<div style="border-top:1px solid var(--border);margin-top:0.5rem;padding-top:0.5rem">' +
        fila('<b>Debería haber</b>', '<b style="color:var(--accent)">' + _pesos(t.esperado) + '</b>', true) +
      '</div>' +
      (t.ingresosOtros ? '<p style="font-size:0.76rem;color:var(--text-dim);margin-top:0.5rem;line-height:1.5">' +
        'No entran: ' + _pesos(t.ingresosOtros) + ' de cobros por transferencia o tarjeta.</p>' : '') +
    '</div>' +
    '<div class="card" style="padding:1rem;margin-top:0.85rem">' +
      '<h4 style="font-size:0.9rem;font-weight:700;margin-bottom:0.45rem">Facturado hasta ahora</h4>' +
      fila('Total', _pesos(t.bruto), true) +
      (t.porMedio.efectivo ? fila('· Efectivo', _pesos(t.porMedio.efectivo)) : '') +
      (t.porMedio.tarjeta ? fila('· Tarjeta', _pesos(t.porMedio.tarjeta)) : '') +
      (t.porMedio.transferencia ? fila('· Transferencia', _pesos(t.porMedio.transferencia)) : '') +
      (t.porMedio.cuenta_corriente ? fila('· Fiado (no cobrado)', _pesos(t.porMedio.cuenta_corriente)) : '') +
      '<p style="font-size:0.76rem;color:var(--text-dim);margin-top:0.5rem;line-height:1.5">' +
        'Tarjeta, transferencia y fiado no entran al efectivo esperado: no pasan por el cajón.</p>' +
    '</div>' +
    '<p style="font-size:0.8rem;color:var(--text-dim);margin-top:0.9rem;line-height:1.55">' +
      'Esto es solo una consulta. No cierra la caja, no congela ningún total y no queda ' +
      'guardado como arqueo: el cierre del día se sigue haciendo desde <b>Cerrar caja y arquear</b>.</p>';
}

function imprimirCorteParcial(k) {
  const datos = _caja(k).corte;
  if (!datos) { showAdminToast('El corte todavía no terminó de calcular', 'error'); return; }
  const guardado = _cajaDetalle;
  _cajaDetalle = datos;
  try { imprimirArqueo(); } finally { _cajaDetalle = guardado; }
}

/* ============================ CIERRE ============================ */

async function openCierreModal(k) {
  const C = _caja(k);
  const cajaActual = C.actual;   /* la de ESTA caja (tapa la global a proposito) */
  if (!cajaActual) return;
  /* Se recargan las ventas ANTES de arquear. `cajaVentas` es lo que quedó cargado
     la última vez que se abrió la sección: si el mostrador vendió desde otra
     pantalla, o el otro admin cargó algo, o simplemente pasaron horas, el arqueo
     salía contra una foto vieja. Con el atajo de teclado era peor todavía, porque
     se puede llegar acá sin volver a pasar por la pantalla de Caja. */
  const btn = _cel(C, 'cajaCerrarBtn');
  if (btn) { btn.disabled = true; }
  await cargarDatosCaja(cajaActual.docId, k);
  const t = calcularTotalesCaja(k);
  C.totalesCierre = t;
  const ciego = !!cajaCfg.arqueoCiego;
  _cel(C, 'cierreResumen').innerHTML =
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
        (t.ingresosOtros ? ' Los cobros por transferencia o tarjeta (' + _pesos(t.ingresosOtros) + ') tampoco.' : '') +
      '</div>' +
    '</div>';
  _cel(C, 'cajaContado').value = '';
  _cel(C, 'cajaMotivo').value = '';
  _cel(C, 'cajaObs').value = '';
  _cel(C, 'cajaRetiro').value = '';
  _cel(C, 'cierreDiferencia').innerHTML = '';
  _cel(C, 'cajaMotivoWrap').style.display = 'none';
  _cel(C, 'cajaCerrarBtn').disabled = true;
  _cel(C, 'cierreModal').classList.add('show');
  setTimeout(() => _cel(C, 'cajaContado').focus(), 60);
}
function closeCierreModal(k) { _cel(_caja(k), 'cierreModal').classList.remove('show'); }

function onContadoInput(k) {
  const C = _caja(k);
  const t = C.totalesCierre;
  if (!t) return;
  const val = _cel(C, 'cajaContado').value;
  const box = _cel(C, 'cierreDiferencia');
  const wrap = _cel(C, 'cajaMotivoWrap');
  if (val === '') { box.innerHTML = ''; wrap.style.display = 'none'; _cel(C, 'cajaCerrarBtn').disabled = true; return; }
  const contado = montoAR(val);
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
  validarCierre(k);
}

function validarCierre(k) {
  const C = _caja(k);
  const t = C.totalesCierre;
  const val = _cel(C, 'cajaContado').value;
  if (!t || val === '') { _cel(C, 'cajaCerrarBtn').disabled = true; return; }
  const dif = montoAR(val) - t.esperado;
  const exige = !!cajaCfg.exigirMotivoSiDifiere;
  const motivo = _cel(C, 'cajaMotivo').value.trim();
  _cel(C, 'cajaCerrarBtn').disabled = (dif !== 0 && exige && motivo.length < 3);
}

async function confirmarCierre(k) {
  const C = _caja(k);
  const cajaActual = C.actual;   /* la de ESTA caja (tapa la global a proposito) */
  if (!cajaActual) return;
  const contado = montoAR(_cel(C, 'cajaContado').value);
  const retiro = montoAR(_cel(C, 'cajaRetiro').value);
  /* Se vuelve a leer la caja JUSTO antes de escribir el cierre. Los totales se
     congelan al abrir el modal, y contar la plata lleva minutos: si en el medio el
     otro admin cobraba una venta en efectivo, esa venta se estampaba con esta
     cajaId (la caja sigue abierta) pero el arqueo se escribia con el esperado
     viejo. La caja marcaba "Sobra $X" por el monto exacto de esa venta, habia que
     inventarle un motivo para poder cerrar, y la venta quedaba pegada a una caja
     cerrada que no la cuenta y que tampoco aparece en "Ventas fuera de caja"
     (tiene cajaId). Si entro algo, no se cierra: se refrescan los numeros del
     modal, se le avisa, y decide el que esta contando. */
  const _tAntes = C.totalesCierre || calcularTotalesCaja(k);
  await cargarDatosCaja(cajaActual.docId, k);
  const _tAhora = calcularTotalesCaja(k);
  if (_tAhora.esperado !== _tAntes.esperado || _tAhora.count !== _tAntes.count) {
    const _c = _cel(C, 'cajaContado').value;
    const _m = _cel(C, 'cajaMotivo').value;
    const _o = _cel(C, 'cajaObs').value;
    const _r = _cel(C, 'cajaRetiro').value;
    await openCierreModal(k);
    _cel(C, 'cajaContado').value = _c;
    _cel(C, 'cajaMotivo').value = _m;
    _cel(C, 'cajaObs').value = _o;
    _cel(C, 'cajaRetiro').value = _r;
    onContadoInput(k);
    renderCaja(k);
    /* Con arqueo ciego no se puede soplar el esperado: la pantalla lo esconde a
       proposito para que el que cuenta no acomode el numero. */
    showAdminToast('Entraron ventas o movimientos mientras contabas' + (cajaCfg.arqueoCiego ? '' : ': ahora deberia haber ' + _pesos(_tAhora.esperado)) + '. Revise la diferencia y vuelva a cerrar.', 'error');
    return;
  }
  const t = _tAhora;
  C.totalesCierre = t;
  const dif = contado - t.esperado;
  if (retiro > contado) { showAdminToast('No puede retirar más de lo contado', 'error'); return; }
  const btn = _cel(C, 'cajaCerrarBtn');
  btn.disabled = true;
  try {
    /* Contar la plata lleva dos o tres minutos, y en el mostrador el otro admin puede
       cobrar en el medio: esa venta se estampa con ESTA caja (config/cajaEstado todavia
       la marca abierta) pero no entra en la foto que congelo openCierreModal. El efectivo
       contado la incluye y el esperado no, asi que el arqueo gritaba "Sobra $X" y obligaba
       a inventar un motivo; peor todavia, la venta quedaba colgada de una caja cerrada con
       totales que no la cuentan y no aparece en ningun arqueo. Se relee antes de cerrar:
       si algo se movio no se cierra, se rearma el resumen con los numeros nuevos. */
    await cargarDatosCaja(cajaActual.docId, k);
    const tAhora = calcularTotalesCaja(k);
    if (tAhora.count !== t.count || tAhora.esperado !== t.esperado) {
      const nuevas = tAhora.count - t.count;
      showAdminToast(nuevas > 0
        ? 'Entraron ' + nuevas + ' venta(s) mientras contaba. Revise el esperado y vuelva a contar.'
        : 'La caja cambió mientras contaba. Revise el esperado y vuelva a contar.', 'error');
      await openCierreModal(k);
      return;
    }
    /* Todo CONGELADO: si mañana editan una venta de hoy, este arqueo tiene que
       seguir diciendo lo que se contó hoy. Por eso no se recalcula al leer.

       Va en transacción y revisando `estado` primero porque con dos admins el
       cierre se puede correr dos veces: el segundo pisaba el arqueo del primero
       con su propio conteo, y el primero se enteraba de que su cierre ya no
       existía recién al mirar el historial. */
    await db.runTransaction(async tx => {
      const ref = db.collection(C.col).doc(cajaActual.docId);
      const sn = await tx.get(ref);
      if (!sn.exists) throw new Error('La caja ya no existe');
      if (sn.data().estado !== 'abierta') throw new Error('cerrada-por-otro');
      tx.update(ref, {
      estado: 'cerrada',
      cerradoPor: (auth.currentUser && auth.currentUser.email) || '-',
      cerradoEn: firebase.firestore.FieldValue.serverTimestamp(),
      ventasCount: t.count, ventasBruto: t.bruto, ventasEnvio: t.envio, ventasPorMedio: t.porMedio,
      /* totalIngresos es lo que sumó al efectivo esperado (como siempre); los cobros
         por transferencia o tarjeta quedan aparte, en ingresosNoEfectivo. */
      totalIngresos: t.ingresos, ingresosNoEfectivo: t.ingresosOtros || 0, totalEgresos: t.egresos,
      esperadoEfectivo: t.esperado, contadoEfectivo: contado, diferencia: dif,
      motivoDiferencia: dif !== 0 ? (_cel(C, 'cajaMotivo').value.trim() || null) : null,
      retiroFinal: retiro, dejaEnCaja: contado - retiro,
      observaciones: _cel(C, 'cajaObs').value.trim() || null
      });
    });
    await db.collection('config').doc(C.estadoDoc).set({ cajaAbiertaId: null });

    /* La pantalla se apaga ACA, sin volver a preguntar. Antes esto dependia de
       que loadCaja() releyera la base y se enterara sola, y la relectura podia
       volver con el estado anterior: la caja seguia mostrandose abierta hasta
       que uno cambiaba de seccion, que es cuando loadCaja() corria de nuevo.

       Lo que acabas de hacer vos no tiene por que ir a preguntarselo al
       servidor: la caja se cerro, se sabe, y se dibuja. loadCaja() sigue
       corriendo despues para refrescar el historial, pero ya no es de el de
       quien depende que la pantalla diga la verdad. */
    const numCerrada = cajaActual.numero;
    C.recienCerrada = cajaActual.docId;
    C.actual = null;
    C.movs = []; C.ventas = []; C.sueltas = [];
    renderCaja(k);

    if (typeof logAction === 'function')
      logAction('cerrar', C.nombre + ' #' + numCerrada + ' cerrada',
        'Esperado ' + _pesos(t.esperado) + ' | Contado ' + _pesos(contado) + ' | Diferencia ' + _pesos(dif));
    showAdminToast(C.nombre + ' #' + numCerrada + ' cerrada', 'success');
    closeCierreModal(k);
    /* A partir de aca la caja YA ESTA CERRADA en la base. Refrescar la pantalla es
       otra cosa, y tiene que fallar aparte: cuando el refresco estaba dentro de este
       mismo try, cualquier tropiezo al releer saltaba al catch de abajo y avisaba
       "Error al cerrar" —que es falso, el cierre se guardo— dejando ademas la
       pantalla mostrando la caja como si siguiera abierta. Paso en produccion: la
       caja quedo cerrada y hubo que recargar a mano para verlo. */
    try {
      await loadCaja(k);
    } catch (err) {
      console.warn('La caja cerro pero no se pudo refrescar:', err);
      showAdminToast('La caja se cerró. No se pudo actualizar la pantalla: recargue para verla.', 'info');
    }
  } catch (e) {
    if (e && e.message === 'cerrada-por-otro') {
      showAdminToast('Esta caja ya la cerró alguien más. Se actualizó la pantalla.', 'error');
      closeCierreModal(k);
      await loadCaja(k);
      return;
    }
    showAdminToast('Error al cerrar: ' + e.message, 'error');
    btn.disabled = false;
  }
}

/* ============================ ADJUNTAR ============================ */

async function adjuntarVentasSueltas(k) {
  const C = _caja(k);
  const cajaActual = C.actual;   /* la de ESTA caja (tapa la global a proposito) */
  if (!cajaActual || !C.sueltas.length) return;
  if (!await pedirConfirmacion('Adjuntar ' + C.sueltas.length + ' venta(s) a la ' + C.nombre.toLowerCase() + ' #' + cajaActual.numero + '?',{titulo:'Adjuntar ventas',aceptar:'Adjuntar'})) return;
  try {
    const batch = db.batch();
    /* Se usa v._col: una mayorista suelta vive en otra coleccion y actualizarla
       contra 'ventas' escribiria un documento que no existe. */
    C.sueltas.forEach(v => batch.update(db.collection(v._col || 'ventas').doc(v.docId), { cajaId: cajaActual.docId }));
    await batch.commit();
    showAdminToast('Ventas adjuntadas', 'success');
    await cargarDatosCaja(cajaActual.docId, k);
    await cargarVentasSueltas(cajaActual.fecha, k);
    renderCaja(k);
  } catch (e) { showAdminToast('Error: ' + e.message, 'error'); }
}

/* ============================ IMPRIMIR Y EXPORTAR ============================

   buildArqueoHTML es la UNICA fuente del comprobante: la vista previa del modal y
   lo que se manda a la impresora salen de la misma llamada. Si fueran dos
   funciones distintas, la vista previa terminaria mintiendo apenas alguien toque
   una de las dos.

   Va con estilos inline y colores literales, sin variables CSS: se escribe en una
   ventana nueva que no tiene el CSS del panel, y sobre papel blanco. */

const _MEDIOS_NOMBRE = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', transferencia: 'Transferencia', cuenta_corriente: 'Fiado (no cobrado)', otro: 'Otro' };

function buildArqueoHTML(d) {
  const c = d.caja;
  const C = _caja(d.k);
  /* En un corte parcial la plata todavia no se conto: diferencia viene en null.
     Con `Number(null)` daria 0 y el comprobante diria "CAJA EXACTA", que es una
     afirmacion que nadie hizo. */
  const parcial = !!d.parcial;
  const dif = Number(c.diferencia || 0);
  const etqDif = parcial
    ? 'CORTE PARCIAL - LA CAJA SIGUE ABIERTA'
    : (dif === 0 ? 'CAJA EXACTA' : (dif > 0 ? 'SOBRANTE ' + _pesos(dif) : 'FALTANTE ' + _pesos(Math.abs(dif))));
  const negocio = (typeof NEGOCIO !== 'undefined' && NEGOCIO.nombre) ? NEGOCIO.nombre : 'Brotes Dietética';
  const medios = c.ventasPorMedio || {};

  const f = (etq, val, fuerte) =>
    '<tr><td style="padding:2px 0;color:#444">' + etq + '</td>' +
    '<td style="padding:2px 0;text-align:right;white-space:nowrap;font-weight:' + (fuerte ? '700' : '500') + '">' + val + '</td></tr>';

  const tabla = (cab, filas) =>
    '<table style="width:100%;border-collapse:collapse;font-size:11px;margin-top:4px">' +
    '<thead><tr>' + cab.map((h, i) =>
      '<th style="text-align:' + (i >= cab.length - 1 ? 'right' : 'left') + ';padding:3px 4px;border-bottom:1px solid #999;font-size:9px;text-transform:uppercase;letter-spacing:0.4px;color:#555">' + h + '</th>').join('') +
    '</tr></thead><tbody>' + filas + '</tbody></table>';

  const filasMov = d.movs.length ? d.movs.map(m => {
    const etq = (CAJA_CONCEPTOS[m.tipo] && CAJA_CONCEPTOS[m.tipo][m.concepto]) || m.concepto || '-';
    const signo = m.tipo === 'ingreso' ? '+ ' : '− ';
    return '<tr>' +
      '<td style="padding:3px 4px;border-bottom:1px solid #eee">' + _hora(m.fecha) + '</td>' +
      '<td style="padding:3px 4px;border-bottom:1px solid #eee">' + esc(etq) +
        (_movEnEfectivo(m) ? '' : ' <b>(' + esc(_MOV_MEDIO_NOMBRE[m.medio] || m.medio) + ', no suma al efectivo)</b>') +
        (m.editado ? ' <b>(editado)</b>' : '') + (m.anulado ? ' <b>(deshecho, no cuenta)</b>' : '') + '</td>' +
      '<td style="padding:3px 4px;border-bottom:1px solid #eee">' + esc(m.detalle || '') + '</td>' +
      '<td style="padding:3px 4px;border-bottom:1px solid #eee;text-align:right;white-space:nowrap">' + (m.anulado ? '<s>' + signo + _pesos(m.monto) + '</s>' : signo + _pesos(m.monto)) + '</td>' +
    '</tr>';
  }).join('') : '<tr><td colspan="4" style="padding:6px 4px;color:#777">Sin movimientos.</td></tr>';

  const filasVta = d.ventas.length ? d.ventas.map(v => {
    const medio = (typeof medioKeyDeVenta === 'function') ? medioKeyDeVenta(v) : 'otro';
    return '<tr>' +
      '<td style="padding:3px 4px;border-bottom:1px solid #eee">' + _hora(v.fecha) + '</td>' +
      '<td style="padding:3px 4px;border-bottom:1px solid #eee">' + esc(_nroVenta(v)) + '</td>' +
      '<td style="padding:3px 4px;border-bottom:1px solid #eee">' + esc(v.cliente || 'Consumidor final') + '</td>' +
      '<td style="padding:3px 4px;border-bottom:1px solid #eee">' + esc(_MEDIOS_NOMBRE[medio] || medio) + '</td>' +
      '<td style="padding:3px 4px;border-bottom:1px solid #eee;text-align:right;white-space:nowrap">' + _pesos(v.total) + '</td>' +
    '</tr>';
  }).join('') : '<tr><td colspan="5" style="padding:6px 4px;color:#777">Sin ventas.</td></tr>';

  return '' +
  '<div style="font-family:Arial,Helvetica,sans-serif;color:#111;font-size:12px;line-height:1.45;max-width:180mm;margin:0 auto">' +
    '<div style="display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #111;padding-bottom:6px;margin-bottom:10px">' +
      '<div><div style="font-size:16px;font-weight:700">' + esc(negocio) + '</div>' +
      '<div style="font-size:11px;color:#555">' + (parcial ? 'Corte parcial de ' + (C.k === 'viandas' ? 'caja de viandas' : 'caja') : C.titulo) + '</div></div>' +
      '<div style="text-align:right">' +
        '<div style="font-size:15px;font-weight:700">' + C.nombre + ' #' + String(c.numero || 0).padStart(4, '0') + '</div>' +
        '<div style="font-size:11px;color:#555">' + esc(_cajaFecha(c.fecha)) + '</div>' +
      '</div>' +
    '</div>' +

    '<div style="display:flex;gap:12px;margin-bottom:10px">' +
      '<div style="flex:1;border:1px solid #ccc;border-radius:5px;padding:7px 9px">' +
        '<div style="font-size:9px;text-transform:uppercase;letter-spacing:0.5px;color:#555;margin-bottom:3px">Apertura</div>' +
        '<table style="width:100%;border-collapse:collapse;font-size:11px">' +
          f('Fondo inicial', _pesos(c.montoInicial)) + f('Abrió', esc(c.abiertoPor || '-')) + f('Hora', _fechaHora(c.abiertoEn) || '-') +
        '</table></div>' +
      '<div style="flex:1;border:1px solid #ccc;border-radius:5px;padding:7px 9px">' +
        '<div style="font-size:9px;text-transform:uppercase;letter-spacing:0.5px;color:#555;margin-bottom:3px">' +
          (parcial ? 'Corte' : 'Cierre') + '</div>' +
        '<table style="width:100%;border-collapse:collapse;font-size:11px">' +
          (parcial
            ? f('Tomado el', new Date().toLocaleString('es-AR')) +
              f('Por', esc((typeof auth !== 'undefined' && auth.currentUser && auth.currentUser.email) || '-')) +
              f('Estado', 'Abierta')
            : f('Cerró', esc(c.cerradoPor || '-')) + f('Hora', _fechaHora(c.cerradoEn) || '-') +
              f('Retiro final', _pesos(c.retiroFinal)) + f('Quedó en caja', _pesos(c.dejaEnCaja), true)) +
        '</table></div>' +
    '</div>' +

    '<div style="display:flex;gap:12px;margin-bottom:10px">' +
      '<div style="flex:1;border:1px solid #ccc;border-radius:5px;padding:7px 9px">' +
        '<div style="font-size:9px;text-transform:uppercase;letter-spacing:0.5px;color:#555;margin-bottom:3px">Efectivo esperado</div>' +
        '<table style="width:100%;border-collapse:collapse;font-size:11px">' +
          f('Fondo inicial', _pesos(c.montoInicial)) +
          f('+ Ventas en efectivo', _pesos(medios.efectivo)) +
          f('+ Ingresos', _pesos(c.totalIngresos)) +
          f('− Egresos', _pesos(c.totalEgresos)) +
          '<tr><td colspan="2" style="border-top:1px solid #999;padding-top:2px"></td></tr>' +
          f('Debería haber', _pesos(c.esperadoEfectivo), true) +
          (parcial ? '' : f('Se contó', _pesos(c.contadoEfectivo), true)) +
        '</table>' +
        '<div style="font-size:9px;color:#666;margin-top:4px">Tarjeta, transferencia y fiado no entran: no pasan por el cajón.' +
          (Number(c.ingresosNoEfectivo || 0) ? ' Tampoco ' + _pesos(c.ingresosNoEfectivo) + ' de cobros por transferencia o tarjeta.' : '') + '</div>' +
      '</div>' +
      '<div style="flex:1;border:1px solid #ccc;border-radius:5px;padding:7px 9px">' +
        '<div style="font-size:9px;text-transform:uppercase;letter-spacing:0.5px;color:#555;margin-bottom:3px">' +
          'Ventas (' + (c.ventasCount || 0) + ')</div>' +
        '<table style="width:100%;border-collapse:collapse;font-size:11px">' +
          Object.keys(_MEDIOS_NOMBRE).filter(k => Number(medios[k] || 0) !== 0)
            .map(k => f(_MEDIOS_NOMBRE[k], _pesos(medios[k]))).join('') +
          '<tr><td colspan="2" style="border-top:1px solid #999;padding-top:2px"></td></tr>' +
          f('Total facturado', _pesos(c.ventasBruto), true) +
        '</table>' +
        (Number(c.ventasEnvio || 0) ? '<div style="font-size:9px;color:#666;margin-top:4px">Incluye ' + _pesos(c.ventasEnvio) + ' de envíos cobrados.</div>' : '') +
      '</div>' +
    '</div>' +

    '<div style="border:2px solid #111;border-radius:5px;padding:8px 10px;margin-bottom:12px;display:flex;justify-content:space-between;align-items:center">' +
      '<div><div style="font-size:15px;font-weight:700">' + etqDif + '</div>' +
      (c.motivoDiferencia ? '<div style="font-size:10px;color:#444;margin-top:2px">Motivo: ' + esc(c.motivoDiferencia) + '</div>' : '') + '</div>' +
      '<div style="text-align:right;font-size:10px;color:#444">Esperado ' + _pesos(c.esperadoEfectivo) +
        (parcial ? '<br>Sin contar todavía' : '<br>Contado ' + _pesos(c.contadoEfectivo)) + '</div>' +
    '</div>' +

    (c.observaciones ? '<div style="font-size:11px;margin-bottom:10px"><b>Observaciones:</b> ' + esc(c.observaciones) + '</div>' : '') +

    '<div style="font-size:11px;font-weight:700;margin-top:12px">Movimientos (' + d.movs.length + ')</div>' +
    tabla(['Hora', 'Concepto', 'Detalle', 'Monto'], filasMov) +

    '<div style="font-size:11px;font-weight:700;margin-top:12px">Ventas (' + d.ventas.length + ')</div>' +
    tabla(['Hora', 'N°', 'Cliente', 'Medio', 'Total'], filasVta) +

    '<div style="margin-top:22px;display:flex;gap:30px;font-size:10px;color:#555">' +
      '<div style="flex:1;border-top:1px solid #999;padding-top:3px">Firma de quien cierra</div>' +
      '<div style="flex:1;border-top:1px solid #999;padding-top:3px">Firma de quien controla</div>' +
    '</div>' +
    '<div style="margin-top:8px;font-size:9px;color:#888">Emitido el ' + new Date().toLocaleString('es-AR') + '</div>' +
  '</div>';
}

async function openCajaExportModal(cajaId, k) {
  const prev = document.getElementById('cajaExportPreview');
  if (!prev) return;
  prev.innerHTML = '<p style="color:#555;font-size:13px">Cargando...</p>';
  document.getElementById('cajaExportModal').classList.add('show');
  try {
    /* Se reusa lo que ya cargó el detalle si es la misma caja: son los mismos
       datos congelados y evita tres consultas al abrir uno detrás del otro. */
    if (!_cajaDetalle || _cajaDetalle.caja.docId !== cajaId) _cajaDetalle = await cargarDetalleCaja(cajaId, k);
    prev.innerHTML = buildArqueoHTML(_cajaDetalle);
  } catch (e) {
    prev.innerHTML = '<p style="color:#b00;font-size:13px">No se pudo cargar: ' + esc(e.message) + '</p>';
  }
}
function closeCajaExportModal() { document.getElementById('cajaExportModal').classList.remove('show'); }

/* "BROTES_arqueo_caja0001_..." y, para la de viandas, "BROTES_arqueo_cajaviandas0001_...":
   las dos numeraciones arrancan en 1 y los archivos no se pueden pisar. */
function _nombreArchivoArqueo(ext) {
  const c = _cajaDetalle.caja;
  const tipo = (_cajaDetalle && _cajaDetalle.parcial) ? 'corteparcial' : 'arqueo';
  return 'BROTES_' + tipo + '_' + _caja(_cajaDetalle.k).archivo + String(c.numero || 0).padStart(4, '0') + '_' + (c.fecha || '') + '.' + ext;
}

function imprimirArqueo() {
  if (!_cajaDetalle) { showAdminToast('El arqueo todavía no terminó de cargar', 'error'); return; }
  const win = window.open('', '_blank', 'width=900,height=700');
  if (!win) { showAdminToast('El navegador bloqueó la ventana de impresión. Permita las ventanas emergentes para este sitio.', 'error'); return; }
  const deViandas = _cajaDetalle.k === 'viandas' ? 'viandas ' : '';
  win.document.write('<html><head><title>' + (_cajaDetalle.parcial ? 'Corte parcial caja ' : 'Arqueo caja ') + deViandas +
    String(_cajaDetalle.caja.numero || 0).padStart(4, '0') + '</title><style>' +
    '@page{margin:14mm;size:A4}html,body{margin:0;padding:0;background:#fff}' +
    'table{page-break-inside:auto}tr{page-break-inside:avoid;break-inside:avoid}thead{display:table-header-group}' +
    '</style></head><body>' + buildArqueoHTML(_cajaDetalle) + '</body></html>');
  win.document.close();
  win.focus();
  /* Sin el respiro el navegador a veces imprime la pagina todavia sin maquetar. */
  setTimeout(() => { win.print(); win.close(); }, 300);
}

function exportarArqueo() {
  if (!_cajaDetalle) { showAdminToast('El arqueo todavía no terminó de cargar', 'error'); return; }
  const fmt = document.getElementById('cajaExportFormato').value;
  try {
    if (fmt === 'csv') _exportarArqueoCSV();
    else _exportarArqueoPDF();
  } catch (e) {
    showAdminToast('No se pudo exportar: ' + e.message, 'error');
  }
}

function _bajarArchivo(blob, nombre) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nombre;
  document.body.appendChild(a); a.click(); a.remove();
  /* Revocar en el mismo tick cancela la descarga en algunos navegadores. */
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function _exportarArqueoCSV() {
  const d = _cajaDetalle, c = d.caja, medios = c.ventasPorMedio || {};
  const C = _caja(d.k);
  const filas = [];
  const push = (a, b, cc, dd, ee) => filas.push([a, b, cc, dd, ee].map(x => x == null ? '' : String(x)));
  push(C.titulo.toUpperCase()); push(C.nombre, String(c.numero || 0).padStart(4, '0')); push('Fecha', _cajaFecha(c.fecha));
  push('Abrió', c.abiertoPor || ''); push('Cerró', c.cerradoPor || ''); push('');
  push('Fondo inicial', c.montoInicial || 0);
  push('Ventas en efectivo', medios.efectivo || 0);
  push('Ingresos', c.totalIngresos || 0);
  if (Number(c.ingresosNoEfectivo || 0)) push('Cobros por transferencia o tarjeta (no suman al efectivo)', c.ingresosNoEfectivo);
  push('Egresos', c.totalEgresos || 0);
  push('Esperado en efectivo', c.esperadoEfectivo || 0);
  push('Contado', c.contadoEfectivo || 0);
  push('Diferencia', c.diferencia || 0);
  push('Motivo', c.motivoDiferencia || '');
  push('Retiro final', c.retiroFinal || 0);
  push('Quedó en caja', c.dejaEnCaja || 0);
  push('Observaciones', c.observaciones || ''); push('');
  push('VENTAS POR MEDIO');
  Object.keys(_MEDIOS_NOMBRE).forEach(k => { if (Number(medios[k] || 0) !== 0) push(_MEDIOS_NOMBRE[k], medios[k]); });
  push('Total facturado', c.ventasBruto || 0);
  push('Envíos cobrados', c.ventasEnvio || 0); push('');
  push('MOVIMIENTOS'); push('Hora', 'Tipo', 'Concepto', 'Detalle', 'Monto');
  d.movs.forEach(m => push(_hora(m.fecha), m.tipo, (CAJA_CONCEPTOS[m.tipo] && CAJA_CONCEPTOS[m.tipo][m.concepto]) || m.concepto || '',
    (m.detalle || '') + (_movEnEfectivo(m) ? '' : ' [' + (_MOV_MEDIO_NOMBRE[m.medio] || m.medio) + ': no suma al efectivo]') +
      (m.editado ? ' [editado]' : '') + (m.anulado ? ' [deshecho: era ' + _pesos(m.monto) + ', no cuenta]' : ''),
    m.anulado ? 0 : (m.tipo === 'egreso' ? -1 : 1) * Number(m.monto || 0)));
  push('');
  push('VENTAS'); push('Hora', 'Número', 'Cliente', 'Medio', 'Total');
  d.ventas.forEach(v => {
    const medio = (typeof medioKeyDeVenta === 'function') ? medioKeyDeVenta(v) : 'otro';
    push(_hora(v.fecha), _nroVenta(v), v.cliente || 'Consumidor final', _MEDIOS_NOMBRE[medio] || medio, Number(v.total || 0));
  });

  /* Se escapa a mano en vez de usar XLSX: son filas de largo distinto (secciones,
     titulos, tablas) y sheet_to_csv las normaliza a una grilla rectangular. */
  const csv = filas.map(r => r.map(x => '"' + String(x).replace(/"/g, '""') + '"').join(';')).join('\r\n');
  /* El BOM es lo que hace que Excel en Windows abra los acentos bien. Y el
     separador es ';' porque en configuracion regional es-AR la coma es decimal. */
  _bajarArchivo(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }), _nombreArchivoArqueo('csv'));
  showAdminToast('CSV descargado', 'success');
}

function _exportarArqueoPDF() {
  if (!window.jspdf || !window.jspdf.jsPDF) { showAdminToast('La librería de PDF no cargó. Recargue la página.', 'error'); return; }
  const d = _cajaDetalle, c = d.caja, medios = c.ventasPorMedio || {};
  const C = _caja(d.k);
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
  const M = 14, ancho = W - M * 2;
  let y = M;

  /* El PDF se dibuja con primitivas en vez de convertir el HTML: jsPDF necesita
     html2canvas para eso y el panel no lo carga. Mismo contenido y mismo orden
     que buildArqueoHTML; si cambia uno hay que tocar el otro. */
  const salto = (alto) => { if (y + (alto || 6) > H - M) { doc.addPage(); y = M; return true; } return false; };
  const txt = (s, x, opts) => doc.text(String(s == null ? '' : s), x, y, opts);
  const par = (etq, val, bold) => {
    salto();
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(70);
    txt(etq, M + 2);
    doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setTextColor(17);
    txt(val, W - M - 2, { align: 'right' });
    y += 5;
  };

  doc.setFillColor(17, 17, 17); doc.rect(0, 0, W, 13, 'F');
  doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
  doc.text((typeof NEGOCIO !== 'undefined' && NEGOCIO.nombre) ? NEGOCIO.nombre : 'Brotes Dietética', M, 8.5);
  doc.setFontSize(10);
  doc.text('Arqueo ' + C.nombre.toLowerCase() + ' #' + String(c.numero || 0).padStart(4, '0') + '  ·  ' + _cajaFecha(c.fecha), W - M, 8.5, { align: 'right' });
  y = 20; doc.setTextColor(17);

  const titulo = (t) => {
    salto(10); y += 2;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(17);
    txt(t, M); y += 2;
    doc.setDrawColor(150); doc.line(M, y, W - M, y); y += 4;
  };

  titulo('Apertura y cierre');
  par('Fondo inicial', _pesos(c.montoInicial));
  par('Abrió', String(c.abiertoPor || '-') + '   ' + (_fechaHora(c.abiertoEn) || ''));
  par('Cerró', String(c.cerradoPor || '-') + '   ' + (_fechaHora(c.cerradoEn) || ''));
  par('Retiro final', _pesos(c.retiroFinal));
  par('Quedó en caja', _pesos(c.dejaEnCaja), true);

  titulo('Efectivo esperado');
  par('Fondo inicial', _pesos(c.montoInicial));
  par('+ Ventas en efectivo', _pesos(medios.efectivo));
  par('+ Ingresos', _pesos(c.totalIngresos));
  par('- Egresos', _pesos(c.totalEgresos));
  par('Debería haber', _pesos(c.esperadoEfectivo), true);
  if (Number(c.ingresosNoEfectivo || 0)) par('Cobros por transferencia o tarjeta (no suman)', _pesos(c.ingresosNoEfectivo));
  par('Se contó', _pesos(c.contadoEfectivo), true);
  const dif = Number(c.diferencia || 0);
  par('Diferencia', (dif === 0 ? 'exacta' : (dif > 0 ? 'sobrante ' : 'faltante ') + _pesos(Math.abs(dif))), true);
  if (c.motivoDiferencia) {
    salto(); doc.setFont('helvetica', 'italic'); doc.setFontSize(8.5); doc.setTextColor(70);
    doc.text(doc.splitTextToSize('Motivo: ' + c.motivoDiferencia, ancho - 4), M + 2, y);
    y += 4 * doc.splitTextToSize('Motivo: ' + c.motivoDiferencia, ancho - 4).length;
  }

  titulo('Ventas (' + (c.ventasCount || 0) + ')');
  Object.keys(_MEDIOS_NOMBRE).forEach(k => { if (Number(medios[k] || 0) !== 0) par(_MEDIOS_NOMBRE[k], _pesos(medios[k])); });
  par('Total facturado', _pesos(c.ventasBruto), true);

  /* Tablas: anchos en mm que suman `ancho`. La ultima columna va a la derecha. */
  const tablaPDF = (cab, anchos, filas) => {
    salto(12);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(85);
    let x = M;
    cab.forEach((h, i) => {
      const der = i === cab.length - 1;
      doc.text(h, der ? x + anchos[i] : x, y, der ? { align: 'right' } : undefined);
      x += anchos[i];
    });
    y += 2; doc.setDrawColor(150); doc.line(M, y, W - M, y); y += 3.5;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(17);
    filas.forEach(fila => {
      if (salto(6)) {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(17);
      }
      let cx = M;
      fila.forEach((celda, i) => {
        const der = i === fila.length - 1;
        /* Se recorta al ancho de la columna: sin esto un detalle largo se pisa
           con la columna de al lado y el PDF queda ilegible. */
        const s = der ? String(celda) : doc.splitTextToSize(String(celda), anchos[i] - 2)[0] || '';
        doc.text(s, der ? cx + anchos[i] : cx, y, der ? { align: 'right' } : undefined);
        cx += anchos[i];
      });
      y += 5;
    });
    if (!filas.length) { salto(); doc.setTextColor(120); txt('Sin registros.', M + 2); y += 5; doc.setTextColor(17); }
  };

  titulo('Movimientos (' + d.movs.length + ')');
  tablaPDF(['Hora', 'Concepto', 'Detalle', 'Monto'], [14, 42, ancho - 14 - 42 - 28, 28],
    d.movs.map(m => [
      _hora(m.fecha),
      (CAJA_CONCEPTOS[m.tipo] && CAJA_CONCEPTOS[m.tipo][m.concepto]) || m.concepto || '-',
      (m.detalle || '') + (_movEnEfectivo(m) ? '' : ' (' + (_MOV_MEDIO_NOMBRE[m.medio] || m.medio) + ', no suma al efectivo)') +
        (m.editado ? ' (editado)' : '') + (m.anulado ? ' (deshecho, no cuenta)' : ''),
      (m.anulado ? 'deshecho ' : '') + (m.tipo === 'ingreso' ? '+ ' : '- ') + _pesos(m.monto)
    ]));

  titulo('Ventas (' + d.ventas.length + ')');
  tablaPDF(['Hora', 'N°', 'Cliente', 'Medio', 'Total'], [14, 16, ancho - 14 - 16 - 32 - 28, 32, 28],
    d.ventas.map(v => {
      const medio = (typeof medioKeyDeVenta === 'function') ? medioKeyDeVenta(v) : 'otro';
      return [_hora(v.fecha), _nroVenta(v), v.cliente || 'Consumidor final',
              _MEDIOS_NOMBRE[medio] || medio, _pesos(v.total)];
    }));

  salto(20); y += 10;
  doc.setDrawColor(150);
  doc.line(M, y, M + ancho / 2 - 8, y); doc.line(M + ancho / 2 + 8, y, W - M, y);
  y += 4; doc.setFontSize(8); doc.setTextColor(85);
  doc.text('Firma de quien cierra', M, y);
  doc.text('Firma de quien controla', M + ancho / 2 + 8, y);

  const total = doc.internal.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p); doc.setFontSize(7.5); doc.setTextColor(140);
    doc.text('Emitido el ' + new Date().toLocaleString('es-AR'), M, H - 7);
    doc.text(p + ' / ' + total, W - M, H - 7, { align: 'right' });
  }
  doc.save(_nombreArchivoArqueo('pdf'));
  showAdminToast('PDF descargado', 'success');
}

/* ============ API para el resto del panel ============ */

window.getCajaAbiertaId = function (k) {
  const a = _caja(k).actual;
  return (a && a.estado === 'abierta') ? a.docId : null;
};

/* La usa saveVenta para estampar la venta con la caja del día.

   Se consulta EN VIVO y no desde una variable, por dos motivos. Uno: si el
   cajero nunca entró a la sección Caja, `cajaActual` es null y las ventas
   saldrían sin cajaId aunque la caja esté abierta. Dos: si el cache quedara
   viejo (la otra pestaña cerró la caja), la venta se estamparía contra una caja
   ya cerrada — y como el cierre congela sus totales, esa venta no aparecería
   nunca en ningún arqueo. Con null al menos figura como "venta fuera de caja" y
   se puede adjuntar. Son dos lecturas por venta; a este volumen no se nota. */
/* Con 'viandas' pregunta por la caja de viandas: su puntero y su colección. Si la
   lectura falla, el respaldo es la de viandas en memoria, NUNCA la del local: una
   venta de viandas estampada con la caja del local metería su plata en el arqueo
   equivocado. */
window.getCajaAbiertaIdLive = async function (k) {
  const C = _caja(k);
  try {
    const p = await db.collection('config').doc(C.estadoDoc).get();
    const id = p.exists ? (p.data().cajaAbiertaId || null) : null;
    if (!id) return null;
    const c = await db.collection(C.col).doc(id).get();
    return (c.exists && c.data().estado === 'abierta') ? id : null;
  } catch (e) {
    console.warn('getCajaAbiertaIdLive:', e);
    return (C.actual && C.actual.estado === 'abierta') ? C.actual.docId : null;
  }
};
