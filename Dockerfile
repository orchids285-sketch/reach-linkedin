# reach-linkedin gateway — Node + Chrome (patchright) + linkedin-mcp.
# NOTE: for LIVE LinkedIn this must run from a RESIDENTIAL IP with a logged-in
# session (mount your ~/.linkedin-mcp profile at /root/.linkedin-mcp). On a
# datacenter IP it boots + serves the API but Cloudflare will block the browser.
FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
# Chrome deps for patchright's stealth Chromium
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates fonts-liberation libnss3 libatk-bridge2.0-0 libatk1.0-0 \
      libcups2 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 \
      libxrandr2 libgbm1 libasound2 libpangocairo-1.0-0 libpango-1.0-0 \
      libcairo2 libatspi2.0-0 wget \
    && rm -rf /var/lib/apt/lists/*
# Pre-install the engine + its stealth Chrome so first request is fast
RUN npm i -g linkedin-mcp-tools@latest patchright \
    && npx patchright install chrome --with-deps || npx patchright install chromium --with-deps
COPY package.json ./
COPY index.mjs ./
# linkedin-mcp is a global bin; point the gateway at it directly
ENV MCP_CMD=linkedin-mcp MCP_ARGS=""
EXPOSE 8080
CMD ["node", "index.mjs"]
