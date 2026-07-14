const arabicDateFormatter = new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

const arabicTimeFormatter = new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', {
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
})

export function formatArabicDateTime(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return 'تاريخ غير متاح'
  return `${arabicDateFormatter.format(date)}، ${arabicTimeFormatter.format(date)}`
}

export function formatArabicDate(value: string | Date) {
  const date = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T12:00:00`)
    : value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return 'تاريخ غير متاح'
  return arabicDateFormatter.format(date)
}
