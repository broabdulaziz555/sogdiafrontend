'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Eye, EyeOff, MailCheck } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select } from '@/components/ui/Primitives';
import { useAuthActions } from '@/hooks/useAuth';
import { ApiError, errMsg } from '@/lib/api';
import { ROOT_DOMAIN, siteHref } from '@/lib/sites';
import { cn } from '@/lib/cn';

/** Only follow `next` to relative paths or to *.<root-domain> — never to arbitrary hosts (open-redirect guard). */
function safeNext(next: string | null): string | null {
  if (!next) return null;
  try {
    const u = new URL(next, window.location.origin);
    const sameOrigin = u.origin === window.location.origin;
    const sub = u.hostname === ROOT_DOMAIN || u.hostname.endsWith(`.${ROOT_DOMAIN}`);
    if (sameOrigin || sub) return u.toString();
  } catch { /* ignore */ }
  return null;
}

function PasswordInput({ value, onChange, invalid, id, autoComplete }: { value: string; onChange: (v: string) => void; invalid?: boolean; id: string; autoComplete: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input id={id} type={show ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)} invalid={invalid} autoComplete={autoComplete} className="pr-10" />
      <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'} className="absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded text-subtle hover:text-fg">
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

function strength(p: string): number {
  let s = 0;
  if (p.length >= 8) s++;
  if (/[a-z]/i.test(p) && /\d/.test(p)) s++;
  if (/[A-Z]/.test(p) && /[a-z]/.test(p)) s++;
  if (/[^A-Za-z0-9]/.test(p) || p.length >= 12) s++;
  return s;
}

/* ── Login ──────────────────────────────────────────────────────────── */
function LoginInner() {
  const t = useTranslations('auth');
  const c = useTranslations('common');
  const params = useSearchParams();
  const { login } = useAuthActions();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  const emailOk = /^\S+@\S+\.\S+$/.test(email);
  const next = params.get('next');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    setError(null);
    if (!emailOk || !password) return;
    setBusy(true);
    try {
      await login(email.trim(), password);
      window.location.href = safeNext(next) ?? siteHref('app', '/');
    } catch (err) {
      setError(err instanceof ApiError && err.code === 'UNAUTHORIZED' ? 'Incorrect email or password.' : errMsg(err));
      setBusy(false);
    }
  };

  return (
    <div className="animate-fade-up">
      <h1 className="text-3xl font-bold tracking-tight">{t('loginTitle')}</h1>
      <p className="mt-2 text-sm text-muted">{t('loginSubtitle')}</p>

      <form onSubmit={submit} noValidate className="mt-8 space-y-4">
        <Field label={c('email')} htmlFor="email" error={touched && !emailOk ? t('errors.email') : null}>
          <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} invalid={touched && !emailOk} autoFocus />
        </Field>
        <Field label={c('password')} htmlFor="password" error={touched && !password ? t('errors.required') : null}>
          <PasswordInput id="password" autoComplete="current-password" value={password} onChange={setPassword} invalid={touched && !password} />
        </Field>

        {error && <p role="alert" className="rounded-md border border-down/30 bg-down/10 px-3 py-2 text-sm text-down">{error}</p>}

        <Button type="submit" variant="primary" size="lg" block loading={busy}>{t('submitLogin')}</Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted">
        {t('noAccount')}{' '}
        <Link href={`/register${next ? `?next=${encodeURIComponent(next)}` : ''}`} className="font-medium text-accent hover:underline">{c('signUp')}</Link>
      </p>
    </div>
  );
}

export function LoginForm() {
  return <Suspense><LoginInner /></Suspense>;
}

/* ── Register ───────────────────────────────────────────────────────── */
const COUNTRY_CODES = 'AE AF AL AM AR AT AU AZ BA BD BE BG BH BR BY CA CH CL CN CO CY CZ DE DK DZ EC EE EG ES FI FR GB GE GR HK HR HU ID IE IL IN IQ IR IS IT JO JP KE KG KR KW KZ LB LK LT LU LV MA MD ME MK MX MY NG NL NO NZ OM PE PH PK PL PT QA RO RS RU SA SE SG SI SK TH TJ TN TR TW UA UG US UY UZ VE VN ZA'.split(' ');

