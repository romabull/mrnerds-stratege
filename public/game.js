// ============ 🎮 ГЛАВНЫЙ СКРИПТ ИГРЫ (HoI4-style) ============

console.log('🚀 game.js загружен!');

if (window.__gameJsLoaded) {
    console.warn('⚠️ game.js уже загружен');
} else {
    window.__gameJsLoaded = true;

let currentUser = null;
let currentRole = null;
let gameRooms = [];
let currentRoom = null;
let gameState = null;
let selectedProvince = null;
let selectedHex = null;
let actionMode = null;
let statePollingInterval = null;
let _attackInProgress = false;

// 🔥 WS: глобальный сокет
let socket = null;
let _socketInitialized = false;
let _lastAppliedUpdatedAt = null;

// ============ 🔥 FIX: ФИЛЬТР ВОДЫ ============
function isValidCountry(c) {
    if (!c) return false;
    if (typeof c !== 'string') return false;
    if (c === 'water') return false;
    if (c === 'sea') return false;
    if (c === 'null') return false;
    if (c === 'undefined') return false;
    return true;
}

function isSeaProvince(prov) {
    if (!prov) return true;
    if (prov.country === 'water') return true;
    if (prov.isSea === true) return true;
    if (prov.terrain === 'sea') return true;
    return false;
}

// ============ ⚡ КОНСТАНТЫ MP ============
const MP_PER_TURN = 2;
const MP_COST_MOVE = 1;
const MP_COST_ATTACK = 1;
const ATTACK_FATIGUE_PENALTY = 0.15;

const OIL_COST_TANK_ATTACK = 2;
const OIL_COST_TANK_MOVE = 1;
const OIL_COST_ARTILLERY_ATTACK = 1;
const OIL_COST_ARTILLERY_MOVE = 1;

const PROVINCE_RESOURCES = {
    grain:  { oil: 0, steel: 0, manpowerBonus: 1.0 },
    oil:    { oil: 4, steel: 0, manpowerBonus: 0.5 },
    metal:  { oil: 0, steel: 3, manpowerBonus: 0.5 },
    coal:   { oil: 0, steel: 1, manpowerBonus: 1.0 },
    rubber: { oil: 0, steel: 0, manpowerBonus: 0.5 },
    none:   { oil: 0, steel: 0, manpowerBonus: 0.2 }
};

const STARTING_CIV_FACTORIES = {
    germany: 30, soviet: 40, uk: 25, france: 20, italy: 15,
    poland: 8, spain: 10, turkey: 8, sweden: 8, romania: 6,
    yugoslavia: 5, czechoslovakia: 8, hungary: 5, bulgaria: 4,
    greece: 3, finland: 5, norway: 4, denmark: 4, netherlands: 7,
    belgium: 7, portugal: 4, switzerland: 5, austria: 5, ireland: 2,
    estonia: 2, latvia: 2, lithuania: 2, albania: 1, luxembourg: 1,
    saudi: 2, iraq: 2, iran: 3, afghanistan: 2,
    default: 4
};

const STARTING_MIL_FACTORIES = {
    germany: 8, soviet: 20, uk: 6, france: 6, italy: 5,
    poland: 3, spain: 3, turkey: 3, sweden: 3, romania: 2,
    yugoslavia: 2, czechoslovakia: 4, hungary: 2, bulgaria: 2,
    greece: 2, finland: 2, norway: 1, denmark: 1, netherlands: 2,
    belgium: 2, portugal: 1, switzerland: 2, austria: 2, ireland: 1,
    estonia: 1, latvia: 1, lithuania: 1, albania: 1, luxembourg: 1,
    saudi: 1, iraq: 1, iran: 1, afghanistan: 1,
    default: 1
};

const UNIT_STATS = {
    infantry: { attack: 1.0, defense: 1.2, name: 'Пехота', icon: '🪖' },
    tanks:    { attack: 2.0, defense: 1.5, name: 'Танки',  icon: '⚔️' },
    artillery:{ attack: 2.5, defense: 1.0, name: 'Артиллерия', icon: '🎯' }
};

const UNIT_COSTS = {
    infantry:  { manpowerCost: 10, steelCost: 5,  oilCost: 0,  buildProgress: 30, speedPerMilIC: 1.0 },
    tanks:     { manpowerCost: 5,  steelCost: 20, oilCost: 0,  buildProgress: 60, speedPerMilIC: 1.0 },
    artillery: { manpowerCost: 8,  steelCost: 12, oilCost: 0,  buildProgress: 45, speedPerMilIC: 1.0 }
};

const AIR_STATS = {
    fighters: { name: 'Истребители', icon: '✈️', attack: 3.0, defense: 3.0, range: 8, hp: 10, cost: 15, manpower: 2, oil: 1, buildProgress: 40 },
    bombers:  { name: 'Бомбардировщики', icon: '💣', attack: 5.0, defense: 1.5, range: 12, hp: 12, cost: 25, manpower: 3, oil: 2, buildProgress: 60 },
    transport:{ name: 'Транспортники', icon: '🪂', attack: 0.5, defense: 1.0, range: 15, hp: 8, cost: 20, manpower: 4, oil: 1, buildProgress: 50 }
};

const BUILDING_TYPES = {
    civFactory: { name: '🏭 Гражданский завод', cost: 40, steelCost: 0,  buildTime: 90 },
    milFactory: { name: '⚙️ Военный завод',     cost: 50, steelCost: 20, buildTime: 120 },
    airFactory: { name: '✈️ Авиазавод',         cost: 60, steelCost: 30, buildTime: 100 },
    airbase:    { name: '🛬 Аэродром',          cost: 30, steelCost: 15, buildTime: 60 },
    aagun:      { name: '🎯 ПВО',               cost: 25, steelCost: 10, buildTime: 45 }
};

const MAX_UNITS_PER_HEX = 3;

const ODD_DIRS  = [[+1,0],[-1,0],[0,-1],[-1,-1],[0,+1],[-1,+1]];
const EVEN_DIRS = [[+1,0],[-1,0],[+1,-1],[0,-1],[+1,+1],[0,+1]];

// DOM
const lobbyView = document.getElementById('lobbyView');
const roomView = document.getElementById('roomView');
const mapView = document.getElementById('mapView');
const roomsList = document.getElementById('roomsList');
const createRoomBtn = document.getElementById('createRoomBtn');
const refreshRoomsBtn = document.getElementById('refreshRoomsBtn');
const leaveRoomBtn = document.getElementById('leaveRoomBtn');
const roomTitle = document.getElementById('roomTitle');
const roomPlayers = document.getElementById('roomPlayers');
const roomStatus = document.getElementById('roomStatus');
const startGameBtn = document.getElementById('startGameBtn');
const mapContainer = document.getElementById('mapContainer');
const provinceInfo = document.getElementById('provinceInfo');
const eventLog = document.getElementById('eventLog');
const turnInfo = document.getElementById('turnInfo');
const currentPlayerInfo = document.getElementById('currentPlayerInfo');
const endTurnBtn = document.getElementById('endTurnBtn');

let _renderMapRunning = false;
let _renderMapTimer = null;
let _selectProvinceRunning = false;
let _startingGame = false;
let _mapGlobalListenersSetup = false;
let _selectProvinceTimer = null;
let _visibleHexesCache = null;
let _visibleHexesCacheKey = '';

let _hexToProvCache = null;
let _hexToProvCacheKey = '';

// ============================================================
//  🔌 WEBSOCKET
// ============================================================
function initSocket() {
    if (_socketInitialized) return;
    if (typeof io === 'undefined') {
        console.warn('⚠️ socket.io-client не загружен — WebSocket отключён');
        return;
    }
    _socketInitialized = true;

    socket = io({
        transports: ['websocket', 'polling'],
        withCredentials: true
    });

    socket.on('connect', () => {
        console.log('🔌 WebSocket подключён:', socket.id);
        const username = localStorage.getItem('username') || 'Гость';
        socket.emit('register', { username });
        if (currentRoom) {
            socket.emit('join-room', { roomId: currentRoom.id });
        }
    });

    socket.on('registered', ({ username }) => {
        console.log('✅ WebSocket зарегистрирован:', username);
    });

    // 🔥 ГЛАВНОЕ: мгновенное обновление состояния
    socket.on('state-update', (newState) => {
        if (!currentRoom) return;
        if (!newState || !newState.updatedAt) return;
        if (_lastAppliedUpdatedAt === newState.updatedAt) return;

        applyStateUpdate(newState);
    });

    socket.on('room-update', (room) => {
        if (!currentRoom || currentRoom.id !== room.id) return;
        currentRoom = room;
        if (roomView.style.display !== 'none') renderRoomInfo(room);
    });

    socket.on('game-started', ({ state }) => {
        if (!currentRoom) return;
        applyStateUpdate(state, true);
        mapInitialized = false;
        mapViewBox = null;
        showMap();
        updateTurnInfo();
        startStatePolling();
    });

    socket.on('room-deleted', ({ roomId }) => {
        if (currentRoom && currentRoom.id === roomId) {
            showAttackToast('🗑️ Комната удалена хостом');
            showLobby();
            loadRooms();
        }
    });

    socket.on('player-offline', ({ username }) => {
        showAttackToast(`⚠️ ${username} отключился`);
    });

    socket.on('player-online', ({ username }) => {
        showAttackToast(`✅ ${username} подключился`);
    });

    socket.on('disconnect', (reason) => {
        console.log('🔌 WebSocket отключён:', reason);
    });

    socket.on('reconnect', () => {
        console.log('🔌 WebSocket переподключён');
        const username = localStorage.getItem('username') || 'Гость';
        socket.emit('register', { username });
        if (currentRoom) socket.emit('join-room', { roomId: currentRoom.id });
    });

    socket.on('connect_error', (err) => {
        console.warn('⚠️ WebSocket ошибка:', err.message);
    });
}

function joinRoomSocket(roomId) {
    if (!socket || !socket.connected) {
        initSocket();
        // Если ещё не подключён — подождём
        if (socket) {
            socket.once('connect', () => socket.emit('join-room', { roomId }));
        }
        return;
    }
    socket.emit('join-room', { roomId });
}

function leaveRoomSocket(roomId) {
    if (socket && socket.connected) {
        socket.emit('leave-room', { roomId });
    }
}

// 🔥 WS: единая точка применения нового состояния
function applyStateUpdate(newState, fullRedraw = false) {
    if (!newState || !newState.updatedAt) return;
    if (_lastAppliedUpdatedAt === newState.updatedAt && !fullRedraw) return;
    _lastAppliedUpdatedAt = newState.updatedAt;

    gameState = newState;
    clearVisibleHexesCache();
    updateIntel();

    if (fullRedraw || !mapSvg) {
        updateFillLayer();
        updateLabelsLayer();
    } else {
        updateUnitsLayer();
        updateMarkersLayer();
        updateHighlightLayer();
        updateActionLayer();
        updateAirbaseRangeLayer();
        updateFactoriesLayer();
    }

    renderEventLog();
    updateTurnInfo();
    updateResourcesBar();
    updateDiplomacyBadge();
    if (selectedProvince) selectProvinceThrottled(selectedProvince);
}

// ============================================================
//  УТИЛИТЫ
// ============================================================

function getHexToProvMap() {
    if (!gameState) return {};
    const cacheKey = `${gameState.turn}_${gameState.updatedAt}`;
    if (_hexToProvCache && _hexToProvCacheKey === cacheKey) return _hexToProvCache;
    const map = {};
    for (const [provId, prov] of Object.entries(gameState.provinces)) {
        for (const [c, r] of (prov.hexes || [])) {
            map[`${c},${r}`] = provId;
        }
    }
    _hexToProvCache = map;
    _hexToProvCacheKey = cacheKey;
    return map;
}

function getVisibleHexesSet() {
    if (!gameState) return new Set();
    const myPlayer = gameState.players.find(p => p.username === currentUser);
    const myCountry = myPlayer?.country;
    if (!myCountry) return new Set();

    const cacheKey = `${gameState.updatedAt}_${myCountry}`;
    if (_visibleHexesCache && _visibleHexesCacheKey === cacheKey) {
        return _visibleHexesCache;
    }

    const myHexSet = new Set();
    Object.entries(gameState.provinces).forEach(([id, prov]) => {
        (prov.hexes || []).forEach(([c, r]) => {
            const key = `${c},${r}`;
            if (getHexOwner(prov, key) === myCountry) myHexSet.add(key);
        });
    });

    const visible = new Set(myHexSet);
    myHexSet.forEach(hexKey => {
        const [c, r] = hexKey.split(',').map(Number);
        const dirs = (r & 1) ? MAP_ODD_DIRS : MAP_EVEN_DIRS;
        dirs.forEach(([dc, dr]) => {
            visible.add(`${c + dc},${r + dr}`);
        });
    });

    _visibleHexesCache = visible;
    _visibleHexesCacheKey = cacheKey;
    return visible;
}

function clearVisibleHexesCache() {
    _visibleHexesCache = null;
    _visibleHexesCacheKey = '';
    _hexToProvCache = null;
    _hexToProvCacheKey = '';
}

function formatManpower(n) {
    n = n || 0;
    if (n >= 1000) return `${(n / 1000).toFixed(1)} млн`;
    return `${Math.round(n)} тыс.`;
}

function formatPopulation(millions) {
    millions = millions || 0;
    const human = millions * 1_000_000;
    if (human >= 1_000_000) return `${(human / 1_000_000).toFixed(1)} млн`;
    return `${Math.floor(human / 1000)} тыс.`;
}

function fmt(n) {
    n = n || 0;
    if (Math.abs(n - Math.round(n)) < 0.01) return Math.round(n);
    return Math.round(n * 10) / 10;
}

function calculatePlayerIncomeClient(state, player) {
    const START = STARTING_CIV_FACTORIES;
    const START_MIL = STARTING_MIL_FACTORIES;

    const startCiv = START[player.country] || START.default;
    const startMil = START_MIL[player.country] || START_MIL.default;

    let builtCiv = 0, builtMil = 0;
    Object.values(state.provinces).forEach(prov => {
        if (prov.country !== player.country) return;
        builtCiv += prov.civFactories || 0;
        builtMil += prov.milFactories || 0;
    });

    const rentedCiv = player.civFactoriesRented || 0;
    const rentedMil = player.milFactoriesRented || 0;
    const leasedCiv = player.civFactoriesLeased || 0;
    const leasedMil = player.milFactoriesLeased || 0;

    const totalCiv = Math.max(0, startCiv + builtCiv + rentedCiv - leasedCiv);
    const totalMil = Math.max(0, startMil + builtMil + rentedMil - leasedMil);
    const total = totalCiv + totalMil;

    const cg = Math.floor(totalCiv * (player.consumerGoodsRatio ?? 0.20));
    const availableCiv = totalCiv - cg;

    let steelProduced = 0, oilProduced = 0, manpowerFromProvinces = 0;
    Object.values(state.provinces).forEach(prov => {
        if (prov.country === player.country && prov.resource) {
            const res = PROVINCE_RESOURCES[prov.resource] || PROVINCE_RESOURCES.none;
            steelProduced += res.steel || 0;
            oilProduced += res.oil || 0;
            manpowerFromProvinces += res.manpowerBonus || 0;
        }
    });

    const pool = player.manpowerPool || 0;
    const MOBILIZATION_PER_TURN = 0.001;
    const draftFromPool = Math.floor(pool * MOBILIZATION_PER_TURN);
    const expectedManpowerGain = Math.min(pool, draftFromPool + manpowerFromProvinces);

    return {
        civIC: availableCiv,
        milIC: totalMil,
        totalFactories: total,
        totalCivFactories: totalCiv,
        totalMilFactories: totalMil,
        consumerGoods: cg,
        availableCiv,
        steelProduced, oilProduced,
        manpowerFromProvinces,
        draftFromPool,
        expectedManpowerGain,
        builtCiv, builtMil,
        startCiv, startMil,
        rentedCiv, rentedMil, leasedCiv, leasedMil
    };
}

function getArmyMP(player, hexKey) {
    if (!player || !player.armyMovement) return { mp: MP_PER_TURN, attacks: 0 };
    return player.armyMovement[hexKey] || { mp: MP_PER_TURN, attacks: 0 };
}

function calcOilCostAttack(unitData) {
    let cost = 0;
    for (const [type, count] of Object.entries(unitData || {})) {
        if (count > 0) {
            if (type === 'tanks') cost += count * OIL_COST_TANK_ATTACK;
            else if (type === 'artillery') cost += count * OIL_COST_ARTILLERY_ATTACK;
        }
    }
    return cost;
}

function calcOilCostMove(unitData) {
    let cost = 0;
    for (const [type, count] of Object.entries(unitData || {})) {
        if (count > 0) {
            if (type === 'tanks') cost += count * OIL_COST_TANK_MOVE;
            else if (type === 'artillery') cost += count * OIL_COST_ARTILLERY_MOVE;
        }
    }
    return cost;
}

function hexDistanceStr(h1, h2) {
    const [c1, r1] = h1.split(',').map(Number);
    const [c2, r2] = h2.split(',').map(Number);
    const x1 = c1 - (r1 - (r1 & 1)) / 2;
    const z1 = r1;
    const y1 = -x1 - z1;
    const x2 = c2 - (r2 - (r2 & 1)) / 2;
    const z2 = r2;
    const y2 = -x2 - z2;
    return Math.max(Math.abs(x1 - x2), Math.abs(y1 - y2), Math.abs(z1 - z2));
}

async function checkAuth() {
    const storedName = localStorage.getItem('username');
    
    if (!storedName || storedName.length < 2) {
        window.location.href = '/';
        return;
    }
    
    currentUser = storedName;
    currentRole = 'user';
    
    installFetchAuthHeader();
    initSocket();   // 🔥 WS: подключаем сокет сразу
    
    showLobby();
    loadRooms();
}

function installFetchAuthHeader() {
    if (window.__fetchPatched) return;
    window.__fetchPatched = true;

    const originalFetch = window.fetch;
    window.fetch = function(url, options = {}) {
        if (typeof url === 'string' && url.startsWith('/api/')) {
            options.headers = options.headers || {};
            if (typeof options.headers === 'object' && !Array.isArray(options.headers)) {
                const rawName = localStorage.getItem('username') || 'Гость';
                let encoded;
                try {
                    encoded = btoa(unescape(encodeURIComponent(rawName)));
                } catch (e) {
                    encoded = 'Guest';
                }
                options.headers['X-Username'] = encoded;
            }
        }
        return originalFetch.call(this, url, options);
    };
}

// ============ ЭКРАНЫ ============
function showLobby() {
    lobbyView.style.display = 'block';
    roomView.style.display = 'none';
    mapView.style.display = 'none';
}

function showRoom(room) {
    currentRoom = room;
    lobbyView.style.display = 'none';
    roomView.style.display = 'block';
    mapView.style.display = 'none';
    renderRoomInfo(room);
}

function showMap() {
    lobbyView.style.display = 'none';
    roomView.style.display = 'none';
    mapView.style.display = 'block';
    renderMapThrottled();
    renderEventLog();
    renderLegend();
    updateResourcesBar();
}

function renderMapThrottled() {
    if (_renderMapTimer) return;
    _renderMapTimer = setTimeout(() => { _renderMapTimer = null; renderMap(); }, 50);
}

function selectProvinceThrottled(id) {
    if (_selectProvinceTimer) clearTimeout(_selectProvinceTimer);
    _selectProvinceTimer = setTimeout(() => { _selectProvinceTimer = null; selectProvince(id); }, 30);
}

// ============ ЛОББИ ============
async function loadRooms() {
    try {
        const response = await fetch('/api/game/rooms');
        if (response.ok) {
            gameRooms = await response.json();
            renderRooms();
        }
    } catch (error) { console.error(error); }
}

function renderRooms() {
    if (!gameRooms || gameRooms.length === 0) {
        roomsList.innerHTML = '<p class="empty">📭 Нет активных комнат</p>';
        return;
    }
    let html = '';
    gameRooms.forEach(room => {
        const playersCount = room.players?.length || 0;
        const maxPlayers = room.maxPlayers || 4;
        html += `
            <div class="room-card">
                <div class="info">
                    <h3>🎮 ${room.name}</h3>
                    <div class="meta">
                        Создал: ${room.createdBy} • Игроков: ${playersCount}/${maxPlayers} •
                        ${room.status === 'lobby' ? '⏳ Лобби' : room.status === 'playing' ? '⚔️ Игра' : '🏁 Завершена'}
                    </div>
                </div>
                <div>
                    <button class="btn-primary join-room-btn" data-room-id="${room.id}">
                        ${room.status === 'lobby' ? '🚪 Войти' : '👁️ Смотреть'}
                    </button>
                    ${room.createdBy === currentUser || currentRole === 'admin' ?
                        `<button class="btn-secondary delete-room-btn" data-room-id="${room.id}" style="margin-left: 8px;">🗑️</button>` : ''}
                </div>
            </div>
        `;
    });
    roomsList.innerHTML = html;
    roomsList.querySelectorAll('.join-room-btn').forEach(btn => {
        btn.addEventListener('click', () => joinRoom(btn.dataset.roomId));
    });
    roomsList.querySelectorAll('.delete-room-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (!confirm('Удалить комнату?')) return;
            try {
                const response = await fetch(`/api/game/rooms/${btn.dataset.roomId}`, { method: 'DELETE' });
                if (response.ok) loadRooms();
            } catch (e) {}
        });
    });
}

