# System HUD

Bảng theo dõi CPU, RAM, GPU, ổ đĩa, mạng, nhiệt độ vẽ thẳng lên hình nền, nằm dưới mọi cửa sổ. GNOME Shell extension cho Ubuntu (GNOME 50).

> **In English.** A GNOME Shell extension that draws a system monitor (CPU, RAM, GPU, disk, network, temperatures) on the desktop background.

## Yêu cầu

- GNOME Shell 50.
- GPU NVIDIA cần `nvidia-smi` (có sẵn trong driver) để hiện đủ thông số; AMD chỉ có % tải; Intel chưa hỗ trợ.

## Cài đặt

```bash
git clone https://github.com/pushsale/ubuntu-setup.git   # bỏ qua nếu đã clone
cd ubuntu-setup/system-hud
./install.sh
```

Lần cài đầu: đăng xuất rồi đăng nhập lại để HUD hiện ra. Các lần cài lại sau có hiệu lực ngay.

## Đổi giao diện, vị trí

```bash
./hud-config.sh                     # xem cấu hình hiện tại
./hud-config.sh theme orbitalLight  # orbital | orbitalLight | card | tactical | terminal
./hud-config.sh monitor secondary   # primary | secondary | 0 | 1 ...
./hud-config.sh side right          # left | right
./hud-config.sh widthFraction 0.3   # rộng 30% màn hình
./hud-config.sh fps 15              # số khung/giây khi chạy hiệu ứng (ít hơn = nhẹ CPU hơn)
```

Thay đổi áp dụng ngay, không cần đăng xuất.

## Gỡ cài đặt

```bash
gnome-extensions uninstall system-hud@ubuntu-assistant
```

Tài liệu kỹ thuật: [docs/system-hud/](../docs/system-hud/overview.md). Giấy phép: [MIT](../LICENSE).
