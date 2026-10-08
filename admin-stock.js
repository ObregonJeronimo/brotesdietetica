/* =============================================================================
   AGREGAR STOCK  —  Brotes Dietética
   =============================================================================
   Pedido del comercio (25/09/2026): en la sección Stock había que escribir el total.
   Con 2.953 g en stock y 843 g que llegaban, la cuenta la hacía la persona. Ahora cada
   fila tiene "Agregar stock": se escribe lo que llegó y se suma solo.

   LA SUMA LA HACE LA BASE (FieldValue.increment), no la pantalla: si mientras tanto
   otro vendió, no se pisa nada. Es lo mismo que hace la carga en tanda de arriba
   (agregarStockMasivo en admin.html), para un solo producto y sin tener que tildarlo.

   EL LÁPIZ, "Corregir", sigue poniendo el total: es para cuando se cuenta el depósito.
   Como antes, se relee el stock justo antes de escribir, y si cambió mientras la
   pantalla estaba abierta se pregunta: poner un total pisaría ese movimiento.

   La reposición (stockSubioEn, para Depuración) la anota sola la Cloud Function
   registrarReposicion cada vez que el stock sube: acá no hay que hacer nada.
   ============================================================================= */

const _STK_NL = String.fromCharCode(10);
const _stkProducto = id => (typeof allProducts !== 'undefined' && Array.isArray(allProducts) ? allProducts : []).find(x => x && x.id === id) || null;
const _stkPeso = p => (typeof esPorPeso === 'function' ? esPorPeso(p) : !!(p && p.tipoVenta === 'peso'));
const _stkEsc = s => (typeof esc === 'function' ? esc(String(s == null ? '' : s)) : String(s == null ? '' : s));
/* El nombre, con su tamaño si es una bolsa o una presentación: "Mani prueba x 1 kg". La
   principal no suele decirlo, y no se sabía a cuál se le cargaba (pedido del dueño,
   28/09/2026). Sin admin-variantes.js, el nombre de siempre. */
const _stkNombre = p => (typeof _nombreConPresentacion === 'function' ? _nombreConPresentacion(p) : ((p && p.nombre) || ''));

/* Una cantidad de stock, en su unidad: "2.953 g" o "12 unidades". En los de peso van los
   gramos, igual que en la fila: es como se piensa lo que llega ("843 gramos"). */
function _stkCant(p, n) {
  const v = Number(n || 0);
  if (_stkPeso(p)) return v.toLocaleString('es-AR') + ' g';
  return v.toLocaleString('es-AR') + (Math.abs(v) === 1 ? ' unidad' : ' unidades');
}

/* La cuenta que se ve en el diálogo mientras se escribe. */
function _stkCuenta(p, modo, n) {
  const antes = Number((p && p.stock) || 0);
  if (modo === 'corregir') return { izq: 'Ahora ' + _stkCant(p, antes), der: 'queda en ' + _stkCant(p, n) };
  return { izq: _stkCant(p, antes) + ' + ' + _stkCant(p, n), der: '= ' + _stkCant(p, antes + n) };
}

/* El diálogo: una cantidad, con la cuenta en vivo. modo 'agregar' (lo que llegó, más de
   0) o 'corregir' (el total, 0 o más). Devuelve el número, o null si se cancela. Tiene la
   forma del de los gramos de la venta (pedirCantidadPeso, admin-dialogo.js). */
