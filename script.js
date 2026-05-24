// ======= Настройки =======
const BETTING_TIME = 15;         // время на ставки (сек)
const BALL_MAX_SPEED = 150;       // начальная скорость шарика
const BALL_DECELERATION = 0.985; // коэффициент замедления

// ======= Глобальные переменные состояния =======
let bettingTimeLeft = BETTING_TIME;
let bettingTimerInterval = null;

let isBettingOpen = true;
let gameIsRunning = false;
let roundStarting = false; // блокировка повторного запуска

let players = {};   // { id: { name, color, totalBet, startAngle, endAngle } }
let totalBank = 0;

// Шарик
let ballX = 0, ballY = 0, ballVx = 0, ballVy = 0;
let ballAnimationFrameId = null;

// DOM элементы (будут инициализированы в DOMContentLoaded)
let bettingTimerDisplay = null;
let totalBankDisplay = null;
let wheelInner = null;
let gameAreaWrapper = null;
let ball = null;
let playerNameInput = null;
let betAmountInput = null;
let placeBetButton = null;
let betList = null;
let gameMessage = null;
let startRoundButton = null;

// ======= Вспомогательные функции =======
function getRandomColor() {
    const hue = Math.floor(Math.random() * 360);
    return `hsl(${hue}, 70%, 60%)`;
}

function safeText(el, text) {
    if (el) el.textContent = text;
}

function updateUIState() {
    if (placeBetButton) placeBetButton.disabled = !isBettingOpen || gameIsRunning;
    if (betAmountInput) betAmountInput.disabled = !isBettingOpen || gameIsRunning;
    if (playerNameInput) playerNameInput.disabled = gameIsRunning;
    if (startRoundButton) startRoundButton.disabled = isBettingOpen || totalBank === 0;
    if (totalBankDisplay) totalBankDisplay.textContent = totalBank;
}

// ======= Инициализация =======
function initGame() {
    console.log('initGame: инициализация игры');
    startBettingPhase();
    updateUIState();
    renderBets();
    renderWheelSections();
}

// ======= Фаза ставок =======
function startBettingPhase() {
    console.log('startBettingPhase: начало фазы ставок');
    isBettingOpen = true;
    gameIsRunning = false;
    bettingTimeLeft = BETTING_TIME;
    totalBank = 0;

    // Сбрасываем ставки и ГЕНЕРИРУЕМ НОВЫЙ РАНДОМНЫЙ ЦВЕТ каждому игроку на новый раунд
    for (const id in players) {
        players[id].totalBet = 0;
        players[id].startAngle = 0;
        players[id].endAngle = 0;
        players[id].color = getRandomColor(); // Перевыбор цвета для нового раунда
    }

    // UI
    if (bettingTimerDisplay) {
        bettingTimerDisplay.style.display = 'none';
        bettingTimerDisplay.textContent = BETTING_TIME + 'с';
    }
    safeText(totalBankDisplay, totalBank);
    if (betList) betList.innerHTML = '<div class="bet-placeholder">Пока нет ставок...</div>';
    if (gameMessage) {
        gameMessage.style.display = 'block';
        gameMessage.style.backgroundColor = 'transparent';
        gameMessage.style.color = 'white';
        gameMessage.textContent = 'Ждем ставки...';
    }
    if (ball) {
        ball.style.display = 'none';
        ball.style.visibility = 'hidden';
    }

    // Очистка таймера
    if (bettingTimerInterval) {
        clearInterval(bettingTimerInterval);
        bettingTimerInterval = null;
    }

    updateUIState();
    renderWheelSections();
}

