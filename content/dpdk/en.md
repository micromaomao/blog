---
title: "Blazingly⚡ fast🚀 packet processing with DPDK"
tags: ["networking", "dpdk", "performance", "Azure", "virtualization"]
time: "2023-03-12T22:31:31.115Z"
discuss: {}
---

![cover](packet-stats.svg)

Sorry for the meme in the title, that was cringe.

Anyway, recently at work I have been learning about this fancy framework we are using in a product with high-performance networking requirement&mdash;[*Data Plane Development Kit*](https://www.dpdk.org/) (DPDK). It is a set of user-space NIC drivers and related utility libraries that enables an application to bypass the Linux kernel's networking stack, and directly send and receive packets from the hardware (plus interact with more advanced hardware offloading features) when using supported NICs (which are usually server-grade products, not your average consumer NIC).

As it turns out, the Linux kernel is not very good at dealing with high-throughput UDP use cases. A basic application which simply send packets in a loop can use the [`sendmmsg`](https://man7.org/linux/man-pages/man2/sendmmsg.2.html) syscall to queue a large number of packets to the kernel, and calling [`recv`](https://man7.org/linux/man-pages/man2/recv.2.html) in a loop seems to be good enough to keep up with this. In my test environment, I was able to achieve around 1M small packets per second (varies from time to time, likely due to cloud environment changes).<footnote>In this test, there are 2 machines&mdash;one running a "send/receive" program implemented with Linux syscall, and the other running a "reflect" program, but using DPDK. This effectively means that we are only counting in the Linux overhead once. If both end uses the kernel networking stack, this number is around 300-600k.</footnote>
Such a number is likely more than enough for the majority of applications, but when working with this level of packet rate, things are very unstable&mdash;around 10-20% of the packets are not received (happens at somewhat lower load as well), and you get [some real spikey graphs](https://github.com/micromaomao/dpdk-project/blob/58db791568a3098ac6a8fafefb7b46a1ffb16090/data/a.ipynb) if you plot the packet rate over time, even at the sending end.

As you might have seen from the cover graph of this article, you can get much higher and much more stable performance with DPDK. Official documentation from DPDK claims that it is able to achieve the theoretical maximum packet rate under hardware bandwidth limitation.<footnote>See <a target="_blank" href="https://www.dpdk.org/wp-content/uploads/sites/35/2014/09/DPDK-SFSummit2014-HighPerformanceNetworkingLeveragingCommunity.pdf">&ldquo;SPEED MATTERS&rdquo; DPDK slide</a> page 3 for the claim, and <a target="_blank" href="https://fast.dpdk.org/doc/perf/DPDK_22_07_NVIDIA_Mellanox_NIC_performance_report.pdf">this recent test report</a>.</footnote>
For a 10 Gbps NIC, this means upwards of 30M (small) packets per second. Of course, due to both my inexperience in writing and testing high performance code, and the lack of a proper test environment (I do not have physical hardware to run these tests, and testing in the cloud can be susceptible to a wide range of environmental factors), I was not able to get anywhere near that. However, I was able to see significant improvement over the best result I can get with using the standard Linux API&mdash;in most cases I was able to achieve 3M packets/s without more than 1% packet loss, and my best result so far has been 3.5 Mpkt/s with 0.1% loss, vastly outperforming the best Linux numbers I got of 1 Mpkts/s at 10% loss.

I do not, however, plan to focus on performance too much in the remainder of this article, because this is not really (yet) my area of expertise, and I have not always used the most optimized approach. Instead, I will walk through how I implemented my own DPDK application, what I have learned, the challenges involved, and some potential future work.

## Setup

For this project, all testing are done on Microsoft Azure, with a pair of Standard D16s v5 VMs. “Accelerated Networking” is enabled on all NICs to enable using DPDK.

<div class="info">

Disclaimer:

1. I receives free Azure credits as a Microsoft employee, which I used for this project.
2. Azure was chosen also because I already knew that it will work with DPDK and I have worked with it in my work.
3. This article is not otherwise an endorsement of Azure &mdash; I have not made any comparison with other platforms.

</div>

All VMs will have 2 NICs - one for management, which will have a public IP I can use to SSH onto, and one for testing, which is connected to a private vnet. This separates other traffic from competing with testing traffic, but more crucially, this way we can bind the testing NIC to DPDK and experiment with it, without impacting SSH and other connectivity.

The [DPDK Getting Started guide](https://doc.dpdk.org/guides/linux_gsg/linux_drivers.html) detailed the standard steps required to setup a NIC for DPDK, which involved calling `dpdk-devbind.py`. However, it turns out that due to using VMBus instead of PCI addresses, a different command&mdash;`driverctl`&mdash;is required on Hyper-V VMs and in terms Azure, as noted in [the docs for the Netvsc poll mode driver (PMD)](https://doc.dpdk.org/guides/nics/netvsc.html). Moreover, in Azure, there are actually two drivers (in fact, two devices, as I will explain later) involved for each NIC &mdash; the Netvsc PMD, and [NVIDIA MLX5](https://doc.dpdk.org/guides/platform/mlx5.html). The latter requires an additional system library `libibverbs` to be installed in order for DPDK to compile and link to its MLX5 driver, otherwise the Netvsc PMD will not set up the device and nothing will work, which costed me hours of wondering what went wrong.

In short, here is everything I did to compile DPDK (with MLX5), written out as a copy-pastable script on Debian 11:

```bash
set -e
cd ~
sudo apt install pkg-config meson ninja-build python3 python3-pyelftools libnuma-dev clang make libibverbs-dev driverctl
git clone https://dpdk.org/git/dpdk-stable -b v22.11.1
cd dpdk-stable
meson setup -Dbuildtype=release -Dplatform=native -Doptimization=3 build
# or -Dbuildtype=debug -Doptimization=g
cd build
ninja
sudo ninja install
sudo ldconfig
cd ~
```

It is not terribly relevant to us right now if we just want to get things set up, but if you're interested in why there are two &ldquo;devices&rdquo; involved, it is because Azure uses [SR-IOV](https://learn.microsoft.com/en-us/windows-hardware/drivers/network/overview-of-single-root-i-o-virtualization--sr-iov-) to pass-through part of the NIC to the VM. In this set up, the physical NIC presents itself as multiple PCIe devices &mdash; one _Physical Function_ (PF) device, which is always controlled by the VM host, and one or more _Virtual Functions_ (VFs), which are passed through to the VM. The hypervisor, in addition to passing through the VF, also creates a virtual NIC for the VM (which is the hv_netvsc device we see). In a non-SR-IOV situation this would have been the only device presented to the VM for each NIC, and traffic is forwarded by the hypervisor to or from the VM via this virtual NIC. When SR-IOV is used, this virtual NIC exists as a control and fallback (during live migration) mechanism, but actual traffic will flow directly from the physical NIC to the VM via the VF, bypassing the hypervisor. Thus, the VM sees two devices for each NIC &mdash; the hv_netvsc one (also referred to as the &ldquo;synthetic&rdquo; device), and the actual MLX5 VF. When DPDK starts, it will take over both devices, the Netvsc driver will match them up (just by comparing MAC addresses, actually), and link them together so that the rest of the DPDK application sees a single port.

To set up the devices

## Appendix: Baseline (Linux kernel sending/recving + DPDK echo) setup &amp; measurements

This is done partially with an [earlier learning project](https://github.com/micromaomao/neuring) I made (at the time I wanted to investigate whether io_uring improves anything in the context of high-speed packet processing, and could not get any significantly different result). [syscall_sendrecv.rs](https://github.com/micromaomao/neuring/blob/d37c0b735689117d854992460946e36bbe9f9e58/src/io_impl/syscall_sendrecv.rs) contains the source code for the syscall-based send/recv program.

Since I actually ported the stats and packat-generation related code from this earlier project when building the DPDK one, there should not be too much difference between this and my DPDK test, aside from using DPDK vs Linux sockets.

I did not do a very detailed comparison / analysis on the how the result compares, because I ran out of time, and also the results are significantly different enough that I was satisfied with what I'm seeing.

Link to graphs: [Result for DPDK forwarding, Linux syscall sending / receiving](https://github.com/micromaomao/dpdk-project/blob/58db791568a3098ac6a8fafefb7b46a1ffb16090/data/a.ipynb) ([source data](https://github.com/micromaomao/dpdk-project/blob/58db791568a3098ac6a8fafefb7b46a1ffb16090/data/syscall-dpdk.csv)).
