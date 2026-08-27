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
 * @param {Object} [opts]   { titulo, aceptar, cancelar, peligro, icono }
 * @returns {Promise<boolean>}
 */
function pedirConfirmacion(mensaje, opts) {
  opts = opts || {};
  const peligro = !!opts.peligro;
  const titulo = opts.titulo || 'Confirmar';
  const txtOk = opts.aceptar || (peligro ? 'Eliminar' : 'Aceptar');
  const txtNo = opts.cancelar || 'Cancelar';
  const icono = opts.icono || (peligro ? 'bi-exclamation-octagon' : 'bi-question-circle');

  return new Promise(resolve => {
    const ov = document.createElement('div');
    ov.className = 'dlg-overlay';
    /* Por encima de los modales (200) y del menú de acciones (300): este diálogo
       casi siempre se abre DESDE otro modal. */
    ov.style.zIndex = String(400 + _dlgAbiertos);
    _dlgAbiertos++;

    ov.innerHTML =
      '<div class="dlg-box' + (peligro ? ' peligro' : '') + '" role="alertdialog" aria-modal="true" aria-labelledby="dlgTit">' +
        '<div class="dlg-cab">' +
          '<span class="dlg-ico"><i class="bi ' + icono + '"></i></span>' +
          '<h3 id="dlgTit">' + _dlgEsc(titulo) + '</h3>' +
        '</div>' +
        '<div class="dlg-msg">' + _dlgTexto(mensaje) + '</div>' +
        '<div class="dlg-pie">' +
          '<button type="button" class="btn btn-secondary dlg-no">' + _dlgEsc(txtNo) + '</button>' +
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

    function onTecla(e) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cerrar(false); }
      else if (e.key === 'Enter') {
        /* Si el foco está en un botón, que decida el botón. */
        if (document.activeElement && document.activeElement.classList &&
            (document.activeElement.classList.contains('dlg-si') || document.activeElement.classList.contains('dlg-no'))) return;
        e.preventDefault(); cerrar(true);
      }
    }

    ov.querySelector('.dlg-si').addEventListener('click', () => cerrar(true));
    ov.querySelector('.dlg-no').addEventListener('click', () => cerrar(false));
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

function _dlgEsc(s) {
  const d = document.createElement('div');
  d.textContent = String(s == null ? '' : s);
  return d.innerHTML;
}

/* Los mensajes vienen con saltos de línea (muchos arman una lista de productos).
   Se respetan como párrafos, y las líneas que empiezan con "-" o "·" quedan
   indentadas para que se lean como la lista que son. */
function _dlgTexto(msg) {
  return String(msg == null ? '' : msg).split('\n').map(l => {
    const t = l.trim();
    if (!t) return '<div class="dlg-vacio"></div>';
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
   ============================================================================= */
function pedirCantidadPeso(producto, opts) {
  opts = opts || {};
  const nombre = (producto && (producto.nombreMostrado || producto.nombre)) || 'el producto';
  const precioKg = Number(opts.precioKg != null ? opts.precioKg : (producto && producto.precio) || 0);
  const stock = Number((producto && producto.stock) || 0);
  const RAPIDOS = [100, 250, 500, 1000];

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
            '$' + precioKg.toLocaleString('es-AR') + ' el kilo' +
            (stock > 0 ? ' &middot; hay ' + _dlgPeso(stock) : '') + '</p>' +
          '<div class="pz-rapidos">' +
            RAPIDOS.map(g => '<button type="button" class="pz-rap" data-g="' + g + '">' + _dlgPeso(g) + '</button>').join('') +
          '</div>' +
          '<div class="pz-fila">' +
            '<input type="number" class="form-input pz-input" min="1" step="1" placeholder="gramos" inputmode="numeric">' +
            '<span class="pz-unidad">gramos</span>' +
          '</div>' +
          '<div class="pz-total" aria-live="polite"></div>' +
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
    const avi = ov.querySelector('.pz-aviso');
    let cerrado = false;

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
      btnOk.disabled = !ok;
      tot.innerHTML = ok
        ? '<span>' + _dlgPeso(g) + '</span><b>$' + Math.round(precioKg * g / 1000).toLocaleString('es-AR') + '</b>'
        : '';
      /* Se avisa si no alcanza el stock, pero NO se bloquea: en el mostrador el
         stock puede estar desactualizado y la venta ya ocurrió. */
      avi.textContent = (ok && stock > 0 && g > stock)
        ? 'Ojo: en el sistema figuran ' + _dlgPeso(stock) + '. Se puede vender igual.' : '';
    }

    function onTecla(e) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cerrar(null); }
      else if (e.key === 'Enter') {
        e.preventDefault();
        const g = parseInt(inp.value, 10);
        if (Number.isFinite(g) && g > 0) cerrar(g);
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
      if (Number.isFinite(g) && g > 0) cerrar(g);
    });
    ov.querySelector('.dlg-no').addEventListener('click', () => cerrar(null));
    ov.addEventListener('mousedown', e => { if (e.target === ov) cerrar(null); });
    document.addEventListener('keydown', onTecla, true);

    setTimeout(() => inp.focus(), 30);
  });
}

/* Igual que fmtPeso de admin.html, repetido acá porque este archivo se carga
   antes y no puede depender de que el otro ya esté evaluado. */
function _dlgPeso(gr) {
  const g = Number(gr || 0);
  if (Math.abs(g) < 1000) return g.toLocaleString('es-AR') + ' g';
  return (g / 1000).toLocaleString('es-AR', { maximumFractionDigits: 3 }) + ' kg';
}
