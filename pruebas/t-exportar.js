/**
 * LO QUE SE EXPORTA ES LO QUE SE VE.
 *
 * El PDF y el Excel salen del MISMO objeto: cada seccion arma una estructura
 * de bloques y admin-exportar.js la dibuja de las dos formas. Esa estructura
 * es codigo puro -no toca el DOM ni Firestore- y por eso se puede probar aca,
 * que es donde se ven los errores que en un PDF no se notan: una columna
 * corrida, un total que no cierra, un checkbox que no cambia nada.
 *
 * Lo que se sostiene:
 *   - el resumen del proveedor lleva lo mismo que muestra la pantalla;
 *   - el top va ordenado por MONTO y cortado en 10;
 *   - el checkbox de "no vendidos" de verdad agrega o saca ese bloque;
 *   - la compra exporta sus items y cierra con el total;
 *   - el nombre del archivo no depende de lo que el usuario haya escrito.
 */
const fs = require('fs');
const path = require('path');
const RAIZ = path.join(__dirname, '..');

const srcExp = fs.readFileSync(path.join(RAIZ, 'admin-exportar.js'), 'utf8');
const srcProv = fs.readFileSync(path.join(RAIZ, 'admin-proveedores.js'), 'utf8');
const srcComp = fs.readFileSync(path.join(RAIZ, 'admin-compras.js'), 'utf8');

function cuerpo(src, n) {
  const i = src.indexOf('function ' + n + '(');
  if (i < 0) throw new Error('no encontre ' + n);
  let p = 0, k;
  for (k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') p++;
    else if (src[k] === '}') { p--; if (!p) break; }
  }
  return src.slice(i, k + 1);
}
function linea(src, re) {
  const m = src.match(re);
  if (!m) throw new Error('no encontre ' + re);
  return m[0];
}

let ok = 0, fail = 0;
const t = (d, c) => { if (c) { ok++; console.log('  OK   ' + d); } else { fail++; console.log('  FALLA ' + d); } };

/* ------------------------------------------------------ nombre de archivo */
const nombre = new Function(cuerpo(srcExp, '_expHoy') + cuerpo(srcExp, '_expNombre') +
                            ';return _expNombre;')();
const hoy = new Function(cuerpo(srcExp, '_expHoy') + ';return _expHoy;')();

t('el nombre arranca con BROTES y termina en la fecha',
  /^BROTES_.*_\d{4}-\d\d-\d\d$/.test(nombre('LISTA 1')));
