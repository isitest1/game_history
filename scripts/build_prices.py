"""data/stats/prices.json を作る（暮らしの値段。公的な出典があるものだけ）。

出典
- 厚生労働省『賃金構造基本統計調査』時系列 第1表 企業規模別新規学卒者の初任給の推移（昭和51年〜令和元年）
- 総務省統計局『小売物価統計調査（動向編）』2025年 第1表 調査品目の月別価格及び年平均価格（東京都区部）

実行: python3 scripts/build_prices.py
"""
import re
import sys
import unicodedata
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
import econ_common as c  # noqa: E402

# 小売物価統計調査 2025年（年次）第1表のファイル（statInfId）と品目シート
KOURI_2025 = {
    "ramen": ("000040446324", 13, "2102中華そば（外食）", "ラーメン1杯（外食、しょう油味）"),
    "coffee": ("000040446325", 14, "2162コーヒー（外食）", "喫茶店のコーヒー1杯"),
    "train": ("000040446337", 26, "7691鉄道運賃", "私鉄の運賃（11km、JR以外、大人片道の普通運賃）"),
    "bath": ("000040446341", 30, "9504入浴料", "スーパー銭湯などの入館料（物価統制令適用外の公衆浴場、平日大人）"),
}


def era_year(label, prev):
    t = unicodedata.normalize("NFKC", str(label)).strip()
    m = re.search(r"(昭和|平成|令和)\s*(元|\d+)", t)
    if m:
        n = 1 if m.group(2) == "元" else int(m.group(2))
        return {"昭和": 1925, "平成": 1988, "令和": 2018}[m.group(1)] + n, m.group(1)
    m = re.fullmatch(r"(\d+)", t)
    if m and prev:
        return {"昭和": 1925, "平成": 1988, "令和": 2018}[prev] + int(m.group(1)), prev
    return None, prev


def starting_salary():
    path = c.estat("000031886408", "chinkou_jikeiretsu_1_shoninkyu.xlsx")
    df = pd.read_excel(path, sheet_name="企業規模計", header=None)
    out = {"univ_male": {}, "univ_female": {}, "high_male": {}, "high_female": {}}
    era = None
    for _, r in df.iterrows():
        y, era = era_year(r[0], era)
        if y is None or not 1976 <= y <= 2019:
            continue
        # 列：男 院卒(1,2) 大卒(3,4) 高専短大(5,6) 高卒(7,8) / 女 院卒(9,10) 大卒(11,12) 高専短大(13,14) 高卒(15,16)
        for key, col in (("univ_male", 3), ("high_male", 7), ("univ_female", 11), ("high_female", 15)):
            try:
                out[key][y] = int(round(float(r[col]) * 1000))  # 千円→円
            except (TypeError, ValueError):
                pass
    return out


def kouri_2025():
    res = {}
    for key, (sid, g, sheet, label) in KOURI_2025.items():
        path = c.estat(sid, f"kouri_2025_nen_{g:02d}.xlsx")
        df = pd.read_excel(path, sheet_name=sheet, header=None)
        brand = str(df.iloc[8, 8])
        unit = str(df.iloc[9, 8])
        row = df[df[7].astype(str).str.strip() == "13100"]  # 東京都区部
        res[key] = {"label": label, "unit": "円", "per": unit, "spec": brand, "area": "東京都区部",
                    "years": {2025: int(row.iloc[0, 10])}}
    return res


def main():
    ss = starting_salary()
    items = {
        "starting_salary_univ_male": {"label": "大卒初任給（男性、月額）", "unit": "円", "years": ss["univ_male"]},
        "starting_salary_univ_female": {"label": "大卒初任給（女性、月額）", "unit": "円", "years": ss["univ_female"],
                                        "note": "1986年までは事務系、1987年以降は事務系と技術系の合計"},
        "starting_salary_high_male": {"label": "高卒初任給（男性、月額）", "unit": "円", "years": ss["high_male"]},
        "starting_salary_high_female": {"label": "高卒初任給（女性、月額）", "unit": "円", "years": ss["high_female"]},
    }
    items.update(kouri_2025())
    meta = {
        "title": "暮らしの値段（当時の金額）",
        "sources": [
            {"name": "厚生労働省『賃金構造基本統計調査』時系列 第1表 企業規模別新規学卒者の初任給の推移＜昭和51年～令和元年＞（企業規模計）",
             "url": "https://www.e-stat.go.jp/stat-search/file-download?statInfId=000031886408&fileKind=0",
             "license": "政府標準利用規約（第2.0版）", "retrieved": c.RETRIEVED},
            {"name": "総務省統計局『小売物価統計調査（動向編）』2025年 第1表 調査品目の月別価格及び年平均価格（東京都区部の年平均）",
             "url": "https://www.e-stat.go.jp/stat-search/files?toukei=00200571&tstat=000000680001&cycle=7&year=20250",
             "license": "政府標準利用規約（第2.0版）", "retrieved": c.RETRIEVED},
        ],
        "interpolated": {},
        "method": [
            "初任給：確定した初任給（所定内給与額から通勤手当を除く）。1976〜2019年。2020年に初任給の集計方法が変わったため2020年以降は未収録。",
            "小売物価：2025年の東京都区部の年平均価格（円）。銘柄の定義は spec を参照。",
        ],
        "note": "1950〜1990年代のラーメン・コーヒー・はがき・銭湯・国鉄運賃などの長期の値は、小売物価統計調査のデータベースが2000年以降のみで、"
                "それ以前は紙の報告書のため未収録。はがき・国鉄運賃は日本郵便・JRの公表資料にあるが、許可された出典の範囲外として入れていない。",
        "unverified": ["2000年以前の品目別価格（未収録）"],
    }
    c.write_json("prices.json", {"meta": meta, "items": items})


if __name__ == "__main__":
    main()
