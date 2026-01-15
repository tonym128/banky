// ui-account.js
import { accounts, saveState, removeAccount } from './state.js';
import { formatCurrency, showModalAlert, showModalConfirm } from './ui-components.js';
import { resizeImage } from './utils.js';

let charts = {};
let currentAccountId = null;
let currentGoalId = null;

const EARN_CATEGORIES = {
    'allowance': { label: 'Allowance', icon: '💸' },
    'chores': { label: 'Chores', icon: '🧹' },
    'gift': { label: 'Gift', icon: '🎁' },
    'sell': { label: 'Sold Item', icon: '🏷️' },
    'interest': { label: 'Interest', icon: '📈' },
    'other': { label: 'Other', icon: '💰' }
};

const SPEND_CATEGORIES = {
    'food': { label: 'Food/Treats', icon: '🍔' },
    'toys': { label: 'Toys', icon: '🧸' },
    'fun': { label: 'Entertainment', icon: '🎬' },
    'clothing': { label: 'Clothing', icon: '👕' },
    'electronics': { label: 'Electronics', icon: '🎮' },
    'other': { label: 'Other', icon: '💸' }
};

export function initAccountUI() {
    const addAccountBtn = document.getElementById('add-account-btn');
    const accountNameInput = document.getElementById('account-name');
    const accountImageInput = document.getElementById('account-image');
    const accountsContainer = document.getElementById('accounts-container');
    const accountContextMenu = new bootstrap.Modal(document.getElementById('account-context-menu'));
    const removeAccountLink = document.getElementById('remove-account-link');
    const addEditImageLink = document.getElementById('add-edit-image-link');
    const removeImageLink = document.getElementById('remove-image-link');
    const editAccountImageInput = document.getElementById('edit-account-image');

    // Allowance UI
    const allowanceLink = document.getElementById('allowance-link');
    const allowanceModalEl = document.getElementById('allowance-modal');
    const allowanceModal = new bootstrap.Modal(allowanceModalEl);
    const allowanceActiveCheck = document.getElementById('allowance-active');
    const allowanceAmountInput = document.getElementById('allowance-amount');
    const allowanceIntervalSelect = document.getElementById('allowance-interval');
    const saveAllowanceBtn = document.getElementById('save-allowance-btn');

    // Goals UI
    const saveGoalBtn = document.getElementById('save-goal-btn');
    const transferModalEl = document.getElementById('transfer-modal');
    const transferModal = new bootstrap.Modal(transferModalEl);
    
    // Add Account Logic
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
                    showModalAlert("Failed to process image.", 'Error');
                    return;
                }
            }
            
            const id = Date.now().toString();
            accounts[id] = { name, transactions: [], goals: [], image };
            accountNameInput.value = '';
            accountImageInput.value = '';
            saveState();
            renderAll(id);

            const addAccountModal = bootstrap.Modal.getInstance(document.getElementById('add-account-modal'));
            if (addAccountModal) addAccountModal.hide();
        }
    });

    // Account Context Menu
    removeAccountLink.addEventListener('click', (e) => {
        e.preventDefault();
        accountContextMenu.hide();
        if (currentAccountId) {
            showModalConfirm('Are you sure you want to remove this account?', () => {
                removeAccount(currentAccountId);
                renderAll(currentAccountId);
            }, 'Remove Account');
        }
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

    allowanceLink.addEventListener('click', (e) => {
        e.preventDefault();
        accountContextMenu.hide();
        if (currentAccountId) {
            const account = accounts[currentAccountId];
            const allowance = account.allowance || { active: false, amount: '', interval: 'weekly' };
            
            allowanceActiveCheck.checked = allowance.active;
            allowanceAmountInput.value = allowance.amount;
            allowanceIntervalSelect.value = allowance.interval;
            
            // Toggle form visibility
            const form = document.getElementById('allowance-form');
            if (allowance.active) {
                form.style.opacity = '1';
                form.style.pointerEvents = 'auto';
            } else {
                form.style.opacity = '0.5';
                form.style.pointerEvents = 'none';
            }

            allowanceModal.show();
        }
    });

    allowanceActiveCheck.addEventListener('change', () => {
        const form = document.getElementById('allowance-form');
        if (allowanceActiveCheck.checked) {
            form.style.opacity = '1';
            form.style.pointerEvents = 'auto';
        } else {
            form.style.opacity = '0.5';
            form.style.pointerEvents = 'none';
        }
    });

    saveAllowanceBtn.addEventListener('click', () => {
        if (currentAccountId) {
            const active = allowanceActiveCheck.checked;
            const amount = parseFloat(allowanceAmountInput.value);
            const interval = allowanceIntervalSelect.value;

            if (active && (isNaN(amount) || amount <= 0)) {
                showModalAlert("Please enter a valid allowance amount.");
                return;
            }

            accounts[currentAccountId].allowance = {
                active,
                amount,
                interval,
                nextRun: Date.now() + (interval === 'monthly' ? 30 : 7) * 24 * 60 * 60 * 1000 // Set first run to next cycle
            };
            
            saveState();
            allowanceModal.hide();
            showModalAlert("Allowance settings saved. The first payment will occur in the next cycle.", "Saved");
        }
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
                showModalAlert("Failed to process image.", 'Error');
            }
        }
    });

    // Delete Transaction Handler
    accountsContainer.addEventListener('click', (e) => {
        const deleteBtn = e.target.closest('.delete-transaction-btn');
        if (deleteBtn) {
            const accountId = deleteBtn.dataset.accountId;
            const transactionId = deleteBtn.dataset.transactionId;
            
            showModalConfirm('Are you sure you want to delete this transaction?', () => {
                 const transactionIndex = accounts[accountId].transactions.findIndex(tx => String(tx.id) === transactionId);
            
                if (transactionIndex > -1) {
                    accounts[accountId].transactions[transactionIndex].deleted = true;
                    accounts[accountId].transactions[transactionIndex].timestamp = Date.now();
                    saveState();
                    renderAll(accountId);
                }
            }, 'Delete Transaction');
        }
    });

    // Add Goal Logic
    saveGoalBtn.addEventListener('click', () => {
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
            renderAll(currentAccountId);
            
            // Cleanup
            document.getElementById('goal-name').value = '';
            document.getElementById('goal-target').value = '';
            
            const modal = bootstrap.Modal.getInstance(document.getElementById('add-goal-modal'));
            modal.hide();
        }
    });

    // Transfer Modal Logic
    document.getElementById('btn-contribute').addEventListener('click', () => handleTransfer(true, transferModal));
    document.getElementById('btn-withdraw').addEventListener('click', () => handleTransfer(false, transferModal));
    
    document.getElementById('btn-delete-goal').addEventListener('click', () => {
        if (currentAccountId && currentGoalId) {
            // Confirm first
            showModalConfirm("Delete this goal? Money will be returned to your wallet.", () => {
                handleGoalAction(currentAccountId, currentGoalId, 'delete');
                transferModal.hide();
            }, "Delete Goal");
        }
    });

    document.getElementById('btn-complete-goal').addEventListener('click', () => {
        if (currentAccountId && currentGoalId) {
            showModalConfirm("Hooray! Did you reach your goal? The goal will be closed.", () => {
                handleGoalAction(currentAccountId, currentGoalId, 'complete');
                transferModal.hide();
            }, "Complete Goal");
        }
    });
}

