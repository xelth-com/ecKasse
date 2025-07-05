// Main application logic
class App {
  constructor() {
    this.backendUrl = '';
    this.wsUrl = '';
    this.responseText = '';
    this.geminiResponseText = '';
    this.HTTP_REQUEST_TIMEOUT = 5000; // 5 seconds
    this.GEMINI_HTTP_REQUEST_TIMEOUT = 15000; // 15 seconds
    
    this.init();
  }

  async init() {
    await this.setupBackendUrl();
    this.setupWebSocket();
    this.setupEventListeners();
    this.setupDOMElements();
  }

  async setupBackendUrl() {
    if (window.electronAPI && typeof window.electronAPI.getBackendUrl === 'function') {
      try {
        const url = await window.electronAPI.getBackendUrl();
        this.backendUrl = url;
        this.wsUrl = url.replace(/^http/, 'ws');
      } catch (error) {
        console.error("Error getting backend URL from Electron:", error);
        this.setResponseText("Error getting backend URL. Check Electron's main process.");
      }
    } else {
      // Fallback for running in regular browser
      const defaultUrl = 'http://localhost:3030';
      console.warn(`Electron API not found, defaulting backend URL to ${defaultUrl}`);
      this.backendUrl = defaultUrl;
      this.wsUrl = defaultUrl.replace(/^http/, 'ws');
    }
    
    this.updateUrlDisplay();
  }

  setupWebSocket() {
    if (this.wsUrl) {
      window.wsManager.connect(this.wsUrl);
    }

    window.wsManager.on('statusChange', (connected) => {
      this.updateWebSocketStatus(connected);
    });

    window.wsManager.on('message', (message) => {
      this.updateLastMessage(message);
    });
  }

  setupEventListeners() {
    document.getElementById('send-command-btn').addEventListener('click', () => {
      this.handleSendCommand();
    });

    document.getElementById('send-http-ping-btn').addEventListener('click', () => {
      this.sendPingViaHttp(this.generateUUID());
    });

    document.getElementById('send-gemini-btn').addEventListener('click', () => {
      this.sendPingToGeminiBackend();
    });
  }

  setupDOMElements() {
    // Enable buttons once everything is initialized
    if (this.wsUrl) {
      document.getElementById('send-command-btn').disabled = false;
    }
    if (this.backendUrl) {
      document.getElementById('send-http-ping-btn').disabled = false;
      document.getElementById('send-gemini-btn').disabled = false;
    }
  }

  updateUrlDisplay() {
    document.getElementById('backend-url').textContent = this.backendUrl || 'Fetching...';
    document.getElementById('ws-url').textContent = this.wsUrl || 'Waiting for Backend URL...';
  }

  updateWebSocketStatus(connected) {
    document.getElementById('ws-status').textContent = connected ? 'Connected' : 'Disconnected';
  }

  updateLastMessage(message) {
    const element = document.getElementById('last-ws-message');
    if (message) {
      element.textContent = `Last raw WS message: ${JSON.stringify(message)}`;
    }
  }

  setResponseText(text) {
    this.responseText = text;
    document.getElementById('response-text').textContent = text;
  }

  setGeminiResponseText(text) {
    this.geminiResponseText = text;
    document.getElementById('gemini-response').textContent = text;
  }

  async handleSendCommand() {
    if (!window.wsManager.isConnected && !this.backendUrl) {
      this.setResponseText('Not connected and no backend URL.');
      return;
    }

    const command = 'ping_ws';
    const inputValue = document.getElementById('input-value').value;
    const payload = { 
      clientTime: new Date().toISOString(), 
      data: inputValue || "test" 
    };
    const operationId = this.generateUUID();

    this.setResponseText(`Sending command "${command}" with ID: ${operationId}...`);

    try {
      console.log(`Attempting WebSocket send for opId: ${operationId}`);
      const wsResponsePayload = await window.wsManager.sendRequest(command, payload);
      console.log('WebSocket Response Payload:', wsResponsePayload);
      this.setResponseText(`WebSocket Success (opId: ${operationId}): ${JSON.stringify(wsResponsePayload)}`);
      return;
    } catch (wsError) {
      console.warn(`WebSocket request failed for opId ${operationId}:`, wsError.message);
      this.setResponseText(`WebSocket Error (opId: ${operationId}): ${wsError.message}. Falling back to HTTP...`);
      await this.sendPingViaHttp(operationId);
    }
  }

