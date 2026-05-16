console.log("ГЕЙМ-СКРИПТ ЗАПУЩЕН");

let playerData = { 
    quant: 0, 
    qubi: 0, 
    energy: 100, 
    level: 1,
    inventory: [], 
    equipped: [],  
    lastEnergyUpdate: 0, // Инициализируем нулем, значение придет из Firebase
    factoryLimit: {
        date: new Date().toLocaleDateString(),
        processedToday: 0
    }
};

// --- СОСТОЯНИЕ КОРАБЛЯ ---
let runnerShip = {
    x: window.innerWidth / 2,
    y: window.innerHeight - 200, 
    w: 80, h: 80,
    hp: 100, 
    maxHp: 100, 
    targetX: window.innerWidth / 2,
    lerpSpeed: 0.2
};

let quants = []; 
let sessionQuants = 0;
let sessionQubi = 0;
let isRunnerActive = false;
let sessionArtifacts = 0;

let isPvPActive = false;
let pvpDistance = 0;
let pvpTargetDistance = 2000;
let pvpWalls = [];
let pvpOpponent = null;

const pvpCanvas = document.getElementById('pvpCanvas');
const pvpCtx = pvpCanvas ? pvpCanvas.getContext('2d') : null;

// --- ЕДИНАЯ ФУНКЦИЯ РАСЧЕТА ХАРАКТЕРИСТИК ---
function calculateCurrentStats() {
    let stats = {
        hp: 100,
        maxEnergy: 100,
        regenBonusMs: 0, 
        barrier: 0,
        incomeQuant: 0,
        incomeQubi: 0
    };

    if (playerData && playerData.equipped && playerData.inventory) {
        playerData.equipped.forEach(modId => {
            const module = playerData.inventory.find(m => m.id === modId);
            if (module && module.power) {
                if (typeof module.power === 'object') {
                    stats.hp += Number(module.power.hp || 0);
                    stats.maxEnergy += Number(module.power.en || 0);
                    stats.regenBonusMs += Number(module.power.reg || 0);
                } else {
                    const p = Number(module.power);
                    if (module.type === 'hp') stats.hp += p;
                    if (module.type === 'energy_max') stats.maxEnergy += p;
                    if (module.type === 'energy_regen') stats.regenBonusMs += p;
                    if (module.type === 'barrier') stats.barrier += p;
                }
            }
        });
    }
    return stats;
}

// --- РЕГЕНЕРАЦИЯ ЭНЕРГИИ ---
function regenerateEnergy() {
    // 1. Базовые проверки + проверка на активность в раннере
    if (!playerData || !userRef || isRunnerActive) return;

    const now = Date.now();
    let lastUpdate = Number(playerData.lastEnergyUpdate) || now;
    
    // 2. Исправление "будущего" времени
    if (lastUpdate > (now + 60000)) {
        console.log("🛠 Исправляю время из будущего...");
        playerData.lastEnergyUpdate = now;
        userRef.update({ lastEnergyUpdate: now });
        return;
    }

    const stats = calculateCurrentStats();
    const maxE = Number(stats.maxEnergy) || 100;
    const bonus = Number(stats.regenBonusMs) || 0;
    
    // 3. Рассчитываем время восстановления 1 единицы (минимум 1 секунда)
    const MS_PER_UNIT = Math.max(1000, 60000 - bonus);
    
    const timePassed = now - lastUpdate;

    // Редкий лог для отладки
    if (Math.random() < 0.01) console.log("Проверка регена... Прошло мс:", timePassed);

    // 4. Логика начисления
    if (timePassed >= MS_PER_UNIT && playerData.energy < maxE) {
        const energyToAdd = Math.floor(timePassed / MS_PER_UNIT);
        
        if (energyToAdd > 0) {
            // Прибавляем энергию, но не выше максимума
            playerData.energy = Math.min(maxE, (Number(playerData.energy) || 0) + energyToAdd);
            
            // СДВИГАЕМ время последнего обновления вперед на количество начисленной энергии
            playerData.lastEnergyUpdate = lastUpdate + (energyToAdd * MS_PER_UNIT);

            // 5. Синхронизация с UI и базой
            updateUI(); 
            userRef.update({
                energy: playerData.energy,
                lastEnergyUpdate: playerData.lastEnergyUpdate
            });
            
            console.log("🔋 Энергия начислена:", energyToAdd, "| Всего:", playerData.energy);
        }
    }
}

let factoryLimit = {
    date: new Date().toLocaleDateString(),
    processedToday: 0
};

const tg = window.Telegram.WebApp;

tg.ready();
tg.expand();
if (tg.disableVerticalSwipes) tg.disableVerticalSwipes();
tg.isClosingConfirmationEnabled = true;
tg.setHeaderColor('#000000');
tg.setBackgroundColor('#000000');

if (tg.requestFullscreen) {
    try { tg.requestFullscreen(); } catch (e) { console.error(e); }
}

const firebaseConfig = {
    apiKey: "AIzaSyABKHaAdlSFq1KzURXmCF5Q-9xMUgE4Ot0",
    authDomain: "berry-game-4fa9b.firebaseapp.com",
    databaseURL: "https://berry-game-4fa9b-default-rtdb.firebaseio.com",
    projectId: "berry-game-4fa9b",
    storageBucket: "berry-game-4fa9b.firebasestorage.app",
    messagingSenderId: "736707445306",
    appId: "1:736707445306:web:87a61ea4b725bd3071eb03"
};

if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const db = firebase.database();

const tgUser = tg.initDataUnsafe?.user || { id: "guest_user", first_name: "Pilot" };
const userRef = db.ref('users/' + tgUser.id);

function syncWithLeaderboard() {
    if (!playerData) return;
    
    const lbRef = db.ref('leaderboard/' + tgUser.id);
    lbRef.set({
        name: tgUser.first_name || "Unknown Pilot",
        qubi: playerData.qubi || 0,
        lastUpdate: Date.now() 
    }).then(() => {
        console.log("Лидерборд успешно обновлен для:", tgUser.first_name);
    }).catch((error) => {
        console.error("Ошибка обновления лидерборда:", error);
    });
}

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const runnerCanvas = document.getElementById('runnerCanvas');
const runnerCtx = runnerCanvas.getContext('2d');
const runnerWin = document.getElementById('runner-window');

const buildingTypes = {
    mine: {
        name: "Шахта QUANT",
        icon: "assets/buildings/mine.png", // Путь к твоей PNG
        baseCost: 1500,
        baseYield: 15, // Квантов в час
        yieldType: "quant",
        artifactUpgradeBase: 20 // Сколько артефактов нужно для 1-го апгрейда
    },
    lab: {
        name: "Лаборатория QUBI",
        icon: "assets/buildings/lab.png",
        baseCost: 2500,
        baseYield: 5, // QUBI в час
        yieldType: "qubi",
        artifactUpgradeBase: 30
    },
    shield: {
        name: "Защитная установка",
        icon: "assets/buildings/shield.png",
        baseCost: 5000,
        baseYield: 5, // % защиты
        yieldType: "protection",
        artifactUpgradeBase: 40
    }
};

// --- ЗАГРУЗКА РЕСУРСОВ ---
const bg = new Image(); bg.src = 'assets/background1.jpg';
const runnerBg = new Image(); runnerBg.src = 'assets/background2.jpg';
const shipImg = new Image(); shipImg.src = 'assets/samolet.png';
const quantImg = new Image(); quantImg.src = 'assets/quant-icon.png';
const qubiImg = new Image(); qubiImg.src = 'assets/qubi-icon.png';
const meteorImg = new Image(); meteorImg.src = 'assets/meteor.png'; 
const alienImg = new Image(); alienImg.src = 'assets/alien.png';
const lightningImg = new Image(); lightningImg.src = 'assets/molniya.png';
const artifactImg = new Image(); artifactImg.src = 'assets/artifact.png';
const pvpBgImg = new Image(); pvpBgImg.src = 'assets/pvp-bg.png';

// --- ОБЪЕКТЫ ПЛАНЕТ ---
const planets = [
    // ТЕПЕРЬ ТУТ PVP СТАНЦИЯ (В ЦЕНТРЕ)
    { 
        id: 'pvp_planet', 
        src: 'assets/star-pvp.png', 
        x: window.innerWidth * 0.35, // Центр экрана по X
        y: window.innerHeight * 0.62, // Центр экрана по Y
        size: 85, // Сделал чуть больше, так как это центр
        rotation: 0, 
        speed: 0, 
        img: new Image(),
        isStationary: true,
        action: () => openPvPSearch() 
    },

    { 
        id: 'guild', 
        src: 'assets/guild.png', // Замени на имя своего ассета в папке assets
        x: window.innerWidth * 0.8, // Свободная зона справа вверху
        y: window.innerHeight * 0.35, 
        size: 75, 
        rotation: 0, 
        speed: 0.001, // Слегка вращается для красоты
        img: new Image(), 
        action: () => openGuildWindow() // Открывает наше новое окно
    },
    // ТЕПЕРЬ ТУТ КВАНТ ЯДРО (МЕЖДУ ЗЕМЛЕЙ И ЛУНОЙ)
    { 
        id: 'runner', 
        src: 'assets/quant.png', 
        x: window.innerWidth * 0.5, // Позиция между Землей (0.22) и Центром
        y: window.innerHeight * 0.46, // Позиция между Центром и Луной (0.72)
        size: 110, 
        rotation: 0, 
        speed: 0.002, 
        img: new Image() 
    },
    // ОСТАЛЬНЫЕ ПЛАНЕТЫ БЕЗ ИЗМЕНЕНИЙ
    { id: 'build', src: 'assets/earth.png', x: window.innerWidth * 0.22, y: window.innerHeight * 0.5, size: 75, rotation: 0, speed: 0.001, img: new Image() },
    { id: 'shop', src: 'assets/mars.png', x: window.innerWidth * 0.78, y: window.innerHeight * 0.5, size: 75, rotation: 0, speed: -0.001, img: new Image() },
    { id: 'moon', src: 'assets/moon.png', x: window.innerWidth * 0.5, y: window.innerHeight * 0.72, size: 60, rotation: 0, speed: 0.003, img: new Image() },
    { id: 'leaderboard', src: 'assets/neptun.png', x: window.innerWidth * 0.5, y: window.innerHeight * 0.32, size: 70, rotation: 0, speed: -0.0015, img: new Image() },
    
    // СТАНЦИЯ (ОСТАЛАСЬ НА СВОЕМ МЕСТЕ)
    { id: 'station', src: 'assets/station.png', x: window.innerWidth * 0.2, y: window.innerHeight * 0.4, size: 70, rotation: 0, speed: 0, img: new Image(), action: () => openStation() },
    
    // ГАЛАКТИЧЕСКИЙ РЫНОК (СТАТИЧНЫЙ И КРУПНЫЙ)
    { 
        id: 'market', 
        src: 'assets/market.png', 
        x: window.innerWidth * 0.25, 
        y: window.innerHeight * 0.25, 
        size: 130, // УВЕЛИЧИЛИ МАСШТАБ (было 70)
        rotation: 0, 
        speed: 0,  // ОСТАНОВИЛИ КРУЧЕНИЕ (скорость 0)
        img: new Image(),
        isStationary: true, // Флаг статичности (как у PvP станции)
        action: () => openMarketWindow()
    }
];

// Инициализация картинок планет
planets.forEach(p => { p.img.src = p.src; });

// --- КОНФИГУРАЦИЯ МАГАЗИНА ---
// ВАЖНО: Пути к картинкам теперь соответствуют твоей папке assets/shop/
const SHOP_MODULES = [
    { id: 'mod_en_1', name: 'Медный конденсатор', type: 'energy_max', power: 25, price: 2500, currency: 'QUANT', rarity: 'common', desc: 'Увеличивает макс. запас энергии на 25 ед.', img: 'module_01.png' },
    { id: 'mod_en_2', name: 'Ионная ячейка', type: 'energy_max', power: 50, price: 5000, currency: 'QUANT', rarity: 'common', desc: 'Стабильный поток ионов дает +50 к энергии.', img: 'module_11.png' },
    { id: 'mod_en_3', name: 'Плазменный блок', type: 'energy_max', power: 100, price: 500, currency: 'QUBI', rarity: 'uncommon', desc: 'Сжатая плазма расширяет бак до +100 ед.', img: 'module_04.png' },
    { id: 'mod_en_4', name: 'Темная материя (S)', type: 'energy_max', power: 200, price: 1200, currency: 'QUBI', rarity: 'rare', desc: 'Энергия из пустоты. Дает +200 к запасу.', img: 'module_14.png' },
    { id: 'mod_en_5', name: 'Сингулярность', type: 'energy_max', power: 500, price: 0.5, currency: 'TON', rarity: 'epic', desc: 'Горизонт событий в твоем кармане: +500 энергии.', img: 'module_09.png' },

    { id: 'mod_reg_1', name: 'Кварцевый чип', type: 'energy_regen', power: 30000, price: 3000, currency: 'QUANT', rarity: 'common', desc: 'Ускоряет регенерацию на 30 секунд.', img: 'module_02.png' },
    { id: 'mod_reg_2', name: 'Турбо-инъектор', type: 'energy_regen', power: 60000, price: 400, currency: 'QUBI', rarity: 'uncommon', desc: 'Впрыск топлива ускоряет реген на 1 минуту.', img: 'module_12.png' },
    { id: 'mod_reg_3', name: 'Разгонщик частот', type: 'energy_regen', power: 90000, price: 700, currency: 'QUBI', rarity: 'uncommon', desc: 'Снимает лимиты: -90 сек ожидания.', img: 'module_05.png' },
    { id: 'mod_reg_4', name: 'Квантовый резонатор', type: 'energy_regen', power: 120000, price: 1500, currency: 'QUBI', rarity: 'rare', desc: 'Регенерация энергии всего за 1 минуту.', img: 'module_15.png' },
    { id: 'mod_reg_5', name: 'Хронос-двигатель', type: 'energy_regen', power: 160000, price: 0.8, currency: 'TON', rarity: 'epic', desc: 'Почти мгновенное восстановление: реген 20 сек!', img: 'module_08.png' },

    { id: 'mod_hp_1', name: 'Стальная пластина', type: 'hp', power: 50, price: 2000, currency: 'QUANT', rarity: 'common', desc: 'Базовая защита корпуса: +50 HP.', img: 'module_03.png' },
    { id: 'mod_hp_2', name: 'Титановый каркас', type: 'hp', power: 100, price: 4500, currency: 'QUANT', rarity: 'common', desc: 'Легкий и прочный сплав: +100 HP.', img: 'module_13.png' },
    { id: 'mod_hp_3', name: 'Керамический композит', type: 'hp', power: 150, price: 600, currency: 'QUBI', rarity: 'uncommon', desc: 'Поглощает удары метеоров: +150 HP.', img: 'module_06.png' },
    { id: 'mod_hp_4', name: 'Силовое поле v.1', type: 'hp', power: 250, price: 1800, currency: 'QUBI', rarity: 'rare', desc: 'Энергетический щит вокруг судна: +250 HP.', img: 'module_16.png' },
    { id: 'mod_hp_5', name: 'Нано-защита "Омни"', type: 'hp', power: 500, price: 0.6, currency: 'TON', rarity: 'epic', desc: 'Технологии древних: +500 HP.', img: 'module_10.png' },

    { id: 'mod_hyb_1', name: 'Альфа-ядро', type: 'hybrid', power: {hp: 100, en: 100}, price: 2500, currency: 'QUBI', rarity: 'rare', desc: 'Баланс во всем: +100 HP и +100 Энергии.', img: 'module_17.png' },
    { id: 'mod_hyb_2', name: 'Прототип "Звезда"', type: 'hybrid', power: {hp: 200, reg: 120000}, price: 1.2, currency: 'TON', rarity: 'epic', desc: 'Легкий образец: +200 HP и быстрый реген.', img: 'module_18.png' },
    { id: 'mod_hyb_3', name: 'QUANT-Мастер', type: 'hybrid', power: {en: 250, reg: 120000}, price: 1.0, currency: 'TON', rarity: 'epic', desc: 'Для марафонцев: +250 энергии и реген 1 мин.', img: 'module_19.png' },
    { id: 'mod_hyb_4', name: 'Дрон Mk.1', type: 'hybrid', power: {hp: 300, en: 150}, price: 1.5, currency: 'TON', rarity: 'epic', desc: 'Верный спутник: +300 HP и +150 энергии.', img: 'module_20.png' },
    { id: 'mod_hyb_5', name: 'Бесконечность', type: 'hybrid', power: {hp: 500, en: 500, reg: 150000}, price: 2.5, currency: 'TON', rarity: 'legendary', desc: 'Абсолютная власть над космосом.', img: 'module_07.png' }
];

// Функция для обновления параметров корабля перед стартом
function syncShipStats() {
    if (typeof calculateCurrentStats === 'function') {
        const stats = calculateCurrentStats();
        runnerShip.maxHp = stats.hp;
        runnerShip.hp = stats.hp;
    }
}

const tonConnectUI = new TON_CONNECT_UI.TonConnectUI({
    manifestUrl: 'https://plugy17.github.io/QUBI/tonconnect-manifest.json',
    buttonRootId: 'ton-connect-btn'
});

function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const width = window.innerWidth;
    const height = window.innerHeight;

    [canvas, runnerCanvas].forEach(c => {
        if (!c) return;
        c.width = width * dpr;
        c.height = height * dpr;
        c.style.width = width + 'px';
        c.style.height = height + 'px';

        const ctx = c.getContext('2d');
        ctx.setTransform(1, 0, 0, 1, 0, 0); 
        ctx.scale(dpr, dpr);
    });

    if (typeof runnerShip !== 'undefined') {
        runnerShip.y = height - 200;
    }
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();

setTimeout(resizeCanvas, 100);
setTimeout(resizeCanvas, 300);

