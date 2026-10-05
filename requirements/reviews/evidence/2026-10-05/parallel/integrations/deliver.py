from pathlib import Path
import json
import re

root = Path('/Users/jimmy/Documents/aiao/rxdb')
base = root / 'requirements/reviews/evidence/2026-10-05/parallel/integrations'
scope = json.loads((base / 'scope.json').read_text())
criteria = {o['object']: o for o in json.loads((base / 'plan-criteria.json').read_text())}
rows = {}

def add(obj, cid, refs, conclusion, remaining):
    rows.setdefault(obj, []).append({
        'id': cid,
        'status': 'partial',
        'source': refs,
        'conclusion': conclusion,
        'remaining': remaining,
        'evidence': ['file-inspection.json', 'current-gates.json'],
    })

add('rxdb-adapter-http', 'C1',
    ['src/handler-contract.ts:42-76 assertHandlerRow/assertHandlerVersion', 'src/metadata.ts:39-94 canonicalizeMetadata', 'src/transport.ts:190-195 assertOk、311-318 decodeJson'],
    'persisted row/version/metadata 有显式类型校验；非2xx不解码为空集合，非法JSON明确报错。线契约不是仅入口导出核对。当前 strict lint/typecheck与依赖build有实测，协议测试尚未由本子任务重跑。',
    '主控运行本包test与HTTP server真实wire：未知字段/操作、注入条件、content-type、畸形JSON、4xx/5xx；确认无副作用并保留错误码。生产消费与body所有类型还未覆盖。')
add('rxdb-adapter-http', 'C2',
    ['src/pagination.ts:103-153 fetchAllMetadataPages', 'src/conditional-cache.ts:103-108 requestFingerprint', 'src/transport.ts:385-393 sendJson、622-639 #sendJsonConditional'],
    '页形状锁定；token不推进、空页与总页数上限fail-fast，不以截断数据成功返回。条件缓存用method/url/序列化body/handler headers分键，304复用原值。auth不进键是公开前置条件，不另报缺陷。',
    '本轮test/E2E未收结果；补筛选改变后旧token、更新/删除中分页、无缓存304、跨scope以及按README disconnect/connect换身份。当前server token仅a/w游标，非签名或scope绑定证据。')
add('rxdb-adapter-http', 'C3',
    ['src/change-feed.ts:155-169 start/stop、172-284 #connect/#fail/#close、316-343 #handleOpen/#handleMessage'],
    '重连接通时全实体失效弥补断流；停止会清timer/close EventSource并解绑回调。不是带历史cursor的durable replay流；同clientId通知被抑制。与server合批来源候选A关联，未动态确认。',
    '主控真实SSE断线重连、重复/乱序、最后订阅退出；候选A需实际PGlite batch与双客户端验证。不要把没有实现的历史cursor replay当已测能力。')
add('rxdb-adapter-http', 'C4',
    ['src/chunking.ts:46-67 findByIdsInChunks', 'src/RxDBAdapterHttp.ts:446-487 saveMany/removeMany/mutations拒绝路径', 'apps/dev-rxdb-http-e2e/src/local-first-writes.spec.ts:68-108 远端持久化断言'],
    'findByIds分块后统一返回，非数组响应拒绝；bulk/sync原语的边界与QueryCache/outbox归属分开。已有真实HTTP/SQLite旧取证不作为这次test通过；历史outbox修复不重开RV。',
    '主控本轮原包test+local-first-writes，超时但服务端已写、部分批失败、离线重连/删除重试需真实wire/outbox对照；不能仅UI pending变0代证。')
add('rxdb-adapter-http', 'C5',
    ['src/transport.ts:501-517 classify、529-548 #prepare、569-597 #send、311-318 decodeJson', 'src/RxDBAdapterHttp.ts:209-268 connect/disconnect'],
    '断开信号与timeout分开分类，fetch和body消费同处try/finally，timer被清理；connect/disconnect换transport并终止旧请求。响应text读取没有在所读路径证明body字节上限。',
    '主控慢body/晚到响应、auth await期间断开、卸载、快速参数变化和超大/非法数字二进制响应；本轮无这些动态证据，不把未见容量限制直接包装成已复现OOM。')
add('rxdb-adapter-http', 'C6',
    ['src/transport.ts:477-486 buildHeaders、535-546 #prepare', 'README.md:227-231 换身份前置条件', 'apps/dev-rxdb-http-server/src/cors.ts:52-74 applyCorsHeaders'],
    'auth在每次发请求前求值且覆盖静态header；handler变体入缓存键。换身份必须disconnect/connect，直接换token并非支持路径。demo回显origin/假Bearer不构成生产鉴权证明。',
    '受控server真实未授权origin/credentials与跨scope拒绝、日志无token敏感body、pack后consumer仍待证；当前依赖build不是独立发布消费。')

add('dev-rxdb-http-server', 'C1',
    ['src/http-utils.ts:34-52 readJsonBody', 'src/server.ts:324-338 URL错误、400-409 decodeSegments', 'src/recipes-repository.ts:330-373 readObject/readIdList/readWritablePatch'],
    'body限制1MiB、对象形状/IDs/可写字段显式检查；非法URL与percent escape返回400，不让异步handler裸崩。规则深度检查后交上游查询编译，未另造fallback。',
    '本轮server:test运行结果由主控后补；需空body/数组/null、畸形target、未知field/RuleGroup注入、巨大body与错误数字，拒绝后数据库不变。')
add('dev-rxdb-http-server', 'C2',
    ['src/server.ts:94-100 assertAuthorized、370-380 dispatch、411-434 runControl', 'src/cors.ts:52-95 origin/preflight', 'src/main.ts:49 runServe'],
    '这是loopback demo：无Authorization放行，有header只验Bearer形状；控制接口在NODE_ENV非production开启且在offline闸门之前；origin回显、OPTIONS在鉴权前。不是生产Auth/CORS拒绝实现。',
    '补production控制接口404、错误Bearer/no-body副作用及可信测试origin对照；未授权origin/真实身份拒绝需要受控生产式server，不可用demo成功核销。')
add('dev-rxdb-http-server', 'C3',
    ['src/server.ts:117-147 sendConditional/handleMetadata', 'src/http-utils.ts:63 computeEtag、94-98 matchesIfNoneMatch', 'src/page-token.ts:54-97 encode/decodePageToken'],
    'ETag由完整响应JSON的SHA256生成；支持weak/list/*匹配。token校验非空string及a/w tuple结构，载荷base64url并非MAC或filter身份绑定。对token完整性不给越权安全结论。',
    '主控真实条件请求、内容更新后200、篡改token/旧filter/同值排序/分页删除；只有合法静态250行翻页对照，不能覆盖全部恶意token。')
add('dev-rxdb-http-server', 'C4',
    ['src/change-feed.ts:34-57 openChangeFeed', 'src/change-subscribers.ts:29-54 createChangeSubscribers', 'src/change-broadcaster.ts:47-74 recordWrite/onEntityEvent'],
    'SSE response close删订阅、request close清心跳，closeAll收束。广播按实体事件派发，但合批归最后clientId为静态候选A；并非本轮已复现缺陷。',
    '主控新增review-parallel-change-broadcast-origin.spec.ts与真实PGlite/双client SSE时序；断线、慢消费者、结束后订阅/timer归零仍需动态。')
