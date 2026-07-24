# reach-linkedin — free, self-hosted Unipile alternative for LinkedIn

A tiny HTTP gateway that wraps [`linkedin-mcp-tools`](https://github.com/devag7/linkedin-mcp)
(MIT) — a real **stealth browser (patchright) + in-page Voyager API** engine, the only
method that still works past Cloudflare in 2026 — and exposes the LinkedIn outreach
operations FoundReach's **Reach** tool needs. Point Reach's LinkedIn engine here instead
of paying Unipile.

## The two things ONLY you can provide (like connecting a Unipile account)

1. **A (burner) LinkedIn account + one-time login.** The login is *headful* (a real
   Chrome opens; you solve any 2FA/checkpoint once): `npm run login`. The session
   persists to `~/.linkedin-mcp/profile/`.
2. **A residential IP.** LinkedIn/Cloudflare **pre-flag datacenter/VPN IPs**, so run this
   gateway on your own machine (or a residential-proxied worker) — NOT a datacenter.
   Optionally set a residential `PROXY_URL`.

## Run

```bash
# 1) log in once (headful, residential IP)
npm run login
# 2) start the gateway (headless, reuses the session)
GATEWAY_TOKEN=<a-secret> npm start          # → :8080
# or Docker (mount your logged-in profile)
docker build -t reach-linkedin .
docker run -p 8080:8080 -e GATEWAY_TOKEN=<secret> \
  -v ~/.linkedin-mcp:/root/.linkedin-mcp reach-linkedin
```

## API (what Reach calls)

| Method | Path | Body | → engine tool |
|---|---|---|---|
| GET  | `/health` | — | — |
| GET  | `/status` | — | `whoami` (connected?) |
| POST | `/search` | `{keywords,count}` | `search_people` |
| POST | `/connect` | `{profile_id,message?}` | `connect_with_person` (confirm) |
| POST | `/message` | `{recipient_urn\|conversation_id,message}` | `send_message` (confirm) |
| GET  | `/inbox` | `?count` | `get_inbox` |
| POST | `/tool` | `{name,arguments}` | any of the 22 tools |

All mutating calls require `Authorization: Bearer $GATEWAY_TOKEN` (or `X-API-KEY`).

## Wire into Reach

Set on the Reach service: `LINKEDIN_MCP_URL=https://<this-gateway>` and
`LINKEDIN_MCP_TOKEN=<secret>`. Reach then routes connection requests, messages and
profile search through this engine. Until `/status` reports `connected:true`, LinkedIn
stays dormant (same as an unconnected Unipile account).

> Automating LinkedIn violates its User Agreement and can restrict accounts. No engine is
> ban-proof. Use a burner account, keep the built-in daily caps, start slow.
