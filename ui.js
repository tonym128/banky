// ui.js
import { accounts, saveState, setAccounts, replaceState, deletedAccountIds, setDeletedAccountIds, cloudSyncEnabled, setCloudSyncEnabled, setSyncDetails, syncGuid, encryptionKeyJwk, removeAccount, toastConfig, setToastConfig, loadFromCloud } from './state.js';
import { setCloudConfig, getCloudConfig, initS3Client } from './s3.js';
import { generateKey, exportKey } from './encryption.js';
import { resizeImage } from './utils.js';
import { PubSub, EVENTS } from './pubsub.js';

const logBuffer = [];
const originalLog = console.log;
const originalError = console.error;

function formatLog(level, args) {
    const timestamp = new Date().toISOString();
    const message = args.map(arg => {
        try {
            return typeof arg === 'object' ? JSON.stringify(arg) : String(arg);
        } catch (e) {
            return String(arg);
        }
    }).join(' ');
    return `[${timestamp}] [${level}] ${message}`;
}

console.log = function(...args) {
    logBuffer.push(formatLog('INFO', args));
    if (logBuffer.length > 1000) logBuffer.shift(); 
    originalLog.apply(console, args);
};

console.error = function(...args) {
    logBuffer.push(formatLog('ERROR', args));
    if (logBuffer.length > 1000) logBuffer.shift();
    originalError.apply(console, args);
};

let charts = {};
let currentAccountId = null;

export function showToast(message, type = 'info') {
    const toastContainer = document.querySelector('.toast-container');
    if (!toastContainer) return;

    const toastEl = document.createElement('div');
    toastEl.className = `toast align-items-center text-white bg-${type === 'error' ? 'danger' : type === 'success' ? 'success' : 'primary'} border-0`;
    toastEl.setAttribute('role', 'alert');
    toastEl.setAttribute('aria-live', 'assertive');
    toastEl.setAttribute('aria-atomic', 'true');
    
    toastEl.innerHTML = `
        <div class="d-flex">
            <div class="toast-body">
                ${message}
            </div>
            <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
        </div>
    `;

    toastContainer.appendChild(toastEl);
    const toast = new bootstrap.Toast(toastEl, { delay: 3000 });
    toast.show();
    
    toastEl.addEventListener('hidden.bs.toast', () => {
        toastEl.remove();
    });
}

export function updateSyncIcon(status) {
    const icon = document.getElementById('sync-status-icon');
    if (!icon) return;

    icon.classList.remove('spin');
    
    switch (status) {
        case 'synced':
            icon.textContent = '🟢';
            icon.title = 'Synced';
            break;
        case 'syncing':
            icon.textContent = '🔄';
            icon.classList.add('spin');
            icon.title = 'Syncing...';
            break;
        case 'offline':
            icon.textContent = '🔴';
            icon.title = 'Offline';
            break;
        case 'disabled':
            icon.textContent = '⚪';
            icon.title = 'Sync Disabled';
            break;
        case 'error':
             icon.textContent = '⚠️';
             icon.title = 'Sync Error';
             break;
    }
}

