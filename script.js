// Configuración del Worker de PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

// Elementos del DOM
const bookContainer = document.getElementById('flip-book');
const loading = document.getElementById('loading');
const pageInfo = document.getElementById('page-info');
const prevBtn = document.getElementById('prev-btn');
const nextBtn = document.getElementById('next-btn');
const ttsBtn = document.getElementById('tts-btn');
const zoomInBtn = document.getElementById('zoom-in-btn');
const zoomOutBtn = document.getElementById('zoom-out-btn');
const zoomResetBtn = document.getElementById('zoom-reset-btn');
const natureSoundBtn = document.getElementById('nature-sound-btn');
const natureBadge = document.getElementById('nature-badge');

// Variables de estado
let pageFlip = null;
let pagesText = []; // Guarda el texto extraído de cada página
let currentScale = 1.0;
const SCALE_STEP = 0.15;
const MAX_SCALE = 1.8;
const MIN_SCALE = 0.8;

// Estado de sonido de naturaleza
let natureSoundEnabled = true;
let audioCtx = null;
let natureLoopTimer = null;

// Lista de palabras clave que activan efectos de naturaleza
const NATURE_KEYWORDS = [
    'árbol', 'arbol', 'bosque', 'pájaro', 'pajaro', 'ave', 'aves', 'animal', 'animales',
    'perro', 'gato', 'león', 'leon', 'tigre', 'oso', 'selva', 'río', 'rio', 'viento',
    'lluvia', 'flor', 'flores', 'planta', 'hoja', 'hojas', 'naturaleza', 'mariposa',
    'pez', 'peces', 'pajarito', 'caballo', 'vaca', 'oveja', 'fauna', 'jardín', 'jardin', 'bosques'
];

// 1. Cargar automáticamente cuento.pdf al cargar el sitio
document.addEventListener('DOMContentLoaded', () => {
    loadPDF('cuento.pdf');
});

async function loadPDF(pdfUrl) {
    loading.style.display = 'block';
    bookContainer.style.display = 'none';
    bookContainer.innerHTML = '';
    pagesText = [];

    if (pageFlip) {
        pageFlip.destroy();
        pageFlip = null;
    }

    try {
        const pdf = await pdfjsLib.getDocument(pdfUrl).promise;
        const totalPages = pdf.numPages;

        const firstPage = await pdf.getPage(1);
        const viewportInfo = firstPage.getViewport({ scale: 1.5 });
        const pageWidth = viewportInfo.width;
        const pageHeight = viewportInfo.height;

        // Bucle para procesar cada página y extraer su texto
        for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
            const page = await pdf.getPage(pageNum);
            
            // Extraer texto plano para la lectura en voz alta y detección de ambiente
            const textContent = await page.getTextContent();
            const textString = textContent.items.map(item => item.str).join(' ');
            pagesText.push(textString);

            // Renderizar la página en Canvas
            const viewport = page.getViewport({ scale: 1.5 });
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;

            await page.render({
                canvasContext: context,
                viewport: viewport
            }).promise;

            const pageDiv = document.createElement('div');
            pageDiv.className = 'page';
            pageDiv.appendChild(canvas);
            bookContainer.appendChild(pageDiv);
        }

        // Inicializar Flipbook
        bookContainer.style.display = 'block';
        pageFlip = new St.PageFlip(bookContainer, {
            width: pageWidth,
            height: pageHeight,
            size: "stretch",
            minWidth: 315,
            maxWidth: pageWidth,
            minHeight: 420,
            maxHeight: pageHeight,
            showCover: true,
            maxShadowOpacity: 0.5,
            usePortrait: true
        });

        const pages = document.querySelectorAll('.page');
        pageFlip.loadFromHTML(pages);

        // Evento que se dispara al pasar de página
        pageFlip.on('flip', () => {
            updatePageInfo();
            stopSpeech(); // Detiene la voz alta anterior
            checkAndPlayNatureSound(); // Comprueba si la nueva página tiene naturaleza
        });

        updatePageInfo();
        checkAndPlayNatureSound();
        loading.style.display = 'none';

    } catch (error) {
        console.error('Error al cargar cuento.pdf:', error);
        loading.innerText = 'No se pudo cargar el cuento. Asegúrate de que el archivo "cuento.pdf" exista en la raíz de tu repositorio.';
    }
}

// Actualizar texto indicador de página actual
function updatePageInfo() {
    if (!pageFlip) return;
    const current = pageFlip.getCurrentPageIndex() + 1;
    const total = pageFlip.getPageCount();
    pageInfo.innerText = `Página ${current} de ${total}`;
}

// --- 4. Navegación ---
prevBtn.addEventListener('click', () => {
    if (pageFlip) pageFlip.flipPrev();
});

nextBtn.addEventListener('click', () => {
    if (pageFlip) pageFlip.flipNext();
});

// --- 3. Controles de Zoom ---
zoomInBtn.addEventListener('click', () => {
    if (currentScale < MAX_SCALE) {
        currentScale += SCALE_STEP;
        applyZoom();
    }
});

zoomOutBtn.addEventListener('click', () => {
    if (currentScale > MIN_SCALE) {
        currentScale -= SCALE_STEP;
        applyZoom();
    }
});

