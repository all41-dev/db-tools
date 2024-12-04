import { CronJob } from 'cron';
import * as FTP from 'basic-ftp'
import moment from 'moment';
import { cwd } from 'node:process';
import { readdirSync, lstatSync, unlinkSync, mkdirSync, existsSync, createWriteStream } from "fs";
import { spawn } from 'node:child_process';
import path from 'path'
import { copyFileSync } from 'node:fs';
import { createGzip } from 'node:zlib';
import winston from 'winston';
import { IDbOptions } from './idb-options';
import { Db } from './db';


export class DbDumper {
  public logger?: winston.Logger;
  private _config: IDbOptions<Db<any>>
  private _filesToKeep: number
  private _monthlyFilesToKeep: number
  private _manual: boolean


  public constructor(config: IDbOptions<Db<any>> , scheduleImmediatly = true, manual = false) {
    this._config = config
    this._filesToKeep = this._config.dumper?.numberFilesToKeep || 5
    this._monthlyFilesToKeep = this._config.dumper?.numberMonthlyFilesToKeep || 6
    this._manual = manual
    this.logger = config.logger

    if (this._filesToKeep < 1 ) { return } // nothing to do if we want to keep less than one dump
    if (scheduleImmediatly) {
      this.scheduleDump()
    }
  }

  public scheduleDump() {
    new CronJob(
      this._config.dumper?.cron || '0 5 * * *',
      () => {
        this.DumpNow()
      },
      null,
      true,
      'Europe/Zurich'
    );
  }

  public async DumpNow(postfix? : string) {
    try {
      const success = await this.dumpDatabase(postfix)
      if (success) {
        this.organizeDumpFiles()
      }
    } catch(err) {
      if (this.logger)
        this.logger.log('error', 'Dabase dumper error : ' + err)
    }
  }

  public listDailyDumps() : string[] {
    const orderFiles = this.orderedReccentFiles(this.dumpFolder())

    return orderFiles.map((o) => {return o.file})
  }

  public listMonthlyDumps() : string[] {
    const orderFiles = this.orderedReccentFiles(this.monthlyDumpFolder())

    return orderFiles.map((o) => {return o.file})
  }

  public dumpFolder() : string {
    const pathArray = [cwd(), this._config.dumper?.dumpPath || './backup/']
    this._manual ? pathArray.push('manual') : pathArray.push('daily')
    const absolutePath = path.join(...pathArray)

    if (!existsSync(absolutePath)) {
      mkdirSync(absolutePath, {recursive: true})
    }

    return absolutePath
  }

  public dumpFileName(postfix?: string): string {
    let fileName = this._config.dbName
    if (postfix) {
      fileName += `_${postfix}`
    }
    fileName += `_${moment().format('YYYY_MM_DDTHH_mm_ss')}.sql.gz`

    return fileName
  }

  public monthlyDumpFolder() : string {
    const absolutePath = path.join(this.dumpFolder(), 'monthly')

    if (!existsSync(absolutePath)) {
      mkdirSync(absolutePath, {recursive: true})
    }

    return absolutePath
  }

  protected monthlySearchRegexp() : RegExp {
    return new RegExp(`${this._config.dbName}_${moment().format('YYYY_MM_')}.+\.sql(\.gz)?`)
  }

  protected async dumpDatabase(postfix?: string) : Promise<boolean>{
    const fileName = this.dumpFileName(postfix)
    const config = this._config

    const writeStream = createWriteStream(path.join(this.dumpFolder(), fileName))
    const gzip = createGzip()
    const dump = spawn('mariadb-dump', [
      '-u', // username
      config.username,
      `-p${config.password || ''}`, // password concatenate with -p
      '-h', // hostname
      config.hostname || 'localhost',
      '-P', // port
      config.port?.toString() || '3306',
      config.dbName,
    ])

    const onSuccess = async () => {
      if (this.logger)
        this.logger.info('dump completed on database ' +  config.dbName);
      if (!this._manual) {
        await this.monthlyStorage(path.join(this.dumpFolder(), fileName))
      }
      await this.sendDumpToFTP(path.join(this.dumpFolder(), fileName))
    }

    const onError = (error: any) => {
      if (this.logger)
        this.logger.error('error on dumping database ' +  config.dbName, { error });
      try {
        unlinkSync(path.join(this.dumpFolder(), fileName))
      } catch(err) {
      }
    }

    return new Promise((resolve) => {
      dump.stdout.pipe(gzip).pipe(writeStream).on('finish', async function () {
        await onSuccess()
        resolve(true)
      }).on('error', function(error) {
        onError(error)
        resolve(false)
      })
    })
  }