function pedirCantidadStock(p, modo) {
  const corregir = modo === 'corregir';
  const peso = _stkPeso(p);
  const antes = Number((p && p.stock) || 0);
  /* En los de peso, los tamaños de bolsa más comunes, a un toque. */
  const RAPIDOS = (peso && !corregir) ? [500, 1000, 5000, 10000, 25000] : [];
  const pesoTxt = g => (typeof _dlgPeso === 'function' ? _dlgPeso(g) : g + ' g');

  return new Promise(resolve => {
    const ov = document.createElement('div');
    ov.className = 'dlg-overlay';
    const abiertos = (typeof _dlgAbiertos === 'number') ? _dlgAbiertos : 0;
    ov.style.zIndex = String(400 + abiertos);
    if (typeof _dlgAbiertos === 'number') _dlgAbiertos++;

    ov.innerHTML =
      '<div class="dlg-box" role="dialog" aria-modal="true">' +
        '<div class="dlg-cab"><span class="dlg-ico"><i class="bi ' + (corregir ? 'bi-pencil' : 'bi-box-arrow-in-down') + '"></i></span>' +
        '<h3>' + (corregir ? 'Corregir el stock' : 'Agregar stock') + '</h3></div>' +
        '<div class="dlg-msg">' +
          '<p class="dlg-linea"><b>' + _stkEsc(_stkNombre(p)) + '</b></p>' +
          '<p class="dlg-linea" style="color:var(--text-dim);font-size:0.83rem">' + (corregir
            ? 'Poné cuánto hay en total, por ejemplo después de contar. Ahora figura ' + _stkEsc(_stkCant(p, antes)) + '.'
            : '¿Cuánto llegó? Se suma a lo que hay: ahora ' + _stkEsc(_stkCant(p, antes)) + '.') + '</p>' +
          (RAPIDOS.length ? '<div class="pz-rapidos">' +
            RAPIDOS.map(g => '<button type="button" class="pz-rap" data-g="' + g + '">' + _stkEsc(pesoTxt(g)) + '</button>').join('') + '</div>' : '') +
          '<div class="pz-fila">' +
            '<input type="number" class="form-input pz-input" min="0" step="1" inputmode="numeric" placeholder="' + (peso ? 'gramos' : 'unidades') + '"' +
              (corregir ? ' value="' + Math.max(0, antes) + '"' : '') + '>' +
            '<span class="pz-unidad">' + (peso ? 'gramos' : 'unidades') + '</span>' +
          '</div>' +
          '<div class="pz-total" aria-live="polite"></div>' +
        '</div>' +
        '<div class="dlg-pie">' +
          '<button type="button" class="btn btn-secondary dlg-no">Cancelar</button>' +
          '<button type="button" class="btn btn-primary dlg-si" disabled>' + (corregir ? 'Guardar' : 'Agregar') + '</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(ov);

    const inp = ov.querySelector('.pz-input');
    const btnOk = ov.querySelector('.dlg-si');
    const tot = ov.querySelector('.pz-total');
    let cerrado = false;

    const valor = () => {
      const n = parseInt(inp.value, 10);
      return (Number.isFinite(n) && (corregir ? n >= 0 : n > 0)) ? n : null;
    };
    const cerrar = v => {
      if (cerrado) return;
      cerrado = true;
      if (typeof _dlgAbiertos === 'number') _dlgAbiertos = Math.max(0, _dlgAbiertos - 1);
      document.removeEventListener('keydown', onTecla, true);
      ov.remove();
      resolve(v);
    };
    function pintar() {
      const n = valor();
      btnOk.disabled = n === null;
      if (n === null) { tot.innerHTML = ''; return; }
      const c = _stkCuenta(p, modo, n);
      tot.innerHTML = '<span>' + _stkEsc(c.izq) + '</span><b>' + _stkEsc(c.der) + '</b>';
    }
    function onTecla(e) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cerrar(null); }
      else if (e.key === 'Enter') { e.preventDefault(); const n = valor(); if (n !== null) cerrar(n); }
    }

    ov.querySelectorAll('.pz-rap').forEach(b => b.addEventListener('click', () => {
      inp.value = b.getAttribute('data-g');
      pintar();
      inp.focus();
    }));
    inp.addEventListener('input', pintar);
    btnOk.addEventListener('click', () => { const n = valor(); if (n !== null) cerrar(n); });
    ov.querySelector('.dlg-no').addEventListener('click', () => cerrar(null));
    ov.addEventListener('mousedown', e => { if (e.target === ov) cerrar(null); });
    document.addEventListener('keydown', onTecla, true);

    pintar();
    setTimeout(() => { inp.focus(); if (corregir && inp.select) inp.select(); }, 30);
  });
}

/* Después de cambiar un stock: la lista, los números de arriba y la campana (el stock
   bajo pudo resolverse o aparecer). */
function _stkRepintar() {
  if (typeof _reRenderProductos === 'function') _reRenderProductos();
  else if (typeof renderStockList === 'function') renderStockList();
  if (typeof updateStats === 'function') updateStats();
  if (typeof _refrescarAlertas === 'function') _refrescarAlertas(false);
}

