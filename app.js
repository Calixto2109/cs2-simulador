const RARITIES = {
  blue: { label: "Mil-Spec", chance: 79.923, color: "#4b69ff", rank: 1 },
  purple: { label: "Restrita", chance: 15.985, color: "#8847ff", rank: 2 },
  pink: { label: "Secreta", chance: 3.197, color: "#d32ce6", rank: 3 },
  red: { label: "Oculta", chance: 0.639, color: "#eb4b4b", rank: 4 },
  gold: { label: "Item especial", chance: 0.256, color: "#dba936", rank: 5 }
};

const RARITY_IDS = {
  rarity_rare_weapon: "blue",
  rarity_mythical_weapon: "purple",
  rarity_legendary_weapon: "pink",
  rarity_ancient_weapon: "red",
  rarity_ancient: "red",
  rarity_mythical: "purple",
  rarity_legendary: "pink",
  rarity_rare: "blue"
};

const OPEN_PRICE = 12.5;
const PAGE_SIZE = 40;
const STORAGE_KEY = "dropzone-state-v2";

const state = {
  balance: 1000,
  opened: 0,
  spent: 0,
  inventory: [],
  best: null,
  opening: false,
  muted: false,
  filter: "all",
  skins: [],
  skinMap: new Map(),
  cases: [],
  selectedCase: null,
  catalogPage: 1,
  modalItemId: null
};

const els = {
  roulette: document.querySelector("#roulette"),
  openButton: document.querySelector("#openButton"),
  resetButton: document.querySelector("#resetButton"),
  fastMode: document.querySelector("#fastMode"),
  caseImage: document.querySelector("#caseImage"),
  caseNumber: document.querySelector("#caseNumber"),
  balance: document.querySelector("#balance"),
  totalOpened: document.querySelector("#totalOpened"),
  bestDrop: document.querySelector("#bestDrop"),
  spentValue: document.querySelector("#spentValue"),
  inventoryValue: document.querySelector("#inventoryValue"),
  inventoryGrid: document.querySelector("#inventoryGrid"),
  allCount: document.querySelector("#allCount"),
  resultModal: document.querySelector("#resultModal"),
  resultCard: document.querySelector("#resultCard"),
  resultWeapon: document.querySelector("#resultWeapon"),
  resultTitle: document.querySelector("#resultTitle"),
  resultSkin: document.querySelector("#resultSkin"),
  resultRarity: document.querySelector("#resultRarity"),
  resultPrice: document.querySelector("#resultPrice"),
  modalClose: document.querySelector("#modalClose"),
  modalAgain: document.querySelector("#modalAgain"),
  modalSell: document.querySelector("#modalSell"),
  clearInventory: document.querySelector("#clearInventory"),
  soundToggle: document.querySelector("#soundToggle"),
  caseList: document.querySelector("#caseList"),
  caseSearch: document.querySelector("#caseSearch"),
  caseCount: document.querySelector("#caseCount"),
  dataStatus: document.querySelector("#dataStatus"),
  selectedCaseName: document.querySelector("#selectedCaseName"),
  caseContents: document.querySelector("#caseContents"),
  catalogGrid: document.querySelector("#catalogGrid"),
  catalogTotal: document.querySelector("#catalogTotal"),
  skinSearch: document.querySelector("#skinSearch"),
  raritySelect: document.querySelector("#raritySelect"),
  loadMore: document.querySelector("#loadMore")
};

const money = (value) => Number(value || 0).toLocaleString("pt-BR", {
  style: "currency",
  currency: "BRL"
});
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
})[character]);

function secureRandom() {
  if (window.crypto?.getRandomValues) {
    const values = new Uint32Array(1);
    window.crypto.getRandomValues(values);
    return values[0] / 4294967296;
  }
  return Math.random();
}

function randomFrom(items) {
  return items[Math.floor(secureRandom() * items.length)];
}

function rarityKey(skin, rareDrop = false) {
  return rareDrop ? "gold" : RARITY_IDS[skin?.rarity?.id] || "blue";
}

