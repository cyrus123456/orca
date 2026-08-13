import { ipcMain, dialog } from 'electron'
import { basename, extname } from 'node:path'
import { open } from 'node:fs/promises'
import { MAX_REPO_ICON_UPLOAD_BYTES } from '../../shared/repo-icon'

const REPO_ICON_IMAGE_MIME_TYPES: Record<string, string> = {
  '.png': 'image/png'
}

const AGENT_ICON_IMAGE_MIME_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon'
}

type IconImagePickOptions = {
  filters: Electron.FileFilter[]
  mimeTypes: Record<string, string>
  unsupportedError: string
  tooLargeError: string
}

async function pickIconImageFile(
  options: IconImagePickOptions
): Promise<{ dataUrl: string; fileName: string } | null> {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: options.filters
  })
  if (result.canceled || result.filePaths.length === 0) {
    return null
  }
  const filePath = result.filePaths[0]!
  const extension = extname(filePath).toLowerCase()
  const mimeType = options.mimeTypes[extension]
  if (!mimeType) {
    throw new Error(options.unsupportedError)
  }
  // Why: stat→readFile is a TOCTOU window — a file swap between the size check
  // and the read can bypass the cap. Open one fd and bound the read by the
  // limit so the size cap is enforced by the read itself, not a separate lookup.
  const handle = await open(filePath, 'r')
  try {
    const probe = Buffer.alloc(MAX_REPO_ICON_UPLOAD_BYTES + 1)
    const { bytesRead } = await handle.read(probe, 0, MAX_REPO_ICON_UPLOAD_BYTES + 1, 0)
    if (bytesRead > MAX_REPO_ICON_UPLOAD_BYTES) {
      throw new Error(options.tooLargeError)
    }
    const buffer = probe.subarray(0, bytesRead)
    return {
      dataUrl: `data:${mimeType};base64,${buffer.toString('base64')}`,
      fileName: basename(filePath)
    }
  } finally {
    await handle.close()
  }
}

export function registerIconImagePickerHandlers(): void {
  ipcMain.handle('shell:pickRepoIconImage', () =>
    pickIconImageFile({
      filters: [{ name: 'Repo icon images', extensions: ['png'] }],
      mimeTypes: REPO_ICON_IMAGE_MIME_TYPES,
      unsupportedError: 'Repo icons must be PNG files.',
      tooLargeError: 'Repo icon image must be 256KB or smaller.'
    })
  )

  ipcMain.handle('shell:pickAgentIconImage', () =>
    pickIconImageFile({
      filters: [
        {
          name: 'Images',
          extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico']
        }
      ],
      mimeTypes: AGENT_ICON_IMAGE_MIME_TYPES,
      unsupportedError: 'Unsupported image format.',
      tooLargeError: 'Image must be 256KB or smaller.'
    })
  )
}
