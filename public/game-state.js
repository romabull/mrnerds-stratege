// ============ 🧠 СОСТОЯНИЕ ИГРЫ ============
// Этот файл используется и в браузере (как <script>), и в Node.js (require)

// ============ 🔧 FALLBACK-КОНСТАНТЫ ДЛЯ NODE.JS ============
if (typeof UNIT_STATS === 'undefined') {
    var UNIT_STATS = {
        infantry: { attack: 1.0, defense: 1.2, name: 'Пехота', icon: '🪖' },
        tanks:    { attack: 2.0, defense: 1.5, name: 'Танки',  icon: '⚔️' },
        artillery:{ attack: 2.5, defense: 1.0, name: 'Артиллерия', icon: '🎯' }
    };
}

if (typeof BUILDING_TYPES === 'undefined') {
    var BUILDING_TYPES = {
        civFactory: { name: '🏭 Гражданский завод', cost: 40, steelCost: 0,  buildTime: 90 },
        milFactory: { name: '⚙️ Военный завод',     cost: 50, steelCost: 20, buildTime: 120 }
    };
}

if (typeof UNIT_COSTS === 'undefined') {
    var UNIT_COSTS = {
        infantry:  { manpowerCost: 10, steelCost: 5,  oilCost: 0, buildProgress: 30, speedPerMilIC: 1.0 },
        tanks:     { manpowerCost: 5,  steelCost: 20, oilCost: 0, buildProgress: 60, speedPerMilIC: 1.0 },
        artillery: { manpowerCost: 8,  steelCost: 12, oilCost: 0, buildProgress: 45, speedPerMilIC: 1.0 }
    };
}

if (typeof MAX_UNITS_PER_HEX === 'undefined') {
    var MAX_UNITS_PER_HEX = 3;
}

if (typeof MIL_LINE_COSTS === 'undefined') {
    var MIL_LINE_COSTS = {
        infantry:  { steelPerMil: 0.5, oilPerMil: 0 },
        tanks:     { steelPerMil: 2.0, oilPerMil: 0.5 },
        artillery: { steelPerMil: 1.0, oilPerMil: 0 }
    };
}

if (typeof ODD_DIRS === 'undefined') {
    var ODD_DIRS  = [[+1,0],[-1,0],[0,-1],[-1,-1],[0,+1],[-1,+1]];
}
if (typeof EVEN_DIRS === 'undefined') {
    var EVEN_DIRS = [[+1,0],[-1,0],[+1,-1],[0,-1],[+1,+1],[0,+1]];
}

if (typeof AIR_STATS === 'undefined') {
    var AIR_STATS = {
        fighters: { name: 'Истребители', icon: '✈️', attack: 3.0, defense: 3.0, range: 8, hp: 10, cost: 15, manpower: 2, oil: 1, buildProgress: 40, speedPerMilIC: 1.0 },
        bombers:  { name: 'Бомбардировщики', icon: '💣', attack: 5.0, defense: 1.5, range: 12, hp: 12, cost: 25, manpower: 3, oil: 2, buildProgress: 60, speedPerMilIC: 1.0 },
        transport:{ name: 'Транспортники', icon: '🪂', attack: 0.5, defense: 1.0, range: 15, hp: 8, cost: 20, manpower: 4, oil: 1, buildProgress: 50, speedPerMilIC: 1.0 }
    };
}

if (typeof MP_PER_TURN === 'undefined') var MP_PER_TURN = 2;
if (typeof MP_COST_MOVE === 'undefined') var MP_COST_MOVE = 1;
if (typeof MP_COST_ATTACK === 'undefined') var MP_COST_ATTACK = 1;
if (typeof OIL_COST_TANK_ATTACK === 'undefined') var OIL_COST_TANK_ATTACK = 2;
if (typeof OIL_COST_TANK_MOVE === 'undefined') var OIL_COST_TANK_MOVE = 1;
if (typeof OIL_COST_ARTILLERY_ATTACK === 'undefined') var OIL_COST_ARTILLERY_ATTACK = 1;
if (typeof OIL_COST_ARTILLERY_MOVE === 'undefined') var OIL_COST_ARTILLERY_MOVE = 1;

// ============ 🔥 FIX: ГЛАВНАЯ ФУНКЦИЯ-ФИЛЬТР ============
// Вода, море, null, undefined — это НЕ страна
function isValidCountry(c) {
    if (!c) return false;
    if (typeof c !== 'string') return false;
    if (c === 'water') return false;
    if (c === 'sea') return false;
    if (c === 'null') return false;
    if (c === 'undefined') return false;
    return true;
}

// Проверка, что провинция — не море
function isSeaProvince(prov) {
    if (!prov) return true;
    if (prov.country === 'water') return true;
    if (prov.isSea === true) return true;
    if (prov.terrain === 'sea') return true;
    return false;
}

// 🔥 FIX: экспорт для использования в server.js
if (typeof module !== 'undefined' && module.exports) {
    // будет добавлено в конце
}

// ============ ⚡ MP ХЕЛПЕРЫ ============
function getArmyMP(player, hexKey) {
    if (!player.armyMovement) player.armyMovement = {};
    if (!player.armyMovement[hexKey]) {
        player.armyMovement[hexKey] = { mp: MP_PER_TURN, attacks: 0 };
    }
    return player.armyMovement[hexKey];
}

// ============ 🔧 УТИЛИТЫ ============
function getNeighborKeys(col, row) {
    const dirs = (row & 1) ? ODD_DIRS : EVEN_DIRS;
    return dirs.map(([dc, dr]) => `${col + dc},${row + dr}`);
}

function getHexStrength(unitData, isAttacker) {
    let strength = 0;
    if (!unitData) return 0;
    for (const [type, count] of Object.entries(unitData)) {
        if (count > 0 && UNIT_STATS[type]) {
            strength += count * (isAttacker ? UNIT_STATS[type].attack : UNIT_STATS[type].defense);
        }
    }
    return strength;
}

function getHexUnitCount(unitData) {
    if (!unitData) return 0;
    return Object.values(unitData).reduce((s, n) => s + n, 0);
}

function findRetreatHex(province, fromKey, targetKey, excludeKeys, preferredOwner) {
    const [c, r] = fromKey.split(',').map(Number);
    const neighbors = getNeighborKeys(c, r);
    const provinceHexSet = new Set(province.hexes.map(([hc, hr]) => `${hc},${hr}`));
    for (const nKey of neighbors) {
        if (nKey === targetKey) continue;
        if (excludeKeys.has(nKey)) continue;
        if (!provinceHexSet.has(nKey)) continue;
        if (preferredOwner) {
            const nOwner = province.hexOwner?.[nKey] || province.country;
            if (nOwner !== preferredOwner) continue;
        }
        return nKey;
    }
    return null;
}

function applyLosses(unitData, lossRatio) {
    const result = {};
    for (const [type, count] of Object.entries(unitData)) {
        if (count > 0) {
            const remaining = Math.max(0, Math.floor(count * (1 - lossRatio)));
            result[type] = remaining;
        }
    }
    return result;
}

// ============ 🔥 КЭШИ ДЛЯ ОПТИМИЗАЦИИ ============
let _hexMapCache = null;
let _hexMapCacheTurn = -1;
let _powerCache = null;
let _powerCacheTurn = -1;

function getHexMap(state) {
    if (_hexMapCache && _hexMapCacheTurn === state.turn) {
        return _hexMapCache;
    }
    const hexMap = {};
    for (const [provId, prov] of Object.entries(state.provinces)) {
        // 🔥 FIX: пропускаем море
        if (isSeaProvince(prov)) continue;
        for (const [c, r] of (prov.hexes || [])) {
            const k = `${c},${r}`;
            hexMap[k] = {
                provId,
                prov,
                owner: prov.hexOwner?.[k] || prov.country
            };
        }
    }
    _hexMapCache = hexMap;
    _hexMapCacheTurn = state.turn;
    return hexMap;
}

function clearHexMapCache() {
    _hexMapCache = null;
    _hexMapCacheTurn = -1;
}

function clearPowerCache() {
    _powerCache = null;
    _powerCacheTurn = -1;
}

const PROVINCE_RESOURCES = {
    grain:  { oil: 0, steel: 0, manpowerBonus: 1.0 },
    oil:    { oil: 4, steel: 0, manpowerBonus: 0.5 },
    metal:  { oil: 0, steel: 3, manpowerBonus: 0.5 },
    coal:   { oil: 0, steel: 1, manpowerBonus: 1.0 },
    rubber: { oil: 0, steel: 0, manpowerBonus: 0.5 },
    none:   { oil: 0, steel: 0, manpowerBonus: 0.2 }
};

// ============================================================
// ============ 🕊️ ДИПЛОМАТИЯ ============
// ============================================================

const FASCIST_COUNTRIES = ['germany', 'italy', 'hungary', 'romania', 'bulgaria', 'finland'];
const COMMUNIST_COUNTRIES = ['soviet'];
const DEMOCRATIC_COUNTRIES = ['uk', 'france', 'netherlands', 'belgium', 'sweden', 'norway', 'denmark', 'czechoslovakia', 'switzerland', 'ireland'];

function getPlayerPower(state, player) {
    if (!_powerCache || _powerCacheTurn !== state.turn) {
        _powerCache = {};
        _powerCacheTurn = state.turn;
    }
    if (_powerCache[player.country] !== undefined) {
        return _powerCache[player.country];
    }
    let power = 0;
    for (const prov of Object.values(state.provinces)) {
        if (prov.country !== player.country) continue;
        for (const u of Object.values(prov.units || {})) {
            for (const [t, n] of Object.entries(u)) {
                if (UNIT_STATS[t]) {
                    power += n * (UNIT_STATS[t].attack + UNIT_STATS[t].defense) / 2;
                }
            }
        }
        power += (prov.civFactories || 0) * 0.5 + (prov.milFactories || 0) * 1.0;
        power += (prov.population || 0) * 0.1;
    }
    power = Math.round(power);
    _powerCache[player.country] = power;
    return power;
}

function countPlayerTroops(state, player) {
    let troops = 0;
    Object.values(state.provinces).forEach(prov => {
        if (prov.country !== player.country) return;
        Object.values(prov.units || {}).forEach(u => {
            troops += Object.values(u).reduce((s, n) => s + (n || 0), 0);
        });
    });
    return troops;
}

function isAtWar(state, c1, c2) {
    // 🔥 FIX: вода не воюет
    if (!isValidCountry(c1) || !isValidCountry(c2)) return false;
    return (state.wars || []).some(w =>
        (w.attacker === c1 && w.defender === c2) ||
        (w.defender === c1 && w.attacker === c2)
    );
}

function isAllied(state, c1, c2) {
    // 🔥 FIX: вода не в союзах
    if (!isValidCountry(c1) || !isValidCountry(c2)) return false;
    return (state.alliances || []).some(a =>
        a.members.includes(c1) && a.members.includes(c2)
    );
}

function hasPact(state, c1, c2) {
    // 🔥 FIX: вода не в пактах
    if (!isValidCountry(c1) || !isValidCountry(c2)) return false;
    return (state.pacts || []).some(p =>
        (p.a === c1 && p.b === c2) || (p.b === c1 && p.a === c2)
    );
}

