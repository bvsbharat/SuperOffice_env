"""
Google Sheets integration for Office OS.

Syncs simulation state to a real Google Spreadsheet so anyone with the link
can watch the startup operate in real-time.

Sheets created:
  - "Dashboard"   : Live KPIs, budget, revenue, agent activity
  - "Customers"   : Full customer pipeline with stages, budgets, pain points
  - "Invoice-XXX" : One sheet per closed deal with invoice details

Setup:
  1. Create a Google Cloud service account and download the JSON key
  2. Set env var GOOGLE_SHEETS_CREDENTIALS to the path of that JSON file
  3. Create a new Google Spreadsheet and share it with the service account email
  4. Set env var GOOGLE_SHEETS_SPREADSHEET_ID to the spreadsheet ID
     (the long string in the spreadsheet URL between /d/ and /edit)

  Or pass credentials_path and spreadsheet_id directly to GoogleSheetsSync.
"""

from __future__ import annotations

import json
import os
import logging
import tempfile
from datetime import datetime
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from market.state import MarketState, Customer

logger = logging.getLogger(__name__)


def _load_gspread():
    """Lazy import gspread so the rest of the app works without it."""
    try:
        import gspread
        return gspread
    except ImportError:
        raise ImportError(
            "gspread is required for Google Sheets integration. "
            "Install with: pip install gspread"
        )


