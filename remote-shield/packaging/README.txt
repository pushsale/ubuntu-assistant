REMOTE SHIELD — remote vào Ubuntu kiểu Windows Remote Desktop
================================================================

Khi có người kết nối RDP vào phiên đang mở:
  - Màn hình thật tại máy chuyển trắng, chỉ hiện dòng "Máy tính đang được điều khiển từ xa".
  - Bàn phím, chuột tại chỗ bị vô hiệu hoá.
  - Người remote vẫn thấy và điều khiển desktop thật, đủ mọi app đang mở.
  - Cửa sổ ở màn phụ được dồn sang màn chính để người remote thấy hết.
Khi ngắt kết nối: cửa sổ về lại chỗ cũ, máy tự khoá, màn hình hiện lại bình thường.
Máy đang khoá vẫn remote vào được: người remote thấy màn khoá, mở khoá từ xa (màn hình thật vẫn bị che).
Không cần cài thêm extension "Allow Locked Remote Desktop"; nếu máy đã có, install.sh tự gỡ.

YÊU CẦU
  - Ubuntu dùng GNOME Shell 50 trên Wayland (đã thử: Ubuntu 26.04, card NVIDIA).
    GNOME bản khác: cài với --force và kiểm tra kỹ bằng "shieldctl test".
  - gnome-remote-desktop (có sẵn trên Ubuntu Desktop).
  - Nên có gcc để build lại thư viện cho khớp máy: sudo apt install gcc

CÀI ĐẶT (chạy bằng user dùng máy, không dùng sudo)
  tar xzf remote-shield-*.tar.gz
  cd remote-shield-*/
  ./install.sh --rdp --remote-login

  --rdp            bật Desktop Sharing: remote vào phiên đang đăng nhập (có màn che).
  --remote-login   bật Remote Login: remote khi máy chưa đăng nhập (hỏi mật khẩu sudo).
  Bỏ hai tuỳ chọn nếu đã tự bật RDP trong Settings > System > Remote Desktop.
  Script sẽ hỏi tài khoản RDP: đây là tài khoản riêng cho kết nối RDP, có thể khác mật khẩu Ubuntu.

  Sau khi cài: ĐĂNG XUẤT rồi ĐĂNG NHẬP LẠI.
  Kiểm tra màn che ngay tại máy: shieldctl test 10   (màn hình trắng 10 giây rồi tự trở lại)

KẾT NỐI TỪ MÁY KHÁC (Windows: Remote Desktop Connection, macOS: Windows App, Linux: Remmina)
  Máy đang đăng nhập  -> Desktop Sharing: <IP-máy>:3390 (là 3389 nếu không bật Remote Login)
                         Có màn che, thấy đúng các app đang mở.
  Máy chưa đăng nhập  -> Remote Login:    <IP-máy>:3389
                         Đăng nhập tài khoản RDP, rồi đăng nhập Ubuntu. Mở phiên mới, không cần màn che.
  Xem cổng thực tế: grdctl status   và   sudo grdctl --system status
  Nếu bật tường lửa ufw: sudo ufw allow 3389:3390/tcp

LỆNH HỮU ÍCH
  shieldctl status     trạng thái thư viện che màn hình
  shieldctl log        log gần nhất
  shieldctl off        tắt màn che bằng tay (gõ mù được nếu màn hình đang trắng)
  Phím khẩn cấp tại máy khi đang bị che: Ctrl+Alt+Shift+Backspace (ngắt remote và khoá máy)

AN TOÀN
  Nếu không xác nhận được màn hình thật đã bị che, Remote Shield chủ động ngắt kết nối remote
  thay vì để lộ màn hình. Nếu remote vào được rồi bị ngắt ngay: xem "shieldctl status".
  Gỡ khẩn cấp khi không vào được desktop: Ctrl+Alt+F3, đăng nhập, chạy
    rm ~/.config/systemd/user/org.gnome.Shell@.service.d/remote-shield.conf
  rồi khởi động lại máy.

GỠ CÀI ĐẶT
  ./uninstall.sh       rồi đăng xuất, đăng nhập lại.
  (Cấu hình RDP giữ nguyên; tắt trong Settings > System > Remote Desktop nếu cần.)
