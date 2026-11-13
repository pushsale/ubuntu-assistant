# System HUD — Chi tiết kỹ thuật

Đọc xong file này là đủ để sửa System HUD mà không cần hỏi lại. Bối cảnh cho người không đọc code: [overview.md](overview.md).

## 1. Tổng quan, tech stack, cách chạy

System HUD là GNOME Shell extension, UUID `system-hud@ubuntu-assistant` (tên cũ: Sci-Fi HUD, `scifi-hud@ubuntu-assistant`).
- Đặt một `St.DrawingArea` vào `Main.layoutManager._backgroundGroup`, tức lớp hình nền.
- Mỗi lần repaint, vẽ toàn bộ bảng bằng Cairo theo theme đang chọn.
- Không có prefs, không có D-Bus, không cần quyền root.

Môi trường: Ubuntu 26.04, GNOME Shell 50.1 (Wayland), GPU NVIDIA GTX 1660 (`nvidia-smi` có sẵn trong driver).

Lệnh (chạy trong `system-hud/`):

```bash
./install.sh [theme]                   # chép file, giữ config.json đã có, nạp lại extension (không cần đăng xuất)
./hud-config.sh                        # xem cấu hình đang cài
./hud-config.sh theme orbitalLight     # đổi 1 khoá; HUD áp dụng ngay nhờ theo dõi file
./hud-config.sh monitor secondary
gjs -m tools/preview.js <thư-mục-ra> [giây] [hình-nền.png] [theme,...]   # xuất ảnh xem trước theme
gjs -m tools/anim-preview.js <thư-mục-ra> [theme] [intervalMs] [animMs] [fps]  # xuất khung hình hiệu ứng, đo thời gian vẽ
gnome-extensions info system-hud@ubuntu-assistant
journalctl -b --no-pager | grep system-hud
```

Lần đầu cài, hoặc sau khi đổi UUID, phải đăng xuất rồi đăng nhập lại: trên Wayland, shell đang chạy không nạp được UUID mới. Từ đó về sau chỉ cần chạy `./install.sh`.

## 2. Kiến trúc và pipeline

```
extension.js ── import('./core.js?v=<Date.now()>') ──► HudCore (core.js)
                                                         │
     enable(): loadConfig ─► new Sensors().start() ─► tạo St.DrawingArea(reactive=false) trong _backgroundGroup
               │                    │                     ├─ 'child-added' của group → _raise() (luôn trên ảnh nền)
               │                    │                     ├─ 'monitors-changed', 'workareas-changed' → _relayout()
               │                    │                     └─ Gio.FileMonitor config.json → nạp lại cfg, _relayout, đổi timer
               │                    └─ nvidia-smi -lms 1000 (luồng, đọc dòng bất đồng bộ) → state.gpu
               ▼
     timer intervalMs (≥500) ─► sensors.update() ─► _onSample(): animator.push(state)
                                                      └─ timer 1000/fps ms chạy trong animMs: animator.frame(now) → queue_repaint
     'repaint' ─► drawHud(cr, w, h, displayState, theme)  (hud.js, hàm thuần)
                   ├─ scale k = min(w/480, h/neededH)
                   ├─ theme có draw() riêng (card) → tự vẽ toàn bộ
                   └─ còn lại: nền panel cache theo theme+kích thước → SECTIONS (header, CPU, MEM, GPU, DISK, NET) → footer → overlay
```

## 3. Luồng chi tiết (tham chiếu code)

Đường dẫn tính từ gốc repo `Ubuntu Assistant/`.

