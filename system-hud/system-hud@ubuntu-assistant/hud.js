// Vẽ HUD bằng Cairo + Pango. Hàm thuần: drawHud(cr, w, h, state, themeName).
// Bố cục dùng chung, mỗi theme tự vẽ các thành phần (khung, gauge, bar, đồ thị...).

import Cairo from 'cairo';
import Pango from 'gi://Pango';
import PangoCairo from 'gi://PangoCairo';
const HISTORY = 60; // phải khớp HISTORY trong sensors.js

const TAU = Math.PI * 2;

// Độ trượt của đồ thị lịch sử (0..1 bước), do Animator đặt qua state.shift
let SHIFT = 0;

// ---------------------------------------------------------------- tiện ích

const fdCache = new Map();
function fontDesc(spec) {
    let d = fdCache.get(spec);
    if (!d) {
        d = Pango.FontDescription.from_string(spec);
        fdCache.set(spec, d);
    }
    return d;
}

function rgba(cr, c, a = 1) {
    cr.setSourceRGBA(c[0], c[1], c[2], a);
}

function makeLayout(cr, str, o) {
    const layout = PangoCairo.create_layout(cr);
    layout.set_font_description(fontDesc(o.font));
    if (o.spacing) {
        const attrs = new Pango.AttrList();
        attrs.insert(Pango.attr_letter_spacing_new(Math.round(o.spacing * Pango.SCALE)));
        layout.set_attributes(attrs);
    }
    layout.set_text(String(str), -1);
    return layout;
}

function measure(cr, str, o) {
    const [w, h] = makeLayout(cr, str, o).get_pixel_size();
    return {w, h};
}

// o: font, color, alpha, align (left|center|right), valign (top|middle|bottom|baseline), spacing, glow
function text(cr, str, x, y, o) {
    const layout = makeLayout(cr, str, o);
    const [w, h] = layout.get_pixel_size();
    let dx = x, dy = y;
    if (o.align === 'right')
        dx = x - w;
    else if (o.align === 'center')
        dx = x - w / 2;
    if (o.valign === 'middle')
        dy = y - h / 2;
    else if (o.valign === 'bottom')
        dy = y - h;
    else if (o.valign === 'baseline')
        dy = y - layout.get_baseline() / Pango.SCALE;
    const color = o.color ?? [1, 1, 1];
    if (o.glow) {
        cr.save();
        cr.moveTo(dx, dy);
        PangoCairo.layout_path(cr, layout);
        cr.setLineJoin(Cairo.LineJoin.ROUND);
        cr.setLineWidth(o.glowWidth ?? 4);
        rgba(cr, color, o.glow);
        cr.stroke();
        cr.restore();
    }
    rgba(cr, color, o.alpha ?? 1);
    cr.moveTo(dx, dy);
    PangoCairo.show_layout(cr, layout);
    return {w, h, x: dx, y: dy};
}

function fmtBytes(b, digits = 1) {
    const u = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0;
    let v = b;
    while (v >= 1024 && i < u.length - 1) {
        v /= 1024;
        i++;
    }
    return `${i === 0 ? Math.round(v) : v.toFixed(v >= 100 ? 0 : digits)} ${u[i]}`;
}
const fmtRate = b => `${fmtBytes(b)}/s`;
const fmtGB = b => `${(b / 2 ** 30).toFixed(1)}`;
const fmtTemp = t => (t === null || t === undefined ? '--' : `${Math.round(t)}°C`);

function fmtUptime(sec) {
    const d = Math.floor(sec / 86400);
    const h = Math.floor(sec % 86400 / 3600);
    const m = Math.floor(sec % 3600 / 60);
    const p = n => String(n).padStart(2, '0');
    return d > 0 ? `${d}d ${p(h)}:${p(m)}` : `${p(h)}:${p(m)}`;
}

