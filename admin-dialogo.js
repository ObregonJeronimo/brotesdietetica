/* =============================================================================
   DIÁLOGOS  —  Brotes Dietética
   =============================================================================
   Reemplazo de window.confirm(). El nativo es el cuadrito gris del navegador que
   dice "brotesdietetica.vercel.app dice", con botones Aceptar/Cancelar que no se
   pueden renombrar y que en Chrome vienen al revés de como los lee cualquiera:
   el de confirmar a la izquierda. En un panel que se le entrega a un cliente
   desentona con todo lo demás.

   LA DIFERENCIA QUE IMPORTA: confirm() es SÍNCRONO y esto no puede serlo. Un
   diálogo hecho con HTML necesita que el navegador siga corriendo para pintarlo,
   así que devuelve una promesa y hay que esperarla:

       if (!await pedirConfirmacion('¿Eliminar?')) return;

   O sea que toda función que lo use tiene que ser async. Es la única razón por la
   que este cambio toca tantos archivos.

   Se puede cerrar con Escape (cancela), con Enter (acepta) o clickeando afuera.
   En los destructivos el foco arranca en Cancelar a propósito: si alguien viene
   apretando Enter de otra pantalla, no borra nada sin querer.
   ============================================================================= */

let _dlgAbiertos = 0;

/**
 * @param {string} mensaje  Texto principal. Los saltos de línea se respetan.
 * @param {Object} [opts]   { titulo, aceptar, cancelar, peligro, icono, alerta, cuidado }
 *                          alerta: el ícono en rojo, sin volver rojo el botón (un aviso
 *                          que frena, como "Stock insuficiente", no borra nada).
 *                          cuidado: el ícono en amarillo (un aviso que deja seguir, como
 *                          vender sin stock suficiente: 29/09).
 * @returns {Promise<boolean>}
 */
