# Remote Shield — Chi tiết kỹ thuật

Đọc xong file này là đủ để sửa Remote Shield mà không cần hỏi lại. Bối cảnh cho người không đọc code: [overview.md](overview.md).

## 1. Tổng quan, tech stack, cách chạy

Remote Shield gồm 2 phần chạy trong cùng tiến trình `gnome-shell` của user:

- **Extension** `remote-shield@ubuntu-assistant` (GJS). Nghe phiên remote từ Mutter, ra lệnh che, chặn input thật, dồn cửa sổ, khoá máy khi ngắt và kiểm tra an toàn.
- **shield-shim.so** (C, LD_PRELOAD). Thay hàm `drmModeAtomicCommit` của libdrm: khi có cờ che, đổi `FB_ID` của mọi plane thành framebuffer màn che do shim tự tạo (ảnh giống màn khóa do extension vẽ), rồi mới gửi xuống driver.

Hai phần nói chuyện qua file trong `$XDG_RUNTIME_DIR/remote-shield/`, không dùng D-Bus.

Môi trường đã kiểm chứng:

| Thành phần | Thông số |
|---|---|
| Hệ điều hành | Ubuntu 26.04.1 |
| Shell | GNOME Shell 50.1, Mutter 18 (libmutter-18), Wayland |
| libdrm | 2.4.131 |
| RDP | gnome-remote-desktop 50.2 |
| GPU | NVIDIA GTX 1660, driver 595, nvidia-drm. KMS nằm ở `/dev/dri/card1`; `card0` là i915 không có output |
| Màn hình | DP-2 (Dell U2422H, chính, x=1920) và HDMI-3 (Dell P2419H, x=0) |

Lệnh (chạy trong `remote-shield/`, bằng user desktop, không dùng sudo):

```bash
./install.sh                         # build shim (nếu có gcc), cài extension + drop-in, nạp lại extension
./install.sh --rdp --remote-login    # thêm: bật Desktop Sharing + Remote Login (Remote Login hỏi sudo)
./uninstall.sh                       # gỡ sạch, giữ cấu hình RDP
./package.sh                         # tạo dist/remote-shield-<version-name>.tar.gz
./shim/build.sh                      # chỉ build shim/build/shield-shim.so + shield-selftest
shieldctl test 10                    # che màn hình thật 10 giây rồi trả lại (sau khi đăng nhập lại)
```

Đổi shim cần đăng xuất rồi đăng nhập lại. Đổi `core.js` hoặc `overlay.js` chỉ cần chạy `./install.sh`, vì file khởi động mỏng sẽ nạp bản mới.

## 2. Kiến trúc và pipeline

```
RDP client ──► gnome-remote-desktop (user daemon, cổng 3389/3390)
                 │ D-Bus org.gnome.Mutter.RemoteDesktop + ScreenCast
                 ▼
gnome-shell ─ MetaRemoteAccessController ── 'new-handle' ──► ShieldCore._onNewHandle
   │                                                            │ _isRemote? ─ không ─► bỏ qua (họp trực tuyến)
   │                                                            ▼
   │                                                        _engage()
   │                          ┌──────────────────────────────┼──────────────────────────┐
   │                          ▼                              ▼                          ▼
   │               _blockInput(true): file        setFlag(true): tạo file    _gatherWindows()
   │               $RUN/input-block (ghi lại 2 s)  $RUN/blank + queue_redraw  move_to_monitor(primary)
   │                                                         │
   │   Mutter vẽ stage ──► ScreenCast lấy ảnh (desktop thật) ─┼─► RDP
   │                │                                         │
   │                ▼                                         ▼
   │   meta_kms ── drmModeAtomicCommit(req) ──► shield-shim (đọc cờ mỗi ≤100 ms)
   │                                              │ đổi FB_ID plane → FB màn che / trong suốt (cursor)
   │                                              │ gọi hàm thật ── lỗi? → khôi phục, gửi lại khung gốc, swap_failed=1
   │                                              │ ghi $RUN/shim-status (swapped_since_on, ...)
   │                                              ▼
   │                                      nvidia-drm ──► màn hình thật: giống màn khóa
   │
   ├─ _verify() đọc shim-status mỗi 250 ms ─ OK ─► _watch() mỗi 2 s
   │                                     └ quá verifyMs hoặc lỗi ─► _fail(): stop handle + _disengage(lock)
   │
   └─ luồng input của Mutter ── libinput_get_event() ──► shield-shim (đọc input-block mỗi ≤50 ms)
         bàn phím / chuột thật                            │ đang chặn: bỏ sự kiện, cú bấm → ghi $RUN/local-press
         (thiết bị ảo RDP không qua libinput)              ▼
                                       Gio.FileMonitor ─► _onLocalPress ─► _localTakeover: stop handle + _disengage(lock) + ô mật khẩu

Ngắt kết nối: handle 'stopped' ─► _sync ─► _disengage(true):
   xoá input-block → _restoreWindows → khoá máy → sau 800 ms xoá cờ + redraw (màn hình thật hiện màn khoá)
```

Vì sao RDP không bị che: gnome-remote-desktop lấy ảnh từ stage của Mutter qua ScreenCast (bộ nhớ đệm GPU riêng), còn shim chỉ đổi framebuffer gửi tới plane KMS. Hai đường này tách nhau sau khi Mutter vẽ xong.

## 3. Luồng chi tiết (tham chiếu code)

Đường dẫn tính từ gốc repo.

### 3.1 Extension

