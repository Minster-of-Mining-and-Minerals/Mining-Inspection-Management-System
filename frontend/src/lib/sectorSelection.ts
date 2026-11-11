"use client";

/**
 * The sector a central user is looking at (the Sector filter on each page:
 * components/common/SectorFilter.tsx).
 *
 * null = all sectors. It is sent to the API as the `X-Sector-Id` header (see redux/baseApi.ts);
 * the backend ignores it for sector users, who always see only their own sector.
 * Remembered in this browser only; logout clears it.
 */
import { useSyncExternalStore } from "react";

const STORAGE_KEY = "mims.selectedSectorId";
const listeners = new Set<() => void>();

const read = (): string | null => {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(STORAGE_KEY) || null;
  } catch {
    return null;
  }
};

let current: string | null = read();

export const getSelectedSectorId = (): string | null => current;

export const setSelectedSectorId = (id: string | null) => {
  if (id === current) return;
  current = id;
  try {
    if (id) window.localStorage.setItem(STORAGE_KEY, id);
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage blocked: keep it for this page only */
  }
  listeners.forEach((fn) => fn());
};

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

/** The selected sector id (null = all sectors), re-rendering when it changes. */
export const useSelectedSectorId = () => useSyncExternalStore(subscribe, getSelectedSectorId, () => null);
