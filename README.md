# Acolher — plataforma web de acolhimento emocional

Espaço digital calmo e acessível para pessoas em sofrimento emocional, autistas e neurodivergentes:
chat com assistente virtual (IA), transferência para profissionais humanos em tempo real, sons
relaxantes e jogos tranquilos. Português do Brasil, mobile-first, WCAG 2.2 AA como meta.

> **Não é serviço de emergência.** Protocolos clínicos, textos de segurança e documentos legais são
> rascunhos e precisam de revisão profissional e jurídica antes de qualquer uso com pessoas reais.

## Arquitetura

```
Next.js 16 (App Router, TypeScript strict, Tailwind 4, Radix)
 ├─ Portal (/, /conversar, /ajuda, /sons, /jogos, /configuracoes, /conta)
 ├─ Painel (/dashboard: visão geral, atendimentos, equipe, áudios, configurações, auditoria)
 ├─ Rotas de servidor (/api/conversations/*, /api/me/*, /api/dashboard/*)
 │    └─ IA independente de provedor (Anthropic | OpenAI | simulado), streaming NDJSON
 └─ Supabase
      ├─ Postgres + RLS em todas as tabelas + funções SECURITY DEFINER (máquina de estados)
      ├─ Auth (visitante anônimo, contas, equipe com MFA TOTP)
      ├─ Realtime Broadcast em canais privados (conversation:<id>, staff:queue)
      └─ Storage (bucket privado audio-tracks, URLs assinadas)
```

Pastas: `src/app` (rotas), `src/features/*` (chat, dashboard, sons, jogos, conta), `src/components/ui`
(design system), `src/lib` (ai, safety, supabase, auth, validation, preferences), `supabase/migrations`,
`tests/{unit,db,e2e}`. Decisões e pendências: [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md).

## Requisitos

Node.js ≥ 20.9 (testado com 24), npm, Docker (apenas para Supabase local) ou um projeto Supabase na nuvem.

## Configuração local

```bash
npm install
cp .env.example .env.local
npx supabase start          # requer Docker; aplica migrações e seed
npx supabase status         # copie URL e chaves para .env.local
npm run dev
```

Sem Supabase configurado, o portal funciona em modo limitado: início, ajuda, sons demonstrativos e
jogos funcionam; chat e painel mostram aviso claro de indisponibilidade.

### Variáveis de ambiente

Veja [.env.example](.env.example). `SUPABASE_SECRET_KEY` e chaves de IA ficam **somente no servidor**.

## Supabase

- Migrações: `supabase/migrations` (aplicadas por `supabase start` / `supabase db push`).
- Na nuvem: `npx supabase link --project-ref <ref>` e `npx supabase db push`; execute `supabase/seed.sql`.
- Habilite **login anônimo** (Authentication → Sign In / Providers → "Allow anonymous sign-ins", e salve)
  e **MFA TOTP**. Localmente já vêm ativos em `supabase/config.toml`.
- Em **Authentication → URL Configuration**: **Site URL** = endereço do app; em **Redirect URLs**
  adicione `http://localhost:3000/**` (desenvolvimento) e `https://<seu-endereco>/**` (produção).
  Os links de e-mail (recuperação de senha, conta de visitante com e-mail) chegam em `/auth/confirm`.
  Os modelos de e-mail padrão do Supabase funcionam sem alteração.
- Retenção diária (opcional, pg_cron): `supabase/optional/schedule_retention.sql`.
- Tipos gerados: `npm run db:types`.

### Primeiro superadministrador

```bash
node --env-file=.env.local scripts/create-superadmin.mjs admin@exemplo.org "Nome Completo" "Nome"
```

Se o e-mail ainda não tem conta, o script pede uma senha (não aparece na tela) e cria a conta já
confirmada. Se a conta já existe, ela é promovida. Só funciona enquanto não existir superadministrador.

### Como os psicólogos entram

Não existe autocadastro nem registro profissional (CRP): **quem cria as contas é o administrador.**

1. O administrador (o primeiro é criado pelo script acima) entra em `/dashboard/entrar` e abre
   **Equipe → Cadastrar psicólogo(a)**.
2. Informa só **e-mail e senha** (e, se quiser, o nome que aparece no chat; vazio = começo do e-mail,
   ex.: `ana.souza@gmail.com` → "Ana Souza").
3. A conta nasce **confirmada e ativa** (sem e-mail de convite). Passe o e-mail e a senha para o
   psicólogo: ele entra em `/dashboard/entrar` e já tem acesso aos atendimentos.
4. Na central: **Ficar disponível** → fila em tempo real → **Assumir atendimento** (a IA para na hora)
   → conversa → **Finalizar** ou **Devolver para a IA**. A aba do navegador mostra quantas pessoas aguardam.

Para tirar o acesso de alguém, use **Desativar acesso** em Equipe: os atendimentos ativos dessa pessoa
voltam para a fila. Superadministradores também ajustam papéis (psicólogo, administrador).

## IA

Escolha o provedor em `AI_PROVIDER` (as variáveis são validadas em `src/lib/ai/config.ts`):

