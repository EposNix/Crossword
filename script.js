// --- Constants ---
const GRID_SIZE = 4;
const WORD_FILE = "words4.txt";
const MAX_HINTS = 3; 

// --- DOM Elements ---
const infoText = document.getElementById('info-text');
const gridContainer = document.getElementById('grid-container');
const winOverlay = document.getElementById('win-overlay');
const guessCountEl = document.getElementById('guess-count');
const hintsRemainingEl = document.getElementById('hints-remaining');
const hintButton = document.getElementById('hint-button');
const playAgainButton = document.getElementById('play-again-button');
const winGuessesEl = document.getElementById('win-guesses');

// --- ADDED: New Modal/Splash/Share Screen DOM Elements ---
const splashOverlay = document.getElementById('splash-overlay');
const startGameButton = document.getElementById('start-game-button');
const helpOverlay = document.getElementById('help-overlay');
const helpButton = document.getElementById('help-button');
const closeHelpButton = document.getElementById('close-help-button');
const closeHelpButtonBottom = document.getElementById('close-help-button-bottom');
const shareButton = document.getElementById('share-button'); // ADDED


// --- Game State (MODIFIED: Refactored into a single object) ---
let state = {
    solutionGrid: null,
    solutionCols: null,
    gameOver: false,
    guessCount: 0,
    hintsRemaining: MAX_HINTS,
    letterStatus: {} // { 'A': 'correct', 'B': 'present', 'C': 'absent' }
};

// --- Puzzle Generation (Port of crossword2.py) ---
// This section remains unchanged.

async function fetchWords(filename) {
    try {
        const response = await fetch(filename);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const text = await response.text();
        return text.split('\n').map(w => w.trim().toUpperCase()).filter(w => w.length > 0);
    } catch (e) {
        console.error(`Could not read file: ${filename}`, e);
        return null;
    }
}

function buildPrefixSet(words, n) {
    const prefixes = new Set();
    for (const w of words) {
        if (w.length !== n) continue;
        for (let i = 1; i <= n; i++) {
            prefixes.add(w.substring(0, i));
        }
    }
    return prefixes;
}

function generateCrossword(n, words) {
    const wordList = words.filter(w => w.length === n);
    for (let i = wordList.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [wordList[i], wordList[j]] = [wordList[j], wordList[i]];
    }

    const prefixSet = buildPrefixSet(wordList, n);
    const solutions = [];
    const currentRows = [];

    function backtrack() {
        if (solutions.length > 0) return true;

        if (currentRows.length === n) {
            const cols = [];
            const used = new Set(currentRows);
            for (let j = 0; j < n; j++) {
                let colWord = '';
                for (let i = 0; i < n; i++) {
                    colWord += currentRows[i][j];
                }
                if (!wordList.includes(colWord) || used.has(colWord)) {
                    return false;
                }
                cols.push(colWord);
            }
            solutions.push({ rows: [...currentRows], cols });
            return true;
        }

        const k = currentRows.length;
        for (const word of wordList) {
            if (currentRows.includes(word)) continue;

            let ok = true;
            for (let j = 0; j < n; j++) {
                let prefix = '';
                for (let i = 0; i < k; i++) {
                    prefix += currentRows[i][j];
                }
                prefix += word[j];
                if (!prefixSet.has(prefix)) {
                    ok = false;
                    break;
                }
            }
            if (!ok) continue;

            currentRows.push(word);
            if (backtrack()) return true;
            currentRows.pop();
        }
        return false;
    }

    backtrack();
    return solutions.length > 0 ? solutions[0] : null;
}


// --- Game Logic & DOM Manipulation ---

function createGrid() {
    gridContainer.innerHTML = '';
    gridContainer.style.setProperty('--grid-size', GRID_SIZE);

    for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
            const cell = document.createElement('input');
            cell.type = 'text';
            cell.maxLength = 1;
            cell.className = 'cell';
            cell.id = `cell-${r}-${c}`;
            cell.dataset.r = r;
            cell.dataset.c = c;
            
            cell.readOnly = true;
            cell.addEventListener('click', (e) => e.target.focus());
            
            // MODIFIED: Add listener to remove animation class after it plays
            cell.addEventListener('animationend', () => {
                cell.classList.remove('animate-jump', 'animate-shake', 'animate-wobble');
            });

            gridContainer.appendChild(cell);
        }
    }
}