export function initUI() {
    // Subscribe to state changes
    PubSub.subscribe(EVENTS.STATE_UPDATED, () => renderAll());
    PubSub.subscribe(EVENTS.SYNC_STATUS_CHANGED, (status) => updateSyncIcon(status));
    PubSub.subscribe(EVENTS.TOAST_NOTIFICATION, (data) => showToast(data.message, data.type));

    const addAccountBtn = document.getElementById('add-account-btn');
    const accountNameInput = document.getElementById('account-name');
    const accountImageInput = document.getElementById('account-image');
    const importFileInput = document.getElementById('import-file');
    const exportDataBtn = document.getElementById('export-data-btn');
    const importDataBtn = document.getElementById('import-data-btn');
    const accountsContainer = document.getElementById('accounts-container');
    
    // Cloud Sync UI Elements
    const cloudSyncToggle = document.getElementById('cloud-sync-toggle');
    const cloudSyncSettings = document.getElementById('cloud-sync-settings');
    const modeSelectCredentials = document.getElementById('mode-select-credentials');
    const modeSelectPar = document.getElementById('mode-select-par');
    const modeCredentialsDiv = document.getElementById('mode-credentials');
    const modeParDiv = document.getElementById('mode-par');

    const awsEndpointInput = document.getElementById('aws-endpoint');
    const awsBucketInput = document.getElementById('aws-bucket');
    const awsRegionInput = document.getElementById('aws-region');
    const awsAccessKeyInput = document.getElementById('aws-access-key');
    const awsSecretKeyInput = document.getElementById('aws-secret-key');
    const awsParUrlInput = document.getElementById('aws-par-url');

    const saveCloudConfigBtn = document.getElementById('save-cloud-config-btn');
    const generateSyncKeysBtn = document.getElementById('generate-sync-keys-btn');
    const showKeysBtn = document.getElementById('show-keys-btn');
    const keysDisplayContainer = document.getElementById('keys-display-container');
    const showQrBtn = document.getElementById('show-qr-btn');
    const scanQrBtn = document.getElementById('scan-qr-btn');
    const scanQrFileBtn = document.getElementById('scan-qr-file-btn');
    const qrFileInput = document.getElementById('qr-file-input');
    const qrCodeContainer = document.getElementById('qr-code-container');
    const importConfigText = document.getElementById('import-config-text');
    const importConfigBtn = document.getElementById('import-config-btn');
    const showLogsBtn = document.getElementById('show-logs-btn');
    const logsModal = new bootstrap.Modal(document.getElementById('logs-modal'));
    const logsContainer = document.getElementById('logs-container');
    const copyLogsBtn = document.getElementById('copy-logs-btn');
    const qrScannerModal = new bootstrap.Modal(document.getElementById('qr-scanner-modal'));

    if (showKeysBtn && keysDisplayContainer) {
        showKeysBtn.addEventListener('click', () => {
            if (keysDisplayContainer.style.display === 'none') {
                if (!syncGuid || !encryptionKeyJwk) {
                    alert('No sync keys found. Please generate keys first.');
                    return;
                }
                keysDisplayContainer.innerHTML = `<strong>Sync ID:</strong> ${syncGuid}<br><br><strong>Encryption Key (JWK):</strong><br>${JSON.stringify(encryptionKeyJwk)}`;
                keysDisplayContainer.style.display = 'block';
                showKeysBtn.textContent = 'Hide Secrets';
            } else {
                keysDisplayContainer.style.display = 'none';
                showKeysBtn.textContent = 'Show Secrets';
            }
        });
    }

    if (showLogsBtn) {
        showLogsBtn.addEventListener('click', () => {
            logsContainer.textContent = logBuffer.join('\n');
            logsModal.show();
        });
    }

    if (copyLogsBtn) {
        copyLogsBtn.addEventListener('click', () => {
            navigator.clipboard.writeText(logsContainer.textContent).then(() => {
                alert('Logs copied to clipboard!');
            }).catch(err => {
                console.error('Failed to copy logs:', err);
                alert('Failed to copy logs.');
            });
        });
    }

    const accountContextMenu = new bootstrap.Modal(document.getElementById('account-context-menu'));
    const removeAccountLink = document.getElementById('remove-account-link');
    const addEditImageLink = document.getElementById('add-edit-image-link');
    const removeImageLink = document.getElementById('remove-image-link');
    const editAccountImageInput = document.getElementById('edit-account-image');

    // Toast Config UI
    const toastEnabledCheckbox = document.getElementById('toast-enabled');
    const toastSyncStartCheckbox = document.getElementById('toast-sync-start');
    const toastSyncSuccessCheckbox = document.getElementById('toast-sync-success');

    if (toastEnabledCheckbox && toastSyncStartCheckbox && toastSyncSuccessCheckbox) {
        toastEnabledCheckbox.checked = toastConfig.enabled;
        toastSyncStartCheckbox.checked = toastConfig.showSyncStart;
        toastSyncSuccessCheckbox.checked = toastConfig.showSyncSuccess;

        function updateToastUI() {
            const enabled = toastEnabledCheckbox.checked;
            toastSyncStartCheckbox.disabled = !enabled;
            toastSyncSuccessCheckbox.disabled = !enabled;
            // Visual cue for disabled state (Bootstrap handles disabled input, but maybe opacity for label?)
            // Bootstrap should handle standard disabled look.
        }

        function updateToastConfig() {
            updateToastUI();
            setToastConfig({
                enabled: toastEnabledCheckbox.checked,
                showSyncStart: toastSyncStartCheckbox.checked,
                showSyncSuccess: toastSyncSuccessCheckbox.checked
            });
        }

        toastEnabledCheckbox.addEventListener('change', updateToastConfig);
        toastSyncStartCheckbox.addEventListener('change', updateToastConfig);
        toastSyncSuccessCheckbox.addEventListener('change', updateToastConfig);
        
        // Initialize UI state
        updateToastUI();
    }

    cloudSyncToggle.checked = cloudSyncEnabled;

    if (cloudSyncEnabled) {
        cloudSyncSettings.style.display = 'block';
    }

    // Toggle logic for modes
    function updateModeVisibility() {
        if (modeSelectPar.checked) {
            modeCredentialsDiv.style.display = 'none';
            modeParDiv.style.display = 'block';
        } else {
            modeCredentialsDiv.style.display = 'block';
            modeParDiv.style.display = 'none';
        }
    }

    modeSelectCredentials.addEventListener('change', updateModeVisibility);
    modeSelectPar.addEventListener('change', updateModeVisibility);

    // Init Cloud Config Inputs
    const existingCloudConfig = getCloudConfig();
    if (existingCloudConfig) {
        if (existingCloudConfig.parUrl) {
            modeSelectPar.checked = true;
            awsParUrlInput.value = existingCloudConfig.parUrl;
        } else {
            modeSelectCredentials.checked = true;
            awsEndpointInput.value = existingCloudConfig.endpoint || '';
            awsBucketInput.value = existingCloudConfig.bucket || '';
            awsRegionInput.value = existingCloudConfig.region || '';
            awsAccessKeyInput.value = existingCloudConfig.accessKeyId || '';
            awsSecretKeyInput.value = existingCloudConfig.secretAccessKey || '';
        }
        updateModeVisibility();
    }

    exportDataBtn.addEventListener('click', () => {
        const data = { accounts, deletedAccountIds };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'kids-bank-data.json';
        a.click();
        URL.revokeObjectURL(url);
    });

    importDataBtn.addEventListener('click', () => {
        importFileInput.click();
    });

    importFileInput.addEventListener('change', () => {
        const file = importFileInput.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const importedPayload = JSON.parse(e.target.result);
                    let importedAccounts = importedPayload.accounts || importedPayload; // Handle wrapped or direct accounts
                    let importedDeletedAccountIds = importedPayload.deletedAccountIds || [];
                    
                    setAccounts(importedAccounts, true);
                    setDeletedAccountIds(importedDeletedAccountIds); // Update deletedAccountIds
                    saveState();
                    renderAll();
                    alert('Data imported successfully. Any previously deleted accounts in this file have been restored.');
                } catch (error) {
                    console.error(error);
                    alert('Invalid JSON file.');
                }
            };
            reader.readAsText(file);
        }
    });

    // Cloud Sync Event Listeners
    cloudSyncToggle.addEventListener('change', () => {
        const enabled = cloudSyncToggle.checked;
        setCloudSyncEnabled(enabled);
        cloudSyncSettings.style.display = enabled ? 'block' : 'none';
        if (enabled) {
            saveState(); // Triggers sync if configured
        }
    });

    saveCloudConfigBtn.addEventListener('click', () => {
        let config = {};

        if (modeSelectPar.checked) {
            // PAR Mode
            const parUrl = awsParUrlInput.value.trim();
            if (!parUrl) {
                 alert('Please enter a valid PAR URL.');
                 return;
            }
            config = { parUrl };
        } else {
            // Credentials Mode
             config = {
                endpoint: awsEndpointInput.value.trim(),
                bucket: awsBucketInput.value.trim(),
                region: awsRegionInput.value.trim(),
                accessKeyId: awsAccessKeyInput.value.trim(),
                secretAccessKey: awsSecretKeyInput.value.trim()
            };
            if (!config.bucket || !config.region || !config.accessKeyId || !config.secretAccessKey) {
                alert('Please fill in all AWS configuration fields (Endpoint is optional for AWS).');
                return;
            }
        }
        
        setCloudConfig(config);
        alert('Cloud configuration saved.');
        saveState(); // Trigger sync attempt
    });

    generateSyncKeysBtn.addEventListener('click', async () => {
        if (!confirm('This will generate a new sync ID and encryption key. Any existing data in the cloud with the old ID will be lost to this device (unless you have a backup). Continue?')) {
            return;
        }
        const guid = crypto.randomUUID();
        const key = await generateKey();
        const jwk = await exportKey(key);
        setSyncDetails(guid, jwk);
        alert('New Sync ID and Encryption Key generated. You can now sync.');
        saveState();
    });

    showQrBtn.addEventListener('click', () => {
        const cloudConfig = getCloudConfig();
        if (!cloudConfig || !syncGuid || !encryptionKeyJwk) {
            alert('Please configure Cloud Sync (AWS details + Generate Keys) first.');
            return;
        }

        // Construct the payload
        const payload = {
            aws: cloudConfig,
            guid: syncGuid,
            key: encryptionKeyJwk
        };

        qrCodeContainer.innerHTML = '';
        new QRCode(qrCodeContainer, {
            text: JSON.stringify(payload),
            width: 400,
            height: 400,
            correctLevel: QRCode.CorrectLevel.L
        });
        
        // Make responsive
        const qrImg = qrCodeContainer.querySelector('img');
        if (qrImg) {
            qrImg.style.maxWidth = '100%';
            qrImg.style.height = 'auto';
            
            // Add Download Button
            const downloadBtn = document.createElement('button');
            downloadBtn.textContent = 'Download QR Image';
            downloadBtn.className = 'btn btn-outline-secondary btn-sm mt-2';
            downloadBtn.addEventListener('click', () => {
                const link = document.createElement('a');
                link.download = 'kids-bank-sync-qr.png';
                link.href = qrImg.src;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            });
            qrCodeContainer.appendChild(document.createElement('br'));
            qrCodeContainer.appendChild(downloadBtn);
        } else {
             // If qrcodejs uses canvas (older browsers or config), handle canvas too
             const canvas = qrCodeContainer.querySelector('canvas');
             if (canvas) {
                canvas.style.maxWidth = '100%';
                canvas.style.height = 'auto';
                
                const downloadBtn = document.createElement('button');
                downloadBtn.textContent = 'Download QR Image';
                downloadBtn.className = 'btn btn-outline-secondary btn-sm mt-2';
                downloadBtn.addEventListener('click', () => {
                    const link = document.createElement('a');
                    link.download = 'kids-bank-sync-qr.png';
                    link.href = canvas.toDataURL("image/png");
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                });
                qrCodeContainer.appendChild(document.createElement('br'));
                qrCodeContainer.appendChild(downloadBtn);
             }
        }
    });

    async function processImportedConfig(payload) {
        if (!payload.aws || !payload.guid || !payload.key) {
            alert('Invalid configuration format. Missing aws config, guid, or encryption key.');
            console.error('Import failed. Invalid payload structure:', payload);
            return;
        }

        console.log("Importing Configuration:", {
            mode: payload.aws.parUrl ? 'PAR' : 'Credentials',
            guid: payload.guid,
            hasKey: !!payload.key
        });

        if (payload.aws && payload.guid && payload.key) {
            setCloudConfig(payload.aws);
            setSyncDetails(payload.guid, payload.key);
            
            // Update UI inputs
            if (payload.aws.parUrl) {
                modeSelectPar.checked = true;
                awsParUrlInput.value = payload.aws.parUrl;
            } else {
                modeSelectCredentials.checked = true;
                awsEndpointInput.value = payload.aws.endpoint || '';
                awsBucketInput.value = payload.aws.bucket;
                awsRegionInput.value = payload.aws.region;
                awsAccessKeyInput.value = payload.aws.accessKeyId;
                awsSecretKeyInput.value = payload.aws.secretAccessKey;
            }
            updateModeVisibility();

            // Load Data
            initS3Client();
            const data = await loadFromCloud();
            if (data) {
                replaceState(data);
                renderAll();
                alert('Configuration imported and data synced successfully!');
            } else {
                alert('Configuration imported. No data found on cloud yet or download failed.');
            }
        }
    }

    importConfigBtn.addEventListener('click', async () => {
        const text = importConfigText.value.trim();
        if (!text) return;
        try {
            const payload = JSON.parse(text);
            await processImportedConfig(payload);
        } catch (e) {
            console.error(e);
            alert('Failed to parse configuration. Ensure it is valid JSON.');
        }
    });

    scanQrFileBtn.addEventListener('click', () => {
        qrFileInput.click();
    });

    qrFileInput.addEventListener('change', async () => {
        const file = qrFileInput.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');
                canvas.width = img.width;
                canvas.height = img.height;
                context.drawImage(img, 0, 0, img.width, img.height);
                const imageData = context.getImageData(0, 0, img.width, img.height);
                const code = jsQR(imageData.data, imageData.width, imageData.height);

                if (code) {
                    console.log("File Scan Result:", code.data);
                    try {
                        const payload = JSON.parse(code.data);
                        processImportedConfig(payload);
                    } catch (e) {
                        console.error("Scanned text is not valid JSON:", e);
                        alert("Scanned QR code does not contain a valid configuration.");
                    }
                } else {
                    alert("Failed to detect a QR code in the image.");
                }
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
        qrFileInput.value = ''; // Reset input
    });

    let videoStream = null;
    let isScanning = false;

    scanQrBtn.addEventListener('click', () => {
        qrScannerModal.show();
        const qrReaderDiv = document.getElementById('qr-reader');
        qrReaderDiv.innerHTML = ''; // Clear previous content

        const video = document.createElement('video');
        video.style.width = '100%';
        qrReaderDiv.appendChild(video);

        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d', { willReadFrequently: true });

        navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } }).then(function(stream) {
            videoStream = stream;
            video.srcObject = stream;
            video.setAttribute("playsinline", true); // required to tell iOS safari we don't want fullscreen
            video.play();
            isScanning = true;
            requestAnimationFrame(tick);
        }).catch(function(err) {
            console.error(err);
            qrReaderDiv.innerHTML = '<p class="text-danger">Failed to access camera. Please allow camera permissions.</p>';
        });

        function tick() {
            if (!isScanning) return;

            if (video.readyState === video.HAVE_ENOUGH_DATA) {
                canvas.height = video.videoHeight;
                canvas.width = video.videoWidth;
                context.drawImage(video, 0, 0, canvas.width, canvas.height);
                const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
                const code = jsQR(imageData.data, imageData.width, imageData.height, {
                    inversionAttempts: "dontInvert",
                });

                if (code) {
                    console.log("Found QR code", code.data);
                    try {
                        const payload = JSON.parse(code.data);
                        stopScanning();
                        qrScannerModal.hide();
                        processImportedConfig(payload);
                    } catch (e) {
                         // Ignore invalid JSON, keep scanning or maybe show a toast?
                         console.log("Scanned code is not valid config JSON", e);
                    }
                }
            }
            requestAnimationFrame(tick);
        }
    });

    function stopScanning() {
        isScanning = false;
        if (videoStream) {
            videoStream.getTracks().forEach(track => track.stop());
            videoStream = null;
        }
    }

    document.getElementById('qr-scanner-modal').addEventListener('hidden.bs.modal', () => {
        stopScanning();
    });

    importFileInput.addEventListener('change', () => {
        const file = importFileInput.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    let importedData = JSON.parse(e.target.result);
                    // Handle wrapped format vs legacy format
                    if (importedData.accounts) {
                        importedData = importedData.accounts;
                    }
                    
                    // Revive accounts on explicit import
                    setAccounts(importedData, true);
                    saveState();
                    renderAll();
                    alert('Data imported successfully. Any previously deleted accounts in this file have been restored.');
                } catch (error) {
                    console.error(error);
                    alert('Invalid JSON file.');
                }
            };
            reader.readAsText(file);
        }
    });

    addAccountBtn.addEventListener('click', async () => {
        const name = accountNameInput.value.trim();
        const imageFile = accountImageInput.files[0];

        if (name) {
            let image = null;
            if (imageFile) {
                try {
                    image = await resizeImage(imageFile);
                } catch (e) {
                    console.error("Failed to resize image", e);
                    alert("Failed to process image.");
                    return;
                }
            }
            
            const id = Date.now().toString();
            accounts[id] = { name, transactions: [], image };
            accountNameInput.value = '';
            accountImageInput.value = '';
            saveState();
            renderAll(id);
        }
    });

    removeAccountLink.addEventListener('click', (e) => {
        e.preventDefault();
        if (currentAccountId && confirm('Are you sure you want to remove this account?')) {
            removeAccount(currentAccountId);
            renderAll(currentAccountId);
        }
        accountContextMenu.hide();
    });

    addEditImageLink.addEventListener('click', (e) => {
        e.preventDefault();
        editAccountImageInput.click();
        accountContextMenu.hide();
    });

    removeImageLink.addEventListener('click', (e) => {
        e.preventDefault();
        if (currentAccountId && accounts[currentAccountId].image) {
            delete accounts[currentAccountId].image;
            saveState();
            renderAll(currentAccountId);
        }
        accountContextMenu.hide();
    });

    editAccountImageInput.addEventListener('change', async () => {
        const file = editAccountImageInput.files[0];
        if (file && currentAccountId) {
            try {
                const resized = await resizeImage(file);
                accounts[currentAccountId].image = resized;
                saveState();
                renderAll(currentAccountId);
            } catch (e) {
                console.error("Failed to resize image", e);
                alert("Failed to process image.");
            }
        }
    });

    accountsContainer.addEventListener('click', (e) => {
        if (e.target.classList.contains('delete-transaction-btn')) {
            const accountId = e.target.dataset.accountId;
            const transactionId = e.target.dataset.transactionId; // Keep as string
            
            // Compare as strings to handle both UUIDs and legacy numeric IDs
            const transactionIndex = accounts[accountId].transactions.findIndex(tx => String(tx.id) === transactionId);
            
            if (transactionIndex > -1) {
                accounts[accountId].transactions[transactionIndex].deleted = true;
                accounts[accountId].transactions[transactionIndex].timestamp = Date.now();
                saveState();
                renderAll(accountId);
            }
        }
    });

    renderAll();
}

