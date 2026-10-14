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

# 経済企画庁『昭和29年度 年次経済報告』（経済白書）第2部 消費・家計の節：
#  「本年４月における消費者物価は朝鮮動乱直前に比し、４６％高、戦前（昭和９～１１年）の３０４倍となっている」
#  https://www5.cao.go.jp/keizai3/keizaiwp/wp-je54/wp-je54-021002.html
# この「1954年4月＝1934〜36年平均の304倍」を、1954年の年平均にあてはめて戦前の水準を求める（近似）。
ANCHOR_YEAR = 1954
ANCHOR_MULTIPLE = 304
ANCHOR_URL = "https://www5.cao.go.jp/keizai3/keizaiwp/wp-je54/wp-je54-021002.html"
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
    base_prewar = years[ANCHOR_YEAR] / ANCHOR_MULTIPLE  # 1934〜36年平均の水準（2020年=100）
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
            {"name": "経済企画庁『昭和29年 年次経済報告』（消費者物価は戦前（昭和9〜11年）の304倍）",
             "url": ANCHOR_URL,
             "license": "内閣府ホームページ（政府標準利用規約に準拠）", "retrieved": c.RETRIEVED},
        ],
        "interpolated": c.ranges(filled_years),
        "estimated": c.ranges(list(est)),
        "linked": c.ranges(linked),
        "method": [
            "1970〜2025年：全国・総合の年平均（2020年基準）をそのまま使用。",
            f"1947〜1969年：全国の『持家の帰属家賃を除く総合』に、1970年の総合との比（{link:.4f}）を掛けてつないだ。",
            f"1930〜{PREWAR_FLAT_UNTIL}年（推計）：1954年の経済白書の『1954年4月の消費者物価は戦前（昭和9〜11年）の{ANCHOR_MULTIPLE}倍』を使い、"
            f"{ANCHOR_YEAR}年の年平均÷{ANCHOR_MULTIPLE}を1934〜36年平均の水準とみなして据え置いた（4月の値を年平均に、白書の系列を全国系列に当てはめた近似）。"
            "昭和恐慌期（1930〜32年）の物価下落は反映していない。",
            f"{PREWAR_FLAT_UNTIL + 1}〜1946年（推計・補間）：{PREWAR_FLAT_UNTIL}年と1947年の間を対数で直線補間した。"
            "実際には1945〜47年に急激なインフレがあり、1940年代前半の物価はこの補間値より低く、1946年はより高かったと考えられる。",
        ],
        "unverified": [
            "1937〜1946年の年ごとの動き（公的な年次の電子データが見つからなかった）。"
            "総務省『消費者物価指数年報』（紙）の戦前基準指数（東京都区部、1947年〜）や日本銀行の戦前基準指数で確認するとよい。",
        ],
        "note": "1946年以前の値は物の値段の目安として使い、生涯年収などの換算に使うときは幅を持たせること。1972年以前は沖縄県を含まない。",
    }
    c.write_json("cpi.json", {"meta": meta, "years": out})


if __name__ == "__main__":
    main()
