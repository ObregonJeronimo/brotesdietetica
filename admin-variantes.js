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
  return Number(ctx === 'may' ? (v.precioMayorista || v.precio || 0) : (v.precio || 0));
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
            '<span class="var-etq">' + _varEsc(etiquetaVariante(v)) + '</span>' +
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
  if (Number(p.stock || 0) >= (ya[p.id] || 0) + 1) return null;
  const pr = principalDeVariante(p, prods);
  const opciones = variantesDeGrupo(pr, prods)
    .filter(v => v.id !== p.id && v.tipoVenta !== 'peso')
    .map(v => ({ v: v, c: contenidoDeVariante(v) }))
    .filter(x => x.c && x.c.unidad === c.unidad && x.c.valor < c.valor && c.valor % x.c.valor === 0)
    .map(x => ({ variante: x.v, cantidad: c.valor / x.c.valor }))
    .filter(x => Number(x.variante.stock || 0) - (ya[x.variante.id] || 0) >= x.cantidad)
    .sort((a, b) => a.cantidad - b.cantidad);
  return opciones[0] || null;
}

/* Lo que ve el que cobra. Devuelve 'seguir' (agregar la pedida como siempre), 'hecho'
   (se agregó la otra) o 'cancelar' (cerró el aviso sin elegir: no se agrega nada). */
