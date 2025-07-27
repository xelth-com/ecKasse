import { writable } from 'svelte/store';
import { wsStore } from './wsStore.js';

export const logEntries = writable([]);

function sanitizeContext(context) {
  if (!context || typeof context !== 'object') {
    return {};
  }
  const sanitized = {};
  for (const key in context) {
    if (Object.prototype.hasOwnProperty.call(context, key)) {
      const value = context[key];
      if (['string', 'number', 'boolean'].includes(typeof value)) {
        sanitized[key] = value;
      } else if (value instanceof Error) {
        sanitized[key] = { message: value.message, stack: value.stack };
      } else {
        sanitized[key] = JSON.stringify(value, null, 2);
      }
    }
  }
  return sanitized;
}

export function addLog(level, message, context = {}) {
  const timestamp = new Date().toISOString().slice(0, 19).replace('T', ' ');
  logEntries.update(entries => [...entries.slice(-100), { timestamp, level, message, context }]);

  // Fire-and-forget log to the backend
  if (wsStore) {
    wsStore.send({
      command: 'logClientEvent',
      payload: { level, message, context: sanitizeContext(context) }
    });
  }
}

export function clearLogs() {
  logEntries.set([]);
}