<script>
  import { createEventDispatcher } from 'svelte';
  import { agentStore } from '../agentStore.js';
  import { currentView } from '../viewStore.js';
  
  const dispatch = createEventDispatcher();
  
  let isDragOver = false;
  let isImporting = false;
  
  // File size limits (should match backend limits)
  const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
  const MAX_FILE_SIZE_DEMO = 10 * 1024 * 1024; // 10MB (demo mode)
  
  // Check if in demo mode - you might want to get this from a store or API
  const isDemoMode = true; // For now, assume demo mode
  
  function formatFileSize(bytes) {
    return Math.round(bytes / (1024 * 1024) * 100) / 100;
  }
  
  function checkFileSize(file) {
    const maxAllowed = isDemoMode ? MAX_FILE_SIZE_DEMO : MAX_FILE_SIZE;
    const maxAllowedMB = Math.round(maxAllowed / (1024 * 1024));
    const fileSizeMB = formatFileSize(file.size);
    
    if (file.size > maxAllowed) {
      return {
        valid: false,
        error: `File size (${fileSizeMB}MB) exceeds maximum allowed size of ${maxAllowedMB}MB ${isDemoMode ? '(demo mode limit)' : ''}.`
      };
    }
    
    return { valid: true, sizeMB: fileSizeMB };
  }
  
  async function handleFileSelect() {
    if (isImporting) return;
    
    try {
      // Use Electron's file dialog
      const result = await window.electronAPI.invoke('show-open-dialog');
      
      if (result && result.error) {
        // Handle security error from file dialog
        agentStore.addMessage({
          timestamp: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
          type: 'agent',
          message: result.error
        });
        return;
      }
      
      if (result && result.filePath) {
        await startImportProcess(result.filePath);
      }
    } catch (error) {
      console.error('Error selecting file:', error);
      agentStore.addMessage({
        timestamp: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
        type: 'agent',
        message: `Error selecting file: ${error.message}`
      });
    }
  }
  
  async function handleDrop(event) {
    event.preventDefault();
    isDragOver = false;
    
    if (isImporting) return;
    
    const files = event.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      
      // Check file type
      const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
      if (!allowedTypes.includes(file.type)) {
        agentStore.addMessage({
          timestamp: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
          type: 'agent',
          message: 'Please drop a PDF, JPG, or PNG file.'
        });
        return;
      }
      
      // Check file size
      const sizeCheck = checkFileSize(file);
      if (!sizeCheck.valid) {
        agentStore.addMessage({
          timestamp: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
          type: 'agent',
          message: sizeCheck.error
        });
        return;
      }
      
      // For drag-and-drop, we need to save the file to a temporary location
      // For now, just show an error asking to use the file dialog
      agentStore.addMessage({
        timestamp: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
        type: 'agent',
        message: `File size: ${sizeCheck.sizeMB}MB - within limits. However, drag-and-drop support is not yet implemented. Please use the "Select File" button.`
      });
    }
  }
  
  function handleDragOver(event) {
    event.preventDefault();
    isDragOver = true;
  }
  
  function handleDragLeave(event) {
    event.preventDefault();
    isDragOver = false;
  }
  
  async function startImportProcess(filePath) {
    if (isImporting) return;
    
    isImporting = true;
    
    // Close control center and switch to agent view
    dispatch('close');
    currentView.set('agent');
    
    // Add initial message
    const timestamp = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    agentStore.addMessage({
      timestamp,
      type: 'agent',
      message: `Starting menu import from: ${filePath.split('/').pop()}\n\nThis process will:\n1. Parse the menu with AI\n2. Clean existing data\n3. Import new menu structure\n4. Create optimized layouts\n\nPlease wait...`
    });
    
    try {
      // Start the import process
      const result = await window.electronAPI.invoke('start-menu-import', filePath);
      
      // Handle security error response
      if (result && !result.success && result.message) {
        agentStore.addMessage({
          timestamp: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
          type: 'agent',
          message: `Import failed: ${result.message}`
        });
        isImporting = false;
        return;
      }
    } catch (error) {
      console.error('Error starting import:', error);
      agentStore.addMessage({
        timestamp: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
        type: 'agent',
        message: `Import failed: ${error.message}`
      });
      isImporting = false;
    }
  }
  
  // Listen for import progress
  if (typeof window !== 'undefined' && window.electronAPI && window.electronAPI.onImportProgress) {
    window.electronAPI.onImportProgress((progress) => {
      const timestamp = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
      agentStore.addMessage({
        timestamp,
        type: 'agent',
        message: progress
      });
    });
    
    window.electronAPI.onImportComplete((success, message) => {
      const timestamp = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
      agentStore.addMessage({
        timestamp,
        type: 'agent',
        message: success 
          ? `✅ Import completed successfully!\n\n${message}\n\nYou can now navigate back to the selection area to see your new menu items.`
          : `❌ Import failed: ${message}`
      });
      isImporting = false;
    });
  }
