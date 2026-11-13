# Ubuntu Setup — hướng dẫn cho Claude

Thư mục này dùng khi chuyển sang một máy Ubuntu mới (hoặc cài lại máy). Người dùng chỉ cần nói kiểu "cài đặt máy theo ubuntu-setup" là Claude đọc file này rồi làm theo.

Bước cài Claude do người dùng tự làm bằng cách dán lệnh ở [README.md](README.md) (Claude chưa có trên máy lúc đó). Danh sách cần cài sau đó nằm ở [packages.md](packages.md). File này chỉ mô tả **cách làm**; nội dung cần cài do người dùng quyết định trong `packages.md`.

## Quy trình

1. **Đọc máy:** `lsb_release -ds`, `gnome-shell --version`, `echo $XDG_SESSION_TYPE`, card đồ hoạ (`lspci | grep -iE 'vga|3d'`), kiến trúc (`uname -m`). Ghi lại để so với cột "Yêu cầu" của từng mục.
2. **Đọc `packages.md`** từ trên xuống. Bỏ qua mục có trạng thái `bỏ` hoặc nằm trong khối "Mẫu".
3. **Kiểm tra từng mục** bằng lệnh ở cột "Kiểm tra". Lệnh trả về thành công (exit 0) nghĩa là đã cài: không làm gì, ghi "đã có".
4. **Lập kế hoạch** trước khi cài bất cứ thứ gì: một bảng gồm mục sẽ cài, mục đã có, mục bỏ qua (kèm lý do: không hợp máy, thiếu thông tin). Gửi cho người dùng, chờ đồng ý.
5. **Cài theo thứ tự nhóm** trong `packages.md` (thứ tự do người dùng chọn, nhóm trên là nền tảng cho nhóm dưới). Trong một nhóm, cài theo thứ tự dòng. Nhóm "Kiểm tra máy" lỗi mạng thì dừng toàn bộ.
6. **Xác minh** lại từng mục bằng lệnh "Kiểm tra" sau khi cài. Mục nào lỗi: dừng mục đó, ghi lỗi, làm tiếp mục khác không phụ thuộc nó.
7. **Báo cáo** cuối cùng: bảng mục ↔ kết quả (đã có / đã cài / lỗi + lý do / bỏ qua), và các việc người dùng còn phải tự làm (đăng xuất, đăng nhập tài khoản, nhập license...).

## Quy tắc an toàn

- **Mật khẩu sudo:** không bao giờ tự gõ. Lệnh cần sudo thì chạy trong terminal của người dùng (để họ nhập mật khẩu), gom nhiều lệnh apt vào một lần để chỉ hỏi mật khẩu một lần.
- **Tài khoản, license, token, khoá API:** không bao giờ nhập thay. Ghi vào phần "việc người dùng tự làm".
- **Nguồn ngoài kho Ubuntu** (PPA, kho riêng của hãng, file `.deb` tải về, `curl | sh`, Flatpak/Snap không phải của hãng): chỉ dùng đúng nguồn ghi trong `packages.md`. Nguồn chưa ghi hoặc khác đi thì hỏi trước. Script tải về phải đọc trước khi chạy.
- **Mục có cờ `hỏi trước`** trong cột "Ghi chú": luôn hỏi lại người dùng ngay trước khi làm, kể cả khi kế hoạch đã được duyệt.
- **Thay đổi thiết lập hệ thống** (phím tắt, gsettings, file cấu hình): ghi rõ giá trị cũ trong báo cáo để có thể trả lại.
- Không cài thêm thứ gì ngoài danh sách. Thấy thiếu thứ gì đáng cài thì đề xuất, không tự cài.

## Cách đọc `packages.md`

Mỗi nhóm là một bảng:

| Cột | Ý nghĩa |
|---|---|
| Tên | Tên ngắn của mục |
| Mục đích | Để làm gì (giúp quyết định khi máy không phù hợp) |
| Cài | Lệnh hoặc cách cài. `apt:`, `snap:`, `flatpak:` + tên gói là cài từ kho tương ứng; `repo:` + đường dẫn là chạy script trong repo này; `gsettings:` là đổi thiết lập; còn lại là mô tả các bước |
| Kiểm tra | Lệnh trả exit 0 khi đã cài / đã đúng thiết lập. Trong bảng, `\|` là dấu `|` (escape của Markdown): bỏ dấu `\` khi chạy |
| Yêu cầu | Điều kiện máy (vd "GNOME 50, Wayland", "card NVIDIA"). Máy không khớp thì bỏ qua và ghi lý do |
| Ghi chú | Cờ `hỏi trước`, việc người dùng tự làm, lưu ý khác |
| Trạng thái | `cài` (mặc định) / `bỏ` / `đề xuất` (Claude đề xuất, người dùng chưa duyệt: hỏi trước khi cài) |

## Lưu ý

- Repo này **public**: không ghi mật khẩu, token, license key, IP nội bộ, tên máy hay đường dẫn cá nhân vào `packages.md`.
- Khi người dùng thêm/sửa mục, giữ đúng định dạng bảng để lần sau đọc được.
- Thêm cách cài mới (vd mục cần nhiều bước) thì ghi các bước vào cột "Cài" hoặc thêm một mục con dưới bảng, không viết script riêng trừ khi người dùng yêu cầu.
- Tài liệu: [docs/ubuntu-setup/](../docs/ubuntu-setup/overview.md).
