// /packages/client-desktop/src/renderer/src/hooks/useWebSocket.js
import { useState, useEffect, useRef, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid'; // Для генерации operationId

// Простая реализация EventEmitter для отслеживания ответов
class EventEmitter {
  constructor() {
    this.events = {};
  }
  on(event, listener) {
    if (!this.events[event]) {
      this.events[event] = [];
    }
    this.events[event].push(listener);
    return () => this.off(event, listener);
  }
  off(event, listener) {
    if (!this.events[event]) return;
    this.events[event] = this.events[event].filter(l => l !== listener);
  }
  emit(event, ...args) {
    if (!this.events[event]) return;
    this.events[event].forEach(listener => listener(...args));
  }
}

const WEBSOCKET_REQUEST_TIMEOUT = 3000; // 3 секунды для ответа по WebSocket

const useWebSocket = (url) => {
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState(null);
  const socketRef = useRef(null);
  const requestEmitterRef = useRef(new EventEmitter()); // Для отслеживания ответов на конкретные запросы
  const pendingRequestsRef = useRef(new Map()); // operationId -> { resolve, reject, timerId }

  const connect = useCallback(() => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      console.log('WebSocket already connected');
      return;
    }

    console.log(`Attempting to connect to WebSocket: ${url}`);
    // window.electronAPI.log('info', `Attempting to connect to WebSocket: ${url}`); // Если есть логгер через IPC

    const socket = new WebSocket(url);
    socketRef.current = socket;

    socket.onopen = () => {
      console.log('WebSocket connected');
      // window.electronAPI.log('info', 'WebSocket connected');
      setIsConnected(true);
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('WebSocket message received:', data);
        // window.electronAPI.log('info', 'WebSocket message received', data);
        setLastMessage(data); // Обновляем последнее общее сообщение

        // Если это ответ на конкретный запрос
        if (data.operationId && pendingRequestsRef.current.has(data.operationId)) {
          const request = pendingRequestsRef.current.get(data.operationId);
          clearTimeout(request.timerId); // Отменяем таймаут для этого запроса
          if (data.status === 'success') {
            request.resolve(data.payload);
          } else {
            request.reject(new Error(data.payload?.message || data.error || 'WebSocket request failed'));
          }
          pendingRequestsRef.current.delete(data.operationId);
        }
        // Также можно эмитить событие для более общей обработки
        requestEmitterRef.current.emit('message', data);
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
        // window.electronAPI.log('error', 'Error parsing WebSocket message', { err: error.message });
      }
    };

    socket.onclose = () => {
      console.log('WebSocket disconnected');
      // window.electronAPI.log('info', 'WebSocket disconnected');
      setIsConnected(false);
      socketRef.current = null;
      // Здесь можно добавить логику автоматического переподключения, если нужно
    };

    socket.onerror = (error) => {
      console.error('WebSocket error:', error);
      // window.electronAPI.log('error', 'WebSocket error', { err: error.message });
      setIsConnected(false); // Обычно после ошибки соединение закрывается
      socketRef.current = null;
    };
  }, [url]);

  const sendMessage = useCallback((messageObject) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      const messageString = JSON.stringify(messageObject);
      console.log('Sending WebSocket message:', messageObject);
      // window.electronAPI.log('info', 'Sending WebSocket message', messageObject);
      socketRef.current.send(messageString);
      return true;
    } else {
      console.warn('WebSocket not connected. Message not sent:', messageObject);
      // window.electronAPI.log('warn', 'WebSocket not connected. Message not sent:', messageObject);
      return false;
    }
  }, []);

  const sendRequest = useCallback((command, payload) => {
    const operationId = uuidv4();
    return new Promise((resolve, reject) => {
      if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
        const message = { command, payload, operationId };
        
        const timerId = setTimeout(() => {
          pendingRequestsRef.current.delete(operationId);
          reject(new Error(`WebSocket request timed out for operationId: ${operationId}`));
        }, WEBSOCKET_REQUEST_TIMEOUT);

        pendingRequestsRef.current.set(operationId, { resolve, reject, timerId });
        sendMessage(message);
      } else {
        reject(new Error('WebSocket is not connected.'));
      }
    });
  }, [sendMessage]);


  useEffect(() => {
    // Не подключаемся автоматически при инициализации хука,
    // connect() нужно будет вызвать явно
    return () => {
      if (socketRef.current) {
        socketRef.current.close();
      }
    };
  }, []); // Пустой массив зависимостей для эффекта очистки

  return { isConnected, lastMessage, connect, sendMessage, sendRequest };
};

export default useWebSocket;