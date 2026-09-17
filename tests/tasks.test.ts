import request from 'supertest';
import { createTask, createTestContext, createUserAndLogin, type TestContext } from './helpers';

/** Verificação de SPEC-002 (tarefas) e dos requisitos RS-005 e RS-006. */

let ctx: TestContext;
let alice: { token: string; userId: string };

beforeEach(async () => {
  ctx = createTestContext();
  alice = await createUserAndLogin(ctx.app, 'alice@exemplo.com');
});

afterEach(() => {
  ctx.db.close();
});

describe('RS-003 — rotas de tarefas exigem autenticação', () => {
  const rotas: Array<[string, string]> = [
    ['get', '/api/tasks'],
    ['post', '/api/tasks'],
    ['get', '/api/tasks/11111111-1111-4111-8111-111111111111'],
    ['patch', '/api/tasks/11111111-1111-4111-8111-111111111111'],
    ['delete', '/api/tasks/11111111-1111-4111-8111-111111111111'],
  ];

  it.each(rotas)('recusa %s %s sem token', async (metodo, rota) => {
    const res = await (request(ctx.app) as unknown as Record<string, (r: string) => request.Test>)[
      metodo
    ](rota).send({});

    expect(res.status).toBe(401);
  });
});

describe('RF-011 — criação de tarefa', () => {
  it('CA-002.1: atribui a tarefa ao usuário do token', async () => {
    const res = await createTask(ctx.app, alice.token, {
      title: 'Estudar SSDLC',
      description: 'Revisar OWASP Top 10',
    });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      title: 'Estudar SSDLC',
      description: 'Revisar OWASP Top 10',
      status: 'pending',
    });
    expect(res.body.id).toEqual(expect.any(String));

    const row = ctx.db
      .prepare('SELECT owner_id FROM tasks WHERE id = ?')
      .get(res.body.id) as { owner_id: string };
    expect(row.owner_id).toBe(alice.userId);
  });

  it('RS-006 / CA-002.2: ignora ownerId e id enviados no corpo', async () => {
    const bob = await createUserAndLogin(ctx.app, 'bob@exemplo.com');

    const res = await createTask(ctx.app, alice.token, {
      title: 'Tentativa de atribuição em massa',
      ownerId: bob.userId,
      owner_id: bob.userId,
      id: '99999999-9999-4999-8999-999999999999',
    });

    // O esquema é estrito: campos controlados pelo servidor reprovam a entrada.
    expect(res.status).toBe(400);

    // E, de fato, nenhuma tarefa foi criada para Bob.
    const listaBob = await request(ctx.app)
      .get('/api/tasks')
      .set('Authorization', `Bearer ${bob.token}`);
    expect(listaBob.body.count).toBe(0);
  });

  it('aplica o status padrão "pending" quando omitido', async () => {
    const res = await createTask(ctx.app, alice.token, { title: 'Sem status' });
    expect(res.body.status).toBe('pending');
  });
});

describe('RF-014 — validação de entrada de tarefas', () => {
  const casosInvalidos: Array<[string, Record<string, unknown>]> = [
    ['título ausente', {}],
    ['título vazio (CA-002.7)', { title: '' }],
    ['título só com espaços', { title: '     ' }],
    ['título acima de 200 caracteres', { title: 'x'.repeat(201) }],
    ['título não textual', { title: 42 }],
    ['descrição não textual', { title: 'ok', description: 42 }],
    ['descrição acima de 2000 caracteres', { title: 'ok', description: 'x'.repeat(2001) }],
    ['status fora do enum (CA-002.8)', { title: 'ok', status: 'concluida' }],
  ];

  it.each(casosInvalidos)('rejeita %s com 400', async (_descricao, payload) => {
    const res = await createTask(ctx.app, alice.token, payload);
    expect(res.status).toBe(400);
  });

  it('remove espaços em torno do título', async () => {
    const res = await createTask(ctx.app, alice.token, { title: '  Com espaços  ' });
    expect(res.body.title).toBe('Com espaços');
  });
});

describe('RF-010 — listagem de tarefas', () => {
  it('CA-002.3: a listagem de Alice nunca contém tarefas de Bob (RS-005)', async () => {
    const bob = await createUserAndLogin(ctx.app, 'bob@exemplo.com');

    await createTask(ctx.app, alice.token, { title: 'Tarefa de Alice' });
    await createTask(ctx.app, bob.token, { title: 'Tarefa de Bob' });

    const listaAlice = await request(ctx.app)
      .get('/api/tasks')
      .set('Authorization', `Bearer ${alice.token}`);

    expect(listaAlice.status).toBe(200);
    expect(listaAlice.body.count).toBe(1);
    expect(listaAlice.body.tasks[0].title).toBe('Tarefa de Alice');
    expect(JSON.stringify(listaAlice.body)).not.toContain('Tarefa de Bob');
  });

  it('filtra por status quando solicitado', async () => {
    await createTask(ctx.app, alice.token, { title: 'Pendente' });
    await createTask(ctx.app, alice.token, { title: 'Concluída', status: 'done' });

    const res = await request(ctx.app)
      .get('/api/tasks?status=done')
      .set('Authorization', `Bearer ${alice.token}`);

    expect(res.body.count).toBe(1);
    expect(res.body.tasks[0].title).toBe('Concluída');
  });

  it('rejeita filtro de status inválido com 400', async () => {
    const res = await request(ctx.app)
      .get('/api/tasks?status=inexistente')
      .set('Authorization', `Bearer ${alice.token}`);

    expect(res.status).toBe(400);
  });
});

