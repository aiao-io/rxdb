/**
 * @fileoverview 支付宝小程序 Worker：经 Worker 里的 `crypto.getRandomValues` 给逻辑层供随机数。
 *
 * 逻辑层没有任何安全随机源，Worker 里有 `crypto.getRandomValues`（US-211 支付宝探针模拟器与 iOS 实测，文档未承诺，
 * 即可行性矩阵 `undocumented` 的 `worker-crypto-random`）。协议与 `src/hosts/alipay-random.ts` 一一对应：
 *
 * - 请求 `{ type: 'random', id, length }`：`id` 为非负整数，`length` 为 0..65536 的整数；
 * - 回复 `{ id, ok: true, value }`（`value` 是 `length` 个 0..255 整数的普通数组），或 `{ id, ok: false, error }`；
 *   请求本身不合法时 `id` 为 -1。
 *
 * 手写 ES5、不 import 任何模块：开发者工具编译 Worker 时注入的 core-js 读自由变量 `Function`，Worker 里没有它，
 * 应用要在 `mini.project.json` 用 `compileOptions.transpile.script.ignore` 跳过转译，被跳过的文件按 ES5 做语法检查。
 * 只用 ES5 内置（不用 `Number.isInteger` / `Array.from`）；Worker 里没有 `my`，平台注入自由变量 `worker`。
 */
(function () {
  'use strict';

  var MAX_LENGTH = 65536;

  function isIndex(value, max) {
    return typeof value === 'number' && value >= 0 && value <= max && Math.floor(value) === value;
  }

  function fail(id, error) {
    worker.postMessage({ id: id, ok: false, error: error });
  }

  function randomValues(length) {
    if (typeof crypto !== 'object' || crypto === null || typeof crypto.getRandomValues !== 'function') {
      throw new Error('Worker 里没有 crypto.getRandomValues');
    }
    var bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    var value = [];
    for (var index = 0; index < length; index++) value.push(bytes[index]);
    return value;
  }

  worker.onMessage(function (message) {
    var valid = typeof message === 'object' && message !== null && isIndex(message.id, 9007199254740991);
    if (!valid) return fail(-1, '不合法的请求：缺非负整数 id');
    if (message.type !== 'random') return fail(message.id, '不认识的请求类型：' + String(message.type));
    if (!isIndex(message.length, MAX_LENGTH)) {
      return fail(message.id, 'length 必须是 0..' + MAX_LENGTH + ' 的整数：' + String(message.length));
    }
    var value;
    try {
      value = randomValues(message.length);
    } catch (error) {
      return fail(message.id, String(error && error.message ? error.message : error));
    }
    worker.postMessage({ id: message.id, ok: true, value: value });
  });
})();
