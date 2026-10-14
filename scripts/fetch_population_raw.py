#!/usr/bin/env python3
"""人口・死亡まわりの元データを data/raw/ にダウンロードする。

使い方:  python3 scripts/fetch_population_raw.py
すでにあるファイルは取り直さない（--force で取り直す）。

出典はすべて再配布可の公的統計:
  - e-Stat（政府標準利用規約 第2.0版）
  - 厚生労働省サイト（公共データ利用規約 PDL1.0）
  - 国立社会保障・人口問題研究所サイト（PDL1.0）
JMD・HMD はここではダウンロードしない（値の元にしないため）。
"""
import os
import sys
import time
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "data", "raw")

ESTAT = "https://www.e-stat.go.jp/stat-search/file-download?statInfId={}&fileKind={}"
IPSS_POP = "https://www.ipss.go.jp/syoushika/tohkei/Data/Popular{}/{}"
IPSS_PROJ = "https://www.ipss.go.jp/pp-zenkoku/j/zenkoku2023/db_zenkoku2023/s_tables/{}"
MHLW = "https://www.mhlw.go.jp"

FILES = {}

# --- 社人研 令和5年推計 将来生命表（中位・高位・低位）
for t in ["ATable7", "ATable7B", "ATable7C"]:
    FILES[f"ipss/{t}.xlsx"] = IPSS_PROJ.format(t + ".xlsx")

# --- 社人研 人口統計資料集 2026年版
for t in ["T04-01", "T05-02", "T05-07", "T05-13", "T05-14", "T05-15",
          "T06-04", "T06-12", "T06-23", "T12-02", "T12-27"]:
    FILES[f"ipss_popular/{t}.xlsx"] = IPSS_POP.format(2026, t + ".xlsx")
# 1935-36年（第6回）と1965年（第12回）の5歳ごとの平均余命は、過去の版にだけ載っている
FILES["ipss_popular/old/P2008_T05-14.xls"] = IPSS_POP.format(2008, "T05-14.xls")
FILES["ipss_popular/old/P2025_T05-13.xlsx"] = IPSS_POP.format(2025, "T05-13.xlsx")

# --- 厚労省 令和6年簡易生命表 参考資料2 主な年齢の平均余命の年次推移（1947〜2024年、毎年）
FILES["mhlw/life24-09.pdf"] = MHLW + "/toukei/saikin/hw/life/life24/dl/life24-09.pdf"

# --- 厚労省 都道府県別人口動態統計100年の動向（1899〜1998年）
FILES["mhlw/kjd100/dzen.html"] = MHLW + "/www1/toukei/kjd100_8/dzen.html"
for i in range(1, 48):
    FILES[f"mhlw/kjd100/d{i:02d}.html"] = MHLW + f"/www1/toukei/kjd100_8/d{i:02d}.html"

# --- e-Stat 人口動態統計 上巻 4-3 都道府県別にみた年次別出生数
FILES["estat/vs1999_4-3.csv"] = ESTAT.format("000002627156", 1)   # 平成11年版（1996〜1999年）
FILES["estat/vs2005_4-3.csv"] = ESTAT.format("000002615634", 1)   # 平成17年版（2000〜2005年）

# --- e-Stat 生命表（完全生命表・簡易生命表）
FILES["estat/life_1to17.pdf"] = ESTAT.format("000040015575", 2)   # 第1〜17回（第4・5回だけ文字が読める）
FILES["estat/life18.xls"] = ESTAT.format("000040015574", 0)        # 第18回（1995年）表1〜4
FILES["estat/life19_m.xls"] = ESTAT.format("000040015572", 0)      # 第19回（2000年）男
FILES["estat/life19_f.xls"] = ESTAT.format("000040015573", 0)      # 女
FILES["estat/life20_m.xls"] = ESTAT.format("000008289252", 0)      # 第20回（2005年）
FILES["estat/life20_f.xls"] = ESTAT.format("000008289253", 0)
FILES["estat/life21_m.xls"] = ESTAT.format("000013163375", 0)      # 第21回（2010年）
FILES["estat/life21_f.xls"] = ESTAT.format("000013163374", 0)
FILES["estat/life22_m.xls"] = ESTAT.format("000031543051", 0)      # 第22回（2015年）
FILES["estat/life22_f.xls"] = ESTAT.format("000031543031", 0)
FILES["estat/life23_m.xls"] = ESTAT.format("000032173232", 0)      # 第23回（2020年）
FILES["estat/life23_f.xls"] = ESTAT.format("000032173233", 0)

