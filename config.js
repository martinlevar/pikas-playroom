window.ARCADE_CLOUD_CONFIG = {
  // Realtime Database.
  firebaseDatabaseUrl: "https://torneo-black-dog-default-rtdb.firebaseio.com/",

  // Firebase Auth. Copiar desde Firebase Console > Project settings > Web app config.
  firebaseWebApiKey: "AIzaSyA6ULM2de4dNGSGbDDLkxQoRzJaGSOftf0",

  // Ranking activo para esta instalacion.
  activeRankingId: "black-dog",

  // Compatibilidad con la primera version.
  roomId: "torneo-black-dog",

  // Mercado Pago se crea del lado server con Netlify Functions.
  mercadoPagoPreferenceEndpoint:
    "/.netlify/functions/create-mercadopago-preference",
};
