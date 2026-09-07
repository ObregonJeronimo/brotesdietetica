/**
 * ETIQUETAS CON CÓDIGO DE BARRAS.
 *
 * Lo que se fracciona en el local no tiene código de fábrica, así que en la caja
 * se busca escribiendo el nombre. Acá el local imprime el suyo.
 *
 * POR QUÉ ESTA PRUEBA ES DISTINTA DE LAS OTRAS
 *
 * Casi todo lo que se rompe en este panel se ve en la pantalla. Un código de
 * barras mal codificado NO se ve: sale un dibujo de barras perfectamente
 * plausible, se imprimen doscientas etiquetas, se pegan en doscientas bolsas, y
 * el error aparece recién cuando la pistola no engancha ninguna. Por eso acá se
 * verifica el patrón de módulos bit por bit contra vectores publicados, y no que
 * "dibuje algo".
 *
 * El patrón de los 13 dígitos se comparó además, durante el desarrollo, contra
 * JsBarcode -una librería usada por medio mundo- en el navegador: 18 códigos,
 * incluidos los diez patrones de paridad, idénticos módulo por módulo. Esa
 * comparación no queda acá porque exige red y un navegador; los vectores de abajo
 * son la parte que corre siempre.
 */
const fs = require('fs');
const path = require('path');
const RAIZ = path.join(__dirname, '..');

const src = fs.readFileSync(path.join(RAIZ, 'admin-etiquetas.js'), 'utf8');
/* Se corta el bloque de window.*: no hay window en Node y no aporta nada. */
const soloFunciones = src.slice(0, src.indexOf("if (typeof window !== 'undefined')"));
const M = new Function(soloFunciones + `;return {
  verif: etiquetaDigitoVerificador, codigoDe: etiquetaCodigoDe,
  productoDe: etiquetaProductoDe, modulos: etiquetaModulos,
  svg: etiquetaBarrasSVG, html: etiquetaHTML, doc: etiquetaDocumento,
  estilos: etiquetaEstilos, resumen: etiquetaResumen, formato: etiquetaFormato,
  medidas: etiquetaMedidas, sinCodigo: etiquetaSinCodigo, ambiguos: etiquetaAmbiguos,
  FORMATOS: ETQ_FORMATOS };`)();

const mod0 = fs.readFileSync(path.join(RAIZ, 'admin-etiquetas.js'), 'utf8');
let ok = 0, fail = 0;
const t = (d, c) => { if (c) { ok++; console.log('  OK   ' + d); } else { fail++; console.log('  FALLA ' + d); } };

/* ==================================================== EL DÍGITO VERIFICADOR
   Sin esto el código es basura para cualquier lector: es lo primero que valida. */
console.log('\n-- el digito verificador --');
/* Vectores publicados. El tercero es un ISBN-13 real. */
[['590123412345', '7'], ['400638133393', '1'], ['978020137962', '4'],
 ['012345678901', '2'], ['978030640615', '7']].forEach(([b, esp]) => {
  t('verificador de ' + b + ' es ' + esp, M.verif(b) === esp);
});
t('un largo distinto de 12 no devuelve nada', M.verif('123') === null);
t('con letras tampoco', M.verif('12345678901a') === null);

/* ============================================================== EL CÓDIGO */
console.log('\n-- el codigo de cada producto --');
const ean = M.codigoDe({ codigo: '000453' });
t('un producto con codigo da 13 digitos', /^\d{13}$/.test(ean));
t('empieza con 2, que es el prefijo reservado para uso interno', ean[0] === '2');
t('y su propio verificador cierra', M.verif(ean.slice(0, 12)) === ean[12]);
t('el mismo producto da siempre el mismo codigo', M.codigoDe({ codigo: '000453' }) === ean);
/* Que sea DERIVADO y no guardado es lo que evita un campo que se desincronice. */
t('000453 y 453 son el mismo producto y dan el mismo codigo',
  M.codigoDe({ codigo: '453' }) === ean);
