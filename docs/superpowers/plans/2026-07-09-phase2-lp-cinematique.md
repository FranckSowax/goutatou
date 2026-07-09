# Goutatou Phase 2 (LP cinématique + commande web) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chaque restaurant a une landing page publique cinématique scroll-motion, générée depuis un template unique paramétré en base (`restaurants.lp_config`), avec CTA WhatsApp et tunnel de commande web qui atterrit dans le même pipeline `orders` que le bot.

**Architecture:** Tout vit dans `apps/web` (déjà déployé sur Netlify). Route publique `/r/[slug]` en ISR (revalidate 120 s), données chargées côté serveur via le client service-role (les LP sont publiques, pas de RLS anonyme à ouvrir). Animations GSAP ScrollTrigger + Lenis dans des composants client, données/SEO en server components. Panier client (localStorage) → checkout `/r/[slug]/commander` → route handler `POST /api/lp/[slug]/order` (service-role : upsert customer + RPC `create_order` source `web` + confirmation WhatsApp best-effort). L'admin configure la LP dans `/admin/lp/[restaurantId]` (médias → bucket `lp-media`). Le middleware réécrit `{slug}.<domaine-custom>` → `/r/{slug}` (prêt pour le wildcard, le chemin `/r/` reste canonique sur `goutatou.netlify.app`).

**Tech Stack:** Next.js 15 App Router (existant) · gsap + @gsap/react + lenis · Supabase (Storage bucket `lp-media`, RPC `create_order` existante) · Vitest.

## Global Constraints

- Textes FR ; prix FCFA entiers via `formatFcfa` (`@goutatou/db/types`).
- Une LP ne se rend que si `lp_config.published === true` — sinon `notFound()`.
- Client service-role et `decryptToken` UNIQUEMENT côté serveur (server components, actions, route handlers). Les composants client importent exclusivement `@goutatou/db/types`.
- `create_order` reste réservée à `service_role` (migration 0005) — la commande web passe par un route handler serveur, jamais par le client.
- Mobile-first : cible réseaux mobiles gabonais. Hero < 300 Ko à l'écran initial, images via `next/image` (remotePatterns Supabase), vidéo hero `preload="metadata"` + poster.
- `prefers-reduced-motion: reduce` → aucune animation scroll (contenu visible statiquement) ; Lenis désactivé.
- Le numéro WhatsApp affiché/lié vient de `whapi_channels.phone` (rempli à la config du webhook) avec repli `lp_config.whatsappPhone`.
- Storage : bucket `lp-media` public en lecture par URL directe mais SANS policy de listing (leçon phase 1, advisor 0025) ; écriture scopée par tenant (préfixe dossier = restaurant_id), pattern identique à `menu-photos` (migrations 0004+0006).
- Commits fréquents, préfixes `feat:`/`fix:`/`test:`/`chore:`/`docs:`.

## File Structure (cible fin de phase 2)

```
apps/web/src/
├── lib/lp/
│   ├── config.ts          # LpConfig : types + parseLpConfig (défauts sûrs) [pur, testé]
│   ├── data.ts            # getLpData(slug) — service client, server-only
│   ├── wa.ts              # buildWaLink, normalizeGabonPhone [pur, testé]
│   └── cart.ts            # reducer panier web [pur, testé]
├── components/lp/
│   ├── SmoothScroll.tsx   # Lenis + GSAP ticker (client)
│   ├── Reveal.tsx         # fade/slide-in on scroll (client)
│   ├── Overlays.tsx       # grain + vignette (CSS pur)
│   ├── Hero.tsx           # média + parallax + titres
│   ├── Featured.tsx       # plats vedettes (glass cards)
│   ├── MenuSection.tsx    # carte complète + boutons Ajouter
│   ├── Infos.tsx          # adresse, horaires, lien maps
│   ├── CartBar.tsx        # barre panier sticky (client)
│   └── CartProvider.tsx   # contexte panier + localStorage (client)
├── app/r/[slug]/
│   ├── layout.tsx         # thème (CSS vars), fonts, CartProvider
│   ├── page.tsx           # LP (ISR 120 s)
│   ├── commander/page.tsx # checkout (client form)
│   └── merci/page.tsx     # confirmation (n° commande)
├── app/api/lp/[slug]/order/route.ts   # POST création commande web (service-role)
├── app/admin/lp/[restaurantId]/{page.tsx, actions.ts}  # éditeur LP admin
└── middleware.ts          # + réécriture sous-domaine → /r/[slug]
supabase/migrations/20260709000007_lp_media.sql
apps/web/test/{lp-config,wa,cart,order-route}.test.ts
```

---

### Task 1: `LpConfig` — types et parsing sûr

**Files:**
- Create: `apps/web/src/lib/lp/config.ts`
- Test: `apps/web/test/lp-config.test.ts`

**Interfaces:**
- Produces (consommé par T3, T4, T6, T11) :
  - `interface LpTheme { primary: string; bg: string; text: string; accent: string; font: 'sans' | 'serif' }`
  - `interface LpConfig { published: boolean; hero: { title: string; subtitle: string; mediaUrl: string | null; mediaType: 'image' | 'video' }; about: { title: string; text: string } | null; featuredIds: string[]; infos: { address: string | null; hours: string[]; mapsUrl: string | null }; theme: LpTheme; effects: { grain: boolean; vignette: boolean }; whatsappPhone: string | null }`
  - `parseLpConfig(raw: unknown, restaurantName: string): LpConfig` — jamais d'exception ; tout champ manquant/mal typé retombe sur un défaut sûr ; `published` n'est `true` que si strictement `true`.
  - `DEFAULT_THEME: LpTheme` (`{ primary: '#E8590C', bg: '#0E0B08', text: '#F5EFE6', accent: '#F2B705', font: 'sans' }` — sombre chaleureux, cohérent resto).

