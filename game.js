/* =====================================================================
   RASCA ROGUE — Simulador de rascas 3x3 estilo roguelike
   - Grilla 3x3, 5% de probabilidad base de JACKPOT.
   - Bucle roguelike: compra rascas, gana monedas, baja de piso,
     compra reliquias que alteran tu suerte. Sin monedas = fin de run.
   ===================================================================== */

"use strict";

/* ----------------------------- CONFIG ------------------------------ */
const BASE_JACKPOT_CHANCE = 0.05; // 5% pedido
const START_COINS = 75;
const JACKPOT_SYMBOL = "🎰";

// Constantes de premios (fuente única para el cálculo y la tabla de info)
const PAYOUT_FACTOR = 0.62;   // factor global de premios normales
const JACKPOT_MULT = 13;      // el jackpot paga coste × esto
const LINE_BASE_BONUS = 1.5;  // bonus de puntos por cada línea de 3 en raya
const GEM_ICONS = ["💎", "7️⃣"];
const FRUIT_ICONS = ["🍒", "🍋"];

// Símbolos normales: peso (rareza) y valor (puntos base si hay combo)
const SYMBOLS = [
  { icon: "🍒", weight: 30, value: 2 },
  { icon: "🍋", weight: 26, value: 3 },
  { icon: "🔔", weight: 20, value: 5 },
  { icon: "⭐", weight: 14, value: 9 },
  { icon: "💎", weight: 7,  value: 16 },
  { icon: "7️⃣", weight: 3,  value: 30 },
];

// Tiers de rasca disponibles en cada tienda de piso
const TIERS = [
  { name: "BRONCE", baseCost: 8,  mult: 1.0,  color: "#cd7f32" },
  { name: "PLATA",  baseCost: 18, mult: 1.9,  color: "#c0c8d0" },
  { name: "ORO",    baseCost: 40, mult: 3.4,  color: "#ffd23f" },
];

// 8 líneas ganadoras de una grilla 3x3
const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],   // filas
  [0, 3, 6], [1, 4, 7], [2, 5, 8],   // columnas
  [0, 4, 8], [2, 4, 6],              // diagonales
];

// Reliquias roguelike (pool). Se ofrecen de a una por piso.
const RELIC_POOL = [
  { id: "trebol",   name: "🍀 Trébol",       desc: "+4% prob. de JACKPOT",          cost: 45, apply: m => m.jackpotAdd += 0.04 },
  { id: "iman",     name: "🧲 Imán Dorado",  desc: "+30% a todos los premios",      cost: 55, apply: m => m.payoutBonus += 0.30 },
  { id: "ojo",      name: "🔮 Ojo del Destino", desc: "💎 y 7️⃣ valen el doble",     cost: 50, apply: m => m.gemMult *= 2 },
  { id: "balanza",  name: "⚖️ Balanza",      desc: "Las rascas cuestan -25%",       cost: 48, apply: m => m.costMult *= 0.75 },
  { id: "corona",   name: "👑 Corona",       desc: "El JACKPOT paga el doble",      cost: 70, apply: m => m.jackpotMult *= 2 },
  { id: "marcador", name: "🎯 Marcador",     desc: "🍒 y 🍋 cuentan doble",          cost: 40, apply: m => m.fruitMult *= 2 },
  { id: "espejo",   name: "🪞 Espejo",       desc: "Las líneas pagan +50%",         cost: 52, apply: m => m.lineBonus += 0.5 },
];

/* ----------------------------- ESTADO ------------------------------ */
let S = null;

function freshMods() {
  return {
    jackpotAdd: 0,   // suma a la prob. de jackpot
    payoutBonus: 0,  // % extra global de premios
    gemMult: 1,      // multiplicador a 💎 y 7️⃣
    fruitMult: 1,    // multiplicador a 🍒 y 🍋
    costMult: 1,     // multiplicador de coste de rascas
    jackpotMult: 1,  // multiplicador del premio del jackpot
    lineBonus: 0,    // % extra por líneas en raya
  };
}

function newRun() {
  S = {
    coins: START_COINS,
    floor: 1,
    score: 0,
    jackpots: 0,
    cardsPlayed: 0,
    mods: freshMods(),
    relics: [],
    shop: [],
    relicOffer: null,
    card: null, // rasca activa
    over: false,
  };
  rollFloor();
}

