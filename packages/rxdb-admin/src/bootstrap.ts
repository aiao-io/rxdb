/** {@link createBootstrapScript} 的选项。 */
export interface BootstrapScriptOptions {
  /** 偏好存储键，必须与外壳的 `storagePrefix` 对应（`<prefix>.preferences`）。 */
  readonly storageKey: string;
  /** `system` 在浅色系统下对应的主题名，缺省 `light`。 */
  readonly lightTheme?: string;
  /** `system` 在深色系统下对应的主题名，缺省 `dark`。 */
  readonly darkTheme?: string;
}

/**
 * 生成放在 `<head>` 里的内联脚本：在 JS 包加载之前就把已保存的主题、主色、圆角、字号与灰 / 弱色模式
 * 写到 `<html>` 上，避免首屏闪烁。逻辑与外壳 `attach()` 写入的结果一致（有对拍测试守着）。
 * @param options - 存储键与 `system` 对应的主题名。
 * @returns 可直接放进 `<script>` 标签的 JS 文本。
 */
export function createBootstrapScript(options: BootstrapScriptOptions): string {
  const { storageKey, lightTheme = 'light', darkTheme = 'dark' } = options;
  return `(function(){try{
var el=document.documentElement,raw=localStorage.getItem(${JSON.stringify(storageKey)}),v=null;
try{v=raw?JSON.parse(raw):null}catch(e){}
var s=v&&v.version===1&&v.values||{},t=s.theme||{},a=s.app||{},name=t.name||'system';
if(name==='system')name=matchMedia('(prefers-color-scheme: dark)').matches?${JSON.stringify(darkTheme)}:${JSON.stringify(lightTheme)};
el.setAttribute('data-theme',name);
var c=t.colorPrimary;
if(/^#[0-9a-f]{6}$/i.test(c||'')){var n=parseInt(c.slice(1),16),r=[n>>16&255,n>>8&255,n&255].map(function(x){x/=255;return x<=0.03928?x/12.92:Math.pow((x+0.055)/1.055,2.4)}),
l=0.2126*r[0]+0.7152*r[1]+0.0722*r[2];
el.style.setProperty('--color-primary',c);
el.style.setProperty('--color-primary-content',1.05/(l+0.05)>=(l+0.05)/0.05?'#ffffff':'#000000')}
if(t.radius!=null&&t.radius!==undefined){var q=t.radius+'rem';['selector','field','box'].forEach(function(k){el.style.setProperty('--radius-'+k,q)})}
if(typeof t.fontSize==='number')el.style.setProperty('font-size',t.fontSize+'px');
if(a.colorWeakMode)el.setAttribute('data-color-mode','weak');else if(a.colorGrayMode)el.setAttribute('data-color-mode','gray');
}catch(e){}})();`;
}
