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
