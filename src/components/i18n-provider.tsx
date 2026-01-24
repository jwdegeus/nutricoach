'use client'

import { NextIntlClientProvider } from 'next-intl'

export function I18nProvider({ 
  children, 
  locale, 
  messages 
}: { 
  children: React.ReactNode
  locale: string
  messages: any 
}) {
  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      {children}
    </NextIntlClientProvider>
  )
}
