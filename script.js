// ======= НАСТРОЙКИ FIREBASE =======
// !!! Вставь сюда СВОИ данные из консоли Firebase !!!
const firebaseConfig = {
  apiKey: "AIzaSyDaqDEFnRgoOoQRpoQoZ5_OZq4FywdbByM",
  authDomain: "checkers-roulette.firebaseapp.com",
  databaseURL: "https://checkers-roulette-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "checkers-roulette",
  storageBucket: "checkers-roulette.firebasestorage.app",
  messagingSenderId: "856460439104",
  appId: "1:856460439104:web:0e386cc2afca3b655af9a5"
};

// Инициализируем Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// ======= Игровые Константы =======
const BETTING_TIME = 15;         // Время ставок (сек)
const BALL_MAX_SPEED = 150;       // Виртуальная скорость
const BALL_DECELERATION = 0.985; // Коэффициент замедления

// Виртуальные размеры поля для 100% одинаковой физики на телефонах и ПК
const VIRTUAL_WIDTH = 400;
const VIRTUAL_HEIGHT = 400;
const VIRTUAL_RADIUS = 12; // половина диаметра шарика (24px)

// ======= Глобальные переменные состояния =======
let myPlayerId = localStorage.getItem('roulette_player_id');
if (!myPlayerId) {
    myPlayerId = `player_${Math.random().toString(36).slice(2, 11)}`;
    localStorage.setItem('roulette_player_id', myPlayerId);
}

let players = {};         // Локальная копия игроков из БД
let gameState = {};       // Состояние игры из БД
let onlinePlayers = [];   // Список ID игроков, которые сейчас ОНЛАЙН

let timerInterval = null;
let animationFrameId = null;
let serverOffset = 0;     // Разница во времени между клиентом и сервером Google

// Виртуальные координаты шарика
let ballX = 200, ballY = 200, ballVx = 0, ballVy = 0;

// DOM Элементы
let bettingTimerDisplay, totalBankDisplay, wheelInner, gameAreaWrapper, ball, playerNameInput, betAmountInput, placeBetButton, betList, gameMessage;

// ======= Вспомогательные функции =======
function getRandomColor() {
    const hue = Math.floor(Math.random() * 360);
    return `hsl(${hue}, 70%, 60%)`;
}

// Получение точного серверного времени (убирает рассинхронизацию часов на девайсах)
function getServerTime() {
    return Date.now() + serverOffset;
}

// Проверка: является ли текущий игрок Хостом среди тех, кто сейчас РЕАЛЬНО в сети
function isHost() {
    if (onlinePlayers.length === 0) return false;
    return onlinePlayers[0] === myPlayerId;
}

// ======= Инициализация при загрузке страницы =======
document.addEventListener('DOMContentLoaded', () => {
    bettingTimerDisplay = document.getElementById('bettingTimer');
    totalBankDisplay = document.getElementById('totalBank');
    wheelInner = document.getElementById('wheelInner');
    gameAreaWrapper = document.getElementById('gameAreaWrapper');
    ball = document.getElementById('ball');
    playerNameInput = document.getElementById('playerNameInput');
    betAmountInput = document.getElementById('betAmountInput');
    placeBetButton = document.getElementById('placeBetButton');
    betList = document.getElementById('betList');
    gameMessage = document.getElementById('gameMessage');

    // Предзаполнение сохраненного имени
    const savedName = localStorage.getItem('roulette_player_name');
    if (savedName && playerNameInput) {
        playerNameInput.value = savedName;
    }

    if (placeBetButton) placeBetButton.addEventListener('click', placeBet);
    if (betAmountInput) betAmountInput.addEventListener('keypress', e => { if (e.key === 'Enter') placeBet(); });

    // 1. Получаем разницу во времени с сервером Firebase
    db.ref('.info/serverTimeOffset').on('value', (snap) => {
        serverOffset = snap.val() || 0;
    });

    // 2. Система мониторинга присутствия (Online/Offline)
    db.ref('.info/connected').on('value', (snap) => {
        if (snap.val() === true) {
            // Записываем себя в онлайн
            const presenceRef = db.ref(`presence/${myPlayerId}`);
            presenceRef.set(true);
            // Если закроем вкладку — Firebase автоматически удалит нас из сети
            presenceRef.onDisconnect().remove();
        }
    });



//3. Отслеживаем список тех, кто сейчас онлайн
    db.ref('presence').on('value', (snap) => {
        onlinePlayers = Object.keys(snap.val() || {}).sort();
        console.log("Игроки в сети:", onlinePlayers, "Я хост?", isHost());
        checkHostTimerLogic();
    });

    // 4. Слушаем изменения игроков (ставок)
    db.ref('players').on('value', (snapshot) => {
        players = snapshot.val() || {};
        renderBets();
        renderWheelSections();
        checkHostTimerLogic();
    });

    // 5. Слушаем состояние игры
    db.ref('gameState').on('value', (snapshot) => {
        gameState = snapshot.val() || { status: 'betting' };
        syncGameWithDatabase();
    });
});

