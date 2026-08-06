#!/usr/bin/env python3
"""tests/bench.py — 用 tests/vectors.json 校验 Python 实现

与 tests/bench.js 读同一份向量。两边必须同时通过。
这是防止网页 JS 与 notebook / .py 公式漂移的唯一机制。

用法: python3 tests/bench.py
"""
import json
import math
import sys
from pathlib import Path

# ---------- 物理常数：必须与 shared/constants.js 一致 ----------
HBAR = 1.054571817e-34
C = 2.99792458e8
EPS0 = 8.8541878128e-12
E_CHARGE = 1.602176634e-19
A0 = 5.29177210903e-11
EA0 = E_CHARGE * A0

GAMMA_556 = 183e3          # Hz
D_HF = +5.936e9            # Hz, F'=3/2 在上
D_E = 2.65e6               # Hz

CG = {
    "F32": {"stretched": 1.0, "pi": math.sqrt(2 / 3), "sigma": math.sqrt(1 / 3)},
    "F12": {"stretched": None, "pi": math.sqrt(1 / 3), "sigma": math.sqrt(2 / 3)},
}

D2R = math.pi / 180


# ---------- 公式：与 shared/physics.js 一一对应 ----------
def d_cyc_from_linewidth(gamma_hz, lambda_m):
    g = 2 * math.pi * gamma_hz
    w0 = 2 * math.pi * C / lambda_m
    return math.sqrt(3 * math.pi * EPS0 * HBAR * C**3 * g / w0**3)


def intensity(p_w, wx, wy):
    return 2 * p_w / (math.pi * wx * wy)


def efield(i_wm2):
    return math.sqrt(2 * i_wm2 / (C * EPS0))


def ccoef(d_si):
    return d_si / (math.pi * HBAR * math.sqrt(math.pi * C * EPS0))


def rabi_hz(d_si, p_w, wx, wy):
    wg = math.sqrt(wx * wy)
    return ccoef(d_si) * math.sqrt(max(p_w, 0)) / wg if wg > 0 else 0.0


def power_w(d_si, f_hz, wx, wy):
    cc = ccoef(d_si)
    if cc <= 0:
        return 0.0
    s = f_hz * math.sqrt(wx * wy) / cc
    return s * s


def hf_factor(d_hz):
    return D_HF / (d_hz + D_HF)


def geom_factor(s3, theta_kb_rad):
    return abs(s3) * math.sin(theta_kb_rad)


def qwp(u_rad):
    c, s = math.cos(u_rad), math.sin(u_rad)
    ez = (c * c, s * s)
    ep = (s * c, -s * c)
    mz = math.hypot(*ez)
    mp = math.hypot(*ep)
    return 2 * (ep[1] * ez[0] - ep[0] * ez[1]) / (mz * mz + mp * mp)


def raman_omega(d_si, p_w, wx, wy, d_hz, geom):
    dr = 2 * math.pi * d_hz
    if dr == 0:
        return 0.0
    return ((2 / 9) * geom * hf_factor(d_hz) * d_si**2 * p_w
            / (math.pi * C * EPS0 * HBAR**2 * wx * wy * dr))


def raman_legs(d_si, e0, alpha_rad):
    return (math.sqrt(2) / 3 * d_si * e0 * math.cos(alpha_rad) / HBAR,
            (1 / 3) * d_si * e0 * math.sin(alpha_rad) / math.sqrt(2) / HBAR)


def light_shift(om_pi, om_sigma, d_hz):
    dr = 2 * math.pi * d_hz
    if dr == 0:
        return 0.0
    return (2 * math.pi * D_E) / (4 * dr * dr) * (8 * om_sigma**2 + om_pi**2)


def scatter_error(d_hz):
    if d_hz == 0 or d_hz + D_HF == 0:
        return float("inf")
    return (math.pi / 2) * (GAMMA_556 / (math.sqrt(6) * abs(d_hz))) * abs(D_HF / (d_hz + D_HF))


# ---------- Wigner 3j / 6j：与 shared/wigner.js 同一 Racah 公式 ----------
# 不依赖 sympy，使 CI 与本地运行无额外依赖；正确性由向量校验。
_LF = [0.0]
for _i in range(1, 601):
    _LF.append(_LF[-1] + math.log(_i))


def _lf(n):
    k = round(n)
    return _LF[k] if 0 <= k < len(_LF) else float("nan")


def _isint(x):
    return abs(x - round(x)) < 1e-9


def _tri(a, b, c):
    return a + b >= c - 1e-9 and b + c >= a - 1e-9 and c + a >= b - 1e-9


def _sgn(n):
    return -1 if (round(n) % 2 + 2) % 2 else 1


