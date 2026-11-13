/*
 * shield-shim: chặn khung hình giữa GNOME Shell (Mutter) và màn hình.
 *
 * Nạp vào gnome-shell bằng LD_PRELOAD (drop-in systemd ~/.config/systemd/user/org.gnome.Shell@.service.d/remote-shield.conf).
 * Mutter giao mỗi khung hình cho card màn hình bằng drmModeAtomicCommit() của libdrm:
 * lệnh này gắn framebuffer (FB_ID) vừa vẽ xong vào plane của từng màn hình.
 * Thư viện này thay hàm đó để:
 *   1. Ghi lại các lần giao khung (log + file trạng thái)  -> chứng minh nằm đúng đường đi.
 *   2. Khi có file cờ $XDG_RUNTIME_DIR/remote-shield/blank: thay FB_ID của mọi plane
 *      bằng một framebuffer màu trắng (con trỏ chuột: trong suốt) trước khi gửi xuống driver.
 *      Ảnh Mutter đã vẽ (nguồn của chụp màn hình, RDP) không bị đụng tới.
 *
 * An toàn:
 *   - Chỉ hoạt động trong tiến trình tên "gnome-shell"; tự xoá mình khỏi LD_PRELOAD để app con không nhiễm.
 *   - Có file ~/.config/remote-shield/shim-disabled -> không làm gì.
 *   - Lệnh giao khung đã thay bị driver từ chối -> gửi lại khung gốc, tắt chế độ thay tới khi tắt/bật cờ.
 *   - Đang thay khung mà gnome-shell chết -> lần khởi động sau tự khoá chế độ thay (file guard).
 *
 * Không phụ thuộc libdrm-dev: dùng header uapi của kernel và gọi ioctl trực tiếp.
 */
#define _GNU_SOURCE
#include <dlfcn.h>
#include <errno.h>
#include <fcntl.h>
#include <pthread.h>
#include <stdarg.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/ioctl.h>
#include <sys/mman.h>
#include <sys/stat.h>
#include <time.h>
#include <unistd.h>
#include <drm/drm.h>
#include <drm/drm_mode.h>
#include <drm/drm_fourcc.h>

/* Bố cục nội bộ của drmModeAtomicReq trong libdrm (xf86drmMode.c, ổn định từ 2015).
 * Được kiểm tra lúc chạy bằng check_layout(); sai thì chỉ ghi log, không thay khung. */
struct req_item {
    uint32_t object_id;
    uint32_t property_id;
    uint64_t value;
    uint32_t cursor;
};
struct atomic_req {
    uint32_t cursor;
    uint32_t size_items;
    struct req_item *items;
};

typedef int (*commit_fn)(int, struct atomic_req *, uint32_t, void *);

#define MAX_DEVS 4
#define MAX_PLANES 64
#define MAX_FBS 16
#define MAX_CHANGES 128
#define DETAIL_COMMITS 40

enum { PT_OVERLAY = 0, PT_PRIMARY = 1, PT_CURSOR = 2 };
static const char *ptype(int t) { return t == PT_PRIMARY ? "primary" : t == PT_CURSOR ? "cursor" : "overlay"; }

struct plane {
    uint32_t id;
    int type;
    uint32_t fb, crtc, src_x, src_y, src_w, src_h, damage; /* id thuộc tính */
    uint64_t last_fb, fb_changes;
};
struct fbent {
    uint32_t w, h, fb_id, handle, pitch;
    int transparent;
    uint8_t *px; /* vùng nhớ của dumb buffer, giữ map để vẽ lại khi ảnh màn che đổi (đồng hồ) */
    size_t size;
};
struct dev {
    int used, fd, nplanes;
    struct plane planes[MAX_PLANES];
    uint32_t cursor_w, cursor_h;
    int nfbs;
    struct fbent fbs[MAX_FBS];
    uint64_t commits, swapped;
};

static struct {
    int active, guard, layout_ok, swap_failed, want, details, need_status;
    commit_fn real;
    pthread_mutex_t lock;
    char flag[512], status[512], log[512], marker[512], overlay[512], rundir[512], gen[512];
    int64_t gen_mtime;   /* mtime (ns) của file shield.gen lần cuối thấy */
    int repaint;         /* ảnh màn che đã đổi: vẽ lại các framebuffer ở lần giao khung tới */
    struct dev devs[MAX_DEVS];
    uint64_t last_check_ms, last_status_ms, total, swapped, swapped_since_on, fails;
    char last_err[256];
} S = {.layout_ok = -1, .lock = PTHREAD_MUTEX_INITIALIZER};

static uint64_t now_ms(void)
{
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    return (uint64_t)ts.tv_sec * 1000 + ts.tv_nsec / 1000000;
}

