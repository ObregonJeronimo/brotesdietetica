/**
 * BORRAR UNA COMPRA TIENE QUE LLEVARSE SU FACTURA.
 *
 * Hasta ahora el panel subia archivos y no sacaba ninguno nunca. Borrar una
 * compra sacaba el documento de Firestore y dejaba la imagen o el PDF dando
 * vueltas en el bucket para siempre, sin nada que lo apuntara. Un remito
 * sacado con el celular pesa entre 2 y 5 MB -no se comprime a proposito,
 * porque despues hay que poder LEERLO-, asi que cada compra borrada se
 * llevaba puesto ese espacio sin devolverlo. Paso de verdad: el PDF de la
 * compra de prueba quedo colgado y hubo que sacarlo a mano.
 *
 * Dos cosas que no son obvias y que esta prueba sostiene:
 *
 *   1. EL ORDEN. El archivo se borra DESPUES del documento, nunca antes. Si
 *      el borrado del documento fallara y ya hubieramos borrado el archivo,
 *      quedaria una compra viva sin su comprobante, que es justo lo que hay
 *      que poder mostrarle al proveedor. Al reves el peor caso es un archivo
 *      huerfano: molesto, pero no se pierde nada que importe.
 *
 *   2. QUE NO ARRASTRE. Cuando esto corre, la compra YA se borro. Que el
 *      archivo no se pueda sacar no puede convertir una operacion que salio
 *      bien en un "no se pudo eliminar" en la cara del usuario.
 */
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'admin-compras.js'), 'utf8');

function cuerpo(n) {
  let i = src.indexOf('function ' + n + '(');
  if (i < 0) throw new Error('no encontre ' + n);
  /* Sin esto se pierde el `async` de la declaracion y el `await` de adentro
     deja de ser valido: "await is only valid in async functions". */
  if (src.slice(i - 6, i) === 'async ') i -= 6;
  let p = 0, k;
  for (k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') p++;
    else if (src[k] === '}') { p--; if (!p) break; }
  }
  return src.slice(i, k + 1);
}

let ok = 0, fail = 0;
const t = (d, c) => { if (c) { ok++; console.log('  OK   ' + d); } else { fail++; console.log('  FALLA ' + d); } };

/* Se arma el escenario con todo falseado, anotando el orden de lo que pasa. */
async function correr(opts) {
  const o = opts || {};
  const pasos = [];
  const compra = {
    docId: 'c1', numero: 7, proveedorNombre: 'LISTA 1', total: 37900,
    sumoStock: false,
    facturaUrl: o.sinFactura ? '' : 'https://fake/o/compras%2Fremito.pdf?alt=media&token=x',
    items: [],
  };

  const fakes = {
    _comprasCache: { dias: 90, porProveedor: {}, lista: [compra] },
    allProducts: [],
    pedirConfirmacion: async () => true,
    esc: (x) => String(x == null ? '' : x),
    showAdminToast: (m, tipo) => pasos.push('toast:' + tipo + ':' + String(m).slice(0, 30)),
    logAction: () => pasos.push('logAction'),
    closeCompraVerModal: () => pasos.push('cerroModal'),
    loadProveedores: () => pasos.push('loadProveedores'),
    _refrescarAlertas: () => {},
    db: {
      collection: () => ({
        doc: () => ({
          delete: async () => {
            pasos.push('borro DOCUMENTO');
            if (o.docFalla) throw new Error('sin permiso');
          },
        }),
      }),
    },
    storage: {
      refFromURL: (u) => {
        pasos.push('refFromURL:' + u.split('/o/')[1].split('?')[0]);
        return {
          delete: async () => {
            pasos.push('borro ARCHIVO');
            if (o.storageFalla) { const e = new Error('x'); e.code = o.storageFalla; throw e; }
          },
        };
      },
    },
    console: { warn: (m) => pasos.push('warn') },
  };

  const nombres = Object.keys(fakes);
  /* _cpPesos es una const con una arrow, no una funcion: se saca su linea. */
  const lineaPesos = src.match(/const _cpPesos = [^\n]*/)[0];

  const armado = new Function(...nombres,
    lineaPesos + '\n' +
    cuerpo('_cpEsPeso') + cuerpo('_cpCant') +
    cuerpo('_cpStockTrasDevolver') + cuerpo('_cpAvisoVendidos') +
    cuerpo('_cpBorrarFactura') + cuerpo('borrarCompra') +
    ';return borrarCompra;');

  const borrar = armado(...nombres.map((n) => fakes[n]));
  try { await borrar('c1'); } catch (e) { pasos.push('ESCAPO:' + e.message); }
  return pasos;
}

(async () => {
  const normal = await correr();
  console.log('\n  el camino normal: ' + normal.join(' > '));
  t('borra el documento', normal.indexOf('borro DOCUMENTO') >= 0);
  t('y tambien el archivo', normal.indexOf('borro ARCHIVO') >= 0);
  t('EL ARCHIVO DESPUES DEL DOCUMENTO, nunca antes',
    normal.indexOf('borro DOCUMENTO') < normal.indexOf('borro ARCHIVO'));
  t('apunta al archivo correcto', normal.some(p => p === 'refFromURL:compras%2Fremito.pdf'));
  t('avisa que salio bien', normal.some(p => p.indexOf('toast:success') === 0));
  t('cierra el detalle', normal.indexOf('cerroModal') >= 0);

  const sin = await correr({ sinFactura: true });
  t('una compra sin factura no toca el bucket', !sin.some(p => p.indexOf('refFromURL') === 0));
  t('y se borra igual', sin.indexOf('borro DOCUMENTO') >= 0 && sin.some(p => p.indexOf('toast:success') === 0));

  /* Que el archivo ya no este es exactamente el estado que buscabamos. */
  const yaEstaba = await correr({ storageFalla: 'storage/object-not-found' });
  t('si el archivo ya no estaba, no se queja', !yaEstaba.some(p => p === 'warn'));
  t('y la compra igual queda borrada',
    yaEstaba.some(p => p.indexOf('toast:success') === 0) && !yaEstaba.some(p => p.indexOf('ESCAPO') === 0));

  /* El caso importante: el bucket falla de verdad. */
  const sinPermiso = await correr({ storageFalla: 'storage/unauthorized' });
  t('si el bucket falla, queda registro en la consola', sinPermiso.indexOf('warn') >= 0);
  t('pero NO se le dice al usuario que fallo el borrado',
    !sinPermiso.some(p => p.indexOf('toast:error') === 0));
  t('y la compra queda borrada igual, que es la verdad',
    sinPermiso.some(p => p.indexOf('toast:success') === 0));
  t('el error no se escapa', !sinPermiso.some(p => p.indexOf('ESCAPO') === 0));

  /* Si falla el documento, el archivo NO se puede haber tocado. */
  const docMal = await correr({ docFalla: true });
  console.log('  si falla el documento: ' + docMal.join(' > '));
  t('si el documento no se borro, el archivo no se toca',
    !docMal.some(p => p === 'borro ARCHIVO'));
  t('y ahi si se avisa del error', docMal.some(p => p.indexOf('toast:error') === 0));

  console.log('\n' + ok + ' pasaron, ' + fail + ' fallaron');
  process.exit(fail ? 1 : 0);
})();
