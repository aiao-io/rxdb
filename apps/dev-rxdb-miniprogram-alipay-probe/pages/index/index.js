/**
 * US-211 支付宝可行性探针（逻辑层）。打开页面自动跑，报告显示在页面上并打到控制台。
 *
 * 只回答矩阵「支付宝 `my`」一节的阻断项，不加载 adapter：
 * - wasm：逻辑层能否用 `MYWebAssembly` / `WebAssembly` 实例化代码包里的 `/wasm/add.wasm`
 * - random：有没有安全随机源（`my.getRandomValues`、`crypto.getRandomValues`、`my` 上名字像随机源的成员）
 * - fileSystem：同步 FS 方法出错时是抛异常还是返回错误对象、`readFileSync` 的返回形态
 * - worker：Worker 线程里的 `MYWebAssembly` 与 `my`（见 `workers/index.js`）
 */

/** 与 `wasm/add.wasm` 同一份字节，给只收字节的标准 `WebAssembly` 用。 */
var ADD_WASM_BYTES = [
  0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x01, 0x07, 0x01, 0x60, 0x02, 0x7f, 0x7f, 0x01, 0x7f, 0x03, 0x02,
  0x01, 0x00, 0x07, 0x07, 0x01, 0x03, 0x61, 0x64, 0x64, 0x00, 0x00, 0x0a, 0x09, 0x01, 0x07, 0x00, 0x20, 0x00, 0x20,
  0x01, 0x6a, 0x0b
];
var ADD_WASM_PATH = '/wasm/add.wasm';
var WORKER_PATH = 'workers/index.js';
var STEP_TIMEOUT_MS = 8000;

/** 按内部标签判断：IDE 模拟器的 FS 返回别的 realm 的 ArrayBuffer，instanceof 恒为假。 */
function isArrayBuffer(value) {
  return Object.prototype.toString.call(value) === '[object ArrayBuffer]';
}

/** 把任意值压成可 JSON 化的记录；错误与平台错误对象只取诊断字段。 */
function describe(value) {
  if (value === undefined) return { type: 'undefined' };
  if (value === null) return { type: 'null' };
  if (isArrayBuffer(value)) {
    return {
      type: 'ArrayBuffer',
      byteLength: value.byteLength,
      head: Array.prototype.slice.call(new Uint8Array(value), 0, 8)
    };
  }
  if (typeof value !== 'object') return { type: typeof value, value: typeof value === 'function' ? undefined : value };
  var record = {
    type: 'object',
    ctor: value.constructor && value.constructor.name,
    keys: Object.keys(value).slice(0, 20)
  };
  ['name', 'message', 'errMsg', 'error', 'errorMessage', 'errorCode', 'errNo', 'dataType'].forEach(function (key) {
    if (value[key] !== undefined) record[key] = value[key];
  });
  if (value.data !== undefined) record.data = describe(value.data);
  return record;
}

/** 同步调用一次，区分「抛了」与「返回了」。 */
function call(run) {
  try {
    return { threw: false, result: describe(run()) };
  } catch (error) {
    return { threw: true, error: describe(error) };
  }
}

/** 整段探测抛了也不拖垮其余段；结果原样保留，不经 describe 压缩。 */
function section(run) {
  try {
    return run();
  } catch (error) {
    return { sectionThrew: describe(error) };
  }
}

function typeOf(read) {
  try {
    return typeof read();
  } catch (error) {
    return 'throws: ' + String(error);
  }
}

function withTimeout(promise, label) {
  return new Promise(function (resolve) {
    var timer = setTimeout(function () {
      resolve({ settled: false, timeout: label + ' 超过 ' + STEP_TIMEOUT_MS + 'ms 未完成' });
    }, STEP_TIMEOUT_MS);
    promise.then(
      function (value) {
        clearTimeout(timer);
        resolve({ settled: true, ok: true, value: value });
      },
      function (error) {
        clearTimeout(timer);
        resolve({ settled: true, ok: false, error: describe(error) });
      }
    );
  });
}

