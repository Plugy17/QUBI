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

// Новый фон (без планет)
const bg = new Image();
bg.src = 'assets/background1.jpg'; 

// --- 2. МАССИВ ПЛАНЕТ (ОБЪЕКТЫ) ---
// Теперь планеты не привязаны к картинке фона, мы рисуем их сами
const planets = [
    { 
        id: 'runner', 
        img: new Image(), 
        src: 'assets/earth.png', 
        x: 0.2, y: 0.45, 
        size: 110, 
        rotation: 0, 
        speed: 0.002 
    },
    { 
        id: 'planet', 
        img: new Image(), 
        src: 'assets/core.png',  
        x: 0.5, y: 0.55, 
        size: 160, 
        rotation: 0, 
        speed: 0.001 
    },
    { 
        id: 'shop',   
        img: new Image(), 
        src: 'assets/mars.png',  
        x: 0.8, y: 0.5, 
        size: 90,  
        rotation: 0, 
        speed: -0.0015 
    }
];

// Предзагрузка планет
planets.forEach(p => p.img.src = p.src);

// Данные игрока
const tgUser = tg.initDataUnsafe?.user || { id: "guest_user", first_name: "Pilot" };
const userRef = db.ref('users/' + tgUser.id);
let playerData = { quant: 0, qubi: 0, energy: 100, level: 1 };

// Параллакс
let mouseX = 0, mouseY = 0;
window.addEventListener('mousemove', (e) => {
    mouseX = (e.clientX / window.innerWidth - 0.5) * 15;
    mouseY = (e.clientY / window.innerHeight - 0.5) * 15;
});

// Звезды
let stars = [];
for(let i = 0; i < 100; i++) {
    stars.push({
        x: Math.random() * 100,
        y: Math.random() * 100,
        size: Math.random() * 2,
        blink: 0.02 + Math.random() * 0.03
    });
}

// --- 3. ЛОГИКА ---
function initGame() {
    document.getElementById('player-name').innerText = tgUser.first_name;
    userRef.on('value', (snapshot) => {
        if (snapshot.exists()) {
            playerData = snapshot.val();
            updateUI();
        } else {
            userRef.set(playerData);
        }
        hideLoading();
    });
}

function updateUI() {
    document.getElementById('quant-val').innerText = playerData.quant;
    document.getElementById('qubi-val').innerText = playerData.qubi;
    document.getElementById('energy-fill').style.width = playerData.energy + "%";
}

function hideLoading() {
    const loader = document.getElementById('loading-screen');
    if(loader) {
        loader.style.opacity = '0';
        setTimeout(() => loader.style.display = 'none', 500);
    }
}

// --- 4. ОТРИСОВКА ---
function draw() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    // 1. Фон (параллакс)
    ctx.drawImage(bg, -20 + mouseX, -20 + mouseY, canvas.width + 40, canvas.height + 40);

    // 2. Звезды
    ctx.fillStyle = "white";
    stars.forEach(s => {
        ctx.globalAlpha = 0.2 + Math.abs(Math.sin(Date.now() * s.blink));
        ctx.beginPath();
        ctx.arc((s.x/100) * canvas.width, (s.y/100) * canvas.height, s.size, 0, Math.PI*2);
        ctx.fill();
    });
    ctx.globalAlpha = 1.0;

    // 3. Планеты (Отрисовка отдельных PNG)
    planets.forEach(p => {
        const pX = p.x * canvas.width + (mouseX * 0.5); // Планеты двигаются чуть иначе для глубины
        const pY = p.y * canvas.height + (mouseY * 0.5);

        ctx.save();
        ctx.translate(pX, pY);
        
        // Вращение
        p.rotation += p.speed;
        ctx.rotate(p.rotation);

        // Сама планета
        if (p.img.complete) {
            ctx.drawImage(p.img, -p.size/2, -p.size/2, p.size, p.size);
        }
        ctx.restore();

        // Очень мягкая аура под планетой
        const glow = ctx.createRadialGradient(pX, pY, p.size/3, pX, pY, p.size/1.2);
        glow.addColorStop(0, 'rgba(255, 255, 255, 0)');
        glow.addColorStop(1, 'rgba(0, 229, 255, 0.05)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(pX, pY, p.size/1.2, 0, Math.PI*2);
        ctx.fill();
    });

    requestAnimationFrame(draw);
}

// --- 5. КЛИКИ ---
canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    planets.forEach(p => {
        const pX = p.x * canvas.width + (mouseX * 0.5);
        const pY = p.y * canvas.height + (mouseY * 0.5);
        const dist = Math.sqrt((x - pX)**2 + (y - pY)**2);

        // Если кликнули в радиус планеты
        if (dist < p.size / 2) {
            createClickRipple(x, y);
            handlePress(p.id);
        }
    });
});

function handlePress(id) {
    tg.HapticFeedback.impactOccurred('medium');
    
    // Эффект вспышки
    const flash = document.createElement('div');
    flash.className = 'screen-flash';
    document.body.appendChild(flash);
    setTimeout(() => flash.remove(), 100);

    if (id === 'runner') {
        console.log("Start Runner");
    } else if (id === 'planet') {
        tg.showPopup({ title: 'QUBI Core', message: `Level: ${playerData.level}`, buttons: [{type: 'ok'}] });
    } else if (id === 'shop') {
        tg.showAlert("Shop coming soon");
    }
}

function createClickRipple(x, y) {
    const ripple = document.createElement('div');
    ripple.className = 'ripple';
    ripple.style.left = `${x}px`; ripple.style.top = `${y}px`;
    document.body.appendChild(ripple);
    setTimeout(() => ripple.remove(), 600);
}

bg.onload = () => {
    initGame();
    draw();
};
