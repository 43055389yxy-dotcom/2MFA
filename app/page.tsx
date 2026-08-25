'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';

type Mode = 'secret' | 'uri';
type Algorithm = 'SHA1' | 'SHA256' | 'SHA512';
const SAMPLE = { issuer: 'Example Corp', account: 'user@example.com', secret: 'JBSWY3DPEHPK3PXP' };

function cleanSecret(value: string) { return value.toUpperCase().replace(/[\s-]/g, ''); }
function decodeBase32(value: string) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const cleaned = cleanSecret(value).replace(/=+$/, '');
  let bits = '';
  for (const char of cleaned) {
    const index = alphabet.indexOf(char);
    if (index < 0) throw new Error('密钥包含无效字符');
    bits += index.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  return new Uint8Array(bytes);
}
async function generateTotp(secret: string, algorithm: Algorithm, digits: number, period: number) {
  const counter = Math.floor(Date.now() / 1000 / period);
  const data = new ArrayBuffer(8);
  new DataView(data).setUint32(4, counter, false);
  const key = await crypto.subtle.importKey('raw', decodeBase32(secret), { name: 'HMAC', hash: algorithm.replace('SHA', 'SHA-') }, false, ['sign']);
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, data));
  const offset = signature[signature.length - 1] & 0x0f;
  const number = (((signature[offset] & 0x7f) << 24) | ((signature[offset + 1] & 0xff) << 16) | ((signature[offset + 2] & 0xff) << 8) | (signature[offset + 3] & 0xff)) % 10 ** digits;
  return number.toString().padStart(digits, '0');
}
function buildUri(issuer: string, account: string, secret: string, algorithm: Algorithm, digits: number, period: number) {
  if (!issuer || !account || !secret) return '';
  const params = new URLSearchParams({ secret: cleanSecret(secret), issuer, algorithm, digits: String(digits), period: String(period) });
  return `otpauth://totp/${encodeURIComponent(`${issuer}:${account}`)}?${params.toString()}`;
}

