// Share helper: native share-sheet on mobile, clipboard + toast on desktop.

let toastEl = null;
function showToast(msg) {
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.style.cssText = `
      position:fixed; left:50%; bottom:96px; transform:translateX(-50%);
      background:rgba(20,20,20,0.92); color:white; padding:10px 18px;
      border-radius:999px; font-size:13px; font-weight:500;
      box-shadow:0 6px 28px rgba(0,0,0,0.32); backdrop-filter:blur(20px);
      z-index:9999; opacity:0; transition:opacity 200ms ease;
      pointer-events:none; letter-spacing:0.01em;
    `;
    document.body.appendChild(toastEl);
  }
  toastEl.textContent = msg;
  requestAnimationFrame(() => { toastEl.style.opacity = '1'; });
  clearTimeout(toastEl._t);
  toastEl._t = setTimeout(() => { toastEl.style.opacity = '0'; }, 1800);
}

export async function shareLink({ url } = {}) {
  const u = url || location.href;
  if (navigator.share) {
    try {
      // URL only — let the receiving app pull title / image from the
      // prerendered page's OG meta. Passing title/text causes platforms
      // like WhatsApp + iMessage to prefix the link with the site name
      // ("Shouli — …"), which the user doesn't want.
      await navigator.share({ url: u });
      return;
    } catch (e) {
      if (e && e.name === 'AbortError') return;
      // fall through to clipboard
    }
  }
  try {
    await navigator.clipboard.writeText(u);
    showToast('Link kopiert');
  } catch (e) {
    showToast(u);
  }
}

export function makeShareButton({ size = 22, title = 'Teilen', getUrl, getTitle, classes = '' } = {}) {
  const btn = document.createElement('button');
  btn.className = `share-btn ${classes}`.trim();
  btn.title = title;
  btn.setAttribute('aria-label', title);
  btn.style.cssText = `
    width:${size + 14}px; height:${size + 14}px; display:inline-flex;
    align-items:center; justify-content:center; border-radius:999px;
    background:transparent; border:none; cursor:pointer;
    color:inherit; transition:background-color 120ms ease, transform 120ms ease;
  `;
  btn.innerHTML = `<span class="material-symbols-outlined" style="font-size:${size}px;">ios_share</span>`;
  btn.addEventListener('mouseenter', () => { btn.style.backgroundColor = 'rgba(127,127,127,0.18)'; });
  btn.addEventListener('mouseleave', () => { btn.style.backgroundColor = 'transparent'; });
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    shareLink({
      url: typeof getUrl === 'function' ? getUrl() : undefined,
      title: typeof getTitle === 'function' ? getTitle() : undefined,
    });
  });
  return btn;
}
