# Initial Setup — Chi tiết kỹ thuật

## 1. Tổng quan, tech stack, cách chạy

Initial Setup gồm khối lệnh cài Claude ở `README.md` gốc và 4 file trong `initial-setup/`:

| File | Đọc / chạy bởi | Nội dung |
|---|---|---|
| `README.md` (gốc repo) | Người dùng | Bước 1: khối lệnh cài Claude Desktop + clone repo; Bước 2: câu giao việc kèm link `initial-setup/README.md` |
| `initial-setup/README.md` | Claude (nhận link) và người dùng | Mục "Dành cho Claude": clone / pull repo rồi đọc `CLAUDE.md`. Mục cho người: tự chạy script |
| `initial-setup/CLAUDE.md` | Claude (Claude Code tự nạp khi đọc file trong thư mục này) | Quy trình 7 bước, quy tắc an toàn, cách đọc bảng Phần B, cách thêm mục |
| `initial-setup/install-basic.sh` | Người dùng (Claude mở trong terminal của họ) | Cài một lượt Phần A; `--check` chỉ kiểm tra |
| `initial-setup/packages.md` | Claude và người dùng | Phần A: bảng tham khảo script làm gì; Phần B: mục phức tạp (bảng 7 cột) |

Cách chạy (máy mới):

```bash
# Bước 1: dán khối lệnh trong README.md gốc vào terminal
# Bước 2: mở Claude Desktop, tab Code, thư mục ~/ubuntu-setup, dán:
#   Đọc https://github.com/pushsale/ubuntu-setup/blob/main/initial-setup/README.md và cài đặt máy theo hướng dẫn trong đó
# Không cần Claude, chỉ phần đơn giản:
cd ~/ubuntu-setup/initial-setup && ./install-basic.sh          # --check: chỉ kiểm tra
```

## 2. Kiến trúc và pipeline

```
README gốc Bước 1 (người dùng dán, 1 lần sudo):
  apt install curl gnupg git
  → curl khoá https://downloads.claude.ai/claude-desktop/key.asc → /usr/share/keyrings/claude-desktop-archive-keyring.asc
  → gpg --show-keys | grep fpr 31DDDE24DDFAB679F42D7BD2BAA929FF1A7ECACE   (sai → dừng chuỗi &&)
  → /etc/apt/sources.list.d/claude-desktop.list (kho stable)
  → apt install claude-desktop
  → git clone repo → ~/ubuntu-setup (đã có thì bỏ qua)

README gốc Bước 2: người dùng đưa Claude link initial-setup/README.md
  → Claude: clone/pull repo → đọc initial-setup/CLAUDE.md

Claude (theo CLAUDE.md):
  1 repo có / cập nhật
  2 đọc máy (lsb_release, gnome-shell, session type, GPU, arch)
  3 install-basic.sh --check  → bảng TỔNG KẾT
  4 install-basic.sh trong terminal người dùng (sudo -v một lần + giữ phiên sudo)
      mạng → card → phím tắt → apt (PPA bamboo, update, từng gói) → bộ gõ Bamboo
      → Chrome .deb → RustDesk .deb (GitHub API) → snap ×3 → TỔNG KẾT, exit 0/1
     đọc TỔNG KẾT: mang LỖI → dừng; CẦN XỬ LÝ → làm theo ghi chú Phần A
  5 Phần B: chạy "Kiểm tra" → kế hoạch → người dùng duyệt (`hỏi trước` hỏi riêng)
  6 làm từng mục + kiểm tra lại
  7 báo cáo + việc người dùng tự làm
```

## 3. Luồng chi tiết

| Bước | Ở đâu |
|---|---|
| Khối lệnh cài Claude, kiểm tra khoá | [README.md gốc](../../README.md) mục "Bước 1" |
| Trang Claude nhận link | [initial-setup/README.md](../../initial-setup/README.md) mục "Dành cho Claude" |
| Quy trình cho Claude | [initial-setup/CLAUDE.md](../../initial-setup/CLAUDE.md) mục "Quy trình" |
| Quy tắc an toàn (sudo, tài khoản, nguồn ngoài, `hỏi trước`) | [initial-setup/CLAUDE.md](../../initial-setup/CLAUDE.md) mục "Quy tắc an toàn" |
| Cài một lượt | [initial-setup/install-basic.sh](../../initial-setup/install-basic.sh) |
| Danh sách | [initial-setup/packages.md](../../initial-setup/packages.md) |

