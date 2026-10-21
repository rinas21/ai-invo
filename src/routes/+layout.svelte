<script>
</script>

<slot />

<style>
  :global(*),
  :global(*::before),
  :global(*::after) {
    box-sizing: border-box;
  }

  :global(:root) {
    --bg-page: #f8fafc;
    --bg-surface: #ffffff;
    --bg-subtle: #f1f5f9;
    --border-color: #e2e8f0;
    --border-strong: #cbd5e1;
    --text-primary: #0f172a;
    --text-secondary: #475569;
    --text-tertiary: #94a3b8;
    --primary: #2563eb;
    --primary-hover: #1d4ed8;
    --primary-focus: rgba(37, 99, 235, 0.2);
    --danger: #dc2626;
    --danger-bg: #fef2f2;
    --danger-border: #fecaca;
    --success: #16a34a;
    --success-bg: #f0fdf4;
    --success-border: #bbf7d0;
    --radius-sm: 6px;
    --radius-md: 8px;
    --radius-lg: 12px;
    --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
    --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.07), 0 2px 4px -2px rgba(0, 0, 0, 0.05);
    --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  }

  :global(body) {
    margin: 0;
    padding: 0;
    background-color: var(--bg-page);
    color: var(--text-primary);
    font-family: var(--font-sans);
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    min-height: 100vh;
  }

  :global(button),
  :global(input),
  :global(textarea) {
    font-family: inherit;
  }
</style>