// ======= Логика ставок =======
function placeBet() {
    const status = gameState.status || 'betting';
    if (status !== 'betting') {
        alert('Ставки закрыты!');
        return;
    }

    const name = playerNameInput ? playerNameInput.value.trim() : '';
    const amount = betAmountInput ? parseInt(betAmountInput.value) : NaN;

    if (!name) {
        alert('Введите имя!');
        return;
    }
    if (isNaN(amount) || amount <= 0) {
        alert('Введите корректную сумму!');
        return;
    }

    localStorage.setItem('roulette_player_name', name);

    const currentBet = (players[myPlayerId] ? players[myPlayerId].totalBet : 0) || 0;
    const playerColor = (players[myPlayerId] && players[myPlayerId].color) ? players[myPlayerId].color : getRandomColor();

    db.ref(`players/${myPlayerId}`).set({
        name: name,
        color: playerColor,
        totalBet: currentBet + amount
    });

    if (betAmountInput) betAmountInput.value = '';
}

// ======= Синхронизация интерфейса с Firebase =======
function syncGameWithDatabase() {
    const status = gameState.status || 'betting';
    const totalBank = calculateTotalBank();

    if (placeBetButton) placeBetButton.disabled = (status !== 'betting');
    if (betAmountInput) betAmountInput.disabled = (status !== 'betting');
    if (playerNameInput) playerNameInput.disabled = (status !== 'betting');
    if (totalBankDisplay) totalBankDisplay.textContent = totalBank;

    if (status === 'betting') {
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
        }
        if (ball) ball.style.display = 'none';

        if (gameState.timerEnd && gameState.timerEnd > 0) {
            if (bettingTimerDisplay) bettingTimerDisplay.style.display = 'block';
            if (gameMessage) {
                gameMessage.textContent = 'Ставки приняты! Время пошло';
                gameMessage.style.color = '#61dafb';
                gameMessage.style.backgroundColor = 'transparent';
            }
            startLocalTimer(gameState.timerEnd);
        } else {
            if (bettingTimerDisplay) bettingTimerDisplay.style.display = 'none';
            if (gameMessage) {
                gameMessage.textContent = 'Ждем ставки...';
                gameMessage.style.color = 'white';
                gameMessage.style.backgroundColor = 'transparent';
            }
            stopLocalTimer();
        }
    } 
    else if (status === 'running') {
        stopLocalTimer();
        if (bettingTimerDisplay) bettingTimerDisplay.style.display = 'none';
        if (gameMessage) {
            gameMessage.textContent = 'Шарик запущен!';
            gameMessage.style.color = '#61dafb';
            gameMessage.style.backgroundColor = 'transparent';
        }
        if (!animationFrameId) {
            startLocalRound(gameState.launchAngle);
        }
    } 
    else if (status === 'finished') {
        stopLocalTimer();
        if (bettingTimerDisplay) bettingTimerDisplay.style.display = 'none';
        
        if (gameMessage) {
            gameMessage.style.display = 'block';
            gameMessage.style.color = 'black';
            gameMessage.style.backgroundColor = gameState.winnerColor || '#61dafb';
            gameMessage.textContent = `Победил: $


{gameState.winnerName} 🎉 (+${gameState.winnerPrize} ₽)`;
        }
    }
}

