import { bind_container, onready } from "js/jsmeta";
import { load_mathjax } from "js/load-mathjax";
load_mathjax();
import { Ellipse } from "@svgdotjs/svg.js";
import { init_inclusion_demo, init_consistency_demo } from "./tree-demos";
import { init_sth_fetch } from "./log-fetch";

onready(() => {
	let container = bind_container("demo-inclusion");
	container.innerHTML = "...";
	init_inclusion_demo(container);

	let container2 = bind_container("demo-consistency");
	container2.innerHTML = "...";
	init_consistency_demo(container2);

	let container3 = bind_container("sth-fetch");
	container3.innerHTML = "...";
	init_sth_fetch(container3);
});
