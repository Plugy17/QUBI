function openMoonMenu() {
    const modal = document.getElementById('moon-modal');
    if (modal) {
        modal.style.display = 'flex';
        updateMoonUI(); // Чтобы сразу видеть актуальный лимит
    }
}

function closeMoon() {
    const modal = document.getElementById('moon-modal');
    if (modal) modal.style.display = 'none';
}

// Функция самой переработки (логика)
function exchangeEnergy(type) {
    const today = new Date().toDateString();
    
    // Проверка смены дня (сброс лимитов)
    if (!playerData.lastExchangeDate || playerData.lastExchangeDate !== today) {
        playerData.lastExchangeDate = today;
        playerData.dailyExchangeQuant = 0;
        playerData.dailyExchangeQubi = 0;
    }

    let cost = 0;
    let reward = 10;
    let limitMax = 0;
    let currentProcessed = 0;

    // Настраиваем условия в зависимости от типа ресурса
    if (type === 'quant') {
        cost = 50;
        limitMax = 500;
        currentProcessed = playerData.dailyExchangeQuant || 0;
        
        if (playerData.quant < cost) {
            alert("Недостаточно QUANT!");
            return;
        }
    } else if (type === 'qubi') {
        cost = 5;
        limitMax = 50;
        currentProcessed = playerData.dailyExchangeQubi || 0;

        if (playerData.qubi < cost) {
            alert("Недостаточно QUBI!");
            return;
        }
    }

    // Общие проверки
    if (currentProcessed + cost > limitMax) {
        alert("Дневной лимит переработки исчерпан!");
        return;
    }
    if (playerData.energy >= 100) {
        alert("Энергия уже на максимуме!");
        return;
    }

    // Выполнение обмена
    if (type === 'quant') {
        playerData.quant -= cost;
        playerData.dailyExchangeQuant = currentProcessed + cost;
    } else {
        playerData.qubi -= cost;
        playerData.dailyExchangeQubi = currentProcessed + cost;
    }

    playerData.energy = Math.min(100, (playerData.energy || 0) + reward);

    // Сохранение в Firebase
    userRef.update({
        quant: playerData.quant,
        qubi: playerData.qubi,
        energy: playerData.energy,
        dailyExchangeQuant: playerData.dailyExchangeQuant,
        dailyExchangeQubi: playerData.dailyExchangeQubi,
        lastExchangeDate: playerData.lastExchangeDate
    }).then(() => {
        if (window.Telegram && Telegram.WebApp.HapticFeedback) {
            Telegram.WebApp.HapticFeedback.notificationOccurred('success');
        }
        
        // ВАЖНО: Обновляем интерфейс после обмена
        updateMoonUI(); 
        updateUI(); // Обновляем статы на главном экране (энергию)
    }).catch(err => {
        console.error("Ошибка обмена:", err);
    });
}

// Функция обновления текста в модалке (чтобы цифры менялись на глазах)
function updateMoonUI() {
    const today = new Date().toDateString();

    // 1. Проверяем/сбрасываем лимиты, если наступил новый день
    if (!playerData.lastExchangeDate || playerData.lastExchangeDate !== today) {
        playerData.lastExchangeDate = today;
        playerData.dailyExchangeQuant = 0;
        playerData.dailyExchangeQubi = 0;
    }

    // 2. Обновляем запасы игрока в нижней части окна
    const resQuantEl = document.getElementById('res-amount-quant');
    const resQubiEl = document.getElementById('res-amount-qubi');
    if (resQuantEl) resQuantEl.innerText = Math.floor(playerData.quant || 0) + " QNT";
    if (resQubiEl) resQubiEl.innerText = Math.floor(playerData.qubi || 0) + " QUB";

    // --- ЛИНИЯ QUANT (Лимит 500) ---
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
        // Красный цвет, если лимит исчерпан
        qFill.style.background = (qPercent >= 100) ? '#ff4444' : 'linear-gradient(90deg, #00e5ff, #007bff)';
    }

    // --- ЛИНИЯ QUBI (Лимит 50) ---
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
        // Красный цвет, если лимит исчерпан
        bFill.style.background = (bPercent >= 100) ? '#ff4444' : 'linear-gradient(90deg, #a855f7, #6b21a8)';
    }
}