function hasPendingOffer(state, from, to, type) {
    // 🔥 FIX: вода не в предложениях
    if (!isValidCountry(from) || !isValidCountry(to)) return false;
    return (state.diplomaticOffers || []).some(o =>
        o.from === from && o.to === to && o.type === type && o.status === 'pending'
    );
}

function aiDiplomaticDecision(state, aiPlayer, fromPlayer, type, terms = {}) {
    // 🔥 FIX: если кто-то из них вода — отказ
    if (!isValidCountry(aiPlayer.country) || !isValidCountry(fromPlayer.country)) {
        return { accept: false, reason: 'Неверная страна' };
    }

    const aiPower = getPlayerPower(state, aiPlayer);
    const fromPower = getPlayerPower(state, fromPlayer);
    const powerRatio = fromPower / Math.max(1, aiPower);

    const atWar = isAtWar(state, aiPlayer.country, fromPlayer.country);
    const allied = isAllied(state, aiPlayer.country, fromPlayer.country);

    if (type === 'peace') {
        if (!atWar) return { accept: false, reason: 'Мы и так не в состоянии войны' };
        const chance = Math.min(0.85, 0.25 + powerRatio * 0.3);
        const aiTroops = countPlayerTroops(state, aiPlayer);
        const fromTroops = countPlayerTroops(state, fromPlayer);
        if (fromTroops > aiTroops * 1.5) return { accept: true, reason: 'Мы принимаем мир — у вас перевес' };
        if (chance > 0.5 && Math.random() < chance) return { accept: true, reason: 'Мир принят' };
        return { accept: false, reason: 'Мы продолжаем борьбу' };
    }

    if (type === 'alliance') {
        if (allied) return { accept: false, reason: 'Мы уже союзники' };
        if (atWar) return { accept: false, reason: 'Мы воюем друг с другом' };
        const balance = 1 - Math.abs(1 - powerRatio) / 2;
        const bothStrong = (aiPower + fromPower) > 50;
        let chance = 0.15 + balance * 0.4 + (bothStrong ? 0.2 : 0);

        const aiF = FASCIST_COUNTRIES.includes(aiPlayer.country);
        const aiC = COMMUNIST_COUNTRIES.includes(aiPlayer.country);
        const aiD = DEMOCRATIC_COUNTRIES.includes(aiPlayer.country);
        const fF = FASCIST_COUNTRIES.includes(fromPlayer.country);
        const fC = COMMUNIST_COUNTRIES.includes(fromPlayer.country);
        const fD = DEMOCRATIC_COUNTRIES.includes(fromPlayer.country);

        if ((aiF && fC) || (aiC && fF)) chance -= 0.4;
        if ((aiF && fD) || (aiD && fF)) chance -= 0.15;
        if ((aiC && fD) || (aiD && fC)) chance -= 0.2;

        if (chance > 0.5 && Math.random() < chance) return { accept: true, reason: 'Союз заключён' };
        return { accept: false, reason: 'Мы не готовы к союзу' };
    }

    if (type === 'non_aggression') {
        if (atWar) return { accept: false, reason: 'Мы в состоянии войны' };
        if (allied) return { accept: false, reason: 'Мы уже союзники' };
        const chance = 0.4 + Math.min(0.4, powerRatio * 0.2);
        if (chance > 0.5 && Math.random() < chance) return { accept: true, reason: 'Пакт подписан' };
        return { accept: false, reason: 'Мы отказываемся' };
    }

    if (type === 'ultimatum') {
        if (powerRatio > 2.5) return { accept: true, reason: 'Мы принимаем ультиматум' };
        if (powerRatio > 1.5 && Math.random() < 0.4) return { accept: true, reason: 'Мы уступаем' };
        return { accept: false, reason: 'Мы отвергаем ультиматум!' };
    }

    return { accept: false, reason: 'Неизвестный тип' };
}

function processDiplomacyAction(state, me, action, target, terms, options = {}) {
    const recalcBordersForProvinces = options.recalcBordersForProvinces || (() => {});

    // 🔥 FIX: проверка, что me — валидная страна
    if (!me || !isValidCountry(me.country)) {
        return { error: 'Неверная страна игрока' };
    }

    if (!state.wars) state.wars = [];
    if (!state.alliances) state.alliances = [];
    if (!state.diplomaticOffers) state.diplomaticOffers = [];
    if (!state.pacts) state.pacts = [];
    if (!state.eventLog) state.eventLog = [];

    const pushLog = (title, message) => {
        state.eventLog.push({ turn: state.turn, title, message });
        if (state.eventLog.length > 50) state.eventLog = state.eventLog.slice(-50);
    };

    // 🔥 FIX: для действий с целью — цель должна быть валидной страной
    const targetRequiredActions = ['war', 'peace', 'alliance', 'non_aggression', 'ultimatum', 'break_alliance', 'break_pact'];
    if (targetRequiredActions.includes(action)) {
        if (!isValidCountry(target)) {
            return { error: 'Нельзя взаимодействовать с водой' };
        }
    }

    let targetPlayer = null;
    if (target && target !== 'all' && isValidCountry(target)) {
        targetPlayer = state.players.find(p => p.country === target);
        if (!targetPlayer) {
            targetPlayer = { country: target, username: `ИИ (${target})`, isAI: true };
        }
    }

    if (action === 'war') {
        if (!targetPlayer) return { error: 'Не указана цель' };
        if (targetPlayer.country === me.country) return { error: 'Нельзя воевать с собой' };
        if (!isValidCountry(targetPlayer.country)) {
            return { error: 'Нельзя воевать с водой' };
        }
        if (isAtWar(state, me.country, targetPlayer.country)) return { error: 'Уже в состоянии войны' };
        if (hasPact(state, me.country, targetPlayer.country)) {
            state.pacts = state.pacts.filter(p =>
                !((p.a === me.country && p.b === targetPlayer.country) ||
                  (p.b === me.country && p.a === targetPlayer.country))
            );
            me.unrest = Math.min(100, (me.unrest || 0) + 5);
            pushLog('💔', `${me.username} нарушил пакт о ненападении с ${targetPlayer.username}! Unrest +5`);
        }

        state.wars.push({
            attacker: me.country,
            defender: targetPlayer.country,
            startedTurn: state.turn,
            attackerName: me.username,
            defenderName: targetPlayer.username
        });
        pushLog('⚔️', `${me.username} объявил войну ${targetPlayer.username} (${targetPlayer.country})`);
        return { success: true };
    }

    if (action === 'peace') {
        if (!targetPlayer) return { error: 'Не указана цель' };
        const war = state.wars.find(w =>
            (w.attacker === me.country && w.defender === targetPlayer.country) ||
            (w.defender === me.country && w.attacker === targetPlayer.country)
        );
        if (!war) return { error: 'Вы не в войне с этой страной' };

        if (targetPlayer.isAI) {
            const decision = aiDiplomaticDecision(state, targetPlayer, me, 'peace', terms);
            if (decision.accept) {
                state.wars = state.wars.filter(w => w !== war);
                pushLog('🕊️', `${me.username} заключил мир с ${targetPlayer.username}. ${decision.reason}`);
            } else {
                pushLog('❌', `${targetPlayer.username} отклонил мир: ${decision.reason}`);
            }
        } else {
            if (hasPendingOffer(state, me.country, targetPlayer.country, 'peace')) {
                return { error: 'Предложение уже отправлено' };
            }
            state.diplomaticOffers.push({
                id: 'offer_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
                type: 'peace',
                from: me.country, fromName: me.username,
                to: targetPlayer.country, toName: targetPlayer.username,
                terms: terms || {}, status: 'pending', createdTurn: state.turn
            });
            pushLog('📨', `${me.username} предложил мир ${targetPlayer.username}`);
        }
        return { success: true };
    }

    if (action === 'alliance') {
        if (!targetPlayer) return { error: 'Не указана цель' };
        if (isAllied(state, me.country, targetPlayer.country)) return { error: 'Уже в союзе' };

        if (targetPlayer.isAI) {
            const decision = aiDiplomaticDecision(state, targetPlayer, me, 'alliance', terms);
            if (decision.accept) {
                state.alliances.push({
                    id: 'alliance_' + Date.now(),
                    members: [me.country, targetPlayer.country],
                    memberNames: [me.username, targetPlayer.username],
                    createdTurn: state.turn,
                    name: `Союз ${me.country}—${targetPlayer.country}`
                });
                pushLog('🤝', `${me.username} и ${targetPlayer.username} заключили союз! ${decision.reason}`);
            } else {
                pushLog('❌', `${targetPlayer.username} отклонил союз: ${decision.reason}`);
            }
        } else {
            if (hasPendingOffer(state, me.country, targetPlayer.country, 'alliance')) {
                return { error: 'Предложение уже отправлено' };
            }
            state.diplomaticOffers.push({
                id: 'offer_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
                type: 'alliance',
                from: me.country, fromName: me.username,
                to: targetPlayer.country, toName: targetPlayer.username,
                terms: terms || {}, status: 'pending', createdTurn: state.turn
            });
            pushLog('📨', `${me.username} предложил союз ${targetPlayer.username}`);
        }
        return { success: true };
    }

    if (action === 'non_aggression') {
        if (!targetPlayer) return { error: 'Не указана цель' };
        if (hasPact(state, me.country, targetPlayer.country)) return { error: 'Пакт уже действует' };

        if (targetPlayer.isAI) {
            const decision = aiDiplomaticDecision(state, targetPlayer, me, 'non_aggression', terms);
            if (decision.accept) {
                state.pacts.push({
                    a: me.country, b: targetPlayer.country,
                    aName: me.username, bName: targetPlayer.username,
                    createdTurn: state.turn
                });
                pushLog('📜', `${me.username} и ${targetPlayer.username} подписали пакт о ненападении. ${decision.reason}`);
            } else {
                pushLog('❌', `${targetPlayer.username} отклонил пакт: ${decision.reason}`);
            }
        } else {
            if (hasPendingOffer(state, me.country, targetPlayer.country, 'non_aggression')) {
                return { error: 'Предложение уже отправлено' };
            }
            state.diplomaticOffers.push({
                id: 'offer_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
                type: 'non_aggression',
                from: me.country, fromName: me.username,
                to: targetPlayer.country, toName: targetPlayer.username,
                terms: terms || {}, status: 'pending', createdTurn: state.turn
            });
            pushLog('📨', `${me.username} предложил пакт о ненападении ${targetPlayer.username}`);
        }
        return { success: true };
    }

    if (action === 'ultimatum') {
        if (!targetPlayer) return { error: 'Не указана цель' };
        const provinceId = terms?.provinceId;
        if (!provinceId) return { error: 'Не указана провинция' };
        const prov = state.provinces[provinceId];
        if (!prov) return { error: 'Провинция не найдена' };
        if (prov.country !== targetPlayer.country) return { error: 'Провинция не принадлежит цели' };

        if (targetPlayer.isAI) {
            const decision = aiDiplomaticDecision(state, targetPlayer, me, 'ultimatum', terms);
            if (decision.accept) {
                prov.country = me.country;
                prov.hexOwner = {};
                (prov.hexes || []).forEach(([c, r]) => { prov.hexOwner[`${c},${r}`] = me.country; });
                pushLog('⚠️', `${targetPlayer.username} принял ультиматум ${me.username}. ${prov.name} перешла!`);
                try { recalcBordersForProvinces(state, [provinceId]); } catch (e) {}
            } else {
                state.wars.push({
                    attacker: me.country, defender: targetPlayer.country,
                    startedTurn: state.turn,
                    attackerName: me.username, defenderName: targetPlayer.username
                });
                pushLog('⚔️', `${targetPlayer.username} отверг ультиматум! ${me.username} объявил войну.`);
            }
        } else {
            if (hasPendingOffer(state, me.country, targetPlayer.country, 'ultimatum')) {
                return { error: 'Ультиматум уже отправлен' };
            }
            state.diplomaticOffers.push({
                id: 'offer_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
                type: 'ultimatum',
                from: me.country, fromName: me.username,
                to: targetPlayer.country, toName: targetPlayer.username,
                terms: { provinceId }, status: 'pending', createdTurn: state.turn
            });
            pushLog('📨', `${me.username} выдвинул ультиматум ${targetPlayer.username}`);
        }
        return { success: true };
    }

    if (action === 'accept') {
        const offerId = terms?.offerId;
        const offer = state.diplomaticOffers.find(o => o.id === offerId && o.to === me.country && o.status === 'pending');
        if (!offer) return { error: 'Предложение не найдено' };

        if (offer.type === 'peace') {
            state.wars = state.wars.filter(w =>
                !((w.attacker === offer.from && w.defender === me.country) ||
                  (w.defender === offer.from && w.attacker === me.country))
            );
            pushLog('🕊️', `${me.username} принял мир от ${offer.fromName}`);
        } else if (offer.type === 'alliance') {
            state.alliances.push({
                id: 'alliance_' + Date.now(),
                members: [offer.from, me.country],
                memberNames: [offer.fromName, me.username],
                createdTurn: state.turn,
                name: `Союз ${offer.from}—${me.country}`
            });
            pushLog('🤝', `${me.username} и ${offer.fromName} заключили союз!`);
        } else if (offer.type === 'non_aggression') {
            state.pacts.push({
                a: offer.from, b: me.country,
                aName: offer.fromName, bName: me.username,
                createdTurn: state.turn
            });
            pushLog('📜', `${me.username} и ${offer.fromName} подписали пакт о ненападении`);
        } else if (offer.type === 'ultimatum') {
            const prov = state.provinces[offer.terms.provinceId];
            if (prov) {
                prov.country = offer.from;
                prov.hexOwner = {};
                (prov.hexes || []).forEach(([c, r]) => { prov.hexOwner[`${c},${r}`] = offer.from; });
                pushLog('⚠️', `${me.username} принял ультиматум ${offer.fromName}. ${prov.name} перешла!`);
                try { recalcBordersForProvinces(state, [offer.terms.provinceId]); } catch (e) {}
            }
        }
        offer.status = 'accepted';
        return { success: true };
    }

    if (action === 'decline') {
        const offerId = terms?.offerId;
        const offer = state.diplomaticOffers.find(o => o.id === offerId && o.to === me.country && o.status === 'pending');
        if (!offer) return { error: 'Предложение не найдено' };
        offer.status = 'declined';
        pushLog('❌', `${me.username} отклонил предложение от ${offer.fromName}`);
        return { success: true };
    }

    if (action === 'break_alliance') {
        if (!targetPlayer) return { error: 'Не указана цель' };
        state.alliances = state.alliances.filter(a =>
            !(a.members.includes(me.country) && a.members.includes(targetPlayer.country))
        );
        pushLog('💔', `${me.username} разорвал союз с ${targetPlayer.username}`);
        return { success: true };
    }

    if (action === 'break_pact') {
        if (!targetPlayer) return { error: 'Не указана цель' };
        state.pacts = state.pacts.filter(p =>
            !((p.a === me.country && p.b === targetPlayer.country) ||
              (p.b === me.country && p.a === targetPlayer.country))
        );
        pushLog('💔', `${me.username} разорвал пакт с ${targetPlayer.username}`);
        return { success: true };
    }

    return { error: 'Неизвестное действие' };
}

