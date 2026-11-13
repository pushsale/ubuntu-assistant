#!/usr/bin/env bash
# Build thư viện shield-shim.so và chương trình tự kiểm tra.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p build
CFLAGS="-O2 -g -Wall -Wextra -Wno-unused-parameter -Wno-format-truncation -fvisibility=hidden"
gcc $CFLAGS -fPIC -shared -o build/shield-shim.so shield-shim.c -ldl -lpthread
gcc $CFLAGS -DSELFTEST -o build/shield-selftest shield-shim.c -ldl -lpthread
echo "Đã build: build/shield-shim.so, build/shield-selftest"