class GoogleSheetsSync:
    """
    Syncs Office OS state to Google Sheets in real-time.

    Usage:
        sync = GoogleSheetsSync(spreadsheet_id="your-spreadsheet-id")
        sync.setup()  # Creates Dashboard and Customers sheets

        # After each step or sales action:
        sync.update_dashboard(market_state)
        sync.update_customers(market_state)

        # When a deal closes:
        sync.create_invoice(customer, market_state)
    """

    def __init__(
        self,
        spreadsheet_id: str | None = None,
        credentials_path: str | None = None,
    ):
        self._spreadsheet_id = spreadsheet_id or os.environ.get("GOOGLE_SHEETS_SPREADSHEET_ID", "")
        raw_creds = credentials_path or os.environ.get("GOOGLE_SHEETS_CREDENTIALS", "")
        self._credentials_path = os.path.expanduser(raw_creds) if raw_creds else ""
        self._client = None
        self._spreadsheet = None
        self._enabled = bool(self._spreadsheet_id)

    @property
    def enabled(self) -> bool:
        return self._enabled

    def setup(self) -> bool:
        """
        Connect to Google Sheets and create/verify required sheets.
        Returns True if connected successfully, False otherwise.
        """
        if not self._enabled:
            logger.info("Google Sheets sync disabled (no GOOGLE_SHEETS_SPREADSHEET_ID set)")
            return False

        try:
            gspread = _load_gspread()

            creds_value = self._credentials_path
            if creds_value and not os.path.isfile(creds_value):
                # Treat as inline JSON (e.g. from HF Secrets)
                creds_dict = json.loads(creds_value)
                tmp = tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False)
                json.dump(creds_dict, tmp)
                tmp.close()
                self._client = gspread.service_account(filename=tmp.name)
                os.unlink(tmp.name)
            elif creds_value:
                self._client = gspread.service_account(filename=creds_value)
            else:
                self._client = gspread.service_account()

            self._spreadsheet = self._client.open_by_key(self._spreadsheet_id)
            logger.info(f"Connected to Google Sheet: {self._spreadsheet.title}")

            self._ensure_sheet("Dashboard")
            self._ensure_sheet("Customers")

            # Initialize Dashboard headers
            dash = self._spreadsheet.worksheet("Dashboard")
            dash.clear()
            dash.update("A1:L1", [[
                "Day", "Phase", "Revenue ($)", "Total Revenue ($)",
                "Traffic", "Conversion %", "Brand Awareness",
                "Budget ($)", "Pipeline Value ($)",
                "Features Shipped", "Content Published", "Active Campaigns",
            ]])
            dash.format("A1:L1", {"textFormat": {"bold": True}})

            # Initialize Customers headers
            cust = self._spreadsheet.worksheet("Customers")
            cust.clear()
            cust.update("A1:K1", [[
                "ID", "Name", "Size", "Industry", "Budget ($)",
                "Pain Point", "Source", "Stage", "Created Day",
                "Days Since Contact", "Objections",
            ]])
            cust.format("A1:K1", {"textFormat": {"bold": True}})

            return True

        except Exception as e:
            logger.warning(f"Google Sheets setup failed: {e}. Continuing without sync.")
            self._enabled = False
            return False

    def update_dashboard(self, state: MarketState):
        """Append a row to the Dashboard sheet with current KPIs."""
        if not self._enabled or not self._spreadsheet:
            return

        try:
            dash = self._spreadsheet.worksheet("Dashboard")
            kpis = state.get_all_kpis()
            row = [
                kpis.get("day", state.day),
                state.phase,
                round(state.revenue, 2),
                round(state.total_revenue, 2),
                kpis.get("website_traffic", 0),
                round(state.conversion_rate * 100, 2),
                round(state.brand_awareness, 1),
                round(state.budget_remaining, 2),
                round(kpis.get("pipeline_value", 0), 2),
                kpis.get("features_shipped", 0),
                kpis.get("content_published", 0),
                kpis.get("active_campaigns", 0),
            ]
            dash.append_row(row, value_input_option="USER_ENTERED")
        except Exception as e:
            logger.warning(f"Dashboard update failed: {e}")

    def update_customers(self, state: MarketState):
        """Rewrite the Customers sheet with current pipeline state."""
        if not self._enabled or not self._spreadsheet:
            return

        try:
            cust = self._spreadsheet.worksheet("Customers")

            # Keep headers, rewrite data
            rows = []
            for c in state.customers:
                rows.append([
                    c.id,
                    c.name,
                    c.company_size,
                    c.industry,
                    c.budget,
                    c.pain_point,
                    c.source,
                    c.stage,
                    c.created_day,
                    state.day - c.last_contacted_day,
                    "; ".join(c.objections) if c.objections else "",
                ])

            # Clear data rows (keep header)
            if cust.row_count > 1:
                cust.batch_clear(["A2:K1000"])

            if rows:
                cust.update(f"A2:K{len(rows) + 1}", rows, value_input_option="USER_ENTERED")

        except Exception as e:
            logger.warning(f"Customers update failed: {e}")

    def create_invoice(self, customer: Customer, state: MarketState) -> str | None:
        """
        Create a new invoice sheet when a deal is closed.
        Returns the sheet name or None if sync is disabled.
        """
        if not self._enabled or not self._spreadsheet:
            return None

        try:
            invoice_num = f"INV-{state.day:03d}-{customer.id[:4].upper()}"
            sheet_name = f"Invoice-{invoice_num}"

            sheet = self._ensure_sheet(sheet_name)
            sheet.clear()

            now = datetime.now().strftime("%Y-%m-%d %H:%M")
            monthly_value = customer.budget / 12

            invoice_data = [
                ["INVOICE", "", invoice_num],
                [""],
                ["Date:", now],
                ["Simulation Day:", state.day],
                [""],
                ["BILL TO:"],
                ["Company:", customer.name],
                ["Size:", customer.company_size],
                ["Industry:", customer.industry],
                [""],
                ["CONTRACT DETAILS:"],
                ["Annual Contract Value:", f"${customer.budget:,.2f}"],
                ["Monthly Value:", f"${monthly_value:,.2f}"],
                [""],
                ["SOLUTION DETAILS:"],
                ["Pain Point Addressed:", customer.pain_point],
                ["Source:", customer.source],
                ["Content Touchpoints:", "; ".join(customer.content_touchpoints) if customer.content_touchpoints else "None"],
                [""],
                ["FEATURES INCLUDED:"],
            ]

            # Add shipped features
            for f in state.shipped_features():
                invoice_data.append(["  -", f.name, f.description])

            invoice_data.extend([
                [""],
                ["STATUS:", "CLOSED WON"],
                ["Signed Day:", state.day],
                [""],
                ["---"],
                ["Generated by Office OS Simulation"],
            ])

            sheet.update(f"A1:C{len(invoice_data)}", invoice_data, value_input_option="USER_ENTERED")

            # Format header
            sheet.format("A1", {"textFormat": {"bold": True, "fontSize": 14}})
            sheet.format("C1", {"textFormat": {"bold": True, "fontSize": 14}})
            sheet.format("A6", {"textFormat": {"bold": True}})
            sheet.format("A11", {"textFormat": {"bold": True}})
            sheet.format("A20", {"textFormat": {"bold": True}})
            sheet.format("A23:B23", {"textFormat": {"bold": True, "foregroundColorStyle": {"rgbColor": {"green": 0.6}}}})

            logger.info(f"Created invoice sheet: {sheet_name}")
            return sheet_name

        except Exception as e:
            logger.warning(f"Invoice creation failed: {e}")
            return None

    def log_agent_action(self, agent_id: str, action_type: str, detail: str, state: MarketState):
        """Append an action to the Dashboard as a log line (optional, lightweight)."""
        if not self._enabled or not self._spreadsheet:
            return
        # This is handled by update_dashboard; kept as a hook for future use.

    def _ensure_sheet(self, title: str):
        """Get or create a worksheet by title."""
        try:
            return self._spreadsheet.worksheet(title)
        except Exception:
            return self._spreadsheet.add_worksheet(title=title, rows=1000, cols=20)
