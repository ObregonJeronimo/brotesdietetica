/* =============================================================================
   COSTOS DESACTUALIZADOS  —  Brotes Dietética
   =============================================================================
   Pedido del comercio (24/09/2026): si el costo de un producto no se tocó hace un
   mes o más, al registrar una venta aparece un aviso con esos productos y la fecha
   de su último cambio, con dos salidas: "Modificar costos" o "Ignorar advertencia y
   vender de todas formas".

   DE DÓNDE SALE LA FECHA: costoActualizadoEn, en cada producto.
   - La escribe la Cloud Function registrarCambioDeCosto cada vez que CAMBIA el campo
     costo, venga de donde venga: el formulario, Importar Costos, Importar Nuevos, una
     compra, el PDF semanal. Escuchar la base y no las pantallas es lo que hace que
     ningún camino se olvide de anotarla.
   - La escribe este módulo cuando alguien CONFIRMA que un costo sigue vigente sin
     cambiarlo. Sin eso, el producto cuyo proveedor no aumentó quedaría avisando para
     siempre, porque la función solo se entera de los cambios.

   UN PRODUCTO SIN FECHA NO AVISA. No hay forma de saber si su costo es viejo, y un
   aviso que se equivoca enseña a apretar "Ignorar" sin leer.

   SOLO AL CREAR UNA VENTA. Editar una venta vieja no es vender.

   EL PRECIO SE RECALCULA IGUAL QUE EN EL FORMULARIO: precio = costo × (1 + %), y el
   mayorista con su % y redondeado a $50. Si esto y el formulario calcularan distinto,
   el mismo costo daría dos precios según por dónde se cargó.
   ============================================================================= */

const COSTO_VIEJO_DIAS = 30;
const _COSTO_DIA_MS = 86400000;

/* Timestamp de Firestore, Date, o lo que venga: una fecha, o null. */
function fechaDeCosto(p) {
  const v = p && p.costoActualizadoEn;
  if (!v) return null;
  if (typeof v.toDate === 'function') { const d = v.toDate(); return isNaN(d) ? null : d; }
  if (v instanceof Date) return isNaN(v) ? null : v;
  if (typeof v.seconds === 'number') return new Date(v.seconds * 1000);
  const d = new Date(v);
  return isNaN(d) ? null : d;
}

/* Los productos de la venta con el costo sin tocar hace COSTO_VIEJO_DIAS o más, uno
   por producto aunque esté dos veces en la venta. Los más viejos primero. */
function costosViejos(items, productos, ahora) {
  const hoy = ahora || new Date();
  const vistos = new Set();
  const out = [];
  (items || []).forEach(it => {
    if (!it || !it.id || vistos.has(it.id)) return;
    vistos.add(it.id);
    const p = (productos || []).find(x => x && x.id === it.id);
    const f = fechaDeCosto(p);
    if (!f) return;
    const dias = Math.floor((hoy.getTime() - f.getTime()) / _COSTO_DIA_MS);
    if (dias >= COSTO_VIEJO_DIAS) out.push({ producto: p, fecha: f, dias: dias });
  });
  return out.sort((a, b) => b.dias - a.dias);
}

/* El precio que resulta de un costo, con la misma cuenta que saveProduct. */
function preciosDesdeCosto(p, costo) {
  const pct = Number((p && p.porcentaje) || 0);
  const pctMay = Number((p && p.porcentajeMayorista) || 0);
  const redondear = (typeof _redondearMayorista === 'function')
    ? _redondearMayorista : (n => (n ? Math.ceil(n / 50) * 50 : 0));
  return {
    precio: Math.round(costo * (1 + pct / 100)),
    precioMayorista: redondear(Math.round(costo * (1 + pctMay / 100))),
  };
}

/* Con bolsas o presentaciones, cuál es: "Maní Pelado x 1 kg", como la otra bolsa ("Maní
   Pelado x 2 kg"; _nombreConPresentacion, admin-variantes.js). Pedido del dueño (26/09):
   la bolsa principal salía como "Maní Pelado", sin decir de cuánto. */
