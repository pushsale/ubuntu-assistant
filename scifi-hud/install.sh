#!/usr/bin/env bash
# Cài Sci-Fi HUD vào thư mục extension của user và bật nó.
# Dùng: ./install.sh [theme]     theme: orbital | card | tactical | terminal
set -euo pipefail

UUID="scifi-hud@ubuntu-assistant"
SRC="$(cd "$(dirname "$0")" && pwd)/$UUID"
DEST="$HOME/.local/share/gnome-shell/extensions/$UUID"

mkdir -p "$DEST"
cp "$SRC"/{metadata.json,extension.js,core.js,sensors.js,hud.js,animator.js} "$DEST"/
# giữ config.json đã chỉnh trước đó, chỉ chép nếu chưa có
[ -f "$DEST/config.json" ] || cp "$SRC/config.json" "$DEST/"

if [ $# -ge 1 ]; then
    python3 - "$DEST/config.json" "$1" <<'PY'
import json, sys
path, theme = sys.argv[1], sys.argv[2]
cfg = json.load(open(path))
cfg["theme"] = theme
json.dump(cfg, open(path, "w"), indent=2)
PY
fi

# Bật extension. Trên Wayland, shell đang chạy chưa biết extension mới
# cho tới phiên đăng nhập sau, nên ghi thẳng vào danh sách enabled.
if gnome-extensions info "$UUID" >/dev/null 2>&1; then
    # Shell đã biết extension: tắt/bật để nạp lại core.js bản mới (không cần đăng xuất,
    # trừ lần đầu chuyển sang bản có file khởi động mỏng)
    # Shell tắt extension bất đồng bộ; nếu bật lại khi chưa tắt xong thì lệnh bật bị bỏ qua
    # (extension nằm lại ở trạng thái INACTIVE), nên phải chờ tắt hẳn rồi mới bật.
    state() { gnome-extensions info "$UUID" 2>/dev/null | awk '/State:/{print $2}'; }
    gnome-extensions disable "$UUID" 2>/dev/null || true
    for _ in $(seq 50); do [ "$(state)" = "INACTIVE" ] && break; sleep 0.1; done
    gnome-extensions enable "$UUID"
    for _ in $(seq 50); do [ "$(state)" = "ACTIVE" ] && break; sleep 0.1; done
    [ "$(state)" = "ACTIVE" ] || echo "Cảnh báo: $UUID chưa ACTIVE (trạng thái: $(state))." >&2
    echo "Đã nạp lại $UUID."
else
    current=$(gsettings get org.gnome.shell enabled-extensions)
    if [[ "$current" != *"$UUID"* ]]; then
        if [[ "$current" == "@as []" || "$current" == "[]" ]]; then
            gsettings set org.gnome.shell enabled-extensions "['$UUID']"
        else
            gsettings set org.gnome.shell enabled-extensions "${current%]*}, '$UUID']"
        fi
    fi
    echo "Đã cài $UUID. Đăng xuất rồi đăng nhập lại để HUD xuất hiện."
fi
echo "Theme hiện tại: $(python3 -c "import json;print(json.load(open('$DEST/config.json'))['theme'])")"
