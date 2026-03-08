# Google Sheets Integration Setup

## What It Does

When enabled, the simulation automatically syncs to a real Google Spreadsheet:

- **Dashboard sheet** - Live KPIs updated every turn (revenue, traffic, conversion, budget, pipeline)
- **Customers sheet** - Full customer pipeline (name, stage, budget, pain point, days since contact)
- **Invoice-XXX sheets** - Auto-created when Sales closes a deal (contract details, features included)

Anyone with the spreadsheet link can watch the startup operate in real-time.

## Setup (5 minutes)

### 1. Create a Google Cloud Service Account

```bash
# Go to https://console.cloud.google.com/
# Create a new project (or use existing)
# Enable the Google Sheets API
# Create a Service Account (IAM > Service Accounts > Create)
# Create a JSON key for the service account
# Download the JSON key file
```

### 2. Create a Google Spreadsheet

- Go to https://sheets.google.com and create a new spreadsheet
- Name it "Office OS Dashboard" (or anything you like)
- Share it with the service account email (found in the JSON key, looks like `xxx@xxx.iam.gserviceaccount.com`)
- Give it **Editor** access
- Copy the spreadsheet ID from the URL: `https://docs.google.com/spreadsheets/d/THIS_PART_IS_THE_ID/edit`

### 3. Set Environment Variables

```bash
export GOOGLE_SHEETS_CREDENTIALS=/path/to/your-service-account-key.json
export GOOGLE_SHEETS_SPREADSHEET_ID=your-spreadsheet-id-here
```

Or create a `.env` file in the `office_os/` directory:

```
GOOGLE_SHEETS_CREDENTIALS=/path/to/your-service-account-key.json
GOOGLE_SHEETS_SPREADSHEET_ID=your-spreadsheet-id-here
```

### 4. Install gspread

```bash
pip install gspread
```

### 5. Run

The integration activates automatically when the env vars are set. If they're not set, everything works normally without Sheets sync.

## What Gets Created

After running the simulation, your spreadsheet will have:

```
Tabs:
├── Dashboard          # Row per turn: Day, Phase, Revenue, Traffic, Conv%, ...
├── Customers          # Full pipeline: ID, Name, Size, Industry, Budget, Stage, ...
├── Invoice-001-ACME   # Auto-created when Acme Corp signs
├── Invoice-015-TECH   # Auto-created when TechStart signs
└── ...                # One invoice per closed deal
```

## Disabling

Just unset the environment variable:

```bash
unset GOOGLE_SHEETS_SPREADSHEET_ID
```

The simulation runs identically with or without Sheets integration.
