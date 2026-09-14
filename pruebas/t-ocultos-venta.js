/**
 * LOS OCULTOS NO SALEN EN EL BUSCADOR DE LA VENTA.
 *
 * Pedido del comercio (14/09): ocultar un producto lo tiene que sacar también de
 * la venta, minorista y mayorista. Antes salía con la etiqueta OCULTO.
 *
 * LO QUE ESTA PRUEBA CUIDA
 *
 * 1. Que el buscador no lo muestre, tampoco tipeando el código de una etiqueta.
 * 2. Que un producto parecido que NO está oculto siga saliendo.
 * 3. Que escanearlo no quede en silencio: pregunta si venderlo igual. Bloquearlo
 *    frenaría una venta con el producto en la mano.
 */
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');

let ok = 0, fail = 0;
const t = (d, c) => { if (c) { ok++; console.log('  OK   ' + d); } else { fail++; console.log('  FALLA ' + d); } };
function cuerpo(texto, n) {
  const i = texto.indexOf('function ' + n + '(');
  if (i < 0) return '';
  let p = 0, k;
  for (k = texto.indexOf('{', i); k < texto.length; k++) {
    if (texto[k] === '{') p++;
    else if (texto[k] === '}') { p--; if (!p) break; }
  }
  return texto.slice(i, k + 1);
}

const PRODS = [
  { id: 'm', nombre: 'Mani', codigo: '000010', oculto: true },
  { id: 't', nombre: 'Mani Tostado', codigo: '000011' },
  { id: 'd', nombre: 'Mani Salado', codigo: '000012', depurado: true },
];
/* etiquetaProductoDe de mentira: encuentra por código, como la de verdad con una etiqueta. */
const api = new Function('allProducts', 'etiquetaProductoDe',
  cuerpo(html, '_buscarProdVenta') + '\n' + cuerpo(html, '_buscarProdVentaConEtiqueta') +
  '\nreturn { buscar: _buscarProdVenta, conEtiqueta: _buscarProdVentaConEtiqueta };')(
  PRODS, (cod, lista) => lista.find(p => p.codigo === cod) || null);

console.log('\n-- el buscador --');
t('buscando "mani" sale solo el que no está oculto', api.buscar('mani').map(p => p.id).join() === 't');
t('el oculto no sale ni buscándolo por su código', api.buscar('000010').length === 0);
t('el depurado tampoco', !api.buscar('mani').some(p => p.id === 'd'));
t('sin texto no busca', api.buscar('') === null);

console.log('\n-- el código de una etiqueta --');
t('tipear el código de etiqueta de un oculto no lo trae', api.conEtiqueta('000010').length === 0);
t('el de uno visible sí', api.conEtiqueta('000011').map(p => p.id).join() === 't');

console.log('\n-- escanearlo --');
const agregar = cuerpo(html, '_agregarItemVenta');
t('escanear un oculto pregunta si venderlo igual', /if\(p && p\.oculto===true\)\{[\s\S]{0,120}pedirConfirmacion\(/.test(agregar));
t('  si dice que no, no lo agrega', /Vender igual'\}\)\)\)return;/.test(agregar));
t('  y pregunta antes de pedir los gramos', agregar.indexOf("titulo:'Producto oculto'") > 0 &&
  agregar.indexOf("titulo:'Producto oculto'") < agregar.indexOf('pedirCantidadPeso'));
t('la venta mayorista usa el mismo buscador',
  /function filterVentaMayProducts\(\)\{_pintarBusqueda\('ventaMayProdListDropdown'/.test(html) &&
  /_buscarProdVentaConEtiqueta\(q\)/.test(cuerpo(html, '_pintarBusqueda')));

console.log('\n' + ok + ' pasaron, ' + fail + ' fallaron');
process.exit(fail ? 1 : 0);
