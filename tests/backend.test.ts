import test from 'node:test';
import assert from 'node:assert/strict';
import { respond } from '../lib/backend.ts';
test('persistent FAQ, deduplication, AI failure and human ownership', async () => {
  const original = globalThis.fetch;
  const db = new Map<string, string>(); let aiCalls = 0;
  process.env.UPSTASH_REDIS_REST_URL = 'https://redis.test';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'test';
  process.env.AI_API_KEY = 'test'; process.env.AI_MODEL = 'test';
  globalThis.fetch = async (input, options) => {
    if (String(input).includes('api.openai.com')) { aiCalls++; return new Response('', { status: 503 }); }
    const command = JSON.parse(String(options?.body));
    let result: unknown = null;
    const [op, key, value] = command;
    if (op === 'GET') result = db.get(key) || null;
    if (op === 'SET') { if (!command.includes('NX') || !db.has(key)) { db.set(key, value); result = 'OK'; } }
    if (op === 'EVAL') {
      const script = command[1];
      if (script.includes('INCR')) { const k = command[3]; result = Number(db.get(k) || 0) + 1; db.set(k, String(result)); }
      else if (script.includes("'DEL'")) { if (db.get(command[3]) === command[4]) db.delete(command[3]); result = 1; }
      else { const [, , , memory, ticket, receipt, raw, human, hasReceipt, reply] = command; db.set(memory, raw); if (human === '1') db.set(ticket, raw); if (hasReceipt === '1') db.set(receipt, reply); result = 1; }
    }
    return Response.json({ result });
  };
  try {
    const faq = await respond('adapter:test', 'Qual o preço?', 'msg1');
    assert.equal(faq.modo, 'faq'); assert.equal(aiCalls, 0);
    assert.deepEqual(await respond('adapter:test', 'Qual o preço?', 'msg1'), faq);
    assert.equal(JSON.parse(db.get('conversation:adapter:test')!).history.length, 2);
    assert.equal((await respond('adapter:test', 'Qual corte combina comigo?', 'msg2')).modo, 'human');
    assert.ok(db.has('handoff:adapter:test')); assert.equal(aiCalls, 1);
    await respond('adapter:test', 'E agora?', 'msg3'); assert.equal(aiCalls, 1);
    assert.ok(!db.has('lock:adapter:test'));
  } finally { globalThis.fetch = original; }
});
