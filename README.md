# Barber Assistant AI

Atendimento híbrido para Vercel. O chat anterior dependia do Ollama local; agora FAQ não usa IA e dúvidas abertas usam Groq por HTTPS, quando configurada. Nenhum número de WhatsApp foi incluído ou alterado.

## Etapas implementadas

1. FAQ determinístico com fatos em variáveis `BARBER_*`. Dados vazios geram resposta honesta; não existe tabela fictícia. Perguntas combinadas podem responder mais de um tópico.
2. Memória no Upstash Redis REST, compartilhada entre instâncias da Vercel. Após **30 minutos sem mensagem**, a próxima mensagem limpa histórico e orçamento da sessão, preservando intenção e atendimento humano. Não há chamada de IA durante a espera. Retenção deslizante de **7 dias**; depois a memória é apagada pelo TTL. Não há cron necessário.
3. Histórico até 8 mensagens e 6.000 caracteres serializados; entrada até 1.200 caracteres; contexto para IA até 6 mensagens anteriores; geração até 768 tokens (incluindo raciocínio), resposta exibida até 1.200 caracteres; 6 chamadas de IA por sessão e 200 tentativas globais por janela de 24h. Entrada é limitada por caracteres, não por tokenização exata. O adaptador suporta `openai/gpt-oss-20b`, com raciocínio reduzido e oculto.
4. Falha, limite, resposta vazia ou suspeita da IA registra pedido humano, pausa o bot e mantém histórico. Ticket e memória persistem atomicamente. Não é uma notificação enviada a um funcionário: a equipe precisa consultar a fila. Nenhuma reserva é criada.
5. Cookie assinado HttpOnly/SameSite; validação de origem; limite por IP e conversa; bloqueio concorrente no Redis; corpo lido com limite; erros sem chaves ou texto do cliente em logs. Sem Redis, retorna 503 em vez de usar memória volátil.

## Configurar na Vercel

No projeto existente, abra **Storage → Marketplace → Upstash Redis** e conecte um banco com persistência e política sem expulsão de chaves (no-eviction). Verifique plano/custos antes de contratar. Em **Settings → Environment Variables**, configure os nomes de `.env.example`, para Preview e Production conforme necessário. Nunca publique valores no Git nem envie chaves pelo chat.

- `UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN`: conexão fornecida pelo Upstash.
- `SESSION_SECRET`, `WEBHOOK_SECRET`, `HANDOFF_ADMIN_TOKEN`: três segredos independentes, aleatórios, com pelo menos 32 caracteres.
- `GROQ_API_KEY`: chave criada em https://console.groq.com/keys. Mantenha a conta no plano Free, sem cadastrar pagamento nem fazer upgrade para Developer. `GROQ_MODEL`: `openai/gpt-oss-20b` (também é o padrão quando vazio). As variáveis antigas `AI_API_KEY`/`AI_MODEL` não são usadas. O código não consulta o plano da conta: a gratuidade depende de manter o Free no provedor.
- `BARBER_PRICES`, `BARBER_HOURS`, `BARBER_ADDRESS`, `BARBER_SERVICES`, `BARBER_BOOKING`: somente informações aprovadas. São textos curtos (600 caracteres por campo). Não coloque disponibilidade dinâmica em texto estático.

O Ollama em `localhost` roda no computador do usuário, enquanto a função roda nos servidores da Vercel. Não exponha o Ollama por túnel público. Esta versão usa endpoint público fixo da Groq; não há fallback para a API paga da OpenAI. O modelo openai/gpt-oss-20b é servido pela Groq e usa chave da Groq. Erros 429 ou indisponibilidade registram pedido humano sem repetição automática.

## WhatsApp: contrato para integração futura

Não existia integração com WhatsApp no repositório. `/api/webhook` é um **adaptador normalizado**, não um endpoint diretamente compatível com Meta/Twilio. É preciso escolher o provedor e implementar validação do payload/assinatura dele, extração de identificadores e envio da resposta pelo próprio provedor. O número real permanece intacto.

POST JSON: `{ "conversationId": "identificador-do-canal", "messageId": "id-unico", "text": "mensagem" }`.

Headers: `x-webhook-timestamp` (Unix em milissegundos); `x-webhook-signature` = `sha256=` + HMAC-SHA256 de `timestamp + '.' + corpoOriginal`, com `WEBHOOK_SECRET`. Janela aceita: 5 minutos. IDs de mensagem repetidos retornam a mesma resposta por 24h, sem nova chamada à IA. O adaptador deve persistir e deduplicar o envio pelo ID e repetir 409/429/503 com backoff e nova assinatura. Respostas 200 não significam entrega ao WhatsApp. Não há processamento em background após retornar HTTP.

