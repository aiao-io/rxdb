/**
 * @fileoverview Aiao 工具函数库
 * 提供常用的工具函数，包括数组、异步、日期、加密、对象、字符串等
 *
 * @module @aiao/utils
 */

/**
 * 浏览器特定 API 封装
 * - IdleTimer: 空闲计时器
 * - leader-election: Leader 选举
 * - broadcast-channel-pool: 广播频道池
 * - opfs-detection: OPFS 检测
 * - perform-chunk: 分块执行
 * - requestIdleCallbackPolyfill: requestIdleCallback 垫片
 */
export * from './@browser/index.js';

/**
 * 数组操作工具
 * - chunk: 将数组分块
 * - flatten: 展平数组
 * - flattenDeep: 深度展平数组
 * - difference: 获取数组差集
 * - intersection: 获取数组交集
 * - unionBy: 根据条件合并数组
 * - sortBy: 多字段排序
 * - orderBy: 按字段排序
 * - needArray: 确保是数组
 */
export * from './array/index.js';

/**
 * 异步操作工具
 * - sleep: 延迟执行
 * - nextMacroTask: 下一个宏任务
 * - nextMicroTask: 下一个微任务
 * - AsyncQueueExecutor: 异步队列执行器
 */
export * from './async/index.js';

/**
 * 二进制操作工具
 * - uint8ArrayToString: Uint8Array 转字符串
 */
export * from './binary/index.js';

/**
 * 集合操作工具
 * - traverseObjectKeys: 遍历对象键值
 */
export * from './collection/index.js';

/**
 * Cron 表达式工具
 * - describeCron: 解析 Cron 表达式
 */
export * from './cron/index.js';

/**
 * 加密解密工具
 * - aesEncrypt/aesDecrypt: AES 加解密
 * - rsaEncrypt/rsaDecrypt: RSA 加解密
 * - rsaGenerateKey: 生成 RSA 密钥对
 * - base64Encode/base64Decode: Base64 编解码
 * - decodeJWTPayload: 解码 JWT payload
 */
export * from './crypto/index.js';

/**
 * 日期时间工具
 * - dateStringToDate: 日期字符串转 Date
 * - dateStringWithTimezone: 带时区的日期字符串
 * - formatPassTime: 格式化流逝时间
 * - formatCountdown: 格式化倒计时
 * - canBeDate: 是否可以转换为日期
 * - isISODateString: 是否是 ISO 日期字符串
 * - isMSTime: 是否是毫秒时间戳
 * - msTimeToMilliseconds: 毫秒时间转换
 * - unixTimestamp: Unix 时间戳
 * - stringTime/parseTime: 字符串时间解析
 */
export * from './date/index.js';

/**
 * 文件操作工具
 * - fileToBase64: 文件转 Base64
 * - getFileExtension: 获取文件扩展名
 * - getImageDimensions: 获取图片尺寸
 */
export * from './file/index.js';

/**
 * 存储 UI 契约接口
 */
export * from './file/storage-ui-contract.js';

/**
 * 函数工具
 * - debounce: 防抖
 * - throttle: 节流
 * - once: 单次执行
 * - emptyFunction: 空函数
 */
export * from './function/index.js';

/**
 * 分数索引算法
 * 用于生成介于两个值之间的唯一字符串
 */
export * from './indexing/fractional-indexing.js';

/**
 * 生命周期作用域
 * - LifecycleScope: 成对登记「取得所有权 + 如何放弃」，到期逆序、串行撤销
 * - ScopeDisposer: 撤销一次登记的句柄
 * - AcquireResult: acquire() 的 setup 返回值
 * - ScopeEntry: getEntries() 的快照节点
 * - LifecycleScopeDisposedError: 在非 active 作用域上登记时抛出
 */
export * from './lifecycle/index.js';

/**
 * 数字工具
 * - canBeNumber: 是否可以转换为数字
 * - toInt: 转换为整数
 * - numberStrip: 去除多余小数位
 * - tryToNumber: 尝试转换为数字
 * - numberStep: 数字步进
 * - numberStepScreenSize: 屏幕尺寸步进
 */
export * from './number/index.js';

/**
 * 对象工具
 * - get/has/pick/omit: 对象属性操作
 * - set/setWith: 设置对象属性
 * - isEqual/isEqualDate/isEqualUint8Array: 相等性判断
 * - cloneDeep: 深拷贝
 * - deepFreeze: 深度冻结
 * - toPlainObject: 转换为普通对象
 * - flattenPathObjectToPlainObject/zipObject: 路径对象操作
 * - getTag: 获取对象标签
 */
export * from './object/index.js';

/**
 * 平台检测工具
 * - isBrowser: 是否是浏览器环境
 */
export * from './platform/index.js';

/**
 * 随机数工具
 * - randomString: 随机字符串
 * - randomInt: 随机整数
 * - randomFloat: 随机浮点数
 * - randomUintString: 无符号随机字符串
 * - randomUintByLength: 按长度生成随机数
 * - randomArrayItem: 随机数组元素
 */
export * from './random/index.js';

/**
 * 字符串工具
 * - camelCase/kebabCase/snakeCase/startCase: 命名格式转换
 * - capitalize/uncapitalize: 首字母大小写
 * - getWords: 获取单词列表
 * - stringToArrayBuffer: 字符串转 ArrayBuffer
 * - stringSingleline: 单行字符串
 * - compressToBase64Url/decompressFromBase64Url: Base64 URL 编解码
 * - rmb: 人民币格式化
 * - queryParse/queryStringify: URL 查询参数解析/序列化
 * - urlJoin: URL 拼接
 * - similarity: 字符串相似度
 * - parseChineseNumber: 解析中文数字
 */
export * from './string/index.js';

/**
 * 工具集
 * - event: 事件工具
 * - image: 图片工具
 */
export * from './tools/index.js';

/**
 * 日志工具
 */
export * from './tools/log.js';

/**
 * 类型定义导出
 */
export * from './type-definition/index.js';

/**
 * 类型判断工具
 * - isArray/isObject/isFunction/isString/isNumber/isBoolean: 基本类型判断
 * - isDate/isRegExp/isSymbol/isPromise: 特殊类型判断
 * - isNil/isEmpty/isPrimitive/isPlainObject: 空值/原始类型判断
 * - isInt/isFloat/isIntArray/isNumberArray: 数值类型判断
 * - isArrayBuffer/isUint8Array: 缓冲类型判断
 * - DeepPartial/AnyFunction: 类型工具
 */
export * from './types/index.js';