/* --------------------------- UTILIDADES ---------------------------- */
const $ = sel => document.querySelector(sel);
const rnd = () => Math.random();
const randInt = n => Math.floor(Math.random() * n);

function weightedSymbol() {
  const total = SYMBOLS.reduce((a, s) => a + s.weight, 0);
  let r = rnd() * total;
  for (const s of SYMBOLS) {
    if ((r -= s.weight) < 0) return s;
  }
  return SYMBOLS[0];
}

function floorMult() {
  return 1 + (S.floor - 1) * 0.45;
}

// Valor de un símbolo con las reliquias aplicadas
function effValue(sym, m) {
  let v = sym.value;
  if (GEM_ICONS.includes(sym.icon)) v *= m.gemMult;
  if (FRUIT_ICONS.includes(sym.icon)) v *= m.fruitMult;
  return v;
}

function jackpotChance() {
  return Math.min(0.95, BASE_JACKPOT_CHANCE + S.mods.jackpotAdd);
}

function cardCost(tier) {
  return Math.max(1, Math.round(tier.baseCost * (1 + (S.floor - 1) * 0.35) * S.mods.costMult));
}

/* ----------------------- GENERAR UNA RASCA ------------------------- */
function generateCard(tier, slotIndex) {
  const cost = cardCost(tier);
  const isJackpot = rnd() < jackpotChance();
  let grid;

  if (isJackpot) {
    // Grilla "premiada": rellena de símbolos al azar y planta una
    // línea diagonal de jackpots para que se vea espectacular.
    grid = Array.from({ length: 9 }, () => weightedSymbol().icon);
    [0, 4, 8].forEach(i => (grid[i] = JACKPOT_SYMBOL));
    // un par extra para dar caos visual
    if (rnd() < 0.5) grid[2] = JACKPOT_SYMBOL;
  } else {
    grid = Array.from({ length: 9 }, () => weightedSymbol().icon);
    // Evitamos que un jackpot aparezca por azar fuera de cartas jackpot
  }

  const { prize, winIdx } = computePrize(grid, tier, isJackpot, cost);

  return {
    tier,
    cost,
    slotIndex,
    grid,
    isJackpot,
    prize,
    winIdx: new Set(winIdx),
    revealed: new Set(),
    cashed: false,
    finished: false,
  };
}

/* --------------------- CÁLCULO DEL PREMIO -------------------------- */
function computePrize(grid, tier, isJackpot, cost) {
  const m = S.mods;
  const F = floorMult();

  if (isJackpot) {
    // El jackpot paga ~9× el coste de la carta, escalado por piso y reliquias.
    // (No usa tier.mult: el coste ya distingue los tiers, así el retorno
    //  esperado es parecido entre BRONCE/PLATA/ORO y existe ventaja de la casa.)
    const base = cost * JACKPOT_MULT * F * m.jackpotMult * (1 + m.payoutBonus);
    return { prize: Math.round(base), winIdx: grid.map((g, i) => g === JACKPOT_SYMBOL ? i : -1).filter(i => i >= 0) };
  }

  // Conteo por símbolo
  const count = {};
  grid.forEach(g => (count[g] = (count[g] || 0) + 1));

  let raw = 0;
  const winIdx = new Set();

  // Premio por cantidad: 3+ iguales en cualquier parte
  for (const sym of SYMBOLS) {
    const c = count[sym.icon] || 0;
    if (c >= 3) {
      raw += effValue(sym, m) * (c - 2);
      grid.forEach((g, i) => g === sym.icon && winIdx.add(i));
    }
  }

  // Bonus por líneas exactas en raya (3 iguales en una línea)
  for (const [a, b, c] of LINES) {
    if (grid[a] === grid[b] && grid[b] === grid[c]) {
      const sym = SYMBOLS.find(s => s.icon === grid[a]);
      if (sym) {
        raw += effValue(sym, m) * (LINE_BASE_BONUS + m.lineBonus);
        winIdx.add(a); winIdx.add(b); winIdx.add(c);
      }
    }
  }

  let prize = raw * tier.mult * F * PAYOUT_FACTOR * (1 + m.payoutBonus);
  prize = Math.round(prize);

  return { prize, winIdx: [...winIdx] };
}

