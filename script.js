let game = new Chess();
let boardEl = document.getElementById('board');
let selectedSquare = null;
let mode = 'local'; // 'local' or 'ai'
let aiDifficulty = 1;
let p1Name = "";
let p2Name = "";

const pieceMap = {
    'p': '♟', 'r': '♜', 'n': '♞', 'b': '♝', 'q': '♛', 'k': '♚'
};

function showNetworkMenu() {
    document.querySelectorAll('.glass-panel').forEach(p => p.classList.remove('active'));
    document.getElementById('network-menu').classList.add('active');
}

function startGame(selectedMode, difficulty = 1) {
    mode = selectedMode;
    aiDifficulty = difficulty;
    p1Name = document.getElementById('player1').value.trim() || 'White';
    p2Name = mode === 'ai' ? 'AI' : (document.getElementById('player2').value.trim() || 'Black');
    
    document.querySelectorAll('.glass-panel').forEach(p => p.classList.remove('active'));
    document.getElementById('game-screen').classList.add('active');
    
    game.reset();
    renderBoard();
    updateStatus();
    checkSumitTurn();
}

function renderBoard() {
    boardEl.innerHTML = '';
    const board = game.board(); // Returns 8x8 array

    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            let squareDiv = document.createElement('div');
            let isLight = (r + c) % 2 === 0;
            squareDiv.className = `square ${isLight ? 'light' : 'dark'}`;
            
            // algebraic notation (e.g., 'a8', 'e4')
            let squareAlgebraic = String.fromCharCode(97 + c) + (8 - r);
            squareDiv.dataset.sq = squareAlgebraic;
            
            let piece = board[r][c];
            if (piece) {
                let pSpan = document.createElement('span');
                pSpan.className = `piece ${piece.color}`;
                pSpan.innerText = pieceMap[piece.type];
                squareDiv.appendChild(pSpan);
            }

            squareDiv.addEventListener('click', () => handleSquareClick(squareAlgebraic));
            boardEl.appendChild(squareDiv);
        }
    }
}

function handleSquareClick(sq) {
    if (game.game_over()) return;

    // Prevent human interaction if it's AI's turn or Sumit is auto-playing
    if (isAITurn() || isSumitTurn()) return;

    if (selectedSquare) {
        let moves = game.moves({ square: selectedSquare, verbose: true });
        let move = moves.find(m => m.to === sq);

        if (move) {
            game.move(move.san);
            selectedSquare = null;
            finishTurn();
        } else {
            // Selected a different piece of own color
            let piece = game.get(sq);
            if (piece && piece.color === game.turn()) {
                selectedSquare = sq;
                highlightMoves(sq);
            } else {
                selectedSquare = null;
                renderBoard();
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
    renderBoard(); // reset previous highlights
    let moves = game.moves({ square: sq, verbose: true });
    
    // Highlight selected
    document.querySelector(`[data-sq="${sq}"]`).classList.add('selected');
    
    // Highlight legal moves
    moves.forEach(m => {
        let el = document.querySelector(`[data-sq="${m.to}"]`);
        if (el) el.classList.add('hint');
    });
}

function finishTurn() {
    renderBoard();
    updateStatus();
    if (!game.game_over()) {
        if (isSumitTurn()) {
            setTimeout(() => makeAIMove(3), 600); // Sumit plays at Max difficulty implicitly
        } else if (isAITurn()) {
            setTimeout(() => makeAIMove(aiDifficulty), 600);
        }
    }
}

function isAITurn() {
    return mode === 'ai' && game.turn() === 'b';
}

function isSumitTurn() {
    let currentName = game.turn() === 'w' ? p1Name.toLowerCase() : p2Name.toLowerCase();
    return currentName === 'sumit';
}

function checkSumitTurn() {
    if (isSumitTurn()) {
        setTimeout(() => makeAIMove(3), 600);
    }
}

function updateStatus() {
    let statusEl = document.getElementById('status');
    let turnName = game.turn() === 'w' ? p1Name : p2Name;
    
    if (game.in_checkmate()) {
        statusEl.innerText = `Checkmate! ${game.turn() === 'w' ? p2Name : p1Name} wins.`;
    } else if (game.in_draw() || game.in_stalemate()) {
        statusEl.innerText = "Game drawn!";
    } else {
        statusEl.innerText = `${turnName}'s turn` + (game.in_check() ? " (Check!)" : "");
    }
}

// Simple AI logic (Random -> Capture -> Minimax Depth 2)
function makeAIMove(difficulty) {
    if (game.game_over()) return;

    let moves = game.moves({ verbose: true });
    let bestMove = null;

    if (difficulty === 1) {
        // Easy: Random move
        bestMove = moves[Math.floor(Math.random() * moves.length)];
    } else if (difficulty === 2) {
        // Medium: Prioritize captures, else random
        let captures = moves.filter(m => m.flags.includes('c'));
        if (captures.length > 0) {
            bestMove = captures[Math.floor(Math.random() * captures.length)];
        } else {
            bestMove = moves[Math.floor(Math.random() * moves.length)];
        }
    } else {
        // Hard / Sumit Easter Egg: Evaluate board (1-ply looking ahead)
        // A full engine is too heavy for frontend, but a greedy material evaluator works
        let bestScore = -Infinity;
        for (let i = 0; i < moves.length; i++) {
            game.move(moves[i].san);
            // evaluate the board after move
            let score = -evaluateBoard(game.board(), game.turn());
            game.undo();
            if (score > bestScore) {
                bestScore = score;
                bestMove = moves[i];
            }
        }
    }

    if (bestMove) {
        game.move(bestMove.san);
        finishTurn();
    }
}

// Basic piece value map for AI calculation
const pieceValues = { 'p': 10, 'n': 30, 'b': 30, 'r': 50, 'q': 90, 'k': 900 };

function evaluateBoard(boardState, currentTurn) {
    let totalEval = 0;
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            let p = boardState[r][c];
            if (p) {
                let val = pieceValues[p.type];
                if (p.color === currentTurn) {
                    totalEval += val;
                } else {
                    totalEval -= val;
                }
            }
        }
    }
    return totalEval;
}

// Service worker registration for PWA
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').then(reg => {
            console.log('ServiceWorker registered');
        }).catch(err => {
            console.log('ServiceWorker error', err);
        });
    });
}