// ============================================================
// ============ 💰 РЫНОК ============
// ============================================================

function countCivFactoriesOf(state, player) {
    let count = 0;
    Object.values(state.provinces).forEach(prov => {
        if (prov.country === player.country) count += prov.civFactories || 0;
    });
    return count;
}

function countMilFactoriesOf(state, player) {
    let count = 0;
    Object.values(state.provinces).forEach(prov => {
        if (prov.country === player.country) count += prov.milFactories || 0;
    });
    return count;
}

function calculateSurplus(state, player) {
    let steel = 0, oil = 0;
    Object.values(state.provinces).forEach(prov => {
        if (prov.country !== player.country) return;
        const res = PROVINCE_RESOURCES[prov.resource] || PROVINCE_RESOURCES.none;
        steel += res.steel || 0;
        oil += res.oil || 0;
    });

    const civTotal = countCivFactoriesOf(state, player);
    const milTotal = countMilFactoriesOf(state, player);
    const civFree = Math.max(0, civTotal - (player.civFactoriesLeased || 0));
    const milFree = Math.max(0, milTotal - (player.milFactoriesLeased || 0));

    return { steel, oil, civFree, milFree, civTotal, milTotal,
        civLeased: player.civFactoriesLeased || 0,
        milLeased: player.milFactoriesLeased || 0 };
}

function aiMarketDecision(state, aiPlayer, offer) {
    // 🔥 FIX: вода не торгует
    if (!isValidCountry(aiPlayer.country) || !isValidCountry(offer.from)) {
        return { accept: false, reason: 'Неверная страна' };
    }

    const needSteel = (aiPlayer.steelPool || 0) < 150;
    const needOil = (aiPlayer.oilPool || 0) < 80;

    const offeringSteel = offer.giveSteel > 0;
    const offeringOil = offer.giveOil > 0;

    if (!offeringSteel && !offeringOil) {
        return { accept: false, reason: 'Ресурсы нам не нужны' };
    }

    const surplus = calculateSurplus(state, aiPlayer);

    if (offer.wantCivFactory > 0 && surplus.civFree < offer.wantCivFactory) {
        return { accept: false, reason: 'Нет свободных CIV-фабрик' };
    }
    if (offer.wantMilFactory > 0 && surplus.milFree < offer.wantMilFactory) {
        return { accept: false, reason: 'Нет свободных MIL-фабрик' };
    }

    const steelValue = offer.giveSteel * 1;
    const oilValue = offer.giveOil * 1.5;
    const factoryCost = offer.wantCivFactory * 30 + offer.wantMilFactory * 50;

    const resourceValue = steelValue + oilValue;
    const isGenerous = resourceValue >= factoryCost * 0.9;

    if (!isGenerous && resourceValue < factoryCost * 0.7) {
        return { accept: false, reason: 'Слишком мало ресурсов за фабрику' };
    }

    if (!needSteel && !needOil && !isGenerous) {
        return { accept: false, reason: 'Запасы полны, сделка невыгодна' };
    }

    if (isAtWar(state, aiPlayer.country, offer.from)) {
        return { accept: false, reason: 'Мы в войне' };
    }

    return { accept: true, reason: 'Сделка выгодна' };
}

function createContractFromOffer(state, offer) {
    if (!state.activeContracts) state.activeContracts = [];

    // 🔥 FIX: вода не участвует в контрактах
    if (!isValidCountry(offer.from) || !isValidCountry(offer.to)) return;

    const a = state.players.find(p => p.country === offer.from);
    const b = state.players.find(p => p.country === offer.to);
    if (!a || !b) return;

    if (offer.wantCivFactory > 0) {
        b.civFactoriesLeased = (b.civFactoriesLeased || 0) + offer.wantCivFactory;
        a.civFactoriesRented = (a.civFactoriesRented || 0) + offer.wantCivFactory;
    }
    if (offer.wantMilFactory > 0) {
        b.milFactoriesLeased = (b.milFactoriesLeased || 0) + offer.wantMilFactory;
        a.milFactoriesRented = (a.milFactoriesRented || 0) + offer.wantMilFactory;
    }
    if (offer.giveCivFactory > 0) {
        a.civFactoriesLeased = (a.civFactoriesLeased || 0) + offer.giveCivFactory;
        b.civFactoriesRented = (b.civFactoriesRented || 0) + offer.giveCivFactory;
    }
    if (offer.giveMilFactory > 0) {
        a.milFactoriesLeased = (a.milFactoriesLeased || 0) + offer.giveMilFactory;
        b.milFactoriesRented = (b.milFactoriesRented || 0) + offer.giveMilFactory;
    }

    state.activeContracts.push({
        id: 'ct_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
        a: offer.from, aName: offer.fromName,
        b: offer.to, bName: b.username,
        aGivesSteel: offer.giveSteel || 0,
        aGivesOil: offer.giveOil || 0,
        bGivesSteel: offer.wantSteel || 0,
        bGivesOil: offer.wantOil || 0,
        bGivesCiv: offer.wantCivFactory || 0,
        bGivesMil: offer.wantMilFactory || 0,
        aGivesCiv: offer.giveCivFactory || 0,
        aGivesMil: offer.giveMilFactory || 0,
        startedTurn: state.turn,
        cancelled: false
    });
}

function returnLeasedFactories(state, contract) {
    const a = state.players.find(p => p.country === contract.a);
    const b = state.players.find(p => p.country === contract.b);
    if (!a || !b) return;

    if (contract.bGivesCiv > 0) {
        b.civFactoriesLeased = Math.max(0, (b.civFactoriesLeased || 0) - contract.bGivesCiv);
        a.civFactoriesRented = Math.max(0, (a.civFactoriesRented || 0) - contract.bGivesCiv);
    }
    if (contract.bGivesMil > 0) {
        b.milFactoriesLeased = Math.max(0, (b.milFactoriesLeased || 0) - contract.bGivesMil);
        a.milFactoriesRented = Math.max(0, (a.milFactoriesRented || 0) - contract.bGivesMil);
    }
    if (contract.aGivesCiv > 0) {
        a.civFactoriesLeased = Math.max(0, (a.civFactoriesLeased || 0) - contract.aGivesCiv);
        b.civFactoriesRented = Math.max(0, (b.civFactoriesRented || 0) - contract.aGivesCiv);
    }
    if (contract.aGivesMil > 0) {
        a.milFactoriesLeased = Math.max(0, (a.milFactoriesLeased || 0) - contract.aGivesMil);
        b.milFactoriesRented = Math.max(0, (b.milFactoriesRented || 0) - contract.aGivesMil);
    }
}