</script>

<div class="menu-importer">
  <h3>Menu Import</h3>
  <p>Import a menu from PDF, JPG, or PNG file</p>
  <p class="size-limit">Max file size: {isDemoMode ? '10MB (demo mode)' : '50MB'}</p>
  
  <div 
    class="drop-zone" 
    class:drag-over={isDragOver}
    class:importing={isImporting}
    on:drop={handleDrop}
    on:dragover={handleDragOver}
    on:dragleave={handleDragLeave}
  >
    {#if isImporting}
      <div class="importing-indicator">
        <div class="spinner"></div>
        <p>Importing menu...</p>
      </div>
    {:else}
      <div class="drop-content">
        <p>Drop your menu file here</p>
        <span>or</span>
        <button class="select-file-btn" on:click={handleFileSelect}>Select File</button>
      </div>
    {/if}
  </div>
</div>

<style>
  .menu-importer {
    padding: 20px;
  }
  
  .menu-importer h3 {
    margin: 0 0 10px 0;
    color: #e0e0e0;
    font-size: 18px;
  }
  
  .menu-importer p {
    margin: 0 0 20px 0;
    color: #aaa;
    font-size: 14px;
  }
  
  .menu-importer .size-limit {
    margin: 0 0 15px 0;
    color: #ffb74d;
    font-size: 13px;
    font-weight: 500;
  }
  
  .drop-zone {
    border: 2px dashed #666;
    border-radius: 8px;
    padding: 40px;
    text-align: center;
    transition: all 0.3s ease;
    background-color: #444;
    min-height: 150px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  
  .drop-zone.drag-over {
    border-color: #4CAF50;
    background-color: rgba(76, 175, 80, 0.1);
  }
  
  .drop-zone.importing {
    border-color: #4a69bd;
    background-color: rgba(74, 105, 189, 0.1);
  }
  
  .drop-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
  }
  
  .drop-content p {
    margin: 0;
    color: #e0e0e0;
    font-size: 16px;
  }
  
  .drop-content span {
    color: #aaa;
    font-size: 14px;
  }
  
  .select-file-btn {
    background-color: #4a69bd;
    color: white;
    border: none;
    padding: 10px 20px;
    border-radius: 5px;
    cursor: pointer;
    font-size: 14px;
    transition: background-color 0.3s ease;
  }
  
  .select-file-btn:hover {
    background-color: #3d5aa0;
  }
  
  .select-file-btn:disabled {
    background-color: #666;
    cursor: not-allowed;
  }
  
  .importing-indicator {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 15px;
  }
  
  .importing-indicator p {
    margin: 0;
    color: #4a69bd;
    font-size: 16px;
    font-weight: bold;
  }
  
  .spinner {
    width: 40px;
    height: 40px;
    border: 4px solid #666;
    border-top: 4px solid #4a69bd;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }
  
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
</style>