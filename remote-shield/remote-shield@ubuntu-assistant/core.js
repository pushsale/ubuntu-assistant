// Remote Shield
// Khi có phiên Remote Desktop (RDP của gnome-remote-desktop) đang chạy:
//   - màn hình thật chuyển trắng (kèm dòng thông báo) nhờ thư viện shield-shim nạp trong gnome-shell;
//     hình gửi cho người remote không bị ảnh hưởng
//   - chặn chuột, bàn phím, touchpad thật tại máy; chỉ nhận thao tác từ phía remote
// Khi phiên remote kết thúc: mở lại input, khóa máy, rồi mới trả lại màn hình.
// Không che được màn hình (shim chưa nạp / driver từ chối) -> ngắt phiên remote và khóa máy (failClosed).
// Lối thoát tại chỗ: Ctrl+Alt+Shift+Backspace trên bàn phím thật -> ngắt remote + khóa máy.
//
// Giao tiếp với shield-shim qua thư mục $XDG_RUNTIME_DIR/remote-shield:
//   blank        có file = yêu cầu che màn hình
//   shield.png  ảnh chữ đặt giữa màn trắng (extension vẽ lúc bật)
//   shim-status  trạng thái shim ghi ra (pid, want_blank, swapped_since_on, swap_failed, guard...)

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Clutter from 'gi://Clutter';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import Meta from 'gi://Meta';

// Nạp kèm mã phiên bản của chính file này để overlay.js cũng là bản mới sau mỗi lần cập nhật.
const VERSION_QUERY = import.meta.url.includes('?') ? import.meta.url.slice(import.meta.url.indexOf('?')) : '';
const {renderOverlay} = await import(`./overlay.js${VERSION_QUERY}`);

const DEFAULTS = {
    blockInput: true,         // chặn input thật khi có phiên remote
    lockOnDisconnect: true,   // khóa máy khi phiên remote kết thúc
    matchAllRemote: false,    // true: tính cả chia sẻ màn hình thường (vd. họp trực tuyến) là phiên remote
    failClosed: true,         // không che được màn hình -> ngắt phiên remote và khóa máy
    verifyMs: 4000,           // thời gian chờ khung trắng đầu tiên lên màn hình
    gatherWindows: true,      // dồn cửa sổ ở màn phụ sang màn chính (màn RDP thấy), trả về chỗ cũ khi ngắt
    allowWhenLocked: true,    // vẫn cho kết nối Desktop Sharing khi màn hình đang khóa (GNOME mặc định chặn)
    message: 'Máy tính đang được điều khiển từ xa',
    submessage: 'Màn hình, bàn phím và chuột tại chỗ tạm thời bị vô hiệu hoá',
};

const RUN_DIR = GLib.build_filenamev([GLib.get_user_runtime_dir(), 'remote-shield']);
const FLAG = GLib.build_filenamev([RUN_DIR, 'blank']);
const STATUS = GLib.build_filenamev([RUN_DIR, 'shim-status']);
const OVERLAY = GLib.build_filenamev([RUN_DIR, 'shield.png']);

const PASS_EVENTS = new Set([
    Clutter.EventType.NOTHING,
    Clutter.EventType.DEVICE_ADDED,
    Clutter.EventType.DEVICE_REMOVED,
]);

function log(msg) {
    console.log(`[remote-shield] ${msg}`);
}

function loadJson(path, fallback) {
    try {
        const [ok, bytes] = GLib.file_get_contents(path);
        if (ok)
            return JSON.parse(new TextDecoder().decode(bytes));
    } catch (e) {
        // không có file hoặc hỏng
    }
    return fallback;
}

function readStatus() {
    try {
        const [ok, bytes] = GLib.file_get_contents(STATUS);
        if (!ok)
            return null;
        const st = {};
        for (const line of new TextDecoder().decode(bytes).split('\n')) {
            const i = line.indexOf('=');
            if (i > 0)
                st[line.slice(0, i)] = line.slice(i + 1);
        }
        return st;
    } catch (e) {
        return null;
    }
}

