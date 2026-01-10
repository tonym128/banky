// pwa.js

export function initPwa() {
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/sw.js').then(registration => {
                console.log('ServiceWorker registration successful with scope: ', registration.scope);
            }, err => {
                console.log('ServiceWorker registration failed: ', err);
            });
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
