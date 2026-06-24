// extract-frames.cjs
//
// Pulls I-frames from every portfolio video into public/frames/<edit>/<id>.jpg
// and writes a manifest (frames-pool.json) listing each frame with an
// approval state. The manifest is the source of truth for the Daily Frame
// game's pool — only frames marked "approved" are eligible.
//
// Run:
//   node extract-frames.cjs
//
// Behaviour:
//   • Re-runs are incremental: videos whose mtime hasn't changed since the
//     last extraction are skipped (their existing frames stay in the manifest
//     with their approval state preserved).
//   • If a video changed, its old frames + thumbs are wiped and re-extracted
//     as "approved" (auto-include). Eddie curates via admin to "reject" the
//     bad ones — typical photo-review flow (Lightroom / Apple Photos).
//   • Orphan thumbnails (no manifest entry) are deleted at the end.
//
// Requirements: ffmpeg + ffprobe on PATH (brew install ffmpeg).

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const { uploadMany, deleteMany } = require('./r2-upload.cjs');

const projectDir = __dirname;
// Local working cache — lives OUTSIDE public/ so vite doesn't ship it
// into dist/. The actual game-asset distribution path is R2; this
// cache only exists to (a) make re-extracts fast (mtime-skipped) and
// (b) feed extract-colors which reads thumbs to compute palettes.
const outDir = path.join(projectDir, '.cache', 'game-assets', 'frames');
// R2 prefix the cache mirrors — every local thumb at
// .cache/game-assets/frames/<edit>/<id>.jpg uploads to
// game/frames/<edit>/<id>.jpg on R2 (same path inside the bucket).
const R2_PREFIX = 'game/frames';
// Manifest lives under public/ so vite copies it to dist/ at build time
// and the Worker can read it via the ASSETS binding without a separate
// pipeline. The manifest stores R2 path suffixes (e.g.
// "game/frames/Lunatic/Lunatic_007.jpg"); the API + admin prefix with
// the public R2 base URL when rendering.
const manifestPath = path.join(projectDir, 'public', 'frames-pool.json');

// Mirror sync.cjs's exclusion list, plus magazines (no videos there).
const EXCLUDED_FOLDERS = new Set([
  'node_modules', 'dist', 'public', 'src', 'tests', 'test-results',
  'functions', 'icons', 'playwright-report', '.git', '.github', '.vite',
  'migrations', '.cache', '.wrangler', '.husky', '.claude',
  'TOMIN INDEX.TXT',
]);

const VIDEO_EXTS = new Set(['.mp4', '.mov', '.webm', '.mkv']);

// Cap per video so manual approval stays manageable. With ~14 edits this
// gives us a ceiling of ~420 frames in the pool — plenty for years of dailies.
const MAX_FRAMES_PER_VIDEO = 30;

// Skip the very start and end of each video — usually fade-in/black/credits
// and not great puzzle material.
const EDGE_TRIM = 0.05;

// ───── manifest helpers ───────────────────────────────────────────

function loadManifest() {
  if (!fs.existsSync(manifestPath)) {
    return { generated: null, frames: [] };
  }
  try {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (e) {
    console.error('⚠ frames-pool.json unreadable, starting fresh:', e.message);
    return { generated: null, frames: [] };
  }
}

function saveManifest(manifest) {
  manifest.generated = new Date().toISOString();
  const tmp = manifestPath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(manifest, null, 2));
  fs.renameSync(tmp, manifestPath);
}

// ───── filesystem discovery ───────────────────────────────────────

// Returns [{ folder, file, fullPath }] — preferring _web variants where present
// (same as sync.cjs does for playback).
function findVideos() {
  const videos = [];
  for (const entry of fs.readdirSync(projectDir)) {
    if (entry.startsWith('.')) continue;
    if (EXCLUDED_FOLDERS.has(entry)) continue;
    const folderPath = path.join(projectDir, entry);
    if (!fs.statSync(folderPath).isDirectory()) continue;

    const files = fs.readdirSync(folderPath);
    const fileSet = new Set(files);

    for (const file of files) {
      if (file.startsWith('.')) continue;
      if (/_(web|compressed)\.[^.]+$/.test(file)) continue;

      const ext = path.extname(file).toLowerCase();
      if (!VIDEO_EXTS.has(ext)) continue;

      // Prefer _web for extraction (smaller, faster ffprobe/ffmpeg).
      const base = file.slice(0, -ext.length);
      const webFile = `${base}_web${ext}`;
      const chosen = fileSet.has(webFile) ? webFile : file;

      videos.push({
        folder: entry,
        file: chosen,
        fullPath: path.join(folderPath, chosen),
      });
    }
  }
  return videos;
}

// ───── ffmpeg / ffprobe ──────────────────────────────────────────

function getDuration(videoPath) {
  try {
    const out = execFileSync('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      videoPath,
    ], { encoding: 'utf8' });
    return parseFloat(out.trim());
  } catch {
    return null;
  }
}

