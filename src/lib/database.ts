import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * Camada de acesso a dados.
 *
 * Implementa RS-007: todo acesso ao banco usa consultas parametrizadas. Não há,
 * em nenhum ponto deste arquivo, SQL construído por concatenação ou interpolação
 * com dado de origem externa.
 */

export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  created_at: string;
}

export interface TaskRow {
  id: string;
  owner_id: string;
  title: string;
  description: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export type Db = Database.Database;

/**
 * Abre a conexão e aplica o esquema.
 *
 * @param path caminho do arquivo SQLite, ou `:memory:` para banco efêmero.
 */
export function openDatabase(path: string): Db {
  if (path !== ':memory:') {
    mkdirSync(dirname(path), { recursive: true });
  }

  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrate(db);
  return db;
}

function migrate(db: Db): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            TEXT PRIMARY KEY,
      email         TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id          TEXT PRIMARY KEY,
      owner_id    TEXT NOT NULL,
      title       TEXT NOT NULL,
      description TEXT,
      status      TEXT NOT NULL CHECK (status IN ('pending', 'in_progress', 'done')),
      created_at  TEXT NOT NULL,
      updated_at  TEXT NOT NULL,
      FOREIGN KEY (owner_id) REFERENCES users (id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_owner ON tasks (owner_id, created_at DESC);
  `);
}

/** Verifica a disponibilidade do banco para o health check (RF-020). */
export function isHealthy(db: Db): boolean {
  try {
    db.prepare('SELECT 1').get();
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Usuários                                                            */
/* ------------------------------------------------------------------ */

export function insertUser(db: Db, user: UserRow): void {
  db.prepare(
    `INSERT INTO users (id, email, password_hash, created_at)
     VALUES (@id, @email, @password_hash, @created_at)`,
  ).run(user);
}

export function findUserByEmail(db: Db, email: string): UserRow | undefined {
  return db.prepare('SELECT * FROM users WHERE email = ?').get(email) as UserRow | undefined;
}

export function findUserById(db: Db, id: string): UserRow | undefined {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
}

/* ------------------------------------------------------------------ */
/* Tarefas                                                             */
/* ------------------------------------------------------------------ */

export function insertTask(db: Db, task: TaskRow): void {
  db.prepare(
    `INSERT INTO tasks (id, owner_id, title, description, status, created_at, updated_at)
     VALUES (@id, @owner_id, @title, @description, @status, @created_at, @updated_at)`,
  ).run(task);
}

/**
 * Lista tarefas do proprietário.
 *
 * O filtro por `owner_id` é aplicado na consulta — implementação de RS-005 na
 * camada de dados, e não apenas na rota.
 */
export function listTasksByOwner(db: Db, ownerId: string, status?: string): TaskRow[] {
  if (status !== undefined) {
    return db
      .prepare(
        `SELECT * FROM tasks
         WHERE owner_id = ? AND status = ?
         ORDER BY created_at DESC`,
      )
      .all(ownerId, status) as TaskRow[];
  }

  return db
    .prepare('SELECT * FROM tasks WHERE owner_id = ? ORDER BY created_at DESC')
    .all(ownerId) as TaskRow[];
}

/**
 * Busca uma tarefa exigindo a posse.
 *
 * A cláusula `owner_id = ?` faz com que a tarefa de outro usuário seja
 * indistinguível de uma inexistente — ambas retornam `undefined`, que a rota
 * traduz em 404 (RS-005).
 */
export function findTaskByIdAndOwner(db: Db, id: string, ownerId: string): TaskRow | undefined {
  return db.prepare('SELECT * FROM tasks WHERE id = ? AND owner_id = ?').get(id, ownerId) as
    | TaskRow
    | undefined;
}

export function updateTask(db: Db, task: TaskRow): void {
  db.prepare(
    `UPDATE tasks
     SET title = @title, description = @description, status = @status, updated_at = @updated_at
     WHERE id = @id AND owner_id = @owner_id`,
  ).run(task);
}

/** @returns `true` se a tarefa existia e pertencia ao solicitante. */
export function deleteTaskByIdAndOwner(db: Db, id: string, ownerId: string): boolean {
  const result = db.prepare('DELETE FROM tasks WHERE id = ? AND owner_id = ?').run(id, ownerId);
  return result.changes > 0;
}
