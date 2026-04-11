const GRID = 15;
const CENTER = 7;
const $ = (s) => document.querySelector(s);

function shuffleInPlace(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function makePool() {
  return shuffleInPlace([1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4]);
}
function decideFirst(red, blue) {
  for (let i = 0; i < 12; i++) {
    if (red[i] < blue[i]) return "red";
    if (red[i] > blue[i]) return "blue";
  }
  return "red";
}

function pipHtml(n, side) {
  const fill = side === "red" ? "#c62828" : "#0d47a1";
  const patterns = {
    1: [[12.5, 12.5]],
    2: [
      [7, 7],
      [18, 18],
    ],
    3: [
      [7, 7],
      [12.5, 12.5],
      [18, 18],
    ],
    4: [
      [7, 7],
      [18, 7],
      [7, 18],
      [18, 18],
    ],
  };
  const pts = patterns[n] || patterns[1];
  const circles = pts
    .map(([x, y]) => "<circle cx=\"" + x + "\" cy=\"" + y + "\" r=\"3\" fill=\"" + fill + "\"/>")
    .join("");
  return (
    "<div class=\"piece piece--svg\" data-pips=\"" +
    n +
    "\"><svg width=\"25\" height=\"25\" viewBox=\"0 0 25 25\" aria-hidden=\"true\" focusable=\"false\">" +
    circles +
    "</svg></div>"
  );
}

const game = {
  board: [],
  redQ: [],
  blueQ: [],
  turn: "red",
  first: "red",
  piecesOnBoard: 0,
  lastMove: null,
  selected: null,
  over: false,
  locked: false,
  bannerTimer: null,
  unlimited: false,
  base: 120,
  inc: 10,
  timerOn: false,
  redMs: 120000,
  blueMs: 120000,
  turnStartedAt: 0,
  raf: null,
  penaltyUntil: { red: 0, blue: 0 },
  tickAudioCtx: null,
  lastTickPlayedSec: -1,
};

function emptyBoard() {
  game.board = Array.from({ length: GRID }, () => Array(GRID).fill(null));
}
function inBounds(r, c) {
  return r >= 0 && r < GRID && c >= 0 && c < GRID;
}
function neighbors4(r, c) {
  return [
    [r - 1, c],
    [r + 1, c],
    [r, c - 1],
    [r, c + 1],
  ].filter(([x, y]) => inBounds(x, y));
}
function hasOrthNeighbor(r, c) {
  for (const [x, y] of neighbors4(r, c)) if (game.board[x][y]) return true;
  return false;
}
function canPlaceHere(r, c) {
  if (game.board[r][c]) return false;
  if (game.piecesOnBoard === 0) return false;
  return hasOrthNeighbor(r, c);
}
function other(p) {
  return p === "red" ? "blue" : "red";
}
function canAct() {
  if (game.over || game.locked) return false;
  if (performance.now() < game.penaltyUntil[game.turn]) return false;
  return true;
}

function placeAutoCenter() {
  const fp = game.first;
  const q = fp === "red" ? game.redQ : game.blueQ;
  const val = q.shift();
  game.board[CENTER][CENTER] = { player: fp, value: val };
  game.piecesOnBoard = 1;
  game.lastMove = { r: CENTER, c: CENTER };
  game.turn = other(fp);
}

function commitPlace(r, c) {
  const q = game.turn === "red" ? game.redQ : game.blueQ;
  if (!q.length) return;
  const val = q.shift();
  const pl = game.turn;
  game.board[r][c] = { player: pl, value: val };
  game.piecesOnBoard += 1;
  game.lastMove = { r, c };
  if (game.piecesOnBoard === 2 && !game.unlimited) {
    game.timerOn = true;
    game.redMs = game.base * 1000;
    game.blueMs = game.base * 1000;
  } else if (game.timerOn && !game.unlimited) {
    if (pl === "red") game.redMs = Math.max(0, game.redMs + game.inc * 1000);
    else game.blueMs = Math.max(0, game.blueMs + game.inc * 1000);
  }
  game.turn = other(pl);
  game.selected = null;
  if (game.timerOn && !game.unlimited) {
    game.turnStartedAt = performance.now();
    checkTimeLoss();
  }
}

function checkTimeLoss() {
  if (game.over) return;
  const cur = game.turn;
  const ms = cur === "red" ? game.redMs : game.blueMs;
  if (ms <= 0) endGame(other(cur), "\u65f6\u95f4\u8017\u5c3d");
}

function endGame(winner, msg) {
  game.over = true;
  game.locked = true;
  if (game.raf) cancelAnimationFrame(game.raf);
  game.raf = null;
  $("#board").classList.add("board--locked");
  $("#modalMessage").textContent =
    msg || (winner === "red" ? "\u7ea2\u65b9\u83b7\u80dc" : "\u84dd\u65b9\u83b7\u80dc");
  $("#modalOverlay").classList.remove("hidden");
}

function segH(r, c) {
  const cell = game.board[r][c];
  if (!cell) return 0;
  const p = cell.player;
  let s = 0;
  let x = c;
  while (x >= 0 && game.board[r][x] && game.board[r][x].player === p) {
    s += game.board[r][x].value;
    x--;
  }
  for (x = c + 1; x < GRID && game.board[r][x] && game.board[r][x].player === p; x++) s += game.board[r][x].value;
  return s;
}
function segV(r, c) {
  const cell = game.board[r][c];
  if (!cell) return 0;
  const p = cell.player;
  let s = 0;
  let y = r;
  while (y >= 0 && game.board[y][c] && game.board[y][c].player === p) {
    s += game.board[y][c].value;
    y--;
  }
  for (y = r + 1; y < GRID && game.board[y][c] && game.board[y][c].player === p; y++) s += game.board[y][c].value;
  return s;
}
function checkWinClaim() {
  const lm = game.lastMove;
  if (!lm) return false;
  const r = lm.r;
  const c = lm.c;
  return segH(r, c) === 10 || segV(r, c) === 10;
}

function playTick() {
  try {
    if (!game.tickAudioCtx) game.tickAudioCtx = new AudioContext();
    const ctx = game.tickAudioCtx;
    if (ctx.state === "suspended") ctx.resume();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "square";
    o.frequency.value = 880;
    g.gain.value = 0.04;
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.05);
  } catch (e) {}
}

