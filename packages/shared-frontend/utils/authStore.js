import { writable } from 'svelte/store';
import { wsStore } from './wsStore.js';
import { addLog } from './logStore.js';

// Initial authentication state
const initialState = {
  isAuthenticated: false,
  currentUser: null,
  sessionId: null,
  users: [], // Available users for login selection
  selectedUser: null, // User selected for PIN entry
  loginState: 'user_selection', // 'user_selection', 'pin_entry', 'authenticating', 'authenticated'
  error: null,
  isLoading: false
};

// Create the store
function createAuthStore() {
  const { subscribe, set, update } = writable(initialState);

  return {
    subscribe,
    
    // Fetch available users for login screen
    async fetchUsers() {
      try {
        update(state => ({ ...state, isLoading: true, error: null }));
        
        const response = await wsStore.send({
          command: 'getLoginUsers',
          payload: {}
        });

        if (response.status === 'success') {
          update(state => ({ 
            ...state, 
            users: response.payload || [],
            isLoading: false 
          }));
          addLog('INFO', `Fetched ${response.payload?.length || 0} users for login`);
        } else {
          throw new Error(response.payload?.error || 'Failed to fetch users');
        }
      } catch (error) {
        addLog('ERROR', `Failed to fetch users: ${error.message}`);
        update(state => ({ 
          ...state, 
          error: error.message, 
          isLoading: false 
        }));
      }
    },

    // Select a user for PIN entry
    selectUser(user) {
      update(state => ({
        ...state,
        selectedUser: user,
        loginState: 'pin_entry',
        error: null
      }));
      addLog('INFO', `Selected user: ${user.username}`);
    },

    // Go back to user selection
    backToUserSelection() {
      update(state => ({
        ...state,
        selectedUser: null,
        loginState: 'user_selection',
        error: null
      }));
    },

    // Authenticate with username and PIN
    async login(username, pin) {
      try {
        update(state => ({ 
          ...state, 
          isLoading: true, 
          loginState: 'authenticating',
          error: null 
        }));

        const response = await wsStore.send({
          command: 'login',
          payload: {
            username,
            password: pin, // PIN is treated as password
            ipAddress: 'localhost', // Could be enhanced to get actual IP
            userAgent: navigator.userAgent
          }
        });

        if (response.status === 'success' && response.payload.success) {
          const { user, session } = response.payload;
          
          // Also establish HTTP session for API calls
          try {
            await fetch('/api/auth/login', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              credentials: 'include',
              body: JSON.stringify({
                username,
                password: pin
              })
            });
          } catch (error) {
            addLog('WARN', `HTTP session establishment failed: ${error.message}`);
            // Continue with WebSocket session even if HTTP session fails
          }
          
          // Add mock permissions to user for role-based permission system
          const userWithPermissions = {
            ...user,
            permissions: ['all', 'order.change_price', 'order.reduce_quantity']
          };
          
          update(state => ({
            ...state,
            isAuthenticated: true,
            currentUser: userWithPermissions,
            sessionId: session.sessionId,
            loginState: 'authenticated',
            isLoading: false,
            error: null,
            selectedUser: null
          }));

          addLog('SUCCESS', `User ${username} authenticated successfully`);
          return { success: true };
        } else {
          const errorMessage = response.payload?.error || 'Authentication failed';
          throw new Error(errorMessage);
        }
      } catch (error) {
        addLog('ERROR', `Authentication failed: ${error.message}`);
        update(state => ({ 
          ...state, 
          error: error.message, 
          loginState: 'pin_entry',
          isLoading: false 
        }));
        return { success: false, error: error.message };
      }
    },

    // Logout current user
    async logout() {
      try {
        const currentState = { ...initialState };
        
        // Get current session ID before clearing state
        let sessionId = null;
        update(state => {
          sessionId = state.sessionId;
          return currentState;
        });

        // If we have a session, try to logout on server
        if (sessionId) {
          try {
            await wsStore.send({
              command: 'logout',
              payload: { sessionId }
            });
            addLog('INFO', 'User logged out successfully');
          } catch (error) {
            addLog('WARN', `Logout request failed: ${error.message}`);
            // Continue with local logout even if server logout fails
          }
        }

        // Also clear HTTP session
        try {
          await fetch('/api/auth/logout', {
            method: 'POST',
            credentials: 'include'
          });
        } catch (error) {
          addLog('WARN', `HTTP logout failed: ${error.message}`);
          // Continue with local logout even if HTTP logout fails
        }

        // Always reset to initial state locally
        set(currentState);
        return { success: true };
      } catch (error) {
        addLog('ERROR', `Logout failed: ${error.message}`);
        // Force reset state even on error
        set(initialState);
        return { success: false, error: error.message };
      }
    },

    // Get current user info from server
    async getCurrentUser() {
      try {
        let sessionId = null;
        update(state => {
          sessionId = state.sessionId;
          return state;
        });

        if (!sessionId) {
          throw new Error('No active session');
        }

        const response = await wsStore.send({
          command: 'getCurrentUser',
          payload: { sessionId }
        });

        if (response.status === 'success' && response.payload.success) {
          update(state => ({
            ...state,
            currentUser: response.payload.user
          }));
          return { success: true, user: response.payload.user };
        } else {
          throw new Error(response.payload?.error || 'Failed to get current user');
        }
      } catch (error) {
        addLog('ERROR', `Failed to get current user: ${error.message}`);
        return { success: false, error: error.message };
      }
    },

    // Clear any error
    clearError() {
      update(state => ({ ...state, error: null }));
    },

    // Reset to initial state
    reset() {
      set(initialState);
    },

    // Check for existing session on app load
    async checkSession() {
      try {
        update(state => ({ ...state, isLoading: true }));
        
        const response = await fetch('/api/session/status', {
          credentials: 'include'
        });
        
        if (response.ok) {
          const data = await response.json();
          
          if (data.authenticated && data.user) {
            // Add mock permissions to user for role-based permission system
            const userWithPermissions = {
              ...data.user,
              permissions: ['all', 'order.change_price', 'order.reduce_quantity']
            };
            
            update(state => ({
              ...state,
              isAuthenticated: true,
              currentUser: userWithPermissions,
              sessionId: null, // HTTP sessions don't use sessionId
              loginState: 'authenticated',
              isLoading: false,
              error: null,
              selectedUser: null
            }));

            addLog('SUCCESS', `Session restored for user: ${data.user.username}`);
            return { success: true, user: data.user };
          }
        }
        
        // No valid session found
        update(state => ({ ...state, isLoading: false }));
        return { success: false, error: 'No valid session' };
        
      } catch (error) {
        addLog('ERROR', `Failed to check session: ${error.message}`);
        update(state => ({ ...state, isLoading: false, error: error.message }));
        return { success: false, error: error.message };
      }
    },

    // Establish session from server auto-login (demo mode)
    establishSession(sessionPayload) {
      try {
        const { user, session } = sessionPayload;
        
        // Add mock permissions to user for role-based permission system
        const userWithPermissions = {
          ...user,
          permissions: ['all', 'order.change_price', 'order.reduce_quantity']
        };
        
        update(state => ({
          ...state,
          isAuthenticated: true,
          currentUser: userWithPermissions,
          sessionId: session.sessionId,
          loginState: 'authenticated',
          isLoading: false,
          error: null,
          selectedUser: null
        }));

        addLog('SUCCESS', `Demo mode: Auto-authenticated as ${user.username}`);
        return { success: true };
      } catch (error) {
        addLog('ERROR', `Failed to establish demo session: ${error.message}`);
        return { success: false, error: error.message };
      }
    }
  };
}

export const authStore = createAuthStore();