function clock() {
    const d = new Date();
    const p = n => String(n).padStart(2, '0');
    return {
        time: `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`,
        hm: `${p(d.getHours())}:${p(d.getMinutes())}`,
        sec: p(d.getSeconds()),
        date: d.toLocaleDateString('en-GB', {weekday: 'short', day: '2-digit', month: 'short', year: 'numeric'}).toUpperCase(),
        iso: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`,
    };
}

function maxOf(...arrays) {
    let m = 0;
    for (const a of arrays)
        for (const v of a)
            m = Math.max(m, v);
    return m;
}

// Thang tự động cho đồ thị tốc độ: làm tròn lên lũy thừa 2, tối thiểu 64 KB/s.
function autoScale(...arrays) {
    let m = Math.max(maxOf(...arrays) * 1.1, 64 * 1024);
    return 2 ** Math.ceil(Math.log2(m));
}

// PRNG cố định để hoa văn trang trí không nhảy mỗi lần vẽ
function lcg(seed) {
    let s = seed >>> 0;
    return () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 4294967296;
    };
}

function roundRect(cr, x, y, w, h, r) {
    cr.newSubPath();
    cr.arc(x + w - r, y + r, r, -Math.PI / 2, 0);
    cr.arc(x + w - r, y + h - r, r, 0, Math.PI / 2);
    cr.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI);
    cr.arc(x + r, y + r, r, Math.PI, 1.5 * Math.PI);
    cr.closePath();
}

function chamferRect(cr, x, y, w, h, c) {
    cr.newSubPath();
    cr.moveTo(x + c, y);
    cr.lineTo(x + w, y);
    cr.lineTo(x + w, y + h - c);
    cr.lineTo(x + w - c, y + h);
    cr.lineTo(x, y + h);
    cr.lineTo(x, y + c);
    cr.closePath();
}

// Thang màu theo mức: <=50 xanh lá, chuyển dần vàng -> cam -> đỏ ở >=90
const HEAT_STOPS = [
    [0, [0.25, 0.88, 0.45]],
    [50, [0.25, 0.88, 0.45]],
    [65, [0.75, 0.9, 0.25]],
    [75, [1.0, 0.82, 0.2]],
    [83, [1.0, 0.55, 0.15]],
    [90, [1.0, 0.24, 0.28]],
    [100, [1.0, 0.24, 0.28]],
];

export function heat(p) {
    if (p === null || p === undefined || Number.isNaN(p))
        return [0.6, 0.65, 0.7];
    const v = Math.max(0, Math.min(100, p));
    for (let i = 1; i < HEAT_STOPS.length; i++) {
        const [p1, c1] = HEAT_STOPS[i];
        if (v <= p1) {
            const [p0, c0] = HEAT_STOPS[i - 1];
            const f = p1 === p0 ? 0 : (v - p0) / (p1 - p0);
            return c0.map((x, j) => x + (c1[j] - x) * f);
        }
    }
    return HEAT_STOPS[HEAT_STOPS.length - 1][1];
}

const HEAT_STOPS_LIGHT = [
    [0, [0.1, 0.66, 0.3]],
    [50, [0.1, 0.66, 0.3]],
    [65, [0.5, 0.68, 0.05]],
    [75, [0.88, 0.66, 0.0]],
    [83, [0.95, 0.45, 0.05]],
    [90, [0.86, 0.14, 0.2]],
    [100, [0.86, 0.14, 0.2]],
];

function heatFrom(stops, p) {
    if (p === null || p === undefined || Number.isNaN(p))
        return [0.5, 0.55, 0.6];
    const v = Math.max(0, Math.min(100, p));
    for (let i = 1; i < stops.length; i++) {
        const [p1, c1] = stops[i];
        if (v <= p1) {
            const [p0, c0] = stops[i - 1];
            const f = p1 === p0 ? 0 : (v - p0) / (p1 - p0);
            return c0.map((x, j) => x + (c1[j] - x) * f);
        }
    }
    return stops[stops.length - 1][1];
}

export const heatLight = p => heatFrom(HEAT_STOPS_LIGHT, p);

// Toạ độ x bắt đầu của khối rộng `width` khi căn trái / giữa / phải tại x
function alignX(x, width, align) {
    if (align === 'right')
        return x - width;
    if (align === 'center')
        return x - width / 2;
    return x;
}

// Hàng "đã dùng | % | tổng": tránh đọc nhầm số dùng với số tối đa
function usageRow(cr, T, x, y, w, used, total, pct, usedLabel = 'USED', totalLabel = 'TOTAL') {
    T.label(cr, x, y, usedLabel);
    T.value(cr, x, y + 13, used, {size: 20});
    T.label(cr, x + w, y, totalLabel, {align: 'right'});
    T.value(cr, x + w, y + 13, total, {size: 20, align: 'right', color: T.c.dim});
    T.big(cr, x + w / 2, y - 2, `${Math.round(pct)}`, '%', T.level(pct), 'center');
}

function padArray(data) {
    const out = new Array(Math.max(0, HISTORY - data.length)).fill(0);
    return out.concat(data);
}

// ================================================================= THEMES

// ---------- 1. TACTICAL: khung chiến thuật kiểu cơ giáp, cam/đen, lục giác, sọc cảnh báo
const tactical = (() => {
    const c = {
        main: [1.0, 0.42, 0.0], accent: [0.95, 0.93, 0.88], warn: [1.0, 0.8, 0.1],
        crit: [1.0, 0.16, 0.2], dim: [0.55, 0.22, 0.02], text: [1.0, 0.9, 0.8], bg: [0.03, 0.02, 0.015],
    };
    const F = {
        num: 'Noto Sans Mono Extra-Condensed Bold',
        label: 'Noto Sans Condensed Semi-Bold',
        small: 'Noto Sans Mono Condensed',
    };
    const level = p => (p >= 85 ? c.crit : p >= 65 ? c.warn : c.main);
    const tempColor = t => (t === null ? c.dim : t >= 85 ? c.crit : t >= 72 ? c.warn : c.main);

    function hazard(cr, x, y, w, h, color, alpha = 1) {
        cr.save();
        cr.rectangle(x, y, w, h);
        cr.clip();
        rgba(cr, color, alpha);
        for (let i = -h; i < w + h; i += h * 1.4) {
            cr.moveTo(x + i, y + h);
            cr.lineTo(x + i + h, y);
            cr.lineTo(x + i + h * 1.7, y);
            cr.lineTo(x + i + h * 0.7, y + h);
            cr.closePath();
        }
        cr.fill();
        cr.restore();
    }

    function hexPt(cx, cy, R, t) {
        const e = Math.floor(t * 6) % 6;
        const f = t * 6 - Math.floor(t * 6);
        const a0 = -Math.PI / 2 + e * Math.PI / 3;
        const a1 = a0 + Math.PI / 3;
        const x0 = cx + R * Math.cos(a0), y0 = cy + R * Math.sin(a0);
        const x1 = cx + R * Math.cos(a1), y1 = cy + R * Math.sin(a1);
        return [x0 + (x1 - x0) * f, y0 + (y1 - y0) * f];
    }

    function hexPath(cr, cx, cy, R) {
        cr.newSubPath();
        for (let i = 0; i < 6; i++) {
            const a = -Math.PI / 2 + i * Math.PI / 3;
            if (i === 0)
                cr.moveTo(cx + R * Math.cos(a), cy + R * Math.sin(a));
            else
                cr.lineTo(cx + R * Math.cos(a), cy + R * Math.sin(a));
        }
        cr.closePath();
    }

    return {
        c, level, tempColor,
        panel(cr, W, H) {
            chamferRect(cr, 1, 1, W - 2, H - 2, 26);
            const g = new Cairo.LinearGradient(0, 0, 0, H);
            g.addColorStopRGBA(0, ...c.bg, 0.86);
            g.addColorStopRGBA(1, ...c.bg, 0.78);
            cr.setSource(g);
            cr.fillPreserve();
            // lưới lục giác mờ
            cr.save();
            cr.clip();
            cr.setLineWidth(1);
            rgba(cr, c.main, 0.045);
            const R = 16, dx = R * Math.sqrt(3), dy = R * 1.5;
            for (let row = 0, y = 0; y < H + R; row++, y += dy)
                for (let x = row % 2 ? dx / 2 : 0; x < W + dx; x += dx)
                    hexPath(cr, x, y, R);
            cr.stroke();
            cr.restore();
            chamferRect(cr, 1, 1, W - 2, H - 2, 26);
            cr.setLineWidth(1.5);
            rgba(cr, c.main, 0.85);
            cr.stroke();
            // sọc cảnh báo ở 2 góc
            hazard(cr, W - 150, 6, 140, 8, c.main, 0.9);
            hazard(cr, 10, H - 14, 140, 8, c.main, 0.9);
            // thước đo cạnh phải
            cr.setLineWidth(1);
            for (let y = 40, i = 0; y < H - 40; y += 10, i++) {
                rgba(cr, c.main, i % 5 === 0 ? 0.8 : 0.35);
                cr.moveTo(W - 6, y);
                cr.lineTo(W - (i % 5 === 0 ? 14 : 9), y);
                cr.stroke();
            }
        },
        header(cr, x, y, w, h, s) {
            const k = clock();
            text(cr, 'UNIT', x, y + 2, {font: `${F.small} 10px`, color: c.main, alpha: 0.7, spacing: 3});
            text(cr, s.sys.hostname.toUpperCase(), x, y + 12, {font: `${F.num} 36px`, color: c.main, glow: 0.18});
            text(cr, k.hm, x + w - 22, y - 4, {font: `${F.num} 34px`, color: c.accent, align: 'right'});
            text(cr, k.sec, x + w, y + 2, {font: `${F.num} 18px`, color: c.main, align: 'right'});
            text(cr, k.date, x + w, y + 42, {font: `${F.small} 11px`, color: c.text, alpha: 0.7, align: 'right'});
            const blink = Math.floor(s.tick) % 2 === 0;
            const chipX = x + 42;
            cr.rectangle(chipX, y, 54, 14);
            rgba(cr, c.main, blink ? 1 : 0.35);
            cr.fill();
            text(cr, 'ACTIVE', chipX + 27, y + 7, {font: `${F.label} 10px`, color: c.bg, align: 'center', valign: 'middle', spacing: 1});
            cr.setLineWidth(1);
            rgba(cr, c.main, 0.5);
            cr.moveTo(x, y + h - 14);
            cr.lineTo(x + w, y + h - 14);
            cr.stroke();
            text(cr, `${s.sys.os.toUpperCase()}  //  KRN ${s.sys.kernel}  //  UPTIME ${fmtUptime(s.sys.uptime)}`,
                x, y + h - 11, {font: `${F.small} 10.5px`, color: c.text, alpha: 0.65});
        },
        section(cr, x, y, w, idx, title, sub) {
            cr.moveTo(x, y);
            cr.lineTo(x + 34, y);
            cr.lineTo(x + 28, y + 17);
            cr.lineTo(x - 6 + 6, y + 17);
            cr.closePath();
            rgba(cr, c.main);
            cr.fill();
            text(cr, idx, x + 14, y + 8.5, {font: `${F.num} 14px`, color: c.bg, align: 'center', valign: 'middle'});
            text(cr, title, x + 40, y + 8.5, {font: `${F.label} 15px`, color: c.accent, valign: 'middle', spacing: 2});
            text(cr, sub, x + w - 30, y + 8.5, {font: `${F.small} 11px`, color: c.main, alpha: 0.8, align: 'right', valign: 'middle'});
            text(cr, '>>>', x + w, y + 8.5, {font: `${F.num} 13px`, color: c.main, align: 'right', valign: 'middle', alpha: (y + 0) % 2 ? 1 : 0.9});
            cr.setLineWidth(1);
            rgba(cr, c.main, 0.45);
            cr.moveTo(x, y + 22.5);
            cr.lineTo(x + w, y + 22.5);
            cr.stroke();
            cr.setLineWidth(3);
            rgba(cr, c.main);
            cr.moveTo(x, y + 22.5);
            cr.lineTo(x + 60, y + 22.5);
            cr.stroke();
        },
        gauge(cr, cx, cy, r, pct, o) {
            cr.newPath();
            const N = o.small ? 30 : 42;
            const outer = r, inner = r - (o.small ? 9 : 13);
            for (let i = 0; i < N; i++) {
                const t0 = i / N, t1 = (i + 0.72) / N;
                const on = (i + 0.5) / N * 100 <= pct;
                const p = [hexPt(cx, cy, outer, t0), hexPt(cx, cy, outer, t1), hexPt(cx, cy, inner, t1), hexPt(cx, cy, inner, t0)];
                cr.moveTo(...p[0]);
                for (let j = 1; j < 4; j++)
                    cr.lineTo(...p[j]);
                cr.closePath();
                rgba(cr, on ? level(pct) : c.dim, on ? 1 : 0.45);
                cr.fill();
            }
            // vòng nhiệt độ
            const tr = r + (o.small ? 8 : 11);
            cr.setLineWidth(1);
            rgba(cr, c.main, 0.35);
            hexPath(cr, cx, cy, tr);
            cr.stroke();
            if (o.temp !== null && o.temp !== undefined) {
                const frac = Math.min(1, o.temp / 100);
                cr.setLineWidth(3.5);
                rgba(cr, tempColor(o.temp));
                cr.moveTo(...hexPt(cx, cy, tr, 0));
                for (let t = 0.01; t <= frac; t += 0.01)
                    cr.lineTo(...hexPt(cx, cy, tr, t));
                cr.stroke();
            }
            // tam giác ở đỉnh
            for (let i = 0; i < 6; i++) {
                const a = -Math.PI / 2 + i * Math.PI / 3;
                const px = cx + (tr + 6) * Math.cos(a), py = cy + (tr + 6) * Math.sin(a);
                cr.arc(px, py, 1.8, 0, TAU);
                rgba(cr, c.main, 0.9);
                cr.fill();
            }
            hexPath(cr, cx, cy, inner - 8);
            rgba(cr, c.main, 0.07);
            cr.fillPreserve();
            cr.setLineWidth(1);
            rgba(cr, c.main, 0.4);
            cr.stroke();
            const big = o.small ? 30 : 46;
            const t = text(cr, `${Math.round(pct)}`, cx - 4, cy + 2, {font: `${F.num} ${big}px`, color: level(pct), align: 'center', valign: 'middle', glow: 0.2});
            text(cr, '%', t.x + t.w + 1, cy + big * 0.12, {font: `${F.num} ${big * 0.4}px`, color: c.main});
            text(cr, o.label, cx, cy + big * 0.55, {font: `${F.small} 10px`, color: c.text, alpha: 0.7, align: 'center', spacing: 2});
            text(cr, `T ${fmtTemp(o.temp)}`, cx, cy - big * 0.62, {font: `${F.small} 10px`, color: tempColor(o.temp), align: 'center', valign: 'bottom'});
        },
        bar(cr, x, y, w, h, pct, o = {}) {
            if (h <= 6) {
                cr.rectangle(x, y, w, h);
                rgba(cr, c.dim, 0.5);
                cr.fill();
                cr.rectangle(x, y, w * pct / 100, h);
                rgba(cr, o.color ?? level(pct));
                cr.fill();
                return;
            }
            const sw = 9, skew = h * 0.45;
            const n = Math.floor((w - skew) / sw);
            for (let i = 0; i < n; i++) {
                const x0 = x + i * sw;
                const on = (i + 0.5) / n * 100 <= pct;
                cr.moveTo(x0 + skew, y);
                cr.lineTo(x0 + skew + sw - 3, y);
                cr.lineTo(x0 + sw - 3, y + h);
                cr.lineTo(x0, y + h);
                cr.closePath();
                rgba(cr, on ? (o.color ?? level(pct)) : c.dim, on ? 1 : 0.4);
                cr.fill();
            }
        },
        graph(cr, x, y, w, h, series, max, o = {}) {
            cr.setLineWidth(1);
            cr.setDash([2, 3], 0);
            rgba(cr, c.main, 0.2);
            for (let i = 1; i < 4; i++) {
                cr.moveTo(x, y + h * i / 4);
                cr.lineTo(x + w, y + h * i / 4);
            }
            cr.stroke();
            cr.setDash([], 0);
            // khung góc
            rgba(cr, c.main, 0.7);
            for (const [px, py, sx, sy] of [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]]) {
                cr.moveTo(px + 8 * sx, py);
                cr.lineTo(px, py);
                cr.lineTo(px, py + 8 * sy);
            }
            cr.stroke();
            const mid = o.mirror ? y + h / 2 : y + h;
            const half = o.mirror ? h / 2 - 2 : h - 2;
            cr.save();
            cr.rectangle(x, y - 6, w, h + 12);
            cr.clip();
            series.forEach((sr, si) => {
                const data = padArray(sr.data);
                const cw = w / HISTORY;
                data.forEach((v, i) => {
                    const vh = Math.min(1, v / max) * half;
                    if (vh < 0.5)
                        return;
                    const a = 0.3 + 0.7 * i / HISTORY;
                    const down = o.mirror && si === 1;
                    cr.rectangle(x + (i + SHIFT) * cw + 0.5, down ? mid + 1 : mid - vh, cw - 1.5, vh);
                    rgba(cr, sr.color, a);
                    cr.fill();
                });
            });
            cr.restore();
            if (o.mirror) {
                rgba(cr, c.main, 0.6);
                cr.moveTo(x, mid);
                cr.lineTo(x + w, mid);
                cr.stroke();
            }
        },
        cores(cr, x, y, w, h, vals) {
            const n = vals.length || 1;
            const cw = w / n;
            const cells = 7;
            const chh = h / cells;
            vals.forEach((v, i) => {
                const lit = Math.ceil(v / 100 * cells);
                for (let j = 0; j < cells; j++) {
                    cr.rectangle(x + i * cw + 1, y + h - (j + 1) * chh + 1, cw - 3, chh - 2);
                    rgba(cr, j < lit ? level(v) : c.dim, j < lit ? 1 : 0.35);
                    cr.fill();
                }
            });
        },
        stat(cr, x, y, w, label, value, color) {
            const l = text(cr, label, x, y, {font: `${F.small} 11px`, color: c.text, alpha: 0.6, spacing: 1});
            const v = text(cr, value, x + w, y - 2, {font: `${F.num} 16px`, color: color ?? c.accent, align: 'right'});
            cr.setLineWidth(1);
            cr.setDash([1, 3], 0);
            rgba(cr, c.main, 0.4);
            cr.moveTo(x + l.w + 6, y + 10);
            cr.lineTo(v.x - 6, y + 10);
            cr.stroke();
            cr.setDash([], 0);
        },
        big(cr, x, y, value, unit, color, align = 'right') {
            const u = measure(cr, unit, {font: `${F.num} 16px`});
            const v = measure(cr, value, {font: `${F.num} 40px`});
            const vx = alignX(x, v.w + 2 + u.w, align);
            text(cr, value, vx, y, {font: `${F.num} 40px`, color, glow: 0.18});
            text(cr, unit, vx + v.w + 2, y + 18, {font: `${F.num} 16px`, color: c.main});
        },
        label(cr, x, y, str, o = {}) {
            return text(cr, str, x, y, {font: `${F.small} ${o.size ?? 11}px`, color: o.color ?? c.text, alpha: o.alpha ?? 0.6, spacing: 1, align: o.align});
        },
        value(cr, x, y, str, o = {}) {
            return text(cr, str, x, y, {font: `${F.num} ${o.size ?? 22}px`, color: o.color ?? c.accent, align: o.align});
        },
        footer(cr, x, y, w, h, s) {
            hazard(cr, x, y + 7, 60, 10, c.main, 0.9);
            text(cr, 'TACTICAL SYSTEMS MONITOR  //  MK-II', x + 70, y + 12, {font: `${F.small} 10px`, color: c.main, valign: 'middle', spacing: 1});
            text(cr, `T+${String(Math.floor(s.tick)).padStart(6, '0')}`, x + w - 16, y + 12, {font: `${F.num} 13px`, color: c.accent, align: 'right', valign: 'middle'});
            cr.rectangle(x + w - 9, y + 8, 8, 8);
            rgba(cr, c.main, Math.floor(s.tick) % 2 ? 1 : 0.25);
            cr.fill();
        },
        overlay() {},
    };
})();

