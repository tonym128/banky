
import { mergeAccounts } from '../state.js';

describe('Feature: Savings Goals', () => {
    test('mergeAccounts: correctly merges goals metadata', () => {
        const local = {
            'acc1': { 
                id: 'acc1', 
                transactions: [],
                goals: [
                    { id: 'g1', name: 'Bike', target: 100 },
                    { id: 'g2', name: 'Lego', target: 50 }
                ]
            }
        };
        const cloud = {
            'acc1': { 
                id: 'acc1', 
                transactions: [],
                goals: [
                    { id: 'g1', name: 'Old Bike Name', target: 80 }, // Conflict
                    { id: 'g3', name: 'Doll', target: 20 } // Cloud only
                ]
            }
        };
        
        const result = mergeAccounts(local, cloud, [], []);
        const mergedGoals = result.accounts['acc1'].goals;
        
        // Should have 3 goals
        expect(mergedGoals).toHaveLength(3);
        
        // Local should win for 'g1'
        const g1 = mergedGoals.find(g => g.id === 'g1');
        expect(g1.name).toBe('Bike');
        expect(g1.target).toBe(100);
        
        // 'g2' from local should be there
        expect(mergedGoals.find(g => g.id === 'g2')).toBeDefined();
        
        // 'g3' from cloud should be there
        expect(mergedGoals.find(g => g.id === 'g3')).toBeDefined();
    });

    test('mergeAccounts: handles null goals', () => {
        const local = {
            'acc1': { id: 'acc1', transactions: [] } // No goals
        };
        const cloud = {
            'acc1': { 
                id: 'acc1', 
                transactions: [],
                goals: [{ id: 'g1', name: 'Bike' }]
            }
        };
        
        const result = mergeAccounts(local, cloud, [], []);
        const mergedGoals = result.accounts['acc1'].goals;
        
        expect(mergedGoals).toHaveLength(1);
        expect(mergedGoals[0].name).toBe('Bike');
    });
});
