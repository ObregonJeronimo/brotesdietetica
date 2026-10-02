/* =============================================================================
   VARIANTES  —  Brotes Dietética
   =============================================================================
   Un producto que viene en presentaciones (maní x 80 g, x 160 g; alfajor x1, x12)
   o en escalas de granel (yerba 1 kg, 3 kg, 5 kg) se muestra como UNO SOLO: una
   línea al vender, una tarjeta en la tienda. Pedido del comercio (24/09/2026).

   ESTA ES LA ETAPA 1 DE 4:
     1. agrupar, elegir la variante a mano, sugerir otra presentación si falta stock
     2. escalas de granel: el precio según la cantidad y el aviso de mezcla de stock
     3. cajas cerradas a precio mayorista
     4. migrar lo que ya existe -al final, con datos de la clienta-
   Los productos que ya existen NO se agrupan solos: eso es la etapa 4.

   CADA VARIANTE ES UN PRODUCTO POR DENTRO, con su código, su etiqueta, su stock, su
   costo y su proveedor. Por eso la venta, las compras, el lector, las etiquetas, el
   aviso de costos viejos, depuración y proveedores siguen andando sin tocarlos. Lo
   nuevo es solamente el agrupamiento.

   EL ENLACE ES EL DE LOS "GRAMAJES" QUE YA EXISTÍA: la variante tiene gramajePadreId
   apuntando al producto principal, y en gramaje su etiqueta ("160 g", "3 kg"). La
   tienda ya juntaba eso en una sola tarjeta. El principal también es una variante:
   la primera, con su propia etiqueta.
   ============================================================================= */

