# Plano de implementação — Acolher

Atualizado em 06/11/2026.

## Estado das fases

| Fase | Situação |
|---|---|
| 1. Fundação (arquitetura, design system, Supabase, migrações, auth) | Implementada |
| 2. Portal público (início, navegação, configurações sensoriais, chat) | Implementada |
| 3. IA funcional (provedores, prompt, mensagens rápidas, segurança, indisponibilidade) | Implementada; adaptador OpenAI testado com a API simulada; **chave OpenAI válida, mas a conta está sem créditos — nenhuma resposta real ainda** |
| 4. Atendimento profissional (painel, papéis, fila, Realtime, transferência, autocadastro de psicólogos) | Implementada; Realtime, transferência e autocadastro **verificados contra o Supabase real**; telas logadas do painel ainda não exercitadas com equipe real |
| 5. Autorregulação (sons, upload, 5 jogos) | Implementada |
| 6. Finalização (privacidade, métricas, testes, docs) | Parcial (ver pendências) |

## Verificações executadas

- `npm run typecheck`, `npx eslint src`, `npm run build`: sem erros.
- `npm test`: 57 testes (classificador de risco, prompt, contexto, provedor simulado, estado do chat,
  protocolo de streaming, validação, jogos, componentes, rota de mensagens com IA indisponível/humano ativo/descartes/CSRF).
- **Supabase real (projeto NeuroApp)**: migrações e seed aplicados; `scripts/smoke-supabase.mjs` passou 17/17
  (canais Realtime privados, intruso recusado, transferência, resposta atrasada da IA descartada, fila sem conteúdo);
  E2E do chat com visitante anônimo passou 6/6 (desktop e celular). Dados de teste removidos ao final.
- Autocadastro de psicólogo (`/dashboard/cadastro`): conta nasce pendente, nunca administrativa;
  smoke test real 21/21; testes de banco do gatilho; testes do formulário.
- `npm run test:db`: 26 testes em PostgreSQL 17 (PGlite) com stubs de auth/realtime/storage: usuário não lê
  conversa de terceiros; admin sem papel clínico não lê conteúdo; psicólogo pendente bloqueado; duplo
  "assumir" → `already_claimed`; IA atrasada descartada após transferência; idempotência; escalonamento
  por risco; canais Realtime privados; exclusão real vs. retenção; exportação; funções internas não expostas.
  Esses testes encontraram e corrigiram um bug real de ordem de transição. A aplicação no Supabase real revelou
  outro: `close_conversation` não bloqueava quem não era dono quando a conversa não tinha profissional
  (comparação com NULL) — corrigido, com teste de regressão.
- `npm test` (unitários + componentes + banco): 93 testes.
- `npm run test:e2e` com `E2E_SUPABASE=1`: 40/40 (portal, entrada de profissionais e chat; desktop e celular).

## Decisões arquiteturais

- **Cache Components desativado**: rotas dependem de sessão e dados sensíveis; renderização dinâmica previsível.
- **Máquina de estados no banco** (`ai_active → waiting_human → human_active → closed → archived`;
  `human_requested` fundido em `waiting_human`). Transições com `SELECT … FOR UPDATE` e `state_version`.
- **IA nunca grava depois da transferência**: `commit_ai_message` exige versão inalterada, estado
  `ai_active|waiting_human` e que a mensagem respondida seja a mais recente; o cliente também aborta o stream.
- **Mensagem da pessoa gravada antes da IA**, idempotente por `client_message_id` → sem perda silenciosa.
- **Risco classificado no servidor** (regras versionadas, apenas IDs registrados, nunca conteúdo);
  `post_user_message`/`commit_ai_message` só para `service_role`.
- **Realtime Broadcast via gatilhos** em canais privados com RLS em `realtime.messages`; a fila não carrega conteúdo.
- **Separação gestão × clínica**: admin vê metadados; conteúdo apenas para psicólogo validado em conversa elegível; leitura auditada.
- **Sons demonstrativos gerados no navegador** (Web Audio) → biblioteca funcional sem arquivos nem links quebrados.
- **Limites de uso no banco** (funciona com várias instâncias serverless).

## Pendências (não concluídas)

- Ainda não exercitado no Supabase real: upload de áudio (Storage), e-mails (confirmação de cadastro,
  convite, recuperação), MFA, telas logadas do painel com uma equipe real e exclusão de conta pela interface.
- Respostas reais da IA: adicionar créditos na conta OpenAI e mudar `AI_PROVIDER=openai`.
- Ainda não há administrador no projeto: rodar `scripts/create-superadmin.mjs`.
- As migrações foram aplicadas pela integração MCP (histórico com nomes próprios). Antes de usar
  `supabase db push`, alinhar o histórico com `supabase migration repair`.
- Testar provedores Anthropic/OpenAI com credenciais válidas (critério de aceite ainda não cumprido).
- Teste de concorrência verdadeiramente simultânea do "assumir" (PGlite é conexão única; validado sequencialmente).
- Revisão clínica: regras de risco (`src/lib/safety/risk-classifier.ts`), textos de segurança
  (`src/lib/safety/emergency.ts`), prompt de sistema. Documentar o protocolo de crise em `docs/`
  (referenciado nos comentários, ainda não escrito) e o changelog do prompt.
- Revisão jurídica: privacidade, termos, bases legais LGPD, prazos de retenção, política para crianças e adolescentes.
- MFA exigido também no banco (checar `aal2` nas políticas) — hoje exigido só no painel via `STAFF_REQUIRE_MFA`.
- CAPTCHA no login anônimo e rate limit específico para "tentar de novo" da IA.
- Imagem de capa para áudios (hoje: cor + ícone); edição de mensagens rápidas no painel (tabela e RLS prontas).
- Auditoria de acessibilidade com leitores de tela reais e axe; métricas por tipo de visitante mais detalhadas.
- Nonce na CSP (hoje `unsafe-inline` para scripts do Next).

## Riscos

- Classificação textual tem falsos negativos/positivos; não é diagnóstico.
- Dependência de provedores externos de IA (custos, retenção, transferência internacional).
- Disponibilidade humana real precisa de escala de plantão; o sistema informa honestamente quando não há ninguém.