function parseSteamPrice(value) {
  if (!value) return null;
  const normalized = value.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function pickWear(skin) {
  if (!skin.wears?.length) return "";
  const min = Number.isFinite(skin.minFloat) ? skin.minFloat : 0;
  const max = Number.isFinite(skin.maxFloat) ? skin.maxFloat : 1;
  const value = min + secureRandom() * (max - min);
  const target = value <= 0.07 ? "Factory New"
    : value <= 0.15 ? "Minimal Wear"
      : value <= 0.38 ? "Field-Tested"
        : value <= 0.45 ? "Well-Worn"
          : "Battle-Scarred";
  return skin.wears.find((wear) => wear.name === target)?.name || randomFrom(skin.wears).name;
}

function marketHashName(item) {
  let name = item.name;
  if (item.statTrak) {
    name = name.startsWith("★")
      ? `★ StatTrak™${name.slice(1)}`
      : `StatTrak™ ${name}`;
  }
  return item.wear ? `${name} (${item.wear})` : name;
}

function createDrop(skin, isRare = false) {
  const item = {
    ...skin,
    id: `${Date.now()}-${Math.floor(secureRandom() * 1e9)}`,
    skinId: skin.id,
    rarityKey: rarityKey(skin, isRare),
    wear: pickWear(skin),
    statTrak: Boolean(skin.stattrak && secureRandom() < 0.1),
    price: null,
    priceLabel: null,
    priceStatus: "pending",
    obtainedAt: new Date().toISOString()
  };
  item.marketName = marketHashName(item);
  return item;
}

function pickDrop() {
  const selected = state.selectedCase;
  if (!selected) return null;
  const roll = secureRandom() * 100;
  let cursor = 0;
  let selectedRarity = "gold";
  for (const [key, rarity] of Object.entries(RARITIES)) {
    cursor += rarity.chance;
    if (roll < cursor) {
      selectedRarity = key;
      break;
    }
  }

  if (selectedRarity === "gold" && selected.rare.length) {
    return createDrop(state.skinMap.get(randomFrom(selected.rare)), true);
  }

  const pool = selected.contains
    .map((id) => state.skinMap.get(id))
    .filter((skin) => skin && rarityKey(skin) === selectedRarity);
  const fallback = selected.contains.map((id) => state.skinMap.get(id)).filter(Boolean);
  return createDrop(randomFrom(pool.length ? pool : fallback), false);
}

function itemImage(item) {
  return `<img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}" loading="lazy">`;
}

function rouletteItem(item) {
  const key = item.rarityKey || rarityKey(item);
  return `
    <article class="roulette-item" style="--item-color:${RARITIES[key].color}">
      <span class="item-rarity">${RARITIES[key].label}</span>
      <div class="weapon-art">${itemImage(item)}</div>
      <strong class="item-name">${escapeHtml(item.weapon)}<span class="item-skin">${escapeHtml(item.skin)}</span></strong>
    </article>`;
}

function buildIdleRoulette() {
  if (!state.selectedCase) return;
  const available = state.selectedCase.contains
    .map((id) => state.skinMap.get(id))
    .filter(Boolean);
  const items = Array.from({ length: 12 }, () => randomFrom(available));
  els.roulette.style.transition = "none";
  els.roulette.style.transform = "translateX(-105px)";
  els.roulette.innerHTML = items.map(rouletteItem).join("");
}

function renderCases() {
  const query = els.caseSearch.value.trim().toLocaleLowerCase("pt-BR");
  const cases = state.cases.filter((crate) => crate.name.toLocaleLowerCase("pt-BR").includes(query));
  els.caseCount.textContent = `${cases.length} CAIXAS`;
  if (!cases.length) {
    els.caseList.innerHTML = '<div class="case-empty">Nenhuma caixa encontrada.</div>';
    return;
  }
  els.caseList.innerHTML = cases.map((crate) => `
    <button class="case-option ${crate.id === state.selectedCase?.id ? "active" : ""}" data-case-id="${crate.id}" type="button">
      <img src="${escapeHtml(crate.image)}" alt="${escapeHtml(crate.name)}" loading="lazy">
      <strong>${escapeHtml(crate.name)}</strong>
      <span>${crate.contains.length} skins + ${crate.rare.length} especiais</span>
    </button>`).join("");
}

function selectCase(caseId) {
  if (state.opening) return;
  const selected = state.cases.find((crate) => crate.id === caseId);
  if (!selected) return;
  state.selectedCase = selected;
  const index = state.cases.indexOf(selected) + 1;
  els.caseImage.src = selected.image;
  els.caseImage.alt = selected.name;
  els.caseNumber.textContent = String(index).padStart(2, "0");
  els.selectedCaseName.textContent = selected.name.toUpperCase();
  els.caseContents.textContent = `${selected.contains.length} SKINS + ${selected.rare.length} ITENS ESPECIAIS`;
  renderCases();
  buildIdleRoulette();
  saveState();
}

function filteredCatalog() {
  const query = els.skinSearch.value.trim().toLocaleLowerCase("pt-BR");
  const rarity = els.raritySelect.value;
  return state.skins.filter((skin) => {
    const matchesQuery = !query || `${skin.weapon} ${skin.skin}`.toLocaleLowerCase("pt-BR").includes(query);
    const matchesRarity = rarity === "all" || rarityKey(skin) === rarity;
    return matchesQuery && matchesRarity;
  });
}

function renderCatalog(resetPage = false) {
  if (resetPage) state.catalogPage = 1;
  const filtered = filteredCatalog();
  const visible = filtered.slice(0, state.catalogPage * PAGE_SIZE);
  els.catalogTotal.textContent = state.skins.length.toLocaleString("pt-BR");
  els.loadMore.hidden = visible.length >= filtered.length;
  if (!visible.length) {
    els.catalogGrid.innerHTML = '<div class="empty-inventory"><strong>NENHUMA SKIN ENCONTRADA</strong><p>Ajuste os filtros da busca.</p></div>';
    return;
  }
  els.catalogGrid.innerHTML = visible.map((skin) => {
    const key = rarityKey(skin);
    const caseNames = skin.crates
      .map((id) => state.cases.find((crate) => crate.id === id)?.name)
      .filter(Boolean);
    return `
      <article class="catalog-card" style="--item-color:${RARITIES[key].color}">
        <span class="item-rarity">${escapeHtml(skin.rarity?.name || RARITIES[key].label)}</span>
        <div class="weapon-art">${itemImage(skin)}</div>
        <strong class="item-name">${escapeHtml(skin.weapon)}<span class="item-skin">${escapeHtml(skin.skin)}</span></strong>
        <span class="case-membership" title="${escapeHtml(caseNames.join(", "))}">${caseNames.length ? escapeHtml(caseNames.join(", ")) : "Coleção / item especial"}</span>
      </article>`;
  }).join("");
}

function beep(frequency = 420, duration = 0.04, volume = 0.025) {
  if (state.muted) return;
  try {
    const context = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = frequency;
    oscillator.type = "square";
    gain.gain.value = volume;
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration);
    oscillator.stop(context.currentTime + duration);
  } catch {}
}

