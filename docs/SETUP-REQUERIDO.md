# Configuración requerida — Gira Clothing

Todo lo que depende de una decisión o de un dato tuyo, no del código.

**Estado actual: en desarrollo.** Solo la **Parte A** es necesaria hoy. La Parte B
es para cuando vayas a desplegar y no hay ninguna prisa. La Parte C son decisiones
que puedes ir pensando sin que bloqueen nada.

Marca las casillas conforme avances.

---

## Antes de empezar: cómo funcionan los archivos `.env`

- Los valores reales viven en `.env.development.local` (y en producción, en el
  gestor de secretos del hosting). **Nunca se commitean** — `.gitignore` ya
  bloquea `.env` y `.env.*.local`.
- Lo que sí está versionado son los `.env.*.example`, que solo llevan
  marcadores de posición. Cópialos y rellena la copia:

```bash
cp apps/api/.env.development.example apps/api/.env.development.local
```

- La configuración es **fail-fast**: si falta una variable obligatoria o está mal
  formada, el servidor no arranca y te dice exactamente cuál. No hay arranques a
  medias.

---

# Parte A — Lo que necesitas HOY

Diez minutos. Con esto el backend completo funciona en local, incluido el flujo
de compra de punta a punta.

## A.1 — Base de datos (MongoDB Atlas)

**Estado: ya configurado.** Se usa un cluster Atlas M0 (gratis) también en
desarrollo, no solo en producción — evita instalar y mantener Mongo local.

