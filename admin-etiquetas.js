/* =============================================================================
   ETIQUETAS CON CÓDIGO DE BARRAS  —  Brotes Dietética
   =============================================================================
   POR QUÉ EXISTE

   El lector de códigos (admin-lector.js) sirve para lo que viene con código de
   fábrica: una yerba, un aceite. Pero en una dietética media góndola se fracciona
   en el local -semillas, frutos secos, granolas- y esa bolsa no tiene código ni lo
   va a tener nunca. Hoy eso se busca escribiendo el nombre en la caja.

   Acá el local imprime el suyo, se lo pega a la bolsa que armó, y desde ese
   momento el granel se escanea igual que un envasado.

   EL CÓDIGO NO SE GUARDA: SE DERIVA

   La etiqueta lleva un EAN-13 que sale del `codigo` del proveedor que el producto
   ya tiene. 000453 siempre da el mismo EAN-13, así que no hace falta escribir nada
   en Firestore, no hay un campo nuevo que se pueda desincronizar, y un producto que
   además tenga código de fábrica conserva los dos: el de fábrica en `codigoBarras`
   y el impreso derivado de su `codigo`.

   Se usa EAN-13 con prefijo 2 porque ese prefijo está reservado justamente para
   códigos internos de un comercio: ningún fabricante lo usa, así que un código
   nuestro no puede chocar con uno de verdad. Y porque TODO lector lee EAN-13 de
   fábrica, incluso los más baratos, sin configurarle nada.

   LO QUE ESTA ETIQUETA NO HACE

   No lleva el peso adentro. Se escanea y aparece el producto; los gramos se siguen
   pesando y tipeando. Para que trajera el peso habría que etiquetar cada bolsa en
   el momento de fraccionarla, con una balanza que imprima, y es otro trabajo.
   ============================================================================= */

/* --------------------------------------------------------------- EAN-13 ---
   Las tres tablas de la norma. Cada dígito son 7 módulos; el primer dígito no se
   dibuja: se codifica en el patrón de paridad de los seis siguientes. */
const ETQ_L = ['0001101', '0011001', '0010011', '0111101', '0100011',
               '0110001', '0101111', '0111011', '0110111', '0001011'];
const ETQ_G = ['0100111', '0110011', '0011011', '0100001', '0011101',
               '0111001', '0000101', '0010001', '0001001', '0010111'];
const ETQ_R = ['1110010', '1100110', '1101100', '1000010', '1011100',
               '1001110', '1010000', '1000100', '1001000', '1110100'];
const ETQ_PARIDAD = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG',
                     'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];

/* El prefijo que la norma reserva para uso interno de un comercio. */
const ETQ_PREFIJO = '2';

/* Dígito verificador: se suman los 12 primeros alternando x1 y x3, y el
   verificador es lo que falta para llegar a la decena. */
function etiquetaDigitoVerificador(base12) {
  const d = String(base12);
  if (!/^\d{12}$/.test(d)) return null;
  let suma = 0;
  for (let i = 0; i < 12; i++) suma += Number(d[i]) * (i % 2 === 0 ? 1 : 3);
  return String((10 - (suma % 10)) % 10);
}

/* El EAN-13 de un producto, derivado de su código de proveedor. Sin código no hay
   etiqueta: no se inventa uno, porque un número inventado no lo puede volver a
   encontrar nadie. */
function etiquetaCodigoDe(p) {
  if (!p) return null;
  const cod = String(p.codigo == null ? '' : p.codigo).trim();
  if (!/^\d{1,11}$/.test(cod)) return null;
  const base = ETQ_PREFIJO + cod.padStart(11, '0');
  const v = etiquetaDigitoVerificador(base);
  return v == null ? null : base + v;
}

/* El camino de vuelta, que es el que usa el lector: de lo que escaneó al producto.
   Solo reconoce los nuestros -prefijo 2 y verificador correcto-, así que un código
   de fábrica que empiece con 2 mal formado no se confunde con uno propio. */
function etiquetaProductoDe(escaneado, productos) {
  const c = String(escaneado == null ? '' : escaneado).trim();
  if (!/^\d{13}$/.test(c)) return null;
  if (c[0] !== ETQ_PREFIJO) return null;
  if (etiquetaDigitoVerificador(c.slice(0, 12)) !== c[12]) return null;
  const n = parseInt(c.slice(1, 12), 10);
  if (!isFinite(n)) return null;
  const cod = String(n).padStart(6, '0');
  return (productos || []).find(p =>
    String(p.codigo == null ? '' : p.codigo).trim().padStart(6, '0') === cod) || null;
}

/* =============================================================================
   EL CODIGO DE BARRAS DEL PRODUCTO  —  el que trae impreso el envase
   =============================================================================
   Ojo con no confundir esto con etiquetaCodigoDe(), que esta arriba y hace otra
   cosa: deriva un EAN-13 del codigo INTERNO para las etiquetas que imprime el
   propio local.

   Son dos numeros distintos y no se pueden mezclar. El campo "Codigo de barras"
   de la ficha es el del fabricante, y es el unico con el que escanea la pistola
   (ver admin-lector.js). El preview que esta debajo de ese campo se dibujaba con
   etiquetaCodigoDe(), o sea con el codigo interno: un producto con codigo 002022
   y sin codigo de barras mostraba el simbolo 2000000020228 como si fuera SU
   codigo de barras. No lo es, y peor: era el mismo dibujo antes y despues de
   cargarle el de verdad.

   Sin codigo de barras cargado no hay simbolo que dibujar. No se inventa uno.
   ============================================================================= */

/* El codigo de barras del producto, listo para dibujar, o null si no tiene.
   NUNCA mira `codigo`. Un UPC-A de 12 digitos es un EAN-13 con un cero adelante,
   que es como lo trata cualquier lector. */
function codigoBarrasDe(p) {
  const c = String((p && p.codigoBarras) == null ? '' : p.codigoBarras).replace(/[\s-]/g, '');
  if (!/^\d+$/.test(c)) return null;
  if (c.length === 13) return c;
  if (c.length === 12) return '0' + c;
  return null;
}

/* Un EAN-13 mal tipeado se dibuja igual y sale un simbolo plausible que ninguna
   pistola acepta: el verificador no cierra y el lector lo descarta en silencio.
   Se comprueba antes de ofrecer imprimirlo. */
function codigoBarrasCierra(ean13) {
  const c = String(ean13 || '');
  return /^\d{13}$/.test(c) && etiquetaDigitoVerificador(c.slice(0, 12)) === c[12];
}

/* Los 95 módulos del símbolo, sin las zonas mudas. */
function etiquetaModulos(codigo13) {
  const c = String(codigo13);
  if (!/^\d{13}$/.test(c)) return null;
  const par = ETQ_PARIDAD[Number(c[0])];
  let bits = '101';
  for (let i = 1; i <= 6; i++) bits += (par[i - 1] === 'L' ? ETQ_L : ETQ_G)[Number(c[i])];
  bits += '01010';
  for (let i = 7; i <= 12; i++) bits += ETQ_R[Number(c[i])];
  return bits + '101';
}

/* ------------------------------------------------------------------ dibujo ---
   SVG y no imagen: imprime nítido a cualquier tamaño y no depende de la red.

   Las ZONAS MUDAS son obligatorias, no decorativas: sin el blanco a los costados
   el lector no encuentra dónde empieza el símbolo. La norma pide 11 módulos a la
   izquierda y 7 a la derecha, y por eso están dentro del viewBox y no como margen
   CSS, que al recortar la hoja se pierde. */
const ETQ_MUDA_IZQ = 11, ETQ_MUDA_DER = 7;

function etiquetaBarrasSVG(codigo13, altoMm, anchoMm) {
  const bits = etiquetaModulos(codigo13);
  if (!bits) return '';
  const total = ETQ_MUDA_IZQ + 95 + ETQ_MUDA_DER;
  /* El alto del viewBox NO puede ser un número fijo. El SVG se dibuja con
     preserveAspectRatio, así que si la caja interna tiene otra proporción que los
     mm pedidos, el símbolo se encoge para entrar: con un alto fijo de 100 unidades
     una etiqueta de 63 x 15 mm dibujaba el código a 17 mm de ancho, menos del
     mínimo que la norma permite, y a esa medida los lectores fallan.
     Haciendo que la proporción coincida, el código ocupa exactamente lo pedido. */
  const H = total * (Number(altoMm) / Number(anchoMm));
  const hBarra = H * 0.78;       /* las de datos */
  const hGuarda = H * 0.86;      /* las de guarda bajan un poco más */
  const esGuarda = (i) => (i < 3) || (i >= 45 && i < 50) || (i >= 92);

  let rects = '';
  for (let i = 0; i < bits.length; i++) {
    if (bits[i] !== '1') continue;
    rects += '<rect x="' + (ETQ_MUDA_IZQ + i) + '" y="0" width="1" height="' +
             (esGuarda(i) ? hGuarda : hBarra).toFixed(1) + '"/>';
  }

  /* Los dígitos, como los espera el ojo: el primero afuera a la izquierda, y los
     otros dos grupos de seis debajo de su mitad. */
  const c = String(codigo13);
  const fs = H * 0.20;
  const txt = (x, s, anchor) =>
    '<text x="' + x.toFixed(1) + '" y="' + H + '" font-family="Helvetica,Arial,sans-serif" ' +
    'font-size="' + fs.toFixed(1) + '" text-anchor="' + (anchor || 'middle') + '">' + s + '</text>';

  let textos = txt(ETQ_MUDA_IZQ - 2, c[0], 'end');
  textos += txt(ETQ_MUDA_IZQ + 3 + 21, c.slice(1, 7));
  textos += txt(ETQ_MUDA_IZQ + 50 + 21, c.slice(7));

  return '<svg class="etq-bc" viewBox="0 0 ' + total + ' ' + H + '" ' +
         'width="' + anchoMm + 'mm" height="' + altoMm + 'mm" ' +
         'preserveAspectRatio="xMidYMid meet" shape-rendering="crispEdges" ' +
         'xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="' + total +
         '" height="' + H + '" fill="#fff"/><g fill="#000">' + rects + textos + '</g></svg>';
}

