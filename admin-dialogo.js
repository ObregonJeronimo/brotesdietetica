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