function probeEnvironment() {
  var info;
  try {
    var system = my.getSystemInfoSync();
    info = {
      platform: system.platform,
      system: system.system,
      version: system.version,
      model: system.model,
      app: system.app
    };
  } catch (error) {
    info = { threw: true, error: describe(error) };
  }
  return {
    systemInfo: info,
    SDKVersion:
      (
        typeOf(function () {
          return my.SDKVersion;
        }) === 'string'
      ) ?
        my.SDKVersion
      : null,
    userDataPath:
      (
        typeOf(function () {
          return my.env.USER_DATA_PATH;
        }) === 'string'
      ) ?
        my.env.USER_DATA_PATH
      : null,
    freeGlobals: {
      globalThis: typeOf(function () {
        return globalThis;
      }),
      global: typeOf(function () {
        return global;
      }),
      window: typeOf(function () {
        return window;
      }),
      self: typeOf(function () {
        return self;
      }),
      my: typeOf(function () {
        return my;
      }),
      MYWebAssembly: typeOf(function () {
        return MYWebAssembly;
      }),
      WebAssembly: typeOf(function () {
        return WebAssembly;
      }),
      crypto: typeOf(function () {
        return crypto;
      }),
      BigInt: typeOf(function () {
        return BigInt;
      }),
      queueMicrotask: typeOf(function () {
        return queueMicrotask;
      }),
      TextEncoder: typeOf(function () {
        return TextEncoder;
      }),
      TextDecoder: typeOf(function () {
        return TextDecoder;
      }),
      FinalizationRegistry: typeOf(function () {
        return FinalizationRegistry;
      })
    },
    sloppyThis: typeOf(function () {
      return (function () {
        return this;
      })();
    }),
    canIUse: {
      getRandomValues: call(function () {
        return my.canIUse('getRandomValues');
      }),
      createWorker: call(function () {
        return my.canIUse('createWorker');
      })
    }
  };
}

function runAdd(instantiated) {
  var instance = instantiated && instantiated.instance ? instantiated.instance : instantiated;
  return instance.exports.add(2, 3);
}

function probeWasm() {
  var attempts = {};
  var pending = [];
  if (typeof MYWebAssembly === 'object' || typeof MYWebAssembly === 'function') {
    attempts.MYWebAssemblyKeys = Object.getOwnPropertyNames(MYWebAssembly);
    pending.push(
      withTimeout(
        Promise.resolve().then(function () {
          return MYWebAssembly.instantiate(ADD_WASM_PATH, {});
        }),
        'MYWebAssembly.instantiate'
      ).then(function (outcome) {
        attempts.MYWebAssembly =
          outcome.ok ?
            {
              settled: true,
              ok: true,
              add: call(function () {
                return runAdd(outcome.value);
              })
            }
          : outcome;
      })
    );
  } else {
    attempts.MYWebAssembly = 'absent';
  }
  if (typeof WebAssembly === 'object') {
    pending.push(
      withTimeout(
        Promise.resolve().then(function () {
          return WebAssembly.instantiate(new Uint8Array(ADD_WASM_BYTES), {});
        }),
        'WebAssembly.instantiate'
      ).then(function (outcome) {
        attempts.WebAssembly =
          outcome.ok ?
            {
              settled: true,
              ok: true,
              add: call(function () {
                return runAdd(outcome.value);
              })
            }
          : outcome;
      })
    );
  } else {
    attempts.WebAssembly = 'absent';
  }
  return Promise.all(pending).then(function () {
    return attempts;
  });
}

function myMemberNames() {
  var names = {};
  var target = my;
  while (target && target !== Object.prototype) {
    Object.getOwnPropertyNames(target).forEach(function (name) {
      names[name] = true;
    });
    target = Object.getPrototypeOf(target);
  }
  // for-in 兜不住 getter 定义在代理上的情况，两种枚举取并集
  for (var name in my) names[name] = true;
  return Object.keys(names).sort();
}

function probeRandom() {
  var members = myMemberNames();
  var result = {
    myMemberCount: members.length,
    suspicious: members.filter(function (name) {
      return /random|crypto|secur|uuid|cipher|rsa|hash|entropy/i.test(name);
    }),
    myGetRandomValues: typeOf(function () {
      return my.getRandomValues;
    }),
    cryptoGetRandomValues: typeOf(function () {
      return crypto.getRandomValues;
    }),
    myMembers: members
  };
  if (typeof crypto === 'object' && typeof crypto.getRandomValues === 'function') {
    result.cryptoCall = call(function () {
      var bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      return Array.prototype.slice.call(bytes);
    });
  }
  if (typeof my.getRandomValues !== 'function') return Promise.resolve(result);
  return withTimeout(
    new Promise(function (resolve, reject) {
      var returned = my.getRandomValues({ length: 16, success: resolve, fail: reject });
      if (returned && typeof returned.then === 'function') returned.then(resolve, reject);
    }),
    'my.getRandomValues'
  ).then(function (outcome) {
    result.myCall = outcome.ok ? { ok: true, value: describe(outcome.value) } : outcome;
    return result;
  });
}

