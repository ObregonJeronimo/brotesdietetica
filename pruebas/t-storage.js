/* Prueba fmtBytes / hayEspacio / pintarUso sacadas del fuente REAL de admin.html */
const fs = require('fs');
const src = fs.readFileSync('admin.html', 'utf8');

function extraer(n) {
  const i = src.indexOf('function ' + n + '(');
  if (i < 0) throw new Error('falta ' + n);
  let b = src.indexOf('{', i), prof = 0, k;
  for (k = b; k < src.length; k++) { if (src[k] === '{') prof++; else if (src[k] === '}') { prof--; if (!prof) break; } }
  return src.slice(i, k + 1);
}
function constante(n) {
  const m = src.match(new RegExp('const ' + n + '=([^;]+);'));
  return m[0];
}

let avisos = [];
global.showAdminToast = (m) => avisos.push(m);
const els = {};
global.document = {
  getElementById: (id) => els[id] || (els[id] = { style: {}, classList: { toggle(){}, add(){}, remove(){} }, textContent: '', innerHTML: '', title: '' })
};

let _uso = { bytes: 0, archivos: 0, exacto: false, listo: false };
/* Las declaraciones const/function que entran por eval quedan encerradas ahi,
   asi que se exponen a proposito para poder probarlas desde afuera. */
eval(constante('STORAGE_TOPE') + constante('STORAGE_MARGEN') +
     extraer('fmtBytes') + ';' + extraer('_libreStorage') + ';' +
     extraer('hayEspacio') + ';' + extraer('pintarUso') + ';' +
     'global.STORAGE_TOPE=STORAGE_TOPE;global.STORAGE_MARGEN=STORAGE_MARGEN;' +
     'global.fmtBytes=fmtBytes;global.hayEspacio=hayEspacio;global.pintarUso=pintarUso;');

const GB = 1024 * 1024 * 1024, MB = 1024 * 1024;
let ok = 0, fail = 0;
const t = (d, c) => { if (c) { ok++; console.log('  OK   ' + d); } else { fail++; console.log('  FALLA ' + d); } };

console.log('\nEl tope');
t('son 5 GB exactos', STORAGE_TOPE === 5 * GB);

console.log('\nComo se muestran los numeros');
t('0 -> 0 B', fmtBytes(0) === '0 B');
t('900 -> 900 B', fmtBytes(900) === '900 B');
t('2048 -> 2 KB', fmtBytes(2048) === '2 KB');
t('1,5 MB con coma', fmtBytes(1.5 * MB) === '1,5 MB');
t('340 MB sin decimal', fmtBytes(340 * MB) === '340 MB');
t('1,20 GB', fmtBytes(1.2 * GB) === '1,20 GB');
t('el tope se lee 5,00 GB', fmtBytes(STORAGE_TOPE) === '5,00 GB');

console.log('\nLa puerta antes de subir');
_uso = { bytes: 0, archivos: 0, exacto: true, listo: true };
avisos = [];
t('vacio: entra un archivo de 3 MB', hayEspacio(3 * MB) === true);
t('  sin avisar nada', avisos.length === 0);

_uso.bytes = 2 * GB;
t('a la mitad: sigue entrando', hayEspacio(5 * MB) === true);

/* Queda algo de lugar, pero no el suficiente para ESTE archivo. */
_uso.bytes = 4.9 * GB;
avisos = [];
t('queda poco: un archivo grande NO entra', hayEspacio(200 * MB) === false);
t('  y avisa', avisos.length === 1);
t('  dice cuanto ocupa el archivo', /200 MB/.test(avisos[0]));
t('  y cuanto queda libre', /quedan/.test(avisos[0]));
t('  y que hacer', /Elimine im.genes/.test(avisos[0]));
t('  sin mencionar el motivo del tope', !/pag|gast|cobr|plan|factur|Blaze|Firebase/i.test(avisos[0]));
avisos = [];
t('pero uno chico si entra', hayEspacio(30 * MB) === true);

_uso.bytes = STORAGE_TOPE;
avisos = [];
t('lleno del todo: no entra', hayEspacio(1) === false);
t('  el aviso lo dice claro', /No queda espacio/.test(avisos[0]));

console.log('\nEl margen de seguridad');
_uso.bytes = STORAGE_TOPE - STORAGE_MARGEN;
t('en el margen no entra ni 1 byte', hayEspacio(1) === false);
_uso.bytes = STORAGE_TOPE - STORAGE_MARGEN - 1024;
t('un poco antes, sí', hayEspacio(1024) === true);

console.log('\nCuando todavia no se sabe cuanto hay ocupado');
_uso = { bytes: 0, archivos: 0, exacto: false, listo: false };
avisos = [];
t('deja trabajar en vez de bloquear', hayEspacio(500 * MB) === true);
t('  sin avisos molestos', avisos.length === 0);

console.log('\nLa barra');
_uso = { bytes: 2.5 * GB, archivos: 120, exacto: true, listo: true };
pintarUso();
t('al 50% el ancho es 50%', els.sbUsoRelleno.style.width === '50.00%');
t('el texto dice lo usado y el tope', /2,50 GB<\/b> de 5,00 GB usados/.test(els.sbUsoTxt.innerHTML));
t('y cuantos archivos', /120 archivos/.test(els.sbUsoTxt.innerHTML));

_uso = { bytes: 5.5 * GB, archivos: 1, exacto: true, listo: true };
pintarUso();
t('pasado el tope la barra no se desborda', els.sbUsoRelleno.style.width === '100.00%');
t('un archivo va en singular', /1 archivo(?!s)/.test(els.sbUsoTxt.innerHTML));

_uso = { bytes: 0, archivos: 0, exacto: false, listo: false };
pintarUso();
t('mientras carga dice Calculando', /Calculando/.test(els.sbUsoTxt.textContent));

console.log('\n' + ok + ' pasaron, ' + fail + ' fallaron');
process.exit(fail ? 1 : 0);
