import { S3Client, PutObjectCommand, GetObjectCommand } from 'https://esm.sh/@aws-sdk/client-s3';
import { getSignedUrl } from 'https://esm.sh/@aws-sdk/s3-request-presigner';

let s3Client = null;
let cloudConfig = JSON.parse(localStorage.getItem('cloudConfig')) || null;

export function getCloudConfig() {
    return cloudConfig;
}

export function setCloudConfig(config) {
    cloudConfig = config;
    localStorage.setItem('cloudConfig', JSON.stringify(config));
    initS3Client();
}

export function initS3Client() {
    if (cloudConfig && cloudConfig.parUrl) {
        s3Client = null; // No S3 client needed for PAR
        return;
    }

    if (cloudConfig && cloudConfig.accessKeyId && cloudConfig.secretAccessKey && cloudConfig.region) {
        const clientConfig = {
            region: cloudConfig.region,
            credentials: {
                accessKeyId: cloudConfig.accessKeyId,
                secretAccessKey: cloudConfig.secretAccessKey
            }
        };

        if (cloudConfig.endpoint) {
            clientConfig.endpoint = cloudConfig.endpoint;
            // OCI and some other providers might require path-style access
            clientConfig.forcePathStyle = true; 
        }

        s3Client = new S3Client(clientConfig);
    }
}

export async function uploadToS3(data, filename) {
    if (!cloudConfig) return;

    // PAR Mode
    if (cloudConfig.parUrl) {
        try {
            const url = cloudConfig.parUrl + filename;
            const response = await fetch(url, {
                method: 'PUT',
                body: data
            });
            if (!response.ok) {
                throw new Error(`PAR Upload failed: ${response.statusText}`);
            }
            console.log('Successfully uploaded via PAR');
            return;
        } catch (error) {
            console.error('Error uploading via PAR:', error);
            throw error;
        }
    }

    // S3 Client Mode
    if (!s3Client) return;

    const command = new PutObjectCommand({
        Bucket: cloudConfig.bucket,
        Key: filename,
        Body: data,
        ContentType: 'text/plain'
    });

    try {
        await s3Client.send(command);
        console.log('Successfully uploaded to S3');
    } catch (error) {
        console.error('Error uploading to S3:', error);
        throw error;
    }
}

export async function downloadFromS3(filename) {
    if (!cloudConfig) return null;

    // PAR Mode
    if (cloudConfig.parUrl) {
         try {
            const url = cloudConfig.parUrl + filename;
            const response = await fetch(url);
            if (response.status === 404) return null; // File not found yet
            if (!response.ok) {
                throw new Error(`PAR Download failed: ${response.statusText}`);
            }
            const str = await response.text();
            return str;
        } catch (error) {
            console.error('Error downloading via PAR:', error);
            throw error;
        }
    }

    // S3 Client Mode
    if (!s3Client) return null;

    const command = new GetObjectCommand({
        Bucket: cloudConfig.bucket,
        Key: filename
    });

    try {
        const response = await s3Client.send(command);
        const str = await response.Body.transformToString();
        return str;
    } catch (error) {
        console.error('Error downloading from S3:', error);
        throw error;
    }
}

// Initialize on load
initS3Client();