function openLeaderboard() {
    const modal = document.getElementById('leaderboard-modal');
    const container = document.getElementById('leaderboard-container');
    
    if (modal) modal.style.display = 'flex';
    if (container) container.innerHTML = '<div style="text-align:center; padding:20px;">Загрузка...</div>';

    // Сначала принудительно обновляем твои данные в базе перед открытием топа
    syncWithLeaderboard();

    db.ref('leaderboard').orderByChild('qubi').limitToLast(100).once('value', (snap) => {
        if (container) {
            container.innerHTML = '';
            let players = [];
            
            // Собираем данные и добавляем ID игрока для точной проверки
            snap.forEach(child => {
                let data = child.val();
                data.uid = child.key; // Сохраняем ID из ключа Firebase
                players.push(data);
            });

            // Сортируем: самые богатые сверху
            players.reverse().forEach((p, i) => {
                const row = document.createElement('div');
                row.className = 'player-row';
                
                // СРАВНИВАЕМ ПО ID (это 100% точность), а не по имени
                const isMe = p.uid === String(tgUser.id) ? 'style="color: #00e5ff; font-weight: bold; background: rgba(0,229,255,0.1);"' : '';
                
                row.innerHTML = `
                    <span ${isMe}>${i + 1}. ${p.name || 'Unknown'}</span>
                    <span class="score" ${isMe}>${Math.floor(p.qubi || 0)} QUBI</span>
                `;
                container.appendChild(row);
            });
        }
    });
}

// Закрытие Лидерборда
function closeLeaderboard() {
    const modal = document.getElementById('leaderboard-modal');
    if (modal) modal.style.display = 'none';
}

function gameOver() {
    // 1. Сразу блокируем повторные вызовы
    if (!isRunnerActive) return; 
    isRunnerActive = false;
    runnerShip.hp = 0;

    // 2. Останавливаем спавн объектов
    if (this.spawnTimer) clearTimeout(this.spawnTimer);

    // 3. Обратная связь (вибрация)
    if (window.Telegram && Telegram.WebApp.HapticFeedback) {
        Telegram.WebApp.HapticFeedback.notificationOccurred('error');
    }

    // 4. Логируем для отладки
    console.log("Game Over triggered. Quants:", sessionQuants, "Qubi:", sessionQubi);

    // 5. Используем небольшую задержку (300мс), чтобы игрок увидел момент взрыва/удара
    setTimeout(() => {
        // Если у тебя нет готового HTML-окна, оставляем alert, 
        // но теперь он не будет мешать завершению логики
        alert(`ИГРА ОКОНЧЕНА!\n\nКорабль уничтожен.\n\nСобрано QUANT: ${sessionQuants}\nСобрано QUBI: ${sessionQubi}`);
        
        // Закрываем режим раннера
        closeRunnerWindow(); 
    }, 300);
}

// --- 8. СОБЫТИЯ УПРАВЛЕНИЯ ---
function isUiHit(target) { return target.closest('.exit-btn') || target.closest('.score-display'); }

