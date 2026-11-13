#!/usr/bin/env bash
# Gỡ Remote Shield khỏi user hiện tại. Hiệu lực hoàn toàn sau khi đăng nhập lại.
# Không đụng tới cấu hình RDP (Desktop Sharing / Remote Login): tắt trong Settings > System > Remote Desktop nếu cần.
set -euo pipefail
UUID="remote-shield@ubuntu-assistant"
UNITDIR="$HOME/.config/systemd/user"

gnome-extensions disable "$UUID" 2>/dev/null || true
current=$(gsettings get org.gnome.shell enabled-extensions)
if [[ "$current" == *"$UUID"* ]]; then
    new=$(python3 -c "import ast,sys; l=[x for x in ast.literal_eval(sys.argv[1].replace('@as ','')) if x!=sys.argv[2]]; print(str(l))" "$current" "$UUID")
    gsettings set org.gnome.shell enabled-extensions "$new"
fi
rm -rf "$HOME/.local/share/gnome-shell/extensions/$UUID"

for d in "$UNITDIR/org.gnome.Shell@.service.d" "$UNITDIR/org.gnome.Shell@ubuntu.service.d"; do
    rm -f "$d/remote-shield.conf"
    rmdir "$d" 2>/dev/null || true
done
systemctl --user daemon-reload
rm -f "${XDG_RUNTIME_DIR:-/run/user/$(id -u)}/remote-shield/blank"
rm -f "$HOME/.local/bin/shieldctl"
# Thư viện đang được gnome-shell nạp: xoá file vẫn an toàn (tiến trình giữ bản trong bộ nhớ).
rm -rf "$HOME/.local/lib/remote-shield"

echo "Đã gỡ Remote Shield. Đăng xuất rồi đăng nhập lại để gnome-shell chạy không có thư viện che màn hình."