t('dos productos distintos dan codigos distintos',
  M.codigoDe({ codigo: '000454' }) !== ean);
t('sin codigo de proveedor no hay etiqueta', M.codigoDe({ codigo: '' }) === null);
t('con un codigo que no es numerico tampoco', M.codigoDe({ codigo: 'AB-12' }) === null);
t('null no rompe', M.codigoDe(null) === null);

/* Ninguno de los 613 codigos posibles puede chocar con otro. */
const vistos = new Set();
let choques = 0;
for (let i = 1; i <= 999999; i += 997) {
  const c = M.codigoDe({ codigo: String(i) });
  if (vistos.has(c)) choques++;
  vistos.add(c);
}
t('mil codigos distintos, ninguno repetido', choques === 0);

/* ======================================================= EL CAMINO DE VUELTA
   Es el que usa el lector: de los trece digitos escaneados al producto. */
console.log('\n-- del escaneo al producto --');
const CAT = [
  { id: 'a', codigo: '000453', nombre: 'Tostadas' },
  { id: 'b', codigo: '000047', nombre: 'Aritos' },
  { id: 'c', codigo: '453', nombre: 'Otro con el mismo numero sin ceros' },
];
t('encuentra el producto', (M.productoDe(ean, CAT) || {}).id === 'a');
t('el de otro codigo devuelve otro producto',
  (M.productoDe(M.codigoDe({ codigo: '000047' }), CAT) || {}).id === 'b');
/* Un codigo de fabrica no puede hacerse pasar por uno nuestro. */
t('un codigo de fabrica no matchea', M.productoDe('7791234567890', CAT) === null);
t('uno que empieza con 2 pero con el verificador mal, tampoco',
  M.productoDe(ean.slice(0, 12) + ((Number(ean[12]) + 1) % 10), CAT) === null);
t('algo que no son 13 digitos, tampoco', M.productoDe('123', CAT) === null);
t('vacio no rompe', M.productoDe('', CAT) === null);
t('sin catalogo no rompe', M.productoDe(ean, null) === null);

/* ======================================================== EL DIBUJO
   95 modulos exactos, y el patron contra vectores publicados. */
console.log('\n-- el simbolo --');
const bits = M.modulos('5901234123457');
t('son 95 modulos', bits.length === 95);
t('arranca con la guarda 101', bits.slice(0, 3) === '101');
t('termina con la guarda 101', bits.slice(-3) === '101');
t('tiene la guarda del medio 01010 en su lugar', bits.slice(45, 50) === '01010');
/* El patron completo, publicado, del ejemplo canonico de EAN-13. */
t('el patron entero de 5901234123457 es el correcto',
  bits === '10100010110100111011001100100110111101001110101010110011011011001000010101110010011101000100101');
/* El primer digito no se dibuja: cambia la PARIDAD de los seis siguientes. Es la
   parte que un solo ejemplo no cubre, porque son diez patrones distintos. */
const patrones = new Set();
for (let d = 0; d <= 9; d++) {
  const base = String(d) + '23456789012';
  patrones.add(M.modulos(base + M.verif(base)));
}
t('los diez primeros digitos dan diez simbolos distintos', patrones.size === 10);
t('un codigo invalido no dibuja nada', M.modulos('123') === null);

const svg = M.svg(ean, 15, 48);
t('el svg sale', svg.indexOf('<svg') === 0);
t('lleva el ancho en mm que se le pide', svg.indexOf('width="48mm"') > 0);
/* Sin zonas mudas el lector no encuentra donde empieza el simbolo. */
t('reserva las zonas mudas', svg.indexOf('viewBox="0 0 113 ') === 0 + svg.indexOf('viewBox'));
t('los digitos van escritos abajo, para que un humano pueda leerlos',
  svg.indexOf('>' + ean.slice(1, 7) + '<') > 0 && svg.indexOf('>' + ean.slice(7) + '<') > 0);
