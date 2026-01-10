// state.js
import { renderAll } from './ui.js';
import { get, set } from './idb.js';

export let accounts = JSON.parse(localStorage.getItem('accounts')) || {};
export let fileHandle = null;
export let autoSyncEnabled = JSON.parse(localStorage.getItem('autoSyncEnabled')) || false;
export let fsaSupported = 'showOpenFilePicker' in window;

export function setAccounts(newAccounts) {
    accounts = newAccounts;
}

export function setFileHandle(newFileHandle) {
    fileHandle = newFileHandle;
}

export function setAutoSyncEnabled(enabled) {
    autoSyncEnabled = enabled;
}

export async function loadInitialFile() {
    if (!fsaSupported) return;
    fileHandle = await get('fileHandle');
    if (fileHandle) {
        if (await fileHandle.queryPermission({ mode: 'readwrite' }) === 'granted') {
            await loadData();
        }
    }
}

export async function loadData() {
    if (!fileHandle) return;
    try {
        const file = await fileHandle.getFile();
        const contents = await file.text();
        if (contents) {
            accounts = JSON.parse(contents);
            renderAll();
        }
    } catch (error) {
        console.error('Failed to load data:', error);
        alert('Failed to load data from the sync file.');
    }
}

export async function setSyncFile() {
    if (!fsaSupported) {
        const data = JSON.stringify(accounts, null, 2);
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'kids-bank-data.json';
        a.click();
        URL.revokeObjectURL(url);
        return;
    }

    try {
        [fileHandle] = await window.showOpenFilePicker({
            types: [{
                description: 'JSON Files',
                accept: { 'application/json': ['.json'] }
            }]
        });
        await set('fileHandle', fileHandle);
        await loadData();
    } catch (error) {
        console.error('Failed to set sync file:', error);
    }
}

export function debounce(func, delay) {
    let timeout;
    return function(...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), delay);
    };
}

export const autoExport = debounce(async () => {
    if (!autoSyncEnabled) return;
    if (fsaSupported && fileHandle) {
        if (await fileHandle.queryPermission({ mode: 'readwrite' }) !== 'granted') {
            if (await fileHandle.requestPermission({ mode: 'readwrite' }) !== 'granted') {
                alert('Permission to write to the file was denied.');
                return;
            }
        }
        try {
            const writable = await fileHandle.createWritable();
            await writable.write(JSON.stringify(accounts, null, 2));
            await writable.close();
        } catch (error) {
            console.error('Failed to auto-sync to file:', error);
            alert('Failed to auto-sync to file. Please ensure the file is not open in another program.');
        }
    } else {
        const data = JSON.stringify(accounts, null, 2);
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'kids-bank-data.json';
        a.click();
        URL.revokeObjectURL(url);
    }
}, 1500);

export function saveState() {
    localStorage.setItem('accounts', JSON.stringify(accounts));
    autoExport();
}
