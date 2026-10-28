export const SESSION_MS = 1800000;
export type Turn = { role: 'user' | 'assistant'; content: string };
export type Memory = { lastActivity: number; intent: string; human: boolean; aiCalls: number; history: Turn[] };
export const fresh = (): Memory => ({ lastActivity: 0, intent: '', human: false, aiCalls: 0, history: [] });
export function resume(memory: Memory, now: number): Memory {
  return { ...memory, lastActivity: now, ...(now - memory.lastActivity >= SESSION_MS ? { history: [], aiCalls: 0 } : {}) };
}
export function classify(text: string, config: Record<string, string | undefined>) {
  const s = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (/\b(humano|atendente|reclamacao|reembolso|cancelar)\b/.test(s)) return { intent: 'human', human: true, reply: 'Seu pedido foi registrado para atendimento humano. Aguarde o retorno da equipe por este canal.' };
  const rules: [RegExp, string, string][] = [
    [/\b(preco|precos|valor|valores|custa|quanto)\b/, 'prices', 'Os preços ainda não foram informados. Escreva atendente para confirmar com a equipe.'],
    [/\b(horario|horarios|abre|fecha|funcionamento)\b/, 'hours', 'O horário de funcionamento ainda não foi informado.'],
    [/\b(endereco|localizacao|onde fica)\b/, 'address', 'O endereço ainda não foi informado.'],
    [/\b(servicos|oferecem|fazem)\b/, 'services', 'A lista de serviços ainda não foi informada.'],
    [/\b(agendar|agendamento|marcar|reserva|disponibilidade|vaga|vagas)\b/, 'booking', 'Posso registrar seu interesse em agendar. Escreva atendente para confirmar serviço, data e disponibilidade com a equipe. Nenhum horário está reservado.'],
  ];
  const matches = rules.filter(([pattern]) => pattern.test(s));
  if (matches.length) return { intent: matches.at(-1)![1], reply: matches.map(([, field, fallback]) => config[field]?.trim().slice(0, 600) || fallback).join('\n\n') };
  if (/^(oi|ola|bom dia|boa tarde|boa noite)[!. ]*$/.test(s)) return { intent: 'greeting', reply: 'Olá! Posso ajudar com preços, serviços, endereço e agendamento. Para falar com a equipe, escreva atendente.' };
  return { intent: 'complex' };
}
export function append(memory: Memory, text: string, reply: string) {
  memory.history = [...memory.history, { role: 'user' as const, content: text.slice(0, 1200) }, { role: 'assistant' as const, content: reply.slice(0, 1200) }].slice(-8);
  while (JSON.stringify(memory.history).length > 6000) memory.history.shift();
}
