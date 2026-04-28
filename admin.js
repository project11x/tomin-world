// @ts-check
// Admin Cloud Status Panel
// Standalone page at /admin.html — protected by Cloudflare Access.
// No passcode logic: if you can load this page, you are authenticated.

/**
 * @typedef {Object} StatusFile
 * @property {{ title: string, note: string, statusDetail: string }} rightNow
 * @property {{ title: string }} vibe
 * @property {string} workingOn
 * @property {string[]} availableDoing
 * @property {string[]} availableVibes
 */

/** @type {StatusFile | null} */
let loadedStatus = null;
let selectedDoing = '';
let selectedVibe = '';

const DEFAULT_DOING = ['🎬 Pre-Production', '🎥 Shooting', '✂️ Post', '✅ Published'];
const DEFAULT_VIBES = ['hyperfocus', 'referencing', 'stuck', 'shipping'];

/** @returns {HTMLInputElement} */
function $input(id) {
  const el = document.getElementById(id);
  if (!(el instanceof HTMLInputElement)) throw new Error(`#${id} is not an <input>`);
  return el;
}
/** @returns {HTMLButtonElement} */
function $button(id) {
  const el = document.getElementById(id);
  if (!(el instanceof HTMLButtonElement)) throw new Error(`#${id} is not a <button>`);
  return el;
}

/**
 * @param {string} containerId
 * @param {string[]} list
 * @param {string} activeVal
 */
function renderAdminChips(containerId, list, activeVal) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const safeList = Array.isArray(list) ? list : [];
  container.innerHTML = '';

  safeList.forEach((item) => {
    const chip = document.createElement('div');
    chip.className = 'admin-chip' + (item === activeVal ? ' active' : '');
    chip.textContent = item;
    chip.addEventListener('click', () => selectChip(containerId, item));
    container.appendChild(chip);
  });

  const addBtn = document.createElement('div');
  addBtn.className = 'admin-chip-add';
  addBtn.textContent = '+ New';
  addBtn.addEventListener('click', () => addChip(containerId));
  container.appendChild(addBtn);
}

function selectChip(containerId, val) {
  if (containerId === 'adm-doing-chips') selectedDoing = val;
  else selectedVibe = val;
  const list =
    containerId === 'adm-doing-chips'
      ? loadedStatus?.availableDoing || DEFAULT_DOING
      : loadedStatus?.availableVibes || DEFAULT_VIBES;
  renderAdminChips(containerId, list, val);
}

/** @returns {StatusFile} */
function emptyStatus() {
  return {
    rightNow: { title: '', note: '', statusDetail: '' },
    vibe: { title: '' },
    workingOn: '',
    availableDoing: [...DEFAULT_DOING],
    availableVibes: [...DEFAULT_VIBES],
  };
}

/** @param {string} containerId */
function addChip(containerId) {
  const val = prompt('Enter new tag name:');
  if (!val) return;

  if (!loadedStatus) loadedStatus = emptyStatus();

  if (containerId === 'adm-doing-chips') {
    if (!loadedStatus.availableDoing.includes(val)) loadedStatus.availableDoing.push(val);
    selectedDoing = val;
    renderAdminChips(containerId, loadedStatus.availableDoing, selectedDoing);
  } else {
    if (!loadedStatus.availableVibes.includes(val)) loadedStatus.availableVibes.push(val);
    selectedVibe = val;
    renderAdminChips(containerId, loadedStatus.availableVibes, selectedVibe);
  }
}

async function adminSave() {
  const btn = $button('adm-save-btn');
  const status = document.getElementById('adm-status');
  if (!status) return;

  btn.disabled = true;
  btn.textContent = 'Pushing...';
  status.textContent = 'Pushing to /api/status…';
  status.style.color = '#fff';

  const newStatus = {
    rightNow: {
      title: selectedDoing,
      note: $input('adm-rn-note').value,
      statusDetail: $input('adm-rn-detail').value,
    },
    vibe: { title: selectedVibe },
    workingOn: $input('adm-working-on').value,
    availableDoing: loadedStatus?.availableDoing || DEFAULT_DOING,
    availableVibes: loadedStatus?.availableVibes || DEFAULT_VIBES,
  };

  try {
    // Hits the Pages Function at /api/status. The function holds the GitHub
    // PAT as a server-side secret; the browser only forwards the Cloudflare
    // Access cookie, never a token of its own.
    const resp = await fetch('/api/status', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newStatus),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || `Push failed (${resp.status})`);
    }
    status.textContent = '✅ Success! Site will update shortly.';
    status.style.color = '#30d158';
  } catch (/** @type {any} */ e) {
    status.textContent = 'Error: ' + (e?.message ?? String(e));
    status.style.color = '#ff453a';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Push to Cloud';
  }
}

function init() {
  $button('adm-save-btn').addEventListener('click', adminSave);

  renderAdminChips('adm-doing-chips', DEFAULT_DOING, '');
  renderAdminChips('adm-vibe-chips', DEFAULT_VIBES, '');

  fetch('status.json')
    .then((r) => r.json())
    .then(/** @param {StatusFile} d */ (d) => {
      loadedStatus = d;
      $input('adm-rn-note').value = d.rightNow?.note || '';
      $input('adm-rn-detail').value = d.rightNow?.statusDetail || '';
      $input('adm-working-on').value = d.workingOn || '';

      selectedDoing = d.rightNow?.title || '';
      selectedVibe = d.vibe?.title || '';

      renderAdminChips('adm-doing-chips', d.availableDoing || DEFAULT_DOING, selectedDoing);
      renderAdminChips('adm-vibe-chips', d.availableVibes || DEFAULT_VIBES, selectedVibe);
    })
    .catch((e) => {
      console.error('Failed to load status.json', e);
    });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