# 簡易生命表（平成8〜令和元年 = 1996〜2019年）。e-Stat の一覧ページから第1表（男）・第2表（女）を探す
ABRIDGED_TCLASS2 = {
    1996: "000001201350", 1997: "000001201349", 1998: "000001201348", 1999: "000001201347",
    2000: "000001201346", 2001: "000001201345", 2002: "000001201344", 2003: "000001201343",
    2004: "000001201342", 2005: "000001201341", 2006: "000001201340", 2007: "000001060929",
    2008: "000001060946", 2009: "000001060977", 2010: "000001060866", 2011: "000001060928",
    2012: "000001061243", 2013: "000001065637", 2014: "000001074144", 2015: "000001086175",
    2016: "000001104155", 2017: "000001117175", 2018: "000001131664", 2019: "000001142446",
}
ABRIDGED_LIST = ("https://www.e-stat.go.jp/stat-search/files?page=1&toukei=00450012"
                 "&tstat=000001031336&cycle=7&tclass1=000001060976&tclass2={}"
                 "&layout=datalist&tclass3val=0")


def get(url, dest, force=False):
    path = os.path.join(RAW, dest)
    if os.path.exists(path) and os.path.getsize(path) > 0 and not force:
        return path
    os.makedirs(os.path.dirname(path), exist_ok=True)
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (stat-fetch)"})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                data = r.read()
            with open(path, "wb") as f:
                f.write(data)
            print(f"ok   {dest} ({len(data):,} bytes)")
            time.sleep(0.5)
            return path
        except Exception as e:  # noqa
            print(f"retry {dest}: {e}", file=sys.stderr)
            time.sleep(3)
    raise RuntimeError(f"failed: {url}")


def abridged_ids(year, force=False):
    """簡易生命表の一覧ページから、第1表・第2表の statInfId を取り出す。"""
    import html
    import re
    page = get(ABRIDGED_LIST.format(ABRIDGED_TCLASS2[year]), f"estat/lists/abridged_{year}.html", force)
    s = open(page, encoding="utf-8", errors="replace").read()
    out = {}
    for m in re.finditer(r'stat-dataset_list-item">.*?(?=stat-dataset_list-item">|\Z)', s, flags=re.S):
        blk = m.group(0)
        text = html.unescape(re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", blk)))
        text = text.replace("第1表", "第１表").replace("第2表", "第２表")
        ids = re.findall(r"statInfId=(\d+)&(?:amp;)?fileKind=0", blk)
        if not ids:
            continue
        if "第１表" in text and "1" not in out:
            out["1"] = ids[0]
        elif "第２表" in text and "2" not in out:
            out["2"] = ids[0]
    if set(out) != {"1", "2"}:
        raise RuntimeError(f"abridged {year}: tables not found {out}")
    return out


def main():
    force = "--force" in sys.argv
    for dest, url in FILES.items():
        get(url, dest, force)
    for y in sorted(ABRIDGED_TCLASS2):
        ids = abridged_ids(y, force)
        get(ESTAT.format(ids["1"], 0), f"estat/abridged/{y}_m.xls", force)
        get(ESTAT.format(ids["2"], 0), f"estat/abridged/{y}_f.xls", force)
    print("done")


if __name__ == "__main__":
    main()
