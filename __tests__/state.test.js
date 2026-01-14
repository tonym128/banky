import { mergeAccounts, setAccounts, removeAccount, accounts, deletedAccountIds, syncWithCloud, setCloudSyncEnabled, setSyncDetails, replaceState, setDeletedAccountIds, setToastConfig } from '../state.js';
import * as s3 from '../s3.js';
import * as idb from '../idb.js';
import * as encryption from '../encryption.js';
import { PubSub, EVENTS } from '../pubsub.js';

// Mock dependencies
jest.mock('../ui.js', () => ({
    // UI module is no longer directly called by state, so we don't need to mock its exports for these tests
    // unless there are other side effects. State doesn't import UI anymore.
}));

jest.mock('../pubsub.js', () => ({
    PubSub: {
        publish: jest.fn(),
        subscribe: jest.fn()
    },
    EVENTS: {
        STATE_UPDATED: 'STATE_UPDATED',
        SYNC_STATUS_CHANGED: 'SYNC_STATUS_CHANGED',
        TOAST_NOTIFICATION: 'TOAST_NOTIFICATION'
    }
}));

jest.mock('../s3.js', () => ({
    uploadToS3: jest.fn(),
    downloadFromS3: jest.fn(),
    getCloudConfig: jest.fn()
}));

jest.mock('../idb.js', () => ({
    get: jest.fn(),
    set: jest.fn()
}));

jest.mock('../encryption.js', () => ({
    encryptData: jest.fn(),
    decryptData: jest.fn(),
    importKey: jest.fn(),
    generateKey: jest.fn(),
    exportKey: jest.fn()
}));

