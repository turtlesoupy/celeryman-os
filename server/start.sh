#!/bin/sh
set -eu
# A mounted bucket hides the image's directories; create them before using symlinks.
mkdir -p /data/generated /data/profiles /data/voice /data/cache
exec node --import tsx server/production.ts
