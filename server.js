// ============================================================
//  🎮 GAME SERVER — только игра, без платформы
// ============================================================

const express = require('express');
const path = require('path');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 3001;
const PLATFORM_URL = process.env.PLATFORM_URL || 'https://mrnerd.vercel.app';

// ============ MIDDLEWARE ============
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cors({
    origin: [
        PLATFORM_URL,
        'http://localhost:3000',
        'http://localhost:3001',
        'http://localhost:5173',
        'http://127.0.0.1:3000',
        'http://127.0.0.1:3001'
    ],
    credentials: true
}));

// ============ 🔑 ОПРЕДЕЛЯЕМ ПОЛЬЗОВАТЕЛЯ ============
app.use((req, res, next) => {
    let username = req.headers['x-username']
                || (req.body && req.body.username)
                || req.query.username
                || null;

    if (username && req.headers['x-username'] && username === req.headers['x-username']) {
        try {
            if (/^[A-Za-z0-9+/]+=*$/.test(username)) {
                const decoded = Buffer.from(username, 'base64').toString('utf8');
                const reencoded = Buffer.from(decoded, 'utf8').toString('base64');
                if (reencoded === username) {
                    username = decoded;
                }
            }
        } catch (e) {}
    }

    req.username = username;
    next();
});

app.use(express.static(path.join(__dirname, 'public')));

app.use((req, res, next) => {
    console.log(`🎮 ${req.method} ${req.url}`);
    next();
});

// ============ 🔌 SOCKET.IO (создаём СРАЗУ, чтобы io был доступен) ============
const io = new Server(server, {
    cors: {
        origin: [
            PLATFORM_URL,
            'http://localhost:3000',
            'http://localhost:3001',
            'http://localhost:5173',
            'http://127.0.0.1:3000',
            'http://127.0.0.1:3001'
        ],
        credentials: true
    }
});

// ============ 🧠 ХРАНИЛИЩЕ В ПАМЯТИ ============
const memory = {
    rooms: {},
    gameStates: {},
    players: {}
};

// ============ 🛠️ БЕЗОПАСНАЯ КОМНАТА ============
function safeRoom(room) {
    if (!room) return null;
    const safe = { ...room };
    delete safe.password;
    safe.createdBy = room.host;
    safe.hasPassword = !!room.password;
    return safe;
}

// ============ 📡 ВЕЩАНИЕ (WebSocket-хелперы) ============
function broadcastToRoom(roomId, event, data) {
    io.to(roomId).emit(event, data);
}

function broadcastRoomUpdate(roomId) {
    const room = memory.rooms[roomId];
    if (!room) return;
    room.updatedAt = Date.now();
    io.to(roomId).emit('room-update', safeRoom(room));
}

function broadcastAll(event, data) {
    io.emit(event, data);
}

// 🔥 WS: единая точка рассылки state-update
function pushStateUpdate(roomId, state) {
    if (!state) return;
    state.updatedAt = Date.now();
    const room = memory.rooms[roomId];
    if (room) room.updatedAt = state.updatedAt;
    io.to(roomId).emit('state-update', state);
}

// ============ 📦 ИГРОВОЙ МОДУЛЬ ============
let gameStateModule = {};
try {
    gameStateModule = require('./public/game-state');
    console.log('✅ game-state.js загружен');
} catch (e) {
    console.error('❌ Не удалось загрузить game-state.js:', e.message);
    console.error('   Убедись, что файл лежит в /public/game-state.js');
    process.exit(1);
}

// 🔥 FIX: хелперы из модуля
const isValidCountry = gameStateModule.isValidCountry || ((c) => {
    if (!c) return false;
    if (typeof c !== 'string') return false;
    if (c === 'water') return false;
    if (c === 'sea') return false;
    if (c === 'null') return false;
    if (c === 'undefined') return false;
    return true;
});

const isSeaProvince = gameStateModule.isSeaProvince || ((prov) => {
    if (!prov) return true;
    if (prov.country === 'water') return true;
    if (prov.isSea === true) return true;
    if (prov.terrain === 'sea') return true;
    return false;
});

// ============ ⚔️ КОНСТАНТЫ ============
const UNIT_STATS = {
    infantry: { attack: 1.0, defense: 1.2, name: 'Пехота', icon: '🪖' },
    tanks:    { attack: 2.0, defense: 1.5, name: 'Танки',  icon: '⚔️' },
    artillery:{ attack: 2.5, defense: 1.0, name: 'Артиллерия', icon: '🎯' }
};

const UNIT_COSTS = {
    infantry:  { name: 'Пехота',     manpowerCost: 10, steelCost: 5,  oilCost: 0, buildProgress: 30, speedPerMilIC: 1.0 },
    tanks:     { name: 'Танки',      manpowerCost: 5,  steelCost: 20, oilCost: 0, buildProgress: 60, speedPerMilIC: 1.0 },
    artillery: { name: 'Артиллерия', manpowerCost: 8,  steelCost: 12, oilCost: 0, buildProgress: 45, speedPerMilIC: 1.0 }
};

const AIR_STATS = {
    fighters: { name: 'Истребители', icon: '✈️', attack: 3.0, defense: 3.0, range: 8, hp: 10, cost: 15, manpower: 2, oil: 1, buildProgress: 40, speedPerMilIC: 1.0 },
    bombers:  { name: 'Бомбардировщики', icon: '💣', attack: 5.0, defense: 1.5, range: 12, hp: 12, cost: 25, manpower: 3, oil: 2, buildProgress: 60, speedPerMilIC: 1.0 },
    transport:{ name: 'Транспортники', icon: '🪂', attack: 0.5, defense: 1.0, range: 15, hp: 8, cost: 20, manpower: 4, oil: 1, buildProgress: 50, speedPerMilIC: 1.0 }
};

const BUILDING_TYPES = {
    civFactory: { name: '🏭 Гражданский завод', cost: 40, steelCost: 0,  buildTime: 90 },
    milFactory: { name: '⚙️ Военный завод',     cost: 50, steelCost: 20, buildTime: 120 },
    airFactory: { name: '✈️ Авиазавод',         cost: 60, steelCost: 30, buildTime: 100 },
    airbase:    { name: '🛬 Аэродром',          cost: 30, steelCost: 15, buildTime: 60 },
    aagun:      { name: '🎯 ПВО',               cost: 25, steelCost: 10, buildTime: 45 }
};

const MAX_UNITS_PER_HEX = 3;
const MP_PER_TURN = 2;
const MP_COST_MOVE = 1;
const MP_COST_ATTACK = 1;
const ATTACK_FATIGUE_PENALTY = 0.15;
const OIL_COST_TANK_ATTACK = 3;
const OIL_COST_TANK_MOVE = 2;
const OIL_COST_ARTILLERY_ATTACK = 2;
const OIL_COST_ARTILLERY_MOVE = 1;

const ODD_DIRS  = [[+1,0],[-1,0],[0,-1],[-1,-1],[0,+1],[-1,+1]];
const EVEN_DIRS = [[+1,0],[-1,0],[+1,-1],[0,-1],[+1,+1],[0,+1]];

const PROVINCE_RESOURCES = {
    grain:  { oil: 0, steel: 0, manpowerBonus: 1.0 },
    oil:    { oil: 4, steel: 0, manpowerBonus: 0.5 },
    metal:  { oil: 0, steel: 3, manpowerBonus: 0.5 },
    coal:   { oil: 0, steel: 1, manpowerBonus: 1.0 },
    rubber: { oil: 0, steel: 0, manpowerBonus: 0.5 },
    none:   { oil: 0, steel: 0, manpowerBonus: 0.2 }
};