- [ ] **Step 1: Écrire le test (échoue d'abord)**

`apps/web/test/lp-config.test.ts` :
```ts
import { describe, expect, it } from 'vitest'
import { DEFAULT_THEME, parseLpConfig } from '../src/lib/lp/config'

describe('parseLpConfig', () => {
  it('config vide → défauts sûrs, non publiée, titre = nom du resto', () => {
    const c = parseLpConfig({}, 'Chez Mama')
    expect(c.published).toBe(false)
    expect(c.hero.title).toBe('Chez Mama')
    expect(c.hero.mediaUrl).toBeNull()
    expect(c.theme).toEqual(DEFAULT_THEME)
    expect(c.featuredIds).toEqual([])
    expect(c.infos.hours).toEqual([])
  })

  it('published doit être strictement true', () => {
    expect(parseLpConfig({ published: 'true' }, 'X').published).toBe(false)
    expect(parseLpConfig({ published: 1 }, 'X').published).toBe(false)
    expect(parseLpConfig({ published: true }, 'X').published).toBe(true)
  })

  it('garde les valeurs valides et jette les invalides champ par champ', () => {
    const c = parseLpConfig({
      hero: { title: 'Le vrai goût', mediaUrl: 'https://x/img.jpg', mediaType: 'video' },
      theme: { primary: '#123456', font: 'serif', bg: 42 },
      featuredIds: ['a', 3, 'b'],
      infos: { hours: ['Lun-Sam 11h-22h'], address: 'Glass, Libreville' },
      whatsappPhone: '24177000001',
    }, 'Chez Mama')
    expect(c.hero.title).toBe('Le vrai goût')
    expect(c.hero.mediaType).toBe('video')
    expect(c.theme.primary).toBe('#123456')
    expect(c.theme.font).toBe('serif')
    expect(c.theme.bg).toBe(DEFAULT_THEME.bg) // invalide → défaut
    expect(c.featuredIds).toEqual(['a', 'b'])
    expect(c.infos.address).toBe('Glass, Libreville')
    expect(c.whatsappPhone).toBe('24177000001')
  })

  it('raw non-objet (null, string) → config par défaut', () => {
    expect(parseLpConfig(null, 'X').published).toBe(false)
    expect(parseLpConfig('junk', 'X').hero.title).toBe('X')
  })
})
```

- [ ] **Step 2: Vérifier l'échec** — Run: `pnpm --filter @goutatou/web test -- lp-config` — Expected: FAIL (module absent).

- [ ] **Step 3: Implémenter**

`apps/web/src/lib/lp/config.ts` :
```ts
export interface LpTheme {
  primary: string
  bg: string
  text: string
  accent: string
  font: 'sans' | 'serif'
}

export interface LpConfig {
  published: boolean
  hero: { title: string; subtitle: string; mediaUrl: string | null; mediaType: 'image' | 'video' }
  about: { title: string; text: string } | null
  featuredIds: string[]
  infos: { address: string | null; hours: string[]; mapsUrl: string | null }
  theme: LpTheme
  effects: { grain: boolean; vignette: boolean }
  whatsappPhone: string | null
}

export const DEFAULT_THEME: LpTheme = {
  primary: '#E8590C',
  bg: '#0E0B08',
  text: '#F5EFE6',
  accent: '#F2B705',
  font: 'sans',
}

const HEX = /^#[0-9a-fA-F]{6}$/

function str(v: unknown, fallback: string): string {
  return typeof v === 'string' && v.trim() ? v : fallback
}
function strOrNull(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v : null
}
function obj(v: unknown): Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
}

export function parseLpConfig(raw: unknown, restaurantName: string): LpConfig {
  const r = obj(raw)
  const hero = obj(r.hero)
  const about = obj(r.about)
  const infos = obj(r.infos)
  const theme = obj(r.theme)
  const effects = obj(r.effects)

  const aboutText = strOrNull(about.text)

  return {
    published: r.published === true,
    hero: {
      title: str(hero.title, restaurantName),
      subtitle: str(hero.subtitle, ''),
      mediaUrl: strOrNull(hero.mediaUrl),
      mediaType: hero.mediaType === 'video' ? 'video' : 'image',
    },
    about: aboutText ? { title: str(about.title, 'Notre histoire'), text: aboutText } : null,
    featuredIds: Array.isArray(r.featuredIds) ? r.featuredIds.filter((x): x is string => typeof x === 'string') : [],
    infos: {
      address: strOrNull(infos.address),
      hours: Array.isArray(infos.hours) ? infos.hours.filter((x): x is string => typeof x === 'string') : [],
      mapsUrl: strOrNull(infos.mapsUrl),
    },
    theme: {
      primary: HEX.test(String(theme.primary)) ? (theme.primary as string) : DEFAULT_THEME.primary,
      bg: HEX.test(String(theme.bg)) ? (theme.bg as string) : DEFAULT_THEME.bg,
      text: HEX.test(String(theme.text)) ? (theme.text as string) : DEFAULT_THEME.text,
      accent: HEX.test(String(theme.accent)) ? (theme.accent as string) : DEFAULT_THEME.accent,
      font: theme.font === 'serif' ? 'serif' : 'sans',
    },
    effects: { grain: effects.grain !== false, vignette: effects.vignette !== false },
    whatsappPhone: strOrNull(r.whatsappPhone),
  }
}
```

- [ ] **Step 4: Vérifier le pass** — Run: `pnpm --filter @goutatou/web test -- lp-config` — Expected: 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/lp/config.ts apps/web/test/lp-config.test.ts
git commit -m "feat(lp): types LpConfig + parsing tolérant avec défauts sûrs"
```

---

### Task 2: Helpers WhatsApp — deep link + normalisation du numéro

**Files:**
- Create: `apps/web/src/lib/lp/wa.ts`
- Test: `apps/web/test/wa.test.ts`

**Interfaces:**
- Produces (consommé par T6, T9) :
  - `normalizeGabonPhone(input: string): string | null` — retourne les chiffres au format international `241XXXXXXXX`, ou `null` si inexploitable. Règles : on retire tout sauf les chiffres ; `241…` (11-12 chiffres) → tel quel ; `0XXXXXXXX` (9 chiffres commençant par 0) → `241` + les 8 suivants ; 8 chiffres → `241` + digits ; sinon `null`.
  - `buildWaLink(phone: string, text?: string): string` — `https://wa.me/<digits>` + `?text=<encodé>` si texte.

- [ ] **Step 1: Test (échoue d'abord)**

`apps/web/test/wa.test.ts` :
```ts
import { describe, expect, it } from 'vitest'
import { buildWaLink, normalizeGabonPhone } from '../src/lib/lp/wa'

describe('normalizeGabonPhone', () => {
  it('accepte les formats courants gabonais', () => {
    expect(normalizeGabonPhone('077123456')).toBe('24177123456')
    expect(normalizeGabonPhone('+241 77 12 34 56')).toBe('24177123456')
    expect(normalizeGabonPhone('241 77 12 34 56')).toBe('24177123456')
    expect(normalizeGabonPhone('77 12 34 56')).toBe('24177123456')
  })
  it('rejette les numéros inexploitables', () => {
    expect(normalizeGabonPhone('')).toBeNull()
    expect(normalizeGabonPhone('123')).toBeNull()
    expect(normalizeGabonPhone('abc')).toBeNull()
  })
})

describe('buildWaLink', () => {
  it('construit le lien avec texte pré-rempli encodé', () => {
    expect(buildWaLink('24177123456', 'Bonjour, je veux commander !'))
      .toBe('https://wa.me/24177123456?text=Bonjour%2C%20je%20veux%20commander%20!')
  })
  it('sans texte → lien nu, et nettoie les non-chiffres', () => {
    expect(buildWaLink('+241 77-12-34-56')).toBe('https://wa.me/24177123456')
  })
})
```

- [ ] **Step 2: Vérifier l'échec** — `pnpm --filter @goutatou/web test -- wa` — FAIL.

- [ ] **Step 3: Implémenter**

`apps/web/src/lib/lp/wa.ts` :
```ts
export function normalizeGabonPhone(input: string): string | null {
  const digits = input.replace(/\D/g, '')
  if (digits.startsWith('241') && digits.length >= 11 && digits.length <= 12) return digits
  if (digits.startsWith('0') && digits.length === 9) return `241${digits.slice(1)}`
  if (digits.length === 8) return `241${digits}`
  return null
}

export function buildWaLink(phone: string, text?: string): string {
  const digits = phone.replace(/\D/g, '')
  const base = `https://wa.me/${digits}`
  return text ? `${base}?text=${encodeURIComponent(text)}` : base
}
```

- [ ] **Step 4: Pass** — `pnpm --filter @goutatou/web test -- wa` — 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/lp/wa.ts apps/web/test/wa.test.ts
git commit -m "feat(lp): deep link wa.me + normalisation des numéros gabonais"
```

---

### Task 3: Migration 0007 — bucket `lp-media` (tenant-scopé, sans listing)

**Files:**
- Create: `supabase/migrations/20260709000007_lp_media.sql`

**Interfaces:**
- Produces: bucket public `lp-media` ; policies `lp_media_insert`/`lp_media_update` (authenticated, premier segment de dossier = restaurant_id du membre, bypass platform_admin) ; AUCUNE policy select (lecture par URL publique directe uniquement — leçon advisor 0025 de la phase 1). Consommé par T11 (upload hero).

- [ ] **Step 1: Écrire la migration** (calquée sur 0004 corrigée + 0006)

`supabase/migrations/20260709000007_lp_media.sql` :
```sql
insert into storage.buckets (id, name, public) values ('lp-media', 'lp-media', true)
on conflict do nothing;

create policy lp_media_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'lp-media'
    and (
      (storage.foldername(name))[1] in (
        select restaurant_id::text from restaurant_members where user_id = auth.uid()
      )
      or (select exists (select 1 from platform_admins where user_id = auth.uid()))
    )
  );

create policy lp_media_update on storage.objects for update to authenticated
  using (
    bucket_id = 'lp-media'
    and (
      (storage.foldername(name))[1] in (
        select restaurant_id::text from restaurant_members where user_id = auth.uid()
      )
      or (select exists (select 1 from platform_admins where user_id = auth.uid()))
    )
  );

-- Pas de policy SELECT : bucket public servi par URL directe, pas de listing (advisor 0025).
```

- [ ] **Step 2: Vérifier en local** — Run: `supabase db reset && supabase test db`
Expected: migrations 0001→0007 s'appliquent, pgTAP 21/21 inchangés.

- [ ] **Step 3: Appliquer en prod** — via MCP Supabase `apply_migration` (nom `lp_media`, même SQL). Vérifier ensuite `get_advisors` (security) : aucun nouveau WARN de listing.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260709000007_lp_media.sql
git commit -m "feat(db): bucket lp-media tenant-scopé sans listing public (migration 0007)"
```

---

### Task 4: Data layer — `getLpData(slug)`

**Files:**
- Create: `apps/web/src/lib/lp/data.ts`

**Interfaces:**
- Consumes: `createAdminClient` (T12 phase 1), `parseLpConfig` (T1).
- Produces (consommé par T5, T6, T8, T9) :
  - `interface LpMenuItem { id: string; name: string; description: string | null; price: number; photoUrl: string | null }`
  - `interface LpData { restaurantId: string; slug: string; name: string; config: LpConfig; categories: { id: string; name: string; items: LpMenuItem[] }[]; featured: LpMenuItem[]; driveSlots: { id: string; label: string }[]; driveEnabled: boolean; whatsappPhone: string | null }`
  - `getLpData(slug: string): Promise<LpData | null>` — `null` si resto introuvable OU `config.published !== true`. `whatsappPhone` = `whapi_channels.phone` sinon `config.whatsappPhone`. `featured` = items dont l'id ∈ `config.featuredIds` (dispo uniquement), max 4.

- [ ] **Step 1: Implémenter** (server-only, pas de test unitaire — logique portée par T1 déjà testé ; la vérification est le build + le smoke T13)

`apps/web/src/lib/lp/data.ts` :
```ts
import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { parseLpConfig, type LpConfig } from './config'

export interface LpMenuItem {
  id: string
  name: string
  description: string | null
  price: number
  photoUrl: string | null
}

export interface LpData {
  restaurantId: string
  slug: string
  name: string
  config: LpConfig
  categories: { id: string; name: string; items: LpMenuItem[] }[]
  featured: LpMenuItem[]
  driveSlots: { id: string; label: string }[]
  driveEnabled: boolean
  whatsappPhone: string | null
}

export async function getLpData(slug: string): Promise<LpData | null> {
  const db = createAdminClient()
  const { data: resto } = await db
    .from('restaurants')
    .select('id, slug, name, lp_config, drive_enabled, whapi_channels(phone)')
    .eq('slug', slug)
    .maybeSingle()
  if (!resto) return null

  const config = parseLpConfig(resto.lp_config, resto.name)
  if (!config.published) return null

  const [{ data: cats }, { data: slots }] = await Promise.all([
    db.from('menu_categories')
      .select('id, name, position, menu_items(id, name, description, price, photo_url, available, position)')
      .eq('restaurant_id', resto.id)
      .order('position'),
    db.from('drive_slots').select('id, label, position')
      .eq('restaurant_id', resto.id).eq('active', true).order('position'),
  ])

  const categories = (cats ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    items: ((c.menu_items as {
      id: string; name: string; description: string | null; price: number
      photo_url: string | null; available: boolean; position: number
    }[]) ?? [])
      .filter((i) => i.available)
      .sort((a, b) => a.position - b.position)
      .map((i) => ({ id: i.id, name: i.name, description: i.description, price: i.price, photoUrl: i.photo_url })),
  })).filter((c) => c.items.length > 0)

  const allItems = categories.flatMap((c) => c.items)
  const featured = config.featuredIds
    .map((id) => allItems.find((i) => i.id === id))
    .filter((i): i is LpMenuItem => Boolean(i))
    .slice(0, 4)

  const channel = resto.whapi_channels as unknown as { phone: string | null } | null

  return {
    restaurantId: resto.id,
    slug: resto.slug,
    name: resto.name,
    config,
    categories,
    featured: featured.length ? featured : allItems.slice(0, 3),
    driveSlots: (slots ?? []).map((s) => ({ id: s.id, label: s.label })),
    driveEnabled: resto.drive_enabled,
    whatsappPhone: channel?.phone ?? config.whatsappPhone,
  }
}
```

- [ ] **Step 2: Typecheck** — `pnpm --filter @goutatou/web typecheck` — clean.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/lp/data.ts
git commit -m "feat(lp): getLpData — chargement server-side de la LP publiée"
```

