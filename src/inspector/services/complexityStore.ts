/**
 * Singleton store for tracking monday.com API complexity budget.
 * monday.com gives 10,000,000 points/minute for most plans.
 */

import { useState, useEffect } from "react";

export interface ComplexitySnapshot {
  before: number;
  after: number;
  query: number;
  timestamp: number;
}

const BUDGET = 10_000_000;
const WINDOW_MS = 60_000; // 1 minute

type Listener = () => void;

const snapshots: ComplexitySnapshot[] = [];
const listeners = new Set<Listener>();

function prune(): void {
  const cutoff = Date.now() - WINDOW_MS;
  while (snapshots.length > 0 && snapshots[0].timestamp < cutoff) {
    snapshots.shift();
  }
}

function notify(): void {
  for (const l of listeners) l();
}

export function addComplexity(c: Omit<ComplexitySnapshot, "timestamp">): void {
  prune();
  snapshots.push({ ...c, timestamp: Date.now() });
  notify();
}

export function getRemaining(): number {
  prune();
  if (snapshots.length === 0) return BUDGET;
  const latest = snapshots[snapshots.length - 1];
  return Math.max(0, latest.after);
}

export function getTotalUsed(): number {
  prune();
  return snapshots.reduce((sum, s) => sum + s.query, 0);
}

export function getBudget(): number {
  return BUDGET;
}

export function getSnapshots(): ComplexitySnapshot[] {
  prune();
  return [...snapshots];
}

/**
 * React hook for reactively tracking complexity budget.
 */
export function useComplexity(): {
  remaining: number;
  budget: number;
  used: number;
  snapshots: ComplexitySnapshot[];
} {
  const [, setTick] = useState(0);

  useEffect(() => {
    const listener = () => setTick((t) => t + 1);
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, []);

  return {
    remaining: getRemaining(),
    budget: BUDGET,
    used: getTotalUsed(),
    snapshots: getSnapshots(),
  };
}
