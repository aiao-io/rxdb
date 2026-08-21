#!/usr/bin/env node
/**
 * 运行 pnpm test-all 并记录格式化日志到文件。
 *
 * 用法:
 *   node scripts/test-all-log.mjs [--targets lint,test,build] [--output file.log]
 *   node scripts/test-all-log.mjs --dry-run           # 只打印命令
 */

import chalk from 'chalk';
import { execFileSync, spawn } from 'node:child_process';
import { createWriteStream, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import { pathToFileURL } from 'node:url';
import { stripVTControlCharacters } from 'node:util';

// 与 package.json 的 `test-all` 逐个对齐（含顺序）：两处分叉过一次，
// `audit-lazy-backend` 只写在 package.json 里，用本脚本跑「全量」时那道门禁被静默跳过。
const defaultTargets = ['lint', 'typecheck', 'test', 'test-browser', 'build', 'audit-lazy-backend', 'e2e'];
const outputStyles = new Set(['stream', 'static', 'buffer']);
const defaultMaxLineLength = 4096;

export function parseArgs(argv) {
  const separator = argv.indexOf('--');
  const ownArgs = separator === -1 ? argv : argv.slice(0, separator);
  const options = {
    targets: defaultTargets,
    style: 'stream',
    verbose: false,
    bail: true,
    parallel: 4,
    maxLineLength: defaultMaxLineLength,
    log: '',
    dryRun: false,
    help: false,
    affected: true,
    extras: separator === -1 ? [] : argv.slice(separator + 1)
  };

  for (const argument of ownArgs) {
    if (argument === '--dry-run') options.dryRun = true;
    else if (argument === '--no-bail') options.bail = false;
    else if (argument === '--all') options.affected = false;
    else if (argument === '--verbose' || argument === '-v') options.verbose = true;
    else if (argument === '-h' || argument === '--help') options.help = true;
    else if (argument.startsWith('--targets=')) {
      options.targets = argument
        .slice('--targets='.length)
        .split(/[\s,]+/)
        .filter(Boolean);
    } else if (argument.startsWith('--style=')) {
      options.style = argument.slice('--style='.length);
    } else if (argument.startsWith('--log=')) {
      options.log = argument.slice('--log='.length);
    } else if (argument.startsWith('--parallel=')) {
      options.parallel = Number(argument.slice('--parallel='.length));
    } else if (argument.startsWith('--max-line=')) {
      options.maxLineLength = Number(argument.slice('--max-line='.length));
    } else {
      throw new Error(`未知参数: ${argument}`);
    }
  }

  if (options.targets.length === 0) throw new Error('至少需要一个 target');
  if (!outputStyles.has(options.style)) {
    throw new Error(`无效的输出模式: ${options.style}`);
  }
  if (!Number.isInteger(options.parallel) || options.parallel < 1) {
    throw new Error('并行数必须是正整数');
  }
  if (!Number.isInteger(options.maxLineLength) || (options.maxLineLength !== 0 && options.maxLineLength < 256)) {
    throw new Error('单行上限必须是 0 或不小于 256 的整数');
  }

  return options;
}

function help() {
  return `用法：node scripts/test-all-log.mjs [选项] [-- <extra nx flags>]

选项：
  --targets=<a,b>     限定 Nx target（默认：lint,typecheck,test,test-browser,build,audit-lazy-backend,e2e）
  --style=<mode>      Nx 输出样式：stream | static | buffer（默认：stream）
  --log=<path>        自定义日志路径（默认：./logs/test-all/YYYY-MM-DD/HHMMSS.log）
  --parallel=<n>      并行数（默认：4）
  --max-line=<n>      日志单行字符上限（默认：4096，0 表示不截断）
  --verbose, -v       打印 Nx 详细日志
  --no-bail           失败不中断，跑完全部
  --all               跑所有项目（相当于 nx run-many）
  --dry-run           只打印将要执行的命令，不执行
  -h, --help          显示帮助

默认根据 git status 选择 --untracked、--uncommitted 或 --base=main。
使用 -- 后的参数可覆盖默认 affected 范围，例如：-- --base=develop
`;
}

function defaultLogPath(now = new Date()) {
  const pad = value => String(value).padStart(2, '0');
  const date = [now.getFullYear(), pad(now.getMonth() + 1), pad(now.getDate())].join('-');
  const time = [pad(now.getHours()), pad(now.getMinutes()), pad(now.getSeconds())].join('');
  return `./logs/test-all/${date}/${time}.log`;
}

function localTimestamp(now) {
  const pad = value => String(value).padStart(2, '0');
  const offsetMinutes = -now.getTimezoneOffset();
  const offsetSign = offsetMinutes >= 0 ? '+' : '-';
  const absoluteOffset = Math.abs(offsetMinutes);
  const date = [now.getFullYear(), pad(now.getMonth() + 1), pad(now.getDate())].join('-');
  const time = [pad(now.getHours()), pad(now.getMinutes()), pad(now.getSeconds())].join(':');
  const offset = [pad(Math.floor(absoluteOffset / 60)), pad(absoluteOffset % 60)].join(':');
  return `${date} ${time} ${offsetSign}${offset}`;
}

function pickDefaultBaseFlag(cwd) {
  const status = execFileSync('git', ['status', '--porcelain'], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore']
  });
  const entries = status.split('\n').filter(Boolean);

  if (entries.some(entry => entry.startsWith('??'))) return ['--untracked'];
  if (entries.length > 0) return ['--uncommitted'];
  return ['--base=main'];
}

