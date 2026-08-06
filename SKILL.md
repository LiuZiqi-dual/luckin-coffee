---
name: order-coffee
description: Order Luckin (瑞幸) coffee via the my-coffee MCP — checks the MCP is installed & authorized, manages favorite stores, searches products (exact then tokenized fallback), places an order, auto-polls payment, and delivers a verified pickup QR + code. Use when the user wants to order coffee / 点咖啡 / 瑞幸 / luckin / 来一杯.
---

# Order Coffee (瑞幸 / my-coffee MCP)

Order coffee end-to-end. Follow the phases in order. Scripts live in this skill's
`scripts/` directory (run them from there). Config is resolved by `resolve_config.js`
— never hardcode a config path.

## Absolute rules (never violate)
- **Never** ask for or show latitude/longitude. Confirm stores by their `address` text.
- Config (`config.json`) stores **only** store preferences + coordinates. **Never** write
  tokens, phone numbers, or payment info anywhere.
- **The my-coffee API key lives ONLY in the MCP client config** (for my-coffee: the HTTP
  `Authorization` header; for stdio-type servers: the `env` field). **Never** put the key in
  `config.json`, this skill's files, or memory. You **may** pass the full key inside the actual
  command that writes the MCP config (e.g. `claude mcp add … --header`); but **never** echo it in
  full in chat prose — mask it there (`Bearer ****1234`). The one exception is the opt-in curl
  fallback (Phase 0.5): there the token may live in `$LUCKIN_MCP_TOKEN` / `$ORDER_COFFEE_TOKEN`,
  or — only with explicit user consent — in `~/.order-coffee/token` (`chmod 600`).
- **Coupon passthrough (money-critical):** if `previewOrder` returns a non-empty `couponCodeList`,
  `createOrder` **must** forward it **verbatim** — dropping it silently overcharges the user.
- **Payment link:** hand the user `payOrderQrCodeUrl` (the pay-QR image); **never** use `payOrderUrl`,
  and never truncate the URL.
- Get an explicit yes before `createOrder`, using the confirmation mode Phase 5 selects. Never reuse a
  **stale** confirmation from an unrelated earlier order.
- Never send a pickup-QR image that failed verification.
- Match product attributes by **name** ("温度"/"冰度"/"糖度"…); attribute IDs are fallback only.
- On any store-reason error from preview/create, pass it through verbatim and stop. No blind retry.

## Phase 0 — MCP preflight (run FIRST, before anything else)
Skills spread faster than their dependencies — assume the MCP may be missing or mis-keyed.
Run three checks in order, before any store/product work:

1. **Tool existence (zero cost — inspect your own tool list):** are the my-coffee MCP tools
   present (`queryShopList`, `searchProductForMcp`, `createOrder`, …)? If **none** are available →
   "MCP not installed" → go to **Installation & Configuration**. Do **not** attempt any call.
2. **Auth validity (one read-only light call):** call `queryShopList` once with a model-anchor
   coordinate (or `homeRegion` if config already has one). If it returns an **auth error**
   (401/403/unauthorized/token/鉴权…) → "key invalid or expired" → go to **Installation** (key
   regeneration). **No retry loop.** Do not wait until a write op like `createOrder` to discover a bad key.
3. **Success** → **pass silently.** Do not mention the preflight; continue to Phase 1.

**Runtime auth fallback:** if **any** later business call returns an auth error, immediately pause the
flow and handle it as "key invalid" (Installation → key regen) — never treat it as a normal search
failure. After the user updates the key, resume via "查一下我刚才的订单" (Recovery) or restart.

## Installation & Configuration
**Prerequisites:** a my-coffee (Luckin 瑞幸) MCP API key — a Bearer token from Luckin's open platform.

**How to get the key (tell the user this):**
1. Open the Luckin MCP open platform: **https://open.lkcoffee.com/mcp**
2. Find and click the **登录 (Log in)** button on the page, and sign in.
3. After login the platform **auto-generates the key** (the Bearer token) — copy it.
4. Hand it to this skill; it will configure the MCP for you (below). To rotate, log back in and regenerate.