| Bước | Code |
|---|---|
| Nạp core.js kèm `?v=<Date.now()>` (bỏ qua cache ESM); giữ object `_carry` qua các lần tắt/bật | [extension.js:9](../../remote-shield/remote-shield@ubuntu-assistant/extension.js) |
| Nạp overlay.js cùng mã phiên bản | [core.js:30](../../remote-shield/remote-shield@ubuntu-assistant/core.js) |
| Phiên headless (Remote Login) → không làm gì | [core.js:121](../../remote-shield/remote-shield@ubuntu-assistant/core.js) |
| enable: đọc config, xoá cờ, vẽ sẵn ảnh màn che (làm mờ hình nền), nghe `new-handle`, theo dõi `local-press`, nhận lại handle từ `_carry` | `enable` [core.js:116](../../remote-shield/remote-shield@ubuntu-assistant/core.js) |
| disable (cả khi GNOME tắt/bật lại lúc khóa máy): chuyển handle đang chạy vào `_carry` | `disable` [core.js:169](../../remote-shield/remote-shield@ubuntu-assistant/core.js) |
| Nhận diện phiên remote | `_isRemote` [core.js:430](../../remote-shield/remote-shield@ubuntu-assistant/core.js) |
| Theo dõi handle, `stopped` → `_sync` | `_track` [core.js:443](../../remote-shield/remote-shield@ubuntu-assistant/core.js) |
| Kéo rèm | `_engage` [core.js:488](../../remote-shield/remote-shield@ubuntu-assistant/core.js) |
| Chờ xác nhận / theo dõi | `_verify` [core.js:507](../../remote-shield/remote-shield@ubuntu-assistant/core.js), `_watch` [core.js:535](../../remote-shield/remote-shield@ubuntu-assistant/core.js), `_shimProblem` [core.js:550](../../remote-shield/remote-shield@ubuntu-assistant/core.js) |
| Fail-closed | `_fail` [core.js:563](../../remote-shield/remote-shield@ubuntu-assistant/core.js) |
| Mở rèm (trả input, khoá trước, 800 ms sau mới xoá cờ) | `_disengage` [core.js:575](../../remote-shield/remote-shield@ubuntu-assistant/core.js) |
| Dồn / trả cửa sổ (đặt bằng toạ độ, theo dõi tiếp trong lúc remote) | `_gatherWindows` [core.js:612](../../remote-shield/remote-shield@ubuntu-assistant/core.js), `_placeWindow` [core.js:656](../../remote-shield/remote-shield@ubuntu-assistant/core.js), `_watchWindows` [core.js:673](../../remote-shield/remote-shield@ubuntu-assistant/core.js), `_restoreWindows` [core.js:711](../../remote-shield/remote-shield@ubuntu-assistant/core.js) |
| Cho remote khi màn hình khóa (thay hàm inhibit/uninhibit của controller) | `_allowLockedRemote` [core.js:379](../../remote-shield/remote-shield@ubuntu-assistant/core.js), `_restoreLockedRemote` [core.js:409](../../remote-shield/remote-shield@ubuntu-assistant/core.js) |
| Vẽ ảnh màn che cho từng kích thước màn hình, đổi `shield.gen` | `_renderShield` [core.js:257](../../remote-shield/remote-shield@ubuntu-assistant/core.js); đồng hồ chạy: `_scheduleClock` [core.js:295](../../remote-shield/remote-shield@ubuntu-assistant/core.js) |
| Người tại máy bấm → ngắt remote, khóa, hiện ô mật khẩu | `_localTakeover` [core.js:360](../../remote-shield/remote-shield@ubuntu-assistant/core.js) |
| Chặn input thật: tạo + ghi lại `input-block` mỗi 2 s (shim cũ chưa có `input_hook=1` thì dùng bộ lọc Clutter dự phòng) | `_blockInput` [core.js:319](../../remote-shield/remote-shield@ubuntu-assistant/core.js) |
| shim báo có cú bấm → `_localTakeover` (tắt `localTakeover` thì chỉ Ctrl+Alt+Shift+Backspace) | `_onLocalPress` [core.js:344](../../remote-shield/remote-shield@ubuntu-assistant/core.js) |
| Bộ lọc Clutter dự phòng (chỉ khi shim là bản cũ) | `_filter` [core.js:731](../../remote-shield/remote-shield@ubuntu-assistant/core.js) |
| Vẽ ảnh giống màn khóa: hình nền zoom → thu 1/8 → Gauss sigma 45/8 → sáng 0.65 → phóng lại; giờ/ngày/gợi ý (Pango/Cairo) | `ShieldPainter` [overlay.js](../../remote-shield/remote-shield@ubuntu-assistant/overlay.js) |

Quy tắc nhận diện (`_isRemote`): handle có GType chứa `RemoteDesktop`, hoặc `disable_animations = true`, hoặc config `matchAllRemote`. Một kết nối RDP sinh 2 handle: `MetaScreenCastSessionHandle` (disable-animations=true) và `MetaRemoteDesktopSessionHandle` (false). Chia sẻ màn hình khi họp trực tuyến không khớp quy tắc nên không bị che.

