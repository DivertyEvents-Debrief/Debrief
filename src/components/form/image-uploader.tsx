
import * as React from 'react'
import imageCompression from 'browser-image-compression'
import { Camera, ImagePlus, Loader2, Trash2, TriangleAlert } from 'lucide-react'
import { getSupabase } from '@/lib/supabase/client'
import { createUploadUrl, discardUpload } from '@/lib/public-api'
import { Button } from '@/components/ui/button'
import { cn, formatFileSize } from '@/lib/utils'

export interface UploadedImage {
  id: string
  storage_path: string
  original_name: string
  mime_type: string
  file_size: number
  width?: number
  height?: number
  previewUrl: string
}

type PendingUpload = { id: string; name: string; progress: number; error?: string }

const BUCKET = 'debrief-attachments'

/**
 * Compression volontairement douce : on réduit le poids sans écraser les
 * détails. Un câble abîmé ou une tache sur une nappe doit rester visible.
 */
const COMPRESSION_OPTIONS = {
  maxSizeMB: 2.5,
  maxWidthOrHeight: 2400,
  initialQuality: 0.86,
  useWebWorker: true,
}

export function ImageUploader({
  draftId,
  images,
  onChange,
  maxFiles,
  maxFileSizeMb,
  maxTotalSizeMb,
  acceptedFormats,
}: {
  draftId: string | null
  images: UploadedImage[]
  onChange: (images: UploadedImage[]) => void
  maxFiles: number
  maxFileSizeMb: number
  maxTotalSizeMb: number
  acceptedFormats: string[]
}) {
  const [pending, setPending] = React.useState<PendingUpload[]>([])
  const [dragging, setDragging] = React.useState(false)
  const [globalError, setGlobalError] = React.useState<string | null>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const cameraRef = React.useRef<HTMLInputElement>(null)

  const totalSize = images.reduce((sum, image) => sum + image.file_size, 0)

  React.useEffect(() => {
    return () => images.forEach((image) => URL.revokeObjectURL(image.previewUrl))
    // Nettoyage des aperçus au démontage uniquement.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || !draftId) return
    setGlobalError(null)

    const files = Array.from(fileList)
    if (images.length + pending.length + files.length > maxFiles) {
      setGlobalError(`Vous pouvez joindre ${maxFiles} images au maximum.`)
      return
    }

    for (const file of files) {
      const uploadId = crypto.randomUUID()
      setPending((current) => [...current, { id: uploadId, name: file.name, progress: 5 }])

      try {
        if (!acceptedFormats.includes(file.type)) {
          throw new Error("Ce format n'est pas accepté. Utilisez JPEG, PNG ou WebP.")
        }

        const compressed =
          file.size > 700 * 1024 ? await imageCompression(file, COMPRESSION_OPTIONS) : file

        if (compressed.size > maxFileSizeMb * 1024 * 1024) {
          throw new Error(`Image trop volumineuse (maximum ${maxFileSizeMb} Mo).`)
        }
        if (totalSize + compressed.size > maxTotalSizeMb * 1024 * 1024) {
          throw new Error(`Poids total dépassé (maximum ${maxTotalSizeMb} Mo).`)
        }

        setPending((current) =>
          current.map((p) => (p.id === uploadId ? { ...p, progress: 35 } : p)),
        )

        const signed = await createUploadUrl(draftId, {
          name: file.name,
          type: file.type,
          size: compressed.size,
        })
        if (!signed.ok) throw new Error(signed.error)

        setPending((current) =>
          current.map((p) => (p.id === uploadId ? { ...p, progress: 60 } : p)),
        )

        const supabase = getSupabase()
        const { error } = await supabase.storage
          .from(BUCKET)
          .uploadToSignedUrl(signed.data.path, signed.data.token, compressed, {
            contentType: file.type,
          })
        if (error) throw new Error("L'envoi de l'image a échoué. Vérifiez votre connexion.")

        const dimensions = await readDimensions(compressed)

        onChange([
          ...images,
          {
            id: uploadId,
            storage_path: signed.data.path,
            original_name: file.name,
            mime_type: file.type,
            file_size: compressed.size,
            previewUrl: URL.createObjectURL(compressed),
            ...dimensions,
          },
        ])
        setPending((current) => current.filter((p) => p.id !== uploadId))
      } catch (error) {
        setPending((current) =>
          current.map((p) =>
            p.id === uploadId ? { ...p, progress: 100, error: (error as Error).message } : p,
          ),
        )
      }
    }

    if (inputRef.current) inputRef.current.value = ''
    if (cameraRef.current) cameraRef.current.value = ''
  }

  async function remove(image: UploadedImage) {
    if (!draftId) return
    onChange(images.filter((candidate) => candidate.id !== image.id))
    URL.revokeObjectURL(image.previewUrl)
    await discardUpload(draftId, image.storage_path)
  }

  return (
    <div className="space-y-3">
      <div
        onDragOver={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault()
          setDragging(false)
          void handleFiles(event.dataTransfer.files)
        }}
        className={cn(
          'rounded-[var(--radius-card)] border border-dashed px-4 py-6 text-center transition-colors',
          dragging ? 'border-brand bg-brand-soft' : 'border-line-strong bg-surface',
        )}
      >
        <ImagePlus className="mx-auto mb-2 size-6 text-ink-faint" aria-hidden />
        <p className="text-sm text-ink-muted">
          Glissez vos photos ici, ou utilisez les boutons ci-dessous.
        </p>
        <p className="mt-1 text-xs text-ink-faint">
          {maxFiles} images maximum · {maxFileSizeMb} Mo par image · JPEG, PNG ou WebP
        </p>

        <div className="mt-4 flex flex-col justify-center gap-2 sm:flex-row">
          <Button type="button" variant="secondary" onClick={() => inputRef.current?.click()}>
            <ImagePlus className="size-4" aria-hidden />
            Choisir des photos
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => cameraRef.current?.click()}
            className="sm:hidden"
          >
            <Camera className="size-4" aria-hidden />
            Prendre une photo
          </Button>
        </div>

        <input
          ref={inputRef}
          type="file"
          multiple
          accept={acceptedFormats.join(',')}
          className="sr-only"
          onChange={(event) => void handleFiles(event.target.files)}
          aria-label="Sélectionner des photos"
        />
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          onChange={(event) => void handleFiles(event.target.files)}
          aria-label="Prendre une photo"
        />
      </div>

      {globalError && (
        <p role="alert" className="flex items-center gap-2 text-sm text-danger">
          <TriangleAlert className="size-4" aria-hidden />
          {globalError}
        </p>
      )}

      {(images.length > 0 || pending.length > 0) && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3" aria-live="polite">
          {images.map((image) => (
            <li key={image.id} className="group relative overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={image.previewUrl}
                alt={`Aperçu de ${image.original_name}`}
                className="aspect-4/3 w-full object-cover"
              />
              <div className="flex items-center justify-between gap-2 px-2 py-1.5">
                <span className="truncate text-xs text-ink-muted" title={image.original_name}>
                  {formatFileSize(image.file_size)}
                </span>
                <button
                  type="button"
                  onClick={() => void remove(image)}
                  className="rounded-md p-1.5 text-ink-faint hover:bg-danger-soft hover:text-danger"
                  aria-label={`Supprimer ${image.original_name}`}
                >
                  <Trash2 className="size-4" aria-hidden />
                </button>
              </div>
            </li>
          ))}

          {pending.map((upload) => (
            <li
              key={upload.id}
              className="flex aspect-4/3 flex-col items-center justify-center gap-2 rounded-[var(--radius-card)] border border-line bg-brand-softer p-3 text-center"
            >
              {upload.error ? (
                <>
                  <TriangleAlert className="size-5 text-danger" aria-hidden />
                  <p className="text-xs text-danger">{upload.error}</p>
                </>
              ) : (
                <>
                  <Loader2 className="size-5 animate-spin text-brand" aria-hidden />
                  <p className="truncate text-xs text-ink-muted">{upload.name}</p>
                  <div className="h-1 w-full rounded-full bg-line">
                    <div
                      className="h-1 rounded-full bg-brand transition-all"
                      style={{ width: `${upload.progress}%` }}
                    />
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {images.length > 0 && (
        <p className="text-xs text-ink-faint">
          {images.length} image{images.length > 1 ? 's' : ''} · {formatFileSize(totalSize)} au total
        </p>
      )}
    </div>
  )
}

async function readDimensions(file: Blob): Promise<{ width?: number; height?: number }> {
  try {
    const bitmap = await createImageBitmap(file)
    const dimensions = { width: bitmap.width, height: bitmap.height }
    bitmap.close()
    return dimensions
  } catch {
    return {}
  }
}