export default function Home() {
  const [mode, setMode] = useState<Mode>('secret');
  const [issuer, setIssuer] = useState(SAMPLE.issuer);
  const [account, setAccount] = useState(SAMPLE.account);
  const [secret, setSecret] = useState(SAMPLE.secret);
  const [uriInput, setUriInput] = useState('');
  const [algorithm, setAlgorithm] = useState<Algorithm>('SHA1');
  const [digits, setDigits] = useState(6);
  const [period, setPeriod] = useState(30);
  const [otp, setOtp] = useState('------');
  const [seconds, setSeconds] = useState(30);
  const [qr, setQr] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');
  const uri = useMemo(() => buildUri(issuer.trim(), account.trim(), secret, algorithm, digits, period), [issuer, account, secret, algorithm, digits, period]);

  const refreshOtp = useCallback(async () => {
    if (!secret) return setOtp('------');
    try { setOtp(await generateTotp(secret, algorithm, digits, period)); setError(''); }
    catch (cause) { setOtp('------'); setError(cause instanceof Error ? cause.message : '无法读取此密钥'); }
  }, [secret, algorithm, digits, period]);

  useEffect(() => {
    refreshOtp();
    const timer = window.setInterval(() => { setSeconds(period - (Math.floor(Date.now() / 1000) % period)); refreshOtp(); }, 1000);
    return () => window.clearInterval(timer);
  }, [refreshOtp, period]);
  useEffect(() => {
    if (!uri) return setQr('');
    QRCode.toDataURL(uri, { width: 312, margin: 2, color: { dark: '#10233c', light: '#ffffff' }, errorCorrectionLevel: 'M' }).then(setQr).catch(() => setQr(''));
  }, [uri]);

  function parseUri() {
    try {
      const parsed = new URL(uriInput.trim());
      if (parsed.protocol !== 'otpauth:' || parsed.hostname !== 'totp') throw new Error('请输入 TOTP 类型的 otpauth:// 地址');
      const label = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
      const split = label.indexOf(':');
      const parsedSecret = parsed.searchParams.get('secret') || '';
      if (!parsedSecret) throw new Error('地址中缺少 secret 参数');
      setIssuer(parsed.searchParams.get('issuer') || (split > -1 ? label.slice(0, split) : ''));
      setAccount(split > -1 ? label.slice(split + 1) : label); setSecret(parsedSecret);
      const algo = parsed.searchParams.get('algorithm')?.toUpperCase();
      if (algo === 'SHA1' || algo === 'SHA256' || algo === 'SHA512') setAlgorithm(algo);
      setDigits(Number(parsed.searchParams.get('digits')) === 8 ? 8 : 6);
      const parsedPeriod = Number(parsed.searchParams.get('period')); setPeriod(parsedPeriod > 0 && parsedPeriod <= 120 ? parsedPeriod : 30);
      setMode('secret'); setError('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : '无法解析该地址'); }
  }
  async function copy(value: string, label: string) { await navigator.clipboard.writeText(value); setCopied(label); window.setTimeout(() => setCopied(''), 1600); }
  function clearAll() { setIssuer(''); setAccount(''); setSecret(''); setUriInput(''); setError(''); }
  const otpParts = otp.length === 6 ? [otp.slice(0, 3), otp.slice(3)] : [otp.slice(0, 4), otp.slice(4)];

  return <div className="app-shell">
    <header className="portal-header"><div className="brand-mark">IT</div><div className="brand-copy"><strong>ITMS</strong><span>企业 IT 服务门户</span></div><nav aria-label="主导航"><a href="#">服务目录</a><a href="#">我的请求</a><a href="#" className="active">安全工具</a></nav><div className="header-actions"><button className="icon-button" aria-label="帮助">?</button><div className="avatar">陈</div></div></header>
    <main>
      <div className="breadcrumb"><a href="#">首页</a><span>/</span><a href="#">安全工具</a><span>/</span><b>MFA 配置转换</b></div>
      <section className="hero"><div><div className="eyebrow"><span className="pulse-dot"/>本地安全工具</div><h1>MFA 配置转换</h1><p>将 MFA 密钥转换为标准认证配置和二维码，或解析已有的配置地址。</p></div><div className="privacy-pill"><span className="shield">✓</span><div><strong>仅在本机处理</strong><small>数据不会上传或保存</small></div></div></section>
      <section className="workspace" aria-label="MFA 转换工作区">
        <div className="form-side"><div className="tabs" role="tablist"><button className={mode === 'secret' ? 'selected' : ''} onClick={() => setMode('secret')} role="tab">密钥转配置</button><button className={mode === 'uri' ? 'selected' : ''} onClick={() => setMode('uri')} role="tab">解析配置地址</button></div>
          {mode === 'secret' ? <div className="form-content"><Title title="填写 MFA 信息" subtitle="输入由系统管理员或应用提供的认证信息"/><div className="field-row"><label>发行方 / 系统名称<input value={issuer} onChange={e => setIssuer(e.target.value)} placeholder="例如：Example Corp" autoComplete="off"/></label><label>账号标识<input value={account} onChange={e => setAccount(e.target.value)} placeholder="例如：name@company.com" autoComplete="off"/></label></div><label>MFA 密钥<div className="secret-input"><input value={secret} onChange={e => setSecret(cleanSecret(e.target.value))} placeholder="输入 Base32 密钥" spellCheck={false} autoComplete="off"/><span>Base32</span></div><small>支持空格或连字符，系统会自动规范化。</small></label><details><summary>高级设置 <span>适用于非标准配置</span></summary><div className="advanced-grid"><label>算法<select value={algorithm} onChange={e => setAlgorithm(e.target.value as Algorithm)}><option>SHA1</option><option>SHA256</option><option>SHA512</option></select></label><label>验证码位数<select value={digits} onChange={e => setDigits(Number(e.target.value))}><option value="6">6 位</option><option value="8">8 位</option></select></label><label>刷新周期<select value={period} onChange={e => setPeriod(Number(e.target.value))}><option value="30">30 秒</option><option value="60">60 秒</option></select></label></div></details></div> : <div className="form-content uri-mode"><Title title="粘贴配置地址" subtitle="支持符合 Key URI Format 的 TOTP 地址"/><label>otpauth:// 地址<textarea value={uriInput} onChange={e => setUriInput(e.target.value)} placeholder="otpauth://totp/发行方:账号?secret=..." rows={6} spellCheck={false}/></label><button className="primary wide" onClick={parseUri}>解析并生成配置</button></div>}
          {error && <div className="error" role="alert"><b>!</b>{error}</div>}<div className="form-footer"><button className="text-button" onClick={clearAll}>清空内容</button><span>符合 RFC 6238 TOTP 标准</span></div>
        </div>
        <aside className="result-side"><div className="result-heading"><Title title="认证配置" subtitle="使用认证器扫描或复制配置" number="2"/><span className="ready"><i/>已就绪</span></div><div className="qr-wrap">{qr ? <img src={qr} alt="MFA 配置二维码"/> : <div className="qr-empty">完善左侧信息<br/>以生成二维码</div>}<div className="scan-line"/></div><p className="scan-help">使用 Microsoft Authenticator、Google Authenticator<br/>或其他兼容认证器扫描</p><div className="otp-card"><div><span>当前验证码</span><b>{otpParts[0]} <em>{otpParts[1]}</em></b></div><button onClick={() => copy(otp.replaceAll('-', ''), '验证码')}>{copied === '验证码' ? '已复制' : '复制'}</button><div className="timer"><i style={{width:`${(seconds / period) * 100}%`}}/><span>{seconds} 秒后刷新</span></div></div><div className="config-list"><div><span>类型</span><b>TOTP</b></div><div><span>算法</span><b>{algorithm}</b></div><div><span>位数</span><b>{digits}</b></div><div><span>周期</span><b>{period} 秒</b></div></div><button className="primary" disabled={!uri} onClick={() => copy(uri, '配置地址')}>{copied === '配置地址' ? '配置地址已复制' : '复制配置地址'}</button><p className="result-note">请勿通过邮件或即时通讯工具发送密钥及配置地址</p></aside>
      </section>
      <section className="steps"><h2>使用说明</h2><div><article><b>01</b><span>填写或解析</span><p>输入密钥信息，或粘贴已有的配置地址。</p></article><article><b>02</b><span>确认验证码</span><p>在旧设备和此页面核对动态验证码。</p></article><article><b>03</b><span>扫码迁移</span><p>使用新认证器扫描二维码并完成验证。</p></article></div></section>
    </main>
    <footer><span>© 2026 ITMS · 企业信息技术服务</span><div><a href="#">安全规范</a><a href="#">使用帮助</a><a href="#">联系服务台</a></div></footer>
  </div>;
}

function Title({title, subtitle, number = '1'}:{title:string;subtitle:string;number?:string}) { return <div className="section-title"><span>{number}</span><div><h2>{title}</h2><p>{subtitle}</p></div></div>; }
