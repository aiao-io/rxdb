/**
 * 合并多个 vitest JSON 报告（coverage-final.json）为一份汇总，写入 artifacts 目录。
 */

import { realpathSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { writeValidatedCoveragePair } from './coverage-artifacts.mjs';

const readJson = async file => JSON.parse(await readFile(file, 'utf8'));

const locationKey = ({ start, end }) => `${start.line}|${start.column}|${end.line}|${end.column}`;

/**
 * 三类计数各自的配对键与所占区间，与 istanbul-lib-coverage 合并同一口径：语句按自身区间配对，函数按 `loc`，
 * 分支按第一个分支区间；找包含区间时函数、分支都用 `loc`。计数 ID 是各份报告自己编的号，不能跨报告配对。
 */
const KINDS = [
  { map: 'statementMap', hits: 's', keyOf: item => locationKey(item), regionOf: item => item },
  { map: 'fnMap', hits: 'f', keyOf: item => locationKey(item.loc), regionOf: item => item.loc },
  { map: 'branchMap', hits: 'b', keyOf: item => locationKey(item.locations[0]), regionOf: item => item.loc }
];

const addHits = (left, right) =>
  Array.isArray(left) ? left.map((hits, index) => hits + (right[index] ?? 0)) : left + right;

const distanceTo = (inner, outer) => [
  inner.start.line - outer.start.line,
  inner.start.column - outer.start.column,
  outer.end.line - inner.end.line,
  outer.end.column - inner.end.column
];

const outside = ([startLine, startColumn, endLine, endColumn]) =>
  startLine < 0 || endLine < 0 || (startLine === 0 && startColumn < 0) || (endLine === 0 && endColumn < 0);

const closer = (distance, best) =>
  distance[0] < best[0] ||
  (distance[0] === 0 && distance[1] < best[1]) ||
  distance[2] < best[2] ||
  (distance[2] === 0 && distance[3] < best[3]);

/** 另一份报告里包含该区间的最窄一项的 ID；没有就是 `undefined`。 */
const nearestContainer = (region, side, regionOf) => {
  let nearest;
  for (const [id, item] of Object.entries(side.map)) {
    const distance = distanceTo(region, regionOf(item));
    if (outside(distance) || (nearest !== undefined && !closer(distance, nearest.distance))) continue;
    nearest = { id, distance };
  }
  return nearest?.id;
};

const indexByKey = (side, keyOf) =>
  new Map(Object.entries(side.map).map(([id, item]) => [keyOf(item), { item, hits: side.hits[id] }]));

/** 只在一侧出现的区间：另一侧最近的包含区间执行过，就算它也执行过（v8 报告的子区间常只出现在一侧）。 */
const borrowHits = (entry, other, regionOf) => {
  const id = nearestContainer(regionOf(entry.item), other, regionOf);
  return id === undefined ? entry.hits : addHits(entry.hits, other.hits[id]);
};

const mergeKind = (left, right, { keyOf, regionOf }) => {
  const leftItems = indexByKey(left, keyOf);
  const rightItems = indexByKey(right, keyOf);
  const merged = [...leftItems].map(([key, entry]) => {
    const match = rightItems.get(key);
    return { item: entry.item, hits: match ? addHits(entry.hits, match.hits) : borrowHits(entry, right, regionOf) };
  });
  for (const [key, entry] of rightItems) {
    if (!leftItems.has(key)) merged.push({ item: entry.item, hits: borrowHits(entry, left, regionOf) });
  }
  return {
    map: Object.fromEntries(merged.map(({ item }, index) => [index, item])),
    hits: Object.fromEntries(merged.map(({ hits }, index) => [index, hits]))
  };
};

const sideOf = (file, kind) => ({ map: file[kind.map] ?? {}, hits: file[kind.hits] ?? {} });

/** 同一源码文件的两份报告按源位置合并：同一区间的计数相加，再统一重新编号。 */
const mergeCoverageFile = (left, right) => {
  if (left === undefined) return right;
  const merged = { ...left };
  for (const kind of KINDS) {
    const { map, hits } = mergeKind(sideOf(left, kind), sideOf(right, kind), kind);
    merged[kind.map] = map;
    merged[kind.hits] = hits;
  }
  return merged;
};

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

// 入口判定按真实路径转 file URL：路径里的空格要编码，经符号链接（如 macOS 的 /var → /private/var）启动时
// import.meta.url 是解析后的真实路径
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const nodeDir = parseArg(process.argv.slice(2), '--node', 'coverage/packages/rxdb-plugin-search');
  const browserDir = parseArg(process.argv.slice(2), '--browser', 'coverage/packages/rxdb-plugin-search-browser');
  const outputDir = parseArg(process.argv.slice(2), '--output', nodeDir);
  await mergeCoverageDirectories(nodeDir, browserDir, outputDir);
  await mergeJunitFiles(join(nodeDir, 'junit.xml'), join(browserDir, 'junit.xml'), join(outputDir, 'junit.xml'));
}
