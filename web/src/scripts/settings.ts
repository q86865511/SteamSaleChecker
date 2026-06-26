import { initTheme, setTheme, storeTheme, storedThemeChoice } from './theme';
import { resolveTheme, type Theme, type ViewMode } from './view';
import { getLang, dict, applyI18n } from './i18n';
import { getMe, discordBotInviteUrl } from './wishlist';
import {
  getNotifPrefs, putNotifPrefs,
  getConnectedGuilds, getGuildChannels, getGuildRoles, sendTestNotification, disconnectGuild,
} from './notif';
import type { NotifPrefs, NotifDelivery, MentionMode } from '@ssc/shared';

// 以 createElement 注入選項(textContent,避免伺服器/頻道/身分組名稱含特殊字元的跳脫問題)。
function fillSelect(el: HTMLSelectElement, opts: { value: string; label: string }[]): void {
  el.replaceChildren(...opts.map(o => { const op = document.createElement('option'); op.value = o.value; op.textContent = o.label; return op; }));
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

// 單選 radiogroup:標記選中(aria-checked + roving tabindex);.on 供樣式。
function markRadio(groupId: string, attr: string, value: string): void {
  document.querySelectorAll<HTMLButtonElement>(`#${groupId} .seg-btn`).forEach(b => {
    const on = b.getAttribute(attr) === value;
    b.classList.toggle('on', on);
    b.setAttribute('aria-checked', String(on));
    b.tabIndex = on ? 0 : -1;
  });
}

// 接上點擊 + 方向鍵(WAI-ARIA radiogroup);選擇時呼叫 onChoose(value)。
function wireRadioGroup(groupId: string, attr: string, onChoose: (value: string) => void): void {
  const group = document.getElementById(groupId);
  if (!group) return;
  const choose = (b: HTMLButtonElement | null): void => { if (b) onChoose(b.getAttribute(attr) ?? ''); };
  group.addEventListener('click', (e) => choose((e.target as HTMLElement).closest<HTMLButtonElement>('.seg-btn')));
  group.addEventListener('keydown', (e) => {
    const list = [...group.querySelectorAll<HTMLButtonElement>('.seg-btn')];
    const i = list.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0) return;
    let j = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') j = (i + 1) % list.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') j = (i - 1 + list.length) % list.length;
    else if (e.key === 'Home') j = 0;
    else if (e.key === 'End') j = list.length - 1;
    if (j < 0) return;
    e.preventDefault();
    list[j].focus();
    choose(list[j]);
  });
}

export function bootSettings(): void {
  initTheme();
  const lang = getLang();
  document.documentElement.lang = lang;
  applyI18n(dict());

  markRadio('theme-seg', 'data-theme-choice', storedThemeChoice());
  markRadio('lang-seg', 'data-lang-choice', lang);
  markRadio('view-seg', 'data-view-choice', localStorage.getItem('ssc-view') === 'card' ? 'card' : 'list');

  wireRadioGroup('theme-seg', 'data-theme-choice', (choice) => {
    const c = choice as Theme | 'system';
    storeTheme(c);
    setTheme(c === 'system'
      ? resolveTheme(null, window.matchMedia('(prefers-color-scheme: dark)').matches)
      : c);
    markRadio('theme-seg', 'data-theme-choice', c);
  });

  wireRadioGroup('lang-seg', 'data-lang-choice', (choice) => {
    if (choice !== lang) { localStorage.setItem('ssc-lang', choice); location.reload(); }
  });

  wireRadioGroup('view-seg', 'data-view-choice', (choice) => {
    localStorage.setItem('ssc-view', choice); // 套用於特價頁
    markRadio('view-seg', 'data-view-choice', choice);
  });

  void bootNotifPrefs();
}

