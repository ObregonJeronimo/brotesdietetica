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

/* Los que estaban escritos en el código antes de esta pantalla. Solo se usan para
   ofrecer la importación una vez; después de eso esta lista no hace nada y se puede
   borrar. El dueño no está porque no necesita documento. */
const ADMINS_HEREDADOS = [
  'thiagowendler53@gmail.com',
  'cecilialoreanaserafini@gmail.com',
  'joacobrarda06@gmail.com'
];

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
          esc(mail) + (soyYo ? ' <span style="font-weight:400;color:var(--text-dim);font-size:0.8rem">(vos)</span>' : '') +
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
  html += fila(MAIL_DUENIO, true, 'Siempre tiene acceso. No se puede quitar.');
  _admins.forEach(a => {
    if (a.mail === MAIL_DUENIO) return;   /* por si quedó un documento viejo */
    const pend = a.claimPendiente === true;
    const nota = pend
      ? 'Todav&iacute;a no inici&oacute; sesi&oacute;n. Va a poder subir im&aacute;genes desde su primer ingreso.'
      : (a.claimAplicadoEn
          ? 'Acceso completo.'
          : 'Si ya estaba logueado, tiene que volver a entrar para subir im&aacute;genes.');
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

  if (!mail) { showAdminToast('Escribí un mail', 'error'); inp.focus(); return; }
  if (!_mailValido(mail)) { showAdminToast('Ese mail no parece válido', 'error'); inp.focus(); return; }
  if (mail === MAIL_DUENIO) { showAdminToast('El dueño ya tiene acceso siempre', 'error'); return; }
  if (_admins.some(a => a.mail === mail)) { showAdminToast('Ese mail ya tiene acceso', 'error'); return; }
  /* Cuentas que no son de Google no van a poder entrar, porque el login es solo con
     Google. Se avisa en vez de dejar un documento que no sirve para nada. */
  if (!/@(gmail\.com|googlemail\.com)$/.test(mail) &&
      !confirm('"' + mail + '" no es un Gmail.\n\nAl panel se entra solo con una cuenta de Google. ' +
               'Si ese mail no está asociado a una cuenta de Google, no va a poder entrar.\n\n¿Agregarlo igual?')) return;

  btn.disabled = true;
  try {
    await db.collection('admins').doc(mail).set({
      agregadoPor: (auth.currentUser && auth.currentUser.email) || '-',
      agregadoEn: firebase.firestore.FieldValue.serverTimestamp(),
      claimPendiente: true
    });
    if (typeof logAction === 'function') logAction('crear', 'Admin agregado: ' + mail, 'Acceso al panel');
    showAdminToast('Listo. ' + mail + ' ya puede entrar.', 'success');
    inp.value = '';
    await loadAdmins();
  } catch (e) {
    showAdminToast('No se pudo agregar: ' + e.message, 'error');
  } finally { btn.disabled = false; }
}

/* ============================ QUITAR ============================ */

async function quitarAdmin(mail) {
  const yo = (auth.currentUser && auth.currentUser.email || '').toLowerCase();
  if (mail === MAIL_DUENIO) { showAdminToast('Al dueño no se le puede quitar el acceso', 'error'); return; }
  if (mail === yo) { showAdminToast('No podés quitarte el acceso a vos mismo', 'error'); return; }
  if (!confirm('Quitarle el acceso al panel a "' + mail + '"?\n\nDeja de poder entrar en el momento. ' +
               'Los datos que cargó quedan como están.')) return;
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