def w3j(j1, j2, j3, m1, m2, m3):
    if not _isint(j1 + j2 + j3) or abs(m1 + m2 + m3) > 1e-9:
        return 0.0
    if abs(m1) > j1 + 1e-9 or abs(m2) > j2 + 1e-9 or abs(m3) > j3 + 1e-9:
        return 0.0
    if not (_isint(j1 - m1) and _isint(j2 - m2) and _isint(j3 - m3)) or not _tri(j1, j2, j3):
        return 0.0
    pre = 0.5 * (_lf(j1 + j2 - j3) + _lf(j1 - j2 + j3) + _lf(-j1 + j2 + j3)
                 - _lf(j1 + j2 + j3 + 1) + _lf(j1 + m1) + _lf(j1 - m1)
                 + _lf(j2 + m2) + _lf(j2 - m2) + _lf(j3 + m3) + _lf(j3 - m3))
    k0 = round(max(0, j2 - j3 - m1, j1 - j3 + m2))
    k1 = round(min(j1 + j2 - j3, j1 - m1, j2 + m2))
    s = 0.0
    for k in range(k0, k1 + 1):
        s += _sgn(k) * math.exp(pre - (_lf(k) + _lf(j1 + j2 - j3 - k) + _lf(j1 - m1 - k)
                                       + _lf(j2 + m2 - k) + _lf(j3 - j2 + m1 + k)
                                       + _lf(j3 - j1 - m2 + k)))
    return _sgn(j1 - j2 - m3) * s


def _dlt(a, b, c):
    return _lf(a + b - c) + _lf(a - b + c) + _lf(-a + b + c) - _lf(a + b + c + 1)


def w6j(a, b, c, d, e, f):
    if not (_tri(a, b, c) and _tri(a, e, f) and _tri(d, b, f) and _tri(d, e, c)):
        return 0.0
    if not (_isint(a + b + c) and _isint(a + e + f) and _isint(d + b + f) and _isint(d + e + c)):
        return 0.0
    pre = 0.5 * (_dlt(a, b, c) + _dlt(a, e, f) + _dlt(d, b, f) + _dlt(d, e, c))
    z0 = round(max(a + b + c, a + e + f, d + b + f, d + e + c))
    z1 = round(min(a + b + d + e, b + c + e + f, a + c + d + f))
    s = 0.0
    for z in range(z0, z1 + 1):
        s += _sgn(z) * math.exp(pre + _lf(z + 1) - (_lf(z - a - b - c) + _lf(z - a - e - f)
                                                    + _lf(z - d - b - f) + _lf(z - d - e - c)
                                                    + _lf(a + b + d + e - z)
                                                    + _lf(b + c + e + f - z)
                                                    + _lf(a + c + d + f - z)))
    return s


def red_hfs(I, J, Jp, F, Fp):
    return _sgn(Jp + I + F + 1) * math.sqrt((2 * F + 1) * (2 * Fp + 1)) * w6j(Jp, Fp, I, F, J, 1)


def zee(I, J, Jp, F, m, Fp, mp, q):
    return _sgn(Fp - mp) * w3j(Fp, 1, F, -mp, q, m) * red_hfs(I, J, Jp, F, Fp)


ALPHA_FS = 1 / 137.035999084
E_HARTREE = 6.579683920502e15


def lam_vac_from_level(ek_cm):
    """NIST 能级 [cm^-1] → 真空波长 [nm]"""
    return 1e7 / ek_cm


def om_au(lam_nm):
    return (C / (lam_nm * 1e-9)) / E_HARTREE


def d_from_gamma(gamma_hz, lam_nm, jp):
    """Edmonds 约定的约化矩阵元 ⟨J'||d||J⟩，原子单位。注意 (2Jp+1) 因子"""
    return math.sqrt(gamma_hz / E_HARTREE * 3 * (2 * jp + 1)
                     / (4 * ALPHA_FS**3 * om_au(lam_nm)**3))


# ---------- 向量分发 ----------
IMPL = {
    "dCycFromLinewidth": lambda a: {
        "d_ea0": d_cyc_from_linewidth(a["Gamma_Hz"], a["lambda_m"]) / EA0},
    "identity": lambda a: {"value": a["value"]},
    "rabiHz": lambda a: {"fR_Hz": rabi_hz(a["d_ea0"] * EA0, a["P_W"], a["wx_m"], a["wy_m"])},
    "intensity": lambda a: {"I_Wm2": intensity(a["P_W"], a["wx_m"], a["wy_m"])},
    "efieldFromPower": lambda a: {"E_Vm": efield(intensity(a["P_W"], a["wx_m"], a["wy_m"]))},
    "powerW": lambda a: {"P_W": power_w(a["d_ea0"] * EA0, a["fR_Hz"], a["wx_m"], a["wy_m"])},
    "hfFactor": lambda a: {"factor": hf_factor(a["D_Hz"])},
    "cg": lambda a: {"value": CG[a["branch"]][a["leg"]]},
    "cg_ratio": lambda a: {"value": CG[a["branch"]]["pi"] / CG[a["branch"]]["sigma"]},
    "geomFactor": lambda a: {"value": geom_factor(a["S3"], a["theta_kB_deg"] * D2R)},
    "qwp_S3": lambda a: {"S3": qwp(a["u_deg"] * D2R)},
    "scatterError": lambda a: {"value": scatter_error(a["D_Hz"])},
}