function buildNxArgs(options, cwd) {
  const args = [
    'exec',
    'nx',
    options.affected ? 'affected' : 'run-many',
    '-t',
    ...options.targets,
    `--output-style=${options.style}`,
    '--skipRemoteCache',
    `--parallel=${options.parallel}`
  ];

  if (options.bail) args.push('--nxBail');
  if (options.verbose) args.push('--verbose');
  if (options.affected && options.extras.length === 0) {
    args.push(...pickDefaultBaseFlag(cwd));
  }
  args.push(...options.extras);
  return args;
}

function quoteArgument(argument) {
  if (/^[\w@%+=:,./-]+$/.test(argument)) return argument;
  return `'${argument.replaceAll("'", "'\\''")}'`;
}

function formatCommand(command, args) {
  return [command, ...args].map(quoteArgument).join(' ');
}

function truncateLine(line, maxLineLength) {
  if (maxLineLength === 0 || line.length <= maxLineLength) return line;

  const headLength = Math.floor(maxLineLength * 0.75);
  const tailLength = Math.floor(maxLineLength * 0.2);
  const omitted = line.length - headLength - tailLength;
  return `${line.slice(0, headLength)} … [省略 ${omitted} 字符] … ${line.slice(-tailLength)}`;
}

function normalizeLine(line, maxLineLength = defaultMaxLineLength) {
  const withoutTrailingCarriageReturn = line.endsWith('\r') ? line.slice(0, -1) : line;
  const latestFrame = withoutTrailingCarriageReturn.split('\r').at(-1) ?? '';
  return truncateLine(stripVTControlCharacters(latestFrame).trimEnd(), maxLineLength);
}

export function formatNxLog(text, maxLineLength = defaultMaxLineLength) {
  const lines = text.split('\n').map(line => normalizeLine(line, maxLineLength));
  const formatted = [];

  for (const line of lines) {
    if (line === '' && formatted.at(-1) === '') continue;
    formatted.push(line);
  }

  while (formatted[0] === '') formatted.shift();
  while (formatted.at(-1) === '') formatted.pop();
  return `${formatted.join('\n')}\n`;
}

function readList(lines, heading) {
  const items = [];
  let active = false;

  for (const line of lines) {
    if (line.startsWith(heading)) {
      active = true;
      continue;
    }
    if (!active || line === '') continue;

    const item = line.match(/^\s*-\s*(\S+)\s*$/)?.[1];
    if (!item) break;
    items.push(item);
  }

  return [...new Set(items)];
}

function readFlakyTasks(lines) {
  const heading = lines.findIndex(line => /^\s+NX\s+Nx detected \d+ flaky tasks?$/.test(line));
  if (heading === -1) return [];

  const tasks = [];
  for (const line of lines.slice(heading + 1)) {
    if (line === '') continue;

    const task = line.match(/^\s{2}([\w@/.-]+:[\w:-]+)\s*$/)?.[1];
    if (!task) break;
    tasks.push(task);
  }
  return [...new Set(tasks)];
}

function lastMatch(lines, pattern) {
  for (let index = lines.length - 1; index >= 0; index--) {
    const match = lines[index].match(pattern);
    if (match) return match;
  }
  return null;
}

function findFailureDetails(lines, task) {
  const project = task.split(':')[0];
  const prefix = `${project}:`;
  const output = lines
    .map((line, index) => ({ line: index + 1, text: line }))
    .filter(entry => entry.text.startsWith(prefix))
    .map(entry => ({ ...entry, text: entry.text.slice(prefix.length).trimEnd() }));
  const error = output.find(entry =>
    /\berror(?:\s+TS\d+|:|\b)|AssertionError|\b(?:FAIL|blocked|failed|failure)\b/i.test(entry.text)
  );
  const test = output.map(entry => entry.text.match(/^\s*\d+\)\s+.*?›\s+(.+?)\s+─+\s*$/)?.[1]).find(Boolean);
  const source = output
    .map(entry => entry.text.match(/\bat (\/\S+\.(?:spec|test)\.[cm]?[jt]sx?:\d+:\d+)\s*$/)?.[1])
    .find(Boolean);
  const errorContext = output.map(entry => entry.text.match(/Error Context:\s+(\S+)/)?.[1]).find(Boolean);
  const trace = output.map(entry => entry.text.match(/^\s*(\S*trace\.zip)\s*$/)?.[1]).find(Boolean);

  return {
    errorLine: error?.line ?? null,
    error: error?.text.trim() ?? null,
    ...(test ? { test } : {}),
    ...(source ? { source } : {}),
    ...(errorContext ? { errorContext } : {}),
    ...(trace ? { trace } : {})
  };
}

