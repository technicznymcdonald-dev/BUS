const socket = io();

const linesListEl = document.getElementById('lines-list');
const addForm = document.getElementById('add-line-form');
const newNumberInput = document.getElementById('new-number');
const newDestinationInput = document.getElementById('new-destination');
const clearBtn = document.getElementById('clear-btn');
const backBtn = document.getElementById('back-btn');
const soundBtn = document.getElementById('sound-btn');
const canvas = document.getElementById('display-canvas');
const ctx = canvas.getContext('2d');

let currentLines = [];
let currentText = 'NIEAKTYWNY';
let activeDisplayData = null; // Przechowuje aktualną linię i kierunek

/* ===================== SILNIK MATRYCY PUNKTOWEJ ===================== */

const ROWS = 24; 
const FONT_SCALE = 0.72; 
const DOT_FILL_RATIO = 0.34; 
const SCROLL_SPEED = 22; 

const offCanvas = document.createElement('canvas');
const offCtx = offCanvas.getContext('2d');

let cols = 40; 
let textCols = 0; 
let scrollOffset = 0;
let lastFrameTime = null;
let needsScroll = false;

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(rect.width * dpr));
  canvas.height = Math.max(1, Math.round(rect.height * dpr));
  cols = Math.max(10, Math.round((rect.width / rect.height) * ROWS));
  rasterizeText(currentText);
}

function rasterizeText(text) {
  const fontSize = Math.max(4, Math.round(ROWS * FONT_SCALE));
  offCtx.font = `bold ${fontSize}px "Courier New", monospace`;
  const measured = offCtx.measureText(text || '').width;
  textCols = Math.max(cols, Math.ceil(measured) + 4);

  offCanvas.width = textCols;
  offCanvas.height = ROWS;

  offCtx.fillStyle = '#000';
  offCtx.fillRect(0, 0, offCanvas.width, offCanvas.height);

  offCtx.font = `bold ${fontSize}px "Courier New", monospace`;
  offCtx.fillStyle = '#fff';
  offCtx.textBaseline = 'middle';
  offCtx.textAlign = 'left';

  const startX = textCols > cols ? 2 : Math.floor((cols - measured) / 2);
  offCtx.fillText(text || '', startX, ROWS / 2 + 1);

  needsScroll = textCols > cols;
  scrollOffset = 0;
  lastFrameTime = null;
}

function drawFrame(timestamp) {
  if (lastFrameTime === null) lastFrameTime = timestamp;
  const dt = (timestamp - lastFrameTime) / 1000;
  lastFrameTime = timestamp;

  if (needsScroll) {
    scrollOffset += SCROLL_SPEED * dt;
    const wrapAt = textCols + 6;
    if (scrollOffset >= wrapAt) scrollOffset -= wrapAt;
  }

  const data = offCtx.getImageData(0, 0, offCanvas.width, offCanvas.height).data;

  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const dotW = w / cols;
  const dotH = h / ROWS;
  const radius = Math.min(dotW, dotH) * DOT_FILL_RATIO;

  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < cols; col++) {
      let sampleCol = col;
      if (needsScroll) {
        sampleCol = Math.floor(col + scrollOffset) % (textCols + 6);
      }

      let on = false;
      if (sampleCol < textCols) {
        const idx = (row * offCanvas.width + sampleCol) * 4;
        on = data[idx] > 80 && data[idx + 3] > 80;
      }

      const cx = col * dotW + dotW / 2;
      const cy = row * dotH + dotH / 2;

      ctx.beginPath();
      if (on) {
        ctx.fillStyle = '#ff9100';
        ctx.shadowColor = '#ff9100';
        ctx.shadowBlur = radius * 1.6;
      } else {
        ctx.fillStyle = '#231a10';
        ctx.shadowBlur = 0;
      }
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  requestAnimationFrame(drawFrame);
}

function setDisplayText(text) {
  currentText = text;
  rasterizeText(currentText);
}

window.addEventListener('resize', resizeCanvas);
new ResizeObserver(resizeCanvas).observe(canvas);
requestAnimationFrame(drawFrame);
resizeCanvas();

/* ===================== SYSTEM ODTWARZANIA DŹWIĘKÓW ===================== */

// Mapowanie sekwencji dźwięków w folderze /sounds/
// Umieść odpowiednie pliki MP3 w folderze: public/sounds/
const LINE_SOUND_MAP = {
  "92_PODBÓRZ": ["sounds/gong.mp3", "sounds/linia_92.mp3", "sounds/kierunek_podborz.mp3"],
  "DEFAULT": ["sounds/gong.mp3"]
};

let currentAudio = null;

function playSoundSequence(fileList) {
  if (!fileList || fileList.length === 0) return;
  
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }

  let index = 0;

  function playNext() {
    if (index >= fileList.length) return;
    
    currentAudio = new Audio(fileList[index]);
    currentAudio.play().catch(err => {
      console.warn("Błąd podczas odtwarzania pliku:", fileList[index], err);
    });

    index++;
    currentAudio.onended = playNext;
  }

  playNext();
}

soundBtn.addEventListener('click', () => {
  if (!activeDisplayData) {
    playSoundSequence(LINE_SOUND_MAP["DEFAULT"]);
    return;
  }

  const key = `${activeDisplayData.number}_${activeDisplayData.destination}`.toUpperCase();
  const sequence = LINE_SOUND_MAP[key] || LINE_SOUND_MAP["DEFAULT"];
  
  playSoundSequence(sequence);
});

/* ===================== PANEL STEROWANIA / SYNC ===================== */

function renderLines() {
  linesListEl.innerHTML = '';
  currentLines.forEach((line, index) => {
    const btn = document.createElement('button');
    btn.className = 'line-btn';
    btn.innerHTML = `
      <span class="num">${escapeHtml(line.number)}</span>
      <span class="dest">${escapeHtml(line.destination)}</span>
      <button class="del" title="Usuń linię">✕</button>
    `;
    btn.addEventListener('click', (e) => {
      if (e.target.classList.contains('del')) return;
      socket.emit('select-line', line);
    });
    btn.querySelector('.del').addEventListener('click', (e) => {
      e.stopPropagation();
      currentLines.splice(index, 1);
      saveLines();
    });
    linesListEl.appendChild(btn);
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function saveLines() {
  fetch('/api/lines', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(currentLines),
  });
}

socket.on('lines-updated', (lines) => {
  currentLines = lines;
  renderLines();
});

function enterFullscreen() {
  document.body.classList.add('fullscreen-mode');
  resizeCanvas();
}

function exitFullscreen() {
  document.body.classList.remove('fullscreen-mode');
  resizeCanvas();
}

socket.on('display-updated', (display) => {
  activeDisplayData = display;
  if (!display || !display.number) {
    setDisplayText('NIEAKTYWNY');
    exitFullscreen();
  } else {
    setDisplayText(`${display.number}  ${display.destination}`.toUpperCase());
    enterFullscreen();
  }
});

addForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const number = newNumberInput.value.trim();
  const destination = newDestinationInput.value.trim();
  if (!number || !destination) return;
  currentLines.push({ number, destination });
  saveLines();
  newNumberInput.value = '';
  newDestinationInput.value = '';
});

clearBtn.addEventListener('click', () => {
  socket.emit('clear-display');
});

backBtn.addEventListener('click', () => {
  exitFullscreen();
});