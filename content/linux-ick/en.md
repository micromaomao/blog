---
title: "Using the Linux kernel to help me crack an executable quickly"
tags: ["Linux", "systems programming", "reverse engineering", "performance"]
time: "2025-01-01T23:21:38+00:00"
discuss:
  "GitHub": "https://github.com/micromaomao/linux-dev/issues"
snippet: >-
  A few weeks ago I found a reverse engineering problem which basically boiled down to running a heavily obfuscated Linux binary and entering the correct number to get it to print a flag. Fortunately, the interesting bits of the program ran quite fast – after reading the input, it spends around 5us before printing out whether the guess was correct or not. This means that even a brute-force search of the possible inputs could finish in a reasonable time, and there is no need to expend much effort on actual reverse engineering if we don't have to. The only tricky part is, how do we convince it to try different inputs as fast as this?
cover_alt: |
  A five-panel comic featuring the Linux mascot Tux with a bandage placed above it, and a box with a question-mark.

  Panel 1: The box says “Am I being traced??” and Linux says “No trust me.”
  Panel 2: The box says “Ok now guess the number”.
  Panel 3: Linux says “1” and the box says “lol no, now get lost”.
  Panel 4: The background has 2 clocks in random rotation and shear, and also has some lines which says “ick_revert_proc: Restoring CoW'd page at 0x00000000005cxxxx”, and the box is wrapped in a squiggly blue circle, and is itself distorted.
  Panel 5: The box thinks “(hmm what was that must have been the wind)” and Linux says “jk i mean 2”.
draft: true
---

![cover](./cover.png)

Truth be told, I've never been really good at CTFs, but I do enjoy solving challenges at my own pace, and exploring perhaps less conventional methods, learning more about programming in the process. A few weeks ago I found a reverse engineering problem which basically boiled down to running a Linux binary and entering the correct number to get it to print a flag. The program was heavily obfuscated, has anti-debugging techniques, and potentially utilized self-modifying code, but `strace` shows that, aside from those, it did not try to do anything fancy with system calls, attempt to save files, or communicate via network.

Fortunately, the _interesting_ bits of the program ran quite fast &ndash; after reading the input, it spends around 5us (0.005ms) before printing out whether the guess was correct or not. The input space was also very managable &ndash; between 0 to 3,000,000. This means that even a brute-force search of the possible inputs could finish in a reasonable time, and there is no need to expend much effort on actual reverse engineering if we don't have to. The only tricky part is, how do we convince it to try different inputs as fast as this?

After considering some alternatives, my approach for solving this eventually ended up being a self-taught lesson in kernel hacking.

<div class="make-toc"></div>

## Environment

Before we get into more investigation, let's quickly explain what my test environment for this looks like. Since I'm not a fan of running random binaries from the Internet on my host system, we will only ever run the target binary in a VM. In fact, since there will be a good amount of kernel hacking today, we need a VM for which which we can easily boot our hacked kernel in. Previously I made some shell scripts which comes in handy. It:

- Allows me to easily run a QEMU VM with any kernel changes I want by directly booting from a compiled vmlinux.
- Hooks up a serial console and 9pfs root (mapped to a separate file system on the host) for convenience.
- Uses a relatively minimal kernel configuration and lightweight startup script &mdash; VM boots up in 2 seconds.
- Builds the rootfs with Docker, pre-installing things like `strace`, `gdb`, `trace-cmd`, etc.

Once you've checked that you have Docker and QEMU installed, you can get started with the same environment by cloning [micromaomao/linux-dev](https://github.com/micromaomao/linux-dev), running `make -j$(nproc)` to compile the kernel, then `.dev/startvm.sh` to build the rootfs (if not already present) and start the VM (your user account might need to be in the `kvm` group). If you are on ARM, remove the `-enable-kvm` and `-cpu host` flag in startvm.sh to use emulation instead.

![A screenshot of a terminal running the startvm.sh script. The last line is a bash prompt.](./startvm.png)

## Initial investigation

A straightforward, first approach would be to just run it repeatedly. However, with such a short runtime between getting the input and printing the result, any significant overhead in either the initialization of the executable itself, or the time spent in the script used to repeatedly run it quickly starts to dominate. A quick test would be to run it under `strace` and see how long it takes from the initial `execve` to the first `read`. That would be a good starting point to understand more about the program and catch any potentially surprising behavior, so let's do that first.

<p class="warn">
  Quick reminder again that you should not run or even interact with untrusted stuff directly on your host system. This include running them under <code>strace</code>, <code>gdb</code>, or even using <code>ldd</code> on them.
</p>

<style>
  .irrelevant {
    color: #aaa;
  }
  .comment {
    color: rgb(58, 113, 231);
    font-weight: bold;
  }
  .green {
    color: rgb(33, 138, 24);
  }
  .placeholder {
    color: rgb(33, 138, 24);
    font-style: italic;
  }
  .highlight {
    background-color: rgb(189, 253, 183);
    font-weight: bold;
  }
  .red-highlight {
    color: #dd0000;
    font-weight: bold;
  }
</style>

