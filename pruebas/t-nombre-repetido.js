/* DOS PRODUCTOS CON EL MISMO NOMBRE INTERNO
   =============================================================================
   Lo encontró el dueño el 21/09 cargando un producto desde una venta: le puso
   exactamente el mismo nombre interno que a otro y el panel lo guardó sin decir
   nada. Quedaron dos fichas para lo mismo, con dos precios, dos stocks y dos
   lugares donde tocar cuando cambia el costo; y el buscador del modal de venta
   busca POR NOMBRE, así que el que atiende ve dos renglones idénticos y elige a
   ciegas.

   POR QUE NO SE BLOQUEA SIEMPRE. Medido en producción el 21/09 (1.313 productos,
   solo lectura): hay 5 grupos de nombre repetido, 4 de ellos dentro de la MISMA
   lista y 1 entre listas distintas (CANELONES, en dos listas). Al mismo producto
   se le puede comprar a dos proveedores y son dos fichas legítimas. Así que:

     - misma lista   -> no se guarda, y se dice con cuál choca
     - otra lista    -> se pregunta y se puede seguir
     - ya venía así  -> se guarda, avisando

   Ese último caso es el que evita el peor resultado: si se bloqueara a secas,
   los tres productos que HOY están repetidos en la misma lista (CACAO AMARGO,
   CHIPS DE CHOCOLATE, AVENA INSTANTANEA) no se podrían ni editar para corregirles
   el precio, por un choque que no está creando esa edición.

   El criterio de "mismo nombre" es claveProducto(), el MISMO que usa el informe
   de repetidos: sin acentos, sin mayúsculas, sin espacios de más. Se saca del
   admin.html de verdad, no una copia.
   ============================================================================= */
const fs = require('fs');
const path = require('path');
const HTML = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');

let ok = 0, mal = 0;
const t = (d, c, extra) => {
  if (c) { ok++; console.log('  OK   ' + d + (extra ? '   (' + extra + ')' : '')); }
  else { mal++; console.log('  FALLA ' + d + (extra ? '   (' + extra + ')' : '')); }
};
const chr10 = String.fromCharCode(10);
const grupo = n => console.log('\n' + n);

function cuerpo(nombre) {
  let i = HTML.indexOf('function ' + nombre + '(');
  if (i < 0) throw new Error('no se encontro ' + nombre);
  if (HTML.slice(i - 6, i) === 'async ') i -= 6;
  let b = HTML.indexOf('{', i), prof = 0, k;
  for (k = b; k < HTML.length; k++) { if (HTML[k] === '{') prof++; else if (HTML[k] === '}') { prof--; if (!prof) break; } }
  return HTML.slice(i, k + 1);
}

/* El panel de mentira. `db` devuelve lo que se le diga: sirve para el caso del
   otro admin que cargo un producto hace un minuto y allProducts no lo tiene. */
function panel(productos, enLaBase) {
  const listas = { L1: 'FRUTICOR-TODOS', L2: 'NATURA' };
  const f = new Function('allProducts', 'db', 'document', 'editingId', 'console',
    cuerpo('claveProducto') + '\n' +
    'function _nombreDeLista(id){return ({' + Object.entries(listas).map(([k, v]) => "'" + k + "':'" + v + "'").join(',') + '})[id]||"";}\n' +
    cuerpo('validarNombreProducto') + '\n' +
    'return validarNombreProducto;');
  const db = { collection: () => ({ where: () => ({ limit: () => ({
    get: () => Promise.resolve({ docs: (enLaBase || []).map(p => ({ id: p.id, data: () => p })) })
  }) }) }) };
  return f(productos, db, { getElementById: () => null }, null, console);
}

const A = { id: 'a', nombre: 'producto prueba', codigo: '002022', lista: 'L1' };
const CANELONES = { id: 'c1', nombre: 'CANELONES', codigo: '002000', lista: 'L1' };

