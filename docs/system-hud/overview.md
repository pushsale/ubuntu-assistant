# System HUD — Tổng quan

System HUD vẽ một bảng theo dõi máy (CPU, RAM, GPU, ổ đĩa, mạng, nhiệt độ) thẳng lên desktop, nằm trên hình nền và dưới mọi cửa sổ, giống bảng điều khiển trong phim khoa học viễn tưởng.

## Bài toán giải quyết

| Bài toán | Cách xử lý |
|---|---|
| Muốn nhìn tình trạng máy mà không phải mở System Monitor hay terminal | Bảng số liệu luôn hiện trên desktop, cập nhật 3 giây/lần |
| Widget thường nổi trên cửa sổ, che việc đang làm | Vẽ vào lớp hình nền của GNOME: cửa sổ luôn che lên HUD, không bấm nhầm được |
| Số liệu nhảy giật mỗi lần cập nhật nhìn rối mắt | Hiệu ứng chuyển mượt 0,9 giây giữa hai lần đo, đồ thị trượt dần |
| Máy có 2 màn hình, dock, top bar | Chọn màn hình, mép trái/phải, độ rộng; tự né dock trái và top bar |
| Muốn đổi kiểu dáng, vị trí mà không phải đăng nhập lại | Sửa `config.json` là HUD đổi ngay; cập nhật code chỉ cần chạy `install.sh` |
| Theo dõi GPU NVIDIA (tải, nhiệt độ, VRAM, công suất, quạt) | Đọc liên tục từ `nvidia-smi`; card AMD thì đọc từ hệ thống |

## Kiến trúc

```
  Nguồn số liệu                          System HUD (chạy trong gnome-shell)
  ─────────────                          ───────────────────────────────────
  /proc (CPU, RAM, disk, net, uptime) ─┐
  /sys/class/hwmon (nhiệt độ)          ├─► Sensors ──(3 s/lần)──► Animator ──(30 khung/s khi chuyển)──► drawHud
  nvidia-smi (GPU, luồng 1 s/lần)      │    gom số liệu,            nội suy mượt                   vẽ theo theme
  ip addr (địa chỉ IP)               ──┘    lịch sử 60 mẫu                                       (Cairo + Pango)
                                                                                                      │
  config.json ──(sửa là áp dụng ngay)──► HudCore: chọn màn hình, vị trí, kích thước ──────────────────┤
                                                                                                      ▼
                                                     Lớp hình nền của GNOME (dưới mọi cửa sổ) ──► màn hình
```

## Vai trò từng lớp

| Lớp | Vai trò | Công nghệ |
|---|---|---|
| Sensors | Đọc số liệu hệ thống, giữ lịch sử 60 mẫu cho đồ thị | GJS, đọc file `/proc`, `/sys`; tiến trình `nvidia-smi` |
| Animator | Nội suy giữa 2 lần đo để số và đồ thị chuyển mượt | GJS thuần |
| hud.js (5 theme) | Vẽ bảng: khung, vòng đo, thanh, đồ thị, chữ | Cairo, Pango |
| HudCore | Gắn HUD vào lớp hình nền, tính vị trí theo màn hình/dock, hẹn giờ, theo dõi config | GNOME Shell (St, Main.layoutManager) |
| extension.js | File khởi động mỏng: nạp bản code mới nhất mỗi lần bật | GNOME Shell extension |
| install.sh, hud-config.sh | Cài/nạp lại, đổi cấu hình bằng lệnh | Bash, Python |
| tools/ | Xuất ảnh xem trước các theme, đo thời gian vẽ hiệu ứng | GJS chạy ngoài shell |

## Cung cấp gì cho từng đối tượng

| Đối tượng | Nhận được |
|---|---|
| Người dùng máy | Nhìn tức thì: CPU từng nhân + nhiệt độ, RAM/swap, GPU, dung lượng và tốc độ ổ đĩa, tốc độ mạng + IP, tên máy, kernel, uptime, giờ |
| Người tuỳ biến | 5 kiểu giao diện, đổi màn hình/mép/độ rộng/tốc độ cập nhật bằng một lệnh |
| Người phát triển | Ảnh xem trước theme không cần cài vào shell (`tools/preview.js`) |

