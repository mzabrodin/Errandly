import { act, fireEvent, render, renderHook } from '@testing-library/react';
import type { KeyboardEvent } from 'react';

import { getLastGroupId, setLastGroupId } from './lastGroup';
import { handleMenuKeys } from './menuKeys';
import { firstName } from './names';
import { forgetInvite, getPendingInvite, rememberInvite } from './pendingInvite';
import { setPrefs, usePrefs } from './prefs';
import { groupPath, taskPath } from './routes';
import { toStringList } from './translationList';
import { useDocumentTitle } from './useDocumentTitle';
import { useOnline } from './useOnline';

afterEach(() => localStorage.clear());

describe('remembered values', () => {
  it('keep the invite opened before email verification until it is used', () => {
    expect(getPendingInvite()).toBeNull();
    rememberInvite('tok');
    expect(getPendingInvite()).toBe('tok');
    forgetInvite();
    expect(getPendingInvite()).toBeNull();
  });

  it('keep the last opened group', () => {
    expect(getLastGroupId()).toBeNull();
    setLastGroupId('g1');
    expect(getLastGroupId()).toBe('g1');
  });

  it('survive storage that refuses to work, as in private mode', () => {
    const failing = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });

    expect(() => rememberInvite('tok')).not.toThrow();
    expect(() => setLastGroupId('g1')).not.toThrow();
    failing.mockRestore();
  });
});

describe('prefs', () => {
  it('apply the theme and motion setting to the page and notify subscribers', () => {
    const { result } = renderHook(usePrefs);

    act(() => setPrefs({ theme: 'sakura', reduceMotion: true }));

    expect(result.current).toMatchObject({ theme: 'sakura', reduceMotion: true });
    expect(document.documentElement.dataset).toMatchObject({
      theme: 'sakura',
      reduceMotion: 'true',
    });
    expect(JSON.parse(localStorage.getItem('errandly-prefs') ?? '{}')).toMatchObject({
      theme: 'sakura',
    });

    act(() => setPrefs({ theme: 'meadow', reduceMotion: false }));
    expect(document.documentElement.dataset['theme']).toBeUndefined();
  });
});

describe('small helpers', () => {
  it('build app paths', () => {
    expect(groupPath('g1')).toBe('/g/g1/tasks');
    expect(groupPath('g1', 'stats')).toBe('/g/g1/stats');
    expect(taskPath('g1', 't1')).toBe('/g/g1/tasks/t1');
  });

  it('take the first word of a name', () => {
    expect(firstName('  Anya Koval ')).toBe('Anya');
    expect(firstName('')).toBe('');
  });

  it('read a translated list, ignoring anything that is not a string', () => {
    expect(toStringList(['a', 1, 'b'])).toEqual(['a', 'b']);
    expect(toStringList('missing.key')).toEqual([]);
  });
});

describe('useDocumentTitle', () => {
  it('names the tab and restores the previous title on unmount', () => {
    document.title = 'Errandly';
    const { unmount } = renderHook(() => useDocumentTitle('Tasks'));

    expect(document.title).toBe('Tasks · Errandly');
    unmount();
    expect(document.title).toBe('Errandly');
  });
});

describe('useOnline', () => {
  it('follows the browser connection', () => {
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    const { result } = renderHook(useOnline);
    expect(result.current).toBe(true);

    online.mockReturnValue(false);
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(result.current).toBe(false);
    online.mockRestore();
  });
});

describe('handleMenuKeys', () => {
  it('moves the focus between menu items with the arrow, Home and End keys', () => {
    const { getAllByRole, getByRole } = render(
      <div
        role="menu"
        tabIndex={-1}
        onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => handleMenuKeys(event)}
      >
        <button type="button" role="menuitem">
          A
        </button>
        <button type="button" role="menuitem" disabled>
          B
        </button>
        <button type="button" role="menuitem">
          C
        </button>
      </div>,
    );
    const menu = getByRole('menu');
    const [first, , last] = getAllByRole('menuitem');

    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(last);
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(menu, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(last);
    fireEvent.keyDown(menu, { key: 'Home' });
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(menu, { key: 'End' });
    expect(document.activeElement).toBe(last);
  });
});
