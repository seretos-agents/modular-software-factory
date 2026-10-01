// Skeleton only (RED phase): compile-level stubs so the driving tests can import this module.
// The real data, reducer, renderer and player land in the implement phase.
import { MESSAGES } from './i18n.js';

export const FRAME_MS = 0;
export const COLUMNS = [];
export const PROCESS = {};
export const SCRIPT = [];

export function initialState() {
  return { cards: [], active: null };
}

export function applyFrame(state) {
  return state;
}

export function stateAt() {
  return initialState();
}

export function frameIndex() {
  return -1;
}

export function renderBoard() {}

export function initBoard(doc, win, { dict = MESSAGES, script = SCRIPT, interval = FRAME_MS } = {}) {
  void doc; void win; void dict; void script; void interval;
  return { go() {}, next() {}, prev() {}, play() {}, pause() {} };
}
