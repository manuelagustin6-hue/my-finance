# My Finance — portafolio consolidado

Aplicación móvil (iOS y Android) para consolidar en un solo lugar todas las inversiones de una persona —criptomonedas, acciones, ETF, bonos, fondos y efectivo— distribuidas en distintas billeteras, exchanges, brokers y bancos de cualquier país.

## Qué hace (MVP)

- **Valor consolidado** de la cartera en la moneda base elegida (USD, EUR, ARS, BRL, MXN, CLP, COP, etc.), con variación diaria.
- **Billeteras con esquema de comisiones** (porcentaje, monto fijo y mínimo). La comisión se precarga en cada operación y se puede editar.
- **P&L real por activo**: costo promedio ponderado con las comisiones de compra incluidas en el costo y las de venta descontadas del ingreso. Resultado realizado, no realizado, dividendos/intereses y comisiones pagadas.
- **Carga manual** de compras, ventas, depósitos, retiros, transferencias entre billeteras, dividendos, intereses/cupones, comisiones sueltas y splits.
- **Importación CSV** con detección automática: plantilla propia, Binance, Coinbase e Interactive Brokers (Flex Query). Detecta duplicados.
- **Ficha de cada activo** (aunque no se tenga): precio, gráfico, rendimiento por período, volatilidad anualizada, máxima caída, máximos/mínimos de 52 semanas; para acciones, estados financieros trimestrales y enlaces a las presentaciones.
- **Análisis del portafolio**: evolución del valor, rendimiento ponderado por tiempo, desvío (volatilidad) y máxima caída; distribución por tipo de activo, país, moneda y billetera.
- **Activos personalizados** con precio manual (bonos locales, plazos fijos, etc.).
- **Freemium**: plan Gratis con límites y plan Pro por suscripción (RevenueCat).
- Idiomas: español, inglés y portugués. Tema claro y oscuro.

### Plan Gratis vs. Pro

| Función | Gratis | Pro |
|---|---|---|
| Billeteras | 2 | Ilimitadas |
| Activos en cartera | 15 | Ilimitados |
| Carga manual, valor consolidado y P&L con comisiones | Sí | Sí |
| Historia de precios | 1 año | Completa |
| Importaciones CSV | 1 | Ilimitadas |
| Análisis del portafolio | — | Sí |
| Balances y presentaciones | — | Sí |
| Exportación de datos | — | Sí |

Los límites están definidos en un único lugar: `packages/core/src/plans.ts`, y se replican en la base de datos (triggers en la migración) para que no se puedan saltear desde el cliente.

## Estructura

```
apps/mobile/        App Expo (React Native + Expo Router, TypeScript)
packages/core/      Lógica de negocio pura y testeada (P&L, métricas, planes, CSV, datos de mercado)
supabase/
  migrations/       Esquema Postgres con Row Level Security y límites del plan Gratis
  functions/        Edge Functions: `market` (datos de mercado) y `revenuecat-webhook` (suscripciones)
  tests/            Pruebas SQL de RLS y límites
scripts/            Utilidades (pruebas de base de datos, sincronización del núcleo con las funciones)
```

`packages/core` es la fuente única de los cálculos: la usan la app y las Edge Functions.

## Modos de funcionamiento

- **Modo demo** (sin variables de entorno): los datos se guardan en el dispositivo y las cotizaciones son **simuladas** (catálogo de ~50 activos de EE. UU., Argentina, Brasil, México, Chile, Colombia, Europa y Japón). Desde Ajustes se puede simular el plan Pro.
- **Modo nube**: con un proyecto de Supabase configurado, cada usuario tiene su cuenta y sus datos sincronizados entre dispositivos.

> Los proveedores reales de datos de mercado todavía no están definidos. Todo pasa por la interfaz `MarketDataProvider` (`packages/core/src/market/provider.ts`); para sumar uno se implementa esa interfaz y se registra en `buildProvider()` dentro de `supabase/functions/market/index.ts`. La app no necesita cambios.

## Cómo correrlo

Requisitos: Node 22 y pnpm 10.

```bash
pnpm install
pnpm --filter mobile start      # abre Expo (iOS, Android o web)
```

Pruebas y verificaciones:

```bash
pnpm --filter @my-finance/core test   # 63 pruebas del motor de cálculo
pnpm -r typecheck
pnpm --filter mobile lint
./scripts/test-db.sh                  # migraciones, RLS y límites (requiere Docker)
```

## Configurar el modo nube (Supabase)

1. Crear un proyecto en [Supabase](https://supabase.com).
2. Aplicar la migración: `npx supabase link --project-ref <ref>` y `npx supabase db push`.
3. Sincronizar el núcleo y desplegar funciones:
   ```bash
   node scripts/sync-core.mjs
   npx supabase functions deploy market
   npx supabase functions deploy revenuecat-webhook
   npx supabase secrets set REVENUECAT_WEBHOOK_SECRET=<secreto>
   ```
4. Copiar `apps/mobile/.env.example` a `apps/mobile/.env.local` y completar `EXPO_PUBLIC_SUPABASE_URL` y `EXPO_PUBLIC_SUPABASE_ANON_KEY`.

## Configurar los pagos (RevenueCat)

1. Crear los productos de suscripción (mensual y anual) en App Store Connect y Google Play Console.
2. En [RevenueCat](https://www.revenuecat.com): crear el proyecto, vincular ambas tiendas, crear el entitlement **`pro`** y una *offering* actual con los paquetes mensual y anual (opcionalmente con prueba gratuita).
3. Completar `EXPO_PUBLIC_REVENUECAT_IOS_KEY` y `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY`.
4. En RevenueCat → Integrations → Webhooks: URL `https://<proyecto>.supabase.co/functions/v1/revenuecat-webhook` con el encabezado `Authorization: Bearer <REVENUECAT_WEBHOOK_SECRET>`.

La app usa el id de usuario de Supabase como *App User ID* de RevenueCat, de modo que el webhook actualiza la tabla `subscriptions` del usuario correcto. Los pagos requieren un *development build* (no funcionan en Expo Go ni en web).

## Publicar en las tiendas

Requiere cuenta de Apple Developer (USD 99/año) y de Google Play Console (USD 25, pago único).

```bash
cd apps/mobile
npx eas-cli@latest build --profile development   # build de desarrollo con pagos
npx eas-cli@latest build --profile production
npx eas-cli@latest submit --profile production
```

Antes de publicar: reemplazar `TERMS_URL` y `PRIVACY_URL` en `apps/mobile/src/lib/config.ts`, el `bundleIdentifier`/`package` en `app.json`, el ícono y las capturas de las fichas.

## Próximos pasos sugeridos

- Elegir e integrar proveedores reales de datos de mercado (cripto, acciones globales, bonos por país) y tipos de cambio históricos.
- Inicio de sesión con Apple y Google.
- Conexión automática por API con exchanges y brokers, y lectura de billeteras on-chain por dirección pública.
- Alertas de precio y reportes impositivos por país.

## Aviso

La información que muestra la app es orientativa y no constituye asesoramiento financiero, impositivo ni una recomendación de inversión.
