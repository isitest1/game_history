# 人口・死亡まわりの統計の出典

- 取得日：2026年10月14日
- 作り方：`python3 scripts/fetch_population_raw.py`（元データを `data/raw/` に取得。`data/raw/` はコミットしない）→ `python3 scripts/build_mortality.py` → `python3 scripts/build_births.py` → `python3 scripts/build_marriage.py` → `python3 scripts/validate_population_stats.py`（形の検証）
- 必要なもの：Python 3、pandas、openpyxl、xlrd、numpy、pdfplumber、`pdftotext`（poppler-utils。第5回生命表のPDFの文字を読むのに使う）
- 利用規約：e-Stat は[政府標準利用規約（第2.0版）](https://www.e-stat.go.jp/terms-of-use)、厚生労働省・国立社会保障・人口問題研究所（社人研）のサイトは[公共データ利用規約（PDL1.0）](https://www.digital.go.jp/resources/open_data/public_data_license_v1.0)。どちらもCC BY 4.0互換で、出典を書き、加工した旨を書けば再配布と商用利用ができる。`data/stats/` のファイルはすべて下の出典を加工して作ったもの
- 使っていないもの：日本版死亡データベース（JMD）と Human Mortality Database の数値は出力に入れていない。JMD は `README_mortality.md` の照合（誤差の統計）にだけ使った

## 出典の一覧

| # | 統計名 | URL | 規約 | どのファイルのどの値に使ったか |
|---|---|---|---|---|
| 1 | 社人研『日本の将来推計人口（令和5年推計）』仮定値表7（男女年齢別将来生命表 中位） | https://www.ipss.go.jp/pp-zenkoku/j/zenkoku2023/db_zenkoku2023/s_tables/ATable7.xlsx | PDL1.0 | mortality.json 2020〜2070年の qx |
| 2 | 同 仮定値表7B（死亡高位）・7C（死亡低位） | https://www.ipss.go.jp/pp-zenkoku/j/zenkoku2023/db_zenkoku2023/s_tables/ATable7B.xlsx ・ ATable7C.xlsx | PDL1.0 | mortality_variants.json の high・low（2025〜2070年） |
| 3 | 厚労省「第1〜17回生命表」（e-Stat、PDF。第5回 1926〜30年の各歳の表だけ文字として読める） | https://www.e-stat.go.jp/stat-search/file-download?statInfId=000040015575&fileKind=2 | 政府標準利用規約2.0 | mortality.json 1930〜1994年の推計の基準（1928年＝第5回の中央） |
| 4 | 厚労省「第18〜22回完全生命表」（e-Stat、Excel） | https://www.e-stat.go.jp/stat-search/files?toukei=00450012&tstat=000001031336 （statInfId 000040015574, 000040015572/3, 000008289252/3, 000013163375/4, 000031543051/31） | 政府標準利用規約2.0 | mortality.json 1995・2000・2005・2010・2015年の qx。1995年は推計の基準にも使用 |
| 5 | 厚労省「簡易生命表」平成8年〜令和元年（e-Stat、Excel、第1表 男・第2表 女） | 同上（各年の一覧ページから取得） | 政府標準利用規約2.0 | mortality.json 1996〜2019年（完全生命表の年を除く）の qx |
| 6 | 厚労省「令和6年簡易生命表」参考資料2 主な年齢の平均余命の年次推移（1947〜2024年） | https://www.mhlw.go.jp/toukei/saikin/hw/life/life24/dl/life24-09.pdf | PDL1.0 | mortality.json 1947〜1994年の調整の目標（0・20・40・65・75歳の平均余命）。README の照合表 |
| 7 | 社人研『人口統計資料集』2008年版 表5-14、2025年版 表5-13（年齢5歳階級別平均余命） | https://www.ipss.go.jp/syoushika/tohkei/Data/Popular2008/T05-14.xls ・ https://www.ipss.go.jp/syoushika/tohkei/Data/Popular2025/T05-13.xlsx | PDL1.0 | mortality.json 1935-36・1947・1950-52・1960・1965・1970・1980・1990年の完全生命表の復元の目標（e0〜e100）。2000〜2010年は方法の検証 |
| 8 | 社人研『人口統計資料集』2026年版 表5-2（性別乳児死亡数） | https://www.ipss.go.jp/syoushika/tohkei/Data/Popular2026/T05-02.xlsx | PDL1.0 | mortality.json 1930〜1994年の0歳の死亡確率の目標（性別乳児死亡率） |
| 9 | 社人研『人口統計資料集』2026年版 表4-1（性別出生数および出生性比、1873〜2024年） | https://www.ipss.go.jp/syoushika/tohkei/Data/Popular2026/T04-01.xlsx | PDL1.0 | births.json national（1925〜2005年）、sexratio.json、乳児死亡率の分母 |
| 10 | 厚労省「都道府県別人口動態統計100年の動向」（1899〜1998年） | https://www.mhlw.go.jp/www1/toukei/kjd100_8/ （d01.html〜d47.html） | PDL1.0 | births.json prefecture 1930〜1998年 |
| 11 | 厚労省「人口動態統計」平成11年 上巻 第4.3表 都道府県別にみた年次別出生数（e-Stat、CSV） | https://www.e-stat.go.jp/stat-search/file-download?statInfId=000002627156&fileKind=1 | 政府標準利用規約2.0 | births.json prefecture 1999年（1995年で #10 と一致することを確認） |
| 12 | 厚労省「人口動態統計」平成17年 上巻 第4.3表（e-Stat、CSV） | https://www.e-stat.go.jp/stat-search/file-download?statInfId=000002615634&fileKind=1 | 政府標準利用規約2.0 | births.json prefecture 2000〜2005年 |
| 13 | 社人研『人口統計資料集』2026年版 表12-2（都道府県別人口、国勢調査。沖縄は琉球政府の国勢調査） | https://www.ipss.go.jp/syoushika/tohkei/Data/Popular2026/T12-02.xlsx | PDL1.0 | births.json 沖縄 1944〜1972年の推計 |
| 14 | 社人研『人口統計資料集』2026年版 表6-12（全婚姻および初婚の平均婚姻年齢） | https://www.ipss.go.jp/syoushika/tohkei/Data/Popular2026/T06-12.xlsx | PDL1.0 | marriage.json meanFirstMarriageAge |
| 15 | 同 表6-23（性別50歳時の未婚割合など、国勢調査から算出） | https://www.ipss.go.jp/syoushika/tohkei/Data/Popular2026/T06-23.xlsx | PDL1.0 | marriage.json neverMarriedAt50 |
| 16 | 同 表6-4（性，年齢5歳階級別初婚率）2026年版と2012年版 | https://www.ipss.go.jp/syoushika/tohkei/Data/Popular2026/T06-04.xlsx ・ https://www.ipss.go.jp/syoushika/tohkei/Data/Popular2012/T06-04.xls | PDL1.0 | marriage.json firstMarriageRateByAge（2012年版は1960・2005年の列だけ） |
| 照合のみ | 日本版死亡データベース（JMD）ver.005_002 全国 1x1 生命表 | https://www.ipss.go.jp/p-toukei/JMD/00/ | 再配布の条件は明記なし | 数値は出力に使わない。README_mortality.md の誤差の統計だけ |

## 補間・推計した範囲

| ファイル | 範囲 | 方法 |
|---|---|---|
| mortality.json | 1930〜1994年の全年齢（`meta.estimated`） | 各歳の公式表が機械で読める形でないため、#3〜#8 から推計（README_mortality.md）。平均寿命は公表値と0.25年以内（主な年）で一致 |
| mortality.json | 1944〜1946年（`meta.interpolated`） | 1943年と1947年の logit 補間。戦争による死亡は含めない |
| mortality.json | 105歳まで載っていない表の高齢部分 | 80歳以上の logit(qx) を年齢の一次式で延長 |
| births.json | 1944〜1946年の全国（男女）と全都道府県 | 1943年と1947年の直線補間（実際はもっと少なかった可能性が高い。公表された推計値は確認できなかった） |
| births.json | 沖縄 1944〜1972年 | 全国（沖縄を除く）の出生数×人口比×出生率の比（1943年と1973年の比を直線補間）で推計 |
| sexratio.json | 1944〜1946年 | births.json の補間値から計算 |
| marriage.json | meanFirstMarriageAge の1931〜1969年のうち公表のない年、2025年 | 前後の公表年の直線補間。2025年は2024年の据え置き |

## 確かめられなかったこと（未確認）

- 1944〜1946年の全国の出生数の公表推計値（検索が使えず、確認できなかった）
- 琉球政府（1945〜1972年）の出生数。沖縄県の統計や沖縄県公文書館の資料は今回取得していない。推計値は実際より少ない可能性がある（当時の沖縄の出生率は本土よりかなり高かったとされるが未確認）
- 第6〜17回完全生命表の各歳の値（e-Stat の PDF は画像で、文字として読めない）。5歳ごとの平均余命から復元した
- 50歳時未婚割合の1955・1965・1975・1985・1995・2005年（人口統計資料集の表6-23に載っていない）
