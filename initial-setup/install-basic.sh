#!/usr/bin/env bash
# Cài một lượt mọi thứ đơn giản trong danh sách Initial Setup (không cần hỏi gì thêm).
# Chỉ hỏi mật khẩu sudo một lần ở đầu. Chạy lại nhiều lần được: mục đã có thì bỏ qua.
#
#   ./install-basic.sh           kiểm tra và cài
#   ./install-basic.sh --check   chỉ kiểm tra, không cài gì, không cần sudo
#
# Những thứ phức tạp (driver NVIDIA, Remote Shield, Remote Login, LibreOffice khi cần) KHÔNG nằm ở đây:
# Claude xử lý theo initial-setup/packages.md.
# Log: ~/.cache/initial-setup/install-basic.log. Kết thúc in bảng tổng kết giữa hai dòng "=== TỔNG KẾT ===".
set -uo pipefail

CHECK_ONLY=0
[ "${1:-}" = "--check" ] && CHECK_ONLY=1
case "${1:-}" in ""|--check) ;; -h|--help) sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;; *) echo "Không hiểu tuỳ chọn '$1'"; exit 2 ;; esac

[ "$(id -u)" -ne 0 ] || { echo "Chạy bằng user thường (không dùng sudo); script tự hỏi mật khẩu khi cần."; exit 2; }

LOG_DIR="$HOME/.cache/initial-setup"
LOG="$LOG_DIR/install-basic.log"
mkdir -p "$LOG_DIR"
exec > >(tee -a "$LOG") 2>&1
echo; echo "##### $(date '+%F %T') install-basic.sh ${1:-} #####"

ARCH=$(dpkg --print-architecture)          # amd64 / arm64
RESULTS=()                                 # "tên|kết quả|ghi chú"
FAILED=0
note() { RESULTS+=("$1|$2|${3:-}"); [ "$2" = "LỖI" ] && FAILED=1; return 0; }
step() { echo; echo "== $*"; }
have_session() { [ -n "${DBUS_SESSION_BUS_ADDRESS:-}" ] && command -v gsettings >/dev/null; }

# ---------- 1. mạng (tiên quyết) ----------
step "Kiểm tra mạng"
if ping -c1 -W3 1.1.1.1 >/dev/null 2>&1 && getent hosts github.com >/dev/null && \
   curl -fsS --max-time 10 -o /dev/null https://github.com; then
    echo "Mạng OK"; note mang "OK"
else
    echo "Không có Internet hoặc không phân giải được tên miền. Dừng."
    note mang "LỖI" "kiểm tra cáp / Wi-Fi / DNS"
    printf '\n=== TỔNG KẾT ===\n'; printf '%s\n' "${RESULTS[@]}" | column -t -s'|'; printf '=== TỔNG KẾT ===\n'
    exit 1
fi

# ---------- 2. card màn hình (chỉ báo, cài driver để Claude hỏi người dùng) ----------
step "Kiểm tra card màn hình"
GPU=$(lspci | grep -iE 'vga|3d' | sed 's/^[^:]*: //' | head -2 | paste -sd ';' -)
echo "Card: ${GPU:-không thấy}"
if lspci | grep -iE 'vga|3d' | grep -qi nvidia; then
    if nvidia-smi >/dev/null 2>&1; then note card-man-hinh "OK" "NVIDIA, driver độc quyền đang chạy"
    else note card-man-hinh "CẦN XỬ LÝ" "NVIDIA chưa có driver độc quyền: Claude hỏi trước rồi cài"; fi
elif lspci -k | grep -A3 -iE 'vga|3d' | grep -q 'Kernel driver in use'; then
    note card-man-hinh "OK" "$(lspci -k | grep -A3 -iE 'vga|3d' | awk -F': ' '/Kernel driver in use/{print $2; exit}')"
else
    note card-man-hinh "CẦN XỬ LÝ" "không thấy driver đang chạy"
fi
[ "${XDG_SESSION_TYPE:-}" = "wayland" ] || echo "Lưu ý: phiên hiện tại là '${XDG_SESSION_TYPE:-?}', không phải Wayland."

