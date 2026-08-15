import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { customAlphabet } from 'nanoid';

/**
 * Merges Tailwind CSS classes with clsx and tailwind-merge.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Generate a unique, human-readable room ID.
 * Format: XXXX-XXXX (uppercase alphanumeric)
 * Example: 'ABCD-1234'
 */
export const generateRoomId = () => {
  const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const nanoid = customAlphabet(alphabet, 8);
  const id = nanoid();
  return `${id.slice(0, 4)}-${id.slice(4)}`;
};
