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

            cell.addEventListener('input', handleInput);
            cell.addEventListener('keydown', handleKeyDown);

            gridContainer.appendChild(cell);
        }
    }
}

/**
 * Handles letter input in a cell.
 * @param {Event} e The input event.
 */
function handleInput(e) {
    if (gameOver) return;

    const cell = e.target;
    cell.value = cell.value.toUpperCase();

    updateCellColor(cell);
    checkWin();

    // Auto-move to the next cell
    if (cell.value) {
        const { r, c } = cell.dataset;
        focusNextCell(parseInt(r), parseInt(c));
    }
}

/**
 * Handles navigation (arrows, backspace) between cells.
 * @param {KeyboardEvent} e The keydown event.
 */
function handleKeyDown(e) {
    if (gameOver) return;

    const { r, c } = e.target.dataset;
    const row = parseInt(r);
    const col = parseInt(c);

    let nextRow = row;
    let nextCol = col;

    switch (e.key) {
        case 'ArrowUp':
            if (row > 0) nextRow--;
            e.preventDefault();
            break;
        case 'ArrowDown':
            if (row < GRID_SIZE - 1) nextRow++;
            e.preventDefault();
            break;
        case 'ArrowLeft':
            if (col > 0) nextCol--;
            e.preventDefault();
            break;
        case 'ArrowRight':
            if (col < GRID_SIZE - 1) nextCol++;
            e.preventDefault();
            break;
        case 'Backspace':
            if (!e.target.value) {
                 focusPrevCell(row, col);
                 e.preventDefault();
            }
            return; // Don't focus on backspace itself
        default:
            return; // Do nothing for other keys
    }

    document.getElementById(`cell-${nextRow}-${nextCol}`).focus();
}

function focusNextCell(r, c) {
    let next_c = c + 1;
    let next_r = r;
    if (next_c >= GRID_SIZE) {
        next_c = 0;
        next_r++;
    }
    if (next_r < GRID_SIZE) {
        document.getElementById(`cell-${next_r}-${next_c}`).focus();
    }
}

function focusPrevCell(r, c) {
    let prev_c = c - 1;
    let prev_r = r;
    if (prev_c < 0) {
        prev_c = GRID_SIZE - 1;
        prev_r--;
    }
    if (prev_r >= 0) {
        document.getElementById(`cell-${prev_r}-${prev_c}`).focus();
    }
}


/**
 * Updates a single cell's color based on its value.
 * @param {HTMLInputElement} cell The input element to update.
 */
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

/**
 * Checks if the player has solved the puzzle.
 */
function checkWin() {
    for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
            const cell = document.getElementById(`cell-${r}-${c}`);
            if (cell.value !== solutionGrid[r][c]) {
                return false; // Not won yet
            }
        }
    }
    // If we get here, all cells are correct
    gameOver = true;
    infoText.textContent = 'Puzzle Solved! Well Done!';
    winOverlay.classList.remove('hidden');
    return true;
}

/**
 * Main function to initialize the game.
 */
async function main() {
    const allWords = await fetchWords(WORD_FILE);

    if (!allWords) {
        infoText.textContent = `Error: Could not load word file '${WORD_FILE}'.`;
        // Create a dummy file for the user to download if running locally
        const sampleContent = "BATH\nALSO\nTEAR\nHORN\nCARS\nRATE\nENDS\nSEND\n";
        const blob = new Blob([sampleContent], { type: 'text/plain' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'words4.txt';
        link.textContent = 'Download sample words4.txt';
        infoText.appendChild(document.createElement('br'));
        infoText.appendChild(link);
        return;
    }

    let solution = null;
    // Try a few times to generate a puzzle
    for (let i = 0; i < 10; i++) {
        solution = generateCrossword(GRID_SIZE, allWords);
        if (solution) break;
    }

    if (solution) {
        console.log("Puzzle Generated:", solution);
        solutionGrid = solution.rows;
        solutionCols = solution.cols;
        infoText.textContent = 'Fill the grid. Use mouse, arrows, and letter keys.';
        createGrid();
    } else {
        infoText.textContent = `Could not generate a ${GRID_SIZE}x${GRID_SIZE} puzzle. Add more words to '${WORD_FILE}'.`;
    }
}

// Start the game when the page is loaded
document.addEventListener('DOMContentLoaded', main);