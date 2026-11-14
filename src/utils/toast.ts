import { useSyncExternalStore } from 'react';

export const TOAST_VISIBLE_MS = 3200;
export const TOAST_LEAVE_MS = 280;
const MAX_TOASTS = 3;

export type ToastItem = {
  id: number;
  text: string;
  leaving: boolean;
};

let items: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const timers = new Map<number, number[]>();

function emit(): void {
  for (const listener of listeners) listener();
}

function setItems(next: ToastItem[]): void {
  items = next;
  emit();
}

function stopTimers(id: number): void {
  const ids = timers.get(id);
  if (!ids) return;
  for (const timer of ids) window.clearTimeout(timer);
  timers.delete(id);
}

function leave(id: number): void {
  if (!items.some((item) => item.id === id && !item.leaving)) return;
  setItems(items.map((item) => (item.id === id ? { ...item, leaving: true } : item)));
  const drop = window.setTimeout(() => {
    setItems(items.filter((item) => item.id !== id));
    timers.delete(id);
  }, TOAST_LEAVE_MS);
  timers.set(id, [drop]);
}

export function showToast(text: string): void {
  const message = text.trim();
  if (!message) return;
  const item: ToastItem = { id: nextId++, text: message, leaving: false };
  const next = [...items, item];
  while (next.length > MAX_TOASTS) {
    const dropped = next.shift();
    if (dropped) stopTimers(dropped.id);
  }
  setItems(next);
  timers.set(item.id, [window.setTimeout(() => leave(item.id), TOAST_VISIBLE_MS)]);
}

export function subscribeToasts(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function toastSnapshot(): ToastItem[] {
  return items;
}

export function useToasts(): ToastItem[] {
  return useSyncExternalStore(subscribeToasts, toastSnapshot, toastSnapshot);
}
