import { SUPPORT_LANGUAGES } from '@aiao/code-editor';
import { LanguageDescription, type LanguageSupport } from '@codemirror/language';
import { MergeView } from '@codemirror/merge';
import { EditorState } from '@codemirror/state';
import { oneDark } from '@codemirror/theme-one-dark';
import { EditorView, highlightSpecialChars, lineNumbers } from '@codemirror/view';
import type { WorkbenchDiff, WorkbenchFileVersion } from './session.js';
import { workbenchDiffStyle } from './workbench-diff-style.js';
import { createCodicon } from './workbench-icons.js';

/** 差异窗口的布局与释放，不提供写入工作区的接口。 */
export interface WorkbenchDiffHandle {
  layout(): void;
  dispose(): void;
}

function lineEnding(text: string): string {
  const remaining = text.replace(/\r\n/g, '');
  const kinds = [
    text.includes('\r\n') ? 'CRLF' : '',
    remaining.includes('\n') ? 'LF' : '',
    remaining.includes('\r') ? 'CR' : ''
  ].filter(Boolean);
  return kinds.length ? kinds.join(' / ') : '无换行';
}

function hasBOM(text: string): boolean {
  return text.startsWith('\uFEFF');
}
function endsWithNewline(text: string): boolean {
  return /[\r\n]$/.test(text);
}

function details(version: WorkbenchFileVersion): string {
  if (!version.exists) return '文件不存在';
  if (version.binary) return `二进制 · ${version.byteLength} 字节`;
  if (version.text === null) throw new Error('差异一侧缺少可显示的文本');
  return `${version.byteLength} 字节 · ${lineEnding(version.text)} · ${hasBOM(version.text) ? 'UTF-8 BOM' : '无 BOM'} · ${endsWithNewline(version.text) ? '有末尾换行' : '无末尾换行'}`;
}

function textDocument(version: WorkbenchFileVersion): string {
  if (!version.exists) return '';
  if (version.binary || version.text === null) throw new Error('二进制或缺失文本不能作为编辑器文档');
  return version.text;
}

function formatChanges(diff: WorkbenchDiff): string[] {
  if (diff.base.binary || diff.modified.binary) return [];
  const base = textDocument(diff.base);
  const modified = textDocument(diff.modified);
  const changes: string[] = [];
  if (lineEnding(base) !== lineEnding(modified))
    changes.push(`行尾变化：${lineEnding(base)} → ${lineEnding(modified)}`);
  if (hasBOM(base) !== hasBOM(modified)) changes.push(`UTF-8 BOM ${hasBOM(modified) ? '已添加' : '已移除'}`);
  if (endsWithNewline(base) !== endsWithNewline(modified))
    changes.push(`末尾换行${endsWithNewline(modified) ? '已添加' : '已移除'}`);
  return changes;
}

function addOrigin(parent: HTMLElement, label: string, version: WorkbenchFileVersion): void {
  const side = document.createElement('div');
  side.className = 'wb-diff-origin';
  const title = document.createElement('strong');
  title.textContent = label;
  const metadata = document.createElement('small');
  metadata.textContent = details(version);
  side.append(title, metadata);
  parent.append(side);
}

async function loadLanguage(path: string, status: HTMLElement): Promise<LanguageSupport | undefined> {
  // SUPPORT_LANGUAGES 来自 @aiao/code-editor，与这里的 @codemirror/language 经 pnpm
  // 两条软链解析到同一份声明；tsc 因私有成员身份不同把它们判成两个无关类型（TS2352），
  // 结构完全一致，这里显式对齐后交给 matchFilename。
  const descriptions = SUPPORT_LANGUAGES as unknown as readonly LanguageDescription[];
  const description = LanguageDescription.matchFilename(descriptions, path);
  if (!description) {
    status.textContent = '纯文本（未匹配语法）';
    return undefined;
  }
  status.textContent = `正在加载 ${description.name} 语法…`;
  const support = await description.load();
  status.textContent = `${description.name} · 只读比较`;
  return support;
}

