// logger.js
export const logBuffer = [];
const originalLog = console.log;
const originalError = console.error;

function formatLog(level, args) {
    const timestamp = new Date().toISOString();
    const message = args.map(arg => {
        try {
            return typeof arg === 'object' ? JSON.stringify(arg) : String(arg);
        } catch (e) {
            return String(arg);
        }
    }).join(' ');
    return `[${timestamp}] [${level}] ${message}`;
}

export function initLogger() {
    console.log = function(...args) {
        logBuffer.push(formatLog('INFO', args));
        if (logBuffer.length > 1000) logBuffer.shift(); 
        originalLog.apply(console, args);
    };

    console.error = function(...args) {
        logBuffer.push(formatLog('ERROR', args));
        if (logBuffer.length > 1000) logBuffer.shift();
        originalError.apply(console, args);
    };
}