const _costoNombre = p => {
  const n = (p && (p.nombreMostrado || p.nombre)) || 'un producto';
  return p && typeof _nombreConPresentacion === 'function' ? _nombreConPresentacion(p, n) : n;
};
const _costoPesos = n => '$' + Math.round(Number(n || 0)).toLocaleString('es-AR');
const _costoFechaTxt = f => (f ? f.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '');
const _costoHace = d => (d <= 0 ? 'hoy' : d === 1 ? 'hace 1 día' : 'hace ' + d + ' días');
const _costoUnidad = p => (p && p.tipoVenta === 'peso' ? ' el kilo' : '');
const _costoEsc = s => (typeof esc === 'function' ? esc(String(s == null ? '' : s)) : String(s == null ? '' : s));
const _costoLeer = v => Math.round(Number(typeof montoAR === 'function' ? montoAR(v) : String(v || '').replace(/[^0-9]/g, '')) || 0);

/* LAS BOLSAS, POR BOLSA (pedido del dueño, 27/09). El costo de una bolsa de granel se
   guarda por kilo, pero en el formulario se carga lo que costó la bolsa entera ("Costo y
   precio de cada bolsa"): acá también, para que lo mismo no se escriba de dos formas.
   $2.000 la bolsa de 3 kg se guarda como $667 el kilo (y vuelve como $2.001: el kilo va
   en pesos enteros). gramosDeBolsa está en admin-variantes.js. */
const _costoGramos = p => (typeof gramosDeBolsa === 'function' ? gramosDeBolsa(p) : null);
/* Con g hay admin-variantes.js (gramosDeBolsa), y con él costoDeBolsa y kiloDeBolsa. */
const _costoEscrito = (p, g) => (g ? costoDeBolsa(p && p.costo, g) : Math.round(Number((p && p.costo) || 0)));
const _costoGuardado = (n, g) => (g ? kiloDeBolsa(n, g) : n);

/* EL COSTO DE LA BOLSA, OPCIONAL (pedido del dueño, 01/10). En un granel sin otras bolsas que
   sabe de cuánto es su bolsa -la anotada aparte (bolsaGramos, de la ficha o de una compra) o la
   que dice el nombre, como en Cargar compra (_cpGramosBolsa)-, al lado del costo por kilo va
   "o la bolsa de 5 kg": lo que dice la factura, y el kilo sale solo (costoBolsaEnEditor). Se
   guarda el kilo, como siempre. Con 1 kg no hace falta (es lo mismo), y en una bolsa de un
   grupo tampoco: ahí ya se carga por bolsa. */
const _costoTam = g => (g >= 1000 ? (g / 1000).toLocaleString('es-AR', { maximumFractionDigits: 3 }) + ' kg' : g + ' g');
function _costoBolsaSuelto(p) {
  if (!p || p.tipoVenta !== 'peso' || _costoGramos(p)) return null;
  if (Number(p.bolsaGramos) > 0) return Math.round(Number(p.bolsaGramos));
  return typeof bolsaDelNombre === 'function' ? bolsaDelNombre(p.nombre) : null;
}

/* El costo por kilo que se guardaría con lo escrito en una fila. Si es lo mismo que se
   mostró, el que ya tiene: la cuenta de la bolsa al kilo y de vuelta no es exacta (una bolsa
   de 500 g a $3.001 el kilo se muestra $1.501, que vuelve como $3.002), y una fila sin tocar
   se guardaba como cambio, con precio nuevo (revisión del 27/09). */
function _costoDeFila(fila, mostrado, escrito) {
  const p = fila && fila.producto;
  return escrito === mostrado ? Math.round(Number((p && p.costo) || 0)) : _costoGuardado(escrito, _costoGramos(p));
}

