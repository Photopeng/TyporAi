import { DefaultExecutionPolicy, type ExecutionPolicy, type ProcessSession, type ProcessTransportFactory } from '../../../core/ports';
import { findNodeExecutable } from '../../../utils/env';

export type StoredRow = Record<string, unknown>;

export interface StoredSessionRows {
  messageRows: StoredRow[];
  partRows: StoredRow[];
}

interface SqliteModule {
  DatabaseSync: new (location: string, options?: Record<string, unknown>) => {
    close(): void;
    prepare(sql: string): {
      all(...params: unknown[]): StoredRow[];
    };
  };
}

export interface OpencodeSqliteReaderDependencies {
  executionPolicy?: ExecutionPolicy;
  findNodeExecutable?: () => string | null;
  processTransport?: ProcessTransportFactory;
  requireSqliteModule?: () => SqliteModule | null;
}

export const OPENCODE_SQLITE_QUERY_MAX_BUFFER = 100 * 1024 * 1024;
export const OPENCODE_SQLITE_QUERY_TIMEOUT_MS = 30_000;
export const OPENCODE_MESSAGE_ROW_SQL = buildOpencodeMessageRowsSql('?');

const OPENCODE_PART_ROW_SQL = buildOpencodePartRowsSql('?');
const OPENCODE_SQLITE_CHILD_SCRIPT = `
const { DatabaseSync } = require('node:sqlite');
const [databasePath, sessionId, messageSql, partSql] = process.argv.slice(1);
let db;
try {
  db = new DatabaseSync(databasePath, { readonly: true });
  const messageRows = db.prepare(messageSql).all(sessionId);
  const partRows = db.prepare(partSql).all(sessionId);
  process.stdout.write(JSON.stringify({ messageRows, partRows }));
} finally {
  if (db) db.close();
}
`.trim();

export async function loadOpencodeSessionRows(
  databasePath: string,
  sessionId: string,
  dependencies: OpencodeSqliteReaderDependencies = {},
): Promise<StoredSessionRows | null> {
  const resolvedDependencies = resolveDependencies(dependencies);

  const viaCurrentProcess = loadSessionRowsWithCurrentProcessSqlite(
    databasePath,
    sessionId,
    resolvedDependencies.requireSqliteModule,
  );
  if (viaCurrentProcess) {
    return viaCurrentProcess;
  }

  if (resolvedDependencies.processTransport) {
    return loadSessionRowsWithTransport(
      databasePath,
      sessionId,
      resolvedDependencies.findNodeExecutable,
      resolvedDependencies.processTransport,
    );
  }

  return null;
}

function resolveDependencies(
  dependencies: OpencodeSqliteReaderDependencies,
): Omit<Required<OpencodeSqliteReaderDependencies>, 'processTransport'> & {
  processTransport?: ProcessTransportFactory;
} {
  return {
    findNodeExecutable,
    executionPolicy: new DefaultExecutionPolicy(),
    requireSqliteModule,
    ...dependencies,
  };
}

async function loadSessionRowsWithTransport(
  databasePath: string,
  sessionId: string,
  findNode: () => string | null,
  processTransport: ProcessTransportFactory,
): Promise<StoredSessionRows | null> {
  const nodePath = findNode();
  if (!nodePath) return null;
  const output = await runTransportProcess(processTransport, nodePath, [
    '-e',
    OPENCODE_SQLITE_CHILD_SCRIPT,
    databasePath,
    sessionId,
    OPENCODE_MESSAGE_ROW_SQL,
    OPENCODE_PART_ROW_SQL,
  ]);
  return output === null ? null : parseStoredSessionRows(output);
}

async function runTransportProcess(
  processTransport: ProcessTransportFactory,
  executable: string,
  args: string[],
): Promise<string | null> {
  let session: ProcessSession | null = null;
  try {
    session = await processTransport.start({
      executable,
      args,
      cwd: '.',
      stdioMode: 'pipe',
    });
    let output = '';
    let exceeded = false;
    const removeStdout = session.onStdout(chunk => {
      if (output.length + chunk.length > OPENCODE_SQLITE_QUERY_MAX_BUFFER) {
        exceeded = true;
        return;
      }
      output += chunk;
    });
    let removeExit: () => void = () => undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const outcome = await new Promise<{ exit?: { code: number | null }; timeout?: true }>(resolve => {
      removeExit = session!.onExit(value => {
        resolve({ exit: value });
      });
      timeout = setTimeout(() => resolve({ timeout: true }), OPENCODE_SQLITE_QUERY_TIMEOUT_MS);
    });
    if (timeout !== undefined) clearTimeout(timeout);
    removeExit();
    removeStdout();
    if (outcome.timeout || exceeded) {
      await session.terminate({ gracePeriodMs: 0, reason: outcome.timeout ? 'timeout' : 'forced' });
      return null;
    }
    return outcome.exit?.code === 0 ? output : null;
  } catch {
    return null;
  } finally {
    await session?.dispose();
  }
}

function requireSqliteModule(): SqliteModule | null {
  try {
    if (typeof module === 'undefined' || typeof module.require !== 'function') {
      return null;
    }

    const sqlite = module.require('node:sqlite') as unknown;
    return isSqliteModule(sqlite) ? sqlite : null;
  } catch {
    return null;
  }
}

function isSqliteModule(value: unknown): value is SqliteModule {
  return (
    isPlainObject(value)
    && typeof value.DatabaseSync === 'function'
  );
}

function loadSessionRowsWithCurrentProcessSqlite(
  databasePath: string,
  sessionId: string,
  requireSqlite: () => SqliteModule | null,
): StoredSessionRows | null {
  const sqlite = requireSqlite();
  if (!sqlite) {
    return null;
  }

  let db: InstanceType<SqliteModule['DatabaseSync']> | null = null;
  try {
    db = new sqlite.DatabaseSync(databasePath, { readonly: true });
    const messageRows = db.prepare(OPENCODE_MESSAGE_ROW_SQL).all(sessionId);
    const partRows = db.prepare(OPENCODE_PART_ROW_SQL).all(sessionId);
    return { messageRows, partRows };
  } catch {
    return null;
  } finally {
    db?.close();
  }
}

function parseStoredSessionRows(value: string): StoredSessionRows | null {
  try {
    const parsed = JSON.parse(value || '{}') as unknown;
    if (!isPlainObject(parsed)) {
      return null;
    }

    const messageRows = parseStoredRowsValue(parsed.messageRows);
    const partRows = parseStoredRowsValue(parsed.partRows);
    return messageRows && partRows ? { messageRows, partRows } : null;
  } catch {
    return null;
  }
}

function parseStoredRowsValue(value: unknown): StoredRow[] | null {
  return Array.isArray(value)
    ? value.filter((row): row is StoredRow => isPlainObject(row))
    : null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function buildOpencodeMessageRowsSql(sessionIdExpression: string): string {
  return `
with message_json as (
  select
    id,
    time_created,
    data,
    json_valid(data) as data_valid
  from message
  where session_id = ${sessionIdExpression}
)
select
  id,
  time_created,
  data_valid,
  case when data_valid then json_extract(data, '$.role') end as role,
  case when data_valid then json_extract(data, '$.time.created') end as data_time_created,
  case when data_valid then json_extract(data, '$.time.completed') end as data_time_completed
from message_json
order by time_created asc, id asc;`.trim();
}

function buildOpencodePartRowsSql(sessionIdExpression: string): string {
  return `
select id, message_id, data
from part
where session_id = ${sessionIdExpression}
order by message_id asc, id asc;`.trim();
}
