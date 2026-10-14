"""data/stats/pension.json を作る。

出典（PDFは data/raw/ に保存。値はPDFの表から転記し、pdftotext があれば照合する）
- 日本年金機構「特別支給の老齢厚生年金の支給開始年齢」 kaishi.pdf
- 厚生労働省「年金制度の仕組みと考え方 第5 公的年金制度の歴史」 000955291.pdf
- 厚生労働省「令和6年度 厚生年金保険・国民年金事業の概況」ほか各年度版（年金局 事業年報の結果の概要）
- 厚生労働省「令和6（2024）年財政検証結果の概要」 001270476.pdf

実行: python3 scripts/build_pension.py
"""
import shutil
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import econ_common as c  # noqa: E402

NENKIN_DL = "https://www.mhlw.go.jp/topics/bukyoku/nenkin/nenkin/toukei/nenpou/2008/dl/"
PDFS = {
    "nenkin_kaishi.pdf": "https://www.nenkin.go.jp/oshirase/taisetu/2012.files/kaishi.pdf",
    "mhlw_nenkin_rekishi.pdf": "https://www.mhlw.go.jp/content/12500000/000955291.pdf",
    "mhlw_zaisei_kensho_2024_gaiyo.pdf": "https://www.mhlw.go.jp/content/001270476.pdf",
    "nenkin_gaiyou_r06.pdf": NENKIN_DL + "gaiyou_r06.pdf",
    "nenkin_gaiyou_r01-2.pdf": NENKIN_DL + "gaiyou_r01-2.pdf",
    "nenkin_gaiyou_h24.pdf": NENKIN_DL + "gaiyou_h24.pdf",
}

# ---- 支給開始年齢（厚生年金。earningsPart=報酬比例部分、flatPart=定額部分） ----
# 1941(女性1946)年4月2日以降：日本年金機構 kaishi.pdf の表
# それより前：男性は60歳（1954年改正で55→60歳へ段階的に引き上げ済み。1930年代生まれの男性は60歳）。
#             女性は1985年改正の経過措置で55歳→60歳へ段階的に引き上げ（下の表。生年月日の区切りは未確認）。
START_AGE = [
    # 男性
    {"from": "1900-01-01", "to": "1941-04-01", "sex": "male", "earningsPart": 60, "flatPart": 60, "verified": "partial"},
    {"from": "1941-04-02", "to": "1943-04-01", "sex": "male", "earningsPart": 60, "flatPart": 61},
    {"from": "1943-04-02", "to": "1945-04-01", "sex": "male", "earningsPart": 60, "flatPart": 62},
    {"from": "1945-04-02", "to": "1947-04-01", "sex": "male", "earningsPart": 60, "flatPart": 63},
    {"from": "1947-04-02", "to": "1949-04-01", "sex": "male", "earningsPart": 60, "flatPart": 64},
    {"from": "1949-04-02", "to": "1953-04-01", "sex": "male", "earningsPart": 60, "flatPart": 65},
    {"from": "1953-04-02", "to": "1955-04-01", "sex": "male", "earningsPart": 61, "flatPart": 65},
    {"from": "1955-04-02", "to": "1957-04-01", "sex": "male", "earningsPart": 62, "flatPart": 65},
    {"from": "1957-04-02", "to": "1959-04-01", "sex": "male", "earningsPart": 63, "flatPart": 65},
    {"from": "1959-04-02", "to": "1961-04-01", "sex": "male", "earningsPart": 64, "flatPart": 65},
    {"from": "1961-04-02", "to": "2099-12-31", "sex": "male", "earningsPart": 65, "flatPart": 65},
    # 女性（1946-04-01以前は1985年改正の経過措置。区切りは未確認）
    {"from": "1900-01-01", "to": "1932-04-01", "sex": "female", "earningsPart": 55, "flatPart": 55, "verified": "yes"},
    {"from": "1932-04-02", "to": "1934-04-01", "sex": "female", "earningsPart": 56, "flatPart": 56, "verified": "yes"},
    {"from": "1934-04-02", "to": "1936-04-01", "sex": "female", "earningsPart": 57, "flatPart": 57, "verified": "yes"},
    {"from": "1936-04-02", "to": "1938-04-01", "sex": "female", "earningsPart": 58, "flatPart": 58, "verified": "yes"},
    {"from": "1938-04-02", "to": "1940-04-01", "sex": "female", "earningsPart": 59, "flatPart": 59, "verified": "yes"},
    {"from": "1940-04-02", "to": "1946-04-01", "sex": "female", "earningsPart": 60, "flatPart": 60, "verified": "partial"},
    {"from": "1946-04-02", "to": "1948-04-01", "sex": "female", "earningsPart": 60, "flatPart": 61},
    {"from": "1948-04-02", "to": "1950-04-01", "sex": "female", "earningsPart": 60, "flatPart": 62},
    {"from": "1950-04-02", "to": "1952-04-01", "sex": "female", "earningsPart": 60, "flatPart": 63},
    {"from": "1952-04-02", "to": "1954-04-01", "sex": "female", "earningsPart": 60, "flatPart": 64},
    {"from": "1954-04-02", "to": "1958-04-01", "sex": "female", "earningsPart": 60, "flatPart": 65},
    {"from": "1958-04-02", "to": "1960-04-01", "sex": "female", "earningsPart": 61, "flatPart": 65},
    {"from": "1960-04-02", "to": "1962-04-01", "sex": "female", "earningsPart": 62, "flatPart": 65},
    {"from": "1962-04-02", "to": "1964-04-01", "sex": "female", "earningsPart": 63, "flatPart": 65},
    {"from": "1964-04-02", "to": "1966-04-01", "sex": "female", "earningsPart": 64, "flatPart": 65},
    {"from": "1966-04-02", "to": "2099-12-31", "sex": "female", "earningsPart": 65, "flatPart": 65},
]

