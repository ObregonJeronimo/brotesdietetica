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
  const ean = etiquetaCodigoDe(p);
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
    '.etq-bc{display:block;margin-top:0.4mm}';

  if (esTermica) {
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
      return base +
        /* Alto auto: la tira mide lo que sume, y es UNA sola pagina. */
        '@page{size:' + f.ancho + 'mm auto;margin:0}' +
        '.etq{page-break-after:auto;break-after:auto;height:' + f.alto + 'mm;' +
          'margin-bottom:' + sep + 'mm}' +
        '.etq:last-child{margin-bottom:0}';
    }
    return base +
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

/* ============ EL CODIGO DE BARRAS DENTRO DE LA FICHA DEL PRODUCTO ============
   Ver como va a salir la etiqueta ANTES de imprimir doscientas. El simbolo no se
   "ve mal" cuando esta mal: sale un dibujo de barras perfectamente plausible que
   la pistola no engancha. Por eso el preview usa el MISMO etiquetaBarrasSVG que
   la impresion, no un dibujo aparte. */
function _prodDelFormulario() {
  const g = id => (document.getElementById(id) || {}).value;
  return {
    codigo: g('pCodigo'),
    nombre: g('pNombre'),
    nombreMostrado: g('pNombreMostrado'),
    gramaje: g('pGramaje'),
    precio: Number(String(g('pPrecio') || '').replace(/[^\d.-]/g, '')) || 0,
    tipoVenta: (document.querySelector('.tv-toggle .active') || {}).dataset
      ? (document.querySelector('.tv-toggle .active').dataset.tv || 'unidad') : 'unidad'
  };
}

/* Se redibuja al escribir el codigo: es el unico campo del que depende. */
function refrescarBarrasProducto() {
  const wrap = document.getElementById('pBarrasWrap');
  const cont = document.getElementById('pBarrasSvg');
  const vacio = document.getElementById('pBarrasVacio');
  if (!wrap || !cont) return;
  const p = _prodDelFormulario();
  const ean = etiquetaCodigoDe(p);
  if (!ean) {
    wrap.style.display = 'none';
    if (vacio) vacio.style.display = '';
    return;
  }
  wrap.style.display = '';
  if (vacio) vacio.style.display = 'none';
  cont.innerHTML =
    '<div style="font:700 11px Helvetica,Arial,sans-serif;color:#000;margin-bottom:2px">' +
      esc(p.nombreMostrado || p.nombre || '') + '</div>' +
    /* etiquetaBarrasSVG ya dibuja los digitos debajo de las barras: agregarlos de
       nuevo los mostraba dos veces. */
    etiquetaBarrasSVG(ean, 12, 45);
}

/* Imprime UNA etiqueta, con el mismo motor que la impresion en tanda: si el
   simbolo sale bien aca, sale bien alla. Usa el formato termico chico, que es el
   que tiene sentido para una sola. */
function imprimirEtiquetaProducto() {
  const p = _prodDelFormulario();
  const ean = etiquetaCodigoDe(p);
  if (!ean) {
    if (typeof showAdminToast === 'function') showAdminToast('Ponele un codigo interno al producto para poder imprimir su etiqueta', 'error');
    return;
  }
  const f = Object.assign({}, etiquetaFormato('ter-58x40'), { continuo: true, separacion: 0 });
  const cuerpo = etiquetaDocumento([{ producto: p, copias: 1 }], f,
    { precio: Number(p.precio) > 0, codigo: true });
  if (!cuerpo) { if (typeof showAdminToast === 'function') showAdminToast('No se pudo armar la etiqueta', 'error'); return; }
  const win = window.open('', '_blank', 'width=520,height=620');
  if (!win) { if (typeof showAdminToast === 'function') showAdminToast('El navegador bloqueo la ventana de impresion', 'error'); return; }
  win.document.write('<html><head><title>Etiqueta</title><style>' +
    etiquetaEstilos(f) + '</style></head><body>' + cuerpo + '</body></html>');
  win.document.close();
  win.focus();
  setTimeout(function () { win.print(); }, 350);
  if (typeof logAction === 'function') {
    logAction('imprimir', 'Etiqueta de "' + (p.nombreMostrado || p.nombre || p.codigo) + '"', 'Una etiqueta, ' + f.nombre);
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
    .filter(p => etiquetaCodigoDe(p))
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



if (typeof window !== 'undefined') {
  window.refrescarBarrasProducto = refrescarBarrasProducto;
  window.imprimirEtiquetaProducto = imprimirEtiquetaProducto;
  window.etiquetaCodigoDe = etiquetaCodigoDe;
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
