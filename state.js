// state.js
import { get, set } from './idb.js';
import { uploadToS3, downloadFromS3, getCloudConfig } from './s3.js';
import { encryptData, decryptData, importKey, generateKey, exportKey } from './encryption.js';
import { PubSub, EVENTS } from './pubsub.js';

export let accounts = JSON.parse(localStorage.getItem('accounts')) || {};
export let deletedAccountIds = JSON.parse(localStorage.getItem('deletedAccountIds')) || [];
// Track accounts explicitly restored via import to protect them from cloud tombstones
export let restoredAccountIds = JSON.parse(localStorage.getItem('restoredAccountIds')) || [];

// Toast Config
export let toastConfig = JSON.parse(localStorage.getItem('toastConfig')) || { enabled: true, showSyncStart: true, showSyncSuccess: true };

export function setToastConfig(config) {
    toastConfig = { ...toastConfig, ...config };
    localStorage.setItem('toastConfig', JSON.stringify(toastConfig));
}

// Cloud Sync State
export let cloudSyncEnabled = JSON.parse(localStorage.getItem('cloudSyncEnabled')) || false;
export let syncGuid = localStorage.getItem('syncGuid') || null;
export let encryptionKeyJwk = JSON.parse(localStorage.getItem('encryptionKeyJwk')) || null;
export let lastEtag = localStorage.getItem('lastEtag') || null;
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
    PubSub.publish(EVENTS.SYNC_STATUS_CHANGED, enabled ? 'synced' : 'disabled'); // Assume synced if enabled until sync runs
}