# ---------- sudo một lần ----------
if [ "$CHECK_ONLY" = 0 ]; then
    step "Xin quyền sudo (nhập mật khẩu đăng nhập Ubuntu, gõ không hiện ký tự)"
    sudo -v || { echo "Không có quyền sudo. Dừng."; exit 1; }
    ( while kill -0 $$ 2>/dev/null; do sudo -n true 2>/dev/null; sleep 50; done ) &
fi

# ---------- 3. phím tắt kiểu Windows ----------
step "Phím tắt kiểu Windows"
if ! have_session; then
    note phim-tat "BỎ QUA" "không có phiên desktop (chạy script trong Terminal của máy)"
else
    if [ "$(gsettings get org.gnome.shell.keybindings toggle-overview)" = "['<Super>s']" ]; then
        note super-s-tim-kiem "ĐÃ CÓ"
    elif [ "$CHECK_ONLY" = 1 ]; then note super-s-tim-kiem "CHƯA CÓ"
    else
        old="$(gsettings get org.gnome.shell.keybindings toggle-quick-settings) / $(gsettings get org.gnome.shell.keybindings toggle-overview)"
        gsettings set org.gnome.shell.keybindings toggle-quick-settings "[]" && \
        gsettings set org.gnome.shell.keybindings toggle-overview "['<Super>s']" && \
            note super-s-tim-kiem "ĐÃ CÀI" "cũ: $old" || note super-s-tim-kiem "LỖI"
    fi
    if gsettings list-schemas | grep -qx org.gnome.Ptyxis.Shortcuts; then
        if [ "$(gsettings get org.gnome.Ptyxis.Shortcuts copy-clipboard)" = "'<ctrl>c'" ] && \
           [ "$(gsettings get org.gnome.Ptyxis.Shortcuts paste-clipboard)" = "'<ctrl>v'" ]; then
            note terminal-copy-paste "ĐÃ CÓ"
        elif [ "$CHECK_ONLY" = 1 ]; then note terminal-copy-paste "CHƯA CÓ"
        else
            gsettings set org.gnome.Ptyxis.Shortcuts copy-clipboard "'<ctrl>c'" && \
            gsettings set org.gnome.Ptyxis.Shortcuts paste-clipboard "'<ctrl>v'" && \
                note terminal-copy-paste "ĐÃ CÀI" "Ctrl+C copy, Ctrl+V paste, Ctrl+Shift+C dừng lệnh" || note terminal-copy-paste "LỖI"
        fi
    else
        note terminal-copy-paste "CẦN XỬ LÝ" "không có Ptyxis (Ubuntu cũ dùng GNOME Terminal): đổi trong Preferences → Shortcuts"
    fi
fi

# ---------- 4. gói apt ----------
step "Gói apt"
apt_has() { dpkg -s "$1" >/dev/null 2>&1; }
if [ "$CHECK_ONLY" = 0 ]; then
    # PPA bộ gõ tiếng Việt (nguồn đã duyệt: bamboo-engine/ibus-bamboo)
    if ! apt_has ibus-bamboo && ! grep -rqs "bamboo-engine/ibus-bamboo" /etc/apt/sources.list.d/; then
        sudo add-apt-repository -y ppa:bamboo-engine/ibus-bamboo || note ppa-ibus-bamboo "LỖI" "không thêm được PPA"
    fi
    sudo apt-get update || echo "Cảnh báo: apt-get update có lỗi (xem log phía trên)."
fi
APT_PKGS=(git gcc gnome-remote-desktop remmina remmina-plugin-rdp ibus-bamboo)
for p in "${APT_PKGS[@]}"; do
    if apt_has "$p"; then note "$p" "ĐÃ CÓ"
    elif [ "$CHECK_ONLY" = 1 ]; then note "$p" "CHƯA CÓ"
    elif sudo DEBIAN_FRONTEND=noninteractive apt-get install -y "$p"; then note "$p" "ĐÃ CÀI"
    else note "$p" "LỖI" "apt-get install thất bại"; fi
done

