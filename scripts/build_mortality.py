#!/usr/bin/env python3
"""年齢別死亡確率 qx（0〜105歳）を 1930〜2070年の毎年について作る。

入力: data/raw/（scripts/fetch_population_raw.py で取得）
出力: data/stats/mortality.json, data/stats/mortality_variants.json,
      data/stats/README_mortality.md（平均寿命の照合表）

方法の要点（詳しくは README_mortality.md と meta.method）:
  1. 各歳の死亡率が機械で読める公式の生命表をそのまま使う
       - 第5回完全生命表（1926〜30年、e-Stat の PDF の文字情報）
       - 第18〜22回完全生命表（1995・2000・2005・2010・2015年）
       - 簡易生命表（1996〜2019年の毎年）
       - 社人研 令和5年推計の将来生命表（2020〜2070年）
  2. 各歳の表が画像でしか公開されていない完全生命表（第6回 1935-36年、第8回 1947年、
     第9回 1950-52年、第11回 1960年、第12回 1965年、第13回 1970年、第15回 1980年、
     第17回 1990年）は、社人研『人口統計資料集』に載っている「5歳ごとの平均余命 e0,e5,...,e100」と
     性別の乳児死亡率に合うように、各歳の形（1926-30年表と1995年表の logit 補間）を
     年齢区間ごとに調整して復元する。
  3. 1947〜1994年のそれ以外の年は、前後の基準年の logit(qx) を直線補間し、
     毎年の簡易生命表の平均余命（0・20・40・65・75歳）と乳児死亡率に合わせて年齢帯ごとに微調整する。
  4. 1930〜1943年は基準年（1928年=第5回の中央、1935.5年=第6回、1947年=第8回）の補間を
     毎年の乳児死亡率に合わせる。1944〜1946年は1943年と1947年の補間（戦争の死亡は入れない）。
"""
import json
import math
import os
import re
import subprocess

import numpy as np
import pandas as pd

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "data", "raw")
OUT = os.path.join(ROOT, "data", "stats")
AGES = np.arange(106)
SEXES = ("male", "female")


# ----------------------------------------------------------------------------
# 生命表の計算
# ----------------------------------------------------------------------------
def a0(q0, sex):
    """0歳の平均生存年数（Coale-Demeny）。"""
    if sex == "male":
        return 0.045 + 2.684 * q0 if q0 < 0.107 else 0.330
    return 0.053 + 2.800 * q0 if q0 < 0.107 else 0.350


def life_table(q, sex):
    """q[0..105]（q[105]=1）から lx と ex を返す。"""
    q = np.clip(np.asarray(q, float), 1e-7, 1.0)
    q[-1] = 1.0
    l = np.ones(106)
    for x in range(1, 106):
        l[x] = l[x - 1] * (1 - q[x - 1])
    d = l * q
    L = l - d + 0.5 * d
    L[0] = l[0] - d[0] + a0(q[0], sex) * d[0]
    # 105歳以上: 104歳の死力を少し上げた値で一定とみなす
    mu = -math.log(max(1 - q[104], 1e-6)) * 1.05
    L[105] = l[105] / max(mu, 0.3)
    T = np.cumsum(L[::-1])[::-1]
    e = T / np.maximum(l, 1e-300)
    return l, e


def logit(q):
    q = np.clip(q, 1e-7, 1 - 1e-7)
    return np.log(q / (1 - q))


def expit(z):
    return 1 / (1 + np.exp(-z))


def extend_to_105(qdict):
    """{age: q}（最後の年齢は開放区間のことがある）から 0..105 の配列を作る。
    105歳まで載っていない年齢は、85歳以上の logit(qx) を年齢の一次式で延ばす。"""
    ages = sorted(qdict)
    maxa = ages[-1]
    q = np.full(106, np.nan)
    for a in ages:
        if a <= 105:
            q[a] = qdict[a]
    # 最後の年齢が開放区間（q=1 か空）なら使わない
    last_good = maxa
    while last_good in qdict and (qdict[last_good] is None or qdict[last_good] >= 0.999):
        last_good -= 1
    last_good = min(last_good, 104)
    if last_good < 104:
        lo = max(80, last_good - 15)
        xs = np.arange(lo, last_good + 1)
        ys = logit(q[xs])
        b, c = np.polyfit(xs, ys, 1)
        for a in range(last_good + 1, 105):
            q[a] = expit(b * a + c)
    q[105] = 1.0
    assert not np.isnan(q).any(), qdict
    return q


# ----------------------------------------------------------------------------
# 公式の各歳の生命表を読む
# ----------------------------------------------------------------------------
def _age_of(v):
    if v is None or (isinstance(v, float) and math.isnan(v)):
        return None, ""
    if isinstance(v, (int, np.integer)) or (isinstance(v, float) and float(v).is_integer()):
        return int(v), ""
    s = str(v).replace("　", "").strip()
    m = re.match(r"^(\d+)\s*(.*)$", s)
    if not m:
        return None, s
    return int(m.group(1)), m.group(2)


