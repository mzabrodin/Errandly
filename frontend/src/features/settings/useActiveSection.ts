import { useEffect, useState } from 'react';

/**
 * Scroll-spy: який розділ зараз «під шапкою». Активний — останній розділ,
 * верх якого вже проскролили до лінії трохи нижче липкої шапки.
 */
export function useActiveSection(ids: readonly string[], ready: boolean): string | undefined {
  const [active, setActive] = useState(ids[0]);

  useEffect(() => {
    if (!ready) return undefined;
    let frame = 0;
    const update = () => {
      frame = 0;
      const header = parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue('--header-h'),
      );
      const line = (Number.isNaN(header) ? 68 : header) + 120;
      // біля самого низу сторінки — останній розділ (він може бути коротким)
      const atBottom =
        window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      let current = ids[0];
      for (const id of ids) {
        const section = document.getElementById(`${id}-title`)?.closest('section');
        if (section && section.getBoundingClientRect().top <= line) current = id;
      }
      setActive(atBottom ? ids[ids.length - 1] : current);
    };
    const onScroll = () => {
      if (frame === 0) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      cancelAnimationFrame(frame);
    };
  }, [ids, ready]);

  return active;
}
