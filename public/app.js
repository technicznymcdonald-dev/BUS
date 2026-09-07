const socket = io();

const linesListEl = document.getElementById('lines-list');
const addForm = document.getElementById('add-line-form');
const newNumberInput = document.getElementById('new-number');
const newDestinationInput = document.getElementById('new-destination');
const clearBtn = document.getElementById('clear-btn');
const backBtn = document.getElementById('back-btn');
const soundBtn = document.getElementById('sound-btn');
const bellBtn = document.getElementById('bell-btn');
const autoBtn = document.getElementById('auto-btn');
const canvas = document.getElementById('display-canvas');
const sideCanvas = document.getElementById('side-canvas');
const displayEl = document.getElementById('display');
const stopToastEl = document.getElementById('stop-toast');
const recentWrapEl = document.getElementById('recent-wrap');
const recentListEl = document.getElementById('recent-list');

const editorBtn = document.getElementById('editor-btn');
const editorOverlay = document.getElementById('sound-editor-overlay');
const editorCloseBtn = document.getElementById('editor-close-btn');
const editorLineSelect = document.getElementById('editor-line-select');
const editorSoundListEl = document.getElementById('editor-sound-list');
const editorSoundSelect = document.getElementById('editor-sound-select');
const editorAddSoundBtn = document.getElementById('editor-add-sound-btn');
const editorSaveBtn = document.getElementById('editor-save-btn');
const editorStatus = document.getElementById('editor-status');

const exportBtn = document.getElementById('export-btn');
const importBtn = document.getElementById('import-btn');
const importFileInput = document.getElementById('import-file-input');

let currentLines = [];
let currentText = 'NIEAKTYWNY';
let activeDisplayData = null;

// Zmienne do obsługi dźwięku
let currentAudio = null;
let soundIndex = 0;
let lastPlayedKey = null;
let autoPlayEnabled = false;

/* ===================== SYSTEM ODTWARZANIA DŹWIĘKÓW ===================== */
/* LINE_SOUND_MAP zaczyna z Twoją dotychczasową zawartością jako domyślną -
   zaraz po starcie strony zostanie nadpisana tym, co trzyma serwer
   (plik soundmap.json), więc edycje w edytorze będą się synchronizować
   między urządzeniami. */

let LINE_SOUND_MAP = {
  "92_PODBÓRZ": [
    "sounds/poczatek_92_P.mp3",
    "sounds/92_Kollataja.mp3",
    "sounds/92_Niemcewicza.mp3",
    "sounds/92_dworzec_niebuszewo.mp3",
    "sounds/92_Krasinskiego.mp3",
    "sounds/92_chopina.mp3",
    "sounds/92_wiosny.mp3",
    "sounds/92_Podlesna.mp3",
    "sounds/92_ogrody.mp3",
    "sounds/92_junacka.mp3",
    "sounds/92_chozowksa.mp3",
    "sounds/92_osow.mp3",
    "sounds/92_andersebna.mp3",
    "sounds/92_Sudecka.mp3",
    "sounds/92_Wymarzona.mp3",
    "sounds/92_Podborz_koncowy.mp3",
    "sounds/92_Podborz.mp3"
  ],
  "92_KOŁŁATAJA": [
    "sounds/poczatek_92_K.mp3",
    "sounds/92_Podborz.mp3",
    "sounds/92_Wymarzona.mp3",
    "sounds/92_Sudecka.mp3",
    "sounds/92_andersebna.mp3",
    "sounds/92_osow.mp3",
    "sounds/92_chozowksa.mp3",
    "sounds/92_junacka.mp3",
    "sounds/92_ogrody.mp3",
    "sounds/92_Podlesna.mp3",
    "sounds/92_wiosny.mp3",
    "sounds/92_chopina.mp3",
    "sounds/92_Krasinskiego.mp3",
    "sounds/92_dworzec_niebuszewo.mp3",
    "sounds/92_Niemcewicza.mp3",
    "sounds/92_Kolataja_K.mp3",
    "sounds/92_Kollataja.mp3"
  ],
  "DEFAULT": [
    "sounds/braklini.mp3"
  ]
};

// Pobierz aktualną mapę z serwera (nadpisze powyższy fallback, jeśli serwer coś ma)
fetch('/api/soundmap')
  .then((r) => r.json())
  .then((map) => {
    if (map && typeof map === 'object' && Object.keys(map).length) {
      LINE_SOUND_MAP = map;
    }
  })
  .catch(() => {});

// Synchronizacja mapy dźwięków między urządzeniami (np. po edycji w edytorze)
socket.on('soundmap-updated', (map) => {
  LINE_SOUND_MAP = map;
  if (editorOverlay && editorOverlay.classList.contains('visible')) {
    renderEditorSoundList();
  }
});