t('saca los acentos', nombre('Café') === 'BROTES_Cafe_' + hoy());
t('no deja barras ni dos puntos, que Windows no acepta',
  !/[\\/:*?"<>|]/.test(nombre('Proveedor / Sur: "el mejor"')));
t('un nombre vacio no rompe', nombre('') === 'BROTES_export_' + hoy());
t('recorta los nombres larguisimos', nombre('x'.repeat(300)).length < 90);

/* ---------------------------------------------------------------- compras */
const docCompra = new Function(
  linea(srcComp, /const _cpPesos = [^\n]*/) + '\n' +
  cuerpo(srcComp, '_cpEsPeso') + cuerpo(srcComp, '_cpCant') +
  cuerpo(srcComp, '_cpMs') + cuerpo(srcComp, '_cpFechaTxt') +
  cuerpo(srcComp, '_cpDocExportar') + ';return _cpDocExportar;')();

const compra = {
  numero: 7, proveedorNombre: 'LISTA 1', comprobante: 'A 0001-123', total: 37900,
  usuario: 'jero@x.com', sumoStock: true,
  /* Como viene de Firestore de verdad: un Timestamp, no un Date ni null. */
  fecha: { seconds: Math.floor(Date.UTC(2026, 7, 29, 12) / 1000), nanoseconds: 0 },
  items: [
    { nombre: 'Nueces', cantidad: 500, tipoVenta: 'peso', costoUnitario: 14000, subtotal: 7000 },
    { nombre: 'Galletas', cantidad: 2, tipoVenta: 'unidad', costoUnitario: 15450, subtotal: 30900 },
  ],
};
const dc = docCompra(compra);
t('la compra titula con su numero en 4 digitos', dc.titulo === 'Compra #0007');
t('el archivo lleva el numero y el proveedor',
  dc.archivo.indexOf('0007') > 0 && dc.archivo.indexOf('LISTA 1') > 0);
t('trae los dos bloques: datos y lo que entro', dc.bloques.length === 2);

const tabla = dc.bloques[1];
t('la tabla tiene una fila por item mas el total', tabla.filas.length === 3);
t('la ultima fila es el TOTAL', tabla.filas[2][0] === 'TOTAL');
t('y el total coincide con el de la compra', tabla.filas[2][3] === '$37.900');
t('los 500 g se muestran como peso, no como 500 unidades',
  String(tabla.filas[0][1]).indexOf('500') >= 0 && String(tabla.filas[0][1]).indexOf('u') < 0);
t('el costo por peso se marca /kg', String(tabla.filas[0][2]).indexOf('/kg') > 0);
t('el de unidad no lleva /kg', String(tabla.filas[1][2]).indexOf('/kg') < 0);
t('el subtotal de 500 g a $14.000 el kilo es $7.000', tabla.filas[0][3] === '$7.000');

const pares = dc.bloques[0].filas;
const buscar = (etq) => (pares.find(f => f[0] === etq) || [])[1];
t('dice quien la cargo', buscar('Cargada por') === 'jero@x.com');
t('la fecha de Firestore se muestra como fecha, no como "-"',
  buscar('Fecha') !== '-' && /\d\d\/\d\d\/\d\d/.test(buscar('Fecha')));
t('avisa cuando la compra NO sumo stock',
  String(docCompra(Object.assign({}, compra, { sumoStock: false }))
    .bloques[0].filas.find(f => f[0] === 'Stock')[1]).indexOf('NO') === 0);
t('sin comprobante lo dice en vez de dejarlo vacio',
  docCompra(Object.assign({}, compra, { comprobante: '' }))
    .bloques[0].filas.find(f => f[0] === 'Comprobante')[1] === 'sin comprobante');
t('las notas solo aparecen si las hay', buscar('Notas') === undefined);
t('y aparecen cuando estan',
  docCompra(Object.assign({}, compra, { notas: 'ojo' }))
    .bloques[0].filas.some(f => f[0] === 'Notas'));

/* ------------------------------------------------------------ proveedores */
const PRODS = [
  { id: 'a', nombre: 'Nueces', lista: 'L1', stock: 1500, tipoVenta: 'peso' },
  { id: 'b', nombre: 'Galletas', lista: 'L1', stock: 4, tipoVenta: 'unidad' },
  { id: 'c', nombre: 'Avena', lista: 'L1', stock: 0, tipoVenta: 'unidad' },
  { id: 'd', nombre: 'Miel', lista: 'L1', stock: 3, tipoVenta: 'unidad', oculto: true },
  { id: 'z', nombre: 'De otro', lista: 'L9', stock: 5, tipoVenta: 'unidad' },
];
/* Las fechas del periodo se arman EXACTAMENTE como las arma el codigo real,
   corriendo su misma cuenta. Antes este fixture usaba objetos Date y el de
   verdad guarda STRINGS -_provCargarVentas los pasa por _provFecha antes de
   guardarlos, porque los necesita para el rango de la consulta-. Con el
   fixture equivocado la prueba pasaba en verde mientras el boton Exportar
   reventaba en la cara del usuario con "d.getFullYear is not a function".

   Un fixture que no tiene la forma del dato real no prueba nada: prueba otro
   programa. */
const provFecha = new Function(cuerpo(srcProv, '_provFecha') + ';return _provFecha;')();
const F_HASTA = new Date();
const F_DESDE = new Date(F_HASTA.getTime() - 90 * 86400000);
const D_DESDE = provFecha(F_DESDE), D_HASTA = provFecha(F_HASTA);

t('el codigo real guarda las fechas del periodo como texto, no como Date',
  typeof D_DESDE === 'string' && /^\d{4}-\d\d-\d\d$/.test(D_DESDE));
t('y _provCargarVentas es quien las formatea antes de guardarlas',
  /const dDesde = _provFecha\(desde\), dHasta = _provFecha\(hasta\)/.test(srcProv));

const DATOS = {
  dias: 90, desde: D_DESDE, hasta: D_HASTA,
  porLista: {
    L1: {
      facturado: 37900, ventas: 3,
      productos: {
        a: { id: 'a', nombre: 'Nueces', gramos: 500, unidades: 0, monto: 7000 },
        b: { id: 'b', nombre: 'Galletas', gramos: 0, unidades: 2, monto: 30900 },
      },
    },
  },
};

const docProv = new Function(
  'var allProducts, _provDatos, _provDias, _comprasCache;' +
  cuerpo(srcProv, '_provCant') + cuerpo(srcProv, '_provFecha') +
  linea(srcProv, /const _provPesos = [^\n]*/) + '\n' +
  cuerpo(srcProv, '_provResumen') + cuerpo(srcProv, '_provNoVendidos') +
  cuerpo(srcProv, '_provDocExportar') +
  ';return function(lista, noVend, prods, datos, compras){' +
  ' allProducts = prods; _provDatos = datos; _provDias = 90; _comprasCache = compras;' +
  ' return _provDocExportar(lista, noVend); };')();

const L1 = { id: 'L1', nombre: 'LISTA 1' };
const dp = docProv(L1, false, PRODS, DATOS, null);
const res = dp.bloques[0].filas;
const val = (etq) => (res.find(f => f[0] === etq) || [])[1];

t('el proveedor titula con su nombre', dp.titulo === 'Proveedor LISTA 1');
t('el subtitulo dice el periodo y las fechas',
  dp.subtitulo.indexOf('90 días') > 0 && dp.subtitulo.indexOf(D_DESDE) > 0 &&
  dp.subtitulo.indexOf(D_HASTA) > 0);
t('exporta lo facturado', val('Facturado') === '$37.900');
t('exporta las ventas con productos suyos', val('Ventas con productos suyos') === '3');
t('cuenta solo los productos de ESE proveedor', val('Productos en el catálogo') === '4');
t('cuenta los que se vendieron', val('Se vendieron') === '2');
t('y los que no', val('No se vendió ninguno') === '2');
t('cuenta los que se venden por peso', val('Se venden por peso') === '1');
t('cuenta los ocultos', val('Ocultos en la tienda') === '1');
t('cuenta los sin stock', val('Sin stock') === '1');
/* Sin compras cargadas no se inventa una fila en $0: hace pensar que nunca se
   le compro, cuando lo que pasa es que nadie cargo la compra todavia. */
t('sin compras cargadas no aparece "Le compraste"', val('Le compraste') === undefined);
t('con compras cargadas si aparece, y la diferencia',
  (() => {
    const d2 = docProv(L1, false, PRODS, DATOS, { porProveedor: { L1: { total: 20000 } } });
    const f = d2.bloques[0].filas;
    const v = (e) => (f.find(x => x[0] === e) || [])[1];
    return v('Le compraste') === '$20.000' && v('Diferencia del período') === '$17.900';
  })());

const topB = dp.bloques[1];
t('el bloque del top se llama como en pantalla',
  topB.titulo === 'Los 10 productos más vendidos de este proveedor');
t('el top va por MONTO: Galletas ($30.900) antes que Nueces ($7.000)',
  topB.filas[0][1] === 'Galletas' && topB.filas[1][1] === 'Nueces');
t('numera desde 1', topB.filas[0][0] === 1);
t('los gramos se muestran como peso', String(topB.filas[1][2]).indexOf('u') < 0);

/* --------------------------------------------- el checkbox hace algo real */
t('desmarcado: no va el bloque de los no vendidos', dp.bloques.length === 2);
const dpTodo = docProv(L1, true, PRODS, DATOS, null);
t('marcado: aparece el bloque', dpTodo.bloques.length === 3);
t('con los 2 que no se vendieron', dpTodo.bloques[2].filas.length === 2);
t('ordenados alfabeticamente', dpTodo.bloques[2].filas[0][0] === 'Avena');
t('marcando el que no tiene stock', dpTodo.bloques[2].filas[0][1] === 'sin stock');
t('y no se cuela ninguno de otro proveedor',
  !dpTodo.bloques[2].filas.some(f => f[0] === 'De otro'));

/* Un proveedor sin ninguna venta no puede dar una tabla vacia sin explicacion. */
const vacio = docProv({ id: 'L9', nombre: 'Otro' }, false, PRODS, DATOS, null);
t('un proveedor sin ventas explica por que el top esta vacio',
  vacio.bloques[1].filas.length === 1 &&
  String(vacio.bloques[1].filas[0][1]).indexOf('No se vendió') === 0);

/* ------------------------------------- que los dos formatos usen lo mismo */
/* Un boton que falla en silencio es peor que uno que falla: el usuario no
   tiene forma de saber si se rompio o si tarda. Fue exactamente lo que paso
   con Exportar. Los dos tienen que atajar tambien el armado del documento,
   no solo el dibujado. */
t('provExportar avisa si no puede preparar el documento',
  /_provDocExportar\(lista, noVend\);\s*\} catch/.test(srcProv) &&
  /No se pudo preparar la exportación/.test(srcProv));
t('compraExportar tambien', /_cpDocExportar\(_cpVerActual\);\s*\} catch/.test(srcComp) &&
  /No se pudo preparar la exportación/.test(srcComp));

t('el PDF y el Excel leen el mismo objeto',
  /function _expPDF\(doc\)/.test(srcExp) && /function _expExcel\(doc\)/.test(srcExp));
t('exportarDoc avisa si la libreria no cargo',
  /_expHayPdf\(\)/.test(srcExp) && /_expHayExcel\(\)/.test(srcExp));

console.log('\n' + ok + ' pasaron, ' + fail + ' fallaron');
process.exit(fail ? 1 : 0);
