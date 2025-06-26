document.addEventListener('DOMContentLoaded', () => {
    const addAccountBtn = document.getElementById('add-account-btn');
    const accountNameInput = document.getElementById('account-name');
    const accountImageInput = document.getElementById('account-image');
    const exportBtn = document.getElementById('export-btn');
    const importBtn = document.getElementById('import-btn');
    const importFileInput = document.getElementById('import-file');
    const accountsContainer = document.getElementById('accounts-container');
    const expandAllBtn = document.getElementById('expand-all-btn');
    const collapseAllBtn = document.getElementById('collapse-all-btn');
    const toggleSettingsBtn = document.getElementById('toggle-settings-btn');
    const settingsContent = document.querySelector('.settings-content');

    let accounts = JSON.parse(localStorage.getItem('accounts')) || {};
    let charts = {};

    function saveState() {
        localStorage.setItem('accounts', JSON.stringify(accounts));
    }

    

    function renderAccounts() {
        accountsContainer.innerHTML = '';
        for (const id in accounts) {
            const account = accounts[id];
            const accountBox = document.createElement('div');
            accountBox.classList.add('account-box');

            const header = document.createElement('div');
            header.classList.add('account-header');
            let imageHtml = '';
            if (account.image) {
                imageHtml = `<img src="${account.image}" class="account-summary-image">`;
            }
            const balance = account.transactions.reduce((sum, tx) => sum + tx.amount, 0);
            header.innerHTML = `${imageHtml}<strong>${account.name}</strong> - Balance: ${balance.toFixed(2)}`;
            header.addEventListener('click', () => {
                accountBox.classList.toggle('active');
            });
            accountBox.appendChild(header);

            const content = document.createElement('div');
            content.classList.add('account-content');

            const earnSpendSection = document.createElement('div');
            earnSpendSection.classList.add('earn-spend-section');
            earnSpendSection.innerHTML = `
                <div class="earn-box">
                    <h2>Earn</h2>
                    <input type="date" id="earn-date-${id}">
                    <input type="text" id="earn-description-${id}" placeholder="Description">
                    <input type="number" id="earn-amount-${id}" placeholder="Amount">
                    <button id="earn-btn-${id}">Save</button>
                </div>
                <div class="spend-box">
                    <h2>Spend</h2>
                    <input type="date" id="spend-date-${id}">
                    <input type="text" id="spend-description-${id}" placeholder="Description">
                    <input type="number" id="spend-amount-${id}" placeholder="Amount">
                    <button id="spend-btn-${id}">Save</button>
                </div>
            `;
            content.appendChild(earnSpendSection);

            const transactionHeader = document.createElement('h3');
            transactionHeader.textContent = 'Transactions';
            content.appendChild(transactionHeader);

            const transactionList = document.createElement('table');
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
                    <td><button class="delete-transaction-btn" data-account-id="${id}" data-index="${index}">Delete</button></td>
                `;
                transactionListBody.appendChild(row);
            });
            content.appendChild(transactionList);

            const graphHeader = document.createElement('h3');
            graphHeader.textContent = 'Balance History (Last 30 Days)';
            content.appendChild(graphHeader);

            const canvas = document.createElement('canvas');
            content.appendChild(canvas);

            accountBox.appendChild(content);
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

    expandAllBtn.addEventListener('click', () => {
        const accountBoxes = document.querySelectorAll('.account-box');
        accountBoxes.forEach(box => box.classList.add('active'));
    });

    collapseAllBtn.addEventListener('click', () => {
        const accountBoxes = document.querySelectorAll('.account-box');
        accountBoxes.forEach(box => box.classList.remove('active'));
    });

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

    exportBtn.addEventListener('click', () => {
        const data = JSON.stringify(accounts, null, 2);
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'kids-bank-data.json';
        a.click();
        URL.revokeObjectURL(url);
    });

    importBtn.addEventListener('click', () => {
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

    toggleSettingsBtn.addEventListener('click', () => {
        settingsContent.style.display = settingsContent.style.display === 'none' ? 'block' : 'none';
    });

    function renderAll() {
        renderAccounts();
    }

    renderAll();
});
