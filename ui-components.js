// ui-components.js

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

export function formatCurrency(amount) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

export function getPreferredTheme() {
    const storedTheme = localStorage.getItem('theme');
    if (storedTheme) {
        return storedTheme;
    }
    return 'auto'; // Default
}

export function setTheme(theme) {
    if (theme === 'auto') {
        if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
            document.documentElement.setAttribute('data-bs-theme', 'dark');
        } else {
            document.documentElement.setAttribute('data-bs-theme', 'light');
        }
    } else {
        document.documentElement.setAttribute('data-bs-theme', theme);
    }
    localStorage.setItem('theme', theme);
}

export function showModalAlert(message, title = 'Message') {
    const modalEl = document.getElementById('generic-modal');
    if (!modalEl) {
        alert(message); // Fallback
        return;
    }
    const modal = new bootstrap.Modal(modalEl);
    document.getElementById('generic-modal-title').textContent = title;
    document.getElementById('generic-modal-body').textContent = message;
    
    // Hide Cancel button, Show OK
    document.getElementById('generic-modal-cancel').style.display = 'none';
    const okBtn = document.getElementById('generic-modal-confirm');
    okBtn.style.display = 'block';
    
    // Remove existing listeners to prevent stacking
    const newOkBtn = okBtn.cloneNode(true);
    okBtn.parentNode.replaceChild(newOkBtn, okBtn);
    
    newOkBtn.addEventListener('click', () => {
        modal.hide();
    });
    
    modal.show();
}

export function showModalConfirm(message, onConfirm, title = 'Confirm') {
    const modalEl = document.getElementById('generic-modal');
    if (!modalEl) {
        if (confirm(message)) onConfirm(); // Fallback
        return;
    }
    const modal = new bootstrap.Modal(modalEl);
    document.getElementById('generic-modal-title').textContent = title;
    document.getElementById('generic-modal-body').textContent = message;
    
    // Show Cancel and OK
    const cancelBtn = document.getElementById('generic-modal-cancel');
    const okBtn = document.getElementById('generic-modal-confirm');
    cancelBtn.style.display = 'block';
    okBtn.style.display = 'block';
    
    // Handle OK
    const newOkBtn = okBtn.cloneNode(true);
    okBtn.parentNode.replaceChild(newOkBtn, okBtn);
    
    newOkBtn.addEventListener('click', () => {
        modal.hide();
        if (onConfirm) onConfirm();
    });
    
    modal.show();
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
