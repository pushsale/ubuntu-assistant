// config.json: cùng khoá với bản Ubuntu. Sửa file là HUD áp dụng ngay.
using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Text;
using System.Web.Script.Serialization;

namespace SystemHud
{
    public sealed class HudConfig
    {
        public string Theme = "orbital";       // orbital | orbitalLight
        public object Monitor = "primary";     // "primary" | "secondary" | số thứ tự màn hình (0, 1, ...)
        public string Side = "right";          // left | right (Windows: mặc định phải, tránh đè icon desktop bên trái)
        public double WidthFraction = 0.25;    // tỉ lệ chiều rộng so với màn hình được chọn
        public int Gap = 12;                   // khoảng cách tới mép màn hình / taskbar
        public int IntervalMs = 3000;          // chu kỳ lấy mẫu số liệu
        public int AnimMs = 3000;              // thời gian hiệu ứng chuyển số liệu (0 = tắt); bằng IntervalMs = chuyển liên tục
        public int Fps = 10;                   // khung hình/giây trong lúc chạy hiệu ứng (càng cao càng tốn CPU)
        public bool Autostart = true;          // tự chạy khi đăng nhập Windows (HKCU\...\Run\SystemHud)

        public static string PathFor()
        {
            // Mặc định cạnh file exe (bản portable); thư mục không ghi được (vd Program Files) thì dùng %APPDATA%
            string local = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "config.json");
            if (File.Exists(local) || CanWrite(AppDomain.CurrentDomain.BaseDirectory))
                return local;
            string dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "SystemHud");
            Directory.CreateDirectory(dir);
            return Path.Combine(dir, "config.json");
        }

        static bool CanWrite(string dir)
        {
            try
            {
                string probe = Path.Combine(dir, ".write-test");
                File.WriteAllText(probe, "");
                File.Delete(probe);
                return true;
            }
            catch
            {
                return false;
            }
        }

        public static HudConfig Load(string path)
        {
            var cfg = new HudConfig();
            if (!File.Exists(path))
            {
                cfg.Save(path);
                return cfg;
            }
            try
            {
                var d = new JavaScriptSerializer().DeserializeObject(File.ReadAllText(path, Encoding.UTF8)) as Dictionary<string, object>;
                if (d == null)
                    return cfg;
                if (d.TryGetValue("theme", out var v) && v is string th && Hud.Themes.ContainsKey(th)) cfg.Theme = th;
                if (d.TryGetValue("monitor", out v) && v != null) cfg.Monitor = v;
                if (d.TryGetValue("side", out v) && v is string sd) cfg.Side = sd == "left" ? "left" : "right";
                if (d.TryGetValue("widthFraction", out v)) cfg.WidthFraction = Clamp(Num(v, cfg.WidthFraction), 0.1, 1);
                if (d.TryGetValue("gap", out v)) cfg.Gap = (int)Clamp(Num(v, cfg.Gap), 0, 400);
                if (d.TryGetValue("intervalMs", out v)) cfg.IntervalMs = (int)Clamp(Num(v, cfg.IntervalMs), 500, 600000);
                if (d.TryGetValue("animMs", out v)) cfg.AnimMs = (int)Clamp(Num(v, cfg.AnimMs), 0, 10000);
                if (d.TryGetValue("fps", out v)) cfg.Fps = (int)Clamp(Num(v, cfg.Fps), 1, 120);
                if (d.TryGetValue("autostart", out v) && v is bool au) cfg.Autostart = au;
                // file của bản cũ thiếu khoá mới -> ghi bổ sung để người dùng thấy và sửa được
                if (!d.ContainsKey("autostart"))
                    cfg.Save(path);
            }
            catch
            {
                // JSON lỗi (đang sửa dở): dùng mặc định cho tới lần lưu sau
            }
            return cfg;
        }

        public void Save(string path)
        {
            var inv = CultureInfo.InvariantCulture;
            string monitor = Monitor is string ms ? $"\"{ms}\"" : Convert.ToString(Monitor, inv);
            var sb = new StringBuilder();
            sb.Append("{\n");
            sb.Append($"  \"theme\": \"{Theme}\",\n");
            sb.Append($"  \"monitor\": {monitor},\n");
            sb.Append($"  \"side\": \"{Side}\",\n");
            sb.Append($"  \"widthFraction\": {WidthFraction.ToString(inv)},\n");
            sb.Append($"  \"gap\": {Gap},\n");
            sb.Append($"  \"intervalMs\": {IntervalMs},\n");
            sb.Append($"  \"animMs\": {AnimMs},\n");
            sb.Append($"  \"fps\": {Fps},\n");
            sb.Append($"  \"autostart\": {(Autostart ? "true" : "false")}\n");
            sb.Append("}\n");
            File.WriteAllText(path, sb.ToString(), new UTF8Encoding(false));
        }

        static double Num(object v, double fallback)
        {
            try { return Convert.ToDouble(v, CultureInfo.InvariantCulture); }
            catch { return fallback; }
        }

        static double Clamp(double v, double lo, double hi) => v < lo ? lo : v > hi ? hi : v;
    }
}
