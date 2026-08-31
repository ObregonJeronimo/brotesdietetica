/**
 * BORRAR UN PRODUCTO NO PUEDE ROMPERLE LA IMAGEN A OTRO.
 *
 * Mismo agujero que tenian las compras -el documento se borraba y el archivo
 * quedaba en el bucket para siempre-, pero en productos hay dos trampas que
 * en compras no existen, y las dos son reales, no teoricas:
 *
 *   1. NO TODO LO QUE PARECE UNA IMAGEN ESTA EN EL BUCKET. Mire el catalogo
 *      de produccion: la UNICA url de imagen que hay es
 *      'img/default-product.svg', una ruta del repositorio, y la comparten
 *      unos 500 productos. Una version ingenua le pediria a Storage que borre
 *      eso en cada eliminacion.
 *
 *   2. DOS PRODUCTOS PUEDEN APUNTAR AL MISMO ARCHIVO. Alcanza con pegar la
 *      misma URL subida en el campo de imagenes extra de otro producto. Si al
 *      borrar uno se lleva el archivo, al otro le queda una imagen rota, y una
 *      imagen rota en la tienda no avisa: se ve el recuadro vacio y listo.
 *
 * Un producto ademas puede tener varias imagenes: la principal y las "extra",
 * que se guardan como UN SOLO texto con un salto de linea entre cada una.
 */
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'admin-archivos.js'), 'utf8');

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

let ok = 0, fail = 0;
const t = (d, c) => { if (c) { ok++; console.log('  OK   ' + d); } else { fail++; console.log('  FALLA ' + d); } };

const SUB = 'https://firebasestorage.googleapis.com/v0/b/x.firebasestorage.app/o/';
const url = (n) => SUB + encodeURIComponent('productos/' + n) + '?alt=media&token=t';

/* ------------------------------------------------- que cuenta como del bucket */
const esDeStorage = new Function(cuerpo('esArchivoDeStorage') + ';return esArchivoDeStorage;')();

t('una subida del panel si', esDeStorage(url('a.webp')));
t('el dominio nuevo del bucket tambien', esDeStorage('https://x.firebasestorage.app/o/y.webp'));
t('la url vieja de googleapis tambien', esDeStorage('https://storage.googleapis.com/x/y.webp'));
/* La que importa: es la que tiene medio catalogo. */
t('la ruta del repositorio NO', !esDeStorage('img/default-product.svg'));
t('una imagen de afuera tampoco', !esDeStorage('https://otrositio.com/foto.jpg'));
t('vacio, null y numeros no rompen',
  !esDeStorage('') && !esDeStorage(null) && !esDeStorage(undefined) && !esDeStorage(7));

/* --------------------------------------------- las imagenes de un producto */
const imagenesDe = new Function(
  cuerpo('esArchivoDeStorage') + cuerpo('imagenesDeProducto') + ';return imagenesDeProducto;')();

t('toma la principal', imagenesDe({ imagen: url('a.webp') }).length === 1);
/* imagenesExtra es UN texto con saltos de linea, no un array. */
t('y las extra, que vienen en un solo texto',
  imagenesDe({ imagen: url('a.webp'), imagenesExtra: url('b.webp') + '\n' + url('c.webp') }).length === 3);
t('saltea la ruta del repositorio', imagenesDe({ imagen: 'img/default-product.svg' }).length === 0);
t('mezcla: se queda solo con las del bucket',
  imagenesDe({ imagen: 'img/default-product.svg', imagenesExtra: url('b.webp') }).length === 1);
t('lineas vacias no cuentan',
  imagenesDe({ imagen: url('a.webp'), imagenesExtra: '\n\n  \n' }).length === 1);
t('un producto sin imagen da lista vacia', imagenesDe({}).length === 0);
t('null no rompe', imagenesDe(null).length === 0);

/* ------------------------------------------------------- el borrado, entero */
async function correr(prod, otros, falla, despues) {
  const borrados = [];
  const fakes = {
    allProducts: (otros || []).concat([prod]),
    storage: {
      refFromURL: (u) => ({
        delete: async () => {
          if (falla) { const e = new Error('x'); e.code = falla; throw e; }
          borrados.push(decodeURIComponent(u.split('/o/')[1].split('?')[0]));
        },
      }),
    },
    console: { warn: () => borrados.push('WARN') },
  };
  const nombres = Object.keys(fakes);
  const fn = new Function(...nombres,
    cuerpo('esArchivoDeStorage') + cuerpo('borrarArchivoDeStorage') +
    cuerpo('imagenesDeProducto') + cuerpo('borrarImagenesQueSobran') +
    cuerpo('borrarImagenesDeProducto') +
    ';return { borrarImagenesDeProducto: borrarImagenesDeProducto,' +
    '          borrarImagenesQueSobran: borrarImagenesQueSobran };');
  const api = fn(...nombres.map(n => fakes[n]));
  const sacadas = despues === undefined
    ? await api.borrarImagenesDeProducto(prod, prod.id)
    : await api.borrarImagenesQueSobran(prod, despues, prod.id, 'x');
  return { borrados, sacadas };
}

