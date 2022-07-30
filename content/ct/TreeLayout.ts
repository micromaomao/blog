import { SVG, G, Container, Line, Rect } from "@svgdotjs/svg.js";
import { texbox, point_to_rect } from "js/svgutils";
import { TreeSegment } from "./proofs";

export interface TreeLayout {
	layer_vskip: number;
	leaf_size: number;
	node_height: number;
	leaf_hskip: number;
	margin: number;
}

export function default_tree_layout(): TreeLayout {
	return {
		layer_vskip: 50,
		leaf_size: 50,
		node_height: 16,
		leaf_hskip: 20,
		margin: 4,
	};
}

export interface NodeStyle {text_color: string, line_color: string};

export class DrawnTree {
	svg: G;
	size: number;
	depth: number;
	leafs: { g: G; l: Line | null; }[] = [];
	nodes: { g: G; l: Line | null; }[][] = [];
	layout: TreeLayout;
	leaf_hovering: boolean[] = [];
	leaf_hovering_except: number | null = null;
	leaf_cursor_pointer: boolean = false;
	leaf_onclick: ((i: number) => void) | null = null;
	node_styles: NodeStyle[][] = [];
	old_size: number | null = null;
	old_size_rect: Rect | null = null;

	get pixel_height(): number {
		if (this.size === 0) {
			return 0;
		}
		return this.layout.leaf_size + (this.layout.layer_vskip + this.layout.node_height) * (this.depth - 1) + this.layout.margin * 2;
	}

	get pixel_width(): number {
		return (this.layout.leaf_size + this.layout.leaf_hskip) * this.size - this.layout.leaf_hskip + this.layout.margin * 2;
	}

