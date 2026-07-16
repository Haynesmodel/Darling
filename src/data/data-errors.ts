export type DataErrorCode =
  | 'HTTP_ERROR'
  | 'INVALID_MANIFEST'
  | 'UNSUPPORTED_VERSION'
  | 'INVALID_ASSET'
  | 'SEMANTIC_ERROR';

export class DataLoadError extends Error {
  readonly code: DataErrorCode;
  readonly asset: string;
  readonly dataVersion: string | null;

  constructor(code: DataErrorCode, asset: string, message: string, dataVersion: string | null = null) {
    super(message);
    this.name = 'DataLoadError';
    this.code = code;
    this.asset = asset;
    this.dataVersion = dataVersion;
  }
}
