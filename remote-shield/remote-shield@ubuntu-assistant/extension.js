// Remote Shield: file khởi động mỏng.
// Toàn bộ logic nằm ở core.js và được nạp kèm mã phiên bản, nên sau khi cập nhật code
// chỉ cần tắt/bật lại extension (install.sh tự làm) là chạy bản mới, không phải đăng xuất.
// File này gần như không bao giờ cần sửa.

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

export default class RemoteShieldExtension extends Extension {
    enable() {
        this._enabled = true;
        const gen = this._gen = (this._gen ?? 0) + 1;
        import(`./core.js?v=${Date.now()}`)
            .then(mod => {
                if (!this._enabled || gen !== this._gen)
                    return; // đã bị tắt trong lúc đang nạp
                this._core = new mod.ShieldCore(this.path);
                this._core.enable();
            })
            .catch(e => console.error(`[remote-shield] không nạp được core.js: ${e}\n${e.stack}`));
    }

    disable() {
        this._enabled = false;
        this._gen = (this._gen ?? 0) + 1;
        try {
            this._core?.disable();
        } catch (e) {
            console.error(`[remote-shield] lỗi khi tắt: ${e}`);
        }
        this._core = null;
    }
}