// ---------- 2. TERMINAL: màn hình CRT phốt-pho hổ phách, chữ đơn cách, scanline
const terminal = (() => {
    const c = {
        main: [1.0, 0.69, 0.0], accent: [1.0, 0.86, 0.5], warn: [1.0, 0.86, 0.5],
        crit: [1.0, 0.32, 0.15], dim: [0.5, 0.33, 0.0], text: [1.0, 0.72, 0.1], bg: [0.05, 0.03, 0.0],
    };
    const F = {mono: 'DejaVu Sans Mono', bold: 'DejaVu Sans Mono Bold'};
    const level = p => (p >= 85 ? c.crit : p >= 65 ? c.accent : c.main);
    const tempColor = t => (t === null ? c.dim : t >= 85 ? c.crit : t >= 72 ? c.accent : c.main);
    const T = (cr, str, x, y, o = {}) => text(cr, str, x, y, {
        font: `${o.bold ? F.bold : F.mono} ${o.size ?? 11}px`, color: o.color ?? c.main, alpha: o.alpha ?? 1,
        align: o.align, valign: o.valign, glow: o.glow ?? 0.22, glowWidth: 3,
    });
    const dashLine = (cr, x, y, w) => {
        cr.setLineWidth(1);
        cr.setDash([5, 3], 0);
        rgba(cr, c.main, 0.5);
        cr.moveTo(x, y + 0.5);
        cr.lineTo(x + w, y + 0.5);
        cr.stroke();
        cr.setDash([], 0);
    };

    return {
        c, level, tempColor,
        panel(cr, W, H) {
            roundRect(cr, 1, 1, W - 2, H - 2, 16);
            rgba(cr, c.bg, 0.88);
            cr.fillPreserve();
            const g = new Cairo.RadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.65);
            g.addColorStopRGBA(0, ...c.main, 0.05);
            g.addColorStopRGBA(1, 0, 0, 0, 0.35);
            cr.setSource(g);
            cr.fill();
            cr.setLineWidth(1.5);
            rgba(cr, c.main, 0.7);
            roundRect(cr, 1, 1, W - 2, H - 2, 16);
            cr.stroke();
            cr.setLineWidth(1);
            rgba(cr, c.main, 0.35);
            roundRect(cr, 6, 6, W - 12, H - 12, 12);
            cr.stroke();
        },
        header(cr, x, y, w, h, s) {
            const k = clock();
            const cursor = Math.floor(s.tick) % 2 === 0 ? '█' : ' ';
            T(cr, `> SYSTEM STATUS REPORT${cursor}`, x, y, {size: 15, bold: true});
            T(cr, `${k.iso}  ${k.time}`, x + w, y + 2, {size: 12, align: 'right'});
            T(cr, `HOST..... ${s.sys.hostname.toUpperCase()}`, x, y + 24, {size: 11, alpha: 0.85});
            T(cr, `UPTIME ${fmtUptime(s.sys.uptime)}`, x + w, y + 24, {size: 11, align: 'right', alpha: 0.85});
            T(cr, `OS....... ${s.sys.os.toUpperCase()}`, x, y + 39, {size: 11, alpha: 0.85});
            T(cr, `KRN ${s.sys.kernel}`, x + w, y + 39, {size: 11, align: 'right', alpha: 0.85});
            dashLine(cr, x, y + 60, w);
        },
        section(cr, x, y, w, idx, title, sub) {
            const t = T(cr, `[${idx}] ${title}`, x, y, {size: 13, bold: true});
            const st = T(cr, sub.toUpperCase(), x + w, y + 1, {size: 11, align: 'right', alpha: 0.8});
            cr.setLineWidth(1);
            rgba(cr, c.main, 0.6);
            for (const dy of [7, 10]) {
                cr.moveTo(x + t.w + 8, y + dy + 0.5);
                cr.lineTo(st.x - 8, y + dy + 0.5);
            }
            cr.stroke();
        },
        gauge(cr, cx, cy, r, pct, o) {
            cr.newPath();
            cr.setLineWidth(1);
            // lưới scope
            rgba(cr, c.main, 0.25);
            cr.moveTo(cx - r - 6, cy);
            cr.lineTo(cx + r + 6, cy);
            cr.moveTo(cx, cy - r - 6);
            cr.lineTo(cx, cy + r + 6);
            cr.stroke();
            cr.setDash([1, 3], 0);
            for (const f of [1 / 3, 2 / 3]) {
                cr.arc(cx, cy, r * f, 0, TAU);
                cr.stroke();
            }
            cr.setDash([], 0);
            rgba(cr, c.main, 0.8);
            cr.arc(cx, cy, r, 0, TAU);
            cr.stroke();
            // nêm giá trị, tô gạch chéo
            const a0 = -Math.PI / 2, a1 = a0 + TAU * Math.min(1, pct / 100);
            cr.save();
            cr.moveTo(cx, cy);
            cr.arc(cx, cy, r - 3, a0, a1);
            cr.closePath();
            cr.clip();
            cr.setLineWidth(1.3);
            rgba(cr, level(pct), 0.55);
            for (let i = -r * 2; i < r * 2; i += 5) {
                cr.moveTo(cx + i, cy - r);
                cr.lineTo(cx + i + 2 * r, cy + r);
            }
            cr.stroke();
            cr.restore();
            cr.setLineWidth(1.5);
            rgba(cr, level(pct));
            cr.moveTo(cx, cy);
            cr.arc(cx, cy, r - 3, a0, a1);
            cr.closePath();
            cr.stroke();
            // tia quét radar có vệt mờ
            const sweep = (o.tick ?? 0) * 0.55;
            for (let i = 0; i < 10; i++) {
                const a = sweep - i * 0.06;
                rgba(cr, c.accent, 0.5 * (1 - i / 10));
                cr.moveTo(cx, cy);
                cr.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
                cr.stroke();
            }
            // vạch nhiệt độ vòng ngoài
            const n = 40;
            const lit = o.temp === null || o.temp === undefined ? 0 : Math.round(Math.min(1, o.temp / 100) * n);
            for (let i = 0; i < n; i++) {
                const a = -Math.PI / 2 + TAU * i / n;
                cr.setLineWidth(i < lit ? 3 : 1);
                rgba(cr, i < lit ? tempColor(o.temp) : c.main, i < lit ? 1 : 0.35);
                cr.moveTo(cx + (r + 6) * Math.cos(a), cy + (r + 6) * Math.sin(a));
                cr.lineTo(cx + (r + (i < lit ? 13 : 10)) * Math.cos(a), cy + (r + (i < lit ? 13 : 10)) * Math.sin(a));
                cr.stroke();
            }
            // số ở giữa trên nền đặc
            const size = o.small ? 22 : 30;
            const str = `${String(Math.round(pct)).padStart(3, ' ')}%`;
            const m = measure(cr, str, {font: `${F.bold} ${size}px`});
            cr.rectangle(cx - m.w / 2 - 6, cy - m.h / 2 - 2, m.w + 12, m.h + 4);
            rgba(cr, c.bg, 0.92);
            cr.fill();
            cr.setLineWidth(1);
            rgba(cr, c.main, 0.7);
            cr.rectangle(cx - m.w / 2 - 6, cy - m.h / 2 - 2, m.w + 12, m.h + 4);
            cr.stroke();
            T(cr, str, cx, cy, {size, bold: true, align: 'center', valign: 'middle', color: level(pct), glow: 0.3});
            T(cr, `${o.label}`, cx, cy + m.h / 2 + 6, {size: 9, align: 'center', alpha: 0.9});
            T(cr, `TMP ${fmtTemp(o.temp)}`, cx, cy - m.h / 2 - 6, {size: 9, align: 'center', valign: 'bottom', color: tempColor(o.temp)});
        },
        bar(cr, x, y, w, h, pct, o = {}) {
            const cw = 7;
            const n = Math.floor(w / cw);
            for (let i = 0; i < n; i++) {
                const on = (i + 0.5) / n * 100 <= pct;
                if (on) {
                    cr.rectangle(x + i * cw, y, cw - 2, h);
                    rgba(cr, o.color ?? level(pct), 0.95);
                } else {
                    cr.rectangle(x + i * cw, y + h - 2, cw - 2, 2);
                    rgba(cr, c.main, 0.4);
                }
                cr.fill();
            }
            if (h > 6) {
                cr.setLineWidth(3);
                rgba(cr, o.color ?? level(pct), 0.12);
                cr.rectangle(x - 1, y - 1, n * cw, h + 2);
                cr.stroke();
            }
        },
        graph(cr, x, y, w, h, series, max, o = {}) {
            rgba(cr, c.main, 0.3);
            for (let gx = 0; gx <= w; gx += 12)
                for (let gy = 0; gy <= h; gy += 8)
                    cr.rectangle(x + gx, y + gy, 1, 1);
            cr.fill();
            cr.setLineWidth(1);
            rgba(cr, c.main, 0.6);
            cr.rectangle(x, y, w, h);
            cr.stroke();
            const mid = o.mirror ? y + h / 2 : y + h;
            const half = o.mirror ? h / 2 - 2 : h - 2;
            cr.save();
            cr.rectangle(x, y - 6, w, h + 12);
            cr.clip();
            series.forEach((sr, si) => {
                const data = padArray(sr.data);
                const step = w / (HISTORY - 1);
                const sign = o.mirror && si === 1 ? 1 : -1;
                cr.newPath();
                data.forEach((v, i) => {
                    const py = mid + sign * Math.min(1, v / max) * half;
                    if (i === 0)
                        cr.moveTo(x + SHIFT * step, py);
                    else
                        cr.lineTo(x + (i + SHIFT) * step, py);
                });
                cr.setLineJoin(Cairo.LineJoin.BEVEL);
                cr.setLineWidth(4);
                rgba(cr, sr.color, 0.15);
                cr.strokePreserve();
                cr.setLineWidth(1.4);
                rgba(cr, sr.color, 0.95);
                if (si === 1)
                    cr.setDash([3, 2], 0);
                cr.stroke();
                cr.setDash([], 0);
            });
            cr.restore();
        },
        cores(cr, x, y, w, h, vals) {
            const n = vals.length || 1;
            const cw = w / n;
            const cells = 6;
            const chh = h / cells;
            vals.forEach((v, i) => {
                const lit = Math.ceil(v / 100 * cells);
                for (let j = 0; j < cells; j++) {
                    if (j < lit) {
                        cr.rectangle(x + i * cw + 1, y + h - (j + 1) * chh + 1, cw - 3, chh - 2);
                        rgba(cr, level(v));
                    } else {
                        cr.rectangle(x + i * cw + 1, y + h - (j + 1) * chh + chh / 2, cw - 3, 1);
                        rgba(cr, c.main, 0.35);
                    }
                    cr.fill();
                }
            });
        },
        stat(cr, x, y, w, label, value, color) {
            const l = T(cr, label, x, y, {size: 11, alpha: 0.85});
            const v = T(cr, value, x + w, y, {size: 11, bold: true, align: 'right', color: color ?? c.accent});
            rgba(cr, c.main, 0.55);
            for (let px = x + l.w + 4; px < v.x - 4; px += 4)
                cr.rectangle(px, y + 10, 1.2, 1.2);
            cr.fill();
        },
        big(cr, x, y, value, unit, color, align = 'right') {
            T(cr, `${value}${unit}`, x, y + 2, {size: 30, bold: true, color, align: align === 'center' ? 'center' : align, glow: 0.3});
        },
        label(cr, x, y, str, o = {}) {
            return T(cr, str, x, y, {size: o.size ?? 11, alpha: o.alpha ?? 0.85, color: o.color, align: o.align});
        },
        value(cr, x, y, str, o = {}) {
            return T(cr, str, x, y, {size: (o.size ?? 22) * 0.8, bold: true, color: o.color ?? c.accent, align: o.align});
        },
        footer(cr, x, y, w, h, s) {
            dashLine(cr, x, y + 2, w);
            T(cr, `READY.${Math.floor(s.tick) % 2 ? '█' : ' '}`, x, y + 8, {size: 12, bold: true});
            T(cr, 'MEM OK · I/O OK · LINK OK', x + w, y + 9, {size: 10, align: 'right', alpha: 0.8});
        },
        overlay(cr, W, H, s) {
            // scanline + dải nhiễu quét chậm
            rgba(cr, [0, 0, 0], 0.22);
            for (let y = 0; y < H; y += 3)
                cr.rectangle(0, y, W, 1);
            cr.fill();
            const by = (s.tick * 53) % (H + 80) - 40;
            const g = new Cairo.LinearGradient(0, by - 30, 0, by + 30);
            g.addColorStopRGBA(0, ...c.main, 0);
            g.addColorStopRGBA(0.5, ...c.main, 0.05);
            g.addColorStopRGBA(1, ...c.main, 0);
            cr.setSource(g);
            cr.rectangle(0, by - 30, W, 60);
            cr.fill();
        },
    };
})();

