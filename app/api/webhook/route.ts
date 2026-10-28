import { createHmac } from 'node:crypto';
import { failure, readBody, signature } from '../../../lib/http.ts';
import { respond } from '../../../lib/backend.ts';

// Normalized adapter contract; NOT the Meta/Twilio payload or signature format.
// The WhatsApp integration must validate its provider signature before signing this request.
export async function POST(request: Request) {
  try {
    const secret = process.env.WEBHOOK_SECRET;
    if (!secret || secret.length < 32) throw new Error('CONFIG');
    const raw = await readBody(request);
    const timestamp = request.headers.get('x-webhook-timestamp') || '';
    if (!/^\d{13}$/.test(timestamp) || Math.abs(Date.now() - Number(timestamp)) > 300000 || !signature(`${timestamp}.${raw}`, request.headers.get('x-webhook-signature') || '', secret)) {
      return Response.json({ erro: 'Assinatura inválida.' }, { status: 401 });
    }
    const data = JSON.parse(raw);
    if (!data || typeof data.conversationId !== 'string' || !/^[a-zA-Z0-9_+:-]{1,100}$/.test(data.conversationId) || typeof data.messageId !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(data.messageId) || typeof data.text !== 'string' || !data.text.trim() || data.text.length > 1200) throw new Error('INVALID');
    const id = createHmac('sha256', secret).update(data.conversationId).digest('hex');
    return Response.json(await respond(`adapter:${id}`, data.text.trim(), data.messageId), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return failure(error); }
}

