# Ubuntu Setup — Tổng quan

Ubuntu Setup là danh sách công cụ và thiết lập cần có khi chuyển sang một máy Ubuntu mới, kèm hướng dẫn để Claude tự cài đủ: người dùng chỉ dán một khối lệnh cài Claude, phần còn lại Claude làm.

## Bài toán giải quyết

| Bài toán | Cách xử lý |
|---|---|
| Cài lại máy / sang máy mới phải nhớ và cài tay hàng chục thứ | Danh sách tập trung ở `ubuntu-setup/packages.md`, mỗi mục có lệnh cài và lệnh kiểm tra |
| Người dùng không rành lệnh Linux | Chỉ một bước tay (dán khối lệnh cài Claude); Claude đọc danh sách và cài phần còn lại |
| Cài tự động dễ cài nhầm, cài thừa, chạy script lạ | Claude lập kế hoạch cho người dùng duyệt trước; chỉ dùng nguồn ghi trong danh sách; mật khẩu, license do người dùng tự nhập |
| Mỗi máy khác nhau (card đồ hoạ, bản GNOME) | Cột "Yêu cầu" cho từng mục; máy không khớp thì bỏ qua và báo lý do |
| Chạy lại nhiều lần không được làm hỏng máy | Mỗi mục có lệnh kiểm tra; đã có thì bỏ qua |

## Kiến trúc

```
  Người dùng                    Claude Desktop (tab Code)                  Máy Ubuntu
  ──────────                    ─────────────────────────                  ──────────
  README.md Bước 1 ──dán──► cài claude-desktop + tải repo ──────────────► apt, ~/ubuntu-assistant
  README.md Bước 2 ──giao việc──► đọc ubuntu-setup/CLAUDE.md (cách làm)
                                   đọc ubuntu-setup/packages.md (cài gì)
                                   kiểm tra máy + từng mục
                                   lập kế hoạch ──► người dùng duyệt
                                   cài theo nhóm ─────────────────────────► apt / snap / gsettings / script trong repo
                                   (sudo: mở terminal, người dùng nhập mật khẩu)
                                   xác minh + báo cáo ──► người dùng
```

## Vai trò từng lớp

| Lớp | Vai trò | Công nghệ |
|---|---|---|
| `ubuntu-setup/README.md` | Hướng dẫn cho người: khối lệnh cài Claude, cách giao việc cho Claude | Markdown, bash |
| `ubuntu-setup/CLAUDE.md` | Quy trình và quy tắc an toàn cho Claude khi cài | Markdown (Claude Code tự nạp khi làm việc trong thư mục này) |
| `ubuntu-setup/packages.md` | Danh sách cần cài, chia nhóm, mỗi mục có cách cài / kiểm tra / yêu cầu / trạng thái | Bảng Markdown |
| Script trong repo (`remote-shield/install.sh`, `system-hud/install.sh`) | Các mục thuộc chính Ubuntu Assistant | Bash |

## Cung cấp gì cho từng đối tượng

| Đối tượng | Nhận được |
|---|---|
| Người dùng chuyển sang Ubuntu | Một khối lệnh để dán, sau đó máy được cài đủ công cụ quen dùng |
| Người quản lý danh sách | Một file bảng duy nhất để thêm / bớt công cụ |
| Claude | Quy trình rõ ràng, tiêu chí "đã cài" kiểm được bằng lệnh, ranh giới việc nào phải hỏi người dùng |

## Tính năng chính theo mốc thời gian

| Ngày | Mốc |
|---|---|
| 2026-11-13 | Tạo khung: README (khối lệnh cài Claude Desktop từ kho apt chính thức, có kiểm tra khoá ký), CLAUDE.md (quy trình), packages.md |
| 2026-11-13 | Người dùng chốt danh sách: kiểm tra máy, phím tắt kiểu Windows, gõ tiếng Việt, Chrome, Remote Shield + Desktop Sharing + Remote Control, OnlyOffice / LibreOffice, Remmina, RustDesk, Notepad Next (Notepad++ không có bản Linux), DBeaver |

## Tech stack

- Ubuntu 22.04+ (đang dùng 26.04), apt, snap, gsettings
- Claude Desktop cho Linux (beta) từ kho `downloads.claude.ai/claude-desktop/apt/stable`

## Quy mô hiện tại

- 3 file trong `ubuntu-setup/`. Danh sách theo thứ tự người dùng chọn: kiểm tra mạng, card màn hình → phím tắt kiểu Windows (Windows + S tìm kiếm; Terminal Ctrl+C copy, Ctrl+V paste, Ctrl+Shift+C dừng lệnh) → gõ tiếng Việt → Chrome → Remote Shield + Desktop Sharing + Remote Control (Remote Login hỏi trước) → OnlyOffice (LibreOffice nếu chưa đủ) → Remmina, RustDesk → Notepad Next (thay Notepad++) → DBeaver. 2 mục nhóm Claude (chỉ kiểm tra), 21 mục `cài` (4 mục `hỏi trước`), 1 mục `đề xuất`.
- Chưa chạy thử trên máy mới.

## Đặc điểm nổi bật

- Không có script cài tự động riêng: Claude đọc danh sách và tự xử lý từng mục, nên danh sách viết như ghi chú, dễ sửa.
- Chạy lại an toàn: mục đã có thì bỏ qua.
- Khối lệnh cài Claude kiểm tra dấu vân tay khoá ký của Anthropic trước khi thêm kho.

## Giới hạn hiện tại

- Chỉ cho Ubuntu / Debian (Claude Desktop cho Linux chưa hỗ trợ distro khác).
- Cần tài khoản Claude trả phí để dùng tab Code.
- Các mục nhóm "Đề xuất khác" lấy từ máy hiện tại, người dùng chưa duyệt.
- Không cài được những thứ cần đăng nhập web, nhập license, hay mua bản quyền: chỉ ghi lại để người dùng tự làm.

## Roadmap (tạm dự kiến)

- Người dùng liệt kê danh sách đầy đủ.
- Chạy thử trên một máy mới (hoặc máy ảo), sửa danh sách theo thực tế.
- Cân nhắc thêm phần sao lưu / chuyển cấu hình cá nhân (dotfiles, cài đặt app) nếu cần.

## Tài liệu liên quan

- Chi tiết kỹ thuật: [system.md](system.md)
- Mục lục: [../index.md](../index.md)
- Feature được cài qua danh sách này: [Remote Shield](../remote-shield/overview.md), [System HUD](../system-hud/overview.md)
- Liên hệ: chủ dự án