---

### Task 5: Route `/r/[slug]` — layout thémé + page ISR + motion runtime

**Files:**
- Create: `apps/web/src/app/r/[slug]/layout.tsx`, `apps/web/src/app/r/[slug]/page.tsx`, `apps/web/src/components/lp/{SmoothScroll.tsx, Reveal.tsx, Overlays.tsx}`
- Modify: `apps/web/package.json` (deps), `apps/web/next.config.ts` (images Supabase)

**Interfaces:**
- Consumes: `getLpData` (T4), `LpTheme` (T1).
- Produces: `<SmoothScroll>` (Lenis + ScrollTrigger sync, désactivé si reduced-motion), `<Reveal as? delay?>` (fade-up on enter), `<Overlays grain vignette>`. Le layout injecte les CSS vars du thème (`--lp-primary`, `--lp-bg`, `--lp-text`, `--lp-accent`). Page ISR `revalidate = 120`. Consommé par T6.

- [ ] **Step 1: Installer les deps**

Run: `pnpm --filter @goutatou/web add gsap @gsap/react lenis`
Expected: ajoutées à package.json, lockfile mis à jour.

- [ ] **Step 2: Autoriser les images Supabase dans next/image**

`apps/web/next.config.ts` :
```ts
import type { NextConfig } from 'next'
const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'vaowvldazfcmietacctz.supabase.co', pathname: '/storage/v1/object/public/**' },
    ],
  },
}
export default nextConfig
```

- [ ] **Step 3: Motion runtime**

`apps/web/src/components/lp/SmoothScroll.tsx` :
```tsx
'use client'
import { useEffect, type ReactNode } from 'react'
import Lenis from 'lenis'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

export function SmoothScroll({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const lenis = new Lenis({ lerp: 0.12 })
    lenis.on('scroll', ScrollTrigger.update)
    const raf = (time: number) => lenis.raf(time * 1000)
    gsap.ticker.add(raf)
    gsap.ticker.lagSmoothing(0)
    return () => {
      gsap.ticker.remove(raf)
      lenis.destroy()
    }
  }, [])
  return <>{children}</>
}
```

`apps/web/src/components/lp/Reveal.tsx` :
```tsx
'use client'
import { useRef, type ReactNode } from 'react'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger, useGSAP)

export function Reveal({ children, delay = 0, className }: {
  children: ReactNode; delay?: number; className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  useGSAP(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    gsap.fromTo(ref.current,
      { opacity: 0, y: 36 },
      {
        opacity: 1, y: 0, duration: 0.9, delay, ease: 'power3.out',
        scrollTrigger: { trigger: ref.current, start: 'top 85%', once: true },
      })
  }, [delay])
  return <div ref={ref} className={className}>{children}</div>
}
```

`apps/web/src/components/lp/Overlays.tsx` :
```tsx
export function Overlays({ grain, vignette }: { grain: boolean; vignette: boolean }) {
  return (
    <>
      {vignette && (
        <div aria-hidden className="pointer-events-none fixed inset-0 z-40"
          style={{ background: 'radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.45) 100%)' }} />
      )}
      {grain && (
        <div aria-hidden className="pointer-events-none fixed inset-0 z-40 opacity-[0.07] mix-blend-overlay"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
          }} />
      )}
    </>
  )
}
```

- [ ] **Step 4: Layout + page**

`apps/web/src/app/r/[slug]/layout.tsx` :
```tsx
import { notFound } from 'next/navigation'
import type { ReactNode } from 'react'
import { getLpData } from '@/lib/lp/data'
import { SmoothScroll } from '@/components/lp/SmoothScroll'
import { Overlays } from '@/components/lp/Overlays'
import { CartProvider } from '@/components/lp/CartProvider'

export default async function LpLayout({ children, params }: {
  children: ReactNode; params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const lp = await getLpData(slug)
  if (!lp) notFound()
  const { theme } = lp.config
  return (
    <div
      className={theme.font === 'serif' ? 'font-serif' : 'font-sans'}
      style={{
        ['--lp-primary' as string]: theme.primary,
        ['--lp-bg' as string]: theme.bg,
        ['--lp-text' as string]: theme.text,
        ['--lp-accent' as string]: theme.accent,
        backgroundColor: theme.bg,
        color: theme.text,
      }}
    >
      <SmoothScroll>
        <CartProvider slug={slug}>{children}</CartProvider>
      </SmoothScroll>
      <Overlays grain={lp.config.effects.grain} vignette={lp.config.effects.vignette} />
    </div>
  )
}
```

`apps/web/src/app/r/[slug]/page.tsx` (squelette — les sections arrivent en T6) :
```tsx
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getLpData } from '@/lib/lp/data'

export const revalidate = 120

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const lp = await getLpData(slug)
  if (!lp) return { title: 'Goutatou' }
  return {
    title: `${lp.name} — Commandez sur WhatsApp`,
    description: lp.config.hero.subtitle || `Découvrez la carte de ${lp.name} et commandez en quelques secondes.`,
    openGraph: lp.config.hero.mediaType === 'image' && lp.config.hero.mediaUrl
      ? { images: [lp.config.hero.mediaUrl] } : undefined,
  }
}

export default async function LpPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const lp = await getLpData(slug)
  if (!lp) notFound()
  return (
    <main className="min-h-screen">
      <h1 className="p-10 text-4xl font-bold">{lp.config.hero.title}</h1>
      {/* Sections T6 */}
    </main>
  )
}
```

Note : `CartProvider` n'existe pas encore (T7). Pour que T5 compile seul, créer un stub minimal `apps/web/src/components/lp/CartProvider.tsx` :
```tsx
'use client'
import type { ReactNode } from 'react'
export function CartProvider({ children }: { children: ReactNode; slug: string }) {
  return <>{children}</>
}
```
(T7 le remplace par la vraie implémentation — même nom, même emplacement.)

- [ ] **Step 5: Vérifier** — `pnpm --filter @goutatou/web typecheck` clean puis `pnpm --filter @goutatou/web build` OK (la route `/r/[slug]` apparaît en ISR). Tests existants toujours verts (`pnpm --filter @goutatou/web test`).

- [ ] **Step 6: Commit**

```bash
git add apps/web
git commit -m "feat(lp): route /r/[slug] ISR, thème CSS vars, runtime GSAP+Lenis, overlays grain/vignette"
```

---

### Task 6: Sections de la LP — hero, plats vedettes, carte, infos, CTA WhatsApp

**Files:**
- Create: `apps/web/src/components/lp/{Hero.tsx, Featured.tsx, MenuSection.tsx, Infos.tsx}`
- Modify: `apps/web/src/app/r/[slug]/page.tsx`

