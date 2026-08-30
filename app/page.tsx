'use client';

import { useCallback, useEffect, useState } from 'react';

type HistoryItem = { secret: string; lastUsed: number; note: string };
const STORAGE_KEY = 'itms-mfa-history-v1';
const PERIOD = 30;

function persistHistory(items: HistoryItem[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function cleanSecret(value: string) {
  return value.toUpperCase().replace(/[^A-Z2-7]/g, '');
}

function decodeBase32(value: string) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const char of value) {
    const index = alphabet.indexOf(char);
    if (index < 0) throw new Error('密钥格式不正确');
    bits += index.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) {
    bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  }
  return new Uint8Array(bytes);
}

async function generateTotp(secret: string) {
  if (secret.length < 16) throw new Error('请输入完整的 MFA 密钥');
  const counter = Math.floor(Date.now() / 1000 / PERIOD);
  const data = new ArrayBuffer(8);
  new DataView(data).setUint32(4, counter, false);
  const key = await crypto.subtle.importKey(
    'raw',
    decodeBase32(secret),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  );
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, data));
  const offset = signature[signature.length - 1] & 0x0f;
  const number = (((signature[offset] & 0x7f) << 24) |
    ((signature[offset + 1] & 0xff) << 16) |
    ((signature[offset + 2] & 0xff) << 8) |
    (signature[offset + 3] & 0xff)) % 1_000_000;
  return number.toString().padStart(6, '0');
}

function maskSecret(secret: string) {
  if (secret.length <= 16) return `${secret.slice(0, 4)}••••${secret.slice(-4)}`;
  return `${secret.slice(0, 8)}••••••${secret.slice(-6)}`;
}

function formatTime(timestamp: number) {
  const elapsed = Date.now() - timestamp;
  if (elapsed < 60_000) return '刚刚使用';
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)} 分钟前`;
  if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)} 小时前`;
  return new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric' }).format(timestamp);
}

