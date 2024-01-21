import "dotenv/config";

import express from "express";
import { init as initDB, withDBClient } from "./db";

import oai from "./openai_proxy";

initDB();

let app = express();
app.use(express.json({ limit: "1mb" }));
app.set("trust proxy", !!process.env.TRUST_PROXY);
app.use(function (req, res, next) {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET, POST");
  next();
})

const PORT = parseInt(process.env.PORT ?? "3000");
const HOST = process.env.HOST ?? "127.0.0.1";

app.get("/", (req, res) => {
  res.send("Hi :)");
});

app.use("/openai", oai);

app.use(function (req, res) {
  res.status(404).send("Not Found");
});

app.use(function (err, req, res, next) {
  console.error(err.stack);
  res.status(500).send("Internal Server Error\n" + err.stack);
});

app.listen(PORT, HOST, () => {
  console.log(`Server running at http://${HOST}:${PORT}/`);
})