**Interfaces:**
- Consumes: `LpData` (T4), `Reveal` (T5), `buildWaLink` (T2), `formatFcfa` (`@goutatou/db/types`), `useCart` (stub T5, réel T7 — les boutons « Ajouter » appellent `addItem`).
- Produces: la LP complète. Le CTA WhatsApp (hero + section infos) utilise `buildWaLink(phone, 'Bonjour ${name} ! Je voudrais commander 🙏')` et n'apparaît que si `whatsappPhone` non nul.

- [ ] **Step 1: Hero avec parallax**

`apps/web/src/components/lp/Hero.tsx` :
```tsx
'use client'
import { useRef } from 'react'
import Image from 'next/image'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { buildWaLink } from '@/lib/lp/wa'

gsap.registerPlugin(ScrollTrigger, useGSAP)

export function Hero({ title, subtitle, mediaUrl, mediaType, waPhone, restaurantName }: {
  title: string; subtitle: string; mediaUrl: string | null
  mediaType: 'image' | 'video'; waPhone: string | null; restaurantName: string
}) {
  const root = useRef<HTMLElement>(null)
  const media = useRef<HTMLDivElement>(null)

  useGSAP(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    gsap.fromTo('[data-hero-line]', { opacity: 0, y: 40 },
      { opacity: 1, y: 0, duration: 1, stagger: 0.15, ease: 'power3.out', delay: 0.2 })
    gsap.to(media.current, {
      yPercent: 18, scale: 1.08, ease: 'none',
      scrollTrigger: { trigger: root.current, start: 'top top', end: 'bottom top', scrub: true },
    })
  }, [])

  return (
    <section ref={root} className="relative flex h-[92svh] items-end overflow-hidden">
      <div ref={media} className="absolute inset-0">
        {mediaUrl && mediaType === 'video' ? (
          <video src={mediaUrl} autoPlay muted loop playsInline preload="metadata"
            className="h-full w-full object-cover" />
        ) : mediaUrl ? (
          <Image src={mediaUrl} alt="" fill priority sizes="100vw" className="object-cover" />
        ) : (
          <div className="h-full w-full" style={{ background: 'linear-gradient(160deg, var(--lp-primary), var(--lp-bg) 70%)' }} />
        )}
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, var(--lp-bg) 4%, transparent 60%)' }} />
      </div>
      <div className="relative z-10 mx-auto w-full max-w-4xl px-6 pb-16">
        <h1 data-hero-line className="text-5xl font-extrabold leading-tight md:text-7xl">{title}</h1>
        {subtitle && <p data-hero-line className="mt-4 max-w-xl text-lg opacity-85">{subtitle}</p>}
        <div data-hero-line className="mt-8 flex flex-wrap gap-3">
          {waPhone && (
            <a href={buildWaLink(waPhone, `Bonjour ${restaurantName} ! Je voudrais commander 🙏`)}
              className="rounded-full px-6 py-3 font-semibold text-white shadow-lg"
              style={{ backgroundColor: '#25D366' }}>
              💬 Commander sur WhatsApp
            </a>
          )}
          <a href="#carte" className="rounded-full border px-6 py-3 font-semibold"
            style={{ borderColor: 'var(--lp-accent)', color: 'var(--lp-accent)' }}>
            Voir la carte
          </a>
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Plats vedettes (glass cards) + carte + infos**

`apps/web/src/components/lp/Featured.tsx` :
```tsx
import Image from 'next/image'
import { formatFcfa } from '@goutatou/db/types'
import { Reveal } from './Reveal'
import type { LpMenuItem } from '@/lib/lp/data'

export function Featured({ items }: { items: LpMenuItem[] }) {
  if (!items.length) return null
  return (
    <section className="mx-auto max-w-5xl px-6 py-20">
      <Reveal><h2 className="mb-10 text-3xl font-bold md:text-4xl">Nos incontournables</h2></Reveal>
      <div className="grid gap-5 md:grid-cols-3">
        {items.map((it, i) => (
          <Reveal key={it.id} delay={i * 0.08}>
            <article className="overflow-hidden rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md">
              {it.photoUrl && (
                <div className="relative h-44">
                  <Image src={it.photoUrl} alt={it.name} fill sizes="(max-width: 768px) 100vw, 33vw" className="object-cover" />
                </div>
              )}
              <div className="p-5">
                <h3 className="text-lg font-semibold">{it.name}</h3>
                {it.description && <p className="mt-1 text-sm opacity-70">{it.description}</p>}
                <p className="mt-3 font-bold" style={{ color: 'var(--lp-accent)' }}>{formatFcfa(it.price)}</p>
              </div>
            </article>
          </Reveal>
        ))}
      </div>
    </section>
  )
}
```

`apps/web/src/components/lp/MenuSection.tsx` :
```tsx
'use client'
import { formatFcfa } from '@goutatou/db/types'
import { Reveal } from './Reveal'
import { useCart } from './CartProvider'
import type { LpData } from '@/lib/lp/data'

