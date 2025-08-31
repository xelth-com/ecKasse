import { writable, derived } from 'svelte/store';

class TimeStore {
  constructor() {
    this.store = writable({
      serverTime: null,
      clientTime: null,
      timeOffset: 0, // Разница между сервером и клиентом в миллисекундах
      lastSync: null
    });
    
    this.subscribe = this.store.subscribe;
    this.update = this.store.update;
    this.set = this.store.set;
  }

  // Обновляет серверное время и пересчитывает offset
  updateServerTime(serverTimeISO) {
    const serverTime = new Date(serverTimeISO);
    const clientTime = new Date();
    const timeOffset = serverTime.getTime() - clientTime.getTime();
    
    this.update(state => ({
      ...state,
      serverTime,
      clientTime,
      timeOffset,
      lastSync: clientTime
    }));
  }

  // Возвращает текущее серверное время (рассчитанное)
  getServerTime() {
    let currentState;
    this.subscribe(state => currentState = state)();
    
    if (!currentState.lastSync) {
      return new Date(); // Fallback к клиентскому времени
    }
    
    const now = new Date();
    return new Date(now.getTime() + currentState.timeOffset);
  }

  // Форматирует разницу времени используя синхронизированное время
  formatTimeElapsed(dateString) {
    // For calculating elapsed time, we should use direct UTC comparison
    // to avoid double-applying timezone offsets
    const now = new Date(); // Current client time in UTC
    const date = new Date(dateString); // Parse the timestamp (should be UTC)
    
    // Calculate the difference directly in UTC
    const diffMs = now.getTime() - date.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    
    return diffMinutes > 0 ? diffMinutes : 0;
  }

  // Сбрасывает offset (для ручной корректировки)
  resetTimeOffset() {
    this.update(state => ({
      ...state,
      timeOffset: 0,
      lastSync: null
    }));
  }
}

export const timeStore = new TimeStore();

// Derived store для отображения текущего времени
export const currentTime = derived(
  timeStore,
  ($timeStore, set) => {
    const updateTime = () => {
      // console.log('⏱️ [timeStore] Tick! Updating current time.');
      const serverTime = timeStore.getServerTime();
      set(serverTime);
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);

    return () => clearInterval(interval);
  },
  new Date()
);

// Derived store for minute-based time updates (optimized for UI components)
export const currentMinuteTime = derived(
  currentTime,
  ($currentTime, set) => {
    let lastMinute = null;
    
    return currentTime.subscribe((time) => {
      const currentMinute = time.getMinutes();
      
      // Only update if the minute has changed
      if (lastMinute !== currentMinute) {
        lastMinute = currentMinute;
        set({
          time: time,
          minute: currentMinute
        });
      }
    });
  },
  {
    time: new Date(),
    minute: new Date().getMinutes()
  }
);