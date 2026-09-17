import { z } from 'zod';

/**
 * Esquemas de validação de entrada (RS-008).
 *
 * A validação é *allowlist*: o Zod descarta campos não declarados, o que impede
 * que atributos controlados pelo servidor cheguem à camada de persistência
 * vindos do corpo da requisição (RS-006).
 */

export const TASK_STATUSES = ['pending', 'in_progress', 'done'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

/** Limite superior da senha: contém o custo do bcrypt (RF-003). */
const MAX_PASSWORD_LENGTH = 128;
const MIN_PASSWORD_LENGTH = 10;

/** Requisitos de senha conforme RF-003. */
const passwordSchema = z
  .string({ required_error: 'Senha é obrigatória', invalid_type_error: 'Senha deve ser texto' })
  .min(MIN_PASSWORD_LENGTH, `Senha deve ter no mínimo ${MIN_PASSWORD_LENGTH} caracteres`)
  .max(MAX_PASSWORD_LENGTH, `Senha deve ter no máximo ${MAX_PASSWORD_LENGTH} caracteres`)
  .refine((value) => /[a-zA-Z]/.test(value) && /\d/.test(value), {
    message: 'Senha deve conter ao menos uma letra e um dígito',
  });

/** E-mail normalizado para minúsculas, conforme SPEC-001 §1. */
const emailSchema = z
  .string({ required_error: 'E-mail é obrigatório', invalid_type_error: 'E-mail deve ser texto' })
  .email('E-mail inválido')
  .max(254, 'E-mail deve ter no máximo 254 caracteres')
  .transform((value) => value.toLowerCase().trim());

/** RF-001 / RF-003 */
export const registerSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
  })
  .strict();

/**
 * RF-002 — no login a senha não passa pelas regras de complexidade: exigir
 * formato aqui vazaria a política de senhas para um atacante não autenticado e
 * produziria 400 onde a spec exige 401.
 */
export const loginSchema = z
  .object({
    email: emailSchema,
    password: z.string({ required_error: 'Senha é obrigatória' }).max(MAX_PASSWORD_LENGTH),
  })
  .strict();

/** RF-011 / RF-014 */
export const createTaskSchema = z
  .object({
    title: z
      .string({ required_error: 'Título é obrigatório', invalid_type_error: 'Título deve ser texto' })
      .transform((value) => value.trim())
      .pipe(
        z
          .string()
          .min(1, 'Título não pode ser vazio')
          .max(200, 'Título deve ter no máximo 200 caracteres'),
      ),
    description: z
      .string({ invalid_type_error: 'Descrição deve ser texto' })
      .max(2000, 'Descrição deve ter no máximo 2000 caracteres')
      .optional(),
    status: z.enum(TASK_STATUSES, { invalid_type_error: 'Status inválido' }).default('pending'),
  })
  .strict();

/** RF-013 — atualização parcial; ao menos um campo deve estar presente. */
export const updateTaskSchema = z
  .object({
    title: z
      .string({ invalid_type_error: 'Título deve ser texto' })
      .transform((value) => value.trim())
      .pipe(
        z
          .string()
          .min(1, 'Título não pode ser vazio')
          .max(200, 'Título deve ter no máximo 200 caracteres'),
      )
      .optional(),
    description: z
      .string({ invalid_type_error: 'Descrição deve ser texto' })
      .max(2000, 'Descrição deve ter no máximo 2000 caracteres')
      .optional(),
    status: z.enum(TASK_STATUSES, { invalid_type_error: 'Status inválido' }).optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Informe ao menos um campo para atualizar',
  });

/** RF-010 — filtro opcional da listagem. */
export const listTasksQuerySchema = z
  .object({
    status: z.enum(TASK_STATUSES, { invalid_type_error: 'Status inválido' }).optional(),
  })
  .strict();

/** RF-012 — identificadores de recurso devem ser UUID (CA-002.9). */
export const uuidParamSchema = z.object({
  id: z.string().uuid('Identificador inválido'),
});

/** Converte o erro do Zod em detalhes seguros para exibição (RS-011). */
export function formatValidationIssues(error: z.ZodError): Array<{ field: string; message: string }> {
  return error.issues.map((issue) => ({
    field: issue.path.join('.') || '(corpo)',
    message: issue.message,
  }));
}
