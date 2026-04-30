// One-shot seed: populate allowed_email_domain so users can register.
// Run with: node scripts/seed-allowed-email-domains.mjs
import 'dotenv/config'
import postgres from 'postgres'

const url = process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL is not set')
  process.exit(1)
}

const sql = postgres(url, { ssl: 'require' })

const domains = [
  'gmail.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'icloud.com',
  'me.com',
  'yahoo.com',
  'protonmail.com',
  'proton.me',
  'qq.com',
  'foxmail.com',
  '163.com',
  '126.com',
  'yeah.net',
  'sina.com',
  'sina.cn',
  'sohu.com',
  'aliyun.com',
  '139.com',
  'mail.com',
  'gmx.com',
  'fastmail.com',
  'tutanota.com',
]

let inserted = 0
for (const domain of domains) {
  const result = await sql`
    INSERT INTO allowed_email_domain (domain, is_enabled)
    VALUES (${domain}, true)
    ON CONFLICT (domain) DO NOTHING
    RETURNING domain
  `
  if (result.length > 0) inserted++
}

const total = await sql`SELECT COUNT(*)::int AS n FROM allowed_email_domain WHERE is_enabled = true`
console.log(`inserted ${inserted} new domains; ${total[0].n} total enabled`)

await sql.end()
