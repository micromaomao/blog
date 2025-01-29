document.querySelectorAll(".clickable-article").forEach(elem => {
  let href = elem.getAttribute("data-href");
  if (href) {
    elem.addEventListener("click", evt => {
      if (evt.altKey) {
        return;
      }
      let sel = window.getSelection();
      if (sel && sel.toString()) {
        return;
      }
      if (evt.target.tagName != "A") {
        window.location.assign(href);
      }
    });
  }
  elem.style.cursor = "pointer";
});

let toc = document.querySelector(".toc-container");
if (toc) {
  let dock_button_container = document.createElement("span");
  dock_button_container.classList.add("dock-button-container");
  dock_button_container.append(document.createTextNode("["));
  let dock_button = document.createElement("a");
  dock_button.innerText = "dock to side";
  dock_button.classList.add("dock-button");
  dock_button_container.appendChild(dock_button);
  dock_button_container.append(document.createTextNode("]"));
  toc.querySelector(".title").appendChild(dock_button_container);

  function make_toc_docked() {
    toc.classList.add("docked");
    toc.style.transition = "none";
    toc.style.transition = "";
    dock_button.innerText = "undock";
    let open_dock_button = document.createElement("div");
    open_dock_button.classList.add("open-dock-button");
    open_dock_button.innerText = "table of contents";
    open_dock_button.addEventListener("click", evt => {
      toc.classList.toggle("hidden");
    });
    toc.appendChild(open_dock_button);
    window.sessionStorage.setItem("toc_docked", "true");
  }

  function make_toc_undocked() {
    toc.classList.remove("docked");
    dock_button.innerText = "dock to side";
    toc.querySelector(".open-dock-button").remove();
    let toc_y = toc.getBoundingClientRect().top;
    window.scrollTo(0, window.scrollY + toc_y);
    window.sessionStorage.removeItem("toc_docked");
  }

  dock_button.addEventListener("click", evt => {
    toc.classList.remove("hidden");
    if (!toc.classList.contains("docked")) {
      make_toc_docked();
    } else {
      make_toc_undocked();
    }
  });

  if (window.sessionStorage.getItem("toc_docked")) {
    make_toc_docked();
    toc.classList.add("hidden");
  }

  document.addEventListener("mousedown", evt => {
    if (!evt.target.closest(".toc-container")) {
      if (toc.classList.contains("docked") && !toc.classList.contains("hidden")) {
        toc.classList.add("hidden");
        evt.preventDefault();
      }
    }
  });

  toc.querySelectorAll("li > a").forEach(a => {
    a.addEventListener("click", evt => {
      if (toc.classList.contains("docked")) {
        toc.classList.add("hidden");
      }
    });
  });

  window.addEventListener("keydown", evt => {
    if (evt.key == "Escape" && toc.classList.contains("docked")) {
      toc.classList.add("hidden");
    }
  });
}

let code_blocks = document.querySelectorAll("body > pre, body > .diff-block-container");

function measureCodeBlocks() {
  for (let elem of code_blocks) {
    if (!(elem instanceof HTMLElement)) continue;
    let tmp = elem.cloneNode(true);
    try {
      if (!(tmp instanceof HTMLElement)) continue;
      tmp.style.width = "max-content";
      tmp.style.maxWidth = "unset";
      document.body.appendChild(tmp);
      let measuredMaxWidth = tmp.getBoundingClientRect().width;
      elem.dataset.measuredMaxWidth = measuredMaxWidth;
    } finally {
      document.body.removeChild(tmp);
    }
  }
}

measureCodeBlocks();

function layoutTryStretchPreBlocks() {
  let winwidth = window.innerWidth;
  let body_maxw = 1200;
  let margin_one_side = 40;
  let stretch_thres = body_maxw + margin_one_side * 2;
  if (winwidth < stretch_thres) {
    for (let elem of code_blocks) {
      if (!(elem instanceof HTMLElement)) continue;
      elem.style.marginLeft = "";
      elem.style.marginRight = "";
    }
  } else {
    let stretch_px_max = winwidth - stretch_thres;
    for (let elem of code_blocks) {
      if (!(elem instanceof HTMLElement)) continue;
      let max_width = parseInt(elem.dataset.measuredMaxWidth);
      let stretch_px = Math.min(stretch_px_max, max_width - (body_maxw - 40));
      let one_side = stretch_px / 2;
      elem.style.marginLeft = `-${one_side}px`;
      elem.style.marginRight = `-${one_side}px`;
    }
  }
}

layoutTryStretchPreBlocks();
window.addEventListener("resize", layoutTryStretchPreBlocks);
