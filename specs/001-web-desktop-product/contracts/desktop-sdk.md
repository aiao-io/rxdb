# Desktop SDK v1

传输为 Orbit 专属 MessagePort RPC，JSON 值，超时/取消/销毁行为继承内核。身份从宿主持有的实例闭包注入；载荷 appId、instanceId 不可覆盖调用者身份。响应错误包含稳定 code 和可读 message，不包含文件正文和凭据。

| 请求                                                                            | 输入                                                                  | 结果与约束                                                |
| ------------------------------------------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------- |
| desktop.context                                                                 | 无                                                                    | 只读实例身份、mode/theme/workspace/visibility             |
| window.update                                                                   | title、dirty、commands、fileId、route、navigation                     | 仅所属实例标题、脏状态、声明命令                          |
| window.action                                                                   | action 为 minimized、maximized、normal、left、right、restore 或 close | 窗口状态受工作区约束；close 进入统一协商                  |
| files.list/read/create/write/rename/move/trash/restore/delete/emptyTrash/import | 文件 ID、目标目录、revision、字节                                     | files 能力+范围验证，禁止猜 ID 越权；写冲突 code=CONFLICT |
| storage.get/set                                                                 | key、schemaVersion、value                                             | 当前 appId 命名空间，不提供跨应用枚举                     |
| profile.get/set                                                                 | 合法偏好字段                                                          | settings 能力；更新广播一次                               |
| apps.list/install/update/rollback/uninstall                                     | 目录 id                                                               | apps 能力，来源受控，系统组件不可卸载                     |
| permissions.revoke                                                              | 受控授权 ID（清单由 profile.get 返回）                                | settings 能力，撤销立即生效                               |
| message.send                                                                    | targetInstanceId/channel/payload                                      | 声明及授权通道，宿主附加来源，≤64KiB，不隐式广播          |
| notification.post                                                               | title/body                                                            | notifications 能力，仅本地中心，点击绑定原实例            |
| clipboard.read/write                                                            | 文本                                                                  | 独立授权与浏览器用户激活，拒绝时显示手动入口              |
| backup.export/validate/restore/reset                                            | 版本化备份、reset scope 为 configuration 或 all、确认                 | settings 能力，验证先于原子提交，reset 双重确认           |

宿主发往子应用的事件：desktop.changed、files.changed、document.invalidated、message.received。command 是宿主对目标实例的 RPC。子应用暴露 document.save、document.prepareClose、document.discard 和 command。prepareClose 返回 `{dirty:boolean}`，宿主先收集全部同意再销毁；任一取消或保存失败停止整个退出。5 秒无响应提供显式强制关闭。

授权窗口为宿主模态，显示应用名、精确来源、能力和范围，可选本次或持久授予；拒绝无副作用。所有能力默认拒绝；系统内置应用也须声明能力并通过受控安装策略赋予明确范围。 文件范围展示“我的文件”下的完整虚拟路径与文件/目录类型，能力使用用户可读名称；授权记录仍保存原不透明文件 ID 或目录 scope。仅本次授权绑定当前窗口的本次运行，退出或刷新后对新实例无效，不跨文件或运行实例复用；持久授权仍按 appId 和批准来源绑定。不存在的文件或损坏目录引用明确报错，不生成伪造访问说明。

已实现的补充入口包括 `window.focus`、`desktop.confirm/prompt/saveFile/selectDirectory/chooseWorkspace/shortcut`、`files.directories/open`、`workspaces.create/rename/reorder/delete` 和 `diagnostics.export`。`files.open` 接收 `id`、可选 `appId`、`choose`、`newInstance`；显式无效应用返回 UNSUPPORTED，失效的保存默认则要求重新选择。定向消息只向 ready/hidden 实例发送，尚未就绪返回 NOT_READY。

`workspaces.reorder({ids})` 需要 settings 能力，ids 必须是当前全部工作区身份的唯一完整排列。新建/删除后的过期列表、重复或未知身份会被拒绝；在原子事务中只更新工作区数组顺序，保留窗口、名称、各区活动窗口和当前工作区。设置页提供前移/后移，边界及提交期间禁用，顺序同步到桌面入口并随会话恢复。