| Bước | Code |
|---|---|
| Nạp core.js kèm mã phiên bản; core.js nạp tiếp sensors/hud/animator cùng mã đó | [extension.js](../../system-hud/system-hud@ubuntu-assistant/extension.js), [core.js:11-14](../../system-hud/system-hud@ubuntu-assistant/core.js) |
| Mặc định cấu hình, đọc config.json | `DEFAULTS` [core.js:16](../../system-hud/system-hud@ubuntu-assistant/core.js), `loadConfig` [core.js:27](../../system-hud/system-hud@ubuntu-assistant/core.js) |
| Né dock trái tự ẩn (dash-to-dock không trừ vào work area) | `dockMargin` [core.js:39](../../system-hud/system-hud@ubuntu-assistant/core.js) |
| Gắn vào lớp hình nền, theo dõi màn hình và config | `enable` [core.js:59](../../system-hud/system-hud@ubuntu-assistant/core.js) |
| Hẹn giờ lấy mẫu | `_startTimer` [core.js:117](../../system-hud/system-hud@ubuntu-assistant/core.js) |
| Mẫu mới → chạy hiệu ứng | `_onSample` [core.js:129](../../system-hud/system-hud@ubuntu-assistant/core.js) |
| Chọn màn hình (`primary`/`secondary`/số) | `_monitorIndex` [core.js:189](../../system-hud/system-hud@ubuntu-assistant/core.js) |
| Tính vị trí/kích thước theo work area, mép, dock | `_relayout` [core.js:202](../../system-hud/system-hud@ubuntu-assistant/core.js) |
| Khởi tạo cảm biến (chọn file nhiệt độ, ổ gốc, GPU AMD) | `Sensors` constructor [sensors.js:76](../../system-hud/system-hud@ubuntu-assistant/sensors.js) |
| Một lần đo | `update` [sensors.js:146](../../system-hud/system-hud@ubuntu-assistant/sensors.js) |
| CPU / RAM / disk / net | `_readCpu` [sensors.js:172](../../system-hud/system-hud@ubuntu-assistant/sensors.js), `_readMem` 211, `_readDiskUsage` 240, `_readDisk` 255, `_readNet` 288 |
| NVIDIA: luồng `nvidia-smi` | `_startNvidia` [sensors.js:334](../../system-hud/system-hud@ubuntu-assistant/sensors.js), `_parseNvidia` 372 |
| Nội suy | `Animator` [animator.js:30](../../system-hud/system-hud@ubuntu-assistant/animator.js) |
| Vẽ | `drawHud` [hud.js:1415](../../system-hud/system-hud@ubuntu-assistant/hud.js), `SECTIONS` [hud.js:1400](../../system-hud/system-hud@ubuntu-assistant/hud.js) |
| Theme | tactical [hud.js:235](../../system-hud/system-hud@ubuntu-assistant/hud.js), terminal 536, `makeOrbital` 796 → orbital 1044 / orbitalLight 1051, card 1058, `THEMES` 1311 |

Chi tiết từng bước:
- **Nhiệt độ CPU**: tìm trong `/sys/class/hwmon/*` có `name` là `coretemp`, `k10temp` hoặc `zenpower`, ưu tiên nhãn `Package id 0`, `Tctl`, `Tdie`.
- **Nhiệt độ ổ đĩa**: hwmon `nvme` nhãn `Composite`, hoặc `drivetemp`.
- **CPU**: % tính từ hiệu số `/proc/stat` giữa 2 lần đo; tần số lấy từ `/proc/cpuinfo`.
- **Lịch số đo**:
  - Dung lượng ổ: 10 tick một lần (`statvfs`).
  - IP: 30 tick một lần, chạy `ip -4 -o addr show dev <iface>`.
  - Card mạng: lấy từ route mặc định trong `/proc/net/route`.
- **GPU NVIDIA**:
  - Chạy `nvidia-smi --query-gpu=name,utilization.gpu,temperature.gpu,memory.used,memory.total,power.draw,power.limit,fan.speed,clocks.gr --format=csv,noheader,nounits -lms 1000` một lần và giữ tiến trình. Mỗi giây một dòng, đọc bằng `read_line_async`.
  - `stop()` huỷ việc đọc và `force_exit` tiến trình.