// ---------- 3. ORBITAL: giao diện tàu vũ trụ, nét trắng băng rõ + điểm nhấn san hô
function makeOrbital(c, heatFn, opt = {}) {
    const F = {
        thin: 'Noto Sans Light',
        light: 'Noto Sans',
        title: 'Noto Sans Medium',
        label: 'Noto Sans Semi-Condensed Medium',
        mono: 'Noto Sans Mono Condensed Medium',
    };
    const level = heatFn;
    const tempColor = t => (t === null ? c.dim : heatFn(t));
    const L = (cr, str, x, y, o = {}) => text(cr, str.toUpperCase(), x, y, {
        font: `${F.label} ${o.size ?? 10}px`, color: o.color ?? c.dim, alpha: o.alpha ?? 0.95, spacing: o.spacing ?? 1.8,
        align: o.align, valign: o.valign,
    });

    return {
        c, level, tempColor,
        panel(cr, W, H) {
            roundRect(cr, 1, 1, W - 2, H - 2, 8);
            const g = new Cairo.LinearGradient(0, 0, W * 0.6, H);
            g.addColorStopRGBA(0, ...c.bg, opt.bgAlpha?.[0] ?? 0.8);
            g.addColorStopRGBA(1, ...c.bg2, opt.bgAlpha?.[1] ?? 0.82);
            cr.setSource(g);
            cr.fillPreserve();
            // vầng sáng tinh vân ở góc trên
            const glowG = new Cairo.RadialGradient(W * 0.85, H * 0.08, 0, W * 0.85, H * 0.08, W * 0.9);
            glowG.addColorStopRGBA(0, ...(opt.glow ?? [0.4, 0.7, 1.0]), opt.glowAlpha ?? 0.22);
            glowG.addColorStopRGBA(1, ...(opt.glow ?? [0.4, 0.7, 1.0]), 0);
            cr.setSource(glowG);
            cr.fillPreserve();
            cr.setLineWidth(1.2);
            rgba(cr, c.accent, 0.6);
            cr.stroke();
            // sao (ít và nhạt để không rối)
            const rnd = lcg(7);
            for (let i = 0; i < 50; i++) {
                cr.arc(rnd() * W, rnd() * H, rnd() * 0.7 + 0.3, 0, TAU);
                rgba(cr, c.main, (0.06 + rnd() * 0.14) * (opt.starAlpha ?? 1));
                cr.fill();
            }
            // dấu + ở 4 góc
            cr.setLineWidth(1.5);
            rgba(cr, c.main, 1);
            for (const [px, py] of [[10, 10], [W - 10, 10], [10, H - 10], [W - 10, H - 10]]) {
                cr.moveTo(px - 6, py);
                cr.lineTo(px + 6, py);
                cr.moveTo(px, py - 6);
                cr.lineTo(px, py + 6);
            }
            cr.stroke();
        },
        header(cr, x, y, w, h, s) {
            const k = clock();
            L(cr, 'node', x, y + 2, {color: c.accent});
            text(cr, s.sys.hostname.toUpperCase(), x, y + 13, {font: `${F.light} 26px`, color: c.main, spacing: 4});
            text(cr, k.hm, x + w, y - 3, {font: `${F.thin} 40px`, color: c.main, align: 'right'});
            L(cr, k.date, x + w, y + 41, {align: 'right'});
            cr.setLineWidth(1);
            rgba(cr, c.main, 0.4);
            cr.moveTo(x, y + h - 10.5);
            cr.lineTo(x + w, y + h - 10.5);
            cr.stroke();
            const dx = x + w / 2, dy = y + h - 10.5;
            cr.moveTo(dx, dy - 5);
            cr.lineTo(dx + 5, dy);
            cr.lineTo(dx, dy + 5);
            cr.lineTo(dx - 5, dy);
            cr.closePath();
            rgba(cr, c.accent);
            cr.fill();
            L(cr, `${s.sys.os} · up ${fmtUptime(s.sys.uptime)}`, x, y + h - 5, {size: 9.5, spacing: 1.2, alpha: 0.85});
            L(cr, `kernel ${s.sys.kernel}`, x + w, y + h - 5, {size: 9.5, spacing: 1.2, alpha: 0.85, align: 'right'});
        },
        section(cr, x, y, w, idx, title, sub) {
            text(cr, idx, x, y + 1, {font: `${F.mono} 12px`, color: c.accent});
            text(cr, title.toUpperCase(), x + 24, y - 1, {font: `${F.title} 14px`, color: c.main, spacing: 3});
            L(cr, sub, x + w, y + 3, {align: 'right', spacing: 1, size: 10});
            cr.setLineWidth(1);
            rgba(cr, c.main, 0.35);
            cr.moveTo(x, y + 22.5);
            cr.lineTo(x + w, y + 22.5);
            cr.stroke();
            cr.setLineWidth(2);
            rgba(cr, c.accent);
            cr.moveTo(x, y + 22.5);
            cr.lineTo(x + 26, y + 22.5);
            cr.stroke();
        },
        gauge(cr, cx, cy, r, pct, o) {
            cr.newPath();
            const a0 = -Math.PI / 2;
            cr.setLineWidth(1.5);
            rgba(cr, c.main, 0.28);
            cr.arc(cx, cy, r, 0, TAU);
            cr.stroke();
            // giá trị
            const a1 = a0 + TAU * Math.max(0.002, Math.min(1, pct / 100));
            const col = level(pct);
            cr.setLineCap(Cairo.LineCap.ROUND);
            cr.setLineWidth(12);
            rgba(cr, col, 0.12);
            cr.arc(cx, cy, r, a0, a1);
            cr.stroke();
            cr.setLineWidth(5);
            rgba(cr, col, 1);
            cr.arc(cx, cy, r, a0, a1);
            cr.stroke();
            cr.setLineCap(Cairo.LineCap.BUTT);
            cr.arc(cx + r * Math.cos(a1), cy + r * Math.sin(a1), 4.5, 0, TAU);
            rgba(cr, c.main);
            cr.fill();
            // nhiệt độ: cung bên trong
            const ri = r - 10;
            cr.setLineWidth(1.5);
            rgba(cr, c.main, 0.2);
            cr.arc(cx, cy, ri, 0, TAU);
            cr.stroke();
            if (o.temp !== null && o.temp !== undefined) {
                cr.setLineWidth(3);
                rgba(cr, tempColor(o.temp));
                cr.arc(cx, cy, ri, a0, a0 + TAU * Math.min(1, o.temp / 100));
                cr.stroke();
            }
            const size = o.small ? 30 : 46;
            const t = text(cr, `${Math.round(pct)}`, cx - 5, cy - 2, {font: `${F.thin} ${size}px`, color: c.main, align: 'center', valign: 'middle'});
            text(cr, '%', t.x + t.w + 1, cy - size * 0.3, {font: `${F.light} ${size * 0.32}px`, color: c.dim});
            L(cr, o.label, cx, cy + size * 0.42, {align: 'center', size: 9});
            text(cr, fmtTemp(o.temp), cx, cy - size * 0.5, {font: `${F.mono} 11px`, color: tempColor(o.temp), align: 'center', valign: 'bottom'});
        },
        bar(cr, x, y, w, h, pct, o = {}) {
            const yy = y + h / 2;
            cr.setLineWidth(1);
            rgba(cr, c.main, 0.5);
            for (let i = 0; i <= 10; i++) {
                cr.moveTo(x + w * i / 10 + 0.5, yy + 5);
                cr.lineTo(x + w * i / 10 + 0.5, yy + (i % 5 === 0 ? 10 : 7));
            }
            cr.stroke();
            cr.setLineWidth(3);
            rgba(cr, c.main, 0.25);
            cr.moveTo(x, yy);
            cr.lineTo(x + w, yy);
            cr.stroke();
            const fx = x + w * Math.min(1, pct / 100);
            cr.setLineWidth(h > 6 ? 5 : 3);
            rgba(cr, o.color ?? level(pct));
            cr.moveTo(x, yy);
            cr.lineTo(fx, yy);
            cr.stroke();
            rgba(cr, c.accent);
            cr.rectangle(fx - 1.25, yy - 7, 2.5, 14);
            cr.fill();
        },
        graph(cr, x, y, w, h, series, max, o = {}) {
            cr.setLineWidth(1);
            rgba(cr, c.main, 0.3);
            cr.moveTo(x, y + h + 0.5);
            cr.lineTo(x + w, y + h + 0.5);
            if (o.mirror) {
                cr.moveTo(x, y + h / 2 + 0.5);
                cr.lineTo(x + w, y + h / 2 + 0.5);
            }
            cr.stroke();
            const mid = o.mirror ? y + h / 2 : y + h;
            const half = o.mirror ? h / 2 - 3 : h - 3;
            cr.save();
            cr.rectangle(x, y - 6, w, h + 12);
            cr.clip();
            series.forEach((sr, si) => {
                const data = padArray(sr.data);
                const step = w / (HISTORY - 1);
                const sign = o.mirror && si === 1 ? 1 : -1;
                const pts = data.map((v, i) => [x + (i + SHIFT) * step, mid + sign * Math.min(1, v / max) * half]);
                const path = () => {
                    cr.moveTo(...pts[0]);
                    for (let i = 1; i < pts.length; i++) {
                        const [px, py] = pts[i - 1];
                        const [qx, qy] = pts[i];
                        const mx = (px + qx) / 2;
                        cr.curveTo(mx, py, mx, qy, qx, qy);
                    }
                };
                cr.newPath();
                path();
                cr.lineTo(x + w, mid);
                cr.lineTo(x, mid);
                cr.closePath();
                const g = new Cairo.LinearGradient(0, mid + sign * half, 0, mid);
                g.addColorStopRGBA(0, ...sr.color, 0.42);
                g.addColorStopRGBA(1, ...sr.color, 0.04);
                cr.setSource(g);
                cr.fill();
                cr.newPath();
                path();
                cr.setLineWidth(2);
                rgba(cr, sr.color);
                cr.stroke();
                const last = pts[pts.length - 1];
                cr.arc(last[0], last[1], 3, 0, TAU);
                cr.fill();
            });
            cr.restore();
        },
        cores(cr, x, y, w, h, vals) {
            const n = vals.length || 1;
            const cw = w / n;
            vals.forEach((v, i) => {
                const cx = x + i * cw + cw / 2;
                cr.setLineWidth(4);
                rgba(cr, c.main, 0.16);
                cr.moveTo(cx, y);
                cr.lineTo(cx, y + h);
                cr.stroke();
                const vh = Math.max(1.5, v / 100 * h);
                rgba(cr, level(v));
                cr.moveTo(cx, y + h);
                cr.lineTo(cx, y + h - vh);
                cr.stroke();
            });
        },
        stat(cr, x, y, w, label, value, color) {
            L(cr, label, x, y + 2, {size: 10});
            text(cr, value, x + w, y - 1, {font: `${F.mono} 14.5px`, color: color ?? c.main, align: 'right'});
        },
        big(cr, x, y, value, unit, color, align = 'right') {
            const u = measure(cr, unit, {font: `${F.light} 14px`});
            const v = measure(cr, value, {font: `${F.thin} 40px`});
            const vx = alignX(x, v.w + 2 + u.w, align);
            text(cr, value, vx, y - 4, {font: `${F.thin} 40px`, color});
            text(cr, unit, vx + v.w + 2, y + 18, {font: `${F.light} 14px`, color: c.dim});
        },
        label(cr, x, y, str, o = {}) {
            return L(cr, str, x, y, {size: o.size ?? 10, color: o.color, align: o.align, alpha: o.alpha});
        },
        value(cr, x, y, str, o = {}) {
            return text(cr, str, x, y, {font: `${F.light} ${o.size ?? 22}px`, color: o.color ?? c.main, align: o.align});
        },
        footer(cr, x, y, w, h, s) {
            L(cr, 'orbital systems interface', x, y + 8, {size: 9, alpha: 0.75});
            L(cr, 'sync', x + w - 14, y + 8, {size: 9, align: 'right', alpha: 0.85});
            cr.arc(x + w - 4, y + 14, 3.5, 0, TAU);
            rgba(cr, c.accent, 0.35 + 0.65 * (Math.floor(s.tick) % 2));
            cr.fill();
        },
        overlay() {},
    };
}

