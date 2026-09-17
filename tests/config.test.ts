import { loadConfig, MIN_JWT_SECRET_LENGTH } from '../src/config';

/** Verificação de RF-021 e RS-002 — a aplicação falha rápido, sem padrão inseguro. */

const SEGREDO_VALIDO = 'x'.repeat(MIN_JWT_SECRET_LENGTH);

describe('RF-021 — validação da configuração', () => {
  it('CA-004.2: recusa configuração sem JWT_SECRET', () => {
    expect(() => loadConfig({})).toThrow(/JWT_SECRET/);
  });

  it('CA-004.3: recusa JWT_SECRET abaixo do comprimento mínimo', () => {
    const curto = 'x'.repeat(MIN_JWT_SECRET_LENGTH - 1);
    expect(() => loadConfig({ JWT_SECRET: curto })).toThrow(/JWT_SECRET/);
  });

  it('aceita JWT_SECRET no comprimento mínimo', () => {
    expect(() => loadConfig({ JWT_SECRET: SEGREDO_VALIDO })).not.toThrow();
  });

  it('RS-002: não existe segredo padrão — a configuração vazia nunca produz um', () => {
    let config;
    try {
      config = loadConfig({});
    } catch {
      config = undefined;
    }
    expect(config).toBeUndefined();
  });

  it('aplica os valores padrão documentados', () => {
    const config = loadConfig({ JWT_SECRET: SEGREDO_VALIDO });

    expect(config.port).toBe(3000);
    expect(config.nodeEnv).toBe('development');
    expect(config.databasePath).toBe('./data/securetasks.db');
    expect(config.logLevel).toBe('info');
  });

  it('converte PORT para número', () => {
    const config = loadConfig({ JWT_SECRET: SEGREDO_VALIDO, PORT: '8080' });
    expect(config.port).toBe(8080);
  });

  it('recusa PORT fora da faixa válida', () => {
    expect(() => loadConfig({ JWT_SECRET: SEGREDO_VALIDO, PORT: '99999' })).toThrow();
  });

  it('recusa NODE_ENV desconhecido', () => {
    expect(() => loadConfig({ JWT_SECRET: SEGREDO_VALIDO, NODE_ENV: 'staging' })).toThrow();
  });

  it('devolve um objeto imutável', () => {
    const config = loadConfig({ JWT_SECRET: SEGREDO_VALIDO });
    expect(Object.isFrozen(config)).toBe(true);
  });
});