/** 按精确 Git 文本模型创建只读双栏比较；行尾与 BOM 差异不依赖 MergeView 的行归一化。 */
export async function createWorkbenchDiff(parent: HTMLElement, diff: WorkbenchDiff): Promise<WorkbenchDiffHandle> {
  const connected = parent.isConnected;
  const wrapper = document.createElement('section');
  wrapper.className = 'wb-diff';
  wrapper.setAttribute('aria-label', `${diff.path} 双栏差异`);
  const style = document.createElement('style');
  style.textContent = workbenchDiffStyle;
  const header = document.createElement('header');
  header.className = 'wb-diff-header';
  header.append(createCodicon('git-compare'));
  const path = document.createElement('span');
  path.className = 'wb-diff-path';
  path.textContent = diff.path;
  const labels = diff.kind === 'staged' ? ['HEAD', 'index'] : ['index', 'worktree'];
  const source = document.createElement('span');
  source.textContent = `${labels[0]} → ${labels[1]}`;
  const readonly = document.createElement('span');
  readonly.className = 'wb-diff-readonly';
  readonly.textContent = '只读';
  header.append(path, source, readonly);
  const origins = document.createElement('div');
  origins.className = 'wb-diff-origins';
  addOrigin(origins, labels[0], diff.base);
  addOrigin(origins, labels[1], diff.modified);
  const status = document.createElement('div');
  status.className = 'wb-diff-language';
  const body = document.createElement('div');
  body.className = 'wb-diff-body';
  wrapper.append(style, header, origins);
  const changes = formatChanges(diff);
  if (changes.length) {
    const notice = document.createElement('div');
    notice.className = 'wb-diff-notice';
    notice.textContent = changes.join(' · ');
    wrapper.append(notice);
  }
  wrapper.append(status, body);
  parent.replaceChildren(wrapper);
  let merge: MergeView | undefined;
  let disposed = false;
  if (diff.base.binary || diff.modified.binary) {
    status.textContent = '二进制文件不进行文本比较';
    body.classList.add('wb-diff-binary');
    for (const [index, version] of [diff.base, diff.modified].entries()) {
      const side = document.createElement('div');
      side.className = 'wb-diff-binary-side';
      side.textContent = `${labels[index]}\n${details(version)}`;
      body.append(side);
    }
  } else {
    try {
      const support = await loadLanguage(diff.path, status);
      if ((connected && !parent.isConnected) || wrapper.parentElement !== parent) {
        wrapper.remove();
        throw new DOMException('差异窗口已关闭', 'AbortError');
      }
      const extensions = [
        oneDark,
        lineNumbers(),
        highlightSpecialChars(),
        EditorState.readOnly.of(true),
        EditorView.editable.of(false),
        ...(support ? [support.extension] : [])
      ];
      merge = new MergeView({
        parent: body,
        a: {
          doc: textDocument(diff.base),
          extensions: [
            ...extensions,
            EditorView.contentAttributes.of({ 'aria-label': `${labels[0]}（只读）`, 'aria-readonly': 'true' })
          ]
        },
        b: {
          doc: textDocument(diff.modified),
          extensions: [
            ...extensions,
            EditorView.contentAttributes.of({ 'aria-label': `${labels[1]}（只读）`, 'aria-readonly': 'true' })
          ]
        },
        highlightChanges: true,
        gutter: true
      });
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') throw cause;
      const message = cause instanceof Error ? cause.message : String(cause);
      status.setAttribute('role', 'alert');
      status.textContent = `差异视图装载失败：${message}`;
      throw new Error(`差异视图装载失败：${message}`, { cause });
    }
  }
  return {
    layout() {
      if (!disposed) {
        merge?.a.requestMeasure();
        merge?.b.requestMeasure();
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      merge?.destroy();
      wrapper.remove();
    }
  };
}