static void logf_(const char *fmt, ...)
{
    char line[1024];
    time_t t = time(NULL);
    struct tm tm;
    localtime_r(&t, &tm);
    int n = (int)strftime(line, sizeof line, "%F %T ", &tm);
    va_list ap;
    va_start(ap, fmt);
    vsnprintf(line + n, sizeof line - n - 1, fmt, ap);
    va_end(ap);
    strcat(line, "\n");
    if (!S.log[0]) {
        fputs(line, stderr);
        return;
    }
    int fd = open(S.log, O_WRONLY | O_CREAT | O_APPEND | O_CLOEXEC, 0644);
    if (fd >= 0) {
        if (write(fd, line, strlen(line)) < 0) { /* bỏ qua */ }
        close(fd);
    }
}

static int xioctl(int fd, unsigned long req, void *arg)
{
    int r;
    do
        r = ioctl(fd, req, arg);
    while (r == -1 && (errno == EINTR || errno == EAGAIN));
    return r;
}

/* ---------- đọc plane và thuộc tính ---------- */

static int obj_props(int fd, uint32_t obj, uint32_t type, uint32_t **ids, uint64_t **vals)
{
    struct drm_mode_obj_get_properties op;
    memset(&op, 0, sizeof op);
    op.obj_id = obj;
    op.obj_type = type;
    if (xioctl(fd, DRM_IOCTL_MODE_OBJ_GETPROPERTIES, &op))
        return -1;
    uint32_t n = op.count_props;
    *ids = calloc(n ? n : 1, sizeof **ids);
    *vals = calloc(n ? n : 1, sizeof **vals);
    op.props_ptr = (uintptr_t)*ids;
    op.prop_values_ptr = (uintptr_t)*vals;
    op.count_props = n;
    if (xioctl(fd, DRM_IOCTL_MODE_OBJ_GETPROPERTIES, &op)) {
        free(*ids);
        free(*vals);
        return -1;
    }
    return (int)(op.count_props < n ? op.count_props : n);
}

static int prop_name(int fd, uint32_t id, char *out)
{
    struct drm_mode_get_property p;
    memset(&p, 0, sizeof p);
    p.prop_id = id;
    if (xioctl(fd, DRM_IOCTL_MODE_GETPROPERTY, &p))
        return -1;
    memcpy(out, p.name, DRM_PROP_NAME_LEN);
    out[DRM_PROP_NAME_LEN - 1] = 0;
    return 0;
}

static void load_planes(struct dev *d)
{
    struct drm_mode_get_plane_res res;
    memset(&res, 0, sizeof res);
    if (xioctl(d->fd, DRM_IOCTL_MODE_GETPLANERESOURCES, &res) || !res.count_planes)
        return;
    uint32_t n = res.count_planes;
    uint32_t *ids = calloc(n, sizeof *ids);
    res.plane_id_ptr = (uintptr_t)ids;
    if (xioctl(d->fd, DRM_IOCTL_MODE_GETPLANERESOURCES, &res)) {
        free(ids);
        return;
    }
    for (uint32_t i = 0; i < n && d->nplanes < MAX_PLANES; i++) {
        struct plane *p = &d->planes[d->nplanes];
        memset(p, 0, sizeof *p);
        p->id = ids[i];
        p->type = -1;
        uint32_t *pids;
        uint64_t *pvals;
        int np = obj_props(d->fd, ids[i], DRM_MODE_OBJECT_PLANE, &pids, &pvals);
        if (np < 0)
            continue;
        for (int k = 0; k < np; k++) {
            char name[DRM_PROP_NAME_LEN];
            if (prop_name(d->fd, pids[k], name))
                continue;
            if (!strcmp(name, "type")) p->type = (int)pvals[k];
            else if (!strcmp(name, "FB_ID")) p->fb = pids[k];
            else if (!strcmp(name, "CRTC_ID")) p->crtc = pids[k];
            else if (!strcmp(name, "SRC_X")) p->src_x = pids[k];
            else if (!strcmp(name, "SRC_Y")) p->src_y = pids[k];
            else if (!strcmp(name, "SRC_W")) p->src_w = pids[k];
            else if (!strcmp(name, "SRC_H")) p->src_h = pids[k];
            else if (!strcmp(name, "FB_DAMAGE_CLIPS")) p->damage = pids[k];
        }
        free(pids);
        free(pvals);
        if (p->fb && p->type >= 0)
            d->nplanes++;
    }
    free(ids);
}

