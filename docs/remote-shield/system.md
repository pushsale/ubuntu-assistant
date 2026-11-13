# Remote Shield — Chi tiết kỹ thuật

Đọc xong file này là đủ để sửa Remote Shield mà không cần hỏi lại. Bối cảnh cho người không đọc code: [overview.md](overview.md).

## 1. Tổng quan, tech stack, cách chạy

Remote Shield gồm 2 phần chạy trong cùng tiến trình `gnome-shell` của user:

- **Extension** `remote-shield@ubuntu-assistant` (GJS). Nghe phiên remote từ Mutter, ra lệnh che, chặn input thật, dồn cửa sổ, khoá máy khi ngắt và kiểm tra an toàn.
- **shield-shim.so** (C, LD_PRELOAD). Thay hàm `drmModeAtomicCommit` của libdrm: khi có cờ che, đổi `FB_ID` của mọi plane thành framebuffer trắng do shim tự tạo, rồi mới gửi xuống driver.

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
   │               Clutter.Event.add_filter        setFlag(true): tạo file    _gatherWindows()
   │               (chặn thiết bị có device node)  $RUN/blank + queue_redraw  move_to_monitor(primary)
   │                                                         │
   │   Mutter vẽ stage ──► ScreenCast lấy ảnh (desktop thật) ─┼─► RDP
   │                │                                         │
   │                ▼                                         ▼
   │   meta_kms ── drmModeAtomicCommit(req) ──► shield-shim (đọc cờ mỗi ≤100 ms)
   │                                              │ đổi FB_ID plane → FB trắng/ trong suốt (cursor)
   │                                              │ gọi hàm thật ── lỗi? → khôi phục, gửi lại khung gốc, swap_failed=1
   │                                              │ ghi $RUN/shim-status (swapped_since_on, ...)
   │                                              ▼
   │                                      nvidia-drm ──► màn hình thật: trắng + ảnh chữ
   │
   └─ _verify() đọc shim-status mỗi 250 ms ─ OK ─► _watch() mỗi 2 s
                                         └ quá verifyMs hoặc lỗi ─► _fail(): stop handle + _disengage(lock)

Ngắt kết nối: handle 'stopped' ─► _sync ─► _disengage(true):
   bỏ filter → _restoreWindows → khoá máy → sau 800 ms xoá cờ + redraw (màn hình thật hiện màn khoá)
