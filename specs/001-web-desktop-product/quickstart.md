# 构建与验收

前置：当前锁文件 Node 26+、pnpm 12、依赖已安装；支持 IndexedDB、Web Locks、BroadcastChannel、MessageChannel 与 customElements 的桌面安全上下文。

```bash
NX_NO_CLOUD=true NX_DAEMON=false NX_ISOLATE_PLUGINS=false pnpm nx serve web-desktop
NX_NO_CLOUD=true NX_DAEMON=false NX_ISOLATE_PLUGINS=false pnpm nx run web-desktop:requirements-check
NX_NO_CLOUD=true NX_DAEMON=false NX_ISOLATE_PLUGINS=false pnpm nx run-many -p web-desktop -t lint,typecheck,test,build --parallel=1
NX_NO_CLOUD=true NX_DAEMON=false NX_ISOLATE_PLUGINS=false pnpm nx run web-desktop:test --coverage
NX_NO_CLOUD=true NX_DAEMON=false NX_ISOLATE_PLUGINS=false pnpm nx run web-desktop:e2e
NX_NO_CLOUD=true NX_DAEMON=false NX_ISOLATE_PLUGINS=false pnpm nx run orbit:test --coverage
```

1. 全新浏览器选择模式，进入真实空桌面；从文件管理器新建文本、编辑中文、保存、取消关闭、关闭再重开，对比文件字节。
2. 两个编辑实例保存同一文件：第二个必须冲突；切换模式 20 次不重载实例；macOS 关闭保留运行，Windows 销毁；多文档退出任一取消全部保留。
3. 移动/贴靠/最小化/还原、工作区迁移及键盘窗口菜单；右侧贴靠→最大化→最小化后缩小视口并刷新，依次还原验证最大化→右侧贴靠→普通边界且窗口控制可达；axe 自动检查，真实读屏与 IME 按验收台账人工登记。
4. 拒绝能力无副作用，撤销后下一次调用立即失败；定向通信不越实例，原生数据文件不执行。
5. 正式构建准备完整离线资源，断网刷新、打开、编辑保存；破坏资源准备必须不标离线；版本切换不得混合资源。
6. 导入二进制逐字节导出、回收站恢复；损坏/超限备份不改旧状态；备份无授权、正文以外运行敏感数据。
7. 第二标签页先只读，接管须旧页统一脏状态协商；取消不移交，成功后旧页不能写。
8. 正式部署按 README 的基址、HTTPS 和缓存规则配置；版本与去敏诊断能下载。macOS/Windows 实机、10 人任务研究和基准设备采样单独记录，未取得证据不能标支持或发布完成。

9. 同应用两个文档实例分别打开含 path/query/hash 的位置，刷新后核对文档及行光标；文件应用恢复目录/搜索/选择，设置恢复页面。前进/后退只改变目标实例，顶层地址不变；脏文档切换失败保留内容，凭据路由拒绝且不写入快照。

10. 设置页新建、重命名并前移/后移两个工作区，刷新核对名称与顺序；概览将最小化脏编辑器和设置移到另一区，从应用栏定位既有单实例。取消删除应原样保留；确认迁移到默认区，检查最小化状态、实例身份和草稿，再还原编辑器。只剩一区时删除禁用且说明原因。

11. `e2e/recovery.spec.ts` 在独立浏览器上下文验证强制关闭后的已保存正文与恢复提示、单实例启动失败的重试/移除、写入额度/权限故障，以及受损/不兼容/未知版本或应用的恢复诊断。两阶段任一取消须保留原记录；最终重置只清空该测试上下文的托管数据。

12. `e2e/recovery.spec.ts` 以两个相同的未安装应用快照验证独立恢复 ID、关闭/重开待办和焦点、目录安装后单项恢复、移除最后一项、跨工作区迁移及刷新保留。

13. `e2e/backup.spec.ts` 实际下载备份再导入：确认范围与取消脏文档协商，成功后重新打开完整会话；错误版本/摘要清除旧恢复入口，额度不足保留旧文件与会话并显示结果。全量重置两次确认都可取消，最终清除后重新入门，打开设置并再次刷新不残留旧实例。

