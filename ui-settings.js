// ui-settings.js
import { accounts, saveState, setAccounts, replaceState, deletedAccountIds, setDeletedAccountIds, cloudSyncEnabled, setCloudSyncEnabled, setSyncDetails, syncGuid, encryptionKeyJwk, toastConfig, setToastConfig, loadFromCloud } from './state.js';
import { setCloudConfig, getCloudConfig, initS3Client } from './s3.js';
import { generateKey, exportKey } from './encryption.js';
import { showModalAlert, showModalConfirm, getPreferredTheme, setTheme } from './ui-components.js';
import { renderAll } from './ui-account.js';
import { logBuffer } from './logger.js';

export function initSettingsUI() {
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

    const exportDataBtn = document.getElementById('export-data-btn');
    const exportCsvBtn = document.getElementById('export-csv-btn');
    const importDataBtn = document.getElementById('import-data-btn');
    const importFileInput = document.getElementById('import-file');

    const themeLightInput = document.getElementById('theme-light');
    const themeDarkInput = document.getElementById('theme-dark');
    const themeAutoInput = document.getElementById('theme-auto');
    const openAddAccountBtn = document.getElementById('open-add-account-btn');

    // Theme Logic
    const currentTheme = getPreferredTheme();
    setTheme(currentTheme);
    if (themeLightInput && themeDarkInput && themeAutoInput) {
        if (currentTheme === 'light') themeLightInput.checked = true;
        else if (currentTheme === 'dark') themeDarkInput.checked = true;
        else themeAutoInput.checked = true;

        themeLightInput.addEventListener('change', () => setTheme('light'));
        themeDarkInput.addEventListener('change', () => setTheme('dark'));
        themeAutoInput.addEventListener('change', () => setTheme('auto'));
    }

    // System theme change listener
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        if (getPreferredTheme() === 'auto') {
            setTheme('auto');
        }
    });

    if (showKeysBtn && keysDisplayContainer) {
        showKeysBtn.addEventListener('click', () => {
            if (keysDisplayContainer.style.display === 'none') {
                if (!syncGuid || !encryptionKeyJwk) {
                    showModalAlert('No sync keys found. Please generate keys first.');
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
                showModalAlert('Logs copied to clipboard!');
            }).catch(err => {
                console.error('Failed to copy logs:', err);
                showModalAlert('Failed to copy logs.', 'Error');
            });
        });
    }

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
        
        updateToastUI();
    }

    cloudSyncToggle.checked = cloudSyncEnabled;

    if (cloudSyncEnabled) {
        cloudSyncSettings.style.display = 'block';
    }

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

    if (exportCsvBtn) {
        exportCsvBtn.addEventListener('click', () => {
            let csvContent = "Account ID,Account Name,Transaction ID,Date,Description,Amount,Timestamp\n";

            for (const accountId in accounts) {
                const account = accounts[accountId];
                const accountName = account.name.replace(/"/g, '""'); // Escape quotes
                
                if (account.transactions.length === 0) {
                     csvContent += `"${accountId}","${accountName}",,,,
`;
                     continue;
                }

                account.transactions.forEach(tx => {
                    const description = tx.description ? tx.description.replace(/"/g, '""') : '';
                    const row = [
                        `"${accountId}"`, 
                        `"${accountName}"`, 
                        `"${tx.id}"`, 
                        `"${tx.date}"`, 
                        `"${description}"`, 
                        tx.amount,
                        tx.timestamp || ''
                    ].join(",");
                    csvContent += row + "\n";
                });
            }

            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.setAttribute("href", url);
            link.setAttribute("download", "kids-bank-export.csv");
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        });
    }

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
                    showModalAlert('Data imported successfully. Any previously deleted accounts in this file have been restored.', 'Success');
                } catch (error) {
                    console.error(error);
                    showModalAlert('Invalid JSON file.', 'Error');
                }
            };
            reader.readAsText(file);
        }
    });

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
                 showModalAlert('Please enter a valid PAR URL.', 'Error');
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
                showModalAlert('Please fill in all AWS configuration fields (Endpoint is optional for AWS).', 'Error');
                return;
            }
        }
        
        setCloudConfig(config);
        showModalAlert('Cloud configuration saved.', 'Success');
        saveState(); // Trigger sync attempt
    });

    generateSyncKeysBtn.addEventListener('click', async () => {
        showModalConfirm('This will generate a new sync ID and encryption key. Any existing data in the cloud with the old ID will be lost to this device (unless you have a backup). Continue?', async () => {
            const guid = crypto.randomUUID();
            const key = await generateKey();
            const jwk = await exportKey(key);
            setSyncDetails(guid, jwk);
            showModalAlert('New Sync ID and Encryption Key generated. You can now sync.', 'Keys Generated');
            saveState();
        }, 'Generate New Keys');
    });

    showQrBtn.addEventListener('click', () => {
        const cloudConfig = getCloudConfig();
        if (!cloudConfig || !syncGuid || !encryptionKeyJwk) {
            showModalAlert('Please configure Cloud Sync (AWS details + Generate Keys) first.', 'Configuration Missing');
            return;
        }

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
        
        const qrImg = qrCodeContainer.querySelector('img');
        if (qrImg) {
            qrImg.style.maxWidth = '100%';
            qrImg.style.height = 'auto';
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
            showModalAlert('Invalid configuration format. Missing aws config, guid, or encryption key.', 'Import Error');
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

            initS3Client();
            const data = await loadFromCloud();
            if (data) {
                replaceState(data);
                renderAll();
                showModalAlert('Configuration imported and data synced successfully!', 'Success');
            } else {
                showModalAlert('Configuration imported. No data found on cloud yet or download failed.', 'Warning');
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
            showModalAlert('Failed to parse configuration. Ensure it is valid JSON.', 'Error');
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
                        showModalAlert("Scanned QR code does not contain a valid configuration.", 'Scan Error');
                    }
                } else {
                    showModalAlert("Failed to detect a QR code in the image.", 'Scan Error');
                }
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
        qrFileInput.value = '';
    });

    let videoStream = null;
    let isScanning = false;

    scanQrBtn.addEventListener('click', () => {
        qrScannerModal.show();
        const qrReaderDiv = document.getElementById('qr-reader');
        qrReaderDiv.innerHTML = '';

        const video = document.createElement('video');
        video.style.width = '100%';
        qrReaderDiv.appendChild(video);

        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d', { willReadFrequently: true });

        navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } }).then(function(stream) {
            videoStream = stream;
            video.srcObject = stream;
            video.setAttribute("playsinline", true);
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

    if (openAddAccountBtn) {
        openAddAccountBtn.addEventListener('click', () => {
             const settingsModal = bootstrap.Modal.getInstance(document.getElementById('settings-modal'));
             if (settingsModal) settingsModal.hide();
        });
    }
}
