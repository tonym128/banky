// ui-account.js
import { accounts, saveState, removeAccount } from './state.js';
import { formatCurrency, showModalAlert, showModalConfirm } from './ui-components.js';
import { resizeImage } from './utils.js';
import { renderGraph } from './ui-charts.js';
import { renderTransactionForm, setupFormListeners, renderTransactionList } from './ui-transactions.js';
import { renderGoals, initGoalUI, setGoalTargetAccount } from './ui-goals.js';

let currentAccountId = null;

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

    // Initialize Goal UI with callback to re-render
    initGoalUI(renderAll);

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

    const safeName = account.name || 'Unknown Account';
    let imageHtml = '';
    if (account.image) {
        imageHtml = `<img src="${account.image}" class="account-summary-image rounded-circle me-3 object-fit-cover" style="width: 40px; height: 40px;">`;
    } else {
         imageHtml = `<div class="rounded-circle bg-primary-subtle me-3 d-flex align-items-center justify-content-center text-primary fw-bold" style="width: 40px; height: 40px; font-size: 1.2rem;">${safeName.charAt(0).toUpperCase()}</div>`;
    }
    
    const balance = account.transactions.filter(tx => !tx.deleted).reduce((sum, tx) => sum + tx.amount, 0);
    button.innerHTML = `
        <div class="d-flex align-items-center w-100">
            ${imageHtml}
            <div class="flex-grow-1">
                <div class="fw-bold text-dark fs-5">${safeName}</div>
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
    
    // Add Goal Button
    const addGoalBtnWrapper = document.createElement('div');
    addGoalBtnWrapper.className = 'text-end mb-4';
    addGoalBtnWrapper.innerHTML = `
        <button class="btn btn-sm btn-outline-primary rounded-pill" data-bs-toggle="modal" data-bs-target="#add-goal-modal">
            🎯 Add New Goal
        </button>
    `;
    content.appendChild(addGoalBtnWrapper);
    
    // Attach listener for Add Goal to set context
    addGoalBtnWrapper.querySelector('button').addEventListener('click', () => {
        setGoalTargetAccount(id);
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
    
    const currentYear = new Date().getFullYear();
    if (years.includes(currentYear)) {
        yearSelect.value = currentYear;
    } else {
        yearSelect.value = "-1";
    }

    if (yearSelect.value == currentYear) {
         monthSelect.value = new Date().getMonth();
    }

    const updateTransactions = () => {
        const selectedMonth = parseInt(monthSelect.value, 10);
        const selectedYear = parseInt(yearSelect.value, 10);
        const limit = parseInt(limitSelect.value, 10);

        let filteredTransactions = account.transactions.filter(tx => !tx.deleted);

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
    setupFormListeners(content, id, 'earn', () => renderAll(id));
    setupFormListeners(content, id, 'spend', () => renderAll(id));

    // Initial render
    updateTransactions();

    return accountBox;
}