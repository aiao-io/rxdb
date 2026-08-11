/**
 * 合并多个 vitest JSON 报告（coverage-final.json）为一份汇总，写入 artifacts 目录。
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { writeValidatedCoveragePair } from './coverage-artifacts.mjs';

const readJson = async file => JSON.parse(await readFile(file, 'utf8'));

const mergeCounters = (left, right) => {
  if (Array.isArray(left) || Array.isArray(right)) {
    const leftArray = Array.isArray(left) ? left : [];
    const rightArray = Array.isArray(right) ? right : [];
    const length = Math.max(leftArray.length, rightArray.length);
    return Array.from({ length }, (_, index) => (leftArray[index] ?? 0) + (rightArray[index] ?? 0));
  }

  const result = {};
  const keys = new Set([...Object.keys(left ?? {}), ...Object.keys(right ?? {})]);
  for (const key of keys) {
    const leftValue = left?.[key];
    const rightValue = right?.[key];
    result[key] =
      Array.isArray(leftValue) || Array.isArray(rightValue) ?
        mergeCounters(leftValue, rightValue)
      : (leftValue ?? 0) + (rightValue ?? 0);
  }
  return result;
};

const mergeCoverageFile = (left, right) => ({
  ...(left ?? right),
  path: left?.path ?? right?.path,
  statementMap: left?.statementMap ?? right?.statementMap ?? {},
  fnMap: left?.fnMap ?? right?.fnMap ?? {},
  branchMap: left?.branchMap ?? right?.branchMap ?? {},
  s: mergeCounters(left?.s, right?.s),
  f: mergeCounters(left?.f, right?.f),
  b: mergeCounters(left?.b, right?.b),
  meta: left?.meta ?? right?.meta
});

const mergeCoverageMaps = (left, right) => {
  const merged = new Map();
  for (const [key, value] of Object.entries(left)) merged.set(value.path ?? key, value);
  for (const [key, value] of Object.entries(right)) {
    const path = value.path ?? key;
    merged.set(path, mergeCoverageFile(merged.get(path), value));
  }
  return Object.fromEntries(merged);
};

const metric = (total, covered) => ({
  total,
  covered,
  skipped: 0,
  pct: total === 0 ? 100 : Math.round((covered / total) * 1000) / 10
});

const fileSummary = file => {
  const statementCounts = Object.values(file.s ?? {});
  const functionCounts = Object.values(file.f ?? {});
  const branchCounts = Object.values(file.b ?? {}).flatMap(value => value);
  const lineCounts = new Map();
  for (const [id, location] of Object.entries(file.statementMap ?? {})) {
    const line = location.start.line;
    lineCounts.set(line, (lineCounts.get(line) ?? 0) + (file.s?.[id] ?? 0));
  }

  return {
    lines: metric(lineCounts.size, [...lineCounts.values()].filter(count => count > 0).length),
    statements: metric(statementCounts.length, statementCounts.filter(count => count > 0).length),
    functions: metric(functionCounts.length, functionCounts.filter(count => count > 0).length),
    branches: metric(branchCounts.length, branchCounts.filter(count => count > 0).length)
  };
};

const mergeSummaries = summaries => {
  const totals = {
    lines: [0, 0],
    statements: [0, 0],
    functions: [0, 0],
    branches: [0, 0]
  };
  for (const summary of summaries) {
    for (const key of Object.keys(totals)) {
      totals[key][0] += summary[key].total;
      totals[key][1] += summary[key].covered;
    }
  }
  return Object.fromEntries(Object.entries(totals).map(([key, [total, covered]]) => [key, metric(total, covered)]));
};

/** 合并 Node/browser 两次 Vitest 的 Istanbul JSON 产物。 */
export const mergeCoverageDirectories = async (nodeDir, browserDir, outputDir) => {
  const nodeCoverage = await readJson(join(nodeDir, 'coverage-final.json'));
  const browserCoverage = await readJson(join(browserDir, 'coverage-final.json'));
  const merged = mergeCoverageMaps(nodeCoverage, browserCoverage);
  const summaries = Object.values(merged).map(fileSummary);
  const summary = {
    ...Object.fromEntries(Object.entries(merged).map(([path, file]) => [path, fileSummary(file)])),
    total: mergeSummaries(summaries)
  };
  await writeValidatedCoveragePair(outputDir, merged, summary);
  return summary;
};

const parseRootAttributes = xml => {
  const match = xml.match(/<testsuites\b([^>]*)>/);
  const attrs = {};
  for (const [, key, value] of match?.[1].matchAll(/([A-Za-z_:][\w:.-]*)="([^"]*)"/g) ?? []) attrs[key] = value;
  return attrs;
};

const numericAttribute = (attrs, key) => Number.parseFloat(attrs[key] ?? '0') || 0;

const extractSuites = xml => [...xml.matchAll(/<testsuite\b[\s\S]*?<\/testsuite>/g)].map(match => match[0]);

/** 合并两份 Vitest JUnit 根节点和 testsuite。 */
export const mergeJunitFiles = async (nodeFile, browserFile, outputFile) => {
  const [nodeXml, browserXml] = await Promise.all([readFile(nodeFile, 'utf8'), readFile(browserFile, 'utf8')]);
  const nodeAttrs = parseRootAttributes(nodeXml);
  const browserAttrs = parseRootAttributes(browserXml);
  const attrs = {
    name: nodeAttrs.name ?? browserAttrs.name ?? 'vitest tests',
    tests: numericAttribute(nodeAttrs, 'tests') + numericAttribute(browserAttrs, 'tests'),
    failures: numericAttribute(nodeAttrs, 'failures') + numericAttribute(browserAttrs, 'failures'),
    errors: numericAttribute(nodeAttrs, 'errors') + numericAttribute(browserAttrs, 'errors'),
    time: numericAttribute(nodeAttrs, 'time') + numericAttribute(browserAttrs, 'time')
  };
  const suites = [...extractSuites(nodeXml), ...extractSuites(browserXml)];
  const root = `<?xml version="1.0" encoding="UTF-8" ?>\n<testsuites name="${attrs.name}" tests="${attrs.tests}" failures="${attrs.failures}" errors="${attrs.errors}" time="${attrs.time}">\n${suites.join('\n')}\n</testsuites>\n`;
  await mkdir(dirname(outputFile), { recursive: true });
  await writeFile(outputFile, root);
};

const parseArg = (args, name, fallback) => {
  const value = args.find(arg => arg.startsWith(`${name}=`));
  return value ? value.slice(name.length + 1) : fallback;
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const nodeDir = parseArg(process.argv.slice(2), '--node', 'coverage/packages/rxdb-plugin-search');
  const browserDir = parseArg(process.argv.slice(2), '--browser', 'coverage/packages/rxdb-plugin-search-browser');
  const outputDir = parseArg(process.argv.slice(2), '--output', nodeDir);
  await mergeCoverageDirectories(nodeDir, browserDir, outputDir);
  await mergeJunitFiles(join(nodeDir, 'junit.xml'), join(browserDir, 'junit.xml'), join(outputDir, 'junit.xml'));
}
