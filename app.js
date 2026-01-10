// app.js
import { loadInitialFile } from './state.js';
import { initPwa } from './pwa.js';
import { initUI } from './ui.js';

document.addEventListener('DOMContentLoaded', async () => {
    initPwa();
    await loadInitialFile();
    initUI();
});