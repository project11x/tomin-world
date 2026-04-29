// Cloudflare Pages Function — live portfolio listing.
// Path: /api/portfolio (GET)
//
// Why this exists:
//   The baked `data.js` is generated at build time by `sync.cjs` from the
//   local filesystem mirror. To pick up a new file uploaded straight to
//   the R2 bucket, the build had to be re-run. This function lists the
//   bucket on demand and returns the same shape as `portfolioData`, so
//   the frontend can fetch it after boot and merge new folders / files
//   without redeploying. Cached 5 min on Cloudflare's edge.
//
// Required Pages binding (Settings → Functions → R2 bucket bindings):
//   PORTFOLIO_BUCKET → the bucket holding the portfolio (the same one
//                      backing pub-859f13be44eb4577b0cb23c8d8440a59.r2.dev).
//
// Response shape (matches data.js exactly):
//   {
//     "5am in munich": [ { name, type, size, date, src, isVideo }, … ],
//     "TOMIN INDEX.TXT": [ { name: "magazineA", isMagazine:true, … }, … ],
//     "TOMIN INDEX.TXT/magazineA": [ { name: "page1.jpg", … }, … ],
//     …
//   }
//
// Notes:
//   • `src` is the encoded relative path; the frontend prepends the R2
//     base URL the same way it does for baked items.
//   • Folders matching EXCLUDED_FOLDERS are skipped so build artefacts
//     uploaded by accident don't surface in the Finder.
//   • Errors fall through silently — the frontend keeps using baked data.

const EXCLUDED_FOLDERS = new Set([
  'node_modules', 'dist', 'public', 'src', 'tests', 'test-results',
  'functions', 'icons', 'playwright-report', '.git', '.github', '.vite',
]);

const VIDEO_EXTS = new Set(['.mp4', '.mov', '.webm', '.mkv']);
const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.heic']);

function extOf(name) {
  const i = name.lastIndexOf('.');
  return i === -1 ? '' : name.slice(i).toLowerCase();
}

function fileType(name) {
  const ext = extOf(name);
  if (VIDEO_EXTS.has(ext)) return ext === '.mov' ? 'QuickTime Movie' : 'Video';
  if (IMAGE_EXTS.has(ext)) return 'Image';
  if (ext === '.txt') return 'Text Document';
  if (ext === '.pdf') return 'PDF Document';
  if (ext === '.mp3' || ext === '.wav') return 'Audio';
  return 'File';
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatDate(d) {
  if (!d) return '';
  const date = d instanceof Date ? d : new Date(d);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function encodePath(p) {
  return p.split('/').map(encodeURIComponent).join('/');
}

function makeFileEntry(name, obj, srcKey) {
  return {
    name,
    type: fileType(name),
    size: formatBytes(obj.size),
    date: formatDate(obj.uploaded),
    src: encodePath(srcKey),
    isVideo: VIDEO_EXTS.has(extOf(name)),
  };
}

export async function onRequestGet({ env }) {
  const bucket = env.PORTFOLIO_BUCKET;
  if (!bucket) {
    return jsonResponse({ error: 'PORTFOLIO_BUCKET binding missing' }, 500);
  }

  // Page through every object in the bucket. R2 caps at 1000/list.
  const all = [];
  let cursor;
  try {
    let truncated = true;
    while (truncated) {
      const result = await bucket.list({ limit: 1000, cursor });
      all.push(...result.objects);
      truncated = result.truncated;
      cursor = truncated ? result.cursor : undefined;
    }
  } catch (e) {
    return jsonResponse({ error: 'r2 list failed', detail: String(e) }, 502);
  }

  const portfolioData = {};
  // Track which video keys have a `_web` companion so we can prefer that
  // for playback, mirroring the build-time sync.cjs behaviour.
  const folderFiles = new Map();
  for (const obj of all) {
    const parts = obj.key.split('/');
    if (parts.length < 2) continue;            // skip bucket-root files
    const folder = parts[0];
    if (EXCLUDED_FOLDERS.has(folder)) continue;
    if (!folderFiles.has(folder)) folderFiles.set(folder, new Set());
    folderFiles.get(folder).add(parts.slice(1).join('/'));
  }

  for (const obj of all) {
    const parts = obj.key.split('/');
    if (parts.length < 2) continue;
    const folder = parts[0];
    if (EXCLUDED_FOLDERS.has(folder)) continue;

    // Magazines: TOMIN INDEX.TXT/<mag>/<page>
    if (folder === 'TOMIN INDEX.TXT') {
      if (parts.length < 3) continue;          // need /mag/page
      const mag = parts[1];
      const pageName = parts.slice(2).join('/');
      if (pageName.startsWith('.')) continue;

      portfolioData[folder] = portfolioData[folder] || [];
      if (!portfolioData[folder].some((m) => m.name === mag)) {
        portfolioData[folder].push({
          name: mag,
          type: 'Magazine',
          size: '--',
          date: formatDate(obj.uploaded),
          src: '',
          isVideo: false,
          isMagazine: true,
        });
      }
      const magKey = `${folder}/${mag}`;
      portfolioData[magKey] = portfolioData[magKey] || [];
      portfolioData[magKey].push(makeFileEntry(pageName, obj, obj.key));
      continue;
    }

    // Regular folders. Skip _web / _compressed companions; we'll surface
    // them via the original file's `src` swap below.
    const fileName = parts.slice(1).join('/');
    if (fileName.startsWith('.')) continue;
    if (/_(web|compressed)\.[^.]+$/.test(fileName)) continue;

    let srcKey = obj.key;
    // For videos, prefer the _web companion for playback when present.
    const ext = extOf(fileName);
    if (VIDEO_EXTS.has(ext)) {
      const base = fileName.slice(0, -ext.length);
      const webName = `${base}_web${ext}`;
      if (folderFiles.get(folder)?.has(webName)) {
        srcKey = `${folder}/${webName}`;
      }
    }

    portfolioData[folder] = portfolioData[folder] || [];
    portfolioData[folder].push(makeFileEntry(fileName, obj, srcKey));
  }

  // Sort each folder: videos first, then alphabetical.
  for (const key of Object.keys(portfolioData)) {
    portfolioData[key].sort((a, b) => {
      if (a.isVideo && !b.isVideo) return -1;
      if (!a.isVideo && b.isVideo) return 1;
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
    });
  }

  return jsonResponse(portfolioData, 200, {
    // Hot-cache 5 min on the edge; allow stale serving for an extra hour
    // while we revalidate in the background. Browsers see fresh-or-stale
    // data within ~5 min of an upload without ever blocking on the list.
    'cache-control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=3600',
  });
}

function jsonResponse(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...extraHeaders,
    },
  });
}
