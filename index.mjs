import { load as cheerio_load } from "cheerio";
import child_process from "child_process";
import "colors";
import fs from "fs";
import hljs from "highlight.js";
import jsyaml from "js-yaml";
import { marked } from "marked";
import { markedHighlight } from "marked-highlight";
import mathjax from "mathjax-node";
import path from "path";
import pug from "pug";
import * as sass from "sass";
import { parseArgs } from "util";
import webpack from "webpack";
import MonacoWebpackPlugin from "monaco-editor-webpack-plugin";
import { processDiff } from "./diffs.mjs";

marked.use(markedHighlight({
  highlight(code, lang) {
    if (lang === "") {
      return code;
    } else {
      return hljs.highlight(code, { language: lang }).value;
    }
  }
}));

process.chdir(import.meta.dirname);

let output_dir = path.resolve(import.meta.dirname, "dist");

async function main() {
  const { positionals: filters, values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      "skip-bundle": {
        type: "boolean",
        default: false,
      },
      "draft-mode": {
        type: "boolean",
        default: false,
      },
      "webpack-watch": {
        type: "boolean",
        default: false,
      },
    },
    allowPositionals: true,
    strict: true,
  });
  let skip_bundle = values["skip-bundle"];
  let draft_mode = values["draft-mode"];
  let webpack_watch = values["webpack-watch"];

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
  if (filters.length > 0) {
    console.log(` ==>  Only building ${filters.join(", ")}...`.gray);
    dir_entires = dir_entires.filter(x => filters.includes(x));
  }
  console.log(`       (${dir_entires.length} articles to build)`.gray);
  let progress_total_work = dir_entires.length * 4 + 13;
  let progress_current_work_done = 0;
  function print_status(status_text) {
    console.log(`[${Math.round(progress_current_work_done++ / progress_total_work * 100).toString().padStart(3, " ")}%] ${status_text}`.cyan);
  }
  function print_verbose(t) {
    console.log("       " + t.gray);
  }
  function print_warn(t) {
    console.log(" Warn: " + t.yellow);
  }

  function get_template(fp) {
    let file_path = path.resolve(import.meta.dirname, fp);
    print_status(`Compile template: ${file_path}`);
    let fn;
    try {
      fn = pug.compileFile(file_path, { pretty: true });
    } catch (e) {
      throw new Error(`Error compiling ${file_path}: ${e.message}`);
    }
    let sass_path = path.resolve(import.meta.dirname, fp.replace(/\.pug$/, ".scss"));
    print_status(`Compile sass: ${sass_path}`);
    let css;
    try {
      css = sass.compile(sass_path, {
        style: 'expanded',
        loadPaths: [path.resolve(import.meta.dirname, fp, "..")],
      }).css;
    } catch (e) {
      throw new Error(`Error compiling ${sass_path}: ${e.message}`);
    }
    return function (obj) {
      Object.assign(obj, { css, draft_mode });
      return fn(obj);
    };
  }

  const article_template = get_template("template/article.pug");
  const tagindex_template = get_template("template/tagindex.pug");
  const index_template = get_template("template/index.pug");
  const cc_ext_template = get_template("template/request_cc_extension.pug");
  const not_found_template = get_template("template/404.pug");
  const draft_redirect_template = get_template("template/draft_redirect.pug");

  let articles = [];
  let orig_renderer = new marked.Renderer();

  function tryMkdirp(path) {
    fs.mkdirSync(path, { recursive: true });
    print_verbose(`mkdir -p ${path}`);
  }

  let MAIN_SITE_BASE_URL = new URL("https://blog.maowtm.org/");
  let BASE_URL = MAIN_SITE_BASE_URL;
  if (draft_mode) {
    BASE_URL = new URL("https://draft.blog.maowtm.org/");
  }

  function emit_draft_redirect(codename, lang, title) {
    print_status(`emit ${codename}/${lang}.html (redirect to main site)`);
    let html = draft_redirect_template({ target_url: new URL(`${codename}/${lang}.html`, MAIN_SITE_BASE_URL), title });
    fs.writeFileSync(path.resolve(output_dir, codename, `${lang}.html`), html);
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
      let dist_dir_path = path.resolve(output_dir, codename);
      article.base_url = new URL(codename, BASE_URL).toString();
      article.output_path = dist_dir_path;
      tryMkdirp(dist_dir_path);
      function transform_local_asset_href(href) {
        if (/^[a-zA-Z]+:\/\//.test(href) || /^(\/|\.\.\/)/.test(href)) {
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
          output_path: path.resolve(dist_dir_path, canon_path),
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
        let l = md.substring(0, md.length - 3);
        print_status(`Scanning ${codename}: ${l}`);
        let mdpath = path.resolve(cdir_path, md);
        let markdown = fs.readFileSync(mdpath, { encoding: "utf8" });
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
          front_matter = jsyaml.load(front_matter.replace(/\t/g, "  "), { onWarning: e => print_warn(`yaml warning on ${mdpath}: ${e.message}`) });
        } catch (e) {
          throw new Error(`${mdpath}: invalid yaml front matter: ${e.message}`);
        }
        if (!!front_matter.draft != draft_mode) {
          if (draft_mode) {
            emit_draft_redirect(codename, l, front_matter.title);
          } else {
            print_verbose(`Skipping ${codename} (is draft)`);
          }
          continue;
        }
        first_language_done = true;
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
        let lang_obj = {
          id: l,
          cover_image: null,
          title: front_matter.title,
          time,
          tags,
          markdown,
          discuss: null,
          text: null,
          html: null,
          snippet: front_matter.snippet || null
        };
        if (front_matter.hasOwnProperty("discuss")) {
          lang_obj.discuss = front_matter.discuss;
        }
        print_verbose(`Processing ${l}`);
        let md_renderer = new marked.Renderer();
        md_renderer.link = function (href, title, text) {
          return orig_renderer.link(transform_local_asset_href(href), title, text);
        }

        let cover_image_file = null;

        async function process_html(html) {
          let mathjax_style_included = false;

          let $ = cheerio_load(html);

          $("img").each((_, e) => {
            let node = $(e);
            let src = node.attr("src");
            let h = transform_local_asset_href(src);
            if (node.attr("alt") === "cover") {
              print_verbose(`Cover image is ${h}`);
              lang_obj.cover_image = h;
              cover_image_file = src;
              if (front_matter.hasOwnProperty("cover_alt")) {
                lang_obj.cover_alt = front_matter.cover_alt;
              }
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

          $("a.make-diff").each((_, e) => {
            let node = $(e);
            let href = node.attr("href");
            if (!href || !fs.existsSync(path.resolve(cdir_path, href))) {
              throw new Error(`a.make-diff encountered with invalid href: ${href}`);
            }
            print_verbose(`Turning ${href} into diff block`);
            let diff_content = fs.readFileSync(path.resolve(cdir_path, href), { encoding: "utf8" });
            let elem = processDiff(diff_content, $);
            node.replaceWith(elem);
          });

          $(".make-toc").each((_, e) => {
            let node = $(e);
            let toc_container = $('<div class="toc-container"></div>');
            node.replaceWith(toc_container);

            toc_container.append('<div class="title">Table of Contents</div>');

            let toc = $("<ol></ol>");
            toc_container.append(toc);
            let ol_stack = [toc];
            let li_stack = [];
            let curr_level = 1;
            $("h2,h3,h4,h5,h6").each((_, heading_elem) => {
              let level = parseInt(heading_elem.tagName.substring(1));
              while (level <= curr_level) {
                if (curr_level <= 1) {
                  throw new Error("unreachable");
                }
                let last_ol = ol_stack.pop();
                if (!last_ol.get(0).childNodes.length) {
                  last_ol.remove();
                }
                li_stack.pop();
                curr_level--;
              }
              if (level != curr_level + 1) {
                throw new Error("make-toc: Invalid nesting of headings");
              }
              let li = $("<li></li>");
              ol_stack[ol_stack.length - 1].append(li);

              if (!$(heading_elem).attr("id")) {
                let text = $(heading_elem).text();
                let id = `h_${text.toLowerCase().replace(/[^a-zA-Z0-9]+/g, '-')}`;
                $(heading_elem).attr("id", id);
              }

              let a = $("<a></a>");
              a.text($(heading_elem).text());
              a.attr("href", `#${$(heading_elem).attr("id")}`);
              li.append(a);
              li.append($('<span style="width: 10px; display: inline-block;"></span>')); // Firefox layout bug causing text wrap
              let ol = $("<ol></ol>");
              li.append(ol);

              li_stack.push(li);
              ol_stack.push(ol);
              curr_level++;
            });
          });

          $("span").each((_, e) => {
            let node = $(e);
            if ((node.attr("class") || "").startsWith("make-")) {
              let tagname = node.attr("class").substring(5);
              e.tagName = tagname;
              node.removeClass("make-" + tagname);
            }
          });

          if (lang_obj.discuss) {
            let d = lang_obj.discuss;
            let keys = Object.keys(d);
            if (keys.length > 0) {
              let ele = $("<p>");
              if (keys.length === 1) {
                let k = keys[0];
                let a = $("<a>");
                a.text(`Discuss on ${k}`);
                a.attr("href", d[k]);
                ele.append(a);
              } else {
                ele.text("Discuss on: ");
                let first = true;
                for (let k of keys) {
                  if (!first) {
                    ele.append(", ");
                  }
                  let a = $("<a>");
                  a.text(k);
                  a.attr("href", d[k]);
                  ele.append(a);
                  first = false;
                }
              }
              $("body").append(ele);
            }
          }

          let footnotes = [];
          let next_footnote_id = 1;
          function iter_proc(_, e) {
            if (!e.parentNode) {
              return;
            }
            let node = $(e);
            let nb = next_footnote_id++;
            node.find("footnote").each(iter_proc);
            let footnote_html = node.html();
            let sup = $("<sup />");
            let sup_a = $("<a />");
            sup_a.attr("href", `#ref-${nb}`);
            sup_a.text(nb.toString());
            sup.attr("class", "footnoteref");
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
            footnotes.push({ nb, fnele });
          }
          $("footnote:not(footnote footnote)").each(iter_proc);
          footnotes.sort((a, b) => Math.sign(a.nb - b.nb));
          if (footnotes.length > 0) {
            let footnote_sec = $("<ul />");
            for (let { fnele } of footnotes) {
              let li = $("<li />");
              li.append(fnele);
              footnote_sec.append(li);
            }
            $("body").append(`<h2>Footnote${footnotes.length > 1 ? "s" : ""}</h2>`, footnote_sec);
          }

          lang_obj.text = $("body").text();
          lang_obj.html = $("body").html();

          function make_snippet(text) {
            let words = text.split(/\s+/).filter(x => x.length > 0);
            let snippet = "";
            let i = 0;
            while (snippet.length < 300 && i < words.length) {
              snippet += words[i] + " ";
              i++;
            }
            snippet = snippet.trim();
            if (i < words.length) {
              snippet += "...";
            }
            return snippet;
          }

          if (!lang_obj.snippet) {
            lang_obj.snippet = make_snippet(lang_obj.text);
          }
        }

        try {
          let html = await marked.parse(markdown, {
            renderer: md_renderer
          });
          await process_html(html);
        } catch (e) {
          console.error(e);
          throw new Error(`Error rendering ${mdpath}: ${e.message}`);
        }

        if (cover_image_file && cover_image_file.endsWith(".svg")) {
          let png_output = path.resolve(dist_dir_path, cover_image_file + ".png");
          print_status(`rsvg-convert ${png_output}`);
          child_process.execSync(`rsvg-convert -d 300 -p 300 -o ${JSON.stringify(png_output)} ${JSON.stringify(path.resolve(cdir_path, cover_image_file))}`);
          lang_obj.cover_image_og = cover_image_file + ".png";
        } else {
          if (lang_obj.cover_image) {
            lang_obj.cover_image_og = lang_obj.cover_image;
          }
          progress_current_work_done += 1;
        }

        article.languages.push(lang_obj);
      }

      if (!first_language_done) {
        print_verbose(`Skipping ${codename} (all language skipped)`);
        return null;
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
          child_process.execSync(cmdline, { cwd: parent });
        }
      }
      let script_path = path.resolve(cdir_path, "script.ts");
      let bundles = [];
      if (fs.existsSync(script_path)) {
        if (!skip_bundle) {
          print_status(`webpack ${script_path} > ...`);
          let production = process.env.NODE_ENV === "production";
          let _bundle_path = path.resolve(dist_dir_path, "script.js");
          const babel_loader = {
            loader: "babel-loader",
            options: {
              presets: ["@babel/preset-react"]
            }
          };
          await new Promise((resolve, reject) => {
            let webpack_config = {
              watch: webpack_watch,
              entry: script_path,
              devtool: "source-map",
              module: {
                rules: [
                  {
                    test: /\.module\.css$/,
                    use: [
                      "style-loader",
                      {
                        loader: "css-loader",
                        options: {
                          modules: {
                            localIdentName: '[local]--[hash:base64:5]',
                          }
                        }
                      }
                    ]
                  },
                  {
                    test: /(?<!\.module)\.css$/,
                    use: ["style-loader", "css-loader"]
                  },
                  {
                    test: /\.ts$/,
                    use: "ts-loader",
                    exclude: "/node_modules/"
                  },
                  {
                    test: /\.jsx$/,
                    use: [babel_loader]
                  },
                  {
                    test: /\.tsx$/,
                    use: [babel_loader, "ts-loader"]
                  },
                ]
              },
              resolve: {
                extensions: [".ts", ".js", ".jsx", ".tsx", ".css"],
                modules: [path.resolve(import.meta.dirname, "node_modules"), path.resolve(import.meta.dirname, ".")]
              },
              output: {
                filename: webpack_watch ? "[name].js" : "[name].[chunkhash].js",
                path: dist_dir_path,
              },
              mode: production ? "production" : "development",
              plugins: [
                new webpack.DefinePlugin({
                  "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV),
                  "process.env.BACKEND_ENDPOINT": JSON.stringify(process.env.BACKEND_ENDPOINT),
                }),
                new MonacoWebpackPlugin({
                  languages: ["javascript", "typescript"],
                  features: ["rename", "indentation", "format", "gotoSymbol", "gotoLine", "tokenization", "comment", "stickyScroll", "semanticTokens", "hover"]
                }),
              ]
            };
            webpack(webpack_config, (err, stats) => {
              if (err || stats.hasErrors()) {
                console.error(stats.toString());
                reject(new Error(err || `Webpack failed to build`));
              } else {
                console.log(stats.toString());
                for (let asset of stats.toJson().assets) {
                  if (asset.chunkNames && asset.chunkNames.includes("main")) {
                    let f = asset.name;
                    bundles.push({ type: "js", url: f })
                    print_verbose(`Including ${f}`);
                  }
                }
                resolve();
              }
            })
          });
        } else {
          print_status(`webpack skipped.`.gray);
        }
      } else {
        progress_current_work_done++;
      }
      article.bundles = bundles;

      await Tag.process_article(article);
      return article;
    }

    get default_language() {
      return this.languages.find(l => l.id == "en") || this.languages[0];
    }
  }

  let tags = new Map();
  class Tag {
    static async process_article(article) {
      let article_tags = new Set(article.languages.map(l => l.tags).flat());
      for (let tag of article_tags.values()) {
        let tag_lower = tag.toLowerCase();
        let t;
        if (typeof (t = tags.get(tag_lower)) != "undefined") {
          await t.addArticle(article);
        } else {
          t = new Tag(tag);
          await t.addArticle(article);
          tags.set(tag_lower, t);
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
    let cdir_path = path.resolve(import.meta.dirname, "content", ent);
    let art = await ScannedArticle.scan_dir(cdir_path, ent);
    if (art !== null) {
      articles.push(art);
    }
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

  function sort_articles(articles) {
    return articles.slice().sort((a, b) => Math.sign(b.default_language.time - a.default_language.time));
  }

  let tagindex_dir = path.resolve(output_dir, "tagindex");
  tryMkdirp(tagindex_dir);
  for (let t of tags.values()) {
    let outhtmlfile = path.resolve(tagindex_dir, `${t.name.toLowerCase()}.html`);
    print_status("emit " + outhtmlfile);
    let html = tagindex_template({ tag: t, ordered_articles: sort_articles(t.articles) });
    try {
      fs.writeFileSync(outhtmlfile, html)
    } catch (e) {
      throw new Error(`Can't write ${outhtmlfile}: ${e}`);
    }
  }

  let index_file_path = path.resolve(output_dir, "index.html");
  print_status("emit " + index_file_path);
  fs.writeFileSync(index_file_path, index_template({ ordered_articles: sort_articles(articles) }));

  let cc_ext_file_path = path.resolve(output_dir, "request_cc_extension.html");
  print_status("emit " + cc_ext_file_path);
  fs.writeFileSync(cc_ext_file_path, cc_ext_template({}));

  let titlesvg_outpath = path.resolve(output_dir, "title.svg");
  print_status("svgo " + titlesvg_outpath);
  try {
    child_process.execSync(`svgo -i ${path.resolve(import.meta.dirname, "design_files/title.svg")} -o ${titlesvg_outpath}`);
  } catch (e) {
    throw new Error(`Error running svgo: ${e.message}`);
  }

  let feed_json = [];
  print_status("emit feed.json");

  for (let article of sort_articles(articles)) {
    let default_lang = article.default_language;
    feed_json.push({
      title: default_lang.title,
      url: article.base_url + `/${default_lang.id}.html`,
      date: default_lang.time.toISOString(),
      tags: default_lang.tags,
      cover_image: default_lang.cover_image ? article.base_url + "/" + default_lang.cover_image : null,
      snippet: default_lang.snippet,
    });
  }
  fs.writeFileSync(path.resolve(output_dir, "feed.json"), JSON.stringify(feed_json, null, 2));

  print_status("emit 404.html");
  fs.writeFileSync(path.resolve(output_dir, "404.html"), not_found_template({ draft_mode }));

  print_status("cp layout.js");
  fs.copyFileSync(path.resolve(import.meta.dirname, "js/layout.js"), path.resolve(output_dir, "layout.js"));
}

const start_time = Date.now();

main().then(() => {
  console.log(` ==>  Built everything (${Math.round((Date.now() - start_time) / 1000)}s).`.green.bold);
}, e => {
  process.stderr.write(`Fatal: ${e.message}\n`.bold.red);
  console.error(e);
  process.exit(1);
});
