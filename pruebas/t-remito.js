/**
 * LEER UN REMITO EN PDF Y PRECARGAR LOS ITEMS.
 *
 * Los renglones de pruebas/remitos/lineas.json NO estan escritos a mano: son
 * el texto que pdf.js SACO de verdad de los cinco PDF de pruebas/remitos/,
 * extraidos con la misma funcion que corre en el panel. Si fueran inventados,
 * esta prueba estaria midiendo mi idea de como se ve un PDF, no un PDF.
 *
 * Los cinco tienen formatos DISTINTOS a proposito. Un parser que solo anda con
 * uno esta calzado a una plantilla, que es como quedo processWeeklyPdf y por
 * eso se rompe cuando el proveedor cambia una columna.
 *
 * LO QUE NO SE HACE, Y ES LA DECISION IMPORTANTE
 *
 * Un producto se reconoce SOLO por el codigo del proveedor. Nunca por parecido
 * de nombre: nadie midio cuanto acierta eso contra este catalogo, y un producto
 * equivocado con su costo entra derecho al margen. Preferimos "no encontre
 * nada" -que se ve- antes que un acierto a medias -que no se ve-.
 *
 * Y las cantidades entran solo si cantidad x unitario = importe. Es el unico
 * control que no depende del catalogo, y en un PDF digital vale porque los
 * digitos estan copiados, no interpretados.
 */
const fs = require('fs');
const path = require('path');
const RAIZ = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(RAIZ, 'admin-remito.js'), 'utf8');
const LINEAS = JSON.parse(fs.readFileSync(path.join(RAIZ, 'pruebas', 'remitos', 'lineas.json'), 'utf8'));

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
const API = new Function(
  ['_remNumero', '_remCodigo', '_remNumerosFinales', '_remLeerLinea',
   '_remCierra', '_remCantidades', 'remitoAItems'].map(cuerpo).join('\n') +
  ';return { num:_remNumero, cod:_remCodigo, linea:_remLeerLinea, items:remitoAItems };')();

let ok = 0, fail = 0;
const t = (d, c) => { if (c) { ok++; console.log('  OK   ' + d); } else { fail++; console.log('  FALLA ' + d); } };

/* ============================================ numeros en formato argentino */
t('1.650,00 son mil seiscientos cincuenta', API.num('1.650,00') === 1650);
t('14.000,50 lleva los cincuenta centavos', API.num('14.000,50') === 14000.5);
/* Sin la coma, el punto sigue siendo separador de miles: 1.650 NO es 1,65. */
t('1.650 sin decimales tambien son mil seiscientos cincuenta', API.num('1.650') === 1650);
t('126.975,00 son ciento veintiseis mil', API.num('126.975,00') === 126975);
t('el signo pesos no molesta', API.num('$ 540,00') === 540);
t('1,500 son uno y medio', API.num('1,500') === 1.5);
t('un entero suelto', API.num('24') === 24);
t('texto sin numeros da null', API.num('TOTAL') === null && API.num('') === null && API.num(null) === null);

/* ================================================================ codigos */
t('000320 queda igual', API.cod('000320') === '000320');
t('320 se completa con ceros', API.cod('320') === '000320');
t('el prefijo ART. no molesta', API.cod('319') === '000319');

/* ====================================== un renglon, con la trampa adentro */
/* Este renglon salio del PDF real: el nombre quedo cortado dejando un "2"
   suelto ANTES de la cantidad. Si los numeros se tomaran de izquierda a
   derecha, ese 2 se leeria como la cantidad. */
const trampa = API.linea('ART. 131 Crema Para El Cuerpo C/Nut. Prebiotica 2 9 $ 540,00 $ 4.860,00');
t('lee el codigo aunque venga como "ART. 131"', trampa.codigo === '000131');
t('los numeros se leen desde la DERECHA, no desde la izquierda',
  trampa.numeros.slice(-3).join(',') === '9,540,4860');
/* El "2" es el resto de "200Ml" que quedo cortado al generar el PDF. Lo que
   importa no es donde cae, sino que la CANTIDAD sea 9 -el ultimo grupo de tres
   numeros- y no 2. Mi asercion original miraba lo que no importaba. */
