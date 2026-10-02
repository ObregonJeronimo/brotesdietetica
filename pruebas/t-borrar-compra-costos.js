/**
 * BORRAR UNA COMPRA VUELVE LOS COSTOS QUE CAMBIÓ (pedido del dueño, 02/10).
 *
 * Con "Actualizar", la compra anota cómo estaba cada producto antes (costosCambiados, en
 * ofrecerActualizarCostos). Al borrarla, cada uno vuelve a como estaba -costo, precio, mayorista y
 * la fecha del costo- en la misma transacción que devuelve el stock. Pero solo si sigue como lo
 * dejó la compra: si después le cambiaron el costo o el precio (otra compra, la ficha, la ventana
 * de costos), lo de ahora es lo que vale y no se toca. Lo que cuenta es la base, no lo que tenía el
 * panel en memoria. Productos por unidad, por peso y una bolsa de un grupo.
 *
 * Si no vuelve porque una compra más nueva le cambió el costo, el aviso dice cuál: número, fecha y
 * comprobante (y el proveedor, si es otro). Las compras más nuevas se leen de la base; si no se
 * puede, las de la lista del panel.
 *
 * Las compras de antes del 02/10 no anotaban nada: el aviso lo dice y no se toca ningún costo.
 *
 * Revisión del 02/10: la compra se borra en la misma transacción (si ya no está, no se toca nada), los
 * costos vuelven a lo que dice la compra en la base, y un doble clic en "Eliminar" abre un solo aviso.
 */
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'admin-compras.js'), 'utf8')
  + '\n' + fs.readFileSync(path.join(__dirname, '..', 'admin-archivos.js'), 'utf8');

function cuerpo(n) {
  let i = src.indexOf('function ' + n + '(');
  if (i < 0) throw new Error('no encontre ' + n);
  if (src.slice(i - 6, i) === 'async ') i -= 6;
  let p = 0, k;
  for (k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') p++;
    else if (src[k] === '}') { p--; if (!p) break; }
  }
  return src.slice(i, k + 1);
}

/* El freno de los clics: lo que envuelve a borrarCompra al final de admin-compras.js. */
const envoltorio = (() => {
  const m = src.indexOf('Borrar una compra, de a una');
  if (m < 0) throw new Error('no encontre el freno de los clics');
  const i = src.indexOf('(function () {', m);
  return src.slice(i, src.indexOf('})();', i) + 5);
})();

/* Una copia, como la que da la base, con las mismas fechas (para poder compararlas). */
const copiaCompra = x => Object.assign({}, x, x.costosCambiados ? { costosCambiados: x.costosCambiados.map(e =>
  Object.assign({}, e, { antes: e.antes && Object.assign({}, e.antes), despues: e.despues && Object.assign({}, e.despues) })) } : {});

let ok = 0, fail = 0;
const t = (d, c, extra) => {
  if (c) { ok++; console.log('  OK   ' + d); }
  else { fail++; console.log('  FALLA ' + d + (extra !== undefined ? '   [' + extra + ']' : '')); }
};

/* Fechas de mentira, como los Timestamp de Firestore. */
const T1 = { seconds: 1758000000, nanoseconds: 0, cual: 'T1' };
const T2 = { seconds: 1759000000, nanoseconds: 0, cual: 'T2' };
const HOY = { seconds: 1759400000, nanoseconds: 0, cual: 'la de la compra' };
const el = (d, m) => ({ seconds: Date.UTC(2026, m - 1, d, 15, 0, 0) / 1000, nanoseconds: 0 });   /* 12:00 en Argentina */

