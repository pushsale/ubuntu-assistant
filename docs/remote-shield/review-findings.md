# Remote Shield — Kết quả review code (2026-11-13, #29)

Review do một agent riêng thực hiện (chỉ đọc code, đối chiếu mã GNOME Shell 50.1 và log). Chưa sửa mục nào; file này để bàn và chọn hướng sửa. Sửa xong mục nào thì ghi vào "Common Pitfalls" / "Lịch sử" trong [system.md](system.md) rồi đánh dấu ở đây.

Cột "Kiểm chứng": **đã** = đã tự đối chiếu code/log sau khi agent báo; **lập luận** = đọc thấy hợp lý, chưa tái hiện; **chưa** = cả agent lẫn người kiểm tra đều chưa xác nhận.

## Tổng hợp

| # | Mức | Vấn đề | Kiểm chứng | Trạng thái |
|---|---|---|---|---|
| 1 | Cao | Người remote khóa máy → phiên RDP bị GNOME cắt; có thể kẹt rèm + chặn input | đã | chưa sửa |
| 2 | Trung bình | Extension bị tắt/bật lại giữa phiên → lộ desktop và mở input ~0,6 s; tắt hẳn → lộ suốt phiên | đã | chưa sửa |
| 3 | Trung bình | Guard của shim tự gỡ sau một lần thất bại | đã | chưa sửa |
| 4 | Trung bình | Plane chính không thay được nhưng cursor thay được → vẫn báo "đã che" | lập luận | chưa sửa |
| 5 | Trung-thấp | `_verify` có thể qua chỉ nhờ commit riêng của cursor | chưa | chưa sửa |
| 6 | Thấp-TB | Máy cấm khóa màn hình (`disable-lock-screen`) → ngắt remote vẫn gỡ rèm, lộ desktop | lập luận | chưa sửa |
| 7 | Thấp-TB | `shieldctl off` không trả được input khi đang remote (heartbeat tạo lại cờ sau ≤2 s) | đã | chưa sửa |
| 8 | Thấp | Chạm / cử chỉ / bút đang dở lúc bắt đầu chặn → sự kiện kết thúc bị bỏ, Mutter kẹt chuỗi | lập luận | chưa sửa |
| 9 | Thấp | Cache kích thước FB cursor theo `fb_id` có thể cũ khi kernel cấp lại id | chưa | chưa sửa |
| 10 | Thấp | Vẽ lại mỗi phút ngay trên FB đang hiển thị (chớp/xé hình); mã hoá PNG lớn trên main thread | lập luận | chưa sửa |
| 11 | Thấp | Hai màn khác độ phân giải có thể dùng lại FB màn che sai cỡ (đồng hồ lệch) | lập luận | chưa sửa |
| 12 | Thấp | Gỡ cài đặt còn sót: `screen-share-mode`, file marker guard, thư mục cache/config | lập luận | chưa sửa |

## Chi tiết

### 1. Người remote khóa máy → phiên RDP bị cắt

- **Vị trí:** `core.js` `disable()` gọi `_restoreLockedRemote()`; `_restoreLockedRemote` gọi `inhibit_remote_access()` thật `skipped` lần.
- **Cơ chế** (đã đối chiếu `ui/main.js` GNOME 50: `sessionMode.connect('updated', _sessionUpdated)` ở dòng 188, ExtensionManager khởi tạo ở dòng 337, nên `_sessionUpdated` chạy trước):
  1. Khóa máy: GNOME gọi `inhibit_remote_access()` (bản đè của Remote Shield, `skipped = 1`).
  2. GNOME tắt/bật dây chuyền extension → `disable()` trả hàm gốc rồi chặn thật 1 lần.
  3. Mutter đóng mọi phiên remote.
  4. ~0,6 s sau `enable()` gỡ chặn, nhưng phiên đã mất.
- **Log** (lần khóa lúc 09:13:09, không có phiên remote nên không thấy hậu quả): `màn hình khóa: vẫn cho phép` → 17 ms sau `đã tắt` → 09:13:10.246 `đã bật`.
- **Hệ quả phụ (chưa xác minh):** `_carry.handles` giữ handle đã dừng; tín hiệu `stopped` phát lúc không ai nghe → extension coi như còn phiên mãi, rèm và chặn input kẹt tới khi bấm tại máy.
- **Đề xuất:**
  - Khi tắt trong lúc khóa (hoặc khi còn handle): không trả patch, không chặn thật; cất patch vào `_carry` để `enable()` dùng lại.
  - `extension.js` hẹn giờ vài giây: không được bật lại thì mới trả patch thật.
  - Listener `stopped` cho handle đang carry đặt ở `extension.js` (sống qua các lần tắt/bật).
- **Cần bàn:** có nên chuyển hẳn phần "giữ trạng thái qua khóa máy" (patch inhibit, handle, cờ) sang `extension.js` thay vì `core.js`? `extension.js` chỉ nạp lại khi đăng nhập lại.

### 2. Tắt/bật lại extension giữa phiên → lộ desktop ~0,6 s

- **Vị trí:** `core.js` `disable()` gọi `setFlag(false)`, `_blockInput(false)`, `_restoreWindows()` vô điều kiện; `enable()` gọi `setFlag(false)` vô điều kiện; `extension.js` nạp `core.js` bất đồng bộ; `overlay.js` làm mờ lại hình nền mỗi lần (cache khoá nằm trong bộ nhớ).
- **Kích hoạt:** khóa máy có animation; người remote bật/tắt/cài extension bất kỳ; `uninstall.sh` hoặc tắt trong app Extensions qua RDP (khi đó lộ suốt phiên, máy không khóa).
- **Đề xuất:**
  - Còn handle thì `disable()` giữ `blank` và `input-block`; `extension.js` hẹn giờ dọn; `enable()` nhận carry thì huỷ hẹn giờ, không `setFlag(false)`, không trả/dồn lại cửa sổ.
  - Lưu khoá ảnh nền ra đĩa để `enable()` không làm mờ lại.
  - Tắt thật trong lúc remote: dừng handle và khóa máy trước khi bỏ cờ.

