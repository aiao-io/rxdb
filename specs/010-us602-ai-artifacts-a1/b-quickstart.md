# US-602 B 验证记录

验证日期：2026-10-11，分支 `codex/us602-a1`。

- `pnpm nx test website`：40 项站点脚本测试通过。
- `pnpm nx build website`：通过；`website/build/llms.txt` 为 17,836 B，`website/build/llms-full.txt` 为 8,178,175 B，全文包含 3,366 个 Markdown / MDX 文件。
- 热缓存再次执行 `pnpm nx build website` 命中缓存；临时修改 `scripts/audit/templates/package-knowledge.md` 后不手动生成，直接执行同一 build，website target 未命中缓存并重新生成两个文件，模板恢复后包组合门禁通过。
- `llms.txt` 使用 `https://rxdb.aiao.io` 作为所有链接的 host；发布范围外的工作区包只标记未发布，不生成安装命令。
- `netlify.toml` 为两个文件声明 `text/plain; charset=utf-8`。生产域名 `https://rxdb.aiao.io` 的线上 smoke 尚未执行，等待部署后补验 AC#10。
