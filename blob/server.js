import http from "node:http";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { URL } from "node:url";

const PORT = Number(process.env.PORT || 3000);
const BLOB_DIR = process.env.BLOB_DIR || "./blobs";
const HLS_DIR = process.env.HLS_DIR || "./hls";

mkdirSync(BLOB_DIR, { recursive: true });
mkdirSync(HLS_DIR, { recursive: true });

function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

function safeStreamId(raw) {
  const s = String(raw || "").trim();
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(s)) return null;
  return s;
}

function hlsStreamDir(streamId) {
  return join(HLS_DIR, streamId);
}

function parseSeq(name) {
  const m = name.match(/^seg-(\d+)\.mp4$/);
  return m ? Number(m[1]) : null;
}

function writePlaylist(streamId) {
  const dir = hlsStreamDir(streamId);
  if (!existsSync(dir)) return;
  const files = readdirSync(dir)
    .map((n) => ({ n, seq: parseSeq(n) }))
    .filter((x) => Number.isInteger(x.seq))
    .sort((a, b) => a.seq - b.seq);

  const segments = files.map(({ n, seq }) => {
    const durPath = join(dir, `seg-${seq}.dur`);
    const dur = existsSync(durPath) ? Number(readFileSync(durPath, "utf8")) : 1.0;
    return { n, seq, dur: Number.isFinite(dur) ? dur : 1.0 };
  });

  const windowSize = 12;
  const win = segments.slice(-windowSize);
  const mediaSeq = win.length ? win[0].seq : 0;
  const targetDur = Math.max(1, Math.ceil(Math.max(...win.map((s) => s.dur), 1)));

  const lines = [
    "#EXTM3U",
    "#EXT-X-VERSION:7",
    `#EXT-X-TARGETDURATION:${targetDur}`,
    `#EXT-X-MEDIA-SEQUENCE:${mediaSeq}`,
  ];

  for (const s of win) {
    lines.push(`#EXTINF:${s.dur.toFixed(3)},`);
    lines.push(`/hls/${streamId}/${s.n}`);
  }

  writeFileSync(join(dir, "index.m3u8"), lines.join("\n") + "\n");
}

const server = http.createServer(async (req, res) => {
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
  res.setHeader("access-control-allow-headers", "content-type");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);

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

  const blobMatch = url.pathname.match(/^\/blob\/([0-9a-f]{64})$/);
  if (req.method === "GET" && blobMatch) {
    const hash = blobMatch[1];
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

  const resetMatch = url.pathname.match(/^\/hls\/([a-zA-Z0-9_-]{1,64})\/reset$/);
  if (req.method === "POST" && resetMatch) {
    const streamId = safeStreamId(resetMatch[1]);
    if (!streamId) {
      res.statusCode = 400;
      res.end("bad stream id");
      return;
    }
    const dir = hlsStreamDir(streamId);
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    res.statusCode = 200;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ ok: true, streamId }));
    return;
  }

  const segMatch = url.pathname.match(/^\/hls\/([a-zA-Z0-9_-]{1,64})\/segment$/);
  if (req.method === "POST" && segMatch) {
    const streamId = safeStreamId(segMatch[1]);
    if (!streamId) {
      res.statusCode = 400;
      res.end("bad stream id");
      return;
    }

    const seq = Number(url.searchParams.get("seq"));
    const dur = Number(url.searchParams.get("dur") || "1");
    if (!Number.isInteger(seq) || seq < 0) {
      res.statusCode = 400;
      res.end("bad seq");
      return;
    }

    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = Buffer.concat(chunks);
    if (!body.length) {
      res.statusCode = 400;
      res.end("empty segment");
      return;
    }

    const dir = hlsStreamDir(streamId);
    mkdirSync(dir, { recursive: true });

    const segName = `seg-${seq}.mp4`;
    writeFileSync(join(dir, segName), body);
    writeFileSync(join(dir, `seg-${seq}.dur`), String(Number.isFinite(dur) ? dur : 1.0));
    writePlaylist(streamId);

    res.statusCode = 200;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ ok: true, streamId, seq, bytes: body.length, segment: segName }));
    return;
  }

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
  console.log(`blob server on :${PORT}, blobs=${BLOB_DIR}, hls=${HLS_DIR}`);
});
