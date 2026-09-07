const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const LINES_FILE = path.join(__dirname, 'lines.json');
const SOUNDMAP_FILE = path.join(__dirname, 'soundmap.json');
const USERS_FILE = path.join(__dirname, 'users.json');
const SOUNDS_DIR = path.join(__dirname, 'public', 'sounds');

// ===================== TRWAŁY ZAPIS PRZEZ GITHUB (opcjonalne) =====================
// Render (darmowy plan) kasuje pliki zapisane w trakcie działania po każdym
// restarcie. Żeby dźwięki/linie dodane przez stronę PRZETRWAŁY restart bez
// ręcznego eksportu/importu, serwer może same commitować zmiany z powrotem
// do Twojego repozytorium GitHub i pobierać najświeższą wersję przy starcie.
// Działa tylko, jeśli ustawisz w Render (Environment) te zmienne:
//   GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO, (opcjonalnie GITHUB_BRANCH, domyślnie "main")
// Bez nich aplikacja działa dokładnie tak jak dotychczas - zapis tylko lokalny.
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_OWNER = process.env.GITHUB_OWNER;
const GITHUB_REPO = process.env.GITHUB_REPO;
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main';
const GITHUB_SYNC_ENABLED = !!(GITHUB_TOKEN && GITHUB_OWNER && GITHUB_REPO);

