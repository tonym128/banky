export async function generateKey() {
    const key = await window.crypto.subtle.generateKey(
        {
            name: "AES-GCM",
            length: 256
        },
        true,
        ["encrypt", "decrypt"]
    );
    return key;
}

export async function exportKey(key) {
    const exported = await window.crypto.subtle.exportKey("jwk", key);
    return exported.k;
}

export async function importKey(k) {
    return await window.crypto.subtle.importKey(
        "jwk",
        {
            k: k,
            kty: "oct",
            key_ops: ["encrypt", "decrypt"],
            alg: "A256GCM",
            ext: true
        },
        {
            name: "AES-GCM",
            length: 256
        },
        true,
        ["encrypt", "decrypt"]
    );
}

export async function encryptData(data, key) {
    const encoded = new TextEncoder().encode(JSON.stringify(data));
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await window.crypto.subtle.encrypt(
        {
            name: "AES-GCM",
            iv: iv
        },
        key,
        encoded
    );

    const encryptedArray = new Uint8Array(encrypted);
    const combined = new Uint8Array(iv.length + encryptedArray.length);
    combined.set(iv);
    combined.set(encryptedArray, iv.length);

    return btoa(String.fromCharCode(...combined));
}

export async function decryptData(encryptedBase64, key) {
    const combined = new Uint8Array(atob(encryptedBase64).split('').map(c => c.charCodeAt(0)));
    const iv = combined.slice(0, 12);
    const encrypted = combined.slice(12);

    const decrypted = await window.crypto.subtle.decrypt(
        {
            name: "AES-GCM",
            iv: iv
        },
        key,
        encrypted
    );

    const decoded = new TextDecoder().decode(decrypted);
    return JSON.parse(decoded);
}
