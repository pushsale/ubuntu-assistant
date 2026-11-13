# Danh sách cài đặt khi chuyển sang Ubuntu

Chia làm hai phần:

- **Phần A: tự động.** Mọi thứ chỉ cần chạy lệnh là xong, gom trong [install-basic.sh](install-basic.sh): chạy một lần, nhập mật khẩu một lần, không hỏi gì thêm. Chạy lại nhiều lần được, mục đã có thì bỏ qua.
- **Phần B: Claude xử lý.** Những thứ cần hỏi người dùng, cần nhập tài khoản, cần khởi động lại hoặc tuỳ máy. Claude làm theo [CLAUDE.md](CLAUDE.md).

Không ghi mật khẩu, token, license key, IP hay thông tin cá nhân vào đây (repo public).

## Phần A. Tự động (install-basic.sh)

Bảng dưới chỉ để xem script làm gì; muốn thêm / bớt thì sửa script (danh sách `APT_PKGS`, vòng lặp snap) rồi cập nhật bảng. Thứ tự đúng như script chạy.

| Tên | Mục đích | Cách làm | Ghi chú |
|---|---|---|---|
| mang | Có Internet, phân giải tên miền, HTTPS ra ngoài | Chỉ kiểm tra: ping `1.1.1.1`, tra `github.com`, tải `https://github.com` | **Lỗi thì script dừng ngay**, không cài gì |
| card-man-hinh | Card đồ hoạ có driver | Chỉ kiểm tra: NVIDIA cần `nvidia-smi` chạy được; Intel / AMD cần có "Kernel driver in use" | NVIDIA thiếu driver → `CẦN XỬ LÝ`, Claude làm ở Phần B |
| super-s-tim-kiem | Windows + S mở tìm kiếm app | gsettings: `toggle-quick-settings` = `[]`, `toggle-overview` = `['<Super>s']` | Ghi giá trị cũ vào bảng tổng kết. Cài đặt nhanh (Wi-Fi, âm lượng) không còn phím tắt, vẫn bấm được ở góc phải thanh trên |
| terminal-copy-paste | Trong Terminal: Ctrl+C copy, Ctrl+V paste, **Ctrl+Shift+C dừng lệnh** | gsettings Ptyxis: `copy-clipboard` = `<ctrl>c`, `paste-clipboard` = `<ctrl>v` | Ctrl+Shift+C tự thành phím dừng lệnh. Máy dùng GNOME Terminal (Ubuntu cũ) → `CẦN XỬ LÝ`, Claude hướng dẫn đổi trong Preferences → Shortcuts |
| git, gcc, gnome-remote-desktop | Nền cho Remote Shield | apt | |
| remmina, remmina-plugin-rdp | Kết nối RDP / VNC / SSH tới máy khác (như Remote Desktop Connection) | apt | |
| ibus-bamboo | Bộ gõ tiếng Việt (Telex / VNI) | PPA `bamboo-engine/ibus-bamboo` rồi apt | Nguồn ngoài kho Ubuntu, đã duyệt |
| nguon-nhap-bamboo | Thêm "Vietnamese (Bamboo)" vào danh sách bộ gõ, chuyển bằng Super+Space | gsettings `input-sources`: giữ danh sách cũ, thêm `('ibus', 'Bamboo')` ở cuối | Dùng đầy đủ sau khi đăng xuất / đăng nhập lại |
| google-chrome | Trình duyệt Chrome | `.deb` chính thức từ `dl.google.com` (tự thêm kho apt của Google để cập nhật) | Chỉ x86_64. Đăng nhập Google: người dùng tự làm |
| rustdesk | Điều khiển máy từ xa qua Internet (như TeamViewer / UltraViewer) | `.deb` bản mới nhất từ GitHub `rustdesk/rustdesk` (đúng tên `rustdesk-<bản>-x86_64.deb` hoặc `-aarch64.deb`) | Không tự cập nhật qua apt. Mật khẩu truy cập cố định: người dùng tự đặt trong app |
| onlyoffice-desktopeditors | Mở / sửa Word, Excel, PowerPoint | snap | |
| notepadnext | Thay Notepad++ (Notepad++ không có bản Linux) | snap `--classic` | |
| dbeaver-ce | Kết nối, truy vấn SQL Server / MySQL / PostgreSQL (thay SSMS) | snap `--classic` | Lần kết nối đầu bấm Download driver. SQL Server tự ký chứng chỉ: tick "Trust Server Certificate" |

Kết quả mỗi mục trong bảng tổng kết: `OK`, `ĐÃ CÓ`, `ĐÃ CÀI`, `CHƯA CÓ` (chế độ `--check`), `BỎ QUA` (không hợp máy / không có phiên desktop), `CẦN XỬ LÝ` (Claude làm tiếp), `LỖI`.

## Phần B. Claude xử lý