function handleVirtualKeyPress(key) {
    if (state.gameOver) return;

    let activeCell = document.querySelector('.cell:focus');
    if (!activeCell) {
       return; // Don't allow typing if no cell is focused
    }
    
    const { r, c } = activeCell.dataset;
    const row = parseInt(r);
    const col = parseInt(c);

    // MODIFIED: Logic for handling locked (correct) cells and backspace
    if (key === 'DEL') {
        // If the current cell has a value AND isn't locked, delete it.
        if (activeCell.value && !activeCell.classList.contains('correct')) {
            activeCell.value = '';
            updateCellAndKeyboard(activeCell);
        // If the current cell is empty...
        } else if (!activeCell.value) { 
            const prevCell = focusPrevCell(row, col);
            // If we found a previous cell AND it's not locked, delete its content.
            if (prevCell && !prevCell.classList.contains('correct')) {
                prevCell.value = '';
                updateCellAndKeyboard(prevCell);
            }
        }
    } else if (key === 'ENTER') {
        if (row < GRID_SIZE - 1) {
            document.getElementById(`cell-${row + 1}-0`).focus();
        }
    } else if (key.length === 1 && key.match(/[A-Z]/i)) {
        // MODIFIED: Prevent typing over a correct cell
        if (activeCell.classList.contains('correct')) {
            return;
        }
        activeCell.value = key.toUpperCase();
        
        state.guessCount++;
        guessCountEl.textContent = state.guessCount;
        
        updateCellAndKeyboard(activeCell);
        checkWin();
        // REMOVED: No longer automatically advance to the next cell
        // if (!state.gameOver) {
        //     focusNextCell(row, col);
        // }
    }
}

function setupOnScreenKeyboard() {
    document.querySelectorAll('#keyboard button').forEach(button => {
        button.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            handleVirtualKeyPress(e.target.dataset.key);
        });
    });
}

function handlePhysicalKeyDown(e) {
    if (e.ctrlKey || e.metaKey) return;
    
    // Don't handle keydown if a modal is open
    if (!splashOverlay.classList.contains('hidden') || !helpOverlay.classList.contains('hidden')) {
        return;
    }

    let nextRow = -1;
    let nextCol = -1;
    
    const activeCell = document.querySelector('.cell:focus');
    if(activeCell) {
        const {r, c} = activeCell.dataset;
        nextRow = parseInt(r);
        nextCol = parseInt(c);
    } else {
        return; // No active cell, don't process keys
    }

    switch (e.key) {
        case 'ArrowUp':
            if (nextRow > 0) document.getElementById(`cell-${nextRow - 1}-${nextCol}`).focus();
            break;
        case 'ArrowDown':
            if (nextRow < GRID_SIZE - 1) document.getElementById(`cell-${nextRow + 1}-${nextCol}`).focus();
            break;
        case 'ArrowLeft':
            if (nextCol > 0) document.getElementById(`cell-${nextRow}-${nextCol-1}`).focus();
            break;
        case 'ArrowRight':
             if (nextCol < GRID_SIZE - 1) document.getElementById(`cell-${nextRow}-${nextCol+1}`).focus();
            break;
        case 'Backspace':
            handleVirtualKeyPress('DEL');
            break;
        case 'Enter':
            handleVirtualKeyPress('ENTER');
            break;
        default:
            if (e.key.length === 1 && e.key.match(/[a-z]/i)) {
                handleVirtualKeyPress(e.key);
            }
            return;
    }
    e.preventDefault();
}


function focusNextCell(r, c) {
    let next_c = c + 1;
    let next_r = r;
    if (next_c >= GRID_SIZE) {
        next_c = 0;
        next_r++;
    }
    if (next_r < GRID_SIZE) {
        const nextCell = document.getElementById(`cell-${next_r}-${next_c}`);
        if(nextCell) nextCell.focus();
        return nextCell;
    }
    return null;
}

