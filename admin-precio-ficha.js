/* ==========================================================================
   EL PRECIO EN LA FICHA DEL PRODUCTO SE PUEDE ESCRIBIR  —  Brotes Dietética
   ==========================================================================
   Pedido de la clienta (19/11/2026): la casilla "Precio" estaba bloqueada; salía
   siempre del costo y el % de ganancia, y quería poder escribirlo. El mismo día,
   Thiago: lo mismo para el precio mayorista.

   Cómo queda, para los dos precios (mostrador y mayorista):
   - Si se escribe el precio, el % se recalcula solo (con los decimales que hagan
     falta para que dé justo ese precio). Todo sigue conectado: cuando cambie el
     costo, el precio sube con ese mismo margen, como siempre.
   - Si cambia el costo o el %, el precio sale de costo + % como antes (el
     mayorista, redondeado a $50).
   - Si no se toca ni el costo ni el % ni el precio, el precio queda como estaba.

   Arregla lo que pasaba al guardar la ficha (leído en producción el 19/11):
   - 90 productos tienen precio pero no costo: guardar su ficha les dejaba el precio
     en $0 (la leche de coco del 18/11). Ahora se guarda el precio que tiene.
   - 235 tienen el precio redondeado ("Redondear"): guardar su ficha lo volvía a
     costo + % (Granola Keto, de $25.300 a $25.202). Ahora queda el que tiene.
   - 458 tienen un mayorista que no es costo + % mayorista redondeado a $50: guardar
     la ficha lo cambiaba solo (27 bajaban: Anís estrellado x 10 Kg, de $35.666 a
     $29.950; 144 con el % mayorista en 0 quedaban sin mayorista).
   Y al guardar aparece un cartelito que lo explica (pedido de Thiago, 19/11): si un
   precio no es la cuenta, se elige cuál queda; sin costo, se avisa que se guarda tal
   cual; un mayorista escrito que no deja ganancia, se avisa. Un precio de mostrador
   por debajo del costo lo avisa avisoGuardarSinGanancia (admin-costos.js).
   ========================================================================== */

/* El precio que no sale de costo + %: el que tenía guardado (redondeado, o sin costo) o el
   que se escribió. Lleva el costo y el % con los que vale: si cualquiera de los dos cambia, se
   suelta y el precio vuelve a salir de costo + %. Así no importa quién cambie el costo (la
   bolsa de admin-escalas.js, la tabla de tamaños de admin-variantes.js): siempre manda.
   _mayFijo es lo mismo para el mayorista, con el % mayorista. */
let _precioFijo = null;
let _mayFijo = null;

function _pfMonto(v) {
  if (typeof montoAR === 'function') return montoAR(v) || 0;
  return Number(String(v == null ? '' : v).replace(/[^\d]/g, '')) || 0;
}
function _pfLeer() {
  const c = document.getElementById('pCosto'), p = document.getElementById('pPorcentaje');
  return { costo: _pfMonto(c ? c.value : 0), pct: parseFloat(p ? p.value : 0) || 0 };
}
function _pfLeerMay() {
  const e = document.getElementById('pPorcentajeMay');
  return parseFloat(e ? e.value : 0) || 0;
}
function _pfCalc(costo, pct) { return Math.round(costo * (1 + pct / 100)); }
/* El mayorista con la misma cuenta que saveProduct: redondeado a $50, y sin % mayorista, sin
   mayorista (0: la venta mayorista cobra el de mostrador). */
function _pfRedMay(n) { return typeof _redondearMayorista === 'function' ? _redondearMayorista(n) : (n ? Math.ceil(n / 50) * 50 : 0); }
function _pfCalcMay(costo, pm) { return pm > 0 ? _pfRedMay(Math.round(costo * (1 + pm / 100))) : 0; }
function _pfPesos(n) { return '$' + Math.round(Number(n) || 0).toLocaleString('es-AR'); }
function _pfPct(n) { return String(n).replace('.', ',') + '%'; }
function _pfSinGanancia(precio, costo) {
  if (typeof _mayoristaSinGanancia === 'function') return _mayoristaSinGanancia(precio, costo);
  return Number(costo) > 0 && Number(precio) < Number(costo) * 1.05;
}

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

