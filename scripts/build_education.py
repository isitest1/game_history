"""data/stats/education.json を作る。

出典
- 学校基本調査 年次統計 表4「進学率（昭和23年～）」（文部科学省、e-Stat statInfId=000031852304）
- 1930〜1945年：文部省 "Japan's Growth and Education"（1963年、『日本の成長と教育』英語版）
  Table 5（初等学校卒業者の中等学校進学率、男女別）、Table 8（女子の高等教育在学率）、
  Table 10（同年齢人口に対する高等教育在学率）。mext.go.jp の白書ページの画像表を読み取った値。

実行: python3 scripts/build_education.py
"""
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
import econ_common as c  # noqa: E402

START, END = 1930, 2025

# ---- 戦前・戦中（文部省 1963 "Japan's Growth and Education" の表から読み取り） ----
# Table 5: Percentage of Elementary School Graduates Advancing to Secondary Schools
#   1945年以前は、尋常小学校卒業者のうち旧制中学校・高等女学校（実科を除く）・師範学校第一部の
#   普通課程に進んだ者の割合。実業学校は含まない（＝旧制中等教育全体よりは低い下限値）。
PREWAR_SECONDARY = {  # 年: (男, 女)
    1930: (21.1, 15.5),
    1935: (20.4, 16.5),
    1940: (28.0, 22.0),
    1945: (46.9, 43.6),
}
# Table 10: 同年齢人口に対する高等教育在学率（男女計、大学院を含む）
#   1925: 2.0, 1935: 3.0, 1950: 6.0
# Table 8: 女子の同年齢人口に対する高等教育在学率 1925: 0.3, 1935: 0.5, 1945: 1.2
# 男子 ≒ 2×男女計 − 女子（男女の人口がほぼ同じと仮定）
PREWAR_HIGHER_TOTAL = {1925: 2.0, 1935: 3.0, 1950: 6.0}
PREWAR_HIGHER_FEMALE = {1925: 0.3, 1935: 0.5, 1945: 1.2}


def load_gakko():
    path = c.estat("000031852304", "gakko_nenji_04_shingakuritsu.xlsx")
    df = pd.read_excel(path, header=None)
    rows = {}
    for _, r in df.iterrows():
        try:
            y = int(float(str(r[1]).strip()))  # 年は数値と文字列が混ざっている
        except ValueError:
            continue
        if not 1948 <= y <= 2100:
            continue

        def num(v):
            try:
                return round(float(v), 1)
            except (TypeError, ValueError):
                return None

        rows[y] = {
            # 高等学校等への進学率：計（通信制を含む）を優先、なければ通信制を除く値
            "hs_all": (num(r[5]), num(r[6])),
            "hs_excl": (num(r[8]), num(r[9])),
            "univ": (num(r[20]), num(r[21])),   # 大学（学部）進学率（過年度高卒者等を含む）
            "jc": (num(r[23]), num(r[24])),     # 短期大学（本科）進学率（過年度高卒者等を含む）
        }
    return rows


def fetch_prewar_images():
    """値を読み取った元の表の画像を data/raw/ に保存しておく（目で照合するため）。"""
    base = "https://www.mext.go.jp/b_menu/hakusho/image/hpae196301/"
    for f, what in (("f5048001.gif", "Table5"), ("f5052001.gif", "Table8"), ("f5058001.gif", "Table10")):
        c.download(base + f, f"mext_1963_{what}_{f}")


