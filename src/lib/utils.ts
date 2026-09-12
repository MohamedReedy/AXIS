import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

export function formatTimeRemaining(seconds: number): string {
  if (seconds <= 0) return '00:00:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [
    h.toString().padStart(2, '0'),
    m.toString().padStart(2, '0'),
    s.toString().padStart(2, '0')
  ].join(':');
}

export function getExamSlug(title: string | null | undefined): string {
  if (!title) return '';
  return title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function parseQuestionContent(rawText: string | null | undefined): { text: string; imageUrl?: string } {
  if (!rawText) return { text: '' };

  // 1. Check for <!--IMAGE:url-->
  const tagMatch = rawText.match(/<!--IMAGE:(.*?)-->/s);
  if (tagMatch) {
    return {
      imageUrl: tagMatch[1].trim(),
      text: rawText.replace(tagMatch[0], '').trim(),
    };
  }

  // 2. Check for markdown image: ![alt](url)
  const mdMatch = rawText.match(/!\[.*?\]\((https?:\/\/.*?|data:image\/.*?)\)/);
  if (mdMatch) {
    return {
      imageUrl: mdMatch[1].trim(),
      text: rawText.replace(mdMatch[0], '').trim(),
    };
  }

  return { text: rawText };
}

export function serializeQuestionContent(text: string, imageUrl?: string | null): string {
  const cleanText = (text || '').replace(/<!--IMAGE:.*?-->/gs, '').trim();
  if (!imageUrl || !imageUrl.trim()) {
    return cleanText;
  }
  return `${cleanText}\n<!--IMAGE:${imageUrl.trim()}-->`.trim();
}

export function compressImageFile(file: File, maxWidth = 1200, maxHeight = 1200, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (e) => {
      const img = new Image();
      img.src = e.target?.result as string;
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > maxWidth || height > maxHeight) {
          if (width > height) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          } else {
            width = Math.round((width * maxHeight) / height);
            maxHeight = height;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(img.src);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(dataUrl);
      };
      img.onerror = () => reject(new Error('Failed to load image file'));
    };
    reader.onerror = () => reject(new Error('Failed to read image file'));
  });
}
