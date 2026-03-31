#!/bin/bash
# Compress all videos for web delivery
# Creates _web.mp4 versions alongside originals
# CRF 20 = high quality, barely visible difference

cd "/Volumes/T7/tomin.world"

# Use find with null delimiter to handle spaces in filenames
while IFS= read -r -d $'\0' file; do
  dir=$(dirname "$file")
  base=$(basename "$file" .mp4)
  output="${dir}/${base}_web.mp4"

  # Skip if already compressed
  if [ -f "$output" ]; then
    echo "SKIP: already exists — $output"
    continue
  fi

  echo ""
  echo "========================================"
  echo "Compressing: $file"

  orig_size=$(du -sh "$file" | cut -f1)
  echo "Original: $orig_size"

  ffmpeg -i "$file" \
    -c:v libx264 \
    -crf 20 \
    -preset slow \
    -vf "scale='min(1920,iw)':-2" \
    -c:a aac -b:a 192k \
    -movflags +faststart \
    -y \
    "$output" 2>/dev/null

  if [ $? -eq 0 ]; then
    new_size=$(du -sh "$output" | cut -f1)
    orig_bytes=$(stat -f%z "$file")
    new_bytes=$(stat -f%z "$output")
    echo "Compressed: $new_size"

    # If compressed is bigger than original, delete it and skip
    if [ "$new_bytes" -ge "$orig_bytes" ]; then
      echo "⚠️  Compressed is bigger than original — deleting, will use original"
      rm "$output"
    else
      savings=$(echo "scale=0; (($orig_bytes - $new_bytes) * 100 / $orig_bytes)" | bc)
      echo "✅ Saved ~${savings}%"
    fi
  else
    echo "❌ ERROR compressing $file"
    rm -f "$output"
  fi

done < <(find . -name "*.mp4" \
  -not -name "*_web.mp4" \
  -not -path "./.git/*" \
  -not -path "./node_modules/*" \
  -print0)

echo ""
echo "========================================"
echo "All done!"