static struct dev *get_dev(int fd)
{
    for (int i = 0; i < MAX_DEVS; i++)
        if (S.devs[i].used && S.devs[i].fd == fd)
            return &S.devs[i];
    for (int i = 0; i < MAX_DEVS; i++) {
        struct dev *d = &S.devs[i];
        if (d->used)
            continue;
        memset(d, 0, sizeof *d);
        d->used = 1;
        d->fd = fd;
        load_planes(d);
        struct drm_get_cap c = {.capability = DRM_CAP_CURSOR_WIDTH};
        d->cursor_w = xioctl(fd, DRM_IOCTL_GET_CAP, &c) == 0 && c.value ? (uint32_t)c.value : 64;
        c.capability = DRM_CAP_CURSOR_HEIGHT;
        c.value = 0;
        d->cursor_h = xioctl(fd, DRM_IOCTL_GET_CAP, &c) == 0 && c.value ? (uint32_t)c.value : 64;
        char buf[1024];
        int n = snprintf(buf, sizeof buf, "thiết bị fd=%d: %d plane, cursor %ux%u:", fd, d->nplanes, d->cursor_w, d->cursor_h);
        for (int k = 0; k < d->nplanes && n < (int)sizeof buf - 40; k++)
            n += snprintf(buf + n, sizeof buf - n, " %u(%s)", d->planes[k].id, ptype(d->planes[k].type));
        logf_("%s", buf);
        return d;
    }
    return NULL;
}

static struct plane *find_plane(struct dev *d, uint32_t id)
{
    for (int i = 0; i < d->nplanes; i++)
        if (d->planes[i].id == id)
            return &d->planes[i];
    return NULL;
}

/* ---------- framebuffer thay thế ---------- */

/* Ảnh chữ thông báo đặt giữa màn trắng: file PNG do extension vẽ sẵn ($XDG_RUNTIME_DIR/remote-shield/shield.png).
 * Đọc bằng cairo đã nạp sẵn trong gnome-shell (dlsym), không phụ thuộc thư viện ngoài. */
/* Đặt ảnh PNG vào giữa khung (cắt nếu ảnh lớn hơn). Trả 1 nếu đã vẽ. */
static int blit_png(const char *path, uint8_t *px, uint32_t pitch, uint32_t w, uint32_t h)
{
    if (!path[0] || access(path, R_OK))
        return 0;
    void *(*from_png)(const char *) = (void *(*)(const char *))dlsym(RTLD_DEFAULT, "cairo_image_surface_create_from_png");
    int (*status)(void *) = (int (*)(void *))dlsym(RTLD_DEFAULT, "cairo_surface_status");
    int (*fmt)(void *) = (int (*)(void *))dlsym(RTLD_DEFAULT, "cairo_image_surface_get_format");
    int (*gw)(void *) = (int (*)(void *))dlsym(RTLD_DEFAULT, "cairo_image_surface_get_width");
    int (*gh)(void *) = (int (*)(void *))dlsym(RTLD_DEFAULT, "cairo_image_surface_get_height");
    int (*gs)(void *) = (int (*)(void *))dlsym(RTLD_DEFAULT, "cairo_image_surface_get_stride");
    unsigned char *(*gd)(void *) = (unsigned char *(*)(void *))dlsym(RTLD_DEFAULT, "cairo_image_surface_get_data");
    void (*flush)(void *) = (void (*)(void *))dlsym(RTLD_DEFAULT, "cairo_surface_flush");
    void (*destroy)(void *) = (void (*)(void *))dlsym(RTLD_DEFAULT, "cairo_surface_destroy");
    if (!from_png || !status || !fmt || !gw || !gh || !gs || !gd || !flush || !destroy) {
        logf_("không có cairo trong tiến trình, bỏ qua ảnh màn che");
        return 0;
    }
    void *s = from_png(path);
    if (!s)
        return 0;
    if (status(s) != 0) {
        logf_("không đọc được %s (cairo status %d)", path, status(s));
        destroy(s);
        return 0;
    }
    int done = 0;
    flush(s);
    int f = fmt(s); /* 0 = ARGB32, 1 = RGB24: cùng bố cục 4 byte/pixel với XRGB8888 */
    unsigned char *data = gd(s);
    if ((f == 0 || f == 1) && data) {
        uint32_t iw = (uint32_t)gw(s), ih = (uint32_t)gh(s), stride = (uint32_t)gs(s);
        uint32_t cw = iw < w ? iw : w, ch = ih < h ? ih : h;
        uint32_t ox = (w - cw) / 2, oy = (h - ch) / 2;
        for (uint32_t y = 0; y < ch; y++)
            memcpy(px + (size_t)(oy + y) * pitch + (size_t)ox * 4, data + (size_t)y * stride, (size_t)cw * 4);
        done = 1;
    }
    destroy(s);
    return done;
}

