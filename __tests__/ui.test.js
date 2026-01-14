import { calculateGraphData } from '../ui.js';

// Mock dependencies to avoid loading full module with side effects
jest.mock('../state.js', () => ({}));
jest.mock('../s3.js', () => ({}));
jest.mock('../encryption.js', () => ({}));

describe('UI Module - Graph Data', () => {
    test('calculateGraphData: correctly calculates running balance', () => {
        const today = new Date().toISOString().split('T')[0];
        const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
        
        const transactions = [
            { date: yesterday, amount: 100 },
            { date: today, amount: -50 }
        ];

        const { labels, data } = calculateGraphData(transactions, 3);
        
        // Data is unshifted (newest last in iteration, but code unshifts so newest is last? Wait.)
        // Original code: i=0 (today), labels.unshift. So labels[0] is oldest.
        // Let's verify labels order.
        // i=0 (today) -> unshift -> labels=[today]
        // i=1 (yesterday) -> unshift -> labels=[yesterday, today]
        
        expect(labels).toContain(today);
        expect(labels).toContain(yesterday);
        
        // Check data points
        // yesterday: 100
        // today: 100 - 50 = 50
        
        const indexYesterday = labels.indexOf(yesterday);
        const indexToday = labels.indexOf(today);
        
        expect(data[indexYesterday]).toBe(100);
        expect(data[indexToday]).toBe(50);
    });

    test('calculateGraphData: handles gaps in dates', () => {
        const today = new Date().toISOString().split('T')[0];
        const twoDaysAgo = new Date(Date.now() - 86400000 * 2).toISOString().split('T')[0];
        
        const transactions = [
            { date: twoDaysAgo, amount: 200 }
        ];

        const { labels, data } = calculateGraphData(transactions, 3);
        
        // twoDaysAgo: 200
        // yesterday: 200 (carried over)
        // today: 200 (carried over)
        
        const indexTwoDaysAgo = labels.indexOf(twoDaysAgo);
        expect(data[indexTwoDaysAgo]).toBe(200);
        
        // Ensure subsequent days maintain the balance
        expect(data[labels.length - 1]).toBe(200);
    });
});