Do not invent any other portal or steps; this is the whole flow. If the page or flow has changed,
have the user follow the on-screen login and report the key it shows — never guess a key.

**my-coffee is an HTTP MCP server:**
- url: `https://gwmcp.lkcoffee.com/order/user/mcp`
- auth: `Authorization: Bearer <YOUR_KEY>`

Give the user the setup that matches their harness. **The key goes ONLY here.**

**Claude Code — CLI:**
```bash
claude mcp add --transport http my-coffee https://gwmcp.lkcoffee.com/order/user/mcp \
  --header "Authorization: Bearer <YOUR_KEY>"
```
**Claude Code — or add to `~/.claude.json` (or project `.mcp.json`) under `mcpServers`:**
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
**Cursor / Copilot / generic — `mcp.json`:**
```json
{
  "mcpServers": {
    "my-coffee": {
      "url": "https://gwmcp.lkcoffee.com/order/user/mcp",
      "headers": { "Authorization": "Bearer <YOUR_KEY>" }
    }
  }
}
```
Place it per your tool's MCP-config docs. (For a stdio-type server the secret would go in `env`;
my-coffee uses an HTTP `Authorization` header.) If you can't identify the harness, give the generic
JSON block and tell the user to place it per their tool's docs.

**Configure it FOR the user (default) — don't make them hand-edit config.** Once you have the key,
offer to set it up and, on a yes, do it yourself:
- **Claude Code:** run the CLI —
  `claude mcp add --transport http my-coffee https://gwmcp.lkcoffee.com/order/user/mcp --header "Authorization: Bearer <KEY>"`.
  Then tell the user the my-coffee tools load **after the client reloads MCP servers** (usually a restart);
  they don't need to touch any file.
- **File-based harness with a known config path:** **back up the file first**, then write the `mcpServers`
  block into it.
- **Only if you can't run/write** (unknown harness, no access, or user declines): output the JSON snippet
  for them to paste.

Never write the key into `config.json`, this skill's files, or memory — it goes only into the MCP client
config, and the full value appears only in the actual add/write command.

**Acceptance after guidance:** when the user says they've configured it → **re-run Phase 0 check 2**
(the read-only call). Success → continue to Phase 1. Still failing → show the error **verbatim**,
no guessing.

