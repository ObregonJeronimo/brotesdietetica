/* =============================================================================
   QUIEN PUEDE ENTRAR AL PANEL  —  Brotes Dietética
   =============================================================================
   Los admins viven en la colección /admins, un documento por mail (el id es el
   mail en minúsculas). Antes estaban escritos en cuatro archivos distintos y
   agregar a alguien pedía dos deploys; era fácil tocar solo uno y que la persona
   viera la pantalla sin poder guardar nada, o no pasara ni el login.

   TRES COSAS QUE CONVIENE TENER PRESENTES:

   1) El dueño está fijo en las reglas y no se puede quitar desde acá. Es la
      salida de emergencia: si esta colección quedara vacía, o alguien se sacara
      a sí mismo por error, sin eso nadie podría volver a entrar a arreglarlo.

   2) Tampoco se puede uno borrar a sí mismo. Un click de más y te quedás afuera
      de tu propio panel.

   3) Firestore resuelve el acceso leyendo esta colección, así que un admin nuevo
      puede trabajar al instante. Storage NO puede leer Firestore: eso se
      resuelve con un custom claim que pone la Cloud Function, y un claim viaja
      en el token. Por eso quien ya estaba logueado tiene que volver a entrar
      antes de poder subir imágenes.
   ============================================================================= */

let _admins = [];

/* Ya no hay admins "heredados": los que estaban escritos en el codigo se
   agregaron desde esta pantalla y ahora viven en la coleccion /admins, que es la
   unica fuente. Se quita la lista para que no queden mails sueltos en el codigo. */
const ADMINS_HEREDADOS = [];

async function loadAdmins() {
  const cont = document.getElementById('listaAdmins');
  if (!cont) return;
  cont.innerHTML = '<p style="font-size:0.85rem;color:var(--text-dim)">Cargando...</p>';
  try {
    const snap = await db.collection('admins').get();
    _admins = snap.docs.map(d => Object.assign({ mail: d.id }, d.data()));
    _admins.sort((a, b) => a.mail.localeCompare(b.mail));
  } catch (e) {
    cont.innerHTML = '<p style="font-size:0.85rem;color:var(--danger)">No se pudo leer la lista: ' +
      esc(e.message) + '</p>';
    return;
  }
  renderAdmins();
}