async function openCase() {
  if (state.opening || !state.selectedCase || state.balance < OPEN_PRICE) return;
  state.opening = true;
  state.balance -= OPEN_PRICE;
  state.spent += OPEN_PRICE;
  state.opened += 1;
  updateStats();

  const winner = pickDrop();
  const sequence = Array.from({ length: 45 }, () => pickDrop());
  sequence[38] = winner;
  els.roulette.innerHTML = sequence.map(rouletteItem).join("");
  els.roulette.style.transition = "none";
  els.roulette.style.transform = "translateX(0)";
  els.caseImage.classList.add("opening");

  await wait(40);
  const itemWidth = window.innerWidth <= 700 ? 172 : 194;
  const winnerCenter = 38 * itemWidth + (itemWidth - 6) / 2;
  const viewportCenter = els.roulette.parentElement.clientWidth / 2;
  const jitter = Math.floor(secureRandom() * 72) - 36;
  const target = -(winnerCenter - viewportCenter + jitter);
  const duration = els.fastMode.checked ? 900 : 5200;
  els.roulette.style.transition = `transform ${duration}ms cubic-bezier(.08,.62,.08,1)`;
  els.roulette.style.transform = `translateX(${target}px)`;

  const ticks = els.fastMode.checked ? 9 : 28;
  for (let index = 0; index < ticks; index += 1) {
    await wait(duration / ticks);
    beep(250 + index * 12, 0.025, 0.012);
  }

  state.inventory.unshift(winner);
  if (!state.best || RARITIES[winner.rarityKey].rank > RARITIES[state.best.rarityKey].rank) state.best = winner;
  state.opening = false;
  els.caseImage.classList.remove("opening");
  updateStats();
  renderInventory();
  saveState();
  beep(winner.rarityKey === "gold" ? 900 : 620, 0.25, 0.045);
  showResult(winner);
  await fetchPrice(winner.id);
}

