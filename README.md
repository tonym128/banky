# Kids Bank SPA

Kids Bank is a single-page application (SPA) designed to teach kids about managing money. It allows users to create accounts, track transactions, and visualize balance history. The app uses local storage to persist data, making it lightweight and easy to use.

## Features

- **Account Management**: Add accounts with names and optional images.
- **Transaction Tracking**: Record earnings and spending with descriptions, amounts, and dates.
- **Balance Visualization**: View balance history for the last 30 days using interactive charts.
- **Data Management**: Export and import account data as JSON files.
- **Settings**: Expand/collapse settings box and manage accounts.
- **Local Storage**: All data is stored locally in the browser.

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/your-username/kids-bank.git
   cd kids-bank
   ```

2. Open the `index.html` file in your browser to start using the app.

## Usage

### Adding Accounts
1. Enter the account name in the "New account name" field.
2. Optionally, upload an image for the account.
3. Click the "Add Account" button.

### Managing Transactions
1. Expand an account by clicking its header.
2. Use the "Earn" or "Spend" sections to add transactions.
3. View transaction history and delete individual transactions.

### Exporting and Importing Data
- **Export**: Click the "Export Data" button to download account data as a JSON file.
- **Import**: Upload a JSON file using the file input and click "Import Data" to load account data.

### Deleting Accounts
1. Select an account from the dropdown in the settings section.
2. Click the "Delete Selected Account" button to remove the account.

## Technologies Used

- **HTML**: Structure of the app.
- **CSS**: Styling and layout.
- **JavaScript**: Functionality and interactivity.
- **Chart.js**: Visualization of balance history.
- **Local Storage**: Persistent data storage.

## Project Structure

```
├── index.html       # Main HTML file
├── styles.css       # Styling for the app
├── app.js           # JavaScript logic
├── sw.js            # Service worker for caching
├── manifest.json    # Web app manifest
├── images/          # Icons for the app
```

## Future Enhancements

- Add user authentication for multi-user support.
- Integrate cloud storage for data persistence across devices.
- Add more visualization options for transactions.

## License

This project is licensed under the MIT License. See the `LICENSE` file for details.

---

Enjoy using Kids Bank to teach kids about financial literacy!