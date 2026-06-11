// Passport — renders all 24 stamps grouped by kind, with locked /
// earned states. Listens for journal:stamps-changed and repaints in
// place when something new is awarded.

import {
  STAMPS,
  STAMPS_CHANGED_EVENT,
  getEarnedSet,
} from './journal-stamps.js';
import { stampSVG } from './journal-stamp-svg.js';
import {
  getStoredCode,
  createCode,
  restoreCode,
  clearStoredCode,
} from './journal-passport-code.js';

const KIND_LABEL = {
  travel: 'Travel',
  skill:  'Skill',
  secret: 'Secret',
};

export function renderPassport(host) {
  paint(host);
  // Repaint on stamp changes. Replace any previous handler so reopens
  // don't stack listeners.
  if (host.__passportHandler) {
    window.removeEventListener(STAMPS_CHANGED_EVENT, host.__passportHandler);
  }
  const handler = () => paint(host);
  host.__passportHandler = handler;
  window.addEventListener(STAMPS_CHANGED_EVENT, handler);
}

function paint(host) {
  const earned = getEarnedSet();
  const totalEarned = STAMPS.filter((s) => earned.has(s.id)).length;
  const total = STAMPS.length;
  const pct = Math.round((totalEarned / total) * 100);

  const groups = {
    travel: STAMPS.filter((s) => s.kind === 'travel'),
    skill:  STAMPS.filter((s) => s.kind === 'skill'),
    secret: STAMPS.filter((s) => s.kind === 'secret'),
  };

  host.innerHTML = `
    <div class="passport">
      <div class="passport-summary">
        <div class="passport-summary-title">Passport</div>
        <div class="passport-summary-count"><strong>${totalEarned}</strong> / ${total}</div>
      </div>
      <div class="passport-bar">
        <div class="passport-bar-fill" style="width:${pct}%"></div>
      </div>
      ${renderSyncBlock()}
      ${['travel', 'skill', 'secret']
        .map((k) => renderGroup(k, groups[k], earned))
        .join('')}
    </div>
  `;
  wireSyncBlock(host);
}

// ── sync controls (Passport Code) ────────────────────────────────

function renderSyncBlock() {
  const code = getStoredCode();
  if (code) {
    return `
      <div class="passport-sync passport-sync--has-code">
        <div class="passport-sync-row">
          <div>
            <div class="passport-sync-eyebrow">Sync Code</div>
            <div class="passport-sync-code" data-passport-code-display>${escapeHtml(code)}</div>
          </div>
          <button class="passport-sync-action" data-passport-copy>Copy</button>
        </div>
        <div class="passport-sync-hint">
          Use this on another device to pull in your progress. Auto-syncs every few seconds.
        </div>
      </div>
    `;
  }
  return `
    <div class="passport-sync">
      <div class="passport-sync-eyebrow">Save across devices</div>
      <div class="passport-sync-row">
        <button class="passport-sync-action" data-passport-create>Generate code</button>
        <button class="passport-sync-action passport-sync-action--secondary" data-passport-restore>I have a code</button>
      </div>
      <div class="passport-sync-form" data-passport-restore-form hidden>
        <input type="text" class="passport-sync-input"
               data-passport-restore-input
               placeholder="ABC-DEF" maxlength="7"
               autocomplete="off" autocapitalize="characters" spellcheck="false" />
        <button class="passport-sync-action" data-passport-restore-submit>Restore</button>
      </div>
      <div class="passport-sync-status" data-passport-status></div>
    </div>
  `;
}

