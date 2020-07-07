import { Container, Element, SVG } from "@svgdotjs/svg.js";
import { load_mathjax, MathJax } from "js/load-mathjax";

export function htmlbox(html: HTMLElement | string, parent: Container | null) {
	if (typeof html === "string") {
		let nh = document.createElement("span");
		nh.innerHTML = html;
		html = nh;
	}
	document.body.appendChild(html);
	let {width, height} = html.getBoundingClientRect();
	html.remove();
	let fo = SVG(`<foreignObject x="0" y="0" width="${width}" height="${height}" style="line-height: 1;" />`);
	fo.node.appendChild(html);
	if (parent !== null) {
		parent.add(fo);
	}
	return fo;
}

export async function texbox(tex: string, parent: Container | null): Promise<Element> {
	let MathJax = await load_mathjax();
	let svginner = await MathJax.cachedTex2SvgPromise(tex);
	svginner.style.verticalAlign = "";
	return htmlbox(svginner, parent);
}

export function point_to_rect(point: {x: number, y: number}, rect: {x1: number, y1: number, x2: number, y2: number}): {x: number, y: number} {
	let resx, resy;
	if (point.x > rect.x1) {
		resx = Math.min(rect.x2, point.x);
	} else {
		resx = rect.x1;
	}
	if (point.y > rect.y1) {
		resy = Math.min(rect.y2, point.y);
	} else {
		resy = rect.y1;
	}
	return {x: resx, y: resy};
}
