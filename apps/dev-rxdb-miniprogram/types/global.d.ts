/// <reference types="@tarojs/taro" />

declare module '*.png';
declare module '*.gif';
declare module '*.jpg';
declare module '*.jpeg';
declare module '*.svg';
declare module '*.css';
declare module '*.less';
declare module '*.scss';
declare module '*.sass';
declare module '*.styl';

interface WechatMiniProgramFileSystemManager {
  accessSync(path: string): void;
  mkdirSync(path: string, recursive?: boolean): void;
  readFileSync(path: string, encoding: 'base64'): string;
  unlinkSync(path: string): void;
  writeFileSync(path: string, data: ArrayBuffer): void;
}

interface WechatRandomValuesResult {
  readonly randomValues: ArrayBuffer;
  readonly errMsg: string;
}

interface WechatRandomValuesOptions {
  readonly length: number;
  readonly success?: (result: WechatRandomValuesResult) => void;
  readonly fail?: (error: { readonly errMsg: string }) => void;
}

interface WechatMiniProgramApi {
  readonly env: {
    readonly USER_DATA_PATH: string;
  };
  getFileSystemManager(): WechatMiniProgramFileSystemManager;
  getRandomValues?(options: WechatRandomValuesOptions): unknown;
}

interface WechatWasmInstance {
  readonly exports: WebAssembly.Exports;
}

interface WechatWasmRuntime {
  instantiate(
    path: string,
    imports: WebAssembly.Imports
  ): Promise<WechatWasmInstance | { readonly instance: WechatWasmInstance; readonly module?: unknown }>;
}

declare const wx: WechatMiniProgramApi;
declare const WXWebAssembly: WechatWasmRuntime;

declare namespace NodeJS {
  interface ProcessEnv {
    /** NODE 内置环境变量, 会影响到最终构建生成产物 */
    NODE_ENV: 'development' | 'production',
    /** 当前构建的平台 */
    TARO_ENV: 'weapp' | 'swan' | 'alipay' | 'h5' | 'rn' | 'tt' | 'qq' | 'jd' | 'harmony' | 'jdrn'
    /**
     * 当前构建的小程序 appid
     * @description 若不同环境有不同的小程序，可通过在 env 文件中配置环境变量`TARO_APP_ID`来方便快速切换 appid， 而不必手动去修改 dist/project.config.json 文件
     * @see https://taro-docs.jd.com/docs/next/env-mode-config#特殊环境变量-taro_app_id
     */
    TARO_APP_ID: string
  }
}
