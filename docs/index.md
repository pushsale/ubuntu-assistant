# Ubuntu Assistant — Mục lục tài liệu

Bộ công cụ tự viết để tuỳ biến và vận hành máy Ubuntu 26.04 (GNOME 50, Wayland): remote kiểu Windows, HUD theo dõi hệ thống.

## Tài liệu

| Thư mục | Phạm vi | Trạng thái | Cập nhật |
|---|---|---|---|
| [remote-shield/](remote-shield/overview.md) | Che màn hình thật khi có người remote RDP; người remote vẫn thấy và điều khiển desktop | đang chạy | 2026-11-13 |

Mỗi thư mục có `overview.md` (cho người không đọc code) và `system.md` (chi tiết kỹ thuật).

Feature chưa có tài liệu: `scifi-hud/` (extension HUD hiển thị CPU/RAM/GPU/nhiệt độ trên desktop). Viết khi có yêu cầu.

## File bổ sung

| File | Mục đích |
|---|---|
| `remote-shield/packaging/README.txt` (trong mã nguồn, không nằm ở `docs/`) | Hướng dẫn cài cho người dùng cuối, được chép vào gói `remote-shield-<phiên bản>.tar.gz` |

## Quan hệ giữa các feature

`remote-shield` và `scifi-hud` độc lập, đều là GNOME Shell extension của cùng user và dùng chung kiểu "file khởi động mỏng" (`extension.js` nạp `core.js?v=<thời gian>`) để cập nhật code không cần đăng xuất. Không gọi lẫn nhau.

## Thứ tự đọc cho session mới

1. Memory của project: `/home/luannt/.claude/projects/-home-luannt-works-claude-project-Ubuntu-Assistant/memory/MEMORY.md`
2. File này
3. `<feature>/system.md` của phần cần làm (chưa có `project/` vì chưa có kiến trúc dùng chung đáng kể)

## Liên hệ

- Chủ dự án: luannt (máy `luannt-pc`). Mọi thay đổi do Claude Code thực hiện theo yêu cầu trực tiếp của chủ dự án.
- Repo: `github.com/pushsale/ubuntu-assistant` (private, nhánh `main`). Thư mục gốc repo là `Ubuntu Assistant/`.
