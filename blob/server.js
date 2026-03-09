import http from "node:http";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { URL } from "node:url";

const PORT = Number(process.env.PORT || 3000);
const BLOB_DIR = process.env.BLOB_DIR || "./blobs";

mkdirSync(BLOB_DIR, { recursive: true });

function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

const server = http.createServer(async (req, res) => {
  // CORS for browser-based demo (web runs on :5173, blob on :3000)
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
  res.setHeader("access-control-allow-headers", "content-type");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);

  // POST /upload  -> returns { hash, size }
  if (req.method === "POST" && url.pathname === "/upload") {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = Buffer.concat(chunks);

    const hash = sha256(body);
    const path = join(BLOB_DIR, hash);
    if (!existsSync(path)) writeFileSync(path, body);

    res.statusCode = 200;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ hash, size: body.length }));
    return;
  }

  // GET /blob/<hash> -> returns raw bytes
  const m = url.pathname.match(/^\/blob\/([0-9a-f]{64})$/);
  if (req.method === "GET" && m) {
    const hash = m[1];
    const path = join(BLOB_DIR, hash);
    if (!existsSync(path)) {
      res.statusCode = 404;
      res.end("not found");
      return;
    }
    const bytes = readFileSync(path);
    res.statusCode = 200;
    res.setHeader("content-type", "application/octet-stream");
    res.end(bytes);
    return;
  }

  // health
  if (req.method === "GET" && url.pathname === "/health") {
    res.statusCode = 200;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  res.statusCode = 404;
  res.end("not found");
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`blob server on :${PORT}, dir=${BLOB_DIR}`);
});