// ======= Синхронный таймер =======
function startLocalTimer(timerEnd) {
    stopLocalTimer();
    timerInterval = setInterval(() => {
        const timeLeft = Math.max(0, Math.ceil((timerEnd - getServerTime()) / 1000));
        if (bettingTimerDisplay) bettingTimerDisplay.textContent = timeLeft + 'с';

        if (timeLeft <= 0) {
            stopLocalTimer();
            if (isHost() && gameState.status === 'betting') {
                triggerRoundStart();
            }
        }
    }, 200);
}

function stopLocalTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
}

// ======= Управление таймером со стороны Хоста =======
function checkHostTimerLogic() {
    if (!isHost()) return;

    const activePlayers = Object.values(players).filter(p => p.totalBet > 0);
    const status = gameState.status || 'betting';

    // Запуск таймера при наличии 2 и более игроков
    if (status === 'betting' && activePlayers.length >= 2 && (!gameState.timerEnd || gameState.timerEnd === 0)) {
        db.ref('gameState').update({
            timerEnd: getServerTime() + (BETTING_TIME * 1000)
        });
    }

    // Сброс таймера, если кто-то убрал ставки и игроков < 2
    if (status === 'betting' && activePlayers.length < 2 && (gameState.timerEnd && gameState.timerEnd > 0)) {
        db.ref('gameState').update({
            timerEnd: 0
        });
    }
}

function triggerRoundStart() {
    const launchAngle = Math.random() * Math.PI * 2;
    db.ref('gameState').set({
        status: 'running',
        launchAngle: launchAngle,
        timerEnd: 0
    });
}

// ======= Физика шарика =======
function startLocalRound(launchAngle) {
    if (ball) {
        ball.style.display = 'block';
    }

    ballX = VIRTUAL_WIDTH / 2;
    ballY = VIRTUAL_HEIGHT / 2;
    ballVx = Math.cos(launchAngle) * BALL_MAX_SPEED;
    ballVy = Math.sin(launchAngle) * BALL_MAX_SPEED;

    animationFrameId = requestAnimationFrame(animateLocalBall);
}

function animateLocalBall() {
    ballX += ballVx;
    ballY += ballVy;

    if (ballX - VIRTUAL_RADIUS < 0) {
        ballVx = Math.abs(ballVx);
        ballX = VIRTUAL_RADIUS;
    } else if (ballX + VIRTUAL_RADIUS > VIRTUAL_WIDTH) {
        ballVx = -Math.abs(ballVx);
        ballX = VIRTUAL_WIDTH - VIRTUAL_RADIUS;
    }

    if (ballY - VIRTUAL_RADIUS < 0) {
        ballVy = Math.abs(ballVy);
        ballY = VIRTUAL_RADIUS;
    } else if (ballY + VIRTUAL_RADIUS > VIRTUAL_HEIGHT) {
        ballVy = -Math.abs(ballVy);
        ballY = VIRTUAL_HEIGHT - VIRTUAL_RADIUS;
    }

    ballVx *= BALL_DECELERATION;
    ballVy *= BALL_DECELERATION;

    if (ball && gameAreaWrapper) {
        const actualW = gameAreaWrapper.offsetWidth;
        const scaleX = actualW / VIRTUAL_WIDTH;

        const screenX = ballX * scaleX;
        const screenY = ballY * scaleX;
        const screenRadius = scaleX * VIRTUAL_RADIUS;

        ball.style.left = `${screenX - screenRadius}px`;
        ball.style.top = `${screenY - screenRadius}px`;
    }

    if (Math.abs(ballVx) > 0.1 || Math.abs(ballVy) > 0.1) {
        animationFrameId = requestAnimationFrame(animateLocalBall);
    } else {
        animationFrameId = null;
        if (isHost()) {
            determineAndPublishWinner();
        }
    }
}

