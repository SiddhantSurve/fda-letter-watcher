import * as React from 'react'
import { render } from '@react-email/render'
import { supabaseAdmin } from '@/integrations/supabase/client.server'
import { TEMPLATES } from '@/lib/email-templates/registry'

const SITE_NAME = 'FDA Insights'
const SENDER_DOMAIN = 'notify.fdainsights.org'
const FROM_DOMAIN = 'notify.fdainsights.org'
const SITE_URL = 'https://fdainsights.org'

function token() {
  const b = new Uint8Array(32)
  crypto.getRandomValues(b)
  return Array.from(b).map((x) => x.toString(16).padStart(2, '0')).join('')
}

interface LetterRow {
  id: string
  company_name: string | null
  subject: string | null
  posted_date: string | null
  issuing_office: string | null
  excerpt: string | null
  letter_url: string | null
}

/**
 * For each new letter, send an email to every user opted in for that letter_kind,
 * skipping (letter,user) pairs already sent. Safe to call from a scraper hook.
 */
export async function notifyNewLetters(
  kind: 'warning' | 'untitled',
  letters: LetterRow[],
) {
  if (letters.length === 0) return { sent: 0, skipped: 0 }

  const prefCol = kind === 'warning' ? 'email_new_warning' : 'email_new_untitled'

  // 1. Get opted-in user IDs
  const { data: prefs } = await supabaseAdmin
    .from('notification_preferences' as never)
    .select(`user_id, ${prefCol}`)
    .eq(prefCol, true)

  const optedInIds = new Set<string>((prefs ?? []).map((p: any) => p.user_id))

  // Users without a row default to opted-in — fetch all users and union.
  const { data: usersPage } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 })
  const allUsers = usersPage?.users ?? []

  // Users with an explicit "false" preference
  const { data: optedOutRows } = await supabaseAdmin
    .from('notification_preferences' as never)
    .select(`user_id, ${prefCol}`)
    .eq(prefCol, false)
  const optedOut = new Set<string>((optedOutRows ?? []).map((p: any) => p.user_id))

  const recipients = allUsers
    .filter((u) => u.email && !optedOut.has(u.id))
    .map((u) => ({ id: u.id, email: u.email! }))

  if (recipients.length === 0) return { sent: 0, skipped: letters.length }

  const template = TEMPLATES['new-letter-notification']
  if (!template) throw new Error('new-letter-notification template not registered')

  let sent = 0
  let skipped = 0

  for (const letter of letters) {
    // Skip pairs already sent
    const { data: alreadySent } = await supabaseAdmin
      .from('letter_notifications_sent' as never)
      .select('user_id')
      .eq('letter_id', letter.id)
    const doneIds = new Set<string>((alreadySent ?? []).map((r: any) => r.user_id))

    for (const user of recipients) {
      if (doneIds.has(user.id)) {
        skipped++
        continue
      }

      const emailLower = user.email.toLowerCase()

      // Suppression check
      const { data: suppressed } = await supabaseAdmin
        .from('suppressed_emails' as never)
        .select('id')
        .eq('email', emailLower)
        .maybeSingle()
      if (suppressed) {
        skipped++
        continue
      }

      // Unsubscribe token (upsert-then-read)
      let unsubToken: string | undefined
      const { data: existingTok } = await supabaseAdmin
        .from('email_unsubscribe_tokens' as never)
        .select('token, used_at')
        .eq('email', emailLower)
        .maybeSingle()
      if (existingTok && !(existingTok as any).used_at) {
        unsubToken = (existingTok as any).token
      } else if (!existingTok) {
        const t = token()
        await supabaseAdmin
          .from('email_unsubscribe_tokens' as never)
          .upsert({ token: t, email: emailLower } as never, { onConflict: 'email', ignoreDuplicates: true } as never)
        const { data: reread } = await supabaseAdmin
          .from('email_unsubscribe_tokens' as never)
          .select('token')
          .eq('email', emailLower)
          .maybeSingle()
        unsubToken = (reread as any)?.token ?? t
      } else {
        // token used → suppressed
        skipped++
        continue
      }

      const templateData = {
        companyName: letter.company_name ?? 'Unknown company',
        subject: letter.subject ?? '',
        postedDate: letter.posted_date ?? '',
        issuingOffice: letter.issuing_office ?? '',
        excerpt: letter.excerpt ?? '',
        letterKind: kind,
        articleUrl: `${SITE_URL}/`,
      }

      const el = React.createElement(template.component, templateData)
      const html = await render(el)
      const text = await render(el, { plainText: true })
      const subject =
        typeof template.subject === 'function' ? template.subject(templateData) : template.subject

      const messageId = crypto.randomUUID()
      const idempotencyKey = `new-letter-${letter.id}-${user.id}`

      await supabaseAdmin.from('email_send_log' as never).insert({
        message_id: messageId,
        template_name: 'new-letter-notification',
        recipient_email: user.email,
        status: 'pending',
      } as never)

      const { error: enqErr } = await supabaseAdmin.rpc('enqueue_email' as never, {
        queue_name: 'transactional_emails',
        payload: {
          message_id: messageId,
          to: user.email,
          from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
          sender_domain: SENDER_DOMAIN,
          subject,
          html,
          text,
          purpose: 'transactional',
          label: 'new-letter-notification',
          idempotency_key: idempotencyKey,
          unsubscribe_token: unsubToken,
          queued_at: new Date().toISOString(),
        },
      } as never)

      if (enqErr) {
        console.error('notifyNewLetters enqueue failed', enqErr)
        await supabaseAdmin.from('email_send_log' as never).insert({
          message_id: messageId,
          template_name: 'new-letter-notification',
          recipient_email: user.email,
          status: 'failed',
          error_message: 'enqueue failed',
        } as never)
        continue
      }

      await supabaseAdmin
        .from('letter_notifications_sent' as never)
        .insert({ letter_id: letter.id, user_id: user.id } as never)
      sent++
    }
  }

  return { sent, skipped }
}
