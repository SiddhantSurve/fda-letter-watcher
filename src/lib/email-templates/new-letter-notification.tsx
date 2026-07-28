import React from 'react'
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components'
import type { TemplateEntry } from './registry'

interface Props {
  companyName?: string
  subject?: string
  postedDate?: string
  issuingOffice?: string
  excerpt?: string
  letterKind?: 'warning' | 'untitled'
  articleUrl?: string
}

const kindLabel = (k?: string) => (k === 'untitled' ? 'Untitled Letter' : 'Warning Letter')

const Email = ({
  companyName = 'A regulated company',
  subject = '',
  postedDate = '',
  issuingOffice = '',
  excerpt = '',
  letterKind = 'warning',
  articleUrl = 'https://fdainsights.org',
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{`New FDA ${kindLabel(letterKind)}: ${companyName}`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section>
          <Text style={brand}>FDA Insights</Text>
          <Heading style={h1}>New {kindLabel(letterKind)} posted</Heading>
        </Section>

        <Section style={card}>
          <Text style={label}>Company</Text>
          <Text style={value}>{companyName}</Text>

          {subject ? (
            <>
              <Text style={label}>Subject</Text>
              <Text style={value}>{subject}</Text>
            </>
          ) : null}

          {issuingOffice ? (
            <>
              <Text style={label}>Issuing office</Text>
              <Text style={value}>{issuingOffice}</Text>
            </>
          ) : null}

          {postedDate ? (
            <>
              <Text style={label}>Posted</Text>
              <Text style={value}>{postedDate}</Text>
            </>
          ) : null}

          {excerpt ? (
            <>
              <Hr style={hr} />
              <Text style={excerptStyle}>{excerpt}</Text>
            </>
          ) : null}
        </Section>

        <Section style={{ textAlign: 'center', marginTop: '24px' }}>
          <Button href={articleUrl} style={button}>
            Read on FDA Insights
          </Button>
        </Section>

        <Text style={footer}>
          You are receiving this because you subscribed to new-letter notifications on FDA Insights.
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: (d: Record<string, any>) =>
    `New FDA ${kindLabel(d.letterKind)}: ${d.companyName ?? 'company'}`,
  displayName: 'New letter notification',
  previewData: {
    companyName: 'Example Pharma Inc.',
    subject: 'CGMP violations at facility XYZ',
    postedDate: '07/28/2026',
    issuingOffice: 'Center for Drug Evaluation and Research',
    excerpt: 'The FDA inspected your facility and observed significant deviations from CGMP...',
    letterKind: 'warning',
    articleUrl: 'https://fdainsights.org',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px', maxWidth: '560px', margin: '0 auto' }
const brand = { color: '#c8102e', fontWeight: 700, fontSize: '14px', letterSpacing: '0.08em', textTransform: 'uppercase' as const, margin: 0 }
const h1 = { color: '#1a1a1a', fontSize: '22px', margin: '8px 0 20px' }
const card = { backgroundColor: '#faf7f7', border: '1px solid #eadcdc', borderRadius: '8px', padding: '18px 20px' }
const label = { fontSize: '11px', color: '#8a6b6b', textTransform: 'uppercase' as const, letterSpacing: '0.06em', margin: '10px 0 2px' }
const value = { fontSize: '15px', color: '#1a1a1a', margin: '0 0 4px', lineHeight: '1.4' }
const excerptStyle = { fontSize: '14px', color: '#4a4a4a', lineHeight: '1.5', margin: 0 }
const hr = { borderColor: '#eadcdc', margin: '14px 0' }
const button = { backgroundColor: '#c8102e', color: '#ffffff', padding: '12px 22px', borderRadius: '6px', fontSize: '14px', fontWeight: 600, textDecoration: 'none' }
const footer = { fontSize: '12px', color: '#8a6b6b', textAlign: 'center' as const, marginTop: '28px', lineHeight: '1.5' }
