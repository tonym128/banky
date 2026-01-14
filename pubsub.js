// pubsub.js
const subscribers = {};

export const PubSub = {
    subscribe: (event, callback) => {
        if (!subscribers[event]) {
            subscribers[event] = [];
        }
        subscribers[event].push(callback);
        return {
            unsubscribe: () => {
                subscribers[event] = subscribers[event].filter(cb => cb !== callback);
            }
        };
    },

    publish: (event, data) => {
        if (!subscribers[event]) return;
        subscribers[event].forEach(callback => callback(data));
    }
};

export const EVENTS = {
    STATE_UPDATED: 'STATE_UPDATED',
    SYNC_STATUS_CHANGED: 'SYNC_STATUS_CHANGED',
    TOAST_NOTIFICATION: 'TOAST_NOTIFICATION'
};
