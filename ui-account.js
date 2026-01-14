// ui-account.js
import { accounts, saveState, removeAccount } from './state.js';
import { formatCurrency, showModalAlert, showModalConfirm } from './ui-components.js';
import { resizeImage } from './utils.js';

let charts = {};
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
            accounts[id] = { name, transactions: [], image };
            accountNameInput.value = '';
            accountImageInput.value = '';
            saveState();
            renderAll(id);

            const addAccountModal = bootstrap.Modal.getInstance(document.getElementById('add-account-modal'));
            if (addAccountModal) addAccountModal.hide();
        }
    });

    removeAccountLink.addEventListener('click', (e) => {
        e.preventDefault();
        accountContextMenu.hide(); // Hide context menu first
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
    button.innerHTML = `${imageHtml}<strong>${account.name}</strong>&nbsp;- Balance: ${formatCurrency(balance)}`;

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
    dateFilterSection.className = 'row mb-3 align-items-end';
    dateFilterSection.innerHTML = `
        <div class="col-md-3">
            <label for="month-select-${id}" class="form-label">Month</label>
            <select id="month-select-${id}" class="form-select">
                <option value="-1">All</option>
                ${[...Array(12).keys()].map(i => `<option value="${i}">${new Date(0, i).toLocaleString('default', { month: 'long' })}</option>`).join('')}
            </select>
        </div>
        <div class="col-md-3">
            <label for="year-select-${id}" class="form-label">Year</label>
            <select id="year-select-${id}" class="form-select"></select>
        </div>
        <div class="col-md-3">
             <label for="limit-select-${id}" class="form-label">Show</label>
             <select id="limit-select-${id}" class="form-select">
                <option value="20" selected>Last 20</option>
                <option value="50">Last 50</option>
                <option value="100">Last 100</option>
                <option value="-1">All</option>
             </select>
        </div>
    `;
    content.appendChild(dateFilterSection);

    const startingBalanceEl = document.createElement('p');
    content.appendChild(startingBalanceEl);

    const emptyStateEl = document.createElement('div');
    emptyStateEl.className = 'text-center p-4 text-muted bg-light rounded mb-3';
    emptyStateEl.style.display = 'none';
    emptyStateEl.innerHTML = `
        <div style="font-size: 3rem;">🐷</div>
        <p class="mt-2">No transactions yet. Add some pocket money to get started!</p>
    `;
    content.appendChild(emptyStateEl);

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
    const limitSelect = content.querySelector(`#limit-select-${id}`);

    const years = [...new Set(account.transactions.filter(tx => !tx.deleted).map(tx => new Date(tx.date).getFullYear()))];
    yearSelect.innerHTML = '<option value="-1">All</option>' + years.map(y => `<option value="${y}">${y}</option>`).join('');

    const updateTransactions = () => {
        const selectedMonth = parseInt(monthSelect.value, 10);
        const selectedYear = parseInt(yearSelect.value, 10);
        const limit = parseInt(limitSelect.value, 10);

        let filteredTransactions = account.transactions.filter(tx => !tx.deleted);

        // Sort by date descending (latest first)
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

        startingBalanceEl.textContent = `Starting Balance (for selected period): ${formatCurrency(startingBalance)}`;
        
        // Apply limit
        const displayTransactions = limit === -1 ? filteredTransactions : filteredTransactions.slice(0, limit);

        const transactionListBody = transactionList.querySelector('tbody');
        transactionListBody.innerHTML = '';
        
        if (displayTransactions.length === 0) {
            transactionList.style.display = 'none';
            emptyStateEl.style.display = 'block';
        } else {
            transactionList.style.display = 'table';
            emptyStateEl.style.display = 'none';
            
            displayTransactions.forEach((tx) => {
                const row = document.createElement('tr');
                const amountClass = tx.amount >= 0 ? 'text-success' : 'text-danger';
                row.innerHTML = `
                    <td>${tx.date}</td>
                    <td>${tx.description}</td>
                    <td class="${amountClass}"><strong>${formatCurrency(tx.amount)}</strong></td>
                    <td class="text-end">
                        <button class="btn btn-sm btn-outline-warning delete-transaction-btn" data-account-id="${id}" data-transaction-id="${tx.id}">
                            🗑️
                        </button>
                    </td>
                `;
                transactionListBody.appendChild(row);
            });
        }
        renderGraph(canvas, account, id, filteredTransactions); // Graph uses all filtered, ignoring limit for better context
    };

    monthSelect.addEventListener('change', updateTransactions);
    yearSelect.addEventListener('change', updateTransactions);
    limitSelect.addEventListener('change', updateTransactions);

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