add('dev-rxdb-http-server', 'C5',
    ['src/rxdb-store.ts:51-73 createRxdbRecipeStore', 'src/server.ts:253-282 reseed/close', 'src/main.ts:53-57 信号清理'],
    '数据层使用真实RxDB/PGlite文件而非旧node:sqlite demo；reset先destroy再换库，body await后现取store避免已释放句柄；停机先关SSE再server/store。',
    '主控test中验证并发reset/请求、提交失败、信号退出、重开持久化与clear/reset不同语义；本轮没有启动进程，不判进程收束通过。')
add('dev-rxdb-http-server', 'C6',
    ['src/server.ts:170-230 routeProtocol', 'src/recipes-repository.ts:111-125 listMetadataByOffset、308-320 deleteRecipes', 'apps/dev-rxdb-http-e2e/playwright.config.ts:61-75 双服务'],
    '逐项对照metadata/by-ids/create/update/delete和变更流；应用server与客户端协议路径可追溯，E2E依赖冷前端build及后端build-deps而非旧产物。',
    '本轮server整包、HTTP adapter wire、本轮E2E由主控后补；协议fixture/mock不能代替真实应用server的响应与数据库状态。')

add('dev-rxdb-http', 'C1',
    ['src/app/setup_rxdb_http.ts:50-151 初始化/adapter/plugin注册'],
    '单例RxDB显式使用wa-sqlite local、HTTP remote、SyncType.None，QueryCache/history/sync插件串联；远端用recipes映射，WASM按OPFS/SharedWorker能力建worker。未把demo行作为远端失败fallback。',
    '主控app:test和冷build/E2E；服务不可达、WASM缺失、重复初始化与scope更换须单独运行。')
add('dev-rxdb-http', 'C2',
    ['src/app/app.ts:210-214 useFind offlineFallback、294 useSyncState、503-517 create', 'apps/dev-rxdb-http-e2e/src/local-first-writes.spec.ts:91-108 pending/实际by-ids对照'],
    'UI本地保存、offlineFallback和库sync状态独立；现有E2E不是只看pending=0，还查服务器by-ids的id/title/price。旧HTTP/SWR历史修复不重复登记。',
    '本轮单测/E2E结果待主控；离线增改删、拒绝不入outbox、联网推送、重开、部分缓存与完整结果分辨仍须当前真实日志。')
add('dev-rxdb-http', 'C3',
    ['src/app/app.ts:158-214 page/clamp/useFind、451-460 filter/page-size重置', 'src/app/filter-rules.ts:76-98 buildFilterRules', 'src/app/paging.ts:53-62 pageCount/clampPage'],
    'filter和pageSize变化重置requestedPage，页码按缓存总数clamp；查询identity含where/limit/offset，规则只生成声明的字段/操作。ETag与token来自adapter而非UI伪计数。',
    '主控快速切页/filter、空/同值游标、过滤后删除导致末页缩小、304与token旧页；当前源码静态不代替浏览器并发验证。')
add('dev-rxdb-http', 'C4',
    ['src/app/traffic-recorder.ts:105-176 CAPACITY/installTrafficRecorder/onTraffic', 'src/app/app.ts:369-385 DestroyRef解除订阅'],
    'traffic最多200条，记录method/path/status/duration，不记录headers/body；取消后恢复fetch，页面订阅有DestroyRef清理。SSE诊断和HTTP错误区分，不据日志说已同步。',
    '本轮大量流量/离开页面/失败response/敏感query URL与断流，确认所有subscriber/timer释放；file-inspection仅分段，不声称诊断每条分支已测。')
add('dev-rxdb-http', 'C5',
    ['apps/dev-rxdb-http-e2e/src/offline-fallback.spec.ts:23-60 离线/409对照', 'apps/dev-rxdb-http-e2e/src/orphan-cleanup.spec.ts:23-50 远端删→离线刷新'],
    'E2E有真实HTTP错误与离线分类对照；orphan验证后端删除后页面消失并离线reload仍不存在，强于只看UI提示。CORS当前只证明允许origin，不证明拒绝。',
    '本轮HTTP E2E运行待主控；恶意origin/token、候选A、对数据清理的失败路径与当前app bundle仍待补，不能以旧成功给全对象complete。')

add('dev-rxdb-http-e2e', 'C1',
    ['playwright.config.ts:16-22 apiCommand、61-75 webServer', 'src/env.ts:E2E_DATABASE/API_PORT 声明'],
    '真实server以隔离E2E数据库reset/seed/serve，前端只serve预建产物；两服务reuseExistingServer=false，workers=1避免全局控制状态互相覆盖。',
    '主控当前冷依赖build+e2e日志后补；端口冲突/服务来源/数据目录需核对，不复用现有用户server。src/env.ts仅配置清单已解析，目录实际运行未证。')
add('dev-rxdb-http-e2e', 'C2',
    ['src/local-first-writes.spec.ts:68-124 离线create/远端409', 'src/offline-fallback.spec.ts:23-60 传输离线与409对照'],
    '离线写当场本地可见，联网后pending=0再查远端行；409不降级且队列为0。这些断言有判别力，不是仅成功灯。',
    '本轮未取得e2e结果；还需离线update/delete、Push超时但已提交、失败重试、刷新后outbox完整闭环，不由create成功覆盖。')
add('dev-rxdb-http-e2e', 'C3',
    ['src/page-token.spec.ts:25-70 首页面无token/续页有token/250唯一id', 'src/conditional-requests.spec.ts:141-198 304与新写后200'],
    'token用请求体证明确实续页，且检查id唯一与排序；304用请求headers+server日志+页面行数交叉，写后须出现200。',
    '本轮运行由主控后补；空/同值游标、页间写删、旧filter token、304无缓存和错误token没有由这两条正常场景证明。')
add('dev-rxdb-http-e2e', 'C4',
    ['src/change-feed.spec.ts:103-159 接通失效/双页面可见', 'src/cors.spec.ts:47-64 预检allow headers/origin'],
    'feed用重连失效计数和双页面2秒可见性断言，不只看connected。CORS允许origin与预检覆盖，不是未授权origin拒绝测试；合批来源候选A需主控分流。',
    '当前e2e待主控；断流/混合写入者合批/最后订阅退出及credential/CORS拒绝需补证。')
add('dev-rxdb-http-e2e', 'C5',
    ['src/local-first-writes.spec.ts:64-66 resetDemo beforeEach', 'src/orphan-cleanup.spec.ts:19-50 reset/删除/离线reload', 'playwright.config.ts:31-33 workers/retries'],
    '每例reset、串行worker与离线/409错误对照能区分真实失败；orphan通过远端删除和离线刷新交叉。失败cleanup/interrupted过程未运行，不自动全绿。',
    '主控保留失败与重试原日志，验证中断时服务/DB释放、控制fault复位和重复执行；不能以重试成功抹原始失败。')