async function createRoom() {
    const name = prompt('Название комнаты:', `Партия ${currentUser}`);
    if (!name) return;
    const password = prompt('Пароль (пусто — без пароля):');
    const maxPlayers = parseInt(prompt('Максимум игроков (1-6):', '4')) || 4;
    try {
        const response = await fetch('/api/game/rooms', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, password, maxPlayers, username: currentUser})
        });
        if (response.ok) {
            const data = await response.json();
            loadRooms();
            setTimeout(() => joinRoom(data.room.id), 500);
        } else {
            const err = await response.json();
            alert(err.error || 'Ошибка создания');
        }
    } catch (e) { alert('Ошибка сервера'); }
}

async function joinRoom(roomId) {
    const room = gameRooms.find(r => r.id === roomId);
    if (!room) return alert('Комната не найдена');
    let password = '';
    if (room.hasPassword) {
        password = prompt('Введите пароль:');
        if (password === null) return;
    }
    try {
        const response = await fetch(`/api/game/rooms/${roomId}/join`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password })
        });
        if (response.ok) {
            const data = await response.json();
            showRoom(data.room);

            // 🔥 WS: вступаем в комнату через сокет
            joinRoomSocket(data.room.id);

            if (data.room.status === 'playing') {
                await loadGameState();
                showMap();
                updateTurnInfo();
                startStatePolling();
            }
        } else {
            const err = await response.json();
            alert(err.error || 'Ошибка входа');
        }
    } catch (e) { alert('Ошибка сервера'); }
}

// ============ КОМНАТА ============
function renderRoomInfo(room) {
    if (room.status === 'playing') {
        if (mapView.style.display === 'none') {
            loadGameState().then(() => {
                showMap();
                updateTurnInfo();
                startStatePolling();
            });
        }
        return;
    }
    roomTitle.textContent = `🎮 ${room.name}`;
    const players = room.players || [];
    const takenCountries = players.filter(p => p.country).map(p => p.country);
    const myPlayer = players.find(p => p.username === currentUser);
    const myCountry = myPlayer?.country;

    let playersHtml = players.map(p => {
        const c = p.country ? COUNTRIES[p.country] : null;
        const color = c ? c.color : '#4a5568';
        return `
            <div class="player-card" style="border-left-color: ${color};">
                <div>
                    <div class="name">${p.username}${p.username === currentUser ? ' (вы)' : ''}</div>
                    <div class="country">${c ? `${c.flag} ${c.name}` : '— не выбрал страну'}</div>
                </div>
                <div>${p.ready ? '✅' : '⏳'}</div>
            </div>
        `;
    }).join('');
    roomPlayers.innerHTML = playersHtml;

    if (room.status === 'lobby') {
        const takenSet = new Set(players.map(p => p.country).filter(Boolean));
        const allMapCountries = new Set();

        if (typeof EUROPE_MAP !== 'undefined') {
            Object.values(EUROPE_MAP).forEach(p => {
                if (!isValidCountry(p.country)) return;
                if (isSeaProvince(p)) return;
                allMapCountries.add(p.country);
            });
        } else if (typeof COUNTRIES !== 'undefined') {
            Object.keys(COUNTRIES).forEach(c => {
                if (isValidCountry(c)) allMapCountries.add(c);
            });
        }

        const aiCountries = Array.from(allMapCountries).filter(c => !takenSet.has(c));

        if (aiCountries.length > 0) {
            const sorted = aiCountries.sort((a, b) =>
                (COUNTRIES[a]?.name || a).localeCompare(COUNTRIES[b]?.name || b, 'ru')
            );
            const aiList = sorted.map(c => {
                const cInfo = COUNTRIES[c] || { name: c, flag: '🏳️' };
                return `<span style="display:inline-block; padding:4px 10px; background:rgba(255,255,255,0.08); border-radius:6px; margin:2px; font-size:12px;">${cInfo.flag} ${cInfo.name}</span>`;
            }).join('');

            let aiPanel = document.getElementById('aiCountriesPanel');
            if (!aiPanel) {
                aiPanel = document.createElement('div');
                aiPanel.id = 'aiCountriesPanel';
                aiPanel.style.cssText = 'background:#0f0f1e; padding:12px; border-radius:10px; margin-top:15px; border:1px solid #2d3748;';
                roomPlayers.parentNode.insertBefore(aiPanel, roomPlayers.nextSibling);
            }
            aiPanel.innerHTML = `
                <div style="font-size:12px; color:#a0aec0; text-transform:uppercase; margin-bottom:8px;">🤖 ИИ-страны (${aiCountries.length})</div>
                <div>${aiList}</div>
            `;
        }
    }

    let pickerHtml = '';
    if (room.status === 'lobby') {
        const availableCountries = Object.entries(COUNTRIES)
            .filter(([id]) => isValidCountry(id))
            .sort(([, a], [, b]) => a.name.localeCompare(b.name, 'ru'));

        pickerHtml = `
            <h3 style="margin: 25px 0 10px; color: #e2e8f0;">Выберите страну:</h3>
            <div class="country-picker">
                ${availableCountries.map(([id, c]) => {
                    const taken = takenCountries.includes(id) && id !== myCountry;
                    const selected = id === myCountry;
                    return `
                        <div class="country-option ${taken ? 'taken' : ''} ${selected ? 'selected' : ''}" data-country="${id}" ${taken ? 'title="Занято"' : ''}>
                            <span class="flag">${c.flag}</span>
                            <span class="name">${c.name}</span>
                        </div>
                    `;
                }).join('')}
            </div>
            ${myCountry ? `<button id="readyBtn" class="btn-primary" style="margin-top: 15px;">${myPlayer.ready ? '❌ Отменить готовность' : '✅ Готов'}</button>` : ''}
        `;
    }
    roomStatus.innerHTML = `Игроков: ${players.length}/${room.maxPlayers}`;
    const pickerContainer = document.getElementById('countryPickerContainer');
    if (pickerContainer) pickerContainer.innerHTML = pickerHtml;

    document.querySelectorAll('.country-option:not(.taken)').forEach(el => {
        el.addEventListener('click', async () => { await selectCountry(room.id, el.dataset.country); });
    });
    document.getElementById('readyBtn')?.addEventListener('click', async () => await toggleReady(room.id));

    const isHost = (room.createdBy || room.host) === currentUser;
    const allReady = players.length >= 1 && players.every(p => p.ready && p.country);
    startGameBtn.disabled = !(isHost && allReady);
    if (isHost && allReady) startGameBtn.textContent = '▶ Начать игру';
    else if (isHost) startGameBtn.textContent = '⏳ Ждём готовности';
}

async function selectCountry(roomId, country) {
    if (!isValidCountry(country)) {
        alert('Нельзя выбрать воду');
        return;
    }
    try {
        const response = await fetch(`/api/game/rooms/${roomId}/select-country`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ country })
        });
        if (response.ok) {
            const data = await response.json();
            showRoom(data.room);
        } else {
            const err = await response.json();
            alert(err.error || 'Ошибка');
        }
    } catch (e) { alert('Ошибка'); }
}

async function toggleReady(roomId) {
    try {
        const response = await fetch(`/api/game/rooms/${roomId}/ready`, { method: 'POST' });
        if (response.ok) {
            const data = await response.json();
            showRoom(data.room);
        }
    } catch (e) { alert('Ошибка'); }
}

// ============ СОСТОЯНИЕ ============
async function loadGameState() {
    if (!currentRoom) return;
    try {
        const response = await fetch(`/api/game/rooms/${currentRoom.id}/state`);
        if (response.ok) {
            const state = await response.json();
            applyStateUpdate(state, true);
        }
    } catch (e) {}
}

function updateIntel() {
    if (!gameState) return;
    const myPlayer = gameState.players.find(p => p.username === currentUser);
    if (!myPlayer) return;
    const myCountry = myPlayer.country;

    const visibleHexes = getVisibleHexesSet();
    if (!myPlayer.intel) myPlayer.intel = {};

    for (const key of Object.keys(myPlayer.intel)) {
        delete myPlayer.intel[key];
    }

    const hexToProv = getHexToProvMap();
    visibleHexes.forEach(hexKey => {
        const provId = hexToProv[hexKey];
        if (!provId) return;
        const prov = gameState.provinces[provId];
        const owner = getHexOwner(prov, hexKey);
        if (owner !== myCountry && isValidCountry(owner)) {
            const u = prov.units?.[hexKey] || {};
            myPlayer.intel[hexKey] = {
                infantry: u.infantry || 0,
                tanks: u.tanks || 0,
                artillery: u.artillery || 0,
                _seenTurn: gameState.turn
            };
        }
    });
}

function isHexVisible(hexKey, myCountry) {
    const visible = getVisibleHexesSet();
    return visible.has(hexKey);
}

// ============ ПОЛЛИНГ (теперь как fallback, реже) ============
function startStatePolling() {
    if (statePollingInterval) clearInterval(statePollingInterval);
    let lastOfferCount = 0;
    let lastMarketOfferCount = 0;
    let lastUpdatedAt = null;

    // 🔥 WS: 10 секунд вместо 3 — WebSocket даёт мгновенные обновления
    statePollingInterval = setInterval(async () => {
        if (!currentRoom || mapView.style.display === 'none') return;
        try {
            const response = await fetch(`/api/game/rooms/${currentRoom.id}/state`);
            if (response.ok) {
                const newState = await response.json();
                if (lastUpdatedAt === newState.updatedAt) return;
                lastUpdatedAt = newState.updatedAt;

                // Проверяем новые предложения (уведомления)
                const me = newState.players.find(p => p.username === currentUser);
                if (me) {
                    const myCountry = me.country;
                    const newOffers = (newState.diplomaticOffers || []).filter(o =>
                        o.to === myCountry && o.status === 'pending'
                    );
                    const newMarketOffers = (newState.marketOffers || []).filter(o =>
                        o.to === myCountry && o.status === 'pending'
                    );

                    if (newOffers.length > lastOfferCount) {
                        const newest = newOffers[newOffers.length - 1];
                        showAttackToast(`📨 Новое предложение от ${newest.fromName}!`);
                    }
                    if (newMarketOffers.length > lastMarketOfferCount) {
                        const newest = newMarketOffers[newMarketOffers.length - 1];
                        showAttackToast(`💰 Новое торговое предложение от ${newest.fromName}!`);
                    }

                    lastOfferCount = newOffers.length;
                    lastMarketOfferCount = newMarketOffers.length;
                }

                applyStateUpdate(newState);
            }
        } catch (e) {}
    }, 10000);
}

// ============ КАРТА ============
const HEX_SIZE = 10;
let mapSvg = null, mapViewBox = null, isPanning = false;
let panStart = { x: 0, y: 0 }, panStartViewBox = { x: 0, y: 0 }, mapInitialized = false;

function hexToPixel(x, y) {
    const w = Math.sqrt(3) * HEX_SIZE;
    const h = 2 * HEX_SIZE;
    return [w * (x + 0.5 * (y & 1)), h * 0.75 * y];
}

function hexCorners(cx, cy) {
    const pts = [];
    for (let i = 0; i < 6; i++) {
        const a = Math.PI / 180 * (60 * i - 30);
        pts.push([cx + HEX_SIZE * Math.cos(a), cy + HEX_SIZE * Math.sin(a)]);
    }
    return pts;
}

const MAP_ODD_DIRS  = [[+1,0],[-1,0],[0,-1],[-1,-1],[0,+1],[-1,+1]];
const MAP_EVEN_DIRS = [[+1,0],[-1,0],[+1,-1],[0,-1],[+1,+1],[0,+1]];

function getUnitCount(u) { return u ? Object.values(u).reduce((s, n) => s + (n || 0), 0) : 0; }
function areNeighbors(k1, k2) {
    const [c1, r1] = k1.split(',').map(Number);
    const [c2, r2] = k2.split(',').map(Number);
    const dirs = (r1 & 1) ? MAP_ODD_DIRS : MAP_EVEN_DIRS;
    return dirs.some(([dc, dr]) => (c1 + dc === c2 && r1 + dr === r2));
}
function getHexOwner(prov, hexKey) { return prov.hexOwner?.[hexKey] || prov.country; }

function setupMapGlobalListeners() {
    if (_mapGlobalListenersSetup) return;
    _mapGlobalListenersSetup = true;
    window.addEventListener("mousemove", (e) => {
        if (!isPanning || !mapSvg || !mapViewBox) return;
        const rect = mapSvg.getBoundingClientRect();
        const dx = (e.clientX - panStart.x) / rect.width * mapViewBox.w;
        const dy = (e.clientY - panStart.y) / rect.height * mapViewBox.h;
        mapViewBox.x = panStartViewBox.x - dx;
        mapViewBox.y = panStartViewBox.y - dy;
        mapSvg.setAttribute("viewBox", `${mapViewBox.x} ${mapViewBox.y} ${mapViewBox.w} ${mapViewBox.h}`);
    });
    window.addEventListener("mouseup", () => {
        if (isPanning) { isPanning = false; if (mapSvg) mapSvg.classList.remove("panning"); updateMapCursor(); }
    });
}

function renderMap() {
    if (_renderMapRunning) return;
    _renderMapRunning = true;
    try {
        mapContainer.innerHTML = '';
        if (!gameState || !gameState.provinces) return;

        const landProvinces = {};
        let seaProvinceId = null;

        Object.entries(gameState.provinces).forEach(([id, prov]) => {
            if (isSeaProvince(prov)) {
                if (!seaProvinceId && prov.hexes && prov.hexes.length > 0) seaProvinceId = id;
                return;
            }
            landProvinces[id] = prov;
        });

        const landHexes = [];
        Object.values(landProvinces).forEach(prov => {
            (prov.hexes || []).forEach(([hx, hy]) => landHexes.push([hx, hy]));
        });
        if (landHexes.length === 0) return;

        const landPixels = landHexes.map(([x, y]) => hexToPixel(x, y));
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const [px, py] of landPixels) {
            if (px < minX) minX = px; if (py < minY) minY = py;
            if (px > maxX) maxX = px; if (py > maxY) maxY = py;
        }

        if (!mapInitialized || !mapViewBox) {
            mapViewBox = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
            mapInitialized = true;
        }

        const svgNS = "http://www.w3.org/2000/svg";
        mapSvg = document.createElementNS(svgNS, "svg");
        mapSvg.setAttribute("viewBox", `${mapViewBox.x} ${mapViewBox.y} ${mapViewBox.w} ${mapViewBox.h}`);
        mapSvg.setAttribute("width", maxX - minX);
        mapSvg.setAttribute("height", maxY - minY);
        mapSvg.style.display = "block";
        mapSvg.style.cursor = "default";
        mapSvg.style.userSelect = "none";
        mapSvg.style.overflow = "hidden";

        const bgRect = document.createElementNS(svgNS, "rect");
        bgRect.setAttribute("x", minX); bgRect.setAttribute("y", minY);
        bgRect.setAttribute("width", maxX - minX); bgRect.setAttribute("height", maxY - minY);
        bgRect.setAttribute("fill", "#1e3a5f");
        if (seaProvinceId) bgRect.dataset.region = seaProvinceId;
        bgRect.addEventListener("click", () => { if (seaProvinceId) selectProvinceThrottled(seaProvinceId); });
        mapSvg.appendChild(bgRect);

        const layers = ['airbase-range-layer', 'fill-layer', 'country-border-layer', 'marker-layer', 'factory-layer', 'units-layer', 'labels-layer', 'highlight-layer', 'action-layer', 'animation-layer', 'attack-highlight-layer'];
        layers.forEach(id => {
            const g = document.createElementNS(svgNS, "g");
            g.id = id;
            g.style.pointerEvents = "none";
            mapSvg.appendChild(g);
        });
        mapSvg.querySelector('#fill-layer').style.pointerEvents = "auto";

        mapContainer.appendChild(mapSvg);

        rebuildFillLayer();
        rebuildCountryBorders();
        updateLabelsLayer();
        updateFactoriesLayer();
        updateUnitsLayer();
        updateMarkersLayer();
        updateHighlightLayer();
        updateActionLayer();
        updateAirbaseRangeLayer();

        mapSvg.addEventListener("wheel", (e) => {
            e.preventDefault();
            const rect = mapSvg.getBoundingClientRect();
            const mouseX = (e.clientX - rect.left) / rect.width;
            const mouseY = (e.clientY - rect.top) / rect.height;
            const worldX = mapViewBox.x + mouseX * mapViewBox.w;
            const worldY = mapViewBox.y + mouseY * mapViewBox.h;
            const factor = e.deltaY > 0 ? 1.15 : 0.87;
            const newW = mapViewBox.w * factor;
            const newH = mapViewBox.h * factor;
            if (newW < 40 || newW > 3000) return;
            mapViewBox.x = worldX - mouseX * newW;
            mapViewBox.y = worldY - mouseY * newH;
            mapViewBox.w = newW; mapViewBox.h = newH;
            mapSvg.setAttribute("viewBox", `${mapViewBox.x} ${mapViewBox.y} ${mapViewBox.w} ${mapViewBox.h}`);
        }, { passive: false });

        mapSvg.addEventListener("mousedown", (e) => {
            if (e.button !== 0 || actionMode === 'attack') return;
            isPanning = true;
            panStart.x = e.clientX; panStart.y = e.clientY;
            panStartViewBox.x = mapViewBox.x; panStartViewBox.y = mapViewBox.y;
            mapSvg.classList.add("panning");
            mapSvg.style.cursor = "grabbing";
        });

        updateMapCursor();
    } catch (error) {
        console.error('❌ renderMap:', error);
    } finally { _renderMapRunning = false; }
}

function rebuildFillLayer() {
    if (!mapSvg || !gameState) return;
    const fillGroup = mapSvg.querySelector('#fill-layer');
    if (!fillGroup) return;
    fillGroup.innerHTML = '';

    const hexesByCountry = {};
    Object.entries(gameState.provinces).forEach(([provId, prov]) => {
        if (isSeaProvince(prov)) return;
        (prov.hexes || []).forEach(([hx, hy]) => {
            const key = `${hx},${hy}`;
            const owner = getHexOwner(prov, key);
            if (!isValidCountry(owner)) return;
            if (!hexesByCountry[owner]) hexesByCountry[owner] = [];
            hexesByCountry[owner].push({ hx, hy, provId });
        });
    });

    const svgNS = "http://www.w3.org/2000/svg";
    Object.entries(hexesByCountry).forEach(([countryId, hexesList]) => {
        const color = COUNTRIES[countryId]?.color || '#4a5568';
        let d = '';
        for (const { hx, hy } of hexesList) {
            const [cx, cy] = hexToPixel(hx, hy);
            const corners = hexCorners(cx, cy);
            d += 'M' + corners.map(p => `${p[0]},${p[1]}`).join('L') + 'Z';
        }
        const path = document.createElementNS(svgNS, "path");
        path.setAttribute("d", d);
        path.setAttribute("fill", color);
        path.setAttribute("stroke", "none");
        path.setAttribute("class", "hex-region");
        path.dataset.country = countryId;

        path.addEventListener("click", (e) => {
            const rect = mapSvg.getBoundingClientRect();
            const mouseX = (e.clientX - rect.left) / rect.width;
            const mouseY = (e.clientY - rect.top) / rect.height;
            const worldX = mapViewBox.x + mouseX * mapViewBox.w;
            const worldY = mapViewBox.y + mouseY * mapViewBox.h;
            let bestHex = null, bestDist = Infinity, bestProvId = null;
            for (const { hx, hy, provId } of hexesList) {
                const [cx, cy] = hexToPixel(hx, hy);
                const dist = (cx - worldX) ** 2 + (cy - worldY) ** 2;
                if (dist < bestDist) { bestDist = dist; bestHex = [hx, hy]; bestProvId = provId; }
            }
            if (!bestHex) return;
            handleHexClick(bestProvId, bestHex[0], bestHex[1]);
        });
        fillGroup.appendChild(path);
    });
}

function rebuildCountryBorders() {
    if (!mapSvg || !gameState) return;
    const borderGroup = mapSvg.querySelector('#country-border-layer');
    if (!borderGroup) return;
    borderGroup.innerHTML = '';

    const hexOwnerMap = {};
    Object.entries(gameState.provinces).forEach(([id, prov]) => {
        if (isSeaProvince(prov)) return;
        (prov.hexes || []).forEach(([hx, hy]) => {
            hexOwnerMap[`${hx},${hy}`] = getHexOwner(prov, `${hx},${hy}`);
        });
    });

    const ODD_EDGES = [[0,1],[3,4],[5,0],[4,5],[1,2],[2,3]];
    const EVEN_EDGES = [[0,1],[3,4],[5,0],[4,5],[1,2],[2,3]];

    const drawnEdges = new Set();
    let d = '';
    Object.entries(hexOwnerMap).forEach(([key, country]) => {
        const [hx, hy] = key.split(',').map(Number);
        const [cx, cy] = hexToPixel(hx, hy);
        const corners = hexCorners(cx, cy);
        const dirs = (hy & 1) ? MAP_ODD_DIRS : MAP_EVEN_DIRS;
        const edges = (hy & 1) ? ODD_EDGES : EVEN_EDGES;
        for (let i = 0; i < 6; i++) {
            const [dx, dy] = dirs[i];
            const nKey = `${hx + dx},${hy + dy}`;
            if (hexOwnerMap[nKey] !== country) {
                const [a, b] = edges[i];
                const p1 = corners[a], p2 = corners[b];
                const edgeKey = [`${p1[0].toFixed(2)},${p1[1].toFixed(2)}`, `${p2[0].toFixed(2)},${p2[1].toFixed(2)}`].sort().join('|');
                if (drawnEdges.has(edgeKey)) continue;
                drawnEdges.add(edgeKey);
                d += `M${p1[0].toFixed(2)},${p1[1].toFixed(2)}L${p2[0].toFixed(2)},${p2[1].toFixed(2)}`;
            }
        }
    });

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", d);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "#0a0a2a");
    path.setAttribute("stroke-width", "2");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    borderGroup.appendChild(path);
}

