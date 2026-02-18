#!/usr/bin/env tsx
/**
 * Packet Foundry 17 — Interactive CLI
 * Run with: npm run dev  (or  tsx src/ui/cli.ts)
 */
import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import type { GameState } from '../core/types.js';
import { createInitialState } from '../state/gameState.js';
import { processTick, processOfflineProgress } from '../core/tick.js';
import { refreshContractBoard, activateContract, isBoardExhausted } from '../core/contracts.js';
import { calculateReputationGain, canPrestige, applyPrestige, buyMetaPerk, availableReputation } from '../core/prestige.js';
import { buyUpgrade, unlockModule, addLane, switchProtocol, toggleLaneModule } from '../state/actions.js';
import { saveToFile, loadFromFile, hasSaveFile } from '../persistence/saveLoad.js';
import { UPGRADE_DEFINITIONS, UPGRADE_MAP, LANE_COST, LANE_COST_3, upgradeCost } from '../content/upgrades.js';
import { MODULE_DEFINITIONS } from '../content/modules.js';
import { PROTOCOL_DEFINITIONS } from '../content/protocols.js';
import { META_PERKS } from '../content/contracts.js';
import { calculateScrapGenRate, calculateCreditRate, calculateLaneThroughput, calculateFragmentInterval } from '../core/pipeline.js';
import { calculateLatency } from '../core/latency.js';

// ─── Display helpers ───────────────────────────────────────────────────────

function fmt(n: number, decimals = 0): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toFixed(decimals);
}

function bar(value: number, max: number, width = 20): string {
  const filled = Math.round((value / max) * width);
  return '[' + '█'.repeat(filled) + '░'.repeat(width - filled) + ']';
}

function printHeader(state: GameState): void {
  const proto = PROTOCOL_DEFINITIONS[state.activeProtocol];
  const scrapRate = calculateScrapGenRate(state).toFixed(1);
  const creditRate = calculateCreditRate(state).toFixed(2);
  console.log('\n' + '═'.repeat(56));
  console.log(`  PACKET FOUNDRY 17 ─ Tick ${state.tickCount} ─ Run ${state.meta.prestigeCount + 1}`);
  console.log('═'.repeat(56));
  console.log(`  Protocol : ${proto.name.padEnd(22)} [${state.activeProtocol.toUpperCase()}]`);
  console.log(`  Scrap    : ${fmt(state.resources.scrap, 1).padEnd(10)} (gen: ${scrapRate}/s)`);
  console.log(`  Payload  : ${fmt(state.resources.payload, 1).padEnd(10)} (total: ${fmt(state.stats.totalPayloadProduced)})`);
  console.log(`  Credits  : ${fmt(state.resources.credits, 1).padEnd(10)} (×${creditRate}/payload)`);
  console.log(`  Fragments: ${state.resources.fragments}`);
  console.log('─'.repeat(56));

  // Lanes
  for (const lane of state.lanes) {
    const th = calculateLaneThroughput(lane, state);
    const { penalty, latencyMs } = calculateLatency(
      th.activeModuleCount,
      lane.queue,
      (state.upgradesPurchased['hw_buffer'] ?? 0) * 10,
    );
    const heatPct = Math.round(lane.heat * 100);
    const mods = lane.enabledModules.join('+') || 'none';
    console.log(
      `  Lane ${lane.id + 1} : queue=${fmt(lane.queue, 1).padEnd(6)}` +
      ` heat=${heatPct}% latency=${Math.round(latencyMs)}ms eff=${Math.round(penalty * 100)}%` +
      ` [${mods}]`,
    );
  }

  // Active contract
  if (state.activeContractId) {
    const c = state.contracts.find((x) => x.id === state.activeContractId);
    if (c) {
      const pct = Math.min(100, Math.round((c.progressPayload / c.targetPayload) * 100));
      const timeStr = c.timeRemainingS !== null ? `  ⏱ ${Math.round(c.timeRemainingS)}s` : '';
      console.log(`  Contract : ${c.name}`);
      console.log(`  Progress : ${bar(c.progressPayload, c.targetPayload)} ${pct}%${timeStr}`);
    }
  }

  // Prestige availability
  if (canPrestige(state)) {
    const rep = calculateReputationGain(state);
    console.log(`  ★ PRESTIGE READY — gain ${rep} reputation`);
  }
  console.log('═'.repeat(56));
}

