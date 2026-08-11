/**
 * 仓库 Git 统计：并发 spawn worker 进程跑 `git blame --porcelain`，
 * 聚合输出项目维度和作者维度的代码/测试/注释/文档行统计。
 *
 * 用法：node scripts/git-stats.mjs
 * 环境变量：GIT_STATS_CONCURRENCY=N 覆盖默认 worker 数（默认按 CPU 核心数 1.5 倍）。
 *
 * Rust 等价实现见 scripts/git-stats-rs/，用于大仓库需要更快统计的场景。
 */

import { execSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const workspaceRoot = dirname(__dirname);

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
  bgCyan: '\x1b[46m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m'
};

const TRACKED_EXTENSIONS = [
  '.js',
  '.mjs',
  '.jsx',
  '.ts',
  '.mts',
  '.tsx',
  '.rs',
  '.md',
  '.mdx',
  '.css',
  '.scss',
  '.html',
  '.sh',
  'Dockerfile',
  '.json',
  '.yml'
];

const TRACKED_PATHS = ['apps/', 'packages/', 'modules/', 'website/', 'benchmarks/', 'scripts/'];

function getSubfolders(dir) {
  try {
    const fullPath = join(workspaceRoot, dir);
    const items = readdirSync(fullPath);
    return items.filter(item => {
      try {
        const itemPath = join(fullPath, item);
        const stats = statSync(itemPath);
        const isDir = stats.isDirectory() && !item.startsWith('.');
        return isDir;
      } catch {
        return false;
      }
    });
  } catch {
    return [];
  }
}

const CATEGORIES = {
  apps: getSubfolders('apps'),
  packages: getSubfolders('packages'),
  modules: getSubfolders('modules'),
  others: ['website', 'benchmarks', 'scripts']
};

function getTrackedFiles() {
  const allFiles = execSync('git ls-files', { encoding: 'utf-8' }).trim().split('\n');

  return allFiles.filter(
    file => TRACKED_EXTENSIONS.some(ext => file.endsWith(ext)) && TRACKED_PATHS.some(path => file.includes(path))
  );
}

/**
 * 合并多个项目统计对象
 */
function mergeProjectStats(statsArray) {
  const merged = {};

  for (const projectStats of statsArray) {
    for (const [project, stats] of Object.entries(projectStats)) {
      if (!merged[project]) {
        merged[project] = {
          authorLines: {},
          authorTestLines: {},
          authorCommentLines: {},
          authorMarkdownLines: {}
        };
      }

      for (const [author, lines] of Object.entries(stats.authorTestLines || {})) {
        merged[project].authorTestLines[author] = (merged[project].authorTestLines[author] || 0) + lines;
      }
      for (const [author, lines] of Object.entries(stats.authorCommentLines || {})) {
        merged[project].authorCommentLines[author] = (merged[project].authorCommentLines[author] || 0) + lines;
      }
      for (const [author, lines] of Object.entries(stats.authorMarkdownLines || {})) {
        merged[project].authorMarkdownLines[author] = (merged[project].authorMarkdownLines[author] || 0) + lines;
      }
    }
  }

  return merged;
}

/**
 * 格式化数字为带千位分隔符的字符串
 */
function formatNumber(num) {
  return num.toLocaleString('en-US');
}

/**
 * 渲染进度条
 * @param {number} percent - 进度百分比 (0-1)
 * @returns {string} 格式化的进度条字符串
 */
function renderProgressBar(percent) {
  const emptyLength = barLength - filledLength;

  const filledBar = '█'.repeat(filledLength);
  const emptyBar = '░'.repeat(emptyLength);

  const percentText = `${(percent * 100).toFixed(2)}%`.padStart(7);

  return `${colors.cyan}[${colors.green}${filledBar}${colors.gray}${emptyBar}${colors.cyan}]${colors.reset} ${colors.bright}${percentText}${colors.reset}`;
}

