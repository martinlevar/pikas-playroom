const STORAGE_KEY = "arcade-night-scoreboard-v1";
const RANKING_KEY = `${STORAGE_KEY}-ranking-id`;
const AUTH_REFRESH_MARGIN_MS = 5 * 60 * 1000;

const cloudConfig = window.ARCADE_CLOUD_CONFIG || {
  firebaseDatabaseUrl: "",
  firebaseWebApiKey: "",
  activeRankingId: "black-dog",
  roomId: "torneo-black-dog",
};

const initialState = {
  finished: false,
  history: {},
  players: ["Martin", "Nico", "Fede"],
  games: ["Pac-Man", "Galaga", "Street Fighter", "Daytona", "Metal Slug"],
  scores: {
    Martin: {
      "Pac-Man": 4345,
      Galaga: 3450,
    },
    Nico: {
      "Pac-Man": 3900,
    },
    Fede: {
      Galaga: 4200,
    },
  },
};

const state = loadState();
let authState = loadAuthState();
let currentRankingId = loadRankingId();
let rankingsCache = {};
let editorsCache = {};
let cloudReady = false;
let cloudWriteTimer = null;
let cloudEvents = null;

const elements = {
  authForm: document.querySelector("#auth-form"),
  authTitle: document.querySelector("#auth-title"),
  authStatus: document.querySelector("#auth-status"),
  authName: document.querySelector("#auth-name"),
  authEmail: document.querySelector("#auth-email"),
  authPassword: document.querySelector("#auth-password"),
  signupButton: document.querySelector("#signup-button"),
  logoutButton: document.querySelector("#logout-button"),
  rankingForm: document.querySelector("#ranking-form"),
  rankingName: document.querySelector("#ranking-name"),
  rankingSlug: document.querySelector("#ranking-slug"),
  rankingVisibility: document.querySelector("#ranking-visibility"),
  rankingSelect: document.querySelector("#ranking-select"),
  rankingStatus: document.querySelector("#ranking-status"),
  publicRankingLink: document.querySelector("#public-ranking-link"),
  editorForm: document.querySelector("#editor-form"),
  editorEmail: document.querySelector("#editor-email"),
  editorStatus: document.querySelector("#editor-status"),
  editorsList: document.querySelector("#editors-list"),
  playerForm: document.querySelector("#player-form"),
  gameForm: document.querySelector("#game-form"),
  scoreForm: document.querySelector("#score-form"),
  playerName: document.querySelector("#player-name"),
  gameName: document.querySelector("#game-name"),
  scorePlayer: document.querySelector("#score-player"),
  scoreGame: document.querySelector("#score-game"),
  scoreValue: document.querySelector("#score-value"),
  arcadeScreen: document.querySelector("#arcade-screen"),
  leaderTitle: document.querySelector("#leader-title"),
  leaderDetail: document.querySelector("#leader-detail"),
  leaderboard: document.querySelector("#leaderboard"),
  scoreTable: document.querySelector("#score-table"),
  recordsTable: document.querySelector("#records-table"),
  playersList: document.querySelector("#players-list"),
  gamesList: document.querySelector("#games-list"),
  playersLiveList: document.querySelector("#players-live-list"),
  gamesLiveList: document.querySelector("#games-live-list"),
  finishButton: document.querySelector("#finish-button"),
  resetButton: document.querySelector("#reset-button"),
  syncBadge: document.querySelector("#sync-badge"),
  syncLabel: document.querySelector("#sync-label"),
  gameChallengeLink: document.querySelector("#game-challenge-link"),
  gameViewerLink: document.querySelector("#game-viewer-link"),
  editBoardButton: document.querySelector("#edit-board-button"),
  boardSettingsDialog: document.querySelector("#board-settings-dialog"),
  closeBoardSettings: document.querySelector("#close-board-settings"),
  boardSettingsForm: document.querySelector("#board-settings-form"),
  boardName: document.querySelector("#board-name"),
  boardVisibility: document.querySelector("#board-visibility"),
  boardCover: document.querySelector("#board-cover"),
  settingsPublicLink: document.querySelector("#settings-public-link"),
  settingsEditorForm: document.querySelector("#settings-editor-form"),
  settingsEditorEmail: document.querySelector("#settings-editor-email"),
  settingsStatus: document.querySelector("#settings-status"),
  overwriteDialog: document.querySelector("#overwrite-dialog"),
  overwriteTitle: document.querySelector("#overwrite-title"),
  overwriteMessage: document.querySelector("#overwrite-message"),
  keepScoreButton: document.querySelector("#keep-score-button"),
  changeScoreButton: document.querySelector("#change-score-button"),
  emptyTemplate: document.querySelector("#empty-state-template"),
};