function printMenu(): void {
  console.log('\n  ACTIONS');
  console.log('  1) Run 1 tick       2) Run 10 ticks    3) Run 60 ticks');
  console.log('  4) Upgrades shop    5) Contracts board  6) Protocol switch');
  console.log('  7) Prestige         8) Save             9) Quit');
  console.log('  (Enter number or press Enter to run 1 tick)');
}

// ─── Sub-menus ─────────────────────────────────────────────────────────────

function printUpgradeShop(state: GameState): void {
  console.log('\n  ─ UPGRADE SHOP ─────────────────────────────────────────');
  let idx = 1;

  // Unlock modules
  const MODULE_TYPES = ['checksum', 'compress', 'tag'] as const;
  for (const mt of MODULE_TYPES) {
    const mod = state.modules[mt];
    if (mod.level === 0) {
      const def = MODULE_DEFINITIONS[mt];
      const canAfford = state.resources.credits >= def.unlockCost;
      console.log(
        `  ${idx}) [UNLOCK ${mt.toUpperCase()}] ${def.name} — ${def.unlockCost}C${canAfford ? '' : ' (need more credits)'}`,
      );
      idx++;
    }
  }

  // Standard upgrades
  for (const def of UPGRADE_DEFINITIONS) {
    const lvl = state.upgradesPurchased[def.id] ?? 0;
    const moduleLvl = def.category === 'module'
      ? state.modules[def.id.replace('module_', '') as keyof typeof state.modules]?.level ?? 0
      : null;
    if (moduleLvl === 0 && def.category === 'module') continue; // module not unlocked
    if (lvl >= def.maxLevel) continue; // maxed

    const cost = upgradeCost(def, lvl);
    const canAfford = state.resources.credits >= cost;
    const levelStr = def.category === 'module' ? `Lv${(moduleLvl ?? 1) + 1}` : `Lv${lvl + 1}`;
    console.log(
      `  ${idx}) ${def.name} (${levelStr}) — ${cost}C${canAfford ? '' : ' (need more credits)'}`,
    );
    idx++;
  }

  // Add lane
  if (state.lanes.length < 3) {
    const laneCost = state.lanes.length === 1 ? LANE_COST : LANE_COST_3;
    const canAfford = state.resources.credits >= laneCost;
    console.log(
      `  ${idx}) Add Lane ${state.lanes.length + 1} — ${laneCost}C${canAfford ? '' : ' (need more credits)'}`,
    );
    idx++;
  }

  console.log('  0) Back');
}

async function upgradeMenu(rl: readline.Interface, state: GameState): Promise<GameState> {
  let s = state;
  while (true) {
    printUpgradeShop(s);
    const ans = (await rl.question('  > ')).trim();
    if (ans === '0' || ans === '') break;
    const n = parseInt(ans);
    if (isNaN(n)) continue;

    // Build same list as displayed
    let idx = 1;
    let newState: GameState | null = null;

    const MODULE_TYPES = ['checksum', 'compress', 'tag'] as const;
    for (const mt of MODULE_TYPES) {
      if (s.modules[mt].level === 0) {
        if (n === idx) { newState = unlockModule(s, mt); break; }
        idx++;
      }
    }
    if (!newState) {
      for (const def of UPGRADE_DEFINITIONS) {
        const lvl = s.upgradesPurchased[def.id] ?? 0;
        const moduleLvl = def.category === 'module'
          ? s.modules[def.id.replace('module_', '') as keyof typeof s.modules]?.level ?? 0
          : null;
        if (moduleLvl === 0 && def.category === 'module') continue;
        if (lvl >= def.maxLevel) continue;
        if (n === idx) { newState = buyUpgrade(s, def.id); break; }
        idx++;
      }
    }
    if (!newState && s.lanes.length < 3) {
      if (n === idx) { newState = addLane(s); }
    }

    if (newState) {
      s = newState;
      console.log('  ✓ Purchase successful.');
    } else {
      console.log('  ✗ Cannot purchase — check credits or availability.');
    }
  }
  return s;
}

