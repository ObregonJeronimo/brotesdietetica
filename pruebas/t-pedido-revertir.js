/**
 * VOLVER UN PEDIDO A PENDIENTE TIENE QUE DEVOLVER EL STOCK DE VERDAD.
 *
 * El bug ya se habia arreglado una vez: antes kanbanDrop hacia .delete() directo sobre
 * la venta y no devolvia nada. La correccion busca la venta y le suma el stock de vuelta
 * ... pero la buscaba SOLO en `ventasData`, que es la cache de la seccion Ventas.
 *
 * Esa cache la llena unicamente loadVentas(), o sea entrar a la seccion Ventas, y encima
 * acotada al mes elegido en el filtro. Abrir el panel e ir derecho a Pedidos -que es lo
 * que hace cualquiera a la mañana- la deja VACIA. Con la cache vacia:
 *   - vAsoc queda undefined y no se devuelve una sola unidad,
 *   - la venta se borra igual (ese .delete() estaba AFUERA del if),
 *   - y el historial anota "stock devuelto", que es la peor parte: confirma algo que no
 *     paso, asi que nadie sale a buscar la mercaderia.
 * Despues, al volver a facturar el pedido, se descuenta por segunda vez: 4 vendidas
 * dejan 8 menos en gondola.
 *
 * Esta suite EJECUTA kanbanDrop de verdad, con dobles para el DOM y para Firestore, y
 * mide el stock que se devolvio. No mira el fuente: mira el resultado.
 */
const fs = require('fs');
const src = fs.readFileSync('admin.html', 'utf8');

function cuerpo(nombre) {
  let i = src.indexOf('function ' + nombre + '(');
  if (i < 0) throw new Error('no encontre ' + nombre);
  /* Si la declaracion es `async function`, hay que llevarse el async. Sacarla sin el
     da sintaxis valida -`async` es un identificador- y explota recien al ejecutar,
     con un await suelto. Es la misma trampa que documenta check-admin.js. */
  if (src.slice(Math.max(0, i - 6), i) === 'async ') i -= 6;
  let prof = 0, k;
  for (k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') prof++;
    else if (src[k] === '}') { prof--; if (!prof) break; }
  }
  return src.slice(i, k + 1);
}

let ok = 0, fail = 0;
const t = (d, c, extra) => {
  if (c) { ok++; console.log('  OK   ' + d); }
  else { fail++; console.log('  FALLA ' + d + (extra !== undefined ? '   [' + extra + ']' : '')); }
};

/* deltasDeItems y deltasDeInsumos son los REALES: asi el reparto por producto -y el
   granel, que viaja en gramos- se prueba tal como corre en el panel. */
const REALES = cuerpo('deltasDeItems') + '\n' + cuerpo('deltasDeInsumos') + '\n' + cuerpo('kanbanDrop');

/* Un escenario completo. `enBase` es lo que tiene Firestore; `enCache` lo que tiene
   ventasData, que es justamente lo que casi nunca esta. */
function correr({ venta, enCache, enBase }) {
  const reg = { stockProd: null, stockIns: null, borradas: [], updates: [], logs: [], toasts: [], estados: [] };
  const pedido = { docId: 'ped1', numero: 7, estado: 'confirmado', ventaId: venta ? venta.docId : null };

  const entorno = {
    kanbanDraggingId: 'ped1',
    pedidosData: [pedido],
    ventasData: enCache && venta ? [JSON.parse(JSON.stringify(venta))] : [],
    nroPed: (n) => String(n).padStart(5, '0'),
    openPedidoModal: () => {},
    showAdminToast: (m) => reg.toasts.push(m),
    pedirConfirmacion: async () => true,
    aplicarStockProductos: async (d) => { reg.stockProd = d; },
    aplicarStockInsumos: async (d) => { reg.stockIns = d; },
    actualizarEstadoPedido: async (id, est) => { reg.estados.push(id + '->' + est); },
    logAction: (a, b, c) => reg.logs.push(c),
    firebase: { firestore: { FieldValue: { delete: () => '<<borrar>>' } } },
    db: {
      collection: (col) => ({
        doc: (id) => ({
          get: async () => (col === 'ventas' && enBase && venta && venta.docId === id)
            ? { exists: true, id: id, data: () => JSON.parse(JSON.stringify(venta)) }
            : { exists: false, id: id, data: () => null },
          delete: async () => { reg.borradas.push(col + '/' + id); },
          update: async (u) => { reg.updates.push(col + '/' + id + ' ' + JSON.stringify(u)); },
        })
      })
    },
  };

  const ev = { preventDefault() {}, currentTarget: { classList: { remove() {} } } };
  const nombres = Object.keys(entorno);
  const fn = new Function(...nombres, REALES + '\nreturn kanbanDrop;')(...nombres.map(n => entorno[n]));
  return fn(ev, 'pendiente').then(() => ({ reg, pedido }));
}

