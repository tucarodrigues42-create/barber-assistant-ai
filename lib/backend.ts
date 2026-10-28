import { randomUUID } from 'node:crypto';
import { append, classify, fresh, resume, type Memory } from './core.ts';
import { answer } from './groq.ts';
export async function redis<T = unknown>(...command: (string | number)[]): Promise<T> {
  const url = process.env.UPSTASH_REDIS_REST_URL, token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url?.startsWith('https://') || !token) throw new Error('STORAGE');
  const response = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(command), signal: AbortSignal.timeout(4000), cache: 'no-store' });
  if (!response.ok) throw new Error('STORAGE');
  const data = await response.json(); if (data.error) throw new Error('STORAGE');
  return data.result;
}
export async function limited(key: string, max: number, seconds: number) {
  return await redis<number>('EVAL', "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end; return n", 1, `rate:${key}`, seconds) > max;
}
export async function locked<T>(id: string, action: () => Promise<T>) {
  const token = randomUUID();
  if (await redis('SET', `lock:${id}`, token, 'NX', 'EX', 45) !== 'OK') throw new Error('BUSY');
  try { return await action(); } finally {
    await redis('EVAL', "if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) end return 0", 1, `lock:${id}`, token);
  }
}
async function ai(memory: Memory, text: string) {
  return answer(memory, text);
}
export async function respond(id: string, text: string, messageId?: string) {
  return locked(id, async () => {
    const receipt = messageId ? `receipt:${id}:${messageId}` : '';
    if (receipt) { const cached = await redis<string | null>('GET', receipt); if (cached) return JSON.parse(cached) as { resposta: string; modo: string }; }
    if (await limited(id, 20, 60)) throw new Error('RATE');
    const raw = await redis<string | null>('GET', `conversation:${id}`);
    const memory = resume(raw ? JSON.parse(raw) : fresh(), Date.now());
    const decision = classify(text, { prices: process.env.BARBER_PRICES, hours: process.env.BARBER_HOURS, address: process.env.BARBER_ADDRESS, services: process.env.BARBER_SERVICES, booking: process.env.BARBER_BOOKING });
    let reply: string, mode = 'faq';
    if (memory.human) { reply = 'Seu atendimento está na fila da equipe. Aguarde o retorno humano por este canal.'; mode = 'human'; }
    else if (decision.human) { memory.human = true; reply = decision.reply!; mode = 'human'; }
    else if (decision.reply) reply = decision.reply;
    else {
      mode = 'ai';
      try {
        if (memory.aiCalls >= 6 || await limited('global-ai', 200, 86400)) throw new Error('AI_LIMIT');
        memory.aiCalls++; reply = await ai(memory, text);
      } catch { memory.human = true; mode = 'human'; reply = 'Não consegui responder com segurança. Seu pedido foi registrado para a equipe humana. Aguarde o retorno por este canal.'; }
    }
    if (!['complex', 'greeting'].includes(decision.intent)) memory.intent = decision.intent;
    append(memory, text, reply);
    // Atomic persistence of memory, handoff ticket and retry receipt.
    const result = { resposta: reply, modo: mode };
    await redis('EVAL', "redis.call('SET',KEYS[1],ARGV[1],'EX',604800); if ARGV[2]=='1' then redis.call('SET',KEYS[2],ARGV[1],'EX',604800) end; if ARGV[3]=='1' then redis.call('SET',KEYS[3],ARGV[4],'EX',86400) end; return 1", 3, `conversation:${id}`, `handoff:${id}`, receipt || 'unused', JSON.stringify(memory), memory.human ? '1' : '0', receipt ? '1' : '0', JSON.stringify(result));
    return result;
  });
}