if (elements.authForm) {
  elements.authForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await signIn();
  });
}

if (elements.signupButton) {
  elements.signupButton.addEventListener("click", async () => {
    await signUp();
  });
}

if (elements.logoutButton) {
  elements.logoutButton.addEventListener("click", () => {
    authState = null;
    window.localStorage.removeItem(`${STORAGE_KEY}-auth`);
    renderAuth();
  });
}

if (elements.rankingForm) {
  elements.rankingForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await createRankingFromForm();
  });
}

if (elements.rankingSelect) {
  elements.rankingSelect.addEventListener("change", async () => {
    await switchRanking(elements.rankingSelect.value);
  });
}

if (elements.editorForm) {
  elements.editorForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await inviteEditorByEmail();
  });
}

if (elements.editBoardButton) {
  elements.editBoardButton.addEventListener("click", openBoardSettings);
}

if (elements.closeBoardSettings) {
  elements.closeBoardSettings.addEventListener("click", () => {
    elements.boardSettingsDialog.close();
  });
}

if (elements.boardSettingsForm) {
  elements.boardSettingsForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await saveBoardSettings();
  });
}

if (elements.settingsEditorForm) {
  elements.settingsEditorForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await inviteEditorFromSettings();
  });
}

elements.playerForm.addEventListener("submit", (event) => {
  event.preventDefault();
  addPlayer(elements.playerName.value);
  elements.playerName.value = "";
});

elements.gameForm.addEventListener("submit", (event) => {
  event.preventDefault();
  addGame(elements.gameName.value);
  elements.gameName.value = "";
});

elements.scoreForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const saved = await saveScore(
    elements.scorePlayer.value,
    elements.scoreGame.value,
    Number.parseInt(elements.scoreValue.value, 10)
  );
  if (!saved) return;

  elements.scoreValue.value = "";
  elements.scoreValue.focus();
});

elements.resetButton.addEventListener("click", () => {
  const confirmed = window.confirm("Borrar todos los datos de esta noche?");
  if (!confirmed) return;

  state.finished = false;
  state.players = [];
  state.games = [];
  state.scores = {};
  persist();
  render();
});

elements.finishButton.addEventListener("click", () => {
  const nextFinished = !state.finished;
  const message = nextFinished
    ? "Terminar el torneo y anunciar el ganador?"
    : "Reabrir el torneo para seguir cargando puntos?";
  const confirmed = window.confirm(message);
  if (!confirmed) return;

  state.finished = nextFinished;
  persist();
  render();
});

initializeApp();
startArcadeEffects();

async function initializeApp() {
  resetInitialScroll();
  await refreshAuthStateIfNeeded();
  render();
  renderAuth();
  renderRankingPanel();
  await connectCloud();
  await loadRankingList();
  await loadEditors();
}

function resetInitialScroll() {
  if (window.location.hash) {
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
  }
  if ("scrollRestoration" in window.history) {
    window.history.scrollRestoration = "manual";
  }
  window.scrollTo({ top: 0, left: 0 });
  window.addEventListener("load", () => window.scrollTo({ top: 0, left: 0 }), { once: true });
}

async function signIn() {
  if (!isAuthConfigured()) {
    setAuthStatus("Configura firebaseWebApiKey en config.js para activar login.");
    return;
  }

  const email = elements.authEmail.value.trim();
  const password = elements.authPassword.value;
  const result = await authRequest("accounts:signInWithPassword", {
    email,
    password,
    returnSecureToken: true,
  });

  saveAuthState(result);
}

