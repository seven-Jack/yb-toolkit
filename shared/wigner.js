/* shared/wigner.js — Wigner 3j / 6j 与角动量代数
 *
 * 来源：hfs-matrix-element-calculator v2.2（Racah 公式 + 对数阶乘）
 * 验证：与 sympy.physics.wigner 吻合到 1e-16；三角不等式不满足时返回 0
 *      （sympy 在该情形抛异常，此处返回 0 更适合批量扫描）。
 *
 * 约定（Edmonds / Steck）：
 *   ⟨F′m′|d_q|Fm⟩ = (−1)^(F′−m′) · (F′ 1 F; −m′ q m) · ⟨F′‖d‖F⟩
 *   ⟨F′‖d‖F⟩      = (−1)^(J′+I+F+1) √((2F+1)(2F′+1)) {J′ F′ I; F J 1} · ⟨J′‖d‖J⟩
 * 其中 ⟨J′‖d‖J⟩ 由 Γ 反解，即本框架的 d_red。
 *
 * ⚠ 归一化陷阱（本项目已栽过两次）：d_Edmonds = √(2J+1) · d_CG。
 *   J=0 基态时该因子恰为 1，所以 Yb 的推导一直未受影响 —— 但换到
 *   碱金属（J=1/2）就会差 √2。因此：绝不存文献 d 值，一律由 Γ 反解。
 *
 * 全局暴露为 window.YBW
 */
