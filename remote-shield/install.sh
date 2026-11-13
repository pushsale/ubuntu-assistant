#!/usr/bin/env bash
# Cài Remote Shield cho user đang đăng nhập (dùng được cả trong thư mục mã nguồn lẫn gói đã đóng).
#
#   ./install.sh                  cài Remote Shield
#   ./install.sh --rdp            cài + bật Desktop Sharing (RDP vào phiên đang mở)
#   ./install.sh --remote-login   cài + bật Remote Login (RDP khi máy chưa đăng nhập, cần sudo)
#   ./install.sh --force          cài cả khi GNOME Shell khác phiên bản đã thử
#
# Có hiệu lực đầy đủ từ lần đăng nhập sau. Gỡ: ./uninstall.sh
set -euo pipefail
cd "$(dirname "$0")"

UUID="remote-shield@ubuntu-assistant"
EXT_DEST="$HOME/.local/share/gnome-shell/extensions/$UUID"
LIBDIR="$HOME/.local/lib/remote-shield"          # không có dấu cách (LD_PRELOAD tách theo dấu cách)
UNITDIR="$HOME/.config/systemd/user"
DROPIN="$UNITDIR/org.gnome.Shell@.service.d"     # áp dụng cho mọi phiên GNOME Shell của user (@ubuntu, @wayland)
OLD_DROPIN="$UNITDIR/org.gnome.Shell@ubuntu.service.d"
RUN_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}/remote-shield"

die()  { echo "Lỗi: $*" >&2; exit 1; }
warn() { echo "Cảnh báo: $*" >&2; }
step() { echo; echo "== $*"; }

WANT_RDP=0; WANT_LOGIN=0; FORCE=0
for a in "$@"; do
    case "$a" in
        --rdp) WANT_RDP=1 ;;
        --remote-login) WANT_LOGIN=1 ;;
        --force) FORCE=1 ;;
        -h|--help) sed -n '2,9p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
        *) die "không hiểu tuỳ chọn '$a' (xem ./install.sh --help)" ;;
    esac
done

# ---------- kiểm tra môi trường ----------
step "Kiểm tra máy"
[ "$(id -u)" -ne 0 ] || die "chạy bằng chính user dùng desktop, không chạy bằng sudo (script tự hỏi sudo khi cần)."
command -v gnome-shell >/dev/null || die "máy này không có GNOME Shell."
SHELL_MAJOR=$(gnome-shell --version | grep -oE '[0-9]+' | head -1)
SUPPORTED=$(python3 -c "import json,sys;print(' '.join(json.load(open(sys.argv[1]))['shell-version']))" "$UUID/metadata.json")
PATCH_VERSION=""
if [[ " $SUPPORTED " != *" $SHELL_MAJOR "* ]]; then
    [ "$FORCE" = 1 ] || die "GNOME Shell $SHELL_MAJOR chưa được thử (đã thử: $SUPPORTED). Chạy lại với --force để cài thử, rồi kiểm tra bằng 'shieldctl test'."
    warn "GNOME Shell $SHELL_MAJOR chưa được thử, cài theo --force."
    PATCH_VERSION="$SHELL_MAJOR"