| Provedor | Variáveis | Observações |
|---|---|---|
| `gemini` | `GEMINI_API_KEY`, `GEMINI_MODEL` (padrão `gemini-flash-latest`), `GEMINI_THINKING_LEVEL` (`low`) | SDK oficial `@google/genai`; chave em aistudio.google.com/apikey. O `gemini-2.5-flash` não é mais oferecido a contas novas. |
| `openai` | `OPENAI_API_KEY`, `OPENAI_MODEL` (ex.: `gpt-5.5`), `OPENAI_REASONING_EFFORT` | Cobrada à parte do ChatGPT: precisa de créditos em platform.openai.com/settings/organization/billing. |
| `anthropic` | `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` (padrão `claude-opus-5-5`) | Fallback de recusa no servidor. |
| `mock` | — | Simulador sem IA, identificado na interface ("Modo demonstração"). |

**Filtros de segurança do Gemini** (`src/lib/ai/providers/gemini.ts`): os padrões do Google podem
bloquear desabafos legítimos ("quero morrer", relatos de violência sofrida). Por isso conteúdo perigoso,
assédio e discurso de ódio só são bloqueados com probabilidade **alta**; conteúdo sexual explícito segue
bloqueado a partir de risco médio. O acolhimento, a orientação e o encaminhamento humano ficam com o
prompt de sistema (`src/lib/ai/prompts/system-prompt.ts`) e o classificador de risco do servidor. Se o
Google ainda assim bloquear, a pessoa recebe a resposta de segurança com CVV (188) e SAMU (192). Quando
o servidor do Google está sobrecarregado (503), o app tenta de novo uma vez com o modelo reserva
`GEMINI_FALLBACK_MODEL` (padrão `gemini-flash-lite-latest`).

Em qualquer provedor, se a IA falhar, a mensagem da pessoa fica salva e o chat oferece tentar de novo,
pedir uma pessoa e os contatos de ajuda. Limites de uso configuráveis no painel.

## Comandos

| Comando | O que faz |
|---|---|
| `npm run dev` / `build` / `start` | Desenvolvimento / build / produção |
| `npm run typecheck` | `next typegen` + `tsc --noEmit` |
| `npm run lint` / `format` | ESLint / Prettier |
| `npm test` | Testes unitários e de componentes (Vitest + RTL) |
| `npm run test:db` | Migrações + RLS + máquina de estados em PostgreSQL (PGlite, sem Docker) |
| `npm run test:e2e` | Playwright (desktop + celular). `E2E_SUPABASE=1` inclui o chat completo |
| `node --env-file=.env.local scripts/smoke-supabase.mjs` | Testa Realtime e transferência no projeto real (cria e apaga usuários temporários) |
| `npm run check` | Tudo acima + build |

Antes de `test:e2e`, rode `npm run build` e `npx playwright install chromium`.

## Implantação

Qualquer host Node com suporte a Next.js 16. Passo a passo para a Vercel:

1. Em [vercel.com/new](https://vercel.com/new), entre com o GitHub e importe o repositório
   `NeuroAppic/NeuroApp`. A Vercel detecta Next.js sozinha (não altere build nem pasta).
2. Antes de clicar em **Deploy**, abra **Environment Variables** e cadastre:

   | Variável | Valor |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | URL do projeto Supabase |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | chave publicável (`sb_publishable_...`) |
   | `SUPABASE_SECRET_KEY` | chave secreta (`sb_secret_...`) — nunca com prefixo `NEXT_PUBLIC_` |
   | `AI_PROVIDER` | `gemini`, `openai`, `anthropic` ou `mock` |
   | `GEMINI_API_KEY` / `GEMINI_MODEL` / `GEMINI_THINKING_LEVEL` | só se `AI_PROVIDER=gemini` (ex.: `gemini-flash-latest`, `low`) |
   | `OPENAI_API_KEY` / `OPENAI_MODEL` / `OPENAI_REASONING_EFFORT` | só se `AI_PROVIDER=openai` (ex.: `gpt-5.5`, `low`) |
   | `ANTHROPIC_API_KEY` | só se `AI_PROVIDER=anthropic` |
   | `STAFF_REQUIRE_MFA` | `true` em produção |

3. Depois do primeiro deploy, copie o endereço (ex.: `https://neuro-app.vercel.app`), crie
   `NEXT_PUBLIC_SITE_URL` com ele e faça **Redeploy** (variáveis `NEXT_PUBLIC_*` entram no build).
4. No Supabase, em **Authentication → URL Configuration**, defina **Site URL** com esse endereço e
   adicione `https://<seu-endereco>/**` em **Redirect URLs**.
5. A cada `git push` na branch `main`, a Vercel publica a nova versão automaticamente.

Observações: o plano gratuito (Hobby) da Vercel é para uso pessoal e não comercial. A região padrão
(`iad1`, EUA-Leste) fica perto do projeto Supabase (`us-east-1`). Agende também a retenção
(`supabase/optional/schedule_retention.sql`) e considere ativar CAPTCHA no login anônimo do Supabase
para evitar abuso.

## Cuidados de segurança

- Nunca exponha `SUPABASE_SECRET_KEY` nem chaves de IA (não use prefixo `NEXT_PUBLIC_`).
- RLS em todas as tabelas; escrita de mensagens da pessoa/IA apenas via servidor; administradores não
  leem conversas; leituras clínicas auditadas.
- CSRF: rotas mutáveis exigem mesma origem + JSON. CSP e cabeçalhos de segurança em `next.config.ts`.
- Não use dados reais em testes. Revise contratos com o provedor de IA (retenção, transferência internacional).
