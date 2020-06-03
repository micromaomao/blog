require("colors");
const fs = require("fs");
const path = require("path");
const marked = require('marked');
const jsyaml = require('js-yaml');
const child_process = require('child_process');
const pug = require('pug');
const sass = require('sass');
const cheerio = require('cheerio');
const mathjax = require("mathjax-node");
const hljs = require('highlight.js');

process.chdir(__dirname);

let output_dir = path.resolve(__dirname, "dist");

async function main () {
  let output_dir_stat = null;
  try {
    output_dir_stat = fs.statSync(output_dir);
  } catch (e) {
    if (e.message.indexOf("ENOENT") < 0) {
      throw new Error(`Error stating output directory: ${e.message}`.bold.red);
    }
  }
  if (output_dir_stat !== null && output_dir_stat.isDirectory()) {
    console.log(` ==>  Output will be written to existing directory ${output_dir}...`.gray);
  } else if (output_dir_stat === null) {
    console.log(` ==>  Output will be written to new directory ${output_dir}...`.gray);
    try {
      fs.mkdirSync(output_dir);
    } catch (e) {
      throw new Error(`Error creating output directory: ${e.message}`.bold.red);
    }
  }

  console.log(" ==>  Scanning blog articles...".blue.bold);

  let dir_entires;
  try {
    dir_entires = fs.readdirSync('content');
  } catch (e) {
    throw new Error(`Error readdiring content/: ${e.message}`);
  }
  console.log(`       (${dir_entires.length} articles to build)`.gray);
  let progress_total_work = dir_entires.length*2 + 10;
  let progress_current_work_done = 0;
  function print_status(status_text) {
    console.log(`[${Math.round(progress_current_work_done++ / progress_total_work * 100).toString().padStart(3, " ")}%] ${status_text}`.cyan);
  }
  function print_verbose(t) {
    // console.log("       " + t.gray);
  }
  function print_warn(t) {
    console.log(" Warn: " + t.yellow);
  }

  function get_template(fp) {
    let file_path = path.resolve(__dirname, fp);
    print_status(`Compile template: ${file_path}`);
    let fn;
    try {
      fn = pug.compileFile(file_path, {pretty: true});
    } catch (e) {
      throw new Error(`Error compiling ${file_path}: ${e.message}`);
    }
    let sass_path = path.resolve(__dirname, fp.replace(/\.pug$/, ".sass"));
    print_status(`Compile sass: ${sass_path}`);
    let css;
    try {
      css = sass.renderSync({
        file: sass_path,
        outputStyle: 'expanded',
        includePaths: [path.resolve(__dirname, fp, "..")],
      }).css;
    } catch (e) {
      throw new Error(`Error compiling ${sass_path}: ${e.message}`);
    }
    return function (obj) {
      Object.assign(obj, {css});
      return fn(obj);
    };
  }

  const article_template = get_template("template/article.pug");
  const tagindex_template = get_template("template/tagindex.pug");
  const index_template = get_template("template/index.pug");
  const cc_ext_template = get_template("template/request_cc_extension.pug");

  let articles = [];
  let orig_renderer = new marked.Renderer({
    headerIds: true
  });

  function tryMkdirp(path) {
    fs.mkdirSync(path, {recursive: true});
    print_verbose(`mkdir -p ${path}`);
  }

  class ScannedArticle {
    static async scan_dir(cdir_path, codename) {
      let article = new ScannedArticle();
      article.cidr_path = cdir_path;
      print_verbose(`Entering directory ${cdir_path}...`);
      let file_list = fs.readdirSync(cdir_path);
      let mds = file_list.filter(s => /\.md$/.test(s));
      if (mds.length == 0) {
        throw new Error(`${cdir_path} does not contain any markdown file.`);
      }
      article.languages = [];
      article.assets = new Map();
      article.codename = codename;
      let dist_dict_path = path.resolve(output_dir, codename);
      article.output_path = dist_dict_path;
      tryMkdirp(dist_dict_path);
      function transform_local_asset_href(href) {
        if (/^[a-zA-Z]+:\/\//.test(href)) {
          return href;
        }
        let local_path = path.resolve(cdir_path, href);
        let stat;
        try {
          stat = fs.statSync(local_path);
        } catch (e) {
          if (e.message.indexOf("ENOENT") < 0) {
            throw new Error(`Error stating ${local_path}: ${e.message}`);
          }
          print_warn(`Linking to non-existing local asset: ${href}`);
          return href;
        }

        let canon_path = path.relative(cdir_path, local_path);
        if (article.assets.has(canon_path)) {
          return canon_path;
        }
        let asset_obj = {
          canon_path,
          output_path: path.resolve(dist_dict_path, canon_path),
          source: local_path,
          should_tgz: false
        };
        if (stat.isDirectory()) {
          asset_obj.should_tgz = true;
        }
        article.assets.set(canon_path, asset_obj);
        print_verbose(`Including local resource: ${canon_path} -> ${local_path}${asset_obj.should_tgz ? " (.tgz)" : ""}`);
        progress_total_work++;
        if (asset_obj.should_tgz) {
          asset_obj.output_path += ".tgz";
          return `${canon_path}.tgz`;
        }
        return canon_path;
      }
      let first_language_done = false;
      for (let md of mds) {
        if (first_language_done) {
          progress_total_work += 2;
        }
        first_language_done = true;
        let l = md.substr(0, md.length - 3);
        print_status(`Scanning ${codename}: ${l}`);
        let mdpath = path.resolve(cdir_path, md);
        let markdown = fs.readFileSync(mdpath, {encoding: "utf8"});
        let lines = markdown.split('\n');
        let front_matter = null;
        if (lines.length > 0 && lines[0] == '---') {
          let front_matter_end_line = 1;
          while (lines[front_matter_end_line] != '---') {
            front_matter_end_line++;
            if (lines.length <= front_matter_end_line) {
              throw new Error(`${mdpath}: unclosed front matter`);
            }
          }
          markdown = lines.slice(front_matter_end_line + 1).join('\n');
          front_matter = lines.slice(1, front_matter_end_line).join('\n');
        }
        if (front_matter === null) {
          throw new Error(`${mdpath}: expected front matter`);
        }
        try {
          front_matter = jsyaml.load(front_matter, {onWarning: e => print_warn(`yaml warning on ${mdpath}: ${e.message}`)});
        } catch (e) {
          throw new Error(`${mdpath}: invalid yaml front matter: ${e.message}`);
        }
        if (!front_matter.hasOwnProperty("title")) {
          throw new Error(`${mdpath}: front matter must include a title`);
        }
        if (!front_matter.hasOwnProperty("time")) {
          throw new Error(`${mdpath}: front matter must include a time`);
        }
        let time = new Date(front_matter.time);
        if (Number.isNaN(time.getTime())) {
          throw new Error(`${mdpath}: front matter: time is invalid`);
        }
        let tags = [];
        if (front_matter.hasOwnProperty("tags")) {
          tags = front_matter.tags;
          if (!Array.isArray(tags) || typeof tags[0] != "string") {
            throw new Error(`${mdpath}: front matter: invalid tags array`);
          }
        }
        let lang_obj = {id: l, cover_image: null, title: front_matter.title, time, tags, markdown};
        print_verbose(`Processing ${l}`);
        let md_renderer = new marked.Renderer({
          headerIds: true
        });
        md_renderer.link = function(href, title, text) {
          return orig_renderer.link(transform_local_asset_href(href), title, text);
        }

        async function process_html(html) {
          let mathjax_style_included = false;

          let $ = cheerio.load(html);

          $("img").each((_, e) => {
            let node = $(e);
            let h = transform_local_asset_href(node.attr("src"));
            if (node.attr("alt") === "cover") {
              print_verbose(`Cover image is ${h}`);
              lang_obj.cover_image = h;
              node.remove();
              return;
            }
            node.attr("src", h);
          });

          $("body > p").each((i, e) => {
            if (e.childNodes.length === 1 && e.childNodes[0].tagName === "img") {
              $(e).addClass("single-img-p");
            }
          });

          let texNodes = [];
          $("tex").each((i, e) => {
            texNodes.push($(e));
          });

          for (let e of texNodes) {
            let texCode = e.text();
            try {
              let mjResult = await mathjax.typeset({
                format: "inline-TeX",
                html: true,
                css: true,
                speakText: true,
                math: texCode,
                linebreaks: false,
                ex: 20
              });
              if (mjResult.errors) {
                throw new Error(mjResult.errors.join('\n'));
              }
              let ee = $('<span class="tex"></span>');
              ee.html(mjResult.html);
              e.after(ee);
              e.remove();
              if (!mathjax_style_included) {
                let st = $('<style></style>');
                st.text(mjResult.css);
                ee.before(st);
                mathjax_style_included = true;
              }
            } catch (e) {
              throw new Error(`TeX rendering error: ${e}`);
            }
          }

          let footnotes = [];
          let next_footnote_id = 1;
          function iter_proc(_, e) {
            let node = $(e);
            if (!node[0].parentNode) {
              return;
            }
            let nb = next_footnote_id++;
            node.children("footnote").each(iter_proc);
            let footnote_html = node.html();
            let sup = $("<sup />");
            let sup_a = $("<a />");
            sup_a.attr("href", `#ref-${nb}`);
            sup_a.text(`[${nb}]`);
            sup.attr("id", `revref-${nb}`);
            sup.append(sup_a);
            node.after(sup);
            node.remove();
            let fnele = $("<div />");
            let sp = $("<span />");
            let a = $("<a />");
            a.text(nb.toString());
            a.attr("href", `#revref-${nb}`);
            sp.attr("id", `ref-${nb}`);
            sp.addClass("footnote-revref");
            sp.append(a);
            fnele.append(sp, ": ", footnote_html);
            footnotes.push({nb, fnele});
          }
          $("footnote").each(iter_proc);
          footnotes.sort((a, b) => Math.sign(a.nb - b.nb));
          if (footnotes.length > 0) {
            let footnote_sec = $("<ul />");
            for (let {fnele} of footnotes) {
              let li = $("<li />");
              li.append(fnele);
              footnote_sec.append(li);
            }
            $("body").append(`<h2>Footnote${footnotes.length > 1 ? "s" : ""}</h2>`, footnote_sec);
          }

          $("span").each((_, e) => {
            let node = $(e);
            if (node.attr("class").startsWith("make-")) {
              let tagname = node.attr("class").substr(5);
              e.tagName = tagname;
            }
          });

          return $("body").html();
        }

        let html;
        try {
          html = await new Promise((resolve, reject) => {
            marked(markdown, {headerIds: true, renderer: md_renderer, highlight: (code, lang, cb) => {
              if (lang === "") {
                cb(null, code);
              } else {
                cb(null, hljs.highlight(lang, code).value);
              }
            }}, (err, output) => {
              if (err) {
                reject(new Error(`Error highlighting: ${err.message}`));
              } else {
                resolve(output);
              }
            });
          });
          html = await process_html(html);
        } catch (e) {
          throw new Error(`Error rendering ${mdpath}: ${e.message}`);
        }
        lang_obj.html = html;
        article.languages.push(lang_obj);
      }

      for (let a of article.assets.values()) {
        tryMkdirp(path.resolve(a.output_path, ".."));
        if (!a.should_tgz) {
          print_status(`cp ${a.source} ${a.output_path}`);
          fs.copyFileSync(a.source, a.output_path);
        } else {
          let pp = path.parse(a.source);
          let parent = pp.dir;
          let name = pp.base;
          let cmdline = `tar -c ${JSON.stringify(name)} | gzip > ${JSON.stringify(a.output_path)}`;
          print_status(cmdline);
          try {
            child_process.execSync(cmdline, {cwd: parent});
          } catch (e) {
            throw new Error(e.message);
          }
        }
      }

      await Tag.process_article(article);
      return article;
    }
  }

  let tags = new Map();
  class Tag {
    static async process_article(article) {
      let article_tags = new Set(article.languages.map(l => l.tags).flat());
      for (let tag of article_tags.values()) {
        let t;
        if (typeof (t = tags.get(tag)) != "undefined") {
          await t.addArticle(article);
        } else {
          t = new Tag(tag);
          await t.addArticle(article);
          tags.set(tag, t);
          progress_total_work += 1;
        }
      }
    }

    constructor(name) {
      this.name = name;
      this.articles = [];
    }

    async addArticle(article) {
      this.articles.push(article);
    }
  }

  for (let ent of dir_entires) {
    let cdir_path = path.resolve(__dirname, "content", ent);
    articles.push(await ScannedArticle.scan_dir(cdir_path, ent));
  }

  for (let article of articles) {
    tryMkdirp(article.output_path);
    for (let l of article.languages) {
      let lang_html_path = path.resolve(article.output_path, `${l.id}.html`);
      print_status(`emit ${lang_html_path}`);
      let emit_content = article_template({
        lang_obj: l,
        article,
        now: Date.now(),
      })
      try {
        fs.writeFileSync(lang_html_path, emit_content);
      } catch (e) {
        throw new Error(`Error writing to ${lang_html_path}: ${e.message}`);
      }
    }
  }

  let tagindex_dir = path.resolve(output_dir, "tagindex");
  tryMkdirp(tagindex_dir);
  for (let t of tags.values()) {
    let outhtmlfile = path.resolve(tagindex_dir, `${t.name}.html`);
    print_status("emit " + outhtmlfile);
    let html = tagindex_template({tag: t});
    try {
      fs.writeFileSync(outhtmlfile, html)
    } catch (e) {
      throw new Error(`Can't write ${outhtmlfile}: ${e}`);
    }
  }

  let index_file_path = path.resolve(output_dir, "index.html");
  print_status("emit " + index_file_path);
  fs.writeFileSync(index_file_path, index_template({articles}));

  let cc_ext_file_path = path.resolve(output_dir, "request_cc_extension.html");
  print_status("emit " + cc_ext_file_path);
  fs.writeFileSync(cc_ext_file_path, cc_ext_template({}));

  let titlesvg_outpath = path.resolve(output_dir, "title.svg");
  print_status("svgo " + titlesvg_outpath);
  try {
    child_process.execSync(`svgo -i ${path.resolve(__dirname, "design_files/title.svg")} -o ${titlesvg_outpath}`);
  } catch (e) {
    throw new Error(`Error running svgo: ${e.message}`);
  }
}

const start_time = Date.now();

main().then(() => {
  console.log(` ==>  Built everything (${Math.round((Date.now() - start_time) / 1000)}s).`.green.bold);
}, e => {
  process.stderr.write(`Fatal: ${e.message}\n`.bold.red);
  process.exit(1);
});
