# Packet Foundry 17

> An optimization-heavy idle game set in a retro-futurist interplanetary network economy.

You operate **Packet Foundry 17** in orbital district Aster Dock. Buy low-quality packet streams, route them through a configurable processing pipeline, and sell certified payloads for C-Reds. Hit the throughput ceiling, then prestige into a stronger ISP contract with permanent meta perks.

---

## Quick Start

```bash
npm install
npm run dev       # website (Vite + React)
npm run dev:cli   # interactive CLI
npm run preview   # preview production web build
npm run smoke     # automated milestone demonstration
npm test          # unit test suite
npm run build     # TypeScript type-check + web build
```

### GitHub Pages Deployment

- Deploys to: `https://deadronos.github.io/packet-foundry/`
- Trigger: push a tag matching `v*` (example: `v1.0.0`)
- Workflow: `.github/workflows/deploy-pages.yml`
- Vite production base is set to `/packet-foundry/` for Pages compatibility

### Web Save Behavior

- The website version auto-saves to browser `localStorage` under `packet-foundry-web-save`.
- Loading the site applies offline progress based on the last saved tick time.
- CLI save files (`packet-foundry-save.json`) are still used only by the CLI mode.

### Web UX Controls

- Keyboard shortcuts: `1` (+1 tick), `2` (+10 ticks), `3` (+60 ticks), `Space` (toggle auto tick), `S` (save), `L` (load), `R` (refresh contracts), `P` (prestige).
- Keyboard help modal: press `H` or `?` to open shortcut/accessibility help, `Esc` to close.
- Responsive quick-action dock appears on mobile for one-tap ticking/save controls.
- HUD includes progress bars (prestige/contract/lane heat) and mini telemetry charts for payload/credits per tick.
- Major gameplay panels are collapsible for long sessions, and a compact HUD can be pinned/unpinned while you scroll.

---

## Gameplay Overview

### Core Loop

1. **Generate scrap** — raw packets arrive continuously across your lanes.
2. **Process through pipeline** — enabled modules decrypt, verify, compress, and tag each packet batch.
3. **Earn C-Reds** — certified payload auto-sells at the current credit rate.
4. **Upgrade & expand** — buy hardware upgrades (faster processing), software upgrades (more scrap, better credits), and new modules.
5. **Complete contracts** — rotating board of protocol-specific objectives pay bonus credits and Schema Fragments.
6. **Prestige ("New ISP Contract")** — once you've certified ≥ 3 000 payload, prestige to gain Contract Reputation, buy permanent meta perks, and start a faster run.

### Resources

| Resource | Description |
|---|---|
| **Scrap Stream** | Raw packets — generated automatically per lane |
| **Certified Payload** | Output of the pipeline — used for contract progress |
| **C-Reds (Credits)** | Main spendable currency for upgrades & expansion |
| **Schema Fragments** | Research currency from contracts and drops |
| **Contract Reputation** | Prestige currency — persists across runs |

### Modules

Each module you unlock is enabled on every lane. They form a processing chain that boosts throughput and output quality — but deeper chains increase latency, applying a penalty to effective output.

| Module | Effect | Required for |
|---|---|---|
| **Decrypt** | Base processing (starts unlocked) | — |
| **Checksum** | +integrity, +credits | Secure protocol |
| **Compress** | +payload-per-scrap | — |
| **Tag** | +routing, +fragments | Legacy protocol |

**Latency formula:** `penalty = max(0.1, 1 − 0.06×max(0, modules−3) − 0.0008×queueSize)`

### Protocol Families

| Protocol | Processing speed | Credit rate | Special |
|---|---|---|---|
| **Burst** | 1.4× | 0.9× | High volume, no requirements |
| **Secure** | 0.8× | 1.5× | Premium; needs Checksum |
| **Legacy** | 1.0× | 1.2× | Bonus if Tag is active |

### Pipeline Lanes (max 3)

- Lane 1 is free. Lane 2 costs 200C, Lane 3 costs 500C.
- All lanes share the same module configuration and protocol.
- Each lane has an independent queue and heat tracker (visible in the CLI header).

