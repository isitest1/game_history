// 表示用の小さな関数

export function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** 西暦を和暦に（1月1日時点の元号。改元の年は新しい元号の「元年」と旧元号を併記しない） */
export function wareki(year: number): string {
  if (year >= 2019) return year === 2019 ? '令和元年' : `令和${year - 2018}年`;
  if (year >= 1989) return year === 1989 ? '平成元年' : `平成${year - 1988}年`;
  if (year >= 1926) return year === 1926 ? '昭和元年' : `昭和${year - 1925}年`;
  return `大正${year - 1911}年`;
}

export function eraName(year: number): '昭和' | '平成' | '令和' {
  return year >= 2019 ? '令和' : year >= 1989 ? '平成' : '昭和';
}

export function yen(v: number): string {
  if (!Number.isFinite(v)) return '−';
  const a = Math.abs(v);
  const sign = v < 0 ? '−' : '';
  if (a >= 1e8) return `${sign}${(a / 1e8).toFixed(a >= 1e10 ? 0 : 1)}億円`;
  if (a >= 1e4) return `${sign}${Math.round(a / 1e4).toLocaleString('ja-JP')}万円`;
  return `${sign}${Math.round(a).toLocaleString('ja-JP')}円`;
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
