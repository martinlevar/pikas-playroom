const STORAGE_KEY = "arcade-night-scoreboard-v1";
const AUTH_REFRESH_MARGIN_MS = 5 * 60 * 1000;
const CHALLENGE_ID = "pikasnoid";
const CHALLENGE_NAME = "Pikasnoid";

const cloudConfig = window.ARCADE_CLOUD_CONFIG || {
  firebaseDatabaseUrl: "",
  firebaseWebApiKey: "",
  activeRankingId: "black-dog",
  roomId: "torneo-black-dog",
};

let authState = loadAuthState();
let rankings = {};
let challengeScores = {};

const elements = {
  arcadeScreen: document.querySelector("#arcade-screen"),
  openLoginButton: document.querySelector("#open-login-button"),
  heroLoginButton: document.querySelector("#hero-login-button"),
  closeLoginButton: document.querySelector("#close-login-button"),
  loginDialog: document.querySelector("#login-dialog"),
  authForm: document.querySelector("#home-auth-form"),
  authTitle: document.querySelector("#home-auth-title"),
  authStatus: document.querySelector("#home-auth-status"),
  authName: document.querySelector("#home-auth-name"),
  authEmail: document.querySelector("#home-auth-email"),
  authPassword: document.querySelector("#home-auth-password"),
  signupButton: document.querySelector("#home-signup-button"),
  logoutButton: document.querySelector("#home-logout-button"),
  openHowButton: document.querySelector("#open-how-button"),
  closeHowButton: document.querySelector("#close-how-button"),
  howDialog: document.querySelector("#how-dialog"),
  challengeLink: document.querySelector("#home-challenge-link"),
  challengeRanking: document.querySelector("#home-challenge-ranking"),
  openChallengeRankingButton: document.querySelector("#open-challenge-ranking-button"),
  challengeRankingDialog: document.querySelector("#challenge-ranking-dialog"),
  closeChallengeRankingButton: document.querySelector("#close-challenge-ranking-button"),
  challengeRankingFullList: document.querySelector("#challenge-ranking-full-list"),
  boardsStatus: document.querySelector("#boards-status"),
  boardsList: document.querySelector("#public-boards-list"),
  betKeeperDialog: document.querySelector("#home-betkeeper-dialog"),
  closeBetKeeperButton: document.querySelector("#close-home-betkeeper-button"),
  betKeeperTitle: document.querySelector("#home-betkeeper-title"),
  betKeeperContent: document.querySelector("#home-betkeeper-content"),
  emptyTemplate: document.querySelector("#empty-state-template"),
};

elements.openLoginButton.addEventListener("click", openLoginDialog);
elements.heroLoginButton.addEventListener("click", openLoginDialog);
elements.closeLoginButton.addEventListener("click", () => {
  elements.loginDialog.close();
});

elements.authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await signIn();
});

elements.signupButton.addEventListener("click", async () => {
  await signUp();
});

elements.logoutButton.addEventListener("click", () => {
  authState = null;
  window.localStorage.removeItem(`${STORAGE_KEY}-auth`);
  renderAuth();
});
elements.openChallengeRankingButton.addEventListener("click", () => {
  renderChallengeRankingDialog();
  elements.challengeRankingDialog.showModal();
});
elements.closeChallengeRankingButton.addEventListener("click", () => elements.challengeRankingDialog.close());
elements.closeBetKeeperButton.addEventListener("click", () => elements.betKeeperDialog.close());
elements.boardsList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-betkeeper-ranking]");
  if (!button) return;
  openBetKeeperRules(button.dataset.betkeeperRanking);
});
elements.openHowButton.addEventListener("click", () => elements.howDialog.showModal());
elements.closeHowButton.addEventListener("click", () => elements.howDialog.close());

initializeHome();
loadRankings();
loadChallengeScores();
startArcadeEffects();

async function initializeHome() {
  await refreshAuthStateIfNeeded();
  renderAuth();
}

async function loadChallengeScores() {
  if (!isCloudConfigured()) {
    renderChallengeRanking();
    return;
  }

  try {
    const response = await fetch(challengeScoresUrl());
    challengeScores = response.ok ? (await response.json()) || {} : {};
  } catch (error) {
    console.warn(error);
    challengeScores = {};
  }

  renderChallengeRanking();
}

function renderChallengeRanking() {
  if (!elements.challengeRanking) return;

  elements.challengeRanking.innerHTML = "";
  const ranking = getChallengeRanking();

  if (ranking.length === 0) {
    elements.challengeRanking.innerHTML = `
      <strong>Sin líder todavía</strong>
      <span>Jugá y guardá el primer puntaje.</span>
    `;
    return;
  }

  const leader = ranking[0];
  elements.challengeRanking.innerHTML = `
    <span>Líder actual</span>
    <strong>${escapeHtml(leader.player)}</strong>
  `;
}

