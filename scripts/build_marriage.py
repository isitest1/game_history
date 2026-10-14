#!/usr/bin/env python3
"""結婚の統計（平均初婚年齢・50歳時未婚割合・年齢別初婚率）を作る。

出力: data/stats/marriage.json
入力: data/raw/ipss_popular/（scripts/fetch_population_raw.py で取得）
"""
import json
import math
import os
import re

import pandas as pd

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "data", "raw", "ipss_popular")
OUT = os.path.join(ROOT, "data", "stats")


def isnum(v):
    return isinstance(v, (int, float)) and not (isinstance(v, float) and math.isnan(v))


def mean_first_marriage_age():
    """表6-12: {year: (husband, wife)}（初婚）"""
    v = pd.read_excel(os.path.join(RAW, "T06-12.xlsx"), header=None).values
    out = {}
    for r in v[4:]:
        for off in (0, 7):
            y = r[off]
            if isnum(y) and 1800 < y < 2100 and isnum(r[off + 4]) and isnum(r[off + 5]):
                out[int(y)] = (float(r[off + 4]), float(r[off + 5]))
    return out


def never_married_50():
    """表6-23: {year: (male, female)}（%）"""
    v = pd.read_excel(os.path.join(RAW, "T06-23.xlsx"), header=None).values
    out = {}
    for r in v[4:]:
        m = re.match(r"^(\d{4})", str(r[0]))
        if m and isnum(r[1]) and isnum(r[5]):
            out[int(m.group(1))] = (float(r[1]), float(r[5]))
    return out


AGE_KEYS = {"19歳以下": "15-19", "20～24": "20-24", "25～29": "25-29", "30～34": "30-34", "35～39": "35-39",
            "40～44": "40-44", "45～49": "45-49", "50～54": "50-54", "55～59": "55-59", "60～64": "60-64",
            "65～69": "65-69", "70歳以上": "70+", "総数": "total"}


def first_marriage_rates(path):
    """表6-4: {year: {sex: {ageband: rate}}}（人口千対）"""
    v = pd.read_excel(path, header=None).values
    cols = {}
    for j, h in enumerate(v[2]):
        m = re.match(r"(\d{4})", str(h))
        if m:
            cols[j] = int(m.group(1))
    out = {}
    sex = None
    for r in v[3:]:
        if str(r[1]).strip() == "夫":
            sex = "male"
            continue
        if str(r[1]).strip() == "妻":
            sex = "female"
            continue
        label = re.sub(r"\s|\d\)", "", str(r[0]))
        if sex and label in AGE_KEYS:
            for j, y in cols.items():
                if isnum(r[j]):
                    out.setdefault(y, {}).setdefault(sex, {})[AGE_KEYS[label]] = float(r[j])
    return out


def main():
    os.makedirs(OUT, exist_ok=True)
    mfa = mean_first_marriage_age()
    interp = []
    mean_age = {}
    known = sorted(y for y in mfa if y >= 1925)
    for y in range(1930, 2026):
        if y in mfa:
            h, w = mfa[y]
        elif y > max(known):
            h, w = mfa[max(known)]
            interp.append(y)
        else:
            lo = max(k for k in known if k < y)
            hi = min(k for k in known if k > y)
            t = (y - lo) / (hi - lo)
            h = round((1 - t) * mfa[lo][0] + t * mfa[hi][0], 1)
            w = round((1 - t) * mfa[lo][1] + t * mfa[hi][1], 1)
            interp.append(y)
        mean_age[str(y)] = {"male": h, "female": w}

    nm = never_married_50()
    never = {str(y): {"male": m, "female": f} for y, (m, f) in sorted(nm.items()) if y >= 1920}

    rates = first_marriage_rates(os.path.join(RAW, "T06-04.xlsx"))
    old = first_marriage_rates(os.path.join(RAW, "old", "P2012_T06-04.xls"))
    for y in (1960, 2005):
        rates[y] = old[y]
    fmr = {str(y): rates[y] for y in sorted(rates)}

    meta = {
        "source": [
            {"title": "国立社会保障・人口問題研究所『人口統計資料集』2026年版 表6-12 全婚姻および初婚の平均婚姻年齢（厚生労働省『人口動態統計』による）",
             "url": "https://www.ipss.go.jp/syoushika/tohkei/Data/Popular2026/T06-12.xlsx"},
            {"title": "同 表6-23 性別50歳時の未婚割合（総務省統計局『国勢調査報告』により算出）",
             "url": "https://www.ipss.go.jp/syoushika/tohkei/Data/Popular2026/T06-23.xlsx"},
            {"title": "同 表6-4 性，年齢（5歳階級）別初婚率（2026年版）",
             "url": "https://www.ipss.go.jp/syoushika/tohkei/Data/Popular2026/T06-04.xlsx"},
            {"title": "同 表6-4（2012年版。1960年・2005年の列）",
             "url": "https://www.ipss.go.jp/syoushika/tohkei/Data/Popular2012/T06-04.xls"},
        ],
        "license": "公共データ利用規約（PDL1.0）。CC BY 4.0 互換。加工して作成。",
        "meanFirstMarriageAge": {
            "unit": "歳（初婚の夫・妻の平均婚姻年齢）。male=夫、female=妻",
            "range": "1930〜2025年",
            "published_years": [y for y in known if 1930 <= y],
            "note": ("1940年以前は届出時の年齢、1947〜65年は結婚式を挙げたときの年齢、1970年以降は挙式または同居開始の早い方の年齢"
                     "（定義の違いで1940年と1947年の間に段差がある）。1947〜72年は沖縄県を含まない。"),
        },
        "neverMarriedAt50": {
            "unit": "%（45〜49歳と50〜54歳の未婚割合の平均）",
            "key": "国勢調査の調査年（生まれ年ではない）",
            "note": "2015・2020年は不詳補完値にもとづく。調査年は1920・1930・1940・1950年、以後10年ごと、2015・2020年。",
        },
        "firstMarriageRateByAge": {
            "unit": "人口千対（その性・年齢の人口1,000人あたりの初婚件数。未婚者千対ではない）",
            "bands": "15-19 は「19歳以下」、70+ は「70歳以上」、total は総数（15歳以上人口千対）",
            "years": "公表されている年だけ（1930・1950・1960・1970・1980・1990・2000・2005・2010・2020・2024年）",
            "note": "1930年は届出総数、1950年以降は各届出年に結婚生活に入ったもの。1950〜70年は沖縄県を含まない。",
        },
        "method": ("平均初婚年齢は公表年（1930・1935・1940・1947・1950・1955・1960・1965・1970年、1970年以降は毎年）の値をそのまま使い、"
                   "間の年は前後の公表年の直線補間（小数1桁）。2025年は未公表のため2024年の値を据え置いた。"
                   "50歳時未婚割合と年齢別初婚率は公表値をそのまま使い、補間していない。"),
        "interpolated": interp,
        "note": "interpolated は meanFirstMarriageAge の補間年（2025年は2024年の据え置き）。",
    }
    out = {"meta": meta, "meanFirstMarriageAge": mean_age, "neverMarriedAt50": never,
           "firstMarriageRateByAge": fmr}
    with open(os.path.join(OUT, "marriage.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print("interp", interp)
    print("fmr years", list(fmr), fmr["1960"]["male"])
    print("never", never)


if __name__ == "__main__":
    main()
