declare module 'write-file-atomic' {
  interface IWriteFileAtomicOptions {
    encoding?: BufferEncoding | null
    fsync?: boolean
    mode?: number
    chown?: {
      uid: number
      gid: number
    }
    tmpfileCreated?: (tmpfile: string) => void
  }

  export default function writeFileAtomic (
    filename: string,
    data: string | Uint8Array,
    options?: IWriteFileAtomicOptions
  ): Promise<void>
}
