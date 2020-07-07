let loading_promise = null;
export function load_mathjax() {
	if (loading_promise) {
		return loading_promise;
	}
	window.MathJax = {
		skipStartupTypeset: true,
		startup: {
			ready() {
				if (MathJax.version === '3.0.5') {
					const SVGWrapper = MathJax._.output.svg.Wrapper.SVGWrapper;
					const CommonWrapper = SVGWrapper.prototype.__proto__;
					SVGWrapper.prototype.unicodeChars = function (text, variant) {
						if (!variant) variant = this.variant || 'normal';
						return CommonWrapper.unicodeChars.call(this, text, variant);
					}
				}
				MathJax.startup.defaultReady();
			}
		}
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
				try {
					await prom;
					return ele;
				} catch (e) {
					console.error(e);
					let errmsg = document.createElement("span");
					errmsg.style.color = "red";
					errmsg.style.textAlign = "left";
					errmsg.appendChild(document.createTextNode(`MathJax errored: ${e.toString()} (tex source: ${tex})`));
					return errmsg;
				}
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
