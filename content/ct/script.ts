import { bind_container, onready } from "js/jsmeta";
import { load_mathjax } from "js/load-mathjax";
load_mathjax();
import { SVG, Svg, G, Container, Line } from "@svgdotjs/svg.js";
import { texbox, point_to_rect } from "js/svgutils";

interface TreeLayout {
	layer_vskip: number;
	leaf_size: number;
	node_height: number;
	leaf_hskip: number;
	margin: number;
}

function default_tree_layout(): TreeLayout {
	return {
		layer_vskip: 50,
		leaf_size: 50,
		node_height: 16,
		leaf_hskip: 20,
		margin: 4,
	};
}

class DrawnTree {
	svg: G;
	size: number;
	depth: number;
	leafs: {g: G, l: Line | null}[] = [];
	nodes: {g: G, l: Line | null}[][] = [];
	layout: TreeLayout;
	leaf_hovering: boolean[] = [];
	leaf_hovering_except: number | null = null;
	leaf_cursor_pointer: boolean = false;
	leaf_colors: string[] = [];
	leaf_onclick: ((i: number) => void) | null = null;

	get pixel_height(): number {
		if (this.size === 0 ) {
			return 0;
		}
		return this.layout.leaf_size + (this.layout.layer_vskip + this.layout.node_height) * (this.depth - 1) + this.layout.margin * 2;
	}

	get pixel_width(): number {
		return (this.layout.leaf_size + this.layout.leaf_hskip) * this.size - this.layout.leaf_hskip + this.layout.margin * 2;
	}

	constructor (size: number, layout: TreeLayout = default_tree_layout()) {
		this.layout = layout;
		this.size = size;
		if (size === 0) {
			this.depth = 0;
		} else {
			let mu = 1;
			let depth = 1;
			while (mu < size) {
				mu *= 2;
				depth += 1;
			}
			this.depth = depth;
		}
		this.svg = new G({});
	}

	async draw(): Promise<void> {
		let layout = this.layout;
		this.svg.translate(layout.margin, layout.margin);
		for (let i = 0; i < this.depth - 1; i ++) {
			this.nodes.push([]);
		}
		let gw = Math.pow(2, this.depth - 1);
		let di = 0;
		function node_center(i: number): number {
			return i * (layout.leaf_size + layout.leaf_hskip) + layout.leaf_size / 2;
		}
		let last_coordinates: ({x: number, y: number})[] = [];
		while (gw > 1) {
			let new_coordinates: ({x: number, y: number})[] = [];
			let k = 0;
			for (let start = 0; start < this.size; start += gw) {
				let end = Math.min(start + gw - 1, this.size - 1);
				if (end - start + 1 <= gw / 2) {
					new_coordinates.push(last_coordinates[last_coordinates.length - 1]);
					break;
				}
				let midx = (node_center(start) + node_center(end)) / 2;
				let real_midx = (node_center(start) + node_center(start + gw - 1)) / 2;
				midx = (midx + real_midx) / 2;
				if (midx > this.pixel_width - layout.leaf_size) {
					midx = this.pixel_width - layout.leaf_size;
				}
				let ybase = (layout.layer_vskip + layout.node_height) * di + layout.node_height;
				new_coordinates.push({x: midx, y: ybase});
				new_coordinates.push()
				let g = new G({});
				this.svg.add(g);
				g.translate(midx, ybase);
				let sg = new G({});
				g.add(sg);
				let label_text = `h_{${start + 1}..${end + 1}}`;
				if (di === 0) {
					label_text = `h_\\text{all} = ${label_text}`;
				}
				let label = await texbox(label_text, sg);
				let h = label.height();
				let w = label.width();
				let scale = layout.node_height / h;
				label.attr({transform: `scale(${scale})`});
				w *= scale;
				h *= scale;
				sg.attr({transform: `translate(${-w/2}, ${-h})`});

				let l = null;
				let pk = Math.floor(k / 2);
				if (last_coordinates.length > pk) {
					let connect_to = last_coordinates[pk];
					let [x1, y1] = [connect_to.x, connect_to.y + 2];
					let {x: x2, y: y2} = point_to_rect({x: x1, y: y1}, {x1: midx - w / 2, y1: ybase - h, x2: midx + w / 2, y2: ybase + 2});
					l = this.svg.line(x1, y1, x2, y2);
					l.attr({
						stroke: "black",
						"stroke-width": 1
					});
				}
				this.nodes[di].push({g, l});
				k += 1;
			}
			gw /= 2;
			di += 1;
			last_coordinates = new_coordinates;
		}
		for (let i = 0; i < this.size; i ++) {
			let nb = i + 1;
			let ele = new G({})
			let bx = i * (layout.leaf_hskip + layout.leaf_size);
			let by = (layout.layer_vskip + layout.node_height) * (this.depth - 1);
			ele.translate(bx, by);
			ele.rect(layout.leaf_size, layout.leaf_size).attr({
				fill: "transparent",
				stroke: "black",
				"stroke-width": "1"
			});
			let tex = await texbox(`H(a_{${nb}})`, ele);
			let h = tex.height();
			let w = tex.width();
			let maxw = layout.leaf_size - 4;
			let scale = 1;
			if (w > maxw) {
				scale = maxw / w;
				tex.attr({transform: `scale(${scale})`});
				w *= scale;
				h *= scale;
			}
			tex.x((layout.leaf_size / 2 - w / 2) / scale);
			tex.y((layout.leaf_size / 2 - h / 2) / scale);
			this.svg.add(ele);
			let l = null;
			let i2 = Math.floor(i / 2);
			if (last_coordinates.length > i2) {
				let lc = last_coordinates[i2];
				let [x1, y1] = [bx + layout.leaf_size / 2, by];
				l = this.svg.line(x1, y1, lc.x, lc.y);
				l.attr({
					stroke: "black",
					"stroke-width": 1
				});
			}
			this.leafs.push({g: ele, l});
		}

		for (let i = 0; i < this.size; i ++) {
			let g = this.leafs[i].g;
			this.leaf_hovering.push(false);
			g.node.addEventListener("mouseenter", evt => {
				this.leaf_hovering[i] = true;
				this.update_style();
			});
			g.node.addEventListener("mouseleave", evt => {
				this.leaf_hovering[i] = false;
				this.update_style();
			});
			g.node.addEventListener("click", evt => {
				if (this.leaf_onclick !== null) {
					this.leaf_onclick(i);
					this.update_style();
				}
			})
		}
		this.svg.node.addEventListener("mouseleave", evt => {
			for (let i = 0; i < this.size; i ++) {
				this.leaf_hovering[i] = false;
			}
			this.update_style();
		});
		this.update_style();
	}