/* Vẽ nội dung khung màn che:
 *   có <run>/shield-<w>x<h>.png (ảnh toàn màn giống màn khóa, extension vẽ đúng kích thước) -> dùng ảnh đó;
 *   không có -> nền trắng + <run>/shield.png ở giữa (kiểu cũ). */
static void paint_fb(uint8_t *px, uint32_t pitch, uint32_t w, uint32_t h, size_t size)
{
    char full[600];
    snprintf(full, sizeof full, "%s/shield-%ux%u.png", S.rundir, w, h);
    if (!access(full, R_OK)) {
        memset(px, 0x00, size);
        if (blit_png(full, px, pitch, w, h))
            return;
    }
    memset(px, 0xFF, size);
    blit_png(S.overlay, px, pitch, w, h);
}

static void repaint_all(void)
{
    for (int i = 0; i < MAX_DEVS; i++) {
        struct dev *d = &S.devs[i];
        if (!d->used)
            continue;
        for (int k = 0; k < d->nfbs; k++) {
            struct fbent *e = &d->fbs[k];
            if (!e->transparent && e->px)
                paint_fb(e->px, e->pitch, e->w, e->h, e->size);
        }
    }
}

static uint32_t create_fb(struct dev *d, uint32_t w, uint32_t h, int transparent, struct fbent *out)
{
    struct drm_mode_create_dumb cd;
    memset(&cd, 0, sizeof cd);
    cd.width = w;
    cd.height = h;
    cd.bpp = 32;
    if (xioctl(d->fd, DRM_IOCTL_MODE_CREATE_DUMB, &cd)) {
        snprintf(S.last_err, sizeof S.last_err, "CREATE_DUMB %ux%u: %s", w, h, strerror(errno));
        return 0;
    }
    struct drm_mode_destroy_dumb dd = {.handle = cd.handle};
    struct drm_mode_map_dumb md;
    memset(&md, 0, sizeof md);
    md.handle = cd.handle;
    if (xioctl(d->fd, DRM_IOCTL_MODE_MAP_DUMB, &md)) {
        snprintf(S.last_err, sizeof S.last_err, "MAP_DUMB: %s", strerror(errno));
        xioctl(d->fd, DRM_IOCTL_MODE_DESTROY_DUMB, &dd);
        return 0;
    }
    void *px = mmap(NULL, cd.size, PROT_READ | PROT_WRITE, MAP_SHARED, d->fd, (off_t)md.offset);
    if (px == MAP_FAILED) {
        snprintf(S.last_err, sizeof S.last_err, "mmap dumb: %s", strerror(errno));
        xioctl(d->fd, DRM_IOCTL_MODE_DESTROY_DUMB, &dd);
        return 0;
    }
    if (transparent)
        memset(px, 0x00, cd.size); /* ARGB 0 = trong suốt */
    else
        paint_fb(px, cd.pitch, w, h, cd.size);

    struct drm_mode_fb_cmd2 f;
    memset(&f, 0, sizeof f);
    f.width = w;
    f.height = h;
    f.pixel_format = transparent ? DRM_FORMAT_ARGB8888 : DRM_FORMAT_XRGB8888;
    f.handles[0] = cd.handle;
    f.pitches[0] = cd.pitch;
    if (xioctl(d->fd, DRM_IOCTL_MODE_ADDFB2, &f)) {
        snprintf(S.last_err, sizeof S.last_err, "ADDFB2 %ux%u: %s", w, h, strerror(errno));
        munmap(px, cd.size);
        xioctl(d->fd, DRM_IOCTL_MODE_DESTROY_DUMB, &dd);
        return 0;
    }
    *out = (struct fbent){.w = w, .h = h, .fb_id = f.fb_id, .handle = cd.handle, .pitch = cd.pitch,
                          .transparent = transparent, .px = transparent ? NULL : px, .size = cd.size};
    if (transparent)
        munmap(px, cd.size);
    return f.fb_id;
}

static uint32_t get_fb(struct dev *d, uint32_t w, uint32_t h, int transparent)
{
    for (int i = 0; i < d->nfbs; i++) {
        struct fbent *e = &d->fbs[i];
        if (e->transparent == transparent && e->w >= w && e->h >= h)
            return e->fb_id;
    }
    if (d->nfbs >= MAX_FBS)
        return 0;
    struct fbent e;
    uint32_t id = create_fb(d, w, h, transparent, &e);
    if (!id) {
        logf_("không tạo được framebuffer: %s", S.last_err);
        return 0;
    }
    d->fbs[d->nfbs++] = e;
    logf_("tạo framebuffer %s %ux%u -> FB %u", transparent ? "trong suốt" : "màn che", w, h, id);
    return id;
}