add('rxdb-adapter-supabase', 'C1',
    ['src/RxDBAdapterSupabase.ts:101-127 client/connect、776-827 #verifyRlsConfiguration', 'src/supabase.rls.ts:13-28 默认warn、75-80 handleRlsCheckFailure'],
    '可注入已认证client；RLS self-check检查表exists/rlsEnabled，默认warn而非启用RLS或策略验证。身份必须来自Supabase Auth/server policy，不来自rxdb.context.userId。demo与remote E2E明确未认证。',
    'checkout-isolated stack上至少A/B两个受限身份、读写/无可见行/删除拒绝、RPC权限与service-role对照；当前remote两例不覆盖这些，未拿默认warn当隔离证明。')
add('rxdb-adapter-supabase', 'C2',
    ['src/postgrest-error.ts:49-81 is_transport_failure/classify、134-144 assert_postgrest_ok', 'src/entity_scope.ts:37-64 resolveEntityScope', 'src/RxDBAdapterSupabase.ts:585-608 fetchMetadata'],
    'status=0才判传输失败，其余权限/SQL错误保持数据错误；entity scope按已配置namespace消歧。metadata仍缺关系上下文/SELECT是RV-060 Open，不新报；RV-061为联审依赖问题。',
    '主控本轮test保留RV-059/060/061已知失败；关系exists/notExists、类型映射、二进制/BigInt/日期与列名映射需当前实际SDK/PostgREST证据。')
add('rxdb-adapter-supabase', 'C3',
    ['src/RxDBAdapterSupabase.ts:169-225 saveMany/removeMany/mutations、638-654 executeRetryableWrite、744-754 删除结果校验'],
    'REST save/remove与事务RPC mutations分开；删除缺返回id显式失败，批大小URL问题仍RV-059。RPC构造upserts/deletes并传上下文userId，不能因此说已验证server认证或每操作权限。',
    '本轮隔离Docker测试、RPC部署与逐操作确认/拒绝/回滚、branch切换、大批/重复ID/部分失败待主控；不把REST拆块语义伪装跨块事务。')
add('rxdb-adapter-supabase', 'C4',
    ['src/pagination.ts:69-86 select_all_pages', 'src/RxDBAdapterSupabase.ts:138-148 disconnect、830-887 Realtime subscribe/reconnect'],
    '分页到短页才终止，Realtime断开清timer/removeChannel，旧channel回调比较当前实例；SUBSCRIBED刷新pullable count。不由offset分页证明并发写时快照完整。',
    '主控真实网关>1000行、写入/删除中翻页、Realtime断流/重连/频道关闭和跨namespace失效；TS/mock计数不代替实际RLS Realtime。')
add('rxdb-adapter-supabase', 'C5',
    ['src/RxDBAdapterSupabase.ts:585-608 fetchMetadata 实际SDK路径', 'src/pagination.ts:69-86 SDK分页', 'src/__tests__/review-large-rest-writes.spec.ts、review-querycache-relations.spec.ts 原失败保留'],
    '已核对10-05先前隔离环境final-counts：553原例均过，交付557pass/5fail/0skip；失败属于既有RV-059/060/061。此为早先baseline，不是parallel本轮整包结果。当前主控lint/typecheck及依赖build实际过。',
    '本轮Supabase:test与认证/RPC/Realtime矩阵交主控；覆盖率四指标未收，本轮不能拿先前553或557当当前门禁。spec文件仅盘点/既有记录对照，不宣称本轮全文审阅。')
add('rxdb-adapter-supabase', 'C6',
    ['src/RxDBAdapterSupabase.ts:107-118 supplied client/createClient', 'apps/dev-rxdb-supabase/src/app/runtime-config.ts:26-63 public key拒绝', 'apps/dev-rxdb-supabase/scripts/audit-build-credentials.mjs:22-35,54-85 指纹审计'],
    'adapter允许外部client，server/client安全不能混同；应用拒绝secret/service-role并只输出审计credential指纹。包依赖build/typecheck有当轮证据，不代证生产bundle无凭证或pack消费。',
    '主控当前app冷build后audit-secrets、consumer及session轮换；SDK/RPC日志无token、privileged key不入浏览器，认证环境缺失时明确未验证。')

add('dev-rxdb-supabase', 'C1',
    ['src/app/runtime-config.ts:51-63 readSupabaseConfig', 'src/app/supabase-sync.ts:21-56 connectSupabase/resolveRemoteSync', 'src/app/setup_rxdb_wa-sqlite.ts:15-66 local/remote配置'],
    'URL/key都缺时本地模式；半配置或非公开key显式失败；resolver失败标未连接并抛错，不假装remote成功。app本轮strict lint/typecheck过，构建/运行语义仍需补。',
    '主控当前冷local/remote build与运行，错URL/key/端口/旧dist/远端不可达逐项验证；不使用未知生产env。')
add('dev-rxdb-supabase', 'C2',
    ['src/app/runtime-config.ts:26-63 public key判断', 'src/app/remote-security-notice.ts:9-16 未认证/RLS警告', 'scripts/audit-build-credentials.mjs:22-35,54-85 scanBuildArtifacts'],
    '警告直接声明createdBy/updatedBy不是身份；public key检查与bundle审计是凭证边界，不等同RLS身份隔离。先前build后审计仅历史证据。',
    '本轮冷build后audit-secrets和跨受限身份读写拒绝；认证/RLS缺失不写不适用，service-role成功不算隔离。')
add('dev-rxdb-supabase', 'C3',
    ['src/app/todo/todo.page.ts:193-225 CRUD错误、327-345 #sync', 'src/app/remote-sync-state.ts:20-28 markConnected', 'src/app/todo-interactions.ts:31-65 乐观值恢复'],
    'CRUD失败重置/保留错误；Push/Pull pending在finally清理并显示错误。RemoteSyncState是resolver连接状态，不是逐条远端确认；UI不只成功灯，E2E跨context验证push/pull但无离线失败矩阵。',
    '主控离线写后重连、重复Push/Pull、拒绝/冲突、切branch和重开；逐操作远端确认/pending与真实数据一致性仍未证。')
add('dev-rxdb-supabase', 'C4',
    ['src/app/setup_rxdb_wa-sqlite.ts:17-66 dbName/Worker/SharedWorker', 'src/app/branch-manager.ts:182-209 create/switch finally', 'src/app/todo-cursor/todo-cursor.page.ts:74-118 completed/id游标'],
    '本地库名和worker作用域明确；branch操作防重复、失败有alert、finally复位；Todo排序用completed后id打破同值。仅看到普通同值游标配置，不证明所有nullable与跨tab行为。',
    '主控多标签共享库、初始化退出/关闭重连、nullable/同值翻页、分支切换限制；核心/框架依赖问题不在本对象擅自修。')
add('dev-rxdb-supabase', 'C5',
    ['apps/dev-rxdb-supabase-e2e/src/home.spec.ts:103-154 reload/跨页断言', 'apps/dev-rxdb-supabase-e2e/src/remote-sync.spec.ts:11-59 跨contextPush/Pull'],
    '历史2026-10-05 07:48 app:test 47例、08:04 local4、08:05 remote2均先前运行；remote跨context有实际数据判别力，且明确未认证。不能冒充parallel当前门禁或身份隔离。',
    '主控后补当轮app:test、本地/远端E2E与隔离资源回收；默认remote未运行/skip按未测记，故全对象partial。')

