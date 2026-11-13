// Xuất ảnh màn che (giống màn khóa) ra file để xem trước, không cần gnome-shell.
// Dùng: gjs -m tools/preview-shield.js <file-ra.png> [WxH] [chữ gợi ý]
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import System from 'system';
import {ShieldPainter} from '../remote-shield@ubuntu-assistant/overlay.js';

const [out = 'shield-preview.png', size = '1920x1080', hint = 'Click or press a key to unlock'] = System.programArgs;
const [width, height] = size.split('x').map(Number);
const bg = new Gio.Settings({schema_id: 'org.gnome.desktop.background'});
const iface = new Gio.Settings({schema_id: 'org.gnome.desktop.interface'});
const uri = iface.get_string('color-scheme') === 'prefer-dark' ? bg.get_string('picture-uri-dark') : bg.get_string('picture-uri');
const now = GLib.DateTime.new_now_local();
const t0 = GLib.get_monotonic_time();
const painter = new ShieldPainter(GLib.build_filenamev([GLib.get_user_cache_dir(), 'remote-shield']));
painter.render({
    width, height, scale: 1,
    wallpaper: uri ? Gio.File.new_for_uri(uri).get_path() : null,
    primaryColor: bg.get_string('primary-color'),
    fontFamily: iface.get_string('font-name').replace(/\s+[\d.]+$/, ''),
    textScale: iface.get_double('text-scaling-factor'),
    time: now.format(iface.get_string('clock-format') === '12h' ? '%l:%M %p' : '%H:%M').trim(),
    date: now.format('%A %B %-d'),
    hint,
}, out);
print(`đã ghi ${out} (${((GLib.get_monotonic_time() - t0) / 1000).toFixed(0)} ms)`);
