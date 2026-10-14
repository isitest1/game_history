#!/usr/bin/env python3
"""data/stats/ の人口・死亡まわりの JSON の形を確かめる。問題があれば AssertionError で止まる。"""
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
S = os.path.join(ROOT, "data", "stats")


def load(name):
    with open(os.path.join(S, name), encoding="utf-8") as f:
        return json.load(f)


def check_meta(meta, name):
    for k in ("source", "method", "interpolated"):
        assert k in meta, f"{name}: meta.{k} がない"
    assert isinstance(meta["interpolated"], list), name
    for s in meta["source"]:
        assert s.get("title") and s.get("url", "").startswith("https://"), (name, s)


def check_qx_years(years, y0, y1, name):
    assert list(years) == [str(y) for y in range(y0, y1 + 1)], f"{name}: 年の並びが違う"
    for y, rec in years.items():
        assert set(rec) == {"male", "female"}, (name, y)
        for sex, q in rec.items():
            assert len(q) == 106, (name, y, sex, len(q))
            assert all(isinstance(v, (int, float)) and 0 < v <= 1 for v in q), (name, y, sex)
            assert q[105] == 1, (name, y, sex)
            assert all(len(f"{v:.10g}".replace(".", "").replace("-", "").lstrip("0").split("e")[0]) <= 4 for v in q), (name, y, sex)


def main():
    m = load("mortality.json")
    check_meta(m["meta"], "mortality")
    check_qx_years(m["years"], 1930, 2070, "mortality")
    assert set(m["meta"]["interpolated"]) >= {1944, 1945, 1946}

    v = load("mortality_variants.json")
    check_meta(v["meta"], "mortality_variants")
    for k in ("high", "low"):
        check_qx_years(v[k], 2025, 2070, f"variants.{k}")

    b = load("births.json")
    check_meta(b["meta"], "births")
    assert list(b["national"]) == [str(y) for y in range(1925, 2006)]
    for y, r in b["national"].items():
        assert set(r) == {"total", "male", "female"} and abs(r["total"] - r["male"] - r["female"]) <= 50, (y, r)  # 公表値は性別不詳を含む年がある
    assert list(b["prefecture"]) == [str(y) for y in range(1930, 2006)]
    for y, arr in b["prefecture"].items():
        assert len(arr) == 47 and all(isinstance(x, int) and x > 0 for x in arr), y
    assert set(b["meta"]["interpolated"]) >= {1944, 1945, 1946}
    assert "沖縄 1944-1972 推計" in b["meta"]["note"]

    mr = load("marriage.json")
    check_meta(mr["meta"], "marriage")
    assert list(mr["meanFirstMarriageAge"]) == [str(y) for y in range(1930, 2026)]
    for y, r in mr["meanFirstMarriageAge"].items():
        assert 18 < r["male"] < 40 and 18 < r["female"] < 40, y
    for y, r in mr["neverMarriedAt50"].items():
        assert 0 <= r["male"] <= 100 and 0 <= r["female"] <= 100, y
    for y, r in mr["firstMarriageRateByAge"].items():
        assert set(r) == {"male", "female"} and "20-24" in r["male"], y

    sr = load("sexratio.json")
    check_meta(sr["meta"], "sexratio")
    assert list(sr["years"]) == [str(y) for y in range(1925, 2006)]
    assert all(100 < x < 110 for x in sr["years"].values())
    print("OK: mortality.json, mortality_variants.json, births.json, marriage.json, sexratio.json")


if __name__ == "__main__":
    main()