function focusPrevCell(r, c) {
    let prev_c = c - 1;
    let prev_r = r;
    if (prev_c < 0) {
        prev_c = GRID_SIZE - 1;
        prev_r--;
    }
    if (prev_r >= 0) {
        const prevCell = document.getElementById(`cell-${prev_r}-${prev_c}`);
        if(prevCell) prevCell.focus();
        return prevCell;
    }
    return null;
}

function updateCellAndKeyboard(cell) {
    updateCellColor(cell);
    updateKeyboardColors();
}

function updateCellColor(cell) {
    const { r, c } = cell.dataset;
    const playerLetter = cell.value;

    cell.classList.remove('correct', 'present', 'absent');
    // MODIFIED: Remove any existing animation classes before adding a new one
    cell.classList.remove('animate-jump', 'animate-shake', 'animate-wobble');

    if (!playerLetter) return;

    const correctLetter = state.solutionGrid[r][c];
    const correctRowWord = state.solutionGrid[r];
    const correctColWord = state.solutionCols[c];

    let status = 'absent';
    let animationClass = 'animate-shake'; // Default animation for a guess

    if (playerLetter === correctLetter) {
        status = 'correct';
        animationClass = 'animate-jump';
    } else if (correctRowWord.includes(playerLetter) || correctColWord.includes(playerLetter)) {
        status = 'present';
        animationClass = 'animate-wobble';
    }

    cell.classList.add(status);
    
    // Trigger reflow to allow re-animation of the same type
    void cell.offsetWidth; 
    
    cell.classList.add(animationClass);
}

function updateKeyboardColors() {
    const solutionLetterCounts = {};
    if (state.solutionGrid) {
        for (const row of state.solutionGrid) {
            for (const letter of row) {
                solutionLetterCounts[letter] = (solutionLetterCounts[letter] || 0) + 1;
            }
        }
    }

    const playerCorrectCounts = {};
    const playerUsedLetters = new Set();
    const allPlayerCells = document.querySelectorAll('.cell');
    allPlayerCells.forEach(cell => {
        const playerLetter = cell.value;
        if (!playerLetter) return;

        playerUsedLetters.add(playerLetter);

        const { r, c } = cell.dataset;
        if (playerLetter === state.solutionGrid[r][c]) {
            playerCorrectCounts[playerLetter] = (playerCorrectCounts[playerLetter] || 0) + 1;
        }
    });
    
    const currentLetterStatus = {};
    const allLetters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    for (const letter of allLetters) {
        if (state.letterStatus[letter] === 'absent') {
            currentLetterStatus[letter] = 'absent';
            continue;
        }

        if (playerUsedLetters.has(letter)) {
            const totalInSolution = solutionLetterCounts[letter] || 0;
            const correctlyPlaced = playerCorrectCounts[letter] || 0;

            if (totalInSolution === 0) {
                currentLetterStatus[letter] = 'absent';
            } else if (correctlyPlaced === totalInSolution) {
                currentLetterStatus[letter] = 'correct';
            } else {
                currentLetterStatus[letter] = 'present';
            }
        }
    }

    state.letterStatus = currentLetterStatus;

    document.querySelectorAll('#keyboard button').forEach(button => {
        const key = button.dataset.key;
        if (key && key.length === 1) {
            button.classList.remove('correct', 'present', 'absent');
            if (state.letterStatus[key]) {
                button.classList.add(state.letterStatus[key]);
            }
        }
    });
}


function checkWin() {
    for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
            const cell = document.getElementById(`cell-${r}-${c}`);
            if (cell.value !== state.solutionGrid[r][c]) {
                return false;
            }
        }
    }
    state.gameOver = true;
    infoText.textContent = 'Puzzle Solved! Well Done!';
    winGuessesEl.textContent = state.guessCount; 
    winOverlay.classList.remove('hidden');
    return true;
}

