"""教育・仕事・お金の統計を加工するスクリプトの共通部品。

- download(): 元データを data/raw/ に保存する（あれば再ダウンロードしない）
- interpolate(): 欠けた年を直線補間し、補間した年の一覧を返す
- write_json(): data/stats/ に JSON を書き出す
"""
import json
import os
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
STATS = ROOT / "data" / "stats"
ESTAT_DL = "https://www.e-stat.go.jp/stat-search/file-download?statInfId={id}&fileKind={kind}"
RETRIEVED = "2026-10-14"


def download(url, name, force=False):
    RAW.mkdir(parents=True, exist_ok=True)
    path = RAW / name
    if path.exists() and path.stat().st_size > 0 and not force:
        return path
    # curl はプロキシと CA の設定を環境変数から読む
    subprocess.run(["curl", "-sSL", "--fail", "-o", str(path), url], check=True)
    return path


def estat(stat_inf_id, name, kind=0):
    return download(ESTAT_DL.format(id=stat_inf_id, kind=kind), name)


def interpolate(series, start, end, ndigits=1):
    """series: {int年: 値}。start〜end の欠けた年を直線補間する。
    範囲の外側（最初の観測より前・最後の観測より後）は補間しない。
    戻り値: (新しい dict, 補間した年のリスト)"""
    years = sorted(y for y, v in series.items() if v is not None)
    out = {y: series[y] for y in years}
    filled = []
    for a, b in zip(years, years[1:]):
        for y in range(a + 1, b):
            if start <= y <= end:
                t = (y - a) / (b - a)
                out[y] = round(series[a] + (series[b] - series[a]) * t, ndigits)
                filled.append(y)
    return dict(sorted(out.items())), filled


def interpolate_geometric(series, start, end, ndigits=3):
    """指数・物価のように比率で動く値を、対数で直線補間する。"""
    import math
    years = sorted(series)
    out = dict(series)
    filled = []
    for a, b in zip(years, years[1:]):
        for y in range(a + 1, b):
            if start <= y <= end:
                t = (y - a) / (b - a)
                out[y] = round(math.exp(math.log(series[a]) + (math.log(series[b]) - math.log(series[a])) * t), ndigits)
                filled.append(y)
    return dict(sorted(out.items())), filled


def ranges(years):
    """[1931,1932,1933,1940] -> "1931-1933, 1940" """
    years = sorted(set(years))
    if not years:
        return ""
    parts, s, p = [], years[0], years[0]
    for y in years[1:]:
        if y == p + 1:
            p = y
            continue
        parts.append(f"{s}" if s == p else f"{s}-{p}")
        s = p = y
    parts.append(f"{s}" if s == p else f"{s}-{p}")
    return ", ".join(parts)


def strkeys(d):
    if isinstance(d, dict):
        return {str(k): strkeys(v) for k, v in d.items()}
    return d


def write_json(name, obj):
    STATS.mkdir(parents=True, exist_ok=True)
    path = STATS / name
    with open(path, "w", encoding="utf-8") as f:
        json.dump(strkeys(obj), f, ensure_ascii=False, indent=1)
        f.write("\n")
    print("wrote", path)
    return path
