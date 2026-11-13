# System HUD cho Windows

Bảng theo dõi CPU, RAM, GPU, ổ đĩa, mạng vẽ thẳng lên desktop Windows, nằm dưới mọi cửa sổ, giao diện Orbital giống bản [Ubuntu](../system-hud/README.md). Một file `.exe`, không cần cài runtime, không cần quyền admin.

> **In English.** A transparent system monitor (CPU, RAM, GPU, disk, network) drawn on the Windows desktop, below all windows. Port of the Ubuntu GNOME extension in `../system-hud`.

## Yêu cầu

- Windows 10 (1903 trở lên) hoặc Windows 11. .NET Framework 4.8 đã có sẵn.
- GPU NVIDIA: `nvidia-smi` (có sẵn trong driver) để hiện đủ nhiệt độ, công suất, quạt, xung. GPU khác chỉ có % tải và VRAM.
- Nhiệt độ CPU và ổ đĩa: Windows không cho phần mềm thường đọc trực tiếp. Muốn có thì chạy [LibreHardwareMonitor](https://github.com/LibreHardwareMonitor/LibreHardwareMonitor) và bật **Options → Remote Web Server → Run** (cổng 8085). HUD tự nhận, kể cả khi bật LibreHardwareMonitor sau HUD. Không có thì HUD hiện `--`.

## Build

Cần [.NET SDK](https://dotnet.microsoft.com/download) (bản 5 trở lên). Máy chưa có .NET Framework 4.8 Developer Pack thì SDK tự tải reference assemblies, nên cần mạng.

```bat
git clone https://github.com/pushsale/ubuntu-assistant.git
cd ubuntu-assistant\system-hud-windows
build.cmd
```

Kết quả: `dist\SystemHud.exe`. Chép file này đi đâu cũng chạy được.

## Chạy

Chạy `SystemHud.exe`. HUD hiện ở mép phải màn hình chính, và tự đăng ký chạy cùng Windows cho lần đăng nhập sau.

Chuột phải icon HUD ở khay hệ thống để: đổi giao diện tối/sáng, đặt trái/phải, chọn màn hình chính/phụ, bật/tắt khởi động cùng Windows, mở `config.json`, thoát.

## Cấu hình

`config.json` nằm cạnh `SystemHud.exe` (thư mục không ghi được như Program Files thì dùng `%APPDATA%\SystemHud\config.json`). Sửa và lưu là áp dụng ngay.

```json
{
  "theme": "orbital",
  "monitor": "primary",
  "side": "right",
  "widthFraction": 0.25,
  "gap": 12,
  "intervalMs": 3000,
  "animMs": 3000,
  "fps": 10,
  "autostart": true
}
```

| Khoá | Giá trị |
|---|---|
| `theme` | `orbital` (tối) hoặc `orbitalLight` (sáng) |
| `monitor` | `primary`, `secondary` hoặc số thứ tự màn hình (`0`, `1`...) |
| `side` | `left` hoặc `right` |
| `widthFraction` | Bề rộng theo tỉ lệ màn hình (0.25 = 25%) |
| `gap` | Khoảng cách tới mép màn hình và taskbar (px) |
| `intervalMs` | Chu kỳ lấy số liệu (ms) |
| `animMs` | Thời gian hiệu ứng chuyển số (ms); bằng `intervalMs` thì chuyển liên tục, `0` thì tắt |
| `fps` | Số khung/giây khi chạy hiệu ứng; ít hơn thì nhẹ CPU hơn |
| `autostart` | `true` tự chạy khi đăng nhập Windows |

## Gỡ

1. Chuột phải icon HUD ở khay → bỏ chọn **Khởi động cùng Windows** → **Thoát**.
2. Xoá `SystemHud.exe` và `config.json`.

Tài liệu kỹ thuật: [docs/system-hud-windows/](../docs/system-hud-windows/overview.md). Giấy phép: [MIT](../LICENSE).
