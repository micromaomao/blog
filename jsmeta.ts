let noscripts: Record<string, Element> = {};
let placeholders: Record<string, Element> = {};

let init_callbacks: (() => void)[] | null = [];
export function onready(fn: (() => void)) {
	if (init_callbacks === null) {
		fn();
	} else {
		init_callbacks.push(fn);
	}
}

export function bind_container(id: string): Element {
	if (init_callbacks !== null) {
		throw new Error("Must call after document ready.");
	}
	if (!noscripts.hasOwnProperty(id)) {
		throw new Error("Invalid id.");
	}
	if (!placeholders.hasOwnProperty(id)) {
		throw new Error("Double bind.");
	}
	placeholders[id].remove();
	delete placeholders[id];
	let container = document.createElement("div");
	noscripts[id].parentElement!.insertBefore(container, noscripts[id]);
	noscripts[id].remove();
	return container;
}

function init() {
	document.querySelectorAll("noscript").forEach(ns => {
		let id = ns.id;
		if (id) {
			noscripts[id] = ns;
		}
	});

	for (let id of Object.keys(noscripts)) {
		let ph = document.createElement("div");
		Object.assign(ph.style, {
			color: "white",
			backgroundColor: "red",
			fontSize: "1.2rem",
			padding: "1rem 2rem"
		});
		ph.append(document.createTextNode("Container not bound."));
		noscripts[id].parentNode!.insertBefore(ph, noscripts[id].nextSibling);
		placeholders[id] = ph;
	}

	let init_cbs = init_callbacks!;
	init_callbacks = null;
	for (let fn of init_cbs) {
		fn();
	}
}

if (document.readyState === "complete") {
	init();
} else {
	document.addEventListener("readystatechange", function docReadyStateHandler() {
		if (document.readyState === "complete") {
			init();
			document.removeEventListener("readystatechange", docReadyStateHandler);
		}
	});
}