/* ----------------------------------------------------------------- formatos ---
   Medidas en mm. Las de hoja son las plantillas autoadhesivas que se consiguen en
   cualquier librería; las térmicas, los rollos más comunes. `filas` y `columnas`
   solo importan en hoja: en térmica va una etiqueta por página. */
/* Medidas de planchas que existen de verdad, no inventadas: las de 24 y 14 son
   las Avery L7159 y L7173, y las otras dos sus equivalentes comunes. Cada una
   tiene que ENTRAR en el A4 -filas x alto + margenes <= 297 mm-; si no entra, la
   ultima fila se va a una segunda hoja y se desalinea toda la plancha, que es
   perder una plancha entera de autoadhesivo. Hay una prueba que lo verifica. */
const ETQ_FORMATOS = [
  { id: 'a4-3x8',  nombre: 'Hoja A4 · 24 por hoja (63,5 × 33,9 mm)',
    hoja: 'A4', columnas: 3, filas: 8, ancho: 63.5, alto: 33.9, margenH: 7.2, margenV: 12.7 },
  { id: 'a4-2x7',  nombre: 'Hoja A4 · 14 por hoja (99,1 × 38,1 mm)',
    hoja: 'A4', columnas: 2, filas: 7, ancho: 99.1, alto: 38.1, margenH: 5.9, margenV: 15.1 },
  { id: 'a4-4x10', nombre: 'Hoja A4 · 40 por hoja (52,5 × 29,7 mm)',
    hoja: 'A4', columnas: 4, filas: 10, ancho: 52.5, alto: 29.7, margenH: 0, margenV: 0 },
  { id: 'a4-5x13', nombre: 'Hoja A4 · 65 por hoja (38,1 × 21,2 mm)',
    hoja: 'A4', columnas: 5, filas: 13, ancho: 38.1, alto: 21.2, margenH: 4.75, margenV: 10.7 },
  { id: 'ter-58x40', nombre: 'Térmica · rollo 58 × 40 mm',
    hoja: 'termica', columnas: 1, filas: 1, ancho: 58, alto: 40, margenH: 0, margenV: 0 },
  { id: 'ter-50x30', nombre: 'Térmica · rollo 50 × 30 mm',
    hoja: 'termica', columnas: 1, filas: 1, ancho: 50, alto: 30, margenH: 0, margenV: 0 },
  /* La etiqueta adhesiva térmica más común (pedido del dueño, 28/09/2026). El código sale
     al 123%: entra de sobra. */
  { id: 'ter-50x25', nombre: 'Térmica · rollo 50 × 25 mm',
    hoja: 'termica', columnas: 1, filas: 1, ancho: 50, alto: 25, margenH: 0, margenV: 0 },
  { id: 'ter-40x30', nombre: 'Térmica · rollo 40 × 30 mm',
    hoja: 'termica', columnas: 1, filas: 1, ancho: 40, alto: 30, margenH: 0, margenV: 0 },
  { id: 'custom', nombre: 'Personalizado...', hoja: 'A4',
    columnas: 3, filas: 8, ancho: 63.5, alto: 33.9, margenH: 7.2, margenV: 12.7 },
];


function etiquetaFormato(id) {
  return ETQ_FORMATOS.find(f => f.id === id) || ETQ_FORMATOS[0];
}

/* Con el alto de la etiqueta se decide cuánto puede medir el símbolo. Por debajo
   de unos 10 mm de alto de barra los lectores empiezan a fallar, así que si la
   etiqueta es muy chica se le saca texto antes que achicar el código. */
/* El EAN-13 mide 37,3 mm de ancho al 100%, zonas mudas incluidas, y la norma
   permite achicarlo hasta el 80%: 29,8 mm. Por debajo de eso el módulo queda más
   fino que lo que resuelve un lector barato y la etiqueta no sirve. */
const ETQ_ANCHO_MIN = 30;
const ETQ_ANCHO_MAX = 48;

function etiquetaMedidas(f) {
  const alto = Number(f.alto) || 37;
  const ancho = Number(f.ancho) || 70;
  const bcAncho = Math.max(ETQ_ANCHO_MIN, Math.min(ETQ_ANCHO_MAX, ancho - 4));
  return {
    bcAncho: bcAncho,
    bcAlto: Math.max(9, Math.min(18, alto * 0.40)),
    /* Si la etiqueta es más angosta que el mínimo, el código se dibuja igual al
       mínimo y se sale del papel: es preferible que se note a que salga chico y
       no escanee. Se avisa antes de imprimir. */
    angosta: ancho - 4 < ETQ_ANCHO_MIN,
    chico: alto < 26 || ancho < 45,
    /* El ancho de un módulo, que es lo que decide cuánto margen tiene el
       símbolo. El nominal de la norma es 0,33 mm -el 100%- y se puede achicar
       hasta el 80%. Todos los formatos de acá quedan entre el 91% y el 129%, o
       sea dentro de norma; `justo` marca los que van por debajo del nominal, que
       son los que menos margen dejan si la impresora ensancha las barras.
       Se verificó rasterizando a 203, 300 y 600 DPI y decodificando los píxeles:
       leen todos. El aviso es por el margen, no porque falle. */
    moduloMm: bcAncho / 113,
    justo: (bcAncho / 113) < 0.33,
  };
}


/* ------------------------------------------------------------------ la etiqueta */
function etiquetaHTML(p, f, opciones) {
  const o = opciones || {};
  /* `barras` = imprimir el codigo de barras DEL PRODUCTO (el del envase). Sin la
     bandera se usa el derivado del codigo interno, que es para que sirve la
     seccion Etiquetas: hacerle una etiqueta a lo que no trae ninguna. */
  const ean = o.barras ? codigoBarrasDe(p) : etiquetaCodigoDe(p);
  if (!ean) return '';
  const m = etiquetaMedidas(f);
  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const nombre = String(p.nombreMostrado || p.nombre || '').trim();
  const porPeso = p.tipoVenta === 'peso';
  const precio = Number(p.precio || 0);

  let h = '<div class="etq"><div class="etq-nom">' + esc(nombre) + '</div>';
  if (!m.chico && p.gramaje) h += '<div class="etq-sub">' + esc(p.gramaje) + '</div>';
  if (o.precio && precio > 0) {
    h += '<div class="etq-precio">$' + precio.toLocaleString('es-AR') +
         (porPeso ? '<span class="etq-kg"> el kilo</span>' : '') + '</div>';
  }
  h += etiquetaBarrasSVG(ean, m.bcAlto, m.bcAncho);
  if (!m.chico && o.codigoInterno && p.codigo) {
    h += '<div class="etq-cod">cód. ' + esc(p.codigo) + '</div>';
  }
  return h + '</div>';
}

/* Los estilos de la ventana de impresión. Se arman con las medidas del formato
   elegido, por eso son una función y no una hoja fija. */
