let pdfBytes = null;
let originalFileName = "";

document.getElementById('pdfInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  
  originalFileName = file.name.replace('.pdf', '');
  document.getElementById('fileName').innerText = `📄 ${file.name}`;
  document.getElementById('progressContainer').classList.remove('hidden');
  document.getElementById('actions').classList.add('hidden');
  
  const arrayBuffer = await file.arrayBuffer();
  pdfBytes = new Uint8Array(arrayBuffer);
  
  await performOCR(pdfBytes);
});

async function performOCR(pdfData) {
  try {
    // Cargar PDF con pdf.js
    const loadingTask = pdfjsLib.getDocument({ data: pdfData });
    const pdf = await loadingTask.promise;
    const numPages = pdf.numPages;
    let fullText = "";
    
    // Extraer texto de cada página (si ya tiene texto)
    for (let i = 1; i <= numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map(item => item.str).join(' ');
      fullText += pageText + "\n";
    }
    
    // Si el PDF ya tiene texto, no necesitamos OCR pesado
    if (fullText.trim().length > 100) {
      updateProgress(100, "PDF ya contiene texto extraíble");
      await addTextToPDF(pdfData, fullText);
      return;
    }
    
    // Convertir PDF a imágenes para OCR
    updateProgress(5, "Preparando páginas para OCR...");
    const pagesAsImages = [];
    
    for (let i = 1; i <= numPages; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 2.0 });
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      
      await page.render({ canvasContext: context, viewport }).promise;
      const imageData = canvas.toDataURL('image/png');
      pagesAsImages.push(imageData);
      
      const percent = 10 + (i / numPages) * 40;
      updateProgress(percent, `Procesando página ${i}/${numPages}...`);
    }
    
    // OCR con Tesseract
    let allOCRText = "";
    for (let i = 0; i < pagesAsImages.length; i++) {
      updateProgress(50 + (i / pagesAsImages.length) * 40, `OCR página ${i+1}/${pagesAsImages.length}...`);
      const { data: { text } } = await Tesseract.recognize(pagesAsImages[i], 'spa+eng', {
        logger: m => console.log(m)
      });
      allOCRText += `\n--- PÁGINA ${i+1} ---\n${text}\n`;
    }
    
    updateProgress(95, "Generando PDF final...");
    await addTextToPDF(pdfData, allOCRText);
    
  } catch (error) {
    console.error(error);
    alert("Error en OCR: " + error.message);
    document.getElementById('progressContainer').classList.add('hidden');
  }
}

async function addTextToPDF(originalPdfBytes, extractedText) {
  const pdfDoc = await PDFLib.PDFDocument.load(originalPdfBytes);
  const pages = pdfDoc.getPages();
  
  // Añadir el texto OCR como anotación en la última página (o podrías crear una nueva)
  // Para simplificar, mostramos el texto extraído en una nueva página al final
  const newPage = pdfDoc.addPage([600, 800]);
  const fontSize = 10;
  newPage.drawText("🔍 TEXTO EXTRAÍDO POR OCR:", {
    x: 50,
    y: 750,
    size: 14,
    color: PDFLib.rgb(0, 0.3, 0.8)
  });
  
  // Dividir el texto en líneas
  const lines = extractedText.split('\n');
  let y = 720;
  for (let line of lines) {
    if (y < 50) {
      // Si no hay espacio, crear otra página (simplificado)
      break;
    }
    newPage.drawText(line.substring(0, 100), {
      x: 50,
      y: y,
      size: fontSize,
      color: PDFLib.rgb(0, 0, 0)
    });
    y -= fontSize + 2;
  }
  
  const pdfBytesFinal = await pdfDoc.save();
  pdfBytes = pdfBytesFinal;
  
  updateProgress(100, "✅ OCR completado");
  document.getElementById('actions').classList.remove('hidden');
}

function updateProgress(percent, message) {
  const progressBar = document.getElementById('ocrProgress');
  const textSpan = document.getElementById('progressText');
  progressBar.value = percent;
  textSpan.innerText = `${Math.round(percent)}% - ${message || ''}`;
}

document.getElementById('downloadBtn').addEventListener('click', () => {
  if (!pdfBytes) return;
  const blob = new Blob([pdfBytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${originalFileName}_OCR.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

document.getElementById('resetBtn').addEventListener('click', () => {
  location.reload();
});