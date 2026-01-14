import { resizeImage } from '../utils.js';

describe('Utils', () => {
    let originalFileReader;
    let originalImage;
    let originalCreateElement;

    beforeAll(() => {
        originalFileReader = window.FileReader;
        originalImage = window.Image;
        originalCreateElement = document.createElement;
    });

    afterAll(() => {
        window.FileReader = originalFileReader;
        window.Image = originalImage;
        document.createElement = originalCreateElement;
    });

    test('resizeImage: resizes image correctly', async () => {
        // Mock FileReader
        const mockReader = {
            readAsDataURL: jest.fn(function() {
                setTimeout(() => {
                    if (this.onload) this.onload({ target: { result: 'base64-source' } });
                }, 10);
            }),
            onload: null,
            onerror: null
        };
        window.FileReader = jest.fn(() => mockReader);

        // Mock Canvas
        const mockContext = {
            drawImage: jest.fn()
        };
        const mockCanvas = {
            getContext: jest.fn(() => mockContext),
            toDataURL: jest.fn(() => 'data:image/png;base64,resized'),
            width: 0,
            height: 0
        };
        document.createElement = jest.fn((tag) => {
            if (tag === 'canvas') return mockCanvas;
            // return originalCreateElement(tag); // JSDOM might not work well with mixed mocking
            return {}; 
        });

        // Mock Image
        const mockImage = {
            width: 300,
            height: 300,
            onload: null,
            onerror: null
        };
        
        // Use defineProperty to mock src setter
        Object.defineProperty(mockImage, 'src', {
            set: function(val) {
                setTimeout(() => {
                    if (this.onload) this.onload();
                }, 10);
            }
        });

        window.Image = jest.fn(() => mockImage);

        const file = new Blob([''], { type: 'image/png' });
        const result = await resizeImage(file, 150, 150);

        expect(result).toBe('data:image/png;base64,resized');
        expect(mockCanvas.width).toBe(150);
        expect(mockCanvas.height).toBe(150);
        expect(mockContext.drawImage).toHaveBeenCalledWith(mockImage, 0, 0, 150, 150);
    });
});
