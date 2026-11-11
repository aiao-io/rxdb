/* eslint-disable */
// 运行时已经落到 Angular 的 TypeScript 编译链中，后续按领域拆成独立服务和组件。
// 这里暂时保留原始行为的顺序，避免迁移过程中破坏窗口、Dock 和应用状态之间的隐式依赖。
// @ts-nocheck
import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class DesktopRuntimeService {
  private started = false;

  start(): void {
    if (this.started) return;
    this.started = true;
    window.__AIAO_DESKTOP_RUNTIME_LOADED__ = true;

/* Apple-style continuous-corner squircle, built before first paint so icons
   never flash with the wrong silhouette. |x|^n + |y|^n = 1, n = 5. */
(function(){
  function path(S, prec){
    var pts=[], steps=64, i, t, c, s, x, y;
    for(i=0;i<=steps;i++){
      t=2*Math.PI*i/steps; c=Math.cos(t); s=Math.sin(t);
      x=Math.sign(c)*Math.pow(Math.abs(c),0.4);
      y=Math.sign(s)*Math.pow(Math.abs(s),0.4);
      pts.push([S/2*(1+x), S/2*(1+y)]);
    }
    var N=pts.length-1, f=function(v){return v.toFixed(prec)}, d='M'+f(pts[0][0])+' '+f(pts[0][1]);
    for(i=0;i<N;i++){
      var p0=pts[(i-1+N)%N], p1=pts[i], p2=pts[(i+1)%N], p3=pts[(i+2)%N];
      d+='C'+f(p1[0]+(p2[0]-p0[0])/6)+' '+f(p1[1]+(p2[1]-p0[1])/6)+' '
        +f(p2[0]-(p3[0]-p1[0])/6)+' '+f(p2[1]-(p3[1]-p1[1])/6)+' '+f(p2[0])+' '+f(p2[1]);
    }
    return d+'Z';
  }
  document.documentElement.dataset.sq100 = path(100,2);
  document.documentElement.dataset.sq1  = path(1,4);
})();

'use strict';
/* ============================================================================
   0 · MICRO-HELPERS
   ========================================================================== */
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp  = (a, b, t) => a + (b - a) * t;
const NBSP = '\u00a0';

/** Build one element from an HTML string. */
function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}
/** `<svg><use></svg>` referencing a sprite symbol. */
const ic = (id, cls = '') => `<svg class="${cls}" aria-hidden="true"><use href="#${id}"/></svg>`;
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Event delegation: `on(root,'click','.sel',fn)` */
function on(root, type, sel, fn, opts) {
  root.addEventListener(type, e => {
    const t = e.target.closest(sel);
    if (t && root.contains(t)) fn(e, t);
  }, opts);
}
const raf = requestAnimationFrame;

/* ============================================================================
   1 · SYSTEM STATE
   ========================================================================== */
/* The account picture, inlined so the desktop stays one file. Every avatar in
   the system reads from here: the lock screen, Apple Account, and the menus. */
const AVATAR = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/4gHYSUNDX1BST0ZJTEUAAQEAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADb/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCACwALADASIAAhEBAxEB/8QAHQAAAAcBAQEAAAAAAAAAAAAAAgMEBQYHCAEACf/EAD8QAAEDAwIEBAQEAwYFBQAAAAECAwQABREGIQcSMUETIlFhCDJxgRSRobEVQsEjM1JictEWFyRD8FOCkpPh/8QAGgEAAgMBAQAAAAAAAAAAAAAAAQIAAwUEBv/EACYRAAICAgIDAAEFAQEAAAAAAAABAhEDIQQSEzFBIgUyUWGxFHH/2gAMAwEAAhEDEQA/ANNd/wBK9jArvXf1ruMpJ965w+wSU5PXrXQQr6dK5g+X2G9GJTuagAKhzdKEkbD1ryASPcUNACU/SoE5jc17AxQgMnpUN4l8TbHw4sj6rjckxrg8y4YjCG1OuLUBseVIOwONzge9QBMOUdScADrRTr7MdtTkh5thKVcpU4oAAnoM/TH51hTiR8WWotQ6RjWiOttqWcLfmxOZsrGN0FJ6EHuNqjFk+JzUjembnbpMhUwTo6YypCz/AGiAkY69zy7ZO+wp/FL2G0ak1j8WGmdPXCXAt0SVeHGUkfi2sJj8wJGyifMMjqBj0qB6R+NBaWFf8Q2cPIyeR+GvB74BSf39qyNIv6ZDjhPiF9TmQrmwMDtilDDhbsjxyeZbuMEZynGRV3iVCtn0x0PxJsHECyJuNsmJCSPOw7hLiD7jv33G1SZp1pxkOocSWiMhedsV81eHHFu48PLuJtskOtKA8J9pGFJcQB1III2GakmruIFw1LqDwbc47HYkoSlpqM6tLaufZRCebA5gRzD61X4nYT6EpwoZBBB3BHSjUj86y38LnFKXbrBJtt8kn+GRnSht6R5S1lzl2J+ZOSNuwz6VqVIzhQOQe9VtU6IDSaOT0otIHejU9KA6YKhffFcxk5oXLmoQFj714e1dAr3LUIMaflx+tGoGQfSikEFRxsPSjkHr2FGiWgRAya6k4z9aDzcx23FdSckemaArBJGFEdjQ0DKSKCNlfaoHx015N4b8Mb1fYDYclsoS21zdEqWoJCvoM5+1RbdAIv8AEdx0Y4WafMW3ySi/yEAspSzz8ic/MScAdD7+1YU1ZxM1Fqu6KnXK5SJL7jXgl5S8czec8uB0GSdqbdS6+ves3FSrtMkTionmU6vmKD6j0H0pgD3itHBBI2znrXXGFLYtnn5bbquUr5VdBzGkf4j8K+ELV8x3Pb0ouaAUZUMk/mk0imyQrG2MfKf6VahWL/xC3J7S22yvnOeXGT6H+tSeZCVabOhDqwZDwyADuhPr96i9uuSbfH51ICnVjAP+EZyf9qNfvM59xDzjSlNra5FFKNxvtjPXpRCLI0hAdSlaQQSW1E759MVaPDy3t3i5wZSV4ZiLH94QMgYKiCfQZOPaqRL5QpwFYT5tyjv6gZqW6e1k7a4Tsdo8jrzXhIA/kGRk57bd6jCi5bfrONAskjwHWkqDn4fyKKVKTgr7dRztp2/zVoPhFx+ttl0VGi3+4LdeZUENEMuLUUHHKCQCARuN+v2rFVvuMeDZm2HHw4SsELRnCjnH5bmrr0bZwyp9yTGU4zHCXG0trAJUWwr5tyO+2PbIyDXPONssWzamkdb23WjLzsDxkllfIpuQjw1f6uU749yBUmT7VQ/w9uSbnqC6zuZtcFuI22FISQS4og5P2TjHt71fDewrndXoHoEDQ00AfMKGBuKAwM9a72rleJ2PYVCDAhX3o7PMMUjQrfNKUK9KYQMT1oadyMUBtWVJ27j96Nbzk/TFKQHg8wx6YrJ/xs6jcj3jT1plNfiLQmO7LMTxw2HX8hKCofzBIycdzWo7zMuMGAX7bb27nISRllyR4O3cg8qt/bH3r51fEVqy5al4v3ObNiuMqiqDSI6nefwkBOwB6dcnOO9NjVuxq0U7cHnEsZJwnceXy432/rTWmUgpBQoodB+U9FUYp9x5TqVAoycgkbH1BoFvtbs94tttgE7Eiu269laVukFyJJdSAQQvoRQYVrkS3QkIUd6sa06DiwIDSZDa5NwcOfBSnJG3T2qURNFtWZUZ51HOHMl0oGUtnqBmuSfJjH0aGPhyn7IVZuHf4h9oST5VDIaHVQFOcu1TYE1IU0h5kHPgKSMEdgD1APTarLsdt/F3USC1zspRyIV265P9KlbtkhSAkuMpKk9DjBrPlznF0zWh+nRlGzN8nRjDnIqOsI58lIcBzn0PavQNJONuNrcihzkVkoGMKwRsckbVoidw+h3JkFpCGQABkHcb5H9KV2Lgy8uYzIjyWi7gpcRITzJUO42ORnp96sjz4v2c8/05xMy3mwXODdAp8FCEuZ5SOUjfIBT1wPyqzNP6tLbS0OzCp1toIcS0cYSeoyepI9hjfc5rVf8AyBk6hskNM6HHZkrWpLjpIUnwwnIUN8kHZOOu57bnIvF7hhP4Ua5diOktwn1B5p0geZPmGMZ26/lXbHKpun7M2WFw2jcnw6JaZ0D+KKChcp9TqztsMBKf0T+9Wyg/nWMOAvxGoatbVhnxGkpHhIbfSopwkLOQcnG/N1/Std2S5xJ0Rp9uWiSt1IUSlQzv2x2xSNUc7Wx2Ct++1CJPWgpG9GYzilCd5siuE7GvEbbUEHf2qEIyheTtShtXYUjScb0c2r0pxBYlXvSlvdRHekQUOvviljRxv9zSsgOQpQhyAnl5ighIUcDPuaxH8X+kVaIv8bUbTjUxV7hGE8Vj5X0Y5lJHpy8o74wc9RW2Jrbb0KQlxj8SgtkFkdV7dBXzr+Jq5zH7vBjv21NrZYLvgR3Hg68EHl8zh7HbAHbB+pbGvyGvRQkh+QtZU8ryZ+UbZq7OF+gguysSgUtyFefnW3zb56dfSqdjJDr7Pi5I58+23/6f0rXWhYbKtPQClI5S2lRx9K5+fkcIpL6aPAxqcm2ch2NiC0DgOPH53SBlX+30FK0Nqcw2loKT6EbUsmXO1W1ahLlNtlJ3TkbfWu2/iHpVQUETGcp23IrDqctpHpoSxx1aCU2zCcBlLX+UDY0AwlIUAW89t1dKlUK8W+7oCo5S4FDIPrXkwmXZQSdt652n9OvXwKs8ApU2MtpCjnpnH3qeWK1OvT2UpaSAepCOtRCbcotrhqUSEhtXzUG3fEHY9OzGUPurKWx51J65/wBt6eGOcn+KOXJkjBbZe9vnu4YYXhtKCArB6VXXxhcIv+K+H7d0biqfei4SVN45kg4wd+3UH6j3ruk/iE0jqOSppxSmXObPy7bdCD3q8bzNi6n4VXWRDW3cIr0NQ8h5sHHTHrWrguMqkjGz1JXFnzR4dab/AIPBm2+5NNC4RnkrypWC4w4QjII6FKig/RXtX0M0haEWqxQmPw7bJQ2kAJHt6/8AnWsUcOrOXeIjNskNuLiOychKxs2rn8yevqB026e1b0ZOUJ7YAFa2T2YlHAMGhgZFcVuetCQNyB0qoFHFj0ovlI+9H8pzXQ0ACevoKNApkMTv9qOb2NEpOKNTsd+nWmKw9JwQaVMLJKc9M0jG1KGVFIx770AWKXUuKQfDdU2SMeUCsKfGzZbjb9UW1+VIfmxSyQlxQQOQqPQlKRknk7jOMVu1JwM9az18a2nGpvCZ+6paC5MeSx5iPlTzFO3/ANh/OmhqSJZ8+2lrkSQ2hKlq2wEJ6CtKt8RLbprR8GFGmNuXEMoa8iSfD26+59qzzp94Q7kXlDHl5cj3OP61orhVpi3x5F4uTjSZD8Z4MsqcAVyI5Eq5h7nmIz7VVy4waTl8O7iyyRbUfpCxYn784pxcC7TEqOVO+CEFX/yOw+1Mt14eT4+VRoM9oZzhzkOPyNWze9WOpMpUdpbga3UhC+UJye5/oKjcG+zL9MMZthJcwpWW3lE7fWqMbyVcVo6ZyxJ9ZPY16F1RO0i603cvGjtggczyCE/Y9KumzamYuzyVsrBUrpg9aryAwq7JciyWwtv5FocHb3qC6Q0TG1LqIQpNxVCtrT60Kkob8QpQDgKxkVTPFDJcpOqO7FycmOoQXay9dfOsW9tEKXIUJkhBW1EYQXH1DGyuUdB03O1U6/oaTcJ3OYZbSABiTJCT+Sc/vUksen0aQvGpYDVwaua23EBqe1uHmOXKSO477eoopyQ+3Edmp5FFKgnlXurB7hNXYsfR1B2c+bN5F2yKv6H7RugLxGlMm3wbS4c/3br7hyceuMDr1FXgniRxC4I6ckuTOGgl6ecaIfftdyU6AOU+coKMpwcHP19dq04JPyL3KnOy5cRkR2wpiO4y4l2Ss58iFI3B9ztvWxdJNXG+WB+3XFlcPDPM21NwXAkjdKsbHHr3pJuWOX5pNCJxyRTg2jEXAC7r4j8Xokxhp6MyzzPupdOUnK0qUAe52G3oT6Vt4PZJrK/wuW2KNa3JEdLS24Lby0rQPMhS3jhJI9irb0xWo8712vb0ZcnvbFZ+UHoTQkkgAdSO9EpVzJ3oxK+vfahQLFHMK6CCD6Ck6l+ahoc5aYZSIYhWdqPQc/SkqU4+lHoyNs1CkVI6b0a2PKqiWxtilLacjHX1qCsUJHvtiofxe0WOIfDe+WEEJckM5aKtgFpPMn9QKmCe3vUO4u3SRZOG1+lxc/iG45CSOoycZ/Wlk+sew8I95KK+nzCumkr1ZrgItwtsiMlTnhKcCcpzzAZBHuK1VYLImy6lEAeWLdICFoyP+61sofdKgf8A21GNJwHLvaHX5khUhbjgUS6cgfT0q07tp5d6gMGI9+FuEVaXor+MhKwMYI7ggkEe9ZObleSlJUekjwvBpOyKXexstrW2Y7agTg5GxpiTphlhwqajtM822W0AU63jVN5s7yhddNTFqTsXYAS82r/SCQfzFNbvExDrBDOnLylY/wDUjpbH5lVJGWRLRf4sf3/BVfre1pvR9ynlfIptknYYOTt/Wg8DdGpjaZiyJbSlS7h/aq5hulKvlH5VH/wt54ryE256P/C7K24lyQ2pXO46AflJGwHsKuq3rYtiUNlaQtJCUjvS5Zvp0b29stw4l5e9a9Ire+cM5HC/i9BZkIJsWp2izHec2SmQMlLeexPb1zTvK0gpiUtKFgFJ3SrtWr7nwvsvHHhZHtF4kIijmQ5GfUvkcbdT8qkKG4IP71kziJada8HdYGyXhMa7+IgOx5xWULdQdgVYBGfWro5JOK3socI95JolmjHZum5jT8dLSXEnIODVyp1jdGNMXW8yXy7LTHUzHQn+d1fkbQB6lSgAPes2RdVapkBIjWiGlR/mckHHt2q+vh+0tL1Bq21XLVs8ShCkJeh2+OnljNO7gOKB3WpOfKTsDuBnBpF+5NsbJj/BtRF2hdPQ+F2rrnodm1NRn0wmJ7s9Kj4kh0hPicw6HClHBqwEHJ3p44oaWbicS133I8R+3Ii49SlxRJ/LlFNCR5Un1FaWHt1fb+TA5fjco+P+Ff8A6GhXKCKENzmiwNzv2oxO1XnHYMnON966N+u5oAG2aNSNiTtRJZEUo2o5Cds15IFGhOBUFs6gfrShHcCi0J337UeE4GagoagD6Uju9qj3y1TYEtIXHktqaWn2Ix/Wlqck4rqgE/1qNWqCm07RifUVlkaCXcbK4D/0ko5Vjq2oeRX0q0rZLS1GZJwfKCfyqY8bNBt3WI3fo2G5kcBt8Y2dRnbI74qp5EpbLKQMpwMY6V57Pi6T6s9lg5C5GOM/v0lV0uzJQR5FDA3NVzqC4/xOYIcYDOMrV2SKHMuLymiB1PeovIujFmKHX3Ut86vMtR75qqEbZ1Tl1joeYz0/TUd9MMIdU8P5zjcbUl02u5R7mh+4zhJQtQ52+TAR9D3p4ZvVhZio8eelxRGORscx3+lNM29WpSwWmpCd/KoBOx/OuhpU9FcO8mmi7NQzo2tLJbY9m1HdYr9vZcUI8NQbQ49/KVbZODgY6VEdW2fUWsVsTLu+Zj8SOlhoY3Skb59z3Jonh3Mg2yUolp11StsqWE4PoBvVt6p4laU4f6QTNv1muWZKS2wY8ZT3iKwdiQNunU7UsY3pAmp490Z5td3ciSlRZOy0nAJ7itQ8C5jaHI8hY5mgsE+lZOcm/wDMHUbMm2xFxUuP+VtQwog+orXXDHTrtitjLTowvYADuaE9SQzlePZaOv56bi7BXy4HKvb2yMVGE7Ix27U56jWFS22gchlsJ+53NNqRkHPatrDfjVnj87TyOgSe3v1oYGcds+tBxvRmMpBq8oOgYGPQ96GjbI7CgnJJ2xRiRhQ7jG9QDIuAAQetGj5jn0ooK2G+1GA5GfaiwB4GD9Mmjk7jJohG6x+1KW05B+mKAA1ob7naukdT1yN/ahNpxv8AUV7qTj8qPwDE8iIzLjuR30B1lwYUk9CKo3i5oGPpf8NNgJWIT2UOBaiooXnI39CP2q+kt+bf2pFfbHG1FaJFvmICmXkFHTdJ7KHuK5s2NZFX06ePneCafz6Y+ccQ2QFYUP8AFUcvGlmdTyCwtsON5B5T0NSLXGnp+j769bJoKVIVlC8eVxHZQPek2n5YZlDmKQexPesNxlB/2evhkjkin8B27h/BhREhltlBHVtwZH2NJpUGNDfBMKNyjvlIFTVYD7SinGDuRUQloj/xZxL6fDipQFB3Gcqz0/8APSmhOT9nWsnjWiWcLTCe1C0QuKgoWPKg5zv7VrbV8W16w0G1aVIbdJb8NPKgeXOxxWSdGM2pUtCYjvJJKspwRhVay4Z2APRwt9wqQgDBUf2/Wiptujn5E+6Um/RTWkuCzOitUfiMZYbGRkdDnp+VXDangXw/0QjdKcdTSjVsmKl8NIBGVZJApNGQEsJIGDjp6VbixOc/6M/k8lQx39DHFF51xSzzKUSSaChOc13BTnYY3zQk7nattKjzF3s6R3oQGMCvEZ6daGU+QGiQLSsFfJnzYFKltFspBHakbkdSpTbiTgAb05PvB0tY7J6+tQDIKhzfHaj21bbflTc27ilbK+36UwovbPmFLGdyCPakLR2FLY52I79RQogpA3HpXVIwQR02FASrmwffejTjHoOpFADOHv6V4Hm7b1wnGcbe3rQgB5vegAp/4jrC3cdNwJhQPEjvFBXjcAj1+orLcySq1OkLycHatn8YIhmcP7kQOYs8rh+xH+9ZKvlk/iLBLYBUOxrLzyUZ7+noOFc8VL4JYuuELaCS6QsDGAcCh/xpm5xH2lqAyM4NQa4ablNuFTYKVeg6UCLGmx1hLiHU9BkDNUqMfaO3tOqZaGhrtGYuscZCUNkcyldAM7/WtZ6U4htwrInzhRKQEpTk5OMVlPhroKbfXPFaZX1GFK8qfuOp/StEaf0c3YGWVSnC+8MYTsAB9KobXbQ7UmkmWLpi3rvbr1ylglCEktNq7nHU0eh0KcUkbY7etOGm3gpgtjASoYAHam12Opl0Z+bdJNanG9GJzE00GJT5e5JofIUb9K4hWFAKo17AIx+VdpmWcSDg70YvKkUWk7ZoScqFEYElPMM5xQz/ACn33A96CjzNjHr0oSh5D9KgrZXTJzS9g4H1pA0R6UtbUR9qYgvQoAUpbdOQPpTcl3cijUO+YHrUIOyHRjI60aV84A/Omxt8ZAzilDDoPfqaDQGhYCD9cULm27dOtJ/FyOvQHpVOcYPij01wzgPMQHmb9e0uFH4KO75W1f51DIGPQb0KbB7LP1uyHtHXlCtgYy/2rJiEqB8p69qdk8TtZaxhGXe7qllmW2MWyA2G2Ggd8E7qWfUlWPQCmnnLTmCPv6VhcvJGcqj8PUcDDLFB9/ommR0k5WgFQ703LfjMLSHEZ33xUlUppbQK8D+lN0i2sElQUCeuKz+/xmslsnek9axoMZtqKkNgDfG1TO06n/isoArzv1z0qj2XG42yBuO9Tfh4+t2ekAnOelBPYZRT2af0vL5GUc3UDGai3HGVItelpsuJdJNoWpPkkRCkLSvtjmSR+lKdP3Aqdaa5vN9arb4x9bRLLo6Bam30ma+vxCgK3AwQP3z9q0YOUklH2ZElFP8AP0U/oL4tNRaXjSW9SY1Ky2ohDyylh3Y9cpTgj2I+9W5ZPi601c7LHmzrdNguOD+7Rh0fZW2e3YVhqUtdwdYgMq5lunzE+lWDEQzDtaIyylSQnlTnfJ7Yr1ywwl7PLSe9GxtN/EvoLUc4QRdTb5p6MTWy2T9D0NSs8V9HIZLh1LbQlJwSXxgV8xtR/iIF6L7TpQ40ocis7jAoiZqSRcAxGcS2nxnElwpTjmOaqeGIf7PqvadXWO8gCDdockk7BDyST9BT2EEpGa+aVg1/Gnq/hBxCkJHKh87oJA6EH96kcTWOo4jAYNwkqycpQ26eQehGDR/579MW6Nhtnb3owPEA03JlFFdVJCzsa5CwcVSeWg/jQgZ5tgN6p3iv8Qdl4akQ2wm63g/NFZcADXus9vp1rK3En4gNWa/fdgOz1QbUTlUOIeRKh6KI3UPY7e1OoNkNu6j45aO0rziZfI7jw/7MZXirz6eXIH3NVZqr42bVbmXRp+0uzHsbPSz4bYP0GSf0rGUqeY8cJScFf54pK5ILqkIJynqR71aoIhbmrfiE11xBcfE2+vxISgSIUA+Azj0ITuof6iarRBC2yVkqUckk7nNcbeDTO+PN5RSdx8M5GParKRFo0roC6JuNkiAnKkoANS16B47POnrVE8HNWtMSBa5LoaWo/wBitRwFf5avZL0ptPlSCk9TXjOVilhyNM9jxsizQUojehpRQoE4IoplhS17ZO/SnZsEnxHGdzsQKObYSlaShO2ckVwtmgkNjlvITkgfSrB4W2UPLLh6577VGXUhaD/ZnYUU3q1OkY6n3pPhN/4SrqfQDvTQtySStiT1Ftui2tda8tnDC2uXF6QhS20kJBPVXYe9Yk4lcUZevdQybrNeWvmJ5EKPT0r3GjX83WVwS+44oxUbMNE7I9Sfc1WDjhKkpJ8qRk17DhcN4V5Mn7v8PI8vlLK+mP1/pO9MK8Nl64uY8TGEg/4d87/alrl5U/a25SDkIUQoZ98n981FRNMfSxycPPOkJ/04oiNcPD0y+g+YlwAb5wO9bHoyqvYdqGYZMtDnRK0AhPpTHLkLamRlg4wQQaVSXw9FjkbEDBP0ptuHn5T0x3qtjimdIU3MWtKjhW4OasbhTfUgzfxLhUllkupUTuMVVslYejMrJyQeU0usdzVAE1KVcvislGR70YunYHtUf//Z';

const SYS = {
  theme: 'light',
  /* `appearance` is what the user picked, `theme` is what's on screen. They differ
     only under Auto, which tracks the host OS. */
  appearance: 'light',
  accent: 'multi', highlight: 'accent', sidebarIcons: 'medium', scrollbars: 'auto',
  volume: 0.65, muted: false,
  battery: 84, charging: false,
  wifi: true, wifiName: 'Prasen 5G', bluetooth: true,
  dockSize: 58, dockMag: 1.44, dockMagOn: true,
  user: 'Prasenjit', host: 'macbook',
  wallpaper: 'tahoe',
  safariFavs: false,
  boot: Date.now(),
};

/* `ink` is the menu-bar ink to use before the picture has been sampled — it's the
   answer sampling lands on anyway, so the bar never flickers on load. */
const WALLPAPERS = {
  tahoe:   { name: 'Alpine Lake',  ink: 'dark',  url: 'https://images.unsplash.com/photo-1501785888041-af3ef285b470?q=85&w=3200&auto=format&fit=crop' },
  ridges:  { name: 'Blue Ridges',  ink: 'dark',  url: 'https://images.unsplash.com/photo-1490604001847-b712b0c2f967?q=85&w=3200&auto=format&fit=crop' },
  summit:  { name: 'Above Clouds', ink: 'dark',  url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?q=85&w=3200&auto=format&fit=crop' },
  valley:  { name: 'Glacier Bay',  ink: 'dark',  url: 'https://images.unsplash.com/photo-1465146344425-f00d5f5c8f07?q=85&w=3200&auto=format&fit=crop' },
  forest:  { name: 'Redwoods',     ink: 'light', url: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?q=85&w=3200&auto=format&fit=crop' },
  night:   { name: 'Night Sky',    ink: 'light', dark: true, url: 'https://images.unsplash.com/photo-1519681393784-d120267933ba?q=85&w=3200&auto=format&fit=crop' },
};

/* ---- clip paths ---------------------------------------------------------- */
(function squircle() {
  const d100 = document.documentElement.dataset.sq100;
  const d1 = document.documentElement.dataset.sq1;
  $('#defs').insertAdjacentHTML('afterbegin',
    `<clipPath id="sqc"><path d="${d100}"/></clipPath>` +
    `<clipPath id="sqr" clipPathUnits="objectBoundingBox"><path d="${d1}"/></clipPath>`);
})();

/* ============================================================================
   2 · WALLPAPER
   ========================================================================== */
const Wall = {
  gen: 0, keep: null, want: null,
  /** Small version of a picture — the same file Settings shows, so it's cached. */
  thumb(w) { return w.url.replace('w=3200', 'w=640'); },

  set(key) {
    const w = WALLPAPERS[key]; if (!w) return;
    const host = $('#wall');
    /* Compare against the last picture *asked for*, not the one currently painted.
       Mid-burst the screen is always a step behind, and trusting it means re-picking
       the visible wallpaper bails out early and lets an in-flight load win instead. */
    const cur = host.querySelector('.layer.photo.on[data-full]');
    if (this.want === key && cur && cur.dataset.key === key) { SYS.wallpaper = key; return; }
    this.want = key;

    /* Every switch takes a ticket. Clicking three pictures quickly used to leave
       three loads racing, and the first one's cleanup timer could delete the layer
       the third had just put up — which is what drops you back to the bare gradient. */
    const my = ++this.gen;
    SYS.wallpaper = key;
    this.pickInk(w);

    const paint = (src, full) => {
      if (my !== this.gen) return;
      const layer = el(`<div class="layer photo" data-key="${key}"${full ? ' data-full' : ''}></div>`);
      layer.style.backgroundImage = `url("${src}")`;
      host.append(layer);
      this.keep = layer;
      raf(() => raf(() => {
        if (this.keep !== layer) { layer.remove(); return; }
        layer.classList.add('on');
        /* Retire against whatever is current now, not against this closure — by the
           time the fade ends a sharper copy of the same picture may have replaced it. */
        setTimeout(() => host.querySelectorAll('.layer.photo')
          .forEach(l => { if (l !== this.keep) l.remove(); }), 800);
      }));
    };

    const load = (src, ok, fail) => {
      const img = new Image();
      img.decoding = 'async';
      img.onerror = fail;
      img.onload = () => (img.decode ? img.decode().then(ok).catch(ok) : ok());
      img.src = src;
    };

    /* The full-resolution file gets a short head start. If it's already cached it
       lands inside that window and fades in once, cleanly. If the network is slow —
       the case where the desktop used to sit on a flat gradient — the small cached
       copy stands in until the real one arrives. Blurry beats broken. */
    let done = false;
    load(w.url, () => { done = true; paint(w.url, true); }, () => {
      done = true;
      if (my === this.gen && !host.querySelector('.layer.photo.on')) Toast('Could not load ' + w.name);
    });
    setTimeout(() => {
      if (done || my !== this.gen) return;
      load(this.thumb(w), () => { if (!done) paint(this.thumb(w), false); }, () => {});
    }, 140);
  },

  /* AppKit reads the pixels under the menu bar and picks its ink from them, which
     is why white-on-bright-sky never happens on a real Mac. Same trick: downscale
     the picture and average the luma of the strip the bar actually covers. */
  pickInk(w) {
    const apply = ink => { document.documentElement.dataset.mbInk = ink; };
    apply(w.ink || 'light');
    const probe = new Image();
    probe.crossOrigin = 'anonymous';
    probe.onload = () => {
      try {
        const W = 48, H = Math.max(2, Math.round(48 * probe.naturalHeight / probe.naturalWidth));
        const c = Object.assign(document.createElement('canvas'), { width: W, height: H });
        const g = c.getContext('2d', { willReadFrequently: true });
        g.drawImage(probe, 0, 0, W, H);
        const rows = Math.max(1, Math.round(H * (26 / innerHeight)));
        const d = g.getImageData(0, 0, W, rows).data;
        let sum = 0;
        for (let i = 0; i < d.length; i += 4) sum += d[i] * .2126 + d[i + 1] * .7152 + d[i + 2] * .0722;
        apply(sum / (d.length / 4) / 255 > .55 ? 'dark' : 'light');
      } catch (e) { /* cross-origin taint: the static hint stands */ }
    };
    probe.src = w.url;
  }
};

/* ============================================================================
   3 · THEME
   ========================================================================== */
const Theme = {
  mq: matchMedia('(prefers-color-scheme: dark)'),

  /** Light, Dark or Auto. Auto keeps following the host OS until you pick a side. */
  setAppearance(mode) {
    SYS.appearance = mode;
    if (mode === 'auto') {
      if (!this.bound) { this.mq.addEventListener('change', () => { if (SYS.appearance === 'auto') this.paint(this.mq.matches ? 'dark' : 'light'); }); this.bound = true; }
      this.paint(this.mq.matches ? 'dark' : 'light');
    } else this.paint(mode);
  },
  set(mode) { this.setAppearance(mode); },
  paint(mode) {
    SYS.theme = mode;
    document.documentElement.dataset.theme = mode;
    Bus.emit('theme', mode);
  },
  toggle() { this.setAppearance(SYS.theme === 'light' ? 'dark' : 'light'); },

  /* Accent drives --blue, which forty-odd rules already read, so retinting the whole
     interface is a two-property write rather than a repaint of every component. */
  ACCENTS: {
    multi: { name: 'Multicolour', hex: null },
    blue: { name: 'Blue', hex: '#0a7cff', dark: '#0a84ff' },
    purple: { name: 'Purple', hex: '#8944ab', dark: '#bf5af2' },
    pink: { name: 'Pink', hex: '#f74f9e', dark: '#ff2d55' },
    red: { name: 'Red', hex: '#e0383e', dark: '#ff453a' },
    orange: { name: 'Orange', hex: '#f7821b', dark: '#ff9f0a' },
    yellow: { name: 'Yellow', hex: '#f7ce46', dark: '#ffd60a' },
    green: { name: 'Green', hex: '#62ba46', dark: '#30d158' },
    graphite: { name: 'Graphite', hex: '#8c8c91', dark: '#98989d' },
  },
  setAccent(key) {
    if (!this.ACCENTS[key]) return;
    SYS.accent = key;
    this.paintAccent();
    Bus.emit('accent', key);
  },
  paintAccent() {
    const s = document.documentElement.style;
    const a = this.ACCENTS[SYS.accent];
    if (!a || !a.hex) { s.removeProperty('--blue'); s.removeProperty('--blue-press'); s.removeProperty('--on-accent'); }
    else {
      const hex = SYS.theme === 'dark' ? (a.dark || a.hex) : a.hex;
      s.setProperty('--blue', hex);
      s.setProperty('--blue-press', shade(hex, -.16));
      /* Only yellow is bright enough to need dark glyphs on top; green sits just
         below the line and takes white, the way AppKit draws it. */
      s.setProperty('--on-accent', luma(hex) > .72 ? '#1d1d1f' : '#fff');
    }
  },
};
/* Both helpers work on #rrggbb only, which is all the accent table holds. */
function hexRgb(h) { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
function luma(h) { const [r, g, b] = hexRgb(h); return (r * .2126 + g * .7152 + b * .0722) / 255; }
function shade(h, amt) {
  return '#' + hexRgb(h).map(v => Math.round(clamp(v + amt * 255, 0, 255)).toString(16).padStart(2, '0')).join('');
}

/* Tiny pub-sub so widgets/apps can react to system changes. */
const Bus = {
  m: new Map(),
  on(k, fn) { (this.m.get(k) || this.m.set(k, []).get(k)).push(fn); return fn; },
  emit(k, v) { (this.m.get(k) || []).forEach(f => { try { f(v) } catch (e) { console.warn(e) } }); }
};
/* Light and dark take different ends of each accent pair, so a theme flip has to
   repaint the tint. Registered here because Bus is defined after Theme. */
Bus.on('theme', () => Theme.paintAccent());

/* ============================================================================
   4 · POPOVER / MENU LAYER
   ========================================================================== */
const Pop = {
  cur: null, onClose: null,
  open(node, { x, y, right = false, origin, onClose } = {}) {
    this.close(true);
    const layer = $('#layer-menu'), shield = $('#menu-shield');
    layer.append(node);
    node.style.visibility = 'hidden';
    raf(() => {
      const r = node.getBoundingClientRect(), W = innerWidth, H = innerHeight;
      let L = right ? x - r.width : x;
      L = clamp(L, 6, W - r.width - 6);
      let T = clamp(y, 4, H - r.height - 8);
      node.style.left = L + 'px'; node.style.top = T + 'px';
      if (origin) node.style.transformOrigin = origin;
      node.style.visibility = '';
    });
    shield.classList.add('on');
    this.cur = node; this.onClose = onClose;
    return node;
  },
  close(instant) {
    const n = this.cur; if (!n) return;
    this.cur = null;
    $('#menu-shield').classList.remove('on');
    const cb = this.onClose; this.onClose = null;
    if (instant) n.remove();
    else { n.classList.add('out'); setTimeout(() => n.remove(), 110); }
    if (cb) cb();
  },
  /** Build a standard menu from a spec array. */
  menu(items, cls = '') {
    const rows = items.map(it => {
      if (it === '-') return '<div class="msep"></div>';
      if (it.head) return `<div class="mhead">${esc(it.head)}</div>`;
      /* Help menus lead with a live search field on a real Mac. */
      if (it.field) return `<div class="mfield sfield">${ic('g-search')}<input placeholder="${esc(it.field)}" spellcheck="false"></div>`;
      const dis = it.disabled ? ' dis' : '', on = it.checked ? ' on' : '';
      return `<div class="mi${dis}${on}" data-act="${it.id || ''}">` +
        (it.check !== false && items.some(i => i.checked !== undefined) ? `<span class="ck">${ic('g-check')}</span>` : '') +
        (it.icon ? ic(it.icon, 'ico') : '') +
        `<span>${esc(it.label)}</span>` +
        (it.key ? `<span class="k">${it.key}</span>` : '') + '</div>';
    }).join('');
    const node = el(`<div class="pop ${cls}">${rows}</div>`);
    on(node, 'mousedown', '.mi:not(.dis)', e => e.stopPropagation());
    on(node, 'click', '.mi:not(.dis)', (e, t) => {
      const item = items.find(i => i.id && i.id === t.dataset.act);
      Pop.close();
      if (item && item.run) setTimeout(() => item.run(), 0);
    });
    return node;
  }
};
$('#menu-shield').addEventListener('mousedown', e => { e.preventDefault(); Pop.close(); });
$('#menu-shield').addEventListener('contextmenu', e => { e.preventDefault(); Pop.close(); });

/** Right-click menu anywhere. */
function ctxMenu(e, items) {
  e.preventDefault(); e.stopPropagation();
  Pop.open(Pop.menu(items), { x: e.clientX + 1, y: e.clientY + 1, origin: 'top left' });
}

/** Drop a menu below a toolbar button, the way AppKit hangs one off a control. */
function menuUnder(anchor, items) {
  const r = anchor.getBoundingClientRect();
  Pop.open(Pop.menu(items), { x: r.left, y: r.bottom + 4, origin: 'top left' });
}

/* ============================================================================
   5 · CLOCK UTILITIES
   ========================================================================== */
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAYS3 = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONS3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const time12 = d => {
  let h = d.getHours() % 12 || 12;
  return `${h}:${String(d.getMinutes()).padStart(2, '0')}${NBSP}${d.getHours() < 12 ? 'AM' : 'PM'}`;
};
const tickers = new Set();
setInterval(() => { const d = new Date(); tickers.forEach(f => { try { f(d) } catch (e) { } }); }, 1000);
const everySecond = fn => { tickers.add(fn); fn(new Date()); return fn; };

/* ============================================================================
   6 · MENU BAR
   ========================================================================== */
function battSVG(pct, charging) {
  const w = clamp(pct, 0, 100) / 100 * 18.4;
  const col = charging ? '#34c759' : pct <= 10 ? '#ff453a' : pct <= 20 ? '#ff9f0a' : 'currentColor';
  return `<svg viewBox="0 0 28 13" style="width:26px;height:12px">
    <rect x=".6" y=".6" width="22.8" height="11.8" rx="3.6" fill="none" stroke="currentColor" stroke-opacity=".45" stroke-width="1.1"/>
    <path d="M24.9 4.6a3.1 3.1 0 0 1 0 3.8z" fill="currentColor" fill-opacity=".45"/>
    <rect x="2.2" y="2.2" width="${w.toFixed(1)}" height="8.6" rx="2.1" fill="${col}"/>
    ${charging ? '<path d="M13.6 1.6 8.4 7.4h3.4l-1.4 4.8 5.4-6h-3.4z" fill="#fff" stroke="#1d1d1f" stroke-opacity=".25" stroke-width=".7" stroke-linejoin="round"/>' : ''}
  </svg>`;
}

const MenuBar = {
  app: 'Finder',
  menus: null,
  openIdx: -1,

  init() {
    const bar = $('#menubar');
    bar.innerHTML =
      `<div class="mb-left">
         <div class="mb-item apple" data-menu="apple">${ic('g-apple', '')}</div>
         <div id="mb-titles" style="display:flex;align-items:stretch"></div>
       </div>
       <div class="mb-right"><div id="mb-status">
         <div class="mb-st" data-st="bt"    title="Bluetooth">${ic('g-bt')}</div>
         <div class="mb-st" data-st="vol"   title="Sound"><span id="mb-volico">${ic('g-vol')}</span></div>
         <div class="mb-st" data-st="batt"  title="Battery"><span class="batt-pct" id="mb-battpct"></span><span id="mb-batt"></span></div>
         <div class="mb-st" data-st="wifi"  title="Wi-Fi">${ic('g-wifi')}</div>
         <div class="mb-st" data-st="spot"  title="Spotlight">${ic('g-spot')}</div>
         <div class="mb-st" data-st="cc"    title="Control Center">${ic('g-cc')}</div>
         <div class="mb-st" data-st="clock" id="mb-clock"></div>
       </div></div>`;
    $('#menubar [data-st="bt"] svg').style.cssText = 'width:11px;height:16px';
    $('#menubar [data-st="wifi"] svg').style.cssText = 'width:16px;height:13px';
    $('#menubar [data-st="vol"] svg').style.cssText = 'width:16px;height:13px';
    $('#menubar [data-st="cc"] svg').style.cssText = 'width:15px;height:15px';
    $('#menubar [data-st="spot"] svg').style.cssText = 'width:14px;height:14px';
    $('#menubar .apple svg').style.cssText = 'width:13px;height:16px';

    this.setApp('Finder', APP_MENUS.finder);
    this.paintStatus();
    everySecond(d => {
      $('#mb-clock').textContent =
        `${DAYS3[d.getDay()]}${NBSP}${MONS3[d.getMonth()]}${NBSP}${d.getDate()}${NBSP}${NBSP}${time12(d)}`;
    });

    /* titles: click opens, hover switches while a menu is open */
    on(bar, 'mousedown', '.mb-item', (e, t) => { e.preventDefault(); this.toggle(t); });
    on(bar, 'mouseenter', '.mb-item', (e, t) => { if (this.openIdx >= 0 && !t.classList.contains('open')) this.toggle(t); }, true);
    on(bar, 'mousedown', '.mb-st', (e, t) => { e.preventDefault(); this.status(t); });
    /* The shield no longer covers the bar, so dead space has to dismiss itself. */
    bar.addEventListener('mousedown', e => { if (!e.target.closest('.mb-item,.mb-st')) Pop.close(); });

    Bus.on('theme', () => this.paintStatus());
    Bus.on('volume', () => this.paintStatus());
  },

  paintStatus() {
    $('#mb-batt').innerHTML = battSVG(SYS.battery, SYS.charging);
    $('#mb-battpct').textContent = SYS.battery + '%';
    const v = SYS.muted || SYS.volume === 0 ? 'g-vol-mute' : SYS.volume < .5 ? 'g-vol-lo' : 'g-vol';
    $('#mb-volico').innerHTML = ic(v);
    const s = $('#mb-volico svg'); if (s) s.style.cssText = 'width:16px;height:13px';
    $('#menubar [data-st="wifi"]').style.opacity = SYS.wifi ? '1' : '.45';
    $('#menubar [data-st="bt"]').style.opacity = SYS.bluetooth ? '1' : '.45';
  },

  setApp(name, menus) {
    this.app = name;
    this.menus = menus || APP_MENUS.finder;
    const titles = [{ label: name, app: true }, ...this.menus];
    $('#mb-titles').innerHTML = titles.map((m, i) =>
      `<div class="mb-item${m.app ? ' app' : ''}" data-menu="${i}">${esc(m.label)}</div>`).join('');
  },

  menuSpec(key) {
    if (key === 'apple') return APPLE_MENU();
    const i = +key;
    if (i === 0) return (APP_ABOUT[this.app] || APP_ABOUT._)(this.app);
    return (this.menus[i - 1] || { items: [] }).items;
  },

  toggle(t) {
    const key = t.dataset.menu;
    if (t.classList.contains('open')) { Pop.close(); return; }
    $$('#menubar .mb-item.open').forEach(n => n.classList.remove('open'));
    t.classList.add('open');
    this.openIdx = key;
    const r = t.getBoundingClientRect();
    const node = Pop.menu(this.menuSpec(key), 'wide');
    Pop.open(node, {
      x: r.left, y: r.bottom + 2, origin: 'top left',
      onClose: () => { t.classList.remove('open'); this.openIdx = -1; }
    });
  },

  status(t) {
    const k = t.dataset.st, r = t.getBoundingClientRect();
    /* Clock first: it wears .open while Notification Centre is up, so the generic
       "already open → dismiss the popover" branch would swallow the toggle. */
    if (k === 'clock') { NotifCenter.toggle(); return; }
    if (t.classList.contains('open')) { Pop.close(); return; }
    if (k === 'spot') { Spotlight.open(); return; }
    $$('#menubar .mb-st.open').forEach(n => n.classList.remove('open'));
    t.classList.add('open');
    const node = STATUS_PANELS[k]();
    Pop.open(node, {
      x: r.right + 6, y: r.bottom + 4, right: true, origin: 'top right',
      onClose: () => t.classList.remove('open')
    });
  }
};

/* ---- Apple menu ---------------------------------------------------------- */
const APPLE_MENU = () => [
  { id: 'about', label: 'About This Mac', run: () => WM.open('about') },
  '-',
  { id: 'set', label: 'System Settings…', run: () => WM.open('settings') },
  { id: 'store', label: 'App Store…', key: '1 update', run: () => Toast('App Store is not part of this build') },
  '-',
  { id: 'recent', label: 'Recent Items', key: '▸' },
  '-',
  { id: 'force', label: 'Force Quit…', key: '⌥⌘⎋', run: () => WM.forceQuitPanel() },
  '-',
  { id: 'sleep', label: 'Sleep', run: () => Screen.sleep() },
  { id: 'restart', label: 'Restart…', run: () => Startup.restart() },
  { id: 'shut', label: 'Shut Down…', run: () => Startup.shutDown() },
  '-',
  { id: 'lock', label: 'Lock Screen', key: '⌃⌘Q', run: () => Startup.lock() },
  { id: 'logout', label: `Log Out ${SYS.user}…`, key: '⇧⌘Q', run: () => Startup.lock() },
];

const APP_ABOUT = {
  _: name => [
    { id: 'a', label: `About ${name}`, run: () => WM.open('about') }, '-',
    { id: 'p', label: 'Settings…', key: '⌘,', run: () => WM.open('settings') }, '-',
    { id: 'h', label: `Hide ${name}`, key: '⌘H', run: () => WM.hideFront() },
    { id: 'o', label: 'Hide Others', key: '⌥⌘H', run: () => WM.hideOthers() },
    { id: 's', label: 'Show All', run: () => WM.showAll() }, '-',
    { id: 'q', label: `Quit ${name}`, key: '⌘Q', run: () => WM.quitFront() },
  ]
};

/* ---- Per-app menu bars --------------------------------------------------- */
const M = (label, items) => ({ label, items });
const APP_MENUS = {
  finder: [
    M('File', [
      { id: 'nw', label: 'New Finder Window', key: '⌘N', run: () => WM.open('finder') },
      { id: 'nf', label: 'New Folder', key: '⇧⌘N', run: () => Finder.newFolder() },
      '-',
      { id: 'op', label: 'Open', key: '⌘O', run: () => Finder.openSelected() },
      { id: 'cl', label: 'Close Window', key: '⌘W', run: () => WM.closeFront() },
      '-',
      { id: 'gi', label: 'Get Info', key: '⌘I', run: () => Toast('Get Info') },
      { id: 'tr', label: 'Move to Trash', key: '⌘⌫', run: () => Finder.trashSelected() },
    ]),
    M('Edit', [
      { id: 'u', label: 'Undo', key: '⌘Z', disabled: true },
      { id: 'r', label: 'Redo', key: '⇧⌘Z', disabled: true }, '-',
      { id: 'x', label: 'Cut', key: '⌘X' }, { id: 'c', label: 'Copy', key: '⌘C' }, { id: 'v', label: 'Paste', key: '⌘V' },
      '-', { id: 'a', label: 'Select All', key: '⌘A' },
    ]),
    M('View', [
      { id: 'icons', label: 'as Icons', key: '⌘1', run: () => Finder.setView('icon') },
      { id: 'listv', label: 'as List', key: '⌘2', run: () => Finder.setView('list') },
      { id: 'colv', label: 'as Columns', key: '⌘3', run: () => Finder.setView('column') },
      { id: 'galv', label: 'as Gallery', key: '⌘4', run: () => Finder.setView('gallery') },
      '-',
      { id: 'sb', label: 'Hide Sidebar', key: '⌥⌘S', run: () => Finder.toggleSidebar() },
      { id: 'pb', label: 'Hide Path Bar', key: '⌥⌘P', run: () => Finder.togglePathBar() },
    ]),
    M('Go', [
      { id: 'g1', label: 'Recents', key: '⇧⌘F', run: () => Finder.goto('Recents') },
      { id: 'g2', label: 'Documents', key: '⇧⌘O', run: () => Finder.goto('Documents') },
      { id: 'g3', label: 'Desktop', key: '⇧⌘D', run: () => Finder.goto('Desktop') },
      { id: 'g4', label: 'Downloads', key: '⌥⌘L', run: () => Finder.goto('Downloads') },
      { id: 'g5', label: 'Applications', key: '⇧⌘A', run: () => Finder.goto('Applications') },
    ]),
    M('Window', WINDOW_MENU_LAZY()),
    M('Help', [
      { field: 'Search' },
      { id: 'h', label: 'macOS Help', key: '⌘?', run: () => Toast('Everything here is one HTML file.') },
      { id: 'n', label: 'New Features in macOS', run: () => WM.open('about') },
    ]),
  ],
};
function WINDOW_MENU_LAZY() {
  return [
    { id: 'min', label: 'Minimize', key: '⌘M', run: () => WM.minFront() },
    { id: 'zoo', label: 'Zoom', run: () => WM.zoomFront() },
    { id: 'fil', label: 'Fill', key: '⌃⌥⏎', run: () => WM.zoomFront() },
    '-',
    { id: 'cyc', label: 'Cycle Through Windows', key: '⌘`', run: () => WM.cycle() },
    { id: 'brf', label: 'Bring All to Front', run: () => WM.showAll() },
  ];
}
/* Every app gets File/Edit/View/Window/Help; apps override the interesting bits. */
/* `order` lets an app place its own menus where AppKit puts them — Terminal has a
   Shell menu instead of File, Music slots Controls between View and Window. Without
   it, merged-in keys land after Help, which no Mac app does. */
function stdMenus(appId, over = {}, order = null) {
  const base = {
    File: [
      { id: 'n', label: 'New Window', key: '⌘N', run: () => WM.open(appId, { force: true }) },
      { id: 'w', label: 'Close Window', key: '⌘W', run: () => WM.closeFront() },
    ],
    Edit: [
      { id: 'u', label: 'Undo', key: '⌘Z', run: () => document.execCommand('undo') },
      { id: 'r', label: 'Redo', key: '⇧⌘Z', run: () => document.execCommand('redo') }, '-',
      { id: 'x', label: 'Cut', key: '⌘X', run: () => document.execCommand('cut') },
      { id: 'c', label: 'Copy', key: '⌘C', run: () => document.execCommand('copy') },
      { id: 'v', label: 'Paste', key: '⌘V', run: () => document.execCommand('paste') }, '-',
      { id: 'a', label: 'Select All', key: '⌘A', run: () => document.execCommand('selectAll') },
    ],
    View: [
      { id: 'f', label: 'Enter Full Screen', key: '⌃⌘F', run: () => WM.zoomFront() },
      { id: 't', label: 'Show Toolbar', key: '⌥⌘T', checked: true },
    ],
    Window: WINDOW_MENU_LAZY(),
    Help: [
      { field: 'Search' },
      { id: 'h', label: `${APPS[appId] ? APPS[appId].name : appId} Help`, run: () => Toast('No help needed — click things.') },
      { id: 'k', label: 'Keyboard Shortcuts', run: () => Toast('⌘Space, ⌘W, ⌘Q, ⌃⌘F all work.') },
    ],
  };
  Object.assign(base, over);
  return (order || Object.keys(base)).filter(k => base[k]).map(k => M(k, base[k]));
}

/* ---- Status panels ------------------------------------------------------- */
const NETWORKS = [
  { n: 'Prasen 5G', s: 3, lock: true }, { n: 'Prasen 2.4G', s: 3, lock: true },
  { n: 'JioFiber-4821', s: 2, lock: true }, { n: 'Airtel_Xstream', s: 2, lock: true },
  { n: 'TP-Link_9C40', s: 1, lock: true }, { n: 'CoffeeHouse Guest', s: 1, lock: false },
];
const wifiBars = s => `<svg viewBox="0 0 16 13" style="width:15px;height:12px">${[0, 1, 2].map(i =>
  `<path d="${['M2 9.4a1.4 1.4 0 1 1 0 2.8 1.4 1.4 0 0 1 0-2.8', 'M5.4 6.6a5 5 0 0 1 0 0', ''][0]}" />`).join('')}
  <path d="M8 9.3a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z" fill="currentColor" opacity="1"/>
  <path d="M8 5.8c-1.2 0-2.3.45-3.1 1.2a.6.6 0 0 0 0 .9l.5.5c.24.24.6.25.86.03A2.6 2.6 0 0 1 8 7.8c.65 0 1.25.22 1.74.63.26.22.62.21.86-.03l.5-.5a.6.6 0 0 0 0-.9A4.55 4.55 0 0 0 8 5.8z" fill="currentColor" opacity="${s >= 2 ? 1 : .3}"/>
  <path d="M8 2.1a8 8 0 0 0-5.6 2.28.6.6 0 0 0 0 .87l.5.5c.24.24.62.25.87.02A6.2 6.2 0 0 1 8 4.1a6.2 6.2 0 0 1 4.23 1.67c.25.23.63.22.87-.02l.5-.5a.6.6 0 0 0 0-.87A8 8 0 0 0 8 2.1z" fill="currentColor" opacity="${s >= 3 ? 1 : .3}"/>
</svg>`;

const STATUS_PANELS = {
  wifi() {
    const node = el(`<div class="panel" style="min-width:290px">
      <div class="row" style="height:32px"><h4 style="margin:0">Wi-Fi</h4><div class="tail"><div class="sw${SYS.wifi ? ' on' : ''}" data-t="wifi"></div></div></div>
      <div class="sep"></div>
      <div class="mhead" style="padding-left:0">Known Network</div>
      <div class="row" data-net="${esc(SYS.wifiName)}"><span style="width:16px;color:var(--blue)">${ic('g-check')}</span><span class="nm">${esc(SYS.wifiName)}</span><span class="tail">${ic('g-lock')}${wifiBars(3)}</span></div>
      <div class="sep"></div>
      <div class="mhead" style="padding-left:0">Other Networks</div>
      <div id="netlist"></div>
      <div class="sep"></div>
      <div class="row" data-open-net-settings><span class="nm">Wi-Fi Settings…</span></div>
    </div>`);
    node.querySelector('#netlist').innerHTML = NETWORKS.filter(x => x.n !== SYS.wifiName).map(x =>
      `<div class="row" data-net="${esc(x.n)}"><span style="width:16px"></span><span class="nm">${esc(x.n)}</span><span class="tail">${x.lock ? ic('g-lock') : ''}${wifiBars(x.s)}</span></div>`).join('');
    node.querySelectorAll('.tail svg').forEach(s => { if (s.querySelector('use')) s.style.cssText = 'width:12px;height:12px' });
    on(node, 'click', '[data-t="wifi"]', (e, t) => { SYS.wifi = !SYS.wifi; t.classList.toggle('on', SYS.wifi); MenuBar.paintStatus(); });
    on(node, 'click', '[data-net]', (e, t) => { SYS.wifiName = t.dataset.net; SYS.wifi = true; Pop.close(); MenuBar.paintStatus(); Toast('Connected to ' + t.dataset.net); });
    on(node, 'click', '[data-open-net-settings]', () => { Pop.close(); WM.open('settings', { section: 'wifi' }); });
    return node;
  },
  bt() {
    const devs = [['AirPods Pro', 'Connected'], ['Magic Keyboard', 'Connected'], ['Magic Trackpad', '92%'], ['Sony WH-1000XM5', 'Not Connected']];
    const node = el(`<div class="panel" style="min-width:280px">
      <div class="row" style="height:32px"><h4 style="margin:0">Bluetooth</h4><div class="tail"><div class="sw${SYS.bluetooth ? ' on' : ''}" data-t="bt"></div></div></div>
      <div class="sep"></div><div class="mhead" style="padding-left:0">Devices</div>
      ${devs.map(([n, s]) => `<div class="row"><span class="nm">${n}</span><span class="tail sub">${s}</span></div>`).join('')}
      <div class="sep"></div><div class="row" data-bts><span class="nm">Bluetooth Settings…</span></div></div>`);
    on(node, 'click', '[data-t="bt"]', (e, t) => { SYS.bluetooth = !SYS.bluetooth; t.classList.toggle('on', SYS.bluetooth); MenuBar.paintStatus(); });
    on(node, 'click', '[data-bts]', () => { Pop.close(); WM.open('settings', { section: 'bluetooth' }); });
    return node;
  },
  batt() {
    const mins = Math.round(SYS.battery / 100 * 11.4 * 60);
    const node = el(`<div class="panel" style="min-width:250px">
      <h4>Battery</h4>
      <div class="row" style="height:auto;padding:2px 6px 8px"><div><div style="font-size:26px;font-weight:500;letter-spacing:-.03em">${SYS.battery}%</div>
      <div class="sub">${SYS.charging ? 'Charging' : `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, '0')} Remaining`}</div></div>
      <div class="tail" style="transform:scale(1.5);transform-origin:right center">${battSVG(SYS.battery, SYS.charging)}</div></div>
      <div class="sep"></div><div class="mhead" style="padding-left:0">Energy Use</div>
      <div class="row"><span class="nm">Safari</span><span class="tail sub">Low</span></div>
      <div class="row"><span class="nm">Music</span><span class="tail sub">Low</span></div>
      <div class="sep"></div>
      <div class="row" data-t="chg"><span class="nm">${SYS.charging ? 'Unplug Power Adapter' : 'Simulate Charging'}</span></div>
      <div class="row" data-bs><span class="nm">Battery Settings…</span></div></div>`);
    on(node, 'click', '[data-t="chg"]', () => { SYS.charging = !SYS.charging; Pop.close(); MenuBar.paintStatus(); Bus.emit('battery'); });
    on(node, 'click', '[data-bs]', () => { Pop.close(); WM.open('settings', { section: 'battery' }); });
    return node;
  },
  vol() {
    const node = el(`<div class="panel" style="min-width:270px">
      <h4>Sound</h4>
      <div class="row" style="height:30px;gap:11px">
        <span style="color:var(--txt-2)">${ic('g-vol-lo')}</span>
        <div class="sl" data-slider="vol"><div class="trk"><div class="fil"></div></div><div class="kn"></div></div>
        <span style="color:var(--txt-2)">${ic('g-vol-hi')}</span>
      </div>
      <div class="sep"></div><div class="mhead" style="padding-left:0">Output</div>
      <div class="row on"><span style="width:15px;color:var(--blue)">${ic('g-check')}</span><span class="nm">MacBook Pro Speakers</span></div>
      <div class="row"><span style="width:15px"></span><span class="nm">AirPods Pro</span></div>
      <div class="sep"></div><div class="row" data-ss><span class="nm">Sound Settings…</span></div></div>`);
    node.querySelectorAll('svg').forEach(s => { if (!s.closest('.sl')) s.style.cssText = 'width:15px;height:15px' });
    Slider(node.querySelector('[data-slider="vol"]'), SYS.volume, v => { SYS.volume = v; SYS.muted = v === 0; Bus.emit('volume', v); });
    on(node, 'click', '[data-ss]', () => { Pop.close(); WM.open('settings', { section: 'sound' }); });
    return node;
  },
  cc() { return ControlCentre(); }
};

/* Re-usable slider behaviour */
function Slider(root, value, onChange, opts = {}) {
  if (!root) return;
  const fil = root.querySelector('.fil'), kn = root.querySelector('.kn');
  const paint = v => { fil.style.right = (100 - v * 100) + '%'; kn.style.left = `calc(${v * 100}% )`; };
  let v = clamp(value, 0, 1); paint(v);
  const move = e => {
    const r = root.querySelector('.trk').getBoundingClientRect();
    v = clamp((e.clientX - r.left) / r.width, 0, 1);
    paint(v); onChange(v);
  };
  root.addEventListener('pointerdown', e => {
    e.preventDefault(); root.setPointerCapture(e.pointerId); move(e);
    const mv = ev => move(ev);
    const up = () => { root.removeEventListener('pointermove', mv); root.removeEventListener('pointerup', up); if (opts.done) opts.done(v); };
    root.addEventListener('pointermove', mv); root.addEventListener('pointerup', up);
  });
  return { set(nv) { v = clamp(nv, 0, 1); paint(v); } };
}

/* Control Centre */
function ControlCentre() {
  const tile = (body, style = '') => `<div class="cc-tile" style="${style}">${body}</div>`;
  const node = el(`<div class="panel cc" style="min-width:0;width:302px;padding:12px">
    <div class="cc-grid">
      ${tile(`<div class="cc-row" data-t="wifi"><i class="cc-b${SYS.wifi ? ' on' : ''}">${ic('g-wifi')}</i><div><b>Wi‑Fi</b><span>${esc(SYS.wifiName)}</span></div></div>
              <div class="cc-row" data-t="bt"><i class="cc-b${SYS.bluetooth ? ' on' : ''}">${ic('g-bt')}</i><div><b>Bluetooth</b><span>${SYS.bluetooth ? 'On' : 'Off'}</span></div></div>
              <div class="cc-row" data-t="ad"><i class="cc-b on">${ic('g-airdrop')}</i><div><b>AirDrop</b><span>Contacts Only</span></div></div>`, 'grid-column:span 2')}
      ${tile(`<div class="cc-row" data-t="focus"><i class="cc-b">${ic('g-moon')}</i><div><b>Focus</b><span>Off</span></div></div>`, 'grid-column:span 2')}
      ${tile(`<div class="cc-row" data-t="dark"><i class="cc-b${SYS.theme === 'dark' ? ' on' : ''}">${ic('g-moon')}</i><div><b>Dark Mode</b><span>${SYS.theme === 'dark' ? 'On' : 'Off'}</span></div></div>`, 'grid-column:span 1')}
      ${tile(`<div class="cc-row" data-t="stage"><i class="cc-b">${ic('g-grid')}</i><div><b>Stage Mgr</b><span>Off</span></div></div>`, 'grid-column:span 1')}
      ${tile(`<div class="cc-slab"><b>Display</b><div class="sl" data-slider="bri"><div class="trk"><div class="fil"></div></div><div class="kn"></div></div></div>`, 'grid-column:span 2')}
      ${tile(`<div class="cc-slab"><b>Sound</b><div class="sl" data-slider="snd"><div class="trk"><div class="fil"></div></div><div class="kn"></div></div></div>`, 'grid-column:span 2')}
    </div></div>`);
  node.querySelectorAll('.cc-b svg').forEach(s => s.style.cssText = 'width:15px;height:15px');
  Slider(node.querySelector('[data-slider="bri"]'), Screen.brightness, v => Screen.setBrightness(v));
  Slider(node.querySelector('[data-slider="snd"]'), SYS.volume, v => { SYS.volume = v; SYS.muted = v === 0; Bus.emit('volume', v); MenuBar.paintStatus(); });
  on(node, 'click', '[data-t]', (e, t) => {
    const k = t.dataset.t, b = t.querySelector('.cc-b'), sp = t.querySelector('span');
    if (k === 'wifi') { SYS.wifi = !SYS.wifi; b.classList.toggle('on', SYS.wifi); sp.textContent = SYS.wifi ? SYS.wifiName : 'Off'; MenuBar.paintStatus(); }
    if (k === 'bt') { SYS.bluetooth = !SYS.bluetooth; b.classList.toggle('on', SYS.bluetooth); sp.textContent = SYS.bluetooth ? 'On' : 'Off'; MenuBar.paintStatus(); }
    if (k === 'dark') { Theme.toggle(); b.classList.toggle('on', SYS.theme === 'dark'); sp.textContent = SYS.theme === 'dark' ? 'On' : 'Off'; }
    if (k === 'focus' || k === 'stage' || k === 'ad') { b.classList.toggle('on'); sp.textContent = b.classList.contains('on') ? 'On' : 'Off'; }
  });
  return node;
}

/* ============================================================================
   7 · DESKTOP
   ========================================================================== */
const GRID = { w: 92, h: 98, padTop: 8, padRight: 12 };

const Desktop = {
  items: [
    { id: 'hd', name: 'Macintosh HD', icon: 'f-hd', cell: [0, 0], open: () => WM.open('finder', { path: ['Macintosh HD'] }) },
    { id: 'projects', name: 'Projects', icon: 'f-folder', cell: [0, 1], open: () => WM.open('finder', { path: ['Prasenjit', 'Projects'] }) },
    { id: 'notes', name: 'prasenx.txt', icon: 'f-txt', cell: [0, 2], open: () => WM.open('textedit', { file: 'prasenx.txt' }) },
    { id: 'shot', name: 'Screenshot 2026‑07‑27 at 4.34.11 PM.png', icon: 'f-img', cell: [0, 3], open: () => WM.open('preview', { file: 'Screenshot' }) },
    { id: 'guide', name: 'Interface Guidelines.pdf', icon: 'f-pdf', cell: [1, 0], open: () => WM.open('preview', { file: 'Interface Guidelines.pdf' }) },
  ],

  init() {
    const host = $('#desktop');
    this.items.forEach(it => {
      const n = el(`<div class="dicon" data-id="${it.id}" tabindex="-1">
        <div class="art">${ic(it.icon)}</div><div class="lbl">${esc(it.name)}</div></div>`);
      host.append(n); it.node = n;
    });
    this.layout();
    addEventListener('resize', () => this.layout());

    on(host, 'pointerdown', '.dicon', (e, t) => this.grab(e, t));
    on(host, 'dblclick', '.dicon', (e, t) => {
      const it = this.items.find(i => i.id === t.dataset.id);
      if (it && it.open) it.open();
    });
    on(host, 'contextmenu', '.dicon', (e, t) => {
      this.select(t.dataset.id);
      const it = this.items.find(i => i.id === t.dataset.id);
      ctxMenu(e, [
        { id: 'o', label: 'Open', run: () => it.open && it.open() },
        { id: 'w', label: 'Open With', key: '▸' }, '-',
        { id: 'i', label: 'Get Info', key: '⌘I', run: () => Toast(`${it.name} — 0 bytes`) },
        { id: 'r', label: 'Rename', run: () => Toast('Renaming is left as an exercise.') },
        { id: 'd', label: 'Duplicate', key: '⌘D', run: () => Toast('Duplicated') }, '-',
        { id: 't', label: 'Move to Trash', key: '⌘⌫', run: () => this.trash(it) }, '-',
        { id: 'q', label: 'Quick Look', key: '␣', run: () => it.open && it.open() },
      ]);
    });

    /* marquee + deselect */
    host.addEventListener('pointerdown', e => {
      if (e.target.closest('.dicon, .wgt')) return;
      if (e.button !== 0) return;
      this.select(null);
      this.marquee(e);
    });
    host.addEventListener('contextmenu', e => {
      if (e.target.closest('.dicon, .wgt')) return;
      ctxMenu(e, [
        { id: 'nf', label: 'New Folder', run: () => this.newFolder() },
        { id: 'gi', label: 'Get Info', run: () => WM.open('about') }, '-',
        { id: 'cw', label: 'Change Wallpaper…', run: () => WM.open('settings', { section: 'wallpaper' }) },
        { id: 'ew', label: 'Edit Widgets…', run: () => Toast('Widgets are already on the desktop.') }, '-',
        { id: 'st', label: 'Use Stacks', key: '⌃⌘0' },
        { id: 'sb', label: 'Sort By', key: '▸' },
        { id: 'vo', label: 'Show View Options', key: '⌘J' },
      ]);
    });
    this.buildWidgets();
  },

  cellPos(col, row) {
    return {
      x: innerWidth - GRID.padRight - (col + 1) * GRID.w,
      y: parseInt(getComputedStyle(document.documentElement).getPropertyValue('--mb-h')) + GRID.padTop + row * GRID.h,
    };
  },
  posCell(x, y) {
    const mb = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--mb-h'));
    const col = Math.round((innerWidth - GRID.padRight - GRID.w - x) / GRID.w);
    const row = Math.round((y - mb - GRID.padTop) / GRID.h);
    const maxRow = Math.floor((innerHeight - mb - GRID.padTop - 110) / GRID.h);
    return [clamp(col, 0, Math.floor(innerWidth / GRID.w) - 2), clamp(row, 0, Math.max(0, maxRow))];
  },
  layout() {
    this.items.forEach(it => {
      const p = this.cellPos(it.cell[0], it.cell[1]);
      it.node.style.left = p.x + 'px'; it.node.style.top = p.y + 'px';
    });
  },
  select(id) {
    this.items.forEach(i => i.node.classList.toggle('sel', i.id === id));
  },

  grab(e, node) {
    if (e.button !== 0) return;
    const it = this.items.find(i => i.id === node.dataset.id);
    this.select(it.id);
    const sx = e.clientX, sy = e.clientY;
    const ox = parseFloat(node.style.left), oy = parseFloat(node.style.top);
    let moved = false;
    node.setPointerCapture(e.pointerId);
    const mv = ev => {
      const dx = ev.clientX - sx, dy = ev.clientY - sy;
      if (!moved && Math.hypot(dx, dy) < 3) return;
      if (!moved) { moved = true; node.classList.add('drag'); node.classList.remove('settle'); }
      node.style.left = (ox + dx) + 'px';
      node.style.top = clamp(oy + dy, 22, innerHeight - 120) + 'px';
    };
    const up = () => {
      node.removeEventListener('pointermove', mv); node.removeEventListener('pointerup', up);
      if (!moved) return;
      node.classList.remove('drag');
      const [c, r] = this.posCell(parseFloat(node.style.left), parseFloat(node.style.top));
      /* nudge aside if the target cell is taken */
      let col = c, row = r, guard = 0;
      while (this.items.some(i => i !== it && i.cell[0] === col && i.cell[1] === row) && guard++ < 40) {
        row++; if (row > 5) { row = 0; col++; }
      }
      it.cell = [col, row];
      node.classList.add('settle');
      const p = this.cellPos(col, row);
      node.style.left = p.x + 'px'; node.style.top = p.y + 'px';
      setTimeout(() => node.classList.remove('settle'), 300);
    };
    node.addEventListener('pointermove', mv); node.addEventListener('pointerup', up);
  },

  marquee(e) {
    const box = $('#marquee'), sx = e.clientX, sy = e.clientY;
    let live = false;
    const mv = ev => {
      if (!live && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 4) return;
      live = true; box.style.display = 'block';
      const l = Math.min(sx, ev.clientX), t = Math.min(sy, ev.clientY);
      const w = Math.abs(ev.clientX - sx), h = Math.abs(ev.clientY - sy);
      Object.assign(box.style, { left: l + 'px', top: t + 'px', width: w + 'px', height: h + 'px' });
      const R = { l, t, r: l + w, b: t + h };
      this.items.forEach(i => {
        const b = i.node.getBoundingClientRect();
        i.node.classList.toggle('sel', !(b.right < R.l || b.left > R.r || b.bottom < R.t || b.top > R.b));
      });
    };
    const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); box.style.display = 'none'; };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
  },

  newFolder() {
    const n = this.items.filter(i => i.name.startsWith('untitled folder')).length;
    const name = 'untitled folder' + (n ? ' ' + (n + 1) : '');
    let col = 0, row = 0, guard = 0;
    while (this.items.some(i => i.cell[0] === col && i.cell[1] === row) && guard++ < 40) { row++; if (row > 5) { row = 0; col++; } }
    const it = { id: 'nf' + Date.now(), name, icon: 'f-folder', cell: [col, row], open: () => WM.open('finder', { path: ['Prasenjit', 'Desktop'] }) };
    const node = el(`<div class="dicon" data-id="${it.id}"><div class="art">${ic(it.icon)}</div><div class="lbl">${esc(name)}</div></div>`);
    $('#desktop').append(node); it.node = node; this.items.push(it);
    this.layout(); this.select(it.id);
  },
  trash(it) {
    it.node.style.transition = 'transform .22s var(--e-io),opacity .22s ease';
    it.node.style.transform = 'scale(.4)'; it.node.style.opacity = '0';
    setTimeout(() => { it.node.remove(); this.items = this.items.filter(i => i !== it); Dock.setTrashFull(true); }, 230);
  },

  buildWidgets() {
    $('#dwidgets').innerHTML = '';
    $('#dwidgets').append(Widgets.calendar({ compact: true }), Widgets.weather({ compact: true }), Widgets.stocks({ compact: true }));
  }
};

/* Sleep / lock screen */
const Screen = {
  brightness: 0.92,
  /* Dim with an overlay, never `filter` on the wallpaper: a filtered element gets
     its own render surface, and Chromium then composites the desktop icons *above*
     any backdrop-filter panel instead of blurring them into it. Dimming the whole
     stage is also what real brightness does — windows included. */
  setBrightness(v) {
    this.brightness = clamp(v, .25, 1);
    const d = $('#dimmer');
    if (d) d.style.opacity = ((1 - this.brightness) * .78).toFixed(3);
  },
  sleep() {
    Pop.close();
    const v = el(`<div id="sleeper"></div>`);
    document.body.append(v);
    setTimeout(() => { v.classList.add('wake'); setTimeout(() => v.remove(), 900); }, 1000);
  }
};

/* Toast — used for the handful of actions that have no real destination */
let toastTimer;
function Toast(msg) {
  let t = $('#toast');
  if (!t) { t = el(`<div id="toast"></div>`); $('#stage').append(t); }
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('on'), 2100);
}

/* ============================================================================
   8 · DOCK  —  parabolic magnification driven by one rAF loop
   ========================================================================== */
const DOCK_ITEMS = [
  'finder', 'launchpad', 'safari', 'mail', 'messages', 'maps', 'photos',
  'notes', 'calendar', 'music', 'terminal', 'calculator', 'settings', '|', 'trash'
];

const Dock = {
  gap: 5, padX: 8, spread: 2.9,
  slots: [],           /* {node, base, w, id} */
  mx: null,            /* pointer x in dock space, null = not hovering */
  cur: [], tgt: [],    /* per-icon scale, smoothed */
  running: false, trashFull: false,

  init() {
    const dock = $('#dock');
    dock.innerHTML = '';
    this.slots = [];
    DOCK_ITEMS.forEach(id => {
      if (id === '|') { const d = el('<div class="divider"></div>'); dock.append(d); this.slots.push({ divider: true, node: d }); return; }
      const app = APPS[id];
      const node = el(`<div class="di" data-app="${id}" role="button" aria-label="${esc(app.name)}">
          <div class="art">${ic(app.icon)}</div><span class="dot"></span><span class="hit"></span></div>`);
      dock.append(node);
      this.slots.push({ node, id, app });
    });
    dock.append(el('<div id="docktip"></div>'));

    this.cur = this.slots.map(() => 1);
    this.tgt = this.slots.map(() => 1);
    this.measure();

    dock.addEventListener('pointermove', e => { this.mx = e.clientX; this.kick(); });
    dock.addEventListener('pointerenter', e => { this.mx = e.clientX; this.kick(); });
    dock.addEventListener('pointerleave', () => { this.mx = null; this.hideTip(); this.kick(); });

    on(dock, 'pointerdown', '.di', (e, t) => {
      if (e.button !== 0) return;
      t.classList.add('press');
      const up = () => { t.classList.remove('press'); removeEventListener('pointerup', up); };
      addEventListener('pointerup', up);
    });
    on(dock, 'click', '.di', (e, t) => this.activate(t.dataset.app, t));
    on(dock, 'contextmenu', '.di', (e, t) => this.ctx(e, t));

    addEventListener('resize', () => this.measure());
    Bus.on('dockprefs', () => { this.measure(); });
  },

  /** Recompute base geometry; called on resize and preference changes. */
  measure() {
    const S = SYS.dockSize;
    document.documentElement.style.setProperty('--dock-size', S + 'px');
    this.gap = Math.round(S * 0.095);
    this.padX = Math.round(S * 0.15);
    let x = this.padX;
    this.slots.forEach(s => {
      if (s.divider) { s.w = Math.round(S * 0.30); s.base = x + s.w / 2; x += s.w; return; }
      s.w = S; s.base = x + S / 2; x += S + this.gap;
    });
    this.baseW = x - this.gap + this.padX;
    this.paint(true);
  },

  kick() { if (!this.running) { this.running = true; raf(this.frame); } },

  frame: null,   /* assigned below (needs `this` bound) */

  step() {
    const S = SYS.dockSize, dock = $('#dock');
    const rect = dock.getBoundingClientRect();
    const MAG = SYS.dockMagOn ? SYS.dockMag : 1;
    const reach = this.spread * S;

    /* --- targets ------------------------------------------------------- */
    /* Measured against the *rest* layout, not the live one. Feeding the magnified
       centres back in makes the scale an input to itself, which drags the peak off
       the icon you are actually pointing at as soon as magnification gets large.
       The tray is centre-anchored, so its midpoint is the one stable reference. */
    const restLeft = rect.left + rect.width / 2 - this.baseW / 2;
    let hovered = -1, best = 1e9;
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i];
      if (s.divider) { this.tgt[i] = 1; continue; }
      if (this.mx == null) { this.tgt[i] = 1; continue; }
      const cx = restLeft + s.base;
      const d = Math.abs(this.mx - cx);
      if (d < best) { best = d; hovered = i; }
      const u = clamp(1 - d / reach, 0, 1);
      /* cosine bell — matches the real dock's falloff far better than linear */
      this.tgt[i] = 1 + (MAG - 1) * (0.5 - 0.5 * Math.cos(Math.PI * u)) ** 0.86;
    }

    /* --- smoothing (critically damped feel) ------------------------------ */
    let settled = true;
    for (let i = 0; i < this.cur.length; i++) {
      const d = this.tgt[i] - this.cur[i];
      if (Math.abs(d) > 0.0007) { this.cur[i] += d * 0.38; settled = false; }
      else this.cur[i] = this.tgt[i];
    }

    this.paint();

    /* tooltip follows the nearest icon while hovering */
    if (this.mx != null && hovered >= 0 && best < S * 0.75) this.showTip(hovered);
    else this.hideTip();

    if (!settled) raf(this.frame); else this.running = false;
  },

  /** Lay icons out from their smoothed widths so nothing ever overlaps. */
  paint(force) {
    const S = SYS.dockSize;
    let total = this.padX * 2;
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i];
      total += (s.divider ? s.w : S * this.cur[i]) + (s.divider ? 0 : this.gap);
    }
    total -= this.gap;

    let x = this.padX;
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i], k = this.cur[i];
      if (s.divider) {
        s.laidCenter = x + s.w / 2;
        s.node.style.transform = `translateX(${(x).toFixed(2)}px)`;
        x += s.w; continue;
      }
      const w = S * k;
      s.laidCenter = x + w / 2;
      /* translate so the (unscaled) box lands centred on its slot, then scale from the base */
      const tx = s.laidCenter - S / 2;
      s.node.style.setProperty('--tf', `translate3d(${tx.toFixed(2)}px,0,0) scale(${k.toFixed(4)})`);
      s.node.style.transform = `translate3d(${tx.toFixed(2)}px,0,0) scale(${k.toFixed(4)})`;
      x += w + this.gap;
    }
    $('#dock').style.width = total.toFixed(2) + 'px';
  },

  showTip(i) {
    const s = this.slots[i]; if (!s || !s.app) return;
    const tip = $('#docktip');
    tip.textContent = s.app.name;
    tip.style.left = s.laidCenter + 'px';
    tip.classList.add('on');
  },
  hideTip() { const t = $('#docktip'); if (t) t.classList.remove('on'); },

  slotFor(id) { return this.slots.find(s => s.id === id); },
  rectFor(id) {
    const s = this.slotFor(id);
    if (!s) { const d = $('#dock').getBoundingClientRect(); return { x: d.left + d.width / 2, y: d.top + d.height / 2, w: SYS.dockSize, h: SYS.dockSize }; }
    const d = $('#dock').getBoundingClientRect();
    return { x: d.left + s.laidCenter, y: d.bottom - 9 - SYS.dockSize / 2, w: SYS.dockSize, h: SYS.dockSize };
  },

  activate(id, node) {
    if (id === 'launchpad') { Launchpad.toggle(); return; }
    if (id === 'trash') { WM.open('finder', { path: ['Trash'] }); return; }
    const existing = WM.byApp(id);
    if (existing.length) {
      const mini = existing.find(w => w.min);
      if (mini) WM.unmin(mini.id);
      else WM.focus(existing[existing.length - 1].id);
      return;
    }
    this.bounce(id);
    WM.open(id);
  },

  bounce(id) {
    const s = this.slotFor(id); if (!s) return;
    s.node.classList.remove('bounce'); void s.node.offsetWidth;
    s.node.classList.add('bounce');
    setTimeout(() => s.node.classList.remove('bounce'), 3200);
  },
  stopBounce(id) { const s = this.slotFor(id); if (s) s.node.classList.remove('bounce'); },

  setRunning(id, on) { const s = this.slotFor(id); if (s) s.node.classList.toggle('run', on); },
  setTrashFull(full) {
    this.trashFull = full;
    const s = this.slotFor('trash'); if (s) s.node.querySelector('.art').innerHTML = ic(full ? 'app-trash-full' : 'app-trash');
  },

  ctx(e, t) {
    const id = t.dataset.app, app = APPS[id];
    const open = WM.byApp(id);
    if (id === 'trash') {
      return ctxMenu(e, [
        { id: 'o', label: 'Open', run: () => WM.open('finder', { path: ['Trash'] }) },
        { id: 'e', label: 'Empty Trash', disabled: !this.trashFull, run: () => { this.setTrashFull(false); Toast('Trash emptied'); } },
      ]);
    }
    const items = [];
    if (open.length > 1) items.push({ head: 'Windows' }, ...open.map((w, i) => ({ id: 'w' + i, label: w.title, run: () => WM.focus(w.id) })), '-');
    items.push(
      { id: 'new', label: 'New Window', run: () => WM.open(id, { force: true }) },
      { id: 'opt', label: 'Options', key: '▸' },
      { id: 'show', label: 'Show in Finder', run: () => WM.open('finder', { path: ['Macintosh HD', 'Applications'], select: app.name + '.app' }) },
      '-',
      open.length
        ? { id: 'quit', label: 'Quit', run: () => WM.quitApp(id) }
        : { id: 'open', label: 'Open', run: () => this.activate(id, t) }
    );
    ctxMenu(e, items);
  }
};
Dock.frame = () => Dock.step();

/* ============================================================================
   9 · WINDOW MANAGER
   ========================================================================== */
const TL_HTML =
  `<div class="tl" data-tl>
     <b class="c" data-w="close">${ic('g-x')}</b>
     <b class="m" data-w="min">${ic('g-minus')}</b>
     <b class="f" data-w="zoom">${ic('g-chev-ud')}</b>
   </div>`;

/** Standard title bar markup for apps that want one. */
function titlebar(title, o = {}) {
  return `<div class="tb${o.tall ? ' tall' : ''}${o.plain ? ' plain' : ''}${o.dark ? ' dark' : ''}" data-drag>
    <div class="title">${esc(title)}</div>
    <div class="tbz">${TL_HTML}${o.left || ''}</div>
    <div class="grow"></div>
    <div class="tbz">${o.right || ''}</div>
  </div>`;
}

const WM = {
  list: [], z: 10, seq: 0, cascade: 0,

  mb() { return parseInt(getComputedStyle(document.documentElement).getPropertyValue('--mb-h')) || 25; },
  dockTop() { return innerHeight - (SYS.dockSize + 14 + 12); },

  byApp(id) { return this.list.filter(w => w.app === id && !w.dead); },
  get front() { return this.list.filter(w => !w.min && !w.dead).sort((a, b) => a.zi - b.zi).pop(); },

  open(appId, opts = {}) {
    const app = APPS[appId];
    if (!app) return Toast('Unknown app: ' + appId);
    if (!opts.force) {
      const ex = this.byApp(appId);
      if (ex.length && app.single !== false) {
        const w = ex[ex.length - 1];
        if (w.min) this.unmin(w.id); else this.focus(w.id);
        if (app.reopen) app.reopen(w, opts);
        return w;
      }
    }
    Dock.bounce(appId);

    const id = 'w' + (++this.seq);
    const W = Math.min(opts.w || app.w || 860, innerWidth - 60);
    const H = Math.min(opts.h || app.h || 560, innerHeight - this.mb() - 90);
    const step = 26, n = this.cascade++ % 7;
    const L = Math.round(clamp((innerWidth - W) / 2 - 90 + n * step, 14, innerWidth - W - 14));
    const T = Math.round(clamp(this.mb() + 26 + n * step, this.mb() + 6, innerHeight - H - 90));

    const node = el(`<div class="win opening" id="${id}" data-app="${appId}"></div>`);
    Object.assign(node.style, { left: L + 'px', top: T + 'px', width: W + 'px', height: H + 'px' });

    const w = {
      id, app: appId, node, title: app.name, min: false, zoomed: false,
      minW: app.minW || 380, minH: app.minH || 240, zi: 0, api: {}
    };
    this.list.push(w);

    node.innerHTML = (app.mount ? app.mount(w, opts) : `<div class="wb"></div>`) +
      ['n', 's', 'w', 'e', 'nw', 'ne', 'sw', 'se'].map(d => `<div class="rz rz-${d}" data-rz="${d}"></div>`).join('');

    const slot = node.querySelector('[data-tl]');
    if (slot) slot.outerHTML = TL_HTML.replace(' data-tl', '');
    else node.insertAdjacentHTML('afterbegin', TL_HTML.replace('class="tl"', 'class="tl float"'));

    $('#layer-win').append(node);
    if (app.ready) app.ready(w, opts);

    this.wire(w);
    this.focus(id);
    Dock.setRunning(appId, true);
    setTimeout(() => { node.classList.remove('opening'); Dock.stopBounce(appId); }, 320);
    return w;
  },

  wire(w) {
    const node = w.node;
    node.addEventListener('pointerdown', e => {
      if (!e.target.closest('.tl')) this.focus(w.id);
    }, true);
    on(node, 'click', '.tl b', (e, t) => {
      e.stopPropagation();
      const a = t.dataset.w;
      if (a === 'close') this.close(w.id);
      if (a === 'min') this.minimize(w.id);
      if (a === 'zoom') this.zoom(w.id);
    });
    on(node, 'pointerdown', '[data-drag]', (e, t) => {
      if (e.button !== 0) return;
      if (e.target.closest('button,input,.tl,.seg,.sfield,[data-nodrag]')) return;
      this.drag(w, e);
    });
    on(node, 'dblclick', '[data-drag]', e => {
      if (e.target.closest('button,input,.tl,.seg,.sfield,[data-nodrag]')) return;
      this.zoom(w.id);
    });
    on(node, 'pointerdown', '[data-rz]', (e, t) => { if (e.button === 0) this.resize(w, e, t.dataset.rz); });
  },

  focus(id) {
    const w = this.list.find(x => x.id === id); if (!w || w.dead) return;
    w.zi = ++this.z;
    this.list.forEach(x => { x.node.classList.toggle('front', x === w); x.node.style.zIndex = x.zi || 1; });
    const app = APPS[w.app];
    MenuBar.setApp(app.name, app.menus ? app.menus() : stdMenus(w.app));
    this.syncMenubarFill();
  },

  /* The menu bar goes opaque when a zoomed window reaches it, like the real thing. */
  syncMenubarFill() {
    const any = this.list.some(w => !w.dead && !w.min && w.zoomed);
    $('#menubar').classList.toggle('opaque', any);
  },

  close(id) {
    const w = this.list.find(x => x.id === id); if (!w || w.dead) return;
    w.dead = true;
    if (APPS[w.app].onClose) APPS[w.app].onClose(w);
    w.node.classList.add('closing');
    setTimeout(() => {
      w.node.remove();
      this.list = this.list.filter(x => x !== w);
      if (!this.byApp(w.app).length) Dock.setRunning(w.app, false);
      this.syncMenubarFill();
      const f = this.front;
      if (f) this.focus(f.id);
      else { MenuBar.setApp('Finder', APP_MENUS.finder); }
    }, 200);
  },

  minimize(id) {
    const w = this.list.find(x => x.id === id);
    if (!w || w.min || w.busy) return;
    w.busy = true; w.min = true;
    const n = w.node, r = n.getBoundingClientRect(), d = Dock.rectFor(w.app);
    const tx = d.x - (r.left + r.width / 2), ty = d.y - (r.top + r.height / 2);
    const sx = (d.w * 0.82) / r.width, sy = (d.h * 0.82) / r.height;
    n.classList.add('mini');
    const a = n.animate([
      { transform: 'translate(0px,0px) scale(1,1)', clipPath: 'polygon(0% 0%,100% 0%,100% 100%,0% 100%)', opacity: 1, borderRadius: '11px' },
      { transform: `translate(${tx * .5}px,${ty * .58}px) scale(${lerp(1, sx, .5)},${lerp(1, sy, .42)})`, clipPath: 'polygon(20% 0%,80% 0%,93% 100%,7% 100%)', opacity: .92, borderRadius: '22px', offset: .55 },
      { transform: `translate(${tx}px,${ty}px) scale(${sx},${sy})`, clipPath: 'polygon(43% 0%,57% 0%,100% 100%,0% 100%)', opacity: .3, borderRadius: '40px' },
    ], { duration: 430, easing: 'cubic-bezier(.42,.02,.58,1)', fill: 'forwards' });
    a.onfinish = () => {
      n.style.visibility = 'hidden'; w.busy = false;
      this.syncMenubarFill();
      const f = this.front; if (f) this.focus(f.id);
    };
    w.anim = a;
  },

  unmin(id) {
    const w = this.list.find(x => x.id === id);
    if (!w || !w.min || w.busy) return;
    w.busy = true; w.min = false;
    const n = w.node;
    n.style.visibility = '';
    /* Raise it without repainting the rest of the stack: a full focus() re-shadows
       every other window, and those shadows are expensive enough to eat frames off
       the front of the warp. The real focus lands when the window arrives. */
    n.style.zIndex = ++this.z;
    /* Un-hiding still costs a re-raster of the window's contents, since hidden layers
       get thrown away. Give the compositor two frames to catch up while the window
       sits shrunk in the dock, too small to see. */
    if (w.anim) {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (w.min || !w.anim) return;
        w.anim.reverse();
        w.anim.onfinish = () => {
          n.classList.remove('mini'); if (w.anim) w.anim.cancel(); w.anim = null; w.busy = false;
          this.focus(id);
        };
      }));
    } else { n.classList.remove('mini'); w.busy = false; this.focus(id); }
  },

  /* AppKit's visibleFrame: zoom stops short of the dock instead of tucking under
     it. Read from the tokens, not the tray's box, so a mid-magnification hover
     can't change the answer. */
  visibleH() {
    const cs = getComputedStyle(document.documentElement);
    const px = k => parseFloat(cs.getPropertyValue(k)) || 0;
    return innerHeight - this.mb() - (px('--dock-size') + 14 + px('--dock-bottom') + 5);
  },

  zoom(id) {
    const w = this.list.find(x => x.id === id); if (!w) return;
    const n = w.node;
    const mb = this.mb();
    if (!w.zoomed) {
      w.prev = { left: n.style.left, top: n.style.top, width: n.style.width, height: n.style.height };
      w.zoomed = true; n.classList.add('zoomed');
      this.tweenBox(n, { left: 0, top: mb, width: innerWidth, height: this.visibleH() });
    } else {
      w.zoomed = false;
      this.tweenBox(n, {
        left: parseFloat(w.prev.left), top: parseFloat(w.prev.top),
        width: parseFloat(w.prev.width), height: parseFloat(w.prev.height)
      }, () => n.classList.remove('zoomed'));
    }
    this.syncMenubarFill();
  },

  tweenBox(n, to, done) {
    const from = { left: n.offsetLeft, top: n.offsetTop, width: n.offsetWidth, height: n.offsetHeight };
    const t0 = performance.now(), D = 300;
    const ease = t => 1 - Math.pow(1 - t, 3.2);
    const tick = now => {
      const t = clamp((now - t0) / D, 0, 1), k = ease(t);
      n.style.left = lerp(from.left, to.left, k) + 'px';
      n.style.top = lerp(from.top, to.top, k) + 'px';
      n.style.width = lerp(from.width, to.width, k) + 'px';
      n.style.height = lerp(from.height, to.height, k) + 'px';
      if (t < 1) raf(tick); else if (done) done();
    };
    raf(tick);
  },

  drag(w, e) {
    if (w.zoomed) return;
    const n = w.node;
    const sx = e.clientX, sy = e.clientY;
    const ox = n.offsetLeft, oy = n.offsetTop;
    const mb = this.mb();
    let vx = 0, vy = 0, lx = sx, ly = sy, lt = performance.now(), moved = false;
    n.classList.add('drag');
    document.body.style.cursor = 'default';
    const mv = ev => {
      const dx = ev.clientX - sx, dy = ev.clientY - sy;
      if (!moved && Math.abs(dx) + Math.abs(dy) < 2) return;
      moved = true;
      const now = performance.now(), dt = Math.max(8, now - lt);
      vx = (ev.clientX - lx) / dt * 16; vy = (ev.clientY - ly) / dt * 16;
      lx = ev.clientX; ly = ev.clientY; lt = now;
      n.style.left = clamp(ox + dx, -n.offsetWidth + 90, innerWidth - 90) + 'px';
      n.style.top = clamp(oy + dy, mb, innerHeight - 34) + 'px';
    };
    const up = () => {
      removeEventListener('pointermove', mv, true); removeEventListener('pointerup', up, true);
      n.classList.remove('drag');
      if (!moved) return;
      /* short damped glide so releasing a flick feels physical, not abrupt */
      const speed = Math.hypot(vx, vy);
      if (speed < 3) return;
      let px = parseFloat(n.style.left), py = parseFloat(n.style.top);
      const tick = () => {
        vx *= 0.86; vy *= 0.86;
        px = clamp(px + vx, -n.offsetWidth + 90, innerWidth - 90);
        py = clamp(py + vy, mb, innerHeight - 34);
        n.style.left = px + 'px'; n.style.top = py + 'px';
        if (Math.hypot(vx, vy) > 0.4) raf(tick);
      };
      raf(tick);
    };
    addEventListener('pointermove', mv, true); addEventListener('pointerup', up, true);
  },

  resize(w, e, dir) {
    const n = w.node;
    if (w.zoomed) { w.zoomed = false; n.classList.remove('zoomed'); this.syncMenubarFill(); }
    const s = { x: e.clientX, y: e.clientY, l: n.offsetLeft, t: n.offsetTop, w: n.offsetWidth, h: n.offsetHeight };
    const mb = this.mb();
    n.classList.add('rsz');
    const cursor = { n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize', nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize' }[dir];
    document.body.style.cursor = cursor;
    const mv = ev => {
      const dx = ev.clientX - s.x, dy = ev.clientY - s.y;
      let L = s.l, T = s.t, W = s.w, H = s.h;
      if (dir.includes('e')) W = Math.max(w.minW, s.w + dx);
      if (dir.includes('s')) H = Math.max(w.minH, s.h + dy);
      if (dir.includes('w')) { W = Math.max(w.minW, s.w - dx); L = s.l + (s.w - W); }
      if (dir.includes('n')) { H = Math.max(w.minH, s.h - dy); T = s.t + (s.h - H); if (T < mb) { H -= (mb - T); T = mb; } }
      Object.assign(n.style, { left: L + 'px', top: T + 'px', width: W + 'px', height: H + 'px' });
    };
    const up = () => {
      removeEventListener('pointermove', mv, true); removeEventListener('pointerup', up, true);
      n.classList.remove('rsz'); document.body.style.cursor = '';
      if (APPS[w.app].onResize) APPS[w.app].onResize(w);
    };
    addEventListener('pointermove', mv, true); addEventListener('pointerup', up, true);
  },

  /* ---- menu-driven helpers ---- */
  closeFront() { const f = this.front; if (f) this.close(f.id); },
  minFront() { const f = this.front; if (f) this.minimize(f.id); },
  zoomFront() { const f = this.front; if (f) this.zoom(f.id); },
  hideFront() { const f = this.front; if (f) this.minimize(f.id); },
  hideOthers() { const f = this.front; this.list.forEach(w => { if (w !== f && !w.min) this.minimize(w.id); }); },
  showAll() { this.list.filter(w => w.min).forEach(w => this.unmin(w.id)); },
  quitFront() { const f = this.front; if (f) this.quitApp(f.app); },
  quitApp(id) { this.byApp(id).forEach(w => this.close(w.id)); },
  cycle() {
    const vis = this.list.filter(w => !w.min && !w.dead);
    if (vis.length < 2) return;
    const back = vis.sort((a, b) => a.zi - b.zi)[0];
    this.focus(back.id);
  },
  forceQuitPanel() {
    const apps = [...new Set(this.list.filter(w => !w.dead).map(w => w.app))];
    const node = el(`<div class="pop wide" style="width:280px;padding:0">
      <div style="padding:12px 14px 8px;font-weight:600">Force Quit Applications</div>
      <div style="max-height:220px;overflow:auto;padding:0 6px 6px">
        ${apps.length ? apps.map(a => `<div class="mi" data-q="${a}" style="height:30px">${ic(APPS[a].icon, 'ico')}<span>${esc(APPS[a].name)}</span></div>`).join('')
        : '<div style="padding:14px;color:var(--txt-2);font-size:12.5px">No applications are open.</div>'}
      </div></div>`);
    node.querySelectorAll('.ico').forEach(s => s.style.cssText = 'width:19px;height:19px');
    on(node, 'click', '[data-q]', (e, t) => { Pop.close(); WM.quitApp(t.dataset.q); });
    Pop.open(node, { x: innerWidth / 2 - 140, y: innerHeight / 2 - 140, origin: 'center' });
  }
};

/* ---- global shortcuts ---------------------------------------------------- */
addEventListener('keydown', e => {
  const meta = e.metaKey || e.ctrlKey;
  const typing = /input|textarea/i.test(document.activeElement.tagName) || document.activeElement.isContentEditable;

  if (e.key === 'Escape') {
    if (Pop.cur) { Pop.close(); return; }
    if ($('#spot')) { Spotlight.close(); return; }
    if ($('#lpad')) { Launchpad.close(); return; }
    if ($('#nc')) { NotifCenter.close(); return; }
  }
  if (meta && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); Spotlight.toggle(); return; }
  if (meta && e.code === 'Space') { e.preventDefault(); Spotlight.toggle(); return; }
  if (e.key === 'F4') { e.preventDefault(); Launchpad.toggle(); return; }
  if (typing) return;
  if (meta && (e.key === 'w' || e.key === 'W')) { e.preventDefault(); WM.closeFront(); }
  else if (meta && (e.key === 'm' || e.key === 'M')) { e.preventDefault(); WM.minFront(); }
  else if (meta && (e.key === 'q' || e.key === 'Q')) { e.preventDefault(); WM.quitFront(); }
  else if (meta && e.key === '`') { e.preventDefault(); WM.cycle(); }
  else if (meta && (e.key === 'n' || e.key === 'N')) {
    const f = WM.front; if (f) { e.preventDefault(); WM.open(f.app, { force: true }); }
  }
});
addEventListener('pointerup', () => { document.body.style.cursor = ''; });

/* ============================================================================
   10 · VIRTUAL FILESYSTEM
   ========================================================================== */
const dt = (m, d, h = 10, mi = 24) => new Date(2026, m - 1, d, h, mi);
/* A folder's date mirrors its newest child, the way the real Finder reports it. */
const FOLD = (name, children, icon = 'f-folder') => {
  const ds = (children || []).map(c => c.date).filter(Boolean);
  return { name, kind: 'folder', icon, children, k: 'Folder', date: ds.length ? new Date(Math.max(...ds)) : dt(7, 12, 9, 41) };
};
const FILE = (name, icon, size, k, date, extra) => Object.assign({ name, kind: 'file', icon, size, k, date }, extra);

const APP_FILES = ['Safari', 'Mail', 'Messages', 'Maps', 'Photos', 'Notes', 'Calendar', 'Music', 'Terminal',
  'Calculator', 'System Settings', 'Preview', 'Reminders', 'FaceTime', 'App Store', 'Podcasts', 'TV',
  'Weather', 'Stocks', 'Books', 'Contacts', 'Freeform', 'Clock']
  .map(n => FILE(n + '.app', 'f-app', 92 + n.length * 7 + 'MB', 'Application', dt(6, 12)));

const FS = FOLD('Macintosh HD', [
  FOLD('Applications', APP_FILES),
  FOLD('Library', [FOLD('Fonts', [FILE('SFPro.ttf', 'f-code', '4.2 MB', 'TrueType font', dt(3, 2))]), FOLD('Caches', []), FOLD('Preferences', [])]),
  FOLD('System', [FOLD('Library', []), FOLD('Volumes', [])]),
  FOLD('Users', [
    FOLD('prasenjit', [
      FOLD('Desktop', [
        FOLD('Projects', [
          FOLD('desktop-web', [
            FILE('index.html', 'f-code', '412 KB', 'HTML document', dt(7, 27, 16, 34)),
            FILE('README.md', 'f-txt', '3 KB', 'Markdown', dt(7, 27, 15, 10)),
            FILE('screenshot.png', 'f-img', '2.1 MB', 'PNG image', dt(7, 27, 16, 40)),
          ]),
          FOLD('cleantype', [FILE('main.swift', 'f-code', '18 KB', 'Swift source', dt(7, 19)), FILE('Package.swift', 'f-code', '2 KB', 'Swift source', dt(7, 19))]),
          FOLD('aurora-synth', [FILE('synth.ts', 'f-code', '44 KB', 'TypeScript', dt(7, 22)), FILE('index.html', 'f-code', '9 KB', 'HTML document', dt(7, 22))]),
          FILE('todo.md', 'f-txt', '1 KB', 'Markdown', dt(7, 26)),
        ]),
        FILE('prasenx.txt', 'f-txt', '1 KB', 'Plain text', dt(7, 27, 14, 2)),
        FILE('Screenshot 2026-07-27 at 4.34.11 PM.png', 'f-img', '3.8 MB', 'PNG image', dt(7, 27, 16, 34)),
        FILE('Interface Guidelines.pdf', 'f-pdf', '188 KB', 'PDF document', dt(7, 4)),
      ]),
      FOLD('Documents', [
        FOLD('Specs', [FILE('materials.pdf', 'f-pdf', '96 KB', 'PDF document', dt(7, 1)), FILE('motion-audit.pdf', 'f-pdf', '94 KB', 'PDF document', dt(7, 20))]),
        FOLD('Writing', [FILE('on-restraint.md', 'f-txt', '11 KB', 'Markdown', dt(7, 24)), FILE('shadow-notes.md', 'f-txt', '7 KB', 'Markdown', dt(7, 26))]),
        FILE('design-review.key', 'f-app', '24 MB', 'Keynote', dt(7, 23)),
        FILE('roadmap-2026.numbers', 'f-app', '1.8 MB', 'Numbers', dt(5, 9)),
      ]),
      FOLD('Downloads', [
        FILE('Xcode_26.xip', 'f-zip', '7.94 GB', 'Archive', dt(7, 15)),
        FILE('sf-symbols-7.dmg', 'f-app', '148 MB', 'Disk image', dt(7, 11)),
        FILE('wallpaper-tahoe-6k.heic', 'f-img', '32 MB', 'HEIC image', dt(7, 9)),
        FILE('render-final.mp4', 'f-movie', '412 MB', 'MPEG-4 movie', dt(7, 13)),
      ]),
      FOLD('Movies', [FILE('interaction-study.mp4', 'f-movie', '208 MB', 'MPEG-4 movie', dt(7, 13)), FILE('capture-timelapse.mov', 'f-movie', '1.2 GB', 'QuickTime movie', dt(7, 13))]),
      FOLD('Music', [FILE('aurora-synth-demo.wav', 'f-music', '58 MB', 'WAV audio', dt(7, 22)), FILE('lofi-loop.mp3', 'f-music', '6 MB', 'MP3 audio', dt(6, 30))]),
      FOLD('Pictures', [FILE('lake-braies.jpg', 'f-img', '5.2 MB', 'JPEG image', dt(6, 18)), FILE('dolomites-dawn.jpg', 'f-img', '4.4 MB', 'JPEG image', dt(6, 18)), FILE('night-sky.jpg', 'f-img', '3.1 MB', 'JPEG image', dt(5, 2))]),
      FOLD('Public', [FOLD('Drop Box', [])]),
    ]),
    FOLD('Shared', []),
  ]),
], 'f-hd');

const TRASH = FOLD('Trash', [FILE('old-draft.md', 'f-txt', '2 KB', 'Markdown', dt(7, 12))], 'app-trash');

/* Extension → icon / kind, for files created at runtime (terminal, New Folder). */
const EXT_MAP = {
  txt: ['f-txt', 'Plain text'], md: ['f-txt', 'Markdown'], rtf: ['f-txt', 'Rich text'],
  html: ['f-code', 'HTML document'], css: ['f-code', 'CSS'], js: ['f-code', 'JavaScript'],
  ts: ['f-code', 'TypeScript'], swift: ['f-code', 'Swift source'], json: ['f-code', 'JSON'],
  png: ['f-img', 'PNG image'], jpg: ['f-img', 'JPEG image'], jpeg: ['f-img', 'JPEG image'],
  gif: ['f-img', 'GIF image'], heic: ['f-img', 'HEIC image'], pdf: ['f-pdf', 'PDF document'],
  mp3: ['f-music', 'MP3 audio'], wav: ['f-music', 'WAV audio'], mov: ['f-movie', 'QuickTime movie'],
  mp4: ['f-movie', 'MPEG-4 movie'], zip: ['f-zip', 'ZIP archive'], app: ['f-app', 'Application'],
};
const extOf = n => (n.includes('.') ? n.split('.').pop() : '').toLowerCase();
const iconFor = n => (EXT_MAP[extOf(n)] || ['f-txt'])[0];
const kindFor = n => (EXT_MAP[extOf(n)] || [, 'Document'])[1];

function fsGet(path) {
  if (path[0] === 'Trash') return TRASH;
  let node = FS;
  for (let i = 1; i < path.length; i++) {
    if (!node.children) return null;
    const next = node.children.find(c => c.name === path[i]);
    if (!next) return null;
    node = next;
  }
  return node;
}
/* Friendly “Go”/sidebar shortcuts → absolute paths */
const PLACES = {
  'AirDrop': null, 'Recents': null,
  'Desktop': ['Macintosh HD', 'Users', 'prasenjit', 'Desktop'],
  'Documents': ['Macintosh HD', 'Users', 'prasenjit', 'Documents'],
  'Downloads': ['Macintosh HD', 'Users', 'prasenjit', 'Downloads'],
  'Movies': ['Macintosh HD', 'Users', 'prasenjit', 'Movies'],
  'Music': ['Macintosh HD', 'Users', 'prasenjit', 'Music'],
  'Pictures': ['Macintosh HD', 'Users', 'prasenjit', 'Pictures'],
  'Applications': ['Macintosh HD', 'Applications'],
  'prasenjit': ['Macintosh HD', 'Users', 'prasenjit'],
  'Macintosh HD': ['Macintosh HD'],
  'Trash': ['Trash'],
};
const RECENTS = () => [
  fsGet(['Macintosh HD', 'Users', 'prasenjit', 'Desktop', 'Projects', 'desktop-web', 'index.html']),
  fsGet(['Macintosh HD', 'Users', 'prasenjit', 'Desktop', 'prasenx.txt']),
  fsGet(['Macintosh HD', 'Users', 'prasenjit', 'Documents', 'Writing', 'on-restraint.md']),
  fsGet(['Macintosh HD', 'Users', 'prasenjit', 'Downloads', 'render-final.mp4']),
  fsGet(['Macintosh HD', 'Users', 'prasenjit', 'Desktop', 'Interface Guidelines.pdf']),
].filter(Boolean);

const fmtDate = d => d ? `${MONS3[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()} at ${time12(d).replace(NBSP, ' ')}` : '--';

/* ============================================================================
   11 · APP REGISTRY  (each app supplies mount/ready/menus)
   ========================================================================== */
const APPS = {};

/* ---------------------------------------------------------------- FINDER -- */
const SIDEBAR = [
  {
    head: 'Favourites', items: [
      ['AirDrop', 'g-airdrop'], ['Recents', 'g-clock-a'], ['Desktop', 'g-desktop'],
      ['Documents', 'g-docs'], ['Downloads', 'g-download'], ['Applications', 'g-apps'],
      ['prasenjit', 'g-folder-g'],
    ]
  },
  { head: 'iCloud', items: [['iCloud Drive', 'g-icloud-o']] },
  { head: 'Locations', items: [['Macintosh HD', 'g-hd'], ['Network', 'g-network']] },
  { head: 'Tags', items: [['Red', 'dot#ff5f57'], ['Orange', 'dot#ff9f0a'], ['Green', 'dot#30d158'], ['Blue', 'dot#0a84ff']] },
];

APPS.finder = {
  name: 'Finder', icon: 'app-finder', w: 940, h: 600, minW: 560, minH: 340, single: false,
  menus: () => APP_MENUS.finder,
  mount(w, opts) {
    const start = (opts.path || PLACES.prasenjit).slice();
    w.st = {
      path: start, view: 'icon', hist: [start.slice()], hi: 0,
      sidebar: true, pathbar: true, sel: null, q: '', colSel: [],
    };
    if (opts.path && opts.path.length === 1 && opts.path[0] === 'Trash') w.st.view = 'list';
    return `<div class="wb">
      <div class="sbar" data-drag data-fsb><div class="sb-top"><div data-tl></div></div>${SIDEBAR.map(g => `
        <div class="grp"><div class="gh">${g.head}</div>${g.items.map(([n, i]) => `
          <div class="si" data-place="${esc(n)}">${i.startsWith('dot#')
            ? `<span class="ico" style="width:11px;height:11px;margin:0 2px;border-radius:50%;background:${i.slice(3)}"></span>`
            : ic(i, 'ico')}<span class="nm">${esc(n)}</span></div>`).join('')}</div>`).join('')}
      </div>
      <div class="fx">
        <div class="fx-tb" data-drag>
          <button class="tbtn" data-nav="back" title="Back">${ic('g-chev-l')}</button>
          <button class="tbtn" data-nav="fwd" title="Forward">${ic('g-chev-r')}</button>
          <div class="fx-title" data-title></div>
          <div class="grow" style="flex:1"></div>
          <div class="seg" data-nodrag>
            <button data-view="icon" title="Icons">${ic('g-grid')}</button>
            <button data-view="list" title="List">${ic('g-list')}</button>
            <button data-view="column" title="Columns">${ic('g-columns')}</button>
            <button data-view="gallery" title="Gallery">${ic('g-gallery')}</button>
          </div>
          <button class="tbtn" data-sort title="Sort">${ic('g-sort')}</button>
          <button class="tbtn" data-share title="Share">${ic('g-share')}</button>
          <button class="tbtn" data-more title="More">${ic('g-ellipsis')}</button>
          <div class="sfield" data-nodrag style="width:150px"><span>${ic('g-search')}</span><input placeholder="Search" data-q></div>
        </div>
        <div class="fx-body scroll" data-body></div>
        <div class="fx-path" data-path></div>
      </div>
    </div>`;
  },
  ready(w) { Finder.wire(w); Finder.render(w); },
  onResize(w) { if (w.st.view === 'column') Finder.render(w); }
};

const Finder = {
  active() { const f = WM.front; return f && f.app === 'finder' ? f : WM.byApp('finder').filter(x => !x.min).pop(); },
  /* After anything mutates the FS, repaint every open Finder window. */
  reloadAll() { WM.byApp('finder').forEach(w => { if (!w.dead) this.render(w); }); },

  wire(w) {
    const n = w.node;
    on(n, 'click', '[data-place]', (e, t) => this.goto(t.dataset.place, w));
    on(n, 'click', '[data-view]', (e, t) => this.setView(t.dataset.view, w));
    on(n, 'click', '[data-nav="back"]', () => this.back(w));
    on(n, 'click', '[data-nav="fwd"]', () => this.fwd(w));
    on(n, 'click', '[data-sort]', (e, t) => {
      const r = t.getBoundingClientRect();
      Pop.open(Pop.menu([{ head: 'Sort By' },
        { id: 'n', label: 'Name', checked: w.st.sort !== 'date' && w.st.sort !== 'size', run: () => { w.st.sort = 'name'; this.render(w) } },
        { id: 'd', label: 'Date Modified', checked: w.st.sort === 'date', run: () => { w.st.sort = 'date'; this.render(w) } },
        { id: 's', label: 'Size', checked: w.st.sort === 'size', run: () => { w.st.sort = 'size'; this.render(w) } },
        { id: 'k', label: 'Kind', checked: w.st.sort === 'kind', run: () => { w.st.sort = 'kind'; this.render(w) } },
      ]), { x: r.left, y: r.bottom + 4, origin: 'top left' });
    });
    on(n, 'click', '[data-share]', () => Toast('Nothing to share — it is all local.'));
    on(n, 'click', '[data-more]', (e, t) => {
      const r = t.getBoundingClientRect();
      Pop.open(Pop.menu([
        { id: 'sb', label: w.st.sidebar ? 'Hide Sidebar' : 'Show Sidebar', key: '⌥⌘S', run: () => this.toggleSidebar(w) },
        { id: 'pb', label: w.st.pathbar ? 'Hide Path Bar' : 'Show Path Bar', key: '⌥⌘P', run: () => this.togglePathBar(w) },
        '-', { id: 'nf', label: 'New Folder', key: '⇧⌘N', run: () => this.newFolder(w) },
      ]), { x: r.right, y: r.bottom + 4, right: true, origin: 'top right' });
    });
    n.querySelector('[data-q]').addEventListener('input', e => { w.st.q = e.target.value; this.render(w); });

    on(n, 'dblclick', '.fitem,.fv-list .r', (e, t) => this.enter(w, t.dataset.name));
    on(n, 'click', '.fitem,.fv-list .r', (e, t) => { w.st.sel = t.dataset.name; this.markSel(w); });
    on(n, 'click', '.fv-col .ci', (e, t) => this.colClick(w, t));
    on(n, 'dblclick', '.fv-col .ci', (e, t) => { if (t.dataset.kind === 'file') this.enter(w, t.dataset.name); });
    on(n, 'click', '.fv-gal .strip .t', (e, t) => { w.st.sel = t.dataset.name; this.render(w); });
    on(n, 'click', '.fx-path .seg', (e, t) => { const i = +t.dataset.i; this.nav(w, w.st.path.slice(0, i + 1)); });
    on(n, 'contextmenu', '.fitem,.fv-list .r,.fv-col .ci', (e, t) => {
      w.st.sel = t.dataset.name; this.markSel(w);
      ctxMenu(e, [
        { id: 'o', label: 'Open', run: () => this.enter(w, t.dataset.name) },
        { id: 'w', label: 'Open With', key: '▸' }, '-',
        { id: 'i', label: 'Get Info', key: '⌘I', run: () => this.info(w, t.dataset.name) },
        { id: 'r', label: 'Rename' }, { id: 'd', label: 'Duplicate', key: '⌘D' }, '-',
        { id: 't', label: 'Move to Trash', key: '⌘⌫', run: () => this.trashSelected(w) }, '-',
        { id: 'q', label: 'Quick Look', key: '␣', run: () => this.info(w, t.dataset.name) },
      ]);
    });
    on(n, 'contextmenu', '[data-body]', e => {
      if (e.target.closest('.fitem,.r,.ci')) return;
      ctxMenu(e, [
        { id: 'nf', label: 'New Folder', run: () => this.newFolder(w) },
        { id: 'gi', label: 'Get Info' }, '-',
        { id: 'v', label: 'View', key: '▸' },
        { id: 's', label: 'Sort By', key: '▸' },
      ]);
    });
  },

  /* Stable per-name seed so a file's generated preview never changes. */
  seed(name) { let h = 0; for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 997; return h; },

  contents(w) {
    const p = w.st.path;
    if (p[0] === 'Recents') return RECENTS();
    if (p[0] === 'AirDrop') return [];
    if (p[0] === 'iCloud Drive') return [FOLD('Desktop', []), FOLD('Documents', []), FILE('Keynote.key', 'f-app', '18 MB', 'Keynote', dt(6, 2))];
    if (p[0] === 'Network') return [FOLD('prasen-nas', [], 'f-hd')];
    const node = fsGet(p);
    let list = node && node.children ? node.children.slice() : [];
    if (w.st.q) { const q = w.st.q.toLowerCase(); list = this.deepSearch(node, q).slice(0, 200); }
    const s = w.st.sort;
    list.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1;
      if (s === 'date') return (b.date || 0) - (a.date || 0);
      if (s === 'kind') return String(a.k).localeCompare(b.k);
      if (s === 'size') return String(b.size || '').localeCompare(a.size || '');
      return a.name.localeCompare(b.name, undefined, { numeric: true });
    });
    return list;
  },
  deepSearch(node, q, out = []) {
    if (!node || !node.children) return out;
    node.children.forEach(c => {
      if (c.name.toLowerCase().includes(q)) out.push(c);
      if (c.children) this.deepSearch(c, q, out);
    });
    return out;
  },

  title(w) {
    const p = w.st.path;
    return w.st.q ? `Searching “${w.st.q}”` : p[p.length - 1];
  },

  render(w) {
    const st = w.st, n = w.node;
    n.querySelector('[data-title]').textContent = this.title(w);
    n.querySelector('.sbar').style.display = st.sidebar ? '' : 'none';
    $$('[data-view]', n).forEach(b => b.classList.toggle('on', b.dataset.view === st.view));
    $$('[data-place]', n).forEach(b => b.classList.toggle('on', b.dataset.place === st.path[st.path.length - 1] || (PLACES[b.dataset.place] || []).join('/') === st.path.join('/')));
    n.querySelector('[data-nav="back"]').classList.toggle('dis', st.hi <= 0);
    n.querySelector('[data-nav="fwd"]').classList.toggle('dis', st.hi >= st.hist.length - 1);

    const body = n.querySelector('[data-body]');
    const items = this.contents(w);
    body.classList.toggle('scroll', st.view !== 'column');
    body.style.overflow = st.view === 'column' ? 'hidden' : '';

    if (st.view === 'icon') {
      body.innerHTML = `<div class="fv-icon">${items.map(f => `
        <div class="fitem${f.name === st.sel ? ' sel' : ''}" data-name="${esc(f.name)}">
          <div class="art">${f.icon === 'f-img'
        ? `<div class="shot">${photoArt(this.seed(f.name), [0, 1, 3][this.seed(f.name) % 3])}</div>`
        : ic(f.icon)}</div><div class="nm">${esc(f.name)}</div></div>`).join('')}</div>`
        + (items.length ? '' : `<div style="padding:40px;text-align:center;color:var(--txt-3);font-size:13px">${st.q ? 'No results' : st.path[0] === 'AirDrop' ? 'No one nearby' : 'Empty folder'}</div>`);
    } else if (st.view === 'list') {
      body.innerHTML = `<div class="fv-list">
        <div class="hd"><div class="c1" style="padding-left:26px">Name</div><div class="c2">Date Modified</div><div class="c3">Size</div><div class="c4">Kind</div></div>
        ${items.map(f => `<div class="r${f.name === st.sel ? ' sel' : ''}" data-name="${esc(f.name)}">
          <div class="c1"><span class="tw">${f.kind === 'folder' ? ic('g-chev-r') : ''}</span><span class="art">${f.icon === 'f-img'
        ? `<div class="shot">${photoArt(this.seed(f.name), [0, 1, 3][this.seed(f.name) % 3])}</div>`
        : ic(f.icon)}</span><span>${esc(f.name)}</span></div>
          <div class="c2">${f.date ? `${MONS3[f.date.getMonth()]} ${f.date.getDate()}, ${f.date.getFullYear()} at ${time12(f.date).replace(NBSP, ' ')}` : '--'}</div>
          <div class="c3">${f.kind === 'folder' ? '--' : esc(f.size || '--')}</div>
          <div class="c4">${esc(f.k || (f.kind === 'folder' ? 'Folder' : 'Document'))}</div></div>`).join('')}
      </div>`;
    } else if (st.view === 'column') {
      this.renderColumns(w, body);
    } else {
      const cur = items.find(f => f.name === st.sel) || items[0];
      /* Gallery view previews real content for images instead of a file icon. */
      const art = (f, big) => f.icon === 'f-img'
        ? `<div class="shot${big ? ' big' : ''}">${photoArt(this.seed(f.name), [0, 1, 3][this.seed(f.name) % 3])}</div>`
        : `<div class="art">${ic(f.icon)}</div>`;
      body.innerHTML = `<div class="fv-gal">
        <div class="stage">${cur ? art(cur, true) : '<span style="color:var(--txt-3)">Nothing to preview</span>'}</div>
        ${cur ? `<div class="cap"><b>${esc(cur.name)}</b><span>${esc(cur.k || (cur.kind === 'folder' ? 'Folder' : 'Document'))}${cur.size ? ' · ' + esc(cur.size) : ''}${cur.date ? ' · ' + fmtDate(cur.date) : ''}</span></div>` : ''}
        <div class="strip">${items.map(f => `<div class="t${f === cur ? ' sel' : ''}" data-name="${esc(f.name)}">${art(f)}</div>`).join('')}</div>
      </div>`;
    }

    this.paintPath(w);
  },

  paintPath(w) {
    const st = w.st, pb = w.node.querySelector('[data-path]');
    if (!pb) return;
    pb.style.display = st.pathbar ? '' : 'none';
    /* in column view the selection lives in colSel, so the bar has to walk that
       too or it skips every folder the user clicked into */
    const segs = st.view === 'column' ? st.path.concat(st.colSel) : st.path;
    const tail = st.view === 'column' ? null : st.sel;
    pb.innerHTML = segs.map((s, i) =>
      `${i ? ic('g-chev-r') : ''}<span class="seg" data-i="${i}">${ic(i === 0 ? 'g-hd' : 'g-folder-g')}${esc(s)}</span>`).join('')
      + (tail ? `${ic('g-chev-r')}<span class="seg">${esc(tail)}</span>` : '');
    pb.querySelectorAll('svg').forEach(s => { s.style.width = '11px'; s.style.height = '11px'; });
  },

  renderColumns(w, body) {
    const st = w.st;
    const chain = [];
    let node = st.path[0] === 'Trash' ? TRASH : fsGet(st.path);
    if (!node) node = FS;
    chain.push({ node, items: this.contents(w) });
    /* follow the selection chain of folders */
    let sel = st.colSel.slice();
    let cur = node;
    for (let i = 0; i < sel.length; i++) {
      const nx = (cur.children || []).find(c => c.name === sel[i]);
      if (!nx) { sel = sel.slice(0, i); break; }
      chain.push({ node: nx, items: nx.children ? nx.children.slice().sort((a, b) => a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'folder' ? -1 : 1) : null, file: nx.kind === 'file' });
      cur = nx;
      if (nx.kind === 'file') break;
    }
    st.colSel = sel;

    /* Only render the deepest columns that fit. macOS scrolls instead, but it
       always lands on a column boundary — dropping the ones that fall off the
       left gets the same look without a half-clipped first column. */
    const leafFile = chain.length && chain[chain.length - 1].file;
    const COL = 206.5, PREV = leafFile ? 250 : 0;
    const avail = (body.clientWidth || 620) - PREV;
    const cols = chain.filter(c => !c.file);
    const keep = Math.max(1, Math.floor(avail / COL));
    const from = Math.max(0, cols.length - keep);

    let html = '<div class="fv-col">';
    chain.forEach((c, ci) => {
      if (c.file || ci < from) return;
      const nextSel = sel[ci];
      html += `<div class="col" data-ci="${ci}">${(c.items || []).map(f => `
        <div class="ci${f.name === nextSel ? (ci === sel.length - 1 ? ' sel' : ' dim') : ''}" data-ci="${ci}" data-name="${esc(f.name)}" data-kind="${f.kind}">
          <span class="art">${ic(f.icon)}</span><span class="nm">${esc(f.name)}</span>${f.kind === 'folder' ? ic('g-chev-r', 'ch') : ''}</div>`).join('')
        || '<div style="padding:14px;color:var(--txt-3);font-size:12px;text-align:center">Empty</div>'}</div>`;
    });
    const leaf = chain[chain.length - 1];
    if (leaf && leaf.file) {
      const f = leaf.node;
      html += `<div class="fv-prev"><div class="big">${ic(f.icon)}</div><div class="nm">${esc(f.name)}</div>
        <dl><dt>Kind</dt><dd>${esc(f.k || 'Document')}</dd><dt>Size</dt><dd>${esc(f.size || '--')}</dd>
        <dt>Created</dt><dd>${fmtDate(f.date)}</dd><dt>Modified</dt><dd>${fmtDate(f.date)}</dd></dl>
        <button class="btn pri" data-openfile="${esc(f.name)}">Open</button></div>`;
    }
    body.innerHTML = html + '</div>';
    on(body, 'click', '[data-openfile]', (e, t) => this.enter(w, t.dataset.openfile));
  },

  colClick(w, t) {
    const ci = +t.dataset.ci;
    w.st.colSel = w.st.colSel.slice(0, ci);
    w.st.colSel[ci] = t.dataset.name;
    w.st.sel = t.dataset.name;
    this.render(w);
  },

  /* Repaint in place — a full render() here would swap the item nodes out from
     under the second click of a double-click, so folders would never open. */
  markSel(w) {
    $$('.fitem,.fv-list .r,.fv-gal .strip .t', w.node).forEach(n => n.classList.toggle('sel', n.dataset.name === w.st.sel));
    this.paintPath(w);
  },

  nav(w, path) {
    w = w || this.active(); if (!w) return;
    w.st.q = ''; const qi = w.node.querySelector('[data-q]'); if (qi) qi.value = '';
    w.st.path = path; w.st.sel = null; w.st.colSel = [];
    w.st.hist = w.st.hist.slice(0, w.st.hi + 1);
    w.st.hist.push(path.slice()); w.st.hi = w.st.hist.length - 1;
    this.render(w);
  },
  back(w) { w = w || this.active(); if (w && w.st.hi > 0) { w.st.hi--; w.st.path = w.st.hist[w.st.hi].slice(); w.st.sel = null; w.st.colSel = []; this.render(w); } },
  fwd(w) { w = w || this.active(); if (w && w.st.hi < w.st.hist.length - 1) { w.st.hi++; w.st.path = w.st.hist[w.st.hi].slice(); w.st.sel = null; w.st.colSel = []; this.render(w); } },

  goto(place, w) {
    w = w || this.active(); if (!w) return WM.open('finder', { path: PLACES[place] || PLACES.prasenjit });
    if (place === 'iCloud Drive') return this.nav(w, ['iCloud Drive']);
    if (place === 'AirDrop') return this.nav(w, ['AirDrop']);
    if (place === 'Recents') return this.nav(w, ['Recents']);
    if (place === 'Network') return this.nav(w, ['Network']);
    if (place.startsWith('Red') || place.startsWith('Orange') || place.startsWith('Green') || place.startsWith('Blue')) return Toast('No files tagged ' + place);
    this.nav(w, (PLACES[place] || PLACES.prasenjit).slice());
  },

  enter(w, name) {
    const items = this.contents(w);
    const f = items.find(x => x.name === name); if (!f) return;
    if (f.kind === 'folder') {
      /* search results / recents live outside the current path — resolve absolute */
      const abs = this.findPath(FS, f) || w.st.path.concat(name);
      this.nav(w, abs);
    } else this.openFile(f);
  },
  findPath(root, target, path = ['Macintosh HD']) {
    if (root === target) return path;
    for (const c of root.children || []) {
      const r = this.findPath(c, target, path.concat(c.name));
      if (r) return r;
    }
    return null;
  },
  openFile(f) {
    const n = f.name.toLowerCase();
    if (/\.app$/.test(n)) {
      const id = Object.keys(APPS).find(k => APPS[k].name.toLowerCase() === f.name.replace(/\.app$/i, '').toLowerCase());
      return id ? WM.open(id) : Toast(f.name + ' cannot open on this Mac.');
    }
    if (/\.(txt|md|swift|ts|html|json)$/.test(n)) return WM.open('textedit', { file: f.name, node: f });
    if (/\.(png|jpe?g|heic|pdf|key|numbers)$/.test(n)) return WM.open('preview', { file: f.name, node: f });
    if (/\.(mp3|wav)$/.test(n)) return WM.open('music');
    if (/\.(mp4|mov)$/.test(n)) return WM.open('preview', { file: f.name, node: f });
    Toast('No application can open “' + f.name + '”');
  },
  openSelected() { const w = this.active(); if (w && w.st.sel) this.enter(w, w.st.sel); },
  info(w, name) {
    const f = this.contents(w).find(x => x.name === name); if (!f) return;
    Toast(`${f.name} — ${f.k || 'Folder'}${f.size ? ', ' + f.size : ''}`);
  },
  setView(v, w) { w = w || this.active(); if (!w) return; w.st.view = v; this.render(w); },
  toggleSidebar(w) { w = w || this.active(); if (!w) return; w.st.sidebar = !w.st.sidebar; this.render(w); },
  togglePathBar(w) { w = w || this.active(); if (!w) return; w.st.pathbar = !w.st.pathbar; this.render(w); },
  newFolder(w) {
    w = w || this.active(); if (!w) return Desktop.newFolder();
    const node = fsGet(w.st.path);
    if (!node || !node.children) return;
    let name = 'untitled folder', i = 2;
    while (node.children.some(c => c.name === name)) name = 'untitled folder ' + i++;
    node.children.push(FOLD(name, []));
    w.st.sel = name; this.render(w);
  },
  trashSelected(w) {
    w = w || this.active(); if (!w || !w.st.sel) return;
    const node = fsGet(w.st.path);
    if (node && node.children) {
      const i = node.children.findIndex(c => c.name === w.st.sel);
      if (i >= 0) { TRASH.children.push(node.children[i]); node.children.splice(i, 1); Dock.setTrashFull(true); }
    }
    w.st.sel = null; this.render(w);
  }
};

/* ============================================================================
   12 · TERMINAL  —  a small but genuinely working shell
   ========================================================================== */
const HOME = ['Macintosh HD', 'Users', 'prasenjit'];
const shortPath = p => {
  if (p.join('/') === HOME.join('/')) return '~';
  if (p.slice(0, 3).join('/') === HOME.join('/')) return '~/' + p.slice(3).join('/');
  return '/' + p.slice(1).join('/');
};

APPS.terminal = {
  name: 'Terminal', icon: 'app-terminal', w: 760, h: 470, minW: 420, minH: 220, single: false,
  menus: () => stdMenus('terminal', {
    Shell: [
      { id: 'nt', label: 'New Tab', key: '⌘T', run: () => Term.newTab() },
      { id: 'nw', label: 'New Window', key: '⌘N', run: () => WM.open('terminal', { force: true }) }, '-',
      { id: 'cl', label: 'Clear Scrollback', key: '⌘K', run: () => Term.run('clear') },
    ],
    Edit: [{ id: 'c', label: 'Copy', key: '⌘C' }, { id: 'v', label: 'Paste', key: '⌘V' }, '-',
    { id: 'f', label: 'Find…', key: '⌘F', disabled: true }],
  }, ['Shell', 'Edit', 'View', 'Window', 'Help']),
  mount(w) {
    w.tabs = [Term.blankTab()]; w.tab = 0;
    return titlebar('prasenjit — -zsh', { dark: true, plain: false }) + `
      <div class="term">
        <div class="tm-tabs" data-tabs></div>
        <div class="tm-body" data-body tabindex="-1"></div>
      </div>
      <input data-ghost style="position:absolute;left:-9999px;width:1px;height:1px;opacity:0" autocomplete="off" spellcheck="false">`;
  },
  ready(w) { Term.wire(w); Term.render(w); }
};

const Term = {
  active() { const f = WM.front; return f && f.app === 'terminal' ? f : WM.byApp('terminal').filter(x => !x.min).pop(); },
  blankTab() {
    return {
      cwd: HOME.slice(), lines: [
        { html: `<span class="tdim">Last login: ${DAYS3[new Date().getDay()]} ${MONS3[new Date().getMonth()]} ${new Date().getDate()} ${time12(new Date()).replace(NBSP, ' ')} on ttys001</span>` }
      ], hist: [], hi: -1, buf: ''
    };
  },

  wire(w) {
    const body = w.node.querySelector('[data-body]');
    const ghost = w.node.querySelector('[data-ghost]');
    w.ghost = ghost;

    const focus = () => { ghost.focus({ preventScroll: true }); body.classList.remove('blur'); };
    body.addEventListener('mousedown', e => { if (!getSelection().toString()) setTimeout(focus, 0); });
    w.node.addEventListener('pointerdown', () => { if (WM.front === w) setTimeout(() => { if (!getSelection().toString()) focus(); }, 0); });
    ghost.addEventListener('blur', () => body.classList.add('blur'));

    ghost.addEventListener('input', () => { this.tab(w).buf = ghost.value; this.paintInput(w); });
    ghost.addEventListener('keydown', e => this.key(w, e));
    ghost.addEventListener('click', () => this.paintInput(w));

    on(w.node, 'click', '[data-newtab]', () => this.newTab(w));
    on(w.node, 'click', '.tm-tab', (e, t) => { if (e.target.closest('.x')) return; w.tab = +t.dataset.i; this.render(w); });
    on(w.node, 'click', '.tm-tab .x', (e, t) => { e.stopPropagation(); this.closeTab(w, +t.closest('.tm-tab').dataset.i); });
    setTimeout(focus, 60);
  },

  tab(w) { return w.tabs[w.tab]; },

  newTab(w) {
    w = w || this.active(); if (!w) return WM.open('terminal');
    w.tabs.push(this.blankTab()); w.tab = w.tabs.length - 1;
    this.render(w); w.ghost.focus();
  },
  closeTab(w, i) {
    if (w.tabs.length === 1) return WM.close(w.id);
    w.tabs.splice(i, 1); w.tab = clamp(w.tab, 0, w.tabs.length - 1); this.render(w);
  },

  /* One wrapper span, because the live input line is a flex row and flex throws
     away whitespace-only text nodes between items — which ate the gaps in
     "user@host ~ %" on the prompt you actually type at. */
  promptHTML(t) {
    return `<span class="tp"><span class="tg">${SYS.user.toLowerCase()}@${SYS.host}</span> ` +
      `<span class="tb2">${esc(shortPath(t.cwd))}</span> <span class="tw2">%</span> </span>`;
  },

  render(w) {
    const t = this.tab(w);
    w.node.querySelector('[data-tabs]').innerHTML =
      w.tabs.map((tb, i) => `<div class="tm-tab${i === w.tab ? ' on' : ''}" data-i="${i}">
        <span>${esc(shortPath(tb.cwd))} — -zsh</span><span class="x">${ic('g-x')}</span></div>`).join('') +
      `<div class="tm-tab" data-newtab style="padding:0 9px">${ic('g-plus')}</div>`;
    w.node.querySelector('.tm-tab[data-newtab] svg').style.cssText = 'width:10px;height:10px';
    const body = w.node.querySelector('[data-body]');
    body.innerHTML = t.lines.map(l => `<div class="tm-line">${l.html}</div>`).join('') +
      `<div class="tm-line tm-in" data-in>${this.promptHTML(t)}<span class="ed" data-ed></span></div>`;
    if (w.ghost) w.ghost.value = t.buf;
    this.paintInput(w);
    const tt = w.node.querySelector('.tb .title'); if (tt) tt.textContent = `${shortPath(t.cwd)} — -zsh — 80×24`;
  },

  paintInput(w) {
    const t = this.tab(w), ghost = w.ghost;
    const ed = w.node.querySelector('[data-ed]'); if (!ed) return;
    const v = t.buf, cp = ghost ? (ghost.selectionStart ?? v.length) : v.length;
    ed.innerHTML = `${esc(v.slice(0, cp))}<span class="tm-cur"></span>${esc(v.slice(cp))}`;
    const body = w.node.querySelector('[data-body]');
    body.scrollTop = body.scrollHeight;
  },

  key(w, e) {
    const t = this.tab(w);
    if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); this.exec(w, 'clear', true); return; }
    if ((e.metaKey || e.ctrlKey) && (e.key === 't' || e.key === 'T')) { e.preventDefault(); this.newTab(w); return; }
    if (e.ctrlKey && (e.key === 'c' || e.key === 'C')) {
      e.preventDefault();
      t.lines.push({ html: this.promptHTML(t) + esc(t.buf) + '<span class="tr">^C</span>' });
      t.buf = ''; w.ghost.value = ''; this.render(w); return;
    }
    if (e.ctrlKey && (e.key === 'l' || e.key === 'L')) { e.preventDefault(); this.exec(w, 'clear', true); return; }
    if (e.key === 'Enter') {
      e.preventDefault();
      const cmd = t.buf;
      t.lines.push({ html: this.promptHTML(t) + esc(cmd) });
      if (cmd.trim()) { t.hist.push(cmd); }
      t.hi = t.hist.length;
      t.buf = ''; w.ghost.value = '';
      this.exec(w, cmd);
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!t.hist.length) return;
      t.hi = clamp(t.hi - 1, 0, t.hist.length - 1);
      t.buf = t.hist[t.hi]; w.ghost.value = t.buf;
      setTimeout(() => { w.ghost.setSelectionRange(t.buf.length, t.buf.length); this.paintInput(w) }, 0);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!t.hist.length) return;
      t.hi = clamp(t.hi + 1, 0, t.hist.length);
      t.buf = t.hi >= t.hist.length ? '' : t.hist[t.hi];
      w.ghost.value = t.buf;
      setTimeout(() => { w.ghost.setSelectionRange(t.buf.length, t.buf.length); this.paintInput(w) }, 0);
      return;
    }
    if (e.key === 'Tab') { e.preventDefault(); this.complete(w); return; }
    setTimeout(() => this.paintInput(w), 0);
  },

  complete(w) {
    const t = this.tab(w), v = t.buf;
    const parts = v.split(/\s+/);
    const frag = parts[parts.length - 1] || '';
    let pool;
    if (parts.length <= 1) pool = Object.keys(CMDS).concat(['clear', 'help']);
    else {
      const node = fsGet(t.cwd);
      pool = (node && node.children ? node.children : []).map(c => c.name + (c.kind === 'folder' ? '/' : ''));
    }
    const hits = pool.filter(p => p.toLowerCase().startsWith(frag.toLowerCase()));
    if (!hits.length) return;
    if (hits.length === 1) {
      parts[parts.length - 1] = hits[0];
      t.buf = parts.join(' ') + (hits[0].endsWith('/') ? '' : ' ');
    } else {
      /* longest common prefix, then list the options like zsh does */
      let lcp = hits[0];
      hits.forEach(h => { while (!h.toLowerCase().startsWith(lcp.toLowerCase())) lcp = lcp.slice(0, -1); });
      parts[parts.length - 1] = lcp;
      t.buf = parts.join(' ');
      t.lines.push({ html: this.promptHTML(t) + esc(v) });
      t.lines.push({ html: hits.map(h => `<span class="${h.endsWith('/') ? 'tb2' : 'tw2'}">${esc(h.replace(/\/$/, ''))}</span>`).join('   ') });
    }
    w.ghost.value = t.buf;
    this.render(w);
    setTimeout(() => w.ghost.setSelectionRange(t.buf.length, t.buf.length), 0);
  },

  out(w, html) { this.tab(w).lines.push({ html }); },
  exec(w, raw, silent) {
    const t = this.tab(w);
    const line = raw.trim();
    if (!line) { this.render(w); return; }
    const [cmd, ...args] = line.split(/\s+/);
    const fn = CMDS[cmd];
    if (fn) {
      try { fn({ w, t, args, raw: line, out: h => this.out(w, h), term: this }); }
      catch (err) { this.out(w, `<span class="tr">${esc(cmd)}: ${esc(err.message)}</span>`); }
    } else {
      this.out(w, `<span class="tr">zsh: command not found: ${esc(cmd)}</span>`);
    }
    this.render(w);
    if (silent) w.ghost.focus();
  },
  run(cmd) { const w = this.active(); if (w) { this.tab(w).buf = ''; this.exec(w, cmd, true); } }
};

/* ---- the command table --------------------------------------------------- */
const CMDS = {
  help({ out }) {
    out(`<span class="ty">Available commands</span>`);
    const rows = [
      ['ls [-la] [dir]', 'list directory contents'],
      ['cd [dir]', 'change directory (.., ~, -, absolute)'],
      ['pwd', 'print working directory'],
      ['cat <file>', 'print a file'],
      ['open <file|.>', 'open in the matching app'],
      ['tree', 'recursive listing'],
      ['echo <text>', 'write text to stdout'],
      ['whoami / hostname / uname', 'identity'],
      ['date / uptime', 'time'],
      ['neofetch', 'system information'],
      ['mkdir / touch / rm', 'write to the virtual filesystem'],
      ['which <cmd>', 'locate a command'],
      ['history', 'command history'],
      ['df / top / ps', 'fake-but-plausible system stats'],
      ['theme [light|dark]', 'switch the appearance'],
      ['say <text>', 'notification banner'],
      ['clear', 'clear the screen (⌘K)'],
      ['exit', 'close the tab'],
    ];
    rows.forEach(([c, d]) => out(`  <span class="tg">${esc(c.padEnd(26))}</span><span class="tdim">${esc(d)}</span>`));
  },
  ls({ t, args, out }) {
    const flags = args.filter(a => a.startsWith('-')).join('');
    const rest = args.filter(a => !a.startsWith('-'));
    const target = rest.length ? resolve(t.cwd, rest[0]) : t.cwd;
    const node = fsGet(target);
    if (!node) return out(`<span class="tr">ls: ${esc(rest[0])}: No such file or directory</span>`);
    if (node.kind === 'file') return out(esc(node.name));
    const kids = node.children.slice().sort((a, b) => a.name.localeCompare(b.name));
    const all = flags.includes('a') ? [{ name: '.', kind: 'folder' }, { name: '..', kind: 'folder' }, { name: '.zshrc', kind: 'file', size: '1.2K', k: 'cfg' }, { name: '.gitconfig', kind: 'file', size: '312B' }].concat(kids) : kids;
    if (!all.length) return;
    if (flags.includes('l')) {
      out(`<span class="tdim">total ${all.length * 8}</span>`);
      all.forEach(f => {
        const dir = f.kind === 'folder';
        const perm = dir ? 'drwxr-xr-x' : '-rw-r--r--';
        const d = f.date || dt(7, 20);
        out(`<span class="tdim">${perm}</span>  <span class="tdim">${dir ? '12' : ' 1'} ${SYS.user.toLowerCase()} staff</span>  ` +
          `<span class="ty">${String(f.size || '4.0K').padStart(8)}</span>  <span class="tdim">${MONS3[d.getMonth()]} ${String(d.getDate()).padStart(2)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}</span>  ${colorName(f)}`);
      });
    } else {
      const cols = 4, rows = Math.ceil(all.length / cols);
      const wCol = Math.max(...all.map(f => f.name.length)) + 3;
      for (let r = 0; r < rows; r++) {
        let s = '';
        for (let c = 0; c < cols; c++) {
          const f = all[c * rows + r]; if (!f) continue;
          s += colorName(f, wCol);
        }
        out(s);
      }
    }
  },
  cd({ t, args, out }) {
    const a = args[0] || '~';
    if (a === '-') { const p = t.prev || HOME; t.prev = t.cwd; t.cwd = p; return; }
    const target = resolve(t.cwd, a);
    const node = fsGet(target);
    if (!node) return out(`<span class="tr">cd: no such file or directory: ${esc(a)}</span>`);
    if (node.kind !== 'folder') return out(`<span class="tr">cd: not a directory: ${esc(a)}</span>`);
    t.prev = t.cwd; t.cwd = target;
  },
  pwd({ t, out }) { out(esc('/' + t.cwd.slice(1).join('/')).replace('Macintosh HD', '')); },
  cat({ t, args, out }) {
    if (!args[0]) return out(`<span class="tr">usage: cat &lt;file&gt;</span>`);
    const node = fsGet(resolve(t.cwd, args[0]));
    if (!node) return out(`<span class="tr">cat: ${esc(args[0])}: No such file or directory</span>`);
    if (node.kind === 'folder') return out(`<span class="tr">cat: ${esc(args[0])}: Is a directory</span>`);
    const body = FILE_TEXT[node.name];
    if (!body) return out(`<span class="tdim">${esc(node.name)}: binary file (${esc(node.size || '?')})</span>`);
    body.split('\n').forEach(l => out(esc(l) || '&nbsp;'));
  },
  open({ t, args, out }) {
    const a = args[0] || '.';
    if (a === '.') { WM.open('finder', { path: t.cwd.slice() }); return out(`<span class="tdim">opening Finder at ${esc(shortPath(t.cwd))}</span>`); }
    const node = fsGet(resolve(t.cwd, a));
    if (!node) return out(`<span class="tr">Unable to find ${esc(a)}</span>`);
    if (node.kind === 'folder') WM.open('finder', { path: resolve(t.cwd, a) });
    else Finder.openFile(node);
  },
  tree({ t, out }) {
    const node = fsGet(t.cwd);
    out(`<span class="tb2">.</span>`);
    let dirs = 0, files = 0;
    (function walk(n, pre) {
      const kids = (n.children || []);
      kids.forEach((c, i) => {
        const last = i === kids.length - 1;
        out(`<span class="tdim">${pre}${last ? '└── ' : '├── '}</span>${colorName(c)}`);
        if (c.kind === 'folder') { dirs++; if (pre.length < 12) walk(c, pre + (last ? '    ' : '│   ')); }
        else files++;
      });
    })(node, '');
    out('');
    out(`<span class="tdim">${dirs} directories, ${files} files</span>`);
  },
  echo({ raw, out }) { out(esc(raw.slice(4).trim().replace(/^["']|["']$/g, ''))); },
  whoami({ out }) { out(SYS.user.toLowerCase()); },
  hostname({ out }) { out(SYS.host + '.local'); },
  uname({ args, out }) {
    out(args.includes('-a')
      ? `Darwin ${SYS.host}.local 25.0.0 Darwin Kernel Version 25.0.0: Tue Jun 16 21:04:12 PDT 2026; root:xnu-12377.41.5~19/RELEASE_ARM64_T6041 arm64`
      : 'Darwin');
  },
  date({ out }) {
    const d = new Date();
    out(`${DAYS3[d.getDay()]} ${MONS3[d.getMonth()]} ${String(d.getDate()).padStart(2)} ${d.toTimeString().slice(0, 8)} IST ${d.getFullYear()}`);
  },
  uptime({ out }) { out(`${new Date().toTimeString().slice(0, 5)}  up ${upStr()}, 3 users, load averages: 1.82 2.04 1.96`); },
  history({ t, out }) { t.hist.forEach((h, i) => out(`<span class="tdim">${String(i + 1).padStart(5)}</span>  ${esc(h)}`)); },
  clear({ t }) { t.lines = []; },
  exit({ w, term }) { term.closeTab(w, w.tab); },
  df({ out }) {
    out(`<span class="ty">Filesystem      Size   Used  Avail Capacity  Mounted on</span>`);
    out(`/dev/disk3s1s1  1.8Ti  842Gi  921Gi    48%    /`);
    out(`/dev/disk3s6    1.8Ti  4.0Gi  921Gi     1%    /System/Volumes/VM`);
  },
  ps({ out }) {
    out(`<span class="ty">  PID TTY           TIME CMD</span>`);
    [['501', 'ttys000', '0:00.42', '-zsh'], ['842', '??', '2:14.08', '/System/Applications/Safari.app'], ['913', '??', '0:48.21', 'WindowServer'], ['1204', 'ttys001', '0:00.09', 'ps']]
      .forEach(([p, tt, tm, c]) => out(`${p.padStart(5)} ${tt.padEnd(9)} ${tm.padStart(8)} ${esc(c)}`));
  },
  top({ out }) {
    out(`<span class="ty">Processes: 512 total, 3 running, 509 sleeping, 2841 threads</span>`);
    out(`Load Avg: 1.82, 2.04, 1.96   CPU usage: 6.41% user, 3.12% sys, 90.47% idle`);
    out(`PhysMem: 34G used (2.1G wired), 94G unused.`);
    out(`<span class="tdim">(this is a snapshot — press ⌘K to clear)</span>`);
  },
  theme({ args, out }) {
    const m = (args[0] || '').toLowerCase();
    if (m === 'light' || m === 'dark') { Theme.set(m); out(`<span class="tg">appearance → ${m}</span>`); }
    else { Theme.toggle(); out(`<span class="tg">appearance → ${SYS.theme}</span>`); }
  },
  say({ raw, out }) { const m = raw.slice(3).trim(); Toast(m || 'Hello.'); out(`<span class="tdim">🔊 ${esc(m)}</span>`); },
  sudo({ out }) { out(`<span class="tr">${SYS.user.toLowerCase()} is not in the sudoers file. This incident has been reported.</span>`); },
  git({ args, out }) {
    if (args[0] === 'status') {
      out('On branch <span class="tg">main</span>');
      out("Your branch is up to date with 'origin/main'.");
      out(''); out('nothing to commit, working tree clean');
    } else if (args[0] === 'log') {
      [['a1f9c2e', 'ship the dock magnification curve'], ['7de4b01', 'genie minimize'], ['3c0aa88', 'squircle every icon']]
        .forEach(([h, m]) => { out(`<span class="ty">commit ${h}</span>`); out(`Author: ${SYS.user} <${SYS.user.toLowerCase()}@macbook.local>`); out(''); out('    ' + esc(m)); out(''); });
    } else out(`<span class="tdim">usage: git &lt;status|log&gt;</span>`);
  },
  curl({ args, out }) { out(`<span class="tdim">curl: (6) Could not resolve host: ${esc((args[0] || '').replace(/^https?:\/\//, '').split('/')[0] || 'localhost')}</span>`); },
  man({ args, out }) { out(`<span class="tdim">No manual entry for ${esc(args[0] || 'man')} — try <span class="tg">help</span>.</span>`); },
  /* mkdir / touch / rm write to the same virtual FS Finder reads from, so
     anything you create here shows up in an open Finder window. */
  mkdir({ t, args, out }) {
    const names = args.filter(a => !a.startsWith('-'));
    if (!names.length) return out(`<span class="tr">usage: mkdir &lt;name&gt;</span>`);
    const dir = fsGet(t.cwd);
    if (!dir || !dir.children) return out(`<span class="tr">mkdir: ${esc(t.cwd[t.cwd.length - 1])}: Not a directory</span>`);
    names.forEach(n => {
      if (dir.children.some(c => c.name === n)) return out(`<span class="tr">mkdir: ${esc(n)}: File exists</span>`);
      dir.children.push(FOLD(n, []));
    });
    Finder.reloadAll();
  },
  touch({ t, args, out }) {
    const names = args.filter(a => !a.startsWith('-'));
    if (!names.length) return out(`<span class="tr">usage: touch &lt;file&gt;</span>`);
    const dir = fsGet(t.cwd);
    if (!dir || !dir.children) return out(`<span class="tr">touch: ${esc(t.cwd[t.cwd.length - 1])}: Not a directory</span>`);
    names.forEach(n => {
      const hit = dir.children.find(c => c.name === n);
      if (hit) { hit.date = new Date(); return; }
      dir.children.push(FILE(n, iconFor(n), '0B', kindFor(n), new Date()));
    });
    Finder.reloadAll();
  },
  rm({ t, args, out }) {
    const names = args.filter(a => !a.startsWith('-'));
    const rec = args.some(a => a.startsWith('-') && a.includes('r'));
    if (names.some(n => n === '/' || n === '~' || n === '*')) {
      return out(`<span class="tr">rm: I am not doing that. Nice try.</span>`);
    }
    if (!names.length) return out(`<span class="tr">usage: rm [-rf] &lt;file&gt;</span>`);
    const dir = fsGet(t.cwd);
    names.forEach(n => {
      const i = (dir.children || []).findIndex(c => c.name === n);
      if (i < 0) return out(`<span class="tr">rm: ${esc(n)}: No such file or directory</span>`);
      if (dir.children[i].kind === 'folder' && !rec) return out(`<span class="tr">rm: ${esc(n)}: is a directory</span>`);
      TRASH.children.push(dir.children.splice(i, 1)[0]);
    });
    Finder.reloadAll();
  },
  which({ args, out }) {
    const c = args[0] || '';
    out(CMDS[c] ? `/usr/bin/${esc(c)}` : `<span class="tdim">${esc(c)} not found</span>`);
  },
  brew({ args, out }) {
    if (args[0] === 'install') return out(`<span class="tdim">==> Downloading… this Mac ships with everything already.</span>`);
    out(`<span class="tdim">Homebrew 4.6.2 — nothing left to install.</span>`);
  },
  vim({ out }) { out(`<span class="tdim">vim: this terminal has no modal editor. Use <span class="tg">open</span> and TextEdit.</span>`); },
  python({ out }) { out(`<span class="tdim">python: no interpreter here — the whole machine is one HTML file.</span>`); },
  neofetch({ out }) {
    const art = [
      ['                    \'c.', 0], ['                 ,xNMM.', 0], ['               .OMMMMo', 0], ['               OMMM0,', 0],
      ['     .;loddo:\' loolloddol;.', 0], ['   cKMMMMMMMMMMNWMMMMMMMMMM0:', 1], [' .KMMMMMMMMMMMMMMMMMMMMMMMWd.', 1],
      [' XMMMMMMMMMMMMMMMMMMMMMMMX.', 1], [';MMMMMMMMMMMMMMMMMMMMMMMM:', 2], [':MMMMMMMMMMMMMMMMMMMMMMMM:', 2],
      ['.MMMMMMMMMMMMMMMMMMMMMMMMX.', 3], [' kMMMMMMMMMMMMMMMMMMMMMMMMWd.', 3], [' .XMMMMMMMMMMMMMMMMMMMMMMMMMMk', 4],
      ['  .XMMMMMMMMMMMMMMMMMMMMMMMMK.', 4], ['    kMMMMMMMMMMMMMMMMMMMMMMd', 5], ['     ;KMMMMMMMWXXWMMMMMMMk.', 5],
      ['       .cooc,.    .,coo:.', 5],
    ];
    const cls = ['tg', 'ty', 'to', 'tr', 'tm2', 'tb2'];   // the six-stripe Apple
    const info = [
      [`${SYS.user.toLowerCase()}@${SYS.host}`, null],
      ['-'.repeat(SYS.user.length + SYS.host.length + 1), null],
      ['OS', 'macOS Tahoe 26.0 26A5240b arm64'],
      ['Host', 'MacBook Pro (16-inch, 2026)'],
      ['Kernel', '25.0.0'],
      ['Uptime', upStr()],
      ['Packages', '148 (brew), 62 (brew-cask)'],
      ['Shell', 'zsh 5.9'],
      ['Resolution', `${innerWidth * 2}x${innerHeight * 2}@120Hz`],
      ['DE', 'Aqua'],
      ['WM', 'Quartz Compositor'],
      ['WM Theme', SYS.theme === 'dark' ? 'Dark (Multicolour)' : 'Light (Multicolour)'],
      ['Terminal', 'prasen-term'],
      ['CPU', 'Apple M4 Max'],
      ['GPU', 'Apple M4 Max (40 cores)'],
      ['Memory', '34218MiB / 131072MiB'],
      ['Disk (/)', '842G / 1.8T (48%)'],
      ['Battery', `${SYS.battery}% ${SYS.charging ? '[charging]' : '[discharging]'}`],
    ];
    const blocks = ['#1b1b1d', '#ff6b6b', '#4fe07f', '#ffd866', '#5fb2ff', '#d68cff', '#5fe1e6', '#e6e6e6'];
    const rows = Math.max(art.length, info.length + 3);
    let html = '<div style="display:flex;gap:18px;padding:4px 0">';
    html += '<div>' + art.map(([l, c]) => `<div class="tm-line ${cls[c]}">${esc(l)}</div>`).join('') + '</div>';
    html += '<div style="padding-top:2px">' + info.map(([k, v]) =>
      `<div class="tm-line">${v === null ? `<span class="tg">${esc(k)}</span>` : `<span class="tg">${esc(k)}</span><span class="tw2">: ${esc(v)}</span>`}</div>`).join('')
      + `<div style="display:flex;margin-top:9px">${blocks.map(b => `<span style="width:16px;height:15px;background:${b}"></span>`).join('')}</div>`
      + `<div style="display:flex">${blocks.map(b => `<span style="width:16px;height:15px;background:${b};filter:brightness(1.5)"></span>`).join('')}</div>`
      + '</div></div>';
    out(html);
  },
};
CMDS['ls-la'] = CMDS.ls;
CMDS.ll = ({ t, out, term, w }) => CMDS.ls({ t, args: ['-l'], out, term, w });
CMDS['..'] = ({ t, out, w, term }) => CMDS.cd({ t, args: ['..'], out, w, term });

function colorName(f, pad) {
  const cls = f.kind === 'folder' ? 'tb2' : /\.app$/.test(f.name) ? 'tg'
    : /\.(png|jpe?g|heic|mp4|mov|wav|mp3)$/i.test(f.name) ? 'tm2'
      : /\.(zip|xip|dmg|gz)$/i.test(f.name) ? 'tr' : 'tw2';
  const bold = f.kind === 'folder' ? 'font-weight:700' : '';
  const txt = pad ? f.name.padEnd(pad) : f.name;
  return `<span class="${cls}" style="${bold}">${esc(txt)}</span>`;
}
function resolve(cwd, arg) {
  if (!arg || arg === '~') return HOME.slice();
  let parts;
  if (arg.startsWith('~/')) parts = HOME.concat(arg.slice(2).split('/'));
  else if (arg.startsWith('/')) parts = ['Macintosh HD'].concat(arg.split('/').filter(Boolean));
  else parts = cwd.concat(arg.split('/'));
  const out = [];
  parts.filter(Boolean).forEach(p => { if (p === '.') return; if (p === '..') { if (out.length > 1) out.pop(); } else out.push(p); });
  return out.length ? out : ['Macintosh HD'];
}
const upStr = () => {
  const ms = Date.now() - new Date(2026, 6, 24, 9, 12).getTime();
  const d = Math.floor(ms / 864e5), h = Math.floor(ms / 36e5) % 24, m = Math.floor(ms / 6e4) % 60;
  return `${d} day${d === 1 ? '' : 's'}, ${h} hour${h === 1 ? '' : 's'}, ${m} min${m === 1 ? '' : 's'}`;
};

const FILE_TEXT = {
  'prasenx.txt': `Where to find me
================

About me     https://prasen.dev
GitHub       https://github.com/StarKnightt
X            https://x.com/prasenx
YouTube      https://youtube.com/@prasendev
Instagram    https://www.instagram.com/prasenn_x/
Discord      https://discord.com/users/878205528570990602

Every link above opens in your real browser.`,
  'todo.md': `# todo

- [x] squircle clip path from a superellipse, not border-radius
- [x] layered window shadows (near + far)
- [x] cosine dock falloff
- [ ] Mission Control
- [ ] Stage Manager
- [ ] convince myself this is finished`,
  'README.md': `# desktop-web

A pixel-faithful desktop environment that runs in one file.

## Run it

    open index.html

That's the whole install process.`,
  'on-restraint.md': `# On restraint

Most interfaces fail by addition. A gradient here, a shadow there,
and then a spinner to cover the cost of all of it.

The details that actually land are the ones nobody can name:
traffic lights dimming when a window loses focus, the menu bar
filling in when something zooms, the dock tray widening as icons
grow and then holding perfectly steady.

Nobody will notice any of it. That's the point.`,
  'index.html': `<!DOCTYPE html>\n<html lang="en" data-theme="light">\n<head>\n  <title>macOS</title>\n  <!-- 400-odd KB of desktop -->\n</head>\n<body>\n  <div id="stage">…</div>\n</body>\n</html>`,
  'main.swift': `import SwiftUI\n\n@main\nstruct CleanTypeApp: App {\n    var body: some Scene {\n        MenuBarExtra("CleanType", systemImage: "textformat") {\n            SettingsView()\n        }\n        .menuBarExtraStyle(.window)\n    }\n}`,
  'synth.ts': `export class Voice {\n  constructor(private ctx: AudioContext) {}\n\n  play(freq: number, at = this.ctx.currentTime) {\n    const osc = this.ctx.createOscillator();\n    const gain = this.ctx.createGain();\n    osc.type = "sawtooth";\n    osc.frequency.value = freq;\n    gain.gain.setValueAtTime(0, at);\n    gain.gain.linearRampToValueAtTime(0.25, at + 0.01);\n    gain.gain.exponentialRampToValueAtTime(0.001, at + 1.2);\n    osc.connect(gain).connect(this.ctx.destination);\n    osc.start(at);\n    osc.stop(at + 1.3);\n  }\n}`,
  'shadow-notes.md': `## the four layers

0 0 0 .5px    the hairline. without it every edge looks soft.
0 3px 8px     contact. keeps the window sitting on something.
0 14px 28px   the body. this is the one people think of as "the shadow".
0 40px 80px   ambient spill. expensive, and the first to cut.

## focus

An unfocused window drops the outer two and lightens the rest.
That single difference is why a stack of windows reads as a stack
instead of a pile of rectangles.`,
};

/* ============================================================================
   13 · CALCULATOR
   ========================================================================== */
APPS.calculator = {
  name: 'Calculator', icon: 'app-calculator', w: 254, h: 366, minW: 232, minH: 320,
  menus: () => stdMenus('calculator', {
    View: [{ id: 'b', label: 'Basic', key: '⌘1', checked: true }, { id: 's', label: 'Scientific', key: '⌘2', checked: false, run: () => Toast('Scientific mode is not in this build') }],
  }),
  mount(w) {
    w.calc = { acc: null, op: null, cur: '0', fresh: true, lastOp: null, lastArg: null };
    const K = [
      ['AC', 'fn', 'ac'], ['+/−', 'fn', 'neg'], ['%', 'fn', 'pct'], ['÷', 'op', 'div'],
      ['7', '', 'n7'], ['8', '', 'n8'], ['9', '', 'n9'], ['×', 'op', 'mul'],
      ['4', '', 'n4'], ['5', '', 'n5'], ['6', '', 'n6'], ['−', 'op', 'sub'],
      ['1', '', 'n1'], ['2', '', 'n2'], ['3', '', 'n3'], ['+', 'op', 'add'],
      ['0', ' w2', 'n0'], ['.', '', 'dot'], ['=', 'op', 'eq'],
    ];
    return titlebar('Calculator', { dark: true }) + `<div class="calc">
      <div class="calc-out" data-out>0</div>
      <div class="calc-keys">${K.map(([l, c, k]) => `<button class="ck ${c}" data-k="${k}">${l}</button>`).join('')}</div>
    </div>`;
  },
  ready(w) {
    const paint = () => {
      const c = w.calc;
      w.node.querySelector('[data-out]').textContent = Calc.fmt(c.cur);
      $$('.ck.op', w.node).forEach(b => b.classList.toggle('on', c.op && b.dataset.k === c.op && c.fresh));
      $$('.ck.fn', w.node)[0].textContent = (c.cur !== '0' || c.op) ? 'C' : 'AC';
    };
    w.paint = paint;
    on(w.node, 'click', '[data-k]', (e, t) => { Calc.press(w, t.dataset.k); paint(); });
    on(w.node, 'pointerdown', '[data-k]', (e, t) => {
      t.classList.add('down');
      const up = () => { t.classList.remove('down'); removeEventListener('pointerup', up) };
      addEventListener('pointerup', up);
    });
    w.keyHandler = e => {
      if (WM.front !== w) return;
      const m = { '/': 'div', '*': 'mul', 'x': 'mul', '-': 'sub', '+': 'add', '=': 'eq', 'Enter': 'eq', '.': 'dot', ',': 'dot', '%': 'pct', 'Escape': 'ac', 'Backspace': 'del', 'Delete': 'ac' };
      let k = null;
      if (/^[0-9]$/.test(e.key)) k = 'n' + e.key;
      else if (m[e.key]) k = m[e.key];
      if (!k) return;
      e.preventDefault();
      const btn = w.node.querySelector(`[data-k="${k}"]`);
      if (btn) { btn.classList.add('down'); setTimeout(() => btn.classList.remove('down'), 95); }
      Calc.press(w, k); paint();
    };
    addEventListener('keydown', w.keyHandler);
    paint();
  },
  onClose(w) { removeEventListener('keydown', w.keyHandler); }
};

const Calc = {
  fmt(s) {
    if (s === 'Error' || s === '∞') return s;
    const neg = s.startsWith('-');
    let v = neg ? s.slice(1) : s;
    let [i, d] = v.split('.');
    if (i.length > 15) { const n = Number(v); return (neg ? '-' : '') + n.toExponential(6).replace('e+', 'e'); }
    i = i.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (neg ? '-' : '') + i + (d !== undefined ? '.' + d : '');
  },
  apply(a, b, op) {
    switch (op) {
      case 'add': return a + b; case 'sub': return a - b;
      case 'mul': return a * b; case 'div': return b === 0 ? NaN : a / b;
    }
    return b;
  },
  str(n) {
    if (!isFinite(n)) return isNaN(n) ? 'Error' : '∞';
    const r = Math.round(n * 1e12) / 1e12;
    return String(Math.abs(r) < 1e-12 ? 0 : r);
  },
  press(w, k) {
    const c = w.calc;
    if (k[0] === 'n' && k.length === 2) {
      const d = k[1];
      if (c.fresh) { c.cur = d; c.fresh = false; }
      else c.cur = c.cur === '0' ? d : (c.cur.replace(/[^\d.-]/g, '').length < 16 ? c.cur + d : c.cur);
      return;
    }
    if (k === 'dot') { if (c.fresh) { c.cur = '0.'; c.fresh = false; } else if (!c.cur.includes('.')) c.cur += '.'; return; }
    if (k === 'del') { if (c.fresh) return; c.cur = c.cur.length > 1 ? c.cur.slice(0, -1) : '0'; if (c.cur === '-') c.cur = '0'; return; }
    if (k === 'ac') {
      if (c.cur !== '0' && !c.fresh) { c.cur = '0'; c.fresh = true; return; }
      Object.assign(c, { acc: null, op: null, cur: '0', fresh: true, lastOp: null, lastArg: null }); return;
    }
    if (k === 'neg') { c.cur = c.cur.startsWith('-') ? c.cur.slice(1) : (c.cur === '0' ? '0' : '-' + c.cur); return; }
    if (k === 'pct') { c.cur = this.str(parseFloat(c.cur) / 100); c.fresh = false; return; }
    if (k === 'eq') {
      const b = parseFloat(c.cur);
      if (c.op != null && c.acc != null) { c.cur = this.str(this.apply(c.acc, b, c.op)); c.lastOp = c.op; c.lastArg = b; }
      else if (c.lastOp) { c.cur = this.str(this.apply(b, c.lastArg, c.lastOp)); }
      c.acc = null; c.op = null; c.fresh = true; return;
    }
    /* an operator */
    const b = parseFloat(c.cur);
    if (c.op != null && c.acc != null && !c.fresh) { c.acc = this.apply(c.acc, b, c.op); c.cur = this.str(c.acc); }
    else c.acc = b;
    c.op = k; c.fresh = true; c.lastOp = null;
  }
};

/* ============================================================================
   14 · ABOUT · TEXTEDIT · PREVIEW
   ========================================================================== */
APPS.about = {
  name: 'Finder', icon: 'app-finder', w: 400, h: 468, minW: 400, minH: 468,
  mount() {
    return titlebar('', { plain: true }) + `<div class="about">
      <svg class="mark" viewBox="0 0 15 18"><use href="#g-apple"/></svg>
      <h1>MacBook Pro</h1><div class="ver">16‑inch, 2026</div>
      <dl>
        <dt>Chip</dt><dd>Apple M4 Max</dd>
        <dt>Memory</dt><dd>128 GB</dd>
        <dt>Startup disk</dt><dd>Macintosh HD</dd>
        <dt>Serial number</dt><dd>C02PR4S3NX26</dd>
        <dt>macOS</dt><dd>Tahoe 26.0 (26A5240b)</dd>
        <dt>Display</dt><dd>${innerWidth * 2} × ${innerHeight * 2} @ 120 Hz</dd>
        <dt>Rendered by</dt><dd>one HTML file</dd>
      </dl>
      <div class="btns"><button class="btn" data-more>More Info…</button><button class="btn" data-rep>System Report…</button></div>
      <div style="margin-top:auto;padding-top:16px;font-size:10.5px;color:var(--txt-3);text-align:center;line-height:1.5">
        ™ and © 2026 Apple Inc.<br>All rights reserved.</div>
    </div>`;
  },
  ready(w) {
    on(w.node, 'click', '[data-more]', () => WM.open('settings', { section: 'general' }));
    on(w.node, 'click', '[data-rep]', () => WM.open('terminal'));
  }
};

APPS.textedit = {
  name: 'TextEdit', icon: 'f-txt', w: 620, h: 520, minW: 340, minH: 240, single: false,
  menus: () => stdMenus('textedit'),
  mount(w, o) {
    const name = (o.file && o.file.name) || o.file || 'Untitled.txt';
    const body = FILE_TEXT[name] || `${name}\n\n(this file is empty)`;
    /* TextEdit detects bare URLs and makes them clickable, so this one does too. */
    const doc = esc(body).replace(/https?:\/\/[^\s<]+[^\s<.,)]/g,
      u => `<a href="${u}" data-openext="${u}">${u}</a>`);
    return titlebar(name, { plain: true, right: `<button class="tbtn" data-nodrag data-tefmt title="Format">${ic('g-title')}</button>` }) +
      `<div class="te"><div class="te-doc selectable" contenteditable="true" spellcheck="false">${doc}</div></div>`;
  },
  ready(w) {
    const doc = w.node.querySelector('.te-doc');
    on(w.node, 'click', '[data-tefmt]', (e, t) => menuUnder(t, [
      { id: 'p', label: 'Plain Text', checked: !w.st || !w.st.rich, run: () => { w.st = { rich: false }; doc.style.font = ''; } },
      { id: 'r', label: 'Rich Text', checked: !!(w.st && w.st.rich), run: () => { w.st = { rich: true }; doc.style.font = '14px/1.65 -apple-system,Inter,sans-serif'; } }, '-',
      { id: 'b', label: 'Bold', key: '⌘B', run: () => { doc.focus(); document.execCommand('bold'); } },
      { id: 'i', label: 'Italic', key: '⌘I', run: () => { doc.focus(); document.execCommand('italic'); } }, '-',
      { id: 'w', label: 'Word Count', run: () => Toast(doc.textContent.trim().split(/\s+/).filter(Boolean).length + ' words') }]));
  }
};

APPS.preview = {
  name: 'Preview', icon: 'app-preview', w: 640, h: 560, minW: 360, minH: 300, single: false,
  menus: () => stdMenus('preview'),
  mount(w, o) {
    const name = (o.file && o.file.name) || o.file || 'Untitled';
    let inner;
    if (/guidelines|spec/i.test(name)) inner = `<div class="sheet">
      <h1>Interface Guidelines</h1><p style="margin:0 0 2px;font-size:12.5px">Revision 4 · July 2026</p>
      <h3>1 · Materials</h3><p>Chrome is a material, not a colour. Every bar, sidebar and tray samples what sits behind it — blur, then saturate, then tint. Opacity alone always reads as a sticker pasted on the window.</p>
      <h3>2 · Depth</h3><p>Four shadow layers: a hairline for the edge, a contact shadow so it doesn't float, a body, and an ambient spill. Unfocused windows drop the outer two and lighten the rest.</p>
      <h3>3 · Motion</h3><p>Menus in 130ms, panels in 300ms, nothing past 350ms. Ease out harder than you ease in — the arrival is what the eye judges.</p>
      <h3>4 · Pointer</h3><p>The arrow is the default state and it stays the arrow over buttons. A hand means "this navigates". A hand on everything means nothing.</p>
      <h3>5 · Restraint</h3><p>If an effect cannot hold sixty frames, remove the effect. A dropped frame is more visible than any gradient you were trying to render.</p>
    </div>`;
    else if (/\.(mp4|mov)$/i.test(name)) inner = `<div style="width:min(520px,100%);aspect-ratio:16/9;border-radius:8px;background:#0c0c0e;display:grid;place-items:center;box-shadow:0 20px 60px -18px rgba(0,0,0,.6)">
      <button class="btn pri" style="height:44px;width:44px;padding:0;border-radius:50%">${ic('g-play')}</button></div>
      <div style="margin-top:14px;font-size:12px;color:var(--txt-2)">${esc(name)} — 1920×1080 · H.264</div>`;
    else inner = `<img src="${WALLPAPERS[/screenshot/i.test(name) ? 'tahoe' : 'ridges'].url}" alt="${esc(name)}" style="max-height:78%">
      <div style="margin-top:14px;font-size:12px;color:var(--txt-2)">${esc(name)}</div>`;
    return titlebar(name, {
      plain: true, right:
        `<button class="tbtn" data-nodrag data-pvshare title="Share">${ic('g-share')}</button>` +
        `<button class="tbtn" data-nodrag data-pvfind title="Search">${ic('g-search')}</button>` +
        `<div class="sfield" data-nodrag data-pvfield style="width:0;padding:0;opacity:0;overflow:hidden;transition:width .22s var(--e-out),opacity .16s,padding .22s">
          <span>${ic('g-search')}</span><input placeholder="Search" spellcheck="false"></div>`
    }) + `<div class="pv" style="flex-direction:column">${inner}</div>`;
  },
  ready(w) {
    const name = (w.node.querySelector('.tb .title') || {}).textContent || 'Document';
    on(w.node, 'click', '[data-pvshare]', (e, t) => menuUnder(t, [
      { id: 'm', label: 'Mail', icon: 'g-compose', run: () => Mail.compose(name) },
      { id: 'g', label: 'Messages', icon: 'g-facetime', run: () => WM.open('messages') }, '-',
      { id: 'c', label: 'Copy', run: () => Toast('Copied to clipboard') },
      { id: 'p', label: 'Print…', run: () => Toast('Sent to printer') }]));
    /* Find reveals an inline field and highlights matches in the rendered document. */
    on(w.node, 'click', '[data-pvfind]', () => {
      const f = w.node.querySelector('[data-pvfield]'), open = f.style.width !== '0px';
      f.style.width = open ? '0px' : '150px';
      f.style.padding = open ? '0' : '';
      f.style.opacity = open ? '0' : '1';
      if (!open) f.querySelector('input').focus(); else { f.querySelector('input').value = ''; mark(''); }
    });
    const body = w.node.querySelector('.pv');
    const mark = q => {
      $$('mark', body).forEach(m => m.replaceWith(document.createTextNode(m.textContent)));
      body.normalize();
      if (!q || q.length < 2) return 0;
      let n = 0;
      const walk = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
      const hits = [];
      while (walk.nextNode()) if (walk.currentNode.nodeValue.toLowerCase().includes(q)) hits.push(walk.currentNode);
      hits.forEach(node => {
        const parts = node.nodeValue.split(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'ig'));
        const frag = document.createDocumentFragment();
        parts.forEach(p => {
          if (p.toLowerCase() === q) { const m = el('<mark style="background:#fff2a8;color:inherit;border-radius:2px">' + esc(p) + '</mark>'); frag.append(m); n++; }
          else frag.append(document.createTextNode(p));
        });
        node.replaceWith(frag);
      });
      return n;
    };
    const inp = w.node.querySelector('[data-pvfield] input');
    inp.addEventListener('input', () => {
      const n = mark(inp.value.trim().toLowerCase());
      if (inp.value.trim().length > 1) Toast(n ? n + (n === 1 ? ' match' : ' matches') : 'Not found');
    });
  }
};

/* ============================================================================
   15 · NOTES
   ========================================================================== */
const NOTE_SEED = [
  {
    id: 1, folder: 'Notes', title: 'Interface rules', date: dt(7, 27, 16, 12), pin: true,
    body: `<h1>Interface rules</h1><div class="date">27 July 2026 at 4:12 PM</div>
<p>Collected from things that felt wrong and then didn't.</p>
<h2>Motion</h2>
<div class="todo done"><i>${ic('g-check')}</i><span>Nothing animates longer than <b>350ms</b>. Past that it reads as lag, not polish.</span></div>
<div class="todo done"><i>${ic('g-check')}</i><span>Menus open instantly. Panels can take their time.</span></div>
<div class="todo"><i>${ic('g-check')}</i><span>If a transition can't hold 60fps, cut the effect, not the duration.</span></div>
<div class="todo"><i>${ic('g-check')}</i><span>Easing out beats easing in — arrivals matter more than departures.</span></div>
<h2>Depth</h2><ul><li>One shadow reads as a sticker. Stack them.</li><li>Blur is not translucency. You need both.</li><li>An unfocused window should look asleep, not disabled.</li></ul>`
  },
  {
    id: 2, folder: 'Notes', title: 'Window shadow recipe', date: dt(7, 26, 21, 40),
    body: `<h1>Window shadow recipe</h1><div class="date">26 July 2026 at 9:40 PM</div>
<p>One shadow always looks fake. macOS stacks four.</p>
<table><tr><th>Layer</th><th>Purpose</th></tr>
<tr><td>0 0 0 .5px</td><td>the hairline that defines the edge</td></tr>
<tr><td>0 3px 8px</td><td>contact shadow, keeps it from floating</td></tr>
<tr><td>0 14px 28px</td><td>the body of the shadow</td></tr>
<tr><td>0 40px 80px</td><td>ambient spill — this is the expensive one</td></tr></table>
<p>Unfocused windows drop the last two and lighten the rest. That difference is why a stack of windows reads as a stack.</p>`
  },
  {
    id: 3, folder: 'Notes', title: 'Dock falloff', date: dt(7, 25, 11, 8),
    body: `<h1>Dock falloff</h1><div class="date">25 July 2026 at 11:08 AM</div>
<p>Linear distance → scale looks wrong. There's a visible crease where influence hits zero.</p>
<p>A raised cosine has zero slope at both ends, so the magnification eases in and out of the neighbouring icons instead of snapping:</p>
<p style="font-family:var(--font-mono);font-size:12.5px;background:var(--fill);padding:9px 12px;border-radius:7px">scale = 1 + (max−1) · (½ − ½cos(πu))<sup>0.86</sup></p>
<p>The 0.86 exponent narrows the peak slightly. Without it the whole row lifts and it feels mushy.</p>`
  },
  {
    id: 4, folder: 'Notes', title: 'Grocery', date: dt(7, 24, 19, 2),
    body: `<h1>Grocery</h1><div class="date">24 July 2026 at 7:02 PM</div>
<div class="todo done"><i>${ic('g-check')}</i><span>Coffee — the good one</span></div>
<div class="todo done"><i>${ic('g-check')}</i><span>Oat milk</span></div>
<div class="todo"><i>${ic('g-check')}</i><span>Paneer</span></div>
<div class="todo"><i>${ic('g-check')}</i><span>Tomatoes, ginger, green chilli</span></div>
<div class="todo"><i>${ic('g-check')}</i><span>Dark chocolate (85%)</span></div>`
  },
  {
    id: 5, folder: 'Notes', title: 'Sprint planning', date: dt(7, 20, 9, 30),
    body: `<h1>Sprint planning</h1><div class="date">20 July 2026 at 9:30 AM</div>
<h2>Ship</h2><ul><li>Column view in Finder, with a working preview pane</li><li>Terminal tab completion (longest common prefix, then list)</li><li>Genie minimise — clip-path polygon, four points, don't cheat it</li></ul>
<h2>Park</h2><ul><li>Mission Control</li><li>Stage Manager</li></ul>
<p>Review PR #142 before Thursday.</p>`
  },
  { id: 6, folder: 'Recently Deleted', title: 'Old draft', date: dt(7, 12, 8, 0), body: `<h1>Old draft</h1><div class="date">12 July 2026 at 8:00 AM</div><p>Scrapped. The framing was wrong.</p>` },
];

APPS.notes = {
  name: 'Notes', icon: 'app-notes', w: 940, h: 600, minW: 580, minH: 340,
  menus: () => stdMenus('notes', {
    File: [{ id: 'n', label: 'New Note', key: '⌘N', run: () => Notes.create() },
    { id: 'f', label: 'New Folder', key: '⇧⌘N' }, '-',
    { id: 'd', label: 'Delete Note', run: () => Notes.del() }],
    Format: [{ id: 'b', label: 'Bold', key: '⌘B', run: () => Notes.fmt('bold') },
    { id: 'i', label: 'Italic', key: '⌘I', run: () => Notes.fmt('italic') },
    { id: 'u', label: 'Underline', key: '⌘U', run: () => Notes.fmt('underline') }, '-',
    { id: 'c', label: 'Checklist', key: '⇧⌘L', run: () => Notes.checklist() },
    { id: 't', label: 'Table', run: () => Notes.table() }],
  }, ['File', 'Edit', 'Format', 'View', 'Window', 'Help']),
  mount(w) {
    w.st = { notes: NOTE_SEED.map(n => ({ ...n })), folder: 'Notes', sel: 1, q: '' };
    const F = [['All iCloud', 'g-icloud-o', 5], ['Notes', 'g-folder-g', 5], ['Recently Deleted', 'g-tag', 1]];
    return `<div class="wb">
      <div class="sbar" data-drag style="width:196px">
        <div style="display:flex;align-items:center;height:38px;padding:0 10px 0 12px">
          <div data-tl></div><div style="flex:1"></div>
          <button class="tbtn" data-nodrag data-sbtoggle title="Hide Folders">${ic('g-sidebar')}</button>
        </div>
        <div class="grp"><div class="gh">iCloud</div>
        ${F.map(([n, i, c]) => `<div class="si" data-folder="${esc(n)}">${ic(i, 'ico')}<span class="nm">${esc(n)}</span><span class="tail">${c}</span></div>`).join('')}
        </div></div>
      <div class="nt">
        <div class="nt-list">
          <div class="nt-search" data-drag style="display:flex;gap:8px;align-items:center;padding-top:9px">
            <div class="sfield" data-nodrag style="flex:1"><span>${ic('g-search')}</span><input placeholder="Search" data-q></div>
            <button class="tbtn" data-new2 data-nodrag title="New Note">${ic('g-compose')}</button>
          </div>
          <div class="nt-items scroll" data-items></div>
        </div>
        <div class="nt-ed">
          <div class="nt-fmt" data-drag>
            <div style="flex:1"></div>
            <button class="tbtn" data-f="bold" data-nodrag title="Bold">${ic('g-bold')}</button>
            <button class="tbtn" data-f="italic" data-nodrag title="Italic">${ic('g-italic')}</button>
            <button class="tbtn" data-f="underline" data-nodrag title="Underline">${ic('g-underline')}</button>
            <button class="tbtn" data-f="strikeThrough" data-nodrag title="Strikethrough">${ic('g-strike')}</button>
            <div class="sep"></div>
            <button class="tbtn" data-f="insertUnorderedList" data-nodrag title="Bulleted list">${ic('g-bullets')}</button>
            <button class="tbtn" data-check data-nodrag title="Checklist">${ic('g-checklist')}</button>
            <button class="tbtn" data-table data-nodrag title="Table">${ic('g-table')}</button>
            <div class="sep"></div>
            <button class="tbtn" data-new data-nodrag title="New note">${ic('g-plus')}</button>
            <div style="flex:1"></div>
          </div>
          <div class="nt-doc selectable" contenteditable="true" spellcheck="false" data-doc></div>
        </div>
      </div></div>`;
  },
  ready(w) {
    Notes.w = w;
    on(w.node, 'click', '[data-folder]', (e, t) => { w.st.folder = t.dataset.folder; Notes.render(w); });
    on(w.node, 'click', '.nt-i', (e, t) => { Notes.save(w); w.st.sel = +t.dataset.id; Notes.render(w); });
    on(w.node, 'contextmenu', '.nt-i', (e, t) => {
      w.st.sel = +t.dataset.id; Notes.render(w);
      ctxMenu(e, [{ id: 'p', label: 'Pin Note' }, { id: 'd', label: 'Duplicate' }, '-', { id: 'x', label: 'Delete', run: () => Notes.del(w) }]);
    });
    on(w.node, 'click', '[data-f]', (e, t) => Notes.fmt(t.dataset.f, w));
    on(w.node, 'click', '[data-check]', () => Notes.checklist(w));
    on(w.node, 'click', '[data-table]', () => Notes.table(w));
    on(w.node, 'click', '[data-new],[data-new2]', () => Notes.create(w));
    on(w.node, 'click', '[data-sbtoggle]', () => {
      const sb = w.node.querySelector('.sbar');
      sb.style.display = sb.style.display === 'none' ? '' : 'none';
      if (sb.style.display === 'none') w.node.querySelector('.nt-search').prepend(w.node.querySelector('.tl'));
      else sb.firstElementChild.prepend(w.node.querySelector('.tl'));
    });
    on(w.node, 'click', '.nt-doc .todo i', (e, t) => { e.preventDefault(); t.closest('.todo').classList.toggle('done'); });
    w.node.querySelector('[data-q]').addEventListener('input', e => { w.st.q = e.target.value; Notes.render(w); });
    const doc = w.node.querySelector('[data-doc]');
    doc.addEventListener('input', () => { Notes.saveDebounced(w); });
    doc.addEventListener('keyup', () => Notes.fmtState(w));
    doc.addEventListener('mouseup', () => Notes.fmtState(w));
    /* Focusing the editor already puts the caret somewhere — if that somewhere is a
       heading, Bold belongs lit before anyone clicks it. */
    doc.addEventListener('focus', () => setTimeout(() => Notes.fmtState(w), 0));
    doc.addEventListener('keydown', e => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const m = { b: 'bold', i: 'italic', u: 'underline' }[e.key.toLowerCase()];
      if (m) { e.preventDefault(); Notes.fmt(m, w); }
    });
    Notes.render(w);
  },
  onClose(w) { Notes.save(w); if (Notes.w === w) Notes.w = null; }
};

const Notes = {
  w: null,
  cur(w) { w = w || this.w; return w && w.st.notes.find(n => n.id === w.st.sel); },
  list(w) {
    const st = w.st;
    let ns = st.notes.filter(n => st.folder === 'All iCloud' ? n.folder !== 'Recently Deleted' : n.folder === st.folder);
    if (st.q) { const q = st.q.toLowerCase(); ns = ns.filter(n => (n.title + ' ' + n.body).toLowerCase().includes(q)); }
    return ns.sort((a, b) => (b.pin ? 1 : 0) - (a.pin ? 1 : 0) || b.date - a.date);
  },
  snippet(n) {
    const d = document.createElement('div'); d.innerHTML = n.body;
    d.querySelectorAll('h1,.date').forEach(e => e.remove());
    /* block boundaries need a separator or "Ship" + "Column view" become one word */
    d.querySelectorAll('h2,h3,p,li,tr,div,br').forEach(e => e.insertAdjacentText('afterend', ' '));
    return (d.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60) || 'No additional text';
  },
  render(w) {
    w = w || this.w; if (!w) return;
    const st = w.st, list = this.list(w);
    if (!list.some(n => n.id === st.sel)) st.sel = list.length ? list[0].id : null;
    $$('[data-folder]', w.node).forEach(b => b.classList.toggle('on', b.dataset.folder === st.folder));
    w.node.querySelector('[data-items]').innerHTML = list.length ? list.map(n => `
      <div class="nt-i${n.id === st.sel ? ' on' : ''}" data-id="${n.id}">
        <b>${n.pin ? '📌 ' : ''}${esc(n.title || 'New Note')}</b>
        <div class="mt"><span>${this.when(n.date)}</span><span class="sn">${esc(this.snippet(n))}</span></div>
      </div>`).join('') : `<div style="padding:22px;text-align:center;color:var(--txt-3);font-size:12.5px">No notes</div>`;
    const doc = w.node.querySelector('[data-doc]'), n = this.cur(w);
    if (n) { doc.innerHTML = n.body; doc.style.display = ''; }
    else { doc.innerHTML = ''; }
  },
  when(d) {
    const now = new Date();
    if (d.toDateString() === now.toDateString()) return time12(d).replace(NBSP, ' ');
    const diff = (now - d) / 864e5;
    if (diff < 7) return DAYS[d.getDay()];
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(2)}`;
  },
  save(w) {
    w = w || this.w; if (!w) return;
    const n = this.cur(w); if (!n) return;
    const doc = w.node.querySelector('[data-doc]'); if (!doc) return;
    n.body = doc.innerHTML;
    const h = doc.querySelector('h1');
    const t = (h ? h.textContent : (doc.textContent || '').split('\n')[0]).trim();
    if (t) n.title = t.slice(0, 60);
  },
  saveDebounced(w) { clearTimeout(this._t); this._t = setTimeout(() => { this.save(w); this.renderListOnly(w); }, 420); },
  renderListOnly(w) {
    const st = w.st, list = this.list(w);
    const host = w.node.querySelector('[data-items]'); if (!host) return;
    host.innerHTML = list.map(n => `
      <div class="nt-i${n.id === st.sel ? ' on' : ''}" data-id="${n.id}">
        <b>${n.pin ? '📌 ' : ''}${esc(n.title || 'New Note')}</b>
        <div class="mt"><span>${this.when(n.date)}</span><span class="sn">${esc(this.snippet(n))}</span></div></div>`).join('');
  },
  fmt(cmd, w) {
    w = w || this.w; if (!w) return;
    const doc = w.node.querySelector('[data-doc]');
    doc.focus();
    /* execCommand needs a range, and specifically one that lands inside a text node —
       a caret parked after the last block has nothing to hang a typing style on, so
       the command silently does nothing. */
    const sel = getSelection();
    if (!sel.rangeCount || !doc.contains(sel.anchorNode)) {
      const walk = document.createTreeWalker(doc, NodeFilter.SHOW_TEXT);
      let last = null;
      while (walk.nextNode()) if (walk.currentNode.nodeValue.trim()) last = walk.currentNode;
      const r = document.createRange();
      if (last) r.setStart(last, last.nodeValue.length);
      else { r.selectNodeContents(doc); }
      r.collapse(true);
      sel.removeAllRanges(); sel.addRange(r);
    }
    document.execCommand(cmd, false, null);
    this.fmtState(w);
    this.saveDebounced(w);
  },
  /* Toolbar buttons light up for the current caret, so pressing Bold with nothing
     selected still tells you the next thing you type will be bold. */
  fmtState(w) {
    w = w || this.w; if (!w) return;
    $$('[data-f]', w.node).forEach(b => {
      let on = false;
      try { on = document.queryCommandState(b.dataset.f); } catch (e) { }
      b.classList.toggle('on', on);
    });
  },
  checklist(w) {
    w = w || this.w; if (!w) return;
    const doc = w.node.querySelector('[data-doc]'); doc.focus();
    document.execCommand('insertHTML', false, `<div class="todo"><i>${ic('g-check')}</i><span>&nbsp;</span></div>`);
    this.saveDebounced(w);
  },
  table(w) {
    w = w || this.w; if (!w) return;
    const doc = w.node.querySelector('[data-doc]'); doc.focus();
    document.execCommand('insertHTML', false,
      `<table><tr><th>&nbsp;</th><th>&nbsp;</th><th>&nbsp;</th></tr><tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr><tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr></table><p>&nbsp;</p>`);
    this.saveDebounced(w);
  },
  create(w) {
    w = w || this.w; if (!w) return WM.open('notes');
    this.save(w);
    const id = Math.max(0, ...w.st.notes.map(n => n.id)) + 1;
    const d = new Date();
    w.st.notes.unshift({
      id, folder: w.st.folder === 'Recently Deleted' ? 'Notes' : (w.st.folder === 'All iCloud' ? 'Notes' : w.st.folder),
      title: 'New Note', date: d,
      body: `<h1>New Note</h1><div class="date">${d.getDate()} ${MONS[d.getMonth()]} ${d.getFullYear()} at ${time12(d).replace(NBSP, ' ')}</div><p><br></p>`
    });
    w.st.sel = id; w.st.q = ''; const qi = w.node.querySelector('[data-q]'); if (qi) qi.value = '';
    this.render(w);
    const doc = w.node.querySelector('[data-doc]');
    doc.focus();
    const r = document.createRange(); r.selectNodeContents(doc.querySelector('h1')); r.collapse(false);
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
  },
  del(w) {
    w = w || this.w; if (!w) return;
    const n = this.cur(w); if (!n) return;
    if (n.folder === 'Recently Deleted') w.st.notes = w.st.notes.filter(x => x !== n);
    else n.folder = 'Recently Deleted';
    this.render(w);
  }
};

/* ============================================================================
   16 · CALENDAR
   ========================================================================== */
/* Calendars are the filter *and* the colour source, exactly as in Calendar.app —
   an event has no colour of its own, it inherits the list it belongs to. */
const CALS = [
  { id: 'home', name: 'Home', c: '#ff375f', on: true },
  { id: 'work', name: 'Work', c: '#0a84ff', on: true },
  { id: 'bday', name: 'Birthdays', c: '#30d158', on: true },
  { id: 'hol', name: 'Holidays', c: '#bf5af2', on: true },
];
const calOf = id => CALS.find(c => c.id === id) || CALS[0];

/* `s` is minutes past midnight and null means all-day; `dur` is length in minutes.
   Storing real numbers rather than "3:50 PM" is what lets events be moved, resized
   and laid out against each other instead of just listed. */
let EV_ID = 0;
/* Function declarations, not consts: the seed list below is built at parse time,
   which is before Cal exists. */
function clockLabel(mins) {
  const h = Math.floor(mins / 60) % 24, m = mins % 60;
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}
/** Keeps the fields other views read (`at`, `c`) in step with the underlying data. */
function syncEvent(ev) {
  ev.c = calOf(ev.cal).c;
  ev.at = ev.s == null ? 'all-day' : clockLabel(ev.s);
  return ev;
}
const mkEvent = o => syncEvent({ id: ++EV_ID, dur: 60, cal: 'work', loc: '', notes: '', ...o });
const EVENTS = [
  { d: [2026, 6, 27], t: 'Sprint planning', s: 570, dur: 45, cal: 'work' },
  { d: [2026, 6, 27], t: 'Dentist', s: 930, dur: 40, cal: 'home', loc: 'Dr. Reed · Stevens Creek' },
  { d: [2026, 6, 27], t: 'Dinner — Kate', s: 1200, dur: 120, cal: 'home', loc: 'Bar Aldo' },
  { d: [2026, 6, 28], t: 'One-on-one with Daniel', s: 630, dur: 30, cal: 'work' },
  { d: [2026, 6, 28], t: 'Deploy window', s: 1020, dur: 90, cal: 'work' },
  { d: [2026, 6, 29], t: 'Review PR #142', s: 660, dur: 60, cal: 'work' },
  { d: [2026, 6, 29], t: 'David — coffee', s: 1050, dur: 45, cal: 'home', loc: 'Third Wave' },
  { d: [2026, 6, 30], t: 'Podcast recording', s: 1020, dur: 90, cal: 'work', loc: 'Studio B' },
  { d: [2026, 7, 3], t: 'Flight to SFO', s: 375, dur: 210, cal: 'home', loc: 'BLR T2' },
  { d: [2026, 6, 21], t: 'Design review', s: 840, dur: 60, cal: 'work' },
  { d: [2026, 6, 15], t: 'Beta cutoff', s: null, cal: 'work' },
  { d: [2026, 6, 31], t: "John's birthday", s: null, cal: 'bday' },
  { d: [2026, 7, 15], t: 'Independence Day', s: null, cal: 'hol' },
].map(mkEvent);

/* Only events on visible calendars, in the order the day actually happens. */
const evOn = (y, m, d) => EVENTS
  .filter(e => e.d[0] === y && e.d[1] === m && e.d[2] === d && calOf(e.cal).on)
  .sort((a, b) => (a.s == null ? -1 : b.s == null ? 1 : a.s - b.s));

APPS.calendar = {
  name: 'Calendar', icon: 'app-calendar', w: 880, h: 600, minW: 560, minH: 380,
  menus: () => stdMenus('calendar', {
    View: [{ id: 'd', label: 'Day', key: '⌘1' }, { id: 'w', label: 'Week', key: '⌘2' },
    { id: 'm', label: 'Month', key: '⌘3', checked: true }, { id: 'y', label: 'Year', key: '⌘4' }, '-',
    { id: 't', label: 'Go to Today', key: '⌘T', run: () => Cal.today() }],
  }),
  mount(w) {
    const n = new Date();
    w.st = { y: n.getFullYear(), m: n.getMonth() };
    return `<div class="wb">
      <div class="cal-side" data-drag><div class="sb-top" style="height:44px"><div data-tl></div></div>
        <div class="grp" style="padding:0 10px"><div class="gh">iCloud</div>
          <div data-cals></div>
        </div>
        <div data-mini></div>
        <div style="margin-top:auto;padding:10px 14px" data-agenda></div>
      </div>
      <div class="cal-main">
        <div class="cal-head" data-drag>
          <h3 data-mon></h3>
          <div class="grow" style="flex:1"></div>
          <button class="tbtn" data-nodrag data-p="-1">${ic('g-chev-l')}</button>
          <button class="btn" data-nodrag data-today>Today</button>
          <button class="tbtn" data-nodrag data-p="1">${ic('g-chev-r')}</button>
          <div class="seg" data-nodrag style="margin-left:6px">
            ${['Day', 'Week', 'Month', 'Year'].map(v =>
      `<button data-view="${v.toLowerCase()}"${v === 'Month' ? ' class="on"' : ''} style="width:${{ Day: 38, Week: 42, Month: 46, Year: 38 }[v]}px;font-size:11.5px">${v}</button>`).join('')}
          </div>
          <button class="tbtn" data-nodrag data-new>${ic('g-plus')}</button>
        </div>
        <div class="cal-dows" data-dows>${DAYS3.map(d => `<div>${d}</div>`).join('')}</div>
        <div class="cal-grid" data-grid></div>
      </div></div>`;
  },
  ready(w) {
    Cal.w = w;
    w.st.view = 'month'; w.st.day = new Date().getDate();
    on(w.node, 'click', '[data-p]', (e, t) => Cal.shift(w, +t.dataset.p));
    on(w.node, 'click', '[data-today]', () => Cal.today(w));
    on(w.node, 'click', '[data-view]', (e, t) => Cal.setView(w, t.dataset.view));
    on(w.node, 'click', '[data-new]', () => Cal.newEvent(w));
    /* Toggling a calendar hides its events everywhere, including the widget. */
    on(w.node, 'click', '[data-cal]', (e, t) => {
      const c = calOf(t.dataset.cal);
      c.on = !c.on;
      Cal.render(w);
      Bus.emit('events');
    });
    on(w.node, 'click', '.cal-cell', (e, t) => {
      if (t.classList.contains('out')) return;
      $$('.cal-cell.pick', w.node).forEach(c => c.classList.remove('pick'));
      t.classList.add('pick');
      w.st.day = +t.dataset.d;
    });
    /* Same gesture as Calendar.app: double-click empty space in a day to add. */
    on(w.node, 'dblclick', '.cal-cell', (e, t) => {
      if (t.classList.contains('out') || e.target.closest('.cal-ev')) return;
      Cal.edit(w, null, { y: +t.dataset.y, m: +t.dataset.m, d: +t.dataset.d });
    });
    on(w.node, 'click', '[data-ev]', (e, t) => {
      e.stopPropagation();
      const ev = EVENTS.find(x => x.id === +t.dataset.ev);
      if (ev) Cal.edit(w, ev);
    });
    /* Clicking an hour row opens the editor already set to that time. */
    on(w.node, 'dblclick', '.col', (e, t) => {
      if (e.target.closest('.ev')) return;
      const r = t.getBoundingClientRect();
      const mins = Cal.H0 * 60 + Math.round((e.clientY - r.top) / Cal.ROW * 60 / 15) * 15;
      Cal.edit(w, null, { y: +t.dataset.y, m: +t.dataset.m, d: +t.dataset.d, s: clamp(mins, 0, 1425) });
    });
    /* A month cell in year view jumps into that month. */
    on(w.node, 'click', '[data-ym]', (e, t) => {
      w.st.m = +t.dataset.ym; Cal.setView(w, 'month');
    });
    Cal.dragMove(w);
    Cal.render(w);
  }
};

const Cal = {
  w: null,
  /* A full day, like Calendar.app — a 7-to-9 window would clamp the early flight to
     the top of the grid and pretend the small hours don't exist. */
  H0: 0, H1: 23, ROW: 42,

  sync: syncEvent,
  clock: clockLabel,
  /* Accepts what people actually type: "9", "9:30", "9:30 pm", "21:30", "9p". */
  parseClock(str, fallback) {
    const m = /^\s*(\d{1,2})(?::(\d{2}))?\s*(a|p)?m?\s*$/i.exec(str || '');
    if (!m) return fallback;
    let h = +m[1]; const min = +(m[2] || 0);
    if (h > 23 || min > 59) return fallback;
    if (m[3]) { h %= 12; if (/p/i.test(m[3])) h += 12; }
    return h * 60 + min;
  },
  parseDate(str, fallback) {
    const t = Date.parse(str);
    if (isNaN(t)) return fallback;
    const d = new Date(t);
    return [d.getFullYear(), d.getMonth(), d.getDate()];
  },
  dateLabel(d) { return `${MONS3[d[1]]} ${d[2]}, ${d[0]}`; },

  /* The arrows step by whatever the current view shows. */
  shift(w, d) {
    w = w || this.w;
    const v = w.st.view || 'month';
    if (v === 'year') { w.st.y += d; }
    else if (v === 'week' || v === 'day') {
      const base = new Date(w.st.y, w.st.m, w.st.day || 1);
      base.setDate(base.getDate() + d * (v === 'week' ? 7 : 1));
      w.st.y = base.getFullYear(); w.st.m = base.getMonth(); w.st.day = base.getDate();
    } else {
      const m = w.st.m + d; w.st.y += Math.floor(m / 12); w.st.m = ((m % 12) + 12) % 12;
    }
    this.render(w);
  },
  today(w) {
    w = w || this.w; if (!w) return WM.open('calendar');
    const n = new Date();
    w.st.y = n.getFullYear(); w.st.m = n.getMonth(); w.st.day = n.getDate();
    this.render(w);
  },
  setView(w, v) {
    w = w || this.w; if (!w) return;
    w.st.view = v;
    $$('[data-view]', w.node).forEach(b => b.classList.toggle('on', b.dataset.view === v));
    this.render(w);
  },
  newEvent(w) {
    w = w || this.w; if (!w) return;
    this.edit(w, null, { y: w.st.y, m: w.st.m, d: w.st.day || 1 });
  },

  /** The one editor for both new and existing events, like Calendar's inspector. */
  edit(w, ev, seed = {}) {
    w = w || this.w; if (!w) return;
    const isNew = !ev;
    const now = new Date();
    const base = ev || {
      d: [seed.y ?? w.st.y, seed.m ?? w.st.m, seed.d ?? (w.st.day || 1)],
      t: '', s: seed.s ?? Math.min(1380, (Math.floor(now.getHours()) + 1) * 60),
      dur: 60, cal: 'work', loc: '', notes: '',
    };
    const allDay = base.s == null;
    const F = (label, inner) => `<div class="ce-row"><span>${label}</span>${inner}</div>`;
    const node = el(`<div class="pop ce" style="width:340px">
      <div class="ce-top">
        <div class="ce-title">${isNew ? 'New Event' : 'Event'}</div>
        ${isNew ? '' : `<button class="tbtn" data-del title="Delete">${ic('g-trash')}</button>`}
      </div>
      <input class="ce-name" data-f="t" placeholder="New Event" spellcheck="false" value="${esc(base.t)}">
      <input class="ce-loc" data-f="loc" placeholder="Add Location" spellcheck="false" value="${esc(base.loc || '')}">
      <div class="ce-body">
        ${F('all-day', `<div class="sw${allDay ? ' on' : ''}" data-allday style="margin-left:auto;transform:scale(.82);transform-origin:left center"></div>`)}
        ${F('date', `<input data-f="date" value="${this.dateLabel(base.d)}" spellcheck="false">`)}
        <div data-times style="${allDay ? 'display:none' : ''}">
          ${F('from', `<input data-f="from" value="${this.clock(base.s ?? 540)}" spellcheck="false">`)}
          ${F('to', `<input data-f="to" value="${this.clock((base.s ?? 540) + (base.dur || 60))}" spellcheck="false">`)}
        </div>
        ${F('calendar', `<div class="ce-cals" style="margin-left:auto">${CALS.map(c =>
      `<span class="acc${c.id === base.cal ? ' on' : ''}" data-pickcal="${c.id}" title="${c.name}" style="width:15px;height:15px;background:${c.c}"></span>`).join('')}</div>`)}
      </div>
      <textarea class="ce-notes" data-f="notes" placeholder="Add Notes" spellcheck="false">${esc(base.notes || '')}</textarea>
      <div class="ce-foot">
        <button class="btn" data-cancel>Cancel</button>
        <button class="btn pri" data-save>${isNew ? 'Add' : 'Done'}</button>
      </div></div>`);

    let cal = base.cal, day = !allDay;
    node.querySelector('[data-allday]').onclick = e => {
      const sw = e.currentTarget;
      sw.classList.toggle('on');
      day = !sw.classList.contains('on');
      node.querySelector('[data-times]').style.display = day ? '' : 'none';
    };
    on(node, 'click', '[data-pickcal]', (e, t) => {
      cal = t.dataset.pickcal;
      $$('[data-pickcal]', node).forEach(x => x.classList.toggle('on', x === t));
    });
    const val = f => node.querySelector(`[data-f="${f}"]`).value;
    node.querySelector('[data-cancel]').onclick = () => Pop.close();
    if (!isNew) node.querySelector('[data-del]').onclick = () => {
      const i = EVENTS.indexOf(ev);
      if (i >= 0) EVENTS.splice(i, 1);
      Pop.close(); this.render(w); Bus.emit('events');
      Toast('Event deleted');
    };
    node.querySelector('[data-save]').onclick = () => {
      const d = this.parseDate(val('date'), base.d);
      const s = day ? this.parseClock(val('from'), base.s ?? 540) : null;
      /* An end before its start means the next day in Calendar; here it just clamps
         to a fifteen-minute minimum, which is the only sane reading in one grid. */
      const dur = day ? Math.max(15, this.parseClock(val('to'), (s || 0) + 60) - s) : 0;
      const t = val('t').trim() || 'New Event';
      if (isNew) EVENTS.push(mkEvent({ d, t, s, dur, cal, loc: val('loc').trim(), notes: val('notes') }));
      else Object.assign(ev, { d, t, s, dur, cal, loc: val('loc').trim(), notes: val('notes') }) && this.sync(ev);
      w.st.y = d[0]; w.st.m = d[1]; w.st.day = d[2];
      Pop.close(); this.render(w); Bus.emit('events');
      Toast(isNew ? `Added “${t}” on ${MONS3[d[1]]} ${d[2]}` : 'Event updated');
    };
    const r = w.node.getBoundingClientRect();
    Pop.open(node, { x: Math.min(r.right - 356, innerWidth - 356), y: r.top + 64, origin: 'top right' });
    setTimeout(() => node.querySelector('.ce-name').focus(), 60);
    /* Enter saves, which is the whole point of a one-field-deep sheet. */
    node.addEventListener('keydown', e => {
      if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') { e.preventDefault(); node.querySelector('[data-save]').click(); }
      if (e.key === 'Escape') { e.preventDefault(); Pop.close(); }
    });
  },

  /* Dragging an event onto another day moves it, the way it does in month view. */
  dragMove(w) {
    let drag = null;
    w.node.addEventListener('pointerdown', e => {
      const chip = e.target.closest('.cal-ev[data-ev]');
      if (!chip || e.button) return;
      const ev = EVENTS.find(x => x.id === +chip.dataset.ev);
      if (!ev) return;
      drag = { ev, chip, x: e.clientX, y: e.clientY, live: false };
    });
    addEventListener('pointermove', e => {
      if (!drag) return;
      if (!drag.live) {
        if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 4) return;
        drag.live = true;
        drag.chip.classList.add('dragging');
        document.body.style.cursor = 'grabbing';
      }
      const cell = document.elementFromPoint(e.clientX, e.clientY)?.closest('.cal-cell:not(.out)');
      $$('.cal-cell.drop', w.node).forEach(c => c.classList.remove('drop'));
      if (cell) cell.classList.add('drop');
    });
    addEventListener('pointerup', e => {
      if (!drag) return;
      const d = drag;
      drag = null;
      document.body.style.cursor = '';
      $$('.cal-cell.drop', w.node).forEach(c => c.classList.remove('drop'));
      if (!d.live) return;
      d.chip.classList.remove('dragging');
      const cell = document.elementFromPoint(e.clientX, e.clientY)?.closest('.cal-cell:not(.out)');
      if (!cell) return;
      const to = [+cell.dataset.y, +cell.dataset.m, +cell.dataset.d];
      if (to.join() === d.ev.d.join()) return;
      d.ev.d = to;
      this.render(w); Bus.emit('events');
      Toast(`Moved to ${MONS3[to[1]]} ${to[2]}`);
    });
  },

  render(w) {
    w = w || this.w; if (!w) return;
    const v = w.st.view || 'month';
    if (v === 'day') return this.renderDay(w);
    if (v === 'week') return this.renderWeek(w);
    if (v === 'year') return this.renderYear(w);
    return this.renderMonth(w);
  },

  /* Shared chrome: the calendar list, mini-month and agenda don't change per view. */
  side(w) {
    const { y, m } = w.st, now = new Date();
    w.node.querySelector('[data-cals]').innerHTML = CALS.map(c =>
      `<div class="si cal-tick${c.on ? '' : ' off'}" data-cal="${c.id}">
        <span class="tick" style="--c:${c.c}">${ic('g-check')}</span><span class="nm">${c.name}</span></div>`).join('');
    w.node.querySelector('[data-mini]').innerHTML = this.miniHTML(y, m);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const upcoming = EVENTS
      .filter(e => calOf(e.cal).on && new Date(e.d[0], e.d[1], e.d[2]) >= today)
      .sort((a, b) => (new Date(a.d[0], a.d[1], a.d[2]) - new Date(b.d[0], b.d[1], b.d[2])) || (a.s ?? -1) - (b.s ?? -1))
      .slice(0, 4);
    w.node.querySelector('[data-agenda]').innerHTML =
      `<div class="gh" style="padding-left:0">Upcoming</div>` + (upcoming.length ? upcoming.map(e =>
        `<div class="cal-up" data-ev="${e.id}"><i style="background:${e.c}"></i>
        <div style="min-width:0"><div class="t">${esc(e.t)}</div>
        <div class="s">${MONS3[e.d[1]]} ${e.d[2]} · ${e.at}</div></div></div>`).join('')
        : `<div style="font-size:11.5px;color:var(--txt-3)">Nothing scheduled.</div>`);
  },

  /* Hour rows, shared by day and week. Events sit at their start minute, are as tall
     as they are long, and split the column when they overlap — the three things that
     separate a timetable from a list of times. */
  layout(evs) {
    const timed = evs.filter(e => e.s != null);
    const cols = [];
    timed.forEach(e => {
      const end = e.s + (e.dur || 60);
      let c = cols.findIndex(col => col.every(o => e.s >= o.s + (o.dur || 60) || end <= o.s));
      if (c < 0) { cols.push([e]); c = cols.length - 1; } else cols[c].push(e);
      e._col = c;
    });
    const n = Math.max(1, cols.length);
    timed.forEach(e => { e._w = 100 / n; e._x = e._col * (100 / n); });
    return { timed, allDay: evs.filter(e => e.s == null) };
  },
  /** The fixed band above the hour grid. Empty days still need a cell, for alignment. */
  allDayBand(days) {
    const cells = days.map(d => evOn(d.getFullYear(), d.getMonth(), d.getDate()).filter(e => e.s == null));
    if (!cells.some(c => c.length)) return '';
    return `<div class="cal-band"><div class="gut">all-day</div>
      ${cells.map(evs => `<div class="cell">${evs.map(e =>
      `<div class="chip" data-ev="${e.id}" style="background:${e.c}">${esc(e.t)}</div>`).join('')}</div>`).join('')}</div>`;
  },
  /** The scrolling hour grid, wrapped so the band can sit above it and stay put. */
  gridHTML(days) {
    return `<div class="cal-grid cal-stack" data-grid>${this.allDayBand(days)}
      <div class="scroll" data-scroller style="flex:1;min-height:0">${this.timeCol(days)}</div></div>`;
  },
  timeCol(days) {
    const { H0, H1, ROW } = this;
    const hours = [];
    for (let h = H0; h <= H1; h++) hours.push(h);
    const label = h => `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`;
    const now = new Date();
    const nowMins = now.getHours() * 60 + now.getMinutes();
    return `<div class="cal-time">
      <div class="gut">${hours.map(h => `<div style="height:${ROW}px">${label(h)}</div>`).join('')}</div>
      ${days.map(d => {
      const { timed, allDay } = this.layout(evOn(d.getFullYear(), d.getMonth(), d.getDate()));
      const isToday = d.toDateString() === now.toDateString();
      void allDay; /* drawn in the band above, not in the hour grid */
      return `<div class="col${isToday ? ' today' : ''}" data-y="${d.getFullYear()}" data-m="${d.getMonth()}" data-d="${d.getDate()}">
          ${hours.map(() => `<div class="hr" style="height:${ROW}px"></div>`).join('')}
          ${timed.map(e => {
        const top = (e.s / 60 - H0) * ROW;
        const h = Math.max(17, (e.dur || 60) / 60 * ROW - 2);
        return `<div class="ev" data-ev="${e.id}" style="top:${top}px;height:${h}px;left:${e._x}%;width:calc(${e._w}% - 4px);background:${e.c}">
              <b>${esc(e.t)}</b><span>${e.at}${e.loc ? ' · ' + esc(e.loc) : ''}</span></div>`;
      }).join('')}
          ${isToday ? `<div class="cal-now" style="top:${(nowMins / 60 - H0) * ROW}px"></div>` : ''}
        </div>`;
    }).join('')}
    </div>`;
  },

  renderDay(w) {
    const { y, m } = w.st, d = new Date(y, m, w.st.day || 1);
    w.node.querySelector('[data-mon]').textContent = `${DAYS[d.getDay()]}, ${MONS[m]} ${d.getDate()}, ${y}`;
    w.node.querySelector('[data-dows]').innerHTML = `<div style="flex:1;text-align:left;padding-left:64px">${DAYS[d.getDay()]} ${d.getDate()}</div>`;
    w.node.querySelector('[data-grid]').outerHTML = this.gridHTML([d]);
    this.scrollToHour(w);
    this.side(w);
  },

  /* Open on the working day, and follow the clock once it's past mid-morning. The
     clamp is what stops a 2am visit from landing on an empty stretch of night. */
  scrollToHour(w) {
    const grid = w.node.querySelector('[data-scroller]');
    if (!grid) return;
    const now = new Date();
    const shown = new Date(w.st.y, w.st.m, w.st.day || 1);
    const anchor = shown.toDateString() === now.toDateString()
      ? clamp(now.getHours() - 2, 7, 16) : 7;
    grid.scrollTop = (anchor - this.H0) * this.ROW;
  },

  renderWeek(w) {
    const { y, m } = w.st, base = new Date(y, m, w.st.day || 1);
    const start = new Date(base); start.setDate(base.getDate() - base.getDay());
    const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
    const a = days[0], b = days[6];
    w.node.querySelector('[data-mon]').textContent = a.getMonth() === b.getMonth()
      ? `${MONS[a.getMonth()]} ${a.getDate()} – ${b.getDate()}, ${b.getFullYear()}`
      : `${MONS3[a.getMonth()]} ${a.getDate()} – ${MONS3[b.getMonth()]} ${b.getDate()}, ${b.getFullYear()}`;
    w.node.querySelector('[data-dows]').innerHTML =
      `<div style="width:52px;flex:none"></div>` + days.map(d =>
        `<div${d.toDateString() === new Date().toDateString() ? ' style="color:var(--blue);font-weight:650"' : ''}>${DAYS3[d.getDay()]} ${d.getDate()}</div>`).join('');
    w.node.querySelector('[data-grid]').outerHTML = this.gridHTML(days);
    this.scrollToHour(w);
    this.side(w);
  },

  renderYear(w) {
    const { y } = w.st, now = new Date();
    w.node.querySelector('[data-mon]').textContent = String(y);
    w.node.querySelector('[data-dows]').innerHTML = '';
    w.node.querySelector('[data-grid]').outerHTML = `<div class="cal-grid scroll cal-year" data-grid>
      ${MONS.map((name, mi) => {
      const first = new Date(y, mi, 1).getDay(), dim = new Date(y, mi + 1, 0).getDate();
      let cells = '';
      for (let i = 0; i < first; i++) cells += `<i></i>`;
      for (let d = 1; d <= dim; d++) {
        const t = d === now.getDate() && mi === now.getMonth() && y === now.getFullYear();
        const has = evOn(y, mi, d).length;
        cells += `<i class="${t ? 'today' : has ? 'has' : ''}">${d}</i>`;
      }
      return `<div class="ym" data-ym="${mi}"><div class="mh">${name}</div>
        <div class="mg">${['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(s => `<span>${s}</span>`).join('')}${cells}</div></div>`;
    }).join('')}</div>`;
    this.side(w);
  },

  renderMonth(w) {
    w = w || this.w; if (!w) return;
    const { y, m } = w.st, now = new Date();
    w.node.querySelector('[data-mon]').textContent = `${MONS[m]} ${y}`;
    w.node.querySelector('[data-dows]').innerHTML = DAYS3.map(d => `<div>${d}</div>`).join('');
    const gridNode = w.node.querySelector('[data-grid]');
    gridNode.outerHTML = `<div class="cal-grid" data-grid></div>`;
    const first = new Date(y, m, 1).getDay();
    const dim = new Date(y, m + 1, 0).getDate();
    const pdim = new Date(y, m, 0).getDate();
    const cells = [];
    for (let i = 0; i < first; i++) cells.push({ d: pdim - first + 1 + i, out: true, y: m === 0 ? y - 1 : y, m: (m + 11) % 12 });
    for (let d = 1; d <= dim; d++) cells.push({ d, y, m });
    while (cells.length % 7) cells.push({ d: cells.length - first - dim + 1, out: true, y: m === 11 ? y + 1 : y, m: (m + 1) % 12 });
    while (cells.length < 35) cells.push({ d: cells.length - first - dim + 1, out: true, y: m === 11 ? y + 1 : y, m: (m + 1) % 12 });

    w.node.querySelector('[data-grid]').innerHTML = cells.map(c => {
      const isToday = !c.out && c.d === now.getDate() && c.m === now.getMonth() && c.y === now.getFullYear();
      const evs = evOn(c.y, c.m, c.d);
      return `<div class="cal-cell${c.out ? ' out' : ''}${isToday ? ' today' : ''}" data-y="${c.y}" data-m="${c.m}" data-d="${c.d}">
        <span class="d">${c.d}</span>
        ${evs.slice(0, 3).map(e => `<div class="cal-ev${e.s == null ? ' allday' : ''}" data-ev="${e.id}" style="background:${e.c}" title="${esc(e.t)} · ${e.at}">${esc(e.t)}</div>`).join('')}
        ${evs.length > 3 ? `<div class="cal-more">${evs.length - 3} more</div>` : ''}
      </div>`;
    }).join('');
    this.side(w);
  },
  miniHTML(y, m) {
    const now = new Date();
    const first = new Date(y, m, 1).getDay(), dim = new Date(y, m + 1, 0).getDate();
    let cells = '';
    for (let i = 0; i < first; i++) cells += `<i class="out"></i>`;
    for (let d = 1; d <= dim; d++) {
      const t = d === now.getDate() && m === now.getMonth() && y === now.getFullYear();
      cells += `<i class="${t ? 'today' : ''}">${d}</i>`;
    }
    return `<div class="mini"><div class="mh"><span>${MONS[m]} ${y}</span></div>
      <div class="mg">${['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(d => `<span>${d}</span>`).join('')}${cells}</div></div>`;
  }
};

/* ============================================================================
   17 · SAFARI
   ========================================================================== */
/* Pages served from inside the file. Everything else goes to the network. */
const SITES = {
  'apple.com': {
    title: 'Apple', fav: '#111',
    html: `<div class="site light">
      <div class="avatar" style="background:#1d1d1f">${ic('g-apple')}</div>
      <h1 style="font-size:34px">macOS Tahoe 26</h1><p class="role">Liquid Glass. Everywhere.</p>
      <div class="links"><a data-goto="en.wikipedia.org/wiki/MacOS">Learn more</a><a data-openext="https://www.apple.com/macos/">Open apple.com</a></div>
      <div class="foot">Copyright © 2026 Apple Inc. All rights reserved.</div></div>`
  },
};
/* Just enough Markdown to read an article. The extractor's output is predictable,
   so this stays deliberately small — and every link is rewritten to navigate
   inside this browser instead of leaving the page. */
function mdInline(s) {
  return esc(s)
    .replace(/!\[(?:Image \d+:\s*)?([^\]]*)\]\(([^)\s]+)[^)]*\)/g,
      (m, a, u) => /^https?:/.test(u) ? `<img src="${u}" alt="${a}" loading="lazy">` : '')
    /* Link text that is itself a URL means an icon or vote arrow the extractor
       couldn't name — printing it just fills the page with addresses. */
    .replace(/\[([^\]]*)\]\(([^)\s]+)[^)]*\)/g, (m, a, u) => {
      const txt = a.trim();
      if (!/^https?:/.test(u)) return txt;
      if (!txt || /^https?:\/\//.test(txt)) return '';
      return `<a data-goto="${u.replace(/^https?:\/\//, '')}">${txt}</a>`;
    })
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<i>$2</i>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}
function mdHTML(src) {
  /* Listing pages come back as one enormous line with the item numbers inline.
     Long lines get split back into list items; short ones are left alone so
     ordinary prose keeps its decimals. */
  const src2 = src.replace(/\r/g, '').split('\n')
    .map(l => l.length > 140 ? l.replace(/\s(\d{1,3})\.(?!\d)\s*/g, '\n$1. ') : l).join('\n');
  const out = [], lines = src2.split('\n');
  let para = [], list = null, code = null;
  const flushP = () => {
    if (!para.length) return;
    const html = mdInline(para.join(' ').replace(/\s{2,}/g, ' ')).trim();
    if (html) out.push(`<p>${html}</p>`);
    para = [];
  };
  const flushL = () => {
    if (!list) return;
    const items = list.items.map(i => mdInline(i).trim()).filter(Boolean);
    if (items.length) out.push(`<${list.t}>${items.map(i => `<li>${i}</li>`).join('')}</${list.t}>`);
    list = null;
  };
  const flush = () => { flushP(); flushL(); };
  for (const raw of lines) {
    const ln = raw.trimEnd();
    if (code !== null) {
      if (/^```/.test(ln)) { out.push(`<pre><code>${esc(code.join('\n'))}</code></pre>`); code = null; }
      else code.push(raw);
      continue;
    }
    if (/^```/.test(ln)) { flush(); code = []; continue; }
    if (!ln.trim()) { flush(); continue; }
    if (/^(Published Time|URL Source|Warning):/.test(ln)) continue;
    const h = ln.match(/^(#{1,6})\s+(.*)$/);
    if (h) { flush(); const lvl = Math.min(h[1].length + 1, 6); out.push(`<h${lvl}>${mdInline(h[2])}</h${lvl}>`); continue; }
    if (/^([-*_])\1{2,}$/.test(ln.replace(/\s/g, ''))) { flush(); out.push('<hr>'); continue; }
    const li = ln.match(/^\s*(?:[-*+]\s+|\d{1,3}\.(?!\d)\s*)(.*)$/);
    if (li) {
      const t = /^\s*\d/.test(ln) ? 'ol' : 'ul';
      flushP(); if (list && list.t !== t) flushL();
      (list = list || { t, items: [] }).items.push(li[1]);
      continue;
    }
    const q = ln.match(/^>\s?(.*)$/);
    if (q) { flush(); out.push(`<blockquote>${mdInline(q[1])}</blockquote>`); continue; }
    flushL(); para.push(ln.trim());
  }
  if (code) out.push(`<pre><code>${esc(code.join('\n'))}</code></pre>`);
  flush();
  return out.join('\n');
}

/* Whatever the URL bar can't resolve locally is searched for real. */
const WIKI_API = 'https://en.wikipedia.org/w/api.php';
const WIKI_REST = 'https://en.wikipedia.org/api/rest_v1/page/summary/';
/* DuckDuckGo answers 200 even for hosts with no icon, so a missing favicon is a
   decode failure the markup can style around rather than a console error. */
const favicon = host => `https://icons.duckduckgo.com/ip3/${encodeURIComponent(host)}.ico`;

const FAVS = [['Apple', '#1d1d1f'], ['Wikipedia', '#636466'], ['YouTube', '#ff0033'],
['Hacker News', '#ff6600'], ['MDN', '#000'], ['Can I use', '#1d78c1'],
['Internet Archive', '#000'], ['JSFiddle', '#0084ff']];
const FAV_URL = {
  'Apple': 'apple.com', 'Wikipedia': 'en.wikipedia.org/wiki/MacOS',
  'YouTube': 'youtube.com', 'Hacker News': 'news.ycombinator.com',
  'MDN': 'developer.mozilla.org/en-US/docs/Web/CSS/backdrop-filter', 'Can I use': 'caniuse.com',
  'Internet Archive': 'archive.org', 'JSFiddle': 'jsfiddle.net',
};
/* Most recent first, deduplicated — feeds the History menu and the start page. */
const HISTORY = [];
const READING = [
  ['en.wikipedia.org/wiki/Bézier_curve', 'Bézier curve'],
  ['en.wikipedia.org/wiki/Subpixel_rendering', 'Subpixel rendering'],
];

APPS.safari = {
  name: 'Safari', icon: 'app-safari', w: 1020, h: 660, minW: 520, minH: 360, single: false,
  menus: () => stdMenus('safari', {
    File: [{ id: 't', label: 'New Tab', key: '⌘T', run: () => Saf.newTab() },
    { id: 'w', label: 'New Window', key: '⌘N', run: () => WM.open('safari', { force: true }) }, '-',
    { id: 'c', label: 'Close Tab', key: '⌘W', run: () => Saf.closeTab() }],
    View: [{ id: 'sb', label: (Saf.w && Saf.w.st.sidebar ? 'Hide' : 'Show') + ' Sidebar', key: '⌃⌘S', run: () => Saf.toggleSidebar() },
    { id: 'fb', label: (SYS.safariFavs ? 'Hide' : 'Show') + ' Favourites Bar', key: '⇧⌘B', run: () => Saf.toggleFavBar() }, '-',
    { id: 'r', label: 'Reload Page', key: '⌘R', run: () => Saf.reload() }],
    History: [{ id: 'b', label: 'Back', key: '⌘[', run: () => Saf.back() }, { id: 'f', label: 'Forward', key: '⌘]', run: () => Saf.fwd() }, '-',
    ...(HISTORY.length ? HISTORY.slice(0, 8).map((u, i) => ({ id: 'h' + i, label: Saf.titleFor(u), run: () => Saf.go(u) }))
      : [{ id: 'h', label: 'No history yet', disabled: true }])],
    Bookmarks: FAVS.map(([n]) => ({ id: n, label: n, run: () => Saf.go(FAV_URL[n]) })),
  }, ['File', 'Edit', 'View', 'History', 'Bookmarks', 'Window', 'Help']),
  mount(w) {
    w.st = { tabs: [{ url: '', hist: [''], hi: 0 }], t: 0, sidebar: false };
    return `<div class="sf" data-sf>
      <div class="sf-top" data-drag>
        <div class="sf-r1">
          <div class="sf-l">
            <div data-tl></div><div style="width:8px"></div>
            <button class="tbtn" data-nodrag data-sb title="Sidebar">${ic('g-sidebar')}</button>
            <div class="sf-sep"></div>
            <button class="tbtn" data-nodrag data-back title="Back">${ic('g-chev-l')}</button>
            <button class="tbtn" data-nodrag data-fwd title="Forward">${ic('g-chev-r')}</button>
          </div>
          <div class="sf-url" data-nodrag>
            <button class="tbtn rd" data-reader title="Show Reader">${ic('g-glasses')}</button>
            <span data-urlico>${ic('g-search')}</span>
            <input data-url spellcheck="false" autocomplete="off" placeholder="Search or enter website name">
            <button class="tbtn" data-reload style="min-width:20px;height:20px" title="Reload">${ic('g-reload')}</button>
          </div>
          <div class="sf-r">
            <button class="tbtn" data-nodrag data-share title="Share">${ic('g-share')}</button>
            <button class="tbtn" data-nodrag data-overview title="Show Tab Overview">${ic('g-grid')}</button>
            <button class="tbtn" data-nodrag data-newtab title="New Tab">${ic('g-plus')}</button>
          </div>
        </div>
        <div class="sf-tabs" data-tabs></div>
        <div class="sf-fav" data-nodrag data-favbar></div>
      </div>
      <div class="sf-body">
        <div class="sf-side" data-side></div>
        <div class="sf-page scroll" data-page><div class="sf-prog" data-prog></div></div>
      </div>
    </div>`;
  },
  ready(w) {
    Saf.w = w;
    const url = w.node.querySelector('[data-url]');
    on(w.node, 'click', '[data-back]', () => Saf.back(w));
    on(w.node, 'click', '[data-fwd]', () => Saf.fwd(w));
    on(w.node, 'click', '[data-reload]', () => Saf.reload(w));
    on(w.node, 'click', '[data-newtab]', () => Saf.newTab(w));
    on(w.node, 'click', '[data-share]', () => Saf.share(w));
    on(w.node, 'click', '[data-tryframe]', (e, t) => {
      const page = w.node.querySelector('[data-page]');
      page.innerHTML = `<div class="sf-prog" data-prog></div>` + Saf.framePage(t.dataset.tryframe, true);
    });
    on(w.node, 'click', '[data-overview]', () => Saf.overview(w));
    on(w.node, 'click', '[data-sb]', () => Saf.toggleSidebar(w));
    on(w.node, 'click', '[data-reader]', () => Saf.toggleReader(w));
    on(w.node, 'click', '[data-fav]', (e, t) => Saf.go(FAV_URL[t.dataset.fav] || t.dataset.fav, w));
    on(w.node, 'click', '.sf-tab', (e, t) => { if (e.target.closest('.x')) return; w.st.t = +t.dataset.i; Saf.render(w); });
    on(w.node, 'click', '.sf-tab .x', (e, t) => { e.stopPropagation(); Saf.closeTab(w, +t.closest('.sf-tab').dataset.i); });
    url.addEventListener('focus', () => url.select());
    url.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); url.blur(); Saf.go(url.value.trim(), w); }
      if (e.key === 'Escape') { url.blur(); Saf.render(w); }
    });
    Saf.render(w);
  }
};

const Saf = {
  w: null,
  tab(w) { w = w || this.w; return w.st.tabs[w.st.t]; },
  site(url) {
    const clean = url.replace(/^https?:\/\//, '').replace(/\/$/, '');
    return SITES[clean] || null;
  },
  /* Classify what the user typed. Anything with a dot and no spaces is treated as
     an address; everything else is a search, same as the real omnibar. */
  kind(url) {
    const u = url.replace(/^https?:\/\//, '');
    if (!u.trim()) return 'start';
    if (SITES[u.replace(/\/$/, '')]) return 'local';
    if (/^en\.wikipedia\.org\/wiki\//.test(u)) return 'wiki';
    if (/(^|\.)youtube\.com\/watch\?v=|(^|\.)youtu\.be\//.test(u)) return 'video';
    if (/^[^\s/]+\.[a-z]{2,}(\/|$|\?)/i.test(u)) return 'web';
    return 'search';
  },
  host(url) { return url.replace(/^https?:\/\//, '').split('/')[0]; },
  /* Titles have to be known before content arrives, or the tab strip flickers. */
  titleFor(url) {
    const k = this.kind(url), u = url.replace(/^https?:\/\//, '').replace(/\/$/, '');
    if (k === 'start') return 'Start Page';
    if (k === 'local') return SITES[u].title;
    if (k === 'wiki') return decodeURIComponent(u.split('/wiki/')[1] || '').replace(/_/g, ' ') + ' — Wikipedia';
    if (k === 'search') return `${url} — Search`;
    return this.host(url);
  },
  favFor(url) {
    const k = this.kind(url), u = url.replace(/^https?:\/\//, '').replace(/\/$/, '');
    if (k === 'local') return SITES[u].fav;
    if (k === 'search' || k === 'start') return '#8e8e93';
    return null;                                  // real favicon, fetched
  },

  /* Chrome that lives outside the page: tab strip, favourites bar, sidebar. */
  paintChrome(w) {
    const st = w.st, t = this.tab(w), k = this.kind(t.url);
    w.node.querySelector('[data-url]').value = k === 'start' ? '' : t.url;
    w.node.querySelector('[data-urlico]').innerHTML = ic(k === 'start' || k === 'search' ? 'g-search' : 'g-lock');
    const rd = w.node.querySelector('[data-reader]');
    rd.classList.toggle('show', k === 'web');
    rd.classList.toggle('on', k === 'web' && (t.reader === true || (t.reader == null && !this.framable(t.url))));
    w.node.querySelector('[data-back]').classList.toggle('dis', t.hi <= 0);
    w.node.querySelector('[data-fwd]').classList.toggle('dis', t.hi >= t.hist.length - 1);
    w.node.querySelector('[data-sb]').classList.toggle('on', st.sidebar);
    w.node.querySelector('[data-sf]').classList.toggle('sb', st.sidebar);
    /* A lone tab needs no strip; the empty container collapses itself. */
    w.node.querySelector('[data-tabs]').innerHTML = st.tabs.length < 2 ? '' : st.tabs.map((tb, i) =>
      `<div class="sf-tab${i === st.t ? ' on' : ''}" data-i="${i}">
        <span class="x">${ic('g-x')}</span>
        <span class="mid">${this.favHTML(tb.url)}<span class="nm">${esc(this.titleFor(tb.url))}</span></span></div>`
    ).join('');
    w.node.querySelector('[data-favbar]').innerHTML = SYS.safariFavs
      ? FAVS.map(([n, c]) => `<a data-fav="${esc(n)}"><i style="background:${c}"></i>${esc(n)}</a>`).join('') : '';
    w.node.querySelector('[data-side]').innerHTML = st.sidebar ? this.sideHTML(t.url) : '';
  },
  favHTML(url, size = 14) {
    const c = this.favFor(url);
    return c ? `<span class="fav" style="background:${c};width:${size}px;height:${size}px"></span>`
      : `<img class="fav" src="${favicon(this.host(url))}" alt="" onerror="this.style.visibility='hidden'"
          style="width:${size}px;height:${size}px;border-radius:3px">`;
  },
  sideHTML(cur) {
    const row = (u, label, icon) => `<div class="si${u === cur ? ' on' : ''}" data-goto="${esc(u)}">
      ${icon || this.favHTML(u, 16)}<span class="nm">${esc(label)}</span></div>`;
    return `<div class="in">
      <div class="grp"><div class="gh">Favourites</div>${FAVS.map(([n]) => row(FAV_URL[n], n)).join('')}</div>
      <div class="grp"><div class="gh">Reading List</div>${READING.map(([u, n]) => row(u, n, ic('g-glasses', 'ico'))).join('')}</div>
    </div>`;
  },
  /* Safari's start page: favourites as tiles, then whatever you've actually opened. */
  startHTML() {
    const tile = (u, label, dot) => `<a class="sf-tile" data-goto="${esc(u)}">
      <span class="sq">${dot ? `<i style="background:${dot}">${esc((label[0] || '?').toUpperCase())}</i>`
        : `<img src="${favicon(this.host(u))}" alt="" onerror="this.replaceWith(Object.assign(document.createElement('i'),{textContent:'${esc((label[0] || '?').toUpperCase())}',style:'background:#8e8e93'}))">`}</span>
      <span>${esc(label)}</span></a>`;
    const recent = HISTORY.filter(u => this.kind(u) !== 'start').slice(0, 8);
    return `<div class="sf-start">
      <h2>Favourites</h2>
      <div class="sf-grid">${FAVS.map(([n, c]) => tile(FAV_URL[n], n, SITES[FAV_URL[n]] ? c : null)).join('')}</div>
      ${recent.length ? `<h2>Frequently Visited</h2>
        <div class="sf-grid">${recent.map(u => tile(u, this.titleFor(u).split(' — ')[0], this.favFor(u))).join('')}</div>` : ''}
      <div class="sf-priv">${ic('g-shield')}<div><b>Privacy Report</b> · ${9 + (HISTORY.length % 7)} trackers prevented from profiling you</div></div>
    </div>`;
  },

  render(w) {
    w = w || this.w; if (!w) return;
    const t = this.tab(w);
    this.paintChrome(w);
    w.title = this.titleFor(t.url);
    const tt = w.node.querySelector('.tb .title'); if (tt) tt.textContent = w.title;

    const page = w.node.querySelector('[data-page]');
    page.innerHTML = `<div class="sf-prog" data-prog></div>`;
    page.dataset.kind = this.kind(t.url);
    const prog = page.querySelector('[data-prog]');
    prog.classList.add('on'); prog.style.width = '18%';
    raf(() => raf(() => { prog.style.width = '72%'; }));

    /* Every navigation gets a token; a slow fetch that lands after the user has
       moved on must not paint over the newer page. */
    const token = (w.nav = (w.nav || 0) + 1);
    const finish = html => {
      if (w.dead || w.nav !== token) return;
      page.innerHTML = `<div class="sf-prog on" data-prog style="width:100%"></div>` + html;
      setTimeout(() => { const p = page.querySelector('[data-prog]'); if (p) p.classList.remove('on'); }, 260);
    };
    this.paint(t.url, finish, w);
  },

  /* Resolves a URL to markup, hitting the network when it has to. */
  paint(url, done, w) {
    const k = this.kind(url), u = url.replace(/^https?:\/\//, '').replace(/\/$/, '');
    if (k === 'start') return done(this.startHTML());
    if (k === 'local') return done(SITES[u].html);
    if (k === 'wiki') return this.paintWiki(decodeURIComponent(u.split('/wiki/')[1] || 'MacOS'), done);
    if (k === 'search') return this.paintSearch(url, done);
    if (k === 'video') {
      const id = (u.match(/[?&]v=([\w-]{6,})/) || u.match(/youtu\.be\/([\w-]{6,})/) || [])[1];
      /* YouTube rejects players whose embedder has no origin, which is every page
         opened straight off the disk. Served over http it plays for real, so say
         which situation you're in rather than showing their error 153. */
      if (id && location.protocol === 'file:') return done(`<div class="sf-blocked">
        <div class="ico"><img src="${favicon('youtube.com')}" alt="" onerror="this.style.display='none'"></div>
        <h3>Embeds need a real origin</h3>
        <p>YouTube won't embed into a page opened from the filesystem. Served over http it plays here.</p>
        <div style="display:flex;gap:9px;margin-top:6px">
          <button class="btn pri" data-openext="https://www.youtube.com/watch?v=${esc(id)}">Watch on YouTube</button>
          <button class="btn" data-tryframe="youtube.com/embed/${esc(id)}">Try Anyway</button>
        </div></div>`);
      if (id) return done(`<iframe class="sf-frame" src="https://www.youtube.com/embed/${id}?autoplay=0&rel=0"
        allow="accelerometer;autoplay;clipboard-write;encrypted-media;gyroscope;picture-in-picture"
        allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>`);
    }
    /* Embeddable hosts get a real frame; everything else is read for real
       through the extractor, which is what Reader does anyway. */
    const t = w && this.tab(w);
    if (t && t.reader === true) return this.paintReader(url, done);
    const frame = this.framePage(url, !!(t && t.reader === false));
    return frame ? done(frame) : this.paintReader(url, done);
  },

  /* A page served from a file:// document can't tell a refused frame from a real
     one — both fire load, and both refuse DOM access because the parent origin is
     opaque. So instead of guessing wrong, hosts known to allow embedding are framed
     straight away and the rest are read as text. */
  framable(url) {
    const h = this.host(url).replace(/^www\./, '');
    return /(^|\.)(example\.(com|org)|youtube(-nocookie)?\.com|youtu\.be|player\.vimeo\.com|jsfiddle\.net|archive\.org|wikipedia\.org|github\.io|caniuse\.com)$/.test(h);
  },

  framePage(url, force) {
    if (!force && !this.framable(url)) return null;
    const src = /^https?:\/\//.test(url) ? url : 'https://' + url;
    return `<iframe class="sf-frame" src="${esc(src)}" referrerpolicy="no-referrer"
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups"></iframe>`;
  },

  /* Reader. A CORS-enabled extractor hands back the article as Markdown, which
     renders here as type — no frame, so no X-Frame-Options to argue with. */
  reader: 'https://r.jina.ai/',
  async paintReader(url, done) {
    done(`<div class="sf-load"><div class="sf-spin"></div></div>`);
    const full = /^https?:\/\//.test(url) ? url : 'https://' + url;
    const ac = new AbortController(), kill = setTimeout(() => ac.abort(), 15000);
    try {
      const r = await fetch(this.reader + full, { signal: ac.signal, referrerPolicy: 'no-referrer' });
      if (!r.ok) throw new Error(r.status);
      const raw = await r.text();
      clearTimeout(kill);
      const title = ((raw.match(/^Title:\s*(.*)$/m) || [])[1] || this.host(url)).trim();
      const body = raw.split(/^Markdown Content:\s*$/m).slice(1).join('\n') || raw;
      const html = mdHTML(body.trim());
      if (html.replace(/<[^>]*>/g, '').trim().length < 40) throw new Error('empty');
      done(`<div class="rdr">
        <h1>${esc(title)}</h1>
        <div class="meta">${this.favHTML(url, 15)}<span>${esc(this.host(url))}</span></div>
        <div class="body">${html}</div>
        <div class="foot">
          <button class="btn" data-tryframe="${esc(url)}">Load the live page</button>
          <button class="btn" data-openext="${esc(full)}">Open in New Window</button>
        </div></div>`);
    } catch (e) {
      clearTimeout(kill);
      done(this.blockedPage(url));
    }
  },

  blockedPage(url) {
    const h = this.host(url);
    return `<div class="sf-blocked">
      <div class="ico"><img src="${favicon(h)}" alt="" onerror="this.style.display='none'"></div>
      <h3>Can't open ${esc(h)}</h3>
      <p>This site refuses to be embedded and couldn't be read as text either.</p>
      <div style="display:flex;gap:9px;margin-top:6px">
        <button class="btn pri" data-tryframe="${esc(url)}">Load Anyway</button>
        <button class="btn" data-openext="${esc(/^https?:/.test(url) ? url : 'https://' + url)}">Open in New Window</button>
      </div></div>`;
  },

  async paintSearch(q, done) {
    done(`<div class="sf-load"><div class="sf-spin"></div></div>`);
    try {
      const r = await fetch(`${WIKI_API}?action=query&list=search&srsearch=${encodeURIComponent(q)}` +
        `&srlimit=8&format=json&origin=*`, { referrerPolicy: 'no-referrer' });
      const j = await r.json();
      const hits = (j.query && j.query.search) || [];
      if (!hits.length) throw new Error('empty');
      done(`<div class="srch"><h2>${esc(q)}</h2>
        <div class="q">${hits.length} results</div>
        <div class="res">${hits.map(h => {
        const slug = h.title.replace(/ /g, '_');
        return `<a data-goto="en.wikipedia.org/wiki/${encodeURIComponent(slug)}">
            <div class="u">en.wikipedia.org › wiki › ${esc(slug)}</div>
            <div class="t">${esc(h.title)}</div>
            <div class="d">${h.snippet}</div></a>`;
      }).join('')}</div></div>`);
    } catch (e) {
      done(this.offlineSearch(q));
    }
  },

  async paintWiki(title, done) {
    done(`<div class="sf-load"><div class="sf-spin"></div></div>`);
    try {
      const [sum, body] = await Promise.all([
        fetch(WIKI_REST + encodeURIComponent(title), { referrerPolicy: 'no-referrer' }).then(r => r.json()),
        fetch(`${WIKI_API}?action=parse&page=${encodeURIComponent(title)}&prop=text&section=0` +
          `&format=json&origin=*`, { referrerPolicy: 'no-referrer' }).then(r => r.json()).catch(() => null),
      ]);
      if (sum.type === 'https://mediawiki.org/wiki/HyperSwitch/errors/not_found') throw new Error('404');
      let lead = '';
      if (body && body.parse && body.parse.text) {
        const box = document.createElement('div');
        box.innerHTML = body.parse.text['*'];
        box.querySelectorAll('style,script,.mw-editsection,.reference,sup.reference,.hatnote,.navbox,table,figure,.thumb')
          .forEach(n => n.remove());
        /* Internal links keep working, but inside this browser. */
        box.querySelectorAll('a[href^="/wiki/"]').forEach(a => {
          a.setAttribute('data-goto', 'en.wikipedia.org' + a.getAttribute('href'));
          a.removeAttribute('href');
        });
        box.querySelectorAll('a[href]').forEach(a => a.removeAttribute('href'));
        /* MediaWiki emits protocol-relative sources, which resolve against file://
           and fail. Pin them to https and drop the responsive set. */
        box.querySelectorAll('img').forEach(im => {
          const s = im.getAttribute('src') || '';
          if (s.startsWith('//')) im.setAttribute('src', 'https:' + s);
          im.removeAttribute('srcset');
        });
        lead = box.innerHTML;
      }
      /* Articles carry a display title — macOS, not MacOS. */
      const shown = ((sum.titles && sum.titles.display) || sum.title || title).replace(/<[^>]+>/g, '');
      done(`<div class="wiki">
        <h1>${esc(shown)}</h1>
        ${sum.description ? `<p class="desc">${esc(sum.description)}</p>` : ''}
        <div class="lead">
          ${/* The parsed lead is the real article text; the summary extract is only
                a fallback, and printing both repeats the same paragraph twice. */''}
          <div class="body">${lead || `<p>${esc(sum.extract || '')}</p>`}</div>
          ${sum.thumbnail ? `<div class="thumb"><img src="${esc(sum.thumbnail.source)}" alt=""
            onerror="this.closest('.thumb').remove()"></div>` : ''}
        </div>
        <div class="foot">Text is available under CC BY-SA 4.0.</div>
      </div>`);
    } catch (e) {
      done(`<div class="sf-blocked"><div class="ico">${ic('g-globe')}</div>
        <h3>Couldn't reach Wikipedia</h3>
        <p>No network, or that article doesn't exist.</p>
        <button class="btn pri" data-goto="">Start Page</button></div>`);
    }
  },
  overview(w) {
    w = w || this.w; if (!w) return;
    const r = w.node.getBoundingClientRect();
    const node = el(`<div class="pop" style="width:min(560px,${Math.round(r.width - 40)}px);padding:14px">
      <div style="font-size:12px;font-weight:600;color:var(--txt-2);padding:0 2px 10px">${w.st.tabs.length} Tab${w.st.tabs.length > 1 ? 's' : ''}</div>
      <div class="sf-ov">${w.st.tabs.map((tb, i) => {
      const c = this.favFor(tb.url), title = this.titleFor(tb.url);
      return `<button data-ovi="${i}"${i === w.st.t ? ' class="on"' : ''}>
          <span class="pv">${esc(title[0] || '?')}</span>
          <span class="lb">${c ? `<i style="background:${c}"></i>`
        : `<img src="${favicon(this.host(tb.url))}" alt="" onerror="this.style.visibility='hidden'"
            style="width:12px;height:12px;border-radius:3px;flex:none">`}${esc(title)}</span></button>`;
    }).join('')}
      <button data-ovnew><span class="pv add">${ic('g-plus')}</span><span class="lb">New Tab</span></button></div></div>`);
    on(node, 'click', '[data-ovi]', (e, t) => { w.st.t = +t.dataset.ovi; Pop.close(); this.render(w); });
    on(node, 'click', '[data-ovnew]', () => { Pop.close(); this.newTab(w); });
    Pop.open(node, { x: r.left + 20, y: r.top + 70, origin: 'top' });
  },
  /* Used when the search API can't be reached, so the browser still answers. */
  offlineSearch(q) {
    const hits = [
      { u: 'en.wikipedia.org/wiki/MacOS', t: 'macOS — Wikipedia', d: 'A Unix operating system developed and marketed by Apple since 2001.' },
      { u: 'caniuse.com', t: 'Can I use — Support tables for HTML5, CSS3, etc', d: 'Browser support tables for modern web technologies.' },
      { u: 'developer.mozilla.org/en-US/docs/Web/CSS/backdrop-filter', t: 'backdrop-filter — CSS | MDN', d: 'Applies graphical effects such as blur to the area behind an element.' },
      { u: 'example.com', t: 'Example Domain', d: 'This domain is for use in illustrative examples in documents.' },
    ];
    return `<div class="srch"><h2>${esc(q)}</h2>
      <div class="q">Offline — showing local results</div>
      <div class="res">${hits.map(h => `<a data-goto="${esc(h.u)}"><div class="u">${esc(h.u)}</div><div class="t">${esc(h.t)}</div><div class="d">${esc(h.d)}</div></a>`).join('')}</div></div>`;
  },
  go(url, w) {
    w = w || this.w; if (!w) return;
    if (url == null) return;
    const t = this.tab(w);
    t.hist = t.hist.slice(0, t.hi + 1);
    t.url = url; t.reader = null; t.hist.push(url); t.hi = t.hist.length - 1;
    if (url.trim()) {
      const at = HISTORY.indexOf(url);
      if (at >= 0) HISTORY.splice(at, 1);
      HISTORY.unshift(url);
      HISTORY.length = Math.min(HISTORY.length, 24);
    }
    this.render(w);
  },
  toggleSidebar(w) {
    w = w || this.w; if (!w) return;
    w.st.sidebar = !w.st.sidebar;
    this.paintChrome(w);
  },
  toggleFavBar(w) {
    SYS.safariFavs = !SYS.safariFavs;
    WM.byApp('safari').forEach(x => this.paintChrome(x));
    Toast(SYS.safariFavs ? 'Favourites bar shown' : 'Favourites bar hidden');
  },
  toggleReader(w) {
    w = w || this.w; if (!w) return;
    const t = this.tab(w);
    if (this.kind(t.url) !== 'web') return Toast('Reader isn’t available on this page');
    t.reader = !(t.reader === true || (t.reader == null && !this.framable(t.url)));
    this.render(w);
  },
  share(w) {
    w = w || this.w;
    const url = w ? this.tab(w).url : '';
    if (navigator.clipboard && url) navigator.clipboard.writeText(/^https?:/.test(url) ? url : 'https://' + url).catch(() => { });
    Toast(url ? 'Copied link to clipboard' : 'Nothing to share');
  },
  back(w) { w = w || this.w; const t = this.tab(w); if (t.hi > 0) { t.hi--; t.url = t.hist[t.hi]; t.reader = null; this.render(w); } },
  fwd(w) { w = w || this.w; const t = this.tab(w); if (t.hi < t.hist.length - 1) { t.hi++; t.url = t.hist[t.hi]; t.reader = null; this.render(w); } },
  reload(w) { this.render(w || this.w); },
  newTab(w) {
    w = w || this.w; if (!w) return WM.open('safari');
    w.st.tabs.push({ url: '', hist: [''], hi: 0 });
    w.st.t = w.st.tabs.length - 1; this.render(w);
    const u = w.node.querySelector('[data-url]'); if (u) u.focus();
  },
  closeTab(w, i) {
    w = w || this.w; if (!w) return;
    if (i == null) i = w.st.t;
    if (w.st.tabs.length === 1) return WM.close(w.id);
    w.st.tabs.splice(i, 1); w.st.t = clamp(w.st.t, 0, w.st.tabs.length - 1); this.render(w);
  }
};
document.addEventListener('click', e => {
  const g = e.target.closest('[data-goto]');
  if (g) {
    e.preventDefault();
    /* A link inside a window navigates that window, not whichever Safari was
       focused last — two open browsers otherwise fight over each other. */
    const host = g.closest('.win');
    const w = host && WM.list.find(x => x.node === host && x.app === 'safari');
    return Saf.go(g.dataset.goto, w || undefined);
  }
  /* The only place this desktop hands off to the real browser. */
  const x = e.target.closest('[data-openext]');
  if (x) { e.preventDefault(); window.open(x.dataset.openext, '_blank', 'noopener'); }
});

/* ============================================================================
   18 · MUSIC
   ========================================================================== */
const ART = [
  { g: ['#ff6b8b', '#7c3aed'], s: 'circles' }, { g: ['#12c2e9', '#0b4f8a'], s: 'waves' },
  { g: ['#f9d423', '#e65c00'], s: 'sun' }, { g: ['#141e30', '#243b55'], s: 'bars' },
  { g: ['#43e97b', '#087f5b'], s: 'diag' }, { g: ['#f5f0e6', '#c0a880'], s: 'halftone' },
  { g: ['#0f0f12', '#3a3a45'], s: 'peaks' }, { g: ['#ff9a44', '#fc6076'], s: 'sun' },
  { g: ['#2b1055', '#7597de'], s: 'peaks' }, { g: ['#e0e5ec', '#9aa5b1'], s: 'arch' },
  { g: ['#00b4db', '#003357'], s: 'waves' }, { g: ['#ee0979', '#ff6a00'], s: 'diag' },
];
function albumArt(i) {
  const a = ART[i % ART.length], id = 'ag' + i;
  const shapes = {
    circles: `<circle cx="50" cy="42" r="26" fill="rgba(255,255,255,.14)"/><circle cx="50" cy="42" r="17" fill="rgba(255,255,255,.18)"/><circle cx="50" cy="42" r="8" fill="rgba(255,255,255,.85)"/><rect x="18" y="80" width="46" height="4" rx="2" fill="rgba(255,255,255,.5)"/>`,
    waves: `<path d="M0 62c14 0 14-14 28-14s14 14 28 14 14-14 28-14 14 14 28 14v46H0z" fill="rgba(255,255,255,.16)"/><path d="M0 76c14 0 14-12 28-12s14 12 28 12 14-12 28-12 14 12 28 12v34H0z" fill="rgba(255,255,255,.22)"/><rect x="16" y="18" width="34" height="4" rx="2" fill="rgba(255,255,255,.6)"/>`,
    sun: `<circle cx="50" cy="56" r="22" fill="rgba(255,255,255,.9)"/><g stroke="rgba(255,255,255,.55)" stroke-width="3" stroke-linecap="round"><path d="M50 16v12M50 84v12M10 56h12M78 56h12M22 28l8 8M70 76l8 8M78 28l-8 8M30 76l-8 8"/></g>`,
    bars: (() => {
      const h = [34, 58, 22, 74, 46, 88, 30, 62, 40];
      return `<g fill="rgba(255,255,255,.26)">${h.map((v, k) => `<rect x="${10 + k * 9}" y="${94 - v}" width="5.5" height="${v}" rx="2.6"/>`).join('')}</g>
        <rect x="${10 + 5 * 9}" y="${94 - 88}" width="5.5" height="88" rx="2.6" fill="rgba(255,255,255,.9)"/>`;
    })(),
    halftone: `<g fill="rgba(0,0,0,.18)">${[...Array(7)].map((_, r) => [...Array(7)].map((_, c) => {
      const dx = c - 3, dy = r - 3, d = Math.sqrt(dx * dx + dy * dy);
      return `<circle cx="${14 + c * 12}" cy="${14 + r * 12}" r="${(5.4 - d * 1.05).toFixed(2)}"/>`;
    }).join('')).join('')}</g>`,
    diag: `<g stroke="rgba(255,255,255,.2)" stroke-width="7">${[...Array(8)].map((_, k) => `<path d="M${-30 + k * 22} 110L${20 + k * 22} -10"/>`).join('')}</g><circle cx="50" cy="50" r="14" fill="rgba(255,255,255,.9)"/>`,
    arch: `<path d="M26 92V44a24 24 0 0 1 48 0v48z" fill="rgba(255,255,255,.6)"/><path d="M38 92V46a12 12 0 0 1 24 0v46z" fill="rgba(0,0,0,.16)"/><rect x="14" y="92" width="72" height="4" fill="rgba(0,0,0,.2)"/>`,
    peaks: `<path d="M0 74 26 40l17 20 21-30 36 44v26H0z" fill="rgba(255,255,255,.2)"/><path d="M0 86 30 60l20 16 24-14 26 20v18H0z" fill="rgba(255,255,255,.34)"/><circle cx="74" cy="26" r="10" fill="rgba(255,255,255,.85)"/>`,
  }[a.s];
  return `<svg viewBox="0 0 100 100" preserveAspectRatio="none" style="width:100%;height:100%"><defs><linearGradient id="${id}" x1="0" y1="0" x2=".7" y2="1">
    <stop offset="0" stop-color="${a.g[0]}"/><stop offset="1" stop-color="${a.g[1]}"/></linearGradient></defs>
    <rect width="100" height="100" fill="url(#${id})"/>${shapes}</svg>`;
}
const ALBUMS = [
  { t: 'Neon Interiors', a: 'Kaida', y: 2026, n: 9 }, { t: 'Deep Field', a: 'Orbital Fold', y: 2025, n: 11 },
  { t: 'Golden Hour', a: 'The Vireo', y: 2024, n: 8 }, { t: 'Nightgraph', a: 'Sable Court', y: 2026, n: 10 },
  { t: 'Fernlight', a: 'Moss & Marrow', y: 2023, n: 7 }, { t: 'Soft Static', a: 'Lantern Bay', y: 2025, n: 12 },
];
const SONGS = [
  { t: 'Aurora Drift', a: 'Kaida', al: 0, d: 224 }, { t: 'Glass Cathedral', a: 'Kaida', al: 0, d: 191 },
  { t: 'Low Orbit', a: 'Orbital Fold', al: 1, d: 268 }, { t: 'Parallax', a: 'Orbital Fold', al: 1, d: 205 },
  { t: 'Sunbleach', a: 'The Vireo', al: 2, d: 178 }, { t: 'Ochre', a: 'The Vireo', al: 2, d: 243 },
  { t: 'Nightgraph', a: 'Sable Court', al: 3, d: 302 }, { t: 'Velvet Static', a: 'Sable Court', al: 3, d: 216 },
  { t: 'Fernlight', a: 'Moss & Marrow', al: 4, d: 189 }, { t: 'Soft Static', a: 'Lantern Bay', al: 5, d: 231 },
];
const mmss = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/* ---- the sound ------------------------------------------------------------
   Music plays for real. There is no licensable audio to stream from a single
   HTML file, so each track is synthesised: a key, a mode, a tempo and a chord
   progression derived from its index, voiced with pads, bass, plucks and drums.
   Same song, same notes, every time — and the transport reads the audio clock,
   so the scrubber tracks what you are actually hearing.
   -------------------------------------------------------------------------- */
const MODES = {
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  major: [0, 2, 4, 5, 7, 9, 11],
  lydian: [0, 2, 4, 6, 7, 9, 11],
};
const PROGS = [[0, 5, 3, 4], [0, 4, 5, 3], [5, 3, 0, 4], [0, 3, 1, 4]];
const hz = midi => 440 * Math.pow(2, (midi - 69) / 12);

const Synth = {
  ctx: null, master: null, wet: null, timer: null,
  startAt: 0, offset: 0, nextBeat: 0, beat: 0, rec: null,

  /** Built on first play — browsers refuse an AudioContext without a gesture. */
  ensure() {
    if (this.ctx) return this.ctx;
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    const ctx = this.ctx = new C();

    /* A limiter on the end of the chain: pads, bass and drums all land on the same
       downbeat, and without it those peaks are what set the level for everything. */
    const lim = ctx.createDynamicsCompressor();
    lim.threshold.value = -10; lim.knee.value = 6;
    lim.ratio.value = 12; lim.attack.value = .004; lim.release.value = .18;
    lim.connect(ctx.destination);
    this.lim = lim;
    this.master = ctx.createGain();
    this.master.connect(lim);

    /* Reverb from a decaying noise impulse. Two seconds of tail is the difference
       between "synthesiser demo" and "record". */
    const len = Math.floor(ctx.sampleRate * 2.4);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    const verb = ctx.createConvolver(); verb.buffer = ir;
    this.wet = ctx.createGain(); this.wet.gain.value = .34;
    verb.connect(this.wet); this.wet.connect(this.master);
    this.verbIn = verb;

    /* One eighth-note of feedback delay, for the plucks to bounce around in. */
    const dl = ctx.createDelay(1); dl.delayTime.value = .34;
    const fb = ctx.createGain(); fb.gain.value = .3;
    const dw = ctx.createGain(); dw.gain.value = .22;
    dl.connect(fb); fb.connect(dl); dl.connect(dw); dw.connect(this.master);
    this.delayIn = dl;

    this.gain();
    return ctx;
  },
  gain() {
    if (!this.master) return;
    const v = SYS.muted ? 0 : Math.pow(SYS.volume, 1.4) * 1.15;
    this.master.gain.setTargetAtTime(v, this.ctx.currentTime, .04);
  },

  /* Everything musical about a track, from its position in the library. Fixed
     tables rather than randomness, so a song sounds the same on every play. */
  recipe(i) {
    const s = SONGS[i], al = s.al;
    const roots = [57, 55, 60, 53, 58, 62, 56, 59, 61, 54];
    const modeNames = ['minor', 'dorian', 'minor', 'major', 'dorian', 'lydian'];
    const warm = [2, 4, 5].includes(al);
    return {
      root: roots[i % roots.length],
      scale: MODES[modeNames[al % modeNames.length]],
      prog: PROGS[i % PROGS.length],
      bpm: warm ? 72 + (i * 5) % 14 : 88 + (i * 7) % 26,
      drums: !warm,
      /* Warm records get a slower, softer pluck and a wider tail. */
      arpDiv: warm ? 2 : 1,
      verb: warm ? .46 : .3,
      cutoff: warm ? 900 : 1500,
    };
  },
  /** Scale degree → midi note, wrapping into higher octaves past the seventh. */
  note(rec, deg, oct = 0) {
    const sc = rec.scale, n = sc.length;
    const o = Math.floor(deg / n) + oct;
    return rec.root + sc[((deg % n) + n) % n] + 12 * o;
  },

  /* ---- voices ---- */
  env(node, t, a, d, peak) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(.0001, t + a + d);
    node.connect(g);
    return g;
  },
  pad(degs, t, dur) {
    const ctx = this.ctx, rec = this.rec;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = rec.cutoff; lp.Q.value = .7;
    /* The filter drifting open and shut is what stops a held chord going static. */
    lp.frequency.setValueAtTime(rec.cutoff * .7, t);
    lp.frequency.linearRampToValueAtTime(rec.cutoff * 1.25, t + dur * .55);
    lp.frequency.linearRampToValueAtTime(rec.cutoff * .8, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(.1, t + dur * .28);
    g.gain.setValueAtTime(.1, t + dur * .7);
    g.gain.linearRampToValueAtTime(0, t + dur);
    lp.connect(g); g.connect(this.master); g.connect(this.verbIn);
    degs.forEach(deg => {
      [-5, 5].forEach(cents => {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = hz(this.note(rec, deg, 1));
        o.detune.value = cents;
        o.connect(lp); o.start(t); o.stop(t + dur + .05);
      });
    });
  },
  bass(deg, t, dur) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = 'triangle';
    o.frequency.value = hz(this.note(this.rec, deg, -1));
    const sub = ctx.createOscillator(); sub.type = 'sine';
    sub.frequency.value = hz(this.note(this.rec, deg, -2));
    const g = this.env(o, t, .012, dur, .3);
    const g2 = this.env(sub, t, .012, dur, .22);
    g.connect(this.master); g2.connect(this.master);
    o.start(t); o.stop(t + dur + .05); sub.start(t); sub.stop(t + dur + .05);
  },
  pluck(deg, t, vel = 1) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = 'triangle';
    o.frequency.value = hz(this.note(this.rec, deg, 2));
    const g = this.env(o, t, .004, .34, .085 * vel);
    g.connect(this.master); g.connect(this.delayIn); g.connect(this.verbIn);
    o.start(t); o.stop(t + .4);
  },
  kick(t) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(46, t + .11);
    const g = this.env(o, t, .003, .17, .5);
    g.connect(this.master);
    o.start(t); o.stop(t + .22);
  },
  noise(t, dur, freq, peak, type = 'highpass') {
    const ctx = this.ctx;
    const n = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    src.connect(f);
    const g = this.env(f, t, .002, dur, peak);
    g.connect(this.master);
    src.start(t); src.stop(t + dur + .02);
  },

  /* ---- transport ---- */
  /** Web Audio needs notes queued ahead of time; 40ms ticks, 180ms of lookahead. */
  tick() {
    const ctx = this.ctx, rec = this.rec;
    if (!ctx || !rec) return;
    const spb = 60 / rec.bpm / 2;               /* one eighth note */
    while (this.nextBeat < ctx.currentTime + .18) {
      const t = this.nextBeat, b = this.beat;
      const inBar = b % 8, barNo = Math.floor(b / 8);
      const chord = rec.prog[barNo % rec.prog.length];

      if (inBar === 0) this.pad([chord, chord + 2, chord + 4], t, spb * 8 * .98);
      if (inBar === 0 || inBar === 5) this.bass(chord, t, spb * 2.4);
      if (inBar === 3 && !rec.drums) this.bass(chord + 4, t, spb * 1.6);

      /* Rolling arpeggio over the chord tones, one note per eighth (or quarter
         on the warmer records), climbing then falling so it never marches. */
      if (b % rec.arpDiv === 0) {
        const shape = [0, 2, 4, 6, 4, 2, 4, 2];
        const deg = chord + shape[(b / rec.arpDiv | 0) % shape.length];
        this.pluck(deg, t, inBar % 2 ? .72 : 1);
      }
      if (rec.drums) {
        if (inBar === 0 || inBar === 6) this.kick(t);
        if (inBar === 4) this.noise(t, .12, 1900, .16);           /* snare */
        if (inBar % 2 === 1) this.noise(t, .035, 7200, .06);      /* hat */
      }
      this.nextBeat += spb;
      this.beat++;
    }
  },
  start(songIndex, from = 0) {
    const ctx = this.ensure();
    if (!ctx) return false;
    if (ctx.state === 'suspended') ctx.resume();
    this.stop(true);
    this.rec = this.recipe(songIndex);
    this.wet.gain.value = this.rec.verb;
    this.offset = from;
    this.startAt = ctx.currentTime + .06;
    /* Resume mid-song on a bar line so the progression stays intelligible. */
    const spb = 60 / this.rec.bpm / 2;
    this.beat = Math.round(from / spb / 8) * 8;
    this.nextBeat = this.startAt;
    this.offset = this.beat * spb;
    this.gain();
    this.tick();
    this.timer = setInterval(() => this.tick(), 40);
    return true;
  },
  stop(keep) {
    clearInterval(this.timer); this.timer = null;
    if (!keep && this.master && this.ctx) {
      /* Fade rather than cut, or every pause ends in a click. */
      this.master.gain.setTargetAtTime(0, this.ctx.currentTime, .02);
    }
  },
  pos() {
    if (!this.ctx || !this.timer) return null;
    return this.offset + (this.ctx.currentTime - this.startAt);
  },
  get live() { return !!this.timer; },
};
Bus.on('volume', () => Synth.gain());

APPS.music = {
  name: 'Music', icon: 'app-music', w: 1000, h: 640, minW: 620, minH: 400,
  menus: () => stdMenus('music', {
    Controls: [{ id: 'p', label: 'Play', key: '␣', run: () => Mu.toggle() },
    { id: 'n', label: 'Next', key: '⌘→', run: () => Mu.skip(1) },
    { id: 'b', label: 'Previous', key: '⌘←', run: () => Mu.skip(-1) }, '-',
    { id: 's', label: 'Shuffle', key: '⌘S' }, { id: 'r', label: 'Repeat', key: '⌘R' }],
  }, ['File', 'Edit', 'View', 'Controls', 'Window', 'Help']),
  mount(w) {
    w.st = { view: 'Recently Added' };
    const S = [
      { head: 'Apple Music', items: [['Home', 'g-globe'], ['New', 'g-star'], ['Radio', 'g-podcast']] },
      { head: 'Library', items: [['Recently Added', 'g-clock-a'], ['Artists', 'g-contacts2'], ['Albums', 'g-grid'], ['Songs', 'g-list'], ['Made for You', 'g-star']] },
      { head: 'Playlists', items: [['Focus', 'g-list'], ['Late Night', 'g-list'], ['Shipping Music', 'g-list']] },
    ];
    return `<div class="wb col"><div class="mu">
      <div class="mu-top">
        <div class="sbar" data-drag style="width:206px"><div class="sb-top"><div data-tl></div></div>
        ${S.map(g => `<div class="grp"><div class="gh">${g.head}</div>${g.items.map(([n, i]) =>
      `<div class="si" data-mv="${esc(n)}">${ic(i === 'g-podcast' ? 'g-airplay' : i === 'g-contacts2' ? 'g-hand' : i, 'ico')}<span class="nm">${esc(n)}</span></div>`).join('')}</div>`).join('')}
        </div>
        <div class="mu-main">
          <div class="tbar" data-drag style="height:52px;border-bottom:.5px solid var(--line)">
            <button class="tbtn dis" data-nodrag data-mnav="-1" title="Back">${ic('g-chev-l')}</button>
            <button class="tbtn dis" data-nodrag data-mnav="1" title="Forward">${ic('g-chev-r')}</button>
            <div class="grow" style="flex:1"></div>
            <div class="sfield" data-nodrag style="width:180px"><span>${ic('g-search')}</span><input placeholder="Search" data-msearch></div>
          </div>
          <div class="mu-hd"><h2 data-mtitle>Recently Added</h2><span data-mcount></span></div>
          <div data-mbody style="flex:1;display:flex;flex-direction:column;min-height:0"></div>
        </div>
      </div>
      <div class="mu-bar">
        <div class="ctl">
          <button data-c="prev">${ic('g-bwd')}</button>
          <button class="big" data-c="play">${ic('g-play')}</button>
          <button data-c="next">${ic('g-fwd')}</button>
        </div>
        <div class="cv" data-npcv></div>
        <div class="meta"><b data-npt>—</b><span data-npa></span></div>
        <div class="prog"><span class="t" data-cur>0:00</span>
          <div class="sl plain" data-slider="seek"><div class="trk"><div class="fil"></div></div><div class="kn"></div></div>
          <span class="t r" data-dur>0:00</span></div>
        <div class="vol">${ic('g-vol-lo')}<div class="sl" data-slider="mvol"><div class="trk"><div class="fil"></div></div><div class="kn"></div></div></div>
        <button class="tbtn" data-c="shuffle">${ic('g-shuffle')}</button>
        <button class="tbtn" data-c="repeat">${ic('g-repeat')}</button>
      </div>
    </div></div>`;
  },
  ready(w) {
    Mu.w = w;
    /* Sidebar picks push onto a history stack so back/forward mean something. */
    w.st.hist = [w.st.view]; w.st.hi = 0;
    const navBtns = () => {
      w.node.querySelector('[data-mnav="-1"]').classList.toggle('dis', w.st.hi <= 0);
      w.node.querySelector('[data-mnav="1"]').classList.toggle('dis', w.st.hi >= w.st.hist.length - 1);
    };
    on(w.node, 'click', '[data-mv]', (e, t) => {
      w.st.view = t.dataset.mv;
      w.st.hist = w.st.hist.slice(0, w.st.hi + 1); w.st.hist.push(w.st.view); w.st.hi = w.st.hist.length - 1;
      Mu.render(w); navBtns();
    });
    on(w.node, 'click', '[data-mnav]:not(.dis)', (e, t) => {
      w.st.hi = clamp(w.st.hi + +t.dataset.mnav, 0, w.st.hist.length - 1);
      w.st.view = w.st.hist[w.st.hi];
      Mu.render(w); navBtns();
    });
    w.node.querySelector('[data-msearch]').addEventListener('input', e => { w.st.q = e.target.value.trim().toLowerCase(); Mu.render(w); });
    on(w.node, 'click', '[data-c]', (e, t) => {
      const c = t.dataset.c;
      if (c === 'play') Mu.toggle(); if (c === 'next') Mu.skip(1); if (c === 'prev') Mu.skip(-1);
      if (c === 'shuffle' || c === 'repeat') t.classList.toggle('on');
    });
    on(w.node, 'click', '.alb', (e, t) => Mu.playAlbum(+t.dataset.al));
    on(w.node, 'dblclick', '.mu-song', (e, t) => Mu.play(+t.dataset.si));
    on(w.node, 'click', '.mu-song', (e, t) => { $$('.mu-song', w.node).forEach(x => x.classList.remove('pick')); t.classList.add('pick'); });
    /* Dragging only moves the labels; the audio is re-cued once on release, or the
       synth would tear itself down and rebuild on every pointer move. */
    Mu.seek = Slider(w.node.querySelector('[data-slider="seek"]'), 0,
      v => Mu.scrub(v), { done: v => Mu.seekTo(v) });
    Slider(w.node.querySelector('[data-slider="mvol"]'), SYS.volume, v => { SYS.volume = v; Bus.emit('volume', v); MenuBar.paintStatus(); });
    Mu.render(w); Mu.paintBar();
  },
  onClose(w) { if (Mu.w === w) { Mu.w = null; Mu.stopAll(); } }
};

const Mu = {
  w: null, i: 0, pos: 0, playing: false, seek: null,
  cur() { return SONGS[this.i]; },
  render(w) {
    w = w || this.w; if (!w) return;
    const st = w.st;
    $$('[data-mv]', w.node).forEach(b => b.classList.toggle('on', b.dataset.mv === st.view));
    w.node.querySelector('[data-mtitle]').textContent = st.q ? `Search: ${st.q}` : st.view;
    const body = w.node.querySelector('[data-mbody]');
    /* A live query outranks the sidebar, the way typing in Music jumps to results. */
    if (st.q) {
      const hits = SONGS.map((s, i) => [s, i]).filter(([s]) =>
        (s.t + ' ' + s.a + ' ' + ALBUMS[s.al].t).toLowerCase().includes(st.q));
      w.node.querySelector('[data-mcount]').textContent = `${hits.length} result${hits.length === 1 ? '' : 's'}`;
      body.innerHTML = hits.length ? `<div class="mu-songs scroll">${hits.map(([s, i], k) => `
        <div class="mu-song${i === this.i ? ' on' : ''}" data-si="${i}">
          <span class="n">${k + 1}</span><span class="cv">${albumArt(s.al)}</span>
          <span class="ti"><b>${esc(s.t)}</b><span>${esc(s.a)} — ${esc(ALBUMS[s.al].t)}</span></span>
          <span class="du">${mmss(s.d)}</span></div>`).join('')}</div>`
        : `<div style="flex:1;display:grid;place-items:center;color:var(--txt-3);font-size:13px">No results for “${esc(st.q)}”</div>`;
      return;
    }
    if (st.view === 'Songs' || st.view.startsWith('Focus') || st.view === 'Late Night' || st.view === 'Shipping Music') {
      w.node.querySelector('[data-mcount]').textContent = `${SONGS.length} songs · ${mmss(SONGS.reduce((a, s) => a + s.d, 0))}`;
      body.innerHTML = `<div class="mu-songs scroll">${SONGS.map((s, i) => `
        <div class="mu-song${i === this.i ? ' on' : ''}" data-si="${i}">
          <span class="n">${i + 1}</span><span class="cv">${albumArt(s.al)}</span>
          <span class="ti"><b>${esc(s.t)}</b><span>${esc(s.a)} — ${esc(ALBUMS[s.al].t)}</span></span>
          <span class="du">${mmss(s.d)}</span></div>`).join('')}</div>`;
    } else if (st.view === 'Artists') {
      const artists = [...new Set(ALBUMS.map(a => a.a))];
      w.node.querySelector('[data-mcount]').textContent = `${artists.length} artists`;
      body.innerHTML = `<div class="mu-grid scroll">${artists.map((a, i) => `
        <div class="alb" data-al="${ALBUMS.findIndex(x => x.a === a)}"><div class="cv" style="border-radius:50%">${albumArt(i + 2)}
          <span class="pl">${ic('g-play')}</span></div><b>${esc(a)}</b><span>Artist</span></div>`).join('')}</div>`;
    } else {
      w.node.querySelector('[data-mcount]').textContent = `${ALBUMS.length} albums`;
      body.innerHTML = `<div class="mu-grid scroll">${ALBUMS.map((a, i) => `
        <div class="alb${this.cur().al === i ? ' on' : ''}" data-al="${i}"><div class="cv">${albumArt(i)}
          <span class="pl">${ic('g-play')}</span></div><b>${esc(a.t)}</b><span>${esc(a.a)} · ${a.y}</span></div>`).join('')}</div>`;
    }
  },
  paintBar() {
    const w = this.w; if (!w) return;
    const s = this.cur();
    w.node.querySelector('[data-npcv]').innerHTML = albumArt(s.al);
    w.node.querySelector('[data-npt]').textContent = s.t;
    w.node.querySelector('[data-npa]').textContent = `${s.a} — ${ALBUMS[s.al].t}`;
    w.node.querySelector('[data-cur]').textContent = mmss(this.pos);
    w.node.querySelector('[data-dur]').textContent = '-' + mmss(Math.max(0, s.d - this.pos));
    w.node.querySelector('[data-c="play"]').innerHTML = ic(this.playing ? 'g-pause' : 'g-play');
    if (this.seek && !this.scrubbing) this.seek.set(this.pos / s.d);
  },
  toggle() {
    if (!this.w) return WM.open('music');
    this.playing = !this.playing;
    if (this.playing) Synth.start(this.i, this.pos); else { this.pos = Synth.pos() ?? this.pos; Synth.stop(); }
    this.paintBar(); this.render();
  },
  play(i, from = 0) {
    this.i = clamp(i, 0, SONGS.length - 1);
    this.pos = from;
    this.playing = true;
    Synth.start(this.i, from);
    this.render(); this.paintBar();
  },
  playAlbum(al) { const i = SONGS.findIndex(s => s.al === al); this.play(i < 0 ? 0 : i); },
  skip(d) { this.play((this.i + d + SONGS.length) % SONGS.length); },
  scrub(frac) { this.scrubbing = true; this.pos = clamp(frac, 0, .999) * this.cur().d; this.paintBar(); },
  /** On release the piece picks up from the nearest bar to where you dropped it. */
  seekTo(frac) {
    const at = clamp(frac, 0, .999) * this.cur().d;
    this.scrubbing = false;
    this.pos = at;
    if (this.playing) Synth.start(this.i, at);
    this.paintBar();
  },
  stopAll() { this.playing = false; Synth.stop(); },
};
/* The transport follows the audio clock while sound is playing, and falls back to
   wall-clock stepping only if the browser gave us no AudioContext at all. */
setInterval(() => {
  if (!Mu.playing || !Mu.w) return;
  const p = Synth.pos();
  Mu.pos = p == null ? Mu.pos + 1 : p;
  if (Mu.pos >= Mu.cur().d) Mu.skip(1); else Mu.paintBar();
}, 1000);

/* ============================================================================
   19 · SYSTEM SETTINGS
   ========================================================================== */
const ST_SECTIONS = [
  { id: 'wifi', name: 'Wi‑Fi', icon: 'g-wifi', bg: '#0a84ff' },
  { id: 'bluetooth', name: 'Bluetooth', icon: 'g-bt', bg: '#0a84ff' },
  { id: 'network', name: 'Network', icon: 'g-network', bg: '#0a84ff' },
  { sep: true },
  { id: 'general', name: 'General', icon: 'g-gear', bg: '#8e8e93' },
  { id: 'appearance', name: 'Appearance', icon: 'g-display', bg: '#1d1d1f' },
  { id: 'wallpaper', name: 'Wallpaper', icon: 'g-globe', bg: '#30d158' },
  { id: 'dock', name: 'Desktop & Dock', icon: 'g-slider-h', bg: '#1d1d1f' },
  { id: 'displays', name: 'Displays', icon: 'g-display', bg: '#0a84ff' },
  { id: 'sound', name: 'Sound', icon: 'g-vol-hi', bg: '#ff375f' },
  { id: 'battery', name: 'Battery', icon: 'g-batt-glyph', bg: '#30d158' },
  { sep: true },
  { id: 'privacy', name: 'Privacy & Security', icon: 'g-hand', bg: '#0a84ff' },
];

APPS.settings = {
  name: 'System Settings', icon: 'app-settings', w: 800, h: 600, minW: 620, minH: 420,
  menus: () => stdMenus('settings'),
  mount(w, o) {
    w.st = { sec: o.section || 'appearance' };
    return `<div class="wb"><div class="st">
      <div class="st-side" data-drag>
        <div style="display:flex;align-items:center;height:38px;padding:0 12px"><div data-tl></div></div>
        <div class="top"><div class="sfield" data-nodrag><span>${ic('g-search')}</span><input placeholder="Search" data-stq></div></div>
        <div class="st-scroll">
          <div class="st-row" style="height:44px;margin-bottom:8px">
            <span class="bg" style="width:34px;height:34px;border-radius:50%;background-image:url('${AVATAR}');background-size:cover;background-position:center"></span>
            <span style="display:flex;flex-direction:column"><b style="font-size:13px;font-weight:600">Prasenjit</b><span style="font-size:11px;color:var(--txt-2)">Apple Account</span></span>
          </div>
          ${ST_SECTIONS.map(s => s.sep ? `<div class="msep" style="margin:8px 8px"></div>` :
      `<div class="st-row" data-sec="${s.id}"><span class="bg" style="background:${s.bg}">${ic(s.icon)}</span><span>${esc(s.name)}</span></div>`).join('')}
        </div>
      </div>
      <div class="st-main scroll">
        <div class="st-head" data-drag><h2 data-sttitle></h2></div>
        <div class="st-body" data-stbody></div>
      </div>
    </div></div>`;
  },
  ready(w) {
    Set2.w = w;
    on(w.node, 'click', '[data-sec]', (e, t) => { w.st.sec = t.dataset.sec; Set2.render(w); });
    Set2.render(w);
    Bus.on('theme', () => { if (w.st.sec === 'appearance' && !w.dead) Set2.render(w); });
  },
  onClose(w) { if (Set2.w === w) Set2.w = null; }
};

const Set2 = {
  w: null,
  render(w) {
    w = w || this.w; if (!w) return;
    const sec = ST_SECTIONS.find(s => s.id === w.st.sec) || ST_SECTIONS[4];
    $$('[data-sec]', w.node).forEach(b => b.classList.toggle('on', b.dataset.sec === sec.id));
    w.node.querySelector('[data-sttitle]').textContent = sec.name;
    const body = w.node.querySelector('[data-stbody]');
    body.innerHTML = (this.panes[sec.id] || this.panes._)(sec);
    body.querySelectorAll('.st-row svg,.bg svg').forEach(s => s.style.cssText = 'width:13px;height:13px');
    this.wire(w, body, sec.id);
  },

  wire(w, body, id) {
    on(body, 'click', '.sw', (e, t) => {
      t.classList.toggle('on');
      const k = t.dataset.k, on2 = t.classList.contains('on');
      if (k === 'wifi') { SYS.wifi = on2; MenuBar.paintStatus(); }
      if (k === 'bt') { SYS.bluetooth = on2; MenuBar.paintStatus(); }
      if (k === 'mag') { SYS.dockMagOn = on2; Dock.measure(); }
      if (k === 'dark') Theme.set(on2 ? 'dark' : 'light');
    });
    on(body, 'click', '[data-appear]', (e, t) => {
      Theme.setAppearance(t.dataset.appear);
      this.render(w);
    });
    on(body, 'click', '[data-accent]', (e, t) => { Theme.setAccent(t.dataset.accent); this.render(w); });
    on(body, 'click', '[data-hilite]', (e, t) => {
      SYS.highlight = t.dataset.hilite;
      const a = Theme.ACCENTS[SYS.highlight];
      const s = document.documentElement.style;
      /* 'accent' means "whatever the accent is", so the override comes back off. */
      if (!a || !a.hex) s.removeProperty('--sel');
      else s.setProperty('--sel', (SYS.theme === 'dark' ? (a.dark || a.hex) : a.hex));
      this.render(w);
    });
    /* The two popup buttons in this pane are real menus with real consequences. */
    on(body, 'click', '[data-pick]', (e, t) => {
      const k = t.dataset.pick;
      const opts = k === 'sidebarIcons'
        ? [['small', 'Small'], ['medium', 'Medium'], ['large', 'Large']]
        : [['auto', 'Automatically'], ['scrolling', 'When scrolling'], ['always', 'Always']];
      menuUnder(t, opts.map(([id, label]) => ({
        id, label, checked: SYS[k] === id,
        run: () => { SYS[k] = id; Set2.applyChrome(); this.render(w); },
      })));
    });
    on(body, 'click', '[data-wp]', (e, t) => {
      Wall.set(t.dataset.wp);
      $$('[data-wp]', body).forEach(x => x.classList.toggle('on', x === t));
    });
    on(body, 'click', '[data-net]', (e, t) => { SYS.wifiName = t.dataset.net; MenuBar.paintStatus(); this.render(w); });
    const dockSize = body.querySelector('[data-slider="dsize"]');
    if (dockSize) Slider(dockSize, (SYS.dockSize - 34) / 44, v => { SYS.dockSize = Math.round(34 + v * 44); Dock.measure(); Set2.dockPreview(body); });
    const dockMag = body.querySelector('[data-slider="dmag"]');
    if (dockMag) Slider(dockMag, (SYS.dockMag - 1) / 0.9, v => { SYS.dockMag = 1 + v * 0.9; SYS.dockMagOn = true; const sw = body.querySelector('[data-k="mag"]'); if (sw) sw.classList.add('on'); });
    const vol = body.querySelector('[data-slider="svol"]');
    if (vol) Slider(vol, SYS.volume, v => { SYS.volume = v; SYS.muted = v === 0; Bus.emit('volume', v); MenuBar.paintStatus(); });
    const bri = body.querySelector('[data-slider="sbri"]');
    if (bri) Slider(bri, Screen.brightness, v => Screen.setBrightness(v));
  },
  dockPreview(body) {
    const p = body.querySelector('[data-dockprev]');
    if (p) p.style.setProperty('--s', SYS.dockSize + 'px');
  },
  /* Sidebar icon size and scroll-bar policy are global, so they ride on the root as
     data attributes rather than being re-applied window by window. */
  applyChrome() {
    const d = document.documentElement.dataset;
    d.sbIcons = SYS.sidebarIcons;
    d.bars = SYS.scrollbars;
  },

  group: (label, rows) => `${label ? `<div class="st-label">${label}</div>` : ''}<div class="st-group">${rows}</div>`,
  row: (lb, rt, hint) => `<div class="st-item"><div class="lb">${lb}${hint ? `<div class="hint">${hint}</div>` : ''}</div><div class="rt">${rt}</div></div>`,
  sw: (k, on) => `<div class="sw${on ? ' on' : ''}" data-k="${k}"></div>`,
  slider: (k, extra = '') => `<div class="sl" data-slider="${k}" style="max-width:220px;${extra}"><div class="trk"><div class="fil"></div></div><div class="kn"></div></div>`,

  panes: {
    appearance(s) {
      const G = Set2.group, R = Set2.row;
      const swatch = (mode) => {
        const light = mode !== 'dark';
        return `<div class="sw2" style="background:${light ? 'linear-gradient(160deg,#a8d8ea,#3a91b8)' : 'linear-gradient(160deg,#243b55,#0d1b2a)'}">
          <div class="bar" style="background:${light ? 'rgba(255,255,255,.62)' : 'rgba(30,30,32,.7)'}"></div>
          <div class="wn" style="background:${light ? '#fff' : '#2c2c2e'};box-shadow:0 2px 6px rgba(0,0,0,.25)"></div>
          <div class="dk" style="background:${light ? 'rgba(255,255,255,.55)' : 'rgba(255,255,255,.16)'}"></div></div>`;
      };
      const A = Theme.ACCENTS;
      const dot = (key) => {
        const a = A[key], on = SYS.accent === key;
        const bg = key === 'multi'
          ? 'conic-gradient(from 210deg,#ff375f,#ff9f0a,#ffd60a,#30d158,#0a84ff,#bf5af2,#ff375f)'
          : (SYS.theme === 'dark' ? (a.dark || a.hex) : a.hex);
        return `<span class="acc${on ? ' on' : ''}" data-accent="${key}" title="${esc(a.name)}" style="background:${bg}"></span>`;
      };
      const hi = (key) => {
        const a = A[key], on = SYS.highlight === key;
        const bg = key === 'accent' ? 'var(--blue)' : (SYS.theme === 'dark' ? (a.dark || a.hex) : a.hex);
        return `<span class="acc${on ? ' on' : ''}" data-hilite="${key}" title="${key === 'accent' ? 'Accent Colour' : esc(a.name)}" style="background:${bg}"></span>`;
      };
      const SIZES = { small: 'Small', medium: 'Medium', large: 'Large' };
      const BARS = { auto: 'Automatically', scrolling: 'When scrolling', always: 'Always' };
      return G('', `<div class="st-appear">
          <div class="opt${SYS.appearance === 'light' ? ' on' : ''}" data-appear="light">${swatch('light')}<span>Light</span></div>
          <div class="opt${SYS.appearance === 'dark' ? ' on' : ''}" data-appear="dark">${swatch('dark')}<span>Dark</span></div>
          <div class="opt${SYS.appearance === 'auto' ? ' on' : ''}" data-appear="auto"><div class="sw2" style="background:linear-gradient(110deg,#a8d8ea 0 50%,#243b55 50% 100%)">
            <div class="bar" style="background:linear-gradient(110deg,rgba(255,255,255,.62) 0 50%,rgba(30,30,32,.7) 50%)"></div>
            <div class="wn" style="background:linear-gradient(110deg,#fff 0 50%,#2c2c2e 50%)"></div></div><span>Auto</span></div>
        </div>`) +
        /* Multicolour, Blue, Purple, Pink, Red, Orange, Yellow, Green, Graphite —
           the order System Settings actually lists them in. */
        G('', R('Accent colour', `<div class="accs">${Object.keys(A).map(dot).join('')}</div>`) +
          R('Highlight colour', `<div class="accs">${['accent', ...Object.keys(A).slice(1)].map(hi).join('')}</div>`) +
          R('Sidebar icon size', `<button class="btn" data-pick="sidebarIcons">${SIZES[SYS.sidebarIcons]} ${ic('g-chev-d')}</button>`) +
          R('Allow wallpaper tinting', Set2.sw('tint', true)) +
          R('Show scroll bars', `<button class="btn" data-pick="scrollbars">${BARS[SYS.scrollbars]} ${ic('g-chev-d')}</button>`)) +
        `<div class="hint" style="margin:-8px 0 0 4px">${SYS.appearance === 'auto'
          ? 'Auto switches between light and dark as the day goes by.'
          : 'Accent colour applies to buttons, controls and selections.'}</div>`;
    },
    wallpaper() {
      return Set2.group('Desktop picture', `<div class="wp-grid">${Object.entries(WALLPAPERS).map(([k, v]) =>
        `<div class="wp${SYS.wallpaper === k ? ' on' : ''}" data-wp="${k}" style="background-image:url('${v.url.replace('w=3200', 'w=420')}')"><span>${esc(v.name)}</span></div>`).join('')}</div>`) +
        Set2.group('', Set2.row('Show on all Spaces', Set2.sw('spaces', true)) + Set2.row('Add wallpaper to Photos', Set2.sw('addp', false)));
    },
    dock() {
      const G = Set2.group, R = Set2.row;
      return G('Dock', R('Size', `<span style="font-size:11px;color:var(--txt-2)">Small</span>${Set2.slider('dsize')}<span style="font-size:11px;color:var(--txt-2)">Large</span>`) +
        R('Magnification', `<span style="font-size:11px;color:var(--txt-2)">Off</span>${Set2.slider('dmag')}<span style="font-size:11px;color:var(--txt-2)">Large</span>`) +
        R('Enable magnification', Set2.sw('mag', SYS.dockMagOn)) +
        R('Position on screen', `<button class="btn">Bottom ${ic('g-chev-d')}</button>`) +
        R('Minimise using', `<button class="btn">Genie Effect ${ic('g-chev-d')}</button>`) +
        R('Animate opening apps', Set2.sw('anim', true)) +
        R('Show indicators for open applications', Set2.sw('ind', true))) +
        G('Desktop & Stage Manager', R('Show items', `<span style="font-size:12px;color:var(--txt-2)">On Desktop</span>${Set2.sw('items', true)}`) +
          R('Click wallpaper to reveal desktop', `<button class="btn">Only in Stage Manager ${ic('g-chev-d')}</button>`)) +
        G('Windows', R('Tiled windows have margins', Set2.sw('marg', true)) +
          R('Drag windows to screen edges to tile', Set2.sw('tile', true)));
    },
    sound() {
      const G = Set2.group, R = Set2.row;
      return G('Output & Input', R('Output volume', `${ic('g-vol-lo')}${Set2.slider('svol')}${ic('g-vol-hi')}`) +
        R('Mute', Set2.sw('mute', SYS.muted)) +
        R('Show Sound in menu bar', `<button class="btn">Always ${ic('g-chev-d')}</button>`)) +
        G('Sound Effects', R('Alert sound', `<button class="btn">Boop ${ic('g-chev-d')}</button>`) +
          R('Play sound on startup', Set2.sw('boot', true)) +
          R('Play user-interface sound effects', Set2.sw('ui', true))) +
        G('Output device', `<div class="st-item"><div class="lb" style="min-width:0;flex:1">MacBook Pro Speakers<div class="hint">Built‑in · 6 speakers</div></div><div class="rt" style="color:var(--blue)">${ic('g-check')}</div></div>
        <div class="st-item"><div class="lb" style="min-width:0;flex:1">AirPods Pro<div class="hint">Bluetooth</div></div></div>`);
    },
    wifi() {
      const G = Set2.group, R = Set2.row;
      return G('', R('Wi‑Fi', Set2.sw('wifi', SYS.wifi))) +
        G('Known Network', `<div class="st-item"><div class="lb" style="min-width:0;flex:1">${esc(SYS.wifiName)}<div class="hint">Connected · 1.2 Gbps</div></div><div class="rt">${ic('g-lock')}${wifiBars(3)}<button class="btn">Details…</button></div></div>`) +
        G('Other Networks', NETWORKS.filter(n => n.n !== SYS.wifiName).map(n =>
          `<div class="st-item" data-net="${esc(n.n)}"><div class="lb" style="min-width:0;flex:1">${esc(n.n)}</div><div class="rt">${n.lock ? ic('g-lock') : ''}${wifiBars(n.s)}</div></div>`).join(''));
    },
    bluetooth() {
      const G = Set2.group, R = Set2.row;
      return G('', R('Bluetooth', Set2.sw('bt', SYS.bluetooth))) +
        G('My Devices', [['AirPods Pro', 'Connected'], ['Magic Keyboard', 'Connected'], ['Magic Trackpad', 'Connected · 92%'], ['Sony WH‑1000XM5', 'Not Connected']].map(([n, s]) =>
          `<div class="st-item"><div class="lb" style="min-width:0;flex:1">${n}<div class="hint">${s}</div></div><div class="rt"><button class="btn">${s === 'Not Connected' ? 'Connect' : 'Disconnect'}</button></div></div>`).join(''));
    },
    network() {
      const G = Set2.group;
      return G('', [['Wi‑Fi', SYS.wifiName, '#30d158'], ['Thunderbolt Bridge', 'Not Connected', '#8e8e93'], ['VPN — Home', 'Not Connected', '#8e8e93']].map(([n, s, c]) =>
        `<div class="st-item"><span style="width:9px;height:9px;border-radius:50%;background:${c};flex:none"></span><div class="lb" style="min-width:0;flex:1">${n}<div class="hint">${s}</div></div><div class="rt">${ic('g-chev-r')}</div></div>`).join('')) +
        G('', Set2.row('Firewall', `<span style="font-size:12px;color:var(--txt-2)">On</span>${ic('g-chev-r')}`));
    },
    general() {
      const G = Set2.group, R = Set2.row;
      return G('', [['About', 'g-gear'], ['Software Update', 'g-download'], ['Storage', 'g-hd'], ['AirDrop & Handoff', 'g-airdrop'], ['Login Items & Extensions', 'g-apps'], ['Language & Region', 'g-globe'], ['Date & Time', 'g-clock-a'], ['Sharing', 'g-share'], ['Time Machine', 'g-clock-a']]
        .map(([n, i]) => `<div class="st-item"><span class="bg" style="width:20px;height:20px;border-radius:5px;background:#8e8e93;color:#fff;display:grid;place-items:center">${ic(i)}</span><div class="lb" style="min-width:0;flex:1">${n}</div><div class="rt">${ic('g-chev-r')}</div></div>`).join('')) +
        G('This Mac', `<div class="st-item"><div class="lb" style="min-width:0;flex:1">MacBook Pro 16″ · Apple M4 Max · 128 GB<div class="hint">macOS Tahoe 26.0 (26A5240b) — up to date</div></div><div class="rt"><button class="btn pri">More Info…</button></div></div>`);
    },
    displays() {
      const G = Set2.group, R = Set2.row;
      return G('Built‑in Liquid Retina XDR Display', R('Brightness', `${ic('g-sun')}${Set2.slider('sbri')}`) +
        R('Automatically adjust brightness', Set2.sw('autob', true)) +
        R('True Tone', Set2.sw('tt', true)) +
        R('Refresh rate', `<button class="btn">ProMotion (120 Hz) ${ic('g-chev-d')}</button>`) +
        R('Resolution', `<button class="btn">${innerWidth} × ${innerHeight} (Default) ${ic('g-chev-d')}</button>`)) +
        G('Colour', R('Colour profile', `<button class="btn">Apple XDR Display (P3‑1600 nits) ${ic('g-chev-d')}</button>`) +
          R('Night Shift', `<span style="font-size:12px;color:var(--txt-2)">Off</span>${ic('g-chev-r')}`));
    },
    battery() {
      const G = Set2.group, R = Set2.row;
      const mins = Math.round(SYS.battery / 100 * 11.4 * 60);
      return G('', `<div class="st-item"><div class="lb" style="min-width:0;flex:1"><b style="font-size:22px;font-weight:500">${SYS.battery}%</b>
        <div class="hint">${SYS.charging ? 'Charging' : `${Math.floor(mins / 60)} hr ${mins % 60} min remaining`}</div></div>
        <div class="rt" style="transform:scale(1.6);transform-origin:right center">${battSVG(SYS.battery, SYS.charging)}</div></div>`) +
        G('Battery Health', R('Condition', `<span style="font-size:12px;color:var(--txt-2)">Normal</span>${ic('g-chev-r')}`) +
          R('Maximum capacity', `<span style="font-size:12px;color:var(--txt-2)">98%</span>`) +
          R('Cycle count', `<span style="font-size:12px;color:var(--txt-2)">142</span>`)) +
        G('Options', R('Low Power Mode', `<button class="btn">Never ${ic('g-chev-d')}</button>`) +
          R('Optimised battery charging', Set2.sw('obc', true)));
    },
    privacy() {
      const G = Set2.group;
      return G('', [['Location Services', 'g-network', '#0a84ff'], ['Contacts', 'g-hand', '#ff9f0a'], ['Calendars', 'g-clock-a', '#ff375f'], ['Photos', 'g-gallery', '#bf5af2'], ['Camera', 'g-display', '#8e8e93'], ['Microphone', 'g-vol-hi', '#ff375f'], ['Screen & System Audio Recording', 'g-display', '#8e8e93'], ['Full Disk Access', 'g-hd', '#8e8e93'], ['FileVault', 'g-lock', '#30d158']]
        .map(([n, i, c]) => `<div class="st-item"><span class="bg" style="width:20px;height:20px;border-radius:5px;background:${c};color:#fff;display:grid;place-items:center">${ic(i)}</span><div class="lb" style="min-width:0;flex:1">${n}</div><div class="rt">${ic('g-chev-r')}</div></div>`).join('')) +
        G('', Set2.row('Allow applications from', `<button class="btn">App Store & known developers ${ic('g-chev-d')}</button>`));
    },
    _(s) { return Set2.group('', Set2.row(s.name, `<span style="font-size:12px;color:var(--txt-2)">Nothing to configure</span>`)); }
  }
};

/* ============================================================================
   20 · GENERATED "PHOTOS"  (used by Photos, Mail, TV, Books…)
   ========================================================================== */
const PAL = [
  ['#0f2b4a', '#2d7ea8', '#9fdcef', '#ffd9a0'], ['#1b1030', '#5b2a7a', '#c65fa0', '#ffd1a9'],
  ['#0a2f22', '#2f7a4f', '#98d17f', '#f3f0c8'], ['#2b1408', '#8a4a1e', '#e0913f', '#ffe1b0'],
  ['#101418', '#3a4652', '#8b9aa8', '#dfe6ec'], ['#25082a', '#7a1c58', '#e0417f', '#ffd0e0'],
  ['#04202b', '#0a6f7a', '#57ccbf', '#e8fbf5'], ['#301a04', '#a05a12', '#f0a83c', '#fff0cf'],
];
function photoArt(i, kindOverride) {
  /* One 32-bit scramble drives palette, composition and the small variations, so
     a wall of forty-eight of these doesn't visibly repeat every eighth cell. */
  let h = Math.imul(i + 1, 2654435761) >>> 0;
  h ^= h >>> 15; h = Math.imul(h, 2246822519) >>> 0; h ^= h >>> 13;
  const t = (sh, n) => ((h >>> sh) & 255) / 255 * n;      // jitter tap in 0..n
  const p = PAL[(h >>> 3) % PAL.length];
  const kind = kindOverride ?? (h >>> 11) % 5;
  const id = 'ph' + i + '_' + (kindOverride ?? 'x');
  const sun = (x, y, r, o = .9) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${p[3]}" opacity="${o}"/>`;
  const body = [
    /* ridgeline */
    `<rect width="100" height="100" fill="url(#${id})"/>${sun(58 + t(2, 30), 20 + t(5, 14), 8 + t(9, 5))}
     <path d="M0 ${70 + t(6, 8)} ${20 + t(7, 12)} ${46 + t(4, 10)}l18 16 20-24 38 30v34H0z" fill="${p[0]}" opacity=".55"/>
     <path d="M0 84 ${26 + t(8, 12)} ${62 + t(3, 10)}l22 14 26-16 22 14v30H0z" fill="${p[0]}"/>`,
    /* rolling hills */
    `<rect width="100" height="100" fill="url(#${id})"/>${sun(18 + t(4, 26), 18 + t(6, 12), 7 + t(2, 4), .85)}
     <path d="M0 ${58 + t(5, 8)}c16 0 16-10 32-10s16 10 32 10 16-10 36-10v50H0z" fill="${p[0]}" opacity=".45"/>
     <path d="M0 ${72 + t(7, 6)}c16 0 16-8 32-8s16 8 32 8 16-8 36-8v40H0z" fill="${p[0]}"/>`,
    /* bokeh */
    `<rect width="100" height="100" fill="${p[0]}"/>
     <circle cx="${42 + t(3, 16)}" cy="${42 + t(6, 16)}" r="${28 + t(9, 10)}" fill="url(#${id})" opacity=".92"/>
     <circle cx="${42 + t(3, 16)}" cy="${42 + t(6, 16)}" r="${14 + t(4, 8)}" fill="${p[3]}" opacity=".3"/>
     ${sun(42 + t(3, 16), 42 + t(6, 16), 6 + t(8, 4))}`,
    /* skyline */
    `<rect width="100" height="100" fill="url(#${id})"/>
     <g fill="${p[0]}" opacity=".85">${[...Array(7)].map((_, k) =>
      `<rect x="${2 + k * 14.6}" y="${100 - (22 + t(k * 3 + 1, 46))}" width="${9 + t(k * 2, 4)}" height="${22 + t(k * 3 + 1, 46)}"/>`).join('')}</g>
     ${sun(70 + t(5, 22), 16 + t(7, 12), 7 + t(2, 4))}`,
    /* still water, with the sun broken up on the surface */
    `<rect width="100" height="100" fill="url(#${id})"/>
     ${sun(30 + t(4, 40), 26 + t(6, 10), 8 + t(3, 4))}
     <rect y="${58 + t(8, 8)}" width="100" height="50" fill="${p[1]}" opacity=".55"/>
     <g fill="${p[3]}" opacity=".5">${[...Array(5)].map((_, k) =>
      `<rect x="${24 + t(4, 40) - (5 + k * 1.6)}" y="${64 + t(8, 8) + k * 6}" width="${12 + k * 4}" height="2.4" rx="1.2"/>`).join('')}</g>
     <path d="M0 ${74 + t(9, 10)}h100v40H0z" fill="${p[0]}" opacity=".8"/>`,
  ][kind];
  return `<svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" style="width:100%;height:100%"><defs>` +
    `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p[1]}"/>` +
    `<stop offset=".55" stop-color="${p[2]}"/><stop offset="1" stop-color="${p[3]}"/></linearGradient></defs>${body}</svg>`;
}

/* ============================================================================
   21 · MAIL
   ========================================================================== */
const MAILS = [
  { f: 'Figma', s: 'Daniel left 3 comments on Desktop v4', p: 'Tray blur reads heavy at 62px — can we try 44 and put them side by side?', t: '4:21 PM', c: '#a259ff', unread: true, flag: true },
  { f: 'Vercel', s: 'Your deployment is live', p: 'desktop-web is ready. Build finished in 0s — there was nothing to build.', t: '3:58 PM', c: '#1d1d1f', unread: true },
  { f: 'Linear', s: 'ENG-412 moved to In Review', p: 'Shadow repaint during minimise: 12 dropped frames down to 0. Needs your sign-off.', t: '1:12 PM', c: '#5e6ad2' },
  { f: 'GitHub', s: '[workspace/desktop] PR #142 review requested', p: 'Column view: preview pane sizing. 4 files changed, +218 −31.', t: '11:04 AM', c: '#24292f' },
  { f: 'Anna Haro', s: 'Re: dock easing', p: 'The cosine falloff is right, but shorten the settle. Under 300ms or it reads as lag.', t: 'Yesterday', c: '#bf5af2' },
  { f: 'Apple Developer', s: 'macOS Tahoe 26 beta 4 is available', p: 'Liquid Glass refinements, Spotlight actions, and 42 resolved issues.', t: 'Yesterday', c: '#1d1d1f' },
  { f: 'Mom', s: 'call me when free', p: 'and eat something that is not coffee', t: 'Saturday', c: '#ff375f', flag: true },
];
APPS.mail = {
  name: 'Mail', icon: 'app-mail', w: 1020, h: 640, minW: 620, minH: 380,
  menus: () => stdMenus('mail'),
  mount(w) {
    w.st = { sel: 0, box: 'Inbox' };
    const boxes = [['Inbox', 'g-download', 2], ['VIP', 'g-star', ''], ['Flagged', 'g-tag', 2], ['Drafts', 'g-title', 1], ['Sent', 'g-share', ''], ['Junk', 'g-trash-glyph', ''], ['Trash', 'g-trash-glyph', '']];
    return `<div class="wb">
      <div class="sbar" data-drag style="width:196px"><div class="sb-top"><div data-tl></div></div>
        <div class="grp"><div class="gh">Mailboxes</div>
        ${boxes.map(([n, i, c]) => `<div class="si" data-box="${n}">${ic(i === 'g-trash-glyph' ? 'g-tag' : i, 'ico')}<span class="nm">${n}</span>${c ? `<span class="tail">${c}</span>` : ''}</div>`).join('')}
        </div>
        <div class="grp"><div class="gh">Smart Mailboxes</div>
          <div class="si">${ic('g-star', 'ico')}<span class="nm">Today</span></div>
          <div class="si">${ic('g-tag', 'ico')}<span class="nm">Attachments</span></div></div>
      </div>
      <div class="fx">
        <div class="fx-tb" data-drag>
          <button class="tbtn" data-nodrag data-mcompose title="New Message">${ic('g-plus')}</button>
          <button class="tbtn" data-nodrag data-mflag title="Flag">${ic('g-tag')}</button>
          <button class="tbtn" data-nodrag data-mshare title="Share">${ic('g-share')}</button>
          <div class="fx-title" data-mbtitle>Inbox</div>
          <div class="grow" style="flex:1"></div>
          <div class="sfield" data-nodrag style="width:170px"><span>${ic('g-search')}</span><input placeholder="Search"></div>
        </div>
        <div class="wb" style="flex:1;min-height:0">
          <div class="msg-list scroll" data-mlist style="width:344px"></div>
          <div class="pv scroll" data-mread style="place-items:start stretch;padding:0;background:var(--win)"></div>
        </div>
      </div></div>`;
  },
  ready(w) {
    const render = () => {
      w.node.querySelector('[data-mbtitle]').textContent = w.st.box;
      const list = w.st.box === 'Flagged' ? MAILS.filter(m => m.flag) : MAILS;
      $$('[data-box]', w.node).forEach(b => b.classList.toggle('on', b.dataset.box === w.st.box));
      w.node.querySelector('[data-mlist]').innerHTML = list.map((m, i) => `
        <div class="msg-c${i === w.st.sel ? ' on' : ''}" data-mi="${i}">
          <span class="av" style="background:${m.c}">${esc(m.f[0])}</span>
          <span class="bd"><b>${m.unread ? '<span style="color:var(--blue)">●</span> ' : ''}${esc(m.f)}</b>
            <b style="font-weight:500;font-size:12px">${esc(m.s)}</b><p>${esc(m.p)}</p></span>
          <span class="tm">${esc(m.t)}</span></div>`).join('');
      const m = list[w.st.sel] || list[0];
      w.node.querySelector('[data-mread]').innerHTML = m ? `<div style="padding:24px 30px;max-width:640px">
        <div style="display:flex;gap:12px;align-items:center;margin-bottom:18px">
          <span class="av" style="width:42px;height:42px;border-radius:50%;background:${m.c};display:grid;place-items:center;color:#fff;font-weight:600;font-size:16px">${esc(m.f[0])}</span>
          <div><div style="font-size:14px;font-weight:600">${esc(m.f)}</div><div style="font-size:11.5px;color:var(--txt-2)">To: Prasenjit · ${esc(m.t)}</div></div></div>
        <h2 style="margin:0 0 14px;font-size:19px;font-weight:600;letter-spacing:-.02em">${esc(m.s)}</h2>
        <p style="font-size:13.5px;line-height:1.6;color:var(--txt)">${esc(m.p)}</p>
        <p style="font-size:13.5px;line-height:1.6;color:var(--txt-2)">Sent from a Mac that only exists as markup.</p>
      </div>` : '';
    };
    on(w.node, 'click', '[data-mi]', (e, t) => { w.st.sel = +t.dataset.mi; MAILS[w.st.sel].unread = false; render(); });
    on(w.node, 'click', '[data-box]', (e, t) => { w.st.box = t.dataset.box; w.st.sel = 0; render(); });
    on(w.node, 'click', '[data-mcompose]', () => Mail.compose());
    on(w.node, 'click', '[data-mflag]', () => {
      const list = w.st.box === 'Flagged' ? MAILS.filter(m => m.flag) : MAILS;
      const m = list[w.st.sel] || list[0];
      if (!m) return;
      m.flag = !m.flag;
      Toast(m.flag ? 'Flagged' : 'Flag removed');
      render();
    });
    on(w.node, 'click', '[data-mshare]', (e, t) => {
      const list = w.st.box === 'Flagged' ? MAILS.filter(m => m.flag) : MAILS;
      const m = list[w.st.sel] || list[0];
      menuUnder(t, [
        { id: 'r', label: 'Reply', run: () => Mail.compose('Re: ' + (m ? m.s : ''), m ? m.f : '') },
        { id: 'f', label: 'Forward', run: () => Mail.compose('Fwd: ' + (m ? m.s : '')) }, '-',
        { id: 'c', label: 'Copy Link', run: () => Toast('Link copied') },
        { id: 'p', label: 'Print…', run: () => Toast('Sent to printer') }]);
    });
    render();
  }
};

/* A compose sheet, because a mail app whose New Message button only toasts is a
   mail app with a dead button. */
const Mail = {
  compose(subject = '', to = '') {
    const node = el(`<div class="pop" style="padding:0;width:min(600px,84vw);border-radius:12px;overflow:hidden">
      <div class="fx-tb" style="height:46px;padding:0 12px;gap:8px;border-bottom:.5px solid var(--line)">
        <div class="fx-title" style="position:static;flex:1;text-align:left">New Message</div>
        <button class="btn" data-cancel style="height:22px">Cancel</button>
        <button class="btn pri" data-send style="height:22px">Send</button>
      </div>
      <div style="padding:0 14px">
        ${[['To', to], ['Subject', subject]].map(([l, v]) => `<div style="display:flex;align-items:center;gap:8px;height:34px;border-bottom:.5px solid var(--line)">
          <span style="width:54px;font-size:12px;color:var(--txt-2)">${l}:</span>
          <input data-f="${l}" value="${esc(v)}" style="flex:1;border:0;background:none;font-size:13px;outline:none;color:var(--txt)"></div>`).join('')}
      </div>
      <div contenteditable="true" data-body style="min-height:180px;padding:14px;font-size:13.5px;line-height:1.6;outline:none"></div></div>`);
    Pop.open(node, { x: innerWidth / 2 - 300, y: 96, origin: 'top center' });
    setTimeout(() => node.querySelector(subject ? '[data-body]' : '[data-f="To"]').focus(), 60);
    node.querySelector('[data-cancel]').onclick = () => Pop.close();
    node.querySelector('[data-send]').onclick = () => {
      const to = node.querySelector('[data-f="To"]').value.trim();
      Pop.close();
      Toast(to ? 'Message sent to ' + to : 'Message sent');
    };
  },
};

/* ============================================================================
   22 · MESSAGES
   ========================================================================== */
const CHATS = [
  {
    n: 'Kate', c: '#64d2ff', t: '4:28 PM', msgs: [
      ['them', 'lake trip still on for saturday?'], ['them', 'weather says clear all weekend'],
      ['me', 'yes. leaving at 6 so we get the light'], ['them', 'six in the morning is a threat'],
      ['me', 'bring coffee then'], ['them', 'bringing coffee AND a blanket, i know how you drive'],
    ]
  },
  {
    n: 'John', c: '#30d158', t: '2:14 PM', msgs: [
      ['them', 'did the review land'], ['me', 'merged an hour ago'],
      ['them', 'legend. the animation on the sidebar is so smooth now'],
      ['me', 'took four tries to get the easing right'], ['them', 'it shows, in a good way'],
    ]
  },
  {
    n: 'Design Crew', c: '#bf5af2', t: '11:40 AM', group: true, msgs: [
      ['them', 'Daniel: shadows on the unfocused windows are too heavy'],
      ['me', 'fixed — dropped the two outer layers'],
      ['them', 'Daniel: much better, they sit back now'],
      ['them', 'Freda: can we get the same treatment on the sheets?'],
      ['me', 'already in, refresh'], ['them', 'Freda: 🤝'],
    ]
  },
  {
    n: 'David', c: '#ff9f0a', t: '10:02 AM', msgs: [
      ['them', 'are you coming to the thing on friday'], ['me', 'what thing'],
      ['them', 'the thing i told you about twice'], ['me', 'the rooftop one?'],
      ['them', 'yes. 8pm. do not be fashionably late'], ['me', "i'll be unfashionably early"],
    ]
  },
  {
    n: 'Anna', c: '#0a84ff', t: '9:15 AM', msgs: [
      ['them', 'random but your site loads absurdly fast'], ['me', 'no framework, no fonts to wait on'],
      ['them', 'i keep forgetting that is allowed'],
    ]
  },
  {
    n: 'Chris', c: '#ff2d55', t: 'Yesterday', msgs: [
      ['them', 'sending you the playlist for the drive'], ['them', '4 hours, no repeats'],
      ['me', 'if there is a single sad song i am turning around'], ['them', 'no promises'],
    ]
  },
  {
    n: 'Hank', c: '#5e5ce6', t: 'Yesterday', msgs: [
      ['them', 'coffee thursday?'], ['me', 'the place with the bad chairs?'],
      ['them', 'the place with the good espresso and the bad chairs, yes'], ['me', 'deal'],
    ]
  },
  {
    n: 'Daniel', c: '#ffd60a', t: 'Sunday', msgs: [
      ['them', 'sent you the moodboard'], ['me', 'the third row is the one'],
      ['them', 'knew you would say that'],
    ]
  },
  {
    n: 'Freda', c: '#a2845e', t: 'Saturday', msgs: [
      ['them', 'did you get the keys back from the landlord'], ['me', 'picking them up tomorrow'],
      ['them', 'text me when you do'],
    ]
  },
  { n: 'Mom', c: '#ff375f', t: 'Friday', msgs: [['them', 'did you eat'], ['me', 'yes'], ['them', 'coffee is not food'], ['me', 'it has water in it'], ['them', 'call me tonight']] },
];
APPS.messages = {
  name: 'Messages', icon: 'app-messages', w: 900, h: 600, minW: 560, minH: 360,
  menus: () => stdMenus('messages'),
  mount(w) {
    w.st = { sel: 0, chats: CHATS.map(c => ({ ...c, msgs: c.msgs.map(m => m.slice()) })) };
    return `<div class="wb"><div class="msg">
      <div class="msg-list scroll" data-drag style="padding-top:0">
        <div style="display:flex;align-items:center;height:38px;padding:0 4px 0 2px">
          <div data-tl></div><div style="flex:1"></div>
          <button class="tbtn" data-nodrag data-cnew title="New Message">${ic('g-compose')}</button>
        </div>
        <div style="padding:0 2px 8px"><div class="sfield" data-nodrag><span>${ic('g-search')}</span><input placeholder="Search" data-csearch></div></div>
        <div data-clist></div>
      </div>
      <div class="msg-th">
        <div class="msg-hd" data-drag>
          <span class="who" data-cdetails><span class="av sm" data-cav></span><span data-cname></span>${ic('g-chev-r')}</span>
          <div style="flex:1"></div>
          <button class="tbtn" data-nodrag data-cft title="FaceTime">${ic('g-facetime')}</button>
          <button class="tbtn" data-nodrag data-cinfo title="Details">${ic('g-info')}</button>
        </div>
        <div class="msg-body scroll" data-cbody></div>
        <div class="msg-comp"><button class="tbtn" data-cattach title="Apps">${ic('g-plus')}</button>
          <div class="fld"><input placeholder="iMessage" data-cinput></div>
          <button class="tbtn" data-send>${ic('g-chev-u')}</button></div>
      </div></div></div>`;
  },
  ready(w) {
    const render = () => {
      const st = w.st;
      const q = (st.q || '').toLowerCase();
      const hit = c => !q || c.n.toLowerCase().includes(q) || c.msgs.some(m => m[1].toLowerCase().includes(q));
      w.node.querySelector('[data-clist]').innerHTML = st.chats.map((c, i) => hit(c) ? `
        <div class="msg-c${i === st.sel ? ' on' : ''}" data-ci="${i}">
          <span class="av" style="background:${c.c}">${esc(c.n[0])}</span>
          <span class="bd"><b>${esc(c.n)}</b><p>${esc(c.msgs[c.msgs.length - 1][1])}</p></span>
          <span class="tm">${esc(c.t)}</span></div>` : '').join('') ||
        `<div style="padding:22px 10px;text-align:center;font-size:12px;color:var(--txt-3)">No Results</div>`;
      const c = st.chats[st.sel];
      w.node.querySelector('[data-cname]').textContent = c.n;
      const av = w.node.querySelector('[data-cav]');
      av.textContent = c.n[0]; av.style.background = c.c;
      const body = w.node.querySelector('[data-cbody]');
      body.innerHTML = `<div class="msg-day">Today ${time12(new Date()).replace(NBSP, ' ')}</div>` +
        c.msgs.map((m, i) => {
          const last = i === c.msgs.length - 1 || c.msgs[i + 1][0] !== m[0];
          return `<div class="bub${m[0] === 'me' ? ' me' : ''}${last ? ' tail' : ''}">${esc(m[1])}</div>`;
        }).join('');
      body.scrollTop = body.scrollHeight;
    };
    const send = () => {
      const inp = w.node.querySelector('[data-cinput]');
      const v = inp.value.trim(); if (!v) return;
      const c = w.st.chats[w.st.sel];
      c.msgs.push(['me', v]); inp.value = ''; render();
      setTimeout(() => {
        const replies = ['ok that\'s wild', 'send the file', 'how is this one HTML file', 'screenshotting this', 'wait do the windows resize too'];
        c.msgs.push(['them', replies[Math.floor(Math.random() * replies.length)]]); render();
      }, 1100);
    };
    const details = () => {
      const c = w.st.chats[w.st.sel];
      const node = el(`<div class="pop" style="width:250px;padding:14px;text-align:center">
        <div class="av" style="width:56px;height:56px;border-radius:50%;background:${c.c};display:grid;place-items:center;
          color:#fff;font-size:22px;font-weight:600;margin:0 auto 8px">${esc(c.n[0])}</div>
        <div style="font-size:15px;font-weight:600">${esc(c.n)}</div>
        <div style="font-size:11.5px;color:var(--txt-2);margin-bottom:12px">${c.group ? c.msgs.length + ' messages · group' : 'iMessage'}</div>
        <div style="display:flex;gap:8px;justify-content:center">
          <button class="btn" data-d="audio" style="flex:1;height:26px">Audio</button>
          <button class="btn" data-d="video" style="flex:1;height:26px">Video</button></div>
        <div style="display:flex;flex-direction:column;gap:1px;margin-top:12px;background:var(--line);border-radius:8px;overflow:hidden">
          ${[['Hide Alerts', 'alerts'], ['Send Read Receipts', 'receipts']].map(([l, k]) =>
        `<label style="display:flex;align-items:center;justify-content:space-between;gap:8px;background:var(--win-2);padding:7px 10px;font-size:12px">
              ${l}<span class="sw${w.st[k] ? ' on' : ''}" data-t="${k}"><i></i></span></label>`).join('')}
        </div></div>`);
      Pop.open(node, { x: innerWidth / 2 - 125, y: 120, origin: 'top center' });
      on(node, 'click', '[data-d]', (e, t) => { Pop.close(); WM.open('facetime'); Toast(`Calling ${c.n}…`); });
      on(node, 'click', '.sw', (e, t) => { const k = t.dataset.t; w.st[k] = !w.st[k]; t.classList.toggle('on', w.st[k]); });
    };
    on(w.node, 'click', '[data-ci]', (e, t) => { w.st.sel = +t.dataset.ci; render(); });
    on(w.node, 'click', '[data-send]', send);
    on(w.node, 'click', '[data-cinfo]', details);
    on(w.node, 'click', '[data-cdetails]', details);
    on(w.node, 'click', '[data-cft]', () => { WM.open('facetime'); Toast(`Calling ${w.st.chats[w.st.sel].n}…`); });
    on(w.node, 'click', '[data-cattach]', (e, t) => menuUnder(t, [
      { id: 'p', label: 'Photos', icon: 'g-gallery', run: () => WM.open('photos') },
      { id: 's', label: 'Stickers', icon: 'g-star', run: () => insert('👍') },
      { id: 'a', label: 'Audio', icon: 'g-vol-hi', run: () => WM.open('voice') }, '-',
      { id: 'f', label: 'Send a File…', run: () => Toast('No files selected') }]));
    /* New Message starts an empty thread at the top of the list, like ⌘N. */
    on(w.node, 'click', '[data-cnew]', () => {
      const name = 'New Message';
      w.st.chats.unshift({ n: name, c: '#8e8e93', t: 'now', msgs: [['them', 'Type a message to begin.']] });
      w.st.sel = 0; w.st.q = ''; w.node.querySelector('[data-csearch]').value = '';
      render();
      w.node.querySelector('[data-cinput]').focus();
    });
    const insert = s => {
      const inp = w.node.querySelector('[data-cinput]');
      inp.value += s; inp.focus();
    };
    w.node.querySelector('[data-csearch]').addEventListener('input', e => { w.st.q = e.target.value; render(); });
    w.node.querySelector('[data-cinput]').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); send(); } });
    render();
  }
};

/* ============================================================================
   23 · MAPS  (real tiles, live geocoding)
   ========================================================================== */
APPS.maps = {
  name: 'Maps', icon: 'app-maps', w: 940, h: 620, minW: 480, minH: 320,
  menus: () => stdMenus('maps', {
    View: [{ id: 'zi', label: 'Zoom In', key: '⌘+', run: () => Maps.zoom(1) },
    { id: 'zo', label: 'Zoom Out', key: '⌘-', run: () => Maps.zoom(-1) }, '-',
    { id: 'home', label: 'Go to Cupertino', run: () => Maps.goto(37.3349, -122.0090, 15, 'Apple Park', '1 Apple Park Way · Cupertino, CA') }],
  }, ['File', 'Edit', 'View', 'Window', 'Help']),
  mount(w) {
    return titlebar('Maps', {
      right: `<div class="sfield" data-nodrag style="width:210px"><span>${ic('g-search')}</span>
        <input data-msearch placeholder="Search Maps" spellcheck="false"></div>`
    }) + `<div class="maps" data-map>
      <div class="pane" data-pane></div>
      <svg class="pin" viewBox="0 0 26 34"><path fill="#f0453a" d="M13 0a13 13 0 0 0-13 13c0 8.7 13 21 13 21s13-12.3 13-21A13 13 0 0 0 13 0z"/><circle cx="13" cy="12.6" r="4.6" fill="#fff"/></svg>
      <div class="card" data-card></div>
      <div class="zoom"><button data-z="1" title="Zoom In">${ic('g-plus')}</button><button data-z="-1" title="Zoom Out">${ic('g-minus')}</button></div>
      <div class="attr">© OpenStreetMap · CARTO</div>
    </div>`;
  },
  ready(w) { Maps.attach(w); },
  onResize(w) { if (w === Maps.w) Maps.layout(); },
  onClose(w) { if (w === Maps.w) Maps.w = null; },
};

/* A minimal slippy map. Web Mercator, 256px tiles, one transformed pane.
   Tiles come from CARTO's OSM basemaps because their light style is the closest
   free match to Apple Maps — flat, pale, and out of the way of the labels. */
const Maps = {
  w: null, tiles: new Map(), z: 15, lat: 37.3349, lon: -122.0090,
  TILE: 256,

  /* Voyager for light: blue water, green parks, white roads on warm land — the
     closest free raster style to Apple Maps. Dark Matter for the dark theme. */
  style() { return SYS.theme === 'dark' ? 'dark_all' : 'rastertiles/voyager'; },
  url(x, y, z) {
    const sub = 'abcd'[(x + y) % 4];
    return `https://${sub}.basemaps.cartocdn.com/${this.style()}/${z}/${x}/${y}${devicePixelRatio > 1 ? '@2x' : ''}.png`;
  },
  /* Mercator, in world pixels at the current zoom. */
  worldX(lon, z) { return (lon + 180) / 360 * this.TILE * (1 << z); },
  worldY(lat, z) {
    const s = Math.sin(clamp(lat, -85.05, 85.05) * Math.PI / 180);
    return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * this.TILE * (1 << z);
  },
  lonAt(x, z) { return x / (this.TILE * (1 << z)) * 360 - 180; },
  latAt(y, z) {
    const n = Math.PI - 2 * Math.PI * y / (this.TILE * (1 << z));
    return 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  },

  attach(w) {
    this.w = w;
    this.tiles.clear();
    this.card('Apple Park', '1 Apple Park Way · Cupertino, CA');
    /* One frame later the window has a real size to measure. */
    raf(() => this.layout());
    Bus.on('theme', () => { if (this.w && !this.w.dead) { this.tiles.clear(); this.pane().innerHTML = ''; this.layout(); } });

    const box = w.node.querySelector('[data-map]');
    on(w.node, 'click', '[data-z]', (e, t) => this.zoom(+t.dataset.z));

    box.addEventListener('pointerdown', e => {
      if (e.target.closest('.zoom,.card,.results')) return;
      box.setPointerCapture(e.pointerId);
      const ox = e.clientX, oy = e.clientY;
      const sx = this.worldX(this.lon, this.z), sy = this.worldY(this.lat, this.z);
      let moved = false;
      const mv = ev => {
        const dx = ev.clientX - ox, dy = ev.clientY - oy;
        if (!moved && Math.hypot(dx, dy) < 2) return;
        moved = true;
        this.lon = this.lonAt(sx - dx, this.z);
        this.lat = this.latAt(clamp(sy - dy, 0, this.TILE * (1 << this.z)), this.z);
        this.layout();
      };
      const up = () => {
        box.removeEventListener('pointermove', mv);
        box.removeEventListener('pointerup', up);
        if (moved) this.card('Dropped Pin', `${this.lat.toFixed(4)}, ${this.lon.toFixed(4)}`);
      };
      box.addEventListener('pointermove', mv);
      box.addEventListener('pointerup', up);
    });

    /* Wheel zooms about the cursor, the way every map does. */
    box.addEventListener('wheel', e => {
      e.preventDefault();
      const dir = e.deltaY < 0 ? 1 : -1;
      const r = box.getBoundingClientRect();
      this.zoom(dir, e.clientX - r.left - r.width / 2, e.clientY - r.top - r.height / 2);
    }, { passive: false });

    box.addEventListener('dblclick', e => {
      if (e.target.closest('.zoom,.card,.results')) return;
      const r = box.getBoundingClientRect();
      this.zoom(1, e.clientX - r.left - r.width / 2, e.clientY - r.top - r.height / 2);
    });

    const input = w.node.querySelector('[data-msearch]');
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); this.search(input.value.trim()); }
      if (e.key === 'Escape') { input.value = ''; this.clearResults(); }
    });
  },

  pane() { return this.w && this.w.node.querySelector('[data-pane]'); },

  zoom(dir, ax = 0, ay = 0) {
    if (!this.w) return;
    const nz = clamp(this.z + dir, 2, 19);
    if (nz === this.z) return;
    /* Keep the point under the cursor fixed: convert it to lat/lon first, then
       recentre so it lands in the same place at the new zoom. */
    const px = this.worldX(this.lon, this.z) + ax, py = this.worldY(this.lat, this.z) + ay;
    const alat = this.latAt(py, this.z), alon = this.lonAt(px, this.z);
    this.z = nz;
    this.lon = this.lonAt(this.worldX(alon, nz) - ax, nz);
    this.lat = this.latAt(clamp(this.worldY(alat, nz) - ay, 0, this.TILE * (1 << nz)), nz);
    this.layout();
  },

  goto(lat, lon, z, title, sub) {
    if (!this.w) return;
    this.lat = lat; this.lon = lon; if (z) this.z = clamp(z, 2, 19);
    this.layout();
    if (title) this.card(title, sub || '');
    /* Re-run the pin's drop so the arrival is visible. */
    const pin = this.w.node.querySelector('.pin');
    if (pin) { pin.style.animation = 'none'; raf(() => { pin.style.animation = ''; }); }
  },

  layout() {
    const w = this.w; if (!w || w.dead) return;
    const box = w.node.querySelector('[data-map]'), pane = this.pane();
    if (!box || !pane) return;
    const vw = box.clientWidth, vh = box.clientHeight;
    if (!vw || !vh) return;

    const z = this.z, T = this.TILE, n = 1 << z;
    const cx = this.worldX(this.lon, z), cy = this.worldY(this.lat, z);
    /* Top-left of the viewport in world pixels. */
    const ox = cx - vw / 2, oy = cy - vh / 2;
    /* One tile of margin beyond the viewport, so a drag reveals loaded map
       rather than the backdrop. */
    const x0 = Math.floor(ox / T) - 1, x1 = Math.floor((ox + vw) / T) + 1;
    const y0 = Math.floor(oy / T) - 1, y1 = Math.floor((oy + vh) / T) + 1;

    /* Subpixel offset lives on the pane; whole tiles are placed on the grid. */
    pane.style.transform = `translate3d(${-Math.round(ox)}px,${-Math.round(oy)}px,0)`;

    const want = new Set();
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
      if (y < 0 || y >= n) continue;
      const wx = ((x % n) + n) % n;                    // wrap the globe east–west
      const key = `${z}/${wx}/${y}/${x}`;
      want.add(key);
      if (this.tiles.has(key)) continue;
      const img = new Image();
      img.src = this.url(wx, y, z);
      img.alt = '';
      img.style.left = x * T + 'px';
      img.style.top = y * T + 'px';
      img.addEventListener('load', () => { img.classList.add('in'); this.online(true); });
      img.addEventListener('error', () => { img.remove(); this.tiles.delete(key); this.online(false); });
      pane.append(img);
      this.tiles.set(key, img);
    }
    /* Drop anything that scrolled well out of view, and everything from the
       previous zoom level, so the pane doesn't grow without bound. */
    for (const [key, img] of this.tiles) {
      if (want.has(key)) continue;
      const [tz] = key.split('/');
      const [, , ty, tx] = key.split('/').map(Number);
      if (+tz !== z || tx < x0 - 2 || tx > x1 + 2 || ty < y0 - 2 || ty > y1 + 2) {
        img.remove(); this.tiles.delete(key);
      }
    }
  },

  /* Tiles failing in bulk means no network, which is worth saying once. */
  online(ok) {
    const w = this.w; if (!w || w.dead) return;
    if (ok) { this.fails = 0; const n = w.node.querySelector('.offline'); if (n) n.remove(); return; }
    this.fails = (this.fails || 0) + 1;
    if (this.fails < 4 || w.node.querySelector('.offline')) return;
    w.node.querySelector('[data-map]').append(el(
      `<div class="offline"><b style="display:block;font-size:13px;color:var(--txt);margin-bottom:2px">Map unavailable</b>
       Tiles come from the network, and there isn't one right now.</div>`));
  },

  card(title, sub, extra) {
    const w = this.w; if (!w) return;
    const c = w.node.querySelector('[data-card]'); if (!c) return;
    c.innerHTML = `<h3>${esc(title)}</h3><p>${esc(sub)}</p>
      ${extra ? `<p style="margin-top:6px;color:var(--green)">${esc(extra)}</p>` : ''}
      <div class="row"><button class="btn pri" style="flex:1" data-dir>Directions</button>
      <button class="btn" style="flex:1" data-save>Save</button></div>`;
    on(c, 'click', '[data-dir]', () => Toast(`Routing to ${title} isn't in this build`));
    on(c, 'click', '[data-save]', () => Toast(`${title} added to Favourites`));
  },

  clearResults() {
    const w = this.w; if (!w) return;
    const r = w.node.querySelector('.results'); if (r) r.remove();
  },

  /* Nominatim: OpenStreetMap's own geocoder, no key, CORS open. One request per
     Enter press, never per keystroke — their usage policy asks for exactly that. */
  async search(q) {
    if (!q || !this.w) return;
    this.clearResults();
    const box = this.w.node.querySelector('[data-map]');
    const panel = el(`<div class="results"><div style="padding:9px 10px;font-size:12px;color:var(--txt-2)">Searching…</div></div>`);
    box.append(panel);
    try {
      const r = await fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&q=' +
        encodeURIComponent(q), { headers: { 'Accept': 'application/json' } });
      const list = await r.json();
      if (!this.w || this.w.dead || !panel.isConnected) return;
      if (!list.length) {
        panel.innerHTML = `<div style="padding:9px 10px;font-size:12px;color:var(--txt-2)">No results for “${esc(q)}”</div>`;
        return;
      }
      panel.innerHTML = list.map((h, i) => {
        const name = h.name || h.display_name.split(',')[0];
        return `<button data-hit="${i}"><b>${esc(name)}</b><span>${esc(h.display_name)}</span></button>`;
      }).join('');
      on(panel, 'click', '[data-hit]', (e, t) => {
        const h = list[+t.dataset.hit];
        const z = h.boundingbox ? this.zoomForBox(h.boundingbox) : 15;
        this.goto(+h.lat, +h.lon, z, h.name || h.display_name.split(',')[0],
          h.display_name.split(',').slice(1, 4).join(',').trim());
        this.clearResults();
      });
    } catch (e) {
      if (panel.isConnected) panel.innerHTML =
        `<div style="padding:9px 10px;font-size:12px;color:var(--txt-2)">Search needs a network connection.</div>`;
    }
  },

  /* Fit the result's bounding box, so a country doesn't land at street zoom. */
  zoomForBox(bb) {
    const [s, n, wl, e] = bb.map(Number);
    const span = Math.max(Math.abs(n - s), Math.abs(e - wl));
    if (span > 20) return 4; if (span > 8) return 6; if (span > 2) return 8;
    if (span > .5) return 11; if (span > .1) return 13; if (span > .02) return 15;
    return 16;
  },
};

/* ============================================================================
   24 · PHOTOS
   ========================================================================== */
/* The library is real photographs — Commons featured pictures, carrying the titles,
   places, dates and photographers they actually came with. `th` is a 1000px thumbnail
   URL, and Commons will render any width from it, so tiles ask for what they need. */
const PHOTOS = [
  { t: 'Sydney (AU), Coast, Australian Fur Seals', place: 'Sydney, Australia', by: 'Dietmar Rabich', album: 'Coast', when: '2026-05-11',
    th: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3b/Sydney_%28AU%29%2C_Coast%2C_Australian_Fur_Seals_--_2019_--_3489.jpg/500px-Sydney_%28AU%29%2C_Coast%2C_Australian_Fur_Seals_--_2019_--_3489.jpg' },
  { t: 'New York City at night', place: 'New York City', by: 'Paulo Barcellos Jr.', album: 'Cities', when: '2025-03-15',
    th: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/22/New_York_City_at_night_HDR.jpg/500px-New_York_City_at_night_HDR.jpg' },
  { t: 'Northern lights over Mývatn (Iceland)', place: 'Iceland', by: 'Giles Laurent', album: 'Skies', when: '2024-12-14',
    th: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/99/039_Northern_lights_over_M%C3%BDvatn_%28Iceland%29_Photo_by_Giles_Laurent.jpg/500px-039_Northern_lights_over_M%C3%BDvatn_%28Iceland%29_Photo_by_Giles_Laurent.jpg' },
  { t: 'Human looking at the stars during Perseids with th', place: 'Under the Perseids', by: 'Giles Laurent', album: 'Skies', when: '2023-12-14',
    th: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/23/018_Human_looking_at_the_stars_during_Perseids_with_the_Milky_Way_in_the_background_Photo_by_Giles_Laurent.jpg/500px-018_Human_looking_at_the_stars_during_Perseids_with_the_Milky_Way_in_the_background_Photo_by_Giles_Laurent.jpg' },
  { t: 'Étang de Thau and Sète', place: 'Sète, France', by: 'Christian Ferrer', album: 'Coast', when: '2022-01-10',
    th: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4e/%C3%89tang_de_Thau_and_S%C3%A8te.jpg/500px-%C3%89tang_de_Thau_and_S%C3%A8te.jpg' },
  { t: 'Peterborough (AU), Port Campbell National Park, Worm B', place: 'Victoria, Australia', by: 'Dietmar Rabich', album: 'Coast', when: '2021-07-20',
    th: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e2/Peterborough_%28AU%29%2C_Port_Campbell_National_Park%2C_Worm_Bay_--_2019_--_0863.jpg/500px-Peterborough_%28AU%29%2C_Port_Campbell_National_Park%2C_Worm_Bay_--_2019_--_0863.jpg' },
  { t: 'Lac de Montriond', place: 'Haute-Savoie, France', by: 'Krzysztof Golik', album: 'Landscapes', when: '2020-06-30',
    th: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/84/Lac_de_Montriond_06.jpg/500px-Lac_de_Montriond_06.jpg' },
  { t: 'Gaztelugache, Bermeo', place: 'Bermeo, Basque Country', by: 'Diego Delso', album: 'Coast', when: '2019-08-13',
    th: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/64/Gaztelugache%2C_Bermeo%2C_Pa%C3%ADs_Vasco%2C_Espa%C3%B1a%2C_2019-08-13%2C_DD_14.jpg/500px-Gaztelugache%2C_Bermeo%2C_Pa%C3%ADs_Vasco%2C_Espa%C3%B1a%2C_2019-08-13%2C_DD_14.jpg' },
  { t: 'Water reflection of Kinkaku-ji Temple a sunny day, Kyo', place: 'Kyoto, Japan', by: 'Basile Morin', album: 'Travel', when: '2019-08-13',
    th: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/de/Water_reflection_of_Kinkaku-ji_Temple_a_sunny_day%2C_Kyoto%2C_Japan.jpg/500px-Water_reflection_of_Kinkaku-ji_Temple_a_sunny_day%2C_Kyoto%2C_Japan.jpg' },
  { t: 'Sunlight through clouds and view of Ginkaku-ji Temple', place: 'Kyoto, Japan', by: 'Basile Morin', album: 'Travel', when: '2019-06-11',
    th: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/99/Sunlight_through_clouds_and_view_of_Ginkaku-ji_Temple_from_above%2C_Kyoto%2C_Japan.jpg/500px-Sunlight_through_clouds_and_view_of_Ginkaku-ji_Temple_from_above%2C_Kyoto%2C_Japan.jpg' },
  { t: 'Bontecou Lake Milky Way panorama', place: 'Hudson Valley, New York', by: 'Juliancolton', album: 'Skies', when: '2018-09-05',
    th: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2e/Bontecou_Lake_Milky_Way_panorama.jpg/500px-Bontecou_Lake_Milky_Way_panorama.jpg' },
  { t: 'Lo sbadiglio', place: '', by: 'Alberto Peracchio', album: 'Wildlife', when: '2018-02-25',
    th: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/41/Lo_sbadiglio.jpg/500px-Lo_sbadiglio.jpg' },
  { t: 'Dülmen, Börnste, Waldweg', place: 'Dülmen, Germany', by: 'Dietmar Rabich', album: 'Nature', when: '2017-09-19',
    th: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/ef/D%C3%BClmen%2C_B%C3%B6rnste%2C_Waldweg_--_2015_--_4649.jpg/500px-D%C3%BClmen%2C_B%C3%B6rnste%2C_Waldweg_--_2015_--_4649.jpg' },
  { t: 'Québec city at night, view from Lévis city', place: 'Québec City, Canada', by: 'Wilfredor', album: 'Cities', when: '2017-08-26',
    th: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f4/Qu%C3%A9bec_city_at_night%2C_view_from_L%C3%A9vis_city.jpg/500px-Qu%C3%A9bec_city_at_night%2C_view_from_L%C3%A9vis_city.jpg' },
  { t: 'Vulpes lagopus in Iceland', place: 'Iceland', by: 'Jonathen Pie https://unsplash.com/@r3dmax', album: 'Wildlife', when: '2017-01-13',
    th: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/ea/Vulpes_lagopus_in_Iceland.jpg/500px-Vulpes_lagopus_in_Iceland.jpg' },
  { t: 'Larus occidentalis in flight', place: '', by: 'Frank Schulenburg', album: 'Wildlife', when: '2016-01-25',
    th: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ad/Larus_occidentalis_in_flight_%28Bodega_Head%29.jpg/500px-Larus_occidentalis_in_flight_%28Bodega_Head%29.jpg' },
  { t: 'Afternoon at Tennfjorden, Raftsundet', place: 'Lofoten, Norway', by: 'Ximonic (Simo Räsänen)', album: 'Nature', when: '2015-09-21',
    th: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/27/Afternoon_at_Tennfjorden%2C_Raftsundet%2C_Hinn%C3%B8ya%2C_Norway%2C_2015_September_%2802%29.jpg/500px-Afternoon_at_Tennfjorden%2C_Raftsundet%2C_Hinn%C3%B8ya%2C_Norway%2C_2015_September_%2802%29.jpg' },
  { t: 'Hyacinth macaw (Anodorhynchus hyacinthinus) in flight', place: '', by: 'Charles J. Sharp', album: 'Wildlife', when: '2015-09-14',
    th: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/58/Hyacinth_macaw_%28Anodorhynchus_hyacinthinus%29_in_flight.JPG/500px-Hyacinth_macaw_%28Anodorhynchus_hyacinthinus%29_in_flight.JPG' },
  { t: 'Piazzetta San Marco Venice', place: 'Venice, Italy', by: 'Benh LIEU SONG', album: 'Travel', when: '2015-07-10',
    th: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/48/Piazzetta_San_Marco_Venice_BLS.jpg/500px-Piazzetta_San_Marco_Venice_BLS.jpg' },
  { t: 'Mountain lake, Mylgval mountain cirque, Western Caucas', place: 'Western Caucasus', by: 'Vyacheslav Argenberg', album: 'Landscapes', when: '2014-08-02',
    th: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/23/Mountain_lake%2C_Mylgval_mountain_cirque%2C_Western_Caucasus.jpg/500px-Mountain_lake%2C_Mylgval_mountain_cirque%2C_Western_Caucasus.jpg' },
  { t: 'Larus californicus Palo Alto May 2011', place: 'Palo Alto, California', by: 'King of Hearts', album: 'Wildlife', when: '2013-10-27',
    th: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1e/Larus_californicus_Palo_Alto_May_2011_001.jpg/500px-Larus_californicus_Palo_Alto_May_2011_001.jpg' },
  { t: 'The Bridge', place: '', by: 'Frank Schulenburg', album: 'Cities', when: '2013-08-15',
    th: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/01/The_Bridge_%28August_2013%29.jpg/500px-The_Bridge_%28August_2013%29.jpg' },
  { t: 'Panorama Piazza San Marco and Venice on Easter 2013', place: 'Venice, Italy', by: 'This Photo was taken by Wolfgang Moroder. ', album: 'Travel', when: '2013-03-31',
    th: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b2/Panorama_Piazza_San_Marco_and_Venice_on_Easter_2013.jpg/500px-Panorama_Piazza_San_Marco_and_Venice_on_Easter_2013.jpg' },
  { t: 'Namib-Naukluft Sand Dunes', place: 'Sossusvlei, Namibia', by: 'Yathin S Krishnappa', album: 'Nature', when: '2013-02-08',
    th: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/89/Namib-Naukluft_Sand_Dunes_%282011%29.jpg/500px-Namib-Naukluft_Sand_Dunes_%282011%29.jpg' },
  { t: 'Canal Grande Chiesa della Salute e Dogana dal ponte de', place: 'Venice, Italy', by: 'This Photo was taken by Wolfgang Moroder. ', album: 'Travel', when: '2012-12-12',
    th: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a3/Canal_Grande_Chiesa_della_Salute_e_Dogana_dal_ponte_dell_Accademia.jpg/500px-Canal_Grande_Chiesa_della_Salute_e_Dogana_dal_ponte_dell_Accademia.jpg' },
  { t: 'Aurora borealis above Storfjorden and the Lyngen Alps', place: 'Troms, Norway', by: 'Ximonic (Simo Räsänen)', album: 'Skies', when: '2012-03-04',
    th: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/60/Aurora_borealis_above_Storfjorden_and_the_Lyngen_Alps_in_moonlight%2C_2012_March.jpg/500px-Aurora_borealis_above_Storfjorden_and_the_Lyngen_Alps_in_moonlight%2C_2012_March.jpg' },
  { t: 'Tilisunahütte Panorama', place: 'Montafon, Austria', by: 'böhringer friedrich', album: 'Landscapes', when: '2011-08-01',
    th: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/36/Tilisunah%C3%BCtte_Panorama.jpg/500px-Tilisunah%C3%BCtte_Panorama.jpg' },
  { t: 'Sossusvlei sand dunes', place: 'Sossusvlei, Namibia', by: 'Winfried Bruenken (Amrum)', album: 'Nature', when: '2009-12-19',
    th: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/cd/Sossusvlei_sand_dunes.jpg/500px-Sossusvlei_sand_dunes.jpg' },
  { t: 'Havelock Island, Sandy lagoon, Andaman Islands', place: 'Havelock Island, Andamans', by: 'Vyacheslav Argenberg', album: 'Coast', when: '2009-11-25',
    th: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/19/Havelock_Island%2C_Sandy_lagoon%2C_Andaman_Islands.jpg/500px-Havelock_Island%2C_Sandy_lagoon%2C_Andaman_Islands.jpg' },
  { t: 'Havelock Island, Mangrove tree on the beach, Andaman I', place: 'Havelock Island, Andamans', by: 'Vyacheslav Argenberg', album: 'Coast', when: '2009-11-21',
    th: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/51/Havelock_Island%2C_Mangrove_tree_on_the_beach%2C_Andaman_Islands.jpg/500px-Havelock_Island%2C_Mangrove_tree_on_the_beach%2C_Andaman_Islands.jpg' },
  { t: 'Chola Mountain Lake, Nepal', place: 'Solukhumbu, Nepal', by: 'Vyacheslav Argenberg', album: 'Landscapes', when: '2009-10-18',
    th: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5f/Chola_Mountain_Lake%2C_Nepal.jpg/500px-Chola_Mountain_Lake%2C_Nepal.jpg' },
  { t: 'Mountains in snow, Mountain lake', place: 'Solukhumbu, Nepal', by: 'Vyacheslav Argenberg', album: 'Landscapes', when: '2009-10-18',
    th: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5a/Mountains_in_snow%2C_Mountain_lake%2C_Chola_Valley%2C_Nepal%2C_Himalayas.jpg/500px-Mountains_in_snow%2C_Mountain_lake%2C_Chola_Valley%2C_Nepal%2C_Himalayas.jpg' },
  { t: 'San Francisco with two bridges and the low fog', place: 'San Francisco, California', by: 'Brocken Inaglory', album: 'Cities', when: '2009-10-15',
    th: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4c/San_Francisco_with_two_bridges_and_the_low_fog.jpg/500px-San_Francisco_with_two_bridges_and_the_low_fog.jpg' },
  { t: 'Golden Gate Bridge at sunset', place: 'San Francisco, California', by: 'Brocken Inaglory', album: 'Cities', when: '2009-10-15',
    th: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d3/Golden_Gate_Bridge_at_sunset_1.jpg/500px-Golden_Gate_Bridge_at_sunset_1.jpg' },
  { t: 'Boletus in Finnish forest', place: 'Finland', by: 'Petritap', album: 'Nature', when: '2009-09-15',
    th: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/59/Boletus_in_Finnish_forest.jpg/500px-Boletus_in_Finnish_forest.jpg' },
  { t: 'Sunflower macro wide', place: '', by: 'Muhammad Mahdi Karim', album: 'Close-ups', when: '2009-03-09',
    th: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d7/Sunflower_macro_wide.jpg/500px-Sunflower_macro_wide.jpg' },
  { t: 'New York Midtown Skyline at night', place: 'New York City', by: 'Diliff', album: 'Cities', when: '2008-11-02',
    th: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/52/New_York_Midtown_Skyline_at_night_-_Jan_2006_edit1.jpg/500px-New_York_Midtown_Skyline_at_night_-_Jan_2006_edit1.jpg' },
  { t: 'Lily Lilium \'Citronella\' Flower', place: '', by: 'Photo by and (c)2007 Derek Ramsey (Ram-Man', album: 'Close-ups', when: '2007-09-20',
    th: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2b/Lily_Lilium_%27Citronella%27_Flower.jpg/500px-Lily_Lilium_%27Citronella%27_Flower.jpg' },
  { t: 'Lienz', place: 'Lienz, Austria', by: 'böhringer friedrich', album: 'Landscapes', when: '2007-09-13',
    th: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/76/Lienz_SG8.JPG/500px-Lienz_SG8.JPG' },
  { t: 'Sossusvlei Dune Namib Desert Namibia Luca Galuzzi 2004', place: 'Sossusvlei, Namibia', by: 'Luca Galuzzi (Lucag)', album: 'Nature', when: '2004-07-19',
    th: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/45/Sossusvlei_Dune_Namib_Desert_Namibia_Luca_Galuzzi_2004.JPG/500px-Sossusvlei_Dune_Namib_Desert_Namibia_Luca_Galuzzi_2004.JPG' },
].map((p, i) => ({ ...p, id: i + 1, fav: [1, 4, 9, 12, 19, 26].includes(i) }));
let PH_ID = PHOTOS.length;

/* upload.wikimedia.org only serves a fixed set of thumbnail widths now — ask for 400
   and you get a 400 back, with an HTML body that Chromium then blocks as an opaque
   response. So every request snaps up to the nearest size that exists. */
const PH_SIZES = [250, 500, 1280];
const phAt = (p, want) => {
  const w = PH_SIZES.find(s => s >= want) || PH_SIZES[PH_SIZES.length - 1];
  return p.th.replace(/\/\d+px-/, `/${w}px-`);
};
const phDate = w => new Date(w + 'T12:00:00');

/* Forty tiles asking Wikimedia for a thumbnail at once earns a wall of 429s, which
   Chromium then blocks outright — a grid of grey squares. So loading is queued a few
   at a time, only for tiles near the viewport, and a rejected request is retried. */
const PhLoad = {
  q: [], active: 0, MAX: 5,
  io: typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(es => {
    es.forEach(e => {
      if (!e.isIntersecting) return;
      PhLoad.io.unobserve(e.target);
      PhLoad.q.push(e.target);
    });
    PhLoad.pump();
  }, { rootMargin: '320px' }),

  /** Hand every <img data-src> in a freshly rendered subtree to the queue. */
  scan(root) {
    root.querySelectorAll('img[data-src]:not([data-q])').forEach(img => {
      img.dataset.q = '1';
      /* The photo you actually opened jumps the queue. */
      if (img.hasAttribute('data-first')) this.q.unshift(img);
      else if (this.io) this.io.observe(img);
      else this.q.push(img);
    });
    this.pump();
  },
  pump() {
    while (this.active < this.MAX && this.q.length) {
      const img = this.q.shift();
      if (!img.isConnected || img.dataset.done) continue;
      this.active++;
      const next = () => { this.active--; this.pump(); };
      img.onload = () => { img.dataset.done = '1'; img.classList.add('in'); next(); };
      img.onerror = () => {
        const n = +(img.dataset.try || 0) + 1;
        img.dataset.try = n;
        if (n <= 3) setTimeout(() => { this.q.push(img); this.pump(); }, 500 * n * n);
        else { img.classList.add('failed'); img.dataset.done = '1'; }
        next();
      };
      /* A retry needs a URL the cache hasn't already filed as broken. Wikimedia
         ignores unknown query params on thumbnails, so this is a free cache-buster. */
      img.src = img.dataset.src + (img.dataset.try > 0 ? '?r=' + img.dataset.try : '');
    }
  },
};

APPS.photos = {
  name: 'Photos', icon: 'app-photos', w: 1060, h: 700, minW: 640, minH: 420,
  menus: () => stdMenus('photos', {
    View: [{ id: 'y', label: 'Years', run: () => Ph.group('Years') },
    { id: 'm', label: 'Months', run: () => Ph.group('Months') },
    { id: 'd', label: 'Days', run: () => Ph.group('Days') },
    { id: 'a', label: 'All Photos', checked: true, run: () => Ph.group('All') }],
  }),
  mount(w) {
    const albums = [...new Set(PHOTOS.map(p => p.album))].sort();
    w.st = { view: 'Library', group: 'All', sel: null, pick: null, q: '', web: null, info: true };
    const S = [
      { head: 'Photos', items: [['Library', 'g-gallery'], ['Recents', 'g-clock-a'], ['Favourites', 'g-star'], ['Memories', 'g-star']] },
      { head: 'Albums', items: albums.map(a => [a, 'g-folder-g']) },
    ];
    return `<div class="wb"><div class="ph">
      <div class="sbar" data-drag style="width:206px"><div class="sb-top"><div data-tl></div></div>
      ${S.map(g => `<div class="grp"><div class="gh">${g.head}</div>${g.items.map(([n, i]) =>
      `<div class="si" data-pv="${esc(n)}">${ic(i, 'ico')}<span class="nm">${esc(n)}</span></div>`).join('')}</div>`).join('')}
      </div>
      <div class="ph-main">
        <div class="tbar" data-drag style="height:52px">
          <button class="tbtn" data-nodrag data-pback title="Back" style="display:none">${ic('g-chev-l')}</button>
          <div class="fx-title" data-ptitle style="position:static;text-align:left">Library</div>
          <div class="grow" style="flex:1"></div>
          <div class="seg" data-nodrag data-pseg>${[['Years', 38], ['Months', 44], ['Days', 36], ['All', 32]].map(([g, wd]) =>
      `<button data-pgroup="${g}"${g === 'All' ? ' class="on"' : ''} style="width:${wd}px;font-size:11px">${g}</button>`).join('')}</div>
          <button class="tbtn" data-nodrag data-pfav title="Favourite">${ic('g-star')}</button>
          <button class="tbtn" data-nodrag data-pinfo title="Info" style="display:none">${ic('g-info')}</button>
          <button class="tbtn" data-nodrag data-pshare title="Share">${ic('g-share')}</button>
          <div class="sfield" data-nodrag style="width:172px"><span>${ic('g-search')}</span><input placeholder="Search" data-psearch spellcheck="false"></div>
        </div>
        <div class="ph-body" data-pbody></div>
        <div class="ph-foot" data-pstat></div>
      </div></div></div>`;
  },
  ready(w) {
    Ph.w = w;
    on(w.node, 'click', '[data-pv]', (e, t) => {
      w.st.view = t.dataset.pv; w.st.sel = null; w.st.q = ''; w.st.web = null;
      w.node.querySelector('[data-psearch]').value = '';
      Ph.render(w);
    });
    on(w.node, 'click', '[data-pgroup]', (e, t) => Ph.group(t.dataset.pgroup, w));
    /* Selecting moves a class rather than re-rendering. Rebuilding the grid on the
       first click of a double-click swaps the element out from under the second one,
       so the dblclick never arrives and the photo never opens. */
    on(w.node, 'click', '[data-pi]', (e, t) => {
      w.st.pick = +t.dataset.pi;
      $$('.ph-cell', w.node).forEach(c => c.classList.toggle('on', c === t));
      Ph.paintChrome(w);
    });
    on(w.node, 'dblclick', '[data-pi]', (e, t) => Ph.open(w, +t.dataset.pi));
    on(w.node, 'click', '[data-pback]', () => { w.st.sel = null; Ph.render(w); });
    on(w.node, 'click', '[data-pstrip]', (e, t) => Ph.open(w, +t.dataset.pstrip));
    on(w.node, 'click', '[data-pfav]', () => Ph.toggleFav(w));
    on(w.node, 'click', '[data-pinfo]', () => { w.st.info = !w.st.info; Ph.render(w); });
    on(w.node, 'click', '[data-pdel]', () => Ph.remove(w));
    on(w.node, 'click', '[data-pweb]', (e, t) => Ph.search(w, t.dataset.pweb));
    on(w.node, 'click', '[data-padd]', (e, t) => Ph.add(w, +t.dataset.padd));
    on(w.node, 'click', '[data-pnudge]', (e, t) => Ph.step(w, +t.dataset.pnudge));
    on(w.node, 'click', '[data-pshare]', (e, t) => {
      const p = Ph.current(w);
      menuUnder(t, [
        { id: 'm', label: 'Mail', icon: 'g-compose', run: () => Mail.compose(p ? p.t : 'Photos') },
        { id: 'g', label: 'Messages', icon: 'g-facetime', run: () => WM.open('messages') }, '-',
        { id: 'c', label: 'Copy Photo', run: () => Toast(p ? 'Copied “' + p.t + '”' : 'Select a photo first') },
        { id: 'w', label: 'Open on Wikimedia Commons', run: () => p ? WM.open('safari', { url: p.th }) : Toast('Select a photo first') },
      ]);
    });
    const sf = w.node.querySelector('[data-psearch]');
    sf.addEventListener('input', () => {
      w.st.q = sf.value.trim(); w.st.sel = null; w.st.web = null;
      Ph.render(w);
    });
    /* Enter goes straight to the web, the way Photos falls through to its online
       results when the library has nothing to show. */
    sf.addEventListener('keydown', e => { if (e.key === 'Enter' && w.st.q) Ph.search(w, w.st.q); });
    /* Arrow keys drive the viewer, which is the only way anyone browses photos. */
    w.node.addEventListener('keydown', e => {
      if (w.st.sel == null) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); Ph.step(w, 1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); Ph.step(w, -1); }
      if (e.key === 'Escape') { e.preventDefault(); w.st.sel = null; Ph.render(w); }
    });
    Ph.render(w);
  },
  onClose(w) { if (Ph.w === w) Ph.w = null; },
};

const Ph = {
  w: null,

  /** What the current sidebar selection and query resolve to. */
  list(w) {
    const v = w.st.view;
    let out = PHOTOS;
    if (v === 'Favourites') out = out.filter(p => p.fav);
    else if (v === 'Recents') out = out.slice(0, 18);
    else if (v === 'Memories') out = out.filter(p => ['Skies', 'Travel', 'Coast'].includes(p.album));
    else if (v !== 'Library') out = out.filter(p => p.album === v);
    const q = w.st.q.toLowerCase();
    if (q) out = out.filter(p =>
      (p.t + ' ' + p.place + ' ' + p.album + ' ' + p.by + ' ' + p.when).toLowerCase().includes(q));
    return out;
  },
  current(w) {
    const id = w.st.sel != null ? w.st.sel : w.st.pick;
    return id == null ? null : PHOTOS.find(p => p.id === id);
  },
  group(g, w) {
    w = w || this.w; if (!w) return;
    w.st.group = g; w.st.sel = null;
    this.render(w);
  },
  open(w, id) { w.st.sel = id; w.st.pick = id; this.render(w); },
  step(w, d) {
    const l = this.list(w);
    const i = l.findIndex(p => p.id === w.st.sel);
    if (i < 0) return;
    this.open(w, l[(i + d + l.length) % l.length].id);
  },
  toggleFav(w) {
    const p = this.current(w);
    if (!p) return Toast('Select a photo first');
    p.fav = !p.fav;
    /* In the grid only the pip and the toolbar change, and re-rendering would drop
       every tile back to a grey square while the queue reloaded it. */
    if (w.st.sel != null || w.st.view === 'Favourites') this.render(w);
    else {
      const cell = w.node.querySelector(`.ph-cell[data-pi="${p.id}"]`);
      if (cell) {
        cell.querySelector('.fav')?.remove();
        if (p.fav) cell.insertAdjacentHTML('beforeend', `<span class="fav">${ic('g-star')}</span>`);
      }
      this.paintChrome(w);
    }
    Toast(p.fav ? 'Added to Favourites' : 'Removed from Favourites');
  },
  remove(w) {
    const p = this.current(w);
    if (!p) return Toast('Select a photo first');
    PHOTOS.splice(PHOTOS.indexOf(p), 1);
    w.st.sel = null; w.st.pick = null;
    this.render(w);
    Toast('Deleted “' + p.t + '”');
  },

  /* ---- rendering ---- */
  /** Toolbar, title and status line — everything outside the photo area. */
  paintChrome(w) {
    const st = w.st, det = st.sel != null, cur = this.current(w);
    $$('[data-pv]', w.node).forEach(b => b.classList.toggle('on', b.dataset.pv === st.view));
    $$('[data-pgroup]', w.node).forEach(b => b.classList.toggle('on', b.dataset.pgroup === st.group));
    w.node.querySelector('[data-pback]').style.display = det ? '' : 'none';
    w.node.querySelector('[data-pseg]').style.display = det ? 'none' : '';
    w.node.querySelector('[data-pinfo]').style.display = det ? '' : 'none';
    w.node.querySelector('[data-pfav]').classList.toggle('on', !!(cur && cur.fav));
    w.node.querySelector('[data-pinfo]').classList.toggle('on', det && st.info);
    w.node.querySelector('[data-ptitle]').textContent =
      det ? (cur ? cur.t : st.view) : st.q ? `Search: ${st.q}` : st.view;
    const l = this.list(w);
    const favs = PHOTOS.filter(p => p.fav).length;
    const found = st.web && st.web.items ? `${st.web.items.length} from Wikimedia Commons` : '';
    w.node.querySelector('[data-pstat]').textContent = det && cur
      ? [cur.place || cur.album, cur.when, cur.by].filter(Boolean).join(' · ')
      : [`${l.length} ${l.length === 1 ? 'Photo' : 'Photos'}`, st.q ? found : `${favs} Favourite${favs === 1 ? '' : 's'}`]
        .filter(Boolean).join(' · ');
  },
  render(w) {
    w = w || this.w; if (!w) return;
    this.paintChrome(w);
    const body = w.node.querySelector('[data-pbody]');
    if (w.st.sel != null) { body.innerHTML = this.detailHTML(w); this.centreStrip(w); }
    else body.innerHTML = this.gridHTML(w);
    PhLoad.scan(body);
  },

  /** Section headings for the current grouping. */
  buckets(w, list) {
    const g = w.st.group;
    if (g === 'All') return [{ head: '', sub: '', items: list }];
    const keyOf = p => g === 'Years' ? p.when.slice(0, 4)
      : g === 'Months' ? p.when.slice(0, 7) : p.when;
    const map = new Map();
    list.forEach(p => { const k = keyOf(p); (map.get(k) || map.set(k, []).get(k)).push(p); });
    return [...map].map(([k, items]) => {
      const d = phDate(items[0].when);
      const head = g === 'Years' ? k
        : g === 'Months' ? `${MONS[d.getMonth()]} ${d.getFullYear()}`
          : `${DAYS[d.getDay()]}, ${d.getDate()} ${MONS[d.getMonth()]} ${d.getFullYear()}`;
      /* Photos captions a group with the places in it, so this does too. */
      const places = [...new Set(items.map(p => p.place).filter(Boolean))];
      const sub = places.slice(0, 3).join(' · ') + (places.length > 3 ? ` & ${places.length - 3} more` : '');
      return { head, sub, items };
    });
  },
  gridHTML(w) {
    const st = w.st, list = this.list(w);
    const big = st.group !== 'All';
    /* Photos gives a day with only a shot or two more room, so a sparse group
       reads as emphasis rather than as an empty row. */
    const tile = (p, span) => `<figure class="ph-cell${p.id === st.pick ? ' on' : ''}" data-pi="${p.id}"
      title="${esc(p.t)}"${span > 1 ? ` style="grid-column:span ${span}"` : ''}>
      <img data-src="${phAt(p, big ? 500 : 250)}" alt="${esc(p.t)}" decoding="async">
      ${p.fav ? `<span class="fav">${ic('g-star')}</span>` : ''}</figure>`;

    if (!list.length && !st.web) {
      return `<div class="ph-empty">
        <div class="ico">${ic('g-gallery')}</div>
        <b>${st.q ? `No photos match “${esc(st.q)}”` : 'Nothing here yet'}</b>
        ${st.q ? `<p>Look on Wikimedia Commons instead — whatever you pick joins your library.</p>
          <button class="btn pri" data-pweb="${esc(st.q)}">Search the web for “${esc(st.q)}”</button>` : ''}</div>`;
    }
    const cols = st.group === 'Years' ? 'repeat(auto-fill,minmax(340px,1fr))'
      : st.group === 'Months' ? 'repeat(auto-fill,minmax(240px,1fr))'
        : st.group === 'Days' ? 'repeat(auto-fill,minmax(190px,1fr))'
          : 'repeat(auto-fill,minmax(126px,1fr))';
    const sections = this.buckets(w, list).map(b => {
      const span = big && b.items.length < 3 ? 2 : 1;
      return `${b.head ? `<div class="ph-head"><b>${esc(b.head)}</b>${b.sub ? `<span>${esc(b.sub)}</span>` : ''}</div>` : ''}
       <div class="ph-grid${big ? ' big' : ''}" style="grid-template-columns:${cols}">${b.items.map(p => tile(p, span)).join('')}</div>`;
    }).join('');
    return `<div class="ph-scroll scroll">${sections}${this.webHTML(w)}
      ${st.q && !st.web ? `<div class="ph-more"><button class="btn" data-pweb="${esc(st.q)}">Search the web for “${esc(st.q)}”</button></div>` : ''}</div>`;
  },
  /** The imported-from-the-web strip, with its loading and failure states. */
  webHTML(w) {
    const web = w.st.web;
    if (!web) return '';
    const head = sub => `<div class="ph-head"><b>Wikimedia Commons</b><span>${sub}</span></div>`;
    if (web.loading) return head(`Searching “${esc(web.q)}”…`) +
      `<div class="ph-grid" style="grid-template-columns:repeat(auto-fill,minmax(126px,1fr))">
      ${[...Array(8)].map(() => `<div class="ph-cell skel"></div>`).join('')}</div>`;
    if (web.error) return head(esc(web.error));
    if (!web.items.length) return head(`Nothing found for “${esc(web.q)}”`);
    return head(`${web.items.length} results · click to add`) +
      `<div class="ph-grid" style="grid-template-columns:repeat(auto-fill,minmax(126px,1fr))">
      ${web.items.map((it, i) => `<figure class="ph-cell web" data-padd="${i}" title="${esc(it.t)}">
        <img data-src="${it.th}" alt="${esc(it.t)}" decoding="async">
        <span class="plus">${ic('g-plus')}</span></figure>`).join('')}</div>`;
  },
  detailHTML(w) {
    const p = PHOTOS.find(x => x.id === w.st.sel);
    if (!p) return '';
    const l = this.list(w);
    const i = l.findIndex(x => x.id === p.id);
    const d = phDate(p.when);
    return `<div class="ph-det">
      <div class="stage">
        <button class="nav l" data-pnudge="-1" title="Previous">${ic('g-chev-l')}</button>
        <img data-src="${phAt(p, 1280)}" data-first alt="${esc(p.t)}" decoding="async">
        <button class="nav r" data-pnudge="1" title="Next">${ic('g-chev-r')}</button>
      </div>
      ${w.st.info ? `<aside class="ph-info">
        <h4>${esc(p.t)}</h4>
        <div class="when">${DAYS[d.getDay()]}, ${d.getDate()} ${MONS[d.getMonth()]} ${d.getFullYear()}</div>
        ${p.place ? `<div class="row">${ic('g-pin')}<span>${esc(p.place)}</span></div>` : ''}
        <div class="row">${ic('g-camera')}<span>${esc(p.by)}</span></div>
        <div class="row">${ic('g-folder-g')}<span>${esc(p.album)}</span></div>
        <div class="acts">
          <button class="btn${p.fav ? ' pri' : ''}" data-pfav>${p.fav ? 'Favourited' : 'Favourite'}</button>
          <button class="btn" data-pdel>Delete</button>
        </div>
        <p class="lic">A featured picture from Wikimedia Commons, shown with the credit it carries.</p>
      </aside>` : ''}
      <div class="ph-strip" data-pstripbox>${l.map(x =>
      `<img class="${x.id === p.id ? 'on' : ''}" data-pstrip="${x.id}" data-src="${phAt(x, 250)}" alt="${esc(x.t)}">`).join('')}</div>
      <div class="ph-count">${i + 1} of ${l.length}</div></div>`;
  },
  /** Keep the open photo centred in the filmstrip. */
  centreStrip(w) {
    const box = w.node.querySelector('[data-pstripbox]');
    if (!box) return;
    const on = box.querySelector('.on');
    if (on) box.scrollLeft = on.offsetLeft - box.clientWidth / 2 + on.offsetWidth / 2;
  },

  /* ---- the web ---- */
  /** Live Commons search: no key, CORS-enabled, and every hit keeps its credit. */
  async search(w, q) {
    w = w || this.w; if (!w) return;
    w.st.web = { q, loading: true, items: [] };
    this.render(w);
    const url = 'https://commons.wikimedia.org/w/api.php?action=query&generator=search' +
      '&gsrsearch=' + encodeURIComponent('filetype:bitmap ' + q) +
      '&gsrlimit=18&gsrnamespace=6&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=250&format=json&origin=*';
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      const items = Object.values((j.query || {}).pages || {}).map(pg => {
        const ii = (pg.imageinfo || [])[0];
        if (!ii || !ii.thumburl) return null;
        const md = ii.extmetadata || {};
        const by = String((md.Artist && md.Artist.value) || 'Unknown')
          .replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().slice(0, 42) || 'Unknown';
        return {
          t: pg.title.replace(/^File:/, '').replace(/\.[a-z]+$/i, '').replace(/_/g, ' ').slice(0, 60),
          by, th: ii.thumburl,
        };
      }).filter(Boolean);
      /* A slower earlier search must not overwrite a newer one. */
      if (w.dead || !w.st.web || w.st.web.q !== q) return;
      w.st.web = { q, items };
    } catch (err) {
      if (w.dead || !w.st.web || w.st.web.q !== q) return;
      w.st.web = { q, items: [], error: navigator.onLine ? 'Commons did not answer' : 'You are offline' };
    }
    this.render(w);
  },
  add(w, i) {
    const it = w.st.web && w.st.web.items[i];
    if (!it) return;
    const p = {
      id: ++PH_ID, t: it.t, place: '', by: it.by, album: 'Imported',
      when: new Date().toISOString().slice(0, 10), th: it.th, fav: false,
    };
    PHOTOS.unshift(p);
    /* Imported is a brand-new album the first time, so the sidebar has to grow. */
    if (!w.node.querySelector('[data-pv="Imported"]')) {
      w.node.querySelectorAll('.sbar .grp')[1].insertAdjacentHTML('beforeend',
        `<div class="si" data-pv="Imported">${ic('g-folder-g', 'ico')}<span class="nm">Imported</span></div>`);
    }
    w.st.pick = p.id;
    this.render(w);
    Toast('Added “' + p.t + '” to your library');
  },
};

/* ============================================================================
   25 · SMALLER APPS
   ========================================================================== */
APPS.reminders = {
  name: 'Reminders', icon: 'app-reminders', w: 760, h: 540, minW: 480, minH: 320,
  menus: () => stdMenus('reminders'),
  mount(w) {
    const L = [['Today', '#0a84ff', 3], ['Scheduled', '#ff375f', 5], ['All', '#1d1d1f', 11], ['Flagged', '#ff9f0a', 2], ['Completed', '#8e8e93', 24]];
    const items = [
      ['Send design review feedback', 'Today 5:00 PM', false, '#ff375f'],
      ['Review PR #142 — column view sizing', 'Today 6:30 PM', false, '#0a84ff'],
      ['Pick up dry cleaning', 'Today', false, '#ff9f0a'],
      ['Book the car for Saturday', 'Tomorrow', false, '#0a84ff'],
      ['Reply to Anna about the tray blur', 'Tomorrow 9:00 AM', false, '#30d158'],
      ['Fix unfocused window shadows', 'Done', true, '#8e8e93'],
      ['Write the neofetch ASCII by hand', 'Done', true, '#8e8e93'],
    ];
    return `<div class="wb">
      <div class="sbar" data-drag style="width:206px"><div class="sb-top"><div data-tl></div></div>
        <div class="grp"><div class="gh">My Lists</div>
        ${L.map(([n, c, k]) => `<div class="si"><span class="ico" style="width:16px;height:16px;border-radius:50%;background:${c};color:#fff;display:grid;place-items:center;font-size:8px">●</span><span class="nm">${n}</span><span class="tail">${k}</span></div>`).join('')}
        </div></div>
      <div class="wmain">
        <div class="tbar" data-drag style="height:52px">
          <div class="fx-title" style="color:var(--blue);font-size:22px;font-weight:700">Today</div>
          <div class="grow" style="flex:1"></div><button class="tbtn" data-nodrag data-radd title="New Reminder">${ic('g-plus')}</button></div>
        <div class="scroll" style="flex:1;padding:6px 18px 20px" data-rlist>
        ${items.map((it, i) => `<div class="rem" data-ri="${i}" style="display:flex;gap:11px;align-items:flex-start;padding:9px 2px;border-bottom:.5px solid var(--line)">
          <span class="rc" style="width:17px;height:17px;border-radius:50%;border:1.6px solid ${it[2] ? it[3] : 'var(--txt-3)'};background:${it[2] ? it[3] : 'transparent'};flex:none;margin-top:1px;display:grid;place-items:center;color:#fff">${it[2] ? ic('g-check') : ''}</span>
          <span style="min-width:0"><span style="display:block;font-size:13px;${it[2] ? 'color:var(--txt-3);text-decoration:line-through' : ''}">${esc(it[0])}</span>
          <span style="font-size:11.5px;color:var(--txt-2)">${esc(it[1])}</span></span></div>`).join('')}
        </div></div></div>`;
  },
  ready(w) {
    w.node.querySelectorAll('.rc svg').forEach(s => s.style.cssText = 'width:10px;height:10px');
    /* + inserts an empty row you type straight into, like the real app. */
    on(w.node, 'click', '[data-radd]', () => {
      const list = w.node.querySelector('[data-rlist]');
      const row = el(`<div class="rem" style="display:flex;gap:11px;align-items:flex-start;padding:9px 2px;border-bottom:.5px solid var(--line)">
        <span class="rc" style="width:17px;height:17px;border-radius:50%;border:1.6px solid var(--txt-3);flex:none;margin-top:1px;display:grid;place-items:center;color:#fff"></span>
        <span style="min-width:0;flex:1"><span contenteditable="true" data-rnew style="display:block;font-size:13px;outline:none;min-height:17px"></span>
        <span style="font-size:11.5px;color:var(--txt-2)">Today</span></span></div>`);
      list.prepend(row);
      const f = row.querySelector('[data-rnew]');
      f.focus();
      f.addEventListener('blur', () => { if (!f.textContent.trim()) row.remove(); else f.removeAttribute('contenteditable'); });
      f.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); f.blur(); } });
    });
    on(w.node, 'click', '.rem', (e, t) => {
      const c = t.querySelector('.rc'), done = !!c.querySelector('svg');
      const lbl = t.querySelector('span span');
      if (done) { c.innerHTML = ''; c.style.background = 'transparent'; c.style.borderColor = 'var(--txt-3)'; lbl.style.cssText = 'display:block;font-size:13px'; }
      else {
        c.innerHTML = ic('g-check'); c.querySelector('svg').style.cssText = 'width:10px;height:10px';
        c.style.background = '#0a84ff'; c.style.borderColor = '#0a84ff';
        lbl.style.cssText = 'display:block;font-size:13px;color:var(--txt-3);text-decoration:line-through';
      }
    });
  }
};

/* ----------------------------------------------------------------------------
   Live forecast. Open-Meteo needs no key and sends CORS headers, so the app and
   the notification-centre widget can share one real reading. Cupertino, because
   that's where macOS points on a fresh install.
   -------------------------------------------------------------------------- */
const Wx = {
  place: 'Cupertino', lat: 37.3230, lon: -122.0322,
  data: null, pending: null,

  /* WMO code → label and glyph. Night swaps the sun for a moon. */
  code(c, day = 1) {
    const t = {
      0: ['Clear', day ? 'g-sun' : 'g-moon'], 1: ['Mostly Clear', day ? 'g-sun' : 'g-moon'],
      2: ['Partly Cloudy', day ? 'g-suncloud' : 'g-mooncloud'], 3: ['Cloudy', 'g-cloud'],
      45: ['Fog', 'g-fog'], 48: ['Freezing Fog', 'g-fog'],
      51: ['Light Drizzle', 'g-drizzle'], 53: ['Drizzle', 'g-drizzle'], 55: ['Heavy Drizzle', 'g-drizzle'],
      56: ['Freezing Drizzle', 'g-drizzle'], 57: ['Freezing Drizzle', 'g-drizzle'],
      61: ['Light Rain', 'g-rain'], 63: ['Rain', 'g-rain'], 65: ['Heavy Rain', 'g-rain'],
      66: ['Freezing Rain', 'g-rain'], 67: ['Freezing Rain', 'g-rain'],
      71: ['Light Snow', 'g-snow'], 73: ['Snow', 'g-snow'], 75: ['Heavy Snow', 'g-snow'], 77: ['Snow Grains', 'g-snow'],
      80: ['Showers', 'g-rain'], 81: ['Showers', 'g-rain'], 82: ['Heavy Showers', 'g-rain'],
      85: ['Snow Showers', 'g-snow'], 86: ['Snow Showers', 'g-snow'],
      95: ['Thunderstorms', 'g-storm'], 96: ['Thunderstorms', 'g-storm'], 99: ['Thunderstorms', 'g-storm'],
    };
    return t[c] || ['—', 'g-cloud'];
  },

  /* One request per session, shared by every caller. */
  load() {
    if (this.data) return Promise.resolve(this.data);
    if (this.pending) return this.pending;
    const q = `https://api.open-meteo.com/v1/forecast?latitude=${this.lat}&longitude=${this.lon}` +
      `&current=temperature_2m,weather_code,is_day&hourly=temperature_2m,weather_code` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min` +
      `&temperature_unit=fahrenheit&timezone=auto&forecast_days=7`;
    this.pending = fetch(q).then(r => r.json()).then(j => {
      if (!j.current) throw new Error('bad payload');
      this.data = j; Bus.emit('wx', j); return j;
    }).catch(() => { this.pending = null; return null; });
    return this.pending;
  },

  /* Everything below reads whatever has arrived, falling back to a plausible
     reading so nothing renders empty while offline. */
  now() {
    const d = this.data;
    if (!d) return { t: 55, code: 0, day: 1, hi: 83, lo: 53, live: false };
    return {
      t: Math.round(d.current.temperature_2m), code: d.current.weather_code, day: d.current.is_day,
      hi: Math.round(d.daily.temperature_2m_max[0]), lo: Math.round(d.daily.temperature_2m_min[0]), live: true,
    };
  },
  hours(n = 6) {
    const d = this.data;
    if (!d) return [['Now', 55, 'g-sun'], ['5PM', 56, 'g-sun'], ['6PM', 54, 'g-suncloud'],
      ['7PM', 51, 'g-mooncloud'], ['8PM', 49, 'g-moon'], ['9PM', 47, 'g-moon']].slice(0, n);
    /* Open-Meteo returns the whole day from midnight; start at the current hour. */
    const now = new Date(d.current.time);
    let i = d.hourly.time.findIndex(t => new Date(t) >= now);
    if (i < 0) i = 0;
    const out = [];
    for (let k = 0; k < n; k++) {
      const j = Math.min(i + k, d.hourly.time.length - 1);
      const h = new Date(d.hourly.time[j]);
      const hr = h.getHours();
      out.push([k === 0 ? 'Now' : `${hr % 12 || 12}${hr < 12 ? 'AM' : 'PM'}`,
        Math.round(d.hourly.temperature_2m[j]),
        this.code(d.hourly.weather_code[j], hr >= 6 && hr < 20)[1]]);
    }
    return out;
  },
  days() {
    const d = this.data;
    if (!d) return [['Today', 53, 83, 'g-sun'], ['Tue', 55, 81, 'g-sun'], ['Wed', 56, 84, 'g-suncloud'],
      ['Thu', 57, 88, 'g-sun'], ['Fri', 56, 85, 'g-sun'], ['Sat', 54, 79, 'g-suncloud'], ['Sun', 52, 76, 'g-sun']];
    return d.daily.time.map((t, i) => [
      i === 0 ? 'Today' : DAYS3[new Date(t + 'T12:00').getDay()],
      Math.round(d.daily.temperature_2m_min[i]), Math.round(d.daily.temperature_2m_max[i]),
      this.code(d.daily.weather_code[i], 1)[1],
    ]);
  },
};

APPS.weather = {
  name: 'Weather', icon: 'app-weather', w: 460, h: 620, minW: 340, minH: 420,
  menus: () => stdMenus('weather'),
  mount() { return titlebar('Weather', { plain: true }) + `<div class="wx-app" data-wx></div>`; },
  ready(w) {
    const paint = () => {
      if (w.dead) return;
      const n = Wx.now(), hrs = Wx.hours(6), days = Wx.days();
      const [label] = Wx.code(n.code, n.day);
      /* Sky colour tracks day/night, the way the real app does. */
      const sky = n.day
        ? 'linear-gradient(175deg,#4aa3e8,#1f6fb8 55%,#17518d)'
        : 'linear-gradient(175deg,#274b7a,#1a2f52 55%,#141d33)';
      w.node.querySelector('[data-wx]').innerHTML = `
        <div style="flex:1;min-height:0;overflow:auto;background:${sky};color:#fff;padding:22px 20px 26px">
          <div style="text-align:center">
            <div style="font-size:15px;font-weight:500;letter-spacing:.01em">${esc(Wx.place)}</div>
            <div style="font-size:74px;font-weight:200;letter-spacing:-.05em;line-height:1.05">${n.t}°</div>
            <div style="font-size:14px;opacity:.9">${esc(label)}</div>
            <div style="font-size:13px;opacity:.8;margin-top:2px">H:${n.hi}° L:${n.lo}°</div>
          </div>
          <div style="margin-top:22px;background:rgba(255,255,255,.14);border:.5px solid rgba(255,255,255,.2);border-radius:14px;padding:12px 14px;backdrop-filter:blur(12px)">
            <div style="font-size:11px;opacity:.75;letter-spacing:.03em;text-transform:uppercase;padding-bottom:9px;border-bottom:.5px solid rgba(255,255,255,.18)">${esc(label)} conditions for the rest of the day.</div>
            <div style="display:flex;justify-content:space-between;padding-top:11px">
              ${hrs.map(([h, t2, i]) => `<div style="display:flex;flex-direction:column;align-items:center;gap:7px;font-size:12px">
                <span>${esc(h)}</span><span style="width:20px;height:20px;opacity:.95">${ic(i)}</span><b style="font-size:14px;font-weight:600">${t2}°</b></div>`).join('')}
            </div></div>
          <div style="margin-top:14px;background:rgba(255,255,255,.14);border:.5px solid rgba(255,255,255,.2);border-radius:14px;padding:6px 14px">
            ${(() => {
          /* Each bar spans that day's range inside the week's range, so a cold
             day reads as a short bar sitting left — the whole point of the row. */
          const wLo = Math.min(...days.map(d => d[1])), wHi = Math.max(...days.map(d => d[2]));
          const span = Math.max(1, wHi - wLo);
          return days.map(([d, lo, hi, g]) => {
            const l = ((lo - wLo) / span * 100).toFixed(1), r = ((wHi - hi) / span * 100).toFixed(1);
            return `<div style="display:flex;align-items:center;gap:12px;padding:8px 0;border-top:.5px solid rgba(255,255,255,.14)">
              <span style="width:44px;font-size:13px;font-weight:500">${esc(d)}</span>
              <span style="width:20px;height:20px;opacity:.95">${ic(g)}</span>
              <span style="font-size:13px;opacity:.75;width:30px;text-align:right">${lo}°</span>
              <span style="flex:1;height:4px;border-radius:2px;background:rgba(255,255,255,.22);position:relative">
                <i style="position:absolute;left:${l}%;right:${r}%;top:0;bottom:0;border-radius:2px;
                  background:linear-gradient(90deg,#7ed6ff,#ffd84d,#ff9f0a)"></i></span>
              <span style="font-size:13px;width:30px">${hi}°</span></div>`;
          }).join('');
        })()}
          </div>
          <div style="margin-top:12px;text-align:center;font-size:10.5px;opacity:.55">
            ${n.live ? 'Live from Open-Meteo' : 'Last known reading — no connection'}</div>
        </div>`;
      w.node.querySelectorAll('[data-wx] svg').forEach(s => { s.style.cssText = 'width:100%;height:100%'; });
    };
    paint();
    Wx.load().then(() => paint());
    Bus.on('wx', () => paint());
  }
};

const TICKERS = [
  { s: 'AAPL', n: 'Apple Inc.', p: 232.40, d: 12.03, up: true }, { s: 'MSFT', n: 'Microsoft Corp.', p: 505.80, d: -3.12, up: false },
  { s: 'NVDA', n: 'NVIDIA Corp.', p: 168.25, d: -6.22, up: false }, { s: 'GOOGL', n: 'Alphabet Inc.', p: 204.11, d: 4.86, up: true },
  { s: 'TSLA', n: 'Tesla, Inc.', p: 318.94, d: 9.41, up: true }, { s: 'AMZN', n: 'Amazon.com', p: 241.62, d: 1.08, up: true },
];
/* `steps` controls how jagged the walk is, which is how the range selector makes a
   day look choppy and a decade look smooth. */
function spark(up, w = 90, h = 26, seed = 1, steps = 14) {
  let d = `M0 ${h * .6}`;
  for (let i = 1; i <= steps; i++) {
    const x = i / steps * w;
    const t = i / steps;
    const noise = Math.sin(i * 1.9 + seed * 3) * .18 + Math.sin(i * .7 + seed) * .12;
    const y = h * (up ? .78 - t * .58 + noise * .3 : .24 + t * .56 + noise * .3);
    d += ` L${x.toFixed(1)} ${clamp(y, 2, h - 2).toFixed(1)}`;
  }
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" style="width:100%;height:100%"><path d="${d}" fill="none" stroke="${up ? '#28c840' : '#ff453a'}" stroke-width="1.6" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}
APPS.stocks = {
  name: 'Stocks', icon: 'app-stocks', w: 800, h: 560, minW: 480, minH: 340,
  menus: () => stdMenus('stocks'),
  mount() {
    return `<div class="wb">
      <div class="sbar" data-drag style="width:270px;padding-top:0"><div class="sb-top"><div data-tl></div></div>
        <div style="padding:0 10px 8px"><div class="sfield" data-nodrag><span>${ic('g-search')}</span><input placeholder="Search"></div></div>
        <div style="overflow:auto;padding:0 8px">
        ${TICKERS.map((t, i) => `<div class="si" data-ti="${i}" style="height:52px;align-items:center">
          <span style="flex:1;min-width:0;display:flex;flex-direction:column">
            <b style="font-size:14px;font-weight:650;letter-spacing:-.01em">${t.s}</b>
            <span style="font-size:11px;color:var(--txt-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${t.n}</span></span>
          <span style="width:56px;height:26px;flex:none">${spark(t.up, 90, 26, i)}</span>
          <span style="display:flex;flex-direction:column;align-items:flex-end;width:74px;flex:none">
            <b style="font-size:13px;font-variant-numeric:tabular-nums">${t.p.toFixed(2)}</b>
            <span style="font-size:10.5px;font-weight:600;color:#fff;background:${t.up ? '#28c840' : '#ff453a'};padding:1px 5px;border-radius:4px">${t.up ? '+' : ''}${t.d.toFixed(2)}%</span></span>
        </div>`).join('')}
        </div></div>
      <div class="wmain">
        <div class="tbar" data-drag style="height:52px"><div class="fx-title" data-stt></div></div>
        <div class="scroll" style="flex:1;padding:18px 22px" data-stbody></div>
      </div></div>`;
  },
  ready(w) {
    const RANGES = ['1D', '1W', '1M', '3M', '6M', 'YTD', '1Y', '2Y', '5Y', '10Y'];
    w.st = { i: 0, range: '1M' };
    const render = i => {
      const t = TICKERS[i];
      w.st.i = i;
      w.node.querySelector('[data-stt]').textContent = t.s;
      $$('[data-ti]', w.node).forEach(b => b.classList.toggle('on', +b.dataset.ti === i));
      /* The range picks a different slice of the walk, so switching it really does
         redraw the chart — longer windows read smoother, as they should. */
      const ri = RANGES.indexOf(w.st.range);
      const detail = [26, 40, 60, 80, 100, 120, 140, 170, 200, 240][ri] || 60;
      w.node.querySelector('[data-stbody]').innerHTML = `
        <div style="font-size:26px;font-weight:650;letter-spacing:-.03em">${t.n}</div>
        <div style="display:flex;align-items:baseline;gap:10px;margin-top:2px">
          <span style="font-size:36px;font-weight:300;letter-spacing:-.03em;font-variant-numeric:tabular-nums">${t.p.toFixed(2)}</span>
          <span style="font-size:15px;font-weight:600;color:${t.up ? '#28c840' : '#ff453a'}">${t.up ? '▲' : '▼'} ${Math.abs(t.d).toFixed(2)}%</span></div>
        <div style="display:flex;gap:4px;margin:16px 0 10px">${RANGES.map(p =>
        `<button class="btn" data-range="${p}" style="height:22px;padding:0 9px;font-size:11px${p === w.st.range ? ';background:var(--blue);color:#fff' : ''}">${p}</button>`).join('')}</div>
        <div style="height:190px;background:var(--win-2);border-radius:10px;padding:12px;box-shadow:0 0 0 .5px var(--line)">${spark(t.up, 600, 165, i + 3 + ri * 5, detail)}</div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:1px;margin-top:16px;background:var(--line);border-radius:10px;overflow:hidden">
          ${[['Open', (t.p - t.d).toFixed(2)], ['High', (t.p * 1.014).toFixed(2)], ['Low', (t.p * .986).toFixed(2)], ['Vol', '58.2M'],
        ['P/E', '34.2'], ['Mkt Cap', '3.48T'], ['52W H', (t.p * 1.22).toFixed(2)], ['52W L', (t.p * .72).toFixed(2)]]
        .map(([k, v]) => `<div style="background:var(--win-2);padding:9px 12px"><div style="font-size:10.5px;color:var(--txt-2)">${k}</div><div style="font-size:13px;font-weight:600;font-variant-numeric:tabular-nums">${v}</div></div>`).join('')}
        </div>`;
    };
    on(w.node, 'click', '[data-ti]', (e, t) => render(+t.dataset.ti));
    on(w.node, 'click', '[data-range]', (e, t) => { w.st.range = t.dataset.range; render(w.st.i); });
    render(0);
  }
};

APPS.clock = {
  name: 'Clock', icon: 'app-clock', w: 520, h: 420, minW: 360, minH: 300,
  menus: () => stdMenus('clock'),
  mount() {
    const zones = [['Cupertino', -12.5], ['Kolkata', 0], ['London', -4.5], ['Tokyo', 3.5]];
    return titlebar('Clock', { plain: true }) + `<div style="flex:1;display:grid;grid-template-columns:1fr 1fr;gap:1px;background:var(--line);min-height:0">
      ${zones.map(([z, off]) => `<div style="background:var(--win);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:14px">
        <div data-cw="${off}" style="width:104px;height:104px"></div>
        <div style="font-size:13px;font-weight:600">${z}</div>
        <div style="font-size:11.5px;color:var(--txt-2)" data-ct="${off}"></div></div>`).join('')}
    </div>`;
  },
  ready(w) {
    const tick = () => {
      if (w.dead) return;
      $$('[data-cw]', w.node).forEach(n => {
        const off = +n.dataset.cw;
        const d = new Date(Date.now() + off * 3600e3);
        n.innerHTML = analogClock(d, 104);
      });
      $$('[data-ct]', w.node).forEach(n => {
        const d = new Date(Date.now() + (+n.dataset.ct) * 3600e3);
        n.textContent = time12(d).replace(NBSP, ' ');
      });
    };
    everySecond(tick);
  }
};

APPS.contacts = {
  name: 'Contacts', icon: 'app-contacts', w: 760, h: 540, minW: 480, minH: 320,
  menus: () => stdMenus('contacts'),
  mount(w) {
    const C = [['Anna Haro', 'Product design', '#0a84ff'], ['Chris Lee', 'Photographer', '#ff2d55'],
    ['Daniel Higgins', 'Engineering manager', '#ffd60a'], ['David Taylor', 'Motion design', '#ff9f0a'],
    ['Freda Klein', 'Architect', '#a2845e'], ['Hank Zakroff', 'Type designer', '#5e5ce6'],
    ['John Appleseed', 'iOS engineer', '#30d158'], ['Kate Bell', 'Frontend', '#64d2ff'],
    ['Mom', 'Family', '#ff375f'], ['Dr. Reed', 'Dentist', '#8e8e93']];
    w.C = C;
    return `<div class="wb">
      <div class="sbar" data-drag style="width:250px;padding-top:0"><div class="sb-top"><div data-tl></div></div>
        <div style="padding:0 10px 8px"><div class="sfield" data-nodrag><span>${ic('g-search')}</span><input placeholder="Search"></div></div>
        <div style="overflow:auto;padding:0 8px">${C.map((c, i) => `<div class="si" data-ci2="${i}" style="height:30px"><span class="nm">${esc(c[0])}</span></div>`).join('')}</div>
      </div>
      <div class="wmain"><div class="tbar" data-drag style="height:52px"></div>
        <div class="scroll" style="flex:1;padding:26px" data-cbody2></div></div></div>`;
  },
  ready(w) {
    const render = i => {
      const c = w.C[i];
      $$('[data-ci2]', w.node).forEach(b => b.classList.toggle('on', +b.dataset.ci2 === i));
      w.node.querySelector('[data-cbody2]').innerHTML = `
        <div style="display:flex;gap:18px;align-items:center">
          <div style="width:88px;height:88px;border-radius:50%;background:${c[2]};display:grid;place-items:center;color:#fff;font-size:34px;font-weight:600">${esc(c[0][0])}</div>
          <div><div style="font-size:25px;font-weight:600;letter-spacing:-.02em">${esc(c[0])}</div>
          <div style="font-size:13px;color:var(--txt-2)">${esc(c[1])}</div></div></div>
        <div style="margin-top:24px;max-width:420px">
          ${[['email', c[0].split(' ')[0].toLowerCase() + '@example.com'], ['home', 'Cupertino, CA']]
        .map(([k, v]) => `<div style="display:flex;gap:16px;padding:8px 0;border-top:.5px solid var(--line)">
            <span style="width:60px;text-align:right;font-size:11.5px;color:var(--txt-2)">${k}</span>
            <span style="font-size:13px;color:var(--blue)">${esc(v)}</span></div>`).join('')}
        </div>`;
    };
    on(w.node, 'click', '[data-ci2]', (e, t) => render(+t.dataset.ci2));
    render(0);
  }
};

APPS.freeform = {
  name: 'Freeform', icon: 'app-freeform', w: 860, h: 600, minW: 480, minH: 320,
  menus: () => stdMenus('freeform'),
  mount() {
    return titlebar('Untitled Board', {
      right: `<div class="seg" data-nodrag>${['#1d1d1f', '#0a84ff', '#ff375f', '#30d158', '#ff9f0a'].map((c, i) =>
        `<button data-pen="${c}" class="${i === 0 ? 'on' : ''}" style="width:26px"><span style="width:13px;height:13px;border-radius:50%;background:${c};display:block"></span></button>`).join('')}</div>
      <button class="tbtn" data-nodrag data-clear title="Clear">${ic('g-x')}</button>`
    }) + `<div style="flex:1;position:relative;min-height:0;background:var(--win)">
        <canvas data-ff style="position:absolute;inset:0;width:100%;height:100%;display:block;cursor:var(--cur-cross)"></canvas>
        <div data-ffhint style="position:absolute;inset:0;display:grid;place-items:center;pointer-events:none;color:var(--txt-3);font-size:13px">Drag to draw</div>
      </div>`;
  },
  ready(w) {
    const cv = w.node.querySelector('[data-ff]');
    let col = '#1d1d1f', dpr = Math.min(2, devicePixelRatio || 1), strokes = [];
    const fit = () => {
      const p = cv.parentElement;
      const r = { width: p.clientWidth, height: p.clientHeight };
      if (!r.width || !r.height) return;
      cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
      const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.lineCap = 'round'; g.lineJoin = 'round';
      strokes.forEach(s => { g.strokeStyle = s.c; g.lineWidth = 3; g.beginPath(); s.p.forEach((pt, i) => i ? g.lineTo(pt[0], pt[1]) : g.moveTo(pt[0], pt[1])); g.stroke(); });
    };
    w.ffFit = fit; setTimeout(fit, 30); addEventListener('resize', fit);
    Bus.on('theme', () => { if (!w.dead) fit(); });
    on(w.node, 'click', '[data-pen]', (e, t) => { col = t.dataset.pen; $$('[data-pen]', w.node).forEach(b => b.classList.toggle('on', b === t)); });
    on(w.node, 'click', '[data-clear]', () => { strokes = []; fit(); w.node.querySelector('[data-ffhint]').style.opacity = '1'; });
    cv.addEventListener('pointerdown', e => {
      w.node.querySelector('[data-ffhint]').style.opacity = '0';
      const r = cv.getBoundingClientRect(), g = cv.getContext('2d');
      const s = { c: col, p: [[e.clientX - r.left, e.clientY - r.top]] };
      strokes.push(s);
      g.strokeStyle = col; g.lineWidth = 3;
      const mv = ev => {
        const p = [ev.clientX - r.left, ev.clientY - r.top];
        const last = s.p[s.p.length - 1];
        g.beginPath(); g.moveTo(last[0], last[1]); g.lineTo(p[0], p[1]); g.stroke();
        s.p.push(p);
      };
      const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); };
      addEventListener('pointermove', mv); addEventListener('pointerup', up);
    });
  },
  onResize(w) { if (w.ffFit) w.ffFit(); }
};

/* Media-shelf apps share one shape */
function shelfApp(id, name, icon, title, rows, tint) {
  APPS[id] = {
    name, icon, w: 900, h: 600, minW: 520, minH: 340,
    menus: () => stdMenus(id),
    mount() {
      return titlebar(name, { right: `<div class="sfield" data-nodrag style="width:160px"><span>${ic('g-search')}</span><input placeholder="Search"></div>` }) +
        `<div class="scroll" style="flex:1;min-height:0;padding:18px 22px 28px;background:var(--win)">
          <h2 style="margin:0 0 3px;font-size:24px;font-weight:700;letter-spacing:-.025em">${esc(title)}</h2>
          <div style="font-size:12.5px;color:var(--txt-2);margin-bottom:18px">${esc(rows[0].sub)}</div>
          ${rows.map(r => `<div style="margin-bottom:26px">
            <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:11px"><h3 style="margin:0;font-size:16px;font-weight:650;letter-spacing:-.015em">${esc(r.head)}</h3>
            <span style="font-size:11.5px;color:var(--blue)">See All</span></div>
            <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:16px 14px">
            ${r.items.map((it, i) => `<div class="alb"><div class="cv" style="aspect-ratio:${r.ratio || 1};border-radius:8px">${photoArt(i + r.seed)}<span class="pl">${ic('g-play')}</span></div>
              <b>${esc(it[0])}</b><span>${esc(it[1])}</span></div>`).join('')}</div></div>`).join('')}
        </div>`;
    }
  };
}
shelfApp('podcasts', 'Podcasts', 'app-podcasts', 'Listen Now', [
  { head: 'Up Next', sub: 'Six shows · 42 unplayed episodes', seed: 1, items: [['Design Details', 'Ep. 512 · Liquid Glass'], ['Syntax', 'Ep. 880 · One-file apps'], ['Acquired', 'Apple, Part IV'], ['The Talk Show', 'With John Gruber']] },
  { head: 'New Episodes', sub: '', seed: 5, items: [['Shop Talk', '2 hr ago'], ['Ship It', '5 hr ago'], ['Frontend First', 'Yesterday'], ['Hanselminutes', 'Yesterday']] },
]);
shelfApp('tv', 'TV', 'app-tv', 'Home', [
  { head: 'Continue Watching', sub: 'Apple TV+', seed: 2, ratio: 0.68, items: [['Severance', 'S2 · E4'], ['Silo', 'S2 · E7'], ['For All Mankind', 'S5 · E1'], ['Foundation', 'S3 · E9']] },
  { head: 'New & Noteworthy', sub: '', seed: 6, ratio: 0.68, items: [['The Studio', 'Comedy'], ['Presumed Innocent', 'Thriller'], ['Slow Horses', 'Drama'], ['Shrinking', 'Comedy']] },
]);
shelfApp('books', 'Books', 'app-books', 'Reading Now', [
  { head: 'Current', sub: '3 books in progress', seed: 3, ratio: 0.66, items: [['Refactoring UI', 'Wathan & Schoger'], ['The Design of Everyday Things', 'Norman'], ['Shape Up', 'Singer'], ['Thinking in Systems', 'Meadows']] },
  { head: 'Want to Read', sub: '', seed: 7, ratio: 0.66, items: [['Creative Selection', 'Kocienda'], ['Steal Like an Artist', 'Kleon'], ['The Making of Prince of Persia', 'Mechner'], ['Hackers & Painters', 'Graham']] },
]);
shelfApp('appstore', 'App Store', 'app-appstore', 'Discover', [
  { head: 'Featured', sub: 'Handpicked for you', seed: 4, items: [['CleanType', 'Typography utility'], ['Aurora Synth', 'Music'], ['Pattern Craft', 'Graphics'], ['Spark UI', 'Developer tools']] },
  { head: 'Top Free', sub: '', seed: 0, items: [['Raycast', 'Productivity'], ['Arc', 'Browser'], ['Figma', 'Design'], ['Warp', 'Terminal']] },
]);
APPS.facetime = {
  name: 'FaceTime', icon: 'app-facetime', w: 780, h: 560, minW: 440, minH: 320,
  menus: () => stdMenus('facetime'),
  mount(w) {
    w.st = {
      calls: [['Anna Haro', 'Outgoing', '24:12', 'Today 3:40 PM'], ['Design Crew', 'Missed', '', 'Today 11:02 AM'],
      ['John Appleseed', 'Incoming', '8:31', 'Yesterday'], ['Mom', 'Outgoing', '41:07', 'Saturday']],
      sel: 0, live: false, secs: 0, muted: false, cam: false,
    };
    return `<div class="wb">
      <div class="sbar" data-drag style="width:270px;padding-top:0"><div class="sb-top"><div data-tl></div></div>
        <div style="padding:0 10px 10px"><button class="btn pri" data-ftnew style="width:100%;height:28px">New FaceTime</button></div>
        <div style="overflow:auto;padding:0 8px" data-ftlist></div></div>
      <div class="wmain" style="background:#111114">
        <div class="tbar" data-drag style="height:52px;background:transparent;border:0"></div>
        <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#8a8a92;gap:12px;padding-bottom:20px" data-ftstage></div>
      </div></div>`;
  },
  ready(w) {
    const st = w.st;
    const initials = n => n.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();
    const render = () => {
      w.node.querySelector('[data-ftlist]').innerHTML = st.calls.map(([n, kind, len, when], i) => `
        <div class="si${i === st.sel ? ' on' : ''}" data-fti="${i}" style="height:46px;align-items:center">
          <span style="flex:1;min-width:0;display:flex;flex-direction:column"><b style="font-size:13px;font-weight:600">${esc(n)}</b>
          <span style="font-size:11px;color:${kind === 'Missed' ? 'var(--red)' : 'var(--txt-2)'}">${kind}${len ? ' · ' + len : ''}</span></span>
          <span style="font-size:10.5px;color:var(--txt-3)">${esc(when)}</span></div>`).join('');
      const c = st.calls[st.sel];
      const stage = w.node.querySelector('[data-ftstage]');
      if (!st.live) {
        stage.innerHTML = `
          <div style="width:120px;height:120px;border-radius:50%;background:linear-gradient(150deg,#3a3a45,#1a1a20);display:grid;place-items:center;font-size:42px;color:#fff;font-weight:600">${esc(initials(c[0]))}</div>
          <div style="font-size:19px;color:#fff;font-weight:500">${esc(c[0])}</div>
          <div style="font-size:12.5px">${esc(c[1])}${c[2] ? ' · ' + c[2] : ''} — ${esc(c[3])}</div>
          <button class="btn pri" data-ftcall style="height:34px;padding:0 22px;border-radius:17px;margin-top:4px">${ic('g-facetime')}<span style="margin-left:6px">FaceTime</span></button>`;
        return;
      }
      stage.innerHTML = `
        <div style="width:150px;height:150px;border-radius:50%;position:relative;display:grid;place-items:center;font-size:52px;color:#fff;font-weight:600;
          background:${st.cam ? 'linear-gradient(150deg,#1d4b6e,#0d2436)' : 'linear-gradient(150deg,#3a3a45,#1a1a20)'}">
          ${st.cam ? '' : esc(initials(c[0]))}
          ${st.cam ? `<svg viewBox="0 0 40 40" style="width:60px;height:60px;opacity:.5"><use href="#g-display"></use></svg>` : ''}</div>
        <div style="font-size:19px;color:#fff;font-weight:500">${esc(c[0])}</div>
        <div style="font-size:12.5px;font-variant-numeric:tabular-nums" data-fttimer>${mmss(st.secs)}</div>
        <div style="display:flex;gap:12px;margin-top:6px">
          <button class="btn" data-ftmute title="${st.muted ? 'Unmute' : 'Mute'}" style="background:${st.muted ? '#fff' : '#2c2c30'};color:${st.muted ? '#111' : '#fff'};box-shadow:none;height:38px;width:38px;border-radius:50%;padding:0">${ic(st.muted ? 'g-vol-mute' : 'g-vol-hi')}</button>
          <button class="btn" data-ftend style="background:#ff453a;color:#fff;box-shadow:none;height:38px;padding:0 20px;border-radius:19px">End</button>
          <button class="btn" data-ftcam title="${st.cam ? 'Turn Off Video' : 'Turn On Video'}" style="background:${st.cam ? '#fff' : '#2c2c30'};color:${st.cam ? '#111' : '#fff'};box-shadow:none;height:38px;width:38px;border-radius:50%;padding:0">${ic('g-display')}</button>
        </div>`;
    };
    const start = () => {
      st.live = true; st.secs = 0;
      clearInterval(w.ftTimer);
      w.ftTimer = setInterval(() => {
        if (w.dead || !st.live) return;
        st.secs++;
        const t = w.node.querySelector('[data-fttimer]');
        if (t) t.textContent = mmss(st.secs);
      }, 1000);
      render();
    };
    on(w.node, 'click', '[data-fti]', (e, t) => { st.sel = +t.dataset.fti; st.live = false; render(); });
    on(w.node, 'click', '[data-ftcall]', start);
    on(w.node, 'click', '[data-ftmute]', () => { st.muted = !st.muted; render(); Toast(st.muted ? 'Microphone off' : 'Microphone on'); });
    on(w.node, 'click', '[data-ftcam]', () => { st.cam = !st.cam; render(); });
    on(w.node, 'click', '[data-ftend]', () => {
      st.live = false; clearInterval(w.ftTimer);
      st.calls[st.sel] = [st.calls[st.sel][0], 'Outgoing', mmss(st.secs), 'Just now'];
      render(); Toast('Call ended · ' + mmss(st.secs));
    });
    /* New FaceTime asks who, then dials — no dead primary button. */
    on(w.node, 'click', '[data-ftnew]', (e, t) => {
      const node = el(`<div class="pop" style="width:290px;padding:12px">
        <div style="font-size:12.5px;font-weight:600;margin-bottom:8px">New FaceTime</div>
        <div class="sfield" style="width:100%"><span>${ic('g-search')}</span><input placeholder="Name or email" spellcheck="false"></div>
        <div style="display:flex;flex-direction:column;gap:1px;margin-top:10px;background:var(--line);border-radius:8px;overflow:hidden">
          ${['Anna Haro', 'David Taylor', 'Kate Bell', 'Mom'].map(n =>
        `<div class="mi" data-pick="${esc(n)}" style="background:var(--win-2);border-radius:0">${esc(n)}</div>`).join('')}</div>
        <button class="btn pri" data-go style="width:100%;height:26px;margin-top:10px">FaceTime</button></div>`);
      menuUnder(t, []); Pop.close(true);
      const r = t.getBoundingClientRect();
      Pop.open(node, { x: r.left, y: r.bottom + 6, origin: 'top left' });
      const inp = node.querySelector('input');
      setTimeout(() => inp.focus(), 50);
      const dial = name => {
        if (!name) return Toast('Enter a name to call');
        Pop.close();
        st.calls.unshift([name, 'Outgoing', '', 'Just now']); st.sel = 0;
        start();
      };
      on(node, 'click', '[data-pick]', (e2, p) => dial(p.dataset.pick));
      node.querySelector('[data-go]').onclick = () => dial(inp.value.trim());
      inp.addEventListener('keydown', e2 => { if (e2.key === 'Enter') dial(inp.value.trim()); });
    });
    render();
  },
  onClose(w) { clearInterval(w.ftTimer); }
};
/* ============================================================================
   25b · UTILITIES
   ========================================================================== */
APPS.activity = {
  name: 'Activity Monitor', icon: 'app-activity', w: 860, h: 560, minW: 560, minH: 340,
  menus: () => stdMenus('activity'),
  mount(w) {
    w.st = { tab: 'CPU' };
    return titlebar('Activity Monitor', {
      right: `<div class="seg" data-nodrag>${['CPU', 'Memory', 'Energy', 'Disk', 'Network'].map((t, i) =>
        `<button data-am="${t}" class="${i === 0 ? 'on' : ''}" style="width:auto;padding:0 9px;font-size:11.5px">${t}</button>`).join('')}</div>`
    }) + `<div class="wb col" style="background:var(--win)">
      <div class="fv-list scroll" style="flex:1">
        <div class="hd" data-head></div>
        <div data-proc></div>
      </div>
      <div style="flex:none;display:flex;gap:26px;align-items:center;height:70px;padding:0 20px;border-top:.5px solid var(--line);background:var(--win-2)">
        <div data-cpuring></div>
        <div style="display:grid;grid-template-columns:auto auto;gap:2px 14px;font-size:11.5px" data-legend></div>
        <div style="flex:1;height:44px;position:relative;overflow:hidden;border-radius:6px;background:var(--win-3)" data-graph></div>
      </div></div>`;
  },
  ready(w) {
    /* name, pid, cpu, threads, mem MB, user, energy, disk MB/s, net KB/s */
    const PROCS = [
      ['WindowServer', 214, 9.4, 24, 412.6, 'root', 8.2, 0.4, 12],
      ['kernel_task', 0, 6.1, 512, 1864, 'root', 3.1, 2.8, 6],
      ['Safari', 1841, 4.2, 31, 996.4, 'prasenjit', 21.4, 1.2, 486],
      ['Cursor Helper (Renderer)', 2290, 3.8, 42, 1240, 'prasenjit', 16.8, 0.9, 74],
      ['Terminal', 2461, 1.2, 8, 84.2, 'prasenjit', 1.1, 0.1, 0],
      ['Music', 1902, 0.9, 26, 288.1, 'prasenjit', 4.6, 0.6, 128],
      ['Finder', 620, 0.4, 12, 142.8, 'prasenjit', 0.8, 0.2, 2],
      ['Dock', 618, 0.3, 9, 96.4, 'prasenjit', 0.6, 0.0, 0],
      ['mds_stores', 340, 0.2, 7, 58.9, 'root', 0.4, 3.4, 0],
      ['bluetoothd', 188, 0.1, 5, 18.2, 'root', 0.2, 0.0, 1],
      ['loginwindow', 174, 0.0, 4, 22.6, 'prasenjit', 0.1, 0.0, 0],
      ['cfprefsd', 121, 0.0, 3, 9.4, 'root', 0.1, 0.1, 0],
    ];
    const mb = v => v >= 1024 ? (v / 1024).toFixed(2) + ' GB' : v.toFixed(1) + ' MB';
    /* Each tab is a different sort key, column set, ring and legend — the way the
       real app re-tables itself rather than just re-labelling one view. */
    const TABS = {
      CPU: {
        cols: ['Process Name', 'PID', '% CPU', 'Threads', 'Memory', 'User'], key: 2, hue: '#0a84ff',
        cells: p => [p[1], p[2].toFixed(1), p[3], mb(p[4]), p[5]], hot: p => p[2] > 5,
        ring: rows => clamp(rows.reduce((s, r) => s + r[2], 0), 0, 100),
        legend(rows) {
          const t = rows.reduce((s, r) => s + r[2], 0), sys = t * .38, usr = t * .62;
          return [['System', sys.toFixed(2) + '%'], ['User', usr.toFixed(2) + '%'], ['Idle', (100 - t).toFixed(2) + '%']];
        },
      },
      Memory: {
        cols: ['Process Name', 'PID', 'Memory', 'Threads', 'Compressed', 'User'], key: 4, hue: '#30d158',
        cells: p => [p[1], mb(p[4]), p[3], mb(p[4] * .18), p[5]], hot: p => p[4] > 900,
        ring: rows => clamp(rows.reduce((s, r) => s + r[4], 0) / 1310, 0, 100),
        legend(rows) {
          const used = rows.reduce((s, r) => s + r[4], 0) / 1024;
          return [['Physical', '128.00 GB'], ['Used', used.toFixed(2) + ' GB'], ['Cached', (used * .42).toFixed(2) + ' GB']];
        },
      },
      Energy: {
        cols: ['Process Name', 'PID', 'Energy Impact', '12 hr Power', 'App Nap', 'User'], key: 6, hue: '#ff9f0a',
        cells: p => [p[1], p[6].toFixed(1), (p[6] * .42).toFixed(2), p[6] < 1 ? 'Yes' : 'No', p[5]], hot: p => p[6] > 15,
        ring: rows => clamp(rows.reduce((s, r) => s + r[6], 0), 0, 100),
        legend: rows => [['Energy Impact', rows.reduce((s, r) => s + r[6], 0).toFixed(1)],
          ['Battery', SYS.battery + '%'], ['Remaining', '6:24']],
      },
      Disk: {
        cols: ['Process Name', 'PID', 'Bytes Read/s', 'Bytes Written/s', 'Reads In', 'User'], key: 7, hue: '#af52de',
        cells: p => [p[1], p[7].toFixed(2) + ' MB', (p[7] * .38).toFixed(2) + ' MB', Math.round(p[7] * 214), p[5]], hot: p => p[7] > 2,
        ring: rows => clamp(rows.reduce((s, r) => s + r[7], 0) * 9, 0, 100),
        legend: rows => [['Reads/s', rows.reduce((s, r) => s + r[7], 0).toFixed(2) + ' MB'],
          ['Writes/s', (rows.reduce((s, r) => s + r[7], 0) * .38).toFixed(2) + ' MB'], ['Total read', '284.6 GB']],
      },
      Network: {
        cols: ['Process Name', 'PID', 'Rcvd Bytes/s', 'Sent Bytes/s', 'Packets In', 'User'], key: 8, hue: '#5e5ce6',
        cells: p => [p[1], p[8].toFixed(0) + ' KB', (p[8] * .31).toFixed(0) + ' KB', Math.round(p[8] * 3.4), p[5]], hot: p => p[8] > 200,
        ring: rows => clamp(rows.reduce((s, r) => s + r[8], 0) / 12, 0, 100),
        legend: rows => [['Data received/s', rows.reduce((s, r) => s + r[8], 0).toFixed(0) + ' KB'],
          ['Data sent/s', (rows.reduce((s, r) => s + r[8], 0) * .31).toFixed(0) + ' KB'], ['Packets in', '1,284,602']],
      },
    };
    const hist = {}; Object.keys(TABS).forEach(k => hist[k] = [...Array(60)].map(() => 8 + Math.random() * 14));
    const tick = () => {
      if (w.dead) return;
      const T = TABS[w.st.tab], jit = s => (Math.random() - .5) * s;
      const rows = PROCS.map(p => {
        const q = p.slice();
        q[2] = Math.max(0, q[2] + jit(1.4)); q[6] = Math.max(0, q[6] + jit(1.8));
        q[7] = Math.max(0, q[7] + jit(.5)); q[8] = Math.max(0, q[8] + jit(40));
        return q;
      }).sort((a, b) => b[T.key] - a[T.key]);
      w.node.querySelector('[data-head]').innerHTML =
        T.cols.map((c, i) => `<span style="${i ? 'width:104px;text-align:right' : 'flex:1'}">${c}</span>`).join('');
      w.node.querySelector('[data-proc]').innerHTML = rows.map((p, i) => `
        <div class="r${i % 2 ? ' alt' : ''}"><span class="nm" style="flex:1">${esc(p[0])}</span>
          ${T.cells(p).map((v, k) => `<span style="width:104px;text-align:right;font-variant-numeric:tabular-nums;${k === 1 && T.hot(p) ? 'color:var(--red);font-weight:600;' : ''
        }${k === 4 ? 'color:var(--txt-2)' : ''}">${v}</span>`).join('')}</div>`).join('');
      w.node.querySelector('[data-legend]').innerHTML = T.legend(rows).map(([k, v]) =>
        `<span style="color:var(--txt-2)">${k}:</span><b style="font-variant-numeric:tabular-nums">${v}</b>`).join('');
      const C = 2 * Math.PI * 22, load = T.ring(rows) / 100;
      w.node.querySelector('[data-cpuring]').innerHTML = `<svg viewBox="0 0 52 52" style="width:52px;height:52px">
        <circle cx="26" cy="26" r="22" fill="none" stroke="var(--fill-2)" stroke-width="6"/>
        <circle cx="26" cy="26" r="22" fill="none" stroke="${T.hue}" stroke-width="6" stroke-linecap="round"
          stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - load)}" transform="rotate(-90 26 26)"/>
        <text x="26" y="29.5" text-anchor="middle" font-size="11" font-weight="600" fill="currentColor">${Math.round(load * 100)}%</text></svg>`;
      const h = hist[w.st.tab];
      h.push(clamp(load * 100, 2, 96)); h.shift();
      const pts = h.map((v, i) => `${(i / (h.length - 1) * 100).toFixed(2)},${(100 - v).toFixed(1)}`).join(' ');
      w.node.querySelector('[data-graph]').innerHTML =
        `<svg viewBox="0 0 100 100" preserveAspectRatio="none" style="width:100%;height:100%">
          <polygon points="0,100 ${pts} 100,100" fill="${T.hue}30"/>
          <polyline points="${pts}" fill="none" stroke="${T.hue}" stroke-width="1.2" vector-effect="non-scaling-stroke"/></svg>`;
    };
    on(w.node, 'click', '[data-am]', (e, t) => {
      w.st.tab = t.dataset.am;
      $$('[data-am]', w.node).forEach(b => b.classList.toggle('on', b === t));
      tick();
    });
    tick(); w.actTimer = setInterval(tick, 1400);
  },
  onClose(w) { clearInterval(w.actTimer); }
};

APPS.diskutil = {
  name: 'Disk Utility', icon: 'app-diskutil', w: 800, h: 520, minW: 560, minH: 340,
  menus: () => stdMenus('diskutil'),
  mount() {
    const used = 842, total = 2048, pct = used / total;
    const seg = [['Apps', 214, '#0a84ff'], ['Documents', 168, '#30d158'], ['Photos', 296, '#ff9f0a'], ['System', 164, '#8e8e93']];
    return `<div class="wb">
      <div class="sbar" data-drag style="width:222px">
        <div style="display:flex;align-items:center;height:38px;padding:0 12px"><div data-tl></div></div>
        <div class="grp"><div class="gh">Internal</div>
          <div class="si">${ic('g-hd', 'ico')}<span class="nm">APPLE SSD AP2048</span></div>
          <div class="si on" style="padding-left:26px">${ic('g-hd', 'ico')}<span class="nm">Macintosh HD</span></div>
          <div class="si" style="padding-left:26px">${ic('g-hd', 'ico')}<span class="nm">Data</span></div>
        </div>
        <div class="grp"><div class="gh">External</div>
          <div class="si">${ic('g-hd', 'ico')}<span class="nm">Backup T7</span></div></div>
      </div>
      <div class="wmain">
        <div class="tbar" data-drag style="height:52px">
          <button class="tbtn" data-nodrag data-duadd title="Add Volume">${ic('g-plus')}</button>
          <button class="tbtn" data-nodrag data-durm title="Remove Volume">${ic('g-minus')}</button>
          <div class="fx-title">Macintosh HD</div><div style="flex:1"></div>
          <button class="btn" data-nodrag data-dufa>First Aid</button>
          <button class="btn" data-nodrag data-duerase>Erase</button>
        </div>
        <div class="scroll" style="flex:1;padding:24px 28px">
          <div style="display:flex;gap:18px;align-items:center">
            <div style="width:74px;height:74px">${ic('f-hd')}</div>
            <div><div style="font-size:20px;font-weight:600;letter-spacing:-.02em">Macintosh HD</div>
              <div style="font-size:12.5px;color:var(--txt-2)">APFS Volume · Internal · Encrypted</div></div>
          </div>
          <div style="margin-top:22px;height:30px;border-radius:6px;overflow:hidden;display:flex;box-shadow:0 0 0 .5px var(--line)">
            ${seg.map(([, v, c]) => `<div style="width:${v / total * 100}%;background:${c}"></div>`).join('')}
            <div style="flex:1;background:var(--win-3)"></div>
          </div>
          <div style="display:flex;gap:20px;flex-wrap:wrap;margin-top:12px;font-size:12px">
            ${seg.map(([n, v, c]) => `<span style="display:flex;align-items:center;gap:6px">
              <i style="width:9px;height:9px;border-radius:2px;background:${c};display:block"></i>${n} — ${v} GB</span>`).join('')}
            <span style="display:flex;align-items:center;gap:6px;color:var(--txt-2)">
              <i style="width:9px;height:9px;border-radius:2px;background:var(--win-3);display:block"></i>Free — ${total - used} GB</span>
          </div>
          <div style="margin-top:24px;display:grid;grid-template-columns:repeat(2,1fr);gap:1px;background:var(--line);border-radius:10px;overflow:hidden">
            ${[['Mount Point', '/'], ['Capacity', '2.05 TB'], ['Available', `${((total - used) / 1000).toFixed(2)} TB (${(100 - pct * 100).toFixed(0)}%)`],
        ['Used', `${(used / 1000).toFixed(2)} TB`], ['Type', 'APFS Volume'], ['Owners', 'Enabled'],
        ['Connection', 'PCI-Express'], ['Device', 'disk3s5s1']]
        .map(([k, v]) => `<div style="background:var(--win-2);padding:9px 14px;display:flex;justify-content:space-between;font-size:12.5px">
              <span style="color:var(--txt-2)">${k}:</span><b style="font-weight:550">${v}</b></div>`).join('')}
          </div></div></div></div>`;
  },
  ready(w) {
    /* First Aid runs a real progress sheet; Erase asks first, and refuses the boot
       volume the way Disk Utility does. */
    on(w.node, 'click', '[data-dufa]', () => {
      const node = el(`<div class="pop" style="width:400px;padding:16px">
        <div style="font-size:13px;font-weight:600;margin-bottom:4px">First Aid</div>
        <div style="font-size:12px;color:var(--txt-2);margin-bottom:12px">Checking Macintosh HD for errors.</div>
        <div style="height:6px;border-radius:3px;background:var(--fill-2);overflow:hidden"><i data-bar style="display:block;height:100%;width:0;background:var(--blue);transition:width .3s linear"></i></div>
        <pre data-log style="margin:10px 0 0;font:11px/1.55 var(--mono);color:var(--txt-2);max-height:110px;overflow:auto;white-space:pre-wrap"></pre>
        <div style="display:flex;justify-content:flex-end;margin-top:12px"><button class="btn pri" data-done style="height:24px" disabled>Done</button></div></div>`);
      Pop.open(node, { x: innerWidth / 2 - 200, y: 160, origin: 'top center' });
      const steps = ['Running First Aid on “Macintosh HD”', 'Checking the container superblock',
        'Checking the object map', 'Checking the fsroot tree', 'Checking the snapshot metadata tree',
        'Verifying allocated space', 'The volume Macintosh HD appears to be OK', 'Operation successful.'];
      const log = node.querySelector('[data-log]'), bar = node.querySelector('[data-bar]');
      steps.forEach((s, i) => setTimeout(() => {
        if (!node.isConnected) return;
        log.textContent += s + '\n'; log.scrollTop = log.scrollHeight;
        bar.style.width = ((i + 1) / steps.length * 100) + '%';
        if (i === steps.length - 1) { const d = node.querySelector('[data-done]'); d.disabled = false; d.onclick = () => Pop.close(); }
      }, 260 + i * 340));
    });
    on(w.node, 'click', '[data-duerase]', () => {
      const node = el(`<div class="pop" style="width:340px;padding:16px;text-align:center">
        <div style="width:52px;height:52px;margin:0 auto 10px">${ic('f-hd')}</div>
        <div style="font-size:13px;font-weight:600">Erase “Macintosh HD”?</div>
        <div style="font-size:12px;color:var(--txt-2);margin:6px 0 14px">This is the startup disk. Erasing it would take the whole desktop with it — including this window.</div>
        <div style="display:flex;gap:8px"><button class="btn" data-x style="flex:1;height:26px">Cancel</button>
          <button class="btn" data-e style="flex:1;height:26px;background:var(--red);color:#fff">Erase</button></div></div>`);
      Pop.open(node, { x: innerWidth / 2 - 170, y: 180, origin: 'top center' });
      node.querySelector('[data-x]').onclick = () => Pop.close();
      node.querySelector('[data-e]').onclick = () => { Pop.close(); Toast('Erase blocked — cannot erase the startup disk'); };
    });
    on(w.node, 'click', '[data-duadd]', () => Toast('Add APFS Volume — container is at capacity'));
    on(w.node, 'click', '[data-durm]', () => Toast('Select a non-system volume to remove'));
  }
};

APPS.fontbook = {
  name: 'Font Book', icon: 'app-fontbook', w: 820, h: 560, minW: 540, minH: 340,
  menus: () => stdMenus('fontbook'),
  mount(w) {
    w.st = { sel: 0 };
    const FONTS = [
      ['SF Pro', '-apple-system,BlinkMacSystemFont,Inter,sans-serif', 'Regular · Medium · Semibold · Bold'],
      ['Inter', 'Inter,sans-serif', 'Variable 100–900'],
      ['Helvetica Neue', '"Helvetica Neue",Helvetica,sans-serif', 'Regular · Bold · Italic'],
      ['Georgia', 'Georgia,serif', 'Regular · Italic · Bold'],
      ['Times New Roman', '"Times New Roman",Times,serif', 'Regular · Bold'],
      ['JetBrains Mono', '"JetBrains Mono",ui-monospace,monospace', 'Regular · Bold'],
      ['Courier New', '"Courier New",monospace', 'Regular · Bold'],
      ['Impact', 'Impact,sans-serif', 'Regular'],
    ];
    w.FONTS = FONTS;
    return `<div class="wb">
      <div class="sbar" data-drag style="width:230px">
        <div style="display:flex;align-items:center;height:38px;padding:0 12px"><div data-tl></div></div>
        <div class="grp"><div class="gh">Collection</div>
          <div class="si on">${ic('g-title', 'ico')}<span class="nm">All Fonts</span><span class="tail">${FONTS.length}</span></div>
          <div class="si">${ic('g-star', 'ico')}<span class="nm">Favourites</span></div>
          <div class="si">${ic('g-tag', 'ico')}<span class="nm">Recently Used</span></div>
        </div>
        <div class="grp"><div class="gh">Family</div>
          ${FONTS.map(([n], i) => `<div class="si" data-fi="${i}"><span class="nm" style="font-family:${FONTS[i][1]}">${esc(n)}</span></div>`).join('')}
        </div>
      </div>
      <div class="wmain">
        <div class="tbar" data-drag style="height:52px"><div class="fx-title" data-fname></div><div style="flex:1"></div>
          <div class="sfield" data-nodrag style="width:150px"><span>${ic('g-search')}</span><input placeholder="Search"></div></div>
        <div class="scroll" style="flex:1;padding:26px 30px" data-fbody></div>
      </div></div>`;
  },
  ready(w) {
    const render = i => {
      const [n, f, styles] = w.FONTS[i];
      $$('[data-fi]', w.node).forEach(b => b.classList.toggle('on', +b.dataset.fi === i));
      w.node.querySelector('[data-fname]').textContent = n;
      w.node.querySelector('[data-fbody]').innerHTML = `
        <div style="font-family:${f};font-size:64px;line-height:1.1;letter-spacing:-.03em">Aa Bb Cc</div>
        <div style="font-size:12px;color:var(--txt-2);margin:6px 0 22px">${esc(styles)}</div>
        ${[42, 30, 22, 17, 13, 11].map(s => `<div style="font-family:${f};font-size:${s}px;line-height:1.35;margin-bottom:9px;letter-spacing:-.01em">
          The quick brown fox jumps over the lazy dog. 0123456789</div>`).join('')}`;
    };
    on(w.node, 'click', '[data-fi]', (e, t) => render(+t.dataset.fi));
    render(0);
  }
};

APPS.voice = {
  name: 'Voice Memos', icon: 'app-voice', w: 720, h: 500, minW: 460, minH: 320,
  menus: () => stdMenus('voice'),
  mount(w) {
    const M = [['Standup notes', 'Today 4:02 PM', '1:12'], ['Dock easing idea', 'Today 11:40 AM', '0:38'],
    ['Call with Daniel', 'Yesterday', '14:26'], ['Guitar riff', 'Saturday', '2:04']];
    w.M = M;
    return `<div class="wb">
      <div class="sbar" data-drag style="width:260px;padding-top:0">
        <div style="display:flex;align-items:center;height:38px;padding:0 12px"><div data-tl></div></div>
        <div style="padding:0 10px 8px"><div class="sfield" data-nodrag><span>${ic('g-search')}</span><input placeholder="Search"></div></div>
        <div style="overflow:auto;padding:0 8px">
        ${M.map(([n, d, l], i) => `<div class="si" data-vi="${i}" style="height:44px;align-items:center">
          <span style="flex:1;min-width:0;display:flex;flex-direction:column"><b style="font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(n)}</b>
          <span style="font-size:11px;color:var(--txt-2)">${esc(d)}</span></span>
          <span style="font-size:11.5px;color:var(--txt-3);font-variant-numeric:tabular-nums">${l}</span></div>`).join('')}
        </div></div>
      <div class="wmain"><div class="tbar" data-drag style="height:52px"><div class="fx-title" data-vname></div></div>
        <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;padding:20px 30px" data-vbody></div>
      </div></div>`;
  },
  ready(w) {
    const bars = n => [...Array(n)].map((_, i) => {
      const h = 8 + Math.abs(Math.sin(i * .7) * 40) + Math.abs(Math.sin(i * .23) * 22);
      return `<i style="height:${h.toFixed(0)}%"></i>`;
    }).join('');
    const secs = l => { const [m, s] = l.split(':').map(Number); return m * 60 + s; };
    const st = w.st = { i: 0, pos: 0, playing: false };
    const render = i => {
      if (i !== undefined && i !== st.i) { st.i = i; st.pos = 0; st.playing = false; }
      const [n, d, l] = w.M[st.i], dur = secs(l);
      $$('[data-vi]', w.node).forEach(b => b.classList.toggle('on', +b.dataset.vi === st.i));
      w.node.querySelector('[data-vname]').textContent = n;
      w.node.querySelector('[data-vbody]').innerHTML = `
        <div style="font-size:19px;font-weight:600;letter-spacing:-.02em">${esc(n)}</div>
        <div style="font-size:12px;color:var(--txt-2);margin-top:-12px">${esc(d)}</div>
        <div class="wave" data-vwave>${bars(78)}</div>
        <div style="display:flex;align-items:center;gap:10px;width:100%;max-width:420px;font-size:11px;color:var(--txt-2);font-variant-numeric:tabular-nums">
          <span data-vcur>0:00</span><div class="sl" data-vbar style="flex:1"><i style="width:0%"></i><b style="left:0%"></b></div><span>${l}</span></div>
        <div style="display:flex;align-items:center;gap:26px;margin-top:4px">
          <button class="tbtn" data-vskip="-5" title="Back 5s">${ic('g-bwd')}</button>
          <button class="btn pri" data-vplay style="width:46px;height:46px;border-radius:50%;padding:0;display:grid;place-items:center">${ic(st.playing ? 'g-pause' : 'g-play')}</button>
          <button class="tbtn" data-vskip="5" title="Forward 5s">${ic('g-fwd')}</button></div>`;
      w.node.querySelector('.btn.pri svg').style.cssText = 'width:17px;height:17px';
      paint(dur);
    };
    /* The waveform dims ahead of the playhead, which is how you can tell it is
       actually playing rather than just animating a bar. */
    const paint = dur => {
      const f = clamp(st.pos / dur, 0, 1);
      const bar = w.node.querySelector('[data-vbar]');
      if (!bar) return;
      bar.querySelector('i').style.width = f * 100 + '%';
      bar.querySelector('b').style.left = f * 100 + '%';
      w.node.querySelector('[data-vcur]').textContent = mmss(Math.round(st.pos));
      const wave = w.node.querySelector('[data-vwave]');
      const n = wave.children.length;
      [...wave.children].forEach((b, k) => b.style.opacity = k / n <= f ? '1' : '.32');
    };
    on(w.node, 'click', '[data-vi]', (e, t) => render(+t.dataset.vi));
    on(w.node, 'click', '[data-vplay]', () => { st.playing = !st.playing; render(); });
    on(w.node, 'click', '[data-vskip]', (e, t) => {
      const dur = secs(w.M[st.i][2]);
      st.pos = clamp(st.pos + +t.dataset.vskip, 0, dur); paint(dur);
    });
    on(w.node, 'pointerdown', '[data-vbar]', (e, t) => {
      const dur = secs(w.M[st.i][2]), r = t.getBoundingClientRect();
      const move = ev => { st.pos = clamp((ev.clientX - r.left) / r.width, 0, 1) * dur; paint(dur); };
      move(e);
      const up = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); };
      addEventListener('pointermove', move); addEventListener('pointerup', up);
    });
    w.vTimer = setInterval(() => {
      if (w.dead || !st.playing) return;
      const dur = secs(w.M[st.i][2]);
      st.pos += .25;
      if (st.pos >= dur) { st.pos = dur; st.playing = false; render(); return; }
      paint(dur);
    }, 250);
    render(0);
  },
  onClose(w) { clearInterval(w.vTimer); }
};

APPS.launchpad = { name: 'Launchpad', icon: 'app-launchpad', overlay: true };
APPS.trash = { name: 'Trash', icon: 'app-trash', overlay: true };

/* ============================================================================
   26 · LAUNCHPAD
   ========================================================================== */
const LAUNCH_ORDER = ['finder', 'safari', 'mail', 'messages', 'maps', 'photos', 'facetime',
  'calendar', 'contacts', 'reminders', 'notes', 'freeform', 'voice', 'appstore',
  'podcasts', 'music', 'tv', 'books', 'stocks', 'weather', 'clock',
  'terminal', 'activity', 'diskutil', 'fontbook', 'calculator', 'textedit', 'preview',
  'settings', 'about'];
const PER_PAGE = 28;   /* 7 × 4, like the real grid at this height */

const Launchpad = {
  page: 0,
  toggle() { $('#lpad') ? this.close() : this.open(); },
  open() {
    if ($('#lpad')) return;
    Pop.close(true);
    this.page = 0; this.q = '';
    const node = el(`<div id="lpad" class="nosel">
      <div class="sq">${ic('g-search')}<input placeholder="Search" data-lq spellcheck="false"></div>
      <div class="grid" data-lgrid></div>
      <div class="dots" data-ldots></div></div>`);
    $('#layer-overlay').append(node);
    this.render();
    node.addEventListener('pointerdown', e => { if (e.target === node || e.target.classList.contains('grid')) this.close(); });
    on(node, 'click', '.app', (e, t) => {
      const id = t.dataset.app;
      this.close();
      setTimeout(() => Dock.activate(id), 90);
    });
    on(node, 'contextmenu', '.app', (e, t) => ctxMenu(e, [
      { id: 'o', label: 'Open', run: () => { this.close(); Dock.activate(t.dataset.app); } },
      { id: 'd', label: 'Add to Dock' }, { id: 'x', label: 'Delete', disabled: true },
    ]));
    const inp = node.querySelector('[data-lq]');
    inp.addEventListener('input', () => { this.q = inp.value; this.page = 0; this.render(); });
    inp.addEventListener('keydown', e => {
      if (e.key === 'Escape') this.close();
      if (e.key === 'Enter') { const first = node.querySelector('.app'); if (first) first.click(); }
      if (!this.q && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) { e.preventDefault(); this.turn(e.key === 'ArrowRight' ? 1 : -1); }
    });
    setTimeout(() => inp.focus(), 120);
    node.addEventListener('wheel', e => {
      if (this.q) return;
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) { if (e.deltaX > 12) this.turn(1); else if (e.deltaX < -12) this.turn(-1); }
    }, { passive: true });
  },
  turn(d) {
    const pages = Math.ceil(LAUNCH_ORDER.length / PER_PAGE);
    const p = clamp(this.page + d, 0, pages - 1);
    if (p !== this.page) { this.page = p; this.render(); }
  },
  render() {
    const node = $('#lpad'); if (!node) return;
    let ids = LAUNCH_ORDER;
    if (this.q) { const q = this.q.toLowerCase(); ids = ids.filter(i => APPS[i].name.toLowerCase().includes(q)); }
    const pages = Math.max(1, Math.ceil(ids.length / PER_PAGE));
    this.page = clamp(this.page, 0, pages - 1);
    const slice = ids.slice(this.page * PER_PAGE, (this.page + 1) * PER_PAGE);
    node.querySelector('[data-lgrid]').innerHTML = slice.map(id =>
      `<div class="app" data-app="${id}"><div class="art">${ic(APPS[id].icon)}</div><div class="nm">${esc(APPS[id].name)}</div></div>`).join('')
      || `<div style="grid-column:1/-1;text-align:center;color:rgba(255,255,255,.75);font-size:14px;padding-top:40px;text-shadow:0 1px 3px rgba(0,0,0,.4)">No results</div>`;
    node.querySelector('[data-ldots]').innerHTML = pages > 1
      ? [...Array(pages)].map((_, i) => `<i class="${i === this.page ? 'on' : ''}"></i>`).join('') : '';
  },
  close() {
    const node = $('#lpad'); if (!node) return;
    node.classList.add('out');
    setTimeout(() => node.remove(), 200);
  }
};

/* ============================================================================
   27 · SPOTLIGHT
   ========================================================================== */
const SPOT_ACTIONS = [
  { name: 'Toggle Dark Mode', kind: 'Action', icon: 'g-moon', run: () => Theme.toggle() },
  { name: 'Open Launchpad', kind: 'Action', icon: 'app-launchpad', run: () => Launchpad.open() },
  { name: 'Notification Centre', kind: 'Action', icon: 'g-cc', run: () => NotifCenter.open() },
  { name: 'Empty Trash', kind: 'Action', icon: 'app-trash', run: () => { Dock.setTrashFull(false); Toast('Trash emptied'); } },
  { name: 'Change Wallpaper', kind: 'Action', icon: 'g-globe', run: () => WM.open('settings', { section: 'wallpaper' }) },
  { name: 'Sleep', kind: 'Action', icon: 'g-power', run: () => Screen.sleep() },
];

const Spotlight = {
  sel: 0, results: [],
  toggle() { $('#spot') ? this.close() : this.open(); },
  open() {
    if ($('#spot')) return;
    Pop.close(true);
    const node = el(`<div id="spot" class="nosel"><div class="scrim"></div>
      <div class="box"><div class="qrow">${ic('g-spot')}<input data-sq placeholder="Spotlight Search" spellcheck="false" autocomplete="off"></div>
      <div class="res scroll" data-sres"></div></div></div>`);
    $('#layer-overlay').append(node);
    node.querySelector('.scrim').addEventListener('pointerdown', () => this.close());
    const inp = node.querySelector('[data-sq]');
    inp.addEventListener('input', () => this.search(inp.value));
    inp.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { e.preventDefault(); this.move(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); this.move(-1); }
      else if (e.key === 'Enter') { e.preventDefault(); this.fire(); }
      else if (e.key === 'Escape') { e.preventDefault(); this.close(); }
    });
    on(node, 'click', '.r', (e, t) => { this.sel = +t.dataset.i; this.fire(); });
    on(node, 'mousemove', '.r', (e, t) => { if (this.sel !== +t.dataset.i) { this.sel = +t.dataset.i; this.mark(); } });
    setTimeout(() => inp.focus(), 30);
    this.search('');
  },
  search(q) {
    const node = $('#spot'); if (!node) return;
    q = q.trim();
    const res = node.querySelector('.res');
    this.sel = 0;
    if (!q) { this.results = []; res.innerHTML = ''; return; }
    const lq = q.toLowerCase();
    const apps = LAUNCH_ORDER.filter(i => APPS[i].name.toLowerCase().includes(lq))
      .map(i => ({ name: APPS[i].name, kind: 'Application', icon: APPS[i].icon, run: () => Dock.activate(i) }));
    const acts = SPOT_ACTIONS.filter(a => a.name.toLowerCase().includes(lq));
    /* Bundles found on disk belong under Applications, not Documents. */
    const found = Finder.deepSearch(FS, lq).slice(0, 12).map(f => ({
      name: f.name,
      kind: f.kind === 'folder' ? 'Folder' : /\.app$/.test(f.name) ? 'Application' : (f.k || 'Document'),
      icon: f.icon,
      run: () => f.kind === 'folder' ? WM.open('finder', { path: Finder.findPath(FS, f) || PLACES.prasenjit }) : Finder.openFile(f)
    }));
    const notes = NOTE_SEED.filter(n => n.title.toLowerCase().includes(lq)).slice(0, 3)
      .map(n => ({ name: n.title, kind: 'Note', icon: 'app-notes', run: () => WM.open('notes') }));
    const web = [{ name: `Search the web for “${q}”`, kind: 'Safari', icon: 'app-safari', run: () => Saf.go('search:' + q) }];
    /* Prefer the real app entry over its .app file for the same name */
    const seen = new Set(apps.map(a => a.name.toLowerCase() + '.app'));

    const groups = [
      ['Top Hit', (apps[0] ? [apps[0]] : acts[0] ? [acts[0]] : found[0] ? [found[0]] : [])],
      ['Applications', apps.concat(found.filter(f => f.kind === 'Application' && !seen.has(f.name.toLowerCase())))],
      ['Actions', acts],
      ['Documents', found.filter(f => f.kind !== 'Folder' && f.kind !== 'Application')],
      ['Folders', found.filter(f => f.kind === 'Folder')],
      ['Notes', notes],
      ['Suggested Websites', web],
    ];
    this.results = [];
    let html = '';
    groups.forEach(([g, items]) => {
      const uniq = items.filter(it => !this.results.some(r => r.name === it.name && r.kind === it.kind));
      if (!uniq.length) return;
      html += `<div class="cat">${g}</div>`;
      uniq.slice(0, 6).forEach(it => {
        const i = this.results.length; this.results.push(it);
        html += `<div class="r" data-i="${i}"><span class="art">${ic(it.icon)}</span><span class="nm">${esc(it.name)}</span><span class="kind">${esc(it.kind)}</span></div>`;
      });
    });
    res.innerHTML = html || `<div class="empty">No results for “${esc(q)}”</div>`;
    this.mark();
  },
  mark() {
    const node = $('#spot'); if (!node) return;
    $$('.r', node).forEach(r => r.classList.toggle('on', +r.dataset.i === this.sel));
    const on2 = node.querySelector('.r.on');
    if (on2) on2.scrollIntoView({ block: 'nearest' });
  },
  move(d) { if (!this.results.length) return; this.sel = clamp(this.sel + d, 0, this.results.length - 1); this.mark(); },
  fire() {
    const r = this.results[this.sel];
    this.close();
    if (r && r.run) setTimeout(() => r.run(), 60);
  },
  close() {
    const node = $('#spot'); if (!node) return;
    node.classList.add('out');
    setTimeout(() => node.remove(), 150);
  }
};

/* ============================================================================
   28 · WIDGETS  (shared by the desktop and Notification Centre)
   ========================================================================== */
function analogClock(d, size = 130) {
  const s = d.getSeconds(), m = d.getMinutes() + s / 60, h = (d.getHours() % 12) + m / 60;
  const A = (deg, r1, r2, w, col, cap = 'round') => {
    const a = (deg - 90) * Math.PI / 180;
    return `<line x1="${50 + Math.cos(a) * r1}" y1="${50 + Math.sin(a) * r1}" x2="${50 + Math.cos(a) * r2}" y2="${50 + Math.sin(a) * r2}" stroke="${col}" stroke-width="${w}" stroke-linecap="${cap}"/>`;
  };
  const ticks = [...Array(60)].map((_, i) => {
    const a = (i * 6 - 90) * Math.PI / 180, big = i % 5 === 0;
    const r1 = big ? 38 : 40.5, r2 = 43.5;
    return `<line x1="${50 + Math.cos(a) * r1}" y1="${50 + Math.sin(a) * r1}" x2="${50 + Math.cos(a) * r2}" y2="${50 + Math.sin(a) * r2}"
      stroke="currentColor" stroke-opacity="${big ? .78 : .28}" stroke-width="${big ? 2 : 1}" stroke-linecap="round"/>`;
  }).join('');
  return `<svg viewBox="0 0 100 100" style="width:${size}px;height:${size}px;color:var(--txt)">
    <circle cx="50" cy="50" r="47" fill="var(--win)" stroke="var(--line)" stroke-width="1"/>
    ${ticks}
    ${A(h * 30, -4, 25, 4.4, 'currentColor')}
    ${A(m * 6, -6, 36, 3, 'currentColor')}
    ${A(s * 6, -9, 38, 1.2, '#ff453a')}
    <circle cx="50" cy="50" r="2.6" fill="currentColor"/><circle cx="50" cy="50" r="1.2" fill="#ff453a"/>
  </svg>`;
}

const Widgets = {
  /* Painted inline, not on the first tick: everySecond() fires before the node is
     in the document, so an isConnected guard would leave the face blank for up to
     a second every time the panel opens. */
  clock(o = {}) {
    const now = new Date(), sz = o.compact ? 118 : 132;
    const face = d => `${DAYS[d.getDay()]}, ${d.getDate()} ${MONS[d.getMonth()]}`;
    const n = el(`<div class="wgt"><div class="clockw" data-cl>${analogClock(now, sz)}</div>
      <div style="text-align:center;font-size:12.5px;font-weight:600;margin-top:2px" data-cd>${face(now)}</div></div>`);
    everySecond(d => {
      if (!n.isConnected) return;
      n.querySelector('[data-cl]').innerHTML = analogClock(d, sz);
      n.querySelector('[data-cd]').textContent = face(d);
    });
    return n;
  },
  clockSq() {
    const n = el(`<div class="wgt sqw"><div class="clockw" data-cl>${analogClock(new Date(), 124)}</div></div>`);
    everySecond(d => { if (n.isConnected) n.querySelector('[data-cl]').innerHTML = analogClock(d, 124); });
    return n;
  },
  batterySq() {
    const pct = SYS.battery, C = 2 * Math.PI * 40;
    const col = !SYS.charging && pct <= 20 ? '#ff9f0a' : '#30d158';
    const mins = Math.round(pct / 100 * 11.4 * 60);
    const n = el(`<div class="wgt sqw batsq"><div class="wh"><span class="t">Battery</span></div>
      <div class="rw"><svg viewBox="0 0 96 96">
        <circle cx="48" cy="48" r="40" fill="none" stroke="var(--fill-2)" stroke-width="8"/>
        <circle cx="48" cy="48" r="40" fill="none" stroke="${col}" stroke-width="8" stroke-linecap="round"
          stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - pct / 100)}" transform="rotate(-90 48 48)"/>
        </svg><b>${pct}%</b></div>
      <div class="sub">${SYS.charging ? 'Charging' : `${Math.floor(mins / 60)}h ${mins % 60}m left`}</div></div>`);
    Bus.on('battery', () => { if (n.isConnected) n.replaceWith(Widgets.batterySq()); });
    return n;
  },
  weather(o = {}) {
    const n = el(`<div class="wgt"><div class="wx" data-wxw></div></div>`);
    const paint = () => {
      if (!n.isConnected && !o.compact) return;
      const c = Wx.now(), hrs = Wx.hours(5), [label, glyph] = Wx.code(c.code, c.day);
      n.querySelector('[data-wxw]').innerHTML = `
        <div class="loc">${esc(Wx.place)}</div>
        <div class="now"><span class="deg">${c.t}°</span><span class="ico">${ic(glyph)}</span></div>
        <div class="cond">${esc(label)}</div><div class="hi">H:${c.hi}° L:${c.lo}°</div>
        <div class="hours">${hrs.map(([h, t, g]) => `<div><span>${esc(h)}</span>${ic(g)}<b>${t}°</b></div>`).join('')}</div>`;
    };
    paint();
    Wx.load().then(paint);
    Bus.on('wx', paint);
    n.addEventListener('dblclick', () => WM.open('weather'));
    return n;
  },
  stocks(o = {}) {
    const n = el(`<div class="wgt"><div class="wh"><span class="t">Stocks</span><span class="s">${time12(new Date())}</span></div>
      <div class="stk">${TICKERS.slice(0, 3).map((t, i) => `<div class="row ${t.up ? 'up' : 'dn'}">
        <span class="sym"><b>${t.s}</b><span>${esc(t.n)}</span></span>
        <span class="spark">${spark(t.up, 90, 26, i)}</span>
        <span class="num"><b>${t.p.toFixed(2)}</b><span>${t.up ? '+' : ''}${t.d.toFixed(2)}%</span></span></div>`).join('')}</div></div>`);
    n.addEventListener('dblclick', () => WM.open('stocks'));
    return n;
  },
  calendar(o = {}) {
    const d = new Date();
    const fill = n => {
      const evs = evOn(d.getFullYear(), d.getMonth(), d.getDate());
      n.innerHTML = `<div class="dow">${DAYS[d.getDay()]}</div><div class="dnum">${d.getDate()}</div>
      ${evs.length ? evs.map(e => `<div class="ev"><i style="background:${e.c}"></i><div class="b"><b>${esc(e.t)}</b><span>${esc(e.at)}</span></div></div>`).join('')
          : '<div class="none">No more events today.</div>'}`;
    };
    const n = el(`<div class="wgt calw"></div>`);
    fill(n);
    /* Adding, moving or hiding an event in Calendar has to show up here too. */
    Bus.on('events', () => { if (n.isConnected) fill(n); });
    n.addEventListener('dblclick', () => WM.open('calendar'));
    return n;
  },
  battery(o = {}) {
    const pct = SYS.battery, C = 2 * Math.PI * 27;
    const col = SYS.charging ? '#30d158' : pct <= 20 ? '#ff9f0a' : '#30d158';
    const mins = Math.round(pct / 100 * 11.4 * 60);
    const n = el(`<div class="wgt sm"><div class="wh"><span class="t">Battery</span></div>
      <div class="batw"><svg class="ring" viewBox="0 0 64 64">
        <circle cx="32" cy="32" r="27" fill="none" stroke="var(--fill-2)" stroke-width="7"/>
        <circle cx="32" cy="32" r="27" fill="none" stroke="${col}" stroke-width="7" stroke-linecap="round"
          stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - pct / 100)}" transform="rotate(-90 32 32)"/>
        </svg>
        <div class="info"><b>${pct}%</b><span>${SYS.charging ? 'Charging' : `${Math.floor(mins / 60)}h ${mins % 60}m left`}</span></div></div></div>`);
    Bus.on('battery', () => { if (n.isConnected) n.replaceWith(Widgets.battery(o)); });
    return n;
  },
  reminders() {
    const items = [['Send brand review feedback', '#ff375f'], ['Review PR #142', '#0a84ff'], ['Pick up dry cleaning', '#ff9f0a']];
    const n = el(`<div class="wgt"><div class="wh"><span class="t">Today</span><span class="s">3 remaining</span></div>
      ${items.map(([t, c]) => `<div style="display:flex;gap:9px;align-items:center;padding:5px 0;border-top:.5px solid var(--line)">
        <span style="width:15px;height:15px;border-radius:50%;border:1.6px solid ${c};flex:none"></span>
        <span style="font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(t)}</span></div>`).join('')}</div>`);
    n.addEventListener('dblclick', () => WM.open('reminders'));
    return n;
  }
};

/* ============================================================================
   29 · NOTIFICATION CENTRE
   ========================================================================== */
const NotifCenter = {
  toggle() { $('#nc') ? this.close() : this.open(); },
  open() {
    if ($('#nc')) return;
    Pop.close(true);
    const scrim = el(`<div id="nc-scrim"></div>`);
    const node = el(`<div id="nc" class="nosel"><div class="nc-scroll"></div></div>`);
    const box = node.querySelector('.nc-scroll');
    const row = el(`<div class="nc-row"></div>`);
    row.append(Widgets.clockSq(), Widgets.batterySq());
    box.append(row, Widgets.weather(), Widgets.calendar(), Widgets.stocks(), Widgets.reminders());
    box.insertAdjacentHTML('beforeend', `<div class="nc-title">Earlier Today</div>`);
    [
      ['app-messages', 'Messages', 'Kate', 'bringing coffee AND a blanket, i know how you drive', '4:28 PM'],
      ['app-mail', 'Mail', 'Figma', 'Daniel left 3 comments on Desktop v4', '4:21 PM'],
      ['app-calendar', 'Calendar', 'Dentist', 'in 10 minutes · 3:50 PM', '3:40 PM'],
      ['app-settings', 'Software Update', 'macOS Tahoe 26.0.1', 'A new update is available.', '1:02 PM'],
    ].forEach(([ico, app, t, b, tm]) => box.insertAdjacentHTML('beforeend',
      `<div class="note"><span class="art">${ic(ico)}</span><span class="bd"><b>${esc(t)}</b><p>${esc(b)}</p></span><span class="tm">${esc(tm)}</span></div>`));
    /* Parked off-screen for its first frame: laying out five widgets and priming
       the panel's blur costs a paint, and it would otherwise land on frame one of
       the slide. One frame later the panel is warm and the slide runs clean. */
    node.style.transform = 'translateX(100%)';
    $('#layer-overlay').append(scrim, node);
    scrim.addEventListener('pointerdown', () => this.close());
    $('#menubar [data-st="clock"]').classList.add('open');
    requestAnimationFrame(() => {
      if (!node.isConnected) return;
      node.style.transform = '';                      // no transform may survive, or the blur dies
      /* fill:none, so no transform survives the slide */
      node.animate([{ transform: 'translateX(100%)', opacity: .4 }, { transform: 'none', opacity: 1 }],
        { duration: 380, easing: 'cubic-bezier(.22,1,.36,1)' });
    });
  },
  close() {
    const node = $('#nc'), scrim = $('#nc-scrim');
    if (!node) return;
    node.id = '';                                     // so a re-open can't find it
    if (scrim) scrim.remove();
    $('#menubar [data-st="clock"]').classList.remove('open');
    const a = node.animate([{ transform: 'none', opacity: 1 }, { transform: 'translateX(101%)', opacity: .5 }],
      { duration: 260, easing: 'cubic-bezier(.4,0,1,1)', fill: 'forwards' });
    a.onfinish = () => node.remove();
  }
};

/* ============================================================================
   30 · STARTUP — power-on, then login
   ========================================================================== */
const Startup = {
  /* Skippable, because a 2s boot in front of every reload is a tax on anyone
     poking at this — including the test harness, which passes ?boot=0. */
  wanted() {
    const q = new URLSearchParams(location.search);
    return q.get('boot') !== '0' && !/\bnoboot\b/.test(location.hash);
  },

  run() {
    const boot = $('#boot');
    if (!this.wanted()) { boot.remove(); return; }

    const fill = boot.querySelector('.bar i');
    /* Uneven steps: a perfectly linear bar looks like a loading GIF. Apple's
       stalls, jumps, then finishes. */
    const steps = [[120, 14], [420, 27], [700, 34], [980, 62], [1180, 74], [1400, 88], [1620, 100]];
    steps.forEach(([at, pct]) => setTimeout(() => { fill.style.width = pct + '%'; }, at));

    const done = () => { if (boot.isConnected) { boot.classList.add('out'); setTimeout(() => boot.remove(), 480); this.lock(); } };
    this.bootTimer = setTimeout(done, 1980);
    /* Impatience is allowed. */
    const skip = () => { clearTimeout(this.bootTimer); fill.style.width = '100%'; done(); };
    boot.addEventListener('click', skip);
    addEventListener('keydown', function once(e) { if ($('#boot')) { skip(); } removeEventListener('keydown', once); });
  },

  /* Shown after boot, and again from  > Lock Screen. */
  lock() {
    const n = $('#lock'); if (!n || n.dataset.on === '1') return;
    n.hidden = false; n.dataset.on = '1';
    n.classList.remove('out', 'opening');
    /* Reuse whatever the desktop is currently showing, procedural fallback included. */
    const live = $('#wall .layer.photo.on');
    n.querySelector('.lk-wall').style.backgroundImage =
      (live && live.style.backgroundImage) || `url("${WALLPAPERS[SYS.wallpaper].url}")`;
    n.querySelector('[data-av]').style.backgroundImage = `url("${AVATAR}")`;
    this.tick();
    this.timer = setInterval(() => this.tick(), 1000);
    Pop.close(true);
    if (!this.bound) {
      this.bound = true;
      n.addEventListener('click', () => this.unlock());
    }
    this.keyGo = e => { if (['Enter', ' ', 'Escape'].includes(e.key)) { e.preventDefault(); this.unlock(); } };
    addEventListener('keydown', this.keyGo);
  },

  tick() {
    const n = $('#lock'); if (!n) return;
    const d = new Date();
    n.querySelector('.lk-date').textContent = `${DAYS[d.getDay()]}, ${MONS[d.getMonth()]} ${d.getDate()}`;
    n.querySelector('.lk-time').textContent = time12(d).replace(NBSP, ' ').replace(/\s?[AP]M$/, '');
  },

  /* Restart really does tear the session down — every window closes, the bar runs
     again, and you land back on the login screen. */
  restart() {
    WM.list.slice().forEach(w => WM.close(w.id));
    NotifCenter.close(); Pop.close(true);
    const boot = el(`<div id="boot"><svg viewBox="0 0 15 18" class="bl"><use href="#g-apple"/></svg>
      <div class="bar"><i></i></div></div>`);
    $('#stage').append(boot);
    const fill = boot.querySelector('.bar i');
    [[80, 18], [360, 30], [640, 48], [900, 70], [1120, 86], [1340, 100]]
      .forEach(([at, pct]) => setTimeout(() => { fill.style.width = pct + '%'; }, at));
    setTimeout(() => {
      boot.classList.add('out'); setTimeout(() => boot.remove(), 480);
      this.lock();
      setTimeout(() => WM.open('finder', { path: PLACES.prasenjit }), 900);
    }, 1700);
  },

  shutDown() {
    WM.list.slice().forEach(w => WM.close(w.id));
    NotifCenter.close(); Pop.close(true);
    const off = el(`<div id="boot" style="cursor:var(--cur-hand)">
      <div style="font-size:13px;color:rgba(255,255,255,.5);position:absolute;bottom:16%">Click anywhere to start up</div></div>`);
    $('#stage').append(off);
    off.addEventListener('click', () => { off.remove(); this.restart(); });
  },

  unlock() {
    const n = $('#lock'); if (!n || n.dataset.on !== '1') return;
    n.dataset.on = '0';
    clearInterval(this.timer);
    removeEventListener('keydown', this.keyGo);
    /* Wallpaper snaps back into focus a beat before the panel dissolves, which is
       what makes it feel like the desktop was always there. */
    n.classList.add('opening');
    setTimeout(() => {
      n.classList.add('out');
      setTimeout(() => { n.hidden = true; n.classList.remove('out', 'opening'); }, 480);
    }, 120);
  },
};

(function boot() {
  /* Calendar dock icon shows the live date, like the real one */
  const now = new Date();
  const dow = $('#cal-dow'), day = $('#cal-day');
  if (dow) dow.textContent = DAYS3[now.getDay()].toUpperCase();
  if (day) day.textContent = now.getDate();

  Theme.setAppearance(SYS.appearance);
  Theme.paintAccent();
  Set2.applyChrome();
  Wall.set(SYS.wallpaper);
  Screen.setBrightness(Screen.brightness);

  MenuBar.init();
  Desktop.init();
  Dock.init();

  /* Right-click the dock's empty glass */
  $('#dock').addEventListener('contextmenu', e => {
    if (e.target.closest('.di')) return;
    ctxMenu(e, [
      { id: 'mag', label: 'Turn Magnification ' + (SYS.dockMagOn ? 'Off' : 'On'), run: () => { SYS.dockMagOn = !SYS.dockMagOn; Dock.measure(); } },
      { id: 'pos', label: 'Position on Screen', key: '▸' },
      '-',
      { id: 'pref', label: 'Dock Settings…', run: () => WM.open('settings', { section: 'dock' }) },
    ]);
  });

  /* Menu-bar clock area also responds to a right-click */
  $('#menubar').addEventListener('contextmenu', e => {
    e.preventDefault();
    ctxMenu(e, [
      { id: 'a', label: 'Menu Bar Settings…', run: () => WM.open('settings', { section: 'appearance' }) },
      { id: 'c', label: 'Control Centre Settings…', run: () => WM.open('settings', { section: 'appearance' }) },
    ]);
  });

  /* Battery drifts down slowly so the UI is never quite static */
  setInterval(() => {
    if (SYS.charging) SYS.battery = Math.min(100, SYS.battery + 1);
    else if (Math.random() < .35) SYS.battery = Math.max(3, SYS.battery - 1);
    MenuBar.paintStatus();
  }, 42000);

  /* Open the window most people would open first */
  setTimeout(() => WM.open('finder', { path: PLACES.prasenjit }), 340);

  /* Launchpad's full-screen blur costs ~230ms the first time Chromium rasterises
     it — a visible stutter on the fade-in, and only ever on the first open. So
     pay it here, invisibly, while nobody is waiting on it. */
  const warm = () => {
    const n = el(`<div id="lpad" class="nosel" style="opacity:.002;animation:none;pointer-events:none">
      <div class="grid">${LAUNCH_ORDER.slice(0, PER_PAGE).map(id =>
      `<div class="app"><div class="art">${ic(APPS[id].icon)}</div><div class="nm">${esc(APPS[id].name)}</div></div>`).join('')}</div></div>`);
    /* The tray pays the same first-rasterise toll as Launchpad — a tall blurred
       surface Chromium has never composited before. Warm it off the same idle beat. */
    const t = el(`<div id="nc" class="nosel" style="opacity:.002;transform:none;animation:none;pointer-events:none"></div>`);
    /* And the genie: the first window to warp costs three long frames while Chromium
       rasterises an animated clip-path for the first time. Run one through the same
       keyframes on a throwaway node so the toll is paid before anyone sees it. */
    const g = el(`<div class="win mini" style="left:40px;top:40px;width:360px;height:260px;opacity:.002;pointer-events:none;visibility:visible">
      <div class="tb"></div><div class="wb"></div></div>`);
    $('#layer-overlay').append(n, t, g);
    n.getBoundingClientRect(); t.getBoundingClientRect();
    const ga = g.animate([
      { transform: 'translate(0px,0px) scale(1,1)', clipPath: 'polygon(0% 0%,100% 0%,100% 100%,0% 100%)', borderRadius: '11px' },
      { transform: 'translate(120px,300px) scale(.3,.3)', clipPath: 'polygon(20% 0%,80% 0%,93% 100%,7% 100%)', borderRadius: '22px', offset: .55 },
      { transform: 'translate(240px,600px) scale(.06,.06)', clipPath: 'polygon(43% 0%,57% 0%,100% 100%,0% 100%)', borderRadius: '40px' },
    ], { duration: 120, easing: 'cubic-bezier(.42,.02,.58,1)' });
    ga.onfinish = () => g.remove();
    requestAnimationFrame(() => requestAnimationFrame(() => { n.remove(); t.remove(); }));
  };
  (window.requestIdleCallback || (f => setTimeout(f, 1400)))(warm, { timeout: 2600 });

  addEventListener('resize', () => {
    /* keep windows on screen when the viewport shrinks */
    WM.list.forEach(w => {
      const n = w.node;
      if (w.zoomed) { Object.assign(n.style, { left: '0px', top: WM.mb() + 'px', width: innerWidth + 'px', height: WM.visibleH() + 'px' }); return; }
      n.style.left = Math.min(n.offsetLeft, Math.max(10, innerWidth - 120)) + 'px';
      n.style.top = clamp(n.offsetTop, WM.mb(), Math.max(WM.mb(), innerHeight - 40)) + 'px';
    });
  });

  /* Don't let the browser's own menu appear on the wallpaper */
  document.addEventListener('contextmenu', e => {
    if (e.target.closest('input,textarea,[contenteditable="true"],.tm-body')) return;
    if (!e.defaultPrevented) e.preventDefault();
  });
  document.addEventListener('dragstart', e => e.preventDefault());

  Startup.run();
})();

    window.WM = WM;
    window.APPS = APPS;
    window.Pop = Pop;
    window.Dock = Dock;
    window.MenuBar = MenuBar;
    window.Theme = Theme;
    window.SYS = SYS;
    window.Wall = Wall;
    window.Screen = Screen;
    window.Desktop = Desktop;
    window.Launchpad = Launchpad;
    window.Spotlight = Spotlight;
    window.NotifCenter = NotifCenter;
    window.Startup = Startup;
  }
}
