// /packages/client-desktop/src/renderer/src/App.js
import React, { useEffect, useState, useCallback } from 'react';
import './App.css';
import useWebSocket from './hooks/useWebSocket'; // Импортируем наш хук
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';

const HTTP_REQUEST_TIMEOUT = 5000; // 5 секунд для HTTP ответа
const GEMINI_HTTP_REQUEST_TIMEOUT = 15000; // 15 секунд для Gemini ответа

function App() {
  const [backendUrl, setBackendUrl] = useState('');
  const [wsUrl, setWsUrl] = useState('');
  const { isConnected, lastMessage, connect: connectWebSocket, sendRequest: sendWsRequest } = useWebSocket(wsUrl);
  const [responseText, setResponseText] = useState('');
  const [inputValue, setInputValue] = useState('');

  const [geminiPingMessage, setGeminiPingMessage] = useState('');
  const [geminiResponseText, setGeminiResponseText] = useState('');


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
      console.log(`Attempting WebSocket send for opId: ${operationId}`);
      const wsResponsePayload = await sendWsRequest(command, payload);
      console.log('WebSocket Response Payload:', wsResponsePayload);
      setResponseText(`WebSocket Success (opId: ${operationId}): ${JSON.stringify(wsResponsePayload)}`);
      return;
    } catch (wsError) {
      console.warn(`WebSocket request failed for opId ${operationId}:`, wsError.message);
      setResponseText(`WebSocket Error (opId: ${operationId}): ${wsError.message}. Falling back to HTTP...`);
      await sendPingViaHttp(operationId);
    }
  };
  
  useEffect(() => {
    if (lastMessage) {
        console.log("General WebSocket message received in App:", lastMessage);
    }
  }, [lastMessage]);

  const sendPingToGeminiBackend = async () => {
    if (!backendUrl) {
      setGeminiResponseText('Backend URL not set.');
      return;
    }
    // Example prompts to test function calling:
    // const messageForGemini = "What are the details for product ID 123?";
    // const messageForGemini = "Tell me about the Super Widget product.";
    const messageForGemini = geminiPingMessage.trim(); // Use the input field

    if (!messageForGemini) {
      setGeminiResponseText('Please enter a message for Gemini.');
      return;
    }

    setGeminiResponseText(`Sending message to Gemini via backend: "${messageForGemini}"...`);
    try {
      // For a stateful chat with function calling, you might send history
      // For now, let's assume each call is fresh or the backend manages simple history
      const response = await axios.post(`${backendUrl}/api/llm/ping-gemini`, {
        message: messageForGemini,
        // history: [] // Send empty history for a new "conversation" or manage on backend
      }, { timeout: GEMINI_HTTP_REQUEST_TIMEOUT * 2 }); // Increase timeout for multi-turn

      console.log('Backend Gemini Ping Response:', response.data);
      setGeminiResponseText(`Backend Response: ${JSON.stringify(response.data, null, 2)}`);
    } catch (error) {
      console.error('Backend Gemini Ping Error:', error);
      const errorData = error.response ? error.response.data : { message: error.message };
      setGeminiResponseText(`Backend Error: ${JSON.stringify(errorData, null, 2)}`);
    }
  };

  return (
    <div className="App">
      <header className="App-header">
        <p>ecKasse Client</p>
        <p>Backend URL: {backendUrl || 'Fetching...'}</p>
        <p>WebSocket URL: {wsUrl || 'Waiting for Backend URL...'}</p>
        <p>WebSocket Status: {isConnected ? 'Connected' : 'Disconnected'}</p>
        
        <div style={{margin: '20px', padding: '10px', border: '1px solid #ccc'}}>
          <h4>WebSocket Ping / HTTP Fallback</h4>
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Payload for ping_ws (optional)"
            style={{ marginRight: '10px' }}
          />
          <button onClick={handleSendCommand} disabled={!wsUrl}>
            Send Command (WebSocket with HTTP Fallback)
          </button>
          <button onClick={() => sendPingViaHttp(uuidv4())} disabled={!backendUrl} style={{ marginLeft: '10px' }}>
            Send HTTP Ping Directly
          </button>
          {lastMessage && <p>Last raw WS message: {JSON.stringify(lastMessage)}</p>}
          <p>Response: <pre>{responseText}</pre></p>
        </div>

        <div style={{margin: '20px', padding: '10px', border: '1px solid #ccc'}}>
          <h4>Gemini Ping-Pong Test (via Backend)</h4>
          <input
            type="text"
            value={geminiPingMessage}
            onChange={(e) => setGeminiPingMessage(e.target.value)}
            placeholder="Enter message for Gemini"
            style={{ marginRight: '10px', minWidth: '300px' }}
          />
          <button onClick={sendPingToGeminiBackend} disabled={!backendUrl}>
            Send to Gemini (via Backend)
          </button>
          <p>Gemini Response: <pre style={{ textAlign: 'left', backgroundColor: '#f0f0f0', color: '#333', padding: '10px', borderRadius: '5px', maxHeight: '300px', overflowY: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{geminiResponseText}</pre></p>
        </div>

      </header>
    </div>
  );
}

export default App;