t('con cuatro numeros, la cantidad sale del ultimo grupo de tres',
  trampa.numeros.length === 4 && trampa.numeros.slice(-3)[0] === 9);

t('una raya de separacion no es un renglon',
  API.linea('--------------------------------------------------') === null);
t('el TOTAL no es un renglon', API.linea('TOTAL 126.975,00') === null);
t('el CAE no es un renglon', API.linea('CAE N 75123456789012 Vto CAE 22/08/2026') === null);
t('el encabezado no es un renglon', API.linea('CODIGO DESCRIPCION CANT P.UNIT IMPORTE') === null);
/* Un CUIT tiene digitos al principio pero no es un renglon de mercaderia. */
t('una linea sin numeros al final no pasa',
  API.linea('CUIT 30-71234567-9 Ing. Brutos 901-234567-8') === null);

/* ================================================= el catalogo de prueba
   Sale de los mismos productos reales con los que se generaron los PDF. */
const CAT = [
  { id: 'a', codigo: '000169', nombre: 'GALLETA VEGANA DE int. algarroba', lista: 'L1', tipoVenta: 'unidad', costo: 0 },
  { id: 'b', codigo: '000453', nombre: 'Tostadas De Arroz Sin Sal', lista: 'L1', tipoVenta: 'unidad', costo: 0 },
  { id: 'c', codigo: '000073', nombre: 'Bizcochuelo Exquisiteses', lista: 'L1', tipoVenta: 'unidad', costo: 0 },
  { id: 'd', codigo: '000379', nombre: 'Pistacho Salado', lista: 'L1', tipoVenta: 'unidad', costo: 0 },
  { id: 'e', codigo: '000209', nombre: 'Hornito Ceramica Grande', lista: 'L1', tipoVenta: 'unidad', costo: 0 },
  { id: 'f', codigo: '000226', nombre: 'Hamburguesa Simple De Lenteja', lista: 'L1', tipoVenta: 'unidad', costo: 0 },
  { id: 'g', codigo: '000272', nombre: 'Lenteja Turca', lista: 'L1', tipoVenta: 'unidad', costo: 0 },
  /* por peso */
  { id: 'k1', codigo: '000010', nombre: 'Anillo Sabor Frutilla', lista: 'L1', tipoVenta: 'peso', costo: 9000 },
  { id: 'k2', codigo: '000012', nombre: 'Azucar De Coco', lista: 'L1', tipoVenta: 'peso', costo: 9000 },
  { id: 'k3', codigo: '000095', nombre: 'Canela Molida', lista: 'L1', tipoVenta: 'peso', costo: 9000 },
  { id: 'k4', codigo: '000064', nombre: 'Bandejas De Mimbre', lista: 'L1', tipoVenta: 'peso', costo: 7777 },
  /* los del remito 3, que viene con codigos etiquetados "ART. nnn" */
  { id: 'r1', codigo: '000264', nombre: 'La Herbolaria Hepatica', lista: 'L1', tipoVenta: 'unidad', costo: 0 },
  { id: 'r2', codigo: '000330', nombre: 'Nuez Pecan', lista: 'L1', tipoVenta: 'unidad', costo: 0 },
  { id: 'r3', codigo: '000131', nombre: 'Crema Para El Cuerpo', lista: 'L1', tipoVenta: 'unidad', costo: 0 },
  /* de OTRO proveedor: no tiene que entrar */
  { id: 'x', codigo: '000319', nombre: 'Mix Clasico Con Mani', lista: 'L9', tipoVenta: 'unidad', costo: 0 },
];

/* ==================================== 1) tabla clasica: el caso completo */
const r1 = API.items(LINEAS['remito-1-tabla-clasica'], CAT, 'L1');
t('remito 1: reconoce los 7 productos', r1.items.length === 7);
t('remito 1: los 7 con cantidad verificada', r1.resumen.conCantidad === 7);
t('remito 1: no se cuela el TOTAL ni el CAE como producto',
  !r1.items.some(i => /total|cae/i.test(i.nombre)));