/** 打印格式化表格，支持按列分组和总计行。 */
function printTable(title, headers, rows, totalRow = null, groupBy = null, groupStats = null) {
  const colWidths = headers.map((header, i) => {
    const maxDataWidth = Math.max(...rows.map(row => String(row[i]).length));
    const totalWidth = totalRow ? String(totalRow[i]).length : 0;
    return Math.max(header.length, maxDataWidth, totalWidth);
  });

  const tableWidth = colWidths.reduce((a, b) => a + b + 3, -1);

  console.log(`\n┌${'─'.repeat(tableWidth)}┐`);
  const titleText = `  ${title}  `;
  const padding = Math.floor((tableWidth - titleText.length) / 2);
  console.log(
    `│${' '.repeat(padding)}${colors.bright}${colors.cyan}${titleText}${colors.reset}${' '.repeat(tableWidth - padding - titleText.length)}│`
  );
  console.log(`├${'─'.repeat(tableWidth)}┤`);

  const headerRow = headers.map((h, i) => (i === 0 ? h.padEnd(colWidths[i]) : h.padStart(colWidths[i]))).join(' │ ');
  console.log(`│ ${colors.bright}${colors.white}${headerRow}${colors.reset} │`);
  console.log(`├${colWidths.map(w => '─'.repeat(w + 2)).join('┼')}┤`);

  if (groupBy) {
    let currentGroup = null;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const group = groupBy(row, i);
      if (group !== currentGroup) {
        if (currentGroup !== null) {
          console.log(`├${colWidths.map(w => '─'.repeat(w + 2)).join('┼')}┤`);
        }
        currentGroup = group;

        const categoryIcons = { apps: '🚀', packages: '📦', modules: '🧩', website: '🌐', others: '📄' };
        const icon = categoryIcons[group] || '';

        let groupRow;
        if (groupStats && groupStats[group]) {
          const stats = groupStats[group];
          const groupTitle = `${colors.bright}${colors.yellow}${icon} ${group.toUpperCase()}${colors.reset}`;
          const cells = [
            groupTitle.padEnd(colWidths[0] + 13),
            `${colors.green}${formatNumber(stats.code).padStart(colWidths[1])}${colors.reset}`,
            `${colors.blue}${formatNumber(stats.test).padStart(colWidths[2])}${colors.reset}`,
            `${colors.gray}${formatNumber(stats.comment).padStart(colWidths[3])}${colors.reset}`,
            `${colors.cyan}${formatNumber(stats.doc).padStart(colWidths[4])}${colors.reset}`,
            `${colors.magenta}${formatNumber(stats.all).padStart(colWidths[5])}${colors.reset}`,
            `${colors.yellow}${stats.percent.padStart(colWidths[6])}${colors.reset}`
          ];
          groupRow = cells.join(' │ ');
        } else {
          const groupTitle = `${colors.bright}${colors.yellow}${icon} ${group.toUpperCase()}${colors.reset}`;
          groupRow =
            groupTitle.padEnd(colWidths[0] + 13) +
            ' │ ' +
            headers
              .slice(1)
              .map((_, idx) => ''.padStart(colWidths[idx + 1]))
              .join(' │ ');
        }

        console.log(`│ ${groupRow} │`);
        console.log(`├${colWidths.map(w => '─'.repeat(w + 2)).join('┼')}┤`);
      }

      const dataRow = row
        .map((cell, colIdx) => {
          const paddedCell =
            colIdx === 0 ? String(cell).padEnd(colWidths[colIdx]) : String(cell).padStart(colWidths[colIdx]);
          const colorizers = [null, colors.green, colors.blue, colors.gray, colors.cyan, colors.magenta, colors.yellow];
          return colorizers[colIdx] ? `${colorizers[colIdx]}${paddedCell}${colors.reset}` : paddedCell;
        })
        .join(' │ ');
      console.log(`│ ${dataRow} │`);
    }
  } else {
    for (const row of rows) {
      const dataRow = row
        .map((cell, colIdx) => {
          const paddedCell =
            colIdx === 0 ? String(cell).padEnd(colWidths[colIdx]) : String(cell).padStart(colWidths[colIdx]);
          const colorizers = [null, colors.green, colors.blue, colors.gray, colors.cyan, colors.magenta, colors.yellow];
          return colorizers[colIdx] ? `${colorizers[colIdx]}${paddedCell}${colors.reset}` : paddedCell;
        })
        .join(' │ ');
      console.log(`│ ${dataRow} │`);
    }
  }

  if (totalRow) {
    console.log(`├${colWidths.map(w => '─'.repeat(w + 2)).join('┼')}┤`);
    const totalRowText = totalRow
      .map((cell, i) => {
        const paddedCell = i === 0 ? String(cell).padEnd(colWidths[i]) : String(cell).padStart(colWidths[i]);
        return `${colors.bright}${colors.white}${paddedCell}${colors.reset}`;
      })
      .join(' │ ');
    console.log(`│ ${totalRowText} │`);
  }

  console.log(`└${colWidths.map(w => '─'.repeat(w + 2)).join('┴')}┘`);
}

