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
    const pdfData = new Uint8Array(arrayBuffer);
    await procesarPDF(pdfData);
  } catch (error) {
    alert('Error: ' + error.message);
    console.error(error);
    document.getElementById('progressContainer').classList.add('hidden');
  }
});

async function procesarPDF(pdfData) {
  try {
    updateProgress(5, "Cargando PDF...");
    
    const loadingTask = pdfjsLib.getDocument({ data: pdfData });
    const pdf = await loadingTask.promise;
    const numPages = pdf.numPages;
    
    updateProgress(10, `El PDF tiene ${numPages} páginas. Procesando...`);
    
    // Variable para almacenar todo el texto
    let todoElTexto = "";
    
    // Recorrer todas las páginas
    for (let i = 1; i <= numPages; i++) {
      updateProgress(10 + (i / numPages) * 80, `Procesando página ${i}/${numPages}...`);
      
      const page = await pdf.getPage(i);
      
      // Intentar extraer texto directamente primero
      const textContent = await page.getTextContent();
      let textoPagina = textContent.items.map(item => item.str).join(' ').trim();
      
      // Si no hay texto o es muy poco, hacer OCR (es una imagen)
      if (textoPagina.length < 50) {
        updateProgress(10 + (i / numPages) * 80, `Página ${i}: aplicando OCR...`);
        
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
        textoPagina = text.trim() || "[No se pudo reconocer texto en esta página]";
        
        // Mostrar preview del texto
        const vistaDiv = document.getElementById('preview');
        const miniTexto = document.createElement('div');
        miniTexto.style.fontSize = '11px';
        miniTexto.style.margin = '5px';
        miniTexto.style.padding = '8px';
        miniTexto.style.backgroundColor = '#e8f0fe';
        miniTexto.style.borderRadius = '5px';
        miniTexto.innerHTML = `<strong>Página ${i} (OCR):</strong> ${textoPagina.substring(0, 100)}...`;
        vistaDiv.appendChild(miniTexto);
      } else {
        // Mostrar preview del texto directo
        const vistaDiv = document.getElementById('preview');
        const miniTexto = document.createElement('div');
        miniTexto.style.fontSize = '11px';
        miniTexto.style.margin = '5px';
        miniTexto.style.padding = '8px';
        miniTexto.style.backgroundColor = '#d4edda';
        miniTexto.style.borderRadius = '5px';
        miniTexto.innerHTML = `<strong>Página ${i} (texto):</strong> ${textoPagina.substring(0, 100)}...`;
        vistaDiv.appendChild(miniTexto);
      }
      
      todoElTexto += `\n\n${"=".repeat(60)}\n📄 PÁGINA ${i}\n${"=".repeat(60)}\n${textoPagina}\n`;
    }
    
    updateProgress(95, "Creando archivo de texto...");
    
    // Crear el archivo TXT
    const fecha = new Date().toLocaleString();
    const archivoFinal = `================================================================================
📄 EXTRACCIÓN DE TEXTO COMPLETA
================================================================================
📌 Archivo: ${originalFileName}.pdf
📅 Fecha: ${fecha}
📊 Total páginas: ${numPages}
================================================================================

${todoElTexto}

================================================================================
FIN DEL DOCUMENTO - Texto extraído completamente
================================================================================`;
    
    // Descargar como archivo de texto
    const blob = new Blob([archivoFinal], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${originalFileName}_texto_completo.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    updateProgress(100, `✅ ¡COMPLETADO! Se descargó "${originalFileName}_texto_completo.txt"`);
    document.getElementById('actions').classList.remove('hidden');
    
  } catch (error) {
    console.error(error);
    alert("Error: " + error.message);
    document.getElementById('progressContainer').classList.add('hidden');
  }
}

function updateProgress(percent, message) {
  const progressBar = document.getElementById('ocrProgress');
  const textSpan = document.getElementById('progressText');
  if (progressBar) progressBar.value = percent;
  if (textSpan) textSpan.innerText = `${Math.round(percent)}% - ${message}`;
}

document.getElementById('downloadBtn').addEventListener('click', () => {
  alert("El archivo ya debería haberse descargado. Revisa tu carpeta de Descargas.\n\nSi no está, intenta nuevamente.");
});

document.getElementById('resetBtn').addEventListener('click', () => {
  location.reload();
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(err => console.log('SW error:', err));
}