export function MenuSection({ categories }: { categories: LpData['categories'] }) {
  const { addItem } = useCart()
  return (
    <section id="carte" className="mx-auto max-w-3xl px-6 py-20">
      <Reveal><h2 className="mb-10 text-3xl font-bold md:text-4xl">La carte</h2></Reveal>
      {categories.map((cat) => (
        <Reveal key={cat.id} className="mb-10">
          <h3 className="mb-4 text-xl font-semibold uppercase tracking-wide" style={{ color: 'var(--lp-accent)' }}>
            {cat.name}
          </h3>
          <ul className="flex flex-col gap-4">
            {cat.items.map((it) => (
              <li key={it.id} className="flex items-center justify-between gap-4 border-b border-white/10 pb-3">
                <div>
                  <p className="font-medium">{it.name}</p>
                  {it.description && <p className="text-sm opacity-60">{it.description}</p>}
                </div>
                <div className="flex items-center gap-3">
                  <span className="whitespace-nowrap font-semibold">{formatFcfa(it.price)}</span>
                  <button onClick={() => addItem({ menuItemId: it.id, name: it.name, unitPrice: it.price })}
                    aria-label={`Ajouter ${it.name} au panier`}
                    className="rounded-full px-3 py-1 text-sm font-bold text-white"
                    style={{ backgroundColor: 'var(--lp-primary)' }}>
                    + Ajouter
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </Reveal>
      ))}
    </section>
  )
}
```

`apps/web/src/components/lp/Infos.tsx` :
```tsx
import { Reveal } from './Reveal'
import { buildWaLink } from '@/lib/lp/wa'
import type { LpConfig } from '@/lib/lp/config'

export function Infos({ infos, about, waPhone, name }: {
  infos: LpConfig['infos']; about: LpConfig['about']; waPhone: string | null; name: string
}) {
  return (
    <section className="mx-auto max-w-3xl px-6 pb-28 pt-4">
      {about && (
        <Reveal className="mb-14">
          <h2 className="mb-4 text-3xl font-bold">{about.title}</h2>
          <p className="leading-relaxed opacity-80">{about.text}</p>
        </Reveal>
      )}
      <Reveal>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-md">
          <h2 className="mb-4 text-xl font-bold">Infos pratiques</h2>
          {infos.address && <p className="opacity-80">📍 {infos.address}</p>}
          {infos.hours.map((h) => <p key={h} className="opacity-80">🕐 {h}</p>)}
          <div className="mt-5 flex flex-wrap gap-3">
            {waPhone && (
              <a href={buildWaLink(waPhone, `Bonjour ${name} !`)}
                className="rounded-full px-5 py-2 font-semibold text-white" style={{ backgroundColor: '#25D366' }}>
                💬 WhatsApp
              </a>
            )}
            {infos.mapsUrl && (
              <a href={infos.mapsUrl} target="_blank" rel="noopener noreferrer"
                className="rounded-full border px-5 py-2 font-semibold"
                style={{ borderColor: 'var(--lp-accent)', color: 'var(--lp-accent)' }}>
                🗺️ Itinéraire
              </a>
            )}
          </div>
        </div>
        <p className="mt-10 text-center text-xs opacity-40">Propulsé par Goutatou</p>
      </Reveal>
    </section>
  )
}
```

- [ ] **Step 3: Assembler la page**

`apps/web/src/app/r/[slug]/page.tsx` — remplacer le corps du composant :
```tsx
  return (
    <main className="min-h-screen">
      <Hero
        title={lp.config.hero.title}
        subtitle={lp.config.hero.subtitle}
        mediaUrl={lp.config.hero.mediaUrl}
        mediaType={lp.config.hero.mediaType}
        waPhone={lp.whatsappPhone}
        restaurantName={lp.name}
      />
      <Featured items={lp.featured} />
      <MenuSection categories={lp.categories} />
      <Infos infos={lp.config.infos} about={lp.config.about} waPhone={lp.whatsappPhone} name={lp.name} />
      <CartBar />
    </main>
  )
```
avec les imports correspondants (`Hero`, `Featured`, `MenuSection`, `Infos`, `CartBar`). `CartBar` n'existe pas encore : créer un stub `apps/web/src/components/lp/CartBar.tsx` (`export function CartBar() { return null }`) remplacé en T7. Le stub `CartProvider` de T5 doit exposer `useCart` avec `addItem` no-op :
```tsx
'use client'
import { createContext, useContext, type ReactNode } from 'react'
type CartApi = { addItem: (i: { menuItemId: string; name: string; unitPrice: number }) => void }
const Ctx = createContext<CartApi>({ addItem: () => {} })
export const useCart = () => useContext(Ctx)
export function CartProvider({ children }: { children: ReactNode; slug: string }) {
  return <Ctx.Provider value={{ addItem: () => {} }}>{children}</Ctx.Provider>
}
```

- [ ] **Step 4: Vérifier** — typecheck + build OK. Vérification visuelle locale : `pnpm --filter @goutatou/web dev`, publier temporairement un resto de test en local (`update restaurants set lp_config = '{"published": true}'` sur la stack locale) et ouvrir `http://localhost:3000/r/<slug>` — hero animé, sections en fade-up, carte lisible mobile (DevTools 375px).

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat(lp): sections hero/vedettes/carte/infos avec animations scroll et CTA WhatsApp"
```

---

### Task 7: Panier web — reducer testé + provider localStorage + barre sticky

**Files:**
- Create: `apps/web/src/lib/lp/cart.ts`
- Modify (remplace les stubs): `apps/web/src/components/lp/CartProvider.tsx`, `apps/web/src/components/lp/CartBar.tsx`
- Test: `apps/web/test/cart.test.ts`

**Interfaces:**
- Produces :
  - `interface WebCartItem { menuItemId: string; name: string; unitPrice: number; qty: number }`
  - `type CartAction = { type: 'add'; item: Omit<WebCartItem,'qty'> } | { type: 'remove'; menuItemId: string } | { type: 'setQty'; menuItemId: string; qty: number } | { type: 'clear' }`
  - `cartReducer(items: WebCartItem[], action: CartAction): WebCartItem[]` (pur ; `add` incrémente si présent ; `setQty` ≤ 0 supprime ; qty max 20)
  - `webCartTotal(items: WebCartItem[]): number`
  - `useCart(): { items; addItem; removeItem; setQty; clear; total; count }` — persisté dans `localStorage` clé `goutatou-cart-<slug>`.
  - `<CartBar/>` : barre sticky bas d'écran, visible si count > 0 : « 🛒 N plat(s) · X FCFA — Commander » → lien `/r/[slug]/commander`.

- [ ] **Step 1: Test du reducer (échoue d'abord)**

`apps/web/test/cart.test.ts` :
```ts
import { describe, expect, it } from 'vitest'
import { cartReducer, webCartTotal, type WebCartItem } from '../src/lib/lp/cart'

const bobun = { menuItemId: 'a', name: 'Bo Bun', unitPrice: 4500 }

describe('cartReducer', () => {
  it('add ajoute puis incrémente', () => {
    let s: WebCartItem[] = []
    s = cartReducer(s, { type: 'add', item: bobun })
    s = cartReducer(s, { type: 'add', item: bobun })
    expect(s).toEqual([{ ...bobun, qty: 2 }])
  })
  it('setQty ajuste et supprime à 0 ; plafonne à 20', () => {
    let s = cartReducer([], { type: 'add', item: bobun })
    s = cartReducer(s, { type: 'setQty', menuItemId: 'a', qty: 5 })
    expect(s[0].qty).toBe(5)
    s = cartReducer(s, { type: 'setQty', menuItemId: 'a', qty: 99 })
    expect(s[0].qty).toBe(20)
    s = cartReducer(s, { type: 'setQty', menuItemId: 'a', qty: 0 })
    expect(s).toEqual([])
  })
  it('remove et clear', () => {
    let s = cartReducer([], { type: 'add', item: bobun })
    expect(cartReducer(s, { type: 'remove', menuItemId: 'a' })).toEqual([])
    expect(cartReducer(s, { type: 'clear' })).toEqual([])
  })
  it('total', () => {
    const s = cartReducer(cartReducer([], { type: 'add', item: bobun }), { type: 'setQty', menuItemId: 'a', qty: 2 })
    expect(webCartTotal(s)).toBe(9000)
  })
})
```

- [ ] **Step 2: FAIL** — `pnpm --filter @goutatou/web test -- cart` — module absent.

- [ ] **Step 3: Implémenter le reducer**

`apps/web/src/lib/lp/cart.ts` :
```ts
export interface WebCartItem {
  menuItemId: string
  name: string
  unitPrice: number
  qty: number
}

export type CartAction =
  | { type: 'add'; item: Omit<WebCartItem, 'qty'> }
  | { type: 'remove'; menuItemId: string }
  | { type: 'setQty'; menuItemId: string; qty: number }
  | { type: 'clear' }

const MAX_QTY = 20

export function cartReducer(items: WebCartItem[], action: CartAction): WebCartItem[] {
  switch (action.type) {
    case 'add': {
      const existing = items.find((i) => i.menuItemId === action.item.menuItemId)
      if (existing) {
        return items.map((i) =>
          i.menuItemId === action.item.menuItemId ? { ...i, qty: Math.min(i.qty + 1, MAX_QTY) } : i)
      }
      return [...items, { ...action.item, qty: 1 }]
    }
    case 'remove':
      return items.filter((i) => i.menuItemId !== action.menuItemId)
    case 'setQty': {
      if (action.qty <= 0) return items.filter((i) => i.menuItemId !== action.menuItemId)
      return items.map((i) =>
        i.menuItemId === action.menuItemId ? { ...i, qty: Math.min(action.qty, MAX_QTY) } : i)
    }
    case 'clear':
      return []
  }
}

export function webCartTotal(items: WebCartItem[]): number {
  return items.reduce((sum, i) => sum + i.unitPrice * i.qty, 0)
}
```

- [ ] **Step 4: PASS** — 4 tests.

- [ ] **Step 5: Provider + barre (remplacent les stubs)**

`apps/web/src/components/lp/CartProvider.tsx` :
```tsx
'use client'
import { createContext, useContext, useEffect, useReducer, type ReactNode } from 'react'
import { cartReducer, webCartTotal, type CartAction, type WebCartItem } from '@/lib/lp/cart'

interface CartApi {
  items: WebCartItem[]
  addItem: (i: Omit<WebCartItem, 'qty'>) => void
  removeItem: (id: string) => void
  setQty: (id: string, qty: number) => void
  clear: () => void
  total: number
  count: number
  slug: string
}

const Ctx = createContext<CartApi | null>(null)

export function useCart(): CartApi {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useCart doit être utilisé sous <CartProvider>')
  return ctx
}

export function CartProvider({ children, slug }: { children: ReactNode; slug: string }) {
  const key = `goutatou-cart-${slug}`
  const [items, dispatch] = useReducer(
    (s: WebCartItem[], a: CartAction) => cartReducer(s, a),
    [],
    () => {
      if (typeof window === 'undefined') return []
      try { return JSON.parse(window.localStorage.getItem(key) ?? '[]') as WebCartItem[] } catch { return [] }
    },
  )
  useEffect(() => {
    try { window.localStorage.setItem(key, JSON.stringify(items)) } catch { /* stockage plein/privé */ }
  }, [items, key])

  return (
    <Ctx.Provider value={{
      items,
      addItem: (item) => dispatch({ type: 'add', item }),
      removeItem: (menuItemId) => dispatch({ type: 'remove', menuItemId }),
      setQty: (menuItemId, qty) => dispatch({ type: 'setQty', menuItemId, qty }),
      clear: () => dispatch({ type: 'clear' }),
      total: webCartTotal(items),
      count: items.reduce((n, i) => n + i.qty, 0),
      slug,
    }}>
      {children}
    </Ctx.Provider>
  )
}
```

`apps/web/src/components/lp/CartBar.tsx` :
```tsx
'use client'
import Link from 'next/link'
import { formatFcfa } from '@goutatou/db/types'
import { useCart } from './CartProvider'

export function CartBar() {
  const { count, total, slug } = useCart()
  if (count === 0) return null
  return (
    <div className="fixed inset-x-0 bottom-0 z-50 p-3">
      <Link href={`/r/${slug}/commander`}
        className="mx-auto flex max-w-md items-center justify-between rounded-full px-6 py-3 font-semibold text-white shadow-2xl"
        style={{ backgroundColor: 'var(--lp-primary)' }}>
        <span>🛒 {count} plat{count > 1 ? 's' : ''} · {formatFcfa(total)}</span>
        <span>Commander →</span>
      </Link>
    </div>
  )
}
```

Note SSR/hydratation : l'initialisation lazy du reducer lit localStorage côté client uniquement ; en SSR elle renvoie `[]`. Pour éviter un mismatch d'hydratation, `CartBar` peut rendre `null` au premier rendu via un `useEffect` de montage si un warning apparaît — à traiter si le build/console le signale (le noter dans le rapport le cas échéant).

- [ ] **Step 6: Vérifier** — tests + typecheck + build OK ; en local : ajouter 2 plats → la barre affiche le total, persiste au rechargement.

- [ ] **Step 7: Commit**

```bash
git add apps/web
git commit -m "feat(lp): panier web (reducer testé, persistance localStorage, barre sticky)"
```

---

### Task 8: API `POST /api/lp/[slug]/order` — création de commande web

**Files:**
- Create: `apps/web/src/app/api/lp/[slug]/order/route.ts`, `apps/web/src/lib/lp/order-validation.ts`
- Test: `apps/web/test/order-validation.test.ts`

**Interfaces:**
- Consumes: `createAdminClient`, `normalizeGabonPhone` (T2), RPC `create_order` (service_role only — OK ici), `WhapiClient` + `decryptToken` (confirmation best-effort).
- Produces :
  - `interface WebOrderPayload { customerName: string; phone: string; mode: 'drive' | 'livraison' | 'sur_place'; driveSlotId?: string; address?: string; items: { menuItemId: string; qty: number }[] }`
  - `validateWebOrder(body: unknown): { ok: true; payload: WebOrderPayload & { phone: string } } | { ok: false; error: string }` — pur, testé : nom ≥ 2 car., téléphone normalisable, 1–15 items, qty 1–20 int, mode valide, `driveSlotId` requis si drive, `address` ≥ 5 car. si livraison.
  - Route handler : résout le resto par slug (publié), vérifie que le `driveSlotId` appartient au resto, upsert `customers` (phone → `chat_id = phone@s.whatsapp.net`), RPC `create_order` (source `web`), envoie la confirmation WhatsApp best-effort (échec ⇒ loggé, pas bloquant), répond `{ orderNumber, total }` ou `{ error }` (400/404/500). `export const runtime = 'nodejs'`.

- [ ] **Step 1: Test de validation (échoue d'abord)**

`apps/web/test/order-validation.test.ts` :
```ts
import { describe, expect, it } from 'vitest'
import { validateWebOrder } from '../src/lib/lp/order-validation'

const valid = {
  customerName: 'Franck',
  phone: '077123456',
  mode: 'drive',
  driveSlotId: 'slot-1',
  items: [{ menuItemId: 'a', qty: 2 }],
}

describe('validateWebOrder', () => {
  it('accepte un payload drive valide et normalise le téléphone', () => {
    const r = validateWebOrder(valid)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.payload.phone).toBe('24177123456')
  })
  it('exige le créneau en drive et l’adresse en livraison', () => {
    expect(validateWebOrder({ ...valid, driveSlotId: undefined }).ok).toBe(false)
    expect(validateWebOrder({ ...valid, mode: 'livraison', address: 'ici' }).ok).toBe(false)
    expect(validateWebOrder({ ...valid, mode: 'livraison', address: 'Quartier Glass, LBV' }).ok).toBe(true)
  })
  it('rejette téléphone invalide, panier vide, qty hors bornes', () => {
    expect(validateWebOrder({ ...valid, phone: '12' }).ok).toBe(false)
    expect(validateWebOrder({ ...valid, items: [] }).ok).toBe(false)
    expect(validateWebOrder({ ...valid, items: [{ menuItemId: 'a', qty: 0 }] }).ok).toBe(false)
    expect(validateWebOrder({ ...valid, items: [{ menuItemId: 'a', qty: 21 }] }).ok).toBe(false)
    expect(validateWebOrder({ ...valid, items: [{ menuItemId: 'a', qty: 1.5 }] }).ok).toBe(false)
  })
  it('rejette non-objet et nom trop court', () => {
    expect(validateWebOrder(null).ok).toBe(false)
    expect(validateWebOrder({ ...valid, customerName: 'F' }).ok).toBe(false)
  })
})
```

- [ ] **Step 2: FAIL** puis **Step 3: Implémenter la validation**

`apps/web/src/lib/lp/order-validation.ts` :
```ts
import { normalizeGabonPhone } from './wa'

export interface WebOrderPayload {
  customerName: string
  phone: string
  mode: 'drive' | 'livraison' | 'sur_place'
  driveSlotId?: string
  address?: string
  items: { menuItemId: string; qty: number }[]
}

type Result = { ok: true; payload: WebOrderPayload } | { ok: false; error: string }

export function validateWebOrder(body: unknown): Result {
  if (body === null || typeof body !== 'object') return { ok: false, error: 'Requête invalide.' }
  const b = body as Record<string, unknown>

  const customerName = typeof b.customerName === 'string' ? b.customerName.trim() : ''
  if (customerName.length < 2) return { ok: false, error: 'Indiquez votre nom.' }

  const phone = typeof b.phone === 'string' ? normalizeGabonPhone(b.phone) : null
  if (!phone) return { ok: false, error: 'Numéro WhatsApp invalide (ex. 077 12 34 56).' }

  const mode = b.mode
  if (mode !== 'drive' && mode !== 'livraison' && mode !== 'sur_place') {
    return { ok: false, error: 'Mode de récupération invalide.' }
  }

  const driveSlotId = typeof b.driveSlotId === 'string' && b.driveSlotId ? b.driveSlotId : undefined
  if (mode === 'drive' && !driveSlotId) return { ok: false, error: 'Choisissez un créneau de retrait.' }

  const address = typeof b.address === 'string' ? b.address.trim() : undefined
  if (mode === 'livraison' && (!address || address.length < 5)) {
    return { ok: false, error: 'Indiquez votre adresse de livraison.' }
  }

  const rawItems = Array.isArray(b.items) ? b.items : []
  const items: { menuItemId: string; qty: number }[] = []
  for (const it of rawItems) {
    const o = it as Record<string, unknown>
    if (typeof o?.menuItemId !== 'string' || typeof o?.qty !== 'number') return { ok: false, error: 'Panier invalide.' }
    if (!Number.isInteger(o.qty) || o.qty < 1 || o.qty > 20) return { ok: false, error: 'Quantité invalide.' }
    items.push({ menuItemId: o.menuItemId, qty: o.qty })
  }
  if (items.length < 1 || items.length > 15) return { ok: false, error: 'Votre panier est vide.' }

  return { ok: true, payload: { customerName, phone, mode, driveSlotId, address, items } }
}
```

- [ ] **Step 4: PASS** — `pnpm --filter @goutatou/web test -- order-validation`.

- [ ] **Step 5: Route handler**

`apps/web/src/app/api/lp/[slug]/order/route.ts` :
```ts
import { NextResponse } from 'next/server'
import { formatFcfa } from '@goutatou/db/types'
import { decryptToken } from '@goutatou/db/crypto'
import { WhapiClient } from '@goutatou/whapi'
import { createAdminClient } from '@/lib/supabase/admin'
import { parseLpConfig } from '@/lib/lp/config'
import { validateWebOrder } from '@/lib/lp/order-validation'

export const runtime = 'nodejs'

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const body = await req.json().catch(() => null)
  const v = validateWebOrder(body)
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
  const p = v.payload

  const db = createAdminClient()
  const { data: resto } = await db
    .from('restaurants')
    .select('id, name, lp_config, drive_enabled, whapi_channels(token_encrypted, status)')
    .eq('slug', slug)
    .maybeSingle()
  if (!resto || !parseLpConfig(resto.lp_config, resto.name).published) {
    return NextResponse.json({ error: 'Restaurant introuvable.' }, { status: 404 })
  }
  if (p.mode === 'drive') {
    if (!resto.drive_enabled) return NextResponse.json({ error: 'Le drive est indisponible.' }, { status: 400 })
    const { data: slot } = await db.from('drive_slots').select('id')
      .eq('id', p.driveSlotId!).eq('restaurant_id', resto.id).eq('active', true).maybeSingle()
    if (!slot) return NextResponse.json({ error: 'Créneau invalide.' }, { status: 400 })
  }

  const chatId = `${p.phone}@s.whatsapp.net`
  const { data: customer, error: custErr } = await db
    .from('customers')
    .upsert(
      { restaurant_id: resto.id, phone: p.phone, chat_id: chatId, name: p.customerName },
      { onConflict: 'restaurant_id,phone' },
    )
    .select('id')
    .single()
  if (custErr || !customer) return NextResponse.json({ error: 'Erreur interne.' }, { status: 500 })

  const { data: order, error: orderErr } = await db.rpc('create_order', {
    p_restaurant_id: resto.id,
    p_customer_id: customer.id,
    p_source: 'web',
    p_mode: p.mode,
    p_items: p.items.map((i) => ({ menu_item_id: i.menuItemId, qty: i.qty })),
    p_drive_slot_id: p.driveSlotId ?? null,
    p_delivery_address: p.address ?? null,
  })
  if (orderErr || !order?.[0]) {
    console.error('[lp-order] create_order', orderErr)
    return NextResponse.json({ error: 'Commande impossible (plats indisponibles ?).' }, { status: 500 })
  }
  const { order_number: orderNumber, total } = order[0] as { order_number: number; total: number }

  // Confirmation WhatsApp best-effort : l'échec n'annule pas la commande.
  const channel = resto.whapi_channels as unknown as { token_encrypted: string; status: string } | null
  if (channel?.status === 'active') {
    try {
      const whapi = new WhapiClient(decryptToken(channel.token_encrypted, process.env.TOKEN_ENCRYPTION_KEY!))
      await whapi.sendText(chatId,
        `✅ ${p.customerName}, votre commande *n°${orderNumber}* chez ${resto.name} est confirmée !\n` +
        `Total à régler à la remise : *${formatFcfa(total)}*\n\n` +
        `Nous vous préviendrons ici à chaque étape. 🙏`)
    } catch (err) {
      console.error('[lp-order] confirmation WhatsApp échouée', err)
    }
  }

  return NextResponse.json({ orderNumber, total })
}
```

- [ ] **Step 6: Vérifier** — typecheck + build (la route apparaît). Test manuel local (stack Supabase locale + resto seedé publié) :
```bash
curl -s -X POST http://localhost:3000/api/lp/<slug>/order -H 'Content-Type: application/json' \
  -d '{"customerName":"Test","phone":"077123456","mode":"sur_place","items":[{"menuItemId":"<uuid-plat>","qty":1}]}'
```
Expected: `{"orderNumber":1,"total":<prix>}` et la commande visible dans le kanban local.

- [ ] **Step 7: Commit**

```bash
git add apps/web
git commit -m "feat(lp): API commande web — validation testée, create_order source web, confirmation WhatsApp best-effort"
```

---

### Task 9: Checkout `/r/[slug]/commander` + confirmation `/merci`

**Files:**
- Create: `apps/web/src/app/r/[slug]/commander/page.tsx`, `apps/web/src/app/r/[slug]/merci/page.tsx`

**Interfaces:**
- Consumes: `useCart` (T7), `getLpData` (T4 — pour les créneaux drive côté serveur), API T8.
- Produces: page checkout (server component qui charge `driveSlots`/`driveEnabled` et rend un form client), soumission → POST API → `clear()` panier → redirection `/r/[slug]/merci?n=<orderNumber>&t=<total>`.

- [ ] **Step 1: Page checkout**

`apps/web/src/app/r/[slug]/commander/page.tsx` :
```tsx
import { notFound } from 'next/navigation'
import { getLpData } from '@/lib/lp/data'
import { CheckoutForm } from './form'

export const dynamic = 'force-dynamic'

export default async function CommanderPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const lp = await getLpData(slug)
  if (!lp) notFound()
  return (
    <main className="mx-auto max-w-md px-6 py-12">
      <h1 className="mb-8 text-3xl font-bold">Votre commande</h1>
      <CheckoutForm slug={slug} driveEnabled={lp.driveEnabled} driveSlots={lp.driveSlots} />
    </main>
  )
}
```

`apps/web/src/app/r/[slug]/commander/form.tsx` :
```tsx
'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { formatFcfa } from '@goutatou/db/types'
import { useCart } from '@/components/lp/CartProvider'