function initGame() {
    const nameEl = document.getElementById('player-name');
    if(nameEl) nameEl.innerText = tgUser.first_name;

    // Используем .once, чтобы загрузить данные ПРИ ВХОДЕ один раз
    userRef.once('value').then((snapshot) => {
        if (snapshot.exists()) {
            playerData = snapshot.val();
            
            // Проверка и инициализация данных
            const now = Date.now();
            if (!playerData.lastEnergyUpdate) {
                playerData.lastEnergyUpdate = now;
                userRef.update({ lastEnergyUpdate: now });
            }

            if (!playerData.inventory) playerData.inventory = [];
            if (!playerData.equipped) playerData.equipped = [];
            
            // СТАРТУЕМ ТАЙМЕРЫ ОДИН РАЗ
            // Если таймер уже запущен где-то в другом месте, здесь его не дублируем!
            updateUI();
            syncWithLeaderboard(); 
        } else {
            // Новый игрок
            playerData.lastEnergyUpdate = Date.now();
            userRef.set(playerData);
        }
        hideLoading();
    });
}

// Основная функция открытия магазина
function openShop() {
    const shopModal = document.getElementById('shop-modal');
    if (shopModal) {
        shopModal.style.display = 'flex';
        // При открытии по умолчанию активируем вкладку "ВСЕ"
        renderShopItems('all'); 
    }
}

