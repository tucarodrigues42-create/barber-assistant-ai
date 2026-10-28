import { createHmac, timingSafeEqual } from 'node:crypto';
export function equal(a: string, b: string) { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); }
export function signature(body: string, header: string, secret: string) { return !!secret && equal(header, `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`); }
export async function readBody(request: Request, max = 12000) {
  if (!request.body) throw new Error('INVALID');
  const reader = request.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > max) { await reader.cancel(); throw new Error('INVALID'); } chunks.push(value); }
  return Buffer.concat(chunks).toString('utf8');
}
export function failure(error: unknown) {
  const code = error instanceof Error ? error.message : '';
  const status = code === 'RATE' ? 429 : code === 'BUSY' ? 409 : code === 'INVALID' || error instanceof SyntaxError ? 400 : 503;
  return Response.json({ erro: status === 400 ? 'Mensagem inválida.' : status === 429 ? 'Aguarde um minuto.' : 'Atendimento temporariamente indisponível. Tente novamente em instantes.' }, { status, headers: { 'Cache-Control': 'no-store' } });
}