// Returns an ordered list of I-frame timestamps (seconds).
function getIFrameTimestamps(videoPath) {
  try {
    const out = execFileSync('ffprobe', [
      '-select_streams', 'v:0',
      '-show_entries', 'packet=pts_time,flags',
      '-of', 'csv=print_section=0',
      videoPath,
    ], { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });

    return out
      .split('\n')
      .filter((line) => line.includes('K_')) // K flag marks keyframes
      .map((line) => parseFloat(line.split(',')[0]))
      .filter((t) => Number.isFinite(t));
  } catch (e) {
    console.error(`   ⚠ ffprobe failed: ${e.message}`);
    return [];
  }
}

// Drop edges, then evenly sample down to maxCount.
function sampleTimestamps(timestamps, duration, maxCount) {
  if (!timestamps.length || !duration) return [];

  const lo = duration * EDGE_TRIM;
  const hi = duration * (1 - EDGE_TRIM);
  const filtered = timestamps.filter((t) => t >= lo && t <= hi);
  if (filtered.length <= maxCount) return filtered;

  const out = [];
  const step = (filtered.length - 1) / (maxCount - 1);
  for (let i = 0; i < maxCount; i++) {
    out.push(filtered[Math.round(i * step)]);
  }
  return out;
}

function extractFrame(videoPath, timestamp, outPath) {
  try {
    execFileSync('ffmpeg', [
      '-ss', timestamp.toFixed(3),
      '-i', videoPath,
      '-vframes', '1',
      // Scale longest edge to ≤1200 px — enough resolution for the game's
      // first-attempt close-crop while keeping thumbs small (~150-250 KB).
      '-vf', "scale='min(1200,iw)':-2",
      '-q:v', '3',
      '-y',
      outPath,
    ], { stdio: ['ignore', 'ignore', 'pipe'] });
    return true;
  } catch {
    return false;
  }
}

// ───── main ───────────────────────────────────────────────────────

function safeIdSegment(s) {
  // ASCII-safe id segments so URLs/filenames stay portable. Spaces → underscore,
  // strip anything that isn't alnum/underscore.
  return s.replace(/\s+/g, '_').replace(/[^A-Za-z0-9_]/g, '');
}