function handleGoalAction(accountId, goalId, action) {
    const account = accounts[accountId];
    const goalIndex = account.goals.findIndex(g => g.id === goalId);
    if (goalIndex === -1) return;
    
    const goal = account.goals[goalIndex];

    if (action === 'delete') {
        // Calculate balance to refund
        const goalBalance = account.transactions
            .filter(tx => !tx.deleted && tx.goalId === goalId)
            .reduce((sum, tx) => sum - tx.amount, 0);
        
        if (goalBalance > 0) {
            account.transactions.push({
                id: crypto.randomUUID(),
                date: new Date().toISOString().split('T')[0],
                description: `Refund: ${goal.name}`,
                amount: goalBalance, // Positive amount back to wallet
                category: 'goals',
                timestamp: Date.now()
            });
        }
    } else if (action === 'complete') {
        // Optional: Add a "Goal Completed" marker transaction if desired, 
        // but currently we just leave the history as is (money spent).
    }

    // Remove the goal
    account.goals.splice(goalIndex, 1);
    
    saveState();
    renderAll(accountId);
}

function handleTransfer(isDeposit, modal) {
    const amount = parseFloat(document.getElementById('transfer-amount').value);
    
    if (!currentAccountId || !currentGoalId) return;
    if (isNaN(amount) || amount <= 0) {
        showModalAlert("Please enter a valid amount.");
        return;
    }

    const account = accounts[currentAccountId];
    const goal = account.goals.find(g => g.id === currentGoalId);
    if (!goal) return;

    // Logic:
    // Deposit to Goal: Subtract from Main, Add to Goal (Tx Amount: -X, GoalID: Y)
    // Withdraw from Goal: Add to Main, Subtract from Goal (Tx Amount: +X, GoalID: Y)
    
    // BUT: The Goal ID on a transaction implies it belongs to the goal.
    // If I spend money from my main wallet to put in goal, it's an expense.
    // If I take money from goal back to wallet, it's income.
    
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
    renderAll(currentAccountId);
    
    document.getElementById('transfer-amount').value = '';
    modal.hide();
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
    
    const accountIds = Object.keys(accounts);
    
    if (accountIds.length === 0) {
        const emptyState = document.createElement('div');
        emptyState.className = 'text-center py-5 px-4 bg-light-subtle rounded-4 border border-dashed mt-4';
        emptyState.innerHTML = `
            <div class="mb-4" style="font-size: 5rem;">🏦</div>
            <h2 class="mb-3">Welcome to Kids Bank!</h2>
            <p class="lead mb-4 text-muted">Ready to help your kids learn about money? Let's start by creating their first digital bank account.</p>
            <button class="btn btn-primary btn-lg px-5 shadow-sm rounded-pill" data-bs-toggle="modal" data-bs-target="#add-account-modal">
                ✨ Create First Account
            </button>
        `;
        accountsContainer.appendChild(emptyState);
        return;
    }

    for (const id of accountIds) {
        accountsContainer.appendChild(createAccountElement(id, accounts[id]));
    }
}

