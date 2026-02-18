import type { ProtocolFamily } from '../core/types.js';

export interface ProtocolDefinition {
  id: ProtocolFamily;
  name: string;
  description: string;
  /** Multiplier on scrap generation rate */
  throughputMultiplier: number;
  /** Multiplier on credits per payload */
  creditMultiplier: number;
  /** Fragment drops per 100 ticks */
  fragmentsPerHundredTicks: number;
  /** Module types required for full compliance bonus */
  requiredModules: ProtocolFamily extends string ? string[] : never;
  /** Credits to switch to this protocol */
  switchCost: number;
}

export const PROTOCOL_DEFINITIONS: Record<ProtocolFamily, ProtocolDefinition> = {
  burst: {
    id: 'burst',
    name: 'Burst Protocol',
    description: 'High throughput, lower per-unit value. Ideal for volume contracts.',
    throughputMultiplier: 1.4,
    creditMultiplier: 0.9,
    fragmentsPerHundredTicks: 3,
    requiredModules: [],
    switchCost: 0,
  },
  secure: {
    id: 'secure',
    name: 'Secure Protocol',
    description: 'Premium payload value. Slower throughput. Requires Checksum.',
    throughputMultiplier: 0.8,
    creditMultiplier: 1.5,
    fragmentsPerHundredTicks: 8,
    requiredModules: ['checksum'],
    switchCost: 100,
  },
  legacy: {
    id: 'legacy',
    name: 'Legacy Protocol',
    description: 'Strict ordering compliance. Bonuses require Tag module.',
    throughputMultiplier: 1.0,
    creditMultiplier: 1.2,
    fragmentsPerHundredTicks: 6,
    requiredModules: ['tag'],
    switchCost: 75,
  },
};