// Функция отрисовки предметов с активной подсветкой вкладок
function renderShopItems(filter = 'all') {
    const shopList = document.getElementById('shop-list');
    if (!shopList) return;
    
    shopList.innerHTML = ''; 

    // 1. Фильтрация модулей
    const filteredModules = SHOP_MODULES.filter(item => {
        if (filter === 'all') return true;
        if (filter === 'ton') return item.currency === 'TON';
        if (filter === 'energy_max') return item.type === 'energy_max' || item.type === 'energy_regen';
        if (filter === 'hp') return item.type === 'hp' || item.type === 'barrier';
        return item.type === filter;
    });

    // 2. Отрисовка карточек
    filteredModules.forEach(item => {
        const isOwned = playerData.inventory && playerData.inventory.some(owned => 
            owned.shopId === item.id
        );
        
        const itemEl = document.createElement('div');
        itemEl.className = `shop-item ${item.rarity}`;
        
        const priceText = item.currency === 'TON' ? `${item.price} TON` : `${item.price} ${item.currency}`;

        itemEl.innerHTML = `
            <img src="assets/shop/${item.img}" style="width:70px; height:70px; object-fit:contain; margin-bottom:8px;">
            <div style="font-weight:bold; font-size:13px; color:#fff;">${item.name}</div>
            <div style="font-size:10px; color:rgba(255,255,255,0.6); margin:5px 0; min-height:30px;">${item.desc}</div>
            <div class="price-container" style="margin-top:auto;">
                ${isOwned ? 
                    `<div style="color:#39ff14; font-size:12px; font-weight:bold; padding:8px;">КУПЛЕНО</div>` : 
                    `<div style="font-size:14px; color:#00e5ff; margin-bottom:5px;">${priceText}</div>
                     <button onclick="buyModule('${item.id}')" class="buy-btn">КУПИТЬ</button>`
                }
            </div>
        `;
        shopList.appendChild(itemEl);
    });

    // 3. ПОДСВЕТКА КНОПОК
    updateShopTabsVisuals(filter);

    if (window.tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
}

// Вспомогательная функция для выделения активной кнопки
function updateShopTabsVisuals(activeFilter) {
    const tabsContainer = document.querySelector('.shop-tabs');
    if (!tabsContainer) return;

    const buttons = tabsContainer.querySelectorAll('button');
    
    buttons.forEach(btn => {
        // Проверяем, какой фильтр привязан к кнопке через атрибут onclick
        if (btn.getAttribute('onclick').includes(`'${activeFilter}'`)) {
            // Если это активная кнопка
            btn.classList.add('active-tab');
            btn.style.opacity = "1";
            if (activeFilter === 'ton') {
                btn.style.color = "#ffa500"; // Золотой для ТОН
            } else {
                btn.style.color = "#00e5ff"; // Голубой для остальных
            }
        } else {
            // Для неактивных кнопок
            btn.classList.remove('active-tab');
            btn.style.color = "#fff";
            btn.style.opacity = "0.5";
        }
    });
}

function closeShop() {
    const shopModal = document.getElementById('shop-modal');
    if (shopModal) shopModal.style.display = 'none';
    if (tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
}

async function payWithTON(amountInTon, itemId) {
    const amountInNanotons = (amountInTon * 1000000000).toString();
    
    const transaction = {
        validUntil: Math.floor(Date.now() / 1000) + 120,
        messages: [
            {
                address: "UQAolTf91hk9X9SbfkeWcs10mOCwQCvq5iax2WgQ4H678l6r", 
                amount: amountInNanotons,
            }
        ]
    };

    try {
        const result = await tonConnectUI.sendTransaction(transaction);
        return true; 
    } catch (e) {
        console.error("Ошибка оплаты:", e);
        return false;
    }
}

// --- ИСПРАВЛЕННЫЙ ИНТЕРФЕЙС ---
function updateUI() {
    const q = document.getElementById('quant-val'),
          b = document.getElementById('qubi-val'),
          e = document.getElementById('energy-fill'),
          et = document.getElementById('energy-text'); // Если у тебя есть текст на полоске

    if(q) q.innerText = Math.floor(playerData.quant);
    if(b) b.innerText = Math.floor(playerData.qubi);
    
    if(e) {
        // Считаем % динамически: (текущая / максимальная) * 100
        const stats = calculateCurrentStats();
        const percent = Math.min(100, (playerData.energy / stats.maxEnergy) * 100);
        e.style.width = percent + "%";
        
        // Опционально: если хочешь выводить цифры типа "125/125"
        if(et) et.innerText = `${Math.floor(playerData.energy)}/${stats.maxEnergy}`;
    }
}

function hideLoading() {
    const loader = document.getElementById('loading-screen');
    if(loader) {
        loader.style.opacity = '0';
        setTimeout(() => loader.style.display = 'none', 500);
    }
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    regenerateEnergy();

    if (bg.complete) {
        ctx.drawImage(bg, 0, 0, window.innerWidth, window.innerHeight);
    }

    planets.forEach(p => {
        if (p.img && p.img.complete) {
            ctx.save();
            ctx.translate(p.x, p.y); 

            if (p.isStationary) {
                if (p.id === 'station' || p.id === 'pvp_planet') {
                    const floatY = Math.sin(Date.now() * 0.002) * 8;
                    ctx.translate(0, floatY);
                }
                
                // --- УНИКАЛЬНЫЙ ЭФФЕКТ ДЛЯ РЫНКА: МИГАЮЩИЕ ОГНИ ---
                if (p.id === 'market') {
                    // Рисуем саму планету рынка (сначала подложку)
                    ctx.drawImage(p.img, -p.size/2, -p.size/2, p.size, p.size);

                    // Вычисляем фазы мигания на основе времени
                    // Огни будут загораться по очереди каждые несколько миллисекунд
                    const time = Date.now();
                    const light1 = Math.sin(time * 0.005) > 0;  // Частота первого типа огней
                    const light2 = Math.sin(time * 0.003 + 2) > 0; // Вторая фаза (со смещением)

                    // Массив координат огней относительно ЦЕНТРА рынка (в зависимости от размера)
                    // Размещаем их по краям "планеты", имитируя посадочные доки
                    const radius = p.size * 0.45; // Чуть ближе к краю планеты

                    const lightPositions = [
                        { x: -radius, y: 0, status: light1, color: '#00ffcc' }, // Левый док (бирюзовый)
                        { x: radius, y: 0, status: light1, color: '#00ffcc' },  // Правый док
                        { x: 0, y: -radius, status: light2, color: '#ffea00' }, // Верхний маяк (желтый)
                        { x: -radius * 0.7, y: -radius * 0.7, status: !light1, color: '#ff3300' }, // Северо-запад (предупреждающий красный)
                        { x: radius * 0.7, y: radius * 0.7, status: !light1, color: '#ff3300' }   // Юго-восток
                    ];

                    lightPositions.forEach(dot => {
                        if (dot.status) { // Если в этой фазе огонь должен гореть
                            ctx.save();
                            ctx.beginPath();
                            ctx.arc(dot.x, dot.y, 3, 0, Math.PI * 2); // Размер огонька — 3 пикселя
                            
                            // Добавляем эффект неонового свечения для самой точки
                            ctx.shadowBlur = 10;
                            ctx.shadowColor = dot.color;
                            ctx.fillStyle = dot.color;
                            ctx.fill();
                            ctx.restore();
                        }
                    });

                    // Так как мы уже отрисовали картинку рынка внутри этого if, 
                    // предотвращаем повторную отрисовку ниже, временно уменьшая размер до 0
                    ctx.restore();
                    return;
                }
                // --------------------------------------------------

            } else {
                p.rotation += p.speed;
                ctx.rotate(p.rotation);
            }

            // Рендерим остальные планеты
            ctx.drawImage(p.img, -p.size/2, -p.size/2, p.size, p.size);
            ctx.restore();
        }
    });
    
    requestAnimationFrame(draw);
}

function activatePlanet(id) {
    if (isAnyModalOpen()) return;

    if (id === 'runner') {
        // ... твой код проверки энергии ...
        if (playerData.energy < 10) {
            if (window.Telegram && Telegram.WebApp.showAlert) {
                Telegram.WebApp.showAlert("Недостаточно энергии! Нужно минимум 10 ⚡");
            }
            return;
        }
        playerData.energy -= 10;
        if (typeof updateUI === "function") updateUI();
        if (typeof userRef !== "undefined") userRef.update({ energy: playerData.energy });
        if (typeof openRunnerWindow === "function") openRunnerWindow();
    } 
    else if (id === 'shop') {
        if (typeof openShop === 'function') openShop();
    }
    else if (id === 'leaderboard') {
        if (typeof openLeaderboard === 'function') openLeaderboard();
    }
    else if (id === 'moon') {
        if (typeof openMoonMenu === 'function') openMoonMenu();
    }
    else if (id === 'build') {
        if (typeof openEarth === 'function') {
            openEarth(); 
        } else {
            console.error("Функция openEarth не найдена!");
        }
    }
    else if (id === 'guild') {
        if (typeof openGuildWindow === 'function') {
            openGuildWindow();
        } else {
            console.error("Функция openGuildWindow не найдена!");
        }
    }
    // ДОБАВЛЯЕМ ОБРАБОТКУ КЛИКА ПО КОСМИЧЕСКОМУ РЫНКУ
    else if (id === 'market') {
        if (typeof openMarketWindow === 'function') {
            openMarketWindow();
        } else {
            console.error("Функция openMarketWindow не найдена!");
        }
    }
}

function openRunnerWindow() {
    // 1. ПРОВЕРКА ЭНЕРГИИ (Минимум 20 для старта)
    if (playerData.energy < 20) {
        alert("Недостаточно энергии для вылета! Нужно 20.");
        return; 
    }

    // 2. СПИСАНИЕ И СБРОС ТАЙМЕРА РЕГЕНА
    const now = Date.now();
    playerData.energy -= 20;
    playerData.lastEnergyUpdate = now; // Важно: реген начнет считать от этого момента

    // Сразу сохраняем списание в базу, чтобы игрок не схитрил, обновив страницу
    if (typeof userRef !== 'undefined' && userRef.update) {
        userRef.update({
            energy: playerData.energy,
            lastEnergyUpdate: playerData.lastEnergyUpdate
        });
    }

    // 3. СТАНДАРТНАЯ ЛОГИКА ЗАПУСКА
    isRunnerActive = true;
    sessionQuants = 0; 
    sessionQubi = 0; 
    sessionArtifacts = 0; 
    quants = [];

    // Обновление UI (энергия на главном экране)
    if (typeof updateUI === 'function') updateUI();

    // --- ОБНОВЛЕНИЕ HP ПЕРЕД СТАРТОМ ---
    if (typeof syncShipStats === 'function') {
        syncShipStats(); 
    } else {
        runnerShip.maxHp = 100;
        runnerShip.hp = 100;
    }

    // Сбрасываем визуальные счетчики в UI раннера
    const qEl = document.getElementById('runner-score-quant');
    const bEl = document.getElementById('runner-score-qubi');
    const aEl = document.getElementById('runner-score-artifact'); 
    
    if (qEl) qEl.innerText = "0";
    if (bEl) bEl.innerText = "0";
    if (aEl) aEl.innerText = "0";

    runnerWin.style.display = 'block';
    
    runnerShip.x = window.innerWidth / 2;
    runnerShip.targetX = window.innerWidth / 2;
    runnerShip.y = window.innerHeight - 250; 
    
    spawnRunnerObject();
    requestAnimationFrame(runnerLoop);

    console.log("🚀 Полет начат. Списано 20 энергии. Остаток:", playerData.energy);
}

function closeRunnerWindow() {
    isRunnerActive = false;
    
    // Прибавляем собранное за сессию к основным данным игрока
    playerData.quant += sessionQuants;
    playerData.qubi = (playerData.qubi || 0) + sessionQubi;
    playerData.artifacts = (playerData.artifacts || 0) + (sessionArtifacts || 0); // СОХРАНЯЕМ АРТЕФАКТЫ
    
    // Сохраняем всё в Firebase
    userRef.update({ 
        quant: playerData.quant, 
        qubi: playerData.qubi,
        artifacts: playerData.artifacts // ОТПРАВЛЯЕМ В ОБЛАКО
    }).then(() => {
        syncWithLeaderboard();
        updateUI(); 
        console.log("Прогресс сохранен: + " + (sessionArtifacts || 0) + " артефактов");
    }).catch((err) => {
        console.error("Ошибка сохранения:", err);
    });
    
    runnerWin.style.display = 'none';
    quants = []; 
}

function runnerLoop() {
    if (!isRunnerActive) return;

    runnerCtx.clearRect(0, 0, runnerCanvas.width, runnerCanvas.height);

    if (runnerBg.complete) {
        runnerCtx.drawImage(runnerBg, 0, 0, window.innerWidth, window.innerHeight);
    }

    let dx = runnerShip.targetX - runnerShip.x;
    runnerShip.x += dx * runnerShip.lerpSpeed;

    for (let i = quants.length - 1; i >= 0; i--) {
        let q = quants[i];
        
        if (q.type !== 'lightning') {
            q.y += q.speed;
        }

        if (q.type === 'lightning') {
            q.timer++;

            if (q.timer < q.warningTime) {
                runnerCtx.save();
                runnerCtx.globalAlpha = (Math.sin(Date.now() * 0.05) * 0.2) + 0.3;
                runnerCtx.fillStyle = '#00e5ff';
                runnerCtx.fillRect(q.x - q.width / 2, 0, q.width, window.innerHeight);
                runnerCtx.restore();
            } 
            else if (q.timer >= q.warningTime && q.timer < q.warningTime + 10) {
                q.active = true; 
                runnerCtx.save();
                if (typeof lightningImg !== 'undefined' && lightningImg.complete) {
                    runnerCtx.shadowBlur = 30;
                    runnerCtx.shadowColor = '#fff';
                    runnerCtx.drawImage(lightningImg, q.x - q.width, 0, q.width * 2, window.innerHeight);
                }
                
                if (q.timer === q.warningTime && tg.HapticFeedback) {
                    tg.HapticFeedback.notificationOccurred('error'); 
                }
                runnerCtx.restore();
            } 
            else {
                quants.splice(i, 1);
                continue;
            }
        }
        else if (q.type === 'meteor') {
            q.angle += q.rotationSpeed;
            if (meteorImg.complete) {
                runnerCtx.save();
                runnerCtx.translate(q.x, q.y);
                let tailLength = 5;
                for (let j = 0; j < tailLength; j++) {
                    let tailY = -j * (q.size / 3);
                    let tailSize = q.size * (1 - j/tailLength);
                    let alpha = 0.6 * (1 - j/tailLength);
                    runnerCtx.beginPath();
                    runnerCtx.fillStyle = `rgba(255, ${100 + j*30}, 0, ${alpha})`; 
                    runnerCtx.arc(0, tailY, tailSize / 2, 0, Math.PI * 2);
                    runnerCtx.fill();
                }
                runnerCtx.rotate(q.angle);
                runnerCtx.drawImage(meteorImg, -q.size/2, -q.size/2, q.size, q.size);
                runnerCtx.restore();
            }
        } 
        else if (q.type === 'alien') {
            if (alienImg.complete) {
                runnerCtx.drawImage(alienImg, q.x - q.size/2, q.y - q.size/2, q.size, q.size);
            }
            let now = Date.now();
            if (now - (q.lastShot || 0) > (q.shotInterval || 1500)) {
                quants.push({
                    x: q.x,
                    y: q.y + q.size / 2,
                    size: 20,
                    speed: q.speed + 4,
                    type: 'plasma'
                });
                q.lastShot = now;
            }
        }
        else if (q.type === 'plasma') {
            runnerCtx.save();
            runnerCtx.beginPath();
            runnerCtx.fillStyle = '#00e5ff';
            runnerCtx.shadowBlur = 15;
            runnerCtx.shadowColor = '#00e5ff';
            runnerCtx.arc(q.x, q.y, q.size / 2, 0, Math.PI * 2);
            runnerCtx.fill();
            runnerCtx.restore();
        }
        else {
            // Отрисовка бонусов: QUANT, QUBI и ARTIFACT
            let currentImg;
            if (q.type === 'artifact') {
                currentImg = artifactImg;
            } else {
                currentImg = (q.type === 'qubi') ? qubiImg : quantImg;
            }

            if (currentImg && currentImg.complete) {
                runnerCtx.drawImage(currentImg, q.x - q.size/2, q.y - q.size/2, q.size, q.size);
            }
        }

        // --- ЛОГИКА СТОЛКНОВЕНИЙ ---
        if (q.type === 'lightning') {
            if (q.active && Math.abs(q.x - runnerShip.x) < (runnerShip.w / 2.5 + q.width / 2)) {
                if (runnerShip.hp > 0) {
                    runnerShip.hp = 0;
                    gameOver();
                }
                return;
            }
        }
        else if (Math.hypot(q.x - runnerShip.x, q.y - runnerShip.y) < (runnerShip.w / 3 + q.size / 2)) {
            if (q.type === 'meteor') {
                runnerShip.hp -= 50;
                if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('warning');
                quants.splice(i, 1);
            } 
            else if (q.type === 'plasma') {
                runnerShip.hp -= 25;
                if (tg.HapticFeedback) tg.HapticFeedback.impactOccurred('medium');
                quants.splice(i, 1);
            }
            else if (q.type === 'alien') {
                runnerShip.hp -= 100;
                quants.splice(i, 1);
            }
            else {
                // Сбор ресурсов
                if (q.type === 'artifact') {
                    sessionArtifacts = (sessionArtifacts || 0) + 1;
                    if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
                } 
                else if (q.type === 'qubi') {
                    sessionQubi++;
                    if (tg.HapticFeedback) tg.HapticFeedback.impactOccurred('medium');
                } 
                else {
                    sessionQuants++;
                    if (tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
                }
                
                // Обновление интерфейса счета
                const qEl = document.getElementById('runner-score-quant');
                const bEl = document.getElementById('runner-score-qubi');
                const aEl = document.getElementById('runner-score-artifact'); 

                if (qEl) qEl.innerText = sessionQuants;
                if (bEl) bEl.innerText = sessionQubi;
                if (aEl) aEl.innerText = sessionArtifacts || 0;

                quants.splice(i, 1);
                continue;
            }

            if (runnerShip.hp <= 0) {
                runnerShip.hp = 0;
                gameOver();
                return;
            }
            continue;
        }

        if (q.type !== 'lightning' && q.y > window.innerHeight + q.size) {
            quants.splice(i, 1);
        }
    }

    // --- ОТРИСОВКА КОРАБЛЯ И HP BAR ---
    if (shipImg.complete) {
        runnerCtx.save();
        runnerCtx.translate(runnerShip.x, runnerShip.y);
        runnerCtx.rotate(dx * 0.02);
        runnerCtx.drawImage(shipImg, -runnerShip.w/2, -runnerShip.h/2, runnerShip.w, runnerShip.h);
        
        const barW = 60;
        const hpRate = Math.max(0, runnerShip.hp / (runnerShip.maxHp || 100));
        
        runnerCtx.fillStyle = 'rgba(255, 0, 0, 0.3)';
        runnerCtx.fillRect(-barW/2, -runnerShip.h/2 - 15, barW, 6);
        
        runnerCtx.fillStyle = hpRate > 0.3 ? '#00ff00' : '#ff4444'; 
        runnerCtx.fillRect(-barW/2, -runnerShip.h/2 - 15, barW * hpRate, 6);
        
        runnerCtx.restore();
    }
    
    requestAnimationFrame(runnerLoop);
}

function spawnLightning() {
    quants.push({
        x: runnerShip.x, 
        y: 0,
        width: 60, 
        type: 'lightning',
        warningTime: 35, 
        timer: 0,
        active: false
    });
}

function spawnRunnerObject() {
    if (!isRunnerActive) return;

    let rand = Math.random() * 100;

    if (rand < 10) {
        spawnLightning(); 
    } 
    else if (rand < 15) {
        let size = 70;
        quants.push({
            x: Math.random() * (window.innerWidth - size) + size / 2,
            y: -size,
            size: size,
            speed: 2 + Math.random() * 1.5,
            type: 'alien',
            lastShot: 0,
            shotInterval: 1500 
        });
    } 
    else if (rand < 40) {
        let size = 90;
        quants.push({
            x: Math.random() * (window.innerWidth - size) + size / 2,
            y: -size,
            size: size,
            speed: 4 + Math.random() * 3, 
            type: 'meteor',
            angle: Math.random() * Math.PI * 2,
            rotationSpeed: (Math.random() - 0.5) * 0.1
        });
    } 
    // БЛОК БОНУСОВ
    else {
        let bonusRand = Math.random() * 100;
        let type;
        
        if (bonusRand < 5) {
            type = 'artifact'; // Те самые 5% на артефакт
        } else if (bonusRand < 15) { 
            type = 'qubi';     // Оставляем шанс на QUBI
        } else {
            type = 'quant';    // Всё остальное - обычный QUANT
        }

        let newSize = (type === 'artifact') ? 65 : (type === 'qubi' ? 60 : 50); 
        
        quants.push({
            x: Math.random() * (window.innerWidth - newSize) + newSize / 2,
            y: -newSize,
            size: newSize,
            speed: 2.5 + Math.random() * 3.5,
            type: type
        });
    }

    // Рекурсивный вызов спавна
    let nextSpawn = 700 + Math.random() * 500;
    if (spawnRunnerObject.spawnTimer) clearTimeout(spawnRunnerObject.spawnTimer);
    spawnRunnerObject.spawnTimer = setTimeout(spawnRunnerObject, nextSpawn);
}

// --- ЛУННАЯ СТАНЦИЯ (ОБМЕН) ---

function openMoonMenu() {
    const modal = document.getElementById('moon-modal');
    if (modal) {
        modal.style.display = 'flex';
        updateMoonUI(); 
    }
}

function exchangeResources(getQubi, costQuant) {
    if (!playerData || !userRef) return;

    if (playerData.quant >= costQuant) {
        // Процесс обмена
        playerData.quant -= costQuant;
        playerData.qubi += getQubi;

        // Сохранение в базу данных
        userRef.update({
            quant: playerData.quant,
            qubi: playerData.qubi
        }).then(() => {
            console.log(`✅ Успешный обмен: ${getQubi} QUBI получено.`);
            
            // Визуальное обновление
            updateUI();
            
            // Можно добавить легкое уведомление через Telegram
            if (window.Telegram && window.Telegram.WebApp) {
                window.Telegram.WebApp.HapticFeedback.notificationOccurred('success');
            }
            
            alert(`Преобразование завершено!\nВы получили ${getQubi} QUBI`);
        }).catch((err) => {
            console.error("Ошибка при обмене:", err);
            alert("Ошибка связи с базой данных.");
        });
    } else {
        // Если денег не хватает
        if (window.Telegram && window.Telegram.WebApp) {
            window.Telegram.WebApp.HapticFeedback.notificationOccurred('error');
        }
        alert(`Недостаточно QUANT!\nВам нужно еще ${costQuant - playerData.quant} для этого пакета.`);
    }
}

function closeMoon() {
    const modal = document.getElementById('moon-modal');
    if (modal) modal.style.display = 'none';
}

function exchangeEnergy(type) {
    const today = new Date().toDateString();
    const stats = calculateCurrentStats(); // Получаем актуальный макс. лимит энергии
    
    if (!playerData.lastExchangeDate || playerData.lastExchangeDate !== today) {
        playerData.lastExchangeDate = today;
        playerData.dailyExchangeQuant = 0;
        playerData.dailyExchangeQubi = 0;
    }

    let cost = 0;
    let reward = 10;
    let limitMax = 0;
    let currentProcessed = 0;

    if (type === 'quant') {
        cost = 50;
        limitMax = 500;
        currentProcessed = playerData.dailyExchangeQuant || 0;
        
        if (playerData.quant < cost) {
            if(tg.showAlert) tg.showAlert("Недостаточно QUANT!");
            return;
        }
    } else if (type === 'qubi') {
        cost = 5;
        limitMax = 50;
        currentProcessed = playerData.dailyExchangeQubi || 0;

        if (playerData.qubi < cost) {
            if(tg.showAlert) tg.showAlert("Недостаточно QUBI!");
            return;
        }
    }

    if (currentProcessed + cost > limitMax) {
        if(tg.showAlert) tg.showAlert("Дневной лимит переработки исчерпан!");
        return;
    }

    // ИСПРАВЛЕНИЕ: Проверка на макс. энергию с учетом модулей
    if (playerData.energy >= stats.maxEnergy) {
        if(tg.showAlert) tg.showAlert("Энергия уже на максимуме (" + stats.maxEnergy + ")!");
        return;
    }

    if (type === 'quant') {
        playerData.quant -= cost;
        playerData.dailyExchangeQuant = currentProcessed + cost;
    } else {
        playerData.qubi -= cost;
        playerData.dailyExchangeQubi = currentProcessed + cost;
    }

    // Добавляем энергию, но не выше расширенного лимита
    playerData.energy = Math.min(stats.maxEnergy, (playerData.energy || 0) + reward);

    userRef.update({
        quant: playerData.quant,
        qubi: playerData.qubi,
        energy: playerData.energy,
        dailyExchangeQuant: playerData.dailyExchangeQuant,
        dailyExchangeQubi: playerData.dailyExchangeQubi,
        lastExchangeDate: playerData.lastExchangeDate
    }).then(() => {
        if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
        updateMoonUI(); 
        updateUI(); 
    }).catch(err => console.error("Ошибка обмена:", err));
}

function updateMoonUI() {
    const today = new Date().toDateString();

    if (!playerData.lastExchangeDate || playerData.lastExchangeDate !== today) {
        playerData.lastExchangeDate = today;
        playerData.dailyExchangeQuant = 0;
        playerData.dailyExchangeQubi = 0;
    }

    const resQuantEl = document.getElementById('res-amount-quant');
    const resQubiEl = document.getElementById('res-amount-qubi');
    if (resQuantEl) resQuantEl.innerText = Math.floor(playerData.quant || 0) + " QNT";
    if (resQubiEl) resQubiEl.innerText = Math.floor(playerData.qubi || 0) + " QUB";

    // QUANT Лимит
    const qProcessed = playerData.dailyExchangeQuant || 0;
    const qTotal = 500;
    const qPercent = Math.min(100, (qProcessed / qTotal) * 100);

    const qText = document.getElementById('limit-quant-text');
    const qFill = document.getElementById('limit-quant-fill');
    const qPercText = document.getElementById('limit-quant-percent');

    if (qText) qText.innerText = qProcessed;
    if (qPercText) qPercText.innerText = Math.floor(qPercent) + "%";
    if (qFill) {
        qFill.style.width = qPercent + "%";
        qFill.style.background = (qPercent >= 100) ? '#ff4444' : 'linear-gradient(90deg, #00e5ff, #007bff)';
    }

    // QUBI Лимит
    const bProcessed = playerData.dailyExchangeQubi || 0;
    const bTotal = 50;
    const bPercent = Math.min(100, (bProcessed / bTotal) * 100);

    const bText = document.getElementById('limit-qubi-text');
    const bFill = document.getElementById('limit-qubi-fill');
    const bPercText = document.getElementById('limit-qubi-percent');

    if (bText) bText.innerText = bProcessed;
    if (bPercText) bPercText.innerText = Math.floor(bPercent) + "%";
    if (bFill) {
        bFill.style.width = bPercent + "%";
        bFill.style.background = (bPercent >= 100) ? '#ff4444' : 'linear-gradient(90deg, #a855f7, #6b21a8)';
    }
}

function openLeaderboard() {
    const modal = document.getElementById('leaderboard-modal');
    const container = document.getElementById('leaderboard-container');
    
    if (modal) modal.style.display = 'flex';
    if (container) container.innerHTML = '<div style="text-align:center; padding:20px;">Загрузка...</div>';

    // Принудительная синхронизация перед чтением топа
    syncWithLeaderboard();

    db.ref('leaderboard').orderByChild('qubi').limitToLast(100).once('value', (snap) => {
        if (container) {
            container.innerHTML = '';
            let players = [];
            
            snap.forEach(child => {
                let data = child.val();
                data.uid = child.key; 
                players.push(data);
            });

            // Богатые сверху, выделяем себя синим
            players.reverse().forEach((p, i) => {
                const row = document.createElement('div');
                row.className = 'player-row';
                
                const isMe = p.uid === String(tgUser.id) ? 'style="color: #00e5ff; font-weight: bold; background: rgba(0,229,255,0.1); border-radius: 8px;"' : '';
                
                row.innerHTML = `
                    <span ${isMe}>${i + 1}. ${p.name || 'Unknown'}</span>
                    <span class="score" ${isMe}>${Math.floor(p.qubi || 0)} QUBI</span>
                `;
                container.appendChild(row);
            });
        }
    });
}

function closeLeaderboard() {
    const modal = document.getElementById('leaderboard-modal');
    if (modal) modal.style.display = 'none';
}

function gameOver() {
    if (!isRunnerActive) return; 
    isRunnerActive = false;
    runnerShip.hp = 0;

    if (spawnRunnerObject.spawnTimer) clearTimeout(spawnRunnerObject.spawnTimer);
    if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('error');

    setTimeout(() => {
        // Находим контейнер
        const report = document.querySelector('.results-container');
        if (!report) return; // Страховка от ошибок

        // Наполняем его данными (убедись, что переменные session... существуют)
        const sArt = window.sessionArtifacts || 0; 
        
        report.innerHTML = `
    <div class="result-row">
        <div class="result-label">
            <img src="assets/quant-icon.png" class="res-icon">
            <span>QUANT:</span>
        </div>
        <span class="res-value" style="color: #00e5ff;">+${sessionQuants}</span>
    </div>
    <div class="result-row">
        <div class="result-label">
            <img src="assets/qubi-icon.png" class="res-icon">
            <span>QUBI:</span>
        </div>
        <span class="res-value" style="color: #ffca28;">+${sessionQubi}</span>
    </div>
    <div class="result-row">
        <div class="result-label">
            <img src="assets/artifact.png" class="res-icon">
            <span>АРТЕФАКТЫ:</span>
        </div>
        <span class="res-value" style="color: #fff;">+${sessionArtifacts || 0}</span>
    </div>
`;
        // ТЕПЕРЬ ПОКАЗЫВАЕМ ОКНО
        document.getElementById('game-over-modal').style.display = 'flex';
        
    }, 500);
}

// Эту функцию привяжи к кнопке "ПОПРОБОВАТЬ СНОВА" в окне Game Over
// --- ВСТАВЬ ЭТО В САМЫЙ КОНЕЦ ТЕГА <script> ---

function restartGame() {
    console.log("Попытка перезапуска...");
    
    // 1. Скрываем окно
    const modal = document.getElementById('game-over-modal');
    if (modal) modal.style.display = 'none';

    // 2. ВЫЗЫВАЕМ СОХРАНЕНИЕ (если у тебя есть такая функция)
    // saveGameResults(); 

    // 3. Закрываем и открываем заново
    if (typeof closeRunnerWindow === "function") {
        closeRunnerWindow();
    }
    
    setTimeout(() => {
        if (typeof openRunnerWindow === "function") {
            openRunnerWindow();
        }
    }, 100);
}

function goToMenu() {
    console.log("Возврат в меню...");
    
    const modal = document.getElementById('game-over-modal');
    if (modal) modal.style.display = 'none';

    // Сохраняем результаты перед выходом
    // saveGameResults();

    if (typeof closeRunnerWindow === "function") {
        closeRunnerWindow();
    }
}

// --- УПРАВЛЕНИЕ И КЛИКИ ---
function isUiHit(target) { 
    return target.closest('.exit-btn') || target.closest('.score-display') || target.closest('button'); 
}

function isAnyModalOpen() {
    // Список всех ID модальных окон (добавили 'clan-window')
    const modals = [
        'moon-modal', 
        'leaderboard-modal', 
        'station-modal', 
        'shop-modal', 
        'runner-window',
        'clan-window' // Защита для планеты Гильдия
    ];
    
    return modals.some(id => {
        const el = document.getElementById(id);
        if (!el) return false;
        return window.getComputedStyle(el).display !== 'none';
    });
}

// --- ЛОГИКА ОБРАБОТКИ КЛИКОВ ---
function handleCanvasClick(e) {
    // 1. ПРОВЕРКА: Если клик был по интерфейсу (кнопки, инпуты, окна)
    // мы просто выходим и даем браузеру обработать клик в HTML
    if (e.target.tagName !== 'CANVAS') {
        return; 
    }

    // 2. БЛОКИРОВКА ФОНА, ЕСЛИ ОКНА ОТКРЫТЫ
    const earthScreen = document.getElementById('earth-screen');
    const nameModal = document.getElementById('name-input-modal');
    const buildMenu = document.getElementById('build-menu');

    const isUIOpen = (earthScreen && earthScreen.style.display === 'flex') || 
                     (nameModal && nameModal.style.display === 'flex') ||
                     (buildMenu && buildMenu.style.display === 'flex');

    if (isUIOpen) {
        return; // Блокируем вибрацию и логику планет
    }

    // 3. Остальная стандартная логика
    if (isAnyModalOpen()) return;

    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX || (e.touches && e.touches[0].clientX)) - rect.left;
    const y = (e.clientY || (e.touches && e.touches[0].clientY)) - rect.top;

    planets.forEach(p => {
        const dx = x - p.x;
        const dy = y - p.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < p.size / 2) {
            if (tg.HapticFeedback) tg.HapticFeedback.impactOccurred('medium');
            if (p.action) p.action();
            else activatePlanet(p.id);
        }
    });
}

// --- СЛУШАТЕЛИ СОБЫТИЙ ---
if (typeof canvas !== 'undefined' && canvas) {
    canvas.addEventListener('click', handleCanvasClick);
    canvas.addEventListener('touchstart', (e) => {
        handleCanvasClick(e);
        if (e.cancelable) e.preventDefault();
    }, { passive: false });
}

if (typeof runnerWin !== 'undefined' && runnerWin) {
    runnerWin.addEventListener('touchstart', (e) => {
        if (typeof isRunnerActive !== 'undefined' && isRunnerActive) {
            if (!isUiHit(e.target)) {
                runnerShip.targetX = e.touches[0].clientX;
            }
        }
    }, { passive: false });

    runnerWin.addEventListener('touchmove', (e) => {
        if (typeof isRunnerActive !== 'undefined' && isRunnerActive) {
            if (!isUiHit(e.target)) {
                runnerShip.targetX = e.touches[0].clientX;
                if (e.cancelable) e.preventDefault();
            }
        }
    }, { passive: false });
}

const exitRunnerBtn = document.getElementById('exit-runner');
if (exitRunnerBtn) {
    exitRunnerBtn.onclick = () => {
        if (typeof closeRunnerWindow === 'function') closeRunnerWindow();
    };
}

// --- ФУНКЦИИ МАГАЗИНА И АНГАРА ---
async function buyModule(moduleId) {
    const itemData = SHOP_MODULES.find(m => m.id === moduleId);
    if (!itemData) return;

    if (itemData.currency === 'TON') {
        try {
            const success = await payWithTON(itemData.price, itemData.id);
            if (success) grantModule(itemData);
        } catch (e) { console.error(e); }
        return;
    }

    let priceQuant = itemData.currency === 'QUANT' ? itemData.price : 0;
    let priceQubi = itemData.currency === 'QUBI' ? itemData.price : 0;

    if (playerData.quant < priceQuant || playerData.qubi < priceQubi) {
        if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('error');
        alert("Недостаточно ресурсов!");
        return;
    }
    playerData.quant -= priceQuant;
    playerData.qubi -= priceQubi;
    grantModule(itemData);
}

function grantModule(itemData) {
    if (!playerData.inventory) playerData.inventory = [];
    const newModule = {
        id: itemData.id + "_" + Date.now(), 
        shopId: itemData.id, name: itemData.name, type: itemData.type,
        power: itemData.power, rarity: itemData.rarity, img: itemData.img
    };
    playerData.inventory.push(newModule);
    userRef.update({ quant: playerData.quant, qubi: playerData.qubi, inventory: playerData.inventory })
    .then(() => {
        if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
        updateUI(); openShop();
    });
}

function openStation() {
    const modal = document.getElementById('station-modal');
    if (modal) modal.style.display = 'flex';

    // Получаем актуальные статы с учетом надетых модулей
    const current = calculateCurrentStats();

    // 1. Обновляем текстовые показатели в UI
    const hpEl = document.getElementById('stat-hp');
    const enEl = document.getElementById('stat-energy');
    const regEl = document.getElementById('stat-income-quant'); // Используем этот ID под реген, как в твоем исходнике

    if (hpEl) hpEl.innerText = current.hp;
    if (enEl) enEl.innerText = current.maxEnergy;
    
    if (regEl) {
        // Переводим мс в минуты (например, 60000мс -> 1.0 мин)
        const regenBonusMin = (current.regenBonusMs / 60000).toFixed(1);
        regEl.innerText = "-" + regenBonusMin + " мин";
    }

    // 2. Рендерим 5 верхних слотов экипировки
    const activeContainer = document.getElementById('active-slots-container');
    if (activeContainer) {
        activeContainer.innerHTML = '';
        for (let i = 0; i < 5; i++) {
            const slot = document.createElement('div');
            const equippedId = (playerData.equipped && playerData.equipped[i]) ? playerData.equipped[i] : null;
            
            if (equippedId) {
                const mod = playerData.inventory.find(m => m.id === equippedId);
                slot.className = 'slot-mini filled';
                const shopData = SHOP_MODULES.find(sm => sm.id === mod.shopId);
                const imgPath = shopData ? `assets/shop/${shopData.img}` : `assets/shop/module_01.png`;
                slot.innerHTML = `<img src="${imgPath}" style="width:100%; height:100%; object-fit:contain;">`;
            } else {
                slot.className = 'slot-mini empty';
            }
            activeContainer.appendChild(slot);
        }
    }

    // 3. Рендерим список всех модулей в инвентаре (нижний список)
    const scrollList = document.getElementById('inventory-scroll-list');
    if (scrollList) {
        scrollList.innerHTML = '';
        if (playerData.inventory && playerData.inventory.length > 0) {
            playerData.inventory.forEach(item => {
                const isEquipped = playerData.equipped && playerData.equipped.includes(item.id);
                const card = document.createElement('div');
                card.className = `module-card ${isEquipped ? 'equipped' : ''}`;
                
                const shopData = SHOP_MODULES.find(sm => sm.id === item.shopId);
                const imgPath = shopData ? `assets/shop/${shopData.img}` : `assets/shop/module_01.png`;

                card.innerHTML = `
                    <img src="${imgPath}" style="width:35px; height:35px; object-fit:contain;">
                    <div style="display:flex; flex-direction:column; margin-left:10px;">
                        <span style="font-size:12px; font-weight:bold;">${item.name}</span>
                        <small style="color: ${isEquipped ? '#00e5ff' : '#888'}; font-size:10px;">
                            ${isEquipped ? 'УСТАНОВЛЕНО' : 'В ГАРДЕРОБЕ'}
                        </small>
                    </div>
                `;
                
                // При клике на карточку — снимаем или надеваем модуль
                card.onclick = () => toggleModule(item.id);
                scrollList.appendChild(card);
            });
        } else {
            scrollList.innerHTML = '<div class="no-modules" style="text-align:center; padding:20px; color:#666;">Ангар пуст. Купи модули в магазине!</div>';
        }
    }
}

function toggleModule(modId) {
    if (!playerData.equipped) playerData.equipped = [];
    const index = playerData.equipped.indexOf(modId);
    if (index > -1) {
        playerData.equipped.splice(index, 1);
    } else if (playerData.equipped.length < 5) {
        playerData.equipped.push(modId);
    }
    userRef.update({ equipped: playerData.equipped }).then(() => openStation());
}

function closeStation() {
    const modal = document.getElementById('station-modal');
    if (modal) modal.style.display = 'none';
    if (typeof updateUI === "function") updateUI();
}

function openEarth() {
    if (!playerData.earthOpened) {
        if (playerData.quant < 500) {
            if (tg.WebApp && tg.WebApp.showAlert) {
                tg.WebApp.showAlert("Недостаточно ресурсов! Нужно 500 QUANT для терраформирования.");
            }
            return;
        }
        
        // Показываем окно
        const modal = document.getElementById('name-input-modal');
        modal.style.display = 'flex';
        
        // Автоматически ставим фокус в поле ввода через небольшую задержку
        setTimeout(() => {
            const input = document.getElementById('colony-name-input');
            input.focus();
            input.select(); // Выделяем текст "НОВАЯ ЗЕМЛЯ", чтобы его было легко стереть
        }, 100);

    } else {
        enterStrategyMode();
    }
}

// Новая функция для кнопки ОТМЕНА
function closeNameModal() {
    document.getElementById('name-input-modal').style.display = 'none';
}

function confirmColonyName() {
    const input = document.getElementById('colony-name-input');
    let pName = input.value.trim();
    
    if (!pName) pName = "НОВАЯ ЗЕМЛЯ";

    // Скрываем окно
    closeNameModal();

    // Снимаем оплату и открываем доступ
    playerData.earthOpened = true;
    playerData.colonyName = pName;
    playerData.quant -= 500;
    playerData.buildings = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    playerData.lastCollect = Date.now();

    // Сохраняем в Firebase
    userRef.update({
        earthOpened: true,
        colonyName: pName,
        quant: playerData.quant,
        buildings: playerData.buildings,
        lastCollect: playerData.lastCollect
    }).then(() => {
        updateUI();
        enterStrategyMode();
        if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
    });
}

function calculatePassiveIncome() {
    if (!playerData.buildings || !playerData.lastCollect) {
        console.log("Нет данных для начисления дохода");
        playerData.lastCollect = Date.now(); // Инициализируем, если пусто
        return;
    }

    const now = Date.now();
    const diffInMs = now - playerData.lastCollect;
    const hoursPassed = diffInMs / (1000 * 60 * 60);

    if (diffInMs < 10000) return; 

    let totalQuant = 0;
    let totalQubi = 0;

    playerData.buildings.forEach(b => {
        // Проверяем, что b - это объект и здание существует в конфиге
        if (b && b !== 0 && buildingTypes[b.type]) {
            const config = buildingTypes[b.type];
            const levelMult = b.level || 1; // Множитель уровня

            // Считаем доход: (Базовый доход * Уровень) * Прошедшее время
            if (config.yieldType === "quant") {
                totalQuant += (config.baseYield * levelMult) * hoursPassed;
            } else if (config.yieldType === "qubi") {
                totalQubi += (config.baseYield * levelMult) * hoursPassed;
            }
        }
    });

    if (totalQuant >= 1 || totalQubi >= 1) {
        const gainedQuant = Math.floor(totalQuant);
        const gainedQubi = Math.floor(totalQubi);

        playerData.quant += gainedQuant;
        playerData.qubi = (playerData.qubi || 0) + gainedQubi;
        playerData.lastCollect = now;

        userRef.update({
            quant: playerData.quant,
            qubi: playerData.qubi,
            lastCollect: now
        }).then(() => {
            console.log(`💰 Пассивный доход: +${gainedQuant} QNT, +${gainedQubi} QUBI`);
            updateUI(); 
            // Если мы на экране Земли, обновляем и его счетчики
            if (document.getElementById('earth-screen').style.display === 'flex') {
                updateEarthUI(); 
            }
        });
    }
}

function enterStrategyMode() {
    // 1. Показываем экран Земли
    const earthScreen = document.getElementById('earth-screen');
    if (earthScreen) earthScreen.style.display = 'flex';
    
    // 2. Выводим имя планеты
    const nameDisplay = document.getElementById('colony-name-display');
    if (nameDisplay) nameDisplay.innerText = playerData.colonyName || "КОЛОНИЯ";
    
    // 3. Обновляем балансы QUANT, QUBI и Артефактов в шапке экрана
    // Используем Math.floor, чтобы не пугать игрока длинными десятичными дробями
    const quantLabel = document.getElementById('earth-quant-balance');
    const qubiLabel = document.getElementById('earth-qubi-balance');
    const artLabel = document.getElementById('player-artifacts');

    if (quantLabel) quantLabel.innerText = Math.floor(playerData.quant);
    if (qubiLabel) qubiLabel.innerText = Math.floor(playerData.qubi || 0);
    if (artLabel) artLabel.innerText = playerData.artifacts || 0;
    
    // 4. Пересчитываем текущий доход в час (только текст в инфо-панели)
    updateColonyStats();

    // 5. Отрисовываем PNG здания в слотах
    renderBuildings();
    
    // Опционально: легкая вибрация при входе в режим стратегии
    if (window.tg && tg.HapticFeedback) {
        tg.HapticFeedback.impactOccurred('light');
    }
}

// Выход
function exitEarth() {
    // 1. Скрываем экран
    document.getElementById('earth-screen').style.display = 'none';

    // 2. Фиксируем время выхода, чтобы доход считался с этого момента
    if (playerData.earthOpened) {
        const now = Date.now();
        playerData.lastCollect = now;
        
        userRef.update({
            lastCollect: now
        }).then(() => {
            console.log("Время сбора синхронизировано при выходе.");
        });
    }
}

function updateEarthUI() {
    const quantLabel = document.getElementById('earth-quant-balance');
    const qubiLabel = document.getElementById('earth-qubi-balance');
    const artLabel = document.getElementById('player-artifacts');

    if (quantLabel) quantLabel.innerText = Math.floor(playerData.quant);
    if (qubiLabel) qubiLabel.innerText = Math.floor(playerData.qubi || 0);
    if (artLabel) artLabel.innerText = playerData.artifacts || 0;

    // Также обновляем статистику дохода в час
    updateColonyStats();
}

// Отрисовка зданий в слотах
function renderBuildings() {
    const grid = document.getElementById('building-grid');
    const slots = grid.getElementsByClassName('slot');

    playerData.buildings.forEach((b, index) => {
        const slot = slots[index];
        slot.innerHTML = ""; // Очищаем слот перед отрисовкой

        if (b !== 0 && b !== "0") {
            // Если здание есть (b — это объект {type: 'mine', level: 1})
            const typeInfo = buildingTypes[b.type];
            
            // Создаем картинку
            const img = document.createElement('img');
            img.src = typeInfo.icon; // Путь к твоим PNG
            img.alt = typeInfo.name;
            slot.appendChild(img);

            // Добавляем индикатор уровня
            const levelTag = document.createElement('div');
            levelTag.className = 'slot-level';
            levelTag.innerText = `Lvl ${b.level}`;
            slot.appendChild(levelTag);
        } else {
            // Если пусто — можно добавить плюсик или оставить прозрачным
            slot.innerHTML = '<span style="color: rgba(0,229,255,0.2); font-size: 24px;">+</span>';
        }
    });
}

let currentSelectedSlot = null; // Запоминаем, какой слот нажали

function clickSlot(index) {
    if (!playerData.buildings) return;

    let bData = playerData.buildings[index];

    // Если слот пустой
    if (bData === 0 || bData === "0") {
        currentSelectedSlot = index;
        openBuildMenu();
    } else {
        // Если здание есть, bData будет объектом типа {type: 'mine', level: 1}
        openUpgradeMenu(index, bData);
    }
}

function openUpgradeMenu(index, building) {
    const menu = document.getElementById('build-menu');
    const list = document.getElementById('buildings-list');
    const typeInfo = buildingTypes[building.type];
    
    // Расчет стоимости: базовая цена * уровень
    const upgradeCost = typeInfo.artifactUpgradeBase * building.level;
    const hasArtifacts = (playerData.artifacts || 0) >= upgradeCost;

    list.innerHTML = `
        <div style="padding: 10px; text-align: center;">
            <img src="${typeInfo.icon}" style="width: 80px; margin-bottom: 10px; filter: drop-shadow(0 0 10px #00e5ff);">
            
            <h3 style="color: #fff; margin: 5px 0;">${typeInfo.name}</h3>
            <p style="color: #aaa; font-size: 12px;">Уровень: ${building.level} → <span style="color: #00e5ff;">${building.level + 1}</span></p>
            
            <div style="background: rgba(0,0,0,0.3); padding: 15px; border-radius: 12px; margin: 15px 0;">
                <div style="font-size: 11px; color: #eee; margin-bottom: 8px;">Стоимость улучшения:</div>
                
                <div style="font-size: 20px; font-weight: bold; color: ${hasArtifacts ? '#ffca28' : '#ff4b2b'}; display: flex; align-items: center; justify-content: center; gap: 12px;">
                    <img src="assets/artifact.png" style="width: 52px; height: 52px; object-fit: contain; filter: drop-shadow(0 0 8px rgba(255, 202, 40, 0.4));">
                    <span>${upgradeCost} Артефактов</span>
                </div>
            </div>

            <button onclick="upgradeBuilding(${index})" 
                style="width: 100%; padding: 14px; background: ${hasArtifacts ? '#00e5ff' : '#444'}; 
                color: #000; border: none; border-radius: 10px; font-weight: bold; cursor: pointer; transition: 0.2s;">
                ${hasArtifacts ? 'УЛУЧШИТЬ' : 'НУЖНО БОЛЬШЕ АРТЕФАКТОВ'}
            </button>
        </div>
    `;

    menu.style.display = 'flex';
}

function openBuildMenu() {
    const menu = document.getElementById('build-menu');
    const list = document.getElementById('buildings-list');
    list.innerHTML = ""; 

    Object.keys(buildingTypes).forEach(key => {
        const b = buildingTypes[key];
        const item = document.createElement('div');
        item.className = 'build-item';
        
        // Проверяем, хватает ли денег, чтобы визуально подсказать игроку
        const canAfford = playerData.quant >= b.baseCost;
        if (!canAfford) item.style.opacity = "0.5";

        item.onclick = () => {
            if (canAfford) {
                buildBuilding(currentSelectedSlot, key);
                closeBuildMenu();
            } else {
                tg.HapticFeedback.notificationOccurred('error');
                alert("Недостаточно QUANT!");
            }
        };

        item.innerHTML = `
            <div class="build-icon">
                <img src="${b.icon}" style="width: 40px; height: 40px; object-fit: contain;">
            </div>
            <div class="build-info">
                <span class="build-name">${b.name}</span>
                <span class="build-cost" style="color: ${canAfford ? '#00e5ff' : '#ff4b2b'}">
                    Цена: ${b.baseCost} QNT
                </span>
            </div>
        `;
        list.appendChild(item);
    });

    menu.style.display = 'flex';
}

function buildBuilding(slotIndex, type) {
    const config = buildingTypes[type];

    // --- ПРОВЕРКА НА ДУБЛИКАТЫ ---
    // Проверяем, есть ли уже здание такого типа в любом из слотов
    const alreadyHasThisType = playerData.buildings && playerData.buildings.some(b => b && b.type === type);

    if (alreadyHasThisType) {
        if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('error');
        alert(`Здание типа "${config.name}" уже построено! Нельзя ставить одинаковые здания.`);
        return; // Останавливаем выполнение функции
    }
    // -----------------------------

    // 1. Проверяем баланс еще раз (на всякий случай)
    if (playerData.quant >= config.baseCost) {
        
        // 2. Списываем валюту
        playerData.quant -= config.baseCost;

        // 3. Создаем объект здания в нужном слоте
        // Убедимся, что массив существует
        if (!playerData.buildings) playerData.buildings = [];

        playerData.buildings[slotIndex] = {
            type: type,
            level: 1
        };

        // 4. Сохраняем обновленный массив зданий и баланс в Firebase
        userRef.update({
            quant: playerData.quant,
            buildings: playerData.buildings
        }).then(() => {
            // 5. Обновляем интерфейс
            renderBuildings();   // Перерисовываем иконки на планете
            updateColonyStats(); // Пересчитываем доход в час
            updateUI();          // Обновляем общий баланс в шапке
            
            if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
            console.log(`Здание ${config.name} успешно построено!`);
        }).catch((err) => {
            console.error("Ошибка при сохранении постройки:", err);
        });

    } else {
        // Если вдруг денег не хватило
        if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('error');
        alert("Недостаточно ресурсов!");
    }
}

function upgradeBuilding(index) {
    const building = playerData.buildings[index];
    const typeInfo = buildingTypes[building.type];
    const upgradeCost = typeInfo.artifactUpgradeBase * building.level;

    if (playerData.artifacts >= upgradeCost) {
        playerData.artifacts -= upgradeCost;
        playerData.buildings[index].level += 1; // Повышаем уровень!

        // Синхронизируем
        userRef.update({
            artifacts: playerData.artifacts,
            buildings: playerData.buildings
        }).then(() => {
            closeBuildMenu();
            renderBuildings(); // Перерисовываем слоты (чтобы сменился Lvl)
            updateEarthUI();   // Обновляем счетчики артефактов
            tg.HapticFeedback.notificationOccurred('success');
        });
    } else {
        tg.HapticFeedback.notificationOccurred('error');
    }
}

function closeBuildMenu() {
    document.getElementById('build-menu').style.display = 'none';
}

function updateColonyStats() {
    if (!playerData.buildings) return;

    let totalQNT = 0;
    let totalQUBI = 0;

    playerData.buildings.forEach(b => {
        if (b && b !== 0 && b !== "0") {
            const config = buildingTypes[b.type];
            // Проверяем, существует ли конфиг для этого типа здания
            if (config) {
                if (config.yieldType === "quant") {
                    totalQNT += config.baseYield * (b.level || 1);
                } else if (config.yieldType === "qubi") {
                    totalQUBI += config.baseYield * (b.level || 1);
                }
            }
        }
    });

    // 1. Обновляем доход QUANT
    const qntYieldEl = document.getElementById('total-yield');
    if (qntYieldEl) qntYieldEl.innerText = totalQNT;

    // 2. ОБНОВЛЯЕМ ДОХОД QUBI (добавлено)
    const qubiYieldEl = document.getElementById('total-qubi-yield');
    if (qubiYieldEl) qubiYieldEl.innerText = totalQUBI;

    // 3. Обновляем артефакты
    const artEl = document.getElementById('player-artifacts');
    if (artEl) {
        artEl.innerText = playerData.artifacts || 0;
    }
}

// Функция сбора (вызывается кнопкой)
function collectResources() {
    const now = Date.now();
    const last = playerData.lastCollect || now;
    const hoursPassed = (now - last) / (1000 * 60 * 60);

    if (hoursPassed < 0.01) { 
        if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('warning');
        return;
    }

    let earnedQNT = 0;
    let earnedQUBI = 0;

    playerData.buildings.forEach(b => {
        if (b && b !== 0) {
            const config = buildingTypes[b.type];
            const yieldVal = config.baseYield * (b.level || 1) * hoursPassed;
            if (config.yieldType === "quant") earnedQNT += yieldVal;
            if (config.yieldType === "qubi") earnedQUBI += yieldVal;
        }
    });

    const finalQNT = Math.floor(earnedQNT);
    const finalQUBI = Math.floor(earnedQUBI);

    playerData.quant += finalQNT;
    playerData.qubi = (playerData.qubi || 0) + finalQUBI;
    playerData.lastCollect = now;

    // Сохраняем и обновляем UI
    userRef.update({
        quant: playerData.quant,
        qubi: playerData.qubi,
        lastCollect: now
    }).then(() => {
        updateUI();
        updateEarthUI();
        showCollectModal(finalQNT, finalQUBI); // Вызываем красивое окно
    });

    if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
}

// Функции для управления окном сбора
function showCollectModal(qnt, qubi) {
    const report = document.getElementById('collect-report');
    
    // Показываем 1 знак после запятой, чтобы видеть даже +0.1
    const finalQNT = Number(qnt || 0).toFixed(1);
    const finalQUBI = Number(qubi || 0).toFixed(1);

    let html = `
        <div class="resource-line">
            <div style="display: flex; align-items: center; gap: 8px;">
                <img src="assets/quant-icon.png" class="modal-icon">
                <span>QUANT:</span>
            </div>
            <span style="color: #fff; font-weight: bold;">+${finalQNT}</span>
        </div>
    `;
    
    // Теперь ищем 'lab', так как ты переименовал тип здания
    const hasLab = playerData.buildings && playerData.buildings.some(b => b && b.type === 'lab');

    if (hasLab) {
        html += `
            <div class="resource-line" style="margin-top: 10px;">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <img src="assets/qubi-icon.png" class="modal-icon">
                    <span>QUBI:</span>
                </div>
                <span style="color: #00e5ff; font-weight: bold;">+${finalQUBI}</span>
            </div>
        `;
    }

    report.innerHTML = html;
    document.getElementById('collect-modal').style.display = 'flex';
}

function closeCollectModal() {
    document.getElementById('collect-modal').style.display = 'none';
}

// 1. Открытие поиска
// 1. Открытие поиска (Версия для Realtime Database)
// Поиск игрока
async function openPvPSearch() {
    const pvpWin = document.getElementById('pvp-window');
    pvpWin.style.display = 'block'; 

    // 1. СКРЫВАЕМ ЛИШНЕЕ: Прячем полоску прогресса и кнопку "Отступить"
    const pvpHeader = document.querySelector('.pvp-ui-header');
    if (pvpHeader) pvpHeader.style.visibility = 'hidden'; 

    const radar = document.getElementById('pvp-radar-overlay');
    const targetCard = document.getElementById('pvp-target-card');
    const status = document.getElementById('radar-status');

    targetCard.style.display = 'none'; 
    radar.style.display = 'flex';
    status.innerText = "SCANNING FOR TARGETS...";

    try {
        const snapshot = await db.ref('users').once('value');
        const usersData = snapshot.val();
        const allPlayers = [];
        const myId = String(tgUser.id);

        if (usersData) {
            const SIX_HOURS = 6 * 60 * 60 * 1000; // Кулдаун в миллисекундах
            const now = Date.now();

            // --- БАЛАНС ВЕСОВЫХ КАТЕГОРИЙ ---
            const myQuant = playerData.quant || 0;
            const minQuantLimit = myQuant * 0.5; // Минимальный порог баланса жертвы
            const maxQuantLimit = myQuant * 2.0; // Максимальный порог баланса жертвы

            Object.keys(usersData).forEach(userId => {
                if (userId !== myId) {
                    const user = usersData[userId];
                    const targetQuant = user.quant || 0;

                    // ПРОВЕРКА 1: Фильтр по силе (количеству QUANT)
                    if (targetQuant < minQuantLimit || targetQuant > maxQuantLimit) {
                        return; // Пропускаем: игрок слишком беден или слишком богат для нас
                    }
                    
                    // ПРОВЕРКА 2: КУЛДАУН (ЩИТ ПОСЛЕ ОГРАБЛЕНИЯ)
                    const lastRobbed = user.lastRobbed || 0;
                    if (now - lastRobbed < SIX_HOURS) {
                        return; // Пропускаем игрока, система его не выдаст для атаки
                    }
                    
                    // Расчет защиты врага (ищем здание типа shield)
                    let defenseBonus = 0;
                    if (user.buildings && Array.isArray(user.buildings)) {
                        const shieldBuilding = user.buildings.find(b => b && b.type === 'shield');
                        if (shieldBuilding) {
                            defenseBonus = (shieldBuilding.level || 1) * 5; 
                        }
                    }

                    allPlayers.push({
                        name: user.colonyName || user.name || user.first_name || "Unknown Colony",
                        resources: targetQuant,
                        id: userId,
                        defensePercent: defenseBonus
                    });
                }
            });
        }

        // Имитируем работу радара
        await new Promise(resolve => setTimeout(resolve, 3000)); 

        if (allPlayers.length > 0) {
            pvpOpponent = allPlayers[Math.floor(Math.random() * allPlayers.length)];
            
            // Заполняем карточку данными
            document.getElementById('target-name-display').innerText = pvpOpponent.name;
            document.getElementById('target-loot-display').innerText = Math.floor(pvpOpponent.resources) + " QUANT";
            
            // Выводим уровень защиты в поле под именем
            const rankLabel = document.getElementById('target-rank');
            if (rankLabel) {
                rankLabel.innerText = `SHIELD PROTECTION: ${pvpOpponent.defensePercent}%`;
                rankLabel.style.color = pvpOpponent.defensePercent > 0 ? "#00e5ff" : "#888";
            }
            
            radar.style.display = 'none';
            targetCard.style.display = 'block';
        } else {
            // Если в секторе нет равных игроков или все под щитами
            status.innerText = "NO TARGETS IN SECTOR RANGE";
            setTimeout(() => { 
                pvpWin.style.display = 'none'; 
                if (pvpHeader) pvpHeader.style.visibility = 'visible';
            }, 2500);
        }
    } catch (error) {
        console.error("Search error:", error);
        status.innerText = "SENSORS OFFLINE";
        setTimeout(() => {
            pvpWin.style.display = 'none';
            if (pvpHeader) pvpHeader.style.visibility = 'visible';
        }, 2000);
    }
}

// Функции кнопок в новой карточке
function closeTargetCard() {
    document.getElementById('pvp-target-card').style.display = 'none';
    document.getElementById('pvp-window').style.display = 'none';
    pvpOpponent = null;
}

function confirmRaid() {
    if (playerData.energy >= 60) {
        playerData.energy -= 60;
        userRef.update({ energy: playerData.energy }); // Сохраняем трату энергии
        
        // --- НОВАЯ ЛОГИКА ДИСТАНЦИИ ---
        const baseDistance = 2000; // Базовая сложность
        // Рассчитываем итоговую дистанцию: база + % защиты цели
        // pvpOpponent.defensePercent мы получили в функции openPvPSearch
        pvpTargetDistance = Math.floor(baseDistance * (1 + (pvpOpponent.defensePercent / 100)));

        // Обновляем визуальные счетчики дистанции в интерфейсе
        const maxDistEl = document.getElementById('pvp-max-dist');
        const currDistEl = document.getElementById('pvp-current-dist');
        if (maxDistEl) maxDistEl.innerText = pvpTargetDistance;
        if (currDistEl) currDistEl.innerText = "0";
        // ------------------------------

        // 1. Скрываем карточку цели
        document.getElementById('pvp-target-card').style.display = 'none';
        
        // 2. ВОЗВРАЩАЕМ ИНТЕРФЕЙС (Полоска прогресса и кнопка "Отступить")
        const pvpHeader = document.querySelector('.pvp-ui-header');
        if (pvpHeader) {
            pvpHeader.style.visibility = 'visible'; 
            pvpHeader.style.opacity = '1'; 
        }
        
        // 3. Обновляем имя цели в верхнем интерфейсе перед началом
        const targetNameEl = document.getElementById('pvp-target-name');
        if (targetNameEl) targetNameEl.innerText = pvpOpponent.name;
        
        // 4. Запуск игры (полет, препятствия, отсчет)
        startPvPMode(); 
        
        if (window.tg && tg.HapticFeedback) {
            tg.HapticFeedback.impactOccurred('medium'); // Вибрация при подтверждении атаки
        }
    } else {
        alert("NEED MORE ENERGY!");
    }
}

function startPvPMode() {
    isPvPActive = true;
    pvpDistance = 0;
    pvpWalls = [];

    if (pvpOpponent) {
        document.getElementById('pvp-target-name').innerText = pvpOpponent.name;
    }
    
    const container = document.getElementById('pvp-window');
    container.style.display = 'block';

    pvpCanvas.width = window.innerWidth;
    pvpCanvas.height = window.innerHeight;

    if (!pvpBgImg.src) {
        pvpBgImg.src = 'assets/pvp-bg.png'; 
    }

    runnerShip.x = pvpCanvas.width * 0.2; 
    runnerShip.y = pvpCanvas.height / 2; 
    runnerShip.vy = 0;
    runnerShip.hp = runnerShip.maxHp;

    const handleJump = (e) => {
        if (!isPvPActive) return;
        if (e.cancelable) e.preventDefault(); 
        runnerShip.vy = -9.0; 
        if (window.Telegram?.WebApp?.HapticFeedback) {
            window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
        }
    };

    container.replaceWith(container.cloneNode(true)); 
    const newContainer = document.getElementById('pvp-window');
    newContainer.addEventListener('touchstart', handleJump, { passive: false });

    // --- ЛОГИКА ОБРАТНОГО ОТСЧЕТА ---
    
    // Проверяем/создаем элемент текста в центре экрана
    let countdownElem = document.getElementById('pvp-countdown');
    if (!countdownElem) {
        countdownElem = document.createElement('div');
        countdownElem.id = 'pvp-countdown';
        newContainer.appendChild(countdownElem);
    }
    
    countdownElem.style.display = 'block';
    let timeLeft = 3;
    countdownElem.innerText = timeLeft;

    const countdownInterval = setInterval(() => {
        timeLeft -= 1;
        if (timeLeft > 0) {
            countdownElem.innerText = timeLeft;
        } else if (timeLeft === 0) {
            countdownElem.innerText = "GO!";
        } else {
            clearInterval(countdownInterval);
            countdownElem.style.display = 'none';
            
            // ЗАПУСК СТЕН только после завершения отсчета
            spawnPvPWallsLoop(); 
        }
    }, 1000);

    // ЗАПУСК ОТРИСОВКИ (сразу, чтобы игрок мог летать во время отсчета)
    pvpMainLoop();
}

// --- ИСПРАВЛЕННЫЙ ЦИКЛ ПВП ( game.js ) ---
function pvpMainLoop() {
    if (!isPvPActive) return;

    const canvas = document.getElementById('pvpCanvas');
    const ctx = canvas.getContext('2d');

    // ПРОВЕРКА: Идет ли сейчас отсчет?
    const countdownElem = document.getElementById('pvp-countdown');
    const isCounting = countdownElem && countdownElem.style.display !== 'none';

    // 1. РИСУЕМ ФОН
    if (pvpBgImg.complete) {
        ctx.drawImage(pvpBgImg, 0, 0, canvas.width, canvas.height);
    } else {
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // 2. ФИЗИКА КОРАБЛЯ (Летать можно всегда, даже во время отсчета)
    runnerShip.vy += 0.35; 
    runnerShip.y += runnerShip.vy;
    if (runnerShip.vy > 8) runnerShip.vy = 8;
    const shipRenderX = canvas.width * 0.2;

    // 3. ОТРИСОВКА СТЕН (Только если отсчет ЗАКОНЧЕН)
    if (!isCounting) {
        for (let i = pvpWalls.length - 1; i >= 0; i--) {
            let wall = pvpWalls[i];
            wall.x -= 5; 

            // Твоя красивая отрисовка стен
            ctx.lineWidth = 2;
            ctx.strokeStyle = "rgba(255, 75, 43, 0.6)"; 
            ctx.strokeRect(wall.x, wall.y, wall.w, wall.h);

            let gradient = ctx.createLinearGradient(wall.x, wall.y, wall.x + wall.w, wall.y);
            gradient.addColorStop(0, "rgba(255, 0, 51, 0.1)");
            gradient.addColorStop(0.5, "#ff0033");
            gradient.addColorStop(1, "rgba(255, 0, 51, 0.1)");

            ctx.fillStyle = gradient;
            ctx.shadowBlur = 20;
            ctx.shadowColor = "#ff0033";
            ctx.fillRect(wall.x + 2, wall.y + 2, wall.w - 4, wall.h - 4);
            ctx.shadowBlur = 0;

            // Проверка столкновения
            if (shipRenderX + 25 > wall.x && shipRenderX - 25 < wall.x + wall.w &&
                runnerShip.y + 25 > wall.y && runnerShip.y - 25 < wall.y + wall.h) {
                endPvP(false);
                return;
            }

            if (wall.x < -100) pvpWalls.splice(i, 1);
        }

        // 5. ПРОГРЕСС (Начисляем только когда летим со стенами)
        pvpDistance += 2;
        updatePvPUI();

        // Смерть об верх/низ экрана (Только во время активной игры)
        if (runnerShip.y > canvas.height || runnerShip.y < 0) {
            endPvP(false);
            return;
        }

        // Победа
        if (pvpDistance >= pvpTargetDistance) {
            endPvP(true);
            return;
        }
    }

    // 4. ОТРИСОВКА САМОЛЕТА (Всегда виден)
    ctx.save();
    ctx.translate(shipRenderX, runnerShip.y);
    ctx.rotate(runnerShip.vy * 0.05);
    
    const shipSize = 70; 
    const halfSize = shipSize / 2;
    if (shipImg.complete) {
        ctx.drawImage(shipImg, -halfSize, -halfSize, shipSize, shipSize);
    } else {
        ctx.fillStyle = "#00e5ff";
        ctx.fillRect(-halfSize, -halfSize, shipSize, shipSize);
    }
    ctx.restore();

    requestAnimationFrame(pvpMainLoop);
}
    
function endPvP(isWin) {
    isPvPActive = false;
    document.getElementById('pvp-window').style.display = 'none';

    if (isWin && pvpOpponent) {
        // 1. Рассчитываем 10%
        const loot = Math.floor(pvpOpponent.resources * 0.1);

        if (loot > 0) {
            // 2. Начисляем тебе (в локальную переменную и в базу)
            playerData.quant += loot;
            userRef.update({ quant: playerData.quant });

            // Создаем ссылку на папку врага в базе
            const opponentRef = firebase.database().ref('users/' + pvpOpponent.id);
            
            // 3. СПИСЫВАЕМ У ПРОТИВНИКА
            opponentRef.child('quant').transaction((currentQuant) => {
                if (currentQuant) {
                    return currentQuant - loot; // Вычитаем награбленное
                }
                return currentQuant;
            });

            // 4. НОВЫЙ БЛОК: ВЕШАЕМ ЩИТ ЖЕРТВЕ НА 6 ЧАСОВ
            opponentRef.update({
                lastRobbed: Date.now()
            }).then(() => {
                console.log(`Игрок ${pvpOpponent.name} получил защитный щит на 6 часов.`);
            }).catch((err) => {
                console.error("Ошибка установки щита жертве:", err);
            });

            alert(`Рейд успешен! Вы украли ${loot} QUANT у ${pvpOpponent.name}`);
        } else {
            alert("У цели слишком мало ресурсов. Красть нечего.");
        }
    } else if (!isWin) {
        alert("Рейд провален! Вы потеряли связь с базой.");
    }

    // Сброс оппонента
    pvpOpponent = null;
}

// Функция обновления интерфейса ПВП (полоска прогресса и метры)
function updatePvPUI() {
    const progress = Math.min(100, (pvpDistance / pvpTargetDistance) * 100);
    
    // 1. Находим полоску заполнения
    const fill = document.getElementById('pvp-progress-fill');
    if (fill) {
        fill.style.width = progress + "%";
    }
    
    // 2. Обновляем текстовое значение текущей дистанции
    const distText = document.getElementById('pvp-current-dist');
    if (distText) {
        distText.innerText = Math.floor(pvpDistance);
    }

    // 3. Обновляем макс. дистанцию (если она вдруг изменилась)
    const maxDistText = document.getElementById('pvp-max-dist');
    if (maxDistText) {
        maxDistText.innerText = Math.floor(pvpTargetDistance);
    }
}

function spawnPvPWallsLoop() {
    if (!isPvPActive) return;
    
    const canvas = document.getElementById('pvpCanvas');
    
    // 1. УВЕЛИЧИВАЕМ ПРОХОД
    // 260 — оптимально для самолета размером 70px. Будет место для маневра.
    const gap = 260; 
    const wallW = 50;

    // 2. УМНОЕ РАСПРЕДЕЛЕНИЕ ВЫСОТЫ
    // Минимальная высота стены — 50px, чтобы она всегда была видна
    const minWall = 50; 
    // Максимальная высота, чтобы оставалось место для gap и нижней стены
    const maxWall = canvas.height - gap - minWall;
    
    // Генерируем случайную высоту верхней стены в безопасных пределах
    const h = Math.random() * (maxWall - minWall) + minWall;

    // 3. ДОБАВЛЯЕМ СТЕНЫ В МАССИВ
    pvpWalls.push(
        { x: canvas.width, y: 0, w: wallW, h: h }, // Верхняя стена
        { x: canvas.width, y: h + gap, w: wallW, h: canvas.height - (h + gap) } // Нижняя стена
    );

    // 4. ТАЙМЕР СЛЕДУЮЩЕЙ ВОЛНЫ
    // Оставил 1500 (1.5 сек), этого достаточно при широком проходе.
    setTimeout(spawnPvPWallsLoop, 1500); 
}

// --- ЛОГИКА ГИЛЬДИЙ И КЛАНОВ ---

// ==========================================
//        СИСТЕМА КОСМИЧЕСКИХ ГИЛЬДИЙ
// ==========================================

// 1. ОТКРЫТИЕ ОКНА И ПРОВЕРКА СТАТУСА
async function openGuildWindow() {
    console.log("Открытие окна гильдии...");
    const clanWin = document.getElementById('clan-window');
    if (!clanWin) return console.error("Элемент 'clan-window' не найден в HTML!");
    
    clanWin.style.display = 'block';
    
    const noClanScreen = document.getElementById('clan-no-clan-screen');
    const mainScreen = document.getElementById('clan-main-screen');
    
    // Безопасная проверка: если playerData еще не подгрузился
    const currentClanId = (typeof playerData !== 'undefined' && playerData) ? playerData.clanId : "";
    
    if (!currentClanId) {
        if (noClanScreen) noClanScreen.style.display = 'block';
        if (mainScreen) mainScreen.style.display = 'none';
        loadClansList();
    } else {
        if (noClanScreen) noClanScreen.style.display = 'none';
        if (mainScreen) mainScreen.style.display = 'block';
        loadMyClanData();
    }
}

// Вспомогательная функция для кнопки создания из HTML
function createClanAction() {
    const input = document.getElementById('new-clan-name-input');
    if (!input) return;
    const clanName = input.value.trim();
    
    if (clanName.length < 3) return alert("Название должно быть от 3 символов!");
    if (clanName.length > 20) return alert("Максимум 20 символов!");
    
    createClan(clanName);
    input.value = "";
}

// 2. СОЗДЕНИЕ КЛАНА В БАЗЕ
async function createClan(clanName) {
    if (typeof playerData === 'undefined' || !playerData) return;
    
    const PRICE = 10000; // Стоимость создания клана
    if (playerData.quant < PRICE) return alert("Недостаточно QUANT! Нужно 10,000.");

    playerData.quant -= PRICE;
    
    try {
        const clansRef = db.ref('clans');
        const newClanRef = clansRef.push(); // Генерируем уникальный ID для клана
        const clanId = newClanRef.key;

        const myId = String(tgUser.id);
        const myName = playerData.colonyName || tgUser.first_name || "Командир";

        const clanData = {
            name: clanName,
            leaderId: myId,
            leaderName: myName,
            totalQuant: playerData.quant, // Лидер сразу вносит свой баланс в рейтинг клана
            members: {
                [myId]: { name: myName, role: "leader" }
            }
        };

        await newClanRef.set(clanData);
        if (typeof userRef !== 'undefined') {
            await userRef.update({ 
                quant: playerData.quant,
                clanId: clanId 
            });
        }
        playerData.clanId = clanId;
        
        alert(`Гильдия "${clanName}" успешно зарегистрирована!`);
        openGuildWindow(); 
    } catch (e) {
        console.error("Ошибка создания клана:", e);
        alert("Не удалось создать гильдию. Ошибка базы данных.");
    }
}

// 3. ЗАГРУЗКА ТОП-ЛИСТА КЛАНОВ (С КИБЕРПАНК ДИЗАЙНОМ И ФИЛЬТРОМ КНОПОК)
function loadClansList() {
    const containerScreen1 = document.getElementById('clans-list-container');
    const containerScreen2 = document.getElementById('clan-main-clans-list-container');
    
    if (!containerScreen1 && !containerScreen2) return;

    db.ref('clans').orderByChild('totalQuant').limitToLast(10).once('value', (snapshot) => {
        try {
            const clansData = snapshot.val();
            
            if (containerScreen1) containerScreen1.innerHTML = "";
            if (containerScreen2) containerScreen2.innerHTML = "";

            if (!clansData) {
                const noClansHtml = "<p style='color: #4b5e80; text-align: center; font-size: 11px; font-family: monospace; padding: 20px;'>[СИСТЕМА]: Активные гильдии в данном секторе отсутствуют.</p>";
                if (containerScreen1) containerScreen1.innerHTML = noClansHtml;
                if (containerScreen2) containerScreen2.innerHTML = noClansHtml;
                return;
            }

            // Сортируем по убыванию очков
            const sortedClans = Object.keys(clansData).map(id => ({ id, ...clansData[id] }))
                .sort((a, b) => b.totalQuant - a.totalQuant);

            sortedClans.forEach((clan, index) => {
                const membersCount = clan.members ? Object.keys(clan.members).length : 0;
                const isMyClan = (typeof playerData !== 'undefined' && playerData.clanId === clan.id);
                
                // Цветовая разметка мест в топе
                const rankColor = index === 0 ? '#ff8100' : index === 1 ? '#e2e8f0' : index === 2 ? '#cd7f32' : '#3b4b69';
                const glowColor = index === 0 ? '#ff8100' : index === 1 ? '#ffffff' : index === 2 ? '#cd7f32' : '#00e5ff';

                // --- ЭКРАН 1: С КНОПКАМИ "ВСТУПИТЬ" ---
                if (containerScreen1) {
                    const row1 = document.createElement('div');
                    row1.style = "position: relative; background: linear-gradient(135deg, rgba(20, 30, 55, 0.6) 0%, rgba(10, 15, 30, 0.8) 100%); padding: 12px 16px; margin-bottom: 8px; border-radius: 10px; border: 1px solid rgba(0, 229, 255, 0.15); display: flex; justify-content: space-between; align-items: center; box-shadow: 0 4px 15px rgba(0,0,0,0.3); backdrop-filter: blur(3px); gap: 10px;";
                    row1.innerHTML = `
                        <div style="position: absolute; left: 0; top: 15%; width: 3px; height: 70%; background: ${rankColor}; box-shadow: 0 0 8px ${rankColor}; border-radius: 0 4px 4px 0;"></div>
                        <div style="padding-left: 6px; display: flex; align-items: center; gap: 10px;">
                            <span style="color: ${rankColor}; font-weight: bold; font-family: monospace; font-size: 14px; text-shadow: 0 0 6px ${index < 3 ? glowColor : 'transparent'};">#${index + 1}</span>
                            <div style="display: flex; flex-direction: column;">
                                <span style="font-weight: bold; color: #fff; font-size: 13px; letter-spacing: 0.5px;">${clan.name.toUpperCase()}</span>
                                <span style="color: #4b5e80; font-size: 10px; font-family: monospace;">ЭКИПАЖ: ${membersCount}</span>
                            </div>
                        </div>
                        <div style="display: flex; align-items: center; gap: 12px; flex-shrink: 0;">
                            <span style="color: #00e5ff; font-weight: bold; font-family: monospace; font-size: 13px;">${Math.floor(clan.totalQuant).toLocaleString()} Q</span>
                            <button onclick="joinClan('${clan.id}')" style="background: linear-gradient(90deg, #00e5ff, #00aaff); border: none; color: #000; padding: 5px 12px; border-radius: 6px; font-weight: 900; cursor: pointer; font-size: 10px; letter-spacing: 0.5px; box-shadow: 0 2px 8px rgba(0,229,255,0.2);">ВСТУПИТЬ</button>
                        </div>
                    `;
                    containerScreen1.appendChild(row1);
                }

                // --- ЭКРАН 2: БЕЗ КНОПОК С ВЫДЕЛЕНИЕМ СВОЕГО КЛАНА ---
                if (containerScreen2) {
                    const row2 = document.createElement('div');
                    const borderStyle = isMyClan 
                        ? "border: 1px solid rgba(255, 129, 0, 0.45); background: linear-gradient(135deg, rgba(35, 25, 15, 0.7) 0%, rgba(15, 10, 5, 0.9) 100%); box-shadow: 0 4px 20px rgba(255,129,0,0.15), inset 0 0 10px rgba(255,129,0,0.05);" 
                        : "border: 1px solid rgba(0, 229, 255, 0.12); background: linear-gradient(135deg, rgba(20, 30, 55, 0.5) 0%, rgba(10, 15, 30, 0.7) 100%);";

                    row2.style = `position: relative; padding: 12px 16px; margin-bottom: 8px; border-radius: 10px; display: flex; justify-content: space-between; align-items: center; backdrop-filter: blur(3px); gap: 10px; ${borderStyle}`;
                    row2.innerHTML = `
                        <div style="position: absolute; left: 0; top: 15%; width: 3px; height: 70%; background: ${isMyClan ? '#ff8100' : rankColor}; box-shadow: 0 0 8px ${isMyClan ? '#ff8100' : rankColor}; border-radius: 0 4px 4px 0;"></div>
                        <div style="padding-left: 6px; display: flex; align-items: center; gap: 10px;">
                            <span style="color: ${isMyClan ? '#ff8100' : rankColor}; font-weight: bold; font-family: monospace; font-size: 14px;">#${index + 1}</span>
                            <div style="display: flex; flex-direction: column;">
                                <span style="font-weight: bold; color: ${isMyClan ? '#ff8100' : '#fff'}; font-size: 13px; letter-spacing: 0.5px;">${clan.name.toUpperCase()} ${isMyClan ? '<span style="font-size:10px; font-weight:900;">[ВЫ]</span>' : ''}</span>
                                <span style="color: #4b5e80; font-size: 10px; font-family: monospace;">ПИРАТОВ: ${membersCount}</span>
                            </div>
                        </div>
                        <div style="text-align: right; flex-shrink: 0;">
                            <span style="color: ${isMyClan ? '#ff8100' : '#00e5ff'}; font-weight: bold; font-family: monospace; font-size: 13px; text-shadow: 0 0 8px ${isMyClan ? 'rgba(255,129,0,0.2)' : 'rgba(0,229,255,0.2)'};">${Math.floor(clan.totalQuant).toLocaleString()} Q</span>
                        </div>
                    `;
                    containerScreen2.appendChild(row2);
                }
            });

        } catch (err) {
            console.error("Ошибка обработки списка кланов:", err);
        }
    });
}

// 4. ВСТУПЛЕНИЕ В КЛАН
async function joinClan(clanId) {
    if (typeof playerData === 'undefined' || !playerData) return;
    const myId = String(tgUser.id);
    const myName = playerData.colonyName || tgUser.first_name || "Командир";

    try {
        await db.ref(`clans/${clanId}/members/${myId}`).set({ name: myName, role: "member" });
        await db.ref(`clans/${clanId}/totalQuant`).transaction((current) => (current || 0) + playerData.quant);
        
        if (typeof userRef !== 'undefined') {
            await userRef.update({ clanId: clanId });
        }
        playerData.clanId = clanId;

        alert("Вы успешно вступили в гильдию!");
        openGuildWindow();
    } catch (e) {
        console.error("Ошибка вступления:", e);
    }
}

// 5. ОТОБРАЖЕНИЕ СВОЕГО КЛАНА С НЕОНОВЫМ ДИЗАЙНОМ УЧАСТНИКОВ
function loadMyClanData() {
    if (typeof playerData === 'undefined' || !playerData || !playerData.clanId) return;

    db.ref('clans/' + playerData.clanId).once('value', async (snapshot) => {
        try {
            const clan = snapshot.val();
            if (!clan) {
                if (typeof userRef !== 'undefined') userRef.update({ clanId: "" });
                playerData.clanId = "";
                openGuildWindow();
                return;
            }

            // Перерасчет казны по актуальным кошелькам
            let freshTotalQuant = 0;
            const memberBalances = {}; 

            if (clan.members) {
                const memberIds = Object.keys(clan.members);
                for (const mId of memberIds) {
                    const userSnap = await db.ref(`users/${mId}/quant`).once('value');
                    const userActualQuant = userSnap.val() || 0;
                    freshTotalQuant += userActualQuant;
                    memberBalances[mId] = userActualQuant; 
                }
                
                if (Math.floor(clan.totalQuant) !== Math.floor(freshTotalQuant)) {
                    await db.ref(`clans/${playerData.clanId}/totalQuant`).set(Math.floor(freshTotalQuant));
                    clan.totalQuant = freshTotalQuant;
                }
            }

            const nameEl = document.getElementById('clan-my-name');
            const scoreEl = document.getElementById('clan-my-total-score');
            const membersContainer = document.getElementById('clan-members-list');
            const leaveBtn = document.getElementById('clan-leave-btn');
            const deleteBtn = document.getElementById('clan-delete-btn');
            
            const requestBlock = document.getElementById('clan-request-resources-block');
            const leaderBlock = document.getElementById('clan-leader-requests-block');

            if (nameEl) nameEl.innerText = clan.name.toUpperCase();
            if (scoreEl) scoreEl.innerText = Math.floor(clan.totalQuant).toLocaleString();
            if (!membersContainer) return;

            membersContainer.innerHTML = "";

            const myId = String(tgUser.id);
            const isAmILeader = (clan.leaderId === myId);

            if (isAmILeader) {
                if (leaveBtn) leaveBtn.style.display = 'none';
                if (deleteBtn) deleteBtn.style.display = 'block';
                if (requestBlock) requestBlock.style.display = 'none'; 
                if (leaderBlock) {
                    leaderBlock.style.display = 'block';
                    renderLeaderRequests(clan.requests, clan.totalQuant); 
                }
            } else {
                if (leaveBtn) leaveBtn.style.display = 'block';
                if (deleteBtn) deleteBtn.style.display = 'none';
                if (requestBlock) requestBlock.style.display = 'block'; 
                if (leaderBlock) leaderBlock.style.display = 'none';
            }

            // ОТРИСОВКА УЧАСТНИКОВ (СТИЛЬ МАРКЕТА)
            if (clan.members) {
                Object.keys(clan.members).forEach(mId => {
                    const member = clan.members[mId];
                    const isLeader = member.role === 'leader' || clan.leaderId === mId;
                    const actualQuant = memberBalances[mId] !== undefined ? Math.floor(memberBalances[mId]) : 0;
                    
                    const item = document.createElement('div');
                    item.style = `position: relative; background: linear-gradient(135deg, rgba(20, 30, 55, 0.6) 0%, rgba(10, 15, 30, 0.8) 100%); padding: 14px 16px; margin-bottom: 8px; border-radius: 10px; border: 1px solid ${isLeader ? 'rgba(255, 170, 0, 0.3)' : 'rgba(0, 229, 255, 0.15)'}; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 4px 15px rgba(0,0,0,0.3); backdrop-filter: blur(3px); gap: 15px;`;
                    
                    item.innerHTML = `
                        <div style="position: absolute; left: 0; top: 15%; width: 3px; height: 70%; background: ${isLeader ? '#ffaa00' : '#00e5ff'}; box-shadow: 0 0 8px ${isLeader ? '#ffaa00' : '#00e5ff'}; border-radius: 0 4px 4px 0;"></div>
                        <div style="padding-left: 6px; display: flex; flex-direction: column; gap: 4px;">
                            <div style="display: flex; align-items: center; gap: 6px;">
                                <span style="color: #fff; font-weight: bold; font-size: 13px; letter-spacing: 0.5px;">${member.name.toUpperCase()} ${mId === myId ? '<span style="color:#00e5ff; font-weight:normal; font-size:11px;">(ВЫ)</span>' : ''}</span>
                            </div>
                            <span style="color: #00e5ff; font-size: 11px; font-family: monospace;">ДОЛЯ КАЗНЫ: ${actualQuant.toLocaleString()} Q</span>
                        </div>
                        <span style="background: ${isLeader ? 'rgba(255,170,0,0.1)' : 'rgba(0,229,255,0.05)'}; border: 1px solid ${isLeader ? 'rgba(255,170,0,0.2)' : 'rgba(0,229,255,0.1)'}; color: ${isLeader ? '#ffaa00' : '#8fa0c2'}; font-size: 8px; padding: 1px 5px; border-radius: 4px; font-family: sans-serif; font-weight: bold; letter-spacing: 0.5px; flex-shrink: 0;">
                            ${isLeader ? 'ГЛАВА СИНДИКАТА' : 'ПИРАТ'}
                        </span>
                    `;
                    membersContainer.appendChild(item);
                });
            }

            loadClansList();
            initClanChat();
            
        } catch (err) {
            console.error("Ошибка отображения и пересчета клана:", err);
        }
    });
}

// 8. ОТПРАВКА ЗАПРОСА НА РЕСУРСЫ (ОТ ИГРОКА)
async function sendClanRequestAction() {
    const input = document.getElementById('clan-request-amount-input');
    if (!input) return;
    
    const amount = parseInt(input.value);
    if (isNaN(amount) || amount <= 0) return alert("Введите корректное число ресурсов!");
    
    const clanId = playerData.clanId;
    const myId = String(tgUser.id);
    const myName = playerData.colonyName || tgUser.first_name || "Командир";

    try {
        const reqRef = db.ref(`clans/${clanId}/requests`).push();
        await reqRef.set({
            userId: myId,
            userName: myName,
            amount: amount,
            timestamp: Date.now()
        });

        alert(`Запрос на ${amount} QUANT успешно отправлен Лидеру гильдии!`);
        input.value = "";
    } catch(e) {
        console.error("Ошибка отправки запроса:", e);
        alert("Не удалось отправить запрос.");
    }
}

// 9. ОТРЕСОВКА СПИСКА ЗАПРОСОВ ДЛЯ ЛИДЕРА (СТИЛЬ СДЕЛОК НА МАРКЕТЕ)
function renderLeaderRequests(requestsData, totalQuant) {
    const container = document.getElementById('clan-requests-list');
    if (!container) return;

    container.innerHTML = "";

    if (!requestsData) {
        container.innerHTML = "<p style='color: #4b5e80; text-align: center; font-size: 11px; font-family: monospace; padding: 10px;'>[РЕКРУТИНГ]: Активные запросы на ресурсы отсутствуют.</p>";
        return;
    }

    Object.keys(requestsData).forEach(reqId => {
        const req = requestsData[reqId];
        const row = document.createElement('div');
        
        row.style = "position: relative; background: linear-gradient(135deg, rgba(20, 30, 55, 0.5) 0%, rgba(10, 15, 30, 0.7) 100%); padding: 12px 14px; margin-bottom: 8px; border-radius: 10px; border: 1px solid rgba(0, 229, 255, 0.15); display: flex; justify-content: space-between; align-items: center; box-shadow: 0 4px 15px rgba(0,0,0,0.2); backdrop-filter: blur(3px); gap: 10px;";
        row.innerHTML = `
            <div style="position: absolute; left: 0; top: 15%; width: 3px; height: 70%; background: #00e5ff; box-shadow: 0 0 8px #00e5ff; border-radius: 0 4px 4px 0;"></div>
            <div style="padding-left: 6px; display: flex; flex-direction: column; gap: 2px;">
                <span style="color: #fff; font-weight: bold; font-size: 13px; font-family: sans-serif;">${req.userName.toUpperCase()}</span>
                <span style="font-size: 10px; color: #4b5e80; font-family: monospace;">ЗАПРОС: <span style="color:#ff8100; font-weight:bold;">${req.amount.toLocaleString()} Q</span></span>
            </div>
            <div style="display: flex; gap: 6px; flex-shrink: 0;">
                <button onclick="answerClanRequest('${reqId}', true, ${req.amount}, '${req.userId}', ${totalQuant})" style="background: linear-gradient(90deg, #00e5ff, #00aaff); border: none; color: #000; padding: 5px 10px; border-radius: 6px; font-weight: 900; font-size: 10px; cursor: pointer; font-family: sans-serif; letter-spacing: 0.5px; box-shadow: 0 2px 6px rgba(0,229,255,0.2);">ОДОБРИТЬ</button>
                <button onclick="answerClanRequest('${reqId}', false, ${req.amount}, '${req.userId}', ${totalQuant})" style="background: rgba(255,75,43,0.05); border: 1px solid rgba(255,75,43,0.4); color: #ff4b2b; padding: 5px 10px; border-radius: 6px; font-weight: bold; font-size: 10px; cursor: pointer; font-family: sans-serif;">ОТКАЗАТЬ</button>
            </div>
        `;
        container.appendChild(row);
    });
}

// 10. ОБРАБОТКА РЕШЕНИЯ ЛИДЕРА (ОДОБРИТЬ / ОТКАЗАТЬ)
async function answerClanRequest(reqId, isApproved, amount, targetUserId, totalQuant) {
    const clanId = playerData.clanId;

    if (isApproved && totalQuant < amount) {
        return alert("В казне гильдии недостаточно QUANT для одобрения этого запроса (общая сумма кошельков меньше запроса)!");
    }

    try {
        if (isApproved) {
            const clanSnapshot = await db.ref(`clans/${clanId}`).once('value');
            const clanData = clanSnapshot.val();
            
            if (!clanData || !clanData.members) {
                alert("Ошибка: структура клана нарушена.");
                return;
            }

            const membersIds = Object.keys(clanData.members);
            const balances = {};
            let currentTotalPool = 0;

            for (const mId of membersIds) {
                const userSnap = await db.ref(`users/${mId}/quant`).once('value');
                const userQuant = userSnap.val() || 0;
                balances[mId] = userQuant;
                currentTotalPool += userQuant; 
            }

            if (currentTotalPool < amount) {
                return alert("Кризис казны! Пока вы одобряли, участники уже потратили кванты.");
            }

            const updates = {};

            membersIds.forEach(mId => {
                let currentBalance = balances[mId];
                let share = currentTotalPool > 0 ? (currentBalance / currentTotalPool) : 0;
                let tax = amount * share;

                let newBalance = Math.max(0, currentBalance - tax);
                
                if (mId === targetUserId) {
                    newBalance += amount;
                }

                newBalance = Math.floor(newBalance);
                updates[`users/${mId}/quant`] = newBalance;

                if (mId === String(tgUser.id)) {
                    playerData.quant = newBalance;
                }
            });

            const newTotalQuant = Math.max(0, clanData.totalQuant - amount);
            updates[`clans/${clanId}/totalQuant`] = Math.floor(newTotalQuant);

            await db.ref().update(updates);

            await db.ref(`users/${targetUserId}/clanNotification`).set({
                text: `Лидер одобрил ваш запрос! Получено +${Math.floor(amount)} QUANT за счет взносов гильдии.`,
                timestamp: Date.now()
            });

            alert("Запрос одобрен! Сумма списана со всех участников пропорционально их кошелькам и выдана игроку.");
        } else {
            await db.ref(`users/${targetUserId}/clanNotification`).set({
                text: `Ваш запрос на получение ${Math.floor(amount)} QUANT был отклонен Лидером.`,
                timestamp: Date.now()
            });
            alert("Запрос отклонен.");
        }

        await db.ref(`clans/${clanId}/requests/${reqId}`).remove();
        loadMyClanData();
    } catch (e) {
        console.error("Критическая ошибка распределенной экономики клана:", e);
        alert("Произошла ошибка при расчете долей и списании ресурсов.");
    }
}

// 7. ПОЛНОЕ УДАЛЕНИЕ КЛАНА (ДОСТУПНО ТОЛЬКО ЛИДЕРУ)
async function deleteClanAction() {
    if (typeof playerData === 'undefined' || !playerData || !playerData.clanId) return;
    
    const confirmFirst = confirm("ВНИМАНИЕ! Вы действительно хотите ПОЛНОСТЬЮ УДАЛИТЬ эту гильдию? Все участники будут исключены!");
    if (!confirmFirst) return;

    const confirmSecond = confirm("Это действие необратимо! Подтвердить уничтожение сектора гильдии?");
    if (!confirmSecond) return;

    const clanId = playerData.clanId;
    const myId = String(tgUser.id);

    try {
        const snapshot = await db.ref(`clans/${clanId}`).once('value');
        const clanData = snapshot.val();

        if (!clanData) return;

        if (clanData.leaderId !== myId) {
            alert("Ошибка безопасности: Вы не являетесь создателем этой гильдии!");
            return;
        }

        if (clanData.members) {
            const memberIds = Object.keys(clanData.members);
            const updates = {};
            memberIds.forEach(id => {
                updates[`users/${id}/clanId`] = "";
            });
            await db.ref().update(updates);
        }

        await db.ref(`clans/${clanId}`).remove();
        playerData.clanId = "";
        
        alert("Гильдия была официально ликвидирована.");
        openGuildWindow(); 
    } catch (e) {
        console.error("Критическая ошибка при удалении гильдии:", e);
        alert("Не удалось распустить гильдию. Попробуйте позже.");
    }
}

// 6. ВЫХОД ИЗ КЛАНА
async function leaveClanAction() {
    if (typeof playerData === 'undefined' || !playerData || !playerData.clanId) return;
    if (!confirm("Вы уверены, что хотите покинуть эту гильдию?")) return;

    const myId = String(tgUser.id);
    const clanId = playerData.clanId;

    try {
        await db.ref(`clans/${clanId}/members/${myId}`).remove();
        await db.ref(`clans/${clanId}/totalQuant`).transaction((current) => Math.max(0, (current || 0) - playerData.quant));
        
        if (typeof userRef !== 'undefined') await userRef.update({ clanId: "" });
        playerData.clanId = "";

        alert("Вы покинули гильдию.");
        openGuildWindow();
    } catch (e) {
        console.error("Ошибка выхода из клана:", e);
    }
}

// ==========================================
//  ПОЛНОЭКРАННЫЙ КИБЕРЧАТ С ГОЛОСОВЫМИ (10с)
// ==========================================

let clanChatListener = null;
let mediaRecorder = null;
let audioChunks = [];
let recordingTimeout = null;
let isRecording = false;

function openClanChat() {
    const chatOverlay = document.getElementById('clan-chat-overlay');
    if (!chatOverlay) return;
    chatOverlay.style.display = 'flex';
    initClanChat();
}

function closeClanChat() {
    const chatOverlay = document.getElementById('clan-chat-overlay');
    if (chatOverlay) chatOverlay.style.display = 'none';
    if (isRecording) stopAudioRecording(false); // Отмена при закрытии
    
    if (clanChatListener && typeof playerData !== 'undefined' && playerData.clanId) {
        db.ref(`clans/${playerData.clanId}/chat`).off('value', clanChatListener);
        clanChatListener = null;
    }
}

function initClanChat() {
    if (typeof playerData === 'undefined' || !playerData || !playerData.clanId) return;
    
    const clanId = playerData.clanId;
    const chatContainer = document.getElementById('clan-chat-messages');
    if (!chatContainer) return;

    if (clanChatListener) {
        db.ref(`clans/${clanId}/chat`).off('value', clanChatListener);
    }

    clanChatListener = db.ref(`clans/${clanId}/chat`).limitToLast(50).on('value', (snapshot) => {
        chatContainer.innerHTML = "";
        const messages = snapshot.val();

        if (!messages) {
            chatContainer.innerHTML = "<div style='color: #4b5e80; text-align: center; font-size: 12px; font-family: monospace; padding-top: 50px;'>[СВЯЗЬ]: Квантовый эфир пуст.</div>";
            return;
        }

        const myId = String(tgUser.id);

        Object.keys(messages).forEach(msgId => {
            const msg = messages[msgId];
            const isMe = String(msg.userId) === myId;
            const time = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : "";

            // Проверяем, является ли сообщение голосовым (закодированным в Base64)
            let messageContent = msg.text;
            if (msg.text && msg.text.startsWith('data:audio/')) {
                messageContent = `
                    <div style="display: flex; align-items: center; gap: 8px; padding: 4px 0;">
                        <span style="font-size: 18px;">🎙️</span>
                        <audio src="${msg.text}" controls controlsList="nodownload" style="width: 180px; height: 30px; filter: invert(1) hue-rotate(180deg); opacity: 0.85;"></audio>
                    </div>
                `;
            }

            const msgHtml = `
                <div style="display: flex; flex-direction: column; align-items: ${isMe ? 'flex-end' : 'flex-start'}; margin-bottom: 12px; width: 100%;">
                    <div style="font-size: 10px; color: ${isMe ? '#00e5ff' : '#8fa0c2'}; font-family: monospace; margin-bottom: 4px; padding: 0 6px;">
                        ${msg.userName.toUpperCase()} <span style="color: #3b4b69; font-size: 9px;">• ${time}</span>
                    </div>
                    <div style="background: ${isMe ? 'linear-gradient(135deg, rgba(0,229,255,0.2) 0%, rgba(0,70,120,0.35) 100%)' : 'linear-gradient(135deg, rgba(20, 30, 55, 0.7) 0%, rgba(10, 15, 30, 0.9) 100%)'}; 
                                border: 1px solid ${isMe ? 'rgba(0,229,255,0.4)' : 'rgba(0, 229, 255, 0.15)'}; 
                                padding: 10px 14px; 
                                border-radius: ${isMe ? '16px 16px 4px 16px' : '16px 16px 16px 4px'}; 
                                max-width: 85%; color: #fff; font-size: 13px; word-break: break-word; 
                                box-shadow: 0 4px 15px rgba(0,0,0,0.4); backdrop-filter: blur(4px);">
                        ${messageContent}
                    </div>
                </div>
            `;
            chatContainer.innerHTML += msgHtml;
        });

        setTimeout(() => {
            chatContainer.scrollTo({ top: chatContainer.scrollHeight, behavior: 'smooth' });
        }, 50);
    });
}

// --- ФУНКЦИИ ЗАПИСИ ГОЛОСА ---

// --- ИСПРАВЛЕННЫЕ ФУНКЦИИ ЗАПИСИ ГОЛОСА ---

async function toggleVoiceRecording() {
    const btn = document.getElementById('clan-chat-voice-btn');
    if (!btn) return;

    if (!isRecording) {
        try {
            // Запрашиваем доступ строго к аудио-каналу
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            audioChunks = [];
            
            // Определяем, какой аудио-формат поддерживается устройством (iOS / Android / PC)
            let options = {};
            if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
                options = { mimeType: 'audio/webm;codecs=opus' };
            } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
                options = { mimeType: 'audio/mp4' }; // Для старых iOS устройств
            } else if (MediaRecorder.isTypeSupported('audio/wav')) {
                options = { mimeType: 'audio/wav' };
            }

            mediaRecorder = new MediaRecorder(stream, options);
            
            mediaRecorder.ondataavailable = (event) => {
                if (event.data && event.data.size > 0) {
                    audioChunks.push(event.data);
                }
            };

            mediaRecorder.onstop = async () => {
                try {
                    if (audioChunks.length === 0) {
                        alert("Ошибка: Устройство не записало аудио-данные.");
                        return;
                    }

                    // Сохраняем Blob с правильным типом миме-типа устройства
                    const audioBlob = new Blob(audioChunks, { type: mediaRecorder.mimeType || 'audio/webm' });
                    
                    // Переводим аудио файл в строку Base64
                    const reader = new FileReader();
                    reader.readAsDataURL(audioBlob);
                    reader.onloadend = async () => {
                        try {
                            const base64Audio = reader.result;
                            
                            // Важно: Проверяем, что строка Base64 успешно сформировалась
                            if (!base64Audio || base64Audio === "data:") {
                                alert("Ошибка: Не удалось перевести аудио в формат передачи.");
                                return;
                            }
                            
                            // Отправляем в базу
                            await pushMessageToFirebase(base64Audio);
                        } catch (firebaseErr) {
                            alert("Ошибка отправки в Firebase: " + firebaseErr.message);
                        }
                    };
                } catch (stopErr) {
                    alert("Ошибка обработки аудио: " + stopErr.message);
                } finally {
                    // В любом случае освобождаем микрофон устройства
                    stream.getTracks().forEach(track => track.stop());
                }
            };

            // Запускаем запись и настраиваем сбор данных каждые 500мс
            isRecording = true;
            mediaRecorder.start(500); 
            
            // Визуальный эффект записи
            btn.innerHTML = "🛑 10с";
            btn.style.background = "linear-gradient(90deg, #ff4b2b, #ff416c)";
            btn.style.boxShadow = "0 0 15px rgba(255,75,43,0.6)";
            
            // Ограничение времени
            recordingTimeout = setTimeout(() => {
                if (isRecording) stopAudioRecording(true);
            }, 10000);

        } catch (err) {
            console.error("Доступ к микрофону запрещен:", err);
            alert("Микрофон заблокирован. Разрешите доступ к микрофону в настройках Telegram / браузера.");
        }
    } else {
        // Остановка записи пользователем
        stopAudioRecording(true);
    }
}