/* --------------------- GESTIÓN DE PISOS ---------------------------- */
function rollFloor() {
  // 3 rascas (una por tier)
  S.shop = TIERS.map((t, i) => ({ tier: t, slot: i, sold: false }));
  // 1 reliquia que no poseas
  const owned = new Set(S.relics.map(r => r.id));
  const pool = RELIC_POOL.filter(r => !owned.has(r.id));
  S.relicOffer = pool.length ? pool[randInt(pool.length)] : null;
}

function descend() {
  if (S.card && !S.card.cashed) return;
  S.floor++;
  rollFloor();
  log(`▼ Desciendes al PISO ${S.floor}. El riesgo y las recompensas crecen.`, "relic");
  clearCardStage();
  render();
}

/* --------------------- COMPRA / RASCADO ---------------------------- */
function buyCard(slot) {
  if (S.card && !S.card.cashed) return; // hay una rasca sin cobrar
  const entry = S.shop[slot];
  if (!entry || entry.sold) return;
  const cost = cardCost(entry.tier);
  if (S.coins < cost) return;

  S.coins -= cost;
  S.card = generateCard(entry.tier, slot);
  entry.sold = true;
  S.cardsPlayed++;
  log(`Compras una rasca ${entry.tier.name} por ${cost}＄.`);
  renderCard();
  render();
}

function scratchCell(i) {
  const card = S.card;
  if (!card || card.cashed) return;
  if (card.revealed.has(i)) return;
  card.revealed.add(i);
  renderCard();
  if (card.revealed.size === 9) finishCard();
}

function scratchAll() {
  const card = S.card;
  if (!card || card.cashed) return;
  for (let i = 0; i < 9; i++) card.revealed.add(i);
  renderCard();
  finishCard();
}

function finishCard() {
  const card = S.card;
  if (card.finished) return;
  card.finished = true;

  if (card.isJackpot) {
    S.jackpots++;
    log(`🎰 ¡¡¡JACKPOT!!! +${card.prize}＄`, "gold");
  } else if (card.prize > 0) {
    log(`✦ Premio: +${card.prize}＄`, "good");
  } else {
    log(`✗ Sin premio. Suerte la próxima.`, "");
  }
  renderCard();
  render();
}

function cashOut() {
  const card = S.card;
  if (!card || !card.finished || card.cashed) return;
  card.cashed = true;
  S.coins += card.prize;
  S.score += card.prize;
  clearCardStage();
  S.card = null;
  render();
  checkGameOver();
}

function buyRelic() {
  const offer = S.relicOffer;
  if (!offer || S.coins < offer.cost) return;
  S.coins -= offer.cost;
  offer.apply(S.mods);
  S.relics.push(offer);
  S.relicOffer = null;
  log(`Adquieres la reliquia ${offer.name}: ${offer.desc}.`, "relic");
  render();
  checkGameOver();
}

/* --------------------- FIN DE LA RUN ------------------------------- */
function cheapestAffordableExists() {
  return S.shop.some(e => !e.sold && S.coins >= cardCost(e.tier));
}

function checkGameOver() {
  if (S.over) return;
  if (S.card && !S.card.cashed) return;
  // Puede comprar alguna rasca de este piso o de uno futuro (al descender
  // los costes suben, así que basta comprobar el piso actual)
  if (cheapestAffordableExists()) return;
  // Si todas las rascas del piso están vendidas pero puede descender y
  // permitírselas (los costes crecen, no bajan, salvo Balanza ya aplicada),
  // comprobamos contra el coste del piso siguiente.
  const allSold = S.shop.every(e => e.sold);
  if (allSold) {
    const nextCheapest = Math.min(...TIERS.map(t =>
      Math.round(t.baseCost * (1 + S.floor * 0.35) * S.mods.costMult)));
    if (S.coins >= nextCheapest) return; // aún puede descender y jugar
  }
  gameOver();
}

