# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev      # Start development server
pnpm build    # Production build
pnpm start    # Start production server
pnpm lint     # Run ESLint
```

Package manager is **pnpm**. No test framework is configured.

## Project Overview

RVIntel is a Next.js 16 landing page / waitlist signup app for an RV rental market intelligence SaaS. It is currently a **static client-side page** — form submission is mocked with a timeout; there is no backend, API routes, or database.

## Architecture

- **App Router** (`/app`): `layout.tsx` (root metadata + fonts) and `page.tsx` (the entire landing page, ~500 lines, `"use client"`)
- **`/components/ui/`**: 59 shadcn/ui Radix-based primitives — treat as a library, not custom code
- **`/components/dashboard-preview.tsx`**: Self-contained mockup dashboard shown in the hero section
- **`/hooks/`**: `use-mobile.ts` (breakpoint detection), `use-toast.ts` (Sonner wrapper)
- **`/lib/utils.ts`**: `cn()` helper (clsx + tailwind-merge)

Path alias `@/` maps to the project root (e.g., `@/lib/utils`, `@/components/ui/button`).

## Design System (DESIGN.md)

The design system is called **"The Pristine Curator"** — editorial, gallery-like treatment of data. Key rules:

- **No borders for layout.** Use tonal background color shifts to define zones instead of `border` rules.
- **Glassmorphism** for floating elements: `surface_container_lowest` at 85% opacity + `backdrop-blur-[20px]`
- **Signature gradient** for primary CTAs: `linear-gradient(135deg, #006b5f, #2dd4bf)`
- **Ghost border** fallback (high-density data only): `border: 1px solid rgba(186, 202, 197, 0.2)`
- **No pure black** — use `on_surface` (`oklch(0.145 0.015 240)`) for text
- **Border radius:** strictly `0.25rem` (no 8px or 12px)
- **Primary teal:** `#2dd4bf` / `oklch(0.696 0.135 166)`
- **Typography scale:** Inter, exaggerated — 3.5rem Display, 1.5rem Headline, 0.875rem Body, 0.6875rem Label (all-caps, 0.05em tracking)
- **Ambient shadow** for floating components: `box-shadow: 0 12px 40px rgba(25, 28, 30, 0.06)`
- Never place two font sizes from the same category adjacent — use size jumps for hierarchy

## Key Config Notes

- `next.config.mjs`: TypeScript build errors are ignored (`ignoreBuildErrors: true`); images are unoptimized
- `components.json`: Shadcn style is `"new-york"`, icons are Lucide
- CSS uses **OKLCH color model** via CSS variables in `app/globals.css`
- Dark mode is supported via `.dark` class (next-themes)
