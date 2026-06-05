const STORAGE_KEY = "arcade-night-scoreboard-v1";
const AUTH_REFRESH_MARGIN_MS = 5 * 60 * 1000;
const CHALLENGE_ID = "pikasnoid";
const CHALLENGE_NAME = "Pikasnoid";
const SCORE_VALUES = {
  defenderHit: 150,
  rivalHit: 100,
  attackerHit: 200,
  goalFor: 500,
  goalAgainst: -300,
  matchWin: 1000,
  bonusClearance: 100,
  bonusMiss: -50,
};

const cloudConfig = window.ARCADE_CLOUD_CONFIG || {
  firebaseDatabaseUrl: "",
  firebaseWebApiKey: "",
  activeRankingId: "black-dog",
  roomId: "torneo-black-dog",
};

let authState = loadAuthState();
let currentRankingId = loadRankingId();
let challengeScores = {};
let lastScore = 0;
let lastRecord = null;
let gameMode = "ready";
let level = 1;
let timeLeft = 40;
let goldenGoal = false;
let bonusActive = false;
let bonusPlayed = false;
let bonusPoints = 0;
let bonusClears = 0;
let bonusMisses = 0;
let totalPoints = 0;
let goals = 0;
let rivalGoals = 0;
let playersHit = 0;
let matchGoalsFor = 0;
let matchGoalsAgainst = 0;
let wins = 0;
let goalDiff = 0;
let paddle = {};
let rivalGoalkeeper = {};
let balls = [];
let bricks = [];
let goalBanners = [];
let confetti = [];
let defensiveRespawns = [];
let fieldTheme = null;
let keysDown = new Set();
let lastFrameAt = 0;
let pausedUntil = 0;

const elements = {
  canvas: document.querySelector("#challenge-canvas"),
  touchZone: document.querySelector("#challenge-touch-zone"),
  score: document.querySelector("#challenge-score"),
  level: document.querySelector("#challenge-level"),
  lives: document.querySelector("#challenge-lives"),
  overlay: document.querySelector("#challenge-overlay"),
  overlayTitle: document.querySelector("#challenge-overlay-title"),
  overlayDetail: document.querySelector("#challenge-overlay-detail"),
  startButton: document.querySelector("#challenge-start-button"),
  saveButton: document.querySelector("#challenge-save-button"),
  loginButton: document.querySelector("#challenge-login-button"),
  playerName: document.querySelector("#challenge-player-name"),
  status: document.querySelector("#challenge-status"),
  loginDialog: document.querySelector("#challenge-login-dialog"),
  closeLoginButton: document.querySelector("#close-challenge-login-button"),
  headerLoginButton: document.querySelector("#challenge-header-login-button"),
  profileLink: document.querySelector("#challenge-profile-link"),
  authForm: document.querySelector("#challenge-auth-form"),
  authStatus: document.querySelector("#challenge-auth-status"),
  authName: document.querySelector("#challenge-auth-name"),
  authEmail: document.querySelector("#challenge-auth-email"),
  authPassword: document.querySelector("#challenge-auth-password"),
  signupButton: document.querySelector("#challenge-signup-button"),
  emptyTemplate: document.querySelector("#challenge-empty-template"),
};

const ctx = elements.canvas.getContext("2d");
const world = {
  width: elements.canvas.width,
  height: elements.canvas.height,
};

initializeChallenge();

async function initializeChallenge() {
  await refreshAuthStateIfNeeded();
  elements.playerName.value = authState?.displayName || "";
  renderStatus();
  await loadChallengeScores();
  bindEvents();
  setupLevel(1);
  draw();
  requestAnimationFrame(loop);
}

function bindEvents() {
  elements.startButton.addEventListener("click", handlePrimaryAction);
  elements.saveButton.addEventListener("click", saveLastScore);
  elements.loginButton.addEventListener("click", () => elements.loginDialog.showModal());
  elements.headerLoginButton.addEventListener("click", () => elements.loginDialog.showModal());
  elements.closeLoginButton.addEventListener("click", () => elements.loginDialog.close());
  elements.authForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await signIn();
  });
  elements.signupButton.addEventListener("click", signUp);

  window.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "a", "d", "A", "D", " "].includes(event.key)) return;
    event.preventDefault();
    if (event.key === " " && gameMode !== "playing") {
      handlePrimaryAction();
      return;
    }
    keysDown.add(event.key.toLowerCase());
  });

  window.addEventListener("keyup", (event) => {
    keysDown.delete(event.key.toLowerCase());
  });

  elements.touchZone.addEventListener("pointerdown", movePaddleFromPointer);
  elements.touchZone.addEventListener("pointermove", movePaddleFromPointer);
}

function handlePrimaryAction() {
  if (!authState) {
    setStatus("Para jugar al desafio tenes que ingresar o crear usuario.");
    elements.loginDialog.showModal();
    return;
  }

  if (gameMode === "level") {
    gameMode = "playing";
    elements.overlay.hidden = true;
    setupLevel(level + 1);
    return;
  }

  if (gameMode === "bonus-ready") {
    startBonusLevel();
    return;
  }

  startGame();
}

function startGame() {
  level = 1;
  timeLeft = 40;
  goldenGoal = false;
  bonusActive = false;
  bonusPlayed = false;
  bonusPoints = 0;
  bonusClears = 0;
  bonusMisses = 0;
  totalPoints = 0;
  goals = 0;
  rivalGoals = 0;
  playersHit = 0;
  matchGoalsFor = 0;
  matchGoalsAgainst = 0;
  wins = 0;
  goalDiff = 0;
  lastScore = 0;
  lastRecord = null;
  elements.saveButton.disabled = true;
  gameMode = "playing";
  elements.overlay.hidden = true;
  setupLevel(level);
  updateHud();
}