zoomResetBtn.addEventListener('click', () => {
    currentScale = 1.0;
    applyZoom();
});

function applyZoom() {
    bookContainer.style.transform = `scale(${currentScale})`;
}

// --- 3. Lectura en Voz Alta (Text-to-Speech) ---
ttsBtn.addEventListener('click', () => {
    if (!('speechSynthesis' in window)) {
        alert('Tu navegador no admite lectura en voz alta.');
        return;
    }

    if (window.speechSynthesis.speaking) {
        stopSpeech();
    } else {
        readCurrentPage();
    }
});

function readCurrentPage() {
    if (!pageFlip || pagesText.length === 0) return;

    const pageIndex = pageFlip.getCurrentPageIndex();
    let textToRead = pagesText[pageIndex] || '';

    // Si está en pantalla dividida (modo libro abierto), leer también la hoja derecha
    if (pageFlip.getOrientation() === 'landscape' && pageIndex + 1 < pagesText.length && pageIndex > 0) {
        if (pagesText[pageIndex + 1]) {
            textToRead += ' ' + pagesText[pageIndex + 1];
        }
    }

    if (!textToRead.trim()) {
        textToRead = "Esta página no contiene texto computable.";
    }

    const utterance = new SpeechSynthesisUtterance(textToRead);
    utterance.lang = 'es-ES';
    utterance.rate = 0.85; // Velocidad pausada idónea para niños / baja visión

    const voices = window.speechSynthesis.getVoices();
    const spanishVoice = voices.find(v => v.lang.startsWith('es'));
    if (spanishVoice) {
        utterance.voice = spanishVoice;
    }

    utterance.onstart = () => {
        ttsBtn.innerHTML = '⏹️ Detener lectura';
        ttsBtn.classList.add('speaking');
    };

    utterance.onend = resetTtsButton;
    utterance.onerror = resetTtsButton;

    window.speechSynthesis.speak(utterance);
}

function stopSpeech() {
    if ('speechSynthesis' in window && window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
    }
    resetTtsButton();
}

function resetTtsButton() {
    ttsBtn.innerHTML = '🔊 Leer en voz alta';
    ttsBtn.classList.remove('speaking');
}

// --- 5. Detección y Reproducción de Sonidos de la Naturaleza (Web Audio API) ---
natureSoundBtn.addEventListener('click', () => {
    natureSoundEnabled = !natureSoundEnabled;
    if (natureSoundEnabled) {
        natureSoundBtn.innerText = '🌿 Sonidos: ON';
        natureSoundBtn.classList.add('active');
        natureSoundBtn.classList.remove('disabled');
        checkAndPlayNatureSound();
    } else {
        natureSoundBtn.innerText = '🌿 Sonidos: OFF';
        natureSoundBtn.classList.remove('active');
        natureSoundBtn.classList.add('disabled');
        stopNatureSound();
    }
});

function pageHasNatureKeywords(pageIndex) {
    if (!pagesText[pageIndex]) return false;
    
    let text = pagesText[pageIndex].toLowerCase();
    
    // Si estamos en modo horizontal, también comprobamos la página contigua
    if (pageFlip && pageFlip.getOrientation() === 'landscape' && pagesText[pageIndex + 1]) {
        text += ' ' + pagesText[pageIndex + 1].toLowerCase();
    }

    return NATURE_KEYWORDS.some(keyword => text.includes(keyword));
}

function checkAndPlayNatureSound() {
    stopNatureSound();
    
    if (!natureSoundEnabled || !pageFlip) return;

    const pageIndex = pageFlip.getCurrentPageIndex();
    if (pageHasNatureKeywords(pageIndex)) {
        natureBadge.classList.remove('hidden');
        playNatureAmbience();
    } else {
        natureBadge.classList.add('hidden');
    }
}

// Sintetizador Web Audio API: Genera gorjeos de pájaros y brisa del bosque sin depender de mp3
function initAudioContext() {
    if (!audioCtx) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        audioCtx = new AudioContext();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

function playNatureAmbience() {
    initAudioContext();
    if (!audioCtx) return;

    // Disparar un trino de pájaro cada 2.5 segundos
    playBirdChirp();
    natureLoopTimer = setInterval(() => {
        if (natureSoundEnabled && pageHasNatureKeywords(pageFlip.getCurrentPageIndex())) {
            playBirdChirp();
        } else {
            stopNatureSound();
        }
    }, 2500);
}

function playBirdChirp() {
    if (!audioCtx) return;

    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = 'sine';
    
    // Barrido de frecuencia para simular el trino
    const startFreq = 2200 + Math.random() * 600;
    const endFreq = 3200 + Math.random() * 400;

    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.exponentialRampToValueAtTime(endFreq, now + 0.12);
    osc.frequency.exponentialRampToValueAtTime(startFreq, now + 0.24);

    // Envolvente de volumen
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.15, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start(now);
    osc.stop(now + 0.32);
}

function stopNatureSound() {
    if (natureLoopTimer) {
        clearInterval(natureLoopTimer);
        natureLoopTimer = null;
    }
    natureBadge.classList.add('hidden');
}