function tickLoop(now) {
  if (game.over || !game.timerOn || game.unlimited) {
    game.raf = null;
    return;
  }
  const cur = game.turn;
  const elapsed = now - game.turnStartedAt;
  if (cur === "red") {
    game.redMs = Math.max(0, game.redMs - elapsed);
    game.turnStartedAt = now;
  } else {
    game.blueMs = Math.max(0, game.blueMs - elapsed);
    game.turnStartedAt = now;
  }
  updateClockDisplay();
  const active = game.turn;
  const sec = Math.ceil((active === "red" ? game.redMs : game.blueMs) / 1000);
  if (sec < 20 && sec > 0) {
    $(active === "red" ? "#clockRed" : "#clockBlue").classList.add("clock--warn");
    if (sec !== game.lastTickPlayedSec) {
      playTick();
      game.lastTickPlayedSec = sec;
    }
  } else game.lastTickPlayedSec = -1;
  if ((active === "red" ? game.redMs : game.blueMs) <= 0) {
    endGame(other(active), "\u65f6\u95f4\u8017\u5c3d");
    return;
  }
  game.raf = requestAnimationFrame(tickLoop);
}

function updateClockDisplay() {
  const fmt = function (ms) {
    return game.unlimited ? "\u221e" : String(Math.max(0, Math.ceil(ms / 1000)));
  };
  $("#clockRed").textContent = fmt(game.redMs);
  $("#clockBlue").textContent = fmt(game.blueMs);
  $("#clockRed").classList.toggle(
    "clock--warn",
    !game.unlimited && game.turn === "red" && game.redMs < 20000 && game.redMs > 0
  );
  $("#clockBlue").classList.toggle(
    "clock--warn",
    !game.unlimited && game.turn === "blue" && game.blueMs < 20000 && game.blueMs > 0
  );
}