function setupLevel(nextLevel) {
  level = nextLevel;
  timeLeft = 40;
  goldenGoal = false;
  bonusActive = false;
  pausedUntil = 0;
  matchGoalsFor = 0;
  matchGoalsAgainst = 0;
  paddle = {
    width: Math.max(82, 156 - level * 10),
    height: 24,
    x: world.width / 2,
    y: world.height - 72,
    speed: 640 + level * 16,
  };
  rivalGoalkeeper = {
    width: Math.min(192, 112 + level * 14),
    height: 22,
    x: world.width / 2,
    y: 42,
    vx: 150 + level * 18,
  };
  fieldTheme = createFieldTheme(level);
  resetBallsFromCenter(-1, false);
  goalBanners = [];
  confetti = [];
  defensiveRespawns = [];
  bricks = createBricks(level);
  updateHud();
}

function createBall(x, y, vx, vy) {
  return { x, y, radius: 8, vx, vy, scoring: true, bonus: false, defended: false, clearing: false, wobblePhase: Math.random() * Math.PI * 2 };
}

function createFieldTheme(currentLevel) {
  const themes = [
    { top: "#0d3a26", mid: "#0f5836", bottom: "#082717", kits: ["#31e8ff", "#ff3fad", "#ffe45c", "#60ff94", "#ffffff"] },
    { top: "#12354f", mid: "#14646a", bottom: "#092734", kits: ["#ff3fad", "#ffe45c", "#ffffff", "#31e8ff", "#60ff94"] },
    { top: "#3d2f0c", mid: "#6d5b16", bottom: "#201906", kits: ["#60ff94", "#31e8ff", "#ff3fad", "#ffffff", "#ffe45c"] },
    { top: "#2b1749", mid: "#47317a", bottom: "#140b26", kits: ["#ffe45c", "#ffffff", "#60ff94", "#ff3fad", "#31e8ff"] },
  ];
  return themes[(currentLevel - 1) % themes.length];
}

function createBricks(currentLevel) {
  const palette = fieldTheme.kits;
  const positions = [
    [92, 150], [216, 150], [344, 150], [468, 150],
    [132, 262], [280, 262], [428, 262],
    [280, 354],
    [190, 462], [370, 462],
  ];

  return positions.map(([x, y], index) => ({
    baseX: x,
    baseY: y,
    x: x - 20,
    y,
    width: 40,
    height: 34,
    color: palette[(index + currentLevel) % palette.length],
    defender: index < 4,
    attacker: index >= 7,
    active: true,
    destroyed: false,
    hits: 0,
    advanceDirection: 1,
    respawnAt: 0,
    runOffset: Math.random() * Math.PI * 2,
    speed: 18 + currentLevel * 2.2 + index * 0.8,
  }));
}

function loop(timestamp) {
  const delta = Math.min(0.033, (timestamp - lastFrameAt) / 1000 || 0);
  lastFrameAt = timestamp;

  if (gameMode === "playing") {
    updateGame(delta, timestamp);
  }

  draw();
  requestAnimationFrame(loop);
}

function updateGame(delta, timestamp) {
  if (timestamp < pausedUntil) {
    updateHud();
    return;
  }

  updatePaddle(delta);
  updateRivalGoalkeeper(delta);
  updateRivals(delta, timestamp);
  if (!goldenGoal) {
    timeLeft -= delta;
  }
  if (gameMode !== "playing") return;

  spawnDueDefensiveBalls(timestamp);
  balls.forEach((currentBall) => updateBall(currentBall, delta, timestamp));
  balls = balls.filter((currentBall) => !currentBall.expired && currentBall.y - currentBall.radius <= world.height);
  updateConfetti(delta);

  handlePaddleCollisions();
  handleBrickCollisions();

  if (!bonusActive && balls.length === 0) {
    loseLife();
  }

  if (timeLeft <= 0 && bonusActive && gameMode === "playing") {
    finishBonusLevel();
    return;
  }

  if (timeLeft <= 0 && !goldenGoal && gameMode === "playing") {
    completeLevel();
  }

  updateHud();
}

function updateRivals(delta, timestamp) {
  const boxLine = world.height - 176;
  bricks.forEach((brick) => {
    if (!brick.active) {
      if (timestamp >= brick.respawnAt) respawnRival(brick);
      return;
    }

    const sway = Math.sin(timestamp / 520 + brick.runOffset);
    const drift = Math.sin(timestamp / 1100 + brick.runOffset * 0.7);
    const xRange = brick.attacker ? 34 : brick.defender ? 20 : 26;
    brick.x = brick.baseX - brick.width / 2 + sway * xRange;

    if (brick.attacker) {
      brick.y += brick.speed * brick.advanceDirection * delta;
      if (brick.y >= boxLine) {
        brick.y = boxLine;
        brick.advanceDirection = -1;
      }
      const retreatLine = Math.max(92, brick.baseY - 86);
      if (brick.y <= retreatLine) {
        brick.y = retreatLine;
        brick.advanceDirection = 1;
      }
    } else {
      const yRange = brick.defender ? 9 : 15;
      brick.y = brick.baseY + drift * yRange;
    }
  });
}

function respawnRival(brick) {
  if (brick.destroyed) return;
  brick.active = true;
  brick.x = brick.baseX - brick.width / 2;
  brick.y = brick.attacker ? Math.max(92, brick.baseY - 86) : brick.baseY;
  brick.advanceDirection = 1;
  brick.runOffset = Math.random() * Math.PI * 2;
}

function scoreRivalGoal(brick) {
  rivalGoals += 1;
  matchGoalsAgainst += 1;
  addPoints(SCORE_VALUES.goalAgainst);
  goalBanners = [{
    label: `GOL RIVAL ${SCORE_VALUES.goalAgainst}`,
    color: "#ff3fad",
    startedAt: performance.now(),
    duration: 2000,
    center: true,
  }];
  if (brick) {
    brick.active = false;
    brick.respawnAt = performance.now() + 1400;
  }
  if (goldenGoal) {
    endGame("Gol de oro rival", buildGameOverDetail(`Perdiste ${matchGoalsFor}-${matchGoalsAgainst} en gol de oro. Puntaje final: ${formatScore(totalPoints)}.`), "loss");
    return;
  }
  resetBallsFromCenter(-1);
  updateHud();
}