/** 打印项目维度和作者维度统计。 */
function printStats(projectStats) {
  const sortedProjects = Object.keys(projectStats)
    .map(project => {
      let category = 'others';
      for (const [cat, paths] of Object.entries(CATEGORIES)) {
        if (paths.some(path => project === path || project.startsWith(path + '/'))) {
          category = cat;
          break;
        }
      }

      return { project, category };
    })
    .sort((a, b) => {
      // 先按分类排序，再按项目名排序
      if (a.category !== b.category) {
        const categoryKeys = Object.keys(CATEGORIES);
        return categoryKeys.indexOf(a.category) - categoryKeys.indexOf(b.category);
      }
      return a.project.localeCompare(b.project);
    });

  // ========== 项目维度统计 ==========
  const projectRows = [];
  let totalCode = 0;
  let totalTest = 0;
  let totalComment = 0;
  let totalDoc = 0;
  let totalAll = 0;

  // 分类统计 - 动态创建
  const categoryStats = {};
  for (const cat of Object.keys(CATEGORIES)) {
    categoryStats[cat] = { code: 0, test: 0, comment: 0, doc: 0, all: 0 };
  }

  for (const { project, category } of sortedProjects) {
    const stats = projectStats[project];

    // 聚合该项目所有作者的代码
    const projectCode = Object.values(stats.authorLines).reduce((a, b) => a + b, 0);
    const projectTest = Object.values(stats.authorTestLines).reduce((a, b) => a + b, 0);
    const projectComment = Object.values(stats.authorCommentLines).reduce((a, b) => a + b, 0);
    const projectDoc = Object.values(stats.authorMarkdownLines).reduce((a, b) => a + b, 0);
    const projectAll = projectCode + projectTest + projectComment + projectDoc;

    totalCode += projectCode;
    totalTest += projectTest;
    totalComment += projectComment;
    totalDoc += projectDoc;
    totalAll += projectAll;

    // 累加到分类统计
    categoryStats[category].code += projectCode;
    categoryStats[category].test += projectTest;
    categoryStats[category].comment += projectComment;
    categoryStats[category].doc += projectDoc;
    categoryStats[category].all += projectAll;

    projectRows.push([
      project,
      projectCode,
      projectTest,
      projectComment,
      projectDoc,
      projectAll,
      category // 添加分类信息用于分组
    ]);
  }

  const formattedProjectRows = projectRows.map(row => [
    row[0],
    formatNumber(row[1]),
    formatNumber(row[2]),
    formatNumber(row[3]),
    formatNumber(row[4]),
    formatNumber(row[5]),
    ((row[5] / totalAll) * 100).toFixed(1) + '%',
    row[6]
  ]);

  const groupStatsWithPercent = {};
  for (const [category, stats] of Object.entries(categoryStats)) {
    groupStatsWithPercent[category] = {
      ...stats,
      percent: ((stats.all / totalAll) * 100).toFixed(1) + '%'
    };
  }

  const projectTotalRow = [
    'TOTAL',
    formatNumber(totalCode),
    formatNumber(totalTest),
    formatNumber(totalComment),
    formatNumber(totalDoc),
    formatNumber(totalAll),
    '100.0%'
  ];

  const rowsWithCategory = formattedProjectRows.map(row => ({
    data: row.slice(0, 7),
    category: row[7]
  }));

  printTable(
    'Statistics by Project',
    ['Project', 'Code', 'Test', 'Comment', 'Doc', 'All', '%'],
    rowsWithCategory.map(r => r.data),
    projectTotalRow,
    (row, index) => rowsWithCategory[index].category,
    groupStatsWithPercent
  );

  // ========== 作者维度统计 ==========
  const authorStats = {};

  for (const stats of Object.values(projectStats)) {
    const allAuthors = new Set([
      ...Object.keys(stats.authorLines || {}),
      ...Object.keys(stats.authorTestLines || {}),
      ...Object.keys(stats.authorCommentLines || {}),
      ...Object.keys(stats.authorMarkdownLines || {})
    ]);

    for (const author of allAuthors) {
      if (!authorStats[author]) {
        authorStats[author] = { code: 0, test: 0, comment: 0, doc: 0 };
      }
      authorStats[author].code += stats.authorLines[author] || 0;
      authorStats[author].test += stats.authorTestLines[author] || 0;
      authorStats[author].comment += stats.authorCommentLines[author] || 0;
      authorStats[author].doc += stats.authorMarkdownLines[author] || 0;
    }
  }

  const authorRows = Object.entries(authorStats)
    .map(([author, stats]) => {
      const all = stats.code + stats.test + stats.comment + stats.doc;
      return {
        author,
        code: stats.code,
        test: stats.test,
        comment: stats.comment,
        doc: stats.doc,
        all
      };
    })
    .sort((a, b) => b.all - a.all)
    .map(({ author, code, test, comment, doc, all }) => [
      author,
      formatNumber(code),
      formatNumber(test),
      formatNumber(comment),
      formatNumber(doc),
      formatNumber(all),
      ((all / totalAll) * 100).toFixed(1) + '%'
    ]);

  const authorTotalRow = [
    'TOTAL',
    formatNumber(totalCode),
    formatNumber(totalTest),
    formatNumber(totalComment),
    formatNumber(totalDoc),
    formatNumber(totalAll),
    '100.0%'
  ];

  printTable(
    'Statistics by Author',
    ['Author', 'Code', 'Test', 'Comment', 'Doc', 'All', '%'],
    authorRows,
    authorTotalRow
  );
}