```

Vì sao RDP không bị che: gnome-remote-desktop lấy ảnh từ stage của Mutter qua ScreenCast (bộ nhớ đệm GPU riêng), còn shim chỉ đổi framebuffer gửi tới plane KMS. Hai đường này tách nhau sau khi Mutter vẽ xong.

## 3. Luồng chi tiết (tham chiếu code)

Đường dẫn tính từ gốc repo `Ubuntu Assistant/`.

### 3.1 Extension

| Bước | Code |
|---|---|
| Nạp core.js kèm `?v=<Date.now()>` (bỏ qua cache ESM) | [extension.js:9](../../remote-shield/remote-shield@ubuntu-assistant/extension.js) |
| Nạp overlay.js cùng mã phiên bản | [core.js:22](../../remote-shield/remote-shield@ubuntu-assistant/core.js) |
| Phiên headless (Remote Login) → không làm gì | [core.js:102](../../remote-shield/remote-shield@ubuntu-assistant/core.js) |
| enable: đọc config, xoá cờ, vẽ `shield.png`, nghe `new-handle` | [core.js:107-128](../../remote-shield/remote-shield@ubuntu-assistant/core.js) |
| Nhận diện phiên remote | `_isRemote` [core.js:251](../../remote-shield/remote-shield@ubuntu-assistant/core.js) |
| Theo dõi handle, `stopped` → `_sync` | [core.js:258-279](../../remote-shield/remote-shield@ubuntu-assistant/core.js) |
| Kéo rèm | `_engage` [core.js:293](../../remote-shield/remote-shield@ubuntu-assistant/core.js) |
| Chờ xác nhận / theo dõi | `_verify` [core.js:308](../../remote-shield/remote-shield@ubuntu-assistant/core.js), `_watch` [core.js:336](../../remote-shield/remote-shield@ubuntu-assistant/core.js), `_shimProblem` [core.js:351](../../remote-shield/remote-shield@ubuntu-assistant/core.js) |
| Fail-closed | `_fail` [core.js:364](../../remote-shield/remote-shield@ubuntu-assistant/core.js) |
| Mở rèm (khoá trước, 800 ms sau mới xoá cờ) | `_disengage` [core.js:376](../../remote-shield/remote-shield@ubuntu-assistant/core.js) |
| Dồn / trả cửa sổ | `_gatherWindows` [core.js:405](../../remote-shield/remote-shield@ubuntu-assistant/core.js), `_restoreWindows` [core.js:437](../../remote-shield/remote-shield@ubuntu-assistant/core.js) |
| Cho remote khi màn hình khóa (thay hàm inhibit/uninhibit của controller) | `_allowLockedRemote` [core.js:200](../../remote-shield/remote-shield@ubuntu-assistant/core.js), `_restoreLockedRemote` [core.js:230](../../remote-shield/remote-shield@ubuntu-assistant/core.js) |
| Chặn input + phím khẩn cấp Ctrl+Alt+Shift+Backspace | `_filter` [core.js:473](../../remote-shield/remote-shield@ubuntu-assistant/core.js) |
| Vẽ ảnh chữ 1400×320 (Pango/Cairo) | [overlay.js](../../remote-shield/remote-shield@ubuntu-assistant/overlay.js) |

Quy tắc nhận diện (`_isRemote`): handle có GType chứa `RemoteDesktop`, hoặc `disable_animations = true`, hoặc config `matchAllRemote`. Một kết nối RDP sinh 2 handle: `MetaScreenCastSessionHandle` (disable-animations=true) và `MetaRemoteDesktopSessionHandle` (false). Chia sẻ màn hình khi họp trực tuyến không khớp quy tắc nên không bị che.

Chặn input: sự kiện từ thiết bị có `get_device_node()` (thiết bị thật trong `/dev/input`) trả `EVENT_STOP`. Thiết bị ảo của phiên RDP không có device node nên được cho qua. `DEVICE_ADDED`/`DEVICE_REMOVED`/`NOTHING` luôn được cho qua.

Remote khi màn hình khóa (`allowWhenLocked`):
- Mặc định GNOME chặn remote khi khóa máy. `_sessionUpdated` trong `ui/main.js` gọi `inhibit_remote_access()` khi khóa và `uninhibit_remote_access()` khi mở khóa; khi bị chặn, Mutter đóng mọi phiên remote và từ chối phiên mới.
- Remote Shield gán đè hai hàm này trên đối tượng controller (thuộc tính JS riêng của instance):
  - lệnh chặn bị bỏ qua và được đếm vào `skipped`;
  - lệnh mở chặn tương ứng cũng bị bỏ qua, nhờ vậy bộ đếm của Mutter luôn cân bằng.
- Bật lúc màn hình đang khóa: gỡ chặn ngay.
- Khi tắt extension: trả lại hàm gốc (`delete` thuộc tính, hoặc gán lại nếu trước đó đã có bản đè khác), rồi chặn thật đủ số lần đã bỏ qua.
- Thay thế extension Allow Locked Remote Desktop (`allowlockedremotedesktop@kamens.us`). `install.sh` tự gỡ extension đó.

Dồn cửa sổ: chỉ lấy loại NORMAL, DIALOG, MODAL_DIALOG, UTILITY; bỏ override-redirect và skip-taskbar (dock, DING). Mỗi cửa sổ lưu `{window, monitor, rect, maximized, fullscreen}`. Khi trả: bỏ cửa sổ đã đóng (`get_compositor_private()` null) hoặc màn đã rút. Sau đó `move_to_monitor` cũ, khôi phục fullscreen/maximize; nếu không thì `unmaximize()` + `move_resize_frame(false, x, y, w, h)`.

### 3.2 Shim

| Bước | Code |
|---|---|
| Constructor: bỏ mình khỏi LD_PRELOAD, chỉ chạy khi `comm == gnome-shell`, xoá cờ cũ, kill switch, guard | `shim_init` [shield-shim.c:662](../../remote-shield/shim/shield-shim.c) |
| Destructor: xoá marker (thoát bình thường không tính là sự cố) | `shim_fini` [shield-shim.c:704](../../remote-shield/shim/shield-shim.c) |
| Hook giao khung | `drmModeAtomicCommit` [shield-shim.c:520](../../remote-shield/shim/shield-shim.c) |
| Kiểm tra bố cục `drmModeAtomicReq` lúc chạy | `check_layout` [shield-shim.c:411](../../remote-shield/shim/shield-shim.c) |
| Đọc cờ, bật/tắt, marker/guard | `update_want` [shield-shim.c:437](../../remote-shield/shim/shield-shim.c) |
| Ghi trạng thái (nguyên tử: .tmp rồi rename) | `write_status` [shield-shim.c:467](../../remote-shield/shim/shield-shim.c) |
| Liệt kê plane, thuộc tính FB_ID/CRTC/SRC_*, cursor cap | `load_planes` [shield-shim.c:169](../../remote-shield/shim/shield-shim.c), `get_dev` [shield-shim.c:213](../../remote-shield/shim/shield-shim.c) |
| Tạo dumb buffer + framebuffer (trắng XRGB8888 / trong suốt ARGB8888), cache theo kích thước | `create_fb` [shield-shim.c:292](../../remote-shield/shim/shield-shim.c), `get_fb` [shield-shim.c:339](../../remote-shield/shim/shield-shim.c) |
| Kích thước khung lấy từ SRC_W/SRC_H trong chính request (hoặc giá trị cũ của plane) | `src_extent` [shield-shim.c:373](../../remote-shield/shim/shield-shim.c) |
| Ghép `shield.png` vào giữa khung trắng (cairo lấy bằng dlsym) | `blit_overlay` [shield-shim.c:253](../../remote-shield/shim/shield-shim.c) |
| Chương trình tự kiểm tra (`-DSELFTEST`) | `main` [shield-shim.c:712](../../remote-shield/shim/shield-shim.c) |

Thuật toán trong hook, với mỗi lần commit:
1. Đọc cờ (tối đa 1 lần / 100 ms).
2. Nếu đang che và không có guard hay `swap_failed`: duyệt `req->items`. Item là `FB_ID` của plane, giá trị khác 0 → thay bằng FB trắng (cursor: FB trong suốt, tối thiểu bằng cursor cap 256×256). Nếu plane có `FB_DAMAGE_CLIPS` thì đặt về 0 (card này không có).
3. Gọi hàm thật, rồi luôn khôi phục giá trị gốc trong `req`, vì Mutter tái sử dụng request.
4. Lỗi (trừ EBUSY/EAGAIN): gửi lại khung gốc, đặt `swap_failed = 1` và ngừng thay khung tới khi cờ tắt rồi bật lại.
5. Thành công lần đầu sau khi bật cờ: ghi status ngay để extension xác nhận nhanh.

## 4. Dữ liệu và file trạng thái

Không có database. Các file trạng thái:

| File | Ai ghi | Nội dung / ý nghĩa |
|---|---|---|
| `$XDG_RUNTIME_DIR/remote-shield/blank` | extension (`setFlag`), `shieldctl on/off` | Có file = yêu cầu che. Shim xoá khi khởi động |
| `$XDG_RUNTIME_DIR/remote-shield/shim-status` | shim | Dạng `key=value` (xem dưới), ghi lại tối đa 2 giây một lần, ghi ngay khi có chuyển trạng thái |
| `$XDG_RUNTIME_DIR/remote-shield/shield.png` | extension (`renderOverlay`) | Ảnh chữ 1400×320 nền trắng |
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
- `swapped_since_on`: số lần thay khung từ lúc bật cờ. Lớn hơn 0 nghĩa là khung trắng đã lên màn hình.
- `fails`: số lần driver từ chối.
- `last_error`: lỗi gần nhất.
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
- **Extension → shim**: chỉ qua file (mục 4). Giao thức một chiều: extension bật/tắt cờ, shim báo trạng thái.
- **Shim → kernel**:
  - Gọi trực tiếp `DRM_IOCTL_MODE_CREATE_DUMB`, `MAP_DUMB`, `ADDFB2`, `GETPLANERESOURCES`, `OBJ_GETPROPERTIES`, `GETPROPERTY`, `GET_CAP`.
  - Header lấy từ uapi của kernel (`linux-libc-dev`), không cần libdrm-dev.
  - Gọi hàm thật bằng `dlsym(RTLD_NEXT, "drmModeAtomicCommit")`.
- **RDP**: gnome-remote-desktop, cấu hình bằng `grdctl`.
  - User daemon (Desktop Sharing): `grdctl rdp …`, chứng chỉ ở `~/.local/share/gnome-remote-desktop/certificates/`.
  - System daemon (Remote Login): `sudo grdctl --system rdp …`, chứng chỉ ở `/var/lib/gnome-remote-desktop/`.
  - Hai daemon cùng muốn cổng 3389. Daemon user bật port negotiation nên tự lùi sang 3390.
- **Màn hình chính**: `org.gnome.Mutter.DisplayConfig.ApplyMonitorsConfig(serial, 2=persistent, …)`, lưu ở `~/.config/monitors.xml`.

## 6. Cấu hình và tác động khi đổi

File `~/.local/share/gnome-shell/extensions/remote-shield@ubuntu-assistant/config.json`:
- `install.sh` giữ nguyên file này nếu đã có. Khoá thiếu lấy theo `DEFAULTS` ở [core.js:25](../../remote-shield/remote-shield@ubuntu-assistant/core.js).
- Đổi xong, tắt rồi bật lại extension (hoặc chạy `./install.sh`) để áp dụng.

| Khoá | Mặc định | Tác động |
|---|---|---|
| `blockInput` | true | false: người tại chỗ vẫn gõ / bấm chuột được trong lúc remote |
| `lockOnDisconnect` | true | false: ngắt kết nối là màn hình thật hiện desktop ngay, không khoá |
| `matchAllRemote` | false | true: che cả khi chia sẻ màn hình trong cuộc họp |
| `failClosed` | true | false: không che được thì chỉ thông báo, **vẫn để remote chạy và lộ màn hình** |
| `verifyMs` | 4000 | Thời gian chờ khung trắng đầu tiên. Quá thời gian thì `_fail` |
| `gatherWindows` | true | false: không dồn cửa sổ từ màn phụ |
| `allowWhenLocked` | true | false: GNOME chặn Desktop Sharing khi màn hình khóa; vì Remote Shield khóa máy sau mỗi lần ngắt, sẽ không remote lại được tới khi có người mở khóa tại máy |
| `message`, `submessage` | tiếng Việt | Dòng chữ trên màn trắng. Vẽ lại lúc bật extension |

Thiết lập hệ thống liên quan:
- `org.gnome.desktop.remote-desktop.rdp screen-share-mode = 'mirror-primary'`: `install.sh` luôn đặt. Đổi sang `extend` thì RDP thành màn hình ảo thứ ba và việc dồn cửa sổ mất ý nghĩa.
- `org.gnome.mutter workspaces-only-on-primary = true`: thiết lập riêng của máy này, Remote Shield không phụ thuộc.

## 7. Giao diện

- Màn hình thật khi đang che: nền trắng toàn màn, giữa là biểu tượng khoá, dòng `message` (Ubuntu Sans Medium 34) và `submessage` (Ubuntu Sans 18). Con trỏ chuột trong suốt.
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
| 2026-11-13 | #19: tích hợp remote khi màn hình khóa (`allowWhenLocked`, mặc định bật); `install.sh` gỡ extension Allow Locked Remote Desktop (đã gỡ trên máy này) |

## 9. Cấu trúc thư mục

```
remote-shield/
├─ install.sh                 cài cho user hiện tại (dùng chung cho thư mục mã nguồn và gói)
├─ uninstall.sh               gỡ sạch (giữ cấu hình RDP)
├─ package.sh                 tạo dist/remote-shield-<version>.tar.gz
├─ packaging/README.txt       hướng dẫn cài cho người dùng cuối (chép vào gói)
├─ dist/                      gói đã đóng (sinh ra, không sửa tay)
├─ remote-shield@ubuntu-assistant/
│  ├─ metadata.json           uuid, shell-version ["50"], session-modes [user, unlock-dialog], version-name
│  ├─ extension.js            file khởi động mỏng (gần như không bao giờ sửa)
│  ├─ core.js                 toàn bộ logic extension (ShieldCore)
│  ├─ overlay.js              vẽ shield.png
│  └─ config.json             cấu hình mặc định
└─ shim/
   ├─ shield-shim.c           thư viện LD_PRELOAD (+ chương trình selftest khi -DSELFTEST)
   ├─ build.sh                build ra shim/build/
   ├─ shieldctl               lệnh điều khiển / chẩn đoán
   └─ test-harness.c          giả lập Mutter để thử nhánh thay khung và gửi lại khung gốc