## Atendimento humano

`GET /api/handoff` com `Authorization: Bearer <HANDOFF_ADMIN_TOKEN>` consulta tickets; repita com `?cursor=...` até cursor `0`, inclusive quando uma página vier vazia. Contém histórico pessoal: acesso apenas pela equipe. `POST /api/handoff` com o mesmo token e `{ "id": "id-do-ticket" }` encerra o atendimento e libera o bot. A equipe responde pelo canal original antes de encerrar. No chat web ainda não há painel para enviar resposta humana; esta etapa entrega fila e controle por API. IDs do adaptador são pseudonimizados; a integração precisa manter o vínculo com o contato original de forma protegida.

Não exponha o token administrativo no navegador público. Para operação cotidiana, a próxima etapa é um painel com login individual, auditoria e notificações. Não use esta fila como garantia de SLA sem equipe monitorando. Limites por IP usam o header confiável da Vercel; fora dela, configure proxy confiável. Proteção por origem não substitui autenticação contra abuso distribuído; configure WAF e limite de gastos antes de campanhas públicas.

## Testes e deploy incremental

Requer Node 24. `npm ci`, `npm test`, `npm run lint`, `npx next typegen`, `npx tsc --noEmit`, `npm run build`.

Os testes usam Redis/IA simulados, sem mensagens reais. Validam FAQ, sessão, limites de histórico, assinatura, corpo, deduplicação, persistência e fallback. Antes de produção, validar também um Redis de teste: TTL real, Lua, concorrência, reconexão e limite de taxa; validar IA com chave do plano Free da Groq e modelo selecionado. Filtro da saída da IA é defesa adicional, não garantia formal contra toda alucinação: preços e fatos comerciais devem permanecer no FAQ.

Deploy primeiro em branch/Preview do projeto existente. Sem variáveis, a interface abre, mas o atendimento retorna 503. Configure Preview, teste FAQ, retorno após 30min, repetição de webhook e fila humana. Só depois promova para produção. A proteção de acesso atual da Vercel pode bloquear webhooks de provedores: avalie uma rota pública protegida pela assinatura antes de conectar o canal, sem desligar proteção indiscriminadamente.

Rollback: voltar ao deployment anterior no painel da Vercel; não apagar o banco. Alterar o segredo de sessão encerra o acesso às sessões anteriores. Trocar o segredo do webhook também muda os IDs pseudonimizados, exigindo migração do adaptador.

Documentação: [Vercel Storage](https://vercel.com/docs/storage), [Upstash REST](https://upstash.com/docs/redis/features/restapi), [Groq Quickstart](https://console.groq.com/docs/quickstart), [Groq Free e limites](https://console.groq.com/docs/rate-limits), [Groq Billing](https://console.groq.com/docs/billing-faqs).


## Testar IA sem plano pago

1. Criar conta em https://console.groq.com/ e manter o plano Free. Não cadastrar forma de pagamento nem fazer upgrade. As cotas podem mudar; conferir Limits na própria conta.
2. Em API Keys, criar uma chave chamada barber-assistant-preview e copiar diretamente para a Vercel: Settings → Environment Variables → GROQ_API_KEY → Secret → Preview. Nunca enviar a chave pelo chat, screenshot ou Git.
3. Adicionar GROQ_MODEL como Config em Preview, com o valor openai/gpt-oss-20b.
4. Fazer redeploy da branch feat/hybrid-attendance em Preview, incluindo o commit que adiciona Groq. Deploys antigos continuam com o código antigo.
5. Abrir o novo link em uma janela anônima, sem usar a conversa que já está na fila humana. Enviar: “Meu cabelo é ondulado e prefiro um corte fácil de cuidar. Que estilo combina?”. A resposta deve ser uma sugestão curta. Perguntar preços deve continuar usando FAQ. Se a IA falhar ou a cota acabar, a conversa passa para humano.
6. Conferir Usage no painel Groq para confirmar que a chamada chegou. Sem chave configurada, testes locais apenas simulam o serviço. Não há garantia de gratuidade ilimitada ou de disponibilidade contínua. Vercel e Redis também têm cotas próprias.

O limite local de 200 chamadas/dia não garante caber na cota de tokens do provedor, especialmente se outras aplicações compartilham a conta. O fallback trata o esgotamento. Para os testes iniciais, use dados fictícios e consulte as opções de privacidade em https://console.groq.com/docs/your-data antes de enviar informações pessoais de clientes.
