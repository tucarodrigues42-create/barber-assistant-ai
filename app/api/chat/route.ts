import { NextRequest, NextResponse } from 'next/server';
import { createHmac, randomUUID } from 'node:crypto';
import { equal, failure, readBody } from '../../../lib/http.ts';
import { limited, respond } from '../../../lib/backend.ts';

export async function POST(request: NextRequest) {
  try {
    if (request.headers.get('origin') !== request.nextUrl.origin) return NextResponse.json({ erro: 'Origem inválida.' }, { status: 403 });
    const secret = process.env.SESSION_SECRET;
    if (!secret || secret.length < 32) throw new Error('CONFIG');
    const ip = request.headers.get('x-vercel-forwarded-for') || 'local';
    const ipHash = createHmac('sha256', secret).update(ip).digest('hex');
    if (await limited(`ip:${ipHash}`, 30, 60)) throw new Error('RATE');
    const data = JSON.parse(await readBody(request));
    if (typeof data.mensagem !== 'string' || !data.mensagem.trim() || data.mensagem.length > 1200) throw new Error('INVALID');
    const sign = (id: string) => createHmac('sha256', secret).update(id).digest('hex');
    const [candidate = '', mac = ''] = (request.cookies.get('barber_session')?.value || '').split('.');
    const id = /^[a-f0-9-]{36}$/.test(candidate) && equal(mac, sign(candidate)) ? candidate : randomUUID();
    const result = await respond(`web:${id}`, data.mensagem.trim());
    const response = NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
    response.cookies.set('barber_session', `${id}.${sign(id)}`, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/', maxAge: 604800 });
    return response;
  } catch (error) { return failure(error); }
}

