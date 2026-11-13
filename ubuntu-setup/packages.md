# Danh sách cài đặt khi chuyển sang Ubuntu

Claude đọc file này cùng [CLAUDE.md](CLAUDE.md) để cài máy mới. Mỗi nhóm một bảng, làm **từ nhóm trên xuống** (thứ tự do người dùng chọn). Cách điền từng cột: xem mục "Cách đọc `packages.md`" trong `CLAUDE.md`. Trong bảng, `\|` là dấu `|`.

Không ghi mật khẩu, token, license key, IP hay thông tin cá nhân vào đây (repo public).

## Mẫu (Claude bỏ qua khối này)

| Tên | Mục đích | Cài | Kiểm tra | Yêu cầu | Ghi chú | Trạng thái |
|---|---|---|---|---|---|---|
| ví dụ-apt | Mô tả ngắn | `apt: ten-goi` | `dpkg -s ten-goi` | | | cài |
| ví dụ-snap | | `snap: ten-goi` | `snap list ten-goi` | | | cài |
| ví dụ-thiết-lập | | `gsettings: <schema> <key> <giá trị>` | `[ "$(gsettings get <schema> <key>)" = "<giá trị>" ]` | | | cài |

## 0. Claude (người dùng tự cài trước theo README.md, Claude chỉ kiểm tra)

| Tên | Mục đích | Cài | Kiểm tra | Yêu cầu | Ghi chú | Trạng thái |
|---|---|---|---|---|---|---|
| claude-desktop | App Claude (Chat, Claude Code) | Người dùng dán khối lệnh ở [README.md](README.md) Bước 1 | `dpkg -s claude-desktop` | Ubuntu 22.04+, x86_64/arm64 | Không tự cài lại; nếu thiếu thì báo người dùng | cài |
| kho-claude-desktop | Nhận bản cập nhật Claude qua apt | Như trên | `grep -q downloads.claude.ai/claude-desktop /etc/apt/sources.list.d/claude-desktop.list` | | | cài |

## 1. Kiểm tra máy (tiên quyết)

Nhóm này chỉ kiểm tra và sửa nếu cần. **Mạng lỗi thì dừng toàn bộ**, báo người dùng.

| Tên | Mục đích | Cài | Kiểm tra | Yêu cầu | Ghi chú | Trạng thái |
|---|---|---|---|---|---|---|
| mang | Có Internet, phân giải tên miền, HTTPS ra ngoài | Không cài. Lỗi thì chẩn đoán (`ip route`, `resolvectl status`, `nmcli`) và báo người dùng; không tự đổi cấu hình mạng | `ping -c1 -W3 1.1.1.1 >/dev/null && getent hosts github.com >/dev/null && curl -fsS --max-time 10 -o /dev/null https://github.com` | | Lỗi ở đây: dừng mọi nhóm sau | cài |
| card-man-hinh | Card đồ hoạ có driver, chạy phiên Wayland | Card NVIDIA chưa có driver độc quyền (`nvidia-smi` lỗi, hoặc đang dùng `nouveau`): `sudo ubuntu-drivers install`, rồi khởi động lại. Intel / AMD: driver có sẵn trong kernel, chỉ kiểm tra | `if lspci \| grep -iE 'vga\|3d' \| grep -qi nvidia; then nvidia-smi >/dev/null 2>&1; else lspci -k \| grep -A3 -iE 'vga\|3d' \| grep -q 'Kernel driver in use'; fi` | | **hỏi trước** khi cài driver NVIDIA. Máy bật Secure Boot: Ubuntu hỏi đặt mật khẩu MOK, người dùng tự nhập và xác nhận ở màn hình xanh khi khởi động lại. Sau đó kiểm tra thêm `echo $XDG_SESSION_TYPE` = `wayland` | cài |

## 2. Phím tắt kiểu Windows

| Tên | Mục đích | Cài | Kiểm tra | Yêu cầu | Ghi chú | Trạng thái |
|---|---|---|---|---|---|---|
| super-s-tim-kiem | Windows + S mở tìm kiếm app | `gsettings: org.gnome.shell.keybindings toggle-quick-settings "[]"` rồi `gsettings: org.gnome.shell.keybindings toggle-overview "['<Super>s']"` | `[ "$(gsettings get org.gnome.shell.keybindings toggle-overview)" = "['<Super>s']" ]` | GNOME | Windows + S mặc định mở cài đặt nhanh (Wi-Fi, âm lượng); sau khi đổi, cài đặt nhanh không còn phím tắt (vẫn bấm được ở góc phải thanh trên) | cài |
| terminal-copy-paste | Trong Terminal: Ctrl+C copy, Ctrl+V paste, **Ctrl+Shift+C dừng lệnh đang chạy** | `gsettings: org.gnome.Ptyxis.Shortcuts copy-clipboard "'<ctrl>c'"` rồi `gsettings: org.gnome.Ptyxis.Shortcuts paste-clipboard "'<ctrl>v'"` | `[ "$(gsettings get org.gnome.Ptyxis.Shortcuts copy-clipboard)" = "'<ctrl>c'" ] && [ "$(gsettings get org.gnome.Ptyxis.Shortcuts paste-clipboard)" = "'<ctrl>v'" ]` | Terminal mặc định là Ptyxis (Ubuntu 25.10+) | Ctrl+Shift+C không cần đặt: khi copy chuyển sang Ctrl+C, tổ hợp Ctrl+Shift+C được trả cho terminal và gửi tín hiệu dừng như Ctrl+C trước đây. Máy dùng GNOME Terminal (Ubuntu cũ hơn) thì đổi trong Preferences → Shortcuts, báo người dùng | cài |

