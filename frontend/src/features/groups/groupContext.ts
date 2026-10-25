import { createContext } from 'react';

import type { Group } from '../../shared/api/types';

/** Поточна група; заповнює GroupLayout */
export const GroupContext = createContext<Group | null>(null);
