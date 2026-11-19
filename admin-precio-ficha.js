/* ==========================================================================
   EL PRECIO EN LA FICHA DEL PRODUCTO SE PUEDE ESCRIBIR  —  Brotes Dietética
   ==========================================================================
   Pedido de la clienta (19/11/2026): la casilla "Precio" estaba bloqueada; salía
   siempre del costo y el % de ganancia, y quería poder escribirlo.

   Cómo queda:
   - Si escribe el precio, el % se recalcula solo (con los decimales que hagan falta
     para que dé justo ese precio). Todo sigue conectado: cuando cambie el costo, el
     precio sube con ese mismo margen, como siempre.
   - Si cambia el costo o el %, el precio sale de costo + %, como antes.
   - Si no toca ni el costo ni el % ni el precio, el precio queda como estaba.

   Arregla dos cosas que pasaban al guardar la ficha (leído en producción el 19/11):
   - 90 productos tienen precio pero no costo: guardar su ficha les dejaba el precio
     en $0 (la leche de coco del 18/11). Ahora se guarda el precio que tiene.
   - 235 tienen el precio redondeado ("Redondear"): guardar su ficha lo volvía a
     costo + % (Granola Keto, de $25.300 a $25.202). Ahora queda el que tiene.
   Y al guardar, en los dos casos, aparece un cartelito que lo explica (pedido de
   Thiago, 19/11): en el redondeado se elige qué precio queda; en el sin costo se
   avisa que se guarda tal cual. Un precio por debajo del costo lo avisa
   avisoGuardarSinGanancia (admin-costos.js), con el precio que de verdad se guarda.

   El precio mayorista no cambia: sigue saliendo del costo y su %.
   ========================================================================== */

/* El precio que no sale de costo + %: el que tenía guardado (redondeado, o sin costo) o el
   que se escribió. Lleva el costo y el % con los que vale: si cualquiera de los dos cambia, se
   suelta y el precio vuelve a salir de costo + %. Así no importa quién cambie el costo (la
   bolsa de admin-escalas.js, la tabla de tamaños de admin-variantes.js): siempre manda. */
let _precioFijo = null;

function _pfMonto(v) {
  if (typeof montoAR === 'function') return montoAR(v) || 0;
  return Number(String(v == null ? '' : v).replace(/[^\d]/g, '')) || 0;
}
function _pfLeer() {
  const c = document.getElementById('pCosto'), p = document.getElementById('pPorcentaje');
  return { costo: _pfMonto(c ? c.value : 0), pct: parseFloat(p ? p.value : 0) || 0 };
}
function _pfCalc(costo, pct) { return Math.round(costo * (1 + pct / 100)); }
function _pfPesos(n) { return '$' + Math.round(Number(n) || 0).toLocaleString('es-AR'); }
function _pfPct(n) { return String(n).replace('.', ',') + '%'; }

/* El % de ganancia que da justo ese precio con ese costo, con los menos decimales posibles
   (65 si alcanza; 75,68 si hace falta). Debajo del costo da negativo. */
function pctParaPrecio(costo, precio) {
  const c = Number(costo) || 0, pr = Math.round(Number(precio) || 0);
  if (!(c > 0)) return 0;
  const exacto = (pr / c - 1) * 100;
  for (let d = 0; d <= 6; d++) {
    const f = Math.pow(10, d);
    const pct = Math.round(exacto * f) / f;
    if (_pfCalc(c, pct) === pr) return pct;
  }
  return Math.round(exacto * 1e6) / 1e6;
}

/* El precio que va: el fijo si sigue valiendo, o costo + %. Lo usan calcPrecioModal (lo que se
   ve) y saveProduct (lo que se guarda): los dos con la misma cuenta. */
function precioFichaBase(costo, pct) {
  if (_precioFijo && (_precioFijo.costo !== costo || _precioFijo.pct !== pct)) _precioFijo = null;
  return _precioFijo ? _precioFijo.precio : _pfCalc(costo, pct);
}
function precioFichaFinal() {
  const v = _pfLeer();
  return precioFichaBase(v.costo, v.pct);
}

/* Al abrir un producto nuevo. */
function precioFichaReset() { _precioFijo = null; }

/* Al abrir uno que ya existe, con el costo y el % ya puestos en la ficha: si su precio no es
   costo + %, queda ese. */
function precioFichaAlAbrir(p) {
  _precioFijo = null;
  const precio = Math.round(Number(p && p.precio) || 0);
  if (!(precio > 0)) return;
  const v = _pfLeer();
  if (precio !== _pfCalc(v.costo, v.pct)) _precioFijo = { precio: precio, costo: v.costo, pct: v.pct, origen: 'guardado' };
}

