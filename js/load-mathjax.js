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
		resolve(window.MathJax);
	});
	script.addEventListener("error", evt => {
		reject(evt.error);
	});
	document.head.appendChild(script);
	loading_promise = prom;
	return prom;
}