def read_xls_life(path, sheet=0):
    """e-Stat の生命表 Excel から、各歳（年単位）の nqx を {age: q} で返す。"""
    df = pd.read_excel(path, sheet_name=sheet, header=None)
    vals = df.values
    hdr = None
    for i in range(min(15, len(vals))):
        row = [str(v).strip() if v is not None else "" for v in vals[i]]
        if "nqx" in row:
            hdr = i
            break
    if hdr is None:
        raise ValueError(f"nqx header not found: {path}")
    row = [str(v).strip() for v in vals[hdr]]
    qcols = [j for j, v in enumerate(row) if v == "nqx"]
    xcols = [j for j, v in enumerate(row) if v == "x"]
    out = {}
    for qc in qcols:
        xc = max(c for c in xcols if c < qc)
        seq = []
        for i in range(hdr + 1, len(vals)):
            age, unit = _age_of(vals[i][xc])
            # 単位が隣の列にある表もある
            nxt = vals[i][xc + 1] if xc + 1 < vals.shape[1] else None
            unit2 = "" if nxt is None or (isinstance(nxt, float) and math.isnan(nxt)) else str(nxt)
            qv = vals[i][qc]
            if age is None:
                continue
            try:
                qv = float(qv)
            except (TypeError, ValueError):
                qv = None
            if qv is not None and math.isnan(qv):
                qv = None
            seq.append((age, unit + unit2, qv))
        # 年単位の区間: age 0 から 1,2,3,... と10歳以上続く部分、または 0 を含まない続きのブロック
        start = None
        for k in range(len(seq)):
            if seq[k][0] == 0 and all(k + j < len(seq) and seq[k + j][0] == j for j in range(1, 11)):
                start = k
        if start is None:
            # 右側のブロック（55歳以上など）
            ages = [s[0] for s in seq]
            if ages and all(ages[j + 1] == ages[j] + 1 for j in range(len(ages) - 1)) and ages[0] > 10:
                for a, _, qv in seq:
                    out.setdefault(a, qv)
            continue
        prev = -1
        for a, _, qv in seq[start:]:
            if a != prev + 1:
                break
            out.setdefault(a, qv)
            prev = a
    ages = sorted(out)
    assert ages[0] == 0 and ages == list(range(ages[0], ages[-1] + 1)), (path, ages[:5], ages[-5:])
    return out


def read_pdf_life_5th():
    """第5回完全生命表（1926〜30年）を e-Stat の PDF の文字情報から読む。"""
    txt_path = os.path.join(RAW, "estat", "life_1to17.txt")
    if not os.path.exists(txt_path):
        subprocess.run(["pdftotext", "-layout", os.path.join(RAW, "estat", "life_1to17.pdf"), txt_path],
                       check=True, stderr=subprocess.DEVNULL)
    pages = open(txt_path, encoding="utf-8").read().split("\f")
    res = {}
    for sex, (p1, p2) in {"male": (11, 12), "female": (13, 14)}.items():
        assert "第５回" in pages[p1], "page layout changed"
        q = {}
        started = False
        for p in (p1, p2):
            for line in pages[p].splitlines():
                s = line.strip()
                if not started:
                    if s.startswith("0年"):
                        started = True
                        s = "0 " + s[2:]
                    else:
                        continue
                s = s.replace("(y)", "")
                m = re.match(r"^(\d+)\s+(\d+)\s+(\d+)\s+([\d.]+)\s+([\d.]+)", s)
                if m:
                    q[int(m.group(1))] = float(m.group(5))
        assert sorted(q)[:3] == [0, 1, 2] and len(q) > 95, (sex, len(q))
        res[sex] = q
    return res


def read_ipss_future(fname):
    """社人研 将来生命表（ATable7 など）: {year: {sex: q[0..105]}}"""
    import openpyxl
    wb = openpyxl.load_workbook(os.path.join(RAW, "ipss", fname), read_only=True, data_only=True)
    res = {}
    for ws in wb.worksheets:
        m = re.match(r"AT7[BC]?\((\d+)\)([MF])", ws.title)
        if not m:
            continue
        rows = list(ws.iter_rows(values_only=True))
        year = None
        for r in rows[:4]:
            if r[0] and re.search(r"\((\d{4})\)年", str(r[0])):
                year = int(re.search(r"\((\d{4})\)年", str(r[0])).group(1))
        assert year, ws.title
        q = {}
        for r in rows:
            for off in (0, 6):
                if len(r) > off + 1 and isinstance(r[off + 1], (int, float)):
                    a = r[off]
                    if isinstance(a, str) and a.strip() == "105+":
                        a = 105
                    if isinstance(a, (int, float)):
                        q[int(a)] = float(r[off + 1])
        sex = "male" if m.group(2) == "M" else "female"
        assert sorted(q) == list(range(106)), (ws.title, len(q))
        arr = np.array([q[a] for a in range(106)])
        arr[105] = 1.0
        res.setdefault(year, {})[sex] = arr
    return res