function setFlag(on) {
    try {
        GLib.mkdir_with_parents(RUN_DIR, 0o700);
        if (on)
            GLib.file_set_contents(FLAG, '1');
        else if (GLib.file_test(FLAG, GLib.FileTest.EXISTS))
            Gio.File.new_for_path(FLAG).delete(null);
    } catch (e) {
        log(`không ${on ? 'tạo' : 'xoá'} được ${FLAG}: ${e.message}`);
    }
}

export class ShieldCore {
    constructor(path) {
        this.path = path;
    }

    enable() {
        // Phiên Remote Login (gdm mở phiên riêng không gắn màn hình thật, chỉ có màn ảo Meta-0):
        // không có gì để che. Nếu vẫn chạy thì shim không giao khung nào -> báo lỗi -> failClosed
        // cắt luôn phiên remote ngay sau khi đăng nhập. Phiên này cũng dùng chung
        // $XDG_RUNTIME_DIR với phiên tại chỗ, nên tuyệt đối không được đụng tới cờ che.
        this._headless = global.backend.is_headless?.() ?? false;
        if (this._headless) {
            log('phiên không có màn hình thật (Remote Login): không làm gì');
            return;
        }
        this._cfg = {...DEFAULTS, ...loadJson(GLib.build_filenamev([this.path, 'config.json']), {})};
        this._handles = new Map(); // handle -> id tín hiệu 'stopped'
        this._engaged = false;
        this._filterId = 0;
        this._timers = new Set();
        this._moved = []; // cửa sổ đã dồn sang màn chính: {window, monitor, rect, maximized, fullscreen}
        this._shellPid = String(new Gio.Credentials().get_unix_pid());

        setFlag(false); // phiên mới luôn bắt đầu với màn hình bình thường
        try {
            GLib.mkdir_with_parents(RUN_DIR, 0o700);
            renderOverlay(this._cfg, OVERLAY);
        } catch (e) {
            log(`không vẽ được ảnh chữ: ${e.message}`);
        }

        this._controller = global.backend.get_remote_access_controller();
        this._newHandleId = this._controller?.connect('new-handle', (_c, handle) => this._onNewHandle(handle)) ?? 0;
        if (this._cfg.allowWhenLocked)
            this._allowLockedRemote();
        log('đã bật');
    }

    disable() {
        // Gọi khi đăng xuất / tắt extension (không gọi khi khóa máy vì có session-mode unlock-dialog)
        if (this._headless)
            return;
        if (this._newHandleId)
            this._controller.disconnect(this._newHandleId);
        this._newHandleId = 0;
        for (const [h, id] of this._handles)
            h.disconnect(id);
        this._handles.clear();
        this._clearTimers();
        if (this._filterId) {
            Clutter.Event.remove_filter(this._filterId);
            this._filterId = 0;
        }
        this._restoreWindows();
        this._engaged = false;
        setFlag(false);
        this._restoreLockedRemote();
        this._controller = null;
        this._handles = null;
        this._timers = null;
        this._cfg = null;
        log('đã tắt');
    }

    // ---------- tiện ích ----------