/* El costo como se carga: en una bolsa, lo de la bolsa (y el kilo entre paréntesis); si no,
   por kilo o por unidad. Lo usan el aviso al vender, la ventana y el Centro de avisos: el
   aviso decía "$4.500 el kilo", la ventana que abre pedía la bolsa, y escribiendo ahí el
   kilo el costo quedaba en un tercio (revisión del 27/09). */
function costoActualTxt(p) {
  const g = _costoGramos(p);
  if (!g) return _costoPesos(p && p.costo) + _costoUnidad(p);
  return _costoPesos(_costoEscrito(p, g)) + ' la bolsa' + (g !== 1000 ? ' (' + _costoPesos(p.costo) + ' el kilo)' : '');
}

/* Lo que queda con el costo que se está escribiendo, al lado del campo (pedido del dueño,
   27/09). Revisión del 27/09:
   - Es lo mismo que muestra la tabla de bolsas del formulario (_resFilaVar, admin-variantes.js),
     con la caja cerrada (se cobra el mayorista, y eso va primero) y la oferta.
   - Con el costo de siempre van los precios que ya tiene (pueden estar redondeados a mano),
     que son los que quedan al guardar; con otro costo, los que se van a calcular
     (preciosDesdeCosto). Antes mostraba siempre la cuenta, y contradecía al precio real. */
function _costoVistaHtml(p, costo, gramos) {
  if (!(costo > 0)) return '<span class="costos-falta">Poné el costo.</span>';
  const r = costo === Math.round(Number(p.costo || 0))
    ? { precio: Number(p.precio || 0), precioMayorista: Number(p.precioMayorista || 0) }
    : preciosDesdeCosto(p, costo);
  const may = r.precioMayorista || r.precio;
  if (typeof _resFilaVar === 'function') {
    const caja = typeof esCajaCerrada === 'function' && esCajaCerrada(p) && r.precioMayorista > 0;
    return _resFilaVar({ costo: costo, precio: r.precio, may: may }, p.tipoVenta === 'peso', caja, p.descuento);
  }
  const kg = _costoUnidad(p);
  return (gramos ? '<span>Costo ' + _costoPesos(costo) + ' el kilo</span>' : '') +
    '<span>Precio <b>' + _costoPesos(r.precio) + '</b>' + kg + '</span>' +
    '<span class="costos-may">Mayorista ' + _costoPesos(may) + kg + '</span>';
}

/* La fecha debajo del costo, en el formulario del producto. */
function pintarFechaCosto(p) {
  const el = document.getElementById('pCostoFecha');
  if (!el) return;
  el.style.color = '';
  if (!p) { el.textContent = 'La fecha del costo se registra al guardar.'; return; }
  const f = fechaDeCosto(p);
  if (!f) { el.textContent = 'Todavía no hay fecha registrada del último cambio de costo.'; return; }
  const dias = Math.floor((Date.now() - f.getTime()) / _COSTO_DIA_MS);
  el.textContent = 'Último cambio de costo: ' + _costoFechaTxt(f) + ' (' + _costoHace(dias) + ')' +
    (dias >= COSTO_VIEJO_DIAS ? '. Desactualizado: al venderlo se va a avisar.' : '.');
  if (dias >= COSTO_VIEJO_DIAS) el.style.color = '#EDB833';
}

/* ------------------------------------------------------------ EL AVISO
   Devuelve true si la venta sigue. "Modificar costos" abre el editor y devuelve
   false: la venta queda abierta, con los precios al día, para registrarla de nuevo.
   Cerrar el aviso sin elegir (Escape, clic afuera) también vuelve a la venta. */
