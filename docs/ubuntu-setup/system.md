# Ubuntu Setup — Chi tiết kỹ thuật

## 1. Tổng quan, tech stack, cách chạy

Ubuntu Setup không có chương trình riêng. Gồm 3 file trong `ubuntu-setup/`:

| File | Đọc bởi | Nội dung |
|---|---|---|
| `README.md` | Người dùng (và GitHub hiển thị khi mở thư mục) | Bước 1: khối lệnh cài Claude Desktop + tải repo; Bước 2: câu giao việc cho Claude |
| `CLAUDE.md` | Claude (Claude Code tự nạp khi đọc file trong thư mục này) | Quy trình 7 bước, quy tắc an toàn, cách đọc bảng |
| `packages.md` | Claude và người dùng | Danh sách cần cài theo nhóm |

Cách chạy (máy mới):

```bash
# Bước 1: dán khối lệnh trong ubuntu-setup/README.md vào terminal
# Bước 2: mở Claude Desktop, tab Code, thư mục ~/ubuntu-assistant, gõ:
#   Đọc ubuntu-setup/CLAUDE.md và cài đặt máy theo danh sách trong ubuntu-setup/packages.md
```

## 2. Kiến trúc và pipeline

```
README Bước 1 (người dùng dán, 1 lần sudo):
  apt install curl gnupg git
  → curl khoá https://downloads.claude.ai/claude-desktop/key.asc → /usr/share/keyrings/claude-desktop-archive-keyring.asc
  → gpg --show-keys | grep fpr 31DDDE24DDFAB679F42D7BD2BAA929FF1A7ECACE   (sai → dừng chuỗi &&)
  → /etc/apt/sources.list.d/claude-desktop.list (kho stable)
  → apt install claude-desktop
  → git clone repo → ~/ubuntu-assistant (đã có thì bỏ qua)

Claude (theo CLAUDE.md):
  1 đọc máy (lsb_release, gnome-shell, session type, GPU, arch)
  2 đọc packages.md (bỏ khối "Mẫu", bỏ trạng thái "bỏ")
  3 chạy cột "Kiểm tra" từng mục → đã có / cần cài / không hợp máy
  4 kế hoạch → người dùng duyệt (mục "đề xuất" và "hỏi trước" phải được đồng ý riêng)
  5 cài theo nhóm 0 → 6 (apt gom một lần sudo trong terminal của người dùng)
  6 chạy lại "Kiểm tra"
  7 báo cáo + việc người dùng tự làm
```

## 3. Luồng chi tiết

| Bước | Ở đâu |
|---|---|
| Khối lệnh cài Claude, kiểm tra khoá | [ubuntu-setup/README.md](../../ubuntu-setup/README.md) mục "Bước 1" |
| Quy trình cho Claude | [ubuntu-setup/CLAUDE.md](../../ubuntu-setup/CLAUDE.md) mục "Quy trình" |
| Quy tắc an toàn (sudo, tài khoản, nguồn ngoài, `hỏi trước`) | [ubuntu-setup/CLAUDE.md](../../ubuntu-setup/CLAUDE.md) mục "Quy tắc an toàn" |
| Định nghĩa cột | [ubuntu-setup/CLAUDE.md](../../ubuntu-setup/CLAUDE.md) mục "Cách đọc `packages.md`" |
| Danh sách | [ubuntu-setup/packages.md](../../ubuntu-setup/packages.md) |

Khối lệnh Bước 1 nối bằng `&&`, cuối có `|| echo "=== LỖI ..."`: một bước lỗi thì dừng cả chuỗi. Bước kiểm tra khoá dùng `gpg --show-keys --with-colons` + `grep -q '^fpr:::::::::<fingerprint>:'` (đã thử: khoá đúng qua, file sai bị chặn).

## 4. Dữ liệu: định dạng `packages.md`

Mỗi nhóm `## <số>. <tên>` là một bảng 7 cột:

| Cột | Giá trị |
|---|---|
| Tên | kebab-case, duy nhất |
| Mục đích | 1 câu |
| Cài | `apt: <gói>` / `snap: <gói> [cờ]` / `flatpak: <id>` / `repo: <đường dẫn script trong repo> [tham số]` / `gsettings: <schema> <key> <giá trị>` / mô tả bước |
| Kiểm tra | lệnh shell, exit 0 = đã có |
| Yêu cầu | điều kiện máy, trống = mọi máy |
| Ghi chú | `hỏi trước`, nguồn ngoài (PPA...), việc người dùng tự làm |
| Trạng thái | `cài` / `bỏ` / `đề xuất` |

Nhóm hiện có (thứ tự người dùng chọn 2026-11-13): 0 Claude (chỉ kiểm tra), 1 Kiểm tra máy (mạng, card màn hình; mạng lỗi thì dừng toàn bộ), 2 Gõ tiếng Việt, 3 Remote Shield, 4 Văn phòng (OnlyOffice; LibreOffice `hỏi trước`), 5 Đề xuất khác (chưa duyệt), 6 Người dùng bổ sung.

