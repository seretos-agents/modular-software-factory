// Live stats dashboard for the System tab (skeleton: behaviour is added in the implement phase).
export const STATS_BASE =
  'https://raw.githubusercontent.com/seretos-agents/ecosystem-statistics/refs/heads/data';
export const MAX_DAYS = 30;
export const STAGES = [
  'created_to_released',
  'released_to_started',
  'started_to_pr_opened',
  'pr_opened_to_ci_green',
  'ci_green_to_done',
];
export const GATES = ['plan-critic', 'test-critic', 'review', 'ci', 'rebase'];

export async function fetchStats(fetchImpl) {}
export function kpis(days) {}
export function churnSeries(days) {}
export function throughputSeries(days) {}
export function throughputMini(days) {}
export function cycleRows(days) {}
export function roundsRows(days, lane) {}
export function escalationFunnel(days) {}
export function clarification(days) {}
export function chainsView(days) {}
export function badge(listed, fetched) {}
export async function initStats(doc, win, opts) {}
