# Google Sheets Setup Guide for PEPTSCI Dashboard

## Prerequisites
1. A Google Account
2. Your PEPTSCI Google Sheets with sales data
3. Access to Google Cloud Console

## Step 1: Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click "Select a project" → "New Project"
3. Name it "PEPTSCI Dashboard" and click "Create"

## Step 2: Enable Google Sheets API

1. In your Google Cloud Project, go to "APIs & Services" → "Library"
2. Search for "Google Sheets API"
3. Click on it and press "Enable"

## Step 3: Create a Service Account

1. Go to "APIs & Services" → "Credentials"
2. Click "+ Create Credentials" → "Service Account"
3. Fill in:
   - Service account name: `peptsci-dashboard`
   - Service account ID: (auto-filled)
   - Click "Create and Continue"
4. Skip the optional steps and click "Done"

## Step 4: Generate Private Key

1. Click on your newly created service account
2. Go to the "Keys" tab
3. Click "Add Key" → "Create new key"
4. Choose "JSON" and click "Create"
5. A JSON file will download - **KEEP THIS SAFE!**

## Step 5: Get Your Spreadsheet ID

1. Open your PEPTSCI Google Sheets
2. Look at the URL: `https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit`
3. Copy the SPREADSHEET_ID part (it's the long string between `/d/` and `/edit`)

## Step 6: Share Your Sheet with Service Account

1. In your Google Sheets, click "Share" button
2. Add the service account email (found in your JSON file as `client_email`)
   - It looks like: `peptsci-dashboard@your-project.iam.gserviceaccount.com`
3. Give it "Viewer" access (or "Editor" if you want to write data)
4. Click "Send"

## Step 7: Configure Environment Variables

1. In your `peptsci-dashboard` folder, create a file named `.env.local`
2. Open the JSON file you downloaded and add to `.env.local`:

```env
# From the "private_key" field in your JSON file
# IMPORTANT: Keep the \n characters - they're part of the key!
GOOGLE_SHEETS_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBg...your-full-key-here...\n-----END PRIVATE KEY-----\n"

# From the "client_email" field in your JSON file
GOOGLE_SHEETS_CLIENT_EMAIL="peptsci-dashboard@your-project.iam.gserviceaccount.com"

# The ID from your Google Sheets URL
SPREADSHEET_ID="your-spreadsheet-id-here"
```

## Step 8: Restart Your Server

1. Stop the development server (Ctrl+C)
2. Start it again:
```bash
npm run dev
```

## Expected Sheet Structure

Your Google Sheets should have these tabs with the following columns:

### Sales Tab
- Column A: Date
- Column B: Customer Name
- Column C: Email
- Column D: Phone
- Column E: Product Name
- Column F: Dose/Strength
- Column G: Address
- Column H: City
- Column I: State
- Column J: Zip
- Column K: Tracking Number
- Column L: Paid Amount
- Column M: Vials
- Column N: Amount Per Vial
- Column O: Notes
- Column P: Invoice Paid (TRUE/FALSE)

### Inventory Tab
- Column A: SKU
- Column B: Medication Name
- Column C: Dose
- Column D: SRP (Suggested Retail Price)
- Column E: Cost
- Column F: Inventory Ordered
- Column G: Inventory Available

### Retail Pricing Tab (Optional)
- Column A: SKU
- Column B: Product
- Column C: Dose
- Column D: SRP
- Column E: Cost

## Troubleshooting

### "Missing Google Sheets environment variables"
- Make sure `.env.local` file exists and has all three required variables
- Restart the development server after adding the file

### "Permission denied" or "404 Not Found"
- Verify you shared the Google Sheet with the service account email
- Check that the SPREADSHEET_ID is correct

### "Invalid private key"
- Make sure you copied the ENTIRE private key including `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----`
- Keep all the `\n` characters in the key

### Still having issues?
1. Double-check the service account email has access to your sheet
2. Verify the Spreadsheet ID is correct
3. Make sure Google Sheets API is enabled in your Google Cloud project
4. Check the browser console for detailed error messages

## Need Help?
If you're still having trouble, check that:
- Your Google Sheet is not private/restricted
- The service account has at least "Viewer" permission
- All environment variables are properly formatted
- The server was restarted after adding `.env.local`
