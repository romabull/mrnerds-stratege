// ============ 👥 РЕАЛЬНОЕ НАСЕЛЕНИЕ ЕВРОПЫ (1936) ============
// Значения в миллионах. Источник: Maddison Project, исторические переписи.
// Данные максимально приближены к реальным на 1936 год (с учётом колоний, где применимо).

const COUNTRY_POPULATION_1936 = {
    // ===== КРУПНЫЕ ДЕРЖАВЫ =====
    germany:        68.0,   // Германия (вкл. Саар, Австрию нет — аншлюс 1938)
    soviet:         168.0,  // СССР
    france:         42.0,   // Франция (метрополия, без колоний)
    uk:             47.0,   // Великобритания (метрополия)
    italy:          43.0,   // Италия (метрополия, без колоний)

    // ===== ВОСТОЧНАЯ ЕВРОПА =====
    poland:         34.0,   // Польша
    romania:        19.0,   // Румыния (Большая Румыния)
    yugoslavia:     15.4,   // Югославия
    hungary:        9.0,    // Венгрия
    czechoslovakia: 15.0,   // Чехословакия
    bulgaria:       6.3,    // Болгария
    greece:         7.0,    // Греция
    albania:        1.0,    // Албания

    // ===== СЕВЕРНАЯ ЕВРОПА =====
    sweden:         6.2,    // Швеция
    norway:         2.9,    // Норвегия
    denmark:        3.7,    // Дания
    finland:        3.7,    // Финляндия
    estonia:        1.1,    // Эстония
    latvia:         1.9,    // Латвия
    lithuania:      2.5,    // Литва
    ireland:        2.9,    // Ирландия

    // ===== ЗАПАДНАЯ ЕВРОПА =====
    portugal:       7.2,    // Португалия
    austria:        6.7,    // Австрия
    switzerland:    4.2,    // Швейцария
    belgium:        8.3,    // Бельгия
    netherlands:    8.6,    // Нидерланды
    luxembourg:     0.3,    // Люксембург

    // ===== БЛИЖНИЙ ВОСТОК =====
    turkey:         17.5,   // Турция
    iraq:           3.7,    // Ирак
    iran:           15.0,   // Иран (Персия)
    saudi:          2.5,    // Саудовская Аравия
    afghanistan:    7.0,    // Афганистан

    // ===== СПЕЦИАЛЬНЫЕ =====
    water:          0
};

// ============ ⚙️ РЕАЛЬНЫЙ УРОВЕНЬ ПРОМЫШЛЕННОСТИ (1936) ============
// Относительный индекс: Германия = 100
const COUNTRY_INDUSTRY_1936 = {
    germany:        100,
    soviet:         85,
    uk:             90,
    france:         55,
    italy:          35,
    poland:         15,
    spain:          12,
    romania:        8,
    yugoslavia:     6,
    hungary:        5,
    czechoslovakia: 12,
    bulgaria:       3,
    greece:         3,
    sweden:         10,
    norway:         4,
    denmark:        5,
    finland:        4,
    estonia:        1,
    latvia:         1,
    lithuania:      1,
    portugal:       3,
    austria:        5,
    switzerland:    6,
    belgium:        8,
    netherlands:    8,
    luxembourg:     2,
    turkey:         4,
    iraq:           1,
    iran:           2,
    saudi:          1,
    afghanistan:    1,
    albania:        1,
    ireland:        2,
    water:          0
};

