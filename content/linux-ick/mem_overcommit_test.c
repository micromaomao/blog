/*
 * 1. In the kernel, add `noinline` to handle_pte_fault and do_anonymous_page
 *   (alternatively, figure out the offset using gdb and kprobe on that in trace_mem_overcommit.bt)
 * 2. Run:
 *   echo never > /sys/kernel/mm/transparent_hugepage/enabled
 *   bpftrace trace_mem_overcommit.bt -c ./mem_overcommit_test
 */
#include <stdint.h>
#include <stdio.h>
#include <sys/mman.h>
#include <unistd.h>
#include <stdlib.h>
#include <string.h>
#include <fcntl.h>
#include <errno.h>

void detect_hugepage_warn(void) {
  int fd = open("/sys/kernel/mm/transparent_hugepage/enabled", O_RDONLY);
  if (fd == -1) {
    if (errno == ENOENT) {
      return;
    }
    perror("open");
    exit(1);
  }
  char buf[256];
  ssize_t n = read(fd, buf, sizeof(buf));
  if (n == -1) {
    perror("read");
    close(fd);
    exit(1);
  }
  buf[n] = '\0';
  close(fd);
  if (strstr(buf, "[never]") == NULL) {
    fprintf(stderr, "Warning: detected transparent hugepage is not disabled\n");
    fprintf(stderr, "Please run: echo never > /sys/kernel/mm/transparent_hugepage/enabled\n");
    fprintf(stderr, "Otherwise you won't see the do_anonymous_page call\n");
    fflush(stderr);
  }
}

int main(int argc, char const *argv[]) {
  detect_hugepage_warn();
  uint8_t *address = (uint8_t *)0x1234567000;
  size_t len = (1ul << 24);
  if (mmap(address, len, PROT_READ | PROT_WRITE,
           MAP_PRIVATE | MAP_ANONYMOUS | MAP_FIXED, -1, 0) == MAP_FAILED) {
    perror("mmap");
    _exit(1);
  }
  address[len / 2] = 0x33;
  munmap(address, len);
  _exit(0);
}
