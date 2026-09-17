import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createTestContext, createUserAndLogin, TEST_SECRET, type TestContext } from './helpers';

/**
 * Verificação de SPEC-001 (autenticação) e dos requisitos de segurança
 * associados.
 */

let ctx: TestContext;

beforeEach(() => {
  ctx = createTestContext();
});

afterEach(() => {
  ctx.db.close();
});

describe('RF-001 — registro de usuário', () => {
  it('CA-001.1: cria o usuário e responde 201 sem expor o hash da senha', async () => {
    const res = await request(ctx.app)
      .post('/api/auth/register')
      .send({ email: 'aluno@exemplo.com', password: 'SenhaSegura123' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ email: 'aluno@exemplo.com' });
    expect(res.body.id).toEqual(expect.any(String));
    expect(res.body.createdAt).toEqual(expect.any(String));

    // RS-001 — o hash jamais integra a resposta.
    expect(res.body).not.toHaveProperty('passwordHash');
    expect(res.body).not.toHaveProperty('password_hash');
    expect(res.body).not.toHaveProperty('password');
    expect(JSON.stringify(res.body)).not.toContain('$2a$');
  });

  it('normaliza o e-mail para minúsculas', async () => {
    const res = await request(ctx.app)
      .post('/api/auth/register')
      .send({ email: 'Aluno@Exemplo.COM', password: 'SenhaSegura123' });

    expect(res.status).toBe(201);
    expect(res.body.email).toBe('aluno@exemplo.com');
  });

  it('CA-001.2: recusa e-mail já cadastrado com 409', async () => {
    const payload = { email: 'duplicado@exemplo.com', password: 'SenhaSegura123' };
    await request(ctx.app).post('/api/auth/register').send(payload);

    const res = await request(ctx.app).post('/api/auth/register').send(payload);

    expect(res.status).toBe(409);
  });

  it('CA-001.2: detecta duplicidade ignorando diferença de caixa', async () => {
    await request(ctx.app)
      .post('/api/auth/register')
      .send({ email: 'caixa@exemplo.com', password: 'SenhaSegura123' });

    const res = await request(ctx.app)
      .post('/api/auth/register')
      .send({ email: 'CAIXA@EXEMPLO.COM', password: 'SenhaSegura123' });

    expect(res.status).toBe(409);
  });
});

describe('RF-003 — validação de entrada no cadastro', () => {
  const casosInvalidos: Array<[string, Record<string, unknown>]> = [
    ['senha com 9 caracteres (CA-001.3)', { email: 'a@b.com', password: 'Curta123' }],
    ['senha sem dígito', { email: 'a@b.com', password: 'SomenteLetras' }],
    ['senha sem letra', { email: 'a@b.com', password: '1234567890' }],
    ['senha acima de 128 caracteres', { email: 'a@b.com', password: `A1${'x'.repeat(200)}` }],
    ['e-mail sem formato válido', { email: 'nao-e-email', password: 'SenhaSegura123' }],
    ['e-mail ausente', { password: 'SenhaSegura123' }],
    ['senha ausente', { email: 'a@b.com' }],
    ['senha não textual', { email: 'a@b.com', password: 12345678901 }],
  ];

  it.each(casosInvalidos)('rejeita %s com 400', async (_descricao, payload) => {
    const res = await request(ctx.app).post('/api/auth/register').send(payload);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Dados inválidos');
    expect(Array.isArray(res.body.details)).toBe(true);
  });

  it('RS-008: descarta campos não declarados no esquema', async () => {
    const res = await request(ctx.app).post('/api/auth/register').send({
      email: 'estrito@exemplo.com',
      password: 'SenhaSegura123',
      role: 'admin',
    });

    // O esquema é estrito: campo desconhecido reprova a validação.
    expect(res.status).toBe(400);
  });
});