	update_style() {
		for (let i = 0; i < this.size; i ++) {
			let g = this.leafs[i].g;
			if (this.leaf_cursor_pointer) {
				g.node.style.cursor = "pointer";
			} else {
				g.node.style.cursor = "";
			}
			let color = "black";
			if (this.leaf_colors.length > i) {
				color = this.leaf_colors[i];
			}
			if (this.leaf_hovering[i] && this.leaf_cursor_pointer && this.leaf_hovering_except !== i) {
				color = "blue";
			}
			g.findOne("rect").attr({
				stroke: color
			});
			g.findOne("foreignObject").node.style.color = color;
		}
	}

	addTo(parent: Container | HTMLElement) {
		if (parent instanceof Container) {
			parent.add(this.svg);
		} else {
			let svg_parent = SVG();
			svg_parent.add(this.svg);
			svg_parent.width(this.pixel_width);
			svg_parent.height(this.pixel_height);
			svg_parent.addTo(parent);
		}
	}
}

async function init_inclusion_demo(container: HTMLElement) {
	container.innerHTML = "";
	let controller_contain = document.createElement("div");
	controller_contain.innerHTML = "Tree size: ";
	let tree_size_span = document.createElement("span");
	controller_contain.appendChild(tree_size_span);
	controller_contain.appendChild(document.createElement("br"));
	let controller = document.createElement("input");
	controller.type = "range";
	controller.min = "1";
	controller.max = "10";
	controller.value = "8";
	controller.style.width = "100%";
	controller_contain.style.backgroundColor = "rgba(100,100,100,0.3)";
	controller_contain.appendChild(controller);
	container.appendChild(controller_contain);
	let svg_contain = document.createElement("div");
	Object.assign(svg_contain.style, {
		width: "100%",
		height: "auto",
		overflow: "auto",
		padding: "0",
		margin: "0"
	});
	container.appendChild(svg_contain);
	let inclusion_proof_contain = document.createElement("div");
	let inclusion_proof_pf = document.createElement("div");
	inclusion_proof_pf.appendChild(document.createTextNode("Click on any "));
	let MathJax = await load_mathjax();
	inclusion_proof_pf.appendChild((await MathJax.tex2svgPromise("a_n")).childNodes[0]);
	inclusion_proof_pf.appendChild(document.createTextNode(" to see inclusion proof."));
	inclusion_proof_contain.appendChild(inclusion_proof_pf);
	container.appendChild(inclusion_proof_contain);
	let current_promise: Promise<void> | null = null;
	let current_tsize = 0;
	let current_inclusion: number | null = null;
	async function update() {
		let tsize = parseInt(controller.value);
		if (tsize === current_tsize) {
			return;
		}
		current_inclusion = null;
		inclusion_proof_contain.innerHTML = "";
		inclusion_proof_contain.appendChild(inclusion_proof_pf);
		svg_contain.innerHTML = "...";
		current_tsize = tsize;
		tree_size_span.textContent = tsize.toString();
		let t = new DrawnTree(tsize);
		t.leaf_cursor_pointer = true;
		t.leaf_onclick = i => {
			inclusion_proof_contain.innerHTML = i.toString();
			for (let k = 0; k < t.size; k ++) {
				if (k === i) {
					t.leaf_colors[k] = "rgb(0,127,0)";
					t.leaf_hovering_except = k;
				} else {
					t.leaf_colors[k] = "black";
				}
			}
		}
		await t.draw();
		svg_contain.innerHTML = "";
		t.addTo(svg_contain);
	}
	current_promise = update().finally(() => current_promise = null);
	let update_handler = () => {
		if (current_promise === null) {
			current_promise = update().finally(() => current_promise = null);
		}
	};
	controller.addEventListener("change", update_handler);
	controller.addEventListener("input", update_handler);
	let onresize = () => {
		let wid = container.getBoundingClientRect().width;
		let max_size = Math.floor(wid / 70);
		if (max_size < 10) {
			max_size = 10;
		}
		controller.max = max_size.toString();
	};
	onresize();
	window.addEventListener("resize", onresize);
}