/* La proporcion del viewBox tiene que seguir a los mm: con un alto fijo el
   simbolo entraba a 17 mm de ancho y a esa medida no lo lee nadie. */
const svgAncho = M.svg(ean, 10, 48), svgAngosto = M.svg(ean, 10, 34);
const vb = (s) => Number(s.match(/viewBox="0 0 113 ([\d.]+)"/)[1]);
t('el viewBox se estira con la proporcion pedida', vb(svgAncho) !== vb(svgAngosto));
t('y respeta la relacion ancho/alto', Math.abs(vb(svgAncho) - 113 * 10 / 48) < 0.01);

/* ========================================================== LAS MEDIDAS
   La norma permite achicar el simbolo hasta el 80%. Mas chico no lo lee un
   lector barato, que es justo el que va a tener el local. */
console.log('\n-- que el codigo entre y se pueda leer --');
M.FORMATOS.filter(f => f.id !== 'custom').forEach(f => {
  const m = M.medidas(f);
  const magnif = m.bcAncho / 37.29;
  t(f.nombre.slice(0, 34) + ': ' + (magnif * 100).toFixed(0) + '% de magnificacion',
    magnif >= 0.80 && magnif <= 2.0);
  t('   y el codigo entra en la etiqueta', m.bcAncho <= f.ancho && m.bcAlto < f.alto);
});
/* QUE LA PLANCHA ENTRE EN LA HOJA.
   Si filas x alto + margenes pasa de 297 mm, la ultima fila se va a una segunda
   pagina y se desalinea toda la plancha: se pierde una plancha entera de
   autoadhesivo y no se nota hasta que sale impresa. Paso: el formato de 24 por
   hoja estaba con medidas inventadas -70 x 37- que daban 305 mm. */
console.log('\n-- que la plancha entre en el A4 --');
M.FORMATOS.filter(f => f.hoja === 'A4').forEach(f => {
  const w = f.columnas * f.ancho + 2 * f.margenH;
  const h = f.filas * f.alto + 2 * f.margenV;
  t(f.id + ' entra a lo ancho (' + w.toFixed(1) + ' de 210 mm)', w <= 210.5);
  t(f.id + ' entra a lo alto (' + h.toFixed(1) + ' de 297 mm)', h <= 297.5);
});
/* Y que la cuenta de etiquetas por hoja sea la que dice el nombre. */
t('24 por hoja son 24', M.formato('a4-3x8').columnas * M.formato('a4-3x8').filas === 24);
t('14 por hoja son 14', M.formato('a4-2x7').columnas * M.formato('a4-2x7').filas === 14);
t('40 por hoja son 40', M.formato('a4-4x10').columnas * M.formato('a4-4x10').filas === 40);
t('65 por hoja son 65', M.formato('a4-5x13').columnas * M.formato('a4-5x13').filas === 65);

/* CUANTO MARGEN TIENE CADA FORMATO.
   Se rasterizo cada formato a 203, 300 y 600 DPI y se decodificaron los pixeles
   con un lector de largos de barra, que es como decodifica una pistola: leen los
   siete, 30/30, en las tres resoluciones. (Un primer intento con un decodificador
   que muestreaba sobre grilla fija dio fallas alternadas; eran del decodificador,
   que se corria medio pixel, no del simbolo.)
   Lo que queda como criterio es el de la norma: el modulo nominal es 0,33 mm y se
   puede achicar hasta el 80%. `justo` marca los que van por debajo del nominal. */
const magnif = (f) => M.medidas(f).bcAncho / 37.29;
M.FORMATOS.filter(f => f.id !== 'custom').forEach(f => {
  t(f.id + ' esta dentro de norma (' + Math.round(magnif(f) * 100) + '%)',
    magnif(f) >= 0.80 && magnif(f) <= 2.0);
});
const justos = M.FORMATOS.filter(f => f.id !== 'custom' && M.medidas(f).justo).map(f => f.id);
t('los dos mas chicos quedan marcados como justos',
  justos.length === 2 && justos.indexOf('a4-5x13') >= 0 && justos.indexOf('ter-40x30') >= 0);