export function parseNxLog(text) {
  const lines = text.trimEnd().split('\n');
  const tasks = new Set();
  const cachedTasks = new Set();
  const taskLines = new Map();

  lines.forEach((line, index) => {
    const task = line.match(/^>\s*nx run\s+(\S+)/)?.[1];
    if (!task) return;

    tasks.add(task);
    taskLines.set(task, index + 1);
    if (line.includes('[existing outputs match the cache, left as is]')) {
      cachedTasks.add(task);
    }
  });

  const failed = readList(lines, 'Failed tasks:');
  const skipped = readList(lines, 'Tasks not run');
  const flaky = readFlakyTasks(lines);
  const cacheMatch = lastMatch(lines, /^\s{2}Cache:\s+(\d+)\/(\d+)\s+hit\s+\((\d+)%\)$/);
  const duration = lastMatch(lines, /^\s{2}Run duration:\s+(.+)$/)?.[1].trim() ?? null;
  const started = tasks.size || Number(cacheMatch?.[2] ?? 0);
  const cached = cacheMatch ? Number(cacheMatch[1]) : cachedTasks.size;
  const succeeded = Math.max(0, started - failed.length);
  const failures = failed.map(task => ({
    task,
    line: taskLines.get(task) ?? null,
    ...findFailureDetails(lines, task)
  }));

  return {
    scheduled: started + skipped.length,
    started,
    succeeded,
    executedSucceeded: Math.max(0, succeeded - cached),
    cached,
    cacheTotal: cacheMatch ? Number(cacheMatch[2]) : null,
    cachePercent: cacheMatch ? Number(cacheMatch[3]) : null,
    failed,
    skipped,
    flaky,
    truncatedLines: lines.filter(line => /\[省略 \d+ 字符\]/.test(line)).length,
    duration,
    failures
  };
}

export function resolveNxExitCode(code, result) {
  const processCode = code ?? 1;
  return processCode === 0 && result.failed.length > 0 ? 1 : processCode;
}

function valueLine(label, value) {
  const displayWidth = [...label].reduce((width, character) => width + (character.codePointAt(0) > 0xff ? 2 : 1), 0);
  return `${label}${' '.repeat(Math.max(2, 12 - displayWidth))}${value}`;
}

function renderFailures(failures) {
  if (failures.length === 0) return [];

  return [
    '',
    '失败任务',
    '--------',
    ...failures.flatMap(({ task, line, errorLine, error, test, source, errorContext, trace }, index) => {
      const details = [`${index + 1}. ${task}`];
      if (test) details.push(`   失败用例   ${test}`);
      if (line) details.push(`   任务启动   Nx 输出第 ${line} 行`);
      if (errorLine) details.push(`   错误位置   Nx 输出第 ${errorLine} 行`);
      if (error) details.push(`   首个错误   ${error}`);
      if (source) details.push(`   源码位置   ${source}`);
      if (errorContext) details.push(`   错误上下文 ${errorContext}`);
      if (trace) details.push(`   Trace      ${trace}`);
      return details;
    })
  ];
}

function renderFlakyTasks(tasks) {
  if (tasks.length === 0) return [];
  return ['', '不稳定任务', '----------', ...tasks.map((task, index) => `${index + 1}. ${task}`)];
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
}

export function renderReport({ code, command, startedAt, result, log }) {
  const status = code === 0 ? '通过' : '失败';
  const cache =
    result.cacheTotal === null ?
      String(result.cached)
    : `${result.cached}/${result.cacheTotal} (${result.cachePercent}%)`;
  const lines = [
    '测试结果',
    '========',
    valueLine('状态', status),
    valueLine('退出码', String(code)),
    valueLine('开始时间', startedAt),
    valueLine('命令', command),
    ...(result.duration ? [valueLine('Nx 耗时', result.duration)] : []),
    valueLine('详细输出', `${log.trimEnd().split('\n').length} 行 / ${formatBytes(Buffer.byteLength(log))}`),
    ...(result.truncatedLines ? [valueLine('截断长行', String(result.truncatedLines))] : []),
    '',
    '任务统计',
    '--------',
    valueLine('计划任务', String(result.scheduled)),
    valueLine('已启动', String(result.started)),
    valueLine('成功', String(result.succeeded)),
    valueLine('执行成功', String(result.executedSucceeded)),
    valueLine('缓存命中', cache),
    valueLine('失败', String(result.failed.length)),
    valueLine('未运行', String(result.skipped.length)),
    valueLine('不稳定', String(result.flaky.length)),
    ...renderFailures(result.failures),
    ...renderFlakyTasks(result.flaky),
    '',
    'Nx 详细输出',
    '===========',
    log.trimEnd(),
    ''
  ];
  return lines.join('\n');
}