async function init_consistency_demo(container: HTMLElement) {
	container.innerHTML = "";
	let controller_contain = document.createElement("div");
	controller_contain.innerHTML = "Tree size: ";
	let tree_size_span = document.createElement("span");
	controller_contain.appendChild(tree_size_span);
	controller_contain.appendChild(document.createElement("br"));
	controller_contain.style.backgroundColor = "rgba(100,100,100,0.3)";
	let tree_size_control = document.createElement("input");
	tree_size_control.type = "range";
	tree_size_control.min = "1";
	tree_size_control.max = "10";
	tree_size_control.value = "8";
	tree_size_control.style.width = "100%";
	controller_contain.appendChild(tree_size_control);
	controller_contain.appendChild(document.createElement("br"));
	controller_contain.appendChild(document.createTextNode("Old size: "));
	let old_size_span = document.createElement("span");
	controller_contain.appendChild(old_size_span);
	controller_contain.appendChild(document.createElement("br"));
	let old_size_control = document.createElement("input");
	old_size_control.type = "range";
	old_size_control.min = "1";
	old_size_control.max = "10";
	old_size_control.value = "8";
	old_size_control.style.width = "100%";
	controller_contain.appendChild(old_size_control);
	container.appendChild(controller_contain);
	let svg_contain = document.createElement("div");
	Object.assign(svg_contain.style, {
		width: "100%",
		height: "auto",
		overflow: "auto",
		padding: "0",
		margin: "0"
	});
	container.appendChild(svg_contain);
	let current_promise: Promise<void> | null = null;
	let current_tsize = 0;
	let current_oldsize = 0;
	async function update() {
		let tsize = parseInt(tree_size_control.value);
		let oldsize = parseInt(old_size_control.value);
		if (tsize === current_tsize && oldsize === current_oldsize) {
			return;
		}
		svg_contain.innerHTML = "...";
		current_tsize = tsize;
		current_oldsize = oldsize;
		tree_size_span.textContent = tsize.toString();
		old_size_span.textContent = oldsize.toString();
		let t = new DrawnTree(tsize);
		await t.draw();
		svg_contain.innerHTML = "";
		t.addTo(svg_contain);
	}
	current_promise = update().finally(() => current_promise = null);
	let update_handler = () => {
		if (current_promise === null) {
			current_promise = update().finally(() => current_promise = null);
		}
	};
	tree_size_control.addEventListener("change", update_handler);
	tree_size_control.addEventListener("input", update_handler);
	old_size_control.addEventListener("change", update_handler);
	old_size_control.addEventListener("input", update_handler);
	let onresize = () => {
		let wid = container.getBoundingClientRect().width;
		let max_size = Math.floor(wid / 70);
		if (max_size < 10) {
			max_size = 10;
		}
		tree_size_control.max = max_size.toString();
		old_size_control.max = max_size.toString();
	};
	onresize();
	window.addEventListener("resize", onresize);
}

onready(() => {
	let container = bind_container("demo-inclusion");
	container.innerHTML = "...";
	init_inclusion_demo(container);

	let container2 = bind_container("demo-consistency");
	container2.innerHTML = "...";
	init_consistency_demo(container2);
});
