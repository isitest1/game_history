"""教育・仕事・お金の統計をまとめて作り、形を検証する。

実行: python3 scripts/build_economy_all.py          # ダウンロード（data/raw/ にないものだけ）→ JSON 出力 → 検証
      python3 scripts/build_economy_all.py --check  # 検証だけ
"""
import json
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
STATS = HERE.parent / "data" / "stats"
ORDER = ["build_education.py", "build_labor.py", "build_cpi.py", "build_wages.py", "build_pension.py", "build_prices.py"]
YEARS = [str(y) for y in range(1930, 2026)]


def load(name):
    return json.loads((STATS / name).read_text(encoding="utf-8"))


def num(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def check():
    e = load("education.json")
    for k in ("highSchool", "university", "juniorCollege"):
        assert list(e[k]) == YEARS, k
        for y, v in e[k].items():
            assert set(v) == {"male", "female"} and all(num(x) and 0 <= x <= 100 for x in v.values()), (k, y, v)
    assert "note" in e["prewar"] and "interpolated" in e["meta"]

    lab = load("labor.json")
    assert list(lab["unemployment"]) == YEARS
    for y, v in lab["unemployment"].items():
        assert set(v) == {"total", "male", "female"} and all(num(x) and 0 <= x < 20 for x in v.values()), (y, v)
    assert all(num(v) and 0 < v < 10 for v in lab["jobOpenings"].values())
    assert set(lab["newGradJobRatio"]) == {"middle", "high", "univ"}
    for k, d in lab["newGradJobRatio"].items():
        assert d and all(num(v) and 0 < v < 20 for v in d.values()), k
    for y, d in lab["femaleLaborByAge"].items():
        assert all(num(v) and 0 <= v <= 100 for v in d.values()) and "25-29" in d, y

    w = load("wages.json")
    assert list(w["annualIncomeIndex"]) == YEARS and w["annualIncomeIndex"]["2020"] == 100.0
    assert all(num(v) and v > 0 for v in w["annualIncomeIndex"].values())
    need = ["20-24", "25-29", "30-34", "35-39", "40-44", "45-49", "50-54", "55-59", "60-64"]
    for yr, p in w["profile"].items():
        for sex in ("male", "female"):
            assert set(p[sex]) == {"middle", "high", "junior", "univ"}, (yr, sex)
            for edu, d in p[sex].items():
                assert all(a in d and num(d[a]) and 50 < d[a] < 2000 for a in need), (yr, sex, edu)

    p = load("pension.json")
    for r in p["startAge"]:
        assert {"from", "to", "sex", "earningsPart", "flatPart"} <= set(r) and r["sex"] in ("male", "female")
    for sex in ("male", "female"):  # 1900〜2099年を隙間なく覆うか
        rows = sorted((r for r in p["startAge"] if r["sex"] == sex), key=lambda r: r["from"])
        assert rows[0]["from"] <= "1930-01-01" and rows[-1]["to"] >= "2005-12-31"
    assert p["nationalPensionStartAge"] == 65
    assert p["averageMonthly"]["employees"]["2024"] == 151142
    assert p["future"]["replacementRate"]["growth"]["2037"] == 57.6
    assert p["future"]["replacementRate"]["past30"]["2057"] == 50.4

    cpi = load("cpi.json")
    assert list(cpi["years"]) == YEARS and cpi["years"]["2020"] == 100.0
    assert all(num(v) and v > 0 for v in cpi["years"].values())

    pr = load("prices.json")
    for k, it in pr["items"].items():
        assert {"label", "unit", "years"} <= set(it) and it["years"], k

    for name in ("education.json", "labor.json", "wages.json", "pension.json", "cpi.json", "prices.json"):
        m = load(name)["meta"]
        assert "sources" in m and "interpolated" in m and "method" in m, name
    print("検証OK：education / labor / wages / pension / cpi / prices")


def main():
    if "--check" not in sys.argv:
        for s in ORDER:
            subprocess.run([sys.executable, str(HERE / s)], check=True)
    check()


if __name__ == "__main__":
    main()
