// ======= НАСТРОЙКИ FIREBASE =======
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

// ======= Глобальные переменные состояния =======
let myPlayerId = localStorage.getItem('roulette_player_id');
if (!myPlayerId) {
    myPlayerId = `player_${Math.random().toString(36).slice(2, 11)}`;
    localStorage.setItem('roulette_player_id', myPlayerId);
}

let players = {};         
let gameState = {};       
let onlinePlayers = [];   
let serverOffset = 0;     

// Переменные мультиплеера
const BETTING_TIME = 15;
const BALL_MAX_SPEED = 150;
const BALL_DECELERATION = 0.985;
const MIN_BET = 10;
const VIRTUAL_WIDTH = 400;
const VIRTUAL_HEIGHT = 400;
const VIRTUAL_RADIUS = 12;

let timerInterval = null;
let animationFrameId = null;
let currentPath = [];
let animStartTime = 0;
let ballX = 200, ballY = 200;

const DISTINCT_COLORS = [
     '#6d8681',  '#eeff00',  
      '#a7ff03', '#0026ff',  
    '#651FFF', '#FF1744',  '#e100ff',
    '#00ff15', '#FF6D00',  
    '#00a0ea',    
];

// Переменные «Невозможного колеса»
let spSelectedPercent = 50;  
let spTotalRotation = 0;     
let spIsSpinning = false;    

const SP_RULES = {
    75: { mult: 1.2, label: 'x1.2' },
    50: { mult: 1.4, label: 'x1.4' },
    33: { mult: 1.55, label: 'x1.55' },
    25: { mult: 1.8, label: 'x1.8' },
    10: { mult: 2.2, label: 'x2.2' },
    1:  { mult: 33.0, label: 'x33.0' }
};

// Переменные «Всегда Голубь» (Монетка)
let coinChoice = 'heads'; 
let coinIsSpinning = false;
let coinRotationY = 0; 

// Переменные «Везде мины»
let minesGameActive = false;
let minesMap = []; 
let minesOpened = []; 
let minesCurrentBet = 0;

const MINES_MULTIPLIERS = [
    1.00, 1.12, 1.27, 1.45, 1.67, 1.93, 2.25, 2.64, 3.13, 3.75, 
    4.55, 5.58, 6.98, 8.90, 11.62, 15.60, 21.65, 31.20, 47.05, 
    76.00, 134.00, 275.00, 750.00
];

// Переменные «Невозможная башня» (Башня)
let impGameActive = false;
let impCurrentRow = 0; 
let impBet = 0;
let impBoard = []; 

const impMinesData = [
    { cells: 5, mines: 1, mult: 1.2 },  
    { cells: 5, mines: 1, mult: 1.6 },  
    { cells: 5, mines: 2, mult: 2.5 },  
    { cells: 4, mines: 1, mult: 4.5 },  
    { cells: 3, mines: 1, mult: 8.0 },  
    { cells: 2, mines: 1, mult: 15.0 }  
];

// ======= ПЕРЕМЕННЫЕ ИГРЫ "ВЗЛЕТ РАКЕТЫ V3" =======
let rocketGameActive = false; 
let rocketMyBet = 0;         
let rocketIsCashed = false;   
let rocketState = { status: 'betting', timerEnd: 0 };
let rocketLoopId = null;
let rocketTimerInterval = null; 

// ПЕРЕМЕННЫЕ АВТОВЫВОДА РАКЕТЫ
let rocketAutoCashoutEnabled = false;
let rocketAutoCashoutMultiplier = 1.5;

// DOM элементы
let bettingTimerDisplay, totalBankDisplay, gameCanvas, gameAreaWrapper, ball, playerNameInput, betAmountInput, placeBetButton, betList, historyList, gameMessage;

function getServerTime() {
    return Date.now() + serverOffset;
}

function isHost() {
    if (onlinePlayers.length === 0) return false;
    return onlinePlayers[0] === myPlayerId;
}

// КРАСИВЫЕ CUSTOM TOAST-УВЕДОМЛЕНИЯ НА САЙТЕ
window.showToast = function(title, text) {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'custom-toast';
    toast.innerHTML = `
        <div class="toast-header">
            <span class="toast-title">💥 ${title}</span>
            <button class="toast-close-btn" onclick="this.parentElement.parentElement.remove()">&times;</button>
        </div>
        <div class="toast-body">${text}</div>
    `;

    container.appendChild(toast);

    // Удаление через 3 секунды с плавной анимацией
    setTimeout(() => {
        if (toast) {
            toast.classList.add('hide');
            setTimeout(() => {
                toast.remove();
            }, 300);
        }
    }, 3000);
};

window.showScreen = function(screenId) {
    document.getElementById('lobbyScreen').style.display = 'none';
    document.getElementById('multiplayerGameScreen').style.display = 'none';
    document.getElementById('singleplayerGameScreen').style.display = 'none';
    document.getElementById('coinGameScreen').style.display = 'none';
    document.getElementById('minesGameScreen').style.display = 'none';
    document.getElementById('impMinesGameScreen').style.display = 'none';
    document.getElementById('rocketGameScreen').style.display = 'none';
    document.getElementById('withdrawGameScreen').style.display = 'none';
    
    document.getElementById(screenId).style.display = 'flex';
};

// Инициализация
document.addEventListener('DOMContentLoaded', () => {
    bettingTimerDisplay = document.getElementById('bettingTimer');
    totalBankDisplay = document.getElementById('totalBank');
    gameCanvas = document.getElementById('gameCanvas');
    gameAreaWrapper= document.getElementById('gameAreaWrapper');
    ball = document.getElementById('ball');
    playerNameInput = document.getElementById('playerNameInput');
    betAmountInput = document.getElementById('betAmountInput');
    placeBetButton = document.getElementById('placeBetButton');
    betList = document.getElementById('betList');
    historyList = document.getElementById('historyList');
    gameMessage = document.getElementById('gameMessage');

    const savedName = localStorage.getItem('roulette_player_name');
    if (savedName && playerNameInput) {
        playerNameInput.value = savedName;
    }

    if (placeBetButton) placeBetButton.addEventListener('click', placeBet);
    if (betAmountInput) betAmountInput.addEventListener('keypress', e => { if (e.key === 'Enter') placeBet(); });

    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('admin') === '1') {
        document.getElementById('adminPanel').style.display = 'block';
        initAdminPanel();
    }

    db.ref('.info/serverTimeOffset').on('value', (snap) => {
        serverOffset = snap.val() || 0;
    });

    db.ref('.info/connected').on('value', (snap) => {
        if (snap.val() === true) {
            const presenceRef = db.ref(`presence/${myPlayerId}`);
            presenceRef.set(true);
            presenceRef.onDisconnect().remove();
        }
    });

    db.ref('presence').on('value', (snap) => {
        onlinePlayers = Object.keys(snap.val() || {}).sort();
        checkHostTimerLogic();
    });

    db.ref(`players/${myPlayerId}`).once('value', (snap) => {
        if (!snap.exists()) {
            db.ref(`players/${myPlayerId}`).set({
                name: savedName || "Игрок",
                balance: 100, 
                totalBet: 0,
                color: DISTINCT_COLORS[Math.floor(Math.random() * DISTINCT_COLORS.length)]
            });
        }
    });

    db.ref('players').on('value', (snapshot) => {
        players = snapshot.val() || {};
        const me = players[myPlayerId];
        if (me) {
            if (document.getElementById('userWelcome')) {
                document.getElementById('userWelcome').textContent = me.name || "Игрок";
            }
            if (document.getElementById('myBalance')) {
                // Выводим строго не более 3 знаков после запятой
                const rawBalance = me.balance || 0;
                document.getElementById('myBalance').textContent = parseFloat(rawBalance.toFixed(3));
            }
            updateSpSummary();
            updateMinesSummary();
        }
        renderBets();
        renderWheelSections();
        checkHostTimerLogic();
    });

    db.ref('gameState').on('value', (snapshot) => {
        gameState = snapshot.val() || { status: 'betting' };
        syncGameWithDatabase();
    });

    db.ref('history').limitToLast(10).on('value', (snapshot) => {
        renderHistory(snapshot.val() || {});
    });

    // ======= СЛУШАТЕЛИ РАКЕТЫ V3 =======
    db.ref('rocketStateV3').on('value', (snapshot) => {
        rocketState = snapshot.val() || { status: 'betting', timerEnd: 0 };
        syncRocketState();
    });

    db.ref('rocketBetsV3').on('value', (snapshot) => {
        const bets = snapshot.val() || {};
        renderRocketBets(bets);

        const myBetRecord = bets[myPlayerId];
        if (myBetRecord) {
            rocketGameActive = true;
            rocketMyBet = myBetRecord.betAmount;
            rocketIsCashed = (myBetRecord.status === 'cashed');

            const cashoutBtn = document.getElementById('rocketCashoutBtn');
            if (rocketIsCashed && cashoutBtn) {
                cashoutBtn.disabled = true;
                cashoutBtn.textContent = 'Успешно забрали!';
            }
        } else {
            // ИСПРАВЛЕН БАГ: Если нашей ставки в базе больше нет, сбрасываем локальный статус
            rocketGameActive = false;
            rocketMyBet = 0;
            rocketIsCashed = false;
        }
    });

    db.ref('rocketHistoryV3').on('value', (snapshot) => {
        renderRocketHistory(snapshot.val() || []);
    });

    selectSpPercent(50);
    renderMinesGrid();
    initImpMinesUI();

    const impBetInput = document.getElementById('impBetInput');
    if (impBetInput) {
        impBetInput.addEventListener('input', updateImpMinesLabels);
    }
    
    // При старте выключаем контроллеры автовывода
    toggleRocketAuto();
});

