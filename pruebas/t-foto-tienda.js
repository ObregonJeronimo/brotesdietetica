/**
 * LA TIENDA: UN PRODUCTO SIN FOTO MUESTRA EL LOGO DE BROTES (16/11/2026).
 *
 * Pedido de la clienta: en la tienda, el fondo de los productos sin foto con el logo de Brotes.
 * Antes había dos dibujos: un rectángulo beige con "Sin imagen" (sin foto cargada) y el brote
 * gris de img/default-product.svg (lo tienen guardado muchos productos, y es lo que se ponía si
 * la foto no abría). Ahora la tienda usa img/sin-foto-tienda.svg en los tres casos: tarjeta,
 * ventana del producto y carrito. El panel sigue con default-product.svg.
 */
const fs = require('fs');
const path = require('path');
const RAIZ = path.join(__dirname, '..');

let ok = 0, fail = 0;
const t = (d, c, extra) => {
  if (c) { ok++; console.log('  OK   ' + d); }
  else { fail++; console.log('  FALLA ' + d + (extra !== undefined ? '   [' + JSON.stringify(extra).slice(0, 300) + ']' : '')); }
};

const app = fs.readFileSync(path.join(RAIZ, 'app.js'), 'utf8');
const min = fs.readFileSync(path.join(RAIZ, 'app.min.js'), 'utf8');

console.log('\n-- fotoTienda --');
const linea = app.split(/\r?\n/).filter(l => /^const FOTO_SIN_FOTO=|^function fotoTienda\(/.test(l));
t('app.js define FOTO_SIN_FOTO y fotoTienda', linea.length === 2, linea);
const fotoTienda = new Function(linea.join('\n') + '\nreturn fotoTienda;')();
const SIN = 'img/sin-foto-tienda.svg';
t('sin foto: el logo', fotoTienda('') === SIN && fotoTienda(undefined) === SIN && fotoTienda(null) === SIN);
t('con la foto por defecto (el brote gris): el logo', fotoTienda('img/default-product.svg') === SIN);
t('  también con la dirección entera', fotoTienda('https://brotesdietetica.vercel.app/img/default-product.svg') === SIN);
const real = 'https://firebasestorage.googleapis.com/v0/b/x/o/productos%2Fa.webp?alt=media';
t('con una foto de verdad: esa foto', fotoTienda(real) === real);

console.log('\n-- dónde se usa --');
t('la tarjeta', /const img=fotoTienda\(optImg\(p\.imagen,400\)\);/.test(app));
t('  ya no dibuja "Sin imagen"', !/Sin imagen/.test(app));
t('la ventana del producto (fotos y sin fotos)', /esc\(fotoTienda\(optImg\(url,800\)\|\|url\)\)/.test(app) && /'<img src="'\+FOTO_SIN_FOTO\+'" class="pdm-img active"/.test(app));
t('el carrito', /esc\(fotoTienda\(optImg\(item\.imagen,200\)\)\)/.test(app));
t('  y si la foto no abre, el logo (antes quedaba rota)', /class="cart-item-image" onerror="this\.onerror=null;this\.src=\\''\+FOTO_SIN_FOTO\+'\\'"/.test(app));
t('si la foto no abre, el logo (tarjeta, ventana y carrito)', (app.match(/this\.src=\\''\+FOTO_SIN_FOTO\+'\\'/g) || []).length === 3);
t('la tienda ya no nombra default-product.svg salvo para reconocerlo', (app.match(/default-product/g) || []).length === 1);
t('app.min.js está recompilado', min.includes('sin-foto-tienda.svg') && !min.includes('Sin imagen'));

console.log('\n-- el archivo --');
const svg = fs.readFileSync(path.join(RAIZ, SIN), 'utf8');
t('es un SVG con el logo adentro (un <img> con SVG no carga archivos de afuera)', /^<svg /.test(svg) && /href="data:image\/png;base64,/.test(svg));
const logo = fs.readFileSync(path.join(RAIZ, 'img/logo-brotes.png')).toString('base64');
t('  y es el logo de Brotes', svg.includes(logo));
t('  liviano (menos de 40 KB)', svg.length < 40000, svg.length);
t('el panel no se tocó: default-product.svg sigue', fs.existsSync(path.join(RAIZ, 'img/default-product.svg')));

console.log('\n' + ok + ' pasaron, ' + fail + ' fallaron');
process.exit(fail ? 1 : 0);
