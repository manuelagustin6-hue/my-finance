# My Finance — portafolio consolidado

Aplicación móvil (iOS y Android) para consolidar en un solo lugar todas las inversiones de una persona —criptomonedas, acciones, ETF, bonos, fondos y efectivo— distribuidas en distintas billeteras, exchanges, brokers y bancos de cualquier país.

## Qué hace (MVP)

- **Valor consolidado** de la cartera en la moneda base elegida (USD, EUR, ARS, BRL, MXN, CLP, COP, etc.), con variación diaria.
- **Billeteras con esquema de comisiones** (porcentaje, monto fijo y mínimo). La comisión se precarga en cada operación y se puede editar.
- **P&L real por activo**: costo promedio ponderado con las comisiones de compra incluidas en el costo y las de venta descontadas del ingreso. Resultado realizado, no realizado, dividendos/intereses y comisiones pagadas.
- **Carga manual** de compras, ventas, depósitos, retiros, transferencias entre billeteras, dividendos, intereses/cupones, comisiones sueltas y splits.
- **Importación inteligente**: acepta el CSV de cualquier broker o exchange (o filas pegadas desde su web) sin plantillas. Reconoce las columnas por su nombre en español, inglés o portugués, el formato de números (1.234,56 o 1,234.56) y de fechas, y clasifica cada tipo de operación; el usuario revisa y corrige antes de importar y la app recuerda sus elecciones. Formatos específicos para Binance, Coinbase e Interactive Brokers. Detecta duplicados y avisa si faltan tenencias iniciales.
- **Importar la tenencia**: si el archivo (o el texto pegado) es la cartera actual —activo, cantidad y, si está, costo promedio y valorizado— la app la reconoce y la carga como saldo inicial de la billetera a la fecha elegida. Detecta bonos cotizados cada 100 nominales, suma el efectivo y usa el precio del archivo para los activos sin cotización.
- **Planillas de la app**: una de tenencia (activo, cantidad, precio promedio opcional y moneda) y otra de movimientos, para completar en Excel o Google Sheets cuando el broker no exporta. Los archivos se leen en CSV, Excel (.xlsx) o el ".xls" en formato HTML que generan varios brokers.
- **Ficha de cada activo** (aunque no se tenga): precio, gráfico, rendimiento por período, volatilidad anualizada, máxima caída, máximos/mínimos de 52 semanas; para acciones, estados financieros trimestrales y enlaces a las presentaciones.
- **Análisis del portafolio**: evolución del valor, rendimiento ponderado por tiempo, desvío (volatilidad) y máxima caída; distribución por tipo de activo, país, moneda y billetera.
- **Tipos de cambio globales** (más de 150 monedas) con el **dólar como moneda puente**: la cartera se ve en la moneda principal y en una secundaria (por defecto USD) con un toque. El costo de cada operación usa el tipo de cambio **del día en que se hizo**, así el resultado en pesos y en dólares es correcto. Para Argentina se elige el dólar a usar (oficial, MEP, CCL, blue, mayorista, cripto, tarjeta) y para Venezuela (oficial o paralelo). Incluye conversor y tabla de cotizaciones.
- **Saldo inicial por billetera**: en lugar de importar toda la historia, se cargan las tenencias a una fecha (valuadas a precio de mercado de ese día o al costo propio) y desde ahí se miden los resultados; la actividad anterior se ignora y el importador la omite.
- **Avisos explicados**: ventas mayores a la tenencia registrada, monedas sin tipo de cambio o cantidades inválidas se agrupan con su explicación y cómo resolverlos.
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

## Tipos de cambio

Todas las conversiones pasan por el dólar: `ARS → USD → MXN`. Fuentes públicas, gratuitas y sin clave (`packages/core/src/fx/public.ts`):

| Fuente | Uso |
|---|---|
| [currency-api](https://github.com/fawazahmed0/exchange-api) | Más de 150 monedas, actual e histórico diario (desde marzo de 2024) |
| [Frankfurter](https://frankfurter.dev) (Banco Central Europeo) | Respaldo para fechas anteriores (~30 monedas, desde 1999) |
| [DolarAPI](https://dolarapi.com) | Cotización actual de cada tipo de dólar en Argentina y Venezuela |
| [ArgentinaDatos](https://argentinadatos.com) | Historia diaria de cada tipo de dólar en Argentina |

Las cotizaciones de días pasados se guardan en caché (en el teléfono en modo demo y en la tabla `fx_cache` en modo nube). Si no hay conexión, se muestran valores de referencia y la app lo avisa. Para monedas sin historia en la fecha pedida se usa la cotización disponible más cercana; el usuario siempre puede cargar el tipo de cambio exacto en la operación.

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

### Abrirla en el celular

**Sin computadora (recomendado):** seguir [docs/probar-en-iphone.md](docs/probar-en-iphone.md). La app se publica desde GitHub Actions y se abre con Expo Go; no requiere cuenta de Apple Developer.

**Con computadora:**

1. Instalar **Expo Go** desde App Store o Google Play.
2. En una computadora: instalar [Node.js 22](https://nodejs.org) y luego `npm install -g pnpm`.
3. Descargar el proyecto y arrancarlo:
   ```bash
   git clone https://github.com/manuelagustin6-hue/my-finance.git
   cd my-finance
   git checkout claude/portfolio-app-mvp
   pnpm install
   pnpm --filter mobile start
   ```
4. Escanear el código QR que aparece: en iPhone con la cámara, en Android desde Expo Go. El teléfono y la computadora deben estar en la misma red Wi-Fi (si no, usar `pnpm --filter mobile start --tunnel`).

Para instalarla sin computadora encendida (APK de Android o TestFlight en iPhone) se usa EAS Build con una cuenta gratuita de Expo; ver "Publicar en las tiendas".

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
