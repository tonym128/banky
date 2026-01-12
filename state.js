// state.js
import { renderAll } from './ui.js';
import { get, set } from './idb.js';
import { uploadToS3, downloadFromS3, getCloudConfig } from './s3.js';
import { encryptData, decryptData, importKey, generateKey, exportKey } from './encryption.js';

export let accounts = JSON.parse(localStorage.getItem('accounts')) || {};
export let fileHandle = null;
export let autoSyncEnabled = JSON.parse(localStorage.getItem('autoSyncEnabled')) || false;
export let fsaSupported = 'showOpenFilePicker' in window;

// Cloud Sync State
export let cloudSyncEnabled = JSON.parse(localStorage.getItem('cloudSyncEnabled')) || false;
export let syncGuid = localStorage.getItem('syncGuid') || null;
export let encryptionKeyJwk = JSON.parse(localStorage.getItem('encryptionKeyJwk')) || null;
let cachedCryptoKey = null;

export function setAccounts(newAccounts) {
    accounts = newAccounts;
}

export function setFileHandle(newFileHandle) {
    fileHandle = newFileHandle;
}

export function setAutoSyncEnabled(enabled) {
    autoSyncEnabled = enabled;
}

export function setCloudSyncEnabled(enabled) {
    cloudSyncEnabled = enabled;
    localStorage.setItem('cloudSyncEnabled', JSON.stringify(enabled));
}

export function setSyncDetails(guid, keyJwk) {
    syncGuid = guid;
    encryptionKeyJwk = keyJwk;
    localStorage.setItem('syncGuid', guid);
    localStorage.setItem('encryptionKeyJwk', JSON.stringify(keyJwk));
    cachedCryptoKey = null; // Clear cache
}

async function getCryptoKey() {
    if (cachedCryptoKey) return cachedCryptoKey;
    if (encryptionKeyJwk) {
        cachedCryptoKey = await importKey(encryptionKeyJwk);
        return cachedCryptoKey;
    }
    return null;
}

export async function loadInitialFile() {
    // Try Cloud Load first if enabled
    if (cloudSyncEnabled && getCloudConfig()) {
        const cloudData = await loadFromCloud();
        if (cloudData) {
            accounts = cloudData;
            renderAll();
            // Also try to hook up local file handle just in case
            if (fsaSupported) {
               fileHandle = await get('fileHandle');
            }
            return;
        }
    }

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

export async function loadFromCloud() {
    if (!syncGuid || !encryptionKeyJwk) {
        console.log("Cloud sync not fully configured (missing GUID or Key).");
        return null;
    }
    try {
        console.log("Attempting to download from cloud...");
        const encrypted = await downloadFromS3(syncGuid);
        if (encrypted) {
            const key = await getCryptoKey();
            const data = await decryptData(encrypted, key);
            console.log("Successfully downloaded and decrypted data from cloud.");
            return data;
        }
    } catch (error) {
        console.error("Failed to load from cloud:", error);
    }
    return null;
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
    // Local File Sync
    if (autoSyncEnabled) {
        if (fsaSupported && fileHandle) {
            if (await fileHandle.queryPermission({ mode: 'readwrite' }) !== 'granted') {
                if (await fileHandle.requestPermission({ mode: 'readwrite' }) !== 'granted') {
                    // console.warn('Permission to write to the file was denied.');
                }
            }
            try {
                // Check if writable again (permission might have just been granted)
                 if (await fileHandle.queryPermission({ mode: 'readwrite' }) === 'granted') {
                    const writable = await fileHandle.createWritable();
                    await writable.write(JSON.stringify(accounts, null, 2));
                    await writable.close();
                 }
            } catch (error) {
                console.error('Failed to auto-sync to file:', error);
            }
        }
    }

    // Cloud Sync
    if (cloudSyncEnabled && syncGuid && encryptionKeyJwk) {
        try {
            const key = await getCryptoKey();
            const encrypted = await encryptData(accounts, key);
            await uploadToS3(encrypted, syncGuid);
        } catch (error) {
            console.error('Failed to auto-sync to cloud:', error);
        }
    }

}, 2000); // Increased debounce to 2s to account for encryption overhead

export function saveState() {
    localStorage.setItem('accounts', JSON.stringify(accounts));
    autoExport();
}