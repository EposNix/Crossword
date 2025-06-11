// --- Constants ---
const GRID_SIZE = 4;
const WORD_FILE = "words4.txt";

// --- DOM Elements ---
const infoText = document.getElementById('info-text');
const gridContainer = document.getElementById('grid-container');
const winOverlay = document.getElementById('win-overlay');

// --- Game State ---
let solutionGrid = null;
let solutionCols = null;
let gameOver = false;

// --- Puzzle Generation (Port of crossword2.py) ---
// This section remains unchanged from the previous version.

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
            
            // CRITICAL: Prevent native keyboard on mobile
            cell.readOnly = true;

            // Allow clicking to focus
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
    if (gameOver) return;

    let activeCell = document.querySelector('.cell:focus');
    if (!activeCell) {
        // If no cell is focused, focus the first one
        activeCell = document.getElementById('cell-0-0');
        activeCell.focus();
    }
    
    const { r, c } = activeCell.dataset;
    const row = parseInt(r);
    const col = parseInt(c);

    if (key === 'DEL') {
        if (activeCell.value) {
            activeCell.value = '';
            updateCellColor(activeCell);
        } else {
            const prevCell = focusPrevCell(row, col);
            if (prevCell) {
                prevCell.value = '';
                updateCellColor(prevCell);
            }
        }
    } else if (key === 'ENTER') {
        // Move to the start of the next row, if it exists
        if (row < GRID_SIZE - 1) {
            document.getElementById(`cell-${row + 1}-0`).focus();
        }
    } else if (key.length === 1 && key.match(/[A-Z]/i)) {
        activeCell.value = key.toUpperCase();
        updateCellColor(activeCell);
        checkWin();
        if (!gameOver) {
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
            e.preventDefault(); // Prevent button from taking focus from the grid
            handleVirtualKeyPress(e.target.dataset.key);
        });
    });
}

/**
 * Handles physical keyboard events (arrows, letters, backspace).
 */
function handlePhysicalKeyDown(e) {
    if (e.ctrlKey || e.metaKey) return; // Allow copy/paste etc.

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
            return; // Do nothing for other keys
    }
    e.preventDefault(); // Prevent default browser actions for handled keys
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


function updateCellColor(cell) {
    const { r, c } = cell.dataset;
    const playerLetter = cell.value;

    cell.classList.remove('correct', 'present', 'absent');
    if (!playerLetter) return;

    const correctLetter = solutionGrid[r][c];
    const correctRowWord = solutionGrid[r];
    const correctColWord = solutionCols[c];

    if (playerLetter === correctLetter) {
        cell.classList.add('correct');
    } else if (correctRowWord.includes(playerLetter) || correctColWord.includes(playerLetter)) {
        cell.classList.add('present');
    } else {
        cell.classList.add('absent');
    }
}

function checkWin() {
    for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
            const cell = document.getElementById(`cell-${r}-${c}`);
            if (cell.value !== solutionGrid[r][c]) {
                return false;
            }
        }
    }
    gameOver = true;
    infoText.textContent = 'Puzzle Solved! Well Done!';
    winOverlay.classList.remove('hidden');
    // Optional: Lock orientation to portrait as a celebratory action or visual cue
    // if (screen.orientation && screen.orientation.lock) {
    //    screen.orientation.lock('portrait').catch(err => console.log(err));
    // }
    return true;
}

async function main() {
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
        solutionGrid = solution.rows;
        solutionCols = solution.cols;
        infoText.textContent = 'Fill the grid. Use keyboard or mouse.';
        createGrid();
        setupOnScreenKeyboard();
        document.addEventListener('keydown', handlePhysicalKeyDown);
        // Focus the first cell to start
        document.getElementById('cell-0-0').focus();
    } else {
        infoText.textContent = `Could not generate a puzzle. Try adding more words to '${WORD_FILE}'.`;
    }
}

document.addEventListener('DOMContentLoaded', main);