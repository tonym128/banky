# Project Context: Kids Bank PWA

## Project Overview
**Kids Bank** is a serverless, privacy-focused Progressive Web App (PWA) designed for parents to manage children's bank accounts. It operates entirely on the client side using modern web technologies and offers secure, encrypted cloud synchronization.

- **Type:** Single Page Application (SPA) / PWA
- **Core Stack:** Vanilla JavaScript (ES Modules), HTML5, CSS3, Bootstrap 5.
- **Data Persistence:** LocalStorage, IndexedDB, File System Access API (optional local sync).
- **Cloud Sync:** AWS S3 or OCI Object Storage (supports Pre-Authenticated Requests).
- **Security:** Client-side AES-256-GCM encryption (Web Crypto API).
- **Deployment:** Static hosting (e.g., Azure Static Web Apps, GitHub Pages, or any web server).

## Architecture & Key Files

The project uses a modular architecture with ES modules (`type="module"` in `index.html`).

### Core Modules
*   **`index.html`**: The main entry point. Contains the DOM structure, imports Bootstrap and Chart.js via CDN, and loads `app.js`.
*   **`app.js`**: The application bootstrapper. It orchestrates the initialization of PWA features, state loading, and UI rendering.
*   **`state.js`**: Manages the application state (accounts, transactions, settings). Handles data persistence to LocalStorage, the local file system, and the cloud.
*   **`ui.js`**: Handles all DOM manipulations, event listeners, and rendering logic (charts, lists, modals).
*   **`encryption.js`**: Provides cryptographic primitives (`generateKey`, `encryptData`, `decryptData`) using the browser's Web Crypto API.
*   **`s3.js`**: Abstraction layer for cloud storage operations. Handles both the AWS SDK v3 client (for standard S3) and direct `fetch` requests (for OCI PAR).

### PWA & Offline Support
*   **`sw.js`**: The Service Worker. Caches the app shell (HTML, CSS, JS) and external assets (Bootstrap, Chart.js, icons) for offline capability.
*   **`pwa.js`**: Handles Service Worker registration and the "Add to Home Screen" install prompt logic.
*   **`manifest.json`**: Metadata for the PWA (name, icons, theme colors).

### Utilities
*   **`idb.js`**: Helper for IndexedDB interactions (likely for storing file handles or larger datasets).
*   **`swa-cli.config.json`**: Configuration for Azure Static Web Apps CLI, indicating a possible deployment target.

## Building and Running

This is a vanilla JavaScript project requiring no compilation or build step.

### Local Development
1.  **Serve:** Use any static file server.
    ```bash
    npx serve .
    # OR
    python3 -m http.server 8080
    ```
2.  **Access:** Open `http://localhost:8080` in your browser.
    *   **Note:** Secure contexts (HTTPS or localhost) are required for Service Workers and the Web Crypto API.

### Testing PWA Features
*   Use Chrome DevTools -> Application tab to inspect the Manifest and Service Worker.
*   Toggle "Offline" in the Network tab to verify caching.

## Development Conventions

*   **Modular JS:** Logic is split into single-responsibility ES modules.
*   **No Bundler:** The project relies on native browser module support and CDN imports for third-party libraries.
*   **Styling:** Bootstrap 5 utility classes are preferred, with custom overrides in `styles.css`.
*   **State Management:** Reactive-like updates are triggered manually (e.g., calling `renderAll()` after state changes).
*   **Async/Await:** Used extensively for file I/O and network operations.
*   **Security:** Never store plain-text data in the cloud. Always encrypt using `encryption.js` before upload.

## Cloud Sync Configuration

The app supports two modes for cloud sync, configured in `s3.js` and `state.js`:

1.  **Credentials Mode:** Uses `AWS SDK v3` with Access Key/Secret Key. Suitable for standard S3 buckets.
2.  **PAR Mode:** Uses direct HTTP `PUT`/`GET` requests to a Pre-Authenticated Request URL. Optimized for Oracle Cloud (OCI) Object Storage.

## QR Code Sharing

*   **Generation:** Uses `qrcode.js` (via CDN) to create a JSON payload containing the config and encryption keys.
*   **Scanning:**
    *   **Camera:** Uses `jsQR` via a custom implementation in `ui.js` (`getUserMedia` + canvas).
    *   **File:** Uses `jsQR` to decode uploaded images.
