/**
 * 发布目录与切换（ADMIN-US-217 AC#2 / AC#8）：每次发布一个不可变的 `releases/<发布 ID>/` 目录（三端产物、函数产物与清单
 * `release.json`），在线版本由 `site/` 下的三个相对符号链接决定——
 * - `current`：三端当前版本（静态站点 4510～4512 每个请求按它解析）；
 * - `staged`：正在发布的预览（4513～4515），健康检查对它进行；
 * - `functions`：函数容器挂载的函数目录（`releases/<发布 ID>/functions`）。
 * 切换先建一个临时链接再 `rename` 覆盖旧链接：POSIX 保证 rename 是原子的，读者要么看到旧版本、要么看到新版本，不会看到半成品。
 * 历史发布保留（默认最近 5 个，当前与上一个在线的发布从不删除），回滚只是把链接换回去。
 */
import { createHash, randomBytes } from 'node:crypto';
import { appendFile, lstat, mkdir, readdir, readFile, readlink, rename, rm, symlink } from 'node:fs/promises';
import path from 'node:path';

/** 发布 ID：`r<日期>-<时刻>-<提交前 7 位>`（UTC），按字典序即按时间排序。 */
export function releaseId(now, commit) {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  return `r${stamp}-${commit.slice(0, 7)}`;
}
/** 发布 ID 的格式：只允许这些字符，可以安全地拼进路径与容器环境变量。 */
export const releasePattern = /^r\d{8}-\d{6}-[0-9a-f]{7}$/;

/** 一个链接当前指向的发布 ID；链接不存在或指向别处（如空函数目录）时为 null。 */
export async function linkedRelease(site, name) {
  let target;
  try {
    target = await readlink(path.join(site, name));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  const match = /^releases\/([^/]+)(?:\/functions)?$/.exec(target);
  return match && releasePattern.test(match[1]) ? match[1] : null;
}

/** 原子地把 `site/<name>` 指向 `target`（相对 `site` 的路径）：先建临时链接，再 rename 覆盖。 */
export async function pointLink(site, name, target) {
  const temporary = path.join(site, `.${name}.${randomBytes(4).toString('hex')}`);
  await symlink(target, temporary);
  try {
    await rename(temporary, path.join(site, name));
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}
/** 把链接指向某个发布：`current` / `staged` 指向发布目录，`functions` 指向发布里的函数目录。 */
export async function pointToRelease(site, name, id) {
  if (!releasePattern.test(id)) throw new Error(`发布 ID 格式不对：${id}`);
  await pointLink(site, name, name === 'functions' ? `releases/${id}/functions` : `releases/${id}`);
}
/** 删除一个链接（不存在也算成功），只删链接本身，不碰它指向的目录。 */
export async function removeLink(site, name) {
  const file = path.join(site, name);
  const info = await lstat(file).catch(() => undefined);
  if (info && !info.isSymbolicLink()) throw new Error(`${file} 不是符号链接，拒绝删除`);
  await rm(file, { force: true });
}

/** 一棵目录树的摘要：按相对路径排序后逐个文件计入路径与内容，返回 sha256 与文件数、字节数。 */
export async function treeDigest(root) {
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  const files = entries
    .filter(entry => entry.isFile())
    .map(entry => path.relative(root, path.join(entry.parentPath, entry.name)))
    .sort();
  const hash = createHash('sha256');
  let bytes = 0;
  for (const file of files) {
    const content = await readFile(path.join(root, file));
    bytes += content.length;
    hash.update(file).update('\0').update(content).update('\0');
  }
  return { sha256: hash.digest('hex'), files: files.length, bytes };
}

/** 读一个发布的清单；不存在时为 null。 */
export async function readManifest(releases, id) {
  try {
    return JSON.parse(await readFile(path.join(releases, id, 'release.json'), 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

/** 发布记录：每次发布、失败与回滚追加一行 JSON（不含任何密钥）。 */
export async function appendRecord(file, record) {
  await mkdir(path.dirname(file), { recursive: true });
  await appendFile(file, `${JSON.stringify(record)}\n`);
}
/** 读全部发布记录（按写入顺序）。 */
export async function readRecords(file) {
  try {
    return (await readFile(file, 'utf8'))
      .split('\n')
      .filter(Boolean)
      .map(line => JSON.parse(line));
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}
/**
 * 回滚目标：在线发布（`current`）之前最近一次成功上线的发布。按记录倒序找，跳过当前发布与失败的发布；
 * 回滚记录里的目标也算上线过。没有就返回 null。
 */
export function previousRelease(records, current) {
  const online = records
    .filter(record => record.result === 'released' || record.result === 'rolled_back')
    .map(record => (record.result === 'released' ? record.release : record.to));
  for (let index = online.length - 1; index >= 0; index -= 1) if (online[index] !== current) return online[index];
  return null;
}

/**
 * 清理旧发布：按 ID 倒序保留最近 `keep` 个，`protect` 里的（当前、上一个在线、正在预览的）无论多旧都保留。返回删除的 ID。
 * @param {string} releases
 * @param {{ keep: number, protect: (string | null)[] }} options
 */
export async function pruneReleases(releases, options) {
  const ids = (await readdir(releases).catch(() => [])).filter(id => releasePattern.test(id)).sort().reverse();
  const removed = ids.slice(options.keep).filter(id => !options.protect.includes(id));
  for (const id of removed) await rm(path.join(releases, id), { recursive: true, force: true });
  return removed;
}
