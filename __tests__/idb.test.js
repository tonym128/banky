import { get, set } from '../idb.js';

const mockIndexedDB = {
    open: jest.fn(),
};

global.indexedDB = mockIndexedDB;

describe('IDB Module', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('set: opens DB and puts value', async () => {
        const mockPut = jest.fn();
        const mockStore = { put: mockPut };
        const mockTransaction = { objectStore: jest.fn(() => mockStore) };
        const mockDb = { transaction: jest.fn(() => mockTransaction), createObjectStore: jest.fn() };

        // Mock open success
        mockIndexedDB.open.mockImplementation(() => {
            const request = {};
            setTimeout(() => {
                request.onsuccess({ target: { result: mockDb } });
            }, 0);
            return request;
        });

        // Mock put success
        mockPut.mockImplementation((val) => {
            const request = {};
            setTimeout(() => {
                request.onsuccess();
            }, 0);
            return request;
        });

        await set('key', 'value');

        expect(mockIndexedDB.open).toHaveBeenCalledWith('file-sync-db', 1);
        expect(mockDb.transaction).toHaveBeenCalledWith('file-handles', 'readwrite');
        expect(mockStore.put).toHaveBeenCalledWith({ id: 'key', value: 'value' });
    });

    test('get: opens DB and gets value', async () => {
        const mockGet = jest.fn();
        const mockStore = { get: mockGet };
        const mockTransaction = { objectStore: jest.fn(() => mockStore) };
        const mockDb = { transaction: jest.fn(() => mockTransaction) };

        mockIndexedDB.open.mockImplementation(() => {
            const request = {};
            setTimeout(() => {
                request.onsuccess({ target: { result: mockDb } });
            }, 0);
            return request;
        });

        mockGet.mockImplementation(() => {
            const request = {};
            setTimeout(() => {
                request.onsuccess({ target: { result: { value: 'retrieved-value' } } });
            }, 0);
            return request;
        });

        const result = await get('key');

        expect(result).toBe('retrieved-value');
    });
});
