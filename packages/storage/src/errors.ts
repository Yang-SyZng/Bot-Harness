export class FilePolicyError extends Error {
  override readonly name: string = "FilePolicyError";
}

export class UnsupportedFileTypeError extends FilePolicyError {
  override readonly name: string = "UnsupportedFileTypeError";
}

export class AssetAccessError extends FilePolicyError {
  override readonly name: string = "AssetAccessError";
}