# ----------------------------------------------------------------------------
# 公表されている要約値（照合・調整の目標）
# ----------------------------------------------------------------------------
def read_ex5():
    """5歳ごとの平均余命（完全生命表）: {(key): {sex: {age: ex}}}"""
    out = {}

    def parse(path, wanted):
        df = pd.read_excel(path, header=None)
        v = df.values
        hdr_i = next(i for i in range(6) if str(v[i][0]).strip() == "年齢")
        cols = {}
        for j in range(1, v.shape[1]):
            h = str(v[hdr_i][j]) + str(v[hdr_i + 1][j] if hdr_i + 1 < len(v) else "")
            h = h.replace("nan", "").replace(" ", "")
            m = re.match(r"(\d{4})", h)
            if not m:
                continue
            key = h.split("年")[0] if "～" not in h else h.replace("年", "")
            cols[j] = key
        sex = None
        for i in range(hdr_i + 1, len(v)):
            c1 = str(v[i][1]).strip()
            if c1 == "男":
                sex = "male"
                continue
            if c1 == "女":
                sex = "female"
                continue
            if sex and isinstance(v[i][0], (int, float)) and not (isinstance(v[i][0], float) and math.isnan(v[i][0])):
                age = int(v[i][0])
                for j, key in cols.items():
                    if key in wanted and isinstance(v[i][j], (int, float)) and not math.isnan(float(v[i][j])):
                        out.setdefault(wanted[key], {}).setdefault(sex, {})[age] = float(v[i][j])

    parse(os.path.join(RAW, "ipss_popular", "old", "P2008_T05-14.xls"),
          {"1935～36": 1935.5, "1947": 1947, "1950～52": 1951, "1960": 1960, "1970": 1970,
           "1980": 1980, "1990": 1990, "2000": 2000, "2005": 2005})
    parse(os.path.join(RAW, "ipss_popular", "old", "P2025_T05-13.xlsx"), {"1965": 1965, "2010": 2010})
    return out