add('dev-rxdb-supabase-e2e', 'C1',
    ['playwright.config.ts:5-11 REMOTE_E2E/port/deployedURL、98-109 webServer', 'src/remote-sync.spec.ts:9-11 remote describe'],
    'local/remote由显式REMOTE_E2E与不同port区分；remote例仅remote模式注册。旧08:04 local4与08:05 remote2日志分别存在，不合并为当前全过。',
    '本轮两个target结果由主控后补；未执行/未注册/skip逐项列明，local4不能证明remote。')
add('dev-rxdb-supabase-e2e', 'C2',
    ['playwright.config.ts:98-109 预建产物serve/拒绝复用', '主控resolved graph e2e/e2e-remote dependsOn dev-rxdb-supabase:build'],
    '本地target有build依赖且webServer不复用；BASE_URL可跳过自建server，需另验其来源。remote serve-remote与local serve-e2e分支明确。',
    '主控当前冷构建、错config/旧dist/端口占用，确认浏览器bundle指向受控stack；不对未知deployedURL取证。')
add('dev-rxdb-supabase-e2e', 'C3',
    ['src/remote-sync.spec.ts:24-49 Push后另一context Pull可见、61-95 未Push负对照', 'src/home.spec.ts:103-115 local reload'],
    '跨context成功与未Push不可见负对照强于请求成功灯；local reload证明本地路径。remote仅正常Push/Pull，不覆盖断线/重试/冲突，也未确认清理后的远端删除。',
    '主控当前运行并补断线重连/拒绝/冲突、远端删除确认；候选B数据回收静态缺口另分流，未动态复验。')
add('dev-rxdb-supabase-e2e', 'C4',
    ['src/remote-sync.spec.ts:20-22,70-71 明确未认证警告', 'apps/dev-rxdb-supabase/src/app/remote-security-notice.ts:13-15 身份提示'],
    '现有remote两例明确未启用身份认证；没有两个受限身份跨读写/越权拒绝断言。此C未核销，不把未认证demo成功当RLS通过。',
    '主控受控checkout-isolated stack测试账号A/B、RLS/RPC权限与privileged key不进页面；环境不足保持未验证，不标不适用。')
add('dev-rxdb-supabase-e2e', 'C5',
    ['src/remote-sync.spec.ts:24-59 unique title/正常删除、50-52 finally仅closeContext'],
    'uniqueTitle降低冲突，但数据删除只在前序成功后运行；finally不清远端数据，最后只数RPC请求而未确认删除。候选B是旧cleanup缺口具体化，不是本轮动态确认。',
    '主控分流失败注入/Push超时/删除拒绝后teardown，按唯一id/scope从受限身份确认无残留；仅授权隔离stack，不碰未知生产远端。')

add('rxdb-adapter-electron', 'C1',
    ['src/electron-sqlite-host.ts:171-176 requireSession、257-290 parse/dispatch', 'apps/dev-rxdb-electron/src-electron/main.ts:124-129 senderFrame', 'apps/dev-rxdb-electron/src-electron/desktop-session-ownership.ts:94-104 denyForeignSession'],
    'host先parse统一协议再dispatch，未知session返回session_closed；应用IPC验证主frame，再由窗口归属拒绝别人的session。库级host不自行知道Electron sender，权限必须应用bridge落实。',
    '主控真实IPC旧/未知session、跨窗口/子frame、畸形/巨大payload与未知操作，拒绝后无副作用；进程内host旧取证非GUI证据。')
add('rxdb-adapter-electron', 'C2',
    ['src/node-sqlite-engine.ts:251-277 open、295-310 execute、351-362 close、375-394 authorizer', 'src/electron-sqlite-host.ts:230-243 execute busy retry'],
    'node:sqlite defensive+authorizer拒绝危险能力；多语句带bindings拒绝；close rollback/checkpoint并finally关DB。busy仅BEGIN重试且有预算，不按旧writer lease假设。',
    '主控真实同库双窗口/事务另一路写/关窗与host异常、重开；本轮未跑native/GUI、未测全部事务/崩溃矩阵。')
add('rxdb-adapter-electron', 'C3',
    ['src/pglite-host/pglite-host-lock.ts:113-152 acquirePgliteDirectoryLock', 'src/pglite-host/pglite-host-runtime.ts:129-165 suspendTransaction', 'package.json:76-86 optional peers'],
    'PGlite用独立SQLite exclusive目录锁，不套SQLite多连接假设；事务begin有timeout并拒绝迟到句柄；optional peer声明单独入口。仅源码/包build不证明无peer的consumer。',
    '主控重复同目录打开、worker退出/崩溃锁释放、peer缺失只用SQLite的pack消费；本轮未跑实际worker/消费。')
add('rxdb-adapter-electron', 'C4',
    ['src/electron-file-host.ts:225-259 resolveWithinRoot/canonicalize、356-366 containedPath、640-657 commitWrite', 'apps/dev-rxdb-electron/src-electron/desktop-sqlite-bridge.ts:51-59 resolver'],
    'logical名与root词法/realpath双边界，允许根内symlink、拒绝越界；文件提交sync→close→rename→目录sync，异常清临时。没有执行旧desktop dist。',
    '主控真实穿越/symlink/目录拒绝、锁冲突/同名、restore越界及并发失败；未对所有OS/filesystem认证，不延续历史RV-044为新发现。')
add('rxdb-adapter-electron', 'C5',
    ['src/pglite-host/pglite-host-restore.ts:130-157 writeData/writeEntry、166-195 claimTarget/discardTarget', 'src/pglite-host/pglite-host-lock.ts:133-147 restore marker', 'apps/dev-rxdb-electron-e2e/src/backup-restore.spec.ts:131-188 restore/relaunch'],
    '恢复校验写入长度/文件独占，目标reserved+目录锁，marker用于恢复失败状态；E2E源目录删除后新位置restore/relaunch能区别假备份。RV-058已修复，不用旧cancel失败重开。',
    '主控SQLite/PGlite两档、恢复中断/目标占用/失败重试、加密tamper/BigInt/binary与原库重开；未跑本轮真实宿主和覆盖率。')
add('rxdb-adapter-electron', 'C6',
    ['apps/dev-rxdb-electron/src-electron/main.ts:151-177 contextIsolation/sandbox/navigation', 'apps/dev-rxdb-electron/src-electron/preload.ts:108-135 narrow bridge', 'apps/dev-rxdb-electron-e2e/src/packaged-app.ts:80-96 resolveExecutable'],
    '应用真实IPC通道只暴露request/subscribe且sandbox/contextIsolation开启，runner只找packaged可执行文件、缺失报错不浏览器替代。主控当前包build/typecheck不是packaged E2E。',
    '主控冷打包/Electron GUI、两后端重启持久化、多窗口/沙箱、生产依赖解析与consumer；平台不足保持未验证。')

