import { bind_container, onready } from "js/jsmeta";
import { load_mathjax } from "js/load-mathjax";
load_mathjax();
import { DrawnTree } from "./TreeLayout";
import { make_inclusion_proof, TreeSegment, make_consistency_proof } from "./proofs";
import { Ellipse } from "@svgdotjs/svg.js";

function segm_to_tex(segm: TreeSegment): string {
	if (segm.end === segm.start) {
		return "0";
	}
	if (segm.end - segm.start === 1) {
		return `H(a_{${segm.start + 1}})`;
	}
	return `h_{${segm.start + 1}..${segm.end}}`;
}

async function init_inclusion_demo(container: HTMLElement) {
	container.innerHTML = "";
	let controller_contain = document.createElement("div");
	controller_contain.innerHTML = "Tree size: ";
	let tree_size_span = document.createElement("span");
	controller_contain.appendChild(tree_size_span);
	controller_contain.appendChild(document.createTextNode(" (slide to adjust)"));
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
	inclusion_proof_pf.appendChild(await MathJax.cachedTex2SvgPromise("a_n"));
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
		t.leaf_onclick = async i => {
			t.reset_style();
			current_inclusion = i;
			t.leaf_hovering_except = current_inclusion;
			t.set_leaf_text_color(current_inclusion, "rgb(0, 127, 0)");
			let proof = make_inclusion_proof(tsize, current_inclusion);
			inclusion_proof_contain.innerHTML = "...";
			let current_segm = new TreeSegment(current_inclusion, current_inclusion + 1);
			t.node_style(current_segm).line_color = "rgb(127,127,0)";
			let tex_str = `{\\color{rgb(0,127,0)}{${segm_to_tex(current_segm)}}}`;
			for (let i = 0; i < proof.length; i ++) {
				let segm = proof[i];
				let segmtex = segm_to_tex(segm);
				let ns = t.node_style(segm);
				if (i === 0 && segm.end - segm.start === 1) {
					segmtex = `{\\color{rgb(127,0,127)}{${segmtex}}}`;
					ns.line_color = "red";
					ns.text_color = "rgb(127,0,127)";
				} else {
					segmtex = `{\\color{red}{${segmtex}}\\color{black}}`;
					ns.line_color = ns.text_color = "red";
				}
				if (segm.start < current_segm.start) {
					tex_str = `H(${segmtex} || ${tex_str})`;
					current_segm = new TreeSegment(segm.start, current_segm.end);
				} else {
					tex_str = `H(${tex_str} || ${segmtex})`;
					current_segm = new TreeSegment(current_segm.start, segm.end);
				}
				tex_str = `\\underbrace{${tex_str}}_{\\color{rgb(127,127,0)}{${segm_to_tex(current_segm)}}}`;
				let ts = t.node_style(current_segm);
				ts.text_color = ts.line_color = "rgb(127,127,0)";
			}
			t.node_style(current_segm).text_color = "rgb(127,127,0)";
			let tt = await MathJax.cachedTex2SvgPromise("h_\\text{all} = " + tex_str);
			inclusion_proof_contain.innerHTML = "";
			inclusion_proof_contain.appendChild(tt);
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
	let proof_contain = document.createElement("div");
	container.appendChild(proof_contain);
	let current_promise: Promise<void> | null = null;
	let current_tsize = 0;
	let current_oldsize = 0;
	let current_tree: DrawnTree = new DrawnTree(current_tsize);
	let MathJax = await load_mathjax();
	async function update() {
		let tsize = parseInt(tree_size_control.value);
		let oldsize = Math.min(parseInt(old_size_control.value), tsize);
		if (old_size_control.value !== oldsize.toString()) {
			old_size_control.value = oldsize.toString();
		}
		if (tsize !== current_tsize) {
			current_tsize = tsize;
			current_oldsize = oldsize;
			svg_contain.innerHTML = "...";
			tree_size_span.textContent = tsize.toString();
			old_size_span.textContent = oldsize.toString();
			current_tree = new DrawnTree(tsize);
			await current_tree.draw();
			svg_contain.innerHTML = "";
			current_tree.addTo(svg_contain);
			await update_proof();
		} else if (oldsize !== current_oldsize) {
			current_oldsize = oldsize;
			old_size_span.textContent = oldsize.toString();
			await update_proof();
		}

		async function update_proof() {
			let proof = make_consistency_proof(current_oldsize, current_tsize);
			current_tree.reset_style();
			if (current_oldsize === current_tsize) {
				proof_contain.innerHTML = "Nothing to proof: old size is already tree size.";
			} else {
				proof_contain.innerHTML = "...";
				for (let le = current_oldsize; le < current_tsize; le ++) {
					current_tree.set_leaf_text_color(le, "#666");
				}
				let current_subtree = proof[0];
				let current_old_subtree = proof[0];
				// First component of proof is always a part of the previous tree.
				let old_hall_tex = `{\\color{rgb(127,127,0)}{${segm_to_tex(current_subtree)}}}`;
				let new_hall_tex = old_hall_tex;
				let ns = current_tree.node_style(current_subtree);
				ns.line_color = ns.text_color = "rgb(127,127,0)";
				for (let i = 1; i < proof.length; i ++) {
					let subtree = proof[i];
					let is_old_part = subtree.end <= current_oldsize;
					let ns = current_tree.node_style(subtree);
					let col = is_old_part ? "rgb(127,127,0)" : "red";
					ns.line_color = ns.text_color = col;
					if (subtree.start > current_subtree.start) {
						new_hall_tex = `H(${new_hall_tex} || {\\color{${col}}{${segm_to_tex(subtree)}}})`;
						if (is_old_part) {
							old_hall_tex = `H(${old_hall_tex} || {\\color{${col}}{${segm_to_tex(subtree)}}})`;
							current_old_subtree = new TreeSegment(current_old_subtree.start, subtree.end);
						}
						current_subtree = new TreeSegment(current_subtree.start, subtree.end);
					} else {
						new_hall_tex = `H({\\color{${col}}{${segm_to_tex(subtree)}}} || ${new_hall_tex})`;
						if (is_old_part) {
							old_hall_tex = `H({\\color{${col}}{${segm_to_tex(subtree)}}} || ${old_hall_tex})`;
							current_old_subtree = new TreeSegment(subtree.start, current_old_subtree.end);
						}
						current_subtree = new TreeSegment(subtree.start, current_subtree.end);
					}
					ns = current_tree.node_style(current_subtree);
					ns.text_color = ns.line_color = "red";
					new_hall_tex = `\\overbrace{${new_hall_tex}}^{${segm_to_tex(current_subtree)}}`;
					if (is_old_part) {
						old_hall_tex = `\\underbrace{${old_hall_tex}}_{${segm_to_tex(current_old_subtree)}}`;
					}
				}
				let new_tex_render = await MathJax.cachedTex2SvgPromise("h_\\text{all}\\ \\text{(new tree)} = " + new_hall_tex);
				let old_tex_render = await MathJax.cachedTex2SvgPromise(`${segm_to_tex(current_old_subtree)}\\ \\text{(old tree)} = ` + old_hall_tex);
				proof_contain.innerHTML = "";
				proof_contain.appendChild(new_tex_render);
				proof_contain.appendChild(document.createElement("br"));
				proof_contain.appendChild(old_tex_render);
			}
			current_tree.old_size = current_oldsize;
			current_tree.update_style();
		}
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