    _timeout(ms, fn) {
        const id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
            this._timers?.delete(id);
            return fn();
        });
        this._timers.add(id);
        return id;
    }

    _cancel(id) {
        if (id && this._timers?.has(id)) {
            GLib.source_remove(id);
            this._timers.delete(id);
        }
    }

    _clearTimers() {
        for (const id of this._timers ?? [])
            GLib.source_remove(id);
        this._timers?.clear();
    }

    // Mutter chỉ gửi khung mới khi có thay đổi; buộc vẽ lại để shim áp dụng cờ ngay.
    _redraw() {
        global.stage.queue_redraw();
    }

    _notify(body) {
        try {
            Main.notify('Remote Shield', body);
        } catch (e) {
            log(`không hiện được thông báo: ${e.message}`);
        }
    }

    // ---------- cho remote khi màn hình khóa ----------

    // GNOME (ui/main.js, _sessionUpdated) gọi inhibit_remote_access() khi khóa màn hình và
    // uninhibit_remote_access() khi mở khóa: lúc khóa, Mutter đóng mọi phiên remote và từ chối phiên mới.
    // Remote Shield tự khóa máy mỗi lần ngắt kết nối, nên nếu giữ nguyên thì không remote lại được.
    // Thay hai hàm trên controller: bỏ qua lệnh chặn và lệnh mở tương ứng (đếm để luôn cân bằng,
    // tránh cảnh báo 'inhibit_count > 0' của Mutter). Thay thế extension Allow Locked Remote Desktop.
    _allowLockedRemote() {
        const ctl = this._controller;
        if (!ctl || this._lockPatch)
            return;
        const patch = {
            inhibit: ctl.inhibit_remote_access,
            uninhibit: ctl.uninhibit_remote_access,
            ownInhibit: Object.hasOwn(ctl, 'inhibit_remote_access'),
            ownUninhibit: Object.hasOwn(ctl, 'uninhibit_remote_access'),
            skipped: 0,
        };
        this._lockPatch = patch;
        ctl.inhibit_remote_access = () => {
            patch.skipped++;
            log('màn hình khóa: vẫn cho phép kết nối remote');
        };
        ctl.uninhibit_remote_access = () => {
            if (patch.skipped > 0)
                patch.skipped--;
            else
                patch.uninhibit.call(ctl);
        };
        // Bật lúc màn hình đang khóa: GNOME đã chặn rồi -> gỡ chặn ngay, và bỏ qua lệnh mở khi mở khóa
        if (Main.sessionMode.isLocked) {
            patch.uninhibit.call(ctl);
            patch.skipped++;
        }
        log('cho phép remote khi màn hình khóa');
    }

    _restoreLockedRemote() {
        const ctl = this._controller;
        const patch = this._lockPatch;
        this._lockPatch = null;
        if (!ctl || !patch)
            return;
        if (patch.ownInhibit)
            ctl.inhibit_remote_access = patch.inhibit;
        else
            delete ctl.inhibit_remote_access;
        if (patch.ownUninhibit)
            ctl.uninhibit_remote_access = patch.uninhibit;
        else
            delete ctl.uninhibit_remote_access;
        // GNOME vẫn đang coi là đã chặn (sẽ gọi mở chặn khi mở khóa) -> chặn thật cho cân bằng
        for (; patch.skipped > 0; patch.skipped--)
            ctl.inhibit_remote_access();
    }

    // ---------- theo dõi phiên remote ----------

    _isRemote(handle) {
        const type = handle.constructor?.$gtype?.name ?? '';
        const noAnim = handle.get_disable_animations?.() ?? false;
        log(`phiên chia sẻ mới: kiểu=${type} disable-animations=${noAnim} is-recording=${handle.is_recording}`);
        return type.includes('RemoteDesktop') || noAnim || this._cfg.matchAllRemote;
    }

    _onNewHandle(handle) {
        if (!this._isRemote(handle))
            return; // vd. chia sẻ màn hình trong cuộc họp: không che
        const id = handle.connect('stopped', () => {
            handle.disconnect(id);
            this._handles?.delete(handle);
            log('phiên remote kết thúc');
            this._sync();
        });
        this._handles.set(handle, id);
        this._sync();
    }

    _sync() {
        if (!this._handles)
            return;
        const active = this._handles.size > 0;
        if (active && !this._engaged)
            this._engage();
        else if (!active && this._engaged)
            this._disengage(this._cfg.lockOnDisconnect);
    }

    _stopRemote() {
        for (const h of [...(this._handles?.keys() ?? [])]) {
            try {
                h.stop();
            } catch (e) {
                log(`không dừng được phiên remote: ${e.message}`);
            }
        }
    }

    // ---------- kéo / mở rèm ----------

    _engage() {
        this._engaged = true;
        this._cancel(this._unflagId); // phiên mới tới khi đang mở rèm của phiên trước
        this._unflagId = 0;
        if (this._cfg.blockInput && !this._filterId)
            this._filterId = Clutter.Event.add_filter(global.stage, event => this._filter(event));
        setFlag(true);
        this._redraw();
        log('kéo rèm: yêu cầu che màn hình thật, chặn input tại chỗ');
        if (this._cfg.gatherWindows)
            this._gatherWindows();
        this._verify(GLib.get_monotonic_time());
    }

    // Chờ shim xác nhận khung trắng đầu tiên đã lên màn hình; sau đó theo dõi định kỳ.
    _verify(start) {
        this._cancel(this._verifyId);
        this._verifyId = this._timeout(250, () => {
            this._verifyId = 0;
            if (!this._engaged)
                return GLib.SOURCE_REMOVE;
            const problem = this._shimProblem();
            if (problem) {
                this._fail(problem);
                return GLib.SOURCE_REMOVE;
            }
            const st = readStatus();
            if (st?.want_blank === '1' && Number(st.swapped_since_on) > 0) {
                log('shim xác nhận màn hình thật đã được che');
                this._notify('Màn hình tại chỗ đã được che; bàn phím và chuột tại chỗ bị chặn.');
                this._watch();
                return GLib.SOURCE_REMOVE;
            }
            if ((GLib.get_monotonic_time() - start) / 1000 > this._cfg.verifyMs) {
                this._fail('không thấy khung trắng nào được đưa ra màn hình');
                return GLib.SOURCE_REMOVE;
            }
            this._redraw();
            this._verify(start);
            return GLib.SOURCE_REMOVE;
        });
    }

    _watch() {
        this._cancel(this._watchId);
        this._watchId = this._timeout(2000, () => {
            this._watchId = 0;
            if (!this._engaged)
                return GLib.SOURCE_REMOVE;
            const problem = this._shimProblem();
            if (problem)
                this._fail(problem);
            else
                this._watch();
            return GLib.SOURCE_REMOVE;
        });
    }

    _shimProblem() {
        const st = readStatus();
        if (!st || st.pid !== this._shellPid)
            return 'thư viện shield-shim chưa được nạp vào gnome-shell';
        if (st.guard === '1')
            return 'shield-shim đang khoá an toàn sau sự cố lần trước (chạy: shieldctl reset-guard)';
        if (st.layout_ok === '0')
            return 'shield-shim không tương thích với libdrm hiện tại';
        if (st.swap_failed === '1')
            return st.last_error || 'driver từ chối khung thay thế';
        return null;
    }

    _fail(reason) {
        log(`không che được màn hình: ${reason}`);
        if (!this._cfg.failClosed) {
            this._notify(`Không che được màn hình tại chỗ: ${reason}.`);
            return;
        }
        this._notify(`Không che được màn hình tại chỗ: ${reason}. Đã ngắt phiên remote và khóa máy.`);
        this._stopRemote();
        if (this._engaged)
            this._disengage(true);
    }

    _disengage(lock) {
        this._engaged = false;
        this._cancel(this._verifyId);
        this._cancel(this._watchId);
        this._verifyId = this._watchId = 0;
        if (this._filterId) {
            Clutter.Event.remove_filter(this._filterId);
            this._filterId = 0;
        }
        this._restoreWindows();
        if (lock && !Main.sessionMode.isLocked)
            Main.screenShield?.lock(false);
        // Khóa trước, trả màn hình sau: màn hình thật không lộ desktop dù chỉ một khung
        this._unflagId = this._timeout(lock ? 800 : 0, () => {
            this._unflagId = 0;
            setFlag(false);
            this._redraw();
            this._timeout(250, () => {
                this._redraw();
                return GLib.SOURCE_REMOVE;
            });
            return GLib.SOURCE_REMOVE;
        });
        log(`mở rèm${lock ? ' sau khi khóa máy' : ''}`);
    }

    // ---------- dồn / trả cửa sổ ----------

    // RDP ở chế độ mirror-primary chỉ gửi màn hình chính: chuyển mọi cửa sổ ở màn khác sang đó.
    _gatherWindows() {
        const primary = global.display.get_primary_monitor();
        const types = new Set([Meta.WindowType.NORMAL, Meta.WindowType.DIALOG,
            Meta.WindowType.MODAL_DIALOG, Meta.WindowType.UTILITY]);
        for (const actor of global.get_window_actors()) {
            const w = actor.get_meta_window?.() ?? actor.meta_window;
            if (!w || w.is_override_redirect() || w.is_skip_taskbar() || !types.has(w.get_window_type()))
                continue;
            const monitor = w.get_monitor();
            if (monitor < 0 || monitor === primary)
                continue;
            if (this._moved.some(m => m.window === w))
                continue;
            const r = w.get_frame_rect();
            const entry = {
                window: w,
                monitor,
                rect: {x: r.x, y: r.y, width: r.width, height: r.height},
                maximized: w.is_maximized(),
                fullscreen: w.is_fullscreen(),
            };
            try {
                w.move_to_monitor(primary);
                this._moved.push(entry);
            } catch (e) {
                log(`không chuyển được cửa sổ "${w.get_title()}": ${e.message}`);
            }
        }
        if (this._moved.length)
            log(`đã dồn ${this._moved.length} cửa sổ từ màn phụ sang màn chính`);
    }

    _restoreWindows() {
        const moved = this._moved ?? [];
        this._moved = [];
        let n = 0;
        const nMonitors = global.display.get_n_monitors();
        for (const m of moved) {
            const w = m.window;
            try {
                if (!w.get_compositor_private() || m.monitor >= nMonitors)
                    continue; // cửa sổ đã đóng / màn hình đã rút ra
                w.move_to_monitor(m.monitor);
                if (m.fullscreen) {
                    if (!w.is_fullscreen())
                        w.make_fullscreen();
                } else if (m.maximized) {
                    if (!w.is_maximized())
                        w.maximize();
                } else {
                    if (w.is_maximized()) {
                        try {
                            w.unmaximize();
                        } catch (e) {
                            w.unmaximize(Meta.MaximizeFlags.BOTH); // API cũ cần cờ
                        }
                    }
                    w.move_resize_frame(false, m.rect.x, m.rect.y, m.rect.width, m.rect.height);
                }
                n++;
            } catch (e) {
                log(`không trả được cửa sổ về chỗ cũ: ${e.message}`);
            }
        }
        if (n)
            log(`đã trả ${n} cửa sổ về màn hình cũ`);
    }

    _filter(event) {
        const type = event.type();
        if (PASS_EVENTS.has(type))
            return Clutter.EVENT_PROPAGATE;
        const device = event.get_source_device();
        // Thiết bị ảo của phiên remote không có device node -> cho qua
        if (!device || !device.get_device_node())
            return Clutter.EVENT_PROPAGATE;

        if (type === Clutter.EventType.KEY_PRESS && event.get_key_symbol() === Clutter.KEY_BackSpace) {
            const need = Clutter.ModifierType.CONTROL_MASK | Clutter.ModifierType.MOD1_MASK | Clutter.ModifierType.SHIFT_MASK;
            if ((event.get_state() & need) === need) {
                // Lối thoát tại chỗ: ngắt mọi phiên remote rồi khóa máy
                log('lối thoát tại chỗ được kích hoạt');
                GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
                    this._stopRemote();
                    if (this._engaged)
                        this._disengage(true);
                    return GLib.SOURCE_REMOVE;
                });
            }
        }
        return Clutter.EVENT_STOP;
    }
}
