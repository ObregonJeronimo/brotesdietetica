const fs=require('fs');
const src=fs.readFileSync('admin.html','utf8');
const i=src.indexOf('function listaUsaPdfSemanal(');
let b=src.indexOf('{',i),prof=0,k;
for(k=b;k<src.length;k++){ if(src[k]==='{')prof++; else if(src[k]==='}'){prof--;if(!prof)break;} }
eval(src.slice(i,k+1)+'\nglobal.F=listaUsaPdfSemanal;');
let ok=0,fail=0;
const t=(d,c)=>{ if(c){ok++;console.log('  OK   '+d);} else {fail++;console.log('  FALLA '+d);} };

console.log('\nLo que hay hoy en la base');
t('FRUTICOR sin el campo -> se MUESTRA', F({nombre:'FRUTICOR'})===true);
console.log('\nListas creadas desde el panel (siempre escriben el campo)');
t('con la casilla marcada -> se muestra', F({nombre:'X',pdfSemanal:true})===true);
t('con la casilla vacia -> NO se muestra', F({nombre:'X',pdfSemanal:false})===false);
console.log('\nBordes');
t('null se trata como ausente', F({nombre:'X',pdfSemanal:null})===true);
t('sin lista seleccionada -> no se muestra', F(null)===false);
t('undefined explicito', F({nombre:'X',pdfSemanal:undefined})===true);
t('no depende del nombre', F({nombre:'CUALQUIERA'})===true);
console.log('\n'+ok+' pasaron, '+fail+' fallaron');
process.exit(fail?1:0);
