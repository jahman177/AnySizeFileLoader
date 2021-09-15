import IFileUpLoadStreamInfo from './IFileUpLoaderStreamInfo';

export default interface IAnySizeFileLoaderConstructor {
  maxChunkSize: number;
  tempDirPath: string;
  endDirPath: string;
  upLoadStreamInfoStorage?: string | undefined; // 'custom'
  assembleChunksAfterLast?: boolean | undefined;
  deleteChunksAfterAssemble?: boolean | undefined;
  storage?: {
    getFileUpLoadStreamInfo: (fileId: string) => Promise<IFileUpLoadStreamInfo>;
    setFileUpLoadStreamInfo: (fileId: string, value: IFileUpLoadStreamInfo) => Promise<boolean>;
    deleteFileUpLoadStreamInfo: (fileId: string) => Promise<boolean>;
  };
}
