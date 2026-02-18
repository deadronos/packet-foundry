# Packet Foundry — Expanded Design Report

## Executive Summary
Packet Foundry can stand out as an optimization-heavy idle game with strong thematic identity: a retro-futurist “data refinery” in a fractured interplanetary network economy. The player grows from a scrap relay operator into a major contract foundry by balancing **throughput, latency, and protocol compliance**. 

For launch, a focused MVP should include: one refinery map, 4 core modules, 3 protocol families, lane expansion, basic contracts, and a single prestige loop (“New ISP Contract”). The simulation should be deterministic and TypeScript-first (pure simulation core + UI layer). Post-MVP, expand with dynamic events, automation scripting, and deeper contract/faction systems to strengthen retention and replayability.

---

## 1) Lore & Worldbuilding Expansion

## 1.1 Core Setting
The year is 2189. The unified internet is gone; humanity runs on the **Shards**, thousands of partially compatible regional meshes maintained by corporate ISPs, civic cooperatives, and pirate relays. Raw data is unstable, encrypted, fragmented, and often corrupted in transit.

You are the new operator of a neglected station called **Packet Foundry 17**, located in orbital district **Aster Dock**. Your job: buy low-quality packet streams and refine them into upload-grade payloads that satisfy strict contract SLAs.

## 1.2 Tone & Fantasy
- **Mood:** industrial sci-fi + logistics puzzle + subtle cyberpunk satire
- **Player fantasy:** “I am the unseen architect of the network economy.”
- **Visual language:** humming racks, fiber conduits, glowing protocol glyphs, warning lights, terminal logs

## 1.3 Factions (Flavor + Progression Framing)
1. **Helios Transit ISP**  
   High-volume, strict latency demands; rewards throughput specialization.
2. **Civic Mesh Union**  
   Community traffic; values integrity and uptime consistency; rewards balanced builds.
3. **Noctilux Blackline**  
   Gray-market data; high payout, volatile events, corruption risk.
4. **Archivist Ring**  
   Ancient data restoration contracts; slow but high-value deep-processing chains.

These factions can be mostly narrative in MVP, then become a major system later.

## 1.4 Narrative Structure (Lightweight Idle-Friendly)
- **Chapter 1: Cold Start** — boot failing hardware and secure first local contract.
- **Chapter 2: Traffic War** — choose between reliable civic contracts or risky blackline bursts.
- **Chapter 3: Foundry Status** — unlock inter-shard protocols and prestige into elite contracts.

Narrative should be delivered through:
- short contract briefings,
- rare anomaly logs,
- milestone “operator messages” (non-intrusive).

## 1.5 In-World Terminology (Useful for UI)
- Raw packets = **Scrap Stream**
- Processed packets = **Certified Payload**
- Credits = **C-Reds**
- Research = **Schema Fragments**
- Prestige currency = **Contract Reputation**

---

## 2) Refined Progression, Upgrades, and Prestige Loops

## 2.1 Core Economy Layers
Use 4 clear layers:
1. **Scrap Stream** (input resource, generated continuously)
2. **Certified Payload** (output after module pipeline)
3. **C-Reds** (spendable currency for upgrades/expansion)
4. **Schema Fragments** (research currency from special contracts/events)

Optional (post-MVP): **Faction Standing** as a soft-gate meta progression.

## 2.2 Main Gameplay Loop
1. Generate Scrap Stream.
2. Route through module chain.
3. Meet protocol constraints (e.g., must include checksum + tag).
4. Upload payload.
5. Earn C-Reds + occasional Fragments.
6. Upgrade modules, add lanes, unlock protocol families.
7. Hit throughput wall → prestige for permanent multipliers and new tools.

## 2.3 Progression Phases
### Early Game (0–45 min)
- Unlock baseline modules: Decrypt, Checksum, Compress, Tag.
- Introduce latency penalty simply: too many hops lowers output value.
- First optimization lesson: shorter chain can outperform over-processing.

### Mid Game (45 min–4 hr)
- Add lane expansion and routing priorities.
- Unlock protocol families with trade-offs:
  - **Burst Protocol:** high throughput, higher corruption chance
  - **Secure Protocol:** slower, premium rewards
  - **Legacy Protocol:** strict module ordering, high bonuses
- Start contract board with timed objectives.

### Late Run (4+ hr per prestige cycle)
- Diminishing returns on flat upgrades.
- More value from topology redesign and contract targeting.
- Prestige trigger becomes attractive.

## 2.4 Upgrade Taxonomy
Keep upgrades in clear buckets:

1. **Hardware Upgrades** (lane-level)
- Module speed
- Queue capacity
- Energy efficiency (if energy added later)

2. **Software Upgrades** (global modifiers)
- Routing AI efficiency
- Latency mitigation
- Protocol parsing bonus