// Вкладки мультиплеера
window.switchMultiTab = function(tabName) {
    const betsBtn = document.getElementById('tabBetsBtn');
    const historyBtn = document.getElementById('tabHistoryBtn');
    
    if (tabName === 'bets') {
        betsBtn.classList.add('active');
        historyBtn.classList.remove('active');
        betList.style.display = 'block';
        historyList.style.display = 'none';
    } else {
        betsBtn.classList.remove('active');
        historyBtn.classList.add('active');
        betList.style.display = 'none';
        historyList.style.display = 'block';
    }
}

function renderHistory(historyData) {
    if (!historyList) return;
    historyList.innerHTML = '';
    const list = Object.values(historyData).reverse();
    if (list.length === 0) {
        historyList.innerHTML = '<div class="bet-placeholder">История пуста...</div>';
        return;
    }
    list.forEach(item => {
        const div = document.createElement('div');
        div.className = 'bet-item';
        div.style.borderLeft = `4px solid #00E676`;
        div.innerHTML = `
            <div class="avatar" style="background:#00E676; color:black;">💰</div>
            <div class="bet-info">
                <strong>${item.playerName}</strong>
                <span>Выиграл: ${item.winnerPrize} ₽</span>
            </div>
            <div class="bet-chance" style="color:#00E676">${item.winnerChance}% шанс</div>
        `;
        historyList.appendChild(div);
    });
}

// ======= ИГРА 1: ВСЕГДА ГОЛУБЬ (COIN FLIP) =======

window.selectCoinChoice = function(choice) {
    if (coinIsSpinning) return;
    coinChoice = choice;
    document.getElementById('btnCoinHeads').classList.toggle('active', choice === 'heads');
    document.getElementById('btnCoinTails').classList.toggle('active', choice === 'tails');
}

window.playCoinFlip = function() {
    if (coinIsSpinning) return;

    const betInput = document.getElementById('coinBetInput');
    const coinEl = document.getElementById('coin3d');
    const coinMsg = document.getElementById('coinMessage');
    
    const bet = parseInt(betInput.value) || 0;
    const myData = players[myPlayerId] || { balance: 0 };
    const balance = myData.balance || 0;

    if (isNaN(bet) || bet < 10) {
        alert('Минимальная ставка — 10 ₽!');
        return;
    }
    if (bet > balance) {
        alert('Недостаточно средств на балансе!');
        return;
    }

    coinIsSpinning = true;
    betInput.disabled = true;
    coinMsg.textContent = 'Монетка летит...';
    coinMsg.style.color = '#FFC400';

    db.ref(`players/${myPlayerId}/balance`).transaction((current) => {
        return parseFloat(((current || 0) - bet).toFixed(3));
    }, (error, committed) => {
        if (committed) {
            const result = Math.random() < 0.5 ? 'heads' : 'tails';
            const minSpins = 1800; 
            const currentFacing = (coinRotationY % 360) === 0 ? 'heads' : 'tails';
            let additionalRotation = 0;
            
            if (currentFacing === result) {
                additionalRotation = 360; 
            } else {
                additionalRotation = 180; 
            }
            
            coinRotationY += minSpins + additionalRotation;
            coinEl.style.transform = `rotateY(${coinRotationY}deg)`;

            setTimeout(() => {
                const won = coinChoice === result;
                if (won) {
                    const prize = Math.floor(bet * 1.5);
                    db.ref(`players/${myPlayerId}/balance`).transaction((current) => {
                        return parseFloat(((current || 0) + prize).toFixed(3));
                    });
                    coinMsg.innerHTML = `🎉 Вы выиграли! Выпало: <strong>${result === 'heads' ? 'Орел' : 'Решка'}</strong>. <span class="win-color">+${prize} ₽</span>`;
                } else {
                    coinMsg.innerHTML = `🔴 Не угадали! Выпало: <strong>${result === 'heads' ? 'Орел' : 'Решка'}</strong>. <span style="color:#ff1744">-${bet} ₽</span>`;
                }
                
                coinIsSpinning = false;
                betInput.disabled = false;
            }, 3000);
        } else {
            coinIsSpinning = false;
            betInput.disabled = false;
            coinMsg.textContent = 'Ошибка транзакции.';
        }
    });
}

// ======= ИГРА 2: ВЕЗДЕ МИНЫ =======

function renderMinesGrid() {
    const grid = document.getElementById('minesGrid');
    if (!grid) return;
    grid.innerHTML = '';
    for (let i = 0; i < 25; i++) {
        const cell = document.createElement('button');
        cell.className = 'mine-cell';
        cell.id = `mine_cell_${i}`;
        cell.disabled = true;
        cell.onclick = () => clickMineCell(i);
        grid.appendChild(cell);
    }
}

function updateMinesSummary() {
    const betInput = document.getElementById('minesBetInput');
    const cashoutVal = document.getElementById('minesCashoutValue');
    const cashoutBtn = document.getElementById('minesCashoutBtn');
    if (!betInput || !cashoutVal || !cashoutBtn) return;

    if (!minesGameActive) {
        cashoutVal.textContent ='0';
        cashoutBtn.textContent = 'Забрать 0 ₽';
        return;
    }

    const currentMult = MINES_MULTIPLIERS[minesOpened.length];
    const currentWin = Math.floor(minesCurrentBet * currentMult);
    
    cashoutVal.textContent = currentWin;
    cashoutBtn.textContent = `Забрать ${currentWin} ₽`;
}

document.getElementById('minesBetInput')?.addEventListener('input', updateMinesSummary);

window.startMinesRound = function() {
    if (minesGameActive) return;

    const betInput = document.getElementById('minesBetInput');
    const startBtn = document.getElementById('minesStartBtn');
    const cashoutBtn = document.getElementById('minesCashoutBtn');
    const minesMsg = document.getElementById('minesMessage');

    const bet = parseInt(betInput.value) || 0;
    const balance = players[myPlayerId]?.balance || 0;

    if (isNaN(bet) || bet < 10) {
        alert('Минимальная ставка — 10 ₽!');
        return;
    }
    if (bet > balance) {
        alert('Недостаточно средств!');
        return;
    }

    db.ref(`players/${myPlayerId}/balance`).transaction((current) => {
        return parseFloat(((current || 0) - bet).toFixed(3));
    }, (error, committed) => {
        if (committed) {
            minesCurrentBet = bet;
            minesGameActive = true;
            minesOpened = [];
            
            minesMap = Array(25).fill(false);
            let placed = 0;
            while (placed < 3) {
                const idx = Math.floor(Math.random() * 25);
                if (!minesMap[idx]) {
                    minesMap[idx] = true;
                    placed++;
                }
            }

            startBtn.disabled = true;
            betInput.disabled = true;
            cashoutBtn.disabled = false;
            minesMsg.textContent = 'Раунд начался! Ищите алмазы!';
            minesMsg.style.color = '#00E5FF';

            for (let i = 0; i < 25; i++) {
                const cell = document.getElementById(`mine_cell_${i}`);
                cell.className = 'mine-cell';
                cell.textContent = '';
                cell.disabled = false;
            }

            document.getElementById('minesOpenedCount').textContent = '0/22';
            document.getElementById('minesCurrentMultiplier').textContent = '1.00x';
            updateMinesSummary();
        }
    });
}