#ifdef SELFTEST
static void free_fbs(struct dev *d)
{
    for (int i = 0; i < d->nfbs; i++) {
        uint32_t id = d->fbs[i].fb_id;
        if (d->fbs[i].px)
            munmap(d->fbs[i].px, d->fbs[i].size);
        xioctl(d->fd, DRM_IOCTL_MODE_RMFB, &id);
        struct drm_mode_destroy_dumb dd = {.handle = d->fbs[i].handle};
        xioctl(d->fd, DRM_IOCTL_MODE_DESTROY_DUMB, &dd);
    }
    d->nfbs = 0;
}
#endif

/* Vùng nguồn (SRC_*) plane đọc từ framebuffer, đơn vị pixel, làm tròn lên. */
static void src_extent(struct dev *d, struct atomic_req *req, struct plane *p, uint32_t *w, uint32_t *h)
{
    uint64_t sx = 0, sy = 0, sw = 0, sh = 0;
    int have = 0;
    for (uint32_t i = 0; i < req->cursor; i++) {
        struct req_item *it = &req->items[i];
        if (it->object_id != p->id)
            continue;
        if (it->property_id == p->src_x) { sx = it->value; have |= 4; }
        else if (it->property_id == p->src_y) { sy = it->value; have |= 8; }
        else if (it->property_id == p->src_w) { sw = it->value; have |= 1; }
        else if (it->property_id == p->src_h) { sh = it->value; have |= 2; }
    }
    if ((have & 15) != 15) { /* lệnh không mang đủ SRC_*: lấy giá trị hiện tại của plane */
        uint32_t *ids;
        uint64_t *vals;
        int n = obj_props(d->fd, p->id, DRM_MODE_OBJECT_PLANE, &ids, &vals);
        for (int k = 0; k < n; k++) {
            if (ids[k] == p->src_x && !(have & 4)) sx = vals[k];
            if (ids[k] == p->src_y && !(have & 8)) sy = vals[k];
            if (ids[k] == p->src_w && !(have & 1)) sw = vals[k];
            if (ids[k] == p->src_h && !(have & 2)) sh = vals[k];
        }
        if (n >= 0) {
            free(ids);
            free(vals);
        }
    }
    uint64_t ww = (sx + sw + 0xFFFF) >> 16, hh = (sy + sh + 0xFFFF) >> 16;
    if (!ww || !hh) { ww = 3840; hh = 2160; }
    if (ww > 8192) ww = 8192;
    if (hh > 8192) hh = 8192;
    *w = (uint32_t)ww;
    *h = (uint32_t)hh;
}

/* ---------- kiểm tra bố cục drmModeAtomicReq ---------- */

static int check_layout(void)
{
    void *(*alloc)(void) = (void *(*)(void))dlsym(RTLD_DEFAULT, "drmModeAtomicAlloc");
    int (*add)(void *, uint32_t, uint32_t, uint64_t) =
        (int (*)(void *, uint32_t, uint32_t, uint64_t))dlsym(RTLD_DEFAULT, "drmModeAtomicAddProperty");
    void (*fr)(void *) = (void (*)(void *))dlsym(RTLD_DEFAULT, "drmModeAtomicFree");
    if (!alloc || !add || !fr) {
        logf_("không tìm thấy hàm atomic của libdrm");
        return 0;
    }
    struct atomic_req *r = alloc();
    if (!r)
        return 0;
    add(r, 0x11223344u, 0x55667788u, 0xABCDEF0123ull);
    add(r, 7, 8, 9);
    int ok = r->cursor == 2 && r->size_items >= 2 && r->items &&
             r->items[0].object_id == 0x11223344u && r->items[0].property_id == 0x55667788u &&
             r->items[0].value == 0xABCDEF0123ull && r->items[1].object_id == 7 &&
             r->items[1].property_id == 8 && r->items[1].value == 9;
    fr(r);
    logf_("kiểm tra bố cục drmModeAtomicReq: %s", ok ? "khớp" : "KHÔNG khớp, chỉ ghi log");
    return ok;
}

/* ---------- cờ bật/tắt, trạng thái ---------- */

static void update_want(void)
{
    int w = access(S.flag, F_OK) == 0;
    if (w == S.want)
        return;
    S.want = w;
    S.need_status = 1;
    S.swapped_since_on = 0;
    if (w) {
        if (S.guard && access(S.marker, F_OK) != 0) {
            S.guard = 0;
            logf_("guard đã được gỡ (file marker đã xoá)");
        }
        if (S.guard) {
            logf_("cờ bật nhưng guard đang khoá (lần trước gnome-shell dừng khi đang thay khung). Xoá %s để gỡ.", S.marker);
            return;
        }
        int fd = open(S.marker, O_WRONLY | O_CREAT | O_CLOEXEC, 0644);
        if (fd >= 0)
            close(fd);
        logf_("BẬT thay khung (màn hình vật lý -> trắng)");
    } else {
        unlink(S.marker);
        if (S.swap_failed)
            logf_("xoá trạng thái lỗi thay khung");
        S.swap_failed = 0;
        logf_("TẮT thay khung (màn hình vật lý -> bình thường)");
    }
}

