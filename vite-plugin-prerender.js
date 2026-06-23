// Vite plugin: emits a per-project HTML file at /projects/<slug>/index.html
// for every top-level folder in data.js. Each copy has project-specific
// <title>, og:title, og:description and og:image so social-platform link
// previews (WhatsApp, iMessage, Twitter) render the right artwork instead
// of the generic site screenshot. Identical app payload — the SPA boots
// and the router resolves the URL.

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const slugify = (s) =>
  String(s).toLowerCase().normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

import { MEDIA_BASE as R2_BASE } from './src/utils/media.js';

function loadAllData() {
  const src = readFileSync(resolve(__dirname, 'data.js'), 'utf8');
  const start = src.indexOf('export const portfolioData =');
  const open = src.indexOf('{', start);
  let depth = 0, end = -1;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  return JSON.parse(end > 0 ? src.slice(open, end) : '{}');
}

function loadFolders() {
  const data = loadAllData();
  const folders = {};
  Object.keys(data).forEach((k) => { if (!k.includes('/')) folders[k] = data[k]; });
  return folders;
}

function pickCover(items, allData) {
  for (const it of items) {
    if (it.isVideo) continue;
    if (it.isMagazine) {
      const mk = items.__folder + '/' + it.name;
      const pages = allData[mk];
      if (pages) {
        const cover = pages.find((p) => !p.isVideo && p.src);
        if (cover) return cover.src;
      }
      continue;
    }
    if (it.src) return it.src;
  }
  return null;
}

function rewriteMeta(html, { title, description, image, url }) {
  const escAttr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const t = escAttr(title), d = escAttr(description), i = escAttr(image), u = escAttr(url);

  const setMeta = (selectorPart, val) => {
    const sel = selectorPart.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Permit newline between attributes; [^>] matches newlines in JS by default but be explicit.
    const re1 = new RegExp(`(<meta[\\s\\S]*?${sel}[\\s\\S]*?content=")[^"]*(")`, 'i');
    const re2 = new RegExp(`(<meta[\\s\\S]*?content=")[^"]*("[\\s\\S]*?${sel})`, 'i');
    if (re1.test(html)) html = html.replace(re1, `$1${val}$2`);
    else if (re2.test(html)) html = html.replace(re2, `$1${val}$2`);
  };

  // Skip the inline JS document.write '<title>' — only replace the real outer <title> tag if any.
  // Page builds with the title coming from the inline script, so we ALSO inject a fallback.
  html = html.replace(/<\/head>/i, `<title>${t}</title>\n</head>`);

  setMeta('property="og:title"', t);
  setMeta('property="og:description"', d);
  setMeta('property="og:image"', i);
  setMeta('property="og:url"', u);
  setMeta('name="twitter:title"', t);
  setMeta('name="twitter:description"', d);
  setMeta('name="twitter:image"', i);
  setMeta('name="description"', d);

  html = html.replace(/<link[^>]*rel="canonical"[^>]*>/i, `<link rel="canonical" href="${u}" />`);
  return html;
}

export default function prerenderProjects() {
  let outDir = 'dist';

  return {
    name: 'tomin-prerender-projects',
    apply: 'build',
    configResolved(cfg) { outDir = cfg.build.outDir || 'dist'; },
    closeBundle() {
      const indexPath = resolve(__dirname, outDir, 'index.html');
      let mainHtml;
      try { mainHtml = readFileSync(indexPath, 'utf8'); }
      catch (e) { console.warn('[prerender] no built index.html found, skipping'); return; }

      const allData = loadAllData();
      const data = loadFolders();

      let count = 0;
      Object.keys(data).forEach((folder) => {
        const slug = slugify(folder);
        const items = data[folder];
        items.__folder = folder;
        const cover = pickCover(items, allData);
        const image = cover ? (cover.startsWith('http') ? cover : R2_BASE + cover) : 'https://shouli.de/screen.png';
        const description = `${folder} — ${items.length} ${items.length === 1 ? 'item' : 'items'}. Shouli's creative portfolio.`;
        const title = `${folder} — Shouli`;
        const url = `https://shouli.de/projects/${slug}`;

        const html = rewriteMeta(mainHtml, { title, description, image, url });
        const dir = resolve(__dirname, outDir, 'projects', slug);
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, 'index.html'), html);
        count++;
      });
      console.log(`[prerender] emitted ${count} project pages`);
    },
  };
}
