import { writable } from 'svelte/store';

export const controlCenterVisible = writable(false);

export function toggleControlCenter() {
  controlCenterVisible.update(visible => !visible);
}

export function showControlCenter() {
  controlCenterVisible.set(true);
}

export function hideControlCenter() {
  controlCenterVisible.set(false);
}