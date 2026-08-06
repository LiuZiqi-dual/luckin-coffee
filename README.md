# order-coffee

A Claude [Agent Skill](https://docs.anthropic.com/en/docs/claude-code/skills) that orders Luckin Coffee (瑞幸) end-to-end through the **my-coffee** MCP server — it checks the MCP is installed and authorized, manages favorite stores, searches products (exact match first, then a tokenized fallback), places the order, **auto-polls payment**, and delivers a **locally verified pickup QR** + pickup number.

> Trigger it by asking to order coffee: `点咖啡` / `瑞幸` / `luckin` / `来一杯` / "order a coffee".

**Language:** **English** (default) · [中文说明 ↓](#中文说明)

---

> **🤖 AI agents:** to install and initialize this skill automatically, follow **[`AGENTS.md`](AGENTS.md)** — a terse, English-only setup runbook.

---

## Requirements

- A Claude harness that supports skills + MCP (Claude Code, and other MCP-capable clients).
- The **my-coffee** MCP server (HTTP transport) and an API key — a Bearer token from the Luckin open platform ([open.lkcoffee.com/mcp](https://open.lkcoffee.com/mcp): log in and the key is auto-generated).
- Node.js 18+ (the QR + config scripts use the built-in test runner and a few pinned deps).

## Install (manual)

The steps below are the human-readable version of the agent runbook in [`AGENTS.md`](AGENTS.md).

### 1. Configure the my-coffee MCP server

`my-coffee` is an HTTP MCP server. **Your key goes only in the MCP client config — never in this skill's files.**

> **Get your key:** open **[open.lkcoffee.com/mcp](https://open.lkcoffee.com/mcp)**, click the **登录 (Log in)** button and sign in — the platform auto-generates your Bearer key after login. (The skill can run the `claude mcp add` below **for** you — you don't have to hand-edit any config.)

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

Clone it into your harness's skills directory (or copy the folder there — keep the directory named `order-coffee` to match the skill's `name`), then install the script deps:

```bash
git clone https://github.com/LiuZiqi-dual/luckin-coffee.git ~/.claude/skills/order-coffee
cd ~/.claude/skills/order-coffee/scripts && npm install
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

## Zero-config mode (curl fallback)

Don't want to register the MCP server — or can't restart the client to load it? If you have a Bearer key, the skill can run the **entire** flow over plain HTTP, with no client config at all. `scripts/mcp_curl.sh` calls the same endpoint via standard MCP-over-HTTP (JSON-RPC 2.0):

```bash
export LUCKIN_MCP_TOKEN='<YOUR_KEY>'        # ephemeral for this shell; not persisted
bash scripts/mcp_curl.sh list
bash scripts/mcp_curl.sh call queryShopList '{"longitude":121.47,"latitude":31.23,"deptName":"..."}'
```

Every tool the skill uses is reachable this way (`queryShopList`, `searchProductForMcp`, `previewOrder`, `createOrder`, `queryOrderDetailInfo`, …). The token is read from `$LUCKIN_MCP_TOKEN` → `$ORDER_COFFEE_TOKEN` → `~/.order-coffee/token` (first hit wins) and is **never printed or written** by the script — it only travels inside the curl call. It is persisted to `~/.order-coffee/token` (`chmod 600`) **only if you explicitly opt in**, never to `config.json` or agent memory. When the my-coffee tools *are* registered as native MCP tools, the skill prefers those (cleaner, no token handling).

## How the pickup QR works

The MCP returns `takeMealCodeInfo.takeOrderId` (the exact string the Luckin app encodes in its pickup QR) and a human-readable `code`. `scripts/make_pickup_qr.js` encodes the `takeOrderId` into a PNG, then **decodes it back and requires a char-for-char match** before the image is ever shown. If verification fails, the bad PNG is deleted and the skill falls back to sending the pickup number as text.

## Security & privacy

- The API key lives **only** in the MCP client config; it is never written to `config.json`, never stored in agent memory, and masked if ever echoed.
- **Zero-config mode** reads the key from an env var by default; it is persisted (to `~/.order-coffee/token`, `chmod 600`) only with your explicit consent, never to `config.json` or agent memory.
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

---

<a id="中文说明"></a>

# 中文说明

一个 Claude [Agent Skill](https://docs.anthropic.com/en/docs/claude-code/skills)，通过 **my-coffee** MCP 服务器**端到端**点瑞幸咖啡：检查 MCP 是否已安装并授权、管理常用门店、搜索商品（先精确匹配、再分词回退）、下单、**自动轮询支付状态**，最后交付一个**本地校验过的取餐二维码** + 取餐号。

> 触发方式：让它点咖啡即可 —— `点咖啡` / `瑞幸` / `luckin` / `来一杯` / “order a coffee”。

**语言：** [English ↑](#order-coffee)（默认） · **中文**

> **🤖 AI agent：** 要自动安装并初始化本 skill，请照 **[`AGENTS.md`](AGENTS.md)** 执行 —— 一份精简、纯英文的安装手册（供 agent 读取）。

## 环境要求

- 支持 skills + MCP 的 Claude harness（Claude Code，以及其它支持 MCP 的客户端）。
- **my-coffee** MCP 服务器（HTTP 传输）及一个 API key —— 瑞幸开放平台（[open.lkcoffee.com/mcp](https://open.lkcoffee.com/mcp)，登录后自动生成）签发的 Bearer token。
- Node.js 18+（二维码与配置脚本用到内置测试运行器和几个锁定版本的依赖）。

## 手动安装

以下是 [`AGENTS.md`](AGENTS.md) 里 agent 手册的人类可读版本。

### 1. 配置 my-coffee MCP 服务器

`my-coffee` 是 HTTP 型 MCP 服务器。**你的 key 只放在 MCP 客户端配置里 —— 绝不写进本 skill 的任何文件。**

> **获取 key：** 打开 **[open.lkcoffee.com/mcp](https://open.lkcoffee.com/mcp)**，点击页面上的 **登录** 按钮并登录 —— 登录后平台会自动生成你的 Bearer key。（下面的 `claude mcp add` 可以让 skill **替你**执行，你无需手动改任何配置。）

- url：`https://gwmcp.lkcoffee.com/order/user/mcp`
- 认证：`Authorization: Bearer <你的KEY>`

**Claude Code（CLI）：**
```bash
claude mcp add --transport http my-coffee https://gwmcp.lkcoffee.com/order/user/mcp \
  --header "Authorization: Bearer <你的KEY>"
```

**Claude Code / 通用（`~/.claude.json` 或 `.mcp.json`，Cursor/Copilot 用 `mcp.json`）：**
```json
{
  "mcpServers": {
    "my-coffee": {
      "type": "http",
      "url": "https://gwmcp.lkcoffee.com/order/user/mcp",
      "headers": { "Authorization": "Bearer <你的KEY>" }
    }
  }
}
```

（若在 MCP 尚未配置好时就运行 skill，其 **Phase 0 preflight** 会检测到并引导你完成本步。）

### 2. 安装 skill

把仓库 clone 到 harness 的 skills 目录（或把文件夹复制过去 —— 目录名保持 `order-coffee` 以匹配 skill 的 `name`），再安装脚本依赖：

```bash
git clone https://github.com/LiuZiqi-dual/luckin-coffee.git ~/.claude/skills/order-coffee
cd ~/.claude/skills/order-coffee/scripts && npm install
```

## 配置

门店偏好存于一个 JSON 配置文件，按以下顺序解析：

1. `$ORDER_COFFEE_CONFIG`（显式路径）
2. `~/.order-coffee/config.json`（默认 —— 首次运行时创建，`chmod 600`）
3. `<skill-dir>/config.json`（回退）

参见 [`config.example.json`](config.example.json)。配置**只**保存门店名、`deptId` 和坐标 —— **绝不**存 token、手机号或支付信息。首次运行时 skill 会提议保存一个或多个**常用门店**；之后点“老样子”便无需再查门店。

## 使用

直接开口点即可。skill 会依次走这些阶段：

| 阶段 | 做什么 |
|------|--------------|
| 0 | **MCP 预检** —— 确认 MCP 已装且 key 有效（一次只读调用） |
| 1 | 加载配置 |
| 2 | 确定门店（常用门店 → 或按城市/区县搜索；从不询问坐标） |
| 3 | 检查门店营业中且支持自提 |
| 4 | 找商品 —— 先精确搜索，再分词回退并检查属性以满足像 `全冰去水` 这样的规格 |
| 5 | 预览 + 确认（门店、商品 + 完整规格、实付金额、支付方式） |
| 6 | 下单，然后**自动轮询支付**（15/30/45/60s，之后每 20s，上限 150s） |
| 7 | 交付**取餐二维码**（内容逐字符校验）+ 取餐号 |

## 零配置模式（curl 兜底）

不想注册 MCP 服务器 —— 或没法重启客户端来加载它？只要有 Bearer key，skill 就能纯 HTTP 跑完**整个**流程，完全不碰客户端配置。`scripts/mcp_curl.sh` 用标准 MCP-over-HTTP（JSON-RPC 2.0）调同一个端点：

```bash
export LUCKIN_MCP_TOKEN='<你的KEY>'         # 仅当前 shell 临时用，不持久化
bash scripts/mcp_curl.sh list
bash scripts/mcp_curl.sh call queryShopList '{"longitude":121.47,"latitude":31.23,"deptName":"..."}'
```

skill 用到的每个工具都能这样调（`queryShopList`、`searchProductForMcp`、`previewOrder`、`createOrder`、`queryOrderDetailInfo`…）。token 按 `$LUCKIN_MCP_TOKEN` → `$ORDER_COFFEE_TOKEN` → `~/.order-coffee/token` 顺序读取（先命中先用），脚本**从不打印或写入**它 —— 它只在 curl 调用里出现。只有你**明确同意**才会持久化到 `~/.order-coffee/token`（`chmod 600`），绝不写进 `config.json` 或 agent 记忆。当 my-coffee 工具已作为原生 MCP 工具注册时，skill 优先用它们（更干净，无需处理 token）。

## 取餐二维码的原理

MCP 返回 `takeMealCodeInfo.takeOrderId`（瑞幸 App 取餐码里编码的确切字符串）和一个人类可读的 `code`。`scripts/make_pickup_qr.js` 把 `takeOrderId` 编码为 PNG，然后**再解码回来、要求逐字符一致**才会展示图片。若校验失败，会删除坏 PNG 并降级为以文本形式发送取餐号。

## 安全与隐私

- API key **只**存在 MCP 客户端配置里；绝不写进 `config.json`、绝不存入 agent 记忆，如需回显则打码。
- **零配置模式**默认从环境变量读 key；只有你**明确同意**才会持久化（存到 `~/.order-coffee/token`，`chmod 600`），绝不写进 `config.json` 或 agent 记忆。
- `config.json` 只存门店偏好 + 坐标。
- 二维码在本地生成与校验，不向任何第三方发送。

## 已知限制

my-coffee MCP 目前**未暴露取餐方式参数（店内用餐 / 自提带走）**—— `createOrder` 只接受 `deptId` / `productList` / 坐标 / `couponCodeList` / `remark`。等 MCP 补上后，确认步骤会提供该选择。

## 开发

```bash
cd scripts && node --test    # 10 个测试（二维码校验 + 配置解析）
```

## 许可

[MIT](LICENSE)
