/**
 * EL NOMBRE QUE GOOGLE YA NOS DIO.
 *
 * El bug: el alta en clientesAuth escribia nombre:'' y apellido:'' fijos, aunque
 * user.displayName venia en el mismo objeto (tanto, que se usa unas lineas mas
 * abajo para las iniciales del avatar). El unico camino para llenarlo era el modal
 * "Completa tus datos", que solo aparece en el login ACTIVO: al restaurar la sesion
 * no se vuelve a mostrar. Quien no lo completaba en ese momento quedaba sin nombre
 * para siempre, y el panel los listaba a todos como "Sin nombre / datos incompletos"
 * aunque Google nos habia dicho como se llaman.
 *
 * El telefono NO lo da Google, asi que "datos incompletos" se mantiene hasta que lo
 * carguen: eso esta bien y no se toca.
 *
 * El tope de 80 no es cosmetico: firestore.rules exige validString(nombre,80) y
 * validString(apellido,80) en el create de clientesAuth. Sin recortar, un
 * displayName largo hace que se rechace el alta ENTERA y el cliente se queda sin
 * documento. (En YERCO esto quedo sin tope; si se portan cambios, mirar esto.)
 */
const fs = require('fs');
const src = fs.readFileSync('app.js', 'utf8');

const i = src.indexOf('function _nombreDesdeGoogle(');
if (i < 0) { console.log('  FALLA no encontre _nombreDesdeGoogle en app.js\n\n0 pasaron, 1 fallaron'); process.exit(1); }
let prof = 0, k;
for (k = src.indexOf('{', i); k < src.length; k++) {
  if (src[k] === '{') prof++;
  else if (src[k] === '}') { prof--; if (!prof) break; }
}
const F = new Function(src.slice(i, k + 1) + '\nreturn _nombreDesdeGoogle;')();

let ok = 0, fail = 0;
const t = (d, c, extra) => {
  if (c) { ok++; console.log('  OK   ' + d); }
  else { fail++; console.log('  FALLA ' + d + (extra ? '   [' + extra + ']' : '')); }
};
const parte = (dn) => { const r = F(dn); return r.nombre + '|' + r.apellido; };

console.log('\nNombres reales de la base');
t('"Jeronimo Obregon" -> Jeronimo | Obregon', parte('Jeronimo Obregon') === 'Jeronimo|Obregon', parte('Jeronimo Obregon'));
t('"thiago wendler morales" -> thiago | wendler morales', parte('thiago wendler morales') === 'thiago|wendler morales', parte('thiago wendler morales'));

console.log('\nUn solo nombre');
t('"Madonna" -> Madonna, sin apellido', parte('Madonna') === 'Madonna|', parte('Madonna'));

console.log('\nSin displayName: queda como antes, en blanco');
t('cadena vacia', parte('') === '|', parte(''));
t('null', parte(null) === '|', parte(null));
t('undefined', parte(undefined) === '|', parte(undefined));
t('solo espacios', parte('   ') === '|', parte('   '));

console.log('\nEspacios de mas: no ensucian el apellido');
t('"  Ana   Maria  Perez  " -> Ana | Maria Perez', parte('  Ana   Maria  Perez  ') === 'Ana|Maria Perez', parte('  Ana   Maria  Perez  '));
t('un espacio al final no inventa apellido', parte('Ana ') === 'Ana|', parte('Ana '));

console.log('\nLos topes que exige firestore.rules (validString 80)');
t('nombre de 200 caracteres se recorta a 80', F('X'.repeat(200)).nombre.length === 80, String(F('X'.repeat(200)).nombre.length));
t('apellido de 200 caracteres se recorta a 80', F('Ana ' + 'X'.repeat(200)).apellido.length === 80, String(F('Ana ' + 'X'.repeat(200)).apellido.length));
t('un nombre normal no se toca', F('Jeronimo Obregon').nombre === 'Jeronimo');

console.log('\nAcentos y caracteres reales');
t('"José María Ñañez" entero', parte('José María Ñañez') === 'José|María Ñañez', parte('José María Ñañez'));

console.log('\n' + ok + ' pasaron, ' + fail + ' fallaron');
process.exit(fail ? 1 : 0);
