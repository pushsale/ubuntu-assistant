# Ubuntu Assistant — Mục lục tài liệu

Bộ công cụ tự viết để tuỳ biến và vận hành máy Ubuntu 26.04 (GNOME 50, Wayland): remote kiểu Windows, HUD theo dõi hệ thống.

## Tài liệu

| Thư mục | Phạm vi | Trạng thái | Cập nhật |
|---|---|---|---|
| [remote-shield/](remote-shield/overview.md) | Khi có người remote RDP, màn hình thật trông như đang khóa; người remote vẫn thấy và điều khiển desktop; bấm tại máy để lấy lại máy | đang chạy | 2026-11-13 |
| [system-hud/](system-hud/overview.md) | Bảng theo dõi CPU/RAM/GPU/ổ đĩa/mạng/nhiệt độ vẽ trên desktop, dưới mọi cửa sổ (tên cũ: Sci-Fi HUD) | đang chạy | 2026-11-13 |

Mỗi thư mục có `overview.md` (cho người không đọc code) và `system.md` (chi tiết kỹ thuật).

## File bổ sung

| File | Mục đích |
|---|---|
| `README.md` (gốc repo, không nằm ở `docs/`) | Hướng dẫn cài / dùng / gỡ cả hai extension cho người ngoài (repo public); sửa cách cài thì cập nhật cùng lúc |
| `remote-shield/packaging/README.txt` (trong mã nguồn, không nằm ở `docs/`) | Hướng dẫn cài cho người dùng cuối, được chép vào gói `remote-shield-<phiên bản>.tar.gz` |

## Quan hệ giữa các feature

`remote-shield` và `system-hud` độc lập, đều là GNOME Shell extension của cùng user và dùng chung kiểu "file khởi động mỏng" (`extension.js` nạp `core.js?v=<thời gian>`) để cập nhật code không cần đăng xuất. Không gọi lẫn nhau.

## Thứ tự đọc cho session mới

1. Memory của project: memory Claude Code của project (nằm ngoài repo, trên máy phát triển: `~/.claude/projects/<thư-mục-project>/memory/`)
2. File này
3. `<feature>/system.md` của phần cần làm (chưa có `project/` vì chưa có kiến trúc dùng chung đáng kể)

## Liên hệ

- Mọi thay đổi do Claude Code thực hiện theo yêu cầu trực tiếp của chủ dự án.
- Repo: `github.com/pushsale/ubuntu-assistant` (public, nhánh `main`).
