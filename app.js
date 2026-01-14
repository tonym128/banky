// app.js
import { loadInitialFile } from './state.js';
import { initPwa } from './pwa.js';
import { initUI } from './ui.js';

document.addEventListener('DOMContentLoaded', () => {
    initPwa();
    // Start initial sync in background (non-blocking)
    loadInitialFile(); 
    // Initialize UI immediately
    initUI();
});