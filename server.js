import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(root, "public");

// Minimal .env loader (no dependencies, Node >= 20)
try {
  for (const line of fs.readFileSync(path.join(root, ".env"), "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !line.trim().startsWith("#") && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {}

const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".csv": "text/csv" };
const send = (res, status, body, type = "application/json; charset=utf-8", extra = {}) => {
  res.writeHead(status, { "content-type": type, "cache-control": "no-store", "x-content-type-options": "nosniff", ...extra });
  res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
};

async function readBody(req, limit = 1_000_000) {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > limit) throw Object.assign(new Error("Request too large"), { status: 413 });
  }
  try { return body ? JSON.parse(body) : {}; } catch { throw Object.assign(new Error("Invalid JSON"), { status: 400 }); }
}

// General-purpose assistant: answers any topic, uses dashboard data only when relevant.
async function handleAI(req, res) {
  const { AI_API_URL: url, AI_API_KEY: key, AI_MODEL: model } = process.env;
  if (!url || !key) return send(res, 503, { ok: false, error: "AI provider is not configured. Set AI_API_URL, AI_API_KEY and AI_MODEL in .env." });
  const input = await readBody(req);
  const system = String(input.system || "You are a helpful assistant. Answer any question clearly and accurately. Never promise trading profits.");
  const messages = (Array.isArray(input.messages) && input.messages.length ? input.messages : [{ role: "user", content: String(input.prompt || "") }])
    .slice(-20).map(m => ({ role: m.role === "assistant" ? "assistant" : "user", content: String(m.content).slice(0, 8000) }));
  const anthropic = /anthropic\.com/.test(url);
  const upstream = await fetch(url, {
    method: "POST",
    headers: anthropic
      ? { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" }
      : { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify(anthropic ? { model, max_tokens: 1024, system, messages } : { model, messages: [{ role: "system", content: system }, ...messages] }),
    signal: AbortSignal.timeout(60_000)
  });
  const data = await upstream.json().catch(() => ({}));
  if (!upstream.ok) return send(res, upstream.status, { ok: false, error: data.error?.message || data.error || "Upstream AI error" });
  const text = data.choices?.[0]?.message?.content || data.content?.map?.(c => c.text || "").join("") || "";
  return send(res, 200, { ok: true, text });
}

const server = http.createServer(async (req, res) => {
  try {
    const { pathname } = new URL(req.url, "http://localhost");
    if (pathname === "/api/health") return send(res, 200, { ok: true, app: "goldQuant", marketData: process.env.MARKET_DATA_PROVIDER || "simulator", aiConfigured: Boolean(process.env.AI_API_URL && process.env.AI_API_KEY) });
    if (pathname === "/api/ai" && req.method === "POST") return await handleAI(req, res);

    const file = path.normalize(path.join(publicDir, pathname === "/" ? "index.html" : decodeURIComponent(pathname)));
    if (file !== publicDir && !file.startsWith(publicDir + path.sep)) return send(res, 403, { error: "Forbidden" });
    fs.readFile(file, (err, data) => err
      ? send(res, 404, { error: "Not found" })
      : send(res, 200, data, TYPES[path.extname(file)] || "application/octet-stream"));
  } catch (e) {
    send(res, e.status || 500, { ok: false, error: e.message });
  }
});

server.listen(process.env.PORT || 3000, () => console.log(`goldQuant running on http://localhost:${process.env.PORT || 3000}`));