async function avisoCostosViejos(items, ctx) {
  const viejos = costosViejos(items, (typeof allProducts !== 'undefined' ? allProducts : []));
  /* Si el diálogo no cargó, la venta no se frena: un aviso nunca puede impedir cobrar. */
  if (!viejos.length || typeof pedirOpcion !== 'function') return true;
  const NL = String.fromCharCode(10);
  const lista = viejos.slice(0, 10).map(v =>
    '• ' + _costoNombre(v.producto) + ': ' + costoActualTxt(v.producto) +
    ', cambiado el ' + _costoFechaTxt(v.fecha) + ' (' + _costoHace(v.dias) + ')').join(NL);
  const msg = (viejos.length === 1
      ? 'El costo de este producto está desactualizado hace 1 mes o más:'
      : 'El costo de uno o más productos está desactualizado hace 1 mes o más:') +
    NL + NL + lista + (viejos.length > 10 ? NL + '• y ' + (viejos.length - 10) + ' más' : '');
  const r = await pedirOpcion(msg, {
    titulo: 'Costos desactualizados',
    icono: 'bi-clock-history',
    opciones: [
      { valor: 'modificar', texto: 'Modificar costos', principal: true },
      { valor: 'ignorar', texto: 'Ignorar advertencia y vender de todas formas' },
    ],
  });
  if (r === 'ignorar') return true;
  if (r === 'modificar') abrirEditorCostos(viejos, ctx);
  return false;
}

/* ------------------------------------------------------------ EL EDITOR */
/* { filas: [{ producto, fecha, dias }], escritos: [lo que se mostró en cada campo],
     ctx: 'min' | 'may' | 'inicio' | 'prod', guardando } */
let _costosEditor = null;

/* ctx 'inicio': desde el Centro de avisos (admin-inicio.js); 'prod': desde el panel de bolsas
   de Productos (admin-variantes.js). Los dos sin una venta abierta atrás. */