/* Una venta con un producto por unidad y uno a granel: el granel descuenta GRAMOS. */
const VENTA = {
  docId: 'vta1', stockDescontado: true,
  items: [
    { id: 'yerba', nombre: 'Yerba', precio: 1500, cantidad: 4, tipoVenta: 'unidad' },
    { id: 'nuez', nombre: 'Nueces', precio: 18000, cantidad: 250, tipoVenta: 'peso' },
  ],
  insumosUsados: [{ id: 'bolsa', nombre: 'Bolsa', cantidad: 2 }],
};

(async () => {
  console.log('\nCon la venta en la cache (el unico caso que andaba)');
  let { reg } = await correr({ venta: VENTA, enCache: true, enBase: true });
  t('devuelve 4 unidades de yerba', reg.stockProd && reg.stockProd.yerba === 4, JSON.stringify(reg.stockProd));
  t('y 250 GRAMOS de nueces, no 250 kilos', reg.stockProd && reg.stockProd.nuez === 250);
  t('devuelve los insumos', reg.stockIns && reg.stockIns.bolsa === 2);
  t('borra la venta', reg.borradas.indexOf('ventas/vta1') >= 0);
  t('le saca el ventaId al pedido', /pedidos\/ped1.*ventaId/.test(reg.updates.join(' ')));
  t('el historial dice que devolvio el stock', /stock devuelto/.test(reg.logs.join(' ')));

  console.log('\nCON LA CACHE VACIA, que es como esta si entras derecho a Pedidos');
  ({ reg } = await correr({ venta: VENTA, enCache: false, enBase: true }));
  t('IGUAL devuelve las 4 de yerba (antes no devolvia nada)',
    reg.stockProd && reg.stockProd.yerba === 4, 'stockProd=' + JSON.stringify(reg.stockProd));
  t('IGUAL devuelve los 250 g de nueces', reg.stockProd && reg.stockProd.nuez === 250);
  t('IGUAL devuelve los insumos', reg.stockIns && reg.stockIns.bolsa === 2);
  t('borra la venta', reg.borradas.indexOf('ventas/vta1') >= 0);
  t('y recien ahi el historial puede decir "stock devuelto"', /stock devuelto/.test(reg.logs.join(' ')));

  console.log('\nSi la venta ya no existe en la base, el historial no puede mentir');
  ({ reg } = await correr({ venta: VENTA, enCache: false, enBase: false }));
  t('no inventa una devolucion de stock', reg.stockProd === null, JSON.stringify(reg.stockProd));
  t('el historial avisa que NO se devolvio', /NO se devolvio stock/.test(reg.logs.join(' ')), reg.logs.join(' | '));
  t('no deja el pedido enganchado a una venta que no existe',
    /pedidos\/ped1.*ventaId/.test(reg.updates.join(' ')));

  console.log('\nUna venta que nunca descontó stock no se devuelve dos veces');
  const sinDescontar = Object.assign({}, VENTA, { stockDescontado: false });
  ({ reg } = await correr({ venta: sinDescontar, enCache: false, enBase: true }));
  t('no toca el stock de productos', reg.stockProd === null, JSON.stringify(reg.stockProd));
  t('pero si devuelve los insumos, que se descuentan siempre', reg.stockIns && reg.stockIns.bolsa === 2);

  console.log('\n' + ok + ' pasaron, ' + fail + ' fallaron');
  process.exit(fail ? 1 : 0);
})();