Chặn input (#25):
- Làm ở shim, hook `libinput_get_event`. Mutter đọc bàn phím / chuột / touchpad thật qua libinput trong luồng input riêng; thiết bị ảo của phiên RDP (`ClutterVirtualInputDevice`) không đi qua libinput nên không bị đụng tới.
- Không dùng được `Clutter.Event.add_filter` của extension: Mutter đăng ký bộ lọc `meta_display_handle_event` (src/core/events.c) trước; nó giao phím / chuột thẳng cho cửa sổ Wayland (`meta_wayland_compositor_handle_event`), cho bộ gõ IBus, cho phím tắt rồi trả `EVENT_STOP`, nên bộ lọc thêm sau chỉ thấy sự kiện rơi vào giao diện shell (hình nền, thanh trên cùng, HUD).
- Đang chặn: bỏ mọi sự kiện loại 300–899 của libinput (phím, chuột, cuộn, cảm ứng, bút, cử chỉ); con trỏ thật đứng yên. Loại 900 (công tắc gập nắp) và thêm/bớt thiết bị luôn cho qua.
- Nhả phím / nút chỉ bị bỏ khi lần bấm tương ứng đã bị bỏ (bitmap `down` / `swallowed` theo mã evdev), để Mutter không bao giờ thấy phím kẹt khi bật/tắt chặn giữa lúc đang giữ phím.
- Mỗi cú bấm (phím, nút chuột, chạm, đầu bút) ghi `local-press` = `"<số lần> <combo>"`, tối đa 5 lần/giây; `combo = 1` khi là Backspace trong lúc đang giữ Ctrl, Alt và Shift.
- File `input-block` phải được extension ghi lại trong 6 s gần nhất; quá hạn (extension chết, JS treo) thì shim tự thôi chặn để không khoá cứng bàn phím.

Extension bị tắt rồi bật lại khi khóa máy: GNOME tắt các extension không có session-mode `unlock-dialog` (System HUD, Ubuntu Dock, DING...) và mỗi lần tắt một extension thì tắt rồi bật lại mọi extension bật sau nó (`extensionSystem.js` `_callExtensionDisable`). Remote Shield gần như luôn bật sau các extension đó nên bị tắt/bật lại mỗi lần khóa, kể cả ngay trong `lock()` do `_disengage` gọi. Xử lý:
- `disable()` chuyển handle remote đang chạy vào `_carry` (object do `extension.js` giữ); `enable()` nhận lại nếu chưa quá 10 s và kéo rèm lại. Không làm vậy thì người remote khóa máy rồi mở khóa từ xa → màn hình thật lộ desktop.
- `_disengage` mở ô mật khẩu ngay sau `lock()` (trước đây đợi 800 ms, lúc đó extension đã bị tắt nên mất trạng thái), và dừng nếu `_timers` đã null.
- `_timeout` / `_interval` trả 0 khi extension đã tắt (trước đây ném `this._timers is null` và để lại timer mồ côi).

Remote khi màn hình khóa (`allowWhenLocked`):
- Mặc định GNOME chặn remote khi khóa máy. `_sessionUpdated` trong `ui/main.js` gọi `inhibit_remote_access()` khi khóa và `uninhibit_remote_access()` khi mở khóa; khi bị chặn, Mutter đóng mọi phiên remote và từ chối phiên mới.
- Remote Shield gán đè hai hàm này trên đối tượng controller (thuộc tính JS riêng của instance):
  - lệnh chặn bị bỏ qua và được đếm vào `skipped`;
  - lệnh mở chặn tương ứng cũng bị bỏ qua, nhờ vậy bộ đếm của Mutter luôn cân bằng.
- Bật lúc màn hình đang khóa: gỡ chặn ngay.
- Khi tắt extension: trả lại hàm gốc (`delete` thuộc tính, hoặc gán lại nếu trước đó đã có bản đè khác), rồi chặn thật đủ số lần đã bỏ qua.
- Thay thế extension Allow Locked Remote Desktop (`allowlockedremotedesktop@kamens.us`). `install.sh` tự gỡ extension đó.

Dồn cửa sổ (#26):
- Chỉ lấy loại NORMAL, DIALOG, MODAL_DIALOG, UTILITY; bỏ override-redirect và skip-taskbar (dock, DING). Mỗi cửa sổ lưu `{window, monitor, rect, maximized, fullscreen}` một lần (lần dồn đầu tiên).
- Đặt bằng toạ độ (`_placeWindow`: bỏ fullscreen/maximize → `move_resize_frame(true, …)` → maximize/fullscreen lại). Vị trí giữ tương đối trong vùng làm việc, kích thước co cho vừa vùng làm việc màn chính. Không dùng `move_to_monitor()`: trên Mutter 18 nó không chuyển được cửa sổ Wayland sang màn khác.
- Sang màn chính thì đặt vào workspace đang xem (màn phụ không có workspace vì `workspaces-only-on-primary`, nếu không cửa sổ rơi vào workspace 0).
- Trong lúc remote: nghe `window-created`, `window-entered-monitor`, `grab-op-begin/end` của `global.display`; 300 ms sau thay đổi thì dồn tiếp (bỏ qua khi người remote đang kéo / đổi cỡ, dồn khi thả). Cửa sổ mở mới ở màn phụ hoặc bị chuyển sang màn phụ (Super+Shift+←/→, kéo) đều về màn chính.
- Khi trả: bỏ cửa sổ đã đóng (`get_compositor_private()` null) hoặc màn đã rút; còn lại `_placeWindow` về đúng `rect` cũ rồi khôi phục maximize/fullscreen.

### 3.2 Shim

| Bước | Code |
|---|---|
| Constructor: bỏ mình khỏi LD_PRELOAD, chỉ chạy khi `comm == gnome-shell`, xoá cờ cũ (`blank`, `input-block`), kill switch, guard | `shim_init` [shield-shim.c:966](../../remote-shield/shim/shield-shim.c) |
| Destructor: xoá marker (thoát bình thường không tính là sự cố) | `shim_fini` [shield-shim.c:1013](../../remote-shield/shim/shield-shim.c) |
| Hook giao khung | `drmModeAtomicCommit` [shield-shim.c:647](../../remote-shield/shim/shield-shim.c) |
| Kiểm tra bố cục `drmModeAtomicReq` lúc chạy | `check_layout` [shield-shim.c:536](../../remote-shield/shim/shield-shim.c) |
| Đọc cờ, bật/tắt, marker/guard | `update_want` [shield-shim.c:562](../../remote-shield/shim/shield-shim.c) |
| Ghi trạng thái (nguyên tử: .tmp rồi rename) | `write_status` [shield-shim.c:592](../../remote-shield/shim/shield-shim.c) |
| Liệt kê plane, thuộc tính FB_ID/CRTC/SRC_*, cursor cap | `load_planes` [shield-shim.c:218](../../remote-shield/shim/shield-shim.c), `get_dev` [shield-shim.c:262](../../remote-shield/shim/shield-shim.c) |
| Tạo dumb buffer + framebuffer (màn che XRGB8888, giữ map để vẽ lại / trong suốt ARGB8888), cache theo kích thước | `create_fb` [shield-shim.c:374](../../remote-shield/shim/shield-shim.c), `get_fb` [shield-shim.c:425](../../remote-shield/shim/shield-shim.c) |
| FB cursor trong suốt: đúng kích thước FB cursor gốc, đọc bằng `DRM_IOCTL_MODE_GETFB2` (cache theo fb_id, đóng ngay handle GEM mới); không đọc được thì dùng vùng nguồn, tối đa cursor cap | `fb_size` [shield-shim.c:466](../../remote-shield/shim/shield-shim.c) |
| Kích thước khung màn che lấy từ SRC_W/SRC_H trong chính request (hoặc giá trị cũ của plane) | `src_extent` [shield-shim.c:498](../../remote-shield/shim/shield-shim.c) |
| Nội dung khung: `shield-<w>x<h>.png` nếu có, không thì nền trắng + `shield.png` ở giữa (cairo lấy bằng dlsym) | `paint_fb` [shield-shim.c:347](../../remote-shield/shim/shield-shim.c), `blit_png` [shield-shim.c:303](../../remote-shield/shim/shield-shim.c) |
| `shield.gen` đổi (kiểm tra mỗi 100 ms) → vẽ lại tại chỗ mọi khung màn che | `repaint_all` [shield-shim.c:360](../../remote-shield/shim/shield-shim.c) |
| Hook đọc input thật: bỏ sự kiện khi đang chặn | `libinput_get_event` [shield-shim.c:905](../../remote-shield/shim/shield-shim.c), `input_drop` [shield-shim.c:859](../../remote-shield/shim/shield-shim.c) |
| Lấy hàm libinput bằng dlsym; đọc cờ `input-block` (≤50 ms/lần, quá 6 s là cũ); báo cú bấm | `input_init` [shield-shim.c:792](../../remote-shield/shim/shield-shim.c), `input_update` [shield-shim.c:825](../../remote-shield/shim/shield-shim.c), `input_report` [shield-shim.c:841](../../remote-shield/shim/shield-shim.c) |
| Chương trình tự kiểm tra (`-DSELFTEST`) | `main` [shield-shim.c:1021](../../remote-shield/shim/shield-shim.c) |

Thuật toán trong hook, với mỗi lần commit:
1. Đọc cờ (tối đa 1 lần / 100 ms).
2. Nếu đang che và không có guard hay `swap_failed`: duyệt `req->items`. Item là `FB_ID` của plane, giá trị khác 0 → thay bằng FB màn che (cursor: FB trong suốt **cùng kích thước FB cursor gốc**, vd 256×256 trên NVIDIA, 64×64 trên Intel). Nếu plane có `FB_DAMAGE_CLIPS` thì đặt về 0 (card này không có).
3. Gọi hàm thật, rồi luôn khôi phục giá trị gốc trong `req`, vì Mutter tái sử dụng request.
4. Lỗi (trừ EBUSY/EAGAIN): gửi lại khung gốc, đặt `swap_failed = 1` và ngừng thay khung tới khi cờ tắt rồi bật lại.
5. Thành công lần đầu sau khi bật cờ: ghi status ngay để extension xác nhận nhanh.

## 4. Dữ liệu và file trạng thái

Không có database. Các file trạng thái:

| File | Ai ghi | Nội dung / ý nghĩa |
|---|---|---|
| `$XDG_RUNTIME_DIR/remote-shield/blank` | extension (`setFlag`), `shieldctl on/off` | Có file = yêu cầu che. Shim xoá khi khởi động |
| `$XDG_RUNTIME_DIR/remote-shield/input-block` | extension (`_blockInput`), `shieldctl off` xoá | Có file và mtime trong 6 s gần nhất = shim chặn input thật. Extension ghi lại mỗi 2 s. Shim xoá khi khởi động |
| `$XDG_RUNTIME_DIR/remote-shield/local-press` | shim | `"<số lần bấm> <combo>"`, ghi đè mỗi cú bấm tại máy lúc đang chặn; extension theo dõi bằng `Gio.FileMonitor` (`CHANGES_DONE_HINT`) |
| `$XDG_RUNTIME_DIR/remote-shield/shim-status` | shim | Dạng `key=value` (xem dưới), ghi lại tối đa 2 giây một lần, ghi ngay khi có chuyển trạng thái |
| `$XDG_RUNTIME_DIR/remote-shield/shield-<W>x<H>.png` | extension (`_renderShield`) | Ảnh màn che toàn màn, mỗi kích thước màn hình một file; vẽ lại lúc kéo rèm và đầu mỗi phút |
| `$XDG_RUNTIME_DIR/remote-shield/shield.gen` | extension | Đổi sau mỗi lần vẽ; shim thấy mtime đổi thì vẽ lại khung |
| `~/.cache/remote-shield/bg-<W>x<H>.png` | extension | Hình nền đã làm mờ (cache theo hình nền + mtime + kích thước) |
| `$XDG_RUNTIME_DIR/remote-shield/shield.png` | (kiểu cũ) | Shim còn hỗ trợ: nền trắng + ảnh ở giữa khi không có ảnh theo kích thước; extension xoá file này lúc bật |
| `~/.cache/remote-shield/shim.log` | shim | Log của shim (khởi tạo, bố cục, bật/tắt, lỗi, 40 commit đầu chi tiết) |
| `~/.cache/remote-shield/shim-blanking.marker` | shim | Tồn tại khi đang che. Còn sót lúc khởi động (gnome-shell chết khi đang che) → bật guard |
| `~/.config/remote-shield/shim-disabled` | người dùng | Kill switch: có file → shim không làm gì |

Các khoá của `shim-status`:
- `pid`: pid gnome-shell. Extension so với pid của mình để biết shim có nạp vào đúng tiến trình.
- `layout_ok`: `1` nếu bố cục struct libdrm khớp; `-1` nếu chưa có commit nào.
- `want_blank`: shim đang thấy cờ che.
- `guard`: khoá an toàn sau sự cố.
- `swap_failed`: driver đã từ chối khung thay thế.
- `commits`: tổng số lần giao khung.
- `swapped_commits`: tổng số lần đã thay khung.
- `swapped_since_on`: số lần thay khung từ lúc bật cờ. Lớn hơn 0 nghĩa là khung màn che đã lên màn hình.
- `fails`: số lần driver từ chối.
- `last_error`: lỗi gần nhất.
- `input_hook`: `1` khi đã gắn vào libinput của gnome-shell (shim từ #25). Extension dựa vào khoá này để chọn chặn ở shim hay bộ lọc Clutter dự phòng.
- `input_blocking`: shim đang chặn input thật. `input_dropped`, `input_presses`: số sự kiện đã bỏ, số cú bấm đã báo.
- Theo sau là các dòng `dev fd=… commits=… swapped=…` và thống kê theo từng plane.

Bố cục nội bộ libdrm mà shim dựa vào:
- `struct atomic_req {uint32 cursor; uint32 size_items; item *items}`
- `item {uint32 object_id; uint32 property_id; uint64 value; uint32 cursor}`

## 5. Giao thức và API dùng tới

- **Mutter → extension**:
  - `global.backend.get_remote_access_controller()`, tín hiệu `new-handle(handle)`.
  - `handle.connect('stopped')`, `handle.stop()`.
  - `global.backend.is_headless()`.
  - `controller.inhibit_remote_access()` / `uninhibit_remote_access()`: GNOME gọi khi khóa/mở khóa; Remote Shield gán đè (xem mục 3.1).
- **Extension ↔ shim**: chỉ qua file (mục 4). Extension bật/tắt cờ (`blank`, `input-block`); shim báo trạng thái (`shim-status`) và cú bấm tại máy (`local-press`).
- **Shim → kernel**:
  - Gọi trực tiếp `DRM_IOCTL_MODE_CREATE_DUMB`, `MAP_DUMB`, `ADDFB2`, `GETPLANERESOURCES`, `OBJ_GETPROPERTIES`, `GETPROPERTY`, `GET_CAP`.
  - Header lấy từ uapi của kernel (`linux-libc-dev`), không cần libdrm-dev.
  - Gọi hàm thật bằng `dlsym(RTLD_NEXT, "drmModeAtomicCommit")`.
- **Shim → libinput**: thay `libinput_get_event` (hàm thật lấy bằng `dlsym(RTLD_NEXT)`); `libinput_event_get_type`, `…_get_keyboard_event`, `…_keyboard_get_key(_state)`, `…_get_pointer_event`, `…_pointer_get_button(_state)`, `libinput_event_destroy` lấy bằng `dlsym(RTLD_DEFAULT)`. Mã loại sự kiện là hằng số ổn định của ABI libinput 1.x.
- **RDP**: gnome-remote-desktop, cấu hình bằng `grdctl`.
  - User daemon (Desktop Sharing): `grdctl rdp …`, chứng chỉ ở `~/.local/share/gnome-remote-desktop/certificates/`.
  - System daemon (Remote Login): `sudo grdctl --system rdp …`, chứng chỉ ở `/var/lib/gnome-remote-desktop/`.
  - Hai daemon cùng muốn cổng 3389. Daemon user bật port negotiation nên tự lùi sang 3390.
- **Màn hình chính**: `org.gnome.Mutter.DisplayConfig.ApplyMonitorsConfig(serial, 2=persistent, …)`, lưu ở `~/.config/monitors.xml`.

## 6. Cấu hình và tác động khi đổi

File `~/.local/share/gnome-shell/extensions/remote-shield@ubuntu-assistant/config.json`:
- `install.sh` giữ nguyên file này nếu đã có. Khoá thiếu lấy theo `DEFAULTS` ở [core.js:30](../../remote-shield/remote-shield@ubuntu-assistant/core.js).
- Đổi xong, tắt rồi bật lại extension (hoặc chạy `./install.sh`) để áp dụng.

| Khoá | Mặc định | Tác động |
|---|---|---|
| `blockInput` | true | false: người tại chỗ vẫn gõ / bấm chuột được trong lúc remote (và bấm tại máy không ngắt remote) |
| `lockOnDisconnect` | true | false: ngắt kết nối là màn hình thật hiện desktop ngay, không khoá |
| `matchAllRemote` | false | true: che cả khi chia sẻ màn hình trong cuộc họp |
| `failClosed` | true | false: không che được thì chỉ thông báo, **vẫn để remote chạy và lộ màn hình** |
| `verifyMs` | 4000 | Thời gian chờ khung màn che đầu tiên. Quá thời gian thì `_fail` |
| `gatherWindows` | true | false: không dồn cửa sổ từ màn phụ |
| `allowWhenLocked` | true | false: GNOME chặn Desktop Sharing khi màn hình khóa; vì Remote Shield khóa máy sau mỗi lần ngắt, sẽ không remote lại được tới khi có người mở khóa tại máy |
| `localTakeover` | true | false: bấm tại chỗ không làm gì; chỉ Ctrl+Alt+Shift+Backspace ngắt remote |
| `hint` | `""` | Dòng gợi ý dưới ngày. `""` = đúng câu của màn khóa GNOME ("Click or press a key to unlock", dịch theo locale) để màn che không lộ là đang có remote; chuỗi khác = câu tuỳ chọn; `null` = không có. `message`/`submessage` cũ không còn dùng |

Thiết lập hệ thống liên quan:
- `org.gnome.desktop.remote-desktop.rdp screen-share-mode = 'mirror-primary'`: `install.sh` luôn đặt. Đổi sang `extend` thì RDP thành màn hình ảo thứ ba và việc dồn cửa sổ mất ý nghĩa.
- `org.gnome.mutter workspaces-only-on-primary = true`: thiết lập riêng của máy này, Remote Shield không phụ thuộc.

## 7. Giao diện

- Màn hình thật khi đang che: giống màn khóa GNOME 50 / Yaru (thông số lấy từ `ui/unlockDialog.js` và CSS Yaru):
  - nền là hình nền desktop (zoom) làm mờ Gauss (radius 90 → sigma 45 px), độ sáng 0.65;
  - cột chữ căn giữa, mép trên ở 1/3 chiều cao: giờ 6.546em (`GnomeDesktop.WallClock`, chữ số đều `tnum`), ngày 1.818em (`%A %B %-d` dịch theo locale), dòng gợi ý 1em cách 2em (mặc định đúng câu của màn khóa, luôn hiện; màn khóa thật hiện sau 4 giây không thao tác);
  - chữ #f2f2f2, font giao diện (Ubuntu Sans), độ đậm thường; 1em = 11pt × text-scaling-factor × scale;
  - đồng hồ vẽ lại đầu mỗi phút; con trỏ chuột trong suốt.
  - Không vẽ: thanh trên cùng (biểu tượng mạng/âm lượng/nguồn) và thông báo của màn khóa.
- Bấm chuột / phím / chạm tại máy: Remote Shield ngắt remote, khóa máy, mở ô nhập mật khẩu (`screenShield._activateDialog`).
- Thông báo GNOME ("Remote Shield"):
  - khi che xong: "Màn hình tại chỗ đã được che…";
  - khi không che được: kèm lý do, và "Đã ngắt phiên remote và khóa máy" nếu bật `failClosed`.
- Extension không có panel, menu hay trang cài đặt.

## 8. Lịch sử tính năng

| Ngày | Thay đổi |
|---|---|
| 2026-11-12 | "Remote Curtain": che bằng actor phủ trong GNOME. Bị loại vì RDP chụp stage nên người remote cũng bị che. Tạm dừng |
| 2026-11-12 | PoC #14: hook `drmModeAtomicCommit`, chứng minh thay được khung trước khi giao cho card (2.129 commit đã thay, 0 lỗi, ảnh chụp GNOME vẫn là desktop thật) |
| 2026-11-12 | Bản 2.0 (#11): extension điều khiển + shim, xác nhận/fail-closed, guard, ảnh chữ, phím khẩn cấp. Thử RDP thật 18:57–18:58. Đổi tên thành Remote Shield (người dùng chọn) |
| 2026-11-12 | Dồn/trả cửa sổ màn phụ; chuyển sang file khởi động mỏng |
| 2026-11-13 | Bỏ qua phiên headless (Remote Login bị văng ra sau khi gõ mật khẩu) |
| 2026-11-13 | #16: `install.sh` hợp nhất (kiểm tra máy, `--rdp`, `--remote-login`, `--force`); drop-in chuyển sang template `org.gnome.Shell@.service.d`; `package.sh` tạo gói tar.gz |
| 2026-11-13 | #20: màn che giống hệt màn khóa (hình nền mờ, giờ chạy, ngày, gợi ý); bấm tại máy → ngắt remote, khóa, hiện ô mật khẩu; shim vẽ ảnh toàn màn theo kích thước và vẽ lại khi `shield.gen` đổi |
| 2026-11-13 | #24: sửa ngắt remote từ tại chỗ bị kéo rèm 2 lần (gây đơ bàn phím / bộ gõ sau khi mở khóa) |
| 2026-11-13 | #28: sửa lỗi card Intel (i915) từ chối FB cursor trong suốt → không che được, RDP bị ngắt (báo cáo từ máy Intel UHD 730). FB cursor giờ lấy đúng kích thước FB gốc qua `GETFB2`; selftest kiểm tra thêm |
| 2026-11-13 | #26: dồn cửa sổ thật sự hoạt động: đặt bằng toạ độ thay cho `move_to_monitor` (không chuyển được cửa sổ Wayland), co kích thước vừa màn chính, đưa vào workspace đang xem; theo dõi tiếp cửa sổ mở mới / bị chuyển sang màn phụ trong lúc remote |
| 2026-11-13 | #25: chặn input thật chuyển xuống shim (hook `libinput_get_event`): trước đó bộ lọc Clutter đứng sau bộ lọc của Mutter nên phím/chuột tại máy vẫn lọt vào app và bấm tại máy chỉ thỉnh thoảng ngắt được remote; con trỏ thật nay cũng đứng yên. Giữ phiên remote qua lần GNOME tắt/bật lại extension khi khóa máy; sửa lỗi `this._timers is null` |
| 2026-11-13 | #19: tích hợp remote khi màn hình khóa (`allowWhenLocked`, mặc định bật); `install.sh` gỡ extension Allow Locked Remote Desktop (đã gỡ trên máy này) |

## 9. Cấu trúc thư mục

```
remote-shield/
├─ install.sh                 cài cho user hiện tại (dùng chung cho thư mục mã nguồn và gói)
├─ uninstall.sh               gỡ sạch (giữ cấu hình RDP)
├─ package.sh                 tạo dist/remote-shield-<version>.tar.gz
├─ tools/preview-shield.js    xuất ảnh màn che ra PNG để xem trước: gjs -m tools/preview-shield.js out.png [WxH] [gợi ý]
├─ packaging/README.txt       hướng dẫn cài cho người dùng cuối (chép vào gói)
├─ dist/                      gói đã đóng (sinh ra, không sửa tay)
├─ remote-shield@ubuntu-assistant/
│  ├─ metadata.json           uuid, shell-version ["50"], session-modes [user, unlock-dialog], version-name
│  ├─ extension.js            file khởi động mỏng (gần như không bao giờ sửa)
│  ├─ core.js                 toàn bộ logic extension (ShieldCore)
│  ├─ overlay.js              ShieldPainter: vẽ ảnh màn che giống màn khóa (chạy được bằng gjs)
│  └─ config.json             cấu hình mặc định
└─ shim/
   ├─ shield-shim.c           thư viện LD_PRELOAD (+ chương trình selftest khi -DSELFTEST)
   ├─ build.sh                build ra shim/build/
   ├─ shieldctl               lệnh điều khiển / chẩn đoán
   └─ test-harness.c          giả lập Mutter để thử nhánh thay khung và gửi lại khung gốc
                              (logic chặn input đã thử bằng libinput giả + chương trình tên gnome-shell, xem Common Pitfalls)
```

Sau khi cài:
- `~/.local/lib/remote-shield/shield-shim.so`
- `~/.local/bin/shieldctl`
- `~/.config/systemd/user/org.gnome.Shell@.service.d/remote-shield.conf` (`Environment=LD_PRELOAD=…`)
- `~/.local/share/gnome-shell/extensions/remote-shield@ubuntu-assistant/`

## 10. Quy ước phát triển

- Comment, log, thông báo viết bằng tiếng Việt. Log extension có tiền tố `[remote-shield]` (xem bằng `journalctl --user -b | grep remote-shield` hoặc `journalctl -b | grep remote-shield`).
- Mọi thay đổi hành vi che phải giữ nguyên tắc **fail-closed** và **khoá trước, trả màn hình sau**.
- Shim không được chặn hay làm chậm commit khi không che. Phần đọc cờ chỉ là một `access()` mỗi 100 ms. Hook input chỉ thêm một `stat()` mỗi 50 ms.
- Hook input không bao giờ được làm mất sự kiện nhả phím của phím Mutter đã thấy bấm, và phải tự thôi chặn khi cờ cũ.
- Khi sửa shim: build, chạy `shim/build/shield-selftest /dev/dri/card1` (kiểm tra bố cục + liệt kê plane), cài, đăng xuất rồi đăng nhập lại, `shieldctl test 10`, rồi thử RDP thật.
- Khi sửa extension: `./install.sh` (tự nạp lại), xem journal có `đã tắt` / `đã bật` và không có lỗi import, rồi thử RDP.
- Tăng `version-name` trong `metadata.json` trước khi chạy `package.sh` cho bản phát hành mới.

## 11. Workflow xử lý issue

1. `shieldctl status`: shim đã nạp chưa, `pid` có khớp gnome-shell, `layout_ok`, `guard`, `swap_failed`, `last_error`.
2. `journalctl -b --no-pager | grep remote-shield`: chuỗi `phiên chia sẻ mới` → `kéo rèm` → `shim xác nhận` hay `không che được màn hình: <lý do>`.
3. `shieldctl log 50`: log shim (bố cục, plane, lỗi driver).
4. Lỗi liên quan RDP: `journalctl -b | grep gnome-remote-desktop` và `grdctl status`.
5. Màn hình kẹt trắng: gõ mù `shieldctl off` trong terminal, hoặc Ctrl+Alt+Shift+Backspace. Tệ nhất: Ctrl+Alt+F3, xoá drop-in, khởi động lại.
6. Fix xong: thêm mục vào Common Pitfalls bên dưới.

## 12. Onboarding checklist cho session mới

Thứ tự đọc:
1. Memory: memory Claude Code của project (nằm ngoài repo, trên máy phát triển: `~/.claude/projects/<thư-mục-project>/memory/`)
2. [../index.md](../index.md)
3. File này
4. `remote-shield/remote-shield@ubuntu-assistant/core.js`, rồi `remote-shield/shim/shield-shim.c` nếu đụng tầng KMS

Code path cheatsheet:

| Cần làm | File |
|---|---|
| Đổi điều kiện coi là phiên remote | `core.js` `_isRemote` |
| Đổi cách chặn input / phím khẩn cấp | `shield-shim.c` `input_drop`, `input_report`; `core.js` `_blockInput`, `_onLocalPress` |
| Đổi quy tắc dồn/trả cửa sổ | `core.js` `_gatherWindows`, `_placeWindow`, `_watchWindows`, `_restoreWindows` |
| Đổi kiểm tra an toàn / thời gian chờ | `core.js` `_verify`, `_shimProblem`, `config.json` `verifyMs` |
| Đổi giao diện màn che | `overlay.js` (xem trước bằng `tools/preview-shield.js`), dòng gợi ý: `hint` trong config |
| Đổi hành vi khi người tại máy bấm | `core.js` `_onLocalPress`, `_localTakeover` |
| Đổi màu nền, cách thay khung, xử lý cursor | `shield-shim.c` `create_fb`, hook `drmModeAtomicCommit` |
| Thêm trường trạng thái | `shield-shim.c` `write_status` + `core.js` `readStatus`/`_shimProblem` + `shieldctl` |
| Đổi cách cài / bật RDP | `install.sh` |
| Đổi nội dung gói | `package.sh`, `packaging/README.txt` |

Lệnh hay dùng:

```bash
cd remote-shield   # từ thư mục gốc repo
./install.sh && journalctl -b --since -1min | grep remote-shield
shieldctl status; shieldctl log 30; shieldctl test 10
gnome-extensions info remote-shield@ubuntu-assistant
systemctl --user show org.gnome.Shell@ubuntu.service -p DropInPaths -p Environment
grdctl status
```

Trạng thái runtime (2026-11-13):
- Đã cài, extension ACTIVE, shim nạp trong gnome-shell (`layout_ok=1`).
- Desktop Sharing bật (cổng 3390 khi Remote Login giữ 3389), Remote Login bật.
- Remote khi màn hình khóa do Remote Shield đảm nhận; extension Allow Locked Remote Desktop đã gỡ.
- Màn chính là DP-2. Gói `dist/remote-shield-2.0.tar.gz` đã tạo.
- Bản #20 (màn che giống màn khóa) đã thử qua RDP thật: người dùng xác nhận giống màn khóa.
- Bản #25 (chặn input ở shim) đã cài lúc 08:3x; shim mới chỉ có hiệu lực sau lần đăng nhập kế tiếp. Chưa thử qua RDP thật.

## 13. Architectural Decisions & Rationale

| Quyết định | Lý do — đừng đảo ngược nếu chưa xử lý được lý do này |
|---|---|
| Che ở tầng giao khung KMS, không phủ actor trong GNOME | RDP lấy ảnh từ stage; phủ trong stage thì người remote cũng thấy trắng (đã thử ở Remote Curtain) |
| Hook `drmModeAtomicCommit` bằng LD_PRELOAD, không vá Mutter / module kernel / compositor riêng | Không cần root, không đụng file hệ thống, gỡ bằng xoá 1 file drop-in, sống qua cập nhật Mutter miễn libdrm giữ ABI |
| FB cursor thay thế lấy kích thước từ FB gốc (GETFB2), không tự chọn | Mỗi driver có ràng buộc cursor riêng (i915: stride = rộng × 4; NVIDIA: cỡ cố định); FB gốc chắc chắn hợp lệ với driver đang chạy |
| Đọc struct nội bộ libdrm, có `check_layout` lúc chạy | `drmModeAtomicReq` là kiểu mờ; kiểm tra bằng chính alloc/add của libdrm, sai bố cục thì chỉ log, không thay khung |
| Fail-closed mặc định | Mục đích là không để lộ màn hình; thà ngắt remote còn hơn để người tại chỗ thấy |
| Khoá máy trước, 800 ms sau mới xoá cờ | Màn hình thật không được lộ desktop dù một khung |
| `session-modes: [user, unlock-dialog]` | Khoá máy không trực tiếp tắt extension. Nhưng GNOME vẫn tắt/bật lại nó khi tắt một extension bật trước (xem 3.1), nên trạng thái cần giữ qua khóa máy phải nằm trong `_carry` |
| Nhận diện bằng GType `RemoteDesktop` / `disable-animations` | Không che khi chỉ chia sẻ màn hình trong cuộc họp |
| Chặn input thật ở shim (hook `libinput_get_event`), không ở bộ lọc Clutter (#25) | Bộ lọc của Mutter đứng trước và đã giao sự kiện cho app; libinput chỉ có thiết bị thật nên không cần phân biệt với thiết bị ảo RDP; chặn được cả di chuyển con trỏ. Bộ lọc Clutter chỉ giữ làm dự phòng khi shim đang chạy là bản cũ |
| Cờ `input-block` có hạn 6 s, extension ghi lại mỗi 2 s | Chặn sai ở tầng libinput là mất cả bàn phím lẫn chuột (kể cả Ctrl+Alt+F3); cờ tự hết hạn khi extension không còn hoạt động |
| Dồn cửa sổ bằng toạ độ, không bằng `move_to_monitor` | `move_to_monitor` không chạy với cửa sổ Wayland trên Mutter 18 (đã đo) |
| RDP `mirror-primary` + dồn cửa sổ, không dùng `extend` | `extend` tạo màn ảo trống, người remote không thấy app đang mở; Alt+Tab không kéo cửa sổ sang màn RDP (đã thử) |
| File khởi động mỏng `extension.js` → `core.js?v=` | GJS cache ESM theo URL; không có cách này mỗi lần sửa phải đăng xuất |
| Tự cho remote khi màn hình khóa, không dựa vào extension ngoài | Remote Shield khóa máy sau mỗi lần ngắt; nếu GNOME chặn remote khi khóa thì lần kết nối sau thất bại. Tích hợp để gói cài một lần là đủ. Đếm lệnh chặn/mở chặn để Mutter không báo `inhibit_count > 0` như bản extension cũ |
| Bỏ qua phiên headless | Remote Login có màn ảo, không có gì để che; nếu không bỏ qua thì fail-closed cắt phiên ngay sau khi đăng nhập |
| Drop-in template `org.gnome.Shell@.service.d` | Áp dụng cho mọi biến thể phiên (@ubuntu, @wayland) khi cài máy khác |
| Cài theo user, đóng gói tar.gz thay vì .deb | Mọi thành phần nằm trong `$HOME`, không cần root; .deb chỉ đáng làm khi cần cài nhiều user/máy |
| Giao tiếp qua file thay vì D-Bus | Shim chạy trong hook giao khung, phải cực rẻ và không gọi vào main loop; `access()` + ghi file nguyên tử là đủ |
| Màn che giống màn khóa thay vì màn trắng có chữ | Người dùng yêu cầu (#20): người đi ngang chỉ thấy máy đang khóa, không lộ việc đang có người điều khiển; thao tác bấm để vào máy giống màn khóa thật |
| Bấm bất kỳ tại máy là ngắt remote (localTakeover) | Giống màn khóa: chủ máy luôn lấy lại được máy và nhập mật khẩu; chuyển động chuột đơn thuần không tính để tránh lỡ tay |
| Ảnh vẽ sẵn theo kích thước màn hình, shim chỉ chép | Shim chạy trong đường giao khung, không được vẽ chữ hay làm mờ; mọi xử lý nặng làm ở extension (làm mờ chỉ khi đổi hình nền) |
| Tên "Remote Shield" | Người dùng chọn (từ chối "Veil"). Không đổi tên khi chưa hỏi |

## 14. Common Pitfalls

| Vấn đề | Nguyên nhân | Cách xử lý / bài học |
|---|---|---|
| Remote Login bị văng ra ngay sau khi gõ mật khẩu | Phiên headless vẫn chạy extension → shim không có commit → `_fail` → ngắt RDP | `enable()` thoát sớm khi `global.backend.is_headless()` (sửa 2026-11-13) |
| Cài lại xong extension nằm INACTIVE | `gnome-extensions disable` bất đồng bộ; `enable` gửi lúc chưa tắt xong bị bỏ qua | Chờ trạng thái INACTIVE rồi mới enable, chờ ACTIVE (`install.sh`) |
| LD_PRELOAD không nạp / import gjs lỗi | Đường dẫn project có dấu cách ("Ubuntu Assistant"); LD_PRELOAD tách theo dấu cách | Cài thư viện vào `~/.local/lib/remote-shield/` |
| Sửa core.js nhưng shell vẫn chạy code cũ | Cache ESM | File khởi động mỏng; lần đầu chuyển sang kiểu này vẫn phải đăng xuất một lần |
| Bật cờ nhưng màn hình chưa đổi | Mutter chỉ commit khi có thay đổi | `global.stage.queue_redraw()` sau khi đổi cờ; `shieldctl` gửi `notify-send` để buộc vẽ lại |
| Extension báo chưa che dù shim đã che | Status ghi 2 s/lần, đến muộn | Shim ghi status ngay khi chuyển trạng thái, lần thay khung đầu tiên và khi lỗi |
| Bật cờ không có tác dụng sau khi gnome-shell crash | Guard bật vì marker còn sót | Kiểm tra nguyên nhân crash, rồi `shieldctl reset-guard` |
| Menu Ubuntu và HUD nhảy sang màn trái | Màn chính bị đổi sang HDMI-3 (một màn mất tín hiệu thoáng qua, Mutter lưu lại monitors.xml); không do Remote Shield | Đặt lại DP-2 qua `ApplyMonitorsConfig`. RDP mirror-primary gửi đúng màn chính nên màn chính sai thì người remote xem sai màn |
| Người remote không thấy app ở màn phụ | `mirror-primary` chỉ gửi màn chính | `gatherWindows` |
| Log báo `đã dồn 1 cửa sổ` nhưng người remote vẫn không thấy cửa sổ | `meta_window_move_to_monitor()` không chuyển cửa sổ Wayland (Claude/Electron) sang màn khác, chỉ xê dịch vài px, không báo lỗi. Cửa sổ mở trong lúc remote ở màn phụ thì trước đây không được dồn | Đặt bằng `move_resize_frame` theo toạ độ; theo dõi `window-created` / `window-entered-monitor` (#26). Bài học: sau khi di chuyển cửa sổ, kiểm tra lại `get_monitor()` / `get_frame_rect()` chứ không tin lời gọi |
| Card Intel: `shieldctl test` không che được, RDP vào là bị ngắt; log shim `driver từ chối khung thay thế: Invalid argument`; kernel (`drm.debug=0x14`): `i9xx_check_cursor … invalid cursor stride (1024) (cursor width 64)` | Shim nới FB cursor trong suốt lên cursor cap 256×256 (stride 1024), trong khi Mutter trên Intel dùng cursor 64×64; i915 bắt buộc stride FB cursor = chiều rộng cursor × 4. `get_fb` còn dùng lại FB lớn hơn | FB cursor cùng kích thước FB gốc (`fb_size`, GETFB2); `get_fb` chỉ dùng lại FB cursor đúng cỡ (#28). Bài học: FB thay thế nên giống FB gốc về kích thước/định dạng, vì driver đã chấp nhận FB gốc |
| Chữ trên ảnh màn che có viền màu (cam/xanh) khi thu nhỏ | Cairo khử răng cưa theo subpixel trên surface RGB24 | Vẽ trên surface ARGB32 (khử răng cưa thang xám như shell); shim chép được cả ARGB32 lẫn RGB24 |
| Đồng hồ trên màn che đứng yên | Shim dựng framebuffer một lần và trước đây `munmap` ngay | Giữ map; extension vẽ lại đầu mỗi phút + đổi `shield.gen`; shim kiểm tra mỗi 100 ms trong lúc giao khung và vẽ lại tại chỗ; extension `queue_redraw` 2 lần để chắc có lần giao khung |
| Dấu hai chấm giờ trông khác `:` | `GnomeDesktop.WallClock` dùng ký tự U+2236 (∶) như màn khóa thật | Đúng ý đồ; không thay bằng `:` |
| Bấm tại máy để ngắt remote: máy khóa / mở rèm 2 lần, sau khi mở khóa gõ mãi không ra chữ (log `Set global engine failed: Operation was cancelled`) | Một phiên RDP có 2 handle dừng lệch nhau; handle dừng trước làm `_sync` thấy còn 1 handle và kéo rèm lại, rồi lại mở rèm + khóa; việc chuyển bộ gõ IBus (Bamboo) của màn khóa bị huỷ giữa chừng | `_stopRemote` bỏ theo dõi mọi handle trước khi dừng; `_disengage` không gọi `lock()` khi `screenShield.locked` đã đúng (#24) |
| Bấm chuột / phím tại máy không ngắt remote, hoặc chỉ thỉnh thoảng (người dùng tưởng phải bấm chuột + phím cùng lúc); phím tại máy lọt vào app trong lúc remote | `Clutter.Event.add_filter` xếp sau bộ lọc của Mutter; Mutter giao sự kiện cho cửa sổ Wayland / IBus / phím tắt rồi trả `EVENT_STOP`. Bộ lọc của extension chỉ thấy sự kiện khi con trỏ (đang ẩn) tình cờ nằm trên hình nền, thanh trên cùng | Chặn ở shim (#25). Bài học: không dùng bộ lọc Clutter để chặn input đi vào app trên Mutter Wayland. Khi chẩn đoán, log mọi lần bấm cả từ thiết bị ảo: không có dòng nào nghĩa là bộ lọc không nhận được sự kiện |
| `JS ERROR: TypeError: can't access property "add", this._timers is null` ngay sau `đã tắt` lúc ngắt remote | `lock()` trong `_disengage` làm GNOME tắt extension đồng bộ (dây chuyền tắt/bật khi khóa máy), rồi `_disengage` chạy tiếp và tạo timer trên đối tượng đã tắt | `_timeout` trả 0 khi đã tắt; `_disengage` dừng sau `lock()` nếu đã bị tắt; ô mật khẩu mở ngay sau `lock()` (#25) |
| Thử logic chặn input ngoài gnome-shell | Shim chỉ hoạt động khi `comm == gnome-shell` | Build libinput giả (`libinput_get_event` trả sự kiện dựng sẵn) và chương trình đặt tên `gnome-shell`, chạy với `HOME`/`XDG_RUNTIME_DIR` tạm và `LD_PRELOAD` trỏ tới bản shim chép ra đường dẫn không có dấu cách |
| Log có `JS ERROR … grabbedsOldRect` | Lỗi của extension tiling-assistant | Không liên quan, bỏ qua |
| Máy tự khóa sau khi ngắt, lần sau không remote vào được (máy mới) | GNOME chặn remote khi khóa; trước đây phải cài thêm extension Allow Locked Remote Desktop | `allowWhenLocked` (#19) |
| Log `meta_dbus_session_manager_uninhibit: assertion 'priv->inhibit_count > 0' failed` | Extension Allow Locked Remote Desktop bỏ qua lệnh chặn nhưng vẫn để lệnh mở chặn chạy khi mở khóa | Remote Shield bỏ qua cả cặp; nếu còn thấy log này, kiểm tra xem còn extension nào khác đè `inhibit_remote_access` |
| Cùng lúc có Remote Shield và extension khác đè `inhibit_remote_access` | Mỗi bên lưu "hàm gốc" là bản đè của bên kia; tắt theo thứ tự sai sẽ khôi phục nhầm | `install.sh`: tắt Remote Shield → gỡ extension kia → bật Remote Shield |
| `shieldctl status` báo sai khi có 2 gnome-shell cùng user | `pgrep … | head -1` lấy pid đầu tiên | Hiếm (chỉ khi Remote Login và phiên tại chỗ cùng tồn tại); chưa sửa |
| Phiên headless khởi động xoá cờ của phiên tại chỗ | Hai phiên dùng chung `$XDG_RUNTIME_DIR`; shim xoá `blank` trong constructor | Chưa xảy ra vì GNOME không cho cùng user đăng nhập tại chỗ và Remote Login đồng thời; nếu đổi thì cần tách cờ theo pid |

## 15. Memory files & external resources

- Memory project: memory Claude Code của project (nằm ngoài repo, trên máy phát triển: `~/.claude/projects/<thư-mục-project>/memory/`)
- Mã nguồn: `remote-shield/` trong repo
- Thư viện đã cài: `~/.local/lib/remote-shield/shield-shim.so`
- Drop-in: `~/.config/systemd/user/org.gnome.Shell@.service.d/remote-shield.conf`
- Extension đã cài: `~/.local/share/gnome-shell/extensions/remote-shield@ubuntu-assistant/`
- Log shim: `~/.cache/remote-shield/shim.log`
- Cấu hình màn hình: `~/.config/monitors.xml`
- Chứng chỉ RDP user: `~/.local/share/gnome-remote-desktop/certificates/`
- Tài liệu tham khảo: GNOME Remote Desktop (`man grdctl`), Linux DRM KMS atomic API (`include/uapi/drm/drm_mode.h`), libdrm `xf86drmMode.c` (định nghĩa `drmModeAtomicReq`)
