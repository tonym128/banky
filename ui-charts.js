// ui-charts.js

let charts = {};

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

export function renderGraph(canvas, account, id, transactions) {
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
