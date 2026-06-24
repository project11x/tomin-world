// migrate-game-assets-to-r2.cjs
//
// One-shot migration to move the journal game-asset binaries off the
// local public/ folder and onto R2.
//
// Before:
//   public/frames/<Edit>/<id>.jpg   (bundled into dist/, deployed each time)
//   public/clips/<Edit>/<id>.mp4    (same)
//   frames-pool.json paths:         "frames/<Edit>/<id>.jpg"
//                                    "clips/<Edit>/<id>.mp4"
//
// After:
//   R2: tomin-media/game/frames/<Edit>/<id>.jpg
//   R2: tomin-media/game/clips/<Edit>/<id>.mp4
//   .cache/game-assets/frames/<Edit>/<id>.jpg   (local cache, not bundled)
//   .cache/game-assets/clips/<Edit>/<id>.mp4    (same)
//   frames-pool.json paths:         "game/frames/<Edit>/<id>.jpg"
//                                    "game/clips/<Edit>/<id>.mp4"
//
// Steps:
//   1. Upload every file under public/frames + public/clips to R2 under
//      the corresponding game/frames + game/clips prefix.
//   2. Rewrite frames-pool.json paths (frames/... → game/frames/...,
//      clips/... → game/clips/...).
//   3. Move public/frames + public/clips to .cache/game-assets/.
//
// Idempotent: re-running uploads the same keys (R2 PUT is overwrite), and
// the manifest rewrite is a no-op once paths already start with game/.
// Safe to interrupt — local files only move at the very end.

const fs = require('fs');
const path = require('path');
const { uploadMany } = require('./r2-upload.cjs');

const projectDir = __dirname;
const oldFramesDir = path.join(projectDir, 'public', 'frames');
const oldClipsDir  = path.join(projectDir, 'public', 'clips');
const cacheRoot    = path.join(projectDir, '.cache', 'game-assets');
const manifestPath = path.join(projectDir, 'public', 'frames-pool.json');

function walk(dir, base = dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    if (name.startsWith('.')) continue;
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) walk(full, base, out);
    else out.push({ full, rel: path.relative(base, full) });
  }
  return out;
}

async function uploadDir(srcDir, r2Prefix, label) {
  const files = walk(srcDir);
  if (!files.length) {
    console.log(`  (no files in ${srcDir} — skipping ${label} upload)`);
    return;
  }
  console.log(`\n☁  ${label}: uploading ${files.length} file(s) to R2 under ${r2Prefix}/`);
  await uploadMany(
    files.map(({ full, rel }) => ({
      key: `${r2Prefix}/${rel.split(path.sep).join('/')}`,
      filePath: full,
    })),
    { parallel: 8 }
  );
}

function rewriteManifest() {
  if (!fs.existsSync(manifestPath)) {
    console.log('  (no frames-pool.json — skipping manifest rewrite)');
    return;
  }
  const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  let rewroteFrame = 0;
  let rewroteClip  = 0;
  for (const f of m.frames || []) {
    if (typeof f.thumb === 'string' && f.thumb.startsWith('frames/')) {
      f.thumb = 'game/' + f.thumb;
      rewroteFrame++;
    }
    if (typeof f.clip === 'string' && f.clip.startsWith('clips/')) {
      f.clip = 'game/' + f.clip;
      rewroteClip++;
    }
  }
  const tmp = manifestPath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(m, null, 2));
  fs.renameSync(tmp, manifestPath);
  console.log(`\n✓ frames-pool.json: rewrote ${rewroteFrame} thumb path(s) + ${rewroteClip} clip path(s)`);
}

function moveLocalToCache() {
  fs.mkdirSync(cacheRoot, { recursive: true });
  for (const [src, dest] of [
    [oldFramesDir, path.join(cacheRoot, 'frames')],
    [oldClipsDir,  path.join(cacheRoot, 'clips')],
  ]) {
    if (!fs.existsSync(src)) continue;
    if (fs.existsSync(dest)) {
      console.log(`  ⚠ ${dest} already exists — merging by skipping existing files`);
      // Walk and copy individual files only if missing in dest.
      for (const { full, rel } of walk(src)) {
        const target = path.join(dest, rel);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        if (!fs.existsSync(target)) fs.renameSync(full, target);
        else fs.unlinkSync(full);
      }
      // Best-effort empty dir cleanup.
      try { fs.rmSync(src, { recursive: true }); } catch { /* best-effort */ }
    } else {
      fs.renameSync(src, dest);
    }
    console.log(`✓ moved ${src} → ${dest}`);
  }
}

async function main() {
  console.log('▶ migrate-game-assets-to-r2\n');

  await uploadDir(oldFramesDir, 'game/frames', 'frames');
  await uploadDir(oldClipsDir,  'game/clips',  'clips');

  rewriteManifest();
  moveLocalToCache();

  console.log('\n✅ Migration complete.');
  console.log('   R2 holds the binaries. Local cache: .cache/game-assets/');
  console.log('   Next publish.sh will only upload new/changed assets.');
}

main().catch((e) => {
  console.error('\n❌ migration failed:', e);
  process.exit(1);
});
