import { serverEnv } from '@/lib/config/env';
import { getTelephonyDeps } from '@/lib/telephony/deps';
import { isAuthorizedVapiRequest } from '@/lib/voice/auth';
import { handleVapiWebhook } from '@/lib/voice/webhook';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Server URL for every org's Vapi assistant (set when the receptionist is provisioned).
export async function POST(request: Request) {
  // Reject unauthenticated traffic before any database client is created.
  if (!isAuthorizedVapiRequest(request.headers, serverEnv.vapiWebhookSecret())) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  const rawBody = await request.text();
  try {
    const result = await handleVapiWebhook(request.headers, rawBody, getTelephonyDeps());
    return Response.json(result.body, { status: result.status });
  } catch (err) {
    console.error(JSON.stringify({ level: 'error', message: 'Vapi webhook setup failed', error: String(err) }));
    return Response.json({ error: 'retry' }, { status: 500 });
  }
}
