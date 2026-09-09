// Metanama — minimal ID3v2.3 / ID3v1 reader & writer
// Reads: ID3v2 (v2.3 and v2.4 text frames + APIC cover art) and ID3v1 as a fallback.
// Writes: always emits a fresh, clean ID3v2.3 tag (UTF-16 text frames so Persian text is safe).
(function (global) {
  "use strict";

  /* --------------------------- low level byte helpers --------------------------- */

  function latin1Decode(bytes) {
    let out = "";
    for (let i = 0; i < bytes.length; i++) out += String.fromCharCode(bytes[i]);
    return out;
  }
  function latin1Encode(str) {
    const arr = new Uint8Array(str.length);
    for (let i = 0; i < str.length; i++) arr[i] = str.charCodeAt(i) & 0xff;
    return arr;
  }
  function readSynchsafeInt(bytes, offset) {
    return (
      ((bytes[offset] & 0x7f) << 21) |
      ((bytes[offset + 1] & 0x7f) << 14) |
      ((bytes[offset + 2] & 0x7f) << 7) |
      (bytes[offset + 3] & 0x7f)
    );
  }
  function readUint32BE(bytes, offset) {
    return bytes[offset] * 0x1000000 + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3];
  }
  function synchsafe(n) {
    return new Uint8Array([(n >> 21) & 0x7f, (n >> 14) & 0x7f, (n >> 7) & 0x7f, n & 0x7f]);
  }
  function uint32be(n) {
    return new Uint8Array([(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]);
  }
  function concatBytes(...arrs) {
    const total = arrs.reduce((s, a) => s + a.length, 0);
    const out = new Uint8Array(total);
    let o = 0;
    arrs.forEach((a) => {
      out.set(a, o);
      o += a.length;
    });
    return out;
  }

  /* ------------------------------- text decoding -------------------------------- */

  function decodeUtf16(bytes, offset, little) {
    let out = "";
    for (let i = offset; i + 1 < bytes.length; i += 2) {
      const b0 = bytes[i],
        b1 = bytes[i + 1];
      const code = little ? (b1 << 8) | b0 : (b0 << 8) | b1;
      if (code === 0) break;
      out += String.fromCharCode(code);
    }
    return out;
  }

  function decodeByEncoding(bytes, encoding) {
    if (encoding === 3) {
      try {
        return new TextDecoder("utf-8").decode(bytes);
      } catch (e) {
        return latin1Decode(bytes);
      }
    }
    if (encoding === 1) {
      let off = 0,
        little = true;
      if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
        little = true;
        off = 2;
      } else if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
        little = false;
        off = 2;
      }
      return decodeUtf16(bytes, off, little);
    }
    if (encoding === 2) return decodeUtf16(bytes, 0, false);
    return latin1Decode(bytes).replace(/\u0000+$/, "");
  }

  function decodeTextFrame(data) {
    if (!data || data.length === 0) return "";
    const encoding = data[0];
    const body = data.subarray(1);
    return decodeByEncoding(body, encoding).replace(/\u0000+$/, "");
  }

  function decodeApicFrame(data) {
    let offset = 0;
    const encoding = data[offset];
    offset += 1;
    let mimeEnd = offset;
    while (mimeEnd < data.length && data[mimeEnd] !== 0) mimeEnd++;
    const mime = latin1Decode(data.subarray(offset, mimeEnd));
    offset = mimeEnd + 1;
    const pictureType = data[offset];
    offset += 1;
    let descEnd = offset;
    if (encoding === 1 || encoding === 2) {
      while (descEnd + 1 < data.length && !(data[descEnd] === 0 && data[descEnd + 1] === 0)) descEnd += 2;
      offset = Math.min(descEnd + 2, data.length);
    } else {
      while (descEnd < data.length && data[descEnd] !== 0) descEnd++;
      offset = descEnd + 1;
    }
    return { mime: mime || "image/jpeg", type: pictureType, data: data.subarray(offset) };
  }

  /* --------------------------------- text encoding ------------------------------- */

  function strToUtf16LEBytesWithBOM(str) {
    const arr = [0xff, 0xfe];
    for (let i = 0; i < str.length; i++) {
      const cc = str.charCodeAt(i);
      arr.push(cc & 0xff, (cc >> 8) & 0xff);
    }
    return new Uint8Array(arr);
  }

  function buildFrame(id, bodyBytes) {
    const idBytes = new Uint8Array([id.charCodeAt(0), id.charCodeAt(1), id.charCodeAt(2), id.charCodeAt(3)]);
    const frame = new Uint8Array(10 + bodyBytes.length);
    frame.set(idBytes, 0);
    frame.set(uint32be(bodyBytes.length), 4); // v2.3 frame sizes are plain big-endian
    frame.set([0, 0], 8);
    frame.set(bodyBytes, 10);
    return frame;
  }

  function buildTextFrame(id, text) {
    const content = strToUtf16LEBytesWithBOM(text || "");
    const body = new Uint8Array(1 + content.length);
    body[0] = 1; // UTF-16 with BOM — safe for Persian & any language
    body.set(content, 1);
    return buildFrame(id, body);
  }

  function buildApicFrame(mime, pictureBytes) {
    const mimeBytes = latin1Encode((mime || "image/jpeg") + "\0");
    const desc = strToUtf16LEBytesWithBOM(""); // empty description
    const descTerminated = new Uint8Array(desc.length + 2); // + 2-byte null terminator
    descTerminated.set(desc, 0);
    const body = new Uint8Array(1 + mimeBytes.length + 1 + descTerminated.length + pictureBytes.length);
    let o = 0;
    body[o] = 1;
    o += 1; // description encoding
    body.set(mimeBytes, o);
    o += mimeBytes.length;
    body[o] = 3;
    o += 1; // picture type: 3 = cover (front)
    body.set(descTerminated, o);
    o += descTerminated.length;
    body.set(pictureBytes, o);
    return buildFrame("APIC", body);
  }

  /* ----------------------------------- parsing ------------------------------------ */

  function parse(arrayBuffer) {
    const bytes = new Uint8Array(arrayBuffer);
    const result = {
      hasID3v2: false,
      version: null,
      frames: [],
      tags: {},
      id3v2Size: 0,
      hasID3v1: false,
      audioStart: 0,
      audioEnd: bytes.length,
    };

    if (bytes.length >= 10 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
      const majorVersion = bytes[3];
      const flags = bytes[5];
      const size = readSynchsafeInt(bytes, 6);
      result.hasID3v2 = true;
      result.version = { major: majorVersion, minor: bytes[4] };
      result.id3v2Size = 10 + size;
      result.audioStart = 10 + size;

      let offset = 10;
      const tagEnd = 10 + size;
      if (flags & 0x40) {
        // extended header present — skip it
        const extSize = majorVersion === 4 ? readSynchsafeInt(bytes, offset) : readUint32BE(bytes, offset);
        offset += 4 + extSize;
      }

      while (offset + 10 <= tagEnd) {
        const frameId = String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
        if (!/^[A-Z0-9]{4}$/.test(frameId)) break; // padding / corruption reached
        const frameSize = majorVersion === 4 ? readSynchsafeInt(bytes, offset + 4) : readUint32BE(bytes, offset + 4);
        const dataStart = offset + 10;
        const dataEnd = dataStart + frameSize;
        if (frameSize < 0 || dataEnd > tagEnd) break;
        result.frames.push({ id: frameId, size: frameSize, data: bytes.subarray(dataStart, dataEnd) });
        offset = dataEnd; // advances past the 10-byte frame header even when frameSize is 0
      }
    }

    if (bytes.length >= 128) {
      const t = bytes.length - 128;
      if (bytes[t] === 0x54 && bytes[t + 1] === 0x41 && bytes[t + 2] === 0x47) {
        result.hasID3v1 = true;
        result.audioEnd = t;
        const dec = (start, len) =>
          latin1Decode(bytes.subarray(t + start, t + start + len))
            .replace(/\u0000+$/, "")
            .trim();
        result.id3v1 = { title: dec(3, 30), artist: dec(33, 30), album: dec(63, 30), year: dec(93, 4) };
      }
    }

    const findFrame = (id) => result.frames.find((f) => f.id === id);
    const textFrame = (id) => {
      const f = findFrame(id);
      return f ? decodeTextFrame(f.data) : undefined;
    };

    result.tags.title = textFrame("TIT2");
    result.tags.artist = textFrame("TPE1");
    result.tags.album = textFrame("TALB");
    result.tags.year = textFrame("TYER") || textFrame("TDRC");
    result.tags.genre = textFrame("TCON");

    const apic = findFrame("APIC") || findFrame("PIC");
    if (apic) {
      try {
        result.tags.picture = decodeApicFrame(apic.data);
      } catch (e) {
        /* ignore malformed cover art */
      }
    }

    if (result.hasID3v1) {
      result.tags.title = result.tags.title || result.id3v1.title;
      result.tags.artist = result.tags.artist || result.id3v1.artist;
      result.tags.album = result.tags.album || result.id3v1.album;
      result.tags.year = result.tags.year || result.id3v1.year;
    }

    return result;
  }

  /* ----------------------------------- building ------------------------------------ */

  function buildTag(fields) {
    const frames = [];
    if (fields.title) frames.push(buildTextFrame("TIT2", fields.title));
    if (fields.artist) frames.push(buildTextFrame("TPE1", fields.artist));
    if (fields.album) frames.push(buildTextFrame("TALB", fields.album));
    if (fields.year) frames.push(buildTextFrame("TYER", fields.year));
    if (fields.genre) frames.push(buildTextFrame("TCON", fields.genre));
    if (fields.picture && fields.picture.data && fields.picture.data.length) {
      frames.push(buildApicFrame(fields.picture.mime, fields.picture.data));
    }
    const totalLen = frames.reduce((s, f) => s + f.length, 0);
    const header = new Uint8Array(10);
    header.set(latin1Encode("ID3"), 0);
    header[3] = 3;
    header[4] = 0; // ID3v2.3.0
    header[5] = 0;
    header.set(synchsafe(totalLen), 6);
    return concatBytes(header, ...frames);
  }

  global.MetanamaID3 = { parse, buildTag, concatBytes, decodeTextFrame };
})(window);