add('rxdb-adapter-tauri', 'C1',
    ['src/tauri-host-transport.ts:179-218 listen/request/subscriptionReady', 'rust/src/commands.rs:208-219 rxdb_desktop_request', 'src/RxDBAdapterTauri.ts:46-62 createClient'],
    'TS以JSON codec调用单command，监听注册有ready；Rust用真实window label并spawn_blocking，promise rejection按panic/host不可达分开。常量/codec未全文双端穷尽，不从TS编译证明Rust。',
    '主控TS test、Rust cargo与protocol-handshake conformance，巨大blob/BigInt、未知tag、版本差异、panic分类/迟到listen必须实际双端验证。')
add('rxdb-adapter-tauri', 'C2',
    ['rust/src/router.rs:104-116 handle_owned、137-166 close_owner/close_all、199-247 reject/remember', 'rust/src/session.rs:203-239 require_session/take_session'],
    '路由归属表不信请求里的owner；跨窗口permission_denied，未知会话session_closed；close_owner先升代次防晚到open登记。Rust session依真实Engine mutex；并非仅TS mock会话。',
    '主控Rust真实事务竞争、关闭/崩溃、锁饥饿/poison、晚到open与执行；全engine 1632行未被默认判审完，本轮没有运行。')
add('rxdb-adapter-tauri', 'C3',
    ['rust/src/paths.rs:109-113 resolve_database_path', 'rust/src/file/mod.rs:231-281 canonicalize_partial/resolve_within_root、792-825 write_commit/locks'],
    '数据库名先验证再建app-scope目录；文件lexical与canonical双边界；提交失败清临时，锁等待有会话/队列限制。权限边界有实现锚点，不是只看src/index导出。',
    '主控真实Rust穿越/根外symlink/目录失败/磁盘满/原子写，OS权限差异和全file/protocol/locks分支未全部审/测。')
add('rxdb-adapter-tauri', 'C4',
    ['conformance/rust-host-transport.ts:91-111 requireBinary/startRustHostProcess', 'vite.config.mts:56-74 默认test include', '主控resolved graph test-conformance/build-test-host 目标'],
    'conformance确实spawn Rust stdio binary，缺binary硬失败；默认test只include src/tests，不会执行conformance。cargo-test与stdio/共享套件各自不同证据面。',
    '主控后补已配置test-conformance（依赖build-test-host）、cargo-test与共享协议/事务/存储/加密套件，记录platform/skip；不得用默认TS test或cargo unit代替。')
add('rxdb-adapter-tauri', 'C5',
    ['src/RxDBAdapterTauri.ts:74-85 backupStorage/createRestoreTargetClient', 'conformance/tauri-sqlite-backup.spec.ts 已存在，仅清单', 'apps/dev-rxdb-tauri-e2e/src/desktop-backup-restore.spec.ts:115-139 native闭环'],
    '备份storageKey按实际databaseName争锁，restore先取得独占target；native E2E区分DATABASE_ONLY并删除源库后restore/relaunch。未声称共享加密套件或Rust backup测试已执行。',
    '主控真实Tauri加密/二进制/BigInt/tamper、restore目标在用/失败重试和原库重开；仅原共享core契约继承不能核销动态。')
add('rxdb-adapter-tauri', 'C6',
    ['package.json:15-29 exports/files、40-43 core依赖', 'rust/src/commands.rs:142-149 window allowlist', 'apps/dev-rxdb-tauri/src-tauri/src/lib.rs:371-408 command/host注册'],
    'WebView入口与Rust宿主分离；app仅main label进入DesktopHost，不是靠capability JSON隐藏UI就授权；npm入口与crate/安装资源消费仍需单独验证。',
    '主控cargo-check/clippy、dev/release真实WebView、生产CSP/window/command拒绝及pack消费；当前TS lint/typecheck/依赖build不覆盖Rust发布宿主。')

add('dev-rxdb-electron', 'C1',
    ['src/app/setup_rxdb.ts:75-141 localBackends/resolveLocalBackend/localDatabase', 'src/app/local-backend.ts:71-133 selectLocalBackend'],
    'SQLite/PGlite动态import，桌面与web preview使用不同dbName；候选表重复adapter/dbName硬拒绝，连接选路缓存。browser preview是声明的路径，不把它当真实桌面通过。',
    '主控真实首次启动/坏路径、初始化退出/关窗、两backend切换/重开与释放；缺宿主时不能仅wa preview成功就核销。')
add('dev-rxdb-electron', 'C2',
    ['src-electron/main.ts:124-177 IPC主frame/sandbox/navigation', 'src-electron/desktop-session-ownership.ts:94-104 ownership', 'src-electron/preload.ts:108-135 allowlist/subscribe'],
    'senderFrame限定当前主窗口，host再parse，窗口归属二道校验；bridge没有裸ipcRenderer，事件unsubscribe明确。信任的是宿主sender，不是payload里自报身份。',
    '主控真实子frame/第二窗口/旧session、恶意SQL/file/巨大payload，拒绝后磁盘和DB不变；本轮无真实IPC权限结果。')
add('dev-rxdb-electron', 'C3',
    ['src/app/setup_rxdb_desktop.ts:146-148 archiveOps、171-207 entities/storage/adapter', 'apps/dev-rxdb-electron-e2e/src/backup-restore.spec.ts:131-188 restoreAndRelaunch'],
    'Todo/Task/File等真实实体与桌面filesystem串联；backup/restore走adapter，DATABASE_ONLY范围不能伪称附带storage文件。源码与强E2E断言均已对照，实际未跑。',
    '主控Todo/file CRUD、BigInt/binary/原子文件失败、备份恢复中断/冲突、重启；两backend分开，DB与文件范围分开。')
add('dev-rxdb-electron', 'C4',
    ['src-electron/devtools-extension.ts:100-139 explicit enable/capability/mutation、157-172 unique extension', 'src/app/setup_rxdb_desktop.ts:115-131 native provider、211-221 connector'],
    '扩展需显式enable与绝对路径/capability，mutation默认omit，加载后唯一扩展且allowFileAccess=false；native provider pagehide dispose。不能从provider注册推导所有消息授权通过。',
    '主控生产无扩展、capability缺失/readonly拒绝、settings/files mutation、窗口导航/关闭/旧session与native provider真实GUI；不只用fake provider。')
add('dev-rxdb-electron', 'C5',
    ['src/app/setup_rxdb.ts:75-100 动态backend imports', 'src-electron/main.ts:141-148 app scheme资产、151-170 preload', 'apps/dev-rxdb-electron-e2e/src/packaged-app.ts:80-96 packaged-only'],
    'renderer延迟装载两desktop后端与wa preview，preload使用app资源路径；runner缺打包产物直接阻断。包依赖build通过仅属TS/typecheck链，不代表app资源冷安装成功。',
    '主控audit-lazy-backend和冷electron-package-dir、离线启动/WASM/Worker/native/可选peer缺失；当前未取得打包产物消费证据。')