def _roundtrip(a):
    d = a["d_ea0"] * EA0
    f = rabi_hz(d, a["P_W"], a["wx_m"], a["wy_m"])
    return {"P_W": power_w(d, f, a["wx_m"], a["wy_m"])}


def _separable(a):
    d = a["d_ea0"] * EA0
    chain = d * efield(intensity(a["P_W"], a["wx_m"], a["wy_m"])) / HBAR / (2 * math.pi)
    sep = rabi_hz(d, a["P_W"], a["wx_m"], a["wy_m"])
    return {"rel_diff": abs(chain - sep) / chain}


def _raman(a):
    g = geom_factor(a["S3"], a["theta_kB_deg"] * D2R)
    om = raman_omega(a["d_ea0"] * EA0, a["P_W"], a["wx_m"], a["wy_m"], a["D_Hz"], g)
    return {"Omega_2pi_Hz": abs(om) / (2 * math.pi)}


def _ls(a):
    d = a["d_ea0"] * EA0
    e0 = efield(intensity(a["P_W"], a["wx_m"], a["wy_m"]))
    op, og = raman_legs(d, e0, a["alpha_deg"] * D2R)
    return {"shift_Hz": light_shift(op, og, a["D_Hz"]) / (2 * math.pi)}


IMPL.update({"roundtrip": _roundtrip, "separable_vs_chain": _separable,
             "ramanOmega": _raman, "lightShift_workpoint": _ls})


def _sumrule(a):
    s = 0.0
    for m in (0.5, -0.5):
        for q in (-1, 0, 1):
            v = zee(a["I"], a["J"], a["Jp"], 0.5, m, a["Fp"], a["mp"], q)
            s += v * v
    return {"value": s * 3}


def _dipole_crosscheck(a):
    d_ed = d_from_gamma(a["gamma_Hz"], a["lam_nm"], 1)
    d_cyc = d_cyc_from_linewidth(a["gamma_Hz"], a["lam_nm"] * 1e-9) / EA0
    return {"ratio": d_ed / (math.sqrt(3) * d_cyc)}


def _steck_cross(a):
    case = a["case"]
    if case == "d_cg":
        d_ed = d_from_gamma(a["gamma_Hz"], a["lam_nm"], a["Jp"])
        return {"value": d_ed / math.sqrt(2 * a["Jg"] + 1)}
    if case == "cyc":
        d_ed = d_from_gamma(a["gamma_Hz"], a["lam_nm"], a["Jp"])
        return {"value": zee(a["I"], a["Jg"], a["Jp"], a["F"], a["F"],
                             a["Fp"], a["Fp"], 1) * d_ed}
    if case == "air_lam":
        k = 1000.0 / a["lam_nm"]
        k2 = k * k
        t = 8342.13 + 2406030.0 / (130 - k2) + 15997.0 / (38.9 - k2)
        n = 1 + t * (0.00138823 * 760 / (1 + 0.003671 * 22)) * 1e-8
        return {"value": a["lam_nm"] / n}
    raise ValueError(f"未知 steck_cross case: {case}")


IMPL.update({
    "dcyc_valid": lambda a: {"ok": 1 if a["Jg"] == 0 else 0},
    "w3j": lambda a: {"value": w3j(a["j"][0], a["j"][1], a["j"][2],
                                   a["m"][0], a["m"][1], a["m"][2])},
    "w6j": lambda a: {"value": w6j(*a["a"])},
    "cg_computed": lambda a: {"value": zee(0.5, 0, 1, 0.5, 0.5, a["Fp"], a["mp"], a["q"])
                                       * math.sqrt(3)},
    "sumrule": _sumrule,
    "lamVac": lambda a: {"lam_nm": lam_vac_from_level(a["ek_cm"])},
    "dFromGamma": lambda a: {"d_au": d_from_gamma(a["gamma_Hz"], a["lam_nm"], a["Jp"])},
    "dipole_crosscheck": _dipole_crosscheck,
    "steck_cross": _steck_cross,
})