Làm sau khi `install-basic.sh` chạy xong. Mỗi nhóm một bảng, làm từ trên xuống. Cách đọc cột: mục "Cách đọc `packages.md`" trong `CLAUDE.md`. Trong bảng, `\|` là dấu `|`.

### Mẫu (Claude bỏ qua khối này)

| Tên | Mục đích | Cài | Kiểm tra | Yêu cầu | Ghi chú | Trạng thái |
|---|---|---|---|---|---|---|
| ví dụ-apt | Mô tả ngắn | `apt: ten-goi` | `dpkg -s ten-goi` | | | cài |
| ví dụ-thiết-lập | | `gsettings: <schema> <key> <giá trị>` | `[ "$(gsettings get <schema> <key>)" = "<giá trị>" ]` | | | cài |

### B0. Claude (người dùng tự cài trước, Claude chỉ kiểm tra)

| Tên | Mục đích | Cài | Kiểm tra | Yêu cầu | Ghi chú | Trạng thái |
|---|---|---|---|---|---|---|
| claude-desktop | App Claude (Chat, Claude Code) | Khối lệnh ở [README.md gốc](../README.md) | `dpkg -s claude-desktop` | Ubuntu 22.04+, x86_64/arm64 | Không tự cài lại; thiếu thì báo người dùng | cài |
| kho-claude-desktop | Nhận bản cập nhật Claude qua apt | Như trên | `grep -q downloads.claude.ai/claude-desktop /etc/apt/sources.list.d/claude-desktop.list` | | | cài |

### B1. Driver card màn hình

| Tên | Mục đích | Cài | Kiểm tra | Yêu cầu | Ghi chú | Trạng thái |
|---|---|---|---|---|---|---|
| driver-nvidia | Driver độc quyền NVIDIA (cần cho Wayland ổn định, HUD đọc GPU) | `sudo ubuntu-drivers install` trong terminal của người dùng, rồi khởi động lại | `nvidia-smi >/dev/null 2>&1` | Card NVIDIA, và `install-basic.sh` báo `card-man-hinh` = `CẦN XỬ LÝ` | **hỏi trước**. Máy bật Secure Boot: Ubuntu hỏi đặt mật khẩu MOK, người dùng tự nhập và xác nhận ở màn hình xanh khi khởi động lại. Sau đó kiểm tra `echo $XDG_SESSION_TYPE` = `wayland` | cài |

### B2. Remote (Remote Shield, Desktop Sharing, Remote Control)

| Tên | Mục đích | Cài | Kiểm tra | Yêu cầu | Ghi chú | Trạng thái |
|---|---|---|---|---|---|---|
| remote-shield + desktop-sharing + remote-control | Cài Remote Shield (màn hình thật như đang khóa khi có người remote), bật **Desktop Sharing** (remote vào phiên đang đăng nhập) và **Remote Control** (người remote được điều khiển, không chỉ xem) | `repo: remote-shield/install.sh --rdp` (chạy trong terminal của người dùng) | `[ -f ~/.local/lib/remote-shield/shield-shim.so ] && grdctl status \| grep -q 'Status: enabled' && grdctl status \| grep -q 'View-only: no'` | GNOME 50, Wayland; đã có git, gcc, gnome-remote-desktop (Phần A) | Script hỏi tên đăng nhập / mật khẩu RDP: người dùng tự nhập. Sau khi cài: đăng xuất / đăng nhập lại, rồi `shieldctl test 10`. Bật tường lửa thì `sudo ufw allow 3389:3390/tcp` | cài |
| remote-login | Remote vào khi máy chưa đăng nhập (màn hình đăng nhập) | `repo: remote-shield/install.sh --remote-login` | `systemctl is-enabled gnome-remote-desktop.service >/dev/null 2>&1 && ss -ltn \| grep -qE ':3389 '` | | **hỏi trước**. Cần mật khẩu sudo và tài khoản RDP riêng: người dùng tự nhập. Bật thì Desktop Sharing chuyển sang cổng 3390 | cài |

### B3. Văn phòng bổ sung

| Tên | Mục đích | Cài | Kiểm tra | Yêu cầu | Ghi chú | Trạng thái |
|---|---|---|---|---|---|---|
| libreoffice | Bộ văn phòng bổ sung khi OnlyOffice chưa đủ (macro, file ODF, Base / Draw) | `apt: libreoffice libreoffice-l10n-vi` | `dpkg -s libreoffice-writer` | | **hỏi trước**: chỉ cài khi người dùng nói OnlyOffice chưa đủ. Ubuntu Desktop bản đầy đủ có thể đã có sẵn: kiểm tra trước | cài |

### B4. Người dùng bổ sung

_Chưa có. Thứ chỉ cần một lệnh cài, không hỏi gì: thêm vào `install-basic.sh` (Phần A). Thứ phức tạp: thêm dòng vào đây._

| Tên | Mục đích | Cài | Kiểm tra | Yêu cầu | Ghi chú | Trạng thái |
|---|---|---|---|---|---|---|