/* "Agregar stock": lo que llegó, sumado en la base. */
async function agregarStockProducto(id) {
  const p = _stkProducto(id);
  if (!p) return;
  const n = await pedirCantidadStock(p, 'agregar');
  if (n == null) return;
  const antes = Number(p.stock || 0);
  try {
    const ref = db.collection('productos').doc(id);
    await ref.update({ stock: firebase.firestore.FieldValue.increment(n) });
    /* Lo que quedó de verdad: si otro vendió en el medio, la base ya lo tiene. */
    let ahora = antes + n;
    try { const sn = await ref.get(); if (sn && sn.exists) ahora = Number((sn.data() || {}).stock || 0); } catch (e) { /* queda la cuenta */ }
    p.stock = ahora;
    if (typeof logAction === 'function') {
      logAction('stock', 'Stock agregado: ' + (_stkNombre(p) || id), '+' + n + (_stkPeso(p) ? ' g' : ' u.') + ' (' + antes + ' -> ' + ahora + ')');
    }
    if (typeof showAdminToast === 'function') {
      showAdminToast('Se agregaron ' + _stkEsc(_stkCant(p, n)) + ' a ' + _stkEsc(_stkNombre(p)) + '. Ahora hay ' + _stkEsc(_stkCant(p, ahora)) + '.', 'success');
    }
    _stkRepintar();
  } catch (e) {
    if (typeof showAdminToast === 'function') showAdminToast('No se pudo agregar el stock: ' + _stkEsc(e && e.message), 'error');
  }
}

/* El lápiz, "Corregir": el total, como se escribía antes. */
async function corregirStockProducto(id) {
  const p = _stkProducto(id);
  if (!p) return;
  const n = await pedirCantidadStock(p, 'corregir');
  if (n == null) return;
  const visto = Number(p.stock || 0);
  try {
    const ref = db.collection('productos').doc(id);
    const sn = await ref.get();
    const real = (sn && sn.exists) ? Number((sn.data() || {}).stock || 0) : visto;
    if (real !== visto && typeof pedirConfirmacion === 'function') {
      const ok = await pedirConfirmacion('El stock de "' + (_stkNombre(p) || id) + '" pasó a ' + _stkCant(p, real) +
        ' mientras tenías esta pantalla abierta (acá figuraba ' + _stkCant(p, visto) + ').' + _STK_NL + _STK_NL +
        'Si guardás ' + _stkCant(p, n) + ', ese movimiento se pierde.' + _STK_NL + _STK_NL + '¿Guardar igual?',
        { titulo: 'El stock cambió', aceptar: 'Guardar igual' });
      if (!ok) {
        p.stock = real;
        _stkRepintar();
        if (typeof showAdminToast === 'function') showAdminToast('No se guardó. Se actualizó el número en pantalla.', 'info');
        return;
      }
    }
    await ref.update({ stock: n });
    p.stock = n;
    if (typeof logAction === 'function') logAction('stock', 'Stock: ' + (_stkNombre(p) || id), 'stock: ' + real + ' -> ' + n);
    if (typeof showAdminToast === 'function') showAdminToast('Stock corregido: ' + _stkEsc(_stkCant(p, n)) + '.', 'success');
    _stkRepintar();
  } catch (e) {
    if (typeof showAdminToast === 'function') showAdminToast('No se pudo corregir el stock: ' + _stkEsc(e && e.message), 'error');
  }
}

/* Lo que va a la derecha de cada fila de Stock (renderStockList, admin.html): el stock
   que hay, "Agregar stock" y el lápiz. */
