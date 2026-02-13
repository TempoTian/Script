const SIZE = 4;
const EMPTY = 0;
const HUMAN = 1;
const AI = 2;

const state = {
  board: Array.from({ length: SIZE }, () => Array(SIZE).fill(EMPTY)),
  current: HUMAN,
  phase: "placement", // placement | preMoveRemoval | movement
  preMoveRemovalsLeft: 0,
  preMoveRemover: null,
  lastPlacementPlayer: null,
  winner: null,
  pendingChoices: null,
  selectedPiece: null,
  usedArrays: {
    [HUMAN]: new Set(),
    [AI]: new Set(),
  },
  log: [],
  history: [],
  hadPiece: { [HUMAN]: false, [AI]: false },
};

const boardEl = document.getElementById("board");
const statusEl = document.getElementById("status");
const logEl = document.getElementById("log");
const choiceBox = document.getElementById("choiceBox");
const choicesEl = document.getElementById("choices");

document.getElementById("restartBtn").addEventListener("click", resetGame);
document.getElementById("undoBtn").addEventListener("click", undo);

function cloneState() {
  return {
    board: state.board.map((r) => [...r]),
    current: state.current,
    phase: state.phase,
    preMoveRemovalsLeft: state.preMoveRemovalsLeft,
    preMoveRemover: state.preMoveRemover,
    lastPlacementPlayer: state.lastPlacementPlayer,
    winner: state.winner,
    selectedPiece: state.selectedPiece ? [...state.selectedPiece] : null,
    pendingChoices: null,
    usedArrays: {
      [HUMAN]: new Set([...state.usedArrays[HUMAN]]),
      [AI]: new Set([...state.usedArrays[AI]]),
    },
    log: [...state.log],
    hadPiece: { [HUMAN]: state.hadPiece[HUMAN], [AI]: state.hadPiece[AI] },
  };
}

function saveHistory() {
  state.history.push(cloneState());
  if (state.history.length > 120) state.history.shift();
}

function undo() {
  if (!state.history.length || state.winner) return;
  const prev = state.history.pop();
  state.board = prev.board;
  state.current = prev.current;
  state.phase = prev.phase;
  state.preMoveRemovalsLeft = prev.preMoveRemovalsLeft;
  state.preMoveRemover = prev.preMoveRemover;
  state.lastPlacementPlayer = prev.lastPlacementPlayer;
  state.winner = prev.winner;
  state.usedArrays = prev.usedArrays;
  state.log = prev.log;
  state.hadPiece = prev.hadPiece;
  state.pendingChoices = null;
  state.selectedPiece = null;
  render();
}

function resetGame() {
  state.board = Array.from({ length: SIZE }, () => Array(SIZE).fill(EMPTY));
  state.current = HUMAN;
  state.phase = "placement";
  state.preMoveRemovalsLeft = 0;
  state.preMoveRemover = null;
  state.lastPlacementPlayer = null;
  state.winner = null;
  state.pendingChoices = null;
  state.selectedPiece = null;
  state.hadPiece[HUMAN] = false;
  state.hadPiece[AI] = false;
  state.usedArrays[HUMAN].clear();
  state.usedArrays[AI].clear();
  state.log = ["新对局开始，黑先。"];
  state.history = [];
  render();
}

function createBoard() {
  boardEl.innerHTML = "";
  for (let i = 0; i < SIZE; i++) {
    const h = document.createElement("div");
    h.className = "grid-line h";
    h.style.top = `${(i * 100) / (SIZE - 1)}%`;
    boardEl.appendChild(h);

    const v = document.createElement("div");
    v.className = "grid-line v";
    v.style.left = `${(i * 100) / (SIZE - 1)}%`;
    boardEl.appendChild(v);
  }

  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const btn = document.createElement("button");
      btn.className = "node";
      btn.dataset.r = r;
      btn.dataset.c = c;
      btn.style.left = `${(c * 100) / (SIZE - 1)}%`;
      btn.style.top = `${(r * 100) / (SIZE - 1)}%`;
      btn.addEventListener("click", () => handleNodeClick(r, c));
      boardEl.appendChild(btn);
    }
  }
}

function inRange(r, c) {
  return r >= 0 && r < SIZE && c >= 0 && c < SIZE;
}
function other(p) { return p === HUMAN ? AI : HUMAN; }

function countPieces(player, board = state.board) {
  let n = 0;
  for (const row of board) for (const v of row) if (v === player) n++;
  return n;
}

