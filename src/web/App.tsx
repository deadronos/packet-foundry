import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
const PRESTIGE_THRESHOLD = 3000;
const CHART_POINTS = 42;
const UI_PREFS_KEY = 'packet-foundry-web-ui-prefs';

const MODULE_ORDER: ModuleType[] = ['decrypt', 'checksum', 'compress', 'tag'];
const UNLOCKABLE_MODULES: ModuleType[] = ['checksum', 'compress', 'tag'];
const SECTION_KEYS = ['telemetry', 'protocols', 'lanes', 'upgrades', 'contracts', 'perks'] as const;

type SectionKey = (typeof SECTION_KEYS)[number];

const SECTION_LABELS: Record<SectionKey, string> = {
  telemetry: 'Telemetry',
  protocols: 'Protocol Switch',
  lanes: 'Pipeline Lanes',
  upgrades: 'Upgrade Shop',
  contracts: 'Contract Board',
  perks: 'Meta Perks',
};

interface SaveBlob {
  v: number;
  data: Record<string, unknown>;
}

interface UiPrefs {
  compactHudPinned: boolean;
  collapsedSections: Record<SectionKey, boolean>;
}

interface ProgressBarProps {
  label: string;
  value: number;
  max: number;
  hint?: string;
  tone?: 'cyan' | 'green' | 'amber' | 'rose';
}

interface CollapsibleSectionProps {
  sectionKey: SectionKey;
  title: string;
  summary?: string;
  collapsed: boolean;
  onToggle: (sectionKey: SectionKey) => void;
  actions?: ReactNode;
  children: ReactNode;
}

function createDefaultCollapsedSections(): Record<SectionKey, boolean> {
  return {
    telemetry: false,
    protocols: false,
    lanes: false,
    upgrades: false,
    contracts: false,
    perks: false,
  };
}

function defaultUiPrefs(): UiPrefs {
  return {
    compactHudPinned: true,
    collapsedSections: createDefaultCollapsedSections(),
  };
}

function loadUiPrefs(): UiPrefs {
  const fallback = defaultUiPrefs();
  const raw = localStorage.getItem(UI_PREFS_KEY);
  if (!raw) return fallback;

  try {
    const parsed = JSON.parse(raw) as Partial<UiPrefs>;
    const collapsedSections = createDefaultCollapsedSections();
    const incomingCollapsed = parsed.collapsedSections as Partial<Record<SectionKey, unknown>> | undefined;

    for (const key of SECTION_KEYS) {
      const value = incomingCollapsed?.[key];
      if (typeof value === 'boolean') collapsedSections[key] = value;
    }

    return {
      compactHudPinned: typeof parsed.compactHudPinned === 'boolean' ? parsed.compactHudPinned : fallback.compactHudPinned,
      collapsedSections,
    };
  } catch {
    return fallback;
  }
}

function saveUiPrefs(prefs: UiPrefs): void {
  localStorage.setItem(UI_PREFS_KEY, JSON.stringify(prefs));
}

function ProgressBar({ label, value, max, hint, tone = 'cyan' }: ProgressBarProps) {
  const safeMax = Math.max(max, 0.0001);
  const ratio = Math.max(0, Math.min(1, value / safeMax));
  const pct = Math.round(ratio * 100);
  return (
    <div className="progress-block" title={hint ?? `${label}: ${pct}%`}>
      <div className="progress-meta">
        <span>{label}</span>
        <strong>{pct}%</strong>
      </div>
      <progress className={`progress-track ${tone}`} value={pct} max={100} />
    </div>
  );
}