/* El precio que va: el fijo si sigue valiendo, o la cuenta. Lo usan calcPrecioModal (lo que se
   ve) y saveProduct (lo que se guarda): los dos con la misma cuenta. */
function precioFichaBase(costo, pct) {
  if (_precioFijo && (_precioFijo.costo !== costo || _precioFijo.pct !== pct)) _precioFijo = null;
  return _precioFijo ? _precioFijo.precio : _pfCalc(costo, pct);
}
function precioFichaFinal() {
  const v = _pfLeer();
  return precioFichaBase(v.costo, v.pct);
}
function mayoristaFichaBase(costo, pm) {
  if (_mayFijo && (_mayFijo.costo !== costo || _mayFijo.pm !== pm)) _mayFijo = null;
  return _mayFijo ? _mayFijo.precio : _pfCalcMay(costo, pm);
}
function mayoristaFichaFinal() {
  return mayoristaFichaBase(_pfLeer().costo, _pfLeerMay());
}

/* Al abrir un producto nuevo. */
function precioFichaReset() { _precioFijo = null; _mayFijo = null; }

/* Al abrir uno que ya existe, con el costo y el % ya puestos en la ficha (el % mayorista
   todavía no: openModal lo pone después, por eso se toma del producto). Si un precio no es la
   cuenta, queda el suyo. */
function precioFichaAlAbrir(p) {
  _precioFijo = null;
  _mayFijo = null;
  const v = _pfLeer();
  const precio = Math.round(Number(p && p.precio) || 0);
  if (precio > 0 && precio !== _pfCalc(v.costo, v.pct)) _precioFijo = { precio: precio, costo: v.costo, pct: v.pct, origen: 'guardado' };
  const may = Math.round(Number(p && p.precioMayorista) || 0);
  const pm = Number(p && p.porcentajeMayorista) || 0;
  if (may !== _pfCalcMay(v.costo, pm)) _mayFijo = { precio: may, costo: v.costo, pm: pm, origen: 'guardado' };
}

function _pfRepintar() {
  if (typeof calcPrecioModal === 'function') calcPrecioModal();
  /* La primera fila de la tabla de tamaños escucha el input del %, que acá se cambió por código. */
  if (typeof pintarFilaPpal === 'function') { try { pintarFilaPpal(); } catch (e) { /* sin la tabla */ } }
  if (typeof pintarCajaCerrada === 'function') { try { pintarCajaCerrada(); } catch (e) { /* sin la casilla */ } }
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
  _pfRepintar();
}

/* Escribiendo en la casilla del precio mayorista. Con costo, el % mayorista se ajusta para dar
   ese precio (con un 0 escrito, queda en 0: sin mayorista). */
function mayoristaEscritoFicha(inp) {
  if (typeof limpiarMonto === 'function') limpiarMonto(inp);
  const precio = _pfMonto(inp.value);
  const v = _pfLeer();
  let pm = _pfLeerMay();
  if (v.costo > 0 && String(inp.value).trim() !== '') {
    pm = precio > 0 ? pctParaPrecio(v.costo, precio) : 0;
    const e = document.getElementById('pPorcentajeMay');
    if (e) e.value = String(pm);
  }
  _mayFijo = { precio: precio, costo: v.costo, pm: pm, origen: 'escrito' };
  _pfRepintar();
}

