#!/usr/bin/env bash
# Cài System HUD vào thư mục extension của user và bật nó.
# Dùng: ./install.sh [theme]     theme: orbital | orbitalLight | card | tactical | terminal
set -euo pipefail

UUID="system-hud@ubuntu-assistant"
SRC="$(cd "$(dirname "$0")" && pwd)/$UUID"
DEST="$HOME/.local/share/gnome-shell/extensions/$UUID"
EXT_ROOT="$HOME/.local/share/gnome-shell/extensions"

# Đổi tên 2026-11-13: Sci-Fi HUD (scifi-hud@ubuntu-assistant) -> System HUD. Mang cấu hình cũ sang.
# Bản cũ vẫn chạy trong bộ nhớ tới khi đăng xuất (trên Wayland shell chưa nạp được UUID mới),
# nên chỉ gỡ nó (khỏi danh sách bật và xoá thư mục) khi bản mới đã ACTIVE (xem cuối file).
# Không được xoá thư mục cũ sớm: GNOME có thể tắt/bật lại bản cũ bất cứ lúc nào (vd. khi một extension
# đứng trước nó trong danh sách bị tắt) và lúc đó bản cũ không còn file để nạp -> HUD biến mất.
OLD_UUID="scifi-hud@ubuntu-assistant"
mkdir -p "$DEST"
if [ -d "$EXT_ROOT/$OLD_UUID" ] && [ ! -f "$DEST/config.json" ]; then
    cp "$EXT_ROOT/$OLD_UUID/config.json" "$DEST/" 2>/dev/null || true
    echo "Đã chuyển cấu hình từ $OLD_UUID sang $UUID."
fi
drop_old_uuid() {
    local current new
    current=$(gsettings get org.gnome.shell enabled-extensions)
    if [[ "$current" == *"$OLD_UUID"* ]]; then
        new=$(python3 -c "import ast,sys; print(str([x for x in ast.literal_eval(sys.argv[1].replace('@as ','')) if x!=sys.argv[2]]))" "$current" "$OLD_UUID")
        gsettings set org.gnome.shell enabled-extensions "$new"
    fi
    if [ -d "$EXT_ROOT/$OLD_UUID" ]; then
        rm -rf "${EXT_ROOT:?}/$OLD_UUID"
        echo "Đã gỡ bản tên cũ $OLD_UUID."
    fi
}

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
    [ "$(state)" = "ACTIVE" ] && drop_old_uuid
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
    if [[ "$(gsettings get org.gnome.shell enabled-extensions)" == *"$OLD_UUID"* ]]; then
        echo "HUD tên cũ vẫn chạy tới khi đăng xuất. Sau khi đăng nhập lại, chạy ./install.sh lần nữa để dọn tên cũ."
    fi
fi
echo "Theme hiện tại: $(python3 -c "import json;print(json.load(open('$DEST/config.json'))['theme'])")"