async function signUp() {
  if (!isAuthConfigured()) {
    setAuthStatus("Configura firebaseWebApiKey en config.js para crear usuarios.");
    return;
  }

  const displayName = cleanName(elements.authName.value);
  const email = elements.authEmail.value.trim();
  const password = elements.authPassword.value;
  const result = await authRequest("accounts:signUp", {
    email,
    password,
    returnSecureToken: true,
  });

  authState = normalizeAuthState(result, displayName);
  await authRequest("accounts:update", {
    idToken: authState.idToken,
    displayName,
    returnSecureToken: true,
  });
  persistAuthState();
  renderAuth();
  await saveUserProfile();
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
    setAuthStatus("No se pudo renovar la sesion. Si algo falla, cerra sesion y volve a entrar.");
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

function loadRankingId() {
  const urlRanking = new URLSearchParams(window.location.search).get("ranking");
  if (urlRanking) return slugify(urlRanking);

  const savedRanking = window.localStorage.getItem(RANKING_KEY);
  return savedRanking || cloudConfig.activeRankingId || cloudConfig.roomId;
}

function persistRankingId() {
  window.localStorage.setItem(RANKING_KEY, currentRankingId);
}

function renderAuth() {
  if (!elements.authForm) return;

  if (!isAuthConfigured()) {
    setAuthStatus("Login desactivado: falta firebaseWebApiKey en config.js.");
    elements.logoutButton.hidden = true;
    return;
  }

  if (!authState) {
    elements.authTitle.textContent = "Mesa oficial";
    setAuthStatus("Ingresa o crea un usuario para administrar rankings.");
    elements.logoutButton.hidden = true;
    return;
  }

  elements.authTitle.textContent = `Hola, ${authState.displayName}`;
  setAuthStatus(`Sesion activa: ${authState.email}`);
  elements.logoutButton.hidden = false;
}

function renderBoardControls() {
  const ranking = rankingsCache[currentRankingId];
  const isOwner = Boolean(authState?.uid && ranking?.ownerUid === authState.uid);
  if (elements.editBoardButton) {
    elements.editBoardButton.hidden = !isOwner;
  }
  if (elements.settingsPublicLink) {
    const publicUrl = publicRankingUrl(currentRankingId);
    elements.settingsPublicLink.href = publicUrl;
    elements.settingsPublicLink.textContent = publicUrl;
  }
  if (elements.gameViewerLink) {
    elements.gameViewerLink.href = publicRankingUrl(currentRankingId);
  }
  if (elements.gameChallengeLink) {
    elements.gameChallengeLink.href = `./challenge.html?ranking=${encodeURIComponent(currentRankingId)}`;
  }
}

function setAuthStatus(message) {
  if (elements.authStatus) elements.authStatus.textContent = message;
}

async function saveUserProfile() {
  if (!authState || !isCloudConfigured()) return;

  await fetch(userProfileUrl(), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: authState.email,
      displayName: authState.displayName,
      updatedAt: new Date().toISOString(),
    }),
  });
  await claimEditorInvite();
}

async function createRankingFromForm() {
  if (!authState) {
    setRankingStatus("Inicia sesion para crear un ranking.");
    return;
  }

  if (!isCloudConfigured()) {
    setRankingStatus("Configura Firebase Database para crear rankings.");
    return;
  }

  const name = cleanName(elements.rankingName.value);
  const rankingId = slugify(elements.rankingSlug.value || name);
  const visibility = elements.rankingVisibility.value === "private" ? "private" : "public";
  if (!name || !rankingId) {
    setRankingStatus("Escribi un nombre para el ranking.");
    return;
  }

  const blankState = createBlankTournamentState();
  const cloudState = toCloudState(blankState);
  const response = await fetch(rankingRootUrl(rankingId), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      ownerUid: authState.uid,
      editors: {
        [authState.uid]: true,
      },
      visibility,
      createdAt: new Date().toISOString(),
      state: cloudState,
    }),
  });

  if (!response.ok) {
    setRankingStatus("No se pudo crear el ranking. Revisa reglas/permisos.");
    return;
  }

  elements.rankingName.value = "";
  elements.rankingSlug.value = "";
  currentRankingId = rankingId;
  persistRankingId();
  replaceState(normalizeState(cloudState));
  setRankingStatus(visibility === "public" ? `Ranking publico creado: ${name}` : `Ranking privado creado: ${name}. Comparte solo el link.`);
  await loadRankingList();
  await connectCloud();
  await loadEditors();
}

async function switchRanking(rankingId) {
  if (!rankingId || rankingId === currentRankingId) return;

  currentRankingId = rankingId;
  persistRankingId();
  cloudReady = false;
  setRankingStatus(`Cambiando a ${getRankingName(rankingId)}...`);
  await connectCloud();
  await loadEditors();
  renderRankingPanel();
}

async function loadRankingList() {
  if (!isCloudConfigured()) {
    renderRankingPanel();
    return;
  }

  try {
    const response = await fetch(rankingsListUrl());
    if (!response.ok) throw new Error("No se pudieron leer rankings");
    rankingsCache = (await response.json()) || {};
  } catch (error) {
    console.warn(error);
    rankingsCache = {};
  }

  renderRankingPanel();
}