function stopAudioRecording(shouldSave) {
    if (recordingTimeout) clearTimeout(recordingTimeout);
    
    const btn = document.getElementById('clan-chat-voice-btn');
    if (btn) {
        btn.innerHTML = "🎙️";
        btn.style.background = "rgba(0, 229, 255, 0.1)";
        btn.style.boxShadow = "none";
    }

    if (mediaRecorder && mediaRecorder.state !== "inactive") {
        if (!shouldSave) audioChunks = []; // Если отменили
        // Переводим в false строго перед вызовом .stop(), чтобы триггер не игнорировал запись
        isRecording = false;
        mediaRecorder.stop();
    } else {
        isRecording = false;
    }
}

async function sendClanSticker(emoji) {
    const stickerHtml = `<span style="font-size: 42px; display: inline-block; filter: drop-shadow(0 0 10px rgba(0,229,255,0.6)); animation: pulseSticker 1.2s infinite alternate; padding: 5px 0;">${emoji}</span>`;
    await pushMessageToFirebase(stickerHtml);
}

async function pushMessageToFirebase(content) {
    if (typeof playerData === 'undefined' || !playerData || !playerData.clanId) return;
    try {
        await db.ref(`clans/${playerData.clanId}/chat`).push({
            userId: String(tgUser.id),
            userName: playerData.colonyName || tgUser.first_name || "Пилот",
            text: content,
            timestamp: Date.now()
        });
    } catch (e) {
        console.error("Ошибка чата:", e);
    }
}

