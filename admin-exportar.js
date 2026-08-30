/* ==========================================================================
   EXPORTAR A PDF Y A EXCEL

   Un solo motor para los dos formatos. Lo que cada seccion arma es un objeto
   plano que describe el documento -titulo, subtitulo, y una lista de bloques-
   y de ahi salen tanto el PDF como el Excel. Nadie dibuja un PDF a mano.

   Se hizo asi por lo de siempre en este panel: dos exportadores parecidos se
   separan solos, y a los tres meses el Excel tiene una columna que el PDF no.
   Ademas el objeto es una estructura comun y se puede probar sin navegador,
   que es donde estan los errores que no se ven.

     {
       titulo: 'Proveedor LISTA 1',
       subtitulo: 'Ultimos 90 dias',
       archivo: 'BROTES_proveedor_LISTA1_2026-08-29',
       bloques: [
         { tipo:'pares', titulo:'Resumen', filas:[['Facturado','$1.000'], ...] },
         { tipo:'tabla', titulo:'Top 10', columnas:['#','Producto','Monto'],
           anchos:[10,90,30], derecha:[2], filas:[[1,'Nueces','$7.000'], ...] }
       ]
     }

   `anchos` va en milimetros y solo lo usa el PDF; `derecha` son los indices de
   las columnas que se alinean a la derecha. El Excel saca el ancho de columna
   del texto mas largo.
   ========================================================================== */

/* Las dos librerias entran por <script src> en admin.html. Si alguna no cargo
   -sin internet, o un bloqueador- hay que decirlo y no reventar con
   "jsPDF is not defined", que no le dice nada a nadie. */
function _expHayPdf() { return !!(window.jspdf && window.jspdf.jsPDF); }
function _expHayExcel() { return typeof XLSX !== 'undefined' && !!XLSX.utils; }

function _expTexto(v) { return v == null ? '' : String(v); }

/* Fecha corta para el nombre del archivo. Sin barras ni dos puntos: Windows no
   deja guardar un archivo que las tenga. */
function _expHoy() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

/* Un nombre de archivo que no dependa de lo que el usuario escribio. */
function _expNombre(base) {
  return 'BROTES_' + String(base || 'export')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) +
    '_' + _expHoy();
}

/* ------------------------------------------------------------------- PDF */
function _expPDF(doc) {
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = pdf.internal.pageSize.getWidth();
  const H = pdf.internal.pageSize.getHeight();
  const M = 14, ancho = W - M * 2;
  let y = M;

  const salto = (alto) => {
    if (y + (alto || 6) > H - M) { pdf.addPage(); y = M; return true; }
    return false;
  };

  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(15); pdf.setTextColor(17);
  pdf.text(_expTexto(doc.titulo), M, y); y += 6;
  if (doc.subtitulo) {
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9); pdf.setTextColor(110);
    pdf.text(_expTexto(doc.subtitulo), M, y); y += 5;
  }
  pdf.setDrawColor(210); pdf.line(M, y, W - M, y); y += 6;

  (doc.bloques || []).forEach((b) => {
    salto(14);
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(11); pdf.setTextColor(17);
    pdf.text(_expTexto(b.titulo), M, y); y += 6;

    if (b.tipo === 'pares') {
      (b.filas || []).forEach((f) => {
        salto();
        pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9); pdf.setTextColor(70);
        pdf.text(_expTexto(f[0]), M + 2, y);
        pdf.setTextColor(17);
        pdf.text(_expTexto(f[1]), W - M - 2, y, { align: 'right' });
        y += 5;
      });
      y += 3;
      return;
    }

    /* tabla */
    const cols = b.columnas || [];
    const der = new Set(b.derecha || []);
    /* Si no vienen anchos, se reparte parejo. Se escala para que entren justo
       en el ancho util: un ancho de mas empuja la ultima columna fuera de la
       hoja y el numero se corta sin que se note. */
    let anchos = (b.anchos && b.anchos.length === cols.length)
      ? b.anchos.slice() : cols.map(() => ancho / (cols.length || 1));
    const suma = anchos.reduce((s, x) => s + x, 0) || 1;
    anchos = anchos.map((x) => x * ancho / suma);
    const xDe = (i) => M + anchos.slice(0, i).reduce((s, x) => s + x, 0);

    const cabecera = () => {
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8); pdf.setTextColor(110);
      cols.forEach((c, i) => {
        const x = der.has(i) ? xDe(i) + anchos[i] - 1 : xDe(i) + 1;
        pdf.text(_expTexto(c), x, y, der.has(i) ? { align: 'right' } : undefined);
      });
      y += 4;
      pdf.setDrawColor(225); pdf.line(M, y - 1.5, W - M, y - 1.5);
    };
    cabecera();

    (b.filas || []).forEach((f) => {
      if (salto()) cabecera();
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9); pdf.setTextColor(30);
      cols.forEach((_, i) => {
        const x = der.has(i) ? xDe(i) + anchos[i] - 1 : xDe(i) + 1;
        /* Recortado al ancho de su columna: sin esto un nombre largo se
           encima con la columna de al lado y quedan dos textos ilegibles. */
        const txt = pdf.splitTextToSize(_expTexto(f[i]), anchos[i] - 2)[0] || '';
        pdf.text(txt, x, y, der.has(i) ? { align: 'right' } : undefined);
      });
      y += 5;
    });
    y += 3;
  });

  const paginas = pdf.internal.getNumberOfPages();
  for (let i = 1; i <= paginas; i++) {
    pdf.setPage(i);
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8); pdf.setTextColor(140);
    pdf.text(_expHoy() + '  ·  ' + i + ' de ' + paginas, W - M, H - 8, { align: 'right' });
  }
  pdf.save(_expNombre(doc.archivo) + '.pdf');
}

