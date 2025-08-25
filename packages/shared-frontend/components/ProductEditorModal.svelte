<script>
  import { createEventDispatcher } from 'svelte';
  
  const dispatch = createEventDispatcher();
  
  // Props
  export let visible = false;
  export let product = null;
  
  // Form state
  let formData = {
    name_menu: '',
    name_button: '',
    name_receipt: '',
    price: '',
    categoryName: '',
    description: ''
  };
  
  let originalData = {};
  let isDirty = false;
  let isSubmitting = false;
  let validationErrors = {};

  // Helper function to safely parse JSON fields from WebSocket responses
  // PostgreSQL returns JSONB as objects, SQLite returns them as strings
  function parseJsonField(field) {
    // If it's already an object (from PostgreSQL), return as-is
    if (typeof field === 'object' && field !== null) {
      return field;
    }
    // If it's a string (from SQLite), try to parse it
    if (typeof field === 'string') {
      try {
        return JSON.parse(field);
      } catch (error) {
        // If parsing fails, return the original string
        return field;
      }
    }
    // For null, undefined, or other types, return as-is
    return field;
  }

  // Reactive statement to update form when product changes
  $: if (product && visible) {
    // Parse display names from the product structure
    const displayNames = product.display_names ? parseJsonField(product.display_names) : {};
    
    // Extract all three name types
    const menuName = displayNames.menu?.de || product.name || '';
    const buttonName = displayNames.button?.de || displayNames.menu?.de || product.name || '';
    const receiptName = displayNames.receipt?.de || displayNames.menu?.de || product.name || '';
    
    // Get category name from product data
    // The product should have category information from the backend
    let categoryName = 'Unknown Category';
    if (product.category_name) {
      categoryName = product.category_name;
    } else if (product.categoryName) {
      categoryName = product.categoryName;
    } else {
      // Category ID is available, but name needs to be resolved
      categoryName = `Category ID: ${product.associated_category_unique_identifier || 'N/A'}`;
    }
    
    formData = {
      name_menu: menuName,
      name_button: buttonName,
      name_receipt: receiptName,
      price: (product.item_price_value || product.price || 0).toString(),
      categoryName: categoryName,
      description: product.description || menuName
    };
    
    originalData = { ...formData };
    isDirty = false;
    validationErrors = {};
  }

  // Check if form has changes - deep comparison
  $: isDirty = visible && (
    formData.name_menu !== originalData.name_menu ||
    formData.name_button !== originalData.name_button ||
    formData.name_receipt !== originalData.name_receipt ||
    formData.price !== originalData.price ||
    formData.categoryName !== originalData.categoryName ||
    formData.description !== originalData.description
  );

  function validateForm() {
    validationErrors = {};
    
    if (!formData.name_menu.trim()) {
      validationErrors.name_menu = 'Menu name is required';
    }
    
    if (!formData.name_button.trim()) {
      validationErrors.name_button = 'Button name is required';
    }
    
    if (!formData.name_receipt.trim()) {
      validationErrors.name_receipt = 'Receipt name is required';
    }
    
    if (!formData.price.trim()) {
      validationErrors.price = 'Price is required';
    } else {
      const price = parseFloat(formData.price);
      if (isNaN(price) || price < 0) {
        validationErrors.price = 'Price must be a valid positive number';
      }
    }
    
    if (!formData.categoryName.trim()) {
      validationErrors.categoryName = 'Category is required';
    }
    
    return Object.keys(validationErrors).length === 0;
  }

  async function handleSave() {
    if (!validateForm()) {
      return;
    }
    
    isSubmitting = true;
    
    try {
      const updates = {};
      
      // Only include changed fields
      if (formData.name_menu !== originalData.name_menu) {
        updates.name_menu = formData.name_menu.trim();
      }
      
      if (formData.name_button !== originalData.name_button) {
        updates.name_button = formData.name_button.trim();
      }
      
      if (formData.name_receipt !== originalData.name_receipt) {
        updates.name_receipt = formData.name_receipt.trim();
      }
      
      if (formData.price !== originalData.price) {
        updates.price = parseFloat(formData.price);
      }
      
      if (formData.categoryName !== originalData.categoryName) {
        updates.categoryName = formData.categoryName.trim();
      }
      
      if (formData.description !== originalData.description) {
        updates.description = formData.description.trim();
      }
      
      // Only proceed if there are actual changes
      if (Object.keys(updates).length > 0) {
        dispatch('save', {
          productId: product.id,
          updates: updates
        });
      }
      
      handleClose();
    } catch (error) {
      console.error('Error saving product:', error);
      // Could show error message here
    } finally {
      isSubmitting = false;
    }
  }

  function handleClose() {
    dispatch('close');
  }

  function handleOverlayClick(event) {
    if (event.target === event.currentTarget) {
      handleClose();
    }
  }

  // Handle escape key
  function handleKeydown(event) {
    if (event.key === 'Escape') {
      handleClose();
    }
  }
</script>

<svelte:window on:keydown={handleKeydown} />

