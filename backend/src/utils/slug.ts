import { PrismaClient } from '@prisma/client'

const TRANSLIT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'zh',
  з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o',
  п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts',
  ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu',
  я: 'ya',
}

function transliterate(str: string): string {
  return str
    .split('')
    .map(ch => {
      const lower = ch.toLowerCase()
      if (lower in TRANSLIT) return TRANSLIT[lower]
      return ch
    })
    .join('')
}

export function toSlug(name: string): string {
  return transliterate(name)
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'org'
}

export async function uniqueSlug(prisma: PrismaClient, base: string): Promise<string> {
  const slug = toSlug(base)
  const exists = await prisma.organization.findUnique({ where: { slug } })
  if (!exists) return slug

  let i = 2
  while (true) {
    const candidate = `${slug}-${i}`
    const dup = await prisma.organization.findUnique({ where: { slug: candidate } })
    if (!dup) return candidate
    i++
  }
}
