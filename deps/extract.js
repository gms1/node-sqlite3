#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const LOCAL_FILE_HEADER_SIG = 0x04034b50;
const COMPRESSION_STORE = 0;
const COMPRESSION_DEFLATE = 8;

function extractZip(zipPath, destDir) {
    const data = fs.readFileSync(zipPath);
    let offset = 0;
    let entries = 0;

    // Detect top-level directory prefix to strip (e.g., "sqlite-amalgamation-3530100/")
    let prefixToStrip = '';
    let firstEntry = true;

    while (offset < data.length) {
        const sig = data.readUInt32LE(offset);
        if (sig !== LOCAL_FILE_HEADER_SIG) {
            break;
        }

        const compressionMethod = data.readUInt16LE(offset + 8);
        const compressedSize = data.readUInt32LE(offset + 18);
        const fileNameLength = data.readUInt16LE(offset + 26);
        const extraFieldLength = data.readUInt16LE(offset + 28);

        const fileName = data.toString('utf8', offset + 30, offset + 30 + fileNameLength);
        const dataOffset = offset + 30 + fileNameLength + extraFieldLength;
        const compressedData = data.subarray(dataOffset, dataOffset + compressedSize);

        // Detect top-level directory prefix from first entry
        if (firstEntry && fileName.includes('/')) {
            prefixToStrip = fileName.substring(0, fileName.indexOf('/') + 1);
            firstEntry = false;
        }

        // Strip prefix from filename
        let outFileName = fileName;
        if (prefixToStrip && outFileName.startsWith(prefixToStrip)) {
            outFileName = outFileName.substring(prefixToStrip.length);
        }

        let fileData;
        if (compressionMethod === COMPRESSION_STORE) {
            fileData = compressedData;
        } else if (compressionMethod === COMPRESSION_DEFLATE) {
            fileData = zlib.inflateRawSync(compressedData);
        } else {
            throw new Error(`Unsupported compression method ${compressionMethod} for file ${fileName}`);
        }

        if (outFileName && !outFileName.endsWith('/')) {
            const outPath = path.join(destDir, outFileName);
          const resolvedDest = path.resolve(destDir);
          const resolvedOut = path.resolve(outPath);
          if (!resolvedOut.startsWith(resolvedDest + path.sep)) {
            throw new Error(`Zip Slip detected: ${outFileName} resolves outside destination directory`);
          }
            const dir = path.dirname(outPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(outPath, fileData);
            entries++;
        }

        offset = dataOffset + compressedSize;
    }

    if (entries === 0) {
        throw new Error('No files extracted — zip may be corrupted or empty');
    }

    return entries;
}

function main() {
    const archivePath = path.resolve(process.argv[2]);
    const destDir = path.resolve(process.argv[3]);

    if (!archivePath || !destDir) {
        console.error('Usage: extract.js <archive_path> <dest_dir>');
        process.exit(1);
    }

    // Resolve archive path relative to script directory if not absolute
    const zipFile = path.isAbsolute(archivePath)
        ? archivePath
        : path.join(__dirname, archivePath);

    // Compute extraction directory: destDir + archive basename without .zip
    const archiveName = path.basename(archivePath, '.zip');
    const extractDir = path.join(destDir, archiveName);
    const stampFile = path.join(extractDir, '.extract-stamp');

    if (fs.existsSync(stampFile)) {
        console.log(`[extract] Already extracted: ${extractDir}`);
        process.exit(0);
    }

    if (!fs.existsSync(zipFile)) {
        console.error(`[extract] ERROR: Zip file not found: ${zipFile}`);
        process.exit(1);
    }

    if (fs.existsSync(extractDir)) {
        console.log(`[extract] Removing stale extraction directory: ${extractDir}`);
        fs.rmSync(extractDir, { recursive: true, force: true });
    }

    console.log(`[extract] Extracting ${path.basename(zipFile)}...`);
    fs.mkdirSync(extractDir, { recursive: true });

    try {
        const entries = extractZip(zipFile, extractDir);
        fs.writeFileSync(stampFile, `Extracted from ${path.basename(zipFile)}\n`);
        console.log(`[extract] Extraction complete: ${entries} file(s) extracted to ${extractDir}`);
    } catch (err) {
        console.error(`[extract] ERROR: ${err.message}`);
        fs.rmSync(extractDir, { recursive: true, force: true });
        process.exit(1);
    }
}

main();
