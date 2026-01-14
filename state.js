// state.js
import { renderAll } from './ui.js';
import { get, set } from './idb.js';
import { uploadToS3, downloadFromS3, getCloudConfig } from './s3.js';
import { encryptData, decryptData, importKey, generateKey, exportKey } from './encryption.js';

export let accounts = JSON.parse(localStorage.getItem('accounts')) || {};
export let deletedAccountIds = JSON.parse(localStorage.getItem('deletedAccountIds')) || [];
// Track accounts explicitly restored via import to protect them from cloud tombstones
export let restoredAccountIds = JSON.parse(localStorage.getItem('restoredAccountIds')) || [];

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

export function setDeletedAccountIds(newDeletedAccountIds) {
    deletedAccountIds = newDeletedAccountIds;
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
            return { ...tx, id: crypto.randomUUID(), timestamp: Date.now() };
        }
        if (!tx.timestamp) {
            return { ...tx, timestamp: Date.now() };
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
export function mergeAccounts(local, cloud, localDeleted, cloudDeleted) {
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
            // Merge transactions using LWW
            const localTx = normalizeTransactions(local[id].transactions);
            const cloudTx = normalizeTransactions(merged[id].transactions);
            
            const txMap = new Map();
            // Cloud transactions first
            cloudTx.forEach(tx => txMap.set(String(tx.id), tx));
            // Local transactions overwrite/add
            localTx.forEach(tx => {
                const existingTx = txMap.get(String(tx.id));
                if (existingTx) {
                    if (tx.timestamp > existingTx.timestamp) {
                        txMap.set(String(tx.id), tx);
                    }
                } else {
                    txMap.set(String(tx.id), tx);
                }
            });
            
            merged[id].transactions = Array.from(txMap.values())
                .filter(tx => !tx.deleted)
                .sort((a, b) => new Date(a.date) - new Date(b.date));
            
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

export function debounce(func, delay) {
    let timeout;
    return function(...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), delay);
    };
}

export const autoExport = debounce(async () => {
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
