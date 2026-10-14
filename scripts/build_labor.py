"""data/stats/labor.json を作る。

出典
- 労働力調査 長期時系列 表2-1（完全失業率、年平均）、表3-2（年齢5歳階級別労働力人口比率）（総務省統計局、e-Stat）
- 職業安定業務統計 一般職業紹介状況 第1表（有効求人倍率、年平均、1963年〜）（厚生労働省、e-Stat）
- 職業安定業務統計 新規学卒者（高校・中学）の職業紹介状況 職業紹介主要指標の推移（2002年3月卒〜）（e-Stat）
- 労働経済の分析（労働白書）昭和44年版・昭和48年版（厚生労働省サイトのPDF）：1969・1971年3月卒の中卒・高卒求人倍率
- リクルートワークス研究所 第43回ワークス大卒求人倍率調査（1987年3月卒〜）

実行: python3 scripts/build_labor.py
"""
import re
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
import econ_common as c  # noqa: E402

START, END = 1930, 2025

# 新規学卒者の職業紹介状況「職業紹介主要指標の推移」（各年の表に直近5年分）
SHINSOTSU_FILES = {
    2006: "000001724803", 2010: "000008204384", 2015: "000031316792",
    2020: "000032031847", 2025: "000040367568",
}

# 労働白書の本文から（中卒・高卒の求人倍率、3月卒）
WHITE_PAPER_NEWGRAD = {
    # 昭和44年版 労働経済の分析 第1部 p.「この結果,求職者に対する求人の倍率は,中学卒4.8倍,高校卒5.7倍」
    1969: {"middle": 4.8, "high": 5.7, "src": "https://www.mhlw.go.jp/toukei_hakusho/hakusho/roudou/1969/dl/02.pdf"},
    # 昭和48年版 労働経済の分析「求人倍率は46年(中学卒6.83倍,高校卒3.99倍)」
    1971: {"middle": 6.83, "high": 3.99, "src": "https://www.mhlw.go.jp/toukei_hakusho/hakusho/roudou/1973/dl/02.pdf"},
}

# ワークス大卒求人倍率調査（第43回）計表。2021年卒は6月調査の値（2月調査1.72倍は参考値）
WORKS_UNIV = {
    1987: 2.34, 1988: 2.48, 1989: 2.68, 1990: 2.77, 1991: 2.86, 1992: 2.41, 1993: 1.91, 1994: 1.55,
    1995: 1.20, 1996: 1.08, 1997: 1.45, 1998: 1.68, 1999: 1.25, 2000: 0.99, 2001: 1.09, 2002: 1.33,
    2003: 1.30, 2004: 1.35, 2005: 1.37, 2006: 1.60, 2007: 1.89, 2008: 2.14, 2009: 2.14, 2010: 1.62,
    2011: 1.28, 2012: 1.23, 2013: 1.27, 2014: 1.28, 2015: 1.61, 2016: 1.73, 2017: 1.74, 2018: 1.78,
    2019: 1.88, 2020: 1.83, 2021: 1.53, 2022: 1.50, 2023: 1.58, 2024: 1.71, 2025: 1.75, 2026: 1.66,
    2027: 1.62,
}
WORKS_URL = "https://www.works-i.com/surveys/item/260423_recruitment_saiyo_ratio.pdf"


def to_year(v):
    m = re.match(r"^\s*(\d{4})", str(v))
    return int(m.group(1)) if m else None


def unemployment():
    path = c.estat("000001082681", "lfs_2-1_annual_main.xlsx")
    df = pd.read_excel(path, sheet_name=0, header=None)
    out = {}
    for _, r in df.iterrows():
        y = to_year(r[1])
        if y is None or y < 1953:
            continue
        try:
            out[y] = {"total": round(float(r[12]), 1), "male": round(float(r[23]), 1), "female": round(float(r[34]), 1)}
        except (TypeError, ValueError):
            continue  # 1973年は沖縄を含まない行と含む行がある。後に出てくる「含む」行で上書きされる
    return out