- **GPU AMD**: chỉ có % tải, đọc từ `/sys/class/drm/*/device/gpu_busy_percent`, và chỉ khi không có `nvidia-smi`.
- **Animator**:
  - Nội suy tuyến tính mọi số giữa mẫu cũ và mẫu mới, easing `easeOutCubic`.
  - Mảng lịch sử (khoá kết thúc bằng `history`/`Hist`) không nội suy; thay vào đó `state.shift` (1→0) làm đồ thị trượt.
  - `tick` lẻ dùng cho chuyển động trang trí.
  - Mẫu đầu tiên hiện ngay, không có hiệu ứng.

## 4. Data model

Không có database. `Sensors.state` là input duy nhất của `drawHud` (xem [sensors.js:81](../../system-hud/system-hud@ubuntu-assistant/sensors.js)):

```
{ tick, historySeconds, shift (do Animator thêm),
  sys:  {hostname, os, kernel, uptime},
  cpu:  {model, threads, usage, perCore[], temp, freq, freqMax, load[3], history[]},
  mem:  {total, used, percent, cached, swapTotal, swapUsed, swapPercent, history[]},
  gpu:  {available, name, util, temp, memUsed, memTotal, memPercent, power, powerLimit, fan, clock, history[]},
  disk: {mount:'/', device, total, used, percent, readRate, writeRate, readHist[], writeHist[], temp},
  net:  {iface, ip, rxRate, txRate, rxTotal, txTotal, rxHist[], txHist[]} }
```

- Lịch sử giữ `HISTORY = 60` mẫu. Hằng số này khai báo 2 lần, ở [sensors.js:8](../../system-hud/system-hud@ubuntu-assistant/sensors.js) và [hud.js:7](../../system-hud/system-hud@ubuntu-assistant/hud.js), phải luôn khớp nhau.
- Đơn vị: byte, byte/giây, °C, %, MHz, W.
- Giá trị không đọc được là `null`; theme hiển thị `--`.

## 5. API / giao diện giữa các module

- **Theme object** (dùng bởi bố cục chung):
  - Vẽ khung: `panel(cr, W, H, s)`, `header(cr, x, y, w, h, s)`, `footer(...)`, `overlay(cr, W, H, s)`.
  - Thành phần: `section`, `label`, `value`, `stat`, `bar`, `gauge`, `graph`, `cores`.
  - Màu: `tempColor`, bảng màu `c`.
  - Theme có `draw(cr, W, H, s)` và `neededH` (hiện là `card`) thì tự vẽ toàn bộ và bỏ qua `SECTIONS`.
- **Theme mới**: thêm vào hud.js rồi đăng ký ở `THEMES`. `loadConfig` đổi tên theme không có trong `THEMES` thành `orbital`.
- **Không có API ngoài.** Giao tiếp duy nhất với bên ngoài là `config.json`. Theo dõi bằng `Gio.FileMonitor`, chỉ phản ứng với `CHANGES_DONE_HINT`/`CREATED`.

## 6. Cấu hình và tác động khi đổi

File `~/.local/share/gnome-shell/extensions/system-hud@ubuntu-assistant/config.json`:
- `install.sh` giữ nguyên file này nếu đã có.
- Đổi bằng `hud-config.sh <khoá> <giá trị>` hoặc sửa tay; HUD áp dụng ngay.