function etiquetaEstilos(f) {
  const esTermica = f.hoja === 'termica';
  const m = etiquetaMedidas(f);
  const base =
    'html,body{margin:0;padding:0;background:#fff}' +
    '*{box-sizing:border-box}' +
    'body{font-family:Helvetica,Arial,sans-serif;color:#000;-webkit-print-color-adjust:exact;print-color-adjust:exact}' +
    '.etq{width:' + f.ancho + 'mm;height:' + f.alto + 'mm;padding:1.5mm;overflow:hidden;' +
      'display:flex;flex-direction:column;align-items:center;justify-content:center;' +
      'text-align:center;page-break-inside:avoid;break-inside:avoid}' +
    /* El nombre puede ser largo: se deja en dos renglones y se corta, nunca se   */
    /* deja que empuje al código fuera de la etiqueta.                            */
    '.etq-nom{font-weight:700;font-size:' + (m.chico ? 6.5 : 8) + 'pt;line-height:1.15;' +
      'max-height:2.4em;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;' +
      '-webkit-box-orient:vertical;width:100%}' +
    '.etq-sub{font-size:' + (m.chico ? 5.5 : 6.5) + 'pt;color:#333;line-height:1.1}' +
    '.etq-precio{font-weight:700;font-size:' + (m.chico ? 7.5 : 10) + 'pt;margin:0.3mm 0}' +
    '.etq-kg{font-weight:400;font-size:0.68em}' +
    '.etq-cod{font-size:5.5pt;color:#666;letter-spacing:0.4px}' +
    '.etq-bc{display:block;margin-top:0.4mm}' +
    /* La etiqueta con peso (etiquetaPesoHTML): el peso y el precio, y debajo el kilo y la fecha. */
    '.etqp-linea{font-weight:700;font-size:' + (m.chico ? 7.5 : 9.5) + 'pt;line-height:1.15;margin-top:0.2mm}' +
    '.etqp-det{font-size:' + (m.chico ? 5.5 : 6.5) + 'pt;color:#000;line-height:1.15}' +
    '.etqp-nom1{-webkit-line-clamp:1;max-height:1.2em}' +
    '.etqp .etq-bc{flex-shrink:0}';

  if (esTermica) {
    /* EN LA TÉRMICA NO HAY GRISES: el cabezal pone un punto negro o no pone nada, y el
       gris lo imita salteando puntos. En letra chica -el gramaje en #333, el código en
       #666- eso sale desflecado y cuesta leerlo. En la térmica va todo en negro
       (pedido del dueño, 28/09/2026: etiquetas en papel térmico adhesivo). */
    const negro = '.etq-sub,.etq-cod{color:#000}';
    /* DOS CLASES DE ROLLO, Y LA DIFERENCIA IMPORTA MUCHO.

       a) TROQUELADO: el rollo ya viene cortado en etiquetas. Cada una tiene que
          ser su propia pagina para que el papel avance justo una etiqueta.

       b) CONTINUO: el rollo es una tira lisa, la misma que se usa para los
          tickets. Ahi "una etiqueta = una pagina" es lo PEOR que se puede hacer:
          las impresoras con guillotina cortan al terminar cada pagina, asi que
          imprimir treinta codigos deja treinta papelitos sueltos y gasta el
          triple de papel. En continuo van todas en UNA sola pagina, una debajo
          de la otra con una separacion chica para poder tijeretear, y la maquina
          corta una sola vez al final.

       No se puede adivinar cual tiene el comercio: lo elige el, y por defecto va
       continuo, que es el que no rompe nada -en un rollo troquelado sale corrido,
       molesto pero recuperable; al reves se cortan treinta etiquetas sanas-. */
    if (f.continuo) {
      const sep = (typeof f.separacion === 'number') ? f.separacion : 2;
      return base + negro +
        /* Alto auto: la tira mide lo que sume, y es UNA sola pagina. */
        '@page{size:' + f.ancho + 'mm auto;margin:0}' +
        '.etq{page-break-after:auto;break-after:auto;height:' + f.alto + 'mm;' +
          'margin-bottom:' + sep + 'mm}' +
        '.etq:last-child{margin-bottom:0}';
    }
    return base + negro +
      '@page{size:' + f.ancho + 'mm ' + f.alto + 'mm;margin:0}' +
      '.etq{page-break-after:always;break-after:page}' +
      '.etq:last-child{page-break-after:auto;break-after:auto}';
  }
  return base +
    '@page{size:A4;margin:' + f.margenV + 'mm ' + f.margenH + 'mm}' +
    '.etq-hoja{display:grid;grid-template-columns:repeat(' + f.columnas + ',' + f.ancho + 'mm);' +
      'grid-auto-rows:' + f.alto + 'mm;justify-content:center}' +
    '.etq-pag{page-break-after:always;break-after:page}' +
    '.etq-pag:last-child{page-break-after:auto;break-after:auto}';
}

/* Arma el documento entero. `pedidos` son pares {producto, copias}. */
function etiquetaDocumento(pedidos, f, opciones) {
  const etqs = [];
  (pedidos || []).forEach(x => {
    const html = etiquetaHTML(x.producto, f, opciones);
    if (!html) return;
    const n = Math.max(1, Math.min(500, Number(x.copias) || 1));
    for (let i = 0; i < n; i++) etqs.push(html);
  });
  if (!etqs.length) return '';
  if (f.hoja === 'termica') return etqs.join('');

  const porHoja = Math.max(1, (Number(f.columnas) || 1) * (Number(f.filas) || 1));
  let out = '';
  for (let i = 0; i < etqs.length; i += porHoja) {
    out += '<div class="etq-pag"><div class="etq-hoja">' +
           etqs.slice(i, i + porHoja).join('') + '</div></div>';
  }
  return out;
}

/* Cuántas etiquetas salen y cuántas hojas gasta. Se muestra antes de imprimir
   porque mandar 40 hojas sin querer a la impresora es plata. */
function etiquetaResumen(pedidos, f) {
  const total = (pedidos || []).reduce((n, x) =>
    n + Math.max(1, Math.min(500, Number(x.copias) || 1)), 0);
  const porHoja = f.hoja === 'termica' ? 1
    : Math.max(1, (Number(f.columnas) || 1) * (Number(f.filas) || 1));
  return { etiquetas: total, hojas: Math.ceil(total / porHoja), porHoja: porHoja };
}

/* Dos productos con el mismo `codigo` derivan LA MISMA etiqueta, y escanearla
   devolvería cualquiera de los dos. La migración de FRUTICOR asignó códigos libres
   y verificó que no chocaran, así que hoy no pasa; pero nada impide cargar a mano
   un código repetido, y el informe de duplicados compara nombres, no códigos. Se
   detecta acá, que es donde muerde: antes de imprimir doscientas etiquetas. */
function etiquetaAmbiguos(pedidos, productos) {
  const norma = (p) => String(p && p.codigo != null ? p.codigo : '').trim().padStart(6, '0');
  const cuenta = {};
  (productos || []).forEach(p => {
    const c = norma(p);
    if (c && etiquetaCodigoDe(p)) cuenta[c] = (cuenta[c] || 0) + 1;
  });
  return (pedidos || [])
    .filter(x => x.producto && cuenta[norma(x.producto)] > 1)
    .map(x => ({ nombre: x.producto.nombreMostrado || x.producto.nombre,
                 codigo: x.producto.codigo, cuantos: cuenta[norma(x.producto)] }));
}

/* Los que no pueden tener etiqueta, y por qué. Callarlo haría que alguien
   imprimiera 30 y creyera que salieron 32. */
function etiquetaSinCodigo(productos) {
  return (productos || []).filter(p => !etiquetaCodigoDe(p));
}

/* =========================== LA PANTALLA ===========================
   La selección vive acá, en un objeto, y NO en los checkboxes. Si viviera en el
   DOM, filtrar la lista borraría lo elegido: se marcan diez, se busca otra cosa,
   y al volver no quedaba nada. Ya pasó en el buscador de proveedores. */
let _etqSel = {};          /* { idProducto: copias } */
let _etqFormato = 'a4-3x8';
let _etqSoloPeso = false;
let _etqBusqueda = '';
let _etqLista = '';

/* LO ÚLTIMO QUE SE USÓ, RECORDADO (revisión del 28/09/2026). Un local tiene una impresora
   y un tipo de rollo: si al abrir el panel vuelve siempre a "Hoja A4" y a "Rollo continuo"
   tildado, un rollo de etiquetas ya cortadas sale como tira corrida y se pierde esa tanda.
   Se guarda al imprimir y se pone la primera vez que se abre la ventana. Solo en este
   navegador, como la hoja de la ficha (ETQ_HOJA_FICHA_KEY). */
const ETQ_ULTIMO_KEY = 'brotesEtqUltimo';
const ETQ_ULTIMO_CAMPOS = ['etqSeparacion', 'etqCustomAncho', 'etqCustomAlto', 'etqCustomCols',
  'etqCustomFilas', 'etqCustomMargenH', 'etqCustomMargenV'];
let _etqUltimoPuesto = false;
function _etqGuardarUltimo() {
  try {
    const campos = {};
    ETQ_ULTIMO_CAMPOS.forEach(id => { const el = document.getElementById(id); if (el) campos[id] = String(el.value); });
    const cont = document.getElementById('etqContinuo');
    const ter = document.getElementById('etqCustomTermica');
    localStorage.setItem(ETQ_ULTIMO_KEY, JSON.stringify({
      formato: _etqFormato, continuo: cont ? !!cont.checked : true, termica: ter ? !!ter.checked : false, campos: campos }));
  } catch (e) { /* sin guardar: la próxima vez arranca como siempre */ }
}
function _etqPonerUltimo() {
  let u = null;
  try { u = JSON.parse(localStorage.getItem(ETQ_ULTIMO_KEY) || 'null'); } catch (e) { u = null; }
  if (!u || typeof u !== 'object') return;
  if (ETQ_FORMATOS.some(f => f.id === u.formato)) _etqFormato = u.formato;
  const cont = document.getElementById('etqContinuo');
  if (cont && typeof u.continuo === 'boolean') cont.checked = u.continuo;
  const ter = document.getElementById('etqCustomTermica');
  if (ter && typeof u.termica === 'boolean') ter.checked = u.termica;
  const campos = (u.campos && typeof u.campos === 'object') ? u.campos : {};
  ETQ_ULTIMO_CAMPOS.forEach(id => {
    const el = document.getElementById(id);
    if (el && campos[id] != null && campos[id] !== '' && isFinite(Number(campos[id]))) el.value = String(campos[id]);
  });
}

/* ============ EL CODIGO DE BARRAS DENTRO DE LA FICHA DEL PRODUCTO ============
   Ver como va a salir la etiqueta ANTES de imprimir doscientas. El simbolo no se
   "ve mal" cuando esta mal: sale un dibujo de barras perfectamente plausible que
   la pistola no engancha. Por eso el preview usa el MISMO etiquetaBarrasSVG que
   la impresion, no un dibujo aparte. */
function _prodDelFormulario() {
  const g = id => (document.getElementById(id) || {}).value;
  return {
    codigo: g('pCodigo'),
    codigoBarras: g('pCodigoBarras'),
    nombre: g('pNombre'),
    nombreMostrado: g('pNombreMostrado'),
    gramaje: g('pGramaje'),
    precio: Number(String(g('pPrecio') || '').replace(/[^\d.-]/g, '')) || 0,
    tipoVenta: (document.querySelector('.tv-toggle .active') || {}).dataset
      ? (document.querySelector('.tv-toggle .active').dataset.tv || 'unidad') : 'unidad'
  };
}

/* CERO TRECE VECES: lo que se muestra mientras el producto no tiene codigo de
   barras. Van los digitos como texto y NO un simbolo dibujado, aunque
   0000000000000 sea un EAN-13 valido: un simbolo ahi invita a imprimirlo, y una
   bolsa con esa etiqueta pegada no la encuentra nunca nadie. */
const CB_SIN_CARGAR = '0000000000000';