## 3. Gõ tiếng Việt

| Tên | Mục đích | Cài | Kiểm tra | Yêu cầu | Ghi chú | Trạng thái |
|---|---|---|---|---|---|---|
| ibus-bamboo | Bộ gõ tiếng Việt (Telex / VNI) | `sudo add-apt-repository -y ppa:bamboo-engine/ibus-bamboo && sudo apt install -y ibus-bamboo` | `dpkg -s ibus-bamboo` | | Nguồn ngoài kho Ubuntu: PPA `bamboo-engine/ibus-bamboo` (đã duyệt). PPA chưa có bản cho bản Ubuntu mới thì báo người dùng, không tự tìm nguồn khác | cài |
| nguon-nhap-bamboo | Thêm "Vietnamese (Bamboo)" vào danh sách bộ gõ, chuyển bằng Super+Space | `gsettings: org.gnome.desktop.input-sources sources` = danh sách hiện có **thêm** `('ibus', 'Bamboo')` ở cuối (giữ nguyên bàn phím đang có) | `gsettings get org.gnome.desktop.input-sources sources \| grep -q "'ibus', 'Bamboo'"` | GNOME | Ghi giá trị cũ vào báo cáo. Bộ gõ hoạt động đầy đủ sau khi đăng xuất / đăng nhập lại | cài |

## 4. Trình duyệt

| Tên | Mục đích | Cài | Kiểm tra | Yêu cầu | Ghi chú | Trạng thái |
|---|---|---|---|---|---|---|
| google-chrome | Trình duyệt Chrome | Tải `.deb` chính thức `https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb` rồi `sudo apt install -y ./google-chrome-stable_current_amd64.deb` (gói tự thêm kho apt của Google để cập nhật) | `dpkg -s google-chrome-stable` | x86_64 (Google không có bản arm64 cho Linux) | Nguồn: Google (đã duyệt). Đăng nhập tài khoản Google: người dùng tự làm | cài |

## 5. Remote (Remote Shield, Desktop Sharing, Remote Control)

| Tên | Mục đích | Cài | Kiểm tra | Yêu cầu | Ghi chú | Trạng thái |
|---|---|---|---|---|---|---|
| git | Lấy / cập nhật repo | `apt: git` | `command -v git` | | | cài |
| gcc | Build thư viện che màn hình cho đúng máy | `apt: gcc` | `command -v gcc` | | | cài |
| gnome-remote-desktop | Máy chủ RDP của GNOME | `apt: gnome-remote-desktop` | `dpkg -s gnome-remote-desktop` | | Thường có sẵn trên Ubuntu Desktop | cài |
| remote-shield + desktop-sharing + remote-control | Cài Remote Shield (màn hình thật như đang khóa khi có người remote), bật **Desktop Sharing** (remote vào phiên đang đăng nhập) và **Remote Control** (người remote được điều khiển, không chỉ xem) | `repo: remote-shield/install.sh --rdp` (chạy trong terminal của người dùng) | `[ -f ~/.local/lib/remote-shield/shield-shim.so ] && grdctl status \| grep -q 'Status: enabled' && grdctl status \| grep -q 'View-only: no'` | GNOME 50, Wayland | Script hỏi tên đăng nhập / mật khẩu RDP: người dùng tự nhập. Sau khi cài: đăng xuất / đăng nhập lại, rồi `shieldctl test 10`. Bật tường lửa thì `sudo ufw allow 3389:3390/tcp` | cài |
| remote-login | Remote vào khi máy chưa đăng nhập (màn hình đăng nhập) | `repo: remote-shield/install.sh --remote-login` | `systemctl is-enabled gnome-remote-desktop.service >/dev/null 2>&1 && ss -ltn \| grep -qE ':3389 '` | | **hỏi trước**. Cần mật khẩu sudo và tài khoản RDP riêng: người dùng tự nhập. Bật thì Desktop Sharing chuyển sang cổng 3390 | cài |