function abrirEditorCostos(viejos, ctx, focoId) {
  cerrarEditorCostos();
  const inicio = ctx === 'inicio', prod = ctx === 'prod';
  /* Desde el Centro de avisos y desde Productos se guarda solo lo que se toca (guardarEditorCostos). */
  const soloTocados = inicio || prod;
  /* Lo que se muestra en cada campo: con eso se sabe al guardar si se tocó (_costoDeFila). */
  const escritos = viejos.map(v => _costoEscrito(v.producto, _costoGramos(v.producto)));
  _costosEditor = { filas: viejos, escritos: escritos, ctx: ctx === 'may' ? 'may' : (inicio ? 'inicio' : (prod ? 'prod' : 'min')) };
  const hayBolsas = viejos.some(v => _costoGramos(v.producto));
  const ov = document.createElement('div');
  /* dlg-overlay: así el Escape de admin-atajos.js no cierra la venta de atrás. */
  ov.className = 'dlg-overlay';
  ov.id = 'costosEditor';
  ov.style.zIndex = String(400 + (typeof _dlgAbiertos === 'number' ? _dlgAbiertos : 0));
  ov.innerHTML =
    '<div class="dlg-box costos-box" role="dialog" aria-modal="true" aria-labelledby="costosTit">' +
      '<div class="dlg-cab"><span class="dlg-ico"><i class="bi bi-pencil-square"></i></span>' +
        '<h3 id="costosTit">' + (inicio ? 'Revisar costos' : (prod ? 'Cambiar costos' : 'Modificar costos')) + '</h3></div>' +
      '<div class="dlg-msg">' +
        '<p class="dlg-linea">' + (inicio
          ? 'Poné el costo nuevo en los que aumentaron: esos salen de la lista. Los que no cambies siguen ahí. ' +
            'Si alguno sigue igual y no querés que avise por un mes, tildá "Sigue igual".'
          : prod
            ? 'Poné el costo nuevo en los que aumentaron; los que no toques quedan como están. ' +
              'Si alguno sigue igual y no querés que avise por un mes, tildá "Sigue igual".'
            : 'Poné el costo de hoy. Si alguno sigue igual, dejalo como está: al guardar queda ' +
              'confirmado con la fecha de hoy.') + ' El precio se recalcula con el mismo porcentaje de siempre.' +
          (hayBolsas ? ' En las bolsas va lo que costó la bolsa entera, como al cargar el producto.' : '') + '</p>' +
        viejos.map((v, i) => {
          const p = v.producto, g = _costoGramos(p), nom = _costoEsc(_costoNombre(p)), gb = _costoBolsaSuelto(p);
          const conBolsa = !!(gb && gb !== 1000);
          return '<div class="costos-fila' + (conBolsa ? ' con-bolsa' : '') + '">' +
            '<div class="costos-nom"><b>' + nom + '</b>' +
              '<div class="costos-sub">Costo actual ' + costoActualTxt(p) + (v.fecha
                ? ' · cambiado el ' + _costoFechaTxt(v.fecha) + ' (' + _costoHace(v.dias) + ')' : ' · sin fecha de cambio') + '</div></div>' +
            /* Arriba del campo, qué costo va: el de la bolsa, el del kilo o el de la unidad (pedido del dueño, 01/10). */
            '<label class="costos-campo"><span class="costos-campo-tit">' +
              (g ? 'Costo por bolsa:' : p.tipoVenta === 'peso' ? 'Costo por kilo:' : 'Costo por unidad:') + '</span>' +
            '<input type="text" inputmode="numeric" class="form-input costos-input" data-i="' + i + '" value="' +
              escritos[i] + '" aria-label="' + (g ? 'Nuevo costo de la bolsa de ' : 'Nuevo costo de ') + nom + '"></label>' +
            '<div class="costos-vista" data-i="' + i + '" aria-live="polite">' + _costoVistaHtml(p, _costoDeFila(v, escritos[i], escritos[i]), g) + '</div>' +
            (soloTocados ? '<label class="costos-igual" title="El proveedor no aumentó: deja de avisar por un mes">' +
              '<input type="checkbox" class="costos-sigue" data-i="' + i + '"> Sigue igual</label>' : '') +
            /* Un renglón más, con una flecha que sale del nombre y el campo justo abajo del costo
               por kilo (pedido del dueño, 01/10). */
            (conBolsa ? '<div class="costos-bolsa"><span class="costos-bolsa-lbl"><i class="bi bi-arrow-return-right"></i>' +
              'O el costo de la bolsa de ' + _costoTam(gb) + ':</span>' +
              '<input type="text" inputmode="numeric" class="form-input costos-bolsa-input" data-i="' + i + '" ' +
              'placeholder="de la factura" aria-label="Costo de la bolsa de ' + _costoTam(gb) + ' de ' + nom + '"></div>' : '') +
          '</div>';
        }).join('') +
      '</div>' +
      /* El "?" del redondeo va abajo, afuera de la lista: adentro (que scrollea) el cartel
         quedaba cortado, sobre todo con una sola bolsa (revisión del 27/09). */
      (hayBolsas && typeof ayudaRedondeoLineaHtml === 'function' ? ayudaRedondeoLineaHtml(true) : '') +
      '<div class="dlg-pie">' +
        '<button type="button" class="btn btn-secondary" id="costosVolver">' + (inicio ? 'Ahora no' : (prod ? 'Cancelar' : 'Volver a la venta')) + '</button>' +
        '<button type="button" class="btn btn-primary" id="costosGuardar"><i class="bi bi-check-lg"></i> Guardar costos</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(ov);
  if (typeof _dlgAbiertos === 'number') _dlgAbiertos++;
  ov.querySelector('#costosVolver').addEventListener('click', cerrarEditorCostos);
  ov.querySelector('#costosGuardar').addEventListener('click', guardarEditorCostos);
  ov.addEventListener('mousedown', e => { if (e.target === ov) cerrarEditorCostos(); });
  ov.querySelectorAll('.costos-input').forEach(inp => {
    inp.addEventListener('input', () => {
      if (typeof limpiarMonto === 'function') limpiarMonto(inp);
      /* Cómo queda, mientras se escribe: con la misma cuenta que al guardar. */
      const i = Number(inp.getAttribute('data-i')), fila = viejos[i];
      /* El kilo escrito a mano manda: "o la bolsa" se vacía. */
      const bi = ov.querySelector('.costos-bolsa-input[data-i="' + i + '"]');
      if (bi && document.activeElement === inp) {
        bi.value = '';
        if (_costosEditor && _costosEditor.kiloAntes) delete _costosEditor.kiloAntes[i];
      }
      const vista = ov.querySelector('.costos-vista[data-i="' + i + '"]');
      if (!fila || !vista) return;
      vista.innerHTML = _costoVistaHtml(fila.producto, _costoDeFila(fila, escritos[i], _costoLeer(inp.value)), _costoGramos(fila.producto));
    });
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); guardarEditorCostos(); } });
  });
  ov.querySelectorAll('.costos-bolsa-input').forEach(bi => {
    bi.addEventListener('input', () => costoBolsaEnEditor(bi));
    bi.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); guardarEditorCostos(); } });
  });
  document.addEventListener('keydown', _costosTecla, true);
  /* El foco en la que se tocó (desde el panel de bolsas) o en la primera. */
  const k = focoId ? viejos.findIndex(v => v.producto && v.producto.id === focoId) : -1;
  setTimeout(() => { const i = ov.querySelector('.costos-input[data-i="' + Math.max(0, k) + '"]'); if (i) { i.focus(); i.select(); } }, 30);
}

