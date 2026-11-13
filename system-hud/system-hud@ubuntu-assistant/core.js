// System HUD: vẽ bảng theo dõi CPU/RAM/GPU/Disk/Network thẳng lên desktop,
// nằm dưới mọi cửa sổ (trong background group của GNOME Shell).

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
// Lõi HUD. Được extension.js nạp kèm mã phiên bản (?v=...) để mỗi lần tắt/bật
// extension là chạy code mới nhất, không cần đăng xuất. Các module con cũng
// được nạp kèm đúng mã phiên bản đó.
const VERSION_QUERY = import.meta.url.includes('?') ? import.meta.url.slice(import.meta.url.indexOf('?')) : '';
const {Sensors, HISTORY} = await import(`./sensors.js${VERSION_QUERY}`);
const {drawHud, THEMES} = await import(`./hud.js${VERSION_QUERY}`);
const {Animator} = await import(`./animator.js${VERSION_QUERY}`);

const DEFAULTS = {
    theme: 'orbital',     // tactical | terminal | orbital | orbitalLight | card
    monitor: 'primary',   // 'primary' | 'secondary' | số thứ tự màn hình (0, 1, ...)
    side: 'left',         // 'left' | 'right'
    widthFraction: 0.25,  // tỉ lệ chiều rộng so với màn hình được chọn
    gap: 12,              // khoảng cách tới mép / dock / top bar
    intervalMs: 3000,     // chu kỳ lấy mẫu số liệu
    animMs: 900,          // thời gian hiệu ứng chuyển số liệu (0 = tắt hiệu ứng)
    fps: 30,              // số khung hình/giây trong lúc chạy hiệu ứng
};

function loadConfig(dir) {
    try {
        const [ok, bytes] = GLib.file_get_contents(GLib.build_filenamev([dir, 'config.json']));
        if (ok)
            return {...DEFAULTS, ...JSON.parse(new TextDecoder().decode(bytes))};
    } catch (e) {
        console.warn(`[system-hud] config.json không đọc được, dùng mặc định: ${e.message}`);
    }
    return {...DEFAULTS};
}

// Dock trái ở chế độ tự ẩn không trừ vào work area -> tự chừa chỗ cho nó.
function dockMargin() {
    try {
        const schema = Gio.SettingsSchemaSource.get_default()
            .lookup('org.gnome.shell.extensions.dash-to-dock', true);
        if (!schema)
            return 0;
        const s = new Gio.Settings({settings_schema: schema});
        if (s.get_string('dock-position') !== 'LEFT' || s.get_boolean('dock-fixed'))
            return 0;
        return s.get_int('dash-max-icon-size') + 20;
    } catch (e) {
        return 0;
    }
}

export class HudCore {
    constructor(path) {
        this.path = path;
    }

    enable() {
        this._cfg = loadConfig(this.path);
        if (!THEMES[this._cfg.theme])
            this._cfg.theme = DEFAULTS.theme;

        this._sensors = new Sensors();
        this._sensors.start();

        this._area = new St.DrawingArea({reactive: false, name: 'system-hud'});
        this._area.connect('repaint', area => {
            const cr = area.get_context();
            const [w, h] = area.get_surface_size();
            try {
                drawHud(cr, w, h, this._display ?? this._sensors.state, this._cfg.theme);
            } catch (e) {
                console.error(`[system-hud] lỗi khi vẽ: ${e}`);
            } finally {
                cr.$dispose();
            }
        });

        const group = Main.layoutManager._backgroundGroup;
        group.add_child(this._area);
        // Ảnh nền mới (đổi hình nền / đổi màn hình) được thêm vào cùng group -> luôn đẩy HUD lên trên ảnh nền
        this._childAddedId = group.connect('child-added', (_g, child) => {
            if (child !== this._area)
                this._raise();
        });

        this._monitorsId = Main.layoutManager.connect('monitors-changed', () => this._relayout());
        this._workareasId = global.display.connect('workareas-changed', () => this._relayout());
        this._relayout();

        // Sửa config.json là áp dụng ngay (theme, màn hình, vị trí), không cần đăng nhập lại
        try {
            this._cfgMonitor = Gio.File.new_for_path(GLib.build_filenamev([this.path, 'config.json']))
                .monitor_file(Gio.FileMonitorFlags.NONE, null);
            this._cfgChangedId = this._cfgMonitor.connect('changed', (_m, _f, _o, type) => {
                if (type !== Gio.FileMonitorEvent.CHANGES_DONE_HINT && type !== Gio.FileMonitorEvent.CREATED)
                    return;
                const oldInterval = this._cfg.intervalMs;
                const oldFps = this._cfg.fps;
                this._cfg = loadConfig(this.path);
                if (!THEMES[this._cfg.theme])
                    this._cfg.theme = DEFAULTS.theme;
                this._animator.duration = this._cfg.animMs;
                if (this._cfg.intervalMs !== oldInterval)
                    this._startTimer();
                // timer khung hình chạy liên tục khi animMs >= intervalMs: đổi fps phải tạo lại timer
                if (this._cfg.fps !== oldFps && this._frameId) {
                    GLib.source_remove(this._frameId);
                    this._frameId = 0;
                    this._onSample();
                }
                this._relayout();
            });
        } catch (e) {
            console.warn(`[system-hud] không theo dõi được config.json: ${e.message}`);
        }

        this._animator = new Animator(this._cfg.animMs);
        this._onSample();
        this._startTimer();
    }

