---
title: "[WIP] Merkle All The Way Down: the inner-workings of certificate transparency"
tags: ["security", "web security", "cryptography", "TLS", "RFC", "PKI"]
time: "2020-07-07T23:56:28Z"
---

![cover](cover.svg)

<div class="warn">

<b>This article is still a work-in-progress!</b>

A significant number of subsections have not been written yet.
</div>

<div class="info">

To understand this article, you need to have some understanding of how public key cryptography is used to encrypt data and produce digital signatures. The "Description" section of [this Wikipedia article](https://en.wikipedia.org/w/index.php?title=Public-key_cryptography&oldid=958099718#Description) might be a good place to start.

In addition, you also need to know what a [Hash function](https://en.wikipedia.org/wiki/Hash_function) does.

</div>


The morden web *relies* on public-key cryptography. It allows us to somewhat secure our communication with a server that we had never talked to before, which is not possible with symmetric encryption alone. However, public-key crypto on its own doesn't defend us against *Man-in-the-Middle* (MitM) attacks, where an active attacker is able to modify our connection and replace, for example, the server's public key sent to us with their own public key. If we are tricked into thinking that the public key we received (from them) is the server's public key, the attacker will be able to decrypt messages (symmetric keys) we sent to the server without us noticing.

And as it turns out, this is a really difficult problem. To rephrase, we want to be sure that whoever controls the domain entered by the user owns the public key that we received.<footnote>On a more meta level, our problem is that we want be able to relate short, human-memorable names (domain names) with server identity. Because these domain names doesn't have any mathematical property we can expolit (like a public key), this is generally not possible to do securely without either trusting a third-party to establish the relation for us (e.g. DNS servers mapping domains to IP addresses, and CAs mapping domains to public key(s)), or using some kind of peer-to-peer network that relies on some consensus protocol that guards against rewrite attack, such as a blockchain + proof of work. Check out the "*Ethereum Name Service*" for a real-life example of such approach.</footnote> We seems to have settled on a solution where a third-party *Certificate Authority* (CA) verifies the identity of the server for us beforehand (hopefully without their connection being tempered with) by signing a certificate for the server containing its public key, and everyone would simply know beforehand the public keys of the CAs to be able to verify the signatures. This is one of the core ideas of the *Public key infrastructure* (PKI), which is a broad name for the system and protocols to do with certificates.

As you can probably see already, the integrety of CAs are really *really* important in such a system. If a MitM attacker can get a CA to sign their fraudulent certificate, they can effectively "convince" browsers that their connection to the server is secure when it is actually not.<footnote>There are, however, other ways a browser may find out that something is wrong. Other then Certificate Transparency as discussed in this article, there is also [Public Key Pinning](https://wiki.mozilla.org/SecurityEngineering/Public_Key_Pinning) for popular websites (HPKP header is currently not supported by any browser) and [CAA DNS records](https://en.wikipedia.org/wiki/DNS_Certification_Authority_Authorization), although those measures don't work as well as Certificate Transparency, obviously.</footnote> This means that if merely **one** of the [~140 CAs](https://ccadb-public.secure.force.com/mozilla/IncludedCACertificateReport) Firefox or Chrome directly trust for identifying web servers gets compromised or otherwise mishebave, the security of the web can be significant challenged.<footnote>In reality, because root-CAs can delegate their signing ability to other parties by signing intermediate CAs, the number of entities with signing ability is much higher then 140. In fact, government of countless nations (including the US and China) and a number of big tech companies are also CAs. And the risk is not just on paper: [countless incidents](https://www.google.com/search?client=firefox-b-d&q=certificate+authority+incidents) have happened on CAs which have at some point been trusted by browsers, and this had led to real attacks against users of websites including Google.</footnote>

## The problem

However, we do not need to completely rely on the assumed "don't be evil" property of CAs because we have a critical line of defense: once we found out about a certificate, we have strong proof that the CA that signs it actually signed the certificate. This means that, for example, if a rough CA signed a certificate for `google.com` and by some means Google discovers the certificate, the CA is instantly exposed and would probably be publicly untrusted. That is (part of) the reason why you don't see NSA signing certs for `mail.google.com` and MitM-ing everyone.<footnote>Although to be fair, it's not like doing so is their only way to spy on user's gmail. It has already been shown that they have backdoors to Google's servers ¯\\\_(ツ)\_/¯</footnote>

The problem here is that there is no way for the public, or the site owner, to know when a CA has signed a certificate for some domain. Using the NSA's example, they could sign a `facebook.com` cert<footnote>Google and Twitter have their public keys pinned in Chrome and Firefox. At the time of this writing, Facebook does not.</footnote>, and then only use it very sparingly, and there is a chance that the public, including Facebook itself, will never find out (how often do you view the certs you received anyway?). If hypothetically, every time a CA signed a cert with the domain `facebook.com` Facebook would receive a notification and the signed cert, no publicly trusted CA would ever dare to allow that. In other words, we would be much safer if every valid certificate is discoverable by the public.

Can we make that happen?

## A log?

Let's imagine the simplest possible approach to this problem: we let (for example) Mozilla run a huge server accessible by everyone, and it stores a big list of certificates. The list is supposed to be append-only, meaning that certificates can only be added to the back of the list but not taken out or modified. We then ask every CA to submit the certificate whenever they signs a new one. Site owners can iterate through and monitor the list for certificates with their domain, and whenever a browser receives a public-CA-signed certificate, it could either ask the log whether the certificate is in there, or keep a local, up-to-date copy of the entire log and check whether the certificate is in the log directly, and reject (or report) if it isn't.

Now, aside from the obvious reliability issue with counting on a single, centeralised server, there are 3 other massive problems with this approach:

1. Nothing is preventing the log from cheating when asked whether a certificate is in the log.

	For example, the log could be backdoored to `return true` whenever someone asks whether the NSA-signed `facebook.com` certificate is in the log, but yet never show the certificate when a list of certificates is asked. This effectively makes the certificate not discoverable but yet convince browsers that it is.

2. The append-only property can't be verified.

	For example, the log could include the NSA-signed `facebook.com` as normal, but quickly after NSA has finished the attack, remove the certificate from the list and forget about it, before Facebook has a chance to catch up with the log.

3. The log server can fork the log and selectively present one or the other versions to different clients (i.e. "hiding" a certificate from some group of clients).

	For example, NSA can sign `facebook.com` and ask the log to act as if this certificate is not in the log to most of the people, but act as if it exists in the log to some minority being attacked.

One could argue that the public might find out if the log is involved in such misbehavior, but remember: the attacks don't need to be "to everyone". The log can limit the misbehavior to only target a tiny amount of users, and we have the same discoverability issue we had before with CAs. Moreover, if the log is involved in shady practices described above, there is no quick way to find out and hold the log accountable, unlike a rough CA signing fraudulent certificates.

For example, there is no easy and quick way for Facebook (or any user browser) to realize that the log is "hiding" some certificate from (or "injecting" certificates for) them, unless they confirm with a third party all certificates that they have ever received from the log. And even if they did found out, they have no way to prove that the log really did that (you can't prove that someone *didn't* say something).

### Hashing

Commonly, *hash functions* are used to make sure two piece of data are the same by computing a "snapshot" token representing the data. To create such a "token", log clients could hash all the certificates in the list together in order, and all the clients can share this short hash between them, broadcast it publicly to let anyone use it to verify, etc. This also give us a way to establish accountability of the log: if we require the log to always sign this "snapshot" (by calculating this hash itself and publishing the signature), whenever we found something wrong, we would basically have two signatures from the log corresponding to two conflicting lists, which we can show to the world along with the full data of the two lists for everyone to verify.

However, simply hashing everything together still isn't an efficient strategy. First of all, doing this over the entire log is a lot of computational work that potentially has to be done every time the log updates. Secondly, this requires everyone to always have an up-to-date, full copy of the log in order to verify anything. For example, if you currently have the list <tex>a_1, a_2, a_3</tex> which hashes to <tex>h_{..3}</tex>, and the server tells you another certificate <tex>a_4</tex> has been added, you can calculate the new hash <tex>h_{..4}</tex> and verify this with others, but this is only possible if you actually still know the data of <tex>a_1</tex>, <tex>a_2</tex> and <tex>a_3</tex> at the time of this verification&mdash;you can't just "forget" about them. Similarly, you won't be able to confirm that a certificate you just received somewhere is in this list, if you just know the hash, without downloading all the other certificates and calculating out the hash to confirm.

What if there is actually a way to hash all the certificates together such that, just by knowing the hash, you can quickly confirm that some certificate is included in the log, and also, whenever the log updates, one can quickly calculate a new hash for the list with more certificates appended to it, based on the old hash? If we can do that, then browsers don't even need to download anything in the log other than the hash to verify that the log is behaving correctly and to verify the existance of a particular certificate in the log.

### Merkle tree \& *inclusion proof*

<div class="info">
<b>Notation</b>: <tex>a||b</tex> represent "concatenate <tex>a</tex> and <tex>b</tex>". Our hash function is denoted by <tex>H</tex>.
</div>

Let's focus on the first part of the problem&mdash;can we construct a special "hash" such that it is easy for a client to check that some certificate is in the list corresponding to the hash?

Say for example that we have the following log, where each <tex>a_i</tex> is a certificate:

<style>
.an-list-contain {
	display: flex;
	align-items: baseline;
}
.an-list-contain > :first-child {
	margin-left: auto;
}
.an-list-contain > :last-child {
	margin-right: auto;
}
.an-list-block {
	margin: 0 8px;
	border: solid 1px #000;
	padding: 8px 8px 12px 8px;
	width: 2.5rem;
	height: 2.5rem;
	display: flex;
	flex-direction: row;
	justify-content: center;
	align-items: center;
}
.an-list-wrap {
	margin: 0 4px;
	background-color: rgba(0,0,0,0.04);
	border: dashed 1px #777;
	padding: 4px 2px;
	display: grid;
	grid-template-rows: auto auto;
	grid-template-columns: auto auto;
	grid-template-areas:
		"d d"
		"a b";
}
.an-list-wdesc {
	grid-area: d;
	padding: 0 0 2px 0;
}
.an-list-wdesc.wdesc-small, .an-list-wdesc.wdesc-small .tex {
	font-size: 0.85rem;
}
</style>
<div class="an-list-contain">
	<div class="an-list-block"><tex>a_1</tex></div>
	<div class="an-list-block"><tex>a_2</tex></div>
	<div class="an-list-block"><tex>a_3</tex></div>
	<div class="an-list-block"><tex>a_4</tex></div>
	<div class="an-list-block"><tex>a_5</tex></div>
	<div class="an-list-block"><tex>a_6</tex></div>
	<div class="an-list-block"><tex>a_7</tex></div>
	<div class="an-list-block"><tex>a_8</tex></div>
</div>

And let's say we have a certificate that we want to verify. We ask the server, which tells us that the certificate is the third certificate in the list (<tex>a_3</tex>). If the hash is a simple concatenation of <tex>a_1\ldots{}a_8</tex>, then you would need to get every <tex>a_n</tex> other than <tex>a_3</tex>, compute the hash of the list, and compare with the hash you had earlier. Even though you do not care about any other certificates in the list, you still have to hash them since the hash is a concatenation. But, what if instead of concatenating every <tex>a_n</tex> together to get the hash, we split the list into two, hash the first half and second half separately, then "combine" the hash by hashing the concatenation of the two "sub-hash"?

<style>
.half-split-hash-demo {
	display: grid;
	width: auto;
	margin: 0 auto;
	grid-template-rows: auto auto;
	grid-template-columns: auto auto auto auto auto;
	justify-content: stretch;
	justify-items: center;
	max-width: 550px;
}
.bdown {
	border-bottom: solid 1px #888;
}
.desc-row {
	font-size: 80%;
	line-height: 1.2;
}
.desc-row .tex {
	font-size: 110%;
}
</style>
<div class="half-split-hash-demo">
	<div><tex>h_\text{all} = H(</tex></div>
	<div class="bdown"><tex>H(a_1 || a_2 || a_3 || a_4)</tex></div>
	<div><tex>||</tex></div>
	<div class="bdown"><tex>H(a_5 || a_6 || a_7 || a_8)</tex></div>
	<div><tex>)</tex></div>
	<div class="desc-row">&nbsp;</div>
	<div class="desc-row"><tex>p_1</tex>: Hash of first half</div>
	<div class="desc-row">&nbsp;</div>
	<div class="desc-row"><tex>p_2</tex>: Hash of second half</div>
	<div class="desc-row">&nbsp;</div>
</div>

If we then want to confirm the existance of <tex>a_3</tex> in the list, we just need to get <tex>a_1</tex>, <tex>a_2</tex> and <tex>a_4</tex>, hash with the <tex>a_3</tex> we know to get our value of <tex>p_1</tex>, then combine the hash with <tex>p_2</tex> (which we can ask the server to give us) to get <tex>h_\text{all}</tex>, and check that the hash is as expected. We can then conclude that <tex>h_\text{all}</tex> "includes" <tex>a_3</tex> since it depends on <tex>a_3</tex>, which is the certificate we want to confirm, in our calculation.

Note that by spliting the tree in half, we don't need to know anything about the "irrelevant" half, other than a short hash of it, anymore. Intuitively, we can continue this "splitting" pattern to make a binary tree, with the hashes of individual certificates alone being the leaf, and every node is a "combined" hash of its two leaves:

<div class="an-list-contain" style="">
	<div class="an-list-wrap">
		<div class="an-list-wdesc"><tex>h_\text{all} = h_{1..8} = H(h_{1..4} || h_{5..8})</tex></div>
		<div class="an-list-wrap">
			<div class="an-list-wdesc"><tex>h_{1..4} = H(h_{1..2} || h_{3..4})</tex></div>
			<div class="an-list-wrap">
				<div class="an-list-wdesc wdesc-small"><tex>h_{1..2} = H(H(a_1) || H(a_2))</tex></div>
				<div class="an-list-block"><tex>H(a_1)</tex></div>
				<div class="an-list-block"><tex>H(a_2)</tex></div>
			</div>
			<div class="an-list-wrap">
				<div class="an-list-wdesc wdesc-small"><tex>h_{3..4} = H(H(a_3) || H(a_4))</tex></div>
				<div class="an-list-block"><tex>H(a_3)</tex></div>
				<div class="an-list-block"><tex>H(a_4)</tex></div>
			</div>
		</div>
		<div class="an-list-wrap">
			<div class="an-list-wdesc"><tex>h_{5..8} = H(h_{5..6} || h_{7..8})</tex></div>
			<div class="an-list-wrap">
				<div class="an-list-wdesc wdesc-small"><tex>h_{5..6} = H(H(a_5) || H(a_6))</tex></div>
				<div class="an-list-block"><tex>H(a_5)</tex></div>
				<div class="an-list-block"><tex>H(a_6)</tex></div>
			</div>
			<div class="an-list-wrap">
				<div class="an-list-wdesc wdesc-small"><tex>h_{7..8} = H(H(a_7) || H(a_8))</tex></div>
				<div class="an-list-block"><tex>H(a_7)</tex></div>
				<div class="an-list-block"><tex>H(a_8)</tex></div>
			</div>
		</div>
	</div>
</div>

Now, if we want to confirm that <tex>a_3</tex> is in the list corresponding to <tex>h_\text{all}</tex>, we only need to:

1. Get <tex>H(a_4)</tex>, <tex>h_{1..2}</tex>, and <tex>h_{5..8}</tex> from the server.
2. Calculate <tex>H(a_3)</tex> from the certificate data we have.
3. Confirm that <tex>h_\text{all} = H(\color{purple}{H(h_{1..2}||\color{blue}{H(\color{red}{H(a_3)}||H(a_4))})}||h_{5..8})</tex>.

We don't even need to know any other <tex>a_n</tex>&mdash;we just need the hash of <tex>a_4</tex> and two other "intermediate" hash, which we can simply ask the server since we don't really care what the other certificates are. Once we get all the necessary intermediate hashes from the server, we can sort of "bubble up" the binary tree to arrive at our final <tex>h_\text{all}</tex>, and because we used the hash of the certificate we want to confirm&mdash;<tex>a_k</tex>&mdash;to finally derive <tex>h_\text{all}</tex>, the list corresponding to <tex>h_\text{all}</tex> must contains <tex>a_k</tex>. It is not hard to see that, to confirm the existance of one certificate in a log of size <tex>n</tex>, we only need <tex>O(\log n)</tex> hashes if we do it this way.

In the above scenario, we asked the server to help us derive the <tex>h_\text{all}</tex> we already have, based on the certificate data <tex>a_k</tex>. This is enough to convince us that <tex>a_k</tex> is in the log with "snapshot" <tex>h_\text{all}</tex>, which we can then exchange with other people to make sure that they are also seeing the version of the log we are seeing. The information that the server gave us&mdash;<tex>(k, H(a_4), h_{1..2}, h_{5..8})</tex>&mdash;to help us complete this process is called an <b>*inclusion proof*</b> of <tex>a_k</tex>, because it "proves" to us that <tex>a_k</tex> is "included" in <tex>h_\text{all}</tex>.

This "binary tree" pattern and the construction of inclusion proofs work equally well for lists that aren't power-of-2-sized. Play with the following demo to see for yourself:

<noscript id="demo-inclusion">
	You need to enable javascript for this demo.
</noscript>

This kind of binary-tree arrangement has a name: **(almost) complete binary tree**. It's called this way because there are no "gaps", i.e. all node have 2 children except the leaves at the bottommost level or the nodes on the very right side of the tree. Such a tree can be uniquely constructed for any given length, which means that the log server doesn't actually need to send any "trees" to the client. The concept of attaching "intermediate" hashes to the nodes, along with the construction of inclusion proofs and, as we shall see later, consistency proofs, is known as <b>*Merkle Tree*</b>, and the "final" hash&mdash;<tex>h_\text{all}</tex>&mdash;is called the <b>*tree hash*</b> (sometimes also known as "root hash").

### Consistency proof

<style>
.an-list-contain .mod {
	color: red;
	border-color: red;
}
</style>
<div class="an-list-contain" style="">
	<div class="an-list-wrap">
		<div class="an-list-wdesc mod"><tex>h_\text{all} = h_{1..8}</tex></div>
		<div class="an-list-wrap">
			<div class="an-list-wdesc"><tex>h_{1..4}</tex></div>
			<div class="an-list-wrap">
				<div class="an-list-wdesc"><tex>h_{1..2}</tex></div>
				<div class="an-list-block"><tex>H(a_1)</tex></div>
				<div class="an-list-block"><tex>H(a_2)</tex></div>
			</div>
			<div class="an-list-wrap">
				<div class="an-list-wdesc"><tex>h_{3..4}</tex></div>
				<div class="an-list-block"><tex>H(a_3)</tex></div>
				<div class="an-list-block"><tex>H(a_4)</tex></div>
			</div>
		</div>
		<div class="an-list-wrap">
			<div class="an-list-wdesc mod"><tex>h_{5..8}</tex></div>
			<div class="an-list-wrap">
				<div class="an-list-wdesc"><tex>h_{5..6}</tex></div>
				<div class="an-list-block"><tex>H(a_5)</tex></div>
				<div class="an-list-block"><tex>H(a_6)</tex></div>
			</div>
			<div class="an-list-wrap">
				<div class="an-list-wdesc mod"><tex>h_{7..8}</tex></div>
				<div class="an-list-block"><tex>H(a_7)</tex></div>
				<div class="an-list-block mod"><tex>H(a_8)</tex></div>
			</div>
		</div>
	</div>
</div>

Up until now, we have not discussed what happens when more certificates are appended into the log. Obviously the tree hash <tex>t_\text{all}</tex> will change. Let's use the above diagram to illustrate: the original tree contains the first 7 certificates, and <tex>a_8</tex> is a newly appended certificate.

It should be quite easy for the server to calculate the new hash&mdash;they just have to calculate new intermediate hashes for all the nodes on the path from <tex>a_8</tex> to the root (colored in <span style="color: red">red</span>), and finally calculate a new <tex>h_\text{all}</tex>. But after that, how does the client know that the new hash received from the server is really an "extension" from <tex>a_1\ldots{}a_7</tex>, and that the server hasn't, for example, changed some of <tex>a_1\ldots{}a_7</tex> and then gave the client the hash derived from the modified tree?

We can use the thinking we used in constructing inclusion proofs again: the server can "help" the client construct the new <tex>t_\text{all}</tex> itself, which would convince it that the new <tex>t_\text{all}</tex> really represents an "appended-only" tree from the old one. To do that, the client needs to know the old tree size (which it should already know) and the new tree size (given by the server, along with the new <tex>h_\text{all}</tex>) in order to know the structure of the tree. In this case they are 7 and 8 respectively. Then, the server gives the client <span style="color: red"><tex>H(a_8)</tex></span>, <tex>H(a_7)</tex>, <tex>h_{5..6}</tex> and <tex>h_{1..4}</tex>. The client can then piece out the final hash as <tex>H(h_{1..4} || \color{rgb(127,0,127)}{H(h_{5..6} || \color{blue}{H(H(a_7) || \color{red}{H(a_8)})})})</tex>.

Note that in this process, the server has given the client enough information about the old tree to allow it to reconstruct the old <tex>h_\text{all} = H(h_{1..4} || \color{rgb(127,0,127)}{H(h_{5..6} || \color{blue}{H(a_7)})})</tex>. What this means is that the client can be certain that the new <tex>t_\text{all}</tex> (which they just calculated) "includes" every certificate in the old tree, and also in the correct position, since the server can't "insert" new certificates before <tex>a_8</tex> otherwise the client wouldn't get the correct old <tex>h_\text{all}</tex>, and also, because <tex>H(a || b) \ne H(b || a)</tex>, the server can't swap anything.

Therefore, the server has just proved to the client that the new tree is an append-only extension of the old tree. This is called a <b>*consistency proof*</b>, because it proves that two tree are "consistent"&mdash;one is an append-only extension of the other. If the server publishes a new tree hash for which it can not provide a valid consistency proof, then the server must have changed something illegally.

Although it might not feel like it, this procedure can be done for all old and new sizes. Play with the following demo to see for yourself:

<noscript id="demo-consistency">
	You need to enable javascript for this demo.
</noscript>

### Gossiping & *Signed Tree Head* (STH)

Now that we have discussed tree hash, inclusion and consistency proofs, we can come up with the simplist model how a browser (or a monitor such as [crt.sh](https://crt.sh/)) might interact with a CT log:

1. Client always keep track of the current tree hash (and size), and regualrly ask the log for update.
2. If a new tree hash with larger tree size is received, ask for consistency proof and check it. If checks OK, update the stored tree hash and size.
3. To verify some certificate, ask for an inclusion proof of it against the current known tree hash.

<div class="info">

In practice, browsers don't actually do this because of privacy concerns, since asking for inclusion proof reveals which site you are visiting, and also because the CT server probably can't withstand everyone connecting to it. Detail of real-life implementation in browsers are out of the scope of this article.<footnote>read: I don't know</footnote>

</div>

In order to hold log servers more accountable, we also need it to sign the tree hash they gave clients with their public key. Therefore, if a log ever attempts to send inconsistent hashes, or fork the tree between clients, once this is discovered there is a way to prove that the log really did that. This also allow clients to "*gossip*" between each other&mdash;they could exchange the latest hash and signature that they received, and check for consistency, so that if the log ever tries to present different fork of the tree to different clients, there is a chance that (if they are gossiping between each other, or to a common third-party) it will be catched.

This signature is called a *Signed Tree Hash* in certificate transparency, and in the protocol it includes the following information: the tree hash itself, the corrosponding tree size, and a timestamp that is no earlier than the time the last certificate is added to this tree<footnote>along with a `version` and a `signature_type`, which we won't care about.</footnote>.

<noscript id="sth-fetch">If you enable JavaScript you can see the latest STH of Google's pilot log here.</noscript>

<div class="info">As I have said before, this article is still work-in-progress. The rest of the content is yet to be written.</div>

## Signed Certificate Timestamps

### Maximum merge delays - all about scalability.

## Precertificate

## My new Rust library

## Current adoption

## Sidenote: if we have CT why do we need CA anymore?