const orbital = makeOrbital({
    main: [1.0, 1.0, 1.0], accent: [0.35, 0.86, 1.0], warn: [1.0, 0.8, 0.3],
    crit: [1.0, 0.3, 0.36], dim: [0.78, 0.87, 1.0], text: [1.0, 1.0, 1.0], bg: [0.09, 0.17, 0.36],
    bg2: [0.2, 0.12, 0.4],
}, heat);

// Bản nền trắng: chữ navy đậm, thang màu đậm hơn để nổi trên nền sáng
const orbitalLight = makeOrbital({
    main: [0.09, 0.13, 0.24], accent: [0.0, 0.47, 0.86], warn: [0.85, 0.6, 0.0],
    crit: [0.86, 0.14, 0.2], dim: [0.33, 0.4, 0.53], text: [0.09, 0.13, 0.24], bg: [1.0, 1.0, 1.0],
    bg2: [0.9, 0.94, 1.0],
}, heatLight, {bgAlpha: [0.88, 0.9], glow: [0.55, 0.75, 1.0], glowAlpha: 0.35, starAlpha: 0.5});

// ---------- 4. CARD: thẻ sáng kiểu ứng dụng GNOME, vòng donut xanh, bố cục riêng
const card = (() => {
    const c = {
        blue: [0.21, 0.52, 0.89], orange: [0.96, 0.55, 0.12], red: [0.88, 0.16, 0.2],
        green: [0.18, 0.69, 0.42], track: [0.87, 0.88, 0.9], ink: [0.16, 0.17, 0.2],
        gray: [0.42, 0.44, 0.48], line: [0.85, 0.86, 0.88], card: [1, 1, 1], soft: [0.965, 0.97, 0.975],
    };
    const FF = 'Ubuntu Sans';
    const level = heat;
    const tempColor = t => (t === null || t === undefined ? c.gray : heat(t));
    const t = (cr, str, x, y, o = {}) => text(cr, str, x, y, {
        font: `${FF} ${o.weight ?? ''} ${o.size ?? 12}px`, color: o.color ?? c.ink, alpha: o.alpha ?? 1,
        align: o.align, valign: o.valign, spacing: o.spacing,
    });
    const gib = b => `${(b / 2 ** 30).toFixed(1)} GiB`;

    function cardBox(cr, x, y, w, h) {
        for (let i = 3; i >= 1; i--) {
            roundRect(cr, x - i, y - i + 3, w + 2 * i, h + 2 * i, 12 + i);
            cr.setSourceRGBA(0, 0, 0, 0.035);
            cr.fill();
        }
        roundRect(cr, x, y, w, h, 12);
        rgba(cr, c.card, 0.95);
        cr.fillPreserve();
        cr.setLineWidth(1);
        cr.setSourceRGBA(0, 0, 0, 0.08);
        cr.stroke();
    }

    function divider(cr, x, y0, y1) {
        cr.setLineWidth(1);
        rgba(cr, c.line);
        cr.moveTo(x + 0.5, y0);
        cr.lineTo(x + 0.5, y1);
        cr.stroke();
    }

    // Vòng donut: bắt đầu từ đáy, chạy theo chiều kim đồng hồ; giữa là 4 dòng chữ
    function donut(cr, cx, cy, r, pct, lines, color) {
        cr.newPath();
        cr.setLineWidth(9);
        rgba(cr, c.track);
        cr.arc(cx, cy, r, 0, TAU);
        cr.stroke();
        const p = Math.max(0, Math.min(1, pct / 100));
        if (p > 0.003) {
            cr.setLineCap(Cairo.LineCap.ROUND);
            rgba(cr, color ?? level(pct));
            cr.arc(cx, cy, r, Math.PI / 2, Math.PI / 2 + TAU * p);
            cr.stroke();
            cr.setLineCap(Cairo.LineCap.BUTT);
        }
        const lh = 15;
        const y0 = cy - lh * 2 + 1;
        t(cr, lines[0], cx, y0, {size: 11, color: c.gray, align: 'center'});
        t(cr, lines[1], cx, y0 + lh, {size: 12.5, align: 'center'});
        t(cr, lines[2], cx, y0 + lh * 2, {size: 12.5, align: 'center'});
        t(cr, lines[3], cx, y0 + lh * 3, {size: 11, color: c.gray, align: 'center'});
    }

    function title(cr, cx, y, str) {
        t(cr, str, cx, y, {size: 15, weight: 'Medium', align: 'center'});
    }

    // Biểu đồ vùng kiểu System Monitor
    function areaChart(cr, x, y, w, h, series, max) {
        roundRect(cr, x, y, w, h, 6);
        rgba(cr, c.soft);
        cr.fill();
        cr.setLineWidth(1);
        rgba(cr, c.line);
        for (let i = 1; i < 4; i++) {
            cr.moveTo(x + 4, y + h * i / 4 + 0.5);
            cr.lineTo(x + w - 4, y + h * i / 4 + 0.5);
        }
        cr.stroke();
        cr.save();
        roundRect(cr, x, y, w, h, 6);
        cr.clip();
        for (const sr of series) {
            const data = padArray(sr.data);
            const step = w / (HISTORY - 1);
            const pts = data.map((v, i) => [x + (i + SHIFT) * step, y + h - Math.min(1, v / max) * (h - 4)]);
            cr.newPath();
            cr.moveTo(...pts[0]);
            pts.slice(1).forEach(p => cr.lineTo(...p));
            if (sr.fill) {
                cr.lineTo(x + w, y + h);
                cr.lineTo(x, y + h);
                cr.closePath();
                rgba(cr, sr.color, 0.25);
                cr.fillPreserve();
                cr.newPath();
                cr.moveTo(...pts[0]);
                pts.slice(1).forEach(p => cr.lineTo(...p));
            }
            cr.setLineJoin(Cairo.LineJoin.ROUND);
            cr.setLineWidth(1.8);
            rgba(cr, sr.color);
            cr.stroke();
        }
        cr.restore();
    }

    function statLine(cr, x, y, w, label, value, color) {
        t(cr, label, x, y, {size: 12, color: c.gray});
        t(cr, value, x + w, y, {size: 12.5, weight: 'Medium', color: color ?? c.ink, align: 'right'});
    }

    const P = 16; // padding trong thẻ

    function header(cr, x, y, w, h, s) {
        cardBox(cr, x, y, w, h);
        const k = clock();
        t(cr, s.sys.hostname, x + P, y + 14, {size: 19, weight: 'Bold'});
        t(cr, `${s.sys.os} · Kernel ${s.sys.kernel}`, x + P, y + 42, {size: 11.5, color: c.gray});
        t(cr, `Uptime ${fmtUptime(s.sys.uptime)}`, x + P, y + 57, {size: 11.5, color: c.gray});
        t(cr, k.hm, x + w - P, y + 8, {size: 34, weight: 'Light', align: 'right'});
        t(cr, k.date.replace(/,/g, ''), x + w - P, y + 52, {size: 11.5, color: c.gray, align: 'right'});
    }

    function cpuCard(cr, x, y, w, h, s) {
        const cp = s.cpu;
        cardBox(cr, x, y, w, h);
        const half = w / 2;
        title(cr, x + half / 2, y + 12, 'Processor');
        title(cr, x + half + half / 2, y + 12, 'Temperature');
        divider(cr, x + half, y + 16, y + 150);
        donut(cr, x + half / 2, y + 96, 48, cp.usage,
            ['Usage', `${Math.round(cp.usage)} %`, cp.freq ? `${cp.freq.toFixed(2)} GHz` : '--', cp.model], level(cp.usage));
        donut(cr, x + half + half / 2, y + 96, 48, cp.temp ?? 0,
            ['Package', fmtTemp(cp.temp), `Load ${cp.load[0].toFixed(2)}`, `${cp.threads} threads`], tempColor(cp.temp));
        const gx = x + P, gw = w - 2 * P;
        t(cr, `Usage history · ${Math.round(s.historySeconds ?? 60)} s`, gx, y + 158, {size: 11, color: c.gray});
        areaChart(cr, gx, y + 176, gw, 58, [{data: cp.history, color: c.blue, fill: true}], 100);
        // thanh từng luồng
        const by = y + 242, bh = 24;
        const n = cp.perCore.length || 1;
        const bw = gw / n;
        cp.perCore.forEach((v, i) => {
            const bx = gx + i * bw + bw * 0.3;
            const ww = bw * 0.4;
            roundRect(cr, bx, by, ww, bh, Math.min(3, ww / 2));
            rgba(cr, c.track);
            cr.fill();
            const vh = Math.max(ww, v / 100 * bh);
            roundRect(cr, bx, by + bh - vh, ww, vh, Math.min(3, ww / 2));
            rgba(cr, level(v));
            cr.fill();
        });
    }

    function memCard(cr, x, y, w, h, s) {
        const m = s.mem;
        cardBox(cr, x, y, w, h);
        const half = w / 2;
        title(cr, x + half / 2, y + 12, 'Memory');
        title(cr, x + half + half / 2, y + 12, 'Swap');
        divider(cr, x + half, y + 16, y + h - 14);
        donut(cr, x + half / 2, y + 96, 48, m.percent, ['Used', gib(m.used), gib(m.total), 'Total']);
        donut(cr, x + half + half / 2, y + 96, 48, m.swapPercent, ['Used', gib(m.swapUsed), gib(m.swapTotal), 'Total']);
    }

    function gpuCard(cr, x, y, w, h, s) {
        const g = s.gpu;
        cardBox(cr, x, y, w, h);
        const half = w / 2;
        title(cr, x + half / 2, y + 12, 'Graphics');
        title(cr, x + half + half / 2, y + 12, 'Video Memory');
        divider(cr, x + half, y + 16, y + 150);
        if (!g.available) {
            t(cr, 'No GPU telemetry', x + w / 2, y + h / 2, {size: 12, color: c.gray, align: 'center', valign: 'middle'});
            return;
        }
        donut(cr, x + half / 2, y + 96, 48, g.util, ['Usage', `${Math.round(g.util)} %`, fmtTemp(g.temp), 'Temp']);
        donut(cr, x + half + half / 2, y + 96, 48, g.memPercent, ['Used', gib(g.memUsed), gib(g.memTotal), 'Total']);
        const sy = y + 158;
        const cw = (w - 2 * P) / 3;
        const cell = (i, label, value) => {
            const cx = x + P + cw * i + cw / 2;
            t(cr, label, cx, sy, {size: 11, color: c.gray, align: 'center'});
            t(cr, value, cx, sy + 15, {size: 13, weight: 'Medium', align: 'center'});
        };
        cell(0, 'Power', g.power === null ? '--' : `${g.power.toFixed(0)} / ${g.powerLimit?.toFixed(0) ?? '--'} W`);
        cell(1, 'Fan', g.fan === null ? '--' : `${g.fan} %`);
        cell(2, 'Clock', g.clock === null ? '--' : `${g.clock} MHz`);
        t(cr, g.name, x + w / 2, y + h - 22, {size: 11, color: c.gray, align: 'center'});
    }

    function diskCard(cr, x, y, w, h, s) {
        const d = s.disk;
        cardBox(cr, x, y, w, h);
        const half = w / 2;
        title(cr, x + half / 2, y + 12, 'Disk');
        title(cr, x + half + half / 2, y + 12, 'Activity');
        divider(cr, x + half, y + 16, y + h - 14);
        donut(cr, x + half / 2, y + 96, 48, d.percent, ['Used', `${fmtGB(d.used)} GB`, `${fmtGB(d.total)} GB`, `${d.device} · ${d.mount}`]);
        const rx = x + half + P, rw = half - 2 * P;
        statLine(cr, rx, y + 44, rw, 'Read', fmtRate(d.readRate), c.blue);
        statLine(cr, rx, y + 64, rw, 'Write', fmtRate(d.writeRate), c.orange);
        statLine(cr, rx, y + 84, rw, 'Temp', fmtTemp(d.temp), tempColor(d.temp));
        areaChart(cr, rx, y + 108, rw, h - 124,
            [{data: d.readHist, color: c.blue, fill: true}, {data: d.writeHist, color: c.orange}],
            autoScale(d.readHist, d.writeHist));
    }

    function netCard(cr, x, y, w, h, s) {
        const n = s.net;
        cardBox(cr, x, y, w, h);
        title(cr, x + w / 2, y + 12, 'Network');
        t(cr, `${n.iface || 'offline'}${n.ip ? ` · ${n.ip}` : ''}`, x + w / 2, y + 33, {size: 11, color: c.gray, align: 'center'});
        const half = w / 2;
        const cell = (cx, color, label, value, total) => {
            cr.arc(cx - 52, y + 62, 4, 0, TAU);
            rgba(cr, color);
            cr.fill();
            t(cr, label, cx - 44, y + 54, {size: 11.5, color: c.gray});
            t(cr, value, cx - 56, y + 70, {size: 17, weight: 'Medium'});
            t(cr, total, cx - 56, y + 92, {size: 10.5, color: c.gray});
        };
        cell(x + half / 2, c.blue, 'Download', fmtRate(n.rxRate), `Total ${fmtBytes(n.rxTotal)}`);
        cell(x + half + half / 2, c.orange, 'Upload', fmtRate(n.txRate), `Total ${fmtBytes(n.txTotal)}`);
        const max = autoScale(n.rxHist, n.txHist);
        areaChart(cr, x + P, y + 114, w - 2 * P, h - 130,
            [{data: n.rxHist, color: c.blue, fill: true}, {data: n.txHist, color: c.orange}], max);
        t(cr, fmtRate(max), x + w - P - 6, y + 118, {size: 9.5, color: c.gray, align: 'right'});
    }

    const CARDS = [
        {h: 78, fn: header},
        {h: 274, fn: cpuCard},
        {h: 160, fn: memCard},
        {h: 222, fn: gpuCard},
        {h: 160, fn: diskCard},
        {h: 196, fn: netCard},
    ];
    const used = CARDS.reduce((a, b) => a + b.h, 0);

    return {
        neededH: used + (CARDS.length - 1) * 8 + 8,
        draw(cr, W, H, s) {
            const gap = Math.max(8, (H - 8 - used) / (CARDS.length - 1));
            let y = 4;
            for (const cd of CARDS) {
                cr.save();
                cd.fn(cr, 4, y, W - 8, cd.h, s);
                cr.restore();
                y += cd.h + gap;
            }
        },
    };
})();

