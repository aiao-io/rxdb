# @aiao/code-editor-angular

基于 CodeMirror 6 的 standalone Angular 代码编辑器，支持 Angular Forms、动态语言、主题与编辑状态配置。

## 安装

```bash
pnpm add @aiao/code-editor @aiao/code-editor-angular
```

`@aiao/code-editor` 是 peer 依赖，且下界跟随本包版本抬升 —— 本包生成的 `.d.ts`
直接引用核心包的 `CodeEditorLanguageDescription` / `ResolvedCodeEditorLanguage` /
`CodeEditorLanguageError`，装到更旧的核心包上会在消费者侧编译失败。

## 使用

```ts
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CodeEditor } from '@aiao/code-editor-angular';

@Component({
  selector: 'app-root',
  imports: [FormsModule, CodeEditor],
  template: `
    <ao-code-editor [(ngModel)]="code" (aoChange)="onCodeChange($event)" language="typescript" theme="dark" />
  `
})
export class AppComponent {
  code = '';

  onCodeChange(value: string): void {
    console.log(value);
  }
}
```

## Reactive Forms

```ts
import { Component } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { CodeEditor } from '@aiao/code-editor-angular';

@Component({
  selector: 'app-editor',
  imports: [ReactiveFormsModule, CodeEditor],
  template: `<ao-code-editor [formControl]="code" label="SQL 查询" language="sql" />`
})
export class EditorComponent {
  code = new FormControl('select 1', { nonNullable: true });
}
```

`writeValue()` 只接受 `string | null | undefined`（`null` / `undefined` 规整成空串）。
`FormControl` 里放别的类型会立刻抛 `TypeError`，而不是等到 CodeMirror 内部炸掉。

## Inputs

| 名称                  | 类型                                       | 默认值              | 说明                                                    |
| --------------------- | ------------------------------------------ | ------------------- | ------------------------------------------------------- |
| `value`               | `string`                                   | `''`                | 文档内容；与 `ngModel` / `formControl` 同用时以表单为准 |
| `language`            | `string`                                   | `'sql'`             | 语言名或别名；`''` 与 `'plaintext'` 表示不高亮          |
| `languages`           | `readonly CodeEditorLanguageDescription[]` | `SUPPORT_LANGUAGES` | 候选语言列表                                            |
| `theme`               | `'light' \| 'dark'`                        | `'light'`           | 主题                                                    |
| `setup`               | `'basic' \| 'minimal' \| null`             | `'basic'`           | CodeMirror 预设扩展集                                   |
| `placeholder`         | `string`                                   | `''`                | 空文档时的占位文本                                      |
| `disabled`            | `boolean`                                  | `false`             | 禁用（只读且不可聚焦）                                  |
| `readonly`            | `boolean`                                  | `false`             | 只读（仍可聚焦与选择）                                  |
| `lineWrapping`        | `boolean`                                  | `false`             | 自动换行                                                |
| `indentUnit`          | `string`                                   | `'  '`              | 一级缩进使用的字符串                                    |
| `indentWithTab`       | `boolean`                                  | `false`             | 允许 Tab 缩进（会牺牲键盘可达性）                       |
| `highlightWhitespace` | `boolean`                                  | `false`             | 显示空白字符                                            |
| `label`               | `string`                                   | `''`                | 内部 textbox 的 `aria-label`                            |
| `labelledBy`          | `string`                                   | `''`                | 内部 textbox 的 `aria-labelledby`                       |
| `describedBy`         | `string`                                   | `''`                | 内部 textbox 的 `aria-describedby`                      |
| `autoFocus`           | `boolean`                                  | `false`             | **仅初始化生效**，见下                                  |
| `root`                | `Document \| ShadowRoot`                   | —                   | **仅初始化生效**，见下                                  |

三个 `aria-*` 输入落在 CodeMirror 的 `.cm-content` 上 —— 承担 `role="textbox"` 的是它，
不是宿主元素。空串按「未设置」处理，不产出属性。

