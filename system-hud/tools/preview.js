// Render ảnh xem trước HUD bằng số liệu thật, đặt trên hình nền.
// Dùng: gjs -m tools/preview.js <thư-mục-ra> [số-giây-lấy-mẫu] [hình-nền.png] [theme,...]

import GLib from 'gi://GLib';
import Cairo from 'cairo';
import System from 'system';
import {Sensors} from '../system-hud@ubuntu-assistant/sensors.js';
import {drawHud, THEMES} from '../system-hud@ubuntu-assistant/hud.js';

const [outDir = '.', secArg = '20', wallpaper = '/usr/share/backgrounds/warty-final-ubuntu.png', themeArg = ''] = System.programArgs;
const seconds = Number(secArg);
const themes = themeArg ? themeArg.split(',') : Object.keys(THEMES);

// Mô phỏng màn hình 1920x1080: top bar 32px, dock trái 66px
const SW = 1920, SH = 1080, TOP = 32, DOCK = 66, GAP = 12, CROP = 620;
const WX = DOCK + GAP, WY = TOP + GAP, WW = SW / 4 - GAP * 2, WH = SH - TOP - GAP * 2;

function render(state) {
    const wall = Cairo.ImageSurface.createFromPNG(wallpaper);
    const shots = [];
    for (const theme of themes) {
        const hud = new Cairo.ImageSurface(Cairo.Format.ARGB32, WW, WH);
        const hcr = new Cairo.Context(hud);
        drawHud(hcr, WW, WH, state, theme);
        hcr.$dispose();

        const surf = new Cairo.ImageSurface(Cairo.Format.ARGB32, CROP, SH);
        const cr = new Cairo.Context(surf);
        cr.save();
        cr.scale(SW / wall.getWidth(), SH / wall.getHeight());
        cr.setSourceSurface(wall, 0, 0);
        cr.paint();
        cr.restore();
        cr.setSourceRGBA(0, 0, 0, 1);
        cr.rectangle(0, 0, CROP, TOP);
        cr.fill();
        cr.setSourceRGBA(0.12, 0.12, 0.12, 0.85);
        cr.rectangle(0, TOP, DOCK, SH - TOP);
        cr.fill();
        cr.setSourceSurface(hud, WX, WY);
        cr.paint();
        cr.$dispose();
        const path = `${outDir}/hud-${theme}.png`;
        surf.writeToPNG(path);
        shots.push(surf);
        print(`wrote ${path}`);
    }
    const all = new Cairo.ImageSurface(Cairo.Format.ARGB32, CROP * shots.length, SH);
    const cr = new Cairo.Context(all);
    shots.forEach((s, i) => {
        cr.setSourceSurface(s, i * CROP, 0);
        cr.paint();
    });
    cr.$dispose();
    all.writeToPNG(`${outDir}/hud-all.png`);
    print(`wrote ${outDir}/hud-all.png`);
}

const loop = new GLib.MainLoop(null, false);
const sensors = new Sensors();
sensors.start();
let n = 0;
GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
    sensors.update();
    if (++n < seconds)
        return GLib.SOURCE_CONTINUE;
    try {
        render(sensors.state);
    } catch (e) {
        logError(e);
    }
    sensors.stop();
    loop.quit();
    return GLib.SOURCE_REMOVE;
});
loop.run();
