// Thu thập số liệu hệ thống: CPU, RAM, GPU, Disk, Network.
// Chỉ dùng GLib/Gio (không import gì của GNOME Shell) để chạy được cả
// trong extension lẫn trong script xem trước (gjs -m tools/preview.js).

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

export const HISTORY = 60;

const decoder = new TextDecoder('utf-8');

function readText(path) {
    try {
        const [ok, bytes] = GLib.file_get_contents(path);
        return ok ? decoder.decode(bytes) : null;
    } catch (e) {
        return null;
    }
}

function readNumber(path) {
    const t = readText(path);
    if (t === null)
        return null;
    const n = Number(t.trim());
    return Number.isFinite(n) ? n : null;
}

function listDir(path) {
    const names = [];
    try {
        const en = Gio.File.new_for_path(path).enumerate_children(
            'standard::name', Gio.FileQueryInfoFlags.NONE, null);
        let info;
        while ((info = en.next_file(null)) !== null)
            names.push(info.get_name());
        en.close(null);
    } catch (e) {
        // thư mục không tồn tại: trả về rỗng
    }
    return names.sort();
}

function push(arr, v) {
    arr.push(v);
    while (arr.length > HISTORY)
        arr.shift();
}

// Tìm file tempN_input trong các hwmon có tên thuộc `names`,
// ưu tiên nhãn khớp `labelRe`.
function findTempSensor(names, labelRe) {
    for (const h of listDir('/sys/class/hwmon')) {
        const dir = `/sys/class/hwmon/${h}`;
        const name = (readText(`${dir}/name`) ?? '').trim();
        if (!names.includes(name))
            continue;
        const inputs = listDir(dir).filter(f => /^temp\d+_input$/.test(f));
        for (const f of inputs) {
            const label = (readText(`${dir}/${f.replace('_input', '_label')}`) ?? '').trim();
            if (labelRe.test(label))
                return `${dir}/${f}`;
        }
        if (inputs.length)
            return `${dir}/${inputs[0]}`;
    }
    return null;
}

function shortCpuModel(model) {
    const m = model.match(/(i[3579]-\w+|Ryzen \d+ \w+|Xeon\S* \S+|Core Ultra \d+ \w+)/);
    return m ? m[1] : model.replace(/\(R\)|\(TM\)|CPU|@.*$/g, '').trim();
}

export class Sensors {
    constructor() {
        const cpuinfo = readText('/proc/cpuinfo') ?? '';
        const model = (cpuinfo.match(/model name\s*:\s*(.+)/) ?? [, 'CPU'])[1];
        const os = readText('/etc/os-release') ?? '';

        this.state = {
            tick: 0,
            sys: {
                hostname: GLib.get_host_name(),
                os: (os.match(/^PRETTY_NAME="?([^"\n]+)"?/m) ?? [, 'Linux'])[1],
                kernel: (readText('/proc/sys/kernel/osrelease') ?? '').trim().replace(/-generic$/, ''),
                uptime: 0,
            },
            cpu: {
                model: shortCpuModel(model),
                threads: (cpuinfo.match(/^processor\s*:/gm) ?? []).length,
                usage: 0, perCore: [], temp: null, freq: null, freqMax: null,
                load: [0, 0, 0], history: [],
            },
            mem: {
                total: 0, used: 0, percent: 0, cached: 0,
                swapTotal: 0, swapUsed: 0, swapPercent: 0, history: [],
            },
            gpu: {
                available: false, name: '', util: 0, temp: null,
                memUsed: 0, memTotal: 0, memPercent: 0,
                power: null, powerLimit: null, fan: null, clock: null, history: [],
            },
            disk: {
                mount: '/', device: '', total: 0, used: 0, percent: 0,
                readRate: 0, writeRate: 0, readHist: [], writeHist: [], temp: null,
            },
            net: {
                iface: '', ip: '', rxRate: 0, txRate: 0, rxTotal: 0, txTotal: 0,
                rxHist: [], txHist: [],
            },
        };

        this._prevCpu = {};
        this._prevDisk = null;
        this._prevNet = null;
        this._prevTime = 0;

        this._cpuTempPath = findTempSensor(['coretemp', 'k10temp', 'zenpower'], /Package id 0|Tctl|Tdie/);
        this._findRootDisk();
        this._diskTempPath = this.state.disk.device.startsWith('nvme')
            ? findTempSensor(['nvme'], /Composite/)
            : findTempSensor(['drivetemp'], /.*/);
        this._amdGpuBusy = listDir('/sys/class/drm')
            .map(c => `/sys/class/drm/${c}/device/gpu_busy_percent`)
            .find(p => readNumber(p) !== null) ?? null;
    }

    start() {
        this._startNvidia();
        this.update();
    }

