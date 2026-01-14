export const S3Client = jest.fn(() => ({
    send: jest.fn()
}));
export const PutObjectCommand = jest.fn();
export const GetObjectCommand = jest.fn();
export const getSignedUrl = jest.fn();
