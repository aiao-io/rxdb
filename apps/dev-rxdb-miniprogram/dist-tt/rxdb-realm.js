"use strict";
let realm;
exports.capture = function (value) {
  if (typeof value !== "object" || value === null || typeof value.Object !== "function" || !value.Object.prototype.isPrototypeOf({})) {
    throw new Error("入口 app.js 拿不到真实全局对象（非严格函数的 this 是 " + typeof value + "），抖音产物无法绑定 globalThis");
  }
  realm = value;
};
exports.realm = function () {
  if (realm === undefined) throw new Error("rxdb-realm.js 在入口登记之前被读取：检查 app.js 开头的登记语句");
  return realm;
};
