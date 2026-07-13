# Interfaces & APIs

## Supabase RPC Functions

All data access uses `supabase.rpc()`. No direct table queries from client.

### `get_transactions_v2`

Paginated, filtered transaction query with built-in RLS.

**Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `p_type` | text | Filter by transaction type (`withdrawal` / `income`) |
| `p_channel` | text | Exact channel match |
| `p_date_from` | text | ISO date string, cast to timestamptz |
| `p_date_to` | text | ISO date string (appended T23:59:59 by client) |
| `p_search` | text | ILIKE across description, memo, cheque_number, channel |
| `p_desc` | text | Column filter: description ILIKE |
| `p_cheque` | text | Column filter: cheque_number ILIKE |
| `p_memo` | text | Column filter: memo ILIKE |
| `p_remark` | text | Column filter: remark ILIKE |
| `p_col_channel` | text | Column filter: channel ILIKE |
| `p_withdraw` | numeric | Exact match on withdraw amount |
| `p_deposit` | numeric | Exact match on deposit amount |
| `p_balance` | numeric | Exact match on balance |

**Returns:** `SETOF transactions` (supports `.range()` and `.order()` via PostgREST)

**RLS:** Function body includes `EXISTS(SELECT 1 FROM user_roles ...)` to restrict rows by role.

---

### `get_transaction_stats_v2`

Same filter params as `get_transactions_v2`. Returns single row:

| Column | Type | Description |
|--------|------|-------------|
| `total_count` | bigint | Matching row count |
| `total_withdraws` | numeric | Sum of withdraw column |
| `total_deposits` | numeric | Sum of deposit column |

---

### `get_latest_balance`

**Params:** None  
**Returns:** numeric (latest balance by tx_datetime DESC)  
**Access:** Admin only (raises exception for non-admin)

---

### `import_transactions`

**Params:** `rows` (jsonb) — JSON array of transaction objects  
**Returns:** `{inserted: bigint, skipped: bigint}`  
**Behavior:** Extracts distinct timestamps from input, checks which already exist in DB, inserts only rows with new timestamps. No unique constraint — dedup is logic-based.  
**Access:** Admin only (raises exception for non-admin)  
**Called:** From ImportModal — single call, no chunking

---

### `update_memo`

**Params:** `tx_id` (bigint), `new_memo` (text)  
**Access:** Authenticated users with withdrawal/income role

---

### `update_remark`

**Params:** `tx_id` (bigint), `new_remark` (text)  
**Access:** Admin only

---

### `toggle_highlight`

**Params:** `tx_ids` (bigint[]), `highlighted` (boolean)  
**Access:** Admin only (raises exception for non-admin)

---

## Hook Interface: `useTransactions(role)`

Primary data hook. Returns:

```javascript
{
  // State
  isLoading,          // boolean — initial load
  isFetchingMore,     // boolean — pagination in progress
  hasMore,            // boolean — more pages available
  filters,            // object — current filter state
  sort,               // { col, dir } — current sort
  transactions,       // array — loaded rows
  totalCount,         // number — total matching rows
  stats,              // { total, withdraws, deposits, balance }

  // Actions
  loadMore,                   // () => void — fetch next page
  resetAndLoad,               // (filters?, sort?) => void — reset to page 1
  handleSort,                 // (col) => void — toggle sort
  handleFilterChange,         // (delta) => void — merge filter delta
  updateRayganLocally,        // (id, value) => void — optimistic memo update
  updateRemarkLocally,        // (id, value) => void — optimistic remark update
  updateHighlightLocally,     // (ids, value) => void — optimistic highlight update
  toggleHighlight,            // (ids, highlighted) => void — persist + optimistic
  exportAllTransactions,      // () => void — fetch all matching + trigger CSV download
}
```

## Toast Interface: `useToast()`

```javascript
const addToast = useToast()
addToast(message, variant)  // variant: 'default' | 'success' | 'error'
```

Auto-dismisses after 4.2 seconds.
