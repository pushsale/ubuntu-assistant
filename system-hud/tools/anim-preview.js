// Render chuỗi khung hình của một lần chuyển số liệu (hiệu ứng) và đo thời gian vẽ.
// Dùng: gjs -m tools/anim-preview.js <thư-mục-ra> [theme] [intervalMs] [animMs] [fps]
// Script lấy 1 mẫu, chờ intervalMs, lấy mẫu thứ 2 rồi vẽ các khung hình trong animMs.

import GLib from 'gi://GLib';
import Cairo from 'cairo';
import System from 'system';
import {Sensors, HISTORY} from '../system-hud@ubuntu-assistant/sensors.js';
import {drawHud} from '../system-hud@ubuntu-assistant/hud.js';
import {Animator} from '../system-hud@ubuntu-assistant/animator.js';

const [outDir = '.', theme = 'orbital', intervalArg = '3000', animArg = '900', fpsArg = '30'] = System.programArgs;
const interval = Number(intervalArg), animMs = Number(animArg), fps = Number(fpsArg);
const W = 456, H = 1024;

const sensors = new Sensors();
sensors.start();
const anim = new Animator(animMs);
const loop = new GLib.MainLoop(null, false);
let samples = 0;

function sample() {
    if (samples > 0)
        sensors.update();
    sensors.state.historySeconds = HISTORY * interval / 1000;
    samples++;
}

// lấy vài mẫu trước để đồ thị có dữ liệu, mẫu cuối cùng dùng để quay hiệu ứng
const WARMUP = Number(GLib.getenv('WARMUP') ?? '6');
GLib.timeout_add(GLib.PRIORITY_DEFAULT, interval, () => {
    sample();
    const now = GLib.get_monotonic_time() / 1000;
    anim.push(sensors.state, now);
    if (samples < WARMUP) {
        anim.frame(now + animMs); // nhảy thẳng tới đích
        return GLib.SOURCE_CONTINUE;
    }
    const frames = Math.ceil(animMs / 1000 * fps) + 1;
    let total = 0;
    for (let i = 0; i < frames; i++) {
        const t = now + i * 1000 / fps;
        const st = anim.frame(t);
        // Vẽ lên lớp trong suốt như St.DrawingArea, rồi mới ghép lên nền
        const hud = new Cairo.ImageSurface(Cairo.Format.ARGB32, W, H);
        const hcr = new Cairo.Context(hud);
        const t0 = GLib.get_monotonic_time();
        drawHud(hcr, W, H, st, theme);
        total += GLib.get_monotonic_time() - t0;
        hcr.$dispose();
        const surf = new Cairo.ImageSurface(Cairo.Format.ARGB32, W, H);
        const cr = new Cairo.Context(surf);
        cr.setSourceRGBA(0.2, 0.08, 0.2, 1);
        cr.paint();
        cr.setSourceSurface(hud, 0, 0);
        cr.paint();
        cr.$dispose();
        surf.writeToPNG(`${outDir}/frame-${String(i).padStart(3, '0')}.png`);
    }
    print(`frames=${frames} avg_draw_ms=${(total / frames / 1000).toFixed(1)} cpu_from=${anim._from.cpu.usage.toFixed(1)} cpu_to=${anim._to.cpu.usage.toFixed(1)}`);
    sensors.stop();
    loop.quit();
    return GLib.SOURCE_REMOVE;
});
loop.run();
