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
        
        global.fetch.mockResolvedValue({ ok: true });

        await uploadToS3('some-data', 'file.txt');

        expect(global.fetch).toHaveBeenCalledWith(
            'https://fake-par.com/file.txt',
            expect.objectContaining({
                method: 'PUT',
                body: 'some-data'
            })
        );
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
        
        await uploadToS3('some-data', 'file.txt');

        expect(mockSend).toHaveBeenCalled();
        expect(PutObjectCommand).toHaveBeenCalledWith(expect.objectContaining({
            Bucket: 'my-bucket',
            Key: 'file.txt',
            Body: 'some-data'
        }));
    });

    test('downloadFromS3: uses PAR when configured', async () => {
        setCloudConfig({ parUrl: 'https://fake-par.com/' });
        
        global.fetch.mockResolvedValue({ 
            ok: true,
            text: () => Promise.resolve('cloud-data')
        });

        const data = await downloadFromS3('file.txt');

        expect(global.fetch).toHaveBeenCalledWith('https://fake-par.com/file.txt');
        expect(data).toBe('cloud-data');
    });
});