function processMarketContracts(state) {
    if (!state.activeContracts) state.activeContracts = [];
    if (!state.eventLog) state.eventLog = [];

    for (const contract of [...state.activeContracts]) {
        if (contract.cancelled) continue;

        // 🔥 FIX: если в контракте вода — отменяем
        if (!isValidCountry(contract.a) || !isValidCountry(contract.b)) {
            contract.cancelled = true;
            continue;
        }

        const a = state.players.find(p => p.country === contract.a);
        const b = state.players.find(p => p.country === contract.b);
        if (!a || !b) {
            contract.cancelled = true;
            returnLeasedFactories(state, contract);
            continue;
        }

        let cancelled = false;

        if (contract.aGivesSteel > 0) {
            if ((a.steelPool || 0) >= contract.aGivesSteel) {
                a.steelPool -= contract.aGivesSteel;
                b.steelPool = (b.steelPool || 0) + contract.aGivesSteel;
            } else { cancelled = true; }
        }
        if (contract.aGivesOil > 0 && !cancelled) {
            if ((a.oilPool || 0) >= contract.aGivesOil) {
                a.oilPool -= contract.aGivesOil;
                b.oilPool = (b.oilPool || 0) + contract.aGivesOil;
            } else { cancelled = true; }
        }
        if (contract.bGivesSteel > 0 && !cancelled) {
            if ((b.steelPool || 0) >= contract.bGivesSteel) {
                b.steelPool -= contract.bGivesSteel;
                a.steelPool = (a.steelPool || 0) + contract.bGivesSteel;
            } else { cancelled = true; }
        }
        if (contract.bGivesOil > 0 && !cancelled) {
            if ((b.oilPool || 0) >= contract.bGivesOil) {
                b.oilPool -= contract.bGivesOil;
                a.oilPool = (a.oilPool || 0) + contract.bGivesOil;
            } else { cancelled = true; }
        }

        if (cancelled) {
            contract.cancelled = true;
            returnLeasedFactories(state, contract);
            state.eventLog.push({
                turn: state.turn, title: '⚠️',
                message: `Контракт ${contract.aName}—${contract.bName} расторгнут`
            });
        }
    }

    state.activeContracts = state.activeContracts.filter(c => !c.cancelled);
    if (state.eventLog.length > 50) state.eventLog = state.eventLog.slice(-50);
}

function processMarketAction(state, me, action, data) {
    if (!state.marketOffers) state.marketOffers = [];
    if (!state.activeContracts) state.activeContracts = [];
    if (!state.eventLog) state.eventLog = [];

    // 🔥 FIX: игрок должен быть валидной страной
    if (!me || !isValidCountry(me.country)) {
        return { error: 'Неверная страна игрока' };
    }

    const pushLog = (title, message) => {
        state.eventLog.push({ turn: state.turn, title, message });
        if (state.eventLog.length > 50) state.eventLog = state.eventLog.slice(-50);
    };

    if (action === 'create') {
        const { to, giveSteel, giveOil, wantCivFactory, wantMilFactory } = data;

        // 🔥 FIX: нельзя торговать с водой
        if (to && to !== 'open' && !isValidCountry(to)) {
            return { error: 'Нельзя торговать с водой' };
        }

        const offer = {
            id: 'mo_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
            from: me.country,
            fromName: me.username,
            to: to || 'open',
            toName: '',
            giveSteel: parseInt(giveSteel) || 0,
            giveOil: parseInt(giveOil) || 0,
            wantCivFactory: parseInt(wantCivFactory) || 0,
            wantMilFactory: parseInt(wantMilFactory) || 0,
            status: to && to !== 'open' ? 'pending' : 'open',
            createdTurn: state.turn
        };

        if (offer.giveSteel <= 0 && offer.giveOil <= 0) {
            return { error: 'Нужно что-то продавать (сталь или нефть)' };
        }
        if (offer.wantCivFactory <= 0 && offer.wantMilFactory <= 0) {
            return { error: 'Нужно что-то просить (фабрики)' };
        }

        const surplus = calculateSurplus(state, me);
        if (offer.giveSteel > surplus.steel) {
            return { error: `Не хватает избытка стали (есть ${surplus.steel})` };
        }
        if (offer.giveOil > surplus.oil) {
            return { error: `Не хватает избытка нефти (есть ${surplus.oil})` };
        }

        if (to && to !== 'open') {
            const target = state.players.find(p => p.country === to);
            if (target) {
                offer.toName = target.username;
                state.marketOffers.push(offer);
                pushLog('📨', `${me.username} предложил сделку ${offer.toName}`);
            } else {
                offer.toName = `ИИ (${to})`;
                const aiPlayer = { country: to, username: `ИИ (${to})`, isAI: true };
                const decision = aiMarketDecision(state, aiPlayer, offer);
                if (decision.accept) {
                    offer.status = 'accepted';
                    if (offer.wantCivFactory > 0) {
                        me.civFactoriesRented = (me.civFactoriesRented || 0) + offer.wantCivFactory;
                    }
                    if (offer.wantMilFactory > 0) {
                        me.milFactoriesRented = (me.milFactoriesRented || 0) + offer.wantMilFactory;
                    }
                    state.activeContracts.push({
                        id: 'ct_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
                        a: me.country, aName: me.username,
                        b: to, bName: `ИИ (${to})`,
                        aGivesSteel: offer.giveSteel,
                        aGivesOil: offer.giveOil,
                        bGivesCiv: offer.wantCivFactory,
                        bGivesMil: offer.wantMilFactory,
                        startedTurn: state.turn,
                        cancelled: false
                    });
                    pushLog('💰', `${me.username} заключил контракт с ИИ (${to}): ${decision.reason}`);
                } else {
                    offer.status = 'declined';
                    pushLog('❌', `ИИ (${to}) отклонил сделку: ${decision.reason}`);
                }
                state.marketOffers.push(offer);
            }
        } else {
            state.marketOffers.push(offer);
            pushLog('📢', `${me.username} выставил на рынок: ${offer.giveSteel}🔩 ${offer.giveOil}⛽`);
        }
        return { success: true };
    }

    if (action === 'accept') {
        const offerId = data.offerId;
        const offer = state.marketOffers.find(o => o.id === offerId && (o.status === 'open' || o.status === 'pending'));
        if (!offer) return { error: 'Предложение не найдено' };
        if (offer.from === me.country) return { error: 'Нельзя принять своё' };

        // 🔥 FIX: нельзя принять сделку от воды
        if (!isValidCountry(offer.from)) {
            return { error: 'Нельзя торговать с водой' };
        }

        if ((me.tradeEmbargo || []).includes(offer.from)) {
            return { error: 'Эта страна у вас в эмбарго' };
        }
        const fromPlayer = state.players.find(p => p.country === offer.from);
        if (fromPlayer && (fromPlayer.tradeEmbargo || []).includes(me.country)) {
            return { error: 'Вы в эмбарго у этой страны' };
        }

        if (isAtWar(state, me.country, offer.from)) {
            return { error: 'Вы в войне с этой страной' };
        }

        const surplus = calculateSurplus(state, me);
        if (offer.wantCivFactory > surplus.civFree) {
            return { error: `Нет свободных CIV (${surplus.civFree} доступно)` };
        }
        if (offer.wantMilFactory > surplus.milFree) {
            return { error: `Нет свободных MIL (${surplus.milFree} доступно)` };
        }

        offer.status = 'accepted';
        offer.to = me.country;
        offer.toName = me.username;
        createContractFromOffer(state, offer);
        pushLog('🤝', `${me.username} принял сделку от ${offer.fromName}`);
        return { success: true };
    }

    if (action === 'decline') {
        const offer = state.marketOffers.find(o => o.id === data.offerId && o.status === 'pending');
        if (!offer) return { error: 'Предложение не найдено' };
        offer.status = 'declined';
        pushLog('❌', `${me.username} отклонил предложение от ${offer.fromName}`);
        return { success: true };
    }

    if (action === 'cancel_offer') {
        const offer = state.marketOffers.find(o => o.id === data.offerId && o.from === me.country);
        if (!offer) return { error: 'Предложение не найдено' };
        offer.status = 'cancelled';
        pushLog('❌', `${me.username} отозвал своё предложение`);
        return { success: true };
    }

    if (action === 'cancel_contract') {
        const contract = state.activeContracts.find(c => c.id === data.contractId && !c.cancelled);
        if (!contract) return { error: 'Контракт не найден' };
        if (contract.a !== me.country && contract.b !== me.country) {
            return { error: 'Это не ваш контракт' };
        }

        contract.cancelled = true;
        me.unrest = Math.min(100, (me.unrest || 0) + 10);
        returnLeasedFactories(state, contract);
        const otherName = contract.a === me.country ? contract.bName : contract.aName;
        pushLog('💔', `${me.username} разорвал контракт с ${otherName}! Unrest +10`);
        state.activeContracts = state.activeContracts.filter(c => c.id !== contract.id);
        return { success: true };
    }

    if (action === 'embargo') {
        const { target, enable } = data;
        // 🔥 FIX: нельзя эмбарго против воды
        if (!isValidCountry(target)) {
            return { error: 'Нельзя ввести эмбарго против воды' };
        }
        if (!me.tradeEmbargo) me.tradeEmbargo = [];

        if (enable) {
            if (!me.tradeEmbargo.includes(target)) {
                me.tradeEmbargo.push(target);
                pushLog('🚫', `${me.username} ввёл эмбарго против ${target}`);
            }
        } else {
            me.tradeEmbargo = me.tradeEmbargo.filter(c => c !== target);
            pushLog('✅', `${me.username} снял эмбарго с ${target}`);
        }
        return { success: true };
    }

    return { error: 'Неизвестное действие' };
}

// ============================================================
// ============ 🤖 ИИ-ХОДЫ ============
// ============================================================

const AI_BUILD_INTERVAL = 4;
const AI_RECRUIT_INTERVAL = 1;
const AI_DIPLO_INTERVAL = 3;
const AI_MARKET_INTERVAL = 2;
const AI_AGGRESSION_INTERVAL = 2;
const AI_COALITION_INTERVAL = 8;

const AI_PEACE_PERIOD_TURNS = 3;

const AI_ATTACK_POWER_RATIO_HISTORICAL = 1.5;
const AI_ATTACK_POWER_RATIO_OTHER = 2.2;

const HISTORICAL_FRIENDS = {
    germany: ['italy', 'hungary', 'bulgaria', 'romania', 'finland', 'japan'],
    italy: ['germany', 'hungary', 'bulgaria', 'romania', 'finland'],
    soviet: ['czechoslovakia'],
    uk: ['france', 'poland'],
    france: ['uk', 'poland', 'czechoslovakia'],
    poland: ['uk', 'france', 'romania'],
    czechoslovakia: ['france', 'uk', 'soviet', 'romania', 'yugoslavia'],
    romania: ['czechoslovakia', 'yugoslavia', 'poland', 'france'],
    yugoslavia: ['czechoslovakia', 'romania', 'france'],
    hungary: ['germany', 'italy', 'bulgaria'],
    bulgaria: ['germany', 'italy', 'hungary'],
    finland: ['germany', 'sweden', 'estonia'],
    sweden: ['finland', 'norway', 'denmark'],
    norway: ['sweden', 'denmark', 'uk'],
    denmark: ['sweden', 'norway', 'uk'],
    estonia: ['latvia', 'lithuania', 'finland'],
    latvia: ['estonia', 'lithuania'],
    lithuania: ['estonia', 'latvia', 'poland'],
    spain: ['portugal', 'italy', 'germany'],
    portugal: ['spain', 'uk'],
    netherlands: ['belgium', 'uk', 'france'],
    belgium: ['netherlands', 'france', 'uk'],
    switzerland: [],
    turkey: ['uk', 'france'],
    greece: ['uk', 'france', 'yugoslavia', 'romania'],
    iran: ['uk', 'soviet'],
    iraq: ['uk'],
    saudi: ['uk'],
    afghanistan: []
};