(function (root) {
  'use strict';

  const LF=(()=>{const t=[0];for(let i=1;i<=600;i++)t[i]=t[i-1]+Math.log(i);
    return n=>{const k=Math.round(n);return k<0?NaN:t[k];};})();
  const isInt=x=>Math.abs(x-Math.round(x))<1e-9;
  const tri=(a,b,c)=>a+b>=c-1e-9&&b+c>=a-1e-9&&c+a>=b-1e-9;
  const sgn=n=>((((Math.round(n)%2)+2)%2)?-1:1);
  function w3j(j1,j2,j3,m1,m2,m3){
    if(!isInt(j1+j2+j3)||Math.abs(m1+m2+m3)>1e-9)return 0;
    if(Math.abs(m1)>j1+1e-9||Math.abs(m2)>j2+1e-9||Math.abs(m3)>j3+1e-9)return 0;
    if(!isInt(j1-m1)||!isInt(j2-m2)||!isInt(j3-m3)||!tri(j1,j2,j3))return 0;
    const pre=.5*(LF(j1+j2-j3)+LF(j1-j2+j3)+LF(-j1+j2+j3)-LF(j1+j2+j3+1)
      +LF(j1+m1)+LF(j1-m1)+LF(j2+m2)+LF(j2-m2)+LF(j3+m3)+LF(j3-m3));
    const k0=Math.round(Math.max(0,j2-j3-m1,j1-j3+m2));
    const k1=Math.round(Math.min(j1+j2-j3,j1-m1,j2+m2));
    let s=0;
    for(let k=k0;k<=k1;k++)s+=sgn(k)*Math.exp(pre-(LF(k)+LF(j1+j2-j3-k)+LF(j1-m1-k)
      +LF(j2+m2-k)+LF(j3-j2+m1+k)+LF(j3-j1-m2+k)));
    return sgn(j1-j2-m3)*s;
  }
  const dlt=(a,b,c)=>LF(a+b-c)+LF(a-b+c)+LF(-a+b+c)-LF(a+b+c+1);
  function w6j(a,b,c,d,e,f){
    if(!tri(a,b,c)||!tri(a,e,f)||!tri(d,b,f)||!tri(d,e,c))return 0;
    if(!isInt(a+b+c)||!isInt(a+e+f)||!isInt(d+b+f)||!isInt(d+e+c))return 0;
    const pre=.5*(dlt(a,b,c)+dlt(a,e,f)+dlt(d,b,f)+dlt(d,e,c));
    const z0=Math.round(Math.max(a+b+c,a+e+f,d+b+f,d+e+c));
    const z1=Math.round(Math.min(a+b+d+e,b+c+e+f,a+c+d+f));
    let s=0;
    for(let z=z0;z<=z1;z++)s+=sgn(z)*Math.exp(pre+LF(z+1)-(LF(z-a-b-c)+LF(z-a-e-f)
      +LF(z-d-b-f)+LF(z-d-e-c)+LF(a+b+d+e-z)+LF(b+c+e+f-z)+LF(a+c+d+f-z)));
    return s;
  }
  const sixj=(I,J,Jp,F,Fp)=>w6j(Jp,Fp,I,F,J,1);
  const redHFS=(I,J,Jp,F,Fp)=>sgn(Jp+I+F+1)*Math.sqrt((2*F+1)*(2*Fp+1))*sixj(I,J,Jp,F,Fp);
  const zee=(I,J,Jp,F,m,Fp,mp,q)=>sgn(Fp-mp)*w3j(Fp,1,F,-mp,q,m)*redHFS(I,J,Jp,F,Fp);
  const frange=(j,i)=>{const lo=Math.abs(j-i),n=Math.round(j+i-lo),o=[];
    for(let k=0;k<=n;k++)o.push(lo+k);return o;};
  const gcd=(a,b)=>b?gcd(b,a%b):a;
  function pretty(x){
    if(Math.abs(x)<1e-11)return "0";
    const s=x<0?"\u2212":"",x2=x*x;
    for(let Q=1;Q<=600;Q++){
      const Pf=x2*Q;
      if(Math.abs(Pf-Math.round(Pf))<1e-8*Math.max(1,Pf)){
        let P=Math.round(Pf);const g0=gcd(P,Q);let p=P/g0,q=Q/g0;
        let N=p*q,D=q,a=1;
        for(let f=Math.floor(Math.sqrt(N));f>=2;f--){if(N%(f*f)===0){a=f;N/=f*f;break;}}
        const g=gcd(a,D);a/=g;D/=g;
        const num=N===1?String(a):(a===1?"\u221A"+N:a+"\u221A"+N);
        return s+(D===1?num:num+"/"+D);
      }
    }
    return s+Math.abs(x).toFixed(6);
  }

  /** 由 Γ 反解约化偶极矩阵元 ⟨J′‖d‖J⟩，原子单位 (e·a₀)
   *  Jp 为激发态 J。注意 (2Jp+1) 因子 —— 这是 Edmonds 约定的来源。 */
  var ALPHA = 1 / 137.035999084, EH = 6.579683920502e15, CLIGHT = 2.99792458e8;
  function omAU(lamNm) { return (CLIGHT / (lamNm * 1e-9)) / EH; }
  function dFromGamma(gamma_Hz, lam_nm, Jp) {
    return Math.sqrt(gamma_Hz / EH * 3 * (2 * Jp + 1) /
                     (4 * Math.pow(ALPHA, 3) * Math.pow(omAU(lam_nm), 3)));
  }
  function gammaFromD(d_au, lam_nm, Jp) {
    return 4 / 3 * Math.pow(ALPHA, 3) * Math.pow(omAU(lam_nm), 3) * d_au * d_au /
           (2 * Jp + 1) * EH;
  }

  /** NIST 能级 [cm⁻¹] → 真空波长 [nm]。避免空气/真空波长混用 */
  function lamVacFromLevel(ek_cm) { return 1e7 / ek_cm; }

  root.YBW = {
    w3j: w3j, w6j: w6j,
    sixj: sixj, redHFS: redHFS, zee: zee,
    frange: frange, pretty: pretty,
    dFromGamma: dFromGamma, gammaFromD: gammaFromD,
    lamVacFromLevel: lamVacFromLevel,
    ALPHA: ALPHA, EH: EH
  };
})(typeof window !== 'undefined' ? window : globalThis);

if (typeof module !== 'undefined' && module.exports)
  module.exports = (typeof window !== 'undefined' ? window : globalThis).YBW;
