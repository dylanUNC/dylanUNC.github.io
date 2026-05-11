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
    
    updateProgress(10, `El PDF tiene ${numPages} páginas. Analizando...`);
    
    // Detectar si el PDF tiene texto editable
    let tieneTextoEditable = false;
    
    // Revisar primera página para decidir
    const primeraPagina = await pdf.getPage(1);
    const contenidoTexto = await primeraPagina.getTextContent();
    const textoPrimeraPagina = contenidoTexto.items.map(item => item.str).join(' ').trim();
    
    if (textoPrimeraPagina.length > 100) {
      tieneTextoEditable = true;
    }
    
    let metodoUsado = "";
    
    if (tieneTextoEditable) {
      metodoUsado = "📝 TEXTO EDITABLE - Extrayendo directamente";
      updateProgress(20, "Extrayendo texto del PDF...");
      
      for (let i = 1; i <= numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => item.str).join(' ');
        textoCompleto += `\n\n${"=".repeat(50)}\n📄 PÁGINA ${i}\n${"=".repeat(50)}\n${pageText}\n`;
        updateProgress(20 + (i / numPages) * 70, `Leyendo página ${i}/${numPages}...`);
      }
      
    } else {
      metodoUsado = "🖼️ PDF ESCANEADO - Aplicando OCR (puede tardar)";
      updateProgress(20, "Aplicando OCR a todas las páginas...");
      
      for (let i = 1; i <= numPages; i++) {
        updateProgress(20 + (i / numPages) * 70, `OCR página ${i}/${numPages}...`);
        
        const page = await pdf.getPage(i);
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
        
        textoCompleto += `\n\n${"=".repeat(50)}\n📄 PÁGINA ${i}\n${"=".repeat(50)}\n${text.trim() || "[Sin texto reconocible]"}\n`;
        
        // Mostrar preview
        const vistaDiv = document.getElementById('preview');
        const miniTexto = document.createElement('div');
        miniTexto.style.fontSize = '11px';
        miniTexto.style.margin = '5px';
        miniTexto.style.padding = '8px';
        miniTexto.style.backgroundColor = '#e8f0fe';
        miniTexto.style.borderRadius = '5px';
        miniTexto.innerHTML = `<strong>Página ${i}:</strong> ${text.substring(0, 100)}...`;
        vistaDiv.appendChild(miniTexto);
      }
    }
    
    updateProgress(95, "Generando archivo de texto...");
    
    // Crear el archivo TXT con todo el contenido
    const fecha = new Date().toLocaleString();
    const archivoFinal = `================================================================================
📄 INFORME DE EXTRACCIÓN DE TEXTO
================================================================================
📌 Archivo original: ${originalFileName}.pdf
📅 Fecha: ${fecha}
🔧 Método usado: ${metodoUsado}
📊 Total páginas: ${numPages}
================================================================================

${textoCompleto}

================================================================================
FIN DEL DOCUMENTO
================================================================================`;
    
    // Descargar como TXT
    const blob = new Blob([archivoFinal], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${originalFileName}_TEXTO_COMPLETO.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    updateProgress(100, `✅ ¡Completado! Se descargó "${originalFileName}_TEXTO_COMPLETO.txt"`);
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
  alert("El archivo ya se descargó. Revisa tu carpeta de Descargas.");
});

document.getElementById('resetBtn').addEventListener('click', () => {
  location.reload();
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(err => console.log('SW error:', err));
}