function currentKey() {
  return activeDisplayData
    ? `${activeDisplayData.number}_${activeDisplayData.destination}`.toUpperCase()
    : 'DEFAULT';
}

function getPlaylistForActive() {
  const key = currentKey();
  let playlist = LINE_SOUND_MAP[key];

  if (!playlist && activeDisplayData) {
    const altKey = key
      .replace(/Ó/g, 'O')
      .replace(/Ż/g, 'Z')
      .replace(/Ł/g, 'L')
      .replace(/Ś/g, 'S')
      .replace(/Ć/g, 'C')
      .replace(/Ę/g, 'E')
      .replace(/Ą/g, 'A')
      .replace(/Ź/g, 'Z')
      .replace(/Ń/g, 'N');
    playlist = LINE_SOUND_MAP[altKey];
  }

  if (!playlist) {
    playlist = LINE_SOUND_MAP['DEFAULT'] || [];
  }

  return playlist;
}

function deriveStopLabel(soundPath) {
  const file = soundPath.split('/').pop().replace(/\.[^.]+$/, '');
  let label = file
    .replace(/^poczatek_\d+_[A-Za-zŁŚŻŹĆŃÓĄĘ]?_?/i, '')
    .replace(/^\d+_/, '')
    .replace(/_koncowy$/i, '')
    .replace(/_/g, ' ')
    .trim();
  if (!label) label = file.replace(/_/g, ' ');
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function stopAllAudio() {
  if (currentAudio) {
    currentAudio.onended = null;
    currentAudio.pause();
    currentAudio.currentTime = 0;
  }
}

function playSound(soundPath, label) {
  if (audioTargetId === 'self') {
    const audio = new Audio(soundPath);
    audio.play().catch((err) => {
      console.warn('Nie można odtworzyć pliku:', soundPath, err);
    });
    return audio;
  }

  socket.emit('play-sound-on-device', { targetId: audioTargetId, soundPath, label });
  return null;
}

function advanceSound() {
  try {
    const key = currentKey();
    const playlist = getPlaylistForActive();

    if (lastPlayedKey !== key) {
      soundIndex = 0;
      lastPlayedKey = key;
    }

    if (currentAudio) {
      currentAudio.onended = null;
      currentAudio.pause();
      currentAudio.currentTime = 0;
    }

    if (!playlist || !playlist.length) return;

    const soundToPlay = playlist[soundIndex];
    const isLast = soundIndex === playlist.length - 1;

    if (soundToPlay) {
      const label = deriveStopLabel(soundToPlay);
      currentAudio = playSound(soundToPlay, label);

      showStopToast(label);

      if (isLast) {
        flashFinalStop();
      }

      if (autoPlayEnabled) {
        if (currentAudio) {
          // Dźwięk gra lokalnie - wiemy dokładnie kiedy się skończy
          currentAudio.onended = () => {
            setTimeout(() => {
              if (autoPlayEnabled) advanceSound();
            }, 1200);
          };
        } else {
          // Dźwięk gra na innym urządzeniu - mierzymy czas trwania z tego samego
          // pliku lokalnie (bez odtwarzania dźwięku), żeby wiedzieć kiedy iść dalej
          scheduleRemoteAutoAdvance(soundToPlay);
        }
      }

      soundIndex++;
      if (soundIndex >= playlist.length) {
        soundIndex = 0;
      }
    }
  } catch (e) {
    console.error('Błąd odtwarzacza:', e);
  }
}

function scheduleRemoteAutoAdvance(soundPath) {
  try {
    const probe = new Audio();
    probe.preload = 'metadata';
    probe.src = soundPath;
    const fallback = setTimeout(() => {
      if (autoPlayEnabled) advanceSound();
    }, 5000);
    probe.addEventListener('loadedmetadata', () => {
      clearTimeout(fallback);
      const ms = isFinite(probe.duration) && probe.duration > 0 ? probe.duration * 1000 : 4000;
      setTimeout(() => {
        if (autoPlayEnabled) advanceSound();
      }, ms + 1200);
    });
    probe.addEventListener('error', () => {
      clearTimeout(fallback);
      if (autoPlayEnabled) setTimeout(() => advanceSound(), 4000);
    });
  } catch (e) {
    if (autoPlayEnabled) setTimeout(() => advanceSound(), 4000);
  }
}

if (soundBtn) {
  soundBtn.addEventListener('click', () => advanceSound());
}

if (bellBtn) {
  bellBtn.addEventListener('click', () => {
    try {
      if (audioTargetId === 'self') {
        const bell = new Audio('sounds/dzwonek.mp3');
        bell.addEventListener('error', () => {
          showStopToast('Brak pliku sounds/dzwonek.mp3');
        });
        bell.play().catch(() => {
          showStopToast('Brak pliku sounds/dzwonek.mp3');
        });
      } else {
        socket.emit('play-sound-on-device', {
          targetId: audioTargetId,
          soundPath: 'sounds/dzwonek.mp3',
          label: 'Dzwonek',
        });
      }
    } catch (e) {
      console.error(e);
    }
  });
}


if (autoBtn) {
  autoBtn.addEventListener('click', () => {
    autoPlayEnabled = !autoPlayEnabled;
    autoBtn.classList.toggle('active', autoPlayEnabled);
    autoBtn.textContent = autoPlayEnabled ? '⏸️' : '▶️';
    if (autoPlayEnabled) {
      advanceSound();
    } else if (currentAudio) {
      currentAudio.onended = null;
    }
  });
}

/* ===================== DYMEK Z NAZWĄ PRZYSTANKU ===================== */

let stopToastTimeout = null;
function showStopToast(text) {
  if (!stopToastEl) return;
  stopToastEl.textContent = text;
  stopToastEl.classList.add('visible');
  clearTimeout(stopToastTimeout);
  stopToastTimeout = setTimeout(() => {
    stopToastEl.classList.remove('visible');
  }, 4000);
}

function hideStopToast() {
  if (!stopToastEl) return;
  stopToastEl.classList.remove('visible');
  clearTimeout(stopToastTimeout);
}

function flashFinalStop() {
  if (!displayEl) return;
  displayEl.classList.remove('final-stop-flash');
  void displayEl.offsetWidth; // wymuszenie przeliczenia, żeby animacja odpaliła się od nowa
  displayEl.classList.add('final-stop-flash');
  setTimeout(() => displayEl.classList.remove('final-stop-flash'), 2200);
}

/* ===================== KOLOR WYŚWIETLACZA ===================== */

const DOT_COLORS = { amber: '#ff9100', red: '#ff2b2b', green: '#4dff4d' };
let dotColorName = localStorage.getItem('busapp_dot_color') || 'amber';
let dotColorHex = DOT_COLORS[dotColorName] || DOT_COLORS.amber;

function applyColorSwatchUI() {
  document.querySelectorAll('.color-swatch').forEach((btn) => {
    btn.classList.toggle('selected', btn.dataset.color === dotColorName);
  });
}

document.querySelectorAll('.color-swatch').forEach((btn) => {
  btn.addEventListener('click', () => {
    dotColorName = btn.dataset.color;
    dotColorHex = DOT_COLORS[dotColorName] || DOT_COLORS.amber;
    localStorage.setItem('busapp_dot_color', dotColorName);
    applyColorSwatchUI();
  });
});
applyColorSwatchUI();

/* ===================== SILNIK MATRYCY PUNKTOWEJ (reużywalny) ===================== */

function createDotMatrixRenderer(canvasEl, rowsCount, fontScale, dotFillRatio) {
  if (!canvasEl) return null;
  const rCtx = canvasEl.getContext('2d');
  const offCanvas = document.createElement('canvas');
  const offCtx = offCanvas.getContext('2d');

  let cols = 10;
  let textCols = 0;
  let scrollOffset = 0;
  let lastFrameTime = null;
  let needsScroll = false;
  let text = '';
  const scrollSpeed = 22;

  function resize() {
    const rect = canvasEl.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const dpr = window.devicePixelRatio || 1;
    canvasEl.width = Math.max(1, Math.round(rect.width * dpr));
    canvasEl.height = Math.max(1, Math.round(rect.height * dpr));
    cols = Math.max(4, Math.round((rect.width / rect.height) * rowsCount));
    rasterize();
  }

  function rasterize() {
    const fontSize = Math.max(4, Math.round(rowsCount * fontScale));
    offCtx.font = `bold ${fontSize}px "Courier New", monospace`;
    const measured = offCtx.measureText(text || '').width;
    textCols = Math.max(cols, Math.ceil(measured) + 4);

    offCanvas.width = textCols;
    offCanvas.height = rowsCount;

    offCtx.fillStyle = '#000';
    offCtx.fillRect(0, 0, offCanvas.width, offCanvas.height);

    offCtx.font = `bold ${fontSize}px "Courier New", monospace`;
    offCtx.fillStyle = '#fff';
    offCtx.textBaseline = 'middle';
    offCtx.textAlign = 'left';

    const startX = textCols > cols ? 2 : Math.floor((cols - measured) / 2);
    offCtx.fillText(text || '', startX, rowsCount / 2 + 1);

    needsScroll = textCols > cols;
    scrollOffset = 0;
    lastFrameTime = null;
  }

  function draw(timestamp, colorHex) {
    if (offCanvas.width === 0 || offCanvas.height === 0) return;
    if (lastFrameTime === null) lastFrameTime = timestamp;
    const dt = (timestamp - lastFrameTime) / 1000;
    lastFrameTime = timestamp;

    if (needsScroll) {
      scrollOffset += scrollSpeed * dt;
      const wrapAt = textCols + 6;
      if (scrollOffset >= wrapAt) scrollOffset -= wrapAt;
    }

    const data = offCtx.getImageData(0, 0, offCanvas.width, offCanvas.height).data;

    const w = canvasEl.width;
    const h = canvasEl.height;
    rCtx.clearRect(0, 0, w, h);

    const dotW = w / cols;
    const dotH = h / rowsCount;
    const radius = Math.min(dotW, dotH) * dotFillRatio;

    for (let row = 0; row < rowsCount; row++) {
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

        rCtx.beginPath();
        if (on) {
          rCtx.fillStyle = colorHex;
          rCtx.shadowColor = colorHex;
          rCtx.shadowBlur = radius * 1.6;
        } else {
          rCtx.fillStyle = '#231a10';
          rCtx.shadowBlur = 0;
        }
        rCtx.arc(cx, cy, radius, 0, Math.PI * 2);
        rCtx.fill();
      }
    }
  }

  return {
    resize,
    setText(t) {
      text = t;
      rasterize();
    },
    draw,
  };
}

