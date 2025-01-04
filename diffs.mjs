import hljs from "highlight.js";

function highlight(code, language) {
  if (language == "config") {
    language = "sh";
  }
  if (!hljs.getLanguage(language)) {
    language = "txt";
  }
  return hljs.highlight(code, { language }).value;
}

function parseHunkLine(line) {
  let hunk_parse = line.match(/^(@@ [^@]+ @@)(.*)$/);
  if (!hunk_parse) {
    throw new Error("Invalid patch format: invalid hunk header");
  }
  return {
    type: "hunk",
    hunk_lines: hunk_parse[1],
    hunk_func: hunk_parse[2]
  };
}

function parseDiffBody(lines) {
  let parsed_files = [];
  let curr_file_headers = null;
  let curr_file_hunks = null;
  let curr_hunk_code_lines = null;
  let state = null;
  for (let ptr = 0; ptr < lines.length; ptr += 1) {
    let line = lines[ptr];
    if (line.startsWith("diff --git")) {
      let parsed_line = line.match(/^diff --git a\/(.+) b\/(.+)$/);
      if (!parsed_line) {
        throw new Error("Invalid patch format: invalid diff header");
      }
      curr_file_headers = [];
      curr_file_hunks = [];
      parsed_files.push({
        file_a: parsed_line[1],
        file_b: parsed_line[2],
        headers: curr_file_headers,
        hunks: curr_file_hunks
      });
      state = "header";
      curr_file_headers.push({
        type: "header-start",
        text: line
      });
    } else if (curr_file_headers === null) {
      // leading garbage
      continue;
    } else if (state == "header") {
      if (line.startsWith("@@ ")) {
        // state = "hunk";
        curr_hunk_code_lines = [];
        curr_file_hunks.push({
          hunk_line: parseHunkLine(line),
          code_lines: curr_hunk_code_lines
        });
        state = "body";
      } else {
        curr_file_headers.push({
          type: "header",
          text: line
        });
      }
    } else if (state == "body") {
      if (line.startsWith("@@ ")) {
        // state = "hunk";
        curr_hunk_code_lines = [];
        curr_file_hunks.push({
          hunk_line: parseHunkLine(line),
          code_lines: curr_hunk_code_lines
        });
        // state = "body";
      } else if (line.startsWith(" ")) {
        curr_hunk_code_lines.push({
          type: "context",
          symbol: " ",
          code: line.substring(1),
        });
      } else if (line.startsWith("+")) {
        curr_hunk_code_lines.push({
          type: "add",
          symbol: "+",
          code: line.substring(1),
        });
      } else if (line.startsWith("-")) {
        curr_hunk_code_lines.push({
          type: "delete",
          symbol: "-",
          code: line.substring(1),
        });
      } else {
        throw new Error("Invalid patch format: invalid line beginning in hunk body");
      }
    }
  }
  return parsed_files;
}

function parseDiff(diff_text) {
  let lines = diff_text.split('\n');
  if (lines[0].startsWith("diff --git")) {
    return {
      body: parseDiffBody(lines)
    };
  }
  const GIT_PATCH_FIRST_LIST_REGEX = /^From ([0-9a-f]+) Mon Sep 17 00:00:00 2001$/;
  let git_match = lines[0].match(GIT_PATCH_FIRST_LIST_REGEX);
  if (git_match) {
    let commit_hash = git_match[1];
    let first_split = lines.indexOf("---");
    if (first_split == -1) {
      throw new Error("Invalid patch format: no ---");
    }
    let second_split = lines.lastIndexOf("-- ");
    if (second_split == -1 || second_split < first_split) {
      throw new Error("Invalid patch format: no --");
    }
    let patch_header_lines = lines.slice(1, first_split);
    let patch_headers = {};
    for (let line of patch_header_lines) {
      if (line.trim() == "") {
        continue;
      }
      let [key, value] = line.split(": ", 2);
      if (!key || !value) {
        throw new Error("Invalid patch format: Invalid header line " + line);
      }
      patch_headers[key] = value;
    }
    let patch_body_lines = lines.slice(first_split + 1, second_split);
    return {
      commit_hash,
      subject: patch_headers["Subject"],
      body: parseDiffBody(patch_body_lines)
    }
  }
  throw new Error("Unknown patch format");
}