# ---- 老齢年金の平均月額（円、各年度末現在、受給者） ----
# employees：厚生年金保険の老齢年金（基礎年金を含む）。2014年度以前は「厚生年金保険」、2015年度以降は「厚生年金保険（第1号）」
#   2008〜2012年度：平成24年度概況 表24 / 2015〜2019年度：令和元年度概況 表23 / 2020〜2024年度：令和6年度概況 表6
EMPLOYEES = {
    2008: 158806, 2009: 156692, 2010: 153344, 2011: 152396, 2012: 151374,
    2015: 147872, 2016: 147927, 2017: 147051, 2018: 145865, 2019: 146162,
    2020: 146145, 2021: 145665, 2022: 144982, 2023: 147360, 2024: 151142,
}
# national：国民年金の老齢年金（25年以上）受給者
#   2002〜2012年度：平成24年度概況 表52 / 2009〜2019年度：令和元年度概況 表47 / 2020〜2024年度：令和6年度概況 表20
NATIONAL = {
    2002: 52291, 2003: 52314, 2004: 52565, 2005: 53012, 2006: 53249, 2007: 53602, 2008: 53992,
    2009: 54320, 2010: 54596, 2011: 54682, 2012: 54856, 2013: 54622, 2014: 54497, 2015: 55244,
    2016: 55464, 2017: 55615, 2018: 55809, 2019: 56049,
    2020: 56358, 2021: 56479, 2022: 56428, 2023: 57700, 2024: 59431,
}
CHECKS = {  # PDFのテキストに含まれるはずの数字（照合用）
    "nenkin_gaiyou_r06.pdf": ["151,142", "59,431", "146,145"],
    "nenkin_gaiyou_r01-2.pdf": ["147,872", "146,162", "56,049", "54,320"],
    "nenkin_gaiyou_h24.pdf": ["158,806", "151,374", "52,291"],
    "mhlw_zaisei_kensho_2024_gaiyo.pdf": ["57.6", "50.4", "61.2"],
}


def verify():
    if not shutil.which("pdftotext"):
        print("pdftotext がないので照合を省略")
        return
    for name, needles in CHECKS.items():
        txt = subprocess.run(["pdftotext", "-layout", str(c.RAW / name), "-"], capture_output=True, text=True).stdout
        for n in needles:
            assert n in txt, (name, n)
    print("PDFとの照合OK")


