// ui-goals.js
import { formatCurrency, showModalAlert, showModalConfirm } from './ui-components.js';
import { accounts, saveState } from './state.js';

let currentAccountId = null;
let currentGoalId = null;
let transferModal = null; // Store instance

export function initGoalUI(onUpdate) {
    const saveGoalBtn = document.getElementById('save-goal-btn');
    const transferModalEl = document.getElementById('transfer-modal');
    transferModal = new bootstrap.Modal(transferModalEl);

    // Add Goal Logic
    saveGoalBtn.addEventListener('click', () => {
        // We need to know which account is active.
        // Since the Add Goal button is in the account accordion, we set context when clicked.
        // We rely on window.setCurrentAccount or similar, or we track it.
        // Recommendation: Read it from a data attribute or global state if passed.
        // For now, let's assume we need a way to set the target account ID.
        // We will export a function 'setGoalTargetAccount(id)'
        if (!currentAccountId) return;
        
        const name = document.getElementById('goal-name').value.trim();
        const target = parseFloat(document.getElementById('goal-target').value);
        const iconInput = document.querySelector('input[name="goal-icon"]:checked');
        const icon = iconInput ? iconInput.value : '🎯';

        if (name && !isNaN(target)) {
            if (!accounts[currentAccountId].goals) accounts[currentAccountId].goals = [];
            
            accounts[currentAccountId].goals.push({
                id: crypto.randomUUID(),
                name,
                target,
                icon,
                created: Date.now()
            });
            saveState();
            if (onUpdate) onUpdate(currentAccountId);
            
            // Cleanup
            document.getElementById('goal-name').value = '';
            document.getElementById('goal-target').value = '';
            
            const modal = bootstrap.Modal.getInstance(document.getElementById('add-goal-modal'));
            if (modal) modal.hide();
        }
    });

    // Transfer Modal Logic
    document.getElementById('btn-contribute').addEventListener('click', () => handleTransfer(true, onUpdate));
    document.getElementById('btn-withdraw').addEventListener('click', () => handleTransfer(false, onUpdate));
    
    document.getElementById('btn-delete-goal').addEventListener('click', () => {
        if (currentAccountId && currentGoalId) {
            showModalConfirm("Delete this goal? Money will be returned to your wallet.", () => {
                handleGoalAction(currentAccountId, currentGoalId, 'delete', onUpdate);
                transferModal.hide();
            }, "Delete Goal");
        }
    });

    document.getElementById('btn-complete-goal').addEventListener('click', () => {
        if (currentAccountId && currentGoalId) {
            showModalConfirm("Hooray! Did you reach your goal? The goal will be closed.", () => {
                handleGoalAction(currentAccountId, currentGoalId, 'complete', onUpdate);
                transferModal.hide();
            }, "Complete Goal");
        }
    });
}

export function setGoalTargetAccount(id) {
    currentAccountId = id;
}

function handleGoalAction(accountId, goalId, action, onUpdate) {
    const account = accounts[accountId];
    const goalIndex = account.goals.findIndex(g => g.id === goalId);
    if (goalIndex === -1) return;
    
    const goal = account.goals[goalIndex];

    if (action === 'delete') {
        const goalBalance = account.transactions
            .filter(tx => !tx.deleted && tx.goalId === goalId)
            .reduce((sum, tx) => sum - tx.amount, 0);
        
        if (goalBalance > 0) {
            account.transactions.push({
                id: crypto.randomUUID(),
                date: new Date().toISOString().split('T')[0],
                description: `Refund: ${goal.name}`,
                amount: goalBalance,
                category: 'goals',
                timestamp: Date.now()
            });
        }
    }

    account.goals.splice(goalIndex, 1);
    saveState();
    if (onUpdate) onUpdate(accountId);
}

function handleTransfer(isDeposit, onUpdate) {
    const amount = parseFloat(document.getElementById('transfer-amount').value);
    
    if (!currentAccountId || !currentGoalId) return;
    if (isNaN(amount) || amount <= 0) {
        showModalAlert("Please enter a valid amount.");
        return;
    }

    const account = accounts[currentAccountId];
    const goal = account.goals.find(g => g.id === currentGoalId);
    if (!goal) return;

    const finalAmount = isDeposit ? -amount : amount;
    const description = isDeposit ? `Saved for ${goal.name}` : `Withdrew from ${goal.name}`;
    
    account.transactions.push({
        id: crypto.randomUUID(),
        date: new Date().toISOString().split('T')[0],
        description: description,
        amount: finalAmount,
        category: 'goals',
        goalId: goal.id,
        timestamp: Date.now()
    });

    saveState();
    if (onUpdate) onUpdate(currentAccountId);
    
    document.getElementById('transfer-amount').value = '';
    transferModal.hide();
}

export function renderGoals(container, accountId, account) {
    container.innerHTML = '';
    const goals = account.goals || [];
    
    if (goals.length === 0) return;

    const header = document.createElement('h3');
    header.className = 'h5 fw-bold mb-3';
    header.textContent = 'Savings Goals';
    container.appendChild(header);

    const row = document.createElement('div');
    row.className = 'row g-3';

    goals.forEach(goal => {
        const goalBalance = account.transactions
            .filter(tx => !tx.deleted && tx.goalId === goal.id)
            .reduce((sum, tx) => sum - tx.amount, 0);

        const percent = Math.min(100, Math.max(0, (goalBalance / goal.target) * 100));
        
        const col = document.createElement('div');
        col.className = 'col-md-6 col-lg-4';
        
        col.innerHTML = `
            <div class="card h-100 border-0 shadow-sm goal-card" role="button">
                <div class="card-body">
                    <div class="d-flex justify-content-between align-items-center mb-2">
                        <div class="fs-4">${goal.icon}</div>
                        <div class="fw-bold ${percent >= 100 ? 'text-success' : 'text-primary'}">${formatCurrency(goalBalance)}</div>
                    </div>
                    <h6 class="card-title mb-2 text-truncate">${goal.name}</h6>
                    <div class="progress" style="height: 8px;">
                        <div class="progress-bar ${percent >= 100 ? 'bg-success' : 'bg-primary'}" role="progressbar" style="width: ${percent}%"></div>
                    </div>
                    <div class="d-flex justify-content-between mt-1">
                        <small class="text-muted" style="font-size: 0.7rem;">Target: ${formatCurrency(goal.target)}</small>
                        <small class="text-muted" style="font-size: 0.7rem;">${Math.round(percent)}%</small>
                    </div>
                </div>
            </div>
        `;
        
        col.querySelector('.goal-card').addEventListener('click', () => {
            currentAccountId = accountId;
            currentGoalId = goal.id;
            
            // Populate Modal
            document.getElementById('transfer-goal-name').textContent = goal.name;
            document.getElementById('transfer-icon').textContent = goal.icon;
            
            // We use the same instance initialized in initGoalUI
            // But we need to ensure initGoalUI was called.
            // If transferModal variable is null here, it means initGoalUI wasn't called or failed.
            // Assuming proper bootstrapping.
            if (transferModal) {
                transferModal.show();
            } else {
                console.error("Transfer Modal not initialized");
            }
        });

        row.appendChild(col);
    });

    container.appendChild(row);
    container.appendChild(document.createElement('hr'));
}