function RegisterInner() {
  const t = useTranslations('auth');
  const c = useTranslations('common');
  const params = useSearchParams();
  const router = useRouter();
  const { register, login } = useAuthActions();

  const [form, setForm] = useState({ email: '', password: '', full_name: '', country: '', referral_code: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState<string | null>(null);

  useEffect(() => {
    const ref = params.get('ref');
    if (ref) setForm((f) => ({ ...f, referral_code: ref.toUpperCase() }));
  }, [params]);

  const countries = useMemo(() => {
    let dn: Intl.DisplayNames | null = null;
    try { dn = new Intl.DisplayNames(['en'], { type: 'region' }); } catch { /* old browsers */ }
    return COUNTRY_CODES.map((code) => ({ code, name: dn?.of(code) ?? code })).sort((a, b) => a.name.localeCompare(b.name));
  }, []);

  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const emailOk = /^\S+@\S+\.\S+$/.test(form.email);
  const pwLen = form.password.length >= 8 && form.password.length <= 16;
  const pwMix = /[A-Za-z]/.test(form.password) && /\d/.test(form.password);
  const pwErr = touched ? (!pwLen ? t('errors.passwordLen') : !pwMix ? t('errors.passwordMix') : null) : null;
  const score = strength(form.password);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    setError(null);
    if (!emailOk || !pwLen || !pwMix) return;
    setBusy(true);
    try {
      const res = await register({
        email: form.email.trim(),
        password: form.password,
        ...(form.full_name.trim() && { full_name: form.full_name.trim() }),
        ...(form.country && { country: form.country }),
        ...(form.referral_code.trim() && { referral_code: form.referral_code.trim() }),
      });
      if (res.email_confirmation_required || !res.session) {
        setConfirmEmail(form.email.trim());
        setBusy(false);
        return;
      }
      const next = safeNext(params.get('next'));
      window.location.href = next ?? siteHref('app', '/');
    } catch (err) {
      if (err instanceof ApiError && err.code === 'DUPLICATE') {
        setError('An account with this email already exists. Try signing in instead.');
      } else if (err instanceof ApiError && err.code === 'VALIDATION_ERROR') {
        setError(typeof err.message === 'string' ? err.message : 'Please check the form and try again.');
      } else setError(errMsg(err));
      setBusy(false);
    }
  };

  if (confirmEmail) {
    return (
      <div className="animate-fade-up space-y-4 text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-accent/30 bg-accent/10 text-accent"><MailCheck className="h-7 w-7" /></div>
        <h1 className="text-2xl font-bold">{t('checkEmail')}</h1>
        <p className="text-sm text-muted">{t('checkEmailBody', { email: confirmEmail })}</p>
        <Button variant="secondary" onClick={() => router.push('/login')}>{c('signIn')}</Button>
      </div>
    );
  }

  return (
    <div className="animate-fade-up">
      <h1 className="text-3xl font-bold tracking-tight">{t('registerTitle')}</h1>
      <p className="mt-2 text-sm text-muted">{t('registerSubtitle')}</p>

      <form onSubmit={submit} noValidate className="mt-8 space-y-4">
        <Field label={c('email')} htmlFor="r-email" error={touched && !emailOk ? t('errors.email') : null}>
          <Input id="r-email" type="email" autoComplete="email" value={form.email} onChange={(e) => set('email')(e.target.value)} invalid={touched && !emailOk} autoFocus />
        </Field>

        <Field label={c('password')} htmlFor="r-pw" error={pwErr} hint={t('passwordHint')}>
          <PasswordInput id="r-pw" autoComplete="new-password" value={form.password} onChange={set('password')} invalid={!!pwErr} />
          <div className="mt-2 flex gap-1" aria-hidden>
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className={cn('h-1 flex-1 rounded-full transition-colors', i < score ? (score <= 1 ? 'bg-down' : score <= 2 ? 'bg-warn' : 'bg-up') : 'bg-fg/10')} />
            ))}
          </div>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={<>{c('fullName')} <span className="text-subtle">· {c('optional')}</span></>} htmlFor="r-name">
            <Input id="r-name" autoComplete="name" value={form.full_name} onChange={(e) => set('full_name')(e.target.value)} />
          </Field>
          <Field label={<>{c('country')} <span className="text-subtle">· {c('optional')}</span></>} htmlFor="r-country">
            <Select id="r-country" value={form.country} onChange={(e) => set('country')(e.target.value)} autoComplete="country">
              <option value="">—</option>
              {countries.map((o) => <option key={o.code} value={o.code}>{o.name}</option>)}
            </Select>
          </Field>
        </div>

        <Field label={<>{t('referral')} <span className="text-subtle">· {c('optional')}</span></>} htmlFor="r-ref">
          <Input id="r-ref" value={form.referral_code} onChange={(e) => set('referral_code')(e.target.value.toUpperCase())} className="font-mono uppercase" maxLength={16} />
        </Field>

        {error && <p role="alert" className="rounded-md border border-down/30 bg-down/10 px-3 py-2 text-sm text-down">{error}</p>}

        <Button type="submit" variant="primary" size="lg" block loading={busy}>{t('submitRegister')}</Button>
        <p className="text-xs leading-relaxed text-subtle">{t('agree')}</p>
      </form>

      <p className="mt-6 text-center text-sm text-muted">
        {t('haveAccount')}{' '}
        <Link href="/login" className="font-medium text-accent hover:underline">{c('signIn')}</Link>
      </p>
    </div>
  );
}

export function RegisterForm() {
  return <Suspense><RegisterInner /></Suspense>;
}