function renderAdmins() {
  const cont = document.getElementById('listaAdmins');
  if (!cont) return;
  const yo = (auth.currentUser && auth.currentUser.email || '').toLowerCase();

  const fila = (mail, esDuenio, extra) => {
    const soyYo = mail === yo;
    const puedeBorrar = !esDuenio && !soyYo;
    return '<div style="display:flex;align-items:center;gap:0.7rem;padding:0.65rem 0;' +
        'border-bottom:1px solid rgba(255,255,255,0.06)">' +
      '<i class="bi bi-person-circle" style="font-size:1.15rem;color:var(--text-dim);flex:0 0 auto"></i>' +
      '<div style="flex:1;min-width:0">' +
        '<div style="font-size:0.9rem;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' +
          esc(mail) + (soyYo ? ' <span style="font-weight:400;color:var(--text-dim);font-size:0.8rem">(su cuenta)</span>' : '') +
        '</div>' +
        (extra ? '<div style="font-size:0.76rem;color:var(--text-dim);line-height:1.4">' + extra + '</div>' : '') +
      '</div>' +
      (esDuenio
        ? '<span style="font-size:0.72rem;color:var(--accent-light);background:var(--accent-bg);' +
          'padding:2px 8px;border-radius:20px;white-space:nowrap">Dueño</span>'
        : (puedeBorrar
            ? '<button class="btn btn-secondary" style="width:auto;padding:4px 9px;font-size:0.78rem;' +
              'background:#7a2d2d;border-color:#7a2d2d;color:#fff" onclick="quitarAdmin(\'' +
              mail.replace(/'/g, "\\'") + '\')" title="Quitar el acceso"><i class="bi bi-trash"></i></button>'
            : '<span style="font-size:0.72rem;color:var(--text-dim);white-space:nowrap">No pod&eacute;s quitarte a vos</span>')) +
    '</div>';
  };

  /* Migración de una sola vez. Los admins vivían escritos en el código; al pasar a
     esta colección quedaron sin documento y por lo tanto sin acceso. Este botón
     aparece solo mientras la lista está vacía y desaparece solo en cuanto se usa. */
  let html = '';
  if (!_admins.length && Array.isArray(ADMINS_HEREDADOS) && ADMINS_HEREDADOS.length) {
    html += '<div style="background:rgba(237,184,51,0.1);border:1px solid rgba(237,184,51,0.35);' +
      'border-radius:var(--radius);padding:1rem 1.15rem;margin-bottom:1.1rem">' +
      '<div style="font-size:0.9rem;font-weight:700;margin-bottom:0.3rem">Faltan los admins que ya estaban</div>' +
      '<p style="font-size:0.82rem;color:var(--text-dim);line-height:1.5;margin-bottom:0.8rem">' +
        'Antes estaban escritos en el código. Ahora viven acá, y hasta que se agreguen no pueden entrar:<br>' +
        '<b style="color:var(--text-main)">' + ADMINS_HEREDADOS.map(esc).join('</b>, <b style="color:var(--text-main)">') + '</b>' +
      '</p>' +
      '<button class="btn btn-primary" style="width:auto" id="btnImportarAdmins" onclick="importarAdminsHeredados()">' +
        '<i class="bi bi-box-arrow-in-down"></i> Agregar a los ' + ADMINS_HEREDADOS.length + '</button>' +
      '</div>';
  }
  html += fila(MAIL_DUENIO, true, 'Acceso permanente. No puede quitarse.');
  _admins.forEach(a => {
    if (a.mail === MAIL_DUENIO) return;   /* por si quedó un documento viejo */
    const pend = a.claimPendiente === true;
    const nota = pend
      ? 'A&uacute;n no inici&oacute; sesi&oacute;n. Podr&aacute; subir im&aacute;genes desde su primer ingreso.'
      : (a.claimAplicadoEn
          ? 'Acceso completo.'
          : 'Si ya ten&iacute;a la sesi&oacute;n iniciada, debe volver a ingresar para subir im&aacute;genes.');
    html += fila(a.mail, false, nota);
  });
  cont.innerHTML = html;
}

/* ============================ AGREGAR ============================ */

function _mailValido(m) {
  /* A propósito no se intenta validar un mail "de verdad" con una expresión
     enorme: solo se descarta lo que seguro no lo es. Si el mail está mal escrito,
     el efecto es que esa persona no entra, no que se rompa nada. */
  return /^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(m);
}

async function agregarAdmin() {
  const inp = document.getElementById('nuevoAdminMail');
  const btn = document.getElementById('btnAgregarAdmin');
  const mail = (inp.value || '').trim().toLowerCase();

  if (!mail) { showAdminToast('Ingrese un correo electr\u00f3nico', 'error'); inp.focus(); return; }
  if (!_mailValido(mail)) { showAdminToast('El correo electr\u00f3nico no es v\u00e1lido', 'error'); inp.focus(); return; }
  if (mail === MAIL_DUENIO) { showAdminToast('El due\u00f1o ya tiene acceso permanente', 'error'); return; }
  if (_admins.some(a => a.mail === mail)) { showAdminToast('Ese correo ya tiene acceso', 'error'); return; }
  /* Cuentas que no son de Google no van a poder entrar, porque el login es solo con
     Google. Se avisa en vez de dejar un documento que no sirve para nada. */
  if (!/@(gmail\.com|googlemail\.com)$/.test(mail) &&
      !confirm('"' + mail + '" no es una cuenta de Gmail.\n\nAl panel se ingresa \u00fanicamente con una cuenta de Google. ' +
               'Si ese correo no est\u00e1 asociado a una cuenta de Google, no podr\u00e1 ingresar.\n\n\u00bfAgregarlo de todos modos?')) return;

  btn.disabled = true;
  try {
    await db.collection('admins').doc(mail).set({
      agregadoPor: (auth.currentUser && auth.currentUser.email) || '-',
      agregadoEn: firebase.firestore.FieldValue.serverTimestamp(),
      claimPendiente: true
    });
    if (typeof logAction === 'function') logAction('crear', 'Admin agregado: ' + mail, 'Acceso al panel');
    showAdminToast('Listo. ' + mail + ' ya puede ingresar.', 'success');
    inp.value = '';
    await loadAdmins();
  } catch (e) {
    showAdminToast('No se pudo agregar: ' + e.message, 'error');
  } finally { btn.disabled = false; }
}

/* ============================ QUITAR ============================ */

async function quitarAdmin(mail) {
  const yo = (auth.currentUser && auth.currentUser.email || '').toLowerCase();
  if (mail === MAIL_DUENIO) { showAdminToast('No puede quitarse el acceso al due\u00f1o', 'error'); return; }
  if (mail === yo) { showAdminToast('No puede quitarse el acceso a s\u00ed mismo', 'error'); return; }
  if (!confirm('Quitarle el acceso al panel a "' + mail + '"?\n\nPierde el acceso de inmediato. ' +
               'Los datos que carg\u00f3 se conservan.')) return;
  try {
    await db.collection('admins').doc(mail).delete();
    if (typeof logAction === 'function') logAction('eliminar', 'Admin quitado: ' + mail, 'Acceso al panel revocado');
    showAdminToast('Acceso quitado a ' + mail, 'success');
    await loadAdmins();
  } catch (e) {
    showAdminToast('No se pudo quitar: ' + e.message, 'error');
  }
}

/* ============================ MIGRACIÓN ============================ */

async function importarAdminsHeredados() {
  const btn = document.getElementById('btnImportarAdmins');
  if (btn) btn.disabled = true;
  let ok = 0, fallaron = [];
  for (const mail of ADMINS_HEREDADOS) {
    try {
      await db.collection('admins').doc(mail).set({
        agregadoPor: (auth.currentUser && auth.currentUser.email) || '-',
        agregadoEn: firebase.firestore.FieldValue.serverTimestamp(),
        claimPendiente: true,
        /* Deja rastro de que vinieron de la lista vieja y no los agrego alguien a mano */
        importadoDelCodigo: true
      });
      ok++;
    } catch (e) { fallaron.push(mail + ' (' + e.message + ')'); }
  }
  if (typeof logAction === 'function')
    logAction('crear', 'Admins importados del codigo: ' + ok, ADMINS_HEREDADOS.join(', '));
  if (fallaron.length) showAdminToast('Agregados ' + ok + '. Fallaron: ' + fallaron.join(' | '), 'error');
  else showAdminToast('Los ' + ok + ' ya pueden entrar', 'success');
  await loadAdmins();
}
