import { useEffect } from 'react';

/** Заголовок вкладки браузера: «Задачі · Errandly» */
export function useDocumentTitle(title: string | null | undefined): void {
  useEffect(() => {
    if ((title ?? '') === '') return undefined;
    const previous = document.title;
    document.title = `${title} · Errandly`;
    return () => {
      document.title = previous;
    };
  }, [title]);
}
