// extract-clips.cjs
//
// For each approved frame in frames-pool.json, cut a 3-second silent
// B/W clip starting at the frame's timestamp. Output to public/clips/
// <edit>/<id>.mp4. Adds a `clip` path back into the manifest entry so
// the Silent Clip game can filter for "has a clip".
//
// Incremental: existing clip files are kept; only missing ones run
// through ffmpeg. To re-extract, delete the file (or the manifest's
// `clip` field).
//
// Caps at MAX_CLIPS_PER_EDIT per edit — Silent Clip's pool doesn't
// need every approved frame, just a representative spread.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { uploadMany, deleteMany } = require('./r2-upload.cjs');

const projectDir = __dirname;
// Same scheme as extract-frames: local cache under .cache/game-assets,
// uploaded to R2 under game/clips/<edit>/<id>.mp4.
const outRoot = path.join(projectDir, '.cache', 'game-assets', 'clips');
const R2_PREFIX = 'game/clips';
const manifestPath = path.join(projectDir, 'public', 'frames-pool.json');

const CLIP_SECONDS = 3;
const MAX_CLIPS_PER_EDIT = 8;
// Maxlongest edge for the clip frame. Keeps file size small without
// dropping into "you can't tell anything"-blur territory.
const MAX_WIDTH = 540;

function loadManifest() {
  if (!fs.existsSync(manifestPath)) {
    console.error('public/frames-pool.json missing — run extract-frames first.');
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
}

function saveManifest(m) {
  const tmp = manifestPath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(m, null, 2));
  fs.renameSync(tmp, manifestPath);
}

function findVideoPath(folder, videoName) {
  return path.join(projectDir, folder, videoName);
}

function extractClip(videoPath, timestamp, outPath) {
  try {
    execFileSync('ffmpeg', [
      '-ss', timestamp.toFixed(3),
      '-t', String(CLIP_SECONDS),
      '-i', videoPath,
      // Greyscale + scale to MAX_WIDTH keeping aspect ratio + even height.
      '-vf', `format=gray,scale='min(${MAX_WIDTH},iw)':-2`,
      '-an',
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-crf', '24',
      '-movflags', '+faststart',
      '-y',
      outPath,
    ], { stdio: ['ignore', 'ignore', 'ignore'] });
    return true;
  } catch {
    return false;
  }
}

async function main() {
  console.log('▶ extract-clips\n');
  const manifest = loadManifest();
  const frames = manifest.frames || [];
  const approved = frames.filter((f) => f.state === 'approved');
  if (!approved.length) {
    console.log('No approved frames.');
    return;
  }

  // Group + cap per edit
  const byEdit = {};
  for (const f of approved) (byEdit[f.edit] = byEdit[f.edit] || []).push(f);
  const targets = [];
  for (const edit of Object.keys(byEdit)) {
    targets.push(...byEdit[edit].slice(0, MAX_CLIPS_PER_EDIT));
  }
  const targetIds = new Set(targets.map((f) => f.id));

  let made = 0, skipped = 0, failed = 0;
  const r2Uploads = [];
  const r2Orphans = [];

  for (const f of targets) {
    const videoPath = findVideoPath(f.edit, f.video);
    if (!fs.existsSync(videoPath)) {
      console.log(`  ⚠ ${f.edit}/${f.id} — source video missing`);
      failed++;
      continue;
    }

    const folderDir = path.join(outRoot, f.edit);
    if (!fs.existsSync(folderDir)) fs.mkdirSync(folderDir, { recursive: true });

    const clipFile = `${f.id}.mp4`;
    const clipPath = path.join(folderDir, clipFile);
    const r2Key = `${R2_PREFIX}/${f.edit}/${clipFile}`;

    // Re-use: clip already extracted + manifest already points at this
    // R2 key → skip. We trust that the previous run uploaded it; if not,
    // delete the local file to force re-extract.
    if (fs.existsSync(clipPath) && f.clip === r2Key) {
      skipped++;
      continue;
    }

    process.stdout.write(`  ${f.edit}/${f.id} … `);
    if (extractClip(videoPath, f.timestamp, clipPath)) {
      f.clip = r2Key;
      r2Uploads.push({ key: r2Key, filePath: clipPath });
      made++;
      console.log('✓');
    } else {
      failed++;
      console.log('✗');
    }
  }

  // Strip `clip` from frames no longer in the target set — keeps the
  // pool clean if MAX_CLIPS_PER_EDIT shrinks later. Also queue the now-
  // orphaned R2 keys for deletion.
  for (const f of approved) {
    if (!targetIds.has(f.id) && f.clip) {
      r2Orphans.push(f.clip);
      delete f.clip;
    }
  }

  // ── R2 sync ─────────────────────────────────────────────────────
  if (r2Uploads.length) {
    console.log(`\n☁  Uploading ${r2Uploads.length} new clip(s) to R2…`);
    await uploadMany(r2Uploads);
  }
  if (r2Orphans.length) {
    console.log(`\n☁  Deleting ${r2Orphans.length} orphan clip(s) from R2…`);
    await deleteMany(r2Orphans);
  }

  saveManifest(manifest);
  console.log(`\n✅ frames-pool.json updated`);
  console.log(`   extracted: ${made}`);
  console.log(`   skipped:   ${skipped}`);
  console.log(`   failed:    ${failed}`);
  console.log(`   total clips in pool: ${approved.filter((f) => f.clip).length}`);
}

main().catch((e) => {
  console.error('\n❌ extract-clips failed:', e);
  process.exit(1);
});