def main():
    fetch_prewar_images()
    g = load_gakko()
    hs = {"male": {}, "female": {}}
    un = {"male": {}, "female": {}}
    jc = {"male": {}, "female": {}}
    hs_source_all = []
    for y, r in g.items():
        a = r["hs_all"] if r["hs_all"][0] is not None else r["hs_excl"]
        if r["hs_all"][0] is not None:
            hs_source_all.append(y)
        if a[0] is not None:
            hs["male"][y], hs["female"][y] = a
        if r["univ"][0] is not None:
            un["male"][y], un["female"][y] = r["univ"]
        if r["jc"][0] is not None:
            jc["male"][y], jc["female"][y] = r["jc"]

    estimated = {"highSchool": [], "university": [], "juniorCollege": []}

    # 戦前の中等学校進学率（1950年以降は学校基本調査の値を使う）
    for y, (m, f) in PREWAR_SECONDARY.items():
        hs["male"][y], hs["female"][y] = m, f
        estimated["highSchool"].append(y)

    # 戦前の高等教育
    tot1930 = (PREWAR_HIGHER_TOTAL[1925] + PREWAR_HIGHER_TOTAL[1935]) / 2
    fem1930 = (PREWAR_HIGHER_FEMALE[1925] + PREWAR_HIGHER_FEMALE[1935]) / 2
    tot1945 = PREWAR_HIGHER_TOTAL[1935] + (PREWAR_HIGHER_TOTAL[1950] - PREWAR_HIGHER_TOTAL[1935]) * 10 / 15
    prewar_higher = {
        1930: (round(2 * tot1930 - fem1930, 1), round(fem1930, 1)),
        1935: (round(2 * PREWAR_HIGHER_TOTAL[1935] - PREWAR_HIGHER_FEMALE[1935], 1), PREWAR_HIGHER_FEMALE[1935]),
        1945: (round(2 * tot1945 - PREWAR_HIGHER_FEMALE[1945], 1), PREWAR_HIGHER_FEMALE[1945]),
    }
    for y, (m, f) in prewar_higher.items():
        un["male"][y], un["female"][y] = m, f
        estimated["university"].append(y)

    # 短大は1950年に始まった。1949年以前は 0（制度なし）
    for y in range(START, 1950):
        jc["male"][y], jc["female"][y] = 0.0, 0.0
    estimated["juniorCollege"] += list(range(START, 1950))

    interpolated = {}
    out = {}
    for key, src in (("highSchool", hs), ("university", un), ("juniorCollege", jc)):
        m, fm = c.interpolate(src["male"], START, END)
        f, ff = c.interpolate(src["female"], START, END)
        interpolated[key] = c.ranges(sorted(set(fm) | set(ff)))
        out[key] = {y: {"male": m[y], "female": f[y]} for y in range(START, END + 1) if y in m and y in f}
        missing = [y for y in range(START, END + 1) if y not in out[key]]
        assert not missing, (key, missing)

    meta = {
        "title": "進学率（男女別、%）",
        "unit": "%",
        "yearIs": "進学した年（学校基本調査の年度＝その年の3月卒業者の進学先）",
        "sources": [
            {
                "name": "文部科学省『学校基本調査』年次統計 表4 進学率（昭和23年～）",
                "url": "https://www.e-stat.go.jp/stat-search/file-download?statInfId=000031852304&fileKind=0",
                "license": "政府標準利用規約（第2.0版）。出典を記載し、加工して作成",
                "retrieved": c.RETRIEVED,
            },
            {
                "name": "文部省 Japan's Growth and Education（1963年。『日本の成長と教育』英語版）Table 5, 8, 10",
                "url": "https://www.mext.go.jp/b_menu/hakusho/html/hpae196301/hpae196301_2_015.html",
                "license": "文部科学省ホームページ（政府標準利用規約に準拠）。表の画像から数値を読み取った",
                "retrieved": c.RETRIEVED,
            },
        ],
        "definitions": {
            "highSchool": "1950年以降：高等学校等への進学率（中学校卒業者のうち高等学校等の本科・別科、高等専門学校に進学した者の割合）。"
                          f"通信制課程への進学者を含む値（計）がある年（{c.ranges(hs_source_all)}）はそれを、ない年は通信制を除く値を使用。"
                          "1945年以前：尋常小学校卒業者のうち旧制中学校・高等女学校（実科を除く）・師範学校第一部に進学した者の割合（実業学校を含まない）。",
            "university": "1954年以降：大学（学部）進学率（過年度高卒者等を含む。大学入学者÷3年前の中学校卒業者）。"
                          "1945年以前：同年齢人口に対する高等教育（旧制大学・高等学校・専門学校など）在学率。",
            "juniorCollege": "1954年以降：短期大学（本科）進学率（過年度高卒者等を含む）。短大は1950年発足のため1949年以前は0。",
        },
        "interpolated": interpolated,
        "estimated": {k: c.ranges(v) for k, v in estimated.items()},
        "method": [
            "観測のない年は、前後の観測値の間を男女別に直線補間した（interpolated に列挙）。",
            "1930・1935・1940・1945年の highSchool は文部省1963 Table 5 の値（旧制中等学校の一部への進学率。実業学校を含まないため実際の中等教育進学率より低い）。",
            "1930・1935・1945年の university は推計：Table 10（男女計の高等教育在学率）と Table 8（女子）から、男子＝2×男女計−女子として求めた。"
            "1930年は1925年と1935年の平均、1945年の男女計は1935年(3.0)と1950年(6.0)の直線補間。在学率は進学率と定義が違うため近似値。",
            "1946〜1949年の highSchool と 1946〜1953年の university は、旧制から新制への移行期で全国の男女別進学率がないため、前後の値の直線補間。",
            "1950〜1953年の juniorCollege は、1949年=0 と1954年の値の直線補間（推計）。",
        ],
        "note": "1930〜1945年生まれは、旧制中学（12歳で入学）か新制高校（15歳で入学）かが生まれ年で分かれる。"
                "1947年に新制中学、1948年に新制高校、1949年に新制大学が発足した。"
                "ゲームでは highSchool を『義務教育後の中等教育への進学』、university を『高等教育への進学』として扱う。"
                "旧制の高等学校・専門学校・大学は university にまとめた（juniorCollege には入れていない）。"
                "令和7年度（2025年）から大学等進学率の分母に特別支援学校の卒業者を含める変更がある（学校基本調査の注記）。",
    }
    prewar = {
        "note": "旧制中学・高等女学校・旧制高校/大学への進学の扱い",
        "systemBefore1947": "6年制の尋常小学校（義務）→ 12歳で旧制中学校（男子・5年）／高等女学校（女子・4〜5年）／実業学校、"
                            "または高等小学校（2年）。旧制中学の後に旧制高等学校・大学予科（3年）→ 旧制大学（3年）、または専門学校（3年）。",
        "highSchoolMeans": "1945年以前の highSchool は旧制中学校・高等女学校（実科を除く）・師範学校への進学率。実業学校を含まないので、中等教育全体の下限値として扱う。",
        "universityMeans": "1945年以前の university は旧制大学・高等学校・専門学校などの高等教育在学率（同年齢人口比）からの推計。",
        "secondaryAdvancement": {str(y): {"male": m, "female": f} for y, (m, f) in PREWAR_SECONDARY.items()},
        "higherEducationEnrollmentRatio": {"total": {str(k): v for k, v in PREWAR_HIGHER_TOTAL.items()},
                                           "female": {str(k): v for k, v in PREWAR_HIGHER_FEMALE.items()}},
        "transition": {"1947": "新制中学校発足（義務教育9年に）", "1948": "新制高等学校発足", "1949": "新制大学発足", "1950": "短期大学発足"},
        "source": "文部省 Japan's Growth and Education（1963年）Table 5, 8, 10",
    }
    c.write_json("education.json", {"meta": meta, "highSchool": out["highSchool"], "university": out["university"],
                                    "juniorCollege": out["juniorCollege"], "prewar": prewar})


if __name__ == "__main__":
    main()
