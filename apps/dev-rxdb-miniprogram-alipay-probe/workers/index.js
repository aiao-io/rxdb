/**
 * US-211 支付宝可行性探针（Worker 线程）。文档说 MYWebAssembly 只能在这里用、这里没有 my 系列 API，逐条实测。
 * 收到页面的 { wasmPath, bytes } 后回报一次。
 */
function typeOf(read) {
  try {
    return typeof read();
  } catch (error) {
    return 'throws: ' + String(error);
  }
}

function describe(value) {
  if (value === undefined || value === null) return String(value);
  if (typeof value !== 'object') return typeof value === 'function' ? 'function' : value;
  var record = { ctor: value.constructor && value.constructor.name };
  ['name', 'message', 'errMsg', 'error', 'errorMessage'].forEach(function (key) {
    if (value[key] !== undefined) record[key] = value[key];
  });
  return record;
}

function runAdd(instantiated) {
  var instance = instantiated && instantiated.instance ? instantiated.instance : instantiated;
  return instance.exports.add(2, 3);
}

function attempt(run) {
  return Promise.resolve()
    .then(run)
    .then(
      function (instantiated) {
        try {
          return { ok: true, add: runAdd(instantiated) };
        } catch (error) {
          return { ok: false, stage: 'call', error: describe(error) };
        }
      },
      function (error) {
        return { ok: false, stage: 'instantiate', error: describe(error) };
      }
    );
}

worker.onMessage(function (message) {
  var report = {
    freeGlobals: {
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
      TextDecoder: typeOf(function () {
        return TextDecoder;
      })
    },
    getFileSystemManager: typeOf(function () {
      return my.getFileSystemManager;
    })
  };
  report.cryptoGetRandomValues = (function () {
    try {
      var pool = crypto.getRandomValues(new Uint8Array(16));
      return { ok: true, length: pool.length, distinct: new Set(Array.prototype.slice.call(pool)).size };
    } catch (error) {
      return { ok: false, error: describe(error) };
    }
  })();
  var pending = [];
  if (report.freeGlobals.MYWebAssembly === 'object' || report.freeGlobals.MYWebAssembly === 'function') {
    pending.push(
      attempt(function () {
        return MYWebAssembly.instantiate(message.wasmPath, {});
      }).then(function (outcome) {
        report.MYWebAssembly = outcome;
      })
    );
  }
  if (report.freeGlobals.WebAssembly === 'object') {
    pending.push(
      attempt(function () {
        return WebAssembly.instantiate(new Uint8Array(message.bytes), {});
      }).then(function (outcome) {
        report.WebAssembly = outcome;
      })
    );
  }
  Promise.all(pending).then(function () {
    worker.postMessage(report);
  });
});