function clickMineCell(index) {
    if (!minesGameActive) return;
    const cell = document.getElementById(`mine_cell_${index}`);
    if (cell.disabled || minesOpened.includes(index)) return;

    cell.disabled = true;

    if (minesMap[index]) {
        cell.classList.add('exploded');
        cell.textContent = '💣';
        endMinesGame(false);
    } else {
        cell.classList.add('safe');
        cell.textContent = '💎';
        minesOpened.push(index);

        const newMultiplier = MINES_MULTIPLIERS[minesOpened.length];
        document.getElementById('minesOpenedCount').textContent = `${minesOpened.length}/22`;
        document.getElementById('minesCurrentMultiplier').textContent = `${newMultiplier.toFixed(2)}x`;
        updateMinesSummary();

        if (minesOpened.length === 22) {
            endMinesGame(true);
        }
    }
}

window.cashoutMines = function() {
    if (!minesGameActive || minesOpened.length === 0) return;
    endMinesGame(true);
}

function endMinesGame(isWin) {
    minesGameActive = false;
    const startBtn = document.getElementById('minesStartBtn');
    const cashoutBtn = document.getElementById('minesCashoutBtn');
    const betInput = document.getElementById('minesBetInput');
    const minesMsg = document.getElementById('minesMessage');

    startBtn.disabled = false;
    betInput.disabled = false;
    cashoutBtn.disabled = true;

    for (let i = 0; i < 25; i++) {
        const cell = document.getElementById(`mine_cell_${i}`);
        cell.disabled = true;
        if (minesMap[i]) {
            if (!cell.classList.contains('exploded')) {
                cell.classList.add('revealed-mine');
                cell.textContent = '💣';
            }
        } else {
            if (!cell.classList.contains('safe')) {
                cell.textContent = '💎';
            }
        }
    }

    if (isWin) {
        const mult = MINES_MULTIPLIERS[minesOpened.length];
        const winnings = Math.floor(minesCurrentBet * mult);

        db.ref(`players/${myPlayerId}/balance`).transaction((current) => {
            return parseFloat(((current || 0) + winnings).toFixed(3));
        });

        minesMsg.innerHTML = `🎉 Забрали <span class="win-color">${winnings} ₽</span> (${mult.toFixed(2)}x)`;
    } else {
        minesMsg.innerHTML = `💥 Бабах! Вы проиграли <span style="color:#ff1744">${minesCurrentBet} ₽</span>`;
    }
}

// ======= ИГРА 3: НЕВОЗМОЖНАЯ БАШНЯ =======

function initImpMinesUI() {
    const container = document.getElementById('impMinesRowsContainer');
    if (!container) return;
    container.innerHTML = '';

    for (let i = 5; i >= 0; i--) {
        const rowData = impMinesData[i];
        const rowDiv = document.createElement('div');
        rowDiv.className = 'imp-row locked';
        rowDiv.id = `imp_row_${i}`;

        const multLabel = document.createElement('div');
        multLabel.className = 'row-multiplier';
        multLabel.id = `imp_label_${i}`; 
        rowDiv.appendChild(multLabel);

        for (let j = 0; j < rowData.cells; j++) {
            const btn = document.createElement('button');
            btn.className = 'imp-cell';
            btn.id = `imp_cell_${i}_${j}`;
            btn.onclick = () => clickImpCell(i, j);
            rowDiv.appendChild(btn);
        }
        container.appendChild(rowDiv);
    }
    updateImpMinesLabels();
}

function updateImpMinesLabels() {
    const betInput = document.getElementById('impBetInput');
    if (!betInput) return;
    const bet = parseInt(betInput.value) || 0;

    for (let i = 0; i < 6; i++) {
        const label = document.getElementById(`imp_label_${i}`);
        if (label) {
            const rowData = impMinesData[i];
            const possibleWin = Math.floor(bet * rowData.mult);
            label.innerHTML = `
                <span style="color:#00E676;">x${rowData.mult} <span style="color:#ff1744;">💣${rowData.mines}</span></span>
                <span style="color:#FFC400; font-size:0.75rem;">+${possibleWin} ₽</span>
            `;
        }
    }
}

window.startImpMines = function() {
    if (impGameActive) return;

    const betInput = document.getElementById('impBetInput');
    const startBtn = document.getElementById('impStartBtn');
    const cashoutBtn = document.getElementById('impCashoutBtn');
    const impMsg = document.getElementById('impMessage');

    const bet = parseInt(betInput.value) || 0;
    const balance = players[myPlayerId]?.balance || 0;

    if (isNaN(bet) || bet < 10) {
        alert('Минимальная ставка — 10 ₽!');
        return;
    }
    if (bet > balance) {
        alert('Недостаточно баланса!');
        return;
    }

    db.ref(`players/${myPlayerId}/balance`).transaction((current) => {
        return parseFloat(((current || 0) - bet).toFixed(3));
    }, (error, committed) => {
        if (committed) {
            impBet = bet;
            impGameActive = true;
            impCurrentRow = 0;
            impBoard = [];

            for (let i = 0; i < 6; i++) {
                const rowConf = impMinesData[i];
                let rowMines = new Array(rowConf.cells).fill(false);
                let placed = 0;
                while (placed < rowConf.mines) {
                    let r = Math.floor(Math.random() * rowConf.cells);
                    if (!rowMines[r]) {
                        rowMines[r] = true;
                        placed++;
                    }
                }
                impBoard.push(rowMines);
            }

            startBtn.disabled = true;
            betInput.disabled = true;
            cashoutBtn.disabled = true; 
            cashoutBtn.textContent = 'Забрать 0 ₽';
            impMsg.textContent = 'Начните с первого ряда (самый нижний)!';
            impMsg.style.color = '#00E5FF';

            for (let i = 0; i < 6; i++) {
                const rDiv = document.getElementById(`imp_row_${i}`);
                rDiv.className = (i === 0) ? 'imp-row active' : 'imp-row locked';
                
                Array.from(rDiv.getElementsByClassName('imp-cell')).forEach(c => {
                    c.className = 'imp-cell'; 
                    c.textContent = '';
                });
            }
        }
    });
}

function clickImpCell(rowIdx, cellIdx) {
    if (!impGameActive || rowIdx !== impCurrentRow) return;

    const cellBtn = document.getElementById(`imp_cell_${rowIdx}_${cellIdx}`);
    const isMine = impBoard[rowIdx][cellIdx];
    const impMsg = document.getElementById('impMessage');
    const cashoutBtn = document.getElementById('impCashoutBtn');

    if (isMine) {
        cellBtn.classList.add('lose');
        cellBtn.textContent = '💣';
        endImpGame(false);
    } else {
        cellBtn.classList.add('win');
        cellBtn.textContent = '💎';
        
        const currentMult = impMinesData[rowIdx].mult;
        const currentWin = Math.floor(impBet * currentMult);
        
        cashoutBtn.disabled = false;
        cashoutBtn.textContent = `Забрать ${currentWin} ₽`;

        if (rowIdx < 5) {
            document.getElementById(`imp_row_${rowIdx}`).className = 'imp-row passed';
            impCurrentRow++;
            document.getElementById(`imp_row_${impCurrentRow}`).className = 'imp-row active';
            impMsg.textContent = `Ряд ${rowIdx + 1} пройден! Поднимайтесь выше.`;
            impMsg.style.color = '#00E676';
        } else {
            endImpGame(true);
        }
    }
}

window.cashoutImpMines = function() {
    if (!impGameActive) return;
    endImpGame(true);
}

