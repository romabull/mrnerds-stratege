// ============ 🎲 ИГРОВЫЕ СОБЫТИЯ ============

const GAME_EVENTS = [
    {
        id: 'economic_boom',
        title: '📈 Экономический бум',
        description: 'Все фабрики дают +50% в следующем ходу.',
        weight: 30,
        condition: (state, player) => state.turn > 3,
        effect: (state, player) => {
            player.bonusProduction = 1.5;
            return `Экономический бум: +50% производства.`;
        }
    },
    {
        id: 'rebellion',
        title: '🔥 Восстание',
        description: 'В одной из провинций вспыхнуло восстание.',
        weight: 15,
        condition: (state, player) => state.turn > 5,
        effect: (state, player) => {
            const provinces = Object.values(state.provinces).filter(p => p.country === player.country);
            if (provinces.length === 0) return 'Нет провинций для восстания.';
            const prov = provinces[Math.floor(Math.random() * provinces.length)];
            prov.unrest = 2;
            return `Восстание в провинции ${prov.name}!`;
        }
    },
    {
        id: 'diplomatic_offer',
        title: '🕊️ Мирное предложение',
        description: 'Сосед предлагает мир.',
        weight: 20,
        condition: (state, player) => state.wars && state.wars.some(w => w.attacker === player.country || w.defender === player.country),
        effect: (state, player) => {
            state.wars = (state.wars || []).filter(w => w.attacker !== player.country && w.defender !== player.country);
            return `Заключён мир. Одна из войн завершена.`;
        }
    }
];

// ============ БРОСОК СОБЫТИЯ ============

function rollEvent(state, player) {
    const available = GAME_EVENTS.filter(e => !e.condition || e.condition(state, player));
    if (available.length === 0) return null;
    
    const totalWeight = available.reduce((sum, e) => sum + e.weight, 0);
    let roll = Math.random() * totalWeight;
    
    for (const event of available) {
        roll -= event.weight;
        if (roll <= 0) return event;
    }
    
    return available[0];
}

// ============ ПРИМЕНЕНИЕ СОБЫТИЯ ============

function applyEvent(event, state, player) {
    if (!event) return null;
    const message = event.effect(state, player);
    return {
        id: event.id,
        title: event.title,
        description: event.description,
        message,
        turn: state.turn
    };
}