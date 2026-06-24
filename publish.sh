#!/bin/bash
#
# Portfolio Publish Assistant
#
# Usage:
#   ./publish.sh "Project Name"           # full publish flow
#   ./publish.sh "Project Name" --dry-run # show what would happen, change nothing
#
# What this does, in order:
#   1. Validate the local project folder exists and has files.
#   2. Show a summary (files, sizes, what will be compressed/uploaded).
#   3. Compress videos in that folder only (creates _web.mp4 variants).
#   4. Run sync to regenerate data.js, verify the project appeared.
#   5. Upload the project folder to R2 (bucket: tomin-media) via wrangler.
#   6. Verify R2 contains the expected files.
#   7. Refresh Journal game assets (frames, clips, dominant colours).
#      Output lands in public/ → bundled into dist/ at build time.
#  7b. Migrate any new videos into Cloudflare Stream (adaptive HLS) and
#      refresh public/stream-map.json. Skipped if Stream creds aren't set.
#   8. Commit data.js + stream-map.json with a project message and push.
#   9. Build + deploy to Cloudflare via wrangler.
#  10. Print the live URL.
#
# Requires:
#   ffmpeg, npx (wrangler is invoked via npx — first run pulls it).
#   Cloudflare login: `npx wrangler login` (one-time, opens browser).

set -euo pipefail

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
DIM='\033[2m'
NC='\033[0m'

R2_BUCKET="tomin-media"
LIVE_URL="https://shouli.de"
REPO_DIR="$(cd "$(dirname "$0")" && pwd)"

# ─────────────────────────────────────────────────────────────────────
# Args
# ─────────────────────────────────────────────────────────────────────
PROJECT=""
DRY_RUN=false
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    *) [ -z "$PROJECT" ] && PROJECT="$arg" ;;
  esac
done

cd "$REPO_DIR"

# ─────────────────────────────────────────────────────────────────────
# Build the list of publishable units:
#   - every top-level folder that isn't in sync.cjs's EXCLUDED_FOLDERS
#   - every magazine subfolder under "TOMIN INDEX.TXT/" (each is its
#     own publishable unit per sync.cjs's special handling)
# ─────────────────────────────────────────────────────────────────────
EXCLUDED="node_modules dist public src tests test-results functions icons playwright-report .git .github .vite migrations .cache .wrangler .husky .claude"
list_publishable() {
  local entry name
  for entry in "$REPO_DIR"/*/; do
    name=$(basename "$entry")
    case " $EXCLUDED " in *" $name "*) continue ;; esac
    if [ "$name" = "TOMIN INDEX.TXT" ]; then
      local sub
      for sub in "$entry"*/; do
        [ -d "$sub" ] || continue
        echo "TOMIN INDEX.TXT/$(basename "$sub")"
      done
    else
      echo "$name"
    fi
  done
}

