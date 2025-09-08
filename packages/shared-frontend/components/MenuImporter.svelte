<script>
  import { createEventDispatcher, onMount } from 'svelte';
  import { agentStore } from '../utils/agentStore.js';
  import { currentView } from '../utils/viewStore.js';
  import { wsStore } from '../utils/wsStore.js';
  import { addLog } from '../utils/logStore.js';
  
  const dispatch = createEventDispatcher();
  
  let isImporting = false;
  let availableFiles = [];
  let selectedFiles = new Set();
  let loadingFiles = true;
  let loadError = null;
  let uploadedFiles = [];
  let uploadProgress = {};
  
  // File size limits (should match backend limits)
  const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
  const MAX_FILE_SIZE_DEMO = 10 * 1024 * 1024; // 10MB (demo mode)
  
  // Production mode only
  const isDemoMode = false;
  
  // Determine execution environment
  const isElectron = typeof window !== 'undefined' && window.electronAPI;
  const isWebBrowser = !isElectron;
  
  // File input element for web browser mode
  let fileInput;
  
  // Load available files on component mount
  onMount(async () => {
    if (isElectron) {
      await loadAvailableFiles();
    } else {
      // In web browser mode, start with empty state
      loadingFiles = false;
    }
  });
  
  // Load available files for Electron mode
  async function loadAvailableFiles() {
    if (!isElectron) return;
    
    loadingFiles = true;
    loadError = null;
    
    try {
      const result = await window.electronAPI.invoke('list-menu-files');
      
      if (result && result.error) {
        loadError = result.error;
        availableFiles = [];
      } else if (Array.isArray(result)) {
        availableFiles = result;
      } else {
        loadError = 'Unexpected response format';
        availableFiles = [];
      }
    } catch (error) {
      console.error('Error loading files:', error);
      loadError = error.message;
      availableFiles = [];
    } finally {
      loadingFiles = false;
    }
  }
  
  // Handle file upload for web browser mode
  async function handleFileUpload(event) {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    
    for (const file of files) {
      // Check file extension for JSON (MDF) files
      const fileName = file.name.toLowerCase();
      const isJsonFile = fileName.endsWith('.json');
      
      if (isJsonFile) {
        // Handle JSON MDF file import directly
        await handleMdfImport(file);
        continue;
      }
      
      // Check file type for regular menu files
      const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
      if (!allowedTypes.includes(file.type)) {
        agentStore.addMessage({
          timestamp: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
          type: 'agent',
          message: `File "${file.name}" has unsupported format. Please select PDF, JPG, PNG, or JSON files.`
        });
        continue;
      }
      
      // Check file size
      const maxAllowed = isDemoMode ? MAX_FILE_SIZE_DEMO : MAX_FILE_SIZE;
      if (file.size > maxAllowed) {
        const maxAllowedMB = Math.round(maxAllowed / (1024 * 1024));
        const fileSizeMB = Math.round(file.size / (1024 * 1024) * 100) / 100;
        agentStore.addMessage({
          timestamp: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
          type: 'agent',
          message: `File "${file.name}" (${fileSizeMB}MB) exceeds maximum size of ${maxAllowedMB}MB ${isDemoMode ? '(demo mode limit)' : ''}.`
        });
        continue;
      }
      
      // Add file to upload queue
      const fileInfo = {
        file: file,
        name: file.name,
        size: Math.round(file.size / (1024 * 1024) * 100) / 100,
        type: file.type.split('/')[1].toUpperCase(),
        selected: true,
        uploaded: false
      };
      
      uploadedFiles = [...uploadedFiles, fileInfo];
    }
    
    // Clear the file input
    if (fileInput) {
      fileInput.value = '';
    }
  }
  
  // Trigger file selection in web browser mode
  function triggerFileSelect() {
    if (fileInput) {
      fileInput.click();
    }
  }
  
  // Remove uploaded file from list
  function removeUploadedFile(index) {
    uploadedFiles = uploadedFiles.filter((_, i) => i !== index);
  }
  
  function toggleFileSelection(file) {
    if (isElectron) {
      // Electron mode - toggle based on file path
      if (selectedFiles.has(file.path)) {
        selectedFiles.delete(file.path);
      } else {
        selectedFiles.add(file.path);
      }
      selectedFiles = selectedFiles; // Trigger reactivity
    } else {
      // Web browser mode - toggle file selection
      const index = uploadedFiles.findIndex(f => f.name === file.name);
      if (index !== -1) {
        uploadedFiles[index].selected = !uploadedFiles[index].selected;
        uploadedFiles = uploadedFiles; // Trigger reactivity
      }
    }
  }
  
  function selectAllFiles() {
    if (isElectron) {
      const validFiles = availableFiles.filter(file => file.sizeValid);
      selectedFiles = new Set(validFiles.map(file => file.path));
    } else {
      uploadedFiles = uploadedFiles.map(file => ({ ...file, selected: true }));
    }
  }
  
  function clearSelection() {
    if (isElectron) {
      selectedFiles = new Set();
    } else {
      uploadedFiles = uploadedFiles.map(file => ({ ...file, selected: false }));
    }
  }
  
  // Get count of selected files for both modes
  function getSelectedCount() {
    if (isElectron) {
      return selectedFiles.size;
    } else {
      return uploadedFiles.filter(file => file.selected).length;
    }
  }
  
  async function handleImportSelected() {
    const selectedCount = getSelectedCount();
    if (isImporting || selectedCount === 0) return;
    
    if (isElectron) {
      const filePaths = Array.from(selectedFiles);
      await startImportProcess(filePaths);
    } else {
      // Web browser mode - upload and import files
      const selectedUploadedFiles = uploadedFiles.filter(file => file.selected);
      await uploadAndImportFiles(selectedUploadedFiles);
    }
  }
  
  function getFileTypeDisplay(file) {
    return `${file.type} • ${file.size}MB`;
  }
  
  function formatDate(dateString) {
    return new Date(dateString).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: '2-digit', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
  
  // Import process for Electron mode
  async function startImportProcess(filePaths) {
    if (isImporting) return;
    
    isImporting = true;
    
    // Close control center and switch to agent view
    dispatch('close');
    currentView.set('agent');
    
    // Add initial message
    const timestamp = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    const fileCount = Array.isArray(filePaths) ? filePaths.length : 1;
    const fileNames = Array.isArray(filePaths) 
      ? filePaths.map(path => path.split('/').pop()).join(', ')
      : filePaths.split('/').pop();
    
    agentStore.addMessage({
      timestamp,
      type: 'agent',
      message: `Starting menu import from ${fileCount} file(s): ${fileNames}\n\nThis process will:\n1. Parse the menu(s) with AI\n2. Clean existing data\n3. Import new menu structure\n4. Create optimized layouts\n\nPlease wait...`,
      style: 'info'
    });
    
    try {
      // Start the import process (backend now supports both single file and array)
      const result = await window.electronAPI.invoke('start-menu-import', filePaths);
      
      // Handle security error response
      if (result && !result.success && result.message) {
        agentStore.addMessage({
          timestamp: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
          type: 'agent',
          message: `Import failed: ${result.message}`,
          style: 'error'
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
  
  // Upload and import process for web browser mode
  async function uploadAndImportFiles(selectedFiles) {
    if (isImporting || selectedFiles.length === 0) return;
    
    isImporting = true;
    
    // Close control center and switch to agent view
    dispatch('close');
    currentView.set('agent');
    
    const timestamp = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    const fileNames = selectedFiles.map(f => f.name).join(', ');
    
    agentStore.addMessage({
      timestamp,
      type: 'agent',
      message: `Starting menu import from ${selectedFiles.length} file(s): ${fileNames}\n\nThis process will:\n1. Upload files to server\n2. Parse the menu(s) with AI\n3. Clean existing data\n4. Import new menu structure\n5. Create optimized layouts\n\nPlease wait...`
    });
    
    try {
      // Get backend URL - in web browser mode, use current location
      const backendUrl = `${window.location.protocol}//${window.location.host}`;
      
      // Upload all files in one request
      agentStore.addMessage({
        timestamp: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
        type: 'agent',
        message: `Uploading ${selectedFiles.length} files...`,
        style: 'info'
      });
      
      const formData = new FormData();
      selectedFiles.forEach((fileInfo, index) => {
        formData.append('menuFiles', fileInfo.file);
      });
      
      // Track upload progress for all files
      const xhr = new XMLHttpRequest();
      
      const uploadPromise = new Promise((resolve, reject) => {
        xhr.upload.addEventListener('progress', (event) => {
          if (event.lengthComputable) {
            const percent = Math.round((event.loaded / event.total) * 100);
            agentStore.addMessage({
              timestamp: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
              type: 'agent',
              message: `Uploading files: ${percent}%`
            });
          }
        });
        
        xhr.onload = function() {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const result = JSON.parse(xhr.responseText);
              resolve(result);
            } catch (parseError) {
              reject(new Error('Invalid response format'));
            }
          } else {
            try {
              const errorResult = JSON.parse(xhr.responseText);
              reject(new Error(errorResult.message || `HTTP ${xhr.status}`));
            } catch (parseError) {
              reject(new Error(`HTTP ${xhr.status}: ${xhr.statusText}`));
            }
          }
        };
        
        xhr.onerror = function() {
          reject(new Error('Network error occurred'));
        };
        
        xhr.open('POST', `${backendUrl}/api/menu/upload-and-import`);
        xhr.send(formData);
      });
      
      const result = await uploadPromise;
      
      if (!result.success) {
        throw new Error(result.message || 'Upload failed');
      }
      
      agentStore.addMessage({
        timestamp: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
        type: 'agent',
        message: `All files uploaded successfully. Processing ${result.fileCount} files: ${result.filenames.join(', ')}`
      });
      
      // Mark all files as uploaded
      selectedFiles.forEach(fileInfo => {
        fileInfo.uploaded = true;
      });
      
      agentStore.addMessage({
        timestamp: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
        type: 'agent',
        message: '✅ Menu import completed successfully!\n\nYou can now navigate back to the selection area to see your new menu items.'
      });
      
      // Refresh categories
      addLog('INFO', 'Refreshing categories after successful menu import');
      wsStore.send({ command: 'getCategories' });
      
    } catch (error) {
      console.error('Error uploading and importing files:', error);
      agentStore.addMessage({
        timestamp: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
        type: 'agent',
        message: `Import failed: ${error.message}`
      });
    } finally {
      isImporting = false;
    }
  }
  
  // Handle MDF JSON file import
  async function handleMdfImport(file) {
    try {
      // Close control center and switch to agent view
      dispatch('close');
      currentView.set('agent');
      
      const timestamp = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
      agentStore.addMessage({
        timestamp,
        type: 'agent',
        message: `🚀 Starting MDF import from ${file.name}\n\nThis process will:\n1. Parse JSON menu data\n2. Clean existing data\n3. Import menu structure\n4. Create optimized layouts\n\nPlease wait...`,
        style: 'info'
      });
      
      // Read and parse JSON file
      const fileContent = await file.text();
      let mdfData;
      try {
        mdfData = JSON.parse(fileContent);
      } catch (parseError) {
        throw new Error('Invalid JSON format in MDF file');
      }
      
      // Send MDF data to backend via WebSocket
      const response = await wsStore.send({
        command: 'importMdf',
        payload: { mdfData, filename: file.name }
      });
      
      if (response.status === 'success' && response.payload.success) {
        agentStore.addMessage({
          timestamp: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
          type: 'agent',
          message: `✅ MDF import completed successfully!\n\nImported ${response.payload.itemCount || 0} menu items.\n\nYou can now navigate back to the selection area to see your new menu items.`,
          style: 'success'
        });
        
        // Refresh categories
        addLog('INFO', 'Refreshing categories after successful MDF import');
        wsStore.send({ command: 'getCategories' });
      } else {
        throw new Error(response.payload?.message || response.error || 'MDF import failed');
      }
      
    } catch (error) {
      console.error('Error importing MDF file:', error);
      agentStore.addMessage({
        timestamp: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
        type: 'agent',
        message: `❌ MDF import failed: ${error.message}`,
        style: 'error'
      });
    } finally {
      // Clear the file input
      if (fileInput) {
        fileInput.value = '';
      }
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
      
      // If successful, refresh categories
      if (success) {
        addLog('INFO', 'Refreshing categories after successful menu import');
        wsStore.send({ command: 'getCategories' });
      }
      
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
  <p>
    {#if isElectron}
      Select one or more menu files from the ecKasseIn directory
    {:else}
      Upload and import menu files (PDF, JPG, PNG, JSON)
    {/if}
  </p>
  <p class="size-limit">Max file size: {isDemoMode ? '10MB (demo mode)' : '50MB'}</p>
  
  <!-- Hidden file input for web browser mode -->
  {#if isWebBrowser}
    <input 
      type="file" 
      bind:this={fileInput}
      on:change={handleFileUpload}
      accept=".pdf,.jpg,.jpeg,.png,.json"
      multiple
      style="display: none;"
    />
  {/if}
  
  {#if isImporting}
    <div class="importing-indicator">
      <div class="spinner"></div>
      <p>Importing menu...</p>
    </div>
  {:else if isElectron && loadingFiles}
    <div class="loading-files">
      <div class="spinner"></div>
      <p>Loading available files...</p>
    </div>
  {:else if isElectron && loadError}
    <div class="error-message">
      <p>Error loading files: {loadError}</p>
      <button class="retry-btn" on:click={loadAvailableFiles}>Retry</button>
    </div>
  {:else}
    <div class="file-selector">
      {#if isWebBrowser && uploadedFiles.length === 0}
        <div class="upload-area">
          <div class="upload-prompt">
            <p>No files selected yet.</p>
            <button class="upload-btn" on:click={triggerFileSelect}>
              <svg class="upload-icon" width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z" />
              </svg>
              Choose Files
            </button>
            <p class="upload-hint">Select multiple PDF, JPG, PNG, or JSON files</p>
          </div>
        </div>
      {:else if isElectron && availableFiles.length === 0}
        <div class="no-files">
          <p>No menu files found in the ecKasseIn directory.</p>
          <p>Please add PDF, JPG, or PNG files to the ecKasseIn folder.</p>
        </div>
      {:else}
        <!-- File list controls -->
        <div class="file-controls">
          <div class="selection-info">
            {#if isElectron}
              <span>{selectedFiles.size} of {availableFiles.length} files selected</span>
            {:else}
              <span>{uploadedFiles.filter(f => f.selected).length} of {uploadedFiles.length} files selected</span>
            {/if}
          </div>
          <div class="control-buttons">
            {#if isWebBrowser}
              <button class="control-btn" on:click={triggerFileSelect}>Add More Files</button>
            {/if}
            <button class="control-btn" on:click={selectAllFiles} 
              disabled={isElectron ? availableFiles.every(f => !f.sizeValid) : uploadedFiles.length === 0}>
              Select All Valid
            </button>
            <button class="control-btn" on:click={clearSelection} disabled={getSelectedCount() === 0}>
              Clear Selection
            </button>
          </div>
        </div>
        
        <!-- File list -->
        <div class="file-list">
          {#if isElectron}
            {#each availableFiles as file (file.path)}
              <div class="file-item" class:invalid={!file.sizeValid} class:selected={selectedFiles.has(file.path)}>
                <label class="file-checkbox">
                  <input 
                    type="checkbox" 
                    disabled={!file.sizeValid}
                    checked={selectedFiles.has(file.path)}
                    on:change={() => toggleFileSelection(file)}
                  />
                  <div class="file-info">
                    <div class="file-name">{file.name}</div>
                    <div class="file-details">
                      <span class="file-type">{getFileTypeDisplay(file)}</span>
                      <span class="file-date">Modified: {formatDate(file.lastModified)}</span>
                    </div>
                    {#if !file.sizeValid}
                      <div class="size-warning">File too large (max {isDemoMode ? '10MB' : '50MB'})</div>
                    {/if}
                  </div>
                </label>
              </div>
            {/each}
          {:else}
            {#each uploadedFiles as fileInfo, index (fileInfo.name)}
              <div class="file-item" class:selected={fileInfo.selected} class:uploaded={fileInfo.uploaded}>
                <label class="file-checkbox">
                  <input 
                    type="checkbox" 
                    checked={fileInfo.selected}
                    on:change={() => toggleFileSelection(fileInfo)}
                  />
                  <div class="file-info">
                    <div class="file-name">{fileInfo.name}</div>
                    <div class="file-details">
                      <span class="file-type">{fileInfo.type} • {fileInfo.size}MB</span>
                      {#if fileInfo.uploaded}
                        <span class="upload-status uploaded">✓ Uploaded</span>
                      {:else}
                        <span class="upload-status pending">Pending upload</span>
                      {/if}
                    </div>
                  </div>
                </label>
                <button class="remove-btn" on:click={() => removeUploadedFile(index)} title="Remove file">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z" />
                  </svg>
                </button>
              </div>
            {/each}
          {/if}
        </div>
        
        <!-- Import controls -->
        <div class="import-controls">
          <button 
            class="import-btn" 
            disabled={getSelectedCount() === 0}
            on:click={handleImportSelected}
          >
            Import Selected Files ({getSelectedCount()})
          </button>
        </div>
      {/if}
    </div>
  {/if}
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
  
  .loading-files {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 15px;
    padding: 40px;
    text-align: center;
  }
  
  .loading-files p {
    margin: 0;
    color: #e0e0e0;
    font-size: 16px;
  }
  
  .error-message {
    background-color: #4a1a1a;
    border: 1px solid #d32f2f;
    border-radius: 8px;
    padding: 20px;
    text-align: center;
  }
  
  .error-message p {
    margin: 0 0 15px 0;
    color: #ffcdd2;
    font-size: 14px;
  }
  
  .retry-btn {
    background-color: #d32f2f;
    color: white;
    border: none;
    padding: 8px 16px;
    border-radius: 5px;
    cursor: pointer;
    font-size: 14px;
  }
  
  .retry-btn:hover {
    background-color: #b71c1c;
  }
  
  .file-selector {
    display: flex;
    flex-direction: column;
    gap: 15px;
  }
  
  .no-files {
    text-align: center;
    padding: 40px;
    color: #aaa;
  }
  
  .no-files p {
    margin: 0 0 10px 0;
    font-size: 14px;
  }
  
  .file-controls {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 0;
    border-bottom: 1px solid #555;
  }
  
  .selection-info {
    color: #aaa;
    font-size: 14px;
  }
  
  .control-buttons {
    display: flex;
    gap: 10px;
  }
  
  .control-btn {
    background-color: #555;
    color: white;
    border: none;
    padding: 6px 12px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    transition: background-color 0.3s ease;
  }
  
  .control-btn:hover:not(:disabled) {
    background-color: #666;
  }
  
  .control-btn:disabled {
    background-color: #333;
    color: #666;
    cursor: not-allowed;
  }
  
  .file-list {
    max-height: 300px;
    overflow-y: auto;
    border: 1px solid #555;
    border-radius: 8px;
  }
  
  .file-item {
    border-bottom: 1px solid #555;
  }
  
  .file-item:last-child {
    border-bottom: none;
  }
  
  .file-item.invalid {
    background-color: rgba(211, 47, 47, 0.1);
  }
  
  .file-item.selected:not(.invalid) {
    background-color: rgba(74, 105, 189, 0.2);
  }
  
  .file-checkbox {
    display: flex;
    align-items: center;
    padding: 12px 15px;
    cursor: pointer;
    gap: 12px;
  }
  
  .file-checkbox input[type="checkbox"] {
    width: 18px;
    height: 18px;
    cursor: pointer;
  }
  
  .file-checkbox input[type="checkbox"]:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
  
  .file-info {
    flex-grow: 1;
  }
  
  .file-name {
    color: #e0e0e0;
    font-weight: 500;
    margin-bottom: 4px;
  }
  
  .file-details {
    display: flex;
    gap: 15px;
    font-size: 12px;
    color: #aaa;
  }
  
  .size-warning {
    color: #ff5252;
    font-size: 12px;
    font-weight: 500;
    margin-top: 4px;
  }
  
  .import-controls {
    padding: 15px 0;
    text-align: center;
  }
  
  .import-btn {
    background-color: #4a69bd;
    color: white;
    border: none;
    padding: 12px 24px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 16px;
    font-weight: 500;
    transition: background-color 0.3s ease;
  }
  
  .import-btn:hover:not(:disabled) {
    background-color: #3d5aa0;
  }
  
  .import-btn:disabled {
    background-color: #666;
    color: #999;
    cursor: not-allowed;
  }
  
  .importing-indicator {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 15px;
    padding: 40px;
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
  
  /* Scrollbar styling for file list */
  .file-list::-webkit-scrollbar {
    width: 8px;
  }
  
  .file-list::-webkit-scrollbar-track {
    background: #333;
  }
  
  .file-list::-webkit-scrollbar-thumb {
    background: #555;
    border-radius: 4px;
  }
  
  .file-list::-webkit-scrollbar-thumb:hover {
    background: #666;
  }
  
  /* Web browser mode styles */
  .upload-area {
    border: 2px dashed #666;
    border-radius: 8px;
    padding: 40px;
    text-align: center;
    background-color: #444;
  }
  
  .upload-prompt p {
    margin: 0 0 20px 0;
    color: #aaa;
    font-size: 16px;
  }
  
  .upload-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    background-color: #4a69bd;
    color: white;
    border: none;
    padding: 12px 24px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 16px;
    font-weight: 500;
    margin: 0 auto 10px;
    transition: background-color 0.3s ease;
  }
  
  .upload-btn:hover {
    background-color: #3d5aa0;
  }
  
  .upload-icon {
    width: 20px;
    height: 20px;
  }
  
  .upload-hint {
    margin: 10px 0 0 0;
    color: #888;
    font-size: 14px;
  }
  
  .file-item.uploaded {
    background-color: rgba(76, 175, 80, 0.1);
    border-left: 3px solid #4CAF50;
  }
  
  .upload-status {
    font-size: 12px;
    font-weight: 500;
  }
  
  .upload-status.uploaded {
    color: #4CAF50;
  }
  
  .upload-status.pending {
    color: #ff9800;
  }
  
  .remove-btn {
    background: none;
    border: none;
    color: #666;
    cursor: pointer;
    padding: 4px;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.3s ease;
  }
  
  .remove-btn:hover {
    background-color: rgba(211, 47, 47, 0.1);
    color: #d32f2f;
  }
  
  .file-item {
    display: flex;
    align-items: center;
    position: relative;
  }
  
  .file-checkbox {
    flex: 1;
  }
</style>