/* Se redibuja al escribir o escanear el CODIGO DE BARRAS, que es el unico campo
   del que depende. Antes se redibujaba al escribir el codigo interno, porque era
   de ahi de donde salia el simbolo: cargarle el codigo de barras de verdad no
   cambiaba el dibujo, y el que estaba en pantalla no era de ese producto. */
function refrescarBarrasProducto() {
  const wrap = document.getElementById('pBarrasWrap');
  const cont = document.getElementById('pBarrasSvg');
  const vacio = document.getElementById('pBarrasVacio');
  const btn = document.getElementById('btnImprimirEtqProd');
  const aviso = document.getElementById('pBarrasAviso');
  if (!wrap || !cont) return;
  const p = _prodDelFormulario();
  const ean = codigoBarrasDe(p);
  const crudo = String(p.codigoBarras == null ? '' : p.codigoBarras).trim();

  wrap.style.display = '';
  if (aviso) { aviso.style.display = 'none'; aviso.textContent = ''; }

  /* SIN CODIGO DE BARRAS: los ceros, y sin boton de imprimir. */
  if (!ean) {
    if (btn) btn.style.display = 'none';
    if (vacio) vacio.style.display = '';
    cont.innerHTML =
      '<div style="font:700 11px Helvetica,Arial,sans-serif;color:#000;margin-bottom:2px">' +
        esc(p.nombreMostrado || p.nombre || '') + '</div>' +
      '<div style="font:400 15px/1.2 ui-monospace,Consolas,monospace;letter-spacing:.18em;' +
        'color:#bbb;padding:10px 0 2px">' + CB_SIN_CARGAR + '</div>';
    if (crudo && aviso) {
      aviso.style.display = '';
      aviso.textContent = 'Ese codigo de barras no se puede dibujar: tiene que ser de 13 digitos ' +
        '(o 12, si es un UPC). Escaneá el envase con el cursor en el campo y se completa solo.';
    }
    return;
  }

  if (vacio) vacio.style.display = 'none';
  cont.innerHTML =
    '<div style="font:700 11px Helvetica,Arial,sans-serif;color:#000;margin-bottom:2px">' +
      esc(p.nombreMostrado || p.nombre || '') + '</div>' +
    /* etiquetaBarrasSVG ya dibuja los digitos debajo de las barras: agregarlos de
       nuevo los mostraba dos veces. */
    etiquetaBarrasSVG(ean, 12, 45);

  /* El verificador no cierra: se ve el simbolo -para que se note que esta ahi-
     pero no se ofrece imprimirlo, porque ninguna pistola lo va a aceptar. */
  if (!codigoBarrasCierra(ean)) {
    if (btn) btn.style.display = 'none';
    if (aviso) {
      aviso.style.display = '';
      aviso.textContent = 'Este codigo no cierra: el ultimo digito no es el que le corresponde. ' +
        'Reviselo contra el envase, porque asi ninguna pistola lo va a leer.';
    }
    return;
  }
  if (btn) btn.style.display = '';
}

/* El boton de la ficha: revisa el codigo de barras, pregunta la hoja y cuantas
   (pedirHojaEtiquetas) e imprime la hoja llena (imprimirHojaEtiquetas). Antes
   imprimia UNA etiqueta con el formato termico, que en una impresora comun era una
   sola etiqueta en toda la hoja. */
async function imprimirEtiquetaProducto() {
  const p = _prodDelFormulario();
  const ean = codigoBarrasDe(p);
  if (!ean) {
    if (typeof showAdminToast === 'function') showAdminToast('Este producto no tiene codigo de barras cargado. Escanea el envase con el cursor en ese campo.', 'error');
    return;
  }
  if (!codigoBarrasCierra(ean)) {
    if (typeof showAdminToast === 'function') showAdminToast('Ese codigo de barras no cierra: el ultimo digito no es el que le corresponde. Revisalo contra el envase.', 'error');
    return;
  }
  const o = await pedirHojaEtiquetas(p);
  if (!o) return;
  try { localStorage.setItem(ETQ_HOJA_FICHA_KEY, o.formatoId); } catch (e) { /* sin guardar: queda la de siempre */ }
  imprimirHojaEtiquetas(p, o);
}

/* IMPRIMIR DESDE LA FICHA: UNA HOJA LLENA. Pedido del comercio (26/09/2026): el boton
   imprimia UNA etiqueta con el formato del rollo termico, y en la impresora comun salia
   una sola etiqueta en toda la hoja. Ahora se elige la hoja (las planchas A4 de la
   seccion Etiquetas) y cuantas, y sale la hoja entera con el codigo de barras de este
   producto. La hoja elegida se recuerda para la proxima. */
const ETQ_HOJA_FICHA_KEY = 'brotesEtqHojaFicha';
const ETQ_HOJAS_MAX = 5;
function _etqHojasA4() { return ETQ_FORMATOS.filter(f => f.hoja === 'A4' && f.id !== 'custom'); }
function _etqHojaFichaGuardada() {
  let id = 'a4-3x8';
  try { id = localStorage.getItem(ETQ_HOJA_FICHA_KEY) || id; } catch (e) { /* la de siempre */ }
  return _etqHojasA4().some(f => f.id === id) ? id : 'a4-3x8';
}
/* Cuantas etiquetas salen: las que entran en la hoja, por la cantidad de hojas. */
function etiquetasDeHojas(formatoId, hojas) {
  const f = etiquetaFormato(formatoId);
  const n = Math.max(1, Math.min(ETQ_HOJAS_MAX, parseInt(hojas, 10) || 1));
  return { formato: f, hojas: n, porHoja: Math.max(1, f.columnas * f.filas), copias: Math.max(1, f.columnas * f.filas) * n };
}

/* El dialogo: que hoja, cuantas y si va el precio. Devuelve { formatoId, hojas, precio }
   o null si se cancela. Con la forma de los otros dialogos del panel. */
function pedirHojaEtiquetas(p) {
  return new Promise(resolve => {
    const hojas = _etqHojasA4();
    const guardada = _etqHojaFichaGuardada();
    const conPrecio = Number(p.precio) > 0;
    const ov = document.createElement('div');
    ov.className = 'dlg-overlay';
    const abiertos = (typeof _dlgAbiertos === 'number') ? _dlgAbiertos : 0;
    ov.style.zIndex = String(400 + abiertos);
    if (typeof _dlgAbiertos === 'number') _dlgAbiertos++;
    ov.innerHTML =
      '<div class="dlg-box" role="dialog" aria-modal="true">' +
        '<div class="dlg-cab"><span class="dlg-ico"><i class="bi bi-printer"></i></span><h3>Imprimir etiquetas</h3></div>' +
        '<div class="dlg-msg">' +
          '<p class="dlg-linea"><b>' + esc(p.nombreMostrado || p.nombre || '') + '</b></p>' +
          '<p class="dlg-linea" style="color:var(--text-dim);font-size:0.83rem">Sale la hoja entera con el código de barras de este producto.</p>' +
          '<label class="etqh-campo"><span>Hoja</span><select class="form-input etqh-hoja">' +
            hojas.map(f => '<option value="' + f.id + '"' + (f.id === guardada ? ' selected' : '') + '>' + esc(f.nombre) + '</option>').join('') +
          '</select></label>' +
          '<label class="etqh-campo"><span>Cuántas hojas</span><input type="number" class="form-input etqh-n" min="1" max="' + ETQ_HOJAS_MAX + '" step="1" value="1" inputmode="numeric"></label>' +
          (conPrecio ? '<label class="etqh-check"><input type="checkbox" class="etqh-precio" checked> Con el precio ($' +
            Number(p.precio).toLocaleString('es-AR') + (p.tipoVenta === 'peso' ? ' el kilo' : '') + ')</label>' : '') +
          '<div class="etqh-resumen" aria-live="polite"></div>' +
        '</div>' +
        '<div class="dlg-pie">' +
          '<button type="button" class="btn btn-secondary dlg-no">Cancelar</button>' +
          '<button type="button" class="btn btn-primary dlg-si"><i class="bi bi-printer"></i> Imprimir</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(ov);
    const sel = ov.querySelector('.etqh-hoja');
    const n = ov.querySelector('.etqh-n');
    const pre = ov.querySelector('.etqh-precio');
    const res = ov.querySelector('.etqh-resumen');
    let cerrado = false;
    const leer = () => ({ formatoId: sel.value, hojas: etiquetasDeHojas(sel.value, n.value).hojas, precio: !!(pre && pre.checked) });
    const pintar = () => {
      const c = etiquetasDeHojas(sel.value, n.value);
      res.textContent = 'Van a salir ' + c.copias + ' etiquetas: ' + (c.hojas === 1 ? '1 hoja completa.' : c.hojas + ' hojas completas.');
    };
    const cerrar = v => {
      if (cerrado) return;
      cerrado = true;
      if (typeof _dlgAbiertos === 'number') _dlgAbiertos = Math.max(0, _dlgAbiertos - 1);
      document.removeEventListener('keydown', onTecla, true);
      ov.remove();
      resolve(v);
    };
    function onTecla(e) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cerrar(null); }
      else if (e.key === 'Enter') {
        /* El Enter de la pistola no imprime nada (ver enterDeRafaga, admin-lector.js). */
        if (typeof enterDeRafaga === 'function' && enterDeRafaga(e)) { e.preventDefault(); return; }
        e.preventDefault();
        cerrar(leer());
      }
    }
    sel.addEventListener('change', pintar);
    n.addEventListener('input', pintar);
    ov.querySelector('.dlg-si').addEventListener('click', () => cerrar(leer()));
    ov.querySelector('.dlg-no').addEventListener('click', () => cerrar(null));
    ov.addEventListener('mousedown', e => { if (e.target === ov) cerrar(null); });
    document.addEventListener('keydown', onTecla, true);
    pintar();
    setTimeout(() => { const b = ov.querySelector('.dlg-si'); if (b) b.focus(); }, 30);
  });
}

