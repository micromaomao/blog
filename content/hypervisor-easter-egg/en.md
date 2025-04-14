---
title: "Hiding ‘Easter Eggs’ in your Hypervisor"
tags: ["systems programming", "virtualization", "cloud-hypervisor", "Linux"]
time: "2025-01-26T12:48:17+00:00"
draft: true
---

TODO

```
./configure --prefix=$HOME/qemu-build --sysconfdir=$HOME/qemu-build/etc --libexecdir=$HOME/qemu-build/usr/lib/qemu --localstatedir=$HOME/qemu-build/var     --disable-bpf --disable-bsd-user --disable-capstone --disable-docs --disable-fdt --disable-gcrypt --disable-glusterfs --disable-gnutls --disable-gtk --disable-install-blobs --disable-kvm --disable-libiscsi --disable-libnfs --disable-libssh --disable-linux-io-uring --disable-nettle --disable-opengl --disable-qom-cast-debug --disable-sdl --disable-system --disable-tools --disable-tpm --disable-vde --disable-vhost-crypto --disable-vhost-kernel --disable-vhost-net --disable-vhost-user --disable-vnc --disable-werror --disable-xen --disable-zstd --enable-kvm --enable-system --target-list=x86_64-softmmu
```


```
cargo build --all --all-targets --release
```

```
./target/release/cloud-hypervisor --kernel=$HOME/linux-worktrees/dev/vmlinux --cmdline='root=root rw console=ttyS0,115200 kgdboc=ttyS1,115200 nokaslr no_hash_pointers loglevel=7 init=/init.sh -' --cpus boot=4 --console off --serial tty
```

no 9pfs support yet, so can't mount root - can use virtiofs
