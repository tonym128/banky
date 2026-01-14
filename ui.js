// ui.js
import { initLogger } from './logger.js';
import { initSettingsUI } from './ui-settings.js';
import { initAccountUI, renderAll, calculateGraphData } from './ui-account.js';
import { updateSyncIcon, showToast, formatCurrency, showModalAlert, showModalConfirm } from './ui-components.js';
import { PubSub, EVENTS } from './pubsub.js';

// Re-exports for tests/compatibility
export { renderAll, calculateGraphData, formatCurrency, showToast, showModalAlert, showModalConfirm, updateSyncIcon };

export function initUI() {
    initLogger();
    
    // Subscribe to state changes
    PubSub.subscribe(EVENTS.STATE_UPDATED, () => renderAll());
    PubSub.subscribe(EVENTS.SYNC_STATUS_CHANGED, (status) => updateSyncIcon(status));
    PubSub.subscribe(EVENTS.TOAST_NOTIFICATION, (data) => showToast(data.message, data.type));

    initAccountUI();
    initSettingsUI();
    
    // Initial Render
    renderAll();
}
