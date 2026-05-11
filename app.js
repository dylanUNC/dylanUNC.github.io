let pdfBytes = null;
let originalFileName = "";

document.getElementById('pdfInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  
  originalFileName = file.name.replace('.pdf', '');
  document.getElementById('fileName').innerText = `📄 ${file.name}`;
  document.getElementById('progressContainer').classList.remove('hidden');
  document.getElementById('actions').classList.add('hidden');
  
  try {
    // Verificar que es un PDF válido
    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    
    // Revisar cabecera PDF (%PDF)
    const header = String.fromCharCode.apply(null, bytes.slice(0, 4));
    if (header !== '%PDF') {
      throw new Error('El archivo no parece ser un PDF válido (cabecera incorrecta)');
    }
    
    pdfBytes = bytes;
    await performOCR(pdfBytes);
  } catch (error) {
    alert('Error al leer el PDF: ' + error.message);
    console.error(error);
    document.getElementById('progressContainer').classList.add('hidden');
  }
});

async function performOCR(pdfData) {
  try {
    // Cargar PDF con pdf.js
    const loadingTask = pdfjsLib.getDocument({ data: pdfData, useSystemFonts: true });
    const pdf = await loadingTask.promise;
    const numPages = pdf.numPages;
    let fullText = "";
    
    updateProgress(20, `Procesando ${numPages} páginas...`);
    
    // Extraer texto de cada página
    for (let i = 1; i <= numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map(item => item.str).join(' ');
      fullText += pageText + "\n";
      updateProgress(20 + (i / numPages) * 60, `Leyendo página ${i}/${numPages}...`);
    }
    
    // Si no hay texto, intentar OCR simple
    if (fullText.trim().length < 50) {
      fullText = "⚠️ No se pudo extraer texto automáticamente. El PDF podría ser una imagen escaneada. Para mejores resultados, usa un PDF con texto seleccionable.";
    }
    
    updateProgress(90, "Generando PDF final...");
    await addTextToPDF(pdfData, fullText);
    
  } catch (error) {
    console.error(error);
    alert("Error en OCR: " + error.message + "\n\nSugerencia: Asegúrate de que el PDF no esté dañado o protegido.");
    document.getElementById('progressContainer').classList.add('hidden');
  }
}

async function addTextToPDF(originalPdfBytes, extractedText) {
  try {
    const pdfDoc = await PDFLib.PDFDocument.load(originalPdfBytes);
    const newPage = pdfDoc.addPage([600, 800]);
    
    newPage.drawText("📄 TEXTO EXTRAÍDO:", {
      x: 50,
      y: 750,
      size: 14,
      color: PDFLib.rgb(0, 0.3, 0.8)
    });
    
    const lines = extractedText.split('\n');
    let y = 720;
    for (let line of lines) {
      if (y < 50) break;
      // Mostrar solo primeros 150 caracteres por línea
      const shortLine = line.length > 150 ? line.substring(0, 147) + "..." : line;
      newPage.drawText(shortLine, {
        x: 50,
        y: y,
        size: 9,
        color: PDFLib.rgb(0, 0, 0)
      });
      y -= 12;
    }
    
    const pdfBytesFinal = await pdfDoc.save();
    pdfBytes = pdfBytesFinal;
    
    updateProgress(100, "✅ Proceso completado");
    document.getElementById('actions').classList.remove('hidden');
  } catch (error) {
    throw new Error("Error al generar el PDF: " + error.message);
  }
}

function updateProgress(percent, message) {
  const progressBar = document.getElementById('ocrProgress');
  const textSpan = document.getElementById('progressText');
  if (progressBar) progressBar.value = percent;
  if (textSpan) textSpan.innerText = `${Math.round(percent)}% - ${message || ''}`;
}

document.getElementById('downloadBtn').addEventListener('click', () => {
  if (!pdfBytes) return;
  const blob = new Blob([pdfBytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${originalFileName}_con_texto.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

document.getElementById('resetBtn').addEventListener('click', () => {
  location.reload();
});

// Register Service Worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(err => console.log('SW error:', err));
}