/* Escribiendo en la casilla del precio. */
function precioEscritoFicha(inp) {
  if (typeof limpiarMonto === 'function') limpiarMonto(inp);
  const precio = _pfMonto(inp.value);
  const v = _pfLeer();
  let pct = v.pct;
  /* Con costo, el % se ajusta para dar justo este precio. Vacío, no se toca el %: está
     borrando para escribir otro. */
  if (v.costo > 0 && precio > 0) {
    pct = pctParaPrecio(v.costo, precio);
    const pp = document.getElementById('pPorcentaje');
    if (pp) pp.value = String(pct);
  }
  _precioFijo = { precio: precio, costo: v.costo, pct: pct, origen: 'escrito' };
  if (typeof calcPrecioModal === 'function') calcPrecioModal();
  /* La primera fila de la tabla de tamaños escucha el input del %, que acá se cambió por código. */
  if (typeof pintarFilaPpal === 'function') { try { pintarFilaPpal(); } catch (e) { /* sin la tabla */ } }
}

/* La línea de abajo de la casilla: de dónde sale el precio que se ve. */
function precioFichaNota() {
  const n = document.getElementById('pPrecioNota');
  if (!n) return;
  const v = _pfLeer();
  const precio = precioFichaBase(v.costo, v.pct);
  let txt = '';
  if (_precioFijo && !(v.costo > 0) && precio > 0) {
    txt = 'Sin costo cargado: se guarda este precio tal cual.';
  } else if (_precioFijo && v.costo > 0 && precio !== _pfCalc(v.costo, v.pct)) {
    txt = 'Precio redondeado o escrito a mano. Con costo + ' + _pfPct(v.pct) + ' daría ' + _pfPesos(_pfCalc(v.costo, v.pct)) + '.';
  } else if (_precioFijo && _precioFijo.origen === 'escrito' && v.costo > 0 && precio > 0) {
    txt = 'El % de ganancia se ajustó a ' + _pfPct(v.pct) + ' para este precio.';
  }
  n.textContent = txt;
  n.hidden = !txt;
}

/* EL CARTELITO AL GUARDAR (pedido de Thiago, 19/11). Devuelve true si se guarda.
   - Precio redondeado que no se tocó: se elige cuál queda (cerrar sin elegir no guarda).
   - Sin costo y con precio: se avisa que se guarda tal cual. Sin costo y en $0 ya lo avisa
     avisoGuardarSinGanancia. */
async function avisoPrecioFicha() {
  const v = _pfLeer();
  const precio = precioFichaBase(v.costo, v.pct);
  const nom = (document.getElementById('pNombreMostrado') || {}).value || (document.getElementById('pNombre') || {}).value || 'Este producto';
  const peso = typeof _tipoVentaProd !== 'undefined' && _tipoVentaProd === 'peso';
  const kg = peso ? ' el kilo' : '';
  const NL = String.fromCharCode(10);
  if (v.costo > 0 && precio > 0 && precio !== _pfCalc(v.costo, v.pct) && typeof pedirOpcion === 'function') {
    const calc = _pfCalc(v.costo, v.pct);
    const r = await pedirOpcion(
      String(nom).trim() + ' tiene el precio en ' + _pfPesos(precio) + kg + ', pero con el costo (' + _pfPesos(v.costo) + kg +
      ') y el ' + _pfPct(v.pct) + ' de ganancia daría ' + _pfPesos(calc) + kg + '.' + NL + NL +
      'Seguramente se redondeó o se escribió a mano. ¿Qué precio dejamos?',
      { titulo: 'El precio no es costo + %', icono: 'bi-cash-coin', opciones: [
        { valor: 'dejar', texto: 'Dejar ' + _pfPesos(precio), principal: true },
        { valor: 'calc', texto: 'Usar ' + _pfPesos(calc) + ' (costo + %)' },
      ] });
    if (!r) return false;
    if (r === 'calc') {
      _precioFijo = null;
      if (typeof calcPrecioModal === 'function') calcPrecioModal();
    }
    return true;
  }
  if (!(v.costo > 0) && precio > 0 && typeof pedirConfirmacion === 'function') {
    const seguir = await pedirConfirmacion(
      String(nom).trim() + ' no tiene costo cargado. Se guarda con el precio que tiene: ' + _pfPesos(precio) + kg + '.' + NL + NL +
      'Sin el costo el sistema no sabe cuánto ganás, y el precio no se actualiza cuando cambie el costo. ¿Guardar igual?',
      { titulo: 'Producto sin costo', aceptar: 'Guardar igual', cancelar: 'Volver', icono: 'bi-exclamation-triangle' });
    if (!seguir) { const c = document.getElementById('pCosto'); if (c) c.focus(); return false; }
  }
  return true;
}

if (typeof window !== 'undefined') {
  window.pctParaPrecio = pctParaPrecio;
  window.precioFichaBase = precioFichaBase;
  window.precioFichaFinal = precioFichaFinal;
  window.precioFichaReset = precioFichaReset;
  window.precioFichaAlAbrir = precioFichaAlAbrir;
  window.precioEscritoFicha = precioEscritoFicha;
  window.precioFichaNota = precioFichaNota;
  window.avisoPrecioFicha = avisoPrecioFicha;
}