function renderTransactionForm(type, accountId) {
    const isEarn = type === 'earn';
    const categories = isEarn ? EARN_CATEGORIES : SPEND_CATEGORIES;
    const btnClass = isEarn ? 'btn-success' : 'btn-danger';
    const bgClass = isEarn ? 'bg-success-subtle' : 'bg-danger-subtle';
    const title = isEarn ? 'Earn' : 'Spend';
    
    const categoryOptions = Object.entries(categories)
        .map(([val, data]) => `<option value="${val}">${data.icon} ${data.label}</option>`)
        .join('');

    return `
        <div class="card ${bgClass} mb-3 border-0 h-100 shadow-sm">
            <div class="card-body">
                <h5 class="card-title fw-bold mb-3">${title}</h5>
                <div class="row g-2">
                    <div class="col-12">
                         <div class="input-group">
                            <span class="input-group-text bg-white border-end-0">📅</span>
                            <input type="date" id="${type}-date-${accountId}" class="form-control border-start-0 ps-0">
                        </div>
                    </div>
                    <div class="col-7">
                        <select id="${type}-category-${accountId}" class="form-select">
                            ${categoryOptions}
                        </select>
                    </div>
                    <div class="col-5">
                         <div class="input-group">
                            <span class="input-group-text bg-white border-end-0">$</span>
                            <input type="number" id="${type}-amount-${accountId}" class="form-control border-start-0 ps-0" placeholder="0.00">
                        </div>
                    </div>
                    <div class="col-12">
                        <input type="text" id="${type}-description-${accountId}" class="form-control" placeholder="Description (Optional)">
                    </div>
                    <div class="col-12 mt-3">
                        <button id="${type}-btn-${accountId}" class="btn ${btnClass} w-100 fw-bold rounded-pill">
                            ${isEarn ? '➕ Add Money' : '➖ Spend Money'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function renderGoals(container, accountId, account) {
    container.innerHTML = '';
    const goals = account.goals || [];
    
    if (goals.length === 0) return; // Don't show section if no goals

    const header = document.createElement('h3');
    header.className = 'h5 fw-bold mb-3';
    header.textContent = 'Savings Goals';
    container.appendChild(header);

    const row = document.createElement('div');
    row.className = 'row g-3';

    goals.forEach(goal => {
        // Calculate Balance
        // Sum of all transactions linked to this goal. 
        // Note: Contribution is negative in main account (-$10), so it's +$10 in Goal.
        // Withdrawal is positive in main account (+$10), so it's -$10 in Goal.
        const goalBalance = account.transactions
            .filter(tx => !tx.deleted && tx.goalId === goal.id)
            .reduce((sum, tx) => sum - tx.amount, 0); // Invert amount

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
            
            const modal = new bootstrap.Modal(document.getElementById('transfer-modal'));
            modal.show();
        });

        row.appendChild(col);
    });

    container.appendChild(row);
    container.appendChild(document.createElement('hr')); // Separator
}

function createAccountElement(id, account) {
    const accountBox = document.createElement('div');
    accountBox.className = 'accordion-item border-0 mb-3 shadow-sm rounded-3 overflow-hidden';
    accountBox.dataset.accountId = id;

    const header = document.createElement('h2');
    header.className = 'accordion-header';
    header.id = `heading-${id}`;

    const button = document.createElement('button');
    button.className = 'accordion-button collapsed bg-white';
    button.type = 'button';
    button.dataset.bsToggle = 'collapse';
    button.dataset.bsTarget = `#collapse-${id}`;
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-controls', `collapse-${id}`);

    let imageHtml = '';
    if (account.image) {
        imageHtml = `<img src="${account.image}" class="account-summary-image rounded-circle me-3 object-fit-cover" style="width: 40px; height: 40px;">`;
    } else {
         imageHtml = `<div class="rounded-circle bg-primary-subtle me-3 d-flex align-items-center justify-content-center text-primary fw-bold" style="width: 40px; height: 40px; font-size: 1.2rem;">${account.name.charAt(0).toUpperCase()}</div>`;
    }
    
    const balance = account.transactions.filter(tx => !tx.deleted).reduce((sum, tx) => sum + tx.amount, 0);
    button.innerHTML = `
        <div class="d-flex align-items-center w-100">
            ${imageHtml}
            <div class="flex-grow-1">
                <div class="fw-bold text-dark fs-5">${account.name}</div>
                <div class="text-secondary small">Current Balance</div>
            </div>
            <div class="text-end me-3">
                <div class="fw-bold fs-4 text-primary">${formatCurrency(balance)}</div>
            </div>
        </div>
    `;

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
    content.className = 'accordion-body bg-light-subtle';

    // Actions Section (Earn/Spend)
    const earnSpendSection = document.createElement('div');
    earnSpendSection.className = 'row mb-4';
    earnSpendSection.innerHTML = `
        <div class="col-md-6 mb-3 mb-md-0">${renderTransactionForm('earn', id)}</div>
        <div class="col-md-6">${renderTransactionForm('spend', id)}</div>
    `;
    content.appendChild(earnSpendSection);

    // Goals Section
    const goalsContainer = document.createElement('div');
    goalsContainer.className = 'mb-4';
    renderGoals(goalsContainer, id, account);
    content.appendChild(goalsContainer);
    
    // Add Goal Button (Small, text only)
    const addGoalBtnWrapper = document.createElement('div');
    addGoalBtnWrapper.className = 'text-end mb-4';
    addGoalBtnWrapper.innerHTML = `
        <button class="btn btn-sm btn-outline-primary rounded-pill" data-bs-toggle="modal" data-bs-target="#add-goal-modal" onclick="window.setCurrentAccount('${id}')">
            🎯 Add New Goal
        </button>
    `;
    content.appendChild(addGoalBtnWrapper);
    
    // Helper for onclick to set context
    // Ideally we use event listener, but for quick modal trigger inside loop, this helper on window is easy hack
    // Better way: attach listener
    addGoalBtnWrapper.querySelector('button').addEventListener('click', () => {
        currentAccountId = id;
    });

    // Graph Section
    const graphCard = document.createElement('div');
    graphCard.className = 'card border-0 shadow-sm mb-4';
    graphCard.innerHTML = `
        <div class="card-body">
             <h6 class="card-subtitle mb-3 text-muted text-uppercase fw-bold" style="font-size: 0.75rem; letter-spacing: 0.5px;">Balance History</h6>
             <div style="position: relative; height: 250px;">
                <canvas></canvas>
             </div>
        </div>
    `;
    content.appendChild(graphCard);
    const canvas = graphCard.querySelector('canvas');

    // Transactions Section
    const transactionsHeader = document.createElement('div');
    transactionsHeader.className = 'd-flex justify-content-between align-items-center mb-3 mt-4';
    transactionsHeader.innerHTML = `<h3 class="h5 fw-bold mb-0">Recent Activity</h3>`;
    content.appendChild(transactionsHeader);

    // Filters
    const dateFilterSection = document.createElement('div');
    dateFilterSection.className = 'row g-2 mb-3';
    dateFilterSection.innerHTML = `
        <div class="col-4 col-md-3">
            <select id="month-select-${id}" class="form-select form-select-sm border-0 shadow-sm">
                <option value="-1">All Months</option>
                ${[...Array(12).keys()].map(i => `<option value="${i}">${new Date(0, i).toLocaleString('default', { month: 'short' })}</option>`).join('')}
            </select>
        </div>
        <div class="col-4 col-md-3">
            <select id="year-select-${id}" class="form-select form-select-sm border-0 shadow-sm"></select>
        </div>
        <div class="col-4 col-md-3">
             <select id="limit-select-${id}" class="form-select form-select-sm border-0 shadow-sm">
                <option value="20" selected>Last 20</option>
                <option value="50">Last 50</option>
                <option value="-1">Show All</option>
             </select>
        </div>
    `;
    content.appendChild(dateFilterSection);

    // Summary
    const startingBalanceEl = document.createElement('p');
    startingBalanceEl.className = 'small text-muted mb-3 fst-italic';
    content.appendChild(startingBalanceEl);

    // Empty State
    const emptyStateEl = document.createElement('div');
    emptyStateEl.className = 'text-center py-4 px-3 text-muted bg-white rounded-4 border border-dashed mb-3';
    emptyStateEl.style.display = 'none';
    emptyStateEl.innerHTML = `
        <div class="mb-2" style="font-size: 3.5rem;">🐷</div>
        <p class="mb-0 fw-semibold">No transactions yet.</p>
        <p class="small text-muted">Add some pocket money above to get started!</p>
    `;
    content.appendChild(emptyStateEl);

    // Transaction List Container (Div based)
    const transactionListContainer = document.createElement('div');
    transactionListContainer.className = 'transaction-list-container';
    content.appendChild(transactionListContainer);
    
    contentContainer.appendChild(content);
    accountBox.appendChild(contentContainer);

    // Logic Binding
    const monthSelect = content.querySelector(`#month-select-${id}`);
    const yearSelect = content.querySelector(`#year-select-${id}`);
    const limitSelect = content.querySelector(`#limit-select-${id}`);

    const years = [...new Set(account.transactions.filter(tx => !tx.deleted).map(tx => new Date(tx.date).getFullYear()))];
    yearSelect.innerHTML = '<option value="-1">All Years</option>' + years.map(y => `<option value="${y}">${y}</option>`).join('');
    
    // Default to current year if available, else All
    const currentYear = new Date().getFullYear();
    if (years.includes(currentYear)) {
        yearSelect.value = currentYear;
    } else {
        yearSelect.value = "-1";
    }

    // Default to current month if viewing current year
    if (yearSelect.value == currentYear) {
         monthSelect.value = new Date().getMonth();
    }

    const updateTransactions = () => {
        const selectedMonth = parseInt(monthSelect.value, 10);
        const selectedYear = parseInt(yearSelect.value, 10);
        const limit = parseInt(limitSelect.value, 10);

        let filteredTransactions = account.transactions.filter(tx => !tx.deleted);

        // Sort by date descending
        filteredTransactions.sort((a, b) => new Date(b.date) - new Date(a.date) || b.timestamp - a.timestamp);

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

        if (selectedYear !== -1 || selectedMonth !== -1) {
            startingBalanceEl.textContent = `Starting Balance (for selected period): ${formatCurrency(startingBalance)}`;
            startingBalanceEl.style.display = 'block';
        } else {
            startingBalanceEl.style.display = 'none';
        }
        
        const displayTransactions = limit === -1 ? filteredTransactions : filteredTransactions.slice(0, limit);

        renderTransactionList(transactionListContainer, displayTransactions, id, emptyStateEl);
        renderGraph(canvas, account, id, filteredTransactions);
    };

    monthSelect.addEventListener('change', updateTransactions);
    yearSelect.addEventListener('change', updateTransactions);
    limitSelect.addEventListener('change', updateTransactions);

    // Initialize Forms
    setupFormListeners(content, id, 'earn');
    setupFormListeners(content, id, 'spend');

    // Initial render
    updateTransactions();

    return accountBox;
}

