# Firebase para sincronizar el torneo

La app ya esta preparada para funcionar con Firebase Realtime Database. Sin configurar Firebase, sigue funcionando en modo local.

## Pasos

1. Entra a https://console.firebase.google.com y crea un proyecto.
2. Dentro del proyecto, crea una `Realtime Database`.
3. Elegi una region cualquiera y arranca en modo de prueba para la noche.
4. Copia la URL de la base. Tiene esta forma:

```txt
https://tu-proyecto-default-rtdb.firebaseio.com
```

5. Abri `config.js` y pega esa URL aca:

```js
window.ARCADE_CLOUD_CONFIG = {
  firebaseDatabaseUrl: "https://tu-proyecto-default-rtdb.firebaseio.com",
  roomId: "torneo-black-dog",
};
```

6. Volve a subir los archivos a Netlify.

Cuando este configurado, el badge de arriba cambia de `Local` a `Online`. A partir de ahi, cualquier celular que abra la web ve los cambios en vivo.

## Links

- `mesa-black-dog-8f3k9.html` es la mesa oficial para cargar jugadores, juegos y puntajes.
- `viewer.html` es la vista publica solo lectura para compartir con amigos.
- `index.html` redirige a la vista publica.

## Reglas temporales

Para probar rapido, Firebase puede quedar en modo test. Si te pide reglas, para una noche cerrada podes usar temporalmente:

```json
{
  "rules": {
    "rooms": {
      ".read": true,
      ".write": true
    }
  }
}
```

Despues de la juntada, conviene cerrar esas reglas o borrar la base.