def fmt(v):
    if v == 0:
        return "0"
    a = abs(v)
    return f"{v:.6e}" if (a >= 1e5 or a < 1e-3) else f"{v:.8g}"


def validate_transitions(db=None):
    """全库校验 data/transitions.json（任务 2：独立页不再内联 DB，统一走这一份）。

    1. 每个跃迁要么有 lam（真空 nm，直接用），要么有 ek（cm⁻¹，由 1e7/ek 导出真空波长）；
       若两者都有，导出值必须与 lam 一致（防止混用空气/真空波长）。
    2. dFromGamma 结果必须为有限正数（任何一条为 NaN/负都意味着数据损坏）。

    db 参数：可直接传入数据对象（用于"坏数据能否被捕获"的反向验证，传内存中的
    copy.deepcopy 构造的坏数据，**不要**改写磁盘上的真文件 —— 见 CHANGELOG 教训）。
    缺省时从 data/transitions.json 读取。
    """
    if db is None:
        root = Path(__file__).parent.parent
        db = json.loads((root / "data" / "transitions.json").read_text(encoding="utf-8"))
    errors = []
    ntr = 0
    for e in db["elements"]:
        for t in e["tr"]:
            ntr += 1
            has_lam = "lam" in t
            has_ek = "ek" in t
            if not has_lam and not has_ek:
                errors.append(f"{e['el']} {t['n']}: 既无 lam 也无 ek")
                continue
            lam = t["lam"] if has_lam else 1e7 / t["ek"]
            if has_lam and has_ek:
                derived = 1e7 / t["ek"]
                if abs(derived - t["lam"]) / t["lam"] > 1e-4:
                    errors.append(f"{e['el']} {t['n']}: lam={t['lam']} 与 ek 导出 {derived:.6f} 不一致")
            # d 由 Γ 反解（README 规则 ⓪），必须有限且为正。
            # d_from_gamma 对非法 Γ（如负值）可能抛异常，这里兜住，干净地报错而非堆栈。
            try:
                d = d_from_gamma(t["gam"], lam, t["Jp"])
                bad_d = not (math.isfinite(d) and d > 0)
            except Exception as exc:  # noqa: BLE001
                errors.append(f"{e['el']} {t['n']}: dFromGamma 计算失败 ({exc})")
                continue
            if bad_d:
                errors.append(f"{e['el']} {t['n']}: dFromGamma 非有限正数 ({d})")
    if errors:
        print(f"  ✗  data/transitions.json 全库校验失败，{len(errors)} 处：")
        for er in errors[:20]:
            print(f"       · {er}")
        return False, ntr
    print(f"  ✓  data/transitions.json 全库校验通过：{ntr} 条跃迁，lam/ek 一致且 d 有限为正")
    return True, ntr


def main():
    vectors = json.loads((Path(__file__).parent / "vectors.json").read_text(encoding="utf-8"))
    npass = nfail = 0
    failures = []
    for group, tests in vectors.items():
        if group.startswith("_"):
            continue
        print(f"\n── {group} ──")
        for t in tests:
            impl = IMPL.get(t["fn"])
            if impl is None:
                print(f"  ?? {t['name']}  (未实现 {t['fn']})")
                nfail += 1
                failures.append(f"{t['name']}: 未实现 {t['fn']}")
                continue
            try:
                got = impl(t["args"])
            except Exception as exc:  # noqa: BLE001
                print(f"  ✗  {t['name']}  抛出 {exc}")
                nfail += 1
                failures.append(f"{t['name']}: {exc}")
                continue
            ok = True
            detail = []
            for key, exp in t["expect"].items():
                act = got[key]
                if "atol" in t:
                    good = abs(act - exp) <= t["atol"]
                else:
                    good = abs(act - exp) <= abs(exp) * t.get("rtol", 1e-6)
                ok = ok and good
                rel = (act - exp) / abs(exp) if exp else act - exp
                detail.append(f"{key}: {fmt(act)} (期望 {fmt(exp)}, 偏差 {rel * 100:.4f}%)")
            if ok:
                npass += 1
                print(f"  ✓  {t['name']}")
            else:
                nfail += 1
                print(f"  ✗  {t['name']}")
                for d in detail:
                    print(f"       {d}")
                if t.get("src"):
                    print(f"       出处: {t['src']}")
                failures.append(t["name"])

    print("\n" + "=" * 50)
    print(f"通过 {npass} / {npass + nfail}")
    if nfail:
        print("失败项:")
        for f in failures:
            print("  · " + f)
        sys.exit(1)
    print("全部通过")

    # 全库数据库校验（独立于 vectors，单独报告）
    print("\n── transitions.json ──")
    ok_db, _ = validate_transitions()
    if not ok_db:
        sys.exit(1)


if __name__ == "__main__":
    main()
