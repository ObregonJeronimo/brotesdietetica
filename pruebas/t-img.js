/* Prueba esUrlImagen y urlImagenPortable sacadas del fuente real de app.js */
const fs=require('fs');
const src=fs.readFileSync('app.js','utf8');
function extraer(n){
  const i=src.indexOf('function '+n+'(');
  let b=src.indexOf('{',i),prof=0,k;
  for(k=b;k<src.length;k++){ if(src[k]==='{')prof++; else if(src[k]==='}'){prof--;if(!prof)break;} }
  return src.slice(i,k+1);
}
global.location={href:'https://brotesdietetica.vercel.app/',origin:'https://brotesdietetica.vercel.app'};
eval(extraer('esUrlImagen')+'\n'+extraer('urlImagenPortable')+'\nglobal.A=esUrlImagen;global.B=urlImagenPortable;');
let ok=0,fail=0;
const t=(d,c)=>{ if(c){ok++;console.log('  OK   '+d);} else {fail++;console.log('  FALLA '+d);} };

console.log('\nLo que hay guardado HOY en la base');
t('el /admin de heroImg se RECHAZA', A('https://brotesdietetica.vercel.app/admin')===false);
t('el /admin de ctaImg se RECHAZA',  A('https://brotesdietetica.vercel.app/admin')===false);
t('admin.html tambien se rechaza',   A('https://brotesdietetica.vercel.app/admin.html')===false);
t('el logo absoluto se acepta',      A('https://brotesdietetica.vercel.app/img/logo-brotes.svg')===true);
t('y se vuelve relativo',            B('https://brotesdietetica.vercel.app/img/logo-brotes.svg')==='img/logo-brotes.svg');

console.log('\nLo que sube el Editor Web');
t('URL de Firebase Storage',         A('https://firebasestorage.googleapis.com/v0/b/brotesdietetica-2f78e.firebasestorage.app/o/site%2FheroImg.jpg?alt=media&token=abc')===true);
t('Storage queda tal cual',          B('https://firebasestorage.googleapis.com/v0/b/x/o/site%2Fa.jpg?alt=media')!==null);
t('el dominio nuevo del bucket',     A('https://brotesdietetica-2f78e.firebasestorage.app/site/heroImg.webp')===true);

console.log('\nArchivos del repo');
t('ruta relativa img/',              A('img/hero.jpg')===true);
t('con ./ adelante',                 A('./img/hero.jpg')===true);
t('con / adelante',                  A('/img/hero.jpg')===true);

console.log('\nBasura que no debe pasar');
t('vacio',                           A('')===false);
t('null',                            A(null)===false);
t('undefined',                       A(undefined)===false);
t('solo espacios',                   A('   ')===false);
t('un numero',                       A(12345)===false);
t('la home',                         A('https://brotesdietetica.vercel.app/')===false);
t('una pagina cualquiera',           A('https://brotesdietetica.vercel.app/politicas.html')===false);
t('javascript:',                     A('javascript:alert(1)')===false);
t('data: uri',                       A('data:image/png;base64,iVBOR')===false);

console.log('\nCasos limite');
t('mayusculas en la extension',      A('https://x.com/foto.JPG')===true);
t('con query detras',                A('https://x.com/foto.webp?v=2')===true);
t('con hash detras',                 A('https://x.com/foto.png#a')===true);
t('extension en el medio no cuenta', A('https://x.com/foto.jpg/otra')===false);
t('otro dominio con /img/ no se toca', B('https://otro.com/img/a.svg')==='https://otro.com/img/a.svg');

console.log('\n'+ok+' pasaron, '+fail+' fallaron');
process.exit(fail?1:0);