```

Sau khi cài:
- `~/.local/lib/remote-shield/shield-shim.so`
- `~/.local/bin/shieldctl`
- `~/.config/systemd/user/org.gnome.Shell@.service.d/remote-shield.conf` (`Environment=LD_PRELOAD=…`)
- `~/.local/share/gnome-shell/extensions/remote-shield@ubuntu-assistant/`

## 10. Quy ước phát triển

- Comment, log, thông báo viết bằng tiếng Việt. Log extension có tiền tố `[remote-shield]` (xem bằng `journalctl --user -b | grep remote-shield` hoặc `journalctl -b | grep remote-shield`).
- Mọi thay đổi hành vi che phải giữ nguyên tắc **fail-closed** và **khoá trước, trả màn hình sau**.
- Shim không được chặn hay làm chậm commit khi không che. Phần đọc cờ chỉ là một `access()` mỗi 100 ms.
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
1. Memory: `/home/luannt/.claude/projects/-home-luannt-works-claude-project-Ubuntu-Assistant/memory/MEMORY.md` và `remote-shield-project.md`
2. [../index.md](../index.md)
3. File này
4. `remote-shield/remote-shield@ubuntu-assistant/core.js`, rồi `remote-shield/shim/shield-shim.c` nếu đụng tầng KMS

Code path cheatsheet:

| Cần làm | File |
|---|---|
| Đổi điều kiện coi là phiên remote | `core.js` `_isRemote` |
| Đổi cách chặn input / phím khẩn cấp | `core.js` `_filter` |
| Đổi quy tắc dồn/trả cửa sổ | `core.js` `_gatherWindows`, `_restoreWindows` |
| Đổi kiểm tra an toàn / thời gian chờ | `core.js` `_verify`, `_shimProblem`, `config.json` `verifyMs` |
| Đổi chữ / bố cục ảnh trên màn trắng | `overlay.js` (+ `message` trong config) |
| Đổi màu nền, cách thay khung, xử lý cursor | `shield-shim.c` `create_fb`, hook `drmModeAtomicCommit` |
| Thêm trường trạng thái | `shield-shim.c` `write_status` + `core.js` `readStatus`/`_shimProblem` + `shieldctl` |
| Đổi cách cài / bật RDP | `install.sh` |
| Đổi nội dung gói | `package.sh`, `packaging/README.txt` |

Lệnh hay dùng:

```bash
cd "/home/luannt/works/claude-project/Ubuntu Assistant/remote-shield"
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

