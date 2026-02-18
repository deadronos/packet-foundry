import type { ProtocolFamily } from '../core/types.js';

export interface ContractTemplate {
  id: string;
  name: string;
  description: string;
  protocol: ProtocolFamily;
  targetPayload: number;
  timeLimitSec: number | null;
  rewardCredits: number;
  rewardFragments: number;
  tier: 'low' | 'mid' | 'high';
  /** Minimum prestige count before this contract appears */
  minPrestige: number;
}

export const CONTRACT_TEMPLATES: ContractTemplate[] = [
  // ── Low tier ──────────────────────────────────────────────────────────
  {
    id: 'tpl_burst_low_1',
    name: 'Helios Transit: Local Relay',
    description: 'Route basic packet stream for Helios Transit local exchange.',
    protocol: 'burst',
    targetPayload: 500,
    timeLimitSec: 300,
    rewardCredits: 200,
    rewardFragments: 0,
    tier: 'low',
    minPrestige: 0,
  },
  {
    id: 'tpl_burst_low_2',
    name: 'Civic Mesh: Standard Upload',
    description: 'Process standard civic mesh upload packets.',
    protocol: 'burst',
    targetPayload: 800,
    timeLimitSec: null,
    rewardCredits: 280,
    rewardFragments: 1,
    tier: 'low',
    minPrestige: 0,
  },
  {
    id: 'tpl_secure_low_1',
    name: 'Civic Mesh: Integrity Run',
    description: 'Certified payload run for civic mesh integrity protocol.',
    protocol: 'secure',
    targetPayload: 400,
    timeLimitSec: 300,
    rewardCredits: 350,
    rewardFragments: 1,
    tier: 'low',
    minPrestige: 0,
  },
  {
    id: 'tpl_legacy_low_1',
    name: 'Archivist Ring: Archive Restore',
    description: 'Restore legacy archive packets with proper tagging.',
    protocol: 'legacy',
    targetPayload: 600,
    timeLimitSec: null,
    rewardCredits: 300,
    rewardFragments: 2,
    tier: 'low',
    minPrestige: 0,
  },

  // ── Mid tier ───────────────────────────────────────────────────────────
  {
    id: 'tpl_burst_mid_1',
    name: 'Helios Transit: Regional Burst',
    description: 'High-volume regional packet burst for Helios Transit.',
    protocol: 'burst',
    targetPayload: 2000,
    timeLimitSec: 600,
    rewardCredits: 700,
    rewardFragments: 2,
    tier: 'mid',
    minPrestige: 0,
  },
  {
    id: 'tpl_secure_mid_1',
    name: 'Noctilux: Premium Transfer',
    description: 'High-value secure transfer with certification required.',
    protocol: 'secure',
    targetPayload: 1500,
    timeLimitSec: 500,
    rewardCredits: 900,
    rewardFragments: 3,
    tier: 'mid',
    minPrestige: 0,
  },
  {
    id: 'tpl_legacy_mid_1',
    name: 'Archivist Ring: Deep Archive',
    description: 'Deep archive restoration requiring full legacy compliance.',
    protocol: 'legacy',
    targetPayload: 1800,
    timeLimitSec: null,
    rewardCredits: 800,
    rewardFragments: 4,
    tier: 'mid',
    minPrestige: 0,
  },

  // ── High tier ──────────────────────────────────────────────────────────
  {
    id: 'tpl_burst_high_1',
    name: 'Helios Transit: Shard Burst',
    description: 'Inter-shard burst protocol — maximum throughput required.',
    protocol: 'burst',
    targetPayload: 5000,
    timeLimitSec: 900,
    rewardCredits: 2000,
    rewardFragments: 5,
    tier: 'high',
    minPrestige: 0,
  },
  {
    id: 'tpl_secure_high_1',
    name: 'Noctilux: Blackline Contract',
    description: 'Gray-market secure transfer with premium certification.',
    protocol: 'secure',
    targetPayload: 4000,
    timeLimitSec: 800,
    rewardCredits: 2500,
    rewardFragments: 8,
    tier: 'high',
    minPrestige: 0,
  },
  {
    id: 'tpl_legacy_high_1',
    name: 'Archivist Ring: Shard Restoration',
    description: 'Cross-shard archive restoration. Long-haul, high reward.',
    protocol: 'legacy',
    targetPayload: 4500,
    timeLimitSec: null,
    rewardCredits: 2200,
    rewardFragments: 10,
    tier: 'high',
    minPrestige: 1,
  },
];

export const META_PERKS = [
  {
    id: 'perk_throughput_boost',
    name: 'Throughput Boost',
    description: '+10% global scrap generation and processing speed per level',
    maxLevel: 3,
    costPerLevel: 2,
  },
  {
    id: 'perk_latency_shield',
    name: 'Latency Shield',
    description: '-15% latency penalty scaling per level',
    maxLevel: 2,
    costPerLevel: 3,
  },
  {
    id: 'perk_head_start',
    name: 'Head Start',
    description: 'Begin next run with an extra lane already built',
    maxLevel: 1,
    costPerLevel: 4,
  },
  {
    id: 'perk_fragment_surge',
    name: 'Fragment Surge',
    description: '+5 fewer ticks between fragment drops per level',
    maxLevel: 2,
    costPerLevel: 2,
  },
  {
    id: 'perk_offline_cap',
    name: 'Offline Cap+',
    description: '+4 hours to the offline progression cap',
    maxLevel: 1,
    costPerLevel: 3,
  },
  {
    id: 'perk_credit_multiplier',
    name: 'Credit Multiplier',
    description: '+20% credit rate permanently',
    maxLevel: 1,
    costPerLevel: 5,
  },
] as const;

export type MetaPerkId = (typeof META_PERKS)[number]['id'];
