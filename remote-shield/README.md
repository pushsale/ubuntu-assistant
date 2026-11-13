# Remote Shield

Remote desktop kiểu Windows cho Ubuntu (GNOME 50, Wayland). Khi có người kết nối RDP vào phiên đang mở, màn hình thật tại máy trông như đang khóa, bàn phím và chuột tại máy bị chặn. Người remote vẫn thấy và điều khiển desktop thật với đủ app đang mở. Người ngồi tại máy bấm phím hoặc chuột bất kỳ là phiên remote bị ngắt và ô nhập mật khẩu hiện ra.

> **In English.** A GNOME Shell extension that makes GNOME's built-in RDP behave like Windows Remote Desktop: while someone is connected, the physical screen shows a lock-screen look-alike and local keyboard/mouse are blocked; any local key press or click ends the remote session and shows the password prompt.

Cài cùng các công cụ khác khi chuyển sang máy Ubuntu mới: xem [initial-setup](../initial-setup/README.md).

## Yêu cầu

| | |
|---|---|
| Hệ điều hành | Ubuntu dùng GNOME Shell 50, phiên **Wayland** (đã thử trên Ubuntu 26.04) |
| Card đồ hoạ | Đã chạy với NVIDIA (driver độc quyền) và Intel (i915). AMD về lý thuyết chạy được nhưng chưa kiểm chứng |
| Gói cần có | `git`, `gcc`, `gnome-remote-desktop` (Ubuntu Desktop có sẵn) |
| Quyền | Cài bằng user dùng máy, **không chạy bằng sudo**. Chỉ bật Remote Login mới hỏi mật khẩu sudo |

GNOME bản khác 50 thì script từ chối cài; có thể thử với `--force`, rồi tự kiểm tra kỹ (xem phần Kiểm tra).

## Cài đặt

```bash
sudo apt install git gcc gnome-remote-desktop
git clone https://github.com/pushsale/ubuntu-setup.git
cd ubuntu-setup/remote-shield
./install.sh --rdp --remote-login
```

Không có git: tải ZIP ở nút **Code → Download ZIP** trên GitHub, giải nén, rồi vào thư mục `ubuntu-setup-main/remote-shield`.

Các tuỳ chọn:

| Tuỳ chọn | Tác dụng |
|---|---|
| `--rdp` | Bật **Desktop Sharing**: remote vào phiên đang đăng nhập (có màn che). Script hỏi tài khoản RDP |
| `--remote-login` | Bật **Remote Login**: remote khi máy chưa ai đăng nhập. Hỏi mật khẩu sudo và tài khoản RDP |
| `--force` | Cài trên GNOME Shell khác bản 50 |
| (không có) | Chỉ cài Remote Shield; RDP tự bật trong Settings → System → Remote Desktop |

Tài khoản RDP là tên đăng nhập / mật khẩu riêng cho kết nối RDP, có thể khác mật khẩu Ubuntu.

Sau khi cài: **đăng xuất rồi đăng nhập lại** (thư viện che màn hình chỉ được nạp lúc đăng nhập).

## Kiểm tra

```bash
shieldctl status     # phải thấy "shield-shim: ĐÃ nạp trong gnome-shell"
shieldctl test 10    # màn hình thật hiện như đang khóa trong 10 giây rồi tự trở lại
```

## Kết nối từ máy khác

Dùng Remote Desktop Connection (Windows), Windows App (macOS) hoặc Remmina (Linux).

| Tình huống | Địa chỉ |
|---|---|
| Máy đang đăng nhập (có màn che) | `<IP-máy>:3390` nếu đã bật Remote Login, `<IP-máy>:3389` nếu không |
| Máy chưa đăng nhập | `<IP-máy>:3389` (Remote Login): đăng nhập tài khoản RDP rồi đăng nhập Ubuntu. Đây là phiên mới, không có màn che |

Xem cổng thực tế: `grdctl status` và `sudo grdctl --system status`. Nếu bật tường lửa: `sudo ufw allow 3389:3390/tcp`.

## Khi đang có người remote

- Màn hình thật: hình nền mờ, đồng hồ, ngày, câu "Click or press a key to unlock", giống màn khóa GNOME.
- Bàn phím, chuột thật tại máy không tác động vào máy; con trỏ thật đứng yên.
- Người tại máy bấm phím hoặc chuột bất kỳ: phiên remote bị ngắt, máy khóa, ô nhập mật khẩu hiện ra.
- Máy hai màn hình: RDP chỉ gửi màn chính, nên các cửa sổ ở màn phụ được dồn sang màn chính trong lúc remote và trả về chỗ cũ khi ngắt.
- Ngắt kết nối: máy tự khóa rồi mới hiện lại màn hình.
- Máy đang khóa vẫn remote vào được: người remote thấy màn khóa và mở khóa từ xa, màn hình thật vẫn được che.

## An toàn và gỡ khẩn cấp

- Nếu không xác nhận được màn hình thật đã được che (thư viện chưa nạp, driver từ chối...), Remote Shield **chủ động ngắt phiên remote và khóa máy** thay vì để lộ màn hình. Remote vào được rồi bị ngắt ngay: chạy `shieldctl status` và `shieldctl log` xem lý do.
- Màn che bị kẹt: gõ mù `shieldctl off` trong terminal, hoặc bấm Ctrl+Alt+Shift+Backspace.
- Không vào được desktop: Ctrl+Alt+F3, đăng nhập, chạy lệnh dưới rồi khởi động lại máy.

  ```bash
  rm ~/.config/systemd/user/org.gnome.Shell@.service.d/remote-shield.conf
  ```

Remote Shield nạp một thư viện nhỏ vào tiến trình `gnome-shell` (LD_PRELOAD) để thay hình ảnh gửi ra màn hình thật và chặn input thật. Mọi thứ cài trong thư mục home của user, không sửa file hệ thống.

## Gỡ cài đặt

```bash
cd ubuntu-setup/remote-shield   # thư mục đã clone
./uninstall.sh
```

Rồi đăng xuất, đăng nhập lại. Cấu hình RDP giữ nguyên; tắt trong Settings → System → Remote Desktop nếu cần.

## Cấu hình

File `~/.local/share/gnome-shell/extensions/remote-shield@ubuntu-assistant/config.json`. Các khoá chính:

| Khoá | Mặc định | Ý nghĩa |
|---|---|---|
| `blockInput` | `true` | Chặn bàn phím, chuột thật trong lúc remote |
| `localTakeover` | `true` | Bấm tại máy là ngắt remote. `false`: chỉ Ctrl+Alt+Shift+Backspace |
| `lockOnDisconnect` | `true` | Khóa máy khi ngắt kết nối |
| `gatherWindows` | `true` | Dồn cửa sổ màn phụ sang màn chính trong lúc remote |
| `allowWhenLocked` | `true` | Cho remote vào khi máy đang khóa |
| `failClosed` | `true` | Không che được màn hình thì ngắt remote |
| `hint` | `""` | Dòng gợi ý dưới ngày: `""` = câu của màn khóa GNOME, `null` = không có |

Sửa xong chạy lại `./install.sh` để áp dụng.

## Báo lỗi

Mở issue trên GitHub, kèm `gnome-shell --version`, card đồ hoạ, kết quả `shieldctl status`, `shieldctl log 50` và `journalctl --user -b | grep remote-shield`. Không dán mật khẩu RDP, địa chỉ IP công khai hay thông tin tài khoản vào issue.

Tài liệu kỹ thuật: [docs/remote-shield/](../docs/remote-shield/overview.md). Giấy phép: [MIT](../LICENSE).