Khối lệnh Bước 1 nối bằng `&&`, cuối có `|| echo "=== LỖI ..."`: một bước lỗi thì dừng cả chuỗi. Bước kiểm tra khoá dùng `gpg --show-keys --with-colons` + `grep -q '^fpr:::::::::<fingerprint>:'` (đã thử: khoá đúng qua, file sai bị chặn).

`install-basic.sh`:

- `set -uo pipefail` (không `-e`): một mục lỗi không dừng các mục sau; riêng mạng lỗi thì in tổng kết rồi `exit 1`.
- Chạy bằng root thì từ chối (gsettings phải chạy trong phiên của user). Sudo: `sudo -v` một lần, vòng nền `sudo -n true` mỗi 50 s để phiên sudo không hết hạn giữa chừng (tải snap lâu).
- Mỗi mục: kiểm tra trước (`dpkg -s`, `snap list`, `gsettings get`); đã có → `ĐÃ CÓ`; `--check` → `CHƯA CÓ`; không thì cài. Kết quả gom qua `note tên kết-quả ghi-chú`, in bằng `column -t` giữa hai dòng `=== TỔNG KẾT ===`. Exit 1 nếu có mục `LỖI`.
- gsettings cần phiên desktop (`DBUS_SESSION_BUS_ADDRESS`); không có (chạy qua SSH) thì `BỎ QUA`.
- Bộ gõ: thêm `('ibus','Bamboo')` vào cuối `input-sources` bằng `python3 ast.literal_eval` (giữ nguyên bàn phím đang có), ghi giá trị cũ.
- `.deb` tải vào `mktemp -d`, xoá khi thoát (`trap EXIT`). RustDesk: tên tài sản đúng `rustdesk-<tag>-<x86_64|aarch64>.deb` lấy từ `api.github.com/.../releases/latest`.
- Log ghép (tee) vào `~/.cache/initial-setup/install-basic.log`.

## 4. Dữ liệu: định dạng `packages.md`

Phần A: bảng 4 cột (Tên, Mục đích, Cách làm, Ghi chú), chỉ để đọc; nguồn sự thật là script. Thêm / bớt mục Phần A phải sửa cả script và bảng.

Phần B: mỗi nhóm `### B<số>. <tên>` là một bảng 7 cột:

| Cột | Giá trị |
|---|---|
| Tên | kebab-case, duy nhất |
| Mục đích | 1 câu |
| Cài | `apt: <gói>` / `snap: <gói> [cờ]` / `flatpak: <id>` / `repo: <đường dẫn script trong repo> [tham số]` / `gsettings: <schema> <key> <giá trị>` / mô tả bước |
| Kiểm tra | lệnh shell, exit 0 = đã có |
| Yêu cầu | điều kiện máy, trống = mọi máy |
| Ghi chú | `hỏi trước`, nguồn ngoài (PPA...), việc người dùng tự làm |
| Trạng thái | `cài` / `bỏ` / `đề xuất` |

Nhóm Phần B hiện có: B0 Claude (chỉ kiểm tra), B1 driver NVIDIA (`hỏi trước`, chỉ khi script báo `CẦN XỬ LÝ`), B2 Remote (Remote Shield + Desktop Sharing + Remote Control bằng `install.sh --rdp`; Remote Login `hỏi trước`), B3 LibreOffice (`hỏi trước`), B4 Người dùng bổ sung.

Tiêu chí chia: Phần A = một lệnh cài, không hỏi người dùng, không cần tài khoản / khởi động lại, chạy lại an toàn. Còn lại là Phần B.

Nguồn ngoài kho Ubuntu đã được người dùng duyệt: PPA `bamboo-engine/ibus-bamboo`, `.deb` Chrome của Google (`dl.google.com`, tự thêm kho apt), `.deb` RustDesk từ GitHub `rustdesk/rustdesk` (không tự cập nhật). Đã kiểm tra 2026-11-13: URL Chrome trả 200; bản RustDesk mới nhất 1.5.3 có tài sản `rustdesk-1.5.3-x86_64.deb`.

