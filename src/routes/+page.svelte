<script>
  import { goto } from '$app/navigation';

  let password = '';
  let error = '';
  let loading = false;

  async function handleLogin(e) {
    e.preventDefault();
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
        error = data.error || 'Invalid credentials.';
      }
    } catch {
      error = 'Unable to reach the server. Try again.';
    } finally {
      loading = false;
    }
  }
</script>

<svelte:head>
  <title>Login - Invoice to Memo</title>
</svelte:head>

<div class="min-h-screen flex items-center justify-center bg-slate-50 px-4">
  <div class="max-w-md w-full">
    <div class="bg-white p-8 rounded-xl shadow-sm border border-slate-200">
      <div class="text-center mb-8">
        <h1 class="text-2xl font-bold text-slate-900">Invoice to Memo</h1>
        <p class="text-slate-600 mt-2">Enter the access password to continue.</p>
      </div>

      <form onsubmit={handleLogin} class="space-y-4">
        <div>
          <label for="password-input" class="block text-sm font-medium text-slate-700 mb-1">Password</label>
          <input
            id="password-input"
            type="password"
            bind:value={password}
            class="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition"
            placeholder="Enter password"
            required
            disabled={loading}
          />
        </div>

        {#if error}
          <div class="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
            {error}
          </div>
        {/if}

        <button
          type="submit"
          disabled={loading}
          class="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-200 text-white font-medium rounded-lg transition"
        >
          {loading ? 'Signing in...' : 'Sign in'}
        </button>
      </form>

      <p class="text-center text-sm text-slate-500 mt-6">
        Demo application &mdash; no registration, shared access password only.
      </p>
    </div>
  </div>
</div>

<style>
  :global(body) {
    margin: 0;
  }
</style>