# Interactive arrow-key picker. Falls back to numbered menu if not on a TTY.
pick_project() {
  local options=()
  while IFS= read -r line; do options+=("$line"); done < <(list_publishable)
  if [ ${#options[@]} -eq 0 ]; then
    echo -e "${RED}No publishable folders found in $REPO_DIR.${NC}" >&2
    exit 1
  fi

  if command -v fzf >/dev/null 2>&1; then
    PROJECT=$(printf '%s\n' "${options[@]}" | fzf --prompt="Pick project › " --height=40% --reverse) || exit 130
    return
  fi

  if [ ! -t 0 ] || [ ! -t 1 ]; then
    echo -e "${RED}No TTY — pass the project name as an argument.${NC}" >&2
    exit 1
  fi

  # Pure-bash arrow-key picker.
  local idx=0 key
  tput civis 2>/dev/null || true
  trap 'tput cnorm 2>/dev/null || true' EXIT
  while true; do
    echo -e "${BLUE}Pick project (↑/↓, Enter to confirm, q to quit):${NC}" >&2
    local i
    for i in "${!options[@]}"; do
      if [ "$i" -eq "$idx" ]; then
        echo -e "  ${GREEN}▸ ${options[$i]}${NC}" >&2
      else
        echo -e "    ${options[$i]}" >&2
      fi
    done
    IFS= read -rsn1 key
    if [ "$key" = $'\x1b' ]; then
      read -rsn2 key
      case "$key" in
        '[A') ((idx > 0)) && ((idx--)) ;;
        '[B') ((idx < ${#options[@]} - 1)) && ((idx++)) ;;
      esac
    elif [ "$key" = "" ]; then
      PROJECT="${options[$idx]}"; break
    elif [ "$key" = "q" ]; then
      tput cnorm 2>/dev/null || true; exit 130
    fi
    # Redraw: move cursor up by header (1) + option count
    tput cuu $((${#options[@]} + 1)) 2>/dev/null || true
    tput ed 2>/dev/null || true
  done
  tput cnorm 2>/dev/null || true
}

if [ -z "$PROJECT" ]; then
  pick_project
fi

PROJECT_DIR="$REPO_DIR/$PROJECT"

clear
echo -e "${BLUE}========================================"
echo -e "  Portfolio Publish: ${PROJECT}"
$DRY_RUN && echo -e "  ${YELLOW}(DRY RUN — no changes will be made)${NC}"
echo -e "========================================${NC}"
echo ""

# ─────────────────────────────────────────────────────────────────────
# 1. Validate folder
# ─────────────────────────────────────────────────────────────────────
echo -e "${YELLOW}[1/7] Validating project folder…${NC}"
if [ ! -d "$PROJECT_DIR" ]; then
  echo -e "${RED}✗ Folder not found: $PROJECT_DIR${NC}"
  echo -e "  Available top-level folders:"
  find "$REPO_DIR" -maxdepth 1 -type d ! -name '.*' ! -path "$REPO_DIR" | sed "s|$REPO_DIR/|    - |" | head -20
  exit 1
fi

# Reject names that sync.cjs ignores
case "$PROJECT" in
  node_modules|dist|public|src|tests|test-results|functions|icons|playwright-report|.git|.github|.vite|migrations|.cache|.wrangler|.husky|.claude)
    echo -e "${RED}✗ '$PROJECT' is in sync.cjs's EXCLUDED_FOLDERS — it will never appear on the site.${NC}"
    exit 1
    ;;
esac

FILE_COUNT=$(find "$PROJECT_DIR" -type f ! -name '.*' | wc -l | tr -d ' ')
if [ "$FILE_COUNT" -eq 0 ]; then
  echo -e "${RED}✗ Folder is empty.${NC}"; exit 1
fi
echo -e "${GREEN}✓ ${FILE_COUNT} file(s) in $PROJECT/${NC}"

# ─────────────────────────────────────────────────────────────────────
# 2. Summary
# ─────────────────────────────────────────────────────────────────────
echo ""
echo -e "${YELLOW}[2/7] Summary${NC}"

VIDEOS_TO_COMPRESS=()
while IFS= read -r -d '' f; do
  base="${f%.mp4}"
  if [ ! -f "${base}_web.mp4" ]; then
    VIDEOS_TO_COMPRESS+=("$f")
  fi
done < <(find "$PROJECT_DIR" -name "*.mp4" ! -name "*_web.mp4" -print0)

TOTAL_SIZE=$(du -sh "$PROJECT_DIR" | cut -f1)
echo -e "  Folder size:           ${TOTAL_SIZE}"
echo -e "  Videos to compress:    ${#VIDEOS_TO_COMPRESS[@]}"
echo -e "  R2 bucket:             ${R2_BUCKET}/${PROJECT}/"
echo ""

if [ ! "$DRY_RUN" = true ]; then
  read -r -p "Proceed? (y/n): " GO
  if [ "$GO" != "y" ]; then echo "Aborted."; exit 0; fi
fi

# ─────────────────────────────────────────────────────────────────────
# 3. Compress (only this project)
# ─────────────────────────────────────────────────────────────────────
echo ""
echo -e "${YELLOW}[3/7] Compressing videos…${NC}"
if [ ${#VIDEOS_TO_COMPRESS[@]} -eq 0 ]; then
  echo -e "${DIM}  Nothing to compress.${NC}"
else
  for f in "${VIDEOS_TO_COMPRESS[@]}"; do
    base="${f%.mp4}"
    out="${base}_web.mp4"
    echo -e "  ${DIM}→ $(basename "$f")${NC}"
    if $DRY_RUN; then continue; fi
    ffmpeg -i "$f" -c:v libx264 -crf 20 -preset slow \
      -vf "scale='min(1920,iw)':-2" -c:a aac -b:a 192k \
      -movflags +faststart -y "$out" 2>/dev/null

    orig_bytes=$(stat -f%z "$f")
    new_bytes=$(stat -f%z "$out")
    if [ "$new_bytes" -ge "$orig_bytes" ]; then
      echo -e "    ${DIM}(compressed bigger than original — discarded)${NC}"
      rm "$out"
    else
      savings=$(echo "scale=0; (($orig_bytes - $new_bytes) * 100 / $orig_bytes)" | bc)
      echo -e "    ${GREEN}saved ~${savings}%${NC}"
    fi
  done
fi

# ─────────────────────────────────────────────────────────────────────
# 4. Sync data.js + verify
# ─────────────────────────────────────────────────────────────────────
echo ""
echo -e "${YELLOW}[4/7] Updating data.js…${NC}"
if $DRY_RUN; then
  echo -e "${DIM}  (skipped in dry-run)${NC}"
else
  npm run sync --silent
  # Normalize both sides to NFC before comparing — macOS stores filenames as
  # NFD ("e" + combining accent), terminal input is NFC ("é"). They look
  # identical but byte-compare as different.
  if ! node -e '
    const fs = require("fs");
    const needle = process.argv[1].normalize("NFC");
    const hay = fs.readFileSync("data.js", "utf8").normalize("NFC");
    process.exit(hay.includes(`"${needle}"`) ? 0 : 1);
  ' "$PROJECT"; then
    echo -e "${RED}✗ '$PROJECT' did not appear in data.js after sync.${NC}"
    echo -e "  Check the folder name — sync.cjs might have skipped it."
    exit 1
  fi
  echo -e "${GREEN}✓ '$PROJECT' is in data.js${NC}"
fi

# ─────────────────────────────────────────────────────────────────────
# 5. R2 upload
# ─────────────────────────────────────────────────────────────────────
echo ""
echo -e "${YELLOW}[5/7] Uploading to R2 (${R2_BUCKET})…${NC}"

# Files we actually serve: skip _compressed variants, dotfiles, and video
# originals when a sibling _web variant exists (sync.cjs prefers _web for
# playback, so the original would just bloat R2).
UPLOAD_FILES=()
while IFS= read -r -d '' f; do
  name=$(basename "$f")
  case "$name" in
    .*) continue ;;
    *_compressed.*) continue ;;
  esac
  case "$name" in
    *.mp4|*.mov|*.webm|*.mkv)
      dir=$(dirname "$f")
      ext="${name##*.}"
      base="${name%.*}"
      # Skip the original if it's not already a _web file AND a _web sibling exists.
      if [[ "$base" != *_web ]] && [ -f "$dir/${base}_web.${ext}" ]; then
        continue
      fi
      ;;
  esac
  UPLOAD_FILES+=("$f")
done < <(find "$PROJECT_DIR" -type f -print0)

TOTAL_BYTES=0
for f in "${UPLOAD_FILES[@]}"; do
  TOTAL_BYTES=$((TOTAL_BYTES + $(stat -f%z "$f")))
done
TOTAL_HUMAN=$(numfmt --to=iec-i --suffix=B --format='%.1f' "$TOTAL_BYTES" 2>/dev/null || echo "${TOTAL_BYTES}B")
echo -e "  ${#UPLOAD_FILES[@]} file(s), ${TOTAL_HUMAN} total."

if $DRY_RUN; then
  for f in "${UPLOAD_FILES[@]}"; do
    rel="${f#$REPO_DIR/}"
    sz=$(numfmt --to=iec-i --suffix=B --format='%.1f' "$(stat -f%z "$f")" 2>/dev/null || stat -f%z "$f")
    echo -e "  ${DIM}→ would upload: $rel (${sz})${NC}"
  done
else
  PARALLEL="${R2_PARALLEL:-4}"
  echo -e "  ${DIM}Uploading up to ${PARALLEL} files in parallel…${NC}"
  START_TS=$(date +%s)
  TOTAL=${#UPLOAD_FILES[@]}

  # Worker function: upload one file, print a counter line on completion.
  # Counter is incremented atomically via a flock-protected file so parallel
  # workers don't clobber each other's writes.
  COUNTER_FILE=$(mktemp -t r2pub.XXXXXX)
  echo 0 > "$COUNTER_FILE"
  export R2_BUCKET REPO_DIR COUNTER_FILE TOTAL DIM GREEN RED NC

  printf '%s\0' "${UPLOAD_FILES[@]}" | \
    xargs -0 -P "$PARALLEL" -I {} bash -c '
      f="$1"
      rel="${f#$REPO_DIR/}"
      sz=$(numfmt --to=iec-i --suffix=B --format="%.1f" "$(stat -f%z "$f")" 2>/dev/null || stat -f%z "$f")
      if npx --yes wrangler r2 object put "${R2_BUCKET}/${rel}" --file="$f" --remote >/dev/null 2>&1; then
        # Atomic increment + print under flock so output stays clean.
        (
          flock 9
          n=$(($(cat "$COUNTER_FILE") + 1))
          echo "$n" > "$COUNTER_FILE"
          printf "  [%d/%d] ✓ %s (%s)\n" "$n" "$TOTAL" "$rel" "$sz"
        ) 9>>"$COUNTER_FILE.lock"
      else
        ( flock 9; printf "  ✗ FAILED %s\n" "$rel" ) 9>>"$COUNTER_FILE.lock"
        exit 1
      fi
    ' _ {}

  RC=$?
  rm -f "$COUNTER_FILE" "$COUNTER_FILE.lock"
  ELAPSED=$(($(date +%s) - START_TS))
  if [ "$RC" -ne 0 ]; then
    echo -e "${RED}✗ One or more uploads failed.${NC}"
    exit 1
  fi
  echo -e "${GREEN}✓ Uploaded ${TOTAL} file(s) in ${ELAPSED}s${NC}"
fi

# ─────────────────────────────────────────────────────────────────────
# 6. Verify R2
# ─────────────────────────────────────────────────────────────────────
echo ""
echo -e "${YELLOW}[6/7] Verifying R2 contents…${NC}"
if $DRY_RUN; then
  echo -e "${DIM}  (skipped in dry-run)${NC}"
else
  REMOTE_COUNT=$(npx --yes wrangler r2 object list "${R2_BUCKET}" --prefix="${PROJECT}/" --remote 2>/dev/null | grep -c "^${PROJECT}/" || true)
  echo -e "  Remote files under ${PROJECT}/: ${REMOTE_COUNT}"
  if [ "$REMOTE_COUNT" -lt "${#UPLOAD_FILES[@]}" ]; then
    echo -e "${RED}✗ Expected ${#UPLOAD_FILES[@]}, found ${REMOTE_COUNT} on R2.${NC}"
    echo -e "  Continuing anyway — re-run if you suspect missing files."
  else
    echo -e "${GREEN}✓ All files present on R2${NC}"
  fi
fi

# ─────────────────────────────────────────────────────────────────────
# 7. Journal game assets — frames + clips + dominant colour palettes.
#    All three scripts are incremental: unchanged videos are skipped so
#    re-running per publish only does work where the source changed.
#    Output goes to public/frames/, public/clips/, public/frames-pool.json,
#    public/edit-colors.json — Vite bundles these into dist/ next step.
# ─────────────────────────────────────────────────────────────────────
echo ""
echo -e "${YELLOW}[7/10] Refreshing Journal game assets…${NC}"
if $DRY_RUN; then
  echo -e "${DIM}  (skipped in dry-run)${NC}"
else
  echo -e "${DIM}  • extract-frames${NC}"
  npm run extract-frames --silent >/dev/null
  echo -e "${DIM}  • extract-clips${NC}"
  npm run extract-clips  --silent >/dev/null
  echo -e "${DIM}  • extract-colors${NC}"
  npm run extract-colors --silent >/dev/null
  echo -e "${GREEN}✓ Game assets refreshed${NC}"
fi

# ─────────────────────────────────────────────────────────────────────
# 7b. Migrate any new videos into Cloudflare Stream (adaptive HLS) and
#     refresh public/stream-map.json. Idempotent — already-migrated videos
#     are skipped. Needs CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_STREAM_TOKEN;
#     skipped with a warning if absent, so a publish never fails over Stream.
# ─────────────────────────────────────────────────────────────────────
echo ""
echo -e "${YELLOW}[7b/10] Migrating new videos to Cloudflare Stream…${NC}"
if $DRY_RUN; then
  echo -e "${DIM}  (skipped in dry-run)${NC}"
elif [ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ] || [ -z "${CLOUDFLARE_STREAM_TOKEN:-}" ]; then
  echo -e "${YELLOW}  ⚠ Stream creds not set (CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_STREAM_TOKEN) — skipping.${NC}"
  echo -e "${DIM}    New videos play as raw MP4 until you run: npm run migrate-videos${NC}"
elif npm run migrate-videos; then
  echo -e "${GREEN}✓ Stream up to date${NC}"
else
  echo -e "${YELLOW}  ⚠ Stream migration had an issue — new videos fall back to raw MP4. Re-run: npm run migrate-videos${NC}"
fi

# ─────────────────────────────────────────────────────────────────────
# 8. Commit + push (data.js + frames-pool.json + edit-colors.json + stream-map.json — the
#    manifests only; the actual frame / clip binaries stay out of git
#    via .gitignore and are deployed via wrangler from public/).
# ─────────────────────────────────────────────────────────────────────
echo ""
echo -e "${YELLOW}[8/10] Publishing to Git…${NC}"
if $DRY_RUN; then
  echo -e "${DIM}  (skipped in dry-run)${NC}"
else
  MANIFESTS=(data.js public/frames-pool.json public/edit-colors.json public/stream-map.json)
  if git diff --quiet -- "${MANIFESTS[@]}"; then
    echo -e "${DIM}  Manifests unchanged — nothing to commit.${NC}"
  else
    git add "${MANIFESTS[@]}"
    git commit -m "Publish: ${PROJECT}"
    git push
    echo -e "${GREEN}✓ Pushed to GitHub${NC}"
  fi
fi

# ─────────────────────────────────────────────────────────────────────
# 9. Deploy to Cloudflare (Workers Static Assets — frames/clips/manifests
#    land in dist/ via vite build and ship in the same atomic deploy).
# ─────────────────────────────────────────────────────────────────────
echo ""
echo -e "${YELLOW}[9/10] Deploying to Cloudflare…${NC}"
if $DRY_RUN; then
  echo -e "${DIM}  (skipped in dry-run)${NC}"
else
  if npm run deploy 2>&1 | tail -3; then
    echo -e "${GREEN}✓ Deployed${NC}"
  else
    echo -e "${RED}✗ Deploy failed — check output above${NC}"
    exit 1
  fi
fi

# ─────────────────────────────────────────────────────────────────────
# Done
# ─────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}========================================"
if $DRY_RUN; then
  echo -e "  Dry-run complete. No changes made."
else
  echo -e "  ✓ ${PROJECT} published"
  echo -e "  Live: ${LIVE_URL}"
fi
echo -e "========================================${NC}"
