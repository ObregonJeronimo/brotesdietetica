/**
 * UN PRODUCTO SIN CODIGO TIENE QUE PODERSE EDITAR.
 *
 * El codigo de producto es obligatorio y unico: lo trajo el merge de la venta por peso,
 * y la importacion de catalogo lo asigna siempre. Pero los productos que ya estaban en
 * la base son anteriores a eso y no lo tienen. En PRODUCCION hoy hay exactamente 2
 * productos, y NINGUNO tiene codigo ni tipoVenta.
 *
 * El formulario hacia:
 *     if (c) c.value = p ? (p.codigo || '') : sugerirCodigoProducto();
 * o sea: si estas EDITANDO, el codigo sale del producto, y si no lo tiene queda VACIO.
 * Sugerir uno era solo para los productos nuevos. Entonces el dueño abria uno de sus
 * dos productos para corregir un precio, apretaba Guardar, y saveProduct lo rechazaba
 * con "El codigo no puede quedar vacio" — sobre un input cuyo placeholder dice
 * "Se completa solo". No habia forma de editarlos a mano.
 *
 * La tienda los vende bien y el importador los ve bien: lo unico roto era editarlos.
 *
 * Se ejecuta el envoltorio real de openModal y la validacion real que los rechazaba.
 */
const fs = require('fs');
const src = fs.readFileSync('admin.html', 'utf8');

function cuerpo(nombre) {
  let i = src.indexOf('function ' + nombre + '(');
  if (i < 0) throw new Error('no encontre ' + nombre);
  if (src.slice(Math.max(0, i - 6), i) === 'async ') i -= 6;
  let prof = 0, k;
  for (k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') prof++;
    else if (src[k] === '}') { prof--; if (!prof) break; }
  }
  return src.slice(i, k + 1);
}

/* El envoltorio no es una declaracion `function nombre()`: es una reasignacion
   (`openModal = function(id){...}`), asi que cuerpo() no lo encuentra. Se envuelve en
   vez de tocar openModal por dentro porque openModal es una sola linea de casi 2.000
   caracteres. */
function envoltorio() {
  const i = src.indexOf('openModal = function(id){');
  if (i < 0) throw new Error('no encontre el envoltorio de openModal');
  let prof = 0, k;
  for (k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') prof++;
    else if (src[k] === '}') { prof--; if (!prof) break; }
  }
  return 'var ' + src.slice(i, k + 1) + ';';
}

let ok = 0, fail = 0;
const t = (d, c, extra) => {
  if (c) { ok++; console.log('  OK   ' + d); }
  else { fail++; console.log('  FALLA ' + d + (extra !== undefined ? '   [' + extra + ']' : '')); }
};

function armar(productos) {
  /* El <small> debajo del campo, que `_pintarEstadoCodigo` reescribe mientras se
     escribe para avisar si el codigo choca o si se va a cambiar. */
  const ayuda = { textContent: '', style: {} };
  const DOM = {};
  const reg = { tipoVenta: [], abiertos: [] };
  const nuevo = id => ({
    _id: id, value: '', dataset: {},
    parentElement: { querySelector: () => ayuda },
  });
  const ent = {
    document: { getElementById: id => (DOM[id] = DOM[id] || nuevo(id)) },
    allProducts: productos,
    _origOpenModal: id => { reg.abiertos.push(id); },
    setTipoVenta: v => { reg.tipoVenta.push(v); },
    console: { warn() {} },
    /* La base es la que manda para la unicidad: allProducts puede estar vieja. */
    db: { collection: () => ({ where: (campo, op, val) => ({ limit: () => ({
      get: async () => ({ docs: productos.filter(p => p.codigo === val)
        .map(p => ({ id: p.id, data: () => p })) }),
    }) }) }) },
  };
  const nombres = Object.keys(ent);
  const api = new Function(...nombres,
    /* editingId lo declara el modulo y lo asigna openModal en su primera linea, que
       vive dentro de _origOpenModal (la funcion original, de 2.000 caracteres, que el
       envoltorio no toca). Se replica aca para que el aviso en vivo sepa cual es el
       producto que se esta editando y no se acuse a si mismo de duplicado. */
    'let editingId=null;\n' +
    ['normCodigo', 'sugerirCodigoProducto', 'validarCodigoProducto', '_pintarEstadoCodigo']
      .map(cuerpo).join('\n') +
    '\n' + envoltorio() +
    '\nreturn {abrir:function(id){editingId=id||null;return openModal(id);},' +
    'validar:validarCodigoProducto,norm:normCodigo,pintar:_pintarEstadoCodigo};'
  )(...nombres.map(n => ent[n]));
  return { api, DOM, reg, ayuda };
}

