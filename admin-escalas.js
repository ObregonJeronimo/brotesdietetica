/* =============================================================================
   ESCALAS DE GRANEL  —  Brotes Dietética
   =============================================================================
   Etapa 2 de las variantes (pedido del comercio, 24/09/2026; ver admin-variantes.js).
   Un producto a granel que se compra en bolsas de distinto tamaño -yerba de 1 kg,
   3 kg y 5 kg- tiene una ESCALA por bolsa: una variante por peso con su tamaño en la
   presentación ("3 kg"), su costo, su precio por kilo y su stock.

   AL VENDER se ponen los gramos y el precio sale solo:
   - Se cobra la escala más grande que no supera lo que se lleva: 700 g paga la de
     1 kg (la más chica), 2,9 kg también, y 3,1 kg la de 3 kg.
   - Si llevando más paga menos (2,9 kg a precio de 1 kg salen más que 3 kg a precio
     de 3 kg), se avisa, y el que atiende decide si se lo ofrece al cliente.
   - El stock sale de la bolsa de la escala que se cobra. Si no alcanza, se completa
     con la del peso siguiente, y si no hay siguiente, con la anterior. Siempre se
     avisa cuánto sale de cada bolsa y cuánto se gana de más o de menos: cada bolsa
     se compró a otro precio por kilo.

   EN LA VENTA SE VE UNA LÍNEA POR PRODUCTO. Por dentro son tantos renglones como
   bolsas de las que sale, todos al precio de la escala que se cobra: así el stock se
   descuenta de la bolsa que corresponde y la ganancia usa el costo de cada una, sin
   tocar nada de lo que ya cuenta stock y ganancia (guardar, editar y borrar ventas,
   estadísticas). vistaItemsVenta() los junta solamente para dibujarlos.

   Con una sola escala no hay nada que elegir: se vende como cualquier producto por
   peso. En el formulario, además, se puede cargar lo que costó la bolsa y el costo
   por kilo sale solo.
   ============================================================================= */

const _ESC_NL = String.fromCharCode(10);
const _escProds = () => (typeof allProducts !== 'undefined' && Array.isArray(allProducts) ? allProducts : []);
const _escPeso = g => (typeof fmtPeso === 'function' ? fmtPeso(g) : (typeof _dlgPeso === 'function' ? _dlgPeso(g) : g + ' g'));
const _escPlata = n => '$' + Math.round(Number(n || 0)).toLocaleString('es-AR');

/* ----------------------------------------------------------- LAS ESCALAS */

/* Las escalas de un grupo: sus variantes por peso que dicen su tamaño en gramos, de
   la más chica a la más grande, sin ocultas ni depuradas. Con menos de dos, ninguna. */
function escalasDelGrupo(principal, productos) {
  if (!principal || typeof variantesDeGrupo !== 'function') return [];
  const prods = productos || _escProds();
  const lista = variantesDeGrupo(principal, prods)
    .filter(v => v.tipoVenta === 'peso')
    .map(v => ({ v: v, c: contenidoDeVariante(v) }))
    .filter(x => x.c && x.c.unidad === 'g' && x.c.valor > 0)
    .sort((a, b) => a.c.valor - b.c.valor)
    .map(x => ({ id: x.v.id, producto: x.v, desde: x.c.valor, etiqueta: _escPeso(x.c.valor) }));
  return lista.length >= 2 ? lista : [];
}

/* Las escalas del producto `p`, si es una de ellas. Una variante por peso que no dice
   su tamaño ("Yerba suelta") no es escala: se vende sola, como siempre. */
function escalasDe(p, productos) {
  if (!p || p.tipoVenta !== 'peso' || typeof principalDeVariante !== 'function') return [];
  const prods = productos || _escProds();
  const esc = escalasDelGrupo(principalDeVariante(p, prods), prods);
  return esc.some(e => e.id === p.id) ? esc : [];
}

/* La que se cobra: la más grande que no supera lo que se lleva. Por debajo de la más
   chica, la más chica. */
function escalaPara(escalas, gramos) {
  let e = escalas[0];
  escalas.forEach(x => { if (x.desde <= gramos) e = x; });
  return e;
}

