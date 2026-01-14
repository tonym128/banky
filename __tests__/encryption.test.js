import { generateKey, exportKey, importKey, encryptData, decryptData } from '../encryption.js';

describe('Encryption Module', () => {
    test('generateKey creates a CryptoKey', async () => {
        const key = await generateKey();
        expect(key).toBeDefined();
        expect(key.algorithm.name).toBe('AES-GCM');
    });

    test('exportKey and importKey work symmetrically', async () => {
        const originalKey = await generateKey();
        const k = await exportKey(originalKey);
        
        expect(typeof k).toBe('string');

        const importedKey = await importKey(k);
        expect(importedKey.algorithm.name).toBe('AES-GCM');
    });

    test('encryptData and decryptData work symmetrically', async () => {
        const key = await generateKey();
        const data = { secret: "message", id: 123 };
        
        const encryptedBase64 = await encryptData(data, key);
        expect(typeof encryptedBase64).toBe('string');
        expect(encryptedBase64).not.toBe(JSON.stringify(data));

        const decrypted = await decryptData(encryptedBase64, key);
        expect(decrypted).toEqual(data);
    });
});