(async () => {
  grupo('Misma lista: no se guarda');
  let v = panel([A]);
  let r = await v('producto prueba', 'L1', null, '');
  t('da error', !!r.error, r.error);
  t('dice con cuál choca', /002022/.test(r.error || ''));
  t('y explica por qué molesta', /dos precios y dos stocks/.test(r.error || ''));
  t('no pregunta nada: no hay nada que consultar', !r.confirmar);

  r = await v('PRODUCTO   PRUEBA', 'L1', null, '');
  t('mayúsculas y espacios de más son el mismo nombre', !!r.error);
  r = await v('Producto Prueba', 'L1', null, '');
  t('y los acentos y capitalización tampoco lo salvan', !!r.error);

  grupo('Nombres distintos de verdad, se guardan');
  r = await v('producto prueba 250g', 'L1', null, '');
  t('agregarle el gramaje alcanza', !r.error && !r.confirmar, JSON.stringify(r));
  v = panel([{ id: 'x', nombre: 'CANELA x 500 gr', lista: 'L1' }]);
  r = await v('CANELA x 1 Kg', 'L1', null, '');
  t('dos envases del mismo producto son fichas distintas', !r.error && !r.confirmar);

  grupo('Otra lista: se pregunta, no se bloquea');
  v = panel([CANELONES]);
  r = await v('CANELONES', 'L2', null, '');
  t('no da error', !r.error, r.error);
  t('pregunta', !!r.confirmar, r.confirmar);
  t('y dice en qué lista está el otro', /FRUTICOR-TODOS/.test(r.confirmar || ''));
  t('con el caso legítimo escrito: dos proveedores', /dos proveedores/.test(r.confirmar || ''));

  grupo('El que YA venía repetido se puede seguir editando');
  const VIEJO = { id: 'v1', nombre: 'CACAO AMARGO CALIDAD EXTRA X 1 KG', codigo: '000093', lista: 'L1' };
  v = panel([VIEJO]);
  /* se edita el otro de los dos, sin tocarle el nombre */
  r = await v('CACAO AMARGO CALIDAD EXTRA X 1 KG', 'L1', 'v2', 'CACAO AMARGO CALIDAD EXTRA X 1 KG');
  t('NO se bloquea: el choque no lo crea esta edición', !r.error, r.error);
  t('pero se avisa', !!r.aviso, r.aviso);
  t('y el aviso dice que venía así', /venía así/.test(r.aviso || ''));

  r = await v('CACAO AMARGO CALIDAD EXTRA X 1 KG', 'L1', 'v2', 'OTRO NOMBRE CUALQUIERA');
  t('si en cambio se RENOMBRA sobre uno que existe, sí se bloquea', !!r.error, r.error);

  v = panel([CANELONES]);
  r = await v('CANELONES', 'L2', 'c2', 'CANELONES');
  t('el repetido entre listas que ya venía así no molesta más',
    !r.error && !r.confirmar && !r.aviso, JSON.stringify(r));

  grupo('El producto que se está editando no choca consigo mismo');
  v = panel([A]);
  r = await v('producto prueba', 'L1', 'a', 'producto prueba');
  t('guardar sin cambiar nada no da error', !r.error, r.error);

  grupo('Lo que carga el otro admin mientras tanto');
  v = panel([], [{ id: 'z', nombre: 'producto prueba', codigo: '002099', lista: 'L1' }]);
  r = await v('producto prueba', 'L1', null, '');
  t('aunque no esté en memoria, la base lo encuentra', !!r.error, r.error);
  v = panel([A], [{ id: 'z', nombre: 'otro', lista: 'L1' }]);
  r = await v('producto prueba', 'L1', null, '');
  t('y si ya lo vio en memoria no vuelve a leer la base', !!r.error);

  grupo('Vacío');
  v = panel([]);
  r = await v('', 'L1', null, '');
  t('un nombre vacío se rechaza', /no puede quedar vacío/.test(r.error || ''));
  r = await v('   ', 'L1', null, '');
  t('y solo espacios también', !!r.error);

  grupo('El aviso en vivo, mientras se escribe');
  /* Se corre _pintarEstadoNombre() del archivo real con una ficha de mentira: es
     el aviso que evita llegar al boton Guardar para enterarse. */
  function fichaViva(productos, nombre, lista, idEditando) {
    const els = {
      pNombre: { value: nombre },
      pNombreAyuda: { textContent: '', style: {} },
      pLista: { value: lista, options: [{ value: 'L1', textContent: 'FRUTICOR-TODOS' }, { value: 'L2', textContent: 'NATURA' }] }
    };
    const doc = { getElementById: id => els[id] || null };
    const f = new Function('allProducts', 'document', 'editingId', 'console',
      cuerpo('claveProducto') + chr10 +
      cuerpo('_nombreDeLista') + chr10 +
      cuerpo('_pintarEstadoNombre') + chr10 +
      'return _pintarEstadoNombre;');
    f(productos, doc, idEditando || null, console)();
    return els.pNombreAyuda;
  }
  let ay = fichaViva([A], 'producto prueba', 'L1');
  t('en la misma lista avisa en rojo', /en esta lista/.test(ay.textContent) && /danger/.test(ay.style.color), ay.textContent);
  t('y dice el codigo del otro', /002022/.test(ay.textContent));
  ay = fichaViva([A], 'producto prueba', 'L2');
  t('en otra lista avisa en amarillo, no en rojo', /otra lista|en la lista/.test(ay.textContent) && !/danger/.test(ay.style.color), ay.textContent);
  t('y aclara que se puede', /Se puede/.test(ay.textContent));
  ay = fichaViva([A], 'PRODUCTO   PRUEBA', 'L1');
  t('mayusculas y espacios de mas tambien avisan', /en esta lista/.test(ay.textContent));
  ay = fichaViva([A], 'producto prueba 250g', 'L1');
  t('un nombre distinto no avisa nada', ay.textContent === '');
  ay = fichaViva([A], '', 'L1');
  t('vacio tampoco', ay.textContent === '');
  ay = fichaViva([A], 'producto prueba', 'L1', 'a');
  t('y el que se esta editando no se avisa a si mismo', ay.textContent === '');

  grupo('El panel lo usa donde tiene que usarlo');
  const sp = HTML.slice(HTML.indexOf('async function saveProduct(e)'));
  const iNom = sp.indexOf('validarNombreProducto(');
  const iImg = sp.indexOf('uploadImage(selectedImageFile)');
  t('saveProduct lo llama', iNom > 0);
  t('ANTES de subir la imagen, para no dejarla huérfana', iNom > 0 && iImg > 0 && iNom < iImg);
  t('el error corta el guardado', /_chkNom\.error\)\{showAdminToast\(_chkNom\.error,'error'\)/.test(sp.slice(0, 4000)));
  t('el caso de otra lista se pregunta con el diálogo del panel',
    /_chkNom\.confirmar&&!await pedirConfirmacion/.test(sp.slice(0, 4000)));
  t('avisa en vivo mientras se escribe',
    /id="pNombre"[^>]*oninput="[^"]*_pintarEstadoNombre\(\)/.test(HTML));
  t('hay dónde poner ese aviso', HTML.indexOf('id="pNombreAyuda"') > 0);
  t('cambiar de lista lo vuelve a evaluar',
    /id="pLista"[^>]*onchange="[^"]*_pintarEstadoNombre\(\)/.test(HTML));
  t('al abrir la ficha se recuerda el nombre original',
    /_n\.dataset\.original=\(p&&p\.nombre\)/.test(HTML));
  t('usa claveProducto, el mismo criterio que el informe de repetidos',
    /claveProducto\(nombre\)/.test(cuerpo('validarNombreProducto')));

  console.log('\n' + ok + ' pasaron, ' + mal + ' fallaron');
  process.exit(mal ? 1 : 0);
})().catch(e => {
  console.error('  EXPLOTO: ' + e.stack);
  console.log('\n' + ok + ' pasaron, ' + (mal + 1) + ' fallaron');
  process.exit(1);
});