/* Precio de lista del kilo. En la mayorista, el mayorista (o el de mostrador si no
   tiene, igual que addVentaMayItem). */
function precioKgEscala(e, ctx) {
  const p = e.producto;
  return Number(ctx === 'may' ? (p.precioMayorista || p.precio || 0) : (p.precio || 0));
}
function descuentoEscala(e, ctx) {
  return ctx === 'may' ? 0 : Math.min(100, Math.max(0, Number(e.producto.descuento || 0)));
}
/* Lo que se cobra el kilo, con el descuento: la misma cuenta que precioConDsc. */
function precioFinalKg(e, ctx, dsc) {
  const d = dsc != null ? Number(dsc) : descuentoEscala(e, ctx);
  return Math.round(precioKgEscala(e, ctx) * (1 - d / 100));
}
/* Lo que sale llevar esos gramos a precio de la escala: la misma cuenta que subtotalItem. */
function cobroEscala(e, gramos, ctx, dsc) {
  return Math.round(precioFinalKg(e, ctx, dsc) * gramos / 1000);
}

/* Si llevando más paga menos, la escala que conviene (la de menor total), o null. */
function llevandoMas(escalas, gramos, ctx, dsc) {
  if (!escalas || !escalas.length) return null;
  const cobra = escalaPara(escalas, gramos);
  const total = cobroEscala(cobra, gramos, ctx, dsc);
  let mejor = null;
  escalas.forEach(x => {
    if (x.desde <= gramos) return;
    const t = cobroEscala(x, x.desde, ctx, dsc);
    if (t < total && (!mejor || t < mejor.total)) mejor = { escala: x, gramos: x.desde, total: t };
  });
  return mejor ? { cobra: cobra, gramos: gramos, total: total, mejor: mejor } : null;
}

/* De qué bolsa sale cada gramo: primero la de la escala que se cobra, después las de
   peso siguiente (de menor a mayor) y al final las anteriores (de mayor a menor).
   `disponible(escala)` dice cuánto hay de cada una. Lo que no alcanza ni sumando
   todas queda en la que se cobra: el stock queda en negativo, como pasa hoy con
   cualquier producto (en el mostrador no se frena una venta que ya ocurrió). */
function repartirStock(escalas, cobra, gramos, disponible) {
  const disp = disponible || (e => Math.max(0, Number(e.producto.stock || 0)));
  const i = escalas.indexOf(cobra);
  const orden = [cobra].concat(escalas.slice(i + 1), escalas.slice(0, i).reverse());
  let resta = gramos;
  const partes = [];
  orden.forEach(e => {
    if (resta <= 0) return;
    const toma = Math.min(Math.max(0, disp(e)), resta);
    if (toma > 0) { partes.push({ escala: e, gramos: toma }); resta -= toma; }
  });
  const falta = resta;
  if (resta > 0) {
    const p0 = partes.find(x => x.escala === cobra);
    if (p0) p0.gramos += resta; else partes.unshift({ escala: cobra, gramos: resta });
  }
  return { partes: partes, falta: falta };
}

/* La mezcla, si la hay: lo que sale de otras bolsas, cuánto se gana de más (positivo)
   o de menos (negativo) que si todo saliera de la bolsa de la escala que se cobra, y
   lo que se vende por debajo de lo que costó. Sin el costo de alguna, la diferencia
   no se puede calcular y queda en null. */
function mezclaDe(reparto, cobra, ctx, dsc) {
  const otras = reparto.partes.filter(x => x.escala !== cobra);
  if (!otras.length) return null;
  const costo = e => Number(e.producto.costo || 0);
  const precio = precioFinalKg(cobra, ctx, dsc);
  const sinCosto = [cobra].concat(otras.map(x => x.escala)).filter(e => !(costo(e) > 0));
  const diferencia = sinCosto.length ? null
    : otras.reduce((s, x) => s + Math.round((costo(cobra) - costo(x.escala)) * x.gramos / 1000), 0);
  const bajoCosto = otras.filter(x => costo(x.escala) > precio)
    .map(x => ({ escala: x.escala, gramos: x.gramos, perdida: Math.round((costo(x.escala) - precio) * x.gramos / 1000) }));
  return { otras: otras, diferencia: diferencia, sinCosto: sinCosto, bajoCosto: bajoCosto };
}