static void write_status(uint64_t now)
{
    if (!S.need_status && now - S.last_status_ms < 2000)
        return;
    S.need_status = 0;
    S.last_status_ms = now;
    char buf[4096], tmp[600];
    int n = snprintf(buf, sizeof buf,
                     "pid=%d\nlayout_ok=%d\nwant_blank=%d\nguard=%d\nswap_failed=%d\n"
                     "commits=%llu\nswapped_commits=%llu\nswapped_since_on=%llu\nfails=%llu\nlast_error=%s\n",
                     getpid(), S.layout_ok, S.want, S.guard, S.swap_failed,
                     (unsigned long long)S.total, (unsigned long long)S.swapped,
                     (unsigned long long)S.swapped_since_on, (unsigned long long)S.fails, S.last_err);
    for (int i = 0; i < MAX_DEVS; i++) {
        struct dev *d = &S.devs[i];
        if (!d->used)
            continue;
        n += snprintf(buf + n, sizeof buf - n, "dev fd=%d commits=%llu swapped=%llu\n", d->fd,
                      (unsigned long long)d->commits, (unsigned long long)d->swapped);
        for (int k = 0; k < d->nplanes && n < (int)sizeof buf - 120; k++) {
            struct plane *p = &d->planes[k];
            if (!p->fb_changes)
                continue;
            n += snprintf(buf + n, sizeof buf - n, "  plane %u (%s): FB_ID cuối=%llu, số lần đổi khung=%llu\n",
                          p->id, ptype(p->type), (unsigned long long)p->last_fb,
                          (unsigned long long)p->fb_changes);
        }
    }
    snprintf(tmp, sizeof tmp, "%s.tmp", S.status);
    int fd = open(tmp, O_WRONLY | O_CREAT | O_TRUNC | O_CLOEXEC, 0644);
    if (fd < 0)
        return;
    if (write(fd, buf, (size_t)n) < 0) { /* bỏ qua */ }
    close(fd);
    rename(tmp, S.status);
}

static void log_commit(struct dev *d, struct atomic_req *req, uint32_t flags)
{
    char buf[1024];
    int n = snprintf(buf, sizeof buf, "commit #%llu fd=%d flags=0x%x%s:", (unsigned long long)S.total, d->fd, flags,
                     (flags & DRM_MODE_ATOMIC_TEST_ONLY) ? " (TEST_ONLY)" : "");
    for (uint32_t i = 0; i < req->cursor && n < (int)sizeof buf - 60; i++) {
        struct plane *p = find_plane(d, req->items[i].object_id);
        if (p && req->items[i].property_id == p->fb)
            n += snprintf(buf + n, sizeof buf - n, " plane %u(%s) FB_ID=%llu", p->id, ptype(p->type),
                          (unsigned long long)req->items[i].value);
    }
    logf_("%s", buf);
}

/* ---------- hàm thay thế ---------- */

