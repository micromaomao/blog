---
title: "A Minecraft Server on Google Cloud that puts itself to sleep"
tags: ["cloud", "minecraft", "google-cloud"]
time: "2022-07-30T00:37:50.689Z"
discuss: {}
---

![cover](cover.png)

Cloud Platforms hate this! You won't believe how much money you can save via this one weird trick &mdash; turning things off when you don't use them!

----

Recently I have been running a Minecraft server to play with a few of my friends. While everything else about the server is fine, getting a £40 cloud bill at the end of the month for a server that barely hosts 5 players is not ideal. I could make it cheaper by using a shared-core VM with a smaller configuration, but the CPU usage when we are playing is already 100% 100% of the time. I did not want to limit its performance further and end up dying to silverfish because of lag. I can't have it cost me this much money either though, so like any normal person, I went ahead and bought a Realms subscription for $8 per month and played on Microsoft's server instead. The end&hellip;

Excpet of course that's not what happened. That would be no fun, plus I still want the ability to install my own plugins and stuff. The idea for this project came when I realized that most of the time nobody is in the server, which means that keeping it running 24/7 is a huge waste of resources.

A very easy solution to this problem is just to shut the server down and only boot it up when we want to play. While this means that we will have to wait for it to start up (which typically takes around a minute), this can be made quite effortless by making some sort of web page or Discord bot that powers on the server using the Google Cloud API, and shut it down automatically when nobody is in the server, which can be detected with a special server plugin.

While planning to implement this, I noticed one little interesting feature in Compute Engine:

![A drop down menu with options "start/resume", "stop", "suspend", "reset" etc. The suspend option is highlighted.](suspend-menu.png)

Suspend&hellip; Sounds like a perfect feature for this project! According to Google, when a VM is suspended, its memory is moved to persistent storage and the compute resource is released. Such a machine is like a powered-off machine, and only incur storage costs.

After some testing, I discovered that suspending and resuming a VM is actually quite fast&mdash;it usually takes 10 second to suspend or resume my Minecraft VM, and the VM is ready to be connected to afterward. This is very exciting, as it means basically no wait time for server to start back up at all. In fact&mdash;it's fast enough that in theory we don't even need an external interface. If we can make it so that as soon as someone tries to connect to the server within Minecraft, an API call is sent to Google Cloud to resume the VM, this could make the server looks like it's always running!

You might be wondering&mdash;this sounds impossible! If the server is sleeping, how could it listen to and accept new connections? And you will be right. We will need something external that will handle the connection for us, and does the Google Cloud API call. Luckily, I happen to know another interesting piece of Minecraft software &mdash; [BungeeCord](https://www.spigotmc.org/wiki/about-bungeecord/).

BungeeCord is a lightweight Minecraft server proxy with plugin support that is commonly used by multi-server networks to enable seamless switching. While this is not exactly what I'm trying to do here, the fact that it is an extendable Minecraft proxy makes it very useful for this project. We can simply use it as a (very lightweight) frontend to our server that detects connection attempts and resume/suspend our backing server automatically.

![An architectural diagram of the setup.](mc.drawio.svg)
