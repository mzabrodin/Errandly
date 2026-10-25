import { useLayoutEffect, type JSX } from 'react';
import { Outlet, useLocation } from 'react-router';

/**
 * Нова сторінка — з початку. Реагуємо лише на зміну шляху: фільтри в
 * search-параметрах і якорі (#розділ) не скидають прокрутку.
 */
export function ScrollToTop(): JSX.Element {
  const { pathname, hash } = useLocation();

  useLayoutEffect(() => {
    if (hash === '') window.scrollTo(0, 0);
    // хеш навмисно не в залежностях: перехід за якорем на тій самій сторінці не скидає скрол
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return <Outlet />;
}