// ============ 🏙️ КРУПНЫЕ ГОРОДА (БУСТ НАСЕЛЕНИЯ) ============
// [часть названия провинции, множитель]
// Чем крупнее город — тем выше множитель.
const MAJOR_CITIES = {
    // ===== ГЕРМАНИЯ =====
    'Берлин': 4.0,
    'Гамбург': 2.5,
    'Мюнхен': 2.0,
    'Кёльн': 2.0,
    'Рейнская': 2.5,
    'Саксония': 2.5,
    'Дюссельдорф': 2.0,
    'Штутгарт': 1.8,
    'Франкфурт': 1.8,
    'Висбаден': 1.8,
    'Бранденбург': 1.5,
    'Шверин': 1.3,
    'Ганновер': 1.5,
    'Киль': 1.3,
    'Кёнигсберг': 1.5,

    // ===== СССР =====
    'Московская': 3.5,
    'Ленинградская': 2.5,
    'Украинская': 2.5,
    'Киевская': 2.0,
    'Западная': 1.8,
    'Крымская': 1.5,
    'Одесская': 1.5,
    'Северо-Кавказский': 1.8,
    'Горьковская': 1.5,
    'Куйбышевская': 1.5,
    'Воронежская': 1.5,
    'Казахстанская': 1.5,
    'Мурманск': 0.8,

    // ===== ФРАНЦИЯ =====
    'Париж': 5.0,
    'Нормандия': 2.0,
    'Брест': 1.8,
    'Орлеан': 1.8,
    'Бордо': 1.8,
    'Альпы': 1.8,
    'Джон': 1.5,
    'Реймс': 1.8,
    'Корсика': 0.8,
    'Алжир': 1.5,

    // ===== ВЕЛИКОБРИТАНИЯ =====
    'Лондон': 5.0,
    'Бирмингем': 2.5,
    'Ливерпуль': 2.0,
    'Кардифф': 1.5,
    'Глазго': 2.0,
    'Эдинбург': 1.8,
    'Плимут': 1.5,
    'Пул': 1.5,
    'Белфаст': 1.5,
    'Ньюкасл': 1.5,
    'Дублин': 2.0,

    // ===== ИТАЛИЯ =====
    'Рим': 3.5,
    'Неаполь': 3.0,
    'Милан': 3.0,
    'Флоренция': 2.0,
    'Болонья': 1.8,
    'Венето': 1.8,
    'Альпы': 1.5,
    'Калабрия': 1.2,
    'Сицилия': 1.5,
    'Сардиния': 1.2,

    // ===== ИСПАНИЯ =====
    'Мадрид': 3.0,
    'Барселона': 2.5,
    'Мурсия': 1.5,
    'Вальядолид': 1.5,
    'Андалусия': 1.5,
    'Таррагона': 1.5,
    'Бильбао': 1.5,

    // ===== ТУРЦИЯ =====
    'Стамбул': 3.0,
    'Анатолия': 1.8,
    'Черноморский': 1.5,

    // ===== ИРАН =====
    'Тегеран': 2.5,
    'Тебриз': 1.5,
    'Мешхед': 1.5,

    // ===== САУДОВСКАЯ АРАВИЯ =====
    'Эр-Рияд': 1.5
};

// ============ 🧮 РАСЧЁТ НАСЕЛЕНИЯ ============

/**
 * Рассчитать население провинции
 * @param {string} country - id страны
 * @param {number} hexCount - количество гексов в провинции
 * @param {number} totalHexes - общее количество гексов страны
 * @param {string} name - название провинции
 * @returns {number} население в миллионах
 */
function calcProvincePopulation(country, hexCount, totalHexes, name = '') {
    const totalPop = COUNTRY_POPULATION_1936[country] || 1.0;
    if (totalHexes === 0) return 0;

    // Базовая доля — пропорционально гексам
    let share = (hexCount / totalHexes) * totalPop;

    // Буст для крупных городов
    let multiplier = 1.0;
    for (const [cityName, mult] of Object.entries(MAJOR_CITIES)) {
        if (name.includes(cityName)) {
            multiplier = mult;
            break;
        }
    }

    return Math.max(0.01, share * multiplier);
}

/**
 * Нормализовать население — чтобы сумма по стране = реальному
 */
function normalizeCountryPopulation(provinces, country) {
    const target = COUNTRY_POPULATION_1936[country] || 0;
    if (target === 0) return;

    const list = Object.values(provinces).filter(p => p.country === country);
    const currentSum = list.reduce((s, p) => s + (p.population || 0), 0);
    if (currentSum === 0) return;

    const k = target / currentSum;
    list.forEach(p => { p.population = p.population * k; });
}

/**
 * Посчитать население для всех провинций карты
 * @param {object} EUROPE_MAP - карта
 * @returns {object} EUROPE_MAP с обновлённым population
 */
function applyRealPopulation(EUROPE_MAP) {
    // 1. Группируем по странам
    const byCountry = {};
    Object.values(EUROPE_MAP).forEach(prov => {
        const c = prov.country || 'water';
        if (!byCountry[c]) byCountry[c] = [];
        byCountry[c].push(prov);
    });

    // 2. Считаем население
    Object.entries(byCountry).forEach(([country, provList]) => {
        if (country === 'water') {
            provList.forEach(p => { p.population = 0; });
            return;
        }

        const totalHexes = provList.reduce((s, p) => s + (p.hexes?.length || 0), 0);

        provList.forEach(prov => {
            const hexCount = prov.hexes?.length || 0;
            prov.population = calcProvincePopulation(
                country,
                hexCount,
                totalHexes,
                prov.name || ''
            );
        });

        // 3. Нормализуем
        normalizeCountryPopulation(EUROPE_MAP, country);
    });

    // 4. Округляем до 2 знаков
    Object.values(EUROPE_MAP).forEach(p => {
        p.population = Math.round((p.population || 0) * 100) / 100;
    });

    return EUROPE_MAP;
}