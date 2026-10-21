<script>
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';

  let invoiceFile = null;
  let invoiceName = '';
  let invoiceSize = '';
  let memoHtml = '';
  let loading = false;
  let generateError = '';
  let exportError = '';
  let success = '';
  let editorContent = '';

  let editorRef;

  async function checkAuth() {
    try {
      const res = await fetch('/api/auth/verify');
      const data = await res.json();
      if (!data.authenticated) await goto('/login');
    } catch {
      await goto('/login');
    }
  }

  onMount(checkAuth);

  function formatSize(bytes) {
    if (!bytes) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  }

  function handleFileChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (file.type !== 'application/pdf') {
      generateError = 'Please upload a PDF file.';
      return;
    }
    const MAX_SIZE = 15 * 1024 * 1024; // 15 MB
    if (file.size > MAX_SIZE) {
      generateError = 'File too large. Maximum 15 MB.';
      return;
    }
    invoiceFile = file;
    invoiceName = file.name;
    invoiceSize = formatSize(file.size);
    generateError = '';
    memoHtml = '';
    editorContent = '';
  }

  function removeFile() {
    invoiceFile = null;
    invoiceName = '';
    invoiceSize = '';
    memoHtml = '';
    editorContent = '';
    generateError = '';
    document.getElementById('invoice-input').value = '';
  }

  async function generateMemo() {
    if (!invoiceFile) {
      generateError = 'Please upload an invoice PDF first.';
      return;
    }
    loading = true;
    generateError = '';
    success = '';
    memoHtml = '';
    editorContent = '';

    const formData = new FormData();
    formData.append('invoice', invoiceFile);

    try {
      const res = await fetch('/api/generate', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate memo.');
      memoHtml = data.html || '';
      editorContent = memoHtml;
      if (editorRef) editorRef.innerHTML = memoHtml;
      success = 'Memo generated. Review and edit before exporting.';
    } catch (err) {
      generateError = err.message || 'Generation failed.';
    } finally {
      loading = false;
    }
  }

  function onEditorInput() {
    if (editorRef) editorContent = editorRef.innerHTML;
  }

  async function copyMemo() {
    try {
      await navigator.clipboard.writeText(editorRef ? editorRef.textContent : editorContent);
      success = 'Copied to clipboard.';
      setTimeout(() => (success = ''), 2000);
    } catch {
      exportError = 'Failed to copy to clipboard.';
    }
  }

  async function exportDocx() {
    const html = editorRef ? editorRef.innerHTML : editorContent;
    if (!html.trim()) {
      exportError = 'No memo content to export.';
      return;
    }
    exportError = '';
    try {
      const res = await fetch('/api/export/word', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html }),
      });
      if (!res.ok) throw new Error('Word export failed.');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'payment_approval_memo.docx';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      success = 'Word document downloaded.';
      setTimeout(() => (success = ''), 2000);
    } catch {
      exportError = 'Failed to generate Word document.';
    }
  }

  async function exportPdf() {
    const html = editorRef ? editorRef.innerHTML : editorContent;
    if (!html.trim()) {
      exportError = 'No memo content to export.';
      return;
    }
    exportError = '';
    try {
      const res = await fetch('/api/export/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html }),
      });
      if (!res.ok) throw new Error('PDF export failed.');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'payment_approval_memo.pdf';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      success = 'PDF downloaded.';
      setTimeout(() => (success = ''), 2000);
    } catch {
      exportError = 'Failed to generate PDF.';
    }
  }
</script>

<svelte:head>
  <title>Generate Memo - Invoice to Memo</title>
</svelte:head>