export const THEMES = {tactical, terminal, orbital, orbitalLight, card};

// ================================================================ BỐ CỤC

function drawCpu(cr, T, s, x, y, w) {
    const c = s.cpu;
    T.section(cr, x, y, w, '01', 'CPU', `${c.model} · ${c.threads} threads`);
    const top = y + 32;
    T.gauge(cr, x + 100, top + 100, 70, c.usage, {temp: c.temp, label: 'cpu load', tick: s.tick});
    const rx = x + 214, rw = w - 214;
    let ry = top + 2;
    T.stat(cr, rx, ry, rw, 'TEMP', fmtTemp(c.temp), T.tempColor(c.temp));
    ry += 22;
    T.stat(cr, rx, ry, rw, 'CLOCK', c.freq ? `${c.freq.toFixed(2)} GHz` : '--');
    ry += 22;
    T.stat(cr, rx, ry, rw, 'LOAD', c.load.map(v => v.toFixed(2)).join('  '));
    ry += 28;
    T.label(cr, rx, ry, `THREADS ×${c.perCore.length}`);
    ry += 16;
    T.cores(cr, rx, ry, rw, 40, c.perCore);
    ry += 48;
    T.graph(cr, rx, ry, rw, top + 206 - ry, [{data: c.history, color: T.c.main}], 100);
}