function boardFull(board = state.board) {
  return board.every((row) => row.every((v) => v !== EMPTY));
}

function movablePieces(player, board = state.board) {
  const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
  const res = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (board[r][c] !== player) continue;
      for (const [dr, dc] of dirs) {
        const nr = r + dr, nc = c + dc;
        if (inRange(nr, nc) && board[nr][nc] === EMPTY) {
          res.push([r, c]);
          break;
        }
      }
    }
  }
  return res;
}

function evaluateWin() {
  if (state.hadPiece[HUMAN] && countPieces(HUMAN) === 0) state.winner = AI;
  if (state.hadPiece[AI] && countPieces(AI) === 0) state.winner = HUMAN;
}

function getLine(pos, horizontal) {
  if (horizontal) {
    const r = pos[0];
    return Array.from({ length: SIZE }, (_, c) => [r, c]);
  }
  const c = pos[1];
  return Array.from({ length: SIZE }, (_, r) => [r, c]);
}

function lineKey(horizontal, idx) {
  return `${horizontal ? "R" : "C"}${idx}`;
}

function detectRulesAt(board, usedArrays, player, pos) {
  const enemy = other(player);
  const choices = [];

  for (const horizontal of [true, false]) {
    const line = getLine(pos, horizontal);
    const vals = line.map(([r, c]) => board[r][c]);
    const idx = horizontal ? pos[0] : pos[1];

    // 阵列: 4子同色且该线尚未触发
    if (vals.every((v) => v === player) && !usedArrays[player].has(lineKey(horizontal, idx))) {
      const enemies = [];
      for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
          if (board[r][c] === enemy) enemies.push([r, c]);
        }
      }
      if (enemies.length >= 2) {
        choices.push({ type: "array", horizontal, idx, take: 2, candidates: enemies });
      }
    }

    // 单推: 线内仅3子，且形态 enemy-player-player-empty / empty-player-player-enemy
    const occupied = vals.filter((v) => v !== EMPTY).length;
    if (occupied === 3) {
      const patterns = [
        [enemy, player, player, EMPTY],
        [EMPTY, player, player, enemy],
      ];
      for (const ptn of patterns) {
        if (vals.every((v, i) => v === ptn[i])) {
          const enemyIdx = ptn.indexOf(enemy);
          choices.push({
            type: "single",
            horizontal,
            idx,
            targets: [line[enemyIdx]],
          });
        }
      }
    }

    // 双推: [player, player, enemy, enemy] / reverse
    const doubles = [
      [player, player, enemy, enemy],
      [enemy, enemy, player, player],
    ];
    for (const ptn of doubles) {
      if (vals.every((v, i) => v === ptn[i])) {
        const targets = [];
        ptn.forEach((v, i) => { if (v === enemy) targets.push(line[i]); });
        choices.push({ type: "double", horizontal, idx, targets });
      }
    }
  }

  // 同类可能重复，去重
  const uniq = [];
  const seen = new Set();
  for (const ch of choices) {
    const k = `${ch.type}-${ch.horizontal}-${ch.idx}-${(ch.targets || []).flat().join(",")}`;
    if (!seen.has(k)) {
      seen.add(k);
      uniq.push(ch);
    }
  }
  return uniq;
}

function removePieces(board, positions) {
  for (const [r, c] of positions) board[r][c] = EMPTY;
}

function applyRuleChoice(chosen, actor, board = state.board, used = state.usedArrays) {
  if (!chosen) return;
  if (chosen.type === "array") {
    used[actor].add(lineKey(chosen.horizontal, chosen.idx));
    removePieces(board, chosen.selectedTargets);
    log(`${nameOf(actor)}发动阵列，吃掉2子。`);
  } else if (chosen.type === "double") {
    removePieces(board, chosen.targets);
    log(`${nameOf(actor)}发动双推，吃掉2子。`);
  } else if (chosen.type === "single") {
    removePieces(board, chosen.targets);
    log(`${nameOf(actor)}发动单推，吃掉1子。`);
  }
}

function nameOf(player) { return player === HUMAN ? "玩家(黑)" : "电脑(白)"; }

function log(msg) {
  state.log.unshift(`• ${msg}`);
  state.log = state.log.slice(0, 80);
}

