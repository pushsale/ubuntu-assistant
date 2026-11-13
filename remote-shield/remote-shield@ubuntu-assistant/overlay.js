// Vẽ ảnh màn che của Remote Shield, giống hệt màn khóa của GNOME 50 / Ubuntu (theme Yaru):
//   - nền: hình nền desktop (kiểu zoom, cắt giữa) làm mờ Gauss (BlurEffect radius 90 -> sigma 45 px)
//     và giảm sáng còn 0.65 (BLUR_BRIGHTNESS trong ui/unlockDialog.js)
//   - cột chữ căn giữa, mép trên ở 1/3 chiều cao (UnlockDialogLayout): giờ 6.546em, ngày 1.818em,
//     dòng gợi ý 1em (cách 2em), chữ #f2f2f2, font giao diện (Ubuntu Sans), độ đậm thường (Yaru).
// Không phụ thuộc gnome-shell (chỉ GLib/GdkPixbuf/Cairo/Pango): thử được bằng gjs ngoài shell.
// Ảnh ra đúng kích thước khung của từng màn hình; shim dán nguyên ảnh lên màn hình thật.

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import GdkPixbuf from 'gi://GdkPixbuf';
import Pango from 'gi://Pango';
import PangoCairo from 'gi://PangoCairo';
import Cairo from 'cairo';

const BLUR_SIGMA = 45;        // px ở độ phân giải thật (radius 90 / 2)
const BLUR_BRIGHTNESS = 0.65;
const DOWNSCALE = 8;          // làm mờ trên ảnh thu nhỏ 1/8 rồi phóng lại (mờ mạnh nên không mất chi tiết)
const TEXT_COLOR = [0xf2 / 255, 0xf2 / 255, 0xf2 / 255];
const EM_PX = 11 * 96 / 72;   // 11pt (cỡ font giao diện mặc định) ở 96 dpi

function gaussianKernel(sigma) {
    const r = Math.max(1, Math.ceil(sigma * 3));
    const k = new Float32Array(r * 2 + 1);
    let sum = 0;
    for (let i = -r; i <= r; i++) {
        k[i + r] = Math.exp(-(i * i) / (2 * sigma * sigma));
        sum += k[i + r];
    }
    for (let i = 0; i < k.length; i++)
        k[i] /= sum;
    return {k, r};
}

// Làm mờ Gauss tách hai chiều (biên kẹp) + nhân độ sáng. Vào: RGB/RGBA, ra: RGB liền (stride = w*3).
function blurRgb(src, w, h, stride, nch, sigma, brightness) {
    const {k, r} = gaussianKernel(sigma);
    const tmp = new Float32Array(w * h * 3);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            let a = 0, b = 0, c = 0;
            for (let i = -r; i <= r; i++) {
                const xx = Math.min(w - 1, Math.max(0, x + i));
                const o = y * stride + xx * nch, wt = k[i + r];
                a += src[o] * wt;
                b += src[o + 1] * wt;
                c += src[o + 2] * wt;
            }
            const t = (y * w + x) * 3;
            tmp[t] = a;
            tmp[t + 1] = b;
            tmp[t + 2] = c;
        }
    }
    const out = new Uint8Array(w * h * 3);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            let a = 0, b = 0, c = 0;
            for (let i = -r; i <= r; i++) {
                const yy = Math.min(h - 1, Math.max(0, y + i));
                const t = (yy * w + x) * 3, wt = k[i + r];
                a += tmp[t] * wt;
                b += tmp[t + 1] * wt;
                c += tmp[t + 2] * wt;
            }
            const o = (y * w + x) * 3;
            out[o] = Math.min(255, Math.round(a * brightness));
            out[o + 1] = Math.min(255, Math.round(b * brightness));
            out[o + 2] = Math.min(255, Math.round(c * brightness));
        }
    }
    return out;
}

