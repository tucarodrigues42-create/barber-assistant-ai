import test from 'node:test';
import assert from 'node:assert/strict';
import { answer } from '../lib/groq.ts';
import { fresh } from '../lib/core.ts';

test('Groq request and safe response, quota and failure handling', async () => {
  const originalFetch = globalThis.fetch, originalKey = process.env.GROQ_API_KEY, originalModel = process.env.GROQ_MODEL;
  process.env.GROQ_API_KEY = 'test-only'; delete process.env.GROQ_MODEL;
  let status = 200, content = 'Um corte com textura pode combinar com seu estilo.', finish = 'stop', calls = 0;
  globalThis.fetch = async (url, options) => {
    calls++;
    assert.equal(url, 'https://api.groq.com/openai/v1/chat/completions');
    const payload = JSON.parse(String(options?.body));
    assert.equal(payload.model, 'openai/gpt-oss-20b');
    assert.equal(payload.max_completion_tokens, 768);
    assert.equal(payload.include_reasoning, false);
    assert.equal(payload.reasoning_effort, 'low');
    assert.ok(!('tools' in payload));
    return Response.json({ choices: [{ finish_reason: finish, message: { content, reasoning: 'never return this' } }] }, { status });
  };
  try {
    assert.equal(await answer(fresh(), 'Quero ideias de corte'), content);
    status = 429;
    await assert.rejects(answer(fresh(), 'Outra ideia'), /AI_QUOTA/);
    assert.equal(calls, 2); // No automatic retries or paid fallback.
    status = 200; content = 'O corte custa R$ 50.';
    await assert.rejects(answer(fresh(), 'Outra ideia'), /AI_UNSAFE/);
    content = ''; await assert.rejects(answer(fresh(), 'Outra ideia'), /AI/);
    content = 'Resposta parcial'; finish = 'length'; await assert.rejects(answer(fresh(), 'Outra ideia'), /AI/);
    process.env.GROQ_MODEL = 'unverified'; const before = calls;
    await assert.rejects(answer(fresh(), 'Outra ideia'), /AI_CONFIG/); assert.equal(calls, before);
    delete process.env.GROQ_API_KEY;
    await assert.rejects(answer(fresh(), 'Outra ideia'), /AI_CONFIG/);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.GROQ_API_KEY; else process.env.GROQ_API_KEY = originalKey;
    if (originalModel === undefined) delete process.env.GROQ_MODEL; else process.env.GROQ_MODEL = originalModel;
  }
});
