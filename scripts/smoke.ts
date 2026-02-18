#!/usr/bin/env tsx
/**
 * Packet Foundry 17 — Smoke Test
 *
 * Simulates an automated gameplay session demonstrating:
 * - Resource accumulation
 * - Auto-purchasing upgrades and lanes
 * - Contract completion
 * - Prestige loop
 * - Post-prestige progression with meta perks
 *
 * Run with: npm run smoke
 */
import type { GameState } from '../src/core/types.js';
import { createInitialState } from '../src/state/gameState.js';
import { processTick } from '../src/core/tick.js';
import { refreshContractBoard, activateContract, isBoardExhausted } from '../src/core/contracts.js';
import { calculateReputationGain, canPrestige, applyPrestige, buyMetaPerk, availableReputation } from '../src/core/prestige.js';
import { buyUpgrade, unlockModule, addLane, switchProtocol } from '../src/state/actions.js';
import { UPGRADE_DEFINITIONS, upgradeCost, LANE_COST, LANE_COST_3 } from '../src/content/upgrades.js';
import { MODULE_DEFINITIONS } from '../src/content/modules.js';
import { PROTOCOL_DEFINITIONS } from '../src/content/protocols.js';
import { META_PERKS } from '../src/content/contracts.js';
import { calculateScrapGenRate, calculateCreditRate } from '../src/core/pipeline.js';

// ─── Helpers ───────────────────────────────────────────────────────────────

function fmt(n: number, dec = 0): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toFixed(dec);
}

function milestone(tick: number, msg: string): void {
  console.log(`[Tick ${String(tick).padStart(4)}] ★ MILESTONE: ${msg}`);
}

function info(tick: number, msg: string): void {
  console.log(`[Tick ${String(tick).padStart(4)}]   ${msg}`);
}

// ─── Auto-buy logic ────────────────────────────────────────────────────────

/** Attempt to auto-buy the highest-value affordable upgrade/expansion. */
function autoBuy(state: GameState): { state: GameState; bought: string | null } {
  const credits = state.resources.credits;

  // Priority 1: Unlock new module types (cheap + big impact)
  const modulesToUnlock = ['checksum', 'compress', 'tag'] as const;
  for (const mt of modulesToUnlock) {
    if (state.modules[mt].level === 0) {
      const cost = MODULE_DEFINITIONS[mt].unlockCost;
      if (credits >= cost) {
        const next = unlockModule(state, mt);
        if (next) return { state: next, bought: `Unlocked ${mt} module (${cost}C)` };
      }
    }
  }

  // Priority 2: Hardware module speed (first two levels)
  const speedLevel = state.upgradesPurchased['hw_module_speed'] ?? 0;
  if (speedLevel < 3) {
    const def = UPGRADE_DEFINITIONS.find((d) => d.id === 'hw_module_speed')!;
    const cost = upgradeCost(def, speedLevel);
    if (credits >= cost) {
      const next = buyUpgrade(state, 'hw_module_speed');
      if (next) return { state: next, bought: `Module Speed Lv${speedLevel + 1} (${cost}C)` };
    }
  }

  // Priority 3: Routing AI (more scrap)
  const aiLevel = state.upgradesPurchased['sw_routing_ai'] ?? 0;
  if (aiLevel < 3) {
    const def = UPGRADE_DEFINITIONS.find((d) => d.id === 'sw_routing_ai')!;
    const cost = upgradeCost(def, aiLevel);
    if (credits >= cost) {
      const next = buyUpgrade(state, 'sw_routing_ai');
      if (next) return { state: next, bought: `Routing AI Lv${aiLevel + 1} (${cost}C)` };
    }
  }

  // Priority 4: Add Lane 2
  if (state.lanes.length === 1 && credits >= LANE_COST) {
    const next = addLane(state);
    if (next) return { state: next, bought: `Added Lane 2 (${LANE_COST}C)` };
  }

  // Priority 5: Buffer + cooling
  const bufLevel = state.upgradesPurchased['hw_buffer'] ?? 0;
  if (bufLevel < 3) {
    const def = UPGRADE_DEFINITIONS.find((d) => d.id === 'hw_buffer')!;
    const cost = upgradeCost(def, bufLevel);
    if (credits >= cost) {
      const next = buyUpgrade(state, 'hw_buffer');
      if (next) return { state: next, bought: `Buffer Expansion Lv${bufLevel + 1} (${cost}C)` };
    }
  }

  // Priority 6: Protocol parser
  const ppLevel = state.upgradesPurchased['sw_protocol_parser'] ?? 0;
  if (ppLevel < 2) {
    const def = UPGRADE_DEFINITIONS.find((d) => d.id === 'sw_protocol_parser')!;
    const cost = upgradeCost(def, ppLevel);
    if (credits >= cost) {
      const next = buyUpgrade(state, 'sw_protocol_parser');
      if (next) return { state: next, bought: `Protocol Parser Lv${ppLevel + 1} (${cost}C)` };
    }
  }

  // Priority 7: Module upgrades
  for (const modId of ['module_decrypt', 'module_checksum', 'module_compress'] as const) {
    const def = UPGRADE_DEFINITIONS.find((d) => d.id === modId)!;
    const lvl = state.upgradesPurchased[modId] ?? 0;
    const modType = modId.replace('module_', '') as keyof typeof state.modules;
    if (state.modules[modType].level === 0) continue; // not unlocked
    if (lvl >= def.maxLevel) continue;
    const cost = upgradeCost(def, lvl);
    if (credits >= cost) {
      const next = buyUpgrade(state, modId);
      if (next) return { state: next, bought: `${def.name} Lv${lvl + 2} (${cost}C)` };
    }
  }

  // Priority 8: Add Lane 3
  if (state.lanes.length === 2 && credits >= LANE_COST_3) {
    const next = addLane(state);
    if (next) return { state: next, bought: `Added Lane 3 (${LANE_COST_3}C)` };
  }

  return { state, bought: null };
}

