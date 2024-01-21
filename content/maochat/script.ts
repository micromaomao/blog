import { createRoot } from "react-dom/client";
import { Component } from "./embedding-tool";
import { onready, bind_container } from "js/jsmeta";

onready(() => {
  let elem = bind_container("embedding_tool");
  createRoot(elem).render(Component());
});