function updateRivalGoalkeeper(delta) {
  rivalGoalkeeper.x += rivalGoalkeeper.vx * delta;
  const half = rivalGoalkeeper.width / 2;
  if (rivalGoalkeeper.x - half <= 54) {
    rivalGoalkeeper.x = 54 + half;
    rivalGoalkeeper.vx = Math.abs(rivalGoalkeeper.vx);
  }
  if (rivalGoalkeeper.x + half >= world.width - 54) {
    rivalGoalkeeper.x = world.width - 54 - half;
    rivalGoalkeeper.vx = -Math.abs(rivalGoalkeeper.vx);
  }
}

function updateBall(currentBall, delta, timestamp) {
  if (!currentBall.scoring && !currentBall.clearing) {
    currentBall.vx += Math.sin(timestamp / 170 + currentBall.wobblePhase) * (16 + level * 2) * delta;
  }

  currentBall.x += currentBall.vx * delta;
  currentBall.y += currentBall.vy * delta;

  if (currentBall.clearing) {
    currentBall.radius += 18 * delta;
    currentBall.vx *= 1.02;
  }

  if (currentBall.defended && (currentBall.x + currentBall.radius < -20 || currentBall.x - currentBall.radius > world.width + 20)) {
    currentBall.expired = true;
    queueDefensiveRespawn(timestamp, currentBall.bonus ? 600 : getDefensiveRespawnDelay());
    return;
  }

  if (!currentBall.scoring) {
    if (currentBall.bonus && currentBall.y - currentBall.radius > world.height) {
      currentBall.expired = true;
      missBonusBall(timestamp);
      return;
    }

    if (!currentBall.bonus && currentBall.y + currentBall.radius >= world.height - 34 && isInsideGoal(currentBall.x)) {
      scoreRivalGoal();
      return;
    }

    if (currentBall.x + currentBall.radius < 0 || currentBall.x - currentBall.radius > world.width || currentBall.y - currentBall.radius > world.height) {
      currentBall.expired = true;
      queueDefensiveRespawn(timestamp, currentBall.bonus ? 600 : 900);
    }
    return;
  }

  if (currentBall.x - currentBall.radius <= 0) {
    currentBall.x = currentBall.radius;
    currentBall.vx = Math.abs(currentBall.vx);
    pushBallFromCorner(currentBall);
  }
  if (currentBall.x + currentBall.radius >= world.width) {
    currentBall.x = world.width - currentBall.radius;
    currentBall.vx = -Math.abs(currentBall.vx);
    pushBallFromCorner(currentBall);
  }
  if (currentBall.vy < 0 && hitsRivalGoalkeeper(currentBall)) {
    const half = rivalGoalkeeper.width / 2;
    const offset = (currentBall.x - rivalGoalkeeper.x) / half;
    currentBall.y = rivalGoalkeeper.y + rivalGoalkeeper.height + currentBall.radius;
    currentBall.vx = offset * (280 + level * 26);
    currentBall.vy = Math.abs(currentBall.vy) + level * 4;
    return;
  }

  if (currentBall.y - currentBall.radius <= 28) {
    if (currentBall.scoring && isInsideGoal(currentBall.x)) {
      scoreGoal(currentBall);
      if (gameMode !== "playing") return;
    } else {
      bounceFromBackLine(currentBall, 28 + currentBall.radius, 1);
    }
  }

  if (currentBall.y + currentBall.radius >= world.height - 34) {
    if (isInsideGoal(currentBall.x)) {
      scoreRivalGoal();
      if (gameMode !== "playing") return;
    } else {
      bounceFromBackLine(currentBall, world.height - 34 - currentBall.radius, -1);
    }
  }
}

function isInsideGoal(x) {
  return x >= world.width / 2 - 78 && x <= world.width / 2 + 78;
}

function hitsRivalGoalkeeper(currentBall) {
  const half = rivalGoalkeeper.width / 2;
  return currentBall.x + currentBall.radius >= rivalGoalkeeper.x - half &&
    currentBall.x - currentBall.radius <= rivalGoalkeeper.x + half &&
    currentBall.y - currentBall.radius <= rivalGoalkeeper.y + rivalGoalkeeper.height &&
    currentBall.y + currentBall.radius >= rivalGoalkeeper.y;
}

function scoreGoal(currentBall) {
  goals += 1;
  matchGoalsFor += 1;
  addPoints(SCORE_VALUES.goalFor);
  goalBanners = [{
    label: `GOL +${SCORE_VALUES.goalFor}`,
    color: "#ffffff",
    startedAt: performance.now(),
    duration: 2000,
    center: true,
  }];
  if (goldenGoal) {
    winCurrentLevel("Gol de oro");
    return;
  }
  resetBallsFromCenter(1);
}

function resetBallsFromCenter(direction, withPause = true) {
  const ballCount = getLevelBallCount();
  const destroyedCount = bricks.filter((brick) => brick.destroyed).length;
  const baseSpeedY = 330 + level * 26 + destroyedCount * 8;
  const baseSpeedX = 155 + level * 15 + destroyedCount * 4;
  balls = Array.from({ length: ballCount }, (_, index) => {
    if (index > 0) return createDefensiveBall();

    const spread = index - (ballCount - 1) / 2;
    const vx = spread * baseSpeedX + (Math.random() - 0.5) * 90;
    return {
      ...createBall(world.width / 2, world.height / 2, vx, direction * baseSpeedY),
      scoring: true,
    };
  });
  defensiveRespawns = [];
  if (withPause) pauseKickoff();
}

function getLevelBallCount() {
  return Math.min(5, level);
}

function createDefensiveBall() {
  if (bonusActive) return createBonusBall();

  const vx = (Math.random() - 0.5) * (230 + level * 28);
  const vy = 420 + level * 52;
  return {
    ...createBall(world.width / 2, world.height / 2, vx, vy),
    scoring: false,
    radius: 9,
  };
}

