// extract-colors.cjs (v2 — saturation-aware)
//
// Old version did a flat RGB histogram on the frames. Eddie's edits are
// moody / low-key, so the dominant colours were almost always dark grey,
// which made Dominant Color unplayable.
//
// v2 prioritises *visual identity* over *frequency*:
//   • Skip near-black / near-white pixels (carry no colour info).
//   • Skip desaturated greys (s < 0.18 in HSV).
//   • Bucket by hue (24 hue bins × 3 sat tiers × 3 value tiers).
//   • Score each bucket = saturation × log(count) × value-sweet-spot
//     weight (peak at v ≈ 0.55). Result: vibrant mids beat muddy darks
//     even when the darks are statistically more frequent.
//   • Deduplicate within ~30° of hue so the final palette spans the
//     edit's actual identity rather than five shades of one tone.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const projectDir = __dirname;
const manifestPath = path.join(projectDir, 'public', 'frames-pool.json');
const outPath = path.join(projectDir, 'public', 'edit-colors.json');

// Maps a manifest thumb path (R2 key) back to the local cache file.
function thumbLocalPath(thumb) {
  if (!thumb) return null;
  if (thumb.startsWith('game/frames/')) {
    return path.join(projectDir, '.cache', 'game-assets', thumb.slice('game/'.length));
  }
  // Legacy pre-R2 paths.
  if (thumb.startsWith('frames/')) {
    return path.join(projectDir, 'public', thumb);
  }
  return null;
}

const SAMPLES_PER_EDIT = 14;
const DECODE_SIZE = 48;
const TOP_N = 5;
const MIN_SAT = 0.18;
const MIN_VAL = 0.12;
const MAX_VAL = 0.95;

function loadManifest() {
  if (!fs.existsSync(manifestPath)) {
    console.error('public/frames-pool.json missing — run extract-frames first.');
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
}

function decodeImage(imagePath) {
  return execFileSync('ffmpeg', [
    '-loglevel', 'error',
    '-i', imagePath,
    '-vf', `scale=${DECODE_SIZE}:${DECODE_SIZE}:flags=lanczos,format=rgb24`,
    '-frames:v', '1',
    '-f', 'rawvideo',
    '-',
  ]);
}

function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const v = max;
  const d = max - min;
  const s = max === 0 ? 0 : d / max;
  let h = 0;
  if (d > 0) {
    if (max === r)      h = ((g - b) / d) % 6;
    else if (max === g) h = ((b - r) / d) + 2;
    else                h = ((r - g) / d) + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, s, v];
}

function hexFromRgb(r, g, b) {
  return '#' + [r, g, b].map((c) =>
    Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, '0')
  ).join('');
}

function dominantColours(rgbBuffer, topN) {
  let palette = doExtract(rgbBuffer, topN, MIN_SAT, MIN_VAL, MAX_VAL);
  // Fallback 1: nearly-monochrome edits (moody / low-key colour work).
  if (palette.length < 2) {
    palette = doExtract(rgbBuffer, topN, 0.04, 0.05, 0.99);
  }
  // Fallback 2: truly black-and-white edits (Lunatic). All earlier
  // passes filter by saturation, so a B&W edit returns nothing. Switch
  // to pure-luminosity bucketing — gives 5 distinguishable greys.
  if (palette.length < 2) {
    palette = doExtractMono(rgbBuffer, topN);
  }
  return palette;
}

// Luminosity-only bucketing for B&W edits. Spreads picks across the
// brightness range so the game shows 5 distinct greys, not 5 near-
// identical ones.
function doExtractMono(rgbBuffer, topN) {
  const buckets = new Map();
  for (let i = 0; i + 2 < rgbBuffer.length; i += 3) {
    const r = rgbBuffer[i], g = rgbBuffer[i + 1], b = rgbBuffer[i + 2];
    const y = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    if (y < 0.05 || y > 0.97) continue;
    const yBin = Math.min(11, Math.floor(y * 12));
    let bk = buckets.get(yBin);
    if (!bk) { bk = { count: 0, r: 0, g: 0, b: 0, y: yBin }; buckets.set(yBin, bk); }
    bk.count++; bk.r += r; bk.g += g; bk.b += b;
  }
  if (!buckets.size) return [];
  const scored = [...buckets.values()].sort((a, b) => b.count - a.count);
  const out = [];
  const usedBins = [];
  for (const bk of scored) {
    if (out.length >= topN) break;
    if (usedBins.some((b) => Math.abs(b - bk.y) < 2)) continue;
    out.push(hexFromRgb(bk.r / bk.count, bk.g / bk.count, bk.b / bk.count));
    usedBins.push(bk.y);
  }
  if (out.length < topN) {
    for (const bk of scored) {
      if (out.length >= topN) break;
      const hex = hexFromRgb(bk.r / bk.count, bk.g / bk.count, bk.b / bk.count);
      if (!out.includes(hex)) out.push(hex);
    }
  }
  return out;
}

