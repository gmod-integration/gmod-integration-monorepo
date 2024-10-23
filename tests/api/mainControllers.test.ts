import request from 'supertest';
import { expect } from 'chai';
import app from '../../src/gm_integration_api';

describe('GET /', () => {
  it('should return a 200 status and a greeting message', async () => {
    const res = await request(app).get('/');
    expect(res.status).to.equal(200);
    expect(res.text).to.equal('Hello, TypeScript + Express in ESM!');
  });
});
