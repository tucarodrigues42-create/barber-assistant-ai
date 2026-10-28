import test from 'node:test';
import assert from 'node:assert/strict';
import { append, classify, fresh, resume, SESSION_MS } from '../lib/core.ts';
import { signature, readBody } from '../lib/http.ts';
import { createHmac } from 'node:crypto';
test('FAQ uses only configured facts, including combined questions', () => {
  assert.match(classify('Qual o preço?', {}).reply!, /ainda não/);
  assert.equal(classify('Preço e endereço?', { prices: 'Tabela aprovada', address: 'Rua confirmada' }).reply, 'Tabela aprovada\n\nRua confirmada');
  assert.match(classify('Quero agendar', {}).reply!, /Nenhum horário/);
  assert.equal(classify('Quero atendente, preço?', {}).human, true);
  assert.equal(classify('Como escolher meu corte?', {}).intent, 'complex');
});
test('30 minutes expires history and budget, preserves intent and human ownership', () => {
  const m = { ...fresh(), lastActivity: 100, intent: 'booking', human: true, aiCalls: 6, history: [{ role: 'user' as const, content: 'oi' }] };
  assert.equal(resume(m, 100 + SESSION_MS - 1).history.length, 1);
  const expired = resume(m, 100 + SESSION_MS);
  assert.deepEqual(expired.history, []); assert.equal(expired.aiCalls, 0);
  assert.equal(expired.intent, 'booking'); assert.equal(expired.human, true);
});
test('history is bounded in characters and turns', () => {
  const m = fresh(); for (let i = 0; i < 30; i++) append(m, 'x'.repeat(3000), 'y'.repeat(3000));
  assert.ok(m.history.length <= 8); assert.ok(JSON.stringify(m.history).length <= 6000);
});
test('signature rejects altered body and missing key', () => {
  const secret = 'test-secret'; const mac = 'sha256=' + createHmac('sha256', secret).update('body').digest('hex');
  assert.ok(signature('body', mac, secret)); assert.ok(!signature('tampered', mac, secret)); assert.ok(!signature('body', mac, ''));
});
test('stream body limit does not trust content-length', async () => {
  const req = new Request('https://example.test', { method: 'POST', body: 'x'.repeat(100) });
  await assert.rejects(readBody(req, 10), /INVALID/);
});
