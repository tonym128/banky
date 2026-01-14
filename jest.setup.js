const { TextEncoder, TextDecoder } = require('util');

global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

const { webcrypto } = require('crypto');
global.crypto = webcrypto;

// Explicitly set on window/self for JSDOM
if (typeof global.self === 'undefined') {
    global.self = global;
}
Object.defineProperty(global.self, 'crypto', {
    value: webcrypto,
    writable: true 
});

// Mock console to keep output clean (optional, but good for CI)
// global.console = { ...console, log: jest.fn(), error: jest.fn() };
