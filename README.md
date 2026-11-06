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
  Os links de e-mail chegam em `/auth/confirm` (cadastro e nova senha) e `/auth/callback` (convites).
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

**Modo de teste (`STAFF_OPEN_SIGNUP=true`)** — o mais simples: em `/dashboard/cadastro` basta e-mail
e senha. A conta é criada já confirmada (sem e-mail de confirmação) e o psicólogo entra direto na central
de atendimentos, sem CRP nem validação. Use **apenas para testes**: com ele ligado, qualquer cadastro lê
as conversas na fila. Para pessoas reais, desligue (`false`) e use o fluxo abaixo.

**Modo profissional (`STAFF_OPEN_SIGNUP=false`, padrão):**

1. O(a) psicólogo(a) se cadastra em **`/dashboard/cadastro`** (link "Cadastre-se" em `/dashboard/entrar`)
   com nome, nome exibido, CRP, e-mail e senha, e confirma o e-mail.
2. A conta nasce como **psicólogo com credencial pendente**: entra no painel, mas não vê nem assume
   conversas. O cadastro nunca concede papel administrativo.
3. Um administrador confere o CRP e clica em **Validar credencial** em `/dashboard/equipe`.
   Ninguém valida a própria credencial: o administrador e o psicólogo precisam ser contas diferentes.
4. Validado, o(a) psicólogo(a) escolhe **Disponível para atender** no menu e usa
   **Atendimentos**: fila em tempo real → **Assumir atendimento** → conversa → **Finalizar** ou
   **Devolver para a IA**. A aba do navegador mostra quantas pessoas aguardam.

Administradores também podem convidar profissionais por e-mail em `/dashboard/equipe`.

## IA

`AI_PROVIDER=openai` (exige `OPENAI_API_KEY` e `OPENAI_MODEL`, ex.: `gpt-5.5`;
`OPENAI_REASONING_EFFORT=low` deixa as respostas mais rápidas) ou `anthropic` (padrão do modelo:
`claude-opus-5-5`, com fallback de recusa no servidor). `mock` é um simulador sem IA, identificado
na interface. A API da OpenAI é cobrada à parte do ChatGPT: sem créditos em
platform.openai.com/settings/organization/billing, o chat mostra "O assistente não conseguiu
responder agora" (a mensagem da pessoa fica salva). Prompt de sistema versionado em
`src/lib/ai/prompts/system-prompt.ts`. Limites de uso configuráveis no painel.

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
   | `AI_PROVIDER` | `mock`, `openai` ou `anthropic` |
   | `OPENAI_API_KEY` / `OPENAI_MODEL` / `OPENAI_REASONING_EFFORT` | só se `AI_PROVIDER=openai` (ex.: `gpt-5.5`, `low`) |
   | `ANTHROPIC_API_KEY` | só se `AI_PROVIDER=anthropic` |
   | `STAFF_REQUIRE_MFA` | `true` em produção |
   | `STAFF_OPEN_SIGNUP` | `true` só em teste (cadastro de psicólogo com e-mail e senha) |

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