3. **Research Upgrades** (long-term run-defining)
- New module variants
- Contract multiplier passives
- Event handling perks

4. **Automation Upgrades** (quality-of-life + retention)
- Auto-accept preferred contracts
- Auto-reroute on congestion
- Threshold-based module toggles

## 2.5 Prestige Design: “New ISP Contract”
Prestige should reset run-state but grant meaningful strategic permanence.

### What resets
- C-Reds
- lane/module levels
- unlocked contracts (except baseline)

### What persists
- Contract Reputation (prestige currency)
- purchased meta perks
- discovered protocol knowledge (reduced future unlock cost)
- cosmetic/operator logs

### Prestige currency gain (example)
`Reputation = floor((TotalCertifiedPayload ^ 0.25) + HighTierContractsCompleted * 0.5 + UniqueProtocolsMastered)`

This formula rewards both raw scale and diversified play.

### Meta perk examples
- +X% global throughput
- -Y% latency penalty scaling
- Start run with 1 extra lane
- Unlock one “Advanced Module Socket”
- Better offline efficiency cap

### Prestige cadence target
- First prestige: 60–120 minutes (accessible)
- Later prestiges: 3–10 hours depending on optimization depth

---

## 3) Standout Mechanics / Events (5 Proposals)

## 3.1 Latency Heat Zones (Core Signature Mechanic)
Each lane has heat generated by queue pressure and chain length. Heat increases latency penalty nonlinearly. Players can cool lanes by:
- splitting traffic,
- reducing module depth,
- investing in buffering.

**Why it stands out:** gives a spatial/structural puzzle feel instead of pure number stacking.

## 3.2 SLA Contract Bursts
Occasional high-value contracts with strict constraints (e.g., “Deliver 30k payload in 90s under 40ms average latency”).

**Why it stands out:** short tactical spikes that break idle monotony and reward prepared builds.

## 3.3 Corruption Storms (World Event)
Global events temporarily increase packet corruption and rerouting costs. Players choose a stance:
- Safe mode (reduced income, stable output)
- Aggressive mode (high risk, high payout)

**Why it stands out:** meaningful situational choice, not just random punishment.

## 3.4 Protocol Drift
At intervals, protocol parameters shift (e.g., Compress gets less effective for one family; Checksum becomes mandatory for all high-tier uploads).

**Why it stands out:** keeps solved builds from becoming static; encourages adaptation.

## 3.5 Ghost Packets (Rare Opportunity Event)
Mysterious packet signatures appear briefly. If processed with a specific module order, they yield Schema Fragments or lore entries.

**Why it stands out:** chase mechanic + collectible narrative + optional mastery layer.

---

## 4) Practical TypeScript-First MVP Scope

## 4.1 MVP Goal
Ship a playable core loop that proves:
- deterministic simulation,
- meaningful optimization choices,
- satisfying first prestige within ~2 hours.

## 4.2 MVP In-Scope Systems
1. **Resource simulation** (Scrap → Payload → C-Reds)
2. **Pipeline lanes** (1–3 lanes)
3. **4 module types** (Decrypt, Checksum, Compress, Tag)
4. **Latency model** (chain + congestion penalty)
5. **Upgrade shop** (hardware/software tiers)
6. **Contract board** (simple rotating objectives)
7. **Prestige reset** (New ISP Contract + 4–6 meta perks)
8. **Offline progression** (capped + deterministic)
9. **Save/load + autosave**

## 4.3 MVP Out-of-Scope (defer)
- faction reputation trees
- advanced event engine
- visual node-graph drag-and-drop editor
- complex scripting automation
- multiplayer/leaderboards

## 4.4 TypeScript System Architecture (Suggested)
- `core/` pure simulation logic, no DOM dependencies
- `state/` serializable game state + reducers/actions
- `ui/` React/Solid/Vue components
- `persistence/` save schema + migrations
- `content/` data-driven configs (JSON/TS objects)

### Suggested folder skeleton
```txt
src/
  core/
    tick.ts
    pipeline.ts
    latency.ts
    contracts.ts
    prestige.ts
    balance.ts
  state/
    gameState.ts
    actions.ts
    selectors.ts
  content/
    modules.ts
    protocols.ts
    upgrades.ts
    contracts.ts
  ui/
    screens/
    components/
  persistence/
    saveLoad.ts
    migrations.ts
```