// ============ 🌍 НАЗВАНИЯ СТРАН ============
const COUNTRIES_NAMES = {
    germany: 'Германия', soviet: 'СССР', uk: 'Британия', france: 'Франция',
    italy: 'Италия', poland: 'Польша', spain: 'Испания', turkey: 'Турция',
    sweden: 'Швеция', romania: 'Румыния', yugoslavia: 'Югославия',
    czechoslovakia: 'Чехословакия', hungary: 'Венгрия', bulgaria: 'Болгария',
    greece: 'Греция', finland: 'Финляндия', norway: 'Норвегия',
    denmark: 'Дания', netherlands: 'Нидерланды', belgium: 'Бельгия',
    portugal: 'Португалия', switzerland: 'Швейцария', austria: 'Австрия',
    ireland: 'Ирландия', estonia: 'Эстония', latvia: 'Латвия',
    lithuania: 'Литва', albania: 'Албания', luxembourg: 'Люксембург',
    saudi: 'Саудовская Аравия', iraq: 'Ирак', iran: 'Иран',
    afghanistan: 'Афганистан'
};

// ============================================================
//  🎁 СТАРТОВЫЕ ВОЙСКА
// ============================================================
const AI_START_UNITS = {
    germany: { infantry: 5, tanks: 2, artillery: 1 },
    soviet:  { infantry: 6, tanks: 1, artillery: 1 },
    uk:      { infantry: 5, tanks: 2, artillery: 1 },
    france:  { infantry: 5, tanks: 2, artillery: 1 },
    italy:   { infantry: 5, tanks: 1, artillery: 2 },

    poland:         { infantry: 4, tanks: 1, artillery: 1 },
    spain:          { infantry: 4, tanks: 1, artillery: 1 },
    turkey:         { infantry: 4, tanks: 1, artillery: 1 },
    sweden:         { infantry: 4, tanks: 1, artillery: 1 },
    czechoslovakia: { infantry: 4, tanks: 1, artillery: 1 },
    romania:        { infantry: 4, tanks: 0, artillery: 1 },
    yugoslavia:     { infantry: 4, tanks: 0, artillery: 1 },
    netherlands:    { infantry: 4, tanks: 0, artillery: 1 },
    belgium:        { infantry: 4, tanks: 0, artillery: 1 },
    austria:        { infantry: 3, tanks: 1, artillery: 1 },
    hungary:        { infantry: 3, tanks: 1, artillery: 1 },
    finland:        { infantry: 4, tanks: 0, artillery: 1 },

    bulgaria:    { infantry: 3, tanks: 0, artillery: 1 },
    greece:      { infantry: 3, tanks: 0, artillery: 1 },
    iran:        { infantry: 3, tanks: 0, artillery: 1 },
    portugal:    { infantry: 3, tanks: 0, artillery: 0 },
    switzerland: { infantry: 3, tanks: 0, artillery: 0 },
    denmark:     { infantry: 3, tanks: 0, artillery: 0 },
    norway:      { infantry: 3, tanks: 0, artillery: 0 },
    afghanistan: { infantry: 3, tanks: 0, artillery: 0 },
    ireland:     { infantry: 2, tanks: 0, artillery: 0 },
    estonia:     { infantry: 2, tanks: 0, artillery: 0 },
    latvia:      { infantry: 2, tanks: 0, artillery: 0 },
    lithuania:   { infantry: 2, tanks: 0, artillery: 0 },
    saudi:       { infantry: 2, tanks: 0, artillery: 0 },
    iraq:        { infantry: 2, tanks: 0, artillery: 0 },

    albania:    { infantry: 1, tanks: 0, artillery: 0 },
    luxembourg: { infantry: 1, tanks: 0, artillery: 0 },

    default:    { infantry: 2, tanks: 0, artillery: 0 }
};

// ============ 🛠️ УТИЛИТЫ ============
function getNeighborKeys(col, row) {
    const dirs = (row & 1) ? ODD_DIRS : EVEN_DIRS;
    return dirs.map(([dc, dr]) => `${col + dc},${row + dr}`);
}

function hexDistance(hex1, hex2) {
    const [c1, r1] = hex1.split(',').map(Number);
    const [c2, r2] = hex2.split(',').map(Number);
    const x1 = c1 - (r1 - (r1 & 1)) / 2, z1 = r1, y1 = -x1 - z1;
    const x2 = c2 - (r2 - (r2 & 1)) / 2, z2 = r2, y2 = -x2 - z2;
    return Math.max(Math.abs(x1 - x2), Math.abs(y1 - y2), Math.abs(z1 - z2));
}

function getArmyMP(player, hexKey) {
    if (!player.armyMovement) player.armyMovement = {};
    if (!player.armyMovement[hexKey]) {
        player.armyMovement[hexKey] = { mp: MP_PER_TURN, attacks: 0 };
    }
    return player.armyMovement[hexKey];
}

function getHexStrength(unitData, isAttacker) {
    let s = 0;
    if (!unitData) return 0;
    for (const [type, count] of Object.entries(unitData)) {
        if (count > 0 && UNIT_STATS[type]) {
            s += count * (isAttacker ? UNIT_STATS[type].attack : UNIT_STATS[type].defense);
        }
    }
    return s;
}

function getHexUnitCount(u) {
    if (!u) return 0;
    return Object.values(u).reduce((s, n) => s + (n || 0), 0);
}

function getHexOwner(prov, hexKey) {
    return prov.hexOwner?.[hexKey] || prov.country;
}

function areNeighbors(h1, h2) {
    const [c1, r1] = h1.split(',').map(Number);
    const [c2, r2] = h2.split(',').map(Number);
    const dirs = (r1 & 1) ? ODD_DIRS : EVEN_DIRS;
    return dirs.some(([dc, dr]) => (c1 + dc === c2 && r1 + dr === r2));
}

function findRetreatHex(prov, fromKey, excludeKeys, preferredOwner) {
    const [c, r] = fromKey.split(',').map(Number);
    const neighbors = getNeighborKeys(c, r);
    const provHexSet = new Set((prov.hexes || []).map(([hc, hr]) => `${hc},${hr}`));
    for (const nKey of neighbors) {
        if (excludeKeys.has(nKey)) continue;
        if (!provHexSet.has(nKey)) continue;
        if (preferredOwner && getHexOwner(prov, nKey) !== preferredOwner) continue;
        return nKey;
    }
    return null;
}

function recalcBordersForProvinces(state, provinceIds) {
    provinceIds.forEach(id => {
        const prov = state.provinces[id];
        if (!prov) return;
        if (prov.country === 'water' || prov.isSea) {
            prov.borderHexes = [];
            return;
        }
        const hexSet = new Set(prov.hexes.map(([c, r]) => `${c},${r}`));
        const ownerMap = {};
        Object.entries(state.provinces).forEach(([pid, p]) => {
            if (pid === id) return;
            p.hexes.forEach(([c, r]) => { ownerMap[`${c},${r}`] = p.country; });
        });
        const borderHexes = [];
        for (const [c, r] of prov.hexes) {
            const key = `${c},${r}`;
            const neighbors = getNeighborKeys(c, r);
            const hasForeignNeighbor = neighbors.some(nKey => {
                if (hexSet.has(nKey)) return false;
                const nOwner = ownerMap[nKey];
                if (!nOwner) return true;
                return nOwner !== prov.country;
            });
            if (hasForeignNeighbor) borderHexes.push(key);
        }
        prov.borderHexes = borderHexes;
    });
}

// ============ 💓 СЕРВИСНЫЕ ============
app.get('/api/ping', (req, res) => {
    res.json({
        status: 'ok',
        service: 'strategy',
        rooms: Object.keys(memory.rooms).length,
        players: Object.keys(memory.players).length,
        ws: io.engine ? io.engine.clientsCount : 0,
        timestamp: Date.now()
    });
});

app.get('/api/me', (req, res) => {
    res.json({
        username: req.username || `Guest_${Math.floor(Math.random() * 9999)}`,
        role: 'user',
        authenticated: true
    });
});