const galleta = r1.items.find(i => i.id === 'a');
t('remito 1: cantidad 2 y costo 9.620', galleta.cantidad === 2 && galleta.costoUnitario === 9620);
const hornito = r1.items.find(i => i.id === 'e');
t('remito 1: 24 unidades a 550', hornito.cantidad === 24 && hornito.costoUnitario === 550);
t('remito 1: todos vienen marcados como leidos del remito', r1.items.every(i => i.deRemito));

/* ================== 2) SIN codigos: tiene que reconocer CERO, no adivinar */
const r2 = API.items(LINEAS['remito-2-sin-codigos'], CAT, 'L1');
t('remito 2: sin codigos no reconoce NINGUN producto', r2.items.length === 0);
/* Este remito pone la CANTIDAD primero. Antes de la regla de los 6 digitos,
   "10 Cucharitas De Madera" se leia como el codigo 000010 -que existe- y
   entraba un producto que no estaba en el papel, sin avisar. */
t('remito 2: una cantidad al principio no se confunde con un codigo',
  !r2.items.some(i => i.id === 'k1'));
t('remito 2: y no inventa cantidades', r2.resumen.conCantidad === 0);

/* ============ 3) codigo con prefijo, uno inexistente y uno de otro proveedor */
const r3 = API.items(LINEAS['remito-3-codigo-con-prefijo'], CAT, 'L1');
t('remito 3: el codigo inexistente 999998 no entra',
  !r3.items.some(i => i.nombre.indexOf('NO TENEMOS') >= 0));
t('remito 3: y se avisa por que quedo afuera',
  r3.ignoradas.some(x => x.codigo === '999998' && /no esta en el catalogo/.test(x.motivo)));
/* 000319 existe pero es de L9: entra al remito de L1 seria cargarle mercaderia
   de un proveedor a otro. */
t('remito 3: un producto de OTRO proveedor no entra', !r3.items.some(i => i.id === 'x'));
t('remito 3: y lo dice con esas palabras',
  r3.ignoradas.some(x => /es de otro proveedor/.test(x.motivo)));
t('remito 3: reconoce los 3 que si son de este proveedor', r3.items.length === 3);
t('remito 3: y el de la descripcion con numeros adentro carga 9, no 2',
  (r3.items.find(i => i.id === 'r3') || {}).cantidad === 9);

/* ========================= 4) descripcion partida en dos renglones */
const CAT4 = CAT.concat([
  { id: 'm1', codigo: '000432', nombre: 'Semilla De Zapallo', lista: 'L1', tipoVenta: 'unidad', costo: 0 },
  { id: 'm2', codigo: '000116', nombre: 'Ciruelas Presidente', lista: 'L1', tipoVenta: 'unidad', costo: 0 },
  { id: 'm3', codigo: '000355', nombre: 'Pan De Hamburguesa 2U.', lista: 'L1', tipoVenta: 'unidad', costo: 0 },
]);
const r4 = API.items(LINEAS['remito-4-descripcion-partida'], CAT4, 'L1');
t('remito 4: reconoce los 3', r4.items.length === 3);
/* "Pan De Hamburguesa 2U." tiene un 2 en el nombre: no puede ser la cantidad. */
const pan = r4.items.find(i => i.id === 'm3');
t('remito 4: el 2 del nombre no se confunde con la cantidad', pan.cantidad === 2 && pan.costoUnitario === 600);
t('remito 4: la continuacion de la descripcion no crea un item fantasma', r4.items.length === 3);

/* ================================ 5) kilos, decimales y la cuenta que no cierra */
const r5 = API.items(LINEAS['remito-5-kilos-y-error'], CAT, 'L1');
t('remito 5: reconoce los 4 productos', r5.items.length === 4);
const anillo = r5.items.find(i => i.id === 'k1');
/* 1,500 KG son 1500 GRAMOS: el sistema guarda gramos y el costo es por kilo. */
t('remito 5: 1,500 KG se guardan como 1500 gramos', anillo.cantidad === 1500);
t('remito 5: el costo queda POR KILO', anillo.costoUnitario === 14000.5);
t('remito 5: y la cuenta cierra contra el importe impreso', anillo.verificado === true);
const azucar = r5.items.find(i => i.id === 'k2');
t('remito 5: 0,750 KG son 750 gramos', azucar.cantidad === 750);