t('el resto no', M.FORMATOS.filter(f => f.id !== 'custom' && !M.medidas(f).justo).length === 5);
t('ninguno baja del 80% que permite la norma',
  M.FORMATOS.filter(f => f.id !== 'custom').every(f => magnif(f) >= 0.80));
t('el aviso de margen existe y no promete una falla',
  mod0.indexOf('menos ') > 0 && mod0.indexOf('margen deja') > 0 &&
  mod0.indexOf('puede no leerse') < 0);

t('una etiqueta muy angosta queda marcada', M.medidas({ ancho: 25, alto: 20 }).angosta);
t('una normal no', !M.medidas({ ancho: 70, alto: 37 }).angosta);

/* ========================================================== LA ETIQUETA */
console.log('\n-- lo que dice la etiqueta --');
const F = M.formato('a4-3x8');
const P = { id: 'x', codigo: '000432', nombre: 'Semilla De Zapallo', tipoVenta: 'peso',
            precio: 12400, gramaje: '500 g' };
const h = M.html(P, F, { precio: true, codigoInterno: true });
/* Un codigo de barras no lo lee una persona: sin el nombre, una bolsa que se cae
   atras de la gondola no se puede identificar. */
t('lleva el nombre del producto', h.indexOf('Semilla De Zapallo') > 0);
t('lleva el codigo de barras', h.indexOf('<svg') > 0);
t('lleva el precio', h.indexOf('12.400') > 0);
t('en los de peso aclara que el precio es por kilo', h.indexOf('el kilo') > 0);
t('en los de unidad no lo aclara',
  M.html({ codigo: '1', nombre: 'X', tipoVenta: 'unidad', precio: 100 }, F, { precio: true })
    .indexOf('el kilo') < 0);
t('si se pide, lleva el codigo interno', h.indexOf('000432') > 0);
t('si no se pide el precio, no aparece',
  M.html(P, F, { precio: false }).indexOf('12.400') < 0);
t('usa el nombre para mostrar cuando existe',
  M.html({ codigo: '1', nombre: 'Nombre Interno', nombreMostrado: 'Como Se Ve' }, F, {})
    .indexOf('Como Se Ve') > 0);
t('un producto sin codigo no genera etiqueta', M.html({ nombre: 'X' }, F, {}) === '');
/* Se escapa el HTML: un nombre con < o & no puede romper el documento. */
t('escapa el nombre',
  M.html({ codigo: '1', nombre: '<b>Ojo</b> & cia' }, F, {}).indexOf('&lt;b&gt;') > 0);

/* ============================================================ EL DOCUMENTO */
console.log('\n-- las hojas --');
const pedidos = [{ producto: P, copias: 3 }, { producto: { ...P, codigo: '000047' }, copias: 2 }];
const doc = M.doc(pedidos, F, { precio: true });
t('salen las 5 etiquetas pedidas', (doc.match(/class="etq"/g) || []).length === 5);
t('entran todas en una hoja de 24', (doc.match(/class="etq-pag"/g) || []).length === 1);
const doc2 = M.doc([{ producto: P, copias: 30 }], F, {});
t('30 etiquetas ocupan 2 hojas de 24', (doc2.match(/class="etq-pag"/g) || []).length === 2);
/* En termica no hay hojas: cada etiqueta es una pagina, para que avance el rollo. */
const docT = M.doc([{ producto: P, copias: 3 }], M.formato('ter-58x40'), {});
t('en termica no se arman hojas', docT.indexOf('etq-pag') < 0);
t('pero salen las 3 etiquetas', (docT.match(/class="etq"/g) || []).length === 3);
t('sin pedidos no sale documento', M.doc([], F, {}) === '');
t('copias en 0 igual imprime una', (M.doc([{ producto: P, copias: 0 }], F, {}).match(/class="etq"/g) || []).length === 1);
t('un numero absurdo de copias queda topeado',
  (M.doc([{ producto: P, copias: 99999 }], F, {}).match(/class="etq"/g) || []).length === 500);