// ==========================================
//           ЛОГИКА КОСМИЧЕСКОГО РЫНКА
// ==========================================

// ==========================================
//          СИСТЕМА МЕЖПЛАНЕТНОГО РЫНКА       
// ==========================================

// Открытие окна рынка
function openMarketWindow() {
    const win = document.getElementById('market-window');
    if (!win) return;
    win.style.display = 'block';
    switchMarketTab('buy'); // По умолчанию открываем вкладку покупки
}

// Переключение вкладок рынка
function switchMarketTab(tab) {
    const buyPage = document.getElementById('market-page-buy');
    const sellPage = document.getElementById('market-page-sell');
    const buyTabBtn = document.getElementById('market-tab-buy');
    const sellTabBtn = document.getElementById('market-tab-sell');

    if (tab === 'buy') {
        if (buyPage) buyPage.style.display = 'block';
        if (sellPage) sellPage.style.display = 'none';
        
        buyTabBtn.style.color = '#00e5ff';
        buyTabBtn.style.background = 'rgba(0, 229, 255, 0.15)';
        buyTabBtn.style.borderColor = 'rgba(0, 229, 255, 0.3)';
        
        sellTabBtn.style.color = '#64748b';
        sellTabBtn.style.background = 'none';
        sellTabBtn.style.borderColor = 'transparent';
        loadMarketLots();
    } else {
        if (buyPage) buyPage.style.display = 'none';
        if (sellPage) sellPage.style.display = 'block';
        
        sellTabBtn.style.color = '#ff8100';
        sellTabBtn.style.background = 'rgba(255, 129, 0, 0.15)';
        sellTabBtn.style.borderColor = 'rgba(255, 129, 0, 0.3)';
        
        buyTabBtn.style.color = '#64748b';
        buyTabBtn.style.background = 'none';
        buyTabBtn.style.borderColor = 'transparent';
        updateMarketInventorySelect();
        loadMarketLots();
    }
}