function updateAirbaseRangeLayer() {
    if (!mapSvg || !gameState) return;
    const layer = mapSvg.querySelector('#airbase-range-layer');
    if (!layer) return;
    layer.innerHTML = '';

    const myPlayer = gameState.players.find(p => p.username === currentUser);
    if (!myPlayer) return;

    if (!selectedHex || !selectedProvince) return;
    const prov = gameState.provinces[selectedProvince];
    if (!prov) return;
    const owner = getHexOwner(prov, selectedHex);
    if (owner === myPlayer.country) return;
    if (!isValidCountry(owner)) return;

    const maxRange = Math.max(
        (myPlayer.airUnits?.fighters || 0) > 0 ? AIR_STATS.fighters.range : 0,
        (myPlayer.airUnits?.bombers || 0) > 0 ? AIR_STATS.bombers.range : 0
    );
    if (maxRange === 0) return;

    const myAirbases = [];
    Object.entries(gameState.provinces).forEach(([id, p]) => {
        if (p.country === myPlayer.country && (p.airbases || 0) > 0) {
            (p.hexes || []).forEach(([c, r]) => myAirbases.push(`${c},${r}`));
        }
    });
    if (myAirbases.length === 0) return;

    const drawnHexes = new Set();
    myAirbases.forEach(abHex => {
        const [ac, ar] = abHex.split(',').map(Number);
        for (let dc = -maxRange; dc <= maxRange; dc++) {
            for (let dr = -maxRange; dr <= maxRange; dr++) {
                const hc = ac + dc;
                const hr = ar + dr;
                const hKey = `${hc},${hr}`;
                if (drawnHexes.has(hKey)) continue;
                if (hexDistanceStr(abHex, hKey) <= maxRange) {
                    drawnHexes.add(hKey);
                }
            }
        }
    });

    const svgNS = "http://www.w3.org/2000/svg";
    drawnHexes.forEach(hKey => {
        const [hx, hy] = hKey.split(',').map(Number);
        const [cx, cy] = hexToPixel(hx, hy);
        const p = document.createElementNS(svgNS, "path");
        p.setAttribute("d", 'M' + hexCorners(cx, cy).map(pt => `${pt[0]},${pt[1]}`).join('L') + 'Z');
        p.setAttribute("fill", "rgba(59, 130, 246, 0.08)");
        p.setAttribute("stroke", "rgba(59, 130, 246, 0.25)");
        p.setAttribute("stroke-width", "0.5");
        layer.appendChild(p);
    });

    myAirbases.forEach(abHex => {
        const [hx, hy] = abHex.split(',').map(Number);
        const [cx, cy] = hexToPixel(hx, hy);
        const p = document.createElementNS(svgNS, "path");
        p.setAttribute("d", 'M' + hexCorners(cx, cy).map(pt => `${pt[0]},${pt[1]}`).join('L') + 'Z');
        p.setAttribute("fill", "none");
        p.setAttribute("stroke", "rgba(59, 130, 246, 0.7)");
        p.setAttribute("stroke-width", "1.5");
        layer.appendChild(p);
    });
}

function updateLabelsLayer() {
    if (!mapSvg || !gameState) return;
    const labelGroup = mapSvg.querySelector('#labels-layer');
    if (!labelGroup) return;
    labelGroup.innerHTML = '';
    const svgNS = "http://www.w3.org/2000/svg";
    const myPlayer = gameState.players.find(p => p.username === currentUser);
    const myCountry = myPlayer?.country;

    Object.entries(gameState.provinces).forEach(([id, prov]) => {
        if (isSeaProvince(prov)) return;
        const hexes = prov.hexes || [];
        if (hexes.length < 2) return;
        const pts = hexes.map(([x, y]) => hexToPixel(x, y));
        let pMinX = Infinity, pMinY = Infinity, pMaxX = -Infinity, pMaxY = -Infinity;
        for (const [px, py] of pts) {
            if (px < pMinX) pMinX = px; if (py < pMinY) pMinY = py;
            if (px > pMaxX) pMaxX = px; if (py > pMaxY) pMaxY = py;
        }
        const cx = (pMinX + pMaxX) / 2;
        const cy = (pMinY + pMaxY) / 2;
        let bestHex = null, bestDist = Infinity;
        for (const [hx, hy] of hexes) {
            const [hpx, hpy] = hexToPixel(hx, hy);
            const dist = (hpx - cx) ** 2 + (hpy - cy) ** 2;
            if (dist < bestDist) { bestDist = dist; bestHex = { px: hpx, py: hpy }; }
        }
        const textX = bestHex ? bestHex.px : cx;
        const textY = bestHex ? bestHex.py : cy;
        const text = document.createElementNS(svgNS, "text");
        text.setAttribute("x", textX);
        text.setAttribute("y", textY + 3);
        text.setAttribute("text-anchor", "middle");
        text.setAttribute("font-size", "10");
        text.setAttribute("font-weight", "700");
        text.setAttribute("fill", prov.country === myCountry ? "#fbbf24" : "#fff");
        text.style.paintOrder = "stroke";
        text.style.stroke = "#000";
        text.style.strokeWidth = "2.5px";
        text.style.strokeLinejoin = "round";
        text.textContent = (prov.isCapital ? "★ " : "") + (prov.name || "").split(" ")[0];
        labelGroup.appendChild(text);
    });
}

function updateFactoriesLayer() {
    if (!mapSvg || !gameState) return;
    const layer = mapSvg.querySelector('#factory-layer');
    if (!layer) return;
    layer.innerHTML = '';
    const svgNS = "http://www.w3.org/2000/svg";
    const myPlayer = gameState.players.find(p => p.username === currentUser);
    const myCountry = myPlayer?.country;

    Object.entries(gameState.provinces).forEach(([id, prov]) => {
        if (isSeaProvince(prov)) return;
        const civ = prov.civFactories || 0;
        const mil = prov.milFactories || 0;
        const air = prov.airFactories || 0;
        const ab = prov.airbases || 0;
        const aa = prov.aaguns || 0;
        if (civ === 0 && mil === 0 && air === 0 && ab === 0 && aa === 0) return;

        const hexes = prov.hexes || [];
        if (hexes.length === 0) return;
        const pts = hexes.map(([x, y]) => hexToPixel(x, y));
        let pMinX = Infinity, pMinY = Infinity, pMaxX = -Infinity, pMaxY = -Infinity;
        for (const [px, py] of pts) {
            if (px < pMinX) pMinX = px; if (py < pMinY) pMinY = py;
            if (px > pMaxX) pMaxX = px; if (py > pMaxY) pMaxY = py;
        }
        const cx = (pMinX + pMaxX) / 2;
        const cy = (pMinY + pMaxY) / 2;
        const badgeY = cy + 8;

        const rect = document.createElementNS(svgNS, "rect");
        rect.setAttribute("x", cx - 20);
        rect.setAttribute("y", badgeY - 5);
        rect.setAttribute("width", 40);
        rect.setAttribute("height", 10);
        rect.setAttribute("rx", 3);
        rect.setAttribute("fill", "rgba(0,0,0,0.65)");
        rect.setAttribute("stroke", prov.country === myCountry ? "#fbbf24" : "#666");
        rect.setAttribute("stroke-width", "0.5");
        layer.appendChild(rect);

        const text = document.createElementNS(svgNS, "text");
        text.setAttribute("x", cx);
        text.setAttribute("y", badgeY + 3);
        text.setAttribute("text-anchor", "middle");
        text.setAttribute("font-size", "8");
        text.setAttribute("font-weight", "700");
        text.setAttribute("fill", "#fff");
        let label = '';
        if (civ > 0) label += `🏭${civ}`;
        if (mil > 0) label += `${label ? ' ' : ''}⚙️${mil}`;
        if (air > 0) label += `${label ? ' ' : ''}✈️${air}`;
        if (ab > 0) label += `${label ? ' ' : ''}🛬${ab}`;
        if (aa > 0) label += `${label ? ' ' : ''}🎯${aa}`;
        text.textContent = label;
        layer.appendChild(text);
    });
}

function updateFillLayer() {
    if (!mapSvg || !gameState) return;
    rebuildFillLayer();
    rebuildCountryBorders();
    updateUnitsLayer();
    updateFactoriesLayer();
    updateMarkersLayer();
    updateHighlightLayer();
    updateActionLayer();
    updateAirbaseRangeLayer();
}

function updateUnitsLayerOnly() {
    if (!mapSvg || !gameState) return;
    updateUnitsLayer();
    updateMarkersLayer();
    updateHighlightLayer();
    updateActionLayer();
}

function updateUnitsLayer() {
    if (!mapSvg || !gameState) return;
    const layer = mapSvg.querySelector('#units-layer');
    if (!layer) return;
    layer.innerHTML = '';
    const myPlayer = gameState.players.find(p => p.username === currentUser);
    const myCountry = myPlayer?.country;

    const myHexSet = new Set();
    Object.entries(gameState.provinces).forEach(([id, prov]) => {
        (prov.hexes || []).forEach(([c, r]) => {
            const key = `${c},${r}`;
            if (getHexOwner(prov, key) === myCountry) myHexSet.add(key);
        });
    });

    const visibleHexes = new Set(myHexSet);
    myHexSet.forEach(hexKey => {
        const [c, r] = hexKey.split(',').map(Number);
        const dirs = (r & 1) ? MAP_ODD_DIRS : MAP_EVEN_DIRS;
        dirs.forEach(([dc, dr]) => {
            visibleHexes.add(`${c + dc},${r + dr}`);
        });
    });

    Object.entries(gameState.provinces).forEach(([id, prov]) => {
        if (!prov.units) return;
        Object.entries(prov.units).forEach(([hexKey, unitData]) => {
            const total = getUnitCount(unitData);
            if (total <= 0) return;

            const owner = getHexOwner(prov, hexKey);
            if (!isValidCountry(owner)) return;
            const isMine = owner === myCountry;

            if (!isMine && !visibleHexes.has(hexKey)) return;

            const [hx, hy] = hexKey.split(',').map(Number);
            const [cx, cy] = hexToPixel(hx, hy);

            const parts = [];
            for (const [type, count] of Object.entries(unitData)) {
                if (count > 0 && UNIT_STATS[type]) {
                    parts.push(`${UNIT_STATS[type].icon}${count}`);
                }
            }
            if (parts.length === 0) return;

            const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
            text.setAttribute("x", cx);
            text.setAttribute("y", cy + 3);
            text.setAttribute("text-anchor", "middle");
            text.setAttribute("font-size", "10");
            text.setAttribute("font-weight", "700");

            if (isMine) {
                text.setAttribute("fill", "#ffffff");
            } else {
                text.setAttribute("fill", "#ef4444");
            }

            text.style.paintOrder = "stroke";
            text.style.stroke = "#000";
            text.style.strokeWidth = "2.5px";
            text.style.strokeLinejoin = "round";
            text.textContent = parts.join(' ');
            layer.appendChild(text);
        });
    });
}

function updateMarkersLayer() {
    if (!mapSvg || !gameState) return;
    const layer = mapSvg.querySelector('#marker-layer');
    if (!layer) return;
    layer.innerHTML = '';
    if (selectedProvince && gameState.provinces[selectedProvince]) {
        const prov = gameState.provinces[selectedProvince];
        if (prov.borderHexes && prov.borderHexes.length > 0) {
            let markersD = '';
            prov.borderHexes.forEach(hexKey => {
                const [hx, hy] = hexKey.split(',').map(Number);
                const [cx, cy] = hexToPixel(hx, hy);
                markersD += `M${cx-2},${cy} L${cx},${cy-2} L${cx+2},${cy} L${cx},${cy+2} Z`;
            });
            const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
            path.setAttribute("d", markersD);
            path.setAttribute("fill", "#fbbf24");
            path.setAttribute("stroke", "#000");
            path.setAttribute("stroke-width", "0.5");
            layer.appendChild(path);
        }
    }
}

function updateHighlightLayer() {
    if (!mapSvg || !gameState) return;
    const layer = mapSvg.querySelector('#highlight-layer');
    if (!layer) return;
    layer.innerHTML = '';
    if (selectedProvince && gameState.provinces[selectedProvince]) {
        const prov = gameState.provinces[selectedProvince];
        let d = '';
        for (const [hx, hy] of (prov.hexes || [])) {
            const [cx, cy] = hexToPixel(hx, hy);
            d += 'M' + hexCorners(cx, cy).map(p => `${p[0]},${p[1]}`).join('L') + 'Z';
        }
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", d);
        path.setAttribute("fill", "none");
        path.setAttribute("stroke", "#fbbf24");
        path.setAttribute("stroke-width", "2.5");
        layer.appendChild(path);
    }
    if (selectedHex) {
        const [hx, hy] = selectedHex.split(',').map(Number);
        const [cx, cy] = hexToPixel(hx, hy);
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", 'M' + hexCorners(cx, cy).map(p => `${p[0]},${p[1]}`).join('L') + 'Z');
        path.setAttribute("fill", "none");
        path.setAttribute("stroke", "#22c55e");
        path.setAttribute("stroke-width", "3");
        path.style.filter = "drop-shadow(0 0 4px #22c55e)";
        layer.appendChild(path);
    }
}

function updateActionLayer() {
    if (!mapSvg || !gameState) return;
    const layer = mapSvg.querySelector('#action-layer');
    if (!layer) return;
    layer.innerHTML = '';
    if (actionMode === 'move' && selectedHex) {
        const [c, r] = selectedHex.split(',').map(Number);
        const dirs = (r & 1) ? MAP_ODD_DIRS : MAP_EVEN_DIRS;
        const myCountry = gameState.players.find(p => p.username === currentUser)?.country;
        const hexToProv = getHexToProvMap();

        dirs.forEach(([dc, dr]) => {
            const nk = `${c + dc},${r + dr}`;
            const provId = hexToProv[nk];
            if (!provId) return;
            const prov = gameState.provinces[provId];
            if (!prov) return;
            const owner = getHexOwner(prov, nk);
            if (owner !== myCountry) return;

            const [hx, hy] = nk.split(',').map(Number);
            const [cx, cy] = hexToPixel(hx, hy);
            const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
            p.setAttribute("d", 'M' + hexCorners(cx, cy).map(pt => `${pt[0]},${pt[1]}`).join('L') + 'Z');
            p.setAttribute("fill", "none");
            p.setAttribute("stroke", "#22c55e");
            p.setAttribute("stroke-width", "2");
            p.setAttribute("stroke-dasharray", "3,2");
            layer.appendChild(p);
        });
    }
}

// ============ КЛИК ПО ГЕКСУ ============
async function handleHexClick(provId, hx, hy) {
    const clickedHex = `${hx},${hy}`;
    const prov = gameState.provinces[provId];
    if (!prov) return;
    const myPlayer = gameState.players.find(p => p.username === currentUser);
    const myCountry = myPlayer?.country;
    const owner = getHexOwner(prov, clickedHex);
    const isMyHex = owner === myCountry;

    if (actionMode === 'paradrop') {
        const sel = window._paradropSelection;
        if (!sel) { actionMode = null; updateMapCursor(); return; }
        if (isMyHex) { showModal('Нельзя', 'Это ваш гекс — нужен вражеский'); return; }
        if (!isValidCountry(owner)) { showModal('Нельзя', 'Это море'); return; }

        try {
            const response = await fetch(`/api/game/rooms/${currentRoom.id}/paradrop`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    fromProvinceId: sel.fromProvinceId,
                    fromHex: sel.fromHex,
                    toProvinceId: provId,
                    toHex: clickedHex,
                    units: sel.units
                })
            });
            if (response.ok) {
                const data = await response.json();
                applyStateUpdate(data.state);
                showAttackToast('🪂 Десант высажен!');
            } else {
                const err = await response.json();
                showModal('Ошибка', err.error || 'Не удалось');
            }
        } catch (e) { showModal('Ошибка', 'Нет соединения'); }

        actionMode = null;
        window._paradropSelection = null;
        updateMapCursor();
        return;
    }

    if (actionMode === 'move') {
        if (!isMyHex) { showModal('Нельзя', 'Только на свой гекс'); return; }
        if (!selectedHex) return;
        if (clickedHex === selectedHex) { actionMode = null; window._moveSelection = null; updateActionLayer(); updateMapCursor(); return; }
        if (!areNeighbors(selectedHex, clickedHex)) { showModal('Нельзя', 'Только на соседний'); return; }

        const moveSel = window._moveSelection;
        let promise;
        if (moveSel && moveSel.fromHex === selectedHex && moveSel.units) {
            promise = unitAction('move', selectedHex, {
                toHex: clickedHex,
                moveUnits: moveSel.units
            });
        } else {
            promise = unitAction('move', selectedHex, { toHex: clickedHex });
        }

        actionMode = null;
        window._moveSelection = null;
        updateMapCursor();
        updateActionLayer();
        await promise;
        return;
    }
    if (actionMode === 'attack') {
        if (!selectedHex) { showModal('Ошибка', 'Выберите свой гекс'); return; }
        if (!isValidCountry(owner)) { showModal('Нельзя', 'Это море'); return; }
        if (isMyHex) {
            const u = prov.units?.[clickedHex];
            if (u && getUnitCount(u) > 0) {
                selectedHex = clickedHex;
                selectedProvince = provId;
                updateHighlightLayer(); updateActionLayer();
            }
            return;
        }
        if (!areNeighbors(selectedHex, clickedHex)) { showModal('Нельзя', 'Только на соседний'); return; }
        const fromHex = selectedHex;
        actionMode = null;
        updateMapCursor();
        updateActionLayer();
        await executeAttack(fromHex, clickedHex);
        return;
    }
    selectedProvince = provId;
    selectedHex = clickedHex;
    selectProvince(provId);
    updateHighlightLayer();
    updateActionLayer();
    updateAirbaseRangeLayer();
}