// 通知偏好(登入才顯示):讀回 → 還原各 radiogroup/類型多選 → 改動即 PUT。
async function bootNotifPrefs(): Promise<void> {
  const me = await getMe();
  const hint = document.getElementById('notif-login-hint');
  const section = document.getElementById('notif-section');
  if (!me) { if (hint) hint.hidden = false; return; }
  const prefs = await getNotifPrefs();
  if (!prefs || !section) { if (hint) hint.hidden = false; return; }
  section.hidden = false;

  markRadio('notif-drop-seg', 'data-drop-choice', prefs.dropEnabled ? 'on' : 'off');
  markRadio('notif-free-seg', 'data-free-choice', prefs.freeEnabled ? 'on' : 'off');
  markRadio('notif-digest-seg', 'data-digest-choice', String(prefs.digestHours));
  markRadio('notif-delivery-seg', 'data-delivery-choice', prefs.delivery);

  wireRadioGroup('notif-drop-seg', 'data-drop-choice', (v) => {
    markRadio('notif-drop-seg', 'data-drop-choice', v); void putNotifPrefs({ dropEnabled: v === 'on' });
  });
  wireRadioGroup('notif-free-seg', 'data-free-choice', (v) => {
    markRadio('notif-free-seg', 'data-free-choice', v); void putNotifPrefs({ freeEnabled: v === 'on' });
  });
  wireRadioGroup('notif-digest-seg', 'data-digest-choice', (v) => {
    markRadio('notif-digest-seg', 'data-digest-choice', v); void putNotifPrefs({ digestHours: Number(v) });
  });
  wireRadioGroup('notif-delivery-seg', 'data-delivery-choice', (v) => {
    // 「我的伺服器」未設妥前停用:避免送出會被後端以 guild_incomplete 退回的 delivery。
    if (v === 'guild' && (document.getElementById('delivery-guild-btn') as HTMLButtonElement | null)?.disabled) return;
    markRadio('notif-delivery-seg', 'data-delivery-choice', v); void putNotifPrefs({ delivery: v as NotifDelivery });
  });

  // 類型多選(由 genres.json 動態產生;空=不限)
  const host = document.getElementById('notif-genres');
  if (host) {
    let genres: string[] = [];
    try { const r = await fetch('/data/genres.json'); if (r.ok) genres = await r.json(); } catch { /* ignore */ }
    const selected = new Set(prefs.genres);
    host.innerHTML = genres.map(g =>
      `<button class="genre-btn${selected.has(g) ? ' on' : ''}" type="button" aria-pressed="${selected.has(g)}" data-genre="${esc(g)}">${esc(g)}</button>`).join('');
    host.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('.genre-btn');
      if (!b) return;
      const g = b.dataset.genre as string;
      if (selected.has(g)) selected.delete(g); else selected.add(g);
      b.classList.toggle('on', selected.has(g));
      b.setAttribute('aria-pressed', String(selected.has(g)));
      void putNotifPrefs({ genres: [...selected] });
    });
  }

  void bootServerNotif(prefs);
}

