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

  // Форматирует разницу времени используя серверное время как базу
  formatTimeElapsed(dateString) {
    const serverNow = this.getServerTime();
    const date = new Date(dateString);
    const diffMs = serverNow - date;
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
      const serverTime = timeStore.getServerTime();
      set(serverTime);
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);

    return () => clearInterval(interval);
  },
  new Date()
);