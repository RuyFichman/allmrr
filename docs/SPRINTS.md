# AllMRR: plano de sprints

> Diretório público de startups com **receita verificada** (estilo TrustMRR), organizado por **modelo de negócio**: SaaS, Micro-SaaS, OaaS e outros.

## Visão do produto

- Founders conectam o provedor de pagamento com uma **chave somente leitura**. A receita é sincronizada e exibida como **verificada**.
- Cada startup tem uma página pública com MRR, receita total, crescimento, gráfico histórico e founder.
- Os rankings são separados por **modelo de negócio** (o diferencial) e por nicho.
- Há um marketplace de startups **à venda**, com preço pedido e múltiplo calculado.
- O dinheiro vem de patrocínios, listagens em destaque e taxa ou plano para anunciar no marketplace.

## Stack proposta

| Camada | Escolha | Motivo |
|---|---|---|
| Front + API | Next.js (App Router) + TypeScript | SEO forte (páginas públicas indexáveis), Server Components |
| UI | Tailwind + shadcn/ui | Velocidade |
| Banco + Auth | Supabase (Postgres, Auth, RLS, pg_cron) | Auth social (X/Google/GitHub), RLS, cron nativo |
| Hosting | Vercel | Deploy de previews, Cron, OG images |
| Gráficos | Recharts | Simples |
| Pagamentos (nosso faturamento) | Stripe Checkout | Patrocínios e listagens |
| Segredos | Chaves dos founders criptografadas (AES-GCM / Supabase Vault) | Segurança obrigatória |

## Taxonomia de modelos de negócio (rascunho)

| Slug | Nome | Critério sugerido |
|---|---|---|
| `saas` | SaaS | Software por assinatura, time > 3 ou MRR ≥ US$ 50k |
| `micro-saas` | Micro-SaaS | Software por assinatura, solo/time pequeno e MRR < US$ 50k |
| `oaas` | OaaS (Outcome-as-a-Service) | Cobra pelo resultado entregue (por lead, venda, ticket resolvido etc.) |
| `aaas` | Agent/AI-as-a-Service | Produto de IA cobrado por uso ou assinatura |
| `marketplace` | Marketplace | Receita por take rate |
| `content` | Newsletter / Conteúdo / Comunidade | Assinaturas de conteúdo |
| `info-product` | Infoproduto / Curso | Venda única ou recorrente de conhecimento |
| `productized-service` | Serviço produtizado / Agência | Serviço com escopo e preço fixos |
| `mobile-app` | App mobile | Receita via RevenueCat / lojas |
| `ecommerce` | E-commerce / Assinatura física | Produto físico |

Classificação **híbrida**: o founder declara o modelo, regras automáticas (MRR, time, provedor) sugerem ou validam, e o admin revisa. A taxonomia fica numa tabela no banco, não fixa no código.

---

## Sprint 0: Fundação
**Objetivo:** projeto rodando em produção com o esqueleto vazio.
- Repositório git, Next.js + TS + Tailwind + shadcn, lint/format
- Projeto Supabase (dev e prod), Vercel linkado, variáveis de ambiente
- Layout base (header, footer, tema claro/escuro), design tokens
- Auth: login com X (Twitter), Google e GitHub
- **Pronto quando:** deploy de produção acessível com login funcionando

## Sprint 1: Modelo de dados e taxonomia
**Objetivo:** o domínio modelado e páginas públicas com dados de seed.
- Tabelas: `profiles` (founders), `startups`, `startup_founders`, `business_models`, `niches`, `revenue_connections`, `revenue_snapshots` (diários), `listings` (à venda)
- RLS em todas as tabelas
- Seed com cerca de 30 startups fictícias espalhadas pelos modelos
- Cadastro e edição de startup (nome, URL, logo, descrição, modelo, nicho, X handle)
- **Pronto quando:** um founder cria a startup e ela aparece numa listagem pública

## Sprint 2: Verificação de receita via Stripe
**Objetivo:** receita real e verificada para o principal provedor.
- Fluxo de conexão com uma **restricted key** do Stripe (somente leitura) e validação das permissões
- Criptografia da chave em repouso, sem nunca expor no client
- Job de sincronização: assinaturas ativas → MRR, charges → receita total, normalização de planos anuais, cupons e reembolsos
- Conversão de moedas para USD com taxa diária
- Snapshot diário via cron e badge **Verificado**
- **Pronto quando:** uma conta Stripe real mostra MRR e receita idênticos ao dashboard do Stripe (±1%)

