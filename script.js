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

let players = {}; // Локальная копия всех игроков из БД
let gameState = {}; // Состояние игры из БД

let timerInterval = null;
let animationFrameId = null;

// Виртуальные координаты шарика
let ballX = 200, ballY = 200, ballVx = 0, ballVy = 0;

// DOM Элементы
let bettingTimerDisplay, totalBankDisplay, wheelInner, gameAreaWrapper, ball, playerNameInput, betAmountInput, placeBetButton, betList, gameMessage;

// ======= Вспомогательные функции =======
function getRandomColor() {
    const hue = Math.floor(Math.random() * 360);
    return `hsl(${hue}, 70%, 60%)`;
}

// Проверка: является ли текущий игрок Хостом комнаты (самым старым по ID)
function isHost() {
    const ids = Object.keys(players).sort();
    return ids[0] === myPlayerId;
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

    // Слушатели событий интерфейса
    if (placeBetButton) placeBetButton.addEventListener('click', placeBet);
    if (betAmountInput) betAmountInput.addEventListener('keypress', e => { if (e.key === 'Enter') placeBet(); });

    // СВЯЗЬ С БАЗОЙ ДАННЫХ В РЕАЛЬНОМ ВРЕМЕНИ
    
    // 1. Слушаем изменения игроков
    db.ref('players').on('value', (snapshot) => {
        players = snapshot.val() || {};
        renderBets();
        renderWheelSections();
        checkHostTimerLogic();
    });

    // 2. Слушаем состояние игры
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

    // Записываем / обновляем ставку игрока в БД
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

    // Блокировка инпутов
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

        // Логика таймера
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
        // Запуск локального рендеринга шарика по общему углу
        if (!animationFrameId) {
            startLocalRound(gameState.launchAngle);
        }
    } 
    else if (status === 'finished') {
        stopLocalTimer();
        if (bettingTimerDisplay) bettingTimerDisplay.style.display = 'none';
        
        // Показываем победителя
        if (gameMessage) {
            gameMessage.style.display = 'block';
            gameMessage.style.color = 'black';
            gameMessage.style.backgroundColor = gameState.winnerColor || '#61dafb';
            gameMessage.textContent = `Победил: ${gameState.winnerName} 🎉 (+${gameState.winnerPrize} ₽)`;
        }
    }
}

// ======= Таймер (клиентский) =======
function startLocalTimer(timerEnd) {
    stopLocalTimer();
    timerInterval = setInterval(() => {
        const timeLeft = Math.max(0, Math.ceil((timerEnd - Date.now()) / 1000));
        if (bettingTimerDisplay) bettingTimerDisplay.textContent = timeLeft + 'с';

        if (timeLeft <= 0) {
            stopLocalTimer();
            // Если мы хост — переводим игру в статус RUNNING
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

// ======= Логика Хоста (управляет базой) =======
function checkHostTimerLogic() {
    if (!isHost()) return;

    const activePlayers = Object.values(players).filter(p =>
p.totalBet > 0);
    const status = gameState.status || 'betting';

    // Запускаем таймер, если игроков >= 2 и он еще не запущен
    if (status === 'betting' && activePlayers.length >= 2 && (!gameState.timerEnd || gameState.timerEnd === 0)) {
        db.ref('gameState').update({
            timerEnd: Date.now() + (BETTING_TIME * 1000)
        });
    }

    // Сбрасываем таймер, если активных игроков стало меньше 2
    if (status === 'betting' && activePlayers.length < 2 && (gameState.timerEnd && gameState.timerEnd > 0)) {
        db.ref('gameState').update({
            timerEnd: 0
        });
    }
}

function triggerRoundStart() {
    // Генерируем угол старта
    const launchAngle = Math.random() * Math.PI * 2;
    db.ref('gameState').set({
        status: 'running',
        launchAngle: launchAngle,
        timerEnd: 0
    });
}

// ======= Синхронная визуализация раунда =======
function startLocalRound(launchAngle) {
    if (ball) {
        ball.style.display = 'block';
    }

    // Сбрасываем виртуальную физику
    ballX = VIRTUAL_WIDTH / 2;
    ballY = VIRTUAL_HEIGHT / 2;
    ballVx = Math.cos(launchAngle) * BALL_MAX_SPEED;
    ballVy = Math.sin(launchAngle) * BALL_MAX_SPEED;

    // Запускаем анимацию
    animationFrameId = requestAnimationFrame(animateLocalBall);
}

function animateLocalBall() {
    // Шаг физики в виртуальных координатах
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

    // РЕНДЕРИНГ: переводим виртуальные координаты в реальные пиксели экрана
    if (ball && gameAreaWrapper) {
        const actualW = gameAreaWrapper.offsetWidth;
        const actualH = gameAreaWrapper.offsetHeight;
        
        const scaleX = actualW / VIRTUAL_WIDTH;
        const scaleY = actualH / VIRTUAL_HEIGHT;

        // Позиция на реальном экране
        const screenX = ballX * scaleX;
        const screenY = ballY * scaleY;
        const screenRadius = (actualW / VIRTUAL_WIDTH) * VIRTUAL_RADIUS;

        ball.style.left = `${screenX - screenRadius}px`;
        ball.style.top = `${screenY - screenRadius}px`;
    }

    // Если шарик еще движется
    if (Math.abs(ballVx) > 0.1 || Math.abs(ballVy) > 0.1) {
        animationFrameId = requestAnimationFrame(animateLocalBall);
    } else {
        // Остановка шарика
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
        // Рендерим виртуальные сектора для расчета
        activePlayers.sort((a, b) => a.name.localeCompare(b.name));
        const totalB = calculateTotalBank();
        let currentAngle = 0;

        for (const p of activePlayers) {
            const size = (p.totalBet / totalB) * 360;
            const startAngle = currentAngle;
            const endAngle = currentAngle + size;
            currentAngle += size;

            if (startAngle <= endAngle) {
                if (finalAngle >= startAngle && finalAngle < endAngle) {
                    winner = p;
                    br


eak;
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

    // Публикуем победу в БД
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

    // Через 6 секунд Хост перезапускает игру на фазу ставок и перевыбирает цвета игроков
    setTimeout(() => {
        if (isHost()) {
            resetRoomForNextRound();
        }
    }, 6000);
}

function resetRoomForNextRound() {
    // Пересобираем игроков: обнуляем ставки и рандомим цвета
    const updatedPlayers = {};
    for (const id in players) {
        updatedPlayers[id] = {
            name: players[id].name,
            color: getRandomColor(), // Новый цвет на раунд!
            totalBet: 0
        };
    }

    db.ref('players').set(updatedPlayers);
    db.ref('gameState').set({
        status: 'betting',
        timerEnd: 0
    });
}

// ======= Функции Отрисовки UI =======
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

    // Если нет ставок — включаем шахматное поле (класс empty-field)
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

    // Порядок секторов
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