/* "o la bolsa de 5 kg": lo que dice la factura, y el costo por kilo sale solo en el campo de al
   lado, como en la calculadora de la ficha. El campo de al lado avisa que cambió: así se ve cómo
   queda el precio, y al guardar va el kilo, como siempre. */
function costoBolsaEnEditor(bi) {
  const ov = document.getElementById('costosEditor');
  if (!ov || !bi || !_costosEditor) return;
  if (typeof limpiarMonto === 'function') limpiarMonto(bi);
  const i = Number(bi.getAttribute('data-i'));
  const fila = _costosEditor.filas[i];
  const g = fila ? _costoBolsaSuelto(fila.producto) : null;
  const bolsa = _costoLeer(bi.value);
  const inp = ov.querySelector('.costos-input[data-i="' + i + '"]');
  if (!g || !inp) return;
  /* Si se borra lo de la bolsa, el kilo vuelve a como estaba antes de escribirla: borrando de a
     un número quedaba la cuenta del último ("3" de una bolsa de 5 kg dejaba $1 el kilo, y se
     podía guardar así; revisión del 01/10). */
  const antes = _costosEditor.kiloAntes || (_costosEditor.kiloAntes = {});
  if (!(bolsa > 0)) {
    if (!(i in antes)) return;
    inp.value = antes[i];
    delete antes[i];
  } else {
    if (!(i in antes)) antes[i] = inp.value;
    inp.value = String(typeof kiloDeBolsa === 'function' ? kiloDeBolsa(bolsa, g) : Math.round(bolsa * 1000 / g));
  }
  inp.dispatchEvent(new Event('input', { bubbles: true }));
}

function _costosTecla(e) {
  if (e.key === 'Escape' && document.getElementById('costosEditor')) {
    e.preventDefault(); e.stopPropagation(); cerrarEditorCostos();
  }
}

function cerrarEditorCostos() {
  const ov = document.getElementById('costosEditor');
  if (ov) {
    ov.remove();
    if (typeof _dlgAbiertos === 'number') _dlgAbiertos = Math.max(0, _dlgAbiertos - 1);
  }
  document.removeEventListener('keydown', _costosTecla, true);
  _costosEditor = null;
}

