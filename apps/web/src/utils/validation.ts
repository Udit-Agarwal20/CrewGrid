/**
 * Validates whether a given string is a valid 24-character hexadecimal MongoDB ObjectId.
 */
export function isValidObjectId(id: string | null | undefined): id is string {
  if (!id || typeof id !== 'string') {
    return false;
  }
  return /^[0-9a-fA-F]{24}$/.test(id);
}