// ============================================================
//  🏠 КОМНАТЫ
// ============================================================

app.get('/api/game/rooms', (req, res) => {
    res.json(Object.values(memory.rooms).map(safeRoom));
});

app.post('/api/game/rooms', (req, res) => {
    const username = req.username;
    const { name, password, maxPlayers } = req.body;

    if (!username) return res.status(400).json({ error: 'Не определён пользователь' });
    if (!name) return res.status(400).json({ error: 'Нужно название комнаты' });

    const roomId = 'room_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    const room = {
        id: roomId,
        name: name.trim(),
        host: username,
        password: password || null,
        players: [{ username, country: null, ready: false, joinedAt: Date.now() }],
        maxPlayers: Math.min(Math.max(parseInt(maxPlayers) || 4, 1), 6),
        status: 'lobby',
        createdAt: Date.now(),
        updatedAt: Date.now()
    };

    memory.rooms[roomId] = room;
    console.log(`🏠 Создана комната: ${room.name} (${roomId})`);
    res.json({ room: safeRoom(room) });
});

app.get('/api/game/rooms/:id', (req, res) => {
    const room = memory.rooms[req.params.id];
    if (!room) return res.status(404).json({ error: 'Комната не найдена' });
    res.json({ room: safeRoom(room) });
});

app.post('/api/game/rooms/:id/join', (req, res) => {
    const username = req.username;
    const { password } = req.body;
    const room = memory.rooms[req.params.id];

    if (!room) return res.status(404).json({ error: 'Комната не найдена' });
    if (!username) return res.status(400).json({ error: 'Введите ник' });
    if (room.password && room.password !== password) {
        return res.status(403).json({ error: 'Неверный пароль' });
    }

    const existing = room.players.find(p => p.username === username);
    if (existing) return res.json({ room: safeRoom(room) });

    if (room.players.length >= room.maxPlayers) {
        return res.status(400).json({ error: 'Комната заполнена' });
    }

    room.players.push({ username, country: null, ready: false, joinedAt: Date.now() });
    console.log(`👤 ${username} вошёл в ${room.name}`);
    broadcastRoomUpdate(room.id);
    res.json({ room: safeRoom(room) });
});

app.post('/api/game/rooms/:id/select-country', (req, res) => {
    const username = req.username;
    const { country } = req.body;
    const room = memory.rooms[req.params.id];
    if (!room) return res.status(404).json({ error: 'Комната не найдена' });

    // 🔥 FIX: нельзя выбрать воду
    if (!isValidCountry(country)) {
        return res.status(400).json({ error: 'Нельзя выбрать воду' });
    }

    const taken = room.players.some(p => p.username !== username && p.country === country);
    if (taken) return res.status(400).json({ error: 'Страна занята' });

    room.players = room.players.map(p =>
        p.username === username ? { ...p, country, ready: false } : p
    );

    broadcastRoomUpdate(room.id);
    res.json({ room: safeRoom(room) });
});

app.post('/api/game/rooms/:id/ready', (req, res) => {
    const username = req.username;
    const room = memory.rooms[req.params.id];
    if (!room) return res.status(404).json({ error: 'Комната не найдена' });

    room.players = room.players.map(p =>
        p.username === username ? { ...p, ready: !p.ready } : p
    );

    broadcastRoomUpdate(room.id);
    res.json({ room: safeRoom(room) });
});

app.post('/api/game/rooms/:id/leave', (req, res) => {
    const username = req.username;
    const room = memory.rooms[req.params.id];
    if (!room) return res.status(404).json({ error: 'Комната не найдена' });

    room.players = room.players.filter(p => p.username !== username);

    if (room.host === username && room.players.length > 0) {
        room.host = room.players[0].username;
    }

    if (room.players.length === 0) {
        delete memory.rooms[room.id];
        delete memory.gameStates[room.id];
        console.log(`🗑️ Комната удалена: ${room.name}`);
    } else {
        broadcastRoomUpdate(room.id);
    }

    res.json({ success: true });
});

app.delete('/api/game/rooms/:id', (req, res) => {
    const username = req.username;
    const room = memory.rooms[req.params.id];
    if (!room) return res.status(404).json({ error: 'Комната не найдена' });

    if (room.host !== username && username !== 'admin') {
        return res.status(403).json({ error: 'Нет прав' });
    }

    delete memory.rooms[room.id];
    delete memory.gameStates[room.id];
    broadcastAll('room-deleted', { roomId: room.id });
    res.json({ success: true });
});

// ============================================================
//  🎮 СТАРТ ИГРЫ
// ============================================================
app.post('/api/game/rooms/:id/start', (req, res) => {
    const username = req.username;
    const { provinces } = req.body;
    const room = memory.rooms[req.params.id];
    if (!room) return res.status(404).json({ error: 'Комната не найдена' });
    if (room.host !== username) return res.status(403).json({ error: 'Только хост может начать' });

    const allReady = room.players.length >= 1 && room.players.every(p => p.ready && p.country);
    if (!allReady) return res.status(400).json({ error: 'Не все готовы' });

    const provincesSafe = {};
    Object.entries(provinces || {}).forEach(([id, prov]) => {
        const hexOwner = {};
        (prov.hexes || []).forEach(([c, r]) => { hexOwner[`${c},${r}`] = prov.country; });
        provincesSafe[id] = {
            ...prov,
            hexOwner,
            units: prov.units || {},
            civFactories: prov.civFactories || 0,
            milFactories: prov.milFactories || 0,
            airFactories: prov.airFactories || 0,
            airbases: prov.airbases || 0,
            aaguns: prov.aaguns || 0
        };
    });

    const makePlayerData = (username, country, isAI) => ({
        username,
        country,
        isAI,
        resources: { civIC: 0, milIC: 0, manpower: 50 },
        manpowerPool: 500,
        steelPool: 300,
        oilPool: 150,
        armyMovement: {},
        airUnits: { fighters: 0, bombers: 0, transport: 0 },
        airProductionQueue: [],
        productionQueue: [],
        constructionQueue: [],
        milSplit: { infantry: 45, tanks: 20, artillery: 15, air: 20 },
        milLines: {
            infantry: { efficiency: 1.0 },
            tanks: { efficiency: 1.0 },
            artillery: { efficiency: 1.0 },
            air: { efficiency: 1.0 }
        },
        civFactoriesLeased: 0, milFactoriesLeased: 0,
        civFactoriesRented: 0, milFactoriesRented: 0,
        tradeEmbargo: [], unrest: 0,
        isAlive: true
    });

    const humanPlayers = room.players
        .filter(p => isValidCountry(p.country))
        .map(p => makePlayerData(p.username, p.country, false));

    const takenCountries = new Set(humanPlayers.map(p => p.country).filter(Boolean));

    const allMapCountries = new Set();
    Object.values(provincesSafe).forEach(prov => {
        if (!isValidCountry(prov.country)) return;
        if (isSeaProvince(prov)) return;
        allMapCountries.add(prov.country);
    });

    const aiPlayers = [];
    allMapCountries.forEach(country => {
        if (takenCountries.has(country)) return;
        if (!isValidCountry(country)) return;
        aiPlayers.push(makePlayerData(`ИИ (${country})`, country, true));
    });

    console.log(`👥 Игроков: ${humanPlayers.length}, ИИ: ${aiPlayers.length}`);

    const state = {
        turn: 1,
        currentPlayerIndex: 0,
        players: [...humanPlayers, ...aiPlayers],
        provinces: provincesSafe,
        wars: [],
        alliances: [],
        pacts: [],
        diplomaticOffers: [],
        marketOffers: [],
        activeContracts: [],
        eventLog: [{ turn: 1, title: '🎮', message: 'Игра началась!' }],
        finished: false,
        updatedAt: Date.now()
    };

    state.players.forEach(p => {
        if (!isValidCountry(p.country)) return;

        const startUnits = AI_START_UNITS[p.country] || AI_START_UNITS.default;

        let capital = Object.entries(state.provinces)
            .find(([id, prov]) => prov.country === p.country && prov.isCapital);
        if (!capital) {
            capital = Object.entries(state.provinces)
                .find(([id, prov]) => prov.country === p.country);
        }
        if (!capital) return;

        const [provId, prov] = capital;
        const hexes = prov.hexes || [];
        if (hexes.length === 0) return;
        if (!prov.units) prov.units = {};

        const unitList = [];
        for (const [type, count] of Object.entries(startUnits)) {
            for (let i = 0; i < count; i++) unitList.push(type);
        }

        let unitIdx = 0;
        for (const [c, r] of hexes) {
            if (unitIdx >= unitList.length) break;
            const hexKey = `${c},${r}`;
            const stack = { ...(prov.units[hexKey] || {}) };
            let placed = getHexUnitCount(stack);
            while (unitIdx < unitList.length && placed < MAX_UNITS_PER_HEX) {
                const t = unitList[unitIdx];
                stack[t] = (stack[t] || 0) + 1;
                unitIdx++;
                placed++;
            }
            prov.units[hexKey] = stack;
        }

        console.log(`🎁 ${p.country}: ${unitList.length} юнитов в ${prov.name} (${hexes.length} гексов)`);
    });

    memory.gameStates[room.id] = state;
    room.status = 'playing';
    room.updatedAt = Date.now();

    console.log(`▶️ Игра началась в ${room.name}`);
    broadcastToRoom(room.id, 'game-started', { state });
    res.json({ success: true, room: safeRoom(room), state });
});