  protected async monthlyStorage(file : string) {
    const dumpFolder : string = this.monthlyDumpFolder()
    const existingFiles = readdirSync(dumpFolder).filter(f => {return f.match(this.monthlySearchRegexp()) !== null})

    if (existingFiles.length < 1) {
      copyFileSync(file, path.join(dumpFolder, path.basename(file)))

      this.keepMostRecentFiles(dumpFolder, this._monthlyFilesToKeep)
    }
  }

  protected async sendDumpToFTP(file : string) {
    if (typeof(this._config.dumper?.ftpHost) !== 'string' || this._config.dumper?.ftpHost.length < 1) { return }


    if (this.logger)
      this.logger.info('sending dump to ftp');
    const connectionConfig : {host: string, user?: string, password?: string, port?: number, secure: boolean | 'implicit' } = {host: this._config.dumper?.ftpHost, secure: true}
    if (typeof(this._config.dumper?.ftpUser) === 'string' && this._config.dumper?.ftpUser.length > 0) { connectionConfig.user = this._config.dumper?.ftpUser }
    if (typeof(this._config.dumper?.ftpPassword) === 'string' && this._config.dumper?.ftpPassword.length > 0) { connectionConfig.password = this._config.dumper?.ftpPassword }
    if (typeof(this._config.dumper?.ftpPassword) === 'string' && this._config.dumper?.ftpPassword.length > 0) { connectionConfig.password = this._config.dumper?.ftpPassword }
    if (typeof(this._config.dumper?.ftpSecure) !== 'undefined') { connectionConfig.secure = this._config.dumper?.ftpSecure }
    if (this._config.dumper?.ftpPort && this._config.dumper?.ftpPort > 0) { connectionConfig.port = this._config.dumper?.ftpPort }

    const ftpClient = new FTP.Client()
    try {
      await ftpClient.access(connectionConfig)
      if (typeof(this._config.dumper?.ftpPath) === 'string' && this._config.dumper?.ftpPath.length > 0) { await ftpClient.ensureDir(this._config.dumper?.ftpPath) } // ensureDir change current path too
      if(this._manual) {
        await ftpClient.ensureDir('manual')
      }
      await ftpClient.uploadFrom(file, path.basename(file))

      if (!this._manual) {
        await this.keepMostRecentFilesFTP(ftpClient, this._filesToKeep)

        if (this._monthlyFilesToKeep > 0) {
          await ftpClient.ensureDir('monthly')
          let list : FTP.FileInfo[] = await ftpClient.list()
          list = list.sort((a, b) => (a.name < b.name ? -1 : (a.name > b.name ? 1 : 0)))

          if (list.filter(f => {return f.name.match(this.monthlySearchRegexp()) !== null}).length < 1) {
            await ftpClient.uploadFrom(file, path.basename(file))
            await this.keepMostRecentFilesFTP(ftpClient, this._monthlyFilesToKeep)
          }
        }
      }
    }
    catch(error) {
      if (this.logger)
        this.logger.error('error on sending dump to ftp', { error });
    }
  }

  protected async keepMostRecentFilesFTP(ftpClient : FTP.Client, filesToKeep : number) {
    let list : FTP.FileInfo[] = await ftpClient.list()

    list = list.filter(l => {return path.extname(l.name) === '.sql' || path.extname(l.name) === '.gz' })
    if (list.length > filesToKeep) {
      // as modification time is not garanteed on all ftp, sort files alphabetically and then keep the x last
      list = list.sort((a, b) => (a.name < b.name ? -1 : (a.name > b.name ? 1 : 0)))
      const listToDelete = list.slice(0, -this._filesToKeep) // remove x last element

      for (let i = 0;  i < listToDelete.length; i++) {
        await ftpClient.remove(listToDelete[i].name)
      }
    }
  }

  protected organizeDumpFiles() {
    const filesToKeep : number = this._config.dumper?.numberFilesToKeep || 5

    this.keepMostRecentFiles(this.dumpFolder(), filesToKeep)
  }

  protected orderedReccentFiles(folder: string) : { file: string; mtime: Date; }[] {
    return readdirSync(folder)
      .filter(f => lstatSync(path.join(folder, f)).isFile())
      .map(file => ({ file, mtime: lstatSync(path.join(folder, file)).mtime }))
      .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
  }

  protected keepMostRecentFiles(folder: string, filesToKeep : number) {
    const orderReccentFiles = this.orderedReccentFiles(folder)

    if (orderReccentFiles.length > filesToKeep) {
      const filesToDelete : { file: string; mtime: Date; }[] = orderReccentFiles.slice(filesToKeep)
      filesToDelete.forEach((file) => {
        unlinkSync(path.join(folder, file.file))
      })
    }
  }
}
