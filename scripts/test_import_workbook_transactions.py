import importlib.util
import sqlite3
import unittest
from pathlib import Path

from openpyxl import Workbook

SCRIPT = Path(__file__).with_name("import-workbook-transactions.py")
SPEC = importlib.util.spec_from_file_location("workbook_import", SCRIPT)
IMPORTER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(IMPORTER)


def make_database():
    database = sqlite3.connect(":memory:")
    database.executescript(
        """
        CREATE TABLE households (id TEXT PRIMARY KEY, created_at TEXT, deleted_at TEXT);
        CREATE TABLE budget_lines (
          id TEXT PRIMARY KEY, household_id TEXT, name TEXT, archived INTEGER, deleted_at TEXT
        );
        CREATE TABLE transactions (
          id TEXT PRIMARY KEY, household_id TEXT, occurred_at TEXT, amount INTEGER,
          direction TEXT, line_id TEXT, debt_id TEXT, note TEXT, source TEXT, raw_text TEXT,
          status TEXT, override_reason TEXT, device_id TEXT, created_at TEXT, updated_at TEXT,
          deleted_at TEXT
        );
        CREATE TABLE outbox (
          id TEXT PRIMARY KEY, household_id TEXT, table_name TEXT, row_id TEXT, op TEXT,
          device_id TEXT, created_at TEXT, updated_at TEXT, deleted_at TEXT
        );
        INSERT INTO households VALUES ('household-1', '2026-01-01', NULL);
        INSERT INTO budget_lines VALUES ('line-fuel', 'household-1', 'Fuel', 0, NULL);
        """
    )
    return database


class WorkbookImportTests(unittest.TestCase):
    def test_import_skips_incomplete_rows_is_idempotent_and_appends_outbox(self):
        workbook = Workbook()
        sheet = workbook.active
        sheet.title = "Transactions"
        sheet.append(["Date", "Category", "Amount (XAF)", "Description"])
        sheet.append(["2026-09-05", "Fuel", 20000, "fuel purchase"])
        sheet.append(["2026-09-06", None, 3000, "no category"])
        sheet.append(["2026-09-07", "Fuel", None, "no amount"])
        database = make_database()
        rows = list(sheet.iter_rows(values_only=True))

        with database:
            result = IMPORTER.import_rows(database, rows)
        self.assertEqual(result, (1, 2, 0))
        transaction = database.execute(
            "SELECT occurred_at, amount, direction, line_id, note, source, status "
            "FROM transactions"
        ).fetchone()
        self.assertEqual(
            transaction,
            ("2026-09-05T11:00:00.000Z", 20000, "expense", "line-fuel", "fuel purchase", "manual", "confirmed"),
        )
        self.assertEqual(
            database.execute("SELECT table_name, row_id, op FROM outbox").fetchone(),
            ("transactions", database.execute("SELECT id FROM transactions").fetchone()[0], "create"),
        )

        with database:
            result = IMPORTER.import_rows(database, rows)
        self.assertEqual(result, (0, 2, 1))
        self.assertEqual(database.execute("SELECT COUNT(*) FROM transactions").fetchone()[0], 1)

    def test_unknown_budget_line_rolls_back_transaction_and_outbox(self):
        rows = [
            ["Date", "Category", "Amount"],
            ["2026-09-05", "Unknown", 20000],
        ]
        database = make_database()
        with self.assertRaisesRegex(ValueError, "does not exist"):
            with database:
                IMPORTER.import_rows(database, rows)
        self.assertEqual(database.execute("SELECT COUNT(*) FROM transactions").fetchone()[0], 0)
        self.assertEqual(database.execute("SELECT COUNT(*) FROM outbox").fetchone()[0], 0)

    def test_requires_date_category_and_amount_headers(self):
        with self.assertRaisesRegex(ValueError, "Date, Category, and Amount"):
            IMPORTER.find_header([["Date", "Amount"], ["2026-09-05", 1000]])


if __name__ == "__main__":
    unittest.main()
