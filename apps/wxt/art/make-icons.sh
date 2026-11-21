#!/usr/bin/env bash
# Builds the extension icons (public/icon/16, 32, 48, 96, 128 .png) from the neutral Beta sticker.
# The sticker is placed in the middle of a transparent square, so the icon is not stretched.
set -euo pipefail

cd "$(dirname "$0")/.."
SOURCE="art/beta-poses/neutral.webp"
SIDE=848

for size in 16 32 48 96 128; do
	magick "$SOURCE" -background none -gravity center -extent "${SIDE}x${SIDE}" \
		-filter Lanczos -resize "${size}x${size}" "public/icon/${size}.png"
done
