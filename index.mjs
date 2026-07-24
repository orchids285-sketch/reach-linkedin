// reach-linkedin — a free, self-hosted Unipile alternative for LinkedIn.
//
// Wraps devag7/linkedin-mcp (`linkedin-mcp-tools`, MIT) — which drives a real
// stealth browser (patchright) and calls LinkedIn's Voyager API from INSIDE the
// authenticated page (the only method that still works in 2026 past Cloudflare) —
// and exposes the outreach operations FoundReach's "Reach" tool needs over a
// small HTTP API. Reach points its LinkedIn engine at this gateway instead of
// paying for Unipile.
//
// IMPORTANT (read the runbook): the browser engine must run from a RESIDENTIAL
// IP and be logged into a (burner) LinkedIn account once — datacenter IPs are
// pre-flagged by Cloudflare. So the RIGHT place to run this gateway is the
// operator's own machine (or a residential-proxied worker), NOT a datacenter.
// It boots + serves the API anywhere; live LinkedIn only works once a session
// exists. GATEWAY_TOKEN gates every mutating call.
import http from "node:http";
import { spawn } from "node:child_process";

const PORT = parseInt(process.env.PORT || "8080", 10);
const TOKEN = process.env.GATEWAY_TOKEN || "";
const MCP_CMD = process.env.MCP_CMD || "npx";
// If MCP_CMD is the global bin (Docker), it takes NO args. Only the `npx` path
// needs the package spec. An explicitly-set MCP_ARGS (even "") overrides.
const DEFAULT_ARGS = MCP_CMD === "npx" ? ["-y", "linkedin-mcp-tools@latest"] : [];
const MCP_ARGS =
  process.env.MCP_ARGS !== undefined && process.env.MCP_ARGS !== ""
    ? process.env.MCP_ARGS.split(" ").filter(Boolean)
    : DEFAULT_ARGS;

// ── Minimal MCP stdio client (JSON-RPC over the linkedin-mcp subprocess) ──
class McpClient {
  constructor() { this.proc = null; this.buf = ""; this.id = 0; this.pending = new Map(); this.ready = null; }
  start() {
    if (this.ready) return this.ready;
    this.ready = new Promise((resolve, reject) => {
      const env = { ...process.env };
      // patchright/linkedin-mcp read these; a residential proxy is set via PROXY_URL.
      this.proc = spawn(MCP_CMD, MCP_ARGS, { env, stdio: ["pipe", "pipe", "inherit"] });
      this.proc.on("error", reject);
      this.proc.on("exit", (c) => { this.ready = null; for (const [, p] of this.pending) p.reject(new Error("mcp exited " + c)); });
      this.proc.stdout.on("data", (d) => this._onData(d));
      // MCP initialize handshake
      this._rpc("initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "reach-linkedin", version: "1.0.0" },
      }).then(() => this._notify("notifications/initialized"))
        .then(() => resolve(true))
        .catch(reject);
    });
    return this.ready;
  }
  _onData(chunk) {
    this.buf += chunk.toString();
    let idx;
    while ((idx = this.buf.indexOf("\n")) >= 0) {
      const line = this.buf.slice(0, idx).trim();
      this.buf = this.buf.slice(idx + 1);
      if (!line) continue;
      let msg; try { msg = JSON.parse(line); } catch { continue; }
      if (msg.id !== undefined && this.pending.has(msg.id)) {
        const p = this.pending.get(msg.id); this.pending.delete(msg.id);
        if (msg.error) p.reject(new Error(msg.error.message || JSON.stringify(msg.error)));
        else p.resolve(msg.result);
      }
    }
  }
  _send(obj) { this.proc.stdin.write(JSON.stringify(obj) + "\n"); }
  _notify(method, params) { this._send({ jsonrpc: "2.0", method, params: params || {} }); }
  _rpc(method, params) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this._send({ jsonrpc: "2.0", id, method, params: params || {} });
      setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); reject(new Error("mcp timeout: " + method)); } }, 120000);
    });
  }
  async callTool(name, args) {
    await this.start();
    const res = await this._rpc("tools/call", { name, arguments: args || {} });
    // MCP tool result: { content: [{type:'text', text}], isError? }
    const text = (res?.content || []).filter((c) => c.type === "text").map((c) => c.text).join("\n");
    let data = text;
    try { data = JSON.parse(text); } catch { /* keep text */ }
    return { ok: !res?.isError, data };
  }
}
const mcp = new McpClient();

// ── HTTP surface (Unipile-equivalent outreach ops) ──
function send(res, code, body) {
  res.writeHead(code, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
}
function authed(req) {
  if (!TOKEN) return true;
  const h = req.headers["authorization"] || "";
  const x = req.headers["x-api-key"] || "";
  return h === `Bearer ${TOKEN}` || x === TOKEN;
}
function readBody(req) {
  return new Promise((resolve) => {
    let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => { try { resolve(b ? JSON.parse(b) : {}); } catch { resolve({}); } });
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://x");
    const path = url.pathname;
    if (path === "/health") return send(res, 200, { ok: true, engine: "linkedin-mcp" });

    // status: is a LinkedIn session connected? (whoami via the engine)
    if (path === "/status") {
      try {
        const r = await mcp.callTool("whoami", {});
        const connected = r.ok && r.data && (typeof r.data === "object");
        return send(res, 200, { ok: true, connected: Boolean(connected), account: r.data ?? null });
      } catch (e) {
        return send(res, 200, { ok: true, connected: false, reason: String(e).slice(0, 160) });
      }
    }

    // everything below mutates or reads private data → gate it
    if (!authed(req)) return send(res, 401, { ok: false, error: "unauthorized" });

    if (path === "/search" && req.method === "POST") {
      const b = await readBody(req);
      const r = await mcp.callTool("search_people", { keywords: b.keywords || b.query || "", count: Math.min(b.count || 10, 25) });
      return send(res, 200, r);
    }
    if (path === "/connect" && req.method === "POST") {
      const b = await readBody(req);
      const r = await mcp.callTool("connect_with_person", { profile_id: b.profile_id, message: b.message || undefined, confirm: true });
      return send(res, 200, r);
    }
    if (path === "/message" && req.method === "POST") {
      const b = await readBody(req);
      const args = { message: b.message, confirm: true };
      if (b.conversation_id) args.conversation_id = b.conversation_id;
      else if (b.recipient_urn) args.recipient_urn = b.recipient_urn;
      const r = await mcp.callTool("send_message", args);
      return send(res, 200, r);
    }
    if (path === "/inbox") {
      const r = await mcp.callTool("get_inbox", { count: Math.min(parseInt(url.searchParams.get("count") || "50", 10), 100) });
      return send(res, 200, r);
    }
    if (path === "/tool" && req.method === "POST") {
      // escape hatch: call any linkedin-mcp tool by name
      const b = await readBody(req);
      const r = await mcp.callTool(b.name, b.arguments || {});
      return send(res, 200, r);
    }
    return send(res, 404, { ok: false, error: "not found" });
  } catch (e) {
    return send(res, 500, { ok: false, error: String(e).slice(0, 240) });
  }
});
server.listen(PORT, () => console.log("[reach-linkedin] gateway on :" + PORT + " (engine: " + MCP_CMD + " " + MCP_ARGS.join(" ") + ")"));