const NEUTRAL_COUNTRIES = ['switzerland', 'sweden', 'spain', 'portugal', 'ireland', 'turkey', 'afghanistan', 'saudi', 'iraq'];

const HISTORICAL_TARGETS = {
    germany: ['poland', 'czechoslovakia', 'france', 'soviet', 'belgium', 'netherlands', 'denmark', 'norway'],
    soviet: ['finland', 'estonia', 'latvia', 'lithuania', 'poland', 'romania'],
    italy: ['yugoslavia', 'greece', 'albania', 'egypt'],
    hungary: ['romania', 'yugoslavia', 'czechoslovakia'],
    romania: ['hungary', 'bulgaria'],
    bulgaria: ['greece', 'yugoslavia', 'romania', 'turkey'],
    finland: ['soviet'],
    japan: ['china']
};

function isHistoricalFriend(c1, c2) {
    if (!isValidCountry(c1) || !isValidCountry(c2)) return false;
    if (c1 === c2) return true;
    const f1 = HISTORICAL_FRIENDS[c1] || [];
    const f2 = HISTORICAL_FRIENDS[c2] || [];
    return f1.includes(c2) || f2.includes(c1);
}

function isNeutral(country) {
    if (!isValidCountry(country)) return false;
    return NEUTRAL_COUNTRIES.includes(country);
}

function getAllAIPlayers(state) {
    return state.players.filter(p => p.isAI && p.isAlive !== false && isValidCountry(p.country));
}

// 🔇 Показываем только важные события
const IMPORTANT_AI_LOG_TITLES = ['⚔️', '🤝', '📜', '🏴', '💔', '⚠️', '🕊️', '❌'];

function pushAILog(state, title, message) {
    if (!IMPORTANT_AI_LOG_TITLES.includes(title)) return;
    if (!state.eventLog) state.eventLog = [];
    state.eventLog.push({ turn: state.turn, title, message });
    if (state.eventLog.length > 50) state.eventLog = state.eventLog.slice(-50);
}

// ============ ИИ: строительство ============
function aiBuildPhase(state, aiPlayer) {
    if (!isValidCountry(aiPlayer.country)) return;   // 🔥 FIX
    if (state.turn % AI_BUILD_INTERVAL !== 0) return;
    if (!aiPlayer.constructionQueue) aiPlayer.constructionQueue = [];
    if (aiPlayer.constructionQueue.length >= 2) return;

    const myProvs = Object.entries(state.provinces)
        .filter(([id, p]) => p.country === aiPlayer.country && !isSeaProvince(p));   // 🔥 FIX
    if (myProvs.length === 0) return;

    let bestProv = null;
    let bestScore = -1;
    for (const [id, p] of myProvs) {
        const score = (p.population || 0) * 10 + (p.civFactories || 0) * 5 + (p.milFactories || 0) * 3;
        if (score > bestScore) {
            bestScore = score;
            bestProv = { id, prov: p };
        }
    }
    if (!bestProv) return;

    const civCount = countCivFactoriesOf(state, aiPlayer);
    const milCount = countMilFactoriesOf(state, aiPlayer);
    const atWar = (state.wars || []).some(w =>
        w.attacker === aiPlayer.country || w.defender === aiPlayer.country
    );

    let buildType = 'civFactory';
    if (atWar) {
        buildType = milCount < civCount * 0.5 ? 'milFactory' : 'civFactory';
    } else {
        buildType = civCount < milCount * 3 ? 'civFactory' : 'milFactory';
    }

    const b = BUILDING_TYPES[buildType];

    if (b.steelCost > 0 && (aiPlayer.steelPool || 0) < b.steelCost) {
        if (buildType === 'milFactory') {
            buildType = 'civFactory';
        } else {
            return;
        }
    }

    const finalB = BUILDING_TYPES[buildType];
    if (finalB.steelCost > 0) {
        aiPlayer.steelPool -= finalB.steelCost;
    }

    aiPlayer.constructionQueue.push({
        type: buildType,
        provinceId: bestProv.id,
        progress: 0,
        totalProgress: finalB.buildTime,
        steelCost: finalB.steelCost,
        startedAt: state.turn
    });
}

// ============ ИИ: наём юнитов ============
function aiRecruitPhase(state, aiPlayer) {
    if (!isValidCountry(aiPlayer.country)) return;   // 🔥 FIX
    if (state.turn % AI_RECRUIT_INTERVAL !== 0) return;
    if (!aiPlayer.productionQueue) aiPlayer.productionQueue = [];
    if (aiPlayer.productionQueue.length >= 8) return;

    const MAX_PER_TURN = 3;
    let placed = 0;

    for (let attempt = 0; attempt < MAX_PER_TURN && placed < MAX_PER_TURN; attempt++) {
        const myProvs = Object.entries(state.provinces)
            .filter(([id, p]) => p.country === aiPlayer.country && !isSeaProvince(p));   // 🔥 FIX
        if (myProvs.length === 0) break;

        const borderProvs = myProvs.filter(([id, p]) => p.borderHexes && p.borderHexes.length > 0);
        const tryProvs = borderProvs.length > 0 ? borderProvs : myProvs;

        let slot = null;
        for (const [id, p] of tryProvs) {
            const hexes = p.hexes || [];
            for (const [c, r] of hexes) {
                const key = `${c},${r}`;
                const units = p.units?.[key] || {};
                const cnt = Object.values(units).reduce((s, n) => s + (n || 0), 0);
                const inQueue = (aiPlayer.productionQueue || []).filter(
                    q => q.provinceId === id && q.hexKey === key
                ).length;
                if (cnt + inQueue < MAX_UNITS_PER_HEX) {
                    slot = { id, hexKey: key };
                    break;
                }
            }
            if (slot) break;
        }
        if (!slot) break;

        const split = aiPlayer.milSplit || { infantry: 45, tanks: 20, artillery: 15, air: 20 };
        const roll = Math.random() * 100;
        let unitType = 'infantry';
        if (roll < split.infantry) unitType = 'infantry';
        else if (roll < split.infantry + split.tanks) unitType = 'tanks';
        else unitType = 'artillery';

        const u = UNIT_COSTS[unitType];
        if (!u) break;

        if ((aiPlayer.resources?.manpower || 0) < u.manpowerCost) break;
        if ((aiPlayer.steelPool || 0) < u.steelCost) break;

        aiPlayer.resources.manpower -= u.manpowerCost;
        aiPlayer.steelPool -= u.steelCost;

        aiPlayer.productionQueue.push({
            unitType,
            provinceId: slot.id,
            hexKey: slot.hexKey,
            progress: 0,
            totalProgress: u.buildProgress,
            speedPerMilIC: u.speedPerMilIC,
            startedTurn: state.turn,
            stalled: null
        });
        placed++;
    }
}

// ============ ИИ: дипломатия ============
function aiDiplomacyPhase(state, aiPlayer) {
    if (!isValidCountry(aiPlayer.country)) return;   // 🔥 FIX
    if (state.turn % AI_DIPLO_INTERVAL !== 0) return;

    const allCountries = new Set();
    Object.values(state.provinces).forEach(p => {
        // 🔥 FIX: жёсткая фильтрация
        if (!isValidCountry(p.country)) return;
        if (isSeaProvince(p)) return;
        allCountries.add(p.country);
    });
    allCountries.delete(aiPlayer.country);

    const atWarWith = new Set();
    (state.wars || []).forEach(w => {
        if (w.attacker === aiPlayer.country && isValidCountry(w.defender)) atWarWith.add(w.defender);
        if (w.defender === aiPlayer.country && isValidCountry(w.attacker)) atWarWith.add(w.attacker);
    });
    const alliedWith = new Set();
    (state.alliances || []).forEach(a => {
        if (a.members.includes(aiPlayer.country)) {
            a.members.forEach(m => { if (m !== aiPlayer.country && isValidCountry(m)) alliedWith.add(m); });
        }
    });

    const candidates = Array.from(allCountries).filter(c =>
        !atWarWith.has(c) && !alliedWith.has(c)
    );
    if (candidates.length === 0) return;

    const isFascist = FASCIST_COUNTRIES.includes(aiPlayer.country);
    const isCommunist = COMMUNIST_COUNTRIES.includes(aiPlayer.country);
    const isDemocratic = DEMOCRATIC_COUNTRIES.includes(aiPlayer.country);

    candidates.sort((a, b) => {
        let scoreA = 0, scoreB = 0;
        if (isHistoricalFriend(aiPlayer.country, a)) scoreA += 20;
        if (isHistoricalFriend(aiPlayer.country, b)) scoreB += 20;
        if (isFascist) {
            scoreA += FASCIST_COUNTRIES.includes(a) ? 10 : 0;
            scoreB += FASCIST_COUNTRIES.includes(b) ? 10 : 0;
        } else if (isCommunist) {
            scoreA += COMMUNIST_COUNTRIES.includes(a) ? 10 : 0;
            scoreB += COMMUNIST_COUNTRIES.includes(b) ? 10 : 0;
        } else if (isDemocratic) {
            scoreA += DEMOCRATIC_COUNTRIES.includes(a) ? 10 : 0;
            scoreB += DEMOCRATIC_COUNTRIES.includes(b) ? 10 : 0;
        }
        return scoreB - scoreA;
    });

    const roll = Math.random();
    if (roll > 0.75) return;

    const target = candidates[0];
    const targetPlayer = state.players.find(p => p.country === target);

    if (!targetPlayer || targetPlayer.isAI) {
        const aiTarget = targetPlayer || { country: target, username: `ИИ (${target})`, isAI: true };
        if (roll < 0.3) {
            if (isAllied(state, aiPlayer.country, target)) return;
            const decision = aiDiplomaticDecision(state, aiTarget, aiPlayer, 'alliance');
            if (decision.accept) {
                state.alliances.push({
                    id: 'alliance_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
                    members: [aiPlayer.country, target],
                    memberNames: [aiPlayer.username, aiTarget.username],
                    createdTurn: state.turn,
                    name: `Союз ${aiPlayer.country}—${target}`
                });
                pushAILog(state, '🤝', `${aiPlayer.username} и ${aiTarget.username} заключили союз`);
            }
        } else {
            if (hasPact(state, aiPlayer.country, target)) return;
            const decision = aiDiplomaticDecision(state, aiTarget, aiPlayer, 'non_aggression');
            if (decision.accept) {
                state.pacts.push({
                    a: aiPlayer.country, b: target,
                    aName: aiPlayer.username, bName: aiTarget.username,
                    createdTurn: state.turn
                });
                pushAILog(state, '📜', `${aiPlayer.username} подписал пакт с ${aiTarget.username}`);
            }
        }
        return;
    }

    if (!state.diplomaticOffers) state.diplomaticOffers = [];

    if (roll < 0.3) {
        if (isAllied(state, aiPlayer.country, target)) return;
        const already = state.diplomaticOffers.some(o =>
            o.from === aiPlayer.country && o.to === target &&
            o.type === 'alliance' && o.status === 'pending'
        );
        if (already) return;

        state.diplomaticOffers.push({
            id: 'offer_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
            type: 'alliance',
            from: aiPlayer.country, fromName: aiPlayer.username,
            to: target, toName: targetPlayer.username,
            terms: {}, status: 'pending', createdTurn: state.turn
        });
        pushAILog(state, '📨', `${aiPlayer.username} предложил союз ${targetPlayer.username}`);
    } else if (roll < 0.7) {
        if (hasPact(state, aiPlayer.country, target)) return;
        const already = state.diplomaticOffers.some(o =>
            o.from === aiPlayer.country && o.to === target &&
            o.type === 'non_aggression' && o.status === 'pending'
        );
        if (already) return;

        state.diplomaticOffers.push({
            id: 'offer_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
            type: 'non_aggression',
            from: aiPlayer.country, fromName: aiPlayer.username,
            to: target, toName: targetPlayer.username,
            terms: {}, status: 'pending', createdTurn: state.turn
        });
        pushAILog(state, '📨', `${aiPlayer.username} предложил пакт ${targetPlayer.username}`);
    }
}

