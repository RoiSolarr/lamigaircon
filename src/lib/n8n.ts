import { n8n } from "@/lib/env";

// POST JSON to an n8n webhook with the shared secret header.
// The n8n Webhook nodes use Header Auth with the same header name and value.
export async function callN8n(url: string, body: unknown, timeoutMs: number) {
  return fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-lamig-secret": n8n.secret() },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  });
}