<pre>
<span class="irrelevant">$ strace -o strace.log --timestamps=ns ./hackme
...
$ cat strace.log</span>
21:00:00.076244725 execve("./hackme", ["./hackme"], 0x7ffc71a76088 /* 13 vars */) = 0
21:00:00.082059770 open("/proc/self/exe", O_RDONLY) = 3
21:00:00.085364610 mmap(NULL, 663446, PROT_READ|PROT_WRITE, MAP_PRIVATE|MAP_ANONYMOUS, -1, 0) = 0x7f7865402000
<span class="comment">// mapping itself as (non-persistent) read-write</span>
21:00:00.087883357 mmap(0x7f7865402000, 663048, PROT_READ|PROT_WRITE, MAP_PRIVATE|MAP_FIXED, 3, 0) = 0x7f7865402000
21:00:00.090062941 mprotect(0x7f78654a3000, 3990, PROT_READ|PROT_EXEC) = 0
21:00:00.092506797 readlink("/proc/self/exe", "/hackme", 4095) = 7
21:00:00.095318319 mmap(0x400000, 1855488, PROT_NONE, MAP_PRIVATE|MAP_FIXED|MAP_ANONYMOUS, -1, 0) = 0x400000
21:00:00.097642653 mmap(0x400000, 1536, PROT_READ|PROT_WRITE, MAP_PRIVATE|MAP_FIXED|MAP_ANONYMOUS, -1, 0) = 0x400000
21:00:00.099838908 mprotect(0x400000, 1536, PROT_READ) = 0
<span class="comment">// rwx... I later realized this executable has gone through a packer</span>
21:00:00.102363996 mmap(0x401000, 1420157, PROT_READ|PROT_WRITE|PROT_EXEC, MAP_PRIVATE|MAP_FIXED|MAP_ANONYMOUS, -1, 0x1000) = 0x401000
<span class="comment">// ... more stuff follows which aren't too interesting for now ...</span>
<span class="irrelevant">21:00:00.129039501 mprotect(0x401000, 1420157, PROT_READ|PROT_EXEC) = 0
21:00:00.132023341 mmap(0x55c000, 346488, PROT_READ|PROT_WRITE, MAP_PRIVATE|MAP_FIXED|MAP_ANONYMOUS, -1, 0x15c000) = 0x55c000
21:00:00.138600815 mprotect(0x55c000, 346488, PROT_READ) = 0
21:00:00.141142324 mmap(0x5b1000, 49832, PROT_READ|PROT_WRITE, MAP_PRIVATE|MAP_FIXED|MAP_ANONYMOUS, -1, 0x1b1000) = 0x5b1000
21:00:00.143710481 mprotect(0x5b1000, 49832, PROT_READ|PROT_WRITE) = 0
21:00:00.145928557 mmap(0x5be000, 27880, PROT_READ|PROT_WRITE, MAP_PRIVATE|MAP_FIXED|MAP_ANONYMOUS, -1, 0) = 0x5be000
21:00:00.148246519 mmap(NULL, 4096, PROT_READ, MAP_PRIVATE, 3, 0) = 0x7f7865401000
21:00:00.150516772 close(3)             = 0
21:00:00.153247606 munmap(0x7f7865402000, 663446) = 0
21:00:00.155881587 arch_prctl(0x3001 /* ARCH_??? */, 0x7ffce824f170) = -1 EINVAL (Invalid argument)
21:00:00.158451970 brk(NULL)            = 0x5c5000
21:00:00.160858466 brk(0x5c5d80)        = 0x5c5d80
21:00:00.163373055 arch_prctl(ARCH_SET_FS, 0x5c5400) = 0
21:00:00.165862687 set_tid_address(0x5c56d0) = 184
21:00:00.168069772 set_robust_list(0x5c56e0, 24) = 0
21:00:00.170348551 rseq(0x5c5d20, 0x20, 0, 0x53053053) = 0
21:00:00.172586062 prlimit64(0, RLIMIT_STACK, NULL, {rlim_cur=8192*1024, rlim_max=RLIM64_INFINITY}) = 0
21:00:00.174898664 readlinkat(AT_FDCWD, "/proc/self/exe", "/hackme", 4096) = 7
21:00:00.177229490 getrandom("\xb8\xaa\xbf\x47\x80\xa4\x0a\x0e", 8, GRND_NONBLOCK) = 8
21:00:00.179682734 brk(NULL)            = 0x5c5d80
21:00:00.181862768 brk(0x5e6d80)        = 0x5e6d80
21:00:00.183994583 brk(0x5e7000)        = 0x5e7000
21:00:00.186285765 mprotect(0x5b1000, 40960, PROT_READ) = 0
21:00:00.188569383 futex(0x5bd9dc, FUTEX_WAKE_PRIVATE, 2147483647) = 0</span>
<span class="comment">// Detecting debugger by looking for TracerPid?</span>
21:00:00.190868059 openat(AT_FDCWD, "/proc/self/status", O_RDONLY) = 3
21:00:00.193172756 read(3, "Name:\thackme\nUmask:\t0022\nState:\t"..., 8191) = 1076
<span class="comment">// ... more strace output ...</span>
</pre>

