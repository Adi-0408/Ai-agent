import JSZip from 'jszip';

const IGNORED_PATH_PATTERNS = [
  /__MACOSX/i,
  /\.DS_Store$/i,
  /Thumbs\.db$/i,
  /(^|\/)\.git\//i,
  /(^|\/)node_modules\//i,
  /(^|\/)\.venv\//i,
  /(^|\/)\.idea\//i,
  /(^|\/)\.vscode\//i,
  /(^|\/)dist\//i,
  /(^|\/)build\//i,
  /(^|\/)target\//i,
  /(^|\/)\.next\//i
];

const TEXT_EXTENSIONS_REGEX = /\.(html?|css|scss|sass|less|jsx?|tsx?|mjs|cjs|vue|svelte|json|sql|csv|tsv|txt|md|markdown|xml|ya?ml|py|go|java|php|rb|rs|prisma|env|sh|bat|ini|toml|graphql|gql|log|c|cpp|h|hpp|cs|swift|kt|dart)$/i;

const EXTENSIONLESS_TEXT_FILES = new Set([
  'dockerfile',
  'makefile',
  'procfile',
  'gemfile',
  'rakefile',
  'license',
  'licence',
  'readme'
]);

export function isTextFileName(fileName) {
  if (!fileName) return false;
  const base = fileName.split('/').pop().toLowerCase();
  if (TEXT_EXTENSIONS_REGEX.test(base)) return true;
  if (EXTENSIONLESS_TEXT_FILES.has(base)) return true;
  if (base.startsWith('.env')) return true;
  return false;
}

export function isZipFile(file) {
  if (!file) return false;
  const name = (file.name || '').toLowerCase();
  const type = (file.type || '').toLowerCase();
  return (
    name.endsWith('.zip') ||
    type === 'application/zip' ||
    type === 'application/x-zip-compressed' ||
    type === 'multipart/x-zip' ||
    type.includes('zip')
  );
}

export function getMimeType(fileName, isText) {
  const ext = (fileName.split('.').pop() || '').toLowerCase();
  const mimeMap = {
    json: 'application/json',
    js: 'application/javascript',
    jsx: 'text/javascript',
    ts: 'application/typescript',
    tsx: 'text/typescript',
    html: 'text/html',
    htm: 'text/html',
    css: 'text/css',
    sql: 'application/sql',
    csv: 'text/csv',
    tsv: 'text/tab-separated-values',
    txt: 'text/plain',
    md: 'text/markdown',
    xml: 'application/xml',
    svg: 'image/svg+xml',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    pdf: 'application/pdf',
    py: 'text/x-python',
    java: 'text/x-java-source',
    go: 'text/x-go',
    php: 'application/x-httpd-php',
    rb: 'text/x-ruby',
    prisma: 'text/plain',
    yaml: 'text/yaml',
    yml: 'text/yaml'
  };
  return mimeMap[ext] || (isText ? 'text/plain' : 'application/octet-stream');
}

/**
 * Safely extracts all files from a .zip archive.
 * Filters out build directories, OS metadata, and node_modules.
 * 
 * @param {File|Blob} zipFile 
 * @param {(current: number, total: number, fileName: string) => void} [onProgress]
 * @returns {Promise<File[]>}
 */
export async function extractFilesFromZip(zipFile, onProgress) {
  const zip = await JSZip.loadAsync(zipFile);
  const extractedFiles = [];
  const entries = [];

  zip.forEach((relativePath, entry) => {
    if (entry.dir) return;
    if (IGNORED_PATH_PATTERNS.some((pat) => pat.test(relativePath))) return;
    entries.push({ relativePath, entry });
  });

  const total = entries.length;

  for (let i = 0; i < total; i++) {
    const { relativePath, entry } = entries[i];
    const fileName = relativePath.split('/').pop();
    const isText = isTextFileName(fileName);
    const mime = getMimeType(fileName, isText);

    let content = '';
    let fileBlob = null;

    if (isText) {
      try {
        content = (await entry.async('text')).replace(/\0/g, ' ');
      } catch (err) {
        content = `[Failed to read text entry: ${err.message}]`;
      }
      fileBlob = new Blob([content], { type: mime });
    } else {
      const u8 = await entry.async('uint8array');
      fileBlob = new Blob([u8], { type: mime });
      content = `[Binary File: ${fileName}, size: ${(fileBlob.size / 1024).toFixed(1)} KB]`;
    }

    const FileClass = typeof File !== 'undefined' ? File : class extends Blob {
      constructor(parts, name, opts) {
        super(parts, opts);
        this.name = name;
        this.lastModified = opts?.lastModified || Date.now();
      }
    };

    const fileObj = new FileClass([fileBlob], fileName, {
      type: mime,
      lastModified: entry.date ? entry.date.getTime() : Date.now()
    });

    fileObj.relativePath = relativePath;
    fileObj.textContent = content;
    fileObj.isFromZip = true;
    fileObj.zipArchiveName = zipFile.name || 'archive.zip';

    extractedFiles.push(fileObj);

    if (onProgress) {
      onProgress(i + 1, total, fileName);
    }
  }

  return extractedFiles;
}

/**
 * Expands an array of files, extracting any .zip archives into their
 * constituent files and leaving regular files as-is.
 * 
 * @param {File[]|FileList} fileList 
 * @param {(current: number, total: number, fileName: string) => void} [onProgress]
 * @returns {Promise<File[]>}
 */
export async function expandFileList(fileList, onProgress) {
  const filesArray = Array.from(fileList || []);
  const result = [];

  for (const file of filesArray) {
    if (isZipFile(file)) {
      const unpacked = await extractFilesFromZip(file, onProgress);
      result.push(...unpacked);
    } else {
      result.push(file);
    }
  }

  return result;
}
