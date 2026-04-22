const PBKDF2_ITERATIONS = 250000;
const AES_KEY_LENGTH = 256;
const enc = new TextEncoder();
const dec = new TextDecoder();

function bytesToBase64(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function randomBytes(length) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

async function deriveKey(passphrase, saltBytes) {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: saltBytes,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256"
    },
    keyMaterial,
    {
      name: "AES-GCM",
      length: AES_KEY_LENGTH
    },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encryptText(plaintext, passphrase) {
  const salt = randomBytes(16);
  const nonce = randomBytes(12);
  const key = await deriveKey(passphrase, salt);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    key,
    enc.encode(plaintext)
  );

  return {
    encrypted: bytesToBase64(new Uint8Array(ciphertext)),
    salt: bytesToBase64(salt),
    nonce: bytesToBase64(nonce)
  };
}

async function decryptText(ciphertextB64, passphrase, saltB64, nonceB64) {
  const key = await deriveKey(passphrase, base64ToBytes(saltB64));
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(nonceB64) },
    key,
    base64ToBytes(ciphertextB64)
  );
  return dec.decode(plaintext);
}

async function encryptArrayBuffer(arrayBuffer, passphrase) {
  const salt = randomBytes(16);
  const nonce = randomBytes(12);
  const key = await deriveKey(passphrase, salt);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    key,
    arrayBuffer
  );

  return {
    encryptedBytes: new Uint8Array(ciphertext),
    salt: bytesToBase64(salt),
    nonce: bytesToBase64(nonce)
  };
}

async function decryptArrayBuffer(ciphertextBytes, passphrase, saltB64, nonceB64) {
  const key = await deriveKey(passphrase, base64ToBytes(saltB64));
  return crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(nonceB64) },
    key,
    ciphertextBytes
  );
}

function getVaultPassphrase() {
  return sessionStorage.getItem("locknoteVaultPassphrase") || "";
}

function setVaultPassphrase(passphrase) {
  sessionStorage.setItem("locknoteVaultPassphrase", passphrase);
}

function clearVaultPassphrase() {
  sessionStorage.removeItem("locknoteVaultPassphrase");
}

function requireVaultPassphrase() {
  const passphrase = getVaultPassphrase();
  if (!passphrase) {
    throw new Error("Unlock your vault first by entering your passphrase.");
  }
  return passphrase;
}

function setVaultStatus(message, isError = false) {
  const status = document.getElementById("vault-status");
  if (!status) return;
  status.textContent = message;
  status.classList.toggle("vault-error", isError);
}

function wireVaultControls() {
  const unlockForm = document.getElementById("vault-unlock-form");
  const clearBtn = document.getElementById("clear-vault-passphrase");

  if (unlockForm) {
    unlockForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const field = document.getElementById("vault-passphrase");
      const passphrase = field.value;
      if (!passphrase) {
        setVaultStatus("Enter your vault passphrase first.", true);
        return;
      }
      setVaultPassphrase(passphrase);
      field.value = "";
      setVaultStatus("Vault unlocked in this tab only.");
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      clearVaultPassphrase();
      setVaultStatus("Vault passphrase cleared from this tab.");
    });
  }

  if (getVaultPassphrase()) {
    setVaultStatus("Vault unlocked in this tab only.");
  }
}

function wireNoteCreation() {
  const form = document.getElementById("note-form");
  if (!form) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    try {
      const passphrase = requireVaultPassphrase();
      const noteBody = document.getElementById("note-body");
      const encryptedField = document.getElementById("encrypted-content");
      const saltField = document.getElementById("salt-field");
      const nonceField = document.getElementById("nonce-field");

      if (!noteBody.value.trim()) {
        throw new Error("Please enter note content.");
      }

      const encrypted = await encryptText(noteBody.value, passphrase);
      encryptedField.value = encrypted.encrypted;
      saltField.value = encrypted.salt;
      nonceField.value = encrypted.nonce;
      noteBody.value = "";
      form.submit();
    } catch (error) {
      alert(error.message || "Unable to encrypt note.");
    }
  });
}

function wireNoteDecryption() {
  document.querySelectorAll(".decrypt-note-btn").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        const passphrase = requireVaultPassphrase();
        const card = button.closest(".note-card");
        const cipherBox = card.querySelector(".cipher-box");
        const output = card.querySelector(".decrypted-output");
        const ciphertext = cipherBox.dataset.ciphertext;
        const salt = cipherBox.dataset.salt;
        const nonce = cipherBox.dataset.nonce;
        const plaintext = await decryptText(ciphertext, passphrase, salt, nonce);
        output.value = plaintext;
        output.hidden = false;
      } catch (error) {
        alert(error.message || "Unable to decrypt note.");
      }
    });
  });
}

function wireAttachmentUploads() {
  document.querySelectorAll(".attachment-form").forEach((form) => {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();

      try {
        const passphrase = requireVaultPassphrase();
        const fileInput = form.querySelector('input[type="file"]');
        const file = fileInput.files[0];
        if (!file) {
          throw new Error("Choose a file first.");
        }

        const encrypted = await encryptArrayBuffer(await file.arrayBuffer(), passphrase);
        const uploadBlob = new Blob([encrypted.encryptedBytes], { type: "application/octet-stream" });
        const formData = new FormData();
        formData.append("attachment", uploadBlob, `${file.name}.enc`);
        formData.append("original_filename", file.name);
        formData.append("file_nonce", encrypted.nonce);
        formData.append("file_salt", encrypted.salt);

        const response = await fetch(form.action, {
          method: "POST",
          body: formData,
          credentials: "same-origin"
        });

        if (!response.ok) {
          throw new Error("Attachment upload failed...");
        }

        window.location.reload();
      } catch (error) {
        alert(error.message || "Unable to encrypt and upload your file.");
      }
    });
  });
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function wireAttachmentDownloads() {
  document.querySelectorAll(".download-attachment-btn").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        const passphrase = requireVaultPassphrase();
        const metaUrl = button.dataset.metaUrl;
        const metaResponse = await fetch(metaUrl, { credentials: "same-origin" });
        if (!metaResponse.ok) {
          throw new Error("Unable to load attachment metadata.");
        }
        const meta = await metaResponse.json();

        const fileResponse = await fetch(meta.download_url, { credentials: "same-origin" });
        if (!fileResponse.ok) {
          throw new Error("Unable to download encrypted attachment.");
        }

        const encryptedBuffer = await fileResponse.arrayBuffer();
        const decryptedBuffer = await decryptArrayBuffer(encryptedBuffer, passphrase, meta.file_salt, meta.file_nonce);
        triggerDownload(new Blob([decryptedBuffer], { type: meta.mime_type }), meta.original_filename);
      } catch (error) {
        alert(error.message || "Unable to decrypt and download attachment.");
      }
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  wireVaultControls();
  wireNoteCreation();
  wireNoteDecryption();
  wireAttachmentUploads();
  wireAttachmentDownloads();
});