## 4.5 Data Model Sketch (MVP)
```ts
type ResourceKey = 'scrap' | 'payload' | 'credits' | 'fragments' | 'reputation';

interface ResourcePool {
  scrap: number;
  payload: number;
  credits: number;
  fragments: number;
  reputation: number;
}

interface ModuleState {
  id: string;
  type: 'decrypt' | 'checksum' | 'compress' | 'tag';
  level: number;
  enabled: boolean;
}

interface LaneState {
  id: string;
  modules: ModuleState[];
  queue: number;
  heat: number;
  throughputPerSec: number;
}

interface ContractState {
  id: string;
  protocol: 'burst' | 'secure' | 'legacy';
  targetPayload: number;
  timeLimitSec?: number;
  rewardCredits: number;
  rewardFragments: number;
  progressPayload: number;
  active: boolean;
}

interface MetaProgress {
  prestigeCount: number;
  reputationSpent: number;
  permanentBonuses: Record<string, number>;
}

interface GameState {
  version: number;
  now: number;
  resources: ResourcePool;
  lanes: LaneState[];
  activeProtocol: 'burst' | 'secure' | 'legacy';
  upgradesPurchased: Record<string, number>;
  contracts: ContractState[];
  meta: MetaProgress;
  stats: {
    totalPayloadProduced: number;
    totalCreditsEarned: number;
    bestLatencyMs: number;
    playtimeSec: number;
  };
}
```

## 4.6 Deterministic Update Loop Outline
Use fixed-step simulation for consistency and reliable offline progression.

Pseudo-flow per tick:
1. `delta = clamp(realDelta, 0, maxStep)`
2. Generate scrap input.
3. For each lane:
   - process queue through enabled modules,
   - compute lane throughput,
   - update heat/latency penalties.
4. Aggregate certified payload output.
5. Apply protocol bonus/penalty multipliers.
6. Convert payload → credits.
7. Update active contract progress/rewards.
8. Check milestone unlocks and prestige availability.
9. Persist autosave every N seconds.

Offline progress:
- compute elapsed time,
- replay simulation in coarse chunks (e.g., 1s or 5s steps),
- cap offline window (e.g., 8h base, upgradable).

---

## 5) Balancing Notes

## 5.1 Guiding Principles
- Prefer **trade-offs** over pure multipliers.
- Keep at least 2 viable archetypes (short/fast vs deep/high-value).
- First prestige should feel inevitable but exciting, not mandatory grind.

## 5.2 Key Balancing Levers
1. **Latency penalty slope**  
   Controls whether deep chains are viable.
2. **Contract reward scaling**  
   Encourages varied protocols, not single-strategy farming.
3. **Upgrade cost exponent**  
   Prevents infinite one-stat stacking.
4. **Protocol constraints**  
   Forces occasional rerouting/redesign.

## 5.3 Example Baseline Formulas
- `laneRate = baseRate * moduleMult * protocolMult * metaMult`
- `latencyPenalty = max(0, 1 - (0.06 * max(0, moduleCount - 3)) - (0.0008 * queue))`
- `effectiveOutput = laneRate * latencyPenalty`
- Upgrade cost curve: `cost = base * growth^level` (growth 1.12–1.18 by category)

## 5.4 Anti-Frustration Rules
- Never hard-fail early contracts.
- Allow undo/respec of lane layout at low/no cost in MVP.
- Show clear bottleneck diagnosis (e.g., “Lane 2 queue saturation +34% latency”).

---

## 6) Retention Hooks

## 6.1 Short-Term (minutes)
- Milestone unlocks every 5–10 minutes early on.
- “Next meaningful purchase” UI hint.
- Satisfying visual feedback on throughput spikes.

## 6.2 Mid-Term (hours)
- Contract streak bonuses.
- First prestige within session 1–2.
- Build identity (fast-lane specialist vs high-integrity operator).

## 6.3 Long-Term (days/weeks)
- Meta-progression tree with branching perk paths.
- Event calendar (corruption season, protocol week).
- Lore logbook completion (ghost packet archives).

## 6.4 Session Return Design
- On return, show a concise summary:
  - offline earnings,
  - top bottleneck,
  - recommended next action.
- Add one “quick objective” to reduce re-entry friction.

---

## 7) Next Two Iterations After MVP

## Iteration 1: “Protocol Turbulence” Update
Focus: replayability + tactical variety.

Add:
- 2 new module variants (e.g., scrubber, prioritizer)
- event system with Corruption Storms + SLA Bursts
- expanded contract board with modifiers
- improved bottleneck analytics panel

Expected outcome: stronger mid-game variety and session-to-session unpredictability.

## Iteration 2: “Network Politics” Update
Focus: long-term goals + meta identity.

Add:
- faction standing system with unique perks/contracts
- deeper prestige tree with branch choices
- automation rules (if/then routing presets)
- lore chapter progression tied to faction decisions

Expected outcome: durable long-term retention through strategic specialization.

---

## 8) Final Recommendation
For production efficiency, keep MVP tightly scoped around deterministic pipeline optimization and one prestige loop. The strongest differentiator is not raw complexity—it is the interplay of **throughput vs latency vs compliance** wrapped in coherent network-refinery fiction. Once the MVP proves this core tension is fun, layer events and faction meta to scale retention without overcomplicating the foundational simulation.