## 13. Architectural Decisions & Rationale

| Quyết định | Lý do — đừng đảo ngược nếu chưa xử lý được lý do này |
|---|---|
| Che ở tầng giao khung KMS, không phủ actor trong GNOME | RDP lấy ảnh từ stage; phủ trong stage thì người remote cũng thấy trắng (đã thử ở Remote Curtain) |
| Hook `drmModeAtomicCommit` bằng LD_PRELOAD, không vá Mutter / module kernel / compositor riêng | Không cần root, không đụng file hệ thống, gỡ bằng xoá 1 file drop-in, sống qua cập nhật Mutter miễn libdrm giữ ABI |
| Đọc struct nội bộ libdrm, có `check_layout` lúc chạy | `drmModeAtomicReq` là kiểu mờ; kiểm tra bằng chính alloc/add của libdrm, sai bố cục thì chỉ log, không thay khung |
| Fail-closed mặc định | Mục đích là không để lộ màn hình; thà ngắt remote còn hơn để người tại chỗ thấy |
| Khoá máy trước, 800 ms sau mới xoá cờ | Màn hình thật không được lộ desktop dù một khung |
| `session-modes: [user, unlock-dialog]` | Khoá máy không làm tắt extension (nếu tắt sẽ mở rèm giữa chừng) |
| Nhận diện bằng GType `RemoteDesktop` / `disable-animations` | Không che khi chỉ chia sẻ màn hình trong cuộc họp |
| Chặn input theo "có device node" | Thiết bị thật có `/dev/input/*`; thiết bị ảo RDP thì không — phân biệt được mà không cần biết tên thiết bị |
| RDP `mirror-primary` + dồn cửa sổ, không dùng `extend` | `extend` tạo màn ảo trống, người remote không thấy app đang mở; Alt+Tab không kéo cửa sổ sang màn RDP (đã thử) |
| File khởi động mỏng `extension.js` → `core.js?v=` | GJS cache ESM theo URL; không có cách này mỗi lần sửa phải đăng xuất |
| Tự cho remote khi màn hình khóa, không dựa vào extension ngoài | Remote Shield khóa máy sau mỗi lần ngắt; nếu GNOME chặn remote khi khóa thì lần kết nối sau thất bại. Tích hợp để gói cài một lần là đủ. Đếm lệnh chặn/mở chặn để Mutter không báo `inhibit_count > 0` như bản extension cũ |
| Bỏ qua phiên headless | Remote Login có màn ảo, không có gì để che; nếu không bỏ qua thì fail-closed cắt phiên ngay sau khi đăng nhập |
| Drop-in template `org.gnome.Shell@.service.d` | Áp dụng cho mọi biến thể phiên (@ubuntu, @wayland) khi cài máy khác |
| Cài theo user, đóng gói tar.gz thay vì .deb | Mọi thành phần nằm trong `$HOME`, không cần root; .deb chỉ đáng làm khi cần cài nhiều user/máy |
| Giao tiếp qua file thay vì D-Bus | Shim chạy trong hook giao khung, phải cực rẻ và không gọi vào main loop; `access()` + ghi file nguyên tử là đủ |
| Tên "Remote Shield" | Người dùng chọn (từ chối "Veil"). Không đổi tên khi chưa hỏi |

