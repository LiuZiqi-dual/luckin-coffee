# order-coffee

A Claude [Agent Skill](https://docs.anthropic.com/en/docs/claude-code/skills) that orders Luckin Coffee (瑞幸) end-to-end through the **my-coffee** MCP server — it checks the MCP is installed and authorized, manages favorite stores, searches products (exact match first, then a tokenized fallback), places the order, **auto-polls payment**, and delivers a **locally verified pickup QR** + pickup number.

> Trigger it by asking to order coffee: `点咖啡` / `瑞幸` / `luckin` / `来一杯` / "order a coffee".

**Language:** **English** (default) · [中文说明 ↓](#中文说明)

---

## 🤖 Automated setup (for AI agents)

**If you are an AI agent reading this README, follow this runbook verbatim to install and initialize the skill.** It is idempotent — safe to re-run. The **only** thing you must get from the human is the my-coffee API key (step 5); everything else you can do yourself.

> **Definitions.** `SKILL_ROOT` = the directory that contains *this README* (the folder with `SKILL.md`, `config.example.json`, and `scripts/`). `SKILLS_DIR` = your harness's skills directory (Claude Code: `~/.claude/skills/`).

1. **Locate the skill.** Confirm `SKILL_ROOT/SKILL.md` and `SKILL_ROOT/scripts/package.json` exist. If they don't, you are not in the skill root — stop and ask the human where the skill was unpacked.

2. **Install into the skills directory** so your harness discovers it. Either clone the repo straight into place:
   ```bash
   git clone https://github.com/LiuZiqi-dual/luckin-coffee.git ~/.claude/skills/order-coffee
   ```
   or, if you already have the folder locally, copy it:
   ```bash
   mkdir -p ~/.claude/skills
   cp -R "<SKILL_ROOT>" ~/.claude/skills/order-coffee
   ```
   (Skip if it is already at `~/.claude/skills/order-coffee/`. The skill directory stays `order-coffee` — matching the skill's `name` — even though the repo is `luckin-coffee`. Adjust the destination for a non–Claude Code harness.)

3. **Install the script dependencies** (deps are gitignored, so a fresh copy has none):
   ```bash
   cd ~/.claude/skills/order-coffee/scripts && npm install
   ```
   Requires **Node.js 18+**.

4. **Verify the install** — the test suite must be green before you rely on the skill:
   ```bash
   cd ~/.claude/skills/order-coffee/scripts && node --test
   ```
   Expect **10 passing, 0 failing** (QR verify + config resolution). If any fail, stop and report it — do not paper over it.

5. **Configure the my-coffee MCP server — do it for the user; don't make them hand-edit config.** This is the one step needing a human secret.
   - **Ask the human for their my-coffee (Luckin 瑞幸) Bearer API key.** If they don't have one, walk them through getting it: open **[open.lkcoffee.com/mcp](https://open.lkcoffee.com/mcp)** → click the **登录 (Log in)** button and sign in → after login the platform **auto-generates the key**; copy it. Never invent a key yourself; pause here until they provide it.
   - **Register the server yourself** — run the command below (the URL is fixed; the full key goes **only** into this command — never into the skill's files or agent memory, and mask it in chat prose, e.g. `Bearer ****1234`):
     ```bash
     claude mcp add --transport http my-coffee https://gwmcp.lkcoffee.com/order/user/mcp \
       --header "Authorization: Bearer <THEIR_KEY>"
     ```
     Then tell them the my-coffee tools appear **after the client reloads MCP servers** (usually a restart) — they don't need to touch any file. For a non–Claude Code harness, back up the config file and write the block below into it; only if you can't, output it for them to paste (`~/.claude.json` / `.mcp.json`, Cursor/Copilot `mcp.json`):
     ```json
     {
       "mcpServers": {
         "my-coffee": {
           "type": "http",
           "url": "https://gwmcp.lkcoffee.com/order/user/mcp",
           "headers": { "Authorization": "Bearer <THEIR_KEY>" }
         }
       }
     }
     ```

6. **Initialize the store config** (creates `~/.order-coffee/config.json`, `chmod 600`, holding only store prefs — never secrets):
   ```bash
   node ~/.claude/skills/order-coffee/scripts/resolve_config.js init
   ```
   Prints `CONFIG>>><path> created=true|false`. This is idempotent.

7. **Done.** Reload skills if your harness caches them (Claude Code picks up new MCP servers on restart). The skill self-checks the MCP on first use (**Phase 0 preflight**) and offers to save a favorite store the first time it runs. Tell the human they can now say `点咖啡` / "order a coffee" to trigger it.

---

## Requirements

- A Claude harness that supports skills + MCP (Claude Code, and other MCP-capable clients).
- The **my-coffee** MCP server (HTTP transport) and an API key — a Bearer token from the Luckin open platform ([open.lkcoffee.com/mcp](https://open.lkcoffee.com/mcp): log in and the key is auto-generated).
- Node.js 18+ (the QR + config scripts use the built-in test runner and a few pinned deps).

## Install (manual)

The steps below are the human-readable version of the [agent runbook](#-automated-setup-for-ai-agents) above.

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

---

<a id="中文说明"></a>

# 中文说明

一个 Claude [Agent Skill](https://docs.anthropic.com/en/docs/claude-code/skills)，通过 **my-coffee** MCP 服务器**端到端**点瑞幸咖啡：检查 MCP 是否已安装并授权、管理常用门店、搜索商品（先精确匹配、再分词回退）、下单、**自动轮询支付状态**，最后交付一个**本地校验过的取餐二维码** + 取餐号。

> 触发方式：让它点咖啡即可 —— `点咖啡` / `瑞幸` / `luckin` / `来一杯` / “order a coffee”。

**语言：** [English ↑](#order-coffee)（默认） · **中文**

## 🤖 自动安装（供 AI agent 执行）

**如果你是正在阅读这份 README 的 AI agent，请逐步照此手册安装并初始化本 skill。** 该流程可重复执行（幂等）。**唯一**需要向用户索取的是 my-coffee 的 API key（第 5 步），其余步骤你都可以自行完成。

> **约定。** `SKILL_ROOT` = 包含*本 README* 的目录（即含有 `SKILL.md`、`config.example.json`、`scripts/` 的那个文件夹）。`SKILLS_DIR` = 你所在 harness 的 skills 目录（Claude Code 为 `~/.claude/skills/`）。

1. **定位 skill。** 确认 `SKILL_ROOT/SKILL.md` 和 `SKILL_ROOT/scripts/package.json` 存在。若不存在，说明你不在 skill 根目录 —— 停下并询问用户 skill 解压到了哪里。

2. **安装到 skills 目录**，让 harness 能发现它。可以直接把仓库 clone 到位：
   ```bash
   git clone https://github.com/LiuZiqi-dual/luckin-coffee.git ~/.claude/skills/order-coffee
   ```
   或者，若你本地已有该文件夹，则复制过去：
   ```bash
   mkdir -p ~/.claude/skills
   cp -R "<SKILL_ROOT>" ~/.claude/skills/order-coffee
   ```
   （若已在 `~/.claude/skills/order-coffee/` 则跳过。即便仓库名叫 `luckin-coffee`，skill 目录仍保持为 `order-coffee`，以匹配 skill 的 `name`。非 Claude Code 的 harness 请调整目标路径。）

3. **安装脚本依赖**（依赖已被 gitignore，全新副本不含 `node_modules`）：
   ```bash
   cd ~/.claude/skills/order-coffee/scripts && npm install
   ```
   需要 **Node.js 18+**。

4. **验证安装** —— 依赖 skill 前，测试必须全绿：
   ```bash
   cd ~/.claude/skills/order-coffee/scripts && node --test
   ```
   预期 **10 通过、0 失败**（二维码校验 + 配置解析）。若有失败，停下并如实上报，不要掩盖。

5. **配置 my-coffee MCP 服务器 —— 由你替用户完成，别让用户手动改配置。** 这是唯一需要人类密钥的步骤。
   - **向用户索取其 my-coffee（瑞幸）Bearer API key。** 用户若没有，带其领取：打开 **[open.lkcoffee.com/mcp](https://open.lkcoffee.com/mcp)** → 点击页面上的 **登录** 按钮并登录 → 登录后平台会**自动生成 key**，复制即可。绝不自己臆造 key；拿到之前在此暂停。
   - **由你亲自注册该服务器** —— 运行下面这条命令（URL 固定；完整 key **只**出现在这条命令里 —— 不写进 skill 文件、不写进 agent 记忆；在对话正文里要打码，如 `Bearer ****1234`）：
     ```bash
     claude mcp add --transport http my-coffee https://gwmcp.lkcoffee.com/order/user/mcp \
       --header "Authorization: Bearer <用户的KEY>"
     ```
     然后告诉用户：my-coffee 工具会在**客户端重新加载 MCP 服务器后**（通常是重启）出现，用户无需碰任何文件。若是非 Claude Code 的 harness，先备份配置文件再把下面这段写进去；实在写不了，才输出让用户自行粘贴（`~/.claude.json` / `.mcp.json`，Cursor/Copilot 为 `mcp.json`）：
     ```json
     {
       "mcpServers": {
         "my-coffee": {
           "type": "http",
           "url": "https://gwmcp.lkcoffee.com/order/user/mcp",
           "headers": { "Authorization": "Bearer <用户的KEY>" }
         }
       }
     }
     ```

6. **初始化门店配置**（创建 `~/.order-coffee/config.json`，权限 `chmod 600`，仅存门店偏好、绝不存密钥）：
   ```bash
   node ~/.claude/skills/order-coffee/scripts/resolve_config.js init
   ```
   会打印 `CONFIG>>><路径> created=true|false`。该操作幂等。

7. **完成。** 若你的 harness 缓存 skills，请重载（Claude Code 重启后加载新 MCP 服务器）。skill 首次使用时会自检 MCP（**Phase 0 preflight**），并在第一次运行时提议保存常用门店。告诉用户现在可以说 `点咖啡` 来触发。

## 环境要求

- 支持 skills + MCP 的 Claude harness（Claude Code，以及其它支持 MCP 的客户端）。
- **my-coffee** MCP 服务器（HTTP 传输）及一个 API key —— 瑞幸开放平台（[open.lkcoffee.com/mcp](https://open.lkcoffee.com/mcp)，登录后自动生成）签发的 Bearer token。
- Node.js 18+（二维码与配置脚本用到内置测试运行器和几个锁定版本的依赖）。

## 手动安装

以下是上文 [agent 手册](#-自动安装供-ai-agent-执行) 的人类可读版本。

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

## 取餐二维码的原理

MCP 返回 `takeMealCodeInfo.takeOrderId`（瑞幸 App 取餐码里编码的确切字符串）和一个人类可读的 `code`。`scripts/make_pickup_qr.js` 把 `takeOrderId` 编码为 PNG，然后**再解码回来、要求逐字符一致**才会展示图片。若校验失败，会删除坏 PNG 并降级为以文本形式发送取餐号。

## 安全与隐私

- API key **只**存在 MCP 客户端配置里；绝不写进 `config.json`、绝不存入 agent 记忆，如需回显则打码。
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
