import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import type { Logger } from 'pino';
import type { AppConfig } from '../config';
import type { Db, TaskRow } from '../lib/database';
import {
  deleteTaskByIdAndOwner,
  findTaskByIdAndOwner,
  insertTask,
  listTasksByOwner,
  updateTask,
} from '../lib/database';
import {
  createTaskSchema,
  formatValidationIssues,
  listTasksQuerySchema,
  updateTaskSchema,
  uuidParamSchema,
} from '../lib/schemas';
import { AppError } from '../middleware/errorHandler';
import { authenticate } from '../middleware/authenticate';

/**
 * Rotas de tarefas — implementa SPEC-002.
 *
 * Toda rota deste módulo passa pelo middleware de autenticação e resolve o
 * proprietário a partir do token, nunca do corpo ou da query (RS-005, RS-006).
 */

interface TaskResponse {
  id: string;
  title: string;
  description: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

/** Projeção pública: `ownerId` não é exposto — é sempre o próprio solicitante. */
function toResponse(row: TaskRow): TaskResponse {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Identidade do solicitante, garantida pelo middleware de autenticação. */
function requireUserId(req: { user?: { id: string } }): string {
  if (!req.user) {
    throw new AppError(401, 'Não autenticado');
  }
  return req.user.id;
}

/** Valida o `:id` da rota (CA-002.9). */
function parseTaskId(params: unknown): string {
  const parsed = uuidParamSchema.safeParse(params);
  if (!parsed.success) {
    throw new AppError(400, 'Identificador inválido');
  }
  return parsed.data.id;
}

export function createTasksRouter(db: Db, config: AppConfig, logger: Logger): Router {
  const router = Router();

  router.use(authenticate(config.jwtSecret, logger));

  /** RF-010 — listar tarefas do solicitante. */
  router.get('/', (req, res, next) => {
    try {
      const ownerId = requireUserId(req);

      const parsedQuery = listTasksQuerySchema.safeParse(req.query);
      if (!parsedQuery.success) {
        throw new AppError(400, 'Parâmetros inválidos', formatValidationIssues(parsedQuery.error));
      }

      const rows = listTasksByOwner(db, ownerId, parsedQuery.data.status);
      res.status(200).json({ tasks: rows.map(toResponse), count: rows.length });
    } catch (err) {
      next(err);
    }
  });

  /** RF-011 — criar tarefa. */
  router.post('/', (req, res, next) => {
    try {
      const ownerId = requireUserId(req);

      const parsed = createTaskSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(400, 'Dados inválidos', formatValidationIssues(parsed.error));
      }

      const now = new Date().toISOString();

      // Montagem campo a campo: `id` e `owner_id` vêm do servidor e do token,
      // jamais do corpo da requisição (RS-006, CA-002.2).
      const task: TaskRow = {
        id: randomUUID(),
        owner_id: ownerId,
        title: parsed.data.title,
        description: parsed.data.description ?? null,
        status: parsed.data.status,
        created_at: now,
        updated_at: now,
      };

      insertTask(db, task);
      res.status(201).json(toResponse(task));
    } catch (err) {
      next(err);
    }
  });

  /** RF-012 — obter tarefa por identificador. */
  router.get('/:id', (req, res, next) => {
    try {
      const ownerId = requireUserId(req);
      const id = parseTaskId(req.params);

      const task = findTaskByIdAndOwner(db, id, ownerId);
      if (!task) {
        // Tarefa de terceiro e tarefa inexistente produzem a mesma resposta,
        // impedindo o mapeamento de identificadores válidos (RS-005).
        throw new AppError(404, 'Tarefa não encontrada');
      }

      res.status(200).json(toResponse(task));
    } catch (err) {
      next(err);
    }
  });

  /** RF-013 — atualização parcial. */
  router.patch('/:id', (req, res, next) => {
    try {
      const ownerId = requireUserId(req);
      const id = parseTaskId(req.params);

      const parsed = updateTaskSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(400, 'Dados inválidos', formatValidationIssues(parsed.error));
      }

      const existing = findTaskByIdAndOwner(db, id, ownerId);
      if (!existing) {
        throw new AppError(404, 'Tarefa não encontrada');
      }

      const updated: TaskRow = {
        ...existing,
        title: parsed.data.title ?? existing.title,
        description:
          parsed.data.description !== undefined ? parsed.data.description : existing.description,
        status: parsed.data.status ?? existing.status,
        updated_at: new Date().toISOString(),
      };

      updateTask(db, updated);
      res.status(200).json(toResponse(updated));
    } catch (err) {
      next(err);
    }
  });

  /** RF-015 — remover tarefa. */
  router.delete('/:id', (req, res, next) => {
    try {
      const ownerId = requireUserId(req);
      const id = parseTaskId(req.params);

      if (!deleteTaskByIdAndOwner(db, id, ownerId)) {
        throw new AppError(404, 'Tarefa não encontrada');
      }

      res.status(204).send();
    } catch (err) {
      next(err);
    }
  });

  return router;
}
