import { Request as ExpressRequest, Router } from "express";
import { RateLimit } from "./rate_limit";
import { withDBClient } from "./db";
import { createHash } from "crypto";

const globalRateLimit = new RateLimit("openai_proxy_global_rate_limit", 100, 60 * 10);

const { OPENAI_ENDPOINT, OPENAI_API_KEY } = process.env;
if (typeof OPENAI_ENDPOINT !== "string" || typeof OPENAI_API_KEY !== "string") {
  throw new Error("Missing OPENAI_ENDPOINT or OPENAI_API_KEY");
}

let r = Router();

r.use(async function (req, res, next) {
  try {
    let rl_res = await withDBClient(db => globalRateLimit.bump(db, res));
    if (!rl_res.success) {
      res.status(429).send("This endpoint has reached its global rate limit. Please try again later.");
    } else {
      next();
    }
  } catch (e) {
    next(e);
  }
});

function get_user_id(req: ExpressRequest) {
  return createHash("sha256").update(req.ip ?? "undefined").digest("hex");
}

async function make_outgoing_request(url: URL | string, req_init: RequestInit): Promise<Response> {
  console.log(`OpenAI outgoing request ${req_init.method ?? 'GET'} ${url}`);
  if (typeof req_init.body !== "undefined") {
    console.log(`    body: ${JSON.stringify(req_init.body, undefined, 2)}`);
  }
  let res = await fetch(url, req_init);
  let body = await res.clone().json();
  if (!res.ok) {
    console.log(`OpenAI outgoing response ${res.status} ${res.statusText}`);
    console.log(body);
  }
  return res;
}

r.post("/v1/embeddings", async function (req, res, next) {
  try {
    if (typeof req.body !== "object" || typeof req.body.input !== "string" || typeof req.body.model !== "string") {
      res.status(400).send("Bad Request");
      return;
    }
    const allowed_models = ["text-embedding-ada-002"];
    if (!allowed_models.includes(req.body.model)) {
      res.status(400).send(`Model not allowed. Allowed values: ${allowed_models.join(", ")}`);
      return;
    }
    const max_length = 1000;
    if (req.body.input.length > max_length) {
      res.status(400).send(`Input too long. Max length: ${max_length}`);
      return;
    }
    let body = req.body;
    let { input, model } = body;
    try {
      let r = await make_outgoing_request(new URL("/v1/embeddings", OPENAI_ENDPOINT), {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          input: input,
          model: model,
          user: get_user_id(req),
        }),
      });
      let log_promise = null;
      let ip = req.ip ?? "undefined";
      if (!r.ok) {
        let ebody: any = await r.clone().json();
        let err_msg = ebody.error?.message ?? "Unknown error";
        log_promise = withDBClient(db => db.query({
          text: "insert into openai_embedding_req_log (ip, input, success, error_msg) values ($1, $2, false, $3)",
          values: [ip, input, err_msg],
        }));
      } else {
        log_promise = withDBClient(db => db.query({
          text: "insert into openai_embedding_req_log (ip, input, success) values ($1, $2, true)",
          values: [ip, input],
        }));
      }
      res.status(r.status).set("Content-Type", r.headers.get("Content-Type")).send(await r.text());
      await log_promise;
    } catch (e) {
      res.status(500).send({ error: { message: "Error while sending request to OpenAI" } });
      await withDBClient(db => db.query({
        text: "insert into openai_embedding_req_log (input, success, error_msg) values ($1, false, $2)",
        values: [input, e.toString()],
      }));
    }
  } catch (e) {
    next(e);
  }
});

export default r;
