/* ==========================================================================
   BORRAR ARCHIVOS DEL BUCKET

   El panel subia archivos y no sacaba ninguno nunca: borrar una compra o un
   producto sacaba el documento de Firestore y dejaba la imagen o el PDF dando
   vueltas para siempre, sin nada que lo apuntara.

   Vive aparte porque lo usan dos secciones -compras y productos-, y porque hay
   dos cosas que hay que hacer bien y son faciles de olvidar:

     1. NO todo lo que parece una imagen esta en el bucket. Un producto puede
        tener 'img/default-product.svg', que es un archivo del repositorio.
        Hoy CASI TODO el catalogo apunta ahi: son ~500 productos con la misma
        ruta. Pedirle a Storage que borre eso no tiene sentido -y si algun dia
        la ruta llegara a resolver a algo real, seria un desastre-.

     2. Se borra DESPUES del documento, nunca antes. Si el borrado del
        documento fallara y ya hubieramos borrado el archivo, quedaria un
        registro vivo sin su imagen o sin su comprobante. Al reves el peor caso
        es un archivo huerfano: molesto, pero no se pierde nada que importe.

   Y nada de esto puede tirar: cuando corre, el documento YA se borro. Que el
   archivo no se pueda sacar no convierte una operacion que salio bien en un
   error en la cara del usuario.
   ========================================================================== */

/* Un archivo del bucket, y no una ruta del repositorio ni una URL de afuera.
   Misma idea que esSubidaDelPanel() en la tienda. */
function esArchivoDeStorage(url) {
  return typeof url === 'string' &&
    /(firebasestorage\.googleapis\.com|\.firebasestorage\.app|storage\.googleapis\.com)/i
      .test(url);
}

/* Borra un archivo por su URL de descarga. Devuelve true si lo saco.
   No tira nunca: ver el comentario de arriba.

   `carpeta` es lo unico que separa esto de un borrado a ciegas. La url sale de
   un campo de Firestore, y este codigo no tiene forma de saber como llego ahi:
   hoy todas las fotos de producto pasan por uploadImage() y caen en
   'productos/', pero alcanza con una edicion a mano en la consola, un
   importador futuro o un bug para que en `imagen` termine la url de
   'site/hero.jpg' o de 'config/logo-factura.jpg' -que es UN archivo, el logo
   de la factura-. Borrar un producto no puede llevarse eso puesto.

   Confinarlo a su carpeta hace que esa clase entera sea imposible, sin
   depender de que todos los que escriban en el campo se porten bien. Lo mismo
   con el bucket: una url de otro proyecto de Firebase resuelve a OTRO bucket
   -lo comprobe-, y ahi no tenemos nada que hacer. */
async function borrarArchivoDeStorage(url, contexto, carpeta) {
  if (!esArchivoDeStorage(url)) return false;
  if (typeof storage === 'undefined' || !storage.refFromURL) return false;

  let ref;
  try {
    ref = storage.refFromURL(url);
  } catch (e) {
    /* Una url que no se puede interpretar tampoco se puede borrar. */
    console.warn('No se pudo interpretar la url del archivo, se deja como esta:', url);
    return false;
  }

  if (carpeta && String(ref.fullPath || '').indexOf(carpeta) !== 0) {
    console.warn('El archivo apunta fuera de "' + carpeta + '", no se toca:', ref.fullPath);
    return false;
  }
  try {
    const propio = storage.ref().bucket;
    if (propio && ref.bucket && ref.bucket !== propio) {
      console.warn('El archivo es de otro bucket, no se toca:', ref.bucket);
      return false;
    }
  } catch (e) { /* si no se puede saber cual es el nuestro, no bloquea */ }

  try {
    await ref.delete();
    return true;
  } catch (e) {
    /* Que ya no este es justo el estado que buscabamos. */
    if (e && e.code === 'storage/object-not-found') return true;
    console.warn((contexto || 'Se borro el registro') +
                 ' pero su archivo quedo en Storage:', url, e);
    return false;
  }
}

/* Todas las imagenes de un producto que viven en el bucket: la principal y
   las extra.

   imagenesExtra viene en DOS formas y hay que aguantar las dos: saveProduct
   la escribe como lista, pero quedan fichas viejas donde es un solo texto con
   un salto de linea entre cada url. El panel ya hace este mismo Array.isArray
   al abrir el formulario.

   Tratar una lista como texto no da error, y por eso es peligroso: String()
   la pega con comas, queda una sola cadena que igual contiene
   "firebasestorage", y de ahi salen dos cosas malas. Una, se le pide al bucket
   que borre una url inventada -no pasa nada, tira y se registra-. La otra si
   importa: al juntar las imagenes de los OTROS productos quedarian tambien
   pegadas, no coincidirian con ninguna url suelta, y el reparo de "esta
   imagen la usa otro" dejaria de reconocerla. O sea que se podria borrar una
   imagen que otro producto sigue usando, que es justo lo que hay que evitar. */
function imagenesDeProducto(p) {
  if (!p) return [];
  const extra = Array.isArray(p.imagenesExtra)
    ? p.imagenesExtra
    : String(p.imagenesExtra || '').split('\n');
  return [p.imagen].concat(extra)
    .map((u) => String(u || '').trim())
    .filter((u) => u && esArchivoDeStorage(u));
}

/* Las imagenes que el producto TENIA y ya no tiene. Sirve para los dos casos:
   borrarlo entero -no le queda ninguna- y editarlo cambiandole la foto.

   Tres cosas que hay que saltear, y ninguna es teorica:

     - Las que sigue teniendo. Si alguien mueve una imagen de principal a
       extra, la url no cambio de dueño: no se toca.
     - Las que usa OTRO producto. Alcanza con pegar la misma url subida en el
       campo de extras de otro. Si se borra, al otro le queda una imagen rota,
       y eso en la tienda no avisa: se ve el recuadro vacio y listo.
     - Las que no estan en el bucket, que las filtra imagenesDeProducto. Hoy
       medio catalogo comparte 'img/default-product.svg', una ruta del
       repositorio.

   El producto propio se saltea por id: cuando esto corre todavia esta en
   allProducts, y sin saltearlo creeria que su propia imagen esta en uso y no
   borraria nunca nada. */
async function borrarImagenesQueSobran(antes, despues, idProducto, motivo) {
  const tenia = imagenesDeProducto(antes);
  if (!tenia.length) return 0;

  const quedan = new Set(imagenesDeProducto(despues));
  const deOtros = new Set();
  (typeof allProducts !== 'undefined' ? allProducts : []).forEach((p) => {
    if (!p || p.id === idProducto) return;
    imagenesDeProducto(p).forEach((u) => deOtros.add(u));
  });

  let sacadas = 0;
  for (const url of tenia) {
    if (quedan.has(url) || deOtros.has(url)) continue;
    if (await borrarArchivoDeStorage(url, motivo || 'Se actualizo el producto',
                                     'productos/')) sacadas++;
  }
  return sacadas;
}

/* Borrar el producto entero es el mismo caso con un "despues" vacio. */
async function borrarImagenesDeProducto(prod, idBorrado) {
  return borrarImagenesQueSobran(prod, null, idBorrado, 'El producto se borro');
}

window.esArchivoDeStorage = esArchivoDeStorage;
window.borrarArchivoDeStorage = borrarArchivoDeStorage;
window.borrarImagenesQueSobran = borrarImagenesQueSobran;
window.borrarImagenesDeProducto = borrarImagenesDeProducto;
