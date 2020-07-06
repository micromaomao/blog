declare module "js/load-mathjax" {
	interface MathJax {
		tex2svg: (tex: string, options?: any) => HTMLElement
		tex2svgPromise: (tex: string, options?: any) => Promise<HTMLElement>
	}

	export function load_mathjax(): Promise<MathJax>
}