describe('State Module', () => {
    beforeEach(() => {
        localStorage.clear();
        jest.clearAllMocks();
        // Reset internal state if possible or rely on setAccounts
        setAccounts({});
        setDeletedAccountIds([]);
        
        // Setup encryption mock defaults
        encryption.importKey.mockResolvedValue('mock-crypto-key');
        encryption.encryptData.mockResolvedValue('encrypted-data');
        encryption.decryptData.mockResolvedValue({ accounts: {}, deletedIds: [] });
    });

    test('mergeAccounts: combines local and cloud accounts', () => {
        const local = {
            'acc1': { id: 'acc1', name: 'Local Name', transactions: [] }
        };
        const cloud = {
            'acc2': { id: 'acc2', name: 'Cloud Account', transactions: [] }
        };
        
        const result = mergeAccounts(local, cloud, [], []);
        
        expect(result.accounts['acc1']).toBeDefined();
        expect(result.accounts['acc2']).toBeDefined();
    });

    test('mergeAccounts: prefers local metadata', () => {
        const local = {
            'acc1': { id: 'acc1', name: 'My Name', transactions: [] }
        };
        const cloud = {
            'acc1': { id: 'acc1', name: 'Old Name', transactions: [] }
        };
        
        const result = mergeAccounts(local, cloud, [], []);
        
        expect(result.accounts['acc1'].name).toBe('My Name');
    });

    test('mergeAccounts: merges transactions', () => {
        const local = {
            'acc1': { 
                id: 'acc1', 
                transactions: [{ id: 'tx1', amount: 10, timestamp: 100 }] 
            }
        };
        const cloud = {
            'acc1': { 
                id: 'acc1', 
                transactions: [{ id: 'tx2', amount: 20, timestamp: 200 }] 
            }
        };
        
        const result = mergeAccounts(local, cloud, [], []);
        const txs = result.accounts['acc1'].transactions;
        
        expect(txs).toHaveLength(2);
        expect(txs.find(t => t.id === 'tx1')).toBeDefined();
        expect(txs.find(t => t.id === 'tx2')).toBeDefined();
    });

    test('mergeAccounts: handles deleted accounts (tombstones)', () => {
        const local = {
            'acc1': { id: 'acc1', transactions: [] }
        };
        const cloud = {};
        const localDeleted = [];
        const cloudDeleted = ['acc1'];

        const result = mergeAccounts(local, cloud, localDeleted, cloudDeleted);
        
        expect(result.accounts['acc1']).toBeUndefined();
        expect(result.deletedIds).toContain('acc1');
    });
    
    test('removeAccount: adds to deleted list and removes from accounts', () => {
        setAccounts({
            'acc1': { id: 'acc1' }
        });
        
        removeAccount('acc1');
        
        expect(accounts['acc1']).toBeUndefined();
        expect(deletedAccountIds).toContain('acc1');
    });

    test('syncWithCloud: downloads, merges, and uploads', async () => {
        // Setup Sync Config
        setCloudSyncEnabled(true);
        setSyncDetails('test-guid', { k: 'key' });
        
        // Mock download response
        s3.downloadFromS3.mockResolvedValue('encrypted-cloud-data');
        encryption.decryptData.mockResolvedValue({
            accounts: {
                'cloud-acc': { id: 'cloud-acc', name: 'Cloud', transactions: [] }
            },
            deletedIds: []
        });

        // Setup Local State
        setAccounts({
            'local-acc': { id: 'local-acc', name: 'Local', transactions: [] }
        });

        await syncWithCloud();

        // Check if download happened
        expect(s3.downloadFromS3).toHaveBeenCalledWith('test-guid');
        expect(encryption.decryptData).toHaveBeenCalled();

        // Check if merge happened (implicitly by checking final state)
        expect(accounts['local-acc']).toBeDefined();
        expect(accounts['cloud-acc']).toBeDefined();

        // Check if render was triggered via PubSub
        expect(PubSub.publish).toHaveBeenCalledWith(EVENTS.STATE_UPDATED);

        // Check if upload happened
        expect(encryption.encryptData).toHaveBeenCalled();
        expect(s3.uploadToS3).toHaveBeenCalledWith('encrypted-data', 'test-guid');
    });

    test('replaceState: completely overwrites local state with cloud data', () => {
        // Setup initial local state
        setAccounts({ 'local-acc': { id: 'local-acc' } });
        localStorage.setItem('restoredAccountIds', JSON.stringify(['local-acc']));
        
        const cloudData = {
            accounts: { 'cloud-acc': { id: 'cloud-acc' } },
            deletedIds: ['deleted-acc']
        };

        replaceState(cloudData);

        expect(accounts['local-acc']).toBeUndefined();
        expect(accounts['cloud-acc']).toBeDefined();
        expect(deletedAccountIds).toContain('deleted-acc');
        expect(localStorage.getItem('restoredAccountIds')).toBeNull();
    });

    test('syncWithCloud: skips upload if data is identical', async () => {
        setCloudSyncEnabled(true);
        setSyncDetails('test-guid-opt', { k: 'key' });
        
        const identicalData = {
            accounts: { 'acc1': { id: 'acc1', transactions: [] } },
            deletedIds: []
        };

        // Mock download to return data identical to local
        s3.downloadFromS3.mockResolvedValue('encrypted-cloud-data');
        encryption.decryptData.mockResolvedValue(identicalData);

        // Set local state to match
        setAccounts(identicalData.accounts);

        await syncWithCloud();

        expect(s3.downloadFromS3).toHaveBeenCalled();
        expect(encryption.decryptData).toHaveBeenCalled();
        // Should NOT upload
        expect(s3.uploadToS3).not.toHaveBeenCalled();
    });

    test('syncWithCloud: shows toasts when enabled', async () => {
        setCloudSyncEnabled(true);
        setSyncDetails('test-guid-toast', { k: 'key' });
        
        // Enable Toasts
        setToastConfig({ enabled: true, showSyncStart: true, showSyncSuccess: true });

        // Mock download to force upload path (non-identical)
        s3.downloadFromS3.mockResolvedValue('encrypted-cloud-data');
        encryption.decryptData.mockResolvedValue({ accounts: {}, deletedIds: [] });
        setAccounts({ 'acc1': { id: 'acc1', transactions: [] } });

        await syncWithCloud();

        expect(PubSub.publish).toHaveBeenCalledWith(EVENTS.TOAST_NOTIFICATION, { message: 'Syncing with cloud...', type: 'info' });
        expect(PubSub.publish).toHaveBeenCalledWith(EVENTS.TOAST_NOTIFICATION, { message: 'Sync Complete', type: 'success' });
    });

    test('syncWithCloud: does not show toasts when disabled', async () => {
        setCloudSyncEnabled(true);
        setSyncDetails('test-guid-toast-off', { k: 'key' });
        
        // Disable Toasts
        setToastConfig({ enabled: false });

        // Mock download
        s3.downloadFromS3.mockResolvedValue('encrypted-cloud-data');
        encryption.decryptData.mockResolvedValue({ accounts: {}, deletedIds: [] });
        setAccounts({ 'acc1': { id: 'acc1', transactions: [] } });

        await syncWithCloud();

        expect(PubSub.publish).not.toHaveBeenCalledWith(EVENTS.TOAST_NOTIFICATION, expect.anything());
    });

    test('syncWithCloud: updates sync icon status', async () => {
        setCloudSyncEnabled(true);
        setSyncDetails('test-guid-icon', { k: 'key' });
        
        s3.downloadFromS3.mockResolvedValue('encrypted-cloud-data');
        encryption.decryptData.mockResolvedValue({ accounts: {}, deletedIds: [] });
        
        await syncWithCloud();

        expect(PubSub.publish).toHaveBeenCalledWith(EVENTS.SYNC_STATUS_CHANGED, 'syncing');
        expect(PubSub.publish).toHaveBeenCalledWith(EVENTS.SYNC_STATUS_CHANGED, 'synced');
    });

    test('syncWithCloud: updates sync icon on error', async () => {
        setCloudSyncEnabled(true);
        setSyncDetails('test-guid-icon-error', { k: 'key' });
        
        s3.downloadFromS3.mockRejectedValue(new Error('Network error'));
        
        await syncWithCloud();

        expect(PubSub.publish).toHaveBeenCalledWith(EVENTS.SYNC_STATUS_CHANGED, 'syncing');
        expect(PubSub.publish).toHaveBeenCalledWith(EVENTS.SYNC_STATUS_CHANGED, 'error');
    });
});