# Evolucion v2: usuarios, rankings, historico y pagos

## Que queda agregado

- Login y creacion de usuario con Firebase Auth.
- Ranking activo configurable desde `config.js`.
- Vista publica en `viewer.html`.
- Mesa oficial en `mesa-black-dog-8f3k9.html`.
- Records historicos por juego.
- Netlify Function para crear preferencias de Mercado Pago.
- Reglas sugeridas para que solo admin/editores escriban.

## Firebase Auth

1. En Firebase Console, entra a `Authentication`.
2. En `Sign-in method`, activa `Email/Password`.
3. En `Project settings`, crea o abre la app Web.
4. Copia el `apiKey`.
5. Pegalo en `config.js`:

```js
window.ARCADE_CLOUD_CONFIG = {
  firebaseDatabaseUrl: "https://torneo-black-dog-default-rtdb.firebaseio.com/",
  firebaseWebApiKey: "TU_API_KEY",
  activeRankingId: "black-dog",
  roomId: "torneo-black-dog",
  mercadoPagoPreferenceEndpoint: "/.netlify/functions/create-mercadopago-preference",
};
```

## Reglas de Realtime Database

En Firebase Console > Realtime Database > Rules, pega el contenido de:

```txt
firebase.rules.json
```

El modelo nuevo usa:

```txt
rankings/{rankingId}/state
rankings/{rankingId}/ownerUid
rankings/{rankingId}/editors/{uid}
rankingAccessRequests/{rankingId}/{uid}
users/{uid}
```

La lectura es publica para la landing. La escritura queda para el admin y editores.

## Mercado Pago

1. En Mercado Pago Developers, crea una aplicacion.
2. Copia el `Access Token` de produccion o test.
3. En Netlify > Site configuration > Environment variables, agrega:

```txt
MERCADO_PAGO_ACCESS_TOKEN=TU_ACCESS_TOKEN
```

La funcion disponible es:

```txt
/.netlify/functions/create-mercadopago-preference
```

Recibe un `POST` con:

```json
{
  "title": "Inscripcion Torneo Black Dog",
  "unit_price": 5000,
  "quantity": 1,
  "rankingId": "black-dog",
  "userUid": "firebase-uid"
}
```

Devuelve `init_point` para redirigir al checkout.

## Proximo paso recomendado

La pagina principal (`index.html`) ahora incluye:

- login y creacion de usuario,
- listado de boards publicos,
- creacion de boards publicos o privados con link.

La mesa oficial tambien incluye una pantalla basica de administracion de rankings:

- crear ranking nuevo,
- elegir ranking activo,
- abrir/copiar el link con `viewer.html?ranking=...`.

Todavia queda para una iteracion siguiente:

- aprobar solicitudes de editores desde UI,
- configurar precio de inscripcion,
- ver pagos confirmados.