## 6. Văn phòng

| Tên | Mục đích | Cài | Kiểm tra | Yêu cầu | Ghi chú | Trạng thái |
|---|---|---|---|---|---|---|
| onlyoffice | Mở / sửa Word, Excel, PowerPoint (giao diện giống MS Office) | `snap: onlyoffice-desktopeditors` | `snap list onlyoffice-desktopeditors` | | | cài |
| libreoffice | Bộ văn phòng bổ sung khi OnlyOffice chưa đủ (macro, file ODF, Base / Draw) | `apt: libreoffice libreoffice-l10n-vi` | `dpkg -s libreoffice-writer` | | **hỏi trước**: chỉ cài khi người dùng nói OnlyOffice chưa đủ. Bản Ubuntu Desktop đầy đủ có thể đã có sẵn: kiểm tra trước | cài |

## 7. Remote sang máy khác

| Tên | Mục đích | Cài | Kiểm tra | Yêu cầu | Ghi chú | Trạng thái |
|---|---|---|---|---|---|---|
| remmina | Kết nối RDP / VNC / SSH tới máy khác (giống Remote Desktop Connection của Windows) | `apt: remmina remmina-plugin-rdp` | `dpkg -s remmina` | | Thường có sẵn trên Ubuntu Desktop | cài |
| rustdesk | Điều khiển máy từ xa qua Internet (giống TeamViewer / UltraViewer) | Tải `.deb` mới nhất cho `x86_64` từ GitHub chính thức `https://github.com/rustdesk/rustdesk/releases/latest` (lấy tên file qua `https://api.github.com/repos/rustdesk/rustdesk/releases/latest`, tài sản đúng tên `rustdesk-<phiên bản>-x86_64.deb`, không lấy bản `-sciter` hay `unattended-wayland`), rồi `sudo apt install -y ./rustdesk-*.deb` | `dpkg -s rustdesk` | x86_64 (arm64 dùng tài sản `aarch64`) | Nguồn: GitHub rustdesk/rustdesk (đã duyệt). Không tự cập nhật qua apt. RustDesk chạy dịch vụ nền; mật khẩu truy cập cố định do người dùng tự đặt trong app | cài |

## 8. Soạn thảo văn bản (thay Notepad++)

Notepad++ không có bản chính thức cho Linux (chỉ Windows). Hai cách:

| Tên | Mục đích | Cài | Kiểm tra | Yêu cầu | Ghi chú | Trạng thái |
|---|---|---|---|---|---|---|
| notepadnext | Viết lại Notepad++ chạy thẳng trên Linux, giao diện và phím tắt gần như Notepad++ | `snap: notepadnext --classic` | `snap list notepadnext` | | Khuyên dùng | cài |
| notepad-plus-plus | Notepad++ bản Windows thật, chạy qua Wine | `snap: notepad-plus-plus` | `snap list notepad-plus-plus` | x86_64 | **hỏi trước**. Snap cộng đồng (không phải của tác giả Notepad++), khởi động chậm, plugin Windows có thể lỗi. Chỉ cài khi Notepad Next thiếu thứ người dùng cần | cài |

## 9. Cơ sở dữ liệu

| Tên | Mục đích | Cài | Kiểm tra | Yêu cầu | Ghi chú | Trạng thái |
|---|---|---|---|---|---|---|
| dbeaver-ce | Kết nối, truy vấn SQL Server / MySQL / PostgreSQL (thay SSMS) | `snap: dbeaver-ce --classic` | `snap list dbeaver-ce` | | Lần kết nối đầu, DBeaver hỏi tải driver: người dùng bấm Download. SQL Server tự ký chứng chỉ: tick "Trust Server Certificate" | cài |

## 10. Đề xuất khác (Claude ghi từ máy hiện tại, người dùng chưa duyệt)

Mục `đề xuất`: hỏi người dùng trước khi cài. Giữ thì đổi thành `cài`, không cần thì đổi thành `bỏ` hoặc xoá dòng.

| Tên | Mục đích | Cài | Kiểm tra | Yêu cầu | Ghi chú | Trạng thái |
|---|---|---|---|---|---|---|
| system-hud | Bảng theo dõi CPU/RAM/GPU trên desktop (trong repo này) | `repo: system-hud/install.sh` | `[ -d ~/.local/share/gnome-shell/extensions/system-hud@ubuntu-assistant ]` | GNOME 50 | Cần đăng xuất lần đầu | đề xuất |

## 11. Người dùng bổ sung

_Chưa có. Thêm mục vào đây hoặc vào nhóm phù hợp ở trên._

| Tên | Mục đích | Cài | Kiểm tra | Yêu cầu | Ghi chú | Trạng thái |
|---|---|---|---|---|---|---|