const r = M.resumen(pedidos, F);
t('el resumen cuenta 5 etiquetas', r.etiquetas === 5);
t('y una hoja', r.hojas === 1);
t('en termica cuenta una por etiqueta', M.resumen(pedidos, M.formato('ter-58x40')).hojas === 5);

/* ============================================================== LOS ESTILOS */
console.log('\n-- la pagina de impresion --');
const est = M.estilos(F);
t('la hoja se declara A4', est.indexOf('size:A4') > 0);
/* Se deriva del formato, no se escribe a mano: si cambian las medidas de la
   plancha, la prueba sigue valiendo en vez de romperse por el numero. */
t('la grilla usa las columnas y el ancho del formato',
  est.indexOf('repeat(' + F.columnas + ',' + F.ancho + 'mm)') > 0);
const estT = M.estilos(M.formato('ter-58x40'));
t('la termica declara el tamano exacto del rollo', estT.indexOf('size:58mm 40mm') > 0);
t('y sin margenes, que en un rollo no existen', estT.indexOf('margin:0}') > 0);
t('cada etiqueta termica es una pagina', estT.indexOf('page-break-after:always') > 0);
/* El nombre largo no puede empujar al codigo fuera de la etiqueta. */
t('el nombre se corta a dos renglones', est.indexOf('-webkit-line-clamp:2') > 0);
t('y lo que sobra no se ve', est.indexOf('overflow:hidden') > 0);

/* ===================================================== LOS QUE NO PUEDEN */
console.log('\n-- los que se quedan afuera --');
const sin = M.sinCodigo([{ codigo: '000453' }, { codigo: '' }, { nombre: 'sin nada' }]);
t('los que no tienen codigo se pueden listar', sin.length === 2);

/* Dos productos con el mismo codigo derivan la MISMA etiqueta. La migracion de
   FRUTICOR asigno codigos libres y verifico los choques, asi que hoy no pasa; pero
   nada impide cargar a mano un codigo repetido, y el informe de duplicados que
   existe compara NOMBRES, no codigos. Escanear esa etiqueta devolveria cualquiera
   de los dos, y eso en una venta es cobrar el producto equivocado. */
console.log('\n-- codigos repetidos --');
const CAT2 = [
  { id: '1', codigo: '000453', nombre: 'Uno' },
  { id: '2', codigo: '000453', nombre: 'Otro con el mismo codigo' },
  { id: '3', codigo: '000454', nombre: 'Tranquilo' },
  { id: '4', codigo: '453',    nombre: 'El mismo numero sin ceros' },
];
let amb = M.ambiguos([{ producto: CAT2[0], copias: 1 }], CAT2);
t('avisa cuando el codigo esta repetido', amb.length === 1);
t('y dice cuantos lo comparten', amb[0].cuantos === 3);
t('un codigo unico no dispara el aviso',
  M.ambiguos([{ producto: CAT2[2], copias: 1 }], CAT2).length === 0);
t('000453 y 453 cuentan como el mismo codigo',
  M.ambiguos([{ producto: CAT2[3], copias: 1 }], CAT2).length === 1);
t('los que no tienen codigo no cuentan',
  M.ambiguos([{ producto: { id: 'x', codigo: '' }, copias: 1 }],
             [{ id: 'x', codigo: '' }, { id: 'y', codigo: '' }]).length === 0);
t('sin catalogo no rompe', M.ambiguos([{ producto: CAT2[0], copias: 1 }], null).length === 0);
t('sin pedidos no rompe', M.ambiguos(null, CAT2).length === 0);

/* ================================================== QUE ESTE ENCHUFADO
   Ya paso en este proyecto: una funcion renombrada dejo un boton muerto. */
