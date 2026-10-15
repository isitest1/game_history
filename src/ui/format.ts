// 表示用の小さな関数

export function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** 西暦を和暦に（1月1日時点の元号。改元の年は新しい元号の「元年」と旧元号を併記しない） */
export function wareki(year: number): string {
  if (year >= 2019) return year === 2019 ? '令和元年' : `令和${year - 2018}年`;
  if (year >= 1989) return year === 1989 ? '平成元年' : `平成${year - 1988}年`;
  if (year >= 1926) return year === 1926 ? '昭和元年' : `昭和${year - 1925}年`;
  if (year >= 1912) return year === 1912 ? '大正元年' : `大正${year - 1911}年`;
  if (year >= 1868) return year === 1868 ? '明治元年' : `明治${year - 1867}年`;
  // 江戸時代の元号（元年にあたる西暦の年。改元は旧暦の年の途中なので、目安）
  for (const [from, name] of EDO_ERAS) if (year >= from) return year === from ? `${name}元年` : `${name}${year - from + 1}年`;
  return `寛政${year - 1788}年`;
}

const EDO_ERAS: [number, string][] = [
  [1865, '慶応'],
  [1864, '元治'],
  [1861, '文久'],
  [1860, '万延'],
  [1854, '安政'],
  [1848, '嘉永'],
  [1844, '弘化'],
  [1830, '天保'],
  [1818, '文政'],
  [1804, '文化'],
  [1801, '享和'],
  [1789, '寛政'],
];

export type EraName = '江戸' | '明治' | '大正' | '昭和' | '平成' | '令和';

export function eraName(year: number): EraName {
  return year >= 2019 ? '令和' : year >= 1989 ? '平成' : year >= 1926 ? '昭和' : year >= 1912 ? '大正' : year >= 1868 ? '明治' : '江戸';
}

export function yen(v: number): string {
  if (!Number.isFinite(v)) return '−';
  const a = Math.abs(v);
  const sign = v < 0 ? '−' : '';
  if (a >= 1e8) return `${sign}${(a / 1e8).toFixed(a >= 1e10 ? 0 : 1)}億円`;
  if (a >= 1e4) return `${sign}${Math.round(a / 1e4).toLocaleString('ja-JP')}万円`;
  return `${sign}${Math.round(a).toLocaleString('ja-JP')}円`;
}

/** 狭い欄のための短い書き方（例：1168万、1.2億） */
export function shortYen(v: number): string {
  if (!Number.isFinite(v)) return '−';
  const a = Math.abs(v);
  const sign = v < 0 ? '−' : '';
  if (a >= 1e8) return `${sign}${(a / 1e8).toFixed(a >= 1e10 ? 0 : 1)}億`;
  if (a >= 1e4) return `${sign}${Math.round(a / 1e4)}万`;
  return `${sign}${Math.round(a)}円`;
}

export function $(sel: string, root: ParentNode = document): HTMLElement {
  const el = root.querySelector(sel);
  if (!el) throw new Error(`missing ${sel}`);
  return el as HTMLElement;
}

export function html(strings: TemplateStringsArray, ...vals: unknown[]): string {
  let out = '';
  strings.forEach((s, i) => {
    out += s;
    if (i < vals.length) {
      const v = vals[i];
      out += Array.isArray(v) ? v.join('') : v === false || v === null || v === undefined ? '' : String(v);
    }
  });
  return out;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export const reducedMotion = (): boolean =>
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
