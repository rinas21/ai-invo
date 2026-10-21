<script>
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';

  let password = '';
  let showPassword = false;
  let error = '';
  let loading = false;

  onMount(async () => {
    try {
      const res = await fetch('/api/auth/verify');
      const data = await res.json();
      if (data && data.authenticated) {
        goto('/generate');
      }
    } catch {
      // not authenticated, remain on login page
    }
  });

  function toggleShowPassword() {
    showPassword = !showPassword;
  }

  async function handleLogin() {
    if (!password.trim()) {
      error = 'Please enter the access password.';
      return;
    }

    error = '';
    loading = true;

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      const data = await res.json();

      if (res.ok) {
        await goto('/generate');
      } else {
        error = data.error || 'Authentication failed. Please check your password.';
      }
    } catch (err) {
      error = 'Unable to connect to the authentication server. Please try again.';
    } finally {
      loading = false;
    }
  }
</script>

<svelte:head>
  <title>Sign In &mdash; Invoice to Memo</title>
</svelte:head>

<main class="login-wrapper">
  <div class="login-card">
    <div class="card-header">
      <div class="brand-badge">
        <svg class="brand-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
          <polyline points="14 2 14 8 20 8"></polyline>
          <line x1="16" y1="13" x2="8" y2="13"></line>
          <line x1="16" y1="17" x2="8" y2="17"></line>
          <polyline points="10 9 9 9 8 9"></polyline>
        </svg>
        <span>WORKSPACE ACCESS</span>
      </div>
      <h1 class="card-title">Invoice to Memo</h1>
      <p class="card-subtitle">Convert vendor invoices into standardized payment approval memos</p>
    </div>

    <form class="login-form" on:submit|preventDefault={handleLogin}>
      {#if error}
        <div class="error-banner" role="alert">
          <svg class="alert-icon" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
          </svg>
          <span>{error}</span>
        </div>
      {/if}

      <div class="field-group">
        <label for="password-input" class="field-label">Access Password</label>
        <div class="input-container">
          {#if showPassword}
            <input
              id="password-input"
              type="text"
              bind:value={password}
              class="password-input"
              placeholder="Enter password"
              autocomplete="current-password"
              required
              disabled={loading}
            />
          {:else}
            <input
              id="password-input"
              type="password"
              bind:value={password}
              class="password-input"
              placeholder="Enter password"
              autocomplete="current-password"
              required
              disabled={loading}
            />
          {/if}
          <button
            type="button"
            class="toggle-btn"
            on:click={toggleShowPassword}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            tabindex="0"
          >
            {#if showPassword}
              <svg viewBox="0 0 20 20" fill="currentColor" class="toggle-icon">
                <path fill-rule="evenodd" d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.514a4 4 0 00-5.478-5.478z" clip-rule="evenodd" />
                <path d="M12.454 16.697L9.75 13.992a4 4 0 01-3.742-3.741L2.335 6.578A9.98 9.98 0 00.458 10c1.274 4.057 5.065 7 9.542 7 .847 0 1.669-.105 2.454-.303z" />
              </svg>
            {:else}
              <svg viewBox="0 0 20 20" fill="currentColor" class="toggle-icon">
                <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                <path fill-rule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clip-rule="evenodd" />
              </svg>
            {/if}
          </button>
        </div>
      </div>

      <button
        type="submit"
        disabled={loading}
        class="submit-button"
        id="login-submit-button"
      >
        {#if loading}
          <span class="spinner" aria-hidden="true"></span>
          <span>Signing in...</span>
        {:else}
          <span>Sign In</span>
        {/if}
      </button>
    </form>

    <div class="card-footer">
      <p class="footer-note">Shared workplace application &mdash; password protected.</p>
    </div>
  </div>
</main>

<style>
  .login-wrapper {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    padding: 24px 16px;
    background-color: var(--bg-page);
  }

  .login-card {
    width: 100%;
    max-width: 420px;
    background: var(--bg-surface);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-md);
    padding: 36px 32px;
  }

  .card-header {
    text-align: center;
    margin-bottom: 28px;
  }

  .brand-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    background-color: #eff6ff;
    color: var(--primary);
    border: 1px solid #dbeafe;
    border-radius: 9999px;
    font-size: 0.725rem;
    font-weight: 600;
    letter-spacing: 0.05em;
    margin-bottom: 16px;
  }

  .brand-icon {
    width: 14px;
    height: 14px;
  }

  .card-title {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--text-primary);
    letter-spacing: -0.02em;
  }

  .card-subtitle {
    margin: 8px 0 0;
    font-size: 0.875rem;
    color: var(--text-secondary);
    line-height: 1.45;
  }

  .login-form {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .error-banner {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 12px 14px;
    background-color: var(--danger-bg);
    border: 1px solid var(--danger-border);
    color: var(--danger);
    border-radius: var(--radius-md);
    font-size: 0.875rem;
    line-height: 1.4;
  }

  .alert-icon {
    width: 18px;
    height: 18px;
    flex-shrink: 0;
    margin-top: 1px;
  }

  .field-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .field-label {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-primary);
  }

  .input-container {
    position: relative;
    display: flex;
    align-items: center;
  }

  .password-input {
    width: 100%;
    padding: 10px 42px 10px 14px;
    font-size: 0.9375rem;
    color: var(--text-primary);
    background-color: var(--bg-surface);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-md);
    outline: none;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
  }

  .password-input:focus {
    border-color: var(--primary);
    box-shadow: 0 0 0 3px var(--primary-focus);
  }

  .password-input:disabled {
    background-color: var(--bg-subtle);
    cursor: not-allowed;
    color: var(--text-tertiary);
  }

  .toggle-btn {
    position: absolute;
    right: 8px;
    top: 50%;
    transform: translateY(-50%);
    background: transparent;
    border: none;
    padding: 6px;
    cursor: pointer;
    color: var(--text-secondary);
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-sm);
  }

  .toggle-btn:hover {
    color: var(--text-primary);
    background-color: var(--bg-subtle);
  }

  .toggle-icon {
    width: 18px;
    height: 18px;
  }

  .submit-button {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    padding: 11px 16px;
    background-color: var(--primary);
    color: #ffffff;
    font-size: 0.9375rem;
    font-weight: 600;
    border: 1px solid transparent;
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: background-color 0.15s ease, box-shadow 0.15s ease;
  }

  .submit-button:hover:not(:disabled) {
    background-color: var(--primary-hover);
  }

  .submit-button:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px var(--primary-focus);
  }

  .submit-button:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }

  .spinner {
    width: 16px;
    height: 16px;
    border: 2px solid rgba(255, 255, 255, 0.4);
    border-top-color: #ffffff;
    border-radius: 50%;
    animation: spin 0.75s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .card-footer {
    margin-top: 24px;
    text-align: center;
    border-top: 1px solid var(--border-color);
    padding-top: 16px;
  }

  .footer-note {
    margin: 0;
    font-size: 0.75rem;
    color: var(--text-tertiary);
  }

  @media (max-width: 480px) {
    .login-card {
      padding: 28px 20px;
    }
  }
</style>
