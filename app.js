document.addEventListener('DOMContentLoaded', async () => {
    const addAccountBtn = document.getElementById('add-account-btn');
    const accountNameInput = document.getElementById('account-name');
    const accountImageInput = document.getElementById('account-image');
    const setSyncFileBtn = document.getElementById('set-sync-file-btn');
    const importFileInput = document.getElementById('import-file');
    const accountsContainer = document.getElementById('accounts-container');
    const autoSyncToggle = document.getElementById('auto-sync-toggle');

    const settingsModal = new bootstrap.Modal(document.getElementById('settings-modal'));
    const accountContextMenu = new bootstrap.Modal(document.getElementById('account-context-menu'));

    const removeAccountLink = document.getElementById('remove-account-link');
    const addEditImageLink = document.getElementById('add-edit-image-link');
    const removeImageLink = document.getElementById('remove-image-link');
    const editAccountImageInput = document.getElementById('edit-account-image');

    let accounts = JSON.parse(localStorage.getItem('accounts')) || {};
    let charts = {};
    let currentAccountId = null;
    let autoSyncEnabled = JSON.parse(localStorage.getItem('autoSyncEnabled')) || false;
    let fileHandle = null;

    autoSyncToggle.checked = autoSyncEnabled;

    const fsaSupported = 'showOpenFilePicker' in window;

    if (!fsaSupported) {
        setSyncFileBtn.textContent = 'Export';
        const importBtn = document.createElement('button');
        importBtn.textContent = 'Import';
        importBtn.className = 'btn btn-secondary';
        importBtn.addEventListener('click', () => importFileInput.click());
        setSyncFileBtn.insertAdjacentElement('afterend', importBtn);
    }

    async function loadInitialFile() {
        if (!fsaSupported) return;
        fileHandle = await get('fileHandle');
        if (fileHandle) {
            if (await fileHandle.queryPermission({ mode: 'readwrite' }) === 'granted') {
                await loadData();
            }
        }
    }

    async function loadData() {
        if (!fileHandle) return;
        try {
            const file = await fileHandle.getFile();
            const contents = await file.text();
            if (contents) {
                accounts = JSON.parse(contents);
                renderAll();
            }
        } catch (error) {
            console.error('Failed to load data:', error);
            alert('Failed to load data from the sync file.');
        }
    }

    async function setSyncFile() {
        if (!fsaSupported) {
            const data = JSON.stringify(accounts, null, 2);
            const blob = new Blob([data], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'kids-bank-data.json';
            a.click();
            URL.revokeObjectURL(url);
            return;
        }

        try {
            [fileHandle] = await window.showOpenFilePicker({
                types: [{
                    description: 'JSON Files',
                    accept: { 'application/json': ['.json'] }
                }]
            });
            await set('fileHandle', fileHandle);
            await loadData();
        } catch (error) {
            console.error('Failed to set sync file:', error);
        }
    }

    setSyncFileBtn.addEventListener('click', setSyncFile);

    function debounce(func, delay) {
        let timeout;
        return function(...args) {
            const context = this;
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(context, args), delay);
        };
    }

    const autoExport = debounce(async () => {
        if (!autoSyncEnabled) return;
        if (fsaSupported && fileHandle) {
            if (await fileHandle.queryPermission({ mode: 'readwrite' }) !== 'granted') {
                if (await fileHandle.requestPermission({ mode: 'readwrite' }) !== 'granted') {
                    alert('Permission to write to the file was denied.');
                    return;
                }
            }
            try {
                const writable = await fileHandle.createWritable();
                await writable.write(JSON.stringify(accounts, null, 2));
                await writable.close();
            } catch (error) {
                console.error('Failed to auto-sync to file:', error);
                alert('Failed to auto-sync to file. Please ensure the file is not open in another program.');
            }
        } else {
            const data = JSON.stringify(accounts, null, 2);
            const blob = new Blob([data], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'kids-bank-data.json';
            a.click();
            URL.revokeObjectURL(url);
        }
    }, 1500);

    function saveState() {
        localStorage.setItem('accounts', JSON.stringify(accounts));
        autoExport();
    }

    autoSyncToggle.addEventListener('change', async () => {
        autoSyncEnabled = autoSyncToggle.checked;
        localStorage.setItem('autoSyncEnabled', JSON.stringify(autoSyncEnabled));
        if (autoSyncEnabled) {
            if (fsaSupported && !fileHandle) {
                await setSyncFile();
            }
            saveState();
        }
    });

    importFileInput.addEventListener('change', () => {
        const file = importFileInput.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const importedAccounts = JSON.parse(e.target.result);
                    accounts = importedAccounts;
                    saveState();
                    renderAll();
                } catch (error) {
                    alert('Invalid JSON file.');
                }
            };
            reader.readAsText(file);
        }
    });

    function renderAccounts() {
        accountsContainer.innerHTML = '';
        for (const id in accounts) {
            const account = accounts[id];
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
            const balance = account.transactions.reduce((sum, tx) => sum + tx.amount, 0);
            button.innerHTML = `${imageHtml}<strong>${account.name}</strong>&nbsp;- Balance: ${balance.toFixed(2)}`;

            button.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                currentAccountId = id;
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

            const transactionHeader = document.createElement('h3');
            transactionHeader.textContent = 'Transactions';
            content.appendChild(transactionHeader);

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
            const transactionListBody = transactionList.querySelector('tbody');
            account.transactions.forEach((tx, index) => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${tx.date}</td>
                    <td>${tx.description}</td>
                    <td>${tx.amount.toFixed(2)}</td>
                    <td><button class="btn btn-sm btn-warning delete-transaction-btn" data-account-id="${id}" data-index="${index}">Delete</button></td>
                `;
                transactionListBody.appendChild(row);
            });
            content.appendChild(transactionList);

            const graphHeader = document.createElement('h3');
            graphHeader.textContent = 'Balance History (Last 30 Days)';
            content.appendChild(graphHeader);

            const canvas = document.createElement('canvas');
            content.appendChild(canvas);

            contentContainer.appendChild(content);
            accountBox.appendChild(contentContainer);
            accountsContainer.appendChild(accountBox);

            document.getElementById(`earn-date-${id}`).valueAsDate = new Date();
            document.getElementById(`spend-date-${id}`).valueAsDate = new Date();

            document.getElementById(`earn-btn-${id}`).addEventListener('click', () => {
                const description = document.getElementById(`earn-description-${id}`).value.trim();
                const amount = parseFloat(document.getElementById(`earn-amount-${id}`).value);
                let date = document.getElementById(`earn-date-${id}`).value;
                if (!date) {
                    date = new Date().toISOString().split('T')[0];
                }
                if (!isNaN(amount)) {
                    accounts[id].transactions.push({ date, description, amount });
                    document.getElementById(`earn-description-${id}`).value = '';
                    document.getElementById(`earn-amount-${id}`).value = '';
                    saveState();
                    renderAll();
                }
            });

            document.getElementById(`spend-btn-${id}`).addEventListener('click', () => {
                const description = document.getElementById(`spend-description-${id}`).value.trim();
                const amount = parseFloat(document.getElementById(`spend-amount-${id}`).value);
                let date = document.getElementById(`spend-date-${id}`).value;
                if (!date) {
                    date = new Date().toISOString().split('T')[0];
                }
                if (!isNaN(amount)) {
                    accounts[id].transactions.push({ date, description, amount: -amount });
                    document.getElementById(`spend-description-${id}`).value = '';
                    document.getElementById(`spend-amount-${id}`).value = '';
                    saveState();
                    renderAll();
                }
            });

            renderGraph(canvas, account, id);
        }
    }

    function renderGraph(canvas, account, id) {
        const today = new Date();
        const last30Days = new Date(today);
        last30Days.setDate(today.getDate() - 30);

        const transactionsInLast30Days = account.transactions.filter(tx => new Date(tx.date) >= last30Days);
        transactionsInLast30Days.sort((a, b) => new Date(a.date) - new Date(b.date));

        const labels = [];
        const data = [];
        let runningBalance = 0;

        const dateMap = new Map();
        transactionsInLast30Days.forEach(tx => {
            runningBalance += tx.amount;
            dateMap.set(tx.date, runningBalance);
        });

        for (let i = 0; i < 30; i++) {
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

    addAccountBtn.addEventListener('click', () => {
        const name = accountNameInput.value.trim();
        const imageFile = accountImageInput.files[0];

        if (name) {
            if (imageFile) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    const id = Date.now().toString();
                    accounts[id] = { name, transactions: [], image: e.target.result };
                    accountNameInput.value = '';
                    accountImageInput.value = '';
                    saveState();
                    renderAll();
                };
                reader.readAsDataURL(imageFile);
            } else {
                const id = Date.now().toString();
                accounts[id] = { name, transactions: [] };
                accountNameInput.value = '';
                saveState();
                renderAll();
            }
        }
    });

    accountsContainer.addEventListener('click', (e) => {
        if (e.target.classList.contains('delete-transaction-btn')) {
            const accountId = e.target.dataset.accountId;
            const index = parseInt(e.target.dataset.index, 10);
            accounts[accountId].transactions.splice(index, 1);
            saveState();
            renderAll();
        }
    });

    removeAccountLink.addEventListener('click', (e) => {
        e.preventDefault();
        if (currentAccountId && confirm('Are you sure you want to remove this account?')) {
            delete accounts[currentAccountId];
            saveState();
            renderAll();
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
            renderAll();
        }
        accountContextMenu.hide();
    });

    editAccountImageInput.addEventListener('change', () => {
        const file = editAccountImageInput.files[0];
        if (file && currentAccountId) {
            const reader = new FileReader();
            reader.onload = (e) => {
                accounts[currentAccountId].image = e.target.result;
                saveState();
                renderAll();
            };
            reader.readAsDataURL(file);
        }
    });

    function renderAll() {
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

    loadInitialFile().then(() => {
        renderAll();
    });
});