function renderChallengeRankingDialog() {
  elements.challengeRankingFullList.innerHTML = "";
  const ranking = getChallengeRanking().slice(0, 10);
  if (ranking.length === 0) {
    elements.challengeRankingFullList.innerHTML = `
      <div class="empty-state">
        <strong>Todavía no hay ranking de ${CHALLENGE_NAME}.</strong>
        <span>Jugá el desafío y guardá el primer puntaje.</span>
      </div>
    `;
    return;
  }

  ranking.forEach((entry, index) => {
    const row = document.createElement("article");
    row.className = "leader-row";
    row.innerHTML = `
      <div class="rank-number">${index + 1}</div>
      <div class="leader-main">
        <strong>${escapeHtml(entry.player)}</strong>
        <span>${entry.wins} ganados · ${entry.goalsFor}-${entry.goalsAgainst}</span>
      </div>
      <div class="total-score">${formatScore(entry.points)}</div>
    `;
    elements.challengeRankingFullList.append(row);
  });
}

function getChallengeRanking() {
  return Object.values(challengeScores || {})
    .map(normalizeChallengeRecord)
    .filter((entry) => entry.player && Number.isFinite(entry.points))
    .sort(compareChallengeRecords);
}

function normalizeChallengeRecord(entry = {}) {
  return {
    player: entry.player || "",
    points: Number.isFinite(entry.points) ? entry.points : 0,
    wins: Number.isFinite(entry.wins) ? entry.wins : Number(entry.points || 0),
    goalDiff: Number.isFinite(entry.goalDiff) ? entry.goalDiff : 0,
    goalsFor: Number.isFinite(entry.goalsFor) ? entry.goalsFor : 0,
    goalsAgainst: Number.isFinite(entry.goalsAgainst) ? entry.goalsAgainst : 0,
  };
}

function compareChallengeRecords(a, b) {
  return b.points - a.points || b.wins - a.wins || b.goalDiff - a.goalDiff || String(a.player).localeCompare(String(b.player));
}

async function signIn() {
  if (!isAuthConfigured()) {
    setAuthStatus("Falta firebaseWebApiKey en config.js.");
    return;
  }

  const result = await authRequest("accounts:signInWithPassword", {
    email: elements.authEmail.value.trim(),
    password: elements.authPassword.value,
    returnSecureToken: true,
  });

  saveAuthState(result);
  window.location.href = "./profile.html";
}

async function signUp() {
  if (!isAuthConfigured()) {
    setAuthStatus("Falta firebaseWebApiKey en config.js.");
    return;
  }

  const displayName = cleanName(elements.authName.value);
  const result = await authRequest("accounts:signUp", {
    email: elements.authEmail.value.trim(),
    password: elements.authPassword.value,
    returnSecureToken: true,
  });

  authState = normalizeAuthState(result, displayName);
  await authRequest("accounts:update", {
    idToken: authState.idToken,
    displayName,
    returnSecureToken: true,
  });
  persistAuthState();
  await persistUserProfile({
    email: authState.email,
    displayName: authState.displayName,
    photoUrl: "",
  });
  window.location.href = "./profile.html";
}

async function loadRankings() {
  if (!isCloudConfigured()) {
    setBoardsStatus("Firebase Database no esta configurado.");
    renderBoards();
    return;
  }

  try {
    const response = await fetch(rankingsListUrl());
    if (!response.ok) throw new Error("No se pudieron leer boards");
    rankings = (await response.json()) || {};
    setBoardsStatus("Tableros publicos actualizados.");
  } catch (error) {
    console.warn(error);
    rankings = {};
    setBoardsStatus("No se pudieron leer los tableros. Mostrando Black Dog por defecto.");
  }

  renderBoards();
}

