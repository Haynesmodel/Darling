export const SUPPORTED_MANIFEST_VERSION = 1;
export const SUPPORTED_SCHEMA_VERSION = 1;
export const SUPPORTED_DERIVED_GENERATOR_VERSION = 1;

export function shortDataVersion(version: string | null | undefined): string {
  if (!version) return 'unknown';
  return version.replace(/^sha256:/, '').slice(0, 12);
}