    stop() {
        this._nvCancel?.cancel();
        try {
            this._nvProc?.force_exit();
        } catch (e) {
            // tiến trình đã thoát
        }
        this._nvProc = null;
        this._nvStream = null;
        this._nvCancel = null;
    }

    update() {
        const now = GLib.get_monotonic_time() / 1e6;
        const dt = this._prevTime ? now - this._prevTime : 0;
        this._prevTime = now;
        const s = this.state;
        s.tick++;

        this._readCpu();
        this._readMem();
        this._readDisk(dt);
        this._readNet(dt);
        if (this._amdGpuBusy && !this._nvProc) {
            s.gpu.available = true;
            s.gpu.name = s.gpu.name || 'AMD GPU';
            s.gpu.util = readNumber(this._amdGpuBusy) ?? 0;
        }
        push(s.gpu.history, s.gpu.util);

        s.sys.uptime = Number((readText('/proc/uptime') ?? '0').split(' ')[0]);

        if (s.tick % 10 === 1)
            this._readDiskUsage();
        if (s.tick % 30 === 1)
            this._refreshIp();
    }

    _readCpu() {
        const c = this.state.cpu;
        const text = readText('/proc/stat') ?? '';
        const perCore = [];
        for (const line of text.split('\n')) {
            if (!line.startsWith('cpu'))
                continue;
            const parts = line.trim().split(/\s+/);
            const name = parts[0];
            const nums = parts.slice(1, 9).map(Number);
            const idle = nums[3] + nums[4];
            const total = nums.reduce((a, b) => a + b, 0);
            const prev = this._prevCpu[name];
            this._prevCpu[name] = {idle, total};
            let usage = 0;
            if (prev && total > prev.total)
                usage = Math.max(0, Math.min(100, 100 * (1 - (idle - prev.idle) / (total - prev.total))));
            if (name === 'cpu')
                c.usage = usage;
            else
                perCore.push(usage);
        }
        c.perCore = perCore;
        push(c.history, c.usage);

        const t = this._cpuTempPath ? readNumber(this._cpuTempPath) : null;
        c.temp = t === null ? null : t / 1000;

        const info = readText('/proc/cpuinfo') ?? '';
        const mhz = [...info.matchAll(/cpu MHz\s*:\s*([\d.]+)/g)].map(m => Number(m[1]));
        if (mhz.length) {
            c.freq = mhz.reduce((a, b) => a + b, 0) / mhz.length / 1000;
            c.freqMax = Math.max(...mhz) / 1000;
        }

        const load = (readText('/proc/loadavg') ?? '0 0 0').split(' ');
        c.load = load.slice(0, 3).map(Number);
    }

    _readMem() {
        const m = this.state.mem;
        const kv = {};
        for (const line of (readText('/proc/meminfo') ?? '').split('\n')) {
            const mm = line.match(/^(\w+):\s+(\d+)/);
            if (mm)
                kv[mm[1]] = Number(mm[2]) * 1024;
        }
        m.total = kv.MemTotal ?? 0;
        m.used = m.total - (kv.MemAvailable ?? 0);
        m.cached = (kv.Cached ?? 0) + (kv.Buffers ?? 0);
        m.percent = m.total ? 100 * m.used / m.total : 0;
        m.swapTotal = kv.SwapTotal ?? 0;
        m.swapUsed = m.swapTotal - (kv.SwapFree ?? 0);
        m.swapPercent = m.swapTotal ? 100 * m.swapUsed / m.swapTotal : 0;
        push(m.history, m.percent);
    }

    _findRootDisk() {
        const d = this.state.disk;
        for (const line of (readText('/proc/mounts') ?? '').split('\n')) {
            const f = line.split(' ');
            if (f[1] !== '/' || !f[0].startsWith('/dev/'))
                continue;
            const part = f[0].slice(5);
            d.device = /^(nvme|mmcblk)/.test(part) ? part.replace(/p\d+$/, '') : part.replace(/\d+$/, '');
        }
    }

    _readDiskUsage() {
        const d = this.state.disk;
        try {
            const info = Gio.File.new_for_path(d.mount).query_filesystem_info(
                'filesystem::size,filesystem::free,filesystem::used', null);
            const used = Number(info.get_attribute_uint64('filesystem::used'));
            const free = Number(info.get_attribute_uint64('filesystem::free'));
            d.total = Number(info.get_attribute_uint64('filesystem::size'));
            d.used = used;
            d.percent = used + free > 0 ? 100 * used / (used + free) : 0;
        } catch (e) {
            // bỏ qua, giữ số cũ
        }
    }

