export const households = {
  name: 'households',
  columns: {
    id: 'TEXT PRIMARY KEY',
    household_id: 'TEXT NOT NULL',
    name: 'TEXT NOT NULL',
    month_start_day: 'INTEGER NOT NULL DEFAULT 1',
    currency: 'TEXT NOT NULL DEFAULT "XAF"',
    device_id: 'TEXT NULL',
    created_at: 'TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP',
    updated_at: 'TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP',
    deleted_at: 'TEXT NULL',
  },
};

export const budgetLines = {
  name: 'budget_lines',
  columns: {
    id: 'TEXT PRIMARY KEY',
    household_id: 'TEXT NOT NULL',
    name: 'TEXT NOT NULL',
    kind: 'TEXT NOT NULL',
    hard_cap: 'INTEGER NOT NULL DEFAULT 0',
    sort_order: 'INTEGER NOT NULL DEFAULT 0',
    archived: 'INTEGER NOT NULL DEFAULT 0',
    device_id: 'TEXT NULL',
    created_at: 'TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP',
    updated_at: 'TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP',
    deleted_at: 'TEXT NULL',
  },
};

export const allocations = {
  name: 'allocations',
  columns: {
    id: 'TEXT PRIMARY KEY',
    household_id: 'TEXT NOT NULL',
    line_id: 'TEXT NOT NULL',
    month: 'TEXT NOT NULL',
    planned_amount: 'INTEGER NOT NULL',
    device_id: 'TEXT NULL',
    created_at: 'TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP',
    updated_at: 'TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP',
    deleted_at: 'TEXT NULL',
  },
};

export const transactions = {
  name: 'transactions',
  columns: {
    id: 'TEXT PRIMARY KEY',
    household_id: 'TEXT NOT NULL',
    occurred_at: 'TEXT NOT NULL',
    amount: 'INTEGER NOT NULL',
    direction: 'TEXT NOT NULL',
    line_id: 'TEXT NULL',
    debt_id: 'TEXT NULL',
    note: 'TEXT NULL',
    source: 'TEXT NOT NULL DEFAULT "manual"',
    raw_text: 'TEXT NULL',
    status: 'TEXT NOT NULL DEFAULT "confirmed"',
    override_reason: 'TEXT NULL',
    device_id: 'TEXT NULL',
    created_at: 'TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP',
    updated_at: 'TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP',
    deleted_at: 'TEXT NULL',
  },
};

export const debts = {
  name: 'debts',
  columns: {
    id: 'TEXT PRIMARY KEY',
    household_id: 'TEXT NOT NULL',
    creditor: 'TEXT NOT NULL',
    original_amount: 'INTEGER NOT NULL',
    deadline: 'TEXT NULL',
    note: 'TEXT NULL',
    device_id: 'TEXT NULL',
    created_at: 'TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP',
    updated_at: 'TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP',
    deleted_at: 'TEXT NULL',
  },
};

export const savingsGoals = {
  name: 'savings_goals',
  columns: {
    id: 'TEXT PRIMARY KEY',
    household_id: 'TEXT NOT NULL',
    name: 'TEXT NOT NULL',
    target_amount: 'INTEGER NOT NULL',
    due_date: 'TEXT NOT NULL',
    include_kids_savings: 'INTEGER NOT NULL DEFAULT 0',
    device_id: 'TEXT NULL',
    created_at: 'TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP',
    updated_at: 'TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP',
    deleted_at: 'TEXT NULL',
  },
};

export const savingsCommitments = {
  name: 'savings_commitments',
  columns: {
    id: 'TEXT PRIMARY KEY',
    household_id: 'TEXT NOT NULL',
    goal_id: 'TEXT NOT NULL',
    line_id: 'TEXT NOT NULL',
    month: 'TEXT NOT NULL',
    planned_amount: 'INTEGER NOT NULL',
    saved_amount: 'INTEGER NULL',
    saved_at: 'TEXT NULL',
    device_id: 'TEXT NULL',
    created_at: 'TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP',
    updated_at: 'TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP',
    deleted_at: 'TEXT NULL',
  },
};

export const settings = {
  name: 'settings',
  columns: {
    id: 'TEXT PRIMARY KEY',
    household_id: 'TEXT NOT NULL',
    key: 'TEXT NOT NULL',
    value: 'TEXT NOT NULL',
    device_id: 'TEXT NULL',
    created_at: 'TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP',
    updated_at: 'TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP',
    deleted_at: 'TEXT NULL',
  },
};

export const syncState = {
  name: 'sync_state',
  columns: {
    table_name: 'TEXT PRIMARY KEY',
    household_id: 'TEXT NOT NULL',
    last_pull_at: 'TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP',
    device_id: 'TEXT NULL',
    created_at: 'TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP',
    updated_at: 'TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP',
    deleted_at: 'TEXT NULL',
  },
};

export const outbox = {
  name: 'outbox',
  columns: {
    id: 'TEXT PRIMARY KEY',
    household_id: 'TEXT NOT NULL',
    table_name: 'TEXT NOT NULL',
    row_id: 'TEXT NOT NULL',
    op: 'TEXT NOT NULL',
    device_id: 'TEXT NULL',
    created_at: 'TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP',
    updated_at: 'TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP',
    deleted_at: 'TEXT NULL',
  },
};

// Money lent to others (PRD §7.8b). Balance and status are derived from loan_payments.
export const loans = {
  name: 'loans',
  columns: {
    id: 'TEXT PRIMARY KEY',
    household_id: 'TEXT NOT NULL',
    person_name: 'TEXT NOT NULL',
    person_phone: 'TEXT NULL',
    contact_id: 'TEXT NULL',
    lent_on: 'TEXT NOT NULL',
    amount: 'INTEGER NOT NULL',
    plan: 'TEXT NOT NULL DEFAULT "flexible"',
    deadline: 'TEXT NULL',
    note: 'TEXT NULL',
    written_off_at: 'TEXT NULL',
    device_id: 'TEXT NULL',
    created_at: 'TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP',
    updated_at: 'TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP',
    deleted_at: 'TEXT NULL',
  },
};

export const loanInstallments = {
  name: 'loan_installments',
  columns: {
    id: 'TEXT PRIMARY KEY',
    household_id: 'TEXT NOT NULL',
    loan_id: 'TEXT NOT NULL',
    due_on: 'TEXT NOT NULL',
    amount: 'INTEGER NOT NULL',
    device_id: 'TEXT NULL',
    created_at: 'TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP',
    updated_at: 'TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP',
    deleted_at: 'TEXT NULL',
  },
};

export const loanPayments = {
  name: 'loan_payments',
  columns: {
    id: 'TEXT PRIMARY KEY',
    household_id: 'TEXT NOT NULL',
    loan_id: 'TEXT NOT NULL',
    paid_at: 'TEXT NOT NULL',
    amount: 'INTEGER NOT NULL',
    note: 'TEXT NULL',
    device_id: 'TEXT NULL',
    created_at: 'TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP',
    updated_at: 'TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP',
    deleted_at: 'TEXT NULL',
  },
};

const definitions = [
  households,
  budgetLines,
  allocations,
  transactions,
  debts,
  savingsGoals,
  savingsCommitments,
  settings,
  syncState,
  outbox,
  loans,
  loanInstallments,
  loanPayments,
] as const;

export const tableDefinitions = definitions;

export function createTableSql(definition: (typeof definitions)[number]): string {
  const columns = Object.entries(definition.columns)
    .map(([name, type]) => `  ${name} ${type}`)
    .join(',\n');

  return `CREATE TABLE IF NOT EXISTS ${definition.name} (\n${columns}\n);`;
}