export function CheckoutForm({ slug, driveEnabled, driveSlots }: {
  slug: string; driveEnabled: boolean; driveSlots: { id: string; label: string }[]
}) {
  const router = useRouter()
  const { items, setQty, total, clear } = useCart()
  const [mode, setMode] = useState<'drive' | 'livraison' | 'sur_place'>(driveEnabled ? 'drive' : 'sur_place')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setPending(true); setError(null)
    const fd = new FormData(e.currentTarget)
    const res = await fetch(`/api/lp/${slug}/order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerName: fd.get('name'),
        phone: fd.get('phone'),
        mode,
        driveSlotId: fd.get('slot') || undefined,
        address: fd.get('address') || undefined,
        items: items.map((i) => ({ menuItemId: i.menuItemId, qty: i.qty })),
      }),
    })
    const json = await res.json().catch(() => ({}))
    setPending(false)
    if (!res.ok) { setError(json.error ?? 'Une erreur est survenue.'); return }
    clear()
    router.push(`/r/${slug}/merci?n=${json.orderNumber}&t=${json.total}`)
  }

  if (items.length === 0) {
    return <p className="opacity-70">Votre panier est vide. <a className="underline" href={`/r/${slug}#carte`}>Voir la carte</a></p>
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <ul className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
        {items.map((it) => (
          <li key={it.menuItemId} className="flex items-center justify-between gap-3">
            <span>{it.name}</span>
            <span className="flex items-center gap-2">
              <button type="button" aria-label="Moins" onClick={() => setQty(it.menuItemId, it.qty - 1)}
                className="h-7 w-7 rounded-full border border-white/30">−</button>
              <span className="w-6 text-center">{it.qty}</span>
              <button type="button" aria-label="Plus" onClick={() => setQty(it.menuItemId, it.qty + 1)}
                className="h-7 w-7 rounded-full border border-white/30">+</button>
              <span className="ml-2 w-24 text-right font-semibold">{formatFcfa(it.unitPrice * it.qty)}</span>
            </span>
          </li>
        ))}
        <li className="flex justify-between border-t border-white/10 pt-3 font-bold">
          <span>Total</span><span>{formatFcfa(total)}</span>
        </li>
      </ul>

      <input name="name" required minLength={2} placeholder="Votre nom"
        className="rounded-xl border border-white/20 bg-transparent p-3" />
      <input name="phone" required placeholder="Numéro WhatsApp (ex. 077 12 34 56)" inputMode="tel"
        className="rounded-xl border border-white/20 bg-transparent p-3" />

      <div className="flex gap-2">
        {([['drive', '🚗 Drive'], ['livraison', '🛵 Livraison'], ['sur_place', '🍽️ Sur place']] as const)
          .filter(([m]) => m !== 'drive' || driveEnabled)
          .map(([m, label]) => (
            <button key={m} type="button" onClick={() => setMode(m)}
              className="flex-1 rounded-xl border p-2 text-sm"
              style={mode === m
                ? { backgroundColor: 'var(--lp-primary)', borderColor: 'var(--lp-primary)', color: '#fff' }
                : { borderColor: 'rgba(255,255,255,0.2)' }}>
              {label}
            </button>
          ))}
      </div>

      {mode === 'drive' && (
        <select name="slot" required className="rounded-xl border border-white/20 bg-transparent p-3">
          <option value="">Choisissez un créneau de retrait</option>
          {driveSlots.map((s) => <option key={s.id} value={s.id} className="text-black">{s.label}</option>)}
        </select>
      )}
      {mode === 'livraison' && (
        <input name="address" required minLength={5} placeholder="Adresse (quartier + repère)"
          className="rounded-xl border border-white/20 bg-transparent p-3" />
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}
      <button disabled={pending}
        className="rounded-xl p-3 font-bold text-white disabled:opacity-50"
        style={{ backgroundColor: 'var(--lp-primary)' }}>
        {pending ? 'Envoi…' : `Confirmer — ${formatFcfa(total)} à la remise`}
      </button>
      <p className="text-center text-xs opacity-50">Paiement à la remise (espèces ou Mobile Money au comptoir).</p>
    </form>
  )
}
```

- [ ] **Step 2: Page merci**

`apps/web/src/app/r/[slug]/merci/page.tsx` :
```tsx
import Link from 'next/link'
import { formatFcfa } from '@goutatou/db/types'

export default async function MerciPage({ params, searchParams }: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ n?: string; t?: string }>
}) {
  const { slug } = await params
  const { n, t } = await searchParams
  return (
    <main className="mx-auto flex min-h-[70svh] max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-6xl">✅</p>
      <h1 className="text-3xl font-bold">Commande n°{n} confirmée !</h1>
      {t && <p className="opacity-80">Total à régler à la remise : <strong>{formatFcfa(Number(t))}</strong></p>}
      <p className="opacity-70">Vous recevrez le suivi de votre commande sur WhatsApp. 🙏</p>
      <Link href={`/r/${slug}`} className="mt-4 underline opacity-70">← Retour à la carte</Link>
    </main>
  )
}
```

- [ ] **Step 3: Vérifier** — typecheck + build ; parcours local complet : ajouter des plats → Commander → formulaire → confirmation → commande dans le kanban local, quantités ajustables, erreurs de validation affichées (téléphone invalide).

- [ ] **Step 4: Commit**

```bash
git add apps/web
git commit -m "feat(lp): tunnel de commande web (checkout, création via API, page de confirmation)"
```

---

### Task 10: Admin — éditeur de LP (`/admin/lp/[restaurantId]`)

**Files:**
- Create: `apps/web/src/app/admin/lp/[restaurantId]/{page.tsx, actions.ts}`
- Modify: `apps/web/src/app/admin/page.tsx` (lien « Configurer la LP » sur chaque fiche)

**Interfaces:**
- Consumes: `createAdminClient`, `parseLpConfig` (affichage des valeurs actuelles), bucket `lp-media` (T3), garde `assertPlatformAdmin` (réutiliser celle de `admin/actions.ts` — l'exporter si besoin).
- Produces: server actions `updateLpConfig(restaurantId, formData)` (fusionne les champs du form dans `lp_config` : published, hero title/subtitle, theme 4 couleurs + font, about, infos address/hours (textarea 1/ligne)/mapsUrl, whatsappPhone, featuredIds (checkboxes des plats)) et `uploadHeroMedia(restaurantId, formData)` (upload fichier → `lp-media/<restaurantId>/hero-<ts>-<safeName>`, MAJ `lp_config.hero.mediaUrl` + `mediaType` selon le MIME image/video). Après update : `revalidatePath('/r/[slug]', 'layout')` du slug concerné + `revalidatePath('/admin')`.

- [ ] **Step 1: Actions** — même patron de sécurité que `admin/actions.ts` (assertPlatformAdmin en tête de CHAQUE action, filename sanitisé comme en T14 phase 1). Fusion : lire `lp_config` actuel, `{ ...current, ...patch }` champ à champ (pas d'écrasement aveugle des clés absentes du form).

- [ ] **Step 2: Page** — form pré-rempli depuis `parseLpConfig` : inputs couleurs (`type="color"`), textes, textarea horaires, upload hero (form séparé), liste des plats avec checkboxes `featuredIds` (max 4 côté action), toggle `published`, et lien de prévisualisation `https://goutatou.netlify.app/r/<slug>` (ouvert dans un nouvel onglet).