def read_annual_ex():
    """厚労省 令和6年簡易生命表 参考資料2（1947〜2024年）: {year: {sex: {age: ex}}}。
    完全生命表の年（*印）は完全生命表の値。"""
    import pdfplumber
    with pdfplumber.open(os.path.join(RAW, "mhlw", "life24-09.pdf")) as pdf:
        text = "\n".join(p.extract_text() for p in pdf.pages)
    ages = [0, 20, 40, 65, 75, 90]
    out = {}
    prev = None
    for line in text.splitlines():
        toks = line.split()
        if len(toks) < 14:
            continue
        t0 = toks[0].replace("*", "").replace("年", "")
        if "-" in t0:
            continue  # 1950-1952 の完全生命表は基準年として別に扱う
        if not re.fullmatch(r"\d+", t0):
            continue
        y = int(t0)
        if y < 100:
            y = (prev // 100) * 100 + y
            if prev and y < prev:
                y += 100
        prev = y
        nums = toks[-12:]
        rec = {}
        for k, sex in enumerate(SEXES):
            rec[sex] = {}
            for j, a in enumerate(ages):
                s = nums[k * 6 + j]
                if s not in ("…", "..."):
                    rec[sex][a] = float(s)
        out[y] = rec
    assert 1947 in out and 2024 in out and len(out) >= 77, sorted(out)[:5]
    return out


def read_imr():
    """性別の乳児死亡率（出生千対）= 性別乳児死亡数 / 性別出生数。{year: {sex: rate}}"""
    t2 = pd.read_excel(os.path.join(RAW, "ipss_popular", "T05-02.xlsx"), sheet_name="T05-02★", header=None).values
    t1 = pd.read_excel(os.path.join(RAW, "ipss_popular", "T04-01.xlsx"), sheet_name="T04-01★", header=None).values
    births = {}
    for r in t1:
        for off in (0, 5):
            if isinstance(r[off], (int, float)) and not math.isnan(float(r[off])) and 1800 < r[off] < 2100:
                births[int(r[off])] = (float(r[off + 2]), float(r[off + 3]))
    out = {}
    for r in t2:
        if isinstance(r[0], (int, float)) and not math.isnan(float(r[0])) and 1800 < r[0] < 2100:
            y = int(r[0])
            if y in births:
                out[y] = {"male": 1000 * float(r[3]) / births[y][0], "female": 1000 * float(r[4]) / births[y][1]}
    return out


# ----------------------------------------------------------------------------
# 復元と調整
# ----------------------------------------------------------------------------
def pl_offset(knots, vals):
    """1..105歳に、節点 knots での値 vals を直線でつないだずれを返す（0歳は別）。"""
    off = np.zeros(106)
    off[1:] = np.interp(AGES[1:], knots, vals)
    return off


def solve_lm(fun, p0, n_iter=60, ridge=None):
    """簡易 Levenberg-Marquardt。fun(p) は残差ベクトル。"""
    p = np.array(p0, float)
    lam = 1e-2
    r = fun(p)
    for _ in range(n_iter):
        J = np.zeros((len(r), len(p)))
        for k in range(len(p)):
            dp = np.zeros_like(p)
            dp[k] = 1e-4
            J[:, k] = (fun(p + dp) - r) / 1e-4
        A = J.T @ J
        g = J.T @ r
        if ridge is not None:
            A = A + ridge.T @ ridge
            g = g + ridge.T @ (ridge @ p)
        while True:
            step = np.linalg.solve(A + lam * np.diag(np.diag(A) + 1e-9), -g)
            pn = p + step
            rn = fun(pn)
            cost_new = rn @ rn + (0 if ridge is None else (ridge @ pn) @ (ridge @ pn))
            cost_old = r @ r + (0 if ridge is None else (ridge @ p) @ (ridge @ p))
            if cost_new < cost_old:
                p, r = pn, rn
                lam = max(lam / 3, 1e-7)
                break
            lam *= 4
            if lam > 1e8:
                return p
        if np.max(np.abs(step)) < 1e-7:
            break
    return p


KN_FULL = [1, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100, 105]


def fit_full(std, sex, ex_targets, q0_target):
    """5歳ごとの平均余命と q0 に合うように、標準の形 std を調整する。"""
    zs = logit(std)
    ages_t = sorted(a for a in ex_targets if a <= 100)
    w = {a: (1.0 if a < 85 else 0.3 if a < 95 else 0.1) for a in ages_t}

    def make(p):
        z = zs + pl_offset(KN_FULL, p[1:])
        z[0] = zs[0] + p[0]
        q = expit(z)
        q[105] = 1.0
        return q

    def fun(p):
        q = make(p)
        _, e = life_table(q, sex)
        res = [w[a] * (e[a] - ex_targets[a]) for a in ages_t]
        res.append(3.0 * (logit(q[0]) - logit(q0_target)))
        return np.array(res)

    n = len(KN_FULL) + 1
    # 隣り合う節点のずれの2階差分に弱い罰則（形がギザギザにならないように）
    D = np.zeros((n - 3, n))
    for k in range(n - 3):
        D[k, k + 1:k + 4] = [1, -2, 1]
    p = solve_lm(fun, np.zeros(n), ridge=0.05 * D)
    return make(p), fun(p)


KN_BAND = [1, 20, 40, 65, 75, 105]


def calibrate(base, sex, ex_targets, q0_target):
    """補間した表を、手に入る平均余命（0,20,40,65,75歳）と q0 に合わせて年齢帯ごとに調整する。"""
    zs = logit(base)
    have = [a for a in (0, 20, 40, 65, 75) if a in ex_targets]

    # 目標の数に合わせて節点を決める（目標のない帯は隣とまとめる）
    def knots_vals(p):
        # p = [p0, c(1), c(20), c(40), c(65), c(75)] のうち使うもの
        vals = {}
        it = iter(p[1:])
        for a in (1, 20, 40, 65, 75):
            key = 0 if a == 1 else a
            if key in have:
                vals[a] = next(it)
        ks = sorted(vals)
        v = [vals[k] for k in ks]
        ks2 = ks + [105]
        v2 = v + [v[-1]]
        if ks2[0] != 1:
            ks2 = [1] + ks2
            v2 = [v2[0]] + v2
        return ks2, v2

    def make(p):
        ks, vs = knots_vals(p)
        z = zs + pl_offset(ks, vs)
        z[0] = zs[0] + p[0]
        q = expit(z)
        q[105] = 1.0
        return q

    def fun(p):
        q = make(p)
        _, e = life_table(q, sex)
        res = [e[a] - ex_targets[a] for a in have]
        res.append(3.0 * (logit(q[0]) - logit(q0_target)))
        return np.array(res)

    p = solve_lm(fun, np.zeros(1 + len(have)))
    return make(p)


def q0_from_imr(imr_rate, ratio):
    return min(0.5, imr_rate / 1000.0 * ratio)


# ----------------------------------------------------------------------------
def main():
    os.makedirs(OUT, exist_ok=True)
    ex5 = read_ex5()
    ann = read_annual_ex()
    imr = read_imr()

    # --- 公式の各歳の表
    official = {}   # year -> sex -> q[0..105]
    source_of = {}
    t5 = read_pdf_life_5th()
    official[1928] = {s: extend_to_105(t5[s]) for s in SEXES}
    source_of[1928] = "第5回完全生命表（1926〜30年）"
    est = os.path.join(RAW, "estat")
    life_files = {
        1995: (os.path.join(est, "life18.xls"), 0, os.path.join(est, "life18.xls"), 1, "第18回完全生命表"),
        2000: (os.path.join(est, "life19_m.xls"), 0, os.path.join(est, "life19_f.xls"), 0, "第19回完全生命表"),
        2005: (os.path.join(est, "life20_m.xls"), 0, os.path.join(est, "life20_f.xls"), 0, "第20回完全生命表"),
        2010: (os.path.join(est, "life21_m.xls"), 0, os.path.join(est, "life21_f.xls"), 0, "第21回完全生命表"),
        2015: (os.path.join(est, "life22_m.xls"), 0, os.path.join(est, "life22_f.xls"), 0, "第22回完全生命表"),
    }
    for y, (fm, sm, ff, sf, name) in life_files.items():
        official[y] = {"male": extend_to_105(read_xls_life(fm, sm)),
                       "female": extend_to_105(read_xls_life(ff, sf))}
        source_of[y] = name
    for y in range(1996, 2020):
        if y in official:
            continue
        official[y] = {s: extend_to_105(read_xls_life(os.path.join(est, "abridged", f"{y}_{s[0]}.xls")))
                       for s in SEXES}
        source_of[y] = f"簡易生命表（{y}年）"
    future = read_ipss_future("ATable7.xlsx")

    # --- 生命表の q0 と乳児死亡率の比（基準年で求め、間は補間）
    def imr_avg(y0, y1, sex):
        vals = [imr[y][sex] for y in range(y0, y1 + 1) if y in imr]
        return sum(vals) / len(vals)

    ratio_pts = {s: {} for s in SEXES}
    for s in SEXES:
        ratio_pts[s][1928] = official[1928][s][0] * 1000 / imr_avg(1926, 1930, s)
        for y in (1995, 2000, 2005):
            ratio_pts[s][y] = official[y][s][0] * 1000 / imr[y][s]

    def ratio(y, s):
        ks = sorted(ratio_pts[s])
        return float(np.interp(y, ks, [ratio_pts[s][k] for k in ks]))

    # --- 画像しかない完全生命表を、5歳ごとの平均余命から復元
    base = {1928: official[1928], 1995: official[1995]}
    fit_report = {}

    def std_shape(y, s):
        w = (y - 1928) / (1995 - 1928)
        w = min(max(w, 0), 1)
        return expit((1 - w) * logit(official[1928][s]) + w * logit(official[1995][s]))

    base_spans = {1935.5: (1935, 1936), 1947: (1947, 1947), 1951: (1950, 1952), 1960: (1960, 1960),
                  1965: (1965, 1965), 1970: (1970, 1970), 1980: (1980, 1980), 1990: (1990, 1990)}
    for by, (y0, y1) in base_spans.items():
        base[by] = {}
        for s in SEXES:
            q0t = imr_avg(y0, y1, s) / 1000 * ratio(by, s)
            q, res = fit_full(std_shape(by, s), s, ex5[by][s], q0t)
            base[by][s] = q
            fit_report[(by, s)] = float(np.max(np.abs(res[:-1])))

    # 方法の検証: 2000・2005・2010年の完全生命表を、同じ方法で5歳ごとの平均余命から復元して比べる
    validation = []
    for vy in (2000, 2005, 2010):
        for s in SEXES:
            truth = official[vy][s]
            q, _ = fit_full(std_shape(vy, s), s, ex5[vy][s], truth[0])
            rel = np.abs(q[:100] / truth[:100] - 1)
            validation.append((vy, s, float(np.median(rel)), float(np.percentile(rel, 90)),
                               life_table(q, s)[1][0] - life_table(truth, s)[1][0]))

    def interp_tables(tabs, y, s):
        ks = sorted(tabs)
        lo = max(k for k in ks if k <= y)
        hi = min(k for k in ks if k >= y)
        if lo == hi:
            return tabs[lo][s].copy()
        w = (y - lo) / (hi - lo)
        q = expit((1 - w) * logit(tabs[lo][s]) + w * logit(tabs[hi][s]))
        q[105] = 1.0
        return q

    years = {}
    method_of = {}
    interpolated = []
    # 1930〜1943: 基準年の補間 + 乳児死亡率
    prewar = {k: base[k] for k in (1928, 1935.5, 1947)}
    for y in range(1930, 1944):
        years[y] = {}
        for s in SEXES:
            q = interp_tables(prewar, y, s)
            q0t = imr[y][s] / 1000 * ratio(y, s)
            z = logit(q)
            z[0] = logit(np.array([q0t]))[0]
            q = expit(z)
            q[105] = 1
            years[y][s] = q
        method_of[y] = "基準年（第5回・第6回・第8回生命表）の logit 補間＋乳児死亡率"
    # 1947〜1994: 基準年の補間 + 毎年の平均余命と乳児死亡率
    post = {k: base[k] for k in base if k >= 1947}
    for y in range(1947, 1995):
        years[y] = {}
        for s in SEXES:
            q = interp_tables(post, y, s)
            q0t = imr[y][s] / 1000 * ratio(y, s)
            tg = dict(ann[y][s])
            if y < 1954:
                # 1948〜1953年の簡易生命表は小数1桁で、高齢の平均余命が完全生命表より大きく出ている
                # （例: 1950年 e75=7.6 に対し 1950-52年完全生命表 6.73）。高齢は使わず 0・20・40歳だけに合わせる
                tg = {a: v for a, v in tg.items() if a in (0, 20, 40)}
            years[y][s] = calibrate(q, s, tg, q0t)
        method_of[y] = "完全生命表の基準年を補間し、簡易生命表の平均余命（0・20・40・65・75歳）と乳児死亡率に調整"
    for y in (1947, 1960, 1965, 1970, 1980, 1990):
        method_of[y] = "完全生命表（5歳ごとの平均余命と乳児死亡率から各歳を復元）"
    # 1944〜1946: 1943年と1947年の補間
    for y in (1944, 1945, 1946):
        w = (y - 1943) / 4
        years[y] = {}
        for s in SEXES:
            q = expit((1 - w) * logit(years[1943][s]) + w * logit(years[1947][s]))
            q[105] = 1
            years[y][s] = q
        method_of[y] = "1943年と1947年の logit 補間（統計の欠け。戦争による死亡は含めない）"
        interpolated.append(y)
    # 1995〜2019: 公式の各歳の表
    for y in range(1995, 2020):
        years[y] = official[y]
        method_of[y] = source_of[y]
    # 2020〜2070: 社人研 将来生命表（中位）
    for y in range(2020, 2071):
        years[y] = future[y]
        method_of[y] = "社人研 令和5年推計 将来生命表（中位）" if y > 2020 else "社人研 令和5年推計 将来生命表（中位）の2020年（第23回完全生命表に相当）"

    # 推計で作った年（各歳の公式表がない年）
    estimated = [y for y in range(1930, 1995) if y not in (1928,)]

    def r4(v):
        return float(f"{v:.4g}")

    out_years = {}
    for y in range(1930, 2071):
        out_years[str(y)] = {s: [r4(min(max(v, 0.0), 1.0)) for v in years[y][s]] for s in SEXES}
        for s in SEXES:
            out_years[str(y)][s][105] = 1.0

    meta = {
        "source": [
            {"title": "厚生労働省「第5回生命表」（1926〜30年）e-Stat『第１～17回生命表』PDF", "url": "https://www.e-stat.go.jp/stat-search/file-download?statInfId=000040015575&fileKind=2"},
            {"title": "厚生労働省「完全生命表」第18〜22回（1995〜2015年）e-Stat 生命表", "url": "https://www.e-stat.go.jp/stat-search/files?toukei=00450012&tstat=000001031336"},
            {"title": "厚生労働省「簡易生命表」平成8年〜令和元年（1996〜2019年）e-Stat", "url": "https://www.e-stat.go.jp/stat-search/files?toukei=00450012&tstat=000001031336"},
            {"title": "厚生労働省「令和6年簡易生命表」参考資料2 主な年齢の平均余命の年次推移", "url": "https://www.mhlw.go.jp/toukei/saikin/hw/life/life24/dl/life24-09.pdf"},
            {"title": "国立社会保障・人口問題研究所『人口統計資料集』2008年版 表5-14・2025年版 表5-13（年齢5歳階級別平均余命）", "url": "https://www.ipss.go.jp/syoushika/tohkei/Popular/Popular2025.asp?chap=5"},
            {"title": "国立社会保障・人口問題研究所『人口統計資料集』2026年版 表4-1（性別出生数）・表5-2（性別乳児死亡数）", "url": "https://www.ipss.go.jp/syoushika/tohkei/Popular/Popular2026.asp?chap=5"},
            {"title": "国立社会保障・人口問題研究所『日本の将来推計人口（令和5年推計）』仮定値表7（将来生命表 中位）", "url": "https://www.ipss.go.jp/pp-zenkoku/j/zenkoku2023/db_zenkoku2023/db_zenkoku2023syosaikekka.html"},
        ],
        "license": "e-Stat: 政府標準利用規約（第2.0版）、厚生労働省・社人研サイト: 公共データ利用規約（PDL1.0）。いずれも CC BY 4.0 互換。本ファイルは上記を加工して作成。",
        "ages": "0..105（105は105歳以上。q105=1）",
        "value": "年齢 x 歳の人が x+1 歳になるまでに死亡する確率 qx。有効数字4桁",
        "method": (
            "1995〜2019年は公式の生命表の nqx をそのまま使用（1995・2000・2005・2010・2015年は完全生命表、他は簡易生命表）。"
            "2020〜2070年は社人研 令和5年推計の将来生命表（中位）の nqx。"
            "表が105歳まで載っていない年は、80歳以上の logit(qx) を年齢の一次式で延長した。"
            "1930〜1994年は各歳の死亡率が機械で読める形で公開されていないため推計した："
            "(1) 第5回完全生命表（1926〜30年）と第18回（1995年）の logit(qx) を時間で補間した形を標準とし、"
            "第6回（1935-36年）・第8回（1947年）・第9回（1950-52年）・第11回（1960年）・第12回（1965年）・第13回（1970年）・"
            "第15回（1980年）・第17回（1990年）完全生命表の5歳ごとの平均余命（e0〜e100）と性別乳児死亡率に合うよう、"
            "年齢5歳ごとの節点で logit を調整して各歳の表を復元した（Levenberg-Marquardt法）。"
            "(2) 1947〜1994年の他の年は、前後の基準年の logit(qx) を直線補間し、簡易生命表の平均余命（0・20・40・65・75歳）"
            "と性別乳児死亡率に合うよう年齢帯ごとに調整した（1948〜1953年は高齢の値が不安定なため0・20・40歳のみ）。"
            "(3) 1930〜1943年は第5回・第6回・第8回の表を補間し、0歳だけ毎年の性別乳児死亡率に合わせた。"
            "(4) 1944〜1946年は1943年と1947年の logit 補間。戦争による死亡はゲーム側の出来事として別に扱うため含めない。"
            "乳児死亡率から q0 への換算には、生命表の q0 と乳児死亡率の比（1926-30年と1995〜2005年の表で求め、間は直線補間）を用いた。"
        ),
        "estimated": estimated,
        "interpolated": interpolated,
        "note": (
            "1947〜1972年の統計は沖縄県を含まない。1944〜1946年は人口動態統計が欠けているため補間値。"
            "1930〜1994年の各歳の値は推計なので、個々の年齢の値よりも平均寿命などの全体の水準を重視して使うこと。"
            "日本版死亡データベース（JMD）や Human Mortality Database の値は本ファイルに含めていない（JMD は README_mortality.md の照合にだけ使った）。2020〜2070年の将来生命表は社人研が JMD をもとに作った公表推計で、社人研サイト（PDL1.0）から取得した。"
        ),
    }
    with open(os.path.join(OUT, "mortality.json"), "w", encoding="utf-8") as f:
        json.dump({"meta": meta, "years": out_years}, f, ensure_ascii=False, separators=(",", ":"))

    # --- 高位・低位
    hi = read_ipss_future("ATable7B.xlsx")
    lo = read_ipss_future("ATable7C.xlsx")
    e_mid = life_table(future[2070]["male"], "male")[1][0]
    e_hi = life_table(hi[2070]["male"], "male")[1][0]
    e_lo = life_table(lo[2070]["male"], "male")[1][0]
    var = {"high": {}, "low": {}}
    for y in range(2025, 2071):
        var["high"][str(y)] = {s: [r4(v) for v in hi[y][s]] for s in SEXES}
        var["low"][str(y)] = {s: [r4(v) for v in lo[y][s]] for s in SEXES}
        for k in var:
            for s in SEXES:
                var[k][str(y)][s][105] = 1.0
    vmeta = {
        "source": [{"title": "国立社会保障・人口問題研究所『日本の将来推計人口（令和5年推計）』仮定値表7B（死亡高位）・7C（死亡低位）",
                    "url": "https://www.ipss.go.jp/pp-zenkoku/j/zenkoku2023/db_zenkoku2023/db_zenkoku2023syosaikekka.html"}],
        "license": "公共データ利用規約（PDL1.0）。CC BY 4.0 互換。加工して作成。",
        "ages": "0..105（105は105歳以上。q105=1）",
        "method": "表7B・7C の nqx を有効数字4桁に丸めた。",
        "interpolated": [],
        "variants": {
            "high": f"死亡高位仮定（表7B）＝死亡率が高く、寿命が短い（2070年の男の平均寿命 {e_hi:.2f}年、中位 {e_mid:.2f}年）",
            "low": f"死亡低位仮定（表7C）＝死亡率が低く、寿命が長い（2070年の男の平均寿命 {e_lo:.2f}年）",
        },
        "note": "中位は mortality.json の 2025〜2070年。",
    }
    assert e_hi < e_mid < e_lo, (e_hi, e_mid, e_lo)
    with open(os.path.join(OUT, "mortality_variants.json"), "w", encoding="utf-8") as f:
        json.dump({"meta": vmeta, **var}, f, ensure_ascii=False, separators=(",", ":"))

    # --- 照合表
    pub = {}
    for y, rec in ann.items():
        pub[y] = {s: rec[s].get(0) for s in SEXES}
    pub[1935] = {"male": ex5[1935.5]["male"][0], "female": ex5[1935.5]["female"][0]}
    lines = []
    lines.append("# mortality.json の説明と平均寿命の照合\n")
    lines.append("`scripts/build_mortality.py` が作る。元データは `scripts/fetch_population_raw.py` で取得する。\n")
    lines.append("## 平均寿命（e0）の照合\n")
    lines.append("出力の qx から計算した平均寿命と、公表値（完全生命表・簡易生命表）を比べた。"
                 "1935年の公表値は第6回完全生命表（1935-36年）。\n")
    lines.append("| 年 | 男 出力 | 男 公表 | 差 | 女 出力 | 女 公表 | 差 | 出力の作り方 |")
    lines.append("|---|---|---|---|---|---|---|---|")
    worst = 0
    for y in (1935, 1947, 1955, 1965, 1975, 1985, 1995, 2005, 2015, 2020):
        row = [str(y)]
        for s in SEXES:
            q = np.array(out_years[str(y)][s])
            e0 = life_table(q, s)[1][0]
            p = pub[y][s]
            row += [f"{e0:.2f}", f"{p:.2f}", f"{e0 - p:+.2f}"]
            worst = max(worst, abs(e0 - p))
        row.append(method_of[y])
        lines.append("| " + " | ".join(row) + " |")
    allworst = (0, None)
    for y in range(1947, 2025):
        if y > 2070 or str(y) not in out_years or y not in pub:
            continue
        for s in SEXES:
            e0 = life_table(np.array(out_years[str(y)][s]), s)[1][0]
            d = abs(e0 - pub[y][s])
            if d > allworst[0]:
                allworst = (d, (y, s))
    lines.append("")
    lines.append(f"上の表での最大のずれは {worst:.2f} 年。1947〜2024年の全年で見ると最大 {allworst[0]:.2f} 年（{allworst[1]}）。"
                 "2021〜2024年は将来推計（中位）なので実績（簡易生命表）とずれる。\n")
    lines.append("## 方法\n")
    lines.append(meta["method"] + "\n")
    lines.append("## 復元方法の検証\n")
    lines.append("各歳の表がある2000・2005・2010年の完全生命表について、5歳ごとの平均余命と q0 だけから同じ方法で各歳の qx を復元し、"
                 "本物の qx（0〜99歳）と比べた。\n")
    lines.append("| 年 | 性 | 相対誤差の中央値 | 相対誤差の90%点 | e0 の差 |")
    lines.append("|---|---|---|---|---|")
    for vy, s, med, p90, de in validation:
        lines.append(f"| {vy} | {'男' if s == 'male' else '女'} | {med * 100:.1f}% | {p90 * 100:.1f}% | {de:+.3f} |")
    lines.append("")
    lines.append("## 基準年の当てはまり（5歳ごとの平均余命の最大誤差、年）\n")
    lines.append("| 基準年 | 男 | 女 |")
    lines.append("|---|---|---|")
    for by in base_spans:
        lines.append(f"| {by} | {fit_report[(by, 'male')]:.3f} | {fit_report[(by, 'female')]:.3f} |")
    lines.append("")
    lines.append("（85歳以上の平均余命は重みを下げて当てはめている。）\n")
    jdir = os.path.join(RAW, "jmd_verify")
    if os.path.exists(os.path.join(jdir, "mltper_1x1.txt")):
        # 照合のみ: 日本版死亡データベース（JMD）の各歳 qx と比べた誤差の統計だけを書く（JMD の値は出力しない）
        lines.append("## 日本版死亡データベース（JMD）との照合（照合のみ）\n")
        lines.append("推計した1947〜1994年の qx（0〜94歳）を、JMD（ver.005_002, https://www.ipss.go.jp/p-toukei/JMD/00/）の各歳の qx と比べた"
                     "相対誤差。JMD の数値そのものは出力に含めていない。JMD のファイルは `data/raw/jmd_verify/` に手で置いた場合だけ照合する。\n")
        lines.append("| 年 | 男 中央値 | 男 90%点 | 女 中央値 | 女 90%点 |")
        lines.append("|---|---|---|---|---|")
        jm = {}
        for s, f in (("male", "m"), ("female", "f")):
            for line in open(os.path.join(jdir, f"{f}ltper_1x1.txt"), encoding="utf-8").read().splitlines()[3:]:
                t = line.split()
                if len(t) < 10 or not t[0].isdigit():
                    continue
                a = int(t[1].replace("+", ""))
                if a < 95:
                    jm.setdefault((int(t[0]), s), np.zeros(95))[a] = float(t[3])
        for y in (1947, 1950, 1955, 1960, 1965, 1970, 1975, 1980, 1985, 1990, 1994):
            row = [str(y)]
            for s in SEXES:
                ours = np.array(out_years[str(y)][s][:95])
                rel = np.abs(ours / jm[(y, s)] - 1)
                row += [f"{np.median(rel) * 100:.1f}%", f"{np.percentile(rel, 90) * 100:.1f}%"]
            lines.append("| " + " | ".join(row) + " |")
        lines.append("\n誤差が大きいのは、死亡率がもともと低い1〜19歳（値が小さく、相対誤差が出やすい）。\n")
    lines.append("## 注意\n")
    lines.append("- 1930〜1994年の各歳の qx は推計値（`meta.estimated`）。1944〜1946年は補間値（`meta.interpolated`）で、戦争による死亡を含まない。\n"
                 "- 1947〜1972年は沖縄県を含まない統計にもとづく。\n"
                 "- 2021年以降は社人研の将来推計（中位）。高位・低位は `mortality_variants.json`（2025〜2070年）。\n"
                 "- 日本版死亡データベース（JMD）・Human Mortality Database の数値は出力に含めていない。\n")
    with open(os.path.join(OUT, "README_mortality.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    print("\n".join(lines[:20]))
    print("fit", fit_report)
    print("validation", validation)


if __name__ == "__main__":
    main()
