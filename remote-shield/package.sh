#!/usr/bin/env bash
# Đóng gói Remote Shield thành dist/remote-shield-<phiên bản>.tar.gz để cài lên máy Ubuntu khác.
# Gói chứa sẵn shield-shim.so đã build; máy đích có gcc thì install.sh tự build lại cho khớp.
set -euo pipefail
cd "$(dirname "$0")"

UUID="remote-shield@ubuntu-assistant"
VERSION=$(python3 -c "import json;print(json.load(open('$UUID/metadata.json'))['version-name'])")
NAME="remote-shield-$VERSION"
OUT="dist/$NAME"

./shim/build.sh >/dev/null
rm -rf "$OUT" "dist/$NAME.tar.gz"
mkdir -p "$OUT/$UUID" "$OUT/shim/build"

install -m 0755 install.sh uninstall.sh "$OUT"/
install -m 0644 packaging/README.txt "$OUT"/README.txt
install -m 0644 "$UUID"/{metadata.json,extension.js,core.js,overlay.js,config.json} "$OUT/$UUID"/
install -m 0644 shim/shield-shim.c "$OUT/shim"/
install -m 0755 shim/build.sh shim/shieldctl "$OUT/shim"/
install -m 0755 shim/build/shield-shim.so "$OUT/shim/build"/

tar -C dist --owner=0 --group=0 -czf "dist/$NAME.tar.gz" "$NAME"
rm -rf "$OUT"
echo "Đã đóng gói: $(pwd)/dist/$NAME.tar.gz ($(du -h "dist/$NAME.tar.gz" | cut -f1))"
