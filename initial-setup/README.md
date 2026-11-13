# Initial Setup — cài máy Ubuntu mới

Cài đủ công cụ quen dùng khi chuyển sang Ubuntu: phím tắt kiểu Windows, gõ tiếng Việt, Chrome, Remote Shield + Remote Desktop, OnlyOffice, Remmina, RustDesk, Notepad Next, DBeaver. Danh sách đầy đủ: [packages.md](packages.md).

Chưa cài Claude: làm theo [README gốc](../README.md) trước.

## Dành cho Claude

Người dùng gửi link trang này cho bạn để tiếp tục cài máy. Làm như sau:

1. Repo cần có ở `~/ubuntu-setup`: chưa có thì `git clone https://github.com/pushsale/ubuntu-setup.git ~/ubuntu-setup`, có rồi thì `git -C ~/ubuntu-setup pull --ff-only`.
2. Đọc `~/ubuntu-setup/initial-setup/CLAUDE.md` và làm đúng quy trình trong đó.

## Dành cho người dùng

Cách nhanh nhất: trong Claude (tab **Code**, thư mục `~/ubuntu-setup`), gõ:

```text
Đọc initial-setup/CLAUDE.md và cài đặt máy theo hướng dẫn trong đó
```

Claude sẽ:

1. Chạy [install-basic.sh](install-basic.sh) trong terminal: cài một lượt mọi thứ đơn giản. Bạn chỉ nhập **mật khẩu đăng nhập Ubuntu một lần** (gõ không hiện ký tự là bình thường).
2. Đưa danh sách các mục còn lại cần quyết định (driver NVIDIA, Remote Shield, Remote Login, LibreOffice) để bạn duyệt, rồi làm từng mục. Tài khoản RDP, đăng nhập Google, mật khẩu RustDesk... bạn tự nhập.
3. Báo cáo kết quả và những việc bạn cần tự làm (thường là đăng xuất rồi đăng nhập lại).

Tự chạy phần cài đơn giản không cần Claude:

```bash
cd ~/ubuntu-setup/initial-setup && ./install-basic.sh
```

Chỉ kiểm tra máy đã có gì, không cài gì: `./install-basic.sh --check`. Script chạy lại bao nhiêu lần cũng được, mục đã có thì bỏ qua. Log: `~/.cache/initial-setup/install-basic.log`.

## Sửa danh sách cần cài

- Thứ chỉ cần một lệnh cài, không hỏi gì: thêm vào `install-basic.sh` và bảng Phần A của [packages.md](packages.md).
- Thứ cần hỏi, cần tài khoản, tuỳ máy: thêm dòng vào Phần B của [packages.md](packages.md).

Hoặc nói với Claude "thêm X vào initial-setup". Không ghi mật khẩu, token, license key hay thông tin cá nhân vào đó (repo public).