## 14. Common Pitfalls

| Vấn đề | Nguyên nhân | Cách xử lý / bài học |
|---|---|---|
| Remote Login bị văng ra ngay sau khi gõ mật khẩu | Phiên headless vẫn chạy extension → shim không có commit → `_fail` → ngắt RDP | `enable()` thoát sớm khi `global.backend.is_headless()` (sửa 2026-11-13) |
| Cài lại xong extension nằm INACTIVE | `gnome-extensions disable` bất đồng bộ; `enable` gửi lúc chưa tắt xong bị bỏ qua | Chờ trạng thái INACTIVE rồi mới enable, chờ ACTIVE (`install.sh`) |
| LD_PRELOAD không nạp / import gjs lỗi | Đường dẫn project có dấu cách ("Ubuntu Assistant"); LD_PRELOAD tách theo dấu cách | Cài thư viện vào `~/.local/lib/remote-shield/` |
| Sửa core.js nhưng shell vẫn chạy code cũ | Cache ESM | File khởi động mỏng; lần đầu chuyển sang kiểu này vẫn phải đăng xuất một lần |
| Bật cờ nhưng màn hình chưa trắng | Mutter chỉ commit khi có thay đổi | `global.stage.queue_redraw()` sau khi đổi cờ; `shieldctl` gửi `notify-send` để buộc vẽ lại |
| Extension báo chưa che dù shim đã che | Status ghi 2 s/lần, đến muộn | Shim ghi status ngay khi chuyển trạng thái, lần thay khung đầu tiên và khi lỗi |
| Bật cờ không có tác dụng sau khi gnome-shell crash | Guard bật vì marker còn sót | Kiểm tra nguyên nhân crash, rồi `shieldctl reset-guard` |
| Menu Ubuntu và HUD nhảy sang màn trái | Màn chính bị đổi sang HDMI-3 (một màn mất tín hiệu thoáng qua, Mutter lưu lại monitors.xml); không do Remote Shield | Đặt lại DP-2 qua `ApplyMonitorsConfig`. RDP mirror-primary gửi đúng màn chính nên màn chính sai thì người remote xem sai màn |
| Người remote không thấy app ở màn phụ | `mirror-primary` chỉ gửi màn chính | `gatherWindows` |
| Log có `JS ERROR … grabbedsOldRect` | Lỗi của extension tiling-assistant | Không liên quan, bỏ qua |
| Máy tự khóa sau khi ngắt, lần sau không remote vào được (máy mới) | GNOME chặn remote khi khóa; trước đây phải cài thêm extension Allow Locked Remote Desktop | `allowWhenLocked` (#19) |
| Log `meta_dbus_session_manager_uninhibit: assertion 'priv->inhibit_count > 0' failed` | Extension Allow Locked Remote Desktop bỏ qua lệnh chặn nhưng vẫn để lệnh mở chặn chạy khi mở khóa | Remote Shield bỏ qua cả cặp; nếu còn thấy log này, kiểm tra xem còn extension nào khác đè `inhibit_remote_access` |
| Cùng lúc có Remote Shield và extension khác đè `inhibit_remote_access` | Mỗi bên lưu "hàm gốc" là bản đè của bên kia; tắt theo thứ tự sai sẽ khôi phục nhầm | `install.sh`: tắt Remote Shield → gỡ extension kia → bật Remote Shield |
| `shieldctl status` báo sai khi có 2 gnome-shell cùng user | `pgrep … | head -1` lấy pid đầu tiên | Hiếm (chỉ khi Remote Login và phiên tại chỗ cùng tồn tại); chưa sửa |
| Phiên headless khởi động xoá cờ của phiên tại chỗ | Hai phiên dùng chung `$XDG_RUNTIME_DIR`; shim xoá `blank` trong constructor | Chưa xảy ra vì GNOME không cho cùng user đăng nhập tại chỗ và Remote Login đồng thời; nếu đổi thì cần tách cờ theo pid |

## 15. Memory files & external resources

- Memory project: `/home/luannt/.claude/projects/-home-luannt-works-claude-project-Ubuntu-Assistant/memory/remote-shield-project.md`
- Mã nguồn: `/home/luannt/works/claude-project/Ubuntu Assistant/remote-shield/`
- Thư viện đã cài: `/home/luannt/.local/lib/remote-shield/shield-shim.so`
- Drop-in: `/home/luannt/.config/systemd/user/org.gnome.Shell@.service.d/remote-shield.conf`
- Extension đã cài: `/home/luannt/.local/share/gnome-shell/extensions/remote-shield@ubuntu-assistant/`
- Log shim: `/home/luannt/.cache/remote-shield/shim.log`
- Cấu hình màn hình: `/home/luannt/.config/monitors.xml`
- Chứng chỉ RDP user: `/home/luannt/.local/share/gnome-remote-desktop/certificates/`
- Tài liệu tham khảo: GNOME Remote Desktop (`man grdctl`), Linux DRM KMS atomic API (`include/uapi/drm/drm_mode.h`), libdrm `xf86drmMode.c` (định nghĩa `drmModeAtomicReq`)
