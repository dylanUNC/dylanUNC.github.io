let pdfBytes = null;
let originalFileName = "";

document.getElementById('pdfInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  
  originalFileName = file.name.replace('.pdf', '');
  document.getElementById('fileName').innerText = `📄 ${file.name}`;
  document.getElementById('progressContainer').classList.remove('hidden');
  document.getElementById('actions').classList.add('hidden');
  document.getElementById('preview').innerHTML = "";
  
  try {
    const arrayBuffer = await file.arrayBuffer();
    pdfBytes = new Uint8Array(arrayBuffer);
    await procesarPDF(pdfBytes);
  } catch (error) {
    alert('Error: ' + error.message);
    console.error(error);
    document.getElementById('progressContainer').classList.add('hidden');
  }
});

async function procesarPDF(pdfData) {
  try {
    updateProgress(5, "Cargando PDF...");
    
    // Cargar el PDF
    const loadingTask = pdfjsLib.getDocument({ data: pdfData });
    const pdf = await loadingTask.promise;
    const numPages = pdf.numPages;
    
    updateProgress(10, `Analizando ${numPages} páginas...`);
    
    // PRIMERO: Detectar si el PDF tiene texto editable
    let tieneTextoEditable = false;
    let textoExtraidoTotal = "";
    let paginasSinTexto = [];
    
    // Revisar primeras 3 páginas para decidir
    const paginasRevisar = Math.min(3, numPages);
    
    for (let i = 1; i <= paginasRevisar; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map(item => item.str).join(' ').trim();
      
      if (pageText.length > 50) { // Tiene texto significativo
        tieneTextoEditable = true;
        textoExtraidoTotal += `\n\n--- PÁGINA ${i} ---\n${pageText}\n`;
      } else {
        paginasSinTexto.push(i);
      }
    }
    
    let metodoUsado = "";
    let textoFinal = "";
    
    if (tieneTextoEditable && paginasSinTexto.length === 0) {
      // CASO 1: Todo el PDF tiene texto editable
      metodoUsado = "📝 TEXTO EDITABLE DETECTADO";
      updateProgress(30, "Extrayendo texto directamente (rápido)...");
      
      // Extraer texto de todas las páginas
      for (let i = 1; i <= numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => item.str).join(' ');
        textoFinal += `\n\n========== PÁGINA ${i} ==========\n${pageText}\n`;
        updateProgress(30 + (i / numPages) * 60, `Extrayendo página ${i}/${numPages}...`);
      }
      
    } else if (tieneTextoEditable && paginasSinTexto.length > 0) {
      // CASO 2: PDF MIXTO (algunas páginas con texto, otras son imágenes)
      metodoUsado = "🔄 PDF MIXTO (texto + imágenes) - Aplicando OCR donde sea necesario";
      updateProgress(30, "PDF mixto detectado. Procesando...");
      
      // Procesar todas las páginas
      for (let i = 1; i <= numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => item.str).join(' ').trim();
        
        if (pageText.length > 50) {
          // Esta página tiene texto editable
          textoFinal += `\n\n========== PÁGINA ${i} (texto) ==========\n${pageText}\n`;
          updateProgress(30 + (i / numPages) * 60, `Página ${i}: extrayendo texto...`);
        } else {
          // Esta página necesita OCR
          updateProgress(30 + (i / numPages) * 60, `Página ${i}: aplicando OCR (imagen)...`);
          const textoOCR = await aplicarOCRAPagina(page);
          textoFinal += `\n\n========== PÁGINA ${i} (OCR) ==========\n${textoOCR}\n`;
        }
      }
      
    } else {
      // CASO 3: TODO el PDF son imágenes/escaneos
      metodoUsado = "🖼️ PDF ESCANEADO - Aplicando OCR completo";
      updateProgress(30, "PDF sin texto editable detectado. Aplicando OCR a todas las páginas...");
      
      for (let i = 1; i <= numPages; i++) {
        updateProgress(30 + (i / numPages) * 60, `Aplicando OCR a página ${i}/${numPages} (esto puede tardar)...`);
        const page = await pdf.getPage(i);
        const textoOCR = await aplicarOCRAPagina(page);
        textoFinal += `\n\n========== PÁGINA ${i} ==========\n${textoOCR}\n`;
        
        // Mostrar vista previa
        const vistaDiv = document.getElementById('preview');
        const miniTexto = document.createElement('div');
        miniTexto.style.fontSize = '11px';
        miniTexto.style.margin = '5px';
        miniTexto.style.padding = '8px';
        miniTexto.style.backgroundColor = '#e8f0fe';
        miniTexto.style.borderRadius = '5px';
        miniTexto.innerHTML = `<strong>Página ${i}:</strong> ${textoOCR.substring(0, 80)}...`;
        vistaDiv.appendChild(miniTexto);
      }
    }
    
    updateProgress(95, "Generando PDF con el texto extraído...");
    await generarPDFConTexto(pdfData, textoFinal, metodoUsado);
    
  } catch (error) {
    console.error(error);
    alert("Error: " + error.message + "\n\nSi el PDF es muy grande, intenta con menos páginas.");
    document.getElementById('progressContainer').classList.add('hidden');
  }
}