// ============ ИИ: агрессия ============
function aiAggressionPhase(state, aiPlayer) {
    if (!isValidCountry(aiPlayer.country)) return;   // 🔥 FIX
    if (state.turn < AI_PEACE_PERIOD_TURNS) return;
    if (state.turn % AI_AGGRESSION_INTERVAL !== 0) return;

    const atWar = (state.wars || []).some(w =>
        w.attacker === aiPlayer.country || w.defender === aiPlayer.country
    );
    if (atWar) return;

    if (isNeutral(aiPlayer.country) && state.turn < 30) return;

    const myPower = getPlayerPower(state, aiPlayer);
    const hexMap = getHexMap(state);

    const neighborCountries = new Set();
    for (const [provId, prov] of Object.entries(state.provinces)) {
        if (prov.country !== aiPlayer.country) continue;
        if (isSeaProvince(prov)) continue;   // 🔥 FIX
        for (const hexKey of (prov.borderHexes || [])) {
            const [c, r] = hexKey.split(',').map(Number);
            const dirs = (r & 1) ? ODD_DIRS : EVEN_DIRS;
            for (const [dc, dr] of dirs) {
                const nk = `${c + dc},${r + dr}`;
                const cell = hexMap[nk];
                if (!cell) continue;
                if (cell.owner === aiPlayer.country) continue;
                // 🔥 FIX: жёсткая фильтрация воды
                if (!isValidCountry(cell.owner)) continue;
                neighborCountries.add(cell.owner);
            }
        }
    }

    const historical = HISTORICAL_TARGETS[aiPlayer.country] || [];

    const targets = Array.from(neighborCountries).filter(c => {
        // 🔥 FIX: жёсткая проверка
        if (!isValidCountry(c)) return false;
        if (isAllied(state, aiPlayer.country, c)) return false;
        if (hasPact(state, aiPlayer.country, c)) return false;
        if (isAtWar(state, aiPlayer.country, c)) return false;
        if (isHistoricalFriend(aiPlayer.country, c)) return false;
        if (isNeutral(c) && state.turn < 30) return false;
        return true;
    });

    if (targets.length === 0) return;

    targets.sort((a, b) => {
        const aHist = historical.includes(a) ? 100 : 0;
        const bHist = historical.includes(b) ? 100 : 0;
        return bHist - aHist;
    });

    const historicalTargets = targets.filter(t => historical.includes(t));
    const finalTargets = historicalTargets.length > 0 ? historicalTargets : targets;

    for (const target of finalTargets) {
        const targetPlayer = state.players.find(p => p.country === target);
        if (!targetPlayer) continue;

        const targetPower = getPlayerPower(state, targetPlayer);
        const isHistorical = historical.includes(target);

        const requiredRatio = isHistorical ? AI_ATTACK_POWER_RATIO_HISTORICAL : AI_ATTACK_POWER_RATIO_OTHER;
        const baseChance = isHistorical ? 0.35 : 0.08;

        if (myPower > targetPower * requiredRatio && Math.random() < baseChance) {
            const hadPact = hasPact(state, aiPlayer.country, target);
            if (hadPact) {
                state.pacts = state.pacts.filter(p =>
                    !((p.a === aiPlayer.country && p.b === target) ||
                      (p.b === aiPlayer.country && p.a === target))
                );
                aiPlayer.unrest = Math.min(100, (aiPlayer.unrest || 0) + 5);
            }

            state.wars.push({
                attacker: aiPlayer.country,
                defender: target,
                startedTurn: state.turn,
                attackerName: aiPlayer.username,
                defenderName: targetPlayer.username
            });
            pushAILog(state, '⚔️', `${aiPlayer.username} объявил войну ${targetPlayer.username}!`);
            return;
        }
    }
}

// ============ ИИ: движение к границе ============
function aiMoveToBorder(state, aiPlayer) {
    if (!isValidCountry(aiPlayer.country)) return;   // 🔥 FIX

    const atWarWith = new Set();
    (state.wars || []).forEach(w => {
        if (w.attacker === aiPlayer.country && isValidCountry(w.defender)) atWarWith.add(w.defender);
        if (w.defender === aiPlayer.country && isValidCountry(w.attacker)) atWarWith.add(w.attacker);
    });
    if (atWarWith.size === 0) return;

    const myUnits = [];
    for (const [provId, prov] of Object.entries(state.provinces)) {
        if (isSeaProvince(prov)) continue;   // 🔥 FIX
        let hasMyHex = prov.country === aiPlayer.country;
        if (!hasMyHex && prov.hexOwner) {
            for (const owner of Object.values(prov.hexOwner)) {
                if (owner === aiPlayer.country) { hasMyHex = true; break; }
            }
        }
        if (!hasMyHex) continue;

        for (const [hexKey, unitData] of Object.entries(prov.units || {})) {
            const cnt = Object.values(unitData).reduce((s, n) => s + (n || 0), 0);
            if (cnt === 0) continue;
            const owner = prov.hexOwner?.[hexKey] || prov.country;
            if (owner === aiPlayer.country) {
                myUnits.push({ provId, hexKey, prov, unitData });
            }
        }
    }

    let movedCount = 0;
    const MAX_MOVES = 5;

    for (const unit of myUnits) {
        if (movedCount >= MAX_MOVES) break;
        if ((unit.prov.borderHexes || []).includes(unit.hexKey)) continue;

        const armyState = getArmyMP(aiPlayer, unit.hexKey);
        if (armyState.mp < MP_COST_MOVE) continue;

        const [c, r] = unit.hexKey.split(',').map(Number);
        const dirs = (r & 1) ? ODD_DIRS : EVEN_DIRS;
        const provHexSet = new Set(unit.prov.hexes.map(([x, y]) => `${x},${y}`));
        const borderSet = new Set(unit.prov.borderHexes || []);

        let bestMove = null;
        let bestDist = Infinity;

        for (const [dc, dr] of dirs) {
            const nk = `${c + dc},${r + dr}`;
            if (!provHexSet.has(nk)) continue;

            const targetOwner = unit.prov.hexOwner?.[nk] || unit.prov.country;
            if (targetOwner !== aiPlayer.country) continue;

            const targetUnits = unit.prov.units?.[nk] || {};
            const totalOnTarget = Object.values(targetUnits).reduce((s, n) => s + n, 0);
            const myCount = Object.values(unit.unitData).reduce((s, n) => s + n, 0);
            if (totalOnTarget + myCount > MAX_UNITS_PER_HEX) continue;

            const isBorder = borderSet.has(nk);
            const dist = isBorder ? 0 : 1;

            if (dist < bestDist) {
                bestDist = dist;
                bestMove = nk;
            }
            if (isBorder) break;
        }

        if (bestMove) {
            armyState.mp -= MP_COST_MOVE;

            if (!unit.prov.units) unit.prov.units = {};
            if (!unit.prov.units[bestMove]) unit.prov.units[bestMove] = {};
            for (const [t, n] of Object.entries(unit.unitData)) {
                unit.prov.units[bestMove][t] = (unit.prov.units[bestMove][t] || 0) + n;
            }
            delete unit.prov.units[unit.hexKey];

            const newState = getArmyMP(aiPlayer, bestMove);
            newState.mp = Math.min(newState.mp, armyState.mp);
            newState.attacks = Math.max(newState.attacks, armyState.attacks);

            movedCount++;
        }
    }
}

// ============ ИИ: военные действия ============
function aiCombatPhase(state, aiPlayer) {
    if (!isValidCountry(aiPlayer.country)) return;   // 🔥 FIX

    const atWarWith = new Set();
    (state.wars || []).forEach(w => {
        if (w.attacker === aiPlayer.country && isValidCountry(w.defender)) atWarWith.add(w.defender);
        if (w.defender === aiPlayer.country && isValidCountry(w.attacker)) atWarWith.add(w.attacker);
    });
    if (atWarWith.size === 0) return;

    const hexMap = getHexMap(state);

    const myUnits = [];
    for (const [provId, prov] of Object.entries(state.provinces)) {
        if (isSeaProvince(prov)) continue;   // 🔥 FIX
        let hasMyHex = prov.country === aiPlayer.country;
        if (!hasMyHex && prov.hexOwner) {
            for (const owner of Object.values(prov.hexOwner)) {
                if (owner === aiPlayer.country) { hasMyHex = true; break; }
            }
        }
        if (!hasMyHex) continue;

        for (const [hexKey, unitData] of Object.entries(prov.units || {})) {
            const cnt = Object.values(unitData).reduce((s, n) => s + (n || 0), 0);
            if (cnt === 0) continue;
            const owner = prov.hexOwner?.[hexKey] || prov.country;
            if (owner === aiPlayer.country) {
                myUnits.push({ provId, hexKey, prov, unitData });
            }
        }
    }

    if (myUnits.length === 0) return;

    let attacks = 0;
    const MAX_ATTACKS = 8;

    for (const unit of myUnits) {
        if (attacks >= MAX_ATTACKS) break;

        const [c, r] = unit.hexKey.split(',').map(Number);
        const dirs = (r & 1) ? ODD_DIRS : EVEN_DIRS;

        for (const [dc, dr] of dirs) {
            const nk = `${c + dc},${r + dr}`;
            const cell = hexMap[nk];
            if (!cell) continue;
            // 🔥 FIX: жёсткая фильтрация
            if (!isValidCountry(cell.owner)) continue;
            if (!atWarWith.has(cell.owner)) continue;
            if (cell.owner === aiPlayer.country) continue;

            const atkStrength = getHexStrength(unit.unitData, true);
            if (atkStrength <= 0) continue;

            const defStrength = getHexStrength(cell.prov.units?.[nk] || {}, false);

            if (atkStrength >= defStrength * 0.3 && atkStrength > 0) {
                const ok = executeAIAttack(state, aiPlayer, unit, {
                    prov: cell.prov,
                    hexKey: nk,
                    hexOwner: cell.owner,
                    atkStrength,
                    defStrength
                });
                if (ok) {
                    attacks++;
                    break;
                }
            }
        }
    }

    if (attacks > 0) {
        console.log(`⚔️ [AI ${aiPlayer.country}] совершил ${attacks} атак`);
    }
}

