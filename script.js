let game = new Chess();
let boardEl = document.getElementById('board');
let selectedSquare = null;

// Game State
let localName = "";
let oppName = "Opponent";
let myColor = 'w'; 
let isNetworkGame = false;
let aiDifficulty = 1;
let previousTurn = null;

// Easter Egg State
let sumitBestMove = null;

// Network State
let peer = null;
let conn = null;

const pieceMap = { 'p': '♟', 'r': '♜', 'n': '♞', 'b': '♝', 'q': '♛', 'k': '♚' };

// --- Universal Toast System ---
let toastTimeout;
function showToast(message, type = 'info', duration = 2500) {
    let toast = document.getElementById('app-toast');
    if (!toast) return;
    toast.innerText = message;
    toast.className = `toast show ${type}`;
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
        toast.classList.remove('show');
    }, duration);
}

// --- Navigation ---
function showPanel(id) {
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    document.getElementById(id).classList.add('active');
}

function getLocalName() {
    let nameInput = document.getElementById('playerName').value.trim();
    return nameInput || "Player";
}

// --- AI Setup ---
function startAIGame(difficulty) {
    localName = getLocalName();
    oppName = "AI (Bot)";
    myColor = 'w';
    isNetworkGame = false;
    aiDifficulty = difficulty;
    previousTurn = null;
    initGameUI();
}

// --- P2P Network Setup (PeerJS) ---
function generateShortID() {
    return Math.random().toString(36).substring(2, 7).toUpperCase();
}

function copyRoomCode() {
    let code = document.getElementById('room-code-display').innerText;
    if(code && code !== "Connecting...") {
        navigator.clipboard.writeText(code).then(() => {
            showToast("Code Copied!", "success", 1500);
        });
    }
}

function setupPeer() {
    if (peer) peer.destroy();
    let peerId = generateShortID();
    peer = new Peer(peerId, { debug: 2 }); 
    return peerId;
}

function showHostScreen() {
    localName = getLocalName();
    showPanel('host-screen');
    let peerId = setupPeer();
    
    peer.on('open', (id) => {
        document.getElementById('room-code-display').innerText = id;
    });

    peer.on('connection', (connection) => {
        conn = connection;
        myColor = 'w'; // Host is always white
        setupConnectionHandlers();
    });
}

function showJoinScreen() {
    localName = getLocalName();
    showPanel('join-screen');
    document.getElementById('join-status').innerText = "";
}

function joinGame() {
    let hostId = document.getElementById('join-code').value.trim().toUpperCase();
    if (!hostId) return;

    document.getElementById('join-status').innerText = "Connecting...";
    let peerId = setupPeer();

    peer.on('open', () => {
        conn = peer.connect(hostId, { reliable: true });
        myColor = 'b'; // Joiner is always black
        setupConnectionHandlers();
    });
    
    peer.on('error', (err) => {
        document.getElementById('join-status').innerText = "Connection failed.";
        showToast("Connection failed. Check Code.", "error", 3000);
    });
}

function setupConnectionHandlers() {
    conn.on('open', () => {
        isNetworkGame = true;
        previousTurn = null;
        conn.send({ type: 'name', data: localName });
    });

    conn.on('data', (payload) => {
        if (payload.type === 'name') {
            oppName = payload.data || "Opponent";
            initGameUI(); 
        } else if (payload.type === 'move') {
            game.move(payload.data);
            finishTurn(false); 
        }
    });

    conn.on('close', () => {
        if (!game.game_over()) {
            showToast(`You Won! ${oppName} Fled.`, 'success', 3000);
            setTimeout(() => {
                quitGame();
            }, 3000);
        } else {
            quitGame();
        }
    });
}

function cancelNetwork() {
    if (peer) peer.destroy();
    showPanel('menu');
}

function quitGame() {
    if (peer) peer.destroy();
    game.reset();
    sumitBestMove = null;
    previousTurn = null;
    showPanel('menu');
}

