export function formatBaghdadDateTime(
  isoOrDate: string | Date | null | undefined,
  locale: 'ku' | 'ar' | 'en' = 'ku',
  timezone: string = 'Asia/Baghdad'
): string {
  if (!isoOrDate) return '—';
  const date = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
  if (Number.isNaN(date.getTime())) return '—';

  const intlLocale = locale === 'en' ? 'en-GB' : locale === 'ar' ? 'ar-IQ' : 'ckb-IQ';
  try {
    return new Intl.DateTimeFormat(intlLocale, {
      timeZone: timezone || 'Asia/Baghdad',
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 16).replace('T', ' ');
  }
}

export function formatBaghdadDateOnly(
  isoOrDate: string | Date | null | undefined,
  locale: 'ku' | 'ar' | 'en' = 'ku',
  timezone: string = 'Asia/Baghdad'
): string {
  if (!isoOrDate) return '—';
  const date = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
  if (Number.isNaN(date.getTime())) return '—';

  const intlLocale = locale === 'en' ? 'en-GB' : locale === 'ar' ? 'ar-IQ' : 'ckb-IQ';
  try {
    return new Intl.DateTimeFormat(intlLocale, {
      timeZone: timezone || 'Asia/Baghdad',
      year: 'numeric',
      month: 'short',
      day: '2-digit',
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}
