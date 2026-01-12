# Kids Bank PWA

Kids Bank is a secure, privacy-focused Progressive Web App (PWA) designed to help parents manage their children's bank accounts. It tracks transactions (earnings and spending), provides visual balance history, and supports secure cloud synchronization with client-side encryption.

## Features

- **Progressive Web App (PWA)**: Installable on Android, iOS, and Desktop. Works offline.
- **Client-Side Encryption**: All data is encrypted with AES-256-GCM before being uploaded to the cloud. Your keys never leave your device.
- **Secure Cloud Sync**: Sync across devices using AWS S3 or OCI Object Storage.
- **File System Access API**: On supported browsers, sync directly to a local JSON file on your disk.
- **QR Setup**: Easily share your encrypted sync configuration between devices using QR codes.
- **Balance Visualization**: Interactive charts showing 30-day balance trends using Chart.js.
- **Privacy First**: No backend server. You own your data and your storage.

## Installation

Since this is a PWA, you can simply visit the hosted URL and "Install" or "Add to Home Screen" via your browser menu.

To run locally:
1. Clone the repository.
2. Serve the directory using a web server (e.g., `npx serve .`).
3. Access via `localhost` (Service Workers and Web Crypto require HTTPS or localhost).

## Cloud Sync Setup

You can sync your data using either standard S3 credentials or an OCI Pre-Authenticated Request (PAR).

### Option 1: AWS S3 (Standard Credentials)

1. **Create an S3 Bucket**: Create a private bucket (e.g., `my-kids-bank-sync`).
2. **Configure CORS**: In your bucket settings, add the following CORS configuration:
   ```json
   [
       {
           "AllowedHeaders": ["*"],
           "AllowedMethods": ["PUT", "GET"],
           "AllowedOrigins": ["*"],
           "ExposeHeaders": []
       }
   ]
   ```
   *Note: For better security, replace `"*"` with your specific application domain.*
3. **IAM Policy**: Create an IAM user with programmatic access and attach this policy:
   ```json
   {
       "Version": "2012-10-17",
       "Statement": [
           {
               "Effect": "Allow",
               "Action": ["s3:PutObject", "s3:GetObject"],
               "Resource": "arn:aws:s3:::YOUR_BUCKET_NAME/*"
           },
           {
               "Effect": "Deny",
               "Action": "s3:ListBucket",
               "Resource": "arn:aws:s3:::YOUR_BUCKET_NAME"
           }
       ]
   }
   ```
4. **App Setup**: In the app Settings -> Cloud Sync -> Credentials mode, enter your Bucket, Region, Access Key, and Secret Key.

### Option 2: Oracle Cloud (OCI) PAR

1. **Create a Bucket**: Create a private bucket in OCI.
2. **Create a PAR**:
   - Go to the bucket details.
   - Create a "Pre-Authenticated Request".
   - Select **Bucket** as the resource type.
   - Select **Permit object reads and writes**.
   - Ensure the name ends with a trailing slash (e.g., `.../b/my-bucket/o/`).
3. **Configure CORS**: In the OCI Bucket settings, add a CORS rule allowing `GET` and `PUT` from your origin.
4. **App Setup**: In the app Settings -> Cloud Sync -> PAR mode, paste the full PAR URL.

## Security Note

When you click **"Generate New Keys"**, the app creates:
1. A random **Sync ID** (used as the filename in your bucket).
2. A random **256-bit AES Key** (stored only in your browser's local storage).

Your data is encrypted locally using the Web Crypto API before being sent to S3/OCI. Even if someone accesses your bucket, they cannot read your transactions without your unique key.

## Technologies Used

- **Web Crypto API**: AES-GCM encryption.
- **AWS SDK v3**: S3 client integration.
- **Html5-QRCode**: Camera-based QR scanning.
- **Chart.js**: Financial visualizations.
- **Bootstrap 5**: Responsive UI.
- **IndexedDB**: Persistent local state management.

## License

MIT License.
