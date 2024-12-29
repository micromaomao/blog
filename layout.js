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
