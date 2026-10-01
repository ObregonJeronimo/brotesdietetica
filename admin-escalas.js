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
/* Si en esta venta el stock se mira (stockSeMira): lo que no alcanza se avisa. Y si además
   frena (stockFrena; frenaba del 26/09 al 29/09), sin stock suficiente no se vende. Ver
   FRENAR_VENTA_SIN_STOCK en admin-variantes.js. */
const _escMira = ctx => typeof stockSeMira === 'function' && stockSeMira(ctx);
const _escFrena = ctx => typeof stockFrena === 'function' && stockFrena(ctx);

/* ----------------------------------------------------------- LAS ESCALAS */

/* Las escalas de un grupo: sus variantes por peso que dicen su tamaño en gramos, de
   la más chica a la más grande, sin ocultas ni depuradas. Con menos de dos, ninguna. */
function escalasDelGrupo(principal, productos) {
  /* Con el principal oculto o depurado, sus bolsas se venden cada una por separado, a
     su precio: así las muestra la tienda, que no lo tiene (chequeo del 25/09). */
  if (!principal || principal.oculto === true || principal.depurado === true || typeof variantesDeGrupo !== 'function') return [];
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

/* La escala a la que se cobró un renglón (escalaId), si de verdad es una escala del
   grupo de su bolsa. En un pedido web escalaId lo manda el navegador del cliente: uno
   que no cuadra no se usa, y el renglón se mira como uno cualquiera (chequeo del 25/09). */
function escalaDeLinea(it, productos) {
  if (!it || !it.id || !it.escalaId) return null;
  const prods = productos || _escProds();
  const p = prods.find(x => x.id === it.id);
  const esc = p ? escalasDe(p, prods) : [];
  return esc.find(e => e.id === it.escalaId) || null;
}

/* El precio de catálogo que tendría que traer un renglón de un pedido. Un granel con
   escalas, el de la escala que toca por el total de gramos del producto en el pedido
   (la regla de la tienda): si el cliente mandó otra, el precio no cuadra y se avisa. Una
   caja cerrada, el mayorista. Antes se comparaba contra el precio de lista de su propia
   bolsa, y toda caja y toda mezcla de bolsas salían como "precio distinto". */
function precioCatalogoDeLinea(it, items, productos) {
  const prods = productos || _escProds();
  const p = it && prods.find(x => x.id === it.id);
  if (!p) return null;
  const esc = it.escalaId ? escalasDe(p, prods) : [];
  if (esc.length) {
    const ids = new Set(esc.map(e => e.id));
    const total = (items || [it]).filter(x => x && ids.has(x.id)).reduce((s, x) => s + Number(x.cantidad || 0), 0);
    return Number(escalaPara(esc, total).producto.precio || 0);
  }
  return typeof precioMostradorDe === 'function' ? precioMostradorDe(p) : Number(p.precio || 0);
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

/* El descuento que sigue al sumar o cambiar gramos: el que se puso a mano en la línea.
   El de la escala (su oferta) no se arrastra: si cambia de escala va el de la nueva,
   igual que cargando todo de una vez. Antes 500 g + 2.500 g no llevaban la oferta de la
   bolsa de 3 kg, y 3.000 g de una sí (chequeo del 25/09). null = el de cada escala. */
function _dscDeLineas(lineas, escalas, ctx) {
  if (!lineas || !lineas.length) return null;
  const d = Number(lineas[0].descuento || 0);
  const total = lineas.reduce((s, it) => s + Number(it.cantidad || 0), 0);
  const antes = escalas.find(e => e.id === lineas[0].escalaId) || escalaPara(escalas, total);
  return d === descuentoEscala(antes, ctx) ? null : d;
}

/* Si llevando más paga menos, la escala que conviene (la de menor total), o null. */
function llevandoMas(escalas, gramos, ctx, dsc, maxGramos) {
  if (!escalas || !escalas.length) return null;
  const cobra = escalaPara(escalas, gramos);
  const total = cobroEscala(cobra, gramos, ctx, dsc);
  let mejor = null;
  escalas.forEach(x => {
    /* Llevar más de lo que hay no se ofrece: sin stock no se vende (26/09). */
    if (x.desde <= gramos || (maxGramos != null && x.desde > maxGramos)) return;
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
function mezclaDe(reparto, cobra, ctx, dsc, precioKg) {
  const otras = reparto.partes.filter(x => x.escala !== cobra);
  if (!otras.length) return null;
  const costo = e => Number(e.producto.costo || 0);
  /* precioKg: el que se cobra de verdad, si no es el de la lista (el de un pedido). */
  const precio = precioKg != null ? Number(precioKg) : precioFinalKg(cobra, ctx, dsc);
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

/* LOS AVISOS los lee el que atiende, que no tiene por qué saber qué es una "escala": se
   habla de bolsas, de lo que costó cada una y de cuánto se gana. Antes decían "Mezcla de
   stock" y "En contra: ganás $300 menos que si todo saliera de la bolsa de 2 kg", y no se
   entendían (pedido del comercio, 26/09/2026). Las líneas que empiezan con [!], [x] o [+]
   salen en un recuadro de color: ver _dlgTexto en admin-dialogo.js. */

/* "1 kg", "1 kg y 3 kg", "1 kg, 3 kg y 5 kg". */
function _escY(lista) {
  return lista.length < 2 ? (lista[0] || '') : lista.slice(0, -1).join(', ') + ' y ' + lista[lista.length - 1];
}
/* "la bolsa de 1 kg" o "las bolsas de 1 kg y 3 kg", sin repetir. */
function _escBolsas(escalas) {
  const et = [];
  escalas.forEach(e => { if (et.indexOf(e.etiqueta) < 0) et.push(e.etiqueta); });
  return (et.length === 1 ? 'la bolsa de ' : 'las bolsas de ') + _escY(et);
}
function _escMayus(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
/* "el precio de la bolsa de 2 kg", con "mayorista" y el descuento si los hay. */
function _precioDeBolsaTxt(e, ctx, dsc) {
  const d = dsc != null ? Number(dsc) : descuentoEscala(e, ctx);
  return 'el precio' + (ctx === 'may' ? ' mayorista' : '') + ' de la bolsa de ' + e.etiqueta +
    (d > 0 ? ' con el ' + d + '% de descuento' : '');
}

function mensajeLlevandoMas(lm, ctx, dsc) {
  return 'Estás vendiendo ' + _escPeso(lm.gramos) + ' de ' + _escNombre(lm.cobra) + ' a ' +
    _escPlata(precioFinalKg(lm.cobra, ctx, dsc)) + ' el kilo, que es ' + _precioDeBolsaTxt(lm.cobra, ctx, dsc) +
    ': son ' + _escPlata(lm.total) + '.' + _ESC_NL + _ESC_NL +
    '[+] Si lleva ' + _escPeso(lm.mejor.gramos) + ', paga menos: ' + _escPlata(precioFinalKg(lm.mejor.escala, ctx, dsc)) +
    ' el kilo, que es ' + _precioDeBolsaTxt(lm.mejor.escala, ctx, dsc) + '. Son ' + _escPlata(lm.mejor.total) +
    ': se lleva más y paga ' + _escPlata(lm.total - lm.mejor.total) + ' menos.' + _ESC_NL + _ESC_NL +
    'Podés ofrecérselo al cliente.';
}

/* El aviso de cuando la bolsa de la escala que se cobra no alcanza y se completa con
   otras: { mensaje, opts } para pedirConfirmacion. Dice qué se vende y a qué precio, de
   qué bolsa sale cada parte y lo que costó cada una, y cuánto se gana así contra lo que
   se ganaría si todo saliera de la bolsa que se cobra. La plata, con las cuentas de la
   venta: cada renglón se redondea, como en subtotalItem.
   `o`: precioKg si se cobra otro precio que el de la lista (el de un pedido);
   pedido para cuando se pasa un pedido a venta, con todoDeCobra si el pedido lo trae
   todo de la bolsa que se cobra. */
function avisoMezcla(reparto, cobra, mz, gramos, ctx, dsc, quedan, o) {
  const op = o || {};
  const L = [];
  const costo = e => Number(e.producto.costo || 0);
  const pk = op.precioKg != null ? Number(op.precioKg) : precioFinalKg(cobra, ctx, dsc);
  const peso = _escPeso(gramos);
  const bolsa = 'la bolsa de ' + cobra.etiqueta;
  const otras = mz.otras.map(x => x.escala);
  /* De la bolsa que se cobra se lista lo que hay de verdad: lo que falta va aparte, al
     final. Antes decía "1 kg de la bolsa de 2 kg" de una bolsa vacía (chequeo del 25/09). */
  const lista = reparto.partes
    .map(x => ({ escala: x.escala, gramos: x.escala === cobra ? x.gramos - (reparto.falta || 0) : x.gramos }))
    .filter(x => x.gramos > 0);

  L.push((op.pedido ? 'El pedido lleva ' : 'Estás vendiendo ') + peso + ' de ' + _escNombre(cobra) + ' a ' +
    _escPlata(pk) + ' el kilo' + (op.precioKg != null ? '.' : ', que es ' + _precioDeBolsaTxt(cobra, ctx, dsc) + '.'));
  L.push('');
  L.push(quedan > 0
    ? 'Pero en ' + bolsa + ' quedan solo ' + _escPeso(quedan) + ', así que se saca de ' + (lista.length === 2 ? 'las dos bolsas:' : 'estas bolsas:')
    : 'Pero ' + bolsa + ' no tiene stock, así que ' + (lista.length === 1 ? 'todo sale de la bolsa de ' + lista[0].escala.etiqueta + ':' : 'sale de estas bolsas:'));
  lista.forEach(x => {
    const c = costo(x.escala);
    L.push('• ' + _escPeso(x.gramos) + ' de la bolsa de ' + x.escala.etiqueta +
      (c > 0 ? ', que te costó ' + _escPlata(c) + ' el kilo' : ', que no tiene cargado lo que costó'));
  });
  /* Sin stock suficiente no se vende (26/09): en el mostrador esto no llega (frena antes);
     un pedido que pide más de lo que hay no se va a poder registrar. */
  const frena = _escFrena(ctx);
  if (reparto.falta > 0) {
    L.push('');
    L.push(frena
      ? '[x] Y ni así alcanza: faltan ' + _escPeso(reparto.falta) + '. Sin stock suficiente la venta NO se va a poder registrar: bajá la cantidad.'
      : '[!] Y ni así alcanza: faltan ' + _escPeso(reparto.falta) + '. Se descuentan de ' + bolsa + ', que queda con el stock en negativo.');
  }

  L.push('');
  const cobrado = reparto.partes.reduce((s, x) => s + Math.round(pk * x.gramos / 1000), 0);
  let gana = null, ganaria = null, costoTotal = null;
  if (mz.diferencia !== null) {
    costoTotal = reparto.partes.reduce((s, x) => s + Math.round(costo(x.escala) * x.gramos / 1000), 0);
    gana = cobrado - costoTotal;
    ganaria = gana - mz.diferencia;
  }
  /* Contra la bolsa que se cobra. Si no está en la lista (no tiene stock), con lo que
     costó: si no, no aparece en ningún lado. */
  const contra = ' que la de ' + cobra.etiqueta +
    (lista.some(x => x.escala === cobra) ? '' : ', que te costó ' + _escPlata(costo(cobra)) + ' el kilo');
  if (gana === null) {
    L.push('[!] No se puede calcular cuánto ganás: falta cargar lo que costó ' + _escBolsas(mz.sinCosto) + '. Se carga en Productos.');
  } else if (gana <= 0) {
    L.push('[x] Ojo: así ' + (gana < 0
      ? 'perdés ' + _escPlata(-gana) + '. Lo que vendés te costó ' + _escPlata(costoTotal) + ' y lo cobrás ' + _escPlata(cobrado) + '.'
      : 'no ganás nada. Lo que vendés te costó ' + _escPlata(costoTotal) + ', lo mismo que cobrás.'));
  } else if (mz.diferencia < 0) {
    const caras = otras.filter(e => costo(e) > costo(cobra));
    L.push('[!] ' + _escMayus(_escBolsas(caras)) + (caras.length === 1 ? ' te salió más cara' : ' te salieron más caras') + contra +
      '. Por eso ganás ' + _escPlata(-mz.diferencia) + ' menos: ' + _escPlata(gana) + ' en vez de ' + _escPlata(ganaria) + '.');
    if (!mz.bajoCosto.length) L.push('Igual ganás plata, solo que menos.');
  } else if (mz.diferencia > 0) {
    const baratas = otras.filter(e => costo(e) < costo(cobra));
    L.push('[+] ' + _escMayus(_escBolsas(baratas)) + (baratas.length === 1 ? ' te salió más barata' : ' te salieron más baratas') + contra +
      '. Por eso ganás ' + _escPlata(mz.diferencia) + ' más: ' + _escPlata(gana) + ' en vez de ' + _escPlata(ganaria) + '.');
  } else {
    L.push('[+] ' + (otras.length === 1 ? 'Las dos bolsas te costaron' : 'Todas estas bolsas te costaron') +
      ' lo mismo el kilo, así que ganás lo mismo: ' + _escPlata(gana) + '.');
  }
  /* Una parte vendida por debajo de lo que costó se dice aunque en total se gane. */
  if (gana === null || gana > 0) {
    mz.bajoCosto.forEach(b => L.push('[x] Ojo: la bolsa de ' + b.escala.etiqueta + ' te costó ' + _escPlata(costo(b.escala)) +
      ' el kilo, más de lo que cobrás (' + _escPlata(pk) + ' el kilo). Con ' + _escPeso(b.gramos) + ' de esa bolsa perdés ' + _escPlata(b.perdida) + '.'));
  }

  const malo = gana === null || gana <= 0 || mz.diferencia < 0 || mz.bajoCosto.length > 0 || reparto.falta > 0;
  const deOtras = _escBolsas(otras);
  /* Un pedido que ni sumando las bolsas alcanza no tiene nada que elegir: ninguna salida
     se va a poder registrar. Lo dice la línea de arriba; queda "Entendido" (revisión del
     26/09: antes preguntaba como si "Sí" se pudiera). */
  const sinSalida = !!op.pedido && frena && reparto.falta > 0;
  if (!sinSalida) {
    L.push('');
    if (op.pedido) {
      L.push('¿Sacás lo que falta de ' + deOtras + '?' + (op.todoDeCobra
        ? (frena ? ' Si no, la venta no se va a poder registrar: ' + bolsa + ' no tiene stock suficiente.'
          : ' Si no, todo se descuenta de ' + bolsa + ', que queda con el stock en negativo.')
        : ' Si no, se descuenta como vino en el pedido.'));
    } else {
      L.push(malo ? '¿Lo vendés igual?' : '¿Lo vendés así?');
    }
  }
  return {
    mensaje: L.join(_ESC_NL),
    opts: {
      titulo: quedan > 0 ? 'No alcanza ' + bolsa : _escMayus(bolsa) + ' no tiene stock',
      icono: malo ? 'bi-exclamation-triangle' : 'bi-info-circle',
      aceptar: sinSalida ? 'Entendido' : (op.pedido ? 'Sí, sacarlo de ' + deOtras : 'Sí, vender'),
      cancelar: sinSalida ? null : (op.pedido ? (op.todoDeCobra ? 'No, todo de ' + bolsa : 'No, dejarlo como vino') : 'No, cancelar'),
    },
  };
}
function mensajeMezcla(reparto, cobra, mz, gramos, ctx, dsc, quedan, o) {
  return avisoMezcla(reparto, cobra, mz, gramos, ctx, dsc, quedan, o).mensaje;
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
   la venta que se está editando (se le devuelve al guardar) o el pedido web del que
   sale: ver stockYaTomadoPorVenta en admin-variantes.js. */
function disponibleParaVenta(ctx) {
  const orig = typeof stockYaTomadoPorVenta === 'function' ? stockYaTomadoPorVenta(ctx) : {};
  /* Lo tomado más el stock que queda: uno negativo no resta (ver _hayParaVenta). */
  return e => (orig[e.id] || 0) + Math.max(0, Number(e.producto.stock || 0));
}

/* Lo que muestra el diálogo de gramos: el precio de cada escala y el total en vivo,
   con la escala que va a tocar según lo que ya hay en la venta más lo nuevo. */
function opcionesGramosEscalas(escalas, ctx, ya, dsc, disponible) {
  const disp = disponible || disponibleParaVenta(ctx);
  /* "Menos de 3 kg: $8.000 el kilo · 3 kg o más: $7.200 el kilo". Antes decía "1 kg:
     $8.000 · desde 3 kg: $7.200", y no quedaba claro hasta dónde valía cada precio. */
  const precios = escalas.map((e, i) => (i ? e.etiqueta + ' o más' : 'Menos de ' + escalas[1].etiqueta) + ': ' +
    _escPlata(precioFinalKg(e, ctx, dsc)) + ' el kilo').join(' · ');
  const todo = escalas.reduce((s, e) => s + disp(e), 0);
  const hay = todo - ya;
  const antes = ya > 0 ? escalaPara(escalas, ya) : null;
  /* Sin stock suficiente, el diálogo frena o avisa: ver frenoDeGramos en admin-variantes.js. */
  const mira = _escMira(ctx) && typeof frenoDeGramos === 'function';
  return Object.assign({
    nombre: _escNombre(escalas[0]),
    detalle: precios + (ya > 0 ? ' · ya hay ' + _escPeso(ya) + ' en la venta' : ''),
    stock: Math.max(0, hay),
    cotizar: g => {
      const e = escalaPara(escalas, ya + g);
      const pk = precioFinalKg(e, ctx, dsc);
      return {
        total: Math.round(pk * g / 1000),
        nota: 'Se cobra el precio de la bolsa de ' + e.etiqueta + ': ' + _escPlata(pk) + ' el kilo.' +
          (antes && antes !== e ? ' Lo que ya estaba en la venta pasa a este precio.' : ''),
      };
    },
  }, mira ? frenoDeGramos(escalas[0].producto, { hay: todo, ya: ya, queda: hay }, async () => {
    if (typeof _stockFresco === 'function') await _stockFresco(escalas.map(e => e.id));
    const t = escalas.reduce((s, e) => s + disp(e), 0);
    return { hay: t, ya: ya, queda: t - ya };
  }) : {});
}

/* Suma gramos de un producto con escalas a la venta. Devuelve 'no' si no tiene
   escalas (el que llama sigue como siempre), 'hecho' o 'cancelar'. */
async function agregarGranelVenta(p, ctx) {
  const escalas = escalasDe(p);
  if (!escalas.length) return 'no';
  const lineas = lineasDeEscalas(_escLista(ctx), escalas);
  const ya = lineas.reduce((s, it) => s + Number(it.cantidad || 0), 0);
  const dsc = _dscDeLineas(lineas, escalas, ctx);
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
  const disp = disponibleParaVenta(ctx);
  /* Con el freno (pedido del comercio, 26/09/2026), si no alcanza ni sumando todas las
     bolsas, no se agrega; así llega cambiar los gramos en la línea. Sin freno (29/09) se
     agrega, y el aviso de la mezcla dice que la bolsa queda en negativo. */
  const frena = _escFrena(ctx);
  let hay = escalas.reduce((s, e) => s + disp(e), 0);
  if (frena && gramos > hay && typeof _stockFresco === 'function') {
    /* Antes de frenar, el stock de ahora: el de la pantalla puede ser viejo. */
    await _stockFresco(escalas.map(e => e.id));
    hay = escalas.reduce((s, e) => s + disp(e), 0);
  }
  if (frena && gramos > hay) {
    if (typeof avisarSinStock === 'function') await avisarSinStock(escalas[0].producto, hay, 0, _escNombre(escalas[0]));
    return 'cancelar';
  }
  const lm = llevandoMas(escalas, gramos, ctx, dsc, frena ? hay : null);
  if (lm && typeof pedirOpcion === 'function') {
    const r = await pedirOpcion(mensajeLlevandoMas(lm, ctx, dsc), {
      titulo: 'Llevando más, paga menos',
      icono: 'bi-arrow-down-circle',
      opciones: [
        { valor: 'igual', texto: 'Vender ' + _escPeso(gramos) + ' (' + _escPlata(lm.total) + ')', principal: true },
        { valor: 'mas', texto: 'Vender ' + _escPeso(lm.mejor.gramos) + ' (' + _escPlata(lm.mejor.total) + ')' },
      ],
    });
    if (r === null) return 'cancelar';
    if (r === 'mas') { gramos = lm.mejor.gramos; cobra = lm.mejor.escala; }
  }
  const reparto = repartirStock(escalas, cobra, gramos, disp);
  const mz = mezclaDe(reparto, cobra, ctx, dsc);
  if (mz && typeof pedirConfirmacion === 'function') {
    const av = avisoMezcla(reparto, cobra, mz, gramos, ctx, dsc, disp(cobra));
    if (!await pedirConfirmacion(av.mensaje, av.opts)) return 'cancelar';
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
  /* Las cajas cerradas (etapa 3) llevan su aclaración en la venta de mostrador; en la
     mayorista todo va al precio mayorista y no hace falta. */
  const esMay = typeof ventaMayItems !== 'undefined' && items === ventaMayItems;
  const cajas = new Set(esMay || typeof esCajaCerrada !== 'function' ? [] :
    lista.filter(it => it && it.id && esCajaCerrada(prods.find(x => x.id === it.id))).map(it => it.id));
  /* Lo que se vende de más que el stock lo dice su línea; al registrar se pregunta (ver
     avisoStockInsuficiente en admin-variantes.js). */
  const ctxV = esMay ? 'may' : 'min';
  const faltaDe = new Map();
  if (typeof faltantesDeStock === 'function' && _escMira(ctxV)) {
    faltantesDeStock(lista, ctxV).forEach(f => faltaDe.set(f.producto.id, f));
  }
  if (!grupoDe.size && !cajas.size && !faltaDe.size) return lista;
  const out = [];
  const hechos = new Set();
  lista.forEach(it => {
    const esc = it && grupoDe.get(it.id);
    if (!esc) {
      if (!it || (!cajas.has(it.id) && !faltaDe.has(it.id))) { out.push(it); return; }
      const extra = {};
      if (cajas.has(it.id)) extra.__detalle = 'Caja cerrada: se cobra el precio mayorista';
      if (faltaDe.has(it.id)) extra.__falta = textoFaltaStock(faltaDe.get(it.id));
      out.push(Object.assign({}, it, extra));
      return;
    }
    const clave = esc[0].id;
    if (hechos.has(clave)) return;
    hechos.add(clave);
    const lineas = lista.filter(x => x && grupoDe.has(x.id) && grupoDe.get(x.id)[0].id === clave);
    const total = lineas.reduce((s, x) => s + Number(x.cantidad || 0), 0);
    const cobra = esc.find(e => e.id === lineas[0].escalaId) || escalaPara(esc, total);
    /* Si alguna de sus bolsas no alcanza, lo dice la línea del producto: el total contra
       todas las bolsas (si el total alcanza, cambió el stock desde que se repartió). */
    let falta = null;
    if (lineas.some(x => faltaDe.has(x.id))) {
      const d = disponibleParaVenta(ctxV);
      const hayG = esc.reduce((s, e) => s + d(e), 0);
      falta = total > hayG ? textoFaltaStock({ producto: cobra.producto, hay: hayG }) : 'Cambió el stock de las bolsas: volvé a poner los gramos';
    }
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
      ...(falta ? { __falta: falta } : {}),
    });
  });
  return out;
}

function detalleLineaGranel(cobra, lineas, escalas) {
  const txt = 'Precio de la bolsa de ' + cobra.etiqueta;
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
  const r = await fijarGranelVenta(g.escalas, total, ctx, { dsc: _dscDeLineas(g.lineas, g.escalas, ctx) });
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

/* ------------------------------------------------ LOS PEDIDOS DEL PANEL
   Un pedido tomado en el panel (por teléfono) no descuenta stock: lo descuenta la venta
   al convertirlo. El granel con escalas va en UNA línea por producto, al precio de la
   escala que toca por el total, como en el mostrador y en la tienda; antes cada bolsa
   iba a su propio precio (chequeo del 25/09). Un pedido que ya descontó stock (uno web)
   no se toca: sus renglones dicen de qué bolsa salió cada gramo. */
function reescalarPedido(id) {
  if (typeof pedItems === 'undefined' || !Array.isArray(pedItems)) return false;
  try {
    if (typeof editingPedidoId !== 'undefined' && editingPedidoId && typeof pedidosData !== 'undefined') {
      const ped = pedidosData.find(x => x && x.docId === editingPedidoId);
      if (ped && ped.stockDescontado === true) return false;
    }
  } catch (e) { /* sin pedido en edición */ }
  const prods = _escProds();
  const p = prods.find(x => x.id === id);
  const esc = p ? escalasDe(p, prods) : [];
  if (!esc.length) return false;
  const lineas = lineasDeEscalas(pedItems, esc);
  if (!lineas.length) return false;
  const total = lineas.reduce((s, it) => s + Number(it.cantidad || 0), 0);
  const cobra = escalaPara(esc, total);
  const una = Object.assign({}, lineas[0], {
    id: cobra.id, nombre: _escNombre(cobra), precio: precioKgEscala(cobra, 'min'),
    costo: Number(cobra.producto.costo || 0) || null, cantidad: total, tipoVenta: 'peso',
    escala: cobra.etiqueta, escalaId: cobra.id,
  });
  const pos = pedItems.indexOf(lineas[0]);
  const resto = pedItems.filter(it => lineas.indexOf(it) < 0);
  pedItems = resto.slice(0, pos).concat([una], resto.slice(pos));
  return true;
}
(function () {
  if (typeof window === 'undefined') return;
  ['addPedItem', 'updatePedQty', 'removePedItem'].forEach(nombre => {
    const orig = window[nombre];
    if (typeof orig !== 'function') return;
    window[nombre] = function (id) {
      const r = orig.apply(this, arguments);
      if (reescalarPedido(id) && typeof renderPedItems === 'function') renderPedItems();
      return r;
    };
  });
})();

/* Al pasar a venta un pedido que todavía no descontó stock (uno del panel, o uno web si
   la tienda no descuenta), el granel se reparte por bolsa como en el mostrador, al
   precio del pedido, y si mezcla bolsas con el mismo aviso. La venta descuenta de cada
   bolsa al guardarse. */
async function repartirGranelDeVenta(ctx) {
  const prods = _escProds();
  const vistos = new Set();
  for (const it of _escLista(ctx).slice()) {
    const g = it && _grupoDeLinea(it.id, _escLista(ctx));
    if (!g || vistos.has(g.escalas[0].id)) continue;
    vistos.add(g.escalas[0].id);
    const total = g.lineas.reduce((s, x) => s + Number(x.cantidad || 0), 0);
    /* La de g.escalas y no la que devuelve escalaDeLinea, que es otra lista:
       repartirStock las busca por identidad (escalas.indexOf). */
    const e0 = escalaDeLinea(g.lineas[0], prods);
    const cobra = (e0 && g.escalas.find(e => e.id === e0.id)) || escalaPara(g.escalas, total);
    const precio = Number(g.lineas[0].precio || 0);
    const dsc = Number(g.lineas[0].descuento || 0);
    /* Lo que se cobra el kilo es lo del pedido (la cuenta de precioConDsc), no la lista. */
    const pk = Math.round(precio * (1 - dsc / 100));
    const disp = disponibleParaVenta(ctx);
    const reparto = repartirStock(g.escalas, cobra, total, disp);
    const mz = mezclaDe(reparto, cobra, ctx, dsc, pk);
    if (mz && typeof pedirConfirmacion === 'function') {
      const av = avisoMezcla(reparto, cobra, mz, total, ctx, dsc, disp(cobra),
        { precioKg: pk, pedido: true, todoDeCobra: g.lineas.every(x => x.id === cobra.id) });
      if (!await pedirConfirmacion(av.mensaje, av.opts)) continue;
    }
    aplicarGranelVenta(g.escalas, cobra, reparto.partes, ctx, dsc);
    lineasDeEscalas(_escLista(ctx), g.escalas).forEach(x => { x.precio = precio; });
  }
  _escRepintar(ctx);
}

/* ----------------------------------------------------- LOS PEDIDOS WEB */
/* La tienda parte el granel por bolsa y marca cada renglón con la escala que se cobró
   (escalaId). Si alguno salió de otra bolsa, el texto para el aviso del tablero de
   pedidos, con lo que se gana de más o de menos según el costo de cada bolsa. Al
   cliente no se le dice nada: los costos no salen del panel. null si no hubo mezcla. */
function mezclaDePedido(items) {
  const prods = _escProds();
  const porCobro = new Map();
  (items || []).forEach(i => {
    /* Solo lo que cuadra con el catálogo, y con los nombres del catálogo: este texto va
       al tablero y lo que escribe el cliente no se muestra (chequeo del 25/09). */
    const cobra = escalaDeLinea(i, prods);
    if (!cobra) return;
    const g = porCobro.get(cobra.id) || { cobra: cobra, lineas: [] };
    g.lineas.push(i);
    porCobro.set(cobra.id, g);
  });
  const textos = [];
  porCobro.forEach(g => {
    const cobra = g.cobra;
    const otras = g.lineas.filter(i => i.id !== cobra.id);
    if (!otras.length) return;
    const esc = escalasDe(cobra.producto, prods);
    const partes = otras.map(i => {
      const u = esc.find(e => e.id === i.id);
      return { i: i, u: u, costo: u ? Number(u.producto.costo || 0) : 0 };
    });
    let txt = _escNombre(cobra) + ': se cobró el precio de la bolsa de ' + cobra.etiqueta + ', pero ' +
      partes.map(x => _escPeso(Number(x.i.cantidad || 0)) + ' salen de la bolsa de ' + (x.u ? x.u.etiqueta : '?')).join(' y ') + '.';
    const cT = Number(cobra.producto.costo || 0);
    if (cT > 0 && partes.every(x => x.costo > 0)) {
      const dif = partes.reduce((s, x) => s + Math.round((cT - x.costo) * Number(x.i.cantidad || 0) / 1000), 0);
      const una = partes.length === 1;
      if (dif > 0) txt += (una ? ' Esa bolsa te salió más barata: ' : ' Por lo que costó cada bolsa, ') + 'ganás ' + _escPlata(dif) + ' más.';
      else if (dif < 0) txt += (una ? ' Esa bolsa te salió más cara: ' : ' Por lo que costó cada bolsa, ') + 'ganás ' + _escPlata(-dif) + ' menos.';
    }
    textos.push(txt);
  });
  return textos.length ? textos.join(' ') : null;
}

/* ------------------------------------------------ EL COSTO DE LA BOLSA */
/* El costo de un producto por peso es por kilo, pero lo que está a mano es la
   factura: "la bolsa de 3 kg me salió $2.600". Se carga eso y el costo por kilo sale
   solo. Aparece en los productos por peso que dicen de cuánto es la bolsa ("Tamaño de la
   bolsa"). Desde el 30/09 (pedido del dueño) se ve como en Cargar compra: "Costo de la bolsa
   de 2 kg", ya cargado con lo que da el kilo de arriba, y al lado cómo queda el kilo. */
function pintarCostoBolsa() {
  const cont = document.getElementById('pCostoBolsa');
  if (!cont) return;
  const peso = typeof _tipoVentaProd !== 'undefined' && _tipoVentaProd === 'peso';
  _etqTamanoBolsa(peso);
  const gEl = document.getElementById('pGramaje');
  const c = typeof contenidoDeVariante === 'function' ? contenidoDeVariante({ gramaje: gEl ? gEl.value : '' }) : null;
  /* Con la tabla de bolsas a la vista sobra: lo que costó la bolsa de este producto va
     en su primera fila (admin-variantes.js). */
  const conTabla = typeof enModoTamanos === 'function' && enModoTamanos();
  if (!peso || conTabla || !c || c.unidad !== 'g' || !(c.valor > 0)) { cont.hidden = true; cont.innerHTML = ''; return; }
  let inp = cont.querySelector('input');
  if (!inp) {
    cont.innerHTML = '<label class="cb-lbl" for="pCostoBolsaInput">Costo de la bolsa de <span class="cb-tam"></span></label>' +
      '<div class="cb-fila"><span class="cb-signo">$</span>' +
      '<input type="text" inputmode="numeric" class="form-input cb-input" id="pCostoBolsaInput" autocomplete="off" placeholder="lo que dice la factura"></div>' +
      '<small class="cb-nota"></small>';
    inp = cont.querySelector('input');
    inp.addEventListener('input', () => { if (inp.dataset) inp.dataset.escrito = '1'; costoBolsaEscrito(inp); });
  }
  cont.hidden = false;
  cont.querySelector('.cb-tam').textContent = _escPeso(c.valor);
  if (document.activeElement === inp) return;
  /* Si se escribió lo que costó la bolsa, eso manda: con otro tamaño, el kilo se recalcula. */
  if (inp.dataset && inp.dataset.escrito === '1' && inp.value) { costoBolsaEscrito(inp); return; }
  /* Si no, la bolsa sale del kilo de arriba, como en Cargar compra. */
  const costoKg = typeof montoAR === 'function' ? montoAR((document.getElementById('pCosto') || {}).value) : 0;
  inp.value = costoKg > 0 ? String(Math.round(costoKg * c.valor / 1000)) : '';
  cont.querySelector('.cb-nota').textContent = costoKg > 0 ? '= ' + _escPlata(costoKg) + ' el kilo' : '';
}

/* "Gramaje / Presentación" en un producto por peso es de cuánto es la bolsa que se le compra al
   proveedor (pedido del dueño, 30/09): se llama así. En la tienda no se muestra, salvo como
   presentación cuando hay varias. Por unidad sigue como siempre. */
const _ETQ_TAM_UNIDAD = 'Gramaje / Presentación <span style="font-size:0.75rem;color:var(--text-dim);font-weight:normal">(opcional — ej: 250g, 500g, 1kg)</span>';
const _ETQ_TAM_PESO = 'Tamaño de la bolsa <span style="font-size:0.75rem;color:var(--text-dim);font-weight:normal">(opcional — la que le comprás al proveedor: 1 kg, 5 kg, 25 kg)</span>';
function _etqTamanoBolsa(peso) {
  const wrap = document.getElementById('pGramajeWrap');
  const lbl = wrap && wrap.querySelector('label');
  const inp = document.getElementById('pGramaje');
  if (!lbl || !inp) return;
  const html = peso ? _ETQ_TAM_PESO : _ETQ_TAM_UNIDAD;
  if (lbl.innerHTML !== html) lbl.innerHTML = html;
  inp.placeholder = peso ? 'Ej: 5 kg' : 'Ej: 500g ó 1kg';
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
  if (nota) nota.textContent = '= ' + _escPlata(costoKg) + ' el kilo. Queda cargado arriba, en el costo por kilo.';
}

/* Se repinta al abrir el formulario, al cambiar la forma de venta, la presentación o
   el costo. Si se escribe el costo por kilo a mano, lo de la bolsa se borra: ya no
   es lo que dice el costo. */
if (typeof openModal === 'function') {
  const _escOpenModal = openModal;
  openModal = function () {
    const r = _escOpenModal.apply(this, arguments);
    const inp = document.getElementById('pCostoBolsaInput');
    if (inp) { inp.value = ''; if (inp.dataset) delete inp.dataset.escrito; }
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
    /* El kilo escrito a mano manda: la bolsa vuelve a salir de él. */
    const inp = document.getElementById('pCostoBolsaInput');
    if (inp && document.activeElement !== inp) { inp.value = ''; if (inp.dataset) delete inp.dataset.escrito; }
    pintarCostoBolsa();
  });
})();