function createBonusBall() {
  const shooter = bricks[Math.floor(Math.random() * bricks.length)] || { x: world.width / 2, y: world.height * 0.35, width: 0, height: 0 };
  const targetX = paddle.x + (Math.random() - 0.5) * Math.max(130, paddle.width * 2.1);
  const startX = Math.max(70, Math.min(world.width - 70, shooter.x + shooter.width / 2 + (Math.random() - 0.5) * 170));
  const startY = Math.max(105, Math.min(world.height * 0.58, shooter.y + shooter.height / 2 + (Math.random() - 0.5) * 120));
  const vy = 760 + level * 62 + Math.random() * 150;
  const travelTime = Math.max(0.42, (paddle.y - startY) / vy);
  return {
    ...createBall(startX, startY, (targetX - startX) / travelTime, vy),
    scoring: false,
    bonus: true,
    radius: 10,
  };
}

function queueDefensiveRespawn(timestamp, delay = 1000) {
  const activeDefensiveBalls = balls.filter((ball) => !ball.scoring && !ball.expired).length;
  const pendingDefensiveBalls = defensiveRespawns.length;
  const targetDefensiveBalls = bonusActive ? 1 : Math.max(0, getLevelBallCount() - 1);
  if (activeDefensiveBalls + pendingDefensiveBalls >= targetDefensiveBalls) return;
  defensiveRespawns.push(timestamp + delay);
}

function missBonusBall(timestamp) {
  bonusMisses += 1;
  bonusPoints = Math.max(0, bonusPoints + SCORE_VALUES.bonusMiss);
  goalBanners = [{
    label: `${SCORE_VALUES.bonusMiss}`,
    color: "#ff3fad",
    startedAt: performance.now(),
    duration: 650,
  }];
  queueDefensiveRespawn(timestamp, 500);
}

function getDefensiveRespawnDelay() {
  const delaysByLevel = [0, 0, 5000, 3500, 2200, 1000, 250];
  return delaysByLevel[Math.min(level, delaysByLevel.length - 1)] || 250;
}

function spawnDueDefensiveBalls(timestamp) {
  if (defensiveRespawns.length === 0) return;
  const due = defensiveRespawns.filter((respawnAt) => timestamp >= respawnAt);
  defensiveRespawns = defensiveRespawns.filter((respawnAt) => timestamp < respawnAt);
  due.forEach(() => balls.push(createDefensiveBall()));
}

function bounceFromBackLine(currentBall, y, direction) {
  currentBall.y = y;
  const centerPull = (world.width / 2 - currentBall.x) * 1.25;
  const randomNudge = (Math.random() - 0.5) * 70;
  currentBall.vx = centerPull + randomNudge;
  currentBall.vy = direction * (Math.abs(currentBall.vy) + 135 + level * 14);
}

function pauseKickoff() {
  pausedUntil = performance.now() + 2000;
}

function launchConfetti(originX = world.width / 2, originY = world.height * 0.38, amount = 42) {
  const colors = ["#31e8ff", "#ff3fad", "#ffe45c", "#60ff94", "#ffffff"];
  confetti = Array.from({ length: amount }, () => ({
    x: originX + (Math.random() - 0.5) * 180,
    y: originY + (Math.random() - 0.5) * 60,
    vx: (Math.random() - 0.5) * 260,
    vy: -130 - Math.random() * 220,
    size: 4 + Math.random() * 5,
    rotation: Math.random() * Math.PI,
    spin: (Math.random() - 0.5) * 10,
    color: colors[Math.floor(Math.random() * colors.length)],
    life: 1.2,
  }));
}

function updateConfetti(delta) {
  confetti = confetti
    .map((piece) => ({
      ...piece,
      x: piece.x + piece.vx * delta,
      y: piece.y + piece.vy * delta,
      vy: piece.vy + 520 * delta,
      rotation: piece.rotation + piece.spin * delta,
      life: piece.life - delta,
    }))
    .filter((piece) => piece.life > 0);
}

function pushBallFromCorner(currentBall) {
  if (currentBall.y < 120) {
    currentBall.vx += (world.width / 2 - currentBall.x) * 0.75;
    currentBall.vy = Math.abs(currentBall.vy) + 95 + level * 10;
  } else if (currentBall.y > world.height - 150) {
    currentBall.vx += (world.width / 2 - currentBall.x) * 0.75;
    currentBall.vy = -Math.abs(currentBall.vy) - 95 - level * 10;
  }
}

function completeLevel() {
  const matchDiff = matchGoalsFor - matchGoalsAgainst;
  if (matchDiff < 0) {
    endGame("Partido perdido", buildGameOverDetail(`Perdiste ${matchGoalsFor}-${matchGoalsAgainst}. Puntaje final: ${formatScore(totalPoints)}.`), "loss");
    return;
  }

  if (matchDiff === 0) {
    goldenGoal = true;
    timeLeft = 0;
    goalBanners = [{
      label: "GOL DE ORO",
      color: "#ffe45c",
      startedAt: performance.now(),
      duration: 1200,
    }];
    updateHud();
    return;
  }

  winCurrentLevel("Partido ganado");
}

function startBonusLevel() {
  bonusActive = true;
  goldenGoal = false;
  gameMode = "playing";
  timeLeft = 45;
  bonusPoints = 0;
  bonusClears = 0;
  bonusMisses = 0;
  pausedUntil = 0;
  matchGoalsFor = 0;
  matchGoalsAgainst = 0;
  goalBanners = [];
  confetti = [];
  defensiveRespawns = [];
  paddle = {
    width: Math.max(96, 148 - level * 5),
    height: 24,
    x: world.width / 2,
    y: world.height - 72,
    speed: 760 + level * 22,
  };
  fieldTheme = createFieldTheme(level + 1);
  bricks = createBricks(level);
  balls = [createBonusBall()];
  elements.overlay.hidden = true;
  updateHud();
}

