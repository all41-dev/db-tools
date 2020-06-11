import { DataType, Sequelize, SequelizeOptions } from 'sequelize-typescript';
import { IDbOptions } from './idb-options';
import { DbTools } from './db-tools';
import os from 'os';
import { Logger } from 'winston';

export abstract class Db<T extends Db<T>> {
  public static inst: Db<any>;
  public sequelize!: Sequelize;
  public logger?: Logger;
  protected _options: IDbOptions<Db<T>>;
  public constructor(options: IDbOptions<Db<T>>) {
    this._options = options;
    options.type.inst = this;
    this.logger = options.logger;

    this._configureSequelize();
  }

  protected async _init(): Promise<void> {
    try {
      await this.sequelize.authenticate();
      this.logger?.info({
        message: `Connection has been established successfully from #${os.hostname} on #database #${this._options.dbName}`,
        hash: 'db-connection'
      });
      if (this._options.dbTools) {
        const tools = new DbTools(this.sequelize);
        if (this._options.dbTools.updateOnStartup) {
          if (this._options.dbTools.app) {
            tools.setApp(this._options.dbTools.app);
          }
          if (this._options.dbTools.scriptsFolder) {
            tools.update(this._options.dbTools.scriptsFolder)
          }
        }
      }
    } catch (err) {
      this.logger?.error({
        message: `Unable to connect to the #database #${this._options.dbName} from #${os.hostname}`,
        hash: 'db-connection',
        error: err,
      });
    }
  }
  
  protected _configureSequelize(): void {
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
        };
        break;
      case 'mssql' :
        // tslint:disable-next-line: no-shadowed-variable
        DataType.DATE.prototype._stringify = function _stringify(date: any, options: any): string {
          return this._applyTimezone(date, options).format('YYYY-MM-DD HH:mm:ss.SSS');
        };

        options.dialectOptions = {
          instanceName: this._options.instanceName,
        };
        break;
      default :
    }

    this.sequelize = new Sequelize(options);
  }
  
  /**
   * @description must await call _init as first instruction
   */
  public abstract async init(): Promise<void>;
}
