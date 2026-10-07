import { useSyncExternalStore } from 'react'
import { db, SETTINGS_ID, SYNC_TABLES, type OutboxItem, type SyncTable } from './db'
import { MEASURE_KEYS } from '../lib/types'
import { supabase } from './supabase'

const NUMERIC_FIELDS: string[] = [
  'body_weight_kg',
  'ez_bar_kg',
  'smith_bar_kg',
  'height_cm',
  'weight_step',
  'backoff_ratio',
  'weight_kg',
  ...MEASURE_KEYS,
]
const PAGE = 1000

type Status = { pending: number; syncing: boolean; error: boolean }
let status: Status = { pending: 0, syncing: false, error: false }
const listeners = new Set<() => void>()

function setStatus(patch: Partial<Status>) {
  status = { ...status, ...patch }
  listeners.forEach((l) => l())
}

export function useSyncStatus(): Status {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => status,
  )
}

async function refreshPending() {
  setStatus({ pending: await db.outbox.count() })
}

let timer: ReturnType<typeof setTimeout> | undefined
let running: Promise<void> | null = null
let again = false

/** 書き込みのたびに呼ぶ。少し待ってまとめて送る */
export function scheduleSync(delay = 800) {
  void refreshPending()
  clearTimeout(timer)
  timer = setTimeout(() => void syncNow(), delay)
}

export async function syncNow(): Promise<void> {
  if (!supabase || !navigator.onLine) return refreshPending()
  if (running) {
    again = true
    return running
  }
  running = (async () => {
    setStatus({ syncing: true })
    try {
      const { data } = await supabase.auth.getSession()
      const uid = data.session?.user.id
      if (!uid) return
      await push(uid)
      await pull()
      setStatus({ error: false })
    } catch (e) {
      console.warn('sync failed', e)
      setStatus({ error: true })
    } finally {
      running = null
      setStatus({ syncing: false })
      await refreshPending()
      if (again) {
        again = false
        void syncNow()
      }
    }
  })()
  return running
}

function toRemote(table: SyncTable, row: Record<string, unknown>, uid: string) {
  const { updated_at: _u, ...rest } = row
  // upsert は欠けた列を NULL にするため明示する
  rest.deleted = !!rest.deleted
  if (table === 'settings') rest.id = uid
  return rest
}

function fromRemote(table: SyncTable, row: Record<string, unknown>) {
  const { user_id: _u, ...rest } = row
  for (const f of NUMERIC_FIELDS) if (typeof rest[f] === 'string') rest[f] = Number(rest[f])
  if (table === 'settings') rest.id = SETTINGS_ID
  return rest
}

/** 送信待ちを古い順に、同じテーブルが連続する単位でまとめて upsert */
async function push(uid: string) {
  const items = await db.outbox.orderBy('seq').toArray()
  let i = 0
  while (i < items.length) {
    const table = items[i].table
    const group: OutboxItem[] = []
    while (i < items.length && items[i].table === table) group.push(items[i++])
    const ids = [...new Set(group.map((g) => g.rowId))]
    const rows = (await db.table(table).bulkGet(ids)).filter(Boolean)
    if (rows.length) {
      const { error } = await supabase!
        .from(table)
        .upsert(rows.map((r) => toRemote(table, r, uid)))
      if (error) throw error
    }
    await db.outbox.bulkDelete(group.map((g) => g.seq!))
  }
}

async function pull() {
  const pendingIds = new Set((await db.outbox.toArray()).map((o) => o.rowId))
  for (const table of SYNC_TABLES) {
    const metaKey = `pulled:${table}`
    let cursor = (await db.meta.get(metaKey))?.value ?? '1970-01-01T00:00:00Z'
    for (;;) {
      const { data, error } = await supabase!
        .from(table)
        .select('*')
        .gt('updated_at', cursor)
        .order('updated_at')
        .limit(PAGE)
      if (error) throw error
      if (!data.length) break
      const rows = data
        .map((r) => fromRemote(table, r))
        .filter((r) => !pendingIds.has(r.id as string))
      await db.table(table).bulkPut(rows)
      cursor = data[data.length - 1].updated_at
      await db.meta.put({ key: metaKey, value: cursor })
      if (data.length < PAGE) break
    }
  }
}

export function startSync() {
  void syncNow()
  window.addEventListener('online', () => void syncNow())
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void syncNow()
  })
  setInterval(() => void syncNow(), 60_000)
}