    _readDisk(dt) {
        const d = this.state.disk;
        for (const line of (readText('/proc/diskstats') ?? '').split('\n')) {
            const f = line.trim().split(/\s+/);
            if (f[2] !== d.device)
                continue;
            const rd = Number(f[5]) * 512;
            const wr = Number(f[9]) * 512;
            if (this._prevDisk && dt > 0) {
                d.readRate = Math.max(0, (rd - this._prevDisk.rd) / dt);
                d.writeRate = Math.max(0, (wr - this._prevDisk.wr) / dt);
            }
            this._prevDisk = {rd, wr};
        }
        push(d.readHist, d.readRate);
        push(d.writeHist, d.writeRate);
        const t = this._diskTempPath ? readNumber(this._diskTempPath) : null;
        d.temp = t === null ? null : t / 1000;
    }

    _defaultIface() {
        let best = null;
        for (const line of (readText('/proc/net/route') ?? '').split('\n').slice(1)) {
            const f = line.trim().split(/\s+/);
            if (f.length < 7 || f[1] !== '00000000')
                continue;
            const metric = Number(f[6]);
            if (!best || metric < best.metric)
                best = {iface: f[0], metric};
        }
        return best?.iface ?? '';
    }

    _readNet(dt) {
        const n = this.state.net;
        const iface = this._defaultIface();
        if (iface !== n.iface) {
            n.iface = iface;
            this._prevNet = null;
            this._refreshIp();
        }
        for (const line of (readText('/proc/net/dev') ?? '').split('\n')) {
            const idx = line.indexOf(':');
            if (idx < 0 || line.slice(0, idx).trim() !== iface)
                continue;
            const f = line.slice(idx + 1).trim().split(/\s+/).map(Number);
            n.rxTotal = f[0];
            n.txTotal = f[8];
            if (this._prevNet && dt > 0) {
                n.rxRate = Math.max(0, (f[0] - this._prevNet.rx) / dt);
                n.txRate = Math.max(0, (f[8] - this._prevNet.tx) / dt);
            }
            this._prevNet = {rx: f[0], tx: f[8]};
        }
        push(n.rxHist, n.rxRate);
        push(n.txHist, n.txRate);
    }

    _refreshIp() {
        const n = this.state.net;
        if (!n.iface)
            return;
        try {
            const proc = Gio.Subprocess.new(['ip', '-4', '-o', 'addr', 'show', 'dev', n.iface],
                Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE);
            proc.communicate_utf8_async(null, null, (p, res) => {
                try {
                    const [, out] = p.communicate_utf8_finish(res);
                    const m = (out ?? '').match(/inet (\S+?)\//);
                    n.ip = m ? m[1] : '';
                } catch (e) {
                    // bỏ qua
                }
            });
        } catch (e) {
            // không có lệnh ip
        }
    }

    _startNvidia() {
        const nv = GLib.find_program_in_path('nvidia-smi');
        if (!nv)
            return;
        try {
            this._nvProc = Gio.Subprocess.new([nv,
                '--query-gpu=name,utilization.gpu,temperature.gpu,memory.used,memory.total,power.draw,power.limit,fan.speed,clocks.gr',
                '--format=csv,noheader,nounits', '-lms', '1000'],
            Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE);
        } catch (e) {
            this._nvProc = null;
            return;
        }
        this._nvStream = new Gio.DataInputStream({
            base_stream: this._nvProc.get_stdout_pipe(),
            close_base_stream: true,
        });
        this._nvCancel = new Gio.Cancellable();
        this._readNvLine();
    }

    _readNvLine() {
        if (!this._nvStream)
            return;
        this._nvStream.read_line_async(GLib.PRIORITY_LOW, this._nvCancel, (stream, res) => {
            let line;
            try {
                [line] = stream.read_line_finish_utf8(res);
            } catch (e) {
                return; // đã huỷ hoặc lỗi
            }
            if (line === null)
                return; // nvidia-smi đã thoát
            this._parseNvidia(line);
            this._readNvLine();
        });
    }

    _parseNvidia(line) {
        const f = line.split(',').map(x => x.trim());
        if (f.length < 9)
            return;
        const num = x => {
            const v = Number(x);
            return Number.isFinite(v) ? v : null;
        };
        const g = this.state.gpu;
        g.available = true;
        g.name = f[0].replace(/^NVIDIA\s+/, '');
        g.util = num(f[1]) ?? 0;
        g.temp = num(f[2]);
        g.memUsed = (num(f[3]) ?? 0) * 1024 * 1024;
        g.memTotal = (num(f[4]) ?? 0) * 1024 * 1024;
        g.memPercent = g.memTotal ? 100 * g.memUsed / g.memTotal : 0;
        g.power = num(f[5]);
        g.powerLimit = num(f[6]);
        g.fan = num(f[7]);
        g.clock = num(f[8]);
    }
}
