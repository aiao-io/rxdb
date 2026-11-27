/// <reference types="vite/client" />

// @angular/build 以 Vite 为基础：开发构建提供 import.meta.env，生产构建把它定死成常量并摇树，
// 因此 rxdb-config.ts 里 import.meta.env.DEV 守卫的 devtools 动态导入不会进入生产 bundle。