function giveHint() {
    if (state.hintsRemaining <= 0 || state.gameOver) return;

    const incorrectCells = [];
    for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
            const cell = document.getElementById(`cell-${r}-${c}`);
            // MODIFIED: A hint can also be used on an empty cell, not just an incorrect one
            if (cell.value !== state.solutionGrid[r][c]) {
                incorrectCells.push(cell);
            }
        }
    }

    if (incorrectCells.length === 0) return;

    const randomCell = incorrectCells[Math.floor(Math.random() * incorrectCells.length)];
    const { r, c } = randomCell.dataset;
    
    randomCell.value = state.solutionGrid[r][c];
    randomCell.focus();

    updateCellAndKeyboard(randomCell);

    state.hintsRemaining--;
    hintsRemainingEl.textContent = state.hintsRemaining;
    if (state.hintsRemaining === 0) {
        hintButton.disabled = true;
    }

    checkWin();
}

async function initGame() {
    // Reset state
    state = {
        solutionGrid: null,
        solutionCols: null,
        gameOver: false,
        guessCount: 0,
        hintsRemaining: MAX_HINTS,
        letterStatus: {}
    };

    // Reset UI
    infoText.textContent = 'Generating new puzzle...';
    gridContainer.innerHTML = '<!-- Generating... -->'; // Clear grid
    winOverlay.classList.add('hidden');
    guessCountEl.textContent = '0';
    hintsRemainingEl.textContent = MAX_HINTS;
    hintButton.disabled = false;
    document.querySelectorAll('#keyboard button').forEach(b => b.classList.remove('correct', 'present', 'absent'));

    const allWords = await fetchWords(WORD_FILE);

    if (!allWords) {
        infoText.innerHTML = `Error: Could not load word file '${WORD_FILE}'.`;
        return;
    }

    let solution = null;
    for (let i = 0; i < 10; i++) {
        solution = generateCrossword(GRID_SIZE, allWords);
        if (solution) break;
    }

    if (solution) {
        console.log("Puzzle Generated:", solution);
        state.solutionGrid = solution.rows;
        state.solutionCols = solution.cols;
        infoText.textContent = 'Fill the grid. Good luck!';
        createGrid();
        // Focus the first cell to enable keyboard input immediately
        const firstCell = document.getElementById('cell-0-0');
        if (firstCell) {
            firstCell.focus();
        }
    } else {
        infoText.textContent = `Could not generate a puzzle. Try refreshing.`;
    }
}


// --- Main Event Listeners ---
document.addEventListener('DOMContentLoaded', () => {
    setupOnScreenKeyboard();
    document.addEventListener('keydown', handlePhysicalKeyDown);
    
    // --- Splash Screen and Game Start ---
    startGameButton.addEventListener('click', () => {
        splashOverlay.classList.add('hidden');
        initGame(); // The game only starts when the button is clicked
    });

    // --- Help Modal Listeners ---
    helpButton.addEventListener('click', () => {
        helpOverlay.classList.remove('hidden');
    });

    const closeHelp = () => helpOverlay.classList.add('hidden');
    closeHelpButton.addEventListener('click', closeHelp);
    closeHelpButtonBottom.addEventListener('click', closeHelp);
    helpOverlay.addEventListener('click', (e) => {
        if (e.target === helpOverlay) {
            closeHelp();
        }
    });
    
    // --- ADDED: Share Button Listener ---
    shareButton.addEventListener('click', () => {
        const shareText = `I solved the HTML Crossword in ${state.guessCount} guesses! 🧩\n\nTry it yourself!`;
        
        navigator.clipboard.writeText(shareText).then(() => {
            const originalText = shareButton.textContent;
            shareButton.textContent = 'Copied!';
            shareButton.disabled = true;
            setTimeout(() => {
                shareButton.textContent = originalText;
                shareButton.disabled = false;
            }, 2000);
        }).catch(err => {
            console.error('Failed to copy text: ', err);
            alert("Could not copy text to clipboard.");
        });
    });

    // --- Other Game Listeners ---
    hintButton.addEventListener('click', giveHint);
    playAgainButton.addEventListener('click', initGame);
});