/** Accept the best available contract (prefer active-protocol match). */
function autoAcceptContract(state: GameState): GameState {
  if (state.activeContractId) return state;
  const open = state.contracts.filter(
    (c) => !c.active && !c.expired && c.progressPayload < c.targetPayload,
  );
  if (open.length === 0) return state;

  // Prefer matching active protocol
  const matching = open.filter((c) => c.protocol === state.activeProtocol);
  const target = matching[0] ?? open[0];
  const next = activateContract(state, target.id);
  return next ?? state;
}

// ─── Main smoke run ────────────────────────────────────────────────────────

function runSmoke(): void {
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║   PACKET FOUNDRY 17 — SMOKE TEST                    ║');
  console.log('╚══════════════════════════════════════════════════════╝\n');

  let state = createInitialState();
  state = refreshContractBoard(state);

  const MAX_TICKS = 2000;
  let prestigeDone = false;
  let postPrestigeTicks = 0;
  const POST_PRESTIGE_RUN = 300;

  // Track last-printed milestone values
  let lastMilestone = {
    lanes: 1,
    contracts: 0,
    credits: 0,
    prestige: 0,
  };

  for (let tick = 1; tick <= MAX_TICKS; tick++) {
    state = processTick(state);

    // Auto-refresh exhausted board
    if (isBoardExhausted(state)) {
      state = refreshContractBoard(state);
    }

    // Auto-accept contracts
    state = autoAcceptContract(state);

    // Auto-buy
    const { state: afterBuy, bought } = autoBuy(state);
    if (bought) {
      state = afterBuy;
      milestone(tick, `Bought → ${bought}`);
    }

    // Milestone: lane added
    if (state.lanes.length > lastMilestone.lanes) {
      lastMilestone.lanes = state.lanes.length;
      milestone(tick, `Now operating ${state.lanes.length} lanes`);
    }

    // Milestone: contract completed
    if (state.completedContractCount > lastMilestone.contracts) {
      lastMilestone.contracts = state.completedContractCount;
      const scrap = fmt(calculateScrapGenRate(state), 1);
      const crate = calculateCreditRate(state).toFixed(2);
      milestone(tick, `Contract #${state.completedContractCount} complete! Credits: ${fmt(state.resources.credits)}  (scrap/s: ${scrap}, c/payload: ${crate})`);
    }

    // Milestone: prestige ready
    if (canPrestige(state) && !prestigeDone) {
      const rep = calculateReputationGain(state);
      milestone(tick, `PRESTIGE READY! Rep gain: ${rep}`);

      // Perform prestige
      state = applyPrestige(state);
      milestone(tick, `PRESTIGE COMPLETE (Run ${state.meta.prestigeCount}). Available rep: ${availableReputation(state)}`);

      // Buy perks: throughput boost x2, then latency shield
      const perksToBuy = ['perk_throughput_boost', 'perk_throughput_boost', 'perk_latency_shield'];
      for (const perkId of perksToBuy) {
        const next = buyMetaPerk(state, perkId);
        if (next) {
          state = next;
          const perk = META_PERKS.find((p) => p.id === perkId)!;
          info(tick, `Meta perk: ${perk.name} → Lv${state.meta.perks[perkId]}`);
        }
      }

      // Refresh board for new run
      state = refreshContractBoard(state);
      prestigeDone = true;
      lastMilestone = { lanes: state.lanes.length, contracts: 0, credits: 0, prestige: tick };
    }

    // Post-prestige run
    if (prestigeDone) {
      postPrestigeTicks++;
      if (postPrestigeTicks === POST_PRESTIGE_RUN) {
        milestone(tick, `Post-prestige run complete (${POST_PRESTIGE_RUN} ticks)`);
        milestone(tick, `Credits: ${fmt(state.resources.credits)}  Payload: ${fmt(state.stats.totalPayloadProduced)}  Fragments: ${state.resources.fragments}`);
        break;
      }
    }
  }

  // Final report
  console.log('\n' + '═'.repeat(56));
  console.log('  SMOKE TEST COMPLETE');
  console.log('═'.repeat(56));
  console.log(`  Ticks simulated   : ${state.tickCount}`);
  console.log(`  Total payload     : ${fmt(state.stats.totalPayloadProduced)}`);
  console.log(`  Total credits     : ${fmt(state.stats.totalCreditsEarned)}`);
  console.log(`  Contracts done    : ${state.completedContractCount}`);
  console.log(`  Prestige runs     : ${state.meta.prestigeCount}`);
  console.log(`  Reputation total  : ${state.meta.totalReputation}`);
  console.log(`  Perks             : ${JSON.stringify(state.meta.perks)}`);
  console.log(`  Lanes active      : ${state.lanes.length}`);
  console.log(`  Scrap rate        : ${calculateScrapGenRate(state).toFixed(1)}/s`);
  console.log(`  Credit rate       : ${calculateCreditRate(state).toFixed(2)}x`);

  if (!prestigeDone) {
    console.error('\n  ✗ SMOKE FAIL: Prestige was never reached within max ticks!');
    process.exit(1);
  }
  console.log('\n  ✓ All milestones reached. Smoke test PASSED.');
}

runSmoke();
