import * as fs from 'fs';
import { promises as fsPromises } from 'fs';
import * as path from 'path';
import IAnySizeFileLoaderConstructor from './interfaces/IAnySizeFileLoaderConstructor';
import IFileUpLoadStreamInfo from './interfaces/IFileUpLoaderStreamInfo';
import Pool from './pool';
const FilerStreamsInfosPool = new Pool();

interface IFileConfig {
  fileSizeInBytes: number;
  fileName: string;
  fileType: string;
}

// note: maxChunkSize in bytes

export default class AnySizeFileLoader {
  maxChunkSize: number;
  tempDirPath: string;
  endDirPath: string;
  assembleChunksAfterLast: boolean | undefined;
  deleteChunksAfterAssemble: boolean | undefined;

  getFileUpLoadStreamInfo: (fileId: string) => Promise<IFileUpLoadStreamInfo>;
  private _setFileUpLoadStreamInfo: (fileId: string, value: IFileUpLoadStreamInfo) => Promise<boolean>;
  private _deleteFileUpLoadStreamInfo: (fileId: string) => Promise<boolean>;

  // todo add option when loading stops: delete chunks or left them;

  constructor(params: IAnySizeFileLoaderConstructor) {
    this.maxChunkSize = params.maxChunkSize;
    this.tempDirPath = params.tempDirPath;
    this.endDirPath = params.endDirPath;
    this.assembleChunksAfterLast = params.assembleChunksAfterLast;
    this.deleteChunksAfterAssemble = params.deleteChunksAfterAssemble;
    if (params.upLoadStreamInfoStorage === 'custom') {
      if (!(typeof params.storage === 'object' && 'getFileUpLoadStreamInfo' in params.storage)) throw new Error('getFileUpLoadStreamInfo was not provided');
      this.getFileUpLoadStreamInfo = params.storage.getFileUpLoadStreamInfo;
      if (!(typeof params.storage === 'object' && 'setFileUpLoadStreamInfo' in params.storage)) throw new Error('setFileUpLoadStreamInfo was not provided');
      this._setFileUpLoadStreamInfo = params.storage.setFileUpLoadStreamInfo;
      if (!(typeof params.storage === 'object' && 'deleteFileUpLoadStreamInfo' in params.storage)) throw new Error('deleteFileUpLoadStreamInfo was not provided');
      this._deleteFileUpLoadStreamInfo = params.storage.deleteFileUpLoadStreamInfo;
    } else {
      this.getFileUpLoadStreamInfo = async (fileId: string) => {
        return FilerStreamsInfosPool.getItem(fileId);
      };
      this._setFileUpLoadStreamInfo = async (fileId: string, value: IFileUpLoadStreamInfo) => {
        if (!FilerStreamsInfosPool.checkKey(fileId)) FilerStreamsInfosPool.setItme(fileId,value);
        return true;
      };
      this._deleteFileUpLoadStreamInfo = async (fileId: string) => {
        FilerStreamsInfosPool.deleteItem(fileId);
        return true;
      };
    }
  }

  private _checkDir(dirPath: string): Promise<any> {
    return new Promise((resolve: (value?: unknown) => void, reject: (error: any) => void) => {
      fs.stat(dirPath, (statError) => {
        if (statError)
          fs.mkdir(dirPath, { recursive: true }, (mkdirError: any) => {
            if (mkdirError) reject(mkdirError);
            else resolve();
          });
        else resolve();
      });
    });
  }

  private _saveChunk(
    chunk: Buffer | Blob,
    chunkNumber: number,
    fileUpLoadStreamInfo: IFileUpLoadStreamInfo,
  ): Promise<IFileUpLoadStreamInfo> {
    const writeStream = fs.createWriteStream(
      path.join(
        this.tempDirPath,
        fileUpLoadStreamInfo.fileId,
        fileUpLoadStreamInfo.fileId + '_tmp' + `_${chunkNumber}`,
      ),
    );
    return new Promise((resolve: (valur?: any) => void, reject) => {
      writeStream.write(chunk);
      writeStream.end(() => {
        this.getFileUpLoadStreamInfo(fileUpLoadStreamInfo.fileId).then((value) => {
          value.lastSavedChunk = chunkNumber;
          if (chunkNumber === fileUpLoadStreamInfo.chunkTotal - 1) {
            if (this.assembleChunksAfterLast)
              this.assembleChunks(value.fileId, value.fileName).catch((error) => {
                throw new Error(error.message);
              });
            this._deleteFileUpLoadStreamInfo(fileUpLoadStreamInfo.fileId);
          } else {
            this._setFileUpLoadStreamInfo(fileUpLoadStreamInfo.fileId, value);
          }
          resolve(value);
        });
      });
    });
  }

