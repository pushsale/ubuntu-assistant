# Initial Setup — hướng dẫn cho Claude

Thư mục này dùng khi chuyển sang một máy Ubuntu mới (hoặc cài lại máy). Người dùng đã tự cài Claude theo [README.md gốc](../README.md), rồi giao việc kiểu "cài đặt máy theo initial-setup". Claude đọc file này rồi làm theo.

Hai phần việc, chi tiết ở [packages.md](packages.md):

- **Phần A**: [install-basic.sh](install-basic.sh) cài mọi thứ đơn giản trong một lượt, người dùng nhập mật khẩu sudo một lần.
- **Phần B**: các mục phức tạp Claude làm từng mục.

## Quy trình

1. **Repo:** đang làm việc trong bản clone của repo (thường là `~/ubuntu-setup`). Chưa có thì `git clone https://github.com/pushsale/ubuntu-setup.git ~/ubuntu-setup`; có rồi thì `git -C ~/ubuntu-setup pull --ff-only`.
2. **Đọc máy:** `lsb_release -ds`, `gnome-shell --version`, `echo $XDG_SESSION_TYPE`, card đồ hoạ (`lspci | grep -iE 'vga|3d'`), kiến trúc (`uname -m`).
3. **Kiểm tra Phần A:** chạy `initial-setup/install-basic.sh --check` (không cần sudo, không thay đổi máy). Đọc bảng giữa hai dòng `=== TỔNG KẾT ===`.
4. **Chạy Phần A:** còn mục `CHƯA CÓ` thì chạy `initial-setup/install-basic.sh` (không có `--check`, **không** thêm `sudo` phía trước) **trong terminal của người dùng** để họ nhập mật khẩu một lần. Không cần hỏi duyệt riêng: người dùng giao việc cài máy là đã đồng ý Phần A. Báo trước một câu: "Script sẽ hỏi mật khẩu đăng nhập Ubuntu một lần."
   - Chờ script chạy xong (có thể vài phút do tải Chrome, snap). Đọc tổng kết trong terminal hoặc ở cuối `~/.cache/initial-setup/install-basic.log`.
   - `mang` = `LỖI`: dừng toàn bộ, chẩn đoán (`ip route`, `resolvectl status`, `nmcli`) và báo người dùng; không tự đổi cấu hình mạng.
   - Mục `LỖI` khác: đọc log tìm nguyên nhân, sửa nếu là lỗi tạm (mạng chập chờn, apt đang khoá) bằng cách chạy lại script; lỗi khác thì ghi vào báo cáo.
   - Mục `CẦN XỬ LÝ`: làm theo cột "Ghi chú" của mục đó trong Phần A.
5. **Lập kế hoạch Phần B:** chạy lệnh "Kiểm tra" từng mục Phần B, lập bảng mục sẽ làm / đã có / bỏ qua (kèm lý do). Gửi người dùng, chờ đồng ý. Mục có cờ `hỏi trước` hỏi riêng ngay trước khi làm.
6. **Làm Phần B** theo thứ tự nhóm, trong nhóm theo thứ tự dòng. Sau mỗi mục chạy lại lệnh "Kiểm tra". Mục lỗi: dừng mục đó, ghi lỗi, làm tiếp mục khác không phụ thuộc nó.
7. **Báo cáo** cuối cùng: bảng mục ↔ kết quả (cả Phần A và B), giá trị thiết lập cũ đã đổi (lấy từ cột "GHI CHÚ" của tổng kết), và các việc người dùng còn phải tự làm (đăng xuất / đăng nhập lại, đăng nhập tài khoản, đặt mật khẩu RustDesk...).

## Quy tắc an toàn

- **Mật khẩu sudo:** không bao giờ tự gõ. Lệnh cần sudo (kể cả `install-basic.sh`) chạy trong terminal của người dùng để họ tự nhập.
- **Tài khoản, license, token, khoá API:** không bao giờ nhập thay. Ghi vào phần "việc người dùng tự làm".
- **Nguồn ngoài kho Ubuntu** (PPA, kho riêng của hãng, file `.deb` tải về, `curl | sh`, Flatpak/Snap không phải của hãng): chỉ dùng đúng nguồn ghi trong `packages.md` / `install-basic.sh`. Nguồn chưa ghi hoặc khác đi thì hỏi trước. Script tải về phải đọc trước khi chạy.
- **Mục có cờ `hỏi trước`:** luôn hỏi lại người dùng ngay trước khi làm, kể cả khi kế hoạch đã được duyệt.
- **Thay đổi thiết lập hệ thống** (phím tắt, gsettings, file cấu hình): ghi rõ giá trị cũ trong báo cáo để có thể trả lại.
- Không cài thêm thứ gì ngoài danh sách. Thấy thiếu thứ gì đáng cài thì đề xuất, không tự cài.

## Cách đọc bảng Phần B trong `packages.md`

| Cột | Ý nghĩa |
|---|---|
| Tên | Tên ngắn của mục |
| Mục đích | Để làm gì (giúp quyết định khi máy không phù hợp) |
| Cài | Lệnh hoặc cách cài. `apt:`, `snap:`, `flatpak:` + tên gói là cài từ kho tương ứng; `repo:` + đường dẫn là chạy script trong repo này; `gsettings:` là đổi thiết lập; còn lại là mô tả các bước |
| Kiểm tra | Lệnh trả exit 0 khi đã cài / đã đúng thiết lập. Trong bảng, `\|` là dấu `|` (escape của Markdown): bỏ dấu `\` khi chạy |
| Yêu cầu | Điều kiện máy (vd "GNOME 50, Wayland", "card NVIDIA"). Máy không khớp thì bỏ qua và ghi lý do |
| Ghi chú | Cờ `hỏi trước`, việc người dùng tự làm, lưu ý khác |
| Trạng thái | `cài` (mặc định) / `bỏ` / `đề xuất` (người dùng chưa duyệt: hỏi trước khi cài) |

Bỏ qua khối "Mẫu" và mục có trạng thái `bỏ`.

## Thêm mục mới

- Chỉ cần một lệnh cài, không hỏi gì, không cần tài khoản, chạy lại an toàn: thêm vào `install-basic.sh` (Phần A) và một dòng vào bảng Phần A. Giữ đúng mẫu: kiểm tra trước, `--check` thì chỉ ghi `CHƯA CÓ`, kết quả qua hàm `note`. Chạy `bash -n` và `--check` sau khi sửa.
- Còn lại: thêm dòng vào bảng Phần B.

## Lưu ý

- Repo này **public**: không ghi mật khẩu, token, license key, IP nội bộ, tên máy hay đường dẫn cá nhân vào bất kỳ file nào ở đây.
- Tài liệu kỹ thuật: [docs/initial-setup/](../docs/initial-setup/overview.md).
