// pwa.js

export function initPwa() {
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./sw.js').then(registration => {
                console.log('ServiceWorker registration successful with scope: ', registration.scope);

                // Check for updates
                if (registration.waiting) {
                    showUpdateToast(registration.waiting);
                }

                registration.addEventListener('updatefound', () => {
                    const newWorker = registration.installing;
                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            showUpdateToast(newWorker);
                        }
                    });
                });

            }, err => {
                console.log('ServiceWorker registration failed: ', err);
            });
        });

        // Reload when the new service worker takes over
        let refreshing = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (!refreshing) {
                window.location.reload();
                refreshing = true;
            }
        });
    }

    let deferredPrompt;
    const installPwaBtn = document.getElementById('install-pwa-btn');
    const installPwaSection = document.getElementById('pwa-install-section');

    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        installPwaSection.style.display = 'block';
    });

    installPwaBtn.addEventListener('click', async () => {
        installPwaSection.style.display = 'none';
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        console.log(`User response to the install prompt: ${outcome}`);
        deferredPrompt = null;
    });

    window.addEventListener('appinstalled', () => {
        console.log('PWA was installed');
    });
}

function showUpdateToast(worker) {
    const toastEl = document.getElementById('update-toast');
    const refreshBtn = document.getElementById('refresh-btn');
    
    if (toastEl && refreshBtn) {
        // Use Bootstrap's Toast API if available, otherwise manual
        if (window.bootstrap) {
            const toast = new bootstrap.Toast(toastEl, { autohide: false });
            toast.show();
        } else {
            toastEl.classList.add('show');
            toastEl.style.display = 'block';
        }

        refreshBtn.onclick = () => {
            worker.postMessage({ type: 'SKIP_WAITING' });
        };
    }
}