def female_lfpr():
    path = c.estat("000001082683", "lfs_3-2_lfpr_5yr_age.xlsx")
    df = pd.read_excel(path, sheet_name="女", header=None)
    head = df.iloc[5].tolist()
    # 労働力人口比率は「総数」以降の2つ目のブロック
    idx = [i for i, v in enumerate(head) if str(v).strip() == "総数"]
    base = idx[1]
    ages = ["15-19", "20-24", "25-29", "30-34", "35-39", "40-44", "45-49", "50-54", "55-59", "60-64", "65+"]
    out = {}
    for _, r in df.iterrows():
        y = to_year(r[1])
        if y is None:
            continue
        try:
            vals = [round(float(r[base + 1 + i]), 1) for i in range(len(ages))]
        except (TypeError, ValueError):
            continue
        out[y] = dict(zip(ages, vals))  # 1973年は2行目（沖縄を含む）で上書き
    return out


def job_openings():
    path = c.estat("000040505312", "shokuan_01_labor_market_indicators.xlsx")
    df = pd.read_excel(path, header=None)
    out = {}
    for _, r in df.iterrows():
        s = str(r[0]).strip()
        m = re.fullmatch(r"(\d{4})年", s)  # 年平均の行（「年度」や月次の行は除く）
        if not m:
            continue
        y = int(m.group(1))
        if y in out:
            continue
        try:
            out[y] = round(float(r[4]), 2)  # 有効求人倍率（実数）
        except (TypeError, ValueError):
            pass
    return out


def newgrad_middle_high():
    """各ファイルは「中卒」「高卒」のブロックに5年分ずつ並ぶ。
    年のラベルは最初の行だけ「平成18年3月卒」のように書かれ、残りは省略や空白のことがあるので、
    ラベルが読めない行は直前の年＋1とする。"""
    import unicodedata
    mid, high = {}, {}
    for fy, sid in SHINSOTSU_FILES.items():
        ext = "xls" if fy < 2025 else "xlsx"
        path = c.estat(sid, f"shinsotsu_3-1_suii_{fy}.{ext}")
        df = pd.read_excel(path, header=None)
        kind, year = None, None
        for _, r in df.iterrows():
            c0 = unicodedata.normalize("NFKC", str(r[0])) if not pd.isna(r[0]) else ""
            if c0.startswith("中"):
                kind, year = "middle", None
            elif c0.startswith("高"):
                kind, year = "high", None
            if kind is None:
                continue
            nums = [v for v in r[3:] if isinstance(v, (int, float)) and not pd.isna(v)]
            if fy == 2025:  # 2025年の表は列が1つ左にずれている
                nums = [v for v in r[2:] if isinstance(v, (int, float)) and not pd.isna(v)]
            if len(nums) < 4:
                continue
            lab = unicodedata.normalize("NFKC", " ".join(str(v) for v in r[1:3] if not pd.isna(v)))
            mm = re.search(r"(平成|令和)\s*(元|\d+)\s*年", lab)
            if mm:
                n = 1 if mm.group(2) == "元" else int(mm.group(2))
                year = (1988 if mm.group(1) == "平成" else 2018) + n
            elif year is not None:
                year += 1
            else:
                continue
            seekers, offers = nums[0], nums[3]
            if seekers > 0:
                (high if kind == "high" else mid)[year] = round(offers / seekers, 2)
    return mid, high