describe('RS-005 — autorização em nível de objeto (BOLA)', () => {
  let bob: { token: string; userId: string };
  let tarefaDeBob: string;

  beforeEach(async () => {
    bob = await createUserAndLogin(ctx.app, 'bob@exemplo.com');
    const criada = await createTask(ctx.app, bob.token, { title: 'Confidencial de Bob' });
    tarefaDeBob = criada.body.id;
  });

  it('CA-002.4: Alice recebe 404 ao ler tarefa de Bob', async () => {
    const res = await request(ctx.app)
      .get(`/api/tasks/${tarefaDeBob}`)
      .set('Authorization', `Bearer ${alice.token}`);

    // 404, e não 403: responder 403 confirmaria a existência do recurso.
    expect(res.status).toBe(404);
    expect(JSON.stringify(res.body)).not.toContain('Confidencial');
  });

  it('CA-002.5: Alice recebe 404 ao atualizar tarefa de Bob, e o dado permanece intacto', async () => {
    const res = await request(ctx.app)
      .patch(`/api/tasks/${tarefaDeBob}`)
      .set('Authorization', `Bearer ${alice.token}`)
      .send({ title: 'Invadido' });

    expect(res.status).toBe(404);

    const original = await request(ctx.app)
      .get(`/api/tasks/${tarefaDeBob}`)
      .set('Authorization', `Bearer ${bob.token}`);
    expect(original.body.title).toBe('Confidencial de Bob');
  });

  it('CA-002.6: Alice recebe 404 ao remover tarefa de Bob, e o dado permanece', async () => {
    const res = await request(ctx.app)
      .delete(`/api/tasks/${tarefaDeBob}`)
      .set('Authorization', `Bearer ${alice.token}`);

    expect(res.status).toBe(404);

    const aindaExiste = await request(ctx.app)
      .get(`/api/tasks/${tarefaDeBob}`)
      .set('Authorization', `Bearer ${bob.token}`);
    expect(aindaExiste.status).toBe(200);
  });

  it('tarefa inexistente e tarefa de terceiro produzem a mesma resposta', async () => {
    const inexistente = await request(ctx.app)
      .get('/api/tasks/11111111-1111-4111-8111-111111111111')
      .set('Authorization', `Bearer ${alice.token}`);

    const deTerceiro = await request(ctx.app)
      .get(`/api/tasks/${tarefaDeBob}`)
      .set('Authorization', `Bearer ${alice.token}`);

    expect(inexistente.status).toBe(deTerceiro.status);
    expect(inexistente.body).toEqual(deTerceiro.body);
  });
});

describe('RF-012 / RF-013 / RF-015 — acesso, atualização e remoção', () => {
  let tarefaId: string;

  beforeEach(async () => {
    const criada = await createTask(ctx.app, alice.token, {
      title: 'Original',
      description: 'Descrição original',
    });
    tarefaId = criada.body.id;
  });

  it('CA-002.9: identificador malformado retorna 400', async () => {
    const res = await request(ctx.app)
      .get('/api/tasks/nao-e-uuid')
      .set('Authorization', `Bearer ${alice.token}`);

    expect(res.status).toBe(400);
  });

  it('atualiza parcialmente, preservando os campos omitidos', async () => {
    const res = await request(ctx.app)
      .patch(`/api/tasks/${tarefaId}`)
      .set('Authorization', `Bearer ${alice.token}`)
      .send({ status: 'in_progress' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('in_progress');
    expect(res.body.title).toBe('Original');
    expect(res.body.description).toBe('Descrição original');
  });

  it('RS-006: recusa tentativa de alterar campos controlados pelo servidor', async () => {
    const res = await request(ctx.app)
      .patch(`/api/tasks/${tarefaId}`)
      .set('Authorization', `Bearer ${alice.token}`)
      .send({ ownerId: 'outro', createdAt: '2000-01-01T00:00:00.000Z' });

    expect(res.status).toBe(400);
  });

  it('recusa corpo de atualização vazio', async () => {
    const res = await request(ctx.app)
      .patch(`/api/tasks/${tarefaId}`)
      .set('Authorization', `Bearer ${alice.token}`)
      .send({});

    expect(res.status).toBe(400);
  });

  it('RF-015: remove a tarefa e responde 204', async () => {
    const res = await request(ctx.app)
      .delete(`/api/tasks/${tarefaId}`)
      .set('Authorization', `Bearer ${alice.token}`);

    expect(res.status).toBe(204);

    const depois = await request(ctx.app)
      .get(`/api/tasks/${tarefaId}`)
      .set('Authorization', `Bearer ${alice.token}`);
    expect(depois.status).toBe(404);
  });
});

describe('RS-007 — resistência a injeção de SQL', () => {
  it('trata carga de injeção como dado literal, sem afetar o esquema', async () => {
    const payload = "'; DROP TABLE tasks; --";

    const criada = await createTask(ctx.app, alice.token, { title: payload });
    expect(criada.status).toBe(201);
    expect(criada.body.title).toBe(payload);

    // A tabela continua existindo e a tarefa é recuperável.
    const lista = await request(ctx.app)
      .get('/api/tasks')
      .set('Authorization', `Bearer ${alice.token}`);

    expect(lista.status).toBe(200);
    expect(lista.body.count).toBe(1);
    expect(lista.body.tasks[0].title).toBe(payload);
  });

  it('não permite escapar do filtro de proprietário por injeção no identificador', async () => {
    const res = await request(ctx.app)
      .get("/api/tasks/' OR '1'='1")
      .set('Authorization', `Bearer ${alice.token}`);

    expect(res.status).toBe(400);
  });
});