async function sugerirPresentacion(p, lista, ctx) {
  const enVenta = {};
  (lista || []).forEach(it => { if (it && it.id) enVenta[it.id] = (enVenta[it.id] || 0) + Number(it.cantidad || 0); });
  const s = sugerenciaPresentacion(p, enVenta, _varProds());
  if (!s || typeof pedirOpcion !== 'function') return 'seguir';
  const may = ctx === 'may';
  const orig = may ? (typeof _origAddVentaMayItem === 'function' ? _origAddVentaMayItem : null)
                   : (typeof _origAddVentaItem === 'function' ? _origAddVentaItem : null);
  if (!orig) return 'seguir';
  const quedan = Math.max(0, Number(p.stock || 0) - (enVenta[p.id] || 0));
  const pu = precioDeVentaVariante(s.variante, ctx);
  const msg = 'No hay stock de ' + (p.nombreMostrado || p.nombre) + (quedan ? ' (quedan ' + quedan + ').' : '.') + _VAR_NL + _VAR_NL +
    '¿Agregar ' + s.cantidad + ' de ' + etiquetaVariante(s.variante) + ' en su lugar? Cada una a su precio: $' +
    pu.toLocaleString('es-AR') + ', en total $' + (pu * s.cantidad).toLocaleString('es-AR') + '.';
  const r = await pedirOpcion(msg, {
    titulo: 'Otra presentación',
    icono: 'bi-stack',
    opciones: [
      { valor: 'otra', texto: 'Agregar ' + s.cantidad + ' de ' + etiquetaVariante(s.variante), principal: true },
      { valor: 'igual', texto: 'Agregar la de ' + etiquetaVariante(p) + ' igual' },
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
      '<option value="' + u + '"' + (u === p.uni ? ' selected' : '') + '>' + (u === 'u' ? 'unid.' : u) + '</option>').join('') + '</select>';
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
function iniciarVariantesForm(p) {
  window._varHijo = (p && p.gramajePadreId) ? p : null;
  window._varFilas = [];
  if (!p || p.gramajePadreId) return;
  const peso = p.tipoVenta === 'peso';
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
        oculto: v.oculto === true,
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
  return { costo: costo, c: c, precio: Math.round(costo * (1 + pct / 100)), may: _varMay(Math.round(costo * (1 + pctMay / 100))) };
}

function _resFilaVar(r, peso) {
  if (r.costo === null) {
    const sinTam = !r.c || (peso && r.c.unidad !== 'g');
    return '<span class="vfe-falta">' + (sinTam ? (peso ? 'Poné de cuánto es la bolsa.' : 'Poné el tamaño.') : 'Poné el costo.') + '</span>';
  }
  const kg = peso ? ' el kilo' : '';
  return (peso ? '<span>Costo $' + r.costo.toLocaleString('es-AR') + ' el kilo</span>' : '') +
    '<span>Precio <b>$' + r.precio.toLocaleString('es-AR') + '</b>' + kg + '</span>' +
    '<span class="vfe-may">Mayorista $' + r.may.toLocaleString('es-AR') + kg + '</span>';
}

function _filaVarHtml(f, i, peso) {
  const ev = campo => 'varFilaCambio(' + i + ',\'' + campo + '\',this.value)';
  return '<div class="vfe" data-i="' + i + '">' +
    '<div class="vfe-fila">' +
      '<label class="vfe-campo vfe-tam"><span>' + (peso ? 'Bolsa de' : 'Tamaño') + '</span>' +
        _tamWidgetHtml(f.tam, peso, 'varFilaTam(' + i + ',this)', peso ? '3' : '160') + '</label>' +
      '<label class="vfe-campo vfe-costo"><span>' + (peso ? 'Costo de la bolsa' : 'Costo') + '</span>' +
        '<input type="text" inputmode="numeric" class="form-input" value="' + _varAttr(f.costoIn) + '" oninput="if(typeof limpiarMonto===\'function\')limpiarMonto(this);' + ev('costoIn') + '"></label>' +
      '<label class="vfe-campo vfe-stock"><span>Stock' + (peso ? ' (gramos)' : ' (unitario)') + '</span>' +
        '<input type="number" class="form-input" value="' + _varAttr(f.stock) + '" step="1" oninput="' + ev('stock') + '"></label>' +
      (f.id
        ? '<button type="button" class="vfe-btn" title="Abrir su ficha (lo que no guardaste acá se pierde)" onclick="closeModal();openModal(\'' + _varAttr(f.id) + '\')"><i class="bi bi-box-arrow-up-right"></i></button>'
        : '<button type="button" class="vfe-btn" title="Quitar" onclick="varFilaQuitar(' + i + ')"><i class="bi bi-x-lg"></i></button>') +
    '</div>' +
    '<div class="vfe-fila">' +
      /* Hasta 999%: ver limpiarPorcentaje en admin.html. */
      '<label class="vfe-campo"><span>% ganancia</span><input type="text" inputmode="decimal" class="form-input" value="' + _varAttr(f.pct) +
        '" oninput="if(typeof limpiarPorcentaje===\'function\')limpiarPorcentaje(this);' + ev('pct') + '"></label>' +
      '<label class="vfe-campo"><span>% mayorista</span><input type="text" inputmode="decimal" class="form-input" value="' + _varAttr(f.pctMay) +
        '" oninput="if(typeof limpiarPorcentaje===\'function\')limpiarPorcentaje(this);' + ev('pctMay') + '"></label>' +
      '<div class="vfe-res">' + _resFilaVar(_calcFilaVar(f, peso), peso) + '</div>' +
    '</div>' +
    (f.oculto ? '<p class="vfe-nota">Oculta: no aparece en la venta ni en la tienda.</p>' : '') +
  '</div>';
}

function pintarVariantesForm() {
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
  const g = document.getElementById('pGramaje');
  let h = '<p class="var-ayuda">' + (peso
    ? 'Si comprás este producto en bolsas de distinto tamaño, cargá cada una con lo que te costó y su ganancia. ' +
      'Al vender, el precio sale solo de la cantidad: con 3 kg o más se cobra el de la bolsa de 3 kg.'
    : 'Si el mismo producto viene en otros tamaños (maní x 80 g y x 160 g), cargá cada uno con su costo y su ganancia. ' +
      'En la venta y en la tienda se ven como un solo producto.') + '</p>';
  h += '<label class="var-tam-ppal"><span>' + (peso ? 'Este producto es la bolsa de' : 'Este producto es el de') + '</span>' +
    _tamWidgetHtml(g ? g.value : '', peso, 'varTamPrincipal(this)', peso ? '1' : '80', ' id="pVarTam"') + '</label>';
  h += '<div class="var-filas">' + filas.map((f, i) => _filaVarHtml(f, i, peso)).join('') + '</div>';
  h += '<button type="button" class="btn btn-secondary btn-sm var-agregar" onclick="varFilaAgregar()"><i class="bi bi-plus-lg"></i> ' +
    (peso ? 'Agregar bolsa' : 'Agregar presentación') + '</button>';
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
  if (res) res.innerHTML = _resFilaVar(_calcFilaVar(f, _varEsPeso()), _varEsPeso());
}

/* Una fila nueva, con la ganancia y el mayorista del producto de arriba. */
function varFilaAgregar() {
  const filas = window._varFilas || (window._varFilas = []);
  const val = id => { const e = document.getElementById(id); return e ? e.value : ''; };
  filas.push({ id: null, tam: '', costoIn: '', pct: Number(val('pPorcentaje')) || 0, pctMay: Number(val('pPorcentajeMay')) || 0, stock: 0, tocado: {} });
  pintarVariantesForm();
  setTimeout(() => {
    const ins = document.querySelectorAll('#pVariantes .vfe-tam input');
    const ult = ins[ins.length - 1];
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

/* "Este producto es la bolsa de..." es el mismo campo que Gramaje / Presentación.
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
    const r = _varOpenModal.apply(this, arguments);
    iniciarVariantesForm(id ? (_varProds().find(x => x && x.id === id) || null) : null);
    pintarVariantesForm();
    return r;
  };
}
if (typeof setTipoVenta === 'function') {
  const _varSetTipoVenta = setTipoVenta;
  setTipoVenta = function () {
    const r = _varSetTipoVenta.apply(this, arguments);
    pintarVariantesForm();
    return r;
  };
}
(function () {
  /* Si se escribe en Gramaje / Presentación, el campo de la tabla lo sigue. */
  const g = document.getElementById('pGramaje');
  if (g) g.addEventListener('input', () => {
    const t = document.getElementById('pVarTam');
    if (!t || document.activeElement === t) return;
    const p = _tamPartes(g.value, _varEsPeso());
    t.value = p.num;
    const w = t.closest ? t.closest('.vfe-tamw') : null;
    const sel = w ? w.querySelector('select') : null;
    if (sel && document.activeElement !== sel) sel.value = p.uni;
  });
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
  if (window._varianteDeNueva) {
    const g = document.getElementById('pGramaje');
    if (g && g.value.trim()) return false;
    aviso('Poné la presentación de la variante: 160 g, 3 kg, x12...');
    if (g) g.focus();
    return true;
  }
  const filas = window._varFilas || [];
  if (!filas.some(f => !f.id || Object.keys(f.tocado || {}).length)) return false;
  const peso = _varEsPeso();
  const que = peso ? 'bolsa' : 'presentación';
  const g = document.getElementById('pGramaje'), n = document.getElementById('pNombre');
  const foco = (i, sel) => { const e = document.querySelector('#pVariantes .vfe[data-i="' + i + '"] ' + sel); if (e) e.focus(); };
  const cp = contenidoDeVariante({ gramaje: g ? g.value : '', nombre: n ? n.value : '' });
  if (!cp || (peso && cp.unidad !== 'g')) {
    aviso(peso ? 'Poné de cuánto es la bolsa de este producto (ej. 1 kg), en "Este producto es la bolsa de".'
      : 'Poné el tamaño de este producto (ej. 80 g), en "Este producto es el de".');
    const t = document.getElementById('pVarTam');
    if (t) t.focus();
    return true;
  }
  const vistos = new Set([cp.unidad + cp.valor]);
  for (let i = 0; i < filas.length; i++) {
    const f = filas[i];
    const c = contenidoDeVariante({ gramaje: f.tam });
    if (!String(f.tam || '').trim() || !c) { aviso('Falta el tamaño de una ' + que + ' (ej. ' + (peso ? '3 kg' : '160 g') + ').'); foco(i, '.vfe-tam input'); return true; }
    if (peso && c.unidad !== 'g') { aviso('El tamaño de una bolsa va en kg o g: "' + f.tam + '".'); foco(i, '.vfe-tam input'); return true; }
    if (vistos.has(c.unidad + c.valor)) { aviso('Hay dos del mismo tamaño: ' + f.tam + '.'); foco(i, '.vfe-tam input'); return true; }
    vistos.add(c.unidad + c.valor);
    if (!f.id && !(_varMonto(f.costoIn) > 0)) { aviso('Poné el costo de la ' + que + ' de ' + f.tam + '.'); foco(i, '.vfe-costo input'); return true; }
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
  if (base && data.nombre === base && data.gramaje) data.nombre = base + ' x ' + data.gramaje;
  return data;
}

/* Crea las filas nuevas y guarda las que se tocaron. El producto ya está guardado:
   si algo falla acá se avisa y NO se corta, porque volver a guardar crearía el
   producto otra vez. Lo que no se guardó se vuelve a cargar desde su ficha. */
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
          nombre: base + ' x ' + tam, nombreMostrado: null, gramaje: tam, codigoBarras: null,
          costo: r.costo, porcentaje: Number(f.pct) || 0, precio: r.precio,
          porcentajeMayorista: Number(f.pctMay) || 0, precioMayorista: r.may, descuento: 0,
          stock: parseInt(f.stock, 10) || 0,
          categoria: data.categoria || '', subcategoria: data.subcategoria || null,
          descripcion: data.descripcion || '', valoresNutricionales: data.valoresNutricionales || '',
          imagenesExtra: [], imagen: data.imagen || null, lista: data.lista || null,
          codigo: codigo, tipoVenta: peso ? 'peso' : 'unidad',
          gramajePadreId: principalId, creadoEn: new Date(),
        };
        const ref = await db.collection('productos').add(nuevo);
        hechos.push(ref.id);
        if (typeof logAction === 'function') logAction('crear', 'Creado: ' + nuevo.nombre, 'Variante de ' + data.nombre + ' | $' + nuevo.precio + ' | stock:' + nuevo.stock);
        continue;
      }
      const old = _varProds().find(x => x && x.id === f.id) || {};
      const t = f.tocado || {};
      const upd = {};
      let costo = Number(old.costo || 0);
      if (t.costoIn && r.costo !== null) { costo = r.costo; upd.costo = costo; }
      if (t.costoIn || t.pct || t.pctMay) {
        const pct = t.pct ? (Number(f.pct) || 0) : Number(old.porcentaje || 0);
        const pctMay = t.pctMay ? (Number(f.pctMay) || 0) : Number(old.porcentajeMayorista || 0);
        upd.porcentaje = pct;
        upd.precio = Math.round(costo * (1 + pct / 100));
        upd.porcentajeMayorista = pctMay;
        upd.precioMayorista = _varMay(Math.round(costo * (1 + pctMay / 100)));
      }
      if (t.stock) upd.stock = parseInt(f.stock, 10) || 0;
      if (t.tam && tam && tam !== (old.gramaje || '')) {
        upd.gramaje = tam;
        if (old.nombre && f.tamAntes && old.nombre === base + ' x ' + f.tamAntes) upd.nombre = base + ' x ' + tam;
      }
      if (!Object.keys(upd).length) continue;
      await db.collection('productos').doc(f.id).update(upd);
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