### 3. Guard của shim tự gỡ sau một lần

- **Vị trí:** `shield-shim.c` `update_want()`: nhánh tắt cờ `unlink(S.marker)` vô điều kiện; nhánh bật cờ gỡ guard khi marker không còn.
- **Tình huống:** marker sót lúc khởi động → guard bật → RDP lần 1 bị `_fail` (đúng) → tắt cờ xoá marker → RDP lần 2 guard tự gỡ, thay khung lại. Nếu crash trước do chính việc thay khung → gnome-shell crash lại (Wayland: mất cả phiên làm việc).
- **Đề xuất:** chỉ `unlink(S.marker)` khi `!S.guard`.

### 4. Báo "đã che" dù plane chính chưa được thay

- **Vị trí:** `shield-shim.c` hook `drmModeAtomicCommit`: `get_fb` trả 0 thì `continue`; plane không có trong danh sách; `get_dev` NULL khi quá `MAX_DEVS`. `swapped_since_on` tăng chỉ cần một plane (kể cả cursor) được thay.
- **Đề xuất:** plane có `FB_ID` ≠ 0 mà không thay được → `swap_failed = 1` + `last_error`; thêm bộ đếm riêng cho plane không phải cursor và để `_verify` dựa vào đó.

### 5. `_verify` qua nhờ commit chỉ có cursor

- Shim đọc cờ tối đa 1 lần / 100 ms; khung vẽ lại ngay sau `setFlag(true)` có thể chưa bị thay. Nếu sau đó chỉ có commit của cursor (người remote chỉ rê chuột) thì `swapped_since_on > 0` trong khi plane chính vẫn là desktop, tới lần vẽ lại kế tiếp.
- **Chưa xác minh** Mutter 18 có gửi commit chỉ có cursor trong tình huống này không.
- **Đề xuất:** đọc cờ không giới hạn khi cờ đang tắt; thêm một `_redraw` sau 150 ms trong `_engage`; dùng bộ đếm plane chính ở mục 4.

### 6. Không khóa được máy vẫn gỡ rèm

- **Vị trí:** `core.js` `_disengage`: gọi `lock(false)` rồi 800 ms sau `setFlag(false)` không kiểm tra đã khóa chưa. `screenShield.lock()` thoát ngay khi `org.gnome.desktop.lockdown disable-lock-screen = true`.
- **Đề xuất:** sau `lock()` kiểm tra `Main.screenShield.locked`; chưa khóa thì giữ rèm + log/thông báo; cảnh báo ngay khi `enable()` nếu thấy thiết lập này.

### 7. `shieldctl off` không trả input khi đang remote

- **Vị trí:** `core.js` `_blockInput`: interval 2 s gọi `writeFlag(INPUT_FLAG, true)` vô điều kiện.
- **Đề xuất:** heartbeat chỉ cập nhật khi file còn; file đã bị xoá thì coi là lệnh từ người dùng: dừng heartbeat, ghi log. (Cần bàn: `shieldctl off` khi đang remote có nên ngắt luôn phiên remote không.)

### 8–12. Mức thấp

| # | Vị trí | Đề xuất |
|---|---|---|
| 8 | `shield-shim.c` `input_drop` (chỉ theo dõi phím/nút) | Theo dõi slot chạm, cử chỉ, đầu bút đang mở; luôn cho qua sự kiện kết thúc của chúng |
| 9 | `shield-shim.c` `fb_size` (cache theo `fb_id`) | Commit có thay cursor bị từ chối → xoá cache, thử lại một lần trước khi đặt `swap_failed` |
| 10 | `shield-shim.c` `repaint_all` / `paint_fb`; `core.js` `_scheduleClock`; `overlay.js` | Double buffer (vẽ FB thứ hai rồi đổi id); bỏ `memset` khi ảnh đúng cỡ; nền ghi một lần, mỗi phút chỉ vẽ phần chữ |
| 11 | `shield-shim.c` `get_fb` (FB màn che dùng lại khi lớn hơn) | FB màn che cũng chỉ dùng lại khi đúng kích thước |
| 12 | `uninstall.sh`, `install.sh` (đặt `mirror-primary`) | Xoá marker + `~/.cache/remote-shield`; lưu giá trị `screen-share-mode` cũ lúc cài và trả lại khi gỡ |

## Agent đã kiểm tra, không thấy lỗi

- Shim không rò handle GEM, mmap, fd; khôi phục `req` sau commit đúng.
- Script cài/gỡ với đường dẫn có dấu cách, bẫy `set -e`.
- Cân bằng inhibit/uninhibit ở luồng ngắt do người tại máy bấm.
- `-fanalyzer` chỉ báo `calloc` không kiểm tra NULL trong `strip_preload` (nhỏ).

## Hướng xử lý đề xuất

1. Đợt 1 (an toàn, gọn): 3, 7, 4 (+ phần bộ đếm cho 5), 6.
2. Đợt 2 (thiết kế lại giữ trạng thái qua tắt/bật): 1 + 2 cùng lúc, thử RDP rồi khóa máy giữa phiên, bật/tắt extension khác qua RDP.
3. Đợt 3 (khi rảnh): 8–12.
