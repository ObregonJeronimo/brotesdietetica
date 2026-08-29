/**
 * EL CODIGO DEL CUPON ES EL ID DEL DOCUMENTO.
 *
 * Antes el cupon se guardaba con un id automatico y el codigo como un campo mas.
 * Para validarlo, la tienda tenia que hacer where('codigo','==',...), o sea un
 * LIST sobre /cupones, y para que eso funcione sin estar logueado la coleccion
 * tenia que quedar abierta:
 *
 *   GET .../databases/(default)/documents/cupones
 *
 * devolvia todos los codigos vigentes, con su monto y su maxUsos, a cualquiera.
 *
 * Ahora el codigo es el id: la tienda hace un get, y /cupones solo se puede
 * listar siendo admin. Eso apoya todo en una condicion que hay que sostener:
 *
 *   el codigo que guarda el PANEL y el que escribe la TIENDA tienen que salir
 *   identicos del saneado, y tienen que ser un id de documento valido.
 *
 * Si los dos saneados se separan, no explota nada: se crea el cupon, el cliente
 * escribe exactamente lo mismo que le dictaron, y le dice "no valido". Esto ya
 * pasaba antes de este cambio -el panel no sacaba acentos ni espacios y la tienda
 * si-, solo que fallaba por el otro lado.
 */
const fs = require('fs');
const path = require('path');
const RAIZ = path.join(__dirname, '..');

const admin = fs.readFileSync(path.join(RAIZ, 'admin.html'), 'utf8');
const tienda = fs.readFileSync(path.join(RAIZ, 'app.js'), 'utf8');
const reglas = fs.readFileSync(path.join(RAIZ, 'firestore.rules'), 'utf8');

let ok = 0, fail = 0;
const t = (d, c) => { if (c) { ok++; console.log('  OK   ' + d); } else { fail++; console.log('  FALLA ' + d); } };

/* ------------------------------------------------------- los dos saneados
   Se sacan del codigo de verdad, no se copian aca: si alguien cambia uno de los
   dos, esta prueba tiene que enterarse. */
function saneadoDe(texto, marca) {
  const i = texto.indexOf(marca);
  if (i < 0) return null;
  const linea = texto.slice(i, texto.indexOf('\n', i));
  const m = linea.match(/replace\((\/\[\^[^/]*\/g), *'' *\)/);
  if (!m) return null;
  const max = /slice\(0, *30\)/.test(linea) || /maxlength="30"/.test(linea) ? 30 : null;
  const re = new RegExp(m[1].slice(1, -2), 'g');
  return (v) => {
    const s = String(v).trim().toUpperCase().replace(re, '');
    return max ? s.slice(0, max) : s;
  };
}

const sanPanel = saneadoDe(admin, "let codigo=document.getElementById('cuponCodigo')");
const sanTienda = saneadoDe(tienda, "let codigo = (input?.value");

t('se encontro el saneado del panel', !!sanPanel);
t('se encontro el saneado de la tienda', !!sanTienda);

const CASOS = ['VERANO20', 'verano20', '  verano20  ', 'CUPÓN', 'CUPON VERANO',
               'DESC-10', 'a/b', 'ñandú', 'PROMO.2025', '20%OFF', 'Ñ',
               'X'.repeat(40), '__proto__', '.', '..', ''];

/* El invariante no es "los dos saneados dan lo mismo para cualquier texto": el
   panel RECORTA a 30 y la tienda RECHAZA lo que pase de 30, que no es lo mismo.
   Lo que tiene que valer es esto otro, que es lo que se rompe en la vida real:

     un codigo que el panel pudo GUARDAR, la tienda lo tiene que dejar igual.

   O sea que el cliente escribe lo que le dictaron y le sale ese mismo codigo. */
CASOS.forEach(c => {
  if (!sanPanel || !sanTienda) return;
  const guardado = sanPanel(c);
  if (!guardado) return;                 // no se puede crear, no hay nada que buscar
  t('la tienda no le cambia nada a ' + JSON.stringify(guardado) +
    ' (de ' + JSON.stringify(c) + ')', sanTienda(guardado) === guardado);
  t('el codigo de ' + JSON.stringify(c) + ' no pasa de 30, que es lo que la tienda acepta',
    guardado.length <= 30);
});

/* -------------------------------------------- y que sirva como id de documento
   Firestore no acepta cualquier cosa de id: nada de "/", ni "." solo, ni "..",
   ni algo que empiece y termine con doble guion bajo. Un codigo saneado a
   [A-Z0-9-] no puede caer en ninguno de esos casos, pero conviene sostenerlo
   aca: el dia que alguien agregue un caracter permitido al replace, esto avisa. */
const idValido = (s) => s.length > 0 && s.length <= 1500 && s.indexOf('/') < 0 &&
                        s !== '.' && s !== '..' && !/^__.*__$/.test(s);

CASOS.filter(c => sanPanel && sanPanel(c)).forEach(c => {
  t('el codigo de ' + JSON.stringify(c) + ' sirve como id', idValido(sanPanel(c)));
});

t('un codigo vacio no llega a guardarse', admin.indexOf("if(!codigo){showAdminToast") > 0);

/* --------------------------------------------------------------- las reglas */
const bloque = (reglas.match(/match \/cupones\/\{doc\} \{[\s\S]*?\n {4}\}/) || [''])[0];
t('cupones ya no tiene "allow read: if true"', !/allow read: *if true/.test(bloque));
t('cupones deja hacer get sin login (lo necesita el checkout)', /allow get: *if true/.test(bloque));
t('cupones NO deja listar sin ser admin', /allow list: *if isAdmin\(\)/.test(bloque));
t('cupones solo lo escribe un admin', /allow write: *if isAdmin\(\)/.test(bloque));

/* ------------------------------------------------- que nadie vuelva al where
   Es la linea que obligaba a dejar la coleccion abierta. */
t('la tienda no hace where sobre cupones', !/collection\('cupones'\)[\s\S]{0,40}where/.test(tienda));
t('la tienda lee el cupon por id', tienda.indexOf("collection('cupones').doc(codigo).get()") > 0);
t('el panel crea el cupon con el codigo de id', admin.indexOf("collection('cupones').doc(codigo).set(data)") > 0);

/* El update no puede volver a mandar el codigo: seria mover el documento. */
const upd = (admin.match(/collection\('cupones'\)\.doc\(editingCuponId\)\.update\(\{[^}]*\}/) || [''])[0];
t('al editar no se toca el codigo', !!upd && upd.indexOf('codigo') < 0);
t('al editar el campo del codigo queda bloqueado', admin.indexOf('inpCod.disabled=!!cup') > 0);

/* ------------------------------------------------------ el uso, punta a punta
   procesarUsoCupon busca el cupon por uso.cuponId. Como el id es el codigo, lo
   que la tienda anota en cuponesUsos tiene que ser el codigo. */
t('la tienda usa el codigo como cuponId', tienda.indexOf('_cuponAplicado.id || _cuponAplicado.codigo') > 0);

console.log('\n' + ok + ' pasaron, ' + fail + ' fallaron');
process.exit(fail ? 1 : 0);
