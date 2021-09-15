export default interface IFileUpLoadStreamInfo {
  chunkTotal: number;
  lastSavedChunk: number;
  fileId: string;
  fileSizeInBytes: number;
  lastChunkSize: number;
  fileName: string;
  fileType: string;
}
