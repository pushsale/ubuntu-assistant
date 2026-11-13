/* Giả lập Mutter: tạo lệnh atomic giống Mutter và gọi drmModeAtomicCommit qua shim.
 * Chạy với tên tiến trình "gnome-shell" để shim hoạt động. Không phải DRM master nên
 * lệnh thật sẽ bị từ chối (EACCES) -> kiểm tra nhánh thay khung, gửi lại khung gốc, khôi phục giá trị. */
#define _GNU_SOURCE
#include <dlfcn.h>
#include <fcntl.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/ioctl.h>
#include <unistd.h>
#include <drm/drm.h>
#include <drm/drm_mode.h>
struct req_item { uint32_t object_id, property_id; uint64_t value; uint32_t cursor; };
struct atomic_req { uint32_t cursor, size_items; struct req_item *items; };
void *drmModeAtomicAlloc(void);
int drmModeAtomicAddProperty(void *, uint32_t, uint32_t, uint64_t);
int drmModeAtomicCommit(int, void *, uint32_t, void *);
void drmModeAtomicFree(void *);
int main(int argc, char **argv) {
    int fd = open("/dev/dri/card1", O_RDWR | O_CLOEXEC);
    struct drm_set_client_cap cc = {DRM_CLIENT_CAP_UNIVERSAL_PLANES, 1};
    ioctl(fd, DRM_IOCTL_SET_CLIENT_CAP, &cc);
    cc.capability = DRM_CLIENT_CAP_ATOMIC; ioctl(fd, DRM_IOCTL_SET_CLIENT_CAP, &cc);
    const char *flag = argv[1];
    for (int round = 0; round < 2; round++) {
        if (round == 1) { close(open(flag, O_CREAT | O_WRONLY, 0644)); usleep(150000); }
        struct atomic_req *r = drmModeAtomicAlloc();
        /* plane 52 primary: FB_ID(18)=999 CRTC_ID(21)=? SRC_W/H 1920x1080 (16.16); plane 57 cursor FB 998 */
        drmModeAtomicAddProperty(r, 52, 18, 999);
        drmModeAtomicAddProperty(r, 57, 18, 998);
        /* tìm id thuộc tính SRC_W/SRC_H không cần: shim tự đọc giá trị hiện tại nếu thiếu */
        int ret = drmModeAtomicCommit(fd, r, DRM_MODE_PAGE_FLIP_EVENT | DRM_MODE_ATOMIC_NONBLOCK, NULL);
        printf("round %d (cờ %s): ret=%d, giá trị sau khi gọi: plane52 FB=%llu plane57 FB=%llu\n", round,
               round ? "BẬT" : "tắt", ret, (unsigned long long)r->items[0].value, (unsigned long long)r->items[1].value);
        drmModeAtomicFree(r);
    }
    return 0;
}