// ============ ИИ: атака ============
function executeAIAttack(state, attacker, fromUnit, target) {
    const { prov: toProv, hexKey: toHex, hexOwner: targetHexOwner } = target;
    const fromProv = fromUnit.prov;
    const fromHex = fromUnit.hexKey;
    const fromUnits = fromUnit.unitData;
    const toUnits = toProv.units?.[toHex] || {};

    // 🔥 FIX: нельзя атаковать воду
    if (!isValidCountry(targetHexOwner)) return false;

    const atkStrength = getHexStrength(fromUnits, true);
    const defStrength = getHexStrength(toUnits, false);

    if (atkStrength <= defStrength * 0.35) return false;

    const armyState = getArmyMP(attacker, fromHex);
    if (armyState.mp < MP_COST_ATTACK) return false;

    let oilCost = 0;
    for (const [type, count] of Object.entries(fromUnits)) {
        if (count > 0) {
            if (type === 'tanks') oilCost += count * OIL_COST_TANK_ATTACK;
            else if (type === 'artillery') oilCost += count * OIL_COST_ARTILLERY_ATTACK;
        }
    }
    if (oilCost > 0) {
        if ((attacker.oilPool || 0) < oilCost) return false;
        attacker.oilPool -= oilCost;
    }

    armyState.mp -= MP_COST_ATTACK;
    armyState.attacks += 1;

    const rawRatio = defStrength > 0
        ? Math.min(0.6, defStrength / atkStrength * 0.5)
        : 0;
    let survivingAttackers = applyLosses(fromUnits, rawRatio);

    let survivorsCount = Object.values(survivingAttackers).reduce((s, n) => s + n, 0);
    if (survivorsCount === 0) {
        const cheapest = Object.entries(fromUnits)
            .filter(([, n]) => n > 0)
            .sort((a, b) => (UNIT_COSTS[a[0]]?.steelCost || 0) - (UNIT_COSTS[b[0]]?.steelCost || 0))[0];
        if (cheapest) {
            survivingAttackers = { [cheapest[0]]: 1 };
            survivorsCount = 1;
        } else {
            return false;
        }
    }

    const excludeKeys = new Set([fromHex, toHex]);
    const retreatHex = findRetreatHex(toProv, toHex, toHex, excludeKeys, targetHexOwner);
    if (retreatHex && getHexUnitCount(toUnits) > 0) {
        const survivorDefenders = applyLosses(toUnits, 0.5);
        if (getHexUnitCount(survivorDefenders) > 0) {
            const existing = toProv.units[retreatHex] || {};
            const merged = { ...existing };
            for (const [t, n] of Object.entries(survivorDefenders)) {
                merged[t] = Math.min(MAX_UNITS_PER_HEX, (merged[t] || 0) + n);
            }
            toProv.units[retreatHex] = merged;
        }
    }

    delete toProv.units[toHex];
    fromProv.units[fromHex] = {};
    if (!toProv.units) toProv.units = {};
    toProv.units[toHex] = survivingAttackers;
    if (!toProv.hexOwner) toProv.hexOwner = {};
    toProv.hexOwner[toHex] = attacker.country;

    const newHexState = getArmyMP(attacker, toHex);
    newHexState.mp = Math.min(newHexState.mp, armyState.mp);
    newHexState.attacks = armyState.attacks;

    const allHexes = toProv.hexes || [];
    const allMine = allHexes.every(([c, r]) => {
        const k = `${c},${r}`;
        return (toProv.hexOwner[k] || toProv.country) === attacker.country;
    });

    if (allMine) {
        toProv.country = attacker.country;
        pushAILog(state, '🏴', `${attacker.username} захватил ${toProv.name}`);
    }

    return true;
}

// ============ ИИ: коалиция ============
function aiCoalitionPhase(state, aiPlayer) {
    if (!isValidCountry(aiPlayer.country)) return;   // 🔥 FIX
    if (state.turn < AI_PEACE_PERIOD_TURNS) return;
    if (state.turn % AI_COALITION_INTERVAL !== 0) return;
    if (Math.random() > 0.10) return;

    const countryProvCount = {};
    Object.values(state.provinces).forEach(p => {
        // 🔥 FIX: жёсткая фильтрация
        if (!isValidCountry(p.country)) return;
        if (isSeaProvince(p)) return;
        countryProvCount[p.country] = (countryProvCount[p.country] || 0) + 1;
    });

    const totalProvinces = Object.values(countryProvCount).reduce((s, n) => s + n, 0);
    if (totalProvinces === 0) return;

    const leader = Object.entries(countryProvCount)
        .filter(([c]) => isValidCountry(c))
        .sort((a, b) => b[1] - a[1])[0];
    if (!leader) return;
    // 🔥 FIX: дополнительная защита
    if (!isValidCountry(leader[0])) return;

    const leaderPercent = leader[1] / totalProvinces;
    if (leaderPercent < 0.35) return;
    if (leader[0] === aiPlayer.country) return;
    if (isAllied(state, aiPlayer.country, leader[0])) return;
    if (isAtWar(state, aiPlayer.country, leader[0])) return;
    if (hasPact(state, aiPlayer.country, leader[0])) return;
    if (isHistoricalFriend(aiPlayer.country, leader[0])) return;

    const leaderPlayer = state.players.find(p => p.country === leader[0]);
    if (!leaderPlayer) return;

    const myPower = getPlayerPower(state, aiPlayer);
    const leaderPower = getPlayerPower(state, leaderPlayer);

    if (myPower < leaderPower * 0.7) return;

    const alreadyCoalition = (state.wars || []).filter(w => w.defender === leader[0]).length;
    let chance = 0.15;
    if (alreadyCoalition >= 2) chance = 0.4;
    if (leaderPercent > 0.5) chance += 0.2;

    if (Math.random() > chance) return;

    if (hasPact(state, aiPlayer.country, leader[0])) {
        state.pacts = state.pacts.filter(p =>
            !((p.a === aiPlayer.country && p.b === leader[0]) ||
              (p.b === aiPlayer.country && p.a === leader[0]))
        );
        aiPlayer.unrest = Math.min(100, (aiPlayer.unrest || 0) + 5);
    }

    state.wars.push({
        attacker: aiPlayer.country,
        defender: leader[0],
        startedTurn: state.turn,
        attackerName: aiPlayer.username,
        defenderName: leaderPlayer.username
    });
    pushAILog(state, '⚔️', `${aiPlayer.username} вступает в коалицию против ${leaderPlayer.username}!`);
}

// ============ ИИ: рынок (приём + открытые) ============
function aiMarketPhase(state, aiPlayer) {
    if (!isValidCountry(aiPlayer.country)) return;   // 🔥 FIX
    if (state.turn % AI_MARKET_INTERVAL !== 0) return;

    if (!state.marketOffers) state.marketOffers = [];

    const surplus = calculateSurplus(state, aiPlayer);

    const myOpenOffers = state.marketOffers.filter(o =>
        o.from === aiPlayer.country && (o.status === 'open' || o.status === 'pending')
    );

    const steelToSell = Math.floor((aiPlayer.steelPool || 0) * 0.4);
    const oilToSell = Math.floor((aiPlayer.oilPool || 0) * 0.4);

    if (myOpenOffers.length < 2 && surplus.civFree > 0) {
        if (steelToSell >= 30) {
            const giveSteel = Math.min(80, steelToSell);
            state.marketOffers.push({
                id: 'mo_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
                from: aiPlayer.country,
                fromName: aiPlayer.username,
                to: 'open',
                toName: '',
                giveSteel,
                giveOil: 0,
                wantCivFactory: 1,
                wantMilFactory: 0,
                status: 'open',
                createdTurn: state.turn
            });
        } else if (oilToSell >= 20) {
            const giveOil = Math.min(50, oilToSell);
            state.marketOffers.push({
                id: 'mo_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
                from: aiPlayer.country,
                fromName: aiPlayer.username,
                to: 'open',
                toName: '',
                giveSteel: 0,
                giveOil,
                wantCivFactory: 1,
                wantMilFactory: 0,
                status: 'open',
                createdTurn: state.turn
            });
        } else if (surplus.steel >= 20) {
            const giveSteel = Math.min(60, surplus.steel);
            state.marketOffers.push({
                id: 'mo_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
                from: aiPlayer.country,
                fromName: aiPlayer.username,
                to: 'open',
                toName: '',
                giveSteel,
                giveOil: 0,
                wantCivFactory: 1,
                wantMilFactory: 0,
                status: 'open',
                createdTurn: state.turn
            });
        }
    }

    const openOffers = state.marketOffers.filter(o =>
        o.status === 'open' && o.from !== aiPlayer.country && isValidCountry(o.from)   // 🔥 FIX
    );

    const myContracts = (state.activeContracts || []).filter(c =>
        c.a === aiPlayer.country || c.b === aiPlayer.country
    );
    if (myContracts.length >= 3) return;

    const needSteel = (aiPlayer.steelPool || 0) < 150;
    const needOil = (aiPlayer.oilPool || 0) < 80;

    openOffers.sort((a, b) => {
        let scoreA = 0, scoreB = 0;
        if (needSteel && a.giveSteel > 0) scoreA += a.giveSteel;
        if (needOil && a.giveOil > 0) scoreA += a.giveOil * 1.5;
        if (needSteel && b.giveSteel > 0) scoreB += b.giveSteel;
        if (needOil && b.giveOil > 0) scoreB += b.giveOil * 1.5;
        return scoreB - scoreA;
    });

    for (const offer of openOffers) {
        if (isAtWar(state, aiPlayer.country, offer.from)) continue;
        if ((aiPlayer.tradeEmbargo || []).includes(offer.from)) continue;

        const fromPlayer = state.players.find(p => p.country === offer.from);
        if (fromPlayer && (fromPlayer.tradeEmbargo || []).includes(aiPlayer.country)) continue;

        const aiSurplus = calculateSurplus(state, aiPlayer);
        if (offer.wantCivFactory > aiSurplus.civFree) continue;
        if (offer.wantMilFactory > aiSurplus.milFree) continue;

        const steelValue = offer.giveSteel * 1;
        const oilValue = offer.giveOil * 1.5;
        const factoryCost = offer.wantCivFactory * 30 + offer.wantMilFactory * 50;

        if (steelValue + oilValue >= factoryCost * 0.9) {
            offer.status = 'accepted';
            offer.to = aiPlayer.country;
            offer.toName = aiPlayer.username;

            createContractFromOffer(state, offer);
            pushAILog(state, '🤝', `${aiPlayer.username} принял сделку от ${offer.fromName}`);
            break;
        }
    }
}