async function aplicarOCRAPagina(page) {
  // Convertir página a imagen
  const viewport = page.getViewport({ scale: 2.0 });
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  
  await page.render({ canvasContext: context, viewport }).promise;
  
  // Aplicar OCR
  const { data: { text } } = await Tesseract.recognize(
    canvas.toDataURL('image/png'),
    'spa+eng',
    {
      logger: m => console.log(m),
    }
  );
  
  return text.trim() || "[Página sin texto reconocible]";
}

async function generarPDFConTexto(originalPdfBytes, textoExtraido, metodo) {
  try {
    const pdfDoc = await PDFLib.PDFDocument.load(originalPdfBytes);
    
    // Crear página de resumen
    const resumenPage = pdfDoc.addPage([600, 800]);
    let y = 750;
    
    resumenPage.drawText("📄 INFORME DE EXTRACCIÓN DE TEXTO", {
      x: 50,
      y: y,
      size: 16,
      color: PDFLib.rgb(0, 0.3, 0.8)
    });
    
    y -= 30;
    
    resumenPage.drawText(metodo, {
      x: 50,
      y: y,
      size: 12,
      color: PDFLib.rgb(0, 0.5, 0)
    });
    
    y -= 30;
    
    resumenPage.drawText(`Documento: ${originalFileName}`, {
      x: 50,
      y: y,
      size: 10,
      color: PDFLib.rgb(0.3, 0.3, 0.3)
    });
    
    y -= 40;
    
    resumenPage.drawText("🔽 TEXTO EXTRAÍDO 🔽", {
      x: 50,
      y: y,
      size: 14,
      color: PDFLib.rgb(0.8, 0.4, 0)
    });
    
    y -= 25;
    
    // Añadir el texto extraído
    const lines = textoExtraido.split('\n');
    let currentY = y;
    let paginaActual = resumenPage;
    
    for (let line of lines) {
      if (currentY < 50) {
        // Crear nueva página
        const nuevaPagina = pdfDoc.addPage([600, 800]);
        paginaActual = nuevaPagina;
        currentY = 750;
      }
      
      const shortLine = line.length > 100 ? line.substring(0, 97) + "..." : line;
      
      paginaActual.drawText(shortLine, {
        x: 50,
        y: currentY,
        size: 9,
        color: PDFLib.rgb(0, 0, 0)
      });
      
      currentY -= 12;
    }
    
    const pdfBytesFinal = await pdfDoc.save();
    pdfBytes = pdfBytesFinal;
    
    let mensajeFinal = "✅ ¡Proceso completado! ";
    if (metodo.includes("TEXTO EDITABLE")) {
      mensajeFinal += "Se extrajo el texto directamente del PDF.";
    } else if (metodo.includes("MIXTO")) {
      mensajeFinal += "Se combinó texto editable con OCR para las páginas escaneadas.";
    } else {
      mensajeFinal += "Se aplicó OCR completo al PDF escaneado.";
    }
    
    updateProgress(100, mensajeFinal);
    document.getElementById('actions').classList.remove('hidden');
    
  } catch (error) {
    throw new Error("Error al generar PDF: " + error.message);
  }
}

function updateProgress(percent, message) {
  const progressBar = document.getElementById('ocrProgress');
  const textSpan = document.getElementById('progressText');
  if (progressBar) progressBar.value = percent;
  if (textSpan) textSpan.innerText = `${Math.round(percent)}% - ${message}`;
}

document.getElementById('downloadBtn').addEventListener('click', () => {
  if (!pdfBytes) return;
  const blob = new Blob([pdfBytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${originalFileName}_TEXTO_COMPLETO.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

document.getElementById('resetBtn').addEventListener('click', () => {
  location.reload();
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(err => console.log('SW error:', err));
}