// Discord 伺服器通知:邀請機器人 → 選伺服器/頻道(統一或分流)→ 提及方式 → 測試/移除。
// 所有變更走 optimistic PUT(無 Save 鈕);切伺服器會重置該伺服器專屬的頻道/身分組選擇。
async function bootServerNotif(prefsIn: NotifPrefs): Promise<void> {
  const section = document.getElementById('discord-server-section');
  if (!section) return;
  let prefs = prefsIn;
  const t = dict();
  const $ = (id: string): HTMLElement | null => document.getElementById(id);
  const sel = (id: string): HTMLSelectElement => document.getElementById(id) as HTMLSelectElement;

  const inviteUrl = discordBotInviteUrl();
  ($('srv-invite-btn') as HTMLAnchorElement | null)?.setAttribute('href', inviteUrl);
  ($('srv-add-another') as HTMLAnchorElement | null)?.setAttribute('href', inviteUrl);
  // 邀請回跳後清掉 ?bot=… query,避免重整重複觸發
  if (new URLSearchParams(location.search).get('bot')) history.replaceState({}, '', location.pathname);
  section.hidden = false;

  const inviteRow = $('srv-invite-row');
  const connectedRows = ['srv-guild-row', 'srv-channel-row', 'srv-split-row', 'srv-mention-row', 'srv-actions-row'].map($);
  const guildBtn = $('delivery-guild-btn') as HTMLButtonElement | null;
  const statusEl = $('srv-status');
  const setStatus = (state: 'none' | 'connected', text: string): void => {
    if (statusEl) { statusEl.textContent = text; statusEl.dataset.srvState = state; }
  };

  const guilds = await getConnectedGuilds();
  if (guilds.length === 0) {
    if (inviteRow) inviteRow.hidden = false;
    connectedRows.forEach(r => { if (r) r.hidden = true; });
    if (guildBtn) guildBtn.disabled = true;
    setStatus('none', t.srvStatusNone);
    return;
  }
  if (inviteRow) inviteRow.hidden = true;
  connectedRows.forEach(r => { if (r) r.hidden = false; });

  const guildSelect = sel('srv-guild-select');
  const defChan = sel('srv-channel-select');
  const dDrop = sel('srv-channel-drop'), dFree = sel('srv-channel-free'), dDigest = sel('srv-channel-digest');
  const roleSel = sel('srv-role-select');
  const splitBody = $('srv-split-body'), roleRow = $('srv-role-row');
  let curChannels: { id: string; name: string }[] = [];

  fillSelect(guildSelect, guilds.map(g => ({ value: g.guildId, label: g.guildName ?? g.guildId })));
  let active = prefs.guild.guildId && guilds.some(g => g.guildId === prefs.guild.guildId) ? prefs.guild.guildId : guilds[0].guildId;
  guildSelect.value = active;
  if (active !== prefs.guild.guildId) {
    // 新邀請或舊選擇已失效:設為 active 並重置該伺服器專屬欄位
    await putNotifPrefs({ guild: { guildId: active, channelId: null, channels: { drop: null, free: null, digest: null }, mention: { mode: 'none', roleId: null } } });
    const fresh = await getNotifPrefs(); if (fresh) prefs = fresh;
  }

  const perTypePut = (): Promise<boolean> =>
    putNotifPrefs({ guild: { channels: { drop: dDrop.value || null, free: dFree.value || null, digest: dDigest.value || null } } });

  function refreshStatus(): void {
    if (guildBtn) guildBtn.disabled = !defChan.value; // 沒選統一頻道前不能用「我的伺服器」delivery
    const gname = guildSelect.selectedOptions[0]?.textContent ?? '';
    const split = $('srv-split-seg')?.querySelector('.seg-btn.on')?.getAttribute('data-split-choice') === 'split';
    if (split) { setStatus('connected', t.srvStatusConnectedSplit.replace('{server}', gname)); return; }
    const ch = curChannels.find(c => c.id === defChan.value);
    setStatus('connected', t.srvStatusConnected.replace('{server}', gname).replace('{channel}', ch ? '#' + ch.name : '—'));
  }

  async function populateForGuild(guildId: string): Promise<void> {
    const [channels, roles] = await Promise.all([getGuildChannels(guildId), getGuildRoles(guildId)]);
    curChannels = channels;
    const chanOpts = channels.map(c => ({ value: c.id, label: '#' + c.name }));
    fillSelect(defChan, [{ value: '', label: t.srvChannelPick }, ...chanOpts]);
    defChan.value = prefs.guild.channelId ?? '';
    const perTypeOpts = [{ value: '', label: t.srvChannelDefaultOpt }, ...chanOpts];
    fillSelect(dDrop, perTypeOpts); dDrop.value = prefs.guild.channels.drop ?? '';
    fillSelect(dFree, perTypeOpts); dFree.value = prefs.guild.channels.free ?? '';
    fillSelect(dDigest, perTypeOpts); dDigest.value = prefs.guild.channels.digest ?? '';
    fillSelect(roleSel, [{ value: '', label: t.srvRolePick }, ...roles.map(r => ({ value: r.id, label: '@' + r.name }))]);
    roleSel.value = prefs.guild.mention.roleId ?? '';

    const isSplit = !!(prefs.guild.channels.drop || prefs.guild.channels.free || prefs.guild.channels.digest);
    markRadio('srv-split-seg', 'data-split-choice', isSplit ? 'split' : 'unified');
    if (splitBody) splitBody.hidden = !isSplit;
    markRadio('srv-mention-seg', 'data-mention-choice', prefs.guild.mention.mode);
    if (roleRow) roleRow.hidden = prefs.guild.mention.mode !== 'role';
    refreshStatus();
  }

  await populateForGuild(active);

  // --- 事件(只接一次;切伺服器只重填選項,監聽器仍在同一批元素上)---
  guildSelect.addEventListener('change', async () => {
    active = guildSelect.value;
    await putNotifPrefs({ guild: { guildId: active, channelId: null, channels: { drop: null, free: null, digest: null }, mention: { mode: 'none', roleId: null } } });
    const fresh = await getNotifPrefs(); if (fresh) prefs = fresh;
    await populateForGuild(active);
  });
  defChan.addEventListener('change', async () => { await putNotifPrefs({ guild: { channelId: defChan.value || null } }); refreshStatus(); });
  [dDrop, dFree, dDigest].forEach(s => s.addEventListener('change', async () => { await perTypePut(); refreshStatus(); }));
  wireRadioGroup('srv-split-seg', 'data-split-choice', async (v) => {
    markRadio('srv-split-seg', 'data-split-choice', v);
    const split = v === 'split';
    if (splitBody) splitBody.hidden = !split;
    if (split) await perTypePut(); else await putNotifPrefs({ guild: { channels: { drop: null, free: null, digest: null } } });
    refreshStatus();
  });
  wireRadioGroup('srv-mention-seg', 'data-mention-choice', (v) => {
    markRadio('srv-mention-seg', 'data-mention-choice', v);
    if (roleRow) roleRow.hidden = v !== 'role';
    void putNotifPrefs({ guild: { mention: { mode: v as MentionMode, roleId: v === 'role' ? (roleSel.value || null) : null } } });
  });
  roleSel.addEventListener('change', () => { void putNotifPrefs({ guild: { mention: { mode: 'role', roleId: roleSel.value || null } } }); });

  const testBtn = $('srv-test-btn') as HTMLButtonElement | null;
  const actionMsg = $('srv-action-msg');
  testBtn?.addEventListener('click', async () => {
    if (!actionMsg) return;
    testBtn.disabled = true; actionMsg.textContent = t.srvTestSending;
    const r = await sendTestNotification();
    actionMsg.textContent = r.ok ? t.srvTestOk
      : r.reason === 'forbidden' ? t.srvTestForbidden
        : r.reason === 'no_channel' ? t.srvTestNoChannel : t.srvTestFail;
    testBtn.disabled = false;
  });
  $('srv-remove-btn')?.addEventListener('click', async () => {
    if (!confirm(t.srvRemoveConfirm)) return;
    await disconnectGuild(guildSelect.value);
    location.reload(); // 移除後重讀狀態(回未連線或剩餘伺服器)
  });
}