- [ ] **Step 3: Lien depuis la liste** — dans `admin/page.tsx`, à côté de « Configurer le webhook » : `<Link href={'/admin/lp/' + r.id}>Configurer la LP</Link>`.

- [ ] **Step 4: Vérifier** — typecheck + build ; en local : éditer couleurs + titre + publier → `/r/<slug>` reflète le thème après revalidation (ou dans les 120 s).

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat(admin): éditeur de landing page (thème, hero, sections, publication)"
```

---

### Task 11: Middleware — sous-domaines `{slug}.<domaine>` → `/r/[slug]`

**Files:**
- Modify: `apps/web/src/middleware.ts`
- Create: `apps/web/src/lib/lp/host.ts`
- Test: `apps/web/test/host.test.ts`

**Interfaces:**
- Produces: `resolveHostSlug(host: string, rootDomain: string): string | null` (pur, testé) — `chez-mama.goutatou.com` → `chez-mama` ; `goutatou.com`, `www.goutatou.com`, `goutatou.netlify.app`, hosts vides/étrangers → `null`. Le middleware : si `resolveHostSlug(host, process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? '')` retourne un slug et que le chemin ne commence pas par `/r/`, `/api/`, `/_next/`, réécrire vers `/r/<slug><pathname>`. Le matcher du middleware passe à `['/((?!_next|favicon.ico).*)']` en conservant la garde auth existante pour `/app` et `/admin` (la logique actuelle reste, la réécriture s'ajoute AVANT).

- [ ] **Step 1: Test (échoue d'abord)**

`apps/web/test/host.test.ts` :
```ts
import { describe, expect, it } from 'vitest'
import { resolveHostSlug } from '../src/lib/lp/host'

