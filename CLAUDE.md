# Guía para agentes

- Monorepo pnpm (`node-linker=hoisted`): `apps/mobile` (Expo SDK 58, Expo Router con rutas en `src/app/`), `packages/core` (lógica pura), `supabase/`.
- Toda la lógica de cálculo (P&L, métricas, planes, CSV) vive en `packages/core` con pruebas Vitest. No duplicarla en la app ni en las Edge Functions.
- `packages/core` usa imports con extensión `.ts` para que Deno (Edge Functions) lo pueda consumir. Antes de servir o desplegar funciones: `node scripts/sync-core.mjs`.
- Los límites del plan Gratis están en `packages/core/src/plans.ts` y replicados en los triggers de `supabase/migrations`. Mantener ambos en sintonía.
- Expo: instalar paquetes nativos con `npx expo install` (o `EXPO_OFFLINE=1 npx expo install` si no hay acceso a la API de Expo). Las tabs se importan de `expo-router/js-tabs`. Archivos con `File`/`Paths` de `expo-file-system` (API nueva).
- Textos de la interfaz: siempre por `i18n` (`apps/mobile/src/i18n/{es,en,pt}.ts`, español neutro con tuteo). `en` y `pt` están tipados contra `es`.
- Verificar antes de terminar: `pnpm -r typecheck`, `pnpm --filter @my-finance/core test`, `pnpm --filter mobile lint`, `./scripts/test-db.sh`.