function finishBonusLevel() {
  bonusActive = false;
  defensiveRespawns = [];
  balls = [];
  gameMode = "level";
  const previousTotal = totalPoints;
  addPoints(bonusPoints);
  showOverlay(
    "Bonus terminado",
    `Despejes: ${bonusClears}. Pelotas adentro: ${bonusMisses}. Bonus: +${formatScore(bonusPoints)}. Total: ${formatScore(previousTotal)} + ${formatScore(bonusPoints)} = ${formatScore(totalPoints)}.`,
    "Siguiente pantalla",
    "win"
  );
}

function winCurrentLevel(title) {
  const matchDiff = matchGoalsFor - matchGoalsAgainst;
  wins += 1;
  goalDiff += matchDiff;
  goldenGoal = false;
  addPoints(SCORE_VALUES.matchWin);

  if (level >= 6) {
    endGame("Campaña perfecta", buildGameOverDetail(`Ganaste todos los partidos. Puntaje final: ${formatScore(totalPoints)}.`), "win");
  } else if (level === 3 && !bonusPlayed) {
    bonusPlayed = true;
    gameMode = "bonus-ready";
    showOverlay("PANTALLA DE BONUS", "El arquero queda solo en el área. Atajá y despejá penales sorpresa durante 45 segundos.", "Entrar al bonus", "bonus-intro");
  } else {
    gameMode = "level";
    showOverlay(title, `Ganaste ${matchGoalsFor}-${matchGoalsAgainst}. Bonus +${SCORE_VALUES.matchWin}. Puntaje: ${formatScore(totalPoints)}.`, "Siguiente pantalla", "win");
  }
}

function updatePaddle(delta) {
  const leftPressed = keysDown.has("arrowleft") || keysDown.has("a");
  const rightPressed = keysDown.has("arrowright") || keysDown.has("d");
  if (leftPressed) paddle.x -= paddle.speed * delta;
  if (rightPressed) paddle.x += paddle.speed * delta;
  clampPaddle();
}

function movePaddleFromPointer(event) {
  event.preventDefault();
  const rect = elements.touchZone.getBoundingClientRect();
  const scale = world.width / rect.width;
  paddle.x = (event.clientX - rect.left) * scale;
  clampPaddle();
}

function clampPaddle() {
  const half = paddle.width / 2;
  paddle.x = Math.max(half + 8, Math.min(world.width - half - 8, paddle.x));
}

function handlePaddleCollisions() {
  const half = paddle.width / 2;
  balls.forEach((currentBall) => {
    const withinX = currentBall.x + currentBall.radius >= paddle.x - half && currentBall.x - currentBall.radius <= paddle.x + half;
    const withinY = currentBall.y + currentBall.radius >= paddle.y && currentBall.y - currentBall.radius <= paddle.y + paddle.height;
    if (!withinX || !withinY || currentBall.vy <= 0) return;

    const offset = (currentBall.x - paddle.x) / half;
    if (!currentBall.scoring) {
      clearDefensiveBall(currentBall, offset);
      return;
    }

    currentBall.y = paddle.y - currentBall.radius;
    currentBall.vx = offset * (330 + level * 32);
    currentBall.vy = -Math.abs(currentBall.vy) - level * 5;
  });
}

function clearDefensiveBall(currentBall, offset = 0) {
  currentBall.defended = true;
  currentBall.clearing = true;
  currentBall.y = paddle.y - currentBall.radius;
  const side = offset >= 0 ? 1 : -1;
  currentBall.vx = side * (760 + level * 54 + Math.abs(offset) * 220);
  currentBall.vy = -120 - level * 10;
  if (bonusActive) {
    bonusClears += 1;
    bonusPoints += SCORE_VALUES.bonusClearance;
    goalBanners = [{
      label: `DESPEJE PIKA! +${SCORE_VALUES.bonusClearance}`,
      color: "#ffe45c",
      startedAt: performance.now(),
      duration: 1300,
      center: true,
      big: true,
    }];
    launchConfetti();
  }
}

function handleBrickCollisions() {
  balls.forEach((currentBall) => {
    if (currentBall.bonus) return;

    const hitIndex = bricks.findIndex((brick) =>
      brick.active &&
      currentBall.x + currentBall.radius >= brick.x &&
      currentBall.x - currentBall.radius <= brick.x + brick.width &&
      currentBall.y + currentBall.radius >= brick.y &&
      currentBall.y - currentBall.radius <= brick.y + brick.height
    );
    if (hitIndex === -1) return;

    const brick = bricks[hitIndex];
    const ballCenterWasAbove = currentBall.y < brick.y || currentBall.y > brick.y + brick.height;
    const impactOffset = ((currentBall.x - (brick.x + brick.width / 2)) / (brick.width / 2)) || 0;
    breakBrick(brick);
  if (brick.attacker) {
      currentBall.vx = impactOffset * (210 + level * 14);
      currentBall.vy = Math.min(Math.abs(currentBall.vy) + 125 + level * 12, 520 + level * 22);
    } else if (ballCenterWasAbove) {
      currentBall.vy = Math.sign(currentBall.vy || 1) * Math.min(Math.abs(currentBall.vy), 330 + level * 28);
      currentBall.vy *= -1;
    } else {
      currentBall.vx = Math.sign(currentBall.vx || 1) * Math.min(Math.abs(currentBall.vx), 300 + level * 24);
      currentBall.vx *= -1;
    }
  });
}

function breakBrick(brick) {
  const points = brick.attacker
    ? SCORE_VALUES.attackerHit
    : brick.defender
      ? SCORE_VALUES.defenderHit
      : SCORE_VALUES.rivalHit;
  playersHit += 1;
  addPoints(points);
  brick.hits += 1;
  brick.active = false;
  if (brick.hits >= 3) {
    brick.destroyed = true;
    brick.respawnAt = Number.POSITIVE_INFINITY;
    goalBanners = [{
      label: `EXPLOTA +${points}`,
      color: brick.color,
      startedAt: performance.now(),
      duration: 900,
      center: false,
    }];
    launchConfetti(brick.x + brick.width / 2, brick.y + brick.height / 2, 24);
    return;
  }

  brick.respawnAt = performance.now() + (brick.defender ? 6000 : 2000);
  goalBanners = [{
    label: `+${points}`,
    color: brick.color,
    startedAt: performance.now(),
    duration: 650,
  }];
}