function setupFormListeners(container, accountId, type) {
    container.querySelector(`#${type}-date-${accountId}`).valueAsDate = new Date();
    
    container.querySelector(`#${type}-btn-${accountId}`).addEventListener('click', () => {
        const descriptionInput = container.querySelector(`#${type}-description-${accountId}`);
        const amountInput = container.querySelector(`#${type}-amount-${accountId}`);
        const dateInput = container.querySelector(`#${type}-date-${accountId}`);
        const categorySelect = container.querySelector(`#${type}-category-${accountId}`);

        const rawDescription = descriptionInput.value.trim();
        const amount = parseFloat(amountInput.value);
        let date = dateInput.value;
        const category = categorySelect.value;
        
        // Default Description if empty based on category
        let description = rawDescription;
        if (!description) {
            const catList = type === 'earn' ? EARN_CATEGORIES : SPEND_CATEGORIES;
            description = catList[category] ? catList[category].label : 'Transaction';
        }

        if (!date) {
            date = new Date().toISOString().split('T')[0];
        }

        if (!isNaN(amount) && amount > 0) {
            const finalAmount = type === 'earn' ? amount : -amount;
            
            accounts[accountId].transactions.push({ 
                id: crypto.randomUUID(), 
                date, 
                description, 
                amount: finalAmount, 
                category, // New Field
                timestamp: Date.now() 
            });

            // Reset Form
            descriptionInput.value = '';
            amountInput.value = '';
            
            saveState();
            renderAll(accountId);
        } else {
            showModalAlert("Please enter a valid amount greater than 0.");
        }
    });
}

