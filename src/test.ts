import { DbTools } from "./index";
import { Sequelize } from "sequelize-typescript";

const sequelize = new Sequelize({
    database: 'dbup',
    username: 'root',
    password: 'yri956',
    host: 'localhost',
    dialect: 'mariadb',
    logging: false,
    dialectOptions: {
        multipleStatements: true,
    }
});


const dbt = new DbTools(sequelize);
// dbt.update('./dbScripts');
// dbt.setApp('spider');

dbt.getApp().then((app) => {
    console.error('current app: ' + app);
});

// dbt.getDbNames('spider').then((apps) => console.info(apps.reduce((a, b) => `${a}, ${b}`)));