(async () => {
  const solo = await correr({ id: 'p1', imagen: url('a.webp') }, []);
  t('borra la imagen de un producto que no la comparte',
    solo.borrados.join() === 'productos/a.webp' && solo.sacadas === 1);

  const varias = await correr(
    { id: 'p1', imagen: url('a.webp'), imagenesExtra: url('b.webp') + '\n' + url('c.webp') }, []);
  t('borra las tres cuando tiene principal y extras', varias.borrados.length === 3);

  /* El caso del catalogo de hoy. */
  const porDefecto = await correr({ id: 'p1', imagen: 'img/default-product.svg' }, []);
  t('NO le pide al bucket que borre la ruta del repositorio', porDefecto.borrados.length === 0);

  /* El caso peligroso. */
  const compartida = await correr(
    { id: 'p1', imagen: url('compartida.webp') },
    [{ id: 'p2', imagen: url('compartida.webp') }]);
  t('NO borra una imagen que otro producto sigue usando', compartida.borrados.length === 0);

  const mezcla = await correr(
    { id: 'p1', imagen: url('propia.webp'), imagenesExtra: url('compartida.webp') },
    [{ id: 'p2', imagenesExtra: url('compartida.webp') }]);
  t('borra la suya y deja la compartida',
    mezcla.borrados.join() === 'productos/propia.webp');

  /* Compartida a traves del campo extra del otro, que es como pasaria de verdad. */
  const alReves = await correr(
    { id: 'p1', imagenesExtra: url('x.webp') },
    [{ id: 'p2', imagen: url('x.webp') }]);
  t('da igual en que campo la tenga el otro', alReves.borrados.length === 0);

  /* El propio producto sigue en allProducts cuando esto corre: si no se lo
     saltea por id, se cree que su imagen esta en uso y no borra nunca nada. */
  t('no se confunde consigo mismo', solo.sacadas === 1);

  const roto = await correr({ id: 'p1', imagen: url('a.webp') }, [], 'storage/unauthorized');
  t('si el bucket falla, avisa en consola y no tira', roto.borrados.join() === 'WARN');
  const noEstaba = await correr({ id: 'p1', imagen: url('a.webp') }, [], 'storage/object-not-found');
  t('si el archivo ya no estaba, ni se queja', noEstaba.borrados.length === 0 && noEstaba.sacadas === 1);

  /* ------------------------------------------------------------ REEMPLAZO
     Editar un producto y cambiarle la foto dejaba la anterior en el bucket
     para siempre. Pasa mas seguido que borrar el producto entero. */
  const cambio = await correr(
    { id: 'p1', imagen: url('vieja.webp') }, [], null,
    { id: 'p1', imagen: url('nueva.webp') });
  t('al cambiar la foto se borra la vieja', cambio.borrados.join() === 'productos/vieja.webp');
  t('y NO la nueva', cambio.borrados.indexOf('productos/nueva.webp') < 0);

  const igual = await correr(
    { id: 'p1', imagen: url('a.webp') }, [], null,
    { id: 'p1', imagen: url('a.webp') });
  t('guardar sin tocar la foto no borra nada', igual.borrados.length === 0);

  /* Si la mueve de principal a extra, la url no cambio de dueño. */
  const movida = await correr(
    { id: 'p1', imagen: url('a.webp') }, [], null,
    { id: 'p1', imagen: url('b.webp'), imagenesExtra: [url('a.webp')] });
  t('mover una imagen de principal a extra no la borra', movida.borrados.length === 0);

  const sacoUna = await correr(
    { id: 'p1', imagen: url('a.webp'), imagenesExtra: [url('b.webp'), url('c.webp')] }, [], null,
    { id: 'p1', imagen: url('a.webp'), imagenesExtra: [url('b.webp')] });
  t('sacar una extra la borra, y solo esa', sacoUna.borrados.join() === 'productos/c.webp');

  /* Al reemplazar tambien vale el reparo: si otro la usa, no se toca. */
  const reemplazoCompartida = await correr(
    { id: 'p1', imagen: url('compartida.webp') },
    [{ id: 'p2', imagenesExtra: [url('compartida.webp')] }], null,
    { id: 'p1', imagen: url('nueva.webp') });
  t('al reemplazar tampoco borra una imagen que usa otro', reemplazoCompartida.borrados.length === 0);

  /* ------------------------------------------------- imagenesExtra COMO LISTA
     saveProduct la escribe como lista; quedan fichas viejas donde es un texto
     con saltos de linea. Tratar la lista como texto no da error -por eso es
     peligroso-: String() la pega con comas, la cadena igual contiene
     "firebasestorage", y el reparo de "la usa otro" deja de reconocer las
     urls sueltas. */
  t('lee imagenesExtra cuando es una lista',
    imagenesDe({ imagen: url('a.webp'), imagenesExtra: [url('b.webp'), url('c.webp')] }).length === 3);
  t('y sigue leyendo el texto viejo con saltos de linea',
    imagenesDe({ imagenesExtra: url('b.webp') + '\n' + url('c.webp') }).length === 2);
  t('las dos formas dan exactamente lo mismo',
    imagenesDe({ imagenesExtra: [url('b.webp'), url('c.webp')] }).join('|') ===
    imagenesDe({ imagenesExtra: url('b.webp') + '\n' + url('c.webp') }).join('|'));
  t('nunca devuelve urls pegadas entre si',
    imagenesDe({ imagenesExtra: [url('b.webp'), url('c.webp')] }).every(u => u.indexOf(',') < 0));

  const listaCompartida = await correr(
    { id: 'p1', imagenesExtra: [url('compartida.webp')] },
    [{ id: 'p2', imagenesExtra: [url('compartida.webp')] }]);
  t('con listas, el reparo de compartidas sigue funcionando',
    listaCompartida.borrados.length === 0);

  console.log('\n' + ok + ' pasaron, ' + fail + ' fallaron');
  process.exit(fail ? 1 : 0);
})();