console.log('\n-- el cable --');
const html = fs.readFileSync(path.join(RAIZ, 'admin.html'), 'utf8');
const lector = fs.readFileSync(path.join(RAIZ, 'admin-lector.js'), 'utf8');
t('admin.html carga el modulo', html.indexOf('<script src="admin-etiquetas.js"></script>') > 0);
/* El lector lo usa, asi que tiene que estar cargado antes. */
t('se carga antes que el lector',
  html.indexOf('admin-etiquetas.js') < html.indexOf('admin-lector.js'));
t('hay un boton en Productos', html.indexOf('onclick="openEtiquetasModal()"') > 0);
t('existe el modal', html.indexOf('id="etiquetasModal"') > 0);
t('y el boton de imprimir', html.indexOf('onclick="etiquetasImprimir()"') > 0);
/* Sin esto, escanear una etiqueta propia abre "a que producto corresponde". */
t('el lector reconoce las etiquetas del local',
  /etiquetaProductoDe\(cod, allProducts\)/.test(lector));
/* Se comprueba EJECUTANDO buscarPorCodigo, no buscando un literal: antes esta
   assertion comparaba contra un texto que despues dejo de existir, y como
   indexOf devuelve -1 cuando no encuentra, "-1 < loQueSea" pasaba siempre. Una
   prueba que no puede fallar no prueba nada. */
(function () {
  function cuerpoDe(txt, nombre) {
    const i = txt.indexOf('function ' + nombre + '(');
    if (i < 0) throw new Error('no se encontro ' + nombre + ' en admin-lector.js');
    let b = txt.indexOf('{', i), prof = 0, k;
    for (k = b; k < txt.length; k++) { if (txt[k] === '{') prof++; else if (txt[k] === '}') { prof--; if (!prof) break; } }
    return txt.slice(i, k + 1);
  }
  const buscar = new Function('allProducts', 'etiquetaProductoDe',
    cuerpoDe(lector, '_normCod') + cuerpoDe(lector, 'coincidenciasCodigo') +
    cuerpoDe(lector, 'buscarPorCodigo') + ';return buscarPorCodigo;');
  /* La etiqueta del local de FRACCIONADO codifica el codigo 000123. */
  const etq = M.codigoDe({ codigo: '000123' });
  const CAT = [
    { id: 'F', nombre: 'FRACCIONADO', codigo: '000123', codigoBarras: null },
    { id: 'X', nombre: 'DE FABRICA',  codigo: '000999', codigoBarras: etq }
  ];
  const b = buscar(CAT, M.productoDe);
  t('escanear la etiqueta del local encuentra su producto',
    !!etq && b(etq) !== null);
  t('pero si ESE codigo esta cargado como codigo de fabrica, gana el de fabrica',
    !!etq && b(etq) && b(etq).id === 'X');
  t('y sin etiquetas cargadas, un codigo desconocido sigue sin encontrar nada',
    buscar(CAT, null)('9999999999999') === null);
})();
t('el buscador de la caja tambien las entiende',
  html.indexOf('function _buscarProdVentaConEtiqueta') > 0 &&
  html.indexOf('const res=_buscarProdVentaConEtiqueta(q);') > 0);
/* El campo de codigo de barras del producto es para el codigo del ENVASE. */
t('no deja guardar una etiqueta propia como codigo de fabrica',
  lector.indexOf('es un código impreso por el local') > 0);
const mod = fs.readFileSync(path.join(RAIZ, 'admin-etiquetas.js'), 'utf8');
t('el aviso de codigo repetido se muestra antes de imprimir',
  mod.indexOf('const ambiguos = etiquetaAmbiguos(pedidos') > 0 &&
  mod.indexOf('no va a distinguir cu&aacute;l es cu&aacute;l') > 0);

console.log('\n' + ok + ' pasaron, ' + fail + ' fallaron');
process.exit(fail ? 1 : 0);