Trong bảng, dấu `|` trong lệnh viết là `\|` (escape Markdown); khi chạy bỏ dấu `\`. Các lệnh "Kiểm tra" hiện có đã chạy thử trên máy phát triển (2026-11-13), đều trả 0.

## 5. Giao thức và nguồn ngoài

- Kho Claude Desktop: `deb [arch=amd64,arm64 signed-by=/usr/share/keyrings/claude-desktop-archive-keyring.asc] https://downloads.claude.ai/claude-desktop/apt/stable stable main`. Khoá: `https://downloads.claude.ai/claude-desktop/key.asc`, fingerprint `31DDDE24DDFAB679F42D7BD2BAA929FF1A7ECACE` (đã đối chiếu 2026-11-13: giống khoá đang cài trên máy phát triển).
- Claude Code CLI (tuỳ chọn): `curl -fsSL https://claude.ai/install.sh | bash`.
- Nguồn: https://code.claude.com/docs/en/desktop-linux và https://code.claude.com/docs/en/setup.

## 6. Cấu hình và tác động khi đổi

Không có cấu hình riêng. Đổi `packages.md` là đổi những gì Claude cài lần sau. Đổi `CLAUDE.md` là đổi cách Claude làm: giữ các quy tắc an toàn.

## 7. Giao diện

Không có giao diện. Người dùng tương tác qua terminal (Bước 1) và hội thoại với Claude (Bước 2).

## 8. Lịch sử tính năng

| Ngày | Thay đổi |
|---|---|
| 2026-11-13 | #30: tạo khung README / CLAUDE.md / packages.md; khối lệnh cài Claude theo hướng dẫn chính thức, có kiểm tra khoá |
| 2026-11-13 | Danh sách đầu tiên theo người dùng: mạng, card màn hình, ibus-bamboo, Remote Shield, OnlyOffice, LibreOffice (nếu cần) |

## 9. Cấu trúc thư mục

```
ubuntu-setup/
├─ README.md      hướng dẫn cho người (cài Claude, giao việc)
├─ CLAUDE.md      quy trình + quy tắc cho Claude
└─ packages.md    danh sách cần cài
```

## 10. Quy ước phát triển

- Repo public: không ghi mật khẩu, token, license key, IP, tên máy, đường dẫn cá nhân vào bất kỳ file nào ở đây.
- Mỗi mục phải có lệnh "Kiểm tra" chạy được không cần sudo và không thay đổi máy.
- Nguồn ngoài kho Ubuntu phải ghi rõ trong cột "Cài" hoặc "Ghi chú".
- Đổi khối lệnh Bước 1: chạy `bash -n` trên khối lệnh và đối chiếu lại tài liệu chính thức.

## 11. Workflow xử lý issue

1. Mục cài lỗi trên máy mới: ghi lỗi, sửa lệnh "Cài" hoặc thêm "Yêu cầu" trong `packages.md`.
2. Khối lệnh Bước 1 lỗi: đối chiếu https://code.claude.com/docs/en/desktop-linux (URL kho / khoá có thể đổi), sửa `README.md`.
3. Ghi lỗi đã gặp vào "Common Pitfalls" dưới đây.

## 12. Onboarding checklist cho session mới

Thứ tự đọc: memory Claude Code của project (nằm ngoài repo, trên máy phát triển: `~/.claude/projects/<thư-mục-project>/memory/`) → [../index.md](../index.md) → file này → `ubuntu-setup/CLAUDE.md` → `ubuntu-setup/packages.md`.

| Cần làm | File |
|---|---|
| Thêm / bớt thứ cần cài | `ubuntu-setup/packages.md` |
| Đổi cách Claude cài, quy tắc hỏi trước | `ubuntu-setup/CLAUDE.md` |
| Đổi lệnh cài Claude | `ubuntu-setup/README.md` |

Trạng thái (2026-11-13): đã có danh sách đầu tiên; chưa chạy thử trên máy mới.

## 13. Architectural Decisions & Rationale

| Quyết định | Lý do |
|---|---|
| Danh sách Markdown cho Claude đọc, không viết script cài tự động | Người dùng yêu cầu Claude tự cài; danh sách dạng ghi chú dễ sửa, Claude xử lý được trường hợp lệch (máy khác, gói đổi tên) mà script cứng không làm được |
| Cài Claude bằng khối lệnh dán tay | Lúc đó máy chưa có Claude; đây là bước duy nhất phải làm tay |
| Kho apt chính thức thay vì tải `.deb` | Claude được cập nhật cùng `apt upgrade` |
| Kiểm tra fingerprint khoá ngay trong khối lệnh | Không thêm kho nếu khoá tải về sai |
| Claude lập kế hoạch cho duyệt trước khi cài | Tránh cài thừa / cài nhầm; người dùng biết trước cần nhập mật khẩu ở đâu |

## 14. Common Pitfalls

| Vấn đề | Nguyên nhân | Cách xử lý |
|---|---|---|
| _Chưa có_ | | Ghi khi chạy thử trên máy mới |

## 15. Memory files & external resources

- Memory project: `~/.claude/projects/<thư-mục-project>/memory/` trên máy phát triển (ngoài repo)
- Mã nguồn: `ubuntu-setup/` trong repo `github.com/pushsale/ubuntu-assistant`
- Tài liệu chính thức: https://code.claude.com/docs/en/desktop-linux, https://code.claude.com/docs/en/setup
