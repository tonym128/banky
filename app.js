// app.js
import { loadInitialFile, checkAllowances } from './state.js';
import { initPwa } from './pwa.js';
import { initUI } from './ui.js';

document.addEventListener('DOMContentLoaded', () => {
    initPwa();
    // Start initial sync in background (non-blocking)
    loadInitialFile().then(() => {
        // Check allowances after state is loaded/synced
        checkAllowances();
    });
    // Initialize UI immediately
    initUI();
});