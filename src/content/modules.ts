import type { ModuleType } from '../core/types.js';

export interface ModuleDefinition {
  type: ModuleType;
  name: string;
  description: string;
  /** Credits to unlock (level 0 → 1). 0 = starts unlocked. */
  unlockCost: number;
  /** Scrap-per-second processing capacity added to a lane when this module is at level 1 */
  baseCapacityBonus: number;
  /** Payload-per-scrap output multiplier at level 1 */
  baseOutputMultiplier: number;
  /** Extra capacity bonus per level above 1 */
  capacityPerLevel: number;
  /** Extra output multiplier per level above 1 */
  outputMultPerLevel: number;
  /** Adds this to chain-depth latency score */
  chainDepth: number;
}

export const MODULE_DEFINITIONS: Record<ModuleType, ModuleDefinition> = {
  decrypt: {
    type: 'decrypt',
    name: 'Decrypt Module',
    description: 'Decrypts raw packet streams. Primary processing module.',
    unlockCost: 0,
    baseCapacityBonus: 5,
    baseOutputMultiplier: 1.0,
    capacityPerLevel: 2.5,
    outputMultPerLevel: 0.08,
    chainDepth: 1,
  },
  checksum: {
    type: 'checksum',
    name: 'Checksum Module',
    description: 'Verifies packet integrity. Required for Secure protocol.',
    unlockCost: 50,
    baseCapacityBonus: 3,
    baseOutputMultiplier: 1.1,
    capacityPerLevel: 1.5,
    outputMultPerLevel: 0.06,
    chainDepth: 1,
  },
  compress: {
    type: 'compress',
    name: 'Compress Module',
    description: 'Compresses payload data for higher effective yield.',
    unlockCost: 80,
    baseCapacityBonus: 4,
    baseOutputMultiplier: 1.15,
    capacityPerLevel: 2.0,
    outputMultPerLevel: 0.1,
    chainDepth: 1,
  },
  tag: {
    type: 'tag',
    name: 'Tag Module',
    description: 'Labels packets for routing. Required for Legacy protocol.',
    unlockCost: 60,
    baseCapacityBonus: 2,
    baseOutputMultiplier: 1.05,
    capacityPerLevel: 1.0,
    outputMultPerLevel: 0.05,
    chainDepth: 1,
  },
};