add('dev-rxdb-electron', 'C6',
    ['src-electron/main.ts:212-225 destroyed/render-process-gone释放', 'src-electron/desktop-host-bridge.ts:152-170 releaseTarget/closeAll', 'apps/dev-rxdb-electron-e2e/src/desktop-persistence.spec.ts:62-136 重启'],
    '关窗/renderer crash由宿主释放target，三类host closeAll用finally链收束；真实持久化E2E核对adapter与实际文件/重启count，不是浏览器demo。',
    '主控真实Electron窗口/崩溃/关停、node:sqlite能力与生产依赖、strict app/tests/发布consumer；未跑平台必须留未验证。')

add('dev-rxdb-electron-e2e', 'C1',
    ['src/packaged-app.ts:56-96 candidates/resolveExecutable、133-182 sandbox检查', 'playwright.config.ts:20-31 串行worker'],
    '只找各OS packaged binary；缺失或Linux沙箱助手不合规会失败，非browser/无沙箱fallback。graph e2e依赖冷package和两份扩展build。',
    '主控本轮真实打包/launch日志与版本/平台；未运行平台不写不适用，已有本机产物存在不等于本轮可信来源。')
add('dev-rxdb-electron-e2e', 'C2',
    ['src/desktop-persistence.spec.ts:109-136 两次launch/文件位置', 'src/desktop-persistence-pglite.spec.ts:103-120 两次launch/目录数据'],
    'SQLite/PGlite各自隔离userData，确认backend名、真实文件/目录和重启count1→2。两档测试不可合并成一个后端的通过。',
    '主控两个spec当前真实GUI结果、异常退出/多窗口/OS权限；本轮没有launch，不凭测试存在给持久化通过。')
add('dev-rxdb-electron-e2e', 'C3',
    ['src/backup-restore.spec.ts:131-188 restore/relaunch/删源库', 'src/desktop-persistence.spec.ts:131-136 文件系统检查/清理'],
    '备份用归档bytes/manifest与DATABASE_ONLY，删源目录后在target restore并再普通启动证明真实数据；此路径不自动覆盖native file mutation和损坏归档。',
    '主控backup/native-files/storage当前结果；目标在用、坏manifest/tamper、部分file失败、restore中断及OS跨归档仍待证。')
add('dev-rxdb-electron-e2e', 'C4',
    ['src/devtools-session-rotation.spec.ts:114-166 establishSession/拒绝旧A、172-217 reload/重开'],
    '用A/B UUID不同、结构化session_invalid与B可读面板交叉，较单一UI隐藏有判别力。真实wire/沙箱依赖仍未执行本轮。',
    '主控真沙箱GUI会话轮换、旧frame/释放资源、readonly/full拒绝与native mutation；普通unit不能代证。')
add('dev-rxdb-electron-e2e', 'C5',
    ['src/devtools-extension-loading.spec.ts:55-89 显式dev唯一扩展/production空列表', 'src/packaged-app.ts:133-182 真沙箱'],
    '通过宿主session.extensions枚举对照开发/生产，不只renderer提示；需要真sandbox和MV3扩展。production用继承launchEnv，运行需记录配置避免父进程dev开关污染。',
    '主控dev/prod配置隔离、生产包扩展bootstrap/资源检查与unsupported scheme/MV3实际执行；不从regex或浏览器页面证明。')
add('dev-rxdb-electron-e2e', 'C6',
    ['src/desktop-persistence.spec.ts:62-76 app finally close、135-136 temp清理', 'src/devtools-session-rotation.spec.ts:192-195 app/server/profile finally', 'playwright.config.ts:22-24 workers/retries'],
    '串行worker、独立profile及finally关闭app/server/temp基本收束；仍需launch之前失败/关停失败时的真实资源确认。retries不能抹除首轮失败。',
    '主控当前E2E保留trace/首失败/重试与退出后子进程/端口/profile证据；本轮未实际GUI，不预先判稳定。')

add('dev-rxdb-tauri', 'C1',
    ['src/app/setup_rxdb.ts:54-117 localBackends/resolveLocalBackend', 'src/app/setup_rxdb_desktop.ts:262-306 create RxDB/transport'],
    'native main与wa preview各自dbName，runtime/强制VFS决定选路；native建立invoke/listen指向当前Webview label，不使用Electron的全局preload。',
    '主控native冷启动/初始化退出/坏目录/多窗口/关闭重开；browser preview不代验，真实平台缺失保持partial。')
add('dev-rxdb-tauri', 'C2',
    ['src-tauri/src/lib.rs:408 DesktopHost main白名单', 'packages/rxdb-adapter-tauri/rust/src/commands.rs:142-149 window校验', 'src-tauri/capabilities/default.json:5-12、devtools.json:5-6'],
    '宿主显式main白名单；devtools仅core:event，应用自有command仍需Rust身份guard，不能只靠capabilities。router按宿主label查会话归属。',
    '主控真实普通/冒名WebView invoke、旧session/跨窗口SQL/file/巨大消息无副作用，cargo与GUI分开留证。')
add('dev-rxdb-tauri', 'C3',
    ['src/app/setup_rxdb_desktop.ts:233-235 archiveOps、268-304 entities/filesystem/adapter', 'apps/dev-rxdb-tauri-e2e/src/desktop-backup-restore.spec.ts:115-139 native备份'],
    '实体/文件插件与Tauri transport串联，backup/restore复用真实adapter；native E2E备份声明DATABASE_ONLY并删源库后恢复，不能把storage文件算DB备份。',
    '主控Todo/文件真实CRUD、BigInt/binary、目标冲突/restore中断/重启持久化及原库可重开；单纯report字段不代替filesystem对照。')
add('dev-rxdb-tauri', 'C4',
    ['src-tauri/src/lib.rs:74-79 target_label_of、170-191 devtools_message、388-395 cfg(dev)注册', 'src/app/setup_rxdb_desktop.ts:311-320 provider接线'],
    'relay只在main与rxdb-devtools间，未知label拒绝；专用command编译期cfg(dev)，renderer provider配置与真实native文件能力分开。',
    '主控debug native双WebView/冒名窗口/旧session、release无入口、provider gear readonly/full与文件mutation；静态cfg不当作实际release授权结果。')
add('dev-rxdb-tauri', 'C5',
    ['src/app/setup_rxdb.ts:54-75 动态backend', 'src-tauri/tauri.conf.json:build.frontendDist/security.csp/bundle.targets', 'src-tauri/src/lib.rs:388-417 dev专用注册/窗口'],
    'frontendDist指向当前Angular产物，CSP限制connect-src，devtools注册与资源dev gating可定位；build-devtools/audit-lazy-backend必须当前执行才能证明资源闭环。',
    '主控冷tauri-package-dev/release、WASM/Worker/native/面板缺资源、离线安装包启动；TS依赖build不是Rust安装包通过。')
add('dev-rxdb-tauri', 'C6',
    ['src-tauri/src/lib.rs:371-408 invoke_handler/host注册、429-464 WindowDestroyed/Exit', 'src-tauri/capabilities/default.json/devtools.json 窗口名单'],
    'command注册明确，window destroyed回收owner，退出close_all；Rust宿主授权与WebView origin/CSP需结合真实driver，而不是只看本轮TS typecheck。',
    '主控cargo-check/clippy/test与两档真实smoke分别补日志；普通窗口调devtools command、transport晚到/关闭与native file操作未核销。')