/* La hoja entera, con el mismo motor que la impresion en tanda: si el simbolo sale bien
   en la ficha, sale bien aca. */
function imprimirHojaEtiquetas(p, o) {
  const c = etiquetasDeHojas(o && o.formatoId, o && o.hojas);
  const f = c.formato;
  const cuerpo = etiquetaDocumento([{ producto: p, copias: c.copias }], f, { precio: !!(o && o.precio), barras: true });
  if (!cuerpo) { if (typeof showAdminToast === 'function') showAdminToast('No se pudo armar la etiqueta', 'error'); return; }
  const win = window.open('', '_blank', 'width=900,height=700');
  if (!win) { if (typeof showAdminToast === 'function') showAdminToast('El navegador bloqueo la ventana de impresion', 'error'); return; }
  win.document.write('<html><head><title>Etiquetas</title><style>' +
    etiquetaEstilos(f) + '</style></head><body>' + cuerpo + '</body></html>');
  win.document.close();
  win.focus();
  setTimeout(function () { win.print(); }, 350);
  if (typeof logAction === 'function') {
    logAction('imprimir', 'Etiquetas de "' + (p.nombreMostrado || p.nombre || p.codigo) + '"',
      c.copias + ' etiquetas (' + c.hojas + (c.hojas === 1 ? ' hoja' : ' hojas') + '), ' + f.nombre);
  }
}

function openEtiquetasModal() {
  _etqSel = {};
  _etqBusqueda = '';
  _etqSoloPeso = false;
  _etqLista = '';
  const b = document.getElementById('etqBuscar');
  if (b) b.value = '';
  const sel = document.getElementById('etqLista');
  if (sel) {
    sel.innerHTML = '<option value="">Todos los proveedores</option>' +
      (listasData || []).map(l => '<option value="' + l.id + '">' + esc(l.nombre) + '</option>').join('');
  }
  /* La primera vez que se abre: lo que se usó la última vez que se imprimió. */
  if (!_etqUltimoPuesto) { _etqUltimoPuesto = true; _etqPonerUltimo(); }
  const f = document.getElementById('etqFormato');
  if (f) {
    f.innerHTML = ETQ_FORMATOS.map(x =>
      '<option value="' + x.id + '"' + (x.id === _etqFormato ? ' selected' : '') + '>' +
      esc(x.nombre) + '</option>').join('');
  }
  const chk = document.getElementById('etqSoloPeso');
  if (chk) chk.checked = false;
  etqFormatoCambio();
  etqRender();
  const m = document.getElementById('etiquetasModal');
  if (m) m.classList.add('show');
}

function closeEtiquetasModal() {
  const m = document.getElementById('etiquetasModal');
  if (m) m.classList.remove('show');
  _etqSel = {};
}

/* Los productos que se muestran. El que no tiene código de proveedor no puede
   tener etiqueta, así que no se lista: aparece en el aviso de abajo. */
