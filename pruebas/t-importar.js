/**
 * LA IMPORTACION DE CATALOGO EN TANDA.
 *
 * Es el camino por el que entra TODO el catalogo del comercio, y hasta ahora leia
 * los numeros con parseInt directo. Eso es el bug historico de los miles, pero
 * multiplicado por mil filas y sin un solo error de consola:
 *     parseInt('20.000')  -> 20        parseInt('1.234.567') -> 1
 *     parseInt('$ 1.500') -> NaN -> 0  parseInt('1.234,56')  -> 1
 * Un catalogo entero entra con los precios divididos por mil y el comercio lo
 * descubre vendiendo.
 *
 * Ademas: los duplicados se buscaban SOLO contra la base y nunca contra el propio
 * archivo, la columna PRECIO no se leia (una lista con precios de venta en vez de
 * costos cargaba todo en $0, y un producto en $0 ni se puede comprar porque la
 * regla de /pedidos exige total > 0), y las dos pantallas de importacion escribian
 * el default de categoria con distinta ortografia, asi que la tienda mostraba dos
 * filtros para la misma cosa.
 *
 * Las funciones salen del admin.html de verdad: si alguien las cambia, esto se
 * entera.
 */
const fs = require('fs');
const src = fs.readFileSync('admin.html', 'utf8');

function cuerpo(nombre) {
  const i = src.indexOf('function ' + nombre + '(');
  if (i < 0) throw new Error('no encontre ' + nombre + ' en admin.html');
  let prof = 0, k;
  for (k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') prof++;
    else if (src[k] === '}') { prof--; if (!prof) break; }
  }
  return src.slice(i, k + 1);
}

const montoExcel = new Function(cuerpo('montoExcel') + '\nreturn montoExcel;')();
const porcentajeExcel = new Function(cuerpo('porcentajeExcel') + '\nreturn porcentajeExcel;')();
const claveProducto = new Function(cuerpo('claveProducto') + '\nreturn claveProducto;')();
const avisosDeImportacion = new Function(cuerpo('avisosDeImportacion') + '\nreturn avisosDeImportacion;')();
const normCodigo = new Function(cuerpo('normCodigo') + '\nreturn normCodigo;')();
/* armarProductosDesdeFilas mira listasData y allProducts, que en el panel son
   globales. Se las inyectamos. */
const armarCon = (allProducts, listasData) => new Function(
  'allProducts', 'listasData', 'claveProducto', 'montoExcel', 'porcentajeExcel', 'normCodigo',
  cuerpo('armarProductosDesdeFilas') + '\nreturn armarProductosDesdeFilas;'
)(allProducts, listasData, claveProducto, montoExcel, porcentajeExcel, normCodigo);

let ok = 0, fail = 0;
const t = (d, c, extra) => {
  if (c) { ok++; console.log('  OK   ' + d); }
  else { fail++; console.log('  FALLA ' + d + (extra !== undefined ? '   [' + extra + ']' : '')); }
};

console.log('\nImportes como los escribe un proveedor argentino');
t('"20.000" son veinte mil, no veinte', montoExcel('20.000') === 20000, montoExcel('20.000'));
t('"1.234.567" entero', montoExcel('1.234.567') === 1234567, montoExcel('1.234.567'));
t('"$ 1.500" con simbolo y espacio', montoExcel('$ 1.500') === 1500, montoExcel('$ 1.500'));
t('"ARS 3.450"', montoExcel('ARS 3.450') === 3450, montoExcel('ARS 3.450'));
t('"1.234,56" redondea a 1235', montoExcel('1.234,56') === 1235, montoExcel('1.234,56'));
t('"12,75" es doce con setenta y cinco', montoExcel('12,75') === 13, montoExcel('12,75'));

console.log('\nCeldas numericas de Excel (no son texto)');
t('el numero 20000 queda igual', montoExcel(20000) === 20000, montoExcel(20000));
t('el numero 1234.56 redondea (montoAR daria 123456)', montoExcel(1234.56) === 1235, montoExcel(1234.56));
t('cero es cero', montoExcel(0) === 0, montoExcel(0));

console.log('\nCeldas que no son un numero');
t('vacio', montoExcel('') === 0, montoExcel(''));
t('null', montoExcel(null) === 0, montoExcel(null));
t('undefined', montoExcel(undefined) === 0, montoExcel(undefined));
t('texto suelto', montoExcel('a consultar') === 0, montoExcel('a consultar'));