function gameOver() {
  if (S.over) return;
  S.over = true;
  const best = loadBest();
  if (S.score > best.score) {
    saveBest({ score: S.score, floor: S.floor });
  }
  $("#over-stats").innerHTML = `
    <div>PISO ALCANZADO: <b>${S.floor}</b></div>
    <div>PUNTOS TOTALES: <b>${S.score}</b></div>
    <div>RASCAS JUGADAS: <b>${S.cardsPlayed}</b></div>
    <div>JACKPOTS: <b>${S.jackpots}</b></div>
    <div>RELIQUIAS: <b>${S.relics.length}</b></div>`;
  showScreen("screen-over");
}

/* --------------------- PERSISTENCIA RÉCORD ------------------------- */
function loadBest() {
  try { return JSON.parse(localStorage.getItem("rascaRogueBest")) || { score: 0, floor: 0 }; }
  catch { return { score: 0, floor: 0 }; }
}
function saveBest(b) {
  try { localStorage.setItem("rascaRogueBest", JSON.stringify(b)); } catch {}
}

/* --------------------------- RENDER -------------------------------- */
function render() {
  $("#hud-coins").textContent = S.coins;
  $("#hud-floor").textContent = S.floor;
  $("#hud-jackpot").textContent = Math.round(jackpotChance() * 100) + "%";
  $("#hud-score").textContent = S.score;
  $("#next-floor").textContent = S.floor + 1;
  $("#btn-descend").disabled = !!(S.card && !S.card.cashed);
  renderShop();
  renderRelics();
  checkGameOver();
}

function renderShop() {
  const box = $("#shop");
  const busy = S.card && !S.card.cashed;
  let html = "";
  S.shop.forEach((e, i) => {
    const cost = cardCost(e.tier);
    const cannot = e.sold || busy || S.coins < cost;
    html += `
      <div class="shop-card ${e.sold ? "sold" : cannot ? "locked" : ""}" data-slot="${i}">
        <div class="sc-name" style="color:${e.tier.color}">RASCA ${e.tier.name}</div>
        <div class="sc-meta">
          <span class="sc-cost">${cost}＄</span>
          <span>premio ×${e.tier.mult.toFixed(1)}</span>
        </div>
      </div>`;
  });

  // Oferta de reliquia
  if (S.relicOffer) {
    const r = S.relicOffer;
    const cannot = busy || S.coins < r.cost;
    html += `
      <div class="shop-card ${cannot ? "locked" : ""}" data-relic="1" style="border-color:var(--relic)">
        <div class="sc-name" style="color:var(--relic)">${r.name}</div>
        <div class="sc-meta"><span class="sc-cost">${r.cost}＄</span><span>${r.desc}</span></div>
      </div>`;
  }
  box.innerHTML = html;

  box.querySelectorAll("[data-slot]").forEach(el =>
    el.addEventListener("click", () => buyCard(+el.dataset.slot)));
  const relEl = box.querySelector("[data-relic]");
  if (relEl) relEl.addEventListener("click", buyRelic);
}

function renderRelics() {
  const box = $("#relics-list");
  if (!S.relics.length) {
    box.innerHTML = '<span class="empty-hint">Sin reliquias todavía</span>';
    return;
  }
  box.innerHTML = S.relics.map(r => `
    <div class="relic-item">
      <div class="ri-name">${r.name}</div>
      <div class="ri-desc">${r.desc}</div>
    </div>`).join("");
}