// ============ ПАНЕЛЬ ПРОВИНЦИИ ============
function selectProvince(id) {
    if (_selectProvinceRunning) return;
    _selectProvinceRunning = true;
    try {
        selectedProvince = id;
        updateHighlightLayer();
        updateMarkersLayer();
        const prov = gameState.provinces[id];
        if (!prov) return;
        const country = COUNTRIES[prov.country];

        const myPlayer = gameState.players.find(p => p.username === currentUser);
        const myCountry = myPlayer?.country;
        const isMyTurn = gameState.players[gameState.currentPlayerIndex]?.username === currentUser;

        let hexInfo = '';
        if (selectedHex) {
            const hexOwner = getHexOwner(prov, selectedHex);
            const hexOwnerName = COUNTRIES[hexOwner]?.name || hexOwner;
            const u = prov.units?.[selectedHex] || {};
            const cnt = getUnitCount(u);
            const canSeeHex = isHexVisible(selectedHex, myCountry);

            let unitsText = '';
            if (hexOwner === myCountry) {
                unitsText = cnt > 0
                    ? `🪖${u.infantry||0} ⚔️${u.tanks||0} 🎯${u.artillery||0}`
                    : '<i style="color:#666;">нет</i>';
            } else if (canSeeHex) {
                unitsText = cnt > 0
                    ? `🪖${u.infantry||0} ⚔️${u.tanks||0} 🎯${u.artillery||0}`
                    : '<i style="color:#666;">нет</i>';
            } else {
                unitsText = '<i style="color:#666;">🕵️ нет данных</i>';
            }

            let mpLine = '';
            if (hexOwner === myCountry && cnt > 0 && myPlayer) {
                const st = getArmyMP(myPlayer, selectedHex);
                const fatigue = Math.min(Math.round(st.attacks * ATTACK_FATIGUE_PENALTY * 100), 90);
                const oilCostAttack = calcOilCostAttack(u);
                const oilCostMove = calcOilCostMove(u);
                mpLine = `
                    <div style="margin-top: 6px; display: flex; gap: 12px; font-size: 12px; flex-wrap: wrap;">
                        <span>⚡ MP: <b style="color:${st.mp > 0 ? '#22c55e' : '#ef4444'};">${st.mp}/${MP_PER_TURN}</b></span>
                        ${st.attacks > 0 ? `<span>😓 Усталость: <b style="color:#fbbf24;">−${fatigue}%</b></span>` : ''}
                        ${oilCostAttack > 0 ? `<span>⛽ Атака: <b style="color:#f97316;">−${oilCostAttack}</b></span>` : ''}
                        ${oilCostMove > 0 ? `<span>⛽ Движ: <b style="color:#f97316;">−${oilCostMove}</b></span>` : ''}
                    </div>
                `;
            }

            hexInfo = `
                <div style="margin-top: 12px; padding: 10px; background: #0f0f1e; border-radius: 8px; border-left: 3px solid ${COUNTRIES[hexOwner]?.color || '#666'};">
                    <div style="font-size: 11px; color: #a0aec0; margin-bottom: 4px;">Гекс: <b style="color:#e2e8f0;">${selectedHex}</b></div>
                    <div style="font-size: 12px; color: #a0aec0;">
                        Владелец: 
                        ${isValidCountry(hexOwner) ? `
                        <b style="color:${COUNTRIES[hexOwner]?.color || '#fff'}; cursor:pointer; text-decoration:underline; text-decoration-style:dotted;"
                           onclick="openDiplomacyModal('${hexOwner}')"
                           title="Открыть дипломатию">
                            ${hexOwnerName}
                        </b>` : `<b style="color:#718096;">🌊 Море</b>`}
                    </div>
                    <div style="font-size: 12px; color: #a0aec0; margin-top: 4px;">
                        Войска: ${unitsText}
                    </div>
                    ${mpLine}
                </div>
            `;
        }

        let visibleUnits = { infantry: 0, tanks: 0, artillery: 0 };
        Object.entries(prov.units || {}).forEach(([hexKey, u2]) => {
            const hOwner = getHexOwner(prov, hexKey);
            if (hOwner === myCountry) {
                visibleUnits.infantry += u2.infantry || 0;
                visibleUnits.tanks += u2.tanks || 0;
                visibleUnits.artillery += u2.artillery || 0;
            } else if (isHexVisible(hexKey, myCountry)) {
                visibleUnits.infantry += u2.infantry || 0;
                visibleUnits.tanks += u2.tanks || 0;
                visibleUnits.artillery += u2.artillery || 0;
            }
        });

        const hasMyHex = prov.hexes.some(([c, r]) => getHexOwner(prov, `${c},${r}`) === myCountry);
        const anyHexVisible = hasMyHex || prov.hexes.some(([c, r]) => isHexVisible(`${c},${r}`, myCountry));
        const totalUnitsText = anyHexVisible
            ? `🪖${visibleUnits.infantry} ⚔️${visibleUnits.tanks} 🎯${visibleUnits.artillery}`
            : `<i style="color:#666;">🕵️ нет данных</i>`;

        let actionsHtml = '';

        if (selectedHex) {
            const isMyHex = getHexOwner(prov, selectedHex) === myCountry;
            const u = prov.units?.[selectedHex] || {};
            const cnt = getUnitCount(u);
            const st = getArmyMP(myPlayer, selectedHex);
            const noMP = st.mp <= 0;
            const oilCostAttack = calcOilCostAttack(u);
            const oilCostMove = calcOilCostMove(u);

            if (!isMyTurn) {
                actionsHtml = `<div style="margin-top: 12px; padding: 10px; background: rgba(160,174,192,0.15); border-radius: 8px; font-size: 12px; color: #a0aec0; text-align: center;">⏳ Не ваш ход</div>`;
            } else if (isMyHex) {
                const hasAirbase = (prov.airbases || 0) > 0;
                const hasTransports = (myPlayer.airUnits?.transport || 0) >= 3;

                actionsHtml = `
                    <div style="margin-top: 12px; display: flex; flex-direction: column; gap: 6px;">
                        <div style="font-size: 11px; color: #a0aec0; text-transform: uppercase;">
                            Действия ${noMP ? '• <span style="color:#ef4444;">⚡ MP закончились</span>' : ''}
                        </div>
                        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px;">
                            <button class="action-btn" onclick="openRecruitModal('${selectedHex}')">🏭<br><small>Нанять</small></button>
                            <button class="action-btn ${actionMode === 'move' ? 'active' : ''}" 
                                    onclick="toggleMoveMode()" ${noMP ? 'disabled style="opacity:0.5;"' : ''}>
                                🚚<br><small>Двигать${noMP ? ' (⚡0)' : ''}</small>
                            </button>
                            <button class="action-btn ${actionMode === 'attack' ? 'active' : ''}" 
                                    onclick="toggleAttackMode()" 
                                    style="${cnt === 0 || noMP ? 'opacity:0.5;' : 'background:#7f1d1d;'}" 
                                    ${cnt === 0 || noMP ? 'disabled' : ''}>
                                ⚔️<br><small>Атака${noMP ? ' (⚡0)' : ''}</small>
                            </button>
                            ${hasAirbase ? `
                                <button class="action-btn" onclick="openAirModal('${selectedProvince}')">✈️<br><small>Авиация</small></button>
                            ` : ''}
                            ${(hasTransports && cnt > 0) ? `
                                <button class="action-btn" onclick="openParadropModal('${selectedProvince}', '${selectedHex}')">🪂<br><small>Десант</small></button>
                            ` : ''}
                        </div>
                        ${oilCostAttack > 0 ? `<div style="font-size:11px; color:#f97316; text-align:center;">⛽ Атака: −${oilCostAttack} • Движ: −${oilCostMove}</div>` : ''}
                        ${cnt > 0 ? `
                            <div style="font-size: 11px; color: #a0aec0; text-transform: uppercase; margin-top: 6px;">Распустить</div>
                            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px;">
                                ${Object.entries(u).filter(([,n]) => n > 0).map(([t]) => `
                                    <button class="action-btn" onclick="disbandUnit('${selectedHex}', '${t}')">${UNIT_STATS[t].icon}<br><small>−${u[t]}</small></button>
                                `).join('')}
                            </div>
                        ` : ''}
                    </div>
                `;
            } else {
                const hasAir = (myPlayer.airUnits?.fighters || 0) + (myPlayer.airUnits?.bombers || 0) > 0;
                const targetOwner = getHexOwner(prov, selectedHex);

                if (!isValidCountry(targetOwner)) {
                    actionsHtml = `
                        <div style="margin-top: 12px; padding: 12px; background: rgba(59,130,246,0.15); border: 1px solid #3b82f6; border-radius: 8px; font-size: 12px; color: #93c5fd; text-align: center;">
                            🌊 Море — здесь нельзя воевать
                        </div>
                    `;
                } else {
                    const enemy = gameState.players.find(p => p.country === targetOwner);
                    const enemyFighters = enemy?.airUnits?.fighters || 0;
                    const enemyAA = prov.aaguns || 0;

                    const atWar = (gameState.wars || []).some(w =>
                        (w.attacker === myPlayer.country && w.defender === targetOwner) ||
                        (w.defender === myPlayer.country && w.attacker === targetOwner)
                    );

                    const targetName = COUNTRIES[targetOwner]?.name || targetOwner;
                    const targetFlag = COUNTRIES[targetOwner]?.flag || '🏳️';

                    if (!atWar) {
                        actionsHtml = `
                            <div style="margin-top: 12px; padding: 12px; background: rgba(251,191,36,0.15); border: 1px solid #fbbf24; border-radius: 8px; font-size: 12px; color: #fbbf24; text-align: center;">
                                🕊️ Мирное время
                                <div style="font-size: 11px; color: #a0aec0; margin-top: 4px;">
                                    Нельзя атаковать без объявления войны
                                </div>
                            </div>
                            <div style="margin-top: 8px; display: grid; grid-template-columns: 1fr 1fr; gap: 6px;">
                                <button class="action-btn" style="background:#7f1d1d; padding: 12px;" 
                                        onclick="confirmDeclareWar('${targetOwner}')">
                                    ⚔️ Объявить войну
                                    <br><small>${targetFlag} ${targetName}</small>
                                </button>
                                <button class="action-btn" style="background:#4a5568; padding: 12px;" 
                                        onclick="openDiplomacyModal('${targetOwner}')">
                                    🕊️ Дипломатия
                                </button>
                            </div>
                        `;
                    } else {
                        actionsHtml = `
                            <div style="margin-top: 12px; padding: 10px; background: rgba(252,129,129,0.15); border-radius: 8px; font-size: 12px; color: #fc8181; text-align: center;">
                                ⚔️ В состоянии войны с ${targetFlag} ${targetName}
                            </div>
                            ${hasAir ? `
                                <div style="margin-top: 8px;">
                                    <button class="action-btn" style="width:100%; background:#7f1d1d; padding: 12px;" 
                                            onclick="openAirAttackModal('${selectedProvince}', '${selectedHex}')">
                                        ⚔️✈️ Атака с воздуха
                                        <br><small>${myPlayer.airUnits?.fighters || 0}✈️ ${myPlayer.airUnits?.bombers || 0}💣</small>
                                        ${enemyFighters > 0 ? `<br><small style="color:#fbbf24;">Враг: ${enemyFighters}✈️</small>` : ''}
                                        ${enemyAA > 0 ? `<br><small style="color:#fbbf24;">ПВО: ${enemyAA}🎯</small>` : ''}
                                    </button>
                                </div>
                            ` : ''}
                        `;
                    }
                }
            }
        } else {
            actionsHtml = `<div style="margin-top: 12px; padding: 10px; background: rgba(102,126,234,0.15); border-radius: 8px; font-size: 12px; color: #a5b4fc; text-align: center;">👆 Кликните по гексу</div>`;
        }

        const civF = prov.civFactories || 0;
        const milF = prov.milFactories || 0;
        const airF = prov.airFactories || 0;
        const airb = prov.airbases || 0;
        const aa = prov.aaguns || 0;
        const factoriesText = (civF === 0 && milF === 0 && airF === 0 && airb === 0 && aa === 0)
            ? '<i style="color:#666;">нет</i>'
            : [
                civF > 0 ? `🏭 ${civF}` : '',
                milF > 0 ? `⚙️ ${milF}` : '',
                airF > 0 ? `✈️ ${airF}` : '',
                airb > 0 ? `🛬 ${airb}` : '',
                aa > 0 ? `🎯 ${aa}` : ''
            ].filter(Boolean).join(' ');

        provinceInfo.innerHTML = `
            <h3>${country?.flag || ''} ${prov.name}</h3>
            <div class="info-row">
                <span class="label">Страна</span>
                <span class="value" 
                      style="${isValidCountry(prov.country) ? 'cursor:pointer; text-decoration:underline; text-decoration-style:dotted;' : ''}"
                      ${isValidCountry(prov.country) ? `onclick="openDiplomacyModal('${prov.country}')" title="Открыть дипломатию"` : ''}>
                    ${country?.name || (isValidCountry(prov.country) ? prov.country : '🌊 Море')}
                </span>
            </div>
            <div class="info-row"><span class="label">👥 Население</span><span class="value">${formatPopulation(prov.population)}</span></div>
            <div class="info-row"><span class="label">🎁 Ресурс</span><span class="value">${prov.resource || 'none'}</span></div>
            <div class="info-row"><span class="label">🏭 Заводы</span><span class="value">${factoriesText}</span></div>
            <div class="info-row"><span class="label">🪖 Всего войск</span><span class="value" style="font-size: 12px;">
                ${totalUnitsText}
            </span></div>
            ${hexInfo}
            ${actionsHtml}
        `;

        updateAirbaseRangeLayer();
    } catch (error) {
        console.error('❌ selectProvince:', error);
    } finally { _selectProvinceRunning = false; }
}

// ============ ДЕЙСТВИЯ С ВОЙСКАМИ ============
async function unitAction(action, hexKey, extra = {}) {
    if (!currentRoom || !selectedProvince) return;
    try {
        const body = { action, provinceId: selectedProvince, hexKey, ...extra };
        const response = await fetch(`/api/game/rooms/${currentRoom.id}/unit-action`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        if (response.ok) {
            const data = await response.json();
            // 🔥 WS: если ws работает — придёт state-update, иначе применяем сами
            if (!socket || !socket.connected) {
                applyStateUpdate(data.state);
            }
            return true;
        } else {
            const err = await response.json();
            showModal('Ошибка', err.error || 'Не удалось');
            return false;
        }
    } catch (e) { showModal('Ошибка', 'Нет соединения'); return false; }
}

// ============ 🚚 РЕЖИМ ДВИЖЕНИЯ ============
function toggleMoveMode() {
    if (actionMode === 'move') { actionMode = null; updateActionLayer(); updateMapCursor(); return; }
    if (!selectedHex) return;

    const myPlayer = gameState.players.find(p => p.username === currentUser);
    const st = getArmyMP(myPlayer, selectedHex);
    if (st.mp < MP_COST_MOVE) {
        showModal('Нет очков', `У армии закончились очки движения (⚡ ${st.mp}/${MP_PER_TURN})`);
        return;
    }
    const prov = gameState.provinces[selectedProvince];
    if (!prov) return;
    const u = prov.units?.[selectedHex];
    if (!u || getUnitCount(u) === 0) { showModal('Ошибка', 'Нет войск'); return; }

    openMoveModal(selectedHex, u);
}

function openMoveModal(hexKey, units) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay show';
    modal.id = 'moveModal';

    const types = Object.entries(units).filter(([, n]) => n > 0);

    modal.innerHTML = `
        <div class="modal" style="max-width: 480px;">
            <h2>🚚 Перемещение войск</h2>
            <p style="color:#a0aec0; font-size:13px; margin-bottom:15px;">
                Сколько юнитов отправить? Остальные останутся на месте.
            </p>

            <div style="display:flex; flex-direction:column; gap:12px;">
                ${types.map(([type, count]) => `
                    <div style="background:#0f0f1e; padding:12px; border-radius:8px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                            <span style="font-size:14px;">${UNIT_STATS[type].icon} <b>${UNIT_STATS[type].name}</b></span>
                            <span style="font-size:12px; color:#a0aec0;">из ${count}</span>
                        </div>
                        <div style="display:flex; gap:8px; align-items:center;">
                            <input type="range" class="move-slider" data-type="${type}" 
                                   min="0" max="${count}" value="${count}"
                                   style="flex:1;">
                            <input type="number" class="move-number" data-type="${type}" 
                                   min="0" max="${count}" value="${count}"
                                   style="width:60px; padding:6px; background:#1a1a2e; color:#e2e8f0; border:1px solid #2d3748; border-radius:6px; text-align:center;">
                        </div>
                    </div>
                `).join('')}
            </div>

            <div style="margin-top:15px; padding:10px; background:rgba(102,126,234,0.1); border-radius:8px; font-size:12px; color:#a5b4fc;">
                💡 <b>Выбрано:</b> <span id="moveTotal">0</span> юнитов • 
                Из них: <span id="moveBreakdown">—</span>
            </div>

            <div class="buttons" style="margin-top:15px;">
                <button class="btn-secondary" onclick="closeMoveModal()">Отмена</button>
                <button class="btn-primary" onclick="confirmMove('${hexKey}')">🚚 Двигать</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    const sliders = modal.querySelectorAll('.move-slider');
    const numbers = modal.querySelectorAll('.move-number');

    function updateSummary() {
        let total = 0;
        const parts = [];
        sliders.forEach(s => {
            const t = s.dataset.type;
            const v = parseInt(s.value) || 0;
            total += v;
            if (v > 0) parts.push(`${UNIT_STATS[t].icon}${v}`);
        });
        document.getElementById('moveTotal').textContent = total;
        document.getElementById('moveBreakdown').textContent = parts.join(' ') || '—';
    }

    sliders.forEach(slider => {
        const num = modal.querySelector(`.move-number[data-type="${slider.dataset.type}"]`);
        slider.addEventListener('input', () => {
            num.value = slider.value;
            updateSummary();
        });
    });
    numbers.forEach(num => {
        const sl = modal.querySelector(`.move-slider[data-type="${num.dataset.type}"]`);
        num.addEventListener('input', () => {
            let v = parseInt(num.value) || 0;
            const max = parseInt(num.max);
            if (v < 0) v = 0;
            if (v > max) v = max;
            sl.value = v;
            num.value = v;
            updateSummary();
        });
    });

    updateSummary();
}

function closeMoveModal() {
    document.getElementById('moveModal')?.remove();
}

async function confirmMove(hexKey) {
    const modal = document.getElementById('moveModal');
    if (!modal) return;

    const sliders = modal.querySelectorAll('.move-slider');
    const selectedUnits = {};
    let total = 0;
    sliders.forEach(s => {
        const v = parseInt(s.value) || 0;
        if (v > 0) {
            selectedUnits[s.dataset.type] = v;
            total += v;
        }
    });

    if (total === 0) {
        showModal('Ошибка', 'Выберите хотя бы 1 юнит');
        return;
    }

    closeMoveModal();
    actionMode = 'move';
    window._moveSelection = { fromHex: hexKey, units: selectedUnits };
    updateActionLayer();
    updateMapCursor();
    showAttackToast(`🚚 Кликните по соседнему СВОЕМУ гексу (двигаем ${total} юн.)`);
}

// ============ АТАКА ============
function toggleAttackMode() {
    if (actionMode === 'attack') actionMode = null;
    else {
        if (!selectedHex) return;
        const myPlayer = gameState.players.find(p => p.username === currentUser);
        const st = getArmyMP(myPlayer, selectedHex);
        if (st.mp < MP_COST_ATTACK) {
            showModal('Нет очков', `У армии закончились очки движения (⚡ ${st.mp}/${MP_PER_TURN})`);
            return;
        }
        const prov = gameState.provinces[selectedProvince];
        if (!prov) return;
        const u = prov.units?.[selectedHex];
        if (!u || getUnitCount(u) === 0) { showModal('Ошибка', 'Нет войск'); return; }

        const oilCost = calcOilCostAttack(u);
        if (oilCost > 0 && (myPlayer.oilPool || 0) < oilCost) {
            showModal('Мало нефти', `Для атаки нужно ${oilCost}⛽, у вас ${Math.floor(myPlayer.oilPool || 0)}⛽`);
            return;
        }

        actionMode = 'attack';
    }
    updateActionLayer();
    updateMapCursor();
    selectProvinceThrottled(selectedProvince);
    if (actionMode === 'attack') {
        const myPlayer = gameState.players.find(p => p.username === currentUser);
        const st = getArmyMP(myPlayer, selectedHex);
        const fatigue = Math.min(Math.round(st.attacks * ATTACK_FATIGUE_PENALTY * 100), 90);
        const extra = fatigue > 0 ? ` (−${fatigue}% усталость)` : '';
        showAttackToast(`⚔️ Кликните по СОСЕДНЕМУ вражескому гексу${extra}`);
    }
}

async function disbandUnit(hexKey, unitType) {
    const u = UNIT_COSTS[unitType];
    const refundManpower = Math.floor(u.manpowerCost * 0.5);
    const refundSteel = Math.floor(u.steelCost * 0.5);
    if (!confirm(`Распустить 1 ${UNIT_STATS[unitType].name}?\n+${refundManpower}👥 +${refundSteel}🔩 в пул`)) return;
    await unitAction('disband', hexKey, { unitType });
}

// ============ МОДАЛКА НАЙМА ============
function openRecruitModal(hexKey) {
    const prov = gameState.provinces[selectedProvince];
    if (!prov) return;
    const player = gameState.players.find(p => p.username === currentUser);
    if (!player) {
        showModal('Ошибка', 'Вы не участвуете в этой игре');
        return;
    }
    const u = prov.units?.[hexKey] || {};
    const cnt = getUnitCount(u);

    if (cnt >= MAX_UNITS_PER_HEX) {
        showModal('Гекс полон', `Максимум ${MAX_UNITS_PER_HEX} дивизии.`);
        return;
    }

    const income = calculatePlayerIncomeClient(gameState, player);

    const modal = document.createElement('div');
    modal.className = 'modal-overlay show';
    modal.id = 'recruitModal';
    modal.innerHTML = `
        <div class="modal" style="max-width: 620px; max-height: 90vh; overflow-y: auto;">
            <h2>🏭 Производство в гекс ${hexKey}</h2>
            <p style="color:#a0aec0; font-size:13px; margin-bottom:15px;">
                ${prov.name} • Свободно слотов: <b>${MAX_UNITS_PER_HEX - cnt}</b>
            </p>

            <div style="background:#0f0f1e; padding:12px; border-radius:8px; margin-bottom:15px; font-size:13px;">
                <div style="color:#a0aec0; margin-bottom:8px;">📊 Ваши потоки:</div>
                <div style="display:flex; gap:15px; flex-wrap:wrap;">
                    <span>🏗️ <b style="color:#22c55e;">${income.civIC}</b> CIV</span>
                    <span>⚙️ <b style="color:#ef4444;">${income.milIC}</b> MIL</span>
                    <span>👥 <b style="color:#fbbf24;">${formatManpower(player.resources.manpower)}</b></span>
                    <span>📊 Пул: <b style="color:#a5b4fc;">${Math.floor(player.manpowerPool || 0).toLocaleString()} тыс.</b></span>
                </div>
                <div style="display:flex; gap:15px; flex-wrap:wrap; margin-top:6px; font-size:12px;">
                    <span style="color:#a0aec0;">🔩 Сталь: <b style="color:#e2e8f0;">${Math.floor(player.steelPool || 0)}</b> (+${fmt(income.steelProduced)}/ход)</span>
                    <span style="color:#a0aec0;">⛽ Нефть: <b style="color:#e2e8f0;">${Math.floor(player.oilPool || 0)}</b> (+${fmt(income.oilProduced)}/ход)</span>
                </div>
            </div>

            <div style="display: flex; flex-direction: column; gap: 10px;">
                ${Object.entries(UNIT_STATS).map(([type, s]) => {
                    const cost = UNIT_COSTS[type];
                    const canManpower = (player.resources.manpower || 0) >= cost.manpowerCost;
                    const canSteel = (player.steelPool || 0) >= cost.steelCost;
                    const canAfford = canManpower && canSteel;
                    const costParts = [];
                    if (cost.manpowerCost > 0) costParts.push(`👥${cost.manpowerCost}`);
                    if (cost.steelCost > 0) costParts.push(`🔩${cost.steelCost}`);

                    const turns = Math.ceil(cost.buildProgress / Math.max(1, income.milIC));

                    return `
                        <div style="display: flex; align-items: center; gap: 10px; padding: 10px; background: #0f0f1e; border-radius: 8px; ${!canAfford ? 'opacity:0.5;' : ''}">
                            <span style="font-size: 24px;">${s.icon}</span>
                            <div style="flex: 1;">
                                <div style="font-weight: 600;">${s.name}</div>
                                <div style="font-size: 11px; color: #a0aec0;">⚔️${s.attack} 🛡️${s.defense}</div>
                                <div style="font-size: 11px; color: #fbbf24; margin-top:2px;">
                                    ${costParts.join(' ') || '—'} • ⏳~${turns} х.
                                </div>
                            </div>
                            <button class="btn-primary" onclick="quickRecruit('${hexKey}', '${type}')" style="padding: 8px 14px;" ${!canAfford ? 'disabled' : ''}>+ В очередь</button>
                        </div>
                    `;
                }).join('')}
            </div>

            ${player.productionQueue && player.productionQueue.length > 0 ? `
                <div style="margin-top:15px; padding-top:15px; border-top:1px solid #2d3748;">
                    <h3 style="color:#e2e8f0; font-size:14px; margin-bottom:8px;">🛠️ В производстве (${player.productionQueue.length}/5)</h3>
                    ${player.productionQueue.map(item => {
                        const provName = gameState.provinces[item.provinceId]?.name || '?';
                        const icon = UNIT_STATS[item.unitType]?.icon || '';
                        const name = UNIT_STATS[item.unitType]?.name || item.unitType;
                        const stalled = item.stalled ? ` ⚠️ ${item.stalled === 'hex_full' ? 'гекс полон' : 'ждёт'}` : '';
                        return `
                            <div style="padding:6px 8px; background:#0f0f1e; border-radius:6px; margin-bottom:5px; font-size:12px; color:#e2e8f0;">
                                ${icon} ${name} → ${provName}${stalled}
                            </div>
                        `;
                    }).join('')}
                </div>
            ` : ''}

            <div class="buttons">
                <button class="btn-secondary" onclick="closeRecruitModal()">Закрыть</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

function closeRecruitModal() { document.getElementById('recruitModal')?.remove(); }

async function quickRecruit(hexKey, unitType) {
    const ok = await unitAction('recruit', hexKey, { unitType });
    if (ok) {
        closeRecruitModal();
        setTimeout(() => { if (document.getElementById('recruitModal') === null) openRecruitModal(hexKey); }, 50);
    }
}

// ============ АТАКА (executeAttack) ============
async function executeAttack(fromHex, toHex) {
    if (_attackInProgress) return;
    const fromProv = gameState.provinces[selectedProvince];
    if (!fromProv) return;
    const fromUnits = fromProv.units?.[fromHex] || {};
    const toProv = Object.entries(gameState.provinces).find(([id, p]) => {
        const hexSet = new Set(p.hexes.map(([c, r]) => `${c},${r}`));
        return hexSet.has(toHex);
    });
    if (!toProv) return;
    const toUnits = toProv[1].units?.[toHex] || {};
    let atkStr = 0, defStr = 0;
    for (const [t, n] of Object.entries(fromUnits)) atkStr += (n || 0) * UNIT_STATS[t].attack;
    for (const [t, n] of Object.entries(toUnits)) defStr += (n || 0) * UNIT_STATS[t].defense;

    const myPlayer = gameState.players.find(p => p.username === currentUser);
    const st = getArmyMP(myPlayer, fromHex);
    const fatigue = Math.min(st.attacks * ATTACK_FATIGUE_PENALTY, 0.9);
    const fatigueLine = fatigue > 0 ? `\n😓 Усталость: −${Math.round(fatigue * 100)}%` : '';
    const atkFinal = (atkStr * (1 - fatigue)).toFixed(1);
    const oilCost = calcOilCostAttack(fromUnits);
    const oilLine = oilCost > 0 ? `\n⛽ Расход нефти: −${oilCost}` : '';

    if (!confirm(`⚔️ АТАКА\n\nИз: ${fromHex}\nВ: ${toHex}\n\n⚔️ Ваша сила: ${atkFinal}${fatigueLine}${oilLine}\n🛡️ Сила врага: ${defStr.toFixed(1)}\n\nПродолжить?`)) return;
    _attackInProgress = true;
    showAttackToast('⚔️ Атака...');
    animateArrow(fromHex, toHex, async () => {
        try {
            const response = await fetch(`/api/game/rooms/${currentRoom.id}/attack-hex`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fromHex, toHex })
            });
            if (response.ok) {
                const data = await response.json();
                // 🔥 WS: если ws работает — обновится автоматом, иначе применяем
                if (!socket || !socket.connected) {
                    applyStateUpdate(data.state);
                }
                const r = data.result;
                animateResult(toHex, r.captured);
                let msg = '';
                if (r.provinceCaptured) msg = `🎉 Вся провинция!`;
                else if (r.captured) msg = `✅ Гекс захвачен!`;
                else msg = `🛡️ Атака отбита.`;

                const fatigueLine2 = r.fatiguePenalty > 0 ? `\n😓 Усталость: −${r.fatiguePenalty}%` : '';
                const oilLine2 = r.oilCost > 0 ? `\n⛽ Потрачено нефти: ${r.oilCost}` : '';
                showModal('Результат', 
                    `${msg}\n\n⚔️ ${r.attackerStrength} vs 🛡️ ${r.defenderStrength}\nПоддержка: +${r.supportBonus}%${fatigueLine2}${oilLine2}`
                );
                selectedHex = null;
                updateActionLayer();
                updateMapCursor();
                if (selectedProvince) selectProvinceThrottled(selectedProvince);
            } else {
                let errText = 'Не удалось';
                try { const err = await response.json(); errText = err.error || errText; } catch (e) {}
                showModal('Ошибка', errText);
            }
        } catch (e) { showModal('Ошибка', 'Нет соединения'); }
        finally { _attackInProgress = false; }
    });
}

