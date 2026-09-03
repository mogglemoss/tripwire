#!/bin/sh
# Copy private brand packs into public/brands/ from a sibling checkout.
#
#   scripts/brands-sync.sh [path-to-private-packs]    default: ../tripwire-brands
#
# public/brands/ is git-ignored except for the packs this repo ships
# (tripwire, example), so a corp's own pack can live in a private repo and
# be dropped in at deploy time without ever entering the public history.
set -e
SRC="${1:-$(dirname "$0")/../../tripwire-brands}"
DST="$(dirname "$0")/../public/brands"
[ -d "$SRC" ] || { echo "no private packs at $SRC" >&2; exit 1; }
for d in "$SRC"/*/; do
  name="$(basename "$d")"
  [ -f "$d/brand.json" ] || continue
  mkdir -p "$DST/$name"
  rsync -a --delete --exclude .git "$d" "$DST/$name/"
  echo "synced $name"
done
