import { uploadToS3, downloadFromS3, setCloudConfig } from '../s3.js';
import { S3Client, PutObjectCommand, GetObjectCommand } from 'https://esm.sh/@aws-sdk/client-s3';

// Mock fetch for PAR tests
global.fetch = jest.fn();

describe('S3 Module', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        localStorage.clear();
        global.fetch.mockReset();
    });

    test('uploadToS3: uses PAR when configured', async () => {
        setCloudConfig({ parUrl: 'https://fake-par.com/' });
        
        global.fetch.mockResolvedValue({ 
            ok: true,
            headers: new Map([['ETag', 'new-etag-par']])
        });

        const etag = await uploadToS3('some-data', 'file.txt');

        expect(global.fetch).toHaveBeenCalledWith(
            'https://fake-par.com/file.txt',
            expect.objectContaining({
                method: 'PUT',
                body: 'some-data'
            })
        );
        expect(etag).toBe('new-etag-par');
        expect(S3Client).not.toHaveBeenCalled(); // Should not use S3 Client
    });

    test('uploadToS3: uses S3Client when credentials configured', async () => {
        setCloudConfig({ 
            accessKeyId: 'ak', 
            secretAccessKey: 'sk', 
            region: 'us-east-1', 
            bucket: 'my-bucket' 
        });

        // The mock from __mocks__/esmSh.js returns an object with a send method
        const mockSend = S3Client.mock.results[0].value.send; 
        mockSend.mockResolvedValue({ ETag: 'new-etag-s3' });
        
        const etag = await uploadToS3('some-data', 'file.txt');

        expect(mockSend).toHaveBeenCalled();
        expect(PutObjectCommand).toHaveBeenCalledWith(expect.objectContaining({
            Bucket: 'my-bucket',
            Key: 'file.txt',
            Body: 'some-data'
        }));
        expect(etag).toBe('new-etag-s3');
    });

    test('downloadFromS3: uses PAR when configured', async () => {
        setCloudConfig({ parUrl: 'https://fake-par.com/' });
        
        global.fetch.mockResolvedValue({ 
            status: 200,
            ok: true,
            text: () => Promise.resolve('cloud-data'),
            headers: new Map([['ETag', 'etag-123']])
        });

        const result = await downloadFromS3('file.txt');

        expect(global.fetch).toHaveBeenCalledWith('https://fake-par.com/file.txt', expect.any(Object));
        expect(result.data).toBe('cloud-data');
        expect(result.etag).toBe('etag-123');
        expect(result.notModified).toBe(false);
    });

    test('downloadFromS3: handles 304 Not Modified in PAR mode', async () => {
        setCloudConfig({ parUrl: 'https://fake-par.com/' });
        
        global.fetch.mockResolvedValue({ 
            status: 304,
            ok: true
        });

        const result = await downloadFromS3('file.txt', 'old-etag');

        expect(global.fetch).toHaveBeenCalledWith(
            'https://fake-par.com/file.txt',
            expect.objectContaining({
                headers: { 'If-None-Match': 'old-etag' }
            })
        );
        expect(result.notModified).toBe(true);
        expect(result.etag).toBe('old-etag');
    });
});