function renderRankingPanel() {
  renderBoardControls();
  if (!elements.rankingSelect) return;

  const knownRankingMap = { ...rankingsCache };
  if (!knownRankingMap[currentRankingId]) {
    knownRankingMap[currentRankingId] = { name: getRankingName(currentRankingId) };
  }
  const knownRankings = Object.entries(knownRankingMap);

  elements.rankingSelect.innerHTML = knownRankings
    .map(([rankingId, ranking]) => {
      const selected = rankingId === currentRankingId ? " selected" : "";
      return `<option value="${escapeHtml(rankingId)}"${selected}>${escapeHtml(ranking.name || rankingId)}</option>`;
    })
    .join("");

  const publicUrl = publicRankingUrl(currentRankingId);
  elements.publicRankingLink.href = publicUrl;
  elements.publicRankingLink.textContent = publicUrl;
  if (!elements.rankingStatus.textContent) {
    setRankingStatus(`Ranking activo: ${getRankingName(currentRankingId)}`);
  }
}

function setRankingStatus(message) {
  if (elements.rankingStatus) elements.rankingStatus.textContent = message;
}

async function inviteEditorByEmail() {
  if (!authState) {
    setEditorStatus("Inicia sesion para invitar editores.");
    return;
  }

  const email = elements.editorEmail.value.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    setEditorStatus("Escribi un email valido.");
    return;
  }

  const invited = await inviteEditorByEmailValue(email);
  if (!invited) {
    setEditorStatus("No se pudo invitar. Solo el creador del tablero puede hacerlo.");
    return;
  }

  elements.editorEmail.value = "";
  setEditorStatus(`Editor invitado: ${email}`);
}

async function loadEditors() {
  if (!elements.editorsList || !isCloudConfigured()) return;

  try {
    const response = await fetch(invitedEditorsListUrl());
    editorsCache = response.ok ? (await response.json()) || {} : {};
  } catch (error) {
    console.warn(error);
    editorsCache = {};
  }

  renderEditors();
  await claimEditorInvite();
}

function renderEditors() {
  if (!elements.editorsList) return;

  elements.editorsList.innerHTML = "";
  const editors = Object.values(editorsCache || {});
  if (editors.length === 0) {
    elements.editorsList.append(createInlineEmptyState("Sin editores invitados"));
    return;
  }

  editors.forEach((editor) => {
    const chip = document.createElement("div");
    chip.className = "data-chip data-chip-live";
    chip.innerHTML = `<span>${escapeHtml(editor.email || "Editor")}</span>`;
    elements.editorsList.append(chip);
  });
}

async function claimEditorInvite() {
  if (!authState || !isCloudConfigured()) return;

  const emailKey = emailToKey(authState.email);
  const invite = editorsCache[emailKey];
  if (!invite) return;

  await fetch(editorUidUrl(authState.uid), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(true),
  });
  setEditorStatus(`Tu usuario esta habilitado para editar ${getRankingName(currentRankingId)}.`);
}

function setEditorStatus(message) {
  if (elements.editorStatus) elements.editorStatus.textContent = message;
}

function openBoardSettings() {
  const ranking = rankingsCache[currentRankingId] || {};
  elements.boardName.value = ranking.name || getRankingName(currentRankingId);
  elements.boardVisibility.value = ranking.visibility === "private" ? "private" : "public";
  if (elements.settingsStatus) elements.settingsStatus.textContent = "";
  elements.boardSettingsDialog.showModal();
}

async function saveBoardSettings() {
  const ranking = rankingsCache[currentRankingId];
  if (!ranking || ranking.ownerUid !== authState?.uid) {
    setSettingsStatus("Solo el creador puede editar este tablero.");
    return;
  }

  const updates = {
    name: cleanName(elements.boardName.value) || getRankingName(currentRankingId),
    visibility: elements.boardVisibility.value === "private" ? "private" : "public",
  };

  if (elements.boardCover.files?.[0]) {
    updates.coverImage = await fileToDataUrl(elements.boardCover.files[0]);
  }

  const response = await fetch(rankingSettingsUrl(), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });

  if (!response.ok) {
    setSettingsStatus("No se pudieron guardar los cambios.");
    return;
  }

  setSettingsStatus("Cambios guardados.");
  elements.boardCover.value = "";
  await loadRankingList();
}

async function inviteEditorFromSettings() {
  const email = elements.settingsEditorEmail.value.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    setSettingsStatus("Escribi un email valido.");
    return;
  }

  await inviteEditorByEmailValue(email);
  elements.settingsEditorEmail.value = "";
}

async function inviteEditorByEmailValue(email) {
  const response = await fetch(invitedEditorUrl(email), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      invitedBy: authState.uid,
      createdAt: new Date().toISOString(),
    }),
  });

  if (!response.ok) {
    setSettingsStatus("No se pudo agregar admin.");
    return false;
  }

  setSettingsStatus(`Admin invitado: ${email}`);
  await loadEditors();
  return true;
}

function setSettingsStatus(message) {
  if (elements.settingsStatus) elements.settingsStatus.textContent = message;
}

