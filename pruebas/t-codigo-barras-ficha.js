/* EL PREVIEW DE LA FICHA ES EL CODIGO DE BARRAS, NUNCA EL CODIGO INTERNO
   =============================================================================
   Lo que estaba mal (visto por el dueño el 21/09): un producto con código
   interno `002022` y el campo "Código de barras" VACÍO mostraba, debajo de ese
   campo, el símbolo `2000000020228`. Ese número no es el código de barras del
   producto: es un EAN-13 que el propio sistema deriva del código interno para
   las etiquetas que imprime el local. Dos consecuencias, las dos malas:

     1. Mirando la ficha parecía que el producto YA tenía código de barras. Los
        1.311 productos sin código de barras mostraban uno.
     2. Al cargar el de verdad —8414775016005— el dibujo no cambiaba, porque no
        dependía de ese campo. Se escaneaba el envase y abajo seguía el otro.

   La regla, en las palabras del dueño: "Nunca ni en ningún caso el código normal
   debe ser el que está para código de barras". Sin código de barras cargado no
   hay símbolo: van trece ceros, y no se puede imprimir.

   Se corre admin-etiquetas.js DE VERDAD en un vm, con la ficha de mentira.
   ============================================================================= */
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const RAIZ = path.join(__dirname, '..');
const ETQ = fs.readFileSync(path.join(RAIZ, 'admin-etiquetas.js'), 'utf8');
const HTML = fs.readFileSync(path.join(RAIZ, 'admin.html'), 'utf8');
const LECTOR = fs.readFileSync(path.join(RAIZ, 'admin-lector.js'), 'utf8');

/* Una funcion del archivo real, o una que devuelve undefined si todavia no
   existe: correr esta suite contra el commit anterior -que es como se comprueba
   que sirve para algo- tiene que enumerar lo que falta, no reventar en la
   primera linea. */
const fnDe = (nombre, sb) => {
  try { const f = vm.runInContext(nombre, sb); return typeof f === 'function' ? f : () => undefined; }
  catch (e) { return () => undefined; }
};

let ok = 0, mal = 0;
const t = (d, c, extra) => {
  if (c) { ok++; console.log('  OK   ' + d + (extra ? '   (' + extra + ')' : '')); }
  else { mal++; console.log('  FALLA ' + d + (extra ? '   (' + extra + ')' : '')); }
};
const grupo = n => console.log('\n' + n);

/* El EAN-13 que el sistema deriva del codigo interno 002022, que es EXACTAMENTE
   el que no tiene que aparecer nunca como codigo de barras del producto. */
const DERIVADO_DEL_INTERNO = '2000000020228';
const BARRAS_DE_VERDAD = '8414775016005';

/* --- la ficha de mentira: los campos, el preview y el boton ---------------- */
function ficha(campos) {
  const els = {};
  const el = (id) => {
    if (!els[id]) els[id] = { id, value: '', innerHTML: '', textContent: '', style: {}, dataset: {} };
    return els[id];
  };
  ['pCodigo', 'pCodigoBarras', 'pNombre', 'pNombreMostrado', 'pGramaje', 'pPrecio',
   'pBarrasWrap', 'pBarrasSvg', 'pBarrasVacio', 'pBarrasAviso', 'btnImprimirEtqProd'].forEach(el);
  Object.keys(campos || {}).forEach(k => { el(k).value = campos[k]; });

  const est = { avisos: [], abrio: 0 };
  const sb = {
    console, Math, Number, String, Object, Array, Date, setTimeout,
    document: {
      getElementById: (id) => els[id] || null,
      querySelector: (sel) => (sel === '.tv-toggle .active' ? { dataset: { tv: 'unidad' } } : null),
      querySelectorAll: () => []
    },
    esc: s => String(s == null ? '' : s),
    showAdminToast: (m) => est.avisos.push(m),
    logAction: () => {},
    etiquetaFormato: null   /* lo define el archivo */
  };
  sb.window = sb;
  sb.window.open = () => { est.abrio++; return { document: { write() {}, close() {} }, focus() {}, print() {} }; };
  sb.globalThis = sb;
  vm.createContext(sb);
  vm.runInContext(ETQ, sb, { filename: 'admin-etiquetas.js' });
  return { sb, els, est, svg: () => els.pBarrasSvg.innerHTML, boton: () => els.btnImprimirEtqProd.style.display };
}
const dibujar = (F) => fnDe('refrescarBarrasProducto', F.sb)();
const imprimir = (F) => fnDe('imprimirEtiquetaProducto', F.sb)();

grupo('codigoBarrasDe() no mira el codigo interno, ni una vez');
let F = ficha({});
const cbd = fnDe('codigoBarrasDe', F.sb);
t('con codigo interno y sin codigo de barras: null',
  cbd({ codigo: '002022', codigoBarras: '' }) === null);
t('aunque el codigo interno sea un EAN-13 entero',
  cbd({ codigo: DERIVADO_DEL_INTERNO, codigoBarras: '' }) === null);
t('con codigo de barras: ese, tal cual',
  cbd({ codigo: '002022', codigoBarras: BARRAS_DE_VERDAD }) === BARRAS_DE_VERDAD);
t('un UPC de 12 digitos es un EAN-13 con un cero adelante',
  cbd({ codigoBarras: '036000291452' }) === '0036000291452');
t('con espacios o guiones tambien',
  cbd({ codigoBarras: ' 8414 775-016005 ' }) === BARRAS_DE_VERDAD);
