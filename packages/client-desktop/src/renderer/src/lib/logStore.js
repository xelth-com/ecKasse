import { writable } from 'svelte/store';

export const logEntries = writable([]);

export function addLog(level, message) {
  const timestamp = new Date().toISOString().slice(0, 19).replace('T', ' ');
  logEntries.update(entries => [...entries, { timestamp, level, message }]);
}

export function clearLogs() {
  logEntries.set([]);
}