	constructor(size: number, layout: TreeLayout = default_tree_layout()) {
		this.layout = layout;
		this.size = size;
		if (size === 0) {
			this.depth = 0;
		}
		else {
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
		for (let i = 0; i < this.depth - 1; i++) {
			this.nodes.push([]);
		}
		let gw = Math.pow(2, this.depth - 1);
		let di = 0;
		function node_center(i: number): number {
			return i * (layout.leaf_size + layout.leaf_hskip) + layout.leaf_size / 2;
		}
		let last_coordinates: ({ x: number; y: number; })[] = [];
		while (gw > 1) {
			let new_coordinates: ({ x: number; y: number; })[] = [];
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
				new_coordinates.push({ x: midx, y: ybase });
				new_coordinates.push();
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
				let h = label.height() as number;
				let w = label.width() as number; // FIXME
				let scale = layout.node_height / h;
				label.attr({ transform: `scale(${scale})` });
				w *= scale;
				h *= scale;
				sg.attr({ transform: `translate(${-w / 2}, ${-h})` });

				let l = null;
				let pk = Math.floor(k / 2);
				if (last_coordinates.length > pk) {
					let connect_to = last_coordinates[pk];
					let [x1, y1] = [connect_to.x, connect_to.y + 2];
					let { x: x2, y: y2 } = point_to_rect({ x: x1, y: y1 }, { x1: midx - w / 2, y1: ybase - h, x2: midx + w / 2, y2: ybase + 2 });
					l = this.svg.line(x1, y1, x2, y2);
					l.attr({
						stroke: "black",
						"stroke-width": 1
					});
				}
				this.nodes[di].push({ g, l });
				k += 1;
			}
			gw /= 2;
			di += 1;
			last_coordinates = new_coordinates;
		}
		for (let i = 0; i < this.size; i++) {
			let nb = i + 1;
			let ele = new G({});
			let bx = i * (layout.leaf_hskip + layout.leaf_size);
			let by = (layout.layer_vskip + layout.node_height) * (this.depth - 1);
			ele.translate(bx, by);
			ele.rect(layout.leaf_size, layout.leaf_size).attr({
				fill: "transparent",
				stroke: "black",
				"stroke-width": "1"
			});
			let tex = await texbox(`H(a_{${nb}})`, ele);
			let h = tex.height() as number;
			let w = tex.width() as number; // FIXME
			let maxw = layout.leaf_size - 4;
			let scale = 1;
			if (w > maxw) {
				scale = maxw / w;
				tex.attr({ transform: `scale(${scale})` });
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
				l = this.svg.line(x1, y1, lc.x, lc.y + 2);
				l.attr({
					stroke: "black",
					"stroke-width": 1
				});
			}
			this.leafs.push({ g: ele, l });
		}

		for (let i = 0; i < this.size; i++) {
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
			});
		}
		this.svg.node.addEventListener("mouseleave", evt => {
			for (let i = 0; i < this.size; i++) {
				this.leaf_hovering[i] = false;
			}
			this.update_style();
		});
		this.reset_style();
		this.update_style();
	}

	reset_style() {
		this.node_styles = [];
		for (let d = 0; d < this.nodes.length; d ++) {
			this.node_styles.push([]);
			for (let i = 0; i < this.nodes[d].length; i ++) {
				this.node_styles[d].push({
					text_color: "black",
					line_color: "black"
				});
			}
		}
		let leafs: NodeStyle[] = [];
		for (let le = 0; le < this.size; le ++) {
			leafs.push({line_color: "black", text_color: "black"});
		}
		this.node_styles.push(leafs);
		this.old_size = null;
	}

	update_style() {
		if (this.size === 0) return;
		let le_styles = this.node_styles[this.nodes.length];
		for (let i = 0; i < this.size; i++) {
			let g = this.leafs[i].g;
			if (this.leaf_cursor_pointer) {
				g.node.style.cursor = "pointer";
			}
			else {
				g.node.style.cursor = "";
			}
			let {text_color: color, line_color} = le_styles[i];
			if (this.leaf_hovering[i] && this.leaf_cursor_pointer && this.leaf_hovering_except !== i) {
				color = "blue";
			}
			g.findOne("rect")!.attr({
				stroke: color
			});
			g.findOne("foreignObject")!.node.style.color = color;
			this.leafs[i].l?.attr({stroke: line_color});
		}

		for (let di = 0; di < this.nodes.length; di ++) {
			let styles = this.node_styles[di];
			let nodes = this.nodes[di];
			for (let i = 0; i < styles.length; i ++) {
				let {g, l} = nodes[i];
				g.findOne("foreignObject")!.node.style.color = styles[i].text_color;
				l?.attr({stroke: styles[i].line_color});
			}
		}

		if (this.old_size === null) {
			if (this.old_size_rect !== null) {
				this.old_size_rect.remove();
				this.old_size_rect = null;
			}
		} else {
			let layout = this.layout;
			let inner_sep = 5;
			let width = 2*inner_sep + (layout.leaf_size + layout.leaf_hskip) * this.old_size - layout.leaf_hskip;
			if (this.old_size_rect === null) {
				this.old_size_rect = new Rect({
					y: (layout.node_height + layout.layer_vskip) * (this.depth - 1) - inner_sep,
					height: layout.leaf_size + inner_sep * 2,
					x: -inner_sep,
					width
				}).attr({
					stroke: "none",
					fill: "rgba(100,100,100,0.1)"
				});
				this.svg.add(this.old_size_rect);
			} else {
				this.old_size_rect.width(width);
			}
		}
	}

	addTo(parent: Container | HTMLElement) {
		if (parent instanceof Container) {
			parent.add(this.svg);
		}
		else {
			let svg_parent = SVG();
			svg_parent.add(this.svg);
			svg_parent.width(this.pixel_width);
			svg_parent.height(this.pixel_height);
			svg_parent.addTo(parent);
		}
	}

	set_leaf_text_color(index: number, color: string) {
		this.node_styles[this.nodes.length][index].text_color = color;
	}

	node_style(segment: TreeSegment): NodeStyle {
		if (segment.end === segment.start) throw new Error("Segment empty");
		let ld = Math.ceil(Math.log2(segment.end - segment.start));
		let di = this.nodes.length - ld;
		if (di < 0) di = 0;
		let dlen = Math.pow(2, ld);
		let idx = Math.floor(segment.start / dlen);
		return this.node_styles[di][idx];
	}
}