__attribute__((visibility("default"))) int drmModeAtomicCommit(int fd, struct atomic_req *req, uint32_t flags,
                                                               void *user_data)
{
    if (!S.real)
        S.real = (commit_fn)dlsym(RTLD_NEXT, "drmModeAtomicCommit");
    if (!S.real)
        return -ENOSYS;
    if (!S.active || !req)
        return S.real(fd, req, flags, user_data);

    struct { uint32_t idx; uint64_t old; } ch[MAX_CHANGES];
    int nch = 0;
    struct dev *d = NULL;
    int test = (flags & DRM_MODE_ATOMIC_TEST_ONLY) != 0;

    pthread_mutex_lock(&S.lock);
    if (S.layout_ok < 0)
        S.layout_ok = check_layout();
    uint64_t now = now_ms();
    if (now - S.last_check_ms >= 100) {
        S.last_check_ms = now;
        update_want();
        struct stat st;
        int64_t m = stat(S.gen, &st) == 0 ? (int64_t)st.st_mtim.tv_sec * 1000000000LL + st.st_mtim.tv_nsec : 0;
        if (m != S.gen_mtime) {
            S.gen_mtime = m;
            S.repaint = 1;
        }
    }
    if (S.repaint && S.want && S.layout_ok == 1) {
        S.repaint = 0;
        repaint_all(); /* đồng hồ / ảnh màn che vừa đổi: vẽ lại tại chỗ các khung đang dùng */
    }
    if (S.layout_ok == 1) {
        d = get_dev(fd);
        if (d) {
            if (!test) {
                S.total++;
                d->commits++;
                for (uint32_t i = 0; i < req->cursor; i++) {
                    struct plane *p = find_plane(d, req->items[i].object_id);
                    if (p && req->items[i].property_id == p->fb && req->items[i].value != p->last_fb) {
                        p->last_fb = req->items[i].value;
                        p->fb_changes++;
                    }
                }
                if (S.details < DETAIL_COMMITS) {
                    log_commit(d, req, flags);
                    S.details++;
                }
            }
            if (S.want && !S.guard && !S.swap_failed) {
                for (uint32_t i = 0; i < req->cursor && nch < MAX_CHANGES; i++) {
                    struct req_item *it = &req->items[i];
                    struct plane *p = find_plane(d, it->object_id);
                    if (!p)
                        continue;
                    if (it->property_id == p->fb && it->value != 0) {
                        uint32_t w, h;
                        src_extent(d, req, p, &w, &h);
                        int tr = p->type == PT_CURSOR;
                        if (tr) {
                            if (w < d->cursor_w) w = d->cursor_w;
                            if (h < d->cursor_h) h = d->cursor_h;
                        }
                        uint32_t fb = get_fb(d, w, h, tr);
                        if (!fb)
                            continue;
                        ch[nch].idx = i;
                        ch[nch].old = it->value;
                        nch++;
                        it->value = fb;
                    } else if (p->damage && it->property_id == p->damage && it->value != 0) {
                        ch[nch].idx = i;
                        ch[nch].old = it->value;
                        nch++;
                        it->value = 0;
                    }
                }
            }
        }
    }
    write_status(now);
    pthread_mutex_unlock(&S.lock);

    int ret = S.real(fd, req, flags, user_data);
    if (nch) {
        for (int k = nch - 1; k >= 0; k--)
            req->items[ch[k].idx].value = ch[k].old;
        if (ret < 0 && ret != -EBUSY && ret != -EAGAIN) {
            int first = ret;
            ret = S.real(fd, req, flags, user_data); /* gửi lại khung gốc */
            if (!test) {
                pthread_mutex_lock(&S.lock);
                S.swap_failed = 1;
                S.fails++;
                snprintf(S.last_err, sizeof S.last_err, "driver từ chối khung thay thế: %s", strerror(-first));
                logf_("%s; đã gửi lại khung gốc (ret=%d) và tạm dừng thay khung", S.last_err, ret);
                S.need_status = 1;
                write_status(now_ms());
                pthread_mutex_unlock(&S.lock);
            }
        } else if (ret == 0 && !test) {
            pthread_mutex_lock(&S.lock);
            S.swapped++;
            d->swapped++;
            if (S.swapped_since_on++ == 0) { /* khung trắng đầu tiên đã lên màn: báo ngay cho extension */
                S.need_status = 1;
                write_status(now_ms());
            }
            pthread_mutex_unlock(&S.lock);
        }
    }
    return ret;
}

/* ---------- khởi tạo ---------- */

static void strip_preload(void)
{
    const char *lp = getenv("LD_PRELOAD");
    if (!lp || !strstr(lp, "shield-shim"))
        return;
    char *copy = strdup(lp), *out = calloc(1, strlen(lp) + 1), *save = NULL;
    for (char *tok = strtok_r(copy, " :", &save); tok; tok = strtok_r(NULL, " :", &save)) {
        if (strstr(tok, "shield-shim"))
            continue;
        if (*out)
            strcat(out, ":");
        strcat(out, tok);
    }
    if (*out)
        setenv("LD_PRELOAD", out, 1);
    else
        unsetenv("LD_PRELOAD");
    free(copy);
    free(out);
}

static void mkdirs(const char *path)
{
    char tmp[512];
    snprintf(tmp, sizeof tmp, "%s", path);
    for (char *p = tmp + 1; *p; p++)
        if (*p == '/') {
            *p = 0;
            mkdir(tmp, 0755);
            *p = '/';
        }
    mkdir(tmp, 0755);
}