function addPlayer(rawName) {
  const name = cleanName(rawName);
  if (!name || state.players.includes(name)) return;

  state.players.push(name);
  state.scores[name] = {};
  persist();
  render();
}

function addGame(rawName) {
  const name = cleanName(rawName);
  if (!name || state.games.includes(name)) return;

  state.games.push(name);
  persist();
  render();
}

async function saveScore(player, game, points) {
  if (!player || !game || !Number.isFinite(points) || points < 0) return false;

  state.scores[player] = state.scores[player] || {};
  const previousScore = state.scores[player][game];
  if (Number.isFinite(previousScore)) {
    const confirmed = await confirmScoreOverwrite(player, game, previousScore);
    if (!confirmed) return false;
  }

  state.scores[player][game] = points;
  updateGameHistory(player, game, points);
  persist();
  render();
  return true;
}

function updateGameHistory(player, game, points) {
  state.history = state.history || {};
  const currentRecord = state.history[game];
  if (!currentRecord || points > currentRecord.points) {
    state.history[game] = {
      player,
      points,
      updatedAt: new Date().toISOString(),
    };
  }
}

function confirmScoreOverwrite(player, game, previousScore) {
  elements.overwriteTitle.textContent = `${player} ya jugo ${game}`;
  elements.overwriteMessage.textContent = `Tiene cargados ${formatScore(previousScore)} puntos. Queres cambiar ese puntaje o dejar el actual?`;

  return new Promise((resolve) => {
    const close = (shouldOverwrite) => {
      elements.changeScoreButton.removeEventListener("click", changeHandler);
      elements.keepScoreButton.removeEventListener("click", keepHandler);
      elements.overwriteDialog.removeEventListener("cancel", cancelHandler);
      elements.overwriteDialog.close();
      resolve(shouldOverwrite);
    };

    const changeHandler = () => close(true);
    const keepHandler = () => close(false);
    const cancelHandler = (event) => {
      event.preventDefault();
      close(false);
    };

    elements.changeScoreButton.addEventListener("click", changeHandler);
    elements.keepScoreButton.addEventListener("click", keepHandler);
    elements.overwriteDialog.addEventListener("cancel", cancelHandler);
    elements.overwriteDialog.showModal();
  });
}

function removePlayer(player) {
  state.players = state.players.filter((name) => name !== player);
  delete state.scores[player];
  persist();
  render();
}

function removeGame(game) {
  state.games = state.games.filter((name) => name !== game);
  state.players.forEach((player) => {
    if (state.scores[player]) delete state.scores[player][game];
  });
  persist();
  render();
}

function render() {
  renderSelects();
  renderLeaderHero();
  renderLeaderboard();
  renderTable();
  renderRecords();
  renderLists();
}

function renderSelects() {
  elements.scorePlayer.innerHTML = buildOptions(state.players, "Elegir jugador");
  elements.scoreGame.innerHTML = buildOptions(state.games, "Elegir juego");
  elements.finishButton.textContent = state.finished ? "Reabrir torneo" : "Terminar torneo";
  elements.finishButton.classList.toggle("is-finished", state.finished);
  elements.scoreForm
    .querySelectorAll("input, select, button")
    .forEach((control) => {
      control.disabled = state.players.length === 0 || state.games.length === 0;
    });
}

function renderLeaderHero() {
  const [leader, runnerUp] = getRanking();

  if (!leader || leader.total === 0) {
    elements.leaderTitle.textContent = state.finished
      ? "Torneo terminado sin puntajes"
      : "La noche todavia no tiene campeon";
    elements.leaderDetail.textContent = state.finished
      ? "No hubo puntos cargados para declarar un ganador."
      : "Carga el primer puntaje y la tabla se ordena sola.";
    return;
  }

  const margin = runnerUp ? leader.total - runnerUp.total : leader.total;
  if (state.finished) {
    elements.leaderTitle.textContent = `${leader.name} es el ganador`;
    elements.leaderDetail.textContent = runnerUp
      ? `Campeon con ${formatScore(leader.total)} puntos. Diferencia final: ${formatScore(margin)} sobre ${runnerUp.name}.`
      : `Campeon con ${formatScore(leader.total)} puntos.`;
    return;
  }

  elements.leaderTitle.textContent = `${leader.name} va ganando con ${formatScore(leader.total)}`;
  elements.leaderDetail.textContent = runnerUp
    ? `Le saca ${formatScore(margin)} puntos a ${runnerUp.name}.`
    : "Primer puntaje de la competencia.";
}