// ======= Добавление ставки =======
function placeBet() {
    if (!isBettingOpen) {
        alert('Время ставок закончено!');
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

    // Ищем игрока по имени
    let id = Object.keys(players).find(k => players[k].name === name);
    if (!id) {
        id = `player_${Math.random().toString(36).slice(2, 11)}`;
        players[id] = {
            name,
            color: getRandomColor(),
            totalBet: 0,
            startAngle: 0,
            endAngle: 0
            };
    }
    players[id].totalBet += amount;
    totalBank += amount;

    if (betAmountInput) betAmountInput.value = '';

    renderBets();
    renderWheelSections();
    updateUIState();

    checkAndStartTimer();
}

// ======= Таймер: запуск только при >=2 ставок =======
function checkAndStartTimer() {
    const activeCount = Object.values(players).filter(p => p.totalBet > 0).length;
    console.log('checkAndStartTimer: activeCount=', activeCount, ' bettingTimerInterval=', bettingTimerInterval);

    // Если игроков >=2 и таймер не запущен — запускаем
    if (activeCount >= 2 && bettingTimerInterval === null) {
        console.log('checkAndStartTimer: запускаем таймер');
        bettingTimeLeft = BETTING_TIME;
        if (bettingTimerDisplay) {
            bettingTimerDisplay.style.display = 'block';
            bettingTimerDisplay.textContent = bettingTimeLeft + 'с';
        }
        if (gameMessage) {
            gameMessage.textContent = 'Ставки приняты! Время пошло';
            gameMessage.style.color = '#61dafb';
        }

        bettingTimerInterval = setInterval(() => {
            bettingTimeLeft--;
            if (bettingTimerDisplay) bettingTimerDisplay.textContent = bettingTimeLeft + 'с';
            console.log('Timer tick:', bettingTimeLeft);
            if (bettingTimeLeft <= 0) {
                clearInterval(bettingTimerInterval);
                bettingTimerInterval = null;
                endBettingPhase();
            }
        }, 1000);
        return;
    }

    // Если игроков стало <2 и таймер работал — останавливаем
    if (activeCount < 2 && bettingTimerInterval !== null) {
        console.log('checkAndStartTimer: мало игроков, останавливаем таймер');
        clearInterval(bettingTimerInterval);
        bettingTimerInterval = null;
        bettingTimeLeft = BETTING_TIME;
        if (bettingTimerDisplay) {
            bettingTimerDisplay.style.display = 'none';
            bettingTimerDisplay.textContent = bettingTimeLeft + 'с';
        }
        if (gameMessage) {
            gameMessage.textContent = 'Ждем ставки...';
            gameMessage.style.color = 'white';
        }
    }
}

// ======= Конец фазы ставок =======
function endBettingPhase() {
    console.log('endBettingPhase: вызвано');
    // Защита: если раунд уже запускается/запущен — не делаем ничего
    if (roundStarting || gameIsRunning) {
        console.log('endBettingPhase: раунд уже запускается/запущен, выходим');
        return;
    }

    isBettingOpen = false;
    updateUIState();
    console.log('endBettingPhase: Total bank =', totalBank);

    if (totalBank === 0) {
        if (gameMessage) {
            gameMessage.textContent = 'Нет ставок, раунд отменен.';
            gameMessage.style.color = '#e57373';
        }
        setTimeout(startBettingPhase, 3000);
        return;
    }

    if (gameMessage) {
        gameMessage.textContent = 'Запускаем раунд...';
        gameMessage.style.color = '#61dafb';
    }

    // Вызов startRound через маленькую задержку (даёт время UI обновиться)
    setTimeout(() => {
        if (!roundStarting && !gameIsRunning) {
            startRound();
        } else {
            console.log('endBettingPhase -> startRound: уже запускается/запущено');
        }
    }, 600);
}

// ======= Запуск раунда и анимация шарика =======
function startRound() {
    console.log('startRound: вызван. gameIsRunning=', gameIsRunning, 'roundStarting=', roundStarting);

    if (gameIsRunning || roundStarting) {
        console.log('startRound: уже запущено или запускается, выход.');
        return;
    }

    roundStarting = true; // блокируем повторные входы
    isBettingOpen = false;
    gameIsRunning = true;
    updateUIState();

    if (bettingTimerDisplay) bettingTimerDisplay.style.display = 'none';
    if (gameMessage) gameMessage.style.display = 'none';

    // Отменяем предыдущую анимацию, если она была активна
    if (ballAnimationFrameId) {
        cancelAnimationFrame(ballAnimationFrameId);
        ballAnimationFrameId = null;
    }

    // Проверки перед запуском
    const activePlayers = Object.values(players).filter(p => p.totalBet > 0);
    if (!ball || !gameAreaWrapper || totalBank === 0 || activePlayers.length === 0) {
        console.log('startRound: условия не выполнены.');
        roundStarting = false;
        gameIsRunning = false;
        setTimeout(startBettingPhase, 1000);
        return;
    }

    // Показываем шарик и центрируем
    ball.style.display = 'block';
    ball.style.visibility = 'visible';
    const radius = Math.max(8, Math.floor(ball.offsetWidth / 2)); // безопасный радиус

    ballX = gameAreaWrapper.offsetWidth / 2;
    ballY = gameAreaWrapper.offsetHeight / 2;
    ball.style.left = `${ballX - radius}px`;
    ball.style.top = `${ballY - radius}px`;

    // Инициализируем скорость
    const ang = Math.random() * Math.PI * 2;
    ballVx = Math.cos(ang) * BALL_MAX_SPEED;
    ballVy = Math.sin(ang) * BALL_MAX_SPEED;

    // Запускаем анимацию
    ballAnimationFrameId = requestAnimationFrame(function firstFrame() {
        roundStarting = false;
        animateBall(radius);
    });

    console.log('startRound: шарик запущен.');
}

// ======= Анимация шарика (отскоки в квадрате) =======
function animateBall(radius) {
    ballX += ballVx;
    ballY += ballVy;

    const W = gameAreaWrapper.offsetWidth;
    const H = gameAreaWrapper.offsetHeight;

    // Отскоки от стен квадрата и коррекция позиции
    if (ballX - radius < 0) {
        ballVx = Math.abs(ballVx);
        ballX = radius;
    } else if (ballX + radius > W) {
        ballVx = -Math.abs(ballVx);
        ballX = W - radius;
    }

    if (ballY - radius < 0) {
        ballVy = Math.abs(ballVy);
        ballY = radius;
    } else if (ballY + radius > H) {
        ballVy = -Math.abs(ballVy);
        ballY = H - radius;
    }

    // Замедление
    ballVx *= BALL_DECELERATION;
    ballVy *= BALL_DECELERATION;

    // Отрисовка
    if (ball) {
        ball.style.left = `${ballX - radius}px`;
        ball.style.top = `${ballY - radius}px`;
    }

    // Продолжаем или завершаем
    if (Math.abs(ballVx) > 0.1 || Math.abs(ballVy) > 0.1) {
        ballAnimationFrameId = requestAnimationFrame(() => animateBall(radius));
    } else {
        if (ballAnimationFrameId) cancelAnimationFrame(ballAnimationFrameId);
        ballAnimationFrameId = null;
        finishRound();
    }
}

// ======= Завершение раунда: определение победителя =======
function finishRound() {
    console.log('finishRound: определение победителя');

    const centerX = gameAreaWrapper.offsetWidth / 2;
    const centerY = gameAreaWrapper.offsetHeight / 2;

    const dx = ballX - centerX;
    const dy = ballY - centerY;

    let finalAngle = (Math.atan2(dy, dx) * 180 / Math.PI) + 90;
    if (finalAngle < 0) finalAngle += 360;
    if (finalAngle >= 360) finalAngle -= 360;
    console.log('finishRound: угол шарика =', finalAngle.toFixed(2));

    const activePlayers = Object.values(players).filter(p => p.totalBet > 0);
    let winner = null;

    if (activePlayers.length > 0) {
        for (const p of activePlayers) {
            if (typeof p.startAngle === 'number' && typeof p.endAngle === 'number') {
                if (p.startAngle <= p.endAngle) {
                    if (finalAngle >= p.startAngle && finalAngle < p.endAngle) {
                        winner = p;
                        break;
                    }
                } else {
                    if (finalAngle >= p.startAngle || finalAngle < p.endAngle) {
                        winner = p;
                        break;
                    }
                }
            }
        }
        if (!winner) winner = activePlayers[0];
    }

    if (winner) {
        if (gameMessage) {
            gameMessage.style.display = 'block';
            gameMessage.style.color = 'black';
            gameMessage.style.backgroundColor = winner.color;
            gameMessage.textContent = `Победил: ${winner.name} 🎉 (+${totalBank} ₽)`;
        }
        console.log('finishRound: Победитель =', winner.name);
    } else {
        if (gameMessage) {
            gameMessage.style.display = 'block';
            gameMessage.style.color = '#e57373';
            gameMessage.style.backgroundColor = 'transparent';
            gameMessage.textContent = 'Шарик не попал ни в чей сектор. Банк переносится.';
        }
        console.log('finishRound: Победитель не найден');
    }

    // Через 5 секунд запускаем новый раунд (не удаляем профили игроков)
    setTimeout(() => {
        totalBank = 0;
        if (totalBankDisplay) totalBankDisplay.textContent = totalBank;
        if (ball) {
            ball.style.display = 'none';
            ball.style.visibility = 'hidden';
        }
        if (gameMessage) {
            gameMessage.style.backgroundColor = 'transparent';
            gameMessage.style.color = 'white';
        }
        renderBets();
        renderWheelSections();
        startBettingPhase();
    }, 5000);
}

// ======= Отрисовки =======
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

    // Если ставок нет, то переключаем поле в шахматный режим
    if (active.length === 0 || totalBank === 0) {
        wheelInner.style.background = '#333';
        if (gameAreaWrapper) {
            gameAreaWrapper.classList.add('empty-field');
        }
        return;
    } else {
        // Если ставки появились — убираем шахматный фон
        if (gameAreaWrapper) {
            gameAreaWrapper.classList.remove('empty-field');
        }
    }

    // Сортируем по имени
    active.sort((a, b) => a.name.localeCompare(b.name));

    let currentAngle = 0;
    const segments = active.map(p => {
        const size = (p.totalBet / totalBank) * 360;
        p.startAngle = currentAngle;
        p.endAngle = currentAngle + size;
        const seg = `${p.color} ${p.startAngle}deg ${p.endAngle}deg`;
        currentAngle += size;
        return seg;
    });

    wheelInner.style.background = `conic-gradient(${segments.join(', ')})`;
}

// ======= Привязка событий и старт =======
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
    startRoundButton = document.getElementById('startRoundButton'); // опционально

    console.log('DOM loaded. Elements:', {
        bettingTimerDisplay: !!bettingTimerDisplay,
        totalBankDisplay: !!totalBankDisplay,
        wheelInner: !!wheelInner,
        gameAreaWrapper: !!gameAreaWrapper,
        ball: !!ball,
        playerNameInput: !!playerNameInput,
        betAmountInput: !!betAmountInput,
        placeBetButton:!!placeBetButton,
        betList: !!betList,
        gameMessage: !!gameMessage,
        startRoundButton: !!startRoundButton,
    });

    if (placeBetButton) placeBetButton.addEventListener('click', placeBet);
    if (betAmountInput) betAmountInput.addEventListener('keypress', e => { if (e.key === 'Enter') placeBet(); });
    if (startRoundButton) startRoundButton.addEventListener('click', () => {
        if (!gameIsRunning) startRound();
    });

    // Инициализация игры
    initGame();
});