/* Las líneas de abajo de las casillas: de dónde sale el precio que se ve. */
function _pfNota(id, txt) {
  const n = document.getElementById(id);
  if (!n) return;
  n.textContent = txt;
  n.hidden = !txt;
}
function precioFichaNota() {
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
  _pfNota('pPrecioNota', txt);

  const pm = _pfLeerMay();
  const may = mayoristaFichaBase(v.costo, pm);
  const calcM = _pfCalcMay(v.costo, pm);
  let tm = '';
  if (_mayFijo && !(v.costo > 0) && may > 0) {
    tm = 'Sin costo cargado: se guarda este precio mayorista tal cual.';
  } else if (_mayFijo && v.costo > 0 && may !== calcM) {
    tm = may > 0 && calcM > 0 ? 'Mayorista escrito a mano o de antes. Con costo + ' + _pfPct(pm) + ', redondeado a $50, daría ' + _pfPesos(calcM) + '.'
      : may > 0 ? 'Sin % mayorista: con la cuenta no tendría precio mayorista (se cobraría el de mostrador).'
        : 'Sin precio mayorista (se cobra el de mostrador). Con costo + ' + _pfPct(pm) + ' daría ' + _pfPesos(calcM) + '.';
  } else if (_mayFijo && _mayFijo.origen === 'escrito' && v.costo > 0 && may > 0) {
    tm = 'El % mayorista se ajustó a ' + _pfPct(pm) + ' para este precio.';
  }
  if (_mayFijo && v.costo > 0 && may > 0 && _pfSinGanancia(may, v.costo)) {
    tm = (tm ? tm + ' ' : '') + 'Ojo: casi no deja ganancia (costó ' + _pfPesos(v.costo) + ').';
  }
  _pfNota('pPrecioMayNota', tm);
}

/* EL CARTELITO AL GUARDAR (pedido de Thiago, 19/11). Devuelve true si se guarda.
   1. Precio de mostrador que no es costo + % y no se tocó: se elige cuál queda.
   2. Sin costo y con precio: se avisa que se guarda tal cual (sin costo y en $0 ya lo avisa
      avisoGuardarSinGanancia).
   3. Mayorista que no es la cuenta y no se tocó: se elige cuál queda.
   4. Mayorista escrito que no deja ganancia: se avisa.
   Cerrar un cartelito sin elegir, o "Volver", no guarda. */