/* La base después de la compra: el Maní lo volvieron a cambiar después ($7.300). */
const baseNueva = () => ({
  ace: { nombre: 'Aceite De Oliva', tipoVenta: 'unidad', stock: 37, costo: 16000, precio: 30400, precioMayorista: 20800, costoActualizadoEn: HOY },
  n3: { nombre: 'Nuez Mariposa x 3 kg', tipoVenta: 'peso', stock: 24000, costo: 9000, precio: 14400, precioMayorista: 11700, costoActualizadoEn: HOY },
  mn: { nombre: 'Maní', tipoVenta: 'peso', stock: 5000, costo: 7300, precio: 11680, precioMayorista: 0, costoActualizadoEn: HOY },
  cas: { nombre: 'Castaña', tipoVenta: 'unidad', stock: 60, costo: 7000, precio: 10500, precioMayorista: 0, costoActualizadoEn: HOY },
});
const compraNueva = () => ({
  docId: 'c9', numero: 9, proveedorNombre: 'EL KIOSQUITO', fecha: el(2, 10), total: 70000, sumoStock: true, facturaUrl: '', anotaCostos: true,
  items: [
    { id: 'ace', nombre: 'Aceite De Oliva', tipoVenta: 'unidad', cantidad: 2, costoUnitario: 16000 },
    { id: 'n3', nombre: 'Nuez Mariposa x 3 kg', tipoVenta: 'peso', cantidad: 3000, costoUnitario: 9000, costoBolsa: 27000, gramosBolsa: 3000 },
    { id: 'mn', nombre: 'Maní', tipoVenta: 'peso', cantidad: 1000, costoUnitario: 7100 },
    { id: 'cas', nombre: 'Castaña', tipoVenta: 'unidad', cantidad: 1, costoUnitario: 7000 },
  ],
  costosCambiados: [
    { id: 'ace', nombre: 'Aceite De Oliva', antes: { costo: 15654.4, precio: 29743, precioMayorista: 20400, costoActualizadoEn: T1 },
      despues: { costo: 16000, precio: 30400, precioMayorista: 20800 } },
    { id: 'n3', nombre: 'Nuez Mariposa x 3 kg', antes: { costo: 8900, precio: 14240, precioMayorista: 11600, costoActualizadoEn: T2 },
      despues: { costo: 9000, precio: 14400, precioMayorista: 11700 } },
    { id: 'mn', nombre: 'Maní', antes: { costo: 7000, precio: 11200, precioMayorista: 0, costoActualizadoEn: T1 },
      despues: { costo: 7100, precio: 11360, precioMayorista: 0 } },
    { id: 'cas', nombre: 'Castaña', antes: { costo: 6500, precio: 9750, precioMayorista: 0, costoActualizadoEn: null },
      despues: { costo: 7000, precio: 10500, precioMayorista: 0 } },
  ],
});
/* Una compra más nueva que le cambió el costo al Maní (de $7.100 a $7.300). */
const compraDelMani = extra => Object.assign({
  docId: 'c10', numero: 10, proveedorNombre: 'EL KIOSQUITO', fecha: el(5, 10), comprobante: 'A 0001-00001234', anotaCostos: true,
  costosCambiados: [{ id: 'mn', nombre: 'Maní', antes: { costo: 7100, precio: 11360, precioMayorista: 0, costoActualizadoEn: HOY },
    despues: { costo: 7300, precio: 11680, precioMayorista: 0 } }],
}, extra || {});

