import { Sequelize } from "sequelize-typescript";
import fs from 'fs';
import { SemVer, compare, gt } from "semver";

export class DbTools {
  private _sequelize: Sequelize;
  constructor(sequelize: Sequelize) {
    this._sequelize = sequelize;
  }
  public async getDbNames(appName?: string): Promise<string[]> {
    const res = await this._sequelize.query('SHOW DATABASES;');
    const dbNames: string[] = res[0].map((r: any) => r['Database']);
    if (!appName) {
      return dbNames;
    }

    const allDbApps = (await Promise.all(dbNames.map(async (n) => ({
      dbName: n,
      appName: await this.getApp(n),
    }))));
    const appDbNames = allDbApps.filter((n) => n.appName === appName).map((n) => n.dbName);
    return appDbNames;
  }
  public async getApp(dbName?: string): Promise<string | undefined> {
    return this.getFunction('__application', dbName);
  }
  public async setApp(appName: string): Promise<void> {
    return this.setFunction('__application', appName);
  }
  public async getVersion(dbName?: string): Promise<SemVer | undefined> {
    const res = await this.getFunction('__dbVersion', dbName);
    if (!res) return;
    return new SemVer(res);
  }
  public async setVersion(version?: SemVer): Promise<void> {
    if (!version) return;
    this.setFunction('__dbVersion', version.raw);
  }
  public async getFunction(name: string, dbName?: string): Promise<any | undefined> {
    try {
      const dbPrefix = dbName ? `${dbName}.` : '';
      const query = `select ${dbPrefix}${name}();`;
      const res: any = await this._sequelize.query(query);
      return res[0][0][`${dbPrefix}${name}()`];
    } catch (error) {
      return undefined;
    }
  }
  public async updateRequired(scriptsFolder: string): Promise<boolean> {
    return (await this._getRequiredUpdateFiles(scriptsFolder)).some(() => true);
  }
  public async update(scriptsFolder: string): Promise<void> {
    const files = await this._getRequiredUpdateFiles(scriptsFolder);
    for (const file of files) {
      try {
        const fileContent = fs.readFileSync(`${file.file}`).toString();
        await this._sequelize.query(fileContent);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error(error);
      }
    }
    await this.setVersion(files.pop()?.semver);
  }
  private async _getRequiredUpdateFiles(scriptsFolder: string): Promise<{file: string; semver: SemVer}[]> {
    const currentVersion = await this.getVersion();
    let files = fs.readdirSync(scriptsFolder)
      .filter((f) => f.toLowerCase().endsWith('.sql'))
      .map((f) => f.substr(0, f.length-4))
      .sort(compare)    
      .map((f) => ({
        file: `${scriptsFolder}/${f}.sql`,
        semver: new SemVer(f),
      }));

    if (currentVersion) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      files = files.filter((f) =>  gt(f.semver, currentVersion!));
    }
    return files;
  }
  private async setFunction(functionName: string, value: any, type = 'VARCHAR(200)'): Promise<void> {
    const quote = typeof value === 'string' ? '\'' : '';
    await this._sequelize.query(`DROP FUNCTION IF EXISTS ${functionName};
      CREATE FUNCTION ${functionName}() RETURNS ${type}
BEGIN
  RETURN ${quote}${value}${quote};
END;`);
    // eslint-disable-next-line @typescript-eslint/indent
    }
}