describe('resolveHostSlug', () => {
  it('extrait le slug du sous-domaine du domaine racine', () => {
    expect(resolveHostSlug('chez-mama.goutatou.com', 'goutatou.com')).toBe('chez-mama')
    expect(resolveHostSlug('chez-mama.goutatou.com:443', 'goutatou.com')).toBe('chez-mama')
  })
  it('null pour apex, www, netlify, domaines étrangers, rootDomain vide', () => {
    expect(resolveHostSlug('goutatou.com', 'goutatou.com')).toBeNull()
    expect(resolveHostSlug('www.goutatou.com', 'goutatou.com')).toBeNull()
    expect(resolveHostSlug('goutatou.netlify.app', 'goutatou.com')).toBeNull()
    expect(resolveHostSlug('evil.com', 'goutatou.com')).toBeNull()
    expect(resolveHostSlug('a.b.goutatou.com', 'goutatou.com')).toBeNull()
    expect(resolveHostSlug('chez-mama.goutatou.com', '')).toBeNull()
  })
})
```

- [ ] **Step 2: FAIL** puis **Step 3: Implémenter**

`apps/web/src/lib/lp/host.ts` :
```ts
export function resolveHostSlug(host: string, rootDomain: string): string | null {
  if (!rootDomain) return null
  const h = host.split(':')[0].toLowerCase()
  if (!h.endsWith(`.${rootDomain}`)) return null
  const sub = h.slice(0, -(rootDomain.length + 1))
  if (!sub || sub === 'www' || sub.includes('.')) return null
  return /^[a-z0-9-]{2,40}$/.test(sub) ? sub : null
}
```

Dans `apps/web/src/middleware.ts`, en tête de `middleware()` (avant la logique auth existante) :
```ts
import { resolveHostSlug } from '@/lib/lp/host'
// ...
const slug = resolveHostSlug(request.headers.get('host') ?? '', process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? '')
if (slug && !request.nextUrl.pathname.startsWith('/r/') && !request.nextUrl.pathname.startsWith('/api/')) {
  const url = request.nextUrl.clone()
  url.pathname = `/r/${slug}${request.nextUrl.pathname === '/' ? '' : request.nextUrl.pathname}`
  return NextResponse.rewrite(url)
}
```
et élargir `config.matcher` à `['/((?!_next/static|_next/image|favicon.ico).*)']` — la garde auth existante reste inchangée derrière (elle ne s'applique qu'aux chemins `/app`/`/admin`, vérifier que le test de chemin actuel est bien conservé).

- [ ] **Step 4: Vérifier** — tests PASS ; typecheck + build ; la garde `/app`/`/admin` fonctionne toujours en local (redirection /login). Sans `NEXT_PUBLIC_ROOT_DOMAIN` défini, comportement strictement identique à avant (slug toujours null).

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat(lp): réécriture sous-domaine wildcard -> /r/[slug] (activable via NEXT_PUBLIC_ROOT_DOMAIN)"
```

---

### Task 12: Déploiement + smoke test E2E

**Files:**
- Modify: `docs/deploiement.md`, `.env.example`

**Interfaces:**
- Consumes: tout ; MCP Supabase (migration 0007 en prod — fait en T3 Step 3 si pas déjà), Netlify auto-deploy (push main).

- [ ] **Step 1: Env & doc**
- `.env.example` : ajouter `NEXT_PUBLIC_ROOT_DOMAIN=` (vide par défaut, commentaire : « domaine custom wildcard, ex. goutatou.com — laisser vide sur netlify.app »).
- `docs/deploiement.md` : section « Landing pages (phase 2) » — URL canonique `/r/<slug>`, procédure domaine custom (acheter le domaine → Netlify DNS → domain alias `*.goutatou.com` → poser `NEXT_PUBLIC_ROOT_DOMAIN` → redeploy), configuration LP dans `/admin/lp/<id>`, et le fait que la commande web crée les commandes dans le même kanban.

- [ ] **Step 2: Pousser et laisser Netlify déployer** — `git push origin main`, attendre le deploy, vérifier `https://goutatou.netlify.app/r/<slug-inexistant>` → 404.

- [ ] **Step 3: Smoke test prod** (nécessite un resto onboardé avec canal Whapi connecté) :
1. `/admin/lp/<id>` : uploader un hero, choisir les couleurs, publier.
2. `https://goutatou.netlify.app/r/<slug>` : hero animé, carte, CTA WhatsApp ouvre wa.me avec le texte pré-rempli.
3. Ajouter 2 plats → Commander → formulaire (numéro WhatsApp réel) → confirmation n° affichée.
4. Vérifier : commande visible dans le kanban `/app/commandes` (source web), message WhatsApp de confirmation reçu, notifications de statut reçues quand le resto avance la commande.
5. Lighthouse mobile sur la LP : performance ≥ 80, LCP < 3 s (sinon, noter les actions dans le rapport).

- [ ] **Step 4: Commit + doc**

```bash
git add docs/deploiement.md .env.example
git commit -m "docs: déploiement LP phase 2 (routes /r, domaine wildcard, smoke test)"
```

---

## Self-Review (fait à la rédaction)

- **Couverture spec phase 2** : template unique paramétrable (T1+T10), scroll-motion GSAP/Lenis + grain/vignette/glass cards (T5-T6), résolution par sous-domaine prête + chemin canonique (T11), CTA wa.me pré-rempli (T2+T6), tunnel de commande web → même pipeline `orders` (T7-T9), SSR/ISR mobile (T5), config LP par l'admin sans redéploiement (T10). Hors périmètre conservé : roue/fidélité (phase 3), campagnes/Meta (phase 4), génération vidéo hero (peut se faire plus tard via le pipeline Higgsfield/Seedance — le champ `mediaUrl` accepte n'importe quelle URL publique).
- **Placeholders** : T10 décrit les actions sans code intégral (formulaire admin volumineux, patron identique aux actions T14/T15 de la phase 1 déjà en repo — le brief renvoie explicitement à ces fichiers comme modèle) ; tout le reste porte le code complet.
- **Cohérence de types** : `LpConfig`/`LpData`/`WebCartItem`/`WebOrderPayload` définis une fois (T1, T4, T7, T8) et consommés par référence ; `create_order` appelée avec la même signature qu'en phase 1 ; stubs T5/T6 remplacés à l'identique (même chemin, même export) en T7.
- **Sécurité** : service-role confiné aux fichiers server-only ; `create_order` reste service_role-only (l'API T8 est côté serveur) ; bucket `lp-media` reprend les policies durcies de la phase 1 (pas de listing, écriture tenant-scopée) ; validation serveur systématique du payload web (prix relus en base par la RPC).
