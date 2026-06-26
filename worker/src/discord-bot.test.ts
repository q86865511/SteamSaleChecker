import { describe, it, expect } from 'vitest';
import { postChannelMessage, sendDm } from './discord-bot';

function mockFetch() {
  const calls: { url: string; opts: any }[] = [];
  const fn = async (url: string, opts: any) => {
    calls.push({ url, opts });
    if (url.includes('/users/@me/channels')) return { ok: true, status: 200, json: async () => ({ id: 'dm1' }) };
    return { ok: true, status: 204 };
  };
  return { calls, fn };
}

describe('postChannelMessage', () => {
  it('字串 payload 包成 content,預設不解析 mention', async () => {
    const { calls, fn } = mockFetch();
    const orig = globalThis.fetch; (globalThis as any).fetch = fn;
    try { await postChannelMessage('tok', 'c1', 'hi'); } finally { globalThis.fetch = orig; }
    const body = JSON.parse(calls[0].opts.body);
    expect(body.content).toBe('hi');
    expect(body.allowed_mentions).toEqual({ parse: [] });
  });
  it('物件 payload 直送 embeds/components,且預設禁止 mention', async () => {
    const { calls, fn } = mockFetch();
    const orig = globalThis.fetch; (globalThis as any).fetch = fn;
    const payload = { content: '<@9>', embeds: [{ title: 'X' }], components: [{ type: 1 as const, components: [] }] };
    try { await postChannelMessage('tok', 'c1', payload); } finally { globalThis.fetch = orig; }
    const body = JSON.parse(calls[0].opts.body);
    expect(body.embeds[0].title).toBe('X');
    expect(body.components[0].type).toBe(1);
    expect(body.content).toBe('<@9>');
    expect(body.allowed_mentions).toEqual({ parse: [] });
  });
  it('allowMentions=true 時解析 users(個人通知 ping)', async () => {
    const { calls, fn } = mockFetch();
    const orig = globalThis.fetch; (globalThis as any).fetch = fn;
    try { await postChannelMessage('tok', 'c1', { content: '<@9>' }, true); } finally { globalThis.fetch = orig; }
    expect(JSON.parse(calls[0].opts.body).allowed_mentions).toEqual({ parse: ['users'] });
  });
  it('物件白名單 {users} → 只允許該使用者(guild 路由 @我)', async () => {
    const { calls, fn } = mockFetch();
    const orig = globalThis.fetch; (globalThis as any).fetch = fn;
    try { await postChannelMessage('tok', 'c1', { content: '<@9>' }, { users: ['9'] }); } finally { globalThis.fetch = orig; }
    expect(JSON.parse(calls[0].opts.body).allowed_mentions).toEqual({ users: ['9'] });
  });
  it('物件白名單 {roles} → 只允許該身分組(guild 路由 @身分組)', async () => {
    const { calls, fn } = mockFetch();
    const orig = globalThis.fetch; (globalThis as any).fetch = fn;
    try { await postChannelMessage('tok', 'c1', { content: '<@&r1>' }, { roles: ['r1'] }); } finally { globalThis.fetch = orig; }
    expect(JSON.parse(calls[0].opts.body).allowed_mentions).toEqual({ roles: ['r1'] });
  });
  it('非 2xx 時 throw', async () => {
    const orig = globalThis.fetch;
    (globalThis as any).fetch = async () => ({ ok: false, status: 500 });
    try { await expect(postChannelMessage('tok', 'c1', 'hi')).rejects.toThrow(); } finally { globalThis.fetch = orig; }
  });
});

describe('sendDm', () => {
  it('先開 DM 頻道、再對該頻道發訊息(字串)', async () => {
    const { calls, fn } = mockFetch();
    const orig = globalThis.fetch; (globalThis as any).fetch = fn;
    try { await sendDm('tok', '123', 'hi'); } finally { globalThis.fetch = orig; }
    expect(calls[0].url).toContain('/users/@me/channels');
    expect(JSON.parse(calls[0].opts.body).recipient_id).toBe('123');
    expect(calls[1].url).toContain('/channels/dm1/messages');
    expect(JSON.parse(calls[1].opts.body).content).toBe('hi');
    expect(JSON.parse(calls[1].opts.body).allowed_mentions).toEqual({ parse: [] });
  });
  it('物件 payload(embeds)也能私訊', async () => {
    const { calls, fn } = mockFetch();
    const orig = globalThis.fetch; (globalThis as any).fetch = fn;
    try { await sendDm('tok', '123', { embeds: [{ title: 'Y' }] }); } finally { globalThis.fetch = orig; }
    expect(JSON.parse(calls[1].opts.body).embeds[0].title).toBe('Y');
  });
  it('DM 關閉(post 403)時 throw', async () => {
    const orig = globalThis.fetch;
    (globalThis as any).fetch = async (url: string) =>
      url.includes('/users/@me/channels') ? { ok: true, status: 200, json: async () => ({ id: 'dm1' }) } : { ok: false, status: 403 };
    try { await expect(sendDm('tok', '123', 'hi')).rejects.toThrow(); } finally { globalThis.fetch = orig; }
  });
});
