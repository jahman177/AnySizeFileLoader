import IFileUpLoadStreamInfo from './interfaces/IFileUpLoaderStreamInfo';

export default class Pool {
  private pool: { [index: string]: IFileUpLoadStreamInfo };
  constructor() {
    this.pool = {};
  }
  setItme(key: string, value: IFileUpLoadStreamInfo) {
    this.pool[key] = value;
  }
  getItem(key: string) {
    return this.pool[key];
  }
  deleteItem(key: string) {
    delete this.pool[key];
  }
  checkKey(key: string){
    return this.pool.hasOwnProperty(key);
  }
}