const mainRenderer = createDotMatrixRenderer(canvas, 24, 0.72, 0.34);
const sideRenderer = createDotMatrixRenderer(sideCanvas, 10, 0.75, 0.34);

function resizeAll() {
  if (mainRenderer) mainRenderer.resize();
  if (sideRenderer) sideRenderer.resize();
}

function setDisplayText(text) {
  currentText = text;
  if (mainRenderer) mainRenderer.setText(text);
}

function drawFrame(timestamp) {
  if (mainRenderer) mainRenderer.draw(timestamp, dotColorHex);
  if (sideRenderer) sideRenderer.draw(timestamp, dotColorHex);
  requestAnimationFrame(drawFrame);
}

window.addEventListener('resize', resizeAll);
if (canvas) new ResizeObserver(resizeAll).observe(canvas);
if (sideCanvas) new ResizeObserver(resizeAll).observe(sideCanvas);
requestAnimationFrame(drawFrame);
resizeAll();

/* ===================== OSTATNIO WYBIERANE (lokalnie, na tym urządzeniu) ===================== */

const RECENT_KEY = 'busapp_recent_lines';

function loadRecents() {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
  } catch (e) {
    return [];
  }
}

function saveRecents(list) {
  localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 8)));
}

function pushRecent(line) {
  const list = loadRecents().filter(
    (l) => !(l.number === line.number && l.destination === line.destination)
  );
  list.unshift({ number: line.number, destination: line.destination });
  saveRecents(list);
  renderRecents();
}

