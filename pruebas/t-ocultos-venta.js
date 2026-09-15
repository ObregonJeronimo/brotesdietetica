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
 * 4. Que "Ver" valga para ESA búsqueda, exacta: escribiendo más o con otra, vuelven a esconderse. Si no, un
 *    "Ver" de antes mostraba los ocultos de algo que no se buscó.
 * 5. Que escanear un oculto pregunte, y que uno elegido con "Ver" no vuelva a
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
  { id: 'x', nombre: 'Mani Viejo', codigo: '000014', oculto: true, depurado: true },
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
t('la de uno depurado y oculto lo trae igual: al tocarlo se ofrece restaurarlo', ids(api.conEtiqueta('2000000000014')) === 'x');
t('  y no entra en el aviso de ocultos, que no cuenta depurados', api.ocultos('2000000000014').length === 0);
t('en la lista el depurado va marcado', cuerpo(html, '_filaProdVenta').indexOf('if(p.depurado===true)chips.push(') > 0);

/* ======================================================= EL BOTON VER
   Se corren las funciones de verdad de admin.html con un document de mentira. Lo
   único que se reemplaza es la fila, que arma HTML con precios y stock: acá alcanza
   con saber qué producto es y si se mostró con "Ver". */
console.log('\n-- el botón Ver --');
const dom = { ventaProdSearch: { value: '' }, ventaProdList: { innerHTML: '' },
              ventaMayBuscaProd: { value: '' }, ventaMayProdListDropdown: { innerHTML: '' } };
const ui = new Function('allProducts', 'etiquetaProductoDe', 'document', 'window',
  ['_coincideVenta', '_buscarProdVenta', '_ocultosVenta', '_buscarProdVentaConEtiqueta',
   '_pintarBusqueda', '_verOcultosVenta', 'filterVentaProducts', 'filterVentaMayProducts'].map(n => cuerpo(html, n)).join('\n') +
  '\nfunction _filaProdVenta(p, ctx, op) { return "[" + p.id + (op && op.ocultoVisto ? " visto" : "") + "]"; }' +
  '\nreturn { filtrar: filterVentaProducts, filtrarMay: filterVentaMayProducts, ver: _verOcultosVenta };')(
  PRODS, etiqueta, { getElementById: id => dom[id] || null }, {});
const buscar = txt => { dom.ventaProdSearch.value = txt; ui.filtrar(); return dom.ventaProdList.innerHTML; };
const tocarVer = () => { ui.ver('ventaProdList', 'min', true); return dom.ventaProdList.innerHTML; };
const conVer = h => h.indexOf('>No mostrarlos</button>') > 0;
const sinVer = h => h.indexOf(' visto]') < 0 && h.indexOf('>Ver</button>') > 0;

let h = buscar('mani');
t('sin tocar Ver, la lista trae solo los visibles', h.indexOf('[t]') >= 0 && h.indexOf('[m') < 0 && h.indexOf('[c') < 0);
t('  y abajo dice cuántos ocultos coinciden, con el botón', h.indexOf('2 productos ocultos coinciden') > 0 && sinVer(h));
h = tocarVer();
t('con Ver aparecen, marcados para no volver a preguntar', h.indexOf('[m visto]') >= 0 && h.indexOf('[c visto]') >= 0 && conVer(h));
h = buscar('mani');
t('repintando la misma búsqueda, siguen a la vista', h.indexOf('[m visto]') >= 0 && conVer(h));
h = buscar('mani cro');
t('escribiendo más vuelven a esconderse: con "empieza con", un Ver tocado con "a" valía para todo lo que empezara con a', sinVer(h));
h = buscar('crocante');
t('con otra búsqueda vuelven a esconderse', sinVer(h));
t('  y si solo coincide un oculto, se aclara que no hay visibles',
  h.indexOf('Ningún producto visible coincide') >= 0 && h.indexOf('1 producto oculto coincide') > 0);