    _startTimer() {
        if (this._timerId)
            GLib.source_remove(this._timerId);
        const interval = Math.max(500, this._cfg.intervalMs);
        this._timerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, interval, () => {
            this._sensors.update();
            this._onSample();
            return GLib.SOURCE_CONTINUE;
        });
    }

    // Có mẫu mới: chạy hiệu ứng chuyển từ số cũ sang số mới
    _onSample() {
        const state = this._sensors.state;
        state.historySeconds = HISTORY * this._cfg.intervalMs / 1000;
        const now = GLib.get_monotonic_time() / 1000;
        this._animator.push(state, now);
        this._display = this._animator.frame(now);
        this._area.queue_repaint();
        if (this._cfg.animMs > 0 && !this._frameId) {
            this._frameId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, Math.round(1000 / Math.max(1, this._cfg.fps)), () => {
                this._display = this._animator.frame(GLib.get_monotonic_time() / 1000);
                this._area?.queue_repaint();
                if (this._animator.running)
                    return GLib.SOURCE_CONTINUE;
                this._frameId = 0;
                return GLib.SOURCE_REMOVE;
            });
        }
    }

    disable() {
        if (this._timerId) {
            GLib.source_remove(this._timerId);
            this._timerId = 0;
        }
        if (this._frameId) {
            GLib.source_remove(this._frameId);
            this._frameId = 0;
        }
        this._animator = null;
        this._display = null;
        if (this._monitorsId) {
            Main.layoutManager.disconnect(this._monitorsId);
            this._monitorsId = 0;
        }
        if (this._workareasId) {
            global.display.disconnect(this._workareasId);
            this._workareasId = 0;
        }
        if (this._cfgMonitor) {
            this._cfgMonitor.disconnect(this._cfgChangedId);
            this._cfgMonitor.cancel();
            this._cfgMonitor = null;
        }
        if (this._childAddedId) {
            Main.layoutManager._backgroundGroup.disconnect(this._childAddedId);
            this._childAddedId = 0;
        }
        this._area?.destroy();
        this._area = null;
        this._sensors?.stop();
        this._sensors = null;
        this._cfg = null;
    }

    _raise() {
        const group = Main.layoutManager._backgroundGroup;
        if (this._area && this._area.get_parent() === group)
            group.set_child_above_sibling(this._area, null);
    }

    _monitorIndex() {
        const lm = Main.layoutManager;
        const want = this._cfg.monitor;
        if (Number.isInteger(want) && want >= 0 && want < lm.monitors.length)
            return want;
        if (want === 'secondary') {
            const other = lm.monitors.findIndex((_m, i) => i !== lm.primaryIndex);
            if (other >= 0)
                return other;
        }
        return lm.primaryIndex;
    }

    _relayout() {
        const lm = Main.layoutManager;
        const index = this._monitorIndex();
        const mon = lm.monitors[index];
        if (!mon || !this._area)
            return;
        const wa = lm.getWorkAreaForMonitor(index);
        const gap = this._cfg.gap;
        const width = Math.round(mon.width * this._cfg.widthFraction) - gap * 2;
        // dock trái chỉ nằm trên màn hình chính
        const leftInset = index === lm.primaryIndex ? dockMargin() : 0;
        const x = this._cfg.side === 'right'
            ? wa.x + wa.width - width - gap
            : wa.x + leftInset + gap;
        const y = wa.y + gap;
        const height = wa.y + wa.height - y - gap;
        this._area.set_position(x, y);
        this._area.set_size(width, height);
        this._raise();
        this._area.queue_repaint();
    }
}
