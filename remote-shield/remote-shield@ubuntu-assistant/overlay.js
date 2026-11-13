// Vẽ ảnh chữ thông báo cho màn trắng của Remote Shield (không phụ thuộc gnome-shell, test được bằng gjs).
import Pango from 'gi://Pango';
import PangoCairo from 'gi://PangoCairo';
import Cairo from 'cairo';

// Ảnh chữ đặt giữa màn trắng. Nền trắng đặc để ghép thẳng vào khung trắng của shim.
export function renderOverlay(cfg, path) {
    const W = 1400, H = 320;
    const surface = new Cairo.ImageSurface(Cairo.Format.RGB24, W, H);
    const cr = new Cairo.Context(surface);
    cr.setSourceRGB(1, 1, 1);
    cr.paint();

    const draw = (str, font, rgb, y) => {
        const layout = PangoCairo.create_layout(cr);
        layout.set_font_description(Pango.FontDescription.from_string(font));
        layout.set_width(W * Pango.SCALE);
        layout.set_alignment(Pango.Alignment.CENTER);
        layout.set_text(str, -1);
        const [, logical] = layout.get_pixel_extents();
        cr.setSourceRGB(...rgb);
        cr.moveTo(0, y);
        PangoCairo.show_layout(cr, layout);
        return y + logical.height;
    };

    // biểu tượng ổ khoá đơn giản
    const cx = W / 2;
    cr.setSourceRGB(0.55, 0.58, 0.64);
    cr.setLineWidth(7);
    cr.arc(cx, 62, 22, Math.PI, 0);
    cr.stroke();
    cr.rectangle(cx - 34, 62, 68, 52);
    cr.fill();

    let y = draw(cfg.message, 'Ubuntu Sans Medium 34', [0.18, 0.2, 0.24], 140);
    draw(cfg.submessage, 'Ubuntu Sans 18', [0.45, 0.48, 0.53], y + 14);

    surface.writeToPNG(path);
    cr.$dispose();
}
