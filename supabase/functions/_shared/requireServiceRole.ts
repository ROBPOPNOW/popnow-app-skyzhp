// Shared caller check for cron-invoked edge functions (sweep-orphaned-uploads,
// reconcile-pending-uploads). The cron sends the project's service-role key as a
// Bearer token. verify_jwt:true alone only proves the token is a valid JWT — any
// logged-in user's JWT passes it — so this additionally requires the token to BE
// the service-role key. Fails closed if the key isn't configured.

const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

// Manual constant-time compare — same rationale as revenuecat-webhook / bunny-webhook-finalize.
function timingSafeEqual(a: string, b: string): boolean {
  const aBytes = new TextEncoder().encode(a);
  const bBytes = new TextEncoder().encode(b);
  if (aBytes.length !== bBytes.length) return false;
  let diff = 0;
  for (let i = 0; i < aBytes.length; i++) diff |= aBytes[i] ^ bBytes[i];
  return diff === 0;
}

export function isServiceRoleRequest(req: Request): boolean {
  if (!SERVICE_ROLE_KEY) return false;
  return timingSafeEqual(req.headers.get('Authorization') ?? '', `Bearer ${SERVICE_ROLE_KEY}`);
}

export function unauthorizedResponse(): Response {
  return new Response(JSON.stringify({ error: 'Unauthorized' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });
}
