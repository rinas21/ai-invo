<script>
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';

  let invoiceFile = null;
  let invoiceName = '';
  let invoiceSize = '';
  let isDragOver = false;

  let memoHtml = '';
  let editorContent = '';
  let editorRef = null;

  let extractedFields = null;
  let structuredData = null;

  let loading = false;
  let regenerating = false;
  let generateError = '';
  let exportError = '';
  let successNotice = '';
  let copyFeedback = '';

  onMount(async () => {
    try {
      const res = await fetch('/api/auth/verify');
      const data = await res.json();
      if (!data || !data.authenticated) {
        await goto('/');
      }
    } catch {
      await goto('/');
    }
  });

  async function handleLogout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore
    } finally {
      await goto('/');
    }
  }

  function formatSize(bytes) {
    if (!bytes && bytes !== 0) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  }

  function setFile(file) {
    if (!file) return;

    generateError = '';
    exportError = '';
    successNotice = '';

    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (!isPdf) {
      generateError = 'Invalid file type. Only PDF documents are supported.';
      return;
    }

    const MAX_SIZE = 15 * 1024 * 1024; // 15 MB
    if (file.size > MAX_SIZE) {
      generateError = 'File exceeds 15 MB limit. Please select a smaller PDF.';
      return;
    }

    if (file.size === 0) {
      generateError = 'The selected file is empty.';
      return;
    }

    invoiceFile = file;
    invoiceName = file.name;
    invoiceSize = formatSize(file.size);
  }

  function handleFileInputChange(e) {
    const file = e.target.files && e.target.files[0];
    if (file) setFile(file);
  }

  function handleDragOver(e) {
    e.preventDefault();
    isDragOver = true;
  }

  function handleDragLeave(e) {
    e.preventDefault();
    isDragOver = false;
  }

  function handleDrop(e) {
    e.preventDefault();
    isDragOver = false;
    const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) setFile(file);
  }

  function startOver() {
    invoiceFile = null;
    invoiceName = '';
    invoiceSize = '';
    memoHtml = '';
    editorContent = '';
    extractedFields = null;
    structuredData = null;
    generateError = '';
    exportError = '';
    successNotice = '';
    copyFeedback = '';
    const input = document.getElementById('invoice-file-input');
    if (input) input.value = '';
  }

  async function generateMemo() {
    if (!invoiceFile) {
      generateError = 'Please upload an invoice PDF before generating.';
      return;
    }

    loading = true;
    generateError = '';
    exportError = '';
    successNotice = '';

    const formData = new FormData();
    formData.append('invoice', invoiceFile);

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to generate memo.');
      }

      memoHtml = data.html || '';
      editorContent = memoHtml;
      extractedFields = data.fields || null;
      structuredData = data.structuredData || null;

      if (editorRef) {
        editorRef.innerHTML = memoHtml;
      }

      successNotice = 'Payment approval memo generated. You can review extracted values or edit the memo directly.';
    } catch (err) {
      generateError = err.message || 'Generation failed. Please try again.';
    } finally {
      loading = false;
    }
  }

  async function regenerateFromFields() {
    if (!extractedFields) return;
    regenerating = true;
    generateError = '';
    exportError = '';
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: extractedFields }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update memo.');

      memoHtml = data.html || '';
      editorContent = memoHtml;
      if (editorRef) {
        editorRef.innerHTML = memoHtml;
      }
      successNotice = 'Memo regenerated with your updated fields.';
    } catch (err) {
      generateError = err.message || 'Update failed.';
    } finally {
      regenerating = false;
    }
  }

  function handleEditorInput() {
    if (editorRef) {
      editorContent = editorRef.innerHTML;
    }
  }

  async function handleCopy() {
    const textToCopy = editorRef ? (editorRef.innerText || editorRef.textContent) : editorContent;
    if (!textToCopy || !textToCopy.trim()) {
      exportError = 'No content available to copy.';
      return;
    }

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(textToCopy);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = textToCopy;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      copyFeedback = 'Copied to clipboard!';
      setTimeout(() => { copyFeedback = ''; }, 2500);
    } catch {
      exportError = 'Unable to copy to clipboard.';
    }
  }

  async function handleDownloadDocx() {
    const currentHtml = editorRef ? editorRef.innerHTML : editorContent;
    if (!currentHtml || !currentHtml.trim()) {
      exportError = 'No memo content to export.';
      return;
    }

    exportError = '';
    try {
      const res = await fetch('/api/export/word', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html: currentHtml }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Word export failed.');
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `payment_approval_memo_${new Date().toISOString().slice(0, 10)}.docx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      exportError = err.message || 'Failed to download Word document.';
    }
  }

  async function handleDownloadPdf() {
    const currentHtml = editorRef ? editorRef.innerHTML : editorContent;
    if (!currentHtml || !currentHtml.trim()) {
      exportError = 'No memo content to export.';
      return;
    }

    exportError = '';
    try {
      const res = await fetch('/api/export/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html: currentHtml }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'PDF export failed.');
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `payment_approval_memo_${new Date().toISOString().slice(0, 10)}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      exportError = err.message || 'Failed to download PDF.';
    }
  }
