// MD5 (RFC 1321) para o hash do epílogo TISS.
// Cada caractere vira um byte (ISO-8859-1), igual ao createHash('md5').update(texto, 'latin1')
// da versão desktop. O texto chega já saneado para ASCII, então não há perda.
'use strict'

const md5 = (function () {
  const S = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21
  ]
  const K = []
  for (let i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000) >>> 0

  function toBytes(text) {
    const bytes = new Uint8Array(text.length)
    for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i) & 0xff
    return bytes
  }

  function rotl(x, c) {
    return (x << c) | (x >>> (32 - c))
  }

  return function md5(text) {
    const msg = toBytes(text)
    const bitLen = msg.length * 8
    const paddedLen = (((msg.length + 8) >>> 6) + 1) * 64
    const buf = new Uint8Array(paddedLen)
    buf.set(msg)
    buf[msg.length] = 0x80
    const view = new DataView(buf.buffer)
    view.setUint32(paddedLen - 8, bitLen >>> 0, true)
    view.setUint32(paddedLen - 4, Math.floor(bitLen / 0x100000000), true)

    let a0 = 0x67452301
    let b0 = 0xefcdab89
    let c0 = 0x98badcfe
    let d0 = 0x10325476

    for (let off = 0; off < paddedLen; off += 64) {
      const M = []
      for (let i = 0; i < 16; i++) M[i] = view.getUint32(off + i * 4, true)
      let A = a0
      let B = b0
      let C = c0
      let D = d0
      for (let i = 0; i < 64; i++) {
        let F
        let g
        if (i < 16) {
          F = (B & C) | (~B & D)
          g = i
        } else if (i < 32) {
          F = (D & B) | (~D & C)
          g = (5 * i + 1) % 16
        } else if (i < 48) {
          F = B ^ C ^ D
          g = (3 * i + 5) % 16
        } else {
          F = C ^ (B | ~D)
          g = (7 * i) % 16
        }
        F = (F + A + K[i] + M[g]) >>> 0
        A = D
        D = C
        C = B
        B = (B + rotl(F, S[i])) >>> 0
      }
      a0 = (a0 + A) >>> 0
      b0 = (b0 + B) >>> 0
      c0 = (c0 + C) >>> 0
      d0 = (d0 + D) >>> 0
    }

    const out = new DataView(new ArrayBuffer(16))
    out.setUint32(0, a0, true)
    out.setUint32(4, b0, true)
    out.setUint32(8, c0, true)
    out.setUint32(12, d0, true)
    let hex = ''
    for (let i = 0; i < 16; i++) hex += out.getUint8(i).toString(16).padStart(2, '0')
    return hex
  }
})()