function showRuleChoices(options, onSelect) {
  choiceBox.classList.remove("hidden");
  choicesEl.innerHTML = "";
  options.forEach((op, i) => {
    const b = document.createElement("button");
    b.className = "choice";
    b.textContent = `规则${i + 1}：${describeRule(op)}`;
    b.onclick = () => onSelect(op);
    choicesEl.appendChild(b);
  });
  const skip = document.createElement("button");
  skip.className = "choice";
  skip.textContent = "不发动吃子";
  skip.onclick = () => onSelect(null);
  choicesEl.appendChild(skip);
}

function hideChoices() {
  choiceBox.classList.add("hidden");
  choicesEl.innerHTML = "";
}

function describeRule(op) {
  if (op.type === "array") return `阵列（本线首次）并任意吃2子`;
  if (op.type === "double") return `双推吃2子`;
  return "单推吃1子";
}

function handleNodeClick(r, c) {
  if (state.winner || state.current !== HUMAN || state.pendingChoices) return;
  if (state.phase === "placement") handlePlacement(r, c, HUMAN);
  else if (state.phase === "preMoveRemoval") handlePreMoveRemoval(r, c, HUMAN);
  else handleMovementClick(r, c, HUMAN);
}

function handlePlacement(r, c, player) {
  if (state.board[r][c] !== EMPTY) return;
  saveHistory();
  state.board[r][c] = player;
  state.hadPiece[player] = true;
  state.lastPlacementPlayer = player;
  log(`${nameOf(player)}落子 (${r + 1},${c + 1})。`);
  postActionRules(player, [r, c], () => {
    evaluateWin();
    if (state.winner) return endTurn();

    if (boardFull()) {
      state.phase = "preMoveRemoval";
      state.preMoveRemovalsLeft = 2;
      state.preMoveRemover = player;
      state.current = player;
      log("棋盘下满，进入拔子阶段。最后落子方先拔。");
      render();
      if (state.current === AI) setTimeout(aiTurn, 350);
      return;
    }
    state.current = other(player);
    render();
    if (state.current === AI) setTimeout(aiTurn, 350);
  });
}

function postActionRules(player, pos, after) {
  const options = detectRulesAt(state.board, state.usedArrays, player, pos);
  if (!options.length) return after();

  if (player === HUMAN) {
    state.pendingChoices = options;
    showRuleChoices(options, (pick) => {
      hideChoices();
      state.pendingChoices = null;
      if (pick?.type === "array") {
        const enemies = pick.candidates;
        chooseTwoEnemiesUI(enemies, (selectedTargets) => {
          pick.selectedTargets = selectedTargets;
          applyRuleChoice(pick, player);
          evaluateWin();
          after();
          render();
        });
        return;
      }
      applyRuleChoice(pick, player);
      evaluateWin();
      after();
      render();
    });
    render();
  } else {
    const pick = chooseBestRuleOption(options, player);
    if (pick?.type === "array") {
      pick.selectedTargets = pick.candidates
        .sort((a, b) => pieceValuePos(other(player), b) - pieceValuePos(other(player), a))
        .slice(0, 2);
    }
    applyRuleChoice(pick, player);
    evaluateWin();
    after();
  }
}

function chooseTwoEnemiesUI(candidates, done) {
  const selected = [];
  choiceBox.classList.remove("hidden");
  choicesEl.innerHTML = "<div>阵列：点击下方按钮选择两枚要吃掉的敌子</div>";
  candidates.forEach((pos, idx) => {
    const b = document.createElement("button");
    b.className = "choice";
    b.textContent = `敌子 ${idx + 1}: (${pos[0] + 1},${pos[1] + 1})`;
    b.onclick = () => {
      if (selected.find(([r, c]) => r === pos[0] && c === pos[1])) return;
      selected.push(pos);
      b.disabled = true;
      b.style.opacity = 0.55;
      if (selected.length === 2) {
        hideChoices();
        done(selected);
      }
    };
    choicesEl.appendChild(b);
  });
}

function chooseBestRuleOption(options, player) {
  if (!options?.length) return null;
  let best = null;
  let bestScore = -1e9;
  for (const op of options) {
    let score = 0;
    if (op.type === "double") score += 8;
    if (op.type === "single") score += 4;
    if (op.type === "array") score += 7;
    const targets = op.targets || op.candidates || [];
    score += targets.reduce((s, p) => s + pieceValuePos(other(player), p), 0);
    if (score > bestScore) {
      bestScore = score;
      best = JSON.parse(JSON.stringify(op));
    }
  }
  return best;
}

