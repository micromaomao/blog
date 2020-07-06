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
	let fo = SVG(`<foreignObject x="0" y="0", width="${width}", height="${height}" />`);
	fo.node.appendChild(html);
	if (parent !== null) {
		parent.add(fo);
	}
	return fo;
}

export async function texbox(tex: string, parent: Container | null): Promise<Element> {
	let MathJax = await load_mathjax();
	let svginner = (await MathJax.tex2svgPromise(tex)).children[0] as HTMLElement;
	return htmlbox(svginner, parent);
}