// --- Ray-Casting Attacker Detection (For the Red Pulse) ---
function getCheckingSquares() {
    if (!game.in_check()) return [];
    
    let kingSq = null;
    let oppColor = game.turn() === 'w' ? 'b' : 'w';

    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            let sq = String.fromCharCode(97 + c) + (8 - r);
            let p = game.get(sq);
            if (p && p.type === 'k' && p.color === game.turn()) kingSq = sq;
        }
    }
    if (!kingSq) return [];

    let attackers = [];
    const board = game.board();
    let tr = 8 - parseInt(kingSq[1]);
    let tc = kingSq.charCodeAt(0) - 97;

    const knightMoves = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
    knightMoves.forEach(m => {
        let r = tr + m[0], c = tc + m[1];
        if (r >= 0 && r < 8 && c >= 0 && c < 8) {
            let p = board[r][c];
            if (p && p.color === oppColor && p.type === 'n') attackers.push(String.fromCharCode(97 + c) + (8 - r));
        }
    });

    let pawnDir = oppColor === 'w' ? 1 : -1;
    let pr = tr + pawnDir;
    [tc - 1, tc + 1].forEach(pc => {
        if (pr >= 0 && pr < 8 && pc >= 0 && pc < 8) {
            let p = board[pr][pc];
            if (p && p.color === oppColor && p.type === 'p') attackers.push(String.fromCharCode(97 + pc) + (8 - pr));
        }
    });

    const dirs = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
    dirs.forEach(d => {
        for (let step = 1; step < 8; step++) {
            let r = tr + d[0] * step, c = tc + d[1] * step;
            if (r < 0 || r >= 8 || c < 0 || c >= 8) break;
            let p = board[r][c];
            if (p) {
                if (p.color === oppColor) {
                    let isDiag = d[0] !== 0 && d[1] !== 0;
                    let isStraight = d[0] === 0 || d[1] === 0;
                    if (p.type === 'q' || (p.type === 'b' && isDiag) || (p.type === 'r' && isStraight)) {
                        attackers.push(String.fromCharCode(97 + c) + (8 - r));
                    }
                }
                break;
            }
        }
    });
    return attackers;
}

// --- Core Game UI ---
function initGameUI() {
    showPanel('game-screen');
    document.getElementById('my-name').innerText = localName;
    document.getElementById('opp-name').innerText = oppName;
    game.reset();
    renderBoard();
    updateStatus();
    
    if (!isNetworkGame && myColor === 'b') {
        setTimeout(() => makeAIMove(aiDifficulty), 500);
    } else {
        checkSumitSuggestion();
    }
}

function renderBoard() {
    let history = game.history({ verbose: true });
    let lastMove = history.length > 0 ? history[history.length - 1] : null;
    let checkingSquares = getCheckingSquares();

    if (boardEl.children.length === 0) {
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                let sq = document.createElement('div');
                let isLight = (r + c) % 2 === 0;
                sq.className = `square ${isLight ? 'light' : 'dark'}`;
                let algebraic = String.fromCharCode(97 + c) + (8 - r);
                sq.dataset.sq = algebraic;
                sq.addEventListener('click', () => handleSquareClick(algebraic));
                boardEl.appendChild(sq);
            }
        }
    }

    if (myColor === 'b') {
        boardEl.classList.add('flipped-board');
    } else {
        boardEl.classList.remove('flipped-board');
    }

    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            let algebraic = String.fromCharCode(97 + c) + (8 - r);
            let sq = document.querySelector(`[data-sq="${algebraic}"]`);
            
            let isLight = (r + c) % 2 === 0;
            sq.className = `square ${isLight ? 'light' : 'dark'}`; 
            sq.innerHTML = '';
            
            if (lastMove && (algebraic === lastMove.from || algebraic === lastMove.to)) {
                sq.classList.add('last-move');
            }

            if (checkingSquares.includes(algebraic)) {
                sq.classList.add('checking-piece');
            }

            let piece = game.board()[r][c];
            if (piece) {
                let pSpan = document.createElement('span');
                pSpan.className = `piece ${piece.color}`;
                pSpan.innerText = pieceMap[piece.type];
                
                if (myColor === 'b') {
                    pSpan.classList.add('flipped');
                }
                sq.appendChild(pSpan);
            }
        }
    }
}

function isMyTurn() {
    return game.turn() === myColor;
}

function handleSquareClick(sq) {
    if (game.game_over() || !isMyTurn()) return;

    if (sumitBestMove && (sq === sumitBestMove.from || sq === sumitBestMove.to)) {
        game.move(sumitBestMove.san);
        selectedSquare = null;
        sumitBestMove = null;
        finishTurn(true); 
        return;
    }

    if (selectedSquare) {
        let moves = game.moves({ square: selectedSquare, verbose: true });
        let move = moves.find(m => m.to === sq);

        if (move) {
            game.move(move.san);
            selectedSquare = null;
            finishTurn(true); 
        } else {
            let piece = game.get(sq);
            if (piece && piece.color === game.turn()) {
                selectedSquare = sq;
                highlightMoves(sq);
            } else {
                selectedSquare = null;
                renderBoard();
                checkSumitSuggestion();
            }
        }
    } else {
        let piece = game.get(sq);
        if (piece && piece.color === game.turn()) {
            selectedSquare = sq;
            highlightMoves(sq);
        }
    }
}