## Tính năng chính theo mốc thời gian

| Ngày | Mốc |
|---|---|
| 2026-11-12 | Bản đầu (tên "Sci-Fi HUD"): 4 theme tactical, terminal, orbital, card; số liệu CPU/RAM/GPU/Disk/Net |
| 2026-11-12 | Hiệu ứng chuyển số liệu mượt; theme orbitalLight; cấu hình đổi ngay không cần đăng nhập lại |
| 2026-11-12 | File khởi động mỏng (cập nhật code không cần đăng xuất); sửa lỗi cài lại bị nằm ở trạng thái tắt |
| 2026-11-12 | Theme orbital: bỏ thước chia vạch và 2 cung xoay bên ngoài vòng đo cho đỡ rối |
| 2026-11-13 | Đổi tên thành System HUD (UUID `system-hud@ubuntu-assistant`) |
| 2026-11-13 | Hiệu ứng chuyển số liệu kéo dài bằng cả chu kỳ 3 giây (chạy liên tục); số GPU Clock/Fan làm tròn thành số nguyên; vòng đo GPU phóng to |

## Tech stack

- Ubuntu 26.04, GNOME Shell 50 (Wayland)
- GJS (ES modules), Cairo + Pango/PangoCairo để vẽ
- Nguồn số liệu: `/proc`, `/sys/class/hwmon`, `/sys/class/drm`, `nvidia-smi`, `ip`

## Quy mô hiện tại

- Khoảng 2.400 dòng: hud.js 1.463 dòng (5 theme), sensors.js 393, core.js 223, các file khác khoảng 330.
- 5 theme, 6 khối thông tin (header, CPU, RAM, GPU, Disk, Network) + footer.
- Đang chạy trên 1 máy: theme orbital, màn phụ (HDMI-3), mép trái, rộng 25%, cập nhật 3 giây/lần, hiệu ứng 3 giây ở 15 khung/giây (gnome-shell tốn khoảng 31% một nhân CPU; 30 khung/giây tốn khoảng 43% và làm CPU nóng hơn chừng 9°C).

## Đặc điểm nổi bật

- Không bao giờ che cửa sổ, không nhận chuột (vẽ trong lớp hình nền).
- Nhẹ: lấy mẫu 3 giây/lần; chỉ vẽ 30 khung/giây trong 0,9 giây chuyển số liệu rồi dừng; nền khung được vẽ sẵn một lần.
- Không cần quyền root, không cần thư viện ngoài.
- Bố cục tự co giãn theo chiều cao màn hình (thiết kế chuẩn rộng 480 px).

## Giới hạn hiện tại

- Chỉ hỗ trợ GNOME Shell 50 trên Linux; không chạy được trên Windows (phụ thuộc GNOME Shell, `/proc`, `/sys`). Bản Windows phải viết lại (Rainmeter hoặc ứng dụng riêng).
- Chưa có trang cài đặt đồ hoạ; đổi cấu hình bằng `hud-config.sh` hoặc sửa `config.json`.
- GPU: đủ thông số với NVIDIA (cần `nvidia-smi`); AMD chỉ có % tải; Intel chưa hỗ trợ.
- Nhiệt độ CPU chỉ nhận cảm biến `coretemp`, `k10temp`, `zenpower`.
- Ổ đĩa và mạng chỉ theo dõi phân vùng `/` và card mạng có route mặc định.
- Đổi tên UUID cần đăng xuất một lần để GNOME nạp tên mới.

## Roadmap (tạm dự kiến)

- Trang cài đặt (prefs) để chọn theme, màn hình bằng giao diện.
- Hỗ trợ GPU Intel, nhiều ổ đĩa.
- Đóng gói giống Remote Shield để cài máy khác.

## Tài liệu liên quan

- Chi tiết kỹ thuật: [system.md](system.md)
- Mục lục: [../index.md](../index.md)
- Feature cùng dự án: [Remote Shield](../remote-shield/overview.md) (độc lập)
- Liên hệ: chủ dự án luannt
