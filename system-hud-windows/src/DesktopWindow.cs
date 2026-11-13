// Cửa sổ layered trong suốt từng pixel, gắn vào desktop:
// - chủ sở hữu là Progman (desktop) -> Win+D không giấu HUD, HUD không bao giờ nổi lên trên cửa sổ khác
// - luôn nằm đáy z-order, không nhận chuột/bàn phím, không hiện trên taskbar / Alt+Tab
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using System.Windows.Forms;

namespace SystemHud
{
    // Bitmap 32bpp premultiplied nằm trực tiếp trong DIB section: GDI+ vẽ vào, UpdateLayeredWindow đọc ra, không copy
    internal sealed class Surface : IDisposable
    {
        public readonly int Width, Height;
        public readonly Bitmap Bitmap;
        public IntPtr Hdc { get; private set; }
        IntPtr _hbmp, _old;

        public Surface(int w, int h)
        {
            Width = w;
            Height = h;
            var bmi = new Native.BITMAPINFOHEADER
            {
                biSize = Marshal.SizeOf(typeof(Native.BITMAPINFOHEADER)),
                biWidth = w,
                biHeight = -h, // top-down
                biPlanes = 1,
                biBitCount = 32,
            };
            IntPtr screen = Native.GetDC(IntPtr.Zero);
            Hdc = Native.CreateCompatibleDC(screen);
            _hbmp = Native.CreateDIBSection(screen, ref bmi, 0, out IntPtr bits, IntPtr.Zero, 0);
            Native.ReleaseDC(IntPtr.Zero, screen);
            _old = Native.SelectObject(Hdc, _hbmp);
            Bitmap = new Bitmap(w, h, w * 4, PixelFormat.Format32bppPArgb, bits);
        }

        public void Dispose()
        {
            Bitmap.Dispose();
            if (Hdc != IntPtr.Zero)
            {
                Native.SelectObject(Hdc, _old);
                Native.DeleteObject(_hbmp);
                Native.DeleteDC(Hdc);
                Hdc = IntPtr.Zero;
            }
        }
    }

    internal sealed class DesktopWindow : NativeWindow, IDisposable
    {
        public event Action EnvironmentChanged;   // đổi độ phân giải, DPI, taskbar, Explorer khởi động lại
        readonly int _taskbarCreated;
        bool _shown, _placing;
        readonly Native.WinEventProc _onForeground; // giữ tham chiếu để GC không thu hồi callback
        readonly IntPtr _hook;
        readonly Timer _watch = new Timer { Interval = 300 };
        bool _raised;

        public DesktopWindow()
        {
            _taskbarCreated = Native.RegisterWindowMessage("TaskbarCreated");
            CreateHandle(new CreateParams
            {
                Caption = "System HUD",
                Style = Native.WS_POPUP,
                ExStyle = Native.WS_EX_LAYERED | Native.WS_EX_TRANSPARENT | Native.WS_EX_TOOLWINDOW | Native.WS_EX_NOACTIVATE,
            });
            AttachToDesktop();

            // Win+D / Show Desktop đưa một lớp WorkerW (hình nền + icon) lên trên mọi cửa sổ thường.
            // Không có sự kiện đáng tin cho việc này, nên dò z-order định kỳ (rẻ: vài trăm lần GetWindow)
            // và phản ứng thêm ngay khi cửa sổ focus đổi.
            _onForeground = (h, ev, hwnd, idObj, idChild, thread, time) => CheckDesktopLayer();
            _hook = Native.SetWinEventHook(Native.EVENT_SYSTEM_FOREGROUND, Native.EVENT_SYSTEM_FOREGROUND,
                IntPtr.Zero, _onForeground, 0, 0, Native.WINEVENT_OUTOFCONTEXT);
            _watch.Tick += (_, __) => CheckDesktopLayer();
            _watch.Start();
        }

        static string ClassOf(IntPtr hwnd)
        {
            var sb = new System.Text.StringBuilder(64);
            Native.GetClassName(hwnd, sb, sb.Capacity);
            return sb.ToString();
        }

        static readonly string LogPath = Environment.GetEnvironmentVariable("SYSTEMHUD_LOG");

        internal static void Log(string msg)
        {
            if (string.IsNullOrEmpty(LogPath))
                return;
            try { System.IO.File.AppendAllText(LogPath, $"{DateTime.Now:HH:mm:ss.fff} {msg}\r\n"); }
            catch { }
        }