{#if visible && product}
  <div class="modal-overlay" on:click={handleOverlayClick} on:keydown={handleKeydown} role="dialog" tabindex="-1">
    <div class="modal-content">
      <div class="modal-header">
        <h2>Edit Product</h2>
        <button class="close-button" on:click={handleClose} aria-label="Close">×</button>
      </div>
      
      <form on:submit|preventDefault={handleSave} class="product-form">
        <div class="form-group">
          <label for="product-name-menu">Name (Menu)</label>
          <input
            id="product-name-menu"
            type="text"
            bind:value={formData.name_menu}
            class:error={validationErrors.name_menu}
            placeholder="Enter menu name"
            disabled={isSubmitting}
          />
          {#if validationErrors.name_menu}
            <span class="error-message">{validationErrors.name_menu}</span>
          {/if}
        </div>

        <div class="form-group">
          <label for="product-name-button">Name (Button)</label>
          <input
            id="product-name-button"
            type="text"
            bind:value={formData.name_button}
            class:error={validationErrors.name_button}
            placeholder="Enter button name"
            disabled={isSubmitting}
          />
          {#if validationErrors.name_button}
            <span class="error-message">{validationErrors.name_button}</span>
          {/if}
        </div>

        <div class="form-group">
          <label for="product-name-receipt">Name (Receipt)</label>
          <input
            id="product-name-receipt"
            type="text"
            bind:value={formData.name_receipt}
            class:error={validationErrors.name_receipt}
            placeholder="Enter receipt name"
            disabled={isSubmitting}
          />
          {#if validationErrors.name_receipt}
            <span class="error-message">{validationErrors.name_receipt}</span>
          {/if}
        </div>

        <div class="form-group">
          <label for="product-price">Price (€)</label>
          <input
            id="product-price"
            type="number"
            step="0.01"
            min="0"
            bind:value={formData.price}
            class:error={validationErrors.price}
            placeholder="0.00"
            disabled={isSubmitting}
          />
          {#if validationErrors.price}
            <span class="error-message">{validationErrors.price}</span>
          {/if}
        </div>

        <div class="form-group">
          <label for="product-category">Category</label>
          <input
            id="product-category"
            type="text"
            bind:value={formData.categoryName}
            class:error={validationErrors.categoryName}
            placeholder="Enter category name"
            disabled={isSubmitting}
          />
          {#if validationErrors.categoryName}
            <span class="error-message">{validationErrors.categoryName}</span>
          {/if}
        </div>

        <div class="form-group">
          <label for="product-description">Description</label>
          <textarea
            id="product-description"
            bind:value={formData.description}
            placeholder="Enter product description (optional)"
            disabled={isSubmitting}
            rows="3"
          ></textarea>
        </div>

        <div class="form-actions">
          <button
            type="button"
            class="btn-cancel"
            on:click={handleClose}
            disabled={isSubmitting}
          >
            Cancel
          </button>
          
          <button
            type="submit"
            class="btn-save"
            disabled={!isDirty || isSubmitting || Object.keys(validationErrors).length > 0}
          >
            {#if isSubmitting}
              Saving...
            {:else}
              Save Changes
            {/if}
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}

<style>
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0, 0, 0, 0.8);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
  }

  .modal-content {
    background-color: #1a1a1a;
    color: white;
    border: 1px solid #333;
    border-radius: 12px;
    width: 90%;
    max-width: 500px;
    max-height: 90vh;
    overflow-y: auto;
    box-shadow: 0 10px 30px rgba(0,0,0,0.8);
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1.5rem 2rem 1rem 2rem;
    border-bottom: 1px solid #333;
  }

  .modal-header h2 {
    margin: 0;
    color: white;
    font-size: 1.5rem;
    font-weight: 600;
  }

  .close-button {
    background: none;
    border: none;
    font-size: 2rem;
    color: #ccc;
    cursor: pointer;
    padding: 0;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    transition: all 0.2s ease;
  }

  .close-button:hover {
    background-color: #333;
    color: white;
  }

  .product-form {
    padding: 2rem;
  }

  .form-group {
    margin-bottom: 1.5rem;
  }

  .form-group label {
    display: block;
    margin-bottom: 0.5rem;
    font-weight: 600;
    color: #ccc;
    font-size: 0.9rem;
  }

  .form-group input,
  .form-group textarea {
    width: 100%;
    padding: 0.75rem;
    background-color: #333;
    color: white;
    border: 1px solid #555;
    border-radius: 6px;
    font-size: 1rem;
    transition: border-color 0.2s ease;
    box-sizing: border-box;
  }

  .form-group input:focus,
  .form-group textarea:focus {
    outline: none;
    border-color: #666;
    box-shadow: 0 0 0 0.2rem rgba(102, 102, 102, 0.25);
  }

  .form-group input.error,
  .form-group textarea.error {
    border-color: #dc3545;
  }

  .form-group input.error:focus,
  .form-group textarea.error:focus {
    border-color: #dc3545;
    box-shadow: 0 0 0 0.2rem rgba(220, 53, 69, 0.25);
  }

  .form-group input:disabled,
  .form-group textarea:disabled {
    background-color: #222;
    cursor: not-allowed;
    opacity: 0.6;
  }

  .form-group textarea {
    resize: vertical;
    min-height: 80px;
  }

  .error-message {
    display: block;
    color: #dc3545;
    font-size: 0.875rem;
    margin-top: 0.25rem;
  }

  .form-actions {
    display: flex;
    justify-content: flex-end;
    gap: 1rem;
    margin-top: 2rem;
    padding-top: 1.5rem;
    border-top: 1px solid #333;
  }

  .form-actions button {
    padding: 0.75rem 1.5rem;
    border: none;
    border-radius: 6px;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    min-width: 120px;
  }

  .btn-cancel {
    background-color: #444;
    color: white;
    border: 1px solid #555;
  }

  .btn-cancel:hover:not(:disabled) {
    background-color: #555;
  }

  .btn-save {
    background-color: #666;
    color: white;
    border: 1px solid #777;
  }

  .btn-save:hover:not(:disabled) {
    background-color: #777;
  }

  .btn-save:disabled {
    background-color: #333;
    cursor: not-allowed;
    opacity: 0.5;
  }

  .form-actions button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
</style>