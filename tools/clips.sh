#!/bin/sh
# The sound clips, twice over: the mp3 as the owner made it, its tags stripped
# losslessly (an ID3 header is one more thing for a decoder to refuse), and an
# AAC copy in an m4a, which is what the App Store build asks for first
# (src/core/audio.js FORMATS). Run after a clip is added or replaced:
#   sh tools/clips.sh            # every clip in public/assets
#   sh tools/clips.sh lasgun1    # one
set -e
cd "$(dirname "$0")/../public/assets"
names="$*"
[ -n "$names" ] || names=$(ls *.mp3 | sed 's/\.mp3$//')
for n in $names; do
  ffmpeg -v error -y -i "$n.mp3" -map_metadata -1 -c:a aac -b:a 128k -movflags +faststart "$n.m4a"
  ffmpeg -v error -y -i "$n.mp3" -map_metadata -1 -id3v2_version 0 -fflags +bitexact -c:a copy "/tmp/$n.clean.mp3"
  mv "/tmp/$n.clean.mp3" "$n.mp3"
  printf '%-12s mp3 %7s  m4a %7s\n' "$n" "$(stat -c %s "$n.mp3")" "$(stat -c %s "$n.m4a")"
done