// Перезаполнение селектора числовыми артефактами для улучшения зданий
function updateMarketInventorySelect() {
    const select = document.getElementById('market-item-select');
    if (!select) return;
    select.innerHTML = "";

    // Берем число артефактов из твоей переменной playerData.artifacts
    const artifactCount = parseInt(playerData.artifacts) || 0;

    // Если у игрока 0 артефактов
    if (artifactCount <= 0) {
        const opt = document.createElement('option');
        opt.text = "◤ СКЛАД ПУСТ: НЕТ АРТЕФАКТОВ ДЛЯ ЗДАНИЙ ◢";
        opt.value = "";
        select.appendChild(opt);
        return;
    }

    // Если артефакты есть, создаем один пункт, но показываем общее количество
    const opt = document.createElement('option');
    opt.value = "building_artifact"; // Специальный маркер предмета
    opt.text = `ДРЕВНИЙ АРТЕФАКТ УЛУЧШЕНИЯ (ДОСТУПНО: ${artifactCount} ШТ)`;
    select.appendChild(opt);
}

// ВЫСТАВЛЕНИЕ АРТЕФАКТОВ НА БИРЖУ С УКАЗАНИЕМ КОЛИЧЕСТВА
async function createMarketLotAction() {
    const select = document.getElementById('market-item-select');
    const amountInput = document.getElementById('market-amount-input');
    const priceInput = document.getElementById('market-price-input');
    const currencySelect = document.getElementById('market-currency-select');

    if (!select || !amountInput || !priceInput || !currencySelect || select.value !== "building_artifact") {
        return alert("Выберите артефакт для продажи!");
    }

    const amount = parseInt(amountInput.value);
    const pricePerOne = parseInt(priceInput.value); // Цена за 1 шт.
    const currency = currencySelect.value;

    if (isNaN(amount) || amount <= 0) {
        return alert("Укажите корректное количество!");
    }
    if (isNaN(pricePerOne) || pricePerOne <= 0) {
        return alert("Укажите корректную цену!");
    }

    // Проверяем запас артефактов на складе
    let currentArtifacts = parseInt(playerData.artifacts) || 0;
    if (currentArtifacts < amount) {
        return alert(`Недостаточно артефактов! У вас есть только ${currentArtifacts} шт.`);
    }

    const myId = String(tgUser.id);
    const myName = playerData.colonyName || tgUser.first_name || "Торговец";

    try {
        // Вычисляем суммарную стоимость ордера
        const totalPrice = pricePerOne * amount;

        // 1. Публикуем лот на рынке
        const lotRef = db.ref('marketplace').push();
        await lotRef.set({
            sellerId: myId,
            sellerName: myName,
            item: { 
                name: "Артефакт улучшения", 
                type: "РЕСУРС АПГРЕЙДА" 
            },
            amount: amount,          // Записываем количество
            price: totalPrice,       // Записываем ОБЩУЮ сумму ордера
            pricePerOne: pricePerOne,// Сохраняем цену за штуку
            currency: currency,
            timestamp: Date.now()
        });

        // 2. Списываем введенное количество артефактов у игрока локально
        playerData.artifacts = currentArtifacts - amount;
        
        // 3. Сохраняем новое число в Firebase
        await db.ref(`users/${myId}/artifacts`).set(playerData.artifacts);

        alert(`Ордер запущен! Выставили ${amount} шт. за общую сумму ${totalPrice.toLocaleString()} ${currency.toUpperCase()}`);
        
        // Сбрасываем поля формы
        priceInput.value = "";
        amountInput.value = "1";
        
        switchMarketTab('sell');
    } catch(e) {
        console.error("Ошибка выставления лота:", e);
        alert("Не удалось запустить ордер.");
    }
}