I suspect it is detecting debuggers and potentially changing its behavior. After writing this I later found out that actually it will pretend to run as normal even when it has detected a tracer, but actually will not print the flag even with the right input. For now, I found the code that puts that number in `/proc/self/status` by simply searching for &ldquo;TracerPid&rdquo;:

<a class="make-diff" href="./diffs/0001-hide-TracerPid.patch"></a>

With the linux-dev environment I mentioned earlier, we can simply make the change, then run `make -j16` (assuming your PC has 16 CPU threads) to produce a new kernel image, then kill the old VM (with Ctrl-D on the console or `.dev/stopvm.sh` if it's stuck) and run `startvm.sh` again.

<p class="info">
  You can apply the change above by copying the entire patch, then do <code>git apply</code>, paste it in, and hit Ctrl-D.
</p>

It then proceeded to do this, which I assume is a second layer of debugger detection:

```
ptrace(PTRACE_TRACEME) = -1 EPERM (Operation not permitted)
```

It is probably looking for whether this call returns a `-EPERM`, which would indicate that the process is (already) being traced. But since we're already making kernel changes, this is not difficult to work around either. We can find the relevant function by searching for `PTRACE_TRACEME`, which will quickly surface the function `ptrace_traceme`:

<a class="make-diff" href="./diffs/0002-ptrace_traceme-return-0.patch"></a>

<p class="info">
  Quick note: instead of making such changes to the kernel, there are alternative to <code>strace</code> which relies on seccomp-unotify instead of ptrace, which also gets around anti-debugging techniques that targets ptrace, and may be more convenient to use in other situations.
</p>

Now let's try `strace` it again:

<pre>
<span class="irrelevant">$ strace -o strace.log --timestamps=ns ./hackme
...
$ cat strace.log
21:01:00.368065520 execve("./hackme", ["./hackme"], 0x7ffe48cd5cb8 /* 6 vars */) = 0
...</span>
21:01:00.486692889 openat(AT_FDCWD, "/proc/self/status", O_RDONLY) = 3
21:01:00.489438989 read(3, "Name:\thackme\nUmask:\t0022\nState:\t"..., 8191) = 1066
21:01:00.491976961 close(3)             = 0
21:01:00.494425997 getrandom("\x75\x79\x93\x7f\x58\x99\xe3\x3e", 8, 0) = 8
21:01:00.496887787 getrandom("\x21\x5f\xfa\x83\x6c\x93\xef\x97", 8, 0) = 8
<span class="green">21:01:00.499471244 ptrace(PTRACE_TRACEME) = 0   <b>// yay</b></span>
21:01:00.501847234 getrandom("\x32\x5b\x46\xf2\x18\x84\xee\x3e", 8, 0) = 8
<span class="irrelevant">// ... more getrandom ...</span>
21:01:00.530190685 getrandom("\x25\x69\xff\xa5\x61\x13\x9d\x82", 8, 0) = 8
<span class="comment">// Detecting if stdin/stdout is a terminal before read/write...
// Could be using this to decide if it will buffer IO, or actual anti-scripting measure?</span>
21:01:00.532301961 newfstatat(1, "", {st_mode=S_IFCHR|0600, st_rdev=makedev(0x5, 0x1), ...}, AT_EMPTY_PATH) = 0
21:01:00.535515472 ioctl(1, TCGETS, {c_iflag=ICRNL|IXON, c_oflag=NL0|CR0|TAB0|BS0|VT0|FF0|OPOST|ONLCR, c_cflag=B115200|CS8|CREAD|HUPCL|CLOCAL, c_lflag=ISIG|ICANON|ECHO|ECHOE|ECHOK|IEXTEN|ECHOCTL|ECHOKE, ...}) = 0
21:01:00.539257429 write(1, <span class="irrelevant" style="font-style: italic;">startup output...</span>, 48) = 48
<span class="irrelevant">// ...</span>
21:01:00.544755153 newfstatat(0, "", {st_mode=S_IFCHR|0600, st_rdev=makedev(0x5, 0x1), ...}, AT_EMPTY_PATH) = 0
21:01:00.547057135 ioctl(0, TCGETS, {c_iflag=ICRNL|IXON, c_oflag=NL0|CR0|TAB0|BS0|VT0|FF0|OPOST|ONLCR, c_cflag=B115200|CS8|CREAD|HUPCL|CLOCAL, c_lflag=ISIG|ICANON|ECHO|ECHOE|ECHOK|IEXTEN|ECHOCTL|ECHOKE, ...}) = 0
21:01:00.549331495 read(0, "1\n", 4096) = 2
<span class="green"><b>// Note slight pause here due to input from serial terminal.</b></span>
21:01:00.551503575 write(1, "Nope"..., 43) = 43
21:01:00.554241515 exit_group(0)        = ?
21:01:00.556739011 +++ exited with 0 +++
</pre>

If we use the kernel tracing tool `trace-cmd` (which interacts with [ftrace](https://www.kernel.org/doc/html/latest/trace/ftrace.html) and related APIs designed for both kernel debugging and performance tracing), we can find out how long the program spends computing the result after reading the input, not including time spent in the actual I/O, and also without any `strace` overhead (which was actually quite significant when you're looking at sub-ms level).

To do this, we can trace the `syscalls` family of events. We're specifically interested in `read` and `write`, and each syscall has two events we can trace: `sys_enter_...` and `sys_exit_...`. We specify these events with `-e`, and `-F -c` to only trace events from children processes.

```sh
trace-cmd record -e 'syscalls/sys_*_read'  -e 'syscalls/sys_*_write' -F -c ./hackme
trace-cmd report
```

<pre>
<span class="irrelevant">cpus=2
          hackme-82    [000] .....     4.364735: sys_exit_write:       0x1
          hackme-82    [000] .....     4.431209: sys_enter_read:       fd: 0x00000003, buf: 0x005c6920, count: 0x00001fff
          hackme-82    [000] .....     4.431220: sys_exit_read:        0x42c
          hackme-82    [000] .....     4.431236: sys_enter_write:      fd: 0x00000001, buf: 0x005c6920, count: 0x00000030
          hackme-82    [000] .....     4.431243: sys_exit_write:       0x30
          hackme-82    [000] .....     4.431244: sys_enter_write:      fd: 0x00000001, buf: 0x005c6920, count: 0x00000026
          hackme-82    [000] .....     4.431244: sys_exit_write:       0x26</span>
          hackme-82    [000] .....     4.431246: sys_enter_read:       fd: 0x00000000, buf: 0x005c8960, count: 0x00001000
          hackme-82    [001] .....     <span class="highlight">5.737281</span>: sys_exit_read:        0x2
          hackme-82    [001] .....     <span class="highlight">5.737292</span>: sys_enter_write:      fd: 0x00000001, buf: 0x005c6920, count: 0x0000002b
<span class="irrelevant">          hackme-82    [001] .....     5.738621: sys_exit_write:       0x2b</span>
</pre>

We can ignore everything that is not reading from stdin (fd = 0) or writing to stdout (fd = 1) after that. Subtracting the two green numbers, that's 11us from returning from `read` to attempting `write`! On the other hand, getting to the first `read` from the start of the program took almost 200ms, and so if we have to run the whole thing repeatedly (for example, in a bash loop), it will be 200ms <tex>\times</tex> 3,000,000 <tex>\approx</tex> 7 days! Now, you can of course use more CPU cores and run multiple instances of this loop at once, but that's not a very interesting solution. In this case the challenge is also time-sensitive and so we need something better.

Notice that the program doesn't really try to do anything fancy (at least not externally visible) between `read` and `write` &ndash; all it does is spin some numbers around in its own memory, then spits out &lsquo;Correct&rsquo; plus the flag, or &lsquo;Nope&rsquo; if the guess was wrong. This means that, in theory, if we can perfectly restore the program's memory and register states<footnote>
Technically there's not all of the state a program could rely on or change, even without issuing any syscalls. For example, it can use the raw `rdtsc` assembly instruction to measure the current time, and deduce if it's being tricked. But in this case restoring registers and memory alone works well enough.
</footnote>, we can instantly start trying a different input, then another one in 10us (when I ran it fast enough often it finishes within 5), and so on until we find the right number. Without the overhead of even forking another process, this has the potential to be a lot faster &ndash; we're basically turning the whole input validation process into a `for` loop! It's just that the &lsquo;`for`&rsquo; in this case is outside the program. <img src="./hehe.png" alt="Hehe" style="width: 1.2em; vertical-align: -5px;">

## What if we get the kernel to try numbers for us?

Recently I have also been getting very interested in Linux kernel development (from debugging weird kernel panics at work <img src="smiling-face-with-tear.png" alt="&#x1F972;" style="width: 1.2em; vertical-align: -5px;">), so I decided why not turn this into a kernel programming exercise, and try to get Linux to automatically try all the possible inputs for me, and restore the program state in between inputs, as suggested earlier?

The core idea is:

1. We can identify the process we're interested in from its name (&ldquo;`hackme`&rdquo;).
2. When a target process attempts to `read` from stdin, we: \
    a) Save off its register states; \
    b) Write-protect all its memory pages; \
    c) Inject the next input into the read buffer.
