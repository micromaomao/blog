import * as monaco from "monaco-editor";
import styles from "./interactive-editor.module.css";
import runIcon from "!raw-loader!./run-icon.svg";
import stopIcon from "!raw-loader!./stop-icon.svg";

function findPrevPre(elem: ChildNode): HTMLPreElement | null {
  while (true) {
    if (!elem.previousSibling) {
      return null;
    }
    elem = elem.previousSibling;
    if (elem.nodeType == Node.ELEMENT_NODE && (elem as HTMLElement).tagName == "PRE") {
      return elem as HTMLPreElement;
    }
  }
}

function initEditor(code_block: HTMLPreElement, output_block: HTMLPreElement) {
  let orig_code = code_block.innerText;
  let orig_output = output_block.innerText;
  let new_container = document.createElement("div");
  new_container.className = styles.container;
  code_block.parentNode!.replaceChild(new_container, code_block);
  output_block.remove();
  let editor_div = document.createElement("div");
  editor_div.className = styles.editor;
  new_container.appendChild(editor_div);
  let editor = monaco.editor.create(editor_div, {
    value: orig_code,
    language: "javascript",
    minimap: {
      enabled: false,
    },
    automaticLayout: true,
    scrollBeyondLastLine: false,
    scrollbar: {
      alwaysConsumeMouseWheel: false,
    },
    tabSize: 2,
  });

  let buttons_container = document.createElement("div");
  buttons_container.className = styles.buttons;
  new_container.appendChild(buttons_container);
  let run_btn = document.createElement("button");
  run_btn.innerHTML = `${runIcon} Run`;
  buttons_container.appendChild(run_btn);
  let stop_btn = document.createElement("button");
  stop_btn.innerHTML = `${stopIcon} Stop`;
  buttons_container.appendChild(stop_btn);
  let warning = document.createElement("div");
  warning.innerText = "Code changes are not persisted";
  warning.className = styles.warning;
  buttons_container.appendChild(warning);
  warning.style.display = "none";

  let output_container = document.createElement("pre");
  output_container.className = styles.output;
  output_container.innerText = orig_output;
  new_container.appendChild(output_container);

  let current_run: Worker | null = null;

  function update() {
    let model = editor.getModel();
    if (!model) {
      return;
    }
    let line_count = model.getLineCount();
    let line_height = editor.getOption(monaco.editor.EditorOption.lineHeight);
    let height = (line_count + 1) * line_height;
    const min_height = 100;
    if (height < min_height) {
      height = min_height;
    }
    editor_div.style.height = height + "px";
    editor.layout();

    if (current_run) {
      run_btn.disabled = true;
      stop_btn.disabled = false;
    } else {
      run_btn.disabled = false;
      stop_btn.disabled = true;
    }
  }
  editor.onDidChangeModelContent(e => {
    warning.style.display = "";
    update();
  });
  update();
  function cancelCurrentRun() {
    if (current_run) {
      current_run.terminate();
      current_run = null;
      update();
    }
  }
  function runCode() {
    current_run = new Worker(new URL("./interactive-editor-runner-worker.js", import.meta.url));
    output_container.innerHTML = "";
    let has_any_output = false;
    current_run.addEventListener("message", e => {
      if (e.data.type == "done") {
        current_run?.terminate()
        current_run = null;
        if (!has_any_output) {
          let no_output_span = document.createElement("span");
          no_output_span.innerText = "(No output received - use console.log to output data)";
          no_output_span.className = styles.no_output;
          output_container.appendChild(no_output_span);
        }
        update();
        return;
      }

      if (Array.isArray(e.data.data)) {
        has_any_output = true;
        let output = e.data.data.join(" ");
        let span = document.createElement("span");
        span.innerText = output + "\n";
        if (e.data.type == "error") {
          span.className = styles.error;
        }
        output_container.appendChild(span);
        update();
      }
    });
    current_run.postMessage({ code: editor.getValue() });
    update();
  }
  run_btn.addEventListener("click", () => {
    cancelCurrentRun();
    runCode();
  });
  stop_btn.addEventListener("click", () => {
    cancelCurrentRun();
  });
}

export function init() {
  let all_outputs = Array.from(document.querySelectorAll("pre.output-for-code-above")) as HTMLPreElement[];
  for (let output of all_outputs) {
    let code_block = findPrevPre(output);
    if (!code_block) {
      console.error("No code block found for output block", output);
      continue;
    }
    initEditor(code_block, output);
  }
}
