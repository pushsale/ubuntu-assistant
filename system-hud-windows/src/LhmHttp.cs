// Đọc nhiệt độ từ web server của LibreHardwareMonitor (Options -> Remote Web Server -> Run, cổng 8085).
// Windows không có API chuẩn cho nhiệt CPU ở user mode; LHM dùng driver riêng để đọc cảm biến.
using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Net;
using System.Text.RegularExpressions;
using System.Web.Script.Serialization;

namespace SystemHud
{
    internal static class LhmHttp
    {
        const string Url = "http://127.0.0.1:8085/data.json";

        // Danh sách (id, tên, °C); null nếu LHM không chạy web server
        public static List<(string id, string name, double v)> ReadTemperatures()
        {
            string json;
            try
            {
                var req = (HttpWebRequest)WebRequest.Create(Url);
                req.Timeout = 600;
                req.ReadWriteTimeout = 600;
                req.Proxy = null;
                using (var resp = req.GetResponse())
                using (var sr = new StreamReader(resp.GetResponseStream()))
                    json = sr.ReadToEnd();
            }
            catch
            {
                return null;
            }
            try
            {
                var root = new JavaScriptSerializer { MaxJsonLength = 16 * 1024 * 1024 }.DeserializeObject(json) as Dictionary<string, object>;
                var list = new List<(string, string, double)>();
                if (root != null)
                    Walk(root, "", list);
                return list;
            }
            catch
            {
                return null;
            }
        }

        // Cây: máy -> phần cứng (ImageURL cho biết loại) -> nhóm cảm biến -> cảm biến
        static void Walk(Dictionary<string, object> node, string hw, List<(string, string, double)> list)
        {
            string image = node.TryGetValue("ImageURL", out var im) ? im as string ?? "" : "";
            string kind = HardwareKind(image);
            if (kind != null)
                hw = kind;
            string text = node.TryGetValue("Text", out var t) ? t as string ?? "" : "";
            string value = node.TryGetValue("Value", out var v) ? v as string ?? "" : "";
            string sensorId = node.TryGetValue("SensorId", out var sid) ? sid as string : null;
            if (value.EndsWith("°C"))
            {
                var m = Regex.Match(value.Replace(',', '.'), @"-?\d+(\.\d+)?");
                if (m.Success && double.TryParse(m.Value, NumberStyles.Float, CultureInfo.InvariantCulture, out double c))
                    list.Add((sensorId ?? $"/{hw}/temperature", text, c));
            }
            if (node.TryGetValue("Children", out var ch) && ch is IEnumerable children)
                foreach (var child in children)
                    if (child is Dictionary<string, object> d)
                        Walk(d, hw, list);
        }

        // Quy ước giống Identifier của LHM: /intelcpu, /amdcpu, /gpu-nvidia, /nvme, /hdd ...
        static string HardwareKind(string image)
        {
            image = image.ToLowerInvariant();
            if (image.Contains("cpu")) return "intelcpu";
            if (image.Contains("nvidia") || image.Contains("ati") || image.Contains("gpu")) return "gpu";
            if (image.Contains("hdd") || image.Contains("nvme") || image.Contains("ssd")) return "hdd";
            if (image.Contains("mainboard") || image.Contains("chip")) return "mainboard";
            return null;
        }
    }
}
