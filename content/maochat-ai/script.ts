import { createRoot } from "react-dom/client";
import { onready, bind_container } from "js/jsmeta";
import { Component } from "./embedding-tool"

onready(async () => {
  let elem = bind_container("embedding_tool");
  createRoot(elem).render(Component());
});