/* ----------------------------------------------------------------- EXCEL */
function _expExcel(doc) {
  const filas = [[_expTexto(doc.titulo)]];
  if (doc.subtitulo) filas.push([_expTexto(doc.subtitulo)]);
  filas.push([]);

  (doc.bloques || []).forEach((b) => {
    filas.push([_expTexto(b.titulo)]);
    if (b.tipo === 'tabla' && b.columnas) filas.push(b.columnas.map(_expTexto));
    (b.filas || []).forEach((f) => filas.push(f.map((c) => (
      /* Los numeros van como numeros para que Excel pueda sumarlos. Lo que ya
         viene formateado ("$1.000") se deja como texto a proposito: convertirlo
         seria adivinar el separador de miles y ahi empiezan los 1000 que se
         vuelven 1. */
      typeof c === 'number' ? c : _expTexto(c)
    ))));
    filas.push([]);
  });

  const hoja = XLSX.utils.aoa_to_sheet(filas);
  const cols = Math.max.apply(null, filas.map((f) => f.length).concat([1]));
  hoja['!cols'] = [];
  for (let i = 0; i < cols; i++) {
    const largo = filas.reduce((m, f) => Math.max(m, _expTexto(f[i]).length), 8);
    hoja['!cols'].push({ wch: Math.min(60, largo + 2) });
  }
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, 'Datos');
  XLSX.writeFile(libro, _expNombre(doc.archivo) + '.xlsx');
}

/* ------------------------------------------------------------------ salida */
function exportarDoc(doc, formato) {
  if (!doc || !(doc.bloques || []).length) {
    showAdminToast('No hay nada para exportar', 'error');
    return false;
  }
  try {
    if (formato === 'excel') {
      if (!_expHayExcel()) {
        showAdminToast('La librería de Excel no cargó. Recargue la página.', 'error');
        return false;
      }
      _expExcel(doc);
    } else {
      if (!_expHayPdf()) {
        showAdminToast('La librería de PDF no cargó. Recargue la página.', 'error');
        return false;
      }
      _expPDF(doc);
    }
    showAdminToast('Exportado', 'success');
    return true;
  } catch (e) {
    showAdminToast('No se pudo exportar: ' + e.message, 'error');
    return false;
  }
}

window.exportarDoc = exportarDoc;