| Khoá | Mặc định | Đang dùng | Tác động |
|---|---|---|---|
| `theme` | orbital | orbital | `tactical` / `terminal` / `orbital` / `orbitalLight` / `card`. Sai tên → orbital |
| `monitor` | primary | secondary | `primary`, `secondary` (màn đầu tiên không phải màn chính) hoặc số thứ tự. Đổi màn chính trong Settings thì `secondary` đổi theo |
| `side` | left | left | `left` / `right`. Bên trái màn chính tự cộng thêm chỗ cho dock tự ẩn |
| `widthFraction` | 0.25 | 0.25 | Tỉ lệ chiều rộng màn hình; chiều cao luôn bằng work area trừ `gap` |
| `gap` | 12 | 12 | Khoảng cách tới mép, top bar, dock |
| `intervalMs` | 3000 | 3000 | Chu kỳ đo (tối thiểu 500). Giảm thì tốn CPU hơn và đồ thị 60 mẫu phủ ít thời gian hơn |
| `animMs` | 900 | 3000 (thử từ 2026-11-13: chuyển liên tục suốt chu kỳ, CPU gnome-shell tăng khoảng 16% một nhân) | Thời gian hiệu ứng; `0` = tắt hiệu ứng (vẽ 1 lần mỗi mẫu) |
| `fps` | 30 | 15 (từ 2026-11-13: với hiệu ứng liên tục, 30 fps tốn khoảng 43% một nhân và làm CPU giữ xung turbo, nóng ~72°C; 15 fps khoảng 31%, ~63°C; người dùng thấy đủ mượt) | Số khung/giây khi đang chạy hiệu ứng |

Thiết lập ngoài cũng ảnh hưởng tới HUD:
- **Màn chính** (`~/.config/monitors.xml`): quyết định `primary`/`secondary`.
- **dash-to-dock** (`dock-position`, `dock-fixed`, `dash-max-icon-size`): quyết định khoảng né dock.

## 7. Giao diện

| Theme | Mô tả | Code |
|---|---|---|
| tactical | Khung cơ giáp cam/đen, lục giác, sọc cảnh báo | [hud.js:235](../../system-hud/system-hud@ubuntu-assistant/hud.js) |
| terminal | Màn CRT phốt-pho hổ phách, chữ đơn cách, scanline | hud.js:536 |
| orbital (đang dùng) | Giao diện tàu vũ trụ: nét trắng, điểm nhấn san hô/cyan, vòng đo (gauge) tròn cho CPU/GPU, nền xanh tím trong mờ | hud.js:796, 1044 |
| orbitalLight | Orbital nền trắng, chữ navy, thang màu đậm hơn | hud.js:1051 |
| card | Thẻ sáng kiểu ứng dụng GNOME, vòng donut xanh, bố cục riêng (`draw`) | hud.js:1058 |

- **Bố cục chung**, thiết kế cho bề rộng 480 px rồi co giãn:
  - header 74 px: tên máy, OS, kernel, giờ;
  - CPU 242 px: vòng đo, từng nhân, nhiệt, tần số, load, đồ thị;
  - RAM 128 px;
  - GPU 176 px;
  - Disk 152 px;
  - Network 178 px;
  - footer 22 px: uptime.