function endImpGame(isWin) {
    impGameActive = false;
    const startBtn = document.getElementById('impStartBtn');
    const cashoutBtn = document.getElementById('impCashoutBtn');
    const betInput = document.getElementById('impBetInput');
    const impMsg = document.getElementById('impMessage');

    startBtn.disabled = false;
    betInput.disabled = false;
    cashoutBtn.disabled = true;

    let finalMult = 0;
    if (isWin) {
        const row5Cells = document.getElementById('imp_row_5') ? Array.from(document.getElementById('imp_row_5').getElementsByClassName('imp-cell')) : [];
        const finishedLastRow = row5Cells.some(c => c.classList.contains('win'));

        if (finishedLastRow) {
            finalMult = impMinesData[5].mult; 
        } else if (impCurrentRow > 0) {
            finalMult = impMinesData[impCurrentRow - 1].mult;
        }
    }

    const winnings = Math.floor(impBet * finalMult);

    if (isWin && winnings > 0) {
        db.ref(`players/${myPlayerId}/balance`).transaction((current) => {
            return parseFloat(((current || 0) + winnings).toFixed(3));
        });
        impMsg.innerHTML = `🎉 ПОБЕДА! Вы забрали <span class="win-color">${winnings} ₽</span>`;
    } else if (!isWin) {
        impMsg.innerHTML = `💥 ВЗРЫВ! Ваша ставка <span style="color:#ff1744">${impBet} ₽</span> сгорела.`;
    }

    for (let i = 0; i < 6; i++) {
        document.getElementById(`imp_row_${i}`).classList.remove('locked', 'active');
        impBoard[i].forEach((isMine, cellIdx) => {
            const cell = document.getElementById(`imp_cell_${i}_${cellIdx}`);
            if (isMine) {
                if (!cell.classList.contains('lose')) {
                    cell.textContent = '💣';
                }
            } else {
                if (!cell.classList.contains('win')) {
                    cell.textContent = '💎';
                }
            }
        });
    }
}

// ======= ИГРА 4: НЕВОЗМОЖНОЕ КОЛЕСО =======

window.selectSpPercent = function(pct) {
    if (spIsSpinning) return;
    
    spSelectedPercent = pct;
    const buttons = document.querySelectorAll('.sp-pct-btn');
    buttons.forEach(btn => {
        btn.classList.remove('active');
        if (btn.textContent.includes(pct + '%')) {
            btn.classList.add('active');
        }
    });

    const deg = (pct / 100) * 360;
    const wheel = document.getElementById('spWheel');
    if (wheel) {
        wheel.style.background = `conic-gradient(#00E676 0deg ${deg}deg, #ff1744 ${deg}deg 360deg)`;
    }

    const label = document.getElementById('spWheelText');
    if (label) {
        const halfAngle = deg / 2;
        label.style.transform = `translate(-50%, -50%) rotate(${halfAngle}deg) translateY(-50px) rotate(-${halfAngle}deg)`;
    }

    updateSpSummary();
};

function updateSpSummary() {
    const betInput = document.getElementById('spBetInput');
    const summaryChance = document.getElementById('summaryChance');
    const summaryWin = document.getElementById('summaryWin');

    if (!betInput || !summaryChance || !summaryWin) return;

    const bet = parseInt(betInput.value) || 0;
    const rule = SP_RULES[spSelectedPercent];
    
    summaryChance.textContent = spSelectedPercent + '%';
    if (rule) {
        const possiblePayout = Math.floor(bet * rule.mult);
        summaryWin.textContent = possiblePayout + ' ₽';
    }
}

document.getElementById('spBetInput')?.addEventListener('input', updateSpSummary);

window.spinSingleplayerWheel = function() {
    if (spIsSpinning) return;

    const betInput = document.getElementById('spBetInput');
    const spinBtn = document.getElementById('spSpinBtn');
    const spMsg = document.getElementById('spMessage');
    
    const bet = parseInt(betInput.value) || 0;
    const balance = players[myPlayerId]?.balance || 0;

    if (isNaN(bet) || bet < 10) {
        alert('Минимальная ставка — 10 ₽!');
        return;
    }
    if (bet > balance) {
        alert('Недостаточно баланса!');
        return;
    }

    spIsSpinning = true;
    spinBtn.disabled = true;
    betInput.disabled = true;
    spMsg.textContent = 'Колесо раскручивается...';
    spMsg.style.color = '#00E5FF';

    db.ref(`players/${myPlayerId}/balance`).transaction((current) => {
        return parseFloat(((current || 0) - bet).toFixed(3));
    }, (error, committed) => {
        if (committed) {
            const randomAngle = Math.random() * 360;
            spTotalRotation += 1800 + randomAngle; 
            
            const wheel = document.getElementById('spWheel');
            wheel.style.transform = `rotate(${spTotalRotation}deg)`;

            setTimeout(() => {
                evaluateSpResult(randomAngle, bet);
            }, 4000);
        } else {
            spIsSpinning = false;
            spinBtn.disabled = false;
            betInput.disabled = false;
            spMsg.textContent = 'Ошибка.';
        }
    });
};

function evaluateSpResult(stoppedAngle, bet) {
    const spinBtn = document.getElementById('spSpinBtn');
    const betInput = document.getElementById('spBetInput');
    const spMsg = document.getElementById('spMessage');

    const netRotation = spTotalRotation % 360;
    const winningAngleOnWheel = (360 - netRotation) % 360;

    const playerBoundary = (spSelectedPercent / 100) * 360;
    const isPlayerWinner = winningAngleOnWheel <= playerBoundary;

    if (isPlayerWinner) {
        const rule = SP_RULES[spSelectedPercent];
        const prize = Math.floor(bet * rule.mult);

        db.ref(`players/${myPlayerId}/balance`).transaction((current) => {
            return parseFloat(((current || 0) + prize).toFixed(3));
        });

        spMsg.innerHTML = `🎉 ВЫ ПОБЕДИЛИ! Получено: <span style="color:#00E676">+${prize} ₽</span>`;
    } else {
        spMsg.innerHTML = `🔴 ВЫ ПРОИГРАЛИ! <span style="color:#ff1744">-${bet} ₽</span>`;
    }

    spIsSpinning = false;
    spinBtn.disabled = false;
    betInput.disabled = false;
}

// ======= ИГРА 5: МУЛЬТИПЛЕЕР (КАЛЬМАР) =======

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
    if (isNaN(amount) || amount < MIN_BET) {
        alert(`Минимальная ставка — ${MIN_BET} ₽!`);
        return;
    }

    const myData = players[myPlayerId] || { balance: 0 };
    const myCurrentBalance = myData.balance || 0;

    if (amount > myCurrentBalance) {
        alert(`Недостаточно средств! Баланс: ${myCurrentBalance} ₽.`);
        return;
    }

    localStorage.setItem('roulette_player_name', name);

    const newBalance = parseFloat((myCurrentBalance - amount).toFixed(3));
    const currentBet = myData.totalBet || 0;
    const playerColor = DISTINCT_COLORS[Object.keys(players).length % DISTINCT_COLORS.length];

    db.ref(`players/${myPlayerId}`).update({
        name: name,
        color: myData.color || playerColor,
        totalBet: currentBet + amount,
        balance: newBalance
    });

    if (betAmountInput) betAmountInput.value = '';
}

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
            gameMessage.textContent = `Победил: ${gameState.winnerName} 🎉 (+${gameState.winnerPrize} ₽)`;
        }
    }
}

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

