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
  const resetBtn = $('resetBtn'), toast = $('toast'), fx = $('fx'), trash = $('trash');

  /* ---------- état ---------- */
  let names = [], emojis = [];
  let offsets = null, neighbors = null, results = null;
  let N = 0, M = 0;
  const BASE = [1, 2, 3, 4]; // Water, Fire, Wind, Earth
  const BASE_POS = { 1: [0.36, 0.40], 2: [0.64, 0.40], 3: [0.36, 0.64], 4: [0.64, 0.64] }; // grille 2×2, sans chevauchement même sur mobile
  const SAVE_KEY = 'joxia-icraft-v2';
  const OLD_SAVE_KEY = 'joxia-icraft-v1';

  let discovered = [];            // ids, ordre de découverte (ancien -> récent)
  const discoveredSet = new Set();
  let sessionNew = new Set();     // découvertes de la session (badge NOUVEAU)
  const orbs = new Map();         // iid -> { id, x, y, el } (x, y en fractions 0..1)
  let nextIid = 1;

  let selectedId = null;          // instance sélectionnée (mode clic-clic)
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
    const a = x < y ? x : y, b = x < y ? y : x;
    let lo = offsets[a], hi = offsets[a + 1];
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (neighbors[mid] < b) lo = mid + 1; else hi = mid;
    }
    return (lo < offsets[a + 1] && neighbors[lo] === b) ? results[lo] : 0;
  }

  /* ---------- rendu des orbes ----------
   * Le plateau contient des INSTANCES (iid) : on peut poser plusieurs fois le
   * même élément (ex. Eau + Eau). Combiner deux instances les consomme et les
   * remplace par le résultat.
   */
  function makeOrb(id, x, y, opts) {
    const iid = nextIid++;
    const el = document.createElement('div');
    el.className = 'orb' + (opts && opts.enter ? ' enter' : '');
    el.dataset.iid = iid;
    el.setAttribute('role', 'button');
    el.setAttribute('tabindex', '0');
    el.setAttribute('aria-label', 'Élément ' + nameOf(id) + ' (Suppr pour jeter)');
    el.title = nameOf(id);

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
    orbs.set(iid, { id, x: 0, y: 0, el });
    setOrbPos(iid, x, y);
    bindOrb(el, iid);
    return iid;
  }

  function setOrbPos(iid, x, y) {
    const o = orbs.get(iid);
    o.x = clamp(x, 0.04, 0.96); o.y = clamp(y, 0.07, 0.94);
    o.el.style.left = (o.x * 100) + '%';
    o.el.style.top = (o.y * 100) + '%';
  }

  // Retire une instance du plateau (petite animation de disparition).
  function removeOrb(iid) {
    const o = orbs.get(iid);
    if (!o) return;
    if (selectedId === iid) deselect();
    orbs.delete(iid);
    o.el.classList.add('leave');
    o.el.style.pointerEvents = 'none';
    setTimeout(() => o.el.remove(), 220);
  }

  // Cherche une place libre près de (x, y) (fractions) pour éviter les empilements.
  function freeSpot(x, y) {
    const r = canvas.getBoundingClientRect();
    const minD = 110;       // pas de la spirale (px)
    const W = 104, H = 118; // emprise d'une orbe + son nom (px) : aucune zone commune
    const isFree = (fx, fy) => {
      for (const o of orbs.values()) {
        if (Math.abs((o.x - fx) * r.width) < W && Math.abs((o.y - fy) * r.height) < H) return false;
      }
      return true;
    };
    for (let ring = 0; ring < 8; ring++) {
      const n = ring === 0 ? 1 : ring * 8;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + ring;
        const fx = clamp(x + (Math.cos(a) * ring * minD) / r.width, 0.06, 0.94);
        const fy = clamp(y + (Math.sin(a) * ring * minD) / r.height, 0.1, 0.9);
        if (isFree(fx, fy)) return [fx, fy];
      }
    }
    return [x + (Math.random() - 0.5) * 0.1, y + (Math.random() - 0.5) * 0.1];
  }

  function spawn(id, x, y) {
    const p = freeSpot(x, y);
    const iid = makeOrb(id, p[0], p[1], { enter: true });
    save();
    return iid;
  }

  function select(iid) {
    deselect();
    selectedId = iid;
    orbs.get(iid).el.classList.add('selected');
    trash.classList.add('armed');
    showHint('Sélectionne un second élément à combiner, ou clique la corbeille pour le jeter.');
    hint.classList.remove('hidden');
  }
  function deselect() {
    if (selectedId != null) {
      const o = orbs.get(selectedId);
      if (o) o.el.classList.remove('selected');
    }
    selectedId = null;
    trash.classList.remove('armed');
    showHint('Glisse un élément sur un autre, ou sélectionne-les un à un pour les combiner.');
    if (hasCombined) hint.classList.add('hidden');
  }

  /* ---------- interaction (pointer : clic + drag) ---------- */
  // drag = { iid, startX, startY, ox, oy, moved, fresh }
  // fresh = instance tout juste sortie de la liste (glisser depuis la sidebar).
  let drag = null;
  let rowPending = null;   // { id, startX, startY } : appui sur une ligne de la liste
  let rowDragged = false;  // empêche le « click » qui suit un glisser depuis la liste

  function bindOrb(el, iid) {
    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const o = orbs.get(iid);
      if (!o) return;
      drag = { iid, startX: e.clientX, startY: e.clientY, ox: o.x, oy: o.y, moved: false, fresh: false };
      el.classList.add('dragging');
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClickOrb(iid); }
      else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); trashOrb(iid); }
    });
  }

  function onPointerMove(e) {
    // Glisser depuis la liste : on crée l'instance dès que le pointeur bouge.
    if (rowPending && !drag) {
      if (Math.hypot(e.clientX - rowPending.startX, e.clientY - rowPending.startY) < 6) return;
      const r = canvas.getBoundingClientRect();
      const iid = makeOrb(rowPending.id, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height, { enter: true });
      const o = orbs.get(iid);
      drag = { iid, startX: e.clientX, startY: e.clientY, ox: o.x, oy: o.y, moved: true, fresh: true };
      o.el.classList.add('dragging');
      try { o.el.setPointerCapture(e.pointerId); } catch (err) {}
      rowPending = null; rowDragged = true;
      startDragUi();
    }
    if (!drag) return;
    const dx = e.clientX - drag.startX, dy = e.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) > 6) { drag.moved = true; startDragUi(); }
    if (!drag.moved) return;
    const r = canvas.getBoundingClientRect();
    // position libre (le clamp de setOrbPos garde l'orbe dans le plateau)
    const o = orbs.get(drag.iid);
    o.x = drag.ox + dx / r.width; o.y = drag.oy + dy / r.height;
    o.el.style.left = (o.x * 100) + '%';
    o.el.style.top = (o.y * 100) + '%';
    const overTrash = isOverTrash(e.clientX, e.clientY) || isOverSidebar(e.clientX, e.clientY);
    trash.classList.toggle('hot', overTrash);
    highlightTarget(overTrash ? null : orbAtPoint(e.clientX, e.clientY, drag.iid));
  }

  function onPointerUp(e) {
    rowPending = null;
    // le « click » éventuel suit immédiatement pointerup : on lève le verrou juste après
    if (rowDragged) setTimeout(() => { rowDragged = false; }, 0);
    if (!drag) return;
    const d = drag;
    drag = null;
    endDragUi();
    const o = orbs.get(d.iid);
    if (!o) return;
    o.el.classList.remove('dragging');
    if (!d.moved) { onClickOrb(d.iid); return; }
    setOrbPos(d.iid, o.x, o.y);
    if (isOverTrash(e.clientX, e.clientY) || isOverSidebar(e.clientX, e.clientY)) { trashOrb(d.iid); return; }
    const target = orbAtPoint(e.clientX, e.clientY, d.iid);
    if (target != null) {
      const ok = attemptCombine(d.iid, target);
      if (!ok) {
        // « Rien » : on écarte l'élément pour ne pas le laisser par-dessus l'autre
        if (d.fresh) { const p = freeSpot(o.x, o.y); setOrbPos(d.iid, p[0], p[1]); }
        else setOrbPos(d.iid, d.ox, d.oy);
      }
    }
    save();
  }

  function onPointerCancel() {
    rowPending = null;
    if (!drag) return;
    const o = orbs.get(drag.iid);
    if (o) { o.el.classList.remove('dragging'); setOrbPos(drag.iid, drag.ox, drag.oy); }
    drag = null;
    endDragUi();
  }

  function startDragUi() {
    hint.classList.add('hidden');
    canvas.classList.add('is-dragging');
  }
  function endDragUi() {
    canvas.classList.remove('is-dragging');
    trash.classList.remove('hot');
    highlightTarget(null);
  }

  function highlightTarget(t) {
    orbs.forEach((o, iid) => o.el.classList.toggle('drop-target', iid === t));
  }
  function orbAtPoint(x, y, excludeIid) {
    let best = null, bestD = Infinity;
    for (const [iid, o] of orbs) {
      if (iid === excludeIid) continue;
      const r = o.el.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
        const dd = Math.hypot(x - (r.left + r.width / 2), y - (r.top + r.height / 2));
        if (dd < bestD) { bestD = dd; best = iid; }
      }
    }
    return best;
  }
  function isOverTrash(x, y) {
    const r = trash.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }

  function isOverSidebar(x, y) {
    if (sidebar.classList.contains('collapsed') || (isMobile() && !sidebar.classList.contains('open'))) return false;
    const r = sidebar.getBoundingClientRect();
    return r.width > 0 && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }

  function onClickOrb(iid) {
    if (selectedId == null) { select(iid); return; }
    if (selectedId === iid) { deselect(); return; }
    const a = selectedId;
    deselect();
    attemptCombine(a, iid);
    save();
  }

  /* ---------- corbeille ---------- */
  function trashOrb(iid) {
    const o = orbs.get(iid);
    if (!o) return;
    const r = o.el.getBoundingClientRect();
    puff(r.left + r.width / 2, r.top + r.height / 2, '🗑️', '#fff');
    removeOrb(iid);
    trash.classList.remove('bump'); void trash.offsetWidth; trash.classList.add('bump');
    save();
  }

  function onTrashClick() {
    if (selectedId != null) { trashOrb(selectedId); return; }
    if (orbs.size === 0) { showToast('Le plateau est déjà vide.'); return; }
    if (!confirm('Vider tout le plateau ? Tes découvertes restent dans la liste.')) return;
    Array.from(orbs.keys()).forEach(removeOrb);
    save();
    showToast('Plateau vidé.');
  }

  /* ---------- logique de combinaison ---------- */
  // Combine deux instances. Renvoie true si un élément s'est formé
  // (les deux ingrédients disparaissent et laissent place au résultat).
  function attemptCombine(a, b) {
    const oa = orbs.get(a), ob = orbs.get(b);
    if (!oa || !ob) return false;
    const rb = ob.el.getBoundingClientRect();
    const cx = rb.left + rb.width / 2, cy = rb.top + rb.height / 2;
    const res = combineResult(oa.id, ob.id);
    hasCombined = true;
    hint.classList.add('hidden');
    if (res === 0) { nothingAt(cx, cy); return false; }
    const x = ob.x, y = ob.y;
    removeOrb(a);
    removeOrb(b);
    const iid = makeOrb(res, x, y, { enter: true });
    const first = discover(res);
    if (first) { orbs.get(iid).el.classList.add('first'); celebrate(res, cx, cy); }
    else spawnParticles(cx, cy, hueOf(res), 10);
    return true;
  }

  function discover(id) {
    if (discoveredSet.has(id)) return false;
    discovered.push(id);
    discoveredSet.add(id);
    sessionNew.add(id);
    updateStats();
    renderSideList();
    return true;
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
      row.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 || e.pointerType === 'touch') return; // tactile : la liste défile
        rowDragged = false;
        rowPending = { id, startX: e.clientX, startY: e.clientY };
      });
      row.onclick = () => {
        if (rowDragged) { rowDragged = false; return; }
        spawn(id, 0.5, 0.5);
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
    const list = [];
    orbs.forEach((o) => list.push({ id: o.id, x: o.x, y: o.y }));
    try { localStorage.setItem(SAVE_KEY, JSON.stringify({ discovered, orbs: list })); } catch (e) {}
  }

  const validIds = (arr) => Array.isArray(arr) && arr.length >= 4 &&
    arr.every((id) => Number.isInteger(id) && id > 0 && id < N);

  function placeBase() {
    for (const id of BASE) makeOrb(id, BASE_POS[id][0], BASE_POS[id][1], { enter: true });
  }

  function loadSave() {
    let d = null, old = null;
    try { d = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) {}
    if (!d) { try { old = JSON.parse(localStorage.getItem(OLD_SAVE_KEY)); } catch (e) {} }
    if (d && validIds(d.discovered)) {
      discovered = d.discovered;
      discovered.forEach((id) => discoveredSet.add(id));
      if (Array.isArray(d.orbs)) d.orbs.forEach((o) => {
        if (o && discoveredSet.has(o.id)) makeOrb(o.id, +o.x || 0.5, +o.y || 0.5, {});
      });
    } else if (old && validIds(old.discovered)) {
      // Ancienne sauvegarde (v1) : toutes les découvertes étaient posées sur le
      // plateau, souvent empilées. On garde les découvertes, plateau propre.
      discovered = old.discovered;
      discovered.forEach((id) => discoveredSet.add(id));
      placeBase();
      save();
      try { localStorage.removeItem(OLD_SAVE_KEY); } catch (e) {}
    } else {
      discovered = BASE.slice();
      discovered.forEach((id) => discoveredSet.add(id));
      placeBase();
    }
    updateStats();
    renderSideList();
  }

  function resetGame() {
    if (!confirm('Réinitialiser toutes tes découvertes ? Cette action est irréversible.')) return;
    try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
    deselect();
    discoveredSet.clear(); sessionNew.clear();
    orbs.forEach((o) => o.el.remove());
    orbs.clear();
    discovered = BASE.slice();
    discovered.forEach((id) => discoveredSet.add(id));
    placeBase();
    updateStats();
    renderSideList();
    showToast('Partie réinitialisée.');
  }

  /* ---------- init ---------- */
  resetBtn.addEventListener('click', resetGame);
  trash.addEventListener('click', onTrashClick);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerCancel);
  canvas.addEventListener('pointerdown', (e) => { if (e.target === canvas) deselect(); });
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
