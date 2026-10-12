# Aiao 包组合知识（{{version}}）

事实摘要：`{{digest}}`。本文件由事实源、manifest、插件源码与已验证样例生成。
安装清单只包含此发布标签树里的包；工作区新增能力见同目录 JSON 的 development 部分。
情景的插件组合与下方样例取自工作区源码（样例在 CI 中执行过），可能新于此发布标签。

## 包选型

每个 local / remote 槽位分别选一个 backend；插件可以组合，框架绑定按应用框架选择。
shared-impl 与 capability 不占后端槽位，tool 与 standalone 不要求 RxDB 后端。

{{packages}}

## 组合情景

{{scenarios}}

## Node 离线样例

在 ESM 项目中运行（`package.json` 设置 `"type": "module"`），使用下面的编译选项。
下方开发依赖包含 TypeScript、Node 与 PGlite 公共声明所需的 Emscripten 类型。执行 `tsc` 后用 `node` 运行输出文件。

{{sample}}