- [x] Crear cuenta en [Atlas](https://www.mongodb.com/cloud/atlas) y un cluster
      M0
- [x] Crear un usuario de base de datos con permisos mínimos
- [x] Agregar la IP de la máquina (o `0.0.0.0/0` en desarrollo) en Network
      Access
- [x] Copiar la cadena de conexión y **agregarle el nombre de la base** antes
      del `?`:

```
mongodb+srv://usuario:password@cluster.xxxxx.mongodb.net/gira-dev?appName=...
```

> **El detalle que se presta a error:** sin `/gira-dev` antes del `?`, Mongoose
> se conecta a una base llamada `test` por defecto, no a la tuya. Fue exactamente
> el bug que se corrigió al llenar el `.env` — revísalo si en algún momento
> parece que los datos "desaparecen".

> **Por qué tiene que ser replica set:** las transacciones de Mongo solo existen
> en replica set, y el apartado de stock, la confirmación de pago, la liberación
> y el reembolso las usan. Atlas ya entrega replica set de fábrica, incluso en
> el plan gratuito — por eso no hace falta nada más. Los tests tampoco necesitan
> esto: levantan su propio Mongo en memoria.

<details>
<summary>Alternativa: Mongo local (si alguna vez prefieres no depender de Atlas)</summary>

```bash
mongod --replSet rs0 --dbpath /usr/local/var/mongodb
mongosh --eval 'rs.initiate()'
```

Y en el `.env`: `MONGODB_URI=mongodb://127.0.0.1:27017/gira-dev?replicaSet=rs0`

</details>

## A.2 — Las 8 variables obligatorias

- [ ] Generar los dos secretos:

```bash
openssl rand -hex 32    # para JWT_SECRET
openssl rand -hex 32    # para ENCRYPTION_KEY — corre el comando otra vez, deben ser distintos
```

- [ ] Llenar `apps/api/.env.development.local`:

| Variable | Valor en desarrollo |
|---|---|
| `NODE_ENV` | `development` |
| `PORT` | `4000` |
| `MONGODB_URI` | la cadena de Atlas del paso A.1, **con** `/gira-dev` antes del `?` |
| `JWT_SECRET` | el primer `openssl` (64 caracteres; el mínimo son 48) |
| `JWT_EXPIRES_IN` | `7d` |
| `ENCRYPTION_KEY` | el segundo `openssl`, **distinto** al de JWT |
| `CLIENT_URL` | `http://localhost:3000` |
| `COOKIE_NAME` | `gira_session` |

En desarrollo local (http) agrega también `COOKIE_SECURE=false` y
`RATE_LIMIT_ENABLED=false`: sin ellos la cookie de sesión lleva `Secure` y el
navegador no la guarda sobre `http://localhost`, y los límites de peticiones
estorban al probar.

Opcional: `LOG_LEVEL=debug` (por defecto `info`) y `TRUST_PROXY_HOPS=0` (por
defecto `0`, que es lo correcto en local).

## A.3 — Crear el primer administrador

El registro público solo produce clientes. El primer admin se crea a mano:

- [ ] Ejecutar el seeder

```bash
pnpm --filter @gira/api seed:admin -- \
  --email tucorreo@ejemplo.com \
  --password 'UnaContraseñaFuerte123' \
  --first-name 'Manuel' \
  --last-name 'Arteaga'
```

Antes de hacer nada imprime **a qué base apunta** (solo el host): revísalo. El admin nace
con el correo ya verificado.

Es idempotente. Si el admin ya existe, no toca su contraseña ni su 2FA: solo completa
nombre, apellido y correo verificado (y quita el campo `name` de antes de M8.5).

- [ ] **Una sola vez tras M8.5:** corre el comando sobre el admin que ya existe en Atlas.
      Sin esto el login responde "Activa tu cuenta…" (403), porque las cuentas nuevas exigen
      el correo verificado, y el panel no tiene nombre y apellido que mostrar. Córrelo **justo
      después del deploy**, antes de volver a iniciar sesión.

### Verificación en dos pasos (obligatoria para el admin)

- [ ] En su **primer inicio de sesión** el admin escribe correo y contraseña y el panel
      le muestra un código QR. Lo escanea con una app de autenticación (Google
      Authenticator, Authy, 1Password…), escribe el primer código de 6 dígitos y entra.
      Tiene 5 minutos para completar ese paso; si expira, vuelve a iniciar sesión.
- [ ] Un admin que ya existía sin 2FA hace lo mismo en su próximo inicio de sesión: no
      hace falta ningún paso previo ni variable de entorno nueva.
- [ ] 5 códigos incorrectos seguidos bloquean la cuenta 15 minutos.

**Si el admin pierde su app de autenticación** (no hay códigos de respaldo a propósito):
con acceso a la base de datos, ejecutar

```bash
pnpm --filter @gira/api 2fa:reset-admin -- --email tucorreo@ejemplo.com
```

Apaga el segundo factor, quita cualquier bloqueo y cierra todas sus sesiones; en su
siguiente inicio de sesión vuelve a configurarlo. El correo hay que pasarlo siempre con
`--email` (no lee `ADMIN_EMAIL`, para que no se ejecute por accidente) y la acción queda
en la auditoría como acción del sistema.

## A.4 — Telegram (obligatorio en producción)

Es la única integración externa que funciona igual en todos los entornos, así que
no hay razón para dejarla para producción. Es por donde te vas a enterar de que
entró un pedido.

- [ ] Crear un bot con [@BotFather](https://t.me/BotFather) → te da el token
- [ ] Obtener tu `chat_id` (escríbele a tu bot y consulta
      `https://api.telegram.org/bot<TOKEN>/getUpdates`)
- [ ] Agregar `TELEGRAM_BOT_TOKEN` y `TELEGRAM_CHAT_ID`

> **En producción son obligatorias las dos:** sin ellas la API no arranca (igual que
> el correo), porque por aquí te enteras de que dinero e inventario no cuadran.
> En desarrollo y pruebas son opcionales y van de a pares: si pones solo una, el
> arranque falla; si no pones ninguna, el aviso queda en la bitácora como
> `skipped` (no como enviado) y solo se escribe en la consola.

## A.5 — Stripe, Cloudinary y Resend

**Estado: ya configurados los tres**, aunque técnicamente son opcionales en
desarrollo — sin ellos el sistema cae solo a un adapter de reemplazo sin red:

| Servicio | Estado actual | Sin credenciales, el sistema haría |
|---|---|---|
| Stripe | ✅ Cuenta en **modo de prueba** (`sk_test_...`) | Pagos simulados y deterministas |
| Cloudinary | ✅ Cuenta real, plan gratuito | Las imágenes devuelven una URL falsa |
| Resend | ✅ Cuenta real, enviando desde el **sandbox** `onboarding@resend.dev` | Los correos se escriben en la consola en vez de enviarse |

Sobre Resend: el sandbox manda correos de verdad, pero solo puede entregarlos a
la dirección con la que te registraste ahí — es la protección anti-spam del
plan gratuito. Cuando compres el dominio (Parte B.4), cambias `MAIL_FROM` al
definitivo y deja de tener ese límite.

> **Cuidado con las configuraciones a medias.** Si pones el `CLOUDINARY_CLOUD_NAME`
> pero no la API key, el arranque falla. Es a propósito: media configuración es
> peor que ninguna, porque falla en producción en el peor momento en vez de al
> arrancar. Van todas o ninguna, por servicio.

## A.6 — Comprobar que quedó bien

```bash
pnpm --filter @gira/api dev
```

Si arranca y dice `MongoDB conectado` + `API escuchando en el puerto 4000`, la
Parte A está lista.

---

# Quién recibe qué, y por dónde

Esto determina qué hace falta dar de alta, así que conviene tenerlo claro antes de
la Parte B. **No es "correo o Telegram a los dos": son dos canales para dos
destinatarios que nunca se cruzan.**

| Cuándo | Al cliente | A ti (dueño) |
|---|---|---|
| Se confirma el pago | Correo: confirmación de compra | Telegram: nueva orden pagada |
| Pago rechazado | — (Stripe se lo dice en pantalla) | Telegram: pago rechazado |
| Marcas "en preparación" | Correo: ya lo estamos preparando | — |
| Capturas la guía de envío | Correo: va en camino + número de guía | — |
| Envío devuelto o extraviado | — | Telegram: incidencia |
| Dinero e inventario no cuadran | — | Telegram: revisar |

Las casillas vacías de la derecha son deliberadas: esas dos acciones las acabas de
hacer tú en el panel, avisarte sería ruido.

**Las tres consecuencias prácticas:**

1. Para que **tú** te enteres, basta la app de Telegram. Ni dominio, ni Resend, ni
   buzón de correo.
2. El dominio y Resend existen para que **el cliente** reciba sus correos.
3. El buzón `hola@tudominio` no participa en ninguna notificación. Sirve para una
   sola cosa: que si un cliente le da "Responder" al correo de confirmación, ese
   mensaje llegue a algún lado en vez de rebotar.

---

# Parte B — Cuando vayas a producción

**No es para ahora.** Queda aquí para que cuando toque, no haya que investigar
nada de cero.

## B.1 — Cuentas a dar de alta

- [ ] **MongoDB Atlas** — el cluster gratuito alcanza para empezar. Usuario con
      permisos mínimos y lista de IPs permitidas.
      → `MONGODB_URI`

      > Atlas entrega replica set por defecto. Si en vez de Atlas montas Mongo a
      > mano en un VPS, **tiene que ser replica set igual** o el checkout no
      > funciona (mismo motivo que en A.1).

- [ ] **Cloudinary** — almacenamiento de las fotos del catálogo.
      → `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`

- [ ] **Stripe** — cobros. Ver B.3 para la configuración del webhook.
      → `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`

      > La *publishable key* no va aquí: es del frontend, no del backend.

- [ ] **Resend** — correos al cliente. Ver B.4.
      → `RESEND_API_KEY`, `MAIL_FROM`

## B.2 — Las 7 variables que solo producción exige

Además de las 8 de la Parte A (con `NODE_ENV=production` y `CLIENT_URL` en
**https**, que el sistema verifica):

- [ ] `CLOUDINARY_CLOUD_NAME`
- [ ] `CLOUDINARY_API_KEY`
- [ ] `CLOUDINARY_API_SECRET`
- [ ] `STRIPE_SECRET_KEY`
- [ ] `STRIPE_WEBHOOK_SECRET`
- [ ] `RESEND_API_KEY`
- [ ] `MAIL_FROM`

Opcionales con valor por defecto razonable: `CLOUDINARY_FOLDER` (`gira`),
`STRIPE_WEBHOOK_TOLERANCE_SECONDS` (`300`), `LOG_LEVEL` (`info`).

## B.3 — Configurar el webhook de Stripe

- [ ] Registrar el endpoint: `POST https://tu-api.com/api/webhooks/stripe`
- [ ] Habilitar **exactamente estos seis eventos**:

```
payment_intent.succeeded
payment_intent.payment_failed
payment_intent.canceled
charge.refunded
charge.dispute.created
charge.dispute.closed
```

- [ ] Copiar el *signing secret* que te da Stripe → `STRIPE_WEBHOOK_SECRET`

> Cualquier otro evento se responde con 200 y se ignora, así que no pasa nada si
> habilitas de más — pero si falta alguno de estos seis, ese caso deja de
> funcionar en silencio.

## B.4 — Dominio y correo

**Decisión tomada: Resend para enviar, dominio propio en Namecheap.**

### Por qué no Gmail ni Outlook (para no volver a discutirlo)

Resend necesita un dominio **tuyo**, donde puedas poner registros DNS que
autoricen el envío. Con `@gmail.com` o `@outlook.com` eso es imposible porque no
son dominios tuyos. Y aunque técnicamente se pueda mandar por SMTP de Gmail:

- El correo saldría de una cuenta personal en vez del dominio de la tienda.
- No hay forma de saber si un correo rebotó. Resend devuelve un identificador de
  entrega que el sistema ya guarda.
- Los términos de servicio de Gmail prohíben el envío comercial; es una cuenta
  que te pueden suspender, y ahí te quedas sin correos de confirmación.
- Habría que escribir un adapter SMTP nuevo y sumar una dependencia.

### Pasos

- [ ] **Comprar el dominio en Namecheap**

      > Revisa el precio de **renovación**, no el de promoción del primer año.
      > Y activa la renovación automática: un dominio vencido tira la tienda y
      > los correos.

- [ ] **Decidir la extensión.** Hoy los dos `.env.example` no coinciden entre sí
      (`giraclothing.com` en uno, `giraclothing.mx` en el otro). Hay que elegir:
      `.mx` comunica tienda mexicana, `.com` es universal y más barato. Importa
      porque ese dominio es el que se verifica en Resend, el que entra en la lista
      de orígenes permitidos y el que aparece dentro de los enlaces de los correos.

- [ ] **Activar el reenvío de correo** que Namecheap incluye gratis:
      `hola@tudominio` → tu Outlook personal.

      > El reenvío deja que te lleguen los mensajes, pero no que **respondas**
      > como `hola@tudominio`. Si necesitas eso, Zoho Mail tiene plan gratuito
      > permanente (1 dominio, 5 usuarios). Google Workspace o Microsoft 365
      > (~$6-7 USD al mes por buzón) solo cuando haya equipo.

- [ ] **Dar de alta el dominio en Resend** y pegar los registros SPF/DKIM que te
      entregue en el DNS de Namecheap.

- [ ] Llenar `CLIENT_URL` y `MAIL_FROM` con ese dominio.

### Costo total

| Concepto | Costo |
|---|---|
| Dominio `.com` en Namecheap | ~$12-16 USD/año |
| Reenvío de correo (incluido) | $0 |
| Resend — 3,000 correos/mes ≈ 1,000 pedidos | $0 |
| Telegram | $0 |
| **Total** | **el dominio y nada más** |

Con `.mx` sube a ~$30-45 USD/año.

## B.5 — Al desplegar

- [ ] **`COOKIE_SECURE` y `RATE_LIMIT_ENABLED`** — en producción déjalos sin definir
      (valen `true`) o ponlos en `true`. Con `false` la API **no arranca**: es a propósito,
      para que una variable copiada de desarrollo no debilite producción. Un staging o
      preview también los hereda en `true`.

- [ ] **`TRUST_PROXY_HOPS`** — cuántos proxies inversos hay delante de la API:
      - `1` → Railway, Render, Fly, Nginx directo
      - `2` → si además hay un CDN (Cloudflare) delante
      - `0` → sin proxy

      > **Nunca `true`.** Es un número de saltos. De este valor dependen todos los
      > límites de peticiones y la IP que guarda la bitácora de auditoría: con `0`
      > detrás de un proxy, el sistema ve siempre la IP del proxy y el límite de
      > intentos de login bloquearía a todo el mundo tras cinco fallos.

- [ ] **Verificar los índices** contra la base real:

```javascript
db.orders.getIndexes()
```

      > Debe existir el índice único sobre `idempotencyKey`. Es lo que impide que
      > un reintento de red cree una segunda orden y un segundo cobro. Si por lo
      > que sea no se construyó, esa garantía se degrada en silencio.

- [ ] Crear el primer admin en producción (mismo comando de A.3).

- [ ] **Sesiones (M8.5).** Cada inicio de sesión es una sesión por dispositivo (colección
      `sessions`, que se limpia sola al vencer). Las sesiones firmadas antes de M8.5 dejan de
      servir con el deploy: toca volver a iniciar sesión una vez.

- [ ] **Correos de cuenta.** El enlace para activar la cuenta y el de restablecer la
      contraseña salen por Resend directo, sin pasar por la cola de notificaciones (el token
      nunca se guarda). Si Resend falla, el registro igual responde bien y la persona pide
      otro enlace pasado un minuto; el fallo queda en el log del API.

## B.6 — Reglas de riesgo en Stripe (Radar)

**Esto no se configura en el código, se configura en el panel de Stripe.** Y por
eso es lo más fácil de olvidar: no hay ninguna variable que falte ni ningún test
que se ponga rojo si no lo haces.

La diferencia con todo lo demás de esta guía: el código ya impide que alguien
**falsifique** un cobro (firma criptográfica del webhook, ventana de 5 minutos
contra reenvíos, índice único que hace imposible procesar el mismo evento dos
veces, clave de idempotencia que impide un segundo cargo). Lo que el código **no**
puede decidir es si la tarjeta que está pagando es robada. Eso lo decide Radar,
antes de que el cobro llegue.

En **Stripe Dashboard → Radar → Rules**:

- [ ] **Bloquear si el CVC no coincide.** Quien teclea el número correcto y el CVC
      equivocado normalmente no tiene la tarjeta en la mano.
- [ ] **Bloquear si falla la verificación del código postal.**
- [ ] **Marcar para revisión manual** las compras desde un país distinto al de la
      dirección de envío, o desde VPN/proxy anónimo.
- [ ] Revisar que el bloqueo por defecto de Radar (`risk_level: highest`) esté
      activo — viene encendido, pero conviene confirmarlo.

> **Bloquear y "marcar para revisión" no son lo mismo, y la diferencia te afecta:**
>
> - Un pago **bloqueado** nunca genera un webhook de éxito. La orden se queda en
>   "pendiente de pago" y expira sola a los 30 minutos liberando el apartado. No
>   hay nada que hacer.
> - Un pago **marcado para revisión** sí se cobra. Stripe manda
>   `payment_intent.succeeded` igual, así que la orden aparece como **pagada** en tu
>   panel y el cliente recibe su correo de confirmación. La revisión es un aviso
>   para ti, no un freno.
>
> Consecuencia práctica: **si activas reglas de revisión manual, revisa
> Radar → Reviews en Stripe antes de mandar un pedido caro.** Nada en el panel de
> Gira te va a avisar de eso — el pago es legítimo desde el punto de vista de la
> API. Si decides rechazarlo, el reembolso desde Stripe llega como
> `charge.refunded` y el sistema repone el stock solo (siempre que no lo hayas
> marcado ya como "en preparación").

---

# Parte C — Decisiones que puedes ir pensando

No bloquean nada. Todas se cambian después desde el panel de administración.

## C.1 — Los nueve valores de negocio

Hoy corren con estos valores por defecto. Ninguno está decidido por ti todavía:

| Concepto | Valor actual | El tuyo |
|---|---|---|
| Envío nacional | $150.00 MXN | |
| Envío internacional | $600.00 MXN | |
| Envío gratis a partir de | **desactivado** | |
| Tipo de cambio | 18.00 MXN por USD | |
| Redondeo de precios en USD | hacia arriba a 50 centavos | |
| Monedas aceptadas | MXN y USD | |
| Cuánto se aparta el stock mientras pagan | 30 minutos | |
| Días antes de vaciar un carrito abandonado | 30 días | |
| A partir de cuántas unidades avisa "bajo stock" | 3 | |

Más `JWT_EXPIRES_IN` (hoy `7d`), que es cuánto dura la sesión de un usuario antes
de tener que volver a entrar.

## C.2 — Qué hacer cuando llegue una alerta de revisión

El sistema te avisa por Telegram cuando el dinero y el inventario no cuadran, pero
**deliberadamente no decide** — porque la decisión correcta depende del caso:

- **`payment_after_expiry`** — se cobró un pedido que ya había expirado. ¿Revisas
  si queda stock y lo surtes, o reembolsas siempre?
- **`stock_commit_missed`** — el pedido quedó pagado pero su apartado ya se había
  liberado, así que el stock no se descontó. ¿Ajustas el inventario a mano?

Vale la pena acordarlo antes de que llegue el primero.

## C.3 — Lo que el storefront tendrá que respetar (Bloque 2/3)

Cuando se construya el frontend, dos cosas ya están decididas por el backend:

- [ ] **Rutas de cuenta (M8.5).** Los correos de cuenta enlazan a
      `{CLIENT_URL}/verificar-correo?token=…` y `{CLIENT_URL}/restablecer-contrasena?token=…`.
      Esas dos páginas deben responder con `Referrer-Policy: no-referrer` y
      `Cache-Control: no-store`, para que el token no se filtre en el Referer ni quede en caché.
      Activar la cuenta pide el token **y** la contraseña del registro
      (`POST /auth/verify-email`); el formulario de contraseña nueva usa
      `PASSWORD_MIN_LENGTH` / `PASSWORD_MAX_BYTES` de `@gira/shared`.

- [ ] **Dos rutas obligatorias.** Los correos enlazan a
      `{CLIENT_URL}/orden/{publicId}` y `{CLIENT_URL}/orden/{publicId}/seguimiento`.
      Si el frontend no implementa esas rutas exactas, cada correo transaccional
      apunta a una página que no existe.

- [ ] **El checkout debe mandar `Idempotency-Key` con `crypto.randomUUID()`.**
      Cualquier otro formato se rechaza. Es lo que impide que alguien adivine una
      clave y recupere el pedido de otro cliente.

- [ ] **El cobro se hace con Stripe Payment Element, no con un formulario propio.**
      El backend devuelve un `clientSecret` al crear la orden; el navegador monta el
      Element con ese secreto y con la *publishable key*
      (`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, la única llave de Stripe que puede
      viajar al cliente).

      > **Los datos de la tarjeta nunca pasan por nuestra API, ni un byte.** Van del
      > navegador a Stripe directamente. Eso es lo que mantiene el proyecto fuera
      > del alcance de la certificación PCI: si el número de tarjeta llegara a
      > nuestro servidor, aunque fuera solo para reenviarlo, el cumplimiento pasaría
      > a ser nuestro problema. Un `<input name="cardNumber">` propio es la única
      > forma de romper esto, y no hay ninguna razón para escribirlo.
