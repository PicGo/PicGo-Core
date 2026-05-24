export const CLIPBOARD_IMAGE_FOLDER = 'picgo-clipboard-images'
export const PICGO_CLOUD = 'picgo-cloud'
export const PICGO_CLOUD_IMPORT_LOG_FILE = 'picgo-cloud-import-list.log'
export const PICGO_CLOUD_IMPORT_PENDING_FILE = 'picgo-cloud-import-list-pending.json'
export const PICGO_CLOUD_AUTO_IMPORT_PLUGIN = 'picgoCloudAutoImport'
export const PICGO_CLOUD_MULTIPART_PENDING_FILE = 'picgo-cloud-multipart-pending.json'

/** Bytes per megabyte. Reused by anything that formats / compares file sizes. */
export const BYTES_PER_MB = 1024 * 1024

/**
 * Size threshold for multipart upload. Files >= this go through the multipart path; smaller
 * files keep the single-PUT path. Must stay aligned with picgo-hub's MULTIPART_THRESHOLD_BYTES.
 */
export const MULTIPART_THRESHOLD_BYTES = 10 * BYTES_PER_MB // 10 MB

/**
 * Part size for multipart upload. R2/S3 require each part >= 5 MB (last part exempt),
 * max 5 GB per part, max 10000 parts per upload. 8 MB × 128 = 1024 MB covers the 1 GB
 * per-file ceiling with a comfortable retry granularity.
 */
export const MULTIPART_PART_SIZE_BYTES = 8 * BYTES_PER_MB //  8 MB
