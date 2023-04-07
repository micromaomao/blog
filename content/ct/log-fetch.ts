export async function get_json(path: string, baseurl: string = "https://ct.googleapis.com/logs/argon2023/ct/v1/"): Promise<any> {
	let res = await fetch(baseurl + path, {method: "GET", credentials: "omit", mode: "cors"});
	return await res.json();
}

export async function init_sth_fetch(container: HTMLElement) {
	async function do_fetch() {
		try {
			let json = await get_json("get-sth");
			container.style.color = "";
			container.innerHTML = "";
			let pre = document.createElement("pre");
			pre.innerText = JSON.stringify(json, null, 2);
			pre.style.overflowX = "auto";
			container.appendChild(pre);
		} catch (e: any) {
			container.innerText = e.message;
			container.style.color = "red";
		}
	}
	container.innerHTML = "Fetching STH from Google&hellip;";
	do_fetch().finally(() => setInterval(do_fetch, 5000));
}
