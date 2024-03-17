self.addEventListener("message", evt => {
  if (typeof evt.data.code == "string") {
    console.log = function () {
      postMessage({ type: "log", data: Array.from(arguments) });
    };
    console.error = function () {
      postMessage({ type: "error", data: Array.from(arguments) });
    };
    try {
      eval(evt.data.code);
    } catch (e) {
      console.error(e);
    }
    postMessage({ type: "done" });
  }
});
