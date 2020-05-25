---
title: "Merkle All The Way Down: the inner-workings of certificate transparency"
tags: ["security", "web security", "cryptography", "RFC"]
time: "2020-05-25T16:56:31.799Z"
---

![cover](live_cert_screenshot.png)

// Brief intro to the PKI infrastructure

## The problem

// CAs can't be trusted. \
// Certificate ensures that once we saw a cert we can be certain the CA signed it. \
// => We must be able to know that CA signed some cert even if it is not presented to us.

## A log?

// CA/clients submit certificates they have signed/seen to a public log. \
// Naive solution requires trusting another party (the log), which is just shifting the problem.

### Blockchain!!!

// The hash of the last block "captures" the state of the entire log, so if client can trust that, they can verify other states with the hash. \
// Still no easy way to determine if a cert is in the blockchain. \
// Example to demostrate why inclusion proof in blockchain is <tex>O(n)</tex> where <tex>n</tex> is the amount of blocks from the tail to that.

// So what about a block*tree*?

### Merkle tree

// Introduce the concept of merkle tree \
// Certificate hash as leaf hash \
// Introduce inclusion proof

// System recap: when client receive a certificate, hash it and ask a log for inclusion proof. They can verify that the proof is valid for the tree hash they currently have, which they trust.

// But they must have some way to update the tree hash to allow new certs into the tree? \
// Critical requirement: must be tree extend only

### Consistency proof

&hellip;

// But there's still one more problem: we need to ensure everybody sees the same "everything". \
// => Gossiping tree hashes

### Signed Tree Head (STH) and gossiping protocols

// We can gossip the hashes \
// To verify the hashes are not made up, we need logs to sign the hash. \
// Receiving a valid STH means that we can either be sure that some older part of our subtree is "shared" properly across the network (by requesting a consistency proof), or update our tree hash to a newer version (and checking consistency proof).

// Ok, but there's still one more problem though: we don't want to rely on one single log.

## Signed Certificate Timestamps

// &hellip;which means that as a receiver of a certificate we need to be told in which log to find it. \
// CA can include the log name in the certificate itself before submiting it.

// But this is not actually how things are done because&hellip;

### Maximum merge delays - all about scalability.

// The log gives a SCT which act as a "promise" that it will include the certificate in the near future. \
// Client can trust the certificate even if they can't find it in the log if the MMD hasn't passed. \
// Once it has passed, check the log to see if the promise is valid. If not, make a news.

// This also means that client can even forgo checking the log altogether and still remain relatively safe - if network resource is limited for example.

// But how could a CA include a SCT inside a certificate, given that they have to submit the signed cert first?

## Precertificate

// CA sign a "fake" certificate to prove that they're indeed the CA about to sign the cert.

### Pratical complications

// The precertificate can be signed by a delegate CA. \
// This means that the precertificates are allowed to have different *issuer name*.
// Mentions how it's done in practice. \
// "The log only need to hash the TBS because the public only need to be "aware" of the certificate from inspecting the log. The public can ask the log for proof (the actual thing signed by the CA).

## My new Rust library

// Some screenshot/video demo to see the system working in practise \
// Incldes me issuing a cert for [merkleforest.xyz](https://merkleforest.xyz) and seeing it appear in my terminal.

// Can be used to monitor, inspection, SCT verification, etc. \
// Contains lots of comment

## Current adoption

// Summary of current adoption and call to action \
// 1. Ask browser to implement CT checking and \
// 2. &hellip;make `Expect-CT` the default. \
// 3. Run your own gossiping servers.