function drawMem(cr, T, s, x, y, w) {
    const m = s.mem;
    T.section(cr, x, y, w, '02', 'MEMORY', `${fmtGB(m.total)} GB total`);
    const top = y + 32;
    usageRow(cr, T, x, top, w, `${fmtGB(m.used)} GB`, `${fmtGB(m.total)} GB`, m.percent);
    T.bar(cr, x, top + 46, w, 13, m.percent);
    T.stat(cr, x, top + 70, w / 2 - 14, 'CACHE', `${fmtGB(m.cached)} GB`);
    T.stat(cr, x + w / 2 + 14, top + 70, w / 2 - 14, 'SWAP', `${fmtGB(m.swapUsed)} / ${fmtGB(m.swapTotal)} GB`,
        m.swapPercent > 50 ? T.c.warn : undefined);
}

function drawGpu(cr, T, s, x, y, w) {
    const g = s.gpu;
    T.section(cr, x, y, w, '03', 'GPU', g.available ? g.name : 'not detected');
    const top = y + 32;
    if (!g.available) {
        T.label(cr, x, top + 10, 'NO TELEMETRY');
        return;
    }
    T.gauge(cr, x + 64, top + 64, 44, g.util, {temp: g.temp, label: 'core', tick: s.tick, small: true});
    const rx = x + 150, rw = w - 150;
    let ry = top + 2;
    T.stat(cr, rx, ry, rw, 'TEMP', fmtTemp(g.temp), T.tempColor(g.temp));
    ry += 21;
    T.stat(cr, rx, ry, rw, 'POWER', g.power === null ? '--' : `${g.power.toFixed(0)} / ${g.powerLimit?.toFixed(0) ?? '--'} W`);
    ry += 21;
    T.stat(cr, rx, ry, rw, 'FAN', g.fan === null ? '--' : `${g.fan}%`);
    ry += 21;
    T.stat(cr, rx, ry, rw, 'CLOCK', g.clock === null ? '--' : `${g.clock} MHz`);
    ry += 26;
    T.stat(cr, rx, ry, rw, 'VRAM', `${(g.memUsed / 2 ** 30).toFixed(1)} / ${(g.memTotal / 2 ** 30).toFixed(1)} GB`);
    ry += 20;
    T.bar(cr, rx, ry, rw, 10, g.memPercent);
}