add('dev-rxdb-tauri-e2e', 'C1',
    ['src/packaged-app.ts:479-495 resolveExecutable、524-566 spawn/timeout、576-601 report校验', 'vitest.smoke.mts:26-37 include/exclude/globalSetup'],
    'runner spawn release/debug真实Tauri binary，不用纯浏览器替身；缺binary/报告/schemaVersion错误显式失败，超时SIGKILL。frontend-server是probe辅助，不是GUI替代。',
    '主控desktop-smoke和devtools-smoke各自真实启动来源/平台日志；不从存在报告文件或TS编译判断native通过。')
add('dev-rxdb-tauri-e2e', 'C2',
    ['src/desktop-persistence.spec.ts:35-69 真文件/真实appDataDir/重启', 'src/stored-files.ts collectStoredFiles/sha256OfFile（清单，未全文）'],
    '持久化用native退出码、report的实际host appDataDir、文件存在和第二次count交叉。stored-files入口只盘点，未声称全部file mutation断言已人工/动态完成。',
    '主控native SQLite/file两路径、部分文件失败/越界/同路径冲突与实际bytes/hash；本轮未跑真实filesystem，不能给完整C2通过。')
add('dev-rxdb-tauri-e2e', 'C3',
    ['src/desktop-backup-restore.spec.ts:115-170 备份/删源/restore/配置拒绝、174-197 跨OSskipIf'],
    '备份同时看归档size/manifest scope与源文件，删源后target恢复；已有归档拒绝且不改stale bytes。跨OS依IMPORT_DIR缺失明确skip，不能计入本轮通过。',
    '主控当前backup/restore、中断/坏归档/target在用与旧库可继续开；跨OS归档未供应则记录未验证，不标平台不适用。')
add('dev-rxdb-tauri-e2e', 'C4',
    ['src/desktop-webview-capability.spec.ts:77-120 real probe server、155-168 platform期望', 'packages/rxdb-adapter-tauri/rust/src/commands.rs:142-149 授权实现', 'src-tauri/src/lib.rs:170-191 relay guard'],
    'WebView probe服务器有allowed/denied对照和platform差异，不从WebView API可用推导SQL/window权限。权限真正实现是Rustwindow guard；所读片段不覆盖全部session/relay攻击。',
    '主控普通/冒名窗口特权command、旧session/导航/关窗、真实Rust拒绝及副作用检查；mac/linux/win行为须分别实际证据，未跑仍未验证。')
add('dev-rxdb-tauri-e2e', 'C5',
    ['src/devtools-release-isolation.spec.ts:53-117 capability/cfg regex与cargo-check', 'vitest.devtools.mts:26 include devtools-window/provider', 'src-tauri/src/lib.rs:388-395 编译期隔离'],
    'release-isolation部分是结构/regex和cargo-check，不是release WebView授权实测；devtools smoke是另一个debug binary目标，provider真/假档需独立确认。',
    '主控dev/release双binary、production无入口/资源/command、capability缺失与native provider；cargo成功不能代GUI。')
add('dev-rxdb-tauri-e2e', 'C6',
    ['vitest.smoke.mts:26-45 全spec排除两dev例、vitest.devtools.mts:26-32 仅两dev例', 'src/desktop-backup-restore.spec.ts:174-197 crossOS skipIf'],
    '两target覆盖边界已区分，default smoke与devtools不是普通e2e目标；跨OSskip/env限定必须逐项报告。当前strict lint/typecheck过，不预先写cargo/native smoke已过。',
    '主控后补两target实际logs/skip/失败/重跑/platform；未覆盖原完成条件维持partial。')

# 本对象仅残留闭环，没有运行时源码，不编造入口。
desktop = json.loads((base / 'desktop-closure.json').read_text())
rows['rxdb-adapter-desktop'] = [{
    'id': c['id'], 'status': 'closed', 'source': c['symbols'],
    'conclusion': c['conclusion'], 'remaining': '无本残留专项剩余项；Electron/Tauri真实宿主门禁仍在其对象保留未验证。',
    'evidence': c['evidence'],
} for c in desktop['checks']]

for o in scope:
    obj_root = str(root / o['sourceRoot']) + '/'
    for c in rows[o['object']]:
        absolute = []
        for ref in c['source']:
            if ref.startswith(('apps/', 'packages/', '.github/')):
                absolute.append(str(root) + '/' + ref)
            elif ref.startswith(('src/', 'src-tauri/', 'rust/', 'conformance/', 'scripts/', 'README.md', 'package.json', 'playwright.config.ts', 'vite.config.mts', 'vitest.')):
                absolute.append(obj_root + ref)
            else:
                absolute.append(ref)
        c['source'] = absolute

for o in scope:
    want = [c['id'] for c in criteria[o['object']]['criteria']]
    have = [c['id'] for c in rows[o['object']]]
    if want != have:
        raise ValueError((o['object'], want, have))

matrix = {
    'date': '2026-10-05', 'agent': 'integrations',
    'headAtInitialRead': '44de1138b4d396fc45d6e76ab60476c40fef2223',
    'policy': '每C为专项结论，不以源码存在、lint/typecheck或历史测试替代真实平台/认证/coverage。实际补跑由主控后写。',
    'objects': [{
        'object': o['object'], 'execution': 'complete' if o['object'] == 'rxdb-adapter-desktop' else 'partial',
        'criteria': rows[o['object']],
    } for o in scope],
}
(base / 'review-matrix.json').write_text(json.dumps(matrix, ensure_ascii=False, indent=2) + '\n')

current = {
    'date': '2026-10-05',
    'executor': '主控串行；本子任务未执行Nx build/test/e2e/coverage、server/容器/GUI/cargo',
    'logs': {
        'lint': '../validation/all-object-strict-lint.txt',
        'typecheck': '../validation/all-object-typecheck.txt',
    },
    'result': '69有效Nx对象 strict lint(--max-warnings=0)与typecheck成功；typecheck包含51依赖任务，禁本地/远端cache。',
    'scopeObjectsWithGates': [o['object'] for o in scope if o['object'] != 'rxdb-adapter-desktop'],
    'dependencyBuildsObservedInTypecheck': ['rxdb-adapter-electron:build', 'rxdb-adapter-tauri:build', 'rxdb-adapter-http:build', 'rxdb-adapter-supabase:build'],
    'notClaimed': ['本轮单测', '本轮真实HTTP/Supabase E2E', 'cargo-check/clippy/test', '真实desktop smoke/GUI', 'coverage', 'pack后consumer'],
    'lateProbe': {
        'path': 'apps/dev-rxdb-http-server/src/__tests__/review-parallel-change-broadcast-origin.spec.ts',
        'state': '新增在主控69对象lint/typecheck快照之后；未跑，不能继承原门禁；主控单独分流。',
    },
}
(base / 'current-gates.json').write_text(json.dumps(current, ensure_ascii=False, indent=2) + '\n')

