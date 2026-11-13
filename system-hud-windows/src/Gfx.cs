// Lớp vẽ mỏng trên GDI+, mô phỏng các thao tác Cairo/Pango mà hud.js dùng:
// chữ có giãn ký tự, cung tròn, gradient kéo dãn (pad), đường cong Bezier.
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Text;

namespace SystemHud
{
    public enum Align { Left, Center, Right }
    public enum VAlign { Top, Middle, Bottom, Baseline }

    public struct TextBox
    {
        public double X, Y, W, H;
    }

    public enum FontRole { Thin, Light, Title, Label, Mono }

    internal static class Fonts
    {
        // Ưu tiên font Noto như bản Ubuntu nếu máy có, nếu không dùng font sẵn có của Windows
        static readonly Dictionary<FontRole, string[]> Candidates = new Dictionary<FontRole, string[]>
        {
            [FontRole.Thin] = new[] { "Noto Sans Light", "Segoe UI Light" },
            [FontRole.Light] = new[] { "Segoe UI" },
            [FontRole.Title] = new[] { "Noto Sans Medium", "Segoe UI Semibold" },
            [FontRole.Label] = new[] { "Noto Sans SemiCondensed Medium", "Bahnschrift SemiCondensed", "Segoe UI" },
            [FontRole.Mono] = new[] { "Noto Sans Mono Condensed Medium", "Bahnschrift SemiCondensed", "Consolas" },
        };

        static readonly Dictionary<FontRole, FontFamily> Families = new Dictionary<FontRole, FontFamily>();
        static readonly Dictionary<(FontRole, float), Font> Cache = new Dictionary<(FontRole, float), Font>();

        static FontFamily Family(FontRole role)
        {
            if (Families.TryGetValue(role, out var f))
                return f;
            foreach (var name in Candidates[role])
            {
                try
                {
                    f = new FontFamily(name);
                    if (f.IsStyleAvailable(FontStyle.Regular))
                        break;
                }
                catch (ArgumentException)
                {
                    f = null;
                }
            }
            f = f ?? FontFamily.GenericSansSerif;
            Families[role] = f;
            return f;
        }

        public static Font Get(FontRole role, double px)
        {
            float size = (float)Math.Round(px, 2);
            if (!Cache.TryGetValue((role, size), out var font))
            {
                font = new Font(Family(role), size, FontStyle.Regular, GraphicsUnit.Pixel);
                Cache[(role, size)] = font;
            }
            return font;
        }
    }

    internal static class Gfx
    {
        public const double TAU = Math.PI * 2;
        static readonly StringFormat Typo = CreateTypo();
        static readonly Dictionary<(Font, char), float> CharWidths = new Dictionary<(Font, char), float>();

        static StringFormat CreateTypo()
        {
            var f = (StringFormat)StringFormat.GenericTypographic.Clone();
            f.FormatFlags |= StringFormatFlags.MeasureTrailingSpaces | StringFormatFlags.NoWrap;
            return f;
        }

        public static void Setup(Graphics g)
        {
            g.SmoothingMode = SmoothingMode.AntiAlias;
            g.PixelOffsetMode = PixelOffsetMode.Half; // tâm pixel ở .5 như Cairo
            g.TextRenderingHint = TextRenderingHint.AntiAlias;
            // trộn màu tuyến tính như Cairo; HighQuality (hiệu chỉnh gamma) chậm hơn nhiều lần
            g.CompositingQuality = CompositingQuality.AssumeLinear;
            g.InterpolationMode = InterpolationMode.NearestNeighbor;
        }

        public static Color Col(double[] c, double a = 1)
        {
            int A = (int)Math.Round(Math.Max(0, Math.Min(1, a)) * 255);
            return Color.FromArgb(A, B(c[0]), B(c[1]), B(c[2]));
        }

        static int B(double v) => (int)Math.Round(Math.Max(0, Math.Min(1, v)) * 255);

        // ------------------------------------------------------------ chữ

        static double LineHeight(Font f) => f.Size * f.FontFamily.GetLineSpacing(f.Style) / f.FontFamily.GetEmHeight(f.Style);
        static double Ascent(Font f) => f.Size * f.FontFamily.GetCellAscent(f.Style) / f.FontFamily.GetEmHeight(f.Style);

        static float CharWidth(Graphics g, Font f, char ch)
        {
            if (!CharWidths.TryGetValue((f, ch), out var w))
            {
                w = g.MeasureString(ch.ToString(), f, PointF.Empty, Typo).Width;
                CharWidths[(f, ch)] = w;
            }
            return w;
        }

