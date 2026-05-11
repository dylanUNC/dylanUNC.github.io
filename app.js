let pdfOriginal = null;
let originalFileName = "";
let textoCompleto = "";

document.getElementById('pdfInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  
  originalFileName = file.name.replace('.pdf', '');
  document.getElementById('fileName').innerText = `📄 ${file.name}`;
  document.getElementById('progressContainer').classList.remove('hidden');
  document.getElementById('actions').classList.add('hidden');
  document.getElementById('preview').innerHTML = "";
  textoCompleto = "";
  
  try {
    const arrayBuffer = await file.arrayBuffer();
    pdfOriginal = new Uint8Array(arrayBuffer);
    await procesarPDF(pdfOriginal);
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
    
    let tieneTextoEditable = false;
    let paginasSinTexto = [];
    
    // Revisar primeras 3 páginas
    const paginasRevisar = Math.min(3, numPages);
    
    for (let i = 1; i <= paginasRevisar; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map(item => item.str).join(' ').trim();
      
      if (pageText.length > 50) {
        tieneTextoEditable = true;
        textoCompleto += `\n\n--- PÁGINA ${i} ---\n${pageText}\n`;
      } else {
        paginasSinTexto.push(i);
      }
    }
    
    let metodoUsado = "";
    
    if (tieneTextoEditable && paginasSinTexto.length === 0) {
      metodoUsado = "📝 TEXTO EDITABLE DETECTADO";
      updateProgress(30, "Extrayendo texto directamente...");
      
      for (let i = 1; i <= numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => item.str).join(' ');
        textoCompleto += `\n\n========== PÁGINA ${i} ==========\n${pageText}\n`;
        updateProgress(30 + (i / numPages) * 60, `Extrayendo página ${i}/${numPages}...`);
      }
      
    } else if (tieneTextoEditable && paginasSinTexto.length > 0) {
      metodoUsado = "🔄 PDF MIXTO (texto + imágenes)";
      updateProgress(30, "Procesando PDF mixto...");
      
      for (let i = 1; i <= numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => item.str).join(' ').trim();
        
        if (pageText.length > 50) {
          textoCompleto += `\n\n========== PÁGINA ${i} (texto) ==========\n${pageText}\n`;
          updateProgress(30 + (i / numPages) * 60, `Página ${i}: extrayendo texto...`);
        } else {
          updateProgress(30 + (i / numPages) * 60, `Página ${i}: aplicando OCR...`);
          const textoOCR = await aplicarOCRAPagina(page);
          textoCompleto += `\n\n========== PÁGINA ${i} (OCR) ==========\n${textoOCR}\n`;
        }
      }
      
    } else {
      metodoUsado = "🖼️ PDF ESCANEADO - Aplicando OCR completo";
      updateProgress(30, "Aplicando OCR a todas las páginas...");
      
      for (let i = 1; i <= numPages; i++) {
        updateProgress(30 + (i / numPages) * 60, `Página ${i}/${numPages} - OCR en progreso...`);
        const page = await pdf.getPage(i);
        const textoOCR = await aplicarOCRAPagina(page);
        textoCompleto += `\n\n========== PÁGINA ${i} ==========\n${textoOCR}\n`;
        
        // Mostrar preview
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
    
    updateProgress(95, "Creando PDF con el texto extraído...");
    await crearPDFConSoloTexto(textoCompleto, metodoUsado);
    
  } catch (error) {
    console.error(error);
    alert("Error: " + error.message);
    document.getElementById('progressContainer').classList.add('hidden');
  }
}

async function aplicarOCRAPagina(page) {
  const viewport = page.getViewport({ scale: 2.0 });
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  
  await page.render({ canvasContext: context, viewport }).promise;
  
  const { data: { text } } = await Tesseract.recognize(
    canvas.toDataURL('image/png'),
    'spa+eng',
    { logger: m => console.log(m) }
  );
  
  return text.trim() || "[Página sin texto reconocible]";
}

async function crearPDFConSoloTexto(texto, metodo) {
  try {
    // Crear un PDF NUEVO completamente desde cero
    const pdfDoc = await PDFLib.PDFDocument.create();
    
    // Página de título/informe
    const coverPage = pdfDoc.addPage([500, 700]);
    let y = 650;
    
    coverPage.drawText("📄 INFORME DE EXTRACCIÓN DE TEXTO", {
      x: 50,
      y: y,
      size: 14,
      color: PDFLib.rgb(0, 0.3, 0.8)
    });
    
    y -= 30;
    
    coverPage.drawText(metodo, {
      x: 50,
      y: y,
      size: 11,
      color: PDFLib.rgb(0, 0.5, 0)
    });
    
    y -= 30;
    
    coverPage.drawText(`Documento original: ${originalFileName}.pdf`, {
      x: 50,
      y: y,
      size: 9,
      color: PDFLib.rgb(0.3, 0.3, 0.3)
    });
    
    y -= 40;
    
    coverPage.drawText("🔽 TEXTO EXTRAÍDO 🔽", {
      x: 50,
      y: y,
      size: 12,
      color: PDFLib.rgb(0.8, 0.4, 0)
    });
    
    y -= 30;
    
    // Dividir el texto en páginas
    const lines = texto.split('\n');
    let currentPage = coverPage;
    let currentY = y;
    
    for (let line of lines) {
      if (currentY < 50) {
        currentPage = pdfDoc.addPage([500, 700]);
        currentY = 650;
      }
      
      const shortLine = line.length > 90 ? line.substring(0, 87) + "..." : line;
      
      try {
        currentPage.drawText(shortLine, {
          x: 50,
          y: currentY,
          size: 9,
          color: PDFLib.rgb(0, 0, 0)
        });
      } catch (e) {
        // Ignorar errores de caracteres especiales
      }
      
      currentY -= 12;
    }
    
    // Si no hay nada en el texto, mostrar mensaje
    if (texto.trim().length === 0) {
      currentPage.drawText("No se pudo extraer texto de este PDF.", {
        x: 50,
        y: currentY,
        size: 11,
        color: PDFLib.rgb(1, 0, 0)
      });
    }
    
    const pdfBytesFinal = await pdfDoc.save();
    
    // Descargar automáticamente
    const blob = new Blob([pdfBytesFinal], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${originalFileName}_TEXTO_EXTRAIDO.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    updateProgress(100, "✅ ¡Completado! Se descargó automáticamente el PDF con el texto extraído.");
    document.getElementById('actions').classList.remove('hidden');
    
  } catch (error) {
    throw new Error("Error al crear PDF: " + error.message);
  }
}

function updateProgress(percent, message) {
  const progressBar = document.getElementById('ocrProgress');
  const textSpan = document.getElementById('progressText');
  if (progressBar) progressBar.value = percent;
  if (textSpan) textSpan.innerText = `${Math.round(percent)}% - ${message}`;
}

document.getElementById('downloadBtn').addEventListener('click', () => {
  alert("El PDF ya se descargó automáticamente al finalizar el proceso.\n\nSi no lo ves, revisa tu carpeta de Descargas.");
});

document.getElementById('resetBtn').addEventListener('click', () => {
  location.reload();
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(err => console.log('SW error:', err));
}