`backup.reset` 默认 scope=all，保留已有调用行为。configuration 仅恢复主题、字号、动态效果、固定入口、桌面快捷方式和通知偏好；保持交互模式、引导状态、文件、私有数据、授权、工作区及运行实例。两种范围都必须完成两次宿主确认，取消不写入。

初始 `fileId` 只用于首次装载文档。偏好 props 更新不得被应用解释为重新打开文件，已保存文档之后的未保存修改同样必须保留。`apps.update({id})` 和 `apps.rollback({id})` 返回是否完成切换，取消返回 false；新增权限拒绝不更新安装、不提交暂存授权。宿主校验目标完整资源和私有数据兼容，处理全部目标实例脏内容，原子切换后按保存引用重开。`runtime.suspend/resume` 仍为待实现契约。

## 大载荷传输

桌面应用通过 `DesktopTransport.request` 调用，底层仍为 Orbit RPC。普通业务响应统一封装为 `{type:'inline',value}`；长响应封装为 `{type:'download',id,size,sha256}`，避免业务数据与下载标记冲突。这里的 `size` 是 UTF-8 JSON 的字节数。

JSON 不超过 256 KiB 时直接发送。较大请求先 `transfer.begin({method,size,sha256})`，再按顺序发送 `transfer.append({id,index,chunk})`，最后 `transfer.commit({id})`。`chunk` 为最多 128 KiB 原始字节的 base64，不切割 Unicode 字符串。只允许 `files.create/write/import`、`backup.validate/restore` 和 `storage.set` 上传大载荷。下载使用 `transfer.download({id,index})`，返回 `{chunk}`。

宿主绑定真实 instanceId，拒绝跨实例读取、乱序上传、错误长度、过期传输、校验和不匹配和未知大请求方法。全部活动传输最多占用 300 MiB 声明容量，每实例最多 4 项，120 秒没有传输活动即过期。完成或取消后调用 `transfer.release({id})`；实例销毁时宿主清理其全部缓冲区。传输完成仅代表完整取得请求数据，服务授权、拥有权与原子事务仍在实际操作时重新检查。

300 MiB 是 JSON/base64 传输预算；产品导入和备份的原始文件字节限制仍为 200 MiB。应用独立版本更新/回退已有实现与自动化片段；协作挂起已实现，完整支持环境待验收。不得根据本表推断故事或完整产品已经验收。

安装版本与资源指纹独立固定。`apps.list` 返回当前版本、availableVersion、updateAvailable、previousVersion 和 changes；离线状态对应当前安装。调用 install 对已安装应用保持幂等，不能借此越过 update 的权限与脏状态协商。版本目录只接受受控应用，不接受用户提供脚本或 URL。不可逆迁移与不支持的数据 schema 会在关闭实例前拒绝。

外壳离线服务使用 `status` 返回 `protocol:2`、构建版本与完整状态；确认协议后才发送 `releases`。启动消息超时为 5 秒，静态资源准备为 120 秒。旧协议要求显式升级，不自动激活等待中的 Worker。外壳更新与拥有权移交均在所有文档保存／丢弃确认后、实例销毁前提交恢复会话；未保存文档首次保存产生的文件引用纳入该快照。

大文本 `clipboard.write` 经过与文件、备份相同的分块通道；提交时仍调用原服务入口重新核验实例、拥有权和 clipboard/write 授权。传输完成或失败均释放临时字节，剪贴板正文不进入桌面持久状态。

## 预取、资源引用与协作挂起

Service Worker 私有资源协议为 2，Orbit RPC 协议仍为 1。`prepare-release` 接收固定版本、唯一 `id` 和 `priority=foreground|background`；`cancel-release` 按客户端身份和请求 id 取消。相同资源指纹共享任务，最多两个运行任务，前台优先且可以抢占纯后台下载。未启动应用也可更新：若旧版资源未绑定，更新流程先自行准备并固定回退包，不依赖空闲预取。宿主可独立持有准备中的版本引用，取消或失败在 finally 中释放；发送取消通知失败也明确结束等待。

`prune-releases` 只允许部署根入口或 index.html 调用。引用包括安装与回退、运行实例、临时持有、运行及排队准备任务、所有同部署活 iframe；清理串行并阻止新的资源写入，释放最后引用后可回收旧缓存。不会调用用户数据库删除接口。