## Phase 0.5 — curl fallback when the MCP isn't registered (optional)
If Phase 0 check 1 found **no** my-coffee tools **but a token is available**, you don't have to make
the user register the MCP server first — you can drive the whole flow over plain HTTP with
`scripts/mcp_curl.sh` (standard MCP-over-HTTP / JSON-RPC; the endpoint is the server's public contract).

- List tools: `bash scripts/mcp_curl.sh list`
- Call a tool: `bash scripts/mcp_curl.sh call queryShopList '{"longitude":<lng>,"latitude":<lat>,"deptName":"<name>"}'`

Every tool this skill uses (`queryShopList`, `searchProductForMcp`, `queryProductDetailInfo`,
`switchProduct`, `previewOrder`, `createOrder`, `queryOrderDetailInfo`, `cancelOrder`) is reachable
this way. Parse the JSON-RPC `result` — tool output is in `result.content[0].text` /
`result.structuredContent`; the helper already unwraps SSE `data:` lines. An auth-error body
(`访问令牌无效或已过期` / `oauth token is invalid`) means the token is bad → handle per Phase 0 (key regen).

**Token policy (stricter than baking it into a config file):**
- The helper reads the token from `$LUCKIN_MCP_TOKEN` → `$ORDER_COFFEE_TOKEN` → `~/.order-coffee/token`,
  and never prints or writes it. Prefer an **ephemeral env var for the current command** (not persisted).
- Only if the user **explicitly agrees** to reuse it across sessions, write it to `~/.order-coffee/token`
  and `chmod 600`. **Ask first; never save silently.** To revoke: delete that file and say reuse is off.
- The full token appears only inside the curl/helper call. **Mask it in all chat prose** (`Bearer ****1234`).

**When the my-coffee tools ARE registered as client tools, prefer them** over curl (cleaner, no token
handling). Curl is the zero-config path for harnesses where you can't — or don't want to — register the
server, or when a restart to load the MCP isn't convenient.

## Phase 1 — Load config
Run `node scripts/resolve_config.js init` then `node scripts/resolve_config.js load`.
- If `init` reported `created=true`, tell the user the config path and that this is first-time
  setup; offer to register one or more favorite stores now (Phase 2 store search for each).
- If the runtime has a memory feature, store a one-line signpost only: config path + favorite
  store names. Never write deptId/coords (or the key) to memory — JSON is the source of truth.

To read/write config: `resolve_config.js path` gives you the resolved file path; edit that JSON
file directly (keep `version:1`, keep it `chmod 600`). Never add token/phone/payment/key fields.

## Phase 2 — Resolve the store
Determine deptId + coords for this order:
1. **User named a store in the prompt** → normalize (case, full/half-width, traditional/simplified)
   and match against favorites `name`/`aliases`. Hit → use it. Miss → "new-store search" (below).
2. Not named + **exactly one favorite** → use it.
3. Not named + **multiple favorites** → list them, ask which.
4. Not named + **no favorites** → new-store search, then ask "设为常用吗？".

**New-store search (coordinate anchor):**
- User gives city/district only (e.g. "广州番禺"). Before searching, confirm the anchor:
  "还在广州番禺附近吗？" (a one-time override is allowed; do NOT write it back to config).
- You supply a rough km-level center coordinate for that district yourself (no web lookup). It is
  only a search anchor — never shown to the user.
- Strip generic suffixes (店/广场店/分店) to get the core `deptName`. **Protection:** if stripping
  leaves ≤1 Chinese character, don't strip — search the original word.
- Call `queryShopList(longitude, latitude, deptName)`; sort by `distance`. Multiple hits → list and ask.
- Confirm with the API `address`: "XX区XX路XX号，是这家吗？" (no coordinates shown).
- On confirmation, backfill config with the **API-returned** coords (favorites required, `source:"api"`;
  if the user lives there, also set homeRegion). API coords always override any model-anchor coords.
- **Anchor error:** zero results, or all returned stores have `distance` > 10km → the anchor is wrong.
  Re-ask the user's city/district. Do NOT silently retry with a different coordinate.

## Phase 3 — Store open + self-pickup check
Before previewing, confirm the store is open and supports self-pickup using `queryShopList`/store
fields: `workStatus` = 营业中 and current time within `workTimeStart`~`workTimeEnd`. (The exact
self-pickup field name — verify against the live response.) Closed/paused → tell the user and stop.

## Phase 4 — Find the product (tiered)
1. **Exact search:** `searchProductForMcp(deptId, <user's original phrase>)`.
2. **"Really found?"** — not just a same-name product, but one that **satisfies the requested spec**
   (e.g. 全冰去水). Check via `queryProductDetailInfo`, matching the attribute by **name** ("温度"…).
   Satisfied → use it.
3. **Not satisfied / not found → tokenized fallback:**
   - Split the query: drop spec words, keep the product-type words (obey the ≤1-char strip protection).
     Search each token separately.
   - **Merge + dedupe** by `productCode`/`skuCode`, **preserving first-appearance order** (most-relevant
     query's most-relevant result first).
   - If a candidate's name **exactly equals** the product-type phrase (user's words minus spec words),
     move it to the very front.
   - Run `queryProductDetailInfo` on **at most the first 3** candidates to check spec support; list the
     rest by name only for the user to pick. (Product results carry no `distance`; "first 3" = relevance
     order.)
   - Present the candidates that support the requested spec; let the user choose.
4. Apply options with `switchProduct` to obtain the correct `skuCode`.

## Phase 5 — Preview + confirm
Pick the confirmation mode by scenario:

- **Two-step (default — new store, new product, or any customized spec):** call `previewOrder`, then
  confirm with the user, stating **all four**: 1. store full name, 2. product + full spec, 3. actual pay
  amount (`discountPrice`; also surface `totalInitialPrice` and the `privilegeMoney` discount),
  4. payment method. **Require a fresh explicit yes for THIS preview before `createOrder`.**
- **Pre-authorized one-step (favorite-store "老样子" only):** at the store+product confirm, state the
  order and declare the rule — "预览后若价格不高于预估、明细一致、优惠券正常，我就直接下单". On the user's
  yes, call `previewOrder`; if it holds (pay amount ≤ the estimate you quoted, items match, coupons
  normal, response complete) → go straight to `createOrder` with no second ask. **Otherwise stop and
  re-confirm** — price rose, details differ, coupon anomaly, or incomplete/ambiguous response.

**Coupons (either mode):** if `previewOrder` returns a non-empty `couponCodeList`, carry it **verbatim**
into `createOrder` (Phase 6) — that field is what applies the discount; never drop it.

> Store-reason error here → pass through verbatim and stop.

## Phase 6 — Create order + poll payment
1. `createOrder(...)` — **forward `couponCodeList` from the Phase 5 preview verbatim** when it was
   non-empty (omitting it overcharges the user). Record the initial `orderStatus`. **Payment:** hand the
   user `payOrderQrCodeUrl` — render it as a Markdown image `![支付二维码](<payOrderQrCodeUrl>)` **plus** a
   full clickable `[打开支付二维码](<payOrderQrCodeUrl>)` fallback; on a channel with native image support
   (e.g. 飞书/微信 media), send the image natively. **Never** use `payOrderUrl`; never truncate the URL.
   Store-reason error → pass through and stop.
2. **Capture the initial placeholder:** run one `queryOrderDetailInfo` now (still 待付款) and remember its
   `takeMealCodeInfo.code` as `INITIAL_CODE`.
3. **Auto-poll** (no need for the user to tell you they paid). Between checks, wait with a background sleep
   so you're re-invoked, then call `queryOrderDetailInfo`. Cadence from createOrder time:
   **15s, 30s, 45s, 60s (15s apart), then every 20s (80/100/120/140s), final check at 150s.**
   - Mechanism: `Bash` `sleep 15` (×4) then `sleep 20` (trim the last to land on 150s), each
     `run_in_background` so it re-invokes you on exit; re-query on wake.
   - **Paid** = `orderStatus` != initial **AND** `code` non-empty **AND** `code` != `INITIAL_CODE`
     → stop immediately, go to Phase 7.
   - **Canceled/closed** → stop, tell the user.
   - **Unknown status** (neither 待付款 nor paid) → stop, report the status verbatim, no guessing.
   - **Auth error mid-poll** → stop, handle per Phase 0 runtime fallback (key invalid), don't treat as unpaid.
   - **Reached 150s unpaid** → stop and say exactly:
     > 暂未检测到付款，付好后跟我说"付好了"我再查；不付了就说"取消"
4. If the user later says **"付好了"** → run one `queryOrderDetailInfo` and apply the same paid check.

## Phase 7 — Deliver the pickup QR
1. Run `node scripts/make_pickup_qr.js "<takeMealCodeInfo.takeOrderId>" scripts/order-<orderId>.png`.
2. **`QR_OK>>>`** → send the image + pickup number `code` + store/product summary (Read the PNG to render it).
3. **`QR_FAIL>>>`** → the script already deleted the bad PNG. Degrade: send the pickup number `code` +
   store/product summary as text, and say the QR failed. Never send an unverified image.

## Recovery
If the user says "查一下我刚才的订单", query the latest order and resume: 待付款 → run one check
(Phase 6 step 4) and optionally re-poll; already paid → Phase 7.

## Cancel an order
If the user wants out (e.g. "不付了" / "取消" / "帮我退掉"): use the most recent `orderId` from this
conversation (if there is none, ask which order) → call `cancelOrder(orderId)` → give a short
confirmation of the result. Stop any payment polling for that order; don't re-poll a canceled order.

## Known limitation (TODO)
The my-coffee MCP exposes no 取餐方式 (店内用餐 / 自提带走) parameter — `createOrder` takes only
deptId/productList/coords/couponCodeList/remark; `orderType` is read-only in order detail. When the MCP
adds it, offer the choice at Phase 5 and pass it through. Until then, don't assume it or smuggle it via `remark`.