// ============ ИИ: создание предложений ============
function aiMarketOfferPhase(state, aiPlayer) {
    if (!isValidCountry(aiPlayer.country)) return;   // 🔥 FIX
    if (state.turn % 4 !== 0) return;
    if (state.turn < 5) return;

    if (!state.marketOffers) state.marketOffers = [];

    const myOffers = state.marketOffers.filter(o =>
        o.from === aiPlayer.country && (o.status === 'open' || o.status === 'pending')
    );

    if (myOffers.length >= 2) return;

    const surplus = calculateSurplus(state, aiPlayer);

    const mySteel = aiPlayer.steelPool || 0;
    const myOil = aiPlayer.oilPool || 0;
    const myCivFree = surplus.civFree;
    const myMilFree = surplus.milFree;

    const needSteel = mySteel < 100;
    const needOil = myOil < 60;
    const needCiv = myCivFree < 3 && surplus.civTotal < 10;
    const needMil = myMilFree < 3 && surplus.milTotal < 10;

    const hasSteel = mySteel > 200;
    const hasOil = myOil > 100;
    const hasCiv = myCivFree > 5;
    const hasMil = myMilFree > 3;

    const allCountries = new Set();
    Object.values(state.provinces).forEach(p => {
        // 🔥 FIX: жёсткая фильтрация
        if (!isValidCountry(p.country)) return;
        if (isSeaProvince(p)) return;
        if (p.country === aiPlayer.country) return;
        allCountries.add(p.country);
    });

    const partners = Array.from(allCountries).filter(c => {
        if (!isValidCountry(c)) return false;
        if (isAtWar(state, aiPlayer.country, c)) return false;
        if ((aiPlayer.tradeEmbargo || []).includes(c)) return false;
        const partner = state.players.find(p => p.country === c);
        if (partner && (partner.tradeEmbargo || []).includes(aiPlayer.country)) return false;
        return true;
    });

    if (partners.length === 0) return;

    partners.sort((a, b) => {
        const aFriend = isHistoricalFriend(aiPlayer.country, a) ? 1 : 0;
        const bFriend = isHistoricalFriend(aiPlayer.country, b) ? 1 : 0;
        return bFriend - aFriend;
    });

    const target = partners[0];
    const targetPlayer = state.players.find(p => p.country === target);
    if (!targetPlayer) return;

    const targetSurplus = calculateSurplus(state, targetPlayer);
    const targetSteel = targetPlayer.steelPool || 0;
    const targetOil = targetPlayer.oilPool || 0;

    // ИИ ПРОДАЁТ
    if ((hasSteel || hasOil) && (needSteel || needOil || needCiv || needMil)) {
        let giveSteel = 0;
        let giveOil = 0;

        if (hasSteel && targetSteel < 100) {
            giveSteel = Math.min(60, Math.floor(mySteel * 0.4));
        }
        if (hasOil && targetOil < 80) {
            giveOil = Math.min(40, Math.floor(myOil * 0.4));
        }

        if (giveSteel < 20 && giveOil < 15) return;

        let wantCiv = 0;
        let wantMil = 0;
        let wantSteel = 0;
        let wantOil = 0;

        if (needCiv && targetSurplus.civFree > 0) wantCiv = 1;
        else if (needMil && targetSurplus.milFree > 0) wantMil = 1;
        else if (needSteel && targetSurplus.steel > 30) wantSteel = Math.min(50, targetSurplus.steel);
        else if (needOil && targetSurplus.oil > 20) wantOil = Math.min(30, targetSurplus.oil);
        else wantSteel = 20;

        const offerId = 'mo_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
        state.marketOffers.push({
            id: offerId,
            from: aiPlayer.country,
            fromName: aiPlayer.username,
            to: target,
            toName: targetPlayer.username,
            giveSteel,
            giveOil,
            wantCivFactory: wantCiv,
            wantMilFactory: wantMil,
            wantSteel,
            wantOil,
            status: 'pending',
            createdTurn: state.turn
        });
        return;
    }

    // ИИ ПОКУПАЕТ
    if ((needSteel || needOil) && (targetSteel > 200 || targetOil > 100)) {
        let wantSteel = 0;
        let wantOil = 0;

        if (needSteel && targetSteel > 150) wantSteel = Math.min(60, Math.floor(targetSteel * 0.3));
        if (needOil && targetOil > 80) wantOil = Math.min(40, Math.floor(targetOil * 0.3));

        if (wantSteel < 20 && wantOil < 15) return;

        let giveCiv = 0;
        let giveMil = 0;
        let giveSteel = 0;
        let giveOil = 0;

        if (hasCiv && targetSurplus.civFree < 3) giveCiv = 1;
        else if (hasMil && targetSurplus.milFree < 3) giveMil = 1;
        else if (hasSteel) giveSteel = Math.min(40, Math.floor(mySteel * 0.3));
        else if (hasOil) giveOil = Math.min(30, Math.floor(myOil * 0.3));
        else return;

        const offerId = 'mo_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
        state.marketOffers.push({
            id: offerId,
            from: aiPlayer.country,
            fromName: aiPlayer.username,
            to: target,
            toName: targetPlayer.username,
            giveSteel,
            giveOil,
            giveCivFactory: giveCiv,
            giveMilFactory: giveMil,
            wantCivFactory: 0,
            wantMilFactory: 0,
            wantSteel,
            wantOil,
            status: 'pending',
            createdTurn: state.turn
        });
    }
}

// ============ ИИ: авиация ============
function aiAirPhase(state, aiPlayer) {
    if (!isValidCountry(aiPlayer.country)) return;   // 🔥 FIX
    if (state.turn % 3 !== 0) return;

    const airFactories = Object.values(state.provinces).filter(p =>
        p.country === aiPlayer.country && (p.airFactories || 0) > 0
    );
    if (airFactories.length === 0) return;

    if (!aiPlayer.airProductionQueue) aiPlayer.airProductionQueue = [];
    if (aiPlayer.airProductionQueue.length >= 3) return;

    const atWar = (state.wars || []).some(w =>
        w.attacker === aiPlayer.country || w.defender === aiPlayer.country
    );

    let airType = 'fighters';
    if (atWar && Math.random() < 0.4) airType = 'bombers';
    else if (!atWar && Math.random() < 0.2) airType = 'transport';

    const air = AIR_STATS[airType];

    const airbaseProv = Object.entries(state.provinces).find(([id, p]) =>
        p.country === aiPlayer.country && (p.airbases || 0) > 0
    );
    if (!airbaseProv) return;

    if ((aiPlayer.steelPool || 0) < air.cost) return;
    if ((aiPlayer.resources.manpower || 0) < air.manpower) return;

    aiPlayer.steelPool -= air.cost;
    aiPlayer.resources.manpower -= air.manpower;

    aiPlayer.airProductionQueue.push({
        airType,
        provinceId: airbaseProv[0],
        progress: 0,
        totalProgress: air.buildProgress,
        startedAt: state.turn
    });
}

// 🔥 ИИ строит авиазаводы и аэродромы
function aiBuildAirPhase(state, aiPlayer) {
    if (!isValidCountry(aiPlayer.country)) return;   // 🔥 FIX
    if (state.turn % 6 !== 0) return;
    if (state.turn < 8) return;

    const myProvs = Object.entries(state.provinces)
        .filter(([id, p]) => p.country === aiPlayer.country && !isSeaProvince(p));   // 🔥 FIX
    if (myProvs.length === 0) return;

    if (!aiPlayer.constructionQueue) aiPlayer.constructionQueue = [];
    if (aiPlayer.constructionQueue.length >= 2) return;

    const airFactories = Object.values(state.provinces).filter(p => p.country === aiPlayer.country && (p.airFactories || 0) > 0).length;
    const airbases = Object.values(state.provinces).filter(p => p.country === aiPlayer.country && (p.airbases || 0) > 0).length;

    let buildType = null;
    if (airbases === 0 && (aiPlayer.steelPool || 0) >= 15) {
        buildType = 'airbase';
    } else if (airFactories === 0 && (aiPlayer.steelPool || 0) >= 30) {
        buildType = 'airFactory';
    } else if (Math.random() < 0.3) {
        buildType = Math.random() < 0.5 ? 'airbase' : 'airFactory';
    }

    if (!buildType) return;

    const b = BUILDING_TYPES[buildType];
    if ((aiPlayer.steelPool || 0) < b.steelCost) return;

    const bestProv = myProvs.sort((a, b) => (b[1].population || 0) - (a[1].population || 0))[0];
    aiPlayer.steelPool -= b.steelCost;

    aiPlayer.constructionQueue.push({
        type: buildType,
        provinceId: bestProv[0],
        progress: 0,
        totalProgress: b.buildTime,
        steelCost: b.steelCost,
        startedAt: state.turn
    });
}

// ============ ГЛАВНЫЙ ОБРАБОТЧИК ============
function processAllAITurns(state) {
    if (!state.players) return;
    const aiPlayers = getAllAIPlayers(state);
    if (aiPlayers.length === 0) return;

    console.log(`\n🤖 [AI] Старт ${aiPlayers.length} ИИ (ход ${state.turn})`);

    for (const aiPlayer of aiPlayers) {
        try {
            aiPlayer.armyMovement = {};
            aiBuildPhase(state, aiPlayer);
            aiBuildAirPhase(state, aiPlayer);
            aiRecruitPhase(state, aiPlayer);
            aiAirPhase(state, aiPlayer);
            aiDiplomacyPhase(state, aiPlayer);
            aiAggressionPhase(state, aiPlayer);
            aiCombatPhase(state, aiPlayer);
            aiMoveToBorder(state, aiPlayer);
            aiCoalitionPhase(state, aiPlayer);
            aiMarketPhase(state, aiPlayer);
            aiMarketOfferPhase(state, aiPlayer);
        } catch (err) {
            console.error(`❌ AI error for ${aiPlayer.country}:`, err.message);
        }
    }

    clearHexMapCache();
    clearPowerCache();
    console.log(`✅ [AI] ход завершён`);
}

// ============ 🌐 ЭКСПОРТ ============
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        // 🔥 FIX: экспорт хелперов
        isValidCountry,
        isSeaProvince,
        getPlayerPower,
        countPlayerTroops,
        isAtWar,
        isAllied,
        hasPact,
        hasPendingOffer,
        aiDiplomaticDecision,
        processDiplomacyAction,
        countCivFactoriesOf,
        countMilFactoriesOf,
        calculateSurplus,
        aiMarketDecision,
        createContractFromOffer,
        returnLeasedFactories,
        processMarketContracts,
        processMarketAction,
        processAllAITurns,
        getAllAIPlayers,
        aiBuildPhase,
        aiRecruitPhase,
        aiDiplomacyPhase,
        aiAggressionPhase,
        aiMoveToBorder,
        aiCombatPhase,
        aiCoalitionPhase,
        aiMarketPhase,
        aiMarketOfferPhase,
        aiAirPhase,
        aiBuildAirPhase,
        executeAIAttack,
        getHexMap,
        clearHexMapCache,
        clearPowerCache,
        isHistoricalFriend,
        isNeutral
    };
}