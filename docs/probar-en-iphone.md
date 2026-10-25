# Probar la app en el iPhone (sin computadora)

La app se publica desde GitHub y se abre con **Expo Go**, una app gratuita. No hace falta computadora ni cuenta de Apple Developer. Todo se hace desde el celular, una sola vez (unos 10 minutos).

La versión que se prueba es el **modo demo**: tus datos quedan guardados en el teléfono, los precios de los activos son simulados y los tipos de cambio son reales. El plan Pro se puede activar gratis desde *Ajustes → Simular plan Pro*.

## 1. Instalar Expo Go

Descarga **Expo Go** desde el App Store.

## 2. Crear la cuenta de Expo

1. En Safari, entra a [expo.dev/signup](https://expo.dev/signup) y crea una cuenta gratuita.
2. Abre Expo Go e inicia sesión con esa misma cuenta (pestaña *Settings* o *Profile* → *Log in*).

## 3. Crear el token de acceso

1. En Safari, entra a [expo.dev/settings/access-tokens](https://expo.dev/settings/access-tokens).
2. Toca **Create token**, ponle de nombre `github` y créalo.
3. **Copia el token** (se muestra una sola vez).

## 4. Guardar el token en GitHub

1. En Safari, entra a [github.com/manuelagustin6-hue/my-finance/settings/secrets/actions](https://github.com/manuelagustin6-hue/my-finance/settings/secrets/actions). Si la página se ve recortada, activa *Solicitar sitio web de escritorio* en el menú **aA** de Safari.
2. Toca **New repository secret**.
3. Nombre: `EXPO_TOKEN`. Valor: el token copiado. Toca **Add secret**.

## 5. Publicar la app

1. Entra a [github.com/manuelagustin6-hue/my-finance/actions](https://github.com/manuelagustin6-hue/my-finance/actions).
2. Toca la ejecución más reciente de **Probar en Expo Go**.
3. Toca **Re-run all jobs** (en el celular puede estar dentro del menú **···**) y confirma. Así vuelve a correr usando el token que acabas de guardar.
4. Espera a que termine (círculo verde, unos 5 minutos).

> El botón *Run workflow* aparecerá recién cuando este trabajo se incorpore a la rama principal (`main`). Mientras tanto, usa *Re-run all jobs*.

## 6. Abrir la app

- **Lo más simple:** abre Expo Go. Con tu cuenta iniciada, la app *my-finance* aparece en *Home → Projects*. Tócala.
- **Alternativa:** en expo.dev → *Projects* → *my-finance* → *Updates*, abre la última versión y toca *Preview*.

## Versiones nuevas

Cada vez que se suben cambios a la rama `claude/portfolio-app-mvp`, la app se publica sola. En Expo Go, cierra la app y vuelve a abrirla para recibir la versión nueva.

## Si algo falla

- **El workflow termina con un aviso "Falta el secreto EXPO_TOKEN":** revisa el paso 4 (el nombre debe ser exactamente `EXPO_TOKEN`).
- **Expo Go dice que la versión del SDK no es compatible:** Expo Go del App Store solo admite la última versión de Expo; avísame para actualizar el proyecto.
- **No aparece en Projects:** verifica que Expo Go tenga iniciada la misma cuenta con la que creaste el token.
