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

- **Enlace permanente (recomendado):** al final del resumen de la ejecución del paso 5 hay un enlace que empieza con `exp://u.expo.dev/…?channel-name=preview`. Cópialo, pégalo en la barra de Safari y se abre en Expo Go. Ese enlace **siempre abre la última versión**: guárdalo (por ejemplo, en Notas).
- **Alternativa:** en Expo Go, *Home → Projects → my-finance* y abre la actualización más reciente.

> No uses enlaces del tipo `exp://u.expo.dev/update/…`: apuntan a una versión fija y siguen abriendo esa versión aunque se publiquen otras.

Para confirmar qué versión estás usando: en la app, *Ajustes* → al final figura la fecha de publicación.

## Versiones nuevas

Cada vez que se suben cambios a la rama `claude/portfolio-app-mvp`, la app se publica sola. En Expo Go, cierra la app y vuelve a abrirla con el enlace permanente para recibir la versión nueva; en *Ajustes* verás la fecha de publicación actualizada.

## Cargar tu tenencia actual

La forma más rápida de empezar es cargar lo que tienes hoy:

1. En la web o la app de tu broker, exporta o copia la tabla de tu cartera (activo, cantidad y, si aparece, precio promedio).
   - Si el broker te la envía por mail (como Cocos), abre el mail en el iPhone, mantén presionado el adjunto y elige **Guardar en Archivos**.
2. En la app: *Importar historial* → **Elegir archivo (CSV o Excel)**, o pega las filas copiadas.
3. La app reconoce que es una tenencia y muestra la lista de activos. Revisa la fecha y toca **Cargar como saldo inicial**.

Desde esa fecha la app mide tus resultados. Si no hay precio promedio, se toma el precio de mercado de ese día.

## Importar desde la web de tu broker

1. En *Billeteras*, abre tu billetera y toca **Desde la web de {plataforma}** (o, en *Importar historial*, **Abrir la web de…**).
2. Se abre la web real de la plataforma dentro de la app. Arriba se ve el dominio con un candado: verifica que sea el sitio correcto.
3. Inicia sesión como siempre (usuario, contraseña y código de verificación). La app no ve ni guarda esos datos, y al cerrar se borra la sesión.
4. Ve a *Movimientos*, *Actividad* o *Historial* y toca **Exportar** o **Descargar** (CSV o Excel).
5. La app toma el archivo y vuelve al importador con la vista previa: revisa y toca **Importar**.

Si la descarga no se captura (algunos sitios en Android guardan el archivo directo en el teléfono), vuelve y elígelo con **Elegir archivo (CSV o Excel)**.

## Si algo falla

- **El workflow termina con un aviso "Falta el secreto EXPO_TOKEN":** revisa el paso 4 (el nombre debe ser exactamente `EXPO_TOKEN`).
- **Expo Go dice que la versión del SDK no es compatible:** Expo Go del App Store solo admite la última versión de Expo; avísame para actualizar el proyecto.
- **No aparece en Projects:** verifica que Expo Go tenga iniciada la misma cuenta con la que creaste el token.
