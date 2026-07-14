import { supabase } from './supabase';

const BUCKET = 'meal-images';

const dataUrlToBlob = (dataUrl: string): Blob => {
  const [header, base64] = dataUrl.split(',');
  const mime = header.match(/data:([^;]+)/)?.[1] || 'image/jpeg';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
};

/**
 * data URL 이미지를 Supabase Storage에 업로드하고 공개 URL을 반환한다.
 * 업로드 실패 시(버킷 없음, 정책 미설정 등) null을 반환하므로
 * 호출부에서 base64 저장으로 폴백할 수 있다.
 */
export async function uploadImageToStorage(dataUrl: string, prefix: string): Promise<string | null> {
  if (!dataUrl.startsWith('data:')) return dataUrl;
  try {
    const blob = dataUrlToBlob(dataUrl);
    const ext = (blob.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
    const path = `${prefix}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, blob, { contentType: blob.type, cacheControl: '31536000' });
    if (error) {
      console.warn('이미지 Storage 업로드 실패, base64로 저장합니다:', error.message);
      return null;
    }
    return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  } catch (err) {
    console.warn('이미지 Storage 업로드 실패, base64로 저장합니다:', err);
    return null;
  }
}
