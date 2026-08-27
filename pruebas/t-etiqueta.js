/**
 * LA ETIQUETA DE EJEMPLO DEL EDITOR DE COMPROBANTES.
 *
 * El bug: renderFcePreview() cortaba los argumentos en `cliente` y no le pasaba
 * tipoEntrega a buildEtiquetaHTML. Adentro se decide con
 * `esRetiro = tipoEntrega==='retiro'`, y undefined no es 'retiro', asi que caia
 * SIEMPRE en la rama de envio. Como los items de ejemplo no traen costo de envio,
 * la fila salia "GRATIS": la etiqueta de muestra prometia envio a domicilio gratis
 * aunque el comercio tuviera los envios apagados en Configuracion.
 *
 * No daba error de consola y los comprobantes REALES estaban bien (esos si pasan
 * v.tipoEntrega), asi que solo se veia mirando la vista previa con los envios
 * apagados. Por eso la prueba mira el argumento, no el aspecto.
 *
 * Dos capas:
 *   1. que renderFcePreview PASE el septimo argumento, y con el valor que manda
 *      HACE_ENVIOS. Es la regresion exacta.
 *   2. que ese argumento sea determinante: se corre el buildEtiquetaHeader real
 *      con los dos valores y tiene que salir texto distinto. Si alguien algun dia
 *      hace que de lo mismo, la capa 1 sola no lo notaria.
 */
const fs = require('fs');
const src = fs.readFileSync('admin.html', 'utf8');

function cuerpo(nombre) {
  const i = src.indexOf('function ' + nombre + '(');
  if (i < 0) throw new Error('no encontre ' + nombre + ' en admin.html');
  let prof = 0, k;
  for (k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') prof++;
    else if (src[k] === '}') { prof--; if (!prof) break; }
  }
  return src.slice(i, k + 1);
}

let ok = 0, fail = 0;
const t = (d, c, extra) => {
  if (c) { ok++; console.log('  OK   ' + d); }
  else { fail++; console.log('  FALLA ' + d + (extra ? '   [' + extra + ']' : '')); }
};

/* ---------- capa 1: el argumento que se perdia ---------- */
/* DOM de mentira: solo lo que toca renderFcePreview. */
const campos = {
  fce_agradecimiento: 'Gracias por elegirnos', fce_subtitulo: '', fce_nombre: 'Brotes',
  fce_direccion: 'Colon 123', fce_email: 'a@b.com', fce_cuit: '', fce_instagram: '',
  fce_whatsapp: '', fce_slogan: '', fce_logoPreview: ''
};
let recibido = null;
const entorno = {
  document: {
    getElementById: (id) => (id === 'fcePreview'
      ? { set innerHTML(v) { /* no interesa el HTML, interesa el argumento */ } }
      : (id in campos ? { value: campos[id], src: campos[id] } : null))
  },
  URL: { createObjectURL: () => 'blob:x' },
  fceLogoFile: null,
  facturaConfig: { telefono: '351 687 2770' },
  HACE_ENVIOS: true,
  buildEtiquetaHTML: function () { recibido = Array.from(arguments); return ''; }
};
const correrPreview = new Function(
  'document', 'URL', 'fceLogoFile', 'facturaConfig', 'HACE_ENVIOS', 'buildEtiquetaHTML',
  cuerpo('renderFcePreview') + '\nrenderFcePreview();'
);
const previewCon = (haceEnvios) => {
  recibido = null;
  correrPreview(entorno.document, entorno.URL, entorno.fceLogoFile, entorno.facturaConfig, haceEnvios, entorno.buildEtiquetaHTML);
  return recibido;
};

console.log('\nEl septimo argumento (tipoEntrega) llega a buildEtiquetaHTML');
const conEnvios = previewCon(true);
const sinEnvios = previewCon(false);
t('la vista previa llama a buildEtiquetaHTML', Array.isArray(conEnvios));
t('manda al menos 7 argumentos (antes cortaba en 6)', conEnvios.length >= 7, 'mando ' + conEnvios.length);
t('tipoEntrega NO llega undefined (era la causa)', conEnvios[6] !== undefined, String(conEnvios[6]));
t('con los envios prendidos manda "envio"', conEnvios[6] === 'envio', String(conEnvios[6]));
t('con los envios apagados manda "retiro"', sinEnvios[6] === 'retiro', String(sinEnvios[6]));
t('el cliente de ejemplo sigue yendo en el sexto', conEnvios[5] === 'Cliente Ejemplo', String(conEnvios[5]));

/* ---------- capa 2: que el argumento cambie algo de verdad ---------- */
console.log('\nEse argumento decide lo que se imprime (buildEtiquetaHeader real)');
const armarHeader = new Function('esc', cuerpo('buildEtiquetaHeader') + '\nreturn buildEtiquetaHeader;')(
  (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
);
const fc = { agradecimiento: 'Gracias', subtitulo: '', nombre: 'Brotes', direccion: 'Colon 123', telefono: '351', email: '', cuit: '', logo: '' };
const htmlEnvio = armarHeader(fc, '27/08/2026', '00001', 'Cliente Ejemplo', 'envio');
const htmlRetiro = armarHeader(fc, '27/08/2026', '00001', 'Cliente Ejemplo', 'retiro');
t('con "envio" imprime Envio a domicilio', /Env.{0,3}o a domicilio/.test(htmlEnvio));
t('con "retiro" imprime Retiro en local', /Retiro en local/.test(htmlRetiro));
t('con "retiro" ya NO dice envio a domicilio', !/Env.{0,3}o a domicilio/.test(htmlRetiro));
t('undefined se comportaba como envio (la causa, documentada)', /Env.{0,3}o a domicilio/.test(armarHeader(fc, '27/08/2026', '00001', 'Cliente Ejemplo', undefined)));

console.log('\n' + ok + ' pasaron, ' + fail + ' fallaron');
process.exit(fail ? 1 : 0);
