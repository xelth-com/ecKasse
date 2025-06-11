// /packages/client-desktop/src/renderer/src/App.js
import React, { useEffect, useState, useCallback } from 'react';
import './App.css';
import useWebSocket from './hooks/useWebSocket'; // Импортируем наш хук

// Предполагаем, что axios установлен для HTTP запросов
// npm install axios --workspace=@eckasse/renderer-ui
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';

const HTTP_REQUEST_TIMEOUT = 5000; // 5 секунд для HTTP ответа

function App() {
  const [backendUrl, setBackendUrl] = useState('');
  const [wsUrl, setWsUrl] = useState('');
  const { isConnected, lastMessage, connect: connectWebSocket, sendRequest: sendWsRequest } = useWebSocket(wsUrl);
  const [responseText, setResponseText] = useState('');
  const [inputValue, setInputValue] = useState('');

  useEffect(() => {
    const getUrl = async () => {
      if (window.electronAPI && typeof window.electronAPI.getBackendUrl === 'function') {
        try {
          const url = await window.electronAPI.getBackendUrl();
          setBackendUrl(url);
          setWsUrl(url.replace(/^http/, 'ws')); // http://... -> ws://...
        } catch (error) {
          console.error("Error getting backend URL from Electron:", error);
          setResponseText("Error getting backend URL. Check Electron's main process.");
        }
      } else {
        // Фоллбэк для запуска в обычном браузере (если нужно)
        const defaultUrl = 'http://localhost:3030';
        console.warn(`Electron API not found, defaulting backend URL to ${defaultUrl}`);
        setBackendUrl(defaultUrl);
        setWsUrl(defaultUrl.replace(/^http/, 'ws'));
      }
    };
    getUrl();
  }, []);

  useEffect(() => {
    if (wsUrl) {
      connectWebSocket(); // Подключаемся, когда wsUrl установлен
    }
  }, [wsUrl, connectWebSocket]);

  const sendPingViaHttp = async (currentOperationId) => {
    if (!backendUrl) {
      setResponseText('Backend URL not set.');
      return;
    }
    try {
      setResponseText(`Sending HTTP Ping with ID: ${currentOperationId}...`);
      const response = await axios.get(`${backendUrl}/api/ping`, {
        params: { operationId: currentOperationId },
        timeout: HTTP_REQUEST_TIMEOUT,
      });
      console.log('HTTP Ping Response:', response.data);
      setResponseText(`HTTP Response: ${JSON.stringify(response.data)}`);
    } catch (error) {
      console.error('HTTP Ping Error:', error);
      setResponseText(`HTTP Error: ${error.message}`);
    }
  };

  const handleSendCommand = async () => {
    if (!isConnected && !backendUrl) {
      setResponseText('Not connected and no backend URL.');
      return;
    }

    const command = 'ping_ws'; // Тестовая команда для WebSocket
    const payload = { clientTime: new Date().toISOString(), data: inputValue || "test" };
    const operationId = uuidv4(); // Генерируем ID для этой операции

    setResponseText(`Sending command "${command}" with ID: ${operationId}...`);

    try {
      // 1. Пытаемся отправить по WebSocket
      console.log(`Attempting WebSocket send for opId: ${operationId}`);
      // window.electronAPI.log('info', `Attempting WebSocket send for opId: ${operationId}`);

      const wsResponsePayload = await sendWsRequest(command, payload);
      console.log('WebSocket Response Payload:', wsResponsePayload);
      setResponseText(`WebSocket Success (opId: ${operationId}): ${JSON.stringify(wsResponsePayload)}`);
      // Если успешно, HTTP не отправляем
      return;
    } catch (wsError) {
      // Ошибка WebSocket (таймаут или соединение закрыто/не установлено)
      console.warn(`WebSocket request failed for opId ${operationId}:`, wsError.message);
      // window.electronAPI.log('warn', `WebSocket request failed for opId ${operationId}`, { err: wsError.message });
      setResponseText(`WebSocket Error (opId: ${operationId}): ${wsError.message}. Falling back to HTTP...`);
      
      // 2. Фаллбэк на HTTP
      // Для /api/ping HTTP-сервер ожидает команду в URL или теле, а не как WebSocket
      // Мы просто вызовем HTTP пинг с тем же operationId
      await sendPingViaHttp(operationId);
    }
  };
  
  // Демонстрация последнего сообщения от WS (если сервер что-то шлет без запроса)
  useEffect(() => {
    if (lastMessage) {
        console.log("General WebSocket message received in App:", lastMessage);
        // Можно выводить это в UI, если нужно
    }
  }, [lastMessage]);


  return (
    <div className="App">
      <header className="App-header">
        <p>ecKasse Client</p>
        <p>Backend URL: {backendUrl || 'Fetching...'}</p>
        <p>WebSocket URL: {wsUrl || 'Waiting for Backend URL...'}</p>
        <p>WebSocket Status: {isConnected ? 'Connected' : 'Disconnected'}</p>
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="Payload for ping_ws (optional)"
        />
        <button onClick={handleSendCommand} disabled={!wsUrl}>
          Send Command (WebSocket with HTTP Fallback)
        </button>
        <button onClick={() => sendPingViaHttp(uuidv4())} disabled={!backendUrl}>
          Send HTTP Ping Directly
        </button>
        {lastMessage && <p>Last raw WS message: {JSON.stringify(lastMessage)}</p>}
        <p>Response: <pre>{responseText}</pre></p>
      </header>
    </div>
  );
}

export default App;