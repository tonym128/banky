// idb.js

function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('file-sync-db', 1);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            db.createObjectStore('file-handles', { keyPath: 'id' });
        };

        request.onsuccess = (event) => {
            resolve(event.target.result);
        };

        request.onerror = (event) => {
            reject(event.target.error);
        };
    });
}

async function set(key, value) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction('file-handles', 'readwrite');
        const store = transaction.objectStore('file-handles');
        const request = store.put({ id: key, value });

        request.onsuccess = () => {
            resolve();
        };

        request.onerror = (event) => {
            reject(event.target.error);
        };
    });
}

async function get(key) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction('file-handles', 'readonly');
        const store = transaction.objectStore('file-handles');
        const request = store.get(key);

        request.onsuccess = (event) => {
            resolve(event.target.result ? event.target.result.value : null);
        };

        request.onerror = (event) => {
            reject(event.target.error);
        };
    });
}