function pieceValuePos(player, pos) {
  const [r, c] = pos;
  const center = Math.abs(r - 1.5) + Math.abs(c - 1.5);
  return 5 - center + (player === HUMAN ? 0.2 : 0.1);
}

function handlePreMoveRemoval(r, c, player) {
  const enemy = other(player);
  if (state.board[r][c] !== enemy) return;
  saveHistory();
  state.board[r][c] = EMPTY;
  state.preMoveRemovalsLeft -= 1;
  log(`${nameOf(player)}在拔子阶段移除敌子 (${r + 1},${c + 1})。`);
  evaluateWin();
  if (state.winner) return endTurn();

  if (state.preMoveRemovalsLeft > 0) {
    state.current = other(player);
  } else {
    state.phase = "movement";
    state.current = state.preMoveRemover;
    log("进入移动阶段。可上下左右一步移动到空位。");
  }
  render();
  if (state.current === AI && !state.winner) setTimeout(aiTurn, 320);
}

function handleMovementClick(r, c, player) {
  if (!state.selectedPiece) {
    if (state.board[r][c] !== player) return;
    state.selectedPiece = [r, c];
    render();
    return;
  }
  const [sr, sc] = state.selectedPiece;
  if (sr === r && sc === c) {
    state.selectedPiece = null;
    render();
    return;
  }
  if (!isAdjacent(sr, sc, r, c) || state.board[r][c] !== EMPTY) return;
  doMove(player, [sr, sc], [r, c]);
}

function isAdjacent(r1, c1, r2, c2) {
  return Math.abs(r1 - r2) + Math.abs(c1 - c2) === 1;
}

function doMove(player, from, to) {
  saveHistory();
  state.selectedPiece = null;
  state.board[from[0]][from[1]] = EMPTY;
  state.board[to[0]][to[1]] = player;
  log(`${nameOf(player)}移动 ${fmt(from)} -> ${fmt(to)}。`);
  postActionRules(player, to, () => {
    evaluateWin();
    if (state.winner) return endTurn();
    state.current = other(player);
    render();
    if (state.current === AI) setTimeout(aiTurn, 350);
  });
}

function fmt([r, c]) { return `(${r + 1},${c + 1})`; }

function aiTurn() {
  if (state.winner || state.current !== AI || state.pendingChoices) return;
  if (state.phase === "placement") return aiPlacement();
  if (state.phase === "preMoveRemoval") return aiRemove();
  return aiMovement();
}

function aiPlacement() {
  const moves = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (state.board[r][c] === EMPTY) moves.push([r, c]);
    }
  }
  const best = searchBestAction(state, 2, moves.map((p) => ({ kind: "place", pos: p })));
  handlePlacement(best.pos[0], best.pos[1], AI);
}

function aiRemove() {
  const enemyPos = [];
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (state.board[r][c] === HUMAN) enemyPos.push([r, c]);
  const best = enemyPos.sort((a, b) => pieceValuePos(HUMAN, b) - pieceValuePos(HUMAN, a))[0];
  handlePreMoveRemoval(best[0], best[1], AI);
}

function aiMovement() {
  const mineMovable = movablePieces(AI);
  if (!mineMovable.length) {
    // 堵住时：先移除任意敌子，再移动一子
    const enemyPos = [];
    for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (state.board[r][c] === HUMAN) enemyPos.push([r, c]);
    if (!enemyPos.length) return;
    const victim = enemyPos.sort((a, b) => pieceValuePos(HUMAN, b) - pieceValuePos(HUMAN, a))[0];
    saveHistory();
    state.board[victim[0]][victim[1]] = EMPTY;
    log(`电脑被堵住，移除敌子 ${fmt(victim)} 后继续走。`);
  }

  const actions = generateMoveActions(state.board, AI);
  if (!actions.length) {
    state.current = HUMAN;
    render();
    return;
  }
  const best = searchBestAction(state, 2, actions);
  doMove(AI, best.from, best.to);
}

function generateMoveActions(board, player) {
  const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
  const out = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (board[r][c] !== player) continue;
      for (const [dr, dc] of dirs) {
        const nr = r + dr, nc = c + dc;
        if (inRange(nr, nc) && board[nr][nc] === EMPTY) out.push({ kind: "move", from: [r, c], to: [nr, nc] });
      }
    }
  }
  return out;
}

