import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Aiao Code 在清单里的最小能力（ADESK-US-206）：窗口与剪贴板读写。成功路径的冒烟需要 notification 与 filesystem，
 * 但**不能**为了方便测试改清单——所以在测试里改写构建产物，只对本次浏览器上下文生效，清单源码不动。
 */
export const AIAO_CODE_CAPABILITIES = Object.freeze(['window', 'clipboard:read', 'clipboard:write']);

/** 产物里清单的 `capabilities` 数组字面量；压缩后引号可能是反引号、双引号或单引号。 */
const ARRAY = /capabilities:\[([^\]]*)\]/g;
/** 清单对象里数组前面这一段应当能认出是 Aiao Code 的登记（登记 id 与显示名）。 */
const CONTEXT_WINDOW = 800;

const itemsOf = text => [...text.matchAll(/(["'`])([^"'`]+)\1/g)].map(match => match[2]);

/**
 * 把 Aiao Code 清单里的 `capabilities` 数组原位换成 `capabilities`。**必须恰好匹配到一处**，并且那一处就是 Aiao Code 当前的
 * 最小清单：匹配不到、匹配到多处、匹配到的不是 Aiao Code 的清单，都直接抛错，不静默通过。
 *
 * @param {readonly { file: string, source: string }[]} scripts 产物根目录下的脚本
 * @param {readonly string[]} capabilities 要授予的能力全集
 * @returns {{ file: string, source: string, original: readonly string[] }} 改写后的脚本与原来的能力
 */
export function rewriteCapabilities(scripts, capabilities) {
  const hits = scripts.flatMap(({ file, source }) =>
    [...source.matchAll(ARRAY)].map(match => ({ file, source, match }))
  );
  if (hits.length !== 1)
    throw new Error(
      `产物里应该恰有一处 capabilities 数组字面量（Aiao Code 的清单），找到 ${hits.length} 处：${
        hits.map(hit => `${hit.file} ${hit.match[0]}`).join('；') || '没有'
      }（清单的写法或位置变了？）`
    );
  const [{ file, source, match }] = hits;
  const original = itemsOf(match[1]);
  if (JSON.stringify(original) !== JSON.stringify(AIAO_CODE_CAPABILITIES))
    throw new Error(`匹配到的清单不是 Aiao Code 的最小清单：${match[0]}（期望 ${AIAO_CODE_CAPABILITIES.join('、')}）`);
  const before = source.slice(Math.max(0, match.index - CONTEXT_WINDOW), match.index);
  if (!/vscode/.test(before) || !/Aiao Code/.test(before))
    throw new Error(`匹配到的 capabilities 数组前面看不到 Aiao Code 的登记（${file}）`);
  const quote = /["'`]/.exec(match[1])?.[0] ?? '`';
  const next = `capabilities:[${capabilities.map(name => `${quote}${name}${quote}`).join(',')}]`;
  return { file, original, source: source.slice(0, match.index) + next + source.slice(match.index + match[0].length) };
}

/** 产物根目录下的全部脚本（含懒加载的 chunk）。 */
function scriptsIn(distRoot) {
  return readdirSync(distRoot)
    .filter(name => name.endsWith('.js'))
    .map(file => ({ file, source: readFileSync(join(distRoot, file), 'utf8') }));
}

/**
 * 在浏览器上下文里给 Aiao Code 授予更多清单能力（`context.route` 拦截桌面的主脚本，把清单里的 `capabilities` 数组换掉）。
 * 之后**重新加载桌面页**才生效。找不到唯一的一处就在这里抛错（见 {@link rewriteCapabilities}），不会带着没改成的清单继续跑。
 * 浏览器上下文关闭时路由随之消失；没改写的构建（别的检查组、别的上下文）保持最小清单。
 *
 * @param {{ context: import('playwright').BrowserContext, origin: string, distRoot: string }} session
 * @param {readonly string[]} capabilities 要授予的能力全集（含原来的）
 */
export async function grantCapabilities(session, capabilities) {
  const { context, origin, distRoot } = session;
  const { file, source, original } = rewriteCapabilities(scriptsIn(distRoot), capabilities);
  await context.route(
    url => url.origin === origin && url.pathname === `/${file}`,
    async route => {
      const response = await route.fetch();
      await route.fulfill({ response, body: session.aiaoCode.rewriteSource(source) });
    }
  );
  return { file, original, granted: [...capabilities] };
}