function drawDisk(cr, T, s, x, y, w) {
    const d = s.disk;
    T.section(cr, x, y, w, '04', 'STORAGE', `${d.device} · ${d.mount}`);
    const top = y + 32;
    usageRow(cr, T, x, top, w, `${fmtGB(d.used)} GB`, `${fmtGB(d.total)} GB`, d.percent);
    T.bar(cr, x, top + 46, w, 11, d.percent);
    const cw = w / 3;
    T.stat(cr, x, top + 68, cw - 12, 'READ', fmtRate(d.readRate), T.c.main);
    T.stat(cr, x + cw, top + 68, cw - 12, 'WRITE', fmtRate(d.writeRate), T.c.accent);
    T.stat(cr, x + 2 * cw, top + 68, cw, 'TEMP', fmtTemp(d.temp), T.tempColor(d.temp));
    T.graph(cr, x, top + 88, w, 30, [{data: d.readHist, color: T.c.main}, {data: d.writeHist, color: T.c.accent}],
        autoScale(d.readHist, d.writeHist), {mirror: true});
}

function drawNet(cr, T, s, x, y, w) {
    const n = s.net;
    T.section(cr, x, y, w, '05', 'NETWORK', `${n.iface || 'offline'}${n.ip ? ` · ${n.ip}` : ''}`);
    const top = y + 32;
    T.label(cr, x, top, '▼ DOWNLINK');
    T.value(cr, x, top + 13, fmtRate(n.rxRate), {size: 22, color: T.c.main});
    T.label(cr, x + w, top, 'UPLINK ▲', {align: 'right'});
    T.value(cr, x + w, top + 13, fmtRate(n.txRate), {size: 22, color: T.c.accent, align: 'right'});
    const max = autoScale(n.rxHist, n.txHist);
    T.graph(cr, x, top + 48, w, 74, [{data: n.rxHist, color: T.c.main}, {data: n.txHist, color: T.c.accent}], max, {mirror: true});
    T.label(cr, x, top + 128, `RX ${fmtBytes(n.rxTotal)}`, {size: 10});
    T.label(cr, x + w / 2, top + 128, `SCALE ${fmtRate(max)}`, {size: 10, align: 'center', alpha: 0.45});
    T.label(cr, x + w, top + 128, `TX ${fmtBytes(n.txTotal)}`, {size: 10, align: 'right'});
}

const SECTIONS = [
    {h: 74, fn: (cr, T, s, x, y, w, h) => T.header(cr, x, y, w, h, s)},
    {h: 242, fn: drawCpu},
    {h: 128, fn: drawMem},
    {h: 176, fn: drawGpu},
    {h: 152, fn: drawDisk},
    {h: 178, fn: drawNet},
];
const FOOTER_H = 22;
const PAD = 20;
const DESIGN_W = 480;
const NEEDED_H = SECTIONS.reduce((a, b) => a + b.h, 0) + FOOTER_H + PAD * 2 + SECTIONS.length * 8;

const bgCache = {key: null, surface: null};

export function drawHud(cr, w, h, s, themeName = 'tactical') {
    const T = THEMES[themeName] ?? tactical;
    SHIFT = s.shift ?? 0;
    cr.save();
    cr.setOperator(Cairo.Operator.CLEAR);
    cr.paint();
    cr.setOperator(Cairo.Operator.OVER);

    const k = Math.min(w / DESIGN_W, h / (T.neededH ?? NEEDED_H));
    cr.scale(k, k);
    const W = w / k, H = h / k;

    if (T.draw) {
        // theme có bố cục riêng
        T.draw(cr, W, H, s);
        cr.restore();
        return;
    }

    // Nền panel không đổi giữa các khung hình -> vẽ một lần vào bộ đệm rồi dán lại
    const key = `${themeName}:${w}x${h}`;
    if (bgCache.key !== key) {
        const surf = new Cairo.ImageSurface(Cairo.Format.ARGB32, Math.ceil(w), Math.ceil(h));
        const bcr = new Cairo.Context(surf);
        bcr.scale(k, k);
        T.panel(bcr, W, H, s);
        bcr.$dispose();
        bgCache.key = key;
        bgCache.surface = surf;
    }
    cr.save();
    cr.scale(1 / k, 1 / k);
    cr.setSourceSurface(bgCache.surface, 0, 0);
    cr.paint();
    cr.restore();
    const x = PAD, cw = W - PAD * 2;
    const used = SECTIONS.reduce((a, b) => a + b.h, 0) + FOOTER_H;
    const gap = Math.max(8, (H - PAD * 2 - used) / SECTIONS.length);
    let y = PAD;
    for (const sec of SECTIONS) {
        cr.save();
        sec.fn(cr, T, s, x, y, cw, sec.h);
        cr.restore();
        y += sec.h + gap;
    }
    T.footer(cr, x, H - PAD - FOOTER_H, cw, FOOTER_H, s);
    T.overlay(cr, W, H, s);
    cr.restore();
}