function _escNombre(e) {
  return (typeof nombreDeGrupo === 'function' && typeof principalDeVariante === 'function')
    ? nombreDeGrupo(principalDeVariante(e.producto, _escProds())) : (e.producto.nombre || '');
}

function mensajeLlevandoMas(lm, ctx, dsc) {
  return _escNombre(lm.cobra) + ': ' + _escPeso(lm.gramos) + ' a precio de la escala de ' + lm.cobra.etiqueta +
    ' (' + _escPlata(precioFinalKg(lm.cobra, ctx, dsc)) + ' el kilo) salen ' + _escPlata(lm.total) + '.' + _ESC_NL + _ESC_NL +
    'Llevando ' + _escPeso(lm.mejor.gramos) + ', a precio de la escala de ' + lm.mejor.escala.etiqueta +
    ' (' + _escPlata(precioFinalKg(lm.mejor.escala, ctx, dsc)) + ' el kilo), paga ' + _escPlata(lm.mejor.total) +
    ': ' + _escPlata(lm.total - lm.mejor.total) + ' menos.';
}

function mensajeMezcla(reparto, cobra, mz, gramos, ctx, dsc, quedan) {
  const L = [];
  L.push(_escNombre(cobra) + ': ' + _escPeso(gramos) + ' a precio de la escala de ' + cobra.etiqueta +
    ' (' + _escPlata(precioFinalKg(cobra, ctx, dsc)) + ' el kilo).');
  L.push(quedan > 0
    ? 'De la bolsa de ' + cobra.etiqueta + ' quedan ' + _escPeso(quedan) + ': el resto sale de otra bolsa.'
    : 'De la bolsa de ' + cobra.etiqueta + ' no queda stock: sale de otra bolsa.');
  L.push('');
  reparto.partes.forEach(x => {
    const c = Number(x.escala.producto.costo || 0);
    L.push('• ' + _escPeso(x.gramos) + ' de la bolsa de ' + x.escala.etiqueta +
      (c > 0 ? ' (costo ' + _escPlata(c) + ' el kilo)' : ' (sin costo cargado)'));
  });
  L.push('');
  if (mz.diferencia === null) {
    L.push('No se puede calcular cuánto se gana: falta el costo de la bolsa de ' + mz.sinCosto.map(e => e.etiqueta).join(' y de la de ') + '.');
  } else if (mz.diferencia > 0) {
    L.push('A favor: ganás ' + _escPlata(mz.diferencia) + ' más que si todo saliera de la bolsa de ' + cobra.etiqueta + '.');
  } else if (mz.diferencia < 0) {
    L.push('En contra: ganás ' + _escPlata(-mz.diferencia) + ' menos que si todo saliera de la bolsa de ' + cobra.etiqueta + '.');
  } else {
    L.push('Da lo mismo: las bolsas costaron igual.');
  }
  mz.bajoCosto.forEach(b => {
    L.push('Ojo: ' + _escPeso(b.gramos) + ' salen de la bolsa de ' + b.escala.etiqueta +
      ', que costó más de lo que se cobra: se pierden ' + _escPlata(b.perdida) + '.');
  });
  if (reparto.falta > 0) {
    L.push('Ni sumando las otras bolsas alcanza: faltan ' + _escPeso(reparto.falta) +
      ', que quedan en negativo en la de ' + cobra.etiqueta + '.');
  }
  return L.join(_ESC_NL);
}

/* ---------------------------------------------------------------- LA VENTA */

function _escLista(ctx) { return ctx === 'may' ? ventaMayItems : ventaItems; }
function _escPoner(ctx, arr) { if (ctx === 'may') ventaMayItems = arr; else ventaItems = arr; }
function _escRepintar(ctx) { if (ctx === 'may') renderVentaMayItems(); else renderVentaItems(); }

/* Los renglones de la venta que son de estas escalas. */
function lineasDeEscalas(lista, escalas) {
  const ids = new Set(escalas.map(e => e.id));
  return (lista || []).filter(it => it && ids.has(it.id));
}

/* Cuánto hay de cada bolsa para esta venta: su stock, más lo que ya había descontado
   la venta que se está editando, que se le devuelve al guardar. */
