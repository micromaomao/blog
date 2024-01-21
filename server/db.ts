import * as pg from "pg";
import { readFileSync } from "fs";
import * as path from "path";

function read_to_string(filename: string): string {
  const filepath = path.join(__dirname, filename);
  return readFileSync(filepath, { encoding: "utf8" });
}

const INIT_SQL = read_to_string("client_init.sql");

const IDLE_TIMEOUT_MS = 5000;
const CONNECT_TIMEOUT_MS = 10000;

let pg_pool = null;

export type Client = pg.Client;

export async function init() {
  const url = process.env.POSTGRESQL_URL;
  if (!url) {
    throw new Error("Missing POSTGRESQL_URL");
  }
  const hostname = new URL(url).hostname;
  pg_pool = new pg.Pool({
    connectionString: url,
    idleTimeoutMillis: IDLE_TIMEOUT_MS,
    connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
  });
  pg_pool.on("connect", async client => {
    client.on("notice", msg => {
      if (msg.message.includes("there is no transaction in progress")) {
        return;
      }
      console.warn("PostgreSQL notice:", msg.message);
    });
    if (process.env.NODE_ENV == "development") {
      let _query = client.query;
      client.query = (...args) => {
        let query_str;
        if (typeof args[0] == "string") {
          query_str = args[0];
        } else {
          query_str = args[0].text;
        }
        console.log("SQL", query_str);
        return _query.apply(client, args);
      };
    }
    await client.query(INIT_SQL);
  });
}

export async function withDBClient<R>(f: (client: Client) => Promise<R>): Promise<R> {
  if (!pg_pool) {
    throw new Error("Database not initialized");
  }
  const client = await pg_pool.connect();
  try {
    return await f(client);
  } finally {
    // Prevent accidental uncommitted transactions from persisting.
    await client.query("rollback");
    client.release();
  }
}
