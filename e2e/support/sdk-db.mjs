const dbMod = () => globalThis.__kpE2eRuntime.sdkDb;

export const table = (...args) => dbMod().table(...args);
export const integer = (...args) => dbMod().integer(...args);
export const text = (...args) => dbMod().text(...args);
export const boolean = (...args) => dbMod().boolean(...args);
export const json = (...args) => dbMod().json(...args);
export const index = (...args) => dbMod().index(...args);
export const uniqueIndex = (...args) => dbMod().uniqueIndex(...args);
export const eq = (...args) => dbMod().eq(...args);
export const gt = (...args) => dbMod().gt(...args);
export const lt = (...args) => dbMod().lt(...args);
export const and = (...args) => dbMod().and(...args);
export const or = (...args) => dbMod().or(...args);
export const inArray = (...args) => dbMod().inArray(...args);
export const isNotNull = (...args) => dbMod().isNotNull(...args);
export const desc = (...args) => dbMod().desc(...args);
export const sql = (...args) => dbMod().sql(...args);
