/** Web (iPhone/Safari): fotos como data URL reduzida, compartilhamento pelo Web Share API ou download. */

const MAX = 1600;

/** Reduz a foto (máx. 1600 px, JPEG 70%) e devolve data URL para guardar no IndexedDB. */
export async function persistPhoto(uri: string, _id: string) {
  const img = new Image();
  img.src = uri;
  await img.decode();
  const k = Math.min(1, MAX / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * k);
  c.height = Math.round(img.naturalHeight * k);
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.7);
}

export async function readBase64(uri: string) {
  if (uri.startsWith('data:')) return uri.slice(uri.indexOf(',') + 1);
  const bytes = new Uint8Array(await (await fetch(uri)).arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export const fileExists = async (_uri: string) => true;

/** Compartilhar do iPhone (Arquivos, OneDrive, Teams, e-mail…); sem suporte, baixa o arquivo. false = cancelado. */
export async function shareFile(name: string, base64: string, mime: string) {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const file = new File([bytes], name, { type: mime });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Punch List' });
      return true;
    } catch (e: any) {
      if (e?.name === 'AbortError') return false;
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  return true;
}