<div class="min-h-screen bg-slate-50">
  <!-- Top bar -->
  <div class="bg-white border-b border-slate-200">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="flex items-center justify-between h-16">
        <div class="flex items-center gap-2">
          <span class="bg-indigo-600 text-white px-2 py-1 rounded text-xs font-semibold">INVOICE TO MEMO</span>
          <span class="text-sm font-medium text-slate-700">Payment Approval Memo Generator</span>
        </div>
        <button
          onclick={() => fetch('/api/auth/logout', { method: 'POST' }).then(() => goto('/login'))}
          class="px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition"
        >
          Logout
        </button>
      </div>
    </div>
  </div>

  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
    <!-- Feedback -->
    {#if generateError}
      <div class="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm flex items-center gap-2">
        <span>&#x26A0;</span> {generateError}
      </div>
    {/if}
    {#if exportError}
      <div class="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm flex items-center gap-2">
        <span>&#x26A0;</span> {exportError}
      </div>
    {/if}
    {#if success}
      <div class="mb-4 p-3 rounded-lg bg-green-50 border border-green-200 text-green-700 text-sm flex items-center gap-2">
        <span>&#x2714;</span> {success}
      </div>
    {/if}

    <!-- Upload + Controls -->
    <div class="bg-white p-6 rounded-xl shadow-sm border border-slate-200 mb-6">
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div class="lg:col-span-2 space-y-4">
          <div class="border-2 border-dashed border-slate-300 rounded-xl p-6 text-center hover:border-indigo-400 transition">
            <input
              id="invoice-input"
              type="file"
              accept="application/pdf"
              onchange={handleFileChange}
              class="block w-full text-slate-700 cursor-pointer"
            />
            <p class="mt-2 text-sm text-slate-600">Upload invoice PDF (text-based)</p>
          </div>

          {#if invoiceName}
            <div class="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-lg p-3">
              <span class="text-blue-700 text-sm font-medium">&#x1F4CE;</span>
              <div>
                <div class="text-sm font-medium text-slate-900">{invoiceName}</div>
                <div class="text-xs text-slate-500">{invoiceSize}</div>
              </div>
              <button
                onclick={removeFile}
                class="ml-auto text-red-500 hover:text-red-700 text-sm"
              >
                Remove
              </button>
            </div>
          {/if}

          <div class="flex items-center gap-3">
            <button
              onclick={generateMemo}
              disabled={loading || !invoiceFile}
              class="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:text-slate-500 text-white font-medium rounded-lg transition"
            >
              {loading ? 'Generating...' : 'Generate Memo'}
            </button>
            <button
              onclick={removeFile}
              disabled={!invoiceName}
              class="px-4 py-2.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-medium rounded-lg transition"
            >
              Clear
            </button>
          </div>

          {#if loading}
            <div class="flex items-center gap-3 text-sm text-slate-500">
              <div class="w-4 h-4 border-2 border-slate-300 border-t-indigo-600 rounded-full animate-spin"></div>
              Extracting invoice text and generating memo&hellip;
            </div>
          {/if}
        </div>

        <div class="lg:col-span-1">
          <div class="bg-slate-50 p-4 rounded-lg border border-slate-200">
            <h3 class="text-sm font-semibold text-slate-700 mb-3">Steps</h3>
            <ol class="text-sm text-slate-600 space-y-2 list-disc list-inside">
              <li>Upload a text-based invoice PDF.</li>
              <li>Click <b>Generate Memo</b>.</li>
              <li>Review and edit the memo.</li>
              <li>Copy or download as Word/PDF.</li>
            </ol>
          </div>
        </div>
      </div>
    </div>

    <!-- Editor preview -->
    {#if memoHtml || editorContent}
      <div class="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-lg font-semibold text-slate-900">Memo Preview (Editable)</h2>
          <div class="flex gap-2">
            <button
              onclick={copyMemo}
              class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-lg transition"
            >
              Copy
            </button>
            <button
              onclick={exportDocx}
              class="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition"
            >
              Download Word
            </button>
            <button
              onclick={exportPdf}
              class="px-4 py-2 bg-slate-600 hover:bg-slate-700 text-white text-sm font-medium rounded-lg transition"
            >
              Download PDF
            </button>
          </div>
        </div>
        <div
          bind:this={editorRef}
          contenteditable="true"
          oninput={onEditorInput}
          class="prose prose-sm max-w-none min-h-[400px] border border-slate-300 rounded-lg p-6 bg-white text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
        >
          {@html editorContent}
        </div>
        <p class="mt-2 text-xs text-slate-500">Edit the memo directly above. Changes are reflected in exports.</p>
      </div>
    {/if}
  </div>
</div>

<style>
  :global(body) {
    margin: 0;
  }
  .animate-spin {
    animation: spin 1s linear infinite;
  }
  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
  .prose p { margin: 0 0 1em; }
  .prose h1 { font-size: 1.125em; font-weight: 700; text-decoration: underline; border-top: 1px solid #333; border-bottom: 1px solid #333; padding: 10px 0; margin: 0 0 1em; }
  .prose table { width: 100%; border-collapse: collapse; margin: 0 0 1em; }
  .prose th, .prose td { border: 1px solid #333; padding: 8px 10px; text-align: center; }
</style>