export function setSyncDetails(guid, keyJwk) {
    syncGuid = guid;
    encryptionKeyJwk = keyJwk;
    localStorage.setItem('syncGuid', guid);
    localStorage.setItem('encryptionKeyJwk', JSON.stringify(keyJwk));
    localStorage.removeItem('lastEtag'); // Reset ETag on new credentials
    lastEtag = null;
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
            // New account only in local
            merged[id] = { ...local[id] };
            merged[id].transactions = normalizeTransactions(merged[id].transactions);
        } else {
            // Account in both - Create a NEW object to avoid mutating the original cloud data
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
            
            // Create a new account object starting with cloud data
            merged[id] = {
                ...cloud[id],
                transactions: Array.from(txMap.values())
                    .sort((a, b) => new Date(a.date) - new Date(b.date))
            };

            // Only update metadata if local has it
            if (local[id].name) merged[id].name = local[id].name;
            if (local[id].image) merged[id].image = local[id].image;
        }
    }

    // Also normalize any cloud accounts that aren't in local (and weren't already processed)
    for (const id in merged) {
        if (merged[id] && !local[id]) {
            // Create a new object if we need to modify it (normalize transactions)
            const normalizedTxs = normalizeTransactions(merged[id].transactions);
            if (normalizedTxs !== merged[id].transactions) {
                merged[id] = {
                    ...merged[id],
                    transactions: normalizedTxs
                };
            }
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

function deepEqual(obj1, obj2) {
    if (obj1 === obj2) return true;
    if (typeof obj1 !== 'object' || obj1 === null || typeof obj2 !== 'object' || obj2 === null) return false;

    const keys1 = Object.keys(obj1);
    const keys2 = Object.keys(obj2);

    if (keys1.length !== keys2.length) {
        // console.log(`deepEqual false: key length mismatch ${keys1.length} vs ${keys2.length}`, keys1, keys2);
        return false;
    }

    for (const key of keys1) {
        if (!keys2.includes(key)) {
            // console.log(`deepEqual false: key ${key} missing in obj2`);
            return false;
        }
        if (!deepEqual(obj1[key], obj2[key])) {
            // console.log(`deepEqual false: mismatch at key ${key}`, obj1[key], obj2[key]);
            return false;
        }
    }

    return true;
}

export async function syncWithCloud() {
    if (!cloudSyncEnabled || !syncGuid || !encryptionKeyJwk || isSyncing) return;
    
    isSyncing = true;
    PubSub.publish(EVENTS.SYNC_STATUS_CHANGED, 'syncing');
    try {
        console.log("Starting full cloud sync (Merge & Upload)...");
        if (toastConfig.enabled && toastConfig.showSyncStart) {
            PubSub.publish(EVENTS.TOAST_NOTIFICATION, { message: 'Syncing with cloud...', type: 'info' });
        }
        
        const syncResult = await loadFromCloud();
        
        let mergedResult;
        let cloudStateToCompare = null;
        
        if (syncResult && syncResult.notModified) {
             console.log("Cloud data has not changed (ETag match).");
             // Even if cloud hasn't changed, we might have local changes to upload
             mergedResult = { accounts, deletedIds: deletedAccountIds };
             // We can use current state as cloud state for comparison
             cloudStateToCompare = { accounts, deletedIds: deletedAccountIds }; 
        } else if (syncResult && syncResult.data) {
            const cloudDataPayload = syncResult.data;
            lastEtag = syncResult.etag;
            localStorage.setItem('lastEtag', lastEtag);

            // Handle legacy format (just accounts object) vs new format (wrapper)
            let cloudAccounts = cloudDataPayload;
            let cloudDeletedIds = [];
            
            if (cloudDataPayload.accounts && Array.isArray(cloudDataPayload.deletedIds)) {
                cloudAccounts = cloudDataPayload.accounts;
                cloudDeletedIds = cloudDataPayload.deletedIds;
                cloudStateToCompare = cloudDataPayload;
            } else {
                cloudStateToCompare = { accounts: cloudAccounts, deletedIds: [] };
            }

            mergedResult = mergeAccounts(accounts, cloudAccounts, deletedAccountIds, cloudDeletedIds);
            accounts = mergedResult.accounts;
            deletedAccountIds = mergedResult.deletedIds;
            
            localStorage.setItem('accounts', JSON.stringify(accounts));
            localStorage.setItem('deletedAccountIds', JSON.stringify(deletedAccountIds));
            PubSub.publish(EVENTS.STATE_UPDATED);
        } else {
             // If no cloud data, just prepare local for upload
             mergedResult = { accounts, deletedIds: deletedAccountIds };
        }

        // Optimization: Check if merged state differs from cloud state before uploading
        if (cloudStateToCompare && deepEqual(mergedResult, cloudStateToCompare)) {
            console.log("Local state is identical to cloud state. Skipping upload.");
            PubSub.publish(EVENTS.SYNC_STATUS_CHANGED, 'synced');
            if (toastConfig.enabled && toastConfig.showSyncSuccess) {
                PubSub.publish(EVENTS.TOAST_NOTIFICATION, { message: 'Sync Complete (No changes)', type: 'success' });
            }
        } else {
            const key = await getCryptoKey();
            // Upload the new wrapper structure
            const encrypted = await encryptData(mergedResult, key);
            const newEtag = await uploadToS3(encrypted, syncGuid);
            if (newEtag) {
                lastEtag = newEtag;
                localStorage.setItem('lastEtag', lastEtag);
            }
            console.log("Cloud sync completed successfully (Uploaded).");
            PubSub.publish(EVENTS.SYNC_STATUS_CHANGED, 'synced');
            if (toastConfig.enabled && toastConfig.showSyncSuccess) {
                PubSub.publish(EVENTS.TOAST_NOTIFICATION, { message: 'Sync Complete', type: 'success' });
            }
        }
        
        // If upload successful (or skipped), we can clear the restoration protection
        if (restoredAccountIds.length > 0) {
            restoredAccountIds = [];
            localStorage.removeItem('restoredAccountIds');
        }

    } catch (error) {
        console.error("Cloud sync failed:", error);
        PubSub.publish(EVENTS.SYNC_STATUS_CHANGED, 'error');
    } finally {
        isSyncing = false;
    }
}

export async function loadInitialFile() {
    PubSub.publish(EVENTS.SYNC_STATUS_CHANGED, cloudSyncEnabled ? 'synced' : 'disabled'); // Initial state
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
        const result = await downloadFromS3(syncGuid, lastEtag);
        if (result && result.notModified) {
            return { notModified: true };
        }
        if (result && result.data) {
            const key = await getCryptoKey();
            const data = await decryptData(result.data, key);
            return { data, etag: result.etag, notModified: false };
        }
    } catch (error) {
        console.error("Failed to load from cloud:", error);
        throw error;
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

export function replaceState(cloudData) {
    if (!cloudData) return;

    let newAccounts = cloudData;
    let newDeletedIds = [];

    // Handle wrapper format
    if (cloudData.accounts && Array.isArray(cloudData.deletedIds)) {
        newAccounts = cloudData.accounts;
        newDeletedIds = cloudData.deletedIds;
    } else if (cloudData.accounts) {
        // Handle potential partial wrapper or legacy wrapper where deletedIds might be missing
        newAccounts = cloudData.accounts;
    }

    accounts = newAccounts;
    deletedAccountIds = newDeletedIds;
    // Reset restoration protection as we are adopting a authoritative state
    restoredAccountIds = [];
    
    localStorage.setItem('accounts', JSON.stringify(accounts));
    localStorage.setItem('deletedAccountIds', JSON.stringify(deletedAccountIds));
    localStorage.removeItem('restoredAccountIds');
    localStorage.removeItem('lastEtag'); // Invalidate ETag as we forced state
    lastEtag = null;
}

export function saveState() {
    localStorage.setItem('accounts', JSON.stringify(accounts));
    localStorage.setItem('deletedAccountIds', JSON.stringify(deletedAccountIds));
    autoExport();
}

window.addEventListener('online', () => {
    console.log('Connection restored. Triggering sync...');
    PubSub.publish(EVENTS.SYNC_STATUS_CHANGED, 'syncing'); // Immediate feedback
    syncWithCloud();
});

window.addEventListener('offline', () => {
    PubSub.publish(EVENTS.SYNC_STATUS_CHANGED, 'offline');
});

// Periodically check for updates when window is focused or visibility changes
window.addEventListener('focus', () => {
    if (cloudSyncEnabled) {
        syncWithCloud();
    }
});

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && cloudSyncEnabled) {
        syncWithCloud();
    }
});