fi
[ "${XDG_SESSION_TYPE:-}" = "wayland" ] || warn "phiên hiện tại không phải Wayland; Remote Shield chỉ hoạt động trên phiên Wayland."
ls /usr/lib/*-linux-gnu/libdrm.so.2 >/dev/null 2>&1 || die "không tìm thấy libdrm.so.2."
if ! dpkg -s gnome-remote-desktop >/dev/null 2>&1; then
    warn "chưa cài gnome-remote-desktop (máy chủ RDP): sudo apt install gnome-remote-desktop"
    [ "$WANT_RDP$WANT_LOGIN" = "00" ] || die "cần gnome-remote-desktop để cấu hình RDP."
fi
echo "GNOME Shell $SHELL_MAJOR, phiên ${XDG_SESSION_TYPE:-?}: OK"

# ---------- thư viện che màn hình (shim) ----------
step "Cài thư viện che màn hình"
SO="shim/build/shield-shim.so"
if command -v gcc >/dev/null && ./shim/build.sh >/dev/null 2>&1; then
    echo "Đã build lại shield-shim.so cho máy này."
elif [ -f "$SO" ]; then
    echo "Dùng bản build sẵn shield-shim.so (không build được trên máy này)."
else
    die "không có bản build sẵn và không build được: sudo apt install gcc"
fi
mkdir -p "$LIBDIR" "$DROPIN" "$HOME/.local/bin"
install -m 0755 "$SO" "$LIBDIR/shield-shim.so.new"
mv -f "$LIBDIR/shield-shim.so.new" "$LIBDIR/shield-shim.so"   # thay nguyên tử, không đụng bản đang nạp
install -m 0755 shim/shieldctl "$HOME/.local/bin/shieldctl"
cat > "$DROPIN/remote-shield.conf" <<EOF
# Thêm bởi Remote Shield. Xoá file này rồi đăng nhập lại để gnome-shell không nạp thư viện nữa.
[Service]
Environment=LD_PRELOAD=$LIBDIR/shield-shim.so
EOF
# bản cài cũ đặt drop-in riêng cho @ubuntu
rm -f "$OLD_DROPIN/remote-shield.conf"; rmdir "$OLD_DROPIN" 2>/dev/null || true
systemctl --user daemon-reload
echo "  thư viện: $LIBDIR/shield-shim.so"
echo "  drop-in : $DROPIN/remote-shield.conf"
echo "  lệnh    : ~/.local/bin/shieldctl"

# ---------- extension ----------
step "Cài extension"
mkdir -p "$EXT_DEST"
cp "$UUID"/{metadata.json,extension.js,core.js,overlay.js} "$EXT_DEST"/
[ -f "$EXT_DEST/config.json" ] || cp "$UUID/config.json" "$EXT_DEST/"   # giữ cấu hình đã chỉnh
if [ -n "$PATCH_VERSION" ]; then
    python3 - "$EXT_DEST/metadata.json" "$PATCH_VERSION" <<'PY'
import json, sys
p, v = sys.argv[1], sys.argv[2]
m = json.load(open(p)); m["shell-version"] = sorted(set(m["shell-version"]) | {v})
json.dump(m, open(p, "w"), indent=2, ensure_ascii=False)
PY
fi
current=$(gsettings get org.gnome.shell enabled-extensions)
if [[ "$current" != *"$UUID"* ]]; then
    if [[ "$current" == "@as []" || "$current" == "[]" ]]; then
        gsettings set org.gnome.shell enabled-extensions "['$UUID']"
    else
        gsettings set org.gnome.shell enabled-extensions "${current%]*}, '$UUID']"
    fi
fi
# Remote Shield che màn hình thật và dồn cửa sổ về màn chính: người remote phải xem đúng màn chính.
gsettings set org.gnome.desktop.remote-desktop.rdp screen-share-mode 'mirror-primary' 2>/dev/null || true
echo "  $EXT_DEST"

# Shell đang chạy đã biết extension (máy đã cài trước đó): nạp lại để chạy code mới ngay.
# Không nạp lại khi đang có phiên remote: tắt extension sẽ mở rèm và khóa máy.
state() { gnome-extensions info "$UUID" 2>/dev/null | awk '/State:/{print $2}'; }
FIRST_INSTALL=1
if [ -e "$RUN_DIR/blank" ]; then
    echo "Đang có phiên remote: chưa nạp lại extension, chạy lại install.sh sau khi ngắt kết nối."
    FIRST_INSTALL=0
elif [ "$(state)" = "ACTIVE" ]; then
    gnome-extensions disable "$UUID"
    for _ in $(seq 50); do [ "$(state)" = "INACTIVE" ] && break; sleep 0.1; done
    gnome-extensions enable "$UUID"
    for _ in $(seq 50); do [ "$(state)" = "ACTIVE" ] && break; sleep 0.1; done
    echo "Đã nạp lại extension (trạng thái: $(state))."
    FIRST_INSTALL=0
fi

# ---------- RDP ----------
make_cert() { # $1 = thư mục, $2.. = lệnh chạy openssl (vd sudo -u ...)
    local dir="$1"; shift
    "$@" openssl req -x509 -newkey rsa:4096 -sha256 -days 3650 -nodes -subj "/CN=$(hostname)" \
        -keyout "$dir/rdp-tls.key" -out "$dir/rdp-tls.crt" >/dev/null 2>&1
    "$@" chmod 600 "$dir/rdp-tls.key"
}

if [ "$WANT_RDP" = 1 ]; then
    step "Bật Desktop Sharing (RDP vào phiên đang mở)"
    CERTDIR="$HOME/.local/share/gnome-remote-desktop/certificates"
    mkdir -p "$CERTDIR"
    [ -f "$CERTDIR/rdp-tls.crt" ] && [ -f "$CERTDIR/rdp-tls.key" ] || make_cert "$CERTDIR"
    grdctl rdp set-tls-key "$CERTDIR/rdp-tls.key"
    grdctl rdp set-tls-cert "$CERTDIR/rdp-tls.crt"
    echo "Đặt tài khoản RDP (dùng khi kết nối Desktop Sharing; có thể khác mật khẩu Ubuntu):"
    grdctl rdp set-credentials
    grdctl rdp disable-view-only
    grdctl rdp enable-port-negotiation   # nếu Remote Login đã giữ 3389 thì tự dùng 3390
    grdctl rdp enable
    systemctl --user enable gnome-remote-desktop.service >/dev/null 2>&1 || true
    systemctl --user restart gnome-remote-desktop.service
    echo "Desktop Sharing đã bật."
fi

if [ "$WANT_LOGIN" = 1 ]; then
    step "Bật Remote Login (RDP khi máy chưa đăng nhập; cần quyền sudo)"
    GRD_HOME=$(getent passwd gnome-remote-desktop | cut -d: -f6)
    [ -n "$GRD_HOME" ] || die "không có user hệ thống gnome-remote-desktop."
    sudo -v
    sudo test -f "$GRD_HOME/rdp-tls.crt" || make_cert "$GRD_HOME" sudo -u gnome-remote-desktop
    sudo grdctl --system rdp set-tls-key "$GRD_HOME/rdp-tls.key"
    sudo grdctl --system rdp set-tls-cert "$GRD_HOME/rdp-tls.crt"
    echo "Đặt tài khoản Remote Login (bước 1 khi kết nối; sau đó là màn đăng nhập Ubuntu):"
    sudo grdctl --system rdp set-credentials
    sudo grdctl --system rdp enable
    sudo systemctl enable --now gnome-remote-desktop.service
    sudo systemctl restart gnome-remote-desktop.service
    echo "Remote Login đã bật."
fi

# ---------- tổng kết ----------
step "Xong"
if [ "$FIRST_INSTALL" = 1 ]; then
    echo "Đăng xuất rồi đăng nhập lại để GNOME nạp Remote Shield."
else
    echo "Nếu thư viện shield-shim vừa thay đổi: đăng xuất rồi đăng nhập lại để có hiệu lực."
fi
echo "Sau khi đăng nhập lại, kiểm tra màn che tại chỗ: shieldctl test 10"
echo "Gỡ khẩn cấp từ TTY (Ctrl+Alt+F3): rm $DROPIN/remote-shield.conf"