function printContractBoard(state: GameState): void {
  console.log('\n  ─ CONTRACT BOARD ────────────────────────────────────────');
  if (state.contracts.length === 0) {
    console.log('  No contracts available. (Refresh happens automatically.)');
  }
  state.contracts.forEach((c, i) => {
    const status = c.active ? '▶ ACTIVE' : c.progressPayload >= c.targetPayload ? '✓ DONE' : c.expired ? '✗ EXPIRED' : '○ OPEN';
    const pct = Math.min(100, Math.round((c.progressPayload / c.targetPayload) * 100));
    const timeStr = c.timeRemainingS !== null ? ` ⏱${Math.round(c.timeRemainingS)}s` : '';
    console.log(`  ${i + 1}) [${status}] ${c.name} [${c.protocol.toUpperCase()}]`);
    console.log(`     Target: ${fmt(c.targetPayload)} payload | Reward: ${c.rewardCredits}C, ${c.rewardFragments}F | Progress: ${pct}%${timeStr}`);
  });
  console.log('  0) Back');
}

async function contractMenu(rl: readline.Interface, state: GameState): Promise<GameState> {
  let s = state;
  // Auto-refresh if exhausted
  if (isBoardExhausted(s) || s.contracts.length === 0) {
    s = refreshContractBoard(s);
    console.log('\n  ↻ Contract board refreshed.');
  }
  while (true) {
    printContractBoard(s);
    const ans = (await rl.question('  Activate contract #> ')).trim();
    if (ans === '0' || ans === '') break;
    const n = parseInt(ans);
    if (isNaN(n) || n < 1 || n > s.contracts.length) continue;
    const contract = s.contracts[n - 1];
    if (!contract) continue;
    const newState = activateContract(s, contract.id);
    if (newState) {
      s = newState;
      console.log(`  ✓ Contract accepted: ${contract.name}`);
    } else {
      console.log('  ✗ Cannot activate — already running a contract or invalid choice.');
    }
    break;
  }
  return s;
}

async function protocolMenu(rl: readline.Interface, state: GameState): Promise<GameState> {
  let s = state;
  const protocols = ['burst', 'secure', 'legacy'] as const;
  console.log('\n  ─ PROTOCOL SWITCH ───────────────────────────────────────');
  protocols.forEach((p, i) => {
    const def = PROTOCOL_DEFINITIONS[p];
    const isCurrent = s.activeProtocol === p;
    const canAfford = s.resources.credits >= def.switchCost;
    console.log(
      `  ${i + 1}) ${def.name}${isCurrent ? ' ◄ CURRENT' : ''} — ${def.switchCost === 0 ? 'Free' : def.switchCost + 'C'}` +
      `\n     ${def.description}${canAfford ? '' : ' (need more credits)'}`,
    );
  });
  console.log('  0) Back');
  const ans = (await rl.question('  > ')).trim();
  if (ans === '0' || ans === '') return s;
  const n = parseInt(ans);
  if (n >= 1 && n <= 3) {
    const newState = switchProtocol(s, protocols[n - 1]);
    if (newState) {
      s = newState;
      console.log(`  ✓ Switched to ${protocols[n - 1]} protocol.`);
    } else {
      console.log('  ✗ Cannot switch — check credits or already on that protocol.');
    }
  }
  return s;
}

