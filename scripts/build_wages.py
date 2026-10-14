"""data/stats/wages.json を作る。

出典
- 厚生労働省『毎月勤労統計調査』全国調査 実数・指数累積データ（指数）：名目賃金指数（現金給与総額、2020年=100）
- 厚生労働省『賃金構造基本統計調査』2000年 第1表（産業計）、2020年 一般労働者 第1表（産業計）
- 戦前：経済企画庁『昭和31年 年次経済報告』の「製造業生産労働者の税引実質賃金は戦前基準（9〜11年=100）で112.2」と
  cpi.json（先に build_cpi.py を実行しておく）から推計

実行: python3 scripts/build_cpi.py && python3 scripts/build_wages.py
"""
import json
import re
import sys
import unicodedata
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
import econ_common as c  # noqa: E402

START, END = 1930, 2025
AGES = ["15-19", "20-24", "25-29", "30-34", "35-39", "40-44", "45-49", "50-54", "55-59", "60-64", "65-69"]

# 経済企画庁『昭和31年度 年次経済報告』：1955年の製造業生産労働者の税引実質賃金（1934〜36年=100）
REAL_WAGE_1955_VS_PREWAR = 112.2
REAL_WAGE_URL = "https://www5.cao.go.jp/keizai3/keizaiwp/wp-je56/wp-je56-021002.html"


# ---------------- 名目賃金指数 ----------------
def wage_index():
    path = c.estat("000032189777", "maikin_ruiseki_shisu.csv", kind=1)
    df = pd.read_csv(path, encoding="cp932", dtype=str)
    df["産業分類"] = df["産業分類"].str.strip()
    s = df[(df["月"] == "CY") & (df["種別"] == "指数") & (df["就業形態"] == "0") & (df["規模"] == "0")]  # 規模0=30人以上

    def series(ind):
        x = s[s["産業分類"] == ind]
        return {int(r["年"]): float(r["現金給与総額"]) for _, r in x.iterrows() if str(r["現金給与総額"]).strip() not in ("", "nan")}

    tl = series("TL")   # 調査産業計 1970〜
    mf = series("E")    # 製造業 1952〜
    out = {y: round(v, 1) for y, v in tl.items() if y <= END}
    k = tl[1970] / mf[1970]
    linked = []
    for y, v in mf.items():
        if y < 1970:
            out[y] = round(v * k, 2)
            linked.append(y)
    return out, linked, k


# ---------------- 賃金構造基本統計調査 ----------------
def norm(s):
    return unicodedata.normalize("NFKC", str(s)).replace("\n", "").replace(" ", "").replace("　", "")


def age_key(label):
    t = norm(label)
    m = re.match(r"^(\d+)[～~〜](\d+)歳?$", t)
    if m:
        return f"{m.group(1)}-{m.group(2)}"
    if re.match(r"^[～~〜](17|19)歳$", t):
        return "~" + re.match(r"^[～~〜](\d+)", t).group(1)
    return None


def parse_table(df, label_col, base_col, sex_rule, edu_map):
    """base_col = 「きまって支給する現金給与額」の列。所定内はその右、賞与はさらに右、労働者数はさらに右。"""
    res = {}
    sex = edu = None
    for _, r in df.iterrows():
        lab = norm(r[label_col]) if not pd.isna(r[label_col]) else ""
        if not lab:
            continue
        s2, rest = sex_rule(lab)
        if s2:
            sex = s2
            lab = rest
        if lab in edu_map:
            edu = edu_map[lab]
            continue
        if lab.endswith("学歴計") or lab in ("不明", "専門学校", "大学院"):
            edu = None
            continue
        ak = age_key(lab)
        if ak is None or sex not in ("male", "female") or edu is None:
            continue
        try:
            kimatte = float(r[base_col])
            bonus = float(r[base_col + 2])
            n = float(r[base_col + 3])
        except (TypeError, ValueError):
            continue
        res.setdefault(sex, {}).setdefault(edu, {})[ak] = (kimatte * 12 + bonus, n)  # 千円
    return res


