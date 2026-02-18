import { useEffect, useMemo, useState } from 'react';
import type { GameState, ModuleType, ProtocolFamily } from '../core/types.js';
import { createInitialState, deserializeState, serializeState } from '../state/gameState.js';
import { processOfflineProgress, processTick, type OfflineSummary } from '../core/tick.js';
import { calculateLaneThroughput, calculateScrapGenRate, calculateCreditRate, calculateFragmentInterval } from '../core/pipeline.js';
import { calculateLatency } from '../core/latency.js';
import { activateContract, isBoardExhausted, refreshContractBoard } from '../core/contracts.js';
import { availableReputation, applyPrestige, buyMetaPerk, calculateReputationGain, canPrestige } from '../core/prestige.js';
import { addLane, buyUpgrade, switchProtocol, toggleLaneModule, unlockModule } from '../state/actions.js';
import { UPGRADE_DEFINITIONS, LANE_COST, LANE_COST_3, upgradeCost } from '../content/upgrades.js';
import { MODULE_DEFINITIONS } from '../content/modules.js';
import { PROTOCOL_DEFINITIONS } from '../content/protocols.js';
import { META_PERKS } from '../content/contracts.js';

const SAVE_KEY = 'packet-foundry-web-save';
const SAVE_VERSION = 1;
const TICK_INTERVAL_MS = 1000;

const MODULE_ORDER: ModuleType[] = ['decrypt', 'checksum', 'compress', 'tag'];
const UNLOCKABLE_MODULES: ModuleType[] = ['checksum', 'compress', 'tag'];

interface SaveBlob {
  v: number;
  data: Record<string, unknown>;
}

function fmt(n: number, decimals = 0): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toFixed(decimals);
}

function ensureBoard(state: GameState): GameState {
  if (state.contracts.length === 0 || isBoardExhausted(state)) {
    return refreshContractBoard(state);
  }
  return state;
}

function stamp(state: GameState): GameState {
  return { ...state, lastTickTime: Date.now() };
}

function saveToBrowser(state: GameState): void {
  const payload: SaveBlob = {
    v: SAVE_VERSION,
    data: serializeState(state) as Record<string, unknown>,
  };
  localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
}

function loadFromBrowser(): GameState | null {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as SaveBlob;
    if (parsed.v !== SAVE_VERSION || typeof parsed.data !== 'object' || parsed.data === null) {
      return null;
    }
    return deserializeState(parsed.data);
  } catch {
    return null;
  }
}

function bootstrapGame(): {
  state: GameState;
  offlineSummary: OfflineSummary | null;
  statusMessage: string;
} {
  const loaded = loadFromBrowser();
  if (!loaded) {
    return {
      state: stamp(ensureBoard(createInitialState())),
      offlineSummary: null,
      statusMessage: 'Fresh run initialized.',
    };
  }

  const { newState, summary } = processOfflineProgress(loaded, Date.now());
  return {
    state: stamp(ensureBoard(newState)),
    offlineSummary: summary.elapsedSeconds >= 1 ? summary : null,
    statusMessage: 'Loaded browser save.',
  };
}

