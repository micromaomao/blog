---
title: "Merkle All The Way Down: the inner-workings of certificate transparency"
tags: ["security", "web security", "cryptography", "TLS", "RFC", "PKI"]
time: "2020-05-25T16:56:31.799Z"
---

![cover](live_cert_screenshot.png)

<div class="info">

To understand this article, you need to have some understanding of how public key cryptography is used to encrypt data and produce digital signatures.

The "Description" section of [this Wikipedia article](https://en.wikipedia.org/w/index.php?title=Public-key_cryptography&oldid=958099718#Description) might be a good place to start

</div>


The morden web *relies* on public-key cryptography. It allows us to somewhat secure our communication with a server that we had never talked to before, which is not possible with symmetric encryption alone. However, public-key crypto on its own doesn't defend us against *Man-in-the-Middle* (MitM) attacks, where an active attacker is able to modify our connection and replace, for example, the server's public key sent to us with their own public key. If we are tricked into thinking that the public key we received (from them) is the server's public key, the attacker will be able to decrypt messages (symmetric keys) we sent to the server without us noticing.

And as it turns out, this is a really difficult problem. To rephrase, we want to be sure that whoever controls the domain entered by the user owns the public key that we received.<footnote>On a more meta level, our problem is that we want be able to relate short, human-memorable names (domain names) with server identity. Because these domain names doesn't have any mathematical property we can expolit (like a public key), this is generally not possible to do securely without either trusting a third-party to establish the relation for us (e.g. DNS servers mapping domains to IP addresses, and CAs mapping domains to public key(s)), or using some kind of peer-to-peer network that relies on some consensus protocol that guards against rewrite attack, such as a blockchain + proof of work. Check out the "*Ethereum Name Service*" for a real-life example of such approach.</footnote> We seems to have settled on a solution where a third-party *Certificate Authority* (CA) verifies the identity of the server for us beforehand by signing a certificate for the server containing its public key, and everyone would simply know beforehand the public keys of the CAs to be able to verify the signatures. This is one of the core ideas of the *Public key infrastructure* (PKI), which is a broad name for the system and protocols to do with certificates.

As you can probably see already, the integrety of CAs are really *really* important in such a system. If a MitM attacker can get a CA to sign their fraudulent certificate, they can effectively "convince" browsers that their connection to the server is secure when it is actually not.<footnote>There are, however, other ways a browser may find out that something is wrong. Other then Certificate Transparency as discussed in this article, there is also [Public Key Pinning](https://wiki.mozilla.org/SecurityEngineering/Public_Key_Pinning) for popular websites (HPKP header is currently not supported by any browser) and [CAA DNS records](https://en.wikipedia.org/wiki/DNS_Certification_Authority_Authorization), although those measures don't work as well as Certificate Transparency, obviously.</footnote> This means that if merely **one** of the [~140 CAs](https://ccadb-public.secure.force.com/mozilla/IncludedCACertificateReport) Firefox or Chrome directly trust for identifying web servers gets compromised or otherwise mishebave, the security of the web can be significant challenged.<footnote>In reality, because root-CAs can delegate their signing ability to other parties by signing intermediate CAs, the number of entities with signing ability is much higher then 140. In fact, government of countless nations (including the US and China) and a number of big tech companies are also CAs. And the risk is not just on paper: [countless incidents](https://www.google.com/search?client=firefox-b-d&q=certificate+authority+incidents) have happened on CAs which have at some point been trusted by browsers, and this had led to real attacks against users of websites including Google.</footnote>

## The problem

However, we do not need to completely rely on the assumed "don't be evil" property of CAs because we have a critical line of defense: once we found out about a certificate, we have strong proof that the CA that signs it actually signed the certificate. This means that, for example, if a rough CA signed a certificate for `google.com` and by some means Google discovers the certificate, the CA is instantly exposed and would probably be publicly untrusted. That is (part of) the reason why you don't see NSA signing certs for `mail.google.com` and MitM-ing everyone.<footnote>Although to be fair, it's not like doing so is their only way to spy on user's gmail. It has already been shown that they have backdoors to Google's servers ¯\\\_(ツ)\_/¯</footnote>

The problem here is that there is no way for the public, or the site owner, to know when a CA has signed a certificate for some domain. Using the NSA's example, they could sign a `facebook.com` cert<footnote>Google and Twitter have their public keys pinned in Chrome and Firefox</footnote>, and then only use it very sparingly, and there is a chance that the public, including Facebook itself, will never find out (how often do you view the certs you received anyway?). If hypothetically, every time a CA signed a cert with the domain `facebook.com` Facebook would receive a notification and the signed cert, no publicly trusted CA would ever dare to allow that. In other words, we would be much safer if every valid certificate is discoverable by the public.

Can we make that happen?

## A log?

Let's imagine the simplest possible approach to this problem: we let (for example) Mozilla run a huge server accessible by everyone, and it stores a big list of certificates. The list is supposed to be append-only, meaning that certificates can only be added to the back of the list but not taken out or modified. We then ask every CA to submit the certificate whenever they signs a new one. Site owners can iterate through and monitor the list for certificates with their domain, and browsers would ask the list whether a certificate is in there everytime it receives a certificate signed by a publicly-trusted CA, and reject (or report) if it isn't.

Now, aside from the obvious reliability issue with counting on a single, centeralised server, there are 3 other massive problems with this approach:

1. Nothing is preventing the log from cheating when asked whether a certificate is in the log.

	For example, the log could be backdoored to `return true` whenever someone asks whether the NSA-signed `facebook.com` certificate is in the log, but yet never show the certificate when a list of certificates is asked. This effectively makes the certificate not discoverable but yet convince browsers that it is.

2. The append-only property can't be verified.

	For example, the log could include the NSA-signed `facebook.com` as normal, but quickly after NSA has finished the attack, remove the certificate from the list and forget about it, before Facebook has a chance to catch up with the log.

And if we alternatively let the browser always download all new certificates as they appear in the log, and thus basically keep a local version of the entire log, forgetting that users don't have infinite disk space,  this still wouldn't solve problem 1 and 2 because:

3. The log server can fork the log and selectively present one or the other versions to different clients.

	For example, NSA can sign `facebook.com` and ask the log to act as if this certificate is not in the log when Facebook requests the log content, but act as if it exists in the log to everyone else. This makes the browsers happy but still would fail to make Facebook aware that their users are being attacked.

One could argue that the public might find out if the log is involved in such misbehavior, but remember: the attacks don't need to be "to everyone". The log can limit the misbehavior to only target a tiny amount of users, and we have the same discoverability issue we had before with CAs. Moreover, there is no quick way to find out that the log is misbehaving. If the log only changes one certificate somewhere in the huge log, two persons would need to exchange their entire store of downloaded log data to be able to compare whether the log behavies the same to both of them.

As we shall see later, these 3 problems essentially corresponds to three core idea/concepts in the Certificate Transparancy system. But for now though, let's explore a bit more.

### Cryptography 101: Hash functions

<img alt="Image of a big book with &quot;100 GB data&quot; written on it, and an arrow pointing right, then a small, blue tag" src="hash-function-book-to-tag.png" style="max-width: 700px; display: block; margin: 0 auto;">

For those who aren't familiar with [hash functions](https://en.wikipedia.org/wiki/Hash_function), a *hash function*, like MD5 or SHA\*, is basically a function that takes any amount of data and produce a fixed-length output which depends on the data provided. For a secure hash function <tex>H</tex>, the probability that two random, different string of data <tex>x_1</tex> and <tex>x_2</tex> hashing to the same output (i.e. <tex>H(x_1) = H(x_2)</tex>) should be really low, and it should be really hard to find such pairs.<footnote>Obviously it is not possible to have a function that takes a long input and produces a short output that is completely collision-free because of the pigeonhole principle. I'm just saying that given the output of the function is big enough (e.g. 32 bytes), encountering two different inputs which produce the same output should be really unlikely (like, probability less then <tex>2^{-128}</tex>.)</footnote><footnote>
This property is called *collision resistance*. A secure hash function <tex>H</tex> has more properties: for example, <tex>H</tex> is hard to invert, i.e. for a given output <tex>y</tex>, it should be really hard to find <tex>x</tex> such that <tex>y = H(x)</tex>. Note that this property, which is called *first preimage resistance*, is implied by collision resistance, otherwise we would have a way to prefectly compress arbitrarily long data into a fixed-size byte string and have a high probability of decompressing correctly.<footnote>
The setup would be: for any string <tex>x</tex>, <tex>\text{compress}(x) = H(x)</tex>, and for all <tex>h</tex> which is a string of compressed data, find any string <tex>x'</tex> that satisfies <tex>H(x') = h</tex>, and define <tex>\text{decompress}(h)</tex> to be such <tex>x'</tex>. Now let's say we want to compress some data <tex>x</tex>, and we get <tex>c = H(x)</tex> after compression. Since <tex>H</tex> is collision resistant but we can find <tex>x'</tex> such that <tex>H(x') = c</tex> easily, it must be that, in the majority of cases, <tex>x' = x</tex>, otherwise we have just found a collision easily. This means that the compression algorithm we proposed will work in the vast majority of cases. Because such an algorithm is not possible, collision resistant implies first preimage resistance.</footnote></footnote>