// ============ АНИМАЦИИ ============
function showAttackToast(text) {
    let toast = document.getElementById('attackToast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'attackToast';
        toast.style.cssText = `position: fixed; top: 80px; left: 50%; transform: translateX(-50%); background: rgba(102, 126, 234, 0.95); color: white; padding: 12px 24px; border-radius: 12px; font-size: 14px; font-weight: 600; z-index: 10000; box-shadow: 0 8px 25px rgba(0,0,0,0.5); pointer-events: none; transition: opacity 0.3s; max-width: 80%; text-align: center;`;
        document.body.appendChild(toast);
    }
    toast.textContent = text;
    toast.style.opacity = '1';
    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => { toast.style.opacity = '0'; }, 3000);
}

function animateArrow(fromHex, toHex, onComplete) {
    if (!mapSvg) { if (onComplete) onComplete(); return; }
    const [fx, fy] = fromHex.split(',').map(Number);
    const [tx, ty] = toHex.split(',').map(Number);
    const [fcx, fcy] = hexToPixel(fx, fy);
    const [tcx, tcy] = hexToPixel(tx, ty);
    let layer = mapSvg.querySelector('#animation-layer');
    if (!layer) { layer = document.createElementNS("http://www.w3.org/2000/svg", "g"); layer.id = 'animation-layer'; mapSvg.appendChild(layer); }
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", fcx); line.setAttribute("y1", fcy);
    line.setAttribute("x2", fcx); line.setAttribute("y2", fcy);
    line.setAttribute("stroke", "#fbbf24"); line.setAttribute("stroke-width", "5");
    line.setAttribute("stroke-linecap", "round");
    line.style.filter = "drop-shadow(0 0 8px #fbbf24)";
    layer.appendChild(line);
    const startTime = performance.now();
    function anim(now) {
        const t = Math.min(1, (now - startTime) / 200);
        line.setAttribute("x2", fcx + (tcx - fcx) * t);
        line.setAttribute("y2", fcy + (tcy - fcy) * t);
        if (t < 1) requestAnimationFrame(anim);
        else setTimeout(() => { line.remove(); if (onComplete) onComplete(); }, 50);
    }
    requestAnimationFrame(anim);
}

function animateResult(hexKey, success) {
    if (!mapSvg) return;
    const [hx, hy] = hexKey.split(',').map(Number);
    const [cx, cy] = hexToPixel(hx, hy);
    let layer = mapSvg.querySelector('#animation-layer');
    if (!layer) { layer = document.createElementNS("http://www.w3.org/2000/svg", "g"); layer.id = 'animation-layer'; mapSvg.appendChild(layer); }
    const color = success ? '#22c55e' : '#ef4444';
    const flash = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    flash.setAttribute("cx", cx); flash.setAttribute("cy", cy);
    flash.setAttribute("r", HEX_SIZE * 0.4);
    flash.setAttribute("fill", color);
    flash.style.filter = `drop-shadow(0 0 25px ${color})`;
    layer.appendChild(flash);
    const startTime = performance.now();
    (function anim(now) {
        const t = Math.min(1, (now - startTime) / 700);
        flash.setAttribute("r", HEX_SIZE * 0.4 + t * HEX_SIZE * 3);
        flash.setAttribute("opacity", String(1 - t));
        if (t < 1) requestAnimationFrame(anim); else flash.remove();
    })(performance.now());
    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.setAttribute("x", cx); text.setAttribute("y", cy);
    text.setAttribute("text-anchor", "middle");
    text.setAttribute("font-size", "28"); text.setAttribute("font-weight", "900");
    text.setAttribute("fill", success ? '#22c55e' : '#ef4444');
    text.style.paintOrder = "stroke"; text.style.stroke = "#000"; text.style.strokeWidth = "4px";
    text.textContent = success ? '⚔️' : '🛡️';
    layer.appendChild(text);
    const tStart = performance.now();
    (function animText(now) {
        const t = Math.min(1, (now - tStart) / 1000);
        text.setAttribute("y", cy - t * 40);
        text.setAttribute("opacity", String(1 - t));
        if (t < 1) requestAnimationFrame(animText); else text.remove();
    })(performance.now());
}

function updateMapCursor() {
    if (!mapSvg) return;
    mapSvg.classList.remove("attack-mode", "pan-mode");
    if (actionMode === 'attack') { mapSvg.classList.add("attack-mode"); mapSvg.style.cursor = "crosshair"; }
    else if (actionMode === 'move') mapSvg.style.cursor = "crosshair";
    else if (actionMode === 'paradrop') mapSvg.style.cursor = "crosshair";
    else mapSvg.style.cursor = "default";
}

// ============ ЛОГ / ЛЕГЕНДА / ХОД ============
function renderEventLog() {
    if (!gameState || !gameState.eventLog || gameState.eventLog.length === 0) {
        eventLog.innerHTML = '<div class="log-entry">📭 Пока нет событий</div>';
        return;
    }
    eventLog.innerHTML = gameState.eventLog.slice(-10).reverse().map(e =>
        `<div class="log-entry">[Ход ${e.turn}] ${e.title}: ${e.message}</div>`
    ).join('');
}

function renderLegend() {
    const legend = document.getElementById('mapLegend');
    if (!legend) return;
    legend.innerHTML = `
        <div class="legend-item"><span>🪖</span><span class="legend-label">Пехота (без нефти)</span></div>
        <div class="legend-item"><span>⚔️</span><span class="legend-label">Танк: ${OIL_COST_TANK_MOVE}⛽/движ, ${OIL_COST_TANK_ATTACK}⛽/атака</span></div>
        <div class="legend-item"><span>🎯</span><span class="legend-label">Арт: ${OIL_COST_ARTILLERY_MOVE}⛽/движ, ${OIL_COST_ARTILLERY_ATTACK}⛽/атака</span></div>
        <div class="legend-item"><span>⚡</span><span class="legend-label">MP: ${MP_PER_TURN}/ход</span></div>
        <div class="legend-item"><span>😓</span><span class="legend-label">−${ATTACK_FATIGUE_PENALTY * 100}% за повторную атаку</span></div>
        <div class="legend-item"><span>🏭</span><span class="legend-label">CIV заводы</span></div>
        <div class="legend-item"><span>⚙️</span><span class="legend-label">MIL заводы</span></div>
        <div class="legend-item"><span>✈️</span><span class="legend-label">Истр: ${AIR_STATS.fighters.range} гексов</span></div>
        <div class="legend-item"><span>💣</span><span class="legend-label">Бомб: ${AIR_STATS.bombers.range} гексов</span></div>
        <div class="legend-item"><span>🪂</span><span class="legend-label">Трансп: ${AIR_STATS.transport.range} гексов</span></div>
        <div class="legend-item"><span>🛬</span><span class="legend-label">Аэродромы</span></div>
        <div class="legend-item"><span>🕊️</span><span class="legend-label">Дипломатия (клик по стране)</span></div>
    `;
}

function updateTurnInfo() {
    if (!gameState) return;
    const current = gameState.players[gameState.currentPlayerIndex];
    if (!current) return;

    const isMyTurn = current.username === currentUser;

    turnInfo.textContent = `Ход ${gameState.turn}`;

    if (isMyTurn) {
        currentPlayerInfo.innerHTML = `🎯 <b style="color:#22c55e;">Ваш ход</b>`;
    } else if (current.isAI) {
        currentPlayerInfo.innerHTML = `🤖 Ход: <b style="color:#fbbf24;">${COUNTRIES[current.country]?.name || current.username}</b>`;
    } else {
        currentPlayerInfo.innerHTML = `⏳ Ход: <b style="color:#fbbf24;">${current.username}</b>`;
    }

    endTurnBtn.disabled = !isMyTurn;
    endTurnBtn.textContent = isMyTurn ? '✅ Завершить ход' : '⏳ Ждём...';
}

function updateResourcesBar() {
    const bar = document.getElementById('resourcesBar');
    if (!bar || !gameState) return;

    const player = gameState.players.find(p => p.username === currentUser);
    if (!player) {
        bar.innerHTML = '<span style="color:#718096;">👤 Наблюдатель</span>';
        updateDiplomacyBadge();
        return;
    }

    const income = calculatePlayerIncomeClient(gameState, player);

    bar.innerHTML = `
        <span>👤 <b style="color:#fbbf24;">${player.username}</b> <span style="color:#a0aec0; font-size:11px;">(${COUNTRIES[player.country]?.flag || ''} ${COUNTRIES[player.country]?.name || player.country})</span></span>
        <span>🏗️ CIV: <b style="color:#22c55e;">${income.civIC}</b>
            <span style="font-size:10px; color:#a0aec0;">(из ${income.totalCivFactories}, −${income.consumerGoods} на товары)</span>
        </span>
        <span>⚙️ MIL: <b style="color:#ef4444;">${income.milIC}</b></span>
        <span>👥 Люди: <b style="color:#fbbf24;">${formatManpower(player.resources.manpower)}</b>
            <span style="font-size:10px; color:#22c55e;">+${fmt(income.expectedManpowerGain)} тыс./ход</span>
        </span>
        <span>📊 Пул: <b style="color:#a5b4fc;">${Math.floor(player.manpowerPool || 0).toLocaleString()} тыс.</b>
            <span style="font-size:10px; color:#a0aec0;">(${income.manpowerFromProvinces ? '+' + fmt(income.manpowerFromProvinces) + ' пров.' : ''})</span>
        </span>
        <span style="border-left:1px solid #4a5568; padding-left:15px;">
            🔩 Сталь: <b style="color:#e2e8f0;">${Math.floor(player.steelPool || 0)}</b>
            <span style="font-size:10px; color:#22c55e;">+${fmt(income.steelProduced)}</span>
        </span>
        <span>
            ⛽ Нефть: <b style="color:#e2e8f0;">${Math.floor(player.oilPool || 0)}</b>
            <span style="font-size:10px; color:#22c55e;">+${fmt(income.oilProduced)}</span>
        </span>
        <span style="border-left:1px solid #4a5568; padding-left:15px;">
            🏭 <b>${income.totalFactories}</b>
            (${income.totalCivFactories}🏗️ / ${income.totalMilFactories}⚙️)
            <span style="font-size:10px; color:#a0aec0;">
                [${income.startCiv}+${income.builtCiv} / ${income.startMil}+${income.builtMil}]
            </span>
        </span>
        <span style="border-left:1px solid #4a5568; padding-left:15px;">
            ✈️ Авиация: 
            <b style="color:#22c55e;">${player.airUnits?.fighters || 0}✈️</b>
            <b style="color:#f97316;">${player.airUnits?.bombers || 0}💣</b>
            <b style="color:#a5b4fc;">${player.airUnits?.transport || 0}🪂</b>
        </span>
        ${player.productionQueue?.length ? `<span>🛠️ ${player.productionQueue.length}/5</span>` : ''}
        ${player.airProductionQueue?.length ? `<span>✈️ ${player.airProductionQueue.length}/5</span>` : ''}
        ${player.constructionQueue?.length ? `<span>🏗️ ${player.constructionQueue.length}/3</span>` : ''}  
    `;
    updateDiplomacyBadge();
}

function updateDiplomacyBadge() {
    const btn = document.getElementById('openDiplomacyBtn');
    if (!btn || !gameState) return;

    const me = gameState.players.find(p => p.username === currentUser);
    if (!me) return;

    const myCountry = me.country;
    const incoming = (gameState.diplomaticOffers || []).filter(o =>
        o.to === myCountry && o.status === 'pending'
    );
    const incomingMarket = (gameState.marketOffers || []).filter(o =>
        o.to === myCountry && o.status === 'pending'
    );

    const totalDiplo = incoming.length;
    const totalMarket = incomingMarket.length;

    const diploBadge = totalDiplo > 0
        ? ` <span style="background:#ef4444; color:#fff; border-radius:50%; padding:2px 7px; font-size:11px; margin-left:4px;">${totalDiplo}</span>`
        : '';
    btn.innerHTML = `🕊️ Дипломатия${diploBadge}`;

    const marketBtn = document.getElementById('openMarketBtn');
    if (marketBtn) {
        const marketBadge = totalMarket > 0
            ? ` <span style="background:#ef4444; color:#fff; border-radius:50%; padding:2px 7px; font-size:11px; margin-left:4px;">${totalMarket}</span>`
            : '';
        marketBtn.innerHTML = `💰 Рынок${marketBadge}`;
    }
}

async function endTurn() {
    if (!currentRoom || !gameState) return;
    const current = gameState.players[gameState.currentPlayerIndex];
    if (current.username !== currentUser) { alert('Не ваш ход'); return; }
    try {
        const response = await fetch(`/api/game/rooms/${currentRoom.id}/move`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'end_turn', data: {} })
        });
        if (response.ok) {
            const data = await response.json();
            // 🔥 WS: если ws есть — обновится сам
            if (!socket || !socket.connected) {
                applyStateUpdate(data.state, true);
            }
        } else {
            const err = await response.json();
            alert(err.error || 'Ошибка');
        }
    } catch (e) { alert('Ошибка соединения'); }
}

// ============ МОДАЛКА ============
function showModal(title, text) {
    const titleEl = document.getElementById('modalTitle');
    const textEl = document.getElementById('modalText');
    const modalEl = document.getElementById('modal');
    if (!modalEl || !titleEl || !textEl) {
        let fallback = document.getElementById('__fallbackModal');
        if (!fallback) {
            fallback = document.createElement('div');
            fallback.id = '__fallbackModal';
            fallback.style.cssText = `position: fixed; inset: 0; background: rgba(0,0,0,0.75); z-index: 99999; display: flex; align-items: center; justify-content: center; font-family: 'Segoe UI', sans-serif;`;
            fallback.innerHTML = `<div style="background:#1a1a2e; padding:25px; border-radius:15px; max-width:480px; width:90%; border:2px solid #2d3748; box-shadow:0 20px 60px rgba(0,0,0,0.6);"><h2 style="color:#667eea; margin-bottom:15px; font-size:18px;">—</h2><p style="color:#a0aec0; white-space:pre-wrap; margin-bottom:20px; line-height:1.5;">—</p><div style="display:flex; justify-content:flex-end;"><button class="btn-primary" style="padding:10px 20px; border:none; border-radius:8px; background:#667eea; color:white; cursor:pointer; font-weight:600;">OK</button></div></div>`;
            fallback.querySelector('button').addEventListener('click', () => fallback.remove());
            fallback.addEventListener('click', (e) => { if (e.target === fallback) fallback.remove(); });
            document.body.appendChild(fallback);
        }
        fallback.querySelector('h2').textContent = title;
        fallback.querySelector('p').textContent = text;
        return;
    }
    titleEl.textContent = title;
    textEl.textContent = text;
    modalEl.classList.add('show');
}

function closeModal() {
    const modalEl = document.getElementById('modal');
    if (modalEl) modalEl.classList.remove('show');
    const fb = document.getElementById('__fallbackModal');
    if (fb) fb.remove();
}