function accionesStockHtml(p) {
  const id = typeof _attrHtml === 'function' ? _attrHtml(p.id) : String(p.id).replace(/"/g, '&quot;');
  const val = Number(p.stock || 0);
  const peso = _stkPeso(p);
  return '<div class="stock-actual est-' + _stkEstado(p) + '"><b>' + val.toLocaleString('es-AR') + (peso ? ' g' : '') + '</b>' +
      '<small>' + (peso ? _stkEsc(typeof fmtPeso === 'function' ? fmtPeso(val) : '') : (Math.abs(val) === 1 ? 'unidad' : 'unidades')) + '</small></div>' +
    '<button type="button" class="btn btn-primary btn-sm stock-agregar" onclick="agregarStockProducto(\'' + id + '\')">' +
      '<i class="bi bi-plus-lg"></i> Agregar stock</button>' +
    '<button type="button" class="stock-corregir" onclick="corregirStockProducto(\'' + id + '\')" title="Corregir el total (por ejemplo, después de contar)">' +
      '<i class="bi bi-pencil"></i></button>';
}

/* STOCK CON OTRA CARA (pedido del dueño, 07/10/2026): como Ventas. Arriba, el resumen de todo
   lo que está en uso; en cada fila, el stock en color según cómo está y los datos que ayudan a
   reconocer el producto. Solo cambia cómo se ve: se puede hacer lo mismo que antes. */

/* Cómo está el stock: 'neg' (se vendió más de lo cargado), 'sin', 'bajo' (con el límite de
   Productos, esStockBajo) u 'ok'. */
function _stkEstado(p) {
  const s = Number((p && p.stock) || 0);
  if (s < 0) return 'neg';
  if (s === 0) return 'sin';
  if (typeof esStockBajo === 'function' && esStockBajo(p)) return 'bajo';
  return 'ok';
}
const _stkPesos = n => '$' + Math.round(Number(n) || 0).toLocaleString('es-AR');

/* Las etiquetas de una fila: el estado si hay que mirarlo, si está oculto en la tienda o es
   una caja cerrada, el código y el precio. */
function detalleStockHtml(p) {
  const e = _stkEstado(p), chips = [];
  if (e === 'neg') chips.push('<span class="vt-chip debe"><i class="bi bi-exclamation-octagon"></i> En negativo</span>');
  else if (e === 'sin') chips.push('<span class="vt-chip debe"><i class="bi bi-x-circle"></i> Sin stock</span>');
  else if (e === 'bajo') chips.push('<span class="vt-chip fiado"><i class="bi bi-exclamation-triangle"></i> Stock bajo</span>');
  if (p.oculto === true) chips.push('<span class="vt-chip"><i class="bi bi-eye-slash"></i> Oculto en la tienda</span>');
  if (p.cajaCerrada === true) chips.push('<span class="vt-chip"><i class="bi bi-box-seam"></i> Caja cerrada</span>');
  if (p.codigo) chips.push('<span class="vt-chip"><i class="bi bi-upc"></i> ' + _stkEsc(p.codigo) + '</span>');
  if (Number(p.precio) > 0) chips.push('<span class="vt-chip"><i class="bi bi-tag"></i> ' + _stkPesos(p.precio) + (_stkPeso(p) ? ' el kilo' : '') + '</span>');
  return '<div class="stk-meta">' + chips.join('') + '</div>';
}

/* Arriba del bloque de un producto con bolsas o presentaciones: cuánto hay entre todas (si
   son todas de la misma clase: todas por peso o todas por unidad). */
function totalGrupoStockHtml(miembros) {
  const ps = (miembros || []).map(m => m.producto).filter(Boolean);
  if (!ps.length) return '';
  const peso = _stkPeso(ps[0]);
  if (ps.some(p => _stkPeso(p) !== peso)) return '';
  const tot = ps.reduce((s, p) => s + Number(p.stock || 0), 0);
  return '<div class="stk-meta"><span class="vt-chip"><i class="bi bi-boxes"></i> Entre todas: ' +
    _stkEsc(_stkCant(ps[0], tot)) + (peso && typeof fmtPeso === 'function' && Math.abs(tot) >= 1000 ? ' (' + _stkEsc(fmtPeso(tot)) + ')' : '') + '</span></div>';
}

/* El resumen de arriba, con todo lo que está en uso (no los depurados), sin mirar la búsqueda. */
function resumenStockHtml(productos) {
  const act = (productos || []).filter(p => p && p.depurado !== true);
  let bajo = 0, sin = 0, neg = 0, peso = 0, valor = 0, sinCosto = 0;
  act.forEach(p => {
    const e = _stkEstado(p);
    if (e === 'bajo') bajo++; else if (e === 'sin') sin++; else if (e === 'neg') neg++;
    const esP = _stkPeso(p);
    if (esP) peso++;
    const s = Math.max(0, Number(p.stock || 0)), c = Number(p.costo || 0);
    if (s > 0 && !(c > 0)) sinCosto++;
    valor += esP ? s / 1000 * c : s * c;
  });
  const n = x => Number(x).toLocaleString('es-AR');
  const kpi = (ico, color, etq, val, sub) => '<div class="vt-kpi"><span class="vt-kpi-ico' + (color ? ' ' + color : '') + '"><i class="bi ' + ico + '"></i></span>' +
    '<div class="vt-kpi-txt"><span class="vt-kpi-etq">' + etq + '</span><strong class="vt-kpi-val">' + val + '</strong>' +
    (sub ? '<span class="vt-kpi-sub">' + sub + '</span>' : '') + '</div></div>';
  return kpi('bi-box-seam', '', 'Productos', n(act.length), n(act.length - peso) + ' por unidad · ' + n(peso) + ' por peso') +
    kpi('bi-exclamation-triangle', 'ambar', 'Stock bajo', n(bajo), 'quedan pocos') +
    kpi('bi-x-circle', 'rojo', 'Sin stock', n(sin + neg), neg ? n(neg) + ' en negativo' : 'ninguno en negativo') +
    kpi('bi-cash-stack', 'verde', 'Valor del stock', _stkPesos(valor), 'a costo' + (sinCosto ? ' · ' + n(sinCosto) + ' sin costo cargado' : ''));
}
function pintarResumenStock() {
  const prods = (typeof allProducts !== 'undefined' && Array.isArray(allProducts)) ? allProducts : [];
  const k = document.getElementById('stkKpis');
  if (k) k.innerHTML = resumenStockHtml(prods);
  const t = document.getElementById('stkResumenTxt');
  if (t) {
    const u = typeof getLowStockThreshold === 'function' ? getLowStockThreshold() : 10;
    const g = typeof getLowStockThresholdPeso === 'function' ? getLowStockThresholdPeso() : 500;
    t.innerHTML = 'Se avisa como stock bajo con menos de <b>' + Number(u).toLocaleString('es-AR') + ' unidades</b> o <b>' +
      Number(g).toLocaleString('es-AR') + ' g</b>.';
  }
}

/* SELECCIONAR TODOS (pedido de Thiago, 07/10/2026): si la casilla de arriba deja elegidos TODOS
   los productos, antes pregunta, porque lo que se cargue en la tanda va a cada uno, también a
   cada bolsa y cada presentación por separado. Si dicen que sí, al lado de la casilla queda el
   aviso de que están todos, hasta que se saque alguno, se toque "Limpiar" o se cargue la tanda.
   Con una búsqueda o un filtro puesto la casilla elige solo los que se ven, sin preguntar (como
   antes): ahí no son todos. Salvo que los demás ya estuvieran elegidos y con esos se completen:
   entonces sí son todos, y pregunta. */
const _stkActivos = () => (typeof allProducts !== 'undefined' && Array.isArray(allProducts) ? allProducts : []).filter(p => p && p.depurado !== true);

/* ¿Están todos los productos en uso en la selección? Con extra, ¿lo estarían sumando esos? */
function stockSonTodos(extra) {
  const act = _stkActivos();
  const sel = typeof _stockSel !== 'undefined' && _stockSel ? _stockSel : new Set();
  const mas = new Set(extra || []);
  return act.length > 0 && act.every(p => sel.has(p.id) || mas.has(p.id));
}

/* La casilla "Seleccionar los N visibles" (onchange en admin.html). */
async function stockCasillaTodos(chk) {
  const marcar = !!(chk && chk.checked);
  const visibles = typeof _stockVisibles !== 'undefined' && _stockVisibles ? _stockVisibles : [];
  if (!marcar || stockSonTodos() || !stockSonTodos(visibles)) return stockSeleccionarTodos(marcar);
  /* Hasta que digan que sí, la casilla queda como estaba. */
  if (chk) chk.checked = false;
  pintarSeleccionStock();
  const act = _stkActivos();
  const grupos = typeof agruparParaStock === 'function'
    ? agruparParaStock(act).filter(x => x && x.__stockGrupo).map(x => x.__stockGrupo) : [];
  const tamanios = grupos.reduce((s, g) => s + g.miembros.length, 0);
  const n = x => Number(x).toLocaleString('es-AR');
  const msg = 'Vas a seleccionar TODOS los productos (' + n(act.length) + ') para cambiarles el stock de una vez.' + _STK_NL + _STK_NL +
    (grupos.length ? '[!] Incluye las ' + n(tamanios) + ' bolsas y presentaciones de ' + n(grupos.length) + ' producto' +
      (grupos.length === 1 ? '' : 's') + ': lo que cargues se suma o se resta en cada una por separado.' + _STK_NL + _STK_NL : '') +
    'Hacelo con cuidado y revisá bien la cantidad antes de cargarla.' + _STK_NL + '¿Querés seleccionarlos igual?';
  const si = await pedirConfirmacion(msg, { titulo: 'Seleccionar todos los productos', aceptar: 'Sí, seleccionar todos',
    icono: 'bi-exclamation-triangle', cuidado: true, focoEnNo: true });
  if (si) stockSeleccionarTodos(true);
  else pintarSeleccionStock();
}

/* El aviso al lado de la casilla. Lo llama pintarSeleccionStock (admin.html) cada vez que
   cambia la selección, así que se va solo cuando dejan de estar todos. */
function pintarAvisoTodosStock() {
  const a = document.getElementById('stockTodosAviso');
  if (a) a.hidden = !stockSonTodos();
}

/* EL FILTRO POR CÓMO ESTÁ EL STOCK (pedido de Thiago, 07/10/2026), al lado del de categorías,
   con las mismas cuentas que los recuadros de arriba: "Sin stock" son los que están en 0 y
   los que están en negativo. Lo usa renderStockList (admin.html). */
function coincideEstadoStock(p, filtro) {
  if (!filtro) return true;
  const e = _stkEstado(p);
  return filtro === 'sin' ? (e === 'sin' || e === 'neg') : e === filtro;
}

