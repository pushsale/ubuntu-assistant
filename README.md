# Ubuntu Assistant

Chuyển sang Ubuntu chỉ với hai bước tay: cài Claude Desktop, rồi đưa cho Claude link hướng dẫn. Claude tự cài phần còn lại (phím tắt kiểu Windows, gõ tiếng Việt, Chrome, Remote Desktop, OnlyOffice, RustDesk, DBeaver...).

> **In English.** Install Claude Desktop with the block below, then hand Claude the link to [ubuntu-setup/README.md](ubuntu-setup/README.md); Claude installs the rest. Documentation is in Vietnamese.

Yêu cầu: Ubuntu 22.04 trở lên (hoặc Debian 12+), máy x86_64 hoặc arm64, có mạng, tài khoản Claude trả phí (Pro / Max / Team / Enterprise) để dùng Claude Code.

## Bước 1. Cài Claude Desktop (dán vào terminal)

Mở Terminal (Ctrl+Alt+T), dán cả khối dưới rồi Enter. Lệnh sẽ hỏi mật khẩu đăng nhập Ubuntu (gõ không hiện ký tự là bình thường).

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

## Bước 2. Giao việc cho Claude

1. Mở **Claude** từ menu ứng dụng, đăng nhập tài khoản.
2. Chuyển sang tab **Code**, chọn thư mục `~/ubuntu-assistant`.
3. Dán:

   ```text
   Đọc https://github.com/pushsale/ubuntu-assistant/blob/main/ubuntu-setup/README.md và cài đặt máy theo hướng dẫn trong đó
   ```

Từ đây Claude làm tiếp: chạy một script cài các thứ đơn giản (bạn nhập mật khẩu một lần), rồi hỏi bạn về các mục cần quyết định. Chi tiết: [ubuntu-setup/README.md](ubuntu-setup/README.md).

## Khác

- Hướng dẫn riêng từng công cụ trong repo: [Remote Shield](remote-shield/README.md), [System HUD](system-hud/README.md).
- Tài liệu kỹ thuật: [docs/index.md](docs/index.md).
- Giấy phép: [MIT](LICENSE).
