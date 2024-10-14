import { DataType, Sequelize, SequelizeOptions } from 'sequelize-typescript';
import { IDBMockOptions, IDbOptions } from './idb-options';
import { DbTools } from './db-tools';
import os from 'os';
import { Logger } from 'winston';
import { DbDumper } from './db-dumper';

export abstract class Db<T extends Db<T>> {
  public static inst: Db<any>;
  public sequelize!: Sequelize;
  public logger?: Logger;
  protected _options: IDbOptions<Db<T>> | IDBMockOptions<Db<T>>;
  public constructor(options: IDbOptions<Db<T>> | IDBMockOptions<Db<T>>) {
    this._options = options;
    options.type.inst = this;

    if (!options.isMock) {
      this.logger = options.logger;
    }
    this._configureSequelize();
  }

  protected async _init(): Promise<void> {
    if (this._options.isMock) {
      try {
        await this.sequelize.authenticate();
        this.logger?.info({
          message: `Connected to MOCK`,
          hash: 'db-connection'
        });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('MOCK db init error');
      }
      return;
    }
    const dbContext = `${this._options.engine} ${this._options.hostname}.${this._options.dbName} from ${os.hostname}`;
    try {
      await this.sequelize.authenticate();
      if (!this._options.mute) {
        this.logger?.info({
          message: `Connected to ${dbContext}`,
          hash: 'db-connection'
        });
      }
      if (this._options.dbTools) {
        const tools = new DbTools(this.sequelize);
        if (this._options.dbTools.updateOnStartup) {
          if (this._options.dbTools.app) {
            await tools.setApp(this._options.dbTools.app);
          }
          if (this._options.dbTools.scriptsFolder) {
            if (await tools.updateRequired(this._options.dbTools.scriptsFolder) && this._options.dumper?.dumpOnDataBaseUpdate !== false){
              await new DbDumper(this._options, false, true).DumpNow(`${await tools.getVersion().toString()}_before_update`)
            }
            await tools.update(this._options.dbTools.scriptsFolder);
          }
        }
      }
    } catch (err) {
      this.logger?.error({
        message: `Unable to connect to ${dbContext}`,
        hash: 'db-connection',
        error: err,
      });
    }
  }

  protected _configureSequelize(): void {
    if (this._options.isMock) {
      this.sequelize = new Sequelize('sqlite::memory:', {
        logging: false
      });
      return;
    }
    if (this._options.engine === 'sqlite' && !this._options.sqliteStoragePath) {
      throw new Error('When db engine is sqlite, sqliteStoragePath must be set. Aborting..');
    }

    const port = this._options.port ? this._options.port :
      this._options.engine === 'mssql' ? 1433 :
        this._options.engine === 'postgres' ? 5432 :
          this._options.engine === 'sqlite' ? undefined :
            3306;// mariadb || mysql

    const options: SequelizeOptions = {
      database: this._options.dbName,
      dialect: this._options.engine,
      host: this._options.hostname || 'localhost',
      logging: this._options.logging ?
        this.logger?.info : false,
      password: this._options.password,
      pool: {
        acquire: 1000 * 60 * 5,// 5 min
        idle: 10000,
        max: 10,
        min: 1,
      },
      port: port,
      storage: this._options.sqliteStoragePath,
      username: this._options.username,
    };

    switch (options.dialect) {
      case 'mysql' :
      case 'mariadb' :
        options.dialectOptions = {
          socketPath: this._options.proxy,
          connectTimeout: 1000 * 60 * 5,// 5 minutes
          decimalNumbers: this._options.mysqlDecimalNumbers,
          multipleStatements: this._options.multipleStatements,
          timezone: this._options.timezone || '+00:00',
        };
        break;
      case 'mssql' :
        // tslint:disable-next-line: no-shadowed-variable
        DataType.DATE.prototype._stringify = function _stringify(date: any, options: any): string {
          return this._applyTimezone(date, options).format('YYYY-MM-DD HH:mm:ss.SSS');
        };

        options.dialectOptions = {
          instanceName: this._options.instanceName,
          timezone: this._options.timezone || 'Europe/Zurich',
        };
        break;
      default :
    }

    this.sequelize = new Sequelize(options);
  }

  /**
   * @description must await call _init as first instruction
   */
  public abstract init(): Promise<void>;
}