// ============ 🕊️ ДИПЛОМАТИЯ ============
function openDiplomacyModal(focusCountry = null) {
    if (!gameState) return;
    const me = gameState.players.find(p => p.username === currentUser);
    if (!me) {
        showModal('Ошибка', 'Вы не участвуете в этой игре');
        return;
    }
    const isMyTurn = gameState.players[gameState.currentPlayerIndex]?.username === currentUser;

    const allCountries = {};
    Object.values(gameState.provinces).forEach(p => {
        if (!isValidCountry(p.country)) return;
        if (isSeaProvince(p)) return;
        allCountries[p.country] = true;
    });
    gameState.players.forEach(p => {
        if (!isValidCountry(p.country)) return;
        allCountries[p.country] = true;
    });
    const myCountry = me.country;

    const wars = (gameState.wars || []).filter(w =>
        isValidCountry(w.attacker) && isValidCountry(w.defender)
    );
    const alliances = (gameState.alliances || []).filter(a =>
        a.members && a.members.every(m => isValidCountry(m))
    );
    const pacts = (gameState.pacts || []).filter(p =>
        isValidCountry(p.a) && isValidCountry(p.b)
    );
    const offers = (gameState.diplomaticOffers || []).filter(o =>
        o.status === 'pending' && isValidCountry(o.from) && isValidCountry(o.to)
    );

    const incoming = offers.filter(o => o.to === myCountry);
    const outgoing = offers.filter(o => o.from === myCountry);

    let countryList = Object.keys(allCountries)
        .filter(c => c !== myCountry)
        .sort((a, b) => (COUNTRIES[a]?.name || a).localeCompare(COUNTRIES[b]?.name || b, 'ru'));

    if (focusCountry && focusCountry !== myCountry && isValidCountry(focusCountry)) {
        countryList = [focusCountry, ...countryList.filter(c => c !== focusCountry)];
    }

    const showOnlyFocus = !!focusCountry && focusCountry !== myCountry && isValidCountry(focusCountry);
    const displayedCountries = showOnlyFocus ? [focusCountry] : countryList;

    function relationBadge(country) {
        const atWar = wars.some(w =>
            (w.attacker === myCountry && w.defender === country) ||
            (w.defender === myCountry && w.attacker === country)
        );
        const allied = alliances.some(a => a.members.includes(myCountry) && a.members.includes(country));
        const pacted = pacts.some(p =>
            (p.a === myCountry && p.b === country) || (p.b === myCountry && p.a === country)
        );
        if (allied) return '<span style="background:#22c55e; color:#fff; padding:3px 10px; border-radius:6px; font-size:11px; font-weight:600;">🤝 Союз</span>';
        if (atWar) return '<span style="background:#ef4444; color:#fff; padding:3px 10px; border-radius:6px; font-size:11px; font-weight:600;">⚔️ Война</span>';
        if (pacted) return '<span style="background:#3b82f6; color:#fff; padding:3px 10px; border-radius:6px; font-size:11px; font-weight:600;">📜 Пакт</span>';
        return '<span style="background:#4a5568; color:#fff; padding:3px 10px; border-radius:6px; font-size:11px; font-weight:600;">— Нейтралитет</span>';
    }

    function countryCard(c) {
        const cInfo = COUNTRIES[c] || { name: c, flag: '🏳️' };
        const player = gameState.players.find(p => p.country === c);
        const atWar = wars.some(w =>
            (w.attacker === myCountry && w.defender === c) ||
            (w.defender === myCountry && w.attacker === c)
        );
        const allied = alliances.some(a => a.members.includes(myCountry) && a.members.includes(c));
        const pacted = pacts.some(p =>
            (p.a === myCountry && p.b === c) || (p.b === myCountry && p.a === c)
        );

        return `
            <div style="background:#0f0f1e; padding:14px; border-radius:10px; border:1px solid #2d3748;">
                <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap; margin-bottom:10px;">
                    <div>
                        <div style="font-size:16px; font-weight:700;">${cInfo.flag} ${cInfo.name}</div>
                        <div style="font-size:12px; color:#a0aec0; margin-top:3px;">
                            ${player ? (player.isAI ? `🤖 ИИ` : `👤 Игрок: ${player.username}`) : '🤖 ИИ-страна'}
                        </div>
                    </div>
                    <div>${relationBadge(c)}</div>
                </div>
                ${isMyTurn ? `
                    <div style="display:flex; flex-wrap:wrap; gap:6px; margin-top:10px;">
                        <button class="btn-secondary" style="padding:8px 14px; font-size:12px;" onclick="diplomacyAction('war', '${c}')">⚔️ Объявить войну</button>
                        <button class="btn-secondary" style="padding:8px 14px; font-size:12px;" onclick="diplomacyAction('peace', '${c}')">🕊️ Предложить мир</button>
                        <button class="btn-secondary" style="padding:8px 14px; font-size:12px;" onclick="diplomacyAction('alliance', '${c}')">🤝 Союз</button>
                        <button class="btn-secondary" style="padding:8px 14px; font-size:12px;" onclick="diplomacyAction('non_aggression', '${c}')">📜 Пакт</button>
                        <button class="btn-secondary" style="padding:8px 14px; font-size:12px;" onclick="openUltimatumModal('${c}')">⚠️ Ультиматум</button>
                        ${allied ? `<button class="btn-secondary" style="padding:8px 14px; font-size:12px; background:#7f1d1d;" onclick="diplomacyAction('break_alliance', '${c}')">💔 Разорвать союз</button>` : ''}
                        ${pacted ? `<button class="btn-secondary" style="padding:8px 14px; font-size:12px; background:#7f1d1d;" onclick="diplomacyAction('break_pact', '${c}')">💔 Разорвать пакт</button>` : ''}
                    </div>
                ` : `
                    <div style="font-size:12px; color:#fbbf24; padding:8px; background:rgba(251,191,36,0.1); border-radius:6px; text-align:center;">
                        ⏳ Не ваш ход — только просмотр
                    </div>
                `}
            </div>
        `;
    }

    const modal = document.createElement('div');
    modal.className = 'modal-overlay show';
    modal.id = 'diplomacyModal';
    modal.dataset.focusCountry = focusCountry || '';
    modal.innerHTML = `
        <div class="modal" style="max-width: 780px; max-height: 90vh; overflow-y: auto;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                <h2 style="margin:0;">🕊️ Дипломатия</h2>
                ${showOnlyFocus ? `<button class="btn-secondary" style="padding:6px 12px; font-size:12px;" onclick="closeDiplomacyModal(); openDiplomacyModal();">🌍 Все страны</button>` : ''}
            </div>
            <p style="color:#a0aec0; font-size:13px; margin-bottom:15px;">
                Ваша страна: <b style="color:#fbbf24;">${COUNTRIES[myCountry]?.flag || ''} ${COUNTRIES[myCountry]?.name || myCountry}</b>
                ${!isMyTurn ? '<span style="color:#fbbf24; margin-left:10px;">⏳ Не ваш ход — можно только просматривать</span>' : ''}
            </p>

            ${incoming.length > 0 ? `
                <div style="background: rgba(251,191,36,0.1); border: 1px solid #fbbf24; border-radius: 10px; padding: 12px; margin-bottom: 15px;">
                    <div style="font-size:12px; color:#fbbf24; text-transform:uppercase; margin-bottom:8px;">📬 Входящие предложения (${incoming.length})</div>
                    ${incoming.map(o => {
                        let descr = '';
                        if (o.type === 'peace') descr = '🕊️ Мирный договор';
                        else if (o.type === 'alliance') descr = '🤝 Союз';
                        else if (o.type === 'non_aggression') descr = '📜 Пакт о ненападении';
                        else if (o.type === 'ultimatum') descr = '⚠️ Ультиматум: отдать провинцию';
                        return `
                            <div style="background:#0f0f1e; padding:10px; border-radius:8px; margin-bottom:6px; display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
                                <div style="font-size:13px;">
                                    <b style="color:#e2e8f0;">${o.fromName}</b>
                                    <span style="color:#a0aec0; font-size:11px;"> (${COUNTRIES[o.from]?.flag || ''} ${COUNTRIES[o.from]?.name || o.from})</span>
                                    <div style="color:#a0aec0; font-size:12px; margin-top:3px;">${descr}</div>
                                </div>
                                <div style="display:flex; gap:6px;">
                                    <button class="btn-primary" style="padding:6px 12px; font-size:12px;" onclick="acceptOffer('${o.id}')">✅ Принять</button>
                                    <button class="btn-secondary" style="padding:6px 12px; font-size:12px;" onclick="declineOffer('${o.id}')">❌ Отклонить</button>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            ` : ''}

            ${outgoing.length > 0 ? `
                <div style="background: rgba(102,126,234,0.1); border: 1px solid #667eea; border-radius: 10px; padding: 12px; margin-bottom: 15px;">
                    <div style="font-size:12px; color:#667eea; text-transform:uppercase; margin-bottom:8px;">📤 Ваши предложения (${outgoing.length})</div>
                    ${outgoing.map(o => {
                        let descr = '';
                        if (o.type === 'peace') descr = '🕊️ Мир';
                        else if (o.type === 'alliance') descr = '🤝 Союз';
                        else if (o.type === 'non_aggression') descr = '📜 Пакт';
                        else if (o.type === 'ultimatum') descr = '⚠️ Ультиматум';
                        return `
                            <div style="background:#0f0f1e; padding:10px; border-radius:8px; margin-bottom:6px; font-size:13px;">
                                ${descr} → <b>${o.toName}</b> <span style="color:#a0aec0; font-size:11px;">(ожидает ответа)</span>
                            </div>
                        `;
                    }).join('')}
                </div>
            ` : ''}

            ${wars.length > 0 ? `
                <div style="background: rgba(239,68,68,0.1); border: 1px solid #ef4444; border-radius: 10px; padding: 12px; margin-bottom: 15px;">
                    <div style="font-size:12px; color:#ef4444; text-transform:uppercase; margin-bottom:8px;">⚔️ Активные войны</div>
                    ${wars.map(w => {
                        const isMine = w.attacker === myCountry || w.defender === myCountry;
                        const opponent = w.attacker === myCountry ? w.defender : w.attacker;
                        return `
                            <div style="background:#0f0f1e; padding:8px; border-radius:8px; margin-bottom:6px; font-size:13px; display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
                                <div>
                                    <b>${w.attackerName}</b> ⚔️ <b>${w.defenderName}</b>
                                    <span style="color:#a0aec0; font-size:11px;"> (с хода ${w.startedTurn})</span>
                                </div>
                                ${isMine && isMyTurn ? `<button class="btn-secondary" style="padding:6px 12px; font-size:12px;" onclick="diplomacyAction('peace', '${opponent}')">🕊️ Мир</button>` : ''}
                            </div>
                        `;
                    }).join('')}
                </div>
            ` : ''}

            ${alliances.length > 0 ? `
                <div style="background: rgba(34,197,94,0.1); border: 1px solid #22c55e; border-radius: 10px; padding: 12px; margin-bottom: 15px;">
                    <div style="font-size:12px; color:#22c55e; text-transform:uppercase; margin-bottom:8px;">🤝 Союзы</div>
                    ${alliances.map(a => {
                        const isMine = a.members.includes(myCountry);
                        const partner = a.members.find(m => m !== myCountry);
                        return `
                            <div style="background:#0f0f1e; padding:8px; border-radius:8px; margin-bottom:6px; font-size:13px; display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
                                <div><b>${a.memberNames?.join(' 🤝 ') || a.members.join(' + ')}</b></div>
                                ${isMine && partner && isMyTurn ? `<button class="btn-secondary" style="padding:6px 12px; font-size:12px;" onclick="diplomacyAction('break_alliance', '${partner}')">💔 Разорвать</button>` : ''}
                            </div>
                        `;
                    }).join('')}
                </div>
            ` : ''}

            ${pacts.length > 0 ? `
                <div style="background: rgba(59,130,246,0.1); border: 1px solid #3b82f6; border-radius: 10px; padding: 12px; margin-bottom: 15px;">
                    <div style="font-size:12px; color:#3b82f6; text-transform:uppercase; margin-bottom:8px;">📜 Пакты о ненападении</div>
                    ${pacts.map(p => {
                        const isMine = p.a === myCountry || p.b === myCountry;
                        const partner = p.a === myCountry ? p.b : p.a;
                        return `
                            <div style="background:#0f0f1e; padding:8px; border-radius:8px; margin-bottom:6px; font-size:13px; display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
                                <div><b>${p.aName || p.a}</b> 📜 <b>${p.bName || p.b}</b></div>
                                ${isMine && isMyTurn ? `<button class="btn-secondary" style="padding:6px 12px; font-size:12px;" onclick="diplomacyAction('break_pact', '${partner}')">💔 Разорвать</button>` : ''}
                            </div>
                        `;
                    }).join('')}
                </div>
            ` : ''}

            <h3 style="color:#e2e8f0; font-size:15px; margin: 20px 0 10px;">
                ${showOnlyFocus ? '🎯 Страна' : '🌍 Все страны'}
            </h3>
            <div style="display:flex; flex-direction:column; gap:8px;">
                ${displayedCountries.map(c => countryCard(c)).join('')}
            </div>

            <div class="buttons" style="margin-top:20px;">
                <button class="btn-secondary" onclick="closeDiplomacyModal()">Закрыть</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

function closeDiplomacyModal() {
    document.getElementById('diplomacyModal')?.remove();
    document.getElementById('ultimatumModal')?.remove();
}

async function confirmDeclareWar(targetCountry) {
    if (!isValidCountry(targetCountry)) {
        showModal('Ошибка', 'Нельзя объявить войну воде');
        return;
    }
    const targetName = COUNTRIES[targetCountry]?.name || targetCountry;
    const targetFlag = COUNTRIES[targetCountry]?.flag || '🏳️';
    
    if (!confirm(`⚔️ ОБЪЯВИТЬ ВОЙНУ?\n\n${targetFlag} ${targetName}\n\nВсе мирные договоры будут разорваны. Unrest +5.`)) {
        return;
    }
    
    await diplomacyAction('war', targetCountry);
}

async function diplomacyAction(action, target, terms) {
    if (!currentRoom || !gameState) return;
    const targetRequired = ['war', 'peace', 'alliance', 'non_aggression', 'ultimatum', 'break_alliance', 'break_pact'];
    if (targetRequired.includes(action) && !isValidCountry(target)) {
        showModal('Ошибка', 'Нельзя взаимодействовать с водой');
        return;
    }
    try {
        const response = await fetch(`/api/game/rooms/${currentRoom.id}/diplomacy`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, target, terms })
        });
        if (response.ok) {
            const data = await response.json();
            if (!socket || !socket.connected) {
                applyStateUpdate(data.state, true);
            }
            const prevModal = document.getElementById('diplomacyModal');
            const wasFocused = prevModal?.dataset?.focusCountry || null;
            closeDiplomacyModal();
            openDiplomacyModal(wasFocused);
            const lastLog = data.state.eventLog?.[data.state.eventLog.length - 1];
            if (lastLog) showAttackToast(`${lastLog.title} ${lastLog.message}`);
        } else {
            const err = await response.json();
            showModal('Ошибка', err.error || 'Не удалось');
        }
    } catch (e) { showModal('Ошибка', 'Нет соединения'); }
}

async function acceptOffer(offerId) {
    await diplomacyAction('accept', null, { offerId });
}

async function declineOffer(offerId) {
    await diplomacyAction('decline', null, { offerId });
}

function openUltimatumModal(targetCountry) {
    if (!isValidCountry(targetCountry)) {
        showModal('Ошибка', 'Нельзя выдвинуть ультиматум воде');
        return;
    }
    const targetProvs = Object.entries(gameState.provinces)
        .filter(([id, p]) => p.country === targetCountry && !isSeaProvince(p))
        .map(([id, p]) => ({ id, name: p.name, isCapital: !!p.isCapital }));

    if (targetProvs.length === 0) {
        showModal('Ошибка', 'У цели нет провинций');
        return;
    }

    const modal = document.createElement('div');
    modal.className = 'modal-overlay show';
    modal.id = 'ultimatumModal';
    modal.innerHTML = `
        <div class="modal" style="max-width:520px; max-height:85vh; overflow-y:auto;">
            <h2>⚠️ Ультиматум ${COUNTRIES[targetCountry]?.name || targetCountry}</h2>
            <p style="color:#a0aec0; font-size:13px; margin-bottom:15px;">
                Потребуйте провинцию. Если откажут — начнётся война.
            </p>
            <div style="display:flex; flex-direction:column; gap:6px; max-height:400px; overflow-y:auto;">
                ${targetProvs.map(p => `
                    <button class="action-btn" style="display:flex; justify-content:space-between; align-items:center; padding:10px 14px; text-align:left;"
                            onclick="submitUltimatum('${targetCountry}', '${p.id}')">
                        <span>${p.isCapital ? '★ ' : ''}<b>${p.name}</b></span>
                    </button>
                `).join('')}
            </div>
            <div class="buttons" style="margin-top:15px;">
                <button class="btn-secondary" onclick="document.getElementById('ultimatumModal').remove()">Отмена</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

async function submitUltimatum(targetCountry, provinceId) {
    document.getElementById('ultimatumModal')?.remove();
    await diplomacyAction('ultimatum', targetCountry, { provinceId });
}

function openEconomyModal() {
    if (!gameState) return;
    const player = gameState.players.find(p => p.username === currentUser);
    if (!player) {
        showModal('Ошибка', 'Вы не участвуете в этой игре');
        return;
    }
    const isMyTurn = gameState.players[gameState.currentPlayerIndex]?.username === currentUser;
    const income = calculatePlayerIncomeClient(gameState, player);

    const milSplit = player.milSplit || { infantry: 40, tanks: 20, artillery: 15, air: 25 };
    const milLines = player.milLines || {
        infantry: { efficiency: 1.0 },
        tanks: { efficiency: 1.0 },
        artillery: { efficiency: 1.0 },
        air: { efficiency: 1.0 }
    };

    const modal = document.createElement('div');
    modal.className = 'modal-overlay show';
    modal.id = 'economyModal';
    modal.innerHTML = `
        <div class="modal" style="max-width: 640px; max-height: 85vh; overflow-y: auto;">
            <h2>🏭 Экономика</h2>

            <div style="margin: 15px 0; background:#0f0f1e; padding:14px; border-radius:8px;">
                <div style="font-size:11px; color:#a0aec0; text-transform:uppercase; margin-bottom:10px;">📊 Потоки в ход</div>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; font-size:13px;">
                    <div>🏗️ CIV: <b style="color:#22c55e;">${income.civIC}</b>
                        <div style="font-size:10px; color:#a0aec0;">из ${income.totalCivFactories} (${income.consumerGoods} на товары)</div>
                    </div>
                    <div>⚙️ MIL: <b style="color:#ef4444;">${income.milIC}</b></div>
                    <div>🔩 Сталь: <b>${Math.floor(player.steelPool || 0)}</b>
                        <span style="color:#22c55e; font-size:11px;">+${fmt(income.steelProduced)}/ход</span>
                    </div>
                    <div>⛽ Нефть: <b>${Math.floor(player.oilPool || 0)}</b>
                        <span style="color:#22c55e; font-size:11px;">+${fmt(income.oilProduced)}/ход</span>
                    </div>
                    <div style="grid-column: span 2; padding-top:8px; border-top:1px solid #2d3748; font-size:12px; color:#a0aec0;">
                        🏭 Заводов: <b style="color:#e2e8f0;">${income.totalFactories}</b>
                        (${income.startCiv}⭐ + ${income.builtCiv}🏗️ = ${income.totalCivFactories} CIV /
                        ${income.startMil}⭐ + ${income.builtMil}⚙️ = ${income.totalMilFactories} MIL)
                    </div>
                </div>
            </div>

            <div style="margin: 15px 0; background:#0f0f1e; padding:14px; border-radius:8px;">
                <div style="font-size:11px; color:#a0aec0; text-transform:uppercase; margin-bottom:10px;">⚙️ Распределение MIL по линиям</div>
                ${[
                    { id: 'infantry', name: 'Пехота', icon: '🪖' },
                    { id: 'tanks', name: 'Танки', icon: '⚔️' },
                    { id: 'artillery', name: 'Артиллерия', icon: '🎯' },
                    { id: 'air', name: 'Авиация', icon: '✈️' }
                ].map(({ id, name, icon }) => {
                    const eff = milLines[id]?.efficiency ?? 1.0;
                    const val = milSplit[id] ?? 0;
                    const effColor = eff > 0.8 ? '#22c55e' : eff > 0.5 ? '#fbbf24' : '#ef4444';
                    return `
                        <div style="margin-bottom:12px;">
                            <div style="display:flex; justify-content:space-between; font-size:13px; margin-bottom:4px;">
                                <span>${icon} ${name}</span>
                                <span>
                                    <b style="color:#a5b4fc;" id="milVal-${id}">${val}%</b>
                                    <span style="color:${effColor}; font-size:11px;">⚙️ ${Math.round(eff * 100)}%</span>
                                </span>
                            </div>
                            <input type="range" class="mil-slider" data-line="${id}" min="0" max="100" value="${val}" style="width:100%;" ${!isMyTurn ? 'disabled' : ''}>
                        </div>
                    `;
                }).join('')}
                <div style="text-align:center; font-size:12px; color:#a0aec0; margin-top:4px;">
                    Сумма: <b id="milSum" style="color:#22c55e;">${milSplit.infantry + milSplit.tanks + milSplit.artillery + (milSplit.air || 0)}%</b>
                </div>
            </div>

            <div style="margin: 15px 0;">
                <h3 style="color:#e2e8f0; font-size:15px; margin-bottom:10px;">🏗️ Строительство (${player.constructionQueue?.length || 0}/3)</h3>
                ${Object.entries(BUILDING_TYPES).map(([type, b]) => {
                    const canAfford = (player.steelPool || 0) >= b.steelCost;
                    const steelText = b.steelCost > 0 ? ` • 🔩 ${b.steelCost}` : '';
                    return `
                        <div style="display:flex; align-items:center; gap:10px; padding:10px; background:#0f0f1e; border-radius:8px; margin-bottom:8px; ${!canAfford ? 'opacity:0.5;' : ''}">
                            <div style="flex:1;">
                                <div style="font-weight:600;">${b.name}</div>
                                <div style="font-size:11px; color:#a0aec0;">
                                    🏗️ ${b.buildTime} очков (при CIV ${income.civIC} → ~${Math.ceil(b.buildTime / Math.max(1, income.civIC))} х.)${steelText}
                                </div>
                            </div>
                            <button class="btn-primary" onclick="openBuildPicker('${type}')" ${!isMyTurn || (player.constructionQueue?.length || 0) >= 3 || !canAfford ? 'disabled' : ''}>Выбрать провинцию</button>
                        </div>
                    `;
                }).join('')}

                ${player.constructionQueue && player.constructionQueue.length > 0 ? `
                    <div style="margin-top:12px;">
                        ${player.constructionQueue.map(item => {
                            const prov = gameState.provinces[item.provinceId];
                            const provName = prov?.name || '?';
                            const icon = item.type === 'civFactory' ? '🏭' :
                                         item.type === 'milFactory' ? '⚙️' :
                                         item.type === 'airFactory' ? '✈️' :
                                         item.type === 'airbase' ? '🛬' : '🎯';
                            const name = BUILDING_TYPES[item.type]?.name || item.type;
                            const pct = Math.round((item.progress / item.totalProgress) * 100);
                            return `
                                <div style="padding:8px; background:#0f0f1e; border-radius:6px; margin-bottom:6px; font-size:12px; color:#e2e8f0;">
                                    ${icon} ${name} → <b>${provName}</b> — ${pct}%
                                </div>
                            `;
                        }).join('')}
                    </div>
                ` : ''}
            </div>

            <div class="buttons">
                <button class="btn-secondary" onclick="closeEconomyModal()">Закрыть</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    const milSliders = modal.querySelectorAll('.mil-slider');
    const milSumEl = document.getElementById('milSum');

    function updateMilSum() {
        let sum = 0;
        milSliders.forEach(s => sum += parseInt(s.value));
        milSumEl.textContent = `${sum}%`;
        milSumEl.style.color = sum === 100 ? '#22c55e' : '#ef4444';
    }

    milSliders.forEach(slider => {
        slider.addEventListener('input', () => {
            const line = slider.dataset.line;
            document.getElementById(`milVal-${line}`).textContent = `${slider.value}%`;
            updateMilSum();
        });
        slider.addEventListener('change', async () => {
            const values = { infantry: 0, tanks: 0, artillery: 0, air: 0 };
            milSliders.forEach(s => values[s.dataset.line] = parseInt(s.value));
            const sum = values.infantry + values.tanks + values.artillery + values.air;
            if (sum !== 100) {
                showModal('Ошибка', `Сумма распределения MIL должна быть ровно 100% (сейчас ${sum}%)`);
                return;
            }
            await setMilSplit(values.infantry, values.tanks, values.artillery, values.air);
        });
    });
}

