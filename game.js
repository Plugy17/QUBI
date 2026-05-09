// --- 1. ИНИЦИАЛИЗАЦИЯ ---
const firebaseConfig = {
    apiKey: "AIzaSyABKHaAdlSFq1KzURXmCF5Q-9xMUgE4Ot0",
    authDomain: "berry-game-4fa9b.firebaseapp.com",
    databaseURL: "https://berry-game-4fa9b-default-rtdb.firebaseio.com",
    projectId: "berry-game-4fa9b",
    storageBucket: "berry-game-4fa9b.firebasestorage.app",
    messagingSenderId: "736707445306",
    appId: "1:736707445306:web:87a61ea4b725bd3071eb03"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();
const tg = window.Telegram.WebApp;

tg.expand();
tg.ready();

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const bg = new Image();
bg.src = 'assets/background1.jpg';

// Данные из ТГ
const tgUser = tg.initDataUnsafe?.user || { id: "guest_user", first_name: "Pilot" };
const userRef = db.ref('users/' + tgUser.id);

let playerData = {
    quant: 0,
    qubi: 0,
    energy: 100,
    level: 1
};

let stars = [];
// Создаем 80 мерцающих звезд
for(let i = 0; i < 80; i++) {
    stars.push({
        x: Math.random() * 100, // в процентах
        y: Math.random() * 100,
        size: Math.random() * 2,
        opacity: Math.random(),
        speed: 0.01 + Math.random() * 0.03
    });
}

// --- 2. АВТОРИЗАЦИЯ И ЗАГРУЗКА ---
function initGame() {
    document.getElementById('player-name').innerText = tgUser.first_name;

    // Получаем данные один раз при старте
    userRef.once('value').then((snapshot) => {
        if (snapshot.exists()) {
            playerData = snapshot.val();
        } else {
            // Регистрация нового пилота
            userRef.set(playerData);
        }
        
        updateUI();
        hideLoading();
    }).catch(e => console.error("Firebase Error:", e));

    // Слушаем изменения в реальном времени (например, если начислили бонус из админки)
    userRef.on('value', (snapshot) => {
        if (snapshot.exists()) {
            playerData = snapshot.val();
            updateUI();
        }
    });
}

function updateUI() {
    document.getElementById('quant-val').innerText = playerData.quant;
    document.getElementById('qubi-val').innerText = playerData.qubi;
    document.getElementById('energy-fill').style.width = playerData.energy + "%";
}

function hideLoading() {
    const loader = document.getElementById('loading-screen');
    loader.style.opacity = '0';
    setTimeout(() => loader.style.display = 'none', 500);
}

// --- 3. ГРАФИКА И КЛИКИ ---
function draw() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    // 1. Рисуем фон с легким масштабированием, чтобы он "дышал"
    const scale = 1.05 + Math.sin(Date.now() * 0.0005) * 0.02;
    const w = canvas.width * scale;
    const h = canvas.height * scale;
    const x = (canvas.width - w) / 2;
    const y = (canvas.height - h) / 2;

    ctx.drawImage(bg, x, y, w, h);

    // 2. Рисуем "живые" звезды поверх
    ctx.fillStyle = "white";
    stars.forEach(s => {
        s.opacity += s.speed;
        if(s.opacity > 1 || s.opacity < 0) s.speed *= -1; // Мерцание
        
        ctx.globalAlpha = Math.abs(s.opacity);
        ctx.beginPath();
        ctx.arc((s.x / 100) * canvas.width, (s.y / 100) * canvas.height, s.size, 0, Math.PI*2);
        ctx.fill();
    });
    ctx.globalAlpha = 1.0;

    // 3. Рисуем пульсацию вокруг активных планет
    zones.forEach(z => {
        const pulse = Math.sin(Date.now() * 0.003) * 10;
        const grad = ctx.createRadialGradient(
            z.x * canvas.width, z.y * canvas.height, z.r - 10,
            z.x * canvas.width, z.y * canvas.height, z.r + pulse
        );
        grad.addColorStop(0, 'rgba(0, 229, 255, 0)');
        grad.addColorStop(1, 'rgba(0, 229, 255, 0.2)');
        
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(z.x * canvas.width, z.y * canvas.height, z.r + pulse, 0, Math.PI*2);
        ctx.fill();
    });

    requestAnimationFrame(draw);
}

function handlePress(id) {
    // Разная вибрация для разных планет
    if (id === 'runner') tg.HapticFeedback.notificationOccurred('success');
    else if (id === 'planet') tg.HapticFeedback.impactOccurred('heavy');
    else tg.HapticFeedback.impactOccurred('medium');

    // Эффект вспышки на экране
    const flash = document.createElement('div');
    flash.style.position = 'fixed';
    flash.style.top = '0';
    flash.style.left = '0';
    flash.style.width = '100%';
    flash.style.height = '100%';
    flash.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
    flash.style.pointerEvents = 'none';
    flash.style.zIndex = '100';
    document.body.appendChild(flash);
    
    setTimeout(() => flash.remove(), 100);

    // Логика по планетам
    switch(id) {
        case 'runner':
            console.log("Режим полета");
            // Здесь можно запустить анимацию "влета" в планету
            break;
        case 'planet':
            tg.showPopup({
                title: 'Ваша Планета',
                message: `Уровень: ${playerData.level}\nРесурсов: ${playerData.quant}`,
                buttons: [{type: 'ok'}]
            });
            break;
        case 'shop':
            tg.showAlert("Магазин QUANT: Скоро открытие!");
            break;
    }
}

bg.onload = () => {
    initGame();
    draw();
};
