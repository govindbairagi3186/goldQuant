import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");

function json(res, status, body) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  let body = "";
  for await (const chunk of req) body += chunk;
  return body ? JSON.parse(body) : {};
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.url === "/api/health") {
      return json(res, 200, {
        ok: true,
        app: "goldQuant",
        marketData: process.env.MARKET_DATA_PROVIDER || "simulator",
        aiConfigured: Boolean(process.env.AI_API_URL && process.env.AI_API_KEY)
      });
    }

    if (req.url === "/api/ai" && req.method === "POST") {
      if (!process.env.AI_API_URL || !process.env.AI_API_KEY) {
        return json(res, 503, {
          ok: false,
          error: "AI provider is not configured. Add AI_API_URL, AI_API_KEY and AI_MODEL to the server environment."
        });
      }

      const input = await readBody(req);
      const upstream = await fetch(process.env.AI_API_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "authorization": `Bearer ${process.env.AI_API_KEY}`
        },
        body: JSON.stringify({
          model: process.env.AI_MODEL,
          messages: [
            {
              role: "system",
              content: "You are GoldQuant's market-data analyst. Explain supplied market data clearly and cautiously. Do not promise profits or give personalized financial instructions."
            },
            {
              role: "user",
              content: String(input.prompt || "")
            }
          ]
        })
      });

      const data = await upstream.json();
      return json(res, upstream.status, data);
    }

    const requested = req.url === "/" ? "/index.html" : req.url;
    const file = path.normalize(path.join(publicDir, requested));
    if (!file.startsWith(publicDir)) return json(res, 403, { error: "Forbidden" });

    fs.readFile(file, (err, data) => {
      if (err) return json(res, 404, { error: "Not found" });
      const ext = path.extname(file);
      const type = ext === ".html" ? "text/html; charset=utf-8"
        : ext === ".css" ? "text/css; charset=utf-8"
        : ext === ".js" ? "text/javascript; charset=utf-8"
        : "application/octet-stream";
      res.writeHead(200, { "content-type": type });
      res.end(data);
    });
  } catch (error) {
    json(res, 500, { ok: false, error: error.message });
  }
});

server.listen(process.env.PORT || 3000, () => {
  console.log(`goldQuant running on http://localhost:${process.env.PORT || 3000}`);
});