function wireSyncBlock(host) {
  const status = host.querySelector('[data-passport-status]');
  const setStatus = (msg, ok = false) => {
    if (!status) return;
    status.textContent = msg;
    status.style.color = ok ? 'rgb(34,197,94)' : 'rgb(239,68,68)';
  };

  host.querySelector('[data-passport-copy]')?.addEventListener('click', async () => {
    const code = getStoredCode();
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      const el = host.querySelector('[data-passport-code-display]');
      if (el) {
        const orig = el.textContent;
        el.textContent = 'Copied';
        setTimeout(() => { el.textContent = orig; }, 1200);
      }
    } catch {}
  });

  host.querySelector('[data-passport-create]')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    setStatus('Saving…', true);
    const code = await createCode();
    if (code) paint(host);
    else { setStatus('Could not save. Try again.'); btn.disabled = false; }
  });

  host.querySelector('[data-passport-restore]')?.addEventListener('click', () => {
    const form = host.querySelector('[data-passport-restore-form]');
    if (form) {
      form.hidden = !form.hidden;
      if (!form.hidden) host.querySelector('[data-passport-restore-input]')?.focus();
    }
  });

  host.querySelector('[data-passport-restore-submit]')?.addEventListener('click', async (e) => {
    const input = host.querySelector('[data-passport-restore-input]');
    const raw = input?.value || '';
    if (!raw.trim()) return;
    e.currentTarget.disabled = true;
    setStatus('Looking up…', true);
    const result = await restoreCode(raw);
    if (result.ok) {
      setStatus(`Restored ${result.restored} keys — reloading…`, true);
      setTimeout(() => location.reload(), 700);
    } else {
      setStatus(result.error === 'not-found' ? 'Code not found.' : 'Invalid code.');
      e.currentTarget.disabled = false;
    }
  });
}

function renderGroup(kind, stamps, earned) {
  const earnedInGroup = stamps.filter((s) => earned.has(s.id)).length;
  return `
    <div class="passport-group">
      <div class="passport-group-head">
        <span class="passport-group-label">${KIND_LABEL[kind]}</span>
        <span class="passport-group-count">${earnedInGroup} / ${stamps.length}</span>
      </div>
      <div class="passport-grid">
        ${stamps.map((s) => renderStamp(s, earned.has(s.id))).join('')}
      </div>
    </div>
  `;
}

function renderStamp(stamp, isEarned) {
  // Hide details of unearned secret stamps so they stay easter-eggy.
  const isSecretHidden = stamp.kind === 'secret' && !isEarned;
  const label = isSecretHidden ? '???' : stamp.label;
  const sub = isSecretHidden ? 'Something to find' : stamp.sub || '';
  const art = isSecretHidden
    ? `<div class="passport-stamp-mystery">?</div>`
    : stampSVG({ label: stamp.label, icon: stamp.icon, kind: stamp.kind, earned: isEarned });
  return `
    <div class="passport-stamp ${isEarned ? 'is-earned' : 'is-locked'}">
      <div class="passport-stamp-art">${art}</div>
      <div class="passport-stamp-label">${escapeHtml(label)}</div>
      <div class="passport-stamp-sub">${escapeHtml(sub)}</div>
    </div>
  `;
}

// Inline summary chip used in the Today tab — single line: progress bar
// + "12 / 24 stamps". Click to navigate to Passport section.
export function renderPassportPreview(host, onClickNav) {
  const earned = getEarnedSet();
  const total = STAMPS.length;
  const got = STAMPS.filter((s) => earned.has(s.id)).length;
  const pct = Math.round((got / total) * 100);

  host.innerHTML = `
    <div class="passport-preview" role="button" tabindex="0">
      <div class="passport-preview-row">
        <span class="passport-preview-label">Passport</span>
        <span class="passport-preview-count">${got} / ${total}</span>
      </div>
      <div class="passport-bar">
        <div class="passport-bar-fill" style="width:${pct}%"></div>
      </div>
    </div>
  `;
  const node = host.querySelector('.passport-preview');
  if (node && typeof onClickNav === 'function') {
    node.addEventListener('click', onClickNav);
  }
  // Repaint on changes
  if (host.__passportPrevHandler) {
    window.removeEventListener(STAMPS_CHANGED_EVENT, host.__passportPrevHandler);
  }
  const handler = () => renderPassportPreview(host, onClickNav);
  host.__passportPrevHandler = handler;
  window.addEventListener(STAMPS_CHANGED_EVENT, handler);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c] || c));
}
