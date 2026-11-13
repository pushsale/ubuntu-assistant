// Thu thập số liệu hệ thống trên Windows: CPU, RAM, GPU, Disk, Network.
// Tương đương sensors.js (bản Ubuntu đọc /proc, /sys) nhưng dùng Win32 API, PDH, WMI, nvidia-smi.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Management;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Runtime.InteropServices;
using System.Text.RegularExpressions;
using Microsoft.Win32;

namespace SystemHud
{
    public sealed class Sensors : IDisposable
    {
        public const int HISTORY = 60;

        readonly object _gate = new object();
        readonly HudState _s = new HudState();
        readonly Stopwatch _clock = Stopwatch.StartNew();
        double _prevTime;
        bool _inited;

        Pdh _pdh;
        double _baseMhz;

        long _prevIdle, _prevKernel, _prevUser;
        bool _havePrevSys;
        Native.SYSTEM_PROCESSOR_PERFORMANCE_INFORMATION[] _prevCores;

        string _sysDrive = "C:";
        int _sysDiskIndex = -1;

        NetworkInterface _nic;
        uint _nicIndex = uint.MaxValue;
        long _prevRx, _prevTx;
        bool _havePrevNet;

        string _hwNamespace;      // root\LibreHardwareMonitor | root\OpenHardwareMonitor | null
        bool _lhmHttp;            // đang đọc được từ web server của LibreHardwareMonitor
        bool _acpiOk = true, _storageTempOk = true;

        Process _nv;
        IntPtr _job;
        bool _gpuFallback;

