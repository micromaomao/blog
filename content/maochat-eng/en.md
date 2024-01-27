---
title: "“Actual” Engineering behind Maochat"
tags: ["Architecture", "Node.JS", "PostgreSQL", "Security"]
time: "2024-01-27T12:00:01+00:00"
cover_alt: >-
  A screenshot of some code from addChatMessage in app/src/lib/chat.ts, with the logo for Maochat overlaid in
  the center, with a glow effect.
discuss:
  "GitHub": "https://github.com/micromaomao/chat.maowtm.org/issues?q=is%3Aissue+no%3Aproject+"
---

![cover](./cover.png)

<style>
  .coverimg {
    max-height: 600px;
  }
</style>

This is a follow-on article from the previous one on Maochat: [I made an AI impression of myself](../maochat-ai/en.html). In this article, I want to go over some of the thinking behind the non-AI bits of the project, including architectural decisions, some implementation details, etc. I encourage you to read [the previous article](../maochat-ai/en.html) first if you're interested in learning about how this project make uses of GPT. If you haven't tried it, I also encourage you to try out <a href="https://chat.maowtm.org/" target="_blank">Maochat</a>.

<style>
  .trynow {
    display: inline-block;
    padding: 5px 20px;
    background-color: #a200e1;
    color: #ffffff;
    text-decoration: none;
    border-radius: 4px;
    font-weight: 600;
    margin: 5px;
  }

  .trynow:hover, .trynow:active, .trynow:focus {
    background-color: #8a00cd;
  }

  .trynow:hover:active {
    background-color: #46127d;
  }
</style>
<script async defer src="https://buttons.github.io/buttons.js"></script>

<p style="text-align: center;">
  <a href="https://chat.maowtm.org" target="_blank" class="trynow">Try it now</a><br>
  <a href="https://github.com/micromaomao/chat.maowtm.org" target="_blank" style="vertical-align: 8px;">View source on GitHub</a>
  <a class="github-button" href="https://github.com/micromaomao/chat.maowtm.org" data-size="large" data-show-count="true" aria-label="Star micromaomao/chat.maowtm.org on GitHub">Star</a>
</p>
