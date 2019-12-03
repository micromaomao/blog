require("colors");
const fs = require("fs");
const path = require("path");
const marked = require('marked');
const jsyaml = require('js-yaml');
const child_process = require('child_process');

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
  let progress_total_work = dir_entires.length*2 + 1;
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
      let dist_dict_path = path.resolve(output_dir, codename);
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
          front_matter = lines.slice(1, front_matter_end_line - 1).join('\n');
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
        let lang_obj = {id: l, cover_image: null, title: front_matter.title};
        print_verbose(`Processing ${l}`);
        let md_renderer = new marked.Renderer({
          headerIds: true
        });
        md_renderer.link = function(href, title, text) {
          return orig_renderer.link(transform_local_asset_href(href), title, text);
        }
        md_renderer.image = function(href, title, text) {
          let h = transform_local_asset_href(href);
          if (text === "cover") {
            print_verbose(`Cover image is ${h}`);
            lang_obj.cover_image = h;
            return "";
          }
          return orig_renderer.image(h, title, text);
        }
        let html;
        try {
          html = marked(markdown, {headerIds: true, renderer: md_renderer});
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

      for (let l of article.languages) {
        let output_html_path = path.resolve(dist_dict_path, `${l.id}.html`);
        print_status(`emit ${output_html_path}`);
        fs.writeFileSync(output_html_path, l.html);
      }

      return article;
    }
  }

  for (let ent of dir_entires) {
    let cdir_path = path.resolve(__dirname, "content", ent);
    articles.push(await ScannedArticle.scan_dir(cdir_path, ent));
  }

  print_status("emit index.html"); // TODO
}

const start_time = Date.now();

main().then(() => {
  console.log(` ==>  Built everything (${Math.round((Date.now() - start_time) / 1000)}s).`.green.bold);
}, e => {
  process.stderr.write(`Fatal: ${e.message}\n`.bold.red)
});
