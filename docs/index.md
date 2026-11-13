# Ubuntu Assistant — Mục lục tài liệu

Bộ công cụ tự viết để tuỳ biến và vận hành máy Ubuntu 26.04 (GNOME 50, Wayland): remote kiểu Windows, HUD theo dõi hệ thống (kèm bản HUD cho Windows).

## Tài liệu

| Thư mục | Phạm vi | Trạng thái | Cập nhật |
|---|---|---|---|
| [remote-shield/](remote-shield/overview.md) | Khi có người remote RDP, màn hình thật trông như đang khóa; người remote vẫn thấy và điều khiển desktop; bấm tại máy để lấy lại máy | đang chạy | 2026-11-13 |
| [system-hud/](system-hud/overview.md) | Bảng theo dõi CPU/RAM/GPU/ổ đĩa/mạng/nhiệt độ vẽ trên desktop, dưới mọi cửa sổ (tên cũ: Sci-Fi HUD) | đang chạy | 2026-11-13 |
| [system-hud-windows/](system-hud-windows/overview.md) | Bản Windows của System HUD (C# .NET Framework 4.8, GDI+): cùng giao diện Orbital, cửa sổ trong suốt dưới mọi cửa sổ, tự chạy khi đăng nhập | đang chạy | 2026-11-13 |
| [ubuntu-setup/](ubuntu-setup/overview.md) | Cài máy Ubuntu mới: script cài một lượt các thứ đơn giản (nhập mật khẩu một lần) + danh sách mục phức tạp để Claude xử lý; người dùng chỉ dán lệnh cài Claude | thiết kế | 2026-11-13 |

Mỗi thư mục có `overview.md` (cho người không đọc code) và `system.md` (chi tiết kỹ thuật).

## File bổ sung

| File | Mục đích |
|---|---|
| `remote-shield/review-findings.md` | Kết quả review code Remote Shield (#29): 12 vấn đề, mức độ, đề xuất sửa; chờ bàn |
| `ubuntu-setup/README.md`, `ubuntu-setup/CLAUDE.md`, `ubuntu-setup/packages.md`, `ubuntu-setup/install-basic.sh` (trong mã nguồn) | Trang chuyển tiếp cho Claude / người dùng, quy trình cho Claude, danh sách (Phần A tự động, Phần B Claude xử lý), script cài một lượt |
| `README.md` (gốc repo, không nằm ở `docs/`) | Chỉ hướng dẫn cài Claude Desktop rồi đưa Claude link `ubuntu-setup/README.md`; sửa khối lệnh cài Claude thì cập nhật cùng lúc |
| `remote-shield/README.md`, `system-hud/README.md`, `system-hud-windows/README.md` (trong mã nguồn) | Hướng dẫn cài / dùng / gỡ từng công cụ cho người ngoài (repo public); sửa cách cài thì cập nhật cùng lúc |
| `remote-shield/packaging/README.txt` (trong mã nguồn, không nằm ở `docs/`) | Hướng dẫn cài cho người dùng cuối, được chép vào gói `remote-shield-<phiên bản>.tar.gz` |

## Quan hệ giữa các feature

`ubuntu-setup` cài `remote-shield` bằng `install.sh` của feature đó; không feature nào phụ thuộc ngược lại. `remote-shield` và `system-hud` độc lập, đều là GNOME Shell extension của cùng user và dùng chung kiểu "file khởi động mỏng" (`extension.js` nạp `core.js?v=<thời gian>`) để cập nhật code không cần đăng xuất. Không gọi lẫn nhau.

`system-hud-windows` là bản port của `system-hud` sang Windows: không dùng chung code (JavaScript/Cairo so với C#/GDI+) nhưng giữ cùng toạ độ thiết kế, màu, khoá cấu hình. Đổi giao diện hoặc mặc định cấu hình ở một bản thì cân nhắc sửa bản kia trong cùng commit — bảng ánh xạ file và các khác biệt cố ý nằm trong [system-hud-windows/system.md](system-hud-windows/system.md) (mục "Đồng bộ với bản Ubuntu").

## Thứ tự đọc cho session mới

1. Memory của project: memory Claude Code của project (nằm ngoài repo, trên máy phát triển: `~/.claude/projects/<thư-mục-project>/memory/`)
2. File này
3. `<feature>/system.md` của phần cần làm (chưa có `project/` vì chưa có kiến trúc dùng chung đáng kể)

## Liên hệ

- Mọi thay đổi do Claude Code thực hiện theo yêu cầu trực tiếp của chủ dự án.
- Repo: `github.com/pushsale/ubuntu-assistant` (public, nhánh `main`).
