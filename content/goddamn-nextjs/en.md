---
title: "Goddamnit Next.js (and modern front-end dev in general)"
tags: ["front-end", "Next.js", "React"]
time: "2023-05-29T12:38:05.520Z"
cover_alt: "Nene from New Game (anime) getting frustrated at a laptop with the screen photoshopped to show a Next.JS error box"
---

![cover](cover.png)

(Cover image is Nene from <a href="https://myanimelist.net/anime/34914/New_Game" target="_blank">New Game!!</a> Ep1)

I started doing web development quite early on, in fact I remember building &ldquo;single-page apps&rdquo; when we were all using jQuery and React was not a thing. Over time (and especially when I was building my own website and <a href="https://paper.sc" target="_blank">paper.sc</a><footnote>
This website used to be called &lsquo;schsrch.xyz&rsquo;, don't ask me why.</footnote>
in high school) I've learned a bunch of weird tricks you can use to make your website / webapp, in one way or another, _better_ &mdash; things like minifying / bundling JavaScript and other assets, using the HTML History API (when you do client-side routing), and server-side rendering (_SSR_)<footnote>
By this I mean the thing you do when your entire website is a React component, not server-side rendering as in e.g. HTML templating or, god forbid, PHP.
</footnote>. I was also a relatively early adopter of &ldquo;Progressive Web Apps&rdquo; &mdash; aside from making the entire website more or less work without JavaScript (hence the &ldquo;progressive&rdquo; part), I made paper.sc _installable_ as an app on supported platforms and available offline, even though I did not actually implement any offline content&hellip;

With that said, I've since taken a long break from those kind of front-end development as most of my personal projects have been focusing on specific, more niche techs I wanted to learn, and my day job has so far not involved any web stuff. The reason why I started revisiting this area is because I wanted to build a new AI side project (which I will talk about in a future post), and I started with Next.js because it's presumably the framework of choice if you want to build a React app, with all the &ldquo;weird tricks&rdquo; mentioned before done for you. I'm familiar with the NodeJS http API and have used [Express](https://expressjs.com/) before, but Next.js is also a full-stack framework so I wanted to try out writing backend code in it.

> AAAAAAaaaaaahhhhhhhhhhhhhhhhhhhhhhhhh \
> Fuck \
> Why does it have to be this difficult...
>
> &mdash; Me, after spending 2 days building the initial frame of a stupidly simple app
