// Map Material Symbol names → Bootstrap Icons. Existing markup stays
// untouched; this module converts each `.material-symbols-rounded` span
// to a `<i class="bi bi-X">` glyph at boot, watches the DOM for new
// ones, and exposes `setIcon` for dynamic swaps (battery, play/pause,
// theme toggle).

const ICON_MAP = {
  folder: 'folder-fill',
  folder_open: 'folder2-open',
  arrow_back_ios: 'chevron-left',
  arrow_forward_ios: 'chevron-right',
  chevron_left: 'chevron-left',
  chevron_right: 'chevron-right',
  grid_view: 'grid-fill',
  format_list_bulleted: 'list-ul',
  ios_share: 'box-arrow-up',
  chat_bubble: 'chat-fill',
  mail: 'envelope-fill',
  open_in_new: 'box-arrow-up-right',
  check: 'check-lg',
  wifi: 'wifi',
  dark_mode: 'moon-stars-fill',
  light_mode: 'sun-fill',
  fullscreen: 'arrows-fullscreen',
  fullscreen_exit: 'fullscreen-exit',
  battery_full: 'battery-full',
  battery_5_bar: 'battery-full',
  battery_2_bar: 'battery-half',
  battery_0_bar: 'battery',
  battery_charging_full: 'battery-charging',
  play_circle: 'play-circle-fill',
  pause_circle: 'pause-circle-fill',
  movie: 'film',
  image: 'image',
  menu_book: 'book-fill',
  auto_stories: 'book',
  new_releases: 'stars',
  close: 'x-lg',
};

function biClass(name) {
  return ICON_MAP[name] || name.replace(/_/g, '-');
}

function stripIconClasses(el) {
  for (const c of [...el.classList]) {
    if (c.startsWith('bi-') || c === 'material-symbols-rounded' || c === 'material-symbols-outlined') {
      el.classList.remove(c);
    }
  }
}

function convertEl(el) {
  const name = (el.textContent || '').trim();
  stripIconClasses(el);
  el.classList.add('bi');
  if (name) el.classList.add('bi-' + biClass(name));
  el.textContent = '';
}

export function setIcon(el, name) {
  if (!el) return;
  stripIconClasses(el);
  el.classList.add('bi', 'bi-' + biClass(name));
  el.textContent = '';
}

function convertAll(root) {
  root.querySelectorAll('.material-symbols-rounded, .material-symbols-outlined').forEach(convertEl);
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => convertAll(document));
  } else {
    convertAll(document);
  }
  new MutationObserver((muts) => {
    for (const m of muts) {
      for (const n of m.addedNodes) {
        if (n.nodeType !== 1) continue;
        if (n.classList?.contains('material-symbols-rounded') ||
            n.classList?.contains('material-symbols-outlined')) {
          convertEl(n);
        }
        n.querySelectorAll?.('.material-symbols-rounded, .material-symbols-outlined').forEach(convertEl);
      }
    }
  }).observe(document.documentElement, { childList: true, subtree: true });
}
