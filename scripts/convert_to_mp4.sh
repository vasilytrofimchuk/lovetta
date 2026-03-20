#!/bin/bash
# Convert all WebM video banners to MP4
# Usage: ./scripts/convert_to_mp4.sh [input.webm]
# If no argument, converts all .webm files in current directory

if [ -n "$1" ]; then
  FILES="$1"
else
  FILES=$(ls *.webm 2>/dev/null)
  if [ -z "$FILES" ]; then
    echo "No .webm files found in current directory"
    exit 1
  fi
fi

for f in $FILES; do
  out="${f%.webm}.mp4"
  echo "Converting: $f -> $out"
  ffmpeg -y -i "$f" -c:v libx264 -pix_fmt yuv420p -preset fast -crf 23 "$out" 2>/dev/null
  if [ $? -eq 0 ]; then
    echo "  Done: $out ($(du -h "$out" | cut -f1))"
  else
    echo "  FAILED (is ffmpeg installed?)"
  fi
done