function renderBoard() {
  const boardEl = $("#board");
  if (!boardEl) return;
  boardEl.innerHTML = "";
  boardEl.classList.toggle("board--locked", game.locked);
  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      const cell = document.createElement("div");
      cell.className = "cell";
      cell.dataset.r = String(r);
      cell.dataset.c = String(c);
      if (r === CENTER && c === CENTER) cell.classList.add("cell--start");
      const occ = game.board[r][c];
      if (occ) {
        cell.innerHTML = pipHtml(occ.value, occ.player);
        const pc = cell.querySelector(".piece");
        if (pc) pc.classList.add("piece--on-board");
      }
      if (game.selected && game.selected.r === r && game.selected.c === c) cell.classList.add("cell--preview");
      if (!occ && game.piecesOnBoard > 0 && !canPlaceHere(r, c)) cell.classList.add("cell--invalid");
      cell.addEventListener("click", function () {
        onCellClick(r, c);
      });
      boardEl.appendChild(cell);
    }
  }
}

function renderQueue(el, arr, side, isNext) {
  if (!el) return;
  el.innerHTML = "";
  arr.forEach(function (val, idx) {
    const w = document.createElement("div");
    w.innerHTML = pipHtml(val, side);
    const p = w.firstElementChild;
    if (p && isNext && idx === 0) p.classList.add("piece--next");
    if (p) el.appendChild(p);
  });
}

function applyDualLayout() {
  const app = $("#app");
  if (!app) return;
  const dual = $("#battleMode").value === "dual";
  app.dataset.battleMode = dual ? "dual" : "same";
  const sameOnly = document.querySelector(".same-only");
  if (sameOnly) sameOnly.style.display = dual ? "none" : "";
  const local = $("#localSide") ? $("#localSide").value : "red";
  const pb = $("#panelBlue");
  const pr = $("#panelRed");
  if (dual) {
    if (local === "red") {
      pr.style.order = "3";
      pb.style.order = "1";
    } else {
      pb.style.order = "3";
      pr.style.order = "1";
    }
    $(".board-wrap").style.order = "2";
  } else {
    pr.style.order = "";
    pb.style.order = "";
    $(".board-wrap").style.order = "";
  }
}

function renderAll() {
  renderQueue($("#queueRed"), game.redQ, "red", game.turn === "red" && !game.over);
  renderQueue($("#queueBlue"), game.blueQ, "blue", game.turn === "blue" && !game.over);
  renderBoard();
  $("#btnClaimWin").disabled = game.over || game.piecesOnBoard < 2 || !game.lastMove;
  updateClockDisplay();
}

function onCellClick(r, c) {
  if (game.over || game.locked) return;
  if (!canAct()) return;
  if (!canPlaceHere(r, c)) {
    game.selected = null;
    renderAll();
    return;
  }
  if (game.selected && game.selected.r === r && game.selected.c === c) {
    commitPlace(r, c);
    $("#statusText").textContent =
      (game.turn === "red" ? "\u7ea2\u65b9" : "\u84dd\u65b9") + "\u884c\u68cb\uff1a\u70b9\u540c\u4e00\u683c\u4e24\u6b21\u786e\u8ba4";
    renderAll();
    if (game.timerOn && !game.unlimited && !game.over) {
      if (game.raf) cancelAnimationFrame(game.raf);
      game.turnStartedAt = performance.now();
      game.raf = requestAnimationFrame(tickLoop);
    }
    return;
  }
  game.selected = { r: r, c: c };
  $("#statusText").textContent = "\u518d\u6b21\u70b9\u51fb\u540c\u4e00\u683c\u786e\u8ba4\u843d\u5b50";
  renderAll();
}

function showFirstBanner(t) {
  const b = $("#firstPlayerBanner");
  b.textContent = t;
  b.classList.remove("hidden");
  clearTimeout(game.bannerTimer);
  game.bannerTimer = setTimeout(function () {
    b.classList.add("hidden");
  }, 3000);
}