export function renderAll(accountId = null) {
    if (accountId) {
        const account = accounts[accountId];
        const existingEl = document.querySelector(`.accordion-item[data-account-id="${accountId}"]`);

        if (!account) {
            if (existingEl) existingEl.remove();
            return;
        }

        const newEl = createAccountElement(accountId, account);

        if (existingEl) {
            const wasOpen = existingEl.querySelector('.accordion-collapse').classList.contains('show');
            if (wasOpen) {
                const collapse = newEl.querySelector('.accordion-collapse');
                collapse.classList.add('show');
                const btn = newEl.querySelector('.accordion-button');
                btn.classList.remove('collapsed');
                btn.setAttribute('aria-expanded', 'true');
            }
            existingEl.replaceWith(newEl);
        } else {
            document.getElementById('accounts-container').appendChild(newEl);
        }
    } else {
        const activeAccountIds = [...document.querySelectorAll('.accordion-collapse.show')].map(el => el.id.replace('collapse-', ''));
        renderAccounts();
        activeAccountIds.forEach(id => {
            const accountCollapse = document.getElementById(`collapse-${id}`);
            if (accountCollapse) {
                new bootstrap.Collapse(accountCollapse, {
                    toggle: true
                });
            }
        });
    }
}

function renderAccounts() {
    const accountsContainer = document.getElementById('accounts-container');
    accountsContainer.innerHTML = '';
    for (const id in accounts) {
        accountsContainer.appendChild(createAccountElement(id, accounts[id]));
    }
}

