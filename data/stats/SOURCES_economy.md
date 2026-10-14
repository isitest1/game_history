# 出典一覧：教育・仕事・お金（economy）

- 取得日：2026年10月14日
- 作り方：`python3 scripts/build_economy_all.py`（`data/raw/` にない元データだけをダウンロードし、JSON を出して形を検証する）。検証だけなら `--check` を付ける
- 元データは `data/raw/`（コミットしない）に保存する。JSON の `meta` に、出典・補間した年（`interpolated`）・推計した年（`estimated`）・方法（`method`）・未確認の点（`unverified`）を書いた
- 利用規約：e-Stat の統計は政府標準利用規約（第2.0版、CC BY 4.0 互換）。各省のサイト（厚労省・文科省・内閣府・日本年金機構）は同規約か公共データ利用規約（PDL1.0）に準拠。リクルートワークス研究所の大卒求人倍率は「出典を書けば転載・加工可」。どれも「出典を書き、加工したことを書く」
- JILPT の Excel（無断転載禁止）は値の元にしていない

## 1. education.json（進学率、%、1930〜2025年、男女別）

| 統計名 | URL | 規約 | 使った値 |
|---|---|---|---|
| 文部科学省『学校基本調査』年次統計 表4 進学率（昭和23年〜） | https://www.e-stat.go.jp/stat-search/file-download?statInfId=000031852304&fileKind=0 | 政府標準利用規約2.0 | highSchool 1950〜2025年、university・juniorCollege 1954〜2025年 |
| 文部省 *Japan's Growth and Education*（1963年、『日本の成長と教育』英語版）Table 5・8・10 | https://www.mext.go.jp/b_menu/hakusho/html/hpae196301/hpae196301_2_015.html （表の画像：…/image/hpae196301/f5048001.gif ほか） | 文科省サイト | highSchool 1930・35・40・45年（旧制中学・高等女学校・師範への進学率）、university 1930・35・45年（高等教育在学率からの推計） |
| （照合）社人研『人口統計資料集2026』表11-3 | https://www.ipss.go.jp/syoushika/tohkei/Data/Popular2026/T11-03.files/sheet001.htm | PDL1.0 | 照合のみ（1955年・2000年・2025年などが一致） |

- 補間：highSchool 1931〜34・36〜39・41〜44・46〜49年、university 1931〜34・36〜44・46〜53年、juniorCollege 1950〜53年
- 推計：university 1930・35・45年（在学率から男女別を計算）、juniorCollege 1930〜49年は0（制度なし）

## 2. labor.json

| 統計名 | URL | 規約 | 使った値 |
|---|---|---|---|
| 総務省『労働力調査』長期時系列 表2-1 | https://www.e-stat.go.jp/stat-search/file-download?statInfId=000001082681&fileKind=0 | 政府標準利用規約2.0 | unemployment 1953〜2025年（男女計・男・女） |
| 同 表3-2 年齢5歳階級別労働力人口比率 | https://www.e-stat.go.jp/stat-search/file-download?statInfId=000001082683&fileKind=0 | 同 | femaleLaborByAge 1968〜2025年 |
| 厚労省『職業安定業務統計』一般職業紹介状況 第1表 | https://www.e-stat.go.jp/stat-search/file-download?statInfId=000040505312&fileKind=0 | 同 | jobOpenings 1963〜2025年 |
| 同 新規学卒者（高校・中学）の職業紹介状況 職業紹介主要指標の推移（2006・2010・2015・2020・2025年版） | https://www.e-stat.go.jp/stat-search/files?toukei=00450222&tstat=000001020421 | 同 | newGradJobRatio.middle/high 2002〜2025年（求人数÷求職者数） |
| 労働省『労働経済の分析』昭和44年版・48年版 | https://www.mhlw.go.jp/toukei_hakusho/hakusho/roudou/1969/dl/02.pdf 、…/1973/dl/02.pdf | 厚労省サイト | newGradJobRatio.middle/high 1969年・1971年 |
| リクルートワークス研究所『第43回 ワークス大卒求人倍率調査』 | https://www.works-i.com/surveys/item/260423_recruitment_saiyo_ratio.pdf | 出典明記で転載・加工可 | newGradJobRatio.univ 1987〜2027年卒 |

- 補間：なし
- 推計：unemployment 1930〜1952年（1953年の1.9%で据え置き）
- 未収録：jobOpenings 1948〜1962年（公的な電子データが見つからない）、newGradJobRatio.middle/high の1970〜2001年（1971年を除く）

## 3. wages.json

