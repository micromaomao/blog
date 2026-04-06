// Compile:
//   gcc -o fork-test fork-test.c -O3
//
// Output:
//   root@feef72fcd655 ~# ./fork-test
//   I am the parent. Fork took 72195 ns to return
//   I am the child. It took 136221 ns to fork
//   root@feef72fcd655 ~# ./fork-test
//   I am the parent. Fork took 70692 ns to return
//   I am the child. It took 111261 ns to fork
//   root@feef72fcd655 ~# ./fork-test
//   I am the parent. Fork took 96310 ns to return
//   I am the child. It took 214569 ns to fork
//   root@feef72fcd655 ~# nproc
//   16

#include <stdlib.h>
#include <stdio.h>
#include <unistd.h>
#include <sys/syscall.h>
#include <stdint.h>
#include <time.h>
#include <sched.h>

// Note: this is not a very rigorous benchmark since clock_gettime itself causes
// a syscall and already takes a few microseconds, but is good enough as a rough
// estimate, especially if we cross-check it with kernel trace logs.

uint64_t monotonic_ns() {
  struct timespec ts;
  clock_gettime(CLOCK_MONOTONIC, &ts);
  return ts.tv_sec * 1000000000 + ts.tv_nsec;
}

int main(int argc, char const *argv[])
{
  uint64_t start = monotonic_ns();
  // libc's fork() actually uses `clone`, but if we're writing a ptrace
  // supervisor we're probably using `fork` directly.
  int ret = syscall(SYS_fork);
  sched_yield();
  uint64_t end = monotonic_ns();
  uint64_t elapsed = end - start;
  if (ret == 0) {
    printf("I am the child. It took %lu ns to fork\n", elapsed);
  } else {
    printf("I am the parent. Fork took %lu ns to return\n", elapsed);
  }
  return 0;
}