async function guardarEditorCostos() {
  const ed = _costosEditor;
  const ov = document.getElementById('costosEditor');
  /* Una sola vez: un segundo Enter mientras se guardaba escribía todo dos veces
     (revisión del 27/09). */
  if (!ed || !ov || ed.guardando) return;
  const inicio = ed.ctx === 'inicio', prod = ed.ctx === 'prod';
  /* Desde el Centro de avisos (26/09) y desde el panel de bolsas de Productos (27/09) se
     guarda SOLO lo que se tocó (pedido del dueño): el costo que cambió, o el que se marcó
     "Sigue igual". Lo demás queda como está. Al vender se confirma todo, como siempre: si
     no, el aviso volvería en la próxima venta. */
  const soloTocados = inicio || prod;
  const sigueIgual = new Set();
  if (soloTocados) ov.querySelectorAll('.costos-sigue').forEach(c => { if (c.checked) sigueIgual.add(Number(c.getAttribute('data-i'))); });
  const cambios = [];
  for (const inp of ov.querySelectorAll('.costos-input')) {
    const i = Number(inp.getAttribute('data-i'));
    const fila = ed.filas[i];
    if (!fila) continue;
    /* Tocado es lo escrito distinto de lo que se mostró; en una bolsa, lo escrito es lo que
       costó la bolsa y se guarda por kilo (_costoDeFila). */
    const escrito = _costoLeer(inp.value);
    const mostrado = ed.escritos ? ed.escritos[i] : escrito;
    const tocado = escrito !== mostrado;
    const nuevo = _costoDeFila(fila, mostrado, escrito);
    const cambio = nuevo !== Math.round(Number(fila.producto.costo || 0));
    /* Se saltea ANTES de validar: un producto con costo 0 que no se tocó frenaba el guardado
       de todos los demás. Lo que se tocó y da el mismo kilo (una bolsa de 5 kg a $10.002 o
       a $10.000 son $2.000 el kilo) no se saltea: se confirma con la fecha, y se dice. */
    if (soloTocados && !tocado && !sigueIgual.has(i)) continue;
    if (!(nuevo > 0)) {
      showAdminToast('Poné un costo válido para "' + _costoEsc(_costoNombre(fila.producto)) + '"', 'error');
      inp.focus();
      return;
    }
    cambios.push({ p: fila.producto, nuevo: nuevo, cambio: cambio, redondeo: tocado && !cambio && !sigueIgual.has(i) });
  }
  if (!cambios.length) {
    cerrarEditorCostos();
    showAdminToast(prod ? 'No cambiaste ningún costo.' : 'No cambiaste ningún costo: siguen todos en la lista.', 'info');
    return;
  }
  ed.guardando = true;
  const btn = ov.querySelector('#costosGuardar');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="bi bi-arrow-repeat spin"></i> Guardando...'; }

  /* costoActualizadoEn va en la MISMA escritura: registrarCambioDeCosto ve que ya
     viene y no la vuelve a escribir. Y en los que no cambiaron es lo único que se
     escribe: es la confirmación de que el costo sigue vigente. */
  const hora = firebase.firestore.FieldValue.serverTimestamp();
  const lote = db.batch();
  const locales = [];
  cambios.forEach(c => {
    const campos = { costoActualizadoEn: hora };
    if (c.cambio) Object.assign(campos, { costo: c.nuevo }, preciosDesdeCosto(c.p, c.nuevo));
    lote.update(db.collection('productos').doc(c.p.id), campos);
    locales.push({ p: c.p, campos: Object.assign({}, campos, { costoActualizadoEn: new Date() }) });
  });
  try {
    await lote.commit();
  } catch (e) {
    ed.guardando = false;
    showAdminToast('No se pudieron guardar los costos: ' + e.message, 'error');
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="bi bi-check-lg"></i> Guardar costos'; }
    return;
  }
  /* El MISMO objeto de allProducts: la venta y la tabla lo tienen en la mano. */
  locales.forEach(l => Object.assign(l.p, l.campos));
  const cambiados = cambios.filter(c => c.cambio).map(c => c.p);
  /* Desde el Centro de avisos y desde Productos no hay una venta abierta que actualizar. */
  if (!soloTocados) _refrescarItemsDeVenta(ed.ctx, cambiados);
  if (typeof logAction === 'function') {
    logAction('editar', (inicio ? 'Costos revisados desde el Centro de avisos: ' : (prod ? 'Costos cambiados desde Productos: ' : 'Costos al vender: ')) +
      cambiados.length + ' cambiado' + (cambiados.length === 1 ? '' : 's') +
      ', ' + (cambios.length - cambiados.length) + ' confirmado' + (cambios.length - cambiados.length === 1 ? '' : 's'),
      cambios.map(c => _costoNombre(c.p) + (c.cambio ? ' -> ' + _costoPesos(c.nuevo) + _costoUnidad(c.p) : ' (sigue igual)')).join(' | ').slice(0, 900));
  }
  if (typeof filterTable === 'function') filterTable();
  /* Si mientras se guardaba se cerró esta ventana y se abrió otra (desde el panel de bolsas,
     es un clic), la otra queda abierta: antes se cerraba y se perdía lo escrito ahí
     (revisión del 27/09). */
  if (_costosEditor === ed) cerrarEditorCostos();
  const confirmados = cambios.length - cambiados.length;
  const redondeos = cambios.filter(c => c.redondeo).length;
  const marcados = confirmados - redondeos;
  const quedan = ed.filas.length - cambios.length;
  showAdminToast(soloTocados
    ? 'Listo: ' + [
        cambiados.length ? cambiados.length + (cambiados.length === 1 ? ' costo cambiado, con su precio nuevo' : ' costos cambiados, con su precio nuevo') : '',
        marcados ? marcados + (marcados === 1 ? ' marcado' : ' marcados') + ' como "sigue igual"' : '',
        redondeos ? redondeos + (redondeos === 1 ? ' quedó igual' : ' quedaron iguales') + ' por el redondeo del kilo' : '',
      ].filter(Boolean).join(' y ') + '.' +
      (inicio && quedan ? ' ' + (quedan === 1 ? 'El que no cambiaste sigue' : 'Los ' + quedan + ' que no cambiaste siguen') + ' en la lista.' : '')
    : (cambiados.length
      ? 'Costos guardados. Los precios de la venta se actualizaron: revisá el total y registrala.'
      : 'Costos confirmados. Ya podés registrar la venta.'), 'success');
  /* La campana y el Centro de avisos: lo revisado deja de avisar. */
  if (typeof _refrescarAlertas === 'function') _refrescarAlertas(false);
}