</script>

<svelte:head>
  <title>Payment Approval Memo Generator</title>
</svelte:head>

<div class="workspace">
  <!-- Top Navigation Header -->
  <header class="app-header">
    <div class="header-inner">
      <div class="header-branding">
        <div class="header-icon-box">
          <svg class="header-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <line x1="16" y1="13" x2="8" y2="13"></line>
            <line x1="16" y1="17" x2="8" y2="17"></line>
            <polyline points="10 9 9 9 8 9"></polyline>
          </svg>
        </div>
        <div>
          <span class="app-title">Invoice to Memo</span>
          <span class="app-subtitle">Corporate Payment Approval System</span>
        </div>
      </div>

      <button
        type="button"
        class="logout-button"
        on:click={handleLogout}
        title="Sign out of workspace"
      >
        <svg class="logout-icon" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 102 0V4a1 1 0 00-1-1zm10.293 9.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L14.586 9H7a1 1 0 100 2h7.586l-1.293 1.293z" clip-rule="evenodd" />
        </svg>
        <span>Sign Out</span>
      </button>
    </div>
  </header>

  <!-- Main Container -->
  <main class="main-content">
    <!-- Page Intro -->
    <div class="page-heading">
      <h1 class="heading-title">Generate Approval Memo</h1>
      <p class="heading-desc">
        Upload a vendor invoice PDF to extract payee, dates, amounts, and generate a standardized payment approval memo.
      </p>
    </div>

    <!-- Feedback Notices -->
    {#if generateError}
      <div class="banner banner-error" role="alert">
        <svg class="banner-icon" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
        </svg>
        <span>{generateError}</span>
      </div>
    {/if}

    {#if exportError}
      <div class="banner banner-error" role="alert">
        <svg class="banner-icon" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
        </svg>
        <span>{exportError}</span>
      </div>
    {/if}

    {#if successNotice}
      <div class="banner banner-success" role="status">
        <svg class="banner-icon" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
        </svg>
        <span>{successNotice}</span>
      </div>
    {/if}

    <!-- Upload & Workspace Card -->
    <section class="card upload-section">
      <!-- Drag and Drop Box -->
      <div
        class="dropzone {isDragOver ? 'drag-active' : ''}"
        on:dragover={handleDragOver}
        on:dragleave={handleDragLeave}
        on:drop={handleDrop}
        role="region"
        aria-label="PDF upload dropzone"
      >
        <input
          id="invoice-file-input"
          type="file"
          accept="application/pdf"
          class="file-input-hidden"
          on:change={handleFileInputChange}
          disabled={loading}
        />
        <label for="invoice-file-input" class="dropzone-label">
          <div class="upload-icon-circle">
            <svg class="upload-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="17 8 12 3 7 8"></polyline>
              <line x1="12" y1="3" x2="12" y2="15"></line>
            </svg>
          </div>
          <div class="dropzone-text">
            <span class="dropzone-action">Click to upload</span>
            <span class="dropzone-or"> or drag and drop invoice PDF</span>
          </div>
          <span class="dropzone-hint">Text-based PDF invoices up to 15 MB</span>
        </label>
      </div>

      <!-- Invoice Status Display -->
      {#if invoiceName}
        <div class="invoice-status-bar" id="invoice-status-display">
          <div class="status-left">
            <div class="pdf-tag">PDF</div>
            <div class="file-details">
              <span class="file-name" title={invoiceName}>{invoiceName}</span>
              <span class="file-meta">{invoiceSize} &bull; Ready for extraction</span>
            </div>
          </div>
          <button
            type="button"
            class="remove-file-btn"
            on:click={startOver}
            disabled={loading}
          >
            Remove
          </button>
        </div>
      {/if}

      <!-- Action Buttons -->
      <div class="action-bar">
        <button
          type="button"
          class="btn btn-primary"
          id="generate-memo-button"
          on:click={generateMemo}
          disabled={loading || !invoiceFile}
        >
          {#if loading}
            <span class="spinner" aria-hidden="true"></span>
            <span>Extracting Invoice &amp; Generating Memo...</span>
          {:else}
            <svg class="btn-icon" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clip-rule="evenodd" />
            </svg>
            <span>Generate Memo</span>
          {/if}
        </button>

        {#if invoiceFile || memoHtml}
          <button
            type="button"
            class="btn btn-secondary"
            id="start-over-button"
            on:click={startOver}
            disabled={loading}
          >
            Start Over
          </button>
        {/if}
      </div>
    </section>

    <!-- Extraction Review Step Panel (Section 7) -->
    {#if extractedFields}
      <section class="card review-card" id="extraction-review-panel">
        <div class="review-header">
          <div>
            <h2 class="review-title">Extraction Review</h2>
            <p class="review-subtitle">
              Verify the extracted values below. Correct any field and click <b>Update &amp; Regenerate</b> to refresh the memo.
            </p>
          </div>
          <div class="review-badges">
            {#if structuredData?.arithmeticValid === true}
              <span class="badge badge-success">✓ Arithmetic Verified: {structuredData.quantity} &times; {structuredData.unitPrice} = {structuredData.totalAmount}</span>
            {:else if structuredData?.discrepancy}
              <span class="badge badge-warning">⚠ {structuredData.discrepancy}</span>
            {/if}
            {#if structuredData?.currency}
              <span class="badge badge-neutral">Currency: {structuredData.currency}</span>
            {/if}
          </div>
        </div>

        <div class="review-grid">
          <div class="field-item">
            <label for="f-date" class="review-label">Invoice Date</label>
            <input id="f-date" type="text" class="review-input" bind:value={extractedFields.invoiceDate} />
          </div>

          <div class="field-item">
            <label for="f-invno" class="review-label">Invoice / Ref No</label>
            <input id="f-invno" type="text" class="review-input" bind:value={extractedFields.invoiceNo} />
          </div>

          <div class="field-item">
            <label for="f-supplier" class="review-label">Supplier Name</label>
            <input id="f-supplier" type="text" class="review-input" bind:value={extractedFields.supplierName} />
          </div>

          <div class="field-item">
            <label for="f-amount" class="review-label">Total Amount</label>
            <input id="f-amount" type="text" class="review-input" bind:value={extractedFields.amount} />
          </div>

          <div class="field-item full-width">
            <label for="f-purpose" class="review-label">Payment Purpose</label>
            <input id="f-purpose" type="text" class="review-input" bind:value={extractedFields.paymentPurpose} />
          </div>

          <div class="field-item full-width">
            <label for="f-desc" class="review-label">Description / Fee Service</label>
            <input id="f-desc" type="text" class="review-input" bind:value={extractedFields.description} />
          </div>
        </div>

        <div class="review-footer">
          <button
            type="button"
            class="btn btn-secondary btn-sm"
            on:click={regenerateFromFields}
            disabled={regenerating}
            id="regenerate-memo-button"
          >
            {#if regenerating}
              <span class="spinner" aria-hidden="true"></span>
              <span>Updating Memo...</span>
            {:else}
              <span>Update &amp; Regenerate Memo</span>
            {/if}
          </button>
        </div>
      </section>
    {/if}

    <!-- Memo Editor & Preview Section -->
    {#if memoHtml || editorContent}
      <section class="card editor-section" id="memo-editor-section">
        <div class="editor-header">
          <div>
            <h2 class="editor-title">Approval Memo Preview</h2>
            <p class="editor-subtitle">Review and edit fields directly before exporting. Highlights mark review items.</p>
          </div>

          <!-- Document Controls -->
          <div class="editor-actions">
            {#if copyFeedback}
              <span class="copy-feedback-toast">{copyFeedback}</span>
            {/if}
            <button
              type="button"
              class="btn btn-outline"
              id="copy-memo-button"
              on:click={handleCopy}
              title="Copy memo text to clipboard"
            >
              <svg class="btn-icon" viewBox="0 0 20 20" fill="currentColor">
                <path d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" />
                <path d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 2H9a3 3 0 01-3-2z" />
              </svg>
              <span>Copy</span>
            </button>

            <button
              type="button"
              class="btn btn-outline"
              id="download-word-button"
              on:click={handleDownloadDocx}
              title="Download Word (.docx) document"
            >
              <svg class="btn-icon" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clip-rule="evenodd" />
              </svg>
              <span>Download Word</span>
            </button>

            <button
              type="button"
              class="btn btn-outline btn-accent"
              id="download-pdf-button"
              on:click={handleDownloadPdf}
              title="Download PDF document"
            >
              <svg class="btn-icon" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M6 2a2 2 0 00-2 2v12a2 2 0 002 2h8a2 2 0 002-2V7.414A2 2 0 0015.414 6L12 2.586A2 2 0 0010.586 2H6zm5 2l4 4h-4V4z" clip-rule="evenodd" />
              </svg>
              <span>Download PDF</span>
            </button>
          </div>
        </div>

        <!-- Editable Paper Document -->
        <div class="editor-scroll-container">
          <div
            bind:this={editorRef}
            contenteditable="true"
            on:input={handleEditorInput}
            class="memo-paper-editor"
            id="memo-content-editable"
            role="textbox"
            aria-multiline="true"
            aria-label="Editable payment approval memo"
          >
            {@html editorContent}
          </div>
        </div>
      </section>
    {/if}
  </main>
</div>

<style>
  .workspace {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    background-color: var(--bg-page);
  }

  /* Header */
  .app-header {
    background-color: var(--bg-surface);
    border-bottom: 1px solid var(--border-color);
    position: sticky;
    top: 0;
    z-index: 20;
  }

  .header-inner {
    max-width: 1080px;
    margin: 0 auto;
    padding: 0 20px;
    height: 60px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .header-branding {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .header-icon-box {
    width: 32px;
    height: 32px;
    background-color: #eff6ff;
    border: 1px solid #dbeafe;
    border-radius: var(--radius-sm);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--primary);
  }

  .header-icon {
    width: 18px;
    height: 18px;
  }

  .app-title {
    display: block;
    font-size: 0.9375rem;
    font-weight: 700;
    color: var(--text-primary);
    line-height: 1.2;
  }

  .app-subtitle {
    display: block;
    font-size: 0.75rem;
    color: var(--text-secondary);
    line-height: 1.2;
  }

  .logout-button {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    background: transparent;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .logout-button:hover {
    background-color: var(--bg-subtle);
    color: var(--text-primary);
    border-color: var(--border-strong);
  }

  .logout-icon {
    width: 15px;
    height: 15px;
  }

  /* Main Container */
  .main-content {
    max-width: 1080px;
    width: 100%;
    margin: 0 auto;
    padding: 32px 20px 60px;
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  .page-heading {
    margin-bottom: 4px;
  }

  .heading-title {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--text-primary);
    letter-spacing: -0.02em;
  }

  .heading-desc {
    margin: 6px 0 0;
    font-size: 0.9375rem;
    color: var(--text-secondary);
    line-height: 1.5;
  }

  /* Alerts */
  .banner {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 12px 16px;
    border-radius: var(--radius-md);
    font-size: 0.875rem;
    line-height: 1.45;
  }

  .banner-icon {
    width: 18px;
    height: 18px;
    flex-shrink: 0;
    margin-top: 1px;
  }

  .banner-error {
    background-color: var(--danger-bg);
    border: 1px solid var(--danger-border);
    color: var(--danger);
  }

  .banner-success {
    background-color: var(--success-bg);
    border: 1px solid var(--success-border);
    color: var(--success);
  }

  /* Cards */
  .card {
    background-color: var(--bg-surface);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-sm);
    padding: 24px;
  }

  /* Dropzone */
  .dropzone {
    border: 2px dashed var(--border-strong);
    border-radius: var(--radius-md);
    background-color: #fbfcfe;
    transition: all 0.2s ease;
    cursor: pointer;
  }

  .dropzone:hover,
  .dropzone.drag-active {
    border-color: var(--primary);
    background-color: #f0f7ff;
  }

  .file-input-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    border: 0;
  }

  .dropzone-label {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 36px 20px;
    cursor: pointer;
    text-align: center;
  }

  .upload-icon-circle {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background-color: #eff6ff;
    color: var(--primary);
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 12px;
  }

  .upload-svg {
    width: 22px;
    height: 22px;
  }

  .dropzone-text {
    font-size: 0.9375rem;
    margin-bottom: 4px;
  }

  .dropzone-action {
    color: var(--primary);
    font-weight: 600;
  }

  .dropzone-or {
    color: var(--text-secondary);
  }

  .dropzone-hint {
    font-size: 0.8125rem;
    color: var(--text-tertiary);
  }

  /* Invoice Status Display */
  .invoice-status-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 16px;
    padding: 12px 16px;
    background-color: var(--bg-subtle);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
  }

  .status-left {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
  }

  .pdf-tag {
    background-color: #dc2626;
    color: #ffffff;
    font-size: 0.6875rem;
    font-weight: 700;
    padding: 3px 6px;
    border-radius: 4px;
    letter-spacing: 0.04em;
  }

  .file-details {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .file-name {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .file-meta {
    font-size: 0.75rem;
    color: var(--text-secondary);
  }

  .remove-file-btn {
    background: transparent;
    border: none;
    color: var(--danger);
    font-size: 0.8125rem;
    font-weight: 500;
    cursor: pointer;
    padding: 4px 8px;
    border-radius: var(--radius-sm);
  }

  .remove-file-btn:hover {
    background-color: var(--danger-bg);
  }

  /* Action Bar */
  .action-bar {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-top: 20px;
    flex-wrap: wrap;
  }

  /* Extraction Review Panel (Section 7) */
  .review-card {
    background-color: var(--bg-surface);
    border: 1px solid var(--border-strong);
  }

  .review-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 16px;
    flex-wrap: wrap;
  }

  .review-title {
    margin: 0;
    font-size: 1.0625rem;
    font-weight: 700;
    color: var(--text-primary);
  }

  .review-subtitle {
    margin: 4px 0 0;
    font-size: 0.8125rem;
    color: var(--text-secondary);
  }

  .review-badges {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .badge {
    font-size: 0.75rem;
    font-weight: 600;
    padding: 3px 8px;
    border-radius: var(--radius-sm);
  }

  .badge-success {
    background-color: var(--success-bg);
    color: var(--success);
    border: 1px solid var(--success-border);
  }

  .badge-warning {
    background-color: #fffbeb;
    color: #b45309;
    border: 1px solid #fde68a;
  }

  .badge-neutral {
    background-color: var(--bg-subtle);
    color: var(--text-secondary);
    border: 1px solid var(--border-color);
  }

  .review-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 14px;
  }

  .field-item {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .field-item.full-width {
    grid-column: span 2;
  }

  .review-label {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .review-input {
    width: 100%;
    padding: 7px 10px;
    font-size: 0.875rem;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    color: var(--text-primary);
    background-color: var(--bg-page);
    outline: none;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
  }

  .review-input:focus {
    border-color: var(--primary);
    background-color: #ffffff;
    box-shadow: 0 0 0 2px var(--primary-focus);
  }

  .review-footer {
    margin-top: 16px;
    padding-top: 12px;
    border-top: 1px solid var(--border-color);
    display: flex;
    justify-content: flex-end;
  }

  .btn-sm {
    padding: 7px 14px;
    font-size: 0.8125rem;
  }

  /* Buttons */
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 9px 18px;
    font-size: 0.875rem;
    font-weight: 600;
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: all 0.15s ease;
    border: 1px solid transparent;
    line-height: 1.25;
  }

  .btn-icon {
    width: 16px;
    height: 16px;
  }

  .btn-primary {
    background-color: var(--primary);
    color: #ffffff;
  }

  .btn-primary:hover:not(:disabled) {
    background-color: var(--primary-hover);
  }

  .btn-primary:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px var(--primary-focus);
  }

  .btn-primary:disabled {
    background-color: #93c5fd;
    cursor: not-allowed;
  }

  .btn-secondary {
    background-color: var(--bg-surface);
    border-color: var(--border-strong);
    color: var(--text-secondary);
  }

  .btn-secondary:hover:not(:disabled) {
    background-color: var(--bg-subtle);
    color: var(--text-primary);
  }

  .btn-outline {
    background-color: var(--bg-surface);
    border-color: var(--border-color);
    color: var(--text-secondary);
    padding: 8px 14px;
    font-size: 0.8125rem;
  }

  .btn-outline:hover:not(:disabled) {
    background-color: var(--bg-subtle);
    color: var(--text-primary);
    border-color: var(--border-strong);
  }

  .btn-accent {
    color: var(--primary);
    border-color: #bfdbfe;
    background-color: #eff6ff;
  }

  .btn-accent:hover:not(:disabled) {
    background-color: #dbeafe;
    color: var(--primary-hover);
    border-color: #93c5fd;
  }

  .spinner {
    width: 15px;
    height: 15px;
    border: 2px solid rgba(255, 255, 255, 0.4);
    border-top-color: #ffffff;
    border-radius: 50%;
    animation: spin 0.75s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* Editor Section */
  .editor-section {
    padding: 24px;
    overflow: hidden;
  }

  .editor-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 20px;
    padding-bottom: 16px;
    border-bottom: 1px solid var(--border-color);
    flex-wrap: wrap;
  }

  .editor-title {
    margin: 0;
    font-size: 1.125rem;
    font-weight: 700;
    color: var(--text-primary);
  }

  .editor-subtitle {
    margin: 4px 0 0;
    font-size: 0.8125rem;
    color: var(--text-secondary);
  }

  .editor-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    position: relative;
  }

  .copy-feedback-toast {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--success);
    background-color: var(--success-bg);
    border: 1px solid var(--success-border);
    padding: 4px 8px;
    border-radius: var(--radius-sm);
  }

  .editor-scroll-container {
    overflow-x: auto;
    background-color: #e5e7eb;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    padding: 32px 16px;
  }

  /* Paper Preview Container */
  .memo-paper-editor {
    max-width: 820px;
    margin: 0 auto;
    background-color: #ffffff;
    padding: 48px 56px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
    font-family: Calibri, 'Segoe UI', Arial, sans-serif;
    font-size: 15px;
    line-height: 1.55;
    color: #1b1b1b;
    outline: none;
    min-height: 480px;
    border-radius: 2px;
  }

  .memo-paper-editor:focus {
    box-shadow: 0 0 0 2px var(--primary), 0 4px 12px rgba(0, 0, 0, 0.08);
  }

  /* Template Content inside Editor */
  :global(.memo-paper-editor p) {
    margin: 0 0 20px;
  }

  :global(.memo-paper-editor .date) {
    font-weight: 700;
    margin: 0 0 24px;
  }

  :global(.memo-paper-editor .subject) {
    font-size: 0.95rem;
    font-weight: 700;
    text-decoration: underline;
    border-top: 1px solid #333333;
    border-bottom: 1px solid #333333;
    padding: 10px 0;
    margin: 0 0 28px;
  }

  :global(.memo-paper-editor .ph) {
    background-color: #fff3c4;
    padding: 1px 4px;
    border-radius: 2px;
  }

  :global(.memo-paper-editor .table-wrap) {
    overflow-x: auto;
    margin-bottom: 24px;
  }

  :global(.memo-paper-editor table) {
    width: 100%;
    border-collapse: collapse;
    min-width: 520px;
    margin-bottom: 20px;
  }

  :global(.memo-paper-editor th),
  :global(.memo-paper-editor td) {
    border: 1px solid #333333;
    padding: 8px 10px;
    text-align: center;
    vertical-align: middle;
  }

  :global(.memo-paper-editor th) {
    font-weight: 600;
  }

  :global(.memo-paper-editor td.num) {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  :global(.memo-paper-editor tr.total td) {
    border-top: 2px solid #333333;
  }

  :global(.memo-paper-editor tr.total td:first-child) {
    text-align: left;
    font-weight: 700;
  }

  :global(.memo-paper-editor .sign) {
    display: flex;
    justify-content: space-between;
    margin-top: 64px;
    gap: 24px;
  }

  :global(.memo-paper-editor .sign div) {
    min-width: 180px;
    padding-top: 8px;
    border-top: 1px solid #333333;
    font-weight: 600;
  }

  :global(.memo-paper-editor .note) {
    margin-top: 36px;
    font-size: 0.8125rem;
    color: #666666;
    border-top: 1px dashed #cccccc;
    padding-top: 10px;
  }

  @media (max-width: 640px) {
    .main-content {
      padding: 20px 12px 40px;
    }

    .memo-paper-editor {
      padding: 24px 18px;
      font-size: 14px;
    }

    .editor-header {
      flex-direction: column;
      align-items: stretch;
    }

    .editor-actions {
      justify-content: flex-start;
    }

    .btn {
      width: 100%;
    }

    .action-bar {
      flex-direction: column;
    }

    .action-bar .btn {
      width: 100%;
    }

    .review-grid {
      grid-template-columns: 1fr;
    }

    .field-item.full-width {
      grid-column: span 1;
    }
  }
</style>