function addPoints(points) {
  totalPoints = Math.max(0, totalPoints + points);
}

function loseLife() {
  balls = [createBall(paddle.x, paddle.y - 18, 220 + level * 26, -(320 + level * 34))];
  updateHud();
}

function endGame(title, detail, mood = "loss") {
  gameMode = "ended";
  lastScore = totalPoints;
  lastRecord = {
    points: totalPoints,
    wins,
    goalDiff,
    goalsFor: goals,
    goalsAgainst: rivalGoals,
    playersHit,
  };
  goalBanners = [];
  elements.saveButton.disabled = totalPoints <= 0;
  showOverlay(title, detail, "Jugar otra vez", mood);
}

async function saveLastScore() {
  if (!lastRecord || lastRecord.points <= 0) {
    setStatus("Todavia no hay puntos para guardar.");
    return;
  }
  if (!authState) {
    setStatus("Para guardar tu puntaje oficial, ingresa o crea usuario.");
    elements.loginDialog.showModal();
    return;
  }
  if (!isCloudConfigured()) {
    setStatus("Firebase Database no esta configurado.");
    return;
  }

  const playerName = cleanName(elements.playerName.value || authState.displayName || authState.email);
  if (!playerName) {
    setStatus("Escribi tu nombre para el ranking.");
    return;
  }

  elements.saveButton.disabled = true;

  const previous = normalizeChallengeRecord(challengeScores[authState.uid]);
  if (!isBetterRecord(lastRecord, previous)) {
    elements.saveButton.disabled = false;
    setStatus(`No se actualizo: tu mejor puntaje sigue siendo ${formatScore(previous.points)}.`);
    return;
  }

  setStatus("Actualizando puntaje...");
  const response = await fetch(challengeScoreUrl(authState.uid), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      player: playerName,
      points: lastRecord.points,
      wins: lastRecord.wins,
      goalDiff: lastRecord.goalDiff,
      goalsFor: lastRecord.goalsFor,
      goalsAgainst: lastRecord.goalsAgainst,
      playersHit: lastRecord.playersHit,
      game: CHALLENGE_NAME,
      level,
      updatedAt: new Date().toISOString(),
    }),
  });

  if (!response.ok) {
    elements.saveButton.disabled = false;
    setStatus("No se pudo guardar. Revisa reglas/permisos de Firebase.");
    return;
  }

  setStatus("Puntaje actualizado.");
  await loadChallengeScores();
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
  elements.loginDialog.close();
  renderStatus();
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
  elements.loginDialog.close();
  elements.playerName.value = authState.displayName || "";
  renderStatus();
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
  elements.playerName.value = authState.displayName || "";
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

function setAuthStatus(message) {
  elements.authStatus.textContent = message;
}

async function loadChallengeScores() {
  try {
    const response = await fetch(challengeScoresUrl());
    if (!response.ok) throw new Error("No se pudo leer el ranking del desafio");
    challengeScores = (await response.json()) || {};
  } catch (error) {
    console.warn(error);
    challengeScores = {};
  }
  renderChallengeRanking();
}

function renderChallengeRanking() {
  if (!elements.rankingList) return;
  elements.rankingList.innerHTML = "";
  const ranking = Object.values(challengeScores)
    .map(normalizeChallengeRecord)
    .filter((entry) => entry.player && Number.isFinite(entry.points))
    .sort(compareChallengeRecords)
    .slice(0, 8);

  if (ranking.length === 0) {
    elements.rankingList.append(elements.emptyTemplate.content.firstElementChild.cloneNode(true));
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
    elements.rankingList.append(row);
  });
}

function getChallengeLeader() {
  return Object.values(challengeScores)
    .map(normalizeChallengeRecord)
    .filter((entry) => entry.player && Number.isFinite(entry.points))
    .sort(compareChallengeRecords)[0] || null;
}

function buildGameOverDetail(baseDetail) {
  const leader = getChallengeLeader();
  if (!leader) {
    return `${baseDetail} Todavia no hay lider del ranking oficial.`;
  }

  const current = { points: totalPoints };
  if (isBetterRecord(current, leader)) {
    return `${baseDetail} Con este puntaje superas a ${leader.player}, lider actual con ${formatScore(leader.points)}.`;
  }

  const missingPoints = Math.max(0, leader.points - totalPoints + 1);
  return `${baseDetail} El lider es ${leader.player}: ${formatScore(leader.points)}. Te faltaron ${formatScore(missingPoints)} para pasarlo.`;
}

function normalizeChallengeRecord(entry = {}) {
  return {
    player: entry.player || "",
    game: entry.game || CHALLENGE_NAME,
    points: Number.isFinite(entry.points) ? entry.points : 0,
    wins: Number.isFinite(entry.wins) ? entry.wins : Number(entry.points || 0),
    goalDiff: Number.isFinite(entry.goalDiff) ? entry.goalDiff : 0,
    goalsFor: Number.isFinite(entry.goalsFor) ? entry.goalsFor : 0,
    goalsAgainst: Number.isFinite(entry.goalsAgainst) ? entry.goalsAgainst : 0,
    playersHit: Number.isFinite(entry.playersHit) ? entry.playersHit : 0,
  };
}

function compareChallengeRecords(a, b) {
  return b.points - a.points || b.wins - a.wins || b.goalDiff - a.goalDiff || String(a.player).localeCompare(String(b.player));
}

function isBetterRecord(current, previous) {
  if (!previous) return true;
  return current.points > previous.points;
}

function draw() {
  ctx.clearRect(0, 0, world.width, world.height);
  drawBackground();
  if (!bonusActive) drawRivalGoalkeeper();
  drawBricks();
  drawConfetti();
  drawGoalBanners();
  drawPaddle();
  drawBalls();
}