3. When a write protection fault happens on our target process, we: \
    a) check if it is one of the mapping we've previously write-protected; \
    b) if so, we save off an &lsquo;original&rsquo; copy of the page being written to, and allow the write to continue.
4. When the target process attempts a `write` to stdout, we: \
    a) Check if the output indicate a wrong guess (whether it contains the word &ldquo;Nope!&rdquo;); \
    b) If the output contains Nope, restore all modified memory pages to their original content, restore register states, and re-run the `read` syscall, which will cause the next input to be injected; \
    c) Otherwise, we just let the process continue. If it prints the flag out, we will see it in the console.

Now, this might seem like massive overkill, and it probably is, but hear me out:

- This is basically as fast as we can hope to get without non-trivial amount of careful reverse engineering.<footnote>
Insert _girl will literally invent new kernel feature instead of doing actual reverse engineering_ joke here</footnote>
Compared to alternative, user-space approach with ptrace (which I will explore at the end of this article), we avoid any overhead from ptrace-ing &ndash; there is no context switching or waiting between processes, and we can truly run the brute-force loop at the fastest possible speed.<footnote>
Ok, technically there is another way that can be basically as fast, and which doesn't involve kernel modifications. You can instead use `SECCOMP_RET_TRAP` with a seccomp bpf filter to have the kernel turn the syscall you're interested into a `SIGSYS`, and inject code into the program to handle this signal. This gives you the functionality of a ptrace-based syscall interceptor (your injected code can save/restore registers via the `ucontext` reference, and of course memory too) without the cost of ptrace. But this is arguably getting into wilder territory than some not-too-complex kernel modifications. There are real world projects which does this for a very good reason &ndash; sandboxing. See [gVisor Systrap](https://gvisor.dev/blog/2023/04/28/systrap-release/) for more detail.
</footnote> From my testing, when the input-checking code is ran in a tight loop this way, it is even faster and often takes aound 5us. 5us <tex>\times</tex> 3,000,000 is _15 seconds_.
- While correctly write-protecting the memory pages, saving them off on write fault, and restoring them might sound tricky, with the way Linux manages writable pages it is actually surprisingly straightforward. This is because even for a writable mapping, pages starts off write-protected, and the kernel only makes them actually writable on the first write attempt. This means that there are very natural places we can add our code to, and we don't even have to actually change any permissions, etc.
- Hacking the kernel is fun, at least to me <img src="./init.png" alt="Small Yuki Nagato emote" style="width: 1.2em; vertical-align: -5px;">, and I learn a lot this way. In the future if I have a similar problem but a lot larger input space, what we did here might prove to be useful again.

I will now walk through each step one by one, as laid out above. If you as the reader don't have a lot of kernel experience (I certainly don't), hopefully by going like this, this will not be too difficult to follow:

