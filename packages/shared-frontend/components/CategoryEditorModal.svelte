<script>
  import { createEventDispatcher } from 'svelte';
  
  export let visible = false;
  export let category = null;

  const dispatch = createEventDispatcher();

  let formData = { name: '', type: 'food' };
  let originalData = {};
  let isSubmitting = false;

  $: if (category && visible) {
    const categoryNames = JSON.parse(category.category_names || '{}');
    formData = {
      name: categoryNames.de || '',
      type: category.category_type || 'food'
    };
    originalData = { ...formData };
  }

  async function handleSave() {
    if (!formData.name.trim()) {
      alert('Category name is required.');
      return;
    }
    isSubmitting = true;
    const updates = {};
    if (formData.name !== originalData.name) updates.name = formData.name.trim();
    if (formData.type !== originalData.type) updates.type = formData.type;

    if (Object.keys(updates).length > 0) {
      dispatch('save', { categoryId: category.id, updates });
    }
    handleClose();
  }

  function handleClose() {
    isSubmitting = false;
    dispatch('close');
  }

  function handleOverlayClick(event) {
    if (event.target === event.currentTarget) handleClose();
  }

  function handleKeydown(event) {
    if (event.key === 'Escape') handleClose();
  }

  function handleOverlayKeydown(event) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleClose();
    } else if (event.key === 'Escape') {
      handleClose();
    }
  }
</script>

<svelte:window on:keydown={handleKeydown} />

{#if visible && category}
  <div class="modal-overlay" role="button" tabindex="0" on:click={handleOverlayClick} on:keydown={handleOverlayKeydown}>
    <div class="modal-content">
      <div class="modal-header">
        <h2>Edit Category</h2>
        <button class="close-button" on:click={handleClose}>×</button>
      </div>
      <form on:submit|preventDefault={handleSave} class="product-form">
        <div class="form-group">
          <label for="category-name">Category Name</label>
          <input id="category-name" type="text" bind:value={formData.name} disabled={isSubmitting} />
        </div>
        <div class="form-group">
          <label for="category-type">Category Type</label>
          <select id="category-type" bind:value={formData.type} disabled={isSubmitting}>
            <option value="food">Food</option>
            <option value="drink">Drink</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div class="form-actions">
          <button type="button" class="btn-cancel" on:click={handleClose} disabled={isSubmitting}>Cancel</button>
          <button type="submit" class="btn-save" disabled={isSubmitting}>{isSubmitting ? 'Saving...' : 'Save Changes'}</button>
        </div>
      </form>
    </div>
  </div>
{/if}

<style>
  /* Styles copied from ProductEditorModal.svelte for consistency */
  .modal-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0, 0, 0, 0.8); display: flex; justify-content: center; align-items: center; z-index: 1000; }
  .modal-content { background-color: white; border-radius: 12px; width: 90%; max-width: 500px; max-height: 90vh; overflow-y: auto; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
  .modal-header { display: flex; justify-content: space-between; align-items: center; padding: 1.5rem 2rem 1rem; border-bottom: 1px solid #e9ecef; }
  .modal-header h2 { margin: 0; color: #2c3e50; font-size: 1.5rem; }
  .close-button { background: none; border: none; font-size: 2rem; color: #6c757d; cursor: pointer; }
  .product-form { padding: 2rem; }
  .form-group { margin-bottom: 1.5rem; }
  .form-group label { display: block; margin-bottom: .5rem; font-weight: 600; color: #495057; }
  .form-group input, .form-group select { width: 100%; padding: .75rem; border: 2px solid #e9ecef; border-radius: 6px; font-size: 1rem; box-sizing: border-box; }
  .form-actions { display: flex; justify-content: flex-end; gap: 1rem; margin-top: 2rem; padding-top: 1.5rem; border-top: 1px solid #e9ecef; }
  .form-actions button { padding: .75rem 1.5rem; border: none; border-radius: 6px; font-size: 1rem; font-weight: 600; cursor: pointer; }
  .btn-cancel { background-color: #6c757d; color: white; }
  .btn-save { background-color: #007bff; color: white; }
</style>