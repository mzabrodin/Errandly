import { useLayoutEffect, type JSX } from 'react';
import { Outlet, useLocation } from 'react-router';

/**
 * A new page starts at the top. Reacts only to path changes: filters in
 * search params and anchors (#section) do not reset the scroll.
 */
export function ScrollToTop(): JSX.Element {
  const { pathname, hash } = useLocation();

  useLayoutEffect(() => {
    if (hash === '') window.scrollTo(0, 0);
    // The hash is deliberately not a dependency: following an anchor on the same page keeps the scroll
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return <Outlet />;
}
