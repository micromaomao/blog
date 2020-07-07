let loading_promise = null;
export function load_mathjax() {
	if (loading_promise) {
		return loading_promise;
	}
	window.MathJax = {
		skipStartupTypeset: true
	};
	let script = document.createElement('script');
  script.src = 'https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg.js';
	script.async = true;
	let resolve, reject;
	let prom = new Promise((a, b) => {
		resolve = a;
		reject = b;
	});
	script.addEventListener("load", evt => {
		let cache = new Map();
		window.MathJax.cachedTex2SvgPromise = async function(tex) {
			if (cache.has(tex)) {
				let html = await cache.get(tex);
				let cont = document.createElement("div");
				cont.innerHTML = html;
				return cont.children[0];
			} else {
				let ele;
				let prom = window.MathJax.tex2svgPromise(tex).then(res => {
					ele = res.children[0];
					return Promise.resolve(ele.outerHTML);
				});
				cache.set(tex, prom);
				await prom;
				return ele;
			}
		}
		resolve(window.MathJax);
	});
	script.addEventListener("error", evt => {
		reject(evt.error);
	});
	document.head.appendChild(script);
	loading_promise = prom;
	return prom;
}