/* Los renglones de la venta abierta toman el costo nuevo, y el precio nuevo salvo en
   una venta que viene de un pedido web: ese precio ya lo aceptó el cliente. */
function _refrescarItemsDeVenta(ctx, productos) {
  if (!productos || !productos.length) return;
  const may = ctx === 'may';
  const lista = may ? (typeof ventaMayItems !== 'undefined' ? ventaMayItems : [])
                    : (typeof ventaItems !== 'undefined' ? ventaItems : []);
  const desdePedido = !may && typeof window !== 'undefined' && !!window._pedidoOrigenVentaId;
  /* Un granel con escalas se cobra al precio de la escala (escalaId), que puede ser otra
     bolsa que la del renglón; una caja cerrada, al mayorista. Antes todo pasaba al precio
     de lista de su propio producto y se cobraba mal (chequeo del 25/09). */
  const escala = it => (typeof escalaDeLinea === 'function' ? escalaDeLinea(it) : null);
  const cambiados = new Set(productos.map(p => p.id));
  productos.forEach(p => {
    lista.filter(it => it && it.id === p.id).forEach(it => {
      it.costo = Number(p.costo || 0);
      if (!desdePedido && !escala(it)) {
        it.precio = may ? (p.precioMayorista || p.precio || 0)
          : (typeof precioMostradorDe === 'function' ? precioMostradorDe(p) : p.precio);
      }
    });
  });
  if (!desdePedido) {
    lista.forEach(it => {
      const e = it && escala(it);
      if (e && cambiados.has(e.id)) it.precio = Number(may ? (e.producto.precioMayorista || e.producto.precio || 0) : (e.producto.precio || 0));
    });
  }
  if (may) { if (typeof renderVentaMayItems === 'function') renderVentaMayItems(); }
  else if (typeof renderVentaItems === 'function') renderVentaItems();
}
