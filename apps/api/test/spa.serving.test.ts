import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import fs from 'node:fs';
import path from 'node:path';
import { createApp } from '../src/app.js';
import { connectToDatabase, closeDatabase } from '../src/db/client.js';

describe('Production SPA Single-Origin Serving Tests (Issue 4)', () => {
  const app = createApp();

  beforeAll(async () => {
    await connectToDatabase();
  });

  afterAll(async () => {
    await closeDatabase();
  });

  const distPath = path.resolve(process.cwd(), '../web/dist');
  const distExists = fs.existsSync(distPath);

  it('verifies apps/web/dist exists before testing', () => {
    expect(distExists).toBe(true);
    expect(fs.existsSync(path.join(distPath, 'index.html'))).toBe(true);
  });

  it('GET / serves the compiled React SPA HTML', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.text).toContain('<div id="root">');
    expect(res.text.toLowerCase()).toContain('<!doctype html>');
  });

  it('GET /login serves the SPA index.html for direct navigation & refresh', async () => {
    const res = await request(app).get('/login');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.text).toContain('<div id="root">');
  });

  it('GET /app serves the SPA index.html for direct navigation & refresh', async () => {
    const res = await request(app).get('/app');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.text).toContain('<div id="root">');
  });

  it('GET /app/events/hackathon_123/teams serves SPA index.html for nested client routes', async () => {
    const res = await request(app).get('/app/events/hackathon_123/teams');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.text).toContain('<div id="root">');
  });

  it('GET /health and GET /ready remain operational with JSON', async () => {
    const health = await request(app).get('/health');
    expect(health.status).toBe(200);
    expect(health.headers['content-type']).toContain('application/json');
    expect(health.body.status).toBe('ok');

    const ready = await request(app).get('/ready');
    expect(ready.status).toBe(200);
    expect(ready.headers['content-type']).toContain('application/json');
    expect(ready.body.status).toBe('ready');
  });

  it('Unknown API routes return JSON error envelope, NOT SPA HTML', async () => {
    const res = await request(app).get('/api/v1/completely-unknown-route');
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toContain('application/json');
    expect(res.body.error).toBeDefined();
    expect(res.body.error.code).toBeDefined();
    expect(res.body.meta.requestId).toBeDefined();
    expect(res.text).not.toContain('<!doctype html>');
  });

  it('Unknown mutating API routes return JSON error envelope', async () => {
    const res = await request(app).post('/api/v1/teams/unknown/action');
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toContain('application/json');
    expect(res.body.error).toBeDefined();
    expect(res.text).not.toContain('<!doctype html>');
  });

  it('Static JS assets load with correct JavaScript Content-Type', async () => {
    const assetsDir = path.join(distPath, 'assets');
    const files = fs.readdirSync(assetsDir);
    const jsFile = files.find((f) => f.endsWith('.js'));
    expect(jsFile).toBeDefined();

    const res = await request(app).get(`/assets/${jsFile}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/javascript/);
  });

  it('Static CSS assets load with text/css Content-Type', async () => {
    const assetsDir = path.join(distPath, 'assets');
    const files = fs.readdirSync(assetsDir);
    const cssFile = files.find((f) => f.endsWith('.css'));
    expect(cssFile).toBeDefined();

    const res = await request(app).get(`/assets/${cssFile}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/css');
  });

  it('Helmet CSP allows self scripts and styles for single-origin deployment', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    const csp = res.headers['content-security-policy'];
    expect(csp).toBeDefined();
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
  });
});
