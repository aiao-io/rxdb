import { useLaunch } from '@tarojs/taro';
import type { PropsWithChildren } from 'react';
import { captureRuntimeGlobal } from './runtime-global-capture';

if (process.env.TARO_ENV === 'tt') {
  // 本文件打进非严格模式的 app.js，非严格函数的 this 就是真实全局对象（抖音页面模块里 globalThis 是 undefined）
  captureRuntimeGlobal(
    (function (this: unknown) {
      return this;
    })()
  );
}

function App({ children }: PropsWithChildren) {
  useLaunch(() => {
    console.log('App launched.');
  });

  // children 是将要会渲染的页面
  return children;
}

export default App;
