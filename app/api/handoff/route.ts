import { equal, failure, readBody } from '../../../lib/http.ts';
import { locked, redis } from '../../../lib/backend.ts';
import type { Memory } from '../../../lib/core.ts';

function authorized(request: Request) {
  const token = process.env.HANDOFF_ADMIN_TOKEN;
  return !!token && token.length >= 32 && equal(request.headers.get('authorization') || '', `Bearer ${token}`);
}
export async function GET(request: Request) {
  if (!authorized(request)) return Response.json({ erro: 'Não autorizado.' }, { status: 401 });
  try {
    const cursor = new URL(request.url).searchParams.get('cursor') || '0';
    if (!/^\d{1,20}$/.test(cursor)) throw new Error('INVALID');
    const [nextCursor, keys] = await redis<[string, string[]]>('SCAN', cursor, 'MATCH', 'handoff:*', 'COUNT', 50);
    const tickets = await Promise.all(keys.map(async key => ({ id: key.slice(8), memory: await redis('GET', key) })));
    return Response.json({ cursor: nextCursor, tickets }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  if (!authorized(request)) return Response.json({ erro: 'Não autorizado.' }, { status: 401 });
  try {
    const data = JSON.parse(await readBody(request));
    if (typeof data.id !== 'string' || !/^(web:[a-f0-9-]{36}|adapter:[a-f0-9]{64})$/.test(data.id)) throw new Error('INVALID');
    await locked(data.id, async () => {
      const raw = await redis<string | null>('GET', `conversation:${data.id}`);
      if (raw) {
        const memory: Memory = JSON.parse(raw); memory.human = false; memory.history = []; memory.aiCalls = 0;
        await redis('EVAL', "redis.call('SET',KEYS[1],ARGV[1],'EX',604800); redis.call('DEL',KEYS[2]); return 1", 2, `conversation:${data.id}`, `handoff:${data.id}`, JSON.stringify(memory));
      }
    });
    return Response.json({ ok: true });
  } catch (error) { return failure(error); }
}