Because of this property, hash functions are useful when we want to make some short piece of data depend on some larger piece of data in a way that is not rig-able. Let's say that I have some piece of data <tex>x</tex> that you don't currently have, and I previously told you <tex>h</tex> such that <tex>h = H(x)</tex>. If I now tell you that the data I previously had is <tex>x'</tex>, you can verify if I secretly changed the data or not. If <tex>H(x') \ne h</tex>, then I'm obviously lying, and if <tex>H(x') = h</tex>, then it is highly likely that I haven't changed my data. Also, if somebody tells you that the hash they received from me is <tex>h'</tex> and you realize that <tex>h \ne h'</tex>, then I'm telling you and them different pieces of data.

### Ok, what if we use a blockchain?

![a visualisation of a block chain](block-chain.png)

If you had knew a little about how blockchain works, or had fiddled with git commit log a bit, you probably would already recognises that such a structure might be relevant.

The basic idea of a "blockchain" is to use a hash function to make every block depend on the blocks before it. When applied to this scenario, it will be like:

1. The entire log would be made out of <em>"blocks" </em> containing certificate data.
2. There is a way to obtain a *hash* of each block based on the data it contains.
3. In addition to the certificate data, each block (other than the first) also contains the hash of the previous block in its data.

So, for example, if our hash function is <tex>H</tex>, and we have 3 blocks with certificate <tex>a_1</tex>, <tex>a_2</tex> and <tex>a_3</tex>, by using <tex>a || b</tex> to denote "<tex>a</tex> then followed by <tex>b</tex>"<footnote>I did not choose this convention, cryptography people and mathematician did.</footnote>, our block hashes would be:

* <tex>h_1 = H(a_1 || 0)</tex>
* <tex>h_2 = H(a_2 || h_1) = H(a_2 || H(a_1 || 0))</tex>
* <tex>h_3 = H(a_3 || h_2) = H(a_3 || H(a_2 || H(a_1 || 0)))</tex>

So what does doing so help with our CT log? Well, let's say, through some magic, everyone correctly knows that the hash of the current last block in the log is <tex>h</tex>. This means that they now have a short piece of data that represents a "snapshot" of the entire log. If they then go ahead to download the last <tex>n</tex> blocks from the log, they can confirm that the blocks they download matches this "snapshot", which they know is <tex>h</tex>, by calculating the hash of those <tex>n</tex> blocks and confirming that the last block hashes to <tex>n</tex>, and that for each block other then the first, it's "parent's hash" field contains the hash of the previous block.

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
// 3. Run your own gossiping servers. \
// https://no-sct.badssl.com/

## Sidenote: if we have CT why do we need CA anymore?

// CT has time delay. \
// CAs can be held accountable when they mis-issue certs, a random person on the Internet can't, and the mis-issued certificate can't be blacklisted.