        static readonly Dictionary<(string, Font), double> Widths = new Dictionary<(string, Font), double>();

        public static TextBox Measure(Graphics g, string str, Font f, double spacing = 0)
        {
            double w;
            if (spacing == 0)
            {
                if (!Widths.TryGetValue((str, f), out w))
                {
                    if (Widths.Count > 2000)
                        Widths.Clear();
                    w = str.Length == 0 ? 0 : g.MeasureString(str, f, PointF.Empty, Typo).Width;
                    Widths[(str, f)] = w;
                }
            }
            else
            {
                w = 0;
                foreach (var ch in str)
                    w += CharWidth(g, f, ch);
                w += spacing * Math.Max(0, str.Length - 1);
            }
            return new TextBox { W = w, H = LineHeight(f) };
        }

        public static TextBox Text(Graphics g, string str, double x, double y, Font f, double[] color, double alpha = 1,
            Align align = Align.Left, VAlign valign = VAlign.Top, double spacing = 0)
        {
            var m = Measure(g, str, f, spacing);
            double dx = x, dy = y;
            if (align == Align.Right) dx = x - m.W;
            else if (align == Align.Center) dx = x - m.W / 2;
            if (valign == VAlign.Middle) dy = y - m.H / 2;
            else if (valign == VAlign.Bottom) dy = y - m.H;
            else if (valign == VAlign.Baseline) dy = y - Ascent(f);
            var col = Col(color, alpha);
            if (Scale > 0)
                DrawCached(g, str, f, col, spacing, dx, dy, m);
            else
                DrawRaw(g, str, f, col, spacing, dx, dy);
            return new TextBox { X = dx, Y = dy, W = m.W, H = m.H };
        }

        static void DrawRaw(Graphics g, string str, Font f, Color col, double spacing, double dx, double dy)
        {
            using (var br = new SolidBrush(col))
            {
                if (spacing == 0)
                    g.DrawString(str, f, br, (float)dx, (float)dy, Typo);
                else
                {
                    double cx = dx;
                    foreach (var ch in str)
                    {
                        if (ch != ' ')
                            g.DrawString(ch.ToString(), f, br, (float)cx, (float)dy, Typo);
                        cx += CharWidth(g, f, ch) + spacing;
                    }
                }
            }
        }

        // ------------------------------------------------------------ cache ảnh chữ
        // DrawString của GDI+ chậm (~20-50 µs/lần, vẽ từng ký tự khi giãn chữ). Phần lớn chữ trên HUD
        // không đổi giữa các khung hình -> render một lần ra bitmap đúng độ phân giải thiết bị rồi dán lại.

        // Tỉ lệ thế giới -> pixel thiết bị của khung hình hiện tại (0 = tắt cache, vẽ thẳng)
        public static double Scale;
        const int TextPad = 3;
        const int TextCacheMax = 800;
        static readonly Dictionary<(string, Font, int, double, double), Bitmap> TextCache = new Dictionary<(string, Font, int, double, double), Bitmap>();

        static void DrawCached(Graphics g, string str, Font f, Color col, double spacing, double dx, double dy, TextBox m)
        {
            double k = Scale;
            var key = (str, f, col.ToArgb(), spacing, k);
            if (!TextCache.TryGetValue(key, out var bmp))
            {
                if (TextCache.Count >= TextCacheMax)
                    ClearTextCache();
                int bw = (int)Math.Ceiling(m.W * k) + TextPad * 2 + 2;
                int bh = (int)Math.Ceiling(m.H * k) + TextPad * 2 + 2;
                bmp = new Bitmap(Math.Max(1, bw), Math.Max(1, bh), System.Drawing.Imaging.PixelFormat.Format32bppPArgb);
                using (var tg = Graphics.FromImage(bmp))
                {
                    Setup(tg);
                    tg.Clear(Color.Transparent);
                    tg.TranslateTransform(TextPad, TextPad);
                    tg.ScaleTransform((float)k, (float)k);
                    DrawRaw(tg, str, f, col, spacing, 0, 0);
                }
                TextCache[key] = bmp;
            }
            // canh vào lưới pixel thiết bị để ảnh dán 1:1, không bị nội suy mờ
            double devX = Math.Round(dx * k) - TextPad, devY = Math.Round(dy * k) - TextPad;
            var interp = g.InterpolationMode;
            g.InterpolationMode = InterpolationMode.NearestNeighbor;
            g.DrawImage(bmp, new RectangleF((float)(devX / k), (float)(devY / k), (float)(bmp.Width / k), (float)(bmp.Height / k)));
            g.InterpolationMode = interp;
        }