console.log('\nPorcentajes: el decimal con coma no se pierde');
t('"35,5" es 35.5 (parseFloat daba 35)', porcentajeExcel('35,5') === 35.5, porcentajeExcel('35,5'));
t('"35.5" tambien', porcentajeExcel('35.5') === 35.5, porcentajeExcel('35.5'));
t('"35%" con el simbolo', porcentajeExcel('35%') === 35, porcentajeExcel('35%'));
t('el numero 40', porcentajeExcel(40) === 40, porcentajeExcel(40));
t('vacio es 0', porcentajeExcel('') === 0, porcentajeExcel(''));

console.log('\nEl mismo producto escrito distinto es el mismo producto');
t('acentos y espacios de mas', claveProducto('Semillas  Chía') === claveProducto('semillas chia'));
t('no junta cosas distintas', claveProducto('Almendras') !== claveProducto('Almendra'));

/* ---------- el armado completo de un archivo real ---------- */
const filas = [
  { NOMBRE: 'Almendras', CATEGORIA: 'Frutos secos', COSTO: '20.000', PORCENTAJE: '35,5', STOCK: '1.500' },
  { NOMBRE: 'Miel pura', CATEGORIA: 'Almacen', PRECIO: '12.000', STOCK: 5 },
  { NOMBRE: 'semillas  chia', CATEGORIA: 'Semillas', COSTO: '1.000', PORCENTAJE: 30 },
  { NOMBRE: 'Almendras', CATEGORIA: 'Frutos secos', COSTO: '20.000', PORCENTAJE: '35,5' },
  { NOMBRE: 'Sin precio', CATEGORIA: 'Almacen' },
  { NOMBRE: 'Sin categoria' },
  { NOMBRE: 'Con lista propia', CATEGORIA: 'Almacen', PRECIO: '5.000', LISTA: 'fruticor' },
  { NOMBRE: '' }
];
const r = armarCon([{ nombre: 'Semillas Chía' }], [{ id: 'lst-1', nombre: 'FRUTICOR' }])(filas, 'lst-lote');
const porNombre = (n) => r.prods.find(p => p.nombre === n);

console.log('\nUn archivo de proveedor de punta a punta');
/* 8 filas: una sin nombre, una ya en la base y una repetida del archivo se caen. */
t('de 8 filas entran 5 productos', r.prods.length === 5, r.prods.length);
t('la fila sin NOMBRE se saltea', !r.prods.some(p => !p.nombre));
t('"semillas chia" ya estaba en la base: no se duplica', r.duplicados === 1, r.duplicados);
t('"Almendras" repetida en el archivo entra UNA vez', r.prods.filter(p => p.nombre === 'Almendras').length === 1);
t('y queda contada aparte', r.repetidosArchivo === 1, r.repetidosArchivo);

console.log('\nLos precios que quedan guardados');
t('costo 20.000 -> 20000', porNombre('Almendras').costo === 20000, porNombre('Almendras').costo);
t('precio = 20000 x 1.355 = 27100', porNombre('Almendras').precio === 27100, porNombre('Almendras').precio);
t('stock "1.500" -> 1500', porNombre('Almendras').stock === 1500, porNombre('Almendras').stock);
t('sin COSTO se usa PRECIO (antes quedaba en $0)', porNombre('Miel pura').precio === 12000, porNombre('Miel pura').precio);

console.log('\nCategoria y lista');
t('sin CATEGORIA queda "Sin categoría" (con acento, igual que la otra pantalla)', porNombre('Sin categoria').categoria === 'Sin categoría', porNombre('Sin categoria').categoria);
t('se cuenta para avisarlo antes de escribir', r.sinCategoria === 1, r.sinCategoria);
t('la lista del lote se estampa en todos', porNombre('Almendras').lista === 'lst-lote', porNombre('Almendras').lista);
t('una columna LISTA pisa a la del lote', porNombre('Con lista propia').lista === 'lst-1', porNombre('Con lista propia').lista);

/* ---------- codigo de producto y tipo de venta ---------- */
/* Desde que existe la venta por peso, el codigo es obligatorio y unico
   (validarCodigoProducto en admin.html). Si la importacion no lo asigna, un
   catalogo de 800 filas entra sin codigo y el formulario lo pide de a uno. */