  async sendPingViaHttp(currentOperationId) {
    if (!this.backendUrl) {
      this.setResponseText('Backend URL not set.');
      return;
    }

    try {
      this.setResponseText(`Sending HTTP Ping with ID: ${currentOperationId}...`);
      
      const response = await this.fetchWithTimeout(
        `${this.backendUrl}/api/ping?operationId=${currentOperationId}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        },
        this.HTTP_REQUEST_TIMEOUT
      );

      const data = await response.json();
      console.log('HTTP Ping Response:', data);
      this.setResponseText(`HTTP Response: ${JSON.stringify(data)}`);
    } catch (error) {
      console.error('HTTP Ping Error:', error);
      this.setResponseText(`HTTP Error: ${error.message}`);
    }
  }

  async sendPingToGeminiBackend() {
    if (!this.backendUrl) {
      this.setGeminiResponseText('Backend URL not set.');
      return;
    }

    const messageForGemini = document.getElementById('gemini-input').value.trim();

    if (!messageForGemini) {
      this.setGeminiResponseText('Please enter a message for Gemini.');
      return;
    }

    this.setGeminiResponseText(`Sending message to Gemini via backend: "${messageForGemini}"...`);
    
    try {
      const response = await this.fetchWithTimeout(
        `${this.backendUrl}/api/llm/ping-gemini`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: messageForGemini,
          }),
        },
        this.GEMINI_HTTP_REQUEST_TIMEOUT * 2
      );

      const data = await response.json();
      console.log('Backend Gemini Ping Response:', data);
      
      // Обработка специальных типов ошибок Gemini API
      if (data.isTemporary) {
        // Временная ошибка - показываем понятное сообщение с иконкой
        const limitMessage = `🚦 ${data.gemini_response_text}`;
        this.setGeminiResponseText(limitMessage);
        
        // Добавляем визуальное выделение для лимитов
        const responseDiv = document.getElementById('gemini-response');
        if (responseDiv) {
          responseDiv.style.backgroundColor = '#fff3cd';
          responseDiv.style.border = '1px solid #ffeaa7';
          responseDiv.style.color = '#856404';
          
          // Убираем выделение через 5 секунд
          setTimeout(() => {
            responseDiv.style.backgroundColor = '';
            responseDiv.style.border = '';
            responseDiv.style.color = '';
          }, 5000);
        }
      } else if (data.errorType) {
        // Критическая ошибка API
        const errorMessage = `❌ ${data.gemini_response_text}`;
        this.setGeminiResponseText(errorMessage);
        
        // Красное выделение для критических ошибок
        const responseDiv = document.getElementById('gemini-response');
        if (responseDiv) {
          responseDiv.style.backgroundColor = '#f8d7da';
          responseDiv.style.border = '1px solid #f5c6cb';
          responseDiv.style.color = '#721c24';
          
          setTimeout(() => {
            responseDiv.style.backgroundColor = '';
            responseDiv.style.border = '';
            responseDiv.style.color = '';
          }, 8000);
        }
      } else {
        // Обычный ответ
        this.setGeminiResponseText(`AI: ${data.gemini_response_text || JSON.stringify(data, null, 2)}`);
      }
    } catch (error) {
      console.error('Backend Gemini Ping Error:', error);
      this.setGeminiResponseText(`Backend Error: ${error.message}`);
    }
  }

  // Utility function for fetch with timeout
  async fetchWithTimeout(url, options, timeout) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  window.app = new App();
});