function Sparkline({
  title,
  data,
  formatter,
}: {
  title: string;
  data: number[];
  formatter: (value: number) => string;
}) {
  const maxValue = Math.max(1, ...data);
  const latest = data[data.length - 1] ?? 0;

  return (
    <article className="mini-card telemetry-card" title={`${title}: ${formatter(latest)}`}>
      <h3>{title}</h3>
      <p className="telemetry-current">{formatter(latest)}</p>
      <div className="sparkline" aria-hidden>
        {data.map((point, idx) => {
          const bucket = Math.max(1, Math.min(10, Math.round((point / maxValue) * 10)));
          return <span key={`${title}-${idx}`} className={`spark-bar h-${bucket}`} />;
        })}
        {data.length === 0 && <span className="spark-bar h-1" />}
      </div>
    </article>
  );
}

function CollapsibleSection({
  sectionKey,
  title,
  summary,
  collapsed,
  onToggle,
  actions,
  children,
}: CollapsibleSectionProps) {
  return (
    <section className={`card collapsible-section ${collapsed ? 'is-collapsed' : ''}`}>
      <div className="section-header">
        <button
          className="section-toggle"
          onClick={() => onToggle(sectionKey)}
          aria-expanded={collapsed ? 'false' : 'true'}
          aria-controls={`section-${sectionKey}`}
        >
          <span className="section-chevron" aria-hidden>{collapsed ? '▸' : '▾'}</span>
          <span className="section-title">{title}</span>
          {summary ? <span className="section-summary">{summary}</span> : null}
        </button>
        {actions ? <div className="section-actions">{actions}</div> : null}
      </div>

      <div id={`section-${sectionKey}`} className="section-content" hidden={collapsed}>
        {children}
      </div>
    </section>
  );
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
  const [uiPrefs] = useState(() => loadUiPrefs());
  const [state, setState] = useState<GameState>(boot.state);
  const [autoTick, setAutoTick] = useState(true);
  const [statusMessage, setStatusMessage] = useState(boot.statusMessage);
  const [offlineSummary, setOfflineSummary] = useState<OfflineSummary | null>(boot.offlineSummary);
  const [compactHudPinned, setCompactHudPinned] = useState(uiPrefs.compactHudPinned);
  const [collapsedSections, setCollapsedSections] = useState<Record<SectionKey, boolean>>({ ...uiPrefs.collapsedSections });
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);
  const [payloadRateHistory, setPayloadRateHistory] = useState<number[]>([]);
  const [creditRateHistory, setCreditRateHistory] = useState<number[]>([]);
  const previousTotals = useRef({
    tickCount: boot.state.tickCount,
    payload: boot.state.stats.totalPayloadProduced,
    credits: boot.state.stats.totalCreditsEarned,
  });

  const scrapRate = useMemo(() => calculateScrapGenRate(state), [state]);
  const creditRate = useMemo(() => calculateCreditRate(state), [state]);
  const fragmentInterval = useMemo(() => calculateFragmentInterval(state), [state]);
  const prestigeGain = useMemo(() => calculateReputationGain(state), [state]);
  const totalQueue = useMemo(() => state.lanes.reduce((sum, lane) => sum + lane.queue, 0), [state.lanes]);
  const activeContract = useMemo(
    () => state.contracts.find((contract) => contract.id === state.activeContractId) ?? null,
    [state.contracts, state.activeContractId],
  );

  const payloadPerTick = payloadRateHistory[payloadRateHistory.length - 1] ?? 0;
  const creditsPerTick = creditRateHistory[creditRateHistory.length - 1] ?? 0;
  const collapsedCount = useMemo(
    () => SECTION_KEYS.filter((key) => collapsedSections[key]).length,
    [collapsedSections],
  );

  const availableUpgradeCount = useMemo(() => {
    const unlockableCount = UNLOCKABLE_MODULES.filter((moduleType) => state.modules[moduleType].level === 0).length;
    const regularCount = UPGRADE_DEFINITIONS.filter((def) => {
      const currentLevel = state.upgradesPurchased[def.id] ?? 0;
      if (currentLevel >= def.maxLevel) return false;
      if (def.category !== 'module') return true;
      const moduleType = def.id.replace('module_', '') as ModuleType;
      return state.modules[moduleType].level > 0;
    }).length;
    const laneEntry = state.lanes.length < 3 ? 1 : 0;
    return unlockableCount + regularCount + laneEntry;
  }, [state]);

  const openContractCount = useMemo(
    () => state.contracts.filter((c) => !c.active && !c.expired && c.progressPayload < c.targetPayload).length,
    [state.contracts],
  );

  const maxedPerkCount = useMemo(
    () => META_PERKS.filter((perk) => (state.meta.perks[perk.id] ?? 0) >= perk.maxLevel).length,
    [state.meta.perks],
  );

  const activeContractPct = useMemo(() => {
    if (!activeContract) return 0;
    return Math.min(100, Math.round((activeContract.progressPayload / activeContract.targetPayload) * 100));
  }, [activeContract]);

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

  useEffect(() => {
    saveUiPrefs({ compactHudPinned, collapsedSections });
  }, [compactHudPinned, collapsedSections]);

  useEffect(() => {
    const prev = previousTotals.current;
    if (state.tickCount <= prev.tickCount) {
      previousTotals.current = {
        tickCount: state.tickCount,
        payload: state.stats.totalPayloadProduced,
        credits: state.stats.totalCreditsEarned,
      };
      setPayloadRateHistory([]);
      setCreditRateHistory([]);
      return;
    }

    const tickDelta = Math.max(1, state.tickCount - prev.tickCount);
    const payloadDelta = state.stats.totalPayloadProduced - prev.payload;
    const creditDelta = state.stats.totalCreditsEarned - prev.credits;

    setPayloadRateHistory((history) => [...history, payloadDelta / tickDelta].slice(-CHART_POINTS));
    setCreditRateHistory((history) => [...history, creditDelta / tickDelta].slice(-CHART_POINTS));

    previousTotals.current = {
      tickCount: state.tickCount,
      payload: state.stats.totalPayloadProduced,
      credits: state.stats.totalCreditsEarned,
    };
  }, [state.tickCount, state.stats.totalPayloadProduced, state.stats.totalCreditsEarned]);

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

  function resetTelemetry(next: GameState): void {
    previousTotals.current = {
      tickCount: next.tickCount,
      payload: next.stats.totalPayloadProduced,
      credits: next.stats.totalCreditsEarned,
    };
    setPayloadRateHistory([]);
    setCreditRateHistory([]);
  }

  function handleSave(): void {
    saveToBrowser(state);
    setStatusMessage('Saved to browser storage.');
  }

  function toggleAutoTick(): void {
    setAutoTick((value) => {
      const next = !value;
      setStatusMessage(`Auto Tick ${next ? 'enabled' : 'paused'}.`);
      return next;
    });
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
    resetTelemetry(newState);
    setState(stamp(ensureBoard(newState)));
    setStatusMessage('Loaded browser save + applied offline progress.');
  }

  function handleNewGame(): void {
    if (!window.confirm('Start a new run? This replaces your current browser save.')) return;
    const fresh = stamp(ensureBoard(createInitialState()));
    resetTelemetry(fresh);
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

  function toggleSection(sectionKey: SectionKey): void {
    setCollapsedSections((current) => {
      const nextState = { ...current, [sectionKey]: !current[sectionKey] };
      setStatusMessage(`${SECTION_LABELS[sectionKey]} ${nextState[sectionKey] ? 'collapsed' : 'expanded'}.`);
      return nextState;
    });
  }

  function toggleAllSections(): void {
    const shouldCollapse = collapsedCount < SECTION_KEYS.length;
    const next: Record<SectionKey, boolean> = {
      telemetry: shouldCollapse,
      protocols: shouldCollapse,
      lanes: shouldCollapse,
      upgrades: shouldCollapse,
      contracts: shouldCollapse,
      perks: shouldCollapse,
    };
    setCollapsedSections(next);
    setStatusMessage(shouldCollapse ? 'All major panels collapsed.' : 'All major panels expanded.');
  }

  function toggleCompactHudPin(): void {
    setCompactHudPinned((value) => {
      const next = !value;
      setStatusMessage(next ? 'Compact HUD pinned.' : 'Compact HUD unpinned.');
      return next;
    });
  }

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName.toLowerCase();
      if (target && (target.isContentEditable || tag === 'input' || tag === 'textarea' || tag === 'select')) {
        return;
      }

      const key = event.key.toLowerCase();

      if (key === 'escape' && isHelpModalOpen) {
        event.preventDefault();
        setIsHelpModalOpen(false);
        setStatusMessage('Shortcut help closed.');
        return;
      }

      if (key === 'h' || key === '?') {
        event.preventDefault();
        setIsHelpModalOpen((open) => {
          const next = !open;
          setStatusMessage(next ? 'Shortcut help opened.' : 'Shortcut help closed.');
          return next;
        });
        return;
      }

      if (isHelpModalOpen) return;

      if (key === '1') {
        runTicks(1);
        return;
      }
      if (key === '2') {
        runTicks(10);
        return;
      }
      if (key === '3') {
        runTicks(60);
        return;
      }
      if (key === ' ') {
        event.preventDefault();
        toggleAutoTick();
        return;
      }
      if (key === 's') {
        event.preventDefault();
        handleSave();
        return;
      }
      if (key === 'l') {
        event.preventDefault();
        handleLoadSave();
        return;
      }
      if (key === 'r') {
        event.preventDefault();
        mutate('Contract board refreshed.', (current) => refreshContractBoard(current));
        return;
      }
      if (key === 'p') {
        event.preventDefault();
        if (canPrestige(state)) {
          handlePrestige();
        } else {
          setStatusMessage('Prestige requires 3000 total payload.');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [state, isHelpModalOpen]);

  const protocolEntries = Object.entries(PROTOCOL_DEFINITIONS) as [ProtocolFamily, (typeof PROTOCOL_DEFINITIONS)[ProtocolFamily]][];
  const prestigeReady = canPrestige(state);
  const prestigeProgressValue = Math.min(PRESTIGE_THRESHOLD, state.stats.totalPayloadProduced);
  const activeContractProgress = activeContract
    ? Math.min(activeContract.targetPayload, activeContract.progressPayload)
    : 0;

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
          <div>
            Auto Tick: <strong className={autoTick ? 'txt-ok' : 'txt-muted'}>{autoTick ? 'ON' : 'OFF'}</strong>
          </div>
        </div>
        <div className="shortcut-hint">
          <span>Shortcuts:</span>
          <kbd>1</kbd>
          <kbd>2</kbd>
          <kbd>3</kbd>
          <kbd>Space</kbd>
          <kbd>S</kbd>
          <kbd>L</kbd>
          <kbd>R</kbd>
          <kbd>P</kbd>
          <kbd>H</kbd>
          <kbd>?</kbd>
          <button
            className="ghost-button"
            aria-keyshortcuts="h"
            title="Open keyboard shortcut help (H or ?)."
            onClick={() => setIsHelpModalOpen(true)}
          >
            Help
          </button>
        </div>
      </header>

      {offlineSummary && (
        <section className="notice card">
          <strong>Offline progress applied:</strong>{' '}
          {fmt(offlineSummary.elapsedSeconds / 3600, 1)}h • +{fmt(offlineSummary.payloadEarned, 1)} payload • +
          {fmt(offlineSummary.creditsEarned, 1)} credits • +{offlineSummary.fragmentsEarned} fragments
        </section>
      )}

      <section className={`compact-hud card ${compactHudPinned ? 'pinned' : ''}`} aria-label="Compact pinned HUD">
        <div className="compact-hud-main" role="status" aria-live="polite">
          <span className="hud-chip">Payload <strong>{fmt(state.stats.totalPayloadProduced, 1)}</strong></span>
          <span className="hud-chip">Credits <strong>{fmt(state.resources.credits, 1)}</strong></span>
          <span className="hud-chip">Queue <strong>{fmt(totalQueue, 1)}</strong></span>
          <span className="hud-chip">Protocol <strong>{PROTOCOL_DEFINITIONS[state.activeProtocol].name}</strong></span>
          <span className="hud-chip">Contract <strong>{activeContract ? `${activeContractPct}%` : 'None'}</strong></span>
          <span className="hud-chip">Collapsed <strong>{collapsedCount}/{SECTION_KEYS.length}</strong></span>
        </div>
        <div className="compact-hud-actions">
          <button aria-keyshortcuts="1" title="Shortcut: 1" onClick={() => runTicks(1)}>+1</button>
          <button aria-keyshortcuts=" " title="Shortcut: Space" onClick={toggleAutoTick}>{autoTick ? 'Pause' : 'Auto'}</button>
          <button title={collapsedCount < SECTION_KEYS.length ? 'Collapse all main panels.' : 'Expand all main panels.'} onClick={toggleAllSections}>
            {collapsedCount < SECTION_KEYS.length ? 'Collapse Panels' : 'Expand Panels'}
          </button>
          <button aria-keyshortcuts="h" title="Shortcut help (H or ?)." onClick={() => setIsHelpModalOpen(true)}>Help</button>
          <button title="Pin/unpin compact HUD." onClick={toggleCompactHudPin}>{compactHudPinned ? 'Unpin HUD' : 'Pin HUD'}</button>
        </div>
      </section>

      <section className="hud-grid">
        <article className="card hud-card">
          <h2>Throughput</h2>
          <div className="hud-number">{scrapRate.toFixed(1)}<small> scrap/s</small></div>
          <p>Current payload flow: <strong>{fmt(payloadPerTick, 2)}</strong> / tick</p>
        </article>
        <article className="card hud-card">
          <h2>Revenue</h2>
          <div className="hud-number">{creditRate.toFixed(2)}<small> c/payload</small></div>
          <p>Current credits flow: <strong>{fmt(creditsPerTick, 2)}</strong> / tick</p>
        </article>
        <article className="card hud-card">
          <h2>Congestion</h2>
          <div className="hud-number">{fmt(totalQueue, 1)}<small> queued scrap</small></div>
          <p>Lanes active: <strong>{state.lanes.length}</strong></p>
        </article>
      </section>

      <section className="top-grid">
        <article className="card">
          <h2>Resources</h2>
          <ul className="metric-list">
            <li>Buffered scrap: <strong>{fmt(totalQueue, 1)}</strong> ({scrapRate.toFixed(1)}/s input)</li>
            <li>Certified payload: <strong>{fmt(state.resources.payload, 1)}</strong></li>
            <li>Credits: <strong>{fmt(state.resources.credits, 1)}</strong> ({creditRate.toFixed(2)} / payload)</li>
            <li>Schema fragments: <strong>{state.resources.fragments}</strong> (every {fragmentInterval} ticks)</li>
          </ul>
          <div className="progress-stack">
            <ProgressBar
              label="Prestige target"
              value={prestigeProgressValue}
              max={PRESTIGE_THRESHOLD}
              tone={prestigeReady ? 'green' : 'cyan'}
              hint={`Need ${PRESTIGE_THRESHOLD} total payload to prestige.`}
            />
            {activeContract && (
              <ProgressBar
                label="Active contract"
                value={activeContractProgress}
                max={activeContract.targetPayload}
                tone="amber"
                hint={activeContract.name}
              />
            )}
          </div>
          <div className="row gap-sm wrap">
            <button aria-keyshortcuts="1" title="Shortcut: 1" onClick={() => runTicks(1)}>+1 Tick</button>
            <button aria-keyshortcuts="2" title="Shortcut: 2" onClick={() => runTicks(10)}>+10 Ticks</button>
            <button aria-keyshortcuts="3" title="Shortcut: 3" onClick={() => runTicks(60)}>+60 Ticks</button>
            <button
              aria-keyshortcuts=" "
              title="Shortcut: Space"
              onClick={toggleAutoTick}
            >
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
              aria-keyshortcuts="s"
              title="Shortcut: S"
              onClick={handleSave}
            >
              Save
            </button>
            <button aria-keyshortcuts="l" title="Shortcut: L" onClick={handleLoadSave}>Load Save</button>
            <button onClick={handleNewGame} className="danger">New Run</button>
          </div>
        </article>

        <article className="card">
          <h2>Prestige</h2>
          <ul className="metric-list">
            <li>Ready: <strong>{prestigeReady ? 'Yes' : 'No'}</strong></li>
            <li>Rep gain on prestige: <strong>{prestigeGain}</strong></li>
            <li>Total reputation: <strong>{state.meta.totalReputation}</strong></li>
            <li>Available reputation: <strong>{availableReputation(state)}</strong></li>
          </ul>
          <ProgressBar
            label="Payload toward prestige"
            value={prestigeProgressValue}
            max={PRESTIGE_THRESHOLD}
            tone={prestigeReady ? 'green' : 'cyan'}
          />
          <button aria-keyshortcuts="p" title="Shortcut: P" onClick={handlePrestige} disabled={!prestigeReady}>Start New ISP Contract</button>
        </article>
      </section>

      <CollapsibleSection
        sectionKey="telemetry"
        title="Telemetry"
        summary={`Window: ${payloadRateHistory.length}/${CHART_POINTS} ticks`}
        collapsed={collapsedSections.telemetry}
        onToggle={toggleSection}
      >
        <div className="grid-cols-2">
          <Sparkline title="Payload / tick" data={payloadRateHistory} formatter={(value) => `${fmt(value, 2)} payload`} />
          <Sparkline title="Credits / tick" data={creditRateHistory} formatter={(value) => `${fmt(value, 2)} credits`} />
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        sectionKey="protocols"
        title="Protocol Switch"
        summary={`Current: ${PROTOCOL_DEFINITIONS[state.activeProtocol].name}`}
        collapsed={collapsedSections.protocols}
        onToggle={toggleSection}
      >
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
                  title={def.requiredModules.length > 0 ? `Requires ${def.requiredModules.join(', ')} for full compliance bonus.` : 'No required modules.'}
                  disabled={isCurrent || !canAfford}
                  onClick={() => mutate(`Protocol switched to ${def.name}.`, (current) => switchProtocol(current, id))}
                >
                  {isCurrent ? 'Current' : 'Switch'}
                </button>
              </article>
            );
          })}
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        sectionKey="lanes"
        title="Pipeline Lanes"
        summary={`${state.lanes.length} active lane${state.lanes.length === 1 ? '' : 's'}`}
        collapsed={collapsedSections.lanes}
        onToggle={toggleSection}
      >
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
                <div className="progress-stack">
                  <ProgressBar
                    label="Queue pressure"
                    value={lane.queue}
                    max={Math.max(30, queueTolerance + throughput.processingCapacity * 8)}
                    tone={lane.queue > queueTolerance + 15 ? 'rose' : 'amber'}
                  />
                  <ProgressBar
                    label="Heat"
                    value={lane.heat * 100}
                    max={100}
                    tone={lane.heat >= 0.65 ? 'rose' : lane.heat >= 0.35 ? 'amber' : 'green'}
                  />
                </div>

                <div className="module-grid">
                  {MODULE_ORDER.map((moduleType) => {
                    const unlocked = state.modules[moduleType].level > 0;
                    const enabled = lane.enabledModules.includes(moduleType);
                    return (
                      <label
                        key={`${lane.id}-${moduleType}`}
                        className={`checkbox ${!unlocked ? 'muted' : ''}`}
                        title={MODULE_DEFINITIONS[moduleType].description}
                      >
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
      </CollapsibleSection>

      <CollapsibleSection
        sectionKey="upgrades"
        title="Upgrade Shop"
        summary={`${availableUpgradeCount} purchasable option${availableUpgradeCount === 1 ? '' : 's'}`}
        collapsed={collapsedSections.upgrades}
        onToggle={toggleSection}
      >
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
                  title={`Unlock ${def.name} for ${def.unlockCost} credits.`}
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
                  title={`Purchase ${def.name} (${levelLabel}) for ${cost} credits.`}
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
                title="Unlock additional processing lane."
                disabled={state.resources.credits < (state.lanes.length === 1 ? LANE_COST : LANE_COST_3)}
                onClick={() => mutate('Lane added successfully.', (current) => addLane(current))}
              >
                Add Lane
              </button>
            </article>
          )}
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        sectionKey="contracts"
        title="Contract Board"
        summary={`${openContractCount} open • active: ${state.activeContractId ?? 'none'}`}
        collapsed={collapsedSections.contracts}
        onToggle={toggleSection}
        actions={(
          <button
            aria-keyshortcuts="r"
            title="Shortcut: R"
            onClick={() => mutate('Contract board refreshed.', (current) => refreshContractBoard(current))}
          >
            Refresh
          </button>
        )}
      >
        <div className="row gap-sm wrap mb-sm">
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
                <ProgressBar label="Completion" value={contract.progressPayload} max={contract.targetPayload} tone="amber" />
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
      </CollapsibleSection>

      <CollapsibleSection
        sectionKey="perks"
        title="Meta Perks"
        summary={`${maxedPerkCount}/${META_PERKS.length} maxed`}
        collapsed={collapsedSections.perks}
        onToggle={toggleSection}
      >
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
                <ProgressBar label="Perk level" value={level} max={perk.maxLevel} tone="green" />
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
      </CollapsibleSection>

      {isHelpModalOpen && (
        <div
          className="help-modal-backdrop"
          role="presentation"
          onClick={() => {
            setIsHelpModalOpen(false);
            setStatusMessage('Shortcut help closed.');
          }}
        >
          <div
            className="help-modal card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="help-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="help-modal-header">
              <h2 id="help-modal-title">Keyboard & Accessibility Help</h2>
              <button onClick={() => setIsHelpModalOpen(false)} aria-label="Close help dialog">Close</button>
            </div>
            <p>
              This mode is keyboard-first and screen-reader friendly. Use <kbd>Esc</kbd> to close this dialog.
            </p>
            <ul className="shortcut-list">
              <li><kbd>1</kbd><span>Simulate 1 tick</span></li>
              <li><kbd>2</kbd><span>Simulate 10 ticks</span></li>
              <li><kbd>3</kbd><span>Simulate 60 ticks</span></li>
              <li><kbd>Space</kbd><span>Toggle auto tick</span></li>
              <li><kbd>S</kbd><span>Save to browser storage</span></li>
              <li><kbd>L</kbd><span>Load save + offline progress</span></li>
              <li><kbd>R</kbd><span>Refresh contract board</span></li>
              <li><kbd>P</kbd><span>Prestige (when available)</span></li>
              <li><kbd>H</kbd> / <kbd>?</kbd><span>Open/close this help panel</span></li>
              <li><kbd>Esc</kbd><span>Close this help panel</span></li>
            </ul>
            <p className="help-note">
              Tip: Collapse heavy sections during long sessions and keep the compact HUD pinned for a cleaner command center view.
            </p>
          </div>
        </div>
      )}

      <section className="quick-dock card" aria-label="Quick mobile actions">
        <button aria-keyshortcuts="1" title="Shortcut: 1" onClick={() => runTicks(1)}>+1</button>
        <button aria-keyshortcuts="2" title="Shortcut: 2" onClick={() => runTicks(10)}>+10</button>
        <button aria-keyshortcuts="3" title="Shortcut: 3" onClick={() => runTicks(60)}>+60</button>
        <button aria-keyshortcuts=" " title="Shortcut: Space" onClick={toggleAutoTick}>
          {autoTick ? 'Pause' : 'Auto'}
        </button>
        <button aria-keyshortcuts="s" title="Shortcut: S" onClick={handleSave}>
          Save
        </button>
      </section>
    </div>
  );
}