export default function Home() {
  const [secret, setSecret] = useState('');
  const [otp, setOtp] = useState('');
  const [seconds, setSeconds] = useState(PERIOD);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      if (Array.isArray(stored)) {
        // 历史记录来自浏览器持久化存储，需要在客户端挂载后同步一次。
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setHistory(stored.flatMap((item) => {
          if (!item || typeof item.secret !== 'string' || typeof item.lastUsed !== 'number') return [];
          return [{ secret: item.secret, lastUsed: item.lastUsed, note: typeof item.note === 'string' ? item.note : '' }];
        }));
      }
    } catch {
      // 保留原始数据，避免一次异常解析导致历史记录被删除。
    }
  }, []);

  const refresh = useCallback(async () => {
    setSeconds(PERIOD - (Math.floor(Date.now() / 1000) % PERIOD));
    if (!secret) { setOtp(''); setError(''); return; }
    try { setOtp(await generateTotp(secret)); setError(''); }
    catch (cause) { setOtp(''); setError(cause instanceof Error ? cause.message : '无法生成验证码'); }
  }, [secret]);

  useEffect(() => {
    const initialTimer = window.setTimeout(refresh, 0);
    const timer = window.setInterval(refresh, 1000);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
    };
  }, [refresh]);

  function saveToHistory(value = secret) {
    if (!otp || value.length < 16) return;
    setHistory((current) => {
      const existing = current.find((item) => item.secret === value);
      const next = [{ secret: value, lastUsed: Date.now(), note: existing?.note || '' }, ...current.filter((item) => item.secret !== value)];
      persistHistory(next);
      return next;
    });
  }

  async function copyOtp() {
    if (!otp) return;
    await navigator.clipboard.writeText(otp);
    saveToHistory();
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  function selectHistory(item: HistoryItem) {
    setSecret(item.secret);
    setHistory((current) => {
      const next = [{ ...item, lastUsed: Date.now() }, ...current.filter((entry) => entry.secret !== item.secret)];
      persistHistory(next);
      return next;
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function updateNote(secretValue: string, note: string) {
    setHistory((current) => {
      const next = current.map((entry) => entry.secret === secretValue ? { ...entry, note } : entry);
      persistHistory(next);
      return next;
    });
  }

  const progress = `${(seconds / PERIOD) * 360}deg`;
  const otpParts = otp ? [otp.slice(0, 3), otp.slice(3)] : ['— — —', '— — —'];

  return (
    <main className="mfa-app">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <header className="topbar">
        <div className="product-mark"><span className="mark-core" />MFA<span>CORE</span></div>
        <div className="local-state"><i />本地安全运行</div>
      </header>

      <section className="generator">
        <div className="intro">
          <div className="kicker"><span>SECURE TOKEN GENERATOR</span></div>
          <h1>MFA 动态验证码</h1>
          <p>粘贴密钥，即刻生成验证码</p>
        </div>

        <div className={`secret-field ${error ? 'has-error' : ''} ${otp ? 'is-valid' : ''}`}>
          <label htmlFor="mfa-secret">MFA 密钥</label>
          <div className="input-line">
            <span className="key-symbol">⌁</span>
            <input
              id="mfa-secret"
              value={secret}
              onChange={(event) => setSecret(cleanSecret(event.target.value))}
              onBlur={() => saveToHistory()}
              onKeyDown={(event) => { if (event.key === 'Enter') copyOtp(); }}
              placeholder="输入或粘贴 Base32 密钥"
              autoComplete="off"
              autoFocus
              spellCheck={false}
              aria-describedby="field-message"
            />
            {secret && <button className="clear-input" onClick={() => setSecret('')} aria-label="清空密钥">×</button>}
          </div>
          <div id="field-message" className="field-message">
            {error ? <span className="error-text">{error}</span> : <span><i />数据仅在当前设备处理</span>}
            <b>{secret.length || 0} 字符</b>
          </div>
        </div>

        <button className={`otp-display ${otp ? 'ready' : ''}`} onClick={copyOtp} disabled={!otp} aria-label={otp ? `验证码 ${otp}，点击复制` : '等待输入 MFA 密钥'}>
          <div className="code-label"><span>{copied ? 'COPIED TO CLIPBOARD' : 'CURRENT ACCESS CODE'}</span><i className="live-dot" /></div>
          <div className="code"><span>{otpParts[0]}</span><span>{otpParts[1]}</span></div>
          <div className="code-footer">
            <div className="countdown" style={{ '--progress': progress } as React.CSSProperties}><span>{seconds}</span></div>
            <span>{copied ? '已复制到剪贴板' : otp ? '点击验证码即可复制' : '输入密钥后自动生成'}</span>
          </div>
          <div className="sweep" />
        </button>
      </section>

      <section className="history-section">
        <div className="history-heading"><div><span className="history-icon">↻</span><div><h2>历史 MFA</h2><p>长期保存在此设备，可添加客户或账号备注</p></div></div>{history.length > 0 && <span className="history-count">{history.length} 条记录</span>}</div>
        {history.length === 0 ? (
          <div className="empty-history"><span>◇</span><p>使用过的 MFA 密钥会显示在这里</p></div>
        ) : (
          <div className="history-list">
            {history.map((item, index) => (
              <article className={item.secret === secret ? 'history-item active' : 'history-item'} key={item.secret}>
                <button className="history-main" onClick={() => selectHistory(item)} aria-label={`再次使用 ${item.note || maskSecret(item.secret)}`}>
                  <span className="item-index">{String(index + 1).padStart(2, '0')}</span>
                  <span className="item-copy"><b>{maskSecret(item.secret)}</b><small>{formatTime(item.lastUsed)}</small></span>
                  <span className="reuse">使用 <b>→</b></span>
                </button>
                <label className="note-field">
                  <span>备注</span>
                  <input
                    value={item.note}
                    onChange={(event) => updateNote(item.secret, event.target.value)}
                    placeholder="填写客户名称或账号 ID"
                    maxLength={80}
                    aria-label={`${maskSecret(item.secret)} 的备注`}
                  />
                  <i>{item.note ? '已保存' : '自动保存'}</i>
                </label>
              </article>
            ))}
          </div>
        )}
      </section>

      <footer><span>ITMS SECURITY LAB</span><span>RFC 6238 · SHA-1 · 30 SEC</span></footer>
    </main>
  );
}
