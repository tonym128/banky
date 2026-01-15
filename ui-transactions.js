// ui-transactions.js
import { formatCurrency, showModalAlert } from './ui-components.js';
import { accounts, saveState } from './state.js';

export const EARN_CATEGORIES = {
    'allowance': { label: 'Allowance', icon: '💸' },
    'chores': { label: 'Chores', icon: '🧹' },
    'gift': { label: 'Gift', icon: '🎁' },
    'sell': { label: 'Sold Item', icon: '🏷️' },
    'interest': { label: 'Interest', icon: '📈' },
    'other': { label: 'Other', icon: '💰' }
};

export const SPEND_CATEGORIES = {
    'food': { label: 'Food/Treats', icon: '🍔' },
    'toys': { label: 'Toys', icon: '🧸' },
    'fun': { label: 'Entertainment', icon: '🎬' },
    'clothing': { label: 'Clothing', icon: '👕' },
    'electronics': { label: 'Electronics', icon: '🎮' },
    'other': { label: 'Other', icon: '💸' }
};

export function renderTransactionForm(type, accountId) {
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

export function setupFormListeners(container, accountId, type, onUpdate) {
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
                category,
                timestamp: Date.now() 
            });

            // Reset Form
            descriptionInput.value = '';
            amountInput.value = '';
            
            saveState();
            if (onUpdate) onUpdate();
        } else {
            showModalAlert("Please enter a valid amount greater than 0.");
        }
    });
}

export function renderTransactionList(container, transactions, accountId, emptyStateEl) {
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
