import { once } from 'node:events';
import { crc32, createDeflateRaw, inflateRawSync } from 'node:zlib';

export interface PackedFile {
    name: string;
    packed: Buffer;
    crc: number;
    size: number;
}

export async function packFile(name: string, parts: AsyncIterable<string>): Promise<PackedFile> {
    const deflate = createDeflateRaw();
    const chunks: Buffer[] = [];
    let crc = 0;
    let size = 0;

    deflate.on('data', (chunk: Buffer) => chunks.push(chunk));

    for await (const part of parts) {
        const data = Buffer.from(part, 'utf8');

        crc = crc32(data, crc);
        size += data.length;

        if (!deflate.write(data)) {
            await once(deflate, 'drain');
        }
    }

    deflate.end();

    await once(deflate, 'end');

    return { name, packed: Buffer.concat(chunks), crc, size };
}

export function zip(files: PackedFile[], at = new Date()): Buffer {
    const time = (at.getHours() << 11) | (at.getMinutes() << 5) | (at.getSeconds() >> 1);
    const date = ((at.getFullYear() - 1980) << 9) | ((at.getMonth() + 1) << 5) | at.getDate();
    const body: Buffer[] = [];
    const directory: Buffer[] = [];
    let offset = 0;

    for (const file of files) {
        const name = Buffer.from(file.name, 'utf8');
        const local = Buffer.alloc(30);
        const central = Buffer.alloc(46);

        local.writeUInt32LE(0x04034b50, 0);
        local.writeUInt16LE(20, 4);
        local.writeUInt16LE(0x0800, 6);
        local.writeUInt16LE(8, 8);
        local.writeUInt16LE(time, 10);
        local.writeUInt16LE(date, 12);
        local.writeUInt32LE(file.crc, 14);
        local.writeUInt32LE(file.packed.length, 18);
        local.writeUInt32LE(file.size, 22);
        local.writeUInt16LE(name.length, 26);

        central.writeUInt32LE(0x02014b50, 0);
        central.writeUInt16LE(20, 4);
        central.writeUInt16LE(20, 6);
        central.writeUInt16LE(0x0800, 8);
        central.writeUInt16LE(8, 10);
        central.writeUInt16LE(time, 12);
        central.writeUInt16LE(date, 14);
        central.writeUInt32LE(file.crc, 16);
        central.writeUInt32LE(file.packed.length, 20);
        central.writeUInt32LE(file.size, 24);
        central.writeUInt16LE(name.length, 28);
        central.writeUInt32LE(offset, 42);

        body.push(local, name, file.packed);
        directory.push(central, name);
        offset += local.length + name.length + file.packed.length;
    }

    const listing = Buffer.concat(directory);
    const end = Buffer.alloc(22);

    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(files.length, 8);
    end.writeUInt16LE(files.length, 10);
    end.writeUInt32LE(listing.length, 12);
    end.writeUInt32LE(offset, 16);

    return Buffer.concat([...body, listing, end]);
}

export function unzip(
    archive: Buffer,
    limits: { files: number; bytes: number },
): { name: string; data: Buffer }[] {
    const end = archive.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));

    if (end < 0 || end + 22 > archive.length) {
        throw new Error('not a zip file');
    }

    const count = archive.readUInt16LE(end + 10);

    if (count > limits.files) {
        throw new Error('too many files in the zip');
    }

    const files: { name: string; data: Buffer }[] = [];
    let at = archive.readUInt32LE(end + 16);
    let total = 0;

    for (let index = 0; index < count; index += 1) {
        if (at + 46 > archive.length || archive.readUInt32LE(at) !== 0x02014b50) {
            throw new Error('the zip directory is broken');
        }

        const method = archive.readUInt16LE(at + 10);
        const crc = archive.readUInt32LE(at + 16);
        const packedSize = archive.readUInt32LE(at + 20);
        const size = archive.readUInt32LE(at + 24);
        const nameLength = archive.readUInt16LE(at + 28);
        const local = archive.readUInt32LE(at + 42);
        const name = archive.subarray(at + 46, at + 46 + nameLength).toString('utf8');

        at += 46 + nameLength + archive.readUInt16LE(at + 30) + archive.readUInt16LE(at + 32);

        if (name.endsWith('/')) {
            continue;
        }

        total += size;

        if (total > limits.bytes) {
            throw new Error('the zip unpacks to more than is allowed');
        }

        if (local + 30 > archive.length || archive.readUInt32LE(local) !== 0x04034b50) {
            throw new Error(`${name} is missing from the zip`);
        }

        const start =
            local + 30 + archive.readUInt16LE(local + 26) + archive.readUInt16LE(local + 28);
        const packed = archive.subarray(start, start + packedSize);

        if (method !== 0 && method !== 8) {
            throw new Error(`${name} uses a compression this reader does not know`);
        }

        const data =
            method === 0
                ? Buffer.from(packed)
                : inflateRawSync(packed, { maxOutputLength: Math.max(1, size) });

        if (data.length !== size || crc32(data) !== crc) {
            throw new Error(`${name} is damaged`);
        }

        files.push({ name, data });
    }

    return files;
}