function pedirConfirmacion(mensaje, opts) {
  opts = opts || {};
  const peligro = !!opts.peligro;
  const titulo = opts.titulo || 'Confirmar';
  const txtOk = opts.aceptar || (peligro ? 'Eliminar' : 'Aceptar');
  const txtNo = opts.cancelar || 'Cancelar';
  /* cancelar: null = un aviso de una sola opción (avisar): sin el botón. Antes salía
     "Cancelar" igual, y en un aviso no hay nada que cancelar (chequeo del 25/09). */
  const sinNo = opts.cancelar === null;
  const icono = opts.icono || (peligro ? 'bi-exclamation-octagon' : 'bi-question-circle');

  return new Promise(resolve => {
    const ov = document.createElement('div');
    ov.className = 'dlg-overlay';
    /* Por encima de los modales (200) y del menú de acciones (300): este diálogo
       casi siempre se abre DESDE otro modal. */
    ov.style.zIndex = String(400 + _dlgAbiertos);
    _dlgAbiertos++;

    ov.innerHTML =
      '<div class="dlg-box' + (peligro ? ' peligro' : '') + (opts.alerta ? ' alerta' : '') + (opts.cuidado ? ' cuidado' : '') + '" role="alertdialog" aria-modal="true" aria-labelledby="dlgTit">' +
        '<div class="dlg-cab">' +
          '<span class="dlg-ico"><i class="bi ' + icono + '"></i></span>' +
          '<h3 id="dlgTit">' + _dlgEsc(titulo) + '</h3>' +
        '</div>' +
        '<div class="dlg-msg">' + _dlgTexto(mensaje) + '</div>' +
        '<div class="dlg-pie">' +
          (sinNo ? '' : '<button type="button" class="btn btn-secondary dlg-no">' + _dlgEsc(txtNo) + '</button>') +
          '<button type="button" class="btn ' + (peligro ? 'dlg-peligro' : 'btn-primary') + ' dlg-si">' + _dlgEsc(txtOk) + '</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(ov);

    const anteriorFoco = document.activeElement;
    let cerrado = false;
    const cerrar = (valor) => {
      if (cerrado) return;
      cerrado = true;
      _dlgAbiertos = Math.max(0, _dlgAbiertos - 1);
      document.removeEventListener('keydown', onTecla, true);
      ov.remove();
      /* Se devuelve el foco a donde estaba: si el diálogo salió desde un modal,
         el teclado tiene que volver ahí y no al principio de la página. */
      try { if (anteriorFoco && anteriorFoco.focus) anteriorFoco.focus(); } catch (e) {}
      resolve(valor);
    };

    /* Los dos botones, en el orden en que se ven. */
    const botones = () => [].slice.call(ov.querySelectorAll('.dlg-no, .dlg-si'));

    function mover(paso) {
      const bs = botones();
      if (!bs.length) return;
      const i = bs.indexOf(document.activeElement);
      const sig = bs[((i < 0 ? 0 : i + paso) + bs.length) % bs.length];
      if (sig && sig.focus) sig.focus();
    }

    function onTecla(e) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cerrar(false); }
      else if (e.key === 'Enter') {
        /* EL ENTER DE LA PISTOLA NO CONTESTA PREGUNTAS.

           Un lector USB es un teclado y su Enter llega hasta acá igual que el de
           una persona: admin-lector.js corre en fase de captura sobre document y
           hace stopPropagation(), pero eso no frena a los otros handlers del
           MISMO document, y éste es uno. O sea que un lector apoyado sobre el
           gatillo contestaba que sí a lo que hubiera en pantalla —imprimir un
           ticket, y también eliminar—. Lo único que sabe de quién fue ese Enter
           es el lector, que ya lo clasificó y dejó la marca sobre el evento. */
        if (typeof enterDeRafaga === 'function' && enterDeRafaga(e)) { e.preventDefault(); return; }
        /* Si el foco está en un botón, que decida el botón. */
        if (document.activeElement && document.activeElement.classList &&
            (document.activeElement.classList.contains('dlg-si') || document.activeElement.classList.contains('dlg-no'))) return;
        e.preventDefault(); cerrar(true);
      }
      /* Son dos botones y una sola fila: las flechas son la forma natural de
         elegir sin soltar el teclado, que es como se atiende el mostrador. */
      else if (e.key === 'ArrowLeft') { e.preventDefault(); mover(-1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); mover(1); }
      /* El foco no se va del diálogo mientras está abierto: con Tab se llegaba a
         los campos de la venta que quedó atrás y se los podía editar con una
         pregunta sin responder encima. */
      else if (e.key === 'Tab') { e.preventDefault(); mover(e.shiftKey ? -1 : 1); }
    }

    ov.querySelector('.dlg-si').addEventListener('click', () => cerrar(true));
    const no = ov.querySelector('.dlg-no');
    if (no) no.addEventListener('click', () => cerrar(false));
    ov.addEventListener('mousedown', e => { if (e.target === ov) cerrar(false); });
    document.addEventListener('keydown', onTecla, true);

    setTimeout(() => {
      const b = ov.querySelector(peligro ? '.dlg-no' : '.dlg-si');
      if (b) b.focus();
    }, 30);
  });
}

/** Aviso de una sola opción. Reemplaza a alert(). */
function avisar(mensaje, opts) {
  opts = Object.assign({}, opts || {}, { cancelar: null });
  return pedirConfirmacion(mensaje, Object.assign({ titulo: 'Aviso', aceptar: 'Entendido' }, opts))
    .then(() => true);
}

/**
 * Como pedirConfirmacion, pero con varias salidas con nombre propio -por ejemplo
 * "Modificar costos" e "Ignorar advertencia y vender de todas formas"-. Devuelve el
 * `valor` de la opción elegida, o null si se cerró con Escape o clickeando afuera:
 * cerrar sin elegir no puede contar como ninguna de las opciones.
 * Enter no elige solo: aprieta el botón que tiene el foco, que arranca en el principal.
 * @param {string} mensaje
 * @param {Object} opts { titulo, icono, opciones: [{ valor, texto, principal }] }
 * @returns {Promise<string|null>}
 */