Phím Terminal: Ubuntu 25.10+ dùng Ptyxis (`org.gnome.Ptyxis.Shortcuts`). Đặt `copy-clipboard` = `<ctrl>c`, `paste-clipboard` = `<ctrl>v`; Ctrl+Shift+C không còn gắn với copy nên terminal nhận nó như Ctrl+C (gửi tín hiệu dừng).

Trong bảng Phần B, dấu `|` trong lệnh viết là `\|`; khi chạy bỏ dấu `\`.

## 5. Giao thức và nguồn ngoài

- Kho Claude Desktop: `deb [arch=amd64,arm64 signed-by=/usr/share/keyrings/claude-desktop-archive-keyring.asc] https://downloads.claude.ai/claude-desktop/apt/stable stable main`. Khoá: `https://downloads.claude.ai/claude-desktop/key.asc`, fingerprint `31DDDE24DDFAB679F42D7BD2BAA929FF1A7ECACE` (đã đối chiếu 2026-11-13).
- Claude Code CLI (tuỳ chọn): `curl -fsSL https://claude.ai/install.sh | bash`.
- Nguồn: https://code.claude.com/docs/en/desktop-linux và https://code.claude.com/docs/en/setup.

## 6. Cấu hình và tác động khi đổi

Không có cấu hình riêng. Đổi `install-basic.sh` (`APT_PKGS`, vòng snap) là đổi Phần A; đổi `packages.md` Phần B là đổi những gì Claude làm từng mục. Đổi `CLAUDE.md` là đổi cách Claude làm: giữ các quy tắc an toàn. Đổi đường dẫn / tên `initial-setup/README.md` thì link trong README gốc hỏng.

## 7. Giao diện

Không có giao diện. Người dùng tương tác qua terminal (Bước 1, script) và hội thoại với Claude.

## 8. Lịch sử tính năng

| Ngày | Thay đổi |
|---|---|
| 2026-11-13 | #30: tạo khung README / CLAUDE.md / packages.md; khối lệnh cài Claude theo hướng dẫn chính thức, có kiểm tra khoá |
| 2026-11-13 | Danh sách đầu tiên theo người dùng: mạng, card màn hình, ibus-bamboo, Remote Shield, OnlyOffice, LibreOffice (nếu cần) |
| 2026-11-13 | Danh sách đầy đủ: thêm phím tắt kiểu Windows, Chrome, Desktop Sharing + Remote Control, Remmina, RustDesk, Notepad Next, DBeaver |
| 2026-11-13 | `install-basic.sh` cài một lượt mục đơn giản (một lần mật khẩu); `packages.md` chia Phần A / B; khối lệnh cài Claude chuyển lên README gốc, `initial-setup/README.md` thành trang Claude nhận link; bỏ đề xuất System HUD |
| 2026-11-13 | Repo đổi tên `ubuntu-assistant` → `ubuntu-setup` (GitHub tự chuyển hướng link cũ); thư mục `ubuntu-setup/` → `initial-setup/`, tài liệu `docs/ubuntu-setup/` → `docs/initial-setup/`; clone mặc định `~/ubuntu-setup`, log `~/.cache/initial-setup/` |

## 9. Cấu trúc thư mục

```
README.md (gốc)        cài Claude Desktop + câu giao việc kèm link
initial-setup/
├─ README.md           trang Claude nhận link; hướng dẫn tự chạy script
├─ CLAUDE.md           quy trình + quy tắc cho Claude
├─ install-basic.sh    cài một lượt Phần A (--check: chỉ kiểm tra)
└─ packages.md         Phần A (tham khảo) + Phần B (Claude xử lý)
```

## 10. Quy ước phát triển

- Repo public: không ghi mật khẩu, token, license key, IP, tên máy, đường dẫn cá nhân vào bất kỳ file nào ở đây.
- Mỗi mục Phần B phải có lệnh "Kiểm tra" chạy được không cần sudo và không thay đổi máy.
- Mục Phần A phải kiểm tra trước khi cài và tôn trọng `--check`. Sửa script: `bash -n`, `shellcheck` nếu có, rồi `./install-basic.sh --check`.
- Nguồn ngoài kho Ubuntu phải ghi rõ trong `packages.md`.
- Đổi khối lệnh Bước 1: chạy `bash -n` trên khối lệnh và đối chiếu lại tài liệu chính thức.