## Sprint 3: Outros provedores
**Objetivo:** cobrir quem não usa Stripe.
- Adapters com interface comum `RevenueProvider`: LemonSqueezy, Polar, Paddle, RevenueCat (apps) e Gumroad
- Várias conexões por startup, somadas
- Tratamento de erros: chave revogada, rate limit, alerta ao founder
- **Pronto quando:** cada provedor sincroniza numa conta de teste

## Sprint 4: Páginas de startup e founder
**Objetivo:** as páginas que geram tráfego e compartilhamento.
- Página da startup: MRR, receita total, crescimento MoM, gráfico (30d / 1a / tudo), modelo, nicho, founders
- Página do founder com todas as startups dele e a receita somada
- OG images dinâmicas para compartilhar no X
- Badge/widget embutível "Verified MRR on AllMRR"
- **Pronto quando:** compartilhar o link de uma startup gera um preview bonito

## Sprint 5: Leaderboards e descoberta (o diferencial)
**Objetivo:** rankings separados por modelo de negócio.
- Leaderboard geral e um leaderboard **por modelo** (`/saas`, `/micro-saas`, `/oaas`…)
- Filtros por nicho, faixa de MRR, crescimento, idade, provedor e "à venda"
- Ordenação por MRR, receita total, crescimento e mais recentes
- Busca (Postgres full-text)
- Páginas SEO por modelo × nicho (ex.: "Micro-SaaS de IA com receita verificada")
- **Pronto quando:** cada modelo tem uma página indexável com ranking próprio

## Sprint 6: Marketplace de startups à venda
**Objetivo:** comprar e vender startups verificadas.
- Founder marca a startup como à venda: preço pedido, motivo, o que está incluso
- Múltiplo calculado automaticamente (preço ÷ receita anual)
- Listagem `/acquire` com filtros (modelo, preço, múltiplo, MRR)
- Contato comprador → vendedor (formulário com e-mail via Resend, sem expor o e-mail do vendedor)
- Alertas por e-mail para compradores ("nova Micro-SaaS à venda abaixo de 3x")
- **Pronto quando:** um comprador recebe o alerta e contata o vendedor

## Sprint 7: Monetização
**Objetivo:** gerar receita própria.
- Slots de patrocinador (sidebar e topo) com agendamento e Stripe Checkout
- Listagem em destaque no marketplace (paga)
- Página `/advertise` com métricas de tráfego
- Billing e webhooks do Stripe
- **Pronto quando:** um patrocínio é comprado de ponta a ponta e aparece no site

## Sprint 8: Admin, moderação e antifraude
**Objetivo:** confiança nos dados, que é o produto em si.
- Painel admin: aprovar startups, revisar modelo/categoria, banir, editar taxonomia
- Heurísticas de fraude: autopagamentos, picos anômalos, reembolsos altos, cliente único concentrando receita
- Flag "receita suspeita" e denúncias da comunidade
- Logs de auditoria
- **Pronto quando:** um caso de teste de receita inflada é sinalizado automaticamente

## Sprint 9: Lançamento
**Objetivo:** pronto para o Product Hunt / X.
- SEO: sitemap, metadata, dados estruturados, performance (Core Web Vitals)
- Analytics (Vercel Analytics / PostHog)
- Termos, Política de Privacidade, LGPD/GDPR (exclusão de conta e dados)
- E-mails transacionais: boas-vindas, sync com falha, resumo semanal de MRR
- Testes E2E dos fluxos críticos (Playwright)
- **Pronto quando:** checklist de lançamento 100% e primeiras 20 startups reais cadastradas

## Pós-lançamento (backlog)
- API pública e feed RSS
- Comparação entre startups e "startups parecidas"
- Comentários e upvotes
- Internacionalização (PT/EN)
- Integração com Mercado Pago / Asaas / Hotmart para o mercado brasileiro

---

## Decisões
- **OaaS** = Outcome-as-a-Service: cobra pelo resultado entregue (por lead, por venda, por ticket resolvido…)
- **Duração de cada sprint:** 1 semana
- **Idioma do site:** inglês (mercado global)
- **Stack:** Next.js + Supabase + Vercel (confirmada)
- **Em aberto:** nome e domínio definitivos (usando "AllMRR" provisoriamente)
