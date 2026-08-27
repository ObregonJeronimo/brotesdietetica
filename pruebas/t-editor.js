/* Simula la carga y el guardado del Editor Web con lo que hay HOY en la base,
   usando esUrlImagenAdmin sacada del fuente real de admin.html */
const fs=require('fs');
const src=fs.readFileSync('admin.html','utf8');
const i=src.indexOf('function esUrlImagenAdmin(');
let b=src.indexOf('{',i),prof=0,k;
for(k=b;k<src.length;k++){ if(src[k]==='{')prof++; else if(src[k]==='}'){prof--;if(!prof)break;} }
eval(src.slice(i,k+1)+'\nglobal.V=esUrlImagenAdmin;');

const SC_IMG_FIELDS=['heroImg','ctaImg','logoIcon','logoText','logoFooter'];
/* Lo que devuelve Firestore hoy, verificado por la API REST */
const enLaBase={
  heroImg:'https://brotesdietetica.vercel.app/admin',
  ctaImg:'https://brotesdietetica.vercel.app/admin',
  logoIcon:'https://brotesdietetica.vercel.app/img/logo-brotes.svg',
  logoText:'https://brotesdietetica.vercel.app/img/logo-brotes-dark.svg',
  logoFooter:'https://brotesdietetica.vercel.app/img/logo-brotes-light.svg'
};
const DELETE='<<BORRAR EL CAMPO>>';

let guardadas={},invalidas={},previews={};
SC_IMG_FIELDS.forEach(f=>{
  const v=enLaBase[f];
  if(v&&!V(v)){ invalidas[f]=true; guardadas[f]=null; }
  else { guardadas[f]=v||null; if(v) previews[f]=v; }
});

let ok=0,fail=0;
const t=(d,c)=>{ if(c){ok++;console.log('  OK   '+d);} else {fail++;console.log('  FALLA '+d);} };

console.log('\nAl ABRIR el Editor Web');
t('heroImg se detecta invalida', invalidas.heroImg===true);
t('ctaImg se detecta invalida', invalidas.ctaImg===true);
t('la vista previa del hero NO recibe /admin', previews.heroImg===undefined);
t('la vista previa del CTA tampoco', previews.ctaImg===undefined);
t('los 3 logos SI se muestran', previews.logoIcon&&previews.logoText&&previews.logoFooter);
t('avisa por 2 imagenes', Object.keys(invalidas).length===2);

console.log('\nAl apretar GUARDAR sin subir nada nuevo');
const data={};
SC_IMG_FIELDS.forEach(f=>{
  if(guardadas[f]) data[f]=guardadas[f];
  else if(invalidas[f]) data[f]=DELETE;
});
t('heroImg se BORRA de la base', data.heroImg===DELETE);
t('ctaImg se BORRA de la base', data.ctaImg===DELETE);
t('los logos se conservan intactos', data.logoIcon===enLaBase.logoIcon);
t('  (no se pierde ninguna imagen buena)', data.logoText&&data.logoFooter);

console.log('\nY la proxima vez que se abra (ya limpio)');
const base2={logoIcon:enLaBase.logoIcon,logoText:enLaBase.logoText,logoFooter:enLaBase.logoFooter};
let inv2={};
SC_IMG_FIELDS.forEach(f=>{ const v=base2[f]; if(v&&!V(v)) inv2[f]=true; });
t('ya no avisa nada', Object.keys(inv2).length===0);

console.log('\nSi el comercio sube una foto nueva');
t('una URL de Storage se acepta', V('https://firebasestorage.googleapis.com/v0/b/x/o/site%2FheroImg.webp?alt=media&token=t')===true);

console.log('\n'+ok+' pasaron, '+fail+' fallaron');
process.exit(fail?1:0);
