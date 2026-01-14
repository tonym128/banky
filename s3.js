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
            // Fetch the new ETag if available
            return response.headers.get('ETag');
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
        const result = await s3Client.send(command);
        console.log('Successfully uploaded to S3');
        return result.ETag;
    } catch (error) {
        console.error('Error uploading to S3:', error);
        throw error;
    }
}

export async function downloadFromS3(filename, etag = null) {
    if (!cloudConfig) return null;

    // PAR Mode
    if (cloudConfig.parUrl) {
         try {
            const url = cloudConfig.parUrl + filename;
            const headers = {};
            if (etag) {
                headers['If-None-Match'] = etag;
            }

            const response = await fetch(url, { headers });
            
            if (response.status === 304) {
                return { notModified: true, etag };
            }
            if (response.status === 404) return null; // File not found yet
            if (!response.ok) {
                throw new Error(`PAR Download failed: ${response.statusText}`);
            }
            
            const str = await response.text();
            const newEtag = response.headers.get('ETag');
            return { data: str, etag: newEtag, notModified: false };
        } catch (error) {
            console.error('Error downloading via PAR:', error);
            throw error;
        }
    }

    // S3 Client Mode
    if (!s3Client) return null;

    const input = {
        Bucket: cloudConfig.bucket,
        Key: filename
    };
    if (etag) {
        input.IfNoneMatch = etag;
    }

    const command = new GetObjectCommand(input);

    try {
        const response = await s3Client.send(command);
        const str = await response.Body.transformToString();
        return { data: str, etag: response.ETag, notModified: false };
    } catch (error) {
        // AWS SDK throws an error for 304 Not Modified
        if (error.name === '304' || error.$metadata?.httpStatusCode === 304) {
            return { notModified: true, etag };
        }
        if (error.name === 'NoSuchKey') return null;
        
        console.error('Error downloading from S3:', error);
        throw error;
    }
}

// Initialize on load
initS3Client();