- **Màu theo mức tải/nhiệt**: `heat()`/`heatLight()` [hud.js:167](../../system-hud/system-hud@ubuntu-assistant/hud.js).
- **Ngày 2026-11-13** (#23): vòng đo GPU phóng to (r 44 → 58, tâm `x+68, top+68`), cỡ số trong vòng nhỏ tính theo bán kính (`r × 0.66`).
- **Ngày 2026-11-12**, theo yêu cầu "đỡ rối", đã bỏ khỏi `gauge()` của orbital:
  - thước 12 vạch mỗi 30°;
  - 2 cung trang trí xoay chậm bên ngoài.

  Giữ lại: vòng nền, cung giá trị, cung nhiệt độ bên trong.

## 8. Lịch sử tính năng

| Ngày | Thay đổi |
|---|---|
| 2026-11-12 | #1/#2: bảng theo dõi hệ thống, rồi Sci-Fi HUD với các theme tactical, terminal, orbital, card |
| 2026-11-12 | Animator (chuyển mượt, đồ thị trượt), cache nền panel, `orbitalLight`, theo dõi config.json, chọn màn hình/mép |
| 2026-11-12 | File khởi động mỏng; install.sh chờ INACTIVE/ACTIVE (sửa lỗi nằm ở INACTIVE sau khi cài lại) |
| 2026-11-12 | Gauge orbital bỏ thước vạch và 2 cung xoay ngoài |
| 2026-11-13 | #21: thử `animMs` = `intervalMs` = 3000 (hiệu ứng chạy suốt chu kỳ). #22: làm tròn GPU Clock/Fan (số nội suy hiện 10 chữ số thập phân). #23: vòng đo GPU r 44 → 58 |
| 2026-11-13 | #18: đổi tên Sci-Fi HUD → System HUD (UUID mới). Trên máy này đã gỡ hẳn UUID cũ và đăng nhập lại để nạp sạch; `install.sh` không giữ code chuyển đổi (bản cũ chưa từng được cài ở máy khác) |

## 9. Cấu trúc thư mục

```
system-hud/
├─ install.sh                  cài / nạp lại; [theme] đặt theme
├─ hud-config.sh               xem / đổi 1 khoá trong config.json đã cài
├─ system-hud@ubuntu-assistant/
│  ├─ metadata.json            uuid, name "System HUD", shell-version ["50"]
│  ├─ extension.js             file khởi động mỏng (gần như không sửa)
│  ├─ core.js                  HudCore: gắn vào shell, bố cục, timer, theo dõi config
│  ├─ sensors.js               đọc số liệu (không phụ thuộc gnome-shell, chạy được bằng gjs)
│  ├─ animator.js              nội suy giữa 2 mẫu
│  ├─ hud.js                   drawHud + 5 theme (Cairo/Pango, không phụ thuộc gnome-shell)
│  └─ config.json              cấu hình mặc định
└─ tools/
   ├─ preview.js               ảnh PNG xem trước mọi theme trên hình nền mô phỏng 1920x1080
   └─ anim-preview.js          xuất các khung hình của một lần chuyển số liệu + đo thời gian vẽ
```

## 10. Quy ước phát triển

- Comment và log bằng tiếng Việt; log có tiền tố `[system-hud]`.
- `sensors.js`, `animator.js`, `hud.js` không được import gì của GNOME Shell (`resource:///org/gnome/shell/...`), để `tools/` chạy được bằng `gjs -m`.
- Thêm hoặc đổi module con: nạp kèm `VERSION_QUERY` trong core.js, nếu không bản cũ sẽ bị cache.
- **Sửa giao diện**:
  1. Xuất ảnh bằng `tools/preview.js` để xem trước.
  2. Chạy `./install.sh`.
  3. Nhìn trên máy thật.
  4. Nếu đổi hiệu ứng, đo bằng `tools/anim-preview.js`: thời gian vẽ mỗi khung phải nhỏ hơn hẳn 1000/fps ms.
- Không vẽ thứ không đổi theo khung hình vào đường vẽ chính; đưa vào `panel()` (được cache).
- `cr.$dispose()` sau mỗi lần vẽ (đã có trong handler repaint) để tránh rò bộ nhớ Cairo.

## 11. Workflow xử lý issue

1. `gnome-extensions info system-hud@ubuntu-assistant`: phải là ACTIVE. Nếu INACTIVE hay ERROR, xem `journalctl -b | grep -E "system-hud|JS ERROR"`.
2. HUD nằm sai màn hoặc sai vị trí: kiểm tra màn chính (Settings → Displays), `monitor`/`side` trong config, và cấu hình dock.
3. Thiếu số liệu GPU: chạy `nvidia-smi` bằng tay; thiếu nhiệt độ: `cat /sys/class/hwmon/*/name`.
4. Lỗi vẽ (`[system-hud] lỗi khi vẽ`): tái hiện ngoài shell bằng `gjs -m tools/preview.js /tmp/x 5 "" <theme>`.
5. Fix xong: thêm mục vào Common Pitfalls bên dưới.

## 12. Onboarding checklist cho session mới

Thứ tự đọc:
1. Memory: `/home/luannt/.claude/projects/-home-luannt-works-claude-project-Ubuntu-Assistant/memory/MEMORY.md`
2. [../index.md](../index.md)
3. File này
4. `core.js`, rồi `hud.js` (phần theme cần sửa)

Code path cheatsheet:

| Cần làm | File |
|---|---|
| Thêm / sửa số liệu | `sensors.js` (state + hàm `_read*`), rồi chỗ hiển thị trong `hud.js` (`drawCpu`…`drawNet` hoặc `card.draw`) |
| Sửa kiểu dáng một theme | `hud.js`, khối theme tương ứng |
| Thêm theme | `hud.js` + `THEMES`; thêm tên vào chú thích `DEFAULTS.theme` và `hud-config.sh` |
| Đổi chiều cao các khối | `SECTIONS` trong `hud.js` |
| Đổi vị trí / né dock / chọn màn | `core.js` `_relayout`, `_monitorIndex`, `dockMargin` |
| Đổi hiệu ứng | `animator.js`, `animMs`/`fps` |
| Đổi cách cài | `install.sh` |

Lệnh hay dùng:

```bash
cd "/home/luannt/works/claude-project/Ubuntu Assistant/system-hud"
./install.sh && gnome-extensions info system-hud@ubuntu-assistant | grep State
./hud-config.sh
gjs -m tools/preview.js /tmp/hud-preview 10
```

Trạng thái runtime (2026-11-13):
- Đã cài `system-hud@ubuntu-assistant` và bật trong danh sách.
- UUID cũ `scifi-hud@ubuntu-assistant` đã gỡ hẳn (thư mục và danh sách bật).
- Cấu hình: orbital, màn phụ HDMI-3, mép trái.

## 13. Architectural Decisions & Rationale

| Quyết định | Lý do |
|---|---|
| Vẽ trong `_backgroundGroup` (lớp hình nền) | HUD luôn dưới mọi cửa sổ, không nhận chuột, không chiếm chỗ trên workspace; đi theo hình nền khi đổi màn hình |
| `_raise()` khi group có child mới | Đổi hình nền hoặc màn hình thì GNOME thêm actor nền mới lên trên, che mất HUD |
| Vẽ bằng Cairo trên một DrawingArea, không dựng cây St widget | Tự do tạo hình (gauge, chamfer, glow); dễ xuất ảnh xem trước ngoài shell |
| `hud.js` là hàm thuần `drawHud(cr, w, h, state, theme)` | Test và xem trước bằng gjs, không cần đăng nhập lại |
| Một tiến trình `nvidia-smi -lms 1000` chạy liên tục | Khởi động `nvidia-smi` mỗi lần đo tốn khoảng 100 ms CPU; chạy luồng thì rẻ và không chặn main loop |
| Animator nội suy + timer khung hình chỉ chạy trong `animMs` | Mượt mà vẫn nhẹ: khoảng 27 khung mỗi 3 giây, không vẽ liên tục |
| Cache nền panel theo `theme:w×h` | Phần khung tĩnh chiếm nhiều thời gian vẽ nhất |
| Cấu hình qua `config.json` + FileMonitor, không làm GSettings schema | Không phải biên dịch schema, đổi bằng một lệnh, áp dụng ngay |
| File khởi động mỏng `core.js?v=` | GJS cache ESM theo URL; tránh phải đăng xuất mỗi lần sửa |
| `install.sh` chờ trạng thái giữa disable và enable | `disable` bất đồng bộ; `enable` gửi sớm bị bỏ qua |
| Tên "System HUD" | Người dùng chọn ngày 2026-11-13 (thay "Sci-Fi HUD"); đổi tên cần hỏi trước |

## 14. Common Pitfalls

| Vấn đề | Nguyên nhân | Cách xử lý |
|---|---|---|
| Cài lại xong HUD biến mất, extension INACTIVE | Bật lại khi shell chưa tắt xong extension | `install.sh` chờ INACTIVE rồi mới enable, chờ ACTIVE |
| Sửa code nhưng HUD vẫn chạy bản cũ | Cache ESM (trước khi có file khởi động mỏng), hoặc module con import không kèm `VERSION_QUERY` | Luôn import module con kèm `VERSION_QUERY` |
| HUD (và menu Ubuntu) nhảy sang màn khác | Màn chính bị đổi (monitors.xml lưu lại sau khi một màn mất tín hiệu thoáng qua); `monitor: secondary` tính theo màn chính | Đặt lại màn chính (DP-2) trong Settings → Displays hoặc qua `ApplyMonitorsConfig` |
| HUD bị hình nền che sau khi đổi wallpaper | Actor nền mới được thêm lên trên | Đã xử lý bằng `child-added` → `_raise()` |
| Đổi UUID: HUD mới không hiện ngay | Wayland không nạp extension mới khi shell đang chạy | Đăng xuất / đăng nhập; bản cũ vẫn chạy tới lúc đó |
| Xoá thư mục của extension đang chạy: extension biến mất, log `ImportError … core.js: No such file` | Tắt một extension thì GNOME tắt rồi bật lại các extension đứng sau nó trong danh sách; lúc bật lại, extension đã mất file nên nạp `core.js` thất bại (gặp khi đổi tên HUD rồi gỡ Allow Locked Remote Desktop) | Đổi tên / gỡ extension: bỏ khỏi `enabled-extensions` rồi mới xoá thư mục, sau đó đăng xuất và đăng nhập lại để nạp sạch; không giữ bản tạm |
| Số liệu hiện dạng `726.3962025246043 MHz` | Animator nội suy mọi số; chỗ hiển thị không làm tròn (lộ rõ khi `animMs` dài) | Làm tròn khi định dạng (`Math.round` cho Clock, Fan). Thêm số liệu mới: luôn định dạng bằng `toFixed`/`Math.round`/`fmtBytes` |
| Đổi `fps` trong config không có tác dụng | Khi `animMs >= intervalMs` timer khung hình chạy liên tục, không bao giờ tạo lại với fps mới | Theo dõi config: fps đổi thì huỷ và tạo lại timer khung hình (#24) |
| `nvidia-smi` báo GPU 30–37% khi HUD chạy hiệu ứng liên tục | % tải tính theo xung hiện tại; GPU đang ở xung thấp (≈405 MHz) nên việc nhỏ cũng hiện % cao | Xem công suất: bật/tắt HUD chỉ chênh ≈0,4 W (8,3 so với 7,9 W). Chi phí thật là CPU gnome-shell (đo 2026-11-13: tắt HUD 17%, hiệu ứng 0,9 s 25%, liên tục 30 fps 38%, 15 fps 29%, 10 fps 25%) |
| Gauge orbital rối mắt | Quá nhiều chi tiết trang trí | Đã bỏ thước vạch và cung xoay (2026-11-12); không thêm lại khi chưa hỏi |
| Log có `JS ERROR … grabbedsOldRect` | Lỗi của extension tiling-assistant | Không liên quan HUD |

## 15. Memory files & external resources

- Memory: `/home/luannt/.claude/projects/-home-luannt-works-claude-project-Ubuntu-Assistant/memory/MEMORY.md`
- Mã nguồn: `/home/luannt/works/claude-project/Ubuntu Assistant/system-hud/`
- Extension đã cài: `/home/luannt/.local/share/gnome-shell/extensions/system-hud@ubuntu-assistant/`
- Repo: `github.com/pushsale/ubuntu-assistant` (private)
- Tham khảo: GJS guide (gjs.guide), Cairo/Pango API, `man nvidia-smi`, `Documentation/hwmon` của kernel
