/* Infinite Craft Joxia — jeu de combinaison d'éléments (statique, 100 % hors-ligne)
 * Données : expitau/InfiniteCraftWiki (MIT, © 2025 Nathan DSilva)
 * 793 068 éléments, 6 669 547 combinaisons uniques.
 */
(function () {
  'use strict';

  /* ---------- références DOM ---------- */
  const $ = (id) => document.getElementById(id);
  const loader = $('loader'), loaderFill = $('loaderFill'), loaderText = $('loaderText');
  const app = $('app'), canvas = $('canvas'), hint = $('hint');
  const sideList = $('sideList'), sideCount = $('sideCount'), search = $('search');
  const toggleSideBtn = $('toggleSide'), sidebar = $('sidebar'), mobileTab = $('mobileTab');
  const mobileCount = $('mobileCount');
  const statDisc = $('statDisc'), statTotal = $('statTotal');
  const resetBtn = $('resetBtn'), toast = $('toast'), fx = $('fx');

  /* ---------- état ---------- */
  let names = [], emojis = [];
  let offsets = null, neighbors = null, results = null;
  let N = 0, M = 0;
  const BASE = [1, 2, 3, 4]; // Water, Fire, Wind, Earth
  const BASE_POS = { 1: [0.30, 0.55], 2: [0.46, 0.36], 3: [0.60, 0.36], 4: [0.76, 0.55] };
  const SAVE_KEY = 'joxia-icraft-v1';

  let discovered = [];            // ids, ordre de découverte (ancien -> récent)
  const discoveredSet = new Set();
  let sessionNew = new Set();     // découvertes de la session (badge NOUVEAU)
  const canvasOrbs = new Map();   // id -> {x, y} (fractions 0..1)
  const orbEls = new Map();       // id -> HTMLElement

  let selectedId = null;          // élément sélectionné (mode clic-clic)
  let searchTerm = '';
  let toastTimer = null;
  let hasCombined = false;

  /* ---------- utilitaires ---------- */
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const hueOf = (id) => ((id * 2654435761) >>> 0) % 360;
  const nameOf = (id) => names[id] || 'Inconnu';
  const emojiOf = (id) => emojis[id] || '';
  const isMobile = () => window.matchMedia('(max-width: 760px)').matches;

  function orbFaceStyle(id) {
    const h = hueOf(id);
    return 'background:radial-gradient(circle at 32% 28%, hsl(' + h + ',82%,66%), hsl(' + h + ',74%,46%) 68%)';
  }

  /* ---------- chargement des données ---------- */
  function setLoader(pct, text) {
    loaderFill.style.width = pct + '%';
    if (text) loaderText.textContent = text;
  }

  async function loadData() {
    setLoader(3, 'Chargement des éléments…');
    const meta = await (await fetch('data/meta.json')).json();
    const el = await (await fetch('data/elements.json')).json();
    names = el.n; emojis = el.e;
    N = names.length;
    statTotal.textContent = (N - 1).toLocaleString('fr-FR');

    setLoader(30, 'Chargement des combinaisons…');
    const resp = await fetch('data/recipes.data');
    // taille décodée attendue = en-tête(8) + offsets(4*(N+1)) + 2 * 4*M
    const expected = 8 + 4 * (N + 1) + 8 * meta.M;
    const buf = await readAll(resp.body, expected);
    setLoader(80, 'Préparation du terrain…');

    const dv = new DataView(buf);
    const n = dv.getUint32(0, true);
    const m = dv.getUint32(4, true);
    const off = 8;
    offsets = new Uint32Array(buf, off, n + 1);
    neighbors = new Uint32Array(buf, off + 4 * (n + 1), m);
    results = new Uint32Array(buf, off + 4 * (n + 1) + 4 * m, m);
    M = m;
  }

  // Lit le flux réponse (déjà décompressé par le navigateur) en suivant la progression.
  async function readAll(body, expected) {
    const reader = body.getReader();
    const chunks = [];
    let received = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.length;
      chunks.push(value);
      setLoader(30 + (received / expected) * 45,
        'Chargement des combinaisons… ' + Math.round(received / 1048576) + ' Mo');
    }
    const buf = new Uint8Array(received);
    let off = 0;
    for (const c of chunks) { buf.set(c, off); off += c.length; }
    return buf.buffer;
  }

  /* ---------- recherche de combinaison ---------- */
  // Renvoie l'id résultat, ou 0 si rien ne se forme.
  function combineResult(x, y) {
    if (x === y) return 0;
    const a = x < y ? x : y, b = x < y ? y : x;
    let lo = offsets[a], hi = offsets[a + 1];
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (neighbors[mid] < b) lo = mid + 1; else hi = mid;
    }
    return (lo < offsets[a + 1] && neighbors[lo] === b) ? results[lo] : 0;
  }

  /* ---------- rendu des orbes ---------- */
  function makeOrb(id, x, y, opts) {
    const el = document.createElement('div');
    el.className = 'orb' + (opts && opts.enter ? ' enter' : '');
    el.dataset.id = id;
    el.setAttribute('role', 'button');
    el.setAttribute('tabindex', '0');
    el.setAttribute('aria-label', 'Élément ' + nameOf(id));

    const face = document.createElement('div');
    face.className = 'orb-face';
    face.style.cssText = orbFaceStyle(id);
    if (emojiOf(id)) {
      face.textContent = emojiOf(id);
    } else {
      const mono = document.createElement('span');
      mono.className = 'orb-mono';
      mono.textContent = (nameOf(id)[0] || '?').toUpperCase();
      face.appendChild(mono);
    }
    const nm = document.createElement('span');
    nm.className = 'orb-name';
    nm.textContent = nameOf(id);

    el.appendChild(face);
    el.appendChild(nm);
    canvas.appendChild(el);
    el.style.left = (x * 100) + '%';
    el.style.top = (y * 100) + '%';
    bindOrb(el, id);
    orbEls.set(id, el);
    canvasOrbs.set(id, { x, y });
    return el;
  }

  function setOrbPos(id, x, y) {
    x = clamp(x, 0.04, 0.96); y = clamp(y, 0.07, 0.94);
    canvasOrbs.get(id).x = x; canvasOrbs.get(id).y = y;
    const el = orbEls.get(id);
    el.style.left = (x * 100) + '%';
    el.style.top = (y * 100) + '%';
  }

  function select(id) {
    deselect();
    selectedId = id;
    orbEls.get(id).classList.add('selected');
    showHint('Sélectionne un second élément à combiner.');
  }
  function deselect() {
    if (selectedId != null) {
      const e = orbEls.get(selectedId);
      if (e) e.classList.remove('selected');
    }
    selectedId = null;
    showHint('Glisse un élément sur un autre, ou sélectionne-les un à un pour les combiner.');
  }

  /* ---------- interaction (pointer : clic + drag) ---------- */
  let drag = null;

  function bindOrb(el, id) {
    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const p = canvasOrbs.get(id);
      drag = { id, startX: e.clientX, startY: e.clientY, ox: p.x, oy: p.y, moved: false, el };
      el.classList.add('dragging');
      el.setPointerCapture(e.pointerId);
    });

    el.addEventListener('pointermove', (e) => {
      if (!drag || drag.id !== id) return;
      const dx = e.clientX - drag.startX, dy = e.clientY - drag.startY;
      if (!drag.moved && Math.hypot(dx, dy) > 6) { drag.moved = true; hint.classList.add('hidden'); }
      if (!drag.moved) return;
      const r = canvas.getBoundingClientRect();
      setOrbPos(id, drag.ox + dx / r.width, drag.oy + dy / r.height);
      highlightTarget(e.clientX, e.clientY, id);
    });

    el.addEventListener('pointerup', (e) => {
      if (!drag || drag.id !== id) return;
      const wasMoved = drag.moved;
      const d = drag;
      drag = null;
      el.classList.remove('dragging');
      clearTarget();
      if (!wasMoved) { onClickOrb(id); return; }
      const target = orbAtPoint(e.clientX, e.clientY, id);
      if (target != null) {
        // retour à l'origine + combinaison
        setOrbPos(id, d.ox, d.oy);
        const t = orbEls.get(target).getBoundingClientRect();
        attemptCombine(id, target, (t.left + t.width / 2), (t.top + t.height / 2));
      }
      save();
    });

    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClickOrb(id); }
    });
  }

  function highlightTarget(x, y, selfId) {
    const t = orbAtPoint(x, y, selfId);
    orbEls.forEach((el, id) => el.classList.toggle('drop-target', id === t));
  }
  function clearTarget() {
    orbEls.forEach((el) => el.classList.remove('drop-target'));
  }
  function orbAtPoint(x, y, excludeId) {
    for (const [id, el] of orbEls) {
      if (id === excludeId) continue;
      const r = el.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return id;
    }
    return null;
  }

  function onClickOrb(id) {
    if (selectedId == null) { select(id); return; }
    if (selectedId === id) { deselect(); return; }
    const a = selectedId, b = id;
    const pa = canvasOrbs.get(a), pb = canvasOrbs.get(b);
    deselect();
    const r = canvas.getBoundingClientRect();
    const cx = r.left + ((pa.x + pb.x) / 2) * r.width;
    const cy = r.top + ((pa.y + pb.y) / 2) * r.height;
    attemptCombine(a, b, cx, cy);
  }

  /* ---------- logique de combinaison ---------- */
  function attemptCombine(a, b, cx, cy) {
    const r = combineResult(a, b);
    hasCombined = true;
    hint.classList.add('hidden');
    if (r === 0) { nothingAt(cx, cy); return; }
    const first = discover(r, cx, cy);
    if (first) celebrate(r, cx, cy);
    else spawnParticles(cx, cy, hueOf(r), 10);
  }

  function discover(id, cx, cy) {
    const isFirst = !discoveredSet.has(id);
    if (isFirst) {
      discovered.push(id);
      discoveredSet.add(id);
      sessionNew.add(id);
      updateStats();
      renderSideList();
    }
    if (!orbEls.has(id)) {
      const r = canvas.getBoundingClientRect();
      const jx = (Math.random() - 0.5) * 0.05;
      const jy = (Math.random() - 0.5) * 0.05;
      const x = clamp((cx - r.left) / r.width + jx, 0.04, 0.96);
      const y = clamp((cy - r.top) / r.height + jy, 0.07, 0.94);
      makeOrb(id, x, y, { enter: true, first: isFirst });
      if (isFirst && orbEls.get(id)) orbEls.get(id).classList.add('first');
    }
    if (isFirst) save();
    return isFirst;
  }

  /* ---------- feedback visuel ---------- */
  function showHint(txt) {
    const span = hint.querySelector('span');
    if (span) span.textContent = txt;
  }

  function nothingAt(cx, cy) {
    puff(cx, cy, 'Rien', 'rgba(139,147,184,.9)');
  }

  function puff(x, y, text, color) {
    const s = document.createElement('span');
    s.className = 'fx-p';
    s.textContent = text;
    s.style.left = x + 'px';
    s.style.top = y + 'px';
    s.style.color = color;
    s.style.fontWeight = '700';
    s.style.fontSize = '15px';
    s.style.transform = 'translate(-50%, -50%)';
    s.style.setProperty('--dx', '0px');
    s.style.setProperty('--dy', '-34px');
    s.style.animationDuration = '.7s';
    fx.appendChild(s);
    setTimeout(() => s.remove(), 800);
  }

  function spawnParticles(x, y, hue, count) {
    const colors = ['hsl(' + hue + ',85%,62%)', 'hsl(' + ((hue + 40) % 360) + ',85%,62%)', '#ffd76a', '#8b5cf6', '#22d3ee'];
    for (let i = 0; i < count; i++) {
      const s = document.createElement('span');
      s.className = 'fx-p';
      const size = 5 + Math.random() * 7;
      s.style.width = size + 'px';
      s.style.height = size + 'px';
      s.style.background = colors[(Math.random() * colors.length) | 0];
      s.style.left = x + 'px';
      s.style.top = y + 'px';
      const ang = Math.random() * Math.PI * 2;
      const dist = 40 + Math.random() * 90;
      s.style.setProperty('--dx', Math.cos(ang) * dist + 'px');
      s.style.setProperty('--dy', Math.sin(ang) * dist + 'px');
      s.style.animationDuration = (0.6 + Math.random() * 0.5) + 's';
      fx.appendChild(s);
      setTimeout(() => s.remove(), 1200);
    }
  }

  function celebrate(id, x, y) {
    spawnParticles(x, y, hueOf(id), 30);
    spawnParticles(x, y, 45, 18);
    showToast((emojiOf(id) ? emojiOf(id) + ' ' : '') + nameOf(id) + ' découvert !', 'first');
  }

  function showToast(msg, kind) {
    toast.textContent = msg;
    toast.className = 'show ' + (kind || '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.className = ''; }, 2600);
  }

  /* ---------- sidebar ---------- */
  function matchesSearch(id) {
    if (!searchTerm) return true;
    return nameOf(id).toLowerCase().indexOf(searchTerm) >= 0;
  }

  function renderSideList() {
    const ids = [];
    for (let i = discovered.length - 1; i >= 0; i--) { // récent d'abord
      const id = discovered[i];
      if (matchesSearch(id)) ids.push(id);
    }
    sideCount.textContent = ids.length + ' élément' + (ids.length > 1 ? 's' : '');
    mobileCount.textContent = discovered.length + ' découverte' + (discovered.length > 1 ? 's' : '');
    if (ids.length === 0) {
      sideList.innerHTML = '<div class="side-empty">Aucun élément ne correspond.</div>';
      return;
    }
    const frag = document.createDocumentFragment();
    for (const id of ids) {
      const row = document.createElement('button');
      row.className = 'side-row';
      row.setAttribute('role', 'listitem');
      row.setAttribute('tabindex', '-1');
      const ico = document.createElement('span');
      ico.className = 'sr-ico';
      ico.style.cssText = orbFaceStyle(id);
      if (emojiOf(id)) ico.textContent = emojiOf(id);
      else { const m = document.createElement('span'); m.className = 'sr-mono'; m.textContent = (nameOf(id)[0] || '?').toUpperCase(); ico.appendChild(m); }
      const nm = document.createElement('span');
      nm.className = 'sr-name';
      nm.textContent = nameOf(id);
      row.appendChild(ico); row.appendChild(nm);
      if (sessionNew.has(id)) {
        const nw = document.createElement('span');
        nw.className = 'sr-new';
        nw.textContent = 'Nouveau';
        row.appendChild(nw);
      }
      row.onclick = () => {
        if (!orbEls.has(id)) makeOrb(id, 0.5, 0.5, { enter: true });
        else {
          const e = orbEls.get(id);
          e.classList.remove('enter');
          void e.offsetWidth;
          e.classList.add('enter');
        }
        if (isMobile()) sidebar.classList.remove('open');
      };
      frag.appendChild(row);
    }
    sideList.innerHTML = '';
    sideList.appendChild(frag);
  }

  function updateStats() {
    statDisc.textContent = discovered.length.toLocaleString('fr-FR');
  }

  /* ---------- persistance ---------- */
  function save() {
    const orbs = [];
    canvasOrbs.forEach((p, id) => orbs.push({ id, x: p.x, y: p.y }));
    try { localStorage.setItem(SAVE_KEY, JSON.stringify({ discovered, orbs })); } catch (e) {}
  }

  function loadSave() {
    let d = null;
    try { d = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) {}
    if (d && Array.isArray(d.discovered) && d.discovered.length >= 4 &&
        d.discovered.every((id) => typeof id === 'number' && id < N)) {
      discovered = d.discovered;
      discovered.forEach((id) => discoveredSet.add(id));
      // orbes
      const posMap = {};
      if (Array.isArray(d.orbs)) d.orbs.forEach((o) => { if (o && typeof o.id === 'number') posMap[o.id] = { x: o.x, y: o.y }; });
      for (const id of discovered) {
        const p = posMap[id] || { x: 0.5, y: 0.5 };
        makeOrb(id, p.x, p.y, {});
      }
    } else {
      discovered = BASE.slice();
      discovered.forEach((id) => discoveredSet.add(id));
      for (const id of BASE) makeOrb(id, BASE_POS[id][0], BASE_POS[id][1], { enter: true });
    }
    updateStats();
    renderSideList();
  }

  function resetGame() {
    if (!confirm('Réinitialiser toutes tes découvertes ? Cette action est irréversible.')) return;
    try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
    discoveredSet.clear(); sessionNew.clear();
    canvasOrbs.clear();
    orbEls.forEach((el) => el.remove());
    orbEls.clear();
    discovered = BASE.slice();
    discovered.forEach((id) => discoveredSet.add(id));
    for (const id of BASE) makeOrb(id, BASE_POS[id][0], BASE_POS[id][1], { enter: true });
    deselect();
    updateStats();
    renderSideList();
    showToast('Partie réinitialisée.');
  }

  /* ---------- init ---------- */
  resetBtn.addEventListener('click', resetGame);
  search.addEventListener('input', () => { searchTerm = search.value.trim().toLowerCase(); renderSideList(); });
  toggleSideBtn.addEventListener('click', () => {
    if (isMobile()) sidebar.classList.remove('open');
    else sidebar.classList.toggle('collapsed');
  });
  mobileTab.addEventListener('click', () => sidebar.classList.add('open'));

  (async function boot() {
    try {
      await loadData();
    } catch (err) {
      console.error(err);
      loaderText.textContent = 'Erreur de chargement des données. Recharge la page.';
      return;
    }
    loadSave();
    setLoader(100, '');
    loader.style.opacity = '0';
    setTimeout(() => { loader.remove(); app.hidden = false; }, 300);
  })();
})();