### Identify and mark the target process

The first step (step 1) is to identity and mark the process we're interested in. In Linux, each thread is represented by a [`struct task_struct`](https://github.com/micromaomao/linux-dev/blob/ick/include/linux/sched.h#L778), which contains things like the PID, process name, memory mappings, and a thousand other things. We can of course add our own data to this struct &ndash; for example, we can have a `bool` to indicate whether a process<footnote>
Technically, anything stored in the `task_struct` is per-thread, but in this case our target only has one thread, and so saying &lsquo;process&rsquo; is correct here. Plus, even if it has multiple threads, our marking would be copied to the other threads when it tries to `clone`.
</footnote> is our hack target, and use it to decide if we should do special things in our modified `read`/`write` syscall handlers (we don't want to break unrelated processes like the shell, for example).

You probably know that when you run an executable, the shell forks a subprocess then run `exec` with the command arguments. If we assume our target binary is always named &ldquo;`hackme`&rdquo;, we can check for this in the handler for `exec`, and set the `bool` we added previously to `true`.

With some searching around and perhaps tracing function calls with `trace-cmd` (which juse uses [ftrace](https://www.kernel.org/doc/html/latest/trace/ftrace.html)), we find that there is a common function for `execve` and `execveat` &ndash; [`do_execveat_common`](https://github.com/micromaomao/linux-dev/blob/ick/fs/exec.c#L1876), and so we can add our code there, and add the additional field to the `task_struct`:

<a class="make-diff" href="./diffs/0003-set-hack_target.patch"></a>

Note that `current` is just a macro for a pointer to the current thread's `task_struct`, and `pr_info` prints to the syslog which in our case appears on the console.

We also added the correct initialization of `.hack_target` for unrelated threads to `init_task`, which is what every other processes are forked from. When a process `fork`s or `clone`s, the entire task struct is first `memcpy`'d across (see [`arch_dup_task_struct` (arch/x86/kernel/process.c)](https://github.com/micromaomao/linux-dev/blob/ick/arch/x86/kernel/process.c#L93)), and so there's no other place we need to initialize this (except for in `execve` when we detected a hack target).

Let's test this out:

<pre>
<span class="irrelevant">&gt; make -j$(nproc)
...
&gt; ./.dev/startvm.sh
...
[    0.000000][    T0] Linux version 6.12.1-dev-00019-gc33353343963-dirty ...
...</span>
root@feef72fcd655:/# ./hackme
<span class="highlight">[    5.050260][   T79] execveat: ./hackme[79] to be hacked</span>
<span class="placeholder">(program prints startup message normally)</span>
root@feef72fcd655:/# cp hackme dont-hack-me
root@feef72fcd655:/# ./dont-hack-me
<span class="placeholder">(program prints startup message normally)</span>
root@feef72fcd655:/#
</pre>

Nice :)

### Some ground work for our new &lsquo;feature&rsquo;

Our next step (step 2) is to figure out a way to save off the state of the target process when it calls `read` &ndash; in some sense, &lsquo;checkpoint&rsquo; it, and then inject our number guess. I'm going to give my special kernel feature that does this a slick name: _ick_, which stands for Instant ChecKpoint. We will create some utility functions which we can call in our patched `read`/`write` to checkpoint and restore the process, as well as a way to clean up the saved state should the process exits unexpectedly. Let's start by creating our header and C file for this feature, adding a basic `struct ick_checked_process*` pointer in `task_struct` for us to hold various data (like the saved off memory pages) later, and declare our functions.

While this is not really necessary, let's also add a proper config option for our silly little feature &ndash; it's not difficult to do, and follows the rest of Linux. We will then gate all ick-related code within `#ifdef CONFIG_ICK` blocks.

<a class="make-diff" href="./diffs/0004-basic-files-for-ick.patch"></a>

<p class="info">
  In case you didn't know, the proper way to have a function without parameters in C is to use <code>void</code> in the parameter list, like <code>void myfunc(void)</code>.
</p>

### Patching `read`, inject our guess

Next, we can finish off the relatively easier part of step 2 &ndash; handling `read`, calling the checkpoint function, and injecting our next guess. Again, we can use `ftrace` to figure out the best function to change. There are more &lsquo;complicated&rsquo; variant of the `read` syscall that takes a `struct iovec`, but that's not what our target binary uses, so we won't worry about that.

<a class="make-diff" href="./diffs/0005-read-calls-checkpoint-and-inject-guess.patch"></a>

While we can use `strace` to see whether we're sending back the right thing to the user-space, for ease of debugging we can write our own test binary which prints out the number received, and also, for now, loops back itself, so that we can see if the guess increments correctly: [my-hackme-looped.cpp](./my-hackme-looped.cpp)

<pre>
<span class="irrelevant">make; ./dev/startvm.sh</span>
root@feef72fcd655:/# ./my-hackme-looped | head
[   34.542186][   T83] execveat: ./my-hackme-looped[83] to be hacked
Enter number: Nope! 1 was a wrong guess. The correct number is 574165.
Enter number: Nope! 2 was a wrong guess. The correct number is 574165.
Enter number: Nope! 3 was a wrong guess. The correct number is 574165.
Enter number: Nope! 4 was a wrong guess. The correct number is 574165.
Enter number: Nope! 5 was a wrong guess. The correct number is 574165.
Enter number: Nope! 6 was a wrong guess. The correct number is 574165.
Enter number: Nope! 7 was a wrong guess. The correct number is 574165.
Enter number: Nope! 8 was a wrong guess. The correct number is 574165.
Enter number: Nope! 9 was a wrong guess. The correct number is 574165.
Enter number: Nope! 10 was a wrong guess. The correct number is 574165.
root@feef72fcd655:/# ./my-hackme-looped | tail
[   36.012463][   T85] execveat: ./my-hackme-looped[85] to be hacked
Enter number: Nope! 494491 was a wrong guess. The correct number is 494500.
Enter number: Nope! 494492 was a wrong guess. The correct number is 494500.
Enter number: Nope! 494493 was a wrong guess. The correct number is 494500.
Enter number: Nope! 494494 was a wrong guess. The correct number is 494500.
Enter number: Nope! 494495 was a wrong guess. The correct number is 494500.
Enter number: Nope! 494496 was a wrong guess. The correct number is 494500.
Enter number: Nope! 494497 was a wrong guess. The correct number is 494500.
Enter number: Nope! 494498 was a wrong guess. The correct number is 494500.
Enter number: Nope! 494499 was a wrong guess. The correct number is 494500.
Enter number: Correct!
<span class="irrelevant">root@feef72fcd655:/#</span>
</pre>

Great success! Note that at this point we haven't even touched `write` yet &ndash; this is only looping because our test program has a deliberate loop inside, but we will eventually not need that once we implement the checkpointing.

Also note that for very frequent output, I have used `trace_printk` which doesn't print to the console, but can be seen in the kernel trace. As opposed to `pr_info`/`printk`, this is just writing to a ringbuffer in memory, and so is also much faster and more appropriate to use in tight loops.

```txt
root@feef72fcd655:/# tail /sys/kernel/tracing/trace
 my-hackme-loope-90      [001] .....   447.571690: ksys_read: ick checkpoint on hacked process my-hackme-loope[90]
 my-hackme-loope-90      [001] .....   447.571690: ksys_read: Providing number 27 to hacked process my-hackme-loope[90]
 my-hackme-loope-90      [001] .....   447.571691: ksys_read: ick checkpoint on hacked process my-hackme-loope[90]
 my-hackme-loope-90      [001] .....   447.571691: ksys_read: Providing number 28 to hacked process my-hackme-loope[90]
...
```

### Patching `write` to call our revert function

Let's also do the same for `write` &ndash; we will get the print output from user-space, and depending on whether we see a &ldquo;`Nope`&rdquo; we will either restore checkpoint, or let the process continue (handling the `write` as normal).

<a class="make-diff" href="./diffs/0006-write-checks-result-and-revert-if-wrong.patch"></a>

Since we haven't implemented checkpoint restore yet, the overall behaviour currently will not change. However, since we're effectively &lsquo;consuming&rsquo; any output with &ldquo;`Nope!`&rdquo; (by not returning from `ksys_write` instead of letting it continue), we should not see them in the console, but we should still see our `trace_printk` printing them out:

<pre>
root@feef72fcd655:/# ./my-hackme-looped
[    7.461863][   T84] execveat: ./my-hackme-looped[84] to be hacked
[    7.487957][   T84] hack: 0 gave different output
Enter number: [    7.492040][   T84] hack: 1 gave different output
Enter number: [    7.493428][   T84] hack: 2 gave different output
Correct!
root@feef72fcd655:/# cat /sys/kernel/tracing/trace
<span class="irrelevant"># tracer: nop
...
 my-hackme-loope-84      [000] d....     7.461871: console: execveat: ./my-hackme-looped[84] to be hacked</span>
 my-hackme-loope-84      [000] .....     7.487955: ksys_write: hacked process attempted write with data Enter number:
 my-hackme-loope-84      [000] d....     7.487961: console: hack: 0 gave different output
 my-hackme-loope-84      [000] .....     7.490135: ksys_read: ick checkpoint on hacked process my-hackme-loope[84]
 my-hackme-loope-84      [000] .....     7.490136: ksys_read: Providing number 1 to hacked process my-hackme-loope[84]
 my-hackme-loope-84      [000] .....     7.492037: ksys_write: hacked process attempted write with data Nope! 1 was a wrong guess. The correct number is 2.

 my-hackme-loope-84      [000] .....     7.492039: ksys_write: hacked process attempted write with data Enter number:
 my-hackme-loope-84      [000] d....     7.492042: console: hack: 1 gave different output
 my-hackme-loope-84      [000] .....     7.493423: ksys_read: ick checkpoint on hacked process my-hackme-loope[84]
 my-hackme-loope-84      [000] .....     7.493424: ksys_read: Providing number 2 to hacked process my-hackme-loope[84]
 my-hackme-loope-84      [000] .....     7.493427: ksys_write: hacked process attempted write with data Correct!

 my-hackme-loope-84      [000] d....     7.493430: console: hack: 2 gave different output
</pre>

<p class="info">
  You do not need <code>trace-cmd</code> nor even enabling tracing in tracefs to see <code>trace_printk</code> outputs.
</p>

Note that the &ldquo;\_ gave different output&rdquo; prints are because the program was writing &ldquo;`Enter number: `&rdquo; every loop iteration, which doesn't contain &ldquo;`Nope!`&rdquo;. Once our checkpoint restore is working, the program should end up back to when it first issues the `read`, which means that any prompt to enter number would no longer be printed again.

### Save and restore registers

If you had a look at [`struct task_struct`](https://github.com/micromaomao/linux-dev/blob/ick/include/linux/sched.h#L778) and concluded that there is nothing in there that looks like it stores the thread's registers, you're correct. So, what are we supposed to save/restore?

In Linux, each thread has a _kernel_ stack which is used when it is executing kernel code (for example, when it is handling a syscall). This is separate from the user-space stack, and in fact lives in kernel memory not accessible from user-space. When the thread enters the kernel due to a syscall (or other reasons like interrupts), kernel entry code (written in assembly) pushes all the (general-purpose) registers onto this stack before calling into any

Since what we're trying to do is somewhat similar to forking a process, it might be a good idea to look at how that is handled. Even though the memory handling might be somewhat different from what we're trying to do, at least we can reasonably expect that, in order to fork a process, the kernel has to copy the register states of the parent to the child. We can again use our handy `trace-cmd`, and this time, we can use the `function` tracer, which is a kernel tracing feature that let us see _almost all_ function calls in the kernel. There are many different ways to do this, but I'm going to record `/bin/sh` spawning a new process `/bin/true` (it seems like `trace-cmd` only starts tracing after it creates the child process that executes `/bin/sh`):

<pre>
root@feef72fcd655:/# trace-cmd record -p function -F -c /bin/sh -c '/bin/true'
<span class="irrelevant">  plugin 'function'
CPU0 data recorded at offset=0xbb000
    15901 bytes in size (126976 uncompressed)
CPU1 data recorded at offset=0xbf000
    195677 bytes in size (1400832 uncompressed)</span>
root@feef72fcd655:/# trace-cmd report > a.log && less a.log
</pre>

Let's search for &ldquo;`fork`&rdquo; in this (very long) log file:

<pre>
...
sh-87    [001] d..2.    26.386693: function:                      recalc_sigpending
sh-87    [001] d..2.    26.386693: function:                   _raw_spin_unlock_irq
sh-87    [001] d..1.    26.386693: function:             fpregs_assert_state_consistent
sh-87    [001] ...1.    26.386694: function:             x64_sys_call
sh-87    [001] ...1.    26.386694: function:                __do_sys_v<span class="red-highlight">fork</span>
sh-87    [001] ...1.    26.386694: function:                   kernel_clone
sh-87    [001] ...1.    26.386694: function:                      copy_process
sh-87    [001] ...1.    26.386694: function:                         _raw_spin_lock_irq
sh-87    [001] d..2.    26.386695: function:                         recalc_sigpending
...
</pre>

Ok, so it's not exactly using `fork`, but rather, `vfork`, which is a [slightly interesting variant](https://man7.org/linux/man-pages/man2/vfork.2.html) of fork designed to be more performant when the child immediately `exec`s. Nevertheless, `copy_process` seems like an extremely interesting function to check. You can find it in [kernel/fork.c](https://github.com/micromaomao/linux-dev/blob/ick/kernel/fork.c#L2122), and even the comment says that it copies registers:

```c
/*
 * This creates a new process as a copy of the old one,
 * but does not actually start it yet.
 *
 * It copies the registers, and all the appropriate
 * parts of the process environment (as per the clone
 * flags). The actual kick-off is left to the caller.
 */
 __latent_entropy struct task_struct *copy_process(...
```

Unfortunately, this function is quite complicated and

When faced with a problem like this, there is generally tzwo routes we can take:

- We can dig through the code ourselves, using tracing or kgdb (kernel debugger), play around with stuff until we understand more about what's going on, and answer our own question. Oftentimes this ends up eventually being the only viable option anyway if you want to gather a deep enough understanding.
- Alternatively, you can look up your question on Google or even ChatGPT, find relevant documentations or someone else's blog article, and get the answer quicker.

Both approaches are valid, and you need to be good at doing both. In this case, there is an excellent resource which explains how

<!-- The first 50 lines or so are just checking a bunch of preconditions and returning with error if any of them fails, followed by some code which handles pending signals before forking, then we get to this bit:

```c
    retval = -ENOMEM;
    p = dup_task_struct(current, node);
    if (!p)
        goto fork_out;
```

It seems to be cloning the current task struct onto a new one &ndash; let's ctrl+click that `dup_task_struct` function (hopefully your editor is good enough to support this basic feature): -->


TODO rest

`struct pt_regs`

Mention that extended states (fpu, simd regs) technically need to also be saved, but in our case not saving them still worked. Previously I thought syscall are allowed to clobber them (since they're caller-saved), but actually no. The kernel don't save them on syscall entry because the kernel is compiled to not use them, not because clobbering them are allowed. Hence to fully restore the state...

### Save and restore memory

### Blocking off other syscalls

## Final thoughts

When I was a lot younger, there was this book which attempted to help the reader understand Linux by listing a bunch of source codes and make commentaries on it. It started from bootup. I couldn't even get through a chapter.
I think for me, I needed to play with stuff to understand. Try to implement something (like in this case a checkpoint feature), play with kgdb, etc.

## Addendum: Hacking it with ptrace

Earlier I mentioned there are alternative approaches, and specifically ones that rely on ptrace. Indeed, we didn't _have_ to do this in the kernel, and we don't even have to write code to save/restore state ourselves either.

A natural and simpler thing to try might be to somehow force the process to `fork` before `read`ing the input, and check it only in the child (while the parent is paused). This way, the parent effectively always has the &lsquo;clean&rsquo; state. If an input fails, we can simply kill the child, let the parent fork again, and try another input, without having it go through the 200ms initialization each time.

While this does sounds quite tricky, the [ptrace API](https://man7.org/linux/man-pages/man2/ptrace.2.html), which is what debuggers uses behind the scene, allows a tracer to do a lot of interesting things to its child, like hooking and injecting syscalls, rewriting memory, etc. And so it is not difficult to imagine a C program which uses ptrace to do this, feeding the child input by writing directly to the buffer provided to `read` (and setting the right register to return the correct value).

A program like this could also fake `/proc/self/status` and the result of `ptrace(PTRACE_TRACEME)`, thus defeating the debugger detection.

Now, doing all this forking isn't free. With such short runtime per iteration (5-10us), the overhead of `fork` and the context switch between the supervisor, the parent to be forked, and the forked child process quickly dominates the time spent. I created a simple C program [fork-test.c](./fork-test.c) which measures time elapsed between just calling `fork` and it returning in the child, and from my testing, forking even this simple process usually takes ~50-150us. This is without the involvement of any ptrace supervisor, the process has less memory mappings than the real binary we're testing, and we're not writing or reading its memory from a remote process. It is reasonable to assume that if we were to actually do the proposed `ptrace`-based experiment, one iteration including handling `read`/`write` will take at least 100us on average (probably more).

With 100us per iteration, searching through all the inputs will take 5 minutes, which is not bad at all. The result does depends on time though, and for certain time periods there won't always be a valid input. This means that if we don't feel like sitting behind the computer waiting for potentially tens of minutes, we need to either parallelize it by a lot (with different processes trying different ranges of input), or advance our system clock to the future, so that when we come back from our half-hour coffee break the solution is not expired already.

I have tried but have not been successful in coercing ChatGPT (o1) to give me an out-of-the-box working solution for this &ndash; it is tripping over getting the child to behave correctly and I ran out of patience debugging.

Saving the state and restoring, without `fork`ing a new process, is also doable with `ptrace`, since we can read and write the memory of our traced process, and get/set registers. One way we can do this is to save off the content of all writable memory regions (which is not very large in this case), and restore them along with the registers after each iteration. If we want to go even further, we can use [userfaultfd](https://man7.org/linux/man-pages/man2/userfaultfd.2.html) to monitor which pages are written to after we inject our test input, and only restore those pages. For a program which has a lot more state than a few MB, this could be quite worthwhile.

Since ChatGPT already failed me once, I'm not going to try and convince it to make this work either. In principle it should all work, but this is not the approach I ended up using.
