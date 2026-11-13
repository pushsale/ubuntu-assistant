// Điều phối: lấy mẫu số liệu (luồng nền), hiệu ứng, vẽ, vị trí trên màn hình, khay hệ thống.
using System;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.Linq;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;

namespace SystemHud
{
    internal sealed class HudApp : ApplicationContext
    {
        const string RunKey = @"Software\Microsoft\Windows\CurrentVersion\Run";
        const string RunName = "SystemHud";

        readonly string _cfgPath;
        HudConfig _cfg;
        readonly Sensors _sensors = new Sensors();
        readonly Animator _anim;
        readonly DesktopWindow _win;
        readonly Control _ui;                       // để chuyển việc từ luồng nền về luồng giao diện
        readonly System.Threading.Timer _sampleTimer;
        readonly System.Windows.Forms.Timer _frameTimer = new System.Windows.Forms.Timer();
        readonly System.Windows.Forms.Timer _reloadTimer = new System.Windows.Forms.Timer { Interval = 300 };
        readonly FileSystemWatcher _watcher;
        readonly NotifyIcon _tray;
        readonly Stopwatch _clock = Stopwatch.StartNew();
        Surface _surface;
        Rectangle _bounds;
        HudState _display;
        int _busy, _samples;

        public HudApp()
        {
            _cfgPath = HudConfig.PathFor();
            _cfg = HudConfig.Load(_cfgPath);
            _anim = new Animator(_cfg.AnimMs);

            _ui = new Control();
            _ui.CreateControl();
            _ = _ui.Handle;

            _win = new DesktopWindow();
            _win.EnvironmentChanged += () => _ui.BeginInvoke((Action)Relayout);
            SystemEvents.DisplaySettingsChanged += OnDisplayChanged;

            _frameTimer.Tick += (_, __) => OnFrame();
            _reloadTimer.Tick += (_, __) => { _reloadTimer.Stop(); ReloadConfig(); };

            try
            {
                _watcher = new FileSystemWatcher(Path.GetDirectoryName(_cfgPath), Path.GetFileName(_cfgPath))
                {
                    NotifyFilter = NotifyFilters.LastWrite | NotifyFilters.FileName | NotifyFilters.Size,
                    EnableRaisingEvents = true,
                };
                FileSystemEventHandler h = (_, __) => _ui.BeginInvoke((Action)(() => { _reloadTimer.Stop(); _reloadTimer.Start(); }));
                _watcher.Changed += h;
                _watcher.Created += h;
                _watcher.Renamed += (s, e) => h(s, e);
            }
            catch
            {
                _watcher = null;
            }

            _tray = new NotifyIcon { Icon = MakeIcon(), Text = "System HUD", Visible = true, ContextMenuStrip = BuildMenu() };

            ApplyAutostart();
            Relayout();
            _sampleTimer = new System.Threading.Timer(_ => Sample(), null, 0, Timeout.Infinite);
        }

        double Now => _clock.Elapsed.TotalMilliseconds;

        // ------------------------------------------------------------ lấy mẫu

        void Sample()
        {
            if (Interlocked.Exchange(ref _busy, 1) == 1)
                return;
            double started = Now;
            try
            {
                _sensors.Update();
                var snap = _sensors.Snapshot();
                _ui.BeginInvoke((Action)(() => OnSample(snap)));
            }
            catch (Exception e)
            {
                Trace.WriteLine($"[system-hud] lỗi lấy mẫu: {e}");
            }
            finally
            {
                Interlocked.Exchange(ref _busy, 0);
                // mẫu đầu chưa có số tải CPU/tốc độ (cần 2 lần đọc): lấy mẫu thứ hai sớm sau 1 giây.
                // Các mẫu sau cách đều IntervalMs (trừ thời gian đọc cảm biến) để hiệu ứng animMs = intervalMs nối liền.
                int period = ++_samples == 1 ? 1000 : Math.Max(500, _cfg.IntervalMs);
                int next = Math.Max(50, period - (int)(Now - started));
                try { _sampleTimer?.Change(next, Timeout.Infinite); }
                catch (ObjectDisposedException) { }
            }
        }

