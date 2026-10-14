#!/usr/bin/env python3
"""出生数（全国・都道府県）と出生性比を作る。

出力: data/stats/births.json, data/stats/sexratio.json
入力: data/raw/（scripts/fetch_population_raw.py で取得）
"""
import json
import math
import os
import re

import numpy as np
import pandas as pd

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "data", "raw")
OUT = os.path.join(ROOT, "data", "stats")

PREFS = ["北海道", "青森", "岩手", "宮城", "秋田", "山形", "福島", "茨城", "栃木", "群馬", "埼玉", "千葉",
         "東京", "神奈川", "新潟", "富山", "石川", "福井", "山梨", "長野", "岐阜", "静岡", "愛知", "三重",
         "滋賀", "京都", "大阪", "兵庫", "奈良", "和歌山", "鳥取", "島根", "岡山", "広島", "山口", "徳島",
         "香川", "愛媛", "高知", "福岡", "佐賀", "長崎", "熊本", "大分", "宮崎", "鹿児島", "沖縄"]
GAP = (1944, 1945, 1946)


def num(s):
    s = str(s).replace(" ", "").replace(",", "").replace("　", "")
    return int(s) if re.fullmatch(r"\d+", s) else None


def read_national():
    """社人研 表4-1★ 性別出生数: {year: (total, male, female)}"""
    v = pd.read_excel(os.path.join(RAW, "ipss_popular", "T04-01.xlsx"), sheet_name="T04-01★", header=None).values
    out = {}
    for r in v:
        for off in (0, 5):
            y = r[off]
            if isinstance(y, (int, float)) and not math.isnan(float(y)) and 1800 < y < 2100:
                out[int(y)] = (int(r[off + 1]), int(r[off + 2]), int(r[off + 3]))
    return out