function renderBoards() {
  elements.boardsList.innerHTML = "";
  const rankingsWithFallback = { ...rankings };
  if (!rankingsWithFallback["black-dog"]) {
    rankingsWithFallback["black-dog"] = {
      name: "Black Dog",
      visibility: "public",
      createdAt: "2026-05-14T00:00:00.000Z",
      state: {
        players: [],
        games: [],
      },
    };
  }

  const publicBoards = Object.entries(rankingsWithFallback)
    .filter(([, ranking]) => ranking && typeof ranking === "object")
    .filter(([, ranking]) => ranking.visibility !== "private")
    .sort((a, b) => String(b[1].createdAt || "").localeCompare(String(a[1].createdAt || "")));

  if (publicBoards.length === 0) {
    elements.boardsList.append(elements.emptyTemplate.content.firstElementChild.cloneNode(true));
    return;
  }

  publicBoards.forEach(([rankingId, ranking]) => {
    const card = document.createElement("article");
    card.className = "board-card";
    if (ranking.coverImage) {
      card.style.setProperty("--board-cover", `url("${ranking.coverImage}")`);
      card.classList.add("board-card-cover");
    }
    const state = ranking.state || {};
    const betKeeper = normalizeBetKeeper(ranking.betKeeper);
    const totalPlayers = Array.isArray(state.players) ? state.players.length : 0;
    const totalGames = Array.isArray(state.games) ? state.games.length : 0;
    card.innerHTML = `
      <div>
        <p class="eyebrow">Board publico</p>
        <h3>${escapeHtml(ranking.name || titleizeSlug(rankingId))}</h3>
        <span>${totalPlayers} jugadores · ${totalGames} juegos</span>
        ${betKeeper.enabled ? `
          <div class="betkeeper-summary">
            <strong>BetKeeper activo</strong>
            <span>${formatMoney(betKeeper.entryAmount, betKeeper.currency)} por jugador · ${escapeHtml(readableCriterion(betKeeper))}</span>
          </div>
        ` : ""}
      </div>
      <div class="board-actions">
        <a class="primary-link" href="${escapeHtml(publicRankingUrl(rankingId))}">Ver en vivo</a>
        ${betKeeper.enabled ? `<button type="button" class="ghost-button" data-betkeeper-ranking="${escapeHtml(rankingId)}">Reglas BetKeeper</button>` : ""}
      </div>
    `;
    elements.boardsList.append(card);
  });
}

function openBetKeeperRules(rankingId) {
  const ranking = rankings[rankingId] || {};
  const betKeeper = normalizeBetKeeper(ranking.betKeeper);
  elements.betKeeperTitle.textContent = `BetKeeper · ${ranking.name || titleizeSlug(rankingId)}`;
  elements.betKeeperContent.innerHTML = `
    <article>
      <strong>Entrada</strong>
      <span>${formatMoney(betKeeper.entryAmount, betKeeper.currency)} por jugador</span>
    </article>
    <article>
      <strong>Criterio ganador</strong>
      <span>${escapeHtml(readableCriterion(betKeeper))}</span>
    </article>
    <article>
      <strong>Reglas del juego</strong>
      <span>${escapeHtml(betKeeper.rules || "El creador todavía no cargó reglas del juego.")}</span>
    </article>
    <article>
      <strong>Reglas de pago</strong>
      <span>1. Participan · 2. Confirman el pago · 3. Juegan · 4. Todos dan el OK al ganador · 5. Premio liberado</span>
    </article>
  `;
  elements.betKeeperDialog.showModal();
}

function normalizeBetKeeper(betKeeper = {}) {
  return {
    enabled: Boolean(betKeeper.enabled),
    entryAmount: Number(betKeeper.entryAmount || 0),
    currency: betKeeper.currency || "ARS",
    winnerCriterion: betKeeper.winnerCriterion || "highest_total",
    manualCriterion: betKeeper.manualCriterion || "",
    rules: betKeeper.rules || "",
  };
}

function readableCriterion(betKeeper) {
  if (betKeeper.winnerCriterion === "manual") {
    return betKeeper.manualCriterion || "definido manualmente";
  }
  return "mayor puntaje total";
}

async function authRequest(action, body) {
  try {
    const response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/${action}?key=${encodeURIComponent(cloudConfig.firebaseWebApiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || "No se pudo autenticar");
    return data;
  } catch (error) {
    setAuthStatus(error.message);
    throw error;
  }
}

async function persistUserProfile(profile) {
  if (!authState || !isCloudConfigured()) return;

  await fetch(userProfileUrl(), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...profile,
      updatedAt: new Date().toISOString(),
    }),
  });
}

function saveAuthState(result) {
  authState = normalizeAuthState(result, result.displayName || elements.authName.value);
  persistAuthState();
  renderAuth();
}

function normalizeAuthState(result, displayName = "") {
  const expiresIn = Number.parseInt(result.expiresIn || "3600", 10);
  return {
    uid: result.localId,
    email: result.email,
    displayName: displayName || result.displayName || result.email,
    idToken: result.idToken,
    refreshToken: result.refreshToken || authState?.refreshToken || "",
    expiresAt: Date.now() + expiresIn * 1000,
  };
}

function persistAuthState() {
  window.localStorage.setItem(`${STORAGE_KEY}-auth`, JSON.stringify(authState));
}

