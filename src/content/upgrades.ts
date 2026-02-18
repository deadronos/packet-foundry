export type UpgradeEffectType =
  | 'scrap_rate_mult'
  | 'processing_capacity_flat'
  | 'credit_rate_mult'
  | 'latency_reduction_pct'
  | 'queue_tolerance_flat'
  | 'fragment_ticks_reduction';

export interface UpgradeEffect {
  type: UpgradeEffectType;
  valuePerLevel: number;
}

export interface UpgradeDefinition {
  id: string;
  name: string;
  description: string;
  category: 'hardware' | 'software' | 'module';
  maxLevel: number;
  baseCost: number;
  /** Exponential cost growth factor per level */
  costGrowth: number;
  effects: UpgradeEffect[];
}

export function upgradeCost(def: UpgradeDefinition, currentLevel: number): number {
  return Math.round(def.baseCost * Math.pow(def.costGrowth, currentLevel));
}

export const UPGRADE_DEFINITIONS: UpgradeDefinition[] = [
  // ── Hardware upgrades ──────────────────────────────────────────────────
  {
    id: 'hw_module_speed',
    name: 'Module Speed',
    description: 'Increases processing capacity per lane (+2 scrap/sec per level)',
    category: 'hardware',
    maxLevel: 5,
    baseCost: 30,
    costGrowth: 1.6,
    effects: [{ type: 'processing_capacity_flat', valuePerLevel: 2 }],
  },
  {
    id: 'hw_buffer',
    name: 'Buffer Expansion',
    description: 'Increases queue tolerance, reducing congestion latency penalty (+10 per level)',
    category: 'hardware',
    maxLevel: 5,
    baseCost: 45,
    costGrowth: 1.5,
    effects: [{ type: 'queue_tolerance_flat', valuePerLevel: 10 }],
  },
  {
    id: 'hw_cooling',
    name: 'Lane Cooling',
    description: 'Reduces latency penalty (-5% per level)',
    category: 'hardware',
    maxLevel: 3,
    baseCost: 60,
    costGrowth: 1.8,
    effects: [{ type: 'latency_reduction_pct', valuePerLevel: 5 }],
  },

  // ── Software upgrades ──────────────────────────────────────────────────
  {
    id: 'sw_routing_ai',
    name: 'Routing AI',
    description: 'Increases scrap generation rate (+15% per level)',
    category: 'software',
    maxLevel: 5,
    baseCost: 75,
    costGrowth: 1.4,
    effects: [{ type: 'scrap_rate_mult', valuePerLevel: 0.15 }],
  },
  {
    id: 'sw_protocol_parser',
    name: 'Protocol Parser',
    description: 'Increases credit value of processed payloads (+10% per level)',
    category: 'software',
    maxLevel: 4,
    baseCost: 100,
    costGrowth: 1.5,
    effects: [{ type: 'credit_rate_mult', valuePerLevel: 0.1 }],
  },
  {
    id: 'sw_fragment_miner',
    name: 'Fragment Miner',
    description: 'Generates schema fragments more frequently (-8 ticks per level)',
    category: 'software',
    maxLevel: 3,
    baseCost: 150,
    costGrowth: 2.0,
    effects: [{ type: 'fragment_ticks_reduction', valuePerLevel: 8 }],
  },

  // ── Module upgrade tiers ───────────────────────────────────────────────
  {
    id: 'module_decrypt',
    name: 'Decrypt Upgrade',
    description: 'Upgrade the Decrypt module to the next level',
    category: 'module',
    maxLevel: 4, // level 1 is default; upgrades to 5
    baseCost: 30,
    costGrowth: 1.7,
    effects: [],
  },
  {
    id: 'module_checksum',
    name: 'Checksum Upgrade',
    description: 'Upgrade the Checksum module to the next level',
    category: 'module',
    maxLevel: 4,
    baseCost: 40,
    costGrowth: 1.7,
    effects: [],
  },
  {
    id: 'module_compress',
    name: 'Compress Upgrade',
    description: 'Upgrade the Compress module to the next level',
    category: 'module',
    maxLevel: 4,
    baseCost: 50,
    costGrowth: 1.7,
    effects: [],
  },
  {
    id: 'module_tag',
    name: 'Tag Upgrade',
    description: 'Upgrade the Tag module to the next level',
    category: 'module',
    maxLevel: 4,
    baseCost: 35,
    costGrowth: 1.7,
    effects: [],
  },
];

export const LANE_COST = 200;   // credits for lane 2
export const LANE_COST_3 = 500; // credits for lane 3

export const UPGRADE_MAP: Record<string, UpgradeDefinition> = Object.fromEntries(
  UPGRADE_DEFINITIONS.map((u) => [u.id, u]),
);