// ======= Определение победителя =======
function determineAndPublishWinner() {
    const dx = ballX - (VIRTUAL_WIDTH / 2);
    const dy = ballY - (VIRTUAL_HEIGHT / 2);

    let finalAngle = (Math.atan2(dy, dx) * 180 / Math.PI) + 90;
    if (finalAngle < 0) finalAngle += 360;
    if (finalAngle >= 360) finalAngle -= 360;

    const activePlayers = Object.values(players).filter(p => p.totalBet > 0);
    let winner = null;

    if (activePlayers.length > 0) {
        activePlayers.sort((a, b) => a.name.localeCompare(b.name));
        const totalB = calculateTotalBank();
        let currentAngle = 0;

        for (const p of


activePlayers) {
            const size = (p.totalBet / totalB) * 360;
            const startAngle = currentAngle;
            const endAngle = currentAngle + size;
            currentAngle += size;

            if (startAngle <= endAngle) {
                if (finalAngle >= startAngle && finalAngle < endAngle) {
                    winner = p;
                    break;
                }
            } else {
                if (finalAngle >= startAngle || finalAngle < endAngle) {
                    winner = p;
                    break;
                }
            }
        }
        if (!winner) winner = activePlayers[0];
    }

    if (winner) {
        db.ref('gameState').set({
            status: 'finished',
            winnerName: winner.name,
            winnerColor: winner.color,
            winnerPrize: calculateTotalBank()
        });
    } else {
        db.ref('gameState').set({
            status: 'finished',
            winnerName: 'Никто',
            winnerColor: '#e57373',
            winnerPrize: 0
        });
    }

    setTimeout(() => {
        if (isHost()) {
            resetRoomForNextRound();
        }
    }, 6000);
}

function resetRoomForNextRound() {
    const updatedPlayers = {};
    // Сохраняем и сбрасываем ставки только тех игроков, кто реально находится на сайте (онлайн)
    for (const id in players) {
        if (onlinePlayers.includes(id)) {
            updatedPlayers[id] = {
                name: players[id].name,
                color: getRandomColor(), // Рандомный цвет на новый раунд!
                totalBet: 0
            };
        }
    }

    db.ref('players').set(updatedPlayers);
    db.ref('gameState').set({
        status: 'betting',
        timerEnd: 0
    });
}

// ======= Вспомогательные отрисовки UI =======
function calculateTotalBank() {
    return Object.values(players).reduce((acc, p) => acc + (p.totalBet || 0), 0);
}

function renderBets() {
    if (!betList) return;
    const active = Object.values(players).filter(p => p.totalBet > 0).sort((a, b) => b.totalBet - a.totalBet);

    betList.innerHTML = '';
    if (active.length === 0) {
        betList.innerHTML = '<div class="bet-placeholder">Пока нет ставок...</div>';
        return;
    }

    active.forEach(p => {
        const item = document.createElement('div');
        item.className = 'bet-item';
        item.style.borderLeft = `4px solid ${p.color}`;
        item.innerHTML = `<div class="avatar" style="background:${p.color}">${p.name[0].toUpperCase()}</div>
                          <div class="bet-info"><strong>${p.name}</strong> Ставка: ${p.totalBet} ₽</div>`;
        betList.appendChild(item);
    });
}

function renderWheelSections() {
    if (!wheelInner) return;
    const active = Object.values(players).filter(p => p.totalBet > 0);
    const totalB = calculateTotalBank();

    if (active.length === 0 || totalB === 0) {
        wheelInner.style.background = '#333';
        if (gameAreaWrapper) {
            gameAreaWrapper.classList.add('empty-field');
        }
        return;
    } else {
        if (gameAreaWrapper) {
            gameAreaWrapper.classList.remove('empty-field');
        }
    }

    active.sort((a, b) => a.name.localeCompare(b.name));

    let currentAngle = 0;
    const segments = active.map(p => {
        const size = (p.totalBet / totalB) * 360;
        const start = currentAngle;
        const end = currentAngle + size;
        const seg = `${p.color} ${start}deg ${end}deg`;
        currentAngle += size;
        return seg;
    });

    wheelInner.style.background = `conic-gradient(${segments.join(', ')})`;
}