function pedirOpcion(mensaje, opts) {
  opts = opts || {};
  const titulo = opts.titulo || 'Elegí una opción';
  const icono = opts.icono || 'bi-question-circle';
  const opciones = (opts.opciones || []).filter(o => o && o.valor);
  return new Promise(resolve => {
    const ov = document.createElement('div');
    ov.className = 'dlg-overlay';
    ov.style.zIndex = String(400 + _dlgAbiertos);
    _dlgAbiertos++;
    ov.innerHTML =
      '<div class="dlg-box" role="alertdialog" aria-modal="true" aria-labelledby="dlgTitOp">' +
        '<div class="dlg-cab">' +
          '<span class="dlg-ico"><i class="bi ' + _dlgEsc(icono) + '"></i></span>' +
          '<h3 id="dlgTitOp">' + _dlgEsc(titulo) + '</h3>' +
        '</div>' +
        '<div class="dlg-msg">' + _dlgTexto(mensaje) + '</div>' +
        '<div class="dlg-pie dlg-pie-opciones">' +
          opciones.map((o, i) => '<button type="button" class="btn ' + (o.principal ? 'btn-primary' : 'btn-secondary') +
            ' dlg-op" data-i="' + i + '">' + _dlgEsc(o.texto) + '</button>').join('') +
        '</div>' +
      '</div>';
    document.body.appendChild(ov);

    const anteriorFoco = document.activeElement;
    let cerrado = false;
    const cerrar = (valor) => {
      if (cerrado) return;
      cerrado = true;
      _dlgAbiertos = Math.max(0, _dlgAbiertos - 1);
      document.removeEventListener('keydown', onTecla, true);
      ov.remove();
      try { if (anteriorFoco && anteriorFoco.focus) anteriorFoco.focus(); } catch (e) {}
      resolve(valor);
    };
    function onTecla(e) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cerrar(null); }
    }
    ov.querySelectorAll('.dlg-op').forEach(b => b.addEventListener('click', () => {
      const o = opciones[Number(b.getAttribute('data-i'))];
      cerrar(o ? o.valor : null);
    }));
    ov.addEventListener('mousedown', e => { if (e.target === ov) cerrar(null); });
    document.addEventListener('keydown', onTecla, true);
    setTimeout(() => {
      const b = ov.querySelector('.dlg-op.btn-primary') || ov.querySelector('.dlg-op');
      if (b) b.focus();
    }, 30);
  });
}

function _dlgEsc(s) {
  const d = document.createElement('div');
  d.textContent = String(s == null ? '' : s);
  return d.innerHTML;
}

/* Los mensajes vienen con saltos de línea (muchos arman una lista de productos).
   Se respetan como párrafos, y las líneas que empiezan con "-" o "·" quedan
   indentadas para que se lean como la lista que son. Las que empiezan con [!], [x] o
   [+] van en un recuadro de color -atención, pérdida, a favor-: lo que importa de un
   aviso con cuentas, para que no se pierda entre ellas (ver admin-escalas.js). */
const _DLG_RESALTA = {
  '!': { clase: 'atencion', icono: 'bi-exclamation-triangle-fill' },
  x: { clase: 'perdida', icono: 'bi-x-octagon-fill' },
  '+': { clase: 'bien', icono: 'bi-check-circle-fill' },
};
function _dlgTexto(msg) {
  return String(msg == null ? '' : msg).split('\n').map(l => {
    const t = l.trim();
    if (!t) return '<div class="dlg-vacio"></div>';
    const r = /^\[([!x+])\]\s*/.exec(t);
    if (r) {
      const e = _DLG_RESALTA[r[1]];
      return '<p class="dlg-linea dlg-resalta ' + e.clase + '"><i class="bi ' + e.icono + '"></i><span>' +
        _dlgEsc(t.slice(r[0].length)) + '</span></p>';
    }
    const esItem = /^[-•·]/.test(t);
    return '<p class="dlg-linea' + (esItem ? ' item' : '') + '">' + _dlgEsc(esItem ? t.replace(/^[-•·]\s*/, '') : t) + '</p>';
  }).join('');
}

/* =============================================================================
   CANTIDAD PARA PRODUCTOS POR PESO
   =============================================================================
   Un producto que se vende suelto no se agrega "de a uno": el cliente pide 200
   gramos. Este diálogo pregunta cuánto, con los pesos de siempre a un click y el
   precio calculándose en vivo, para que el que atiende vea lo que va a cobrar
   antes de confirmar.

   Devuelve los GRAMOS, o null si se canceló.

   Un producto con escalas (admin-escalas.js) no tiene UN precio por kilo: depende
   de cuánto se lleva. Para eso están opts.detalle (la línea de precios, en lugar de
   "$X el kilo"), opts.stock (el de todas sus bolsas) y opts.cotizar(gramos), que
   devuelve { total, nota } para el total en vivo.

   SIN STOCK SUFICIENTE NO SE AGREGA (pedido del comercio, 26/09/2026): con
   opts.bloquear, si los gramos pasan opts.stock (lo que queda para esta venta) el botón
   no anda y abajo sale opts.avisoSinStock en rojo, con opts.ayudaSinStock (qué hacer).
   Sin bloquear -el negocio no descuenta stock- se avisa y se deja, como antes.
   SIN FRENO (pedido del dueño, 29/09/2026): con opts.avisarNegativo se deja agregar y se
   avisa que el stock va a quedar en negativo, también cuando no hay nada de stock.
   ============================================================================= */
