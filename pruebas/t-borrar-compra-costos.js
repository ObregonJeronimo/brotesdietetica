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
 * Las compras de antes del 02/10 no anotaban nada: el aviso lo dice y no se toca ningún costo.
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

let ok = 0, fail = 0;
const t = (d, c, extra) => {
  if (c) { ok++; console.log('  OK   ' + d); }
  else { fail++; console.log('  FALLA ' + d + (extra !== undefined ? '   [' + extra + ']' : '')); }
};

/* Fechas de mentira, como los Timestamp de Firestore. */
const T1 = { seconds: 1758000000, nanoseconds: 0, cual: 'T1' };
const T2 = { seconds: 1759000000, nanoseconds: 0, cual: 'T2' };
const HOY = { seconds: 1759400000, nanoseconds: 0, cual: 'la de la compra' };

/* La base después de la compra: el Maní lo volvieron a cambiar después ($7.300). */
const baseNueva = () => ({
  ace: { nombre: 'Aceite De Oliva', tipoVenta: 'unidad', stock: 37, costo: 16000, precio: 30400, precioMayorista: 20800, costoActualizadoEn: HOY },
  n3: { nombre: 'Nuez Mariposa x 3 kg', tipoVenta: 'peso', stock: 24000, costo: 9000, precio: 14400, precioMayorista: 11700, costoActualizadoEn: HOY },
  mn: { nombre: 'Maní', tipoVenta: 'peso', stock: 5000, costo: 7300, precio: 11680, precioMayorista: 0, costoActualizadoEn: HOY },
  cas: { nombre: 'Castaña', tipoVenta: 'unidad', stock: 60, costo: 7000, precio: 10500, precioMayorista: 0, costoActualizadoEn: HOY },
});
const compraNueva = () => ({
  docId: 'c9', numero: 9, proveedorNombre: 'EL KIOSQUITO', total: 70000, sumoStock: true, facturaUrl: '', anotaCostos: true,
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

async function correr(opts) {
  const o = opts || {};
  const base = o.base || baseNueva();
  const compra = Object.assign(compraNueva(), o.compra || {});
  if (o.sinCostos) { delete compra.costosCambiados; }
  if (o.vieja) { delete compra.costosCambiados; delete compra.anotaCostos; }
  const memoria = o.memoria || Object.keys(base).map(id => Object.assign({ id }, base[id]));
  const pasos = [], preguntas = [], avisos = [], historial = [], escrituras = [];
  const fakes = {
    _comprasCache: { dias: 90, porProveedor: {}, lista: [compra] },
    allProducts: memoria,
    pedirConfirmacion: async (m, op) => { preguntas.push({ m, op }); return !o.cancelar; },
    esc: x => String(x == null ? '' : x),
    showAdminToast: (m, tipo) => avisos.push(tipo + ': ' + m),
    logAction: (a, b, c) => historial.push(b + ' | ' + c),
    closeCompraVerModal: () => pasos.push('cerro'),
    loadProveedores: () => pasos.push('recargo'),
    _refrescarAlertas: () => {},
    _reRenderProductos: () => pasos.push('repinto'),
    firebase: { firestore: { FieldValue: { delete: () => '__borrar__' } } },
    db: {
      collection: col => ({ doc: id => ({ col, id, delete: async () => pasos.push('borro ' + col + '/' + id) }) }),
      runTransaction: async fn => {
        const pend = [];
        const tx = {
          get: async ref => ({ exists: !!base[ref.id], data: () => Object.assign({}, base[ref.id]) }),
          update: (ref, d) => pend.push({ id: ref.id, d }),
        };
        const r = await fn(tx);
        if (o.fallaTx) throw new Error('sin conexion');
        pend.forEach(w => {
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
    cuerpo('_cpEsPeso') + cuerpo('_cpCant') + cuerpo('_cpStockTrasDevolver') + cuerpo('_cpAvisoVendidos') + cuerpo('_cpAvisoPagos') +
    cuerpo('_cpCostosCambiados') + cuerpo('_cpSigueComoLaDejo') + cuerpo('_cpCostoDeAntes') + cuerpo('_cpAvisoCostos') +
    cuerpo('esArchivoDeStorage') + cuerpo('borrarArchivoDeStorage') + cuerpo('_cpBorrarFactura') + cuerpo('borrarCompra') +
    ';return borrarCompra;');
  const borrar = armado(...nombres.map(n => fakes[n]));
  try { await borrar('c9'); } catch (e) { pasos.push('ESCAPO:' + e.message); }
  return { base, memoria, pasos, preguntas, avisos, historial, escrituras, compra };
}

(async () => {
  console.log('\n-- borrar una compra que actualizó costos --');
  {
    const r = await correr();
    const m = (r.preguntas[0] || {}).m || '';
    t('el aviso dice qué costos vuelven, de cuánto a cuánto, y cuál no se toca porque cambió después',
      m === 'Compra #0009 de EL KIOSQUITO por $70.000.\n\nComo esta compra sumó stock, se le va a RESTAR a esos productos lo que había sumado.' +
        '\n\nLos costos que se actualizaron con esta compra vuelven a como estaban:' +
        '\n- Aceite De Oliva: el costo vuelve de $16.000 a $15.654 y el precio, de $30.400 a $29.743 (el mayorista, de $20.800 a $20.400)' +
        '\n- Nuez Mariposa x 3 kg: el costo vuelve de $9.000 a $8.900 el kilo y el precio, de $14.400 a $14.240 el kilo (el mayorista, de $11.700 a $11.600)' +
        '\n- Maní: no se toca, porque su costo o su precio cambiaron después de esta compra' +
        '\n- Castaña: el costo vuelve de $7.000 a $6.500 y el precio, de $10.500 a $9.750' +
        '\n\nEsto no se puede deshacer.', m);
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
    t('  al Maní solo se le escribe el stock', JSON.stringify(r.escrituras.find(w => w.id === 'mn').d) === '{"stock":4000}');
    const mem = id => r.memoria.find(p => p.id === id);
    t('el panel queda al día sin recargar', mem('ace').costo === 15654.4 && mem('ace').precio === 29743 && mem('ace').stock === 35 &&
      mem('n3').precioMayorista === 11600 && mem('mn').costo === 7300 && mem('mn').stock === 4000 && !('costoActualizadoEn' in mem('cas')));
    t('se borra la compra, se repinta la tabla de productos y se cierra el detalle',
      r.pasos.indexOf('borro compras/c9') >= 0 && r.pasos.indexOf('repinto') >= 0 && r.pasos.indexOf('cerro') >= 0, r.pasos.join(' > '));
    t('avisa que los costos volvieron, y aparte cuál no se tocó', r.avisos.indexOf('success: Compra eliminada. Los costos volvieron a como estaban.') >= 0 &&
      r.avisos.indexOf('info: El costo de Maní no se tocó: cambió después de esta compra.') >= 0, JSON.stringify(r.avisos));
    t('queda en el historial', r.historial.length === 1 &&
      r.historial[0].indexOf('costos de antes: Aceite De Oliva $15.654, Nuez Mariposa x 3 kg $8.900, Castaña $6.500') > 0 &&
      r.historial[0].indexOf('costos que no se tocaron (cambiaron después): Maní') > 0, r.historial[0]);
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
      ((r.preguntas[0] || {}).m || '').indexOf('- Maní: el costo vuelve de $7.100 a $7.000 el kilo') > 0 && r.base.mn.costo === 7300 &&
      r.avisos.indexOf('info: El costo de Maní no se tocó: cambió después de esta compra.') >= 0);
  }
  {
    const r = await correr({ compra: { sumoStock: false } });
    t('una compra que no sumó stock igual vuelve los costos, sin tocar el stock',
      r.escrituras.length === 3 && r.escrituras.every(w => !('stock' in w.d)) && r.base.ace.costo === 15654.4 && r.base.ace.stock === 37 &&
      r.base.mn.costo === 7300 && ((r.preguntas[0] || {}).m || '').indexOf('Esta compra no había sumado stock') > 0, JSON.stringify(r.escrituras));
  }
  {
    const r = await correr({ vieja: true });
    const m = (r.preguntas[0] || {}).m || '';
    t('una compra de antes del 02/10 no anotaba los costos: el aviso lo dice y solo vuelve el stock',
      m.indexOf('\n\nSi con esta compra actualizaste costos, esos no vuelven atrás: la compra es de antes de que el sistema anotara cómo estaban.') > 0 &&
      r.escrituras.length === 4 && r.escrituras.every(w => Object.keys(w.d).join() === 'stock') && r.base.ace.costo === 16000 &&
      r.avisos.indexOf('success: Compra eliminada') >= 0, JSON.stringify(r.avisos));
  }
  {
    const r = await correr({ sinCostos: true });
    const m = (r.preguntas[0] || {}).m || '';
    t('una compra nueva en la que no se actualizó ningún costo no dice nada de costos',
      m.indexOf('costos') < 0 && r.escrituras.every(w => Object.keys(w.d).join() === 'stock'), m);
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