function renderRecents() {
  if (!recentListEl || !recentWrapEl) return;
  const list = loadRecents();
  recentListEl.innerHTML = '';
  if (!list.length) {
    recentWrapEl.classList.add('empty');
    return;
  }
  recentWrapEl.classList.remove('empty');
  list.forEach((l) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'recent-chip';
    chip.innerHTML = `<span class="num">${escapeHtml(l.number)}</span>${escapeHtml(l.destination)}`;
    chip.addEventListener('click', () => {
      const match = currentLines.find(
        (cl) => cl.number === l.number && cl.destination === l.destination
      );
      openDevicePicker(match || l);
    });
    recentListEl.appendChild(chip);
  });
}

/* ===================== PANEL STEROWANIA / SYNC ===================== */

function selectLine(line) {
  activeDisplayData = line;
  soundIndex = 0;
  lastPlayedKey = null;
  autoPlayEnabled = false;
  if (autoBtn) {
    autoBtn.classList.remove('active');
    autoBtn.textContent = '▶️';
  }
  stopAllAudio();
  hideStopToast();
  setDisplayText(`${line.number}  ${line.destination}`.toUpperCase());
  if (sideRenderer) sideRenderer.setText(String(line.number));
  pushRecent(line);
  enterFullscreen();
}

function renderLines() {
  if (!linesListEl) return;
  linesListEl.innerHTML = '';
  const sorted = [...currentLines].sort((a, b) => (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0));

  sorted.forEach((line) => {
    const index = currentLines.indexOf(line);
    const btn = document.createElement('button');
    btn.className = 'line-btn';
    btn.innerHTML = `
      <span class="num">${escapeHtml(line.number)}</span>
      <span class="dest">${escapeHtml(line.destination)}</span>
      <button class="fav ${line.favorite ? 'active' : ''}" title="Ulubione">★</button>
      <button class="del" title="Usuń linię">✕</button>
    `;

    btn.addEventListener('click', (e) => {
      if (e.target.classList.contains('del') || e.target.classList.contains('fav')) return;
      openDevicePicker(line);
    });

    btn.querySelector('.fav').addEventListener('click', (e) => {
      e.stopPropagation();
      line.favorite = !line.favorite;
      saveLines();
    });

    btn.querySelector('.del').addEventListener('click', (e) => {
      e.stopPropagation();
      if (index !== -1) currentLines.splice(index, 1);
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
  if (editorOverlay && editorOverlay.classList.contains('visible')) {
    populateEditorLineSelect();
  }
});

function enterFullscreen() {
  document.body.classList.add('fullscreen-mode');
  resizeAll();
}

function exitFullscreen() {
  document.body.classList.remove('fullscreen-mode');
  activeDisplayData = null;
  autoPlayEnabled = false;
  if (autoBtn) {
    autoBtn.classList.remove('active');
    autoBtn.textContent = '▶️';
  }
  stopAllAudio();
  hideStopToast();
  setDisplayText('NIEAKTYWNY');
  if (sideRenderer) sideRenderer.setText('');
  resizeAll();
}

// Zdarzenie wygaszenia tablicy (synchronizowane między urządzeniami)
socket.on('display-updated', (display) => {
  if (!display || !display.number) {
    exitFullscreen();
  }
});

if (addForm) {
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
}

if (clearBtn) {
  clearBtn.addEventListener('click', () => {
    socket.emit('clear-display');
  });
}

if (backBtn) {
  backBtn.addEventListener('click', () => {
    exitFullscreen();
  });
}

renderRecents();

/* ===================== EDYTOR DŹWIĘKÓW ===================== */

function populateEditorLineSelect() {
  if (!editorLineSelect) return;
  const prevValue = editorLineSelect.value;
  editorLineSelect.innerHTML = '';

  currentLines.forEach((line) => {
    const opt = document.createElement('option');
    opt.value = `${line.number}_${line.destination}`.toUpperCase();
    opt.textContent = `${line.number} - ${line.destination}`;
    editorLineSelect.appendChild(opt);
  });

  const defOpt = document.createElement('option');
  defOpt.value = 'DEFAULT';
  defOpt.textContent = '(domyślny dźwięk - brak przypisanych)';
  editorLineSelect.appendChild(defOpt);

  if (prevValue && [...editorLineSelect.options].some((o) => o.value === prevValue)) {
    editorLineSelect.value = prevValue;
  }
}

function populateEditorSoundFileSelect(files) {
  if (!editorSoundSelect) return;
  editorSoundSelect.innerHTML = '';
  files.forEach((f) => {
    const opt = document.createElement('option');
    opt.value = f;
    opt.textContent = f;
    editorSoundSelect.appendChild(opt);
  });
}

function renderEditorSoundList() {
  if (!editorLineSelect || !editorSoundListEl) return;
  const key = editorLineSelect.value;
  if (!key) return;
  if (!LINE_SOUND_MAP[key]) LINE_SOUND_MAP[key] = [];
  const list = LINE_SOUND_MAP[key];

  editorSoundListEl.innerHTML = '';
  list.forEach((soundPath, idx) => {
    const fileName = soundPath.split('/').pop();
    const li = document.createElement('li');
    li.innerHTML = `
      <span class="file-name">${idx + 1}. ${escapeHtml(fileName)}</span>
      <button class="move-up" title="Wyżej">▲</button>
      <button class="move-down" title="Niżej">▼</button>
      <button class="remove" title="Usuń">✕</button>
    `;
    li.querySelector('.move-up').addEventListener('click', () => {
      if (idx === 0) return;
      [list[idx - 1], list[idx]] = [list[idx], list[idx - 1]];
      renderEditorSoundList();
    });
    li.querySelector('.move-down').addEventListener('click', () => {
      if (idx === list.length - 1) return;
      [list[idx + 1], list[idx]] = [list[idx], list[idx + 1]];
      renderEditorSoundList();
    });
    li.querySelector('.remove').addEventListener('click', () => {
      list.splice(idx, 1);
      renderEditorSoundList();
    });
    editorSoundListEl.appendChild(li);
  });
}

if (editorLineSelect) {
  editorLineSelect.addEventListener('change', () => {
    if (editorStatus) editorStatus.textContent = '';
    renderEditorSoundList();
  });
}

if (editorAddSoundBtn) {
  editorAddSoundBtn.addEventListener('click', () => {
    const key = editorLineSelect.value;
    const chosen = editorSoundSelect.value;
    if (!key || !chosen) return;
    if (!LINE_SOUND_MAP[key]) LINE_SOUND_MAP[key] = [];
    LINE_SOUND_MAP[key].push('sounds/' + chosen);
    renderEditorSoundList();
    if (editorStatus) editorStatus.textContent = '';
  });
}

if (editorSaveBtn) {
  editorSaveBtn.addEventListener('click', () => {
    fetch('/api/soundmap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(LINE_SOUND_MAP),
    })
      .then((r) => r.json())
      .then(() => {
        if (editorStatus) {
          editorStatus.textContent = 'Zapisano ✓';
          setTimeout(() => {
            editorStatus.textContent = '';
          }, 2500);
        }
      })
      .catch(() => {
        if (editorStatus) editorStatus.textContent = 'Błąd zapisu';
      });
  });
}

if (editorBtn) {
  editorBtn.addEventListener('click', () => {
    editorOverlay.classList.add('visible');
    populateEditorLineSelect();
    fetch('/api/sounds-files')
      .then((r) => r.json())
      .then((files) => {
        populateEditorSoundFileSelect(files);
      })
      .catch(() => {});
    if (editorLineSelect.options.length) {
      renderEditorSoundList();
    }
  });
}

if (editorCloseBtn) {
  editorCloseBtn.addEventListener('click', () => {
    editorOverlay.classList.remove('visible');
  });
}

/* ===================== EKSPORT / IMPORT KONFIGURACJI ===================== */

if (exportBtn) {
  exportBtn.addEventListener('click', () => {
    fetch('/api/config')
      .then((r) => r.json())
      .then((config) => {
        const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const stamp = new Date().toISOString().slice(0, 10);
        a.href = url;
        a.download = `tablica-config-${stamp}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      })
      .catch(() => alert('Nie udało się wyeksportować konfiguracji.'));
  });
}

if (importBtn && importFileInput) {
  importBtn.addEventListener('click', () => {
    importFileInput.click();
  });

  importFileInput.addEventListener('change', () => {
    const file = importFileInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const config = JSON.parse(reader.result);
        if (!Array.isArray(config.lines) || typeof config.soundMap !== 'object') {
          throw new Error('zły format');
        }
        fetch('/api/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(config),
        })
          .then((r) => r.json())
          .then(() => {
            alert('Konfiguracja zaimportowana.');
          })
          .catch(() => alert('Błąd zapisu zaimportowanej konfiguracji.'));
      } catch (e) {
        alert('Nieprawidłowy plik konfiguracji.');
      }
    };
    reader.readAsText(file);
    importFileInput.value = '';
  });
}

/* ===================== PWA / OFFLINE ===================== */

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js').catch(() => {});
  });
}

/* ===================== NAZWA URZĄDZENIA / ZDALNE WYSYŁANIE LINII ===================== */

const DEVICE_NAME_KEY = 'busapp_device_name';
const deviceNameBtn = document.getElementById('device-name-btn');
const devicePickerOverlay = document.getElementById('device-picker-overlay');
const devicePickerCloseBtn = document.getElementById('device-picker-close-btn');
const devicePickerListEl = document.getElementById('device-picker-list');

function guessDefaultDeviceName() {
  const ua = navigator.userAgent || '';
  if (/iPhone/i.test(ua)) return 'iPhone';
  if (/iPad/i.test(ua)) return 'iPad';
  if (/Android/i.test(ua)) return 'Telefon Android';
  if (/Macintosh/i.test(ua)) return 'Mac';
  if (/Windows/i.test(ua)) return 'Komputer';
  return 'Urządzenie';
}

let deviceName = localStorage.getItem(DEVICE_NAME_KEY);
if (!deviceName) {
  const suggestion = guessDefaultDeviceName();
  deviceName =
    (window.prompt(
      'Jak nazwać to urządzenie? (będzie widoczne dla innych, np. "iPhone 13 Pro Max")',
      suggestion
    ) || suggestion).trim() || suggestion;
  localStorage.setItem(DEVICE_NAME_KEY, deviceName);
}

function registerDeviceName() {
  socket.emit('register-device', deviceName);
}

socket.on('connect', registerDeviceName);
// Gdyby socket był już połączony w momencie podpięcia listenera
if (socket.connected) registerDeviceName();

if (deviceNameBtn) {
  deviceNameBtn.addEventListener('click', () => {
    const next = window.prompt('Nowa nazwa tego urządzenia:', deviceName);
    if (next && next.trim()) {
      deviceName = next.trim();
      localStorage.setItem(DEVICE_NAME_KEY, deviceName);
      registerDeviceName();
    }
  });
}

let connectedDevices = []; // [{ id, name }]
let pendingLine = null;

socket.on('devices-updated', (list) => {
  connectedDevices = Array.isArray(list) ? list : [];
  if (devicePickerOverlay && devicePickerOverlay.classList.contains('visible')) {
    renderDevicePickerList();
  }
});

function deviceIconFor(name) {
  const n = (name || '').toLowerCase();
  if (n.includes('iphone') || n.includes('android') || n.includes('telefon')) return '📱';
  if (n.includes('ipad') || n.includes('tablet')) return '📱';
  if (n.includes('mac') || n.includes('komp') || n.includes('windows') || n.includes('pc')) return '💻';
  return '🖥️';
}

function renderDevicePickerList() {
  if (!devicePickerListEl) return;
  devicePickerListEl.innerHTML = '';

  const allBtn = document.createElement('button');
  allBtn.type = 'button';
  allBtn.className = 'device-option all-devices';
  allBtn.innerHTML = `<span class="icon">📡</span><span>Wszystkie urządzenia</span>`;
  allBtn.addEventListener('click', () => sendPendingLineToDevice('all'));
  devicePickerListEl.appendChild(allBtn);

  if (!connectedDevices.length) {
    const empty = document.createElement('div');
    empty.className = 'device-picker-empty';
    empty.textContent = 'Brak innych wykrytych urządzeń - upewnij się, że są w tej samej sieci i mają otwartą stronę.';
    devicePickerListEl.appendChild(empty);
  }

  connectedDevices.forEach((d) => {
    const isSelf = d.id === socket.id;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'device-option' + (isSelf ? ' self' : '');
    btn.innerHTML = `<span class="icon">${deviceIconFor(d.name)}</span><span>${escapeHtml(d.name)}${isSelf ? ' (to urządzenie)' : ''}</span>`;
    btn.addEventListener('click', () => sendPendingLineToDevice(d.id));
    devicePickerListEl.appendChild(btn);
  });
}

function openDevicePicker(line) {
  pendingLine = line;
  if (!devicePickerOverlay) {
    // Zapasowo - gdyby modal się nie załadował, działaj jak dotychczas (lokalnie)
    selectLine(line);
    return;
  }
  renderDevicePickerList();
  devicePickerOverlay.classList.add('visible');
}

function closeDevicePicker() {
  if (devicePickerOverlay) devicePickerOverlay.classList.remove('visible');
  pendingLine = null;
}

function sendPendingLineToDevice(targetId) {
  if (!pendingLine) return;

  // Pokazujemy linię też u siebie - żeby zawsze mieć dostęp do przycisków
  // 🔊 / 🔔 / ▶️, niezależnie od tego, gdzie wysyłamy sam wyświetlacz.
  selectLine(pendingLine);

  if (targetId !== socket.id) {
    socket.emit('send-line-to-device', { targetId, line: pendingLine });
  }

  closeDevicePicker();
}

if (devicePickerCloseBtn) {
  devicePickerCloseBtn.addEventListener('click', closeDevicePicker);
}

if (devicePickerOverlay) {
  devicePickerOverlay.addEventListener('click', (e) => {
    if (e.target === devicePickerOverlay) closeDevicePicker();
  });
}

// To urządzenie zostało wybrane jako cel przez inne urządzenie
socket.on('remote-select-line', (line) => {
  if (line && typeof line.number !== 'undefined') {
    selectLine(line);
  }
});

/* ===================== WYBÓR URZĄDZENIA DO ODTWARZANIA DŹWIĘKU ===================== */

const audioTargetBtn = document.getElementById('audio-target-btn');
const audioTargetOverlay = document.getElementById('audio-target-overlay');
const audioTargetCloseBtn = document.getElementById('audio-target-close-btn');
const audioTargetListEl = document.getElementById('audio-target-list');

let audioTargetId = 'self'; // 'self' = graj lokalnie na tym urządzeniu, jak dotychczas
let audioTargetLabel = 'To urządzenie';

function updateAudioTargetBtnUI() {
  if (!audioTargetBtn) return;
  audioTargetBtn.classList.toggle('active-remote', audioTargetId !== 'self');
  audioTargetBtn.title =
    audioTargetId === 'self' ? 'Gdzie ma grać dźwięk (teraz: to urządzenie)' : `Gdzie ma grać dźwięk (teraz: ${audioTargetLabel})`;
}

function renderAudioTargetList() {
  if (!audioTargetListEl) return;
  audioTargetListEl.innerHTML = '';

  const selfBtn = document.createElement('button');
  selfBtn.type = 'button';
  selfBtn.className = 'device-option self';
  selfBtn.innerHTML = `<span class="icon">🔈</span><span>To urządzenie${audioTargetId === 'self' ? ' ✓' : ''}</span>`;
  selfBtn.addEventListener('click', () => {
    audioTargetId = 'self';
    audioTargetLabel = 'To urządzenie';
    updateAudioTargetBtnUI();
    audioTargetOverlay.classList.remove('visible');
  });
  audioTargetListEl.appendChild(selfBtn);

  const allBtn = document.createElement('button');
  allBtn.type = 'button';
  allBtn.className = 'device-option all-devices';
  allBtn.innerHTML = `<span class="icon">📡</span><span>Wszystkie urządzenia${audioTargetId === 'all' ? ' ✓' : ''}</span>`;
  allBtn.addEventListener('click', () => {
    audioTargetId = 'all';
    audioTargetLabel = 'Wszystkie urządzenia';
    updateAudioTargetBtnUI();
    audioTargetOverlay.classList.remove('visible');
  });
  audioTargetListEl.appendChild(allBtn);

  connectedDevices
    .filter((d) => d.id !== socket.id)
    .forEach((d) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'device-option';
      btn.innerHTML = `<span class="icon">${deviceIconFor(d.name)}</span><span>${escapeHtml(d.name)}${audioTargetId === d.id ? ' ✓' : ''}</span>`;
      btn.addEventListener('click', () => {
        audioTargetId = d.id;
        audioTargetLabel = d.name;
        updateAudioTargetBtnUI();
        audioTargetOverlay.classList.remove('visible');
      });
      audioTargetListEl.appendChild(btn);
    });
}

if (audioTargetBtn) {
  audioTargetBtn.addEventListener('click', () => {
    renderAudioTargetList();
    audioTargetOverlay.classList.add('visible');
  });
}

if (audioTargetCloseBtn) {
  audioTargetCloseBtn.addEventListener('click', () => {
    audioTargetOverlay.classList.remove('visible');
  });
}

if (audioTargetOverlay) {
  audioTargetOverlay.addEventListener('click', (e) => {
    if (e.target === audioTargetOverlay) audioTargetOverlay.classList.remove('visible');
  });
}

// Jeśli urządzenie ustawione jako cel dźwięku rozłączy się, wracamy do "to urządzenie"
socket.on('devices-updated', (list) => {
  if (audioTargetId !== 'self' && audioTargetId !== 'all') {
    const stillThere = (list || []).some((d) => d.id === audioTargetId);
    if (!stillThere) {
      audioTargetId = 'self';
      audioTargetLabel = 'To urządzenie';
      updateAudioTargetBtnUI();
    }
  }
});

// ===== Odblokowanie dźwięku po pierwszym dotknięciu ekranu =====
// Przeglądarki mobilne blokują odtwarzanie dźwięku wywołane "z zewnątrz"
// (np. przez zdalne polecenie z innego urządzenia), dopóki użytkownik
// choć raz nie dotknie/kliknie czegoś na TEJ stronie. Ten element audio
// odblokowujemy przy pierwszym dotknięciu, a potem używamy go ponownie
// (ten sam <audio>, tylko zmieniamy źródło) do zdalnie zleconych dźwięków.
const remoteAudioEl = new Audio();
remoteAudioEl.setAttribute('playsinline', '');
let audioUnlocked = false;

function unlockAudioOnce() {
  if (audioUnlocked) return;
  audioUnlocked = true;
  try {
    remoteAudioEl.src = 'sounds/braklini.mp3';
    remoteAudioEl.volume = 0;
    const p = remoteAudioEl.play();
    if (p && p.catch) p.catch(() => {});
    setTimeout(() => {
      try {
        remoteAudioEl.pause();
        remoteAudioEl.currentTime = 0;
        remoteAudioEl.volume = 1;
      } catch (e) {}
    }, 60);
  } catch (e) {}
}

['pointerdown', 'touchstart', 'keydown'].forEach((evt) => {
  document.addEventListener(evt, unlockAudioOnce, { once: true, passive: true });
});

// To urządzenie zostało wybrane jako cel dźwięku przez inne urządzenie
socket.on('remote-play-sound', ({ soundPath, label }) => {
  if (!soundPath) return;
  try {
    remoteAudioEl.src = soundPath;
    remoteAudioEl.currentTime = 0;
    remoteAudioEl.play().catch((err) => {
      console.warn('Nie można odtworzyć zdalnego dźwięku:', soundPath, err);
      showStopToast('Dotknij raz ekranu tego urządzenia, żeby odblokować dźwięk');
    });
  } catch (e) {
    console.error(e);
  }
  if (label) showStopToast(label);
});

socket.on('play-sound-failed', () => {
  showStopToast('Urządzenie docelowe niedostępne - dźwięk nie zagrał');
});

updateAudioTargetBtnUI();

