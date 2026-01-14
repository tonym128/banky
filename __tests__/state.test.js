import { mergeAccounts, setAccounts, removeAccount, accounts, deletedAccountIds, syncWithCloud, setCloudSyncEnabled, setSyncDetails } from '../state.js';
import * as ui from '../ui.js';
import * as s3 from '../s3.js';
import * as idb from '../idb.js';
import * as encryption from '../encryption.js';

// Mock dependencies
jest.mock('../ui.js', () => ({
    renderAll: jest.fn()
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

        // Check if render was called
        expect(ui.renderAll).toHaveBeenCalled();

        // Check if upload happened
        expect(encryption.encryptData).toHaveBeenCalled();
        expect(s3.uploadToS3).toHaveBeenCalledWith('encrypted-data', 'test-guid');
    });
});