应用在清单中显式声明 `suspension:1`，并在 AppSession 登记可挂起条件。宿主先请求 `document.prepareClose` 确认 dirty=false，再请求 `application.suspend`；应用只有在没有业务请求、未保存内容和未完成操作时返回 `{saved:true}`。宿主收到确认才显示已挂起。挂起失败会请求 `application.resume` 补偿；补偿或恢复未获确认则显示后台状态未确认，保留实例供用户重试。未声明协议的应用和脏文档在批量检查中列为需要处理，不销毁。

挂起时拒绝新的业务请求，已登记状态事件按 handler 保留最后一次，恢复后处理。`application.resume` 返回 true 后恢复显示；原 iframe 与组件内存保留，因此文件目录、搜索及已保存编辑内容保持。最小化和跨工作区隐藏只发送 hidden，不宣称暂停。挂起状态不持久化，刷新仍按已保存会话重新启动应用。

## 实例导航与恢复

路由是应用实例内的逻辑位置，保留 path、query、hash；不会写入桌面顶层地址。`window.update` 可发送完整 `route` 及 `navigation:{back:boolean,forward:boolean}`，调用身份仍由实例闭包决定。宿主只持久化当前位置，历史栈保留在该实例内存中，刷新后从保存位置建立新历史。

宿主通过 `navigation.navigate` RPC 向目标实例发送 `{type:'push'|'replace',route}` 或 `{type:'back'|'forward'}`，应用返回 `{route,back,forward}`。AppSession 的 AppNavigation 按实例维护历史，并要求视图显式登记处理器；未登记、重复导航、无历史、挂起或销毁均明确拒绝。处理器失败或取消不提交路由，退出实例的迟到回复不能更改宿主快照。导航期间计入进行中的工作，不能同时宣称已挂起。窗口提供后退、前进和“打开位置…”入口。

位置必须是相对应用路径；拒绝绝对 URL、跨来源形式、反斜线、控制字符和越界路径。空位置及旧锚点可以正常化。可恢复位置不能带入 `token`、`access_token`、`refresh_token`、`id_token`、`password`、`secret`、`authorization`、`code` 和握手参数（含大小写及 token 分隔符变体），错误不回显值。其他短期或敏感信息由应用保留在非恢复状态中，不得发布到 route。

内置文件应用使用 `/folders/<id>?q=<搜索>#selected=<id>`、`/trash` 和根路径恢复目录、搜索与选择；设置使用页面路径恢复当前页；编辑器使用 `/documents/<id>?line=<行>#L<行>` 恢复保存文档与行位置。跨文档导航先保护脏状态，文件读取期间的新编辑或重命名也不能被迟到结果覆盖。加载失败项重试保留路由、工作区、边界和窗口状态。此协议是桌面应用接线，不代表全部框架与正式支持环境已经验收。

## 启动恢复与失败范围

会话重新打开后只承诺已持久化的布局和已保存内容，并显示未保存内容无法保证找回的提示。布局/会话保存失败传播原稳定错误代码并说明影响范围，不把运行内存当作已保存快照，原文件事务与布局事务分别承诺。

启动读取数据校验失败（INVALID / NOT_FOUND / DENIED）才提供受损会话恢复入口，普通资源或存储连接故障仍显示原错误和重试。诊断只展示错误类别、桌面版本及原数据保留状态，不输出正文。显式重置需要两次宿主确认，仅在拥有写入权、无运行实例且仍处于该失败状态时执行；提交前再次检查拥有权，取消或丢失拥有权不修改记录。重置原子替换托管桌面数据，然后回到首次进入流程，不删除资源缓存。该入口属于宿主启动恢复，不通过普通应用 RPC 绕过确认。

`profile.get` 的每条授权保留原 `Grant` 身份字段，并增加仅供显示的 `appName`、`capabilityName`、`scopeName`。设置使用中文应用与能力、完整虚拟路径、来源和有效期帮助用户选择撤销对象，`permissions.revoke` 仍只接收原授权 ID。已回收文件显示路径和回收状态，永久删除后的孤立授权显示“文件或目录已不存在”，保留撤销入口；显示字段不写回持久授权。新授权请求仍拒绝已回收或不存在的目标。