async function fetchPrice(itemId) {
  const item = state.inventory.find((inventoryItem) => inventoryItem.id === itemId);
  if (!item || item.priceStatus === "ready") return;
  item.priceStatus = "loading";
  renderInventory();
  updateResultPrice(item);
  try {
    const response = await fetch(`/api/price?name=${encodeURIComponent(item.marketName)}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    item.priceLabel = data.lowestPrice || data.medianPrice;
    item.price = parseSteamPrice(item.priceLabel);
    item.priceStatus = item.price ? "ready" : "unavailable";
    item.priceFetchedAt = data.fetchedAt;
  } catch {
    item.priceStatus = "unavailable";
  }
  renderInventory();
  updateStats();
  updateResultPrice(item);
  saveState();
}

function updateResultPrice(item) {
  if (state.modalItemId !== item.id || els.resultModal.hidden) return;
  if (item.priceStatus === "ready") {
    els.resultPrice.textContent = `${item.priceLabel} · STEAM`;
    els.modalSell.disabled = false;
    els.modalSell.textContent = `VENDER POR ${item.priceLabel}`;
  } else if (item.priceStatus === "unavailable") {
    els.resultPrice.textContent = "PREÇO INDISPONÍVEL";
    els.modalSell.disabled = true;
    els.modalSell.textContent = "VENDER";
  } else {
    els.resultPrice.textContent = "CONSULTANDO PREÇO...";
    els.modalSell.disabled = true;
    els.modalSell.textContent = "VENDER";
  }
}

function showResult(item) {
  const rarity = RARITIES[item.rarityKey];
  state.modalItemId = item.id;
  els.resultCard.style.setProperty("--result-color", rarity.color);
  els.resultWeapon.innerHTML = itemImage(item);
  els.resultTitle.textContent = item.weapon;
  els.resultSkin.textContent = `${item.skin}${item.wear ? ` · ${item.wear}` : ""}${item.statTrak ? " · StatTrak™" : ""}`;
  els.resultRarity.textContent = rarity.label.toUpperCase();
  els.resultModal.hidden = false;
  document.body.style.overflow = "hidden";
  updateResultPrice(item);
}

function closeModal() {
  els.resultModal.hidden = true;
  document.body.style.overflow = "";
  state.modalItemId = null;
}

function sellItem(itemId) {
  const index = state.inventory.findIndex((item) => item.id === itemId);
  if (index < 0 || state.inventory[index].priceStatus !== "ready") return;
  const [item] = state.inventory.splice(index, 1);
  state.balance += item.price;
  if (state.best?.id === item.id) {
    state.best = [...state.inventory].sort((a, b) => RARITIES[b.rarityKey].rank - RARITIES[a.rarityKey].rank)[0] || null;
  }
  closeModal();
  updateStats();
  renderInventory();
  saveState();
  beep(760, 0.12, 0.035);
}

function updateStats() {
  const totalValue = state.inventory.reduce((sum, item) => sum + (item.price || 0), 0);
  els.balance.textContent = money(state.balance);
  els.totalOpened.textContent = state.opened;
  els.bestDrop.textContent = state.best ? state.best.weapon : "—";
  els.spentValue.textContent = money(state.spent);
  els.inventoryValue.textContent = money(totalValue);
  els.allCount.textContent = state.inventory.length;
  els.openButton.disabled = state.opening || !state.selectedCase || state.balance < OPEN_PRICE;
}

function renderInventory() {
  const items = state.inventory.filter((item) => state.filter === "all" || item.rarityKey === state.filter);
  if (!items.length) {
    const message = state.inventory.length ? "Nenhum item desta raridade." : "Abra uma caixa para receber seu primeiro item virtual.";
    els.inventoryGrid.innerHTML = `
      <div class="empty-inventory">
        <div class="empty-icon">D</div>
        <strong>${state.inventory.length ? "NENHUM ITEM ENCONTRADO" : "SEU INVENTÁRIO ESTÁ VAZIO"}</strong>
        <p>${message}</p>
      </div>`;
    return;
  }

  els.inventoryGrid.innerHTML = items.map((item) => {
    const price = item.priceStatus === "ready" ? item.priceLabel
      : item.priceStatus === "unavailable" ? "INDISPONÍVEL"
        : "CONSULTANDO...";
    return `
      <article class="inventory-item" style="--item-color:${RARITIES[item.rarityKey].color}">
        <span class="item-rarity">${RARITIES[item.rarityKey].label}</span>
        <span class="item-price ${item.priceStatus !== "ready" ? "pending" : ""}">${escapeHtml(price)}</span>
        <div class="weapon-art">${itemImage(item)}</div>
        <strong class="item-name">${escapeHtml(item.weapon)}<span class="item-skin">${escapeHtml(item.skin)}</span></strong>
        ${item.statTrak ? '<span class="stattrak">StatTrak™</span>' : ""}
        <div class="inventory-actions">
          <span class="wear-label">${escapeHtml(item.wear || "Sem desgaste")}</span>
          <button class="sell-button" data-sell-id="${item.id}" type="button" ${item.priceStatus !== "ready" ? "disabled" : ""}>VENDER</button>
        </div>
      </article>`;
  }).join("");
}

function saveState() {
  const saved = {
    balance: state.balance,
    opened: state.opened,
    spent: state.spent,
    inventory: state.inventory,
    best: state.best,
    selectedCaseId: state.selectedCase?.id
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
}

function restoreState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved) return null;
    state.balance = Number(saved.balance) || 1000;
    state.opened = Number(saved.opened) || 0;
    state.spent = Number(saved.spent) || 0;
    state.inventory = Array.isArray(saved.inventory) ? saved.inventory : [];
    state.best = saved.best || null;
    return saved.selectedCaseId;
  } catch {
    return null;
  }
}

function resetSimulation() {
  if (state.opening) return;
  Object.assign(state, { balance: 1000, opened: 0, spent: 0, inventory: [], best: null, filter: "all" });
  document.querySelectorAll("#filters button").forEach((button) => button.classList.toggle("active", button.dataset.filter === "all"));
  buildIdleRoulette();
  updateStats();
  renderInventory();
  saveState();
}

async function loadData() {
  try {
    const [skinsResponse, casesResponse] = await Promise.all([
      fetch("assets/catalog.json"),
      fetch("assets/cases.json")
    ]);
    if (!skinsResponse.ok || !casesResponse.ok) throw new Error("Falha no catálogo");
    state.skins = await skinsResponse.json();
    state.cases = await casesResponse.json();
    state.skinMap = new Map(state.skins.map((skin) => [skin.id, skin]));
    const restoredCaseId = restoreState();
    const initialCase = state.cases.find((crate) => crate.id === restoredCaseId) || state.cases[0];
    els.dataStatus.textContent = `${state.skins.length.toLocaleString("pt-BR")} SKINS CARREGADAS`;
    selectCase(initialCase.id);
    renderCatalog();
    renderInventory();
    updateStats();
  } catch {
    els.dataStatus.textContent = "ERRO AO CARREGAR DADOS";
    els.caseList.innerHTML = '<div class="case-empty">Execute o site com "npm start" para carregar o catálogo.</div>';
  }
}

els.openButton.addEventListener("click", openCase);
els.resetButton.addEventListener("click", resetSimulation);
els.modalClose.addEventListener("click", closeModal);
els.resultModal.querySelector(".modal-backdrop").addEventListener("click", closeModal);
els.modalAgain.addEventListener("click", () => {
  closeModal();
  openCase();
});
els.modalSell.addEventListener("click", () => sellItem(state.modalItemId));
els.clearInventory.addEventListener("click", () => {
  state.inventory = [];
  state.best = null;
  updateStats();
  renderInventory();
  saveState();
});
els.soundToggle.addEventListener("click", () => {
  state.muted = !state.muted;
  els.soundToggle.classList.toggle("muted", state.muted);
  els.soundToggle.setAttribute("aria-label", state.muted ? "Ativar sons" : "Desativar sons");
});
els.caseList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-case-id]");
  if (button) selectCase(button.dataset.caseId);
});
els.caseSearch.addEventListener("input", renderCases);
els.skinSearch.addEventListener("input", () => renderCatalog(true));
els.raritySelect.addEventListener("change", () => renderCatalog(true));
els.loadMore.addEventListener("click", () => {
  state.catalogPage += 1;
  renderCatalog();
});
els.inventoryGrid.addEventListener("click", (event) => {
  const button = event.target.closest("[data-sell-id]");
  if (button) sellItem(button.dataset.sellId);
});
document.querySelector("#filters").addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  state.filter = button.dataset.filter;
  document.querySelectorAll("#filters button").forEach((filter) => filter.classList.toggle("active", filter === button));
  renderInventory();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !els.resultModal.hidden) closeModal();
  if (event.code === "Space" && event.target === document.body) {
    event.preventDefault();
    openCase();
  }
});

updateStats();
loadData();
