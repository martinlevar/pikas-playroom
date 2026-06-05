const STORAGE_KEY = "arcade-night-scoreboard-v1";
const AUTH_REFRESH_MARGIN_MS = 5 * 60 * 1000;

const cloudConfig = window.ARCADE_CLOUD_CONFIG || {
  firebaseDatabaseUrl: "",
  firebaseWebApiKey: "",
  activeRankingId: "black-dog",
  roomId: "torneo-black-dog",
};

let authState = loadAuthState();
let rankings = {};
let userProfile = loadUserProfile();

const elements = {
  logoutButton: document.querySelector("#profile-logout-button"),
  profileTitle: document.querySelector("#profile-title"),
  profileStatus: document.querySelector("#profile-status"),
  avatarPreview: document.querySelector("#avatar-preview"),
  profilePhotoFile: document.querySelector("#profile-photo-file"),
  openCreateBoardButton: document.querySelector("#open-create-board-button"),
  createBoardDialog: document.querySelector("#create-board-dialog"),
  closeCreateBoardButton: document.querySelector("#close-create-board-button"),
  rankingForm: document.querySelector("#profile-ranking-form"),
  rankingName: document.querySelector("#profile-ranking-name"),
  rankingSlug: document.querySelector("#profile-ranking-slug"),
  rankingVisibility: document.querySelector("#profile-ranking-visibility"),
  rankingCover: document.querySelector("#profile-ranking-cover"),
  betKeeperBox: document.querySelector("#profile-betkeeper-box"),
  betKeeperConfigDialog: document.querySelector("#betkeeper-config-dialog"),
  closeBetKeeperConfigButton: document.querySelector("#close-betkeeper-config-button"),
  betKeeperSummary: document.querySelector("#profile-betkeeper-summary"),
  betKeeperState: document.querySelector("#profile-betkeeper-state"),
  betKeeperEnabled: document.querySelector("#profile-betkeeper-enabled"),
  betKeeperFields: document.querySelector("#profile-betkeeper-fields"),
  betKeeperEntry: document.querySelector("#profile-betkeeper-entry"),
  betKeeperCurrency: document.querySelector("#profile-betkeeper-currency"),
  betKeeperCriterion: document.querySelector("#profile-betkeeper-criterion"),
  betKeeperManualCriterionField: document.querySelector("#profile-betkeeper-manual-criterion-field"),
  betKeeperManualCriterion: document.querySelector("#profile-betkeeper-manual-criterion"),
  betKeeperPayout: document.querySelector("#profile-betkeeper-payout"),
  betKeeperRules: document.querySelector("#profile-betkeeper-rules"),
  gameRulesDialog: document.querySelector("#game-rules-dialog"),
  openGameRulesButton: document.querySelector("#open-game-rules-button"),
  closeGameRulesButton: document.querySelector("#close-game-rules-button"),
  paymentRulesDialog: document.querySelector("#payment-rules-dialog"),
  openPaymentRulesButton: document.querySelector("#open-payment-rules-button"),
  closePaymentRulesButton: document.querySelector("#close-payment-rules-button"),
  confirmBetKeeperButton: document.querySelector("#confirm-betkeeper-button"),
  createdLinkBox: document.querySelector("#profile-created-link-box"),
  createdLink: document.querySelector("#profile-created-link"),
  boardsList: document.querySelector("#profile-boards-list"),
  statBoards: document.querySelector("#stat-boards"),
  statPublic: document.querySelector("#stat-public"),
  statPrivate: document.querySelector("#stat-private"),
};

if (!authState) {
  window.location.href = "./index.html";
}

elements.logoutButton.addEventListener("click", () => {
  window.localStorage.removeItem(`${STORAGE_KEY}-auth`);
  window.location.href = "./index.html";
});

elements.avatarPreview.addEventListener("click", () => {
  elements.profilePhotoFile.click();
});

