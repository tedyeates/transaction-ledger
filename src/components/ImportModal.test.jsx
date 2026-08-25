/**
 * Unit tests for ImportModal — import flow (no chunking, format registry)
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ImportModal } from './ImportModal'

// Mock supabase
const mockRpc = vi.fn()
vi.mock('../lib/supabase', () => ({
  supabase: { rpc: (...args) => mockRpc(...args) },
}))

// Mock parseBankCSV
const mockRows = [
  { tx_datetime: '2024-01-01T10:00:00', description: 'Test 1', withdraw: 100, deposit: null, balance: 9900, channel: 'ATM', counterparty_name: null },
  { tx_datetime: '2024-01-02T10:00:00', description: 'Test 2', withdraw: null, deposit: 200, balance: 10100, channel: 'APP', counterparty_name: 'Someone' },
  { tx_datetime: '2024-01-03T10:00:00', description: 'Test 3', withdraw: 50, deposit: null, balance: 10050, channel: 'ATM', counterparty_name: null },
]
const mockParseBankCSV = vi.fn(() => ({ format: 'english_v2_12h', exportedAt: '2026-08-21T10:49:45', rows: mockRows }))
vi.mock('../lib/csv', () => ({
  parseBankCSV: (...args) => mockParseBankCSV(...args),
  SOURCE_FORMATS: [
    { id: 'english_v2_12h', label: 'New 12hr' },
    { id: 'english_v2', label: 'New 24hr' },
    { id: 'thai_legacy', label: 'Legacy' },
  ],
  DEFAULT_STATEMENT_FORMAT: 'english_v2_12h',
}))

// Track toast calls
const mockAddToast = vi.fn()
vi.mock('../hooks/useToast', () => ({
  useToast: () => mockAddToast,
}))

// Mock constants
vi.mock('../lib/constants', () => ({
  PREVIEW_COLS: ['tx_datetime', 'description', 'withdraw', 'deposit', 'balance', 'counterparty_name'],
}))

// Mock FileReader so onload fires synchronously
class MockFileReader {
  readAsArrayBuffer() {
    if (this.onload) {
      this.onload({ target: { result: new ArrayBuffer(8) } })
    }
  }
}

describe('ImportModal import flow', () => {
  let onClose, onImported

  beforeEach(() => {
    vi.clearAllMocks()
    mockParseBankCSV.mockImplementation(() => ({ format: 'english_v2_12h', exportedAt: '2026-08-21T10:49:45', rows: mockRows }))
    onClose = vi.fn()
    onImported = vi.fn()
    // Replace global FileReader
    vi.stubGlobal('FileReader', MockFileReader)
  })

  function renderAndLoadCSV() {
    render(<ImportModal onClose={onClose} onImported={onImported} />)
    const input = document.querySelector('input[type="file"]')
    const file = new File(['dummy'], 'test.csv', { type: 'text/csv' })
    fireEvent.change(input, { target: { files: [file] } })
  }

  it('sends all rows in a single RPC call (no chunking)', async () => {
    mockRpc.mockResolvedValue({ data: { inserted: 3, skipped: 0 }, error: null })
    renderAndLoadCSV()

    fireEvent.click(screen.getByText('นำเข้ารายการ'))

    await waitFor(() => {
      expect(mockRpc).toHaveBeenCalledTimes(1)
    })
    expect(mockRpc).toHaveBeenCalledWith('import_transactions', { rows: expect.any(Array) })
    expect(mockRpc.mock.calls[0][1].rows).toHaveLength(3)
  })

  it('shows success toast with inserted and skipped counts', async () => {
    mockRpc.mockResolvedValue({ data: { inserted: 2, skipped: 1 }, error: null })
    renderAndLoadCSV()

    fireEvent.click(screen.getByText('นำเข้ารายการ'))

    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith(
        'นำเข้า 2 รายการใหม่ (1 รายการซ้ำ — ข้าม)',
        'success'
      )
    })
  })

  it('shows warning toast when all rows skipped (inserted === 0)', async () => {
    mockRpc.mockResolvedValue({ data: { inserted: 0, skipped: 3 }, error: null })
    renderAndLoadCSV()

    fireEvent.click(screen.getByText('นำเข้ารายการ'))

    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith(
        'ไม่พบรายการใหม่ — ทุกรายการมีอยู่ในระบบแล้ว',
        'warning'
      )
    })
  })

  it('calls onImported and onClose on success', async () => {
    mockRpc.mockResolvedValue({ data: { inserted: 3, skipped: 0 }, error: null })
    renderAndLoadCSV()

    fireEvent.click(screen.getByText('นำเข้ารายการ'))

    await waitFor(() => {
      expect(onImported).toHaveBeenCalled()
      expect(onClose).toHaveBeenCalled()
    })
  })

  it('shows error on RPC failure and does not call onImported', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'DB connection failed' } })
    renderAndLoadCSV()

    fireEvent.click(screen.getByText('นำเข้ารายการ'))

    await waitFor(() => {
      const alert = screen.getByRole('alert')
      expect(alert.textContent).toContain('DB connection failed')
    })
    expect(onImported).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('does not chunk — single call regardless of row count', async () => {
    mockRpc.mockResolvedValue({ data: { inserted: 3, skipped: 0 }, error: null })
    renderAndLoadCSV()

    fireEvent.click(screen.getByText('นำเข้ารายการ'))

    await waitFor(() => {
      expect(mockRpc).toHaveBeenCalledTimes(1)
    })
    // All rows sent in one call
    expect(mockRpc.mock.calls[0][1].rows).toEqual(mockRows)
  })

  it('renders a format select box defaulting to english_v2_12h', () => {
    render(<ImportModal onClose={onClose} onImported={onImported} />)
    const select = screen.getByLabelText('รูปแบบไฟล์')
    expect(select.value).toBe('english_v2_12h')
  })

  it('lists all three formats with no auto-detect option', () => {
    render(<ImportModal onClose={onClose} onImported={onImported} />)
    const select = screen.getByLabelText('รูปแบบไฟล์')
    const optionValues = Array.from(select.options).map(o => o.value)
    expect(optionValues).toEqual(['english_v2_12h', 'english_v2', 'thai_legacy'])
  })

  it('passes the selected format through to the parser', async () => {
    renderAndLoadCSV()
    await waitFor(() => {
      expect(mockParseBankCSV).toHaveBeenCalledWith(expect.anything(), { format: 'english_v2_12h' })
    })
  })

  it('re-parses the loaded file when the format selection changes', async () => {
    renderAndLoadCSV()
    await waitFor(() => expect(mockParseBankCSV).toHaveBeenCalledTimes(1))

    const select = screen.getByLabelText('รูปแบบไฟล์')
    fireEvent.change(select, { target: { value: 'thai_legacy' } })

    await waitFor(() => {
      expect(mockParseBankCSV).toHaveBeenCalledTimes(2)
      expect(mockParseBankCSV).toHaveBeenLastCalledWith(expect.anything(), { format: 'thai_legacy' })
    })
  })

  it('shows the format used and includes counterparty in the preview', async () => {
    renderAndLoadCSV()
    await waitFor(() => {
      const previewInfo = document.querySelector('.preview-info')
      expect(previewInfo).not.toBeNull()
      expect(previewInfo.textContent).toContain('New 12hr')
    })
    const cells = screen.getAllByRole('cell')
    expect(cells.map(c => c.textContent)).toContain('Someone')
  })

  it('surfaces a format mismatch throw through role="alert"', async () => {
    mockParseBankCSV.mockImplementation(() => {
      throw new Error('ไฟล์นี้ดูเหมือนรูปแบบ "New 24hr" แต่เลือกไว้เป็น "Legacy"')
    })
    renderAndLoadCSV()

    await waitFor(() => {
      const alert = screen.getByRole('alert')
      expect(alert.textContent).toContain('New 24hr')
    })
  })
})