function checkHostTimerLogic() {
    checkHostRocketLogic();

    if (!isHost()) return;

    const activePlayers = Object.values(players).filter(p => p.totalBet > 0);
    const status = gameState.status || 'betting';
    const now = getServerTime();

    if (status === 'betting' && gameState.timerEnd > 0 && now >= gameState.timerEnd) {
        triggerRoundStart();
        return;
    }

    if (status === 'betting' && activePlayers.length >= 2 && (!gameState.timerEnd || gameState.timerEnd === 0)) {
        db.ref('gameState').update({
            timerEnd: now + (BETTING_TIME * 1000)
        });
    }

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

function generateDeterministicPath(angle) {
    let x = VIRTUAL_WIDTH / 2;
    let y = VIRTUAL_HEIGHT / 2;
    let vx = Math.cos(angle) * BALL_MAX_SPEED;
    let vy = Math.sin(angle) * BALL_MAX_SPEED;
    
    const path = [];
    let iterations = 0;

    while ((Math.abs(vx) > 0.1 || Math.abs(vy) > 0.1) && iterations < 2000) {
        x += vx;
        y += vy;

        if (x - VIRTUAL_RADIUS < 0) {
            vx = Math.abs(vx);
            x = VIRTUAL_RADIUS;
        } else if (x + VIRTUAL_RADIUS > VIRTUAL_WIDTH) {
            vx = -Math.abs(vx);
            x = VIRTUAL_WIDTH - VIRTUAL_RADIUS;
        }

        if (y - VIRTUAL_RADIUS < 0) {
            vy = Math.abs(vy);
            y = VIRTUAL_RADIUS;
        } else if (y + VIRTUAL_RADIUS > VIRTUAL_HEIGHT) {
            vy = -Math.abs(vy);
            y = VIRTUAL_HEIGHT - VIRTUAL_RADIUS;
        }

        vx *= BALL_DECELERATION;
        vy *= BALL_DECELERATION;

        path.push({ x: x, y: y });
        iterations++;
    }
    return path;
}

function startLocalRound(launchAngle) {
    if (ball) ball.style.display = 'block';
    currentPath = generateDeterministicPath(launchAngle);
    animStartTime = Date.now();
    animationFrameId = requestAnimationFrame(animateDeterministicBall);
}

function animateDeterministicBall() {
    const elapsed = Date.now() - animStartTime;
    const targetFps = 60;
    const frameIndex = Math.floor((elapsed / 1000) * targetFps);

    if (frameIndex < currentPath.length) {
        const coord = currentPath[frameIndex];
        ballX = coord.x;
        ballY = coord.y;

        if (ball && gameAreaWrapper) {
            const rect = gameAreaWrapper.getBoundingClientRect();
            const borderSize = 6;
            const actualSize = rect.width - (borderSize * 2);
            const scale = actualSize / VIRTUAL_WIDTH;

            const screenX = ballX * scale;
            const screenY = ballY * scale;
            const screenRadius = VIRTUAL_RADIUS * scale;

            ball.style.width = `${screenRadius * 2}px`;
            ball.style.height = `${screenRadius * 2}px`;
            ball.style.left = `${screenX - screenRadius}px`;
            ball.style.top = `${screenY - screenRadius}px`;
        }

        animationFrameId = requestAnimationFrame(animateDeterministicBall);
    } else {
        const finalCoord = currentPath[currentPath.length - 1];
        ballX = finalCoord.x;
        ballY = finalCoord.y;

        animationFrameId = null;
        if (isHost()) {
            determineAndPublishWinner();
        }
    }
}

function determineAndPublishWinner() {
    const segments = getPlayersWithSegments();
    let winner = null;
    const totalBank = calculateTotalBank();

    const finalXCanvas = (ballX + ballY - 400) * Math.SQRT1_2;

    if (segments.length > 0) {
        winner = segments.find(p => finalXCanvas >= p.startX && finalXCanvas <= p.endX);
        if (!winner) winner = segments[segments.length - 1]; 
    }

    if (winner) {
        const defaultPrize = totalBank * 0.85; 
        let finalPrize = defaultPrize;

        if (defaultPrize < winner.totalBet) {
            const otherBets = totalBank - winner.totalBet; 
            finalPrize = winner.totalBet + (otherBets * 0.85); 
        }

        finalPrize = Math.floor(finalPrize); 

        db.ref(`players/${winner.id}/balance`).transaction((current) => {
            return parseFloat(((current || 0) + finalPrize).toFixed(3));
        });

        const chancePct = ((winner.totalBet / totalBank) * 100).toFixed(0);

        const historyRef = db.ref('history');
        historyRef.push({
            playerName: winner.name,
            winnerPrize: finalPrize,
            winnerChance: chancePct,
            timestamp: firebase.database.ServerValue.TIMESTAMP
        });

        db.ref('gameState').set({
            status: 'finished',
            winnerName: winner.name,
            winnerColor: winner.color,
            winnerPrize: finalPrize
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
    const shuffledColors = [...DISTINCT_COLORS].sort(() => Math.random() - 0.5);

    let colorIndex = 0;
    for (const id in players) {
        if (onlinePlayers.includes(id)) {
            updatedPlayers[id] = {
                name: players[id].name,
                color: shuffledColors[colorIndex % shuffledColors.length],
                totalBet: 0,
                balance: players[id].balance || 0
            };
            colorIndex++;
        }
    }

    db.ref('players').set(updatedPlayers);
    db.ref('gameState').set({
        status: 'betting',
        timerEnd: 0
    });
}

function getPlayersWithSegments() {
    const active = Object.keys(players)
        .filter(id => players[id].totalBet > 0)
        .map(id => ({ id, ...players[id] }))
        .sort((a, b) => a.id.localeCompare(b.id)); 

    const totalB = active.reduce((sum, p) => sum + p.totalBet, 0);
    if (active.length === 0 || totalB === 0) return [];

    const L = 400 * Math.SQRT2; 
    const minW = Math.min(30, L / (active.length + 1)); 
    const totalMin = active.length * minW;
    const remainingL = L - totalMin;

    let currentX = -L / 2;
    return active.map(p => {
        const width = minW + remainingL * (p.totalBet / totalB);
        const startX = currentX;
        const endX = currentX + width;
        currentX = endX;
        return { ...p, startX, endX, width };
    });
}

function renderWheelSections() {
    const canvas = document.getElementById('gameCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    ctx.clearRect(0, 0, 400, 400);

    const segments = getPlayersWithSegments();

    if (segments.length === 0) {
        ctx.fillStyle = '#1e1e1e';
        ctx.fillRect(0, 0, 400, 400);
        
        ctx.strokeStyle = '#2a2a2a';
        ctx.lineWidth = 2;
        for (let i = 0; i <= 400; i += 40) {
            ctx.beginPath();
            ctx.moveTo(i, 0); ctx.lineTo(i, 400);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(0, i); ctx.lineTo(400, i);
            ctx.stroke();
        }
        return;
    }

    const L = 400 * Math.SQRT2; 

    ctx.save();
    ctx.translate(200, 200);
    ctx.rotate(Math.PI / 4); 

    segments.forEach(p => {
        ctx.fillStyle = p.color;
        ctx.fillRect(p.startX, -L, p.width, L * 2);

        if (p.id === myPlayerId) {
            ctx.save();
            ctx.translate(p.startX + p.width / 2, 0);
            ctx.rotate(-Math.PI / 4); 
            
            ctx.fillStyle = '#000000';
            ctx.font = 'bold 24px Segoe UI, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.shadowColor = '#ffffff';
            ctx.shadowBlur = 8;
            ctx.fillText('Вы', 0, 0);
            ctx.restore();
        }
    });
    ctx.restore();
}


// ======= ИГРА 6: ВЗЛЕТ РАКЕТЫ V3 =======

// Честный генератор коэффициентов
function generateCrashMultiplier() {
    const rand = Math.random();
    
    if (rand < 0.05) {
        return 1.00;
    }
    else if (rand < 0.40) {
        return parseFloat((1.01 + Math.random() * 0.38).toFixed(2));
    }
    else if (rand < 0.85) {
        return parseFloat((1.40 + Math.random() * 2.60).toFixed(2));
    }
    else if (rand < 0.95) {
        return parseFloat((4.01 + Math.random() * 10.99).toFixed(2));
    }
    else if (rand < 0.99) {
        return parseFloat((15.01 + Math.random() * 34.99).toFixed(2));
    }
    else {
        return parseFloat((50.01 + Math.random() * 282.99).toFixed(2));
    }
}

// Математическая кривая набора высоты
function getRocketMult(elapsed, crashMult) {
    const t_10 = Math.log(10) / 0.07;
    if (crashMult >= 20 && elapsed > t_10) {
        return 10 * Math.exp(0.22 * (elapsed - t_10));
    }
    return Math.exp(elapsed * 0.07);
}

// Управление автовыводом
window.toggleRocketAuto = function() {
    const toggle = document.getElementById('rocketAutoToggle');
    const controls = document.getElementById('rocketAutoControls');
    
    rocketAutoCashoutEnabled = toggle.checked;
    
    if (rocketAutoCashoutEnabled) {
        controls.style.opacity = '1';
        controls.style.pointerEvents = 'auto';
    } else {
        controls.style.opacity = '0.35';
        controls.style.pointerEvents = 'none';
    }
};

window.changeRocketAutoMult = function(amount) {
    let newVal = parseFloat((rocketAutoCashoutMultiplier + amount).toFixed(1));
    if (newVal < 1.1) return;
    
    rocketAutoCashoutMultiplier = newVal;
    document.getElementById('rocketAutoValue').textContent = `${rocketAutoCashoutMultiplier.toFixed(1)}x`;
    
    // Блокируем кнопку минус, если дошли до предела 1.1x
    document.getElementById('rocketAutoMinus').disabled = (rocketAutoCashoutMultiplier <= 1.1);
};

// Синхронизация состояний Ракеты
function syncRocketState() {
    const status = rocketState ? (rocketState.status || 'betting') : 'betting';
    const timerOverlay = document.getElementById('rocketTimerOverlay');
    const rocketActor = document.getElementById('rocketActor');
    const multDisp = document.getElementById('rocketMultiplierDisplay');
    const explosion = document.getElementById('rocketExplosion');
    const msg = document.getElementById('rocketMessage');

    const betBtn = document.getElementById('rocketBetBtn');
    const cashoutBtn = document.getElementById('rocketCashoutBtn');
    const betInput = document.getElementById('rocketBetInput');
    const payoutDiv = document.getElementById('rocketPotentialPayout');

    const stars = document.querySelector('.stars-container');

    if (status === 'betting') {
        if (rocketLoopId) {
            cancelAnimationFrame(rocketLoopId);
            rocketLoopId = null;
        }

        if (explosion) explosion.style.display = 'none';
        if (rocketActor) {
            rocketActor.style.display = 'flex';
            rocketActor.style.bottom = '20px';
            rocketActor.style.transform = 'none';
        }
        if (multDisp) multDisp.style.display = 'none';
        if (timerOverlay) timerOverlay.style.display = 'block';
        if (stars) stars.style.animationDuration = '3.5s';
        if (payoutDiv) payoutDiv.style.display = 'none';

        if (betInput) betInput.disabled = false;
        if (betBtn) betBtn.disabled = rocketGameActive; 
        if (cashoutBtn) {
            cashoutBtn.disabled = true;
            cashoutBtn.textContent = 'Забрать 0 ₽';
        }

        if (rocketState.timerEnd && rocketState.timerEnd > 0) {
            startRocketBettingTimer(rocketState.timerEnd);
        } else {
            if (timerOverlay) timerOverlay.textContent = '10';
            if (msg) msg.textContent = 'Ожидание игроков...';
        }
    } 
    else if (status === 'flying') {
        if (timerOverlay) timerOverlay.style.display = 'none';
        if (explosion) explosion.style.display = 'none';
        if (rocketActor) rocketActor.style.display = 'flex';

        if (betBtn) betBtn.disabled = true;
        if (betInput) betInput.disabled = true;

        if (msg) {
            msg.textContent = 'Ракета летит вверх!';
            msg.style.color = '#00E5FF';
        }

        if (rocketTimerInterval) {
            clearInterval(rocketTimerInterval);
            rocketTimerInterval = null;
        }

        startRocketFlightAnimation(rocketState.launchTime);
    } 
    else if (status === 'crashed') {
        if (rocketLoopId) {
            cancelAnimationFrame(rocketLoopId);
            rocketLoopId = null;
        }

        if (rocketTimerInterval) {
            clearInterval(rocketTimerInterval);
            rocketTimerInterval = null;
        }

        if (timerOverlay) timerOverlay.style.display = 'none';
        if (rocketActor) rocketActor.style.display = 'none';
        if (explosion) explosion.style.display = 'block';
        if (payoutDiv) payoutDiv.style.display = 'none';

        if (multDisp) {
            multDisp.style.display = 'block';
            multDisp.textContent = `${rocketState.crashMult ? rocketState.crashMult.toFixed(2) : '1.00'}x`;
            multDisp.style.color = '#ff1744';
            multDisp.style.textShadow = '0 0 20px rgba(255, 23, 68, 0.8)';
        }

        if (betBtn) betBtn.disabled = true;
        if (cashoutBtn) {
            cashoutBtn.disabled = true;
            cashoutBtn.textContent = 'ВЗРЫВ!';
        }

        if (msg) {
            const finalMult = rocketState.crashMult ? rocketState.crashMult.toFixed(2) : '1.00';
            msg.innerHTML = `💥 Ракета взорвалась на <span style="color:#ff1744; font-weight:bold;">${finalMult}x</span>`;
        }

        // КЛИЕНТСКИЙ FALLBACK ДЛЯ АВТОВЫВОДА НА ВЗРЫВЕ
        // Если у нас включен автовывод, а ракета взорвалась НА или ВЫШЕ нашей цели, но сетевой пинг задержал забор — отдаем выигрыш
        if (rocketGameActive && !rocketIsCashed && rocketAutoCashoutEnabled) {
            if (rocketState.crashMult >= rocketAutoCashoutMultiplier) {
                cashoutRocket(rocketAutoCashoutMultiplier);
            }
        }

        rocketGameActive = false;
        rocketMyBet = 0;
        rocketIsCashed = false;
    }
}

// Запуск обратного отсчета в фазе ставок
function startRocketBettingTimer(timerEnd) {
    if (rocketTimerInterval) {
        clearInterval(rocketTimerInterval);
    }

    const timerOverlay = document.getElementById('rocketTimerOverlay');
    const msg = document.getElementById('rocketMessage');

    rocketTimerInterval = setInterval(() => {
        const now = getServerTime();
        const timeLeft = Math.max(0, (timerEnd - now) / 1000);
        
        if (timerOverlay) {
            timerOverlay.textContent = Math.ceil(timeLeft);
        }

        if (rocketState.status !== 'betting') {
            clearInterval(rocketTimerInterval);
            rocketTimerInterval = null;
            return;
        }

        if (msg && !rocketGameActive) {
            msg.textContent = `Успейте поставить! До старта: ${timeLeft.toFixed(1)}с`;
            msg.style.color = '#D500F9';
        }

        if (timeLeft <= 0) {
            clearInterval(rocketTimerInterval);
            rocketTimerInterval = null;
            if (isHost() && rocketState.status === 'betting') {
                launchRocket();
            }
        }
    }, 100);
}

// Анимация полета
function startRocketFlightAnimation(launchTime) {
    const stars = document.querySelector('.stars-container');
    const rocketActor = document.getElementById('rocketActor');
    const multDisp = document.getElementById('rocketMultiplierDisplay');
    const cashoutBtn = document.getElementById('rocketCashoutBtn');
    const payoutDiv = document.getElementById('rocketPotentialPayout');
    const payoutAmt = document.getElementById('rocketPotentialAmount');

    if (multDisp) multDisp.style.display = 'block';

    function tick() {
        const now = getServerTime();
        const elapsed = (now - launchTime) / 1000;
        
        if (elapsed < 0) {
            rocketLoopId = requestAnimationFrame(tick);
            return;
        }

        const currentMult = getRocketMult(elapsed, rocketState.crashMult);

        if (multDisp && rocketState.status === 'flying') {
            multDisp.textContent = `${currentMult.toFixed(2)}x`;
            multDisp.style.color = '#00FF88';
            multDisp.style.textShadow = '0 0 20px rgba(0, 255, 136, 0.8)';
        }

        // Полет ракеты вверх + вибрация + реактивный след
        if (rocketActor) {
            const verticalPos = Math.min(130, 20 + elapsed * 12);
            const shake = Math.sin(now * 0.12) * 3.5;
            rocketActor.style.bottom = `${verticalPos}px`;
            rocketActor.style.transform = `translateX(${shake}px) rotate(${Math.sin(now * 0.05) * 4}deg)`;
        }

        if (stars) {
            const rateLimit = (rocketState.crashMult >= 20 && currentMult > 10) ? 0.05 : 0.15;
            const animSpeed = Math.max(0.08, 3.5 / (1 + elapsed * (1 / rateLimit * 0.02)));
            stars.style.animationDuration = `${animSpeed}s`;
        }

        // СЛУШАТЕЛЬ СРАБАТЫВАНИЯ АВТОВЫВОДА (СВЕРХТОЧНЫЙ)
        if (rocketGameActive && !rocketIsCashed && rocketState.status === 'flying') {
            if (rocketAutoCashoutEnabled && currentMult >= rocketAutoCashoutMultiplier) {
                cashoutRocket(rocketAutoCashoutMultiplier);
            } else {
                // Показ прогнозируемого выигрыша в реальном времени при ручной игре
                const potentialWin = (rocketMyBet * currentMult).toFixed(2);
                if (payoutDiv) payoutDiv.style.display = 'block';
                if (payoutAmt) payoutAmt.textContent = potentialWin;

                if (cashoutBtn) {
                    cashoutBtn.disabled = false;
                    cashoutBtn.textContent = `Забрать ${Math.floor(potentialWin)} ₽`;
                }
            }
        } else {
            if (payoutDiv) payoutDiv.style.display = 'none';
        }

        if (rocketState.status === 'flying') {
            rocketLoopId = requestAnimationFrame(tick);
        }
    }
    rocketLoopId = requestAnimationFrame(tick);
}

// Ставка в ракете
window.placeRocketBet = function() {
    const status = rocketState ? (rocketState.status || 'betting') : 'betting';
    if (status !== 'betting') {
        alert('Ставки закрыты! Ракета уже в полете или взорвалась.');
        return;
    }
    if (rocketGameActive) return;

    const betInput = document.getElementById('rocketBetInput');
    const amount = parseInt(betInput.value) || 0;
    const balance = players[myPlayerId]?.balance || 0;

    if (isNaN(amount) || amount < 5) {
        alert('Минимальная ставка в Ракете — 5 ₽!');
        return;
    }
    if (amount > balance) {
        alert(`Недостаточно средств! Ваш текущий баланс: ${parseFloat(balance.toFixed(3))} ₽`);
        return;
    }

    const betBtn = document.getElementById('rocketBetBtn');
    if (betBtn) betBtn.disabled = true;

    db.ref(`players/${myPlayerId}/balance`).transaction((current) => {
        return parseFloat(((current || 0) - amount).toFixed(3));
    }, (error, committed) => {
        if (committed) {
            rocketGameActive = true;
            rocketMyBet = amount;
            rocketIsCashed = false;

            const myData = players[myPlayerId] || { name: 'Игрок', color: '#BA68C8' };
            db.ref(`rocketBetsV3/${myPlayerId}`).set({
                name: myData.name || "Игрок",
                betAmount: amount,
                cashoutMult: 0,
                status: 'active',
                color: myData.color || '#BA68C8'
            });

            const msg = document.getElementById('rocketMessage');
            if (msg) {
                msg.textContent = 'Ставка принята! Ожидаем старт...';
                msg.style.color = '#00FF88';
            }
        } else {
            if (betBtn) betBtn.disabled = false;
            alert('Ошибка выполнения транзакции списания средств.');
        }
    });
}

// Забрать деньги (с поддержкой ручного и автоматического вывода)
window.cashoutRocket = function(forcedMult) {
    if (!rocketGameActive || rocketIsCashed || rocketState.status !== 'flying') return;

    const now = getServerTime();
    const elapsed = (now - rocketState.launchTime) / 1000;
    const liveMult = parseFloat(getRocketMult(elapsed, rocketState.crashMult).toFixed(2));

    // Используем либо автовывод (forcedMult), либо текущий живой коэффициент
    let currentMult = forcedMult ? parseFloat(forcedMult.toFixed(1)) : liveMult;

    // Сверка: если мы забираем вручную, но ракета уже взорвалась
    if (liveMult >= rocketState.crashMult) {
        // Если это автовывод и ракета взлетела выше или ровно на цель - отдаем выигрыш
        if (forcedMult && rocketState.crashMult >= forcedMult) {
            // Разрешаем транзакцию
        } else {
            alert('Не успели! Ракета уже потерпела крушение.');
            return;
        }
    }

    rocketIsCashed = true;
    const cashoutBtn = document.getElementById('rocketCashoutBtn');
    if (cashoutBtn) cashoutBtn.disabled = true;

    const winnings = parseFloat((rocketMyBet * currentMult).toFixed(2));

    db.ref(`players/${myPlayerId}/balance`).transaction((current) => {
        return parseFloat(((current || 0) + winnings).toFixed(3));
    }, (error, committed) => {
        if (committed) {
            db.ref(`rocketBetsV3/${myPlayerId}`).update({
                status: 'cashed',
                cashoutMult: currentMult
            });

            // КРАСИВОЕ УВЕДОМЛЕНИЕ НА САЙТЕ ВМЕСТО ALERT ИЛИ БРАУЗЕРА!
            if (forcedMult) {
                showToast("Успешный автовывод!", `Поздравляем! Ваш автовывод сработал на <b>x${currentMult.toFixed(1)}</b>. Баланс пополнен на <span class="win-color"><b>+${winnings} ₽</b></span>!`);
            } else {
                showToast("Выигрыш получен!", `Вы успешно катапультировались на коэффициенте <b>x${currentMult.toFixed(2)}</b>. На счет начислено <span class="win-color"><b>+${winnings} ₽</b></span>!`);
            }

            const msg = document.getElementById('rocketMessage');
            if (msg) {
                msg.innerHTML = `🎉 Забрали <span class="win-color">+${winnings} ₽</span> (на x${currentMult})`;
                msg.style.color = '#00FF88';
            }
        } else {
            rocketIsCashed = false;
            if (cashoutBtn) cashoutBtn.disabled = false;
            alert('Не удалось связаться с базой данных для выплаты.');
        }
    });
}

// Отображение ставок всех участников раунда
function renderRocketBets(betsData) {
    const listContainer = document.getElementById('rocketBetsList');
    if (!listContainer) return;
    listContainer.innerHTML = '';

    const list = Object.values(betsData);
    if (list.length === 0) {
        listContainer.innerHTML = '<div class="bet-placeholder">Ставок еще нет...</div>';
        return;
    }

    list.forEach(b => {
        const div = document.createElement('div');
        div.className = 'bet-item';
        div.style.borderLeft = `4px solid ${b.color}`;

        let statusText = '';
        if (b.status === 'active') {
            statusText = '<span style="color:#aaa">В полете...</span>';
        } else if (b.status === 'cashed') {
            const winSum = (b.betAmount * b.cashoutMult).toFixed(2);
            statusText = `<span style="color:#00E676; font-weight:bold;">Забрал x${b.cashoutMult.toFixed(2)} (+${winSum} ₽)</span>`;
        } else if (b.status === 'lost') {
            statusText = `<span style="color:#ff1744; font-weight:bold;">Взрыв x${b.cashoutMult.toFixed(2)}</span>`;
        }

        div.innerHTML = `
            <div class="avatar" style="background:${b.color}; color:black;">${b.name[0].toUpperCase()}</div>
            <div class="bet-info">
                <strong>${b.name}</strong>
                <span>Ставка: ${b.betAmount} ₽</span>
            </div>
            <div class="bet-chance">${statusText}</div>
        `;
        listContainer.appendChild(div);
    });
}

// Последние 10 результатов полета
function renderRocketHistory(historyList) {
    const bar = document.getElementById('rocketHistory');
    if (!bar) return;
    bar.innerHTML = '';

    if (historyList.length === 0) {
        bar.innerHTML = '<span class="rocket-hist-empty">История пуста...</span>';
        return;
    }

    const reversed = [...historyList].reverse();
    reversed.forEach(val => {
        const span = document.createElement('span');
        span.className = 'rocket-hist-item';
        
        if (val < 1.5) span.classList.add('mult-grey');
        else if (val < 5.0) span.classList.add('mult-green');
        else if (val < 20.0) span.classList.add('mult-gold');
        else span.classList.add('mult-cyan');

        span.textContent = `${val.toFixed(2)}x`;
        bar.appendChild(span);
    });
}

// ПОСТОЯННЫЙ ТАКТОВЫЙ ИНТЕРВАЛ ХОСТА
setInterval(() => {
    if (isHost()) {
        checkHostRocketLogic();
    }
}, 150);

let lastRocketStateUpdate = 0; 

// Сетевая хост-логика Ракеты V3 с самоисцелением при простаивании сайта
function checkHostRocketLogic() {
    if (!isHost()) return;

    const now = getServerTime();
    
    if (now - lastRocketStateUpdate < 200) return;

    const current = rocketState || { status: 'betting', timerEnd: 0 };
    const stateRef = db.ref('rocketStateV3');

    // ================= СИСТЕМА САМОИСЦЕЛЕНИЯ (SELF-HEALING) =================
    // Если игра находится в полете, но время полета превышает реалистичный лимит (например, 1.5 минуты),
    // или если игра в статусе взрыва уже более 15 секунд — это значит, что игра зависла, когда все вышли.
    // Хост немедленно форсирует перезапуск раундов!
    if (current.status === 'flying' && current.launchTime && (now - current.launchTime > 90000)) {
        lastRocketStateUpdate = now;
        db.ref('rocketBetsV3').remove();
        stateRef.set({
            status: 'betting',
            timerEnd: now + 10000,
            launchTime: 0,
            crashMult: 0,
            crashedTime: 0
        });
        return;
    }
    if (current.status === 'crashed' && current.crashedTime && (now - current.crashedTime > 15000)) {
        lastRocketStateUpdate = now;
        db.ref('rocketBetsV3').remove();
        stateRef.set({
            status: 'betting',
            timerEnd: now + 10000,
            launchTime: 0,
            crashMult: 0,
            crashedTime: 0
        });
        return;
    }
    // =========================================================================

    if (current.status === 'betting') {
        if (!current.timerEnd || current.timerEnd === 0) {
            lastRocketStateUpdate = now;
            stateRef.update({
                status: 'betting',
                timerEnd: now + 10000
            });
        } else if (now >= current.timerEnd) {
            lastRocketStateUpdate = now;
            
            const chosenMult = generateCrashMultiplier();

            stateRef.set({
                status: 'flying',
                launchTime: now,
                crashMult: chosenMult,
                timerEnd: 0
            });
        }
    } 
    else if (current.status === 'flying') {
        const elapsed = (now - current.launchTime) / 1000;
        if (elapsed < 0) return;
        
        const currentMult = getRocketMult(elapsed, current.crashMult);

        if (currentMult >= current.crashMult) {
            lastRocketStateUpdate = now;
            stateRef.update({
                status: 'crashed',
                crashedTime: now
            });

            db.ref('rocketHistoryV3').once('value').then((histSnap) => {
                let hList = histSnap.val() || [];
                if (!Array.isArray(hList)) hList = [];
                hList.push(current.crashMult);
                if (hList.length > 10) hList.shift();
                db.ref('rocketHistoryV3').set(hList);
            });

            db.ref('rocketBetsV3').once('value').then((betsSnap) => {
                const bets = betsSnap.val() || {};
                const updates = {};
                for (let pId in bets) {
                    if (bets[pId].status === 'active') {
                        updates[`rocketBetsV3/${pId}/status`] = 'lost';
                        updates[`rocketBetsV3/${pId}/cashoutMult`] = current.crashMult;
                    }
                }
                if (Object.keys(updates).length > 0) {
                    db.ref().update(updates);
                }
            });
        }
    } 
    else if (current.status === 'crashed') {
        if (current.crashedTime && now >= (current.crashedTime + 4000)) {
            lastRocketStateUpdate = now;
            db.ref('rocketBetsV3').remove(); 
            stateRef.set({
                status: 'betting',
                timerEnd: now + 10000,
                launchTime: 0,
                crashMult: 0,
                crashedTime: 0
            });
        }
    }
}

function launchRocket() {
    const chosenMult = generateCrashMultiplier();

    db.ref('rocketStateV3').update({
        status: 'flying',
        launchTime: getServerTime(),
        crashMult: chosenMult,
        timerEnd: 0
    });
}


// ======= ШУТОЧНЫЙ ВЫВОД СРЕДСТВ =======

window.requestWithdraw = function() {
    const card = document.getElementById('withdrawCardInput').value.trim();
    const bank = document.getElementById('withdrawBankInput').value.trim();
    const amountInput = document.getElementById('withdrawAmountInput');
    const amount = parseFloat(amountInput.value) || 0;
    
    const balance = players[myPlayerId]?.balance || 0;

    if (!card || !bank) {
        alert('Пожалуйста, заполните все поля!');
        return;
    }
    if (isNaN(amount) || amount <= 0) {
        alert('Введите корректную сумму для вывода средств!');
        return;
    }
    if (amount > balance) {
        alert(`Недостаточно средств! Ваш текущий баланс: ${parseFloat(balance.toFixed(3))} ₽`);
        return;
    }

    db.ref(`players/${myPlayerId}/balance`).transaction((current) => {
        return parseFloat(((current || 0) - amount).toFixed(3));
    }, (error, committed) => {
        if (committed) {
            alert(
                "Ваша выплата оформлена. Ждите поступление средств в течении 365 дней. " +
                "В случае, если средства не поступят, напишите в поддержку. Поддержка вам не ответит :)\n\n" +
                "Всего вам доброго!"
            );
            
            document.getElementById('withdrawCardInput').value = '';
            document.getElementById('withdrawBankInput').value = '';
            amountInput.value = '';

            showScreen('lobbyScreen');
        } else {
            alert('Ошибка выполнения транзакции вывода. Попробуйте еще раз.');
        }
    });
}


// ======= DEPOSITS AND ADMIN PANEL =======

window.openDepositModal = function() {
    document.getElementById('depositModal').style.display = 'block';
    document.getElementById('depositStep1').style.display = 'block';
    document.getElementById('depositStep2').style.display = 'none';
    document.getElementById('depositStep3').style.display = 'none';
}

window.closeDepositModal = function() {
    document.getElementById('depositModal').style.display = 'none';
}

window.goToDepositStep2 = function() {
    const amount = parseInt(document.getElementById('depositAmountInput').value);
    if (isNaN(amount) || amount < 10) {
        alert('Минимальная сумма пополнения — 10 ₽!');
        return;
    }
    document.getElementById('reqAmount').textContent = amount;
    document.getElementById('depositStep1').style.display = 'none';
    document.getElementById('depositStep2').style.display = 'block';
}

window.sendDepositRequest = function() {
    const amount = parseInt(document.getElementById('depositAmountInput').value);
    const name = (playerNameInput ? playerNameInput.value.trim() : "Без имени") || "Без имени";

    const reqRef = db.ref('deposit_requests').push();
    reqRef.set({
        id: reqRef.key,
        playerId: myPlayerId,
        playerName: name,
        amount: amount,
        status: 'pending'
    });

    document.getElementById('depositStep2').style.display = 'none';
    document.getElementById('depositStep3').style.display = 'block';
}

function initAdminPanel() {
    db.ref('deposit_requests').on('value', (snap) => {
        const requests = snap.val() || {};
        const adminList = document.getElementById('adminRequestsList');
        if (!adminList) return;
        adminList.innerHTML = '';

        const pending = Object.values(requests).filter(r => r.status === 'pending');

        if (pending.length === 0) {
            adminList.innerHTML = '<p class="no-reqs">Нет активных заявок</p>';
            return;
        }

        pending.forEach(req => {
            const item = document.createElement('div');
            item.className = 'admin-req-item';
            item.innerHTML = `
                <p>👤 <strong>${req.playerName}</strong> просит пополнить <strong>${req.amount} ₽</strong></p>
                <div class="admin-btns">
                    <button class="admin-approve-btn" onclick="approveDeposit('${req.id}', '${req.playerId}', ${req.amount})">Принять</button>
                    <button class="admin-decline-btn" onclick="declineDeposit('${req.id}')">Отклонить</button>
                </div>
            `;
            adminList.appendChild(item);
        });
    });
}

window.approveDeposit = function(reqId, playerId, amount) {
    db.ref(`players/${playerId}/balance`).transaction((current) => {
        return parseFloat(((current || 0) + amount).toFixed(3));
    });
    db.ref(`deposit_requests/${reqId}`).remove();
}

window.declineDeposit = function(reqId) {
    db.ref(`deposit_requests/${reqId}`).remove();
}

function calculateTotalBank() {
    return Object.values(players).reduce((acc, p) => acc + (p.totalBet || 0), 0);
}

function renderBets() {
    if (!betList) return;
    const active = Object.values(players).filter(p => p.totalBet > 0).sort((a, b) => b.totalBet - a.totalBet);
    const totalB = calculateTotalBank();

    betList.innerHTML = '';
    if (active.length === 0) {
        betList.innerHTML = '<div class="bet-placeholder">Пока нет ставок...</div>';
        return;
    }

    active.forEach(p => {
        const percentage = ((p.totalBet / totalB) * 100).toFixed(1);

        const item = document.createElement('div');
        item.className = 'bet-item';
        item.style.borderLeft = `4px solid ${p.color}`;
        item.innerHTML = `
            <div class="avatar" style="background:${p.color}">${p.name[0].toUpperCase()}</div>
            <div class="bet-info">
                <strong>${p.name}</strong> 
                <span>${p.totalBet} ₽</span>
            </div>
            <div class="bet-chance">${percentage}%</div>
        `;
        betList.appendChild(item);
    });
      }
