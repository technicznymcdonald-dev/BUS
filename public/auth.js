/* ===================== SYSTEM LOGOWANIA =====================
   Zanim aplikacja stanie się widoczna, użytkownik musi się zalogować
   (nickname + hasło). Rejestracja nie jest dostępna z tego ekranu -
   konta tworzy administrator (konto "Wojciech") w panelu administratora.
   Domyślnie logowanie działa tylko na czas tej karty przeglądarki
   (sessionStorage) - po ponownym wejściu na stronę trzeba się zalogować
   od nowa. Jeśli na ekranie logowania użytkownik naciśnie F10, włącza
   się tryb "zapamiętaj to urządzenie na stałe" - dane logowania trafiają
   wtedy do localStorage i urządzenie zostaje zalogowane na stałe, aż do
   wylogowania. */

(function () {
  const REMEMBER_KEY = 'busapp_auth';   // localStorage - logowanie na stałe (F10)
  const SESSION_KEY = 'busapp_auth';    // sessionStorage - logowanie tylko na tę kartę

  const overlay = document.getElementById('auth-overlay');
  const appRoot = document.getElementById('app-root');
  const authBox = document.getElementById('auth-box');
  const rememberBadge = document.getElementById('auth-remember-badge');

  const form = document.getElementById('auth-form');
  const usernameInput = document.getElementById('auth-username');
  const passwordInput = document.getElementById('auth-password');
  const errorEl = document.getElementById('auth-error');
  const submitBtn = document.getElementById('auth-submit-btn');
  const f10Hint = document.getElementById('auth-f10-hint');

  let rememberDevice = false;

  // Stan sesji dostępny globalnie (np. dla panelu administratora), żeby
  // nie trzymać hasła/tokenu w kilku miejscach.
  window.busappAuth = null;

  function notifyAuthChanged() {
    document.dispatchEvent(new CustomEvent('busapp-auth-changed', {
      detail: window.busappAuth,
    }));
  }

  function setError(msg) {
    errorEl.textContent = msg || '';
  }

  function updateRememberVisuals() {
    authBox.classList.toggle('remember-mode', rememberDevice);
    rememberBadge.classList.toggle('visible', rememberDevice);
    f10Hint.textContent = rememberDevice
      ? 'Tryb logowania na stałe włączony. Naciśnij F10 ponownie, aby wyłączyć.'
      : 'Wskazówka: naciśnij F10, aby zalogować się na stałe na tym urządzeniu.';
  }

  function showAuthOverlay() {
    overlay.classList.add('visible');
    appRoot.hidden = true;
    setError('');
    usernameInput.value = '';
    passwordInput.value = '';
    updateRememberVisuals();
    window.busappAuth = null;
    notifyAuthChanged();
    usernameInput.focus();
  }

  function showApp(username, token) {
    overlay.classList.remove('visible');
    appRoot.hidden = false;
    window.busappAuth = { username, token };
    notifyAuthChanged();
  }

  function clearStoredAuth() {
    try { localStorage.removeItem(REMEMBER_KEY); } catch (e) {}
    try { sessionStorage.removeItem(SESSION_KEY); } catch (e) {}
  }

  function storeAuth(username, token, remember) {
    const payload = JSON.stringify({ username, token });
    try {
      if (remember) {
        localStorage.setItem(REMEMBER_KEY, payload);
        sessionStorage.removeItem(SESSION_KEY);
      } else {
        sessionStorage.setItem(SESSION_KEY, payload);
        localStorage.removeItem(REMEMBER_KEY);
      }
    } catch (e) {
      // Prywatne okno / brak dostępu do storage - logowanie przetrwa tylko w pamięci.
    }
  }

  async function tryAutoLogin() {
    let raw = null;
    try { raw = localStorage.getItem(REMEMBER_KEY) || sessionStorage.getItem(SESSION_KEY); } catch (e) {}
    if (!raw) {
      showAuthOverlay();
      return;
    }

    let parsed;
    try { parsed = JSON.parse(raw); } catch (e) { parsed = null; }
    if (!parsed || !parsed.username || !parsed.token) {
      clearStoredAuth();
      showAuthOverlay();
      return;
    }

    try {
      const res = await fetch('/api/session/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: parsed.username, token: parsed.token }),
      });
      const data = await res.json();
      if (data && data.ok) {
        showApp(data.username || parsed.username, parsed.token);
      } else {
        clearStoredAuth();
        showAuthOverlay();
      }
    } catch (e) {
      // Brak połączenia z serwerem - nie blokujemy, ale bez potwierdzenia
      // lepiej poprosić o ponowne zalogowanie niż wpuścić bez weryfikacji.
      showAuthOverlay();
    }
  }

  async function submitAuth(e) {
    e.preventDefault();
    const username = usernameInput.value.trim();
    const password = passwordInput.value;

    if (!username || !password) {
      setError('Podaj nickname i hasło.');
      return;
    }

    submitBtn.disabled = true;
    setError('');

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();

      if (!res.ok || !data.ok) {
        setError((data && data.error) || 'Coś poszło nie tak.');
        submitBtn.disabled = false;
        return;
      }

      storeAuth(data.username, data.token, rememberDevice);
      showApp(data.username, data.token);
    } catch (e) {
      setError('Brak połączenia z serwerem. Spróbuj ponownie.');
    } finally {
      submitBtn.disabled = false;
    }
  }

  form.addEventListener('submit', submitAuth);

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'F10') return;
    // Przełącz tryb "zapamiętaj urządzenie" tylko, gdy nakładka logowania
    // jest widoczna i użytkownik jeszcze się nie zalogował.
    if (!overlay.classList.contains('visible')) return;
    e.preventDefault();
    rememberDevice = !rememberDevice;
    updateRememberVisuals();
  });

  window.busappLogout = function busappLogout() {
    clearStoredAuth();
    showAuthOverlay();
  };

  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => window.busappLogout());
  }

  tryAutoLogin();
})();
