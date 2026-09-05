/* SOLO LECTURA. Baja los 873 de FRUTICOR y los 611 de Brotes a JSON local,
   para poder iterar la clasificacion sin volver a golpear Firestore. */
const admin = require('C:/Users/Usuario/Documents/brotesdietetica/functions/node_modules/firebase-admin');
const fs = require('fs');
const DIR = __dirname;
const LISTA_FRUTICOR = 'BsDYIsMLaUkEkesQdfDX';

const dbY = admin.initializeApp({ projectId: 'yerco-bb620' }, 'y').firestore();
const dbB = admin.initializeApp({ projectId: 'brotesdietetica-2f78e' }, 'b').firestore();

(async () => {
  const y = await dbY.collection('productos').get();
  const fru = y.docs.filter(d => d.data().lista === LISTA_FRUTICOR)
    .map(d => ({ id: d.id, ...d.data() }));
  fs.writeFileSync(DIR + '/fruticor.json', JSON.stringify(fru, null, 1));
  console.log('fruticor.json: ' + fru.length);

  const b = await dbB.collection('productos').get();
  const bro = b.docs.map(d => ({ id: d.id, ...d.data() }));
  fs.writeFileSync(DIR + '/brotes.json', JSON.stringify(bro, null, 1));
  console.log('brotes.json: ' + bro.length);

  const lb = await dbB.collection('listas').get();
  fs.writeFileSync(DIR + '/brotes-listas.json',
    JSON.stringify(lb.docs.map(d => ({ id: d.id, ...d.data() })), null, 1));
  console.log('listas: ' + lb.size);
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
