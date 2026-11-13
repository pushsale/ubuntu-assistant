# Ubuntu Setup — cài máy Ubuntu mới

Chỉ cần làm tay 2 bước: cài Claude và mở repo này trong Claude. Mọi thứ còn lại (danh sách ở [packages.md](packages.md)) Claude tự cài theo hướng dẫn trong [CLAUDE.md](CLAUDE.md).

Yêu cầu: Ubuntu 22.04 trở lên (hoặc Debian 12+), máy x86_64 hoặc arm64, có mạng, tài khoản Claude trả phí (Pro / Max / Team / Enterprise) để dùng Claude Code.

## Bước 1. Cài Claude (dán vào terminal)

Mở Terminal (Ctrl+Alt+T), dán cả khối dưới rồi Enter. Lệnh sẽ hỏi mật khẩu của bạn (mật khẩu đăng nhập Ubuntu, gõ không hiện ký tự là bình thường).

```bash
sudo apt update && sudo apt install -y curl gnupg git && \
sudo curl -fsSLo /usr/share/keyrings/claude-desktop-archive-keyring.asc https://downloads.claude.ai/claude-desktop/key.asc && \
gpg --show-keys --with-colons /usr/share/keyrings/claude-desktop-archive-keyring.asc | grep -q '^fpr:::::::::31DDDE24DDFAB679F42D7BD2BAA929FF1A7ECACE:' && \
echo "deb [arch=amd64,arm64 signed-by=/usr/share/keyrings/claude-desktop-archive-keyring.asc] https://downloads.claude.ai/claude-desktop/apt/stable stable main" | sudo tee /etc/apt/sources.list.d/claude-desktop.list && \
sudo apt update && sudo apt install -y claude-desktop && \
{ [ -d ~/ubuntu-assistant ] || git clone https://github.com/pushsale/ubuntu-assistant.git ~/ubuntu-assistant; } && \
echo "=== XONG: đã cài Claude và tải repo về ~/ubuntu-assistant ===" || echo "=== LỖI: xem dòng báo lỗi phía trên ==="
```

Khối lệnh làm lần lượt (dừng ngay nếu một bước lỗi):

1. Cài `curl`, `gnupg`, `git`.
2. Tải khoá ký của Anthropic và kiểm tra đúng dấu vân tay `31DDDE24DDFAB679F42D7BD2BAA929FF1A7ECACE` (khoá sai thì dừng, không thêm kho).
3. Thêm kho apt chính thức của Claude Desktop; sau này Claude được cập nhật cùng `sudo apt upgrade`.
4. Cài `claude-desktop`.
5. Tải repo này về `~/ubuntu-assistant` (đã có thì bỏ qua).

Nguồn lệnh: [hướng dẫn chính thức Claude Desktop on Linux](https://code.claude.com/docs/en/desktop-linux).

**Tuỳ chọn: Claude Code bản dòng lệnh** (dùng `claude` trong terminal, không cần nếu đã dùng app):

```bash
curl -fsSL https://claude.ai/install.sh | bash
```

## Bước 2. Mở repo trong Claude và giao việc

1. Mở **Claude** từ menu ứng dụng (hoặc gõ `claude-desktop`), đăng nhập tài khoản.
2. Chuyển sang tab **Code**, chọn thư mục `~/ubuntu-assistant` làm thư mục làm việc.
3. Gõ:

   ```text
   Đọc ubuntu-setup/CLAUDE.md và cài đặt máy theo danh sách trong ubuntu-setup/packages.md
   ```

Claude sẽ kiểm tra máy, lập danh sách những gì sẽ cài để bạn duyệt, rồi cài từng mục. Khi cần mật khẩu sudo, Claude mở lệnh trong terminal để bạn tự nhập; tài khoản, license, mật khẩu ứng dụng bạn cũng tự nhập.

## Sửa danh sách cần cài

Thêm / bớt mục trong [packages.md](packages.md) (giữ đúng định dạng bảng), hoặc nói với Claude "thêm X vào ubuntu-setup". Không ghi mật khẩu, token, license key hay thông tin cá nhân vào đó (repo public).