/* Produccion tal cual esta hoy: 2 productos, ninguno con codigo ni tipoVenta. */
const PRODUCCION = [
  { id: 'p1', nombre: 'Producto de ejemplo (ocultalo o borralo)', precio: 100, stock: 1 },
  { id: 'p2', nombre: 'Semillas de chia', precio: 3200, stock: 40 },
];

(async () => {
  console.log('\nABRIR UNO DE LOS 2 PRODUCTOS DE PRODUCCION (sin codigo)');
  let { api, DOM, reg } = armar(JSON.parse(JSON.stringify(PRODUCCION)));
  api.abrir('p2');
  t('el campo Codigo NO queda vacio', DOM.pCodigo.value !== '', '"' + DOM.pCodigo.value + '"');
  t('se completa con un codigo con forma de codigo', /^P-\d{4}$/.test(DOM.pCodigo.value), DOM.pCodigo.value);
  t('se abrio el formulario de verdad', reg.abiertos.indexOf('p2') >= 0);
  t('un producto sin tipoVenta arranca como unidad', reg.tipoVenta[0] === 'unidad', reg.tipoVenta[0]);

  console.log('\nY ESE VALOR PASA LA VALIDACION QUE ANTES LO RECHAZABA');
  let err = await api.validar(api.norm(DOM.pCodigo.value), 'p2');
  t('Guardar ya no se rechaza', err === '', 'error="' + err + '"');
  const errViejo = await api.validar(api.norm(''), 'p2');
  t('   (con el campo vacio de antes daba "El codigo no puede quedar vacio")',
    /no puede quedar vac/i.test(errViejo), errViejo);

  console.log('\nUN PRODUCTO QUE SI TIENE CODIGO NO SE TOCA');
  ({ api, DOM } = armar([{ id: 'p1', nombre: 'Nueces', codigo: 'NUE-500', tipoVenta: 'peso' }]));
  api.abrir('p1');
  t('respeta el codigo guardado tal cual', DOM.pCodigo.value === 'NUE-500', DOM.pCodigo.value);
  err = await api.validar(api.norm(DOM.pCodigo.value), 'p1');
  t('y sigue validando contra si mismo sin chocar', err === '', err);

  console.log('\nUN PRODUCTO NUEVO SIGUE FUNCIONANDO COMO ANTES');
  ({ api, DOM, reg } = armar(JSON.parse(JSON.stringify(PRODUCCION))));
  api.abrir(null);
  t('sugiere un codigo', /^P-\d{4}$/.test(DOM.pCodigo.value), DOM.pCodigo.value);
  t('y arranca en unidad', reg.tipoVenta[0] === 'unidad');

  console.log('\nEL SUGERIDO NO CHOCA CON UNO QUE YA EXISTE');
  ({ api, DOM } = armar([
    { id: 'p1', nombre: 'Uno', codigo: 'P-0001' },
    { id: 'p2', nombre: 'Dos', codigo: 'P-0002' },
    { id: 'p3', nombre: 'Tres sin codigo' },
  ]));
  api.abrir('p3');
  t('no repite P-0001 ni P-0002', DOM.pCodigo.value !== 'P-0001' && DOM.pCodigo.value !== 'P-0002',
    DOM.pCodigo.value);
  err = await api.validar(api.norm(DOM.pCodigo.value), 'p3');
  t('y la validacion de unicidad lo acepta', err === '', err);

  console.log('\nARREGLAR LOS DOS PRODUCTOS, UNO DESPUES DEL OTRO');
  const base = JSON.parse(JSON.stringify(PRODUCCION));
  let a = armar(base);
  a.api.abrir('p1');
  const cod1 = a.DOM.pCodigo.value;
  t('el primero recibe un codigo', /^P-\d{4}$/.test(cod1), cod1);
  base[0].codigo = cod1;                    /* como si lo hubiera guardado */
  a = armar(base);
  a.api.abrir('p2');
  const cod2 = a.DOM.pCodigo.value;
  t('el segundo recibe OTRO distinto', cod2 !== cod1, cod1 + ' vs ' + cod2);
  err = await a.api.validar(a.api.norm(cod2), 'p2');
  t('y tambien se puede guardar', err === '', err);

  /* Lo que Thiago sumo encima: el aviso cambia MIENTRAS se escribe, contra lo que hay en
     memoria. Antes te enterabas de que el codigo estaba repetido recien al apretar
     Guardar, con el formulario entero completado. La validacion contra la base sigue
     estando al guardar, que es la que manda. */
  console.log('\nEL AVISO EN VIVO, MIENTRAS SE ESCRIBE');
  const CAT = [
    { id: 'p1', nombre: 'Uno', codigo: 'P-0001' },
    { id: 'p2', nombre: 'Nueces mariposa', codigo: 'P-0002' },
    { id: 'p3', nombre: 'Tres sin codigo' },
  ];
  let a3 = armar(JSON.parse(JSON.stringify(CAT)));
  a3.api.abrir('p1');
  t('al abrir, la ayuda no acusa nada', !/Ya lo usa|cambiar|vac/i.test(a3.ayuda.textContent),
    a3.ayuda.textContent);
  t('   y recuerda el codigo original para poder comparar',
    a3.DOM.pCodigo.dataset.original === 'P-0001', a3.DOM.pCodigo.dataset.original);

  a3.DOM.pCodigo.value = 'P-0002';
  a3.api.pintar();
  t('escribir uno repetido avisa Y dice de quien es',
    /Ya lo usa/.test(a3.ayuda.textContent) && /Nueces mariposa/.test(a3.ayuda.textContent),
    a3.ayuda.textContent);

  a3.DOM.pCodigo.value = 'ALM-500';
  a3.api.pintar();
  t('uno libre y distinto avisa el cambio',
    /P-0001/.test(a3.ayuda.textContent) && /ALM-500/.test(a3.ayuda.textContent),
    a3.ayuda.textContent);

  a3.DOM.pCodigo.value = '';
  a3.api.pintar();
  t('vaciarlo avisa antes de llegar a Guardar', /no puede quedar vac/i.test(a3.ayuda.textContent),
    a3.ayuda.textContent);

  a3.DOM.pCodigo.value = 'p-0001';
  a3.api.pintar();
  t('su PROPIO codigo no se acusa a si mismo (ni en minuscula)',
    !/Ya lo usa/.test(a3.ayuda.textContent), a3.ayuda.textContent);

  a3 = armar(JSON.parse(JSON.stringify(CAT)));
  a3.api.abrir('p3');
  t('un producto sin codigo abre con el sugerido y sin acusar nada',
    /^P-\d{4}$/.test(a3.DOM.pCodigo.value) && !/Ya lo usa/.test(a3.ayuda.textContent),
    a3.DOM.pCodigo.value + ' | ' + a3.ayuda.textContent);
  t('   y su original queda vacio, asi no dice "se va a cambiar de  a X"',
    a3.DOM.pCodigo.dataset.original === '' && !/cambiar/.test(a3.ayuda.textContent),
    a3.ayuda.textContent);

  console.log('\n' + ok + ' pasaron, ' + fail + ' fallaron');
  process.exit(fail ? 1 : 0);
})();
