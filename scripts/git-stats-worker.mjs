/**
 * scripts/git-stats-worker.mjs
 *
 * git-stats.mjs 的 worker：解析 `git blame --line-porcelain` 输出，按文件类型与
 * 行内容累加到传入的 `stats` 对象。被主控通过 worker_threads 拉起（一个文件批处理）。
 *
 * 不要直接执行：本身只是子线程入口。
 *
 * 关键能力：
 *   - 解析 porcelain 格式的 blame header (`commit ... 1 1 1`) 与 author 行；
 *   - 识别 Markdown 行 / 注释行 / 普通代码行；
 *   - 区分测试文件（.spec.* / .test.*），把测试行从代码行里拆开统计；
 *   - 作者名归一化（`Jimmy Liu` -> `Jimmy`）。
 */

import { execFileSync } from 'node:child_process';
import { parentPort } from 'node:worker_threads';

// 测试文件的后缀名：单独计入测试行而不是代码行。
const TEST_FILE_EXTENSIONS = [
  '.spec.js',
  '.spec.jsx',
  '.spec.ts',
  '.spec.tsx',
  '.test.js',
  '.test.jsx',
  '.test.ts',
  '.test.tsx'
];

// Markdown 文件后缀名：行内容直接计入 Markdown 行，不走注释识别。
const DOC_FILE_EXTENSIONS = ['.md', '.mdx'];

// 作者名映射表：把不同形式但同人的提交归并到一个作者名下，避免统计被拆碎。
const AUTHOR_NAME_MAP = {
  Jimmy: 'Jimmy',
  '“Jimmy”': 'Jimmy',
  'Jimmy Liu': 'Jimmy'
};

/**
 * 从文件路径提取项目名。
 * 优先级：website/ benchmarks/ scripts/ 视为顶层项目；其他取路径第一段作为包名。
 * @param {string} filePath 仓库相对路径
 * @returns {string}
 */
function getProjectFromPath(filePath) {
  if (filePath.startsWith('website/')) {
    return 'website';
  }
  if (filePath.startsWith('benchmarks/')) {
    return 'benchmarks';
  }
  if (filePath.startsWith('scripts/')) {
    return 'scripts';
  }
  const parts = filePath.split('/');
  return parts[1] || 'others';
}

/**
 * 通过 AUTHOR_NAME_MAP 归一作者名；未匹配时原样返回。
 * @param {string} authorName
 * @returns {string}
 */
function normalizeAuthorName(authorName) {
  return AUTHOR_NAME_MAP[authorName] || authorName;
}

/**
 * 后缀名命中 TEST_FILE_EXTENSIONS 即视为测试文件。
 * @param {string} filePath
 * @returns {boolean}
 */
function isTestFile(filePath) {
  return TEST_FILE_EXTENSIONS.some(ext => filePath.endsWith(ext));
}

/**
 * 后缀名命中 DOC_FILE_EXTENSIONS（.md / .mdx）即视为 Markdown 文件。
 * @param {string} filePath
 * @returns {boolean}
 */
function isMarkdownFile(filePath) {
  return DOC_FILE_EXTENSIONS.some(ext => filePath.endsWith(ext));
}

/**
 * 启发式判断单行内容是否属于注释：
 *   - 单行：`//`、`#`（shell / yaml / python）；
 *   - 块注释：行首斜杠星、行尾星斜杠、中间星号、HTML 注释开头与结尾。
 * 这只是统计用，不追求完整 AST 级精度 —— 目标是给出有意义的「注释占比」。
 * @param {string} line 已去除前导 Tab 的 blame 行内容
 * @returns {boolean}
 */
function isCommentLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return false;

  // 单行注释: //, #
  if (trimmed.startsWith('//') || trimmed.startsWith('#')) {
    return true;
  }

  // 块注释: /*, */, *, <!-- -->
  if (
    trimmed.startsWith('/*') ||
    trimmed.startsWith('*') ||
    trimmed.endsWith('*/') ||
    trimmed.startsWith('<!--') ||
    trimmed.endsWith('-->')
  ) {
    return true;
  }

  return false;
}

/**
 * 解析单个文件的 `git blame --line-porcelain` 输出，累加到传入的 stats 对象。
 * 同时被 worker 内联调用，以及被 `git-stats-worker.test.mjs` 直接覆盖测试。
 * @param {string} file 仓库相对路径（用于判断 file type）
 * @param {string} blameOutput git blame porcelain 原始输出
 * @param {{ authorLines: Record<string, number>, authorTestLines: Record<string, number>, authorCommentLines: Record<string, number>, authorMarkdownLines: Record<string, number> }} stats 累加目标
 */
export function parseBlameOutput(file, blameOutput, stats) {
  const commitAuthors = new Map();
  const isMd = isMarkdownFile(file);
  const isTest = isTestFile(file);
  let currentCommit = null;
  let currentAuthor = null;

  for (const line of blameOutput.split('\n')) {
    const header = /^(\^?[0-9a-f]{40}) \d+ \d+(?: \d+)?$/.exec(line);
    if (header) {
      currentCommit = header[1];
      currentAuthor = commitAuthors.get(currentCommit) || null;
      continue;
    }
    if (line.startsWith('author ')) {
      currentAuthor = normalizeAuthorName(line.slice(7).trim());
      commitAuthors.set(currentCommit, currentAuthor);
      continue;
    }
    if (!line.startsWith('\t') || !currentAuthor) {
      continue;
    }

    const codeLine = line.slice(1);
    if (isMd) {
      if (codeLine.trim()) {
        stats.authorMarkdownLines[currentAuthor] = (stats.authorMarkdownLines[currentAuthor] || 0) + 1;
      }
      continue;
    }
    if (isCommentLine(codeLine)) {
      stats.authorCommentLines[currentAuthor] = (stats.authorCommentLines[currentAuthor] || 0) + 1;
      continue;
    }
    const targetLines = isTest ? stats.authorTestLines : stats.authorLines;
    targetLines[currentAuthor] = (targetLines[currentAuthor] || 0) + 1;
  }
}

/**
 * 处理单个文件：调 git blame 并把结果累加到对应项目的 stats 中。
 * blame 失败（如二进制文件、文件被删除）静默跳过，保证整批不被中断。
 * @param {string} file 仓库相对路径
 * @param {Record<string, ReturnType<typeof createProjectStats>>} projectStats 累加目标（按项目名索引）
 */
function processIndividualFile(file, projectStats) {
  const project = getProjectFromPath(file);
  try {
    const blameOutput = execFileSync('git', ['blame', '--porcelain', '--', file], {
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024
    });

    if (!projectStats[project]) {
      projectStats[project] = {
        authorLines: {},
        authorTestLines: {},
        authorCommentLines: {},
        authorMarkdownLines: {}
      };
    }

    parseBlameOutput(file, blameOutput, projectStats[project]);
  } catch {
    // 静默处理错误
  }
}

// 接收主控消息：
//   - 数组（文件批次）→ 处理完后回 'ready'，准备接下一批；
//   - null → 把当前累计的 projectStats 发回去并结束。
// parentPort 可选链保护：直接 `node scripts/git-stats-worker.mjs` 时不会崩。
const projectStats = {};

parentPort?.on('message', files => {
  if (files === null) {
    parentPort.postMessage({ type: 'result', projectStats });
    return;
  }

  files.forEach(file => processIndividualFile(file, projectStats));
  parentPort.postMessage({ type: 'ready', processed: files.length });
});

// 启动即声明空闲（processed: 0），让主控知道可以开始派活。
parentPort?.postMessage({ type: 'ready', processed: 0 });
