/* =============================================================================
   CENTRO DE AVISOS (era "Inicio del día")  —  Brotes Dietética
   =============================================================================
   Pedido del comercio (26/09/2026, EXPERIMENTAL): una sección nueva, la primera
   que se ve al entrar al panel y pensada para la dueña. Lo importante del día en
   avisos fuertes, cada uno con el botón que lo resuelve ahí mismo:

   1) Cómo fue ayer: cuánto se vendió, en cuántas ventas, la ganancia y contra el
      mismo día de la semana anterior.
   2) Lo que SE VENDE y está sin stock (en 0: el negativo no se muestra). Con el
      freno de stock (26/09) eso no se puede vender en el mostrador. Primero lo que
      más se vende.
   3) Costos viejos (COSTO_VIEJO_DIAS, admin-costos.js) de lo que se vende, de a
      INICIO_TANDA_COSTOS, con el mismo editor que sale al vender. Desde acá solo
      sale de la lista el costo que se cambia (o se marca "Sigue igual"). Las bolsas
      y presentaciones de un producto van juntas (ver costosParaRevisar).
   4) Lo que se está por terminar: al ritmo del último mes, no llega a una semana.

   QUÉ ES "SE VENDE": que tuvo ventas en los últimos INICIO_DIAS días. Hay cientos
   de productos publicados en cero que nadie pide (en producción, 123 en cero el
   26/09); mezclarlos con los que sí se piden esconde lo urgente.

   UNA BOLSA VACÍA NO ES "SIN STOCK" si el granel tiene otra bolsa con stock: se
   sigue vendiendo, con el aviso de mezcla (admin-escalas.js). Va aparte.

   LECTURAS: las ventas de los últimos INICIO_DIAS días y el puntero de la caja
   abierta, una vez por día y por pestaña (quedan en memoria: recargar la página
   vuelve a leer, unas 250 lecturas), o al tocar "Volver a revisar". Si la lectura
   falla, se reintenta sola al minuto. Lo demás sale de allProducts, que ya está en
   memoria. Se repinta cuando algo cambia: con la campana (actualizarBadgeAlertas,
   productos, stock a mano y caja) y con cada venta (aplicarStockProductos).
   ============================================================================= */

const INICIO_DIAS = 30;             /* qué cuenta como "se vende" */
const INICIO_TANDA_COSTOS = 10;     /* costos por tanda: se revisan de a poco */
const INICIO_FILAS = 6;             /* filas por aviso antes de "Ver todos" */
const INICIO_DIAS_ALCANZA = 7;      /* "se está por terminar": no llega a una semana */
const _INI_DIA_MS = 86400000;

let _iniDatos = null;     /* { dia, ventas (null si no se pudieron leer), caja, error } */
let _iniCarga = null;     /* la lectura en vuelo */
let _iniListo = false;    /* los productos ya se cargaron: antes, cualquier lista sale vacía */
const _iniAbierto = { stock: false, terminar: false };

const _iniProds = () => (typeof allProducts !== 'undefined' && Array.isArray(allProducts) ? allProducts : []);
const _iniEsc = s => (typeof esc === 'function' ? esc(String(s == null ? '' : s)) : String(s == null ? '' : s));
const _iniAttr = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const _iniPlata = n => '$' + Math.round(Number(n || 0)).toLocaleString('es-AR');
const _iniPeso = x => (typeof esPorPeso === 'function' ? esPorPeso(x) : !!(x && x.tipoVenta === 'peso'));
/* Con bolsas o presentaciones, dice cuál es: "Maní Pelado x 1 kg", en todos los avisos
   (pedido del dueño, 26/09; _nombreConPresentacion, admin-variantes.js). */
const _iniNombre = p => {
  const n = (p && (p.nombreMostrado || p.nombre)) || '(sin nombre)';
  return p && typeof _nombreConPresentacion === 'function' ? _nombreConPresentacion(p, n) : n;
};
const _iniALaVenta = p => !!p && p.oculto !== true && p.depurado !== true;
const _iniS = (n, uno, varios) => (n === 1 ? uno : varios);