function disponibleParaVenta(ctx) {
  const orig = {};
  const sumar = items => (items || []).forEach(i => { if (i && i.id) orig[i.id] = (orig[i.id] || 0) + Number(i.cantidad || 0); });
  try {
    if (ctx === 'may') {
      if (typeof editingVentaMayId !== 'undefined' && editingVentaMayId && typeof ventasMayData !== 'undefined') {
        const v = ventasMayData.find(x => x.id === editingVentaMayId);
        if (v && v.stockDescontado) sumar(v.items);
      }
    } else if (typeof editingVentaId !== 'undefined' && editingVentaId && typeof editingVentaOriginal !== 'undefined' &&
               editingVentaOriginal && editingVentaOriginal.stockDescontado) {
      sumar(editingVentaOriginal.items);
    }
  } catch (e) { /* sin venta en edición: solo el stock */ }
  return e => Math.max(0, Number(e.producto.stock || 0) + (orig[e.id] || 0));
}

/* Lo que muestra el diálogo de gramos: el precio de cada escala y el total en vivo,
   con la escala que va a tocar según lo que ya hay en la venta más lo nuevo. */
function opcionesGramosEscalas(escalas, ctx, ya, dsc, disponible) {
  const disp = disponible || disponibleParaVenta(ctx);
  const precios = escalas.map((e, i) => (i ? 'desde ' : '') + e.etiqueta + ': ' + _escPlata(precioFinalKg(e, ctx, dsc))).join(' · ') + ' el kilo';
  const hay = escalas.reduce((s, e) => s + disp(e), 0) - ya;
  const antes = ya > 0 ? escalaPara(escalas, ya) : null;
  return {
    nombre: _escNombre(escalas[0]),
    detalle: precios + (ya > 0 ? ' · ya hay ' + _escPeso(ya) + ' en la venta' : ''),
    stock: Math.max(0, hay),
    cotizar: g => {
      const e = escalaPara(escalas, ya + g);
      const pk = precioFinalKg(e, ctx, dsc);
      return {
        total: Math.round(pk * g / 1000),
        nota: 'Escala de ' + e.etiqueta + ': ' + _escPlata(pk) + ' el kilo.' +
          (antes && antes !== e ? ' Lo que ya estaba en la venta pasa a este precio.' : ''),
      };
    },
  };
}

/* Suma gramos de un producto con escalas a la venta. Devuelve 'no' si no tiene
   escalas (el que llama sigue como siempre), 'hecho' o 'cancelar'. */
async function agregarGranelVenta(p, ctx) {
  const escalas = escalasDe(p);
  if (!escalas.length) return 'no';
  const lineas = lineasDeEscalas(_escLista(ctx), escalas);
  const ya = lineas.reduce((s, it) => s + Number(it.cantidad || 0), 0);
  const dsc = lineas.length ? Number(lineas[0].descuento || 0) : null;
  const gr = await pedirCantidadPeso(p, opcionesGramosEscalas(escalas, ctx, ya, dsc));
  if (gr == null) return 'cancelar';
  return fijarGranelVenta(escalas, ya + gr, ctx, { dsc: dsc });
}

/* Deja al producto con `total` gramos en la venta: elige la escala, avisa si llevando
   más paga menos, reparte el stock entre las bolsas y avisa si mezcla. Si se cancela
   cualquiera de los avisos, la venta queda como estaba. */