// ЗАГРУЗКА И ОТРИСОВКА ОРДЕРОВ (С КОЛИЧЕСТВОМ И СУММОЙ)
function loadMarketLots() {
    db.ref('marketplace').once('value', (snapshot) => {
        try {
            const lots = snapshot.val();
            const buyContainer = document.getElementById('market-lots-container');
            const myLotsContainer = document.getElementById('market-my-lots-container');
            const myId = String(tgUser.id);

            if (buyContainer) buyContainer.innerHTML = "";
            if (myLotsContainer) myLotsContainer.innerHTML = "";

            if (!lots) {
                if (buyContainer) buyContainer.innerHTML = "<p style='color: #4b5e80; text-align: center; font-size: 11px; font-family: monospace; padding: 20px;'>[СИСТЕМА]: Активные лоты на орбите отсутствуют.</p>";
                if (myLotsContainer) myLotsContainer.innerHTML = "<p style='color: #4b5e80; font-size: 11px; font-family: monospace; padding: 10px;'>[СИСТЕМА]: У вас нет запущенных ордеров.</p>";
                return;
            }

            let hasMyLots = false;
            let hasOtherLots = false;

            Object.keys(lots).forEach(lotId => {
                const lot = lots[lotId];
                const isMyLot = (lot.sellerId === myId);

                // Защита от старых лотов
                const amount = lot.amount || 1;
                
                // Отображаем ОБЩУЮ СУММУ ордера
                const displayPrice = Math.floor(lot.price).toLocaleString();
                const currencyName = lot.currency.toUpperCase();

                // ШАБЛОН КАРТОЧКИ
                const lotHtml = `
                    <div style="position: relative; background: linear-gradient(135deg, rgba(20, 30, 55, 0.6) 0%, rgba(10, 15, 30, 0.8) 100%); padding: 16px; border-radius: 10px; border: 1px solid ${isMyLot ? 'rgba(255, 129, 0, 0.4)' : 'rgba(0, 229, 255, 0.15)'}; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 4px 20px rgba(0,0,0,0.3), inset 0 0 15px rgba(255,255,255,0.02); backdrop-filter: blur(3px); gap: 15px;">
                        
                        <div style="position: absolute; left: 0; top: 15%; width: 3px; height: 70%; background: ${isMyLot ? '#ff8100' : '#00e5ff'}; box-shadow: 0 0 8px ${isMyLot ? '#ff8100' : '#00e5ff'}; border-radius: 0 4px 4px 0;"></div>

                        <div style="padding-left: 8px; flex: 1; min-width: 0;">
                            <div style="display: flex; align-items: center; gap: 4px; flex-wrap: wrap;">
                                <span style="color: #fff; font-weight: bold; font-size: 13px; letter-spacing: 0.5px; text-shadow: 0 0 10px rgba(255,255,255,0.1); font-family: sans-serif; white-space: nowrap;">
                                    ${lot.item.name.toUpperCase()} <span style="color: #00e5ff; font-family: monospace; font-weight: 900;">x${amount}</span>
                                </span>
                                <span style="background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); color: #7a8ba8; font-size: 8px; padding: 1px 4px; border-radius: 3px; font-family: sans-serif; font-weight: bold; white-space: nowrap;">
                                    ${lot.item.type || 'РЕСУРС АПГРЕЙДА'}
                                </span>
                            </div>
                            
                            <div style="font-size: 10px; color: #3b4b69; margin-top: 6px; font-family: monospace; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                ПОСТАВЩИК: <span style="color: #637aa3;">${lot.sellerName}</span> ${isMyLot ? '<span style="color:#ff8100; font-weight:bold;">[ВЫ]</span>' : ''}
                            </div>
                        </div>

                        <div style="text-align: right; display: flex; flex-direction: column; justify-content: center; align-items: flex-end; flex-shrink: 0;">
                            <div>
                                <span style="color: ${currencyName === 'QUBI' ? '#ffaa00' : '#00e5ff'}; font-weight: bold; font-family: monospace; font-size: 14px; text-shadow: 0 0 10px ${currencyName === 'QUBI' ? 'rgba(255,170,0,0.3)' : 'rgba(0,229,255,0.3)'};">
                                    ${displayPrice} <span style="font-size: 9px; background: ${currencyName === 'QUBI' ? '#ffaa00' : '#00e5ff'}; color: #000; padding: 1px 3px; border-radius: 3px; margin-left: 2px; font-weight: 900; vertical-align: middle;">${currencyName}</span>
                                </span>
                            </div>

                            ${
                                isMyLot 
                                ? `<button onclick="cancelMarketLotAction('${lotId}')" style="background: rgba(255,75,43,0.05); border: 1px solid rgba(255,75,43,0.5); color: #ff4b2b; padding: 4px 8px; margin-top: 8px; border-radius: 6px; font-size: 10px; font-weight: bold; cursor: pointer; letter-spacing: 0.5px; transition: all 0.2s; font-family: sans-serif;">ОТЗЫВ</button>`
                                : `<button onclick="buyMarketLotAction('${lotId}', ${lot.price}, '${lot.currency}', '${lot.sellerId}')" style="background: linear-gradient(90deg, #00e5ff, #00aaff); border: none; color: #000; padding: 5px 10px; margin-top: 8px; border-radius: 6px; font-size: 10px; font-weight: 900; cursor: pointer; letter-spacing: 0.5px; transition: all 0.2s; font-family: sans-serif; box-shadow: 0 3px 10px rgba(0,229,255,0.2);" onmousedown="this.style.transform='scale(0.95)'" onmouseup="this.style.transform='scale(1)'">КУПИТЬ ◢</button>`
                            }
                        </div>
                    </div>
                `;

                if (isMyLot) {
                    hasMyLots = true;
                    if (myLotsContainer) myLotsContainer.innerHTML += lotHtml;
                } else {
                    hasOtherLots = true;
                    if (buyContainer) buyContainer.innerHTML += lotHtml;
                }
            });

            if (!hasOtherLots && buyContainer) buyContainer.innerHTML = "<p style='color: #4b5e80; text-align: center; font-size: 11px; font-family: monospace; padding: 20px;'>[СИСТЕМА]: Все внешние контракты принадлежат вашей колонии.</p>";
            if (!hasMyLots && myLotsContainer) myLotsContainer.innerHTML = "<p style='color: #4b5e80; font-size: 11px; font-family: monospace; padding: 10px;'>[СИСТЕМА]: У вас нет активных объявлений.</p>";

        } catch (e) {
            console.error("Ошибка при чтении лотов рынка:", e);
        }
    });
}