async function prestigeMenu(rl: readline.Interface, state: GameState): Promise<GameState> {
  let s = state;
  if (!canPrestige(s)) {
    console.log(`\n  Prestige requires 3000 total payload. You have ${fmt(s.stats.totalPayloadProduced)}.`);
    await rl.question('  (Press Enter)');
    return s;
  }

  const repGain = calculateReputationGain(s);
  console.log(`\n  ─ PRESTIGE: NEW ISP CONTRACT ────────────────────────────`);
  console.log(`  Reputation gain: +${repGain} (total: ${s.meta.totalReputation + repGain})`);
  console.log(`  Current run stats:`);
  console.log(`    Total payload: ${fmt(s.stats.totalPayloadProduced)}`);
  console.log(`    Completed contracts: ${s.completedContractCount}`);
  console.log(`    Protocols used: ${[...s.protocolsUsed].join(', ')}`);
  console.log('\n  What resets: credits, lanes, modules, contracts');
  console.log('  What persists: reputation, meta perks\n');

  const confirm = (await rl.question('  Confirm prestige? (yes/no) > ')).trim().toLowerCase();
  if (confirm !== 'yes' && confirm !== 'y') return s;

  s = applyPrestige(s);
  console.log('\n  ★ PRESTIGE! New ISP Contract started.');
  console.log(`  Available reputation: ${availableReputation(s)}`);

  // Perk buying loop
  let buying = true;
  while (buying) {
    console.log('\n  ─ META PERKS ─────────────────────────────────────────');
    console.log(`  Available reputation: ${availableReputation(s)}`);
    META_PERKS.forEach((p, i) => {
      const lvl = s.meta.perks[p.id] ?? 0;
      const maxed = lvl >= p.maxLevel;
      const canAfford = availableReputation(s) >= p.costPerLevel;
      console.log(
        `  ${i + 1}) ${p.name} (${lvl}/${p.maxLevel}) — ${p.costPerLevel} rep each` +
        `${maxed ? ' [MAXED]' : canAfford ? '' : ' (need rep)'}`,
      );
      console.log(`     ${p.description}`);
    });
    console.log('  0) Done');

    const ans = (await rl.question('  Buy perk #> ')).trim();
    if (ans === '0' || ans === '') { buying = false; break; }
    const n = parseInt(ans);
    if (n >= 1 && n <= META_PERKS.length) {
      const newState = buyMetaPerk(s, META_PERKS[n - 1].id);
      if (newState) {
        s = newState;
        console.log(`  ✓ Purchased ${META_PERKS[n - 1].name}.`);
      } else {
        console.log('  ✗ Cannot purchase — check reputation or max level.');
      }
    }
  }

  s = refreshContractBoard(s);
  return s;
}

// ─── Main loop ─────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const rl = readline.createInterface({ input, output });

  console.log('\n  ╔══════════════════════════════════════════════════════╗');
  console.log('  ║          PACKET FOUNDRY 17 — BOOT SEQUENCE          ║');
  console.log('  ╚══════════════════════════════════════════════════════╝');

  let state: GameState;

  if (hasSaveFile()) {
    const ans = (await rl.question('  Save file found. Load it? (yes/no) > ')).trim().toLowerCase();
    if (ans === 'yes' || ans === 'y') {
      const loaded = loadFromFile();
      if (loaded) {
        // Handle offline progress
        const { newState, summary } = processOfflineProgress(loaded, Date.now());
        state = newState;
        if (summary.elapsedSeconds > 60) {
          const hrs = (summary.elapsedSeconds / 3600).toFixed(1);
          console.log(`\n  ► Offline progress: ${hrs}h elapsed`);
          console.log(`    Payload: +${fmt(summary.payloadEarned)}  Credits: +${fmt(summary.creditsEarned)}  Fragments: +${summary.fragmentsEarned}`);
        }
      } else {
        console.log('  Failed to load save. Starting fresh.');
        state = createInitialState();
      }
    } else {
      state = createInitialState();
    }
  } else {
    state = createInitialState();
  }

  // Initial contract board
  if (state.contracts.length === 0) {
    state = refreshContractBoard(state);
  }

  // Main game loop
  let running = true;
  while (running) {
    printHeader(state);
    printMenu();

    const ans = (await rl.question('  > ')).trim();

    // Auto-refresh exhausted board
    if (isBoardExhausted(state)) {
      state = refreshContractBoard(state);
      console.log('  ↻ Contract board refreshed.');
    }

    switch (ans) {
      case '':
      case '1':
        state = processTick(state);
        state = { ...state, lastTickTime: Date.now() };
        break;
      case '2':
        for (let i = 0; i < 10; i++) state = processTick(state);
        state = { ...state, lastTickTime: Date.now() };
        break;
      case '3':
        for (let i = 0; i < 60; i++) state = processTick(state);
        state = { ...state, lastTickTime: Date.now() };
        break;
      case '4':
        state = await upgradeMenu(rl, state);
        break;
      case '5':
        state = await contractMenu(rl, state);
        break;
      case '6':
        state = await protocolMenu(rl, state);
        break;
      case '7':
        state = await prestigeMenu(rl, state);
        break;
      case '8':
        saveToFile(state);
        console.log('  ✓ Game saved.');
        break;
      case '9':
        saveToFile(state);
        console.log('  ✓ Game saved. Goodbye, operator.');
        running = false;
        break;
      default:
        console.log('  Unknown command.');
    }

    // Autosave every 60 ticks
    if (state.tickCount > 0 && state.tickCount % 60 === 0) {
      saveToFile(state);
    }
  }

  rl.close();
}

main().catch(console.error);
