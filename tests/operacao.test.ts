import request from 'supertest';
import { createTestContext, createUserAndLogin, type TestContext } from './helpers';

/** Verificação de RF-020 (health check), RS-009 (cabeçalhos) e RS-011 (erros). */

let ctx: TestContext;

beforeEach(() => {
  ctx = createTestContext();
});

afterEach(() => {
  ctx.db.close();
});

describe('RF-020 — health check', () => {
  it('CA-004.1: responde 200 com o estado do serviço', async () => {
    const res = await request(ctx.app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.version).toBe('1.0.0');
    expect(res.body.uptime).toEqual(expect.any(Number));
    expect(res.body.timestamp).toEqual(expect.any(String));
  });

  it('é público, sem exigir autenticação', async () => {
    const res = await request(ctx.app).get('/health');
    expect(res.status).toBe(200);
  });

  it('RS-011: não expõe informação de infraestrutura', async () => {
    const res = await request(ctx.app).get('/health');
    const corpo = JSON.stringify(res.body);

    expect(corpo).not.toContain('JWT_SECRET');
    expect(corpo).not.toContain('databasePath');
    expect(res.body).not.toHaveProperty('env');
    expect(res.body).not.toHaveProperty('dependencies');
  });

  it('responde 503 quando o banco está indisponível', async () => {
    ctx.db.close();

    const res = await request(ctx.app).get('/health');

    expect(res.status).toBe(503);
    expect(res.body.status).toBe('degraded');
  });
});

describe('RS-009 — cabeçalhos de segurança HTTP', () => {
  it('inclui os cabeçalhos exigidos pela especificação', async () => {
    const res = await request(ctx.app).get('/health');

    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['content-security-policy']).toBeDefined();
    expect(res.headers['strict-transport-security']).toBeDefined();
    expect(res.headers['referrer-policy']).toBeDefined();
  });

  it('remove o cabeçalho X-Powered-By', async () => {
    const res = await request(ctx.app).get('/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});

describe('RS-011 — tratamento de erros sem vazamento', () => {
  it('responde 404 genérico para rota inexistente', async () => {
    const res = await request(ctx.app).get('/rota/que/nao/existe');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Recurso não encontrado');
  });

  it('não inclui stack trace, SQL ou caminho de arquivo nas respostas de erro', async () => {
    const { token } = await createUserAndLogin(ctx.app, 'erro@exemplo.com');

    const res = await request(ctx.app)
      .get('/api/tasks/nao-e-uuid')
      .set('Authorization', `Bearer ${token}`);

    const corpo = JSON.stringify(res.body);
    expect(corpo).not.toMatch(/at\s+\w+\s+\(/); // stack trace
    expect(corpo).not.toMatch(/SELECT|INSERT|UPDATE|DELETE/i);
    expect(corpo).not.toContain('node_modules');
    expect(corpo).not.toMatch(/[A-Za-z]:\\|\/home\//); // caminho absoluto
  });

  it('RS-008: recusa corpo que excede o limite de tamanho', async () => {
    const { token } = await createUserAndLogin(ctx.app, 'grande@exemplo.com');

    const res = await request(ctx.app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${token}`)
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ title: 'x'.repeat(200_000) }));

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  it('recusa JSON malformado sem expor detalhe interno', async () => {
    const res = await request(ctx.app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email": ');

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(JSON.stringify(res.body)).not.toContain('node_modules');
  });
});