function searchBestAction(rootState, depth, actions) {
  let best = actions[0];
  let bestScore = -1e9;
  for (const action of actions) {
    const sim = simulateAction(rootState, AI, action);
    const score = minimax(sim, depth - 1, false, -1e9, 1e9);
    if (score > bestScore) {
      bestScore = score;
      best = action;
    }
  }
  return best;
}

function minimax(sim, depth, maximizing, alpha, beta) {
  if (depth === 0 || sim.winner) return evaluateSim(sim);
  const player = maximizing ? AI : HUMAN;
  const actions = sim.phase === "placement"
    ? generatePlacementActions(sim.board)
    : generateMoveActions(sim.board, player);
  if (!actions.length) return evaluateSim(sim);

  if (maximizing) {
    let v = -1e9;
    for (const a of actions) {
      const s2 = simulateAction(sim, player, a);
      v = Math.max(v, minimax(s2, depth - 1, false, alpha, beta));
      alpha = Math.max(alpha, v);
      if (beta <= alpha) break;
    }
    return v;
  }
  let v = 1e9;
  for (const a of actions) {
    const s2 = simulateAction(sim, player, a);
    v = Math.min(v, minimax(s2, depth - 1, true, alpha, beta));
    beta = Math.min(beta, v);
    if (beta <= alpha) break;
  }
  return v;
}

function generatePlacementActions(board) {
  const out = [];
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (board[r][c] === EMPTY) out.push({ kind: "place", pos: [r, c] });
  return out;
}

function simulateAction(src, player, action) {
  const sim = {
    board: src.board.map((r) => [...r]),
    usedArrays: {
      [HUMAN]: new Set([...src.usedArrays[HUMAN]]),
      [AI]: new Set([...src.usedArrays[AI]]),
    },
    phase: src.phase,
    winner: null,
  };

  let pos;
  if (action.kind === "place") {
    sim.board[action.pos[0]][action.pos[1]] = player;
    pos = action.pos;
  } else {
    sim.board[action.from[0]][action.from[1]] = EMPTY;
    sim.board[action.to[0]][action.to[1]] = player;
    pos = action.to;
  }

  const opts = detectRulesAt(sim.board, sim.usedArrays, player, pos);
  const best = chooseBestRuleOption(opts, player);
  if (best?.type === "array") best.selectedTargets = best.candidates.slice(0, 2);
  if (best) {
    if (best.type === "array") sim.usedArrays[player].add(lineKey(best.horizontal, best.idx));
    removePieces(sim.board, best.selectedTargets || best.targets);
  }
  if (countPieces(other(player), sim.board) === 0) sim.winner = player;
  return sim;
}

function evaluateSim(sim) {
  if (sim.winner === AI) return 999;
  if (sim.winner === HUMAN) return -999;
  const my = countPieces(AI, sim.board);
  const op = countPieces(HUMAN, sim.board);
  const mobility = generateMoveActions(sim.board, AI).length - generateMoveActions(sim.board, HUMAN).length;
  return (my - op) * 18 + mobility * 1.2;
}

function endTurn() {
  render();
}

function render() {
  hideChoicesIfInactive();
  renderNodes();
  renderStatus();
  logEl.innerHTML = state.log.join("<br>");
}

function hideChoicesIfInactive() {
  if (!state.pendingChoices && !choicesEl.dataset.locked) hideChoices();
}

function renderStatus() {
  if (state.winner) {
    statusEl.textContent = state.winner === HUMAN ? "你赢了！" : "电脑获胜！";
    return;
  }
  const phaseText = {
    placement: "落子阶段",
    preMoveRemoval: "拔子阶段",
    movement: "移动阶段",
  }[state.phase];
  statusEl.textContent = `${phaseText} | 当前：${state.current === HUMAN ? "玩家(黑)" : "电脑(白)"}`;
}

function renderNodes() {
  for (const btn of boardEl.querySelectorAll(".node")) {
    const r = Number(btn.dataset.r), c = Number(btn.dataset.c);
    btn.innerHTML = "";
    if (state.selectedPiece && state.selectedPiece[0] === r && state.selectedPiece[1] === c) {
      btn.style.outline = "3px solid #d97706";
    } else {
      btn.style.outline = "none";
    }
    const v = state.board[r][c];
    if (v !== EMPTY) {
      const piece = document.createElement("div");
      piece.className = `piece ${v === HUMAN ? "black" : "white"}`;
      btn.appendChild(piece);
    }
  }
}

createBoard();
resetGame();
