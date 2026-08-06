# order-coffee

A Claude [Agent Skill](https://docs.anthropic.com/en/docs/claude-code/skills) that orders Luckin Coffee (瑞幸) end-to-end through the **my-coffee** MCP server — it checks the MCP is installed and authorized, manages favorite stores, searches products (exact match first, then a tokenized fallback), places the order, **auto-polls payment**, and delivers a **locally verified pickup QR** + pickup number.

> Trigger it by asking to order coffee: `点咖啡` / `瑞幸` / `luckin` / `来一杯` / "order a coffee".

## Requirements

- A Claude harness that supports skills + MCP (Claude Code, and other MCP-capable clients).
- The **my-coffee** MCP server (HTTP transport) and an API key — a Bearer token issued by the Luckin open platform / your MCP provider.
- Node.js 18+ (the QR + config scripts use the built-in test runner and a few pinned deps).

## Install

### 1. Configure the my-coffee MCP server

`my-coffee` is an HTTP MCP server. **Your key goes only in the MCP client config — never in this skill's files.**

- url: `https://gwmcp.lkcoffee.com/order/user/mcp`
- auth: `Authorization: Bearer <YOUR_KEY>`

**Claude Code (CLI):**
```bash
claude mcp add --transport http my-coffee https://gwmcp.lkcoffee.com/order/user/mcp \
  --header "Authorization: Bearer <YOUR_KEY>"
```

**Claude Code / generic (`~/.claude.json` or `.mcp.json`, Cursor/Copilot `mcp.json`):**
```json
{
  "mcpServers": {
    "my-coffee": {
      "type": "http",
      "url": "https://gwmcp.lkcoffee.com/order/user/mcp",
      "headers": { "Authorization": "Bearer <YOUR_KEY>" }
    }
  }
}
```

(If the skill runs before the MCP is set up, its **Phase 0 preflight** detects that and walks you through this step.)

### 2. Install the skill

Copy this directory into your harness's skills directory (e.g. `~/.claude/skills/order-coffee/`), then install the script deps:

```bash
cd order-coffee/scripts && npm install
```

## Configuration

Store preferences live in a JSON config resolved in this order:

1. `$ORDER_COFFEE_CONFIG` (explicit path)
2. `~/.order-coffee/config.json` (default — created on first run, `chmod 600`)
3. `<skill-dir>/config.json` (fallback)

See [`config.example.json`](config.example.json). The config holds **only** store names, `deptId`, and coordinates — **never** tokens, phone numbers, or payment info. On first run the skill offers to save one or more **favorite stores**; after that, ordering "the usual" needs no store lookup.

## Usage

Just ask. The skill runs these phases:

| Phase | What it does |
|------|--------------|
| 0 | **MCP preflight** — verify the MCP is installed + the key is valid (one read-only call) |
| 1 | Load config |
| 2 | Resolve the store (favorites → or search by city/district; never asks for coordinates) |
| 3 | Check the store is open + supports self-pickup |
| 4 | Find the product — exact search, then tokenized fallback that inspects attributes to satisfy specs like `全冰去水` |
| 5 | Preview + confirm (store, item + full spec, exact price, payment method) |
| 6 | Create the order, then **auto-poll payment** (15/30/45/60s, then every 20s to a 150s cap) |
| 7 | Deliver the **pickup QR** (content verified char-for-char) + pickup number |

## How the pickup QR works

The MCP returns `takeMealCodeInfo.takeOrderId` (the exact string the Luckin app encodes in its pickup QR) and a human-readable `code`. `scripts/make_pickup_qr.js` encodes the `takeOrderId` into a PNG, then **decodes it back and requires a char-for-char match** before the image is ever shown. If verification fails, the bad PNG is deleted and the skill falls back to sending the pickup number as text.

## Security & privacy

- The API key lives **only** in the MCP client config; it is never written to `config.json`, never stored in agent memory, and masked if ever echoed.
- `config.json` stores only store preferences + coordinates.
- QR codes are generated and verified locally; nothing is sent to third parties.

## Known limitation

The my-coffee MCP currently exposes **no 取餐方式 (dine-in / takeaway) parameter** — `createOrder` accepts only `deptId` / `productList` / coordinates / `couponCodeList` / `remark`. When the MCP adds it, the confirmation step will offer the choice.

## Development

```bash
cd scripts && node --test    # 10 tests (QR verify + config resolution)
```

## License

[MIT](LICENSE)
