interface Patch {
  readonly name: string;
  readonly find: string;
  readonly replace: string;
}

/** 插在词法分析之前的展开函数：`$NAME` 与 `${NAME}`，未定义时为空串。 */
const EXPAND_HELPER = String.raw`// aiao-desktop：Vivari 的 sh 不展开变量，补上 $NAME 与 ${'$'}{NAME}（开头的 ~ 在 lex 里处理）。
function aiaoExpand(s, i) {
  if (s[i] !== '$') return null;
  const braced = s[i + 1] === '{';
  const start = braced ? i + 2 : i + 1;
  const match = /^[A-Za-z_][A-Za-z0-9_]*/.exec(s.slice(start));
  if (!match) return null;
  const end = start + match[0].length;
  if (braced && s[end] !== '}') return null;
  return { text: process.env[match[0]] || '', next: braced ? end : end - 1 };
}

function lex(s) {`;

const QUOTED = String.raw`    if (q) {
      if (c === q) { q = null; continue; }
      const qx = q === '"' ? aiaoExpand(s, i) : null;
      if (qx) { cur += qx.text; i = qx.next; continue; }
      cur += c; continue;
    }`;

const UNQUOTED = String.raw`    if (c === '~' && !has && (i + 1 === s.length || /[\s\/;|&<>]/.test(s[i + 1]))) { cur += process.env.HOME || '~'; has = true; continue; }
    const ux = aiaoExpand(s, i);
    if (ux) { cur += ux.text; if (ux.text) has = true; i = ux.next; continue; }
    cur += c; has = true;
`;

/**
 * 对 Vivari 自带 `/bin/sh.js` 的最小补丁，让终端更像真系统：
 * 开头的 `~` 与 `$NAME`、`${NAME}` 会展开（单引号里不展开），不带参数的 `cd` 回到 HOME，
 * 提示符在主目录时显示 `~`。每一处都必须恰好命中一次，否则说明 @vivari/core 变了，直接报错。
 */
const PATCHES: readonly Patch[] = [
  { name: 'variable expansion helper', find: 'function lex(s) {', replace: EXPAND_HELPER },
  {
    name: 'expand inside double quotes',
    find: '    if (q) { if (c === q) q = null; else cur += c; continue; }',
    replace: QUOTED
  },
  { name: 'expand ~ and $NAME', find: '    cur += c; has = true;\n', replace: UNQUOTED },
  {
    name: 'cd goes home',
    find: "process.chdir(args[0] || '/')",
    replace: "process.chdir(args[0] || process.env.HOME || '/')"
  },
  {
    name: 'prompt shows ~ at home',
    find: "return parts.length ? parts[parts.length - 1] : '/';",
    replace:
      "if (process.env.HOME && process.cwd() === process.env.HOME) return '~';\n    return parts.length ? parts[parts.length - 1] : '/';"
  }
];

export function patchShell(source: string): string {
  return PATCHES.reduce((text, patch) => {
    const pieces = text.split(patch.find);
    if (pieces.length !== 2)
      throw new Error(
        `Vivari shell patch "${patch.name}" matched ${pieces.length - 1} times; @vivari/core changed, update shell-patch.ts`
      );
    return pieces.join(patch.replace);
  }, source);
}
