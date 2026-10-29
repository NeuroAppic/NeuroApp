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
- Modelos de e-mail (convite, recuperação, confirmação) devem apontar para
  `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=<invite|recovery|email>&next=/dashboard`.
- Adicione `<site>/auth/confirm` às Redirect URLs.
- Retenção diária (opcional, pg_cron): `supabase/optional/schedule_retention.sql`.
- Tipos gerados: `npm run db:types`.

### Primeiro superadministrador

```bash
node --env-file=.env.local scripts/create-superadmin.mjs admin@exemplo.org "Nome Completo" "Nome"
```

Só funciona enquanto não existir superadministrador. Depois, convide a equipe em `/dashboard/equipe`.
Psicólogos só atendem após **outro** administrador validar o registro profissional.

## IA

`AI_PROVIDER=anthropic` (padrão do modelo: `claude-opus-5-5`, com fallback de recusa no servidor) ou
`openai` (exige `OPENAI_MODEL`). `mock` é um simulador sem IA, identificado na interface. Prompt de
sistema versionado em `src/lib/ai/prompts/system-prompt.ts`. Limites de uso configuráveis no painel.

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

Qualquer host Node com suporte a Next.js 16 (ex.: Vercel). Configure as variáveis, `NEXT_PUBLIC_SITE_URL`,
URLs de redirecionamento no Supabase e agende a retenção. Ative `STAFF_REQUIRE_MFA=true` em produção.

## Cuidados de segurança

- Nunca exponha `SUPABASE_SECRET_KEY` nem chaves de IA (não use prefixo `NEXT_PUBLIC_`).
- RLS em todas as tabelas; escrita de mensagens da pessoa/IA apenas via servidor; administradores não
  leem conversas; leituras clínicas auditadas.
- CSRF: rotas mutáveis exigem mesma origem + JSON. CSP e cabeçalhos de segurança em `next.config.ts`.
- Não use dados reais em testes. Revise contratos com o provedor de IA (retenção, transferência internacional).
