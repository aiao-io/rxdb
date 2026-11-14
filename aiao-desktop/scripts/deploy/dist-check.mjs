// 发布前的产物检查：只读、不联网。在碰任何 wrangler 命令之前，先确认要上传的东西是对的。
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

/**
 * 解析 Cloudflare Pages 的 `_headers`：不缩进的行是 URL 规则，缩进的 `名称: 值` 行属于它上面的规则。
 *
 * @param text `_headers` 的内容
 * @returns 规则 → 响应头列表，保持文件里的顺序；同名规则合并
 * @throws 响应头前面没有规则行，或缩进行不是 `名称: 值`——报错而不是悄悄丢弃，免得配置被静默忽略
 */
export function parseHeadersFile(text) {
  const rules = new Map();
  let current;
  for (const [index, raw] of text.split(/\r?\n/).entries()) {
    const content = raw.trim();
    if (content === '' || content.startsWith('#')) continue;
    if (!/^\s/.test(raw)) {
      current = rules.get(content) ?? [];
      rules.set(content, current);
      continue;
    }
    if (!current)
      throw new Error(`_headers 第 ${index + 1} 行的响应头没有归属的规则（前面缺少 URL 规则行）：${content}`);
    const separator = content.indexOf(':');
    if (separator <= 0) throw new Error(`_headers 第 ${index + 1} 行不是「名称: 值」：${content}`);
    current.push({ name: content.slice(0, separator).trim(), value: content.slice(separator + 1).trim() });
  }
  return rules;
}

/**
 * 列出产物目录下的全部文件。
 *
 * @param distDir 产物目录；不存在时抛出 `ENOENT`
 * @returns 相对路径（`/` 分隔）与字节数，按路径的码点顺序排序
 */
export async function listDistFiles(distDir) {
  const entries = await readdir(distDir, { recursive: true, withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const absolute = path.join(entry.parentPath, entry.name);
    const relative = path.relative(distDir, absolute).split(path.sep).join('/');
    files.push({ path: relative, size: (await stat(absolute)).size });
  }
  return files.sort((a, b) =>
    a.path < b.path ? -1
    : a.path > b.path ? 1
    : 0
  );
}

/** `_headers` 里每个必需的响应头必须在全站规则 `/*` 里恰好出现一次，取值精确匹配。 */
function headerProblems(rules, requiredHeaders) {
  const problems = [];
  const named = (headers, name) => headers.filter(header => header.name.toLowerCase() === name.toLowerCase());
  for (const [name, expected] of Object.entries(requiredHeaders)) {
    const everywhere = named([...rules.values()].flat(), name);
    const sitewide = named(rules.get('/*') ?? [], name);
    if (everywhere.length > 1) {
      problems.push(
        `响应头 ${name} 在 _headers 里出现 ${everywhere.length} 次：Pages 会把同名响应头拼成 "a, b" 的无效值，只能在 /* 写一次`
      );
    } else if (sitewide.length === 0) {
      problems.push(`_headers 的 /* 规则里缺少 ${name}: ${expected}（终端依赖跨源隔离，D-05）`);
    } else if (sitewide[0].value !== expected) {
      problems.push(`_headers 里 ${name} 是 ${sitewide[0].value}，应为 ${expected}`);
    }
  }
  return problems;
}

/**
 * 检查要上传的产物：有入口页、有 `_headers`，且跨源隔离响应头齐全。
 *
 * @param options.distDir web 的构建产物目录
 * @param options.requiredHeaders 必需的响应头与取值
 * @returns 全部文件，以及问题清单（空表示可以发布）
 */
export async function checkDist({ distDir, requiredHeaders }) {
  let files;
  try {
    files = await listDistFiles(distDir);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return {
      files: [],
      problems: [`产物目录 ${distDir} 不存在，先构建 aiao-desktop-web（pnpm nx build aiao-desktop-web）`]
    };
  }
  const problems = [];
  const names = new Set(files.map(file => file.path));
  if (!names.has('index.html')) problems.push('产物里没有 index.html，先构建 aiao-desktop-web');
  if (names.has('_headers')) {
    const rules = parseHeadersFile(await readFile(path.join(distDir, '_headers'), 'utf8'));
    problems.push(...headerProblems(rules, requiredHeaders));
  } else {
    problems.push('产物里没有 _headers：它来自 apps/web/public/_headers，缺了它线上没有跨源隔离，终端无法启动');
  }
  return { files, problems };
}
