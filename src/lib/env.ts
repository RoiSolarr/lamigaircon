// Read required environment variables with a clear error when one is missing.
function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing environment variable ${name}. Copy .env.example to .env.local and fill it in.`);
  }
  return value;
}

// NEXT_PUBLIC_ values must be read with the full literal name so Next.js can inline them.
export const supabaseUrl = () => required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);
export const supabaseAnonKey = () => required("NEXT_PUBLIC_SUPABASE_ANON_KEY", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

export const n8n = {
  chatUrl: () => required("N8N_CHAT_WEBHOOK_URL", process.env.N8N_CHAT_WEBHOOK_URL),
  notifyUrl: () => process.env.N8N_NOTIFY_WEBHOOK_URL || null,
  secret: () => required("N8N_WEBHOOK_SECRET", process.env.N8N_WEBHOOK_SECRET),
};