t('  que con Ver también se muestra', tocarVer().indexOf('[c visto]') >= 0);
buscar('mani'); tocarVer(); buscar('');
t('borrar la búsqueda también los esconde', sinVer(buscar('mani')));
tocarVer(); ui.ver('ventaProdList', 'min', false);
t('"No mostrarlos" los esconde', sinVer(dom.ventaProdList.innerHTML));
tocarVer(); dom.ventaMayBuscaProd.value = 'mani'; ui.filtrarMay();
t('el Ver de la minorista no se pasa a la mayorista', sinVer(dom.ventaMayProdListDropdown.innerHTML));
ui.ver('ventaMayProdListDropdown', 'may', true);
t('  que tiene el suyo, con su propio buscador', dom.ventaMayProdListDropdown.innerHTML.indexOf('[m visto]') >= 0);

{
  /* Muchos ocultos: el aviso los cuenta a todos y la lista dibuja 25. */
  const MUCHOS = Array.from({ length: 30 }, (_, i) => ({ id: 'o' + i, nombre: 'Te ' + i, codigo: String(500 + i), oculto: true }));
  const dom2 = { ventaProdSearch: { value: 'te' }, ventaProdList: { innerHTML: '' }, ventaMayBuscaProd: { value: '' }, ventaMayProdListDropdown: { innerHTML: '' } };
  const ui2 = new Function('allProducts', 'etiquetaProductoDe', 'document', 'window',
    ['_coincideVenta', '_buscarProdVenta', '_ocultosVenta', '_buscarProdVentaConEtiqueta',
     '_pintarBusqueda', '_verOcultosVenta', 'filterVentaProducts', 'filterVentaMayProducts'].map(n => cuerpo(html, n)).join('\n') +
    '\nfunction _filaProdVenta(p, ctx, op) { return "[" + p.id + (op && op.ocultoVisto ? " visto" : "") + "]"; }' +
    '\nreturn { filtrar: filterVentaProducts, ver: _verOcultosVenta };')(MUCHOS, etiqueta, { getElementById: id => dom2[id] || null }, {});
  ui2.filtrar();
  t('con 30 ocultos que coinciden, el aviso dice 30 y no 25', dom2.ventaProdList.innerHTML.indexOf('30 productos ocultos coinciden') > 0);
  ui2.ver('ventaProdList', 'min', true);
  const h2 = dom2.ventaProdList.innerHTML;
  t('  con Ver dibuja 25 y avisa que hay más', (h2.match(/ visto\]/g) || []).length === 25 && h2.indexOf('Se muestran 25 de 30') > 0);
}
{
  const abrir = cuerpo(html, 'openVentaModal');
  const iLimpia = abrir.indexOf("_psAbrir.value=''");
  t('abrir la venta limpia el buscador antes de pintar: Escape la cierra sin pasar por closeVentaModal',
    iLimpia > 0 && iLimpia < abrir.indexOf('filterVentaProducts()'));
  t('  y editar una venta también', html.indexOf("_psEditar.value='';filterVentaProducts()") > 0);
}

console.log('\n-- agregarlos --');
t('los que se ven con Ver agregan sin volver a preguntar',
  /\(op&&op\.ocultoVisto\)\?'_agregarItemVenta\(/.test(cuerpo(html, '_filaProdVenta')));
const agregar = cuerpo(html, '_agregarItemVenta');
t('escanear un oculto pregunta si venderlo igual', /if\(p && p\.oculto===true && !ocultoVisto\)\{[\s\S]{0,160}pedirConfirmacion\(/.test(agregar));
t('  si dice que no, no lo agrega', /Vender igual'\}\)\)\)return;/.test(agregar));
t('  y pregunta antes de pedir los gramos', agregar.indexOf("titulo:'Producto oculto'") > 0 &&
  agregar.indexOf("titulo:'Producto oculto'") < agregar.indexOf('pedirCantidadPeso'));
t('la venta mayorista usa el mismo buscador',
  /function filterVentaMayProducts\(\)\{_pintarBusqueda\('ventaMayProdListDropdown'/.test(html) &&
  /_buscarProdVentaConEtiqueta\(q\)/.test(cuerpo(html, '_pintarBusqueda')));

console.log('\n' + ok + ' pasaron, ' + fail + ' fallaron');
process.exit(fail ? 1 : 0);