async function runGitStats() {
  const files = getTrackedFiles();
  // 1.5× 超订：git blame 约四成时间在磁盘 I/O，多线程压满 CPU
  const requestedThreads = Number.parseInt(process.env.GIT_STATS_CONCURRENCY || '', 10);
  const defaultThreads = Math.max(4, Math.round(availableParallelism() * 1.5));
  const configuredThreads =
    Number.isInteger(requestedThreads) && requestedThreads > 0 ? requestedThreads : defaultThreads;
  const numThreads = Math.min(configuredThreads, files.length);
  const batchSize = 8;
  let nextFile = 0;
  let processed = 0;
  const projectStatsArray = [];

  console.time('use');

  const workerPromises = Array.from({ length: numThreads }, () => {
    return new Promise((resolve, reject) => {
      const worker = new Worker(join(__dirname, 'git-stats-worker.mjs'));

      worker.on('message', result => {
        if (result.type === 'ready') {
          processed += result.processed;
          process.stdout.write(`\rProcessing... ${renderProgressBar(processed / files.length)}`);
          const batch = files.slice(nextFile, nextFile + batchSize);
          nextFile += batch.length;
          worker.postMessage(batch.length ? batch : null);
          return;
        }

        projectStatsArray.push(result.projectStats);

        worker.terminate();
        resolve();
      });

      worker.on('error', reject);
      worker.on('exit', code => {
        if (code !== 0) {
          reject(new Error(`Worker stopped with exit code ${code}`));
        }
      });
    });
  });

  await Promise.all(workerPromises);

  // 换行，保留100%进度条显示
  process.stdout.write('\n');

  const mergedProjectStats = mergeProjectStats(projectStatsArray);
  printStats(mergedProjectStats);
  console.timeEnd('use');
}

runGitStats().catch(error => {
  console.error('Error running git stats:', error);
  process.exit(1);
});