async function avisoPrecioFicha() {
  const v = _pfLeer();
  const pm = _pfLeerMay();
  const nom = String((document.getElementById('pNombreMostrado') || {}).value || (document.getElementById('pNombre') || {}).value || 'Este producto').trim();
  const peso = typeof _tipoVentaProd !== 'undefined' && _tipoVentaProd === 'peso';
  const kg = peso ? ' el kilo' : '';
  const NL = String.fromCharCode(10);

  const precio = precioFichaBase(v.costo, v.pct);
  if (v.costo > 0 && precio > 0 && precio !== _pfCalc(v.costo, v.pct) && typeof pedirOpcion === 'function') {
    const calc = _pfCalc(v.costo, v.pct);
    const r = await pedirOpcion(
      nom + ' tiene el precio en ' + _pfPesos(precio) + kg + ', pero con el costo (' + _pfPesos(v.costo) + kg +
      ') y el ' + _pfPct(v.pct) + ' de ganancia daría ' + _pfPesos(calc) + kg + '.' + NL + NL +
      'Seguramente se redondeó o se escribió a mano. ¿Qué precio dejamos?',
      { titulo: 'El precio no es costo + %', icono: 'bi-cash-coin', opciones: [
        { valor: 'dejar', texto: 'Dejar ' + _pfPesos(precio), principal: true },
        { valor: 'calc', texto: 'Usar ' + _pfPesos(calc) + ' (costo + %)' },
      ] });
    if (!r) return false;
    if (r === 'calc') { _precioFijo = null; _pfRepintar(); }
  } else if (!(v.costo > 0) && precio > 0 && typeof pedirConfirmacion === 'function') {
    const mayS = mayoristaFichaBase(v.costo, pm);
    const seguir = await pedirConfirmacion(
      nom + ' no tiene costo cargado. Se guarda con el precio que tiene: ' + _pfPesos(precio) + kg +
      (mayS > 0 ? ' (mayorista ' + _pfPesos(mayS) + kg + ')' : '') + '.' + NL + NL +
      'Sin el costo el sistema no sabe cuánto ganás, y el precio no se actualiza cuando cambie el costo. ¿Guardar igual?',
      { titulo: 'Producto sin costo', aceptar: 'Guardar igual', cancelar: 'Volver', icono: 'bi-exclamation-triangle' });
    if (!seguir) { const c = document.getElementById('pCosto'); if (c) c.focus(); return false; }
  }

  if (!(v.costo > 0)) return true;
  const may = mayoristaFichaBase(v.costo, pm);
  const calcM = _pfCalcMay(v.costo, pm);
  const mostrador = precioFichaBase(v.costo, v.pct);
  let preguntado = false;
  if (_mayFijo && _mayFijo.origen === 'guardado' && may !== calcM && typeof pedirOpcion === 'function') {
    const sinGan = may > 0 && _pfSinGanancia(may, v.costo);
    const ojo = sinGan ? 'Ojo: costó ' + _pfPesos(v.costo) + kg + ', así que a ' + _pfPesos(may) + kg + ' al mayorista no le ganás nada (o casi nada).' + NL + NL : '';
    let msg, usar;
    if (may > 0 && calcM > 0) {
      msg = 'El precio mayorista de ' + nom + ' es ' + _pfPesos(may) + kg + ', pero con el costo (' + _pfPesos(v.costo) + kg + ') y el ' +
        _pfPct(pm) + ' de ganancia mayorista daría ' + _pfPesos(calcM) + kg + ' (la cuenta redondea a $50).' + NL + NL + ojo +
        'Seguramente se cargó a mano o es de antes. ¿Qué precio mayorista dejamos?';
      usar = 'Usar ' + _pfPesos(calcM) + ' (costo + %)';
    } else if (may > 0) {
      msg = nom + ' tiene precio mayorista ' + _pfPesos(may) + kg + ', pero no tiene % de ganancia mayorista: con la cuenta quedaría sin ' +
        'precio mayorista, y a los mayoristas se les cobraría el de mostrador (' + _pfPesos(mostrador) + kg + ').' + NL + NL + ojo + '¿Qué hacemos?';
      usar = 'Sacarle el mayorista (se cobra ' + _pfPesos(mostrador) + ')';
    } else {
      msg = nom + ' no tiene precio mayorista (a los mayoristas se les cobra el de mostrador, ' + _pfPesos(mostrador) + kg + '), pero con el costo (' +
        _pfPesos(v.costo) + kg + ') y el ' + _pfPct(pm) + ' de ganancia mayorista daría ' + _pfPesos(calcM) + kg + '.' + NL + NL + '¿Qué hacemos?';
      usar = 'Usar ' + _pfPesos(calcM) + ' (costo + %)';
    }
    const r = await pedirOpcion(msg, { titulo: 'El mayorista no es costo + %', icono: 'bi-box-seam', opciones: [
      { valor: 'dejar', texto: may > 0 ? 'Dejar ' + _pfPesos(may) : 'Dejarlo sin mayorista', principal: true },
      { valor: 'calc', texto: usar },
    ] });
    if (!r) return false;
    if (r === 'calc') { _mayFijo = null; _pfRepintar(); }
    preguntado = true;
  }
  const mayF = mayoristaFichaBase(v.costo, pm);
  if (!preguntado && _mayFijo && mayF > 0 && _pfSinGanancia(mayF, v.costo) && typeof pedirConfirmacion === 'function') {
    const seguir = await pedirConfirmacion(
      'Con el precio mayorista de ' + nom + ' (' + _pfPesos(mayF) + kg + ') no ganás nada, o casi nada: costó ' + _pfPesos(v.costo) + kg + '.' + NL + NL +
      '¿Guardar igual?',
      { titulo: 'El mayorista no deja ganancia', aceptar: 'Guardar igual', cancelar: 'Volver', icono: 'bi-exclamation-triangle', cuidado: true, focoEnNo: true });
    if (!seguir) { const e = document.getElementById('pPrecioMay'); if (e) e.focus(); return false; }
  }
  return true;
}

if (typeof window !== 'undefined') {
  window.pctParaPrecio = pctParaPrecio;
  window.precioFichaBase = precioFichaBase;
  window.precioFichaFinal = precioFichaFinal;
  window.mayoristaFichaBase = mayoristaFichaBase;
  window.mayoristaFichaFinal = mayoristaFichaFinal;
  window.precioFichaReset = precioFichaReset;
  window.precioFichaAlAbrir = precioFichaAlAbrir;
  window.precioEscritoFicha = precioEscritoFicha;
  window.mayoristaEscritoFicha = mayoristaEscritoFicha;
  window.precioFichaNota = precioFichaNota;
  window.avisoPrecioFicha = avisoPrecioFicha;
}