function highlightMoves(sq) {
    renderBoard(); 
    let moves = game.moves({ square: sq, verbose: true });
    
    document.querySelector(`[data-sq="${sq}"]`).classList.add('selected');
    
    moves.forEach(m => {
        let el = document.querySelector(`[data-sq="${m.to}"]`);
        if (el) {
            if (m.flags.includes('c') || m.flags.includes('e')) {
                el.classList.add('hint-capture');
            } else {
                el.classList.add('hint');
            }
        }
    });

    checkSumitSuggestion();
}

function finishTurn(didIMakeMove) {
    renderBoard();
    updateStatus();

    if (didIMakeMove && isNetworkGame && conn) {
        let history = game.history();
        conn.send({ type: 'move', data: history[history.length - 1] });
    }

    if (!game.game_over()) {
        if (!isNetworkGame && !isMyTurn()) {
            setTimeout(() => makeAIMove(aiDifficulty), 600);
        } else if (isMyTurn()) {
            checkSumitSuggestion();
        }
    }
}

function showTurnToast() {
    let toast = document.getElementById('app-toast');
    toast.classList.remove('show');
    void toast.offsetWidth; 
    showToast("Your Turn!", "info", 1500);
}

function updateStatus() {
    let statusText = document.getElementById('game-status-text');
    let myInd = document.getElementById('my-status');
    let oppInd = document.getElementById('opp-status');

    if (game.in_checkmate()) {
        statusText.innerText = `Checkmate! ${isMyTurn() ? oppName : "You"} win!`;
        statusText.classList.add('check-text');
        myInd.className = 'indicator'; oppInd.className = 'indicator';
        
        if (previousTurn !== game.turn()) {
            showToast(`Checkmate! ${isMyTurn() ? oppName : "You"} win!`, isMyTurn() ? 'error' : 'success', 4000);
        }
    } else if (game.in_draw() || game.in_stalemate()) {
        statusText.innerText = "Game drawn!";
        statusText.classList.remove('check-text');
        myInd.className = 'indicator'; oppInd.className = 'indicator';
        
        if (previousTurn !== game.turn()) showToast("Game Drawn!", "info", 4000);
    } else {
        let isCheck = game.in_check();
        let checkTxt = isCheck ? " (Check!)" : "";
        
        if (isCheck) {
            statusText.classList.add('check-text');
            if (previousTurn !== game.turn()) showToast("Check!", "error", 1500);
        } else {
            statusText.classList.remove('check-text');
        }

        if (isMyTurn()) {
            statusText.innerText = "Your turn" + checkTxt;
            myInd.classList.add('active-turn');
            oppInd.classList.remove('active-turn');
            
            if (!isCheck && previousTurn !== myColor && previousTurn !== null) showTurnToast();
        } else {
            statusText.innerText = `${oppName}'s turn` + checkTxt;
            oppInd.classList.add('active-turn');
            myInd.classList.remove('active-turn');
        }
    }
    previousTurn = game.turn();
}

// --- Sumit Easter Egg (Minimax Depth 4) ---
function isSumit() {
    return localName.toLowerCase() === 'sumit';
}

function checkSumitSuggestion() {
    document.querySelectorAll('.sumit-suggestion-from').forEach(el => el.classList.remove('sumit-suggestion-from'));
    document.querySelectorAll('.sumit-suggestion-to').forEach(el => el.classList.remove('sumit-suggestion-to'));
    sumitBestMove = null;

    if (isSumit() && isMyTurn() && !game.game_over()) {
        let bestMoveInfo = minimaxRoot(4, game, true);

        if (bestMoveInfo && bestMoveInfo.move) {
            sumitBestMove = bestMoveInfo.move;
            let fromEl = document.querySelector(`[data-sq="${sumitBestMove.from}"]`);
            let toEl = document.querySelector(`[data-sq="${sumitBestMove.to}"]`);
            
            if (fromEl) fromEl.classList.add('sumit-suggestion-from');
            if (toEl) toEl.classList.add('sumit-suggestion-to');
        }
    }
}

// --- Advanced AI Engine Logic ---
function minimaxRoot(depth, game, isMaximizingPlayer) {
    let newGameMoves = game.moves({ verbose: true });
    let bestMove = -99999;
    let bestMoveFound;

    for (let i = 0; i < newGameMoves.length; i++) {
        let newGameMove = newGameMoves[i];
        game.move(newGameMove.san);
        let value = minimax(depth - 1, game, -100000, 100000, !isMaximizingPlayer);
        game.undo();
        
        if (value >= bestMove) {
            bestMove = value;
            bestMoveFound = newGameMove;
        }
    }
    return { move: bestMoveFound, score: bestMove };
}