  private async _validateChunk(
    chunkSize: number,
    chunkNumber: number,
    chunkFileId: string,
    fileUpLoadStreamInfo: IFileUpLoadStreamInfo,
  ): Promise<any> {
    await this._checkDir(path.join(this.tempDirPath, fileUpLoadStreamInfo.fileId)).catch((error) => {
      throw new Error(error.message);
    });
    if (chunkSize > this.maxChunkSize) throw new Error('Chunk exited maxChunkSize restriction');
    if (chunkNumber < 0 || chunkNumber >= fileUpLoadStreamInfo.chunkTotal)
      throw new Error('chunkNumber out of chunckTotal range');
    if (chunkFileId !== fileUpLoadStreamInfo.fileId)
      throw new Error(`Chunk doesn't belong to this temp file: ${fileUpLoadStreamInfo.fileId}`);
    if (chunkNumber === fileUpLoadStreamInfo.chunkTotal - 1 && chunkSize !== fileUpLoadStreamInfo.lastChunkSize)
      throw new Error('Last chunk exited expected byte size');
  }

  async clearChunks(fileId: string): Promise<any> {
    const files = await fsPromises.readdir(path.join(this.tempDirPath, fileId));
    for (const file of files) {
      await fsPromises.unlink(path.join(this.tempDirPath, fileId, file));
    }
  }

  async assembleChunks(fileId: string, fileName: string): Promise<any> {
    const assembledFilePath = path.join(this.endDirPath, fileId, fileName);
    await this._checkDir(path.join(this.endDirPath, fileId)).catch((error) => {
      throw new Error(error.message);
    });
    const writeStream = fs.createWriteStream(assembledFilePath);
    const addChunk = (chunkFile: fs.PathLike) =>
      new Promise((resolve, reject) => {
        fs.createReadStream(chunkFile)
          .on('data', (chunk: Buffer) => {
            writeStream.write(chunk);
          })
          .on('end', resolve)
          .on('error', reject);
      });
    const files = await fsPromises.readdir(path.join(this.tempDirPath, fileId));
    for (const file of files) {
      await addChunk(path.join(this.tempDirPath, fileId, file));
      if (this.deleteChunksAfterAssemble) await fsPromises.unlink(path.join(this.tempDirPath, fileId, file));
    }
    writeStream.end();
  }

  prepareFileUpLoad(params: IFileConfig): IFileUpLoadStreamInfo {
    const value = {
      chunkTotal: Math.ceil(params.fileSizeInBytes / this.maxChunkSize),
      lastSavedChunk: 0,
      fileId: String(Math.floor(Math.random() * 100000) + params.fileSizeInBytes + Date.now()), // rework or gave options to end user
      fileSizeInBytes: params.fileSizeInBytes,
      fileName: params.fileName,
      fileType: params.fileType,
      lastChunkSize:
        params.fileSizeInBytes - Math.floor(params.fileSizeInBytes / this.maxChunkSize) * this.maxChunkSize,
    };
    this._setFileUpLoadStreamInfo(value.fileId, value);
    return value;
  }

  async processChunk(
    chunk: Buffer | Blob,
    chunkNumber: number,
    chunkSize: number,
    chunkFileId: string,
  ): Promise<IFileUpLoadStreamInfo> {
    const FileUpLoadStreamInfo = await this.getFileUpLoadStreamInfo(chunkFileId);
    await this._validateChunk(chunkSize, chunkNumber, chunkFileId, FileUpLoadStreamInfo);
    return await this._saveChunk(chunk, chunkNumber, FileUpLoadStreamInfo);
  }
}
