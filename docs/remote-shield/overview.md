# Remote Shield — Tổng quan

Remote Shield cho phép remote vào máy Ubuntu giống Windows Remote Desktop. Khi có người kết nối RDP, màn hình thật tại máy hiện như đang khóa và bàn phím, chuột tại chỗ bị khoá. Người remote vẫn thấy và điều khiển đúng desktop đang mở.

## Bài toán giải quyết

| Bài toán | Cách xử lý |
|---|---|
| RDP của GNOME chỉ chia sẻ màn hình: người ngồi tại máy thấy hết mọi thao tác của người remote | Thay khung hình ngay trước khi giao cho card màn hình: màn hình thật nhận khung giống màn khóa, còn ảnh gửi cho RDP vẫn là desktop thật |
| Che bằng một lớp phủ trong GNOME thì người remote cũng bị che (RDP chụp chính hình GNOME vẽ) | Không che trong GNOME mà che ở tầng thấp hơn (giao khung cho driver), nơi RDP không đi qua |
| Người tại chỗ vẫn bấm phím, rê chuột được trong lúc người khác đang remote | Bỏ sự kiện của bàn phím, chuột thật ngay khi Mutter đọc từ libinput (con trỏ thật cũng đứng yên); thiết bị ảo của phiên RDP không đi qua đó nên vẫn được nhận |
| Ngắt kết nối xong, desktop lộ ra cho người đứng ở máy | Khoá máy trước rồi mới trả lại màn hình |
| Máy hai màn hình nhưng RDP chỉ gửi màn chính: app ở màn phụ không với tới được | Khi remote vào: dồn cửa sổ ở màn phụ sang màn chính (vào đúng workspace đang xem, co cho vừa màn); cửa sổ mở mới hoặc bị chuyển sang màn phụ trong lúc remote cũng được dồn về; khi ngắt: trả từng cửa sổ về đúng chỗ cũ |
| GNOME chặn remote khi màn hình khóa; mà Remote Shield khóa máy sau mỗi lần ngắt, nên lần sau không vào lại được | Remote Shield tự gỡ lệnh chặn đó (thay cho extension Allow Locked Remote Desktop phải cài riêng trước đây); người remote vào màn khóa và mở khóa từ xa, màn hình thật vẫn bị che |
| Không chắc màn hình đã được che (lỗi driver, thư viện chưa nạp) | Không xác nhận được trong 4 giây thì chủ động ngắt phiên remote và khoá máy, không để lộ màn hình |
| Cài lên máy khác phải làm tay nhiều bước | Gói `remote-shield-<phiên bản>.tar.gz` có một lệnh cài, tuỳ chọn bật luôn RDP |

## Kiến trúc

```
  Người remote (Windows Remote Desktop / Remmina / Windows App)
              │  RDP
              ▼
  gnome-remote-desktop ── lấy hình qua ScreenCast API ──┐
              │ tạo phiên remote                         │ (ảnh desktop thật)
              ▼                                          │
  ┌─────────────────────── gnome-shell (Mutter) ─────────┴──────────┐
  │  Extension Remote Shield  (bộ điều khiển)                        │
  │    phát hiện phiên RDP → bật cờ che, cờ chặn input, dồn cửa sổ   │
  │    chờ xác nhận đã che → nếu không: ngắt RDP + khoá máy          │
  │              │ file cờ / file trạng thái ($XDG_RUNTIME_DIR)      │
  │              ▼                                                   │
  │  shield-shim.so  (nạp sẵn vào gnome-shell qua LD_PRELOAD)        │
  │    chặn lệnh giao khung drmModeAtomicCommit                      │
  │    đổi khung đã vẽ → khung giống màn khóa                        │
  │    chặn libinput_get_event: bỏ phím/chuột thật, báo cú bấm       │
  └──────────────────────────────┬──────────────────────────────────┘
                                 ▼ khung giống màn khóa
                    Driver đồ hoạ (KMS) → màn hình thật
```

## Vai trò từng lớp

| Lớp | Vai trò | Công nghệ |
|---|---|---|
| gnome-remote-desktop | Máy chủ RDP của GNOME: nhận kết nối, gửi hình, nhận phím chuột từ xa | Có sẵn trong Ubuntu |
| Extension Remote Shield | Biết khi nào có phiên RDP, ra lệnh che, chặn input tại chỗ, dồn cửa sổ, khoá máy khi ngắt, kiểm tra an toàn | GNOME Shell extension (GJS) |
| shield-shim | Đổi khung hình ngay trước khi giao cho card màn hình; chặn bàn phím, chuột thật và báo khi người tại máy bấm | Thư viện C nạp bằng LD_PRELOAD |
| shieldctl | Lệnh kiểm tra, xem log, bật/tắt tay, gỡ khoá an toàn | Bash |
| install.sh / package.sh | Cài lên máy, bật RDP, đóng gói đem cài máy khác | Bash |

## Feature cung cấp gì cho từng đối tượng

| Đối tượng | Nhận được |
|---|---|
| Người remote | Thấy và điều khiển đúng desktop đang mở, đủ app (kể cả app ở màn phụ) |
| Người ngồi tại máy | Thấy màn hình như máy đang khóa (hình nền mờ, đồng hồ chạy), không lộ là có người remote; bấm chuột hoặc phím bất kỳ thì phiên remote bị ngắt và ô nhập mật khẩu hiện ra để vào máy |
| Người quản trị | Một lệnh cài cho máy mới, lệnh `shieldctl` để kiểm tra, log rõ ràng trong journal |