async function fijarGranelVenta(escalas, total, ctx, opts) {
  const o = opts || {};
  const dsc = o.dsc != null ? o.dsc : null;
  let gramos = total;
  let cobra = escalaPara(escalas, gramos);
  const lm = llevandoMas(escalas, gramos, ctx, dsc);
  if (lm && typeof pedirOpcion === 'function') {
    const r = await pedirOpcion(mensajeLlevandoMas(lm, ctx, dsc), {
      titulo: 'Llevando más, paga menos',
      icono: 'bi-arrow-down-circle',
      opciones: [
        { valor: 'igual', texto: 'Cobrar ' + _escPeso(gramos) + ' (' + _escPlata(lm.total) + ')', principal: true },
        { valor: 'mas', texto: 'Cambiar a ' + _escPeso(lm.mejor.gramos) + ' (' + _escPlata(lm.mejor.total) + ')' },
      ],
    });
    if (r === null) return 'cancelar';
    if (r === 'mas') { gramos = lm.mejor.gramos; cobra = lm.mejor.escala; }
  }
  const disp = disponibleParaVenta(ctx);
  const reparto = repartirStock(escalas, cobra, gramos, disp);
  const mz = mezclaDe(reparto, cobra, ctx, dsc);
  if (mz && typeof pedirConfirmacion === 'function') {
    const ok = await pedirConfirmacion(mensajeMezcla(reparto, cobra, mz, gramos, ctx, dsc, disp(cobra)), {
      titulo: 'Mezcla de stock', icono: 'bi-shuffle', aceptar: 'Vender así', cancelar: 'Cancelar',
    });
    if (!ok) return 'cancelar';
  }
  aplicarGranelVenta(escalas, cobra, reparto.partes, ctx, dsc);
  return 'hecho';
}

/* Reemplaza los renglones del producto por los del reparto, en el mismo lugar de la
   lista. Todos al precio de la escala que se cobra; cada uno con el costo de su bolsa. */
function aplicarGranelVenta(escalas, cobra, partes, ctx, dsc) {
  const lista = _escLista(ctx);
  const ids = new Set(escalas.map(e => e.id));
  const pos = lista.findIndex(it => it && ids.has(it.id));
  const resto = lista.filter(it => !(it && ids.has(it.id)));
  const d = dsc != null ? Number(dsc) : descuentoEscala(cobra, ctx);
  const nombre = _escNombre(cobra);
  const nuevas = partes.filter(x => x.gramos > 0).map(x => ({
    id: x.escala.id,
    nombre: nombre,
    precio: precioKgEscala(cobra, ctx),
    costo: Number(x.escala.producto.costo || 0),
    cantidad: x.gramos,
    descuento: d,
    tipoVenta: 'peso',
    /* A qué escala se cobró: para la línea de la venta y para el historial. */
    escala: cobra.etiqueta,
    escalaId: cobra.id,
  }));
  const en = pos < 0 ? resto.length : pos;
  _escPoner(ctx, resto.slice(0, en).concat(nuevas, resto.slice(en)));
  _escRepintar(ctx);
}

/* Lo que se DIBUJA en la lista de la venta: los renglones de un mismo producto con
   escalas van en una sola línea, con el total de gramos y la suma de sus subtotales.
   Los renglones de verdad no se tocan: son los que se guardan. */
function vistaItemsVenta(items) {
  const lista = items || [];
  const prods = _escProds();
  const grupoDe = new Map();
  lista.forEach(it => {
    if (!it || !it.id || it.tipoVenta !== 'peso' || grupoDe.has(it.id)) return;
    const p = prods.find(x => x.id === it.id);
    const esc = p ? escalasDe(p, prods) : [];
    if (esc.length) grupoDe.set(it.id, esc);
  });
  if (!grupoDe.size) return lista;
  const out = [];
  const hechos = new Set();
  lista.forEach(it => {
    const esc = it && grupoDe.get(it.id);
    if (!esc) { out.push(it); return; }
    const clave = esc[0].id;
    if (hechos.has(clave)) return;
    hechos.add(clave);
    const lineas = lista.filter(x => x && grupoDe.has(x.id) && grupoDe.get(x.id)[0].id === clave);
    const total = lineas.reduce((s, x) => s + Number(x.cantidad || 0), 0);
    const cobra = esc.find(e => e.id === lineas[0].escalaId) || escalaPara(esc, total);
    out.push({
      id: cobra.id,
      nombre: lineas[0].nombre,
      precio: Number(lineas[0].precio || 0),
      costo: 0,
      cantidad: total,
      descuento: Number(lineas[0].descuento || 0),
      tipoVenta: 'peso',
      __sub: lineas.reduce((s, x) => s + subtotalItem(x), 0),
      __detalle: detalleLineaGranel(cobra, lineas, esc),
    });
  });
  return out;
}

function detalleLineaGranel(cobra, lineas, escalas) {
  const txt = 'Escala de ' + cobra.etiqueta;
  if (lineas.length === 1 && lineas[0].id === cobra.id) return txt;
  return txt + ' · sale ' + lineas.map(x => {
    const e = escalas.find(y => y.id === x.id);
    return _escPeso(x.cantidad) + ' de la bolsa de ' + (e ? e.etiqueta : '?');
  }).join(' y ');
}

