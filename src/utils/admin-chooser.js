// Hidden admin chooser.
//
// Desktop: Cmd/Ctrl + Shift + A → opens a small floating chooser with
//           links to all admin pages.
// Mobile:  triple-tap on the iOS status-bar clock → same chooser.
//
// All three admin URLs (/admin, /admin-pins, /admin-frames) are gated by
// Cloudflare Zero Trust on the dashboard side — this module only makes
// the entry point discoverable to whoever knows the gesture.

const ADMIN_LINKS = [
  { href: '/admin',         label: 'Status / Vibe', icon: '✍️' },
  { href: '/admin-pins',    label: 'Pinboard Mod',  icon: '📌' },
  { href: '/admin-frames',  label: 'Frame Approval',icon: '🎞️' },
];

function buildChooser() {
  // Remove existing if any
  document.getElementById('admin-chooser')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'admin-chooser';
  overlay.setAttribute('role', 'dialog');
  overlay.style.cssText = `
    position: fixed; inset: 0; z-index: 9999;
    background: rgba(0,0,0,0.45);
    display: flex; align-items: center; justify-content: center;
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
  `;

  const card = document.createElement('div');
  card.style.cssText = `
    width: 280px; max-width: calc(100vw - 32px);
    background: #0b0b0d; color: #fff;
    border-radius: 16px;
    padding: 18px 16px 14px;
    box-shadow: 0 20px 50px rgba(0,0,0,0.5);
    font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
  `;
  card.innerHTML = `
    <div style="font-size:10px; font-weight:700; letter-spacing:0.18em;
                text-transform:uppercase; color:rgba(255,255,255,0.5);
                text-align:center; margin-bottom:12px;">Admin</div>
    <div style="display:flex; flex-direction:column; gap:6px;">
      ${ADMIN_LINKS.map((l) => `
        <a href="${l.href}"
           style="display:flex; align-items:center; gap:10px;
                  padding:10px 12px; border-radius:10px;
                  background:rgba(255,255,255,0.06);
                  color:#fff; text-decoration:none;
                  font-size:13px; font-weight:600;">
          <span style="font-size:18px; width:22px; text-align:center;">${l.icon}</span>
          <span>${l.label}</span>
        </a>
      `).join('')}
    </div>
    <button id="admin-chooser-cancel"
            style="margin-top:10px; width:100%; padding:8px;
                   background:transparent; color:rgba(255,255,255,0.55);
                   border:none; cursor:pointer; font-size:11px;
                   font-family:inherit;">Esc to close</button>
  `;

  overlay.appendChild(card);
  document.body.appendChild(overlay);

  const close = () => {
    overlay.remove();
    document.removeEventListener('keydown', onEsc);
  };
  const onEsc = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onEsc);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  card.querySelector('#admin-chooser-cancel').addEventListener('click', close);
}

// ── Desktop trigger: Cmd/Ctrl + Shift + A ──
window.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'a') {
    e.preventDefault();
    buildChooser();
  }
});

// ── iOS trigger: triple-tap on the status-bar clock ──
let tapCount = 0;
let tapTimer = null;
document.addEventListener('click', (e) => {
  const target = e.target.closest && e.target.closest('#ios-clock');
  if (!target) return;
  tapCount++;
  clearTimeout(tapTimer);
  tapTimer = setTimeout(() => { tapCount = 0; }, 700);
  if (tapCount >= 3) {
    tapCount = 0;
    buildChooser();
  }
});
