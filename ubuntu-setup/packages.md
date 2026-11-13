# Danh sách cài đặt khi chuyển sang Ubuntu

Claude đọc file này cùng [CLAUDE.md](CLAUDE.md) để cài máy mới. Mỗi nhóm một bảng, làm **từ nhóm trên xuống** (thứ tự do người dùng chọn). Cách điền từng cột: xem mục "Cách đọc `packages.md`" trong `CLAUDE.md`.

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

## 2. Gõ tiếng Việt

| Tên | Mục đích | Cài | Kiểm tra | Yêu cầu | Ghi chú | Trạng thái |
|---|---|---|---|---|---|---|
| ibus-bamboo | Bộ gõ tiếng Việt (Telex / VNI) | `sudo add-apt-repository -y ppa:bamboo-engine/ibus-bamboo && sudo apt install -y ibus-bamboo` | `dpkg -s ibus-bamboo` | | Nguồn ngoài kho Ubuntu: PPA `bamboo-engine/ibus-bamboo` (đã duyệt). PPA chưa có bản cho bản Ubuntu mới thì báo người dùng, không tự tìm nguồn khác | cài |
| nguon-nhap-bamboo | Thêm "Vietnamese (Bamboo)" vào danh sách bộ gõ, chuyển bằng Super+Space | `gsettings: org.gnome.desktop.input-sources sources` = danh sách hiện có **thêm** `('ibus', 'Bamboo')` ở cuối (giữ nguyên bàn phím đang có) | `gsettings get org.gnome.desktop.input-sources sources \| grep -q "'ibus', 'Bamboo'"` | GNOME | Ghi giá trị cũ vào báo cáo. Bộ gõ hoạt động đầy đủ sau khi đăng xuất / đăng nhập lại | cài |

## 3. Remote Shield (remote RDP kiểu Windows, trong repo này)

| Tên | Mục đích | Cài | Kiểm tra | Yêu cầu | Ghi chú | Trạng thái |
|---|---|---|---|---|---|---|
| git | Lấy / cập nhật repo | `apt: git` | `command -v git` | | | cài |
| gcc | Build thư viện che màn hình cho đúng máy | `apt: gcc` | `command -v gcc` | | | cài |
| gnome-remote-desktop | Máy chủ RDP của GNOME | `apt: gnome-remote-desktop` | `dpkg -s gnome-remote-desktop` | | Thường có sẵn trên Ubuntu Desktop | cài |
| remote-shield | Remote RDP vào máy; màn hình thật như đang khóa, bàn phím chuột tại máy bị chặn | `repo: remote-shield/install.sh --rdp --remote-login` (chạy trong terminal của người dùng) | `[ -f ~/.local/lib/remote-shield/shield-shim.so ] && grep -q shield-shim ~/.config/systemd/user/org.gnome.Shell@.service.d/remote-shield.conf` | GNOME 50, Wayland | Script hỏi tài khoản RDP (2 lần: Desktop Sharing và Remote Login) và mật khẩu sudo: người dùng tự nhập. Sau khi cài: đăng xuất / đăng nhập lại, rồi `shieldctl test 10`. Bật tường lửa thì `sudo ufw allow 3389:3390/tcp` | cài |

## 4. Văn phòng

| Tên | Mục đích | Cài | Kiểm tra | Yêu cầu | Ghi chú | Trạng thái |
|---|---|---|---|---|---|---|
| onlyoffice | Mở / sửa Word, Excel, PowerPoint (giao diện giống MS Office) | `snap: onlyoffice-desktopeditors` | `snap list onlyoffice-desktopeditors` | | | cài |
| libreoffice | Bộ văn phòng bổ sung khi OnlyOffice chưa đủ (macro, file ODF, Base / Draw) | `apt: libreoffice libreoffice-l10n-vi` | `dpkg -s libreoffice-writer` | | **hỏi trước**: chỉ cài khi người dùng nói OnlyOffice chưa đủ. Bản Ubuntu Desktop đầy đủ có thể đã có sẵn: kiểm tra trước | cài |

## 5. Đề xuất khác (Claude ghi từ máy hiện tại, người dùng chưa duyệt)

Mục `đề xuất`: hỏi người dùng trước khi cài. Giữ thì đổi thành `cài`, không cần thì đổi thành `bỏ` hoặc xoá dòng.

| Tên | Mục đích | Cài | Kiểm tra | Yêu cầu | Ghi chú | Trạng thái |
|---|---|---|---|---|---|---|
| dbeaver-ce | Kết nối, truy vấn SQL Server / MySQL / PostgreSQL (thay SSMS) | `snap: dbeaver-ce --classic` | `snap list dbeaver-ce` | | | đề xuất |
| system-hud | Bảng theo dõi CPU/RAM/GPU trên desktop (trong repo này) | `repo: system-hud/install.sh` | `[ -d ~/.local/share/gnome-shell/extensions/system-hud@ubuntu-assistant ]` | GNOME 50 | Cần đăng xuất lần đầu | đề xuất |
| super-s-tim-kiem | Windows + S mở tìm kiếm app như Windows | `gsettings: org.gnome.shell.keybindings toggle-quick-settings "[]"` rồi `gsettings: org.gnome.shell.keybindings toggle-overview "['<Super>s']"` | `[ "$(gsettings get org.gnome.shell.keybindings toggle-overview)" = "['<Super>s']" ]` | GNOME | Windows + S mặc định mở cài đặt nhanh; sau khi đổi, cài đặt nhanh không còn phím tắt | đề xuất |

## 6. Người dùng bổ sung

_Chưa có. Thêm mục vào đây hoặc vào nhóm phù hợp ở trên._

| Tên | Mục đích | Cài | Kiểm tra | Yêu cầu | Ghi chú | Trạng thái |
|---|---|---|---|---|---|---|
