# Initial Setup — Tổng quan

Initial Setup là danh sách công cụ và thiết lập cần có khi chuyển sang một máy Ubuntu mới, kèm hướng dẫn để Claude tự cài đủ: người dùng chỉ dán một khối lệnh cài Claude rồi đưa Claude link hướng dẫn. Các thứ đơn giản được cài một lượt bằng script (nhập mật khẩu một lần); Claude chỉ xử lý từng mục những thứ cần hỏi hoặc tuỳ máy.

## Bài toán giải quyết

| Bài toán | Cách xử lý |
|---|---|
| Cài lại máy / sang máy mới phải nhớ và cài tay hàng chục thứ | Danh sách tập trung ở `initial-setup/packages.md`, mỗi mục có lệnh cài và lệnh kiểm tra |
| Người dùng không rành lệnh Linux | Chỉ một bước tay (dán khối lệnh cài Claude); Claude đọc danh sách và cài phần còn lại |
| Cài từng mục, hỏi mật khẩu và xác nhận nhiều lần | Mọi thứ chỉ cần một lệnh được gom vào `install-basic.sh`: chạy một lần, nhập mật khẩu một lần |
| Cài tự động dễ cài nhầm, cài thừa, chạy script lạ | Claude lập kế hoạch cho người dùng duyệt trước; chỉ dùng nguồn ghi trong danh sách; mật khẩu, license do người dùng tự nhập |
| Mỗi máy khác nhau (card đồ hoạ, bản GNOME) | Cột "Yêu cầu" cho từng mục; máy không khớp thì bỏ qua và báo lý do |
| Chạy lại nhiều lần không được làm hỏng máy | Mỗi mục có lệnh kiểm tra; đã có thì bỏ qua |

## Kiến trúc

```
  Người dùng                        Claude Desktop (tab Code)                     Máy Ubuntu
  ──────────                        ─────────────────────────                     ──────────
  README.md gốc Bước 1 ──dán──► cài claude-desktop + tải repo ─────────────────► apt, ~/ubuntu-setup
  README.md gốc Bước 2 ──link initial-setup/README.md──► đọc initial-setup/CLAUDE.md
                                       install-basic.sh --check (xem đã có gì)
                                       install-basic.sh trong terminal ───────────► apt / snap / .deb / gsettings
                                         (người dùng nhập mật khẩu một lần)        (Phần A, một lượt)
                                       đọc TỔNG KẾT; mục CẦN XỬ LÝ làm tiếp
                                       Phần B: kế hoạch ──► người dùng duyệt
                                       làm từng mục ───────────────────────────────► driver NVIDIA, remote-shield/install.sh...
                                       xác minh + báo cáo ──► người dùng
```

## Vai trò từng lớp

| Lớp | Vai trò | Công nghệ |
|---|---|---|
| `README.md` gốc | Khối lệnh cài Claude Desktop, câu giao việc kèm link `initial-setup/README.md` | Markdown, bash |
| `initial-setup/README.md` | Trang Claude nhận link: clone / cập nhật repo rồi đọc `CLAUDE.md`; hướng dẫn tự chạy script cho người | Markdown |
| `initial-setup/install-basic.sh` | Cài một lượt mọi thứ đơn giản (Phần A), `--check` chỉ kiểm tra; in bảng TỔNG KẾT | Bash |
| `initial-setup/CLAUDE.md` | Quy trình và quy tắc an toàn cho Claude khi cài | Markdown (Claude Code tự nạp khi làm việc trong thư mục này) |
| `initial-setup/packages.md` | Phần A: bảng tham khảo những gì script làm; Phần B: mục phức tạp, mỗi mục có cách cài / kiểm tra / yêu cầu / trạng thái | Bảng Markdown |
| `remote-shield/install.sh` | Mục Remote Shield + Desktop Sharing + Remote Control | Bash |

## Cung cấp gì cho từng đối tượng

| Đối tượng | Nhận được |
|---|---|
| Người dùng chuyển sang Ubuntu | Một khối lệnh để dán, một lần nhập mật khẩu cho phần cài đơn giản, sau đó máy được cài đủ công cụ quen dùng |
| Người quản lý danh sách | Một file bảng duy nhất để thêm / bớt công cụ |
| Claude | Quy trình rõ ràng, tiêu chí "đã cài" kiểm được bằng lệnh, ranh giới việc nào phải hỏi người dùng |

## Tính năng chính theo mốc thời gian

| Ngày | Mốc |
|---|---|
| 2026-11-13 | Tạo khung: README (khối lệnh cài Claude Desktop từ kho apt chính thức, có kiểm tra khoá ký), CLAUDE.md (quy trình), packages.md |
| 2026-11-13 | Người dùng chốt danh sách: kiểm tra máy, phím tắt kiểu Windows, gõ tiếng Việt, Chrome, Remote Shield + Desktop Sharing + Remote Control, OnlyOffice / LibreOffice, Remmina, RustDesk, Notepad Next (Notepad++ không có bản Linux), DBeaver |
| 2026-11-13 | Gom mục đơn giản vào `install-basic.sh` (một lần mật khẩu); `packages.md` chia Phần A / Phần B; README gốc chỉ còn cài Claude Desktop + link `initial-setup/README.md`; bỏ đề xuất System HUD |

## Tech stack

- Ubuntu 22.04+ (đang dùng 26.04), apt, snap, gsettings
- Claude Desktop cho Linux (beta) từ kho `downloads.claude.ai/claude-desktop/apt/stable`

## Quy mô hiện tại

- 4 file trong `initial-setup/`. Phần A (script, 13 dòng): kiểm tra mạng, card màn hình → phím tắt kiểu Windows (Windows + S tìm kiếm; Terminal Ctrl+C copy, Ctrl+V paste, Ctrl+Shift+C dừng lệnh) → git, gcc, gnome-remote-desktop, Remmina → gõ tiếng Việt → Chrome, RustDesk → OnlyOffice, Notepad Next, DBeaver. Phần B (Claude): kiểm tra Claude, driver NVIDIA (hỏi trước), Remote Shield + Desktop Sharing + Remote Control, Remote Login (hỏi trước), LibreOffice (hỏi trước).
- Chưa chạy thử trên máy mới.

## Đặc điểm nổi bật

- Phần đơn giản là script chạy một lượt, không hỏi gì; Claude chỉ dành cho các mục cần quyết định hoặc tuỳ máy.
- Chạy lại an toàn: mục đã có thì bỏ qua.
- Khối lệnh cài Claude kiểm tra dấu vân tay khoá ký của Anthropic trước khi thêm kho.

## Giới hạn hiện tại

- Chỉ cho Ubuntu / Debian (Claude Desktop cho Linux chưa hỗ trợ distro khác).
- Cần tài khoản Claude trả phí để dùng tab Code.
- Không cài được những thứ cần đăng nhập web, nhập license, hay mua bản quyền: chỉ ghi lại để người dùng tự làm.

## Roadmap (tạm dự kiến)

- Chạy thử trên một máy mới (hoặc máy ảo), sửa danh sách theo thực tế.
- Cân nhắc thêm phần sao lưu / chuyển cấu hình cá nhân (dotfiles, cài đặt app) nếu cần.

## Tài liệu liên quan

- Chi tiết kỹ thuật: [system.md](system.md)
- Mục lục: [../index.md](../index.md)
- Feature được cài qua danh sách này: [Remote Shield](../remote-shield/overview.md)
- Liên hệ: chủ dự án
