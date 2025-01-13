#include <fcntl.h>
#include <unistd.h>
#include <stdio.h>
#include <sys/wait.h>

int main() {
  puts("Will now break in kernel debugger - interesting functions to break on:\n"
          "kernel_clone for fork entry\n"
          "dup_mm for just the copying memory mappings part\n");
  fflush(stdout);
  sleep(1);
  const char *g = "g\n";
  int fd = open("/proc/sysrq-trigger", O_WRONLY, 0);
  if (fd < 0) {
    perror("open");
    return 1;
  }
  int err = write(fd, g, 2);
  if (err < 0) {
    perror("write");
    return 1;
  }
  close(fd);
  int res = fork();
  if (res < 0) {
    perror("fork");
    return 1;
  }
  if (res != 0) {
    waitpid(res, NULL, 0);
  }
  return 0;
}