def finish(raw, combine_15_19):
    out = {}
    for sex, edus in raw.items():
        out[sex] = {}
        for edu, ages in edus.items():
            d = {}
            if combine_15_19:
                parts = [ages[k] for k in ("~17", "18-19") if k in ages]
            else:
                parts = [ages[k] for k in ("~19",) if k in ages]
            if edu in ("middle", "high") and parts:
                w = sum(n for _, n in parts)
                if w > 0:
                    d["15-19"] = round(sum(v * n for v, n in parts) / w / 10, 1)
            for a in AGES[1:]:
                if a in ages:
                    d[a] = round(ages[a][0] / 10, 1)  # 千円→万円
            out[sex][edu] = d
    return out


def profile_2000():
    path = c.estat("000001256993", "chinkou_2000_t1_sangyokei.xls")
    df = pd.read_excel(path, header=None)

    def sex_rule(lab):
        if lab.startswith("男性労働者"):
            return "male", lab[len("男性労働者"):]
        if lab.startswith("女性労働者"):
            return "female", lab[len("女性労働者"):]
        if lab in ("産業計", "全労働者"):
            return "both", ""
        return None, lab

    edu_map = {"中卒": "middle", "高卒": "high", "高専・短大卒": "junior", "大卒": "univ"}
    return finish(parse_table(df, 0, 5, sex_rule, edu_map), combine_15_19=True)


def profile_2020():
    path = c.estat("000032069350", "chinkou_2020_t1_sangyo.xlsx")
    df = pd.read_excel(path, sheet_name="産業計", header=None)

    def sex_rule(lab):
        for k, v in (("男女計", "both"), ("男", "male"), ("女", "female")):
            if lab.startswith(k):
                return v, lab[len(k):]
        return None, lab

    edu_map = {"中学": "middle", "高校": "high", "高専・短大": "junior", "大学": "univ"}
    return finish(parse_table(df, 2, 7, sex_rule, edu_map), combine_15_19=False)


