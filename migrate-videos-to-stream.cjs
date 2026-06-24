#!/usr/bin/env node
// One-shot migration: copy every portfolio video from R2 (media.shouli.de)
// into Cloudflare Stream, then write public/stream-map.json mapping each
// video's bucket path → { uid, hls, dash, poster }. The player-swap code
// reads that map to play the adaptive Stream rendition instead of the raw MP4.
//
// Secure by design: your Stream credentials stay in your shell, never in the
// repo and never shared. Run it yourself:
//
//   export CLOUDFLARE_ACCOUNT_ID=xxxxxxxx
//   export CLOUDFLARE_STREAM_TOKEN=xxxxxxxx        # token with Stream:Edit
//   node migrate-videos-to-stream.cjs --dry-run    # list what would happen
//   node migrate-videos-to-stream.cjs              # do it (idempotent)
//
// Idempotent: videos already in stream-map.json are skipped, so you can
// re-run after adding new edits.

const fs = require('fs');
const path = require('path');

const MEDIA_BASE = 'https://media.shouli.de/'; // single source of truth: src/utils/media.js
const MAP_PATH = path.resolve(__dirname, 'public/stream-map.js');
const DRY_RUN = process.argv.includes('--dry-run');

const ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID;
const TOKEN = process.env.CLOUDFLARE_STREAM_TOKEN;

const API = (p) => `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/stream${p}`;
const auth = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const keyOf = (src) => src.split('?')[0]; // bucket path without the ?v= cache-buster

async function collectVideos() {
  const { portfolioData } = await import('./data.js');
  const seen = new Map();
  for (const items of Object.values(portfolioData)) {
    for (const it of items) {
      if (it && it.isVideo && it.src) {
        const k = keyOf(it.src);
        if (!seen.has(k)) seen.set(k, { key: k, src: it.src, name: it.name || k });
      }
    }
  }
  return [...seen.values()];
}

async function copyToStream(video) {
  const url = MEDIA_BASE + video.src; // public, fetchable by Stream
  const res = await fetch(API('/copy'), {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ url, meta: { name: video.name } }),
  });
  const json = await res.json();
  if (!json.success) throw new Error(`copy failed: ${JSON.stringify(json.errors)}`);
  return json.result.uid;
}

async function waitReady(uid, timeoutMs = 10 * 60 * 1000) {
  const start = Date.now();
  for (;;) {
    const res = await fetch(API(`/${uid}`), { headers: auth });
    const json = await res.json();
    const r = json.result || {};
    if (r.readyToStream) return r;
    if (r.status && r.status.state === 'error') throw new Error(`encode error: ${JSON.stringify(r.status)}`);
    if (Date.now() - start > timeoutMs) throw new Error('timed out waiting for encode');
    process.stdout.write('.');
    await sleep(5000);
  }
}

async function main() {
  if (!ACCOUNT || !TOKEN) {
    console.error('✗ Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_STREAM_TOKEN first.');
    process.exit(1);
  }
  let map = {};
  if (fs.existsSync(MAP_PATH)) {
    const txt = fs.readFileSync(MAP_PATH, 'utf8');
    map = JSON.parse(txt.slice(txt.indexOf('{'), txt.lastIndexOf('}') + 1));
  }
  const videos = await collectVideos();
  const todo = videos.filter((v) => !map[v.key]);

  console.log(`Found ${videos.length} videos · ${videos.length - todo.length} already migrated · ${todo.length} to do`);
  if (DRY_RUN) {
    todo.forEach((v) => console.log(`  would copy: ${v.name}  (${MEDIA_BASE}${v.src})`));
    return;
  }

  for (const v of todo) {
    process.stdout.write(`→ ${v.name} … `);
    try {
      const uid = await copyToStream(v);
      const r = await waitReady(uid);
      map[v.key] = {
        uid,
        hls: (r.playback && r.playback.hls) || `https://videodelivery.net/${uid}/manifest/video.m3u8`,
        dash: (r.playback && r.playback.dash) || `https://videodelivery.net/${uid}/manifest/video.mpd`,
        poster: r.thumbnail || `https://videodelivery.net/${uid}/thumbnails/thumbnail.jpg`,
        duration: r.duration || null,
      };
      fs.writeFileSync(MAP_PATH, 'export default ' + JSON.stringify(map, null, 2) + ';\n'); // write after each so progress survives a crash
      console.log(' ready ✓');
    } catch (e) {
      console.log(` ✗ ${e.message}`);
    }
  }
  console.log(`\nDone. Map written to ${path.relative(process.cwd(), MAP_PATH)} (${Object.keys(map).length} videos).`);
}

main().catch((e) => { console.error(e); process.exit(1); });
