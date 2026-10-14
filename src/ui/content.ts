// 相談窓口と出典（画面に出すもの）。相談窓口は厚生労働省「まもろうよ こころ」に掲載のもの（2026年10月14日に確認）。

export const HELP_LINES: { name: string; tel?: string; hours: string; url?: string }[] = [
  { name: 'まもろうよ こころ（厚生労働省）', hours: '電話・SNSの相談窓口の一覧', url: 'https://www.mhlw.go.jp/mamorouyokokoro/' },
  { name: '#いのちSOS', tel: '0120-061-338', hours: '24時間' },
  { name: 'よりそいホットライン', tel: '0120-279-338', hours: '24時間（福島県からは0120-279-226）' },
  { name: 'いのちの電話', tel: '0120-783-556', hours: '毎日16〜21時（毎月10日は8時〜翌日8時）' },
  { name: 'こころの健康相談統一ダイヤル', tel: '0570-064-556', hours: '受付時間は地域によって違います' },
  { name: 'チャイルドライン（18歳まで）', tel: '0120-99-7777', hours: '毎日16〜21時' },
  { name: '24時間子供SOSダイヤル', tel: '0120-0-78310', hours: '24時間' },
];

export const SOURCES: { what: string; title: string; url?: string }[] = [
  { what: '出生数・出生性比', title: '厚生労働省「人口動態統計」／都道府県別人口動態統計100年の動向', url: 'https://www.mhlw.go.jp/www1/toukei/kjd100_8/index.html' },
  { what: '年齢別の死亡率', title: '国立社会保障・人口問題研究所「人口統計資料集」、厚生労働省「生命表」、「日本の将来推計人口（令和5年推計）」', url: 'https://www.ipss.go.jp/pp-zenkoku/j/zenkoku2023/pp_zenkoku2023.asp' },
  { what: '進学率', title: '文部科学省「学校基本調査」（社人研「人口統計資料集」表11-3 の転載を含む）', url: 'https://www.mext.go.jp/b_menu/toukei/chousa01/kihon/1267995.htm' },
  { what: '完全失業率・有効求人倍率', title: '総務省「労働力調査」、厚生労働省「職業安定業務統計」', url: 'https://www.stat.go.jp/data/roudou/longtime/03roudou.html' },
  { what: '大卒求人倍率', title: 'リクルートワークス研究所「ワークス大卒求人倍率調査」', url: 'https://www.works-i.com/surveys/' },
  { what: '結婚', title: '社人研「人口統計資料集」（平均初婚年齢・50歳時未婚割合）、「出生動向基本調査」（見合い結婚と恋愛結婚）', url: 'https://www.ipss.go.jp/ps-doukou/j/db_17/db_17GaiyoBaseData.html' },
  { what: '賃金', title: '厚生労働省「賃金構造基本統計調査」ほか', url: 'https://www.mhlw.go.jp/toukei/list/chinginkouzou.html' },
  { what: '年金', title: '日本年金機構「年金給付の経過措置一覧」、厚生労働省「2024年財政検証」「厚生年金保険・国民年金事業の概況」', url: 'https://www.mhlw.go.jp/content/001270476.pdf' },
  { what: '物価', title: '総務省「消費者物価指数」', url: 'https://www.stat.go.jp/data/cpi/' },
  { what: '親の職業（産業別就業者）', title: '社人研「人口統計資料集」表8-7（原資料：国勢調査）', url: 'https://www.ipss.go.jp/syoushika/tohkei/Popular/Popular2023RE.asp' },
  { what: '出来事', title: '各出来事の出典は、人生の記録（列を押すと開く）に書いています。確かめられなかったものには「未確認」と付けています' },
];
