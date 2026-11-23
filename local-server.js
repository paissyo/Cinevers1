import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = 3000;

try {
  const envPath = path.join(__dirname, ".env");
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, "utf-8");
    envContent.split("\n").forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#")) {
        const [key, ...vals] = trimmed.split("=");
        if (key && vals.length > 0) {
          process.env[key.trim()] = vals.join("=").trim();
        }
      }
    });
    console.log("🔑 Berhasil memuat konfigurasi dari .env");
  }
} catch (e) {
  console.warn("⚠️ Gagal membaca .env:", e.message);
}

import healthHandler from "./api/health.js";
import chatHandler from "./api/chat.js";
import moviesHandler from "./api/movies.js";

const MIME_TYPES = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

const server = http.createServer(async (req, res) => {
  const urlObj = new URL(req.url, `http://${req.headers.host}`);
  const pathname = urlObj.pathname;

  if (pathname === "/favicon.ico") {
    res.writeHead(204);
    return res.end();
  }

  const resHelper = {
    statusCode: 200,
    setHeader: (k, v) => res.setHeader(k, v),
    status: function (code) {
      this.statusCode = code;
      return this;
    },
    json: function (data) {
      res.writeHead(this.statusCode, { "Content-Type": "application/json" });
      res.end(JSON.stringify(data));
    },
    end: () => res.end()
  };

  if (pathname.startsWith("/api/")) {
    let bodyData = {};
    if (req.method === "POST") {
      try {
        const buffers = [];
        for await (const chunk of req) {
          buffers.push(chunk);
        }
        const rawBody = Buffer.concat(buffers).toString();
        bodyData = rawBody ? JSON.parse(rawBody) : {};
      } catch (err) {
        bodyData = {};
      }
    }

    const query = Object.fromEntries(urlObj.searchParams.entries());
    const reqHelper = {
      method: req.method,
      query: query,
      body: bodyData,
      headers: req.headers
    };

    try {
      if (pathname === "/api/health") return await healthHandler(reqHelper, resHelper);
      if (pathname === "/api/chat") return await chatHandler(reqHelper, resHelper);
      if (pathname === "/api/movies") return await moviesHandler(reqHelper, resHelper);
    } catch (apiErr) {
      console.error(`[Server API Error ${pathname}]:`, apiErr);
      res.writeHead(500, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: apiErr.message }));
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "Endpoint tidak ditemukan" }));
  }

  let filePath = path.join(__dirname, pathname === "/" ? "index.html" : pathname);
  const ext = path.extname(filePath);

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/html" });
      res.end("<h1>404 Not Found - Cinevers</h1>");
    } else {
      res.writeHead(200, { "Content-Type": MIME_TYPES[ext] || "text/plain" });
      res.end(content, "utf-8");
    }
  });
});

server.listen(PORT, () => {
  console.log(`\n==============================================`);
  console.log(`🎬 Cinevers Server aktif & siap digunakan!`);
  console.log(`👉 Akses di browser: http://localhost:${PORT}`);
  console.log(`==============================================\n`);

});
