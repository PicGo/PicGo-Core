export const CLIPBOARD_IMAGE_FOLDER = 'picgo-clipboard-images'
export const PICGO_CLOUD = 'picgo-cloud'
export const PICGO_CLOUD_IMPORT_LOG_FILE = 'picgo-cloud-import-list.log'
export const PICGO_CLOUD_IMPORT_PENDING_FILE = 'picgo-cloud-import-list-pending.json'
export const PICGO_CLOUD_AUTO_IMPORT_PLUGIN = 'picgoCloudAutoImport'
export const PICGO_CLOUD_MULTIPART_PENDING_FILE = 'picgo-cloud-multipart-pending.json'

/**
 * 分片上传的尺寸阈值。文件 ≥ 该值走分片上传，小于走单 PUT。
 * 与 picgo-hub 服务端 MULTIPART_THRESHOLD_BYTES 保持一致。
 */
export const MULTIPART_THRESHOLD_BYTES = 10 * 1024 * 1024 // 10 MB

/**
 * 单个分片大小。R2/S3 part 下限 5 MB（末片可短）、上限 5 GB，单上传最多 10000 part。
 * 8 MB × 128 = 1024 MB，正好覆盖单文件 1 GB 上限。
 */
export const MULTIPART_PART_SIZE_BYTES = 8 * 1024 * 1024 //  8 MB