function formatCodeFromLines(lines, language) {
  let html_lines = highlight(lines.join('\n'), language).split('\n');
  let processed_lines = [];
  let last_line_open_class = null;
  for (let line of html_lines) {
    if (last_line_open_class) {
      line = `<span class="${last_line_open_class}">${line}`;
      last_line_open_class = null;
    }
    let last_open_span_start = line.lastIndexOf('<span ');
    let last_close_span_start = line.lastIndexOf('</span>');
    // If there is a span open, and either
    //   there is no closing tag, so last_close_span_start is -1 which is < last_open_span_start, or
    //   there is a closing tag, but it is before the last open span tag, so last_close_span_start < last_open_span_start
    // then we have an unclosed span, and we record that so that we can add it to the next line (and also close off the span on this line)
    if (last_open_span_start != -1 && last_close_span_start < last_open_span_start) {
      last_line_open_class = line.substring(last_open_span_start).match(/^<span class="([^<>"]+)">/)[1];
      if (!last_line_open_class) {
        throw new Error("Unexpected HTML shape returned from hljs");
      }
      line += '</span>';
    }
    processed_lines.push(line);
  }
  return processed_lines;
}

function makeCodeBlocksForHunk(lines, language, container, $) {
  let old_code_lines = [];
  let new_code_lines = [];
  for (let line of lines) {
    let code = line.code;
    if (line.type == "context") {
      old_code_lines.push(code);
      new_code_lines.push(code);
    } else if (line.type == "add") {
      new_code_lines.push(code);
    } else if (line.type == "delete") {
      old_code_lines.push(code);
    }
  }
  let old_fmt = formatCodeFromLines(old_code_lines, language);
  let new_fmt = formatCodeFromLines(new_code_lines, language);
  let old_ptr = 0;
  let new_ptr = 0;
  for (let line of lines) {
    let formatted_code = undefined;
    if (line.type == "context") {
      formatted_code = old_fmt[old_ptr];
      if (old_fmt[old_ptr] !== new_fmt[new_ptr]) {
        throw new Error(`Assertion failed: old and new code formatted lines differ. Old is ${old_fmt[old_ptr]}, new is ${new_fmt[new_ptr]}`);
      }
      old_ptr += 1;
      new_ptr += 1;
    } else if (line.type == "delete") {
      formatted_code = old_fmt[old_ptr];
      old_ptr += 1;
    } else if (line.type == "add") {
      formatted_code = new_fmt[new_ptr];
      new_ptr += 1;
    }
    if (formatted_code === undefined) {
      throw new Error(`Assertion failed: formatted code is undefined for line ${line}, old_ptr = ${old_ptr}, new_ptr = ${new_ptr}`);
    }
    let line_elem = $('<div class="diff-line"></div>');
    line_elem.addClass(`diff-${line.type}`);
    let symb_elem = $('<span class="diff-symbol"></span>');
    symb_elem.text(line.symbol);
    line_elem.append(symb_elem);
    let code_elem = $('<span class="diff-code"></span>');
    code_elem.html(formatted_code);
    line_elem.append(code_elem);
    container.append(line_elem);
  }
}

export function processDiff(diff_text, cheerio_api) {
  let $ = cheerio_api;
  let elem_container = $('<div class="diff-block-container"></div>');
  let elem = $('<div class="diff-block"></div>');
  elem_container.append(elem);
  let parsed_diff = parseDiff(diff_text);
  for (let file of parsed_diff.body) {
    let language = "txt";
    let file_a = file.file_a;
    let ext_match = file_a.match(/\.(.+)$/);
    if (ext_match) {
      language = ext_match[1];
    }
    for (let line of file.headers) {
      let line_elem = $('<div class="diff-line"></div>');
      line_elem.addClass(`diff-${line.type}`);
      line_elem.text(line.text);
      elem.append(line_elem);
    }
    for (let hunks of file.hunks) {
      let hunk_line = hunks.hunk_line;
      let line_elem = $('<div class="diff-line diff-hunk"></div>');
      let l_elem = $('<span class="diff-hunk-lines"></span>');
      l_elem.text(hunk_line.hunk_lines);
      line_elem.append(l_elem);
      let f_elem = $('<span class="diff-hunk-function"></span>');
      f_elem.html(highlight(hunk_line.hunk_func, language));
      line_elem.append(f_elem);
      elem.append(line_elem);
      makeCodeBlocksForHunk(hunks.code_lines, language, elem, $);
    }
  }
  return elem_container;
}
