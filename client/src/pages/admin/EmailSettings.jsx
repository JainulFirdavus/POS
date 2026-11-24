import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Eye, Mail, Save, Send } from 'lucide-react';
import { Field, PageHeader, Toggle } from '../../components/ui';
import { useToast } from '../../context/ToastContext';
import { api, getToken } from '../../lib/api';
import { fmtDateTime, toInputDate, tz as browserTz } from '../../lib/dates';

const PRESETS = [
  { label: 'Gmail', host: 'smtp.gmail.com', port: 465, secure: true, hint: 'Use a Google “App password” (Google Account → Security → 2-Step Verification → App passwords), not your normal password.' },
  { label: 'Outlook / Microsoft 365', host: 'smtp.office365.com', port: 587, secure: false, hint: 'Your mailbox must allow “Authenticated SMTP”.' },
  { label: 'Yahoo', host: 'smtp.mail.yahoo.com', port: 465, secure: true, hint: 'Generate an app password in Yahoo account security.' },
];

const toForm = (c) => ({ ...c, recipients: (c.recipients ?? []).join(', '), pass: '' });

export default function EmailSettings() {
  const toast = useToast();
  const [cfg, setCfg] = useState(null);
  const [f, setF] = useState(null);
  const [busy, setBusy] = useState('');
  const [hint, setHint] = useState('');
  const [previewDate, setPreviewDate] = useState(toInputDate(new Date()));
  const [preview, setPreview] = useState('');

  useEffect(() => {
    api('/mail')
      .then((c) => {
        setCfg(c);
        setF(toForm(c));
      })
      .catch((e) => toast(e.message, 'error'));
  }, [toast]);

  if (!f) return <PageHeader title="Daily Email Report" subtitle="Loading..." />;
  const set = (k) => (e) => setF({ ...f, [k]: e?.target ? e.target.value : e });

  const save = async (e) => {
    e?.preventDefault();
    setBusy('save');
    try {
      const body = { enabled: f.enabled, host: f.host, port: Number(f.port), secure: f.secure, user: f.user, from: f.from, recipients: f.recipients, sendTime: f.sendTime, timezone: f.timezone };
      if (f.pass) body.pass = f.pass;
      const c = await api('/mail', { method: 'PUT', body });
      setCfg(c);
      setF(toForm(c));
      toast('Email settings saved', 'success');
      return true;
    } catch (err) {
      toast(err.message, 'error');
      return false;
    } finally {
      setBusy('');
    }
  };

  const sendNow = async () => {
    if (!(await save())) return;
    setBusy('test');
    try {
      const r = await api('/mail/test', { method: 'POST', body: { date: previewDate } });
      toast(`Report for ${r.date} sent to ${r.sentTo.join(', ')}`, 'success');
      setCfg(await api('/mail'));
    } catch (err) {
      toast(err.message, 'error');
      setCfg(await api('/mail').catch(() => cfg));
    } finally {
      setBusy('');
    }
  };

  const showPreview = async () => {
    setBusy('preview');
    try {
      const res = await fetch(`/api/mail/preview?date=${previewDate}`, { headers: { Authorization: `Bearer ${getToken()}` } });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || 'Preview failed');
      setPreview(await res.text());
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy('');
    }
  };

  return (
    <>
      <PageHeader title="Daily Email Report" subtitle="Email the day’s sales, category, hourly and cash-drawer statistics to the admin automatically" />
      <form onSubmit={save} className="grid max-w-5xl gap-6 lg:grid-cols-[1fr_320px]">
        <div className="card grid grid-cols-2 gap-5 p-6">
          <div className="col-span-2 flex items-center justify-between gap-4">
            <div>
              <div className="font-semibold">Send the report every day</div>
              <div className="text-sm text-slate-400">If this computer is off at the send time, yesterday’s report is sent when the app next starts.</div>
            </div>
            <Toggle checked={!!f.enabled} onChange={set('enabled')} label={f.enabled ? 'On' : 'Off'} />
          </div>

          <Field label="Send to (admin emails, comma separated)" className="col-span-2">
            <input className="input" placeholder="owner@example.com, manager@example.com" value={f.recipients} onChange={set('recipients')} />
          </Field>
          <Field label="Send time"><input className="input" type="time" value={f.sendTime} onChange={set('sendTime')} /></Field>
          <Field label="Timezone">
            <div className="flex gap-2">
              <input className="input" value={f.timezone} onChange={set('timezone')} />
              {f.timezone !== browserTz && <button type="button" className="btn btn-ghost shrink-0 px-3 text-xs" onClick={() => setF({ ...f, timezone: browserTz })}>Use {browserTz}</button>}
            </div>
          </Field>

          <div className="col-span-2 border-t border-white/10 pt-5">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold">Outgoing mail server (SMTP)</span>
              {PRESETS.map((p) => (
                <button key={p.label} type="button" className="btn btn-ghost px-3 py-1 text-xs" onClick={() => { setF({ ...f, host: p.host, port: p.port, secure: p.secure }); setHint(p.hint); }}>{p.label}</button>
              ))}
            </div>
            {hint && <p className="mb-3 rounded-lg bg-indigo-500/10 p-3 text-xs text-indigo-200">{hint}</p>}
          </div>
          <Field label="SMTP server"><input className="input" placeholder="smtp.gmail.com" value={f.host} onChange={set('host')} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Port"><input className="input" type="number" value={f.port} onChange={set('port')} /></Field>
            <Field label="SSL/TLS"><div className="pt-2"><Toggle checked={!!f.secure} onChange={set('secure')} label={f.secure ? 'SSL (465)' : 'STARTTLS'} /></div></Field>
          </div>
          <Field label="Username / email"><input className="input" autoComplete="off" value={f.user} onChange={set('user')} /></Field>
          <Field label={cfg.hasPassword ? 'Password (saved, leave blank to keep)' : 'Password / app password'}>
            <input className="input" type="password" autoComplete="new-password" placeholder={cfg.hasPassword ? '••••••••' : ''} value={f.pass} onChange={set('pass')} />
          </Field>
          <Field label="From address (optional)" className="col-span-2"><input className="input" placeholder={`Smart POS <${f.user || 'you@example.com'}>`} value={f.from} onChange={set('from')} /></Field>

          <div className="col-span-2 flex justify-end">
            <button className="btn btn-primary" disabled={!!busy}><Save size={16} /> {busy === 'save' ? 'Saving...' : 'Save'}</button>
          </div>
        </div>

        <div className="space-y-4">
          <div className="card p-5">
            <h3 className="mb-3 flex items-center gap-2 font-semibold"><Mail size={18} /> Status</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-slate-400">Automatic email</span><span className={cfg.enabled ? 'text-emerald-400' : 'text-slate-400'}>{cfg.enabled ? `On, daily at ${cfg.sendTime}` : 'Off'}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">Last report</span><span>{cfg.lastSentDate || '—'}</span></div>
              {cfg.lastSentAt && <div className="flex justify-between"><span className="text-slate-400">Sent at</span><span>{fmtDateTime(cfg.lastSentAt)}</span></div>}
            </div>
            {cfg.lastError ? (
              <div className="mt-3 flex gap-2 rounded-lg bg-rose-500/10 p-3 text-xs text-rose-300"><AlertTriangle size={16} className="shrink-0" /> {cfg.lastError}</div>
            ) : cfg.lastSentDate ? (
              <div className="mt-3 flex gap-2 rounded-lg bg-emerald-500/10 p-3 text-xs text-emerald-300"><CheckCircle2 size={16} className="shrink-0" /> Working</div>
            ) : null}
          </div>
          <div className="card space-y-3 p-5">
            <h3 className="font-semibold">Try it</h3>
            <Field label="Report date"><input type="date" className="input" value={previewDate} max={toInputDate(new Date())} onChange={(e) => e.target.value && setPreviewDate(e.target.value)} /></Field>
            <button type="button" className="btn btn-ghost w-full" disabled={!!busy} onClick={showPreview}><Eye size={16} /> {busy === 'preview' ? 'Loading...' : 'Preview report'}</button>
            <button type="button" className="btn btn-success w-full" disabled={!!busy || !f.host || !f.recipients} onClick={sendNow}><Send size={16} /> {busy === 'test' ? 'Sending...' : 'Send now'}</button>
          </div>
        </div>
      </form>

      {preview && (
        <div className="card mt-6 max-w-5xl overflow-hidden">
          <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
            <span className="font-semibold">Email preview · {previewDate}</span>
            <button className="btn btn-ghost px-3 py-1 text-xs" onClick={() => setPreview('')}>Close</button>
          </div>
          <iframe title="Email preview" sandbox="" srcDoc={preview} className="h-[900px] w-full bg-slate-100" />
        </div>
      )}
    </>
  );
}