export default function App() {
  const [boot] = useState(() => bootstrapGame());
  const [state, setState] = useState<GameState>(boot.state);
  const [autoTick, setAutoTick] = useState(true);
  const [statusMessage, setStatusMessage] = useState(boot.statusMessage);
  const [offlineSummary, setOfflineSummary] = useState<OfflineSummary | null>(boot.offlineSummary);

  const scrapRate = useMemo(() => calculateScrapGenRate(state), [state]);
  const creditRate = useMemo(() => calculateCreditRate(state), [state]);
  const fragmentInterval = useMemo(() => calculateFragmentInterval(state), [state]);
  const prestigeGain = useMemo(() => calculateReputationGain(state), [state]);

  useEffect(() => {
    if (!autoTick) return;
    const id = window.setInterval(() => {
      setState((prev) => stamp(ensureBoard(processTick(prev))));
    }, TICK_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [autoTick]);

  useEffect(() => {
    saveToBrowser(state);
  }, [state]);

  function runTicks(ticks: number): void {
    setState((prev) => {
      let next = prev;
      for (let i = 0; i < ticks; i++) {
        next = ensureBoard(processTick(next));
      }
      return stamp(next);
    });
    setStatusMessage(`Simulated ${ticks} tick${ticks === 1 ? '' : 's'}.`);
  }

  function mutate(
    onSuccess: string,
    action: (current: GameState) => GameState | null,
    onFailure = 'Action unavailable right now.',
  ): void {
    setState((prev) => {
      const next = action(prev);
      if (!next) {
        setStatusMessage(onFailure);
        return prev;
      }
      setStatusMessage(onSuccess);
      return stamp(ensureBoard(next));
    });
  }

  function handleLoadSave(): void {
    const loaded = loadFromBrowser();
    if (!loaded) {
      setStatusMessage('No browser save found yet.');
      return;
    }

    const { newState, summary } = processOfflineProgress(loaded, Date.now());
    setOfflineSummary(summary.elapsedSeconds >= 1 ? summary : null);
    setState(stamp(ensureBoard(newState)));
    setStatusMessage('Loaded browser save + applied offline progress.');
  }

  function handleNewGame(): void {
    if (!window.confirm('Start a new run? This replaces your current browser save.')) return;
    const fresh = stamp(ensureBoard(createInitialState()));
    setState(fresh);
    setOfflineSummary(null);
    setStatusMessage('New run started.');
  }

  function handlePrestige(): void {
    mutate(
      'Prestige complete. Welcome to your new ISP contract.',
      (current) => (canPrestige(current) ? applyPrestige(current) : null),
      'Prestige requires 3000 total payload.',
    );
  }

  const protocolEntries = Object.entries(PROTOCOL_DEFINITIONS) as [ProtocolFamily, (typeof PROTOCOL_DEFINITIONS)[ProtocolFamily]][];

  return (
    <div className="app-shell">
      <header className="header card">
        <div>
          <h1>Packet Foundry 17</h1>
          <p className="subtitle">Retro-futurist idle network refinery</p>
        </div>
        <div className="header-stats">
          <div>Tick: <strong>{state.tickCount}</strong></div>
          <div>Run: <strong>{state.meta.prestigeCount + 1}</strong></div>
          <div>Protocol: <strong>{PROTOCOL_DEFINITIONS[state.activeProtocol].name}</strong></div>
        </div>
      </header>

      {offlineSummary && (
        <section className="notice card">
          <strong>Offline progress applied:</strong>{' '}
          {fmt(offlineSummary.elapsedSeconds / 3600, 1)}h • +{fmt(offlineSummary.payloadEarned, 1)} payload • +
          {fmt(offlineSummary.creditsEarned, 1)} credits • +{offlineSummary.fragmentsEarned} fragments
        </section>
      )}

      <section className="top-grid">
        <article className="card">
          <h2>Resources</h2>
          <ul className="metric-list">
            <li>Scrap stream: <strong>{fmt(state.resources.scrap, 1)}</strong> ({scrapRate.toFixed(1)}/s)</li>
            <li>Certified payload: <strong>{fmt(state.resources.payload, 1)}</strong></li>
            <li>Credits: <strong>{fmt(state.resources.credits, 1)}</strong> ({creditRate.toFixed(2)} / payload)</li>
            <li>Schema fragments: <strong>{state.resources.fragments}</strong> (every {fragmentInterval} ticks)</li>
          </ul>
          <div className="row gap-sm wrap">
            <button onClick={() => runTicks(1)}>+1 Tick</button>
            <button onClick={() => runTicks(10)}>+10 Ticks</button>
            <button onClick={() => runTicks(60)}>+60 Ticks</button>
            <button onClick={() => setAutoTick((v) => !v)}>
              Auto Tick: {autoTick ? 'ON' : 'OFF'}
            </button>
          </div>
        </article>

        <article className="card">
          <h2>Run Controls</h2>
          <ul className="metric-list">
            <li>Status: <strong>{statusMessage}</strong></li>
            <li>Total payload produced: <strong>{fmt(state.stats.totalPayloadProduced, 1)}</strong></li>
            <li>Total credits earned: <strong>{fmt(state.stats.totalCreditsEarned, 1)}</strong></li>
          </ul>
          <div className="row gap-sm wrap">
            <button
              onClick={() => {
                saveToBrowser(state);
                setStatusMessage('Saved to browser storage.');
              }}
            >
              Save
            </button>
            <button onClick={handleLoadSave}>Load Save</button>
            <button onClick={handleNewGame} className="danger">New Run</button>
          </div>
        </article>

        <article className="card">
          <h2>Prestige</h2>
          <ul className="metric-list">
            <li>Ready: <strong>{canPrestige(state) ? 'Yes' : 'No'}</strong></li>
            <li>Rep gain on prestige: <strong>{prestigeGain}</strong></li>
            <li>Total reputation: <strong>{state.meta.totalReputation}</strong></li>
            <li>Available reputation: <strong>{availableReputation(state)}</strong></li>
          </ul>
          <button onClick={handlePrestige} disabled={!canPrestige(state)}>Start New ISP Contract</button>
        </article>
      </section>

      <section className="card">
        <h2>Protocol Switch</h2>
        <div className="grid-cols-3">
          {protocolEntries.map(([id, def]) => {
            const isCurrent = state.activeProtocol === id;
            const canAfford = state.resources.credits >= def.switchCost;
            return (
              <article key={id} className={`mini-card ${isCurrent ? 'active' : ''}`}>
                <h3>{def.name}</h3>
                <p>{def.description}</p>
                <p>Throughput ×{def.throughputMultiplier} • Credit ×{def.creditMultiplier}</p>
                <p>Switch Cost: {def.switchCost === 0 ? 'Free' : `${def.switchCost}C`}</p>
                <button
                  disabled={isCurrent || !canAfford}
                  onClick={() => mutate(`Protocol switched to ${def.name}.`, (current) => switchProtocol(current, id))}
                >
                  {isCurrent ? 'Current' : 'Switch'}
                </button>
              </article>
            );
          })}
        </div>
      </section>

      <section className="card">
        <h2>Pipeline Lanes</h2>
        <div className="grid-cols-3">
          {state.lanes.map((lane) => {
            const throughput = calculateLaneThroughput(lane, state);
            const queueTolerance = (state.upgradesPurchased['hw_buffer'] ?? 0) * 10;
            const coolingLevel = state.upgradesPurchased['hw_cooling'] ?? 0;
            const latencyReductionPct = coolingLevel * 0.05;
            const latencyShieldPerk = state.meta.perks['perk_latency_shield'] ?? 0;
            const totalLatencyReduction = Math.min(0.9, latencyReductionPct + latencyShieldPerk * 0.15);
            const { latencyMs, penalty } = calculateLatency(
              throughput.activeModuleCount,
              lane.queue,
              queueTolerance,
              totalLatencyReduction,
            );

            return (
              <article key={lane.id} className="mini-card">
                <h3>Lane {lane.id + 1}</h3>
                <p>Queue: {fmt(lane.queue, 1)} • Heat: {Math.round(lane.heat * 100)}%</p>
                <p>Latency: {Math.round(latencyMs)}ms • Efficiency: {Math.round(penalty * 100)}%</p>
                <p>
                  Capacity: {throughput.processingCapacity.toFixed(1)}/s • Output ×
                  {throughput.outputMultiplier.toFixed(2)}
                </p>

                <div className="module-grid">
                  {MODULE_ORDER.map((moduleType) => {
                    const unlocked = state.modules[moduleType].level > 0;
                    const enabled = lane.enabledModules.includes(moduleType);
                    return (
                      <label key={`${lane.id}-${moduleType}`} className={`checkbox ${!unlocked ? 'muted' : ''}`}>
                        <input
                          type="checkbox"
                          checked={enabled}
                          disabled={!unlocked}
                          onChange={() =>
                            mutate('Lane module configuration updated.', (current) =>
                              toggleLaneModule(current, lane.id, moduleType),
                            )
                          }
                        />
                        <span>{MODULE_DEFINITIONS[moduleType].name.replace(' Module', '')}</span>
                      </label>
                    );
                  })}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="card">
        <h2>Upgrade Shop</h2>
        <div className="grid-cols-3">
          {UNLOCKABLE_MODULES.map((moduleType) => {
            const def = MODULE_DEFINITIONS[moduleType];
            const isLocked = state.modules[moduleType].level === 0;
            if (!isLocked) return null;
            const canAfford = state.resources.credits >= def.unlockCost;
            return (
              <article key={`unlock-${moduleType}`} className="mini-card">
                <h3>Unlock {def.name}</h3>
                <p>{def.description}</p>
                <p>Cost: {def.unlockCost}C</p>
                <button
                  disabled={!canAfford}
                  onClick={() => mutate(`${def.name} unlocked.`, (current) => unlockModule(current, moduleType))}
                >
                  Unlock
                </button>
              </article>
            );
          })}

          {UPGRADE_DEFINITIONS.map((def) => {
            const currentLevel = state.upgradesPurchased[def.id] ?? 0;
            if (currentLevel >= def.maxLevel) return null;

            if (def.category === 'module') {
              const moduleType = def.id.replace('module_', '') as ModuleType;
              if (state.modules[moduleType].level === 0) return null;
            }

            const cost = upgradeCost(def, currentLevel);
            const canAfford = state.resources.credits >= cost;
            const levelLabel = def.category === 'module'
              ? `Lv${state.modules[def.id.replace('module_', '') as ModuleType].level + 1}`
              : `Lv${currentLevel + 1}`;

            return (
              <article key={def.id} className="mini-card">
                <h3>{def.name}</h3>
                <p>{def.description}</p>
                <p>{levelLabel} • Cost: {cost}C</p>
                <button
                  disabled={!canAfford}
                  onClick={() => mutate(`${def.name} purchased.`, (current) => buyUpgrade(current, def.id))}
                >
                  Buy
                </button>
              </article>
            );
          })}

          {state.lanes.length < 3 && (
            <article className="mini-card">
              <h3>Add Lane {state.lanes.length + 1}</h3>
              <p>Expand throughput by adding an extra lane.</p>
              <p>Cost: {state.lanes.length === 1 ? LANE_COST : LANE_COST_3}C</p>
              <button
                disabled={state.resources.credits < (state.lanes.length === 1 ? LANE_COST : LANE_COST_3)}
                onClick={() => mutate('Lane added successfully.', (current) => addLane(current))}
              >
                Add Lane
              </button>
            </article>
          )}
        </div>
      </section>

      <section className="card">
        <h2>Contract Board</h2>
        <div className="row gap-sm wrap mb-sm">
          <button onClick={() => mutate('Contract board refreshed.', (current) => refreshContractBoard(current))}>
            Refresh Board
          </button>
          <span>Active contract: <strong>{state.activeContractId ?? 'none'}</strong></span>
        </div>

        <div className="grid-cols-3">
          {state.contracts.map((contract) => {
            const complete = contract.progressPayload >= contract.targetPayload;
            const canAccept = !state.activeContractId && !contract.active && !contract.expired && !complete && contract.progressPayload <= 0;
            const progressPct = Math.min(100, Math.round((contract.progressPayload / contract.targetPayload) * 100));

            return (
              <article key={contract.id} className="mini-card">
                <h3>{contract.name}</h3>
                <p>{contract.description}</p>
                <p>Protocol: {PROTOCOL_DEFINITIONS[contract.protocol].name}</p>
                <p>
                  Progress: {fmt(contract.progressPayload, 1)} / {fmt(contract.targetPayload)} ({progressPct}%)
                </p>
                <p>
                  Rewards: {contract.rewardCredits}C • {contract.rewardFragments}F
                  {contract.timeRemainingS !== null ? ` • ⏱ ${Math.round(contract.timeRemainingS)}s` : ''}
                </p>
                <p>
                  Status:{' '}
                  <strong>
                    {contract.active
                      ? 'ACTIVE'
                      : contract.expired
                        ? 'EXPIRED'
                        : complete
                          ? 'COMPLETED'
                          : 'OPEN'}
                  </strong>
                </p>
                <button
                  disabled={!canAccept}
                  onClick={() => mutate(`Accepted contract: ${contract.name}.`, (current) => activateContract(current, contract.id))}
                >
                  Accept
                </button>
              </article>
            );
          })}
        </div>
      </section>

      <section className="card">
        <h2>Meta Perks</h2>
        <p>Spend reputation between runs to gain persistent bonuses.</p>
        <div className="grid-cols-3">
          {META_PERKS.map((perk) => {
            const level = state.meta.perks[perk.id] ?? 0;
            const maxed = level >= perk.maxLevel;
            const affordable = availableReputation(state) >= perk.costPerLevel;
            return (
              <article key={perk.id} className="mini-card">
                <h3>{perk.name}</h3>
                <p>{perk.description}</p>
                <p>
                  Level: {level}/{perk.maxLevel} • Cost: {perk.costPerLevel} rep
                </p>
                <button
                  disabled={maxed || !affordable}
                  onClick={() => mutate(`${perk.name} upgraded.`, (current) => buyMetaPerk(current, perk.id))}
                >
                  {maxed ? 'Maxed' : 'Buy'}
                </button>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}