import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import type { GameState } from '../core/types.js';
import { serializeState, deserializeState } from '../state/gameState.js';

const SAVE_VERSION = 1;
const DEFAULT_SAVE_PATH = './packet-foundry-save.json';

// ─── Serialization ─────────────────────────────────────────────────────────

export function saveToString(state: GameState): string {
  return JSON.stringify({ v: SAVE_VERSION, data: serializeState(state) }, null, 2);
}

export function loadFromString(json: string): GameState {
  const parsed = JSON.parse(json) as { v: number; data: Record<string, unknown> };
  if (parsed.v !== SAVE_VERSION) {
    throw new Error(`Save file version mismatch: expected ${SAVE_VERSION}, got ${parsed.v}`);
  }
  return deserializeState(parsed.data);
}

// ─── File I/O ──────────────────────────────────────────────────────────────

export function saveToFile(state: GameState, path = DEFAULT_SAVE_PATH): void {
  writeFileSync(path, saveToString(state), 'utf8');
}

export function loadFromFile(path = DEFAULT_SAVE_PATH): GameState | null {
  if (!existsSync(path)) return null;
  try {
    return loadFromString(readFileSync(path, 'utf8'));
  } catch (err) {
    console.error('[SaveLoad] Failed to load save:', err);
    return null;
  }
}

export function hasSaveFile(path = DEFAULT_SAVE_PATH): boolean {
  return existsSync(path);
}

// ─── Autosave helper ──────────────────────────────────────────────────────

const AUTOSAVE_INTERVAL_TICKS = 60; // save every 60 ticks

export function shouldAutosave(state: GameState): boolean {
  return state.tickCount % AUTOSAVE_INTERVAL_TICKS === 0;
}