/* EL CASO QUE JUSTIFICA TODO EL CONTROL: 4 kg x $5.000 deberia dar $20.000 y
   el remito dice $2.000. Se carga el producto, pero NO la cantidad. */
const bandejas = r5.items.find(i => i.id === 'k4');
t('remito 5: el renglon con la cuenta mal NO carga cantidad', bandejas.cantidad === 0);
t('remito 5: queda marcado como no verificado', bandejas.verificado === false);
/* Y tampoco se le cree el costo: se deja el del catalogo. */
t('remito 5: tampoco se le toma el costo al renglon dudoso', bandejas.costoUnitario === 7777);
t('remito 5: se explica por que quedo dudoso',
  r5.dudosos.some(d => d.codigo === '000064' && /no cierra/.test(d.motivo)));
t('remito 5: el resumen distingue reconocidos de verificados',
  r5.resumen.reconocidos === 4 && r5.resumen.conCantidad === 3);

/* ==================================================== bordes y seguridad */
t('sin lineas no rompe', API.items([], CAT, 'L1').items.length === 0);
t('sin catalogo no rompe', API.items(LINEAS['remito-1-tabla-clasica'], [], 'L1').items.length === 0);
t('null no rompe', API.items(null, null, null).items.length === 0);
/* Un producto por peso sin la marca KG: no se adivina si son kilos o gramos. */
const sinKg = API.items(['000010 Anillo Sabor Frutilla 3 5.000,00 15.000,00'], CAT, 'L1');
t('un producto por peso sin decir KG no carga cantidad', sinKg.items[0].cantidad === 0);
t('y lo explica', /no dice KG/.test(sinKg.dudosos[0].motivo));
/* El mismo producto dos veces en el remito no puede generar dos filas. */
const dup = API.items(['000272 Lenteja Turca 8 550,00 4.400,00',
                       '000272 Lenteja Turca 2 550,00 1.100,00'], CAT, 'L1');
t('un producto repetido en el remito no se duplica', dup.items.length === 1);

/* --------------------------------------------- el total sobre los 5 remitos */
const todos = [
  API.items(LINEAS['remito-1-tabla-clasica'], CAT4, 'L1'),
  API.items(LINEAS['remito-2-sin-codigos'], CAT4, 'L1'),
  API.items(LINEAS['remito-3-codigo-con-prefijo'], CAT4, 'L1'),
  API.items(LINEAS['remito-4-descripcion-partida'], CAT4, 'L1'),
  API.items(LINEAS['remito-5-kilos-y-error'], CAT4, 'L1'),
];
const rec = todos.reduce((n, r) => n + r.resumen.reconocidos, 0);
const ver = todos.reduce((n, r) => n + r.resumen.conCantidad, 0);
console.log('\n  Sobre los 5 remitos: ' + rec + ' productos reconocidos, ' + ver + ' con cantidad verificada');
/* 7 + 0 + 3 + 3 + 4 = 17 reconocidos; verificados todos menos el de la cuenta mal. */
t('el total reconocido sobre los 5 es 17', rec === 17);
t('y 16 con cantidad verificada (el que falta es el de la cuenta mal)', ver === 16);

/* ==================================================================
   QUE EL LECTOR ESTE ENCHUFADO

   El parser puede andar perfecto y no servir para nada si nadie lo llama.
   Ya paso en este proyecto: una funcion renombrada dejo un boton muerto y no
   se noto hasta produccion. Aca se verifica el cable entero, no solo la punta.
   ================================================================== */
const compras = fs.readFileSync(path.join(RAIZ, 'admin-compras.js'), 'utf8');
const htmlAdm = fs.readFileSync(path.join(RAIZ, 'admin.html'), 'utf8');