### Upgrade Shop

- **Hardware** — Module Speed (+2 processing/s per level), Buffer Expansion (queue tolerance), Lane Cooling (latency reduction)
- **Software** — Routing AI (+15% scrap/s per level), Protocol Parser (+10% credits), Fragment Miner (faster fragment drops)
- **Module upgrades** — per-module level up to 5 (increases both capacity and output multiplier)

### Contract Board

3 contracts are shown at a time, rotating across the three protocol families. Accept one at a time; it progresses automatically as payload is produced. Timed contracts expire if not completed in time. Completing high-tier contracts contributes to your prestige reputation formula.

### Prestige — New ISP Contract

**Trigger:** 3 000 total payload certified.

**Formula:** `rep = floor(totalPayload^0.25) + completedContracts×0.25 + highTierContracts×0.5 + uniqueProtocols`

**Resets:** credits, lanes (back to 1), module levels, contracts  
**Persists:** Contract Reputation, purchased meta perks, prestige count

#### Meta Perks

| Perk | Max Level | Cost/Level | Effect |
|---|---|---|---|
| Throughput Boost | 3 | 2 rep | +10% scrap gen & processing speed |
| Latency Shield | 2 | 3 rep | −15% latency penalty scaling |
| Head Start | 1 | 4 rep | Begin run with 2 lanes |
| Fragment Surge | 2 | 2 rep | −5 ticks between fragment drops |
| Offline Cap+ | 1 | 3 rep | +4h offline cap |
| Credit Multiplier | 1 | 5 rep | +20% credit rate permanently |

### Offline Progression

- Offline time is simulated in 60-second chunks, capped at 8 hours (12h with Offline Cap+).
- Progress is summarised when you reload.
- Autosave triggers every 60 ticks; game also saves on quit.

---

## Architecture

```
src/
  core/
    types.ts        ← All shared type definitions (pure, no imports)
    latency.ts      ← Pure latency penalty math
    pipeline.ts     ← Lane throughput & scrap-gen calculations
    tick.ts         ← Deterministic fixed-step tick + offline replay
    contracts.ts    ← Contract board management
    prestige.ts     ← Reputation formula, prestige reset, perk buying
  content/
    modules.ts      ← Module definitions (capacity, multipliers, costs)
    protocols.ts    ← Protocol family definitions
    upgrades.ts     ← Hardware/software/module upgrade catalogue
    contracts.ts    ← Contract templates + meta perk catalogue
  state/
    gameState.ts    ← Initial state factory + JSON ser/deser helpers
    actions.ts      ← Pure state-mutation functions (buy, unlock, switch)
  persistence/
    saveLoad.ts     ← JSON save/load + autosave helper
  web/
    App.tsx         ← Browser game UI (React)
    main.tsx        ← Web entrypoint
    styles.css      ← UI theme/layout
  ui/
    cli.ts          ← Interactive terminal menu (readline-based)
  vite-env.d.ts     ← Vite client typings
scripts/
  smoke.ts          ← Automated gameplay simulation / milestone demo
tests/
  tick.test.ts      ← Deterministic tick, offline replay, contract auto-complete
  latency.test.ts   ← Latency penalty math
  contracts.test.ts ← Board rotation, activation, completion, expiry
  prestige.test.ts  ← Reputation formula, reset, meta perk lifecycle
```

### Design Principles

- **Deterministic core** — `processTick(state, delta)` is a pure function; same inputs always produce the same output. No `Date.now()` or `Math.random()` inside the tick.
- **Immutability** — every action and tick returns a new state object (deep clone via JSON).
- **Separation of concerns** — `core/` contains zero I/O; `ui/` and `persistence/` handle all side effects.
- **Data-driven content** — all game constants live in `content/`; balancing is done by editing those files.

---

## Development Notes

- TypeScript strict mode; `bundler` module resolution.
- Tests via Vitest (`npm test`).
- Website via Vite + React (`npm run dev`).
- CLI via `tsx` (`npm run dev:cli`).
- Save file: `./packet-foundry-save.json` in the working directory.