## Outputs

| 名称              | 载荷                      | 说明                                                       |
| ----------------- | ------------------------- | ---------------------------------------------------------- |
| `aoChange`        | `string`                  | 用户编辑导致的内容变化；程序化写入**不**触发               |
| `aoFocus`         | `void`                    | 获得焦点                                                   |
| `aoBlur`          | `void`                    | 失去焦点，同时触发表单 `touched`                           |
| `aoLanguageError` | `CodeEditorLanguageError` | 语言查不到（`not-found`）或 `load()` 失败（`load-failed`） |

语言失败时编辑器**降级为纯文本**并继续可用，宿主可据此重试或提示：

```html
<ao-code-editor (aoLanguageError)="onLanguageError($event)" [language]="lang" />
```

```ts
onLanguageError(error: CodeEditorLanguageError): void {
  if (error.kind === 'load-failed') this.retry(error.language);
}
```

## 仅初始化生效的输入

`autoFocus` 与 `root` 只在 `ngOnInit` 构造 `EditorView` 时读取一次，后续变更被忽略 ——
两者都对应 CodeMirror 无法重配置的构造期决策。需要改 `root` 时请用 `@if` 重建组件。

`autoFocus` 还受访问状态约束：`disabled` 或 `readonly` 为真时**不**抢焦点，
否则用户得到一个无法输入、也无从得知为什么无法输入的控件。

## disabled 与 value 的优先级

`disabled` 有**两条独立来源**，任一为真即禁用：

1. 模板上的 `[disabled]` 输入；
2. 表单调用的 `setDisabledState()`（`FormControl.disable()` / `.enable()`）。

它们不互相覆盖 —— Reactive Forms 在控件 enabled 时会主动调 `setDisabledState(false)`，
若两者压成一个值，模板上的 `[disabled]="true"` 会被静默抹掉。要恢复可编辑，两条都得放开。

`value` 与表单同时存在时以表单为准：`ngModel` / `formControl` 经 `writeValue()` 写入，
时序上晚于 `value` 输入。只用 `value` 而不接表单时，它是普通的单向输入 ——
组件不会把用户编辑写回该输入，请配合 `(aoChange)` 自行回填。

## 命令式 handle

组件实例暴露与 React / Vue **同名同义**的四个成员：

| 成员      | 类型                  | 说明                                             |
| --------- | --------------------- | ------------------------------------------------ |
| `view`    | `EditorView \| null`  | 底层 CodeMirror 实例；未初始化 / 已销毁为 `null` |
| `host`    | `HTMLElement \| null` | CodeMirror 挂载所在的元素；同上                  |
| `focus()` | `void`                | 把键盘焦点交给编辑器；未初始化时空操作           |
| `blur()`  | `void`                | 移开键盘焦点；未初始化时空操作                   |

```ts
@Component({
  imports: [CodeEditor],
  template: `<ao-code-editor #editor language="sql" />`
})
export class HostComponent {
  private readonly editor = viewChild.required(CodeEditor);

  jumpIn(): void {
    this.editor().focus();
  }
}
```

`setExtensions(extensions)` 是装入自定义 CodeMirror 扩展的受支持入口，
**整体替换**上一次传入的那批，且只影响消费者自己的槽 —— 组件的主题、语言、
只读状态与变更回调都不受影响。

`setLanguage(name)` 是**无条件重载**入口，供宿主换掉了同名描述背后的 loader 实现时使用；
日常切换语言请改 `language` 输入（它会跳过等价的重复加载）。

其余命令式 setter（`setValue` / `setTheme` / `setReadonly` / `setEditable` /
`setPlaceholder` / `setIndentUnit` / `setIndentWithTab` / `setLineWrapping` /
`setHighlightWhitespace`）均已标记 `@deprecated`：它们与同名输入是双轨，
直接调用会在下一次输入同步时被覆盖。请改用对应输入，这些方法将在下一个主版本移除。
