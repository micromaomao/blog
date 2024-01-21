import * as ReactDOM from "react-dom";
import { Component } from "./embedding-tool";
import { onready, bind_container } from "js/jsmeta";

onready(() => {
  let elem = bind_container("embedding_tool");
  ReactDOM.render(Component(), elem);
});
