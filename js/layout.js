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

  dock_button.addEventListener("click", evt => {
    toc.classList.toggle("docked");
    if (toc.classList.contains("docked")) {
      toc.classList.remove("hidden");
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
    } else {
      dock_button.innerText = "dock to side";
      toc.querySelector(".open-dock-button").remove();
      let toc_y = toc.getBoundingClientRect().top;
      window.scrollTo(0, window.scrollY + toc_y);
    }
  });

  document.addEventListener("mousedown", evt => {
    if (!evt.target.closest(".toc-container") ||
      (evt.target.tagName == "A" && !evt.target.classList.contains("dock-button"))) {
      if (toc.classList.contains("docked") && !toc.classList.contains("hidden")) {
        toc.classList.add("hidden");
        evt.preventDefault();
      }
    }
  });
}
