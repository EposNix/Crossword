// --- Constants ---
const GRID_SIZE = 4;
const WORD_FILE = "words4.txt";
const MAX_HINTS = 3; // --- ADDED ---

// --- DOM Elements ---
const infoText = document.getElementById('info-text');
const gridContainer = document.getElementById('grid-container');
const winOverlay = document.getElementById('win-overlay');
// --- ADDED: New DOM elements ---
const guessCountEl = document.getElementById('guess-count');
const hintsRemainingEl = document.getElementById('hints-remaining');
const hintButton = document.getElementById('hint-button');
const playAgainButton = document.getElementById('play-again-button');
const winGuessesEl = document.getElementById('win-guesses');


// --- Game State (MODIFIED: Refactored into a single object) ---
let state = {
    solutionGrid: null,
    solutionCols: null,
    gameOver: false,
    guessCount: 0,
    hintsRemaining: MAX_HINTS,
    // --- ADDED: Keep track of letter statuses for keyboard coloring ---
    letterStatus: {} // { 'A': 'correct', 'B': 'present', 'C': 'absent' }
};

// --- Puzzle Generation (Port of crossword2.py) ---
// This section remains unchanged.

/**
 * Fetches words from a file, one word per line.
 * @param {string} filename The path to the word file.
 * @returns {Promise<string[]>} A promise that resolves to a list of uppercase words.
 */
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

/**
 * Builds a set of all prefixes for words of a specific length.
 * @param {string[]} words The list of all words.
 * @param {number} n The required length of words.
 * @returns {Set<string>} A set of all valid prefixes.
 */
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

/**
 * Tries to generate an n x n crossword puzzle using backtracking.
 * @param {number} n Grid size.
 * @param {string[]} words List of candidate words.
 * @returns {{rows: string[], cols: string[]} | null} A solution object or null if not found.
 */
function generateCrossword(n, words) {
    const wordList = words.filter(w => w.length === n);
    // Fisher-Yates shuffle
    for (let i = wordList.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [wordList[i], wordList[j]] = [wordList[j], wordList[i]];
    }

    const prefixSet = buildPrefixSet(wordList, n);
    const solutions = [];
    const currentRows = [];

    function backtrack() {
        if (solutions.length > 0) return true; // Stop after one solution

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

        const k = currentRows.length; // Next row index
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

/**
 * Sets up the grid in the DOM with input cells.
 */
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

            gridContainer.appendChild(cell);
        }
    }
}

/**
 * Centralized handler for both physical and virtual keyboard presses.
 * @param {string} key The key pressed (e.g., "A", "DEL", "ENTER").
 */
function handleVirtualKeyPress(key) {
    if (state.gameOver) return;

    let activeCell = document.querySelector('.cell:focus');
    if (!activeCell) {
        activeCell = document.getElementById('cell-0-0');
        activeCell.focus();
    }
    
    const { r, c } = activeCell.dataset;
    const row = parseInt(r);
    const col = parseInt(c);

    if (key === 'DEL') {
        if (activeCell.value) {
            activeCell.value = '';
            updateCellAndKeyboard(activeCell); // MODIFIED
        } else {
            const prevCell = focusPrevCell(row, col);
            if (prevCell) {
                prevCell.value = '';
                updateCellAndKeyboard(prevCell); // MODIFIED
            }
        }
    } else if (key === 'ENTER') {
        if (row < GRID_SIZE - 1) {
            document.getElementById(`cell-${row + 1}-0`).focus();
        }
    } else if (key.length === 1 && key.match(/[A-Z]/i)) {
        activeCell.value = key.toUpperCase();
        
        // --- ADDED: Guess counter logic ---
        state.guessCount++;
        guessCountEl.textContent = state.guessCount;
        
        updateCellAndKeyboard(activeCell); // MODIFIED
        checkWin();
        if (!state.gameOver) {
            focusNextCell(row, col);
        }
    }
}

/**
 * Sets up listeners for the on-screen keyboard.
 */
function setupOnScreenKeyboard() {
    document.querySelectorAll('#keyboard button').forEach(button => {
        button.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            handleVirtualKeyPress(e.target.dataset.key);
        });
    });
}

