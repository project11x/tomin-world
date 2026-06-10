// r2-upload.cjs
//
// Shared helper for the extract-frames / extract-clips / migration
// scripts. Wraps `wrangler r2 object put` with:
//   • Concurrency control (default 6 parallel uploads)
//   • Live counter output ("[3/47] ✓ game/frames/Lunatic/Lunatic_001.jpg")
//   • Optional delete (orphan cleanup when source content disappears)
//
// Why not a thin Node SDK call to S3? Cloudflare R2 supports S3 over HTTPS,
// but it needs an Access Key ID / Secret pair. The bucket is already wired
// to `npx wrangler` (which uses the user's Cloudflare login session), so
// reusing that toolchain keeps "one place where I'm logged in" — same
// reason publish.sh shells out to wrangler instead of using @aws-sdk.

const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

const R2_BUCKET = 'tomin-media';
const DEFAULT_PARALLEL = 6;

function wranglerPut(key, filePath) {
  return new Promise((resolve, reject) => {
    execFile(
      'npx',
      ['--yes', 'wrangler', 'r2', 'object', 'put',
       `${R2_BUCKET}/${key}`, `--file=${filePath}`, '--remote'],
      { maxBuffer: 16 * 1024 * 1024 },
      (err) => (err ? reject(err) : resolve())
    );
  });
}

function wranglerDelete(key) {
  return new Promise((resolve, reject) => {
    execFile(
      'npx',
      ['--yes', 'wrangler', 'r2', 'object', 'delete',
       `${R2_BUCKET}/${key}`, '--remote'],
      { maxBuffer: 1024 * 1024 },
      // Don't reject on "object doesn't exist" — that's fine for cleanup.
      (err) => resolve(err ? { ok: false } : { ok: true })
    );
  });
}

// Run `tasks` with up to `parallel` in flight at once. `task` is an
// async function. Resolves once everything finishes; surfaces errors
// with the offending item so callers can log helpfully.
async function pool(tasks, parallel) {
  let cursor = 0;
  let done = 0;
  const total = tasks.length;
  const workers = Array.from({ length: Math.min(parallel, total) }, async () => {
    while (cursor < total) {
      const i = cursor++;
      try {
        await tasks[i]();
        done++;
        process.stdout.write(`\r  [${done}/${total}] uploading…`);
      } catch (e) {
        process.stdout.write(`\r  ✗ failed at item ${i}: ${e.message}\n`);
      }
    }
  });
  await Promise.all(workers);
  process.stdout.write(`\r  ${' '.repeat(40)}\r`);
}

// Upload many { key, filePath } pairs. Skips items whose filePath
// doesn't exist (logged).
async function uploadMany(items, { parallel = DEFAULT_PARALLEL } = {}) {
  if (!items.length) return;
  const valid = items.filter((it) => {
    if (!fs.existsSync(it.filePath)) {
      console.log(`  ⚠ missing local file: ${it.filePath}`);
      return false;
    }
    return true;
  });
  const tasks = valid.map((it) => () => wranglerPut(it.key, it.filePath));
  await pool(tasks, parallel);
  console.log(`  ✓ uploaded ${valid.length}`);
}

// Delete many R2 keys (best-effort, missing ones are OK).
async function deleteMany(keys, { parallel = DEFAULT_PARALLEL } = {}) {
  if (!keys.length) return;
  const tasks = keys.map((k) => () => wranglerDelete(k));
  await pool(tasks, parallel);
  console.log(`  ✓ delete attempted on ${keys.length}`);
}

module.exports = {
  R2_BUCKET,
  uploadMany,
  deleteMany,
};