function renderLeaderboard() {
  const ranking = getRanking();
  elements.leaderboard.innerHTML = "";

  if (ranking.length === 0) {
    elements.leaderboard.append(createEmptyState());
    return;
  }

  ranking.forEach((entry, index) => {
    const row = document.createElement("article");
    row.className = "leader-row";
    row.innerHTML = `
      <div class="rank-number">${index + 1}</div>
      <div class="leader-main">
        <strong>${escapeHtml(entry.name)}</strong>
        <span>${entry.played}/${state.games.length} juegos cargados</span>
      </div>
      <div class="total-score">${formatScore(entry.total)}</div>
    `;
    elements.leaderboard.append(row);
  });
}

function renderTable() {
  if (state.players.length === 0 || state.games.length === 0) {
    elements.scoreTable.innerHTML = "";
    const empty = document.createElement("caption");
    empty.append(createEmptyState());
    elements.scoreTable.append(empty);
    return;
  }

  const headerCells = state.games
    .map((game) => `<th scope="col">${escapeHtml(game)}</th>`)
    .join("");

  const rows = getRanking()
    .map((entry) => {
      const scoreCells = state.games
        .map((game) => {
          const value = state.scores[entry.name]?.[game];
          return `<td>${value === undefined ? "-" : formatScore(value)}</td>`;
        })
        .join("");

      return `
        <tr>
          <th scope="row">${escapeHtml(entry.name)}</th>
          ${scoreCells}
          <td class="table-total">${formatScore(entry.total)}</td>
        </tr>
      `;
    })
    .join("");

  elements.scoreTable.innerHTML = `
    <thead>
      <tr>
        <th scope="col">Jugador</th>
        ${headerCells}
        <th scope="col">Total</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  `;
}

function renderRecords() {
  if (!elements.recordsTable) return;

  const records = getGameRecords();
  if (records.length === 0) {
    elements.recordsTable.innerHTML = "";
    const empty = document.createElement("caption");
    empty.append(createEmptyState());
    elements.recordsTable.append(empty);
    return;
  }

  const rows = records
    .map(
      (record) => `
        <tr>
          <th scope="row">${escapeHtml(record.game)}</th>
          <td>${escapeHtml(record.player)}</td>
          <td class="table-total">${formatScore(record.points)}</td>
        </tr>
      `
    )
    .join("");

  elements.recordsTable.innerHTML = `
    <thead>
      <tr>
        <th scope="col">Juego</th>
        <th scope="col">Record holder</th>
        <th scope="col">Record</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  `;
}

function renderLists() {
  elements.playersList.innerHTML = "";
  elements.gamesList.innerHTML = "";
  elements.playersLiveList.innerHTML = "";
  elements.gamesLiveList.innerHTML = "";

  if (state.players.length === 0) {
    elements.playersList.append(createEmptyState());
    elements.playersLiveList.append(createInlineEmptyState("Sin jugadores todavia"));
  } else {
    state.players.forEach((player) => {
      const remove = () => removePlayer(player);
      elements.playersList.append(createChip(player, remove));
      elements.playersLiveList.append(createChip(player, remove, "live"));
    });
  }

  if (state.games.length === 0) {
    elements.gamesList.append(createEmptyState());
    elements.gamesLiveList.append(createInlineEmptyState("Sin juegos todavia"));
  } else {
    state.games.forEach((game) => {
      const remove = () => removeGame(game);
      elements.gamesList.append(createChip(game, remove));
      elements.gamesLiveList.append(createChip(game, remove, "live"));
    });
  }
}

function createChip(label, onRemove, variant = "") {
  const chip = document.createElement("div");
  chip.className = variant ? `data-chip data-chip-${variant}` : "data-chip";
  chip.innerHTML = `<span>${escapeHtml(label)}</span><button type="button" aria-label="Quitar ${escapeHtml(label)}">x</button>`;
  chip.querySelector("button").addEventListener("click", onRemove);
  return chip;
}

function createInlineEmptyState(message) {
  const empty = document.createElement("p");
  empty.className = "inline-empty";
  empty.textContent = message;
  return empty;
}

function createEmptyState() {
  return elements.emptyTemplate.content.firstElementChild.cloneNode(true);
}

function getRanking() {
  return state.players
    .map((name) => {
      const scores = state.scores[name] || {};
      const values = state.games.map((game) => scores[game]).filter(Number.isFinite);
      const total = values.reduce((sum, score) => sum + score, 0);
      return { name, total, played: values.length };
    })
    .sort((a, b) => b.total - a.total || b.played - a.played || a.name.localeCompare(b.name));
}

function getGameRecords() {
  const history = state.history || {};
  return Object.entries(history)
    .map(([game, record]) => ({
      game,
      player: record.player,
      points: record.points,
    }))
    .filter((record) => record.player && Number.isFinite(record.points))
    .sort((a, b) => b.points - a.points || a.game.localeCompare(b.game));
}