function _etqCandidatos() {
  return (typeof allProducts !== 'undefined' ? allProducts : [])
    .filter(p => p.depurado !== true && etiquetaCodigoDe(p))
    .filter(p => !_etqSoloPeso || p.tipoVenta === 'peso')
    .filter(p => !_etqLista || p.lista === _etqLista)
    .filter(p => !_etqBusqueda || (typeof coincideProducto === 'function'
      ? coincideProducto(p, _etqBusqueda)
      : ((p.nombre || '') + ' ' + (p.codigo || '')).toLowerCase().includes(_etqBusqueda.toLowerCase())))
    .sort((a, b) => String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es'));
}

function etqRender() {
  const cont = document.getElementById('etqLista_');
  if (!cont) return;
  const prods = _etqCandidatos();
  if (!prods.length) {
    cont.innerHTML = '<div style="padding:1rem;color:var(--text-dim);font-size:0.85rem">' +
      'Ning&uacute;n producto coincide.</div>';
  } else {
    cont.innerHTML = prods.slice(0, 400).map(p => {
      const sel = _etqSel[p.id] != null;
      return '<label class="etq-fila' + (sel ? ' sel' : '') + '">' +
        '<input type="checkbox"' + (sel ? ' checked' : '') +
          ' onchange="etqToggle(\'' + p.id + '\')">' +
        '<span class="etq-fila-cod">' + esc(p.codigo) + '</span>' +
        '<span class="etq-fila-n">' + esc(p.nombreMostrado || p.nombre) +
          (p.tipoVenta === 'peso' ? ' <span class="etq-tag">por peso</span>' : '') + '</span>' +
        '<span class="etq-fila-c">' +
          (sel ? '<input type="number" min="1" max="500" value="' + _etqSel[p.id] + '" ' +
                 'onclick="event.preventDefault();event.stopPropagation()" ' +
                 'onchange="etqCopias(\'' + p.id + '\',this.value)" title="Cu&aacute;ntas copias">' : '') +
        '</span></label>';
    }).join('') +
    (prods.length > 400 ? '<div style="padding:0.5rem;color:var(--text-dim);font-size:0.78rem">' +
      'Se muestran 400 de ' + prods.length + '. Afin&aacute; la b&uacute;squeda para ver el resto.</div>' : '');
  }
  etqResumen();
}

function etqBuscar(q) { _etqBusqueda = q || ''; etqRender(); }
function etqFiltroLista(v) { _etqLista = v || ''; etqRender(); }
function etqFiltroPeso(v) { _etqSoloPeso = !!v; etqRender(); }

function etqToggle(id) {
  if (_etqSel[id] != null) delete _etqSel[id];
  else _etqSel[id] = 1;
  etqRender();
}

function etqCopias(id, v) {
  const n = Math.max(1, Math.min(500, parseInt(v, 10) || 1));
  if (_etqSel[id] != null) _etqSel[id] = n;
  etqResumen();
}

/* "Los que se ven" y no "todos": marcar 613 productos de un clic es casi siempre
   un accidente, y el que quiere todos puede vaciar los filtros primero. */
function etqMarcarVisibles() {
  _etqCandidatos().slice(0, 400).forEach(p => { if (_etqSel[p.id] == null) _etqSel[p.id] = 1; });
  etqRender();
}
function etqDesmarcarTodo() { _etqSel = {}; etqRender(); }

function etqCopiasATodos(v) {
  const n = Math.max(1, Math.min(500, parseInt(v, 10) || 1));
  Object.keys(_etqSel).forEach(id => { _etqSel[id] = n; });
  etqRender();
}

function etqFormatoCambio() {
  const sel = document.getElementById('etqFormato');
  _etqFormato = (sel && sel.value) || 'a4-3x8';
  const caja = document.getElementById('etqCustom');
  if (caja) caja.style.display = _etqFormato === 'custom' ? 'grid' : 'none';
  /* La eleccion de rollo solo tiene sentido en termica: en A4 se esconde para no
     ofrecer una opcion que no hace nada. */
  const rollo = document.getElementById('etqRollo');
  if (rollo) {
    const f = etiquetaFormato(_etqFormato);
    const esTermica = _etqFormato === 'custom'
      ? !!(document.getElementById('etqCustomTermica') || {}).checked
      : f.hoja === 'termica';
    rollo.style.display = esTermica ? '' : 'none';
  }
  etqResumen();
}

/* El formato que se va a usar de verdad: si es "personalizado" se leen los
   campos, con topes para que no salga una etiqueta más grande que la hoja. */
/* El tipo de rollo lo elige el comercio, no lo adivina el sistema. Solo aplica a
   las termicas; en A4 no significa nada. */
function etqRolloContinuo() {
  const c = document.getElementById('etqContinuo');
  return c ? !!c.checked : true;
}
function etqSeparacionMm() {
  const v = Number((document.getElementById('etqSeparacion') || {}).value);
  return isFinite(v) && v >= 0 ? Math.min(20, v) : 2;
}

function etqFormatoActual() {
  const base = etiquetaFormato(_etqFormato);
  if (_etqFormato !== 'custom') {
    if (base.hoja !== 'termica') return base;
    return Object.assign({}, base, { continuo: etqRolloContinuo(), separacion: etqSeparacionMm() });
  }
  const g = (id, def, min, max) => {
    const v = Number((document.getElementById(id) || {}).value);
    return isFinite(v) && v > 0 ? Math.max(min, Math.min(max, v)) : def;
  };
  const esTermica = (document.getElementById('etqCustomTermica') || {}).checked;
  const ancho = g('etqCustomAncho', 70, 20, 210);
  const alto = g('etqCustomAlto', 37, 15, 297);
  return {
    id: 'custom', nombre: 'Personalizado', hoja: esTermica ? 'termica' : 'A4',
    ancho: ancho, alto: alto,
    columnas: esTermica ? 1 : g('etqCustomCols', 3, 1, 10),
    filas: esTermica ? 1 : g('etqCustomFilas', 8, 1, 20),
    margenH: esTermica ? 0 : g('etqCustomMargenH', 0, 0, 40),
    margenV: esTermica ? 0 : g('etqCustomMargenV', 5, 0, 40),
    continuo: esTermica ? etqRolloContinuo() : false,
    separacion: etqSeparacionMm(),
  };
}

function _etqPedidos() {
  const todos = (typeof allProducts !== 'undefined' ? allProducts : []);
  return Object.keys(_etqSel).map(id => ({
    producto: todos.find(p => p.id === id),
    copias: _etqSel[id],
  })).filter(x => x.producto);
}

function etqResumen() {
  const cont = document.getElementById('etqResumen');
  if (!cont) return;
  const f = etqFormatoActual();
  const pedidos = _etqPedidos();
  const r = etiquetaResumen(pedidos, f);
  const nProd = pedidos.length;

  if (!nProd) {
    cont.innerHTML = '<span style="color:var(--text-dim)">Eleg&iacute; al menos un producto.</span>';
  } else {
    cont.innerHTML = '<b>' + nProd + ' producto' + (nProd === 1 ? '' : 's') + '</b> &middot; ' +
      r.etiquetas + ' etiqueta' + (r.etiquetas === 1 ? '' : 's') + ' &middot; ' +
      (f.hoja === 'termica'
        ? r.etiquetas + ' etiqueta' + (r.etiquetas === 1 ? '' : 's') + ' de rollo'
        : '<b>' + r.hojas + ' hoja' + (r.hojas === 1 ? '' : 's') + '</b> de ' + r.porHoja + ' por hoja');
  }
  /* Una etiqueta más angosta que el mínimo de la norma imprime un código que el
     lector no va a leer. Vale más frenarlo acá que gastar la plancha. */
  /* Si dos productos comparten codigo, la etiqueta no distingue cual es cual. */
  const ambiguos = etiquetaAmbiguos(pedidos, (typeof allProducts !== 'undefined' ? allProducts : []));
  if (ambiguos.length) {
    cont.innerHTML += '<div style="color:var(--danger);margin-top:0.35rem;font-size:0.82rem">' +
      'Hay ' + ambiguos.length + ' producto' + (ambiguos.length === 1 ? '' : 's') +
      ' con un c&oacute;digo que est&aacute; repetido en el cat&aacute;logo: la etiqueta ' +
      'no va a distinguir cu&aacute;l es cu&aacute;l al escanearla.<br>' +
      ambiguos.map(a => '&middot; ' + esc(a.nombre) + ' (c&oacute;d. ' + esc(a.codigo) +
        ', lo comparten ' + a.cuantos + ')').join('<br>') + '</div>';
  }
  const med = etiquetaMedidas(f);
  if (med.justo && !med.angosta) {
    cont.innerHTML += '<div style="color:var(--text-dim);margin-top:0.35rem;font-size:0.8rem">' +
      'Es de los chicos: el c&oacute;digo sale al ' + Math.round(med.bcAncho / 37.29 * 100) +
      '% del tama&ntilde;o nominal. Entra dentro de la norma y se lee, pero es el que menos ' +
      'margen deja. Si la impresora tira las barras gruesas y alguna etiqueta no engancha, ' +
      'pas&aacute; a una m&aacute;s grande.</div>';
  }
  if (med.angosta) {
    cont.innerHTML += '<div style="color:var(--warning);margin-top:0.35rem;font-size:0.82rem">' +
      'Esa etiqueta es muy angosta (' + f.ancho + ' mm). Un código de barras necesita al menos ' +
      (ETQ_ANCHO_MIN + 4) + ' mm de ancho para que un lector lo lea: va a salir cortado.</div>';
  }
  _etqPreview();
}

/* Una etiqueta de muestra, al tamaño real. Es lo que evita gastar una plancha
   entera para descubrir que el nombre no entra. */
function _etqPreview() {
  const caja = document.getElementById('etqPreview');
  if (!caja) return;
  const pedidos = _etqPedidos();
  if (!pedidos.length) { caja.innerHTML = ''; return; }
  const f = etqFormatoActual();
  const o = _etqOpciones();
  caja.innerHTML = '<div style="font-size:0.72rem;color:var(--text-dim);' +
      'text-transform:uppercase;letter-spacing:0.5px;margin-bottom:0.4rem">' +
      'C&oacute;mo va a salir (tama&ntilde;o real, ' + f.ancho + ' &times; ' + f.alto + ' mm)</div>' +
    '<iframe id="etqPreviewFrame" style="width:100%;height:' +
      Math.max(120, Math.round(f.alto * 3.9)) + 'px;border:0;background:#fff;border-radius:6px"></iframe>';
  const fr = document.getElementById('etqPreviewFrame');
  if (!fr) return;
  const doc = fr.contentDocument;
  doc.open();
  doc.write('<html><head><style>' + etiquetaEstilos(f) +
    'body{display:flex;align-items:center;justify-content:center;padding:4px}' +
    '.etq{border:1px dashed #bbb}</style></head><body>' +
    etiquetaHTML(pedidos[0].producto, f, o) + '</body></html>');
  doc.close();
}

function _etqOpciones() {
  return {
    precio: !!(document.getElementById('etqConPrecio') || {}).checked,
    codigoInterno: !!(document.getElementById('etqConCodigo') || {}).checked,
  };
}

function etiquetasImprimir() {
  const pedidos = _etqPedidos();
  if (!pedidos.length) return showAdminToast('Eleg&iacute; al menos un producto', 'error');
  const f = etqFormatoActual();
  const cuerpo = etiquetaDocumento(pedidos, f, _etqOpciones());
  if (!cuerpo) return showAdminToast('No se pudo armar ninguna etiqueta', 'error');

  const win = window.open('', '_blank', 'width=900,height=700');
  if (!win) return showAdminToast('El navegador bloqueó la ventana de impresión', 'error');
  /* Se imprime: queda recordado para la próxima vez (ver _etqGuardarUltimo). */
  _etqGuardarUltimo();
  win.document.write('<html><head><title>Etiquetas</title><style>' +
    etiquetaEstilos(f) + '</style></head><body>' + cuerpo + '</body></html>');
  win.document.close();
  win.focus();
  /* Las barras son SVG en línea: no hay imágenes que esperar, pero el diálogo de
     impresión igual necesita que el documento termine de maquetar. */
  setTimeout(() => { win.print(); }, 350);
  if (typeof logAction === 'function') {
    const r = etiquetaResumen(pedidos, f);
    logAction('imprimir', 'Etiquetas: ' + r.etiquetas + ' de ' + pedidos.length + ' productos',
      f.nombre + ' | ' + pedidos.map(x => x.producto.nombre).join(' | ').slice(0, 800));
  }
}



/* =============================================================================
   ETIQUETA PARA BOLSITA CON PESO  —  pedido del comercio (17/11/2026)
   =============================================================================
   La etiqueta de arriba dice QUÉ producto es, pero no cuánto pesa la bolsa: al
   escanearla se preguntan los gramos. Esta es para la bolsita que se arma en el
   local con un peso ya pesado (100 g de nuez): se elige el producto y los gramos, y
   la etiqueta lleva el peso, el precio y la fecha. Al escanearla en la caja entra
   a la venta con esos gramos, sin preguntar.

   EL PRECIO SE COBRA POR KILO, COMO SIEMPRE. Medido en producción (17/11/2026): los
   1.585 renglones por peso de 957 ventas se cobraron precio del kilo x gramos, sin
   ninguno con precio propio. Escanear la etiqueta es lo mismo que tipear los gramos
   (misma función, mismas bolsas de granel, mismos avisos): se cobra el precio del
   kilo DEL DÍA en que se vende. El precio impreso es el del día en que se imprimió,
   con la fecha al lado, para que se note si quedó viejo.

   EL CÓDIGO: EAN-13 con '29' + el código interno (6 dígitos) + los gramos (4
   dígitos, hasta 9.999 g) + el verificador. Es el formato de las balanzas de los
   supermercados. Las etiquetas de arriba empiezan con '20000' (el código interno va
   en 11 dígitos), así que no se pisan; y los códigos que empiezan con 2 están
   reservados para uso interno de cada comercio: no chocan con uno de fábrica.
   ============================================================================= */
const ETQP_PREFIJO = '29';
const ETQP_MAX_GRAMOS = 9999;
const ETQP_RAPIDOS = [100, 250, 500, 1000];

function _etqpCodigo(p) {
  const c = String(p && p.codigo != null ? p.codigo : '').trim();
  return /^\d{1,6}$/.test(c) ? c.padStart(6, '0') : null;
}

/* El EAN-13 de esa bolsita, o null si no se puede (sin código interno de hasta 6
   dígitos, o gramos fuera de 1 a 9.999). */
function etiquetaPesoCodigoDe(p, gramos) {
  const cod = _etqpCodigo(p);
  const g = Number(gramos);
  if (!cod || !Number.isInteger(g) || g < 1 || g > ETQP_MAX_GRAMOS) return null;
  const base = ETQP_PREFIJO + cod + String(g).padStart(4, '0');
  return base + etiquetaDigitoVerificador(base);
}

/* El camino de vuelta, el que usa el lector: { producto, gramos, varios }, o null si
   lo escaneado no es una de estas etiquetas. Si el código lo tienen varios productos
   no se adivina: producto null y `varios` con los que lo comparten. */
function etiquetaPesoDe(escaneado, productos) {
  const c = String(escaneado == null ? '' : escaneado).trim();
  if (!/^\d{13}$/.test(c) || c.slice(0, 2) !== ETQP_PREFIJO) return null;
  if (etiquetaDigitoVerificador(c.slice(0, 12)) !== c[12]) return null;
  const gramos = parseInt(c.slice(8, 12), 10);
  if (!(gramos > 0)) return null;
  const cod = c.slice(2, 8);
  const todos = (productos || []).filter(p => _etqpCodigo(p) === cod);
  if (todos.length > 1) return { producto: null, gramos: gramos, varios: todos };
  return { producto: todos[0] || null, gramos: gramos, varios: [] };
}

/* Las bolsas de granel del producto (admin-escalas.js), o ninguna. */
function _etqpEscalas(p, productos) {
  return (typeof escalasDe === 'function') ? escalasDe(p, productos) : [];
}

/* Lo que sale la bolsita en el mostrador si se vende sola, con la MISMA cuenta que la
   venta: con bolsas de granel, el precio de la bolsa que toca por esos gramos
   (cobroEscala); si no, el precio del kilo con su descuento, redondeado como
   precioConDsc, por los gramos, redondeado como subtotalItem. */
function etiquetaPesoPrecio(p, gramos, productos) {
  const g = Number(gramos) || 0;
  const esc = _etqpEscalas(p, productos);
  if (esc.length && typeof cobroEscala === 'function') {
    const e = escalaPara(esc, g);
    return { total: cobroEscala(e, g, 'min', null), kilo: precioFinalKg(e, 'min', null), bolsa: e.etiqueta };
  }
  const kilo = Math.round(Number(p && p.precio || 0) * (1 - (Number(p && p.descuento) || 0) / 100));
  return { total: Math.round(kilo * g / 1000), kilo: kilo, bolsa: null };
}

/* El nombre que va en la etiqueta: el del grupo si tiene bolsas de granel ("Yerba
   Mate", no "Yerba Mate x 1 kg"). */
function etiquetaPesoNombre(p, productos) {
  const esc = _etqpEscalas(p, productos);
  if (esc.length && typeof _escNombre === 'function') return _escNombre(esc[0]);
  return String((p && (p.nombreMostrado || p.nombre)) || '').trim();
}

function _etqpPeso(g) {
  const n = Number(g) || 0;
  return n < 1000 ? n.toLocaleString('es-AR') + ' g'
    : (n / 1000).toLocaleString('es-AR', { maximumFractionDigits: 3 }) + ' kg';
}
function _etqpPlata(n) { return '$' + Math.round(Number(n) || 0).toLocaleString('es-AR'); }
function etiquetaPesoFecha(d) {
  const x = d || new Date();
  const dd = String(x.getDate()).padStart(2, '0'), mm = String(x.getMonth() + 1).padStart(2, '0');
  return dd + '/' + mm + '/' + x.getFullYear();
}

/* La etiqueta: nombre, peso y precio, el precio del kilo con la fecha, y el código.
   `o.precio` = { total, kilo } (etiquetaPesoPrecio); `o.fecha` = '17/11/2026'. */
function etiquetaPesoHTML(p, gramos, f, o) {
  const ean = etiquetaPesoCodigoDe(p, gramos);
  if (!ean) return '';
  const opc = o || {};
  const m = etiquetaMedidas(f);
  const e = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const pr = opc.precio || { total: 0, kilo: 0 };
  const fecha = opc.fecha || etiquetaPesoFecha();
  /* En las chicas el nombre va en un renglon: si no, las barras se achicaban por debajo de la
     altura de la etiqueta de siempre (7,8 mm en la de 38 x 21 con un nombre largo). */
  let h = '<div class="etq etqp"><div class="etq-nom' + (m.chico ? ' etqp-nom1' : '') + '">' + e(opc.nombre || p.nombreMostrado || p.nombre) + '</div>';
  h += '<div class="etqp-linea">' + e(_etqpPeso(gramos)) + (pr.total > 0 ? ' &middot; ' + e(_etqpPlata(pr.total)) : '') + '</div>';
  h += '<div class="etqp-det">' + (pr.kilo > 0 ? e(_etqpPlata(pr.kilo)) + (m.chico ? '/kg' : ' el kilo') + ' &middot; ' : '') +
       'precio del ' + e(fecha) + '</div>';
  h += etiquetaBarrasSVG(ean, m.bcAlto, m.bcAncho);
  return h + '</div>';
}

/* El documento: `copias` veces la misma etiqueta, con el mismo motor que las otras. */
function etiquetaPesoDocumento(p, gramos, copias, f, o) {
  const html = etiquetaPesoHTML(p, gramos, f, o);
  if (!html) return '';
  const n = Math.max(1, Math.min(500, parseInt(copias, 10) || 1));
  const etqs = [];
  for (let i = 0; i < n; i++) etqs.push(html);
  if (f.hoja === 'termica') return etqs.join('');
  const porHoja = Math.max(1, (Number(f.columnas) || 1) * (Number(f.filas) || 1));
  let out = '';
  for (let i = 0; i < etqs.length; i += porHoja) {
    out += '<div class="etq-pag"><div class="etq-hoja">' + etqs.slice(i, i + porHoja).join('') + '</div></div>';
  }
  return out;
}

/* ------------------------------------------------------------- la ventana --- */
let _etqpId = null;
let _etqpBusqueda = '';

/* Los productos que pueden tener esta etiqueta: por peso, no depurados, con código
   interno de hasta 6 dígitos. Un granel con bolsas va una sola vez (el grupo), con
   el código de su bolsa más chica: la venta reparte entre las bolsas igual. */
function etiquetaPesoCandidatos(productos) {
  const todos = productos || (typeof allProducts !== 'undefined' ? allProducts : []);
  return todos.filter(p => p && p.tipoVenta === 'peso' && p.depurado !== true && _etqpCodigo(p))
    .filter(p => { const esc = _etqpEscalas(p, todos); return !esc.length || esc[0].id === p.id; });
}

function _etqpProducto() {
  const todos = (typeof allProducts !== 'undefined' ? allProducts : []);
  return _etqpId ? (todos.find(p => p.id === _etqpId) || null) : null;
}
function _etqpGramos() {
  const g = parseInt(((document.getElementById('etqpGramos') || {}).value || '').replace(/\D/g, ''), 10);
  return Number.isFinite(g) ? g : 0;
}
function _etqpCopias() {
  return Math.max(1, Math.min(500, parseInt((document.getElementById('etqpCopias') || {}).value, 10) || 1));
}

/* Los formatos de la otra ventana, sin "Personalizado" (sus medidas viven allá). Arranca
   con el último que se usó para imprimir, en cualquiera de las dos. */
function _etqpFormatos() { return ETQ_FORMATOS.filter(f => f.id !== 'custom'); }
function _etqpUltimo() {
  try { return JSON.parse(localStorage.getItem(ETQ_ULTIMO_KEY) || 'null') || {}; } catch (e) { return {}; }
}
function etqpFormatoActual() {
  const id = (document.getElementById('etqpFormato') || {}).value;
  const base = _etqpFormatos().find(f => f.id === id) || _etqpFormatos()[0];
  if (base.hoja !== 'termica') return base;
  const u = _etqpUltimo();
  const sep = Number(u.campos && u.campos.etqSeparacion);
  return Object.assign({}, base, {
    continuo: !!(document.getElementById('etqpContinuo') || {}).checked,
    separacion: isFinite(sep) && sep >= 0 ? Math.min(20, sep) : 2,
  });
}

function openEtiquetaPesoModal() {
  _etqpId = null;
  _etqpBusqueda = '';
  const b = document.getElementById('etqpBuscar'); if (b) b.value = '';
  const g = document.getElementById('etqpGramos'); if (g) g.value = '';
  const c = document.getElementById('etqpCopias'); if (c) c.value = '1';
  const u = _etqpUltimo();
  const sel = document.getElementById('etqpFormato');
  if (sel) {
    const elegido = _etqpFormatos().some(f => f.id === u.formato) ? u.formato : _etqpFormatos()[0].id;
    sel.innerHTML = _etqpFormatos().map(f => '<option value="' + f.id + '"' + (f.id === elegido ? ' selected' : '') + '>' +
      esc(f.nombre) + '</option>').join('');
  }
  const cont = document.getElementById('etqpContinuo');
  if (cont) cont.checked = typeof u.continuo === 'boolean' ? u.continuo : true;
  etqpRender();
  const m = document.getElementById('etiquetaPesoModal');
  if (m) m.classList.add('show');
  setTimeout(() => { const x = document.getElementById('etqpBuscar'); if (x) x.focus(); }, 60);
}
function closeEtiquetaPesoModal() {
  const m = document.getElementById('etiquetaPesoModal');
  if (m) m.classList.remove('show');
}

function etqpBuscar(q) { _etqpBusqueda = q || ''; _etqpPintarLista(); }
function etqpElegir(id) { _etqpId = id; etqpRender(); setTimeout(() => { const g = document.getElementById('etqpGramos'); if (g && !g.value) g.focus(); }, 30); }
function etqpRapido(g) { const i = document.getElementById('etqpGramos'); if (i) i.value = String(g); etqpRender(); }

function _etqpPintarLista() {
  const cont = document.getElementById('etqpLista');
  if (!cont) return;
  const todos = (typeof allProducts !== 'undefined' ? allProducts : []);
  const q = _etqpBusqueda.trim();
  const lista = etiquetaPesoCandidatos(todos)
    .filter(p => !q || (typeof coincideProducto === 'function' ? coincideProducto(p, q)
      : ((p.nombre || '') + ' ' + (p.codigo || '')).toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => etiquetaPesoNombre(a, todos).localeCompare(etiquetaPesoNombre(b, todos), 'es'));
  if (!q && !_etqpId) {
    cont.innerHTML = '<div class="etqp-vacio">Escrib&iacute; el nombre o el c&oacute;digo del producto. Salen los que se venden por peso.</div>';
    return;
  }
  if (!lista.length) { cont.innerHTML = '<div class="etqp-vacio">Ning&uacute;n producto por peso coincide.</div>'; return; }
  cont.innerHTML = lista.slice(0, 60).map(p => {
    const pr = etiquetaPesoPrecio(p, 1000, todos);
    return '<button type="button" class="etqp-op' + (p.id === _etqpId ? ' sel' : '') + '" onclick="etqpElegir(\'' + p.id + '\')">' +
      '<span class="etq-fila-cod">' + esc(p.codigo) + '</span>' +
      '<span class="etqp-op-n">' + esc(etiquetaPesoNombre(p, todos)) + (p.oculto === true ? ' <span class="etq-tag">oculto</span>' : '') + '</span>' +
      '<span class="etqp-op-p">' + (pr.kilo > 0 ? _etqpPlata(pr.kilo) + ' el kilo' : 'sin precio') + '</span></button>';
  }).join('') + (lista.length > 60 ? '<div class="etqp-vacio">Se muestran 60 de ' + lista.length + '. Afin&aacute; la b&uacute;squeda.</div>' : '');
}

/* Lo que se va a imprimir, o por qué todavía no. */
function _etqpEstado() {
  const p = _etqpProducto();
  const g = _etqpGramos();
  if (!p) return { error: 'Eleg&iacute; el producto.' };
  if (!(g > 0)) return { p: p, error: 'Escrib&iacute; cu&aacute;ntos gramos tiene la bolsita.' };
  if (g > ETQP_MAX_GRAMOS) return { p: p, error: 'Hasta 9.999 g (casi 10 kg) por etiqueta.' };
  const todos = (typeof allProducts !== 'undefined' ? allProducts : []);
  const pr = etiquetaPesoPrecio(p, g, todos);
  if (!(pr.kilo > 0)) return { p: p, error: 'Este producto no tiene precio. Carg&aacute;selo en su ficha antes de imprimir la etiqueta.' };
  const amb = etiquetaAmbiguos([{ producto: p }], todos);
  if (amb.length) return { p: p, error: 'El c&oacute;digo ' + esc(p.codigo) + ' lo tienen ' + amb[0].cuantos + ' productos: la etiqueta no sabr&iacute;a de cu&aacute;l es. Corregilo antes.' };
  return { p: p, g: g, pr: pr, nombre: etiquetaPesoNombre(p, todos), copias: _etqpCopias() };
}

function etqpRender() {
  _etqpPintarLista();
  const f = etqpFormatoActual();
  const rollo = document.getElementById('etqpRollo');
  if (rollo) rollo.style.display = f.hoja === 'termica' ? '' : 'none';
  const st = _etqpEstado();
  const res = document.getElementById('etqpResumen');
  const btn = document.getElementById('etqpImprimir');
  if (btn) btn.disabled = !!st.error;
  if (res) {
    if (st.error) res.innerHTML = '<span class="etqp-falta">' + st.error + '</span>';
    else {
      const n = st.copias;
      const hojas = Math.ceil(n / Math.max(1, f.columnas * f.filas));
      res.innerHTML = '<b>' + esc(st.nombre) + ' &middot; ' + _etqpPeso(st.g) + ' &middot; ' + _etqpPlata(st.pr.total) + '</b>' +
        '<div class="etqp-det-res">' + _etqpPlata(st.pr.kilo) + ' el kilo' +
        (st.pr.bolsa ? ' (el precio de la bolsa de ' + esc(st.pr.bolsa) + ', como en la venta)' : '') +
        '. Al escanearla en la caja entra con ' + _etqpPeso(st.g) + ' y se cobra el precio del kilo de ese d&iacute;a.</div>' +
        '<div class="etqp-det-res">' + n + (n === 1 ? ' etiqueta' : ' etiquetas') +
        (f.hoja === 'termica' ? ' de rollo.' : ', en ' + hojas + (hojas === 1 ? ' hoja' : ' hojas') + ' de ' + (f.columnas * f.filas) + '.') + '</div>';
    }
  }
  _etqpPreview(st, f);
}

function _etqpPreview(st, f) {
  const caja = document.getElementById('etqpPreview');
  if (!caja) return;
  if (st.error) { caja.innerHTML = ''; return; }
  caja.innerHTML = '<div class="etqp-prev-tit">C&oacute;mo va a salir (tama&ntilde;o real, ' + f.ancho + ' &times; ' + f.alto + ' mm)</div>' +
    '<iframe id="etqpPreviewFrame" class="etqp-prev-frame"></iframe>';
  const fr = document.getElementById('etqpPreviewFrame');
  if (!fr) return;
  fr.style.height = Math.max(120, Math.round(f.alto * 3.9)) + 'px';
  const doc = fr.contentDocument;
  doc.open();
  doc.write('<html><head><style>' + etiquetaEstilos(f) +
    'body{display:flex;align-items:center;justify-content:center;padding:4px}.etq{border:1px dashed #bbb}</style></head><body>' +
    etiquetaPesoHTML(st.p, st.g, f, { precio: st.pr, nombre: st.nombre }) + '</body></html>');
  doc.close();
}

function etiquetaPesoImprimir() {
  const st = _etqpEstado();
  if (st.error) { if (typeof showAdminToast === 'function') showAdminToast(st.error.replace(/&[a-z]+;/g, ''), 'error'); return; }
  const f = etqpFormatoActual();
  const fecha = etiquetaPesoFecha();
  const cuerpo = etiquetaPesoDocumento(st.p, st.g, st.copias, f, { precio: st.pr, nombre: st.nombre, fecha: fecha });
  if (!cuerpo) { if (typeof showAdminToast === 'function') showAdminToast('No se pudo armar la etiqueta', 'error'); return; }
  const win = window.open('', '_blank', 'width=900,height=700');
  if (!win) { if (typeof showAdminToast === 'function') showAdminToast('El navegador bloqueó la ventana de impresión', 'error'); return; }
  /* Lo último usado, para las dos ventanas de etiquetas (sin pisar las medidas de
     "Personalizado" de la otra). */
  try {
    const u = _etqpUltimo();
    u.formato = f.id;
    if (f.hoja === 'termica') u.continuo = !!f.continuo;
    localStorage.setItem(ETQ_ULTIMO_KEY, JSON.stringify(u));
  } catch (e) { /* sin guardar: la próxima arranca como siempre */ }
  win.document.write('<html><head><title>Etiquetas</title><style>' + etiquetaEstilos(f) + '</style></head><body>' + cuerpo + '</body></html>');
  win.document.close();
  win.focus();
  setTimeout(function () { win.print(); }, 350);
  if (typeof logAction === 'function') {
    logAction('imprimir', 'Etiqueta con peso: "' + st.nombre + '" ' + _etqpPeso(st.g),
      st.copias + (st.copias === 1 ? ' etiqueta' : ' etiquetas') + ', ' + _etqpPlata(st.pr.total) + ' (' + _etqpPlata(st.pr.kilo) + ' el kilo, ' + fecha + '), ' + f.nombre);
  }
}

if (typeof window !== 'undefined') {
  window.etiquetaPesoCodigoDe = etiquetaPesoCodigoDe;
  window.etiquetaPesoDe = etiquetaPesoDe;
  window.etiquetaPesoPrecio = etiquetaPesoPrecio;
  window.etiquetaPesoNombre = etiquetaPesoNombre;
  window.etiquetaPesoHTML = etiquetaPesoHTML;
  window.etiquetaPesoDocumento = etiquetaPesoDocumento;
  window.etiquetaPesoCandidatos = etiquetaPesoCandidatos;
  window.etiquetaPesoFecha = etiquetaPesoFecha;
  window.openEtiquetaPesoModal = openEtiquetaPesoModal;
  window.closeEtiquetaPesoModal = closeEtiquetaPesoModal;
  window.etqpBuscar = etqpBuscar;
  window.etqpElegir = etqpElegir;
  window.etqpRapido = etqpRapido;
  window.etqpRender = etqpRender;
  window.etqpFormatoActual = etqpFormatoActual;
  window.etiquetaPesoImprimir = etiquetaPesoImprimir;
  window.refrescarBarrasProducto = refrescarBarrasProducto;
  window.imprimirEtiquetaProducto = imprimirEtiquetaProducto;
  window.imprimirHojaEtiquetas = imprimirHojaEtiquetas;
  window.pedirHojaEtiquetas = pedirHojaEtiquetas;
  window.etiquetasDeHojas = etiquetasDeHojas;
  window.etiquetaCodigoDe = etiquetaCodigoDe;
  window.codigoBarrasDe = codigoBarrasDe;
  window.codigoBarrasCierra = codigoBarrasCierra;
  window.etiquetaProductoDe = etiquetaProductoDe;
  window.etiquetaBarrasSVG = etiquetaBarrasSVG;
  window.etiquetaHTML = etiquetaHTML;
  window.etiquetaDocumento = etiquetaDocumento;
  window.etiquetaEstilos = etiquetaEstilos;
  window.etiquetaResumen = etiquetaResumen;
  window.etiquetaFormato = etiquetaFormato;
  window.ETQ_FORMATOS = ETQ_FORMATOS;
  window.openEtiquetasModal = openEtiquetasModal;
  window.closeEtiquetasModal = closeEtiquetasModal;
  window.etqBuscar = etqBuscar;
  window.etqFiltroLista = etqFiltroLista;
  window.etqFiltroPeso = etqFiltroPeso;
  window.etqToggle = etqToggle;
  window.etqCopias = etqCopias;
  window.etqCopiasATodos = etqCopiasATodos;
  window.etqMarcarVisibles = etqMarcarVisibles;
  window.etqDesmarcarTodo = etqDesmarcarTodo;
  window.etqFormatoCambio = etqFormatoCambio;
  window.etqFormatoActual = etqFormatoActual;
  window.etqResumen = etqResumen;
  window.etiquetasImprimir = etiquetasImprimir;
  window.etiquetaSinCodigo = etiquetaSinCodigo;
  window.etiquetaAmbiguos = etiquetaAmbiguos;
  window.etiquetaMedidas = etiquetaMedidas;
  window.etiquetaModulos = etiquetaModulos;
  window.etiquetaDigitoVerificador = etiquetaDigitoVerificador;
}
