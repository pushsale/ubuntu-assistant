using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Threading;
using System.Windows.Forms;

namespace SystemHud
{
    internal static class Program
    {
        [STAThread]
        static int Main(string[] args)
        {
            // Per-monitor DPI v2 (đã khai báo trong manifest; gọi lại phòng khi manifest bị bỏ qua)
            try { Native.SetProcessDpiAwarenessContext(new IntPtr(-4)); }
            catch { try { Native.SetProcessDPIAware(); } catch { } }

            if (args.Length > 0 && args[0] == "--preview")
                return Preview(args);
            if (args.Length > 0 && args[0] == "--bench")
                return Bench(args);

            using (var mutex = new Mutex(true, @"Local\SystemHud.SingleInstance", out bool created))
            {
                if (!created)
                    return 0; // đã có một HUD đang chạy
                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);
                Application.Run(new HudApp());
            }
            return 0;
        }

        // Đo thời gian vẽ: SystemHud.exe --bench <file-kết-quả.txt> [số-khung=150]
        static int Bench(string[] args)
        {
            string output = args.Length > 1 ? args[1] : "hud-bench.txt";
            int frames = args.Length > 2 ? int.Parse(args[2]) : 150;
            using (var sensors = new Sensors())
            {
                sensors.Update();
                Thread.Sleep(1000);
                sensors.Update();
                var a = sensors.Snapshot();
                Thread.Sleep(1000);
                sensors.Update();
                var b = sensors.Snapshot();
                var anim = new Animator(3000);
                anim.Push(a, 0);
                anim.Push(b, 0);
                using (var surf = new Surface(456, 1016))
                {
                    var sw = System.Diagnostics.Stopwatch.StartNew();
                    double first = 0, interp = 0;
                    Hud.Profile = new double[6];
                    for (int i = 0; i < frames; i++)
                    {
                        double t0 = sw.Elapsed.TotalMilliseconds;
                        var st = anim.Frame(i * 3000.0 / frames);
                        interp += sw.Elapsed.TotalMilliseconds - t0;
                        using (var g = Graphics.FromImage(surf.Bitmap))
                            Hud.Draw(g, surf.Width, surf.Height, st, "orbital");
                        if (i == 0)
                        {
                            first = sw.Elapsed.TotalMilliseconds;
                            Hud.Profile = new double[6];
                            interp = 0;
                        }
                    }
                    double total = sw.Elapsed.TotalMilliseconds;
                    int n = Math.Max(1, frames - 1);
                    System.IO.File.WriteAllText(output,
                        $"first={first:F1}ms avg(rest)={(total - first) / n:F2}ms frames={frames} interp={interp / n:F2}ms " +
                        $"sections(header,cpu,mem,gpu,disk,net)={string.Join(" ", Array.ConvertAll(Hud.Profile, v => (v / n).ToString("F2")))}\r\n");
                }
            }
            return 0;
        }

        // Render ảnh xem trước bằng số liệu thật (tương đương tools/preview.js):
        // SystemHud.exe --preview <file.png> [số-giây-lấy-mẫu=6] [theme=orbital] [rộng=456] [cao=1016]
        static int Preview(string[] args)
        {
            string output = args.Length > 1 ? args[1] : "hud-preview.png";
            int seconds = args.Length > 2 ? int.Parse(args[2]) : 6;
            string theme = args.Length > 3 ? args[3] : "orbital";
            int w = args.Length > 4 ? int.Parse(args[4]) : 456;
            int h = args.Length > 5 ? int.Parse(args[5]) : 1016;

            using (var sensors = new Sensors())
            {
                for (int i = 0; i <= seconds; i++)
                {
                    sensors.Update();
                    if (i < seconds)
                        Thread.Sleep(1000);
                }
                var state = sensors.Snapshot();
                using (var hud = new Bitmap(w, h, PixelFormat.Format32bppPArgb))
                using (var outBmp = new Bitmap(w + 40, h + 40, PixelFormat.Format32bppArgb))
                {
                    using (var g = Graphics.FromImage(hud))
                        Hud.Draw(g, w, h, state, theme);
                    using (var g = Graphics.FromImage(outBmp))
                    {
                        // nền giả lập hình nền desktop
                        bool light = theme == "orbitalLight";
                        using (var bg = new LinearGradientBrush(new Point(0, 0), new Point(w + 40, h + 40),
                                   light ? Color.FromArgb(180, 200, 230) : Color.FromArgb(40, 30, 80),
                                   light ? Color.FromArgb(120, 150, 200) : Color.FromArgb(70, 40, 110)))
                            g.FillRectangle(bg, 0, 0, w + 40, h + 40);
                        g.DrawImageUnscaled(hud, 20, 20);
                    }
                    outBmp.Save(output, ImageFormat.Png);
                }
            }
            return 0;
        }
    }
}