function parseColor(str) {
    // GSettings dạng '#rrggbb' hoặc '#rrrrggggbbbb'
    const hex = (str ?? '').replace(/^#/, '');
    const n = hex.length / 3;
    if (![2, 4].includes(n))
        return [0, 0, 0];
    return [0, 1, 2].map(i => parseInt(hex.slice(i * n, i * n + 2), 16));
}

// Nền màn khóa cho một kích thước màn hình, ghi ra file PNG (cache theo hình nền + kích thước).
function renderBackground(spec, outPath) {
    const W = spec.width, H = spec.height;
    const sw = Math.ceil(W / DOWNSCALE), sh = Math.ceil(H / DOWNSCALE);
    let small = null;
    if (spec.wallpaper) {
        try {
            const pb = GdkPixbuf.Pixbuf.new_from_file(spec.wallpaper);
            const iw = pb.get_width(), ih = pb.get_height();
            const s = Math.max(sw / iw, sh / ih);              // kiểu 'zoom': phủ kín rồi cắt giữa
            const zw = Math.max(sw, Math.ceil(iw * s)), zh = Math.max(sh, Math.ceil(ih * s));
            const z = pb.scale_simple(zw, zh, GdkPixbuf.InterpType.HYPER);
            small = z.new_subpixbuf(Math.floor((zw - sw) / 2), Math.floor((zh - sh) / 2), sw, sh).copy();
        } catch (e) {
            small = null; // hình nền hỏng / định dạng không đọc được: dùng màu nền
        }
    }
    let rgb;
    if (small) {
        rgb = blurRgb(small.get_pixels(), sw, sh, small.get_rowstride(), small.get_n_channels(),
            BLUR_SIGMA / DOWNSCALE, BLUR_BRIGHTNESS);
    } else {
        const [r, g, b] = parseColor(spec.primaryColor);
        rgb = new Uint8Array(sw * sh * 3);
        for (let i = 0; i < sw * sh; i++) {
            rgb[i * 3] = r * BLUR_BRIGHTNESS;
            rgb[i * 3 + 1] = g * BLUR_BRIGHTNESS;
            rgb[i * 3 + 2] = b * BLUR_BRIGHTNESS;
        }
    }
    const blurred = GdkPixbuf.Pixbuf.new_from_bytes(new GLib.Bytes(rgb),
        GdkPixbuf.Colorspace.RGB, false, 8, sw, sh, sw * 3);
    const full = blurred.scale_simple(W, H, GdkPixbuf.InterpType.BILINEAR);
    full.savev(outPath, 'png', [], []);
}

function makeLabel(cr, text, family, px, features) {
    const layout = PangoCairo.create_layout(cr);
    const fd = Pango.FontDescription.from_string(family);
    fd.set_weight(Pango.Weight.NORMAL);
    fd.set_absolute_size(px * Pango.SCALE);
    layout.set_font_description(fd);
    if (features) {
        const attrs = new Pango.AttrList();
        attrs.insert(Pango.attr_font_features_new(features));
        layout.set_attributes(attrs);
    }
    layout.set_text(text, -1);
    const [, logical] = layout.get_pixel_extents();
    return {layout, w: logical.width, h: logical.height, x: logical.x, y: logical.y};
}

export class ShieldPainter {
    // cacheDir: nơi giữ ảnh nền đã làm mờ (bg-<W>x<H>.png)
    constructor(cacheDir) {
        this._cacheDir = cacheDir;
        this._bgKey = new Map(); // "WxH" -> khoá hình nền đã vẽ
    }

    _background(spec) {
        const size = `${spec.width}x${spec.height}`;
        const path = GLib.build_filenamev([this._cacheDir, `bg-${size}.png`]);
        let mtime = 0;
        try {
            if (spec.wallpaper) {
                mtime = Gio.File.new_for_path(spec.wallpaper)
                    .query_info('time::modified', Gio.FileQueryInfoFlags.NONE, null)
                    .get_modification_date_time().to_unix();
            }
        } catch (e) {
            mtime = 0;
        }
        const key = `${spec.wallpaper}|${mtime}|${spec.primaryColor}`;
        if (this._bgKey.get(size) !== key || !GLib.file_test(path, GLib.FileTest.EXISTS)) {
            GLib.mkdir_with_parents(this._cacheDir, 0o700);
            renderBackground(spec, path);
            this._bgKey.set(size, key);
        }
        return path;
    }

    // spec: {width, height, scale, wallpaper, primaryColor, fontFamily, textScale, time, date, hint}
    render(spec, outPath) {
        const W = spec.width, H = spec.height;
        const surface = new Cairo.ImageSurface(Cairo.Format.ARGB32, W, H); // có kênh alpha -> chữ khử răng cưa thang xám (như shell), không viền màu
        const cr = new Cairo.Context(surface);

        const bg = Cairo.ImageSurface.createFromPNG(this._background(spec));
        cr.setSourceSurface(bg, 0, 0);
        cr.paint();

        const em = EM_PX * (spec.textScale ?? 1) * (spec.scale ?? 1);
        const family = spec.fontFamily || 'Ubuntu Sans';
        const items = [
            makeLabel(cr, spec.time, family, 6.546 * em, 'tnum'),
            makeLabel(cr, spec.date, family, 1.818 * em),
        ];
        if (spec.hint)
            items.push(makeLabel(cr, spec.hint, family, em));
        const spacing = 2 * em;
        const hintTop = 2 * em + 6 * (spec.scale ?? 1); // margin-top 2em + padding 6px của dòng gợi ý
        let stackH = items[0].h + spacing + items[1].h;
        if (items[2])
            stackH += spacing + hintTop + items[2].h + 6 * (spec.scale ?? 1);
        let y = Math.round(Math.min(H / 3, H - stackH));

        cr.setSourceRGB(...TEXT_COLOR);
        items.forEach((it, i) => {
            if (i === 2)
                y += hintTop;
            cr.moveTo(Math.round((W - it.w) / 2) - it.x, y - it.y);
            PangoCairo.show_layout(cr, it.layout);
            y += it.h + spacing;
        });

        cr.$dispose();
        // ghi file tạm rồi đổi tên: shim không bao giờ đọc phải ảnh ghi dở
        const tmp = `${outPath}.tmp`;
        surface.writeToPNG(tmp);
        surface.finish();
        Gio.File.new_for_path(tmp).move(Gio.File.new_for_path(outPath), Gio.FileCopyFlags.OVERWRITE, null, null);
    }
}
