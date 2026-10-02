/* ------------------------------------------------------------------
   Client-side cryptography (Web Crypto API – no external libraries)
   • PBKDF2-SHA256 turns the master password into 256 secret bits
   • Those bits become (a) an AES-GCM key that never leaves the device and
     (b) a separate auth token (SHA-256 of the bits + a label) sent to the server
   ------------------------------------------------------------------ */
window.VaultCrypto = (function () {
  'use strict';
  var enc = new TextEncoder();
  var dec = new TextDecoder();
  var subtle = window.crypto.subtle;

  function toB64(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i += 0x8000) {
      s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(s);
  }
  function fromB64(str) {
    var bin = atob(str), out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function toHex(buf) {
    return Array.prototype.map.call(new Uint8Array(buf), function (b) {
      return ('0' + b.toString(16)).slice(-2);
    }).join('');
  }

  function randomSalt() { return toB64(crypto.getRandomValues(new Uint8Array(16))); }

  async function derive(password, saltB64, iterations) {
    var base = await subtle.importKey('raw', enc.encode(password.normalize('NFKC')), 'PBKDF2', false, ['deriveBits']);
    var bits = new Uint8Array(await subtle.deriveBits(
      { name: 'PBKDF2', hash: 'SHA-256', salt: fromB64(saltB64), iterations: iterations }, base, 256));
    var key = await subtle.importKey('raw', bits, 'AES-GCM', false, ['encrypt', 'decrypt']);
    var label = enc.encode('vault-auth-v1');
    var joined = new Uint8Array(bits.length + label.length);
    joined.set(bits, 0); joined.set(label, bits.length);
    var token = toHex(await subtle.digest('SHA-256', joined));
    return { key: key, token: token };
  }

  async function encrypt(key, obj) {
    var iv = crypto.getRandomValues(new Uint8Array(12));
    var ct = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, enc.encode(JSON.stringify(obj))));
    return 'v1.' + toB64(iv) + '.' + toB64(ct);
  }

  async function decrypt(key, packed) {
    var parts = String(packed).split('.');
    if (parts.length !== 3 || parts[0] !== 'v1') throw new Error('bad_format');
    var pt = await subtle.decrypt({ name: 'AES-GCM', iv: fromB64(parts[1]) }, key, fromB64(parts[2]));
    return JSON.parse(dec.decode(pt));
  }

  function strength(pw) {
    var score = 0;
    if (pw.length >= 8) score++;
    if (pw.length >= 12) score++;
    if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
    if (/\d/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    if (pw.length < 8) score = Math.min(score, 1);
    return score; // 0..5
  }

  return { randomSalt: randomSalt, derive: derive, encrypt: encrypt, decrypt: decrypt, strength: strength };
})();
