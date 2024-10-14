import winston from 'winston';
import { Db } from './db';

export interface IDbOptions<T extends Db<any>> {
  isMock?: false;
  type: { inst: T; new(options: IDbOptions<T>): T };
  proxy?: string;
  mysqlDecimalNumbers?: boolean;
  multipleStatements?: boolean;
  logging?: boolean;
  hostname?: string;
  dbName: string;
  username: string;
  password: string;
  port?: number;
  engine: 'mysql' | 'postgres' | 'mssql' | 'sqlite' | 'mariadb';
  sqliteStoragePath?: string;
  instanceName?: string;
  timezone?: string;
  dbTools?: {
    app?: string;
    scriptsFolder?: string;
    updateOnStartup?: boolean;
  };
  dumper?: IDBDumperConfig
  logger?: winston.Logger;
  mute?: boolean;
}

export interface IDBMockOptions<T extends Db<any>> {
  isMock: true;
  type: { inst: T; new(options: IDbOptions<T>): T };
}

/**
 * @description dump parameters
 */
export interface IDBDumperConfig {
  /**
   * @description cron to which th dump is scheduled
   * @default 0 5 * * * // everyday at 05:00
   */
  cron?: string,

  /**
   * @description the path where to save the dump
   * @default ./backup/daily
   */
  dumpPath?: string,

  /**
   * @description number of most recent dump files to keep
   * @default 5
   */
  numberFilesToKeep?: number

  /**
   * @description keeping the first dump of each, how many month to keep
   * @default 6
   */
  numberMonthlyFilesToKeep?: number

  /**
   * @description host of the ftp
   */
  ftpHost?: string,

  /**
   * @description port of the ftp
   * @default 21
   */
  ftpPort?: number,

  /**
   * @description user used to acces ftp
   */
  ftpUser?: string,

  /**
   * @description password to acces ftp
   */
  ftpPassword?: string,

  /**
   * @description path where to store the file, empty = root
   */
  ftpPath?: string

  /**
   * @description tls usage options true = use expicit tls, false = without tls, implicit = implicit tls (default true)
   */
  ftpSecure?: boolean | 'implicit'

  /**
   * @description create manual dump on database version upgrade (default true)
   */
  dumpOnDataBaseUpdate?: boolean
}
