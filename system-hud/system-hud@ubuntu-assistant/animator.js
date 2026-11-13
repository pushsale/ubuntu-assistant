// Nội suy mượt giữa hai lần lấy mẫu: số liệu tăng/giảm dần thay vì nhảy bụp,
// đồ thị lịch sử trượt sang trái một bước.

const HISTORY_KEY = /(history|Hist)$/;

function clone(v) {
    return v === null || typeof v !== 'object' ? v : JSON.parse(JSON.stringify(v));
}

function lerp(a, b, t, key) {
    if (typeof b === 'number' && typeof a === 'number' && Number.isFinite(a) && Number.isFinite(b))
        return a + (b - a) * t;
    if (Array.isArray(b)) {
        // mảng lịch sử: giữ nguyên dữ liệu mới, phần trượt do `shift` lo
        if (HISTORY_KEY.test(key ?? '') || !Array.isArray(a) || a.length !== b.length)
            return b;
        return b.map((x, i) => lerp(a[i], x, t));
    }
    if (b && typeof b === 'object') {
        const out = {};
        for (const k of Object.keys(b))
            out[k] = lerp(a?.[k], b[k], t, k);
        return out;
    }
    return b;
}

// easeOutCubic: chạy nhanh lúc đầu, chậm dần khi tới đích
const ease = t => 1 - (1 - t) ** 3;

export class Animator {
    constructor(durationMs = 900) {
        this.duration = durationMs;
        this._from = null;
        this._to = null;
        this._start = 0;
        this._current = null;
    }

    // Gọi mỗi lần có mẫu mới
    push(state, nowMs) {
        this._to = clone(state);
        this._from = this._current ? clone(this._current) : clone(state);
        this._start = nowMs;
        this._first = this._current === null;
    }

    get running() {
        return this._to !== null && this._t < 1;
    }

    // Trả về trạng thái để vẽ ở thời điểm nowMs
    frame(nowMs) {
        if (!this._to)
            return null;
        const raw = this._first ? 1 : Math.min(1, (nowMs - this._start) / this.duration);
        this._t = raw;
        const e = ease(raw);
        const out = lerp(this._from, this._to, e);
        // tick lẻ để vòng xoay trang trí quay liên tục; vị trí trượt của đồ thị
        out.tick = (this._to.tick ?? 0) - 1 + e;
        out.shift = this._first ? 0 : 1 - e;
        this._current = out;
        return out;
    }
}