        // Lớp desktop (WorkerW hiện) nằm trên HUD -> đang Show Desktop: đặt HUD ngay trên lớp đó.
        // Hết Show Desktop -> trả HUD về đáy để không đè lên các cửa sổ vừa khôi phục.
        void CheckDesktopLayer()
        {
            IntPtr raised = IntPtr.Zero;
            for (IntPtr h = Native.GetTopWindow(IntPtr.Zero); h != IntPtr.Zero && h != Handle; h = Native.GetWindow(h, Native.GW_HWNDNEXT))
            {
                if (Native.IsWindowVisible(h) && ClassOf(h) == "WorkerW")
                {
                    raised = h;
                    break;
                }
            }
            if (raised != IntPtr.Zero)
            {
                PlaceAbove(raised);
                _raised = true;
            }
            else if (_raised && IsBelowDesktopLayer() == false)
            {
                // HUD đang nằm trên lớp desktop vừa hạ xuống: về đáy
                Log("desktop layer lowered");
                _raised = false;
                SendToBottom();
            }
        }

        // HUD đã ở ngay trên lớp desktop dưới đáy chưa (cửa sổ kế dưới là WorkerW/Progman)?
        bool IsBelowDesktopLayer()
        {
            IntPtr next = Native.GetWindow(Handle, Native.GW_HWNDNEXT);
            string cls = next == IntPtr.Zero ? "" : ClassOf(next);
            return cls == "WorkerW" || cls == "Progman";
        }

        // Đặt HUD ngay trên `target` trong z-order (chèn sau cửa sổ đang nằm trên target)
        void PlaceAbove(IntPtr target)
        {
            IntPtr prev = Native.GetWindow(target, Native.GW_HWNDPREV);
            if (prev == Handle)
                return;
            _placing = true;
            try
            {
                bool ok = Native.SetWindowPos(Handle, prev == IntPtr.Zero ? IntPtr.Zero : prev, 0, 0, 0, 0,
                    Native.SWP_NOMOVE | Native.SWP_NOSIZE | Native.SWP_NOACTIVATE);
                Log($"PlaceAbove target={target} prev={prev} ok={ok} err={Marshal.GetLastWin32Error()} above={Native.GetWindow(Handle, 2)}");
            }
            finally
            {
                _placing = false;
            }
        }

        void AttachToDesktop()
        {
            IntPtr progman = Native.FindWindow("Progman", null);
            Native.SetWindowLongPtr(Handle, Native.GWLP_HWNDPARENT, progman);
        }

        public void Present(Surface s, int x, int y)
        {
            IntPtr screen = Native.GetDC(IntPtr.Zero);
            try
            {
                var dst = new Native.POINT(x, y);
                var size = new Native.SIZE(s.Width, s.Height);
                var src = new Native.POINT(0, 0);
                var blend = new Native.BLENDFUNCTION { BlendOp = 0, BlendFlags = 0, SourceConstantAlpha = 255, AlphaFormat = 1 };
                Native.UpdateLayeredWindow(Handle, screen, ref dst, ref size, s.Hdc, ref src, 0, ref blend, Native.ULW_ALPHA);
            }
            finally
            {
                Native.ReleaseDC(IntPtr.Zero, screen);
            }
            if (!_shown)
            {
                Native.ShowWindow(Handle, Native.SW_SHOWNOACTIVATE);
                SendToBottom();
                _shown = true;
            }
        }

        public void SendToBottom() =>
            Native.SetWindowPos(Handle, Native.HWND_BOTTOM, 0, 0, 0, 0, Native.SWP_NOMOVE | Native.SWP_NOSIZE | Native.SWP_NOACTIVATE);

        protected override void WndProc(ref Message m)
        {
            switch (m.Msg)
            {
                case Native.WM_WINDOWPOSCHANGING:
                    // ai muốn kéo HUD lên trên (click desktop, Alt+Tab...) đều bị đẩy về đáy
                    var wp = (Native.WINDOWPOS)Marshal.PtrToStructure(m.LParam, typeof(Native.WINDOWPOS));
                    if (!_placing && (wp.flags & Native.SWP_NOZORDER) == 0)
                    {
                        wp.hwndInsertAfter = Native.HWND_BOTTOM;
                        Marshal.StructureToPtr(wp, m.LParam, false);
                    }
                    break;
                case Native.WM_MOUSEACTIVATE:
                    m.Result = (IntPtr)Native.MA_NOACTIVATE;
                    return;
                case Native.WM_DISPLAYCHANGE:
                case Native.WM_SETTINGCHANGE:
                case Native.WM_DPICHANGED:
                    EnvironmentChanged?.Invoke();
                    break;
                default:
                    if (m.Msg == _taskbarCreated)
                    {
                        // Explorer khởi động lại: Progman mới -> gắn lại
                        AttachToDesktop();
                        SendToBottom();
                        EnvironmentChanged?.Invoke();
                    }
                    break;
            }
            base.WndProc(ref m);
        }

        public void Dispose()
        {
            if (_hook != IntPtr.Zero)
                Native.UnhookWinEvent(_hook);
            _watch.Dispose();
            DestroyHandle();
        }
    }
}