// ============================================================
//  🎮 СОСТОЯНИЕ И ХОДЫ
// ============================================================

app.get('/api/game/rooms/:id/state', (req, res) => {
    const state = memory.gameStates[req.params.id];
    if (!state) return res.status(404).json({ error: 'Игра не найдена' });
    res.json(state);
});

app.post('/api/game/rooms/:id/move', (req, res) => {
    const state = memory.gameStates[req.params.id];
    if (!state) return res.status(404).json({ error: 'Игра не найдена' });

    const { type } = req.body || {};
    if (type === 'end_turn') {
        processEndTurn(state);
        pushStateUpdate(req.params.id, state);
        return res.json({ success: true, state });
    }
    res.status(400).json({ error: 'Неизвестный тип хода' });
});

app.post('/api/game/rooms/:id/unit-action', (req, res) => {
    const state = memory.gameStates[req.params.id];
    if (!state) return res.status(404).json({ error: 'Игра не найдена' });

    const { action, provinceId, hexKey, ...rest } = req.body;
    const username = req.username;
    const player = state.players.find(p => p.username === username);
    if (!player) return res.status(403).json({ error: 'Вы не участник' });

    const currentPlayer = state.players[state.currentPlayerIndex];
    if (currentPlayer.username !== username) {
        return res.status(403).json({ error: 'Сейчас не ваш ход' });
    }

    try {
        let result;
        switch (action) {
            case 'recruit': result = recruitUnit(state, player, provinceId, hexKey, rest.unitType); break;
            case 'move':    result = moveUnit(state, player, provinceId, hexKey, rest.toHex, rest.moveUnits); break;
            case 'disband': result = disbandUnit(state, player, provinceId, hexKey, rest.unitType); break;
            default: return res.status(400).json({ error: 'Неизвестное действие: ' + action });
        }

        if (result.error) return res.status(400).json({ error: result.error });

        pushStateUpdate(req.params.id, state);
        res.json({ success: true, state });
    } catch (e) {
        console.error('unit-action error:', e);
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/game/rooms/:id/attack-hex', (req, res) => {
    const state = memory.gameStates[req.params.id];
    if (!state) return res.status(404).json({ error: 'Игра не найдена' });

    const { fromHex, toHex } = req.body;
    const username = req.username;
    const player = state.players.find(p => p.username === username);
    if (!player) return res.status(403).json({ error: 'Вы не участник' });

    const currentPlayer = state.players[state.currentPlayerIndex];
    if (currentPlayer.username !== username) {
        return res.status(403).json({ error: 'Сейчас не ваш ход' });
    }

    const result = attackHex(state, player, fromHex, toHex);
    if (result.error) return res.status(400).json({ error: result.error });

    pushStateUpdate(req.params.id, state);
    res.json({ success: true, state, result });
});

app.post('/api/game/rooms/:id/build', (req, res) => {
    const state = memory.gameStates[req.params.id];
    if (!state) return res.status(404).json({ error: 'Игра не найдена' });

    const { buildingType, provinceId } = req.body;
    const username = req.username;
    const player = state.players.find(p => p.username === username);
    if (!player) return res.status(403).json({ error: 'Вы не участник' });

    const b = BUILDING_TYPES[buildingType];
    if (!b) return res.status(400).json({ error: 'Неизвестный тип' });
    if ((player.steelPool || 0) < b.steelCost) {
        return res.status(400).json({ error: 'Не хватает стали' });
    }
    const prov = state.provinces[provinceId];
    if (!prov || prov.country !== player.country) {
        return res.status(400).json({ error: 'Не ваша провинция' });
    }

    player.steelPool -= b.steelCost;
    if (!player.constructionQueue) player.constructionQueue = [];
    player.constructionQueue.push({
        type: buildingType, provinceId,
        progress: 0, totalProgress: b.buildTime,
        steelCost: b.steelCost, startedAt: state.turn
    });

    pushStateUpdate(req.params.id, state);
    res.json({ success: true, state });
});

app.post('/api/game/rooms/:id/air-recruit', (req, res) => {
    const state = memory.gameStates[req.params.id];
    if (!state) return res.status(404).json({ error: 'Игра не найдена' });
    const { airType, provinceId } = req.body;
    const username = req.username;
    const player = state.players.find(p => p.username === username);
    if (!player) return res.status(403).json({ error: 'Вы не участник' });

    const air = AIR_STATS[airType];
    if (!air) return res.status(400).json({ error: 'Неизвестный тип' });
    if ((player.steelPool || 0) < air.cost) return res.status(400).json({ error: 'Не хватает стали' });
    if ((player.resources.manpower || 0) < air.manpower) return res.status(400).json({ error: 'Не хватает людей' });

    const prov = state.provinces[provinceId];
    if (!prov || prov.country !== player.country) return res.status(400).json({ error: 'Не ваша провинция' });
    if ((prov.airbases || 0) === 0) return res.status(400).json({ error: 'Нужен аэродром' });

    player.steelPool -= air.cost;
    player.resources.manpower -= air.manpower;
    if (!player.airProductionQueue) player.airProductionQueue = [];
    player.airProductionQueue.push({
        airType, provinceId, progress: 0,
        totalProgress: air.buildProgress, startedAt: state.turn
    });

    pushStateUpdate(req.params.id, state);
    res.json({ success: true, state });
});

app.post('/api/game/rooms/:id/mil-split', (req, res) => {
    const state = memory.gameStates[req.params.id];
    if (!state) return res.status(404).json({ error: 'Игра не найдена' });
    const username = req.username;
    const player = state.players.find(p => p.username === username);
    if (!player) return res.status(403).json({ error: 'Вы не участник' });

    const { infantry, tanks, artillery, air } = req.body;
    const i = parseInt(infantry) || 0;
    const t = parseInt(tanks) || 0;
    const a = parseInt(artillery) || 0;
    const ai = parseInt(air) || 0;

    if (i + t + a + ai !== 100) {
        return res.status(400).json({ error: `Сумма должна быть 100% (сейчас ${i + t + a + ai}%)` });
    }

    player.milSplit = { infantry: i, tanks: t, artillery: a, air: ai };
    pushStateUpdate(req.params.id, state);
    res.json({ success: true, state });
});

// ============================================================
//  🕊️ ДИПЛОМАТИЯ
// ============================================================
app.post('/api/game/rooms/:id/diplomacy', (req, res) => {
    const state = memory.gameStates[req.params.id];
    if (!state) return res.status(404).json({ error: 'Игра не найдена' });

    const username = req.username;
    const me = state.players.find(p => p.username === username);
    if (!me) return res.status(403).json({ error: 'Вы не участник' });

    const { action, target, terms } = req.body;

    if (target !== undefined && target !== null && target !== 'all') {
        if (!isValidCountry(target)) {
            return res.status(400).json({ error: 'Нельзя взаимодействовать с водой' });
        }
    }

    const result = gameStateModule.processDiplomacyAction(
        state, me, action, target, terms,
        { recalcBordersForProvinces: (st, ids) => recalcBordersForProvinces(st, ids) }
    );

    if (result.error) return res.status(400).json({ error: result.error });

    pushStateUpdate(req.params.id, state);
    res.json({ success: true, state });
});

// ============================================================
//  💰 РЫНОК
// ============================================================
app.post('/api/game/rooms/:id/market', (req, res) => {
    const state = memory.gameStates[req.params.id];
    if (!state) return res.status(404).json({ error: 'Игра не найдена' });

    const username = req.username;
    const me = state.players.find(p => p.username === username);
    if (!me) return res.status(403).json({ error: 'Вы не участник' });

    const { action, data } = req.body;

    if (data && data.to && data.to !== 'open' && !isValidCountry(data.to)) {
        return res.status(400).json({ error: 'Нельзя торговать с водой' });
    }
    if (data && data.target && !isValidCountry(data.target)) {
        return res.status(400).json({ error: 'Нельзя взаимодействовать с водой' });
    }

    const result = gameStateModule.processMarketAction(state, me, action, data || {});
    if (result.error) return res.status(400).json({ error: result.error });

    pushStateUpdate(req.params.id, state);
    res.json({ success: true, state });
});

// ============================================================
//  ✈️ ВОЗДУШНЫЙ БОЙ
// ============================================================
app.post('/api/game/rooms/:id/air-battle', (req, res) => {
    const state = memory.gameStates[req.params.id];
    if (!state) return res.status(404).json({ error: 'Игра не найдена' });

    const username = req.username;
    const me = state.players.find(p => p.username === username);
    if (!me) return res.status(403).json({ error: 'Вы не участник' });

    const { provinceId, hexKey } = req.body;

    const prov = state.provinces[provinceId];
    if (!prov) return res.status(404).json({ error: 'Провинция не найдена' });

    const targetCountry = getHexOwner(prov, hexKey);
    if (!isValidCountry(targetCountry)) {
        return res.status(400).json({ error: 'Это море' });
    }
    if (targetCountry === me.country) return res.status(400).json({ error: 'Это ваш гекс' });

    const atWar = (state.wars || []).some(w =>
        (w.attacker === me.country && w.defender === targetCountry) ||
        (w.defender === me.country && w.attacker === targetCountry)
    );
    if (!atWar) {
        const targetName = COUNTRIES_NAMES[targetCountry] || targetCountry;
        return res.status(400).json({ error: `Сначала объявите войну ${targetName}!` });
    }

    const enemy = state.players.find(p => p.country === targetCountry);
    if (!enemy) return res.status(404).json({ error: 'Враг не найден' });

    const myFighters = me.airUnits?.fighters || 0;
    const myBombers = me.airUnits?.bombers || 0;
    const enemyFighters = enemy.airUnits?.fighters || 0;

    if (myFighters + myBombers === 0) {
        return res.status(400).json({ error: 'У вас нет авиации' });
    }

    const myAirbases = [];
    Object.entries(state.provinces).forEach(([id, p]) => {
        if (p.country === me.country && (p.airbases || 0) > 0) {
            (p.hexes || []).forEach(([c, r]) => myAirbases.push(`${c},${r}`));
        }
    });

    const maxRange = Math.max(
        myFighters > 0 ? AIR_STATS.fighters.range : 0,
        myBombers > 0 ? AIR_STATS.bombers.range : 0
    );

    let canReach = false;
    for (const abHex of myAirbases) {
        if (hexDistance(abHex, hexKey) <= maxRange) { canReach = true; break; }
    }
    if (!canReach) {
        return res.status(400).json({ error: `Нет аэродрома в радиусе ${maxRange} гексов` });
    }

    const oilCost = 5 * (myFighters + myBombers);
    if ((me.oilPool || 0) < oilCost) {
        return res.status(400).json({ error: `Не хватает ⛽ (нужно ${oilCost})` });
    }
    me.oilPool = Math.round((me.oilPool - oilCost) * 100) / 100;

    const myPower = myFighters * AIR_STATS.fighters.attack + myBombers * AIR_STATS.bombers.attack;
    const enemyPower = enemyFighters * AIR_STATS.fighters.defense;

    const result = {
        myPower: Math.round(myPower),
        enemyPower: Math.round(enemyPower),
        myLosses: { fighters: 0, bombers: 0, transport: 0 },
        enemyLosses: { fighters: 0, bombers: 0, transport: 0 },
        groundDamage: 0
    };

    if (enemyFighters > 0) {
        const myLossRatio = Math.min(0.5, enemyPower / Math.max(1, myPower) * 0.15);
        const enemyLossRatio = Math.min(0.5, myPower / Math.max(1, enemyPower) * 0.15);

        result.myLosses.fighters = Math.floor(myFighters * myLossRatio);
        result.myLosses.bombers = Math.floor(myBombers * myLossRatio * 0.5);
        result.enemyLosses.fighters = Math.floor(enemyFighters * enemyLossRatio);

        me.airUnits.fighters -= result.myLosses.fighters;
        me.airUnits.bombers -= result.myLosses.bombers;
        enemy.airUnits.fighters -= result.enemyLosses.fighters;
    }

    if (myBombers > 0) {
        const groundTargets = prov.units?.[hexKey] || {};
        const groundCount = Object.values(groundTargets).reduce((s, n) => s + n, 0);
        if (groundCount > 0) {
            const enemyAA = prov.aaguns || 0;
            const bomberLosses = Math.min(myBombers, Math.floor(enemyAA * 0.5));
            me.airUnits.bombers -= bomberLosses;
            result.myLosses.bombers += bomberLosses;

            const damageRatio = 0.2 + Math.random() * 0.2;
            const killed = Math.floor(groundCount * damageRatio);
            result.groundDamage = killed;

            let killedLeft = killed;
            for (const [type, count] of Object.entries(groundTargets)) {
                if (killedLeft <= 0) break;
                const kill = Math.min(count, killedLeft);
                groundTargets[type] -= kill;
                killedLeft -= kill;
                if (groundTargets[type] <= 0) delete groundTargets[type];
            }
            if (Object.keys(groundTargets).length === 0) delete prov.units[hexKey];
        }
    }

    const totalMyLosses = result.myLosses.fighters + result.myLosses.bombers;
    const totalEnemyLosses = result.enemyLosses.fighters;

    state.eventLog.push({
        turn: state.turn, title: '⚔️✈️',
        message: `${me.username}: воздушный бой над ${prov.name} — сбито ${totalEnemyLosses}, потеряно ${totalMyLosses} (−${oilCost}⛽)`
    });
    if (state.eventLog.length > 50) state.eventLog = state.eventLog.slice(-50);

    pushStateUpdate(req.params.id, state);
    res.json({ success: true, state, result });
});

// ============================================================
//  🪂 ПАРАДРОП
// ============================================================
app.post('/api/game/rooms/:id/paradrop', (req, res) => {
    const state = memory.gameStates[req.params.id];
    if (!state) return res.status(404).json({ error: 'Игра не найдена' });

    const username = req.username;
    const me = state.players.find(p => p.username === username);
    if (!me) return res.status(403).json({ error: 'Вы не участник' });

    const { fromProvinceId, fromHex, toProvinceId, toHex, units } = req.body;

    const transports = me.airUnits?.transport || 0;
    if (transports < 3) {
        return res.status(400).json({ error: `Нужно минимум 3 транспортника (у вас ${transports})` });
    }

    const fromProv = state.provinces[fromProvinceId];
    const toProv = state.provinces[toProvinceId];
    if (!fromProv || !toProv) return res.status(404).json({ error: 'Провинция не найдена' });
    if (fromProv.country !== me.country) return res.status(400).json({ error: 'Провинция-источник не ваша' });
    if (toProv.country === me.country) return res.status(400).json({ error: 'Это ваша провинция' });
    if (!isValidCountry(toProv.country) || isSeaProvince(toProv)) {
        return res.status(400).json({ error: 'Это море' });
    }

    const myAirbases = [];
    Object.entries(state.provinces).forEach(([id, p]) => {
        if (p.country === me.country && (p.airbases || 0) > 0) {
            (p.hexes || []).forEach(([c, r]) => myAirbases.push(`${c},${r}`));
        }
    });

    let canReach = false;
    for (const abHex of myAirbases) {
        if (hexDistance(abHex, toHex) <= AIR_STATS.transport.range) { canReach = true; break; }
    }
    if (!canReach) {
        return res.status(400).json({ error: `Нет аэродрома в радиусе ${AIR_STATS.transport.range} гексов` });
    }

    const targetHexOwner = getHexOwner(toProv, toHex);
    if (!isValidCountry(targetHexOwner)) {
        return res.status(400).json({ error: 'Это море' });
    }

    const atWar = (state.wars || []).some(w =>
        (w.attacker === me.country && w.defender === targetHexOwner) ||
        (w.defender === me.country && w.attacker === targetHexOwner)
    );
    if (!atWar) {
        const targetName = COUNTRIES_NAMES[targetHexOwner] || targetHexOwner;
        return res.status(400).json({ error: `Сначала объявите войну ${targetName}!` });
    }

    const targetUnits = toProv.units?.[toHex] || {};
    if (getHexUnitCount(targetUnits) > 0) {
        return res.status(400).json({ error: 'В целевом гексе есть войска' });
    }

    const fromUnits = fromProv.units?.[fromHex] || {};
    const paradropUnits = {};
    let totalDropped = 0;
    for (const [type, count] of Object.entries(units || {})) {
        const have = fromUnits[type] || 0;
        const want = parseInt(count) || 0;
        if (want <= 0) continue;
        if (want > have) return res.status(400).json({ error: `Недостаточно ${UNIT_STATS[type]?.name || type}` });
        paradropUnits[type] = want;
        totalDropped += want;
    }
    if (totalDropped === 0) return res.status(400).json({ error: 'Не выбрано ни одного юнита' });
    if (totalDropped > transports) return res.status(400).json({ error: `Нужно ${totalDropped} транспортников` });

    const oilCost = totalDropped * 3;
    if ((me.oilPool || 0) < oilCost) {
        return res.status(400).json({ error: `Не хватает ⛽ (нужно ${oilCost})` });
    }
    me.oilPool -= oilCost;

    if (!toProv.units) toProv.units = {};
    if (!toProv.units[toHex]) toProv.units[toHex] = {};
    for (const [type, count] of Object.entries(paradropUnits)) {
        toProv.units[toHex][type] = (toProv.units[toHex][type] || 0) + count;
        fromProv.units[fromHex][type] = (fromProv.units[fromHex][type] || 0) - count;
        if (fromProv.units[fromHex][type] <= 0) delete fromProv.units[fromHex][type];
    }
    if (Object.keys(fromProv.units[fromHex]).length === 0) delete fromProv.units[fromHex];

    if (!toProv.hexOwner) toProv.hexOwner = {};
    toProv.hexOwner[toHex] = me.country;

    const allMine = (toProv.hexes || []).every(([c, r]) => {
        const k = `${c},${r}`;
        return (toProv.hexOwner[k] || toProv.country) === me.country;
    });
    let provinceCaptured = false;
    if (allMine) {
        toProv.country = me.country;
        provinceCaptured = true;
    }

    me.airUnits.transport = Math.max(0, transports - 1);

    state.eventLog.push({
        turn: state.turn, title: '🪂',
        message: `${me.username} высадил десант в ${toProv.name}${provinceCaptured ? ' — вся провинция!' : ''}`
    });
    if (state.eventLog.length > 50) state.eventLog = state.eventLog.slice(-50);

    pushStateUpdate(req.params.id, state);
    res.json({ success: true, state });
});

// ============================================================
//  🎲 ЛОГИКА ХОДА
// ============================================================

function processEndTurn(state) {
    let safety = 0;
    while (safety < 100) {
        safety++;
        state.currentPlayerIndex = (state.currentPlayerIndex + 1) % state.players.length;
        const currentPlayer = state.players[state.currentPlayerIndex];

        if (state.currentPlayerIndex === 0) {
            state.turn++;
            state.players.forEach(p => { p.armyMovement = {}; });
            processProduction(state);
            processConstruction(state);
            processAirProduction(state);
            processResources(state);

            try { gameStateModule.processMarketContracts(state); } catch (e) { console.error('processMarketContracts:', e.message); }
            try { gameStateModule.processAllAITurns(state); } catch (e) { console.error('processAllAITurns:', e.message); }
        }

        if (!currentPlayer.isAI) break;
    }

    if (safety >= 100) {
        console.warn('⚠️ processEndTurn: превышен лимит итераций');
    }
}

function processResources(state) {
    for (const player of state.players) {
        if (!isValidCountry(player.country)) continue;

        let steel = 0, oil = 0, manpower = 0;
        Object.values(state.provinces).forEach(prov => {
            if (prov.country !== player.country) return;
            const res = PROVINCE_RESOURCES[prov.resource] || PROVINCE_RESOURCES.none;
            steel += res.steel || 0;
            oil += res.oil || 0;
            manpower += res.manpowerBonus || 0;
        });
        player.steelPool = (player.steelPool || 0) + steel;
        player.oilPool = (player.oilPool || 0) + oil;
        const pool = player.manpowerPool || 0;
        const draft = Math.floor(pool * 0.001) + manpower;
        player.resources.manpower = (player.resources.manpower || 0) + draft;
        player.manpowerPool = Math.max(0, pool - draft);
    }
}

function processProduction(state) {
    for (const player of state.players) {
        if (!player.productionQueue) continue;
        const income = calculateMilIC(state, player);
        player.productionQueue = player.productionQueue.filter(item => {
            item.progress += income * (item.speedPerMilIC || 1);
            if (item.progress >= item.totalProgress) {
                const prov = state.provinces[item.provinceId];
                if (prov && prov.country === player.country) {
                    if (!prov.units) prov.units = {};
                    if (!prov.units[item.hexKey]) prov.units[item.hexKey] = {};
                    prov.units[item.hexKey][item.unitType] =
                        (prov.units[item.hexKey][item.unitType] || 0) + 1;
                }
                return false;
            }
            return true;
        });
    }
}

function processConstruction(state) {
    for (const player of state.players) {
        if (!player.constructionQueue) continue;
        const civIC = calculateCivIC(state, player);
        player.constructionQueue = player.constructionQueue.filter(item => {
            item.progress += civIC;
            if (item.progress >= item.totalProgress) {
                const prov = state.provinces[item.provinceId];
                if (prov && prov.country === player.country) {
                    if (item.type === 'civFactory') prov.civFactories = (prov.civFactories || 0) + 1;
                    else if (item.type === 'milFactory') prov.milFactories = (prov.milFactories || 0) + 1;
                    else if (item.type === 'airFactory') prov.airFactories = (prov.airFactories || 0) + 1;
                    else if (item.type === 'airbase') prov.airbases = (prov.airbases || 0) + 1;
                    else if (item.type === 'aagun') prov.aaguns = (prov.aaguns || 0) + 1;
                }
                return false;
            }
            return true;
        });
    }
}

function processAirProduction(state) {
    for (const player of state.players) {
        if (!player.airProductionQueue) continue;
        const milIC = calculateMilIC(state, player);
        player.airProductionQueue = player.airProductionQueue.filter(item => {
            item.progress += milIC;
            if (item.progress >= item.totalProgress) {
                if (!player.airUnits) player.airUnits = { fighters: 0, bombers: 0, transport: 0 };
                player.airUnits[item.airType] = (player.airUnits[item.airType] || 0) + 1;
                return false;
            }
            return true;
        });
    }
}

function calculateCivIC(state, player) {
    let c = 0;
    Object.values(state.provinces).forEach(p => {
        if (p.country === player.country) c += p.civFactories || 0;
    });
    return Math.floor(c * 0.8);
}

function calculateMilIC(state, player) {
    let c = 0;
    Object.values(state.provinces).forEach(p => {
        if (p.country === player.country) c += p.milFactories || 0;
    });
    return Math.floor(c);
}

// ============================================================
//  ⚔️ ЮНИТЫ
// ============================================================

function recruitUnit(state, player, provinceId, hexKey, unitType) {
    const prov = state.provinces[provinceId];
    if (!prov) return { error: 'Провинция не найдена' };
    if (prov.country !== player.country) return { error: 'Не ваша провинция' };

    const cost = UNIT_COSTS[unitType];
    if (!cost) return { error: 'Неизвестный тип юнита' };

    if ((player.resources.manpower || 0) < cost.manpowerCost) {
        return { error: `Не хватает людей (нужно ${cost.manpowerCost})` };
    }
    if ((player.steelPool || 0) < cost.steelCost) {
        return { error: `Не хватает стали (нужно ${cost.steelCost})` };
    }

    const existing = (prov.units?.[hexKey] || {});
    const inQueue = (player.productionQueue || []).filter(q =>
        q.provinceId === provinceId && q.hexKey === hexKey
    ).length;
    if (getHexUnitCount(existing) + inQueue >= MAX_UNITS_PER_HEX) {
        return { error: 'Гекс полон' };
    }
    if ((player.productionQueue || []).length >= 5) {
        return { error: 'Очередь производства заполнена (5/5)' };
    }

    player.resources.manpower -= cost.manpowerCost;
    player.steelPool -= cost.steelCost;

    if (!player.productionQueue) player.productionQueue = [];
    player.productionQueue.push({
        unitType, provinceId, hexKey,
        progress: 0, totalProgress: cost.buildProgress,
        speedPerMilIC: cost.speedPerMilIC,
        startedTurn: state.turn, stalled: null
    });

    return { success: true };
}

// 🔥 FIX: движение теперь работает МЕЖДУ провинциями
function moveUnit(state, player, provinceId, fromHex, toHex, moveUnits) {
    if (!areNeighbors(fromHex, toHex)) return { error: 'Только на соседний гекс' };

    // 🔥 FIX: находим ИСХОДНУЮ провинцию по гексу (не доверяем provinceId)
    let fromProv = null, fromProvId = null;
    let toProv = null, toProvId = null;
    for (const [id, p] of Object.entries(state.provinces)) {
        if (isSeaProvince(p)) continue;
        const hexSet = new Set((p.hexes || []).map(([c, r]) => `${c},${r}`));
        if (hexSet.has(fromHex)) { fromProv = p; fromProvId = id; }
        if (hexSet.has(toHex)) { toProv = p; toProvId = id; }
    }
    if (!fromProv) return { error: 'Исходный гекс не найден на карте' };
    if (!toProv) return { error: 'Целевой гекс не найден на карте' };

    // 🔥 FIX: проверяем владельца ЦЕЛЕВОГО гекса (может быть в другой провинции!)
    const targetOwner = getHexOwner(toProv, toHex);
    if (targetOwner !== player.country) {
        return { error: 'Можно двигать только на свой гекс' };
    }

    const fromUnits = fromProv.units?.[fromHex] || {};
    const totalFrom = getHexUnitCount(fromUnits);
    if (totalFrom === 0) return { error: 'Нет войск на исходном гексе' };

    const st = getArmyMP(player, fromHex);
    if (st.mp < MP_COST_MOVE) return { error: 'Нет очков движения' };

    let unitsToMove = moveUnits;
    if (!unitsToMove || Object.keys(unitsToMove).length === 0) {
        unitsToMove = { ...fromUnits };
    }

    const target = toProv.units?.[toHex] || {};
    const totalTarget = getHexUnitCount(target);
    const moving = getHexUnitCount(unitsToMove);

    if (totalTarget + moving > MAX_UNITS_PER_HEX) {
        return { error: 'На целевом гексе нет места' };
    }

    let oilCost = 0;
    for (const [t, n] of Object.entries(unitsToMove)) {
        if (t === 'tanks') oilCost += n * OIL_COST_TANK_MOVE;
        else if (t === 'artillery') oilCost += n * OIL_COST_ARTILLERY_MOVE;
    }
    if (oilCost > 0 && (player.oilPool || 0) < oilCost) {
        return { error: `Не хватает нефти (нужно ${oilCost})` };
    }
    if (oilCost > 0) player.oilPool -= oilCost;

    const newFrom = { ...fromUnits };
    const newTo = { ...target };
    for (const [t, n] of Object.entries(unitsToMove)) {
        newFrom[t] = Math.max(0, (newFrom[t] || 0) - n);
        if (newFrom[t] === 0) delete newFrom[t];
        newTo[t] = (newTo[t] || 0) + n;
    }

    // 🔥 FIX: пишем в правильные провинции
    if (!fromProv.units) fromProv.units = {};
    if (getHexUnitCount(newFrom) === 0) delete fromProv.units[fromHex];
    else fromProv.units[fromHex] = newFrom;

    if (!toProv.units) toProv.units = {};
    toProv.units[toHex] = newTo;

    st.mp -= MP_COST_MOVE;
    return { success: true };
}

function disbandUnit(state, player, provinceId, hexKey, unitType) {
    const prov = state.provinces[provinceId];
    if (!prov) return { error: 'Провинция не найдена' };
    const units = prov.units?.[hexKey] || {};
    if (!units[unitType] || units[unitType] <= 0) return { error: 'Нет такого юнита' };

    const cost = UNIT_COSTS[unitType];
    units[unitType] -= 1;
    if (units[unitType] === 0) delete units[unitType];
    if (getHexUnitCount(units) === 0) delete prov.units[hexKey];

    player.resources.manpower = (player.resources.manpower || 0) + Math.floor(cost.manpowerCost * 0.5);
    player.steelPool = (player.steelPool || 0) + Math.floor(cost.steelCost * 0.5);

    return { success: true };
}

// ============================================================
//  ⚔️ АТАКА ГЕКСА
// ============================================================
function attackHex(state, player, fromHex, toHex) {
    let fromProv = null, fromProvId = null;
    let toProv = null, toProvId = null;
    for (const [id, p] of Object.entries(state.provinces)) {
        const set = new Set((p.hexes || []).map(([c, r]) => `${c},${r}`));
        if (set.has(fromHex)) { fromProv = p; fromProvId = id; }
        if (set.has(toHex)) { toProv = p; toProvId = id; }
    }
    if (!fromProv || !toProv) return { error: 'Провинции не найдены' };
    if (!areNeighbors(fromHex, toHex)) return { error: 'Только соседний гекс' };

    const fromUnits = fromProv.units?.[fromHex] || {};
    if (getHexUnitCount(fromUnits) === 0) return { error: 'Нет войск' };

    const targetOwner = getHexOwner(toProv, toHex);
    if (targetOwner === player.country) return { error: 'Это ваш гекс' };
    if (!isValidCountry(targetOwner)) return { error: 'Это море' };

    const atWar = (state.wars || []).some(w =>
        (w.attacker === player.country && w.defender === targetOwner) ||
        (w.defender === player.country && w.attacker === targetOwner)
    );
    if (!atWar) {
        const targetName = COUNTRIES_NAMES[targetOwner] || targetOwner;
        return { error: `Сначала объявите войну ${targetName}!` };
    }

    const st = getArmyMP(player, fromHex);
    if (st.mp < MP_COST_ATTACK) return { error: 'Нет очков движения' };

    let oilCost = 0;
    for (const [t, n] of Object.entries(fromUnits)) {
        if (t === 'tanks') oilCost += n * OIL_COST_TANK_ATTACK;
        else if (t === 'artillery') oilCost += n * OIL_COST_ARTILLERY_ATTACK;
    }
    if (oilCost > 0 && (player.oilPool || 0) < oilCost) {
        return { error: `Не хватает нефти (нужно ${oilCost})` };
    }
    if (oilCost > 0) player.oilPool -= oilCost;

    const fatigue = Math.min(st.attacks * ATTACK_FATIGUE_PENALTY, 0.9);
    const atkRaw = getHexStrength(fromUnits, true);
    const atkFinal = atkRaw * (1 - fatigue);

    const toUnits = toProv.units?.[toHex] || {};
    const defStr = getHexStrength(toUnits, false);

    const [tc, tr] = toHex.split(',').map(Number);
    const tDirs = (tr & 1) ? ODD_DIRS : EVEN_DIRS;
    let support = 0;
    for (const [dc, dr] of tDirs) {
        const nk = `${tc + dc},${tr + dr}`;
        const owner = getHexOwner(toProv, nk);
        if (owner === player.country) {
            const nUnits = toProv.units?.[nk] || {};
            support += getHexStrength(nUnits, true) * 0.2;
        }
    }
    const totalAtk = atkFinal + support;

    st.mp -= MP_COST_ATTACK;
    st.attacks += 1;

    let captured = false;
    let provinceCaptured = false;

    if (totalAtk > defStr) {
        captured = true;
        if (!toProv.hexOwner) toProv.hexOwner = {};
        toProv.hexOwner[toHex] = player.country;

        const survivors = {};
        for (const [t, n] of Object.entries(toUnits)) {
            const left = Math.floor(n * 0.3);
            if (left > 0) survivors[t] = left;
        }

        if (getHexUnitCount(survivors) > 0) {
            const retreat = findRetreatHex(toProv, toHex, new Set([fromHex, toHex]), targetOwner);
            if (retreat) {
                toProv.units[retreat] = toProv.units[retreat] || {};
                for (const [t, n] of Object.entries(survivors)) {
                    toProv.units[retreat][t] = (toProv.units[retreat][t] || 0) + n;
                }
            }
        }

        const atkSurvivors = {};
        for (const [t, n] of Object.entries(fromUnits)) {
            const left = Math.max(1, Math.floor(n * 0.8));
            atkSurvivors[t] = left;
        }
        if (!toProv.units) toProv.units = {};
        toProv.units[toHex] = atkSurvivors;
        delete fromProv.units[fromHex];

        const allMine = (toProv.hexes || []).every(([c, r]) => {
            const k = `${c},${r}`;
            return getHexOwner(toProv, k) === player.country;
        });
        if (allMine) {
            toProv.country = player.country;
            provinceCaptured = true;
            state.eventLog.push({
                turn: state.turn, title: '🏴',
                message: `${player.username} захватил ${toProv.name}`
            });
        }
    } else {
        const atkSurvivors = {};
        for (const [t, n] of Object.entries(fromUnits)) {
            const left = Math.floor(n * 0.5);
            if (left > 0) atkSurvivors[t] = left;
        }
        if (getHexUnitCount(atkSurvivors) === 0) {
            const cheap = Object.entries(fromUnits)
                .filter(([, n]) => n > 0)
                .sort((a, b) => (UNIT_COSTS[a[0]]?.steelCost || 0) - (UNIT_COSTS[b[0]]?.steelCost || 0))[0];
            if (cheap) atkSurvivors[cheap[0]] = 1;
        }
        fromProv.units[fromHex] = atkSurvivors;

        const defSurvivors = {};
        for (const [t, n] of Object.entries(toUnits)) {
            const left = Math.max(1, Math.floor(n * 0.8));
            defSurvivors[t] = left;
        }
        toProv.units[toHex] = defSurvivors;
    }

    state.eventLog.push({
        turn: state.turn, title: captured ? '⚔️' : '🛡️',
        message: `${player.username} ${captured ? 'захватил' : 'не смог захватить'} ${toHex}`
    });
    if (state.eventLog.length > 50) state.eventLog = state.eventLog.slice(-50);

    return {
        success: true,
        captured,
        provinceCaptured,
        attackerStrength: Math.round(totalAtk * 10) / 10,
        defenderStrength: Math.round(defStr * 10) / 10,
        supportBonus: Math.round(support * 10) / 10,
        fatiguePenalty: Math.round(fatigue * 100),
        oilCost
    };
}

// ============================================================
//  🔌 SOCKET.IO — ОБРАБОТЧИКИ
// ============================================================
io.on('connection', (socket) => {
    console.log(`🔌 Подключён: ${socket.id}`);

    // 🔥 WS: регистрация игрока
    socket.on('register', ({ username }) => {
        if (!username) return;
        memory.players[socket.id] = { username, roomId: null };
        socket.username = username;
        socket.emit('registered', { username });
        console.log(`✅ WebSocket зарегистрирован: ${username}`);
    });

    // 🔥 WS: вход в комнату
    socket.on('join-room', ({ roomId }) => {
        if (!roomId) return;
        socket.join(roomId);
        if (memory.players[socket.id]) {
            memory.players[socket.id].roomId = roomId;
        }
        if (socket.username) {
            socket.to(roomId).emit('player-online', { username: socket.username });
        }
        console.log(`🚪 ${socket.username || socket.id} вошёл в ${roomId}`);
    });

    // 🔥 WS: выход из комнаты
    socket.on('leave-room', ({ roomId }) => {
        if (!roomId) return;
        socket.leave(roomId);
        if (memory.players[socket.id]) {
            memory.players[socket.id].roomId = null;
        }
        if (socket.username) {
            socket.to(roomId).emit('player-offline', { username: socket.username });
        }
    });

    // 🔥 WS: отключение
    socket.on('disconnect', () => {
        const player = memory.players[socket.id];
        if (player) {
            console.log(`❌ ${player.username} отключился`);
            if (player.roomId) {
                io.to(player.roomId).emit('player-offline', { username: player.username });
            }
            delete memory.players[socket.id];
        }
    });
});

// ============================================================
//  🧹 АВТООЧИСТКА
// ============================================================
setInterval(() => {
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    let cleaned = 0;
    Object.values(memory.rooms).forEach(room => {
        if (room.createdAt < oneDayAgo) {
            delete memory.rooms[room.id];
            delete memory.gameStates[room.id];
            cleaned++;
        }
    });
    if (cleaned > 0) console.log(`🧹 Автоочистка: удалено ${cleaned} комнат`);
}, 60 * 60 * 1000);

// ============================================================
//  📄 РАЗДАЧА СТРАНИЦ
// ============================================================
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/game.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'game.html'));
});

app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'Not found: ' + req.path });
    }
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============================================================
//  🚀 ЗАПУСК
// ============================================================
server.listen(PORT, () => {
    console.log(`
🎮 ═══════════════════════════════════════
   GAME SERVER
   Порт: ${PORT}
   Платформа: ${PLATFORM_URL}
   game-state.js: подключён ✅
   Фильтр воды: активен ✅
   Переход между провинциями: активен ✅
   WebSocket: активен ✅
═══════════════════════════════════════════
    `);
});