# ---------- 5. bộ gõ Bamboo trong danh sách bộ gõ ----------
step "Thêm bộ gõ Bamboo"
if ! have_session; then note nguon-nhap-bamboo "BỎ QUA" "không có phiên desktop"
else
    cur=$(gsettings get org.gnome.desktop.input-sources sources)
    if grep -q "'ibus', 'Bamboo'" <<<"$cur"; then note nguon-nhap-bamboo "ĐÃ CÓ"
    elif [ "$CHECK_ONLY" = 1 ]; then note nguon-nhap-bamboo "CHƯA CÓ"
    elif ! apt_has ibus-bamboo; then note nguon-nhap-bamboo "LỖI" "chưa cài được ibus-bamboo"
    else
        new=$(python3 -c "import ast,sys; s=sys.argv[1].replace('@a(ss) ',''); l=ast.literal_eval(s) if s.strip() else []; l=list(l)+[('ibus','Bamboo')]; print(str(l))" "$cur") && \
        gsettings set org.gnome.desktop.input-sources sources "$new" && \
            note nguon-nhap-bamboo "ĐÃ CÀI" "cũ: $cur; dùng được đầy đủ sau khi đăng nhập lại" || note nguon-nhap-bamboo "LỖI"
    fi
fi

# ---------- 6. .deb chính thức của hãng ----------
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
step "Google Chrome"
if apt_has google-chrome-stable; then note google-chrome "ĐÃ CÓ"
elif [ "$ARCH" != amd64 ]; then note google-chrome "BỎ QUA" "Google không có bản $ARCH cho Linux"
elif [ "$CHECK_ONLY" = 1 ]; then note google-chrome "CHƯA CÓ"
elif curl -fL --max-time 300 -o "$TMP/chrome.deb" https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb && \
     sudo DEBIAN_FRONTEND=noninteractive apt-get install -y "$TMP/chrome.deb"; then note google-chrome "ĐÃ CÀI"
else note google-chrome "LỖI"; fi

step "RustDesk"
if apt_has rustdesk; then note rustdesk "ĐÃ CÓ" "$(dpkg-query -W -f='${Version}' rustdesk)"
elif [ "$CHECK_ONLY" = 1 ]; then note rustdesk "CHƯA CÓ"
else
    case "$ARCH" in amd64) RA=x86_64 ;; arm64) RA=aarch64 ;; *) RA="" ;; esac
    url=""
    [ -n "$RA" ] && url=$(curl -fsS --max-time 20 https://api.github.com/repos/rustdesk/rustdesk/releases/latest | \
        python3 -c "import json,sys; d=json.load(sys.stdin); t=d['tag_name']; n=f'rustdesk-{t}-$RA.deb'; print(next((a['browser_download_url'] for a in d['assets'] if a['name']==n), ''))")
    if [ -z "$url" ]; then note rustdesk "LỖI" "không tìm thấy file .deb cho $ARCH trên GitHub"
    elif curl -fL --max-time 300 -o "$TMP/rustdesk.deb" "$url" && \
         sudo DEBIAN_FRONTEND=noninteractive apt-get install -y "$TMP/rustdesk.deb"; then note rustdesk "ĐÃ CÀI" "$(basename "$url"); đặt mật khẩu truy cập trong app"
    else note rustdesk "LỖI"; fi
fi

# ---------- 7. snap ----------
step "Gói snap"
for spec in "onlyoffice-desktopeditors" "notepadnext --classic" "dbeaver-ce --classic"; do
    name=${spec%% *}
    if snap list "$name" >/dev/null 2>&1; then note "$name" "ĐÃ CÓ"
    elif [ "$CHECK_ONLY" = 1 ]; then note "$name" "CHƯA CÓ"
    # shellcheck disable=SC2086
    elif sudo snap install $spec; then note "$name" "ĐÃ CÀI"
    else note "$name" "LỖI" "snap install thất bại"; fi
done

# ---------- tổng kết ----------
printf '\n=== TỔNG KẾT ===\n'
{ echo "MỤC|KẾT QUẢ|GHI CHÚ"; printf '%s\n' "${RESULTS[@]}"; } | column -t -s'|'
printf '=== TỔNG KẾT ===\n'
echo "Còn lại (Claude xử lý theo initial-setup/packages.md): driver NVIDIA nếu cần, Remote Shield + Desktop Sharing + Remote Control, Remote Login, LibreOffice nếu cần."
echo "Log: $LOG"
[ "$CHECK_ONLY" = 1 ] || echo "Đăng xuất rồi đăng nhập lại để bộ gõ tiếng Việt hoạt động đầy đủ."
exit "$FAILED"