        void OnSample(HudState state)
        {
            _anim.Duration = _cfg.AnimMs;
            _anim.Push(state, Now);
            _display = _anim.Frame(Now);
            Render();
            if (_cfg.AnimMs > 0 && !_frameTimer.Enabled)
            {
                _frameTimer.Interval = Math.Max(1, 1000 / Math.Max(1, _cfg.Fps));
                _frameTimer.Start();
            }
        }

        void OnFrame()
        {
            _display = _anim.Frame(Now);
            Render();
            if (!_anim.Running)
                _frameTimer.Stop();
        }

        // ------------------------------------------------------------ vẽ + vị trí

        void Render()
        {
            if (_display == null || _bounds.Width <= 0 || _bounds.Height <= 0)
                return;
            if (_surface == null || _surface.Width != _bounds.Width || _surface.Height != _bounds.Height)
            {
                _surface?.Dispose();
                _surface = new Surface(_bounds.Width, _bounds.Height);
            }
            try
            {
                using (var g = Graphics.FromImage(_surface.Bitmap))
                    Hud.Draw(g, _surface.Width, _surface.Height, _display, _cfg.Theme);
                _win.Present(_surface, _bounds.X, _bounds.Y);
            }
            catch (Exception e)
            {
                Trace.WriteLine($"[system-hud] lỗi khi vẽ: {e}");
            }
        }

        Screen PickScreen()
        {
            var all = Screen.AllScreens;
            switch (_cfg.Monitor)
            {
                case int i when i >= 0 && i < all.Length:
                    return all[i];
                case string s when s == "secondary":
                    return all.FirstOrDefault(x => !x.Primary) ?? Screen.PrimaryScreen;
                default:
                    return Screen.PrimaryScreen;
            }
        }

        void Relayout()
        {
            var scr = PickScreen();
            var wa = scr.WorkingArea; // đã trừ taskbar
            int gap = _cfg.Gap;
            int width = (int)Math.Round(scr.Bounds.Width * _cfg.WidthFraction) - gap * 2;
            int x = _cfg.Side == "left" ? wa.Left + gap : wa.Right - width - gap;
            int y = wa.Top + gap;
            int height = wa.Bottom - y - gap;
            _bounds = new Rectangle(x, y, Math.Max(50, width), Math.Max(50, height));
            Render();
        }

        void OnDisplayChanged(object sender, EventArgs e)
        {
            if (_ui.IsHandleCreated)
                _ui.BeginInvoke((Action)Relayout);
        }

        void ReloadConfig()
        {
            _cfg = HudConfig.Load(_cfgPath);
            _anim.Duration = _cfg.AnimMs;
            if (_frameTimer.Enabled)
                _frameTimer.Interval = Math.Max(1, 1000 / Math.Max(1, _cfg.Fps));
            ApplyAutostart();
            Relayout();
        }

        void Change(Action<HudConfig> edit)
        {
            edit(_cfg);
            try { _cfg.Save(_cfgPath); }
            catch { }
            ReloadConfig();
        }

        // ------------------------------------------------------------ khay hệ thống