function renderCard() {
  const card = S.card;
  const grid = $("#grid");
  const tierEl = $("#card-tier");
  const result = $("#card-result");

  if (!card) {
    grid.innerHTML = "";
    for (let i = 0; i < 9; i++) {
      const c = document.createElement("div");
      c.className = "cell";
      c.innerHTML = `<div class="cover">?</div>`;
      grid.appendChild(c);
    }
    tierEl.textContent = "— elige una rasca en la tienda —";
    tierEl.style.color = "var(--fg-dim)";
    result.className = "card-result";
    result.textContent = "";
    $("#btn-scratch-all").disabled = true;
    $("#btn-cash").disabled = true;
    return;
  }

  tierEl.textContent = `RASCA ${card.tier.name} · piso ${S.floor}`;
  tierEl.style.color = card.tier.color;

  grid.innerHTML = "";
  for (let i = 0; i < 9; i++) {
    const cell = document.createElement("div");
    const revealed = card.revealed.has(i);
    cell.className = "cell";
    if (revealed) {
      cell.classList.add("revealed");
      if (card.finished && card.winIdx.has(i)) {
        cell.classList.add(card.isJackpot ? "jackpot" : "win");
      }
    } else {
      cell.classList.add("scratchable");
    }
    cell.innerHTML = `<span class="sym">${card.grid[i]}</span><div class="cover">?</div>`;
    cell.addEventListener("click", () => scratchCell(i));
    grid.appendChild(cell);
  }

  $("#btn-scratch-all").disabled = card.finished;
  $("#btn-cash").disabled = !card.finished;

  if (card.finished) {
    if (card.isJackpot) {
      result.className = "card-result jackpot";
      result.textContent = `🎰 JACKPOT · +${card.prize}＄`;
    } else if (card.prize > 0) {
      result.className = "card-result win";
      result.textContent = `✦ Premio: +${card.prize}＄ — pulsa COBRAR`;
    } else {
      result.className = "card-result lose";
      result.textContent = `Sin premio — pulsa COBRAR para continuar`;
    }
  } else {
    result.className = "card-result";
    result.textContent = "Rasca las 9 casillas...";
  }
}

function clearCardStage() {
  S.card = null;
  renderCard();
}

/* ----------------------------- LOG --------------------------------- */
function log(msg, cls = "") {
  const box = $("#log");
  const line = document.createElement("div");
  line.className = "log-line " + cls;
  line.textContent = msg;
  box.prepend(line);
  while (box.children.length > 40) box.removeChild(box.lastChild);
}

