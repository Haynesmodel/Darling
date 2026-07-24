export type DataErrorCode =
  | 'HTTP_ERROR'
  | 'INVALID_MANIFEST'
  | 'UNSUPPORTED_VERSION'
  | 'INVALID_ASSET'
  | 'SEMANTIC_ERROR'
  | 'INTEGRITY_MISMATCH'
  | 'SIZE_MISMATCH'
  | 'INVALID_UTF8'
  | 'INTEGRITY_UNAVAILABLE';

export interface DataLoadErrorDetails {
  expectedSha256?: string;
  actualSha256?: string;
  expectedBytes?: number;
  actualBytes?: number;
  maximumBytes?: number;
  attempts?: number;
}

export class DataLoadError extends Error {
  readonly code: DataErrorCode;
  readonly asset: string;
  readonly dataVersion: string | null;
  readonly details: Readonly<DataLoadErrorDetails>;

  constructor(
    code: DataErrorCode,
    asset: string,
    message: string,
    dataVersion: string | null = null,
    details: DataLoadErrorDetails = {},
  ) {
    super(message);
    this.name = 'DataLoadError';
    this.code = code;
    this.asset = asset;
    this.dataVersion = dataVersion;
    this.details = Object.freeze({ ...details });
  }
}