function loadAuthState() {
  try {
    const saved = window.localStorage.getItem(`${STORAGE_KEY}-auth`);
    return saved ? JSON.parse(saved) : null;
  } catch {
    return null;
  }
}

function renderAuth() {
  if (!isAuthConfigured()) {
    setAuthStatus("Login desactivado: falta firebaseWebApiKey en config.js.");
    elements.logoutButton.hidden = true;
    return;
  }

  if (!authState) {
    elements.authTitle.textContent = "Ingresar";
    setAuthStatus("Crea usuario o inicia sesion para entrar a tu perfil.");
    elements.openLoginButton.textContent = "Login";
    elements.heroLoginButton.textContent = "Crear mi tablero";
    elements.logoutButton.hidden = true;
    return;
  }

  elements.authTitle.textContent = `Hola, ${authState.displayName}`;
  setAuthStatus(`Sesion activa: ${authState.email}.`);
  elements.openLoginButton.textContent = "Mi perfil";
  elements.heroLoginButton.textContent = "Ir a mi perfil";
  elements.logoutButton.hidden = false;
}

if (elements.challengeLink) {
  elements.challengeLink.href = `./challenge.html?ranking=${encodeURIComponent(cloudConfig.activeRankingId || cloudConfig.roomId || "black-dog")}`;
}

function openLoginDialog() {
  if (authState) {
    window.location.href = "./profile.html";
    return;
  }
  elements.loginDialog.showModal();
}

async function refreshAuthStateIfNeeded() {
  if (!authState || !authState.refreshToken || !isAuthConfigured()) return;
  if (authState.expiresAt && Date.now() < authState.expiresAt - AUTH_REFRESH_MARGIN_MS) return;

  try {
    const refreshed = await refreshAuthToken(authState.refreshToken);
    authState = normalizeAuthState(
      {
        localId: refreshed.user_id || authState.uid,
        email: authState.email,
        displayName: authState.displayName,
        idToken: refreshed.id_token,
        refreshToken: refreshed.refresh_token,
        expiresIn: refreshed.expires_in,
      },
      authState.displayName
    );
    persistAuthState();
  } catch (error) {
    console.warn(error);
  }
}

async function refreshAuthToken(refreshToken) {
  const response = await fetch(`https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(cloudConfig.firebaseWebApiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || "No se pudo renovar la sesion");
  return data;
}

function rankingsListUrl() {
  const baseUrl = cloudConfig.firebaseDatabaseUrl.replace(/\/$/, "");
  return `${baseUrl}/rankings.json`;
}

function challengeScoresUrl() {
  const baseUrl = cloudConfig.firebaseDatabaseUrl.replace(/\/$/, "");
  const ranking = encodeURIComponent(cloudConfig.activeRankingId || cloudConfig.roomId || "black-dog");
  return `${baseUrl}/rankings/${ranking}/challengeScores/${CHALLENGE_ID}.json`;
}

function userProfileUrl() {
  const baseUrl = cloudConfig.firebaseDatabaseUrl.replace(/\/$/, "");
  return `${baseUrl}/users/${encodeURIComponent(authState.uid)}.json?auth=${encodeURIComponent(authState.idToken)}`;
}

function isCloudConfigured() {
  return cloudConfig.firebaseDatabaseUrl.trim().length > 0;
}

function isAuthConfigured() {
  return Boolean(cloudConfig.firebaseWebApiKey && cloudConfig.firebaseWebApiKey.trim());
}

function publicRankingUrl(rankingId) {
  return `${window.location.origin}/viewer.html?ranking=${encodeURIComponent(rankingId)}`;
}

function cleanName(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function titleizeSlug(value) {
  return String(value)
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function setAuthStatus(message) {
  elements.authStatus.textContent = message;
}

function setBoardsStatus(message) {
  if (elements.boardsStatus) elements.boardsStatus.textContent = message;
}

function formatScore(value) {
  return Number(value || 0).toLocaleString("es-AR");
}

function formatMoney(value, currency) {
  const amount = Number(value || 0).toLocaleString("es-AR");
  return `${currency} ${amount}`;
}

function startArcadeEffects() {
  const modes = ["ship", "invaders", "orbit", "race"];
  let currentMode = 0;

  window.setInterval(() => {
    let nextMode = Math.floor(Math.random() * modes.length);
    if (nextMode === currentMode) {
      nextMode = (nextMode + 1) % modes.length;
    }

    currentMode = nextMode;
    elements.arcadeScreen.className = `arcade-screen arcade-mode-${modes[currentMode]}`;
  }, 4200);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
