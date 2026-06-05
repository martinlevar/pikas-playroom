const STORAGE_KEY = "arcade-night-scoreboard-v1";
const CHALLENGE_ID = "pikasnoid";
const CHALLENGE_NAME = "Pikasnoid";

const cloudConfig = window.ARCADE_CLOUD_CONFIG || {
  firebaseDatabaseUrl: "",
  firebaseWebApiKey: "",
  activeRankingId: "black-dog",
  roomId: "torneo-black-dog",
};

const currentRankingId = loadRankingId();
const state = loadState();
let challengeScores = {};

const elements = {
  arcadeScreen: document.querySelector("#arcade-screen"),
  leaderTitle: document.querySelector("#leader-title"),
  leaderDetail: document.querySelector("#leader-detail"),
  leaderboard: document.querySelector("#leaderboard"),
  scoreTable: document.querySelector("#score-table"),
  recordsTable: document.querySelector("#records-table"),
  challengeLink: document.querySelector("#viewer-challenge-link"),
  challengeRanking: document.querySelector("#viewer-challenge-ranking"),
  syncBadge: document.querySelector("#sync-badge"),
  syncLabel: document.querySelector("#sync-label"),
  emptyTemplate: document.querySelector("#empty-state-template"),
};

render();
renderChallengeLink();
connectCloud();
connectChallengeScores();
startArcadeEffects();

function renderChallengeLink() {
  if (elements.challengeLink) {
    elements.challengeLink.href = `./challenge.html?ranking=${encodeURIComponent(currentRankingId)}`;
  }
}

async function connectCloud() {
  if (!isCloudConfigured()) {
    setSyncStatus("Local");
    return;
  }

  setSyncStatus("Conectando");

  try {
    const response = await fetch(cloudUrl());
    if (!response.ok) throw new Error("No se pudo leer Firebase");

    const data = await response.json();
    if (data) replaceState(normalizeState(data));

    startCloudStream();
    setSyncStatus("Online");
  } catch (error) {
    console.warn(error);
    setSyncStatus("Offline");
  }
}

function startCloudStream() {
  const events = new EventSource(cloudUrl());

  events.addEventListener("put", (event) => {
    applyCloudEvent(event);
  });

  events.addEventListener("patch", (event) => {
    applyCloudEvent(event);
  });

  events.addEventListener("error", () => {
    setSyncStatus("Reconectando");
  });
}

function applyCloudEvent(event) {
  try {
    const message = JSON.parse(event.data);
    if (!message.data || message.path !== "/") return;

    replaceState(normalizeState(message.data));
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

function render() {
  renderLeaderHero();
  renderLeaderboard();
  renderTable();
  renderRecords();
  renderChallengeRanking();
}

function renderLeaderHero() {
  const [leader, runnerUp] = getRanking();

  if (!leader || leader.total === 0) {
    elements.leaderTitle.textContent = state.finished
      ? "Torneo terminado sin puntajes"
      : "La noche todavia no tiene campeon";
    elements.leaderDetail.textContent = state.finished
      ? "No hubo puntos cargados para declarar un ganador."
      : "Los puntajes van apareciendo aca en tiempo real.";
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

async function connectChallengeScores() {
  if (!elements.challengeRanking) return;
  if (!isCloudConfigured()) return;

  try {
    const response = await fetch(challengeScoresUrl());
    challengeScores = response.ok ? (await response.json()) || {} : {};
    renderChallengeRanking();
    startChallengeStream();
  } catch (error) {
    console.warn(error);
  }
}

function startChallengeStream() {
  const events = new EventSource(challengeScoresUrl());
  events.addEventListener("put", (event) => {
    applyChallengeEvent(event);
  });
  events.addEventListener("patch", (event) => {
    applyChallengeEvent(event);
  });
}

function applyChallengeEvent(event) {
  try {
    const message = JSON.parse(event.data);
    if (message.path === "/") {
      challengeScores = message.data || {};
    } else if (message.path && message.data) {
      const uid = message.path.replace(/^\//, "");
      challengeScores[uid] = message.data;
    }
    renderChallengeRanking();
  } catch (error) {
    console.warn(error);
  }
}

function renderChallengeRanking() {
  if (!elements.challengeRanking) return;

  elements.challengeRanking.innerHTML = "";
  const ranking = Object.values(challengeScores || {})
    .map(normalizeChallengeRecord)
    .filter((entry) => entry.player && Number.isFinite(entry.points))
    .sort(compareChallengeRecords)
    .slice(0, 8);

  if (ranking.length === 0) {
    elements.challengeRanking.append(createEmptyState());
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
    elements.challengeRanking.append(row);
  });
}

function normalizeChallengeRecord(entry = {}) {
  return {
    player: entry.player || "",
    game: entry.game || CHALLENGE_NAME,
    points: Number.isFinite(entry.points) ? entry.points : 0,
    wins: Number.isFinite(entry.wins) ? entry.wins : Number(entry.points || 0),
    goalDiff: Number.isFinite(entry.goalDiff) ? entry.goalDiff : 0,
    goalsFor: Number.isFinite(entry.goalsFor) ? entry.goalsFor : 0,
  };
}

function compareChallengeRecords(a, b) {
  return b.points - a.points || b.wins - a.wins || b.goalDiff - a.goalDiff || String(a.player).localeCompare(String(b.player));
}

function formatSigned(value) {
  return value > 0 ? `+${value}` : String(value);
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

function createEmptyState() {
  return elements.emptyTemplate.content.firstElementChild.cloneNode(true);
}

function loadState() {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved) return { finished: false, history: {}, players: [], games: [], scores: {} };
    return normalizeState(JSON.parse(saved));
  } catch {
    return { finished: false, history: {}, players: [], games: [], scores: {} };
  }
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

function isCloudConfigured() {
  return cloudConfig.firebaseDatabaseUrl.trim().length > 0;
}

function cloudUrl() {
  const baseUrl = cloudConfig.firebaseDatabaseUrl.replace(/\/$/, "");
  const ranking = encodeURIComponent(currentRankingId);
  return `${baseUrl}/rankings/${ranking}/state.json`;
}

function challengeScoresUrl() {
  const baseUrl = cloudConfig.firebaseDatabaseUrl.replace(/\/$/, "");
  const ranking = encodeURIComponent(currentRankingId);
  return `${baseUrl}/rankings/${ranking}/challengeScores/${CHALLENGE_ID}.json`;
}

function loadRankingId() {
  const urlRanking = new URLSearchParams(window.location.search).get("ranking");
  return slugify(urlRanking || cloudConfig.activeRankingId || cloudConfig.roomId);
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
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

function formatScore(value) {
  return new Intl.NumberFormat("es-AR").format(value);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