async function correr(opts) {
  const o = opts || {};
  const base = o.base || baseNueva();
  const compra = Object.assign(compraNueva(), o.compra || {});
  if (o.sinCostos) { delete compra.costosCambiados; }
  if (o.vieja) { delete compra.costosCambiados; delete compra.anotaCostos; }
  const memoria = o.memoria || Object.keys(base).map(id => Object.assign({ id }, base[id]));
  const pasos = [], preguntas = [], avisos = [], historial = [], escrituras = [], consultas = [], escrCompras = [];
  /* Las compras como están en la base: la que se borra, las más nuevas y lo que cambie cada prueba. */
  const enLaBase = {};
  [compra].concat(o.posteriores || [], o.enLista || []).forEach(x => { enLaBase[x.docId] = x; });
  Object.assign(enLaBase, o.comprasEnLaBase || {});
  if (o.yaBorrada) delete enLaBase[compra.docId];
  const fakes = {
    _comprasCache: { dias: 90, porProveedor: {}, lista: [compra].concat(o.enLista || []) },
    allProducts: memoria,
    pedirConfirmacion: async (m, op) => { preguntas.push({ m, op }); return o.respuestas ? o.respuestas[preguntas.length - 1] : !o.cancelar; },
    esc: x => String(x == null ? '' : x),
    showAdminToast: (m, tipo) => avisos.push(tipo + ': ' + m),
    logAction: (a, b, c) => historial.push(b + ' | ' + c),
    closeCompraVerModal: () => pasos.push('cerro'),
    loadProveedores: () => pasos.push('recargo'),
    _refrescarAlertas: () => {},
    _reRenderProductos: () => pasos.push('repinto'),
    firebase: { firestore: { FieldValue: { delete: () => '__borrar__' } } },
    db: {
      collection: col => ({
        doc: id => ({ col, id, delete: async () => pasos.push('borro aparte ' + col + '/' + id) }),
        where: (campo, op, valor) => ({
          get: async () => {
            consultas.push(col + ':' + campo + op + valor);
            if (o.fallaLectura) throw new Error('sin conexion');
            const docs = (o.posteriores || []).filter(x => campo === 'numero' && op === '>' && Number(x.numero) > valor);
            return { forEach: fn => docs.forEach(d => { const datos = Object.assign({}, d); delete datos.docId; fn({ id: d.docId, data: () => datos }); }) };
          },
        }),
      }),
      runTransaction: async fn => {
        const pend = [];
        const tx = {
          get: async ref => (ref.col === 'compras'
            ? { exists: !!enLaBase[ref.id], data: () => copiaCompra(enLaBase[ref.id]) }
            : { exists: !!base[ref.id], data: () => Object.assign({}, base[ref.id]) }),
          update: (ref, d) => pend.push({ col: ref.col, id: ref.id, d }),
          delete: ref => pend.push({ col: ref.col, id: ref.id, borrar: true }),
        };
        const r = await fn(tx);
        if (o.fallaTx) throw new Error('sin conexion');
        pend.forEach(w => {
          if (w.borrar) { delete enLaBase[w.id]; pasos.push('borro ' + w.col + '/' + w.id); return; }
          if (w.col === 'compras') { escrCompras.push(w); enLaBase[w.id] = Object.assign({}, enLaBase[w.id], w.d); return; }
          Object.keys(w.d).forEach(k => { if (w.d[k] === '__borrar__') delete base[w.id][k]; else base[w.id][k] = w.d[k]; });
          escrituras.push(w);
        });
        return r;
      },
    },
    storage: {},
    console: { warn: () => {} },
  };
  const nombres = Object.keys(fakes);
  const lineaPesos = src.match(/const _cpPesos = [^\n]*/)[0];
  const armado = new Function(...nombres,
    lineaPesos + '\n' +
    cuerpo('_cpEsPeso') + cuerpo('_cpCant') + cuerpo('_cpMs') + cuerpo('_cpFechaTxt') +
    cuerpo('_cpStockTrasDevolver') + cuerpo('_cpAvisoVendidos') + cuerpo('_cpAvisoPagos') +
    cuerpo('_cpCostosCambiados') + cuerpo('_cpSigueComoLaDejo') + cuerpo('_cpCostoDeAntes') +
    cuerpo('_cpComprasPosteriores') + cuerpo('_cpQuienLoCambio') + cuerpo('_cpSucesor') + cuerpo('_cpCompraTxt') + cuerpo('_cpAvisoCostos') +
    cuerpo('esArchivoDeStorage') + cuerpo('borrarArchivoDeStorage') + cuerpo('_cpBorrarFactura') + cuerpo('borrarCompra') +
    ';return borrarCompra;');
  let borrar = armado(...nombres.map(n => fakes[n]));
  /* Con el freno de los clics de admin-compras.js, como queda en el panel. */
  if (o.deAUna) { const win = { borrarCompra: borrar }; new Function('window', envoltorio)(win); borrar = win.borrarCompra; }
  try {
    if (o.dobleClic) await Promise.all([borrar('c9'), borrar('c9')]);
    else await borrar('c9');
    if (o.otraVez) await borrar('c9');
  } catch (e) { pasos.push('ESCAPO:' + e.message); }
  return { base, memoria, pasos, preguntas, avisos, historial, escrituras, consultas, escrCompras, compra, enLaBase };
}