elements.profilePhotoFile.addEventListener("change", async () => {
  const file = elements.profilePhotoFile.files?.[0];
  if (!file) return;
  const photoUrl = await fileToDataUrl(file);
  await saveProfilePhoto(photoUrl);
  elements.profilePhotoFile.value = "";
});

elements.openCreateBoardButton.addEventListener("click", () => {
  elements.createdLinkBox.hidden = true;
  elements.createdLink.removeAttribute("href");
  elements.createdLink.textContent = "";
  elements.createBoardDialog.showModal();
});

elements.closeCreateBoardButton.addEventListener("click", () => {
  elements.createBoardDialog.close();
});

elements.betKeeperBox.addEventListener("click", () => elements.betKeeperConfigDialog.showModal());
elements.closeBetKeeperConfigButton.addEventListener("click", () => elements.betKeeperConfigDialog.close());

elements.betKeeperEnabled.addEventListener("change", () => {
  syncBetKeeperVisibility();
});
elements.betKeeperCriterion.addEventListener("change", syncManualCriterionVisibility);

elements.openGameRulesButton.addEventListener("click", () => elements.gameRulesDialog.showModal());
elements.closeGameRulesButton.addEventListener("click", () => elements.gameRulesDialog.close());
elements.openPaymentRulesButton.addEventListener("click", () => elements.paymentRulesDialog.showModal());
elements.closePaymentRulesButton.addEventListener("click", () => elements.paymentRulesDialog.close());
elements.confirmBetKeeperButton.addEventListener("click", () => {
  syncBetKeeperVisibility();
  elements.betKeeperConfigDialog.close();
});

elements.rankingForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await createRanking();
});

elements.boardsList.addEventListener("click", async (event) => {
  const deleteButton = event.target.closest("[data-delete-ranking]");
  if (deleteButton) {
    await deleteRanking(deleteButton.dataset.deleteRanking);
    return;
  }

  const inviteButton = event.target.closest("[data-invite-ranking]");
  if (inviteButton) {
    const rankingId = inviteButton.dataset.inviteRanking;
    const input = elements.boardsList.querySelector(`[data-editor-email="${CSS.escape(rankingId)}"]`);
    await inviteEditor(rankingId, input?.value || "");
  }
});

elements.boardsList.addEventListener("change", async (event) => {
  const input = event.target.closest("[data-cover-ranking]");
  if (!input) return;
  const file = input.files?.[0];
  if (!file) return;
  await updateRankingCover(input.dataset.coverRanking, await fileToDataUrl(file));
});

initializeProfile();

async function initializeProfile() {
  await refreshAuthStateIfNeeded();
  renderProfile();
  await loadRankings();
}

async function createRanking() {
  if (!isCloudConfigured()) {
    setStatus("Falta configurar Firebase Database.");
    return;
  }

  const name = cleanName(elements.rankingName.value);
  const visibility = elements.rankingVisibility.value === "private" ? "private" : "public";
  const rankingId = slugify(elements.rankingSlug.value || name || crypto.randomUUID());
  if (!name || !rankingId) {
    setStatus("Escribi un nombre para el tablero.");
    return;
  }

  const coverImage = elements.rankingCover.files?.[0]
    ? await fileToDataUrl(elements.rankingCover.files[0])
    : "";
  const betKeeper = buildBetKeeperConfig();

  const response = await fetch(rankingRootUrl(rankingId), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      coverImage,
      visibility,
      ownerUid: authState.uid,
      betKeeper,
      editors: {
        [authState.uid]: true,
      },
      createdAt: new Date().toISOString(),
      state: createBlankTournamentState(),
    }),
  });

  if (!response.ok) {
    setStatus("No se pudo crear el tablero. Revisa reglas/permisos.");
    return;
  }

  const viewerUrl = publicRankingUrl(rankingId);
  elements.createdLinkBox.hidden = false;
  elements.createdLink.href = viewerUrl;
  elements.createdLink.textContent = viewerUrl;
  elements.rankingName.value = "";
  elements.rankingSlug.value = "";
  elements.rankingCover.value = "";
  resetBetKeeperForm();
  setStatus(visibility === "public" ? "Tablero publico creado." : "Tablero privado creado. Comparte solo el link.");
  await loadRankings();
}