t('cualquier otro largo no se dibuja', cbd({ codigoBarras: '12345' }) === null);
t('y las letras tampoco', cbd({ codigoBarras: 'P-0001' }) === null);

grupo('Sin codigo de barras cargado: trece ceros');
F = ficha({ pCodigo: '002022', pNombre: 'producto prueba', pCodigoBarras: '' });
dibujar(F);
t('el preview dice 0000000000000', F.svg().indexOf('0000000000000') > 0, );
t('NO dibuja el derivado del codigo interno', F.svg().indexOf(DERIVADO_DEL_INTERNO) < 0);
t('ni ningun simbolo de barras', F.svg().indexOf('<svg') < 0);
t('no se puede imprimir', F.boton() === 'none');
t('y se explica por que', F.els.pBarrasVacio.style.display === '');

imprimir(F);
t('si igual se llama a imprimir, no abre nada', F.est.abrio === 0);
t('y avisa que falta el codigo de barras',
  F.est.avisos.some(m => /no tiene codigo de barras/.test(m)), F.est.avisos.join(' | '));

grupo('Con el codigo de barras cargado, el símbolo es ESE');
F = ficha({ pCodigo: '002022', pNombre: 'producto prueba', pCodigoBarras: BARRAS_DE_VERDAD });
dibujar(F);
t('dibuja un simbolo', F.svg().indexOf('<svg') > 0);
t('con los digitos del envase', F.svg().indexOf(BARRAS_DE_VERDAD.slice(1, 7)) > 0);
t('y NO los del codigo interno', F.svg().indexOf(DERIVADO_DEL_INTERNO) < 0);
t('se puede imprimir', F.boton() === '');
imprimir(F);
t('imprimir abre la ventana', F.est.abrio === 1);

grupo('Cargarlo CAMBIA el dibujo (era el bug: no cambiaba)');
F = ficha({ pCodigo: '002022', pNombre: 'producto prueba', pCodigoBarras: '' });
dibujar(F);
const antes = F.svg();
F.els.pCodigoBarras.value = BARRAS_DE_VERDAD;
dibujar(F);
t('el preview de antes y el de despues son distintos', antes !== F.svg());
t('el de antes eran ceros', antes.indexOf('0000000000000') > 0);
t('el de ahora es el codigo del envase', F.svg().indexOf('<svg') > 0);

grupo('Un codigo mal tipeado no se ofrece para imprimir');
F = ficha({ pCodigo: '002022', pNombre: 'x', pCodigoBarras: '8414775016009' });  /* verificador 5, no 9 */
dibujar(F);
t('el simbolo se ve, para que se note que esta ahi', F.svg().indexOf('<svg') > 0);
t('pero no se puede imprimir', F.boton() === 'none');
t('y se dice que el codigo no cierra', /no cierra/.test(F.els.pBarrasAviso.textContent), F.els.pBarrasAviso.textContent);
imprimir(F);
t('imprimir tampoco abre nada', F.est.abrio === 0);

grupo('El de 13 digitos de verdad cierra');
t('8414775016005 cierra', fnDe('codigoBarrasCierra', F.sb)(BARRAS_DE_VERDAD) === true);
t('8414775016009 no', fnDe('codigoBarrasCierra', F.sb)('8414775016009') === false);

grupo('La etiqueta impresa desde la ficha lleva el codigo de barras');
t('etiquetaHTML acepta la bandera `barras`', /o\.barras \? codigoBarrasDe\(p\) : etiquetaCodigoDe\(p\)/.test(ETQ));
const imp = ETQ.slice(ETQ.indexOf('function imprimirEtiquetaProducto'), ETQ.indexOf('function openEtiquetasModal'));
t('y la ficha la manda', /barras: true/.test(imp));
t('la seccion Etiquetas NO la manda: ahi la etiqueta es la del local',
  !/barras: true/.test(ETQ.slice(ETQ.indexOf('function etiquetasImprimir'))));

grupo('El panel redibuja cuando corresponde');
t('el campo de codigo de barras redibuja al escribir',
  /id="pCodigoBarras"[^>]*oninput="[^"]*refrescarBarrasProducto\(\)/.test(HTML));
t('el codigo interno ya NO redibuja',
  !/id="pCodigo"[^>]*oninput="[^"]*refrescarBarrasProducto\(\)/.test(HTML));
t('al abrir la ficha se redibuja',
  /_pintarEstadoCodigo\(\);[\s\S]{0,300}refrescarBarrasProducto\(\)/.test(HTML));
t('escanear con la ficha abierta tambien: poner .value no dispara input',
  /campo\.value = cod;[\s\S]{0,400}refrescarBarrasProducto\(\)/.test(LECTOR));

grupo('El texto de la ficha ya no dice lo contrario');
const bloque = HTML.slice(HTML.indexOf('id="pBarrasVacio"'), HTML.indexOf('id="pBarrasVacio"') + 700);
t('no promete que la etiqueta se arme con el codigo interno', !/etiqueta del local se arma con el/.test(bloque));
t('dice que el producto no tiene codigo de barras cargado', /no tiene c&oacute;digo de barras cargado/.test(bloque));
t('y avisa que el codigo interno no sirve', /c&oacute;digo interno no sirve/.test(bloque));

console.log('\n' + ok + ' pasaron, ' + mal + ' fallaron');
process.exit(mal ? 1 : 0);