function buildOptions(items, placeholder) {
  const options = [`<option value="">${placeholder}</option>`];
  items.forEach((item) => {
    options.push(`<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`);
  });
  return options.join("");
}

function cleanName(value) {
  return value.trim().replace(/\s+/g, " ");
}

function slugify(value) {
  return cleanName(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function formatScore(value) {
  return new Intl.NumberFormat("es-AR").format(value);
}

function createBlankTournamentState() {
  return {
    finished: false,
    history: {},
    players: [],
    games: [],
    scores: {},
  };
}

function getRankingName(rankingId) {
  return rankingsCache[rankingId]?.name || titleizeSlug(rankingId);
}

function titleizeSlug(value) {
  return String(value)
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function publicRankingUrl(rankingId) {
  const baseUrl = window.location.origin === "null"
    ? "./viewer.html"
    : `${window.location.origin}/viewer.html`;
  return `${baseUrl}?ranking=${encodeURIComponent(rankingId)}`;
}

function loadState() {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved) return structuredClone(initialState);
    const parsed = JSON.parse(saved);
    return {
      finished: Boolean(parsed.finished),
      history: parsed.history && typeof parsed.history === "object" ? parsed.history : {},
      players: Array.isArray(parsed.players) ? parsed.players : [],
      games: Array.isArray(parsed.games) ? parsed.games : [],
      scores: parsed.scores && typeof parsed.scores === "object" ? parsed.scores : {},
    };
  } catch {
    return structuredClone(initialState);
  }
}

function persist() {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  scheduleCloudSave();
}

async function connectCloud() {
  if (!isCloudConfigured()) {
    setSyncStatus("Local");
    return;
  }

  if (cloudEvents) {
    cloudEvents.close();
    cloudEvents = null;
  }

  setSyncStatus("Conectando");
  setRankingStatus(`Ranking activo: ${getRankingName(currentRankingId)}`);

  try {
    const response = await fetch(cloudUrl());
    if (!response.ok) throw new Error("No se pudo leer Firebase");

    const data = await response.json();
    if (data) {
      replaceState(normalizeState(data));
    } else if (authState) {
      await createRankingNow();
    } else {
      await saveCloudNow();
    }

    startCloudStream();
    cloudReady = true;
    setSyncStatus("Online");
  } catch (error) {
    console.warn(error);
    setSyncStatus("Offline");
  }
}

function startCloudStream() {
  cloudEvents = new EventSource(cloudUrl());

  cloudEvents.addEventListener("put", (event) => {
    applyCloudEvent(event);
  });

  cloudEvents.addEventListener("patch", (event) => {
    applyCloudEvent(event);
  });

  cloudEvents.addEventListener("error", () => {
    setSyncStatus("Reconectando");
  });
}

function applyCloudEvent(event) {
  try {
    const message = JSON.parse(event.data);
    if (!message.data || message.path !== "/") return;

    replaceState(normalizeState(message.data));
    cloudReady = true;
    setSyncStatus("Online");
  } catch (error) {
    console.warn(error);
  }
}

function replaceState(nextState) {
  state.finished = nextState.finished;
  state.history = nextState.history;
  state.players = nextState.players;
  state.games = nextState.games;
  state.scores = nextState.scores;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  render();
}

function scheduleCloudSave() {
  if (!isCloudConfigured() || !cloudReady) return;

  window.clearTimeout(cloudWriteTimer);
  cloudWriteTimer = window.setTimeout(() => {
    saveCloudNow();
  }, 250);
}

async function saveCloudNow() {
  if (!isCloudConfigured()) return;

  setSyncStatus("Guardando");

  try {
    const response = await fetch(cloudUrl(), {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(toCloudState(state)),
    });

    if (!response.ok) throw new Error("No se pudo guardar en Firebase");
    setSyncStatus("Online");
  } catch (error) {
    console.warn(error);
    setSyncStatus("Offline");
  }
}

async function createRankingNow() {
  if (!isCloudConfigured() || !authState) return;

  const response = await fetch(rankingRootUrl(currentRankingId), {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: getRankingName(currentRankingId),
      ownerUid: authState.uid,
      editors: {
        [authState.uid]: true,
      },
      createdAt: new Date().toISOString(),
      state: toCloudState(state),
    }),
  });

  if (!response.ok) throw new Error("No se pudo crear el ranking");
}

function isCloudConfigured() {
  return cloudConfig.firebaseDatabaseUrl.trim().length > 0;
}

function isAuthConfigured() {
  return Boolean(cloudConfig.firebaseWebApiKey && cloudConfig.firebaseWebApiKey.trim());
}