const _VAR_NL = String.fromCharCode(10);
const _varProds = () => (typeof allProducts !== 'undefined' && Array.isArray(allProducts) ? allProducts : []);
const _varEsc = s => (typeof esc === 'function' ? esc(String(s == null ? '' : s)) : String(s == null ? '' : s));
const _varAttr = s => (typeof _attrHtml === 'function' ? _attrHtml(s) : String(s == null ? '' : s).replace(/"/g, '&quot;'));

/* Cuánto trae una variante, leído de su etiqueta y si no de su nombre: { valor, unidad }
   con unidad 'g' (los kg se pasan a gramos), 'ml' (los litros y cc a ml) o 'u'. */
function contenidoDeVariante(p) {
  const textos = [p && p.gramaje, p && p.nombre];
  for (const t of textos) {
    const s = String(t || '').toLowerCase().replace(/(\d),(\d)/g, '$1.$2');
    let m;
    if ((m = s.match(/(\d+(?:\.\d+)?)\s*(kg|kgs|kilo|kilos)\b/))) return { valor: Math.round(parseFloat(m[1]) * 1000), unidad: 'g' };
    if ((m = s.match(/(\d+(?:\.\d+)?)\s*(g|gr|grs|gramos?)\b/))) return { valor: Math.round(parseFloat(m[1])), unidad: 'g' };
    if ((m = s.match(/(\d+(?:\.\d+)?)\s*(l|lt|lts|litros?)\b/))) return { valor: Math.round(parseFloat(m[1]) * 1000), unidad: 'ml' };
    if ((m = s.match(/(\d+(?:\.\d+)?)\s*(ml|cc)\b/))) return { valor: Math.round(parseFloat(m[1])), unidad: 'ml' };
    if ((m = s.match(/(\d+)\s*(u|un|unid|unidades)\b/))) return { valor: parseInt(m[1], 10), unidad: 'u' };
    /* "x12", "x 6": un pack. Va último: "x 80 g" ya salió como gramos. */
    if ((m = s.match(/(?:^|\s)x\s*(\d+)\b/))) return { valor: parseInt(m[1], 10), unidad: 'u' };
  }
  return null;
}

/* El nombre sin el tamaño: "Maní x 80 g" -> "Maní", "Alfajor x12" -> "Alfajor". */
function baseDeNombre(nombre) {
  return String(nombre || '')
    .replace(/\s*[-·]?\s*\bx?\s*\d+(?:[.,]\d+)?\s*(kg|kgs|kilos?|g|gr|grs|gramos?|l|lt|lts|litros?|ml|cc|u|un|unid|unidades)\b\.?/gi, ' ')
    .replace(/(^|\s)x\s*\d+\b/gi, ' ')
    .replace(/\s+/g, ' ').trim();
}

function principalDeVariante(p, productos) {
  if (!p) return null;
  if (!p.gramajePadreId) return p;
  return (productos || []).find(x => x && x.id === p.gramajePadreId) || p;
}

/* Primero las que se venden por unidad, después las de granel; cada grupo de menor a
   mayor, y las que no dicen cuánto traen al final. */
function _ordenVariantes(a, b) {
  const tam = v => { const c = contenidoDeVariante(v); return c ? c.valor : Infinity; };
  const ta = tam(a), tb = tam(b);
  return ((a.tipoVenta === 'peso') - (b.tipoVenta === 'peso')) || (ta === tb ? 0 : (ta < tb ? -1 : 1)) ||
    String(a.nombre || '').localeCompare(String(b.nombre || ''));
}

/* El principal y sus variantes, sin depurados; sin ocultos salvo que se pidan. */
function variantesDeGrupo(principal, productos, opts) {
  if (!principal) return [];
  const o = opts || {};
  const todos = [principal].concat((productos || []).filter(x => x && x.gramajePadreId === principal.id && x.id !== principal.id));
  return todos
    .filter(v => v && v.depurado !== true && (o.conOcultos || v.oculto !== true))
    .sort(_ordenVariantes);
}

function tieneVariantes(p, productos) {
  return !!(p && (p.gramajePadreId || (productos || []).some(x => x && x.gramajePadreId === p.id)));
}

function nombreDeGrupo(principal) {
  if (!principal) return '';
  return principal.nombreMostrado || baseDeNombre(principal.nombre) || principal.nombre || '';
}

function etiquetaVariante(v) {
  if (!v) return '';
  if (v.gramaje) return v.gramaje;
  const c = contenidoDeVariante(v);
  if (!c) return v.nombreMostrado || v.nombre || '';
  if (c.unidad === 'g') return c.valor >= 1000 ? (c.valor / 1000).toLocaleString('es-AR') + ' kg' : c.valor + ' g';
  if (c.unidad === 'ml') return c.valor >= 1000 ? (c.valor / 1000).toLocaleString('es-AR') + ' l' : c.valor + ' ml';
  return 'x' + c.valor;
}

function precioDeVentaVariante(v, ctx) {
  if (!v) return 0;
  return Number(ctx === 'may' ? (v.precioMayorista || v.precio || 0) : precioMostradorDe(v));
}

/* ------------------------------------------------------ CAJAS CERRADAS
   Etapa 3 (pedido del comercio, 24/09/2026): una presentación marcada como caja
   cerrada -el alfajor x12- se cobra a precio MAYORISTA también en el mostrador y en la
   tienda. Los sueltos siguen a precio normal: 12 alfajores sueltos a $10 son $120.
   El precio de lista del producto se sigue calculando como siempre (costo + ganancia):
   la regla se aplica al vender, con el precio mayorista, que ya mantienen al día todas
   las herramientas que tocan costos y precios (el formulario, Costo %, las compras, el
   aviso de costos viejos). Así ninguna de ellas tiene que saber de cajas. */
function esCajaCerrada(p) { return !!(p && p.cajaCerrada === true && p.tipoVenta !== 'peso'); }
/* Lo que se cobra en el mostrador (y en la tienda): el mayorista si es una caja
   cerrada con precio mayorista, si no el de siempre. */
function precioMostradorDe(p) {
  if (!p) return 0;
  const may = Number(p.precioMayorista || 0);
  return (esCajaCerrada(p) && may > 0) ? may : Number(p.precio || 0);
}

/* El "?" de la caja cerrada: al pasar el mouse (o tocarlo) dice cuándo marcarla. Pedido
   del comercio (25/09/2026): que se entienda que es SOLO para lo que se vende en caja
   cerrada. El mismo texto va en la casilla del formulario (pCajaAyuda) y en cada fila. */
const _AYUDA_CAJA = 'Marcalo SOLO si vendés el producto en una caja cerrada, por ejemplo una caja cerrada de alfajores de una docena. ' +
  'Esa caja se cobra al precio mayorista, en el mostrador y en la tienda. Si lo vendés suelto, no lo marques: va a precio normal.';
function _ayudaCajaHtml() {
  return '<span class="ayuda-tip" tabindex="0" role="img" aria-label="' + _varAttr(_AYUDA_CAJA) + '" data-tip="' + _varAttr(_AYUDA_CAJA) + '">' +
    '<i class="bi bi-question-circle"></i></span>';
}
/* El "?" del redondeo de las bolsas (pedido del dueño, 27/09). La bolsa se muestra desde el
   costo del kilo, que se guarda sin centavos: a veces sale unos pesos de más o de menos. Lo
   más importante para la dueña: que NO se pierde plata. Por eso va primero. La diferencia
   es de hasta medio peso por kilo: $1 en una bolsa de 3 kg, $12 en una de 25 kg (decía
   "$1" y en las grandes no era cierto; revisión del 27/09). */
const _AYUDA_REDONDEO = 'NO SE PIERDE DINERO. Es solo un redondeo: el sistema guarda el costo del kilo sin centavos y calcula la ' +
  'bolsa a partir de ese kilo. Por ejemplo: la bolsa de 3 kg a $2.000 da $666,67 el kilo; se guarda $667 y la bolsa se ve como $2.001. ' +
  'En las bolsas grandes la diferencia puede ser de algunos pesos (hasta $12 en una de 25 kg), pero siempre son centavos por kilo, ' +
  'y los precios se siguen calculando con tu mismo porcentaje de ganancia.';
/* La pregunta, con el "?" adelante; el cartel se abre hacia la derecha, más ancho, y hacia
   abajo (o hacia arriba, al pie del panel de la tabla). El cartelito de siempre se abre
   arriba y a la izquierda, y así quedaba cortado arriba de una ventana que scrollea o al
   costado de la tabla. La usa también la ventana de costos (admin-costos.js). */
function ayudaRedondeoLineaHtml(haciaArriba) {
  return '<p class="ayuda-linea"><span class="ayuda-tip der ancho' + (haciaArriba ? '' : ' abajo') + '" tabindex="0" role="img" aria-label="' +
    _varAttr(_AYUDA_REDONDEO) + '" data-tip="' + _varAttr(_AYUDA_REDONDEO) + '"><i class="bi bi-question-circle"></i></span>' +
    ' ¿Por qué a veces la bolsa muestra unos pesos de más o de menos?</p>';
}

/* La casilla de una fila. El "?" va afuera del label: adentro, tocarlo marcaría la casilla. */
function _cajaHtml(marcada, alCambiar) {
  return '<div class="vfe-caja"><label><input type="checkbox"' + (marcada ? ' checked' : '') + ' onchange="' + alCambiar + '">' +
    ' <span>Caja cerrada: en el mostrador y en la tienda se cobra el precio mayorista</span></label>' + _ayudaCajaHtml() + '</div>';
}

function _varStockTxt(v) {
  const n = Number(v.stock || 0);
  if (n <= 0) return 'SIN STOCK';
  if (v.tipoVenta === 'peso') return (typeof fmtPeso === 'function') ? fmtPeso(n) : (n / 1000).toLocaleString('es-AR') + ' kg';
  return 'Stock ' + n.toLocaleString('es-AR');
}

/* ------------------------------------------------------------- AL VENDER
   Los resultados del buscador de la venta: dos o más variantes del mismo producto se
   juntan en UNA fila. Una sola que coincida -buscando "160"- se muestra como siempre. */
function agruparVariantesVenta(lista, productos) {
  if (!Array.isArray(lista) || lista.length < 2) return lista;
  const prods = productos || _varProds();
  const cuantas = new Map();
  lista.forEach(p => {
    if (!p || p.__grupo) return;
    const pr = principalDeVariante(p, prods);
    if (pr && tieneVariantes(pr, prods)) cuantas.set(pr.id, (cuantas.get(pr.id) || 0) + 1);
  });
  const vistos = new Set();
  const out = [];
  lista.forEach(p => {
    if (!p) return;
    const pr = principalDeVariante(p, prods);
    if (!pr || !(cuantas.get(pr.id) >= 2)) { out.push(p); return; }
    if (vistos.has(pr.id)) return;
    vistos.add(pr.id);
    out.push({ __grupo: pr, variantes: variantesDeGrupo(pr, prods) });
  });
  return out;
}

function _filaGrupoVenta(g, ctx) {
  const pr = g.__grupo;
  const vs = g.variantes || [];
  const img = '<div class="vprod-img-ph"><i class="bi bi-box"></i>' +
    (pr.imagen ? '<img class="vprod-img" src="' + _varAttr(pr.imagen) + '" alt="" loading="lazy" onerror="this.remove()">' : '') + '</div>';
  const chips = vs.slice(0, 5).map(v => '<span class="vprod-chip neutro">' + _varEsc(etiquetaVariante(v)) + '</span>').join('') +
    (vs.length > 5 ? '<span class="vprod-chip neutro">+' + (vs.length - 5) + '</span>' : '');
  /* "Desde" solo si todas se cobran igual: mezclar precios por kilo con precios por
     unidad daría un "desde" que no significa nada. */
  const pesos = vs.filter(v => v.tipoVenta === 'peso'), unis = vs.filter(v => v.tipoVenta !== 'peso');
  const base = (pesos.length && !unis.length) ? pesos : (unis.length && !pesos.length) ? unis : [];
  const precios = base.map(v => precioDeVentaVariante(v, ctx)).filter(n => n > 0);
  const desde = precios.length
    ? '<div class="vprod-precio-alt">desde</div><div class="vprod-precio">$' + Math.min.apply(null, precios).toLocaleString('es-AR') +
      (pesos.length ? '<span style="font-size:0.68rem;color:var(--text-dim)">/kg</span>' : '') + '</div>'
    : '<div class="vprod-precio-alt">elegí</div>';
  return '<div class="vprod-row vprod-grupo" onclick="abrirVariantesVenta(\'' + _varAttr(pr.id) + '\',\'' + (ctx === 'may' ? 'may' : 'min') + '\')" title="Elegir la presentación">' +
    img +
    '<div style="min-width:0"><div class="vprod-nom">' + _varEsc(nombreDeGrupo(pr)) + '</div>' +
      '<div class="vprod-sub"><span class="vprod-chip ok">' + vs.length + ' variantes</span>' + chips + '</div></div>' +
    '<div class="vprod-precios">' + desde + '</div>' +
  '</div>';
}

/* El selector: una opción por variante, con su precio y su stock. */
function abrirVariantesVenta(principalId, ctx) {
  cerrarVariantesVenta();
  const prods = _varProds();
  const pr = prods.find(x => x && x.id === principalId);
  if (!pr) return;
  const may = ctx === 'may';
  /* Las escalas de granel van en UNA opción, "A granel": cuál se cobra sale de los
     gramos (admin-escalas.js). Si no hay otra cosa para elegir, directo a los gramos. */
  const esc = (typeof escalasDelGrupo === 'function') ? escalasDelGrupo(pr, prods) : [];
  const idsEsc = new Set(esc.map(e => e.id));
  const vs = variantesDeGrupo(pr, prods).filter(v => !idsEsc.has(v.id));
  if (esc.length && !vs.length) {
    if (typeof _agregarItemVenta === 'function') _agregarItemVenta(esc[0].id, may ? 'may' : 'min');
    return;
  }
  const opGranel = !esc.length ? '' :
    '<button type="button" class="var-op var-granel" data-id="' + _varAttr(esc[0].id) + '">' +
      '<span class="var-etq">A granel</span>' +
      '<span class="var-precio">' + esc.map((e, i) => (i ? 'desde ' + e.etiqueta + ' ' : '') + '$' +
        precioDeVentaVariante(e.producto, ctx).toLocaleString('es-AR')).join(' · ') + ' el kilo</span>' +
      '<span class="var-stock">' + _varStockTxt({ tipoVenta: 'peso', stock: esc.reduce((s, e) => s + Math.max(0, Number(e.producto.stock || 0)), 0) }) + '</span></button>';
  const ov = document.createElement('div');
  /* dlg-overlay: así el Escape de admin-atajos.js no cierra la venta de atrás. */
  ov.className = 'dlg-overlay';
  ov.id = 'variantesVenta';
  ov.style.zIndex = String(400 + (typeof _dlgAbiertos === 'number' ? _dlgAbiertos : 0));
  ov.innerHTML =
    '<div class="dlg-box var-box" role="dialog" aria-modal="true" aria-labelledby="varTit">' +
      '<div class="dlg-cab"><span class="dlg-ico"><i class="bi bi-stack"></i></span>' +
        '<h3 id="varTit">' + _varEsc(nombreDeGrupo(pr)) + '</h3></div>' +
      '<div class="dlg-msg"><p class="dlg-linea">Elegí la presentación:</p>' +
        vs.map(v => {
          const sin = Number(v.stock || 0) <= 0;
          return '<button type="button" class="var-op' + (sin ? ' sin-stock' : '') + '" data-id="' + _varAttr(v.id) + '">' +
            '<span class="var-etq">' + _varEsc(etiquetaVariante(v)) + (esCajaCerrada(v) ? ' <small class="var-caja">caja cerrada</small>' : '') + '</span>' +
            '<span class="var-precio">$' + precioDeVentaVariante(v, ctx).toLocaleString('es-AR') + (v.tipoVenta === 'peso' ? ' el kilo' : '') + '</span>' +
            '<span class="var-stock">' + _varStockTxt(v) + '</span></button>';
        }).join('') + opGranel +
      '</div>' +
      '<div class="dlg-pie"><button type="button" class="btn btn-secondary" id="varVolver">Volver</button></div>' +
    '</div>';
  document.body.appendChild(ov);
  if (typeof _dlgAbiertos === 'number') _dlgAbiertos++;
  ov.querySelectorAll('.var-op').forEach(b => b.addEventListener('click', () => {
    const id = b.getAttribute('data-id');
    cerrarVariantesVenta();
    if (typeof _agregarItemVenta === 'function') _agregarItemVenta(id, may ? 'may' : 'min');
  }));
  ov.querySelector('#varVolver').addEventListener('click', cerrarVariantesVenta);
  ov.addEventListener('mousedown', e => { if (e.target === ov) cerrarVariantesVenta(); });
  document.addEventListener('keydown', _varTecla, true);
  setTimeout(() => { const b = ov.querySelector('.var-op:not(.sin-stock)') || ov.querySelector('.var-op'); if (b) b.focus(); }, 30);
}

function _varTecla(e) {
  if (e.key === 'Escape' && document.getElementById('variantesVenta')) {
    e.preventDefault(); e.stopPropagation(); cerrarVariantesVenta();
  }
}

function cerrarVariantesVenta() {
  const ov = document.getElementById('variantesVenta');
  if (ov) {
    ov.remove();
    if (typeof _dlgAbiertos === 'number') _dlgAbiertos = Math.max(0, _dlgAbiertos - 1);
  }
  document.removeEventListener('keydown', _varTecla, true);
}

/* Si a una presentación le falta stock, la del mismo producto que la cubre: la más
   grande que entre justa. 160 g sin stock y 80 g con 2 o más -> 2 de 80 g. Cuenta lo
   que ya está en la venta. Solo entre las que se venden por unidad y en la misma
   medida (gramos con gramos, unidades con unidades). */
function sugerenciaPresentacion(p, enVenta, productos) {
  const prods = productos || _varProds();
  if (!p || p.tipoVenta === 'peso' || !tieneVariantes(p, prods)) return null;
  const c = contenidoDeVariante(p);
  if (!c) return null;
  const ya = enVenta || {};
  /* ya descuenta lo que la venta había tomado; el stock negativo no resta (_hayParaVenta). */
  if (Math.max(0, Number(p.stock || 0)) >= (ya[p.id] || 0) + 1) return null;
  const pr = principalDeVariante(p, prods);
  const opciones = variantesDeGrupo(pr, prods)
    .filter(v => v.id !== p.id && v.tipoVenta !== 'peso')
    .map(v => ({ v: v, c: contenidoDeVariante(v) }))
    .filter(x => x.c && x.c.unidad === c.unidad && x.c.valor < c.valor && c.valor % x.c.valor === 0)
    .map(x => ({ variante: x.v, cantidad: c.valor / x.c.valor }))
    .filter(x => Math.max(0, Number(x.variante.stock || 0)) - (ya[x.variante.id] || 0) >= x.cantidad)
    .sort((a, b) => a.cantidad - b.cantidad);
  return opciones[0] || null;
}

/* Lo que ya descontó del stock la venta que se está armando: la venta que se edita (se
   le devuelve al guardar) o el pedido web del que sale (la tienda ya lo descontó). Sin
   esto, al editar una venta lo suyo se contaba dos veces: "no hay stock" de algo que
   había, o una mezcla de bolsas que no existía (chequeo del 25/09). */
function stockYaTomadoPorVenta(ctx) {
  const orig = {};
  const sumar = items => (items || []).forEach(i => { if (i && i.id) orig[i.id] = (orig[i.id] || 0) + Number(i.cantidad || 0); });
  try {
    if (ctx === 'may') {
      if (typeof editingVentaMayId !== 'undefined' && editingVentaMayId && typeof ventasMayData !== 'undefined') {
        const v = ventasMayData.find(x => x.id === editingVentaMayId);
        if (v && v.stockDescontado) sumar(v.items);
      }
    } else if (typeof editingVentaId !== 'undefined' && editingVentaId) {
      if (typeof editingVentaOriginal !== 'undefined' && editingVentaOriginal && editingVentaOriginal.stockDescontado) sumar(editingVentaOriginal.items);
    } else if (typeof window !== 'undefined' && window._pedidoOrigenVentaId && typeof pedidosData !== 'undefined') {
      const ped = pedidosData.find(x => x && x.docId === window._pedidoOrigenVentaId);
      if (ped && ped.stockDescontado === true) sumar(ped.items);
    }
  } catch (e) { /* sin venta en edición: solo el stock */ }
  return orig;
}

/* VENDER MÁS DE LO QUE HAY. La venta del mostrador nunca miró el stock: se registraba
   igual y quedaba en negativo sin decir nada. Pedido del comercio (25/09/2026): con 1 en
   stock se vendieron 2 y no avisó; se agregó un aviso, con "Registrar igual". Y al otro
   día (26/09/2026): "que no me deje vender si no tengo stock suficiente". Ahora NO se
   puede: ni agregar más de lo que hay -los gramos, una unidad más, la cantidad de la
   línea-, ni registrar la venta si al guardar no alcanza (con el stock recién leído).
   Si el stock estaba mal cargado, se carga primero en Stock, con "Agregar stock".
   Y el 29/09/2026 (pedido del dueño): se vuelve a dejar vender, con un aviso que explica
   que el stock queda en negativo y que después hay que cargarlo. Ver FRENAR_VENTA_SIN_STOCK.
   No se mira si el negocio no descuenta stock, ni en una venta que sale de un pedido web
   que ya lo descontó: esa venta no descuenta nada. */
function _stockNoAplica(ctx) {
  if (typeof DESCONTAR_STOCK !== 'undefined' && !DESCONTAR_STOCK) return true;
  try {
    if (ctx !== 'may' && typeof window !== 'undefined' && window._pedidoOrigenVentaId && typeof pedidosData !== 'undefined') {
      const ped = pedidosData.find(x => x && x.docId === window._pedidoOrigenVentaId);
      if (ped && ped.stockDescontado === true) return true;
    }
  } catch (e) { /* sin pedido: se mira */ }
  return false;
}
/* Si el stock se mira en esta venta: lo contrario de _stockNoAplica. */
function stockSeMira(ctx) { return !_stockNoAplica(ctx); }
/* ¿SIN STOCK SUFICIENTE SE FRENA LA VENTA, O SE AVISA Y SE DEJA? Cambió dos veces: el
   25/09 avisaba y dejaba "Registrar igual"; el 26/09 el comercio pidió que no deje vender;
   el 29/09 el dueño pidió volver a dejar, con un aviso que diga que el stock queda en
   negativo y que después hay que cargarlo. Todo lo que frenaba pregunta acá: para volver a
   frenar alcanza con poner true (las pruebas del freno corren así). */
let FRENAR_VENTA_SIN_STOCK = false;
/* Si en esta venta, sin stock suficiente, NO se deja vender. */
function stockFrena(ctx) { return FRENAR_VENTA_SIN_STOCK === true && stockSeMira(ctx); }
/* Lo que hay de un producto para esta venta: lo que ella ya había tomado (una que se edita)
   más el stock que queda, si queda. Un stock en negativo no resta: si lo dejó así esta
   misma venta, editarla sin tocar las cantidades no se puede frenar. Antes era stock +
   tomado, y arreglar el medio de pago de una venta vieja la frenaba, y ni siquiera dejaba
   bajar la cantidad (revisión de código del 26/09). */
function _hayParaVenta(p, tomado) {
  return ((tomado && tomado[p.id]) || 0) + Math.max(0, Number(p.stock || 0));
}
/* Los productos de la venta que no alcanzan: { producto, hay, vende }. "Hay" cuenta lo que
   la venta ya había descontado (una que se edita). El granel con escalas también: cada
   renglón es de una bolsa y descuenta de esa bolsa. */
function faltantesDeStock(items, ctx) {
  const prods = _varProds();
  const tomado = stockYaTomadoPorVenta(ctx);
  const vende = {};
  (items || []).forEach(it => {
    if (!it || !it.id) return;
    vende[it.id] = (vende[it.id] || 0) + Number(it.cantidad || 0);
  });
  return Object.keys(vende).map(id => {
    const p = prods.find(x => x && x.id === id);
    if (!p) return null;
    const hay = _hayParaVenta(p, tomado);
    /* queda: el stock en que va a quedar (el de ahora, más lo que la venta ya había
       descontado, menos lo que vende). */
    return vende[id] > hay ? { producto: p, hay: hay, vende: vende[id],
      queda: Number(p.stock || 0) + ((tomado && tomado[id]) || 0) - vende[id] } : null;
  }).filter(Boolean);
}
/* "Maní RC x 80 g": con presentaciones, cuál es, con la misma forma que el nombre de las
   otras (_nombreConTam: "Maní RC x 160 g", "Alfajor x12"). Antes iba entre paréntesis, y
   "Maní Pelado (1 kg)" al lado de "Maní Pelado x 2 kg" parecían dos formas distintas
   (chequeo del dueño, 26/09). Sin presentaciones, el nombre que se pase (o el interno).
   Revisión del 27/09:
   - Con presentaciones va SIEMPRE el nombre interno, el de la línea de la venta: las otras
     no tienen nombre público, y con el del principal ("Maní Pelado Premium x 1 kg" arriba
     de "Maní Pelado x 2 kg") parecían dos productos.
   - El tamaño se agrega solo si el nombre no lo dice ya, comparando lo que miden y no el
     texto: "Harina x 25 Kg" con gramaje "25kg" salía "Harina x 25 Kg x 25kg".
   - Sin gramaje ni tamaño en el nombre no se agrega nada: etiquetaVariante devuelve el
     nombre, y salía "Nuez x Nuez mariposa". */
function _nombreConPresentacion(p, nombre) {
  if (!tieneVariantes(p, _varProds())) return nombre != null ? String(nombre) : (p.nombre || p.nombreMostrado || '');
  const n = p.nombre || p.nombreMostrado || '';
  const c = contenidoDeVariante(p);
  if (!p.gramaje && !c) return n;
  const dice = c ? contenidoDeVariante({ nombre: n }) : null;
  if (dice && dice.valor === c.valor && dice.unidad === c.unidad) return n;
  const e = String(etiquetaVariante(p) || '');
  return e && n.toLowerCase().indexOf(e.toLowerCase()) < 0 ? _nombreConTam(n, e) : n;
}
/* Los gramos de la bolsa, si es una bolsa de un granel con otras (una variante por peso
   que dice su tamaño): ahí el costo se carga por bolsa, como en "Costo y precio de cada
   bolsa", aunque se guarde por kilo. Si no, null: por kilo o por unidad, como siempre. Lo
   usan la ventana de costos (admin-costos.js) y el panel de la tabla (pedido del dueño, 27/09). */
function gramosDeBolsa(p, productos) {
  if (!p || p.tipoVenta !== 'peso' || p.depurado === true) return null;
  const prods = productos || _varProds();
  const pr = principalDeVariante(p, prods);
  if (!pr || pr.depurado === true) return null;
  if (variantesDeGrupo(pr, prods, { conOcultos: true }).filter(v => v.tipoVenta === 'peso').length < 2) return null;
  const c = contenidoDeVariante(p);
  return c && c.unidad === 'g' && c.valor > 0 ? c.valor : null;
}
/* El costo de la bolsa desde el del kilo, y al revés: UNA sola cuenta para la ventana de
   costos y la tabla, la misma del formulario (costo × gramos / 1000). Con dos cuentas
   distintas, la tabla y la ventana que abre mostraban $1 de diferencia (revisión del 27/09). */
function costoDeBolsa(costoKilo, gramos) { return Math.round(Number(costoKilo || 0) * gramos / 1000); }
function kiloDeBolsa(costoBolsa, gramos) { return Math.round(Number(costoBolsa || 0) * 1000 / gramos); }
/* La bolsa que dice el nombre de un granel suelto ("Lenteja x 5 kg"), en gramos, o null. Lo usan
   Cargar compra, la ventana de costos y la calculadora de la ficha. "1/2 kg" y "1.500 g" no se
   toman: contenidoDeVariante los lee como 2 kg y 2 g, y la bolsa se cargaba mal; así la compra
   pregunta (revisión del 01/10). "38/42 x 25 kg" (un calibre) y "x 22.680 kg" se leen bien. */
function bolsaDelNombre(nombre) {
  const n = String(nombre == null ? '' : nombre);
  if (/\d\s*\/\s*\d+\s*(?:kg|kilos?|g|gr|grs|gramos)\b/i.test(n) || /\d[.,]\d{3}\s*(?:g|gr|grs|gramos)\b/i.test(n)) return null;
  const c = contenidoDeVariante({ nombre: n });
  return c && c.unidad === 'g' && c.valor > 0 ? c.valor : null;
}
/* Lo que dice la línea de la venta: con el freno, que así no se puede; sin freno (29/09),
   que el stock va a quedar en negativo. */
function textoFaltaStock(f) {
  const hay = f.hay > 0 ? 'Solo hay ' + _cantConUnidad(f.producto, f.hay) + ' en stock' : 'Sin stock';
  if (!FRENAR_VENTA_SIN_STOCK) return hay + ': va a quedar en negativo';
  return hay + (f.hay > 0 ? ': así no se puede vender' : ': no se puede vender');
}
/* Cuánto hay de p para esta venta: su stock más lo que la venta ya había descontado (una
   que se edita), lo que ya está en la lista y lo que queda para agregar. null si el stock
   no se mira (_stockNoAplica): entonces no se frena nada. */
function stockParaVenta(p, lista, ctx) {
  if (!p || _stockNoAplica(ctx)) return null;
  const hay = _hayParaVenta(p, stockYaTomadoPorVenta(ctx));
  const ya = (lista || []).reduce((s, it) => s + (it && it.id === p.id ? Number(it.cantidad || 0) : 0), 0);
  return { hay: hay, ya: ya, queda: hay - ya };
}
/* "2,3 kg" o "3 unidades". */
function _cantConUnidad(p, x) {
  if (p && p.tipoVenta === 'peso') return typeof fmtPeso === 'function' ? fmtPeso(x) : x + ' g';
  return x + (Math.abs(x) === 1 ? ' unidad' : ' unidades');
}
/* El aviso de cuando no alcanza, con el texto que pidió el comercio (26/09/2026). hay: todo
   el stock que hay; ya: lo que ya está en esta venta. */
function textoStockInsuficiente(p, hay, ya) {
  const c = x => _cantConUnidad(p, x);
  const no = 'la venta NO se puede realizar debido a que no tenés stock suficiente.';
  if (hay <= 0) return 'STOCK INSUFICIENTE: no te queda STOCK RESTANTE de este producto, ' + no;
  const total = 'STOCK INSUFICIENTE: actualmente tenés en total ' + c(hay) + ' de STOCK RESTANTE';
  if (!(ya > 0)) return total + ', ' + no;
  if (ya >= hay) return total + ' y ya está todo en esta venta: ' + no;
  return total + ' y en esta venta ya hay ' + c(ya) + ', así que podés agregar hasta ' + c(hay - ya) + '. Con más, ' + no;
}
const _AYUDA_SIN_STOCK = 'Si te llegó mercadería y todavía no la cargaste, sumala en Stock con "Agregar stock" y volvé a intentar.';
/* stockParaVenta, pero si con el stock de la pantalla no alcanza para "cuanto", lo relee
   antes de frenar: el panel no se entera de lo que se cargó desde otra compu, y frenar con
   un stock viejo mandaba a "Agregar stock" algo que ya estaba, que se cargaba dos veces
   (revisión de código del 26/09). */
async function stockParaVentaFresco(p, lista, ctx, cuanto) {
  let sp = stockParaVenta(p, lista, ctx);
  if (sp && sp.queda < cuanto) { await _stockFresco([p.id]); sp = stockParaVenta(p, lista, ctx); }
  return sp;
}
/* Lo que necesita el diálogo de gramos para frenar (ver pedirCantidadPeso). recalcular:
   cómo volver a sacar la cuenta con el stock recién leído; el diálogo la usa la primera vez
   que frenaría, por lo mismo que stockParaVentaFresco. */
function frenoDeGramos(p, sp, recalcular) {
  if (!sp) return {};
  /* Sin freno (29/09): el diálogo deja agregar y avisa que el stock queda en negativo. */
  if (!FRENAR_VENTA_SIN_STOCK) return { stock: sp.queda, avisarNegativo: true };
  const o = { stock: sp.queda, bloquear: true, avisoSinStock: textoStockInsuficiente(p, sp.hay, sp.ya), ayudaSinStock: _AYUDA_SIN_STOCK };
  if (typeof recalcular === 'function') {
    o.refrescar = async () => {
      const n = await recalcular();
      return n ? { stock: n.queda, avisoSinStock: textoStockInsuficiente(p, n.hay, n.ya) } : null;
    };
  }
  return o;
}
/* El cartel que frena una unidad de más o una cantidad cambiada en la línea. */
function avisarSinStock(p, hay, ya, nombre) {
  const msg = (nombre || _nombreConPresentacion(p)) + _VAR_NL + _VAR_NL + '[x] ' + textoStockInsuficiente(p, hay, ya) +
    _VAR_NL + _VAR_NL + _AYUDA_SIN_STOCK;
  return typeof avisar === 'function'
    ? avisar(msg, { titulo: 'Stock insuficiente', icono: 'bi-x-octagon', aceptar: 'Entendido', alerta: true })
    : Promise.resolve(true);
}
/* El stock de ahora, no el de cuando se abrió el panel: otro puede haber vendido. Sin
   conexión, a los 1,5 segundos sigue con el que ya había. */
async function _stockFresco(ids) {
  if (typeof db === 'undefined' || !db || typeof db.collection !== 'function') return;
  const prods = _varProds();
  const espera = ms => new Promise(r => setTimeout(r, ms));
  await Promise.race([espera(1500), Promise.all(ids.map(async id => {
    try {
      const sn = await db.collection('productos').doc(id).get();
      const p = prods.find(x => x && x.id === id);
      if (sn && sn.exists && p) p.stock = Number((sn.data() || {}).stock || 0);
    } catch (e) { /* queda el que había */ }
  }))]);
}
/* El aviso de cuando se vende más de lo que hay (pedido del dueño, 29/09): qué no alcanza,
   en cuánto va a quedar el stock y qué hacer después. En palabras simples: lo lee la dueña
   en el mostrador. faltan: lo de faltantesDeStock. */
function mensajeVentaSinStock(faltan) {
  const uno = faltan.length === 1;
  const lineas = faltan.map(f => '- ' + _nombreConPresentacion(f.producto) + ': ' +
    (f.hay > 0 ? 'tenés ' + _cantConUnidad(f.producto, f.hay) : 'no te queda stock') +
    ' y estás vendiendo ' + _cantConUnidad(f.producto, f.vende) + '. Va a quedar en ' + _cantConUnidad(f.producto, f.queda) + '.');
  return '[!] Estás por vender más de lo que tenés en stock' + (uno ? '.' : ' de estos productos:') + _VAR_NL + _VAR_NL +
    lineas.join(_VAR_NL) + _VAR_NL + _VAR_NL +
    'Podés vender igual: la venta se registra y el stock ' + (uno ? 'de este producto' : 'de estos productos') + ' queda en negativo.' + _VAR_NL +
    'Cuando te llegue la mercadería, cargala en Stock con "Agregar stock" y el número vuelve a estar bien.';
}
/* true = registrar; false = volver a la venta. */
async function avisoStockInsuficiente(items, ctx) {
  if (_stockNoAplica(ctx)) return true;
  const ids = Array.from(new Set((items || []).filter(it => it && it.id).map(it => it.id)));
  if (!ids.length) return true;
  await _stockFresco(ids);
  const faltan = faltantesDeStock(items, ctx);
  if (!faltan.length) return true;
  /* Las líneas, con el stock recién leído: detrás del aviso se ve cuál no alcanza. */
  const repintar = ctx === 'may' ? (typeof renderVentaMayItems === 'function' ? renderVentaMayItems : null)
                                 : (typeof renderVentaItems === 'function' ? renderVentaItems : null);
  if (repintar) repintar();
  /* Sin freno (pedido del dueño, 29/09): "Vender igual" registra, y el stock queda en
     negativo hasta que se cargue lo que llegó. */
  if (!FRENAR_VENTA_SIN_STOCK) {
    if (typeof pedirConfirmacion !== 'function') return true;
    return pedirConfirmacion(mensajeVentaSinStock(faltan), { titulo: 'Stock insuficiente', icono: 'bi-exclamation-triangle',
      cuidado: true, aceptar: 'Vender igual', cancelar: 'Revisar la venta' });
  }
  /* Con el freno (26/09) no se registra: se dice qué no alcanza y qué hacer, con un solo botón. */
  const lineas = faltan.map(f => '- ' + _nombreConPresentacion(f.producto) + ': ' +
    (f.hay > 0 ? 'tenés ' + _cantConUnidad(f.producto, f.hay) : 'no tenés stock') + ' y estás vendiendo ' + _cantConUnidad(f.producto, f.vende) + '.');
  const msg = '[x] STOCK INSUFICIENTE: la venta NO se puede realizar debido a que no tenés stock suficiente ' +
    (faltan.length === 1 ? 'de este producto:' : 'de estos productos:') + _VAR_NL + _VAR_NL +
    lineas.join(_VAR_NL) + _VAR_NL + _VAR_NL +
    'Bajá la cantidad o sacalo de la venta. ' + _AYUDA_SIN_STOCK;
  if (typeof avisar === 'function') await avisar(msg, { titulo: 'Stock insuficiente', icono: 'bi-x-octagon', aceptar: 'Entendido', alerta: true });
  return false;
}

/* Con el freno (26/09), cambiar la cantidad en la línea de la venta tampoco pasa lo que hay:
   se vuelve a la de antes y se dice por qué. Sin freno (29/09) se cambia como siempre, y la
   línea dice que el stock queda en negativo. El granel con escalas lo mira admin-escalas.js
   (cambiarGramosGranel), que envuelve esto mismo después. */
(function () {
  if (typeof window === 'undefined') return;
  [['updateVentaQty', 'min'], ['updateVentaMayQty', 'may']].forEach(([nombre, ctx]) => {
    const orig = window[nombre];
    if (typeof orig !== 'function') return;
    window[nombre] = async function (id, val) {
      if (!stockFrena(ctx)) return orig.apply(this, arguments);
      const lista = ctx === 'may' ? (typeof ventaMayItems !== 'undefined' ? ventaMayItems : []) : (typeof ventaItems !== 'undefined' ? ventaItems : []);
      const p = _varProds().find(x => x && x.id === id);
      const n = Math.max(1, parseInt(val, 10) || 1);
      const sp = p ? await stockParaVentaFresco(p, (lista || []).filter(it => it && it.id !== id), ctx, n) : null;
      if (sp && n > sp.queda) {
        const repintar = ctx === 'may' ? (typeof renderVentaMayItems === 'function' ? renderVentaMayItems : null)
                                       : (typeof renderVentaItems === 'function' ? renderVentaItems : null);
        if (repintar) repintar();
        await avisarSinStock(p, sp.hay, sp.ya);
        return;
      }
      return orig.apply(this, arguments);
    };
  });
})();

/* Registrar la venta, de a una. Antes de deshabilitar el botón, saveVenta relee el stock
   (avisoStockInsuficiente, hasta 1,5 s): un doble clic -o dos Enter en la venta rápida- en
   ese rato registraba la venta dos veces y descontaba el stock dos veces (revisión de
   código del 26/09). Mientras una está en curso, las otras llamadas no hacen nada. */
(function () {
  if (typeof window === 'undefined') return;
  ['saveVenta', 'saveVentaMay'].forEach(nombre => {
    const orig = window[nombre];
    if (typeof orig !== 'function') return;
    let enCurso = false;
    window[nombre] = async function () {
      if (enCurso) return;
      enCurso = true;
      try { return await orig.apply(this, arguments); } finally { enCurso = false; }
    };
  });
})();

/* Lo que ve el que cobra. Devuelve 'seguir' (agregar la pedida como siempre), 'hecho'
   (se agregó la otra) o 'cancelar' (cerró el aviso sin elegir: no se agrega nada). */
async function sugerirPresentacion(p, lista, ctx) {
  const enVenta = {};
  (lista || []).forEach(it => { if (it && it.id) enVenta[it.id] = (enVenta[it.id] || 0) + Number(it.cantidad || 0); });
  /* Lo que la venta ya había descontado (una que se edita, un pedido web) no cuenta dos veces. */
  const tomado = stockYaTomadoPorVenta(ctx);
  Object.keys(tomado).forEach(id => { enVenta[id] = (enVenta[id] || 0) - tomado[id]; });
  const s = sugerenciaPresentacion(p, enVenta, _varProds());
  if (!s || typeof pedirOpcion !== 'function') return 'seguir';
  const may = ctx === 'may';
  const orig = may ? (typeof _origAddVentaMayItem === 'function' ? _origAddVentaMayItem : null)
                   : (typeof _origAddVentaItem === 'function' ? _origAddVentaItem : null);
  if (!orig) return 'seguir';
  const quedan = Math.max(0, Number(p.stock || 0) - (enVenta[p.id] || 0));
  const pu = precioDeVentaVariante(s.variante, ctx);
  /* Si lo que falta es una caja cerrada, se dice cuánto salía: lo que se ofrece va a
     precio normal y puede salir más caro (chequeo del 25/09). */
  const caja = esCajaCerrada(p);
  /* Con el freno (26/09) no se ofrece agregar la pedida igual. Sin freno (29/09) sí, y se
     dice que su stock queda en negativo (si el negocio descuenta stock). */
  const frena = stockFrena(ctx);
  const negativo = !frena && stockSeMira(ctx);
  const msg = 'No hay stock de ' + (p.nombreMostrado || p.nombre) + (quedan ? ' (quedan ' + quedan + ').' : '.') +
    (frena ? ' Sin stock no se puede vender.' : '') +
    (negativo ? ' Si agregás la de ' + etiquetaVariante(p) + ' igual, su stock va a quedar en negativo.' : '') +
    (caja ? ' Es una caja cerrada: salía $' + precioDeVentaVariante(p, ctx).toLocaleString('es-AR') + '.' : '') + _VAR_NL + _VAR_NL +
    '¿Agregar ' + s.cantidad + ' de ' + etiquetaVariante(s.variante) + ' en su lugar? Cada una a su precio: $' +
    pu.toLocaleString('es-AR') + ', en total $' + (pu * s.cantidad).toLocaleString('es-AR') + '.';
  const r = await pedirOpcion(msg, {
    titulo: 'Otra presentación',
    icono: 'bi-stack',
    opciones: [
      { valor: 'otra', texto: 'Agregar ' + s.cantidad + ' de ' + etiquetaVariante(s.variante), principal: true },
      frena ? { valor: 'no', texto: 'Cancelar' } : { valor: 'igual', texto: 'Agregar la de ' + etiquetaVariante(p) + ' igual' },
    ],
  });
  if (r === 'igual') return 'seguir';
  if (r !== 'otra') return 'cancelar';
  for (let i = 0; i < s.cantidad; i++) orig(s.variante.id);
  return 'hecho';
}

/* ------------------------------------------------------ EN EL FORMULARIO
   La sección "Bolsas y precios por cantidad" (por peso) o "Presentaciones" (por
   unidad), debajo del precio mayorista. Cada tamaño es una fila con su costo, su
   ganancia, su mayorista y su stock, y se carga ahí mismo -también en un producto
   nuevo, antes de guardarlo-. Al guardar el producto se crean o se actualizan
   (guardarVariantesForm). Cada fila es un producto por dentro, con su código y su
   etiqueta, que se arman solos.

   Pedido del comercio (25/09/2026): la etapa 1 las cargaba de a una, guardando primero
   el producto y abriendo "+ Nueva variante", otro formulario entero. No era lo que se
   había pedido. Ese camino sigue, para una presentación con otro nombre, foto o código
   de barras (nuevaVariante). */

function _varEsPeso() { return typeof _tipoVentaProd !== 'undefined' && _tipoVentaProd === 'peso'; }
function _varMonto(v) {
  if (typeof montoAR === 'function') return montoAR(v);
  const l = String(v == null ? '' : v).replace(/[^0-9]/g, '');
  return l ? parseInt(l, 10) : 0;
}
function _varMay(n) { return typeof _redondearMayorista === 'function' ? _redondearMayorista(n) : (n ? Math.ceil(n / 50) * 50 : 0); }
/* El nombre de una variante: "Maní" y "160 g" dan "Maní x 160 g"; "Alfajor" y "x12",
   "Alfajor x12" (no "Alfajor x x12", que salía en el chequeo del 25/09). */
function _nombreConTam(base, tam) {
  const t = String(tam || '').trim();
  return /^x\s*\d/i.test(t) ? base + ' ' + t : base + ' x ' + t;
}
function _varPrincipalActual() { return (typeof editingId !== 'undefined' && editingId) ? editingId : null; }

/* EL TAMAÑO: en el campo va solo el número, y la unidad al lado. En una bolsa es kg
   ("2" es 2 kg; 0,5 es medio kilo); en una presentación se elige: g, kg, ml, l o
   unidades (x12). Pedido del comercio: dejaba escribir "1 wd". Lo que se guarda es la
   etiqueta de siempre ("3 kg", "160 g", "x12"), que es la que lee todo lo demás. */
const _UNIDADES_TAM = [['kg', /^(kg|kgs|kilos?)$/], ['g', /^(g|gr|grs|gramos?)$/], ['l', /^(l|lt|lts|litros?)$/],
  ['ml', /^(ml|cc)$/], ['u', /^(u|un|unid|unidades)$/]];
function _tamPartes(texto, peso) {
  const s = String(texto || '').trim().toLowerCase();
  let m = s.match(/(\d+(?:[.,]\d+)?)\s*([a-z]+)/);
  let num = null, uni = null;
  if (m) { const u = _UNIDADES_TAM.find(x => x[1].test(m[2])); if (u) { num = m[1]; uni = u[0]; } }
  if (!uni && (m = s.match(/(?:^|\s)x\s*(\d+)\b/))) { num = m[1]; uni = 'u'; }
  if (!uni && (m = s.match(/^(\d+(?:[.,]\d+)?)$/))) { num = m[1]; uni = peso ? 'kg' : 'g'; }
  if (!uni) return { num: '', uni: peso ? 'kg' : 'g' };
  num = num.replace('.', ',');
  if (peso && uni === 'g') { num = String(parseFloat(num.replace(',', '.')) / 1000).replace('.', ','); uni = 'kg'; }
  if (peso && uni !== 'kg') return { num: '', uni: 'kg' };
  return { num: num, uni: uni };
}
function _tamTexto(num, uni) {
  const n = String(num || '').trim();
  if (!n || !(parseFloat(n.replace(',', '.')) > 0)) return '';
  return uni === 'u' ? 'x' + n : n + ' ' + uni;
}
/* Solo números, con una coma: hasta 4 cifras y 3 decimales (0,25 kg). */
function limpiarNumeroTam(inp) {
  if (!inp) return;
  const antes = String(inp.value == null ? '' : inp.value);
  const v = antes.replace(/\./g, ',').replace(/[^0-9,]/g, '');
  const i = v.indexOf(',');
  const ent = (i < 0 ? v : v.slice(0, i)).slice(0, 4);
  const dec = i < 0 ? null : v.slice(i + 1).replace(/,/g, '').slice(0, 3);
  const limpio = dec === null ? ent : ent + ',' + dec;
  if (limpio !== antes) inp.value = limpio;
}
function _tamWidgetHtml(texto, peso, alCambiar, placeholder, idAttr) {
  const p = _tamPartes(texto, peso);
  const input = '<input type="text" inputmode="decimal" class="form-input"' + (idAttr || '') +
    ' value="' + _varAttr(p.num) + '" placeholder="' + placeholder + '" oninput="limpiarNumeroTam(this);' + alCambiar + '">';
  const unidad = peso
    ? '<span class="vfe-unidad">kg</span>'
    : '<select class="vfe-unisel" onchange="' + alCambiar + '">' + ['g', 'kg', 'ml', 'l', 'u'].map(u =>
      '<option value="' + u + '"' + (u === p.uni ? ' selected' : '') + '>' + (u === 'u' ? 'un.' : u) + '</option>').join('') + '</select>';
  return '<div class="vfe-tamw">' + input + unidad + '</div>';
}
/* La etiqueta que arman el número y la unidad de un campo de tamaño. */
function _tamDeWidget(el) {
  const w = el && el.closest ? el.closest('.vfe-tamw') : null;
  if (!w) return '';
  const inp = w.querySelector('input'), sel = w.querySelector('select');
  return _tamTexto(inp ? inp.value : '', sel ? sel.value : 'kg');
}
function varFilaTam(i, el) { varFilaCambio(i, 'tam', _tamDeWidget(el)); }

/* Las filas del producto que se abrió: los tamaños que ya tiene, con la misma forma de
   venta. Lo que se escriba en el formulario queda acá hasta guardar. */
function iniciarVariantesForm(p, pesoForm) {
  window._varHijo = (p && p.gramajePadreId) ? p : null;
  window._varFilas = [];
  window._varFilasPeso = null;
  if (p && p.gramajePadreId) return;
  /* De qué forma de venta son las filas: si cambia en el formulario se arman de nuevo
     (ver el envoltorio de setTipoVenta, más abajo). */
  const peso = pesoForm != null ? !!pesoForm : (p ? p.tipoVenta === 'peso' : _varEsPeso());
  window._varFilasPeso = peso;
  if (!p) return;
  _varProds().filter(x => x && x.gramajePadreId === p.id && x.depurado !== true && (x.tipoVenta === 'peso') === peso)
    .sort(_ordenVariantes)
    .forEach(v => {
      const c = contenidoDeVariante(v);
      const costo = Number(v.costo || 0);
      window._varFilas.push({
        id: v.id,
        tam: v.gramaje || etiquetaVariante(v),
        tamAntes: v.gramaje || '',
        /* En los de peso se muestra lo que sale la bolsa: el costo guardado es por kilo. */
        costoIn: String(peso && c && c.unidad === 'g' ? Math.round(costo * c.valor / 1000) : costo),
        pct: Number(v.porcentaje || 0),
        pctMay: Number(v.porcentajeMayorista || 0),
        stock: Number(v.stock || 0),
        dsc: Number(v.descuento || 0),
        oculto: v.oculto === true,
        caja: v.cajaCerrada === true,
        tocado: {},
      });
    });
}

/* El costo por kilo (o por unidad) y los precios de una fila, como los calcula el
   formulario: la misma cuenta que saveProduct. */
function _calcFilaVar(f, peso) {
  const c = contenidoDeVariante({ gramaje: f.tam });
  const monto = _varMonto(f.costoIn);
  let costo = null;
  if (peso) { if (c && c.unidad === 'g' && c.valor > 0 && monto > 0) costo = Math.round(monto * 1000 / c.valor); }
  else if (monto > 0) costo = monto;
  if (costo === null) return { costo: null, c: c };
  const pct = Number(f.pct) || 0, pctMay = Number(f.pctMay) || 0;
  /* Con el % mayorista en 0, sin precio mayorista (01/10): ver preciosDesdeCosto, admin-costos.js. */
  return { costo: costo, c: c, precio: Math.round(costo * (1 + pct / 100)), may: pctMay > 0 ? _varMay(Math.round(costo * (1 + pctMay / 100))) : 0 };
}

function _resFilaVar(r, peso, caja, dsc) {
  if (r.costo === null) {
    const sinTam = !r.c || (peso && r.c.unidad !== 'g');
    return '<span class="vfe-falta">' + (sinTam ? (peso ? 'Poné de cuánto es la bolsa.' : 'Poné el tamaño.') : 'Poné el costo.') + '</span>';
  }
  /* Con descuento (una oferta), lo que paga el cliente: sobre el precio que se cobra. */
  const d = _varDsc(dsc);
  const oferta = base => (d > 0 ? '<span class="vfe-oferta">Con el ' + d + '% de descuento: $' +
    Math.round(base * (1 - d / 100)).toLocaleString('es-AR') + (peso ? ' el kilo' : '') + '</span>' : '');
  /* Una caja cerrada se cobra al mayorista: eso es lo que se dice primero. Sin precio
     mayorista no (01/10): guardarla así no se deja. */
  if (caja && !peso && r.may > 0) {
    return '<span>Se cobra <b>$' + r.may.toLocaleString('es-AR') + '</b> (caja cerrada, precio mayorista)</span>' +
      oferta(r.may) + '<span>Precio de lista $' + r.precio.toLocaleString('es-AR') + '</span>';
  }
  const kg = peso ? ' el kilo' : '';
  /* Sin % mayorista no hay precio mayorista: la venta mayorista cobra el de mostrador. Se dice
     así, no "Mayorista $0" (01/10). */
  return (peso ? '<span>Costo $' + r.costo.toLocaleString('es-AR') + ' el kilo</span>' : '') +
    '<span>Precio <b>$' + r.precio.toLocaleString('es-AR') + '</b>' + kg + '</span>' + oferta(r.precio) +
    '<span class="vfe-may">' + (r.may > 0 ? 'Mayorista $' + r.may.toLocaleString('es-AR') + kg : 'Sin mayorista: se cobra el de mostrador') + '</span>';
}
/* La fecha del último cambio de costo de un tamaño, debajo de su fila. Con varios
   tamaños la de arriba (pCostoFecha, admin-costos.js) queda escondida con "Costo y
   precio", y sin esto no había forma de ver que un costo estaba viejo hasta vender.
   Desactualizado (30 días o más), en amarillo: es el mismo aviso que sale al vender. */
function _fechaCostoHtml(p) {
  if (!p || typeof fechaDeCosto !== 'function') return '';
  const f = fechaDeCosto(p);
  if (!f) return '';
  const dias = Math.floor((Date.now() - f.getTime()) / 86400000);
  const vieja = typeof COSTO_VIEJO_DIAS === 'number' && dias >= COSTO_VIEJO_DIAS;
  const fecha = typeof _costoFechaTxt === 'function' ? _costoFechaTxt(f) : f.toLocaleDateString('es-AR');
  const hace = typeof _costoHace === 'function' ? _costoHace(dias) : 'hace ' + dias + ' días';
  return '<p class="vfe-nota vfe-fecha' + (vieja ? ' vfe-vieja' : '') + '">Último cambio de costo: ' + fecha + ' (' + hace + ')' +
    (vieja ? '. Desactualizado: al venderlo se va a avisar.' : '.') + '</p>';
}
/* Si se escribe un costo, lo que decía la fecha ya no vale: se registra al guardar. */
function _fechaCostoTocada(fila) {
  const n = fila && fila.querySelector ? fila.querySelector('.vfe-fecha') : null;
  if (!n) return;
  n.className = 'vfe-nota vfe-fecha';
  n.textContent = 'El costo cambió: la fecha se registra al guardar.';
}

/* El descuento de una fila: de 0 a 100, entero, como el del formulario. */
function _varDsc(v) { return Math.min(100, Math.max(0, parseInt(v, 10) || 0)); }
function _varLimpiarDsc(inp) {
  if (!inp) return;
  let v = String(inp.value == null ? '' : inp.value).replace(/[^0-9]/g, '').slice(0, 3);
  if (v && Number(v) > 100) v = '100';
  if (v !== inp.value) inp.value = v;
}
/* Los tres porcentajes de una fila: ganancia, mayorista y descuento. */
function _pctsFilaHtml(f, ev) {
  return '<label class="vfe-campo vfe-pct"><span>% ganancia</span><input type="text" inputmode="decimal" class="form-input" value="' + _varAttr(f.pct) +
      '" oninput="if(typeof limpiarPorcentaje===\'function\')limpiarPorcentaje(this);' + ev('pct') + '"></label>' +
    '<label class="vfe-campo vfe-pctmay"><span>% mayorista</span><input type="text" inputmode="decimal" class="form-input" value="' + _varAttr(f.pctMay) +
      '" oninput="if(typeof limpiarPorcentaje===\'function\')limpiarPorcentaje(this);' + ev('pctMay') + '"></label>' +
    '<label class="vfe-campo vfe-dsc"><span>% oferta</span><input type="text" inputmode="numeric" class="form-input" value="' + _varAttr(f.dsc || 0) +
      '" oninput="_varLimpiarDsc(this);' + ev('dsc') + '"></label>';
}

function _filaVarHtml(f, i, peso) {
  const ev = campo => 'varFilaCambio(' + i + ',\'' + campo + '\',this.value)';
  return '<div class="vfe" data-i="' + i + '">' +
    '<div class="vfe-fila">' +
      '<label class="vfe-campo vfe-tam"><span>' + (peso ? 'Bolsa de' : 'Tamaño') + '</span>' +
        _tamWidgetHtml(f.tam, peso, 'varFilaTam(' + i + ',this)', peso ? 'ej. 3' : 'ej. 160') + '</label>' +
      '<label class="vfe-campo vfe-costo"><span>' + (peso ? 'Costo de la bolsa' : 'Costo') + '</span>' +
        '<input type="text" inputmode="numeric" class="form-input" value="' + _varAttr(f.costoIn) + '" oninput="if(typeof limpiarMonto===\'function\')limpiarMonto(this);' + ev('costoIn') + '"></label>' +
      '<label class="vfe-campo vfe-stock"><span>Stock' + (peso ? ' (gramos)' : ' (unitario)') + '</span>' +
        '<input type="number" class="form-input" value="' + _varAttr(f.stock) + '" step="1" oninput="' + ev('stock') + '"></label>' +
      (f.id
        ? '<button type="button" class="vfe-btn" title="Abrir su ficha (lo que no guardaste acá se pierde)" onclick="closeModal();openModal(\'' + _varAttr(f.id) + '\')"><i class="bi bi-box-arrow-up-right"></i></button>'
        : '<button type="button" class="vfe-btn" title="Quitar" onclick="varFilaQuitar(' + i + ')"><i class="bi bi-x-lg"></i></button>') +
    '</div>' +
    /* Hasta 999%: ver limpiarPorcentaje en admin.html. */
    '<div class="vfe-fila">' + _pctsFilaHtml(f, ev) +
      '<div class="vfe-res">' + _resFilaVar(_calcFilaVar(f, peso), peso, f.caja, f.dsc) + '</div>' +
    '</div>' +
    (peso ? '' : _cajaHtml(f.caja, 'varFilaCambio(' + i + ',\'caja\',this.checked)')) +
    (f.oculto ? '<p class="vfe-nota">Oculta: no aparece en la venta ni en la tienda.</p>' : '') +
    (f.id ? _fechaCostoHtml(_varProds().find(x => x && x.id === f.id)) : '') +
  '</div>';
}

/* ------------------------------------------ LA PRIMERA FILA: ESTE PRODUCTO
   Pedido del comercio (25/09/2026): "Este producto es la bolsa de ___ kg" no se
   entendía. La bolsa de 1 kg se cargaba como una fila más y al guardar decía "Hay dos
   del mismo tamaño". Y con la primera fila y los campos de arriba a la vista a la vez,
   tampoco: unos se copiaban y otros no. Ahora, con más de un tamaño, la tabla es el
   ÚNICO lugar donde se cargan (ver pintarModoTamanos): la primera fila es este
   producto, y por dentro escribe en los campos de siempre (Gramaje / Presentación,
   Costo, Stock, % ganancia, % mayorista, Descuento y la caja cerrada), que quedan
   escondidos. Así saveProduct lo guarda como siempre. */

/* Pone un valor en un campo de arriba y avisa como si se hubiera escrito ahí: su
   oninput recalcula los precios. */
function _varPonerArriba(id, valor) {
  const e = document.getElementById(id);
  if (!e) return;
  e.value = valor;
  window._varPpalEscribiendo = true;
  try { e.dispatchEvent(new Event('input', { bubbles: true })); } finally { window._varPpalEscribiendo = false; }
}

/* Lo que muestra la primera fila, leído de arriba. En una bolsa el costo es el de la
   bolsa (el del kilo por su tamaño); si se escribió en la fila, se muestra ese: con el
   redondeo del kilo, $1.000 la bolsa de 3 kg volvería como $999. */
function _valoresPpal(peso) {
  const val = id => { const e = document.getElementById(id); return e && e.value != null ? String(e.value) : ''; };
  const tam = val('pGramaje');
  const costo = _varMonto(val('pCosto'));
  const c = contenidoDeVariante({ gramaje: tam });
  const bolsaOk = !!(c && c.unidad === 'g' && c.valor > 0);
  let costoIn = '';
  if (!peso) costoIn = costo > 0 ? String(costo) : '';
  else {
    const escrito = _varMonto(window._varPpalBolsa);
    if (escrito > 0 && (!bolsaOk || Math.round(escrito * 1000 / c.valor) === costo)) costoIn = String(escrito);
    else if (bolsaOk && costo > 0) costoIn = String(Math.round(costo * c.valor / 1000));
  }
  const pct = val('pPorcentaje'), pctMay = val('pPorcentajeMay');
  const cb = document.getElementById('pCajaCerrada');
  const listo = costo > 0 && (!peso || bolsaOk);
  return {
    tam: tam, costoIn: costoIn, stock: val('pStock'), pct: pct, pctMay: pctMay, dsc: val('pDescuento'),
    caja: !!(cb && cb.checked), costoKg: costo, bolsaOk: bolsaOk,
    r: listo
      ? { costo: costo, c: c, precio: Math.round(costo * (1 + (Number(pct) || 0) / 100)),
          may: (Number(pctMay) || 0) > 0 ? _varMay(Math.round(costo * (1 + (Number(pctMay) || 0) / 100))) : 0 }
      : { costo: null, c: (peso && !bolsaOk) ? null : c },
  };
}
/* Lo que dice la primera fila. Si ya hay costo por kilo pero falta el tamaño de la
   bolsa (se cargó el producto como siempre y después se agregó otra bolsa), se dice. */
function _resPpal(v, peso) {
  if (peso && !v.bolsaOk && v.costoKg > 0) {
    return '<span class="vfe-falta">Tenés $' + v.costoKg.toLocaleString('es-AR') + ' el kilo: poné de cuánto es esta bolsa.</span>';
  }
  return _resFilaVar(v.r, peso, v.caja, v.dsc);
}

function _filaPpalHtml(peso) {
  const v = _valoresPpal(peso);
  const ev = campo => 'varPpalCambio(\'' + campo + '\',this)';
  return '<div class="vfe vfe-ppal">' +
    '<div class="vfe-fila">' +
      '<label class="vfe-campo vfe-tam"><span>' + (peso ? 'Bolsa de' : 'Tamaño') + '</span>' +
        _tamWidgetHtml(v.tam, peso, 'varTamPrincipal(this)', peso ? 'ej. 1' : 'ej. 80', ' id="pVarTam"') + '</label>' +
      '<label class="vfe-campo vfe-costo"><span>' + (peso ? 'Costo de la bolsa' : 'Costo') + '</span>' +
        '<input type="text" inputmode="numeric" class="form-input" value="' + _varAttr(v.costoIn) +
        '" oninput="if(typeof limpiarMonto===\'function\')limpiarMonto(this);' + ev('costoIn') + '"></label>' +
      '<label class="vfe-campo vfe-stock"><span>Stock' + (peso ? ' (gramos)' : ' (unitario)') + '</span>' +
        '<input type="number" class="form-input" value="' + _varAttr(v.stock) + '" step="1" oninput="' + ev('stock') + '"></label>' +
      '<span class="vfe-hueco"></span>' +
    '</div>' +
    '<div class="vfe-fila">' + _pctsFilaHtml(v, ev) +
      '<div class="vfe-res">' + _resPpal(v, peso) + '</div>' +
    '</div>' +
    (peso ? '' : _cajaHtml(v.caja, ev('caja'))) +
    _fechaCostoHtml(_varProds().find(x => x && x.id === _varPrincipalActual())) +
  '</div>';
}

/* Escribir en la primera fila es escribir arriba. En una bolsa, lo que costó la bolsa
   se pasa a costo por kilo con su tamaño; sin tamaño todavía, queda esperando. */
function varPpalCambio(campo, el) {
  const peso = _varEsPeso();
  if (campo === 'costoIn') _fechaCostoTocada(document.querySelector('#pVariantes .vfe-ppal'));
  if (campo === 'costoIn') {
    const monto = _varMonto(el.value);
    if (!peso) _varPonerArriba('pCosto', monto > 0 ? String(monto) : '');
    else {
      window._varPpalBolsa = monto > 0 ? String(monto) : null;
      const g = document.getElementById('pGramaje');
      const c = contenidoDeVariante({ gramaje: g ? g.value : '' });
      if (c && c.unidad === 'g' && c.valor > 0) _varPonerArriba('pCosto', monto > 0 ? String(Math.round(monto * 1000 / c.valor)) : '');
    }
  } else if (campo === 'stock') _varPonerArriba('pStock', el.value);
  else if (campo === 'pct') _varPonerArriba('pPorcentaje', el.value);
  else if (campo === 'pctMay') _varPonerArriba('pPorcentajeMay', el.value);
  else if (campo === 'dsc') _varPonerArriba('pDescuento', el.value);
  else if (campo === 'caja') {
    const cb = document.getElementById('pCajaCerrada');
    if (cb) { cb.checked = !!el.checked; if (typeof pintarCajaCerrada === 'function') pintarCajaCerrada(); }
  }
  pintarFilaPpal();
}

/* Y lo que se escribe arriba aparece en la primera fila (menos en el campo que se está
   escribiendo, para no mover el cursor). */
function pintarFilaPpal() {
  const fila = document.querySelector('#pVariantes .vfe-ppal');
  if (!fila) return;
  const peso = _varEsPeso();
  const v = _valoresPpal(peso);
  const poner = (sel, valor) => {
    const e = fila.querySelector(sel);
    if (e && document.activeElement !== e && String(e.value) !== String(valor)) e.value = valor;
  };
  poner('.vfe-costo input', v.costoIn);
  poner('.vfe-stock input', v.stock);
  poner('.vfe-pct input', v.pct);
  poner('.vfe-pctmay input', v.pctMay);
  poner('.vfe-dsc input', v.dsc);
  const cb = fila.querySelector('.vfe-caja input');
  if (cb) cb.checked = v.caja;
  const res = fila.querySelector('.vfe-res');
  if (res) res.innerHTML = _resPpal(v, peso);
}

function pintarVariantesForm() {
  _pintarVariantes();
  pintarModoTamanos();
  /* Con la tabla a la vista, lo que costó la bolsa de este producto va en su primera
     fila: la calculadora de la bolsa de arriba no va (admin-escalas.js). */
  if (typeof pintarCostoBolsa === 'function') pintarCostoBolsa();
}

/* EL MODO TAMAÑOS. Con un solo tamaño, el formulario de siempre, y abajo el botón para
   agregar otra bolsa (o presentación). Con más de uno, la tabla tiene TODO lo de cada
   tamaño -también el de este producto, en la primera fila- y se esconde lo de arriba
   que es de un tamaño: Gramaje / Presentación, Stock, Costo y precio, y Precio
   mayorista. Pedido del comercio (25/09/2026): con los dos a la vista no se entendía
   cuál mandaba. */
function enModoTamanos() {
  return !!((window._varFilas || []).length && !window._varHijo && !window._varianteDeNueva);
}
function pintarModoTamanos() {
  const modo = enModoTamanos();
  ['pGramajeWrap', 'pStockWrap', 'pCostoSec', 'pMayoristaSec'].forEach(id => {
    const e = document.getElementById(id);
    if (e && e.style) e.style.display = modo ? 'none' : '';
  });
  /* El costo es obligatorio, pero escondido el navegador no puede marcarlo y "Guardar"
     no haría nada. Con la tabla lo revisa faltaPresentacionDeVariante. */
  const c = document.getElementById('pCosto');
  if (c) c.required = !modo;
  /* "Cómo se vende y stock": con la tabla, el stock va en cada fila. */
  const sw = document.getElementById('pStockWrap');
  const sec = sw && sw.closest ? sw.closest('.precio-section') : null;
  const tt = sec ? sec.querySelector('.precio-section-title') : null;
  const texto = tt && tt.childNodes ? Array.prototype.slice.call(tt.childNodes).reverse().find(x => x.nodeType === 3) : null;
  if (texto) texto.textContent = modo ? ' Cómo se vende' : ' Cómo se vende y stock';
}

function _pintarVariantes() {
  const el = document.getElementById('pVariantes');
  if (!el) return;
  const peso = _varEsPeso();
  const tit = document.getElementById('pVariantesTitulo');
  if (tit) tit.textContent = peso ? 'Bolsas y precios por cantidad' : 'Presentaciones';
  const prods = _varProds();
  if (window._varianteDeNueva) {
    const pr = prods.find(x => x && x.id === window._varianteDeNueva);
    el.innerHTML = '<p class="var-ayuda">Nueva variante de <b>' + _varEsc(nombreDeGrupo(pr)) + '</b>. ' +
      'Poné arriba, en <b>Gramaje / Presentación</b>, lo que la distingue: 160 g, 3 kg, x12.</p>';
    return;
  }
  const hijo = window._varHijo;
  if (hijo) {
    const pr = principalDeVariante(hijo, prods);
    el.innerHTML = '<p class="var-ayuda">Es ' + (peso ? 'la bolsa' : 'la presentación') + ' de <b>' + _varEsc(etiquetaVariante(hijo)) +
      '</b> de <b>' + _varEsc(nombreDeGrupo(pr)) + '</b>. Las otras se cargan desde el producto principal.</p>' +
      '<button type="button" class="btn btn-secondary btn-sm var-nueva" onclick="closeModal();openModal(\'' + _varAttr(pr.id) + '\')">' +
      '<i class="bi bi-box-arrow-up-right"></i> Ir al producto principal</button>';
    return;
  }
  const filas = window._varFilas || [];
  let h;
  if (filas.length) {
    /* Varios tamaños: la tabla con todos, este producto primero. */
    if (tit) tit.textContent = peso ? 'Costo y precio de cada bolsa' : 'Costo y precio de cada presentación';
    h = '<p class="var-ayuda">' + (peso
      ? 'Cada bolsa con lo que te costó, su ganancia y su stock. Al vender, el precio sale solo de la cantidad: con 3 kg o más se cobra el de la bolsa de 3 kg.'
      : 'Cada presentación con su costo, su ganancia y su stock. En la venta y en la tienda se ven como un solo producto.') + '</p>' +
      (peso ? ayudaRedondeoLineaHtml() : '');
    h += '<div class="var-filas">' + _filaPpalHtml(peso) + filas.map((f, i) => _filaVarHtml(f, i, peso)).join('') + '</div>';
    h += '<button type="button" class="btn btn-secondary btn-sm var-agregar" onclick="varFilaAgregar()"><i class="bi bi-plus-lg"></i> ' +
      (peso ? 'Agregar bolsa' : 'Agregar presentación') + '</button>';
  } else {
    /* Un solo tamaño: el formulario de siempre, y la invitación. */
    h = '<p class="var-ayuda">' + (peso
      ? '¿Lo comprás en bolsas de distinto tamaño (1 kg, 3 kg, 5 kg)? Agregá las otras, cada una con lo que te costó y su ganancia: al vender, el precio sale solo según la cantidad.'
      : '¿Viene en otros tamaños (maní x 80 g y x 160 g)? Agregá los otros, cada uno con su costo y su ganancia: en la venta y en la tienda se ven como un solo producto.') + '</p>';
    h += '<button type="button" class="btn btn-secondary btn-sm var-agregar" onclick="varFilaAgregar()"><i class="bi bi-plus-lg"></i> ' +
      (peso ? 'Agregar otra bolsa' : 'Agregar otra presentación') + '</button>';
  }
  /* Las de la otra forma de venta (un paquete de 500 g de un granel) no se editan acá:
     se nombran, con su ficha a un toque. */
  const pid = _varPrincipalActual();
  if (pid) {
    const otras = prods.filter(x => x && x.gramajePadreId === pid && x.depurado !== true && (x.tipoVenta === 'peso') !== peso);
    if (otras.length) {
      h += '<div class="var-otras"><span>' + (peso ? 'Por unidad:' : 'A granel:') + '</span>' + otras.map(v =>
        '<span class="var-otra">' + _varEsc(etiquetaVariante(v)) + ' · $' + Number(v.precio || 0).toLocaleString('es-AR') + (v.tipoVenta === 'peso' ? '/kg' : '') +
        ' <button type="button" class="var-link" onclick="closeModal();openModal(\'' + _varAttr(v.id) + '\')">Abrir</button></span>').join('') + '</div>';
    }
    h += '<button type="button" class="var-link var-completa" onclick="nuevaVariante(\'' + _varAttr(pid) + '\')">' +
      'Cargar una con su propio formulario (otro nombre, otra forma de venta, foto o código de barras)</button>';
  }
  el.innerHTML = h;
}

/* Escribir en una fila: se guarda y se recalculan sus precios, sin repintar la sección
   (se perdería el foco a cada tecla). */
function varFilaCambio(i, campo, valor) {
  const f = (window._varFilas || [])[i];
  if (!f) return;
  f[campo] = valor;
  f.tocado = f.tocado || {};
  f.tocado[campo] = true;
  const res = document.querySelector('#pVariantes .vfe[data-i="' + i + '"] .vfe-res');
  if (res) res.innerHTML = _resFilaVar(_calcFilaVar(f, _varEsPeso()), _varEsPeso(), f.caja, f.dsc);
  if (campo === 'costoIn') _fechaCostoTocada(document.querySelector('#pVariantes .vfe[data-i="' + i + '"]'));
}

/* Una fila nueva, con la ganancia y el mayorista del producto de arriba. */
function varFilaAgregar() {
  const filas = window._varFilas || (window._varFilas = []);
  const val = id => { const e = document.getElementById(id); return e ? e.value : ''; };
  filas.push({ id: null, tam: '', costoIn: '', pct: Number(val('pPorcentaje')) || 0, pctMay: Number(val('pPorcentajeMay')) || 0, stock: 0, dsc: 0, tocado: {} });
  pintarVariantesForm();
  /* Si este producto todavía no dice de cuánto es, primero eso: la primera fila. */
  setTimeout(() => {
    const g = document.getElementById('pGramaje');
    const ppal = document.getElementById('pVarTam');
    const ins = document.querySelectorAll('#pVariantes .vfe-tam input');
    const ult = (ppal && g && !String(g.value || '').trim()) ? ppal : ins[ins.length - 1];
    if (ult) ult.focus();
  }, 30);
}

/* Solo las nuevas: una que ya existe es un producto, con ventas y stock. Se borra desde
   su ficha, y ahí las otras quedan juntas (reengancharVariantesAlBorrar). */
function varFilaQuitar(i) {
  const filas = window._varFilas || [];
  const f = filas[i];
  if (!f || f.id) return;
  filas.splice(i, 1);
  pintarVariantesForm();
}

/* El tamaño de la primera fila (este producto) es el mismo campo que Gramaje / Presentación.
   Recibe el campo (el número o la unidad) o directamente la etiqueta. */
function varTamPrincipal(v) {
  const texto = (typeof v === 'string') ? v : _tamDeWidget(v);
  const g = document.getElementById('pGramaje');
  if (g) { g.value = texto; g.dispatchEvent(new Event('input', { bubbles: true })); }
}

/* Abre el formulario para crear una variante: un producto nuevo, enganchado al
   principal, con lo que comparten ya cargado. Costo, stock y código son suyos. */
function nuevaVariante(principalId) {
  const prods = _varProds();
  const pr = prods.find(x => x && x.id === principalId);
  if (!pr) return;
  if (typeof closeModal === 'function') closeModal();
  openModal();
  window._varianteDeNueva = pr.id;
  window._varianteNombreBase = baseDeNombre(pr.nombre) || pr.nombre || '';
  const set = (id, v) => { const e = document.getElementById(id); if (e && v != null) e.value = v; };
  set('pNombre', window._varianteNombreBase);
  set('pDescripcion', pr.descripcion || '');
  set('pPorcentaje', pr.porcentaje || 0);
  set('pPorcentajeMay', pr.porcentajeMayorista || 0);
  if (typeof updateCatSelects === 'function') updateCatSelects();
  set('pCategoria', pr.categoria || '');
  if (typeof updateSubcatSelect === 'function') updateSubcatSelect();
  set('pSubcategoria', pr.subcategoria || '');
  if (typeof updateListaSelect === 'function') updateListaSelect(pr.lista || ''); else set('pLista', pr.lista || '');
  if (typeof setTipoVenta === 'function') setTipoVenta(pr.tipoVenta === 'peso' ? 'peso' : 'unidad');
  if (typeof calcPrecioModal === 'function') calcPrecioModal();
  const t = document.getElementById('modalTitle');
  if (t) t.textContent = 'Nueva variante';
  pintarVariantesForm();
  setTimeout(() => { const g = document.getElementById('pGramaje'); if (g) g.focus(); }, 60);
}

/* Se envuelven openModal y setTipoVenta en vez de tocarlos por dentro: openModal es una
   sola línea de casi 2000 caracteres (ver _origOpenModal en admin.html). Al abrir el
   formulario se olvida la variante que se estaba por crear -nuevaVariante la marca
   DESPUÉS de abrirlo- y se arman las filas del producto. Las filas se vacían ANTES de
   abrir: el openModal de admin.html llama a setTipoVenta, que repinta la sección, y no
   puede mostrar las del producto anterior. */
if (typeof openModal === 'function') {
  const _varOpenModal = openModal;
  openModal = function (id) {
    window._varianteDeNueva = null;
    window._varianteNombreBase = null;
    window._varFilas = [];
    window._varHijo = null;
    window._varFilasPeso = null;
    window._varPpalBolsa = null;
    const r = _varOpenModal.apply(this, arguments);
    const p = id ? (_varProds().find(x => x && x.id === id) || null) : null;
    iniciarVariantesForm(p);
    pintarVariantesForm();
    const cb = document.getElementById('pCajaCerrada');
    if (cb) cb.checked = !!(p && p.cajaCerrada === true);
    pintarCajaCerrada();
    pintarFilaPpal();
    return r;
  };
}
if (typeof setTipoVenta === 'function') {
  const _varSetTipoVenta = setTipoVenta;
  setTipoVenta = function () {
    const r = _varSetTipoVenta.apply(this, arguments);
    /* Las filas son de una forma de venta: el costo de una bolsa no es el de una unidad.
       Si cambia, se arman de nuevo con las del producto que son de la nueva. Antes
       quedaban las otras, y tocar su costo guardaba un costo por kilo en un producto por
       unidad (chequeo del 25/09). Lo escrito en esas filas no se guarda, y se avisa. */
    const peso = _varEsPeso();
    if (window._varFilasPeso != null && window._varFilasPeso !== peso && !window._varHijo && !window._varianteDeNueva) {
      const escrito = (window._varFilas || []).some(f => f.id ? Object.keys(f.tocado || {}).length
        : (String(f.tam || '').trim() || String(f.costoIn || '').trim()));
      const pid = _varPrincipalActual();
      window._varPpalBolsa = null;
      iniciarVariantesForm(pid ? (_varProds().find(x => x && x.id === pid) || null) : null, peso);
      if (escrito && typeof showAdminToast === 'function') {
        showAdminToast('Cambió la forma de venta: lo que habías cargado en ' + (peso ? 'las presentaciones' : 'las bolsas') + ' no se guarda.', 'info');
      }
    }
    pintarVariantesForm();
    pintarCajaCerrada();
    return r;
  };
}
/* El precio mayorista cambia con el costo y el %: la nota de la caja lo sigue. */
if (typeof calcPrecioModal === 'function') {
  const _varCalcPrecio = calcPrecioModal;
  calcPrecioModal = function () {
    const r = _varCalcPrecio.apply(this, arguments);
    pintarCajaCerrada();
    pintarFilaPpal();
    return r;
  };
}

/* Ocultar el principal de un grupo: la tienda ya no lo tiene y las otras se venden cada
   una por separado (en el granel, sin precio por cantidad). Se avisa, y cómo seguir
   juntas: borrándolo, la siguiente pasa a ser la principal (chequeo del 25/09). */
if (typeof toggleOculto === 'function') {
  const _varToggleOculto = toggleOculto;
  toggleOculto = async function (id) {
    const r = await _varToggleOculto.apply(this, arguments);
    const p = _varProds().find(x => x && x.id === id);
    if (p && p.oculto === true && !p.gramajePadreId) {
      const hijas = _varProds().filter(x => x && x.gramajePadreId === id && x.depurado !== true && x.oculto !== true);
      if (hijas.length && typeof avisar === 'function') {
        const granel = p.tipoVenta === 'peso' && hijas.some(x => x.tipoVenta === 'peso');
        await avisar(nombreDeGrupo(p) + ' tiene ' + (hijas.length === 1 ? 'otra presentación' : hijas.length + ' presentaciones más') +
          ' (' + hijas.slice().sort(_ordenVariantes).map(etiquetaVariante).join(', ') + '). Mientras esté oculto, se venden cada una por separado' +
          (granel ? ', a su precio: sin precio por cantidad' : '') + '.' + _VAR_NL + _VAR_NL +
          'Si ya no lo vas a vender, mejor borralo: la siguiente pasa a ser la principal y siguen juntas.',
          { titulo: 'Ocultaste el producto principal', icono: 'bi-eye-slash' });
      }
    }
    return r;
  };
}

/* La casilla "caja cerrada" del producto (debajo del precio mayorista): solo en los
   que se venden por unidad, con lo que se va a cobrar. */
function pintarCajaCerrada() {
  const wrap = document.getElementById('pCajaWrap');
  if (!wrap) return;
  const peso = _varEsPeso();
  wrap.hidden = peso;
  const cb = document.getElementById('pCajaCerrada'), nota = document.getElementById('pCajaNota');
  if (!cb || !nota) return;
  if (peso || !cb.checked) { nota.textContent = ''; nota.className = 'caja-nota'; return; }
  const pctMay = Number((document.getElementById('pPorcentajeMay') || {}).value) || 0;
  const may = Number((document.getElementById('pPrecioMay') || {}).value) || 0;
  if (!(pctMay > 0)) {
    nota.textContent = 'Poné el % mayorista: sin él, la caja no tiene precio mayorista.';
    nota.className = 'caja-nota falta';
    return;
  }
  nota.textContent = 'En el mostrador y en la tienda se cobra $' + may.toLocaleString('es-AR') + ', el precio mayorista.';
  nota.className = 'caja-nota';
}

/* La marca que guarda saveProduct. Se escribe si está puesta, o si se sacó (para
   borrarla); un producto que nunca la tuvo no gana el campo. */
function datosCajaCerrada(data, id) {
  const cb = document.getElementById('pCajaCerrada');
  if (!cb || !data) return data;
  const marcada = cb.checked && data.tipoVenta !== 'peso';
  const antes = id ? ((_varProds().find(x => x && x.id === id) || {}).cajaCerrada === true) : false;
  if (marcada) data.cajaCerrada = true;
  else if (antes) data.cajaCerrada = false;
  return data;
}
(function () {
  const a = document.getElementById('pCajaAyuda');
  if (a && a.setAttribute) { a.setAttribute('data-tip', _AYUDA_CAJA); a.setAttribute('aria-label', _AYUDA_CAJA); }
})();
(function () {
  /* La primera fila de la tabla es este producto: lo que se escribe arriba la sigue. */
  const g = document.getElementById('pGramaje');
  if (g) g.addEventListener('input', () => {
    /* En una variante nueva, el tamaño cambia el nombre con el que se guarda: el aviso de
       nombre repetido de admin.html (_pintarEstadoNombre) se vuelve a mirar. */
    if (window._varianteDeNueva && typeof _pintarEstadoNombre === 'function') _pintarEstadoNombre();
    const t = document.getElementById('pVarTam');
    if (t && document.activeElement !== t) {
      const p = _tamPartes(g.value, _varEsPeso());
      t.value = p.num;
      const w = t.closest ? t.closest('.vfe-tamw') : null;
      const sel = w ? w.querySelector('select') : null;
      if (sel && document.activeElement !== sel) sel.value = p.uni;
    }
    /* Si el costo se escribió en la fila como lo que costó la bolsa, al cambiar el
       tamaño se mantiene la bolsa y cambia el costo por kilo, como en las otras filas. */
    const monto = _varMonto(window._varPpalBolsa);
    const c = contenidoDeVariante({ gramaje: g.value });
    if (_varEsPeso() && monto > 0 && c && c.unidad === 'g' && c.valor > 0) _varPonerArriba('pCosto', String(Math.round(monto * 1000 / c.valor)));
    pintarFilaPpal();
  });
  /* El costo por kilo escrito a mano arriba manda sobre lo que costó la bolsa. */
  const pc = document.getElementById('pCosto');
  if (pc) pc.addEventListener('input', () => { if (!window._varPpalEscribiendo) window._varPpalBolsa = null; pintarFilaPpal(); });
  ['pStock', 'pPorcentaje', 'pPorcentajeMay', 'pDescuento'].forEach(id => {
    const e = document.getElementById(id);
    if (e) e.addEventListener('input', pintarFilaPpal);
  });
  const cb = document.getElementById('pCajaCerrada');
  if (cb) cb.addEventListener('change', pintarFilaPpal);
})();

/* ---------------------------------------------------------- AL GUARDAR
   saveProduct llama a las tres: faltaPresentacionDeVariante antes de guardar nada,
   datosDeVarianteNueva al armar los datos de un producto NUEVO, y guardarVariantesForm
   después de guardar el producto, con su id. */

/* Lo que no se puede guardar: una variante sin su presentación, o filas incompletas.
   Solo se revisan si se agregó o se tocó alguna: un producto de antes se sigue
   guardando como siempre. */
function faltaPresentacionDeVariante() {
  const aviso = m => { if (typeof showAdminToast === 'function') showAdminToast(m, 'error'); };
  /* Una caja cerrada se cobra al precio mayorista: con 0% no lo tendría (01/10). */
  const cb = document.getElementById('pCajaCerrada');
  if (cb && cb.checked && !_varEsPeso() && !((Number((document.getElementById('pPorcentajeMay') || {}).value) || 0) > 0)) {
    aviso('Una caja cerrada se cobra al precio mayorista: poné el % mayorista.');
    const m = enModoTamanos() ? document.querySelector('#pVariantes .vfe-ppal .vfe-pctmay input') : document.getElementById('pPorcentajeMay');
    if (m) m.focus();
    return true;
  }
  if (window._varianteDeNueva) {
    const g = document.getElementById('pGramaje');
    if (g && g.value.trim()) return false;
    aviso('Poné la presentación de la variante: 160 g, 3 kg, x12...');
    if (g) g.focus();
    return true;
  }
  const filas = window._varFilas || [];
  const peso = _varEsPeso();
  const que = peso ? 'bolsa' : 'presentación';
  const g = document.getElementById('pGramaje'), n = document.getElementById('pNombre');
  const foco = (i, sel) => { const e = document.querySelector('#pVariantes .vfe[data-i="' + i + '"] ' + sel); if (e) e.focus(); };
  const cp = contenidoDeVariante({ gramaje: g ? g.value : '', nombre: n ? n.value : '' });
  const faltaTam = () => {
    aviso(peso ? 'Poné de cuánto es la primera bolsa (ej. 1 kg).' : 'Poné el tamaño de la primera presentación (ej. 80 g).');
    const t = document.getElementById('pVarTam');
    if (t) t.focus();
    return true;
  };
  /* Con varios tamaños lo de arriba está escondido: este producto se revisa en su fila,
     la primera, aunque no se haya tocado ninguna otra. */
  if (enModoTamanos()) {
    if (!cp || (peso && cp.unidad !== 'g')) return faltaTam();
    if (!(_varMonto((document.getElementById('pCosto') || {}).value) > 0)) {
      aviso(peso ? 'Poné lo que costó la primera bolsa.' : 'Poné el costo de la primera presentación.');
      const e = document.querySelector('#pVariantes .vfe-ppal .vfe-costo input');
      if (e) e.focus();
      return true;
    }
  }
  if (!filas.some(f => !f.id || Object.keys(f.tocado || {}).length)) return false;
  if (!cp || (peso && cp.unidad !== 'g')) return faltaTam();
  const vistos = new Set([cp.unidad + cp.valor]);
  for (let i = 0; i < filas.length; i++) {
    const f = filas[i];
    const c = contenidoDeVariante({ gramaje: f.tam });
    if (!String(f.tam || '').trim() || !c) { aviso('Falta el tamaño de una ' + que + ' (ej. ' + (peso ? '3 kg' : '160 g') + ').'); foco(i, '.vfe-tam input'); return true; }
    if (peso && c.unidad !== 'g') { aviso('El tamaño de una bolsa va en kg o g: "' + f.tam + '".'); foco(i, '.vfe-tam input'); return true; }
    if (vistos.has(c.unidad + c.valor)) { aviso('Hay dos del mismo tamaño: ' + f.tam + '.'); foco(i, '.vfe-tam input'); return true; }
    vistos.add(c.unidad + c.valor);
    if (!f.id && !(_varMonto(f.costoIn) > 0)) { aviso('Poné el costo de la ' + que + ' de ' + f.tam + '.'); foco(i, '.vfe-costo input'); return true; }
    /* El nombre que va a tener no puede estar ya en la lista: dos fichas con el mismo
       nombre son dos precios y dos stocks para lo mismo (la regla de validarNombreProducto
       en admin.html). Las filas nuevas se crean directo, sin pasar por esa validación. */
    if (!f.id && typeof claveProducto === 'function') {
      const nb = String((n && n.value) || '').trim();
      const nom = _nombreConTam(baseDeNombre(nb) || nb, String(f.tam).trim());
      const lista = String((document.getElementById('pLista') || {}).value || '');
      const choca = _varProds().find(x => x && String(x.lista || '') === lista && claveProducto(x.nombre) === claveProducto(nom));
      if (choca) {
        aviso('En esta lista ya hay un producto llamado "' + (choca.nombreMostrado || choca.nombre) + '"' + (choca.codigo ? ' (código ' + choca.codigo + ')' : '') +
          '. Si es el mismo, no lo cargues de nuevo: enganchalo con "Asociar uno existente" desde la tabla de Productos.');
        foco(i, '.vfe-tam input');
        return true;
      }
    }
    if (!peso && f.caja && !((Number(f.pctMay) || 0) > 0)) {
      aviso('La caja cerrada de ' + f.tam + ' se cobra al precio mayorista: poné su % mayorista.');
      foco(i, '.vfe-pctmay input');
      return true;
    }
  }
  return false;
}

/* El enlace con el principal. Si se dejó el nombre que se precargó, se le suma la
   presentación: dos productos con el mismo nombre se confunden en todos lados. */
function datosDeVarianteNueva(data) {
  const padre = window._varianteDeNueva;
  if (!padre || !data) return data;
  data.gramajePadreId = padre;
  const base = window._varianteNombreBase;
  if (base && data.nombre === base && data.gramaje) data.nombre = _nombreConTam(base, data.gramaje);
  return data;
}
/* El nombre con el que se va a guardar: en una variante nueva con el nombre precargado,
   el de datosDeVarianteNueva ("Maní" y "160 g" dan "Maní x 160 g"). El chequeo de nombre
   repetido de admin.html (validarNombreProducto, de Jero, 21/09) tiene que mirar ESE: con
   el del campo chocaba con su principal, que se llama igual, y no dejaba crear la
   variante (al traer sus cambios, 26/09). */
function nombreQueSeGuarda(nombre) {
  const n = String(nombre == null ? '' : nombre).trim();
  const base = window._varianteNombreBase;
  const g = document.getElementById('pGramaje');
  const gram = g ? String(g.value || '').trim() : '';
  return (window._varianteDeNueva && base && n === base && gram) ? _nombreConTam(base, gram) : n;
}

/* Crea las filas nuevas y guarda las que se tocaron. El producto ya está guardado:
   si algo falla acá se avisa y NO se corta, porque volver a guardar crearía el
   producto otra vez. Lo que no se guardó se vuelve a cargar desde su ficha. */
/* Las filas de la tabla que se van a guardar con precio, con el costo y el precio que les quedan
   (la misma cuenta que guardarVariantesForm, abajo): las usa el aviso "Se vende sin ganancia" de
   saveProduct (pedido del dueño, 02/10). `nombre`: el del producto, para nombrar las filas nuevas. */
function filasVarConPrecio(nombre) {
  const peso = _varEsPeso();
  const base = baseDeNombre(nombre || '') || nombre || '';
  return (window._varFilas || []).filter(f => !f.id || Object.keys(f.tocado || {}).length).map(f => {
    const r = _calcFilaVar(f, peso);
    const tam = String(f.tam || '').trim();
    if (!f.id) {
      if (r.costo === null || !tam) return null;
      return { nombre: _nombreConTam(base, tam), costo: r.costo, precio: r.precio, porcentaje: Number(f.pct) || 0, peso: peso };
    }
    const old = _varProds().find(x => x && x.id === f.id) || {};
    if ((old.tipoVenta === 'peso') !== peso) return null;
    const t = f.tocado || {};
    const tamNuevo = !!(t.tam && tam && tam !== String(f.tamAntes || '').trim());
    const recalcular = !!(t.costoIn || (peso && tamNuevo));
    if (!(recalcular || t.pct || t.pctMay)) return null;
    const costo = recalcular && r.costo !== null ? r.costo : Number(old.costo || 0);
    const pct = t.pct ? (Number(f.pct) || 0) : Number(old.porcentaje || 0);
    return { nombre: old.nombreMostrado || old.nombre || tam, costo: costo, precio: Math.round(costo * (1 + pct / 100)),
      porcentaje: pct, peso: peso, antes: Number(old.precio || 0) };
  }).filter(Boolean);
}

async function guardarVariantesForm(principalId, data) {
  const filas = (window._varFilas || []).filter(f => !f.id || Object.keys(f.tocado || {}).length);
  window._varFilas = [];
  if (!filas.length || !principalId || !data) return;
  const peso = data.tipoVenta === 'peso';
  const base = baseDeNombre(data.nombre) || data.nombre;
  const reservados = [data.codigo];
  const hechos = [], errores = [];
  for (const f of filas) {
    try {
      const r = _calcFilaVar(f, peso);
      const tam = String(f.tam || '').trim();
      /* faltaPresentacionDeVariante ya las frena; esto es por si algún camino no pasa por ahí. */
      if (!f.id && (r.costo === null || !tam)) { errores.push((tam || '?') + ': falta el tamaño o el costo'); continue; }
      if (!f.id) {
        const codigo = (typeof sugerirCodigoProducto === 'function') ? sugerirCodigoProducto(reservados) : null;
        if (codigo) reservados.push(codigo);
        const nuevo = {
          nombre: _nombreConTam(base, tam), nombreMostrado: null, gramaje: tam, codigoBarras: null,
          costo: r.costo, porcentaje: Number(f.pct) || 0, precio: r.precio,
          porcentajeMayorista: Number(f.pctMay) || 0, precioMayorista: r.may, descuento: _varDsc(f.dsc),
          stock: parseInt(f.stock, 10) || 0,
          categoria: data.categoria || '', subcategoria: data.subcategoria || null,
          descripcion: data.descripcion || '', valoresNutricionales: data.valoresNutricionales || '',
          imagenesExtra: [], imagen: data.imagen || null, lista: data.lista || null,
          codigo: codigo, tipoVenta: peso ? 'peso' : 'unidad',
          gramajePadreId: principalId, creadoEn: new Date(),
        };
        if (!peso && f.caja) nuevo.cajaCerrada = true;
        const ref = await db.collection('productos').add(nuevo);
        hechos.push(ref.id);
        if (typeof logAction === 'function') logAction('crear', 'Creado: ' + nuevo.nombre, 'Variante de ' + data.nombre + ' | $' + nuevo.precio + ' | stock:' + nuevo.stock);
        continue;
      }
      const old = _varProds().find(x => x && x.id === f.id) || {};
      /* Una fila de la otra forma de venta no se toca: sus números son de otra cosa. */
      if ((old.tipoVenta === 'peso') !== peso) { errores.push((f.tam || '?') + ': es de la otra forma de venta'); continue; }
      const t = f.tocado || {};
      const upd = {};
      let costo = Number(old.costo || 0);
      /* En una bolsa se escribe lo que costó la bolsa: si cambia el tamaño cambia el costo
         por kilo, como ya lo mostraba la fila. Antes se guardaba el de antes (25/09). */
      const tamNuevo = !!(t.tam && tam && tam !== String(f.tamAntes || '').trim());
      const recalcular = !!(t.costoIn || (peso && tamNuevo));
      if (recalcular && r.costo !== null) { costo = r.costo; upd.costo = costo; }
      if (recalcular || t.pct || t.pctMay) {
        const pct = t.pct ? (Number(f.pct) || 0) : Number(old.porcentaje || 0);
        const pctMay = t.pctMay ? (Number(f.pctMay) || 0) : Number(old.porcentajeMayorista || 0);
        upd.porcentaje = pct;
        upd.precio = Math.round(costo * (1 + pct / 100));
        upd.porcentajeMayorista = pctMay;
        upd.precioMayorista = pctMay > 0 ? _varMay(Math.round(costo * (1 + pctMay / 100))) : 0;
      }
      if (t.stock) upd.stock = parseInt(f.stock, 10) || 0;
      if (t.dsc && _varDsc(f.dsc) !== Number(old.descuento || 0)) upd.descuento = _varDsc(f.dsc);
      if (t.caja && !peso && (!!f.caja) !== (old.cajaCerrada === true)) upd.cajaCerrada = !!f.caja;
      if (t.tam && tam && tam !== (old.gramaje || '')) {
        upd.gramaje = tam;
        if (old.nombre && f.tamAntes && old.nombre === _nombreConTam(base, f.tamAntes)) upd.nombre = _nombreConTam(base, tam);
      }
      if (!Object.keys(upd).length) continue;
      /* Si cambió el costo, su fecha va en la misma escritura: la relectura de abajo
         (refrescarProductoLocal) ya la trae. Antes la ponía después registrarCambioDeCosto y el
         panel la seguía viendo vieja hasta F5 (revisión del 01/10). Fuera de upd: el historial no
         la nombra. */
      const conFecha = 'costo' in upd && upd.costo !== Number(old.costo || 0);
      await db.collection('productos').doc(f.id).update(conFecha
        ? Object.assign({}, upd, { costoActualizadoEn: firebase.firestore.FieldValue.serverTimestamp() }) : upd);
      hechos.push(f.id);
      if (typeof logAction === 'function') {
        logAction('editar', 'Editado: ' + (upd.nombre || old.nombre || f.id), Object.keys(upd).map(k => k + ': ' + upd[k]).join(' | '));
      }
    } catch (e) {
      errores.push((f.tam || '?') + ': ' + (e && e.message ? e.message : e));
    }
  }
  for (const id of hechos) { if (typeof refrescarProductoLocal === 'function') await refrescarProductoLocal(id); }
  if (typeof showAdminToast === 'function') {
    if (errores.length) showAdminToast('No se pudieron guardar todas las ' + (peso ? 'bolsas' : 'presentaciones') + ': ' + errores.join(' · '), 'error');
    else if (hechos.length) showAdminToast(hechos.length === 1 ? (peso ? 'Bolsa guardada' : 'Presentación guardada')
      : hechos.length + (peso ? ' bolsas guardadas' : ' presentaciones guardadas'), 'success');
  }
}

/* ------------------------------------------------ EN LA TABLA DE PRODUCTOS
   Pedido del comercio (25/09/2026): buscando "Mani RC" salían dos filas, la de 80 g y la
   de 160 g, como dos productos. Ahora un producto con presentaciones (o bolsas) es UNA
   fila, la de su principal, con "2 presentaciones" al lado del nombre. Ese botón, o el
   de las capas en Acciones, despliega debajo cada tamaño con su código, su precio y su
   stock, y "Editar presentaciones" abre el formulario en la tabla de tamaños.
   La búsqueda y los filtros miran todos los tamaños: buscando "160" aparece el producto
   con el panel abierto y la de 160 g marcada. El grupo va donde va su principal en el
   orden elegido. Las herramientas en tanda (Costo %, Redondear, Etiquetas, exportar...)
   no usan esta tabla: siguen viendo cada tamaño. */
window._gruposAbiertos = window._gruposAbiertos || new Set();
window._gruposCerrados = window._gruposCerrados || new Set();

/* El principal del grupo de un producto, para la tabla: el suyo si es una variante (con
   el principal a la vista: no depurado ni variante de otro), él mismo si tiene
   variantes, o null si va solo. */
function _principalTabla(p, porId, conHijos) {
  if (!p || p.depurado === true) return null;
  if (p.gramajePadreId) {
    const pr = porId.get(p.gramajePadreId);
    return (pr && pr.depurado !== true && !pr.gramajePadreId) ? pr : null;
  }
  return conHijos.has(p.id) ? p : null;
}

/* Lo que dibuja la tabla: los de un mismo grupo, juntos en su principal, que lleva
   __grupo = { miembros, coinciden, soloOtros }. "coinciden" son los que pasaron la
   búsqueda y los filtros; "soloOtros", que el principal no pasó: entonces el panel se
   abre solo, porque si no, no se ve por qué está. */
function agruparParaTabla(lista) {
  const prods = _varProds();
  const porId = new Map(prods.filter(Boolean).map(x => [x.id, x]));
  const conHijos = new Set(prods.filter(x => x && x.gramajePadreId && x.depurado !== true).map(x => x.gramajePadreId));
  const f = lista || [];
  const enLista = new Set(f.map(p => p && p.id));
  const out = [];
  const hechos = new Set();
  f.forEach(p => {
    const pr = _principalTabla(p, porId, conHijos);
    if (!pr) { out.push(p); return; }
    if (hechos.has(pr.id)) return;
    /* Si el principal también pasó, el grupo va en su lugar: se lo espera. */
    if (p.id !== pr.id && enLista.has(pr.id)) return;
    hechos.add(pr.id);
    const miembros = variantesDeGrupo(pr, prods, { conOcultos: true });
    if (miembros.length < 2) { out.push(p); return; }
    const coinciden = miembros.filter(m => enLista.has(m.id)).map(m => m.id);
    out.push(Object.assign({}, pr, { __grupo: { miembros: miembros, coinciden: coinciden, soloOtros: coinciden.indexOf(pr.id) < 0 } }));
  });
  return out;
}

/* EN STOCK (pedido del dueño, 28/09/2026): un producto con bolsas o presentaciones es UN
   bloque, como en Productos, con cada tamaño abajo y siempre a la vista, porque ahí se
   carga lo que llega de cada uno (renderStockList, admin.html). Devuelve la lista con los
   de un mismo grupo juntos en
   { __stockGrupo: { principal, nombre, que, miembros: [{ producto, tam, coincide }] } }.
   - El bloque va donde aparece el PRIMERO de sus tamaños, no donde está el principal:
     ordenando por "Menor stock", sale a la altura de su bolsa más vacía.
   - Van todos los tamaños (menos los depurados); "coincide" dice cuáles pasaron la
     búsqueda y los filtros, para marcarlos cuando no son todos.
   - El nombre va sin el tamaño, que está en cada fila: "Maní x 1 kg" -> "Maní", y sin los
     paréntesis que quedan vacíos: "Yerba Mate (500 Gr)" -> "Yerba Mate", no "Yerba Mate ( )".
     Solo para mostrar: baseDeNombre también arma el nombre que se guarda en una variante nueva.
   - "otroNombre": si un tamaño es un producto con otro nombre (enganchado con "Asociar uno
     existente"), su nombre, para que la fila no diga solo "1 Kg" y se sepa a cuál se le carga
     (revisión del 28/09: "Te Verde Tostado" salía como "1 Kg" de "Yerba Mate Tostado"). Se
     compara como el aviso de nombres repetidos (claveProducto): sin tildes ni mayúsculas. */
function agruparParaStock(lista) {
  const prods = _varProds();
  const sinTam = n => baseDeNombre(n).replace(/\(\s*\)|\[\s*\]/g, ' ').replace(/\s+/g, ' ').trim();
  const clave = n => (typeof claveProducto === 'function' ? claveProducto(sinTam(n)) : sinTam(n).toLowerCase());
  const porId = new Map(prods.filter(Boolean).map(x => [x.id, x]));
  const conHijos = new Set(prods.filter(x => x && x.gramajePadreId && x.depurado !== true).map(x => x.gramajePadreId));
  const f = lista || [];
  const enLista = new Set(f.map(p => p && p.id));
  const out = [];
  const hechos = new Set();
  f.forEach(p => {
    const pr = _principalTabla(p, porId, conHijos);
    if (!pr) { out.push(p); return; }
    if (hechos.has(pr.id)) return;
    hechos.add(pr.id);
    const miembros = variantesDeGrupo(pr, prods, { conOcultos: true });
    if (miembros.length < 2) { out.push(p); return; }
    const base = clave(pr.nombre);
    out.push({ __stockGrupo: {
      principal: pr,
      nombre: sinTam(pr.nombre) || pr.nombre || '',
      que: _queGrupo({ miembros: miembros }),
      miembros: miembros.map(m => ({ producto: m, tam: etiquetaVariante(m), coincide: enLista.has(m.id),
        otroNombre: clave(m.nombre) !== base ? (m.nombre || '') : '' })),
    } });
  });
  return out;
}

function _grupoAbierto(p) {
  if (!p || !p.__grupo) return false;
  if (window._gruposCerrados.has(p.id)) return false;
  return window._gruposAbiertos.has(p.id) || p.__grupo.soloOtros === true;
}
/* "3 bolsas" si todas son bolsas de granel; si no, "3 presentaciones". */
function _queGrupo(g) { return g.miembros.every(m => m.tipoVenta === 'peso') ? 'bolsas' : 'presentaciones'; }

/* Al lado del nombre: cuántas son, y abre o cierra el panel. */
function chipPresentacionesHtml(p) {
  const g = p && p.__grupo;
  if (!g) return '';
  const abierto = _grupoAbierto(p);
  return ' <button type="button" class="var-chip' + (abierto ? ' abierto' : '') + '" onclick="togglePresentacionesTabla(\'' + _varAttr(p.id) + '\')"' +
    ' title="Ver cada tamaño, con su precio y su stock">' + g.miembros.length + ' ' + _queGrupo(g) +
    ' <i class="bi bi-chevron-' + (abierto ? 'up' : 'down') + '"></i></button>';
}

/* El panel, una fila debajo de la del producto (o nada, si está cerrado). */
function panelPresentacionesHtml(p) {
  const g = p && p.__grupo;
  if (!g) return '';
  const abierto = _grupoAbierto(p);
  (window._gruposVistos = window._gruposVistos || new Map()).set(p.id, abierto);
  if (!abierto) return '';
  const que = _queGrupo(g);
  /* Se marca lo que se buscó cuando el grupo está por eso y no por su principal. */
  const marcar = new Set(g.soloOtros ? g.coinciden : []);
  const fila = m => {
    const peso = m.tipoVenta === 'peso';
    const precio = Number(m.precio || 0);
    const caja = esCajaCerrada(m) && Number(m.precioMayorista || 0) > 0;
    const stock = Number(m.stock || 0);
    const sc = stock <= 0 ? 'stock-out' : ((typeof esStockBajo === 'function' && esStockBajo(m)) ? 'stock-low' : 'stock-ok');
    const chips = (m.id === p.id ? '<span class="var-tabla-chip">principal</span>' : '') +
      (caja ? '<span class="var-tabla-chip caja">caja cerrada</span>' : '') +
      (m.oculto === true ? '<span class="var-tabla-chip oculto">oculto</span>' : '');
    return '<tr' + (marcar.has(m.id) ? ' class="coincide"' : '') + '>' +
      '<td class="var-tabla-tam"><b>' + _varEsc(etiquetaVariante(m)) + '</b>' + chips + '</td>' +
      '<td class="var-tabla-cod">' + _varEsc(m.codigo || '-') + '</td>' +
      '<td class="var-tabla-costo">' + _costoCeldaHtml(p, m) + '</td>' +
      '<td class="var-tabla-precio">' + (caja
        ? '<b>$' + Number(m.precioMayorista).toLocaleString('es-AR') + '</b> <small>caja cerrada · lista $' + precio.toLocaleString('es-AR') + '</small>'
        : '<b>$' + precio.toLocaleString('es-AR') + '</b>' + (peso ? ' <small>el kilo</small>' : '')) + '</td>' +
      '<td><span class="stock-badge ' + sc + '">' + _varEsc(typeof stockTexto === 'function' ? stockTexto(m) : String(stock)) + '</span></td>' +
      '<td class="var-tabla-acc"><button type="button" class="btn-icon" onclick="editProduct(\'' + _varAttr(m.id) + '\')" title="Abrir su ficha"><i class="bi bi-pencil"></i></button></td>' +
    '</tr>';
  };
  return '<tr class="var-panel-fila"><td colspan="10"><div class="var-panel">' +
    '<div class="var-panel-cab"><span><i class="bi bi-stack"></i> <b>' + g.miembros.length + ' ' + que + '</b> de ' + _varEsc(baseDeNombre(p.nombre) || p.nombre || '') + '</span>' +
      '<span class="var-panel-acc">' +
        '<button type="button" class="btn btn-secondary btn-sm" onclick="openGramajeModal(\'' + _varAttr(p.id) + '\')" title="Enganchar un producto que ya está cargado">Asociar uno existente</button>' +
        '<button type="button" class="btn btn-primary btn-sm" onclick="editarPresentaciones(\'' + _varAttr(p.id) + '\')"><i class="bi bi-pencil"></i> Editar ' + que + '</button>' +
      '</span></div>' +
    '<table class="var-tabla"><thead><tr><th>Tamaño</th><th>Código</th><th>Costo</th><th>Precio</th><th>Stock</th><th></th></tr></thead><tbody>' +
      g.miembros.map(fila).join('') + '</tbody></table>' +
    (g.miembros.some(m => gramosDeBolsa(m)) ? ayudaRedondeoLineaHtml(true) : '') +
  '</div></td></tr>';
}

/* La columna "Costo" del panel (pedido del dueño, 27/09): en una bolsa, lo que costó la
   bolsa (como se carga en el formulario) y abajo el kilo. Tocarla abre la ventana de costos
   con todas las del producto: se cambia el costo y el precio sale solo, con su porcentaje. */
function _costoCeldaHtml(p, m) {
  const costo = Number(m.costo || 0);
  const g = gramosDeBolsa(m);
  const pesos = n => '$' + Math.round(n).toLocaleString('es-AR');
  const lapiz = ' <i class="bi bi-pencil"></i>';
  const dentro = !(costo > 0)
    ? '<span class="var-costo-falta">Sin costo' + lapiz + '</span>'
    : g
      ? '<span><b>' + pesos(costoDeBolsa(costo, g)) + '</b> <small>la bolsa</small>' + lapiz + '</span>' +
        (g !== 1000 ? '<small>' + pesos(costo) + ' el kilo</small>' : '')
      : '<span><b>' + pesos(costo) + '</b>' + (m.tipoVenta === 'peso' ? ' <small>el kilo</small>' : '') + lapiz + '</span>';
  return '<button type="button" class="var-costo-btn" onclick="cambiarCostosDeGrupo(\'' + _varAttr(p.id) + '\', \'' + _varAttr(m.id) + '\')"' +
    ' title="Cambiar el costo: el precio se recalcula con su porcentaje">' + dentro + '</button>';
}

function cambiarCostosDeGrupo(principalId, focoId) {
  if (typeof abrirEditorCostos !== 'function') return;
  const prods = _varProds();
  const pr = prods.find(x => x && x.id === principalId);
  if (!pr) return;
  const ahora = Date.now();
  const filas = variantesDeGrupo(pr, prods, { conOcultos: true }).map(m => {
    const f = typeof fechaDeCosto === 'function' ? fechaDeCosto(m) : null;
    return { producto: m, fecha: f, dias: f ? Math.floor((ahora - f.getTime()) / 86400000) : null };
  });
  abrirEditorCostos(filas, 'prod', focoId);
}

/* Abre o cierra el panel de un grupo. Se redibuja la tabla: la página no cambia (ver el
   filterTable de admin-pagination.js, que solo vuelve a la 1 si cambian los filtros). */
function togglePresentacionesTabla(id) {
  const abierto = !!(window._gruposVistos && window._gruposVistos.get(id));
  if (abierto) { window._gruposAbiertos.delete(id); window._gruposCerrados.add(id); }
  else { window._gruposCerrados.delete(id); window._gruposAbiertos.add(id); }
  if (typeof filterTable === 'function') filterTable();
}

/* "Editar presentaciones": el formulario del principal, en la tabla de tamaños. */
function editarPresentaciones(id) {
  if (typeof editProduct === 'function') editProduct(id); else if (typeof openModal === 'function') openModal(id);
  setTimeout(() => {
    const sec = document.getElementById('pVariantesSec');
    if (!sec) return;
    if (sec.scrollIntoView) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (sec.classList) {
      sec.classList.add('resaltar');
      setTimeout(() => sec.classList.remove('resaltar'), 1800);
    }
  }, 150);
}

/* Se agrupa ANTES de paginar (el renderTable de admin-pagination.js corta de a 20): una
   página son 20 productos, no 20 tamaños. Otra búsqueda o filtro arranca limpio: se
   olvida lo abierto y lo cerrado a mano, y se abren solos los que corresponden. Cambiar
   de página o guardar un producto no lo toca. */
if (typeof renderTable === 'function') {
  const _varRenderTable = renderTable;
  renderTable = function (prods) {
    const firma = ['searchInput', 'filterCat', 'filterLista', 'filterVisibilidad']
      .map(id => (document.getElementById(id) || {}).value || '').join('~|~');
    if (firma !== window._firmaGruposTabla) { window._firmaGruposTabla = firma; window._gruposCerrados.clear(); window._gruposAbiertos.clear(); }
    window._gruposVistos = new Map();
    return _varRenderTable.call(this, agruparParaTabla(prods));
  };
}

/* ----------------------------------------------------------- AL BORRAR
   Si se borra un producto que tiene variantes, las que quedan siguen juntas: la
   primera pasa a ser la principal. Si queda una sola, queda como producto suelto.
   Antes quedaban enganchadas a un producto que ya no existe: la tienda las escondía
   -a las variantes se las esconde porque salen como botones del principal- y en el
   panel no había forma de verlo. */
function avisoVariantesAlBorrar(id) {
  const hijas = _varProds().filter(x => x && x.gramajePadreId === id);
  if (!hijas.length) return '';
  return _VAR_NL + _VAR_NL + (hijas.length === 1
    ? 'Tiene 1 variante: queda como producto suelto.'
    : 'Tiene ' + hijas.length + ' variantes: siguen juntas, y la primera pasa a ser la principal.');
}

async function reengancharVariantesAlBorrar(id) {
  const hijas = _varProds().filter(x => x && x.gramajePadreId === id);
  if (!hijas.length) return null;
  const orden = hijas.slice().sort(_ordenVariantes);
  /* La nueva principal: la primera que se vende de verdad, si hay alguna. */
  const nueva = orden.find(v => v.depurado !== true && v.oculto !== true) ||
    orden.find(v => v.depurado !== true) || orden[0];
  const FV = firebase.firestore.FieldValue;
  const batch = db.batch();
  hijas.forEach(v => batch.update(db.collection('productos').doc(v.id),
    v.id === nueva.id ? { gramajePadreId: FV.delete() } : { gramajePadreId: nueva.id }));
  await batch.commit();
  hijas.forEach(v => { if (v.id === nueva.id) delete v.gramajePadreId; else v.gramajePadreId = nueva.id; });
  if (typeof showAdminToast === 'function') {
    showAdminToast(hijas.length === 1
      ? '"' + nueva.nombre + '" quedó como producto suelto'
      : 'Las variantes siguen juntas: ahora la principal es "' + nueva.nombre + '"', 'info');
  }
  return { principal: nueva, cuantas: hijas.length };
}