function readTimeOptions() {
  const preset = $("#timePreset").value;
  if (preset === "unlimited") {
    game.unlimited = true;
    game.base = 120;
    game.inc = 10;
  } else if (preset === "custom") {
    game.unlimited = false;
    game.base = Number($("#baseSec").value) || 120;
    game.inc = Number($("#incSec").value) || 10;
  } else {
    game.unlimited = false;
    game.base = 120;
    game.inc = 10;
  }
}

function newGame() {
  readTimeOptions();
  if (game.raf) cancelAnimationFrame(game.raf);
  game.raf = null;
  clearTimeout(game.bannerTimer);
  emptyBoard();
  game.redQ = makePool();
  game.blueQ = makePool();
  game.first = decideFirst(game.redQ, game.blueQ);
  game.turn = game.first;
  game.piecesOnBoard = 0;
  game.lastMove = null;
  game.selected = null;
  game.over = false;
  game.locked = false;
  game.timerOn = false;
  game.lastTickPlayedSec = -1;
  game.penaltyUntil = { red: 0, blue: 0 };
  $("#board").classList.remove("board--locked");
  showFirstBanner(game.first === "red" ? "\u7ea2\u65b9\u5148\u624b" : "\u84dd\u65b9\u5148\u624b");
  placeAutoCenter();
  $("#statusText").textContent =
    (game.turn === "red" ? "\u7ea2\u65b9" : "\u84dd\u65b9") + "\u884c\u68cb\uff1a\u70b9\u540c\u4e00\u683c\u4e24\u6b21\u786e\u8ba4";
  renderAll();
}

function onClaimWin() {
  if (game.over || !game.lastMove) return;
  if (!checkWinClaim()) {
    $("#modalMessage").textContent = "\u672a\u68c0\u6d4b\u5230\u548c\u4e3a10\u7684\u8fde\u7ebf";
    $("#modalOverlay").classList.remove("hidden");
    game.penaltyUntil[game.turn] = performance.now() + 5000;
    return;
  }
  const w = game.board[game.lastMove.r][game.lastMove.c].player;
  game.locked = true;
  game.over = true;
  $("#board").classList.add("board--locked");
  const piece = document.querySelector(
    ".cell[data-r=\"" + game.lastMove.r + "\"][data-c=\"" + game.lastMove.c + "\"] .piece"
  );
  if (piece) piece.classList.add("fx-win");
  $("#modalMessage").textContent =
    "\u5341\u8fde\u80dc\uff01" + (w === "red" ? "\u7ea2\u65b9" : "\u84dd\u65b9") + "\u83b7\u80dc";
  $("#modalOverlay").classList.remove("hidden");
}

function init() {
  $("#app").dataset.screenMode = $("#screenMode").value;
  const picks = document.querySelector(".mode-picks");
  const lab = document.createElement("label");
  lab.id = "localSideWrap";
  lab.style.display = "none";
  lab.innerHTML =
    "\u672c\u673a <select id=\"localSide\"><option value=\"red\">\u7ea2\u65b9</option><option value=\"blue\">\u84dd\u65b9</option></select>";
  picks.appendChild(lab);
  $("#battleMode").addEventListener("change", function () {
    $("#localSideWrap").style.display = $("#battleMode").value === "dual" ? "" : "none";
    applyDualLayout();
  });
  $("#btnNewGame").addEventListener("click", newGame);
  $("#btnClaimWin").addEventListener("click", onClaimWin);
  $("#modalClose").addEventListener("click", function () {
    $("#modalOverlay").classList.add("hidden");
  });
  $("#timePreset").addEventListener("change", function () {
    $("#customTimeRow").classList.toggle("hidden", $("#timePreset").value !== "custom");
  });
  $("#screenMode").addEventListener("change", function () {
    $("#app").dataset.screenMode = $("#screenMode").value;
  });
  const ls = $("#localSide");
  if (ls) ls.addEventListener("change", applyDualLayout);
  applyDualLayout();
  $("#customTimeRow").classList.add("hidden");
  newGame();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
