import { useEffect } from 'react';

import { useSession } from '../shared/api/auth';
import { useUpdateProfile } from '../shared/api/profile';
import { deviceTimeZone, setDisplayTimeZone } from '../shared/lib/dates';

/** Shows times in the profile zone; an automatic zone follows the device (NFR-COMP-03) */
export function TimezoneSync(): null {
  const { data: user } = useSession();
  const { mutate: updateProfile } = useUpdateProfile();
  const zone = user?.timezone;
  const auto = user?.timezoneAuto;

  useEffect(() => {
    const device = deviceTimeZone();
    if (zone === undefined) {
      setDisplayTimeZone(device);
      return;
    }
    if (auto === true && zone !== device) {
      setDisplayTimeZone(device);
      updateProfile({ timezone: device });
      return;
    }
    setDisplayTimeZone(zone);
  }, [zone, auto, updateProfile]);

  return null;
}
