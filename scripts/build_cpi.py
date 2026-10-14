"""data/stats/cpi.json を作る（消費者物価指数、2020年=100、年平均、1930〜2025年）。

出典
- 総務省統計局『消費者物価指数』2020年基準 長期時系列（e-Stat）
  - 中分類指数（全国、1970年〜）の「総合」
  - 持家の帰属家賃を除く総合指数（全国、1947年〜）
- 1946年以前：公的な電子データが見つからないため推計（下の PREWAR_* を参照）

実行: python3 scripts/build_cpi.py
"""
import csv
import io
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import econ_common as c  # noqa: E402

START, END = 1930, 2025

# 戦前基準（1934〜36年平均=1）の東京都区部消費者物価指数の1947年値。
# 総務省統計局『消費者物価指数年報』に収録（統計局FAQ 17A-Q07）。紙の年報で、今回は数値を確認できなかった。
# 一般に約110倍とされる値を「未確認の仮置き」として使う。確認できたらここを直す。
PREWAR_1947_MULTIPLE = 109.1  # 未確認
PREWAR_FLAT_UNTIL = 1936      # 1930〜1936年は1934〜36年平均と同じ水準で据え置く（推計）


def read_estat_csv(path):
    raw = Path(path).read_bytes().decode("cp932")
    rows = list(csv.reader(io.StringIO(raw)))
    header = rows[0]
    data = {}
    for r in rows:
        if not r or not r[0].strip().isdigit():
            continue
        y = int(r[0].strip())
        data[y] = r[1:]
    return header[1:], data


def main():
    h_all, d_all = read_estat_csv(c.estat("000032103936", "cpi2020_chubunrui_A.csv", kind=1))
    h_x, d_x = read_estat_csv(c.estat("000032103937", "cpi2020_kijo_excl_imputedrent_A.csv", kind=1))
    i_total = h_all.index("総合")
    total = {y: float(v[i_total]) for y, v in d_all.items() if v[i_total].strip()}
    excl = {y: float(v[0]) for y, v in d_x.items() if v and v[0].strip()}

    years = {}
    for y, v in total.items():
        years[y] = round(v, 1)
    link = total[1970] / excl[1970]
    linked = []
    for y, v in excl.items():
        if y < 1970:
            years[y] = round(v * link, 2)
            linked.append(y)

    # 1946年以前の推計
    base_prewar = years[1947] / PREWAR_1947_MULTIPLE  # 1934〜36年平均の水準（2020年=100）
    est = {}
    for y in range(START, PREWAR_FLAT_UNTIL + 1):
        est[y] = base_prewar
    filled, filled_years = c.interpolate_geometric({PREWAR_FLAT_UNTIL: base_prewar, 1947: years[1947]},
                                                   PREWAR_FLAT_UNTIL + 1, 1946, ndigits=6)
    for y in filled_years:
        est[y] = filled[y]
    for y, v in est.items():
        years[y] = float(f"{v:.3g}")

    out = {y: years[y] for y in range(START, END + 1)}
    assert len(out) == END - START + 1

    meta = {
        "title": "消費者物価指数（全国、総合、年平均）",
        "unit": "指数（2020年=100）",
        "sources": [
            {"name": "総務省統計局『2020年基準消費者物価指数』長期時系列データ 中分類指数（全国、1970年〜）",
             "url": "https://www.e-stat.go.jp/stat-search/file-download?statInfId=000032103936&fileKind=1",
             "license": "政府標準利用規約（第2.0版）", "retrieved": c.RETRIEVED},
            {"name": "同 持家の帰属家賃を除く総合指数（全国、1947年〜）",
             "url": "https://www.e-stat.go.jp/stat-search/file-download?statInfId=000032103937&fileKind=1",
             "license": "政府標準利用規約（第2.0版）", "retrieved": c.RETRIEVED},
        ],
        "interpolated": c.ranges(filled_years),
        "estimated": c.ranges(list(est)),
        "linked": c.ranges(linked),
        "method": [
            "1970〜2025年：全国・総合の年平均（2020年基準）をそのまま使用。",
            f"1947〜1969年：全国の『持家の帰属家賃を除く総合』に、1970年の総合との比（{link:.4f}）を掛けてつないだ。",
            f"1930〜{PREWAR_FLAT_UNTIL}年（推計）：戦前基準（1934〜36年平均=1）の東京都区部消費者物価指数の1947年値を"
            f"{PREWAR_1947_MULTIPLE}（未確認の仮置き）とし、1947年の値÷{PREWAR_1947_MULTIPLE}を1934〜36年の水準として据え置いた。"
            "昭和恐慌期（1930〜32年）の物価下落は反映していない。",
            f"{PREWAR_FLAT_UNTIL + 1}〜1946年（推計・補間）：{PREWAR_FLAT_UNTIL}年と1947年の間を対数で直線補間した。"
            "実際には1945〜47年に急激なインフレがあり、1940年代前半の物価はこの補間値より低く、1946年はより高かったと考えられる。",
        ],
        "unverified": [
            f"戦前基準の1947年値（{PREWAR_1947_MULTIPLE}）。総務省『消費者物価指数年報』（紙）で確認が必要。",
        ],
        "note": "1946年以前の値は物の値段の目安として使い、生涯年収などの換算に使うときは幅を持たせること。1972年以前は沖縄県を含まない。",
    }
    c.write_json("cpi.json", {"meta": meta, "years": out})


if __name__ == "__main__":
    main()
