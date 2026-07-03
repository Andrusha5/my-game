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

// ======= ПЕРЕМЕННЫЕ ИГРЫ "ВЗЛЕТ РАКЕТЫ" =======
let rocketGameActive = false; // Ставил ли локальный игрок ставку в этом раунде
let rocketMyBet = 0;         // Сумма ставки локального игрока
let rocketIsCashed = false;   // Забрал ли локальный игрок выигрыш
let rocketState = { status: 'betting', timerEnd: 0 };
let rocketLoopId = null;

// DOM элементы
let bettingTimerDisplay, totalBankDisplay, gameCanvas, gameAreaWrapper, ball, playerNameInput, betAmountInput, placeBetButton, betList, historyList, gameMessage;

function getServerTime() {
    return Date.now() + serverOffset;
}

function isHost() {
    if (onlinePlayers.length === 0) return false;
    return onlinePlayers[0] === myPlayerId;
}

window.showScreen = function(screenId) {
    document.getElementById('lobbyScreen').style.display = 'none';
    document.getElementById('multiplayerGameScreen').style.display = 'none';
    document.getElementById('singleplayerGameScreen').style.display = 'none';
    document.getElementById('coinGameScreen').style.display = 'none';
    document.getElementById('minesGameScreen').style.display = 'none';
    document.getElementById('impMinesGameScreen').style.display = 'none';
    document.getElementById('rocketGameScreen').style.display = 'none';
    
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
                document.getElementById('myBalance').textContent = me.balance || 0;
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

    // ======= СЛУШАТЕЛИ ДЛЯ РАКЕТЫ =======
    db.ref('rocketState').on('value', (snapshot) => {
        rocketState = snapshot.val() || { status: 'betting', timerEnd: 0 };
        syncRocketState();
    });

    db.ref('rocketBets').on('value', (snapshot) => {
        renderRocketBets(snapshot.val() || {});
    });

    db.ref('rocketHistory').on('value', (snapshot) => {
        renderRocketHistory(snapshot.val() || []);
    });

    selectSpPercent(50);
    renderMinesGrid();
    initImpMinesUI();

    const impBetInput = document.getElementById('impBetInput');
    if (impBetInput) {
        impBetInput.addEventListener('input', updateImpMinesLabels);
    }
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
        return (current || 0) - bet;
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
                        return (current || 0) + prize;
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
        return (current || 0) - bet;
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
            return (current || 0) + winnings;
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
        return (current || 0) - bet;
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
            return (current || 0) + winnings;
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
        return (current || 0) - bet;
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
            return (current || 0) + prize;
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

    const newBalance = myCurrentBalance - amount;
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
    checkHostRocketLogic(); // Дополнительно вызываем проверку хоста для Ракеты

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
            return (current || 0) + finalPrize;
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

// ======= ИГРА 6: ВЗЛЕТ РАКЕТЫ (ЛОГИКА MULTIPLAYER CRASH) =======

// Синхронизация состояния ракеты из Firebase
function syncRocketState() {
    const status = rocketState.status || 'betting';
    const timerOverlay = document.getElementById('rocketTimerOverlay');
    const rocketActor = document.getElementById('rocketActor');
    const multDisp = document.getElementById('rocketMultiplierDisplay');
    const explosion = document.getElementById('rocketExplosion');
    const msg = document.getElementById('rocketMessage');

    const betBtn = document.getElementById('rocketBetBtn');
    const cashoutBtn = document.getElementById('rocketCashoutBtn');
    const betInput = document.getElementById('rocketBetInput');

    const stars = document.querySelector('.stars-container');

    if (status === 'betting') {
        if (rocketLoopId) {
            cancelAnimationFrame(rocketLoopId);
            rocketLoopId = null;
        }

        // Подготовка UI перед взлетом
        if (explosion) explosion.style.display = 'none';
        if (rocketActor) {
            rocketActor.style.display = 'block';
            rocketActor.style.bottom = '20px';
            rocketActor.style.transform = 'none';
        }
        if (multDisp) multDisp.style.display = 'none';
        if (timerOverlay) timerOverlay.style.display = 'block';
        if (stars) stars.style.animationDuration = '3s';

        // Кнопки управления в фазе ожидания
        if (betInput) betInput.disabled = false;
        if (betBtn) betBtn.disabled = rocketGameActive; // Блокируем кнопку, если ставка уже сделана
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
        if (rocketActor) rocketActor.style.display = 'block';

        if (betBtn) betBtn.disabled = true;
        if (betInput) betInput.disabled = true;

        if (msg) {
            msg.textContent = 'Ракета летит вверх!';
            msg.style.color = '#00E5FF';
        }

        // Запуск локального анимированного цикла полета
        startRocketFlightAnimation(rocketState.launchTime);
    } 
    else if (status === 'crashed') {
        if (rocketLoopId) {
            cancelAnimationFrame(rocketLoopId);
            rocketLoopId = null;
        }

        if (timerOverlay) timerOverlay.style.display = 'none';
        if (rocketActor) rocketActor.style.display = 'none';
        if (explosion) explosion.style.display = 'block';

        if (multDisp) {
            multDisp.style.display = 'block';
            multDisp.textContent = `${rocketState.crashMult.toFixed(2)}x`;
            multDisp.style.color = '#ff1744';
            multDisp.style.textShadow = '0 0 20px rgba(255, 23, 68, 0.8)';
        }

        if (betBtn) betBtn.disabled = true;
        if (cashoutBtn) {
            cashoutBtn.disabled = true;
            cashoutBtn.textContent = 'ВЗРЫВ!';
        }

        if (msg) {
            msg.innerHTML = `💥 Ракета взорвалась на <span style="color:#ff1744; font-weight:bold;">${rocketState.crashMult.toFixed(2)}x</span>`;
        }

        // Сброс локального статуса раунда
        rocketGameActive = false;
        rocketMyBet = 0;
        rocketIsCashed = false;
    }
}

// Таймер обратного отсчета фазы ставок
function startRocketBettingTimer(timerEnd) {
    const timerOverlay = document.getElementById('rocketTimerOverlay');
    const msg = document.getElementById('rocketMessage');

    const interval = setInterval(() => {
        const now = getServerTime();
        const timeLeft = Math.max(0, (timerEnd - now) / 1000);
        
        if (timerOverlay) timerOverlay.textContent = timeLeft.toFixed(1);

        if (rocketState.status !== 'betting') {
            clearInterval(interval);
            return;
        }

        if (msg && !rocketGameActive) {
            msg.textContent = `Успейте поставить! До старта: ${timeLeft.toFixed(1)}с`;
            msg.style.color = '#D500F9';
        }

        if (timeLeft <= 0) {
            clearInterval(interval);
            if (isHost() && rocketState.status === 'betting') {
                launchRocket();
            }
        }
    }, 100);
}

// Запуск ракетного рендеринга полета и набора высоты
function startRocketFlightAnimation(launchTime) {
    const stars = document.querySelector('.stars-container');
    const rocketActor = document.getElementById('rocketActor');
    const multDisp = document.getElementById('rocketMultiplierDisplay');
    const cashoutBtn = document.getElementById('rocketCashoutBtn');

    if (multDisp) multDisp.style.display = 'block';

    function tick() {
        const now = getServerTime();
        const elapsed = (now - launchTime) / 1000;
        
        if (elapsed < 0) {
            rocketLoopId = requestAnimationFrame(tick);
            return;
        }

        // Детерминированная формула роста коэффициента для идеальной синхронизации
        const currentMult = Math.exp(elapsed * 0.07);

        if (multDisp && rocketState.status === 'flying') {
            multDisp.textContent = `${currentMult.toFixed(2)}x`;
            multDisp.style.color = '#00FF88';
            multDisp.style.textShadow = '0 0 20px rgba(0, 255, 136, 0.8)';
        }

        // Визуальный полет ракеты вверх и легкое дрожание
        if (rocketActor) {
            const verticalPos = Math.min(130, 20 + elapsed * 12);
            const shake = Math.sin(now * 0.1) * 3;
            rocketActor.style.bottom = `${verticalPos}px`;
            rocketActor.style.transform = `translateX(${shake}px) rotate(${Math.sin(now * 0.05) * 4}deg)`;
        }

        // Ускорение полета звездного неба по мере набора скорости
        if (stars) {
            const animSpeed = Math.max(0.15, 3 / (1 + elapsed * 0.15));
            stars.style.animationDuration = `${animSpeed}s`;
        }

        // Живой апдейт суммы на кнопке локального обналичивания
        if (rocketGameActive && !rocketIsCashed && cashoutBtn && rocketState.status === 'flying') {
            const potentialWin = Math.floor(rocketMyBet * currentMult);
            cashoutBtn.disabled = false;
            cashoutBtn.textContent = `Забрать ${potentialWin} ₽`;
        }

        if (rocketState.status === 'flying') {
            rocketLoopId = requestAnimationFrame(tick);
        }
    }
    rocketLoopId = requestAnimationFrame(tick);
}

// Размещение ставки на Ракету
window.placeRocketBet = function() {
    if (rocketState.status !== 'betting') {
        alert('Раунд уже идет! Дождитесь следующего раунда.');
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
        alert('Недостаточно средств на балансе!');
        return;
    }

    const betBtn = document.getElementById('rocketBetBtn');
    if (betBtn) betBtn.disabled = true;

    db.ref(`players/${myPlayerId}/balance`).transaction((current) => {
        return (current || 0) - amount;
    }, (error, committed) => {
        if (committed) {
            rocketGameActive = true;
            rocketMyBet = amount;
            rocketIsCashed = false;

            const myData = players[myPlayerId] || { name: 'Игрок', color: '#BA68C8' };
            db.ref(`rocketBets/${myPlayerId}`).set({
                name: myData.name || "Игрок",
                betAmount: amount,
                cashoutMult: 0,
                status: 'active',
                color: myData.color || '#BA68C8'
            });

            const msg = document.getElementById('rocketMessage');
            if (msg) {
                msg.textContent = 'Ставка принята! Ждем старта...';
                msg.style.color = '#00FF88';
            }
        } else {
            if (betBtn) betBtn.disabled = false;
            alert('Ошибка выполнения транзакции.');
        }
    });
}

// Забрать выигрыш во время полета ракеты
window.cashoutRocket = function() {
    if (!rocketGameActive || rocketIsCashed || rocketState.status !== 'flying') return;

    const now = getServerTime();
    const elapsed = (now - rocketState.launchTime) / 1000;
    const currentMult = parseFloat(Math.exp(elapsed * 0.07).toFixed(2));

    if (currentMult >= rocketState.crashMult) {
        alert('Не успели! Ракета уже взорвалась.');
        return;
    }

    rocketIsCashed = true;
    const cashoutBtn = document.getElementById('rocketCashoutBtn');
    if (cashoutBtn) cashoutBtn.disabled = true;

    const winnings = Math.floor(rocketMyBet * currentMult);

    db.ref(`players/${myPlayerId}/balance`).transaction((current) => {
        return (current || 0) + winnings;
    }, (error, committed) => {
        if (committed) {
            db.ref(`rocketBets/${myPlayerId}`).update({
                status: 'cashed',
                cashoutMult: currentMult
            });

            const msg = document.getElementById('rocketMessage');
            if (msg) {
                msg.innerHTML = `🎉 Забрали <span class="win-color">+${winnings} ₽</span> (на x${currentMult})`;
                msg.style.color = '#00FF88';
            }
        } else {
            rocketIsCashed = false;
            if (cashoutBtn) cashoutBtn.disabled = false;
            alert('Не удалось забрать деньги. Ошибка связи.');
        }
    });
}

// Отрисовка списка ставок игроков текущего раунда
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
            const winSum = Math.floor(b.betAmount * b.cashoutMult);
            statusText = `<span style="color:#00E676; font-weight:bold;">Забрал x${b.cashoutMult.toFixed(2)} (+${winSum} ₽)</span>`;
        } else if (b.status === 'lost') {
            statusText = `<span style="color:#ff1744; font-weight:bold;">Не успел (Взрыв x${b.cashoutMult.toFixed(2)})</span>`;
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

// Отображение ленты последних 10 улетевших ракет
function renderRocketHistory(historyList) {
    const bar = document.getElementById('rocketHistory');
    if (!bar) return;
    bar.innerHTML = '';

    if (historyList.length === 0) {
        bar.innerHTML = '<span class="rocket-hist-empty">История пуста...</span>';
        return;
    }

    // Показываем последние коэффициенты справа налево (самый свежий — первый)
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

// ======= ХОСТ-ЛОГИКА ДЛЯ РАКЕТЫ =======
function checkHostRocketLogic() {
    if (!isHost()) return;

    const now = getServerTime();
    const stateRef = db.ref('rocketState');

    stateRef.once('value').then((snap) => {
        const current = snap.val() || { status: 'betting', timerEnd: 0 };
        
        if (current.status === 'betting') {
            // Если таймер не задан или сброшен — запускаем фазу ставок на 10 сек
            if (!current.timerEnd || current.timerEnd === 0) {
                stateRef.update({
                    status: 'betting',
                    timerEnd: now + 10000 
                });
            } else if (now >= current.timerEnd) {
                // Время ожидания истекло — запускаем ракету!
                // Случайный предел краша в диапазоне от 1.00 до 333.00
                let randVal = Math.random();
                let chosenMult = 1.00;

                if (randVal < 0.08) {
                    chosenMult = 1.00; // 8% мгновенный взрыв (краш на 1.0x)
                } else {
                    // Логарифмический взлет (высокие числа выпадают пропорционально реже)
                    chosenMult = 1.01 + Math.pow(Math.random(), 3) * 331.99;
                }
                chosenMult = parseFloat(chosenMult.toFixed(2));

                stateRef.update({
                    status: 'flying',
                    launchTime: now,
                    crashMult: chosenMult,
                    timerEnd: 0
                });
            }
        } 
        else if (current.status === 'flying') {
            const elapsed = (now - current.launchTime) / 1000;
            const currentMult = Math.exp(elapsed * 0.07);

            if (currentMult >= current.crashMult) {
                // Ракета взрывается! Переходим в состояние краша
                stateRef.update({
                    status: 'crashed',
                    crashedTime: now
                });

                // Пишем результат взрыва в глобальную историю
                db.ref('rocketHistory').once('value', (histSnap) => {
                    let hList = histSnap.val() || [];
                    if (!Array.isArray(hList)) hList = [];
                    hList.push(current.crashMult);
                    if (hList.length > 10) hList.shift();
                    db.ref('rocketHistory').set(hList);
                });

                // Всех игроков, кто не забрал средства в полете, помечаем проигравшими
                db.ref('rocketBets').once('value', (betsSnap) => {
                    const bets = betsSnap.val() || {};
                    for (let pId in bets) {
                        if (bets[pId].status === 'active') {
                            db.ref(`rocketBets/${pId}`).update({
                                status: 'lost',
                                cashoutMult: current.crashMult
                            });
                        }
                    }
                });
            }
        } 
        else if (current.status === 'crashed') {
            // Ожидание 4 секунды в точке взрыва и рестарт комнаты
            if (now >= (current.crashedTime + 4000)) {
                db.ref('rocketBets').remove(); // очищаем ставки игроков
                stateRef.update({
                    status: 'betting',
                    timerEnd: now + 10000,
                    launchTime: 0,
                    crashMult: 0,
                    crashedTime: 0
                });
            }
        }
    });
}

function launchRocket() {
    // Внутренний хелпер перехода на взлет
    db.ref('rocketState').update({
        status: 'flying',
        launchTime: getServerTime(),
        timerEnd: 0
    });
}

// ======= ДЕПОЗИТЫ И АДМИНКА =======

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
        return (current || 0) + amount;
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
