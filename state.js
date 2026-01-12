// state.js
import { renderAll } from './ui.js';
import { get, set } from './idb.js';
import { uploadToS3, downloadFromS3, getCloudConfig } from './s3.js';
import { encryptData, decryptData, importKey, generateKey, exportKey } from './encryption.js';

export let accounts = JSON.parse(localStorage.getItem('accounts')) || {};
export let deletedAccountIds = JSON.parse(localStorage.getItem('deletedAccountIds')) || [];
// Track accounts explicitly restored via import to protect them from cloud tombstones
export let restoredAccountIds = JSON.parse(localStorage.getItem('restoredAccountIds')) || [];

export let fileHandle = null;
export let autoSyncEnabled = JSON.parse(localStorage.getItem('autoSyncEnabled')) || false;
export let fsaSupported = 'showOpenFilePicker' in window;

// Cloud Sync State
export let cloudSyncEnabled = JSON.parse(localStorage.getItem('cloudSyncEnabled')) || false;
export let syncGuid = localStorage.getItem('syncGuid') || null;
export let encryptionKeyJwk = JSON.parse(localStorage.getItem('encryptionKeyJwk')) || null;
let cachedCryptoKey = null;
let isSyncing = false;

export function setAccounts(newAccounts, clearDeletedIds = false) {
    accounts = newAccounts;
    if (clearDeletedIds) {
        // Revive accounts by removing them from the tombstone list
        // And add them to restored list to protect from cloud tombstones during next sync
        for (const id in newAccounts) {
            const index = deletedAccountIds.indexOf(id);
            if (index > -1) {
                deletedAccountIds.splice(index, 1);
            }
            if (!restoredAccountIds.includes(id)) {
                restoredAccountIds.push(id);
            }
        }
        localStorage.setItem('deletedAccountIds', JSON.stringify(deletedAccountIds));
        localStorage.setItem('restoredAccountIds', JSON.stringify(restoredAccountIds));
    }
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

/**
 * Ensures all transactions have a unique ID. 
 * Legacy transactions using Date.now() or missing IDs are handled.
 */
function normalizeTransactions(txs) {
    return (txs || []).map(tx => {
        if (!tx.id) {
            return { ...tx, id: crypto.randomUUID() };
        }
        // Ensure ID is a string to prevent type mismatches during merge
        return { ...tx, id: String(tx.id) };
    });
}

/**
 * Merges cloud data into local data.
 * Transactions are merged by ID. Metadata (names, images) prefers local.
 * Respects deleted accounts (tombstones), but allows Restoration via restoredAccountIds.
 */
function mergeAccounts(local, cloud, localDeleted, cloudDeleted) {
    const merged = { ...cloud };
    
    // Merge deleted IDs
    let mergedDeletedIds = [...new Set([...(localDeleted || []), ...(cloudDeleted || [])])];

    // Filter out any IDs that are pending restoration
    if (restoredAccountIds.length > 0) {
        mergedDeletedIds = mergedDeletedIds.filter(id => !restoredAccountIds.includes(id));
    }

    for (const id in local) {
        if (!merged[id]) {
            merged[id] = local[id];
            merged[id].transactions = normalizeTransactions(merged[id].transactions);
        } else {
            // Merge transactions
            const localTx = normalizeTransactions(local[id].transactions);
            const cloudTx = normalizeTransactions(merged[id].transactions);
            
            const txMap = new Map();
            // Cloud transactions first
            cloudTx.forEach(tx => txMap.set(String(tx.id), tx));
            // Local transactions overwrite/add
            localTx.forEach(tx => txMap.set(String(tx.id), tx));
            
            merged[id].transactions = Array.from(txMap.values()).sort((a, b) => new Date(a.date) - new Date(b.date));
            
            // Prefer local for metadata if it exists
            merged[id].name = local[id].name || merged[id].name;
            if (local[id].image) merged[id].image = local[id].image;
        }
    }

    // Also normalize any cloud accounts that aren't in local
    for (const id in merged) {
        if (merged[id]) {
            merged[id].transactions = normalizeTransactions(merged[id].transactions);
        }
    }

    // Final cleanup: Remove any accounts that are in the deleted list
    mergedDeletedIds.forEach(deletedId => {
        if (merged[deletedId]) {
            delete merged[deletedId];
        }
    });

    return { accounts: merged, deletedIds: mergedDeletedIds };
}

export function removeAccount(accountId) {
    if (accounts[accountId]) {
        delete accounts[accountId];
        if (!deletedAccountIds.includes(accountId)) {
            deletedAccountIds.push(accountId);
        }
        
        // Ensure we don't protect this account if it was previously restored
        const restoreIndex = restoredAccountIds.indexOf(accountId);
        if (restoreIndex > -1) {
            restoredAccountIds.splice(restoreIndex, 1);
            localStorage.setItem('restoredAccountIds', JSON.stringify(restoredAccountIds));
        }

        saveState();
    }
}

export async function syncWithCloud() {
    if (!cloudSyncEnabled || !syncGuid || !encryptionKeyJwk || isSyncing) return;
    
    isSyncing = true;
    try {
        console.log("Starting full cloud sync (Merge & Upload)...");
        const cloudDataPayload = await loadFromCloud();
        
        let mergedResult;
        
        if (cloudDataPayload) {
            // Handle legacy format (just accounts object) vs new format (wrapper)
            let cloudAccounts = cloudDataPayload;
            let cloudDeletedIds = [];
            
            if (cloudDataPayload.accounts && Array.isArray(cloudDataPayload.deletedIds)) {
                cloudAccounts = cloudDataPayload.accounts;
                cloudDeletedIds = cloudDataPayload.deletedIds;
            }

            mergedResult = mergeAccounts(accounts, cloudAccounts, deletedAccountIds, cloudDeletedIds);
            accounts = mergedResult.accounts;
            deletedAccountIds = mergedResult.deletedIds;
            
            localStorage.setItem('accounts', JSON.stringify(accounts));
            localStorage.setItem('deletedAccountIds', JSON.stringify(deletedAccountIds));
            renderAll();
        } else {
             // If no cloud data, just prepare local for upload
             mergedResult = { accounts, deletedIds: deletedAccountIds };
        }

        const key = await getCryptoKey();
        // Upload the new wrapper structure
        const encrypted = await encryptData(mergedResult, key);
        await uploadToS3(encrypted, syncGuid);
        
        // If upload successful, we can clear the restoration protection
        if (restoredAccountIds.length > 0) {
            restoredAccountIds = [];
            localStorage.removeItem('restoredAccountIds');
        }

        console.log("Cloud sync completed successfully.");
    } catch (error) {
        console.error("Cloud sync failed:", error);
    } finally {
        isSyncing = false;
    }
}

export async function loadInitialFile() {
    // Try Cloud Sync first if enabled
    if (cloudSyncEnabled && getCloudConfig()) {
        await syncWithCloud();
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
            const parsed = JSON.parse(contents);
             // Handle legacy format vs new format
            if (parsed.accounts && Array.isArray(parsed.deletedIds)) {
                accounts = parsed.accounts;
                deletedAccountIds = parsed.deletedIds;
            } else {
                accounts = parsed;
                // Keep existing deletedIds if loading legacy file
            }
            localStorage.setItem('accounts', JSON.stringify(accounts));
            localStorage.setItem('deletedAccountIds', JSON.stringify(deletedAccountIds));
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
        const encrypted = await downloadFromS3(syncGuid);
        if (encrypted) {
            const key = await getCryptoKey();
            const data = await decryptData(encrypted, key);
            return data;
        }
    } catch (error) {
        console.error("Failed to load from cloud:", error);
    }
    return null;
}

export async function setSyncFile() {
    if (!fsaSupported) {
        const exportData = { accounts, deletedIds: deletedAccountIds };
        const data = JSON.stringify(exportData, null, 2);
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
    const exportData = { accounts, deletedIds: deletedAccountIds };

    // Local File Sync
    if (autoSyncEnabled) {
        if (fsaSupported && fileHandle) {
            if (await fileHandle.queryPermission({ mode: 'readwrite' }) === 'granted') {
                try {
                    const writable = await fileHandle.createWritable();
                    await writable.write(JSON.stringify(exportData, null, 2));
                    await writable.close();
                } catch (error) {
                    console.error('Failed to auto-sync to file:', error);
                }
            }
        }
    }

    // Cloud Sync
    if (cloudSyncEnabled && syncGuid && encryptionKeyJwk) {
        await syncWithCloud();
    }

}, 2000);

export function saveState() {
    localStorage.setItem('accounts', JSON.stringify(accounts));
    localStorage.setItem('deletedAccountIds', JSON.stringify(deletedAccountIds));
    autoExport();
}

window.addEventListener('online', () => {
    console.log('Connection restored. Triggering sync...');
    syncWithCloud();
});