/* El día 'AAAA-MM-DD' en hora de Argentina, como la caja y Estadísticas. */
function _iniDia(d) {
  if (typeof hoyAR === 'function') return hoyAR(d);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

/* Timestamp de Firestore, Date o {seconds}: una fecha, o null. */
function _iniFecha(f) {
  if (!f) return null;
  if (typeof f.toDate === 'function') return f.toDate();
  if (f instanceof Date) return isNaN(f) ? null : f;
  if (typeof f.seconds === 'number') return new Date(f.seconds * 1000);
  const d = new Date(f);
  return isNaN(d) ? null : d;
}

/* "viernes 25/09" de un 'AAAA-MM-DD'. */
function _iniDiaTxt(dia) {
  const p = String(dia || '').split('-').map(Number);
  if (p.length !== 3 || !p[0]) return String(dia || '');
  const f = new Date(p[0], p[1] - 1, p[2]);
  return f.toLocaleDateString('es-AR', { weekday: 'long' }) + ' ' +
    String(p[2]).padStart(2, '0') + '/' + String(p[1]).padStart(2, '0');
}

/* Una cantidad en su unidad: "450 g", "1,5 kg", "3 unidades". */
function _iniCant(x, n) {
  const v = Number(n || 0);
  if (_iniPeso(x)) return typeof fmtPeso === 'function' ? fmtPeso(v) : v.toLocaleString('es-AR') + ' g';
  return v.toLocaleString('es-AR') + (Math.abs(v) === 1 ? ' unidad' : ' unidades');
}

/* ============================ LAS CUENTAS ============================ */

/* Cuánto se vendió de cada producto: { id: { veces, cantidad, monto } }. `veces` son
   las VENTAS en que aparece: un granel repartido en dos bolsas son dos renglones de la
   misma venta, pero cada bolsa tiene su propio id y cuenta una vez. */
function vendidoPorProducto(ventas) {
  const out = {};
  (ventas || []).forEach((v, k) => {
    const vistos = new Set();
    /* En qué ventas salió (enVentas): para contar las de un producto con bolsas sin repetir
       la venta que sacó de dos (costosParaRevisar; revisión del 27/09). */
    const venta = (v && (v.docId || v.id)) || ('#' + k);
    ((v && v.items) || []).forEach(i => {
      if (!i || !i.id) return;
      const x = out[i.id] || (out[i.id] = { veces: 0, cantidad: 0, monto: 0, enVentas: new Set() });
      x.enVentas.add(venta);
      if (!vistos.has(i.id)) { x.veces++; vistos.add(i.id); }
      x.cantidad += Number(i.cantidad || 0);
      x.monto += (i.subtotal != null) ? Number(i.subtotal || 0)
        : (typeof subtotalItem === 'function' ? subtotalItem(i) : 0);
    });
  });
  return out;
}

const _iniOrden = (a, b) => ((b.v ? b.v.veces : 0) - (a.v ? a.v.veces : 0)) ||
  ((b.v ? b.v.monto : 0) - (a.v ? a.v.monto : 0)) || _iniNombre(a.p).localeCompare(_iniNombre(b.p));

/* Las otras bolsas del mismo granel que todavía tienen stock. */
function _iniOtrasBolsas(p, prods) {
  if (typeof escalasDe !== 'function') return [];
  return escalasDe(p, prods).filter(e => e.id !== p.id && Number((e.producto && e.producto.stock) || 0) > 0);
}

/* Lo publicado con stock en 0. `lista`: lo que se vendió en el último mes y hoy no
   se puede vender. `bolsas`: bolsas vacías de un granel que sigue teniendo en otra.
   `quietos`: los que tampoco se vendieron. Sin ventas leídas (vendido null) no se sabe qué
   se vende, y van todos a `lista`.
   EL NEGATIVO NO APARECE (pedido del dueño, 26/09). Ojo: el mostrador ya no vende sin
   stock, pero un pedido WEB todavía puede dejarlo en negativo (descontarStockPedido
   descuenta aunque no alcance). Ese producto queda sin stock para el mostrador y acá
   no se ve; la campana sí lo cuenta. El dueño lo decidió así sabiéndolo (26/09). */
function sinStockQueSeVende(prods, vendido) {
  const lista = [], bolsas = [];
  let quietos = 0;
  (prods || []).filter(_iniALaVenta).forEach(p => {
    const s = Number(p.stock || 0);
    if (s !== 0) return;
    const v = vendido ? vendido[p.id] : null;
    if (vendido && !v) { quietos++; return; }
    const fila = { p: p, stock: s, v: v || null };
    const otras = _iniOtrasBolsas(p, prods);
    if (otras.length) { fila.otras = otras; bolsas.push(fila); }
    else lista.push(fila);
  });
  lista.sort(_iniOrden);
  bolsas.sort(_iniOrden);
  return { lista: lista, bolsas: bolsas, quietos: quietos };
}

/* Los costos para revisar: de lo que se vende, los que no se tocan hace
   COSTO_VIEJO_DIAS o más, primero lo que más se vende. Uno sin fecha no avisa (la
   misma regla que al vender, admin-costos.js): se cuenta aparte.
   LAS BOLSAS Y PRESENTACIONES DE UN PRODUCTO VAN JUNTAS (pedido del dueño, 26/09).
   Cada una tiene su costo y su fecha, y aparece la que tiene el costo viejo; pero "se
   vende" se mira en el producto entero: la bolsa de 2 kg sale solo cuando alguien
   lleva 2 kg, y con el costo viejo no aparecía aunque el maní se venda todos los
   días. Van una abajo de la otra, de la más chica a la más grande, en la misma tanda. */
function costosParaRevisar(prods, vendido, ahora) {
  const hoy = ahora || new Date();
  const limite = (typeof COSTO_VIEJO_DIAS === 'number') ? COSTO_VIEJO_DIAS : 30;
  const hoyDia = _iniDia(hoy);
  const aLaVenta = (prods || []).filter(_iniALaVenta);
  /* El producto de cada uno: el id del principal, como principalDeVariante (el suyo si
     no es una variante), y en qué ventas salió el producto: cada venta una vez, aunque haya
     sacado de dos bolsas (sumando las bolsas se contaba dos veces y el producto pasaba
     adelante de otros que se venden más; revisión del 27/09). */
  const ids = new Set((prods || []).map(p => p && p.id));
  const grupo = p => (p.gramajePadreId && ids.has(p.gramajePadreId) ? p.gramajePadreId : p.id);
  const ventasGrupo = {};
  if (vendido) aLaVenta.forEach(p => {
    const v = vendido[p.id];
    if (!v) return;
    const s = ventasGrupo[grupo(p)] || (ventasGrupo[grupo(p)] = new Set());
    if (v.enVentas) v.enVentas.forEach(x => s.add(x));
    else for (let k = 0; k < v.veces; k++) s.add(p.id + '#' + k);
  });
  const viejos = [];
  let sinFecha = 0, quietos = 0, revisadosHoy = 0;
  aLaVenta.forEach(p => {
    const f = (typeof fechaDeCosto === 'function') ? fechaDeCosto(p) : null;
    const g = grupo(p);
    const seVende = !vendido || !!ventasGrupo[g];
    if (!f) { if (seVende) sinFecha++; return; }
    if (_iniDia(f) === hoyDia) revisadosHoy++;
    const dias = Math.floor((hoy.getTime() - f.getTime()) / _INI_DIA_MS);
    if (dias < limite) return;
    if (!seVende) { quietos++; return; }
    viejos.push({ producto: p, fecha: f, dias: dias, v: (vendido && vendido[p.id]) || null, grupo: g });
  });
  /* Primero el producto que más se vende (y el más viejo); sus bolsas, juntas. */
  const veces = x => (ventasGrupo[x.grupo] ? ventasGrupo[x.grupo].size : 0);
  const masViejo = {};
  viejos.forEach(x => { masViejo[x.grupo] = Math.max(masViejo[x.grupo] || 0, x.dias); });
  viejos.sort((a, b) => (veces(b) - veces(a)) || (masViejo[b.grupo] - masViejo[a.grupo]) ||
    (a.grupo !== b.grupo ? (a.grupo < b.grupo ? -1 : 1)
      : (typeof _ordenVariantes === 'function' ? _ordenVariantes(a.producto, b.producto) : 0)));
  /* De a INICIO_TANDA_COSTOS, sin cortar un producto por la mitad. */
  const tanda = [];
  for (let i = 0; i < viejos.length;) {
    let j = i;
    while (j < viejos.length && viejos[j].grupo === viejos[i].grupo) j++;
    if (tanda.length && tanda.length + (j - i) > INICIO_TANDA_COSTOS) break;
    for (let k = i; k < j; k++) tanda.push(viejos[k]);
    i = j;
  }
  return { viejos: viejos, tanda: tanda, sinFecha: sinFecha, quietos: quietos, revisadosHoy: revisadosHoy };
}

/* Lo que se está por terminar al ritmo del último mes: le quedan menos de
   INICIO_DIAS_ALCANZA días. Con una sola venta el ritmo no dice nada: hacen falta dos. */
function porTerminarse(prods, vendido) {
  if (!vendido) return [];
  const out = [];
  (prods || []).filter(_iniALaVenta).forEach(p => {
    const s = Number(p.stock || 0), v = vendido[p.id];
    if (s <= 0 || !v || v.veces < 2 || !(v.cantidad > 0)) return;
    const dias = s / (v.cantidad / INICIO_DIAS);
    if (dias < INICIO_DIAS_ALCANZA) out.push({ p: p, stock: s, v: v, dias: dias });
  });
  return out.sort((a, b) => (a.dias - b.dias) || (b.v.veces - a.v.veces));
}

/* La ganancia de una venta, como gananciaDe (admin.html): lo cobrado menos el costo y
   menos el descuento general. Un renglón sin costo NO se cuenta -sumaría todo lo
   cobrado como si fuera ganancia-: se cuenta aparte para decirlo. */
function _iniGanancia(v, prods) {
  let g = 0, sinCosto = 0;
  ((v && v.items) || []).forEach(i => {
    if (!i) return;
    let costo = Number(i.costo || 0);
    if (!(costo > 0)) {
      const p = (prods || []).find(x => x && x.id === i.id);
      costo = p ? Number(p.costo || 0) : 0;
    }
    if (!(costo > 0)) { sinCosto++; return; }
    const cobrado = (typeof _precioCobradoItem === 'function') ? _precioCobradoItem(i) : Number(i.precio || 0);
    const cant = Number(i.cantidad || 0);
    g += _iniPeso(i) ? Math.round((cobrado - costo) * cant / 1000) : (cobrado - costo) * cant;
  });
  g -= Number((v && v.descuentoMonto) || 0);
  return { ganancia: g, sinCosto: sinCosto };
}

/* Un granel con escalas se vende repartido en bolsas: en "lo más vendido" va junto,
   con el nombre del producto. */
function _iniClaveTop(i, prods) {
  const p = (prods || []).find(x => x && x.id === i.id);
  if (p && typeof escalasDe === 'function' && typeof principalDeVariante === 'function' && escalasDe(p, prods).length) {
    const pr = principalDeVariante(p, prods);
    return { id: 'g:' + pr.id, nombre: typeof nombreDeGrupo === 'function' ? nombreDeGrupo(pr) : _iniNombre(pr), peso: true };
  }
  return { id: i.id, nombre: (p ? _iniNombre(p) : '') || i.nombre || '(sin nombre)', peso: _iniPeso(i) };
}

function _iniResumenDia(dia, ventas, prods) {
  let total = 0, local = 0, online = 0, ganancia = 0, sinCosto = 0;
  const top = {};
  ventas.forEach(v => {
    const neto = (typeof netoVenta === 'function') ? netoVenta(v) : Number(v.total || 0) - Number(v.envio || 0);
    total += neto;
    if (v.origen === 'web' || v.pedidoId) online += neto; else local += neto;
    const g = _iniGanancia(v, prods);
    ganancia += g.ganancia; sinCosto += g.sinCosto;
    (v.items || []).forEach(i => {
      if (!i || !i.id) return;
      const k = _iniClaveTop(i, prods);
      const x = top[k.id] || (top[k.id] = { nombre: k.nombre, peso: k.peso, cantidad: 0, monto: 0 });
      x.cantidad += Number(i.cantidad || 0);
      x.monto += (i.subtotal != null) ? Number(i.subtotal || 0) : (typeof subtotalItem === 'function' ? subtotalItem(i) : 0);
    });
  });
  return {
    dia: dia, count: ventas.length, total: total, local: local, online: online,
    ganancia: ganancia, sinCosto: sinCosto,
    top: Object.values(top).sort((a, b) => b.monto - a.monto).slice(0, 3),
  };
}

/* Cómo fue ayer, contra el mismo día de la semana anterior. En NETO, sin el envío,
   como Estadísticas: el flete no es mercadería vendida. Si ayer no hubo ventas (un
   domingo, por ejemplo), `ultimo` es el último día que sí hubo. */
function resumenDeAyer(ventas, ahora, prods) {
  const hoy = ahora || new Date();
  const dAyer = _iniDia(new Date(hoy.getTime() - _INI_DIA_MS));
  const dAntes = _iniDia(new Date(hoy.getTime() - 8 * _INI_DIA_MS));
  const porDia = {};
  (ventas || []).forEach(v => {
    const f = _iniFecha(v && v.fecha);
    if (!f) return;
    const d = _iniDia(f);
    (porDia[d] = porDia[d] || []).push(v);
  });
  const P = prods || _iniProds();
  const ayer = _iniResumenDia(dAyer, porDia[dAyer] || [], P);
  const antes = _iniResumenDia(dAntes, porDia[dAntes] || [], P);
  let ultimo = null;
  if (!ayer.count) {
    const previos = Object.keys(porDia).filter(d => d < dAyer).sort();
    if (previos.length) { const d = previos[previos.length - 1]; ultimo = _iniResumenDia(d, porDia[d], P); }
  }
  const variacion = (ayer.count && antes.total > 0) ? Math.round((ayer.total - antes.total) / antes.total * 100) : null;
  return { ayer: ayer, antes: antes, ultimo: ultimo, variacion: variacion };
}

/* ============================ LA LECTURA ============================ */

/* Lo leído sirve si es de hoy. Si la lectura falló, a los 60 segundos se reintenta
   sola: antes el error quedaba guardado todo el día. */
function _iniVigente() {
  const d = _iniDatos;
  return !!d && d.dia === _iniDia(new Date()) && (!d.error || Date.now() - d.en < 60000);
}

/* Las ventas del último mes y la caja abierta. Una vez por día: si el panel quedó
   abierto de ayer, al volver a entrar se relee sola. */
async function _iniCargar(forzar) {
  const dia = _iniDia(new Date());
  if (!forzar && _iniVigente()) return _iniDatos;
  if (_iniCarga) return _iniCarga;
  _iniCarga = (async () => {
    /* Un solo campo en el rango (fecha): no hace falta índice compuesto. */
    const desde = new Date(Date.now() - INICIO_DIAS * _INI_DIA_MS);
    const leer = async col => {
      const q = await db.collection(col).where('fecha', '>=', desde).get();
      return q.docs.map(d => Object.assign({ docId: d.id }, d.data()));
    };
    /* Las tres a la vez. Si falla solo la de mayoristas, las minoristas se muestran igual. */
    const r = await Promise.all([
      leer('ventas').catch(e => ({ fallo: e })),
      leer('ventasMayoristas').catch(e => ({ fallo: e })),
      Promise.resolve(typeof getCajaAbierta === 'function' ? getCajaAbierta() : null)
        .catch(e => { console.warn('inicio/caja:', e); return null; }),
    ]);
    let ventas = null, error = '';
    if (Array.isArray(r[0])) {
      if (!Array.isArray(r[1])) console.warn('inicio/ventasMayoristas:', r[1].fallo);
      ventas = r[0].concat(Array.isArray(r[1]) ? r[1] : []);
    } else {
      error = (r[0].fallo && r[0].fallo.message) || String(r[0].fallo);
      console.warn('inicio/ventas:', r[0].fallo);
    }
    _iniDatos = { dia: dia, ventas: ventas, caja: r[2], error: error, en: Date.now() };
    return _iniDatos;
  })();
  try { return await _iniCarga; } finally { _iniCarga = null; }
}

/* La caja abierta: la más nueva entre la de la sección Caja y la que se leyó acá.
   Antes ganaba siempre la de Caja, y si otro la cerraba desde otra compu el aviso
   seguía aunque se tocara "Volver a revisar". */
function _iniCaja() {
  const enCaja = typeof _cajaCargadaEn !== 'undefined' && _cajaCargadaEn && typeof cajaActual !== 'undefined';
  if (!_iniDatos) return enCaja ? cajaActual : null;
  return (enCaja && _cajaCargadaEn > _iniDatos.en) ? cajaActual : _iniDatos.caja;
}

/* ============================ EL DIBUJO ============================ */

const _iniVisible = () => { const el = document.getElementById('sec-inicio'); return !!(el && el.classList.contains('active')); };

function _iniBotonesStock(p) {
  const id = _iniAttr(p.id);
  return '<button type="button" class="btn btn-primary btn-sm" data-ini="agregar" data-id="' + id + '">' +
      '<i class="bi bi-plus-lg"></i> Agregar stock</button>' +
    '<button type="button" class="btn-icon" data-ini="corregir" data-id="' + id + '" ' +
      'title="Corregir el total (por ejemplo, después de contar)" aria-label="Corregir el stock de ' + _iniAttr(_iniNombre(p)) + '">' +
      '<i class="bi bi-pencil"></i></button>';
}

const _iniVendidoTxt = v => (v ? v.veces + _iniS(v.veces, ' venta', ' ventas') + ' en el último mes' : '');

function _iniFila(nombre, sub, dato, datoSub, acciones) {
  return '<div class="ini-fila">' +
    '<div class="ini-fila-nom"><b>' + _iniEsc(nombre) + '</b>' + (sub ? '<small>' + _iniEsc(sub) + '</small>' : '') + '</div>' +
    '<div class="ini-fila-dato">' + _iniEsc(dato) + (datoSub ? '<small>' + _iniEsc(datoSub) + '</small>' : '') + '</div>' +
    '<div class="ini-fila-acc">' + (acciones || '') + '</div>' +
  '</div>';
}

function _iniAviso(nivel, icono, titulo, texto, cuerpo, pie) {
  return '<section class="ini-alerta ' + nivel + '">' +
    '<div class="ini-alerta-cab"><span class="ini-alerta-ico"><i class="bi ' + icono + '"></i></span>' +
      '<div><h3 class="ini-alerta-tit">' + titulo + '</h3>' + (texto ? '<p class="ini-alerta-txt">' + texto + '</p>' : '') + '</div></div>' +
    (cuerpo ? '<div class="ini-filas">' + cuerpo + '</div>' : '') +
    (pie ? '<div class="ini-pie">' + pie + '</div>' : '') +
  '</section>';
}

const _iniNum = n => '<span class="ini-num">' + Number(n).toLocaleString('es-AR') + '</span>';

function _iniHtmlAyer(r) {
  if (!r) return '<div class="ini-ayer"><div class="ini-ayer-rot">Ayer</div><p class="ini-cargando">Revisando las ventas...</p></div>';
  const a = r.ayer;
  let h = '<div class="ini-ayer"><div class="ini-ayer-rot">Ayer · ' + _iniEsc(_iniDiaTxt(a.dia)) + '</div>';
  if (!a.count) {
    h += '<div class="ini-ayer-fila"><div class="ini-ayer-total">Sin ventas</div></div>';
    h += '<p class="ini-ayer-det">' + (r.ultimo
      ? 'El último día con ventas fue el <b>' + _iniEsc(_iniDiaTxt(r.ultimo.dia)) + '</b>: ' + _iniPlata(r.ultimo.total) +
        ' en ' + r.ultimo.count + _iniS(r.ultimo.count, ' venta', ' ventas') + '.'
      : 'No hubo ventas en el último mes.') + '</p>';
    return h + '</div>';
  }
  const semana = _iniDiaTxt(r.antes.dia).split(' ')[0];
  let comp;
  if (r.variacion == null) comp = '<span class="ini-comp">El ' + _iniEsc(semana) + ' anterior no hubo ventas</span>';
  else if (r.variacion > 0) comp = '<span class="ini-comp sube"><i class="bi bi-arrow-up-right"></i> ' + r.variacion + '% más que el ' + _iniEsc(semana) + ' anterior (' + _iniPlata(r.antes.total) + ')</span>';
  else if (r.variacion < 0) comp = '<span class="ini-comp baja"><i class="bi bi-arrow-down-right"></i> ' + Math.abs(r.variacion) + '% menos que el ' + _iniEsc(semana) + ' anterior (' + _iniPlata(r.antes.total) + ')</span>';
  else comp = '<span class="ini-comp">Igual que el ' + _iniEsc(semana) + ' anterior (' + _iniPlata(r.antes.total) + ')</span>';
  h += '<div class="ini-ayer-fila"><div class="ini-ayer-total">' + _iniPlata(a.total) + '</div>' +
    '<div class="ini-ayer-cant">en ' + a.count + _iniS(a.count, ' venta', ' ventas') + '</div>' + comp + '</div>';
  const det = [];
  det.push('Ganancia aproximada: <b>' + _iniPlata(a.ganancia) + '</b>' + (a.sinCosto
    ? ' (sin contar ' + a.sinCosto + _iniS(a.sinCosto, ' producto que no tiene', ' productos que no tienen') + ' costo cargado)' : ''));
  if (a.online > 0) det.push('Mostrador ' + _iniPlata(a.local) + ' · Tienda online ' + _iniPlata(a.online));
  if (a.top.length) {
    det.push('Lo más vendido: ' + a.top.map(x => '<b>' + _iniEsc(x.nombre) + '</b> (' +
      _iniEsc(_iniCant({ tipoVenta: x.peso ? 'peso' : 'unidad' }, x.cantidad)) + ')').join(' · '));
  }
  return h + '<p class="ini-ayer-det">' + det.join('<br>') + '</p></div>';
}

function _iniHtmlCaja(caja) {
  if (!caja || caja.estado !== 'abierta' || !caja.fecha || caja.fecha === _iniDia(new Date())) return '';
  return _iniAviso('critico', 'bi-cash-stack',
    'La caja quedó abierta del ' + _iniEsc(_iniDiaTxt(caja.fecha)),
    'Todo lo que se venda hoy entra en el arqueo de ese día. Cerrala y abrí la de hoy.',
    '', '<button type="button" class="btn btn-primary btn-sm" data-ini="ir" data-sec="caja"><i class="bi bi-cash-stack"></i> Ir a Caja</button>');
}

function _iniHtmlSinStock(s, conVentas) {
  const n = s.lista.length;
  const bolsasHtml = s.bolsas.length
    ? '<div class="ini-sub">Bolsas vacías que se siguen vendiendo con otra bolsa</div>' +
      s.bolsas.map(f => {
        const o = f.otras[0];
        return _iniFila(_iniNombre(f.p), _iniVendidoTxt(f.v), 'En stock: ' + _iniCant(f.p, f.stock),
          'se vende de la bolsa de ' + o.etiqueta + ' (' + _iniCant(o.producto, o.producto.stock) + '), con aviso de mezcla',
          _iniBotonesStock(f.p));
      }).join('')
    : '';
  const quietos = s.quietos
    ? '<span>Además hay ' + s.quietos + _iniS(s.quietos, ' producto publicado', ' productos publicados') +
      ' sin stock que no se ' + _iniS(s.quietos, 'vendió', 'vendieron') + ' en el último mes.</span>' +
      '<button type="button" class="ini-link" data-ini="ir" data-sec="stock">Ir a Stock</button>'
    : '';
  if (!n) {
    if (!bolsasHtml) {
      return _iniAviso('ok', 'bi-check-circle-fill', 'Todo lo que se vende tiene stock',
        'Ningún producto vendido en el último mes está en cero.', '', quietos);
    }
    return _iniAviso('aviso', 'bi-bag-x', 'Hay bolsas vacías',
      'Se siguen vendiendo con la otra bolsa, pero cada venta sale con el aviso de mezcla y a otro costo. Cargá las bolsas que te llegaron.',
      bolsasHtml, quietos);
  }
  const todas = _iniAbierto.stock ? s.lista : s.lista.slice(0, INICIO_FILAS);
  const filas = todas.map(f => _iniFila(_iniNombre(f.p), _iniVendidoTxt(f.v), 'En stock: ' + _iniCant(f.p, f.stock),
    '', _iniBotonesStock(f.p))).join('');
  const verTodo = n > INICIO_FILAS
    ? '<button type="button" class="ini-link" data-ini="todo" data-cual="stock">' + (_iniAbierto.stock ? 'Ver menos' : 'Ver los ' + n) + '</button>' : '';
  const titulo = conVentas
    ? _iniNum(n) + _iniS(n, ' producto que se vende está', ' productos que se venden están') + ' sin stock'
    : _iniNum(n) + _iniS(n, ' producto publicado está', ' productos publicados están') + ' sin stock';
  const texto = 'Así no se pueden vender en el mostrador: el sistema no deja vender lo que no hay. ' +
    'Si tenés la mercadería, cargala con <b>Agregar stock</b>.' +
    (conVentas ? ' Primero están los que más se venden.' : ' (No se pudieron leer las ventas, así que no se sabe cuáles se venden más.)');
  return _iniAviso('critico', 'bi-x-octagon-fill', titulo, texto, filas + bolsasHtml, verTodo + quietos);
}

function _iniHtmlCostos(c) {
  const hoyTxt = c.revisadosHoy
    ? '<span>Hoy ya se ' + _iniS(c.revisadosHoy, 'revisó 1 costo', 'revisaron ' + c.revisadosHoy + ' costos') + '.</span>' : '';
  const quietos = c.quietos
    ? '<span>' + (c.quietos === 1
      ? 'Hay otro con el costo viejo que no se vendió en el último mes: igual avisa al venderlo.'
      : 'Hay otros ' + c.quietos + ' con el costo viejo que no se vendieron en el último mes: igual avisan al venderlos.') + '</span>' : '';
  if (!c.viejos.length) {
    /* Sin fecha no se sabe: decir "al día" sería mentir. Pasa hasta que se carguen las
       fechas iniciales (ver PENDIENTE.md). */
    if (c.sinFecha) {
      return _iniAviso('info', 'bi-info-circle-fill',
        _iniNum(c.sinFecha) + _iniS(c.sinFecha, ' producto que se vende no tiene', ' productos que se venden no tienen') + ' fecha de costo',
        'No se sabe cuándo se revisó su costo por última vez, así que este aviso no los puede controlar. ' +
        'La fecha se anota sola la próxima vez que se cambie o se confirme el costo.', '', hoyTxt + quietos);
    }
    return _iniAviso('ok', 'bi-check-circle-fill', 'Los costos de lo que se vende están al día',
      'Todos los productos vendidos en el último mes tienen el costo revisado hace menos de un mes.', '', hoyTxt + quietos);
  }
  const n = c.viejos.length, t = c.tanda.length;
  const filas = c.tanda.map(x => _iniFila(_iniNombre(x.producto), _iniVendidoTxt(x.v),
    /* En una bolsa, lo de la bolsa: la ventana que abre "Revisar" la pide así (revisión del 27/09). */
    'Costo: ' + (typeof costoActualTxt === 'function' ? costoActualTxt(x.producto)
      : _iniPlata(x.producto.costo) + (_iniPeso(x.producto) ? ' el kilo' : '')),
    'sin revisar hace ' + x.dias + ' días', '')).join('');
  const boton = '<button type="button" class="btn btn-primary btn-sm" data-ini="costos"><i class="bi bi-pencil-square"></i> ' +
    (t === 1 ? 'Revisar este costo' : 'Revisar estos ' + t + ' costos') + '</button>';
  const sigue = n > t ? '<span>Son los ' + t + ' que más se venden; hay ' + (n - t) + ' más.</span>' : '';
  return _iniAviso('aviso', 'bi-clock-history',
    _iniNum(n) + _iniS(n, ' producto que se vende tiene', ' productos que se venden tienen') + ' el costo viejo',
    'Hace más de un mes que no se revisa su costo. Si el proveedor aumentó y no se cargó, se venden con el precio viejo ' +
    'y ganás menos de lo que parece. Tocá el botón y poné el costo nuevo en los que aumentaron: esos salen de la lista. Los que no cambies siguen acá.',
    filas, boton + sigue + hoyTxt + quietos);
}

function _iniHtmlTerminar(lista) {
  if (!lista.length) return '';
  const n = lista.length;
  const todas = _iniAbierto.terminar ? lista : lista.slice(0, INICIO_FILAS);
  const filas = todas.map(x => _iniFila(_iniNombre(x.p), _iniVendidoTxt(x.v),
    'Quedan ' + _iniCant(x.p, x.stock),
    x.dias < 1 ? 'no llega a un día' : 'alcanza para unos ' + Math.max(1, Math.round(x.dias)) + _iniS(Math.max(1, Math.round(x.dias)), ' día', ' días'),
    _iniBotonesStock(x.p))).join('');
  const verTodo = n > INICIO_FILAS
    ? '<button type="button" class="ini-link" data-ini="todo" data-cual="terminar">' + (_iniAbierto.terminar ? 'Ver menos' : 'Ver los ' + n) + '</button>' : '';
  return _iniAviso('aviso', 'bi-hourglass-split',
    _iniNum(n) + _iniS(n, ' producto se está', ' productos se están') + ' por terminar',
    'Al ritmo de venta del último mes, no llegan a una semana. Conviene pedirlos al proveedor.', filas, verTodo);
}

/* Lo que la campana ya avisa y acá no tiene su propio cartel: los insumos. */
function _iniHtmlTambien() {
  const al = (typeof _alertas !== 'undefined' && Array.isArray(_alertas)) ? _alertas : [];
  const ins = al.find(a => a && a.id === 'insumos-bajos');
  if (!ins) return '';
  return '<div class="ini-tambien"><span>También:</span>' +
    '<button type="button" class="ini-chip" data-ini="ir" data-sec="insumos"><i class="bi bi-tools"></i> ' + _iniEsc(ins.titulo) + '</button></div>';
}

function _iniSaludo(h) { return h < 13 ? 'Buen día' : (h < 20 ? 'Buenas tardes' : 'Buenas noches'); }

function renderInicio() {
  const cont = document.getElementById('inicioBody');
  if (!cont) return;
  if (!cont.dataset.iniClick) { cont.addEventListener('click', _iniClick); cont.dataset.iniClick = '1'; }
  const ahora = new Date();
  const fecha = ahora.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' }).replace(',', '');
  let h = '<div class="ini-cab"><div>' +
      '<div class="ini-rotulo">Centro de avisos</div>' +
      '<h2 class="ini-saludo">' + _iniSaludo(ahora.getHours()) + '</h2>' +
      '<p class="ini-hoy">' + _iniEsc(fecha.charAt(0).toUpperCase() + fecha.slice(1)) + '</p></div>' +
    '<button type="button" class="btn btn-secondary ini-revisar" data-ini="revisar"' + (_iniCarga ? ' disabled' : '') + '>' +
      '<i class="bi bi-arrow-clockwise"></i> ' + (_iniCarga ? 'Revisando...' : 'Volver a revisar') + '</button></div>';
  if (!_iniListo) { cont.innerHTML = h + '<p class="ini-cargando">Cargando los productos...</p>'; return; }

  /* Lo de otro día no sirve (el panel quedó abierto de ayer): se muestra "Revisando" y
     refrescarInicio lo relee. */
  const d = (_iniDatos && _iniDatos.dia === _iniDia(ahora)) ? _iniDatos : null;
  const prods = _iniProds();
  /* Sin productos no hay nada que afirmar: si fallaron, decía "Todo en orden". */
  if (!prods.length) {
    cont.innerHTML = h + '<p class="ini-cargando">Todavía no hay productos cargados. Si no aparecen en un momento, recargá la página.</p>';
    return;
  }
  const conVentas = !!(d && d.ventas);
  const vendido = conVentas ? vendidoPorProducto(d.ventas) : null;
  const avisos = [];
  const caja = _iniHtmlCaja(_iniCaja());
  if (caja) avisos.push({ nivel: 'critico', html: caja });
  /* Con "Descontar stock" apagado (Configuración) el stock no se mueve ni frena ventas:
     un aviso de stock diría algo que no es cierto. */
  const stockActivo = !(typeof DESCONTAR_STOCK !== 'undefined' && DESCONTAR_STOCK === false);
  if (d) {
    if (stockActivo) {
      const s = sinStockQueSeVende(prods, vendido);
      avisos.push({ nivel: s.lista.length ? 'critico' : (s.bolsas.length ? 'aviso' : 'ok'), html: _iniHtmlSinStock(s, conVentas) });
    } else {
      avisos.push({ nivel: 'ok', html: _iniAviso('info', 'bi-info-circle-fill', 'Los avisos de stock están apagados',
        'En Configuración está apagado "Descontar stock automáticamente": el stock no se mueve al vender.', '', '') });
    }
    const c = costosParaRevisar(prods, vendido, ahora);
    avisos.push({ nivel: c.viejos.length ? 'aviso' : 'ok', html: _iniHtmlCostos(c) });
    const t = stockActivo ? _iniHtmlTerminar(porTerminarse(prods, vendido)) : '';
    if (t) avisos.push({ nivel: 'aviso', html: t });
  }
  const criticos = avisos.filter(a => a.nivel === 'critico').length;
  const aRevisar = avisos.filter(a => a.nivel === 'aviso').length;
  if (d) {
    const v = criticos
      ? { c: 'critico', i: 'bi-exclamation-octagon-fill', t: 'Hoy hay ' + criticos + _iniS(criticos, ' cosa importante', ' cosas importantes') +
          ' para resolver' + (aRevisar ? ' y ' + aRevisar + ' más para revisar' : '') + '.' }
      : aRevisar
        ? { c: 'aviso', i: 'bi-exclamation-triangle-fill', t: 'Nada urgente. Hay ' + aRevisar + _iniS(aRevisar, ' cosa', ' cosas') + ' para revisar cuando puedas.' }
        : { c: 'ok', i: 'bi-check-circle-fill', t: 'Todo en orden. ¡Buenas ventas!' };
    h += '<div class="ini-veredicto ' + v.c + '"><i class="bi ' + v.i + '"></i> ' + v.t + '</div>';
  }
  if (d && d.error) h += '<p class="ini-cargando">No se pudieron leer las ventas: ' + _iniEsc(d.error) + '</p>';
  h += (conVentas ? _iniHtmlAyer(resumenDeAyer(d.ventas, ahora, prods)) : (d ? '' : _iniHtmlAyer(null)));
  /* Primero lo urgente: el orden de la lista ya lo es, pero la caja puede llegar tarde. */
  h += avisos.filter(a => a.nivel === 'critico').concat(avisos.filter(a => a.nivel !== 'critico')).map(a => a.html).join('');
  h += _iniHtmlTambien();
  cont.innerHTML = h;
}

/* ============================ LOS BOTONES ============================ */

function _iniClick(e) {
  const b = e.target && e.target.closest ? e.target.closest('[data-ini]') : null;
  if (!b || b.disabled) return;
  const que = b.getAttribute('data-ini'), id = b.getAttribute('data-id');
  if (que === 'agregar' && typeof agregarStockProducto === 'function') agregarStockProducto(id);
  else if (que === 'corregir' && typeof corregirStockProducto === 'function') corregirStockProducto(id);
  else if (que === 'costos') revisarCostosDeInicio();
  else if (que === 'todo') verTodoInicio(b.getAttribute('data-cual'));
  else if (que === 'revisar') refrescarInicio(true);
  else if (que === 'ir' && typeof switchSection === 'function') switchSection(b.getAttribute('data-sec'));
}

function verTodoInicio(cual) {
  if (!(cual in _iniAbierto)) return;
  _iniAbierto[cual] = !_iniAbierto[cual];
  refrescarInicio(false);
}

/* "Revisar estos 10 costos": el editor de costos de la venta (admin-costos.js), con
   la tanda de ahora. Al guardar, avisa a la campana y esto se repinta con los que
   siguen. */
function revisarCostosDeInicio() {
  if (typeof abrirEditorCostos !== 'function') return;
  const d = _iniDatos;
  const vendido = d && d.ventas ? vendidoPorProducto(d.ventas) : null;
  const c = costosParaRevisar(_iniProds(), vendido);
  if (!c.tanda.length) { refrescarInicio(false); return; }
  abrirEditorCostos(c.tanda, 'inicio');
}

async function refrescarInicio(forzar) {
  renderInicio();
  if (!forzar && _iniVigente()) return;
  const p = _iniCargar(forzar);
  renderInicio();   /* "Revisando..." en el botón */
  await p;
  renderInicio();
}

/* switchSection('inicio'). */
function entrarAInicio() { return refrescarInicio(false); }

/* Vender, editar o borrar una venta mueve el stock con aplicarStockProductos (admin.html)
   y NO pasa por la campana: sin esto, después de vender parado en Inicio seguía diciendo
   "Quedan 3 unidades" de lo que se acababa de vender. */
(function () {
  if (typeof aplicarStockProductos !== 'function') return;
  const orig = aplicarStockProductos;
  window.aplicarStockProductos = async function () {
    const r = await orig.apply(this, arguments);
    if (_iniListo && _iniVisible()) refrescarInicio(false);
    return r;
  };
})();

/* Los cambios de productos, stock a mano y caja terminan en actualizarBadgeAlertas (la
   campana). Al login, además, es la señal de que la carga de productos terminó (si
   falló, renderInicio lo nota: allProducts vacío). */
(function () {
  if (typeof actualizarBadgeAlertas !== 'function') return;
  const orig = actualizarBadgeAlertas;
  window.actualizarBadgeAlertas = async function () {
    const r = await orig.apply(this, arguments);
    _iniListo = true;
    if (_iniVisible()) refrescarInicio(false);
    return r;
  };
})();