## Tính năng chính theo mốc thời gian

| Ngày | Mốc |
|---|---|
| 2026-11-12 | Bản thử nghiệm che bằng lớp phủ trong GNOME (tên cũ "Remote Curtain"): bị loại vì người remote cũng bị che |
| 2026-11-12 | Chứng minh đổi khung ở tầng giao khung cho card: 2.129 khung thay thế, 0 lỗi; ảnh chụp màn hình GNOME vẫn là desktop thật |
| 2026-11-12 | Bản hoàn chỉnh 2.0: extension điều khiển + shim, kiểm tra an toàn, khoá máy khi ngắt. Thử RDP thật thành công. Đổi tên thành Remote Shield |
| 2026-11-12 | Dồn cửa sổ từ màn phụ sang màn chính khi remote, trả lại khi ngắt; cập nhật extension không cần đăng xuất |
| 2026-11-13 | Sửa lỗi Remote Login bị văng ra sau khi gõ mật khẩu (Remote Shield không can thiệp phiên không có màn hình thật) |
| 2026-11-13 | Đóng gói `remote-shield-2.0.tar.gz` để cài lên máy Ubuntu khác |
| 2026-11-13 | Remote được cả khi máy đang khóa, không cần cài thêm extension nào |
| 2026-11-13 | Màn che giống hệt màn khóa; người tại máy bấm là ngắt remote và nhập mật khẩu vào máy |
| 2026-11-13 | Sửa dồn cửa sổ từ màn phụ (trước đó báo đã dồn nhưng cửa sổ Wayland vẫn nằm ở màn phụ); dồn cả cửa sổ mở trong lúc remote |
| 2026-11-13 | Chặn bàn phím, chuột tại máy ở tầng thấp hơn (trước đó phím tại máy vẫn lọt vào app và bấm tại máy chỉ thỉnh thoảng ngắt được remote); giữ phiên remote khi người remote khóa máy |

## Tech stack

- Ubuntu 26.04, GNOME Shell 50 / Mutter 18, phiên Wayland
- gnome-remote-desktop 50 (RDP)
- GJS (JavaScript của GNOME) cho extension; C (gcc, ioctl DRM, không cần libdrm-dev) cho shim; cairo để ghép ảnh chữ
- systemd user drop-in để nạp shim vào gnome-shell

## Quy mô hiện tại

- Khoảng 2.250 dòng code: shim C 1.026 dòng, extension 944 dòng JS (core 703, overlay 206, extension 35), script cài/gỡ/đóng gói/xem trước khoảng 270 dòng.
- Gói cài 64 KB.
- Đang chạy trên 1 máy: card NVIDIA GTX 1660, 2 màn hình Dell (DP-2 chính, HDMI-3 phụ).
- Đã thử: Desktop Sharing (RDP vào phiên đang mở) và Remote Login (RDP khi chưa đăng nhập) đều hoạt động.

## Đặc điểm nổi bật

- Người remote không bị che: khác với cách phủ lớp trong GNOME, ảnh gửi đi là desktop thật.
- An toàn theo mặc định: không xác nhận được màn hình đã che thì ngắt remote; ngắt xong thì khoá máy trước rồi mới hiện màn hình.
- Không sửa file hệ thống, không cần quyền root để cài phần che (chỉ bật Remote Login mới cần sudo).
- Gỡ khẩn cấp bằng một lệnh xoá file từ TTY.

## Giới hạn hiện tại

- Chỉ chạy trên GNOME Shell 50, phiên Wayland. Bản GNOME khác phải cài với `--force` và tự kiểm tra.
- Mới thử với card NVIDIA. Card Intel/AMD về lý thuyết chạy được nhưng chưa kiểm chứng.
- Phụ thuộc bố cục bên trong của libdrm. Bản libdrm khác bố cục thì shim tự tắt và Remote Shield sẽ ngắt mọi phiên remote (an toàn nhưng không remote được).
- RDP phải ở chế độ chỉ gửi màn hình chính (`mirror-primary`); không hỗ trợ gửi nhiều màn hình.
- Thay đổi thư viện shim cần đăng xuất rồi đăng nhập lại.
- Chặn input thật dựa vào libinput (Mutter dùng trên mọi máy Wayland); thiết bị đi đường khác libinput sẽ không bị chặn.
- Màn che chỉ giống phần chính của màn khóa (hình nền mờ, giờ, ngày, câu gợi ý); chưa vẽ thanh trên cùng (biểu tượng mạng, âm lượng, nguồn) và thông báo của màn khóa thật. Màn che là ảnh tĩnh, đồng hồ cập nhật theo phút.
- Hình nền chỉ hỗ trợ kiểu hiển thị "zoom" (mặc định); hình nền dạng slideshow XML thì dùng màu nền.

## Roadmap (tạm dự kiến)

- Thử trên máy dùng card Intel/AMD.
- Cân nhắc đóng gói `.deb` nếu cần cài cho nhiều máy, nhiều user.

## Tài liệu liên quan

- Chi tiết kỹ thuật: [system.md](system.md)
- Mục lục: [../index.md](../index.md)
- Hướng dẫn cài cho người dùng cuối: `remote-shield/packaging/README.txt`
- Liên hệ: chủ dự án
