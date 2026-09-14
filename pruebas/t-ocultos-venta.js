/**
 * LOS OCULTOS EN EL BUSCADOR DE LA VENTA.
 *
 * Pedido del comercio (14/09): un producto oculto no sale en la lista de la venta,
 * minorista y mayorista. Pero abajo se avisa cuántos ocultos coinciden con lo que
 * se escribió, y con "Ver" se muestran para poder venderlos.
 *
 * LO QUE ESTA PRUEBA CUIDA
 *
 * 1. Que la lista no los traiga, tampoco tipeando el código de una etiqueta.
 * 2. Que el aviso cuente los ocultos que coinciden, y no los depurados.
 * 3. Que visibles y ocultos se busquen con el MISMO criterio: con dos copias, un
 *    día el aviso diría "2 ocultos coinciden" de algo que la lista no encuentra.
 * 4. Que escanear un oculto pregunte, y que uno elegido con "Ver" no vuelva a
 *    preguntar: ya se eligió a propósito.
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
  { id: 'c', nombre: 'Mani Crocante', codigo: '000013', oculto: true },
];
/* etiquetaProductoDe de mentira: un código de etiqueta es "2" + el código del producto. */
const etiqueta = (cod, lista) => (/^2\d{12}$/.test(cod) ? (lista.find(p => '2' + p.codigo.padStart(12, '0') === cod) || null) : null);
const api = new Function('allProducts', 'etiquetaProductoDe',
  ['_coincideVenta', '_buscarProdVenta', '_ocultosVenta', '_buscarProdVentaConEtiqueta'].map(n => cuerpo(html, n)).join('\n') +
  '\nreturn { buscar: _buscarProdVenta, ocultos: _ocultosVenta, conEtiqueta: _buscarProdVentaConEtiqueta };')(PRODS, etiqueta);
const ids = arr => arr.map(p => p.id).sort().join(',');

console.log('\n-- la lista --');
t('buscando "mani" sale solo el que no está oculto', ids(api.buscar('mani')) === 't');
t('el oculto no sale ni buscándolo por su código', api.buscar('000010').length === 0);
t('el depurado tampoco', !api.buscar('mani').some(p => p.id === 'd'));
t('sin texto no busca', api.buscar('') === null);

console.log('\n-- el aviso de ocultos --');
t('cuenta los ocultos que coinciden', ids(api.ocultos('mani')) === 'c,m');
t('  y no los depurados', !api.ocultos('mani').some(p => p.id === 'd'));
t('  ni los visibles', api.ocultos('tostado').length === 0);
t('sin texto, ninguno', api.ocultos('').length === 0);
t('visibles y ocultos se buscan con el mismo criterio',
  cuerpo(html, '_buscarProdVenta').indexOf('_coincideVenta(p,t)') > 0 && cuerpo(html, '_ocultosVenta').indexOf('_coincideVenta(p,t)') > 0);

console.log('\n-- el código de una etiqueta --');
t('la de un oculto no lo trae a la lista', api.conEtiqueta('2000000000010').length === 0);
t('  pero entra en el aviso', ids(api.ocultos('2000000000010')) === 'm');
t('la de uno visible lo trae', ids(api.conEtiqueta('2000000000011')) === 't');
t('  y no avisa nada', api.ocultos('2000000000011').length === 0);

console.log('\n-- la pantalla --');
const pintar = cuerpo(html, '_pintarBusqueda');
t('la lista pide los ocultos', /const ocultos=_ocultosVenta\(q\)/.test(pintar));
t('avisa cuántos coinciden', pintar.indexOf(' productos ocultos coinciden') > 0 && pintar.indexOf(' producto oculto coincide') > 0);
t('con un botón para verlos y otro para dejar de verlos', /_verOcultosVenta\(/.test(pintar) && pintar.indexOf("'No mostrarlos':'Ver'") > 0);
t('al borrar la búsqueda se vuelven a esconder', /if\(res===null\)\{window\._ventaVerOcultos\[contId\]=false;/.test(pintar));
t('los que se ven con Ver agregan sin volver a preguntar',
  /\(op&&op\.ocultoVisto\)\?'_agregarItemVenta\(/.test(cuerpo(html, '_filaProdVenta')));

console.log('\n-- escanearlo --');
const agregar = cuerpo(html, '_agregarItemVenta');
t('escanear un oculto pregunta si venderlo igual', /if\(p && p\.oculto===true && !ocultoVisto\)\{[\s\S]{0,160}pedirConfirmacion\(/.test(agregar));
t('  si dice que no, no lo agrega', /Vender igual'\}\)\)\)return;/.test(agregar));
t('  y pregunta antes de pedir los gramos', agregar.indexOf("titulo:'Producto oculto'") > 0 &&
  agregar.indexOf("titulo:'Producto oculto'") < agregar.indexOf('pedirCantidadPeso'));
t('la venta mayorista usa el mismo buscador',
  /function filterVentaMayProducts\(\)\{_pintarBusqueda\('ventaMayProdListDropdown'/.test(html) &&
  /_buscarProdVentaConEtiqueta\(q\)/.test(pintar));

console.log('\n' + ok + ' pasaron, ' + fail + ' fallaron');
process.exit(fail ? 1 : 0);
