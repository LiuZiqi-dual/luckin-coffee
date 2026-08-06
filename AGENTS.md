# Agent setup — order-coffee skill

Runbook to install and initialize this skill. Idempotent; safe to re-run. English-only, for agents. The only human input needed is the my-coffee API key (step 5).

`SKILL_ROOT` = the dir holding `SKILL.md` + `scripts/`. `SKILLS_DIR` = your harness's skills dir (Claude Code: `~/.claude/skills/`). Examples use `~/.claude/skills/order-coffee`; adjust for other harnesses.

1. **Locate.** Confirm `SKILL_ROOT/SKILL.md` and `SKILL_ROOT/scripts/package.json` exist. If not, you're not in the skill root — ask the human where it was unpacked.

2. **Install into SKILLS_DIR.** Clone into place (or `cp -R` the folder if you already have it locally). Skip if already there. Keep the dir named `order-coffee` (matches the skill's `name`) even though the repo is `luckin-coffee`.
   ```bash
   git clone https://github.com/LiuZiqi-dual/luckin-coffee.git ~/.claude/skills/order-coffee
   ```

3. **Install deps** (gitignored — a fresh copy has none). Needs Node.js 18+.
   ```bash
   cd ~/.claude/skills/order-coffee/scripts && npm install
   ```

4. **Verify** — must be green before you rely on the skill; expect **10 passing, 0 failing**. If any fail, stop and report; don't paper over it.
   ```bash
   cd ~/.claude/skills/order-coffee/scripts && node --test
   ```

5. **Configure the my-coffee MCP — do it for the user; don't make them hand-edit config.**
   - Ask the human for their my-coffee (Luckin) Bearer key. If they lack one: open `https://open.lkcoffee.com/mcp` → click 登录 (Log in) and sign in → after login the key is auto-generated; copy it. Never invent a key; pause until they provide it.
   - Register it yourself. The full key goes **only** into this command — never into skill files or memory; mask it in chat prose (`Bearer ****1234`).
     ```bash
     claude mcp add --transport http my-coffee https://gwmcp.lkcoffee.com/order/user/mcp \
       --header "Authorization: Bearer <THEIR_KEY>"
     ```
     Tools appear after the client reloads MCP servers (usually a restart). Non–Claude Code harness: back up the config file and write this block, else output it for them to paste (`~/.claude.json` / `.mcp.json`, Cursor/Copilot `mcp.json`):
     ```json
     { "mcpServers": { "my-coffee": { "type": "http", "url": "https://gwmcp.lkcoffee.com/order/user/mcp", "headers": { "Authorization": "Bearer <THEIR_KEY>" } } } }
     ```
   - **No-config alternative:** if you can't register or restart, skip this step and use the curl fallback — set `LUCKIN_MCP_TOKEN` and call tools via `scripts/mcp_curl.sh` (see SKILL.md Phase 0.5).

6. **Init store config** (creates `~/.order-coffee/config.json`, `chmod 600`, store prefs only — never secrets). Idempotent; prints `CONFIG>>><path> created=true|false`.
   ```bash
   node ~/.claude/skills/order-coffee/scripts/resolve_config.js init
   ```

7. **Done.** Reload skills if your harness caches them. The skill self-checks the MCP on first use (Phase 0 preflight) and offers to save a favorite store the first time. Tell the human they can now say `点咖啡` / "order a coffee".

Skill behavior and ordering rules live in `SKILL.md`; human-facing docs in `README.md`.
