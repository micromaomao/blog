import { createRoot } from "react-dom/client";
import { onready, bind_container } from "js/jsmeta";

onready(async () => {
  let elem = bind_container("embedding_tool");
  elem.innerHTML = "Loading...";
  let Component = (await import("./embedding-tool")).Component;
  elem.innerHTML = "";
  createRoot(elem).render(Component());
});
