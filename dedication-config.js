// Shared storage is protected by the Edge Function and a collection key entered at runtime.
// Never put database service-role keys or server secrets in this public file.
window.DEDICATIONS_CONFIG = {
  mode: 'api',
  public: true,
  endpoint: 'https://qpoimchzysxsaskjrwba.supabase.co/functions/v1/dedications'
};

// The collection key is entered at runtime, never committed in this file.