/**
 * Handles physical keyboard events (arrows, letters, backspace).
 */
function handlePhysicalKeyDown(e) {
    if (e.ctrlKey || e.metaKey) return;

    let nextRow = -1;
    let nextCol = -1;
    
    const activeCell = document.querySelector('.cell:focus');
    if(activeCell) {
        const {r, c} = activeCell.dataset;
        nextRow = parseInt(r);
        nextCol = parseInt(c);
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

// --- MODIFIED: Renamed and expanded to update keyboard too ---
function updateCellAndKeyboard(cell) {
    updateCellColor(cell);
    updateKeyboardColors();
}

function updateCellColor(cell) {
    const { r, c } = cell.dataset;
    const playerLetter = cell.value;

    cell.classList.remove('correct', 'present', 'absent');
    if (!playerLetter) return;

    const correctLetter = state.solutionGrid[r][c];
    const correctRowWord = state.solutionGrid[r];
    const correctColWord = state.solutionCols[c];

    let status = 'absent';
    if (playerLetter === correctLetter) {
        status = 'correct';
    } else if (correctRowWord.includes(playerLetter) || correctColWord.includes(playerLetter)) {
        status = 'present';
    }
    cell.classList.add(status);
}

// --- ADDED: Wordle-style keyboard coloring ---
function updateKeyboardColors() {
    // Reset statuses
    state.letterStatus = {};
    const allLetters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    for(const letter of allLetters) {
        // Find all occurrences of this letter in the player's grid
        const cellsWithLetter = document.querySelectorAll(`.cell`);
        let bestStatus = null; // null -> 'absent' -> 'present' -> 'correct'
        
        cellsWithLetter.forEach(cell => {
            if (cell.value === letter) {
                const { r, c } = cell.dataset;
                const correctLetter = state.solutionGrid[r][c];
                const correctRowWord = state.solutionGrid[r];
                const correctColWord = state.solutionCols[c];
                
                let currentStatus = 'absent';
                if (letter === correctLetter) {
                    currentStatus = 'correct';
                } else if (correctRowWord.includes(letter) || correctColWord.includes(letter)) {
                    currentStatus = 'present';
                }

                // Upgrade status: correct > present > absent
                if (currentStatus === 'correct') {
                    bestStatus = 'correct';
                } else if (currentStatus === 'present' && bestStatus !== 'correct') {
                    bestStatus = 'present';
                } else if (currentStatus === 'absent' && !bestStatus) {
                    bestStatus = 'absent';
                }
            }
        });

        if (bestStatus) {
             state.letterStatus[letter] = bestStatus;
        }
    }

    // Apply classes to keyboard
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
    winGuessesEl.textContent = state.guessCount; // Update final guess count
    winOverlay.classList.remove('hidden');
    return true;
}

// --- ADDED: Hint logic ---
function giveHint() {
    if (state.hintsRemaining <= 0 || state.gameOver) return;

    const incorrectCells = [];
    for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
            const cell = document.getElementById(`cell-${r}-${c}`);
            if (cell.value !== state.solutionGrid[r][c]) {
                incorrectCells.push(cell);
            }
        }
    }

    if (incorrectCells.length === 0) return; // Already solved

    // Pick a random incorrect cell
    const randomCell = incorrectCells[Math.floor(Math.random() * incorrectCells.length)];
    const { r, c } = randomCell.dataset;
    
    randomCell.value = state.solutionGrid[r][c];
    randomCell.focus(); // Focus the cell that was revealed

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
        document.getElementById('cell-0-0').focus();
    } else {
        infoText.textContent = `Could not generate a puzzle. Try refreshing.`;
    }
}

// --- MODIFIED: main function renamed to initGame and listeners moved outside ---
document.addEventListener('DOMContentLoaded', () => {
    setupOnScreenKeyboard();
    document.addEventListener('keydown', handlePhysicalKeyDown);
    hintButton.addEventListener('click', giveHint);
    playAgainButton.addEventListener('click', initGame);
    initGame();
});