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
  logger?: winston.Logger;
}

export interface IDBMockOptions<T extends Db<any>> {
  isMock: true;
  type: { inst: T; new(options: IDbOptions<T>): T };
}