def main():
    idx, linked, k = wage_index()
    cpi = {int(y): v for y, v in json.loads((c.STATS / "cpi.json").read_text(encoding="utf-8"))["years"].items()}
    cpi_prewar = cpi[1930]  # 1930〜1936年は1934〜36年平均の水準で据え置き（cpi.json の推計）
    # 1955年の実質賃金＝戦前の1.122倍 → 戦前の名目賃金指数＝W1955×(CPI戦前/CPI1955)÷1.122
    w_prewar = idx[1955] * (cpi_prewar / cpi[1955]) / (REAL_WAGE_1955_VS_PREWAR / 100)
    est = list(range(START, 1937))
    for y in est:
        idx[y] = w_prewar
    filled, fy = c.interpolate_geometric({1936: w_prewar, 1952: idx[1952]}, 1937, 1951, ndigits=8)
    for y in fy:
        idx[y] = filled[y]
    out_idx = {}
    for y in range(START, END + 1):
        v = idx[y]
        out_idx[y] = round(v, 1) if v >= 10 else float(f"{v:.3g}")

    prof = {"2020": profile_2020(), "2000": profile_2000()}
    for yr, p in prof.items():
        for sex in ("male", "female"):
            for edu in ("middle", "high", "junior", "univ"):
                d = p[sex][edu]
                need = AGES[1:10]  # 20-24〜60-64
                assert all(a in d for a in need), (yr, sex, edu, d)

    meta = {
        "title": "賃金",
        "annualIncomeIndex": {
            "unit": "名目賃金の水準（2020年=100）",
            "definition": "毎月勤労統計調査の現金給与総額指数（調査産業計、事業所規模30人以上、就業形態計、年平均）",
            "linked": c.ranges(linked),
            "interpolated": c.ranges(fy),
            "estimated": c.ranges(est + fy),
        },
        "profile": {
            "unit": "年収（万円、名目）＝（きまって支給する現金給与額×12＋年間賞与その他特別給与額）",
            "scope": "一般労働者（2000年は常用労働者のうち短時間労働者を除く）、産業計、企業規模計（10人以上）、民営事業所",
            "education": {"middle": "中学卒", "high": "高校卒", "junior": "高専・短大卒", "univ": "大学卒"},
            "ages": "20-24〜60-64（65-69も参考に収録）。15-19 は middle と high だけ（2000年は〜17歳と18〜19歳を労働者数で加重平均、2020年は〜19歳）。",
            "years": ["2000", "2020"],
        },
        "sources": [
            {"name": "厚生労働省『毎月勤労統計調査』全国調査 実数・指数累積データ 指数・伸び率",
             "url": "https://www.e-stat.go.jp/stat-search/file-download?statInfId=000032189777&fileKind=1",
             "license": "政府標準利用規約（第2.0版）", "retrieved": c.RETRIEVED},
            {"name": "厚生労働省『賃金構造基本統計調査』平成12年 第1表 年齢階級別きまって支給する現金給与額、所定内給与額及び年間賞与その他特別給与額（産業計）",
             "url": "https://www.e-stat.go.jp/stat-search/file-download?statInfId=000001256993&fileKind=0",
             "license": "政府標準利用規約（第2.0版）", "retrieved": c.RETRIEVED},
            {"name": "厚生労働省『賃金構造基本統計調査』令和2年 一般労働者 産業大分類 第1表 学歴、年齢階級別きまって支給する現金給与額、所定内給与額及び年間賞与その他特別給与額（産業計）",
             "url": "https://www.e-stat.go.jp/stat-search/file-download?statInfId=000032069350&fileKind=0",
             "license": "政府標準利用規約（第2.0版）", "retrieved": c.RETRIEVED},
            {"name": "経済企画庁『昭和31年度 年次経済報告』（製造業生産労働者の税引実質賃金は戦前基準で112.2）",
             "url": REAL_WAGE_URL, "license": "内閣府ホームページ（政府標準利用規約に準拠）", "retrieved": c.RETRIEVED},
        ],
        "interpolated": {"annualIncomeIndex": c.ranges(fy), "profile": ""},
        "method": [
            "annualIncomeIndex 1970〜2025年：毎月勤労統計の調査産業計・30人以上の現金給与総額指数（2020年=100）。",
            f"annualIncomeIndex 1952〜1969年：製造業（30人以上）の指数に、1970年の調査産業計との比（{k:.4f}）を掛けてつないだ。",
            "annualIncomeIndex 1930〜1936年（推計）：1955年の実質賃金が戦前（1934〜36年）の1.122倍（1956年経済白書、製造業生産労働者・税引）"
            "であることと cpi.json の戦前水準から、戦前の名目賃金水準＝1955年の指数×(戦前のCPI÷1955年のCPI)÷1.122 とし、1930〜36年は同じ値で据え置いた。",
            "annualIncomeIndex 1937〜1951年（推計・補間）：1936年と1952年の間を対数で直線補間した。戦中・終戦直後の実際の動き（実質賃金の大幅な低下）は表していない。",
            "profile：賃金構造基本統計調査の企業規模計（10人以上）の値。年収＝きまって支給する現金給与額×12＋年間賞与その他特別給与額（前年1年間の賞与）。",
            "profile の学歴区分は年によって違う。2000年の『大卒』は大学院卒を含む。2020年は『大学』（大学院を含まない）を univ とし、『専門学校』『大学院』は含めていない。",
            "2020年調査から推計方法が変わり（復元方法の変更等）、2019年以前とは厳密には接続しない。",
        ],
        "note": "1980年前後の基準年は、賃金構造基本統計調査の年別の表がe-Statに1999年分からしかなく、作っていない。"
                "他の年の年収は profile の値に annualIncomeIndex の比を掛けて近似する（例：1980年の年収 ≒ 2000年の profile × index[1980] / index[2000]）。"
                "ただし年齢・学歴による賃金差（年功カーブ）の形は時代で変わるため、近似であることに注意。",
        "unverified": ["1937〜1951年の名目賃金の年ごとの動き"],
    }
    c.write_json("wages.json", {"meta": meta, "annualIncomeIndex": out_idx, "profile": prof})


if __name__ == "__main__":
    main()