function createReadableLogWriter(stream, maxLineLength) {
  let previousLineBlank = false;

  function writeLine(line) {
    const normalized = normalizeLine(line, maxLineLength);
    if (normalized === '' && previousLineBlank) return;

    stream.write(`${normalized}\n`);
    previousLineBlank = normalized === '';
  }

  function createSink() {
    const decoder = new StringDecoder('utf8');
    let pending = '';

    return {
      write(chunk) {
        const lines = `${pending}${decoder.write(chunk)}`.split('\n');
        pending = lines.pop() ?? '';
        lines.forEach(writeLine);
      },
      end() {
        pending += decoder.end();
        if (pending !== '') writeLine(pending);
      }
    };
  }

  return { stdout: createSink(), stderr: createSink() };
}

function runNx({ args, command, cwd, logPath, startedAt, maxLineLength }) {
  mkdirSync(dirname(logPath), { recursive: true });
  const logStream = createWriteStream(logPath, { flags: 'w' });
  const writer = createReadableLogWriter(logStream, maxLineLength);
  const child = spawn(command, args, {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  child.stdout.on('data', chunk => {
    process.stdout.write(chunk);
    writer.stdout.write(chunk);
  });
  child.stderr.on('data', chunk => {
    process.stderr.write(chunk);
    writer.stderr.write(chunk);
  });

  return new Promise((resolvePromise, rejectPromise) => {
    child.once('error', rejectPromise);
    child.once('close', code => {
      writer.stdout.end();
      writer.stderr.end();
      logStream.end(() => {
        try {
          const log = formatNxLog(readFileSync(logPath, 'utf8'), maxLineLength);
          const result = parseNxLog(log);
          const effectiveCode = resolveNxExitCode(code, result);
          const report = renderReport({
            code: effectiveCode,
            command: formatCommand(command, args),
            startedAt,
            result,
            log
          });
          writeFileSync(logPath, report);
          resolvePromise({ code: effectiveCode, result, report });
        } catch (error) {
          rejectPromise(error);
        }
      });
    });
  });
}

function renderConsoleSummary({ code, result, logPath }) {
  const status = code === 0 ? chalk.green('通过') : chalk.red('失败');

  console.log();
  console.log(chalk.bold(`测试${status}（退出码 ${code}）`));
  console.log(
    `任务：${result.started} 启动，${result.succeeded} 成功` +
      `（${result.cached} 缓存），${result.failed.length} 失败，` +
      `${result.skipped.length} 未运行`
  );
  if (result.duration) console.log(`耗时：${result.duration}`);
  for (const failure of result.failures) {
    console.log(chalk.red(`失败：${failure.task}`));
    if (failure.error) console.log(`      ${failure.error}`);
  }
  console.log(`日志：${logPath}`);
}

async function main(argv = process.argv.slice(2)) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    console.error(chalk.red(error.message));
    console.error(help());
    return 2;
  }

  if (options.help) {
    console.log(help());
    return 0;
  }

  const cwd = process.cwd();
  let nxArgs;
  try {
    nxArgs = buildNxArgs(options, cwd);
  } catch (error) {
    console.error(chalk.red(`无法读取 git status：${error.message}`));
    return 2;
  }

  const command = 'pnpm';
  const fullCommand = formatCommand(command, nxArgs);
  const logPath = resolve(cwd, options.log || defaultLogPath());

  if (options.dryRun) {
    console.log(chalk.cyan('dry-run（不会执行）'));
    console.log(fullCommand);
    console.log(chalk.gray(`日志：${logPath}`));
    return 0;
  }

  const startedAt = localTimestamp(new Date());
  console.log(chalk.cyan(`执行：${fullCommand}`));
  console.log(chalk.gray(`日志：${logPath}`));
  console.log();

  try {
    const outcome = await runNx({
      args: nxArgs,
      command,
      cwd,
      logPath,
      startedAt,
      maxLineLength: options.maxLineLength
    });
    renderConsoleSummary({ ...outcome, logPath });
    return outcome.code;
  } catch (error) {
    console.error(chalk.red(`无法执行 Nx：${error.message}`));
    return 1;
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) process.exitCode = await main();