        public static void ClearTextCache()
        {
            foreach (var b in TextCache.Values)
                b.Dispose();
            TextCache.Clear();
        }

        // ------------------------------------------------------------ hình

        static float D(double rad) => (float)(rad * 180 / Math.PI);

        public static void StrokeCircle(Graphics g, double cx, double cy, double r, double width, double[] c, double a)
        {
            using (var p = new Pen(Col(c, a), (float)width))
                g.DrawEllipse(p, (float)(cx - r), (float)(cy - r), (float)(2 * r), (float)(2 * r));
        }

        public static void FillCircle(Graphics g, double cx, double cy, double r, double[] c, double a)
        {
            using (var b = new SolidBrush(Col(c, a)))
                g.FillEllipse(b, (float)(cx - r), (float)(cy - r), (float)(2 * r), (float)(2 * r));
        }

        // Cung từ a0 tới a1 (radian, chiều kim đồng hồ, 0 = hướng 3 giờ) như cairo.arc
        public static void StrokeArc(Graphics g, double cx, double cy, double r, double a0, double a1, double width,
            double[] c, double a, bool round = false)
        {
            if (a1 <= a0)
                return;
            using (var p = new Pen(Col(c, a), (float)width))
            {
                if (round)
                {
                    p.StartCap = LineCap.Round;
                    p.EndCap = LineCap.Round;
                }
                g.DrawArc(p, (float)(cx - r), (float)(cy - r), (float)(2 * r), (float)(2 * r), D(a0), D(a1 - a0));
            }
        }

        public static void Line(Graphics g, double x0, double y0, double x1, double y1, double width, double[] c, double a,
            LineCap cap = LineCap.Flat)
        {
            using (var p = new Pen(Col(c, a), (float)width) { StartCap = cap, EndCap = cap })
                g.DrawLine(p, (float)x0, (float)y0, (float)x1, (float)y1);
        }

        public static void FillRect(Graphics g, double x, double y, double w, double h, double[] c, double a)
        {
            using (var b = new SolidBrush(Col(c, a)))
                g.FillRectangle(b, (float)x, (float)y, (float)w, (float)h);
        }

        public static GraphicsPath RoundRect(double x, double y, double w, double h, double r)
        {
            var p = new GraphicsPath();
            float d = (float)(2 * r);
            p.AddArc((float)(x + w - 2 * r), (float)y, d, d, -90, 90);
            p.AddArc((float)(x + w - 2 * r), (float)(y + h - 2 * r), d, d, 0, 90);
            p.AddArc((float)x, (float)(y + h - 2 * r), d, d, 90, 90);
            p.AddArc((float)x, (float)y, d, d, 180, 90);
            p.CloseFigure();
            return p;
        }

        // Gradient tuyến tính kiểu Cairo EXTEND_PAD: ngoài đoạn p0..p1 giữ màu đầu/cuối
        public static Brush LinearPad(PointF p0, PointF p1, Color c0, Color c1, RectangleF bounds)
        {
            double dx = p1.X - p0.X, dy = p1.Y - p0.Y, len2 = dx * dx + dy * dy;
            if (len2 < 1e-9)
                return new SolidBrush(c1);
            double tmin = 0, tmax = 1;
            foreach (var pt in new[] { new PointF(bounds.Left, bounds.Top), new PointF(bounds.Right, bounds.Top),
                         new PointF(bounds.Left, bounds.Bottom), new PointF(bounds.Right, bounds.Bottom) })
            {
                double t = ((pt.X - p0.X) * dx + (pt.Y - p0.Y) * dy) / len2;
                tmin = Math.Min(tmin, t);
                tmax = Math.Max(tmax, t);
            }
            tmin -= 0.01;
            tmax += 0.01;
            var q0 = new PointF((float)(p0.X + tmin * dx), (float)(p0.Y + tmin * dy));
            var q1 = new PointF((float)(p0.X + tmax * dx), (float)(p0.Y + tmax * dy));
            double span = tmax - tmin;
            var br = new LinearGradientBrush(q0, q1, c0, c1) { WrapMode = WrapMode.TileFlipXY };
            br.InterpolationColors = new ColorBlend(4)
            {
                Colors = new[] { c0, c0, c1, c1 },
                Positions = new[] { 0f, (float)((0 - tmin) / span), (float)((1 - tmin) / span), 1f },
            };
            return br;
        }
    }
}
