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
#   7. Commit data.js (only) with a project-specific message and push.
#   8. Print the live URL.
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
PROJECT="${1:-}"
DRY_RUN=false
for arg in "$@"; do
  if [ "$arg" = "--dry-run" ]; then DRY_RUN=true; fi
done

if [ -z "$PROJECT" ] || [ "$PROJECT" = "--dry-run" ]; then
  echo -e "${BLUE}Portfolio Publish Assistant${NC}"
  echo -e "Usage: $0 \"Project Name\" [--dry-run]"
  echo ""
  read -r -p "Project name (folder name on disk): " PROJECT
  if [ -z "$PROJECT" ]; then
    echo -e "${RED}No project name given.${NC}"; exit 1
  fi
fi

cd "$REPO_DIR"
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
  node_modules|dist|public|src|tests|test-results|functions|icons|playwright-report|.git|.github|.vite)
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
  if ! grep -q "\"$PROJECT\"" data.js; then
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

# Files we actually serve: skip _compressed variants, dotfiles. _web.mp4 are kept.
UPLOAD_FILES=()
while IFS= read -r -d '' f; do
  name=$(basename "$f")
  case "$name" in
    .*) continue ;;
    *_compressed.*) continue ;;
  esac
  UPLOAD_FILES+=("$f")
done < <(find "$PROJECT_DIR" -type f -print0)

echo -e "  ${#UPLOAD_FILES[@]} file(s) to upload."

if $DRY_RUN; then
  for f in "${UPLOAD_FILES[@]}"; do
    rel="${f#$REPO_DIR/}"
    echo -e "  ${DIM}→ would upload: $rel${NC}"
  done
else
  for f in "${UPLOAD_FILES[@]}"; do
    rel="${f#$REPO_DIR/}"
    echo -e "  ${DIM}→ $rel${NC}"
    npx --yes wrangler r2 object put "${R2_BUCKET}/${rel}" --file="$f" --remote >/dev/null
  done
  echo -e "${GREEN}✓ Uploaded ${#UPLOAD_FILES[@]} file(s)${NC}"
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
# 7. Commit + push (only data.js)
# ─────────────────────────────────────────────────────────────────────
echo ""
echo -e "${YELLOW}[7/7] Publishing to Git…${NC}"
if $DRY_RUN; then
  echo -e "${DIM}  (skipped in dry-run)${NC}"
else
  if git diff --quiet data.js; then
    echo -e "${DIM}  data.js unchanged — nothing to commit.${NC}"
  else
    git add data.js
    git commit -m "Publish: ${PROJECT}"
    git push
    echo -e "${GREEN}✓ Pushed to GitHub${NC}"
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
  echo -e "  Live in ~1 min: ${LIVE_URL}"
fi
echo -e "========================================${NC}"
