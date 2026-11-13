// Trạng thái số liệu (tương đương object `state` trong sensors.js) và bộ nội suy
// giữa hai lần lấy mẫu (animator.js): số tăng/giảm dần, đồ thị trượt sang trái.
using System;
using System.Reflection;

namespace SystemHud
{
    public sealed class SysState
    {
        public string Hostname = "", Os = "", Kernel = "";
        public double Uptime;
    }

    public sealed class CpuState
    {
        public string Model = "CPU";
        public int Threads;
        public double Usage;
        public double[] PerCore = new double[0];
        public double? Temp, Freq;
        public double Procs, ThreadCount;
        public double[] History = new double[0];
    }

    public sealed class MemState
    {
        public double Total, Used, Percent, Cached, SwapTotal, SwapUsed, SwapPercent;
        public double[] History = new double[0];
    }

    public sealed class GpuState
    {
        public bool Available;
        public string Name = "";
        public double Util;
        public double? Temp, Power, PowerLimit, Fan, Clock;
        public double MemUsed, MemTotal, MemPercent;
        public double[] History = new double[0];
    }

    public sealed class DiskState
    {
        public string Mount = "C:", Device = "";
        public double Total, Used, Percent, ReadRate, WriteRate;
        public double? Temp;
        public double[] ReadHist = new double[0], WriteHist = new double[0];
    }

    public sealed class NetState
    {
        public string Iface = "", Ip = "";
        public double RxRate, TxRate, RxTotal, TxTotal;
        public double[] RxHist = new double[0], TxHist = new double[0];
    }

    public sealed class HudState
    {
        public double Tick;
        public double Shift; // độ trượt đồ thị (0..1 bước), do Animator đặt
        public SysState Sys = new SysState();
        public CpuState Cpu = new CpuState();
        public MemState Mem = new MemState();
        public GpuState Gpu = new GpuState();
        public DiskState Disk = new DiskState();
        public NetState Net = new NetState();

        public HudState Clone() => (HudState)Interp.Value(typeof(HudState), "", null, this, 1);
    }

    internal static class Interp
    {
        static bool IsHistory(string name) => name.EndsWith("History") || name.EndsWith("Hist");

        // a -> b theo t. a == null: sao chép sâu b.
        public static object Value(Type type, string name, object a, object b, double t)
        {
            if (b == null)
                return null;
            if (type == typeof(double) || type == typeof(double?))
            {
                if (a is double x && b is double y && !double.IsNaN(x) && !double.IsInfinity(x) && !double.IsNaN(y) && !double.IsInfinity(y))
                    return x + (y - x) * t;
                return b;
            }
            if (type == typeof(double[]))
            {
                var bb = (double[])b;
                // mảng lịch sử: giữ dữ liệu mới, phần trượt do Shift lo
                if (IsHistory(name) || !(a is double[] aa) || aa.Length != bb.Length)
                    return bb.Clone();
                var r = new double[bb.Length];
                for (int i = 0; i < r.Length; i++)
                    r[i] = aa[i] + (bb[i] - aa[i]) * t;
                return r;
            }
            if (type.IsClass && type != typeof(string))
            {
                var o = Activator.CreateInstance(type);
                foreach (var f in type.GetFields(BindingFlags.Public | BindingFlags.Instance))
                    f.SetValue(o, Value(f.FieldType, f.Name, a == null ? null : f.GetValue(a), f.GetValue(b), t));
                return o;
            }
            return b;
        }
    }

    public sealed class Animator
    {
        public double Duration;
        HudState _from, _to, _current;
        double _start, _t = 1;
        bool _first;

        public Animator(double durationMs) { Duration = durationMs; }

        public void Push(HudState state, double nowMs)
        {
            _to = state.Clone();
            _from = (_current ?? state).Clone();
            _start = nowMs;
            _first = _current == null;
        }

        public bool Running => _to != null && _t < 1;

        // easeOutCubic: nhanh lúc đầu, chậm dần khi tới đích
        static double Ease(double t) => 1 - Math.Pow(1 - t, 3);

        public HudState Frame(double nowMs)
        {
            if (_to == null)
                return null;
            double raw = _first || Duration <= 0 ? 1 : Math.Min(1, Math.Max(0, (nowMs - _start) / Duration));
            _t = raw;
            double e = Ease(raw);
            var o = (HudState)Interp.Value(typeof(HudState), "", _from, _to, e);
            o.Tick = _to.Tick - 1 + e;
            o.Shift = _first ? 0 : 1 - e;
            _current = o;
            return o;
        }
    }
}