console.log('\nEl codigo de producto: obligatorio y unico');
const filasCod = [
  { NOMBRE: 'Uno', CATEGORIA: 'A', PRECIO: 100 },
  { NOMBRE: 'Dos', CATEGORIA: 'A', PRECIO: 100 },
  { NOMBRE: 'Tres', CATEGORIA: 'A', PRECIO: 100, CODIGO: 'yerba-1kg' },
  { NOMBRE: 'Cuatro', CATEGORIA: 'A', PRECIO: 100, CODIGO: 'P-0001' },
  { NOMBRE: 'Cinco', CATEGORIA: 'A', PRECIO: 100, CODIGO: 'yerba 1kg' },
  { NOMBRE: 'Seis', CATEGORIA: 'A', PRECIO: 100, CODIGO: 'con espacio y $imbolo!' }
];
const rc = armarCon([{ nombre: 'Existente', codigo: 'P-0001' }], [])(filasCod, '');
const cod = (n) => (rc.prods.find(p => p.nombre === n) || {}).codigo;
t('todos los productos salen con codigo', rc.prods.every(p => !!p.codigo), rc.prods.map(p => p.codigo).join(','));
t('los codigos del lote no se repiten', new Set(rc.prods.map(p => p.codigo)).size === rc.prods.length, rc.prods.map(p => p.codigo).join(','));
t('ninguno pisa un codigo que ya esta en la base', !rc.prods.some(p => p.codigo === 'P-0001'), cod('Cuatro'));
t('el formato generado es el que sugiere el panel', /^P-\d{4}$/.test(cod('Uno')), cod('Uno'));
t('un CODIGO del archivo se respeta, normalizado', cod('Tres') === 'YERBA-1KG', cod('Tres'));
t('un CODIGO repetido en el archivo se reemplaza', cod('Cinco') !== 'YERBA-1KG' && /^P-\d{4}$/.test(cod('Cinco')), cod('Cinco'));
t('un CODIGO con caracteres invalidos se reemplaza', /^P-\d{4}$/.test(cod('Seis')), cod('Seis'));
t('se cuentan los reemplazados para avisarlos', rc.codigosCorregidos === 3, rc.codigosCorregidos);
t('avisa de los codigos reemplazados', avisosDeImportacion(rc).some(a => /CODIGO inválido o ya usado/.test(a)));
t('pero un archivo SIN columna CODIGO no interrumpe',
  avisosDeImportacion(armarCon([], [])([{ NOMBRE: 'Sal', CATEGORIA: 'A', PRECIO: 100 }], '')).length === 0);

console.log('\nTipo de venta: por unidad o a granel');
const filasVenta = [
  { NOMBRE: 'Fideos', CATEGORIA: 'A', PRECIO: 100 },
  { NOMBRE: 'Nueces', CATEGORIA: 'A', PRECIO: 18000, TIPOVENTA: 'peso' },
  { NOMBRE: 'Avena', CATEGORIA: 'A', PRECIO: 4000, TIPOVENTA: 'KG' },
  { NOMBRE: 'Granola', CATEGORIA: 'A', PRECIO: 5000, TIPOVENTA: 'granel' },
  { NOMBRE: 'Yerba', CATEGORIA: 'A', PRECIO: 9000, TIPOVENTA: 'unidad' }
];
const rv = armarCon([], [])(filasVenta, '');
const tv = (n) => (rv.prods.find(p => p.nombre === n) || {}).tipoVenta;
/* Se escribe SIEMPRE y no se deja ausente: con 'peso' el precio es por kilo y la
   cantidad va en gramos (subtotalCarrito divide por 1000). Un producto a granel
   importado como 'unidad' se cobraria mil veces de menos. */
t('sin columna queda por unidad', tv('Fideos') === 'unidad', tv('Fideos'));
t('"peso" es a granel', tv('Nueces') === 'peso', tv('Nueces'));
t('"KG" tambien, sin importar mayusculas', tv('Avena') === 'peso', tv('Avena'));
t('"granel" tambien', tv('Granola') === 'peso', tv('Granola'));
t('"unidad" es por unidad', tv('Yerba') === 'unidad', tv('Yerba'));
t('el campo nunca queda ausente', rv.prods.every(p => p.tipoVenta === 'peso' || p.tipoVenta === 'unidad'));

console.log('\nEl aviso previo a escribir');
t('cuenta los que quedarian en $0', r.sinPrecio === 2, r.sinPrecio);
const avisos = avisosDeImportacion(r);
t('avisa por los repetidos del archivo', avisos.some(a => /repetidas dentro del mismo archivo/.test(a)));
t('avisa por los que no tienen categoria', avisos.some(a => /sin CATEGORIA/.test(a)));
t('avisa que los de $0 no se pueden comprar', avisos.some(a => /\$0 y NO se pueden comprar/.test(a)));
t('un archivo sano no interrumpe', avisosDeImportacion(armarCon([], [])([{ NOMBRE: 'Sal', CATEGORIA: 'Almacen', PRECIO: '1.000' }], '')).length === 0);

console.log('\n' + ok + ' pasaron, ' + fail + ' fallaron');
process.exit(fail ? 1 : 0);
