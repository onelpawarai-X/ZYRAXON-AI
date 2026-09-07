const http = require("http");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { WebSocketServer } = require("ws");

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

async function main() {
  // Kill any existing process on our port
  if (isPortInUse(PORT)) {
    console.log(`[VoiceBridge] Port ${PORT} in use, killing existing process...`);
    killPort(PORT);
    await new Promise(r => setTimeout(r, 1000));
  }

  if (!fs.existsSync(HTML_PATH)) {
    console.log("[X] HTML not found:", HTML_PATH);
    process.exit(1);
  }

  const wss = new WebSocketServer({ noServer: true });
  const server = http.createServer((req, res) => {
    if (req.url === "/" || req.url === "/voice-bridge.html") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(fs.readFileSync(HTML_PATH, "utf8"));
    } else if (req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, clients: wss.clients.size }));
    } else {
      res.writeHead(404); res.end("Not found");
    }
  });

  server.on("upgrade", (req, socket, head) => {
    if (req.url === "/") {
      wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
    } else { socket.destroy(); }
  });

  wss.on("connection", (ws) => {
    console.log("[OK] Client connected via WebSocket");
    ws.on("message", (raw) => {
      try {
        const d = JSON.parse(raw.toString());
        if (d.type === "transcript") console.log(`[VOICE] ${d.lang}: "${d.text}" final=${d.final}`);
        if (d.type === "send-to-chat") console.log(`[SEND] "${d.text}"`);
      } catch {}
    });
    ws.on("close", () => console.log("[--] Client disconnected"));
  });

  await new Promise((resolve) => server.listen(PORT, "127.0.0.1", () => {
    console.log(`[OK] Server on http://127.0.0.1:${PORT}`);
    resolve();
  }));

  console.log("[OK] Voice bridge server ready — waiting for Electron BrowserWindow");
  console.log("[!!] Server running in background");
}

main().catch(console.error);