/* La línea de un producto con escalas maneja todos sus renglones juntos: cambiar los
   gramos lo vuelve a calcular entero, sacarla saca todos, y el descuento va a todos. */
function _grupoDeLinea(id, lista) {
  const prods = _escProds();
  const p = prods.find(x => x.id === id);
  const esc = p ? escalasDe(p, prods) : [];
  if (!esc.length) return null;
  const lineas = lineasDeEscalas(lista, esc);
  return lineas.length ? { escalas: esc, lineas: lineas } : null;
}

async function cambiarGramosGranel(g, val, ctx) {
  const total = Math.max(1, parseInt(val, 10) || 1);
  const r = await fijarGranelVenta(g.escalas, total, ctx, { dsc: Number(g.lineas[0].descuento || 0) });
  /* Cancelado: se repinta para que el campo vuelva a los gramos que había. */
  if (r !== 'hecho') _escRepintar(ctx);
  return r;
}

function quitarGranel(g, ctx) {
  const fuera = new Set(g.lineas);
  _escPoner(ctx, _escLista(ctx).filter(it => !fuera.has(it)));
  _escRepintar(ctx);
}

/* Como setVentaItemDsc, sin repintar la lista: se escribe en el campo del descuento
   y repintar le sacaría el foco a cada tecla. */
function descuentoGranel(g, id, val, ctx) {
  const pct = Math.min(100, Math.max(0, parseInt(val, 10) || 0));
  g.lineas.forEach(it => { it.descuento = pct; });
  const suf = ctx === 'may' ? 'may' : 'vta';
  const wrap = document.getElementById('dscwrap-' + suf + '-' + id);
  const inp = wrap && wrap.querySelector('input');
  if (inp && parseInt(inp.value, 10) !== pct) inp.value = pct;
  const fila = wrap && wrap.closest('.venta-item');
  if (fila) {
    const sub = fila.querySelector('.vi-sub');
    if (sub) sub.textContent = '$' + g.lineas.reduce((s, it) => s + subtotalItem(it), 0).toLocaleString('es-AR');
    const badge = document.getElementById('badge-' + suf + '-' + id);
    if (badge) { badge.textContent = pct > 0 ? '-' + pct + '%' : ''; badge.style.display = pct > 0 ? 'inline' : 'none'; }
  }
  const t = ctx === 'may' ? calcVentaMayTotales() : calcularTotalesVenta();
  const tot = document.getElementById(ctx === 'may' ? 'ventaMayTotal' : 'ventaTotal');
  if (tot) tot.textContent = '$' + t.total.toLocaleString('es-AR');
}

/* Se envuelven los manejadores de la lista de la venta (minorista y mayorista) en vez
   de tocarlos por dentro: con un producto que no tiene escalas hacen lo de siempre. */
function _escEnvolver(nombre, lista, hacer) {
  const orig = (typeof window !== 'undefined') ? window[nombre] : undefined;
  if (typeof orig !== 'function') return;
  window[nombre] = function (id, val) {
    const g = _grupoDeLinea(id, lista());
    if (!g) return orig.apply(this, arguments);
    return hacer(g, id, val);
  };
}
_escEnvolver('updateVentaQty', () => ventaItems, (g, id, val) => cambiarGramosGranel(g, val, 'min'));
_escEnvolver('updateVentaMayQty', () => ventaMayItems, (g, id, val) => cambiarGramosGranel(g, val, 'may'));
_escEnvolver('removeVentaItem', () => ventaItems, g => quitarGranel(g, 'min'));
_escEnvolver('removeVentaMayItem', () => ventaMayItems, g => quitarGranel(g, 'may'));
_escEnvolver('setVentaItemDsc', () => ventaItems, (g, id, val) => descuentoGranel(g, id, val, 'min'));
_escEnvolver('setVentaMayItemDsc', () => ventaMayItems, (g, id, val) => descuentoGranel(g, id, val, 'may'));