/* ----------------------- TABLA DE PREMIOS (INFO) ------------------- */
function buildInfo() {
  // Contexto actual de la run (o valores por defecto en la portada)
  const floor = S ? S.floor : 1;
  const mods = S ? S.mods : freshMods();
  const fMult = 1 + (floor - 1) * 0.45;
  const jpChance = Math.min(0.95, BASE_JACKPOT_CHANCE + mods.jackpotAdd);

  const costOf = t => Math.max(1, Math.round(t.baseCost * (1 + (floor - 1) * 0.35) * mods.costMult));
  // Premio por 3 figuras iguales (en cualquier posición) en un tier dado
  const figCoins = (sym, t) =>
    Math.round(effValue(sym, mods) * (3 - 2) * t.mult * fMult * PAYOUT_FACTOR * (1 + mods.payoutBonus));
  // Puntos extra que aporta una línea de 3 en raya de esa figura, ya en monedas (tier BRONCE de referencia)
  const lineCoins = (sym, t) =>
    Math.round(effValue(sym, mods) * (LINE_BASE_BONUS + mods.lineBonus) * t.mult * fMult * PAYOUT_FACTOR * (1 + mods.payoutBonus));
  const jackpotCoins = t =>
    Math.round(costOf(t) * JACKPOT_MULT * fMult * mods.jackpotMult * (1 + mods.payoutBonus));

  // -------- contexto --------
  let html = `<div class="info-ctx">
    Piso <b>${floor}</b> · multiplicador de piso <b>×${fMult.toFixed(2)}</b> ·
    JACKPOT <b>${Math.round(jpChance * 100)}%</b>
    ${S && S.relics.length ? ` · reliquias activas: <b>${S.relics.length}</b>` : ""}
    <br>Las monedas mostradas ya incluyen tier, piso y reliquias actuales.
  </div>`;

  // -------- premios por figura --------
  html += `<div class="info-section-title">PREMIO POR FIGURA · 3 iguales</div>`;
  html += `<table class="prize-table">
    <tr><th>Figura</th><th>Valor</th><th class="t-bronce">BRONCE</th><th class="t-plata">PLATA</th><th class="t-oro">ORO</th></tr>`;
  for (const sym of [...SYMBOLS].reverse()) {
    const ev = effValue(sym, mods);
    const buff = ev !== sym.value ? ` <span style="color:var(--relic)">(×${(ev / sym.value).toFixed(0)})</span>` : "";
    html += `<tr>
      <td class="fig">${sym.icon}</td>
      <td class="val">${ev}${buff}</td>
      <td class="t-bronce">${figCoins(sym, TIERS[0])}＄</td>
      <td class="t-plata">${figCoins(sym, TIERS[1])}＄</td>
      <td class="t-oro">${figCoins(sym, TIERS[2])}＄</td>
    </tr>`;
  }
  html += `</table>`;
  html += `<div class="info-note">Con <b>4 iguales</b> el premio se duplica y con <b>5</b> se triplica
    (cada copia extra suma otra vez el valor de la figura).</div>`;

  // -------- premios por forma --------
  html += `<div class="info-section-title">PREMIO POR FORMA · 3 en raya</div>`;
  html += `<div class="info-note">Además del premio por figura, cada <b>línea</b> de 3 iguales
    (fila, columna o diagonal) paga un <b class="gold">extra ×${(LINE_BASE_BONUS + mods.lineBonus).toFixed(1)}</b>
    del valor de esa figura. Hay <b>8 formas</b> ganadoras:</div>`;
  html += `<div class="shapes-grid">`;
  const labelFor = i => (i < 3 ? "FILA" : i < 6 ? "COLUMNA" : "DIAGONAL");
  LINES.forEach((line, i) => {
    const on = new Set(line);
    let cells = "";
    for (let c = 0; c < 9; c++) cells += `<div class="mc ${on.has(c) ? "on" : ""}"></div>`;
    html += `<div class="shape-item"><div class="mini">${cells}</div><div class="sh-label">${labelFor(i)}</div></div>`;
  });
  html += `</div>`;
  html += `<div class="info-note">Ejemplo: 3 <b>⭐</b> en una diagonal de una rasca BRONCE pagan
    <b class="gold">${figCoins(SYMBOLS[3], TIERS[0]) + lineCoins(SYMBOLS[3], TIERS[0])}＄</b>
    (${figCoins(SYMBOLS[3], TIERS[0])} por figura + ${lineCoins(SYMBOLS[3], TIERS[0])} por la línea).</div>`;

  // -------- jackpot --------
  html += `<div class="info-section-title">JACKPOT 🎰</div>`;
  html += `<div class="jackpot-box">
    <div class="jp-head">🎰 ${Math.round(jpChance * 100)}% por rasca</div>
    <div class="jp-body">Paga <b>${JACKPOT_MULT}×</b> el coste de la carta (× piso × reliquias). En el piso ${floor}:
      <br>BRONCE <b class="gold">${jackpotCoins(TIERS[0])}＄</b> ·
      PLATA <b class="gold">${jackpotCoins(TIERS[1])}＄</b> ·
      ORO <b class="gold">${jackpotCoins(TIERS[2])}＄</b>
    </div>
  </div>`;

  document.getElementById("info-content").innerHTML = html;
}

function openInfo() { buildInfo(); $("#info-modal").hidden = false; }
function closeInfo() { $("#info-modal").hidden = true; }

/* --------------------------- PANTALLAS ----------------------------- */
function showScreen(id) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  $("#" + id).classList.add("active");
}

function startGame() {
  newRun();
  $("#log").innerHTML = "";
  log(`Comienza la run con ${S.coins}＄. ¡Suerte!`, "good");
  clearCardStage();
  render();
  showScreen("screen-game");
}

/* --------------------------- BOOT ---------------------------------- */
function refreshBestLabel() {
  const b = loadBest();
  $("#best-run-box").textContent = b.score > 0
    ? `RÉCORD: ${b.score} pts · piso ${b.floor}`
    : "RÉCORD: —";
}

window.addEventListener("DOMContentLoaded", () => {
  refreshBestLabel();
  $("#btn-start").addEventListener("click", startGame);
  $("#btn-retry").addEventListener("click", () => { refreshBestLabel(); startGame(); });
  $("#btn-scratch-all").addEventListener("click", scratchAll);
  $("#btn-cash").addEventListener("click", cashOut);
  $("#btn-descend").addEventListener("click", descend);
  $("#btn-info").addEventListener("click", openInfo);
  $("#info-close").addEventListener("click", closeInfo);
  $("#info-backdrop").addEventListener("click", closeInfo);
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeInfo(); });
});
