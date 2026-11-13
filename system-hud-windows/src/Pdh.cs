// Bộ đếm hiệu năng (Performance Data Helper) theo tên tiếng Anh: chạy được trên
// Windows mọi ngôn ngữ (PerformanceCounter của .NET dùng tên đã bản địa hoá).
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;

namespace SystemHud
{
    internal sealed class Pdh : IDisposable
    {
        IntPtr _query;
        readonly Dictionary<string, IntPtr> _counters = new Dictionary<string, IntPtr>();

        public Pdh()
        {
            if (Native.PdhOpenQuery(null, IntPtr.Zero, out _query) != 0)
                _query = IntPtr.Zero;
        }

        public bool Add(string key, string englishPath)
        {
            if (_query == IntPtr.Zero)
                return false;
            if (Native.PdhAddEnglishCounter(_query, englishPath, IntPtr.Zero, out var c) != 0)
                return false;
            _counters[key] = c;
            return true;
        }

        public bool Has(string key) => _counters.ContainsKey(key);

        public void Collect()
        {
            if (_query != IntPtr.Zero)
                Native.PdhCollectQueryData(_query);
        }

        public double? Get(string key)
        {
            if (!_counters.TryGetValue(key, out var c))
                return null;
            if (Native.PdhGetFormattedCounterValue(c, Native.PDH_FMT_DOUBLE | Native.PDH_FMT_NOCAP100, IntPtr.Zero, out var v) != 0)
                return null;
            if (v.CStatus != 0 && v.CStatus != 1) // PDH_CSTATUS_VALID_DATA / NEW_DATA
                return null;
            return v.doubleValue;
        }

        // Bộ đếm có wildcard (*): trả về (tên instance, giá trị)
        public List<KeyValuePair<string, double>> GetArray(string key)
        {
            var list = new List<KeyValuePair<string, double>>();
            if (!_counters.TryGetValue(key, out var c))
                return list;
            uint size = 0;
            int rc = Native.PdhGetFormattedCounterArray(c, Native.PDH_FMT_DOUBLE | Native.PDH_FMT_NOCAP100, ref size, out uint count, IntPtr.Zero);
            if (rc != Native.PDH_MORE_DATA || size == 0)
                return list;
            IntPtr buf = Marshal.AllocHGlobal((int)size);
            try
            {
                rc = Native.PdhGetFormattedCounterArray(c, Native.PDH_FMT_DOUBLE | Native.PDH_FMT_NOCAP100, ref size, out count, buf);
                if (rc != 0)
                    return list;
                int itemSize = Marshal.SizeOf(typeof(Native.PDH_FMT_COUNTERVALUE_ITEM));
                for (int i = 0; i < count; i++)
                {
                    var item = (Native.PDH_FMT_COUNTERVALUE_ITEM)Marshal.PtrToStructure(buf + i * itemSize, typeof(Native.PDH_FMT_COUNTERVALUE_ITEM));
                    if (item.FmtValue.CStatus != 0 && item.FmtValue.CStatus != 1)
                        continue;
                    list.Add(new KeyValuePair<string, double>(Marshal.PtrToStringUni(item.szName), item.FmtValue.doubleValue));
                }
            }
            finally
            {
                Marshal.FreeHGlobal(buf);
            }
            return list;
        }

        public void Dispose()
        {
            if (_query != IntPtr.Zero)
                Native.PdhCloseQuery(_query);
            _query = IntPtr.Zero;
        }
    }
}