function closeEconomyModal() { document.getElementById('economyModal')?.remove(); }

// ============ 🏗️ ВЫБОР ПРОВИНЦИИ ДЛЯ СТРОЙКИ ============
function openBuildPicker(buildingType) {
    if (!gameState) return;
    const player = gameState.players.find(p => p.username === currentUser);
    if (!player) return;

    const myProvs = Object.entries(gameState.provinces)
        .filter(([id, p]) => p.country === player.country && !isSeaProvince(p))
        .map(([id, p]) => ({
            id, name: p.name,
            civ: p.civFactories || 0,
            mil: p.milFactories || 0,
            air: p.airFactories || 0,
            airbases: p.airbases || 0,
            aaguns: p.aaguns || 0,
            pop: p.population || 0,
            isCapital: !!p.isCapital
        }))
        .sort((a, b) => (b.civ + b.mil) - (a.civ + a.mil));

    if (myProvs.length === 0) {
        showModal('Нет провинций', 'У вас нет провинций для строительства');
        return;
    }

    const b = BUILDING_TYPES[buildingType];

    const modal = document.createElement('div');
    modal.className = 'modal-overlay show';
    modal.id = 'buildPickerModal';
    modal.innerHTML = `
        <div class="modal" style="max-width: 560px; max-height: 85vh; overflow-y: auto;">
            <h2>${b.name} — куда строить?</h2>
            <p style="color:#a0aec0; font-size:13px; margin-bottom:15px;">
                Выбери провинцию, где будет построено здание. После завершения оно появится там.
            </p>

            <div style="display:flex; flex-direction:column; gap:6px;">
                ${myProvs.map(p => `
                    <button class="action-btn" style="display:flex; justify-content:space-between; align-items:center; padding:10px 14px; text-align:left;"
                            onclick="startBuild('${buildingType}', '${p.id}')">
                        <span>
                            ${p.isCapital ? '★ ' : ''}<b>${p.name}</b>
                            <span style="color:#a0aec0; font-size:11px; margin-left:8px;">
                                👥${(p.pop || 0).toFixed(1)} млн
                            </span>
                        </span>
                        <span style="font-size:11px; color:#a0aec0;">
                            ${p.civ > 0 ? `🏭${p.civ}` : ''}
                            ${p.mil > 0 ? ` ⚙️${p.mil}` : ''}
                            ${p.air > 0 ? ` ✈️${p.air}` : ''}
                            ${p.airbases > 0 ? ` 🛬${p.airbases}` : ''}
                            ${p.aaguns > 0 ? ` 🎯${p.aaguns}` : ''}
                            ${p.civ === 0 && p.mil === 0 && p.air === 0 && p.airbases === 0 && p.aaguns === 0 ? 'пусто' : ''}
                        </span>
                    </button>
                `).join('')}
            </div>

            <div class="buttons" style="margin-top:15px;">
                <button class="btn-secondary" onclick="closeBuildPicker()">Отмена</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

function closeBuildPicker() {
    document.getElementById('buildPickerModal')?.remove();
}

async function setMilSplit(infantry, tanks, artillery, air = 0) {
    if (!currentRoom) return;
    try {
        const response = await fetch(`/api/game/rooms/${currentRoom.id}/mil-split`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ infantry, tanks, artillery, air })
        });
        if (response.ok) {
            const data = await response.json();
            if (!socket || !socket.connected) applyStateUpdate(data.state);
        } else {
            const err = await response.json();
            showModal('Ошибка', err.error || 'Не удалось');
        }
    } catch (e) { showModal('Ошибка', 'Нет соединения'); }
}

async function startBuild(buildingType, provinceId) {
    if (!currentRoom) return;
    try {
        const response = await fetch(`/api/game/rooms/${currentRoom.id}/build`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ buildingType, provinceId })
        });
        if (response.ok) {
            const data = await response.json();
            if (!socket || !socket.connected) applyStateUpdate(data.state);
            closeBuildPicker();
            closeEconomyModal();
            openEconomyModal();
        } else {
            const err = await response.json();
            alert(err.error || 'Ошибка');
        }
    } catch (e) { alert('Ошибка'); }
}

// ============ 💰 РЫНОК ============
function countCivFactories(state, player) {
    let c = 0;
    Object.values(state.provinces).forEach(p => {
        if (p.country === player.country) c += p.civFactories || 0;
    });
    return c;
}
function countMilFactories(state, player) {
    let c = 0;
    Object.values(state.provinces).forEach(p => {
        if (p.country === player.country) c += p.milFactories || 0;
    });
    return c;
}

function openMarketModal() {
    if (!gameState) return;
    const me = gameState.players.find(p => p.username === currentUser);
    if (!me) { showModal('Ошибка', 'Вы не участвуете в этой игре'); return; }
    const isMyTurn = gameState.players[gameState.currentPlayerIndex]?.username === currentUser;

    const offers = (gameState.marketOffers || []).filter(o =>
        (o.status === 'open' && isValidCountry(o.from)) || 
        (o.status === 'pending' && o.to === me.country && isValidCountry(o.from))
    );
    const myOffers = (gameState.marketOffers || []).filter(o =>
        o.from === me.country && (o.status === 'open' || o.status === 'pending')
    );
    const contracts = (gameState.activeContracts || []).filter(c =>
        !c.cancelled && (c.a === me.country || c.b === me.country) &&
        isValidCountry(c.a) && isValidCountry(c.b)
    );

    let steelProduced = 0, oilProduced = 0;
    Object.values(gameState.provinces).forEach(prov => {
        if (prov.country !== me.country) return;
        const res = PROVINCE_RESOURCES[prov.resource] || PROVINCE_RESOURCES.none;
        steelProduced += res.steel || 0;
        oilProduced += res.oil || 0;
    });

    const civTotal = countCivFactories(gameState, me);
    const milTotal = countMilFactories(gameState, me);
    const civFree = Math.max(0, civTotal - (me.civFactoriesLeased || 0));
    const milFree = Math.max(0, milTotal - (me.milFactoriesLeased || 0));

    const allCountries = {};
    Object.values(gameState.provinces).forEach(p => {
        if (isValidCountry(p.country) && !isSeaProvince(p)) allCountries[p.country] = true;
    });
    gameState.players.forEach(p => {
        if (isValidCountry(p.country)) allCountries[p.country] = true;
    });
    const tradePartners = Object.keys(allCountries).filter(c => c !== me.country && isValidCountry(c));

    const modal = document.createElement('div');
    modal.className = 'modal-overlay show';
    modal.id = 'marketModal';
    modal.innerHTML = `
        <div class="modal" style="max-width: 820px; max-height: 90vh; overflow-y: auto;">
            <h2>💰 Рынок</h2>
            <p style="color:#a0aec0; font-size:13px; margin-bottom:15px;">
                Ваша страна: <b style="color:#fbbf24;">${COUNTRIES[me.country]?.flag || ''} ${COUNTRIES[me.country]?.name || me.country}</b>
                • Избыток: <b style="color:#e2e8f0;">${fmt(steelProduced)}🔩</b>, <b style="color:#e2e8f0;">${fmt(oilProduced)}⛽</b>
                • Свободно: <b style="color:#22c55e;">${civFree}🏭</b>${me.civFactoriesLeased ? ` <span style="color:#a0aec0;">(сдано ${me.civFactoriesLeased})</span>` : ''},
  <b style="color:#ef4444;">${milFree}⚙️</b>${me.milFactoriesLeased ? ` <span style="color:#a0aec0;">(сдано ${me.milFactoriesLeased})</span>` : ''}
            </p>

            ${!isMyTurn ? `<div style="background:rgba(251,191,36,0.1); border:1px solid #fbbf24; border-radius:8px; padding:10px; margin-bottom:15px; font-size:12px; color:#fbbf24;">⏳ Не ваш ход — можно только просматривать</div>` : ''}

            <div style="background:#0f0f1e; padding:14px; border-radius:10px; margin-bottom:15px;">
                <div style="font-size:12px; color:#a0aec0; text-transform:uppercase; margin-bottom:10px;">📤 Создать предложение</div>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                    <label style="font-size:12px; color:#a0aec0;">
                        Кому:
                        <select id="marketTo" style="width:100%; margin-top:4px; padding:8px; background:#1a1a2e; color:#e2e8f0; border:1px solid #2d3748; border-radius:6px;">
                            <option value="open">🌍 Всем (открытое)</option>
                            ${tradePartners.map(c => `<option value="${c}">${COUNTRIES[c]?.flag || ''} ${COUNTRIES[c]?.name || c}</option>`).join('')}
                        </select>
                    </label>
                    <label style="font-size:12px; color:#a0aec0;">
                        Даю стали (🔩):
                        <input type="number" id="marketSteel" min="0" max="${Math.floor(steelProduced)}" value="0" style="width:100%; margin-top:4px; padding:8px; background:#1a1a2e; color:#e2e8f0; border:1px solid #2d3748; border-radius:6px;">
                    </label>
                    <label style="font-size:12px; color:#a0aec0;">
                        Даю нефти (⛽):
                        <input type="number" id="marketOil" min="0" max="${Math.floor(oilProduced)}" value="0" style="width:100%; margin-top:4px; padding:8px; background:#1a1a2e; color:#e2e8f0; border:1px solid #2d3748; border-radius:6px;">
                    </label>
                    <label style="font-size:12px; color:#a0aec0;">
                        Прошу CIV (🏭):
                        <input type="number" id="marketCiv" min="0" max="${civFree}" value="0" style="width:100%; margin-top:4px; padding:8px; background:#1a1a2e; color:#e2e8f0; border:1px solid #2d3748; border-radius:6px;">
                    </label>
                    <label style="font-size:12px; color:#a0aec0;">
                        Прошу MIL (⚙️):
                        <input type="number" id="marketMil" min="0" max="${milFree}" value="0" style="width:100%; margin-top:4px; padding:8px; background:#1a1a2e; color:#e2e8f0; border:1px solid #2d3748; border-radius:6px;">
                    </label>
                </div>
                <button class="btn-primary" style="margin-top:12px;" onclick="submitMarketOffer()" ${!isMyTurn ? 'disabled' : ''}>📨 Отправить предложение</button>
            </div>

            ${myOffers.length > 0 ? `
                <div style="background:rgba(102,126,234,0.1); border:1px solid #667eea; border-radius:10px; padding:12px; margin-bottom:15px;">
                    <div style="font-size:12px; color:#667eea; text-transform:uppercase; margin-bottom:8px;">📤 Ваши предложения (${myOffers.length})</div>
                    ${myOffers.map(o => `
                        <div style="background:#0f0f1e; padding:10px; border-radius:8px; margin-bottom:6px; display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
                            <div style="font-size:13px;">
                                ${o.giveSteel > 0 ? `${o.giveSteel}🔩 ` : ''}${o.giveOil > 0 ? `${o.giveOil}⛽ ` : ''}
                                → 
                                ${o.wantCivFactory > 0 ? `${o.wantCivFactory}🏭 ` : ''}${o.wantMilFactory > 0 ? `${o.wantMilFactory}⚙️ ` : ''}
                                <span style="color:#a0aec0; font-size:11px;">(${o.to === 'open' ? 'всем' : '→ ' + (COUNTRIES[o.to]?.name || o.to)})</span>
                            </div>
                            <button class="btn-secondary" style="padding:6px 12px; font-size:12px;" onclick="cancelMarketOffer('${o.id}')">❌ Отозвать</button>
                        </div>
                    `).join('')}
                </div>
            ` : ''}

            ${offers.length > 0 ? `
                <div style="background:rgba(251,191,36,0.1); border:1px solid #fbbf24; border-radius:10px; padding:12px; margin-bottom:15px;">
                    <div style="font-size:12px; color:#fbbf24; text-transform:uppercase; margin-bottom:8px;">📬 Входящие предложения (${offers.length})</div>
                    ${offers.map(o => `
                        <div style="background:#0f0f1e; padding:10px; border-radius:8px; margin-bottom:6px; display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
                            <div style="font-size:13px;">
                                <b style="color:#e2e8f0;">${o.fromName}</b>
                                <span style="color:#a0aec0; font-size:11px;">(${COUNTRIES[o.from]?.flag || ''} ${COUNTRIES[o.from]?.name || o.from})</span>
                                <div style="margin-top:4px;">
                                    Даёт: ${o.giveSteel > 0 ? `${o.giveSteel}🔩 ` : ''}${o.giveOil > 0 ? `${o.giveOil}⛽ ` : ''}
                                    Хочет: ${o.wantCivFactory > 0 ? `${o.wantCivFactory}🏭 ` : ''}${o.wantMilFactory > 0 ? `${o.wantMilFactory}⚙️ ` : ''}
                                </div>
                            </div>
                            ${isMyTurn ? `
                                <div style="display:flex; gap:6px;">
                                    <button class="btn-primary" style="padding:6px 12px; font-size:12px;" onclick="acceptMarketOffer('${o.id}')">✅ Принять</button>
                                    <button class="btn-secondary" style="padding:6px 12px; font-size:12px;" onclick="declineMarketOffer('${o.id}')">❌ Отклонить</button>
                                </div>
                            ` : '<span style="color:#a0aec0; font-size:12px;">⏳ Не ваш ход</span>'}
                        </div>
                    `).join('')}
                </div>
            ` : ''}

            ${contracts.length > 0 ? `
                <div style="background:rgba(34,197,94,0.1); border:1px solid #22c55e; border-radius:10px; padding:12px; margin-bottom:15px;">
                    <div style="font-size:12px; color:#22c55e; text-transform:uppercase; margin-bottom:8px;">📜 Активные контракты (${contracts.length})</div>
                    ${contracts.map(c => {
                        const isSeller = c.a === me.country;
                        const otherName = isSeller ? c.bName : c.aName;
                        return `
                            <div style="background:#0f0f1e; padding:10px; border-radius:8px; margin-bottom:6px; display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
                                <div style="font-size:13px;">
                                    ${isSeller ? '📤 Вы даёте' : '📥 Вы получаете'}:
                                    ${c.aGivesSteel > 0 ? `${c.aGivesSteel}🔩/ход ` : ''}${c.aGivesOil > 0 ? `${c.aGivesOil}⛽/ход ` : ''}
                                    ${c.bGivesCiv > 0 ? `→ ${c.bGivesCiv}🏭 ` : ''}${c.bGivesMil > 0 ? `→ ${c.bGivesMil}⚙️ ` : ''}
                                    <span style="color:#a0aec0; font-size:11px;">с ${otherName}</span>
                                </div>
                                ${isMyTurn ? `<button class="btn-secondary" style="padding:6px 12px; font-size:12px; background:#7f1d1d;" onclick="cancelMarketContract('${c.id}')">💔 Разорвать</button>` : ''}
                            </div>
                        `;
                    }).join('')}
                </div>
            ` : ''}

            <div style="background:#0f0f1e; padding:14px; border-radius:10px; margin-bottom:15px;">
                <div style="font-size:12px; color:#a0aec0; text-transform:uppercase; margin-bottom:10px;">🚫 Эмбарго</div>
                <div style="font-size:12px; color:#a0aec0; margin-bottom:8px;">
                    ${(me.tradeEmbargo || []).length > 0
                        ? `Активно против: ${(me.tradeEmbargo || []).map(c => COUNTRIES[c]?.name || c).join(', ')}`
                        : 'Нет активных эмбарго'}
                </div>
                ${isMyTurn ? `
                    <div style="display:flex; gap:6px; flex-wrap:wrap;">
                        ${tradePartners.map(c => {
                            const isEmbargoed = (me.tradeEmbargo || []).includes(c);
                            return `<button class="btn-secondary" style="padding:6px 10px; font-size:11px; ${isEmbargoed ? 'background:#7f1d1d;' : ''}"
                                onclick="toggleMarketEmbargo('${c}', ${!isEmbargoed})">
                                ${isEmbargoed ? '✅ Снять' : '🚫'} ${COUNTRIES[c]?.flag || ''} ${COUNTRIES[c]?.name || c}
                            </button>`;
                        }).join('')}
                    </div>
                ` : ''}
            </div>

            <div class="buttons">
                <button class="btn-secondary" onclick="closeMarketModal()">Закрыть</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

function closeMarketModal() { document.getElementById('marketModal')?.remove(); }

async function marketAction(action, data) {
    if (!currentRoom) return false;
    if (data && data.to && data.to !== 'open' && !isValidCountry(data.to)) {
        showModal('Ошибка', 'Нельзя торговать с водой');
        return false;
    }
    if (data && data.target && !isValidCountry(data.target)) {
        showModal('Ошибка', 'Нельзя взаимодействовать с водой');
        return false;
    }
    try {
        const response = await fetch(`/api/game/rooms/${currentRoom.id}/market`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, data })
        });
        if (response.ok) {
            const res = await response.json();
            if (!socket || !socket.connected) applyStateUpdate(res.state);
            return true;
        } else {
            const err = await response.json();
            showModal('Ошибка', err.error || 'Не удалось');
            return false;
        }
    } catch (e) { showModal('Ошибка', 'Нет соединения'); return false; }
}

