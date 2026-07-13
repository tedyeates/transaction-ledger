# Workflows

## 1. Authentication Flow

```mermaid
sequenceDiagram
    participant U as User
    participant Auth as AuthScreen
    participant SB as Supabase Auth
    participant DB as user_roles

    U->>Auth: Submit email + password
    Auth->>SB: signInWithPassword()
    alt Success
        SB-->>Auth: Session + user
        Auth->>DB: SELECT role WHERE user_id = auth.uid()
        DB-->>Auth: role
        Auth->>Auth: setUser(user), setRole(role)
        Note over Auth: Render AppShell
    else Failure
        SB-->>Auth: Error
        Auth->>U: Display error message
    end
```

Session restore on mount: `supabase.auth.getSession()` → if session exists, resolve role and render.

---

## 2. CSV Import Flow

```mermaid
sequenceDiagram
    participant U as User
    participant IM as ImportModal
    participant Parser as parseBankCSV
    participant SB as Supabase RPC

    U->>IM: Drop/select CSV file
    IM->>Parser: FileReader.readAsArrayBuffer()
    Parser->>Parser: Detect encoding (TIS-620 / UTF-8)
    Parser->>Parser: Find header row (วันที่ทำรายการ)
    Parser->>Parser: Parse rows until empty date
    Parser-->>IM: Parsed rows array

    IM->>IM: Show preview (first 6 rows)
    U->>IM: Click "นำเข้ารายการ"

    IM->>SB: rpc('import_transactions', { rows: all })
    SB->>SB: Extract distinct timestamps from rows
    SB->>SB: Check which timestamps already exist in DB
    SB->>SB: Insert only rows with new timestamps
    SB-->>IM: { inserted: N, skipped: N }

    IM->>IM: Toast success (inserted/skipped counts)
    IM->>IM: Call onImported() → resetAndLoad()
```

**Encoding detection:** Tries `windows-874` (TIS-620) first; falls back to UTF-8 if Thai header not found.  
**Dedup logic:** Server-side — timestamp-existence check. If a `tx_datetime` already exists in DB, all rows with that timestamp are skipped. First upload wins.

---

## 3. Data Loading & Pagination

```mermaid
sequenceDiagram
    participant Hook as useTransactions
    participant SB as Supabase RPC
    participant UI as TransactionTable

    Note over Hook: Initial load (page 1)
    Hook->>SB: rpc('get_transactions_v2', filters).range(0, 74)
    SB-->>Hook: rows + count
    Hook->>UI: Render rows

    Note over UI: User scrolls to bottom
    UI->>Hook: InfiniteScrollSentinel triggers loadMore()
    Hook->>SB: rpc('get_transactions_v2', filters).range(75, 149)
    SB-->>Hook: next page rows
    Hook->>Hook: Deduplicate by ID, append
    Hook->>UI: Update rendered rows
```

**Page size:** 75 rows per fetch.  
**Sort:** Default `tx_datetime DESC`, secondary sort by `id`.  
**Dedup:** Client-side Set check on `id` before appending.

---

## 4. Edit Memo (รายการ) Flow

```mermaid
sequenceDiagram
    participant U as User
    participant Row as TransactionRow
    participant Modal as EditRayganModal
    participant SB as Supabase RPC
    participant Hook as useTransactions

    U->>Row: Click memo cell
    Row->>Modal: Open with transaction data
    U->>Modal: Edit text, click Save
    Modal->>SB: rpc('update_memo', { tx_id, new_memo })
    alt Success
        SB-->>Modal: OK
        Modal->>Hook: onSaved(id, value) → updateRayganLocally
        Note over Hook: Optimistic: row updated in-place
    else Failure
        SB-->>Modal: Error
        Modal->>U: Show error message
    end
```

---

## 5. Highlight Toggle (Admin)

```mermaid
sequenceDiagram
    participant U as Admin
    participant Row as TransactionRow
    participant Hook as useTransactions
    participant SB as Supabase RPC

    U->>Row: Click ★/☆ button
    Row->>Hook: toggleHighlight([id], !current)
    Hook->>Hook: Optimistic update (updateHighlightLocally)
    Hook->>SB: rpc('toggle_highlight', { tx_ids, highlighted })
    alt Failure
        SB-->>Hook: Error
        Hook->>Hook: Revert optimistic update
        Hook->>U: Toast error
    end
```

---

## 6. CSV Export Flow

```mermaid
sequenceDiagram
    participant U as User
    participant Hook as useTransactions
    participant SB as Supabase RPC
    participant Browser as Browser Download

    U->>Hook: exportAllTransactions()
    Hook->>U: Toast "กำลังเตรียมข้อมูล…"

    loop Chunks of 1000
        Hook->>SB: rpc('get_transactions_v2', filters).range(from, to)
        SB-->>Hook: chunk
    end

    Hook->>Hook: exportToCSV(allRows)
    Note over Hook: Build CSV string with BOM (UTF-8)
    Hook->>Browser: Blob → URL → link.click()
    Hook->>U: Toast success with count
```

---

## 7. Filter & Sort Flow

Filters and sort trigger `resetAndLoad()`:
1. Clear current transactions
2. Reset to page 1
3. Fetch with new params
4. Update stats via `get_transaction_stats_v2`

Sort toggle: clicking same column flips direction (desc→asc→desc). Different column defaults to desc.

Filter types:
- **Global search:** ILIKE across description, memo, cheque_number, channel
- **Column filters:** Individual ILIKE per column (inline inputs in header)
- **Type filter:** Exact match (locked for accountant roles)
- **Date range:** `dateFrom` → `dateTo` (inclusive, appends T23:59:59)
- **Numeric filters:** Exact match on withdraw/deposit/balance amounts
