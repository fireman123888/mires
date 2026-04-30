// nano-banana-2 reroute: this entry now calls Pollinations.AI (free, key-less,
// China-friendly Flux backend) instead of Replicate or Gemini, both of which
// were unavailable on the user's account/region. The model id is preserved so
// no UI / DB changes are needed; only the implementation differs.

interface NanoBananaParams {
  prompt: string
  width: number
  height: number
  negative_prompt?: string
  seed?: number
  images?: string[]
}

const MAX_RETRIES = 3
const RETRY_DELAY_MS = 3000

function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase()
    if (msg.includes('timeout') || msg.includes('fetch failed') || msg.includes('econnreset')) return true
    if (msg.includes('502') || msg.includes('503') || msg.includes('504') || msg.includes('unavailable')) return true
    if (msg.includes('429')) return true
  }
  return false
}

/** Pollinations rounds dims to multiples of 8 internally; clamp to its supported range. */
function clampDim(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 1024
  return Math.max(64, Math.min(2048, Math.round(n / 8) * 8))
}

/**
 * 调用 Pollinations.AI（免费 Flux 后端）生成图片。
 * 不支持 img2img/参考图：参数中提供 images 时，会忽略并按文生图处理。
 * @returns base64 格式的图片 data URL（data:image/png;base64,...）
 */
export async function generateNanoBananaImage(params: NanoBananaParams): Promise<string> {
  const model = process.env.POLLINATIONS_FLUX_MODEL || 'flux'
  const baseUrl = (process.env.POLLINATIONS_BASE_URL || 'https://image.pollinations.ai').replace(/\/+$/, '')

  const width = clampDim(params.width)
  const height = clampDim(params.height)

  const url = new URL(`${baseUrl}/prompt/${encodeURIComponent(params.prompt)}`)
  url.searchParams.set('width', String(width))
  url.searchParams.set('height', String(height))
  url.searchParams.set('model', model)
  url.searchParams.set('nologo', 'true')
  url.searchParams.set('private', 'true')
  if (params.seed !== undefined) {
    url.searchParams.set('seed', String(params.seed))
  }
  if (params.negative_prompt) {
    url.searchParams.set('negative', params.negative_prompt)
  }

  if (params.images && params.images.length > 0) {
    console.warn('[nano-banana-2/Pollinations] 收到参考图但 Pollinations 不支持 img2img，按文生图处理')
  }

  console.log(`[nano-banana-2/Pollinations] 模型=${model}, ${width}x${height}, prompt长度=${params.prompt.length}`)

  let lastError: unknown
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const resp = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'image/*' },
        signal: AbortSignal.timeout(120_000),
      })

      if (!resp.ok) {
        const text = await resp.text().catch(() => '')
        throw new Error(`Pollinations ${resp.status}: ${text.slice(0, 300)}`)
      }

      const contentType = resp.headers.get('content-type') || 'image/jpeg'
      if (!contentType.startsWith('image/')) {
        const text = await resp.text().catch(() => '')
        throw new Error(`Pollinations 返回非图片内容 (${contentType}): ${text.slice(0, 300)}`)
      }

      const arrayBuffer = await resp.arrayBuffer()
      if (arrayBuffer.byteLength < 1024) {
        throw new Error(`Pollinations 返回内容过小 (${arrayBuffer.byteLength} bytes)，可能是错误占位图`)
      }
      const base64 = Buffer.from(arrayBuffer).toString('base64')
      console.log(`[nano-banana-2/Pollinations] 生成成功，size=${arrayBuffer.byteLength} bytes`)
      return `data:${contentType};base64,${base64}`
    } catch (error) {
      lastError = error
      console.warn(`[nano-banana-2/Pollinations] 第 ${attempt} 次失败: ${error instanceof Error ? error.message : String(error)}`)
      if (attempt < MAX_RETRIES && isRetryableError(error)) {
        await new Promise(r => setTimeout(r, RETRY_DELAY_MS))
        continue
      }
      throw error
    }
  }

  throw lastError ?? new Error('nano-banana-2 (Pollinations) 请求失败')
}
