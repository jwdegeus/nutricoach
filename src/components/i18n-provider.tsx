'use client'

import { NextIntlClientProvider } from 'next-intl'

export function I18nProvider({ 
  children, 
  locale, 
  messages,
  timeZone 
}: { 
  children: React.ReactNode
  locale: string
  messages: any
  timeZone?: string
}) {
  return (
    <NextIntlClientProvider locale={locale} messages={messages} timeZone={timeZone}>
      {children}
    </NextIntlClientProvider>
  )
}