| 統計名 | URL | 規約 | 使った値 |
|---|---|---|---|
| 厚労省『毎月勤労統計調査』実数・指数累積データ（指数） | https://www.e-stat.go.jp/stat-search/file-download?statInfId=000032189777&fileKind=1 | 政府標準利用規約2.0 | annualIncomeIndex 1970〜2025年（調査産業計・30人以上・現金給与総額）、1952〜1969年（製造業をつないだ） |
| 厚労省『賃金構造基本統計調査』平成12年 第1表（産業計） | https://www.e-stat.go.jp/stat-search/file-download?statInfId=000001256993&fileKind=0 | 同 | profile.2000 |
| 同 令和2年 一般労働者 第1表（産業計） | https://www.e-stat.go.jp/stat-search/file-download?statInfId=000032069350&fileKind=0 | 同 | profile.2020 |
| 経済企画庁『昭和31年度 年次経済報告』 | https://www5.cao.go.jp/keizai3/keizaiwp/wp-je56/wp-je56-021002.html | 内閣府サイト | 1955年の実質賃金＝戦前の112.2%（annualIncomeIndex 1930〜36年の推計に使用） |

- 補間：annualIncomeIndex 1937〜1951年（1936年と1952年の対数直線補間）
- 推計：annualIncomeIndex 1930〜1951年
- 未作成：profile.1980（賃金構造基本統計調査の年別表は e-Stat に1999年分から）

## 4. pension.json

| 統計名 | URL | 規約 | 使った値 |
|---|---|---|---|
| 日本年金機構「特別支給の老齢厚生年金の支給開始年齢」 | https://www.nenkin.go.jp/oshirase/taisetu/2012.files/kaishi.pdf | 年金機構サイト | startAge（男性1941年4月2日以降、女性1946年4月2日以降） |
| 厚労省「公的年金制度の歴史」 | https://www.mhlw.go.jp/content/12500000/000955291.pdf | 厚労省サイト | 1954年改正（男性55→60歳）、1994・2000年改正 |
| 厚労省年金局「厚生年金保険・国民年金事業の概況」令和6年度・令和元年度・平成24年度 | https://www.mhlw.go.jp/topics/bukyoku/nenkin/nenkin/toukei/nenpou/2008/dl/gaiyou_r06.pdf ほか | 厚労省サイト | averageMonthly.employees 2008〜2024年度、national 2002〜2024年度 |
| 厚労省「令和6（2024）年財政検証結果の概要」 | https://www.mhlw.go.jp/content/001270476.pdf | 厚労省サイト | future（所得代替率 61.2% → 57.6%(2037)／50.4%(2057)、モデル年金） |

- 補間：averageMonthly.employees 2013・2014年度
- 確認済み（2026年10月15日）：女性1930〜1940年生まれの支給開始年齢（55〜59歳）の生年月日の区切りは、日本年金機構「年金給付の経過措置一覧」と一致。未確認：2007年度以前の厚生年金の平均月額は未収録

## 5. cpi.json（2020年=100、1930〜2025年）

| 統計名 | URL | 規約 | 使った値 |
|---|---|---|---|
| 総務省『2020年基準消費者物価指数』長期時系列 中分類指数（全国） | https://www.e-stat.go.jp/stat-search/file-download?statInfId=000032103936&fileKind=1 | 政府標準利用規約2.0 | 1970〜2025年（総合） |
| 同 持家の帰属家賃を除く総合指数（全国、1947年〜） | https://www.e-stat.go.jp/stat-search/file-download?statInfId=000032103937&fileKind=1 | 同 | 1947〜1969年（1970年の比でつないだ） |
| 経済企画庁『昭和29年 年次経済報告』 | https://www5.cao.go.jp/keizai3/keizaiwp/wp-je54/wp-je54-021002.html | 内閣府サイト | 「1954年4月の消費者物価は戦前（昭和9〜11年）の304倍」→ 1930〜36年の水準の推計 |

- 補間：1937〜1946年（1936年と1947年の対数直線補間）
- 推計：1930〜1946年
- 未確認：1937〜1946年の年ごとの動き（総務省『消費者物価指数年報』の戦前基準指数は紙のみ）

## 6. prices.json（当時の金額）

| 統計名 | URL | 規約 | 使った値 |
|---|---|---|---|
| 厚労省『賃金構造基本統計調査』時系列 第1表 新規学卒者の初任給の推移（昭和51年〜令和元年） | https://www.e-stat.go.jp/stat-search/file-download?statInfId=000031886408&fileKind=0 | 政府標準利用規約2.0 | 大卒・高卒の初任給（男女）1976〜2019年 |
| 総務省『小売物価統計調査（動向編）』2025年 第1表（東京都区部の年平均） | https://www.e-stat.go.jp/stat-search/files?toukei=00200571&tstat=000000680001&cycle=7&year=20250 | 同 | ラーメン、喫茶店のコーヒー、私鉄運賃、入浴料（2025年） |

- 補間：なし
- 未収録：2000年以前の品目別価格（データベースは2000年以降、それ以前は紙）、はがき・国鉄運賃（日本郵便・JR の資料は許可された出典の範囲外）