function renderTransactionList(container, transactions, accountId, emptyStateEl) {
    container.innerHTML = '';
    
    if (transactions.length === 0) {
        container.style.display = 'none';
        emptyStateEl.style.display = 'block';
        return;
    }
    
    container.style.display = 'block';
    emptyStateEl.style.display = 'none';

    // Group by Date
    const grouped = {};
    transactions.forEach(tx => {
        if (!grouped[tx.date]) grouped[tx.date] = [];
        grouped[tx.date].push(tx);
    });

    const dates = Object.keys(grouped).sort((a, b) => new Date(b) - new Date(a));

    dates.forEach(date => {
        const groupEl = document.createElement('div');
        groupEl.className = 'transaction-group';

        const dateHeader = document.createElement('div');
        dateHeader.className = 'date-header';
        
        // Pretty Date Formatting
        const d = new Date(date);
        const today = new Date();
        today.setHours(0,0,0,0);
        const dMidnight = new Date(d);
        dMidnight.setHours(0,0,0,0);
        
        const diffTime = today - dMidnight;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 

        let label = d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
        if (diffDays === 0) label = 'Today';
        else if (diffDays === 1) label = 'Yesterday';

        dateHeader.textContent = label;
        groupEl.appendChild(dateHeader);

        const listEl = document.createElement('div');
        listEl.className = 'transaction-list';

        grouped[date].forEach(tx => {
            const item = document.createElement('div');
            item.className = 'transaction-item';
            
            const isPositive = tx.amount >= 0;
            const amountClass = isPositive ? 'text-success' : 'text-danger';
            const sign = isPositive ? '+' : '';
            
            // Icon
            let icon = isPositive ? '💰' : '💸';
            let categoryLabel = 'General';
            
            // Try to find icon from category
            // We check both lists because a user might look at history where category exists
            const earnCat = EARN_CATEGORIES[tx.category];
            const spendCat = SPEND_CATEGORIES[tx.category];
            
            if (earnCat) {
                icon = earnCat.icon;
                categoryLabel = earnCat.label;
            } else if (spendCat) {
                icon = spendCat.icon;
                categoryLabel = spendCat.label;
            } else if (tx.category === 'goals' && tx.goalId) {
                icon = '🎯';
                categoryLabel = 'Goal Transfer';
            } else if (tx.category) {
                 categoryLabel = tx.category;
            } else {
                 if (isPositive) { categoryLabel = 'Income'; icon = '💰'; }
                 else { categoryLabel = 'Expense'; icon = '💸'; }
            }

            item.innerHTML = `
                <div class="d-flex align-items-center w-100 overflow-hidden">
                    <div class="tx-icon">${icon}</div>
                    <div class="tx-details">
                        <div class="tx-description">${tx.description}</div>
                        <div class="tx-category">${categoryLabel}</div>
                    </div>
                    <div class="tx-amount ${amountClass}">${sign}${formatCurrency(Math.abs(tx.amount))}</div>
                    <div class="tx-actions">
                         <button class="btn btn-sm btn-link text-muted p-0 delete-transaction-btn" 
                                data-account-id="${accountId}" 
                                data-transaction-id="${tx.id}"
                                title="Delete">
                            ❌
                        </button>
                    </div>
                </div>
            `;
            listEl.appendChild(item);
        });

        groupEl.appendChild(listEl);
        container.appendChild(groupEl);
    });
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
    const displayDays = transactions ? transactions.length : 30;

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
                borderColor: '#0d6efd',
                backgroundColor: 'rgba(13, 110, 253, 0.1)',
                borderWidth: 2,
                tension: 0.3, // Curve the line slightly
                fill: true,
                pointRadius: 0,
                pointHitRadius: 10
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                x: { display: false },
                y: {
                    beginAtZero: true,
                    grid: { borderDash: [5, 5] }
                }
            }
        }
    });
}