function handleCanvasClick(e) {
    // 1. СТОП-КРАН: Если открыто хоть одно окно, игнорируем клик по канвасу
    if (isAnyModalOpen()) return;

    const rect = canvas.getBoundingClientRect();
    
    // 2. Корректное получение координат (защита от undefined при разных типах событий)
    let clientX, clientY;
    if (e.type.startsWith('touch')) {
        clientX = e.changedTouches[0].clientX;
        clientY = e.changedTouches[0].clientY;
    } else {
        clientX = e.clientX;
        clientY = e.clientY;
    }

    const clickX = clientX - rect.left;
    const clickY = clientY - rect.top;

    planets.forEach(p => {
        const dist = Math.hypot(clickX - p.x, clickY - p.y);
        
        if (dist < p.size * 1.5) { // Увеличил радиус клика для удобства
            if (window.Telegram && Telegram.WebApp.HapticFeedback) {
                Telegram.WebApp.HapticFeedback.impactOccurred('medium');
            }

            if (p.action) {
                p.action(); 
            } else if (p.id === 'leaderboard') {
                openLeaderboard();
            } else if (p.id === 'moon') {
                openMoonMenu();
            } else if (p.id === 'shop') {
                // ДОБАВЛЯЕМ ЭТУ СТРОЧКУ:
                openShop(); 
            } else if (p.id === 'station') {
                // ДОБАВЛЯЕМ ДЛЯ СТАНЦИИ:
                openStation();
            } else {
                activatePlanet(p.id);
            }
        }
    });
    
function isAnyModalOpen() {
    // Добавляем runner-window, так как во время игры клики по планетам тоже должны быть отключены
    const modals = ['moon-modal', 'leaderboard-modal', 'station-modal', 'shop-modal', 'runner-window'];
    
    return modals.some(id => {
        const el = document.getElementById(id);
        if (!el) return false;

        const style = window.getComputedStyle(el);
        return style.display !== 'none' && style.visibility !== 'hidden';
    });
}

canvas.addEventListener('click', (e) => {
    if (isAnyModalOpen()) return; // Если окно открыто, планеты не реагируют
    handleCanvasClick(e);
});

canvas.addEventListener('touchstart', (e) => {
    if (isAnyModalOpen()) return; // Блокируем тач, если открыто окно
    handleCanvasClick(e);
    if (e.cancelable) e.preventDefault();
}, { passive: false });

runnerWin.addEventListener('touchstart', (e) => {
    if (!isRunnerActive || isUiHit(e.target)) return;
    runnerShip.targetX = e.touches[0].clientX;
}, { passive: false });

runnerWin.addEventListener('touchmove', (e) => {
    if (!isRunnerActive || isUiHit(e.target)) return;
    runnerShip.targetX = e.touches[0].clientX;
    if (e.cancelable) e.preventDefault();
}, { passive: false });

if (document.getElementById('exit-runner')) {
    document.getElementById('exit-runner').onclick = closeRunnerWindow;
}

bg.onload = () => { initGame(); draw(); };
if (bg.complete) { initGame(); draw(); }

async function buyModule(moduleId) {
    // 1. Находим данные о модуле в нашем справочнике SHOP_MODULES
    const itemData = SHOP_MODULES.find(m => m.id === moduleId);
    
    if (!itemData) {
        console.error("Модуль не найден в базе магазина");
        return;
    }

    if (itemData.currency === 'TON') {
        try {
            // Вызываем оплату через кошелек
            const success = await payWithTON(itemData.price, itemData.id);
            
            if (success) {
                grantModule(itemData); // Выдаем предмет
                alert(`Успешно приобретено: ${itemData.name}!`);
            }
        } catch (e) {
            console.error("Ошибка TON транзакции:", e);
        }
        return; // Выходим, так как для TON не нужна проверка QUANT/QUBI
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

    // Создаем экземпляр модуля для инвентаря
    const newModule = {
        id: itemData.id + "_" + Date.now(), // Уникальный ID экземпляра
        shopId: itemData.id,               // Ссылка на тип в магазине
        name: itemData.name,
        type: itemData.type,
        power: itemData.power,
        rarity: itemData.rarity,
        img: itemData.img
    };

    playerData.inventory.push(newModule);

    userRef.update({
        quant: playerData.quant,
        qubi: playerData.qubi,
        inventory: playerData.inventory
    }).then(() => {
        if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
        updateUI();   // Обновить баланс на экране
        openShop();   // Перерисовать магазин (чтобы кнопка сменилась на "КУПЛЕНО")
        console.log(`Модуль ${itemData.name} добавлен в инвентарь`);
    });
}

function calculateCurrentStats() {
    // Базовые параметры игрока без модулей
    let stats = {
        hp: 100,
        maxEnergy: 100,
        regenBonusMs: 0, // Бонус к скорости (вычитается из интервала)
        barrier: 0,
        incomeQuant: 0,
        incomeQubi: 0
    };

    if (playerData.equipped && playerData.inventory) {
        playerData.equipped.forEach(modId => {
            const module = playerData.inventory.find(m => m.id === modId);
            if (module) {
                // 1. Обработка обычных модулей (где power — число)
                if (typeof module.power === 'number') {
                    if (module.type === 'hp') stats.hp += module.power;
                    if (module.type === 'energy_max') stats.maxEnergy += module.power;
                    if (module.type === 'energy_regen') stats.regenBonusMs += module.power;
                    if (module.type === 'barrier') stats.barrier += module.power;
                    if (module.type === 'income_quant') stats.incomeQuant += module.power;
                    if (module.type === 'income_qubi') stats.incomeQubi += module.power;
                } 
                // 2. Обработка гибридных модулей (где power — объект {hp, en, reg})
                else if (typeof module.power === 'object') {
                    if (module.power.hp) stats.hp += module.power.hp;
                    if (module.power.en) stats.maxEnergy += module.power.en;
                    if (module.power.reg) stats.regenBonusMs += module.power.reg;
                }
            }
        });
    }
    return stats;
}

function openStation() {
    document.getElementById('station-modal').style.display = 'flex';

    const current = calculateCurrentStats();

    document.getElementById('stat-hp').innerText = current.hp;
    document.getElementById('stat-barrier').innerText = current.barrier;
    document.getElementById('stat-energy').innerText = Math.floor(playerData.energy || 0) + '%';
    document.getElementById('stat-income-quant').innerText = current.incomeQuant;
    document.getElementById('stat-income-qubi').innerText = current.incomeQubi;

    const activeContainer = document.getElementById('active-slots-container');
    if (activeContainer) {
        activeContainer.innerHTML = '';
        for (let i = 0; i < 5; i++) {
            const slot = document.createElement('div');
            const equippedId = playerData.equipped ? playerData.equipped[i] : null;
            
            if (equippedId) {
                const mod = playerData.inventory.find(m => m.id === equippedId);
                slot.className = 'slot-mini filled';
                slot.innerHTML = `<img src="assets/modules/${mod.type}.png" style="width:100%">`;
            } else {
                slot.className = 'slot-mini empty';
            }
            activeContainer.appendChild(slot);
        }
    }

    const scrollList = document.getElementById('inventory-scroll-list');
    scrollList.innerHTML = '';

    if (playerData.inventory && playerData.inventory.length > 0) {
        playerData.inventory.forEach(item => {
            const isEquipped = playerData.equipped?.includes(item.id);
            const card = document.createElement('div');
            card.className = `module-card ${isEquipped ? 'equipped' : ''}`;
            
            card.innerHTML = `
                <img src="assets/modules/${item.type}.png" style="width:35px">
                <span>${item.name}</span>
                <small style="color: #00e5ff">+${item.power}</small>
            `;
            
            card.onclick = () => toggleModule(item.id);
            scrollList.appendChild(card);
        });
    } else {
        scrollList.innerHTML = '<div class="no-modules">Купите модули в магазине</div>';
    }
}

function toggleModule(modId) {
    if (!playerData.equipped) playerData.equipped = [];
    
    const index = playerData.equipped.indexOf(modId);
    if (index > -1) {
        // Снимаем модуль
        playerData.equipped.splice(index, 1);
        if (tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
    } else {
        // Ставим модуль (проверка на лимит 5)
        if (playerData.equipped.length < 5) {
            playerData.equipped.push(modId);
            if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
        } else {
            // Можно вывести сообщение, что слоты заняты
            if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('error');
            return; 
        }
    }

    userRef.update({ equipped: playerData.equipped }).then(() => {
        openStation(); 
    });
}

function closeStation() {
    // 1. Скрываем окно
    const modal = document.getElementById('station-modal');
    if (modal) modal.style.display = 'none';

    // 2. Сохраняем экипировку в Firebase
    if (playerData.equipped) {
        userRef.update({ 
            equipped: playerData.equipped 
        }).then(() => {
            console.log("Конфигурация модулей сохранена");
        }).catch((err) => {
            console.error("Ошибка сохранения ангара:", err);
        });
    }

    if (typeof updateUI === "function") {
        updateUI();
    }
}
