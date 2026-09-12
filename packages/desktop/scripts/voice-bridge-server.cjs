const http = require("http");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const PORT = 19800;
const HTML_PATH = path.join(__dirname, "..", "resources", "voice-bridge.html");

function isPortInUse(port) {
  try {
    const result = execSync(`netstat -ano | findstr :${port} | findstr LISTENING`, { encoding: "utf8", timeout: 3000 });
    return result.trim().length > 0;
  } catch { return false; }
}

function killPort(port) {
  try {
    const result = execSync(`netstat -ano | findstr :${port} | findstr LISTENING`, { encoding: "utf8", timeout: 3000 });
    const lines = result.trim().split("\n").filter(l => l.trim());
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      const pid = parts[parts.length - 1];
      if (pid && pid !== "0") {
        try { execSync(`taskkill /F /PID ${pid}`, { encoding: "utf8", timeout: 3000 }); } catch {}
      }
    }
  } catch {}
}

function setCORS(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

const messageQueue = [];
const waitingPollers = [];

function queueMessage(msg) {
  if (waitingPollers.length > 0) {
    const res = waitingPollers.shift();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify([msg]));
  } else {
    messageQueue.push(msg);
  }
}

async function main() {
  if (isPortInUse(PORT)) {
    console.log(`[VoiceBridge] Port ${PORT} in use, killing existing process...`);
    killPort(PORT);
    await new Promise(r => setTimeout(r, 1000));
  }

  if (!fs.existsSync(HTML_PATH)) {
    console.log("[X] HTML not found:", HTML_PATH);
    process.exit(1);
  }

  const server = http.createServer((req, res) => {
    setCORS(res);

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.url === "/" || req.url === "/voice-bridge.html") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(fs.readFileSync(HTML_PATH, "utf8"));
      return;
    }

    if (req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, queued: messageQueue.length, waiting: waitingPollers.length }));
      return;
    }

    if (req.url === "/api/poll") {
      if (messageQueue.length > 0) {
        const msgs = messageQueue.splice(0);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(msgs));
      } else {
        waitingPollers.push(res);
        const timeout = setTimeout(() => {
          const idx = waitingPollers.indexOf(res);
          if (idx !== -1) {
            waitingPollers.splice(idx, 1);
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify([]));
          }
        }, 30000);
        req.on("close", () => {
          clearTimeout(timeout);
          const idx = waitingPollers.indexOf(res);
          if (idx !== -1) waitingPollers.splice(idx, 1);
        });
      }
      return;
    }

    if (req.url === "/api/message" && req.method === "POST") {
      let body = "";
      req.on("data", (c) => { body += c; });
      req.on("end", () => {
        try {
          const msg = JSON.parse(body);
          console.log(`[MSG] ${msg.type}: ${msg.text || msg.lang || ""}`);
          queueMessage(msg);
        } catch (e) {
          console.log("[MSG] Parse error:", e.message);
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      });
      return;
    }

    res.writeHead(404);
    res.end("Not found");
  });

  await new Promise((resolve) => server.listen(PORT, "127.0.0.1", () => {
    console.log(`[OK] Server on http://127.0.0.1:${PORT}`);
    resolve();
  }));

  console.log("[OK] Voice bridge server ready");
}

main().catch(console.error);