14. `e2e/trash.spec.ts` 验证两模式原目录不可用/重名恢复可取消且不覆盖，编辑中回收后只能明确另存新文件，清空数量包含子项、QUOTA 保留和重试，以及设置撤权后回收服务不能绕过权限。

15. `e2e/import-export.spec.ts` 在两模式拖入二进制到指定目录并实际下载，检查原字节、名称、MIME 和刷新；HTML/SVG/JS 只作为数据保存，打开返回不支持，主动下载保持原字节。重名批次取消/跳过、本机读取失败、QUOTA 和原生事务 abort 都须保持整批旧状态。

16. `e2e/import-limits.spec.ts` 创建真实本机文件：恰好 50 MiB、4×50 MiB、恰好 100 文件必须完整导入，全部内容摘要及刷新结果一致；超过 50 MiB、101 文件、205 MiB 批次须在写入前明确拒绝。修改本机源文件不改变虚拟副本，下载仅声明已交付浏览器。大文件串行运行，临时文件在测试结束后清理。

17. `e2e/recovery.spec.ts` 的 recovery-reset-quota / recovery-reset-abort 旅程在受损启动页注入重置故障，验证两次确认后仍保留原始记录、不进入空桌面，刷新后可重新确认并成功清除。`storage.browser.spec.ts` 同时核对同步 SecurityError、提交前拥有权失效时所有物理键和原字节保持一致。

18. `e2e/editor.spec.ts` 在两模式验证同文件双实例的撤销/重做隔离，另存为后原稿字节/版本不变且刷新保留两个文档；保存 QUOTA 不清除草稿与脏状态，关闭可取消，重试后才更新原文件。重命名和跨目录移动可分别取消，成功后刷新按原文件 ID 读取新位置并继续保存，文件数量不增长。会话窗口 ID 跨刷新保留，运行实例 ID 重建，测试不得依赖 iframe 顺序。

19. `e2e/file-manager.spec.ts` 在两模式检查真实空态、目录内搜索及 Tab/空格选择、Enter 进入目录，拒绝非法名称与目录环；新建/重命名/移动重名均保持原文件，显式改名后才移动。新建/移动的 QUOTA 和 put 后事务 abort 须保留旧字节、revision 与全部物理键，刷新后可重试。

20. 文件授权模态显示中文能力名称及“我的文件”下的完整虚拟路径，说明本次授权与持久授权期限；仅本次允许一个编辑器窗口后，其他文件及同应用新窗口仍需单独授权，拒绝不读正文也不修改文件，原授权窗口继续可保存。服务测试还覆盖猜测 ID、路径穿越、目录创建越界和提交前撤销目标授权。

21. 文件撤权：给同一编辑器的两个文件分别持久授权，在设置中按中文能力和完整路径撤销其中一个。保存被撤权文件时拒绝重新授权，确认草稿仍在、旧字节未变，另一文件授权保持。明确本次授权后保存并退出应用，再打开及刷新：仅持久授权可复用；被撤销范围的新实例仍需确认。macOS 关闭窗口与退出应用按各自语义验证。


22. 三框架便签：从应用目录分别安装 Angular / React / Vue 便签，各开两窗口，保存不同中文/emoji 内容并逐字节核对。拒绝各框架的可选剪贴板后仍可保存；每窗口设置独立 path/query/hash、强调色和未保存内容，连续切换模式 20 次，再切换深色主题，核对 iframe 资源、timeOrigin、路由、草稿和局部样式保持。退出任一取消须保留该框架两个窗口，明确放弃才销毁，原已保存内容不变。对应 `e2e/frameworks.spec.ts`。

23. 分别直接打开 `sample-angular.html`、`sample-react.html`、`sample-vue.html`，编辑中文、撤销重做并真实下载，核对文件名和 UTF-8 字节。保存到我的文件、剪贴板和窗口能力必须明确不可用。此旅程证明普通浏览器独立运行；真实 IME、读屏和其他支持环境单独登记。


24. `e2e/file-manager.spec.ts` 的 file-manager-import-search 旅程暂停真实 File 读取，在导入完成前输入搜索词，再释放读取；完成后仅显示匹配文件，清空搜索可见全部已导入字节。导入操作的晚到回调不得把列表恢复到旧搜索条件。
