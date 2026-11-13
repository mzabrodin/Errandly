import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';

import { sessionKey } from '../shared/api/auth';
import type { ProfilePatch, User } from '../shared/api/types';
import { deviceTimeZone, displayTimeZone, setDisplayTimeZone } from '../shared/lib/dates';
import { TimezoneSync } from './TimezoneSync';

const updateProfile = vi.fn<(patch: ProfilePatch) => void>();

vi.mock('../shared/api/profile', () => ({
  useUpdateProfile: () => ({ mutate: updateProfile }),
}));

const device = deviceTimeZone();
const elsewhere = device === 'Asia/Tokyo' ? 'America/New_York' : 'Asia/Tokyo';

function user(overrides: Partial<User>): User {
  return {
    id: 'u1',
    name: 'Anya',
    email: 'anya@errandly.dev',
    emailVerified: true,
    timezone: device,
    timezoneAuto: true,
    locale: 'uk',
    avatarUrl: null,
    ...overrides,
  };
}

function renderSignedIn(session: User | null): void {
  const client = new QueryClient();
  client.setQueryData(sessionKey, session);
  render(
    <QueryClientProvider client={client}>
      <TimezoneSync />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  updateProfile.mockReset();
  setDisplayTimeZone(device);
});

describe('TimezoneSync', () => {
  it('moves an automatic profile zone to the device zone', () => {
    renderSignedIn(user({ timezone: elsewhere }));

    expect(updateProfile).toHaveBeenCalledWith({ timezone: device });
    expect(displayTimeZone()).toBe(device);
  });

  it('shows times in a manual zone without touching it', () => {
    renderSignedIn(user({ timezone: elsewhere, timezoneAuto: false }));

    expect(updateProfile).not.toHaveBeenCalled();
    expect(displayTimeZone()).toBe(elsewhere);
  });

  it('uses the device zone when signed out', () => {
    setDisplayTimeZone(elsewhere);
    renderSignedIn(null);

    expect(updateProfile).not.toHaveBeenCalled();
    expect(displayTimeZone()).toBe(device);
  });
});
