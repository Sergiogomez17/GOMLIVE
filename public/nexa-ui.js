// NEXA LIVE — capa de interfaz compartida por el emisor y el receptor.
// Maneja temas, chat, lista de participantes, ajustes y estados visuales.
// No toca la señalización WebRTC: solo usa nodos propios de rooms/main
// (chat, host) y lee la lista de espectadores (viewers) que ya existe.
const NexaUI = (() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // ---------- Iconos (SVG inline, estilo lineal) ----------
  const ICONS = {
    play: '<circle cx="12" cy="12" r="10"/><path d="M10 8.5v7l6-3.5z" fill="currentColor"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    'chevron-down': '<path d="m6 9 6 6 6-6"/>',
    'chevron-right': '<path d="m9 18 6-6-6-6"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
    palette: '<circle cx="13.5" cy="6.5" r="1" fill="currentColor"/><circle cx="17.5" cy="10.5" r="1" fill="currentColor"/><circle cx="8.5" cy="7.5" r="1" fill="currentColor"/><circle cx="6.5" cy="12.5" r="1" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.93 0 1.65-.75 1.65-1.69 0-.44-.18-.84-.44-1.13-.29-.29-.44-.65-.44-1.13a1.64 1.64 0 0 1 1.67-1.67h2c3.05 0 5.55-2.5 5.55-5.55C21.97 6.01 17.46 2 12 2z"/>',
    mic: '<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><path d="M12 19v3"/>',
    'mic-off': '<path d="m2 2 20 20"/><path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2"/><path d="M5 10v2a7 7 0 0 0 12 5"/><path d="M15 9.34V5a3 3 0 0 0-5.68-1.33"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12"/><path d="M12 19v3"/>',
    video: '<path d="m16 13 5.22 3.48a.5.5 0 0 0 .78-.42V7.87a.5.5 0 0 0-.75-.43L16 10.5"/><rect x="2" y="6" width="14" height="12" rx="2"/>',
    'video-off': '<path d="M10.66 6H14a2 2 0 0 1 2 2v2.5l5.25-3.06a.5.5 0 0 1 .75.43v8.2"/><path d="M16 16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2"/><path d="m2 2 20 20"/>',
    smile: '<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><path d="M9 9h.01M15 9h.01"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.6.85 1 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/>',
    share: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M12 17v4M8 21h8"/><path d="m9 10 3-3 3 3M12 7v6"/>',
    send: '<path d="M5 3.8 20.5 12 5 20.2l2.6-8.2z" fill="currentColor"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
    crown: '<path d="M3 7.5 7.5 11 12 4.5 16.5 11 21 7.5 19 18H5Z" fill="currentColor" stroke-width="1.5"/>',
    maximize: '<path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/>',
    message: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
    volume: '<path d="M11 4.7a.7.7 0 0 0-1.2-.5L6.4 7.6A1.4 1.4 0 0 1 5.4 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.4a1.4 1.4 0 0 1 1 .4l3.4 3.4a.7.7 0 0 0 1.2-.5Z"/><path d="M16 9a5 5 0 0 1 0 6"/><path d="M19.4 18.4a9 9 0 0 0 0-12.8"/>',
    'volume-off': '<path d="M11 4.7a.7.7 0 0 0-1.2-.5L6.4 7.6A1.4 1.4 0 0 1 5.4 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.4a1.4 1.4 0 0 1 1 .4l3.4 3.4a.7.7 0 0 0 1.2-.5Z"/><path d="m22 9-6 6M16 9l6 6"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    stop: '<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/>',
    broadcast: '<path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9"/><path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5"/><circle cx="12" cy="12" r="2"/><path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5"/><path d="M19.1 4.9C23 8.8 23 15.1 19.1 19"/>',
    swap: '<path d="M16 3h5v5M21 3l-7 7M8 21H3v-5M3 21l7-7"/>'
  };

  const THEMES = [
    { id: 'neon', label: 'Tema Neon' },
    { id: 'purple', label: 'Tema Purple' },
    { id: 'ocean', label: 'Tema Ocean' }
  ];

  const EMOJIS = ['👋', '😀', '😂', '😍', '🤩', '😮', '👏', '🙌', '🔥', '💯', '🎉', '👍', '💙', '💚', '🚀', '🎮'];
  const MAX_TILES = 6; // Espectadores visibles antes de "+N participantes"

  // localStorage puede no estar disponible (modo privado, etc.)
  const storage = {
    get(key, fallback) {
      try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, value); } catch { /* sin persistencia */ }
    }
  };

  // Identificador por pestaña: distingue mis mensajes aunque haya varias pestañas abiertas.
  const clientId = (() => {
    try {
      let id = sessionStorage.getItem('nexa.clientId');
      if (!id) {
        id = Math.random().toString(36).slice(2, 10);
        sessionStorage.setItem('nexa.clientId', id);
      }
      return id;
    } catch {
      return Math.random().toString(36).slice(2, 10);
    }
  })();

  let role = 'viewer';
  let actions = {};
  let onNameChange = null;
  let myName = '';
  let isLive = false;
  let selfViewerId = null;
  let peopleExpanded = false;
  let unread = 0;
  const participants = new Map(); // viewerId -> { name, state }

  // ---------- Utilidades ----------
  function initials(name) {
    const parts = String(name || '?').trim().split(/\s+/).filter(Boolean);
    return ((parts[0]?.[0] || '?') + (parts[1]?.[0] || '')).toUpperCase();
  }

  function hueOf(name) {
    let h = 0;
    for (const ch of String(name)) h = (h * 31 + ch.charCodeAt(0)) % 360;
    return h;
  }

  function makeAvatar(name, extraClass = '') {
    const el = document.createElement('span');
    el.className = 'avatar ' + extraClass;
    el.style.setProperty('--h', hueOf(name));
    el.textContent = initials(name);
    return el;
  }

  function paintAvatar(el, name) {
    if (!el) return;
    el.style.setProperty('--h', hueOf(name));
    el.textContent = initials(name);
  }

  function icon(name, cls = '') {
    return `<svg class="i ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
  }

  function toast(text, type = 'info') {
    const box = $('#toasts');
    const el = document.createElement('div');
    el.className = 'toast toast-' + type;
    el.setAttribute('role', 'status');
    el.textContent = text;
    box.appendChild(el);
    setTimeout(() => el.classList.add('out'), 3200);
    setTimeout(() => el.remove(), 3600);
  }

  const isMobile = () => window.matchMedia('(max-width: 900px)').matches;

  // ---------- Inyección de piezas compartidas (iconos, popovers, diálogo) ----------
  function injectChrome() {
    const sprite = Object.entries(ICONS)
      .map(([id, body]) => `<symbol id="i-${id}" viewBox="0 0 24 24">${body}</symbol>`)
      .join('');
    document.body.insertAdjacentHTML('afterbegin',
      `<svg width="0" height="0" style="position:absolute" aria-hidden="true">${sprite}</svg>`);

    const otherView = role === 'host'
      ? { href: '/receptor', label: 'Abrir vista de espectador' }
      : { href: '/emisor', label: 'Abrir vista de moderador' };

    document.body.insertAdjacentHTML('beforeend', `
      <div class="popover room-menu" id="roomMenu" hidden>
        <p class="popover-title">Sala General</p>
        <button class="menu-item" id="copyLinkBtn">${icon('link')} Copiar enlace para espectadores</button>
        <a class="menu-item" href="${otherView.href}" target="_blank" rel="noopener">${icon('swap')} ${otherView.label}</a>
      </div>

      <div class="popover emoji-pop" id="emojiPop" hidden>
        <p class="popover-title">Emojis para el chat</p>
        <div class="emoji-grid">
          ${EMOJIS.map((e) => `<button type="button" class="emoji-btn" data-emoji="${e}">${e}</button>`).join('')}
        </div>
      </div>

      <dialog class="dialog" id="settingsDialog" aria-labelledby="settingsTitle">
        <form method="dialog" class="dialog-body" id="settingsForm">
          <header class="dialog-head">
            <span class="chat-head-ic">${icon('settings')}</span>
            <h2 id="settingsTitle">Ajustes</h2>
            <button type="button" class="icon-btn" id="settingsClose" aria-label="Cerrar">${icon('x')}</button>
          </header>

          <label class="field">
            <span>Tu nombre visible</span>
            <input id="nameInput" type="text" maxlength="24" required />
          </label>

          <label class="field">
            <span>Tema visual</span>
            <select id="themeSelectDialog"></select>
          </label>

          <label class="switch">
            <input type="checkbox" id="glowInput" />
            <span class="switch-track"></span>
            <span>Efectos de brillo neón</span>
          </label>

          <div class="dialog-info">
            <strong>Sobre esta sala</strong>
            <span>WebRTC P2P 1:N — el moderador envía su video a cada espectador.</span>
            <span>Señalización y chat: Firebase Realtime Database.</span>
          </div>

          <footer class="dialog-foot">
            <button type="button" class="pill-btn" id="settingsCancel">Cancelar</button>
            <button type="submit" class="pill-btn pill-primary" value="save">Guardar</button>
          </footer>
        </form>
      </dialog>

      <div class="toasts" id="toasts" aria-live="polite"></div>
    `);
  }

  // ---------- Popovers ----------
  function openPopover(pop, anchor) {
    closePopovers();
    pop.hidden = false;
    const r = anchor.getBoundingClientRect();
    const pr = pop.getBoundingClientRect();
    const margin = 12;
    let left = r.left + r.width / 2 - pr.width / 2;
    left = Math.max(margin, Math.min(left, window.innerWidth - pr.width - margin));
    // Arriba del botón si hay espacio; si no, debajo.
    let top = r.top - pr.height - 10;
    if (top < margin) top = r.bottom + 10;
    pop.style.left = left + 'px';
    pop.style.top = top + 'px';
    anchor.setAttribute('aria-expanded', 'true');
    pop._anchor = anchor;
  }

  function closePopovers() {
    $$('.popover').forEach((p) => {
      if (!p.hidden) {
        p.hidden = true;
        p._anchor?.setAttribute('aria-expanded', 'false');
      }
    });
  }

  function togglePopover(pop, anchor) {
    if (!pop.hidden && pop._anchor === anchor) closePopovers();
    else openPopover(pop, anchor);
  }

  // ---------- Temas ----------
  function applyTheme(id) {
    const theme = THEMES.find((t) => t.id === id) || THEMES[0];
    document.documentElement.dataset.theme = theme.id;
    storage.set('nexa.theme', theme.id);
    $$('#themeSelect, #themeSelectDialog').forEach((sel) => { sel.value = theme.id; });
  }

  function cycleTheme() {
    const current = document.documentElement.dataset.theme;
    const idx = THEMES.findIndex((t) => t.id === current);
    const next = THEMES[(idx + 1) % THEMES.length];
    applyTheme(next.id);
    toast(next.label + ' activado');
  }

  function applyGlow(on) {
    document.documentElement.dataset.glow = on ? 'on' : 'off';
    storage.set('nexa.glow', on ? 'on' : 'off');
    $$('[data-action="glow"]').forEach((b) => b.setAttribute('aria-pressed', String(on)));
    const input = $('#glowInput');
    if (input) input.checked = on;
  }

  function initThemes() {
    const options = THEMES.map((t) => `<option value="${t.id}">${t.label}</option>`).join('');
    $$('#themeSelect, #themeSelectDialog').forEach((sel) => {
      sel.innerHTML = options;
    });
    $('#themeSelect').addEventListener('change', (e) => applyTheme(e.target.value));
    applyTheme(storage.get('nexa.theme', 'neon'));
    applyGlow(storage.get('nexa.glow', 'on') === 'on');
  }

  // ---------- Nombre / perfil ----------
  function getName() {
    return myName;
  }

  function setName(name) {
    myName = name.trim().slice(0, 24) || myName;
    storage.set('nexa.name.' + role, myName);
    $('#meName').textContent = myName;
    paintAvatar($('#meAvatar'), myName);
    paintAvatar($('#meTileAvatar'), myName);
  }

  function initName() {
    const fallback = role === 'host'
      ? 'Moderador'
      : 'Invitado ' + Math.floor(1000 + Math.random() * 9000);
    setName(storage.get('nexa.name.' + role, fallback));
  }

  // ---------- Ajustes ----------
  function openSettings() {
    closePopovers();
    const dlg = $('#settingsDialog');
    $('#nameInput').value = myName;
    $('#themeSelectDialog').value = document.documentElement.dataset.theme;
    $('#glowInput').checked = document.documentElement.dataset.glow !== 'off';
    dlg.showModal();
  }

  function initSettings() {
    const dlg = $('#settingsDialog');
    const close = () => dlg.close();
    $('#settingsClose').addEventListener('click', close);
    $('#settingsCancel').addEventListener('click', close);
    $('#settingsForm').addEventListener('submit', () => {
      const newName = $('#nameInput').value.trim();
      const changed = newName && newName !== myName;
      if (newName) setName(newName);
      applyTheme($('#themeSelectDialog').value);
      applyGlow($('#glowInput').checked);
      if (changed && onNameChange) onNameChange(myName);
      toast('Ajustes guardados', 'ok');
    });
    // Cerrar al hacer clic fuera del contenido.
    dlg.addEventListener('click', (e) => {
      if (e.target === dlg) close();
    });
  }

  // ---------- Controles (botones con data-action) ----------
  const builtInActions = {
    theme: () => cycleTheme(),
    glow: () => applyGlow(document.documentElement.dataset.glow === 'off'),
    settings: () => openSettings(),
    emoji: (btn) => togglePopover($('#emojiPop'), btn),
    fullscreen: () => toggleFullscreen()
  };

  function bindActions() {
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const name = btn.dataset.action;
      // Los botones "deshabilitados" siguen recibiendo clics para explicar por qué.
      if (btn.getAttribute('aria-disabled') === 'true') {
        toast(btn.dataset.reason || 'Esta función no está disponible.', 'warn');
        return;
      }
      const fn = actions[name] || builtInActions[name];
      if (fn) fn(btn);
    });
  }

  // Sincroniza el estado visual de todos los botones/indicadores de una acción.
  function setControl(name, { on, disabled, reason } = {}) {
    $$(`[data-action="${name}"], [data-state-of="${name}"]`).forEach((el) => {
      if (on !== undefined) {
        el.classList.toggle('is-off', !on);
        if (el.matches('button')) el.setAttribute('aria-pressed', String(on));
      }
      if (disabled !== undefined && el.matches('button')) {
        el.setAttribute('aria-disabled', String(disabled));
        if (reason) el.dataset.reason = reason;
      }
    });
  }

  function toggleFullscreen() {
    const stage = $('#stage');
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else if (stage.requestFullscreen) {
      stage.requestFullscreen().catch(() => toast('Pantalla completa no disponible', 'warn'));
    } else {
      const video = stage.querySelector('video');
      if (video && video.webkitEnterFullscreen) video.webkitEnterFullscreen();
    }
  }

  // ---------- Escenario (video central) ----------
  function setStageActive(active) {
    $('#stage').classList.toggle('has-video', !!active);
  }

  function setSelfVideo(active) {
    $('#meTile').classList.toggle('has-video', !!active);
  }

  // ---------- Estado de la sala ----------
  function setLive(live) {
    isLive = live;
    const badge = $('#liveBadge');
    badge.textContent = live ? 'EN VIVO' : 'OFFLINE';
    badge.classList.toggle('is-live', live);
    document.body.classList.toggle('is-live', live);
    updateCounts();
    if (role === 'viewer') {
      const title = $('#stageEmptyTitle');
      const text = $('#stageEmptyText');
      if (title && text) {
        title.textContent = live ? 'El moderador está en vivo' : 'Esperando al moderador';
        text.textContent = live
          ? 'Presiona "Conectar" para unirte a la transmisión.'
          : 'Cuando el moderador inicie la transmisión podrás conectarte y verla aquí.';
      }
    }
  }

  function watchRoom() {
    const room = db.ref(ROOM_PATH);
    room.child('active').on('value', (snap) => setLive(!!snap.val()));
    room.child('host/name').on('value', (snap) => {
      $('#hostName').textContent = snap.val() || (role === 'host' ? myName : 'Sin moderador');
    });

    // Estado real de la conexión con Firebase
    db.ref('.info/connected').on('value', (snap) => {
      const online = !!snap.val();
      const el = $('#netState');
      el.textContent = online ? 'Online' : 'Sin conexión';
      el.classList.toggle('is-offline', !online);
    });
  }

  // ---------- Participantes (nodo viewers de la señalización) ----------
  function upsertParticipant(id, data) {
    participants.set(id, { name: 'Espectador', state: null, ...participants.get(id), ...data });
    renderPeople();
  }

  function removeParticipant(id) {
    if (participants.delete(id)) renderPeople();
  }

  function setParticipantState(id, state) {
    if (participants.has(id)) upsertParticipant(id, { state });
  }

  function setSelfViewer(id) {
    selfViewerId = id;
    renderPeople();
  }

  function watchViewers() {
    const ref = db.ref(ROOM_PATH + '/viewers');
    ref.on('child_added', (snap) => upsertParticipant(snap.key, { name: snap.val()?.name || 'Espectador' }));
    ref.on('child_changed', (snap) => {
      const name = snap.val()?.name;
      if (name && participants.get(snap.key)?.name !== name) upsertParticipant(snap.key, { name });
    });
    ref.on('child_removed', (snap) => removeParticipant(snap.key));
  }

  const STATE_LABEL = {
    new: 'Conectando…',
    connecting: 'Conectando…',
    connected: 'Conectado',
    disconnected: 'Reconectando…',
    failed: 'Sin conexión',
    closed: 'Desconectado'
  };

  function renderPeople() {
    const grid = $('#peopleGrid');
    const others = Array.from(participants.entries()).filter(([id]) => id !== selfViewerId);
    const visible = peopleExpanded ? others : others.slice(0, MAX_TILES);
    const hidden = others.length - visible.length;

    grid.innerHTML = '';
    if (others.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'people-empty';
      empty.innerHTML = icon('users') + `<span>${role === 'host'
        ? 'Aún no hay espectadores. Comparte el enlace de la sala.'
        : 'Por ahora eres el único espectador.'}</span>`;
      grid.appendChild(empty);
    }

    for (const [, p] of visible) {
      const tile = document.createElement('div');
      tile.className = 'tile tile-peer';
      if (p.state) tile.dataset.state = p.state;

      const ph = document.createElement('div');
      ph.className = 'tile-ph';
      ph.appendChild(makeAvatar(p.name, 'avatar-lg'));
      if (p.state) {
        const st = document.createElement('small');
        st.textContent = STATE_LABEL[p.state] || p.state;
        ph.appendChild(st);
      }

      const label = document.createElement('span');
      label.className = 'tile-label';
      label.textContent = p.name;

      // Los espectadores solo reciben: no envían audio, por eso el micrófono aparece apagado.
      const mic = document.createElement('span');
      mic.className = 'tile-ic is-off';
      mic.title = 'Espectador: no transmite audio';
      mic.innerHTML = icon('mic-off', 'ic-off');

      tile.append(ph, label, mic);
      grid.appendChild(tile);
    }

    const more = $('#moreBtn');
    if (hidden > 0) {
      more.hidden = false;
      more.innerHTML = `${icon('users')} +${hidden} participante${hidden === 1 ? '' : 's'} ${icon('chevron-right', 'i-sm')}`;
    } else if (peopleExpanded && others.length > MAX_TILES) {
      more.hidden = false;
      more.innerHTML = `Ver menos`;
    } else {
      more.hidden = true;
    }

    $('#peopleCount').textContent = others.length;
    updateCounts();
  }

  function updateCounts() {
    const viewers = participants.size;
    const total = viewers + (isLive ? 1 : 0);
    $('#participantCount').textContent = total;
    $('#chatCount').textContent = total;
    $('#viewerCount').textContent = viewers;
  }

  // ---------- Chat (Firebase Realtime Database: rooms/main/chat) ----------
  function chatVisible() {
    return !isMobile() || document.body.dataset.tab === 'chat';
  }

  function setUnread(n) {
    unread = n;
    const badge = $('#unreadBadge');
    badge.textContent = n > 9 ? '9+' : n;
    badge.hidden = n === 0;
  }

  // Ilumina el borde completo del panel de chat; se reinicia si llega otro mensaje.
  function flashChat() {
    const panel = $('#chatPanel');
    panel.classList.remove('flash');
    void panel.offsetWidth; // fuerza reflow para reiniciar la animación
    panel.classList.add('flash');
  }

  function formatTime(ts) {
    if (typeof ts !== 'number') return '';
    return new Date(ts).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
  }

  function updateChatEmpty() {
    const list = $('#chatList');
    const hasMsgs = list.querySelector('.msg');
    let empty = list.querySelector('.chat-empty');
    if (!hasMsgs && !empty) {
      empty = document.createElement('li');
      empty.className = 'chat-empty';
      empty.innerHTML = icon('message') + '<span>Aún no hay mensajes.<br>¡Sé el primero en saludar!</span>';
      list.appendChild(empty);
    } else if (hasMsgs && empty) {
      empty.remove();
    }
  }

  function renderMessage(key, m) {
    if (!m || typeof m.text !== 'string') return;
    const list = $('#chatList');
    const nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 80;
    const own = m.uid === clientId;

    const li = document.createElement('li');
    li.className = 'msg' + (own ? ' is-own' : '') + (m.role === 'host' ? ' is-host' : '');
    li.id = 'm-' + key;

    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble';

    const meta = document.createElement('div');
    meta.className = 'msg-meta';
    const name = document.createElement('strong');
    name.textContent = m.name || 'Anónimo';
    meta.appendChild(name);
    if (m.role === 'host') meta.insertAdjacentHTML('beforeend', icon('crown', 'i-xs crown'));
    const time = document.createElement('time');
    time.textContent = formatTime(m.ts);
    meta.appendChild(time);

    const text = document.createElement('p');
    text.textContent = m.text;

    bubble.append(meta, text);
    li.append(makeAvatar(m.name || '?'), bubble);
    list.appendChild(li);
    updateChatEmpty();

    if (nearBottom || own) list.scrollTop = list.scrollHeight;
  }

  function initChat() {
    const chatRef = db.ref(ROOM_PATH + '/chat');
    const query = chatRef.limitToLast(60);
    let synced = false;

    query.on('child_added', (snap) => {
      renderMessage(snap.key, snap.val());
      // Solo los mensajes que llegan en vivo (no el historial inicial) iluminan el panel.
      if (synced) {
        flashChat();
        if (!chatVisible()) setUnread(unread + 1);
      }
    });
    query.on('child_removed', (snap) => {
      document.getElementById('m-' + snap.key)?.remove();
      updateChatEmpty();
    });
    // 'value' se dispara después de todos los child_added iniciales.
    query.once('value', () => { synced = true; });

    updateChatEmpty();

    const input = $('#chatInput');
    $('#chatForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      chatRef.push({
        uid: clientId,
        name: myName,
        role,
        text: text.slice(0, 300),
        ts: firebase.database.ServerValue.TIMESTAMP
      }).catch((err) => toast('No se pudo enviar: ' + err.message, 'error'));
      input.value = '';
      input.focus();
    });

    // Emojis: se insertan en la caja de texto del chat (no se envían solos).
    $('#emojiPop').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-emoji]');
      if (!btn) return;
      const pos = input.selectionStart ?? input.value.length;
      input.value = input.value.slice(0, pos) + btn.dataset.emoji + input.value.slice(pos);
      if (isMobile()) setTab('chat');
      input.focus();
      input.setSelectionRange(pos + btn.dataset.emoji.length, pos + btn.dataset.emoji.length);
    });
  }

  // ---------- Pestañas en móvil ----------
  function setTab(tab) {
    document.body.dataset.tab = tab;
    $$('[data-tab-btn]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tabBtn === tab)));
    if (tab === 'chat') {
      setUnread(0);
      const list = $('#chatList');
      list.scrollTop = list.scrollHeight;
    }
  }

  // ---------- Menú de sala ----------
  function initRoomMenu() {
    const btn = $('#roomBtn');
    btn.addEventListener('click', () => togglePopover($('#roomMenu'), btn));
    $('#copyLinkBtn').addEventListener('click', async () => {
      const url = location.origin + '/receptor';
      try {
        await navigator.clipboard.writeText(url);
        toast('Enlace copiado: ' + url, 'ok');
      } catch {
        toast('Copia este enlace: ' + url);
      }
      closePopovers();
    });
  }

  // ---------- Inicialización ----------
  function init(options) {
    role = options.role;
    actions = options.actions || {};
    onNameChange = options.onNameChange || null;

    injectChrome();
    initThemes();
    initName();
    initSettings();
    initRoomMenu();
    bindActions();
    watchRoom();
    watchViewers();
    initChat();
    renderPeople();

    $$('[data-tab-btn]').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tabBtn)));
    setTab('people');

    $('#moreBtn').addEventListener('click', () => {
      peopleExpanded = !peopleExpanded;
      renderPeople();
    });

    // El texto de estado puede ser largo: se muestra completo como tooltip.
    const status = $('#status');
    const syncTitle = () => { status.title = status.textContent; };
    new MutationObserver(syncTitle).observe(status, { childList: true, characterData: true, subtree: true });
    syncTitle();

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.popover, [data-action="emoji"], #roomBtn')) closePopovers();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closePopovers();
    });
    window.addEventListener('resize', closePopovers);
  }

  return {
    init,
    getName,
    setControl,
    setStageActive,
    setSelfVideo,
    setSelfViewer,
    setParticipantState,
    toast
  };
})();