const VUELVEN = '\n\nEstos costos vuelven a como estaban antes de esta compra:' +
  '\n- Aceite De Oliva: el costo vuelve de $16.000 a $15.654 y el precio, de $30.400 a $29.743 (el mayorista, de $20.800 a $20.400)' +
  '\n- Nuez Mariposa x 3 kg: el costo vuelve de $9.000 a $8.900 el kilo y el precio, de $14.400 a $14.240 el kilo (el mayorista, de $11.700 a $11.600)' +
  '\n- Castaña: el costo vuelve de $7.000 a $6.500 y el precio, de $10.500 a $9.750';
const aviso = r => (r.preguntas[0] || {}).m || '';
const lineaMani = r => (aviso(r).split('\n').find(l => l.indexOf('- Maní:') === 0) || '');

(async () => {
  console.log('\n-- borrar una compra que actualizó costos --');
  {
    const r = await correr();
    t('el aviso dice qué costos vuelven, de cuánto a cuánto, y cuál no vuelve y por qué',
      aviso(r) === 'Compra #0009 de EL KIOSQUITO por $70.000.\n\nComo esta compra sumó stock, se le va a RESTAR a esos productos lo que había sumado.' +
        VUELVEN +
        '\n\nEstos costos no vuelven atrás:' +
        '\n- Maní: después de esta compra le cambiaron el costo o el precio desde la ficha, la ventana de costos o al importar costos.' +
        ' Se queda con el costo que tiene ahora: $7.300 el kilo.' +
        '\n\nEsto no se puede deshacer.', aviso(r));
    t('  busca en la base las compras más nuevas (número mayor que el de esta)', r.consultas.join() === 'compras:numero>9', r.consultas.join());
    const b = r.base;
    t('por unidad: el Aceite vuelve a $15.654,40, $29.743 y $20.400, con su fecha de antes, y el stock baja 2',
      b.ace.costo === 15654.4 && b.ace.precio === 29743 && b.ace.precioMayorista === 20400 && b.ace.costoActualizadoEn === T1 && b.ace.stock === 35);
    t('bolsa de un grupo (por peso): la de 3 kg vuelve a $8.900, $14.240 y $11.600 el kilo, con su fecha, y el stock baja 3 kg',
      b.n3.costo === 8900 && b.n3.precio === 14240 && b.n3.precioMayorista === 11600 && b.n3.costoActualizadoEn === T2 && b.n3.stock === 21000);
    t('por peso, cambiado después de la compra: el Maní queda como está ($7.300) y solo baja el stock',
      b.mn.costo === 7300 && b.mn.precio === 11680 && b.mn.costoActualizadoEn === HOY && b.mn.stock === 4000);
    t('sin fecha antes de la compra: la Castaña vuelve a $6.500 y $9.750 y la fecha se saca (no queda la de la compra)',
      b.cas.costo === 6500 && b.cas.precio === 9750 && !('costoActualizadoEn' in b.cas) && b.cas.stock === 59);
    t('una sola escritura por producto, en la misma transacción que el stock', r.escrituras.length === 4 &&
      new Set(r.escrituras.map(w => w.id)).size === 4 && r.escrituras.every(w => 'stock' in w.d), JSON.stringify(r.escrituras));
    t('  al Maní solo se le escribe el stock', JSON.stringify((r.escrituras.find(w => w.id === 'mn') || {}).d) === '{"stock":4000}');
    const mem = id => r.memoria.find(p => p.id === id);
    t('el panel queda al día sin recargar', mem('ace').costo === 15654.4 && mem('ace').precio === 29743 && mem('ace').stock === 35 &&
      mem('n3').precioMayorista === 11600 && mem('mn').costo === 7300 && mem('mn').stock === 4000 && !('costoActualizadoEn' in mem('cas')));
    t('se borra la compra, se repinta la tabla de productos y se cierra el detalle',
      r.pasos.indexOf('borro compras/c9') >= 0 && r.pasos.indexOf('repinto') >= 0 && r.pasos.indexOf('cerro') >= 0, r.pasos.join(' > '));
    t('avisa cuántos costos volvieron, y aparte cuál no volvió', r.avisos.indexOf('success: Compra eliminada. 3 costos volvieron a como estaban.') >= 0 &&
      r.avisos.indexOf('info: El costo de Maní no volvió atrás: se cambió después de esta compra.') >= 0, JSON.stringify(r.avisos));
    t('queda en el historial', r.historial.length === 1 &&
      r.historial[0].indexOf('costos de antes: Aceite De Oliva $15.654, Nuez Mariposa x 3 kg $8.900, Castaña $6.500') > 0 &&
      r.historial[0].indexOf('costos que no volvieron (cambiaron después): Maní') > 0, r.historial[0]);
  }
  console.log('\n-- si no vuelve porque lo cambió una compra más nueva, dice cuál --');
  {
    const r = await correr({ posteriores: [compraDelMani(),
      { docId: 'c11', numero: 11, proveedorNombre: 'EL KIOSQUITO', fecha: el(6, 10), anotaCostos: true,
        costosCambiados: [{ id: 'otro', nombre: 'Otro', antes: { costo: 1 }, despues: { costo: 2 } }] }] });
    t('nombra la compra que le cambió el costo, con su número, fecha y comprobante, y con qué costo se queda',
      lineaMani(r) === '- Maní: después de esta compra le cambió el costo la compra #0010 del 05/10/26 (comprobante A 0001-00001234).' +
        ' Se queda con el costo que tiene ahora: $7.300 el kilo.', lineaMani(r));
    t('  y la que cambió otro producto no cuenta', lineaMani(r).indexOf('#0011') < 0);
    t('  al terminar, el aviso también la nombra', r.avisos.indexOf('info: El costo de Maní no volvió atrás: lo cambió después la compra #0010.') >= 0,
      JSON.stringify(r.avisos));
    t('  y el historial', r.historial[0].indexOf('costos que no volvieron (cambiaron después): Maní (compra #0010)') > 0, r.historial[0]);
    t('  el Maní igual no se toca y los demás vuelven', r.base.mn.costo === 7300 && r.base.ace.costo === 15654.4);
  }
  {
    const r = await correr({ posteriores: [compraDelMani(), compraDelMani({ docId: 'c12', numero: 12, fecha: el(8, 10), comprobante: '' })] });
    t('si la cambiaron dos compras, nombra la más nueva; sin comprobante, lo dice',
      lineaMani(r) === '- Maní: después de esta compra le cambió el costo la compra #0012 del 08/10/26 (sin comprobante).' +
        ' Se queda con el costo que tiene ahora: $7.300 el kilo.', lineaMani(r));
  }
  {
    const r = await correr({ posteriores: [compraDelMani({ proveedorNombre: 'FRUTICOR' })] });
    t('si es de otro proveedor, lo dice', lineaMani(r).indexOf('le cambió el costo la compra #0010 a FRUTICOR del 05/10/26 (comprobante A 0001-00001234).') > 0,
      lineaMani(r));
  }
  {
    const r = await correr({ fallaLectura: true, enLista: [compraDelMani()] });
    t('si no se pueden leer las compras de la base, usa las de la lista del panel', lineaMani(r).indexOf('la compra #0010 del 05/10/26') > 0 &&
      r.pasos.indexOf('borro compras/c9') >= 0, lineaMani(r));
  }
  console.log('\n-- la compra que siguió se queda con el antes de la borrada (02/10) --');
  {
    const r = await correr({ posteriores: [compraDelMani()] });
    const w = r.escrCompras.find(x => x.id === 'c10');
    t('si el costo no vuelve porque lo cambió la compra que siguió, esa se queda con el antes de la borrada',
      r.escrCompras.length === 1 && !!w &&
      JSON.stringify(w.d.costosCambiados[0].antes) === JSON.stringify({ costo: 7000, precio: 11200, precioMayorista: 0, costoActualizadoEn: T1 }) &&
      JSON.stringify(w.d.costosCambiados[0].despues) === JSON.stringify({ costo: 7300, precio: 11680, precioMayorista: 0 }), JSON.stringify(r.escrCompras));
    t('  así, si después se borra también, vuelve a $7.000, el de antes de las dos', !!w && w.d.costosCambiados[0].antes.costo === 7000);
    t('  y el Maní igual no se toca ahora', r.base.mn.costo === 7300);
  }
  {
    const r = await correr({ posteriores: [compraDelMani({ costosCambiados: [{ id: 'mn', nombre: 'Maní',
      antes: { costo: 7200, precio: 11520, precioMayorista: 0, costoActualizadoEn: HOY }, despues: { costo: 7300, precio: 11680, precioMayorista: 0 } }] })] });
    t('si la que siguió arrancó de otro costo (lo cambiaron a mano en el medio), no se toca', r.escrCompras.length === 0, JSON.stringify(r.escrCompras));
  }
  {
    const r = await correr({ posteriores: [compraDelMani(), compraDelMani({ docId: 'c12', numero: 12, fecha: el(8, 10),
      costosCambiados: [{ id: 'mn', nombre: 'Maní', antes: { costo: 7300, precio: 11680, precioMayorista: 0, costoActualizadoEn: HOY },
        despues: { costo: 7500, precio: 12000, precioMayorista: 0 } }] })] });
    t('si la cambiaron dos, se lo queda solo la primera que siguió', r.escrCompras.length === 1 && r.escrCompras[0].id === 'c10',
      JSON.stringify(r.escrCompras.map(x => x.id)));
  }
  {
    const r = await correr({ posteriores: [compraDelMani({ costosCambiados: [{ id: 'mn', nombre: 'Maní',
      antes: { costo: 7200, precio: 11520, precioMayorista: 0, costoActualizadoEn: HOY }, despues: { costo: 7100, precio: 11360, precioMayorista: 0 } }] }),
      compraDelMani({ docId: 'c12', numero: 12, costosCambiados: [{ id: 'mn', nombre: 'Maní',
        antes: { costo: 7100, precio: 11360, precioMayorista: 0, costoActualizadoEn: HOY }, despues: { costo: 7300, precio: 11680, precioMayorista: 0 } }] })] });
    t('si la primera que siguió no arrancó de lo que dejó esta, ninguna se lo queda (aunque una más nueva coincida)', r.escrCompras.length === 0,
      JSON.stringify(r.escrCompras));
  }
  {
    /* Entre que se leyó la lista y la transacción, en la base la compra que siguió cambió. */
    const r = await correr({ posteriores: [compraDelMani()], comprasEnLaBase: { c10: compraDelMani({ costosCambiados: [{ id: 'mn', nombre: 'Maní',
      antes: { costo: 7200, precio: 11520, precioMayorista: 0, costoActualizadoEn: HOY }, despues: { costo: 7300, precio: 11680, precioMayorista: 0 } }] }) } });
    t('se mira la base dentro de la transacción: si la que siguió ya no arranca de lo que dejó esta, no se toca', r.escrCompras.length === 0,
      JSON.stringify(r.escrCompras));
  }
  {
    const r = await correr({ posteriores: [compraDelMani()], fallaTx: true });
    t('si la transacción falla, tampoco se toca la compra que siguió', r.escrCompras.length === 0 && r.pasos.indexOf('borro compras/c9') < 0);
  }
  console.log('\n-- revisión del 02/10: la compra se borra en la misma transacción, y de a una --');
  {
    const r = await correr();
    t('la compra se borra en la misma transacción que el stock y los costos, no aparte', r.pasos.indexOf('borro compras/c9') >= 0 &&
      !r.pasos.some(p => p.indexOf('borro aparte') === 0) && !r.enLaBase.c9, r.pasos.join(' > '));
  }
  {
    const r = await correr({ yaBorrada: true });
    t('si la compra ya no está en la base (la borró otra pantalla), no se toca nada y lo dice',
      r.escrituras.length === 0 && r.escrCompras.length === 0 && r.base.ace.stock === 37 && r.base.ace.costo === 16000 &&
      r.avisos.join() === 'info: Esta compra ya se había eliminado.' && r.historial.length === 0 &&
      r.pasos.indexOf('cerro') >= 0 && r.pasos.indexOf('recargo') >= 0 && !r.pasos.some(p => p.indexOf('borro') === 0 || p.indexOf('ESCAPO') === 0),
      JSON.stringify(r.avisos) + ' ' + r.pasos.join(' > '));
  }
  {
    const r = await correr({ otraVez: true });
    t('si se vuelve a borrar la misma, la segunda vez ve que ya no está: el stock baja una sola vez',
      r.base.ace.stock === 35 && r.base.n3.stock === 21000 && r.base.mn.stock === 4000 && r.preguntas.length === 2 &&
      r.avisos.indexOf('info: Esta compra ya se había eliminado.') >= 0 && r.historial.length === 1, JSON.stringify(r.avisos));
  }
  {
    /* Otra pantalla borró una compra anterior y esta se quedó con su "antes": la lista del panel no lo sabe. */
    const fresca = compraNueva();
    fresca.costosCambiados[0].antes = { costo: 15000, precio: 28500, precioMayorista: 19500, costoActualizadoEn: T2 };
    const r = await correr({ comprasEnLaBase: { c9: fresca } });
    t('los costos vuelven a lo que dice la compra en la base, no la lista del panel',
      r.base.ace.costo === 15000 && r.base.ace.precio === 28500 && r.base.ace.precioMayorista === 19500 && r.base.ace.costoActualizadoEn === T2 &&
      r.memoria.find(p => p.id === 'ace').costo === 15000 && r.historial[0].indexOf('Aceite De Oliva $15.000') > 0, JSON.stringify(r.base.ace));
  }
  {
    const r = await correr({ deAUna: true, dobleClic: true });
    t('un doble clic en "Eliminar" abre un solo aviso y borra una sola vez', r.preguntas.length === 1 && r.base.ace.stock === 35 &&
      r.escrituras.length === 4 && r.avisos.filter(a => a.indexOf('success:') === 0).length === 1, r.preguntas.length + ' ' + JSON.stringify(r.avisos));
  }
  {
    const r = await correr({ deAUna: true, respuestas: [false, true], otraVez: true });
    t('  terminado (aunque se haya cancelado), se puede volver a borrar', r.preguntas.length === 2 && r.base.ace.stock === 35, r.preguntas.length);
  }
  {
    const r = await correr({ deAUna: true, fallaTx: true, otraVez: true });
    t('  y si falló, también', r.preguntas.length === 2 && r.avisos.filter(a => a.indexOf('error:') === 0).length === 2, JSON.stringify(r.avisos));
  }
  {
    const base = baseNueva();
    delete base.cas;
    const r = await correr({ base });
    t('un producto que se borró después de la compra: el aviso dice que ya no está, no que le cambiaron el costo',
      aviso(r).indexOf('Se queda con el costo que tiene ahora: $7.300 el kilo.\n- Castaña: ya no está entre los productos.\n\nEsto no se puede deshacer.') > 0,
      aviso(r));
  }
  console.log('\n-- los otros casos --');
  {
    const base = baseNueva();
    base.mn.costo = 7100; base.mn.precio = 11360;
    const r = await correr({ base });
    t('si vuelven todos, lo dice así', r.avisos.indexOf('success: Compra eliminada. Los costos volvieron a como estaban.') >= 0 &&
      !r.avisos.some(a => a.indexOf('info:') === 0) && r.base.mn.costo === 7000, JSON.stringify(r.avisos));
  }
  {
    const r = await correr({ cancelar: true });
    t('si se cancela, no se toca nada', r.escrituras.length === 0 && r.pasos.length === 0 && r.base.ace.costo === 16000);
  }
  {
    /* Lo que manda es la base: el panel tenía al Maní como lo dejó la compra, pero en la base ya cambió. */
    const base = baseNueva();
    const memoria = Object.keys(base).map(id => Object.assign({ id }, base[id], id === 'mn' ? { costo: 7100, precio: 11360 } : {}));
    const r = await correr({ base, memoria });
    t('si el panel no estaba al día, manda la base: el aviso decía que el Maní volvía, pero no se toca',
      aviso(r).indexOf('- Maní: el costo vuelve de $7.100 a $7.000 el kilo') > 0 && r.base.mn.costo === 7300 &&
      r.avisos.indexOf('info: El costo de Maní no volvió atrás: se cambió después de esta compra.') >= 0, JSON.stringify(r.avisos));
  }
  {
    const r = await correr({ compra: { sumoStock: false } });
    t('una compra que no sumó stock igual vuelve los costos, sin tocar el stock',
      r.escrituras.length === 3 && r.escrituras.every(w => !('stock' in w.d)) && r.base.ace.costo === 15654.4 && r.base.ace.stock === 37 &&
      r.base.mn.costo === 7300 && aviso(r).indexOf('Esta compra no había sumado stock') > 0, JSON.stringify(r.escrituras));
  }
  {
    const r = await correr({ vieja: true });
    t('una compra de antes del 02/10 no anotaba los costos: el aviso lo dice y solo vuelve el stock',
      aviso(r).indexOf('\n\nSi con esta compra actualizaste costos, esos no vuelven atrás: la compra es de antes de que el sistema anotara cómo estaban.') > 0 &&
      r.escrituras.length === 4 && r.escrituras.every(w => Object.keys(w.d).join() === 'stock') && r.base.ace.costo === 16000 &&
      r.consultas.length === 0 && r.avisos.indexOf('success: Compra eliminada') >= 0, JSON.stringify(r.avisos));
  }
  {
    const r = await correr({ sinCostos: true });
    t('una compra nueva en la que no se actualizó ningún costo no dice nada de costos ni busca otras compras',
      aviso(r).indexOf('costos') < 0 && r.consultas.length === 0 && r.escrituras.every(w => Object.keys(w.d).join() === 'stock'), aviso(r));
  }
  {
    const base = baseNueva();
    delete base.cas;
    const r = await correr({ base });
    t('un producto que ya no está en la base se saltea, sin romper el resto', r.escrituras.length === 3 && r.base.ace.costo === 15654.4 &&
      r.pasos.indexOf('borro compras/c9') >= 0 && !r.pasos.some(p => p.indexOf('ESCAPO') === 0));
  }
  {
    const r = await correr({ fallaTx: true });
    t('si la transacción falla, no se borra la compra ni se toca nada, y lo dice',
      r.escrituras.length === 0 && r.pasos.indexOf('borro compras/c9') < 0 && r.base.ace.costo === 16000 && r.base.ace.stock === 37 &&
      r.avisos.indexOf('error: No se pudo eliminar: sin conexion') >= 0, JSON.stringify(r.avisos));
  }

  console.log('\n' + ok + ' pasaron, ' + fail + ' fallaron');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
