// P/Invoke: cửa sổ layered, thông tin hệ thống, PDH, Job object.
using System;
using System.Runtime.InteropServices;

namespace SystemHud
{
    internal static class Native
    {
        // ------------------------------------------------------------ cửa sổ
        public const int WS_POPUP = unchecked((int)0x80000000);
        public const int WS_EX_TRANSPARENT = 0x00000020;
        public const int WS_EX_TOOLWINDOW = 0x00000080;
        public const int WS_EX_LAYERED = 0x00080000;
        public const int WS_EX_NOACTIVATE = 0x08000000;

        public const int WM_WINDOWPOSCHANGING = 0x0046;
        public const int WM_SETTINGCHANGE = 0x001A;
        public const int WM_DISPLAYCHANGE = 0x007E;
        public const int WM_DPICHANGED = 0x02E0;
        public const int WM_MOUSEACTIVATE = 0x0021;
        public const int MA_NOACTIVATE = 3;

        public const uint SWP_NOSIZE = 0x0001;
        public const uint SWP_NOMOVE = 0x0002;
        public const uint SWP_NOZORDER = 0x0004;
        public const uint SWP_NOACTIVATE = 0x0010;
        public static readonly IntPtr HWND_BOTTOM = new IntPtr(1);
        public const int GWLP_HWNDPARENT = -8;
        public const int SW_SHOWNOACTIVATE = 4;
        public const int ULW_ALPHA = 2;

        [StructLayout(LayoutKind.Sequential)]
        public struct POINT { public int X, Y; public POINT(int x, int y) { X = x; Y = y; } }

        [StructLayout(LayoutKind.Sequential)]
        public struct SIZE { public int CX, CY; public SIZE(int cx, int cy) { CX = cx; CY = cy; } }

        [StructLayout(LayoutKind.Sequential, Pack = 1)]
        public struct BLENDFUNCTION { public byte BlendOp, BlendFlags, SourceConstantAlpha, AlphaFormat; }

        [StructLayout(LayoutKind.Sequential)]
        public struct WINDOWPOS
        {
            public IntPtr hwnd, hwndInsertAfter;
            public int x, y, cx, cy;
            public uint flags;
        }

        [StructLayout(LayoutKind.Sequential)]
        public struct BITMAPINFOHEADER
        {
            public int biSize, biWidth, biHeight;
            public short biPlanes, biBitCount;
            public int biCompression, biSizeImage, biXPelsPerMeter, biYPelsPerMeter, biClrUsed, biClrImportant;
        }

        [DllImport("user32.dll", SetLastError = true)]
        public static extern bool UpdateLayeredWindow(IntPtr hwnd, IntPtr hdcDst, ref POINT pptDst, ref SIZE psize,
            IntPtr hdcSrc, ref POINT pptSrc, int crKey, ref BLENDFUNCTION pblend, int dwFlags);

        [DllImport("user32.dll")] public static extern IntPtr GetDC(IntPtr hwnd);
        [DllImport("user32.dll")] public static extern int ReleaseDC(IntPtr hwnd, IntPtr hdc);
        [DllImport("gdi32.dll")] public static extern IntPtr CreateCompatibleDC(IntPtr hdc);
        [DllImport("gdi32.dll")] public static extern bool DeleteDC(IntPtr hdc);
        [DllImport("gdi32.dll")] public static extern IntPtr SelectObject(IntPtr hdc, IntPtr obj);
        [DllImport("gdi32.dll")] public static extern bool DeleteObject(IntPtr obj);
        [DllImport("gdi32.dll")]
        public static extern IntPtr CreateDIBSection(IntPtr hdc, ref BITMAPINFOHEADER bmi, uint usage,
            out IntPtr bits, IntPtr section, uint offset);