def read_kjd100(i):
    """厚労省「都道府県別人口動態統計100年の動向」: {year: births or None}"""
    s = open(os.path.join(RAW, "mhlw", "kjd100", f"d{i:02d}.html"), "rb").read().decode("cp932", "replace")
    out = {}
    prev = None
    for r in re.findall(r"<tr[^>]*>(.*?)</tr>", s, flags=re.S | re.I):
        cells = [re.sub(r"<[^>]+>|&nbsp;", "", c).strip()
                 for c in re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", r, flags=re.S | re.I)]
        if len(cells) < 3 or not re.fullmatch(r"\d{2}|\d{4}", cells[0]):
            continue
        y = int(cells[0])
        if y < 100:
            y = (prev // 100) * 100 + y
            if y < prev:
                y += 100
        prev = y
        out[y] = num(cells[2])
    assert out and min(out) == 1899 and max(out) == 1998, (i, min(out), max(out))
    return out


def read_estat_43(path):
    """e-Stat 人口動態統計 上巻 4-3 都道府県別にみた年次別出生数（CSV）: {year: [47]}"""
    raw = open(path, "rb").read().decode("cp932", "replace")
    lines = [l.split(",") for l in raw.splitlines()]
    hdr = next(l for l in lines if len(l) > 5 and l[1].strip() == "1935")
    years = [int(x) for x in hdr[1:] if x.strip()]
    out = {y: [None] * 47 for y in years}
    for l in lines:
        m = re.match(r"^[０-９]{2}", l[0].strip())
        if not m:
            continue
        code = int(l[0].strip()[:2].translate(str.maketrans("０１２３４５６７８９", "0123456789")))
        for y, cell in zip(years, l[1:]):
            out[y][code - 1] = num(cell)
    return out


def read_pref_pop():
    """社人研 表12-2 都道府県別人口（千人、国勢調査）: {year: {pref: pop}}"""
    v = pd.read_excel(os.path.join(RAW, "ipss_popular", "T12-02.xlsx"), header=None).values
    hdr = [str(x) for x in v[2]]
    years = {}
    for j, h in enumerate(hdr):
        m = re.match(r"(\d{4})", h)
        if m:
            years[j] = int(m.group(1))
    out = {}
    for r in v[3:]:
        name = str(r[0]).strip()
        if name in PREFS or name == "全国":
            for j, y in years.items():
                val = r[j]
                out.setdefault(y, {})[name] = float(val) if isinstance(val, (int, float)) else None
    return out


def main():
    os.makedirs(OUT, exist_ok=True)
    nat = read_national()
    interpolated = []

    # ---- 全国 1925〜2005
    national = {}
    for y in range(1925, 2006):
        if y in nat:
            t, m, f = nat[y]
        else:
            assert y in GAP
            w = (y - 1943) / 4
            m = round((1 - w) * nat[1943][1] + w * nat[1947][1])
            f = round((1 - w) * nat[1943][2] + w * nat[1947][2])
            t = m + f
            interpolated.append(f"national {y}")
        national[str(y)] = {"total": t, "male": m, "female": f}

    # ---- 都道府県 1930〜2005
    kjd = [read_kjd100(i) for i in range(1, 48)]
    e99 = read_estat_43(os.path.join(RAW, "estat", "vs1999_4-3.csv"))
    e05 = read_estat_43(os.path.join(RAW, "estat", "vs2005_4-3.csv"))
    # 重なる年（1995年）で厚労省100年の動向と e-Stat が一致するか確かめる
    diff95 = max(abs(kjd[i][1995] - e99[1995][i]) for i in range(47))
    pref = {}
    for y in range(1930, 2006):
        if y <= 1998:
            vals = [kjd[i].get(y) for i in range(47)]
        elif y == 1999:
            vals = list(e99[1999])
        else:
            vals = list(e05[y])
        pref[y] = vals
    # 1944〜1946年: 1943年と1947年の直線補間（沖縄は下で別に推計）
    for y in GAP:
        w = (y - 1943) / 4
        pref[y] = [None if i == 46 else round((1 - w) * pref[1943][i] + w * pref[1947][i]) for i in range(47)]
    interpolated.append("prefecture 1944-1946（全都道府県）")

    # ---- 沖縄 1944〜1972 の推計
    # 沖縄の出生数 = 全国（沖縄を除く）の出生数 × 沖縄の人口 / 全国（沖縄を除く）の人口 × 出生率の比
    # 出生率の比（沖縄の普通出生率 / 全国の普通出生率）は 1943年と1973年の値の間を直線補間
    pop = read_pref_pop()
    oki_pop = {y: pop[y]["沖縄"] for y in pop if pop[y].get("沖縄")}
    oki_pop[1950] = oki_pop[1950] - 216.110  # 1950年は奄美群島（216,110人）を含むので除く
    nat_pop = {}
    for y in pop:
        if pop[y].get("全国"):
            nat_pop[y] = pop[y]["全国"] - (pop[y].get("沖縄") or 0) if y != 1947 else pop[y]["全国"]
    nat_pop[1950] = pop[1950]["全国"] - pop[1950]["沖縄"]  # 奄美は全国に含まれ鹿児島に含まれない→沖縄分ごと除いて本土の人口とする

    def interp_log(d, y):
        ks = sorted(d)
        return float(np.exp(np.interp(y, ks, [math.log(d[k]) for k in ks])))

    def nat_births_ex_oki(y):
        tot = nat[y][0] if y in nat else national[str(y)]["total"]
        if y >= 1973 or y <= 1943:
            return tot - pref[y][46]
        return tot  # 1944〜72年の全国の値は沖縄を含まない

    def crude_ratio(y):
        ob = pref[y][46]
        return (ob / interp_log(oki_pop, y)) / (nat_births_ex_oki(y) / interp_log(nat_pop, y))

    r43, r73 = crude_ratio(1943), crude_ratio(1973)
    oki_est = {}
    for y in range(1944, 1973):
        w = (y - 1943) / 30
        ratio = (1 - w) * r43 + w * r73
        nb = national[str(y)]["total"]  # 沖縄を含まない
        oki_est[y] = round(nb * interp_log(oki_pop, y) / interp_log(nat_pop, y) * ratio)
        pref[y][46] = oki_est[y]
    interpolated.append("prefecture 沖縄 1944-1972（推計）")

    for y, vals in pref.items():
        assert all(isinstance(v, int) and v > 0 for v in vals), (y, vals)

    meta = {
        "source": [
            {"title": "国立社会保障・人口問題研究所『人口統計資料集』2026年版 表4-1 性別出生数および出生性比（厚生労働省『人口動態統計』による）",
             "url": "https://www.ipss.go.jp/syoushika/tohkei/Data/Popular2026/T04-01.xlsx"},
            {"title": "厚生労働省「都道府県別人口動態統計100年の動向」（1899〜1998年）",
             "url": "https://www.mhlw.go.jp/www1/toukei/kjd100_8/"},
            {"title": "厚生労働省「人口動態統計」平成11年 上巻 第4.3表 都道府県別にみた年次別出生数（e-Stat）",
             "url": "https://www.e-stat.go.jp/stat-search/file-download?statInfId=000002627156&fileKind=1"},
            {"title": "厚生労働省「人口動態統計」平成17年 上巻 第4.3表 都道府県別にみた年次別出生数（e-Stat）",
             "url": "https://www.e-stat.go.jp/stat-search/file-download?statInfId=000002615634&fileKind=1"},
            {"title": "国立社会保障・人口問題研究所『人口統計資料集』2026年版 表12-2 都道府県別人口（沖縄の推計に使用）",
             "url": "https://www.ipss.go.jp/syoushika/tohkei/Data/Popular2026/T12-02.xlsx"},
        ],
        "license": "e-Stat: 政府標準利用規約（第2.0版）、厚生労働省・社人研サイト: 公共データ利用規約（PDL1.0）。CC BY 4.0 互換。加工して作成。",
        "unit": "人（出生数）",
        "national_range": "1925〜2005年。男女別あり",
        "prefecture_range": "1930〜2005年。JIS順（北海道=0 … 沖縄=46）の47個。男女別なし",
        "prefectures": PREFS,
        "method": (
            "全国は人口動態統計の出生数。1944〜1946年は統計が欠けているため、男女それぞれ1943年と1947年の直線補間（total=male+female）。"
            "都道府県は1930〜1998年が厚労省「100年の動向」、1999年が平成11年、2000〜2005年が平成17年の人口動態統計上巻4.3表。"
            "1944〜1946年は各都道府県とも1943年と1947年の直線補間。"
            f"沖縄の1944〜1972年は、全国（沖縄を除く）の出生数×沖縄の人口/全国（沖縄を除く）の人口×出生率の比で推計した。"
            f"人口は国勢調査（1940・1950・1955・1960・1965・1970・1975年、沖縄は琉球政府の国勢調査。1950年は奄美群島を除いた）を対数で補間、"
            f"出生率の比（沖縄の普通出生率/全国の普通出生率）は1943年の{r43:.3f}と1973年の{r73:.3f}の間を直線補間した。"
        ),
        # 年の数値は全国・全都道府県の補間年。最後の文字列は沖縄だけの推計範囲（指示により interpolated にも明記）
        "interpolated": [1944, 1945, 1946, "沖縄 1944-1972 推計"],
        "interpolated_detail": interpolated,
        "estimated": {"沖縄": list(range(1944, 1973))},
        "note": (
            "1944〜1946年は全国・都道府県とも補間値（実際の出生数は戦争の影響でこれより少なかった可能性が高い。未確認）。"
            "全国の1947〜1972年は沖縄県を含まない（公表値どおり）。都道府県の沖縄 1944-1972 推計（琉球政府の出生統計は未取得のため人口と出生率の比から推計。0にはしていない）。"
            "数え方は年によって違う（1935・1947年は事件発生地、1950年は母の住所地、1955年以降は子の住所地。e-Stat 4.3表の注による）。"
            f"重なる1995年で、100年の動向と平成11年4.3表の差は最大{diff95}人。"
            "全国の total は公表値のままで、1926・1930・1935年は male+female と1人違う（性別不詳と思われる。未確認）。"
            "都道府県の合計は全国と一致しないことがある（住所不詳・外国など）。"
        ),
    }
    births = {"meta": meta, "national": national,
              "prefecture": {str(y): pref[y] for y in range(1930, 2006)}}
    with open(os.path.join(OUT, "births.json"), "w", encoding="utf-8") as f:
        json.dump(births, f, ensure_ascii=False, separators=(",", ":"))

    # ---- 出生性比
    sr = {}
    for y in range(1925, 2006):
        n = national[str(y)]
        sr[str(y)] = round(100 * n["male"] / n["female"], 1)
    smeta = {
        "source": meta["source"][:1],
        "license": meta["license"],
        "unit": "女100に対する男の出生数",
        "method": "births.json の全国の男女別出生数から計算（小数1桁）。",
        "interpolated": [1944, 1945, 1946],
        "note": "1944〜1946年は男女別出生数の補間値から計算。1947〜1972年は沖縄県を含まない。1966年（丙午）は107.6と高い。",
    }
    with open(os.path.join(OUT, "sexratio.json"), "w", encoding="utf-8") as f:
        json.dump({"meta": smeta, "years": sr}, f, ensure_ascii=False, separators=(",", ":"))

    print("diff1995", diff95, "r43", r43, "r73", r73)
    print("okinawa est", {y: oki_est[y] for y in (1944, 1945, 1950, 1955, 1960, 1965, 1970, 1972)})
    for y in (1930, 1943, 1945, 1947, 1960, 1973, 1998, 1999, 2000, 2005):
        print(y, sum(pref[y]), national[str(y)]["total"])


if __name__ == "__main__":
    main()