def main():
    for name, url in PDFS.items():
        c.download(url, name)
    verify()

    emp, emp_i = c.interpolate(EMPLOYEES, 2008, 2024, ndigits=0)
    emp = {y: int(v) for y, v in emp.items()}

    meta = {
        "title": "公的年金（厚生年金・国民年金）",
        "sources": [
            {"name": "日本年金機構「特別支給の老齢厚生年金の支給開始年齢」", "url": PDFS["nenkin_kaishi.pdf"],
             "license": "日本年金機構ホームページ", "retrieved": c.RETRIEVED},
            {"name": "厚生労働省「年金制度の仕組みと考え方 第5 公的年金制度の歴史」", "url": PDFS["mhlw_nenkin_rekishi.pdf"],
             "license": "厚生労働省ホームページ（PDL1.0／政府標準利用規約準拠）", "retrieved": c.RETRIEVED},
            {"name": "厚生労働省年金局「厚生年金保険・国民年金事業の概況」令和6年度・令和元年度・平成24年度",
             "url": [PDFS["nenkin_gaiyou_r06.pdf"], PDFS["nenkin_gaiyou_r01-2.pdf"], PDFS["nenkin_gaiyou_h24.pdf"]],
             "license": "厚生労働省ホームページ（政府標準利用規約準拠）", "retrieved": c.RETRIEVED},
            {"name": "厚生労働省「令和6（2024）年財政検証結果の概要」", "url": PDFS["mhlw_zaisei_kensho_2024_gaiyo.pdf"],
             "license": "厚生労働省ホームページ（政府標準利用規約準拠）", "retrieved": c.RETRIEVED},
        ],
        "interpolated": {"averageMonthly.employees": c.ranges(emp_i), "averageMonthly.national": ""},
        "method": [
            "startAge：生年月日（from〜to、両端を含む）と性別ごとの厚生年金の支給開始年齢。earningsPart＝報酬比例部分、flatPart＝定額部分。"
            "1941年（女性は1946年）4月2日以降の生まれは日本年金機構の表のとおり。65歳以降は老齢厚生年金＋老齢基礎年金。",
            "averageMonthly：老齢年金受給者の平均年金月額（円、年度末現在、基礎年金を含む）。キーは年度。"
            "employees は厚生年金保険（2015年度以降は第1号＝民間の会社員等。共済を含まない）の『老齢年金』（加入25年以上相当）。"
            "national は国民年金の『老齢年金（25年以上）』。",
            "employees の2013・2014年度は、手元の概況（平成26年度版のPDFは文字を取り出せなかった）に値がなく、前後の年度の直線補間。",
        ],
        "note": "1930〜1940年生まれ：男性は60歳から報酬比例部分と定額部分の両方（特別支給の老齢厚生年金、または旧法の老齢年金）。"
                "女性は1985年改正の経過措置で55歳から60歳へ段階的に引き上げられたが、生年月日の区切り（1932年4月1日以前55歳、以後2年ごとに1歳）は"
                "日本年金機構「年金給付の経過措置一覧」で確認した（2026年10月14日、追加調査 docs/03 の F-8）。"
                "国民年金（老齢基礎年金）は65歳から（1986年4月以降の新法）。1926年4月1日以前生まれは旧法の老齢年金（ゲームの範囲外）。"
                "繰上げ・繰下げ受給、在職老齢年金、加給年金は扱っていない。",
        "unverified": [
            "2007年度以前の厚生年金の平均月額（未収録）",
        ],
    }
    future = {
        "source": "2024年財政検証（令和6年財政検証結果の概要）",
        "url": PDFS["mhlw_zaisei_kensho_2024_gaiyo.pdf"],
        "replacementRate": {
            "growth": {"2024": 61.2, "2037": 57.6},
            "past30": {"2024": 61.2, "2057": 50.4},
        },
        "cases": {
            "growth": "成長型経済移行・継続ケース（実質賃金上昇率1.5%、実質経済成長率 2034年度以降30年平均1.1%）。給付水準の調整終了は2037年度",
            "past30": "過去30年投影ケース（実質賃金上昇率0.5%、実質経済成長率▲0.1%）。報酬比例の調整終了2026年度、基礎年金の調整終了2057年度",
        },
        "modelPension2024": {"replacementRate": 61.2, "basicCoupleMonthly": 134000, "earningsHusbandMonthly": 92000,
                             "activeMaleNetIncomeMonthly": 370000,
                             "note": "2024年度のモデル年金：夫婦2人の基礎年金13.4万円＋夫の厚生年金9.2万円、現役男子の平均手取り37.0万円"},
        "note": "所得代替率＝（夫婦2人の基礎年金＋夫の厚生年金）÷現役男子の平均手取り収入額。値は給付水準調整終了後の新規裁定時のもの。"
                "2024年から調整終了年度までの間の年は、直線で結んで近似してよい。ゲームでは1990〜2005年生まれの年金額を、この2ケースの幅で見せる。"
                "高成長実現ケースは56.9%（2039年度）、1人当たりゼロ成長ケースは国民年金の積立金が2059年度に枯渇し所得代替率37〜33%程度。",
    }
    c.write_json("pension.json", {
        "meta": meta,
        "startAge": START_AGE,
        "nationalPensionStartAge": 65,
        "averageMonthly": {"employees": emp, "national": NATIONAL},
        "future": future,
    })


if __name__ == "__main__":
    main()
