// Serron — Developer demo agent simulation
// @owner: dev
// @role: mock-data

import { getState, subscribe } from '../../core/app-state.js';
import { getCommonLedger, setCommonLedger } from '../human-os/common-ledger.js';
import { addUserMemoryInsight, removeUserMemoryInsightsByPrefix } from '../talk/user-memory.js';

const DEMO_SOURCE = 'demo';

function demoRows() {
  /* Feed shows only real ledger rows (see agent-reports-feed filterRealInsightRows). No injected scout cards. */
  return [];
}

function applyDemoLedgerRows() {
  const ledger = getCommonLedger();
  const rows = Array.isArray(ledger.agent_insights) ? ledger.agent_insights : [];
  const realRows = rows.filter((r) => String(r?.source || '').toLowerCase() !== DEMO_SOURCE);
  ledger.agent_insights = [...realRows, ...demoRows()];
  ledger.last_update = new Date().toISOString();
  setCommonLedger(ledger);
}

function clearDemoLedgerRows() {
  const ledger = getCommonLedger();
  const rows = Array.isArray(ledger.agent_insights) ? ledger.agent_insights : [];
  ledger.agent_insights = rows.filter((r) => String(r?.source || '').toLowerCase() !== DEMO_SOURCE);
  ledger.last_update = new Date().toISOString();
  setCommonLedger(ledger);
}

function applyDemoMemory() {
  addUserMemoryInsight('Demo Insights: Running simulated multi-agent environment');
  addUserMemoryInsight('Demo Insights: User responds to clear red alerts');
  addUserMemoryInsight('Demo Insights: Practice cross-agent reasoning from synthetic data');
}

function clearDemoMemory() {
  removeUserMemoryInsightsByPrefix('Demo Insights:');
}

export function applyDemoAgentSimulation(isOn) {
  if (isOn) {
    applyDemoLedgerRows();
    applyDemoMemory();
  } else {
    clearDemoLedgerRows();
    clearDemoMemory();
  }
  if (typeof window !== 'undefined' && typeof window.updateFeedUI === 'function') {
    window.updateFeedUI();
  }
}

let _lastDemoMode = null;
let _subscribed = false;

export function initDemoAgentSimulation() {
  const run = (isOn) => {
    if (_lastDemoMode === isOn) return;
    _lastDemoMode = isOn;
    applyDemoAgentSimulation(isOn);
  };
  run(getState().demo?.isDemoMode === true);
  if (_subscribed) return;
  _subscribed = true;
  subscribe((nextState, oldState) => {
    const now = nextState?.demo?.isDemoMode === true;
    const prev = oldState?.demo?.isDemoMode === true;
    if (now !== prev) run(now);
  });
}