function doExtract(rgbBuffer, topN, minSat, minVal, maxVal) {
  const buckets = new Map();
  for (let i = 0; i + 2 < rgbBuffer.length; i += 3) {
    const r = rgbBuffer[i], g = rgbBuffer[i + 1], b = rgbBuffer[i + 2];
    const [h, s, v] = rgbToHsv(r, g, b);
    if (v < minVal || v > maxVal) continue;
    if (s < minSat) continue;
    const hueBin = Math.floor(h / 15);                  // 24 bins
    const satTier = Math.min(2, Math.floor(s * 3));     // 0..2
    const valTier = Math.min(2, Math.floor(v * 3));     // 0..2
    const key = `${hueBin},${satTier},${valTier}`;
    let bk = buckets.get(key);
    if (!bk) {
      bk = { count: 0, r: 0, g: 0, b: 0, sat: 0, val: 0, hue: hueBin };
      buckets.set(key, bk);
    }
    bk.count++;
    bk.r += r; bk.g += g; bk.b += b;
    bk.sat += s; bk.val += v;
  }

  if (!buckets.size) return [];

  // Score each bucket.
  const scored = [...buckets.values()].map((bk) => {
    const avgR = bk.r / bk.count;
    const avgG = bk.g / bk.count;
    const avgB = bk.b / bk.count;
    const avgSat = bk.sat / bk.count;
    const avgVal = bk.val / bk.count;
    const valSweetSpot = 1 - Math.abs(avgVal - 0.55) * 1.4;
    const score = avgSat * Math.log(bk.count + 1) * Math.max(0.25, valSweetSpot);
    return { score, hue: bk.hue, hex: hexFromRgb(avgR, avgG, avgB) };
  }).sort((a, b) => b.score - a.score);

  // Hue-deduplicate: drop a colour whose hue bin is within ±1 of one
  // we've already chosen. Encourages a palette that covers the edit's
  // span rather than five neighbouring tones.
  const out = [];
  const usedHues = [];
  for (const item of scored) {
    if (out.length >= topN) break;
    if (usedHues.some((h) => Math.abs(h - item.hue) <= 1 ||
                              Math.abs(h - item.hue) >= 23)) continue;
    out.push(item.hex);
    usedHues.push(item.hue);
  }
  // If hue-dedupe was too aggressive, pad with next-best by raw score.
  if (out.length < topN) {
    for (const item of scored) {
      if (out.length >= topN) break;
      if (!out.includes(item.hex)) out.push(item.hex);
    }
  }
  return out;
}

function main() {
  console.log('▶ extract-colors (v2 — saturation-aware)\n');
  const manifest = loadManifest();
  const approved = (manifest.frames || []).filter((f) => f.state === 'approved');
  if (!approved.length) {
    console.log('No approved frames.');
    return;
  }

  const byEdit = {};
  for (const f of approved) (byEdit[f.edit] = byEdit[f.edit] || []).push(f);

  const colours = {};
  for (const edit of Object.keys(byEdit)) {
    const sampled = byEdit[edit].slice(0, SAMPLES_PER_EDIT);
    process.stdout.write(`  ${edit.padEnd(26)} `);
    const chunks = [];
    for (const f of sampled) {
      const thumb = thumbLocalPath(f.thumb);
      if (!thumb || !fs.existsSync(thumb)) continue;
      try { chunks.push(decodeImage(thumb)); } catch {}
    }
    if (!chunks.length) { console.log('✗'); continue; }
    const palette = dominantColours(Buffer.concat(chunks), TOP_N);
    colours[edit] = palette;
    console.log(palette.join(' '));
  }

  fs.writeFileSync(outPath + '.tmp', JSON.stringify({
    generated: new Date().toISOString(),
    colors: colours,
  }, null, 2));
  fs.renameSync(outPath + '.tmp', outPath);
  console.log(`\n✅ public/edit-colors.json updated (${Object.keys(colours).length} edits)`);
}

main();