        public Sensors()
        {
            var s = _s;
            s.Sys.Hostname = Environment.MachineName;
            ReadOsInfo(out s.Sys.Os, out s.Sys.Kernel);
            using (var k = Registry.LocalMachine.OpenSubKey(@"HARDWARE\DESCRIPTION\System\CentralProcessor\0"))
            {
                s.Cpu.Model = ShortCpuModel(k?.GetValue("ProcessorNameString") as string ?? "CPU");
                _baseMhz = Convert.ToDouble(k?.GetValue("~MHz") ?? 0);
            }
            try { s.Cpu.Threads = (int)Native.GetActiveProcessorCount(0xFFFF); }
            catch { s.Cpu.Threads = Environment.ProcessorCount; }
            if (s.Cpu.Threads <= 0)
                s.Cpu.Threads = Environment.ProcessorCount;

            _sysDrive = (Path.GetPathRoot(Environment.SystemDirectory) ?? @"C:\").TrimEnd('\\');
            s.Disk.Mount = _sysDrive;
        }

        public HudState Snapshot()
        {
            lock (_gate)
                return _s.Clone();
        }

        // Khởi tạo phần chậm (WMI, tiến trình con) — chạy trên luồng lấy mẫu, không chặn giao diện
        void Init()
        {
            _inited = true;
            _pdh = new Pdh();
            _pdh.Add("perf", @"\Processor Information(_Total)\% Processor Performance");
            _pdh.Add("dread", $@"\LogicalDisk({_sysDrive})\Disk Read Bytes/sec");
            _pdh.Add("dwrite", $@"\LogicalDisk({_sysDrive})\Disk Write Bytes/sec");
            _pdh.Add("standbyCore", @"\Memory\Standby Cache Core Bytes");
            _pdh.Add("standbyNormal", @"\Memory\Standby Cache Normal Priority Bytes");
            _pdh.Add("standbyReserve", @"\Memory\Standby Cache Reserve Bytes");
            _pdh.Add("modified", @"\Memory\Modified Page List Bytes");

            FindSystemDisk();
            _hwNamespace = new[] { @"root\LibreHardwareMonitor", @"root\OpenHardwareMonitor" }
                .FirstOrDefault(ns => Wmi(ns, "SELECT Name FROM Sensor WHERE SensorType='Temperature'")?.Count > 0);

            if (!StartNvidia())
            {
                _gpuFallback = _pdh.Add("gpu3d", @"\GPU Engine(*engtype_3D)\Utilization Percentage");
                _pdh.Add("gpumem", @"\GPU Adapter Memory(*)\Dedicated Usage");
                var (name, mem) = FindGpuFromRegistry();
                lock (_gate)
                {
                    _s.Gpu.Name = name;
                    _s.Gpu.MemTotal = mem;
                }
            }
            _pdh.Collect();
        }

        public void Update()
        {
            if (!_inited)
                Init();
            double now = _clock.Elapsed.TotalSeconds;
            double dt = _prevTime > 0 ? now - _prevTime : 0;
            _prevTime = now;
            _pdh.Collect();

            // Đọc phần chậm ngoài khoá
            var hw = ReadHwTemps();
            double? acpi = hw.cpu == null ? ReadAcpiTemp() : null;
            bool slowTick = _s.Tick % 10 == 0;
            double? storageTemp = hw.disk == null && slowTick ? ReadStorageTemp() : null;
            var page = slowTick ? ReadPageFile() : (null, null);

            lock (_gate)
            {
                var s = _s;
                s.Tick++;
                ReadCpu(hw.cpu ?? acpi);
                ReadMem();
                if (page.Item1 != null)
                {
                    s.Mem.SwapTotal = page.Item1.Value;
                    s.Mem.SwapUsed = page.Item2.Value;
                    s.Mem.SwapPercent = s.Mem.SwapTotal > 0 ? 100 * s.Mem.SwapUsed / s.Mem.SwapTotal : 0;
                }
                ReadDisk(slowTick);
                if (hw.disk != null)
                    s.Disk.Temp = hw.disk;
                else if (slowTick && _storageTempOk)
                    s.Disk.Temp = storageTemp;
                ReadNet(dt);
                if (_gpuFallback)
                    ReadGpuFallback(hw.gpu);
                else if (_nv == null && hw.gpu != null)
                    s.Gpu.Temp = hw.gpu;
                Push(ref s.Gpu.History, s.Gpu.Util);
                s.Sys.Uptime = Native.GetTickCount64() / 1000.0;
            }
        }

        // ---------------------------------------------------------------- CPU

        void ReadCpu(double? temp)
        {
            var c = _s.Cpu;
            if (Native.GetSystemTimes(out long idle, out long kernel, out long user))
            {
                if (_havePrevSys)
                {
                    long dIdle = idle - _prevIdle, dTotal = kernel - _prevKernel + user - _prevUser;
                    c.Usage = dTotal > 0 ? Clamp(100.0 * (1 - (double)dIdle / dTotal), 0, 100) : c.Usage;
                }
                _prevIdle = idle; _prevKernel = kernel; _prevUser = user;
                _havePrevSys = true;
            }
            c.PerCore = ReadPerCore() ?? c.PerCore;
            Push(ref c.History, c.Usage);
            c.Temp = temp;

            var perf = _pdh.Get("perf");
            if (perf != null && _baseMhz > 0)
                c.Freq = _baseMhz * perf.Value / 100 / 1000;
            else if (_baseMhz > 0)
                c.Freq = _baseMhz / 1000;

            var pi = new Native.PERFORMANCE_INFORMATION { cb = (uint)Marshal.SizeOf(typeof(Native.PERFORMANCE_INFORMATION)) };
            if (Native.GetPerformanceInfo(ref pi, pi.cb))
            {
                c.Procs = pi.ProcessCount;
                c.ThreadCount = pi.ThreadCount;
            }
        }

        // Tải từng luồng CPU (nhóm xử lý hiện tại, tối đa 64 luồng)
        double[] ReadPerCore()
        {
            int size = Marshal.SizeOf(typeof(Native.SYSTEM_PROCESSOR_PERFORMANCE_INFORMATION));
            int n = Math.Max(1, Environment.ProcessorCount);
            IntPtr buf = Marshal.AllocHGlobal(size * n);
            try
            {
                if (Native.NtQuerySystemInformation(8, buf, size * n, out int ret) != 0)
                    return null;
                int count = ret / size;
                var cur = new Native.SYSTEM_PROCESSOR_PERFORMANCE_INFORMATION[count];
                for (int i = 0; i < count; i++)
                    cur[i] = (Native.SYSTEM_PROCESSOR_PERFORMANCE_INFORMATION)Marshal.PtrToStructure(buf + i * size, typeof(Native.SYSTEM_PROCESSOR_PERFORMANCE_INFORMATION));
                var result = new double[count];
                if (_prevCores != null && _prevCores.Length == count)
                {
                    for (int i = 0; i < count; i++)
                    {
                        long dIdle = cur[i].IdleTime - _prevCores[i].IdleTime;
                        long dTotal = cur[i].KernelTime - _prevCores[i].KernelTime + cur[i].UserTime - _prevCores[i].UserTime;
                        result[i] = dTotal > 0 ? Clamp(100.0 * (1 - (double)dIdle / dTotal), 0, 100) : 0;
                    }
                }
                _prevCores = cur;
                return result;
            }
            finally
            {
                Marshal.FreeHGlobal(buf);
            }
        }

        // ---------------------------------------------------------------- RAM

        void ReadMem()
        {
            var m = _s.Mem;
            var ms = new Native.MEMORYSTATUSEX { dwLength = (uint)Marshal.SizeOf(typeof(Native.MEMORYSTATUSEX)) };
            if (Native.GlobalMemoryStatusEx(ref ms))
            {
                m.Total = ms.ullTotalPhys;
                m.Used = ms.ullTotalPhys - ms.ullAvailPhys;
                m.Percent = m.Total > 0 ? 100 * m.Used / m.Total : 0;
            }
            // "Cached" như Task Manager: standby + modified
            double cached = 0;
            bool any = false;
            foreach (var key in new[] { "standbyCore", "standbyNormal", "standbyReserve", "modified" })
            {
                var v = _pdh.Get(key);
                if (v != null) { cached += v.Value; any = true; }
            }
            if (any)
                m.Cached = cached;
            Push(ref m.History, m.Percent);
        }

        (double?, double?) ReadPageFile()
        {
            var rows = Wmi(@"root\cimv2", "SELECT AllocatedBaseSize, CurrentUsage FROM Win32_PageFileUsage");
            if (rows == null)
                return (null, null);
            double total = 0, used = 0;
            foreach (var r in rows)
            {
                total += Convert.ToDouble(r["AllocatedBaseSize"] ?? 0) * 1024 * 1024;
                used += Convert.ToDouble(r["CurrentUsage"] ?? 0) * 1024 * 1024;
            }
            return (total, used);
        }

        // ---------------------------------------------------------------- Disk

        void FindSystemDisk()
        {
            string model = "";
            try
            {
                using (var parts = new ManagementObjectSearcher(
                    $"ASSOCIATORS OF {{Win32_LogicalDisk.DeviceID='{_sysDrive}'}} WHERE AssocClass=Win32_LogicalDiskToPartition"))
                {
                    foreach (ManagementObject p in parts.Get())
                    {
                        using (var drives = new ManagementObjectSearcher(
                            $"ASSOCIATORS OF {{Win32_DiskPartition.DeviceID='{p["DeviceID"]}'}} WHERE AssocClass=Win32_DiskDriveToDiskPartition"))
                        {
                            foreach (ManagementObject d in drives.Get())
                            {
                                model = (d["Model"] as string ?? "").Trim();
                                _sysDiskIndex = Convert.ToInt32(d["Index"] ?? -1);
                                break;
                            }
                        }
                        break;
                    }
                }
            }
            catch
            {
                // WMI không sẵn sàng: dùng tên mặc định
            }
            if (model.Length > 26)
                model = model.Substring(0, 26).TrimEnd();
            lock (_gate)
                _s.Disk.Device = model.Length > 0 ? model : "disk";
        }

        void ReadDisk(bool refreshUsage)
        {
            var d = _s.Disk;
            if (refreshUsage)
            {
                try
                {
                    var di = new DriveInfo(_sysDrive);
                    d.Total = di.TotalSize;
                    d.Used = di.TotalSize - di.TotalFreeSpace;
                    d.Percent = d.Total > 0 ? 100 * d.Used / d.Total : 0;
                }
                catch
                {
                    // giữ số cũ
                }
            }
            d.ReadRate = Math.Max(0, _pdh.Get("dread") ?? 0);
            d.WriteRate = Math.Max(0, _pdh.Get("dwrite") ?? 0);
            Push(ref d.ReadHist, d.ReadRate);
            Push(ref d.WriteHist, d.WriteRate);
        }

        double? ReadStorageTemp()
        {
            if (!_storageTempOk || _sysDiskIndex < 0)
                return null;
            var rows = Wmi(@"root\Microsoft\Windows\Storage", "SELECT DeviceId, Temperature FROM MSFT_StorageReliabilityCounter");
            if (rows == null)
            {
                _storageTempOk = false; // thường do không chạy quyền admin
                return null;
            }
            foreach (var r in rows)
            {
                if (Convert.ToString(r["DeviceId"]) != _sysDiskIndex.ToString(CultureInfo.InvariantCulture))
                    continue;
                double t = Convert.ToDouble(r["Temperature"] ?? 0);
                return t > 0 ? t : (double?)null;
            }
            return null;
        }

        // ---------------------------------------------------------------- Network

        void ReadNet(double dt)
        {
            var n = _s.Net;
            uint idx = uint.MaxValue;
            try { Native.GetBestInterface(BitConverter.ToUInt32(new byte[] { 8, 8, 8, 8 }, 0), out idx); }
            catch { }

            if (idx != _nicIndex || _nic == null || _s.Tick % 30 == 1)
            {
                if (idx != _nicIndex)
                    _havePrevNet = false;
                _nicIndex = idx;
                _nic = null;
                try
                {
                    foreach (var ni in NetworkInterface.GetAllNetworkInterfaces())
                    {
                        int i;
                        try { i = ni.GetIPProperties().GetIPv4Properties()?.Index ?? -1; }
                        catch { continue; }
                        if (i == (int)idx) { _nic = ni; break; }
                    }
                }
                catch { }
                n.Iface = _nic?.Name ?? "";
                n.Ip = _nic?.GetIPProperties().UnicastAddresses
                    .FirstOrDefault(a => a.Address.AddressFamily == AddressFamily.InterNetwork)?.Address.ToString() ?? "";
            }

            if (_nic != null)
            {
                try
                {
                    var st = _nic.GetIPStatistics();
                    long rx = st.BytesReceived, tx = st.BytesSent;
                    n.RxTotal = rx;
                    n.TxTotal = tx;
                    if (_havePrevNet && dt > 0)
                    {
                        n.RxRate = Math.Max(0, (rx - _prevRx) / dt);
                        n.TxRate = Math.Max(0, (tx - _prevTx) / dt);
                    }
                    _prevRx = rx; _prevTx = tx;
                    _havePrevNet = true;
                }
                catch
                {
                    _nic = null;
                }
            }
            else
            {
                n.RxRate = n.TxRate = 0;
            }
            Push(ref n.RxHist, n.RxRate);
            Push(ref n.TxHist, n.TxRate);
        }

        // ---------------------------------------------------------------- Nhiệt độ

        // LibreHardwareMonitor / OpenHardwareMonitor (nếu đang chạy) cho nhiệt CPU, ổ đĩa, GPU chuẩn nhất
        // Nguồn: WMI (root\LibreHardwareMonitor) hoặc web server của LHM (http://localhost:8085/data.json).
        // Chưa có nguồn nào thì cứ 10 mẫu dò lại một lần (LHM có thể được bật sau HUD).
        (double? cpu, double? disk, double? gpu) ReadHwTemps()
        {
            List<(string id, string name, double v)> list = null;
            if (_hwNamespace != null)
            {
                var rows = Wmi(_hwNamespace, "SELECT Identifier, Name, Value FROM Sensor WHERE SensorType='Temperature'");
                if (rows != null)
                    list = rows.Select(r => (id: Convert.ToString(r["Identifier"]) ?? "", name: Convert.ToString(r["Name"]) ?? "",
                        v: Convert.ToDouble(r["Value"] ?? 0))).ToList();
                else
                    _hwNamespace = null;
            }
            if (list == null && (_lhmHttp || _s.Tick % 10 == 0))
            {
                list = LhmHttp.ReadTemperatures();
                _lhmHttp = list != null;
                if (list == null && _s.Tick % 10 == 0)
                    _hwNamespace = new[] { @"root\LibreHardwareMonitor", @"root\OpenHardwareMonitor" }
                        .FirstOrDefault(ns => Wmi(ns, "SELECT Name FROM Sensor WHERE SensorType='Temperature'")?.Count > 0);
            }
            if (list == null || list.Count == 0)
                return default;
            double? cpu = null, disk = null, gpu = null;
            var cpuRows = list.Where(x => x.id.Contains("cpu")).ToList();
            foreach (var want in new[] { "CPU Package", "Core (Tctl/Tdie)", "Core (Tctl)", "Core (Tdie)", "Core Max", "Core Average" })
            {
                var hit = cpuRows.FirstOrDefault(x => x.name == want);
                if (hit.id != null) { cpu = hit.v; break; }
            }
            if (cpu == null && cpuRows.Count > 0)
                cpu = cpuRows.Max(x => x.v);
            var diskRow = list.FirstOrDefault(x => x.id.Contains("/nvme/") || x.id.Contains("/hdd/") || x.id.Contains("/ssd/") || x.id.Contains("/storage/"));
            if (diskRow.id != null)
                disk = diskRow.v;
            var gpuRow = list.FirstOrDefault(x => x.id.Contains("/gpu"));
            if (gpuRow.id != null)
                gpu = gpuRow.v;
            return (cpu, disk, gpu);
        }

        // Cảm biến ACPI: cần quyền admin, nhiều máy không có hoặc trả số cố định
        double? ReadAcpiTemp()
        {
            if (!_acpiOk)
                return null;
            var rows = Wmi(@"root\WMI", "SELECT CurrentTemperature FROM MSAcpi_ThermalZoneTemperature");
            if (rows == null || rows.Count == 0)
            {
                _acpiOk = false;
                return null;
            }
            double best = rows.Max(r => Convert.ToDouble(r["CurrentTemperature"] ?? 0) / 10 - 273.15);
            if (best <= 0 || best > 125)
            {
                _acpiOk = false;
                return null;
            }
            return best;
        }

        // ---------------------------------------------------------------- GPU

        bool StartNvidia()
        {
            string exe = new[]
            {
                Path.Combine(Environment.SystemDirectory, "nvidia-smi.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), @"NVIDIA Corporation\NVSMI\nvidia-smi.exe"),
            }.FirstOrDefault(File.Exists);
            if (exe == null)
                return false;
            try
            {
                var psi = new ProcessStartInfo(exe,
                    "-i 0 --query-gpu=name,utilization.gpu,temperature.gpu,memory.used,memory.total,power.draw,power.limit,fan.speed,clocks.gr " +
                    "--format=csv,noheader,nounits -lms 1000")
                {
                    UseShellExecute = false,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    CreateNoWindow = true,
                };
                _nv = new Process { StartInfo = psi, EnableRaisingEvents = true };
                _nv.OutputDataReceived += (_, e) => { if (e.Data != null) ParseNvidia(e.Data); };
                _nv.ErrorDataReceived += (_, e) => { };
                if (!_nv.Start())
                {
                    _nv = null;
                    return false;
                }
                BindToJob(_nv);
                _nv.BeginOutputReadLine();
                _nv.BeginErrorReadLine();
                return true;
            }
            catch
            {
                _nv = null;
                return false;
            }
        }

        void BindToJob(Process p)
        {
            try
            {
                _job = Native.CreateJobObject(IntPtr.Zero, null);
                var info = new Native.JOBOBJECT_EXTENDED_LIMIT_INFORMATION();
                info.BasicLimitInformation.LimitFlags = Native.JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
                Native.SetInformationJobObject(_job, Native.JobObjectExtendedLimitInformation, ref info,
                    Marshal.SizeOf(typeof(Native.JOBOBJECT_EXTENDED_LIMIT_INFORMATION)));
                Native.AssignProcessToJobObject(_job, p.Handle);
            }
            catch
            {
                // không gắn được job: vẫn chạy, Dispose sẽ kill
            }
        }

        void ParseNvidia(string line)
        {
            var f = line.Split(',').Select(x => x.Trim()).ToArray();
            if (f.Length < 9)
                return;
            double? Num(string x) => double.TryParse(x, NumberStyles.Float, CultureInfo.InvariantCulture, out var v) ? v : (double?)null;
            lock (_gate)
            {
                var g = _s.Gpu;
                g.Available = true;
                g.Name = Regex.Replace(f[0], @"^NVIDIA\s+", "");
                g.Util = Num(f[1]) ?? 0;
                g.Temp = Num(f[2]);
                g.MemUsed = (Num(f[3]) ?? 0) * 1024 * 1024;
                g.MemTotal = (Num(f[4]) ?? 0) * 1024 * 1024;
                g.MemPercent = g.MemTotal > 0 ? 100 * g.MemUsed / g.MemTotal : 0;
                g.Power = Num(f[5]);
                g.PowerLimit = Num(f[6]);
                g.Fan = Num(f[7]);
                g.Clock = Num(f[8]);
            }
        }

        // GPU không phải NVIDIA: tải 3D và VRAM từ bộ đếm "GPU Engine" của Windows (như Task Manager)
        void ReadGpuFallback(double? temp)
        {
            var g = _s.Gpu;
            var engines = _pdh.GetArray("gpu3d");
            if (engines.Count == 0 && string.IsNullOrEmpty(g.Name))
                return;
            // gom theo adapter (luid), lấy adapter bận nhất
            var byLuid = engines.GroupBy(e => Regex.Match(e.Key, @"luid_\w+?_\w+").Value)
                .Select(grp => grp.Sum(e => e.Value));
            g.Available = true;
            g.Util = Clamp(byLuid.DefaultIfEmpty(0).Max(), 0, 100);
            var mem = _pdh.GetArray("gpumem");
            if (mem.Count > 0)
                g.MemUsed = mem.Max(m => m.Value);
            g.MemPercent = g.MemTotal > 0 ? 100 * g.MemUsed / g.MemTotal : 0;
            g.Temp = temp;
            if (string.IsNullOrEmpty(g.Name))
                g.Name = "GPU";
        }

        static (string, double) FindGpuFromRegistry()
        {
            string best = "";
            double bestMem = 0;
            try
            {
                using (var cls = Registry.LocalMachine.OpenSubKey(@"SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}"))
                {
                    foreach (var sub in cls?.GetSubKeyNames() ?? new string[0])
                    {
                        if (!Regex.IsMatch(sub, @"^\d{4}$"))
                            continue;
                        using (var k = cls.OpenSubKey(sub))
                        {
                            var name = k?.GetValue("DriverDesc") as string;
                            if (string.IsNullOrEmpty(name) || name.Contains("Basic"))
                                continue;
                            double mem = 0;
                            var q = k.GetValue("HardwareInformation.qwMemorySize");
                            var d = k.GetValue("HardwareInformation.MemorySize");
                            if (q is long l) mem = l;
                            else if (q is byte[] qb && qb.Length >= 8) mem = BitConverter.ToInt64(qb, 0);
                            else if (d is int di) mem = (uint)di;
                            else if (d is byte[] db && db.Length >= 4) mem = BitConverter.ToUInt32(db, 0);
                            if (mem > bestMem || best.Length == 0)
                            {
                                best = name;
                                bestMem = mem;
                            }
                        }
                    }
                }
            }
            catch { }
            best = Regex.Replace(best, @"^(NVIDIA|AMD|Intel\(R\))\s+", "");
            return (best, bestMem);
        }

        // ---------------------------------------------------------------- tiện ích

        static void ReadOsInfo(out string os, out string kernel)
        {
            os = "Windows";
            kernel = Environment.OSVersion.Version.ToString();
            try
            {
                using (var k = Registry.LocalMachine.OpenSubKey(@"SOFTWARE\Microsoft\Windows NT\CurrentVersion"))
                {
                    if (k == null)
                        return;
                    string product = k.GetValue("ProductName") as string ?? "Windows";
                    string build = k.GetValue("CurrentBuild") as string ?? "0";
                    int.TryParse(build, out int buildNo);
                    // Windows 11 vẫn ghi "Windows 10" trong ProductName
                    if (buildNo >= 22000)
                        product = product.Replace("Windows 10", "Windows 11");
                    string ver = k.GetValue("DisplayVersion") as string ?? k.GetValue("ReleaseId") as string;
                    os = ver != null ? $"{product} {ver}" : product;
                    object major = k.GetValue("CurrentMajorVersionNumber") ?? 10;
                    object minor = k.GetValue("CurrentMinorVersionNumber") ?? 0;
                    object ubr = k.GetValue("UBR") ?? 0;
                    kernel = $"{major}.{minor}.{build}.{ubr}";
                }
            }
            catch { }
        }

        static string ShortCpuModel(string model)
        {
            string clean = Regex.Replace(model, @"\(R\)|\(TM\)|\bCPU\b|@.*$|\d+-Core Processor|Processor", "");
            clean = Regex.Replace(clean, @"\s+", " ").Trim();
            var m = Regex.Match(clean, @"(i[3579]-\w+|Ryzen \d+ \w+|Xeon [\w-]+(?: v\d)?|Core Ultra \d+ \w+|Core \d+ \w+)");
            return m.Success ? m.Groups[1].Value : clean;
        }

        static List<ManagementBaseObject> Wmi(string ns, string query)
        {
            try
            {
                using (var searcher = new ManagementObjectSearcher(new ManagementScope(ns), new ObjectQuery(query)))
                {
                    var list = new List<ManagementBaseObject>();
                    foreach (var o in searcher.Get())
                        list.Add(o);
                    return list;
                }
            }
            catch
            {
                return null;
            }
        }

        static void Push(ref double[] arr, double v)
        {
            int keep = Math.Min(arr.Length, HISTORY - 1);
            var next = new double[keep + 1];
            Array.Copy(arr, arr.Length - keep, next, 0, keep);
            next[keep] = v;
            arr = next;
        }

        static double Clamp(double v, double lo, double hi) => v < lo ? lo : v > hi ? hi : v;

        public void Dispose()
        {
            try
            {
                if (_nv != null && !_nv.HasExited)
                    _nv.Kill();
            }
            catch { }
            _nv = null;
            _pdh?.Dispose();
        }
    }
}