function buildBetKeeperConfig() {
  const enabled = Boolean(elements.betKeeperEnabled.checked);
  const entryAmount = Math.max(0, Number(elements.betKeeperEntry.value || 0));
  return {
    enabled,
    entryAmount: enabled ? entryAmount : 0,
    currency: elements.betKeeperCurrency.value || "ARS",
    winnerCriterion: elements.betKeeperCriterion.value || "highest_total",
    manualCriterion: cleanName(elements.betKeeperManualCriterion.value),
    payoutMode: elements.betKeeperPayout.value || "winner_takes_all",
    rules: cleanName(elements.betKeeperRules.value),
    status: enabled ? "draft" : "disabled",
    pot: {
      participants: {},
      confirmations: {},
      winnerUid: "",
      releasedAt: "",
      paidAt: "",
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function resetBetKeeperForm() {
  elements.betKeeperEnabled.checked = false;
  syncBetKeeperVisibility();
  elements.betKeeperEntry.value = "";
  elements.betKeeperCurrency.value = "ARS";
  elements.betKeeperCriterion.value = "highest_total";
  elements.betKeeperManualCriterion.value = "";
  syncManualCriterionVisibility();
  elements.betKeeperPayout.value = "winner_takes_all";
  elements.betKeeperRules.value = "";
}

function syncBetKeeperVisibility() {
  const enabled = elements.betKeeperEnabled.checked;
  elements.betKeeperFields.hidden = !enabled;
  elements.betKeeperBox.classList.toggle("betkeeper-launch-active", enabled);
  elements.betKeeperSummary.textContent = enabled ? "BetKeeper configurado" : "Configurar caja de acuerdos";
  elements.betKeeperState.textContent = enabled ? "Activo" : "Opcional";
  syncManualCriterionVisibility();
}

function syncManualCriterionVisibility() {
  elements.betKeeperManualCriterionField.hidden = elements.betKeeperCriterion.value !== "manual";
}

async function loadRankings() {
  try {
    const response = await fetch(rankingsListUrl());
    if (!response.ok) throw new Error("No se pudieron leer tableros");
    rankings = (await response.json()) || {};
  } catch (error) {
    console.warn(error);
    rankings = {};
    setStatus("No se pudieron leer tus tableros.");
  }

  renderMyBoards();
}

function renderProfile() {
  elements.profileTitle.textContent = authState.displayName || authState.email;
  if (userProfile.photoUrl) {
    elements.avatarPreview.textContent = "";
    elements.avatarPreview.style.backgroundImage = `url("${userProfile.photoUrl}")`;
  } else {
    elements.avatarPreview.style.backgroundImage = "";
    elements.avatarPreview.textContent = (authState.displayName || "P").charAt(0).toUpperCase();
  }
}

function renderMyBoards() {
  elements.boardsList.innerHTML = "";
  const myBoards = Object.entries(rankings)
    .filter(([, ranking]) => ranking?.ownerUid === authState.uid)
    .sort((a, b) => String(b[1]?.createdAt || "").localeCompare(String(a[1]?.createdAt || "")));

  elements.statBoards.textContent = String(myBoards.length);
  elements.statPublic.textContent = String(myBoards.filter(([, ranking]) => ranking.visibility !== "private").length);
  elements.statPrivate.textContent = String(myBoards.filter(([, ranking]) => ranking.visibility === "private").length);

  if (myBoards.length === 0) {
    elements.boardsList.append(createInlineMessage("Todavía no creaste tableros."));
    return;
  }

  myBoards.forEach(([rankingId, ranking]) => {
    const card = document.createElement("article");
    card.className = "board-card board-card-management";
    if (ranking.coverImage) {
      card.style.setProperty("--board-cover", `url("${ranking.coverImage}")`);
      card.classList.add("board-card-cover");
    }
    const betKeeper = normalizeBetKeeper(ranking.betKeeper);
    card.innerHTML = `
      <div>
        <p class="eyebrow">${ranking.visibility === "private" ? "Privado" : "Publico"}</p>
        <h3>${escapeHtml(ranking.name || titleizeSlug(rankingId))}</h3>
        <span>${escapeHtml(publicRankingUrl(rankingId))}</span>
        ${betKeeper.enabled ? `
          <div class="betkeeper-summary">
            <strong>BetKeeper activo</strong>
            <span>${formatMoney(betKeeper.entryAmount, betKeeper.currency)} por jugador · ${escapeHtml(readableCriterion(betKeeper.winnerCriterion))}</span>
          </div>
        ` : `
          <div class="betkeeper-summary betkeeper-summary-muted">
            <strong>BetKeeper apagado</strong>
            <span>Este tablero no tiene caja de acuerdos.</span>
          </div>
        `}
      </div>
      <div class="board-actions">
        <a class="play-link" href="./mesa-black-dog-8f3k9.html?ranking=${encodeURIComponent(rankingId)}">JUGAR</a>
        <a class="primary-link" href="${escapeHtml(publicRankingUrl(rankingId))}">Ver en vivo</a>
        <button type="button" class="danger-button" data-delete-ranking="${escapeHtml(rankingId)}">Eliminar</button>
      </div>
    `;
    elements.boardsList.append(card);
  });
}

function normalizeBetKeeper(betKeeper = {}) {
  return {
    enabled: Boolean(betKeeper.enabled),
    entryAmount: Number(betKeeper.entryAmount || 0),
    currency: betKeeper.currency || "ARS",
    winnerCriterion: betKeeper.winnerCriterion || "highest_total",
    manualCriterion: betKeeper.manualCriterion || "",
  };
}

function readableCriterion(value) {
  const labels = {
    highest_total: "mayor puntaje total",
    manual: "definido manualmente",
  };
  return labels[value] || "criterio definido";
}

function formatMoney(value, currency) {
  const amount = Number(value || 0).toLocaleString("es-AR");
  return `${currency} ${amount}`;
}

async function updateRankingCover(rankingId, coverImage) {
  const ranking = rankings[rankingId];
  if (!ranking || ranking.ownerUid !== authState?.uid) {
    setStatus("Solo el creador puede cambiar la foto del tablero.");
    return;
  }

  const response = await fetch(rankingCoverUrl(rankingId), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(coverImage),
  });

  if (!response.ok) {
    setStatus("No se pudo guardar la foto del tablero.");
    return;
  }

  setStatus("Foto del tablero actualizada.");
  await loadRankings();
}

async function saveProfilePhoto(photoUrl) {
  userProfile = {
    ...userProfile,
    photoUrl,
  };
  window.localStorage.setItem(`${STORAGE_KEY}-profile`, JSON.stringify(userProfile));
  await persistUserProfile({
    email: authState.email,
    displayName: authState.displayName,
    photoUrl,
  });
  renderProfile();
  setStatus("Foto actualizada.");
}

async function deleteRanking(rankingId) {
  const ranking = rankings[rankingId];
  if (!ranking || ranking.ownerUid !== authState?.uid) {
    setStatus("Solo el creador puede eliminar este tablero.");
    return;
  }

  const confirmed = window.confirm(`Eliminar ${ranking.name || rankingId}? Esta accion no se puede deshacer.`);
  if (!confirmed) return;

  const response = await fetch(rankingRootUrl(rankingId), {
    method: "DELETE",
  });

  if (!response.ok) {
    setStatus("No se pudo eliminar el tablero.");
    return;
  }

  setStatus("Tablero eliminado.");
  await loadRankings();
}

async function inviteEditor(rankingId, email) {
  const cleanEmail = cleanName(email).toLowerCase();
  if (!cleanEmail || !cleanEmail.includes("@")) {
    setStatus("Escribi un email valido para agregar admin.");
    return;
  }

  const ranking = rankings[rankingId];
  if (!ranking || ranking.ownerUid !== authState?.uid) {
    setStatus("Solo el creador puede agregar administradores.");
    return;
  }

  const response = await fetch(invitedEditorUrl(rankingId, cleanEmail), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: cleanEmail,
      invitedBy: authState.uid,
      createdAt: new Date().toISOString(),
    }),
  });

  if (!response.ok) {
    setStatus("No se pudo agregar admin.");
    return;
  }

  setStatus(`Admin invitado: ${cleanEmail}`);
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

