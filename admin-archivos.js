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
   No tira nunca: ver el comentario de arriba. */
async function borrarArchivoDeStorage(url, contexto) {
  if (!esArchivoDeStorage(url)) return false;
  if (typeof storage === 'undefined' || !storage.refFromURL) return false;
  try {
    await storage.refFromURL(url).delete();
    return true;
  } catch (e) {
    /* Que ya no este es justo el estado que buscabamos. */
    if (e && e.code === 'storage/object-not-found') return true;
    console.warn((contexto || 'Se borro el registro') +
                 ' pero su archivo quedo en Storage:', url, e);
    return false;
  }
}

/* Todas las imagenes de un producto que viven en el bucket: la principal y las
   extra, que se guardan como un solo texto con un salto de linea entre cada
   una. */
function imagenesDeProducto(p) {
  if (!p) return [];
  return [p.imagen]
    .concat(String(p.imagenesExtra || '').split('\n'))
    .map((u) => String(u || '').trim())
    .filter((u) => u && esArchivoDeStorage(u));
}

/* Borra las imagenes de un producto que ya se elimino, salteando las que
   siguen usando otros productos.

   Esto ultimo no es teorico: hoy medio catalogo comparte la misma ruta de
   imagen por defecto. Esa no es de Storage y ya queda afuera por el filtro,
   pero alcanza con que alguien pegue la misma URL subida en dos productos para
   que borrar uno le deje al otro una imagen rota. Y una imagen rota en la
   tienda no avisa: se ve el recuadro vacio y listo. */
async function borrarImagenesDeProducto(prod, idBorrado) {
  const mias = imagenesDeProducto(prod);
  if (!mias.length) return 0;

  const deOtros = new Set();
  (typeof allProducts !== 'undefined' ? allProducts : []).forEach((p) => {
    if (!p || p.id === idBorrado) return;
    imagenesDeProducto(p).forEach((u) => deOtros.add(u));
  });

  let sacadas = 0;
  for (const url of mias) {
    if (deOtros.has(url)) continue;
    if (await borrarArchivoDeStorage(url, 'El producto se borro')) sacadas++;
  }
  return sacadas;
}

window.esArchivoDeStorage = esArchivoDeStorage;
window.borrarArchivoDeStorage = borrarArchivoDeStorage;
window.borrarImagenesDeProducto = borrarImagenesDeProducto;
