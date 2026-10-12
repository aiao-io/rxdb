# Package knowledge contract

事实文件 schemaVersion=1，release 为登记的正式版发布标签，packages 与 scenarios 为数组，按 name/id 稳定排序。每包有 description/role/hosts/slots/framework，非 binding 的 framework 为 null。只有 backend 可有槽位。已删目录、仍在登记发布里的包标 retired: true，情景不得引用。

审计顶层 pnpm audit:package-graph 执行 --check：真实扫描与事实校验；生成版本化 JSON/Markdown 的期望值并与提交文件逐字节对比。任一错误 exit 1，包含来源与包/情景标识。

--update 只在全部事实、依赖和发布投递校验通过后写生成物。不将工作区未发布情景或包写成发布安装清单。

插件注册名从源码读；入口插件按源码 inject 递归闭合。发布投递仅包含全部必需包均存在于 release tree 的情景。文档 QueryCache 清单从情景闭包计算。

离线样例安装清单声明 core/pglite/history，样例 import 的包必须都在清单里，版本由生成器读取 release manifests，编译选项由样例 tsconfig.json 提供。

站点 llms.txt / llms-full.txt 只读提交的 package-knowledge.json，不重新推导。