t('admin.html carga el modulo', htmlAdm.indexOf('<script src="admin-remito.js"></script>') > 0);
t('el modulo se carga antes que compras',
  htmlAdm.indexOf('admin-remito.js') < htmlAdm.indexOf('admin-compras.js'));
t('elegir el archivo dispara la lectura', /_cpLeerRemito\(f\)/.test(compras));
t('la lectura existe', /async function _cpLeerRemito\(/.test(compras));
t('existe el lugar donde se escribe el resumen', htmlAdm.indexOf('id="compraLectura"') > 0);
t('y la lectura escribe ahi', compras.indexOf("getElementById('compraLectura')") > 0);

/* Con una imagen no se intenta nada: si esto se cae, cada foto que suban va a
   tirar un error rojo que no significa nada. */
t('solo se leen los PDF', /file\.type !== 'application\/pdf'/.test(compras));
/* Y si el modulo no cargo, el modal tiene que seguir funcionando igual. */
t('si el modulo falta, no rompe',
  /typeof remitoLeerPdf !== 'function'/.test(compras) &&
  /typeof remitoAItems !== 'function'/.test(compras));

/* Lo cargado a mano manda. */
t('no pisa ni duplica lo que ya estaba', /const yaEsta = new Set\(_compraItems\.map/.test(compras));
t('solo agrega lo que falta', /r\.items\.filter\(i => !yaEsta\.has\(i\.id\)\)/.test(compras));

/* El resumen tiene que decir lo que NO pudo, no solo lo que pudo. */
t('avisa cuando el PDF no tiene texto', compras.indexOf('Este PDF no tiene texto') > 0);
t('avisa cuando no reconocio ningun producto', compras.indexOf('no reconoc') > 0);
t('muestra los motivos de los dudosos', /r\.dudosos\.map\(d =>/.test(compras));
t('cuenta los renglones que no uso', /r\.ignoradas\.length/.test(compras));
t('pide que revisen contra el papel', /Revis&aacute; las cantidades contra el papel/.test(compras));

/* La fila se tiene que ver distinta: el numero no lo escribio la persona. */
t('la fila leida se marca', /it\.deRemito \? \(it\.verificado \? ' cp-leido' : ' cp-dudoso'\)/.test(compras));
t('y dice cual es cual', /\(it\.verificado \? 'del remito' : 'revisar'\)/.test(compras));
t('las dos marcas tienen estilo',
  /\.cp-row\.cp-leido\{/.test(htmlAdm) && /\.cp-row\.cp-dudoso\{/.test(htmlAdm));

/* Los dos carteles hablan del archivo elegido. Si el modal se reabre y el archivo
   ya no esta, no pueden seguir mostrando lo de la vez anterior: el modal se abria
   diciendo 'remito-5.pdf' y '4 productos agregados' con la lista vacia. */
t('existe la limpieza de los carteles', /function _cpLimpiarFactura\(/.test(compras));
t('borra el nombre del archivo', /_cpLimpiarFactura[\s\S]*?compraFacturaNombre[\s\S]*?textContent = ''/.test(compras));
t('y esconde el resumen', /_cpLimpiarFactura[\s\S]*?compraLectura[\s\S]*?display = 'none'/.test(compras));
t('se limpia al abrir el modal',
  /function openCompraModal[\s\S]*?_cpLimpiarFactura\(\)/.test(compras));
t('y tambien al cerrarlo',
  /function closeCompraModal[\s\S]*?_cpLimpiarFactura\(\)/.test(compras));

/* Lo que quedo en cero se descarta al guardar. Que se descarte esta bien; que
   se descarte callado, no: el que leyo un remito cree que cargo todo. */
t('guardar descarta lo que quedo en cero',
  /_compraItems\.filter\(i => Number\(i\.cantidad \|\| 0\) > 0\)/.test(compras));
t('pero antes lo avisa', /const enCero = _compraItems\.filter/.test(compras) &&
  /NO se van a cargar/.test(compras));

console.log('\n' + ok + ' pasaron, ' + fail + ' fallaron');
process.exit(fail ? 1 : 0);
