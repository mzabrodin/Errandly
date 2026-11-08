import { createContext } from 'react';

import type { Group } from '../../shared/api/types';

/** Current group; provided by GroupLayout */
export const GroupContext = createContext<Group | null>(null);