function probeFileSystem() {
  var fs = my.getFileSystemManager();
  var root = my.env.USER_DATA_PATH + '/alipay-probe';
  var file = root + '/bin';
  var bytes = new Uint8Array([0, 1, 2, 250, 251, 252, 253, 254, 255]);
  var methods = {};
  [
    'accessSync',
    'mkdirSync',
    'readFileSync',
    'writeFileSync',
    'appendFileSync',
    'unlinkSync',
    'renameSync',
    'statSync',
    'readdirSync',
    'rmdirSync',
    'truncateSync',
    'openSync',
    'writeSync',
    'readSync',
    'closeSync'
  ].forEach(function (name) {
    methods[name] = typeof fs[name];
  });
  var steps = {
    cleanup: call(function () {
      return fs.rmdirSync(root, true);
    }),
    mkdir: call(function () {
      return fs.mkdirSync(root, true);
    }),
    mkdirExisting: call(function () {
      return fs.mkdirSync(root);
    }),
    accessMissing: call(function () {
      return fs.accessSync(root + '/missing');
    }),
    readMissing: call(function () {
      return fs.readFileSync(root + '/missing');
    }),
    writeBinary: call(function () {
      return fs.writeFileSync(file, bytes.buffer);
    }),
    accessExisting: call(function () {
      return fs.accessSync(file);
    }),
    readBinary: call(function () {
      return fs.readFileSync(file);
    }),
    stat: call(function () {
      return fs.statSync(file);
    }),
    renameToExisting: call(function () {
      fs.writeFileSync(root + '/other', 'x', 'utf8');
      return fs.renameSync(root + '/other', file);
    }),
    unlinkMissing: call(function () {
      return fs.unlinkSync(root + '/missing');
    })
  };
  // 写入方式各走一遍再读回：模拟器把 ArrayBuffer 存成 base64 文本，只有 base64 串 + 'base64' 编码落成原始字节
  var writes = {
    arrayBuffer: function (path) {
      return fs.writeFileSync(path, bytes.buffer);
    },
    arrayBufferBinary: function (path) {
      return fs.writeFileSync(path, bytes.buffer, 'binary');
    },
    base64String: function (path) {
      return fs.writeFileSync(path, my.arrayBufferToBase64(bytes.buffer), 'base64');
    },
    typedArray: function (path) {
      return fs.writeFileSync(path, bytes);
    }
  };
  var roundTrip = { expected: Array.prototype.slice.call(bytes).join(',') };
  Object.keys(writes).forEach(function (name) {
    var path = root + '/rt-' + name;
    roundTrip[name] = {
      write: call(function () {
        return writes[name](path);
      }),
      size: call(function () {
        return fs.statSync(path).stats.size;
      }),
      read: call(function () {
        var read = fs.readFileSync(path);
        var data = isArrayBuffer(read) ? read : read && read.data;
        if (!isArrayBuffer(data)) return read;
        return Array.prototype.slice.call(new Uint8Array(data)).join(',');
      })
    };
  });
  return { userDataPath: my.env.USER_DATA_PATH, methods: methods, steps: steps, roundTrip: roundTrip };
}

Page({
  data: { status: '运行中…', report: '' },

  onLoad: function () {
    this.run();
  },

  run: function () {
    var page = this;
    var report = { probe: 'alipay-probe v2', startedAt: new Date().toISOString() };
    page.setData({ status: '运行中…', report: '' });
    report.environment = section(probeEnvironment);
    report.fileSystem = section(probeFileSystem);
    Promise.all([
      probeWasm().then(function (value) {
        report.wasm = value;
      }),
      probeRandom().then(function (value) {
        report.random = value;
      }),
      page.runWorker().then(function (value) {
        report.worker = value;
      })
    ])
      .catch(function (error) {
        report.fatal = describe(error);
      })
      .then(function () {
        var text = JSON.stringify(report, null, 2);
        console.log('[alipay-probe] 报告\n' + text);
        page.setData({ status: '完成', report: text });
      });
  },

  runWorker: function () {
    if (typeof my.createWorker !== 'function') return Promise.resolve('my.createWorker 不存在');
    var worker;
    var created = call(function () {
      worker = my.createWorker(WORKER_PATH, { useExperimentalWorker: true });
      return worker;
    });
    if (!worker) return Promise.resolve({ created: created });
    return withTimeout(
      new Promise(function (resolve) {
        worker.onMessage(function (message) {
          resolve(message);
        });
        worker.postMessage({ wasmPath: ADD_WASM_PATH, bytes: ADD_WASM_BYTES });
      }),
      'worker 回报'
    ).then(function (outcome) {
      call(function () {
        return worker.terminate();
      });
      return { created: created, outcome: outcome };
    });
  },

  rerun: function () {
    this.run();
  },

  copy: function () {
    my.setClipboard({ text: this.data.report });
    my.showToast({ content: '已复制报告' });
  }
});