function pedirCantidadPeso(producto, opts) {
  opts = opts || {};
  const nombre = opts.nombre || (producto && (producto.nombreMostrado || producto.nombre)) || 'el producto';
  const precioKg = Number(opts.precioKg != null ? opts.precioKg : (producto && producto.precio) || 0);
  /* let: con opts.refrescar se relee antes de frenar, y puede cambiar. */
  let stock = Number(opts.stock != null ? opts.stock : (producto && producto.stock) || 0);
  const RAPIDOS = [100, 250, 500, 1000];
  const bloquear = !!opts.bloquear;
  const sinStock = g => bloquear && (stock <= 0 || (Number.isFinite(g) && g > stock));
  const hayTxt = () => (stock > 0 ? ' &middot; hay ' + _dlgPeso(stock) : ((bloquear || opts.avisarNegativo) ? ' &middot; sin stock' : ''));

  return new Promise(resolve => {
    const ov = document.createElement('div');
    ov.className = 'dlg-overlay';
    ov.style.zIndex = String(400 + _dlgAbiertos);
    _dlgAbiertos++;

    ov.innerHTML =
      '<div class="dlg-box" role="dialog" aria-modal="true">' +
        '<div class="dlg-cab"><span class="dlg-ico"><i class="bi bi-database"></i></span>' +
        '<h3>¿Cuánto lleva?</h3></div>' +
        '<div class="dlg-msg">' +
          '<p class="dlg-linea"><b>' + _dlgEsc(nombre) + '</b></p>' +
          '<p class="dlg-linea" style="color:var(--text-dim);font-size:0.83rem">' +
            (opts.detalle ? _dlgEsc(opts.detalle) : '$' + precioKg.toLocaleString('es-AR') + ' el kilo') +
            '<span class="pz-hay">' + hayTxt() + '</span></p>' +
          '<div class="pz-rapidos">' +
            RAPIDOS.map(g => '<button type="button" class="pz-rap" data-g="' + g + '">' + _dlgPeso(g) + '</button>').join('') +
          '</div>' +
          '<div class="pz-fila">' +
            '<input type="number" class="form-input pz-input" min="1" step="1" placeholder="gramos" inputmode="numeric">' +
            '<span class="pz-unidad">gramos</span>' +
          '</div>' +
          '<div class="pz-total" aria-live="polite"></div>' +
          '<div class="pz-nota"></div>' +
          '<div class="pz-aviso"></div>' +
        '</div>' +
        '<div class="dlg-pie">' +
          '<button type="button" class="btn btn-secondary dlg-no">Cancelar</button>' +
          '<button type="button" class="btn btn-primary dlg-si" disabled>Agregar</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(ov);

    const inp = ov.querySelector('.pz-input');
    const btnOk = ov.querySelector('.dlg-si');
    const tot = ov.querySelector('.pz-total');
    const nota = ov.querySelector('.pz-nota');
    const avi = ov.querySelector('.pz-aviso');
    let cerrado = false;
    /* opts.refrescar: la primera vez que frenaría, se relee el stock (el de la pantalla
       puede ser viejo) y mientras tanto dice "Revisando el stock...". Una sola vez. */
    let refresco = null, refrescado = typeof opts.refrescar !== 'function';

    const cerrar = (v) => {
      if (cerrado) return;
      cerrado = true;
      _dlgAbiertos = Math.max(0, _dlgAbiertos - 1);
      document.removeEventListener('keydown', onTecla, true);
      ov.remove();
      resolve(v);
    };

    function pintar() {
      const g = parseInt(inp.value, 10);
      const ok = Number.isFinite(g) && g > 0;
      const frena = sinStock(g);
      btnOk.disabled = !ok || frena;
      if (frena && !refrescado) {
        if (!refresco) {
          refresco = Promise.resolve().then(() => opts.refrescar()).then(n => {
            if (n && Number.isFinite(Number(n.stock))) {
              stock = Number(n.stock);
              if (n.avisoSinStock) opts.avisoSinStock = n.avisoSinStock;
            }
          }).catch(() => { /* queda el que había */ }).then(() => {
            refrescado = true;
            if (cerrado) return;
            const h = ov.querySelector('.pz-hay');
            if (h) h.innerHTML = hayTxt();
            pintar();
          });
        }
      }
      const q = (ok && typeof opts.cotizar === 'function') ? (opts.cotizar(g) || {}) : null;
      const total = q && q.total != null ? q.total : Math.round(precioKg * g / 1000);
      tot.innerHTML = ok
        ? '<span>' + _dlgPeso(g) + '</span><b>$' + Number(total).toLocaleString('es-AR') + '</b>'
        : '';
      nota.textContent = (q && q.nota) || '';
      if (frena && !refrescado) {
        /* El total y la nota se pintan igual; el aviso rojo, cuando termine de revisar. */
        avi.className = 'pz-aviso pz-revisando';
        avi.textContent = 'Revisando el stock...';
        return;
      }
      if (frena) {
        /* "STOCK INSUFICIENTE:" en negrita, y el resto como lo pidió el comercio. */
        const txt = opts.avisoSinStock || _dlgSinStock(stock);
        const dp = txt.indexOf(':');
        avi.className = 'pz-aviso pz-bloqueo';
        avi.innerHTML = '<i class="bi bi-x-octagon-fill"></i><div><p>' +
          (dp > 0 ? '<b>' + _dlgEsc(txt.slice(0, dp + 1)) + '</b>' + _dlgEsc(txt.slice(dp + 1)) : _dlgEsc(txt)) + '</p>' +
          (opts.ayudaSinStock ? '<p class="pz-ayuda">' + _dlgEsc(opts.ayudaSinStock) + '</p>' : '') + '</div>';
        return;
      }
      avi.className = 'pz-aviso';
      /* Sin bloquear se avisa y se deja. Si el stock se descuenta y no frena (29/09:
         opts.avisarNegativo), se dice que queda en negativo; si el negocio no descuenta
         stock, solo lo que figura, como antes. */
      avi.textContent = (opts.avisarNegativo && ok && g > stock)
        ? (stock > 0 ? 'Ojo: quedan ' + _dlgPeso(stock) + ' en stock. ' : 'Ojo: no queda stock de este producto. ') +
          'Se puede vender igual, y el stock va a quedar en negativo.'
        : (!bloquear && ok && stock > 0 && g > stock)
          ? 'Ojo: en el sistema figuran ' + _dlgPeso(stock) + '. Se puede vender igual.' : '';
    }

    function onTecla(e) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cerrar(null); }
      else if (e.key === 'Enter') {
        e.preventDefault();
        const g = parseInt(inp.value, 10);
        if (Number.isFinite(g) && g > 0 && !sinStock(g)) cerrar(g);
      }
    }

    ov.querySelectorAll('.pz-rap').forEach(b => b.addEventListener('click', () => {
      inp.value = b.getAttribute('data-g');
      pintar();
      inp.focus();
    }));
    inp.addEventListener('input', pintar);
    btnOk.addEventListener('click', () => {
      const g = parseInt(inp.value, 10);
      if (Number.isFinite(g) && g > 0 && !sinStock(g)) cerrar(g);
    });
    ov.querySelector('.dlg-no').addEventListener('click', () => cerrar(null));
    ov.addEventListener('mousedown', e => { if (e.target === ov) cerrar(null); });
    document.addEventListener('keydown', onTecla, true);
    /* Sin nada de stock el aviso sale de entrada, antes de escribir. */
    pintar();

    setTimeout(() => inp.focus(), 30);
  });
}

/* El aviso si quien llama no manda el suyo (ver textoStockInsuficiente en
   admin-variantes.js, que dice además lo que ya está en la venta). */
function _dlgSinStock(stock) {
  return stock > 0
    ? 'STOCK INSUFICIENTE: actualmente tenés en total ' + _dlgPeso(stock) + ' de STOCK RESTANTE, la venta NO se puede realizar debido a que no tenés stock suficiente.'
    : 'STOCK INSUFICIENTE: no te queda STOCK RESTANTE de este producto, la venta NO se puede realizar debido a que no tenés stock suficiente.';
}

/* Igual que fmtPeso de admin.html, repetido acá porque este archivo se carga
   antes y no puede depender de que el otro ya esté evaluado. */
function _dlgPeso(gr) {
  const g = Number(gr || 0);
  if (Math.abs(g) < 1000) return g.toLocaleString('es-AR') + ' g';
  return (g / 1000).toLocaleString('es-AR', { maximumFractionDigits: 3 }) + ' kg';
}
