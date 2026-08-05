import * as React from 'react'
import { signAttachment } from '@/lib/workspace-api'
import { formatFileSize } from '@/lib/utils'

interface Attachment {
  id: string
  storage_path: string
  original_name: string
  mime_type: string
  file_size: number
  width: number | null
  height: number | null
}

/**
 * Galerie sur stockage privé.
 *
 * Chaque vignette obtient une URL signée valable une heure, demandée au
 * moment de l'affichage. Rien n'est accessible par une adresse devinée, et
 * un lien copié dans un message expire tout seul.
 */
export function AttachmentGallery({ attachments }: { attachments: Attachment[] }) {
  const [urls, setUrls] = React.useState<Record<string, string | null>>({})
  const [zoomed, setZoomed] = React.useState<Attachment | null>(null)

  React.useEffect(() => {
    let active = true

    Promise.all(
      attachments.map(async (attachment) => [
        attachment.id,
        await signAttachment(attachment.storage_path),
      ] as const),
    ).then((entries) => {
      if (active) setUrls(Object.fromEntries(entries))
    })

    return () => {
      active = false
    }
  }, [attachments])

  React.useEffect(() => {
    if (!zoomed) return
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setZoomed(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [zoomed])

  return (
    <>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {attachments.map((attachment) => {
          const url = urls[attachment.id]
          return (
            <li key={attachment.id}>
              <button
                type="button"
                onClick={() => setZoomed(attachment)}
                className="block w-full overflow-hidden rounded-[var(--radius-control)] border border-line bg-canvas"
                aria-label={`Agrandir ${attachment.original_name}`}
              >
                {url ? (
                  <img
                    src={url}
                    alt={attachment.original_name}
                    loading="lazy"
                    className="aspect-4/3 w-full object-cover"
                  />
                ) : (
                  <span className="flex aspect-4/3 items-center justify-center text-xs text-ink-faint">
                    {url === null ? 'Image indisponible' : 'Chargement…'}
                  </span>
                )}
              </button>
              <p className="mt-1 truncate text-xs text-ink-faint" title={attachment.original_name}>
                {attachment.original_name} · {formatFileSize(attachment.file_size)}
              </p>
            </li>
          )
        })}
      </ul>

      {zoomed && urls[zoomed.id] && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={zoomed.original_name}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setZoomed(null)}
        >
          <img
            src={urls[zoomed.id]!}
            alt={zoomed.original_name}
            className="max-h-full max-w-full rounded-[var(--radius-card)] object-contain"
          />
          <button
            type="button"
            onClick={() => setZoomed(null)}
            className="absolute right-4 top-4 rounded-[9px] bg-white/90 px-3 py-1.5 text-sm"
          >
            Fermer
          </button>
        </div>
      )}
    </>
  )
}