## 11. Workflow xử lý issue

1. Mục cài lỗi trên máy mới: xem `~/.cache/initial-setup/install-basic.log` (Phần A) hoặc lỗi lệnh (Phần B); sửa script / dòng trong `packages.md`.
2. Khối lệnh Bước 1 lỗi: đối chiếu https://code.claude.com/docs/en/desktop-linux (URL kho / khoá có thể đổi), sửa `README.md` gốc.
3. Ghi lỗi đã gặp vào "Common Pitfalls" dưới đây.

## 12. Onboarding checklist cho session mới

Thứ tự đọc: memory Claude Code của project (nằm ngoài repo, trên máy phát triển: `~/.claude/projects/<thư-mục-project>/memory/`) → [../index.md](../index.md) → file này → `initial-setup/CLAUDE.md` → `initial-setup/packages.md` → `initial-setup/install-basic.sh`.

| Cần làm | File |
|---|---|
| Thêm / bớt thứ cài đơn giản | `initial-setup/install-basic.sh` + bảng Phần A trong `packages.md` |
| Thêm / bớt thứ phức tạp | Phần B trong `initial-setup/packages.md` |
| Đổi cách Claude cài, quy tắc hỏi trước | `initial-setup/CLAUDE.md` |
| Đổi lệnh cài Claude | `README.md` gốc |

Trạng thái (2026-11-13): `install-basic.sh --check` chạy đúng trên máy phát triển (mọi mục đã có trừ Notepad Next); chế độ cài và Phần B chưa chạy thử trên máy mới.

## 13. Architectural Decisions & Rationale

| Quyết định | Lý do |
|---|---|
| ~~Danh sách Markdown cho Claude đọc, không viết script cài tự động~~ → đảo 2026-11-13: mục đơn giản vào `install-basic.sh`, Claude chỉ làm mục phức tạp | Người dùng muốn chạy một phát, nhập mật khẩu một lần, không bị hỏi nhiều. Script nhanh và đoán trước được hơn Claude cài từng mục; Claude giữ cho phần cần quyết định / tuỳ máy |
| Script không cần duyệt riêng, Phần B cần duyệt | Phần A đã được người dùng chốt và chạy lại an toàn; Phần B có driver, tài khoản, đổi cổng RDP |
| README gốc chỉ cài Claude rồi đưa link `initial-setup/README.md` | Repo public: người mới vào chỉ cần một đường đi; hướng dẫn từng extension chuyển về `remote-shield/README.md`, `system-hud/README.md` |
| Repo tên `ubuntu-setup`, feature cài máy tên `initial-setup`; UUID extension giữ `…@ubuntu-assistant` | Repo giờ chủ yếu để dựng máy Ubuntu mới. Đổi UUID thì máy đã cài phải gỡ rồi cài lại, nên giữ nguyên |
| Cài Claude bằng khối lệnh dán tay | Lúc đó máy chưa có Claude; đây là bước duy nhất phải làm tay |
| Kho apt chính thức thay vì tải `.deb` | Claude được cập nhật cùng `apt upgrade` |
| Kiểm tra fingerprint khoá ngay trong khối lệnh | Không thêm kho nếu khoá tải về sai |
| Script không dùng `set -e`, cài apt từng gói | Một gói lỗi (PPA chưa có bản cho Ubuntu mới...) không chặn các mục khác |

## 14. Common Pitfalls

| Vấn đề | Nguyên nhân | Cách xử lý |
|---|---|---|
| Kiểm tra mạng bằng `curl -f https://downloads.claude.ai/` trả lỗi 22 dù mạng tốt | Trang gốc của downloads.claude.ai không trả 200 | Kiểm tra bằng `https://github.com` |
| Chạy `sudo ./install-basic.sh` | gsettings chạy dưới root không đổi được phiên của user | Script từ chối khi chạy bằng root; chạy bằng user thường, script tự hỏi mật khẩu |

## 15. Memory files & external resources

- Memory project: `~/.claude/projects/<thư-mục-project>/memory/` trên máy phát triển (ngoài repo)
- Mã nguồn: `initial-setup/` trong repo `github.com/pushsale/ubuntu-setup`
- Tài liệu chính thức: https://code.claude.com/docs/en/desktop-linux, https://code.claude.com/docs/en/setup