// ОТЗЫВ ОРДЕРА (ЧИСТЫЙ ВОЗВРАТ В ЧИСЛОВОЕ ПОЛЕ)
async function cancelMarketLotAction(lotId) {
    const myId = String(tgUser.id);
    try {
        // 1. Извлекаем лот для проверки количества ресурсов
        const lotSnap = await db.ref(`marketplace/${lotId}`).once('value');
        const lot = lotSnap.val();
        if (!lot) {
            alert("Ордер не найден или уже обработан.");
            return;
        }

        const refundAmount = lot.amount || 1;

        // 2. Начисляем артефакты обратно в локальное состояние игрока
        playerData.artifacts = (parseInt(playerData.artifacts) || 0) + refundAmount;
        
        // 3. Пакетное обновление Firebase: возвращаем ресурсы и удаляем лот за один шаг
        const updates = {};
        updates[`users/${myId}/artifacts`] = playerData.artifacts;
        updates[`marketplace/${lotId}`] = null;

        await db.ref().update(updates);
        
        alert(`Ордер отменен. Пачка из ${refundAmount} шт. вернулась на склад.`);
        loadMarketLots();
    } catch(e) {
        console.error("Ошибка отмены ордера:", e);
        alert("Не удалось отменить ордер.");
    }
}

// ПОКУПКА ПАКЕТА АРТЕФАКТОВ С ЗАЩИТОЙ И ЛОГИРОВАНИЕМ
async function buyMarketLotAction(lotId, price, currency, sellerId) {
    const myId = String(tgUser.id);
    const lowerCurrency = currency.toLowerCase(); // Защита от разного регистра (quant/QUANT)
    
    // 1. Проверяем баланс локально
    const currentBalance = playerData[lowerCurrency] || 0; 
    if (currentBalance < price) {
        return alert(`Недостаточно средств! Нужно ${Math.floor(price).toLocaleString()} ${currency.toUpperCase()}`);
    }

    if (!confirm(`Купить этот ордер за ${Math.floor(price).toLocaleString()} ${currency.toUpperCase()}?`)) return;

    try {
        // 2. Подгружаем лот из базы для проверки актуальности
        const lotSnap = await db.ref(`marketplace/${lotId}`).once('value');
        const lot = lotSnap.val();
        
        if (!lot) {
            alert("Лот уже выкуплен другим колонистом или отменен!");
            loadMarketLots();
            return;
        }

        console.log("Пытаемся купить лот:", lot);

        // Определяем количество артефактов в лоте
        const boughtAmount = lot.amount || 1;

        // Безопасно извлекаем имя предмета
        let itemName = "Артефакт";
        if (lot.item) {
            itemName = typeof lot.item === 'object' ? (lot.item.name || "Артефакт") : String(lot.item);
        }

        // 3. Списываем валюту у покупателя в Firebase и локально
        playerData[lowerCurrency] = currentBalance - price;
        await db.ref(`users/${myId}/${lowerCurrency}`).set(playerData[lowerCurrency]);

        // 4. Начисляем валюту продавцу через безопасную транзакцию
        await db.ref(`users/${sellerId}/${lowerCurrency}`).transaction(current => (current || 0) + price);

        // 5. Начисляем купленные артефакты покупателю (в числовое поле artifacts)
        playerData.artifacts = (parseInt(playerData.artifacts) || 0) + boughtAmount;
        await db.ref(`users/${myId}/artifacts`).set(playerData.artifacts);

        // 6. Отправляем уведомление продавцу
        try {
            await db.ref(`users/${sellerId}/clanNotification`).set({
                text: `Ваш ордер на ${itemName} x${boughtAmount} успешно продан! Получено +${Math.floor(price)} ${currency.toUpperCase()}.`,
                timestamp: Date.now()
            });
        } catch (e) {
            console.log("Система уведомлений продавца недоступна, пропускаем...");
        }

        // 7. Удаляем выкупленный лот с рынка
        await db.ref(`marketplace/${lotId}`).remove();

        alert(`Контракт выполнен! На ваш склад зачислено ${boughtAmount} шт. артефактов.`);
        
        // Синхронизируем UI игры, если функция отрисовки интерфейса существует
        if (typeof updateUI === "function") updateUI(); 
        if (typeof updateHubBalances === "function") updateHubBalances();
        
        // Обновляем витрину рынка
        loadMarketLots();

    } catch(e) {
        console.error("КРИТИЧЕСКАЯ ОШИБКА СДЕЛКИ:", e);
        alert(`Сбой операции. Причина: ${e.message || "неизвестна"}.`);
    }
}

// 1. Создаем четкую функцию запуска
function startEverything() {
    console.log("Запуск всех систем...");
    initGame(); 
    // Мы НЕ вызываем здесь draw(), потому что в твоем файле 
    // regenerateEnergy уже вызывается внутри initGame (строка 206).
    // Но если ты хочешь, чтобы планеты крутились сразу, оставь:
    draw(); 
    
    // ВКЛЮЧАЕМ СЛУШАТЕЛЬ УВЕДОМЛЕНИЙ ОТ ЛИДЕРА ГИЛЬДИИ
    listenForClanNotifications();
}

// 2. Проверяем загрузку фона и стартуем
if (bg.complete) {
    startEverything();
} else {
    bg.onload = startEverything;
}

// 11. СЛУШАТЕЛЬ УВЕДОМЛЕНИЙ ОТ ГИЛЬДИИ
function listenForClanNotifications() {
    if (typeof tgUser === 'undefined' || !tgUser || !tgUser.id) return;

    const notifRef = db.ref(`users/${tgUser.id}/clanNotification`);
    
    // Слушаем изменения в реальном времени
    notifRef.on('value', (snapshot) => {
        const notif = snapshot.val();
        if (notif && notif.text) {
            // Показываем красивое системное уведомление
            showInGameAlert(notif.text);
            
            // Сразу удаляем его из базы, чтобы оно не показалось повторно
            notifRef.remove();
        }
    });
}

// Вспомогательная функция для красивого вывода уведомления прямо на игровой экран
function showInGameAlert(message) {
    // Создаем элемент уведомления динамически
    const alertDiv = document.createElement('div');
    alertDiv.style = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%) translateY(-100px);
        background: linear-gradient(135deg, rgba(10, 15, 30, 0.95) 0%, rgba(0, 0, 0, 0.95) 100%);
        border: 2px solid #00e5ff;
        box-shadow: 0 0 20px rgba(0, 229, 255, 0.4);
        color: #fff;
        padding: 15px 25px;
        border-radius: 8px;
        font-family: sans-serif;
        font-size: 14px;
        font-weight: bold;
        text-align: center;
        z-index: 10000;
        transition: transform 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.3s;
        opacity: 0;
        pointer-events: none;
        letter-spacing: 0.5px;
    `;
    alertDiv.innerText = message.toUpperCase();
    document.body.appendChild(alertDiv);

    // Анимация появления (выезжает сверху вниз за кнопки ТГ)
    setTimeout(() => {
        alertDiv.style.transform = 'translateX(-50%) translateY(100px)';
        alertDiv.style.opacity = '1';
    }, 100);

    // Анимация исчезновения через 4 секунды
    setTimeout(() => {
        alertDiv.style.transform = 'translateX(-50%) translateY(-100px)';
        alertDiv.style.opacity = '0';
        setTimeout(() => alertDiv.remove(), 500);
    }, 4500);
}