        [DllImport("user32.dll", SetLastError = true)]
        public static extern bool SetWindowPos(IntPtr hwnd, IntPtr after, int x, int y, int cx, int cy, uint flags);
        [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hwnd, int cmd);
        [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern IntPtr FindWindow(string cls, string title);
        [DllImport("user32.dll", EntryPoint = "SetWindowLongPtrW")]
        public static extern IntPtr SetWindowLongPtr(IntPtr hwnd, int index, IntPtr value);
        [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int RegisterWindowMessage(string name);

        public const uint GW_HWNDPREV = 3;
        public const uint EVENT_SYSTEM_FOREGROUND = 0x0003;
        public const uint WINEVENT_OUTOFCONTEXT = 0x0000;

        public delegate void WinEventProc(IntPtr hook, uint ev, IntPtr hwnd, int idObject, int idChild, uint thread, uint time);

        [DllImport("user32.dll")]
        public static extern IntPtr SetWinEventHook(uint evMin, uint evMax, IntPtr module, WinEventProc proc, uint pid, uint tid, uint flags);
        [DllImport("user32.dll")] public static extern bool UnhookWinEvent(IntPtr hook);
        public const uint GW_HWNDNEXT = 2;
        [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr hwnd, uint cmd);
        [DllImport("user32.dll")] public static extern IntPtr GetTopWindow(IntPtr hwnd);
        [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hwnd);
        [DllImport("user32.dll", CharSet = CharSet.Unicode)]
        public static extern int GetClassName(IntPtr hwnd, System.Text.StringBuilder sb, int max);

        [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
        [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr value);

        // ------------------------------------------------------------ hệ thống
        [StructLayout(LayoutKind.Sequential)]
        public struct MEMORYSTATUSEX
        {
            public uint dwLength, dwMemoryLoad;
            public ulong ullTotalPhys, ullAvailPhys, ullTotalPageFile, ullAvailPageFile,
                ullTotalVirtual, ullAvailVirtual, ullAvailExtendedVirtual;
        }

        [DllImport("kernel32.dll")] public static extern bool GlobalMemoryStatusEx(ref MEMORYSTATUSEX m);

        [StructLayout(LayoutKind.Sequential)]
        public struct PERFORMANCE_INFORMATION
        {
            public uint cb;
            public UIntPtr CommitTotal, CommitLimit, CommitPeak, PhysicalTotal, PhysicalAvailable,
                SystemCache, KernelTotal, KernelPaged, KernelNonpaged, PageSize;
            public uint HandleCount, ProcessCount, ThreadCount;
        }

        [DllImport("psapi.dll")] public static extern bool GetPerformanceInfo(ref PERFORMANCE_INFORMATION pi, uint cb);

        [DllImport("kernel32.dll")] public static extern bool GetSystemTimes(out long idle, out long kernel, out long user);
        [DllImport("kernel32.dll")] public static extern ulong GetTickCount64();
        [DllImport("kernel32.dll")] public static extern uint GetActiveProcessorCount(ushort group);

        [StructLayout(LayoutKind.Sequential)]
        public struct SYSTEM_PROCESSOR_PERFORMANCE_INFORMATION
        {
            public long IdleTime, KernelTime, UserTime, DpcTime, InterruptTime;
            public uint InterruptCount;
        }

        [DllImport("ntdll.dll")]
        public static extern int NtQuerySystemInformation(int cls, IntPtr buffer, int length, out int returned);

        [DllImport("iphlpapi.dll")] public static extern int GetBestInterface(uint destAddr, out uint index);

        // ------------------------------------------------------------ PDH
        public const uint PDH_FMT_DOUBLE = 0x00000200;
        public const uint PDH_FMT_NOCAP100 = 0x00008000;
        public const int PDH_MORE_DATA = unchecked((int)0x800007D2);

        [StructLayout(LayoutKind.Sequential)]
        public struct PDH_FMT_COUNTERVALUE
        {
            public uint CStatus;
            public double doubleValue; // union, được canh lề 8 byte
        }

        [StructLayout(LayoutKind.Sequential)]
        public struct PDH_FMT_COUNTERVALUE_ITEM
        {
            public IntPtr szName;
            public PDH_FMT_COUNTERVALUE FmtValue;
        }

        [DllImport("pdh.dll", CharSet = CharSet.Unicode)]
        public static extern int PdhOpenQuery(string source, IntPtr user, out IntPtr query);
        [DllImport("pdh.dll", CharSet = CharSet.Unicode)]
        public static extern int PdhAddEnglishCounter(IntPtr query, string path, IntPtr user, out IntPtr counter);
        [DllImport("pdh.dll")] public static extern int PdhCollectQueryData(IntPtr query);
        [DllImport("pdh.dll")]
        public static extern int PdhGetFormattedCounterValue(IntPtr counter, uint format, IntPtr type, out PDH_FMT_COUNTERVALUE value);
        [DllImport("pdh.dll", CharSet = CharSet.Unicode)]
        public static extern int PdhGetFormattedCounterArray(IntPtr counter, uint format, ref uint bufferSize, out uint itemCount, IntPtr buffer);
        [DllImport("pdh.dll")] public static extern int PdhCloseQuery(IntPtr query);

        // ------------------------------------------------------------ Job object
        // Gắn tiến trình con (nvidia-smi) vào job: HUD thoát/crash thì con chết theo.
        [StructLayout(LayoutKind.Sequential)]
        public struct JOBOBJECT_BASIC_LIMIT_INFORMATION
        {
            public long PerProcessUserTimeLimit, PerJobUserTimeLimit;
            public uint LimitFlags;
            public UIntPtr MinimumWorkingSetSize, MaximumWorkingSetSize;
            public uint ActiveProcessLimit;
            public UIntPtr Affinity;
            public uint PriorityClass, SchedulingClass;
        }

        [StructLayout(LayoutKind.Sequential)]
        public struct IO_COUNTERS
        {
            public ulong ReadOperationCount, WriteOperationCount, OtherOperationCount,
                ReadTransferCount, WriteTransferCount, OtherTransferCount;
        }

        [StructLayout(LayoutKind.Sequential)]
        public struct JOBOBJECT_EXTENDED_LIMIT_INFORMATION
        {
            public JOBOBJECT_BASIC_LIMIT_INFORMATION BasicLimitInformation;
            public IO_COUNTERS IoInfo;
            public UIntPtr ProcessMemoryLimit, JobMemoryLimit, PeakProcessMemoryUsed, PeakJobMemoryUsed;
        }

        public const uint JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x2000;
        public const int JobObjectExtendedLimitInformation = 9;

        [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] public static extern IntPtr CreateJobObject(IntPtr attrs, string name);
        [DllImport("kernel32.dll")]
        public static extern bool SetInformationJobObject(IntPtr job, int cls, ref JOBOBJECT_EXTENDED_LIMIT_INFORMATION info, int length);
        [DllImport("kernel32.dll")] public static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
    }
}