function drawBackground() {
  if (bonusActive) {
    drawBonusBackground();
    return;
  }

  const theme = fieldTheme || createFieldTheme(1);
  const field = ctx.createLinearGradient(0, 0, 0, world.height);
  field.addColorStop(0, theme.top);
  field.addColorStop(0.5, theme.mid);
  field.addColorStop(1, theme.bottom);
  ctx.fillStyle = field;
  ctx.fillRect(0, 0, world.width, world.height);

  for (let y = 0; y < world.height; y += 76) {
    ctx.fillStyle = y % 152 === 0 ? "rgba(255,255,255,0.035)" : "rgba(0,0,0,0.045)";
    ctx.fillRect(0, y, world.width, 76);
  }

  ctx.strokeStyle = "rgba(255, 255, 255, 0.42)";
  ctx.lineWidth = 3;
  ctx.strokeRect(26, 28, world.width - 52, world.height - 56);
  ctx.beginPath();
  ctx.moveTo(26, world.height / 2);
  ctx.lineTo(world.width - 26, world.height / 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(world.width / 2, world.height / 2, 74, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = "rgba(255, 255, 255, 0.55)";
  ctx.strokeRect(world.width / 2 - 112, 28, 224, 104);
  ctx.strokeRect(world.width / 2 - 62, 28, 124, 54);
  ctx.fillStyle = "rgba(255, 255, 255, 0.78)";
  ctx.fillRect(world.width / 2 - 78, 28, 156, 6);

  ctx.strokeRect(world.width / 2 - 112, world.height - 132, 224, 104);
  ctx.strokeRect(world.width / 2 - 62, world.height - 82, 124, 54);
  ctx.fillStyle = "rgba(255, 255, 255, 0.78)";
  ctx.fillRect(world.width / 2 - 78, world.height - 34, 156, 6);
}

function drawBonusBackground() {
  const theme = fieldTheme || createFieldTheme(1);
  const field = ctx.createLinearGradient(0, 0, 0, world.height);
  field.addColorStop(0, theme.mid);
  field.addColorStop(0.56, theme.top);
  field.addColorStop(1, theme.bottom);
  ctx.fillStyle = field;
  ctx.fillRect(0, 0, world.width, world.height);

  for (let y = 0; y < world.height; y += 62) {
    ctx.fillStyle = y % 124 === 0 ? "rgba(255,255,255,0.045)" : "rgba(0,0,0,0.05)";
    ctx.fillRect(0, y, world.width, 62);
  }

  ctx.strokeStyle = "rgba(255,255,255,0.58)";
  ctx.lineWidth = 4;
  ctx.strokeRect(18, 42, world.width - 36, world.height - 70);
  ctx.strokeRect(42, world.height - 312, world.width - 84, 276);
  ctx.strokeRect(108, world.height - 172, world.width - 216, 136);
  ctx.beginPath();
  ctx.arc(world.width / 2, world.height - 312, 74, 0, Math.PI, true);
  ctx.stroke();

  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.fillRect(world.width / 2 - 160, world.height - 36, 320, 8);
  ctx.fillStyle = "rgba(49,232,255,0.14)";
  ctx.fillRect(world.width / 2 - 160, world.height - 116, 320, 80);
}

function drawBricks() {
  bricks.forEach((brick) => {
    drawRival(brick);
  });
}

function drawPaddle() {
  const gloveGap = paddle.width * 0.28;
  drawGlove(paddle.x - gloveGap, paddle.y + 2, -1);
  drawGlove(paddle.x + gloveGap, paddle.y + 2, 1);
  ctx.fillStyle = "#ffe45c";
  ctx.shadowColor = "#ffe45c";
  ctx.shadowBlur = 14;
  roundRect(paddle.x - 24, paddle.y + 10, 48, 18, 8);
  ctx.fill();
  ctx.shadowBlur = 0;
}

function drawRivalGoalkeeper() {
  const gloveGap = rivalGoalkeeper.width * 0.3;
  ctx.save();
  ctx.globalAlpha = 0.95;
  drawKeeperGlove(rivalGoalkeeper.x - gloveGap, rivalGoalkeeper.y + 10, -1, "#ff3fad");
  drawKeeperGlove(rivalGoalkeeper.x + gloveGap, rivalGoalkeeper.y + 10, 1, "#ff3fad");
  ctx.fillStyle = "#31e8ff";
  ctx.shadowColor = "#31e8ff";
  ctx.shadowBlur = 14;
  roundRect(rivalGoalkeeper.x - 22, rivalGoalkeeper.y + 2, 44, 18, 8);
  ctx.fill();
  ctx.restore();
}

function drawRival(brick) {
  if (!brick.active) return;

  const cx = brick.x + brick.width / 2;
  const cy = brick.y + brick.height / 2;
  const damageAlpha = Math.max(0.42, 1 - brick.hits * 0.18);
  ctx.save();
  ctx.globalAlpha = damageAlpha;
  ctx.shadowColor = brick.color;
  ctx.shadowBlur = 12;
  ctx.fillStyle = brick.color;
  roundRect(cx - 11, cy - 2, 22, 17, 6);
  ctx.fill();
  ctx.fillStyle = "#f6d0a8";
  ctx.beginPath();
  ctx.arc(cx, cy - 14, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#050715";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx - 6, cy + 16);
  ctx.lineTo(cx - 11, cy + 25);
  ctx.moveTo(cx + 6, cy + 16);
  ctx.lineTo(cx + 11, cy + 25);
  ctx.stroke();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - 15, cy + 1);
  ctx.lineTo(cx - 24, cy + 8);
  ctx.moveTo(cx + 15, cy + 1);
  ctx.lineTo(cx + 24, cy + 8);
  ctx.stroke();
  ctx.restore();
}

function drawGlove(x, y, side) {
  drawKeeperGlove(x, y, side, "#60ff94");
}

function drawKeeperGlove(x, y, side, color) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 18;
  ctx.translate(x, y);
  ctx.rotate(side * 0.12);
  roundRect(-28, -14, 56, 34, 16);
  ctx.fill();
  ctx.fillStyle = "#050715";
  ctx.fillRect(side > 0 ? -24 : 14, -4, 10, 8);
  ctx.restore();
}

function drawGoalBanners() {
  const now = performance.now();
  goalBanners = goalBanners.filter((banner) => now - banner.startedAt < banner.duration);
  goalBanners.forEach((banner, index) => {
    const elapsed = now - banner.startedAt;
    const progress = elapsed / banner.duration;
    const opacity = Math.max(0, 1 - progress);
    const y = banner.center ? world.height / 2 : world.height * 0.32 + index * 42 + progress * 90;

    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.fillStyle = "#ffffff";
    ctx.shadowColor = banner.color;
    ctx.shadowBlur = banner.center ? 46 : 30;
    ctx.font = banner.big ? "900 52px system-ui" : banner.center ? "900 66px system-ui" : banner.label.length > 3 ? "900 46px system-ui" : "900 78px system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(banner.label, world.width / 2, y);
    ctx.restore();
  });
}

function drawConfetti() {
  confetti.forEach((piece) => {
    ctx.save();
    ctx.globalAlpha = Math.min(1, piece.life);
    ctx.translate(piece.x, piece.y);
    ctx.rotate(piece.rotation);
    ctx.fillStyle = piece.color;
    ctx.fillRect(-piece.size / 2, -piece.size / 2, piece.size, piece.size * 0.62);
    ctx.restore();
  });
}

function drawBalls() {
  balls.forEach((currentBall) => {
    ctx.beginPath();
    ctx.fillStyle = currentBall.scoring ? "#ffffff" : "#ffe45c";
    ctx.shadowColor = currentBall.scoring ? "#ffffff" : "#ffe45c";
    ctx.shadowBlur = 18;
    ctx.arc(currentBall.x, currentBall.y, currentBall.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#050715";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(currentBall.x, currentBall.y, currentBall.radius * 0.48, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(currentBall.x - currentBall.radius, currentBall.y);
    ctx.lineTo(currentBall.x + currentBall.radius, currentBall.y);
    ctx.moveTo(currentBall.x, currentBall.y - currentBall.radius);
    ctx.lineTo(currentBall.x, currentBall.y + currentBall.radius);
    ctx.stroke();
    ctx.shadowBlur = 0;
  });
}

function roundRect(x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function showOverlay(title, detail, buttonText, mood = "neutral") {
  elements.overlayTitle.textContent = title;
  elements.overlayDetail.textContent = detail;
  elements.startButton.textContent = buttonText;
  elements.overlay.classList.remove("challenge-overlay-win", "challenge-overlay-loss", "challenge-overlay-bonus", "challenge-overlay-bonus-intro");
  if (mood === "win") elements.overlay.classList.add("challenge-overlay-win");
  if (mood === "loss") elements.overlay.classList.add("challenge-overlay-loss");
  if (mood === "bonus") elements.overlay.classList.add("challenge-overlay-bonus");
  if (mood === "bonus-intro") elements.overlay.classList.add("challenge-overlay-bonus", "challenge-overlay-bonus-intro");
  elements.overlay.hidden = false;
}

function updateHud() {
  elements.score.textContent = bonusActive ? `Bonus ${formatScore(bonusPoints)}` : formatScore(totalPoints);
  elements.level.textContent = bonusActive ? "Bonus" : `P${level} · ${matchGoalsFor}-${matchGoalsAgainst}`;
  elements.lives.textContent = goldenGoal ? "Oro" : `${Math.max(0, Math.ceil(timeLeft))}s`;
}

function renderStatus() {
  if (!authState) {
    elements.loginButton.hidden = false;
    elements.headerLoginButton.hidden = false;
    elements.profileLink.hidden = true;
    setStatus("Podes jugar gratis. Para guardar tu puntaje oficial, ingresa o crea usuario.");
    return;
  }
  elements.loginButton.hidden = true;
  elements.headerLoginButton.hidden = true;
  elements.profileLink.hidden = false;
  setStatus(`Sesion activa: ${authState.email}. Tu ranking se ordena por puntos totales.`);
}

function formatSigned(value) {
  return value > 0 ? `+${value}` : String(value);
}

function setStatus(message) {
  elements.status.textContent = message;
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
    window.localStorage.setItem(`${STORAGE_KEY}-auth`, JSON.stringify(authState));
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

function challengeScoresUrl() {
  const baseUrl = cloudConfig.firebaseDatabaseUrl.replace(/\/$/, "");
  return `${baseUrl}/rankings/${encodeURIComponent(currentRankingId)}/challengeScores/${CHALLENGE_ID}.json`;
}

function challengeScoreUrl(uid) {
  const baseUrl = cloudConfig.firebaseDatabaseUrl.replace(/\/$/, "");
  return `${baseUrl}/rankings/${encodeURIComponent(currentRankingId)}/challengeScores/${CHALLENGE_ID}/${encodeURIComponent(uid)}.json?auth=${encodeURIComponent(authState.idToken)}`;
}

function publicRankingUrl(rankingId) {
  const baseUrl = window.location.origin === "null"
    ? "./viewer.html"
    : `${window.location.origin}/viewer.html`;
  return `${baseUrl}?ranking=${encodeURIComponent(rankingId)}`;
}

function loadRankingId() {
  const urlRanking = new URLSearchParams(window.location.search).get("ranking");
  return slugify(urlRanking || cloudConfig.activeRankingId || cloudConfig.roomId || "black-dog");
}

function loadAuthState() {
  try {
    const saved = window.localStorage.getItem(`${STORAGE_KEY}-auth`);
    return saved ? JSON.parse(saved) : null;
  } catch {
    return null;
  }
}

function isCloudConfigured() {
  return cloudConfig.firebaseDatabaseUrl.trim().length > 0;
}

function isAuthConfigured() {
  return Boolean(cloudConfig.firebaseWebApiKey && cloudConfig.firebaseWebApiKey.trim());
}

function cleanName(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function slugify(value) {
  return cleanName(String(value || ""))
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function formatScore(value) {
  return new Intl.NumberFormat("es-AR").format(value || 0);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