function cloudUrl() {
  const baseUrl = cloudConfig.firebaseDatabaseUrl.replace(/\/$/, "");
  const ranking = encodeURIComponent(currentRankingId);
  return withAuthParam(`${baseUrl}/rankings/${ranking}/state.json`);
}

function userProfileUrl() {
  const baseUrl = cloudConfig.firebaseDatabaseUrl.replace(/\/$/, "");
  return withAuthParam(`${baseUrl}/users/${encodeURIComponent(authState.uid)}.json`);
}

function rankingRootUrl(rankingId = currentRankingId) {
  const baseUrl = cloudConfig.firebaseDatabaseUrl.replace(/\/$/, "");
  const ranking = encodeURIComponent(rankingId);
  return withAuthParam(`${baseUrl}/rankings/${ranking}.json`);
}

function rankingSettingsUrl() {
  const baseUrl = cloudConfig.firebaseDatabaseUrl.replace(/\/$/, "");
  const ranking = encodeURIComponent(currentRankingId);
  return withAuthParam(`${baseUrl}/rankings/${ranking}.json`);
}

function rankingsListUrl() {
  const baseUrl = cloudConfig.firebaseDatabaseUrl.replace(/\/$/, "");
  return `${baseUrl}/rankings.json`;
}

function invitedEditorsListUrl() {
  const baseUrl = cloudConfig.firebaseDatabaseUrl.replace(/\/$/, "");
  const ranking = encodeURIComponent(currentRankingId);
  return withAuthParam(`${baseUrl}/rankings/${ranking}/invitedEditors.json`);
}

function invitedEditorUrl(email) {
  const baseUrl = cloudConfig.firebaseDatabaseUrl.replace(/\/$/, "");
  const ranking = encodeURIComponent(currentRankingId);
  return withAuthParam(`${baseUrl}/rankings/${ranking}/invitedEditors/${emailToKey(email)}.json`);
}

function editorUidUrl(uid) {
  const baseUrl = cloudConfig.firebaseDatabaseUrl.replace(/\/$/, "");
  const ranking = encodeURIComponent(currentRankingId);
  return withAuthParam(`${baseUrl}/rankings/${ranking}/editors/${encodeURIComponent(uid)}.json`);
}

function withAuthParam(url) {
  if (!authState?.idToken) return url;
  return `${url}?auth=${encodeURIComponent(authState.idToken)}`;
}

function toCloudState(source) {
  const scoreRows = [];

  source.players.forEach((player) => {
    source.games.forEach((game) => {
      const points = source.scores[player]?.[game];
      if (Number.isFinite(points)) {
        scoreRows.push({ player, game, points });
      }
    });
  });

  return {
    finished: Boolean(source.finished),
    history: source.history || {},
    players: source.players,
    games: source.games,
    scores: scoreRows,
    updatedAt: new Date().toISOString(),
  };
}

function normalizeState(source) {
  const finished = Boolean(source.finished);
  const history = normalizeHistory(source.history);
  const players = Array.isArray(source.players) ? source.players.filter(Boolean) : [];
  const games = Array.isArray(source.games) ? source.games.filter(Boolean) : [];
  const scores = {};

  players.forEach((player) => {
    scores[player] = {};
  });

  if (Array.isArray(source.scores)) {
    source.scores.forEach((row) => {
      if (!row?.player || !row?.game || !Number.isFinite(row.points)) return;
      scores[row.player] = scores[row.player] || {};
      scores[row.player][row.game] = row.points;
    });
  } else if (source.scores && typeof source.scores === "object") {
    Object.entries(source.scores).forEach(([player, playerScores]) => {
      if (!playerScores || typeof playerScores !== "object") return;
      scores[player] = scores[player] || {};
      Object.entries(playerScores).forEach(([game, points]) => {
        if (Number.isFinite(points)) scores[player][game] = points;
      });
    });
  }

  return { finished, history, players, games, scores };
}

function normalizeHistory(source) {
  if (!source || typeof source !== "object") return {};

  const history = {};
  Object.entries(source).forEach(([game, record]) => {
    if (!record || typeof record !== "object" || !Number.isFinite(record.points)) return;
    history[game] = {
      player: String(record.player || ""),
      points: record.points,
      updatedAt: record.updatedAt || "",
    };
  });

  return history;
}

function setSyncStatus(label) {
  elements.syncLabel.textContent = label;
  elements.syncBadge.dataset.status = label.toLowerCase();
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

function emailToKey(email) {
  return String(email || "").trim().toLowerCase().replace(/[.#$/[\]]/g, "_");
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result));
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsDataURL(file);
  });
}
