// ─── Shared type definitions ───────────────────────────────────────────────

export type ModuleType = 'decrypt' | 'checksum' | 'compress' | 'tag';
export type ProtocolFamily = 'burst' | 'secure' | 'legacy';

export interface ResourcePool {
  scrap: number;
  payload: number;
  credits: number;
  fragments: number;
}

export interface ModuleInfo {
  type: ModuleType;
  /** 0 = locked/not purchased; 1–5 = active level */
  level: number;
}

export interface LaneState {
  id: number;
  /** Unprocessed scrap waiting in the lane buffer */
  queue: number;
  /** 0–1 heat indicator (1 = fully congested) */
  heat: number;
  /** Which module types are currently enabled for this lane */
  enabledModules: ModuleType[];
}

export interface ContractState {
  id: string;
  name: string;
  description: string;
  protocol: ProtocolFamily;
  targetPayload: number;
  timeLimitSec: number | null;
  rewardCredits: number;
  rewardFragments: number;
  progressPayload: number;
  /** Counted toward prestige formula */
  tier: 'low' | 'mid' | 'high';
  active: boolean;
  expired: boolean;
  timeRemainingS: number | null;
}

export interface MetaPerk {
  id: string;
  name: string;
  description: string;
  maxLevel: number;
  costPerLevel: number; // reputation
}

export interface MetaProgress {
  prestigeCount: number;
  totalReputation: number;
  spentReputation: number;
  /** perkId -> levels purchased */
  perks: Record<string, number>;
}

export interface GameState {
  version: number;
  /** Unix-ms timestamp of when the game was last ticked (for offline calc) */
  lastTickTime: number;
  resources: ResourcePool;
  lanes: LaneState[];
  modules: Record<ModuleType, ModuleInfo>;
  activeProtocol: ProtocolFamily;
  /** upgradeId -> level purchased */
  upgradesPurchased: Record<string, number>;
  contracts: ContractState[];
  activeContractId: string | null;
  completedContractCount: number;
  highTierContractsCompleted: number;
  /** protocols that have been used at least once (for prestige formula) */
  protocolsUsed: Set<ProtocolFamily>;
  meta: MetaProgress;
  stats: {
    totalPayloadProduced: number;
    totalCreditsEarned: number;
    playtimeSec: number;
    prestigeReadyAt: number | null;
  };
  tickCount: number;
}