async function main() {
  console.log('▶ extract-frames\n');

  const manifest = loadManifest();
  // Map id → previous entry (to preserve approval state across re-runs).
  const previous = new Map(manifest.frames.map((f) => [f.id, f]));

  const videos = findVideos();
  if (!videos.length) {
    console.log('No videos found in portfolio folders.');
    return;
  }

  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const nextFrames = [];
  const activeIds = new Set();
  // R2 upload queue: anything newly extracted in this run needs to land
  // on R2 before the manifest paths become valid. (mtime-skipped frames
  // stay as-is — they were uploaded on their original extract.)
  const r2Uploads = [];

  // Folders with several videos need the video name inside the frame id —
  // a folder-only id (`debut_001`) collides across videos and the thumbs
  // silently overwrite each other on R2.
  const videosPerFolder = new Map();
  for (const v of videos) {
    videosPerFolder.set(v.folder, (videosPerFolder.get(v.folder) || 0) + 1);
  }

  for (const v of videos) {
    console.log(`📹 ${v.folder}/${v.file}`);
    const stat = fs.statSync(v.fullPath);
    const mtimeMs = stat.mtime.getTime();
    const folderOutDir = path.join(outDir, v.folder);
    if (!fs.existsSync(folderOutDir)) fs.mkdirSync(folderOutDir, { recursive: true });

    const videoBase = v.file.replace(/\.[^.]+$/, '');
    const idBase = videosPerFolder.get(v.folder) > 1
      ? `${safeIdSegment(v.folder)}_${safeIdSegment(videoBase)}`
      : safeIdSegment(v.folder);

    // Existing entries for this exact video? Only reusable when their ids
    // already follow the current scheme — entries written before the
    // multi-video fix carry colliding folder-only ids and must re-extract.
    const sameVideo = manifest.frames.filter(
      (f) => f.edit === v.folder && f.video === v.file
    );
    const allFresh = sameVideo.length > 0
      && sameVideo.every((f) => f.videoMtime === mtimeMs)
      && sameVideo.every((f) => f.id.replace(/_\d+$/, '') === idBase);

    if (allFresh) {
      console.log(`   ⤳ unchanged, keeping ${sameVideo.length} frames`);
      for (const f of sameVideo) {
        activeIds.add(f.id);
        nextFrames.push(f);
      }
      continue;
    }

    // Re-extract from scratch for this video.
    const duration = getDuration(v.fullPath);
    if (!duration) {
      console.log('   ⚠ couldn\'t read duration, skipping');
      continue;
    }

    const iframes = getIFrameTimestamps(v.fullPath);
    const sampled = sampleTimestamps(iframes, duration, MAX_FRAMES_PER_VIDEO);
    console.log(`   ${iframes.length} I-frames found · sampling ${sampled.length}`);

    // Clear any stale entries/thumbs for this video before writing new
    // ones — both locally (cache) and on R2 (the staged orphan list).
    const staleR2Keys = [];
    for (const f of sameVideo) {
      const oldLocal = thumbLocalPath(f.thumb);
      if (oldLocal && fs.existsSync(oldLocal)) fs.unlinkSync(oldLocal);
      if (f.thumb) staleR2Keys.push(f.thumb);
    }

    let extracted = 0;
    for (let i = 0; i < sampled.length; i++) {
      const ts = sampled[i];
      const id = `${idBase}_${String(i + 1).padStart(3, '0')}`;
      const thumbName = `${id}.jpg`;
      const thumbPath = path.join(folderOutDir, thumbName);

      if (!extractFrame(v.fullPath, ts, thumbPath)) {
        console.log(`   ❌ frame at ${ts.toFixed(2)}s failed`);
        continue;
      }
      extracted++;

      // Preserve approval if we had this exact id before — but since we just
      // wiped sameVideo above, this only matters if id collisions cross videos
      // (won't, given the safeIdSegment + index pattern). Kept for safety.
      // New frames default to "approved" so the pool fills automatically;
      // admin UI is used to "reject" what doesn't make a good puzzle.
      const prev = previous.get(id);
      const state = prev && prev.edit === v.folder ? prev.state : 'approved';

      const r2Key = `${R2_PREFIX}/${v.folder}/${thumbName}`;
      activeIds.add(id);
      nextFrames.push({
        id,
        edit: v.folder,
        video: v.file,
        videoMtime: mtimeMs,
        timestamp: Number(ts.toFixed(3)),
        thumb: r2Key,
        state,
        extractedAt: new Date().toISOString(),
      });
      r2Uploads.push({ key: r2Key, filePath: thumbPath });
    }
    // Drop the just-replaced thumbs from R2. (Doing this AFTER the push
    // above means we never delete a key we're about to re-upload — the
    // mtime path-change would only matter if we ever altered the id
    // scheme, but better safe.)
    const reuploadedKeys = new Set(r2Uploads.map((u) => u.key));
    const trulyStale = staleR2Keys.filter((k) => !reuploadedKeys.has(k));
    if (trulyStale.length) {
      r2Orphans.push(...trulyStale);
    }
    console.log(`   ✓ extracted ${extracted}`);
  }

  // Clean up orphan thumbnails — local cache + R2.
  const orphanFrames = manifest.frames.filter((f) => !activeIds.has(f.id));
  if (orphanFrames.length) {
    for (const f of orphanFrames) {
      const orphanLocal = thumbLocalPath(f.thumb);
      if (orphanLocal && fs.existsSync(orphanLocal)) fs.unlinkSync(orphanLocal);
      if (f.thumb) r2Orphans.push(f.thumb);
    }
    console.log(`\n🧹 ${orphanFrames.length} orphan frame entries — removing local + R2`);
  }

  // ── R2 sync ─────────────────────────────────────────────────────
  if (r2Uploads.length) {
    console.log(`\n☁  Uploading ${r2Uploads.length} new/changed frame(s) to R2…`);
    await uploadMany(r2Uploads);
  }
  if (r2Orphans.length) {
    console.log(`\n☁  Deleting ${r2Orphans.length} stale frame(s) from R2…`);
    await deleteMany(r2Orphans);
  }

  manifest.frames = nextFrames;
  saveManifest(manifest);

  const counts = nextFrames.reduce(
    (acc, f) => ((acc[f.state] = (acc[f.state] || 0) + 1), acc),
    {}
  );
  console.log('\n✅ frames-pool.json updated');
  console.log(`   total:    ${nextFrames.length}`);
  console.log(`   approved: ${counts.approved || 0}`);
  console.log(`   pending:  ${counts.pending || 0}`);
  console.log(`   rejected: ${counts.rejected || 0}`);
}

// Map a manifest thumb path (R2 key) back to its local cache file. Used
// for deleting stale local thumbs and for extract-colors which reads
// from the same cache.
function thumbLocalPath(thumb) {
  if (!thumb) return null;
  // R2 keys look like "game/frames/<edit>/<id>.jpg" — the local cache
  // mirrors the same shape minus the "game/" namespace prefix because
  // the cache itself IS the game-assets folder.
  if (thumb.startsWith('game/frames/')) {
    return path.join(projectDir, '.cache', 'game-assets', thumb.slice('game/'.length));
  }
  // Legacy v1 paths (frames/<edit>/<id>.jpg from before the R2 move).
  // Look in the old public/frames/ location as a fallback so a partial
  // migration doesn't trip the cleanup pass.
  if (thumb.startsWith('frames/')) {
    return path.join(projectDir, 'public', thumb);
  }
  return null;
}

// Tracks R2 keys queued for deletion as videos disappear or get
// re-extracted. Declared at module scope so main() can extend it from
// either branch (per-video stale or end-of-run orphan).
const r2Orphans = [];

main().catch((e) => {
  console.error('\n❌ extract-frames failed:', e);
  process.exit(1);
});