describe('RF-002 — autenticação', () => {
  it('CA-001.4: emite um JWT válido para credenciais corretas', async () => {
    await request(ctx.app)
      .post('/api/auth/register')
      .send({ email: 'login@exemplo.com', password: 'SenhaSegura123' });

    const res = await request(ctx.app)
      .post('/api/auth/login')
      .send({ email: 'login@exemplo.com', password: 'SenhaSegura123' });

    expect(res.status).toBe(200);
    expect(res.body.expiresIn).toBe(3600);

    // RS-002 — o token é HS256 e carrega `sub` e `exp`.
    const decoded = jwt.verify(res.body.token, TEST_SECRET, { algorithms: ['HS256'] });
    expect(typeof decoded).toBe('object');
    expect((decoded as jwt.JwtPayload).sub).toEqual(expect.any(String));
    expect((decoded as jwt.JwtPayload).exp).toEqual(expect.any(Number));
  });

  it('RS-004: falha por senha incorreta e por usuário inexistente são indistinguíveis', async () => {
    await request(ctx.app)
      .post('/api/auth/register')
      .send({ email: 'existente@exemplo.com', password: 'SenhaSegura123' });

    // CA-001.5
    const senhaIncorreta = await request(ctx.app)
      .post('/api/auth/login')
      .send({ email: 'existente@exemplo.com', password: 'SenhaErrada123' });

    // CA-001.6
    const usuarioInexistente = await request(ctx.app)
      .post('/api/auth/login')
      .send({ email: 'inexistente@exemplo.com', password: 'SenhaSegura123' });

    expect(senhaIncorreta.status).toBe(401);
    expect(usuarioInexistente.status).toBe(401);
    expect(senhaIncorreta.body).toEqual(usuarioInexistente.body);
    expect(senhaIncorreta.body.error).toBe('Credenciais inválidas');
  });

  it('RS-004: payload malformado também resulta em 401, não em 400', async () => {
    const res = await request(ctx.app).post('/api/auth/login').send({ email: 'x' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Credenciais inválidas');
  });
});

describe('RS-003 — verificação de token', () => {
  it('CA-001.7: recusa requisição sem cabeçalho Authorization', async () => {
    const res = await request(ctx.app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('aceita token válido e devolve a identidade do portador (RF-004)', async () => {
    const { token, userId } = await createUserAndLogin(ctx.app, 'eu@exemplo.com');

    const res = await request(ctx.app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(userId);
    expect(res.body.email).toBe('eu@exemplo.com');
    expect(res.body).not.toHaveProperty('passwordHash');
  });

  const tokensInvalidos: Array<[string, string]> = [
    ['esquema ausente', 'apenas-o-token'],
    ['esquema incorreto', 'Basic YWJjOjEyMw=='],
    ['token vazio', 'Bearer '],
    ['token malformado', 'Bearer nao.e.um.jwt'],
  ];

  it.each(tokensInvalidos)('recusa %s com 401', async (_descricao, header) => {
    const res = await request(ctx.app).get('/api/auth/me').set('Authorization', header);
    expect(res.status).toBe(401);
  });

  it('recusa token assinado com outro segredo', async () => {
    const forjado = jwt.sign({ email: 'invasor@exemplo.com' }, 'outro-segredo-completamente-diferente', {
      subject: 'id-qualquer',
      algorithm: 'HS256',
      expiresIn: 3600,
    });

    const res = await request(ctx.app).get('/api/auth/me').set('Authorization', `Bearer ${forjado}`);

    expect(res.status).toBe(401);
  });

  it('recusa token expirado', async () => {
    const expirado = jwt.sign({ email: 'antigo@exemplo.com' }, TEST_SECRET, {
      subject: 'id-qualquer',
      algorithm: 'HS256',
      expiresIn: -10,
    });

    const res = await request(ctx.app).get('/api/auth/me').set('Authorization', `Bearer ${expirado}`);

    expect(res.status).toBe(401);
  });

  it('RS-003: recusa token com algoritmo "none" (confusão de algoritmo)', async () => {
    const semAssinatura = jwt.sign({ email: 'invasor@exemplo.com', sub: 'id-qualquer' }, '', {
      algorithm: 'none',
    });

    const res = await request(ctx.app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${semAssinatura}`);

    expect(res.status).toBe(401);
  });
});
