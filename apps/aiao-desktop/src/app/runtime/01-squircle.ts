import { restoreRuntimeSource } from './runtime-source';

export const SCRIPT_01_SQUIRCLE = restoreRuntimeSource(String.raw`
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
`);