function loadAuthState() {
  try {
    const saved = window.localStorage.getItem(`${STORAGE_KEY}-auth`);
    return saved ? JSON.parse(saved) : null;
  } catch {
    return null;
  }
}

function persistAuthState() {
  window.localStorage.setItem(`${STORAGE_KEY}-auth`, JSON.stringify(authState));
}

async function refreshAuthStateIfNeeded() {
  if (!authState || !authState.refreshToken || !isAuthConfigured()) return;
  if (authState.expiresAt && Date.now() < authState.expiresAt - AUTH_REFRESH_MARGIN_MS) return;

  try {
    const refreshed = await refreshAuthToken(authState.refreshToken);
    const expiresIn = Number.parseInt(refreshed.expires_in || "3600", 10);
    authState = {
      ...authState,
      uid: refreshed.user_id || authState.uid,
      idToken: refreshed.id_token,
      refreshToken: refreshed.refresh_token || authState.refreshToken,
      expiresAt: Date.now() + expiresIn * 1000,
    };
    persistAuthState();
  } catch (error) {
    console.warn(error);
    setStatus("No se pudo renovar la sesion. Si algo falla, cerra sesion y volve a entrar.");
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

function loadUserProfile() {
  try {
    const saved = window.localStorage.getItem(`${STORAGE_KEY}-profile`);
    return saved ? JSON.parse(saved) : {};
  } catch {
    return {};
  }
}

function createBlankTournamentState() {
  return {
    finished: false,
    history: {},
    players: [],
    games: [],
    scores: [],
    updatedAt: new Date().toISOString(),
  };
}

function rankingsListUrl() {
  const baseUrl = cloudConfig.firebaseDatabaseUrl.replace(/\/$/, "");
  return `${baseUrl}/rankings.json`;
}

function rankingRootUrl(rankingId) {
  const baseUrl = cloudConfig.firebaseDatabaseUrl.replace(/\/$/, "");
  return `${baseUrl}/rankings/${encodeURIComponent(rankingId)}.json?auth=${encodeURIComponent(authState.idToken)}`;
}

function rankingCoverUrl(rankingId) {
  const baseUrl = cloudConfig.firebaseDatabaseUrl.replace(/\/$/, "");
  return `${baseUrl}/rankings/${encodeURIComponent(rankingId)}/coverImage.json?auth=${encodeURIComponent(authState.idToken)}`;
}

function userProfileUrl() {
  const baseUrl = cloudConfig.firebaseDatabaseUrl.replace(/\/$/, "");
  return `${baseUrl}/users/${encodeURIComponent(authState.uid)}.json?auth=${encodeURIComponent(authState.idToken)}`;
}

function invitedEditorUrl(rankingId, email) {
  const baseUrl = cloudConfig.firebaseDatabaseUrl.replace(/\/$/, "");
  return `${baseUrl}/rankings/${encodeURIComponent(rankingId)}/invitedEditors/${emailToKey(email)}.json?auth=${encodeURIComponent(authState.idToken)}`;
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

function slugify(value) {
  return cleanName(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function titleizeSlug(value) {
  return String(value)
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
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

function createInlineMessage(message) {
  const node = document.createElement("p");
  node.className = "inline-empty";
  node.textContent = message;
  return node;
}

function setStatus(message) {
  elements.profileStatus.textContent = message;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