function minimax(depth, game, alpha, beta, isMaximizingPlayer) {
    if (depth === 0 || game.game_over()) return evaluateBoard(game);
    let newGameMoves = game.moves({ verbose: true });

    if (isMaximizingPlayer) {
        let bestMove = -99999;
        for (let i = 0; i < newGameMoves.length; i++) {
            game.move(newGameMoves[i].san);
            bestMove = Math.max(bestMove, minimax(depth - 1, game, alpha, beta, !isMaximizingPlayer));
            game.undo();
            alpha = Math.max(alpha, bestMove);
            if (beta <= alpha) return bestMove;
        }
        return bestMove;
    } else {
        let bestMove = 99999;
        for (let i = 0; i < newGameMoves.length; i++) {
            game.move(newGameMoves[i].san);
            bestMove = Math.min(bestMove, minimax(depth - 1, game, alpha, beta, !isMaximizingPlayer));
            game.undo();
            beta = Math.min(beta, bestMove);
            if (beta <= alpha) return bestMove;
        }
        return bestMove;
    }
}

const pieceValues = { 'p': 100, 'n': 320, 'b': 330, 'r': 500, 'q': 900, 'k': 20000 };

const pawnEval = [[0,0,0,0,0,0,0,0],[50,50,50,50,50,50,50,50],[10,10,20,30,30,20,10,10],[5,5,10,25,25,10,5,5],[0,0,0,20,20,0,0,0],[5,-5,-10,0,0,-10,-5,5],[5,10,10,-20,-20,10,10,5],[0,0,0,0,0,0,0,0]];
const knightEval = [[-50,-40,-30,-30,-30,-30,-40,-50],[-40,-20,0,0,0,0,-20,-40],[-30,0,10,15,15,10,0,-30],[-30,5,15,20,20,15,5,-30],[-30,0,15,20,20,15,0,-30],[-30,5,10,15,15,10,5,-30],[-40,-20,0,5,5,0,-20,-40],[-50,-40,-30,-30,-30,-30,-40,-50]];
const centerEval = [[-20,-10,-10,-10,-10,-10,-10,-20],[-10,0,0,0,0,0,0,-10],[-10,0,5,10,10,5,0,-10],[-10,0,10,20,20,10,0,-10],[-10,0,10,20,20,10,0,-10],[-10,0,5,10,10,5,0,-10],[-10,0,0,0,0,0,0,-10],[-20,-10,-10,-10,-10,-10,-10,-20]];

function getPositionalBonus(piece, row, col) {
    let r = piece.color === 'w' ? row : 7 - row;
    if (piece.type === 'p') return pawnEval[r][col];
    if (piece.type === 'n') return knightEval[r][col];
    if (piece.type === 'b' || piece.type === 'q') return centerEval[r][col];
    return 0; 
}

function evaluateBoard(gameObj) {
    let totalEvaluation = 0;
    let boardState = gameObj.board();

    if (gameObj.in_checkmate()) {
        return gameObj.turn() === myColor ? -100000 : 100000;
    }
    if (gameObj.in_draw() || gameObj.in_stalemate() || gameObj.in_threefold_repetition()) {
        return -50000; 
    }

    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            let piece = boardState[r][c];
            if (piece) {
                let value = pieceValues[piece.type] + getPositionalBonus(piece, r, c);
                if (piece.color === myColor) {
                    totalEvaluation += value;
                } else {
                    totalEvaluation -= value;
                }
            }
        }
    }
    return totalEvaluation;
}

function makeAIMove(difficulty) {
    if (game.game_over()) return;
    let moves = game.moves({ verbose: true });
    let bestMove = null;

    if (difficulty === 1) {
        bestMove = moves[Math.floor(Math.random() * moves.length)];
    } else if (difficulty === 2) {
        let captures = moves.filter(m => m.flags.includes('c'));
        bestMove = captures.length > 0 ? captures[Math.floor(Math.random() * captures.length)] : moves[Math.floor(Math.random() * moves.length)];
    } else {
        let bestScore = Infinity; 
        for (let i = 0; i < moves.length; i++) {
            game.move(moves[i].san);
            let score = evaluateBoard(game);
            game.undo();
            if (score < bestScore) {
                bestScore = score;
                bestMove = moves[i];
            }
        }
    }

    if (bestMove) {
        game.move(bestMove.san);
        finishTurn(false);
    }
}

// --- PWA Setup ---
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch(err => console.log('SW setup failed'));
    });
}