/* ------------------------------------------------ EL COSTO DE LA BOLSA */
/* El costo de un producto por peso es por kilo, pero lo que está a mano es la
   factura: "la bolsa de 3 kg me salió $2.600". Se carga eso y el costo por kilo sale
   solo. Aparece en los productos por peso con su tamaño en Gramaje / Presentación. */
function pintarCostoBolsa() {
  const cont = document.getElementById('pCostoBolsa');
  if (!cont) return;
  const peso = typeof _tipoVentaProd !== 'undefined' && _tipoVentaProd === 'peso';
  const gEl = document.getElementById('pGramaje');
  const c = typeof contenidoDeVariante === 'function' ? contenidoDeVariante({ gramaje: gEl ? gEl.value : '' }) : null;
  if (!peso || !c || c.unidad !== 'g' || !(c.valor > 0)) { cont.hidden = true; cont.innerHTML = ''; return; }
  let inp = cont.querySelector('input');
  if (!inp) {
    cont.innerHTML = '<label class="cb-lbl" for="pCostoBolsaInput">¿Tenés lo que costó la bolsa? Bolsa de <span class="cb-tam"></span>:</label>' +
      '<div class="cb-fila"><span class="cb-signo">$</span>' +
      '<input type="text" inputmode="numeric" class="form-input cb-input" id="pCostoBolsaInput" autocomplete="off" placeholder="lo que dice la factura"></div>' +
      '<small class="cb-nota"></small>';
    inp = cont.querySelector('input');
    inp.addEventListener('input', () => costoBolsaEscrito(inp));
  }
  cont.hidden = false;
  cont.querySelector('.cb-tam').textContent = _escPeso(c.valor);
  if (document.activeElement === inp && inp.value) return;
  const costoKg = typeof montoAR === 'function' ? montoAR((document.getElementById('pCosto') || {}).value) : 0;
  cont.querySelector('.cb-nota').textContent = costoKg > 0
    ? 'Con ' + _escPlata(costoKg) + ' el kilo, la bolsa de ' + _escPeso(c.valor) + ' sale ' + _escPlata(costoKg * c.valor / 1000) + '.'
    : '';
}

function costoBolsaEscrito(inp) {
  if (typeof limpiarMonto === 'function') limpiarMonto(inp);
  const gEl = document.getElementById('pGramaje');
  const c = contenidoDeVariante({ gramaje: gEl ? gEl.value : '' });
  const nota = document.querySelector('#pCostoBolsa .cb-nota');
  if (!c || c.unidad !== 'g' || !(c.valor > 0)) return;
  const bolsa = typeof montoAR === 'function' ? montoAR(inp.value) : Number(inp.value) || 0;
  if (!bolsa) { if (nota) nota.textContent = ''; return; }
  const costoKg = Math.round(bolsa * 1000 / c.valor);
  const pc = document.getElementById('pCosto');
  if (pc) pc.value = String(costoKg);
  if (typeof calcPrecioModal === 'function') calcPrecioModal();
  if (nota) nota.textContent = '= ' + _escPlata(costoKg) + ' el kilo. Queda cargado arriba, en el costo.';
}

/* Se repinta al abrir el formulario, al cambiar la forma de venta, la presentación o
   el costo. Si se escribe el costo por kilo a mano, lo de la bolsa se borra: ya no
   es lo que dice el costo. */
if (typeof openModal === 'function') {
  const _escOpenModal = openModal;
  openModal = function () {
    const r = _escOpenModal.apply(this, arguments);
    const inp = document.getElementById('pCostoBolsaInput');
    if (inp) inp.value = '';
    pintarCostoBolsa();
    return r;
  };
}
if (typeof setTipoVenta === 'function') {
  const _escSetTipoVenta = setTipoVenta;
  setTipoVenta = function () {
    const r = _escSetTipoVenta.apply(this, arguments);
    pintarCostoBolsa();
    return r;
  };
}
(function () {
  const g = document.getElementById('pGramaje');
  if (g) g.addEventListener('input', pintarCostoBolsa);
  const c = document.getElementById('pCosto');
  if (c) c.addEventListener('input', () => {
    const inp = document.getElementById('pCostoBolsaInput');
    if (inp && document.activeElement !== inp) inp.value = '';
    pintarCostoBolsa();
  });
})();