past = {
    'policy': '先前执行，绝不折算本轮门禁；来自已读旧status/counts与独立执行记录。',
    'supabase': {
        'baselineHead': 'b7edef590051c8842d4914e30e31475977dea6ac',
        'appTestsStartedAt': '2026-10-05T07:48:48.996243+08:00', 'appTestsPassed': 47,
        'localE2EStartedAt': '2026-10-05T08:04:41.716989+08:00', 'localE2EPassed': 4,
        'remoteE2EStartedAt': '2026-10-05T08:05:52.957660+08:00', 'remoteE2EPassed': 2,
        'finalPackage': {'passed': 557, 'failed': 5, 'skipped': 0, 'original553AllPassed': True},
        'knownOpen': ['RV-059', 'RV-060', 'RV-061'],
        'sources': ['../../supabase/e2e-local-status.json', '../../supabase/e2e-remote-status.json', '../../supabase/app-all-tests-status.json', '../../supabase/final-counts.json'],
    },
    'httpDesktop': '2026-10-04及10-05前段已有真实HTTP/SQLite与取消加密取证，保留在各对象旧执行段；401/SWR与RV-058已修复，不重开。进程内host≠真实GUI/IPC。',
}
(base / 'prior-validation.json').write_text(json.dumps(past, ensure_ascii=False, indent=2) + '\n')

section = '## 2026-10-05：parallel integrations 逐 C 交付'
for o in scope:
    obj = o['object']
    if obj == 'rxdb-adapter-desktop':
        continue
    relative_matrix_from_plan = '../evidence/2026-10-05/parallel/integrations/review-matrix.json'
    relative_matrix_from_record = '../../evidence/2026-10-05/parallel/integrations/review-matrix.json'
    title_by_id = {c['id']: c['text'].split('|')[2].strip() for c in criteria[obj]['criteria']}
    table = ['| C / 专项 | 已核查源码符号 / 行与结论 | 证据 / 核销 | 具体未验证与补证动作 |',
             '| --- | --- | --- | --- |']
    for c in rows[obj]:
        anchors = '<br>'.join('`' + r.replace('|', '\\|') + '`' for r in c['source'])
        table.append('| ' + c['id'] + ' ' + title_by_id[c['id']] + ' | ' + anchors + '<br>' + c['conclusion'].replace('|','\\|') +
                     ' | 本轮源码分段核查；inspection/current-gates；**部分核销，动态未验证** | ' + c['remaining'].replace('|','\\|') + ' |')
    table_text = '\n'.join(table)
    for key in ['plan', 'record']:
        p = root / o[key]
        text = p.read_text()
        if section in text:
            text = text[:text.index(section)].rstrip() + '\n'
        if key == 'plan':
            # 只改变本对象专项状态，不把历史阶段误写成完成。
            lines = text.splitlines()
            for i, line in enumerate(lines):
                if re.match(r'\| C\d+\s+\|', line):
                    parts = line.split('|')
                    parts[-2] = ' 部分核查；见2026-10-05逐C结论 '
                    lines[i] = '|'.join(parts)
            text = '\n'.join(lines) + '\n'
            text = text.replace('- [ ] 每个 C 项都有明确结论与证据：', '- [x] 每个 C 项都有明确结论与证据：', 1)
            summary = '⚠️ **原完成条件未满足，execution维持in-progress，不能标complete。** 已完成逐C的源码结论/证据/未验证动作登记；这一个完成条件已核销，动态语义与全范围深审/覆盖率未完成。'
            matrix_link = relative_matrix_from_plan
            evidence_prefix = '../evidence/2026-10-05/parallel/'
        else:
            text = text.replace('execution: complete', 'execution: partial', 1)
            summary = '⚠️ **部分执行，仍为partial，不作全对象通过评级。** 逐C静态判断已落盘，不等于各C最低动态场景全部通过；下方是本轮权威状态，前面启动批/旧成功仅历史。'
            matrix_link = relative_matrix_from_record
            evidence_prefix = '../../evidence/2026-10-05/parallel/'
        late_note = ('\n\n**晚于门禁快照新增的探针**：`src/__tests__/review-parallel-change-broadcast-origin.spec.ts` 未运行，也未继承上述lint/typecheck；已列验证请求交主控分流。' if obj == 'dev-rxdb-http-server' else '')
        history_note = (
            '\n\nSupabase历史基线：`b7edef590051c8842d4914e30e31475977dea6ac`，2026-10-05 07:48 app:test 47、08:04 local4、08:05 remote2；package交付557pass/5fail/0skip，原553全过。**不是这次parallel门禁**。RV-059/060/061仍Open，只引用不重复登记。'
            if 'supabase' in obj else
            '\n\n已有2026-10-04/05前段HTTP/SQLite/进程内host证据仅保留历史；历史401/SWR/outbox修复不重新登记，RV-058已Resolved。进程内host不是GUI/真实IPC。'
        )
        notes = '\n\n未读文件/非全文片段仍在inspection盘点中，没有把导航之外源码默认判已审。coverage四指标无本轮测量；发布consumer、未跑平台、真实认证/外部服务不足按未验证列出，**不标不适用**。不改业务/依赖/既有tests；不写core/插件文档；不等待或自行启动新环境。'
        appended = '\n' + section + '\n\n' + summary + '\n\n' + (
            '主控当轮门禁：69个有效Nx对象`lint --max-warnings=0`与`typecheck`实际成功；typecheck含51依赖任务，均跳过本地/远端cache。本范围13个有效对象在内；四个adapter包build出现在typecheck依赖链，**不代替app打包/测试/cargo/真实宿主/认证/coverage**。'
        ) + '\n\n日志：[' + 'strict lint' + '](' + evidence_prefix + 'validation/all-object-strict-lint.txt)、[typecheck](' + evidence_prefix + 'validation/all-object-typecheck.txt)；[当轮门禁限定](' + evidence_prefix + 'integrations/current-gates.json)。' + late_note + history_note + '\n\n' + table_text + '\n\n证据：[逐C矩阵](' + matrix_link + ')、[实际阅读](' + evidence_prefix + 'integrations/file-inspection.json)、[验证请求](' + evidence_prefix + 'integrations/validation-requests.json)、[待主控去重候选](' + evidence_prefix + 'integrations/findings.pending.md)、[历史验证分账](' + evidence_prefix + 'integrations/prior-validation.json)。' + notes + '\n'
        p.write_text(text.rstrip() + '\n' + appended)

p = root / 'requirements/reviews/packages/rxdb-adapter-desktop.md'
t = p.read_text().replace('所有 C 项仍需逐项取证，不能由整体门禁结果自动打勾。', '启动批为历史；本轮C1–C3已按独立残留证据核销，见下节，非整体门禁自动打勾。')
p.write_text(t)
p = root / 'requirements/reviews/results/packages/rxdb-adapter-desktop.md'
t = p.read_text().replace('### 尚未完成的专项', '### 启动批专项清单（2026-10-05已核销）', 1).replace('以下为原计划 C 项，状态保持待核销；门禁通过不自动勾选：', '以下为原计划C项，2026-10-05残留只读专项已核销；并非由运行时门禁自动勾选：', 1)
p.write_text(t)

closed = sum(c['status'] == 'closed' for cs in rows.values() for c in cs)
print('wrote plans/records for 14 objects; C count', sum(len(x) for x in rows.values()), 'closed', closed, 'partial objects', 13)