__attribute__((constructor)) static void shim_init(void)
{
    strip_preload();
    char comm[64] = {0};
    int fd = open("/proc/self/comm", O_RDONLY | O_CLOEXEC);
    if (fd >= 0) {
        ssize_t n = read(fd, comm, sizeof comm - 1);
        close(fd);
        if (n > 0 && comm[n - 1] == '\n')
            comm[n - 1] = 0;
    }
    if (strcmp(comm, "gnome-shell"))
        return;
    const char *home = getenv("HOME");
    const char *run = getenv("XDG_RUNTIME_DIR");
    if (!home || !run)
        return;
    char dir[512], disabled[512];
    snprintf(disabled, sizeof disabled, "%s/.config/remote-shield/shim-disabled", home);
    snprintf(dir, sizeof dir, "%s/.cache/remote-shield", home);
    mkdirs(dir);
    snprintf(S.log, sizeof S.log, "%s/shim.log", dir);
    snprintf(S.marker, sizeof S.marker, "%s/shim-blanking.marker", dir);
    snprintf(dir, sizeof dir, "%s/remote-shield", run);
    mkdirs(dir);
    snprintf(S.flag, sizeof S.flag, "%s/blank", dir);
    snprintf(S.status, sizeof S.status, "%s/shim-status", dir);
    snprintf(S.overlay, sizeof S.overlay, "%s/shield.png", dir);
    snprintf(S.rundir, sizeof S.rundir, "%s", dir);
    snprintf(S.gen, sizeof S.gen, "%s/shield.gen", dir);
    unlink(S.flag); /* phiên mới luôn bắt đầu ở trạng thái bình thường */
    if (access(disabled, F_OK) == 0) {
        logf_("pid %d: có %s -> không hoạt động", getpid(), disabled);
        return;
    }
    if (access(S.marker, F_OK) == 0) {
        S.guard = 1;
        logf_("pid %d: lần trước gnome-shell dừng khi đang thay khung -> khoá thay khung (guard). Xoá %s để gỡ.",
              getpid(), S.marker);
    }
    S.active = 1;
    logf_("pid %d: shield-shim đã nạp vào gnome-shell", getpid());
}

__attribute__((destructor)) static void shim_fini(void)
{
    if (S.active && S.marker[0])
        unlink(S.marker); /* thoát bình thường (đăng xuất) không tính là sự cố */
}

/* ---------- chương trình tự kiểm tra (build với -DSELFTEST) ---------- */
#ifdef SELFTEST
int main(int argc, char **argv)
{
    const char *path = argc > 1 ? argv[1] : "/dev/dri/card1";
    if (!dlopen("libdrm.so.2", RTLD_NOW | RTLD_GLOBAL)) {
        fprintf(stderr, "không mở được libdrm.so.2\n");
        return 1;
    }
    int ok = check_layout();
    int fd = open(path, O_RDWR | O_CLOEXEC);
    if (fd < 0) {
        perror(path);
        return 1;
    }
    struct drm_set_client_cap cc = {.capability = DRM_CLIENT_CAP_UNIVERSAL_PLANES, .value = 1};
    xioctl(fd, DRM_IOCTL_SET_CLIENT_CAP, &cc);
    cc.capability = DRM_CLIENT_CAP_ATOMIC;
    xioctl(fd, DRM_IOCTL_SET_CLIENT_CAP, &cc);
    struct dev *d = get_dev(fd);
    if (!d || !d->nplanes) {
        fprintf(stderr, "không đọc được plane\n");
        return 1;
    }
    for (int i = 0; i < d->nplanes; i++) {
        struct plane *p = &d->planes[i];
        printf("plane %u %-7s prop FB_ID=%u CRTC_ID=%u SRC_W=%u FB_DAMAGE_CLIPS=%u\n", p->id, ptype(p->type), p->fb,
               p->crtc, p->src_w, p->damage);
    }
    if (argc > 3) { /* shield-selftest <card> <thư-mục-run> <out.ppm> [WxH]: vẽ khung màn che như shim */
        dlopen("libcairo.so.2", RTLD_NOW | RTLD_GLOBAL);
        snprintf(S.rundir, sizeof S.rundir, "%s", argv[2]);
        snprintf(S.overlay, sizeof S.overlay, "%s/shield.png", argv[2]);
        uint32_t W = 1920, H = 1080;
        if (argc > 4)
            sscanf(argv[4], "%ux%u", &W, &H);
        uint32_t pitch = W * 4;
        uint8_t *buf = malloc((size_t)pitch * H);
        paint_fb(buf, pitch, W, H, (size_t)pitch * H);
        FILE *o = fopen(argv[3], "wb");
        fprintf(o, "P6\n%u %u\n255\n", W, H);
        for (size_t i = 0; i < (size_t)W * H; i++) {
            uint8_t rgb[3] = {buf[i * 4 + 2], buf[i * 4 + 1], buf[i * 4]};
            fwrite(rgb, 1, 3, o);
        }
        fclose(o);
        free(buf);
        S.overlay[0] = 0;
    }
    uint32_t white = get_fb(d, 1920, 1080, 0);
    uint32_t clear = get_fb(d, d->cursor_w, d->cursor_h, 1);
    printf("layout=%s white_fb=%u cursor_fb=%u %s\n", ok ? "OK" : "FAIL", white, clear, S.last_err);
    free_fbs(d);
    close(fd);
    return ok && white && clear ? 0 : 2;
}
#endif