        ContextMenuStrip BuildMenu()
        {
            var menu = new ContextMenuStrip();
            var themeDark = new ToolStripMenuItem("Giao diện tối (Orbital)", null, (_, __) => Change(c => c.Theme = "orbital"));
            var themeLight = new ToolStripMenuItem("Giao diện sáng (Orbital Light)", null, (_, __) => Change(c => c.Theme = "orbitalLight"));
            var left = new ToolStripMenuItem("Đặt bên trái", null, (_, __) => Change(c => c.Side = "left"));
            var right = new ToolStripMenuItem("Đặt bên phải", null, (_, __) => Change(c => c.Side = "right"));
            var primary = new ToolStripMenuItem("Màn hình chính", null, (_, __) => Change(c => c.Monitor = "primary"));
            var secondary = new ToolStripMenuItem("Màn hình phụ", null, (_, __) => Change(c => c.Monitor = "secondary"));
            var autostart = new ToolStripMenuItem("Khởi động cùng Windows", null, (_, __) => Change(c => c.Autostart = !IsAutostart()));
            var openCfg = new ToolStripMenuItem("Mở config.json", null, (_, __) => OpenConfig());
            var exit = new ToolStripMenuItem("Thoát", null, (_, __) => ExitThread());

            menu.Items.AddRange(new ToolStripItem[]
            {
                themeDark, themeLight, new ToolStripSeparator(),
                left, right, new ToolStripSeparator(),
                primary, secondary, new ToolStripSeparator(),
                autostart, openCfg, new ToolStripSeparator(), exit,
            });
            menu.Opening += (_, __) =>
            {
                themeDark.Checked = _cfg.Theme == "orbital";
                themeLight.Checked = _cfg.Theme == "orbitalLight";
                left.Checked = _cfg.Side == "left";
                right.Checked = _cfg.Side != "left";
                bool second = _cfg.Monitor is string s && s == "secondary";
                primary.Checked = !second;
                secondary.Checked = second;
                secondary.Enabled = Screen.AllScreens.Length > 1;
                autostart.Checked = IsAutostart();
            };
            return menu;
        }

        static bool IsAutostart()
        {
            using (var k = Registry.CurrentUser.OpenSubKey(RunKey))
                return k?.GetValue(RunName) is string;
        }

        // Đồng bộ mục Run theo config.autostart. Ghi lại cả khi exe đã đổi chỗ (copy sang thư mục khác)
        // để lần đăng nhập sau chạy đúng bản đang dùng. Không cần quyền admin (HKCU).
        void ApplyAutostart()
        {
            try
            {
                using (var k = Registry.CurrentUser.CreateSubKey(RunKey))
                {
                    string want = $"\"{Application.ExecutablePath}\"";
                    if (_cfg.Autostart)
                    {
                        if (k.GetValue(RunName) as string != want)
                            k.SetValue(RunName, want);
                    }
                    else if (k.GetValue(RunName) != null)
                        k.DeleteValue(RunName, false);
                }
            }
            catch (Exception e)
            {
                Trace.WriteLine($"[system-hud] không ghi được mục khởi động: {e.Message}");
            }
        }

        void OpenConfig()
        {
            try { Process.Start(new ProcessStartInfo("notepad.exe", $"\"{_cfgPath}\"") { UseShellExecute = true }); }
            catch { }
        }

        static Icon MakeIcon()
        {
            using (var bmp = new Bitmap(32, 32))
            {
                using (var g = Graphics.FromImage(bmp))
                {
                    g.SmoothingMode = SmoothingMode.AntiAlias;
                    using (var bg = new SolidBrush(Color.FromArgb(255, 23, 43, 92)))
                        g.FillEllipse(bg, 1, 1, 30, 30);
                    using (var ring = new Pen(Color.FromArgb(90, 255, 255, 255), 2.5f))
                        g.DrawEllipse(ring, 6, 6, 20, 20);
                    using (var arc = new Pen(Color.FromArgb(255, 89, 219, 255), 3.5f) { StartCap = LineCap.Round, EndCap = LineCap.Round })
                        g.DrawArc(arc, 6, 6, 20, 20, -90, 250);
                }
                return Icon.FromHandle(bmp.GetHicon());
            }
        }

        protected override void ExitThreadCore()
        {
            SystemEvents.DisplaySettingsChanged -= OnDisplayChanged;
            _sampleTimer.Dispose();
            _frameTimer.Stop();
            _watcher?.Dispose();
            _tray.Visible = false;
            _tray.Dispose();
            _sensors.Dispose();
            _win.Dispose();
            _surface?.Dispose();
            base.ExitThreadCore();
        }
    }
}