async function submitMarketOffer() {
    const to = document.getElementById('marketTo').value;
    const giveSteel = parseInt(document.getElementById('marketSteel').value) || 0;
    const giveOil = parseInt(document.getElementById('marketOil').value) || 0;
    const wantCivFactory = parseInt(document.getElementById('marketCiv').value) || 0;
    const wantMilFactory = parseInt(document.getElementById('marketMil').value) || 0;

    if (giveSteel === 0 && giveOil === 0) { showModal('Ошибка', 'Нужно что-то продавать'); return; }
    if (wantCivFactory === 0 && wantMilFactory === 0) { showModal('Ошибка', 'Нужно что-то просить'); return; }

    const ok = await marketAction('create', { to, giveSteel, giveOil, wantCivFactory, wantMilFactory });
    if (ok) { closeMarketModal(); openMarketModal(); }
}
async function acceptMarketOffer(offerId) {
    const ok = await marketAction('accept', { offerId });
    if (ok) { closeMarketModal(); openMarketModal(); showAttackToast('✅ Сделка заключена!'); }
}
async function declineMarketOffer(offerId) {
    const ok = await marketAction('decline', { offerId });
    if (ok) { closeMarketModal(); openMarketModal(); }
}
async function cancelMarketOffer(offerId) {
    if (!confirm('Отозвать предложение?')) return;
    const ok = await marketAction('cancel_offer', { offerId });
    if (ok) { closeMarketModal(); openMarketModal(); }
}
async function cancelMarketContract(contractId) {
    if (!confirm('Разорвать контракт? Unrest +10!')) return;
    const ok = await marketAction('cancel_contract', { contractId });
    if (ok) { closeMarketModal(); openMarketModal(); showAttackToast('💔 Контракт расторгнут'); }
}
async function toggleMarketEmbargo(target, enable) {
    const ok = await marketAction('embargo', { target, enable });
    if (ok) { closeMarketModal(); openMarketModal(); }
}

// ============ ✈️ АВИАЦИЯ ============
function openAirModal(provinceId) {
    if (!gameState) return;
    const player = gameState.players.find(p => p.username === currentUser);
    if (!player) return;

    const prov = gameState.provinces[provinceId];
    if (!prov) return;

    const airUnits = player.airUnits || { fighters: 0, bombers: 0, transport: 0 };
    const airQueue = player.airProductionQueue || [];

    const modal = document.createElement('div');
    modal.className = 'modal-overlay show';
    modal.id = 'airModal';
    modal.innerHTML = `
        <div class="modal" style="max-width: 700px; max-height: 90vh; overflow-y: auto;">
            <h2>✈️ Авиация</h2>
            <p style="color:#a0aec0; font-size:13px; margin-bottom:15px;">
                ${prov.name} • Аэродромы: <b>${prov.airbases || 0}</b> • ПВО: <b>${prov.aaguns || 0}</b> • Авиазаводы: <b>${prov.airFactories || 0}</b>
            </p>

            <div style="background:#0f0f1e; padding:14px; border-radius:10px; margin-bottom:15px;">
                <div style="font-size:12px; color:#a0aec0; text-transform:uppercase; margin-bottom:10px;">📊 Ваша авиация</div>
                <div style="display:flex; gap:20px; font-size:14px; flex-wrap:wrap;">
                    <span>✈️ Истребители: <b style="color:#22c55e;">${airUnits.fighters}</b> <span style="color:#a0aec0; font-size:11px;">(радиус ${AIR_STATS.fighters.range})</span></span>
                    <span>💣 Бомбардировщики: <b style="color:#f97316;">${airUnits.bombers}</b> <span style="color:#a0aec0; font-size:11px;">(радиус ${AIR_STATS.bombers.range})</span></span>
                    <span>🪂 Транспортники: <b style="color:#a5b4fc;">${airUnits.transport}</b> <span style="color:#a0aec0; font-size:11px;">(радиус ${AIR_STATS.transport.range})</span></span>
                </div>
            </div>

            ${(prov.airbases || 0) === 0 ? `
                <div style="background:rgba(239,68,68,0.15); border:1px solid #ef4444; border-radius:8px; padding:10px; margin-bottom:15px; font-size:12px; color:#fc8181;">
                    ⚠️ Нет аэродрома в этой провинции. Постройте 🛬 Аэродром для производства авиации.
                </div>
            ` : ''}

            <h3 style="color:#e2e8f0; font-size:15px; margin-bottom:10px;">🏭 Производство (${airQueue.length}/5)</h3>
            ${Object.entries(AIR_STATS).map(([type, s]) => {
                const canAfford = (player.steelPool || 0) >= s.cost
                              && (player.resources.manpower || 0) >= s.manpower
                              && (player.oilPool || 0) >= s.oil * 5;
                const haveAirbase = (prov.airbases || 0) > 0;
                const disabled = !canAfford || !haveAirbase;
                return `
                    <div style="display:flex; align-items:center; gap:10px; padding:12px; background:#0f0f1e; border-radius:8px; margin-bottom:8px; ${disabled ? 'opacity:0.5;' : ''}">
                        <span style="font-size:24px;">${s.icon}</span>
                        <div style="flex:1;">
                            <div style="font-weight:600;">${s.name}</div>
                            <div style="font-size:11px; color:#a0aec0;">⚔️${s.attack} 🛡️${s.defense} 🎯${s.range} гексов</div>
                            <div style="font-size:11px; color:#fbbf24;">🔩${s.cost} 👥${s.manpower} ⛽${s.oil}/ход</div>
                        </div>
                        <button class="btn-primary" onclick="recruitAir('${type}', '${provinceId}')" ${disabled ? 'disabled' : ''}>+ Произвести</button>
                    </div>
                `;
            }).join('')}

            ${airQueue.length > 0 ? `
                <div style="margin-top:15px; padding-top:15px; border-top:1px solid #2d3748;">
                    <h3 style="color:#e2e8f0; font-size:14px; margin-bottom:8px;">🛠️ В производстве</h3>
                    ${airQueue.map(item => {
                        const air = AIR_STATS[item.airType];
                        const pct = Math.round((item.progress / item.totalProgress) * 100);
                        return `
                            <div style="padding:6px 8px; background:#0f0f1e; border-radius:6px; margin-bottom:5px; font-size:12px; color:#e2e8f0;">
                                ${air.icon} ${air.name} — ${pct}%
                            </div>
                        `;
                    }).join('')}
                </div>
            ` : ''}

            <div class="buttons" style="margin-top:15px;">
                <button class="btn-secondary" onclick="closeAirModal()">Закрыть</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

function closeAirModal() { document.getElementById('airModal')?.remove(); }

async function recruitAir(airType, provinceId) {
    if (!currentRoom) return;
    try {
        const response = await fetch(`/api/game/rooms/${currentRoom.id}/air-recruit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ airType, provinceId })
        });
        if (response.ok) {
            const data = await response.json();
            if (!socket || !socket.connected) applyStateUpdate(data.state);
            closeAirModal();
            openAirModal(provinceId);
        } else {
            const err = await response.json();
            showModal('Ошибка', err.error || 'Не удалось');
        }
    } catch (e) { showModal('Ошибка', 'Нет соединения'); }
}

// ============ ⚔️✈️ ВОЗДУШНАЯ АТАКА ============
function openAirAttackModal(provinceId, hexKey) {
    if (!gameState) return;
    const player = gameState.players.find(p => p.username === currentUser);
    if (!player) return;

    const prov = gameState.provinces[provinceId];
    if (!prov) return;

    const fighters = player.airUnits?.fighters || 0;
    const bombers = player.airUnits?.bombers || 0;
    const totalAir = fighters + bombers;

    if (totalAir === 0) {
        showModal('Нет авиации', 'У вас нет истребителей или бомбардировщиков');
        return;
    }

    const targetCountry = prov.hexOwner?.[hexKey] || prov.country;
    if (!isValidCountry(targetCountry)) {
        showModal('Ошибка', 'Это море — нельзя атаковать');
        return;
    }
    const enemy = gameState.players.find(p => p.country === targetCountry);
    const enemyFighters = enemy?.airUnits?.fighters || 0;

    const oilCost = 5 * totalAir;
    const canAfford = (player.oilPool || 0) >= oilCost;

    const groundUnits = prov.units?.[hexKey] || {};
    const groundCount = Object.values(groundUnits).reduce((s, n) => s + n, 0);

    const enemyAA = prov.aaguns || 0;

    const myAirbases = [];
    Object.entries(gameState.provinces).forEach(([id, p]) => {
        if (p.country === player.country && (p.airbases || 0) > 0) {
            (p.hexes || []).forEach(([c, r]) => myAirbases.push(`${c},${r}`));
        }
    });

    const maxRange = Math.max(
        fighters > 0 ? AIR_STATS.fighters.range : 0,
        bombers > 0 ? AIR_STATS.bombers.range : 0
    );

    let canReach = false;
    let minDist = 999;
    for (const abHex of myAirbases) {
        const d = hexDistanceStr(abHex, hexKey);
        if (d <= maxRange && d < minDist) {
            canReach = true;
            minDist = d;
        }
    }

    const modal = document.createElement('div');
    modal.className = 'modal-overlay show';
    modal.id = 'airAttackModal';
    modal.innerHTML = `
        <div class="modal" style="max-width: 560px;">
            <h2>⚔️✈️ Воздушная атака</h2>
            <p style="color:#a0aec0; font-size:13px; margin-bottom:15px;">
                Цель: <b style="color:#fbbf24;">${prov.name}</b> • Гекс <b>${hexKey}</b><br>
                Владелец: <b>${COUNTRIES[targetCountry]?.flag || ''} ${COUNTRIES[targetCountry]?.name || targetCountry}</b>
            </p>

            <div style="background:#0f0f1e; padding:14px; border-radius:10px; margin-bottom:15px; font-size:13px;">
                <div style="color:#a0aec0; margin-bottom:10px; text-transform:uppercase; font-size:11px;">📊 Ваша авиация</div>
                <div style="display:flex; gap:20px; flex-wrap:wrap;">
                    <span>✈️ Истребители: <b style="color:#22c55e;">${fighters}</b></span>
                    <span>💣 Бомбардировщики: <b style="color:#f97316;">${bombers}</b></span>
                </div>
                <div style="margin-top:8px; font-size:12px;">
                    <span style="color:#f97316;">⛽ Расход нефти: −${oilCost} (у вас ${Math.floor(player.oilPool || 0)})</span>
                </div>
            </div>

            <div style="background:#0f0f1e; padding:14px; border-radius:10px; margin-bottom:15px; font-size:13px;">
                <div style="color:#a0aec0; margin-bottom:10px; text-transform:uppercase; font-size:11px;">🎯 Цель</div>
                <div style="display:flex; flex-direction:column; gap:6px; font-size:12px;">
                    <span>✈️ Истребители врага: <b style="color:${enemyFighters > 0 ? '#ef4444' : '#22c55e'};">${enemyFighters}</b></span>
                    <span>🎯 ПВО: <b style="color:${enemyAA > 0 ? '#ef4444' : '#22c55e'};">${enemyAA}</b></span>
                    <span>🪖 Войска на гексе: <b>${groundCount}</b></span>
                    <span>🛬 Ближайший аэродром: <b style="color:${canReach ? '#22c55e' : '#ef4444'};">${canReach ? minDist + ' гексов' : 'НЕТ в радиусе!'}</b></span>
                </div>
            </div>

            ${!canReach ? `
                <div style="background:rgba(239,68,68,0.15); border:1px solid #ef4444; border-radius:8px; padding:10px; margin-bottom:15px; font-size:12px; color:#fc8181;">
                    ⚠️ Ни один аэродром не в радиусе действия! Постройте 🛬 Аэродром ближе к цели.
                </div>
            ` : ''}

            <div style="background:rgba(102,126,234,0.1); border-radius:8px; padding:10px; font-size:12px; color:#a5b4fc; margin-bottom:15px;">
                💡 <b>Как работает:</b><br>
                • Истребители сбивают врагов в воздушном бою<br>
                • Бомбардировщики бьют по земле (20-40% урона)<br>
                • ПВО сбивает ваши бомбардировщики<br>
                • Расход нефти: 5⛽ за каждый самолёт
            </div>

            <div class="buttons">
                <button class="btn-secondary" onclick="closeAirAttackModal()">Отмена</button>
                <button class="btn-primary" style="background:#7f1d1d;" onclick="executeAirAttack('${provinceId}', '${hexKey}')" ${(!canAfford || !canReach) ? 'disabled title="Не хватает нефти или аэродрома"' : ''}>
                    ⚔️ Атаковать
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

function closeAirAttackModal() {
    document.getElementById('airAttackModal')?.remove();
}

async function executeAirAttack(provinceId, hexKey) {
    closeAirAttackModal();
    if (!currentRoom) return;
    try {
        const response = await fetch(`/api/game/rooms/${currentRoom.id}/air-battle`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ provinceId, hexKey })
        });
        if (response.ok) {
            const data = await response.json();
            if (!socket || !socket.connected) applyStateUpdate(data.state);
            const r = data.result;
            showModal('✈️ Воздушный бой',
                `Сбито врагов: ${r.enemyLosses.fighters}✈️\n` +
                `Потери: ${r.myLosses.fighters}✈️ ${r.myLosses.bombers}💣\n` +
                `Урон по земле: ${r.groundDamage} юнитов`
            );
        } else {
            const err = await response.json();
            showModal('Ошибка', err.error || 'Не удалось');
        }
    } catch (e) { showModal('Ошибка', 'Нет соединения'); }
}

// ============ 🪂 ПАРАДРОП ============
function openParadropModal(fromProvinceId, fromHex) {
    if (!gameState) return;
    const player = gameState.players.find(p => p.username === currentUser);
    if (!player) return;

    const transports = player.airUnits?.transport || 0;
    if (transports < 3) {
        showModal('Мало транспортников', `Нужно минимум 3 транспортника (у вас ${transports})`);
        return;
    }

    const fromProv = gameState.provinces[fromProvinceId];
    if (!fromProv) return;
    const fromUnits = fromProv.units?.[fromHex] || {};
    if (Object.keys(fromUnits).length === 0) {
        showModal('Ошибка', 'На гексе нет войск');
        return;
    }

    const modal = document.createElement('div');
    modal.className = 'modal-overlay show';
    modal.id = 'paradropModal';
    modal.innerHTML = `
        <div class="modal" style="max-width: 520px;">
            <h2>🪂 Воздушный десант</h2>
            <p style="color:#a0aec0; font-size:13px; margin-bottom:15px;">
                Транспортников: <b style="color:#a5b4fc;">${transports}</b> • Радиус: <b>${AIR_STATS.transport.range} гексов</b><br>
                Выберите войска для десанта. 1 транспортник = 1 юнит.
            </p>

            <div style="display:flex; flex-direction:column; gap:10px;">
                ${Object.entries(fromUnits).filter(([, n]) => n > 0).map(([type, count]) => `
                    <div style="background:#0f0f1e; padding:12px; border-radius:8px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                            <span>${UNIT_STATS[type].icon} <b>${UNIT_STATS[type].name}</b></span>
                            <span style="color:#a0aec0; font-size:12px;">из ${count}</span>
                        </div>
                        <input type="number" class="paradrop-number" data-type="${type}"
                               min="0" max="${Math.min(count, transports)}" value="0"
                               style="width:100%; padding:6px; background:#1a1a2e; color:#e2e8f0; border:1px solid #2d3748; border-radius:6px;">
                    </div>
                `).join('')}
            </div>

            <div class="buttons" style="margin-top:15px;">
                <button class="btn-secondary" onclick="closeParadropModal()">Отмена</button>
                <button class="btn-primary" onclick="confirmParadrop('${fromProvinceId}', '${fromHex}')">🚀 Выбрать цель</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

function closeParadropModal() { document.getElementById('paradropModal')?.remove(); }

async function confirmParadrop(fromProvinceId, fromHex) {
    const modal = document.getElementById('paradropModal');
    if (!modal) return;
    const inputs = modal.querySelectorAll('.paradrop-number');
    const units = {};
    let total = 0;
    inputs.forEach(inp => {
        const v = parseInt(inp.value) || 0;
        if (v > 0) { units[inp.dataset.type] = v; total += v; }
    });
    if (total === 0) { showModal('Ошибка', 'Выберите хотя бы 1 юнит'); return; }

    closeParadropModal();
    window._paradropSelection = { fromProvinceId, fromHex, units };
    showAttackToast('🪂 Кликните на вражеский гекс в радиусе ' + AIR_STATS.transport.range);
    actionMode = 'paradrop';
    updateMapCursor();
}

// ============ СОБЫТИЯ ============
createRoomBtn.addEventListener('click', createRoom);
refreshRoomsBtn.addEventListener('click', loadRooms);
leaveRoomBtn.addEventListener('click', () => {
    if (confirm('Выйти?')) {
        // 🔥 WS: покидаем комнату
        if (currentRoom) leaveRoomSocket(currentRoom.id);
        if (statePollingInterval) clearInterval(statePollingInterval);
        currentRoom = null; gameState = null;
        mapInitialized = false; mapViewBox = null;
        selectedProvince = null; selectedHex = null; actionMode = null;
        showLobby(); loadRooms();
    }
});

startGameBtn.addEventListener('click', async () => {
    if (_startingGame) return;
    if (!currentRoom) return;
    _startingGame = true;
    try {
        if (typeof EUROPE_MAP === 'undefined') { alert('EUROPE_MAP не загружен'); return; }
        const provinces = {};
        Object.entries(EUROPE_MAP).forEach(([id, prov]) => {
            provinces[id] = {
                ...prov,
                troops: 3, unrest: 0,
                units: {}
            };
        });
        const response = await fetch(`/api/game/rooms/${currentRoom.id}/start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ provinces })
        });
        if (response.ok) {
            const data = await response.json();
            currentRoom = data.room;
            applyStateUpdate(data.state, true);
            mapInitialized = false;
            mapViewBox = null;
            selectedHex = null;
            actionMode = null;
            showMap();
            updateTurnInfo();
            startStatePolling();
        } else {
            const err = await response.json().catch(() => ({ error: 'Ошибка' }));
            alert(err.error || 'Ошибка старта');
        }
    } catch (e) { alert('Ошибка: ' + e.message); }
    finally { setTimeout(() => { _startingGame = false; }, 3000); }
});

endTurnBtn.addEventListener('click', endTurn);

document.getElementById('openEconomyBtn')?.addEventListener('click', openEconomyModal);
document.getElementById('openDiplomacyBtn')?.addEventListener('click', () => openDiplomacyModal());
document.getElementById('openMarketBtn')?.addEventListener('click', openMarketModal);

// Глобальные функции
window.openAirModal = openAirModal;
window.closeAirModal = closeAirModal;
window.recruitAir = recruitAir;
window.openAirAttackModal = openAirAttackModal;
window.closeAirAttackModal = closeAirAttackModal;
window.executeAirAttack = executeAirAttack;
window.openParadropModal = openParadropModal;
window.closeParadropModal = closeParadropModal;
window.confirmParadrop = confirmParadrop;
window.openRecruitModal = openRecruitModal;
window.closeRecruitModal = closeRecruitModal;
window.quickRecruit = quickRecruit;
window.toggleMoveMode = toggleMoveMode;
window.toggleAttackMode = toggleAttackMode;
window.disbandUnit = disbandUnit;
window.closeModal = closeModal;
window.closeEconomyModal = closeEconomyModal;
window.startBuild = startBuild;
window.setMilSplit = setMilSplit;
window.openBuildPicker = openBuildPicker;
window.closeBuildPicker = closeBuildPicker;
window.openDiplomacyModal = openDiplomacyModal;
window.closeDiplomacyModal = closeDiplomacyModal;
window.confirmDeclareWar = confirmDeclareWar;
window.diplomacyAction = diplomacyAction;
window.acceptOffer = acceptOffer;
window.declineOffer = declineOffer;
window.openUltimatumModal = openUltimatumModal;
window.submitUltimatum = submitUltimatum;

window.openMoveModal = openMoveModal;
window.closeMoveModal = closeMoveModal;
window.confirmMove = confirmMove;

window.openMarketModal = openMarketModal;
window.closeMarketModal = closeMarketModal;
window.submitMarketOffer = submitMarketOffer;
window.acceptMarketOffer = acceptMarketOffer;
window.declineMarketOffer = declineMarketOffer;
window.cancelMarketOffer = cancelMarketOffer;
window.cancelMarketContract = cancelMarketContract;
window.toggleMarketEmbargo = toggleMarketEmbargo;

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        if (actionMode) { actionMode = null; window._moveSelection = null; updateActionLayer(); updateMapCursor(); if (selectedProvince) selectProvinceThrottled(selectedProvince); }
        closeModal();
        closeRecruitModal();
        closeEconomyModal();
        closeBuildPicker();
        closeDiplomacyModal();
        closeMarketModal();
        closeMoveModal();
        closeAirModal();
        closeAirAttackModal();
        closeParadropModal();
    }
});

// 🔥 WS: поллинг реже (WebSocket даёт мгновенные обновления)
setInterval(async () => {
    if (currentRoom && roomView.style.display !== 'none') {
        try {
            const response = await fetch(`/api/game/rooms/${currentRoom.id}`);
            if (response.ok) {
                const data = await response.json();
                currentRoom = data.room || data;
                renderRoomInfo(currentRoom);
            }
        } catch (e) {}
    }
}, 10000);

setInterval(() => {
    if (lobbyView.style.display !== 'none') loadRooms();
}, 8000);

Object.defineProperty(window, 'gameState', {
    get() { return gameState; },
    set(v) { gameState = v; }
});
Object.defineProperty(window, 'currentRoom', {
    get() { return currentRoom; },
    set(v) { currentRoom = v; }
});
Object.defineProperty(window, 'currentUser', {
    get() { return currentUser; },
    set(v) { currentUser = v; }
});

setupMapGlobalListeners();
checkAuth();

} // конец if