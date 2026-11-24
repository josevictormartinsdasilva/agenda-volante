import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

/**
 * O Compose de produção não roda neste ambiente (sem Docker), então as garantias de
 * segurança dele ficam presas aqui, lendo o arquivo. O CI ainda confere a sintaxe com
 * `docker compose config` e o Caddyfile com `caddy validate`.
 */
interface Servico {
  image?: string;
  build?: unknown;
  ports?: string[];
  environment?: Record<string, string | number>;
  restart?: string;
  depends_on?: Record<string, { condition: string }>;
  volumes?: string[];
  logging?: { driver?: string; options?: Record<string, string> };
}

const compose = parse(readFileSync('docker-compose.prod.yml', 'utf8')) as {
  services: Record<string, Servico>;
  volumes?: Record<string, unknown>;
};
const caddyfile = readFileSync('deploy/Caddyfile', 'utf8');
const { api, db, proxy } = compose.services;

describe('docker-compose.prod.yml', () => {
  it('tem os três serviços: api, db e proxy', () => {
    expect(Object.keys(compose.services).sort()).toEqual(['api', 'db', 'proxy']);
  });

  it('só o proxy publica portas, e só 80 e 443', () => {
    expect(api.ports).toBeUndefined();
    expect(db.ports).toBeUndefined();
    expect(proxy.ports).toEqual(['80:80', '443:443']);
  });

  it('a API exige HTTPS no cookie e confia no X-Forwarded-For do proxy', () => {
    expect(String(api.environment?.COOKIE_SEGURO)).toBe('true');
    expect(String(api.environment?.TRUST_PROXY)).toBe('true');
  });

  it('não tem senha de banco padrão: sem POSTGRES_PASSWORD no .env, o Compose recusa subir', () => {
    expect(String(db.environment?.POSTGRES_PASSWORD)).toMatch(/^\$\{POSTGRES_PASSWORD:\?.+\}$/);
    expect(String(api.environment?.DATABASE_URL)).toContain('${POSTGRES_PASSWORD:?');
    expect(readFileSync('docker-compose.prod.yml', 'utf8')).not.toContain('agenda_dev');
  });

  it('a porta de métricas não aparece fora do Compose (ADR 0004)', () => {
    const publicadas = Object.values(compose.services).flatMap((s) => s.ports ?? []);
    expect(publicadas.join(' ')).not.toContain('9100');
  });

  it('o proxy só sobe com a API pronta e guarda os certificados num volume', () => {
    expect(proxy.depends_on?.api.condition).toBe('service_healthy');
    expect(proxy.volumes).toContain('caddy_data:/data');
    expect(compose.volumes).toHaveProperty('caddy_data');
    expect(compose.volumes).toHaveProperty('dbdata');
  });

  it('todo serviço volta sozinho e tem o log limitado', () => {
    for (const [nome, servico] of Object.entries(compose.services)) {
      expect(servico.restart, nome).toBe('unless-stopped');
      expect(servico.logging?.options?.['max-size'], nome).toBeDefined();
      expect(servico.logging?.options?.['max-file'], nome).toBeDefined();
    }
  });
});

describe('deploy/Caddyfile', () => {
  it('atende o domínio do .env e repassa para a API na rede interna', () => {
    expect(caddyfile).toContain('{$DOMINIO}');
    expect(caddyfile).toMatch(/reverse_proxy\s+api:3000/);
  });

  it('manda o navegador usar só HTTPS (HSTS)', () => {
    expect(caddyfile).toMatch(/Strict-Transport-Security\s+"max-age=\d+/);
  });

  it('só repassa para a porta da API, nunca para a de métricas (ADR 0004)', () => {
    const destinos = [...caddyfile.matchAll(/^\s*reverse_proxy\s+(\S+)/gm)].map((m) => m[1]);
    expect(destinos).toEqual(['api:3000']);
  });
});