def main():
    un = unemployment()
    # 1930〜1952年：比較できる公的な年平均の完全失業率が見つからなかった → 1953年の値で据え置く（推計）
    est_un = list(range(START, 1953))
    for y in est_un:
        un[y] = dict(un[1953])
    un = {y: un[y] for y in range(START, END + 1)}

    jo = job_openings()
    jo = {y: v for y, v in sorted(jo.items()) if y <= END}

    mid, high = newgrad_middle_high()
    for y, d in WHITE_PAPER_NEWGRAD.items():
        mid[y], high[y] = d["middle"], d["high"]
    mid = dict(sorted(mid.items()))
    high = dict(sorted(high.items()))

    flp = female_lfpr()

    meta = {
        "title": "雇用・労働市場",
        "sources": [
            {"name": "総務省統計局『労働力調査』長期時系列データ 表2-1（完全失業率）、表3-2（年齢階級別労働力人口比率）",
             "url": "https://www.stat.go.jp/data/roudou/longtime/03roudou.html",
             "files": ["https://www.e-stat.go.jp/stat-search/file-download?statInfId=000001082681&fileKind=0",
                       "https://www.e-stat.go.jp/stat-search/file-download?statInfId=000001082683&fileKind=0"],
             "license": "政府標準利用規約（第2.0版）", "retrieved": c.RETRIEVED},
            {"name": "厚生労働省『職業安定業務統計』一般職業紹介状況 第1表 労働市場関係指標（パートタイムを含む一般）",
             "url": "https://www.e-stat.go.jp/stat-search/file-download?statInfId=000040505312&fileKind=0",
             "license": "政府標準利用規約（第2.0版）", "retrieved": c.RETRIEVED},
            {"name": "厚生労働省『職業安定業務統計』新規学卒者（高校・中学）の職業紹介状況 職業紹介主要指標の推移（2006・2010・2015・2020・2025年分）",
             "url": "https://www.e-stat.go.jp/stat-search/files?toukei=00450222&tstat=000001020421",
             "license": "政府標準利用規約（第2.0版）", "retrieved": c.RETRIEVED},
            {"name": "労働省『労働経済の分析』昭和44年版・昭和48年版（本文中の値）",
             "url": [d["src"] for d in WHITE_PAPER_NEWGRAD.values()],
             "license": "厚生労働省ホームページ（政府標準利用規約に準拠）", "retrieved": c.RETRIEVED},
            {"name": "リクルートワークス研究所『第43回 ワークス大卒求人倍率調査（2027年卒）』計表",
             "url": WORKS_URL,
             "license": "出典を明記すれば転載・加工可（https://www.works-i.com/inquiry/reproduce/）。本データは同調査を加工して作成",
             "retrieved": c.RETRIEVED},
        ],
        "interpolated": {"unemployment": "", "jobOpenings": "", "newGradJobRatio": "", "femaleLaborByAge": ""},
        "estimated": {"unemployment": c.ranges(est_un)},
        "method": [
            "unemployment：1953年以降は労働力調査の年平均（男女計・男・女）。1973年以降は沖縄県を含む（1973年は含む値を採用）。",
            "unemployment：1930〜1952年は比較できる公的な年平均の完全失業率が見つからなかったため、1953年の値（1.9%）で据え置いた推計。"
            "昭和恐慌（1930〜32年）や終戦直後（1945〜49年）の実際の失業は、これよりずっと多かったと考えられる。ゲームでは出来事の記述で補うこと。",
            "jobOpenings：有効求人倍率（パートタイムを含む一般、実数、年平均）。1963年以降のみ。1948〜1962年の参考値は、"
            "JILPT（転載不可）以外に公的な電子データが見つからず、収録していない。1962年以前は新規学卒者を含む別系列であることにも注意。",
            "newGradJobRatio.middle/high：新規学卒者（3月卒）の求人倍率＝求人数÷求職者数。2002年3月卒以降は職業安定業務統計、"
            "1969年・1971年は労働白書の本文の値。白書の値は集計の範囲が後年の統計と同じか未確認。",
            "newGradJobRatio.univ：ワークス大卒求人倍率（大学院生を含む民間企業就職希望者1人あたりの求人数）。年は卒業年（3月卒）。"
            "2021年卒は6月調査の1.53倍（2月調査の1.72倍は参考値）。2026・2027年卒は見込み。",
            "femaleLaborByAge：女性の年齢5歳階級別労働力人口比率（%）。1968年以降、毎年。1973年以降は沖縄県を含む。",
        ],
        "note": "年はすべて暦年。newGradJobRatio は卒業した年（その年の3月卒）。",
    }
    c.write_json("labor.json", {
        "meta": meta,
        "unemployment": un,
        "jobOpenings": jo,
        "newGradJobRatio": {"middle": mid, "high": high, "univ": WORKS_UNIV},
        "femaleLaborByAge": flp,
    })


if __name__ == "__main__":
    main()