function createAccountElement(id, account) {
    const accountBox = document.createElement('div');
    accountBox.className = 'accordion-item';
    accountBox.dataset.accountId = id;

    const header = document.createElement('h2');
    header.className = 'accordion-header';
    header.id = `heading-${id}`;

    const button = document.createElement('button');
    button.className = 'accordion-button collapsed';
    button.type = 'button';
    button.dataset.bsToggle = 'collapse';
    button.dataset.bsTarget = `#collapse-${id}`;
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-controls', `collapse-${id}`);

    let imageHtml = '';
    if (account.image) {
        imageHtml = `<img src="${account.image}" class="account-summary-image rounded-circle me-2" style="width: 30px; height: 30px;">`;
    }
    const balance = account.transactions.filter(tx => !tx.deleted).reduce((sum, tx) => sum + tx.amount, 0);
    button.innerHTML = `${imageHtml}<strong>${account.name}</strong>&nbsp;- Balance: ${balance.toFixed(2)}`;

    button.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        currentAccountId = id;
        const accountContextMenu = new bootstrap.Modal(document.getElementById('account-context-menu'));
        accountContextMenu.show();
    });

    header.appendChild(button);
    accountBox.appendChild(header);

    const contentContainer = document.createElement('div');
    contentContainer.id = `collapse-${id}`;
    contentContainer.className = 'accordion-collapse collapse';
    contentContainer.setAttribute('aria-labelledby', `heading-${id}`);
    contentContainer.dataset.bsParent = '#accounts-container';

    const content = document.createElement('div');
    content.className = 'accordion-body';

    const earnSpendSection = document.createElement('div');
    earnSpendSection.className = 'row';
    earnSpendSection.innerHTML = `
        <div class="col-md-6">
            <div class="card bg-success-subtle mb-3">
                <div class="card-body">
                    <h5 class="card-title">Earn</h5>
                    <input type="date" id="earn-date-${id}" class="form-control mb-2">
                    <input type="text" id="earn-description-${id}" class="form-control mb-2" placeholder="Description">
                    <input type="number" id="earn-amount-${id}" class="form-control mb-2" placeholder="Amount">
                    <button id="earn-btn-${id}" class="btn btn-success">Save</button>
                </div>
            </div>
        </div>
        <div class="col-md-6">
            <div class="card bg-danger-subtle mb-3">
                <div class="card-body">
                    <h5 class="card-title">Spend</h5>
                    <input type="date" id="spend-date-${id}" class="form-control mb-2">
                    <input type="text" id="spend-description-${id}" class="form-control mb-2" placeholder="Description">
                    <input type="number" id="spend-amount-${id}" class="form-control mb-2" placeholder="Amount">
                    <button id="spend-btn-${id}" class="btn btn-danger">Save</button>
                </div>
            </div>
        </div>
    `;
    content.appendChild(earnSpendSection);

    const graphHeader = document.createElement('h3');
    graphHeader.textContent = 'Balance History';
    content.appendChild(graphHeader);

    const canvas = document.createElement('canvas');
    content.appendChild(canvas);

    const transactionHeader = document.createElement('h3');
    transactionHeader.textContent = 'Transactions';
    content.appendChild(transactionHeader);

    const dateFilterSection = document.createElement('div');
    dateFilterSection.className = 'row mb-3';
    dateFilterSection.innerHTML = `
        <div class="col-md-4">
            <label for="month-select-${id}" class="form-label">Month</label>
            <select id="month-select-${id}" class="form-select">
                <option value="-1">All</option>
                ${[...Array(12).keys()].map(i => `<option value="${i}">${new Date(0, i).toLocaleString('default', { month: 'long' })}</option>`).join('')}
            </select>
        </div>
        <div class="col-md-4">
            <label for="year-select-${id}" class="form-label">Year</label>
            <select id="year-select-${id}" class="form-select"></select>
        </div>
    `;
    content.appendChild(dateFilterSection);

    const startingBalanceEl = document.createElement('p');
    content.appendChild(startingBalanceEl);

    const transactionList = document.createElement('table');
    transactionList.className = 'table table-striped';
    transactionList.innerHTML = `
        <thead>
            <tr>
                <th>Date</th>
                <th>Description</th>
                <th>Amount</th>
                <th></th>
            </tr>
        </thead>
        <tbody></tbody>
    `;
    content.appendChild(transactionList);
    
    contentContainer.appendChild(content);
    accountBox.appendChild(contentContainer);

    const monthSelect = content.querySelector(`#month-select-${id}`);
    const yearSelect = content.querySelector(`#year-select-${id}`);

    const years = [...new Set(account.transactions.filter(tx => !tx.deleted).map(tx => new Date(tx.date).getFullYear()))];
    yearSelect.innerHTML = '<option value="-1">All</option>' + years.map(y => `<option value="${y}">${y}</option>`).join('');

    const updateTransactions = () => {
        const selectedMonth = parseInt(monthSelect.value, 10);
        const selectedYear = parseInt(yearSelect.value, 10);

        let filteredTransactions = account.transactions.filter(tx => !tx.deleted);

        if (selectedYear !== -1) {
            filteredTransactions = filteredTransactions.filter(tx => new Date(tx.date).getFullYear() === selectedYear);
        }
        if (selectedMonth !== -1) {
            filteredTransactions = filteredTransactions.filter(tx => new Date(tx.date).getMonth() === selectedMonth);
        }

        const startingBalance = account.transactions
            .filter(tx => !tx.deleted)
            .filter(tx => {
                const txDate = new Date(tx.date);
                if (selectedYear === -1) return false;
                if (selectedMonth === -1) {
                    return txDate.getFullYear() < selectedYear;
                }
                return txDate < new Date(selectedYear, selectedMonth, 1);
            })
            .reduce((sum, tx) => sum + tx.amount, 0);

        startingBalanceEl.textContent = `Starting Balance: ${startingBalance.toFixed(2)}`;

        const transactionListBody = transactionList.querySelector('tbody');
        transactionListBody.innerHTML = '';
        filteredTransactions.forEach((tx) => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${tx.date}</td>
                <td>${tx.description}</td>
                <td>${tx.amount.toFixed(2)}</td>
                <td><button class="btn btn-sm btn-warning delete-transaction-btn" data-account-id="${id}" data-transaction-id="${tx.id}">Delete</button></td>
            `;
            transactionListBody.appendChild(row);
        });
        renderGraph(canvas, account, id, filteredTransactions);
    };

    monthSelect.addEventListener('change', updateTransactions);
    yearSelect.addEventListener('change', updateTransactions);

    content.querySelector(`#earn-date-${id}`).valueAsDate = new Date();
    content.querySelector(`#spend-date-${id}`).valueAsDate = new Date();

    content.querySelector(`#earn-btn-${id}`).addEventListener('click', () => {
        const description = content.querySelector(`#earn-description-${id}`).value.trim();
        const amount = parseFloat(content.querySelector(`#earn-amount-${id}`).value);
        let date = content.querySelector(`#earn-date-${id}`).value;
        if (!date) {
            date = new Date().toISOString().split('T')[0];
        }
        if (!isNaN(amount)) {
            accounts[id].transactions.push({ id: crypto.randomUUID(), date, description, amount, timestamp: Date.now() });
            content.querySelector(`#earn-description-${id}`).value = '';
            content.querySelector(`#earn-amount-${id}`).value = '';
            saveState();
            renderAll(id);
        }
    });

    content.querySelector(`#spend-btn-${id}`).addEventListener('click', () => {
        const description = content.querySelector(`#spend-description-${id}`).value.trim();
        const amount = parseFloat(content.querySelector(`#spend-amount-${id}`).value);
        let date = content.querySelector(`#spend-date-${id}`).value;
        if (!date) {
            date = new Date().toISOString().split('T')[0];
        }
        if (!isNaN(amount)) {
            accounts[id].transactions.push({ id: crypto.randomUUID(), date, description, amount: -amount, timestamp: Date.now() });
            content.querySelector(`#spend-description-${id}`).value = '';
            content.querySelector(`#spend-amount-${id}`).value = '';
            saveState();
            renderAll(id);
        }
    });
    updateTransactions();

    return accountBox;
}

export function calculateGraphData(transactions, daysToDisplay = 30) {
    const today = new Date();
    const transactionsToGraph = [...transactions]; // Clone to sort safely
    transactionsToGraph.sort((a, b) => new Date(a.date) - new Date(b.date));

    const labels = [];
    const data = [];
    let runningBalance = 0;

    const dateMap = new Map();
    transactionsToGraph.forEach(tx => {
        runningBalance += tx.amount;
        dateMap.set(tx.date, runningBalance);
    });

    for (let i = 0; i < daysToDisplay; i++) {
        const date = new Date(today);
        date.setDate(today.getDate() - i);
        const dateString = date.toISOString().split('T')[0];
        labels.unshift(dateString);

        if (dateMap.has(dateString)) {
            data.unshift(dateMap.get(dateString));
        } else {
            let previousBalance = 0;
            // Find the most recent balance before this date
            // Since we iterate backwards in time for display, checking the map directly is better
            // Ideally, we need the balance as of that specific date.
            
            // Optimization: Iterate through sorted transactions to find balance at date
            // Or simpler: Reuse the logic from original code which looked at dateMap keys
            
            // Re-implementing the original logic to be faithful:
             for (const [txDate, balance] of dateMap.entries()) {
                if (new Date(txDate) < date) {
                    previousBalance = balance;
                }
            }
            data.unshift(previousBalance);
        }
    }
    return { labels, data };
}

function renderGraph(canvas, account, id, transactions) {
    const today = new Date();
    const last30Days = new Date(today);
    last30Days.setDate(today.getDate() - 30);

    const txSource = transactions || account.transactions.filter(tx => new Date(tx.date) >= last30Days);
    const displayDays = transactions ? transactions.length : 30; // Heuristic from original code

    const { labels, data } = calculateGraphData(txSource, displayDays);

    if (charts[id]) {
        charts[id].destroy();
    }

    charts[id] = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: `${account.name} Balance`,
                data: data,
                borderColor: 'rgba(75, 192, 192, 1)',
                borderWidth: 1,
                fill: false
            }]
        },
        options: {
            scales: {
                y: {
                    beginAtZero: true
                }
            }
        }
    });
}