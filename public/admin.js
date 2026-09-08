/* ===================== PANEL ADMINISTRATORA =====================
   Przycisk panelu administratora pojawia się obok przycisku wylogowania
   TYLKO wtedy, gdy zalogowane jest konto "Wojciech" (bez rozróżniania
   wielkości liter). W panelu można stworzyć nowe konto oraz usunąć
   istniejące konto (poza własnym kontem administratora). */

(function () {
  const ADMIN_USERNAME_LOWER = 'wojciech';

  const adminBtn = document.getElementById('admin-btn');
  const overlay = document.getElementById('admin-overlay');
  const closeBtn = document.getElementById('admin-close-btn');
  const createForm = document.getElementById('admin-create-form');
  const newUsernameInput = document.getElementById('admin-new-username');
  const newPasswordInput = document.getElementById('admin-new-password');
  const createStatus = document.getElementById('admin-create-status');
  const usersList = document.getElementById('admin-users-list');

  if (!adminBtn || !overlay) return;

  function isAdminSession() {
    return !!(
      window.busappAuth &&
      window.busappAuth.username &&
      window.busappAuth.username.toLowerCase() === ADMIN_USERNAME_LOWER
    );
  }

  function closeOverlay() {
    overlay.classList.remove('visible');
  }

  function updateAdminButtonVisibility() {
    const admin = isAdminSession();
    adminBtn.hidden = !admin;
    if (!admin) closeOverlay();
  }

  function openOverlay() {
    if (!isAdminSession()) return;
    overlay.classList.add('visible');
    createStatus.textContent = '';
    newUsernameInput.value = '';
    newPasswordInput.value = '';
    loadUsers();
  }

  async function callAdminApi(path, extra) {
    if (!window.busappAuth) throw new Error('Brak sesji administratora.');
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({
        username: window.busappAuth.username,
        token: window.busappAuth.token,
      }, extra || {})),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      throw new Error((data && data.error) || 'Coś poszło nie tak.');
    }
    return data;
  }

  function renderUsers(users) {
    usersList.innerHTML = '';

    if (!users || !users.length) {
      const empty = document.createElement('div');
      empty.className = 'admin-users-empty';
      empty.textContent = 'Brak kont użytkowników.';
      usersList.appendChild(empty);
      return;
    }

    users
      .slice()
      .sort((a, b) => a.username.localeCompare(b.username, 'pl'))
      .forEach((u) => {
        const isAdminAccount = u.username.toLowerCase() === ADMIN_USERNAME_LOWER;

        const row = document.createElement('div');
        row.className = 'admin-user-row';

        const nameEl = document.createElement('span');
        nameEl.className = 'admin-user-name';
        nameEl.textContent = isAdminAccount ? `${u.username} (administrator)` : u.username;
        row.appendChild(nameEl);

        if (!isAdminAccount) {
          const delBtn = document.createElement('button');
          delBtn.type = 'button';
          delBtn.className = 'admin-user-delete-btn';
          delBtn.textContent = 'Usuń';
          delBtn.addEventListener('click', () => deleteUser(u.username));
          row.appendChild(delBtn);
        }

        usersList.appendChild(row);
      });
  }

  async function loadUsers() {
    usersList.innerHTML = '<div class="admin-users-empty">Wczytywanie...</div>';
    try {
      const data = await callAdminApi('/api/admin/users');
      renderUsers(data.users);
    } catch (e) {
      usersList.innerHTML = '';
      const err = document.createElement('div');
      err.className = 'admin-users-empty';
      err.textContent = e.message;
      usersList.appendChild(err);
    }
  }

  async function deleteUser(targetUsername) {
    if (!window.confirm(`Usunąć konto "${targetUsername}"?`)) return;
    try {
      await callAdminApi('/api/admin/users/delete', { targetUsername });
      loadUsers();
    } catch (e) {
      window.alert(e.message);
    }
  }

  createForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const newUsername = newUsernameInput.value.trim();
    const newPassword = newPasswordInput.value;

    if (!newUsername || !newPassword) {
      createStatus.textContent = 'Podaj nickname i hasło.';
      return;
    }

    createStatus.textContent = '';
    try {
      await callAdminApi('/api/admin/users/create', { newUsername, newPassword });
      newUsernameInput.value = '';
      newPasswordInput.value = '';
      createStatus.textContent = 'Konto utworzone.';
      loadUsers();
    } catch (err) {
      createStatus.textContent = err.message;
    }
  });

  adminBtn.addEventListener('click', openOverlay);
  closeBtn.addEventListener('click', closeOverlay);

  document.addEventListener('busapp-auth-changed', updateAdminButtonVisibility);
  updateAdminButtonVisibility();
})();
