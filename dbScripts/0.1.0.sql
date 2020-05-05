alter table t001 drop column if exists name;

alter table t001
    add column name varchar(150);