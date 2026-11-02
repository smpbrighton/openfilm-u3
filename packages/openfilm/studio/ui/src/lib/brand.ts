export const PRODUCT = 'u3 Studio';

/** Display copy only. Keep command names, identifiers, URLs and file paths as the upstream defines them. */
export function brandText(text: string): string {
  return text.replace(/(?<![\w/\\.-])OpenFilm(?: Studio)?\b(?![\w/\\-]|\.[A-Za-z0-9])/g, PRODUCT);
}

export const UPSTREAM_NOTICE = {
  en: 'Based on OpenFilm (MIT)',
  ko: 'OpenFilm 기반 (MIT)',
  ja: 'OpenFilm をベースに開発 (MIT)',
  es: 'Basado en OpenFilm (MIT)',
  'zh-CN': '基于 OpenFilm (MIT)',
};
