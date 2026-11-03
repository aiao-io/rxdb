/** 固定运行时依赖到自托管资源的映射。 */
export function workbenchImportMap(assetBaseURL: string): Record<string, string> {
  const base = new URL(assetBaseURL, location.href);
  const modules = {
    react: 'react',
    'react-dom/client': 'react-dom-client',
    'react/jsx-runtime': 'react-jsx-runtime',
    'react/jsx-dev-runtime': 'react-jsx-dev-runtime',
    vue: 'vue',
    '@angular/core': 'angular-core',
    '@angular/common': 'angular-common',
    '@angular/platform-browser': 'angular-platform-browser',
    '@angular/compiler': 'angular-compiler',
    rxjs: 'rxjs',
    'rxjs/operators': 'rxjs-operators'
  };
  return Object.fromEntries(
    Object.entries(modules).map(([name, file]) => [name, new URL(`runtime/${file}.js`, base).href])
  );
}