async function githubGetFile(repoPath) {
  if (!GITHUB_SYNC_ENABLED) return null;
  try {
    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${repoPath}?ref=${GITHUB_BRANCH}`,
      {
        headers: {
          Authorization: `token ${GITHUB_TOKEN}`,
          Accept: 'application/vnd.github+json',
        },
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const content = Buffer.from(data.content, 'base64').toString('utf8');
    return { content, sha: data.sha };
  } catch (e) {
    console.warn('GitHub sync: nie udało się pobrać', repoPath, e.message);
    return null;
  }
}

async function githubPutFile(repoPath, content, message) {
  if (!GITHUB_SYNC_ENABLED) return;
  try {
    const existing = await githubGetFile(repoPath);
    const body = {
      message: message || `Auto-zapis: ${repoPath}`,
      content: Buffer.from(content, 'utf8').toString('base64'),
      branch: GITHUB_BRANCH,
    };
    if (existing && existing.sha) body.sha = existing.sha;

    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${repoPath}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `token ${GITHUB_TOKEN}`,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      }
    );
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.warn('GitHub sync: zapis nieudany dla', repoPath, res.status, errText);
    }
  } catch (e) {
    console.warn('GitHub sync: nie udało się zapisać', repoPath, e.message);
  }
}

async function bootstrapDataFromGithub() {
  if (!GITHUB_SYNC_ENABLED) {
    console.log('GitHub sync: wyłączony (brak GITHUB_TOKEN/GITHUB_OWNER/GITHUB_REPO) - zapis tylko lokalny.');
    return;
  }
  console.log('GitHub sync: włączony - pobieram najświeższy stan z repozytorium...');

  const remoteLines = await githubGetFile('lines.json');
  if (remoteLines) {
    fs.writeFileSync(LINES_FILE, remoteLines.content, 'utf8');
    console.log('GitHub sync: lines.json zaktualizowany z repozytorium.');
  }

  const remoteSoundmap = await githubGetFile('soundmap.json');
  if (remoteSoundmap) {
    fs.writeFileSync(SOUNDMAP_FILE, remoteSoundmap.content, 'utf8');
    console.log('GitHub sync: soundmap.json zaktualizowany z repozytorium.');
  }

  const remoteUsers = await githubGetFile('users.json');
  if (remoteUsers) {
    fs.writeFileSync(USERS_FILE, remoteUsers.content, 'utf8');
    console.log('GitHub sync: users.json zaktualizowany z repozytorium.');
  }
}

// Domyślna mapa dźwięków - używana tylko przy pierwszym uruchomieniu,
// jeśli soundmap.json jeszcze nie istnieje (żeby nic nie zniknęło).
const DEFAULT_SOUND_MAP = {
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

function loadLines() {
  try {
    return JSON.parse(fs.readFileSync(LINES_FILE, 'utf8'));
  } catch (e) {
    return [];
  }
}

function saveLines(lines) {
  const json = JSON.stringify(lines, null, 2);
  fs.writeFileSync(LINES_FILE, json, 'utf8');
  githubPutFile('lines.json', json, 'Auto-zapis: lines.json').catch(() => {});
}

function loadSoundMap() {
  try {
    return JSON.parse(fs.readFileSync(SOUNDMAP_FILE, 'utf8'));
  } catch (e) {
    // Plik jeszcze nie istnieje - tworzymy go z domyślną zawartością
    saveSoundMap(DEFAULT_SOUND_MAP);
    return DEFAULT_SOUND_MAP;
  }
}

function saveSoundMap(map) {
  const json = JSON.stringify(map, null, 2);
  fs.writeFileSync(SOUNDMAP_FILE, json, 'utf8');
  githubPutFile('soundmap.json', json, 'Auto-zapis: soundmap.json').catch(() => {});
}

// ===================== UŻYTKOWNICY (REJESTRACJA / LOGOWANIE) =====================
// users.json trzyma listę kont: { "nazwa_lower": { username, salt, hash } }
// Hasła nigdy nie są zapisywane w jawnej postaci - tylko solony hash (scrypt).
// Zapis użytkowników przechodzi przez ten sam mechanizm githubPutFile co
// lines.json/soundmap.json, więc na Renderze rejestracja automatycznie
// commituje się do repozytorium GitHub i przetrwa restart serwera.

function loadUsers() {
  try {
    return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
  } catch (e) {
    saveUsers({});
    return {};
  }
}

function saveUsers(users) {
  const json = JSON.stringify(users, null, 2);
  fs.writeFileSync(USERS_FILE, json, 'utf8');
  githubPutFile('users.json', json, 'Auto-zapis: users.json (konta użytkowników)').catch(() => {});
}

function hashPassword(password, salt) {
  const useSalt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, useSalt, 64).toString('hex');
  return { salt: useSalt, hash };
}

function verifyPassword(password, salt, expectedHash) {
  const { hash } = hashPassword(password, salt);
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(expectedHash, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// Token "zapamiętaj urządzenie" - wyliczany deterministycznie z hasha hasła,
// więc pozostaje ważny nawet po restarcie serwera (bez trzymania sesji w
// pamięci), a jednocześnie nigdy nie jest samym hasłem w jawnej postaci.
function makeRememberToken(usernameLower, passwordHash) {
  return crypto.createHash('sha256').update(`${usernameLower}:${passwordHash}`).digest('hex');
}

function listSoundFiles() {
  try {
    return fs.readdirSync(SOUNDS_DIR).filter((f) => /\.(mp3|wav|ogg|m4a)$/i.test(f));
  } catch (e) {
    return [];
  }
}

// Aktualnie wyświetlana linia (dzielona przez wszystkie urządzenia)
let currentDisplay = { number: '', destination: '' };

// Rejestr podłączonych urządzeń: socket.id -> nazwa nadana przez użytkownika
const deviceNames = new Map();

function broadcastDevices() {
  const list = [...deviceNames.entries()].map(([id, name]) => ({ id, name }));
  io.emit('devices-updated', list);
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/lines', (req, res) => {
  res.json(loadLines());
});

app.post('/api/lines', (req, res) => {
  const lines = req.body;
  if (!Array.isArray(lines)) {
    return res.status(400).json({ error: 'Oczekiwano tablicy linii' });
  }
  saveLines(lines);
  io.emit('lines-updated', lines);
  res.json({ ok: true });
});

app.get('/api/soundmap', (req, res) => {
  res.json(loadSoundMap());
});

app.post('/api/soundmap', (req, res) => {
  const map = req.body;
  if (!map || typeof map !== 'object' || Array.isArray(map)) {
    return res.status(400).json({ error: 'Oczekiwano obiektu z mapą dźwięków' });
  }
  saveSoundMap(map);
  io.emit('soundmap-updated', map);
  res.json({ ok: true });
});

app.get('/api/sounds-files', (req, res) => {
  res.json(listSoundFiles());
});

app.get('/api/config', (req, res) => {
  res.json({ lines: loadLines(), soundMap: loadSoundMap() });
});

app.post('/api/config', (req, res) => {
  const { lines, soundMap } = req.body || {};
  if (!Array.isArray(lines) || !soundMap || typeof soundMap !== 'object') {
    return res.status(400).json({ error: 'Nieprawidłowy format konfiguracji' });
  }
  saveLines(lines);
  saveSoundMap(soundMap);
  io.emit('lines-updated', lines);
  io.emit('soundmap-updated', soundMap);
  res.json({ ok: true });
});

// ---------- REJESTRACJA / LOGOWANIE ----------

function normalizeUsername(username) {
  return (username || '').toString().trim();
}

app.post('/api/register', (req, res) => {
  const username = normalizeUsername(req.body && req.body.username);
  const password = (req.body && req.body.password || '').toString();
  const usernameLower = username.toLowerCase();

  if (username.length < 3 || username.length > 24) {
    return res.status(400).json({ error: 'Nazwa użytkownika musi mieć od 3 do 24 znaków.' });
  }
  if (!/^[a-zA-Z0-9ąćęłńóśźżĄĆĘŁŃÓŚŹŻ_\- ]+$/.test(username)) {
    return res.status(400).json({ error: 'Nazwa użytkownika zawiera niedozwolone znaki.' });
  }
  if (password.length < 4) {
    return res.status(400).json({ error: 'Hasło musi mieć co najmniej 4 znaki.' });
  }

  const users = loadUsers();
  if (users[usernameLower]) {
    return res.status(409).json({ error: 'Ta nazwa użytkownika jest już zajęta.' });
  }

  const { salt, hash } = hashPassword(password);
  users[usernameLower] = { username, salt, hash, createdAt: Date.now() };
  saveUsers(users);

  const token = makeRememberToken(usernameLower, hash);
  res.json({ ok: true, username, token });
});

app.post('/api/login', (req, res) => {
  const username = normalizeUsername(req.body && req.body.username);
  const password = (req.body && req.body.password || '').toString();
  const usernameLower = username.toLowerCase();

  const users = loadUsers();
  const user = users[usernameLower];
  if (!user || !verifyPassword(password, user.salt, user.hash)) {
    return res.status(401).json({ error: 'Nieprawidłowa nazwa użytkownika lub hasło.' });
  }

  const token = makeRememberToken(usernameLower, user.hash);
  res.json({ ok: true, username: user.username, token });
});

app.post('/api/session/validate', (req, res) => {
  const username = normalizeUsername(req.body && req.body.username);
  const token = (req.body && req.body.token || '').toString();
  const usernameLower = username.toLowerCase();

  const users = loadUsers();
  const user = users[usernameLower];
  if (!user || !token) {
    return res.json({ ok: false });
  }

  const expected = makeRememberToken(usernameLower, user.hash);
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  const valid = a.length === b.length && crypto.timingSafeEqual(a, b);
  res.json({ ok: valid, username: valid ? user.username : undefined });
});

io.on('connection', (socket) => {
  // Nowo podłączone urządzenie dostaje aktualny stan
  socket.emit('lines-updated', loadLines());
  socket.emit('display-updated', currentDisplay);
  socket.emit('soundmap-updated', loadSoundMap());
  socket.emit('devices-updated', [...deviceNames.entries()].map(([id, name]) => ({ id, name })));

  socket.on('register-device', (name) => {
    const safeName = (name || 'Urządzenie').toString().slice(0, 40);
    deviceNames.set(socket.id, safeName);
    broadcastDevices();
  });

  socket.on('send-line-to-device', (payload) => {
    const { targetId, line } = payload || {};
    if (!line || typeof line.number === 'undefined') return;

    if (targetId === 'all') {
      io.emit('remote-select-line', line);
      return;
    }

    const targetSocket = io.sockets.sockets.get(targetId);
    if (targetSocket) {
      targetSocket.emit('remote-select-line', line);
    }
  });

  socket.on('play-sound-on-device', (payload) => {
    const { targetId, soundPath, label } = payload || {};
    if (!soundPath) return;

    if (targetId === 'all') {
      io.emit('remote-play-sound', { soundPath, label });
      return;
    }

    const targetSocket = io.sockets.sockets.get(targetId);
    if (targetSocket) {
      targetSocket.emit('remote-play-sound', { soundPath, label });
    } else {
      socket.emit('play-sound-failed', { soundPath });
    }
  });

  socket.on('select-line', (line) => {
    if (!line || typeof line.number === 'undefined') return;
    currentDisplay = { number: line.number, destination: line.destination };
    io.emit('display-updated', currentDisplay);
  });

  socket.on('clear-display', () => {
    currentDisplay = { number: '', destination: '' };
    io.emit('display-updated', currentDisplay);
  });

  socket.on('disconnect', () => {
    deviceNames.delete(socket.id);
    broadcastDevices();
  });
});

function getLocalIPs() {
  const interfaces = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        ips.push(iface.address);
      }
    }
  }
  return ips;
}

const PORT = process.env.PORT || 3000;

(async () => {
  await bootstrapDataFromGithub();

  server.listen(PORT, '0.0.0.0', () => {
    console.log('=================================================');
    console.log('Serwer wystawiony na tablicę kierunkową autobusu.');
    console.log('Na KAŻDYM urządzeniu w tej samej sieci WiFi otwórz:');
    getLocalIPs().forEach((ip) => {
      console.log(`   http://${ip}:${PORT}`);
    });
    console.log('=================================================');
  });
})();
